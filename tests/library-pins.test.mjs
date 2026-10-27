import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { withFileLock } from '@deepseek-ai/dsh-atomic-write';
import { Library, capPins, sortBooks, catalogUrl } from '../features/cards/library/store.js';
import { libraryContract } from '../features/cards/contract.js';

const contract = libraryContract(z);
const validate = { state: value => contract.state.parse(value), catalog: value => contract.catalog.parse(value) };
const utf8 = text => new TextEncoder().encode(text);
// 北京时间 2026-10-25 01:00；UTC 还是 10-24，用来确认迁移按北京日期取轮换位置。
const now = Date.parse('2026-10-24T17:00:00Z'), today = '2026-10-25';
// 解析桩：书名取文件名，一行一章；不走子进程，这里只关心常看规则。
const parse = async (bytes, filename) => ({
  format: 'TXT', title: filename.replace(/\.txt$/, ''), author: '', language: 'zh', images: [], cover: null, skippedImages: 0,
  chapters: new TextDecoder().decode(bytes).split('\n').filter(Boolean).map(line => ({ title: line, markdown: `${line}\n\n正文。` })),
});
const novel = name => utf8(`${name} 第一章\n${name} 第二章\n${name} 第三章`);
const book = (title, { daily = false, chapters = 5, next = 0 } = {}) => ({
  id: randomUUID(), title, author: '作者', language: 'zh', format: 'TXT', size: 10, chars: chapters * 10, chapters, cover: null, groups: [], daily,
  addedAt: '2026-10-01T00:00:00.000Z', source: { kind: 'import', filename: `${title}.txt` }, progress: { last: 0, next }, sha256: createHash('sha256').update(title).digest('hex'),
});
const pinned = state => sortBooks(state.books.filter(item => item.daily)).map(item => item.title);
/** 旧版 daily() 当天首页显示的两本：按书名排序后从 offset 起取相邻两本。 */
const oldShown = (books, date) => {
  const flagged = sortBooks(books.filter(item => item.daily)), offset = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return [flagged[offset % flagged.length], flagged[(offset + 1) % flagged.length]].map(item => item.title);
};

/** 直接写好书目和阅读副本，可以造出旧版留下的“常看超过两本”的数据。 */
async function seed(t, books, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-pins-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'whalewing-library'), file = path.join(root, 'library.json');
  for (const item of books) {
    const folder = path.join(root, 'books', item.id);
    await fs.mkdir(path.join(folder, 'chapters'), { recursive: true });
    const chapters = Array.from({ length: item.chapters }, (_, index) => ({ title: `${item.title} 第 ${index + 1} 章`, chars: 10 }));
    await fs.writeFile(path.join(folder, 'book.json'), JSON.stringify({ version: 1, chapters }));
    for (const index of chapters.keys()) await fs.writeFile(path.join(folder, 'chapters', `${String(index + 1).padStart(5, '0')}.md`), `${item.title} 第 ${index + 1} 章的正文。`);
  }
  await fs.mkdir(path.join(root, 'books'), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ version: 1, groups: [], books }));
  const library = new Library({ directory: async () => directory, validate, parse, now: () => now, ...options });
  return { library, root, file, read: async () => JSON.parse(await fs.readFile(file, 'utf8')) };
}
async function upload(library, name, extra = {}) {
  const bytes = novel(name);
  const { upload: { id } } = await library.uploadStart({ name, size: bytes.length });
  await library.uploadChunk({ upload: id, offset: 0, data: Buffer.from(bytes).toString('base64') });
  return library.uploadFinish({ upload: id, ...extra });
}

test('迁移：capPins 按旧轮换公式只保留升级当天首页那两本，不超过两本时什么都不做', () => {
  const books = ['甲', '乙', '丙', '丁'].map(title => book(title, { daily: true })).concat(book('戊'));
  const two = { books: structuredClone(books.slice(0, 2)) };
  assert.equal(capPins(two, today), null);
  assert.deepEqual(two.books, books.slice(0, 2), '不超过两本时一本都不动');
  const seen = new Set();
  for (const date of ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']) {
    const state = { books: structuredClone(books) };
    const notice = capPins(state, date);
    assert.deepEqual(new Set(notice.kept), new Set(oldShown(books, date)), `${date}：保留的就是旧版当天首页那两本`);
    assert.deepEqual(notice.kept, pinned(state), '书名按首页左右顺序');
    assert.equal(notice.released, 2);
    assert.equal(state.books.find(item => item.title === '戊').daily, false, '原本不常看的书不受影响');
    assert.equal(capPins(state, date), null, '收到两本后再跑一次不再改动');
    contract.notice.parse(notice);
    seen.add(notice.kept.join());
  }
  assert.equal(seen.size, 4, '不同日期保留的组合跟着旧轮换走');
});

