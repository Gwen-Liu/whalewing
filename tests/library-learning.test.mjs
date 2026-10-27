import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { News } from '../features/cards/news.js';
import { newsContract, libraryContract } from '../features/cards/contract.js';
import { parseBook } from '../features/cards/library/formats.js';
import { bookView, bookExcerpt } from '../features/cards/library/view.js';
import { explainError } from '../src/shell/presentation-content.js';

const contract = newsContract(z);
const now = Date.parse('2026-10-12T05:00:00Z');
function service(t, learning) {
  const tables = new Map();
  const domain = { table(name) { if (!tables.has(name)) tables.set(name, new Map()); const values = tables.get(name); return { get: key => values.get(key), put: async (key, value) => values.set(key, value), keys: () => values.keys() }; } };
  let fetches = 0;
  const news = new News(domain, { now: () => now, learning, fetch: async () => { fetches++; throw new Error('本地阅读不应联网'); } });
  t.after(() => news.dispose());
  return { news, fetches: () => fetches };
}
const tipsField = { name: 'AI 使用技巧', enabled: true, deleted: false };

test('首页学习区：书架读取一次、不联网；没有技巧日报时技巧为空', async t => {
  let reads = 0;
  const h = service(t, async signal => { assert.equal(signal.aborted, false); reads++; return { date: '2026-10-12', total: 0, daily: 0, books: [] }; });
  const result = await h.news.manage({ action: 'home' }, new AbortController().signal);
  assert.equal(reads, 1); assert.equal(h.fetches(), 0);
  // 首次初始化建好技巧领域；还没有日报时技巧为空、近 14 天没有日子。
  assert.deepEqual(result.learning, { date: '2026-10-12', total: 0, daily: 0, books: [], tip: null, tipRecent: [], tipField: tipsField });
  contract.result.parse(result);
});

test('首页学习区：常看书籍的新形状（接下来三章、副本丢失、一次性提示）原样透传，仍只读一次书架', async t => {
  const books = [
    { id: '00000000-0000-4000-8000-000000000001', title: '极简项目管理', author: '郭致星', cover: true, chapters: 12, finished: false, chapter: { index: 5, title: '把目标拆到能估算：工作分解结构', excerpt: '工作分解不是列清单。', chars: 4200 }, next: [{ index: 6, title: '估算', chars: 3000 }, { index: 7, title: '排期', chars: 2800 }, { index: 8, title: '风险', chars: 2600 }] },
    { id: '00000000-0000-4000-8000-000000000002', title: '有效需求分析（第2版）', author: '徐锋', cover: false, chapters: 18, finished: false, missing: true, next: [] },
  ];
  const notice = { kept: ['极简项目管理', '有效需求分析（第2版）'], released: 3 };
  let reads = 0;
  const h = service(t, async () => { reads++; return { date: '2026-10-12', total: 7, daily: 2, notice, books }; });
  const result = await h.news.manage({ action: 'home' });
  assert.equal(reads, 1); assert.equal(h.fetches(), 0);
  assert.deepEqual(result.learning.books, books, '副本丢失的书不带 chapter，仍留在首页可取消常看');
  assert.deepEqual(result.learning.notice, notice);
  assert.equal(result.learning.daily, 2); assert.equal(result.learning.total, 7);
  assert.deepEqual(result.learning.tipField, tipsField); assert.deepEqual(result.learning.tipRecent, []);
  contract.result.parse(result);
  // 书架给出超过两本或超过三章“接下来”的结果不通过契约。
  for (const wrong of [{ books: [...books, books[0]] }, { books: [{ ...books[0], next: [...books[0].next, books[0].next[0]] }] }]) {
    assert.equal(contract.result.safeParse({ ...result, learning: { ...result.learning, ...wrong } }).success, false);
  }
});

test('首页学习区：书架服务没连上时如实说明，不伪装成空书架', async t => {
  const h = service(t, undefined);
  const result = await h.news.manage({ action: 'home' });
  assert.match(result.learning.issue, /书架服务尚未连接/);
  assert.equal(result.learning.date, '2026-10-12');
  assert.deepEqual(result.learning.books, []); assert.deepEqual(result.learning.tipField, tipsField, '书架没连上不影响技巧卡');
});

