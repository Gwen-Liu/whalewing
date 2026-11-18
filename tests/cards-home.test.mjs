// 每日阅读首页（2026-11-14 改版）在员工眼前的样子和几条主要流程：头条怎么选、存一条、告诉它想看什么、回顾；
// 以及首页用到的几个算法（怎么排、认是哪一条、逐级收紧、鲸翼的用法怎么轮、划线怎么认位置）。真的界面排版在 e2e/specs/reading.test.mjs。
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './client-fixture.mjs';
import { parts } from '../features/index.js';
import { defaultNewsField } from '../features/cards/news.js';
import { tipIndex } from '../features/cards/tip-index.js';
import { arrange, newsKey, tipKey, tipOf, fitRegion, tabsBelow } from '../features/cards/home.js';
import { usageTips, usageOfDay } from '../features/cards/usage-tips.js';
import { locate } from '../features/cards/highlights.js';
import { zh } from '../features/cards/client-presentation.js';

const ok = value => ({ ok: true, value });
const source = defaultNewsField.sources[0];
/** 一期新格式的日报：related 是写了关联的那几条的序号。 */
function report({ fieldId = defaultNewsField.id, fieldName = 'AI 与科技', date = '2026-10-12', items = 4, personal = false, related = [], week } = {}) {
  const cutoff = `${date}T00:00:00.000Z`;
  return { fieldId, fieldName, fieldRevision: 1, start: new Date(Date.parse(cutoff) - 86400000).toISOString(), cutoff, sessionId: 'news-session', completedAt: cutoff, status: 'complete', coverage: '按实际订阅覆盖',
    sourceStatus: [{ ...source, status: 'ok', candidates: items }], ...(personal ? { personal: true } : {}), ...(week ? { week } : {}),
    items: Array.from({ length: items }, (_, i) => ({ category: 'model', label: 'official', title: `${fieldName} 第 ${i + 1} 条`, link: `https://example.org/news/${i}`, brief: `第 ${i + 1} 条的说明`, relevance: related.includes(i) ? `第 ${i + 1} 条和你有关` : '', eventKey: `${fieldId}-${date}-${i}`,
      sources: [{ id: String(i).padStart(64, 'a'), title: `原文 ${i + 1}`, url: `https://example.org/news/${i}`, publishedAt: '2026-10-11T06:00:00.000Z', eventTime: null, collectedAt: cutoff, excerpt: '有限摘要', source }] })) };
}
const home = (reports = []) => ({ reports, learning: { date: '2026-10-12', total: 0, daily: 0, books: [], tip: null, tipRecent: [], tipField: { name: 'AI 使用技巧', enabled: true, deleted: false } } });
const settings = { personal: true, diary: false, usage: true, weekly: true, review: 2 };
const readingHome = (extra = {}) => ({ date: '2026-10-12', settings, review: [], byBook: {}, counts: { highlights: 0, captures: 0 }, lastWeek: { highlights: 0, captures: 0 }, captures: [], ...extra });
const highlight = (id, text, extra = {}) => ({ id: `0000000${id}-0000-4000-8000-000000000000`, book: '11111111-1111-4111-8111-111111111111', bookTitle: '把话说短', chapter: 3, chapterTitle: '先说结论', text, before: '', note: '', at: '2026-10-10T02:00:00.000Z', seen: [], ...extra });

