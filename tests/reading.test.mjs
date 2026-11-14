import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { z } from 'zod';
import { newsContract, newsMeLimit, readingLimits } from '../features/cards/contract.js';
import { News, newsDomain } from '../features/cards/news.js';
import { Reading, readingDefaults, dueDate, dueToday, moreToReview, lastWeekRange, captureNote, captureNoteName, bookNote, bookNotePath, aboutText, aboutMePath, beijingDay } from '../features/cards/library/reading.js';
import { validateNote } from '../src/vault.js';

const contract = newsContract(z);
const hash = text => createHash('sha256').update(text).digest('hex');
const bookId = '11111111-1111-4111-8111-111111111111', otherBook = '22222222-2222-4222-8222-222222222222';
const fresh = (extra = {}) => ({ book: bookId, bookTitle: '把话说短', chapter: 3, chapterTitle: '先说结论', text: '结论是一句能单独成立的话。', before: '二、结论怎么写', ...extra });

/** 一套临时目录里的 Reading，知识库用内存里的假件：写入照真知识库的规则校验，指纹对不上报 CONFLICT。 */
async function setup(t, { now = '2026-11-14T02:00:00Z' } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-reading-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const vault = new Map(), writes = [];
  let clock = Date.parse(now), failWrite = null;
  const knowledge = {
    read: async relative => vault.has(relative) ? { content: vault.get(relative), hash: hash(vault.get(relative)) } : null,
    write: async (relative, content, expected) => {
      if (failWrite) { const error = failWrite; failWrite = null; throw error; }
      const current = vault.get(relative);
      if ((current === undefined ? '' : hash(current)) !== expected) throw Object.assign(new Error('CONFLICT: 笔记已变化'), { code: 'CONFLICT' });
      validateNote(content, relative);
      vault.set(relative, content); writes.push(relative);
      return { path: relative, hash: hash(content) };
    },
    peek: async relative => vault.has(relative) ? { content: vault.get(relative) } : null,
  };
  const reading = new Reading({ directory: async () => directory, knowledge, validate: { state: value => contract.reading.state.parse(value) }, now: () => clock });
  const call = input => { const { action, ...rest } = contract.reading.manage.parse(input); return reading[action](rest).then(value => contract.reading.result.parse(value)); };
  return { reading, call, vault, writes, directory, file: path.join(directory, 'whalewing-library', 'reading.json'), setNow: value => { clock = Date.parse(value); }, failNextWrite: error => { failWrite = error; } };
}

test('还没用过时：开关是默认值（读《关于我》、不带日记、放鲸翼的用法、出上周回顾、每天回顾 2 条），没有划线也没有存过的', async t => {
  const h = await setup(t);
  const { home } = await h.call({ action: 'home' });
  assert.deepEqual(home.settings, { personal: true, diary: false, usage: true, weekly: true, review: 2 });
  assert.deepEqual(home.settings, { ...readingDefaults });
  assert.equal(home.date, '2026-11-14');
  assert.deepEqual([home.review, home.byBook, home.counts, home.captures], [[], {}, { highlights: 0, captures: 0 }, []]);
});

test('改开关马上存下；“按我的情况来挑”关了，带日记那一项跟着关；每天回顾只收 0、2、3', async t => {
  const h = await setup(t);
  assert.deepEqual((await h.call({ action: 'settings', settings: { ...readingDefaults, diary: true, review: 3 } })).settings, { ...readingDefaults, diary: true, review: 3 });
  assert.equal((await h.call({ action: 'home' })).home.settings.review, 3);
  assert.equal((await h.call({ action: 'settings', settings: { ...readingDefaults, personal: false, diary: true } })).settings.diary, false);
  assert.throws(() => contract.reading.manage.parse({ action: 'settings', settings: { ...readingDefaults, review: 1 } }));
});

test('划线只存在本机记录里：按书列出、首页算出每本几条；不写知识库', async t => {
  const h = await setup(t);
  const { highlight } = await h.call({ action: 'highlight', ...fresh() });
  await h.call({ action: 'highlight', ...fresh({ book: otherBook, bookTitle: '交付这件事', chapter: 0, text: '延期是从第一次没人问进度那天开始的。', before: '' }) });
  assert.equal(highlight.note, ''); assert.deepEqual(highlight.seen, []);
  assert.deepEqual((await h.call({ action: 'highlights', book: bookId })).highlights.map(item => item.id), [highlight.id]);
  const { home } = await h.call({ action: 'home' });
  assert.deepEqual(home.byBook, { [bookId]: 1, [otherBook]: 1 });
  assert.equal(home.counts.highlights, 2);
  assert.equal(h.writes.length, 0, '划的原文不进知识库');
  assert.match(await readFile(h.file, 'utf8'), /结论是一句能单独成立的话/);
});

