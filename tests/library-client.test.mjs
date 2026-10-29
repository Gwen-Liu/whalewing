// 书架报错和知识卡片首页页头在员工眼前的样子：书架服务的原因要原样送到界面，空文件说清是空的，页头有一句现状摘要。
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { fixture } from './client-fixture.mjs';
import Cards from '../features/cards/host.js';
import { Library } from '../features/cards/library/store.js';
import { libraryContract } from '../features/cards/contract.js';
import { createCardsClient } from '../features/cards/client-api.js';
import { defaultNewsField } from '../features/cards/news.js';

const contract = libraryContract(z);
const validate = { state: value => contract.state.parse(value), catalog: value => contract.catalog.parse(value) };

/** 只借 Cards 服务的 manageLibrary：书架是真的（临时目录、真解析进程），其余宿主依赖都不需要。 */
async function cardsLibrary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-library-client-'));
  const lifecycle = new AbortController();
  t.after(() => { lifecycle.abort(); return fs.rm(directory, { recursive: true, force: true }); });
  const owner = { libraryLifecycle: lifecycle, library: new Library({ directory: async () => directory, validate }) };
  return raw => Cards.prototype.manageLibrary.call(owner, raw);
}
async function upload(call, name, bytes) {
  const { upload: { id } } = await call({ action: 'uploadStart', name, size: bytes.length });
  await call({ action: 'uploadChunk', upload: id, offset: 0, data: Buffer.from(bytes).toString('base64') });
  return call({ action: 'uploadFinish', upload: id });
}
/** 过网关时只剩 JSON：details 必须还在、还是对象，DSH 的连接层才认这条失败回复。 */
const onWire = error => JSON.parse(JSON.stringify({ code: error.code, message: error.message, details: error.details }));

test('书架服务的报错带上 details 过网关，原因和办法原样到界面：CHM 说用 Calibre 转 EPUB，重复导入说已经在书架上了', async t => {
  const call = await cardsLibrary(t);
  const chm = Buffer.concat([Buffer.from('ITSF'), Buffer.alloc(200, 1)]);
  await assert.rejects(upload(call, 'x.chm', chm), error => {
    assert.equal(error.name, 'RemoteError');
    assert.deepEqual(onWire(error), { code: 'BOOK_FORMAT', message: 'CHM 格式暂不支持。可以用免费的 Calibre 把它转换成 EPUB 后再导入。', details: {} });
    return true;
  });
  const book = Buffer.from('鲸翼小书\n第一章 起\n正文一\n第二章 承\n正文二');
  assert.equal((await upload(call, '鲸翼小书.txt', book)).book.title, '鲸翼小书');
  await assert.rejects(upload(call, '鲸翼小书.txt', book), error => {
    assert.deepEqual(onWire(error), { code: 'LIBRARY_DUPLICATE', message: '这本书已经在书架上了：《鲸翼小书》', details: {} });
    return true;
  });
  // 入参没过校验也一样带 details，不在网关那层变成“插件内部出错”。
  await assert.rejects(call({ action: 'uploadStart', name: 'empty.txt', size: 0 }), error => {
    assert.equal(error.code, 'ZodError');
    assert.deepEqual(onWire(error).details, {});
    return true;
  });
});

test('书架请求在本地没过校验时不发请求，说明里没有校验程序的 JSON、字段路径和英文原句', async () => {
  let remote = 0;
  const api = createCardsClient({
    featureRemote: () => ({ manageLibrary: async () => { remote++; return { upload: { id: '00000000-0000-4000-8000-0000000000f1', chunk: 1, received: 0 } }; } }),
    unwrap: value => value,
    failure: (message, code) => Object.assign(new Error(message), { code }),
  }, key => key, z, { openAutomation: () => {} });
  await assert.rejects(api.libraryRequest({ action: 'uploadStart', name: 'empty.txt', size: 0 }), error => {
    assert.equal(error.code, 'input');
    assert.doesNotMatch(error.message, /[[\]{}]|too_small|"code"|size|Too small/, error.message);
    assert.ok(error.message.trim());
    return true;
  });
  assert.equal(remote, 0, '没过校验不发请求');
});