test('首页卸载时取消并等待在途的书架读取，取消不降级为成功', async t => {
  const entered = Promise.withResolvers();
  let stopped = false;
  const h = service(t, signal => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { stopped = true; reject(signal.reason); }, { once: true }); entered.resolve();
  }));
  const reading = h.news.manage({ action: 'home' });
  const rejected = assert.rejects(reading, /已卸载/);
  await entered.promise;
  await h.news.dispose(); await rejected;
  assert.equal(stopped, true); assert.equal(h.news.learningReads.size, 0);
});

test('章节阅读树：书内图片成为 image 节点，外部图片只留替代文字，摘要去掉标记', () => {
  const view = bookView('## 第一章\n\n正文 **重点**。\n\n![插图](img-0001.png)\n\n![外链](https://example.com/a.png)\n\n[链接](https://example.org)');
  const flat = JSON.stringify(view);
  assert.match(flat, /"type":"image","url":"img-0001\.png","value":"插图"/);
  assert.doesNotMatch(flat, /example\.com\/a\.png/);
  assert.match(flat, /"type":"link","url":"https:\/\/example\.org","value":"链接"/);
  libraryContract(z).view.parse(view);
  assert.equal(bookExcerpt('## 第一章\n\n正文 **重点** 和 [链接](https://example.org)。\n\n![图](img-0001.png)'), '正文 重点 和 链接。');
  assert.equal(bookExcerpt('字'.repeat(300)).length, 161);
});

test('书架报错原句就是给员工的说明，不被换成通用提示', () => {
  assert.equal(explainError('BOOK_FORMAT', 'RAR、7z、gz 压缩包请先解压，再导入里面的电子书').text, 'RAR、7z、gz 压缩包请先解压，再导入里面的电子书');
  assert.equal(explainError('LIBRARY_DUPLICATE', '这本书已经在书架上了：《书》').text, '这本书已经在书架上了：《书》');
  assert.match(explainError('LIBRARY_DUPLICATE', '').text, /插件内部出错|已经不存在|被修改/, '没有原句时仍按通用规则');
});

// 书库（whalewing-library）在开发工作区里与插件并列；导出的插件仓库没有它时跳过。
const libraryRoot = new URL('../../../library/', import.meta.url);
const hasLibrary = existsSync(new URL('catalog.json', libraryRoot));
test('在线书库：书目符合插件契约，文件大小和 SHA-256 与登记一致，每本书都能解析并带许可说明', { skip: !hasLibrary && '本仓库不含书库目录' }, async () => {
  const catalog = libraryContract(z).catalog.parse(JSON.parse(readFileSync(new URL('catalog.json', libraryRoot), 'utf8')));
  assert.ok(catalog.books.length >= 3);
  for (const entry of catalog.books) {
    assert.match(entry.url, /^books\//, '书放在书库仓库里，用相对路径登记');
    const bytes = readFileSync(new URL(entry.url, libraryRoot));
    assert.equal(bytes.length, entry.size, entry.id);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${entry.id}：改了书要重新生成 catalog.json`);
    assert.ok(['CC BY 4.0', 'MIT'].includes(entry.license), `${entry.id}：只收开放许可`);
    const book = await parseBook(bytes, entry.url);
    assert.equal(book.title, entry.title);
    assert.equal(book.chapters[0].title, '关于本书');
    assert.match(book.chapters[0].markdown, new RegExp(entry.license.replace(/[.]/g, '\\.')));
    assert.ok(book.chapters.length >= 3);
    assert.doesNotMatch(book.chapters.map(chapter => chapter.markdown).join('\n'), /<strong>|<!--/, 'HTML 排版已转成 Markdown');
  }
  const prompts = await parseBook(readFileSync(new URL('books/microsoft-genai-prompts-zh.md', libraryRoot)), 'x.md');
  assert.match(prompts.chapters[1].markdown, /零样本提示\(zero-shot；原文误写为one-shot，此处由鲸翼校订\)/, '校订在正文原位置标明');
});