test('反例：一次划线超过 300 字、只有一个字都不收', async t => {
  const h = await setup(t);
  assert.throws(() => contract.reading.manage.parse({ action: 'highlight', ...fresh({ text: '字'.repeat(readingLimits.text + 1) }) }));
  assert.throws(() => contract.reading.manage.parse({ action: 'highlight', ...fresh({ text: ' 字 ' }) }));
  assert.equal((await h.call({ action: 'home' })).home.counts.highlights, 0);
});

test('员工写的那句话：没有来源笔记时照“书籍来源”模板建一篇并记进“我的理解与批注”，再写一句接着追加；原文不进笔记', async t => {
  const h = await setup(t);
  const { highlight } = await h.call({ action: 'highlight', ...fresh() });
  const first = await h.call({ action: 'note', id: highlight.id, note: '写不出结论就先别写汇报' });
  assert.deepEqual(first.note, { path: '50-来源/书籍/书籍 - 把话说短.md', created: true });
  assert.equal(first.highlight.note, '写不出结论就先别写汇报');
  const note = h.vault.get(first.note.path);
  assert.equal(validateNote(note, first.note.path).status, 'reading');
  assert.match(note, /^type: source$/m); assert.match(note, /^source_type: book$/m);
  assert.match(note, /## 我的理解与批注\n\n- 2026-11-14 第 4 章《先说结论》：写不出结论就先别写汇报\n/);
  assert.doesNotMatch(note, /结论是一句能单独成立的话/, '划的原文不抄进知识库');
  h.setNow('2026-11-15T02:00:00Z');
  const second = await h.call({ action: 'note', id: highlight.id, note: '结论要能抄到纸条上' });
  assert.equal(second.note.created, false);
  const after = h.vault.get(first.note.path);
  assert.match(after, /- 2026-11-14 第 4 章《先说结论》：写不出结论就先别写汇报\n- 2026-11-15 第 4 章《先说结论》：结论要能抄到纸条上\n/);
  assert.match(after, /^updated: 2026-11-15$/m); assert.match(after, /^created: 2026-11-14$/m);
});

test('写那句话时来源笔记刚被别处改过：重读一次再写；知识库写不进时划线上的那句照样留着，并说明没写进哪一篇', async t => {
  const h = await setup(t);
  const { highlight } = await h.call({ action: 'highlight', ...fresh() });
  h.failNextWrite(Object.assign(new Error('CONFLICT: 笔记已变化'), { code: 'CONFLICT' }));
  assert.equal((await h.call({ action: 'note', id: highlight.id, note: '第一句' })).note.created, true);
  h.failNextWrite(Object.assign(new Error('NOT_INITIALIZED: 知识库还没建好'), { code: 'NOT_INITIALIZED' }));
  await assert.rejects(h.call({ action: 'note', id: highlight.id, note: '第二句' }), error => error.code === 'READING_NOTE' && /已经记在划线上/.test(error.message) && /书籍 - 把话说短/.test(error.message) && /知识库还没建好/.test(error.message));
  assert.equal((await h.call({ action: 'highlights', book: bookId })).highlights[0].note, '第二句');
});

test('把那句话清空：只改划线，不动知识库', async t => {
  const h = await setup(t);
  const { highlight } = await h.call({ action: 'highlight', ...fresh() });
  await h.call({ action: 'note', id: highlight.id, note: '一句' });
  const writes = h.writes.length;
  const cleared = await h.call({ action: 'note', id: highlight.id, note: '' });
  assert.equal(cleared.highlight.note, ''); assert.equal(cleared.note, undefined);
  assert.equal(h.writes.length, writes);
});

test('回顾：划线后第 1、7、30 天各到期一次，到期没看的一直算到期；点“看过了”今天不再出现', async t => {
  const at = '2026-11-01T02:00:00Z', item = (seen = [], extra = {}) => ({ id: bookId, book: bookId, bookTitle: '书', chapter: 0, chapterTitle: '', text: '一句话', before: '', note: '', at, seen, ...extra });
  assert.equal(dueDate(item()), '2026-11-02');
  assert.equal(dueDate(item(['2026-11-02'])), '2026-11-08');
  assert.equal(dueDate(item(['2026-11-05'])), '2026-11-08', '第 1 天那次晚了几天才看，第 7 天照常到期');
  assert.equal(dueDate(item(['2026-11-02', '2026-11-09'])), '2026-12-01');
  assert.equal(dueDate(item(['2026-11-02', '2026-11-09', '2026-12-03'])), null);
  assert.deepEqual(dueToday([item()], '2026-11-01', 2), [], '划线当天不回顾');
  assert.equal(dueToday([item()], '2026-11-04', 2).length, 1, '到期没看的还在');
  assert.deepEqual(dueToday([item(['2026-11-04'])], '2026-11-04', 2), []);
  const h = await setup(t, { now: at });
  const a = (await h.call({ action: 'highlight', ...fresh({ text: '第一条划线' }) })).highlight;
  const b = (await h.call({ action: 'highlight', ...fresh({ text: '第二条划线' }) })).highlight;
  await h.call({ action: 'highlight', ...fresh({ text: '第三条划线' }) });
  assert.deepEqual((await h.call({ action: 'home' })).home.review, []);
  h.setNow('2026-11-02T02:00:00Z');
  assert.deepEqual((await h.call({ action: 'home' })).home.review.map(item => item.id), [a.id, b.id], '每天 2 条，先划的在前');
  const left = (await h.call({ action: 'looked', id: a.id })).review;
  assert.equal(left.some(item => item.id === a.id), false);
  assert.equal(left.length, 2, '看过一条，第三条补上来');
  h.setNow('2026-11-03T02:00:00Z');
  assert.equal((await h.call({ action: 'home' })).home.review.some(item => item.id === a.id), false, '第 1 天那次看过了，要到第 7 天');
  h.setNow('2026-11-08T02:00:00Z');
  assert.equal((await h.call({ action: 'home' })).home.review[0].id, b.id, '还欠着第 1 天那次的排在前面');
});

test('到期的看完了再来几条：今天划的、今天看过的不拿，最久没看的在前；设成不回顾时首页不给', async t => {
  const make = (id, at, seen = []) => ({ id, book: bookId, bookTitle: '书', chapter: 0, chapterTitle: '', text: '一句话', before: '', note: '', at, seen });
  const list = [make('a', '2026-11-01T02:00:00Z', ['2026-11-10']), make('b', '2026-11-02T02:00:00Z', ['2026-11-05']), make('c', '2026-11-14T02:00:00Z'), make('d', '2026-11-03T02:00:00Z', ['2026-11-14'])];
  assert.deepEqual(moreToReview(list, '2026-11-14', 3).map(item => item.id), ['b', 'a']);
  const h = await setup(t, { now: '2026-11-01T02:00:00Z' });
  await h.call({ action: 'highlight', ...fresh() });
  await h.call({ action: 'settings', settings: { ...readingDefaults, review: 0 } });
  h.setNow('2026-11-02T02:00:00Z');
  assert.deepEqual((await h.call({ action: 'home' })).home.review, []);
  assert.equal((await h.call({ action: 'more' })).review.length, 1, '员工自己点“再来几条”时照样给');
});

test('取消划线能原样放回去；书从书架删掉时这本书的划线一起删，别的书不动', async t => {
  const h = await setup(t);
  const mine = (await h.call({ action: 'highlight', ...fresh() })).highlight;
  const other = (await h.call({ action: 'highlight', ...fresh({ book: otherBook, bookTitle: '交付这件事' }) })).highlight;
  const { removed } = await h.call({ action: 'unhighlight', id: mine.id });
  assert.deepEqual(removed, mine);
  assert.deepEqual((await h.call({ action: 'highlights', book: bookId })).highlights, []);
  await h.call({ action: 'restore', highlight: removed });
  await h.call({ action: 'restore', highlight: removed });
  assert.deepEqual((await h.call({ action: 'highlights', book: bookId })).highlights, [mine], '放回去两次也只有一条');
  await h.reading.dropBook(bookId);
  assert.deepEqual((await h.call({ action: 'highlights', book: bookId })).highlights, []);
  assert.deepEqual((await h.call({ action: 'highlights', book: otherBook })).highlights, [other]);
  await assert.rejects(h.call({ action: 'unhighlight', id: mine.id }), error => error.code === 'READING_NOT_FOUND');
});

test('存一条：照“网页剪藏”模板在收件箱建一篇，只记链接、为什么存和那句说明；存过的不再写第二遍', async t => {
  const h = await setup(t, { now: '2026-11-14T00:42:00Z' });
  const input = { action: 'capture', key: 'news:ai-technology:2026-11-14T00:00:00.000Z:发布表格助手', title: '青禾智能 发布 表格助手「青禾表格」：上传 Excel/CSV 就能问', brief: '把表格传上去，用一句话提问。', url: 'https://qinghe.example/blog/sheets?from=rss#top', why: '下周对交付表时试试' };
  const { capture } = await h.call(input);
  assert.equal(capture.path, '10-收件箱/网页 - 青禾智能 发布 表格助手「青禾表格」：上传 Excel CSV 就能问.md');
  const note = h.vault.get(capture.path), meta = validateNote(note, capture.path);
  assert.deepEqual([meta.type, meta.status, meta.source_type, meta.captured, meta.url, meta.created], ['capture', 'inbox', 'web', '2026-11-14 08:42', input.url, '2026-11-14']);
  assert.match(note, /## 为什么保存\n\n下周对交付表时试试\n\n## 原始网页或库外副本链接\n\nhttps:\/\/qinghe\.example\/blog\/sheets\?from=rss#top\n/);
  assert.match(note, /> 每日阅读给的说明（不是你的话，读过原文后可以改）：把表格传上去，用一句话提问。/);
  assert.match(note, /## 后续处理\n\n- \[ \] 删除\n- \[ \] 转为来源笔记\n- \[ \] 提炼原子笔记\n- \[ \] 关联到项目\n/);
  assert.deepEqual((await h.call(input)).capture, capture);
  assert.equal(h.writes.length, 1);
  const { home } = await h.call({ action: 'home' });
  assert.deepEqual(home.captures, [capture]); assert.equal(home.counts.captures, 1);
});

test('存一条：收件箱里有同名笔记时不覆盖，另起“名字 2”；没写为什么存、没有说明时那两处留空', async t => {
  const h = await setup(t);
  const taken = '10-收件箱/网页 - 同一个标题.md', original = captureNote({ name: '网页 - 同一个标题', url: 'https://example.com/old', why: '', brief: '', captured: '2026-11-01 08:00', date: '2026-11-01' });
  h.vault.set(taken, original);
  const { capture } = await h.call({ action: 'capture', key: 'tip:2026-11-14T00:00:00.000Z:0', title: '同一个标题', brief: '', url: 'https://example.com/new', why: '' });
  assert.equal(capture.name, '网页 - 同一个标题 2');
  assert.equal(h.vault.get(taken), original, '原来那篇没动');
  assert.match(h.vault.get(capture.path), /## 为什么保存\n\n## 原始网页或库外副本链接\n\nhttps:\/\/example\.com\/new\n\n## 用自己的话概括\n\n## 我的第一反应\n/);
  assert.equal(captureNoteName('  ///  '), '网页 - 没有标题');
});

test('上周存了几条、划了几条：只数上一个周一到周日（北京日期）的', async t => {
  assert.deepEqual(lastWeekRange('2026-11-16'), { start: '2026-11-09', end: '2026-11-15' });
  assert.deepEqual(lastWeekRange('2026-11-14'), { start: '2026-11-02', end: '2026-11-08' });
  const h = await setup(t, { now: '2026-11-08T17:00:00Z' });
  await h.call({ action: 'highlight', ...fresh({ text: '北京时间已经是 9 号周一凌晨' }) });
  h.setNow('2026-11-15T15:59:00Z');
  await h.call({ action: 'highlight', ...fresh({ text: '15 号周日晚上' }) });
  await h.call({ action: 'capture', key: 'k1', title: '周日存的', brief: '', url: 'https://example.com/1', why: '' });
  h.setNow('2026-11-15T16:01:00Z');
  await h.call({ action: 'capture', key: 'k2', title: '已经是 16 号周一', brief: '', url: 'https://example.com/2', why: '' });
  assert.deepEqual((await h.call({ action: 'home' })).home.lastWeek, { highlights: 2, captures: 1 });
});

test('反例：记录文件坏了就报错并说明，原文件一个字不改', async t => {
  const h = await setup(t);
  await mkdir(path.dirname(h.file), { recursive: true });
  await writeFile(h.file, '{"version":1,"settings":', 'utf8');
  await assert.rejects(h.call({ action: 'home' }), error => error.code === 'READING_STORAGE' && /reading\.json/.test(error.message));
  await assert.rejects(h.call({ action: 'highlight', ...fresh() }), error => error.code === 'READING_STORAGE');
  assert.equal(await readFile(h.file, 'utf8'), '{"version":1,"settings":');
  assert.equal(await h.reading.me(), null, '给每日资讯用的读取不抛错，按没有处理');
  assert.equal(await h.reading.weekly(), false);
});

const about = (body = '') => `---\ntype: area\nstatus: active\ncreated: 2026-10-30\nupdated: 2026-11-09\naliases: []\n---\n\n# 关于我\n\n> 这一页写给我自己，也写给所有接入的 AI。\n\n## 我是谁\n\n${body || '（我的工作、负责什么、现在在哪个阶段）'}\n\n## 怎样和我协作\n\n（希望 AI 怎么和我说话、哪些事要先问我）\n`;
const diary = (date, body) => `---\ntype: timeline\ntimeline_type: daily\nstatus: active\ndate: ${date}\ncreated: ${date}\nupdated: ${date}\naliases: []\n---\n\n# ${date}\n\n## 做了什么\n\n${body}\n`;

test('给每日资讯的《关于我》：还是空骨架不带；写了内容才带，去掉待填的括注和引用说明；开关关着不带', async t => {
  assert.equal(aboutText(about()), '');
  const text = aboutText(about('我在一家制造企业做运营，负责交付和客户回访；汇报对象习惯先听结论。'));
  assert.match(text, /## 我是谁\n\n我在一家制造企业做运营/);
  assert.doesNotMatch(text, /（希望 AI|这一页写给/);
  const h = await setup(t);
  assert.equal(await h.reading.me(), null, '知识库里还没有《关于我》');
  h.vault.set(aboutMePath, about());
  assert.equal(await h.reading.me(), null, '空骨架');
  h.vault.set(aboutMePath, about('我在一家制造企业做运营，负责交付和客户回访；汇报对象习惯先听结论。'));
  assert.deepEqual(Object.keys(await h.reading.me()), ['about']);
  await h.call({ action: 'settings', settings: { ...readingDefaults, personal: false } });
  assert.equal(await h.reading.me(), null);
});

test('带日记的开关开着时：带最近 7 天有内容的日记、新的在前，和《关于我》合计不超过 4000 字；更早的不带', async t => {
  const h = await setup(t, { now: '2026-11-14T02:00:00Z' });
  h.vault.set(aboutMePath, about('我在一家制造企业做运营，负责交付和客户回访。' + '背景'.repeat(1500)));
  for (const [date, body] of [['2026-11-14', '今天对了交付表'], ['2026-11-12', '周会定了来料检验前移'], ['2026-11-07', '七天以前的事']]) h.vault.set(`60-时间线/日记/2026/${date}.md`, diary(date, body + '。' + '细节'.repeat(600)));
  assert.equal((await h.reading.me()).diary, undefined, '默认不带日记');
  await h.call({ action: 'settings', settings: { ...readingDefaults, diary: true } });
  const me = await h.reading.me();
  assert.ok([...me.about].length + [...me.diary].length <= newsMeLimit);
  assert.ok(me.diary.indexOf('【2026-11-14】') === 0 && me.diary.indexOf('【2026-11-12】') > 0);
  assert.doesNotMatch(me.diary, /2026-11-07|七天以前/);
  assert.match(me.diary, /今天对了交付表/);
  assert.doesNotThrow(() => contract.executionResult.parse({ fields: [], window: { start: '2026-11-13T00:00:00.000Z', cutoff: '2026-11-14T00:00:00.000Z' }, me }));
});

test('模板文字：书的来源笔记状态是在读、写明原文不抄进来；标题里的非法字符换成空格', () => {
  const relative = bookNotePath('把话/说短: 第2版?');
  assert.equal(relative, '50-来源/书籍/书籍 - 把话 说短 第2版.md');
  const note = bookNote({ title: '把话/说短: 第2版?', date: '2026-11-14' });
  assert.equal(validateNote(note, relative).title, '书籍 - 把话 说短 第2版');
  assert.match(note, /原文和划线在鲸翼每日阅读的书架里，这里不抄。/);
  assert.equal(beijingDay(Date.parse('2026-11-13T16:00:00Z')), '2026-11-14');
});

// —— 每日资讯这一头：《关于我》和上周回顾 ——
const source = { name: '测试源', url: 'https://example.com/feed', kind: 'primary', region: 'domestic' };
const feed = entries => `<?xml version="1.0"?><rss version="2.0"><channel>${entries}</channel></rss>`;
const entry = (title, time, url) => `<item><title>${title}</title><link>${url}</link><pubDate>${new Date(time).toUTCString()}</pubDate><description>${title}的一句有依据的说明。</description></item>`;
async function newsHarness(t, overrides = {}) {
  const ctx = new Context(), directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-reading-news-'));
  new TypertRegistry(ctx);
  await ctx.plugin(Storage); await ctx.plugin(StorageJson, { root: directory }); await ctx.plugin(StorageDomain, { backend: 'json' });
  const domain = await ctx.storageDomain.open(newsDomain);
  await domain.table('lifecycle').put('ai-tips', { accepted: true });
  let now = Date.parse('2026-11-09T05:00:00Z'), serial = 0;
  const news = new News(domain, {
    now: () => now, identity: async () => 'news', catalog: async () => ({ available: true, tasks: [], issues: [] }), pause: async () => {},
    // 每次给一条落在本期时间窗口里的新条目。
    fetch: async url => ({ statusCode: 200, url, body: { kind: 'text', content: feed(entry(`第 ${++serial} 条消息`, now - 17 * 3600000, `https://example.com/item-${serial}`)) }, truncated: false }),
    ...overrides,
  });
  t.after(async () => { await news.dispose(); await ctx.fiber.dispose(); await rm(directory, { force: true, recursive: true }); });
  const run = input => news.execute(input, { sessionId: 'news-session', signal: new AbortController().signal });
  await news.manage({ action: 'save', id: 'ai-technology', expectedRevision: 1, field: { name: 'AI 与科技', focus: 'AI 大事', enabled: true, sources: [source] } }, new AbortController().signal);
  // 跑完一期：读候选、提交一条普通条目；extra 是 submit 里额外带的字段。
  const issue = async (day, extra = {}) => {
    now = Date.parse(`${day}T05:00:00Z`);
    const drawn = await run({ action: 'candidates', fieldId: 'ai-technology' });
    const candidate = drawn.candidates[0];
    const saved = await run({ action: 'submit', receipt: drawn.receipt, items: [{ sourceIds: [candidate.id], category: 'model', label: 'official', title: `厂商发布「${candidate.title}」`, link: candidate.url, brief: '有依据的一句说明。', relevance: extra.relevance ?? '', eventKey: `事件 ${candidate.title}` }], ...(extra.week ? { week: extra.week } : {}) });
    return { drawn, report: saved.report };
  };
  return { news, run, issue, setNow: value => { now = Date.parse(value); } };
}

test('每日资讯：阅读设置给出《关于我》时 fields 带上 me，这一期记为照员工的情况挑的；不给时照旧', async t => {
  let me = { about: '我在一家制造企业做运营，负责交付和客户回访。' };
  const h = await newsHarness(t, { me: async () => me });
  assert.deepEqual((await h.run({ action: 'fields' })).me, me);
  const { report } = await h.issue('2026-11-10', { relevance: '你每周要从交付表里找延期的原因。' });
  assert.equal(report.personal, true);
  assert.equal(report.items[0].relevance, '你每周要从交付表里找延期的原因。');
  me = null;
  assert.equal(Object.hasOwn(await h.run({ action: 'fields' }), 'me'), false);
  assert.equal(Object.hasOwn((await h.issue('2026-11-11')).report, 'personal'), false);
});

test('每日资讯：读《关于我》出错时按没有处理，这一期照常生成', async t => {
  const h = await newsHarness(t, { me: async () => { throw new Error('知识库读不出来'); }, weekly: async () => { throw new Error('读不出来'); } });
  assert.equal(Object.hasOwn(await h.run({ action: 'fields' }), 'me'), false);
  const { report } = await h.issue('2026-11-16');
  assert.equal(report.status, 'complete');
  assert.equal(Object.hasOwn(report, 'personal') || Object.hasOwn(report, 'week'), false);
});

test('上周回顾：周一那一期带上上周已保存条目的清单，提交只交编号，标题和链接取自已保存的日报', async t => {
  const h = await newsHarness(t, { weekly: async () => true });
  const saved = [];
  for (const day of ['2026-11-10', '2026-11-12', '2026-11-15']) saved.push((await h.issue(day)).report);
  h.setNow('2026-11-16T05:00:00Z');
  const drawn = await h.run({ action: 'candidates', fieldId: 'ai-technology' });
  assert.deepEqual(drawn.lastWeek, saved.map(report => ({ ref: `${report.cutoff.slice(0, 10)}#1`, date: report.cutoff.slice(0, 10), title: report.items[0].title })));
  const candidate = drawn.candidates[0];
  const item = { sourceIds: [candidate.id], category: 'model', label: 'official', title: '厂商发布「周一的消息」', link: candidate.url, brief: '有依据的一句说明。', relevance: '', eventKey: '周一的事' };
  await assert.rejects(h.run({ action: 'submit', receipt: drawn.receipt, items: [item], week: ['2026-11-01#1'] }), error => error.code === 'NEWS_WEEK' && /2026-11-01#1/.test(error.message));
  const { report } = await h.run({ action: 'submit', receipt: drawn.receipt, items: [item], week: ['2026-11-15#1', '2026-11-10#1', '2026-11-15#1'] });
  assert.deepEqual(report.week.picks, [saved[2], saved[0]].map(entry => ({ date: entry.cutoff.slice(0, 10), title: entry.items[0].title, link: entry.items[0].link })));
  assert.equal((await h.news.manage({ action: 'home' }, new AbortController().signal)).reports[0].week.picks.length, 2);
});

test('反例：不是周一、开关关着或上周没有日报时不给清单；这时提交带了 week 会被拒收，去掉就能存', async t => {
  let weekly = true;
  const h = await newsHarness(t, { weekly: async () => weekly });
  await h.issue('2026-11-10');
  h.setNow('2026-11-11T05:00:00Z');
  const tuesday = await h.run({ action: 'candidates', fieldId: 'ai-technology' });
  assert.equal(Object.hasOwn(tuesday, 'lastWeek'), false, '周二不给');
  const candidate = tuesday.candidates[0], item = { sourceIds: [candidate.id], category: 'model', label: 'official', title: '厂商发布「周二的消息」', link: candidate.url, brief: '有依据的一句说明。', relevance: '', eventKey: '周二的事' };
  await assert.rejects(h.run({ action: 'submit', receipt: tuesday.receipt, items: [item], week: ['2026-11-10#1'] }), error => error.code === 'NEWS_WEEK');
  assert.equal(Object.hasOwn((await h.run({ action: 'submit', receipt: tuesday.receipt, items: [item] })).report, 'week'), false);
  weekly = false; h.setNow('2026-11-16T05:00:00Z');
  assert.equal(Object.hasOwn(await h.run({ action: 'candidates', fieldId: 'ai-technology' }), 'lastWeek'), false, '开关关着不给');
  const empty = await newsHarness(t, { weekly: async () => true });
  empty.setNow('2026-11-16T05:00:00Z');
  assert.equal(Object.hasOwn(await empty.run({ action: 'candidates', fieldId: 'ai-technology' }), 'lastWeek'), false, '上周没有日报不给');
});

test('技能和工具说明写了《关于我》只用来写关联、上周回顾只交编号', async () => {
  const skill = await readFile(new URL('../content/skills/whalewing-news/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /`me\.about` 是员工自己写的《关于我》/);
  assert.match(skill, /不写进标题和说明，不在回复里复述/);
  assert.match(skill, /## 上周回顾（只在周一）/);
  assert.match(skill, /只交编号。标题和链接由工具从已保存的日报里取/);
  const tool = await readFile(new URL('../features/cards/tool.js', import.meta.url), 'utf8');
  assert.match(tool, /从中挑最多5个ref放进submit的week/);
});
