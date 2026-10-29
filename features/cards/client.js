import { newsContract } from './contract.js';
import { bookExtensions } from './library/limits.js';
import { createTipsView } from './tips.js';
import { registerFeature } from '../../src/shell/feature.js';
import { createMarkdown } from '../../src/shell/markdown.js';
import { useFeature } from '../../src/shell/feature.js';

const monoColors = ['#2563eb', '#0d9488', '#d97706', '#db2777', '#7c3aed', '#0284c7', '#65a30d', '#e11d48'];
const monoColor = name => monoColors[[...(name || '')].reduce((sum, char) => (sum * 31 + char.codePointAt(0)) >>> 0, 7) % monoColors.length];
const base64 = bytes => { let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(binary); };
const megabytes = size => `${(size / 1024 ** 2).toFixed(size < 10 * 1024 ** 2 ? 1 : 0)} MB`;
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
/** 常看书籍上限，与书架存储一致。 */
const pinLimit = 2;
const pinsOf = books => books.filter(book => book.daily).map(book => book.id);
const sameIds = (a, b) => [...a].sort().join() === [...b].sort().join();
// 书架排序只在本机算、记在本机；切换字段时方向回到该字段的默认值。
const sortKey = 'whalewing:cards:library-sort', sortDefaults = { added: 'desc', title: 'asc', progress: 'desc' };
const readSort = () => {
  try { const value = JSON.parse(window.localStorage.getItem(sortKey) || 'null'); if (value && Object.hasOwn(sortDefaults, value.field) && ['asc', 'desc'].includes(value.dir)) return { field: value.field, dir: value.dir }; } catch { /* 浏览器存储不可用时用默认排序。 */ }
  return { field: 'added', dir: 'desc' };
};
const readRatio = book => Math.min(book.progress.next, book.chapters) / book.chapters;
const shelfOrder = { added: (a, b) => Date.parse(a.addedAt) - Date.parse(b.addedAt), title: (a, b) => collator.compare(a.title, b.title), progress: (a, b) => readRatio(a) - readRatio(b) };
const sortShelf = (books, { field, dir }) => [...books].sort((a, b) => (dir === 'asc' ? 1 : -1) * shelfOrder[field](a, b));
const matches = (book, needle) => !needle || `${book.title}\n${book.author}`.toLowerCase().includes(needle);
// 本机有没有中文衬线字体：document.fonts.check 对本机字体几乎总说有，改用画布量字宽；量不了按有处理。
let serifReady;
const hasSerif = () => {
  if (serifReady !== undefined) return serifReady;
  serifReady = true;
  try {
    if (typeof OffscreenCanvas !== 'function') return serifReady;
    const context = new OffscreenCanvas(8, 8).getContext('2d'), sample = '常看书籍每天接着读下一章';
    const width = font => { context.font = `32px ${font}`; return context.measureText(sample).width; };
    const plain = width('monospace');
    serifReady = ['"Noto Serif SC"', '"Source Han Serif SC"', '"Songti SC"'].some(name => width(`${name}, monospace`) !== plain);
  } catch { /* 保持按有字体处理，只影响字号微调。 */ }
  return serifReady;
};