function nodes(tree) {
  if (tree === null || tree === undefined || tree === false) return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
const textOf = node => nodes(node).length ? [node.props?.children].flat(Infinity).map(child => typeof child === 'object' ? textOf(child) : child === false || child === null || child === undefined ? '' : String(child)).join('') : '';
const classed = (tree, name) => nodes(tree).filter(node => String(node.props?.className ?? '').split(' ').includes(name));
const byText = (tree, type, label) => { const found = nodes(tree).find(node => node.type === type && textOf(node).trim() === label); assert.ok(found, `${type}「${label}」存在`); return found; };
// 副作用在渲染时登记：先渲染、再执行副作用、等它的请求回来，重复几轮直到稳定。
const settle = async f => { for (let i = 0; i < 4; i++) { f.render(); f.flushEffects(); await new Promise(setImmediate); } return f.render(); };
/** 进每日阅读首页，等首页和划线、设置都读回来。 */
async function open(overrides) {
  const f = await fixture(overrides);
  await byText(f.render(), 'button', '每日阅读').props.onClick();
  return { f, tree: await settle(f) };
}

test('今天这一期没生成出来：照实说原因，能现在重新生成一期；发出去以后显示正在整理', async () => {
  const delivery = { scheduledAt: '2026-10-12T00:00:00.000Z', deliveredAt: '2026-10-12T00:00:01.000Z', messageId: 'm1' };
  const task = status => ({ id: 'news-1', kind: 'daily', title: '每日资讯', prompt: '每日资讯', scheduledAt: '2026-10-13T00:00:00.000Z', time: '08:00:00', timeZone: 'Asia/Shanghai', sessionId: 'whalewing-news-1', status: 'active', purpose: 'news', displayPrompt: '每日资讯', lastDelivery: delivery,
    lastRun: { ...delivery, status, ...(status === 'error' ? { error: { code: 'QUOTA', message: 'Insufficient balance', status: 402 } } : {}) } });
  let state = 'error';
  const ran = [];
  const { f, tree } = await open({ news: async input => ok(input.action === 'home' ? home() : { fields: [] }), reading: async () => ok({ home: readingHome() }), automation: async input => {
    if (input.action === 'catalog') return ok({ available: true, tasks: [task(state)], legacyTasks: [], issues: [] });
    if (input.action === 'run') { ran.push(input); state = 'waiting'; return ok({ id: input.id, ran: true }); }
    throw new Error('unexpected automation action ' + input.action);
  } });
  const notice = classed(tree, 'ww-read-today')[0];
  assert.ok(textOf(notice).includes('今天这一期没生成出来：模型的余额或额度用完了'), textOf(notice));
  assert.equal(textOf(notice).includes('尚未生成'), false, '失败了不再写“尚未生成”');
  await byText(notice, 'button', '现在生成一期').props.onClick();
  const after = await settle(f);
  assert.deepEqual(ran, [{ action: 'run', sessionId: 'whalewing-news-1', id: 'news-1' }]);
  assert.ok(textOf(classed(after, 'ww-read-today')[0]).includes('正在整理今天这一期'));
  f.unmount();
  // 新装当天还没跑过：照旧说几点整理，也能手动生成一期。
  const fresh = await open({ news: async input => ok(input.action === 'home' ? home() : { fields: [] }), reading: async () => ok({ home: readingHome() }), automation: async input => {
    if (input.action === 'catalog') { const { lastDelivery: _d, lastRun: _r, ...rest } = task('error'); return ok({ available: true, tasks: [rest], legacyTasks: [], issues: [] }); }
    throw new Error('unexpected automation action ' + input.action);
  } });
  const blank = classed(fresh.tree, 'ww-read-today')[0];
  assert.ok(textOf(blank).includes('今日日报尚未生成'));
  byText(blank, 'button', '现在生成一期');
  fresh.f.unmount();
});

test('首页排法：照员工情况挑的一期把第一条写了关联的提到最前，其余顺序不变；不是的保持原样；超过 8 条只留前 8 条', () => {
  const personal = report({ items: 5, personal: true, related: [2, 4] });
  assert.deepEqual(arrange(personal).map(item => item.title), [3, 1, 2, 4, 5].map(n => `AI 与科技 第 ${n} 条`));
  assert.deepEqual(arrange(report({ items: 3, personal: true })).map(item => item.title), [1, 2, 3].map(n => `AI 与科技 第 ${n} 条`), '都没写关联就不动');
  assert.deepEqual(arrange(report({ items: 3, related: [2] })).map(item => item.title), [1, 2, 3].map(n => `AI 与科技 第 ${n} 条`), '不是照员工情况挑的不动');
  assert.equal(arrange(report({ items: 12 })).length, 8);
});

test('存一条认是哪一条：资讯按领域、期次和事件，技巧按期次和第几条；首页技巧和后端同一个算法', () => {
  const value = report({ items: 3 });
  assert.equal(newsKey(value, value.items[1]), 'news:ai-technology:2026-10-12T00:00:00.000Z:ai-technology-2026-10-12-1');
  const tips = report({ fieldId: 'ai-tips', fieldName: 'AI 使用技巧', items: 3 }), tip = tipOf(tips);
  assert.equal(tip.index, tipIndex('2026-10-12', 3));
  assert.equal(tip.title, `AI 使用技巧 第 ${tip.index + 1} 条`);
  assert.equal(tipKey(tip), `tip:2026-10-12T00:00:00.000Z:${tip.index}`);
  assert.equal(tipOf(report({ items: 0 })), null); assert.equal(tipOf(undefined), null);
});

test('放不下逐级收紧：从第 0 级试起，收到放得下为止；第 3 级还放不下就到第 4 级，让这一块里的列表自己滚', () => {
  const region = need => ({ dataset: {}, clientHeight: 400, get scrollHeight() { return need[Number(this.dataset.d)]; } });
  assert.equal(fitRegion(region([380, 380, 380, 380, 380])), 0);
  assert.equal(fitRegion(region([460, 430, 400, 380, 380])), 2);
  assert.equal(fitRegion(region([460, 440, 420, 400, 400])), 3);
  assert.equal(fitRegion(region([900, 800, 700, 600, 400])), 4, '收到最紧还放不下，改成列表自己滚');
  assert.equal(tabsBelow, 780);
});

test('鲸翼的用法：每条去的功能都是真有的页签或“全部功能”，编号不重复；每天轮一条，“换一条”接着往下', () => {
  const tabs = new Set(parts.filter(feature => feature.tab).map(feature => feature.id));
  for (const tip of usageTips) {
    assert.ok(tip.feature === 'launcher' || tabs.has(tip.feature), `${tip.id} 去的功能 ${tip.feature} 存在`);
    assert.ok(tip.title.length <= 30 && tip.how.length <= 80 && tip.where, `${tip.id} 一句标题、一两句做法`);
    assert.doesNotMatch(tip.title + tip.how, /卡片设置|今日学习|个人知识|工具台/, '不用已经废止的名字');
  }
  assert.equal(new Set(usageTips.map(tip => tip.id)).size, usageTips.length);
  const days = Array.from({ length: usageTips.length }, (_, i) => usageOfDay(new Date(Date.UTC(2026, 10, 14 + i)).toISOString().slice(0, 10)).id);
  assert.equal(new Set(days).size, usageTips.length, '一轮里每条各出现一次');
  assert.equal(usageOfDay('2026-11-14', 1).id, usageOfDay('2026-11-15').id);
  assert.equal(usageOfDay('2026-11-14', usageTips.length).id, usageOfDay('2026-11-14').id);
});

test('划线认位置：同一句在本章出现几次时，挑前面几个字对得上的那一处；对不上用第一处；这一章没有这句就不画', () => {
  const text = '先说结论。很多人不这样做。先说结论。最后再说一遍。';
  assert.equal(locate(text, { text: '先说结论。', before: '' }), 0);
  assert.equal(locate(text, { text: '先说结论。', before: '不这样做。' }), 13);
  assert.equal(locate(text, { text: '先说结论。', before: '别处的字' }), 0);
  assert.equal(locate(text, { text: '书里没有的话', before: '' }), -1);
});

test('首页：四块是今日资讯、今日一招、接着读、回顾；照员工情况挑的一期，头条是第一条写了关联的并写“和你的关系”，有关的快讯标“和你有关”', async () => {
  const { f, tree } = await open({ news: async () => ok(home([report({ personal: true, related: [1, 3] })])), reading: async () => ok({ home: readingHome() }) });
  assert.deepEqual(classed(tree, 'ww-read-head').map(head => textOf(nodes(head).find(node => node.type === 'h3'))), ['今日资讯', '今日一招', '接着读', '回顾']);
  const lead = classed(tree, 'ww-read-lead')[0];
  assert.equal(textOf(classed(lead, 'ww-read-lead-t')[0]), 'AI 与科技 第 2 条');
  assert.equal(textOf(classed(lead, 'ww-read-rel')[0]), '和你的关系第 2 条和你有关');
  const rows = classed(tree, 'ww-read-q');
  assert.deepEqual(rows.map(row => textOf(classed(row, 'ww-read-q-t')[0])), [1, 3, 4].map(n => `AI 与科技 第 ${n} 条`));
  assert.deepEqual(rows.map(row => classed(row, 'ww-read-tag-me').map(textOf)), [[], [], ['和你有关']]);
  assert.equal(textOf(classed(tree, 'ww-pagehead')[0]).includes('今天这一期 4 条资讯，看过 0 条 · 存下 0 条 · 书里划线 0 条'), true);
  assert.equal(JSON.stringify(tree).includes('卡片设置') || JSON.stringify(tree).includes('今日学习'), false, '旧名字不再出现');
  f.unmount();
});

test('存一条：点头条的“存一条”弹出居中小弹窗，写一句为什么存后提交，请求里带这一条的标题、说明、链接和这句话；存好后按钮变“已存”', async () => {
  const value = report({ items: 2 });
  let captures = [];
  const { f, tree } = await open({ news: async () => ok(home([value])), reading: async input => {
    if (input.action === 'home') return ok({ home: readingHome({ captures, counts: { highlights: 0, captures: captures.length } }) });
    if (input.action === 'capture') { const capture = { key: input.key, path: '10-收件箱/网页 - AI 与科技 第 1 条.md', name: '网页 - AI 与科技 第 1 条', at: '2026-10-12T02:00:00.000Z' }; captures = [capture]; return ok({ capture }); }
    throw new Error('unexpected reading action ' + input.action);
  } });
  byText(classed(tree, 'ww-read-lead')[0], 'button', '存一条').props.onClick();
  let dialog = f.render();
  assert.ok(JSON.stringify(dialog).includes('存进知识积累的收件箱'), '弹窗标题');
  const input = nodes(dialog).find(node => node.type === 'input' && node.props.placeholder === '比如：下周对交付表时试试');
  input.props.onChange({ target: { value: ' 下周周会上试试 ' } });
  dialog = f.render();
  await nodes(dialog).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const sent = f.calls.filter(([kind, item]) => kind === 'reading' && item.action === 'capture').map(([, item]) => item);
  assert.deepEqual(sent, [{ action: 'capture', key: newsKey(value, value.items[0]), title: 'AI 与科技 第 1 条', brief: '第 1 条的说明', url: 'https://example.org/news/0', why: '下周周会上试试' }]);
  const after = await settle(f), text = JSON.stringify(after);
  assert.ok(text.includes('已存进知识积累的收件箱：《网页 - AI 与科技 第 1 条》') && text.includes('去知识积累看'), '右上角提示带“去知识积累看”');
  assert.equal(textOf(nodes(classed(after, 'ww-read-lead')[0]).find(node => node.type === 'button' && node.props['aria-pressed'] === true)), '已存');
  assert.ok(textOf(classed(after, 'ww-pagehead')[0]).includes('存下 1 条'));
  f.unmount();
});

test('告诉它想看什么：小弹窗里说明这一期怎么挑的，写的那句话追加到这个领域关注描述的末尾再保存；关注描述写满时不保存并说明', async () => {
  const field = { ...defaultNewsField, revision: 3, focus: '每天的 AI 大事' };
  let saved = null;
  const listed = () => ok({ fields: [saved ?? field], historyFields: [], defaults: defaultNewsField, window: { start: '2026-10-11T00:00:00.000Z', cutoff: '2026-10-12T00:00:00.000Z' }, errors: {}, limits: { maxFields: 21, maxResponseBytes: 1024, maxBodyChars: 1024, maxCandidates: 10, deadlineMs: 1000, receiptMs: 1000 }, schedules: [], dependencies: { scheduleAvailable: true, issues: [], collection: 'rss', model: '默认模型' } });
  const { f, tree } = await open({ reading: async () => ok({ home: readingHome() }), news: async input => {
    if (input.action === 'home') return ok(home([report({ personal: true, related: [0] })]));
    if (input.action === 'list') return listed();
    if (input.action === 'save') { saved = { ...input.field, id: input.id, revision: input.expectedRevision + 1, deleted: false }; return ok({ field: saved }); }
    throw new Error('unexpected news action ' + input.action);
  } });
  byText(tree, 'button', '按《关于我》挑').props.onClick();
  let dialog = f.render();
  assert.ok(JSON.stringify(dialog).includes('这一期是按你的《关于我》挑的'));
  nodes(dialog).find(node => node.type === 'input' && node.props.placeholder === '比如：多来点和排产、质检有关的').props.onChange({ target: { value: '多来点排产' } });
  dialog = f.render();
  await nodes(dialog).filter(node => node.type === 'form').at(-1).props.onSubmit({ preventDefault() {} });
  assert.equal(saved.focus, '每天的 AI 大事\n另外想多看：多来点排产');
  assert.equal(saved.revision, 4);
  assert.ok(JSON.stringify(f.render()).includes('记下了，写进了“AI 与科技”的关注描述，下一期开始用'));
  // 反例：关注描述已经快写满，再加就超过 2000 字。
  saved = { ...saved, focus: '满'.repeat(1998) };
  const calls = f.calls.filter(([kind, item]) => kind === 'news' && item.action === 'save').length;
  byText(f.render(), 'button', '按《关于我》挑').props.onClick();
  nodes(f.render()).find(node => node.type === 'input' && node.props.placeholder === '比如：多来点和排产、质检有关的').props.onChange({ target: { value: '再多一点' } });
  await nodes(f.render()).filter(node => node.type === 'form').at(-1).props.onSubmit({ preventDefault() {} });
  assert.equal(f.calls.filter(([kind, item]) => kind === 'news' && item.action === 'save').length, calls, '没有保存');
  assert.ok(JSON.stringify(f.render()).includes('“AI 与科技”的关注描述已经写满 2000 字了，请到阅读设置里整理后再加'));
  f.unmount();
});

test('回顾：到期的划线一次显示一条、能翻；点“看过了”告诉后端并换成剩下的；没有划线时说明怎么划', async () => {
  let review = [highlight(1, '结论是一句能单独成立的话。', { note: '写不出结论先别汇报' }), highlight(2, '一个数字顶得上三句形容。')];
  const { f, tree } = await open({ news: async () => ok(home()), reading: async input => {
    if (input.action === 'home') return ok({ home: readingHome({ review, counts: { highlights: 2, captures: 0 } }) });
    if (input.action === 'looked') { review = review.filter(item => item.id !== input.id); return ok({ review }); }
    throw new Error('unexpected reading action ' + input.action);
  } });
  const pane = () => classed(f.render(), 'ww-read-rv')[0];
  assert.ok(textOf(pane()).includes('以前划的线，今天还有 2 条'));
  assert.equal(classed(pane(), 'ww-read-quote').length, 1, '一次显示一条');
  assert.equal(textOf(nodes(pane()).find(node => node.type === 'blockquote')), '结论是一句能单独成立的话。');
  assert.equal(textOf(classed(pane(), 'ww-read-mine')[0]), '我写的：写不出结论先别汇报');
  assert.equal(textOf(classed(pane(), 'ww-read-from')[0]), '《把话说短》第 4 章 · 10/10划的');
  nodes(pane()).find(node => node.type === 'button' && node.props['aria-label'] === '下一条').props.onClick();
  assert.equal(textOf(nodes(pane()).find(node => node.type === 'blockquote')), '一个数字顶得上三句形容。');
  await byText(pane(), 'button', '看过了').props.onClick();
  assert.deepEqual(f.calls.filter(([kind, item]) => kind === 'reading' && item.action === 'looked').map(([, item]) => item.id), [review[0] ? highlight(2, '').id : null].filter(Boolean));
  await settle(f);
  assert.equal(textOf(nodes(pane()).find(node => node.type === 'blockquote')), '结论是一句能单独成立的话。', '剩下的那一条');
  f.unmount();
  const empty = await open({ news: async () => ok(home()), reading: async () => ok({ home: readingHome() }) });
  assert.ok(textOf(classed(empty.tree, 'ww-read-rv')[0]).includes('还没有划线。读书时选中一句话就能划线，过一天它会回到这里。'));
  empty.f.unmount();
});

test('划线和阅读设置没读出来时：首页照常显示，页头说明没读出来，“存一条”先不能点，回顾那一块不显示', async () => {
  const { f, tree } = await open({ news: async () => ok(home([report({ items: 2 })])), reading: async () => ({ ok: false, error: { code: 'READING_STORAGE', message: '记录文件已损坏', details: {} } }) });
  assert.ok(textOf(classed(tree, 'ww-pagehead')[0]).includes('划线和阅读设置没读出来'));
  assert.equal(byText(classed(tree, 'ww-read-lead')[0], 'button', '存一条').props.disabled, true);
  assert.equal(classed(tree, 'ww-read-rv').length, 0);
  assert.equal(classed(tree, 'ww-read-q').length, 1, '资讯照常显示');
  f.unmount();
});

test('新加的词条都有中文，开关的说明写清楚把什么交给谁', () => {
  for (const key of ['homeNews', 'homeTip', 'homeBook', 'homeReview', 'homeSaveHelp', 'markPanelHelp', 'readingPersonalHelp', 'readingDiaryHelp', 'readingUsageHelp', 'readingWeeklyHelp', 'readingReviewHelp']) assert.ok(zh[key]?.trim(), key);
  assert.equal(zh.newsSettings, '阅读设置');
  assert.match(zh.readingPersonalHelp, /把《关于我》的正文交给你在 DSH 里配的模型/);
  assert.match(zh.readingPersonalHelp, /不发到别处/);
  assert.match(zh.markPanelHelp, /划的原文留在每日阅读里，不抄进知识库/);
});

// 2026-11-14 真模型跑的那一期：AI 使用技巧这一期模型交了空的，首页技巧卡还写“今天的技巧 08:00 后整理好”。
test('今日一招：今天的技巧这一期已经整理过但一条都没挑出来时，卡上照实说今天没有，不再写“08:00 后整理好”；还没整理时照旧', async () => {
  const waiting = await open({ news: async input => ok(input.action === 'home' ? home() : { fields: [] }) });
  const card = tree => classed(tree, 'ww-read-tipcard')[0];
  assert.ok(textOf(card(waiting.tree)).includes('今天的技巧 08:00 后整理好'));
  const emptyHome = home();
  emptyHome.learning.tipRecent = [{ date: '2026-10-12', cutoff: '2026-10-12T00:00:00.000Z', count: 0, status: 'partial' }, { date: '2026-10-11', cutoff: '2026-10-11T00:00:00.000Z', count: 3, status: 'complete' }];
  const empty = await open({ news: async input => ok(input.action === 'home' ? emptyHome : { fields: [] }) });
  const text = textOf(card(empty.tree));
  assert.ok(text.includes('今天没有可照着做的技巧') && text.includes('明天 08:00 再整理'), text);
  assert.equal(text.includes('08:00 后整理好'), false);
  byText(card(empty.tree), 'button', '往期');
  // 昨天那一期为空、今天的还没出：还是“08:00 后整理好”。
  const yesterday = home();
  yesterday.learning.tipRecent = [{ date: '2026-10-11', cutoff: '2026-10-11T00:00:00.000Z', count: 0, status: 'empty' }];
  const still = await open({ news: async input => ok(input.action === 'home' ? yesterday : { fields: [] }) });
  assert.ok(textOf(card(still.tree)).includes('今天的技巧 08:00 后整理好'));
});
