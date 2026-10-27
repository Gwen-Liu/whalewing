import path from 'node:path';
import fs from 'node:fs/promises';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { bookLimits, libraryLimits, BookError } from './limits.js';
import { bookView, bookExcerpt, bookImageName } from './view.js';

/**
 * 本地书架：存在 DSH 当前 profile 的 whalewing-library 目录里，不随插件分发，也不上传。
 *   library.json            书目、分组、阅读进度（原子替换，写时持文件锁）
 *   books/<id>/book.json    章节标题与字数
 *   books/<id>/chapters/    每章一份 Markdown
 *   books/<id>/images/      书里的插图；cover.webp 是书架用的封面缩略图
 *   uploads/                浏览器分块上传的临时文件
 * 原文件不保存，导入后只留阅读副本；在线书目只从固定的 GitHub 仓库下载，并核对 SHA-256。
 */
export const catalogUrl = 'https://raw.githubusercontent.com/gwenliu1025/whalewing-library/main/catalog.json';
const downloadHosts = new Set(['raw.githubusercontent.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'codeload.github.com', 'media.githubusercontent.com']);
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const imageTypes = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml' };

export const libraryError = (code, message) => Object.assign(new Error(message), { code });
/** 书名按拼音（中文）和字母顺序排，数字按大小排。 */
export const sortBooks = books => [...books].sort((a, b) => collator.compare(a.title, b.title) || collator.compare(a.author, b.author) || (a.id < b.id ? -1 : 1));
export const sortGroups = groups => [...groups].sort((a, b) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1));
const day = now => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const empty = () => ({ version: 1, groups: [], books: [] });
/** 常看书籍上限。存储沿用 daily 字段，library.json 不升版本，回退旧插件仍能读书架。 */
export const pinLimit = 2;
const pinFull = () => libraryError('LIBRARY_PIN_FULL', '常看书籍最多两本，请先换下一本');
const pinnedCount = state => state.books.filter(book => book.daily).length;

/**
 * 旧数据常看超过两本时收到两本：保留升级当天首页按旧轮换公式正在显示的两本，升级当天首页看起来不变。
 * 改了才返回 notice（保留的书名按首页左右顺序、放下的本数），不超过两本时什么都不做、返回 null。
 */
export function capPins(state, date) {
  const flagged = sortBooks(state.books.filter(book => book.daily));
  if (flagged.length <= pinLimit) return null;
  const offset = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  const kept = new Set([0, 1].map(step => flagged[(offset + step) % flagged.length].id));
  for (const book of flagged) if (!kept.has(book.id)) book.daily = false;
  return { kept: flagged.filter(book => kept.has(book.id)).map(book => book.title), released: flagged.length - kept.size };
}

/**
 * 在独立子进程里解析。不用线程：PDF.js 在线程收尾时会偶发原生崩溃（Windows 0xC0000005），
 * 线程崩溃会带倒整个 DSH，子进程崩溃只结束它自己。结果收到即算数，之后子进程怎么退出都不影响。
 * 超时、取消时直接结束子进程。
 */
export function parseInProcess(bytes, filename, signal) {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./parse-process.js', import.meta.url)), [], { serialization: 'advanced', execArgv: ['--max-old-space-size=3072'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
    let outcome = null, stderr = '';
    const finish = (error, book) => {
      if (outcome) return;
      outcome = { error, book };
      clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      if (error) child.kill();
    };
    const cancel = () => finish(signal.reason ?? libraryError('ABORTED', '已取消'));
    const timer = setTimeout(() => finish(new BookError('解析超过 5 分钟仍未完成，文件可能过大或结构异常', 'BOOK_TIMEOUT')), libraryLimits.parseMs);
    signal?.addEventListener('abort', cancel, { once: true });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-2000); });
    child.once('message', message => message.ok ? finish(null, message.book) : finish(new BookError(message.message, message.code)));
    child.once('error', error => finish(new BookError(`解析进程启动失败：${String(error?.message || error).slice(0, 300)}`, 'BOOK_PARSE')));
    child.once('exit', code => {
      finish(new BookError(/heap out of memory|allocation failed/i.test(stderr) ? '电子书太大，解析时内存不足' : `解析进程意外结束（退出码 ${code}）`, 'BOOK_PARSE'));
      if (outcome.error) reject(outcome.error); else resolve(outcome.book);
    });
    child.send({ bytes, filename }, error => { if (error) finish(new BookError(`无法把文件交给解析进程：${error.message}`, 'BOOK_PARSE')); });
  });
}