// —— 界面 ——
const ok = value => ({ ok: true, value });
const shelfBook = { id: '00000000-0000-4000-8000-000000000001', title: '有效需求分析', author: '徐锋', language: 'zh', format: 'EPUB', size: 4096, chars: 130000, chapters: 18, cover: null, groups: [], daily: true, addedAt: '2026-10-22T02:00:00.000Z', source: { kind: 'import', filename: '有效需求分析.epub' }, progress: { last: 2, next: 2 } };
const dailyBook = { id: shelfBook.id, title: shelfBook.title, author: shelfBook.author, cover: false, chapters: 18, finished: false, chapter: { index: 2, title: '2 日常需求分析', excerpt: '日常需求分析的摘要。', chars: 11728 }, next: [{ index: 3, title: '3 目标/愿景分析', chars: 9000 }] };
const home = (reports = [], learning = {}) => ({ reports, learning: { date: '2026-10-12', total: 2, daily: 1, books: [dailyBook], tip: null, tipRecent: [], tipField: { name: 'AI 使用技巧', enabled: true, deleted: false }, ...learning } });
/** 一期日报：cutoff 是北京时间那天 08:00（UTC 0 点）；items 条相同结构的条目。 */
function report({ fieldId = defaultNewsField.id, fieldName = 'AI 与科技', date = '2026-10-12', items = 1, status = 'complete' } = {}) {
  const [first, second] = defaultNewsField.sources, cutoff = `${date}T00:00:00.000Z`;
  const sourceStatus = [{ ...first, status: 'ok', candidates: items }, ...(status === 'partial' ? [{ ...second, status: 'failed', message: '这个来源连接失败' }] : [])];
  return { fieldId, fieldName, fieldRevision: 1, start: new Date(Date.parse(cutoff) - 86400000).toISOString(), cutoff, sessionId: 'news-session', completedAt: cutoff, status, coverage: '按实际订阅覆盖', sourceStatus,
    items: Array.from({ length: items }, (_, i) => ({ title: `${fieldName} 第 ${i + 1} 条`, summary: '来源支持的事实', importance: '影响说明', relevance: '领域关联', workImpact: '可能改善工作效率', eventKey: `${fieldId}-${date}-${i}`, sources: [{ id: String(i).padStart(64, 'a'), title: `原文 ${i + 1}`, url: `https://example.org/news/${i}`, publishedAt: '2026-10-11T06:00:00.000Z', eventTime: null, collectedAt: cutoff, excerpt: '有限摘要', source: first }] })) };
}
function nodes(tree) {
  if (tree === null || tree === undefined || tree === false) return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
const button = (tree, label) => {
  const found = nodes(tree).find(node => node.type === 'button' && (node.props.children.includes(label) || nodes(node).some(child => child.type === 'span' && child.props.children.includes(label))));
  assert.ok(found, `按钮 ${label} 存在`);
  return found;
};
/** 知识卡片首页页头：标题和它下面那句摘要。 */
function pageHead(tree) {
  const head = nodes(tree).find(node => node.type === 'header' && String(node.props.className).split(' ').includes('ww-pagehead'));
  assert.ok(head, '有页头');
  const texts = type => nodes(head).filter(node => node.type === type).map(node => [node.props.children].flat().join(''));
  return { title: texts('h2')[0], summary: texts('p')[0] };
}

test('知识卡片首页标题下有一句现状摘要：书架几本、常看几本，今日资讯几条或尚未生成，再说哪里有问题', async () => {
  let value = home();
  const f = await fixture({ news: async input => {
    if (input.action !== 'home') throw new Error('unexpected news action ' + input.action);
    return ok(value);
  } });
  await button(f.render(), '知识卡片').props.onClick();
  assert.deepEqual(pageHead(f.render()), { title: '知识卡片', summary: '书架 2 本，常看 1 本 · 今日日报尚未生成' });
  // 今天那期出了：条数按首页显示的算（每个领域最多 8 条），昨天那期不算今天的；部分来源失败点出来。
  value = home([report({ items: 10, status: 'partial' }), report({ fieldId: 'e2e-stale', fieldName: '昨日领域', date: '2026-10-11', items: 2, status: 'partial' })]);
  await button(f.render(), '刷新').props.onClick();
  assert.equal(pageHead(f.render()).summary, '书架 2 本，常看 1 本 · 今日资讯 8 条 · 1 个领域部分来源失败');
  // 只有旧的一期：仍说今天的尚未生成，不把旧日报当成今天的。
  value = home([report({ date: '2026-10-11', items: 3 })]);
  await button(f.render(), '刷新').props.onClick();
  assert.equal(pageHead(f.render()).summary, '书架 2 本，常看 1 本 · 今日日报尚未生成');
  // 今天那期是空的。
  value = home([report({ items: 0, status: 'empty' })]);
  await button(f.render(), '刷新').props.onClick();
  assert.equal(pageHead(f.render()).summary, '书架 2 本，常看 1 本 · 今日资讯没有符合条件的条目');
  // 书架空、常看书的阅读副本丢失、书架读不出来。
  value = home([], { total: 0, daily: 0, books: [] });
  await button(f.render(), '刷新').props.onClick();
  assert.equal(pageHead(f.render()).summary, '书架还是空的 · 今日日报尚未生成');
  const { chapter: _chapter, ...withoutChapter } = dailyBook;
  value = home([], { books: [{ ...withoutChapter, missing: true, next: [] }] });
  await button(f.render(), '刷新').props.onClick();
  assert.equal(pageHead(f.render()).summary, '书架 2 本，常看 1 本 · 今日日报尚未生成 · 1 本常看书的阅读副本不见了');
  value = home([], { total: 0, daily: 0, books: [], issue: '书架读取失败：磁盘被占用' });
  await button(f.render(), '刷新').props.onClick();
  assert.equal(pageHead(f.render()).summary, '书架没读出来 · 今日日报尚未生成');
  f.unmount();
});

test('知识卡片首页第一次读取时，标题下先写正在读取，读完换成现状摘要', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const f = await fixture({ news: async () => { await waiting; return ok(home()); } });
  const opening = button(f.render(), '知识卡片').props.onClick();
  await new Promise(setImmediate);
  assert.deepEqual(pageHead(f.render()), { title: '知识卡片', summary: '正在读取书架和每日资讯' });
  release(); await opening;
  assert.equal(pageHead(f.render()).summary, '书架 2 本，常看 1 本 · 今日日报尚未生成');
  f.unmount();
});