test('常看：pins 整组替换，expected 与顺序无关；撤销就是用原列表再调一次', async t => {
  const [a, b, c] = [book('甲'), book('乙', { daily: true }), book('丙')];
  const { library, read } = await seed(t, [a, b, c]);
  let result = await library.pins({ ids: [a.id], expected: [b.id] });
  contract.result.parse(result);
  assert.deepEqual(Object.keys(result), ['library']);
  assert.deepEqual(result.library.books.filter(item => item.daily).map(item => item.title), ['甲']);
  result = await library.pins({ ids: [c.id, a.id], expected: [a.id] });
  assert.deepEqual(pinned(await read()), ['丙', '甲']);
  // 换下《丙》、设上《乙》，再撤销：expected 是刚设好的列表，ids 是原列表。
  await library.pins({ ids: [a.id, b.id], expected: [a.id, c.id] });
  await library.pins({ ids: [c.id, a.id], expected: [b.id, a.id] });
  assert.deepEqual(pinned(await read()), ['丙', '甲']);
  await library.pins({ ids: [], expected: [c.id, a.id] });
  assert.deepEqual(pinned(await read()), [], '可以一本都不留');
  await library.pins({ ids: [b.id, b.id], expected: [] });
  assert.deepEqual(pinned(await read()), ['乙'], '重复的 id 算同一本');
});