export class Library {
  /**
   * directory(signal) 给出 profile 目录；parse(bytes, filename, signal) 解析电子书；
   * fetch 为联网请求（默认全局 fetch，随 DSH 的代理设置）；validate 校验 library.json 与在线书目结构。
   */
  constructor({ directory, parse = parseInProcess, fetch: fetcher = globalThis.fetch, validate, now = () => Date.now(), sharp = () => import('sharp').then(module => module.default) }) {
    Object.assign(this, { directory, parse, fetcher, validate, now, sharp });
    this.uploads = new Map();
    this.pendingNotice = null;
    this.cleaned = null;
  }

  async root(signal) {
    signal?.throwIfAborted();
    const root = path.join(await this.directory(signal), 'whalewing-library');
    // 已有的父目录和书架目录都不能是链接，避免把书写到别处。
    for (let cursor = root; ; cursor = path.dirname(cursor)) {
      try { const stat = await fs.lstat(cursor); if (stat.isSymbolicLink() || !stat.isDirectory()) throw libraryError('LIBRARY_PATH', '书架目录路径不安全（是链接或文件），未读写书架'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (path.dirname(cursor) === cursor) break;
    }
    await fs.mkdir(path.join(root, 'books'), { recursive: true });
    await fs.mkdir(path.join(root, 'uploads'), { recursive: true });
    this.cleaned ??= this.cleanup(root).catch(() => {});
    await this.cleaned;
    return root;
  }

  /** 清理上次异常退出留下的半成品：未完成的导入、待删目录、上传临时文件、书目里没有的书目录。 */
  async cleanup(root) {
    const state = await this.load(root);
    const known = new Set(state.books.map(book => book.id));
    for (const entry of await fs.readdir(path.join(root, 'books'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (/^\.(?:incoming|trash)-/.test(entry.name) || uuid.test(entry.name) && !known.has(entry.name)) await fs.rm(path.join(root, 'books', entry.name), { recursive: true, force: true });
    }
    for (const entry of await fs.readdir(path.join(root, 'uploads'))) await fs.rm(path.join(root, 'uploads', entry), { force: true });
  }

  async load(root) {
    let text;
    try { text = await fs.readFile(path.join(root, 'library.json'), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return empty(); throw error; }
    try { return this.validate.state(JSON.parse(text)); }
    catch { throw libraryError('LIBRARY_STORAGE', '书架记录文件（library.json）已损坏，未做任何修改；请从备份恢复或联系维护者'); }
  }

  async save(root, state) {
    await writeFileAtomic(path.join(root, 'library.json'), JSON.stringify(this.validate.state(state)), { mode: 0o600 });
  }
  locked(root, signal, operation) {
    return withFileLock(path.join(root, 'library.json'), operation, { signal, waitMs: 10000 });
  }

  /** 读改写整份书目，持文件锁，写入是原子替换。 */
  async change(signal, update) {
    const root = await this.root(signal);
    return this.locked(root, signal, async () => {
      const state = await this.load(root);
      const result = await update(state, root);
      await this.save(root, state);
      return result;
    });
  }

  /**
   * 读书目；旧数据常看超过两本时在文件锁内重读、重判后写回两本。
   * 写回后不再超过两本，所以只会迁移一次；不另存“已迁移”标记，提示先记在内存里，
   * 等某次 list/daily 成功返回时带出：写回之后同一次调用失败，提示也不会丢。
   */
  async loadPinned(root, signal) {
    const state = await this.load(root);
    if (pinnedCount(state) <= pinLimit) return state;
    return this.locked(root, signal, async () => {
      const current = await this.load(root);
      const notice = capPins(current, day(this.now()));
      if (!notice) return current;
      await this.save(root, current);
      this.pendingNotice = notice;
      return current;
    });
  }
  takeNotice() {
    const notice = this.pendingNotice;
    this.pendingNotice = null;
    return notice ? { notice } : {};
  }

  view(state) {
    return { groups: sortGroups(state.groups), books: sortBooks(state.books).map(({ sha256: _sha256, ...book }) => book) };
  }

  async list(_input, signal) {
    const root = await this.root(signal);
    const state = await this.loadPinned(root, signal);
    return { library: this.view(state), ...this.takeNotice() };
  }

  find(state, id) {
    const book = state.books.find(item => item.id === id);
    if (!book) throw libraryError('LIBRARY_MISSING', '这本书已不在书架上，请刷新');
    return book;
  }
  checkGroups(state, groups) {
    const known = new Set(state.groups.map(group => group.id));
    if (groups.some(group => !known.has(group))) throw libraryError('LIBRARY_GROUP', '所选分组已被删除，请刷新后重选');
    return [...new Set(groups)];
  }

  // —— 导入 ——
  expireUploads() {
    for (const [id, upload] of this.uploads) if (!upload.busy && this.now() - upload.touched > libraryLimits.idleMs) { this.uploads.delete(id); fs.rm(upload.file, { force: true }).catch(() => {}); }
  }
  upload(id) {
    const upload = this.uploads.get(id);
    if (!upload) throw libraryError('LIBRARY_UPLOAD', '导入已过期或已取消，请重新选择文件');
    return upload;
  }
  async uploadStart({ name, size }, signal) {
    if (size > bookLimits.file) throw libraryError('LIBRARY_SIZE', `电子书超过 ${bookLimits.file / 1024 ** 2} MiB`);
    this.expireUploads();
    if (this.uploads.size >= libraryLimits.uploads) throw libraryError('LIBRARY_BUSY', '同时导入的文件太多，请等前面的导入完成');
    const root = await this.root(signal), id = randomUUID(), file = path.join(root, 'uploads', `${id}.part`);
    await fs.writeFile(file, new Uint8Array(0), { flag: 'wx', mode: 0o600 });
    this.uploads.set(id, { file, name, size, received: 0, touched: this.now(), busy: false });
    return { upload: { id, chunk: libraryLimits.chunk, received: 0 } };
  }
  async uploadChunk({ upload: id, offset, data }) {
    const upload = this.upload(id);
    if (upload.busy) throw libraryError('LIBRARY_UPLOAD', '上一块还没写完，请稍后');
    if (offset !== upload.received) throw libraryError('LIBRARY_UPLOAD', '上传顺序错乱，请重新导入');
    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length || bytes.length > libraryLimits.chunk || upload.received + bytes.length > upload.size || bytes.toString('base64') !== data) throw libraryError('LIBRARY_UPLOAD', '上传的数据块无效，请重新导入');
    upload.busy = true;
    try { await fs.appendFile(upload.file, bytes); upload.received += bytes.length; upload.touched = this.now(); }
    finally { upload.busy = false; }
    return { upload: { id, chunk: libraryLimits.chunk, received: upload.received } };
  }
  async uploadCancel({ upload: id }) {
    const upload = this.uploads.get(id);
    this.uploads.delete(id);
    if (upload) await fs.rm(upload.file, { force: true });
    return { cancelled: true };
  }
  async uploadFinish({ upload: id, groups = [], daily }, signal) {
    const upload = this.upload(id);
    if (upload.busy || upload.received !== upload.size) throw libraryError('LIBRARY_UPLOAD', '文件还没有传完');
    this.uploads.delete(id);
    try {
      const bytes = new Uint8Array(await fs.readFile(upload.file));
      return await this.importBytes(bytes, { filename: upload.name, source: { kind: 'import', filename: upload.name.slice(0, 255) }, groups, daily }, signal);
    } finally { await fs.rm(upload.file, { force: true }); }
  }

  /** 解析并入架：先在临时目录写全，再整体改名，最后登记到书目。 */
  async importBytes(bytes, { filename, source, groups = [], daily }, signal) {
    // 大小和指纹在交给解析进程之前记下。
    const size = bytes.length, sha256 = createHash('sha256').update(bytes).digest('hex');
    const before = await this.load(await this.root(signal));
    const duplicate = before.books.find(book => book.sha256 === sha256);
    if (duplicate) throw libraryError('LIBRARY_DUPLICATE', `这本书已经在书架上了：《${duplicate.title}》`);
    if (before.books.length >= libraryLimits.books) throw libraryError('LIBRARY_FULL', `书架最多放 ${libraryLimits.books} 本书`);
    this.checkGroups(before, groups);
    const parsed = await this.parse(bytes, filename, signal);
    signal?.throwIfAborted();
    const root = await this.root(signal), id = randomUUID();
    const incoming = path.join(root, 'books', `.incoming-${id}`), target = path.join(root, 'books', id);
    let renamed = false;
    try {
      await fs.mkdir(path.join(incoming, 'chapters'), { recursive: true });
      await fs.mkdir(path.join(incoming, 'images'));
      const chapters = [];
      for (const [index, chapter] of parsed.chapters.entries()) {
        const file = `${String(index + 1).padStart(5, '0')}.md`;
        await fs.writeFile(path.join(incoming, 'chapters', file), chapter.markdown, { flag: 'wx', mode: 0o600 });
        chapters.push({ title: chapter.title, chars: chapter.markdown.length });
      }
      for (const image of parsed.images) await fs.writeFile(path.join(incoming, 'images', image.name), image.bytes, { flag: 'wx', mode: 0o600 });
      const cover = parsed.cover && parsed.images.find(image => image.name === parsed.cover);
      let coverFile = null;
      if (cover) {
        try {
          const sharp = await this.sharp();
          const thumbnail = await sharp(Buffer.from(cover.bytes), { limitInputPixels: 64000000 }).rotate().resize({ width: 360, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
          await fs.writeFile(path.join(incoming, 'cover.webp'), thumbnail, { flag: 'wx', mode: 0o600 });
          coverFile = 'cover.webp';
        } catch { coverFile = `images/${cover.name}`; }
      }
      await fs.writeFile(path.join(incoming, 'book.json'), JSON.stringify({ version: 1, chapters }), { flag: 'wx', mode: 0o600 });
      signal?.throwIfAborted();
      await fs.rename(incoming, target);
      renamed = true;
      return await this.change(signal, state => {
        if (state.books.some(book => book.sha256 === sha256)) throw libraryError('LIBRARY_DUPLICATE', '这本书刚刚已经导入过了');
        const valid = this.checkGroups(state, groups);
        const book = {
          id, title: parsed.title, author: parsed.author, language: parsed.language, format: parsed.format, size, sha256,
          chars: chapters.reduce((sum, chapter) => sum + chapter.chars, 0), chapters: chapters.length, cover: coverFile, groups: valid,
          // 常看不满两本时新书自动补上；已满时即使要求常看也不挤掉别的书，返回的 daily 告诉界面放没放到首页。
          daily: (daily ?? true) && pinnedCount(state) < pinLimit,
          addedAt: new Date(this.now()).toISOString(), source, progress: { last: 0, next: 0 },
        };
        state.books.push(book);
        const { sha256: _sha256, ...visible } = book;
        return { book: visible, library: this.view(state), skippedImages: parsed.skippedImages };
      });
    } catch (error) {
      // 没登记进书目的目录都删掉，书架不留半本书。
      await fs.rm(renamed ? target : incoming, { recursive: true, force: true });
      throw error;
    }
  }

  // —— 编辑 ——
  async update({ id, title, author, groups, daily }, signal) {
    return this.change(signal, state => {
      const book = this.find(state, id);
      // 已满两本时不替用户挑哪本换下，交给界面的替换弹窗走 pins。
      if (daily && !book.daily && pinnedCount(state) >= pinLimit) throw pinFull();
      if (title !== undefined) book.title = title;
      if (author !== undefined) book.author = author;
      if (groups !== undefined) book.groups = this.checkGroups(state, groups);
      if (daily !== undefined) book.daily = daily;
      const { sha256: _sha256, ...visible } = book;
      return { book: visible, library: this.view(state) };
    });
  }
  /** 常看书籍整组替换：expected 是界面看到的原常看集合，与当前不一致说明别处改过，拒收让界面重读。 */
  async pins({ ids, expected }, signal) {
    const wanted = [...new Set(ids)];
    if (wanted.length > pinLimit) throw pinFull();
    return this.change(signal, state => {
      const key = list => [...new Set(list)].sort().join();
      if (key(state.books.filter(book => book.daily).map(book => book.id)) !== key(expected)) throw libraryError('CONFLICT', '常看书籍刚在别处改过，请刷新');
      for (const id of wanted) this.find(state, id);
      for (const book of state.books) book.daily = wanted.includes(book.id);
      return { library: this.view(state) };
    });
  }
  async remove({ id }, signal) {
    const result = await this.change(signal, async (state, root) => {
      this.find(state, id);
      state.books = state.books.filter(book => book.id !== id);
      // 先从书目里去掉并改名待删，删目录失败也不会再显示。
      await fs.rename(path.join(root, 'books', id), path.join(root, 'books', `.trash-${id}`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      return { removed: id, library: this.view(state), root };
    });
    await fs.rm(path.join(result.root, 'books', `.trash-${id}`), { recursive: true, force: true }).catch(() => {});
    return { removed: result.removed, library: result.library };
  }
  async saveGroup({ id, name }, signal) {
    return this.change(signal, state => {
      const clash = state.groups.find(group => group.name === name && group.id !== id);
      if (clash) throw libraryError('LIBRARY_GROUP', `已经有名为“${name}”的分组`);
      let group;
      if (id) {
        group = state.groups.find(item => item.id === id);
        if (!group) throw libraryError('LIBRARY_GROUP', '分组已被删除，请刷新');
        group.name = name;
      } else {
        if (state.groups.length >= libraryLimits.groups) throw libraryError('LIBRARY_GROUP', `最多建 ${libraryLimits.groups} 个分组`);
        group = { id: randomUUID(), name };
        state.groups.push(group);
      }
      return { group: { ...group }, library: this.view(state) };
    });
  }
  /** 删除分组只去掉标签，书留在书架上。 */
  async removeGroup({ id }, signal) {
    return this.change(signal, state => {
      if (!state.groups.some(group => group.id === id)) throw libraryError('LIBRARY_GROUP', '分组已被删除，请刷新');
      state.groups = state.groups.filter(group => group.id !== id);
      for (const book of state.books) book.groups = book.groups.filter(group => group !== id);
      return { removed: id, library: this.view(state) };
    });
  }

  // —— 阅读 ——
  async contents(root, book) {
    const text = await fs.readFile(path.join(root, 'books', book.id, 'book.json'), 'utf8').catch(error => { throw error.code === 'ENOENT' ? libraryError('LIBRARY_MISSING', `《${book.title}》的文件不见了，请删除后重新导入`) : error; });
    return JSON.parse(text).chapters;
  }
  async chapterText(root, book, index) {
    return fs.readFile(path.join(root, 'books', book.id, 'chapters', `${String(index + 1).padStart(5, '0')}.md`), 'utf8');
  }
  /** 打开一章：返回目录和这一章的阅读树，同时记下读到哪一章。 */
  async open({ id, chapter }, signal) {
    const root = await this.root(signal);
    const book = this.find(await this.load(root), id);
    const toc = await this.contents(root, book);
    if (chapter >= toc.length) throw libraryError('LIBRARY_MISSING', '没有这一章');
    const markdown = await this.chapterText(root, book, chapter);
    const updated = await this.change(signal, state => { const current = this.find(state, id); current.progress.last = chapter; const { sha256: _sha256, ...visible } = current; return visible; });
    return { reading: { book: updated, toc, chapter: { index: chapter, title: toc[chapter].title, view: bookView(markdown) } } };
  }
  /** 读完一章：下一章成为首页常看书要读的章节。 */
  async progress({ id, chapter }, signal) {
    return this.change(signal, state => {
      const book = this.find(state, id);
      if (chapter >= book.chapters) throw libraryError('LIBRARY_MISSING', '没有这一章');
      book.progress.next = Math.max(book.progress.next, Math.min(book.chapters, chapter + 1));
      const { sha256: _sha256, ...visible } = book;
      return { book: visible, library: this.view(state) };
    });
  }
  async image({ id, name }, signal) {
    const root = await this.root(signal);
    const book = this.find(await this.load(root), id);
    const file = name === 'cover' ? book.cover : `images/${name}`;
    if (!file || name !== 'cover' && !bookImageName.test(name)) throw libraryError('LIBRARY_MISSING', '没有这张图片');
    const bytes = await fs.readFile(path.join(root, 'books', id, file)).catch(() => { throw libraryError('LIBRARY_MISSING', '图片文件不见了'); });
    if (bytes.length > bookLimits.image) throw libraryError('LIBRARY_MISSING', '图片过大');
    return { image: { mime: imageTypes[file.split('.').pop()] ?? 'application/octet-stream', data: bytes.toString('base64') } };
  }

  /**
   * 首页常看书籍（最多两本，按书名排左右）：各给出下一章和之后最多三章，目录用已读出的 book.json，不多读文件。
   * 阅读副本丢失时照样列出并标 missing，让人能在首页取消常看或删除，而不是悄悄少一本。
   */
  async daily(signal) {
    const root = await this.root(signal);
    const state = await this.loadPinned(root, signal);
    const flagged = sortBooks(state.books.filter(book => book.daily));
    const books = [];
    for (const book of flagged) {
      const base = { id: book.id, title: book.title, author: book.author, cover: Boolean(book.cover) };
      // 一本书的目录读不出来（丢失、损坏、被占用、没有权限）只标这一本，不拖垮整块学习区；取消照常向上抛。
      const toc = await this.contents(root, book).catch(error => { if (signal?.aborted) throw error; return null; });
      if (!Array.isArray(toc) || !toc.length) { books.push({ ...base, chapters: book.chapters, finished: book.progress.next >= book.chapters, missing: true, next: [] }); continue; }
      const finished = book.progress.next >= toc.length, index = Math.min(book.progress.next, toc.length - 1);
      const excerpt = bookExcerpt(await this.chapterText(root, book, index).catch(() => ''));
      const next = toc.slice(index + 1, index + 4).map((chapter, step) => ({ index: index + 1 + step, title: chapter.title, chars: chapter.chars }));
      books.push({ ...base, chapters: toc.length, finished, chapter: { index, title: toc[index].title, excerpt, chars: toc[index].chars }, next });
    }
    return { date: day(this.now()), books, total: state.books.length, daily: flagged.length, ...this.takeNotice() };
  }

  // —— 在线书目 ——
  async fetchBytes(url, limit, timeout, signal) {
    let target = new URL(url);
    const deadline = AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]);
    for (let hop = 0; hop <= 5; hop++) {
      if (target.protocol !== 'https:' || !downloadHosts.has(target.hostname)) throw libraryError('LIBRARY_SOURCE', `下载地址不在允许的 GitHub 域名内：${target.hostname}`);
      let response;
      try { response = await this.fetcher(target, { redirect: 'manual', signal: deadline, headers: { 'user-agent': 'whalewing-library' } }); }
      catch (error) { if (signal?.aborted) throw error; throw libraryError('LIBRARY_NETWORK', `连不上 GitHub：${error.name === 'TimeoutError' ? '请求超时' : error.message}`); }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) break;
        target = new URL(location, target); continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw libraryError('LIBRARY_NETWORK', `下载失败（HTTP ${response.status}）`); }
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > limit) { await response.body?.cancel(); throw libraryError('LIBRARY_SIZE', '文件超过大小上限'); }
      const chunks = [];
      let total = 0;
      for await (const chunk of response.body ?? []) {
        total += chunk.length;
        if (total > limit) throw libraryError('LIBRARY_SIZE', '文件超过大小上限');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }
    throw libraryError('LIBRARY_NETWORK', '下载地址跳转次数过多');
  }
  async catalog(_input, signal) {
    const root = await this.root(signal), cacheFile = path.join(root, 'catalog.json');
    const state = await this.load(root);
    const annotate = (catalog, fetchedAt, error) => ({ catalog: {
      source: catalogUrl, fetchedAt, error,
      entries: catalog.books.map(entry => ({ ...entry, url: new URL(entry.url, catalogUrl).href, installed: state.books.find(book => book.source.kind === 'catalog' && book.source.entry === entry.id)?.id ?? null })),
    } });
    try {
      const bytes = await this.fetchBytes(catalogUrl, libraryLimits.catalogBytes, libraryLimits.catalogMs, signal);
      const catalog = this.validate.catalog(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      const fetchedAt = new Date(this.now()).toISOString();
      await writeFileAtomic(cacheFile, JSON.stringify({ fetchedAt, catalog }), { mode: 0o600 });
      return annotate(catalog, fetchedAt, null);
    } catch (error) {
      if (signal?.aborted) throw error;
      const message = error.code?.startsWith('LIBRARY_') ? `在线书目暂时取不到：${error.message}` : `在线书目格式不对：${String(error.message).slice(0, 200)}`;
      try {
        const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
        return annotate(this.validate.catalog(cached.catalog), cached.fetchedAt, `${message}；下面是 ${cached.fetchedAt.slice(0, 10)} 获取的书目`);
      } catch { return { catalog: { source: catalogUrl, fetchedAt: null, error: message, entries: [] } }; }
    }
  }
  async download({ entry: entryId, groups = [] }, signal) {
    const { catalog } = await this.catalog({}, signal);
    const entry = catalog.entries.find(item => item.id === entryId);
    if (!entry) throw libraryError('LIBRARY_SOURCE', catalog.error || '在线书目里已经没有这本书');
    if (entry.installed) throw libraryError('LIBRARY_DUPLICATE', `《${entry.title}》已经在书架上了`);
    const bytes = await this.fetchBytes(entry.url, Math.min(bookLimits.file, entry.size + 1024), libraryLimits.downloadMs, signal);
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw libraryError('LIBRARY_INTEGRITY', '下载的文件和书目登记的校验值不一致，已丢弃；请稍后重试');
    const filename = decodeURIComponent(new URL(entry.url).pathname.split('/').pop() || `${entry.id}.${entry.format.toLowerCase()}`);
    const source = { kind: 'catalog', entry: entry.id, url: entry.url, license: entry.license, licenseUrl: entry.licenseUrl, attribution: entry.attribution };
    const result = await this.importBytes(new Uint8Array(bytes), { filename, source, groups }, signal);
    // 书目登记的书名、作者比文件里的元数据更规范。
    return this.update({ id: result.book.id, title: entry.title, author: entry.author }, signal);
  }
}