test('导入 0 字节的文件不上传，右上角说明文件是空的；书架服务给的原因原样接在文件名后面', async () => {
  const f = await fixture({ news: async () => ok(home()), library: async input => {
    if (input.action === 'list') return ok({ library: { groups: [], books: [shelfBook] } });
    if (input.action === 'uploadStart') return ok({ upload: { id: '00000000-0000-4000-8000-0000000000f1', chunk: 2 * 1024 * 1024, received: 0 } });
    if (input.action === 'uploadChunk') return ok({ upload: { id: input.upload, chunk: 2 * 1024 * 1024, received: input.offset + Buffer.from(input.data, 'base64').length } });
    if (input.action === 'uploadFinish') return { ok: false, error: { code: 'BOOK_FORMAT', message: 'RAR、7z、gz 压缩包请先解压，再导入里面的电子书', details: {} } };
    if (input.action === 'uploadCancel') return ok({ cancelled: true });
    throw new Error('unexpected library action ' + input.action);
  } });
  await button(f.render(), '知识卡片').props.onClick();
  await button(f.render(), '打开书架').props.onClick();
  const input = nodes(f.render()).find(node => node.type === 'input' && node.props.type === 'file');
  await input.props.onChange({ target: { files: [new File([], 'empty.txt'), new File([new Uint8Array(16)], 'x.rar')], value: 'C:\\fakepath\\empty.txt' } });
  const uploads = f.calls.filter(([kind, item]) => kind === 'library' && item.action.startsWith('upload')).map(([, item]) => [item.action, item.name ?? null]);
  assert.deepEqual(uploads.filter(([action]) => action === 'uploadStart'), [['uploadStart', 'x.rar']], '空文件没有发起上传');
  const text = JSON.stringify(f.render());
  assert.ok(text.includes('《empty.txt》文件是空的（0 字节），没有内容可导入。请确认选对了文件，或重新导出后再导入'), '说明文件是空的');
  assert.ok(text.includes('《x.rar》RAR、7z、gz 压缩包请先解压，再导入里面的电子书'), '书架服务的原因原样接在文件名后面');
  assert.doesNotMatch(text, /too_small|插件内部出错|gateway/);
  f.unmount();
});