test('常看：expected 与当前常看不一致时按冲突拒收，书目原样不动', async t => {
  const [a, b, c] = [book('甲', { daily: true }), book('乙', { daily: true }), book('丙')];
  const { library, file } = await seed(t, [a, b, c]);
  const before = await fs.readFile(file, 'utf8');
  await assert.rejects(library.pins({ ids: [c.id, a.id], expected: [a.id] }), { code: 'CONFLICT', message: '常看书籍刚在别处改过，请刷新' });
  await assert.rejects(library.pins({ ids: [c.id], expected: [a.id, c.id] }), { code: 'CONFLICT' });
  await assert.rejects(library.pins({ ids: [], expected: [] }), { code: 'CONFLICT' });
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

test('常看：ids 里有不在书架上的书时拒收；超过两本按满额拒收', async t => {
  const [a, b] = [book('甲', { daily: true }), book('乙')];
  const { library, file } = await seed(t, [a, b]);
  const before = await fs.readFile(file, 'utf8');
  await assert.rejects(library.pins({ ids: [b.id, randomUUID()], expected: [a.id] }), { code: 'LIBRARY_MISSING', message: '这本书已不在书架上，请刷新' });
  await assert.rejects(library.pins({ ids: [a.id, b.id, randomUUID()], expected: [a.id] }), { code: 'LIBRARY_PIN_FULL' });
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

test('常看：update 设常看时已有两本就返回满额，同一次的其它修改也不写；取消常看、重复设常看照常', async t => {
  const [a, b, c] = [book('甲', { daily: true }), book('乙', { daily: true }), book('丙')];
  const { library, read } = await seed(t, [a, b, c]);
  await assert.rejects(library.update({ id: c.id, title: '新书名', daily: true }), { code: 'LIBRARY_PIN_FULL', message: '常看书籍最多两本，请先换下一本' });
  assert.equal((await read()).books.find(item => item.id === c.id).title, '丙');
  assert.equal((await library.update({ id: a.id, daily: true })).book.daily, true, '已是常看再设一次不算超额');
  assert.equal((await library.update({ id: c.id, title: '丙丙' })).book.daily, false, '不带 daily 的编辑不受上限影响');
  assert.equal((await library.update({ id: a.id, daily: false })).book.daily, false);
  const set = await library.update({ id: c.id, daily: true });
  contract.result.parse(set);
  assert.equal(set.book.daily, true);
  assert.deepEqual(pinned(await read()), ['丙丙', '乙']);
});

test('常看：导入时常看不满两本自动补上，满了不补也不挤掉别的书；“不放首页”空出位子后下一本补上', async t => {
  const { library, read } = await seed(t, []);
  assert.equal((await upload(library, '一.txt', { daily: false })).book.daily, false, '明确不放首页时不补');
  const second = await upload(library, '二.txt');
  assert.equal(second.book.daily, true);
  contract.result.parse(second);
  const third = await upload(library, '三.txt');
  assert.equal(third.book.daily, true, '已有一本常看时第二本也补上');
  assert.equal((await upload(library, '四.txt')).book.daily, false, '常看已满两本');
  assert.equal((await upload(library, '五.txt', { daily: true })).book.daily, false, '要求常看也不超过两本');
  await library.update({ id: third.book.id, daily: false });
  assert.equal((await upload(library, '六.txt')).book.daily, true);
  assert.deepEqual(pinned(await read()), ['二', '六']);
});

test('常看：在线书目下载走同一条补位规则', async t => {
  const files = { 'open-a': novel('开放甲'), 'open-b': novel('开放乙') };
  const entry = (id, title) => ({ id, title, author: '鲸翼书库', description: '', category: '', format: 'TXT', size: files[id].length, url: `books/${id}.txt`, sha256: createHash('sha256').update(files[id]).digest('hex'), license: 'MIT', licenseUrl: 'https://opensource.org/license/mit', attribution: '' });
  const catalog = { version: 1, books: [entry('open-a', '开放甲'), entry('open-b', '开放乙')] };
  const fetch = async url => {
    if (String(url) === catalogUrl) return new Response(JSON.stringify(catalog));
    const id = String(url).match(/\/books\/([a-z-]+)\.txt$/)?.[1];
    return id ? new Response(files[id]) : new Response('missing', { status: 404 });
  };
  const { library } = await seed(t, [book('甲', { daily: true }), book('乙')], { fetch });
  const first = await library.download({ entry: 'open-a' });
  assert.equal(first.book.title, '开放甲');
  assert.equal(first.book.daily, true, '常看只有一本，下载的书补上');
  assert.equal((await library.download({ entry: 'open-b' })).book.daily, false, '常看已满两本');
});

test('常看：删掉一本常看书不自动补位', async t => {
  const [a, b, c] = [book('甲', { daily: true }), book('乙', { daily: true }), book('丙')];
  const { library, read } = await seed(t, [a, b, c]);
  await library.remove({ id: a.id });
  assert.deepEqual(pinned(await read()), ['乙']);
  assert.equal((await library.daily()).daily, 1);
});

test('迁移：首页先读到旧数据时在文件锁内收到两本并写回，只在那一次带 notice', async t => {
  const books = ['甲', '乙', '丙', '丁'].map(title => book(title, { daily: true })).concat(book('戊'));
  const { library, read } = await seed(t, books);
  const shown = oldShown(books, today);
  const first = await library.daily();
  contract.daily.parse(first);
  assert.deepEqual(new Set(first.notice.kept), new Set(shown));
  assert.equal(first.notice.released, 2);
  assert.deepEqual(first.books.map(item => item.title), first.notice.kept, '首页就是保留的两本');
  assert.equal(first.daily, 2);
  assert.deepEqual(pinned(await read()), first.notice.kept, '已经写回书目');
  const again = await library.daily();
  assert.equal(Object.hasOwn(again, 'notice'), false, '写回后不再提示');
  assert.deepEqual(again.books.map(item => item.title), first.notice.kept);
  assert.equal(Object.hasOwn(await library.list(), 'notice'), false);
});

test('迁移：书架列表先读到时由它写回并带 notice，之后首页不再提示', async t => {
  const books = ['甲', '乙', '丙'].map(title => book(title, { daily: true }));
  const { library, read } = await seed(t, books);
  const listed = await library.list();
  contract.result.parse(listed);
  assert.deepEqual(new Set(listed.notice.kept), new Set(oldShown(books, today)));
  assert.equal(listed.notice.released, 1);
  assert.equal(listed.library.books.filter(item => item.daily).length, 2);
  assert.equal(pinned(await read()).length, 2);
  assert.equal(Object.hasOwn(await library.daily(), 'notice'), false);
  assert.equal(Object.hasOwn(await library.list(), 'notice'), false);
});

test('迁移：首页和书架同时读到旧数据时只写回一次，只有一方带 notice', async t => {
  const books = ['甲', '乙', '丙', '丁', '戊'].map(title => book(title, { daily: true }));
  const { library } = await seed(t, books);
  const [home, shelf] = await Promise.all([library.daily(), library.list()]);
  assert.equal([home, shelf].filter(result => result.notice).length, 1);
  assert.deepEqual(home.books.map(item => item.id), shelf.library.books.filter(item => item.daily).map(item => item.id));
});

test('迁移：等锁期间别处已经收好两本时，锁内重读后不再写回、不带 notice', async t => {
  const books = ['甲', '乙', '丙'].map(title => book(title, { daily: true }));
  let hook = null;
  const { library, file } = await seed(t, books, { validate: { ...validate, state: value => { hook?.(); return validate.state(value); } } });
  await library.root(); // 先跑完启动清理，它的读取不算
  const loaded = new Promise(resolve => { hook = resolve; });
  const other = JSON.stringify({ version: 1, groups: [], books: books.map((item, index) => ({ ...item, daily: index === 2 })) });
  let pending;
  await withFileLock(file, async () => {
    pending = library.list();
    await loaded; // 锁外已读到三本，正在等锁
    hook = null;
    await fs.writeFile(file, other);
  });
  const result = await pending;
  assert.equal(Object.hasOwn(result, 'notice'), false);
  assert.deepEqual(result.library.books.filter(item => item.daily).map(item => item.title), ['丙']);
  assert.equal(await fs.readFile(file, 'utf8'), other, '锁内重读发现不超过两本，没有再写回');
});

test('首页常看：接下来最多三章取自目录；阅读副本丢失或目录损坏时照样列出、标 missing、不带章节', async t => {
  const [a, b] = [book('甲', { daily: true, chapters: 6, next: 1 }), book('乙', { daily: true, chapters: 3, next: 1 })];
  const { library, root } = await seed(t, [a, b, book('丙')]);
  let home = await library.daily();
  contract.daily.parse(home);
  assert.deepEqual(home.books[0].chapter, { index: 1, title: '甲 第 2 章', excerpt: '甲 第 2 章的正文。', chars: 10 });
  assert.deepEqual(home.books[0].next, [2, 3, 4].map(index => ({ index, title: `甲 第 ${index + 1} 章`, chars: 10 })));
  assert.deepEqual(home.books[1].next.map(item => item.index), [2], '不足三章时有几章给几章');
  await fs.rm(path.join(root, 'books', a.id), { recursive: true });
  await fs.writeFile(path.join(root, 'books', b.id, 'book.json'), '{坏了');
  home = await library.daily();
  contract.daily.parse(home);
  assert.deepEqual(home.books[0], { id: a.id, title: '甲', author: '作者', cover: false, chapters: 6, finished: false, missing: true, next: [] });
  assert.equal(home.books[1].missing, true);
  assert.equal(Object.hasOwn(home.books[1], 'chapter'), false);
  assert.equal(home.daily, 2, '丢了副本的书仍算常看，能在首页取消或删除');
});

test('常看：同一 expected 并发两次 pins 只有一次成功，另一次按冲突拒收，书目是胜出那次的结果', async t => {
  const [a, b, c] = [book('甲', { daily: true }), book('乙'), book('丙')];
  const { library, read } = await seed(t, [a, b, c]);
  const results = await Promise.allSettled([library.pins({ ids: [a.id, b.id], expected: [a.id] }), library.pins({ ids: [a.id, c.id], expected: [a.id] })]);
  const won = results.findIndex(result => result.status === 'fulfilled'), lost = results.find(result => result.status === 'rejected');
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(lost.reason.code, 'CONFLICT');
  assert.deepEqual(pinned(await read()), won === 0 ? ['甲', '乙'] : ['丙', '甲']);
});

test('常看与迁移写回后 library.json 仍是旧版能读的结构：version 1，顶层与每本书的字段不变', async t => {
  const books = ['甲', '乙', '丙'].map(title => book(title, { daily: true })).concat(book('丁'));
  const keys = Object.keys(books[0]).sort();
  const { library, read } = await seed(t, books);
  await library.list();
  await library.pins({ ids: [books[3].id], expected: pinned(await read()).map(title => books.find(item => item.title === title).id) });
  const raw = await read();
  assert.deepEqual(Object.keys(raw).sort(), ['books', 'groups', 'version']);
  assert.equal(raw.version, 1);
  for (const item of raw.books) assert.deepEqual(Object.keys(item).sort(), keys);
  assert.deepEqual(pinned(raw), ['丁']);
});

test('首页常看：一本书的目录读不出来（被占用、没有权限等）只标这一本，迁移提示照样带出', async t => {
  const books = ['甲', '乙', '丙'].map(title => book(title, { daily: true }));
  const { library, root } = await seed(t, books);
  // book.json 换成目录，读取时得到 EISDIR，代表丢失、损坏之外的读错误。
  for (const item of books) { await fs.rm(path.join(root, 'books', item.id, 'book.json')); await fs.mkdir(path.join(root, 'books', item.id, 'book.json')); }
  const kept = oldShown(books, today);
  await fs.rm(path.join(root, 'books', books.find(item => item.title === kept[1]).id, 'book.json'), { recursive: true });
  await fs.writeFile(path.join(root, 'books', books.find(item => item.title === kept[1]).id, 'book.json'), JSON.stringify({ version: 1, chapters: [{ title: '第一章', chars: 10 }] }));
  const home = await library.daily();
  contract.daily.parse(home);
  assert.deepEqual(new Set(home.notice.kept), new Set(kept), '迁移提示随这次成功的结果带出');
  const byTitle = Object.fromEntries(home.books.map(item => [item.title, item]));
  assert.equal(byTitle[kept[0]].missing, true, '读不出来的那本标 missing');
  assert.equal(byTitle[kept[1]].missing, undefined, '另一本照常列出');
  assert.equal(byTitle[kept[1]].chapter.title, '第一章');
  assert.equal(Object.hasOwn(await library.daily(), 'notice'), false, '提示只带一次');
});