/** 本页持有自己的草稿、动作和恢复状态；切走时不把状态交给外壳。 */
export function createView(kit) {
  const { React, Glyph, ActionMenu, Modal, ConfirmDialog, Drawer } = kit;
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect } = React;
  const { TipsPage } = createTipsView(kit);
  // 书内图片和封面按“书/图片名”缓存成 data URL；同一张图并发请求只发一次。
  const images = new Map();
  const cachedImage = (load, id, name) => {
    const key = `${id}/${name}`;
    if (!images.has(key)) {
      if (images.size > 400) images.delete(images.keys().next().value);
      images.set(key, load(id, name).catch(error => { images.delete(key); throw error; }));
    }
    return images.get(key);
  };
  function BookImage({ load, id, name, alt, t }) {
    const [state, setState] = useState({ src: null, failed: false });
    useEffect(() => {
      let live = true;
      cachedImage(load, id, name).then(src => { if (live) setState({ src, failed: false }); }, () => { if (live) setState({ src: null, failed: true }); });
      return () => { live = false; };
    }, [id, name]);
    if (state.failed) return h('span', { className: 'ww-book-image-missing' }, alt || t('libraryImageMissing'));
    // 插图本身是按钮：阅读器接住点击，打开大图。
    return state.src ? h('button', { type: 'button', className: 'ww-book-image-zoom', 'data-zoom': state.src, 'data-alt': alt || '', 'aria-label': alt ? `${t('bookImageView')}：${alt}` : t('bookImageView'), title: t('bookImageView') }, h('img', { src: state.src, alt, className: 'ww-book-image', decoding: 'async' })) : h('span', { className: 'ww-book-image-wait', 'aria-hidden': true });
  }
  /**
   * 凡是显示一本书的地方都用这张封面：书自带封面就用原封面，没有或读不出来才用书名、作者和书色排一张素色封面。
   * 原封面读取期间只铺书色底，不先闪一张生成的封面。size：l 首页书卡、m 书格、s 常看栏、xs 替换弹窗、xxs 选择抽屉。
   */
  function BookCover({ load, book, size = 'm' }) {
    const [image, setImage] = useState({ src: null, failed: false });
    useEffect(() => {
      if (!book.cover) return;
      let live = true;
      cachedImage(load, book.id, 'cover').then(src => { if (live) setImage({ src, failed: false }); }, () => { if (live) setImage({ src: null, failed: true }); });
      return () => { live = false; };
    }, [book.id, book.cover]);
    const plain = !book.cover || image.failed;
    return h('div', { className: `ww-cover ww-cover-${size}`, style: { '--ww-accent': monoColor(book.title) }, 'aria-hidden': true },
      book.cover && image.src ? h('img', { src: image.src, alt: '' }) : h('div', { className: 'ww-cover-plain' }, plain && h('strong', null, book.title), plain && book.author && h('small', null, book.author)));
  }
  /**
   * 按章阅读器（2026-10-28 按用户要求改成电脑上的读法）：正文一栏上下滚动，目录在左侧（宽窗默认展开，窄窗点“目录”浮出），
   * 目录下列出本章小节并跟着阅读位置高亮。滚到本章末尾记为读完；章末有“下一章”，停一下再往下滚也进入下一章，
   * 在开头停一下再往上滚回到上一章末尾；← → 换章。读到的位置（第几章、滚到哪里）和字号记在本机，下次打开回到原处。
   * 插图按正文宽度显示，点开看大图。
   */
  const readerKey = 'whalewing.reader';
  const readerStore = {
    read() { try { return JSON.parse(globalThis.localStorage?.getItem(readerKey) || '{}') || {}; } catch { return {}; } },
    write(update) {
      try {
        const value = update(this.read());
        const books = Object.entries(value.books || {}).sort((a, b) => b[1].at - a[1].at).slice(0, 60);
        globalThis.localStorage?.setItem(readerKey, JSON.stringify({ ...value, books: Object.fromEntries(books) }));
      } catch { /* 本机存储不可用时只是不记位置 */ }
    },
  };
  const sizes = ['15px', '16.5px', '18px', '20px'];
  function BookReader({ bookId, title, accent, onClose, t, children, chapters, current = 0, anchor = 'start', onChapter, onEnd, initialToc = false }) {
    const dialog = useRef(null), scroller = useRef(null), flow = useRef(null);
    const wide = () => (globalThis.innerWidth ?? 1200) >= 900;
    const [toc, setToc] = useState(() => initialToc || wide());
    const [size, setSize] = useState(() => { const saved = readerStore.read().size; return Number.isInteger(saved) && saved >= 0 && saved < sizes.length ? saved : 1; });
    const [view, setView] = useState({ ratio: 0, sections: [], section: -1 });
    const [zoom, setZoom] = useState(null);
    const ended = useRef(-1), restoring = useRef(null), opened = useRef(false), edge = useRef({ last: 0, gesture: 0, at: null, sum: 0 }), saveTimer = useRef(0), returnFocus = useRef(null);
    // 最近一次读到的位置；关掉时页面已经量不到了，按它记。
    const position = useRef({ chapter: current, ratio: 0 });
    const latest = useRef(null);
    latest.current = { current, onEnd, onChapter };
    const last = chapters.length - 1;
    const metrics = () => { const box = scroller.current; return box ? { top: box.scrollTop, room: Math.max(0, box.scrollHeight - box.clientHeight) } : { top: 0, room: 0 }; };
    const remember = () => { const { chapter, ratio } = position.current; readerStore.write(value => ({ ...value, books: { ...value.books, [bookId]: { chapter, ratio, at: Date.now() } } })); };
    // 本章小节：二、三级标题（和章名相同的那一行不算），带它现在离正文顶端多远；插图载入后位置会变，每次用时现量。
    const headingsOf = content => {
      const chapterTitle = chapters[latest.current.current]?.title.trim(), base = content.getBoundingClientRect?.().top ?? 0;
      return [...content.querySelectorAll('.ww-rendered h2, .ww-rendered h3')].filter(element => element.textContent.trim() && element.textContent.trim() !== chapterTitle).slice(0, 60)
        .map(element => ({ label: element.textContent.trim(), level: Number(element.tagName.slice(1)), offset: (element.getBoundingClientRect?.().top ?? 0) - base }));
    };
    // 读当前位置：进度、当前小节；到了本章末尾（或整章一屏放得下）记为读完。
    const sync = () => {
      const box = scroller.current, content = flow.current;
      if (!box || !content) return;
      const { top, room } = metrics(), ratio = room ? Math.min(1, top / room) : 1;
      position.current = { chapter: latest.current.current, ratio: room ? ratio : 0 };
      const sections = headingsOf(content);
      // 滚到本章末尾时，最后几节的标题可能滚不到顶上：这时按“还在屏幕里的最后一节”算。
      const reach = room && top >= room - 2 ? top + box.clientHeight * 0.85 : top + 32;
      const section = sections.reduce((found, entry, index) => entry.offset <= reach ? index : found, -1);
      setView(value => value.ratio === ratio && value.section === section && value.sections.length === sections.length && value.sections.every((entry, index) => entry.label === sections[index].label) ? value : { ratio, sections, section });
      const { current: index, onEnd: finish } = latest.current;
      if (top >= room - 2 && ended.current !== index) { ended.current = index; finish?.(index); }
      clearTimeout(saveTimer.current); saveTimer.current = setTimeout(remember, 300);
    };
    // 打开时、换章后定位：上一章往回滚时落在末尾；第一次打开同一章回到上次的位置；其余从头读起。
    // 图片和字体陆续载入会改高度，用户动手之前按比例再定位一次。
    const place = () => {
      const box = scroller.current;
      if (!box) return;
      const target = restoring.current;
      if (target !== null) box.scrollTop = target * Math.max(0, box.scrollHeight - box.clientHeight);
      sync();
    };
    const settle = () => { if (restoring.current !== null) place(); else sync(); };
    const stopRestoring = () => { restoring.current = null; };
    useEffect(() => {
      const content = flow.current;
      const observer = typeof ResizeObserver === 'function' && content ? new ResizeObserver(settle) : null;
      observer?.observe(content);
      content?.addEventListener?.('load', settle, true);
      document.fonts?.ready?.then(settle);
      const element = dialog.current;
      return () => { clearTimeout(saveTimer.current); remember(); observer?.disconnect(); content?.removeEventListener?.('load', settle, true); element?.close?.(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); };
    }, []);
    useLayoutEffect(() => {
      if (!opened.current) { returnFocus.current = document.activeElement; if (!dialog.current?.open) dialog.current?.showModal?.(); }
      const saved = readerStore.read().books?.[bookId];
      restoring.current = anchor === 'end' ? 1 : !opened.current && saved?.chapter === current && anchor === 'start' ? saved.ratio : 0;
      opened.current = true;
      edge.current = { last: 0, gesture: 0, at: null, sum: 0 };
      place();
      scroller.current?.focus?.({ preventScroll: true });
      // 定位只在刚打开的一小会儿里跟着高度变化调整，之后交给员工。
      const timer = setTimeout(stopRestoring, 1500);
      return () => clearTimeout(timer);
    }, [current]);
    useEffect(() => { readerStore.write(value => ({ ...value, size })); settle(); }, [size]);
    const goChapter = (index, where = 'start') => { if (index >= 0 && index <= last && index !== current) { remember(); onChapter(index, where); } };
    // 在本章末尾（开头）停一下再接着滚，才换到下一章（上一章）；滚到头的那一下不算，免得一次猛滚直接跳章。
    const onWheel = event => {
      stopRestoring();
      const box = scroller.current;
      if (!box || event.ctrlKey || !event.deltaY) return;
      const now = Date.now(), state = edge.current;
      if (now - state.last > 250) state.gesture += 1;
      state.last = now;
      const { top, room } = metrics();
      const dir = event.deltaY > 0 && top >= room - 2 && current < last ? 1 : event.deltaY < 0 && top <= 1 && current > 0 ? -1 : 0;
      if (!dir) { state.at = null; state.sum = 0; return; }
      if (!state.at || state.at.dir !== dir) { state.at = { dir, gesture: state.gesture }; state.sum = 0; return; }
      if (state.gesture === state.at.gesture) return;
      state.sum += Math.abs(event.deltaY);
      if (state.sum >= 100) { state.at = null; state.sum = 0; goChapter(current + dir, dir > 0 ? 'start' : 'end'); }
    };
    const onKeyDown = event => {
      if (event.target.closest?.('input, textarea, select, [popover]')) return;
      if (event.key === 'ArrowRight' && current < last) { event.preventDefault(); goChapter(current + 1); }
      else if (event.key === 'ArrowLeft' && current > 0) { event.preventDefault(); goChapter(current - 1); }
      else if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' ', 'Home', 'End'].includes(event.key)) stopRestoring();
    };
    const jump = section => { stopRestoring(); const offset = section === null ? 0 : headingsOf(flow.current)[section]?.offset ?? 0; scroller.current?.scrollTo?.({ top: Math.max(0, offset - 16), behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); if (!wide()) setToc(false); };
    const pickChapter = index => { goChapter(index); if (!wide()) setToc(false); };
    const percent = Math.round((current + view.ratio) / chapters.length * 100);
    return h('dialog', { ref: dialog, className: 'ww-modal ww-page ww-book', 'aria-label': title, style: { '--ww-accent': accent, '--ww-book-size': sizes[size] }, onKeyDown,
      onCancel: event => { event.preventDefault(); if (zoom) setZoom(null); else onClose(); }, onClick: event => { if (event.target === event.currentTarget) onClose(); } },
      h('header', { className: 'ww-book-bar' },
        h('button', { type: 'button', className: 'ww-book-toggle', 'aria-expanded': toc, 'aria-controls': 'ww-book-toc', title: t('bookToc'), onClick: () => setToc(value => !value) }, h(Glyph, { name: 'list' }), h('span', null, t('bookToc'))),
        h('p', { className: 'ww-book-title' }, title),
        h('div', { className: 'ww-book-tools' },
          h('button', { type: 'button', className: 'ww-icon-button', title: t('bookSmaller'), 'aria-label': t('bookSmaller'), disabled: size === 0, onClick: () => setSize(value => Math.max(0, value - 1)) }, 'A−'),
          h('button', { type: 'button', className: 'ww-icon-button', title: t('bookLarger'), 'aria-label': t('bookLarger'), disabled: size === sizes.length - 1, onClick: () => setSize(value => Math.min(sizes.length - 1, value + 1)) }, 'A+'),
          h('button', { type: 'button', className: 'ww-icon-button', title: t('closePanel'), 'aria-label': t('closePanel'), onClick: onClose }, h(Glyph, { name: 'close' })))),
      h('div', { className: 'ww-book-body', 'data-toc': toc ? 'open' : 'closed' },
        toc && h('nav', { id: 'ww-book-toc', className: 'ww-book-toc', 'aria-label': t('bookToc') },
          h('ol', null, ...chapters.map((entry, index) => h('li', { key: index },
            h('button', { type: 'button', 'aria-current': index === current ? 'true' : undefined, onClick: () => index === current ? jump(null) : pickChapter(index) }, h('span', { className: 'ww-book-toc-num' }, index + 1), h('span', null, entry.title)),
            index === current && view.sections.length > 0 && h('ol', { className: 'ww-book-sections', 'aria-label': t('bookSections') }, ...view.sections.map((section, at) => h('li', { key: at },
              h('button', { type: 'button', 'data-level': section.level, 'aria-current': at === view.section ? 'location' : undefined, onClick: () => jump(at) }, section.label)))))))),
        h('div', { ref: scroller, className: 'ww-book-scroll', tabIndex: 0, 'aria-label': t('bookText'), onScroll: sync, onWheel, onPointerDown: stopRestoring },
          h('article', { ref: flow, className: 'ww-book-flow', onClick: event => { const image = event.target.closest?.('[data-zoom]'); if (image) setZoom({ src: image.dataset.zoom, alt: image.dataset.alt || '' }); } }, children))),
      h('footer', { className: 'ww-book-foot' },
        h('div', { className: 'ww-book-progress' }, h('span', null, `${t('learningChapter', { index: current + 1, count: chapters.length })} · ${chapters[current]?.title ?? title}`)),
        h('div', { className: 'ww-book-track', role: 'progressbar', 'aria-label': t('bookProgress'), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent }, h('i', { style: { width: `${percent}%` } })),
        h('span', { className: 'ww-book-percent' }, `${percent}%`)),
      zoom && h('div', { className: 'ww-book-zoom', role: 'dialog', 'aria-label': t('bookImageView'), onClick: () => setZoom(null) },
        h('img', { src: zoom.src, alt: zoom.alt }),
        h('button', { type: 'button', className: 'ww-icon-button', 'aria-label': t('closePanel'), title: t('closePanel'), onClick: () => setZoom(null) }, h(Glyph, { name: 'close' }))));
  }

  return function CardsView({ active, workbench }) {
    const { api, t, notify, busy, run, operation, setError: reportError, button, field, row, help, bind, dirty, openAssistant } = useFeature(React, workbench, 'cards');
    const setError = (message, action) => reportError(message, action || { label: t('retry'), run: () => refreshTab() });
    const [confirm, setConfirm] = useState(null);
    const [newsSettings, setNewsSettings] = useState(false);
    const [newsData, setNewsData] = useState(null);
    const [newsHome, setNewsHome] = useState(null);
    const [newsItem, setNewsItem] = useState(null);
    const [newsExpanded, setNewsExpanded] = useState({});
    const [newsRun, setNewsRun] = useState(null);
    const [newsEditor, setNewsEditor] = useState(null);
    const [newsSource, setNewsSource] = useState({ name: '', url: '', kind: '', region: '' });
    const [newsHistory, setNewsHistory] = useState(null);
    const [newsAbout, setNewsAbout] = useState(false);
    const [newsReport, setNewsReport] = useState(null);
    // 子页：首页、书架、技巧历史在页内切换，不改外壳；切页签后停在原来的子页，各子页记住自己的滚动位置。
    const [page, setPage] = useState('home');
    // 书架：书目与分组、当前分组、查找与排序、导入进度、编辑抽屉、在线书目、正在读的章节和正在打开的书。
    const [library, setLibrary] = useState(null);
    const [libraryGroup, setLibraryGroup] = useState('all');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState(readSort);
    const [importing, setImporting] = useState(null);
    const [bookEditor, setBookEditor] = useState(null);
    const [groupDrawer, setGroupDrawer] = useState(null);
    const [catalog, setCatalog] = useState(null);
    const [reading, setReading] = useState(null);
    const [opening, setOpening] = useState(null);
    // 常看书籍：选择抽屉（S4c）、满两本时的替换弹窗（S4b）、进书架后描边提示的那本书。
    const [pinDrawer, setPinDrawer] = useState(null);
    const [replace, setReplace] = useState(null);
    const [flash, setFlash] = useState(null);
    // 技巧历史：从首页技巧卡进入时要滚到并描边的那条；外壳“刷新”时改 reloadKey 让历史页重读。
    const [tipFocus, setTipFocus] = useState(null);
    const [tipsKey, setTipsKey] = useState(0);
    const [serifOff] = useState(() => !hasSerif());
    const fileInput = useRef(null), root = useRef(null), search = useRef(null), pinFocus = useRef(null), replaceFocus = useRef(null);
    // 提示里的“撤销”“不放首页”可能在换了子页之后才点，所以动作里读 ref 拿当前子页，不用发起时那一轮的值。
    const scrolls = useRef({}), pageRef = useRef(page), settingsRef = useRef(newsSettings), stamp = useRef(0);
    pageRef.current = page; settingsRef.current = newsSettings;
    const onHome = () => pageRef.current === 'home' && !settingsRef.current;
    // 卡片设置和首页共用 page = 'home'，滚动位置分开记。
    const scrollKey = () => pageRef.current === 'home' && settingsRef.current ? 'settings' : pageRef.current;
    const externalLink = (url, label) => {
      // 来源是外部资料；渲染边界不把非网页协议变成可点击命令。
      try { const parsed = new URL(url); if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label); } catch { /* 非法链接仍显示来源文字，不猜测修正地址。 */ }
      return h('span', null, label);
    };
    const editNews = field => {
      if (newsEditor) return;
      const draft = field ? { id: field.id, expectedRevision: field.revision, field: { name: field.name, focus: field.focus, enabled: field.enabled, sources: field.sources.map(source => ({ ...source })) } } : { id: `field-${globalThis.crypto.randomUUID()}`, expectedRevision: 0, field: { name: '', focus: '', enabled: false, sources: [] } };
      // 记下打开时的样子：之后有改动（含来源表单里填了没加的），关闭前先确认放弃。
      setNewsEditor({ ...draft, original: JSON.stringify(draft.field) });
      setNewsSource({ name: '', url: '', kind: '', region: '' });
    };
    const newsChanged = () => Boolean(newsEditor) && (JSON.stringify(newsEditor.field) !== newsEditor.original || Object.values(newsSource).some(value => String(value).trim()));
    const closeNews = () => newsChanged() ? setConfirm({ kind: 'newsDraft' }) : setNewsEditor(null);
    const closesNews = input => {
      const current = newsData?.fields.find(field => field.id === input.id);
      return current?.enabled && (input.action === 'remove' || !input.field.enabled) && !newsData.fields.some(field => field.id !== input.id && field.enabled) && newsData.schedules.some(task => task.status === 'active');
    };
    const persistNews = input => run(async () => {
      const signal = operation.current?.controller.signal;
      try {
        const saved = await api.newsRequest(input, signal);
        const current = await api.newsRequest({ action: 'list' }, signal);
        const field = current.fields.find(item => item.id === input.id);
        if (input.action === 'remove' ? !saved.field.deleted || Boolean(field) : !field || JSON.stringify(field) !== JSON.stringify(saved.field)) throw new Error(t('newsReadback'));
        return () => { setNewsData(current); setNewsEditor(null); setConfirm(null); notify(t(input.action === 'remove' ? 'newsRemoved' : 'newsSaved')); };
      } catch (reason) {
        if (reason.code === 'NEWS_CANCEL_CONFIRM') return () => setConfirm({ kind: 'newsChange', input, last: true });
        // 计划可能已经取消但配置尚未保存；按 owner 回读事实，不补建计划或丢弃草稿。
        let current;
        try { current = await api.newsRequest({ action: 'list' }, signal); } catch { /* 原错误与上次画面保留，等待员工明确回读。 */ }
        return () => { if (current) setNewsData(current); setError(`${t('newsWriteUnknown')}：${reason.message}`); };
      }
    });
    const saveNews = () => {
      const { original, ...editor } = newsEditor, input = { action: 'save', ...editor };
      if (closesNews(input)) { setConfirm({ kind: 'newsChange', input, last: true }); return; }
      return persistNews(input);
    };
    const reloadNewsEditor = () => run(async () => {
      const value = await api.newsRequest({ action: 'list' }, operation.current?.controller.signal);
      const current = value.fields.find(field => field.id === newsEditor.id);
      if (!current) throw new Error(t('newsReadback'));
      return () => { setNewsData(value); setNewsEditor(editor => ({ ...editor, expectedRevision: current.revision })); };
    });
    const readNewsReport = (fieldId, cutoff, name) => run(async () => {
      const value = await api.newsRequest({ action: 'report', fieldId, cutoff }, operation.current?.controller.signal);
      return () => setNewsReport({ fieldId, cutoff, name, report: value.report });
    });
    const readNewsHistory = (field, before) => run(async () => {
      const value = await api.newsRequest({ action: 'reports', fieldId: field.id, ...(before ? { before } : {}) }, operation.current?.controller.signal);
      return () => setNewsHistory({ field, reports: before ? [...newsHistory.reports, ...value.reports] : value.reports, nextBefore: value.nextBefore });
    });
    const openNewsSettings = () => run(async () => {
      const value = await api.newsRequest({ action: 'list' }, operation.current?.controller.signal);
      return () => { setNewsData(value); setNewsSettings(true); };
    });
    const closeNewsSettings = () => run(async () => {
      const value = await api.newsRequest({ action: 'home' }, operation.current?.controller.signal);
      return () => { applyHome(value); setNewsSettings(false); };
    });
    const beijing = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) : t('newsUnverified');
    const markdown = createMarkdown(h);

    // —— 子页切换 ——
    // 滚动发生在外壳的内容容器；离开前记下当前子页的位置，回来时恢复。
    const scroller = () => root.current?.closest?.('.ww-view') ?? null;
    const leave = () => { const box = scroller(); if (box) scrolls.current[scrollKey()] = box.scrollTop; };
    const showNotice = (notice, inLibrary) => notice && notify(t('libraryPinNotice', { kept: notice.kept.map(title => `《${title}》`).join(''), released: notice.released }), { kind: 'info', duration: 8000, ...(inLibrary ? {} : { action: { label: t('libraryOpen'), run: () => openLibrary() } }) });
    // 首页结果：书架读不出来时右上角带“重试”，旧数据收成两本时提示一次。
    const applyHome = value => {
      setNewsHome(value);
      if (value.learning.issue) setError(t('learningIssue', { reason: value.learning.issue }));
      else showNotice(value.learning.notice, false);
    };
    const openTips = focus => { leave(); setTipFocus(focus ?? null); setNewsSettings(false); setPage('tips'); };
    const backFromTips = () => { leave(); setPage('home'); };
    // “编辑来源”和停用的技巧卡都进卡片设置，并直接打开 AI 使用技巧的编辑抽屉；领域已删除时只进设置。
    const editTipSources = () => run(async () => {
      const value = await api.newsRequest({ action: 'list' }, operation.current?.controller.signal);
      const tips = value.fields.find(item => item.id === 'ai-tips');
      return () => { leave(); setNewsData(value); setNewsSettings(true); setPage('home'); if (tips) editNews(tips); };
    });

    // —— 书架动作 ——
    const libraryCall = input => api.libraryRequest(input, operation.current?.controller.signal);
    const readHome = () => api.newsRequest({ action: 'home' }, operation.current?.controller.signal);
    const loadImage = (id, name) => api.libraryRequest({ action: 'image', id, name }).then(({ image }) => `data:${image.mime};base64,${image.data}`);
    // focus：{ id } 进书架后滚到这本并描边；{ id: 'import' } 焦点落在“＋ 导入电子书”。
    const openLibrary = focus => run(async () => {
      const value = await libraryCall({ action: 'list' });
      return () => {
        leave(); setLibrary(value.library); setNewsSettings(false); setPage('library');
        // “在书架中查看”：清掉上次留下的分组和查找，免得要找的书被筛掉。
        if (focus) { if (focus.id !== 'import') { setLibraryGroup('all'); setQuery(''); } setFlash({ ...focus, at: Date.now() }); }
        showNotice(value.notice, true);
      };
    });
    const closeLibrary = () => run(async () => { const value = await readHome(); return () => { leave(); applyHome(value); setPage('home'); }; });
    const openCatalog = () => run(async () => { const value = await libraryCall({ action: 'catalog' }); return () => setCatalog(value.catalog); });
    // 当前常看集合：书架页以书架为准，首页以首页书桌为准（首页列出全部常看书，包括副本丢失的）。
    const currentPins = () => pageRef.current === 'library' && library ? pinsOf(library.books) : newsHome?.learning.books.map(book => book.id) ?? [];
    // 常看书籍整组替换，expected 是界面看到的原列表；撤销就是用原列表再替换一次。冲突时重读并提示，不覆盖别处的修改。
    const savePins = (ids, expected, message, { done, undo = true, retry } = {}) => run(async () => {
      let value;
      try { value = await libraryCall({ action: 'pins', ids, expected }); } catch (reason) {
        if (operation.current?.controller.signal.aborted) throw reason;
        if (reason.code === 'CONFLICT') {
          const latest = await libraryCall({ action: 'list' }), home = onHome() ? await readHome() : null;
          return () => { setLibrary(latest.library); if (home) setNewsHome(home); done?.(latest.library, true); notify(t('libraryPinConflict'), { kind: 'info' }); };
        }
        // 失败提示里的“重试”重做这次替换，而不是只重新读取页面。
        return () => setError(reason.message, { label: t('retry'), run: retry ?? (() => savePins(ids, expected, message, { done, undo, retry })) });
      }
      const home = onHome() ? await readHome() : null;
      return () => {
        setLibrary(value.library); if (home) setNewsHome(home); done?.(value.library, false);
        notify(message, { duration: 4000, ...(undo ? { action: { label: t('libraryUndo'), run: () => savePins(expected, ids, t('libraryUndone'), { undo: false }) } } : {}) });
      };
    });
    // 设为常看 / 取消常看都是 update 的 daily；已满两本时服务端拒收，改走替换弹窗。
    // 从延迟点的提示进来时界面上的常看列表可能已经过时，check 为 false 时直接交给服务端判断满没满。
    const setPinned = (book, daily, { check = true } = {}) => {
      const original = currentPins();
      if (check && daily && original.length >= pinLimit) { setReplace({ book, choice: null }); return; }
      return run(async () => {
        let value;
        try { value = await libraryCall({ action: 'update', id: book.id, daily }); } catch (reason) {
          if (operation.current?.controller.signal.aborted) throw reason;
          if (reason.code === 'LIBRARY_PIN_FULL') {
            const latest = await libraryCall({ action: 'list' });
            return () => { setLibrary(latest.library); setReplace({ book, choice: null }); };
          }
          return () => setError(reason.message, { label: t('retry'), run: () => setPinned(book, daily, { check }) });
        }
        const home = onHome() ? await readHome() : null, pins = pinsOf(value.library.books);
        return () => {
          setLibrary(value.library); if (home) setNewsHome(home);
          notify(t(daily ? 'libraryPinDone' : 'libraryUnpinDone', { title: book.title }), { duration: 4000, action: { label: t('libraryUndo'), run: () => savePins(original, pins, t('libraryUndone'), { undo: false }) } });
        };
      });
    };
    const replacePin = () => {
      const pinned = pinsOf(library.books), old = library.books.find(book => book.id === replace?.choice);
      if (!old) return;
      // 冲突后按最新常看重看一遍：已经不满两本或这本已在常看里，就不用再换下谁，关掉弹窗。
      const after = (latest, conflict) => {
        const pins = pinsOf(latest.books);
        setReplace(conflict && pins.length >= pinLimit && !pins.includes(replace.book.id) ? value => value && { ...value, choice: null } : null);
      };
      return savePins([...pinned.filter(id => id !== old.id), replace.book.id], pinned, t('libraryPinReplaced', { title: replace.book.title, old: old.title }), { done: after, retry: replacePin });
    };
    // 选择抽屉：首页先读书架；书架页直接用已读到的书目。focus 是“换一本”时被换的那本。
    const startPins = (books, focus) => { const pins = pinsOf(books); setPinDrawer({ original: pins, selected: pins, query: '', group: 'all', focus: focus ?? null, opened: Date.now() }); };
    const openPins = focus => {
      if (page === 'library' && library) return startPins(library.books, focus);
      return run(async () => {
        try { const value = await libraryCall({ action: 'list' }); return () => { setLibrary(value.library); startPins(value.library.books, focus); }; } catch (reason) {
          if (operation.current?.controller.signal.aborted) throw reason;
          return () => { setPinDrawer({ error: true, focus: focus ?? null, opened: Date.now() }); setError(`${t('libraryReadFailed')}：${reason.message}`, { label: t('retry'), run: () => openPins(focus) }); };
        }
      });
    };
    const pinsChanged = drawer => Boolean(drawer?.selected) && !sameIds(drawer.selected, drawer.original);
    const closePins = () => pinsChanged(pinDrawer) ? setConfirm({ kind: 'pinDraft' }) : setPinDrawer(null);
    const togglePin = id => setPinDrawer(drawer => ({ ...drawer, selected: drawer.selected.includes(id) ? drawer.selected.filter(item => item !== id) : drawer.selected.length < pinLimit ? [...drawer.selected, id] : drawer.selected }));
    const savePinDrawer = () => savePins(pinDrawer.selected, pinDrawer.original, t('libraryPinsSaved'), { done: (latest, conflict) => conflict ? setPinDrawer(drawer => drawer && { ...drawer, original: pinsOf(latest.books), selected: pinsOf(latest.books) }) : setPinDrawer(null) });
    // 新书常看有空位时服务端自动补上；提示里给“不放首页”撤销，已满时给“设为常看”走替换弹窗。
    const unpinNew = book => run(async () => {
      let value;
      try { value = await libraryCall({ action: 'update', id: book.id, daily: false }); } catch (reason) {
        if (operation.current?.controller.signal.aborted) throw reason;
        return () => setError(reason.message, { label: t('retry'), run: () => unpinNew(book) });
      }
      const home = onHome() ? await readHome() : null;
      return () => { setLibrary(value.library); if (home) setNewsHome(home); notify(t('libraryUnpinDone', { title: book.title })); };
    });
    // 已满时的“设为常看”可能隔几秒才点，到时满不满交给服务端：满了才弹替换，不满直接设上。
    const pinNotice = (book, text) => notify(`${text}，${t(book.daily ? 'libraryPinAuto' : 'libraryPinFullNote')}`, { duration: 8000, action: book.daily ? { label: t('libraryUnpinHome'), run: () => unpinNew(book) } : { label: t('libraryPin'), run: () => setPinned(book, true, { check: false }) } });
    const download = entry => run(async () => {
      const value = await libraryCall({ action: 'download', entry: entry.id, ...(libraryGroup !== 'all' ? { groups: [libraryGroup] } : {}) });
      return () => {
        setLibrary(value.library);
        setCatalog(current => current && { ...current, entries: current.entries.map(item => item.id === entry.id ? { ...item, installed: value.book.id } : item) });
        pinNotice(value.book, t('libraryDownloaded', { title: value.book.title }));
      };
    });
    // 分块上传：每块约 2 MB，逐本导入；一本失败不影响其余，最后汇总报告。
    const importFiles = files => run(async () => {
      const signal = operation.current?.controller.signal, done = [], failed = [], before = library ? pinsOf(library.books) : [];
      let latest = null;
      try {
        for (const [index, file] of files.entries()) {
          // 0 字节的文件不上传，直接说明是空文件（校验程序的原话是英文 JSON，员工看不懂）。
          if (!file.size) { failed.push(`《${file.name}》${t('libraryEmptyFile')}`); continue; }
          let upload = null;
          try {
            upload = (await libraryCall({ action: 'uploadStart', name: file.name, size: file.size })).upload;
            for (let offset = 0; offset < file.size; offset += upload.chunk) {
              setImporting({ name: file.name, index, count: files.length, percent: Math.floor(offset / file.size * 100) });
              const bytes = new Uint8Array(await file.slice(offset, offset + upload.chunk).arrayBuffer());
              await libraryCall({ action: 'uploadChunk', upload: upload.id, offset, data: base64(bytes) });
            }
            setImporting({ name: file.name, index, count: files.length, parsing: true });
            const result = await libraryCall({ action: 'uploadFinish', upload: upload.id, ...(libraryGroup !== 'all' ? { groups: [libraryGroup] } : {}) });
            latest = result.library; done.push(result);
          } catch (reason) {
            if (upload) api.libraryRequest({ action: 'uploadCancel', upload: upload.id }).catch(() => {});
            if (signal?.aborted) throw reason;
            failed.push(`《${file.name}》${reason.message}`);
          }
        }
      } finally { setImporting(null); }
      return () => {
        if (latest) setLibrary(latest);
        const pinned = done.filter(result => result.book.daily);
        const pinnedNotice = () => notify(`${t('libraryImportedMany', { count: done.length })}，${t('libraryPinAutoMany', { titles: pinned.map(result => `《${result.book.title}》`).join('') })}`, { duration: 8000, action: { label: t('libraryUnpinHome'), run: () => savePins(before, pinsOf(latest.books), t('libraryUndone'), { undo: false }) } });
        // 部分失败时失败原因走错误提示；成功那几本若已自动放到首页，另给一条带“不放首页”的提示。
        if (failed.length) { setError([done.length ? t('libraryImportedMany', { count: done.length }) : '', ...failed].filter(Boolean).join('；')); if (pinned.length && latest) pinnedNotice(); }
        else if (done.length === 1) pinNotice(done[0].book, t(done[0].skippedImages ? 'libraryImportedSkipped' : 'libraryImported', { title: done[0].book.title, count: done[0].skippedImages ?? 0 }));
        else if (pinned.length && latest) pinnedNotice();
        else notify(t('libraryImportedMany', { count: done.length }));
      };
    });
    const saveGroup = input => run(async () => {
      const value = await libraryCall({ action: 'saveGroup', ...input });
      return () => { setLibrary(value.library); setGroupDrawer(drawer => drawer && { name: input.id ? drawer.name : '', rename: null }); notify(t('libraryGroupSaved')); };
    });
    const removeGroup = group => run(async () => {
      const value = await libraryCall({ action: 'removeGroup', id: group.id });
      return () => { setLibrary(value.library); setConfirm(null); if (libraryGroup === group.id) setLibraryGroup('all'); notify(t('libraryGroupRemoved')); };
    });
    // 编辑抽屉只改书名、作者、分组；常看在“…”菜单里设。
    const editBook = book => setBookEditor({ id: book.id, original: book, title: book.title, author: book.author, groups: [...book.groups] });
    // 管理分组：新分组名填了没加、改名改了没存，关闭前先确认放弃。
    const groupsChanged = drawer => Boolean(drawer) && (Boolean(drawer.name?.trim()) || Boolean(drawer.rename && drawer.rename.name.trim() !== (library?.groups.find(group => group.id === drawer.rename.id)?.name ?? '')));
    const closeGroups = () => groupsChanged(groupDrawer) ? setConfirm({ kind: 'groupDraft' }) : setGroupDrawer(null);
    const bookChanged = editor => editor && (editor.title !== editor.original.title || editor.author !== editor.original.author || editor.groups.join() !== editor.original.groups.join());
    const saveBook = () => run(async () => {
      const { id, title, author, groups } = bookEditor;
      const value = await libraryCall({ action: 'update', id, title: title.trim(), author: author.trim(), groups });
      return () => { setLibrary(value.library); setBookEditor(null); notify(t('librarySaved')); };
    });
    // 删掉常看书不自动补位；在首页删的（副本丢失的书）顺带重读首页。
    const removeBook = book => run(async () => {
      const value = await libraryCall({ action: 'remove', id: book.id });
      const home = onHome() ? await readHome() : null;
      return () => { setLibrary(value.library); if (home) setNewsHome(home); setConfirm(null); notify(t('libraryRemoved')); };
    });
    // 打开失败在右上角说明是哪本书，并给原样重试；toc 为真时打开即展开目录。
    const openChapter = (id, chapter, anchor = 'start', { title = '', toc = false } = {}) => run(async () => {
      setOpening(id);
      try {
        const value = await libraryCall({ action: 'open', id, chapter });
        return () => setReading({ ...value.reading, anchor, showToc: toc });
      } catch (reason) {
        if (operation.current?.controller.signal.aborted) throw reason;
        return () => setError(t('libraryOpenFailed', { title, reason: reason.message }), { label: t('retry'), run: () => openChapter(id, chapter, anchor, { title, toc }) });
      } finally { setOpening(null); }
    });
    // 读到本章最后一页记为读完，首页常看书推进到下一章；失败不打断阅读。
    const finishChapter = (id, chapter) => { api.libraryRequest({ action: 'progress', id, chapter }).then(value => setLibrary(current => current && value.library), () => {}); };
    // 关闭阅读器回到打开它的那一页：首页重读学习数据，书架重读书目，常看栏和书格进度原位更新。
    // 这两个重读在后台进行、不占忙碌锁：带序号，之后任何操作开始都会让它作废，晚到的旧结果不覆盖新数据；失败给“重试”。
    const closeReader = () => {
      setReading(null);
      const mine = ++stamp.current, fresh = () => stamp.current === mine;
      const failed = reason => { if (fresh()) setError(`${t('libraryReadFailed')}：${reason?.message || t('requestFailed')}`, { label: t('retry'), run: () => refreshTab() }); };
      if (pageRef.current === 'library') api.libraryRequest({ action: 'list' }).then(value => { if (fresh()) setLibrary(value.library); }, failed);
      else if (onHome()) api.newsRequest({ action: 'home' }).then(value => { if (fresh()) setNewsHome(value); }, failed);
    };
    // 外壳的“刷新”只重读当前子页；回到本页签时技巧历史保持原位，不重读。
    const refreshTab = options => {
      if (page === 'tips') { if (!options?.entering) setTipsKey(value => value + 1); return; }
      return run(async () => {
        if (page === 'library') { const value = await libraryCall({ action: 'list' }); return () => { setLibrary(value.library); showNotice(value.notice, true); }; }
        const value = await api.newsRequest({ action: newsSettings ? 'list' : 'home' }, operation.current?.controller.signal);
        return () => newsSettings ? setNewsData(value) : applyHome(value);
      });
    };
    bind({ refresh: refreshTab, onError: reason => { if (reason.sessionId) return false; setError(reason.message || t('requestFailed')); return true; } });
    // 任何前台操作开始时，作废还在路上的后台重读（关闭阅读器后的那次）。
    useEffect(() => { if (busy) stamp.current++; }, [busy]);
    // 子页切换、回到本页签时恢复该子页的滚动位置；之后随滚动记下。
    useLayoutEffect(() => {
      const box = active ? scroller() : null;
      if (box) box.scrollTop = scrolls.current[scrollKey()] ?? 0;
    }, [page, newsSettings, active]);
    // 换子页后焦点放到新页标题上，读屏能知道页面变了；首次挂载和回到本页签时不抢焦点。
    const shown = useRef(null);
    useEffect(() => {
      const key = `${page}|${newsSettings}`;
      if (!active) return;
      if (shown.current !== null && shown.current !== key) {
        const title = root.current?.querySelector?.('h2');
        if (title && !root.current.contains?.(globalThis.document?.activeElement)) { title.tabIndex = -1; title.focus?.({ preventScroll: true }); }
      }
      shown.current = key;
    }, [page, newsSettings, active]);
    useEffect(() => {
      const box = active ? scroller() : null;
      if (!box) return;
      const save = () => { if (root.current?.isConnected) scrolls.current[scrollKey()] = box.scrollTop; };
      box.addEventListener('scroll', save, { passive: true });
      return () => box.removeEventListener('scroll', save);
    }, [active]);
    // 进书架后滚到要找的那本并描边 1.2 秒；从空书架的占位卡进来时焦点落在导入卡。
    useEffect(() => {
      if (!flash || !active || page !== 'library') return;
      const target = root.current?.querySelector?.(flash.id === 'import' ? '.ww-library-add' : `.ww-library-book[data-book="${flash.id}"]`);
      target?.scrollIntoView?.({ block: 'center' });
      if (flash.id === 'import') target?.focus?.();
      const timer = setTimeout(() => setFlash(null), 1200);
      return () => clearTimeout(timer);
    }, [flash, active, page]);
    // 书架页按“/”聚焦查找框；输入框和弹窗里的“/”照常输入。
    useEffect(() => {
      if (!active || page !== 'library') return;
      const onKey = event => {
        if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.target?.closest?.('input, textarea, select, [contenteditable], dialog')) return;
        event.preventDefault(); search.current?.focus();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [active, page]);
    // 抽屉和替换弹窗打开后，焦点落在查找框、被换的那本或第一张选项卡上（对话框打开时会先把焦点放到关闭按钮）。
    useEffect(() => { if (pinDrawer?.opened) pinFocus.current?.focus?.(); }, [pinDrawer?.opened]);
    useEffect(() => { if (replace) replaceFocus.current?.focus?.(); }, [replace?.book.id]);

    let body;
      const choices = [...new Map([...(newsData?.defaults.sources || []), ...(newsData?.fields || []).flatMap(field => field.sources), ...(newsEditor?.field.sources || [])].map(source => [source.url, source])).values()];
      const patchNews = (key, value) => setNewsEditor(editor => ({ ...editor, field: { ...editor.field, [key]: value } }));
      const toggleSource = source => patchNews('sources', newsEditor.field.sources.some(item => item.url === source.url) ? newsEditor.field.sources.filter(item => item.url !== source.url) : [...newsEditor.field.sources, { ...source }]);
      // 知识卡片首页：上面是书桌（常看书卡）和 AI 使用技巧卡，下面是每日资讯。和书有关的卡片用纸面、封面和衬线书名；技巧卡和资讯卡沿用 DSH 原色卡片，只放标题，点开在弹框或子页里看。
      const newsAccents = { model: '#6366f1', agent: '#0d9488', opensource: '#d97706', media: '#db2777', research: '#0284c7' };
      const newsIcons = { model: 'chip', agent: 'bot', opensource: 'code', media: 'image', research: 'flask' }, brand = 'var(--dsw-alias-brand-primary)';
      const accent = item => newsAccents[item.category] ?? brand;
      const dayOf = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(value));
      const when = value => {
        if (!value) return '';
        const day = dayOf(value), clock = beijing(value).slice(11, 16);
        return day === dayOf(Date.now()) ? `${t('newsToday')} ${clock}` : day === dayOf(Date.now() - 86400000) ? `${t('newsYesterday')} ${clock}` : `${day.slice(5).replace('-', '/')} ${clock}`;
      };
      const pressable = open => ({ role: 'button', tabIndex: 0, onClick: open, onKeyDown: event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } } });
      const shelfHead = (icon, eyebrow, title, meta, actions) => h('div', { className: 'ww-shelf-head' },
        h('div', null, h('p', { className: 'ww-shelf-eyebrow' }, h(Glyph, { name: icon, size: 14 }), eyebrow), h('h3', null, title), meta && h('small', { className: 'ww-muted' }, meta)),
        actions && h('div', { className: 'ww-row' }, ...actions));
      const tileTop = (icon, kicker, ...extra) => h('div', { className: 'ww-tile-top' }, h('span', { className: 'ww-tile-icon', 'aria-hidden': true }, h(Glyph, { name: icon, size: 15 })), h('span', { className: 'ww-tile-kicker' }, kicker), ...extra);
      const newsFlag = item => item.label === 'headline' ? h('span', { className: 'ww-brief-flag ww-brief-flag-media' }, t('newsHeadline')) : item.label === 'leak' ? h('span', { className: 'ww-brief-flag' }, t('newsLeak')) : item.label === 'media' ? h('span', { className: 'ww-brief-flag ww-brief-flag-media' }, t('newsMediaOnly')) : null;
      const newsKicker = item => item.category ? t(`newsCat_${item.category}`) : t('newsKicker');
      const newsCard = (report, item, i, total) => {
        const source = item.sources[0], name = source?.source.name;
        return h('article', { key: item.eventKey, className: 'ww-tile ww-news-tile', style: { '--ww-accent': accent(item) }, ...pressable(() => setNewsItem({ item, index: i, total, fieldName: report.fieldName })) },
          tileTop(newsIcons[item.category] ?? 'news', newsKicker(item), newsFlag(item), h('span', { className: 'ww-tile-num', 'aria-hidden': true }, String(i + 1).padStart(2, '0'))),
          h('h4', { className: 'ww-tile-title' }, item.title),
          h('div', { className: 'ww-tile-foot' },
            h('span', { className: 'ww-tile-source' }, name && h('span', { className: 'ww-tile-mono', style: { '--ww-mono': monoColor(name) }, 'aria-hidden': true }, name.trim().charAt(0).toUpperCase()), h('span', null, [name, when(source?.publishedAt)].filter(Boolean).join(' · '))),
            h('span', { className: 'ww-tile-go', 'aria-hidden': true }, '→')));
      };
      const reportView = report => {
        const key = `${report.fieldId}:${report.cutoff}`, items = report.items.slice(0, 8), expanded = Boolean(newsExpanded[key]);
        const meta = [t('newsCutoff', { time: beijing(report.cutoff).slice(0, 16) }), items.length > 0 && t('newsCount', { count: items.length }), report.status === 'empty' && t('newsEmpty')].filter(Boolean).join(' · ');
        // 部分来源失败是持续状态，作为琥珀小标记跟在元信息后面。
        return h('section', { className: 'ww-shelf', key },
          shelfHead('news', t('newsDaily'), report.fieldName, report.status === 'partial' ? [meta, ' · ', h('span', { className: 'ww-warn-mark', key: 'partial' }, t('newsPartial'))] : meta,
            [button('newsDiagnostics', () => setNewsRun(report)), button('newsReports', () => readNewsHistory({ id: report.fieldId, name: report.fieldName }))]),
          items.length > 0 && h('div', { className: 'ww-shelf-grid ww-shelf-news' }, ...items.slice(0, expanded ? 8 : 4).map((item, i) => newsCard(report, item, i, items.length))),
          items.length > 4 && h('button', { type: 'button', className: 'ww-brief-more', 'aria-expanded': expanded, title: t('newsMoreLabel'), onClick: () => setNewsExpanded(state => ({ ...state, [key]: !expanded })) },
            expanded ? t('newsLess') : t('newsMore', { count: items.length - 4 }), h('span', { className: 'ww-brief-chevron', 'aria-hidden': true })));
      };
      // 阅读时长按中文约 450 字 / 分钟估算。
      const minutes = chars => Math.max(1, Math.round(chars / 450));
      const learningDate = date => { const [year, month, day] = date.split('-').map(Number); return t('learningDate', { month, day, week: '日一二三四五六'[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] }); };
      const shortDate = date => date.slice(5).replace('-', '/');
      const accentOf = title => ({ '--ww-accent': monoColor(title) });
      const bookMenu = (book, ...items) => h('div', { className: 'ww-book-menu' }, h(ActionMenu, { label: `${book.title} · ${t('libraryActions')}`, iconOnly: true }, ...items));
      // 首页书卡：封面加文字列是一个按钮，直接打开下一章；“…”常显，和它并列不嵌套。一本时是加宽卡，右侧“接下来”三章各是独立按钮。
      const deskMenu = (book, single) => bookMenu(book, ...(book.missing
        ? [button('libraryUnpin', () => setPinned(book, false)), button('libraryRemove', () => setConfirm({ kind: 'bookRemove', book: { ...book, daily: true } }))]
        : [button('librarySwap', () => openPins(book.id)), single && button('libraryPinAdd', () => openPins(null)), button('libraryUnpin', () => setPinned(book, false)), button('libraryShowInShelf', () => openLibrary({ id: book.id }))]));
      const deskCard = (book, single) => {
        const wide = single ? ' ww-desk-wide' : '';
        // 阅读副本丢失：去饱和、不可点，“…”里只留取消常看和从书架删除。
        if (book.missing || !book.chapter) return h('div', { className: `ww-desk-card ww-desk-missing${wide}`, key: book.id, style: accentOf(book.title) },
          h('div', { className: 'ww-desk-main' }, h(BookCover, { load: loadImage, book, size: 'l' }),
            h('div', { className: 'ww-desk-text' }, h('h4', { className: 'ww-desk-title' }, t('learningMissingTitle', { title: book.title })), h('p', { className: 'ww-desk-excerpt' }, t('learningMissingText')))),
          deskMenu({ ...book, missing: true }, single));
        const { chapter } = book, percent = book.finished ? 100 : Math.round(chapter.index / book.chapters * 100);
        return h('div', { className: `ww-desk-card${wide}`, key: book.id, style: accentOf(book.title), 'aria-busy': opening === book.id || undefined },
          // 读屏只读一句“读哪本第几章”，不把摘要、百分比和悬停才出现的文字都念一遍。
          h('div', { className: 'ww-desk-main', 'aria-label': book.finished ? t('learningRereadLabel', { title: book.title }) : t('learningReadLabel', { title: book.title, index: chapter.index + 1, chapter: chapter.title }), ...pressable(() => openChapter(book.id, chapter.index, 'start', { title: book.title })) },
            h(BookCover, { load: loadImage, book, size: 'l' }),
            h('div', { className: 'ww-desk-text' },
              h('p', { className: 'ww-desk-chapter' }, h('i', { 'aria-hidden': true }), book.finished ? t('learningFinished') : t('learningChapter', { index: chapter.index + 1, count: book.chapters }),
                !book.finished && h('span', { className: 'ww-desk-chip' }, t('learningMinutes', { minutes: minutes(chapter.chars) }))),
              h('h4', { className: 'ww-desk-title' }, book.finished ? book.title : chapter.title),
              h('p', { className: 'ww-desk-excerpt' }, book.finished ? t('learningFinishedText') : chapter.excerpt),
              h('div', { className: 'ww-desk-track', 'aria-hidden': true }, h('i', { style: { width: `${percent}%` } })),
              h('div', { className: 'ww-desk-foot' },
                h('span', { className: 'ww-desk-book' }, h('strong', null, book.title), book.author && h('span', null, ` · ${book.author}`)),
                book.finished ? h('span', { className: 'ww-desk-go', 'aria-hidden': true }, t('learningFinishedSwap'))
                  : h('span', { className: 'ww-desk-go', 'aria-hidden': true }, h('span', { className: 'ww-desk-pct' }, `${percent}%`), h('span', { className: 'ww-desk-read' }, t('learningReadChapter', { index: chapter.index + 1 })))))),
          // “…”绝对定位在右上角；放在“接下来”之前，Tab 顺序是书卡、“…”、接下来三行、查看全部。
          deskMenu(book, single),
          single && h('div', { className: 'ww-desk-next' },
            book.next.length > 0 && h('p', { className: 'ww-desk-eyebrow' }, t('learningNext')),
            ...book.next.map(item => h('button', { type: 'button', key: item.index, className: 'ww-desk-next-row', disabled: busy, onClick: () => openChapter(book.id, item.index, 'start', { title: book.title }) },
              h('small', null, t('learningChapterShort', { index: item.index + 1 })), h('strong', null, item.title), h('small', null, t('learningMinutes', { minutes: minutes(item.chars) })))),
            h('button', { type: 'button', className: 'ww-desk-all', disabled: busy, onClick: () => openChapter(book.id, chapter.index, 'start', { title: book.title, toc: true }) }, t('learningAllChapters', { count: book.chapters }))),
          // 书房的味道靠书卡边缘的半透明点缀，卡片底本身跟随 DSH 与皮肤。
          h('i', { className: 'ww-orn-spine', 'aria-hidden': true }), h('i', { className: 'ww-orn-wave', 'aria-hidden': true }), h('i', { className: 'ww-whale', 'aria-hidden': true }));
      };
      // 零本常看：只放一张虚线占位卡，不出现任何真书；书架为空时进书架，焦点落在导入卡。
      const addDesk = learning => h('button', { type: 'button', className: 'ww-desk-add', disabled: busy, 'aria-label': learning.total ? t('learningAddPinLabel') : undefined, onClick: () => learning.total ? openPins(null) : openLibrary({ id: 'import' }) },
        h('span', { className: `ww-desk-ghosts${learning.total ? '' : ' ww-desk-ghost-one'}`, 'aria-hidden': true }, h('i'), learning.total > 0 && h('i'), h('b', null, '+')),
        h('span', { className: 'ww-desk-add-text' }, h('strong', null, t(learning.total ? 'learningAddPin' : 'learningEmptyTitle')), h('small', null, t(learning.total ? 'learningAddPinText' : 'learningEmptyText'))));
      // 书架读不出来时换成纸面提示卡，不显示占位卡，免得以为常看书没了。
      const desk = learning => {
        if (learning.issue) return h('div', { className: 'ww-desk' }, h('div', { className: 'ww-desk-issue', role: 'status' }, h('p', null, t('learningIssue', { reason: learning.issue })), button('learningReload', () => refreshTab())));
        const books = learning.books;
        return h('div', { className: `ww-desk${books.length > 1 ? ' ww-desk-pair' : ''}` }, books.length ? books.map(book => deskCard(book, books.length === 1)) : addDesk(learning));
      };
      // 近 14 天刻度：以首页日期为今天往前补齐空日；只做展示，不单独响应点击。
      const recentDays = learning => {
        const end = Date.parse(`${learning.date}T00:00:00Z`);
        return Array.from({ length: 14 }, (_, i) => { const date = new Date(end - (13 - i) * 86400000).toISOString().slice(0, 10), day = learning.tipRecent.find(item => item.date === date); return { date, count: day?.count ?? 0, partial: day?.status === 'partial' }; });
      };
      // AI 使用技巧卡整卡只有一个可点目标：进技巧历史并定位当天首页那条；领域停用时进卡片设置并打开它的编辑抽屉。
      const tipCard = learning => {
        const { tip, tipField: tips, date } = learning, name = tips?.name || t('learningTip'), off = Boolean(tips && !tips.enabled);
        const days = recentDays(learning), issued = days.filter(day => day.count > 0).length;
        return h('article', { className: 'ww-tile ww-tip-card', key: 'tip', ...pressable(off ? () => editTipSources() : () => openTips(tip ? { date: tip.date, index: tip.index } : null)),
          'aria-label': off ? `${t('learningTipDisabled', { name })}，${t('learningTipEnable')}` : t('learningTipLabel', { name, date: learningDate(tip?.date ?? date), title: tip?.title ?? t('learningTipWaiting'), count: issued }) },
          tileTop('spark', name, h('span', { className: 'ww-tile-badge ww-tip-date' }, shortDate(tip?.date ?? date))),
          h('h4', { className: 'ww-tile-title' }, off ? t('learningTipDisabled', { name }) : tip ? tip.title : t('learningTipWaiting')),
          !off && h('p', { className: 'ww-tile-text' }, tip ? tip.brief : t('learningTipEmpty')),
          !off && h('div', { className: 'ww-tip-strip', 'aria-hidden': true },
            h('span', { className: 'ww-tip-cells' }, ...days.map(day => h('i', { key: day.date, 'data-day': day.count > 0 ? day.partial ? 'partial' : 'issued' : 'none', 'data-today': day.date === date || undefined }))),
            h('small', null, t('learningTipRecent'))),
          h('div', { className: 'ww-tile-foot' },
            tip?.source && !off ? h('span', { className: 'ww-tile-source' }, h('span', { className: 'ww-tile-mono', style: { '--ww-mono': monoColor(tip.source) }, 'aria-hidden': true }, tip.source.trim().charAt(0).toUpperCase()), h('span', null, tip.source)) : h('span'),
            h('span', { className: 'ww-tip-more' }, off ? t('learningTipEnable') : `${t('learningTipMore')} →`)));
      };
      // 技巧领域删除后整张技巧卡不显示，书桌区变宽。
      const learningShelf = learning => {
        const withTip = Boolean(learning.tipField && !learning.tipField.deleted);
        const meta = learning.daily ? t('learningMeta', { daily: learning.daily, total: learning.total }) : learning.total ? t('learningNoPin', { total: learning.total }) : t('learningShelfEmpty');
        return h('section', { className: 'ww-shelf ww-learning' },
          shelfHead('book', t('newsLearning'), learningDate(learning.date), meta, [button('libraryOpen', () => openLibrary())]),
          h('div', { className: `ww-desk-row${withTip ? '' : ' ww-desk-solo'}` }, desk(learning), withTip && tipCard(learning)));
      };
      // 首屏读取超过 200ms 才显示骨架（样式里延迟淡入）；确认有书才出书卡，确认没有才出占位卡。
      const skeleton = () => h(React.Fragment, null,
        h('section', { className: 'ww-shelf ww-learning ww-skeleton', 'aria-hidden': true },
          h('div', { className: 'ww-desk-row' }, h('div', { className: 'ww-desk ww-desk-pair' }, ...[0, 1].map(i => h('div', { className: 'ww-desk-card ww-skel-paper', key: i }, h('i'), h('span', null, h('b'), h('b'), h('b'))))),
            h('div', { className: 'ww-tile ww-skel-tile' }, h('b'), h('b'), h('b')))),
        h('section', { className: 'ww-shelf ww-skeleton', 'aria-hidden': true }, h('div', { className: 'ww-shelf-grid ww-shelf-news' }, ...[0, 1, 2, 3].map(i => h('div', { className: 'ww-tile ww-skel-tile', key: i }, h('b'), h('b'))))));

      // —— 书架页 ——
      const progressText = book => book.progress.next >= book.chapters ? t('libraryDone') : book.progress.last > 0 || book.progress.next > 0 ? t('libraryProgress', { index: Math.max(book.progress.last, book.progress.next) + 1 }) : t('libraryUnread');
      const progressOf = book => book.progress.next >= book.chapters ? t('libraryDone') : book.progress.last > 0 || book.progress.next > 0 ? t('libraryProgressOf', { index: Math.max(book.progress.last, book.progress.next) + 1, count: book.chapters }) : t('libraryUnread');
      const percentOf = book => Math.round(readRatio(book) * 100);
      const openBook = book => openChapter(book.id, Math.min(book.chapters - 1, book.progress.next > book.progress.last ? book.progress.next : book.progress.last), 'start', { title: book.title });
      // 书架上按 Shift+F10 打开当前这本书的“…”菜单。
      const shelfPress = open => {
        const props = pressable(open);
        return { ...props, onKeyDown: event => {
          if (event.shiftKey && event.key === 'F10') { event.preventDefault(); event.currentTarget.parentElement?.querySelector('.ww-book-menu .ww-icon-button')?.click(); return; }
          props.onKeyDown(event);
        } };
      };
      const saveSort = value => { setSort(value); try { window.localStorage.setItem(sortKey, JSON.stringify(value)); } catch { /* 存不下就只在本次有效。 */ } };
      // 常看栏的进度说明带上当前章名；章名只在首页学习数据里有，对不上就不写。
      const pinLine = book => {
        const seen = newsHome?.learning.books.find(item => item.id === book.id)?.chapter, at = Math.max(book.progress.last, book.progress.next);
        return [progressOf(book), book.progress.next < book.chapters && seen?.index === at ? seen.title : ''].filter(Boolean).join(' · ');
      };
      // 常看栏：两个栏位，空位是虚线“＋ 设一本常看”；取消常看后栏位原位变空，不挤动下面的书格。
      const pinBand = pinned => h('section', { className: 'ww-pin-band', 'aria-label': t('libraryDailyBadge') },
        h('div', { className: 'ww-pin-label' }, h('p', null, t('libraryDailyBadge')), h('strong', null, t('libraryPinCount', { count: pinned.length })), h('small', null, t(['libraryPinBandNone', 'libraryPinBandOne', 'libraryPinBandText'][Math.min(pinned.length, pinLimit)]))),
        h('div', { className: 'ww-pin-slots' }, ...[0, 1].map(index => {
          const book = pinned[index];
          if (!book) return h('button', { type: 'button', key: `slot-${index}`, className: 'ww-pin-slot ww-pin-empty', disabled: busy, onClick: () => openPins(null) }, `＋ ${t('libraryPinSlot')}`);
          return h('div', { className: 'ww-pin-slot', key: book.id, style: accentOf(book.title) },
            h('div', { className: 'ww-pin-main', ...shelfPress(() => openBook(book)) }, h(BookCover, { load: loadImage, book, size: 's' }),
              h('span', { className: 'ww-pin-text' }, h('strong', null, book.title), h('small', null, book.author), h('small', { className: 'ww-pin-line' }, pinLine(book)),
                h('span', { className: 'ww-pin-track', 'aria-hidden': true }, h('i', null, h('b', { style: { width: `${percentOf(book)}%` } })), h('small', null, `${percentOf(book)}%`)))),
            bookMenu(book, button('librarySwap', () => openPins(book.id)), button('libraryUnpin', () => setPinned(book, false))));
        })));
      // 书格：点封面或书名打开上次读到的章；常看书挂书签丝带，书名下有“常看”小标记。
      const bookCard = book => h('article', { className: 'ww-library-book', key: book.id, title: book.title, 'data-book': book.id, 'data-flash': flash?.id === book.id || undefined, style: accentOf(book.title) },
        h('div', { className: 'ww-library-cover', ...shelfPress(() => openBook(book)), 'aria-label': book.title }, h(BookCover, { load: loadImage, book, size: 'm' }), book.daily && h('span', { className: 'ww-ribbon', 'aria-hidden': true })),
        h('div', { className: 'ww-library-meta' },
          h('div', { className: 'ww-library-name' }, h('h4', { onClick: () => openBook(book) }, book.title),
            bookMenu(book, button('libraryRead', () => openBook(book)), button(book.daily ? 'libraryUnpin' : 'libraryPin', () => setPinned(book, !book.daily)), button('libraryEdit', () => editBook(book)), button('libraryRemove', () => setConfirm({ kind: 'bookRemove', book })))),
          book.author && h('small', { className: 'ww-library-author' }, book.author),
          h('small', { className: 'ww-muted' }, [book.format, t('libraryChapters', { count: book.chapters }), progressText(book)].join(' · ')),
          book.daily && h('span', { className: 'ww-pin-badge' }, h(Glyph, { name: 'bookmark', size: 10 }), t('libraryDailyBadge'))));
      const addCard = () => h('button', { type: 'button', className: 'ww-library-add', disabled: busy, 'data-importing': importing ? true : undefined, onClick: () => fileInput.current?.click(), key: 'add' },
        h('span', { className: 'ww-add-mark', 'aria-hidden': true }, '+'),
        h('strong', null, importing ? t(importing.parsing ? 'libraryParsing' : 'libraryImporting', { name: importing.name, percent: importing.percent ?? 0 }) : t('libraryImport')),
        h('small', { className: 'ww-muted' }, importing ? (importing.count > 1 ? t('libraryImportCount', { index: importing.index + 1, count: importing.count }) : '') : t('libraryImportHelp')),
        importing && h('i', { className: 'ww-library-add-bar', style: { width: `${importing.parsing ? 100 : importing.percent ?? 0}%` }, 'aria-hidden': true }));
      // 头行一行排开：面包屑、分组小片、管理分组、查找、在线书目、排序字段和方向；宽度不够才换行。
      const libraryView = () => {
        const current = library.groups.some(group => group.id === libraryGroup) ? libraryGroup : 'all', needle = query.trim().toLowerCase();
        const books = sortShelf(library.books.filter(book => (current === 'all' || book.groups.includes(current)) && matches(book, needle)), sort);
        const chip = (id, label, count) => h('button', { type: 'button', key: id, className: 'ww-library-chip', 'aria-pressed': current === id, onClick: () => setLibraryGroup(id) }, label, h('small', null, count));
        const direction = t(`librarySort_${sort.field}_${sort.dir}`);
        return h('section', { className: 'ww-library' },
          h('div', { className: 'ww-library-head' },
            h('nav', { className: 'ww-crumbs', 'aria-label': t('library') }, h('button', { type: 'button', className: 'ww-crumb', disabled: busy, onClick: closeLibrary }, t('news')), h('span', { 'aria-hidden': true }, '›'), h('h2', null, t('library')), h('small', null, library.books.length)),
            h('div', { className: 'ww-library-chips', role: 'group', 'aria-label': t('libraryBookGroups') }, chip('all', t('libraryAll'), library.books.length), ...library.groups.map(group => chip(group.id, group.name, library.books.filter(book => book.groups.includes(group.id)).length))),
            h('button', { type: 'button', className: 'ww-icon-button', title: t('libraryGroups'), 'aria-label': t('libraryGroups'), disabled: busy, onClick: () => setGroupDrawer({ name: '', rename: null }) }, h(Glyph, { name: 'gear' })),
            h('div', { className: 'ww-shelf-tools' },
              h('label', { className: 'ww-library-search' }, h(Glyph, { name: 'search', size: 14 }),
                h('input', { ref: search, type: 'search', value: query, placeholder: t('librarySearch'), 'aria-label': t('librarySearch'), onChange: event => setQuery(event.target.value), onKeyDown: event => { if (event.key === 'Escape' && query) { event.preventDefault(); setQuery(''); } } }),
                h('kbd', { 'aria-hidden': true }, '/')),
              button('libraryCatalog', openCatalog),
              h('select', { className: 'ww-library-sort', value: sort.field, 'aria-label': t('librarySort'), onChange: event => saveSort({ field: event.target.value, dir: sortDefaults[event.target.value] }) }, ...Object.keys(sortDefaults).map(field => h('option', { key: field, value: field }, t(`librarySort_${field}`)))),
              h('button', { type: 'button', className: 'ww-library-dir', title: direction, 'aria-label': direction, onClick: () => saveSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' }) }, sort.dir === 'asc' ? '↑' : '↓'))),
          pinBand(library.books.filter(book => book.daily)),
          h('input', { ref: fileInput, type: 'file', multiple: true, hidden: true, accept: bookExtensions.map(extension => `.${extension}`).join(','), onChange: event => { const files = [...event.target.files]; event.target.value = ''; return files.length ? importFiles(files) : undefined; } }),
          needle && !books.length && h('p', { className: 'ww-library-none' }, t('libraryNoMatch', { query: query.trim() }), h('button', { type: 'button', className: 'ww-text-button', onClick: () => setQuery('') }, t('libraryClearSearch'))),
          h('div', { className: 'ww-library-grid' }, ...books.map(bookCard), addCard()),
          !needle && !books.length && help(library.books.length ? 'libraryGroupEmpty' : 'libraryEmpty'));
      };
      const chapterBody = () => {
        const { book, toc, chapter } = reading, last = chapter.index === toc.length - 1;
        const render = createMarkdown(h, { image: (node, index) => h(BookImage, { key: index, load: loadImage, id: book.id, name: node.url, alt: node.value, t }) });
        return h('section', { className: 'ww-book-read', key: chapter.index },
          h('div', { className: 'ww-rendered', lang: book.language || undefined }, render(chapter.view)),
          h('footer', { className: 'ww-book-colophon' },
            h('p', { className: 'ww-book-end', 'aria-hidden': true }, '—  ', t(last ? 'libraryBookEnd' : 'libraryChapterEnd'), '  —'),
            !last && h('button', { type: 'button', className: 'ww-book-next-chapter', onClick: () => openChapter(book.id, chapter.index + 1, 'start', { title: book.title }) }, t('libraryChapterNext'), '：', toc[chapter.index + 1].title),
            !last && h('small', { className: 'ww-book-scroll-hint' }, t('libraryScrollNext')),
            last && book.source.kind === 'catalog' && h(React.Fragment, null, h('h3', null, t('learningSource')), book.source.attribution && h('p', null, book.source.attribution), h('p', null, externalLink(book.source.licenseUrl, book.source.license)))));
      };
      const newsItemView = ({ item, index, total, fieldName }) => h(Modal, { title: item.title, onClose: () => setNewsItem(null) },
        h('div', { className: 'ww-brief-detail', style: { '--ww-accent': accent(item) } },
          h('div', { className: 'ww-brief-meta' }, tileTop(newsIcons[item.category] ?? 'news', newsKicker(item), newsFlag(item), h('span', { className: 'ww-muted' }, fieldName, ' · ', `${index + 1} / ${total}`))),
          item.brief !== undefined
            ? h(React.Fragment, null, h('p', { className: 'ww-brief-lead' }, item.brief), item.relevance && h('section', null, h('h3', null, t('newsRelevance')), h('p', null, item.relevance)))
            : h(React.Fragment, null, h('p', { className: 'ww-brief-lead' }, item.summary), h('section', null, h('h3', null, t('newsImportance')), h('p', null, item.importance)), h('section', null, h('h3', null, t('newsRelevance')), h('p', null, item.relevance)), h('section', null, h('h3', null, t('newsImpact')), h('p', null, item.workImpact))),
          h('footer', { className: 'ww-brief-sources' },
            item.link && h('p', null, h('strong', null, t('newsViewSource')), externalLink(item.link, item.link.replace(/^https:\/\/(www\.)?/, ''))),
            h('h3', null, t('newsSourcesTitle')),
            h('ul', null, ...item.sources.map(source => h('li', { key: source.id }, externalLink(source.url, source.source.name), h('small', { className: 'ww-muted' }, ' · ', beijing(source.publishedAt))))))));
      const newsRunView = report => h(Modal, { title: `${report.fieldName} · ${t('newsDiagnostics')}`, onClose: () => setNewsRun(null) },
        h('div', { className: 'ww-brief-detail' }, h('p', null, t('newsWindow'), ' · ', beijing(report.start), ' — ', beijing(report.cutoff)), h('p', null, report.coverage),
          ...report.sourceStatus.filter(source => source.status === 'failed').map(source => h('p', { key: source.url, className: 'ww-error' }, source.name, ' · ', source.message)),
          button('newsOpenSession', () => run(async () => api.openAutomation(report.sessionId)))));
      // 选择常看书籍（S4c）：最多勾两本；查找和分组只过滤显示，已勾的书被过滤掉也保持勾选；顺序与书架默认一致（最近加入在前）。
      const pinDrawerView = () => {
        const drawer = pinDrawer, cancel = button('cancel', closePins, false, { key: 'cancel' });
        if (drawer.error || !library) return h(Drawer, { title: t('libraryPinsTitle'), busy, onClose: closePins, footer: [cancel] },
          h('div', { className: 'ww-pin-error', role: 'alert' }, h('p', null, t('libraryReadFailed')), button('learningReload', () => { setPinDrawer(null); openPins(drawer.focus); })));
        const group = library.groups.some(item => item.id === drawer.group) ? drawer.group : 'all', needle = drawer.query.trim().toLowerCase(), full = drawer.selected.length >= pinLimit;
        const rows = sortShelf(library.books.filter(book => (group === 'all' || book.groups.includes(group)) && matches(book, needle)), { field: 'added', dir: 'desc' });
        const chip = (id, label, count) => h('button', { type: 'button', key: id, className: 'ww-library-chip', 'aria-pressed': group === id, onClick: () => setPinDrawer(value => ({ ...value, group: id })) }, label, h('small', null, count));
        // 列表内 ↑/↓ 在复选框之间移动，空格勾选。
        const moveFocus = event => {
          const step = { ArrowDown: 1, ArrowUp: -1 }[event.key], boxes = step ? [...event.currentTarget.querySelectorAll('input:not(:disabled)')] : [], at = boxes.indexOf(event.target);
          if (at < 0) return;
          event.preventDefault(); boxes[Math.max(0, Math.min(boxes.length - 1, at + step))].focus();
        };
        return h(Drawer, { title: t('libraryPinsTitle'), busy, onClose: closePins, footer: [cancel, button('libraryPinsSave', savePinDrawer, !pinsChanged(drawer), { key: 'save', className: 'ww-primary' })] },
          h('div', { className: 'ww-pin-drawer' },
            help('libraryPinsHelp'),
            h('label', { className: 'ww-library-search' }, h(Glyph, { name: 'search', size: 14 }), h('input', { ref: drawer.focus ? undefined : pinFocus, type: 'search', value: drawer.query, placeholder: t('librarySearch'), 'aria-label': t('librarySearch'), onChange: event => setPinDrawer(value => ({ ...value, query: event.target.value })) })),
            h('div', { className: 'ww-library-chips', role: 'group', 'aria-label': t('libraryBookGroups') }, chip('all', t('libraryAll'), library.books.length), ...library.groups.map(item => chip(item.id, item.name, library.books.filter(book => book.groups.includes(item.id)).length))),
            // 选满时把“为什么其余不能勾”写进状态行，键盘和读屏也拿得到，不只靠悬停提示。
            h('p', { className: 'ww-pin-count', role: 'status' }, t('libraryPinsSelected', { count: drawer.selected.length }), full && h('small', null, ` · ${t('libraryPinsFull')}`)),
            rows.length ? h('ul', { className: 'ww-pin-list', onKeyDown: moveFocus }, ...rows.map(book => {
              const on = drawer.selected.includes(book.id), locked = full && !on;
              return h('li', { key: book.id, className: 'ww-pin-row', 'data-on': on || undefined, 'data-locked': locked || undefined, title: locked ? t('libraryPinsFull') : undefined, style: accentOf(book.title) },
                h('label', null, h(BookCover, { load: loadImage, book, size: 'xxs' }),
                  h('span', { className: 'ww-pin-row-text' }, h('strong', null, book.title), h('small', null, [book.author, book.format, progressOf(book)].filter(Boolean).join(' · '))),
                  h('input', { type: 'checkbox', ref: drawer.focus === book.id ? pinFocus : undefined, checked: on, disabled: busy || locked, onChange: () => togglePin(book.id) })));
            })) : h('p', { className: 'ww-muted' }, t('libraryNoMatch', { query: drawer.query.trim() }))));
      };
      // 常看已满时设第三本（S4b）：不预选；选中一张卡后主按钮写明换下哪本。←/→ 或 ↑/↓ 切换，空格选中，选中后 Enter 等于点主按钮。
      const replaceView = () => {
        const pinned = library.books.filter(book => book.daily), chosen = pinned.find(book => book.id === replace.choice);
        const keys = event => {
          if (event.key === 'Enter' && chosen) { event.preventDefault(); replacePin(); return; }
          const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key], cards = step ? [...event.currentTarget.querySelectorAll('[role=radio]')] : [], at = cards.indexOf(event.target);
          if (at < 0) return;
          event.preventDefault(); cards[(at + step + cards.length) % cards.length].focus();
        };
        return h(Modal, { title: t('libraryPinFullTitle'), busy, onClose: () => setReplace(null), className: 'ww-confirm ww-pin-replace' },
          h('div', { className: 'ww-confirm-body' }, h('p', null, t('libraryPinFullText', { title: replace.book.title })),
            h('div', { className: 'ww-pin-choices', role: 'radiogroup', 'aria-label': t('libraryPinChoose'), onKeyDown: keys }, ...pinned.map((book, index) => h('button', { type: 'button', role: 'radio', key: book.id, ref: index === 0 ? replaceFocus : undefined, className: 'ww-pin-choice', 'aria-checked': replace.choice === book.id, tabIndex: (chosen ? chosen.id === book.id : index === 0) ? 0 : -1, disabled: busy, style: accentOf(book.title), onClick: () => setReplace(value => value && { ...value, choice: book.id }) },
              h(BookCover, { load: loadImage, book, size: 'xs' }), h('span', null, h('strong', null, book.title), h('small', null, progressOf(book))), h('i', { className: 'ww-radio', 'aria-hidden': true }))))),
          h('footer', { className: 'ww-dialog-actions' }, button('cancel', () => setReplace(null)),
            h('button', { type: 'button', className: 'ww-primary', disabled: busy || !chosen, onClick: () => replacePin() }, busy && h('span', { className: 'ww-spinner', 'aria-hidden': true }), chosen ? t('libraryPinReplace', { title: chosen.title }) : t('libraryPinChoose'))));
      };
      // 页头摘要：书架几本、常看几本，今天的资讯有几条（今天 08:00 那期还没出就说尚未生成），再说哪里有问题。
      // 今天那期的截点是北京时间今天 08:00，正好是 UTC 当天 0 点，所以截点的日期和首页日期相同；更早的一期不算今天的。
      const homeSummary = home => {
        if (!home) return t('cardsSummaryLoading');
        const { learning } = home, today = home.reports.filter(report => report.cutoff.slice(0, 10) === learning.date);
        const items = today.reduce((sum, report) => sum + Math.min(report.items.length, 8), 0), missing = learning.books.filter(book => book.missing || !book.chapter).length, partial = today.filter(report => report.status === 'partial').length;
        return [
          learning.issue ? t('cardsSummaryShelfIssue') : learning.total ? t('cardsSummaryShelf', { total: learning.total, daily: learning.daily }) : t('learningShelfEmpty'),
          !today.length ? t('newsReportEmpty') : items ? t('cardsSummaryNews', { count: items }) : t('cardsSummaryNewsNone'),
          missing > 0 && t('cardsSummaryMissing', { count: missing }),
          partial > 0 && t('cardsSummaryPartial', { count: partial }),
        ].filter(Boolean).join(' · ');
      };
      // AI 使用技巧领域的历史日报就是技巧历史页。
      const fieldReports = field => field.id === 'ai-tips' ? openTips(null) : readNewsHistory(field);
      const viewing = page === 'tips' ? 'tips' : page === 'library' && library ? 'library' : newsSettings ? 'settings' : 'home';
      body = h('section', { ref: root, className: `ww-news ww-cards${serifOff ? ' ww-serif-off' : ''}` },
        viewing === 'home' && h(React.Fragment, null,
          h('header', { className: 'ww-news-header ww-pagehead' }, h('div', null, h('h2', null, t('news')), h('p', null, homeSummary(newsHome))), h('div', { className: 'ww-pagehead-actions' }, button('newsSettings', openNewsSettings))),
          newsHome ? h(React.Fragment, null,
            learningShelf(newsHome.learning),
            newsHome.reports.length ? newsHome.reports.map(reportView) : h('section', { className: 'ww-shelf' }, shelfHead('news', t('newsDaily'), t('newsReportEmpty')))) : busy && skeleton()),
        viewing === 'library' && libraryView(),
        viewing === 'tips' && h(TipsPage, { api, t, run, busy, setError, notify, field: newsHome ? newsHome.learning.tipField : undefined, focus: tipFocus, onFocusApplied: () => setTipFocus(null), externalLink, onBack: backFromTips, onEditSources: () => editTipSources(), reloadKey: tipsKey }),
        viewing === 'settings' && h('header', { className: 'ww-news-header ww-pagehead' }, h('h2', null, t('newsSettings')), h('div', { className: 'ww-pagehead-actions' }, button('newsSettingsClose', closeNewsSettings))),
        viewing === 'settings' && newsData && h('section', { className: 'ww-news-settings' },
          h('div', { className: 'ww-news-toolbar' }, button('newsConfigureSchedule', () => { return workbench.openTab('automation'); }), button('newsSources', () => setNewsAbout(true))),
          h('div', { className: 'ww-grid' }, ...newsData.fields.map(field => h('article', { className: 'ww-card ww-news-field', key: field.id },
            h('div', { className: 'ww-card-top' }, h('div', { className: 'ww-card-identity' }, h('h2', null, field.name), !field.enabled && h('small', { className: 'ww-muted' }, t('taskPaused'))),
              h(ActionMenu, { label: `${field.name} · ${t('newsEdit')}`, iconOnly: true }, button('newsEdit', () => editNews(field), Boolean(newsEditor)), button('newsReports', () => fieldReports(field)),
                field.id !== 'ai-technology' && button('newsRemove', () => { const input = { action: 'remove', id: field.id, expectedRevision: field.revision }; setConfirm({ kind: 'newsChange', input, last: closesNews(input) }); }, Boolean(newsEditor)))),
            h('p', { className: 'ww-clamp', title: field.focus }, field.focus),
            newsData.errors[field.id] && h('small', { className: 'ww-error', title: newsData.errors[field.id].message }, t('newsDiagnostics'), '：', newsData.errors[field.id].message),
            button('newsCurrent', () => readNewsReport(field.id, newsData.window.cutoff, field.name), false, { className: 'ww-card-start' }))),
            newsData.fields.length < newsData.limits.maxFields && h('button', { type: 'button', className: 'ww-card ww-add-card', disabled: Boolean(newsEditor), onClick: () => editNews(null) }, h('span', { className: 'ww-add-mark', 'aria-hidden': true }, '+'), h('h2', null, t('newsAdd')))),
          newsData.historyFields.length > 0 && h('details', { className: 'ww-section' }, h('summary', null, t('newsHistoryFields')), ...newsData.historyFields.map(field => h('div', { key: field.id, className: 'ww-row' }, h('span', null, field.name), field.deleted && h('small', null, t('newsDeletedField')), button('newsReports', () => fieldReports(field)))))),
        newsAbout && newsData && h(Modal, { title: t('newsSources'), onClose: () => setNewsAbout(false), className: 'ww-confirm' }, h('div', { className: 'ww-confirm-body' }, help('newsHelp'), help('newsStartHelp'), h('p', null, newsData.dependencies.model)), h('footer', { className: 'ww-dialog-actions' }, button('closePanel', () => setNewsAbout(false), false, { className: 'ww-primary' }))),
        newsSettings && newsEditor && h(Drawer, { title: t(newsData?.fields.some(field => field.id === newsEditor.id) ? 'newsEdit' : 'newsAdd'), busy, onClose: closeNews,
          footer: [button('cancel', closeNews, false, { key: 'cancel' }), newsData?.fields.some(field => field.id === newsEditor.id) && button('newsConflictReload', reloadNewsEditor, false, { key: 'reload' }), button(newsData?.fields.some(field => field.id === newsEditor.id) ? 'newsSaveChanges' : 'newsCreate', saveNews, !newsEditor.field.name.trim() || !newsEditor.field.focus.trim() || !newsEditor.field.sources.length, { key: 'save', className: 'ww-primary' })] },
          h('fieldset', { className: 'ww-news-form', disabled: busy || confirm?.kind === 'newsChange' },
            field('newsName', newsEditor.field.name, value => patchNews('name', value)),
            h('label', { className: 'ww-field' }, t('newsFocus'), h('textarea', { value: newsEditor.field.focus, disabled: busy, onChange: event => patchNews('focus', event.target.value) })),
            h('label', { className: 'ww-choice' }, h('input', { type: 'checkbox', checked: newsEditor.field.enabled, disabled: busy, onChange: event => patchNews('enabled', event.target.checked) }), t('newsEnabled')),
            h('h3', null, t('newsSources')), help('newsSourceHelp'),
            ...choices.map(source => h('label', { key: source.url, className: 'ww-choice' }, h('input', { type: 'checkbox', checked: newsEditor.field.sources.some(item => item.url === source.url), disabled: busy || newsEditor.field.sources.length >= 10 && !newsEditor.field.sources.some(item => item.url === source.url), onChange: () => toggleSource(source) }), source.name, ' · ', source.url)),
            h('details', null, h('summary', null, t('newsSourceAdd')),
              field('newsSourceName', newsSource.name, value => setNewsSource(source => ({ ...source, name: value }))), field('newsSourceUrl', newsSource.url, value => setNewsSource(source => ({ ...source, url: value })), { type: 'url' }),
              ...[['kind', 'newsSourceKind', ['primary', 'newsPrimary'], ['media', 'newsMedia']], ['region', 'newsSourceRegion', ['domestic', 'newsDomestic'], ['overseas', 'newsOverseas']]].map(([key, label, ...options]) => h('label', { className: 'ww-field', key }, t(label), h('select', { value: newsSource[key], disabled: busy, onChange: event => setNewsSource(source => ({ ...source, [key]: event.target.value })) }, h('option', { value: '' }, t('newsSourceChoose')), ...options.map(([value, text]) => h('option', { value, key: value }, t(text)))))),
              button('newsSourceAdd', () => { patchNews('sources', [...newsEditor.field.sources, { ...newsSource }]); setNewsSource({ name: '', url: '', kind: '', region: '' }); }, !newsSource.name.trim() || !newsSource.url.trim() || !newsSource.kind || !newsSource.region || newsEditor.field.sources.length >= 10 || newsEditor.field.sources.some(source => source.url === newsSource.url))))),
        library && bookEditor && h(Drawer, { title: t('libraryEditTitle'), busy, onClose: () => bookChanged(bookEditor) ? setConfirm({ kind: 'bookDraft' }) : setBookEditor(null),
          footer: [button('cancel', () => bookChanged(bookEditor) ? setConfirm({ kind: 'bookDraft' }) : setBookEditor(null), false, { key: 'cancel' }), button('librarySave', saveBook, !bookEditor.title.trim() || !bookChanged(bookEditor), { key: 'save', className: 'ww-primary' })] },
          h('fieldset', { className: 'ww-news-form', disabled: busy },
            field('libraryTitle', bookEditor.title, value => setBookEditor(editor => ({ ...editor, title: value })), { maxLength: 200 }),
            field('libraryAuthor', bookEditor.author, value => setBookEditor(editor => ({ ...editor, author: value })), { maxLength: 200 }),
            h('h3', null, t('libraryBookGroups')),
            library.groups.length ? library.groups.map(group => h('label', { key: group.id, className: 'ww-choice' }, h('input', { type: 'checkbox', checked: bookEditor.groups.includes(group.id), disabled: busy, onChange: event => setBookEditor(editor => ({ ...editor, groups: event.target.checked ? [...editor.groups, group.id] : editor.groups.filter(id => id !== group.id) })) }), group.name)) : help('libraryNoGroups'),
            h('p', { className: 'ww-muted' }, bookEditor.original.source.kind === 'catalog' ? t('librarySourceCatalog', { license: bookEditor.original.source.license }) : t('librarySourceImport', { name: bookEditor.original.source.filename }), ' · ', megabytes(bookEditor.original.size)))),
        library && groupDrawer && h(Drawer, { title: t('libraryGroups'), busy, onClose: closeGroups, footer: [button('closePanel', closeGroups, false, { key: 'close' })] },
          help('libraryGroupsHelp'),
          h('div', { className: 'ww-library-groups' }, ...library.groups.map(group => h('div', { key: group.id, className: 'ww-library-group' },
            groupDrawer.rename?.id === group.id
              ? h(React.Fragment, null,
                h('input', { value: groupDrawer.rename.name, maxLength: 30, 'aria-label': t('libraryGroupName'), disabled: busy, autoFocus: true, onChange: event => setGroupDrawer(drawer => ({ ...drawer, rename: { ...drawer.rename, name: event.target.value } })) }),
                button('libraryGroupSave', () => saveGroup({ id: group.id, name: groupDrawer.rename.name.trim() }), !groupDrawer.rename.name.trim() || groupDrawer.rename.name.trim() === group.name, { className: 'ww-primary' }),
                button('cancel', () => setGroupDrawer(drawer => ({ ...drawer, rename: null }))))
              : h(React.Fragment, null,
                h('span', { className: 'ww-library-group-name' }, group.name, h('small', { className: 'ww-muted' }, t('libraryGroupCount', { count: library.books.filter(book => book.groups.includes(group.id)).length }))),
                button('libraryGroupRename', () => setGroupDrawer(drawer => ({ ...drawer, rename: { id: group.id, name: group.name } }))),
                button('libraryGroupRemove', () => setConfirm({ kind: 'groupRemove', group })))))),
          h('div', { className: 'ww-library-group-add' }, field('libraryGroupName', groupDrawer.name, value => setGroupDrawer(drawer => ({ ...drawer, name: value })), { maxLength: 30 }),
            button('libraryGroupAdd', () => saveGroup({ name: groupDrawer.name.trim() }), !groupDrawer.name.trim() || library.groups.length >= 100, { className: 'ww-primary' }))),
        catalog && h(Modal, { title: t('libraryCatalog'), onClose: () => setCatalog(null) },
          h('div', { className: 'ww-catalog' }, help('libraryCatalogHelp'),
            catalog.error && h('p', { className: 'ww-notice', role: 'status' }, catalog.error),
            catalog.entries.length ? h('ul', { className: 'ww-catalog-list' }, ...catalog.entries.map(entry => h('li', { key: entry.id },
              h('div', { className: 'ww-catalog-info' }, h('strong', null, entry.title),
                h('small', { className: 'ww-muted' }, [entry.author, entry.category, entry.format, megabytes(entry.size)].filter(Boolean).join(' · ')),
                entry.description && h('p', null, entry.description),
                h('small', null, t('libraryLicense'), '：', externalLink(entry.licenseUrl, entry.license))),
              entry.installed ? h('span', { className: 'ww-tile-badge' }, t('libraryInstalled')) : button('libraryDownload', () => download(entry))))) : !catalog.error && help('libraryCatalogEmpty'),
            catalog.fetchedAt && h('small', { className: 'ww-muted' }, t('libraryFetchedAt', { time: beijing(catalog.fetchedAt).slice(0, 16) })))),
        reading && h(BookReader, { key: reading.book.id, bookId: reading.book.id, title: reading.book.title, accent: monoColor(reading.book.title), t, chapters: reading.toc, current: reading.chapter.index, anchor: reading.anchor, initialToc: reading.showToc, onClose: closeReader,
          onChapter: (index, anchor) => openChapter(reading.book.id, index, anchor, { title: reading.book.title }), onEnd: index => finishChapter(reading.book.id, index) }, chapterBody()),
        pinDrawer && pinDrawerView(),
        replace && library && replaceView(),
        confirm?.kind === 'pinDraft' && h(ConfirmDialog, { title: t('libraryDiscardTitle'), message: t('libraryPinsDiscardHelp'), confirmLabel: t('libraryDiscard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setPinDrawer(null); setConfirm(null); } }),
        confirm?.kind === 'newsChange' && h(ConfirmDialog, { title: t(confirm.input.action === 'remove' ? 'newsRemoveTitle' : 'newsConfirm'), message: t(confirm.last ? 'newsLastHelp' : 'newsRemoveHelp'), confirmLabel: t('newsConfirm'), cancelLabel: t('cancel'), danger: confirm.input.action === 'remove', busy, onCancel: () => setConfirm(null), onConfirm: () => persistNews({ ...confirm.input, ...(confirm.last ? { confirmCancel: true } : {}) }) }),
        confirm?.kind === 'newsDraft' && h(ConfirmDialog, { title: t('newsDiscardTitle'), message: t('newsDiscardHelp'), confirmLabel: t('newsDiscard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setNewsEditor(null); setConfirm(null); notify(t('draftDiscarded')); } }),
        confirm?.kind === 'groupDraft' && h(ConfirmDialog, { title: t('libraryDiscardTitle'), message: t('libraryGroupsDiscardHelp'), confirmLabel: t('libraryDiscard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setGroupDrawer(null); setConfirm(null); } }),
        confirm?.kind === 'bookDraft' && h(ConfirmDialog, { title: t('libraryDiscardTitle'), message: t('libraryDiscardHelp'), confirmLabel: t('libraryDiscard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setBookEditor(null); setConfirm(null); } }),
        confirm?.kind === 'bookRemove' && h(ConfirmDialog, { title: t('libraryRemoveTitle'), message: t('libraryRemoveHelp', { title: confirm.book.title }) + (confirm.book.daily ? t('libraryRemoveHelpPinned') : ''), confirmLabel: t('libraryRemove'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => removeBook(confirm.book) }),
        confirm?.kind === 'groupRemove' && h(ConfirmDialog, { title: t('libraryGroupRemoveTitle'), message: t('libraryGroupRemoveHelp', { name: confirm.group.name }), confirmLabel: t('libraryGroupRemove'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => removeGroup(confirm.group) }),
        newsHistory && h(Modal, { title: `${newsHistory.field.name} · ${t('newsReports')}`, onClose: () => setNewsHistory(null) }, newsHistory.field.deleted && help('newsDeletedField'),
          h('div', { className: 'ww-news-history' }, newsHistory.reports.length ? newsHistory.reports.map(report => h('button', { type: 'button', key: report.cutoff, disabled: busy, onClick: () => readNewsReport(report.fieldId, report.cutoff, report.fieldName) }, beijing(report.cutoff))) : help('newsHistoryEmpty')),
          newsHistory.nextBefore && button('newsHistoryOlder', () => readNewsHistory(newsHistory.field, newsHistory.nextBefore))),
        newsReport && h(Modal, { title: t('newsReports'), onClose: () => setNewsReport(null) }, newsReport.report ? reportView(newsReport.report) : help('newsReportEmpty')),
        newsItem && newsItemView(newsItem), newsRun && newsRunView(newsRun));


    return active ? body : null;
  };
}

export const name = 'whalewing-cards';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'cards', createView, { contract: newsContract, namespace: 'whalewingCards', entries: (scope, kit, api) => scope.effect(api.connectSchedule) }); }
