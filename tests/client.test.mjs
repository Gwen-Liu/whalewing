import { fixture, remoteScope, roles, emptyGraph, success } from './client-fixture.mjs';
import { parts } from '../features/index.js';
import { aiWebEntries } from '../features/ai-web/catalog.js';
import { worldViewCopy } from '../src/model-world-view.js';
import { explainError } from '../src/shell/presentation-content.js';
const shown = (code, message) => explainError(code, message).text;
import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeContract } from '../features/knowledge/contract.js';
import { skillLibraryContract } from '../features/skills/contract.js';
import { headlineBrief } from '../features/cards/news-evidence.js';
import { defaultNewsField, defaultTipsField, newsLimits } from '../features/cards/news.js';
import { worldAttributions } from '../features/model-world/model-world.js';
import { worldBoards } from '../features/model-world/contract.js';
import { z } from 'zod';

test('缺失图节点只展示来源，来源读取失败保留说明，成功后定位真实笔记', async () => {
  const missing = { kind: 'missing', path: 'missing:name:未建立', title: '未建立', degree: 1, sources: [{ path: '40-知识/源.md', title: '源', line: 8 }] };
  const graph = { ...emptyGraph(), total: 2, nodes: [{ kind: 'note', path: '40-知识/源.md', title: '源', degree: 1, readOnly: false }, missing], edges: [{ source: '40-知识/源.md', target: missing.path }] };
  let failRead = true;
  const requests = [];
  const f = await fixture({ knowledge: async input => {
    requests.push(input);
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'vault', limits: { maxGraphNodes: 300 } } };
    if (input.action === 'search') return { ok: true, value: { notes: [], total: 0, truncated: false } };
    if (input.action === 'graph') return { ok: true, value: graph };
    assert.equal(input.action, 'document'); assert.equal(input.path, '40-知识/源.md');
    return failRead ? { ok: false, error: { code: 'IO', message: '来源暂不可读' } } : { ok: true, value: { path: input.path, content: '真实原文', hash: 'h', readOnly: false, view: { type: 'text', value: '真实原文' }, links: [], backlinks: [] } };
  } });
  await button(f.render(), '个人知识').props.onClick();
  await nodes(f.render()).find(node => node.type?.name === 'GraphCanvas').props.onOpenNote(missing);
  assert.equal(requests.some(input => input.action === 'document'), false);
  assert.ok(nodes(f.render()).some(node => node.props.children.includes('此笔记尚不存在；这里只展示引用关系，不是实际文件')));
  await button(f.render(), '源 · 8').props.onClick();
  assert.ok(button(f.render(), '源 · 8'));
  assert.ok(nodes(f.render()).some(node => node.props.children.includes(shown('IO', '来源暂不可读'))));
  failRead = false;
  await button(f.render(), '源 · 8').props.onClick();
  assert.equal(nodes(f.render()).some(node => node.type?.name === 'GraphCanvas'), false);
  assert.ok(nodes(f.render()).some(node => node.props.children.some(value => typeof value === 'string' && value.includes('8'))));
  assert.equal(requests.filter(input => input.action === 'document').length, 2);
});

test('根级只读笔记保留阅读与导出，编辑保存删除和该笔记恢复均不发送写请求', async () => {
  const requests = [];
  const root = { kind: 'note', path: 'AGENTS.md', title: 'AGENTS', degree: 0, readOnly: true };
  const f = await fixture({ knowledge: async input => {
    requests.push(input);
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'vault', limits: { maxGraphNodes: 300 } } };
    if (input.action === 'search') return { ok: true, value: { notes: [], total: 0, truncated: false } };
    if (input.action === 'graph') return { ok: true, value: { ...emptyGraph(), nodes: [root], total: 1 } };
    if (input.action === 'document') return { ok: true, value: { path: input.path, content: '# 规则原文', hash: 'h', readOnly: true, view: { type: 'text', value: '规则原文' }, links: [], backlinks: [] } };
    assert.fail(input.action);
  } });
  await button(f.render(), '个人知识').props.onClick();
  await nodes(f.render()).find(node => node.type?.name === 'GraphCanvas').props.onOpenNote(root);
  assert.ok(nodes(f.render()).some(node => node.props.children.includes('此笔记仅供阅读，不在插件编辑、删除或恢复范围内')));
  for (const label of ['编辑', '保存', '移到可恢复区']) assert.equal(button(f.render(), label).props.disabled, true);
  // 直接调用陈旧处理器也不能把只读文件变成可编辑稿或写入请求。
  button(f.render(), '编辑').props.onClick();
  assert.equal(nodes(f.render()).some(node => node.type === 'textarea'), false);
  await button(f.render(), '保存').props.onClick();
  button(f.render(), '移到可恢复区').props.onClick();
  assert.equal(requests.some(input => ['write', 'remove', 'restore'].includes(input.action)), false);
  assert.ok(nodes(f.render()).some(node => node.type === 'a' && node.props.download === 'AGENTS.md'));
  const restoreInput = nodes(f.render()).find(node => node.type === 'label' && node.props.children.includes('要恢复的笔记路径'));
  const field = nodes(restoreInput).find(node => node.type === 'input');
  field.props.onChange({ target: { value: 'AGENTS.md' } });
  const restore = button(f.render(), '恢复');
  assert.equal(restore.props.disabled, true);
  await restore.props.onClick();
  assert.equal(requests.some(input => input.action === 'restore'), false);
});

test('严格Remote夹具拒绝未声明的新命名空间，子scope只继承明确依赖', () => {
  const raw = { remote: { whalewingKnowledge: {}, whalewingCards: {} } };
  const scope = remoteScope(raw, ['remote', 'remote.whalewingKnowledge']);
  assert.equal(scope.remote.whalewingKnowledge, raw.remote.whalewingKnowledge);
  assert.throws(() => scope.remote.whalewingCards, /remote.whalewingCards.*without inject/);
  scope.inject(['remote.whalewingCards'], child => {
    assert.equal(child.remote.whalewingKnowledge, raw.remote.whalewingKnowledge);
    assert.equal(child.remote.whalewingCards, raw.remote.whalewingCards);
  });
  assert.throws(() => scope.remote.whalewingCards, /without inject/, '子scope不会把权限回灌父级');
});

function nodes(tree) {
  if (tree === null || tree === undefined || tree === false) return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

/** 页头里所有页签的文字，按显示顺序：左边功能页签，最右模型世界那一组。 */
const tabLabels = tree => nodes(tree).filter(node => node.type === 'button' && node.props?.['data-tab']).map(node => node.props.children[0]);

/** 每轮推进真实 effect 生命周期；原生输入由宿主保留在同一 reference 中。 */
async function mountedAssistant(f) {
  const render = () => f.render('main', { SessionProvider: 'SessionProvider', renderSlot: name => ({ type: name, props: { children: [] } }) });
  button(render(), '打开小鲸助手').props.onClick();
  const start = button(render(), '开始与小鲸协作').props.onClick;
  await start(); for (let i = 0; i < 3; i++) { render(); f.flushEffects(); await new Promise(setImmediate); }
  const reference = nodes(render()).find(node => node.type === 'SessionProvider').props.session;
  f.clients.assistant.mountAssistantInput(reference.sessionId);
  return { render, start, reference, tick: async () => { for (let i = 0; i < 3; i++) { render(); f.flushEffects(); await new Promise(setImmediate); } } };
}
/** 测试宿主在子会话 effect 恢复草稿之后通知外层挂载完成。 */
async function discuss(f, action) {
  const pending = action();
  await new Promise(setImmediate);
  f.render(); f.flushEffects();
  const sessionId = nodes(f.render()).find(node => node.type === 'SessionProvider').props.session.sessionId;
  const release = f.clients.assistant.mountAssistantInput(sessionId);
  try { await pending; } finally { release(); }
}
function button(tree, label) {
  const found = nodes(tree).find((node) => node.type === 'button' && (node.props.children.includes(label) || nodes(node).some(child => child.type === 'span' && child.props.children.includes(label))));
  assert.ok(found, `按钮 ${label} 存在`);
  return found;
}

function taskField(f, label, value) {
  const group = nodes(f.render()).find(node => node.type === 'label' && node.props.children.includes(label));
  const control = nodes(group).find(node => ['input', 'textarea', 'select'].includes(node.type)) || nodes(f.render()).find(node => ['input', 'textarea', 'select'].includes(node.type) && node.props['aria-label'] === label);
  assert.ok(control, `任务字段 ${label} 存在`);
  if (arguments.length > 2) control.props.onChange({ target: { value } });
  return control;
}
const taskRecord = (changes = {}) => ({ id: 'schedule-1', kind: 'daily', title: '每日检查', prompt: '检查工作目录并输出报告', time: '00:15:00.000', timeZone: 'Asia/Shanghai', scheduledAt: '2026-10-13T16:15:00Z', ...changes });
const taskCatalog = (tasks = [], legacyTasks = [], available = true) => ({ ok: true, value: { available, tasks: tasks.map(task => ({ ...task, displayPrompt: task.displayPrompt ?? task.prompt })), legacyTasks, issues: [] } });
const newsList = (fields = [structuredClone(defaultNewsField)], extra = {}) => ({ fields, historyFields: [], defaults: structuredClone(defaultNewsField), window: { start: '2026-10-11T00:00:00.000Z', cutoff: '2026-10-12T00:00:00.000Z' }, errors: {}, limits: newsLimits, schedules: [], dependencies: { scheduleAvailable: true, issues: [], collection: 'rss', model: '使用当前系统默认模型，读取不调用模型' }, ...extra });
// 首页学习区：常看书（最多两本）各读下一章 + 当日 AI 技巧与近 14 天刻度。
const libraryBook = { id: '00000000-0000-4000-8000-000000000001', title: '有效需求分析', author: '徐锋', language: 'zh', format: 'EPUB', size: 4096, chars: 130000, chapters: 18, cover: null, groups: [], daily: true, addedAt: '2026-10-22T02:00:00.000Z', source: { kind: 'import', filename: '有效需求分析.epub' }, progress: { last: 2, next: 2 } };
const dailyBook = { id: libraryBook.id, title: libraryBook.title, author: libraryBook.author, cover: false, chapters: 18, finished: false, chapter: { index: 2, title: '2 日常需求分析', excerpt: '日常需求分析的摘要。', chars: 11728 }, next: [{ index: 3, title: '3 目标/愿景分析', chars: 9000 }] };
const dailyTip = { title: '写长文档前先让 AI 列提纲', brief: '先给结构，再逐节展开。', link: 'https://example.org/tip', source: '宝玉', date: '2026-10-12', fieldId: 'ai-tips', index: 1, count: 3, cutoff: '2026-10-12T00:00:00.000Z' };
const newsHomeResult = (reports = [], learning = {}) => ({ reports, learning: { date: '2026-10-12', total: 2, daily: 1, books: [dailyBook], tip: dailyTip, tipRecent: [{ date: '2026-10-12', cutoff: '2026-10-12T00:00:00.000Z', count: 3, status: 'complete' }, { date: '2026-10-10', cutoff: '2026-10-10T00:00:00.000Z', count: 2, status: 'partial' }], tipField: { name: 'AI 使用技巧', enabled: true, deleted: false }, ...learning } });
const newsSavedReport = (extra = {}) => {
  const source = defaultNewsField.sources[0];
  return { fieldId: defaultNewsField.id, fieldName: 'AI 与科技', fieldRevision: 1, start: '2026-10-11T00:00:00.000Z', cutoff: '2026-10-12T00:00:00.000Z', sessionId: 'news-session', completedAt: '2026-10-12T00:05:00.000Z', status: 'partial', coverage: '实际订阅覆盖不足十条，不跨期补数', sourceStatus: [{ ...source, status: 'ok', candidates: 1 }, { ...defaultNewsField.sources[1], status: 'failed', message: '这个来源连接失败' }], items: [{ title: '真实已保存标题', summary: '来源支持的事实', importance: '影响说明', relevance: '领域关联', workImpact: '可能改善工作效率', eventKey: 'event-one', sources: [{ id: 'a'.repeat(64), title: '公开原始报道', url: 'https://example.org/news/one', publishedAt: '2026-10-11T06:00:00.000Z', eventTime: null, collectedAt: '2026-10-12T00:01:00.000Z', excerpt: '有限摘要', source }] }], ...extra };
};
const worldModel = (id, changes = {}) => ({ id, name: '合成模型 ' + id, vendorId: 'vendor', releaseDate: '2026-09', releaseDatePrecision: 'month', contextWindow: 0, maxOutput: null, knowledgeCutoff: null, license: null, openWeights: false, capabilities: { reasoning: true, toolCall: false, structuredOutput: null, promptCaching: null }, pricing: { inputPerMTok: 0, outputPerMTok: null, cachedInputPerMTok: null, unit: 'USD / 1M tokens', note: 'models.dev 官方渠道价格，不代表员工转发站实际费用' }, modalities: { input: ['text'], output: ['text'] }, scores: [{ league: 'eci', score: 123.4, source: 'epoch.ai', sourceUrl: 'https://epoch.ai/benchmarks', attribution: 'third-party', unit: 'index' }], efforts: [{ effort: 'max', index: 48, cost: 120 }, { effort: 'high', index: 44, cost: 60 }], rating: { overall: 48, tier: 'T1', effort: 'max', composite: 82.5, eci: 85, reasoning: 80, coding: 84, agent: 78, coverage: 6 }, ...changes });
function worldReply(input, models = [], changes = {}) {
  const at = '2026-10-12T00:00:00.000Z';
  const status = { action: input.action, available: true, refreshing: false, acceptedAt: at, generatedAt: at, sources: { 'models.dev': { fetchedAt: at, note: '可追溯公开来源', ok: true } }, modelCount: models.length, vendors: [{ id: 'vendor', name: 'Vendor', nameZh: '合成厂商', homepage: 'https://example.org' }], leagues: Object.entries(worldBoards).map(([id, name]) => ({ id, name })), lastRefresh: null, attributions: structuredClone(worldAttributions), index: { source: 'bundled', asOf: '2026-10-21', version: '4.3', key: 'none', error: null } };
  return { ...status, ...(['list', 'timeline', 'ranking'].includes(input.action) ? { models, total: models.length, offset: input.offset || 0, limit: input.limit || 50, unknownDates: 0 } : input.action === 'detail' ? { model: models[0], vendor: status.vendors[0] } : input.action === 'compare' ? { models } : {}), ...changes };
}

test('日报卡片只放标题与分类，传闻和媒体单独标注，点开卡片才在弹框里看说明与链接', async () => {
  const legacy = newsSavedReport(), source = legacy.items[0].sources[0];
  const entry = (category, label, title, link) => ({ category, label, title, link, brief: title + '的说明', relevance: category === 'model' ? '可用于员工写方案' : '', eventKey: title, sources: [source] });
  const report = { ...legacy, status: 'complete', items: [entry('model', 'official', 'Anthropic 发布小模型「Claude Haiku 5.5」', 'https://www.anthropic.com/claude-haiku-5-5'), entry('model', 'leak', '「Claude Fable 5.5」被曝开启灰度测试', 'https://example.org/leak'), entry('opensource', 'media', '研究员开源本地语音识别模型「Phonon-2」', 'https://huggingface.co/x/Phonon-2')] };
  const f = await fixture({ news: async input => ({ ok: true, value: input.action === 'home' ? newsHomeResult([report]) : newsList() }) });
  await button(f.render(), '知识卡片').props.onClick();
  const tree = f.render(), all = nodes(tree), cards = all.filter(n => n.props?.className === 'ww-tile ww-news-tile');
  assert.deepEqual(cards.map(card => nodes(card).find(n => n.props?.className === 'ww-tile-title').props.children.join('')), report.items.map(item => item.title));
  assert.deepEqual(cards.map(card => nodes(card).find(n => n.props?.className === 'ww-tile-kicker').props.children.join('')), ['大模型', '大模型', '开源与工具']);
  assert.ok(cards.every(card => nodes(card).some(n => n.props?.className === 'ww-tile-mono')), '每张资讯卡带来源徽记');
  assert.deepEqual(cards.flatMap(card => nodes(card).filter(n => n.props?.className?.startsWith?.('ww-brief-flag'))).map(n => n.props.children.join('')), ['内测 / 传闻', '媒体报道']);
  assert.equal(JSON.stringify(tree).includes('的说明'), false, '卡片上不显示说明');
  assert.equal(all.some(n => n.type === 'a' && n.props.href === 'https://www.anthropic.com/claude-haiku-5-5'), false, '卡片上不放链接');
  assert.equal(all.some(n => n.props?.className === 'ww-brief-more'), false, '不足四条没有展开按钮');
  assert.ok(JSON.stringify(tree).includes('3 条'));
  cards[0].props.onKeyDown({ key: 'Enter', preventDefault() {} });
  const dialog = nodes(f.render()).find(n => n.type === 'dialog');
  assert.equal(dialog.props['aria-label'], report.items[0].title);
  assert.ok(JSON.stringify(dialog).includes('Anthropic 发布小模型「Claude Haiku 5.5」的说明') && JSON.stringify(dialog).includes('可用于员工写方案'));
  assert.ok(nodes(dialog).some(n => n.type === 'a' && n.props.href === 'https://www.anthropic.com/claude-haiku-5-5' && n.props.children.join('') === 'anthropic.com/claude-haiku-5-5'), '一手链接去掉协议头显示');
  dialog.props.onCancel({ preventDefault() {} });
  assert.equal(nodes(f.render()).some(n => n.type === 'dialog'), false);
  const locale = f.dictionaries.get('whalewing');
  assert.equal(locale.zh.newsViewSource, '查看来源');
  assert.equal(locale.en.newsViewSource, 'View source');
  // 官方、传闻、媒体沿用已保存标签，链接标题不擅自把媒体兜底升格为一手证据。
  for (let i = 0; i < report.items.length; i++) {
    cards[i].props.onClick();
    const detail = nodes(f.render()).find(n => n.type === 'dialog');
    assert.ok(nodes(detail).some(n => n.type === 'strong' && n.props.children.includes('查看来源')));
    assert.equal(JSON.stringify(detail).includes('一手来源'), false);
    assert.deepEqual(nodes(detail).filter(n => n.props?.className?.startsWith?.('ww-brief-flag')).map(n => n.props.children.join('')), [[], ['内测 / 传闻'], ['媒体报道']][i]);
    assert.ok(nodes(detail).some(n => n.type === 'a' && n.props.href === report.items[i].link));
    assert.ok(nodes(detail).some(n => n.type === 'a' && n.props.href === source.url), '原始候选来源仍可打开');
    detail.props.onCancel({ preventDefault() {} });
  }
});

test('每个领域默认一行四张，展开再加一行，最多八条；旧版日报的重要性只在弹框里', async () => {
  const legacy = newsSavedReport(), item = legacy.items[0];
  const report = { ...legacy, status: 'complete', items: Array.from({ length: 10 }, (_, i) => ({ ...item, title: `旧版标题 ${i + 1}`, eventKey: `event-${i}` })) };
  const f = await fixture({ news: async input => ({ ok: true, value: input.action === 'home' ? newsHomeResult([report]) : newsList() }) });
  await button(f.render(), '知识卡片').props.onClick();
  const titles = () => nodes(f.render()).filter(n => n.props?.className === 'ww-tile ww-news-tile').map(card => nodes(card).find(n => n.props?.className === 'ww-tile-title').props.children.join(''));
  const more = () => nodes(f.render()).find(n => n.props?.className === 'ww-brief-more');
  assert.deepEqual(titles(), ['旧版标题 1', '旧版标题 2', '旧版标题 3', '旧版标题 4']);
  assert.equal(nodes(f.render()).filter(n => n.props?.className === 'ww-shelf').some(shelf => nodes(shelf).some(n => n.type === 'details')), false, '卡片区不再有向下展开的折叠块');
  assert.ok(JSON.stringify(f.render()).includes('8 条'));
  assert.equal(more().props['aria-expanded'], false); assert.ok(JSON.stringify(more()).includes('展开另外 4 条'));
  more().props.onClick();
  assert.equal(titles().length, 8, '展开后两行，最多八条'); assert.equal(more().props['aria-expanded'], true);
  more().props.onClick();
  assert.equal(titles().length, 4, '收起回到一行');
  nodes(f.render()).find(n => n.props?.className === 'ww-tile ww-news-tile').props.onClick();
  const dialog = JSON.stringify(nodes(f.render()).find(n => n.type === 'dialog'));
  for (const text of ['重要性', '影响说明', '可能工作影响（推断）', '来源', '1 / 8']) assert.ok(dialog.includes(text), text);
});

test('知识首页直接读取日报与学习卡片，配置仅在设置中读取且核心领域没有删除入口', async () => {
  const f = await fixture({ news: async input => ({ ok: true, value: input.action === 'home' ? newsHomeResult([newsSavedReport()]) : newsList() }) });
  await button(f.render(), '知识卡片').props.onClick();
  assert.deepEqual(f.calls, [['news', { action: 'home' }]]);
  const text = JSON.stringify(f.render());
  for (const content of ['真实已保存标题', dailyBook.chapter.title, dailyTip.title, '10 月 12 日']) assert.ok(text.includes(content));
  assert.equal(text.includes('来源支持的事实'), false, '资讯摘要只在弹框里');
  for (const label of ['编辑领域', '启用每日资讯计划', '删除领域']) assert.equal(nodes(f.render()).some(n => n.type === 'button' && n.props.children.includes(label)), false);
  await button(f.render(), '卡片设置').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['news', { action: 'list' }]);
  assert.ok(button(f.render(), '编辑领域'));
  assert.equal(nodes(f.render()).some(n => n.type === 'button' && n.props.children.includes('删除领域')), false);
  assert.equal(f.storage.size, 0);
});

test('资讯编辑默认领域和新增来源只提交配置CAS，草稿跨标签保持', async () => {
  let fields = [{ ...structuredClone(defaultNewsField), sources: defaultNewsField.sources.slice(0, 5) }]; const saved = [];
  const f = await fixture({ news: async input => {
    if (input.action === 'home') return { ok: true, value: newsHomeResult() };
    if (input.action === 'list') return { ok: true, value: newsList(fields) };
    saved.push(input); const field = { ...input.field, id: input.id, revision: input.expectedRevision + 1, deleted: false }; fields = [field]; return { ok: true, value: { field } };
  } });
  await button(f.render(), '知识卡片').props.onClick(); await button(f.render(), '卡片设置').props.onClick(); button(f.render(), '编辑领域').props.onClick();
  taskField(f, '关注描述', '企业软件与 AI 工程');
  taskField(f, '来源名称', '员工明确添加的来源'); taskField(f, '公开 HTTPS 订阅地址', 'https://example.org/feed'); taskField(f, '来源性质', 'primary'); taskField(f, '来源地区', 'overseas');
  button(f.render(), '加入来源表单').props.onClick();
  await button(f.render(), '专家团队').props.onClick(); await button(f.render(), '知识卡片').props.onClick();
  assert.equal(taskField(f, '关注描述').props.value, '企业软件与 AI 工程');
  await button(f.render(), '保存修改').props.onClick();
  assert.equal(saved.length, 1); assert.equal(saved[0].expectedRevision, 0);
  assert.equal(saved[0].field.sources.at(-1).url, 'https://example.org/feed');
  assert.equal(f.calls.some(([kind]) => ['automation', 'create', 'prompt', 'knowledge'].includes(kind)), false);
});

test('资讯最后领域关闭先确认暂停，暂停后配置失败按owner回读且不补建计划', async () => {
  let field = { ...structuredClone(defaultNewsField), enabled: true, revision: 1 };
  let schedules = [{ id: 'news-plan', sessionId: 'news-session', title: '每日资讯', status: 'active', kind: 'daily', scheduledAt: '2026-10-13T00:00:00.000Z' }];
  const writes = [];
  const f = await fixture({ news: async input => {
    if (input.action === 'home') return { ok: true, value: newsHomeResult() };
    if (input.action === 'list') return { ok: true, value: newsList([field], { schedules }) };
    writes.push(input); assert.equal(input.confirmCancel, true); schedules = schedules.map(task => ({ ...task, status: 'paused' }));
    return { ok: false, error: { code: 'IO', message: '计划已暂停但领域保存失败' } };
  } });
  await button(f.render(), '知识卡片').props.onClick(); await button(f.render(), '卡片设置').props.onClick(); button(f.render(), '编辑领域').props.onClick();
  const checkbox = nodes(nodes(f.render()).find(node => node.type === 'label' && node.props.children.includes('纳入每日采集'))).find(node => node.type === 'input');
  checkbox.props.onChange({ target: { checked: false } }); await button(f.render(), '保存修改').props.onClick();
  assert.equal(writes.length, 0); assert.ok(JSON.stringify(f.render()).includes('请先暂停每日资讯'));
  await button(f.render(), '确认修改领域').props.onClick();
  assert.equal(writes.length, 1); assert.equal(field.enabled, true);
  assert.ok(JSON.stringify(f.render()).includes(shown('IO', '计划已暂停但领域保存失败'))); assert.ok(taskField(f, '关注描述'));
  assert.equal(f.calls.some(([kind]) => ['automation', 'create'].includes(kind)), false);
});

test('资讯领域冲突刷新保留编辑，删除领域历史通过正式historyFields可发现', async () => {
  let field = { ...structuredClone(defaultNewsField), revision: 1 }, conflict = true;
  const inputs = [];
  const f = await fixture({ news: async input => {
    inputs.push(input);
    if (input.action === 'home') return { ok: true, value: newsHomeResult() };
    if (input.action === 'list') return { ok: true, value: newsList([field], { historyFields: [{ id: 'deleted-field', name: '已删除的领域', deleted: true }] }) };
    if (input.action === 'reports') return { ok: true, value: { reports: [], nextBefore: null } };
    if (conflict) { conflict = false; field = { ...field, revision: 2 }; return { ok: false, error: { code: 'CONFLICT', message: '另一处修改了领域' } }; }
    assert.equal(input.expectedRevision, 2); field = { ...input.field, id: input.id, revision: 3, deleted: false }; return { ok: true, value: { field } };
  } });
  await button(f.render(), '知识卡片').props.onClick(); await button(f.render(), '卡片设置').props.onClick(); button(f.render(), '编辑领域').props.onClick(); taskField(f, '关注描述', '保留员工草稿');
  await button(f.render(), '保存修改').props.onClick(); assert.equal(taskField(f, '关注描述').props.value, '保留员工草稿');
  await button(f.render(), '读取最新版本（保留草稿）').props.onClick(); await button(f.render(), '保存修改').props.onClick();
  const deleted = nodes(f.render()).find(node => node.type === 'div' && node.props.className === 'ww-row' && nodes(node).some(child => child.props.children.includes('已删除的领域')));
  await button(deleted, '查看历史日报').props.onClick();
  assert.deepEqual(inputs.at(-1), { action: 'reports', fieldId: 'deleted-field' });
});

test('资讯日报从report读取真实期次、条数、来源错误和推断，不把旧日报称今日', async () => {
  const report = newsSavedReport(); let failed = false;
  const f = await fixture({ news: async input => {
    if (input.action === 'home') return { ok: true, value: newsHomeResult() };
    if (input.action === 'list') return { ok: true, value: newsList() };
    if (input.action === 'reports') return { ok: true, value: { reports: [report], nextBefore: null } };
    assert.equal(input.action, 'report');
    return failed ? { ok: false, error: { code: 'IO', message: '日报读取失败' } } : { ok: true, value: { report } };
  } });
  await button(f.render(), '知识卡片').props.onClick(); await button(f.render(), '卡片设置').props.onClick(); await button(f.render(), '读取本期日报').props.onClick();
  assert.ok(JSON.stringify(f.render()).includes('2026/10/12'));
  nodes(f.render()).find(node => node.props?.className === 'ww-tile ww-news-tile').props.onClick();
  const item = nodes(f.render()).filter(node => node.type === 'dialog').at(-1);
  for (const expected of ['真实已保存标题', '1 / 1', '可能工作影响（推断）']) assert.ok(JSON.stringify(item).includes(expected), expected);
  assert.ok(nodes(item).some(node => node.type === 'a' && node.props.href === 'https://example.org/news/one'));
  item.props.onCancel({ preventDefault() {} });
  failed = true; await button(f.render(), '读取本期日报').props.onClick(); assert.ok(JSON.stringify(f.render()).includes('真实已保存标题'));
  await button(f.render(), '查看运行详情').props.onClick();
  const run = nodes(f.render()).filter(node => node.type === 'dialog').at(-1);
  assert.ok(JSON.stringify(run).includes('这个来源连接失败'));
  await button(run, '打开生成会话').props.onClick(); assert.deepEqual(f.calls.at(-1), ['open', 'news-session']);
  assert.equal(f.calls.some(([kind]) => kind === 'prompt'), false);
});

test('资讯独立news会话启用不传Client spec，回执未知重载后仅回读原身份', async () => {
  const field = { ...structuredClone(defaultNewsField), enabled: true, revision: 1 }, tasks = [];
  const news = async input => { assert.equal(input.action, 'list'); return { ok: true, value: newsList([field], { schedules: tasks.map(({ purpose, prompt, time, timeZone, ...task }) => task) }) }; };
  const automation = async input => {
    if (input.action === 'catalog') return taskCatalog(tasks);
    assert.deepEqual(Object.keys(input), ['action', 'sessionId', 'purpose']); assert.equal(input.purpose, 'news');
    tasks.push({ ...taskRecord({ id: 'news-plan', title: '每日资讯', scheduledAt: '2026-10-13T00:00:00.000Z' }), sessionId: input.sessionId, status: 'active', purpose: 'news' });
    throw new Error('资讯计划回执未知');
  };
  const f = await fixture({ news, automation });
  await assert.rejects(f.clients.automation.createAutomation({ purpose: 'news', cwd: 'E:\\资讯' }, false, new AbortController().signal), /资讯计划回执未知/); const id = f.clients.automation.pendingAutomation().sessionId;
  assert.deepEqual(JSON.parse([...f.storage.values()][0]), { sessionId: id, purpose: 'news' });
  const resumed = await fixture({ news, automation, storage: f.storage, existing: f.existing, automationClaims: f.automationClaims, workspaceState: f.ctx.workspaces.list.getSnapshot() });
  await button(resumed.render(), '定时任务').props.onClick(); await button(resumed.render(), '查看原会话和计划').props.onClick();
  assert.equal(resumed.clients.automation.pendingAutomation(), null); assert.equal(resumed.calls.some(([kind]) => ['create', 'automationClaim', 'prompt'].includes(kind)), false);
});

// 分块到达后需要一次组件提交，再推进真实视图自己的读取 effect。
async function settleView(f) {
  for (let i = 0; i < 3; i++) { f.render(); f.flushEffects(); await new Promise(setImmediate); }
}
async function worldReady(f, tab) {
  await button(f.render(), '模型世界').props.onClick();
  await settleView(f);
  if (tab) { button(f.render(), tab).props.onClick(); await new Promise(setImmediate); }
  return f.render();
}
const worldSort = f => { const node = nodes(f.render()).find(node => node.type === 'button' && node.props.className === 'ww-mw-sort'); assert.ok(node, '排序按钮存在'); return node; };
const worldAction = (f, label) => { const node = nodes(f.render()).find(node => node.props['aria-label'] === label); assert.ok(node, label); return node; };
async function worldNavigate(f, label) { button(f.render(), label).props.onClick(); await new Promise(setImmediate); return f.render(); }

test('模型世界首次无快照只本地读取，明确手动更新后展示真实返回并处于导航最右', async () => {
  let available = false;
  const f = await fixture({ world: async input => { if (input.action === 'refresh') available = true; return { ok: true, value: available ? worldReply(input, [worldModel('one')]) : worldReply(input, [], { available: false, acceptedAt: null, generatedAt: null, modelCount: 0, vendors: [], leagues: [] }) }; } });
  assert.equal(tabLabels(f.render()).at(-1), '模型世界');
  await worldReady(f); assert.deepEqual(f.calls, [['world', { action: 'list', limit: 12, offset: 0 }]]);
  assert.ok(JSON.stringify(f.render()).includes(worldViewCopy.noSnapshot));
  await button(f.render(), '更新数据').props.onClick();
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'world').map(([, input]) => input.action), ['list', 'refresh', 'list']);
  assert.ok(worldAction(f, '浏览 合成厂商 的模型'));
  assert.equal(f.calls.some(([kind]) => ['create', 'prompt', 'knowledge'].includes(kind)), false);
});

test('模型世界筛选与分页消费Host结果，未提交筛选不改当前页的查询条件', async () => {
  const all = Array.from({ length: 14 }, (_, i) => worldModel('model-' + i)); const inputs = [];
  const f = await fixture({ world: async input => { inputs.push(input); const filtered = input.query ? [all[3]] : all; const offset = input.offset || 0; return { ok: true, value: worldReply(input, filtered.slice(offset, offset + 12), { total: filtered.length, modelCount: all.length }) }; } });
  await worldReady(f); worldAction(f, '浏览 合成厂商 的模型').props.onClick(); await new Promise(setImmediate);
  taskField(f, '搜索模型或厂商', '员工未提交的筛选'); await button(f.render(), '下一页').props.onClick();
  assert.deepEqual(inputs.at(-1), { action: 'list', vendorId: 'vendor', limit: 12, offset: 12 });
  assert.ok(JSON.stringify(f.render()).includes('13–14 / 14'));
  nodes(f.render()).find(node => node.type === 'form' && node.props.className === 'ww-mw-toolbar').props.onSubmit({ preventDefault() {} }); await new Promise(setImmediate);
  assert.deepEqual(inputs.at(-1), { action: 'list', query: '员工未提交的筛选', vendorId: 'vendor', limit: 12, offset: 0 });
  taskField(f, '全部能力', 'reasoning'); await new Promise(setImmediate);
  assert.equal(inputs.at(-1).capability, 'reasoning'); assert.ok(JSON.stringify(f.render()).includes('合成模型 model-3')); assert.equal(nodes(f.render()).some(node => node.props.className === 'ww-mw-page'), false);
});

test('模型世界时间线按原精度显示日期和未知日期数，实力榜默认综合实力从高到低并可切换方向', async () => {
  const month = worldModel('month'), day = worldModel('day', { releaseDate: '2026-10-11', releaseDatePrecision: 'day' }), year = worldModel('year', { releaseDate: '2025', releaseDatePrecision: 'year' }); const inputs = [];
  const f = await fixture({ world: async input => { inputs.push(input); return { ok: true, value: worldReply(input, [day, month, year], { unknownDates: 1 }) }; } });
  await worldReady(f, '发布时间线'); const value = JSON.stringify(f.render());
  for (const text of ['2026-09', '2026-10-11', '2025', '1 个模型缺少发布日期']) assert.ok(value.includes(text));
  assert.equal(value.includes('2026-09-01'), false);
  await worldNavigate(f, '实力榜'); assert.equal(inputs.at(-1).league, 'overall'); assert.equal(inputs.at(-1).direction, 'desc');
  assert.ok(JSON.stringify(worldSort(f).props.children).includes('从高到低'));
  await worldSort(f).props.onClick(); assert.equal(inputs.at(-1).direction, 'asc'); assert.ok(nodes(f.render()).some(node => node.type === 'table'));
  assert.ok(JSON.stringify(worldSort(f).props.children).includes('从低到高'));
});

test('模型世界详情只列已知字段，区分零与未知并保留价格单位，不展示字段来源', async () => {
  const f = await fixture({ world: async input => ({ ok: true, value: worldReply(input, [worldModel('one')]) }) }); await worldReady(f, '发布时间线');
  await worldAction(f, '详情 合成模型 one').props.onClick({ currentTarget: { isConnected: true } });
  const dialog = nodes(f.render()).find(node => node.type === 'dialog'); assert.ok(dialog);
  const cells = nodes(dialog).filter(node => ['dt', 'dd'].includes(node.type)); const values = new Map(); for (let i=0;i<cells.length;i+=2) values.set(cells[i].props.children[0],cells[i+1].props.children[0]);
  assert.equal(values.get('上下文'), '0'); assert.equal(values.get('输入价格'), '$0'); assert.equal(values.has('最大输出'), false); assert.equal(values.has('输出价格'), false); assert.equal(values.get('工具调用'), '否');
  const value=JSON.stringify(f.render()); for (const text of [worldViewCopy.priceUnit,...worldAttributions.map(item=>item.name)]) assert.ok(value.includes(text));
  assert.equal(JSON.stringify(dialog).includes('models.dev'), false);
});

test('模型世界只选双模型，第三项拒收，缺少赛制保留参数但不判定胜负', async () => {
  const models=Array.from({length:3},(_,i)=>worldModel('model-'+i,i===1?{scores:[],contextWindow:null,efforts:[],rating:{overall:null,tier:null,effort:null,composite:null,eci:null,reasoning:null,coding:null,agent:null,coverage:0}}:{}));
  const f=await fixture({world:async input=>({ok:true,value:worldReply(input,input.action==='compare'?input.ids.map(id=>models.find(model=>model.id===id)):models)})}); await worldReady(f,'发布时间线');
  worldAction(f,'加入对决 合成模型 model-0').props.onClick(); assert.equal(button(f.render(),'对决').props.disabled,true);
  worldAction(f,'加入对决 合成模型 model-1').props.onClick(); assert.equal(worldAction(f,'加入对决 合成模型 model-2').props.disabled,true);
  worldAction(f,'加入对决 合成模型 model-2').props.onClick(); await button(f.render(),'对决').props.onClick({currentTarget:{isConnected:true}});
  assert.deepEqual(f.calls.at(-1),['world',{action:'compare',ids:['model-0','model-1']}]);
  const dialog=nodes(f.render()).find(node=>node.type==='dialog'); assert.ok(JSON.stringify(dialog).includes(worldViewCopy.incomparable)); assert.equal(button(dialog,'开始对决').props.disabled,true);
  button(dialog,'关闭').props.onClick(); button(f.render(),'清空').props.onClick(); assert.equal(nodes(f.render()).some(node=>node.props.className==='ww-mw-selected'),false);
});

test('模型世界刷新后查询失败保留原画面，原请求重试不再次联网刷新', async () => {
  let failList=false; const inputs=[];
  const f=await fixture({world:async input=>{inputs.push(input);if(input.action==='refresh'){failList=true;return {ok:true,value:worldReply(input,[worldModel('one')])};}if(failList)return {ok:false,error:{code:'IO',message:'刷新后本地读取失败'}};return {ok:true,value:worldReply(input,[worldModel('one')])};}});
  await worldReady(f,'发布时间线'); await button(f.render(),'更新数据').props.onClick(); assert.ok(JSON.stringify(f.render()).includes('合成模型 one'));
  failList=false;await button(f.render(),'重试').props.onClick();assert.equal(inputs.filter(input=>input.action==='refresh').length,1);assert.equal(inputs.at(-1).action,'timeline');
});

test('模型世界待请求禁用入口，取消或卸载后迟到结果不替换旧画面', async () => {
  for(const unmount of [false,true]){const release=Promise.withResolvers();let blocked=false;
    const f=await fixture({world:async input=>{if(blocked)await release.promise;return {ok:true,value:worldReply(input,[worldModel(blocked?'late':'original')])};}});await worldReady(f,'发布时间线');blocked=true;
    const pending=button(f.render(),'更新数据').props.onClick();assert.equal(button(f.render(),'更新数据').props.disabled,true);
    if(unmount)f.unmount();else button(f.render(),'取消').props.onClick();release.resolve();await pending;
    const value=JSON.stringify(f.render());
    if(unmount) { assert.equal(nodes(f.render()).find(node => node.props['data-tab'] === 'experts').props['aria-pressed'], true); }
    else assert.ok(value.includes('合成模型 original'));
    assert.equal(value.includes('合成模型 late'),false);
    if(unmount) { blocked=false; const fresh=JSON.stringify(await worldReady(f,'发布时间线')); assert.ok(fresh.includes('合成模型 original')); assert.equal(fresh.includes('合成模型 late'),false); }
  }
});

test('资讯与模型世界拒收错动作、错身份和非法来源，不抹掉已接受内容', async () => {
  const f = await fixture({
    news: async input => ({ ok: true, value: input.action === 'report' ? { report: newsSavedReport({ fieldId: 'other' }) } : { report: null } }),
    world: async input => ({ ok: true, value: input.action === 'detail' ? worldReply(input, [worldModel('wrong')]) : worldReply({ action: 'status' }, []) }),
  });
  await assert.rejects(f.clients.cards.newsRequest({ action: 'list' }), { code: 'bad_reply' });
  await assert.rejects(f.clients.cards.newsRequest({ action: 'report', fieldId: defaultNewsField.id, cutoff: '2026-10-12T00:00:00.000Z' }), { code: 'bad_reply' });
  await assert.rejects(f.clients['model-world'].worldRequest({ action: 'list' }), { code: 'bad_reply' });
  await assert.rejects(f.clients['model-world'].worldRequest({ action: 'detail', id: 'wanted' }), { code: 'bad_reply' });
  const bad = await fixture({ world: async input => ({ ok: true, value: worldReply(input, [worldModel('one')], { attributions: [{ ...worldAttributions[0], url: 'javascript:alert(1)' }, ...worldAttributions.slice(1)] }) }) });
  await assert.rejects(bad.clients['model-world'].worldRequest({ action: 'list' }), { code: 'bad_reply' });
});



test('资讯新增领域与删除成功以宿主读回为准，空日报不自动生成', async () => {
  let fields = [structuredClone(defaultNewsField)]; const writes = [];
  const f = await fixture({ news: async input => {
    if (input.action === 'home') return { ok: true, value: newsHomeResult() };
    if (input.action === 'list') return { ok: true, value: newsList(fields) };
    if (input.action === 'report') return { ok: true, value: { report: null } };
    writes.push(input);
    if (input.action === 'save') { const field = { ...input.field, id: input.id, revision: 1, deleted: false }; fields.push(field); return { ok: true, value: { field } }; }
    assert.equal(input.action, 'remove'); const field = { ...fields.find(field => field.id === input.id), deleted: true, revision: 2 }; fields = fields.filter(field => field.id !== input.id); return { ok: true, value: { field } };
  } });
  await button(f.render(), '知识卡片').props.onClick(); await button(f.render(), '卡片设置').props.onClick(); nodes(f.render()).find(node => node.type === 'button' && node.props.className === 'ww-card ww-add-card').props.onClick();
  taskField(f, '领域名称', '企业软件'); taskField(f, '关注描述', '企业研发相关公开新闻');
  taskField(f, '来源名称', '公开技术订阅'); taskField(f, '公开 HTTPS 订阅地址', 'https://example.org/rss'); taskField(f, '来源性质', 'primary'); taskField(f, '来源地区', 'domestic');
  button(f.render(), '加入来源表单').props.onClick(); await button(f.render(), '添加').props.onClick();
  assert.equal(writes[0].expectedRevision, 0); assert.equal(writes[0].field.enabled, false); assert.match(writes[0].id, /^field-/);
  const card = nodes(f.render()).find(node => node.type === 'article' && nodes(node).some(child => child.type === 'h2' && child.props.children.includes('企业软件')));
  await button(card, '读取本期日报').props.onClick(); assert.ok(JSON.stringify(f.render()).includes('今日日报尚未生成'));
  button(card, '删除领域').props.onClick(); await button(f.render(), '确认修改领域').props.onClick();
  assert.equal(writes.at(-1).expectedRevision, 1); assert.equal(fields.length, 1);
  assert.equal(f.calls.some(call => ['create', 'execute'].includes(call[1]?.action)), false);
});


test('模型世界使用宿主主题，诊断和许可默认折叠且保持可达', async()=>{
 const f=await fixture({world:async input=>({ok:true,value:worldReply(input,[worldModel('one')])})});await worldReady(f);
 const tree=f.render(),css=nodes(tree).filter(node=>node.type==='style').map(node=>node.props.children.join('')).join('');
 assert.ok(css.includes('.ww-mw-dialog{position:fixed;'));assert.ok(css.includes('background:var(--dsw-alias-bg-layer-1)'));
 const about=nodes(tree).find(node=>node.type==='details'&&node.props.className==='ww-mw-about');assert.ok(about);assert.notEqual(about.props.open,true);
 for(const item of worldAttributions)assert.ok(JSON.stringify(about).includes(item.name));assert.ok(JSON.stringify(about).includes('数据生成于'));
});

test('模型世界详情和对决进入顶层dialog，关闭回原按钮且不丢筛选和列表',async()=>{
 for(const kind of ['detail','compare']){const models=[worldModel('a'),worldModel('b')];const events=[];
 const f=await fixture({world:async input=>({ok:true,value:worldReply(input,input.action==='detail'?[models[0]]:models)})});await worldReady(f,'发布时间线');taskField(f,'搜索模型或厂商','未提交的筛选');
 const origin={isConnected:true,focus:()=>events.push('origin')};if(kind==='detail')await worldAction(f,'详情 合成模型 a').props.onClick({currentTarget:origin});else{for(const id of ['a','b'])worldAction(f,'加入对决 合成模型 '+id).props.onClick();await button(f.render(),'对决').props.onClick({currentTarget:origin});}
 const tree=f.render(),dialog=nodes(tree).find(node=>node.type==='dialog');assert.ok(dialog);assert.equal(nodes(tree).some(node=>node.props.className==='ww-world-result'),false);
 const dom={open:false,showModal(){this.open=true;events.push('showModal');},close(){this.open=false;events.push('close');}};dialog.props.ref.current=dom;nodes(dialog).find(node=>node.type==='h2').props.ref.current={focus:()=>events.push('title')};f.flushEffects();assert.deepEqual(events,['showModal','title']);
 button(dialog,'关闭').props.onClick();f.render();assert.deepEqual(events,['showModal','title','close','origin']);assert.equal(taskField(f,'搜索模型或厂商').props.value,'未提交的筛选');assert.equal(nodes(f.render()).filter(node=>node.props.className==='ww-mw-model-row').length,2);
 }
});

test('模型世界失败详情仍在独立窗口重试，关闭时原按钮移除则回筛选入口',async()=>{
 let fail=true;const events=[];const f=await fixture({world:async input=>input.action==='detail'&&fail?{ok:false,error:{code:'IO',message:'详情暂不可读'}}:{ok:true,value:worldReply(input,[worldModel('one')])}});await worldReady(f,'发布时间线');
 await worldAction(f,'详情 合成模型 one').props.onClick({currentTarget:{isConnected:false,focus:()=>events.push('removed')}});
 let dialog=nodes(f.render()).find(node=>node.type==='dialog');assert.ok(JSON.stringify(dialog).includes(shown('IO', '详情暂不可读')));dialog.props.ref.current={open:false,showModal(){this.open=true;},close(){this.open=false;}};nodes(dialog).find(node=>node.type==='h2').props.ref.current={focus:()=>events.push('title')};taskField(f,'搜索模型或厂商').props.ref.current={focus:()=>events.push('fallback')};f.flushEffects();
 fail=false;await button(dialog,'重试').props.onClick();dialog=nodes(f.render()).find(node=>node.type==='dialog');assert.ok(JSON.stringify(dialog).includes('合成模型 one'));f.flushEffects();assert.deepEqual(events,['title']);button(dialog,'关闭').props.onClick();f.render();assert.deepEqual(events,['title','fallback']);
});

test('办公工坊和AI网页按最终导航顺序稳定挂载，切换与刷新不创建会话或自动联网', async () => {
  const f = await fixture();
  const first = f.render();
  assert.deepEqual(tabLabels(first), ['专家团队', 'AI 网页', '个人知识', '技能成长', '定时任务', '办公工坊', '知识卡片', '模型世界']);
  assert.equal(nodes(first).some(node => ['ToolboxView', 'AiWebView'].includes(node.type?.name)), false);
  const opened = new Map();
  const calls = f.calls.length;
  // 保活从首次主动打开开始；隐藏实例保留同一组件与 key，未登记刷新不制造空操作。
  for (const [label, name] of [['办公工坊', 'ToolboxView'], ['AI 网页', 'AiWebView'], ['办公工坊', 'ToolboxView']]) {
    await button(f.render(), label).props.onClick(); await settleView(f);
    const tree = f.render(), current = nodes(tree).find(node => node.type?.name === name);
    if (!opened.has(name)) opened.set(name, current);
    for (const original of opened.values()) {
      const view = nodes(tree).find(node => node.type === original.type);
      assert.ok(view); assert.equal(view.props.key, original.props.key);
      assert.equal(view.props.active, view.type.name === name);
    }
    assert.equal(nodes(tree).some(node => node.type === 'button' && node.props.children.includes('刷新')), false);
  }
  assert.equal(f.calls.length, calls); assert.equal(f.storage.size, 0);
});


async function browserCommit(f, advanceTimers = true) {
  for (let i = 0; i < 4; i++) {
    f.render(); f.flushEffects(); await new Promise(setImmediate);
    if (advanceTimers) for (const [id, timer] of [...f.timers]) if (timer.delay === 16) { f.timers.delete(id); timer.fn(); }
  }
}
function browserService() {
  const state = { mounted: undefined, presented: undefined, opened: [], leases: [] };
  state.service = {
    mounted: { getSnapshot: () => state.mounted },
    focusPresentation(id) { state.focused = id; state.focusEvents ??= []; state.focusEvents.push(['focus', id]); return () => { state.focusEvents.push(['restore', id]); state.focused = undefined; }; },
    presentSession(panel, id) { state.presented = id; state.leases.push(['present', id]); return () => { state.leases.push(['release', id]); if (state.presented === id) state.presented = undefined; }; },
    openTab(kind, options) { if (!state.mounted) throw new Error('sidebarRight: no session surface is mounted'); state.opened.push([state.mounted, kind, options]); },
  };
  return state;
}
const aiOpen = f => nodes(f.render()).find(node => node.type?.name === 'AiWebView').props.openBrowser;


test('中性工作台flush未知保留原身份，重试只重新确认；已认领旧会话不重建改模式', async () => {
  let fail = true;
  const f = await fixture({ confirmWorkbench: async () => fail ? { ok: true, value: { result: { kind: 'error', text: JSON.stringify({ code: 'PERSISTENCE', message: '尚未持久化' }) } } } : success({ action: 'workbench_confirm', persisted: true }) });
  await assert.rejects(f.workbenchSession.ensureWorkbench(), /没能确认结果/); const id = f.calls.find(call => call[0] === 'create')[1].sessionId;
  fail = false; assert.equal(await f.workbenchSession.ensureWorkbench(), id);
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1); assert.equal(f.calls.filter(call => call[0] === 'claim').length, 1); assert.equal(f.calls.filter(call => call[0] === 'confirm').length, 2);
  const reused = await fixture({ storage: f.storage, existing: f.existing }); assert.equal(await reused.workbenchSession.ensureWorkbench(), id);
  assert.equal(reused.calls.some(call => ['create', 'claim', 'confirm'].includes(call[0])), false);
});

test('AI网页原反例：无mounted时仅点击准备standard中性工作台，等待ready及真实commit后才打开', async () => {
  const sidebar = browserService(), ready = Promise.withResolvers();
  const f = await fixture({ sidebarRight: sidebar.service, retainReady: ready.promise });
  f.render(); f.flushEffects(); await button(f.render(), 'AI 网页').props.onClick(); await browserCommit(f);
  assert.equal(f.calls.length, 0); assert.equal(sidebar.leases.length, 0);
  const pending = aiOpen(f)('https://chat.deepseek.com/');
  await browserCommit(f); assert.equal(sidebar.leases.length, 0); assert.equal(sidebar.opened.length, 0);
  assert.equal(f.calls.find(call => call[0] === 'create')[1].agentPreset, 'standard');
  assert.equal(f.calls.filter(call => call[0] === 'confirm').length, 1);
  assert.equal(f.calls.some(call => ['prepareModel', 'prompt', 'knowledge'].includes(call[0]) || call[0] === 'command' && call[2].includes('status')), false);
  ready.resolve(); await browserCommit(f); assert.ok(sidebar.presented); assert.equal(sidebar.opened.length, 0);
  sidebar.mounted = sidebar.presented; await browserCommit(f); await pending;
  assert.deepEqual(sidebar.opened, [[sidebar.presented, 'browser', { params: { url: 'https://chat.deepseek.com/' } }]]);
  await button(f.render(), '专家团队').props.onClick(); await browserCommit(f);
  assert.equal(sidebar.presented, undefined); assert.equal(f.calls.filter(call => call[0] === 'release').length, 1);
});

test('AI网页同屏复用可见就绪小鲸唯一租约，不新建中性会话或准备模型', async () => {
  const sidebar = browserService(); const f = await fixture({ sidebarRight: sidebar.service }); const a = await mountedAssistant(f);
  assert.equal(sidebar.presented, a.reference.sessionId); sidebar.mounted = sidebar.presented;
  await button(f.render(), 'AI 网页').props.onClick(); await browserCommit(f); const before = f.calls.length;
  const pending = aiOpen(f)('https://chat.deepseek.com/'); await browserCommit(f); await pending;
  assert.equal(f.calls.length, before); assert.equal(sidebar.leases.length, 1); assert.equal(sidebar.opened[0][0], a.reference.sessionId);
  button(f.render(), '收起助手').props.onClick(); await browserCommit(f); assert.equal(sidebar.presented, undefined);
  f.unmount();
});

for (const exit of ['page', 'abort', 'timeout', 'unmount', 'identity']) test('AI网页等待挂载时' + exit + '停止交付并释放中性引用与租约', async () => {
  const sidebar = browserService(), f = await fixture({ sidebarRight: sidebar.service }), controller = new AbortController();
  f.render(); f.flushEffects(); await button(f.render(), 'AI 网页').props.onClick(); await browserCommit(f);
  const pending = aiOpen(f)('https://chat.deepseek.com/', controller.signal); const rejected = assert.rejects(pending);
  await browserCommit(f); assert.ok(sidebar.presented); const id = sidebar.presented;
  if (exit === 'page') await button(f.render(), '专家团队').props.onClick();
  if (exit === 'abort') controller.abort(new Error('员工取消'));
  if (exit === 'timeout') { const timer = [...f.timers].find(([, value]) => value.delay === 15000); f.timers.delete(timer[0]); timer[1].fn(); }
  if (exit === 'unmount') f.unmount();
  if (exit === 'identity') { await button(f.render(), '开始与小鲸协作').props.onClick(); }
  if (exit !== 'unmount') await browserCommit(f); await rejected;
  if (exit !== 'unmount') await browserCommit(f);
  assert.equal(sidebar.opened.length, 0); assert.ok(sidebar.leases.some(item => item[0] === 'release' && item[1] === id));
  assert.equal(f.calls.filter(item => item[0] === 'release' && item[1] === id).length, 1);
  assert.equal([...f.timers.values()].some(timer => timer.delay === 16 || timer.delay === 15000), false);
});


test('AI网页ready前取消释放引用，迟到ready不呈现；浏览器失败后原工作台身份可重试', async () => {
  const ready = Promise.withResolvers(), sidebar = browserService();
  const f = await fixture({ sidebarRight: sidebar.service, retainReady: ready.promise }), controller = new AbortController();
  f.render(); f.flushEffects(); await button(f.render(), 'AI 网页').props.onClick(); await browserCommit(f);
  const pending = aiOpen(f)('https://chat.deepseek.com/', controller.signal), rejected = assert.rejects(pending); await browserCommit(f);
  controller.abort(); await rejected; ready.resolve(); await browserCommit(f);
  assert.equal(sidebar.leases.length, 0); assert.equal(f.calls.filter(call => call[0] === 'release').length, 1);
  const id = f.calls.find(call => call[0] === 'create')[1].sessionId;
  sidebar.service.openTab = () => { throw new Error('浏览器插件尚未就绪'); };
  const failed = aiOpen(f)('https://chat.deepseek.com/'), checkFailed = assert.rejects(failed, /浏览器插件尚未就绪/);
  await browserCommit(f); sidebar.mounted = sidebar.presented; await browserCommit(f); await checkFailed; await browserCommit(f);
  assert.equal(sidebar.presented, undefined); assert.equal(f.calls.filter(call => call[0] === 'create').length, 1); assert.equal(f.calls.filter(call => call[0] === 'release').length, 2);
  sidebar.service.openTab = (kind, options) => sidebar.opened.push([sidebar.mounted, kind, options]);
  const retried = aiOpen(f)('https://chat.deepseek.com/'); await browserCommit(f); await retried;
  assert.equal(sidebar.opened[0][0], id); assert.equal(f.calls.filter(call => call[0] === 'create').length, 1); f.unmount();
});


test('AI网页认领确认未返回时小鲸取得再释放呈现身份，确认迟到不补发原网页', async () => {
  const confirm = Promise.withResolvers(), sidebar = browserService();
  const f = await fixture({ sidebarRight: sidebar.service, confirmWorkbench: () => confirm.promise });
  f.render(); f.flushEffects(); await button(f.render(), 'AI 网页').props.onClick(); await browserCommit(f);
  const pending = aiOpen(f)('https://chat.deepseek.com/');
  let result = 'pending'; pending.then(() => { result = 'opened'; }, () => { result = 'cancelled'; });
  await browserCommit(f); assert.equal(f.calls.filter(call => call[0] === 'confirm').length, 1);
  await button(f.render(), '开始与小鲸协作').props.onClick(); await browserCommit(f);
  const assistantId = sidebar.presented; assert.ok(assistantId);
  button(f.render(), '收起助手').props.onClick(); await browserCommit(f);
  confirm.resolve(success({ action: 'workbench_confirm', persisted: true })); await browserCommit(f);
  sidebar.mounted = sidebar.presented; await browserCommit(f); await pending.catch(() => {});
  assert.equal(result, 'cancelled'); assert.deepEqual(sidebar.opened, []);
  assert.deepEqual(sidebar.leases, [['present', assistantId], ['release', assistantId]]);
  assert.equal([...f.timers.values()].some(timer => timer.delay === 16 || timer.delay === 15000), false);
});


test('AI网页浏览器类型未注册时公开查询显示缺服务，不准备工作台且不猜错误字符串', async () => {
  const sidebar = browserService(); const f = await fixture({ sidebarRight: sidebar.service, browserTabs: { get: () => undefined } });
  f.render(); f.flushEffects(); await button(f.render(), 'AI 网页').props.onClick(); await browserCommit(f);
  await assert.rejects(aiOpen(f)('https://chat.deepseek.com/'), /内置浏览器还没就绪/);
  assert.equal(f.calls.length, 0); assert.deepEqual(sidebar.leases, []); assert.deepEqual(sidebar.opened, []);
});

test('AI网页API只向准确mounted会话交付，缺失或换身份不补发', async () => {
  let mounted = 'session-one'; const opened = [];
  const f = await fixture({ sidebarRight: { mounted: { getSnapshot: () => mounted }, openTab: (...args) => opened.push(args) } });
  await f.clients['ai-web'].openBrowser('https://chat.deepseek.com/', 'session-one');
  assert.deepEqual(opened, [['browser', { params: { url: 'https://chat.deepseek.com/' } }]]);
  mounted = 'other'; await assert.rejects(f.clients['ai-web'].openBrowser('https://chat.deepseek.com/', 'session-one'), /浏览器/);
  assert.equal(opened.length, 1);
});

test('同一个AI只占一个网页标签：已开着就切回去，被关掉后才新开', async () => {
  const tabs = [], opened = [], focused = [];
  const f = await fixture({ sidebarRight: { mounted: { getSnapshot: () => 'session-one' }, tabsIn: () => tabs.map(id => ({ id, kind: 'browser' })), focus: id => focused.push(id), openTab: (...args) => { opened.push(args); tabs.push(`tab-${opened.length}`); } } });
  await f.clients['ai-web'].openBrowser('https://chat.deepseek.com/', 'session-one', 'deepseek');
  await f.clients['ai-web'].openBrowser('https://www.kimi.com/', 'session-one', 'kimi');
  await f.clients['ai-web'].openBrowser('https://chat.deepseek.com/', 'session-one', 'deepseek');
  assert.equal(opened.length, 2); assert.deepEqual(focused, ['tab-1']);
  tabs.splice(0, 1);
  await f.clients['ai-web'].openBrowser('https://chat.deepseek.com/', 'session-one', 'deepseek');
  assert.equal(opened.length, 3); assert.deepEqual(focused, ['tab-1']);
  await f.clients['ai-web'].openBrowser('https://chat.deepseek.com/', 'session-one', 'deepseek');
  assert.deepEqual(focused, ['tab-1', 'tab-3']);
});

test('模型世界排序读取失败保留已接受方向，重试只读取待确认排序', async () => {
  let fail = true;
  const f = await fixture({ world: async input => input.direction === 'asc' && fail ? { ok: false, error: { code: 'IO', message: '读取失败' } } : { ok: true, value: worldReply(input, [worldModel('one')]) } });
  await worldReady(f, '实力榜');
  await worldSort(f).props.onClick();
  assert.ok(JSON.stringify(worldSort(f).props.children).includes('从高到低'));
  fail = false; await button(f.render(), '重试').props.onClick();
  assert.ok(JSON.stringify(worldSort(f).props.children).includes('从低到高'));
});

test('模型世界持久恢复未知按后端原因展示，不声称确定没有保存', async () => {
  const f = await fixture({ world: async input => ({ ok: true, value: worldReply(input, [worldModel('one')], { lastRefresh: { status: 'error', code: 'WORLD_STORAGE_UNKNOWN', message: '持久结果恢复未确认，请核对本地存储' } }) }) });
  await worldReady(f);
  const text = JSON.stringify(f.render()); assert.ok(text.includes('持久结果恢复未确认，请核对本地存储'));
  assert.equal(text.includes('更新失败，保留旧快照'), false);
});

test('定时默认模板与组件缺失帮助不创建会话、不读取知识来源、不调用模型', async () => {
  for (const available of [true, false]) {
    const f = await fixture({ automation: async input => { assert.equal(input.action, 'catalog'); return taskCatalog([], [], available); } });
    await button(f.render(), '定时任务').props.onClick();
    const sections = nodes(f.render()).filter(node => node.type === 'h2');
    assert.equal(sections[0].props.children[0], '定时任务');
    assert.ok(JSON.stringify(f.render()).includes('DSH 工作知识整理'));
    assert.equal(button(f.render(), '设置并启用').props.disabled, false);
    assert.equal(button(f.render(), '新增定时任务').props.disabled, false);
    assert.deepEqual(f.calls, [['automation', { action: 'catalog' }]]);
    assert.equal(f.storage.size, 0);
    assert.equal(nodes(f.render()).some(node => node.props.children.includes('允许沉淀的会话')), false);
    if (!available) assert.ok(nodes(f.render()).some(node => node.props.children.some(value => typeof value === 'string' && value.includes('新版请检查 DSH 启动日志并重启'))));
  }
});

test('定时自建表单完整适配六种时间选择，standard独立会话先人工claim再创建', async () => {
  const cases = [
    ['after_seconds', { after_seconds: 90 }, [['秒数', '90']]],
    ['at', { at: '2026-10-15T08:00:00+08:00' }, [['时间（含时区的 ISO 日期）', '2026-10-15T08:00:00+08:00']]],
    ['every_seconds', { every_seconds: 3600 }, [['秒数', '3600']]],
    ['daily', { daily: { time: '08:05:00', time_zone: 'Asia/Shanghai' } }, [['每日时间', '08:05']]],
    ['weekly', { weekly: { time: '08:05:00', time_zone: 'Asia/Shanghai', weekdays: [1, 3, 5] } }, [['每日时间', '08:05'], ['星期（1 周一至 7 周日）', '1,3,5']]],
    ['cron', { cron: { expression: '0 9 * * 1-5', time_zone: 'Asia/Shanghai' } }, [['Cron 表达式', '0 9 * * 1-5']]],
  ];
  for (const [rule, timing, fields] of cases) {
    const tasks = []; let submitted;
    const f = await fixture({ automation: async input => {
      if (input.action === 'catalog') return taskCatalog(tasks);
      assert.equal(input.action, 'create'); submitted = input;
      const record = taskRecord({ title: input.spec.title, prompt: input.spec.prompt });
      tasks.push({ ...record, sessionId: input.sessionId, status: 'active', purpose: 'custom' });
      return { ok: true, value: { task: record, recovered: false } };
    } });
    await button(f.render(), '定时任务').props.onClick(); button(f.render(), '新增定时任务').props.onClick();
    assert.equal(JSON.stringify(f.render()).includes('工作目录'), false, '定时任务统一执行目录，不让员工填写');
    taskField(f, '任务名称', '自己的任务'); taskField(f, '工作指令', '本地原始指令');
    taskField(f, '时间规则', rule); for (const [label, value] of fields) taskField(f, label, value);
    await button(f.render(), '确认创建计划').props.onClick();
    assert.deepEqual(submitted.spec, { title: '自己的任务', prompt: '本地原始指令', ...timing });
    const created = f.calls.find(([kind]) => kind === 'create')[1];
    assert.deepEqual(created, { sessionId: submitted.sessionId, cwd: 'E:\\DSH\\whalewing-tasks', agentPreset: 'standard' });
    assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
    assert.ok(f.calls.findIndex(([kind]) => kind === 'automationClaim') < f.calls.findIndex(([kind, input]) => kind === 'automation' && input.action === 'create'));
    assert.equal(f.calls.some(([kind]) => ['expert', 'knowledge', 'prompt'].includes(kind)), false);
    assert.equal(f.clients.automation.pendingAutomation(), null); assert.equal(f.storage.size, 0);
  }
});

test('定时内置整理只提交时间选择，采用北京时间默认且不复制业务指令', async () => {
  const tasks = []; let submitted;
  const f = await fixture({ automation: async input => {
    if (input.action === 'catalog') return taskCatalog(tasks);
    submitted = input;
    const record = taskRecord({ title: 'DSH 工作知识整理', prompt: '仅由后端owner给出的指令' });
    tasks.push({ ...record, sessionId: input.sessionId, status: 'active', purpose: 'knowledge' });
    return { ok: true, value: { task: record, recovered: false } };
  } });
  await button(f.render(), '定时任务').props.onClick(); button(f.render(), '设置并启用').props.onClick();
  assert.equal(nodes(f.render()).some(node => node.type === 'label' && node.props.children.includes('时区')), false);
  const timeRow = nodes(f.render()).find(node => node.props.className === 'ww-task-time');
  assert.ok(JSON.stringify(timeRow).includes('北京时间'));
  assert.ok(nodes(timeRow).some(node => node.type === 'input' && node.props.type === 'time'));
  assert.equal(nodes(f.render()).some(node => node.type === 'textarea'), false);
  await button(f.render(), '确认创建计划').props.onClick();
  assert.equal(submitted.purpose, 'knowledge');
  assert.deepEqual(submitted.spec, { daily: { time: '00:15:00', time_zone: 'Asia/Shanghai' } });
  assert.equal(f.calls.some(([kind]) => ['knowledge', 'expert', 'prompt'].includes(kind)), false);
});

test('定时创建回执未知只保存身份，刷新和重载回读已接受计划不重投', async () => {
  const tasks = [];
  const automation = async input => {
    if (input.action === 'catalog') return taskCatalog(tasks);
    assert.equal(input.action, 'create');
    tasks.push({ ...taskRecord(), sessionId: input.sessionId, status: 'active', purpose: 'custom' });
    throw new Error('创建回执丢失');
  };
  const f = await fixture({ automation });
  const draft = { purpose: 'custom', cwd: 'E:\\不应缓存的工程', spec: { title: '私人标题', prompt: '不应缓存的工作原文', daily: { time: '08:00:00', time_zone: 'Asia/Shanghai' } } };
  await assert.rejects(f.clients.automation.createAutomation(draft, false), /创建回执丢失/);
  const pending = f.clients.automation.pendingAutomation();
  assert.deepEqual([...f.storage.values()], [JSON.stringify({ sessionId: pending.sessionId, purpose: 'custom' })]);
  await assert.rejects(f.clients.automation.createAutomation(draft, false), { code: 'automation_pending' });
  const resumed = await fixture({ automation, storage: f.storage, existing: f.existing, automationClaims: f.automationClaims, workspaceState: f.ctx.workspaces.list.getSnapshot() });
  await button(resumed.render(), '定时任务').props.onClick();
  assert.ok(button(resumed.render(), '查看原会话和计划'));
  await button(resumed.render(), '查看原会话和计划').props.onClick();
  assert.equal(resumed.clients.automation.pendingAutomation(), null);
  assert.equal(resumed.calls.some(([kind, input]) => kind === 'create' || kind === 'automation' && input.action === 'create'), false);
  assert.equal(resumed.storage.size, 0);
});

test('定时未接受计划重载后重新填写并明确继续，复用同一准确会话身份', async () => {
  const tasks = []; let failed = true;
  const automation = async input => {
    if (input.action === 'catalog') return taskCatalog(tasks);
    if (failed) throw new Error('模型配置缺失');
    const record = taskRecord({ title: input.spec.title, prompt: input.spec.prompt });
    tasks.push({ ...record, sessionId: input.sessionId, status: 'active', purpose: 'custom' });
    return { ok: true, value: { task: record, recovered: false } };
  };
  const f = await fixture({ automation });
  await assert.rejects(f.clients.automation.createAutomation({ purpose: 'custom', cwd: 'E:\\工作', spec: { title: '旧稿', prompt: '旧稿正文', after_seconds: 60 } }, false), /模型配置缺失/);
  const id = f.clients.automation.pendingAutomation().sessionId;
  failed = false;
  const resumed = await fixture({ automation, storage: f.storage, existing: f.existing, automationClaims: f.automationClaims, workspaceState: f.ctx.workspaces.list.getSnapshot() });
  await button(resumed.render(), '定时任务').props.onClick(); await button(resumed.render(), '查看原会话和计划').props.onClick();
  assert.equal(resumed.calls.some(([kind]) => kind === 'create'), false);
  button(resumed.render(), '继续编辑草稿').props.onClick();
  assert.equal(taskField(resumed, '工作指令').props.value, '');
  taskField(resumed, '任务名称', '重新填写'); taskField(resumed, '工作指令', '明确重新提交');
  await button(resumed.render(), '继续原会话创建').props.onClick();
  assert.equal(resumed.calls.some(([kind]) => kind === 'create'), false);
  assert.equal(resumed.calls.find(([kind]) => kind === 'automationClaim')[1], id);
  assert.equal(resumed.calls.filter(([kind, input]) => kind === 'automation' && input.action === 'create').length, 1);
  assert.equal(resumed.clients.automation.pendingAutomation(), null);
});

test('定时创建期间取消保留原身份，迟到会话回执不继续claim或投递', async () => {
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  const f = await fixture({ create: async request => { started.resolve(request); await release.promise; return { ok: true, value: { sessionId: request.sessionId, agentPreset: 'standard' } }; } });
  const controller = new AbortController();
  const pending = f.clients.automation.createAutomation({ purpose: 'custom', cwd: 'E:\\工作', spec: { title: '检查', prompt: '检查目录', after_seconds: 60 } }, false, controller.signal);
  const rejected = assert.rejects(pending, /用户取消/);
  const created = await started.promise; controller.abort(new Error('用户取消')); release.resolve(); await rejected;
  assert.equal(f.clients.automation.pendingAutomation().sessionId, created.sessionId);
  assert.equal(f.calls.some(([kind, input]) => kind === 'automationClaim' || kind === 'automation' && input.action === 'create'), false);
});

test('定时编辑使用完整原生record做CAS，冲突回读保留草稿且不自动重新提交', async () => {
  let record = taskRecord(), conflict = true;
  const updates = [];
  const f = await fixture({ automation: async input => {
    if (input.action === 'catalog') return taskCatalog([{ ...record, sessionId: 'auto-1', status: 'active', purpose: 'custom' }]);
    if (input.action === 'read') return { ok: true, value: { task: record, displayPrompt: record.prompt, purpose: 'custom', status: 'active' } };
    assert.equal(input.action, 'update'); updates.push(input);
    if (conflict) { conflict = false; record = { ...record, title: '另一处新版本' }; return { ok: true, value: { id: record.id, updated: false, code: 'schedule_conflict' } }; }
    assert.deepEqual(input.expected, record);
    record = { ...record, title: input.title, prompt: input.prompt };
    return { ok: true, value: { id: record.id, updated: true, record } };
  } });
  await button(f.render(), '定时任务').props.onClick(); await button(f.render(), '编辑计划').props.onClick();
  const original = structuredClone(record);
  taskField(f, '任务名称', '员工保留的新名称'); taskField(f, '工作指令', '员工保留的新指令');
  await button(f.render(), '保存计划').props.onClick();
  assert.deepEqual(updates[0].expected, original);
  assert.equal(Object.hasOwn(updates[0].expected, 'purpose'), false); assert.equal(Object.hasOwn(updates[0].expected, 'sessionId'), false);
  assert.equal(Object.hasOwn(updates[0], 'change'), false);
  assert.equal(taskField(f, '任务名称').props.value, '员工保留的新名称');
  assert.ok(nodes(f.render()).some(node => node.props.role === 'alert' && node.props.children.includes(shown('schedule_conflict'))));
  await button(f.render(), '读取最新版本（保留草稿）').props.onClick();
  assert.equal(updates.length, 1); assert.equal(taskField(f, '工作指令').props.value, '员工保留的新指令');
  await button(f.render(), '保存计划').props.onClick();
  assert.equal(updates.length, 2); assert.equal(record.title, '员工保留的新名称');
  assert.equal(nodes(f.render()).some(node => node.type === 'textarea'), false);
});

test('定时编辑时间适配原生change，知识指令不可编辑且写后回读失败保留表单', async () => {
  let record = taskRecord({ title: 'DSH 工作知识整理', prompt: '后端知识指令' }), breakRead = false;
  const updates = [];
  const f = await fixture({ automation: async input => {
    if (input.action === 'catalog') return taskCatalog([{ ...record, sessionId: 'auto-knowledge', status: 'active', purpose: 'knowledge' }]);
    if (input.action === 'read') return breakRead ? { ok: false, error: { code: 'IO', message: '已提交后的读取中断' } } : { ok: true, value: { task: record, displayPrompt: record.prompt, purpose: 'knowledge', status: 'active' } };
    assert.equal(input.action, 'update'); updates.push(input); record = { ...record, time: input.change.daily.time }; breakRead = true;
    return { ok: true, value: { id: record.id, updated: true, record } };
  } });
  await button(f.render(), '定时任务').props.onClick(); await button(f.render(), '编辑计划').props.onClick();
  assert.equal(nodes(f.render()).some(node => node.type === 'textarea'), false);
  taskField(f, '每日时间', '09:30'); await button(f.render(), '保存计划').props.onClick();
  assert.deepEqual(updates[0].change, { kind: 'daily', daily: { time: '09:30:00', time_zone: 'Asia/Shanghai' } });
  assert.equal(Object.hasOwn(updates[0], 'prompt'), false);
  assert.equal(taskField(f, '每日时间').props.value, '09:30');
  assert.ok(button(f.render(), '读取最新版本（保留草稿）'));
  breakRead = false; await button(f.render(), '读取最新版本（保留草稿）').props.onClick();
  assert.equal(updates.length, 1);
});

test('定时取消明确说明历史影响，失败保留卡片，成功回读后恢复未启用模板', async () => {
  let tasks = [{ ...taskRecord({ title: 'DSH 工作知识整理' }), sessionId: 'knowledge-1', purpose: 'knowledge', status: 'active' }], failDelete = true;
  const f = await fixture({ automation: async input => {
    if (input.action === 'catalog') return taskCatalog(tasks);
    assert.equal(input.action, 'delete');
    if (failDelete) return { ok: false, error: { code: 'IO', message: '取消尚未成功' } };
    tasks = []; return { ok: true, value: { id: input.id, deleted: true } };
  } });
  await button(f.render(), '定时任务').props.onClick(); button(f.render(), '取消计划').props.onClick();
  assert.equal(f.calls.some(([kind, input]) => kind === 'automation' && input.action === 'delete'), false);
  assert.ok(nodes(f.render()).some(node => node.props.children.some(value => typeof value === 'string' && value.includes('执行记录会一并删除'))));
  const confirm = () => nodes(f.render()).filter(node => node.type === 'button' && node.props.children.includes('取消计划')).at(-1);
  await confirm().props.onClick(); assert.ok(button(f.render(), '打开原会话'));
  failDelete = false; await confirm().props.onClick();
  assert.equal(button(f.render(), '设置并启用').props.disabled, false);
  assert.equal(f.calls.some(([kind]) => kind === 'create'), false);
});

test('定时旧计划只定位历史与取消，不认领为新自动任务或静默并行启用', async () => {
  let old = [{ ...taskRecord({ title: '旧知识任务' }), sessionId: 'old-workbench', status: 'active' }];
  const f = await fixture({ automation: async input => {
    if (input.action === 'catalog') return taskCatalog([], old);
    assert.equal(input.action, 'delete'); assert.equal(input.sessionId, 'old-workbench'); old = [];
    return { ok: true, value: { id: input.id, deleted: true } };
  } });
  await button(f.render(), '定时任务').props.onClick();
  assert.equal(button(f.render(), '设置并启用').props.disabled, true);
  assert.equal(nodes(f.render()).some(node => node.type === 'button' && node.props.children.includes('编辑计划')), false);
  button(f.render(), '取消计划').props.onClick();
  await nodes(f.render()).filter(node => node.type === 'button' && node.props.children.includes('取消计划')).at(-1).props.onClick();
  assert.equal(button(f.render(), '设置并启用').props.disabled, false);
  assert.equal(f.calls.some(([kind]) => ['create', 'automationClaim'].includes(kind)), false);
});

test('定时历史按nextBefore加载，游标错误保留原页且投递不冒称执行成功', async () => {
  const task = { ...taskRecord(), sessionId: 'auto-1', purpose: 'custom', status: 'inactive' };
  let failPage = true;
  const inputs = [];
  const f = await fixture({ automation: async input => {
    if (input.action === 'catalog') return taskCatalog([task]);
    assert.equal(input.action, 'history'); inputs.push(input);
    if (input.before && failPage) return { ok: true, value: { id: task.id, code: 'delivery_cursor_not_found' } };
    return { ok: true, value: { id: task.id, records: [input.before ? { scheduledAt: '2026-10-11T00:00:00Z', deliveredAt: '2026-10-11T01:30:00Z', messageId: 'older', prompt: '已投递原文 <whalewing-workspaces>', status: 'completed' } : { scheduledAt: '2026-10-12T00:00:00Z', deliveredAt: '2026-10-12T00:00:01Z', messageId: 'newest', prompt: '已投递原文' }], earlierRecordsUnavailable: true, earlierRecordsPruned: true, retention: { days: 30, records: 100 }, ...(!input.before ? { nextBefore: 'newest' } : {}) } };
  } });
  await button(f.render(), '定时任务').props.onClick(); await button(f.render(), '执行记录').props.onClick();
  assert.ok(nodes(f.render()).some(node => node.props.children.includes('结果取自任务会话里那一次的结束情况；查不到时显示“结果未知”，不代表成功或失败')));
  await button(f.render(), '加载更早记录').props.onClick();
  const rows = () => nodes(nodes(f.render()).find(node => node.type === 'section' && node.props['aria-label'] === '执行记录')).filter(node => node.props.className === 'ww-task-run').map(node => [node.props.children].flat().join(''));
  assert.deepEqual(rows(), ['10/12 08:00 · 结果未知'], '游标错误保留原页；没有结果的送达不冒称成功');
  failPage = false; await button(f.render(), '加载更早记录').props.onClick();
  assert.equal(inputs[1].before, 'newest'); assert.equal(inputs[2].before, 'newest');
  const history = nodes(f.render()).find(node => node.type === 'section' && node.props['aria-label'] === '执行记录');
  assert.deepEqual(rows(), ['10/12 08:00 · 结果未知', '10/11 08:00 · 完成 · 10/11 09:30 补上']);
  const shown = nodes(history).flatMap(node => [node.props?.children].flat().filter(value => typeof value === 'string')).join('|');
  for (const raw of ['newest', 'older', '已投递原文', 'whalewing-workspaces', '2026-10-1']) assert.equal(shown.includes(raw), false, raw);
  assert.equal(nodes(f.render()).some(node => node.type === 'button' && node.props.children.includes('加载更早记录')), false);
});

test('定时输入和返回遵守独立严格schema，坏目录响应不清空已显示计划', async () => {
  let malformed = false;
  const f = await fixture({ automation: async input => {
    assert.equal(input.action, 'catalog');
    return malformed ? { ok: true, value: { available: true, tasks: [], extra: true } } : taskCatalog([{ ...taskRecord(), sessionId: 'auto-1', purpose: 'custom', status: 'active' }]);
  } });
  await button(f.render(), '定时任务').props.onClick(); malformed = true;
  await button(f.render(), '刷新').props.onClick();
  assert.ok(button(f.render(), '编辑计划'));
  assert.ok(nodes(f.render()).some(node => node.props.role === 'alert' && node.props.children.includes('插件收到的结果不完整，请重试')));
  const count = f.calls.length;
  await assert.rejects(f.clients.automation.automationRequest({ action: 'create', purpose: 'knowledge', sessionId: 'x', spec: { title: '越权标题', prompt: '越权指令', daily: { time: '08:00:00', time_zone: 'Asia/Shanghai' } } }));
  assert.equal(f.calls.length, count);
});

test('定时草稿跨标签和收起保留，放弃需确认且不生成任务', async () => {
  const f = await fixture();
  await button(f.render(), '定时任务').props.onClick(); button(f.render(), '新增定时任务').props.onClick();
  taskField(f, '任务名称', '未提交草稿'); taskField(f, '工作指令', '原始工作指令');
  await button(f.render(), '专家团队').props.onClick(); await button(f.render(), '定时任务').props.onClick();
  assert.equal(taskField(f, '工作指令').props.value, '原始工作指令');
  button(f.render(), '收起任务草稿').props.onClick(); button(f.render(), '继续编辑草稿').props.onClick();
  assert.equal(taskField(f, '任务名称').props.value, '未提交草稿');
  button(f.render(), '放弃任务草稿').props.onClick(); button(f.render(), '取消').props.onClick();
  assert.equal(taskField(f, '工作指令').props.value, '原始工作指令');
  button(f.render(), '放弃任务草稿').props.onClick();
  nodes(f.render()).filter(node => node.type === 'button' && node.props.children.includes('放弃任务草稿')).at(-1).props.onClick();
  assert.equal(f.calls.some(([kind]) => ['create', 'automationClaim'].includes(kind)), false);
  assert.equal(nodes(f.render()).some(node => node.type === 'textarea'), false);
});

test('定时原生会话回执丢失与坏恢复缓存不触发第二身份或其他渠道', async () => {
  const f = await fixture({ create: async () => { throw new Error('会话接受状态未知'); } });
  const draft = { purpose: 'custom', cwd: 'E:\\任务', spec: { title: '任务', prompt: '任务正文', after_seconds: 60 } };
  await assert.rejects(f.clients.automation.createAutomation(draft, false), /会话接受状态未知/);
  const identity = f.clients.automation.pendingAutomation().sessionId;
  await assert.rejects(f.clients.automation.createAutomation(draft, false), { code: 'automation_pending' });
  assert.equal(f.clients.automation.pendingAutomation().sessionId, identity);
  const cache = new Map([['whalewing:automation-pending:http://fixture.local', '{bad']]);
  const corrupt = await fixture({ storage: cache });
  await button(corrupt.render(), '定时任务').props.onClick();
  assert.equal(button(corrupt.render(), '新增定时任务').props.disabled, true);
  await assert.rejects(corrupt.clients.automation.createAutomation(draft, false), { code: 'automation_cache' });
  assert.equal(corrupt.calls.some(([kind]) => kind === 'create'), false);
});

test('真实模块工厂注册宿主和工作台 slots，纯渲染不创建会话', async () => {
  const f = await fixture();
  assert.deepEqual([...f.entries.keys()].sort(), ['sidebar.panellist', 'main', 'whalewing.workbench.tab', 'whalewing.workbench.dock', 'browser.toolbar.actions', 'conversation.session.header.actions', 'conversation.input.left', 'conversation.hero.actions', 'whalewing.assistant.conversation', 'tool.call.toolview', 'shell.overlay', 'plugins.detail.section'].sort());
  assert.equal(f.entries.get('tool.call.toolview').options.key, 'whalewing_handoff');
  assert.equal(typeof f.entries.get('browser.toolbar.actions').Component, 'function');
  assert.equal(f.entries.get('browser.toolbar.actions').options.id, 'whalewing-ai-picker');
  assert.equal(f.entries.get('main').options.key, 'whalewing');
  assert.equal(f.entries.get('sidebar.panellist').options.id, 'whalewing');
  f.render();
  assert.deepEqual(f.calls, []);
  assert.equal(f.dictionaries.size, 2);
  f.disposed.forEach((dispose) => dispose());
  assert.equal(f.dictionaries.size, 0);
});

test('统一知识请求遵循真实命令与嵌套结果契约', async () => {
  const f = await fixture({ execute: async (...args) => { f.calls.push(args); return success({ notes: [], truncated: false }); } });
  assert.deepEqual(await f.bridge.request('session-1', { action: 'search', query: '中文' }), { notes: [], truncated: false });
  assert.deepEqual(f.calls[0], ['session-1', '/whalewing {"action":"search","query":"中文"}', []]);
});

test('未选择会话时阻断请求且不隐式创建', async () => {
  const f = await fixture();
  await assert.rejects(f.bridge.request('', { action: 'status' }), { code: 'session_required' });
  assert.deepEqual(f.calls, []);
});

test('Remote、命令缺失与畸形响应均保留失败', async () => {
  for (const [reply, expected] of [
    [{ ok: false, error: { code: 'unavailable', message: '连接未就绪' } }, 'unavailable'],
    [{ ok: true, value: undefined }, 'command_missing'],
    [{ ok: true, value: { result: { kind: 'success', text: '<html>' } } }, 'bad_reply'],
  ]) {
    const f = await fixture({ execute: async () => reply });
    await assert.rejects(f.bridge.request('s', { action: 'status' }), { code: expected });
  }
});

test('Host 内容冲突代码穿透到编辑器而不伪装成功', async () => {
  const f = await fixture({ execute: async () => ({ ok: true, value: { result: { kind: 'error', text: JSON.stringify({ code: 'conflict', message: '内容已修改' }) } } }) });
  await assert.rejects(f.bridge.request('s', { action: 'write' }), { code: 'conflict', detail: '内容已修改', message: shown('conflict', '内容已修改') });
});

test('专家选择独立于模式，创建优先使用工程路径', async () => {
  const f = await fixture();
  assert.equal(await f.clients.experts.createExpert('development', { cwd: ' E:\\工程 ', workspaceId: 'w1' }), 'new-session');
  assert.deepEqual(f.workspaceCalls, [['create', 'E:\\工程']]);
  assert.deepEqual(f.calls[0], ['create', { workspaceId: 'workspace-2' }]);
  assert.ok(!f.calls.some(([kind]) => kind === 'open'));
});

test('新建支持已选工作区和宿主默认位置，不传已有会话身份', async () => {
  const f = await fixture();
  await f.clients.experts.createExpert('manager', { workspaceId: 'workspace-1' });
  await f.clients.experts.createExpert('manager');
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'create'), [
    ['create', { workspaceId: 'workspace-1' }],
    ['create', { workspaceId: 'default-workspace' }],
  ]);
});

test('未知角色和相对路径在提交前阻断', async () => {
  const f = await fixture();
  await assert.rejects(f.clients.experts.createExpert('unknown'), { code: 'role_missing' });
  await assert.rejects(f.clients.experts.createExpert('manager', { cwd: '../secret' }), { code: 'invalid_path' });
  assert.deepEqual(f.calls, []);
});

test('未登记默认工作区时由Host关联当前会话，不二次创建或选择首个客户工程', async () => {
  const workspaceState = { items: [{ workspaceId: 'customer', path: 'E:\\客户项目', sessionIds: [] }] };
  const f = await fixture({ workspaceState, initializeDefault: async () => undefined });
  const id = await f.clients.experts.createExpert('manager', { mode: 'cordis' });
  assert.equal(id, 'new-session');
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'create'), [
    ['create', { agentPreset: 'cordis' }],
  ]);
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'attach'), [['attach', id, { action: 'workspace_attach' }]]);
  assert.deepEqual(f.workspaceCalls, []);
  assert.deepEqual(workspaceState.items[0].sessionIds, []);
  assert.deepEqual(workspaceState.items[1].sessionIds, [id]);
});

test('知识工作台与专家共用默认位置关联，重开旧工作台不创建新身份', async () => {
  const f = await fixture({ workspaceState: { items: [] }, initializeDefault: async () => undefined });
  const id = await f.workbenchSession.ensureWorkbench();
  const creates = f.calls.filter(([kind]) => kind === 'create');
  assert.equal(creates.length, 1);
  assert.ok(creates.every(([, input]) => input.sessionId === id));
  assert.deepEqual(f.workspaceState.items[0].sessionIds, [id]);
  const resumed = await fixture({ storage: f.storage, existing: f.existing, workspaceState: { items: [] } });
  assert.equal(await resumed.workbenchSession.ensureWorkbench(), id);
  assert.deepEqual(resumed.calls.filter(([kind]) => kind === 'create'), []);
  assert.deepEqual(resumed.calls.filter(([kind]) => kind === 'attach'), [['attach', id, { action: 'workspace_attach' }]]);
});

test('工作区注册前失败不创建会话，创建后关联失败保留身份和打开入口', async () => {
  const unavailable = await fixture({ createWorkspace: async () => { throw new Error('目录不可访问'); } });
  await assert.rejects(unavailable.clients.experts.createExpert('manager', { cwd: 'E:\\工程' }), /目录不可访问/);
  assert.equal(unavailable.calls.some(([kind]) => kind === 'create'), false);
  const f = await fixture({ initializeDefault: async () => undefined, attach: async () => { throw new Error('工作区关联失败'); } });
  await button(f.render(), '开始新任务').props.onClick();
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
  assert.ok(nodes(f.render()).some((node) => node.props.role === 'alert' && node.props.children.some((text) => typeof text === 'string' && text.includes('new-session'))));
  button(f.render(), '打开已创建的任务').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['open', 'new-session']);
  assert.equal(f.calls.filter(([kind]) => kind === 'attach').length, 1);
});

test('关联错误中的宿主已创建身份穿透，错误关联回执保留身份且不二次创建', async () => {
  const failed = await fixture({ create: async () => ({ ok: false, error: { code: 'session/workspace-attach-failed', message: '关联失败', details: { sessionId: 'accepted-id' } } }) });
  await assert.rejects(failed.clients.experts.createExpert('manager'), { code: 'session/workspace-attach-failed', sessionId: 'accepted-id' });
  for (const reply of [{ sessionId: 'other', workspaceId: 'w' }, { sessionId: 'new-session' }]) {
    const malformed = await fixture({ initializeDefault: async () => undefined, attach: async () => success(reply) });
    await assert.rejects(malformed.clients.experts.createExpert('manager'), { code: 'bad_reply', sessionId: 'new-session' });
    assert.equal(malformed.calls.filter(([kind]) => kind === 'create').length, 1);
  }
});

test('首次进入个人知识直连文件服务，不准备会话或选择专家', async () => {
  const f = await fixture();
  await button(f.render(), '个人知识').props.onClick();
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 0);
  assert.equal(f.calls.some(([kind]) => ['expert', 'open', 'projections', 'claim'].includes(kind)), false);
  assert.deepEqual(f.calls, [['knowledge', { action: 'status' }], ['knowledge', { action: 'graph', query: '', offset: 0 }]]);
  assert.ok(nodes(f.render()).some(node => node.type === 'section' && node.props['aria-label'] === '关系图谱'));
});

test('知识页不受旧工作台未认领或会话服务失败阻塞，取消信号传到Remote', async () => {
  const f = await fixture({ projections: () => assert.fail('纯知识不读会话'), create: () => assert.fail('纯知识不创建会话') });
  await button(f.render(), '个人知识').props.onClick();
  assert.equal(button(f.render(), '新建笔记').props.disabled, false);
  let signal;
  const pending = await fixture({ knowledge: (input, received) => { signal = received; return new Promise((_resolve, reject) => received.addEventListener('abort', () => reject(received.reason), { once: true })); } });
  const job = button(pending.render(), '个人知识').props.onClick();
  assert.ok(signal instanceof AbortSignal);
  button(pending.render(), '停止等待结果').props.onClick();
  assert.equal(signal.aborted, true);
  await job;
  assert.equal(pending.calls.some(([kind]) => kind === 'create'), false);
});

test('讨论仅写原生草稿，提交忙时保留现状，重试复用会话且重复点击不追加', async () => {
  const f = await fixture();
  const id = await f.clients.assistant.ensureAssistant(); const reference = f.bridge.retain(id);
  const unmountInput = f.clients.assistant.mountAssistantInput(id);
  const input = f.inputFor(id); const original = { ...input.state.getSnapshot(), draft: '我的问题', phase: 'submitting', occurrences: [{ source: 'notes', ref: 'a.md' }] };
  input.state.set(original);
  await assert.rejects(f.clients.assistant.proposeDiscussion(reference, '讨论提议'), { code: 'draft_insert_rejected' });
  assert.equal(input.state.getSnapshot(), original);
  input.state.set({ ...original, phase: 'plain' });
  await f.clients.assistant.proposeDiscussion(reference, '讨论提议'); await f.clients.assistant.proposeDiscussion(reference, '讨论提议');
  assert.equal(input.inserts.length, 1); assert.match(input.state.getSnapshot().draft, /^我的问题\n\n讨论提议/);
  assert.equal(input.state.getSnapshot().occurrences, original.occurrences);
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
  assert.equal(f.calls.filter(([kind]) => kind === 'knowledge' || kind === 'prompt').length, 0);
  assert.equal(f.calls.some(([kind]) => kind === 'open'), false);
  assert.equal(f.clients.assistant.ask, undefined); unmountInput(); reference.release();
});

test('资料预检失败不创建会话，讨论准备失败保留同一助手身份恢复且零发送', async () => {
  const missing = await fixture({ knowledge: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: '来源已删除' } }) });
  await assert.rejects(missing.clients.knowledge.knowledge({ action: 'question', question: '问题', paths: ['40-知识/缺失.md'] }), { code: 'NOT_FOUND' });
  assert.equal(missing.calls.some(([kind]) => kind === 'create'), false);
  let blocked = true;
  const f = await fixture({ knowledge: async () => ({ ok: true, value: { prompt: '来源原文', sources: [] } }), expertExecute: async () => blocked ? { ok: false, error: { code: 'BUSY', message: '会话忙' } } : success({ expertId: 'manager' }) });
  let id;
  await assert.rejects(f.clients.assistant.ensureAssistant(), error => { id = error.sessionId; return error.code === 'BUSY'; });
  blocked = false;
  assert.equal(await f.clients.assistant.ensureAssistant(), id);
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
  assert.equal(f.calls.filter(([kind]) => kind === 'prompt').length, 0);
});

test('专家卡默认不登记知识来源，成功后进入原生主会话', async () => {
  const f = await fixture();
  await button(f.render(), '开始新任务').props.onClick();
  assert.deepEqual(f.calls, [['create', { workspaceId: 'default-workspace' }], ['projections', 'new-session'], ['expert', 'new-session', { expertId: 'manager' }], ['projections', 'new-session'], ['projections', 'new-session'], ['open', 'new-session']]);
});

test('重复点击 pending 创建按钮不会创建第二个会话', async () => {
  let resolve;
  let started;
  const ready = new Promise((done) => { started = done; });
  let count = 0;
  const f = await fixture({ create: () => { count += 1; started(); return new Promise((done) => { resolve = done; }); } });
  const click = button(f.render(), '开始新任务').props.onClick;
  const pending = click();
  await click();
  await ready;
  assert.equal(count, 1);
  resolve({ ok: true, value: { sessionId: 'only-one' } });
  await pending;
});

test('读取笔记、清空正文后的草稿仍受保护，冲突不覆盖草稿', async () => {
  const f = await fixture({ execute: async (_sessionId, line) => {
    const payload = JSON.parse(line.slice('/whalewing '.length));
    if (payload.action === 'graph') return success(emptyGraph());
    if (payload.action === 'status') return success({ initialized: true, root: 'fixture' });
    if (payload.action === 'search') return success({ notes: [{ path: 'note.md', title: '已有笔记' }], truncated: false });
    if (payload.action === 'document') return success({ path: 'note.md', content: '原正文', hash: 'old' });
    if (payload.action === 'write') return { ok: true, value: { result: { kind: 'error', text: JSON.stringify({ code: 'conflict', message: '已修改' }) } } };
    assert.fail(`意外动作: ${payload.action}`);
  } });
  await button(f.render(), '个人知识').props.onClick();
  await button(f.render(), '刷新').props.onClick();
  nodes(f.render()).find(node => node.type === 'input' && node.props.value === '').props.onChange({ target: { value: '已有' } });
  nodes(f.render()).find(node => node.type === 'input' && node.props.value === '已有').props.onKeyDown({ key: 'Enter' }); await new Promise(setImmediate);
  await button(f.render(), '已有笔记').props.onClick();
  button(f.render(), '编辑').props.onClick();
  nodes(f.render()).find((node) => node.type === 'textarea').props.onChange({ target: { value: '' } });
  assert.equal(button(f.render(), '已有笔记').props.disabled, true);
  assert.equal(button(f.render(), '选用当前笔记').props.disabled, true);
  await button(f.render(), '保存').props.onClick();
  assert.equal(nodes(f.render()).find((node) => node.type === 'textarea').props.value, '');
  assert.ok(nodes(f.render()).some((node) => node.props.role === 'alert' && node.props.children.some((item) => typeof item === 'string' && item.includes('草稿还在'))));
});

test('保存后必须回读且检查 hash，未使用写前正文冒充最新内容', async () => {
  const actions = [];
  let stored = '旧正文';
  let hash = 'old';
  const f = await fixture({ execute: async (_sessionId, line) => {
    const payload = JSON.parse(line.slice('/whalewing '.length));
    actions.push(payload.action);
    if (payload.action === 'graph') return success(emptyGraph());
    if (payload.action === 'status') return success({ initialized: true, root: 'fixture' });
    if (payload.action === 'search') return success({ notes: [{ path: 'note.md', title: '已有笔记' }], truncated: false });
    if (payload.action === 'document') return success({ path: 'note.md', content: stored, hash });
    if (payload.action === 'write') { assert.equal(payload.expectedHash, 'old'); stored = payload.content; hash = 'new'; return success({ path: 'note.md', hash }); }
    assert.fail(`意外动作: ${payload.action}`);
  } });
  await button(f.render(), '个人知识').props.onClick();
  await button(f.render(), '刷新').props.onClick();
  nodes(f.render()).find(node => node.type === 'input' && node.props.value === '').props.onChange({ target: { value: '已有' } });
  nodes(f.render()).find(node => node.type === 'input' && node.props.value === '已有').props.onKeyDown({ key: 'Enter' }); await new Promise(setImmediate);
  await button(f.render(), '已有笔记').props.onClick();
  button(f.render(), '编辑').props.onClick();
  nodes(f.render()).find((node) => node.type === 'textarea').props.onChange({ target: { value: '新正文' } });
  await button(f.render(), '保存').props.onClick();
  assert.deepEqual(actions.slice(-3), ['write', 'document', 'search']);
  assert.equal(nodes(f.render()).find((node) => node.type === 'textarea').props.value, '新正文');
  assert.equal(button(f.render(), '选用当前笔记').props.disabled, false);
});

test('新建笔记提供本地日期五属性与同名标题，只生成可编辑草稿', async () => {
  const actions = [];
  const f = await fixture({ execute: async (_id, line) => {
    const payload = JSON.parse(line.slice('/whalewing '.length));
    actions.push(payload.action);
    if (payload.action === 'graph') return success(emptyGraph());
    if (payload.action === 'status') return success({ initialized: true, root: 'fixture' });
    if (payload.action === 'search') return success({ notes: [] });
    assert.fail(`不应持久化新草稿: ${payload.action}`);
  } });
  await button(f.render(), '个人知识').props.onClick();
  await button(f.render(), '刷新').props.onClick();
  const before = actions.length;
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  button(f.render(), '新建笔记').props.onClick();
  const textarea = nodes(f.render()).find((node) => node.type === 'textarea');
  assert.equal(textarea.props.value, `---\ntype: capture\nstatus: inbox\ncreated: ${date}\nupdated: ${date}\naliases: []\n---\n\n# ${date} 新笔记\n\n`);
  const path = nodes(f.render()).find((node) => node.type === 'input' && node.props.value === `10-收件箱/${date} 新笔记.md`);
  assert.ok(path);
  assert.equal(path.props.readOnly, false);
  path.props.onChange({ target: { value: '10-收件箱/我的记录.md' } });
  textarea.props.onChange({ target: { value: textarea.props.value.replace(`# ${date} 新笔记`, '# 我的记录') } });
  assert.equal(button(f.render(), '选用当前笔记').props.disabled, true);
  assert.equal(actions.length, before);
});

/** UI 夹具保持列表诊断与正文读取独立，模拟 Host 的技能生命周期。 */
async function skillFixture(state = 'active', rejectRollback = false, additional = []) {
  const requests = [];
  let record = { name: 'fixture-skill', content: '当前技能正文', hash: 'current', state, sourcePaths: ['知识.md'] };
  const entry = value => ({ ...value, id: `fixture/${value.state}/${value.name}.md`, description: '演进技能', origin: 'evolution', actions: ['read', 'evolve'], discovery: 'unavailable', issue: '来源内容已变化' });
  const reply = value => ({ ok: true, value });
  const f = await fixture({ skillLibrary: async payload => {
    requests.push(payload);
    if (payload.action === 'list') { const entries = [entry(record), ...additional.map(entry)]; return reply({ entries, offset: 0, total: entries.length, truncated: false }); }
    if (payload.action === 'read') return reply({ entry: entry(record) });
    if (payload.action === 'rollback') {
      if (rejectRollback) return { ok: false, error: { code: 'NO_RECOVERY', message: '没有发布前的旧版' } };
      record = { ...record, state: 'active', hash: 'previous', content: '发布前旧版正文' };
      return reply(record);
    }
    if (payload.action === 'restore') { record = { ...record, state: 'active' }; return reply(record); }
    assert.fail(`意外动作: ${payload.action}`);
  } });
  await button(f.render(), '技能成长').props.onClick();
  await button(f.render(), '刷新').props.onClick();
  await button(f.render(), 'fixture-skill').props.onClick();
  return { f, requests };
}

test('技能列表和详情保留来源失效诊断，不仅显示已启用', async () => {
  const { f } = await skillFixture();
  const issues = nodes(f.render()).filter((node) => node.props.children.includes('待处理: 来源内容已变化'));
  assert.equal(issues.length, 2);
  assert.ok(issues.some((node) => node.props.role === 'status'));
});

test('回退必须确认，使用active hash并回读旧版，不把restore当回退', async () => {
  const { f, requests } = await skillFixture();
  button(f.render(), '回退到发布前旧版').props.onClick();
  assert.equal(requests.some((item) => item.action === 'rollback'), false);
  button(f.render(), '取消').props.onClick();
  assert.equal(requests.some((item) => item.action === 'rollback'), false);
  button(f.render(), '回退到发布前旧版').props.onClick();
  await button(f.render(), '确认回退').props.onClick();
  assert.deepEqual(requests.slice(-4).map((item) => item.action), ['rollback', 'list', 'read', 'list']);
  assert.deepEqual(requests.at(-4), { action: 'rollback', name: 'fixture-skill', expectedHash: 'current' });
  assert.ok(nodes(f.render()).some((node) => node.type === 'pre' && node.props.children.includes('发布前旧版正文')));
  assert.equal(requests.some((item) => item.action === 'restore'), false);
});

test('回退失败保留详情、诊断和确认状态', async () => {
  const { f } = await skillFixture('active', true);
  button(f.render(), '回退到发布前旧版').props.onClick();
  await button(f.render(), '确认回退').props.onClick();
  assert.ok(nodes(f.render()).some((node) => node.type === 'pre' && node.props.children.includes('当前技能正文')));
  assert.ok(nodes(f.render()).some((node) => node.props.role === 'alert' && node.props.children.includes(shown('NO_RECOVERY', '没有发布前的旧版'))));
  assert.ok(button(f.render(), '确认回退'));
});

test('停用技能回退无active时传空hash，有active时取active hash', async () => {
  for (const additional of [[], [{ name: 'fixture-skill', state: 'active', hash: 'other-active' }]]) {
    const { f, requests } = await skillFixture('disabled', false, additional);
    button(f.render(), '回退到发布前旧版').props.onClick();
    await button(f.render(), '确认回退').props.onClick();
    assert.equal(requests.find((item) => item.action === 'rollback').expectedHash, additional.length ? 'other-active' : '');
  }
});

test('恢复停用同版本仍使用restore，候选没有恢复和回退入口', async () => {
  const { f, requests } = await skillFixture('disabled');
  await button(f.render(), '恢复技能').props.onClick();
  assert.deepEqual(requests.find((item) => item.action === 'restore'), { action: 'restore', name: 'fixture-skill', expectedHash: 'current' });
  const candidate = (await skillFixture('candidate')).f;
  assert.equal(nodes(candidate.render()).some((node) => node.type === 'button' && node.props.children.some((label) => ['恢复技能', '回退到发布前旧版'].includes(label))), false);
});

test('角色卡可将同一专家分别配标准或创造模式，原生列表不被扩写', async () => {
  const f = await fixture();
  await button(f.render(), '刷新').props.onClick();
  for (const mode of ['standard', 'cordis']) {
    nodes(f.render()).find((node) => node.type === 'select' && node.props['aria-label'] === 'DSH 模式').props.onChange({ target: { value: mode } });
    await button(f.render(), '开始新任务').props.onClick();
  }
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'create'), [['create', { agentPreset: 'standard', workspaceId: 'default-workspace' }], ['create', { agentPreset: 'cordis', workspaceId: 'default-workspace' }]]);
  assert.deepEqual(f.calls.filter(([kind, , data]) => kind === 'expert' && data.expertId).map(([, , data]) => data.expertId), ['manager', 'manager']);
  assert.equal(f.entries.has('conversation.hero.agentPreset'), false);
});

test('官方无名模式复用宿主词典，自定义名称和未知模式保持原语义', async () => {
  const presets = ['standard', 'ptc', 'minimal', 'cordis'].map((id) => ({ id }));
  presets.push({ id: 'standard', name: '团队模式' }, { id: 'cordis', name: '' }, { id: 'custom' });
  const f = await fixture({
    presetLocale: { presetStandardName: '标准模式', presetPtcName: 'PTC 本地化', presetMinimalName: '极简本地化', presetCordisName: '创造模式' },
    modes: async () => ({ ok: true, value: { presets } }),
  });
  const expected = ['标准模式', 'PTC 本地化', '极简本地化', '创造模式', '团队模式', '', 'custom'];
  assert.deepEqual((await f.bridge.modes()).map((item) => item.name), expected);
  await button(f.render(), '刷新').props.onClick();
  const select = nodes(f.render()).find((node) => node.type === 'select' && node.props['aria-label'] === 'DSH 模式');
  assert.deepEqual(nodes(select).filter((node) => node.type === 'option').slice(1).map((node) => node.props.children[0]), expected);
  assert.equal(presets[0].name, undefined);
});

test('恢复成功提示在下一次回退确认前清除，失败后可取消且旧提示不复现', async () => {
  const { f } = await skillFixture('disabled', true);
  await button(f.render(), '恢复技能').props.onClick();
  assert.ok(nodes(f.render('shell.overlay')).some((node) => node.props.className === 'ww-toast ww-toast-success'));
  assert.ok(JSON.stringify(f.render('shell.overlay')).includes('技能状态已更新'));
  assert.equal(f.timers.size, 1);
  await button(f.render(), 'fixture-skill').props.onClick();
  assert.equal(f.render('shell.overlay'), null);
  button(f.render(), '回退到发布前旧版').props.onClick();
  assert.equal(f.render('shell.overlay'), null);
  assert.equal(f.timers.size, 0);
  await button(f.render(), '确认回退').props.onClick();
  assert.ok(nodes(f.render()).some((node) => node.props.role === 'alert' && node.props.children.includes(shown('NO_RECOVERY', '没有发布前的旧版'))));
  assert.equal(JSON.stringify(f.render('shell.overlay')).includes('技能状态已更新'), false);
  button(f.render(), '取消').props.onClick();
  assert.equal(nodes(f.render()).some((node) => node.type === 'button' && node.props.children.includes('确认回退')), false);
});

test('成功提示四秒后消失、失败提示停留八秒，插件释放时清理待执行计时器', async () => {
  for (const dispose of [false, true]) {
    const { f } = await skillFixture('disabled');
    await button(f.render(), '恢复技能').props.onClick();
    const timer = [...f.timers.values()][0];
    assert.equal(timer.delay, 4000);
    if (dispose) f.disposed.forEach((cleanup) => cleanup());
    else timer.fn();
    assert.equal(f.timers.size, 0);
    assert.equal(f.render('shell.overlay'), null);
  }
});

test('创建后专家选择失败保留实际任务ID和打开入口，不虚报选中或自动重建', async () => {
  const f = await fixture({ expertExecute: async () => ({ ok: false, error: { code: 'offline', message: '连接中断' } }) });
  await button(f.render(), '开始新任务').props.onClick();
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
  assert.equal(f.calls.some(([kind]) => kind === 'open'), false);
  assert.ok(nodes(f.render()).some((node) => node.props.role === 'alert' && node.props.children.some((value) => typeof value === 'string' && value.includes('new-session'))));
  button(f.render(), '打开已创建的任务').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['open', 'new-session']);
});

test('专用工作台只创建一次，跨标签和页面实例依靠正式投影复用', async () => {
  const f = await fixture();
  const pending = f.workbenchSession.ensureWorkbench();
  assert.equal(f.workbenchSession.ensureWorkbench(), pending);
  const id = await pending;
  assert.equal(await f.workbenchSession.ensureWorkbench(), id);
  await button(f.render(), '个人知识').props.onClick();
  await button(f.render(), '技能成长').props.onClick();
  await button(f.render(), '定时任务').props.onClick();
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
  assert.equal(f.calls.some(([kind]) => kind === 'expert' || kind === 'open'), false);
  assert.equal(f.calls.some((entry) => JSON.stringify(entry).includes('source_add')), false);
  const resumed = await fixture({ storage: f.storage, existing: f.existing });
  assert.equal(await resumed.workbenchSession.ensureWorkbench(), id);
  assert.deepEqual(resumed.calls, [['projections', id], ['lookup', id]]);
});

test('工作台缓存按origin隔离，未知接纳空读保留原ID且不重发，读取错误不创建', async () => {
  const key = 'whalewing:workbench:http://fixture.local';
  const storage = new Map([[key, 'missing-workbench']]);
  const missing = await fixture({ storage });
  await assert.rejects(missing.workbenchSession.ensureWorkbench(), { code: 'SESSION_UNCONFIRMED' });
  await assert.rejects(missing.workbenchSession.ensureWorkbench(), { code: 'SESSION_UNCONFIRMED' });
  assert.equal(storage.get(key), 'missing-workbench');
  assert.equal(missing.calls.filter(([kind]) => kind === 'create').length, 0);
  const other = await fixture({ storage, existing: missing.existing, origin: 'http://other.local' });
  assert.notEqual(await other.workbenchSession.ensureWorkbench(), 'missing-workbench');
  const offline = await fixture({ storage, projections: async () => ({ ok: false, error: { code: 'offline', message: '连接中断' } }) });
  await assert.rejects(offline.workbenchSession.ensureWorkbench(), { code: 'offline' });
  assert.equal(offline.calls.some(([kind]) => kind === 'create'), false);
});

test('中断后未认领缓存不抢用户会话，显式重新准备保留旧会话', async () => {
  const key = 'whalewing:workbench:http://fixture.local';
  const f = await fixture({ storage: new Map([[key, 'interrupted-session']]), existing: new Map([['interrupted-session', false]]) });
  await assert.rejects(f.workbenchSession.ensureWorkbench(), { code: 'workbench_identity' });
  assert.deepEqual(f.calls, [['projections', 'interrupted-session']]);
  f.bridge.open('interrupted-session');
  assert.deepEqual(f.calls.at(-1), ['open', 'interrupted-session']);
  await f.workbenchSession.restartWorkbench();
  assert.notEqual(f.storage.get(key), 'interrupted-session');
  assert.equal(f.existing.get('interrupted-session'), false);
  assert.equal(f.calls.some(([kind, request]) => kind === 'rename' && request.sessionId === 'interrupted-session'), false);
  assert.equal(f.calls.some(([kind, id]) => kind === 'claim' && id === 'interrupted-session'), false);
});

test('知识初始化失败显示重试且从未建会话，旧库说明保持可见', async () => {
  let failed = false;
  const f = await fixture({ execute: async (_id, line) => {
    const input = JSON.parse(line.slice('/whalewing '.length));
    if (input.action === 'graph') return success(emptyGraph());
    if (input.action === 'status') {
      if (!failed) { failed = true; return { ok: false, error: { code: 'ROOT', message: '目录不可写：fixture-vault' } }; }
      return success({ initialized: true, root: 'old-vault', locationNotice: '已保留原有知识库位置' });
    }
    if (input.action === 'search') return success({ notes: [] });
    assert.fail(input.action);
  } });
  await button(f.render(), '个人知识').props.onClick();
  assert.ok(nodes(f.render()).some((node) => node.props.role === 'alert' && node.props.children.includes(shown('ROOT', '目录不可写：fixture-vault'))));
  await button(f.render(), '重试').props.onClick();
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 0);
  assert.ok(nodes(f.render()).some((node) => node.props.children.includes('已保留原有知识库位置')));
});

test('切标签和刷新不会丢弃知识草稿', async () => {
  const f = await fixture();
  await button(f.render(), '个人知识').props.onClick();
  button(f.render(), '新建笔记').props.onClick();
  nodes(f.render()).find((node) => node.type === 'textarea').props.onChange({ target: { value: '未保存的草稿' } });
  await button(f.render(), '技能成长').props.onClick();
  await button(f.render(), '个人知识').props.onClick();
  await button(f.render(), '刷新').props.onClick();
  assert.equal(nodes(f.render()).find((node) => node.type === 'textarea').props.value, '未保存的草稿');
});

test('原生slot专家选择显示名字职责，切换与清除均不改模式', async () => {
  const f = await fixture();
  f.existing.set('bound-session', false);
  const props = { sessionId: 'bound-session', useProjection: () => ({ expertId: 'development' }), useSessions: select => select({ byId: {} }) };
  const slot = 'conversation.session.header.actions';
  let tree = f.render(slot, props);
  assert.equal(f.entries.get(slot).options.order, -9);
  assert.ok(nodes(tree).some(node => node.type === 'small' && node.props.children.includes('修改工程')));
  const choice = nodes(tree).find(node => node.type === 'button' && nodes(node).some(child => child.type === 'strong' && child.props.children.includes('小鲸助手')));
  await choice.props.onClick();
  await button(f.render(slot, props), '不使用专家').props.onClick();
  assert.deepEqual(f.calls, [['projections', 'bound-session'], ['expert', 'bound-session', { expertId: 'manager' }], ['projections', 'bound-session'], ['projections', 'bound-session'], ['projections', 'bound-session'], ['expert', 'bound-session', { expertId: null }], ['projections', 'bound-session']]);
});

test('新专家入口注册hero actions，保留原生模式且退出错误的input dock', async () => {
  const f = await fixture();
  assert.ok(f.entries.has('conversation.hero.actions'));
  assert.equal(f.entries.has('conversation.input.dock'), false);
  assert.equal(f.entries.has('conversation.hero.agentPreset'), false);
  const tree = f.render('conversation.hero.actions', { sessionId: 'new', useProjection: () => null, useSessions: select => select({ byId: {} }) });
  assert.ok(nodes(tree).some(node => node.props.popover === 'auto'));
});

test('本插件旧专家模式仅按官方会话投影展示历史提示，不提供切换入口', async () => {
  const f = await fixture();
  for (const role of roles) {
    const state = { byId: { history: { blank: true, projectionValues: { agentPreset: `whalewing-${role.id}` } } } };
    const props = { sessionId: 'history', useProjection: () => null, useSessions: (select) => select(state) };
    for (const slot of ['conversation.session.header.actions', 'conversation.hero.actions']) {
      const tree = f.render(slot, props);
      assert.ok(nodes(tree).some((node) => node.props.children.includes(`历史专家：${role.name}（新建任务接续）`)));
      assert.equal(nodes(tree).some((node) => ['details', 'summary', 'input', 'select', 'button'].includes(node.type)), false);
      assert.equal(nodes(tree).some((node) => node.props.children.includes('专家: 不使用专家')), false);
    }
    assert.equal(state.byId.history.projectionValues.agentPreset, `whalewing-${role.id}`);
  }
  assert.deepEqual(f.calls, []);
});

test('未知或非本插件模式不被判为历史专家，新专家仍由whalewingExpert决定', async () => {
  const f = await fixture();
  for (const agentPreset of ['standard', 'whalewing-unknown', { id: 'whalewing-manager' }, undefined]) {
    const tree = f.render('conversation.session.header.actions', {
      sessionId: 'current', useProjection: () => ({ expertId: 'development' }),
      useSessions: (select) => select({ byId: { current: { projectionValues: { agentPreset } } } }),
    });
    assert.ok(nodes(tree).some((node) => node.type === 'button' && node.props.children.includes('研发专家')));
  }
  assert.deepEqual(f.calls, []);
});

test('专家选择失败保留原投影和错误，卸载后的响应不打开会话', async () => {
  const f = await fixture({ expertExecute: async () => ({ ok: false, error: { code: 'busy', message: '当前回合进行中' } }) });
  f.existing.set('s', false);
  const slot = 'conversation.session.header.actions';
  const props = { sessionId: 's', useProjection: () => ({ expertId: 'development' }), useSessions: (select) => select({ byId: {} }) };
  const choice = nodes(f.render(slot, props)).find(node => node.type === 'button' && nodes(node).some(child => child.type === 'strong' && child.props.children.includes('小鲸助手')));
  await choice.props.onClick();
  assert.ok(nodes(f.render(slot, props)).some((node) => node.props.role === 'alert' && node.props.children.includes(shown('busy', '当前回合进行中'))));
  assert.ok(nodes(f.render(slot, props)).some((node) => node.type === 'button' && node.props.children.includes('研发专家')));
  let complete;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const g = await fixture({ create: () => new Promise((resolve) => { complete = resolve; started(); }) });
  g.render(); g.flushEffects();
  const pending = button(g.render(), '开始新任务').props.onClick();
  await ready;
  g.unmount();
  complete({ ok: true, value: { sessionId: 'created-late' } });
  await pending;
  assert.equal(g.calls.some(([kind]) => kind === 'open'), false);
});


test('笔记阅读区右侧栏列出目录、反链和出链，属性在大标题下面且属性里的链接能点开', async () => {
  const text = (value, line) => ({ type: 'text', value, line });
  const view = { type: 'root', line: 1, children: [
    { type: 'heading', level: 1, line: 9, children: [text('目标', 9)] },
    { type: 'heading', level: 2, line: 11, children: [text('观点', 11)] },
    { type: 'paragraph', line: 13, children: [{ type: 'knowledgeLink', index: 0, value: '缺的笔记', line: 13 }] },
    { type: 'heading', level: 3, line: 15, children: [text('细节', 15)] },
  ] };
  const doc = { path: '40-知识/目标.md', content: '正文', hash: 'h', readOnly: false, view, anchors: [],
    links: [{ kind: 'wiki', label: '缺的笔记', target: '缺的笔记', line: 13, status: 'missing', candidates: [] }, { kind: 'wiki', label: '20-项目/甲', target: '20-项目/甲', line: 7, status: 'resolved', candidates: [], path: '20-项目/甲.md', targetLine: 1, property: 'project' }],
    properties: [{ key: 'type', values: [{ text: 'atomic' }] }, { key: 'aliases', values: [] }, { key: 'project', values: [{ text: '20-项目/甲', link: 1 }] }],
    backlinks: [{ path: '60-时间线/日记.md', title: '日记', line: 5, context: '提到目标' }, { path: '60-时间线/日记.md', title: '日记', line: 5, context: '提到目标' }, { path: '20-项目/甲.md', title: '甲', line: 3, property: 'moc' }], totalBacklinks: 3 };
  knowledgeContract(z).result.parse(doc);
  const opened = [];
  const f = await fixture({ knowledge: async input => {
    if (input.action === 'graph') return { ok: true, value: emptyGraph() };
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'fixture' } };
    if (input.action === 'search') return { ok: true, value: { notes: [{ path: doc.path, title: '目标' }] } };
    if (input.action === 'document') { opened.push(input.path); return { ok: true, value: input.path === doc.path ? doc : { ...doc, path: input.path, properties: [], backlinks: [], totalBacklinks: 0 } }; }
    assert.fail(input.action);
  }, expand: ['NoteSide'] });
  await button(f.render(), '个人知识').props.onClick();
  nodes(f.render()).find(node => node.type === 'input' && node.props.value === '').props.onChange({ target: { value: '目标' } });
  nodes(f.render()).find(node => node.type === 'input' && node.props.value === '目标').props.onKeyDown({ key: 'Enter' }); await new Promise(setImmediate);
  await button(f.render(), '目标').props.onClick();
  const byClass = (name, tree = f.render()) => nodes(tree).filter(node => String(node.props?.className || '').split(' ').includes(name));
  const words = node => nodes(node).flatMap(child => [child.props?.children].flat()).filter(value => typeof value === 'string' || typeof value === 'number').join('|');
  // 属性块紧跟在大标题后面；空属性写“没有值”，属性里的链接只显示笔记名，正文里没找到的链接是虚线样式。
  const reader = byClass('ww-reader')[0];
  const body = nodes(reader).find(node => node.type === 'div' && node.props['data-note-line'] === 1);
  assert.deepEqual(body.props.children.slice(0, 2).map(node => node.type === 'details' ? 'properties' : node.type), ['h1', 'properties']);
  assert.equal(words(byClass('ww-note-props')[0]), '笔记属性|type|atomic|aliases|没有值|project|甲');
  assert.equal(byClass('ww-unresolved').filter(node => node.type === 'button').length, 1);
  await byClass('ww-prop-link')[0].props.onClick();
  assert.equal(opened.at(-1), '20-项目/甲.md');
  await button(f.render(), '返回上一篇').props.onClick();
  // 窄的时候右侧栏收着，点工具条上的按钮浮出来：三页带数量，目录按标题级别缩进。
  assert.equal(byClass('ww-note-side').length, 0);
  byClass('ww-side-toggle')[0].props.onClick();
  assert.equal(byClass('ww-note-side').length, 1);
  assert.deepEqual(nodes(f.render()).filter(node => node.props?.role === 'tab').map(words), ['目录|3', '反链|3', '出链|2']);
  assert.deepEqual(byClass('ww-side-outline')[0].props.children.map(node => [words(node), node.props.style.paddingInlineStart]), [['目标', '10px'], ['观点', '24px'], ['细节', '38px']]);
  // 反链按笔记归组，同一行只列一次；属性里的反链标出属性名。点摘要打开那篇笔记。
  nodes(f.render()).find(node => node.props?.role === 'tab' && words(node).startsWith('反链')).props.onClick();
  assert.deepEqual(byClass('ww-side-group').map(words), ['日记|2|提到目标', '甲|1|属性 · moc']);
  await byClass('ww-side-snippet')[0].props.onClick();
  assert.equal(opened.at(-1), '60-时间线/日记.md');
  assert.equal(byClass('ww-note-side').length, 0, '窄的时候跳转后侧栏自动收起');
  await button(f.render(), '返回上一篇').props.onClick();
  byClass('ww-side-toggle')[0].props.onClick();
  nodes(f.render()).find(node => node.props?.role === 'tab' && words(node).startsWith('出链')).props.onClick();
  assert.deepEqual(byClass('ww-side-links')[0].props.children.map(words), ['缺的笔记|未创建', '甲|20-项目']);
});

test('保存已回读时关系或列表失败仍更新哈希，下一次保存不因旧状态冲突', async () => {
  let stored = '旧正文', hash = 'old', writes = 0;
  const f = await fixture({ knowledge: async input => {
    if (input.action === 'graph') return { ok: true, value: emptyGraph() };
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'fixture' } };
    if (input.action === 'search') return writes ? { ok: false, error: { code: 'FILE_LIMIT', message: '全库超限' } } : { ok: true, value: { notes: [{ path: '40-知识/正常.md', title: '正常' }] } };
    if (input.action === 'document') return { ok: true, value: { path: '40-知识/正常.md', content: stored, hash, view: { type: 'text', value: stored }, links: [], backlinks: [], totalBacklinks: 0, relationsIssue: '无关笔记编码错误' } };
    if (input.action === 'write') { assert.equal(input.expectedHash, hash); stored = input.content; hash = String(++writes); return { ok: true, value: { path: input.path, hash } }; }
    assert.fail(input.action);
  } });
  await button(f.render(), '个人知识').props.onClick();
  nodes(f.render()).find(node => node.type === 'input' && node.props.value === '').props.onChange({ target: { value: '正常' } });
  nodes(f.render()).find(node => node.type === 'input' && node.props.value === '正常').props.onKeyDown({ key: 'Enter' }); await new Promise(setImmediate);
  await button(f.render(), '正常').props.onClick();
  button(f.render(), '编辑').props.onClick();
  for (const text of ['第一次修改', '第二次修改']) {
    nodes(f.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: text } });
    await button(f.render(), '保存').props.onClick();
    assert.equal(button(f.render(), '选用当前笔记').props.disabled, false);
    assert.ok(nodes(f.render()).some(node => node.props.role === 'alert' && node.props.children.some(value => String(value).includes('文件操作已完成'))));
    assert.ok(nodes(f.render()).some(node => node.props.role === 'status' && node.props.children.includes('正文已打开；链接和反向链接暂时读不到')));
  }
  assert.equal(writes, 2);
});

test('已提交但正文读回失败明确提示且提供恢复回读，不当成未写入', async () => {
  let committed = false, brokenRead = false;
  const f = await fixture({ knowledge: async input => {
    if (input.action === 'graph') return { ok: true, value: emptyGraph() };
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'fixture' } };
    if (input.action === 'search') return { ok: true, value: { notes: [{ path: '40-知识/正常.md', title: '正常' }] } };
    if (input.action === 'write') { committed = true; brokenRead = true; return { ok: true, value: { path: input.path, hash: 'new' } }; }
    if (input.action === 'document') return brokenRead ? { ok: false, error: { code: 'IO', message: '暂时失去文件访问' } } : { ok: true, value: { path: '40-知识/正常.md', content: committed ? '已提交正文' : '旧正文', hash: committed ? 'new' : 'old', view: { type: 'text', value: '正文' }, links: [], backlinks: [] } };
    assert.fail(input.action);
  } });
  await button(f.render(), '个人知识').props.onClick();
  nodes(f.render()).find(node => node.type === 'input' && node.props.value === '').props.onChange({ target: { value: '正常' } });
  nodes(f.render()).find(node => node.type === 'input' && node.props.value === '正常').props.onKeyDown({ key: 'Enter' }); await new Promise(setImmediate);
  await button(f.render(), '正常').props.onClick();
  button(f.render(), '编辑').props.onClick();
  nodes(f.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: '已提交正文' } });
  await button(f.render(), '保存').props.onClick();
  assert.equal(committed, true);
  assert.equal(button(f.render(), '读取最新内容').props.disabled, false);
  assert.ok(nodes(f.render()).some(node => node.props.role === 'alert' && node.props.children.some(value => String(value).includes('文件已保存'))));
  brokenRead = false;
  await button(f.render(), '读取最新内容').props.onClick();
  assert.equal(button(f.render(), '选用当前笔记').props.disabled, false);
});

for (const action of ['write', 'restore']) test(`${action}首次提交后回读失败，以目标路径恢复且重复失败不丢恢复入口`, async () => {
  const target = '10-收件箱/恢复验收.md';
  let stored = '已恢复正文', hash = '', mutations = 0, brokenRead = true;
  const reads = [];
  const f = await fixture({ knowledge: async input => {
    if (input.action === 'graph') return { ok: true, value: emptyGraph() };
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'fixture' } };
    if (input.action === 'search') return { ok: true, value: { notes: [] } };
    if (input.action === 'write' || input.action === 'restore') {
      assert.equal(input.path, target);
      assert.equal(input.expectedHash, hash);
      stored = input.content ?? stored;
      hash = String(++mutations);
      return { ok: true, value: { path: target, hash } };
    }
    if (input.action === 'document') {
      reads.push(input.path);
      return brokenRead ? { ok: false, error: { code: 'IO', message: '回读连接中断' } }
        : { ok: true, value: { path: target, content: stored, hash, view: { type: 'text', value: stored }, links: [], backlinks: [] } };
    }
    assert.fail(input.action);
  } });
  const inputFor = label => nodes(f.render()).find(node => node.type === 'label' && node.props.children.includes(label)).props.children.find(node => node?.type === 'input');
  await button(f.render(), '个人知识').props.onClick();
  // 两种操作都从 note=null 开始，不借用已有笔记对象来取得恢复身份。
  if (action === 'write') {
    button(f.render(), '新建笔记').props.onClick();
    inputFor('库内 Markdown 路径').props.onChange({ target: { value: target } });
    nodes(f.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: '新建草稿' } });
    await button(f.render(), '保存').props.onClick();
    assert.equal(nodes(f.render()).find(node => node.type === 'textarea').props.value, '新建草稿');
  } else {
    inputFor('要恢复的笔记路径').props.onChange({ target: { value: target } });
    await button(f.render(), '恢复').props.onClick();
    assert.equal(inputFor('库内 Markdown 路径').props.value, '');
  }
  assert.equal(mutations, 1);
  assert.ok(nodes(f.render()).some(node => node.props.role === 'alert' && node.props.children.some(value => String(value).includes('文件已保存'))));
  assert.equal(button(f.render(), '保存').props.disabled, true);
  assert.equal(button(f.render(), '恢复').props.disabled, true);
  assert.equal(button(f.render(), '读取最新内容').props.disabled, false);
  await button(f.render(), '读取最新内容').props.onClick();
  await button(f.render(), '查找笔记').props.onClick();
  assert.equal(button(f.render(), '读取最新内容').props.disabled, false);
  brokenRead = false;
  await button(f.render(), '读取最新内容').props.onClick();
  assert.deepEqual(reads, [target, target, target]);
  assert.equal(inputFor('库内 Markdown 路径').props.value, target);
  assert.equal(button(f.render(), '选用当前笔记').props.disabled, false);
  assert.equal(button(f.render(), '读取最新内容').props.disabled, true);
  button(f.render(), '编辑').props.onClick();
  nodes(f.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: '恢复后继续编辑' } });
  await button(f.render(), '保存').props.onClick();
  assert.equal(mutations, 2);
  assert.equal(stored, '恢复后继续编辑');
});


test('知识目录只显示标题，按目录懒加载并在卸载时取消读取', async () => {
  let signal;
  const f = await fixture({ knowledge: async (input, current) => {
    if (input.action === 'graph') return { ok: true, value: emptyGraph() };
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'vault' } };
    if (input.action === 'search') return { ok: true, value: { notes: [], truncated: false } };
    assert.equal(input.action, 'browse'); signal = current;
    return { ok: true, value: { directory: '', folders: [{ path: '40-知识', name: '40-知识' }], notes: [{ path: '首页.md', title: '首页', excerpt: '正文禁止出现在目录' }], offset: 0, total: 1, truncated: false } };
  } });
  await button(f.render(), '个人知识').props.onClick();
  const directory = nodes(f.render()).find(node => typeof node.type === 'function' && node.type.name === 'Directory');
  const render = f.isolate(directory); render(); f.flushEffects(); await new Promise(setImmediate);
  const tree = render();
  assert.ok(button(tree, '首页'));
  assert.equal(button(tree, '首页').props.title, '首页\n首页.md');
  assert.equal(button(tree, '40-知识').props.title, '40-知识');
  assert.ok(nodes(button(tree, '首页')).some(node => node.props.className === 'ww-tree-title' && node.props.children.includes('首页')));
  assert.equal(nodes(tree).some(node => node.props.children.includes('正文禁止出现在目录')), false);
  assert.equal(nodes(tree).some(node => node.props.children.includes('首页.md')), false);
  button(tree, '40-知识').props.onClick();
  assert.ok(nodes(render()).some(node => node.type.name === 'Directory' && node.props.directory === '40-知识'));
  f.unmount(); assert.equal(signal.aborted, true);
});

test('原生资料chip只投递到助手当前scope，实际序列化复用question owner', async () => {
  const received = [];
  const f = await fixture({ knowledge: async (input, signal) => { received.push({ input, signal }); return { ok: true, value: { prompt: '真实资料正文', sources: [{ absolutePath: 'E:/员工知识/40-知识/原文.md' }] } }; } });
  const scoped = { bail(subject, event, payload) { assert.equal(subject, scoped); assert.equal(event, 'slash/input-insert-reference'); received.push(payload); return true; } };
  f.ctx.sessions.binding = id => id === 'assistant' ? { ctx: scoped } : undefined;
  f.clients.assistant.setAssistantContext('assistant', ['40-知识/原文.md']);
  const props = { sessionId: 'assistant', inputActions: { captureInsertion: () => ({ start: 3, end: 3, draftRev: 2 }) } };
  const tree = f.render('conversation.input.left', props);
  await button(tree, '引用所选笔记').props.onClick();
  assert.deepEqual(received[0].span, { start: 3, end: 3, draftRev: 2 });
  assert.equal(received[0].reference.source, 'whalewing-knowledge');
  assert.equal(f.render('conversation.input.left', { ...props, sessionId: 'other' }), null);
  const source = f.triggerSources.get('whalewing-knowledge');
  const controller = new AbortController();
  assert.equal(await source.codec.serialize(received[0].reference.ref, controller.signal), '\n@"E:/员工知识/40-知识/原文.md"\n');
  assert.deepEqual(received[1].input.paths, ['40-知识/原文.md']);
  assert.equal(received[1].signal, controller.signal);
  assert.equal(f.calls.some(([kind]) => kind === 'prompt'), false);
  for (const dispose of f.disposed) await dispose();
  assert.equal(f.triggerSources.size, 0);
});

test('原生资料序列化错误不变成空引用，插入被拒绝时保留原位错误', async () => {
  const f = await fixture({ knowledge: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: '原文已删除' } }) });
  await assert.rejects(f.triggerSources.get('whalewing-knowledge').codec.serialize('["missing.md"]'), { code: 'NOT_FOUND' });
  f.ctx.sessions.binding = () => ({ ctx: { bail: () => false } });
  f.clients.assistant.setAssistantContext('a', ['missing.md']);
  const props = { sessionId: 'a', inputActions: { captureInsertion: () => ({ start: 0, end: 0, draftRev: 0 }) } };
  await button(f.render('conversation.input.left', props), '引用所选笔记').props.onClick();
  assert.ok(nodes(f.render('conversation.input.left', props)).some(node => node.props.role === 'alert'));
});

test('小鲸空资料仍可启动，固定标准模式，停靠悬浮收起不更换会话引用', async () => {
  const f = await fixture();
  assert.equal(nodes(f.render()).some(node => node.type === 'textarea'), false);
  await button(f.render(), '开始与小鲸协作').props.onClick();
  const render = () => f.render('main', { SessionProvider: 'SessionProvider', renderSlot: name => ({ type: name, props: { children: [] } }) });
  render(); f.flushEffects(); await new Promise(setImmediate);
  const reference = nodes(render()).find(node => node.type === 'SessionProvider').props.session;
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
  assert.equal(f.calls.find(([kind]) => kind === 'create')[1].agentPreset, 'standard');
  button(render(), '停靠').props.onClick();
  assert.equal(nodes(render()).find(node => node.type === 'SessionProvider').props.session, reference);
  button(render(), '收起助手').props.onClick();
  assert.equal(nodes(render()).find(node => node.type === 'SessionProvider').props.session, reference);
  assert.ok(nodes(render()).some(node => node.type === 'aside' && node.props.hidden));
  f.unmount(); assert.equal(f.calls.filter(([kind]) => kind === 'release').length, 1);
});

test('专家新增默认跟随系统，必填项先校验，冲突保留输入和选择', async () => {
  const requests = [];
  const f = await fixture({ experts: async input => {
    requests.push(input);
    if (input.action === 'list') return { ok: true, value: { experts: roles, deleted: [] } };
    if (input.action === 'catalog') return { ok: true, value: { models: [{ id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-flash', name: 'DeepSeek v4.1 flash' }] }], defaultModel: { provider: 'deepseek-official', model: 'deepseek-flash' }, skills: [{ name: 'existing-skill', description: '可复用方法' }], mcpServers: [], issues: [] } };
    return { ok: false, error: { code: 'conflict', message: '配置已有新版本' } };
  } });
  nodes(f.render()).find(node => node.type === 'button' && node.props.className === 'ww-card ww-add-card').props.onClick();
  const editor = nodes(f.render()).find(node => typeof node.type === 'function' && node.type.name === 'ExpertEditor');
  const render = f.isolate(editor); render(); f.flushEffects(); await new Promise(setImmediate);
  await button(render(), '创建专家').props.onClick();
  assert.equal(requests.some(input => input.action === 'save'), false);
  const change = (label, value) => {
    const field = nodes(render()).find(node => node.type === 'label' && node.props.children.includes(label));
    nodes(field).find(node => ['input', 'textarea'].includes(node.type)).props.onChange({ target: { value } });
  };
  change('专家名字', '新专家'); change('一句话介绍', '专注工作'); change('系统提示词（必填）', '请遵守知识来源');
  const check = nodes(render()).find(node => node.type === 'input' && node.props.type === 'checkbox'); check.props.onChange({ target: { checked: true } });
  await button(render(), '创建专家').props.onClick();
  const saved = requests.find(input => input.action === 'save');
  assert.equal(saved.expectedRevision, 0); assert.match(saved.id, /^custom-[a-f0-9-]+$/);
  assert.equal(saved.expert.model, null);
  assert.ok(nodes(render()).some(node => node.type === 'option' && node.props.value === '' && node.props.children.includes('跟随系统默认')));
  assert.deepEqual(saved.expert.skills, ['existing-skill']);
  assert.ok(nodes(render()).some(node => node.type === 'textarea' && node.props.value === '请遵守知识来源'));
  assert.ok(nodes(f.render('shell.overlay')).some(node => node.props.role === 'alert' && node.props.children.includes(shown('conflict', '配置已有新版本'))));
});

test('新增专家可从模板库或导入的模板文件开始，只保留当前装了的技能并提示跳过的，格式不对的文件报错不改表单', async () => {
  const requests = [];
  const template = { id: 'translator', name: '翻译专家', description: '中英互译', prompt: '# 翻译专家\n\n你是翻译专家。', skills: ['existing-skill', 'missing-skill'], avatar: null };
  const f = await fixture({ experts: async input => {
    requests.push(input);
    if (input.action === 'list') return { ok: true, value: { experts: roles, deleted: [] } };
    if (input.action === 'templates') return { ok: true, value: { templates: [template] } };
    if (input.action === 'catalog') return { ok: true, value: { models: [], defaultModel: null, skills: [{ name: 'existing-skill', description: '可复用方法' }], mcpServers: [], issues: [] } };
    return { ok: true, value: { expert: { ...input.expert, id: input.id, revision: 1, builtin: false } } };
  } });
  nodes(f.render()).find(node => node.type === 'button' && node.props.className === 'ww-card ww-add-card').props.onClick();
  const render = f.isolate(nodes(f.render()).find(node => node.type.name === 'ExpertEditor'));
  render(); f.flushEffects(); await new Promise(setImmediate);
  const value = label => nodes(nodes(render()).find(node => node.type === 'label' && node.props.children.includes(label))).find(node => ['input', 'textarea'].includes(node.type)).props.value;
  const picker = () => nodes(render()).find(node => node.type === 'select' && nodes(node).some(child => child.type === 'option' && [].concat(child.props.children).includes('空白专家')));
  picker().props.onChange({ target: { value: 'translator' } });
  assert.equal(value('专家名字'), '翻译专家'); assert.equal(value('一句话介绍'), '中英互译'); assert.equal(value('系统提示词（必填）'), template.prompt);
  assert.ok(nodes(render()).find(node => node.type === 'input' && node.props.type === 'checkbox').props.checked);
  assert.ok(JSON.stringify(f.render('shell.overlay')).includes('已跳过：missing-skill'));
  // 选回空白专家清空模板填入的内容。
  picker().props.onChange({ target: { value: '' } });
  assert.equal(value('专家名字'), '');
  const importer = () => nodes(render()).find(node => node.type === 'input' && node.props.type === 'file' && node.props.accept.startsWith('.md'));
  await importer().props.onChange({ target: { files: [{ text: async () => '---\nname: 缺正文\ndescription: 没有提示词\n---\n' }], value: 'x' } });
  assert.ok(nodes(f.render('shell.overlay')).some(node => node.props.role === 'alert' && JSON.stringify(node).includes('专家模板格式不对')));
  assert.equal(value('专家名字'), '');
  await importer().props.onChange({ target: { files: [{ text: async () => '---\nname: 企业售前\ndescription: 企业自己的售前模板\nskills:\n  - existing-skill\n  - company-only-skill\n---\n# 企业售前\n\n你是企业售前。\n' }], value: 'x' } });
  assert.equal(value('专家名字'), '企业售前');
  await button(render(), '创建专家').props.onClick();
  const saved = requests.find(input => input.action === 'save');
  assert.deepEqual({ name: saved.expert.name, prompt: saved.expert.prompt, skills: saved.expert.skills }, { name: '企业售前', prompt: '# 企业售前\n\n你是企业售前。', skills: ['existing-skill'] });
  assert.match(saved.id, /^custom-[a-f0-9-]+$/);
});

test('专家模型准备使用Host断言并核对modelSelection.next', async () => {
  const f = await fixture();
  const selected = { provider: 'fixture', model: 'default' };
  let request;
  f.ctx.remote.whalewingExperts.manage = async input => { request = input; return { ok: true, value: { selected } }; };
  f.ctx.remote.session.projections = async () => ({ ok: true, value: { asOfSeq: 0, values: { modelSelection: { next: selected } } } });
  await f.clients.experts.applyExpertModel('s', roles[0]);
  assert.deepEqual(request, { action: 'prepare_model', sessionId: 's', expertId: 'manager', expectedRevision: 0 });
  f.ctx.remote.session.projections = async () => ({ ok: true, value: { asOfSeq: 0, values: { modelSelection: { next: { provider: 'other', model: 'other' } } } } });
  await assert.rejects(f.clients.experts.applyExpertModel('s', roles[0]), { code: 'model_readback' });
});


test('专家新增已提交但列表读回失败，后续保存复用返回身份而不重复新增', async () => {
  const requests = [];
  let saved;
  let reads = 0;
  const f = await fixture({ experts: async input => {
    requests.push(input);
    if (input.action === 'list') {
      if ([2, 3].includes(++reads)) return { ok: false, error: { code: 'offline', message: '列表读回中断' } };
      return { ok: true, value: { experts: saved ? [...roles, saved] : roles, deleted: [] } };
    }
    if (input.action === 'catalog') return { ok: true, value: { models: [], defaultModel: { provider: 'deepseek-official', model: 'deepseek-flash' }, skills: [], mcpServers: [], issues: [] } };
    saved = { ...input.expert, id: input.id || 'custom-one', revision: input.expectedRevision + 1, builtin: false };
    return { ok: true, value: { expert: saved } };
  } });
  nodes(f.render()).find(node => node.type === 'button' && node.props.className === 'ww-card ww-add-card').props.onClick();
  const render = f.isolate(nodes(f.render()).find(node => node.type.name === 'ExpertEditor'));
  render(); f.flushEffects(); await new Promise(setImmediate);
  for (const [label, value] of [['专家名字', '同一专家'], ['一句话介绍', '工作'], ['系统提示词（必填）', '完成工作']]) {
    const field = nodes(render()).find(node => node.type === 'label' && node.props.children.includes(label));
    nodes(field).find(node => ['input', 'textarea'].includes(node.type)).props.onChange({ target: { value } });
  }
  await button(render(), '创建专家').props.onClick();
  assert.ok(nodes(f.render('shell.overlay')).some(node => node.props.role === 'alert'));
  await button(render(), '创建专家').props.onClick();
  const writes = requests.filter(input => input.action === 'save');
  assert.equal(writes.length, 2);
  assert.match(writes[0].id, /^custom-[a-f0-9-]+$/);
  assert.equal(writes[1].id, writes[0].id);
  assert.equal(writes[1].expectedRevision, 1);
});


for (const type of ['jpeg', 'webp']) test(`新增${type}头像规范化且回执丢失时，显式加载已保存版本恢复同一身份`, async () => {
  const previous = globalThis.FileReader;
  globalThis.FileReader = class { readAsDataURL() { this.result = `data:image/${type};base64,aGVsbG8=`; this.onload(); } };
  try {
    let saved;
    const writes = [];
    const f = await fixture({ experts: async input => {
      if (input.action === 'list') return { ok: true, value: { experts: saved ? [...roles, saved] : roles, deleted: [] } };
      if (input.action === 'templates') return { ok: true, value: { templates: [] } };
      if (input.action === 'catalog') return { ok: true, value: { models: [], defaultModel: { provider: 'deepseek-official', model: 'deepseek-flash' }, skills: [], mcpServers: [], issues: [] } };
      writes.push(input);
      saved = { ...input.expert, avatar: 'data:image/png;base64,cG5n', id: input.id, revision: input.expectedRevision + 1, builtin: false };
      return writes.length === 1 ? { ok: false, error: { code: 'transport', message: '回执丢失' } } : { ok: true, value: { expert: saved } };
    } });
    nodes(f.render()).find(node => node.type === 'button' && node.props.className === 'ww-card ww-add-card').props.onClick();
    const render = f.isolate(nodes(f.render()).find(node => node.type.name === 'ExpertEditor'));
    render(); f.flushEffects(); await new Promise(setImmediate);
    for (const [label, value] of [['专家名字', '带头像专家'], ['一句话介绍', '工作'], ['系统提示词（必填）', '员工原提示词']]) {
      const field = nodes(render()).find(node => node.type === 'label' && node.props.children.includes(label));
      nodes(field).find(node => ['input', 'textarea'].includes(node.type)).props.onChange({ target: { value } });
    }
    await nodes(render()).find(node => node.type === 'input' && node.props.type === 'file' && node.props.accept.startsWith('image/')).props.onChange({ target: { files: [{ type: `image/${type}`, size: 30 }] } });
    await button(render(), '创建专家').props.onClick();
    assert.equal(button(render(), '创建专家').props.disabled, true);
    assert.equal(nodes(render()).find(node => node.type === 'textarea').props.value, '员工原提示词');
    assert.equal(writes.length, 1);
    button(render(), '加载已保存配置').props.onClick();
    assert.equal(button(render(), '创建专家').props.disabled, false);
    await button(render(), '创建专家').props.onClick();
    assert.equal(writes[1].id, writes[0].id);
    assert.equal(writes[1].expectedRevision, 1);
    assert.equal(writes[1].expert.avatar, 'data:image/png;base64,cG5n');
  } finally { globalThis.FileReader = previous; }
});


test('无绑定首页暂存专家仅捕获mainView空白会话，不被助手或子代理消耗', async () => {
  const f = await fixture();
  await f.clients.experts.selectExpert(undefined, 'development');
  assert.equal(f.calls.length, 0);
  assert.equal(f.clients.experts.choices().staged.expertId, 'development');
  f.ctx.sessions.list.set({ byId: { assistant: { id: 'assistant', blank: true, retainedBy: { whalewingAssistant: 1 } }, child: { id: 'child', blank: true, origin: 'subagent', retainedBy: { mainView: 1 } } } });
  assert.equal(f.clients.experts.choices().staged.expertId, 'development');
  f.existing.set('main', false);
  f.ctx.sessions.list.set({ byId: { main: { id: 'main', blank: true, retainedBy: { mainView: 1 } } } });
  assert.equal(f.clients.experts.choices().staged, null);
  assert.equal(f.clients.experts.choices().sessions.main.expertId, 'development');
  assert.deepEqual(f.calls, [['projections', 'main']]);
  await f.ctx.sessions.retain('main').binding.session.prompt([{ type: 'text', text: '第一问' }], 'queue', undefined, 'first');
  const kind = f.calls.map(item => item[0]);
  assert.ok(kind.indexOf('expert') < kind.indexOf('prompt'));
  assert.deepEqual(f.calls.find(item => item[0] === 'expert')[2], { expertId: 'development' });
  assert.equal(f.clients.experts.choices().sessions.main, undefined);
});

test('普通与子代理原生输入不取得专家或模型，已有专家每次发送重新读取当前配置', async () => {
  const f = await fixture();
  f.existing.set('ordinary', false);
  await f.ctx.sessions.retain('ordinary').binding.session.prompt([{ type: 'text', text: '普通问题' }], 'queue');
  assert.equal(f.calls.some(item => item[0] === 'expert'), false);
  f.ctx.sessions.subagentAddress = id => id === 'child' ? { childSessionId: id } : undefined;
  await f.ctx.sessions.retain('child').binding.session.prompt([{ type: 'text', text: '子代理问题' }], 'queue');
  assert.equal(f.calls.some(item => item[0] === 'expert'), false);
  await assert.rejects(f.clients.experts.selectExpert('child', 'manager'), { code: 'expert_subagent' });
  f.existing.set('expert', false);
  await f.clients.experts.selectExpert('expert', 'manager');
  let version = 1;
  let loaded = 0;
  const selected = [];
  f.ctx.remote.whalewingExperts.manage = async input => { if (input.action === 'prepare_model') return f.ctx.remote.session.selectModel({ sessionId: input.sessionId, provider: 'p', model: `m${version}`, saveAsDefault: false }); loaded++; return { ok: true, value: { experts: [{ ...roles[0], revision: version, model: { provider: 'p', model: `m${version}` } }], deleted: [] } }; };
  f.ctx.remote.session.selectModel = async input => { selected.push(input); return { ok: true, value: { selected: input } }; };
  f.ctx.remote.session.projections = async () => ({ ok: true, value: { asOfSeq: 0, values: { whalewingExpert: { expertId: 'manager' }, modelSelection: { next: { provider: 'p', model: `m${version}` } } } } });
  await f.ctx.sessions.retain('expert').binding.session.prompt([{ type: 'text', text: '第一问' }], 'queue');
  version = 2;
  await f.ctx.sessions.retain('expert').binding.session.prompt([{ type: 'text', text: '第二问' }], 'queue');
  assert.equal(loaded, 2);
  assert.deepEqual(selected.map(item => [item.model, item.saveAsDefault]), [['m1', false], ['m2', false]]);
});

test('同一会话并发准备共享模型选择，一个等待者取消不阻止另一个发送', async () => {
  const model = { provider: 'p', model: 'm' };
  const f = await fixture({ expertExecute: async () => success({ expertId: 'manager' }) });
  f.ctx.remote.whalewingExperts.manage = async input => input.action === 'prepare_model' ? f.ctx.remote.session.selectModel({ ...model, sessionId: input.sessionId, saveAsDefault: false }) : ({ ok: true, value: { experts: [{ ...roles[0], model }], deleted: [] } });
  f.ctx.remote.session.projections = async () => ({ ok: true, value: { asOfSeq: 0, values: { whalewingExpert: { expertId: 'manager' }, modelSelection: { next: model } } } });
  let complete;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  let selections = 0;
  f.ctx.remote.session.selectModel = () => { selections++; started(); return new Promise(resolve => { complete = resolve; }); };
  const first = new AbortController();
  const second = new AbortController();
  const native = f.ctx.sessions.retain('same').binding.session;
  const one = native.prompt([{ type: 'text', text: '一' }], 'queue', first.signal);
  const two = native.prompt([{ type: 'text', text: '二' }], 'queue', second.signal);
  await ready;
  first.abort();
  await assert.rejects(one, { code: 'expert_prepare_cancelled' });
  assert.equal(f.calls.some(item => item[0] === 'prompt'), false);
  complete({ ok: true, value: { selected: model } });
  await two;
  assert.equal(selections, 1);
  assert.equal(f.calls.filter(item => item[0] === 'prompt').length, 1);
  assert.equal(f.calls.find(item => item[0] === 'prompt')[1].content[0].text, '二');
});

test('最后等待者取消后晚到模型回执不继续读回或发送问题', async () => {
  const model = { provider: 'p', model: 'm' };
  const f = await fixture({ expertExecute: async () => success({ expertId: 'manager' }) });
  f.ctx.remote.whalewingExperts.manage = async input => input.action === 'prepare_model' ? f.ctx.remote.session.selectModel({ ...model, sessionId: input.sessionId, saveAsDefault: false }) : ({ ok: true, value: { experts: [{ ...roles[0], model }], deleted: [] } });
  let reads = 0;
  f.ctx.remote.session.projections = async () => { reads++; return { ok: true, value: { asOfSeq: 0, values: { whalewingExpert: { expertId: 'manager' }, modelSelection: { next: model } } } }; };
  let complete;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  f.ctx.remote.session.selectModel = () => { started(); return new Promise(resolve => { complete = resolve; }); };
  const controller = new AbortController();
  const pending = f.ctx.sessions.retain('same').binding.session.prompt([{ type: 'text', text: '保留此问题' }], 'queue', controller.signal);
  await ready;
  controller.abort();
  await assert.rejects(pending, error => error.code === 'expert_prepare_cancelled' && error.message.includes('还没发送'));
  complete({ ok: true, value: { selected: model } });
  await new Promise(setImmediate);
  assert.equal(reads, 1);
  assert.equal(f.calls.some(item => item[0] === 'prompt'), false);
});


test('知识引用使用公共grammar保留含空格路径，消息不带正文与行号JSON', async () => {
  const f = await fixture({ knowledge: async input => {
    assert.deepEqual(input.paths, ['40-知识/合同 规则.md', '40-知识/配置.md']);
    return { ok: true, value: { prompt: '秘密正文\n{"line":12,"content":"全文"}', sources: [{ absolutePath: 'E:/员工知识/合同 规则.md' }, { absolutePath: 'E:\\知识库\\配置.md' }] } };
  } });
  const text = await f.triggerSources.get('whalewing-knowledge').codec.serialize('["40-知识/合同 规则.md","40-知识/配置.md"]');
  assert.equal(text, '\n@"E:/员工知识/合同 规则.md"\n@"E:\\知识库\\配置.md"\n');
  assert.equal(text.includes('秘密正文'), false);
  assert.equal(text.includes('content'), false);
  assert.equal(f.calls.some(item => item[0] === 'prompt'), false);
});

test('公共grammar拒收控制字符或引号路径时阻止引用序列化，不猜转义', async () => {
  const f = await fixture({ knowledge: async () => ({ ok: true, value: { prompt: '正文', sources: [{ absolutePath: 'E:/知识/不支持"路径.md' }] } }) });
  await assert.rejects(f.triggerSources.get('whalewing-knowledge').codec.serialize('["ref.md"]'), error => error.message.includes('无法作为附件引用'));
  f.ctx.remote.whalewingKnowledge.manage = async () => ({ ok: true, value: { prompt: '正文', sources: [] } });
  await assert.rejects(f.triggerSources.get('whalewing-knowledge').codec.serialize('["ref.md"]'), error => error.message.includes('不完整'));
});


test('资料chip在已有文字尾部或中间序列化时，两侧均保留原生引用边界', async () => {
  const f = await fixture({ knowledge: async () => ({ ok: true, value: { prompt: '不应显示的笔记全文', sources: [{ absolutePath: 'E:/员工知识/办理规则.md' }] } }) });
  const reference = await f.triggerSources.get('whalewing-knowledge').codec.serialize('["规则.md"]');
  assert.equal(`办理期限是多少？${reference}`, '办理期限是多少？\n@"E:/员工知识/办理规则.md"\n');
  assert.equal(`结合${reference}回答期限`, '结合\n@"E:/员工知识/办理规则.md"\n回答期限');
  assert.equal(reference.includes('笔记全文'), false);
});

test('专家准备读取权威投影，不为每轮只读确认往对话写status命令', async () => {
  const f = await fixture(); f.existing.set('s', false);
  await f.clients.experts.selectExpert('s', 'manager');
  const native = f.ctx.sessions.retain('s').binding.session;
  await native.prompt([{ type: 'text', text: '第一问' }], 'queue');
  await native.prompt([{ type: 'text', text: '第二问' }], 'queue');
  const commands = f.calls.filter(item => item[0] === 'expert');
  assert.deepEqual(commands, [['expert', 's', { expertId: 'manager' }]]);
  // 首次认领前核验精确投影，每次选模仍独立回读；不追加status命令。
  assert.equal(f.calls.filter(item => item[0] === 'projections').length, 7);
});


test('目录组件统一计数folder-only与mixed分页，跨页不重复并保留空终页返回入口', async () => {
  const offsets = [];
  let vanished = false;
  const f = await fixture({ knowledge: async input => {
    if (input.action === 'graph') return { ok: true, value: emptyGraph() };
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'vault' } };
    if (input.action === 'search') return { ok: true, value: { notes: [], total: 0, truncated: false } };
    assert.equal(input.action, 'browse'); offsets.push(input.offset);
    const common = { directory: '', total: vanished ? 0 : 5, offset: input.offset };
    if (vanished) return { ok: true, value: { ...common, folders: [], notes: [], truncated: false } };
    if (input.offset === 0) return { ok: true, value: { ...common, folders: [{ path: 'a', name: '目录A' }, { path: 'b', name: '目录B' }], notes: [], truncated: true } };
    if (input.offset === 2) return { ok: true, value: { ...common, folders: [{ path: 'c', name: '目录C' }], notes: [{ path: 'd.md', title: '笔记D' }], truncated: true } };
    assert.equal(input.offset, 4);
    return { ok: true, value: { ...common, folders: [], notes: [{ path: 'e.md', title: '笔记E' }], truncated: false } };
  } });
  await button(f.render(), '个人知识').props.onClick();
  const render = f.isolate(nodes(f.render()).find(node => node.type.name === 'Directory'));
  const settle = async () => { render(); f.flushEffects(); await new Promise(setImmediate); return render(); };
  let tree = await settle();
  assert.ok(button(tree, '目录A')); assert.equal(button(tree, '下一页').props.disabled, false);
  button(tree, '下一页').props.onClick();
  assert.equal(button(render(), '下一页').props.disabled, true);
  tree = await settle();
  assert.ok(button(tree, '目录C')); assert.ok(button(tree, '笔记D'));
  assert.equal(nodes(tree).some(node => node.props.children.includes('目录A')), false);
  button(tree, '下一页').props.onClick(); tree = await settle();
  assert.ok(button(tree, '笔记E')); assert.equal(button(tree, '下一页').props.disabled, true);
  button(tree, '上一页').props.onClick(); tree = await settle();
  assert.ok(button(tree, '目录C'));
  vanished = true;
  button(tree, '下一页').props.onClick(); tree = await settle();
  assert.equal(button(tree, '上一页').props.disabled, false);
  assert.equal(button(tree, '下一页').props.disabled, true);
  button(tree, '上一页').props.onClick(); await settle();
  assert.deepEqual(offsets, [0, 2, 4, 2, 4, 2]);
});


test('目录延迟与失败期间保留旧页但禁止翻页，重试只请求原目标偏移', async () => {
  const offsets = [];
  let settlePage;
  const f = await fixture({ knowledge: async input => {
    if (input.action === 'graph') return { ok: true, value: emptyGraph() };
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'vault' } };
    if (input.action === 'search') return { ok: true, value: { notes: [], total: 0, truncated: false } };
    offsets.push(input.offset);
    if (input.offset === 0) return { ok: true, value: { directory: '', offset: 0, total: 4, folders: [{ path: 'folder', name: '第一页目录' }], notes: [{ path: 'one.md', title: '第一页笔记' }], truncated: true } };
    return new Promise(resolve => { settlePage = resolve; });
  } });
  await button(f.render(), '个人知识').props.onClick();
  const render = f.isolate(nodes(f.render()).find(node => node.type.name === 'Directory'));
  render(); f.flushEffects(); await new Promise(setImmediate);
  button(render(), '下一页').props.onClick(); render(); f.flushEffects();
  assert.equal(button(render(), '下一页').props.disabled, true);
  assert.equal(button(render(), '上一页').props.disabled, true);
  assert.ok(button(render(), '第一页笔记'));
  settlePage({ ok: false, error: { code: 'offline', message: '目录请求中断' } });
  await new Promise(setImmediate);
  assert.equal(button(render(), '下一页').props.disabled, true);
  assert.equal(button(render(), '上一页').props.disabled, true);
  assert.ok(button(render(), '第一页笔记'));
  button(render(), '重试目录').props.onClick(); render(); f.flushEffects();
  settlePage({ ok: true, value: { directory: '', offset: 2, total: 4, folders: [], notes: [{ path: 'two.md', title: '第二页笔记' }, { path: 'three.md', title: '第三篇' }], truncated: false } });
  await new Promise(setImmediate);
  assert.equal(button(render(), '上一页').props.disabled, false);
  assert.equal(button(render(), '下一页').props.disabled, true);
  assert.ok(button(render(), '第二页笔记'));
  assert.deepEqual(offsets, [0, 2, 2]);
});


test('默认关闭助手且不准备会话，窄屏主动打开后悬浮并可再次收起召回', async () => {
  const listeners = new Set();
  const media = { matches: true, addEventListener(name, fn) { assert.equal(name, 'change'); listeners.add(fn); }, removeEventListener(name, fn) { assert.equal(name, 'change'); listeners.delete(fn); } };
  const f = await fixture({ matchMedia: query => { assert.equal(query, '(max-width: 850px)'); return media; } });
  f.browser.innerWidth = 520; f.browser.innerHeight = 700;
  f.render(); f.flushEffects();
  assert.equal(nodes(f.render()).find(node => node.type === 'aside').props.hidden, true);
  assert.ok(button(f.render(), '打开小鲸助手'));
  assert.equal(f.calls.some(item => ['create', 'retain', 'present', 'prompt', 'open'].includes(item[0])), false);
  button(f.render(), '打开小鲸助手').props.onClick();
  f.render(); f.flushEffects(); const tree = f.render();
  const aside = nodes(tree).find(node => node.type === 'aside');
  assert.equal(aside.props.hidden, false); assert.match(aside.props.className, /ww-assistant-float/);
  assert.ok(aside.props.style.left + aside.props.style.width <= 504);
  button(tree, '收起助手').props.onClick();
  assert.equal(listeners.size, 1);
  button(f.render(), '打开小鲸助手').props.onClick();
  assert.equal(nodes(f.render()).find(node => node.type === 'aside').props.hidden, false);
  f.unmount(); assert.equal(listeners.size, 0);
});

for (const domain of ['expert', 'skill']) test(`${domain}冲突不取得知识编辑保护，知识页仍可加载图谱`, async () => {
  const f = await fixture({
    experts: async input => input.action === 'list' ? { ok: true, value: { experts: roles.map(role => ({ ...role, customized: ['prompt'] })), deleted: [] } } : { ok: false, error: { code: 'CONFLICT', message: '专家配置已被修改' } },
    skillLibrary: async () => ({ ok: false, error: { code: 'CONFLICT', message: '技能hash已被修改' } }),
  });
  if (domain === 'expert') {
    const card = nodes(f.render()).find(node => node.type === 'article' && node.props.className === 'ww-card');
    button(card, '恢复原版').props.onClick();
    const confirmation = nodes(f.render()).find(node => node.type === 'dialog' && JSON.stringify(node).includes('选择要换回原版的内容：'));
    await button(confirmation, '恢复原版').props.onClick();
  } else await button(f.render(), '技能成长').props.onClick();
  await button(f.render(), '个人知识').props.onClick();
  assert.ok(f.calls.some(item => item[0] === 'knowledge' && item[1].action === 'graph'));
  assert.equal(button(f.render(), '关系图谱').props.disabled, false);
});

for (const code of ['READBACK', 'CONFLICT']) test(`恢复其它路径的${code}保留对应回读入口，不误读当前笔记`, async () => {
  const requests = [];
  const f = await fixture({ knowledge: async input => {
    requests.push(input);
    if (input.action === 'graph') return { ok: true, value: emptyGraph() };
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'vault' } };
    if (input.action === 'search') return { ok: true, value: { notes: [], total: 0, truncated: false } };
    if (input.action === 'restore') return { ok: false, error: { code, message: '恢复目标需重新读取' } };
    if (input.action === 'document') return { ok: true, value: { path: input.path, content: '实际正文', hash: 'actual', view: { type: 'text', value: '实际正文' }, links: [], backlinks: [] } };
    assert.fail(input.action);
  } });
  await button(f.render(), '个人知识').props.onClick();
  const field = nodes(f.render()).find(node => node.type === 'label' && node.props.children.includes('要恢复的笔记路径'));
  nodes(field).find(node => node.type === 'input').props.onChange({ target: { value: '10-收件箱/恢复目标.md' } });
  await button(f.render(), '恢复').props.onClick();
  assert.equal(button(f.render(), '关系图谱').props.disabled, true);
  assert.equal(button(f.render(), '读取最新内容').props.disabled, false);
  await button(f.render(), '读取最新内容').props.onClick();
  assert.deepEqual(requests.at(-1), { action: 'document', path: '10-收件箱/恢复目标.md' });
  assert.equal(button(f.render(), '关系图谱').props.disabled, false);
});

test('保存与文档回读之间的外改保护未编辑正文，明确回读后可再次保存', async () => {
  let content = '原正文', hash = 'old', external = true, graphRequests = 0;
  const f = await fixture({ knowledge: async input => {
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'vault' } };
    if (input.action === 'search') return { ok: true, value: { notes: [], total: 0, truncated: false } };
    if (input.action === 'graph') { graphRequests++; return { ok: true, value: { ...emptyGraph(), total: 1, nodes: [{ kind: 'note', readOnly: false, path: 'a.md', title: 'A', degree: 0 }] } }; }
    if (input.action === 'document') return { ok: true, value: { path: input.path, content, hash, view: { type: 'text', value: content }, links: [], backlinks: [] } };
    if (input.action === 'write') { content = external ? '外部新正文' : input.content; hash = external ? 'external' : 'saved'; return { ok: true, value: { path: input.path, hash: 'saved' } }; }
    assert.fail(input.action);
  } });
  await button(f.render(), '个人知识').props.onClick();
  await nodes(f.render()).find(node => node.type?.name === 'GraphCanvas').props.onOpenNote({ path: 'a.md' });
  button(f.render(), '编辑').props.onClick();
  await button(f.render(), '保存').props.onClick();
  assert.equal(button(f.render(), '关系图谱').props.disabled, true);
  assert.equal(button(f.render(), '读取最新内容').props.disabled, false);
  await button(f.render(), '个人知识').props.onClick(); assert.equal(graphRequests, 1);
  assert.equal(nodes(f.render()).find(node => node.type === 'textarea').props.value, '原正文');
  await button(f.render(), '读取最新内容').props.onClick();
  external = false; button(f.render(), '编辑').props.onClick();
  await button(f.render(), '保存').props.onClick();
  assert.equal(button(f.render(), '关系图谱').props.disabled, false);
  await button(f.render(), '个人知识').props.onClick(); assert.equal(graphRequests, 2);
});

test('变窄只收起dock，显式float与气泡宽屏恢复不受干扰，原生会话引用保持', async () => {
  const listeners = new Set();
  const media = { matches: false, addEventListener: (_name, fn) => listeners.add(fn), removeEventListener: (_name, fn) => listeners.delete(fn) };
  const change = matches => { media.matches = matches; listeners.forEach(fn => fn(media)); };
  const f = await fixture({ matchMedia: () => media });
  const render = () => f.render('main', { SessionProvider: 'SessionProvider', renderSlot: name => ({ type: name, props: { children: [] } }) });
  render(); f.flushEffects(); await new Promise(setImmediate);
  await button(render(), '开始与小鲸协作').props.onClick(); render(); f.flushEffects(); await new Promise(setImmediate);
  const reference = nodes(render()).find(node => node.type === 'SessionProvider').props.session;
  button(render(), '停靠').props.onClick();
  change(true);
  assert.equal(nodes(render()).find(node => node.type === 'aside').props.hidden, true);
  assert.equal(nodes(render()).find(node => node.type === 'SessionProvider').props.session, reference);
  button(render(), '打开小鲸助手').props.onClick();
  assert.equal(nodes(render()).find(node => node.type === 'aside').props.hidden, false);
  change(false);
  change(true);
  assert.ok(nodes(render()).find(node => node.type === 'aside').props.className.includes('ww-assistant-float'));
  button(render(), '收起助手').props.onClick(); change(false);
  assert.equal(nodes(render()).find(node => node.type === 'aside').props.hidden, true);
  assert.equal(nodes(render()).find(node => node.type === 'SessionProvider').props.session, reference);
  assert.equal(f.calls.filter(item => item[0] === 'create').length, 1);
  f.unmount(); assert.equal(listeners.size, 0);
});


test('目录同offset刷新失败也禁止旧页翻页，重试成功才恢复导航', async () => {
  const offsets = [];
  let failed = false;
  const f = await fixture({ knowledge: async input => {
    if (input.action === 'graph') return { ok: true, value: emptyGraph() };
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'vault' } };
    if (input.action === 'search') return { ok: true, value: { notes: [], total: 0, truncated: false } };
    offsets.push(input.offset);
    if (failed) return { ok: false, error: { code: 'offline', message: '同页刷新失败' } };
    return { ok: true, value: { directory: '', offset: input.offset, total: 3, folders: [{ path: 'folder', name: '目录' }], notes: [{ path: 'note.md', title: '笔记' }], truncated: true } };
  } });
  await button(f.render(), '个人知识').props.onClick();
  const component = nodes(f.render()).find(node => node.type.name === 'Directory');
  const render = f.isolate(component);
  render(); f.flushEffects(); await new Promise(setImmediate);
  assert.equal(button(render(), '下一页').props.disabled, false);
  failed = true; component.props.version = 1;
  render(); f.flushEffects(); await new Promise(setImmediate);
  assert.equal(button(render(), '下一页').props.disabled, true);
  assert.ok(button(render(), '笔记'));
  failed = false;
  button(render(), '重试目录').props.onClick(); render(); f.flushEffects(); await new Promise(setImmediate);
  assert.equal(button(render(), '下一页').props.disabled, false);
  assert.deepEqual(offsets, [0, 0, 0]);
});

test('可见助手等ready申请预览租约，dock与float复用，bubble及卸载释放且保草稿', async () => {
  let ready;
  const f = await fixture({ retainReady: new Promise(resolve => { ready = resolve; }) });
  const a = await mountedAssistant(f);
  a.reference.binding.draft = '原生草稿';
  assert.deepEqual(f.presentations, []);
  ready(); await a.tick();
  assert.deepEqual(f.presentations, [['present', 'whalewing', a.reference.sessionId]]);
  button(a.render(), '停靠').props.onClick(); await a.tick();
  button(a.render(), '悬浮').props.onClick(); await a.tick();
  assert.equal(f.presentations.length, 1);
  button(a.render(), '收起助手').props.onClick(); await a.tick();
  assert.deepEqual(f.presentations.at(-1), ['release', a.reference.sessionId]);
  button(a.render(), '打开小鲸助手').props.onClick(); await a.tick();
  assert.equal(f.presentations.filter(item => item[0] === 'present').length, 2);
  const current = nodes(a.render()).find(node => node.type === 'SessionProvider').props.session;
  assert.equal(current, a.reference); assert.equal(current.binding.draft, '原生草稿');
  assert.equal(f.calls.some(item => item[0] === 'open'), false);
  f.unmount(); assert.equal(f.presentations.filter(item => item[0] === 'release').length, 2);
});

test('ready晚到不认领隐藏或已卸载面板，会话换代先释放旧租约', async () => {
  let ready;
  const f = await fixture({ retainReady: new Promise(resolve => { ready = resolve; }) });
  const a = await mountedAssistant(f);
  button(a.render(), '收起助手').props.onClick(); await a.tick();
  ready(); await a.tick(); assert.deepEqual(f.presentations, []);
  button(a.render(), '打开小鲸助手').props.onClick(); await a.tick();
  f.clients.assistant.ensureAssistant = async () => 'replacement';
  await a.start(); await a.tick(); await a.tick();
  assert.deepEqual(f.presentations, [['present', 'whalewing', a.reference.sessionId], ['release', a.reference.sessionId], ['present', 'whalewing', 'replacement']]);
  assert.ok(f.calls.some(item => item[0] === 'release' && item[1] === a.reference.sessionId));
  f.unmount(); assert.deepEqual(f.presentations.at(-1), ['release', 'replacement']);
  let lateReady;
  const late = await fixture({ retainReady: new Promise(resolve => { lateReady = resolve; }) });
  await mountedAssistant(late); late.unmount(); lateReady(); await new Promise(setImmediate);
  assert.deepEqual(late.presentations, []);
});

test('原生DSH没有资料预览时小鲸照常对话、不报错', async () => {
  const f = await fixture({ sidebarRight: {} });
  const a = await mountedAssistant(f);
  a.reference.binding.draft = '照常保留';
  assert.equal(nodes(a.render()).some(node => node.props.role === 'alert'), false);
  const current = nodes(a.render()).find(node => node.type === 'SessionProvider').props.session;
  assert.equal(current, a.reference); assert.equal(current.binding.draft, '照常保留');
  f.unmount();
});

test('预览租约拒收保留原生会话草稿，原位重试恢复', async () => {
  for (const missing of [false]) {
    let reject = true;
    const service = missing ? {} : { presentSession() { if (reject) throw new Error('此面板已有可见会话'); return () => {}; } };
    const f = await fixture({ sidebarRight: service });
    const a = await mountedAssistant(f);
    a.reference.binding.draft = '失败也保留';
    assert.ok(nodes(a.render()).some(node => node.props.role === 'alert' && JSON.stringify(node).includes(missing ? '不支持资料预览' : '已有可见会话')));
    if (missing) service.presentSession = () => () => {};
    reject = false;
    button(a.render(), '重试资料预览').props.onClick(); await a.tick();
    assert.equal(nodes(a.render()).some(node => node.props.role === 'alert'), false);
    const current = nodes(a.render()).find(node => node.type === 'SessionProvider').props.session;
    assert.equal(current, a.reference); assert.equal(current.binding.draft, '失败也保留');
    assert.equal(f.calls.filter(item => item[0] === 'create').length, 1);
    assert.equal(f.calls.some(item => item[0] === 'open'), false);
    f.unmount();
  }
});

/** 假的浮层元素：只记下挂上去的 toggle 监听，测试里模拟浏览器自己收起浮层（按 Esc、点别处）。 */
const popoverElement = () => {
  const listeners = new Set();
  return { listeners, hidePopover() {}, addEventListener: (type, listener) => { if (type === 'toggle') listeners.add(listener); }, removeEventListener: (type, listener) => listeners.delete(listener), close: () => { for (const listener of [...listeners]) listener({ newState: 'closed' }); } };
};

test('菜单在浏览器自己收起浮层时跟着记成已关（DSH 的 React 18 不转发浮层的 toggle），动作后同步关闭，下一次单击即打开', async () => {
  const f = await fixture();
  const menu = nodes(f.render()).find(node => typeof node.type === 'function' && node.type.name === 'ActionMenu');
  const render = f.isolate(menu);
  const trigger = () => nodes(render()).find(node => node.type === 'button');
  const surface = () => nodes(render()).find(node => node.props.popover === 'auto');
  assert.equal(surface().props.onToggle, undefined, '不靠 React 的 onToggle');
  const element = popoverElement();
  surface().props.ref.current = element;
  render(); f.flushEffects();
  assert.equal(element.listeners.size, 1, '直接在浮层元素上监听 toggle');
  trigger().props.onClick(); assert.equal(trigger().props['aria-expanded'], true);
  element.close();
  assert.equal(trigger().props['aria-expanded'], false);
  trigger().props.onClick(); assert.equal(trigger().props['aria-expanded'], true);
  surface().props.onClick({ target: { closest: selector => { assert.equal(selector, 'button:not(:disabled)'); return {}; } } });
  assert.equal(trigger().props['aria-expanded'], false);
  trigger().props.onClick(); assert.equal(trigger().props['aria-expanded'], true);
});

test('两个原生专家入口的浮层被浏览器收起后（点别处、按 Esc），单击一次就重新打开', async () => {
  for (const slot of ['conversation.hero.actions', 'conversation.session.header.actions']) {
    const f = await fixture();
    const render = () => f.render(slot, { useProjection: () => null, useSessions: select => select({ byId: {} }) });
    const trigger = () => nodes(render()).find(node => node.props.className === 'ww-picker-trigger');
    const panel = () => nodes(render()).find(node => node.props.popover === 'auto');
    assert.equal(panel().props.onToggle, undefined, '不靠 React 的 onToggle');
    const element = popoverElement();
    panel().props.ref.current = element;
    render(); f.flushEffects();
    assert.ok(element.listeners.size >= 1, '直接在浮层元素上监听 toggle');
    trigger().props.onClick(); assert.equal(trigger().props['aria-expanded'], true);
    element.close();
    assert.equal(trigger().props['aria-expanded'], false);
    trigger().props.onClick(); assert.equal(trigger().props['aria-expanded'], true);
  }
});

test('编辑技能将同名所选状态与已读hash交给小鲸，不复制正文或退化为按名字读取', async () => {
  const records = ['candidate', 'active', 'disabled'].map(state => ({ id: `fixture/${state}/skill.md`, origin: 'evolution', actions: ['read', 'evolve'], discovery: 'available', name: '同名技能', state, hash: `hash-${state}`, content: `正文-${state}`, sourcePaths: ['来源.md'] }));
  for (const selected of records) {
    const reads = [];
    const f = await fixture({ skillLibrary: async input => {
      if (input.action === 'list') return { ok: true, value: { entries: records, offset: 0, total: records.length, truncated: false } };
      if (input.action === 'read') { reads.push(input); return { ok: true, value: { entry: records.find(item => item.id === input.id) } }; }
      assert.fail(`意外动作 ${input.action}`);
    } });
    await button(f.render(), '技能成长').props.onClick();
    const choice = nodes(f.render()).find(node => node.type === 'button' && node.props.key === selected.id);
    await choice.props.onClick();
    await discuss(f, button(f.render(), '与小鲸编辑技能').props.onClick);
    const request = { question: [...f.inputs.values()][0].state.getSnapshot().draft };
    assert.deepEqual(reads, [{ action: 'read', id: selected.id }]);
    assert.ok(request.question.includes(JSON.stringify({ name: selected.name, state: selected.state, hash: selected.hash })));
    assert.match(request.question, /whalewing_skill 的 read 动作读取指定 name 和 state/);
    assert.match(request.question, /不一致时停止修改/);
    assert.match(request.question, /现有技能演进流程/);
    assert.ok(records.every(item => !request.question.includes(item.content)));
  }
});

test('内置专家只有编辑和恢复原版（改过才出现），自定义仍可删除，恢复确认后等待版本读回', async () => {
  const custom = { ...roles[1], id: 'custom-test', builtin: false };
  let data = [{ ...roles[0], customized: ['prompt'], baseUpdated: [] }, roles[1], custom];
  const changes = [];
  const f = await fixture({ experts: async input => {
    if (input.action === 'list') return { ok: true, value: { experts: data, deleted: [] } };
    changes.push(input);
    const expert = { ...data.find(item => item.id === input.id), revision: input.expectedRevision + 1 };
    data = data.map(item => item.id === input.id ? expert : item);
    return { ok: true, value: { expert } };
  } });
  const cards = nodes(f.render()).filter(node => node.type === 'article' && node.props.className === 'ww-card');
  assert.equal(nodes(cards[0]).some(node => node.type === 'button' && node.props.children.includes('删除专家')), false);
  assert.ok(button(cards[0], '恢复原版'));
  assert.equal(nodes(cards[1]).some(node => node.type === 'button' && node.props.children.includes('恢复原版')), false);
  assert.ok(button(cards[2], '删除专家'));
  button(cards[0], '恢复原版').props.onClick();
  assert.equal(changes.length, 0);
  const confirmation = nodes(f.render()).find(node => node.type === 'dialog' && JSON.stringify(node).includes('选择要换回原版的内容：'));
  await button(confirmation, '恢复原版').props.onClick();
  assert.deepEqual(changes, [{ action: 'restore', id: 'manager', expectedRevision: 0 }]);
  assert.equal(f.clients.experts.experts().experts.find(item => item.id === 'manager').revision, 1);
});

test('提炼留在技能页并复用小鲸原生会话，已有草稿保持且不创建专家工作区任务', async () => {
  const f = await fixture();
  const a = await mountedAssistant(f);
  const input = f.inputFor(a.reference.sessionId); input.state.set({ ...input.state.getSnapshot(), draft: '手写未发送的问题' });
  await button(a.render(), '技能成长').props.onClick();
  await button(a.render(), '与小鲸讨论提炼').props.onClick(); await a.tick();
  const current = nodes(a.render()).find(node => node.type === 'SessionProvider').props.session;
  assert.equal(current, a.reference); assert.ok(input.state.getSnapshot().draft.startsWith('手写未发送的问题\n\n'));
  assert.equal(f.calls.filter(item => item[0] === 'create').length, 1);
  assert.equal(f.calls.some(item => item[0] === 'open'), false);
  assert.ok(button(a.render(), '技能成长').props['aria-pressed']);
  assert.equal(f.calls.some(item => item[0] === 'prompt' || item[0] === 'knowledge'), false);
  assert.match(input.state.getSnapshot().draft, /讨论如何从已有知识提炼/);
  f.unmount();
});

test('助手空白和已有对话共用常驻公开views容器，不替换原生输入', async () => {
  const f = await fixture();
  let occurrence;
  f.render('whalewing.assistant.conversation', { useSession: select => select({ openState: 'ready', blank: true }), renderFactorySlot(name, props, options) { occurrence = { name, props, options }; } });
  assert.equal(occurrence.name, 'conversation.content');
  assert.deepEqual(occurrence.props, { variant: 'embedded', phase: 'active', hero: false });
  const calls = [];
  const child = occurrence.options.slots.views({ sessionId: 'ready-session', renderSlot: (name, props) => { calls.push([name, props]); return null; } });
  const renderChat = f.isolate(child);
  const tree = renderChat(); f.flushEffects();
  assert.equal(tree.props.className, 'ww-assistant-chat');
  assert.deepEqual(calls, [['conversation.session', { view: 'chat' }]]);
  assert.equal(tree.props.children[0], null);
});

test('悬浮标题拖动和八方向缩放保留引用，边界夹紧且取消与卸载释放捕获', async () => {
  const f = await fixture(); const a = await mountedAssistant(f);
  assert.match(nodes(a.render()).find(node => node.type === 'aside').props.className, /ww-assistant-float/);
  const frame = () => nodes(a.render()).find(node => node.type === 'aside');
  const capture = new Set();
  const target = { setPointerCapture: id => capture.add(id), hasPointerCapture: id => capture.has(id), releasePointerCapture: id => capture.delete(id) };
  frame().props.ref.current = { getBoundingClientRect: () => frame().props.style };
  const event = (x, y) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, currentTarget: target, target: { closest: () => null }, preventDefault() {} });
  const header = () => nodes(frame()).find(node => node.type === 'header');
  assert.ok(button(header(), '收起助手'));
  header().props.onPointerDown(event(0, 0)); header().props.onPointerMove(event(-10000, -10000));
  assert.equal(frame().props.style.left, 16); assert.equal(frame().props.style.top, 16);
  header().props.onPointerCancel(event(0, 0)); assert.equal(capture.size, 0);
  const directions = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  for (const direction of directions) {
    const handle = () => nodes(frame()).find(node => node.props.className === `ww-resize ww-resize-${direction}`);
    handle().props.onPointerDown(event(0, 0)); handle().props.onPointerMove(event(70, 70)); handle().props.onPointerUp(event(70, 70));
    const rect = frame().props.style;
    assert.ok(rect.width >= 320 && rect.height >= 360);
    assert.ok(rect.left >= 16 && rect.top >= 16 && rect.left + rect.width <= f.browser.innerWidth - 16 && rect.top + rect.height <= f.browser.innerHeight - 16);
  }
  assert.equal(nodes(a.render()).find(node => node.type === 'SessionProvider').props.session, a.reference);
  f.browser.innerWidth = 280; f.browser.innerHeight = 300;
  for (const listener of f.windowEvents.get('resize')) listener();
  assert.ok(frame().props.style.width <= 248 && frame().props.style.height <= 268);
  header().props.onPointerDown(event(0, 0)); assert.equal(capture.size, 1);
  f.unmount(); assert.equal(capture.size, 0); assert.equal(f.windowEvents.get('resize').size, 0);
});

test('技能库无会话即可列出并按精确来源读取同名项，系统原件没有删除入口', async () => {
  const entries = [
    { id: '.system/whalewing/builtin/a/SKILL.md', name: '同名', description: '系统', origin: 'builtin', hash: 'base', actions: ['read', 'update'], discovery: 'shadowed', editId: 'a/SKILL.md', content: '原件' },
    { id: 'a/SKILL.md', name: '同名', description: '我的修改', origin: 'override', hash: 'override', baseHash: 'base', baseId: '.system/whalewing/builtin/a/SKILL.md', actions: ['read', 'update', 'reset'], discovery: 'available', content: '个人修改' },
  ];
  const requests = [];
  const f = await fixture({ skillLibrary: async input => {
    requests.push(input);
    return { ok: true, value: input.action === 'list' ? { entries, offset: 0, total: 2, truncated: false } : { entry: entries.find(item => item.id === input.id) || null } };
  } });
  await button(f.render(), '技能成长').props.onClick();
  await nodes(f.render()).find(node => node.type === 'button' && node.props.key === entries[0].id).props.onClick();
  assert.equal(nodes(f.render()).some(node => node.type === 'button' && node.props.children.includes('删除用户技能')), false);
  await button(f.render(), '编辑技能').props.onClick();
  const editor = nodes(f.render()).find(node => node.type?.name === 'SkillEditor');
  assert.equal(editor.props.entry.id, 'a/SKILL.md'); assert.equal(editor.props.entry.content, '个人修改');
  assert.deepEqual(requests.map(item => item.action), ['list', 'read', 'read']);
  assert.equal(f.calls.some(item => ['create', 'open', 'attach', 'command'].includes(item[0])), false);
});

test('技能编辑使用原件及覆盖hash，规范化回执按canonical内容回读成功', async () => {
  const original = { id: 'a/SKILL.md', name: 'a', description: '', origin: 'override', hash: 'old', baseHash: 'base', baseId: '.system/whalewing/builtin/a/SKILL.md', actions: ['read', 'update', 'reset'], discovery: 'available', content: '旧稿' };
  let actual = original, saved;
  const writes = [];
  const f = await fixture({ skillLibrary: async input => {
    if (input.action === 'list') return { ok: true, value: { entries: [actual], offset: 0, total: 1, truncated: false } };
    if (input.action === 'update') { writes.push(input); actual = { ...original, hash: 'new', content: 'owner metadata\n新稿' }; }
    return { ok: true, value: { entry: actual } };
  } });
  await button(f.render(), '技能成长').props.onClick(); await button(f.render(), 'a').props.onClick(); await button(f.render(), '编辑技能').props.onClick();
  const node = nodes(f.render()).find(node => node.type?.name === 'SkillEditor'); node.props.onSaved = value => { saved = value; };
  const render = f.isolate(node); render(); f.flushEffects();
  nodes(render()).find(node => node.type === 'textarea').props.onChange({ target: { value: '新稿' } });
  await button(render(), '保存修改').props.onClick();
  assert.deepEqual(writes, [{ action: 'update', id: original.id, content: '新稿', expectedHash: 'old', expectedBaseHash: 'base' }]);
  assert.equal(saved.content, 'owner metadata\n新稿'); assert.equal(saved.hash, 'new');
  f.unmount();
});

test('技能未知写入回执保留稿件并阻止重复写，显式加载恢复权威hash', async () => {
  const original = { id: 'a/SKILL.md', name: 'a', description: '', origin: 'user', hash: 'old', actions: ['read', 'update', 'remove'], discovery: 'available', content: '原内容' };
  let actual = original, writes = 0, saves = 0;
  const f = await fixture({ skillLibrary: async input => {
    if (input.action === 'list') return { ok: true, value: { entries: [actual], offset: 0, total: 1, truncated: false } };
    if (input.action === 'update') { writes++; actual = { ...actual, hash: 'committed', content: 'owner normalized' }; throw new Error('回执断开'); }
    return { ok: true, value: { entry: actual } };
  } });
  await button(f.render(), '技能成长').props.onClick(); await button(f.render(), 'a').props.onClick(); await button(f.render(), '编辑技能').props.onClick();
  const node = nodes(f.render()).find(node => node.type?.name === 'SkillEditor'); node.props.onSaved = () => { saves++; };
  const render = f.isolate(node); render(); f.flushEffects();
  nodes(render()).find(node => node.type === 'textarea').props.onChange({ target: { value: '保留的草稿' } });
  await button(render(), '保存修改').props.onClick();
  assert.equal(nodes(render()).find(node => node.type === 'textarea').props.value, '保留的草稿');
  assert.equal(button(render(), '保存修改').props.disabled, true); assert.equal(writes, 1); assert.equal(saves, 0);
  await button(render(), '加载已保存版本').props.onClick();
  assert.equal(nodes(render()).find(node => node.type === 'textarea').props.value, 'owner normalized');
  assert.equal(button(render(), '保存修改').props.disabled, false);
  f.unmount();
});

test('新增技能固定员工输入身份且经实际read回读，不创建会话', async () => {
  const requests = []; let actual = null;
  const f = await fixture({ skillLibrary: async input => {
    requests.push(input);
    if (input.action === 'create') actual = { id: input.id, name: 'my-method', description: '', origin: 'user', hash: 'created', actions: ['read', 'update', 'remove'], discovery: 'available', content: input.content };
    return { ok: true, value: { entry: actual } };
  } });
  // 新建按钮不要求先读列表或进入会话。
  const base = await fixture(); await button(base.render(), '技能成长').props.onClick(); button(base.render(), '新增技能').props.onClick();
  const editor = nodes(base.render()).find(node => node.type?.name === 'SkillEditor');
  let saved; editor.props.api = f.clients.skills; editor.props.onSaved = value => { saved = value; };
  const render = base.isolate(editor); render(); base.flushEffects();
  nodes(render()).find(node => node.type === 'input').props.onChange({ target: { value: 'my-method' } });
  await button(render(), '创建技能').props.onClick();
  assert.equal(requests[0].id, 'my-method/SKILL.md'); assert.equal(requests[0].expectedHash, '');
  assert.deepEqual(requests.map(item => item.action), ['create', 'read']); assert.equal(saved.hash, 'created');
  assert.equal(f.calls.length, 0); base.unmount();
});

/** 打开“新增技能”抽屉，宿主按 skillLibrary 应答；记下发出的请求、右上角提示和保存结果。 */
async function newSkillEditor(skillLibrary) {
  const requests = [], notices = [], state = {};
  const f = await fixture({ skillLibrary: async input => { requests.push(input); return skillLibrary(input); } });
  const base = await fixture(); await button(base.render(), '技能成长').props.onClick(); button(base.render(), '新增技能').props.onClick();
  const editor = nodes(base.render()).find(node => node.type?.name === 'SkillEditor');
  Object.assign(editor.props, { api: f.clients.skills, onSaved: value => { state.saved = value; }, notify: (message, options) => notices.push({ message, kind: options?.kind }) });
  const render = base.isolate(editor); render(); base.flushEffects();
  const input = () => nodes(render()).find(node => node.type === 'input');
  const save = async identifier => { input().props.onChange({ target: { value: identifier } }); await button(render(), '创建技能').props.onClick(); };
  return { requests, notices, state, render, input, save, unmount: () => base.unmount() };
}
const createdEntry = input => ({ id: input.id, name: input.id.split('/')[0], description: '', origin: 'user', hash: 'created', actions: ['read', 'update', 'remove'], discovery: 'available', content: input.content });

// SKL-06 界面说明（技能标识只能用英文小写字母、数字、连字符）；需求§界面通用约定（失败右上角提示）
test('新增技能标识含中文、空格或大写时不发请求、提示标识规则，标识框还能改，改成合法标识后能保存', async () => {
  let actual = null;
  const editor = await newSkillEditor(input => { if (input.action === 'create') actual = createdEntry(input); return { ok: true, value: { entry: actual } }; });
  for (const identifier of ['中文技能', 'has space', 'Upper', 'bad!', '-lead']) {
    await editor.save(identifier);
    const notice = editor.notices.pop();
    assert.equal(notice?.kind, 'error', `${identifier}：失败提示`);
    assert.match(notice.message, /技能标识只能用英文小写字母、数字和连字符/, `${identifier}：说明标识规则`);
    assert.equal(editor.input().props.disabled, false, `${identifier}：标识框还能改`);
  }
  assert.deepEqual(editor.requests, [], '标识不合规时不发请求');
  await editor.save('good-name');
  assert.deepEqual(editor.requests.map(item => [item.action, item.id]), [['create', 'good-name/SKILL.md'], ['read', 'good-name/SKILL.md']]);
  assert.equal(editor.state.saved.id, 'good-name/SKILL.md');
  editor.unmount();
});

// SKL-07 决策 2026-10-13（报错说清原因、不显示内部错误码）；宿主明确拒绝新建、这个标识下也没有文件时，标识框放开
test('新增技能被宿主拒绝且没写入时，提示不带错误码，标识框放开，换了标识再保存用新标识', async () => {
  let actual = null, reject = true;
  const editor = await newSkillEditor(input => {
    if (input.action === 'create' && reject) { reject = false; return { ok: false, error: { code: 'SKILL_FORMAT', message: 'SKILL_FORMAT: 技能内容里的名称（name）只能用英文小写字母、数字和连字符' } }; }
    if (input.action === 'create') actual = createdEntry(input);
    return { ok: true, value: { entry: input.id === actual?.id ? actual : null } };
  });
  await editor.save('first-name');
  const notice = editor.notices.pop();
  assert.equal(notice?.kind, 'error');
  assert.match(notice.message, /名称（name）只能用英文小写字母/, '提示说清原因');
  assert.doesNotMatch(notice.message, /[A-Z]{2,}_[A-Z]{2,}/, '提示不带内部错误码');
  assert.equal(editor.input().props.disabled, false, '标识框放开');
  assert.equal(button(editor.render(), '创建技能').props.disabled, false, '还能再保存');
  await editor.save('fixed-name');
  assert.deepEqual(editor.requests.map(item => [item.action, item.id]), [['create', 'first-name/SKILL.md'], ['read', 'first-name/SKILL.md'], ['create', 'fixed-name/SKILL.md'], ['read', 'fixed-name/SKILL.md']]);
  assert.equal(editor.state.saved.id, 'fixed-name/SKILL.md');
  editor.unmount();
});

// 宿主可能已经写入但没收到答复，或者这个标识下已经有文件：身份保持固定，重试不另建一份
for (const [label, failure] of [['没收到宿主答复', 'lost'], ['宿主报错但这个标识下已经有文件', 'written']]) test(`新增技能${label}时标识保持固定，不放开换标识`, async () => {
  let actual = null, failed = false;
  const editor = await newSkillEditor(input => {
    if (input.action === 'create' && !failed) {
      failed = true;
      if (failure === 'lost') throw new Error('回执断开');
      actual = createdEntry(input);
      return { ok: false, error: { code: 'READBACK', message: 'READBACK: 技能写入后回读不一致' } };
    }
    if (input.action === 'create') actual = createdEntry(input);
    return { ok: true, value: { entry: actual } };
  });
  await editor.save('kept-name');
  assert.equal(editor.notices.pop()?.kind, 'error');
  assert.equal(editor.input().props.disabled, true, '标识框保持固定');
  if (failure === 'lost') {
    await button(editor.render(), '创建技能').props.onClick();
    assert.deepEqual(editor.requests.filter(item => item.action === 'create').map(item => item.id), ['kept-name/SKILL.md', 'kept-name/SKILL.md'], '重试仍用原标识');
  } else assert.ok(button(editor.render(), '加载已保存版本'), '提示载入已保存的版本');
  editor.unmount();
});

// 需求§界面通用约定（2026-10-28 用户确认：编辑抽屉里有改动时，Esc、点遮罩、×、“取消”都先居中确认放弃；没改动直接关）
test('技能抽屉没改动时“取消编辑”直接关；填了标识再关先弹“放弃修改”，取消则留着，确认才关', async () => {
  const base = await fixture(); await button(base.render(), '技能成长').props.onClick(); button(base.render(), '新增技能').props.onClick();
  const editor = nodes(base.render()).find(node => node.type?.name === 'SkillEditor');
  let closed = 0; editor.props.onClose = () => { closed++; };
  const render = base.isolate(editor); render(); base.flushEffects();
  const confirm = () => nodes(render()).find(node => node.type?.name === 'ConfirmDialog');
  button(render(), '取消编辑').props.onClick();
  assert.equal(closed, 1, '没改动直接关'); assert.equal(confirm(), undefined);
  nodes(render()).find(node => node.type === 'input').props.onChange({ target: { value: 'my-method' } });
  button(render(), '取消编辑').props.onClick();
  assert.equal(closed, 1, '有改动不直接关');
  assert.equal(confirm().props.title, '放弃修改'); assert.equal(confirm().props.danger, true);
  confirm().props.onCancel();
  assert.equal(confirm(), undefined); assert.equal(closed, 1);
  assert.equal(nodes(render()).find(node => node.type === 'input').props.value, 'my-method', '标识还在');
  nodes(render()).find(node => node.type === 'dialog').props.onCancel({ preventDefault() {} });
  confirm().props.onConfirm();
  assert.equal(closed, 2, '确认放弃后才关'); base.unmount();
});

test('书架管理分组：新分组名填了没加时关闭先确认放弃，确认后抽屉关上、不发保存', async () => {
  const shelf = { groups: [], books: [libraryBook] };
  const f = await fixture({ news: async () => ({ ok: true, value: newsHomeResult() }), library: async input => {
    if (input.action === 'list') return { ok: true, value: { library: shelf } };
    throw new Error('不该发出 ' + input.action);
  } });
  await button(f.render(), '知识卡片').props.onClick();
  await button(f.render(), '打开书架').props.onClick();
  const manage = nodes(f.render()).find(node => node.type === 'button' && node.props['aria-label'] === '管理分组');
  assert.ok(manage, '有管理分组按钮'); manage.props.onClick();
  taskField(f, '分组名称', '还没加的分组');
  const calls = f.calls.length;
  button(f.render(), '关闭').props.onClick();
  const confirm = () => nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === '放弃修改');
  assert.ok(confirm(), '弹出放弃修改确认');
  assert.ok(JSON.stringify(confirm()).includes('确认放弃还没保存的分组名'));
  await nodes(confirm()).filter(node => node.type === 'button' && node.props.children.includes('放弃修改')).at(-1).props.onClick();
  assert.equal(nodes(f.render()).some(node => node.type === 'dialog' && node.props['aria-label'] === '管理分组'), false, '抽屉关上');
  assert.equal(f.calls.slice(calls).some(([kind, input]) => kind === 'library' && input?.action === 'saveGroup'), false, '没有保存分组');
  f.unmount();
});

test('图谱消费独立factory及主题事件，筛选分页仍由知识服务持有', async () => {
  const graph = { version: 2, nodes: [{ kind: 'note', readOnly: false, path: 'a.md', title: 'A', degree: 3 }], edges: [], total: 1, offset: 0, truncated: false, omittedEdges: 0, unresolved: 0 };
  const f = await fixture({ knowledge: async input => ({ ok: true, value: input.action === 'status' ? { initialized: true, root: 'vault', limits: { maxGraphNodes: 200 } } : input.action === 'graph' ? graph : { notes: [], total: 0, truncated: false } }) });
  await button(f.render(), '个人知识').props.onClick(); await button(f.render(), '关系图谱').props.onClick();
  const node = nodes(f.render()).find(node => node.type?.name === 'GraphCanvas');
  assert.deepEqual(node.props.graph, graph); assert.equal(node.props.resetLabel, '重置视图');
  assert.equal(node.props.loadingLabel(1, 5), '正在准备图谱 1/5');
  assert.equal(node.props.canvasErrorLabel, '当前环境尚未提供 Canvas 图谱支持');
  assert.equal(node.props.dataErrorLabel, '图谱包含未返回的节点，请重新读取图谱');
  assert.equal(nodes(f.render()).find(item => item.type?.name === 'GraphCanvas').props.loadingLabel, node.props.loadingLabel);
  assert.equal(nodes(f.render()).some(node => node.type === 'input' && node.props.type === 'range'), false);
  const callback = () => {}; const off = node.props.subscribeTheme(callback);
  assert.equal(f.eventHandlers.get('theme/change')[0], callback); off(); assert.equal(f.eventHandlers.get('theme/change').length, 0);
});

test('图谱Remote边界复用唯一graphResult，拒收旧版degree和其它动作结果，合法零度节点保留', async () => {
  const graph = { version: 2, nodes: [{ kind: 'note', readOnly: false, path: 'a.md', title: 'A', degree: 0 }], edges: [], total: 1, offset: 0, truncated: false, omittedEdges: 0, unresolved: 0 };
  let reply = graph;
  const f = await fixture({ knowledge: async () => ({ ok: true, value: reply }) });
  assert.deepEqual(await f.clients.knowledge.knowledge({ action: 'graph' }), knowledgeContract(z).graphResult.parse(graph));
  for (const degree of [undefined, -1, NaN, Infinity]) {
    reply = { ...graph, nodes: [{ kind: 'note', readOnly: false, path: 'a.md', title: 'A', ...(degree === undefined ? {} : { degree }) }] };
    await assert.rejects(f.clients.knowledge.knowledge({ action: 'graph' }), { code: 'graph_contract_mismatch', message: '图谱数据与当前界面不匹配，请完全退出并重新打开 DSH' });
  }
  for (const old of [{ nodes: [], edges: [], total: 0, offset: 0, truncated: false, omittedEdges: 0, unresolved: 0 }, { ...emptyGraph(), version: 1 }]) {
    reply = old;
    await assert.rejects(f.clients.knowledge.knowledge({ action: 'graph' }), { code: 'graph_contract_mismatch' });
  }
  reply = { path: 'a.md', content: '正文', hash: 'hash', readOnly: false };
  assert.equal(knowledgeContract(z).result.safeParse(reply).success, true);
  await assert.rejects(f.clients.knowledge.knowledge({ action: 'graph' }), { code: 'graph_contract_mismatch' });
  assert.equal(await f.clients.knowledge.knowledge({ action: 'read', path: 'a.md' }), reply);
  assert.match(f.dictionaries.get('whalewing').en.graphVersionMismatch, /Fully quit and reopen DSH/);
});

test('坏图谱不进入画布，原位短错误保留重新读取入口', async () => {
  const f = await fixture({ knowledge: async input => ({ ok: true, value: input.action === 'status' ? { initialized: true, root: 'vault', limits: { maxGraphNodes: 200 } } : input.action === 'graph' ? { nodes: [{ path: 'a.md', title: '旧Host' }], edges: [], total: 1, offset: 0, truncated: false, omittedEdges: 0, unresolved: 0 } : { notes: [], total: 0, truncated: false } }) });
  await button(f.render(), '个人知识').props.onClick(); await button(f.render(), '关系图谱').props.onClick();
  assert.equal(nodes(f.render()).some(node => node.type?.name === 'GraphCanvas'), false);
  assert.ok(nodes(f.render()).some(node => node.props.children.includes('图谱数据与当前界面不匹配，请完全退出并重新打开 DSH')));
  assert.equal(button(f.render(), '关系图谱').props.disabled, false);
});

test('原生视图恢复旧草稿后才合入提议，引用附件保持；卸载取消后再次挂载也不晚写', async () => {
  const f = await fixture(); const id = await f.clients.assistant.ensureAssistant(); const reference = f.bridge.retain(id);
  const input = f.inputFor(id);
  const waiting = f.clients.assistant.proposeDiscussion(reference, '讨论提议');
  await new Promise(setImmediate);
  assert.equal(input.inserts.length, 0);
  const saved = { ...input.state.getSnapshot(), draft: '重新进入前的草稿', occurrences: [{ source: 'file', ref: 'a.md' }], attachmentIds: ['attachment'] };
  input.state.set(saved);
  const release = f.clients.assistant.mountAssistantInput(id);
  await waiting;
  assert.match(input.state.getSnapshot().draft, /^重新进入前的草稿\n\n讨论提议/);
  assert.equal(input.state.getSnapshot().occurrences, saved.occurrences);
  assert.equal(input.state.getSnapshot().attachmentIds, saved.attachmentIds);
  release();
  const controller = new AbortController();
  const cancelled = f.clients.assistant.proposeDiscussion(reference, '应取消的提议', controller.signal);
  controller.abort(); await assert.rejects(cancelled, { name: 'AbortError' });
  const remount = f.clients.assistant.mountAssistantInput(id); await new Promise(setImmediate);
  assert.equal(input.inserts.length, 1);
  assert.equal(f.calls.some(item => item[0] === 'prompt'), false);
  remount(); reference.release();
});

test('技能删除与系统覆盖重置均确认、CAS写入及读回，原件保留', async () => {
  for (const action of ['remove', 'reset']) {
    const original = { id: '.system/whalewing/builtin/base/SKILL.md', name: 'base', description: '', origin: 'builtin', hash: 'base-hash', actions: ['read', 'update'], discovery: 'available', content: '系统原件' };
    const chosen = { id: 'base/SKILL.md', name: 'my-skill', description: '', origin: action === 'reset' ? 'override' : 'user', hash: 'edit-hash', actions: ['read', action], discovery: 'available', content: '用户正文', ...(action === 'reset' ? { baseId: original.id, baseHash: original.hash } : {}) };
    let actual = chosen; const changes = [];
    const f = await fixture({ skillLibrary: async input => {
      if (input.action === 'list') return { ok: true, value: { entries: actual ? [actual] : [], offset: 0, total: actual ? 1 : 0, truncated: false } };
      if (input.action === 'read') return { ok: true, value: { entry: input.id === original.id ? original : actual } };
      changes.push(input); actual = null;
      return { ok: true, value: action === 'reset' ? { id: chosen.id, reset: true, baseId: original.id } : { id: chosen.id, removed: true } };
    } });
    await button(f.render(), '技能成长').props.onClick(); await button(f.render(), 'my-skill').props.onClick();
    const label = action === 'reset' ? '恢复系统原件' : '删除用户技能';
    button(f.render(), label).props.onClick(); assert.equal(changes.length, 0);
    const confirm = nodes(f.render()).find(node => node.type === 'dialog' && JSON.stringify(node).includes(action === 'reset' ? '清除个人修改并恢复系统原件？' : '删除这项用户技能？'));
    await button(confirm, label).props.onClick();
    assert.deepEqual(changes, [{ action, id: chosen.id, expectedHash: chosen.hash, ...(action === 'reset' ? { expectedBaseHash: original.hash } : {}) }]);
    assert.equal(original.content, '系统原件');
    if (action === 'reset') assert.ok(nodes(f.render()).some(node => node.type === 'pre' && node.props.children.includes('系统原件')));
    assert.equal(f.calls.some(item => item[0] === 'create'), false);
  }
});

test('技能分页延迟与失败不移动权威页及返回栈，成功重试后只前进一页', async () => {
  let resolve, calls = 0;
  const first = { id: 'one/SKILL.md', name: 'one', description: '', origin: 'user', hash: '1', actions: ['read'], discovery: 'available' };
  const second = { ...first, id: 'two/SKILL.md', name: 'two' };
  const f = await fixture({ skillLibrary: async input => {
    if (input.offset === 1) { calls++; if (calls === 1) return new Promise(done => { resolve = done; }); if (calls === 2) return { ok: false, error: { message: '暂时失去读取权限' } }; }
    return { ok: true, value: { entries: input.offset === 1 ? [second] : [first], offset: input.offset || 0, total: 2, truncated: input.offset !== 1 } };
  } });
  await button(f.render(), '技能成长').props.onClick();
  const pending = button(f.render(), '下一页').props.onClick();
  assert.equal(button(f.render(), '下一页').props.disabled, true); assert.equal(button(f.render(), '上一页').props.disabled, true);
  resolve({ ok: false, error: { message: '目录响应失败' } }); await pending;
  assert.ok(button(f.render(), 'one')); assert.equal(button(f.render(), '上一页').props.disabled, true);
  await button(f.render(), '下一页').props.onClick();
  assert.ok(button(f.render(), 'one')); assert.equal(button(f.render(), '上一页').props.disabled, true);
  await button(f.render(), '下一页').props.onClick();
  assert.ok(button(f.render(), 'two')); assert.equal(button(f.render(), '上一页').props.disabled, false);
  await button(f.render(), '上一页').props.onClick(); assert.ok(button(f.render(), 'one'));
});

test('浮窗键盘移动支持非枚举DOMRect，标题内按钮不触发拖动', async () => {
  const f = await fixture(); const a = await mountedAssistant(f);
  assert.match(nodes(a.render()).find(node => node.type === 'aside').props.className, /ww-assistant-float/);
  const frame = () => nodes(a.render()).find(node => node.type === 'aside');
  frame().props.ref.current = { getBoundingClientRect: () => Object.create({ ...frame().props.style }) };
  const header = () => nodes(frame()).find(node => node.type === 'header');
  const target = {};
  const before = frame().props.style;
  header().props.onKeyDown({ key: 'ArrowLeft', target, currentTarget: target, preventDefault() {} });
  assert.equal(frame().props.style.left, before.left - 8); assert.equal(frame().props.style.width, before.width);
  header().props.onPointerDown({ button: 0, pointerId: 1, target: { closest: () => ({}) }, currentTarget: { setPointerCapture() { assert.fail('标题按钮不捕获拖动'); } } });
  f.unmount();
});

test('系统技能首次editId尚不存在仍可编辑原件，保存成为经回读的正确覆盖', async () => {
  const base = { id: '.system/whalewing/builtin/a/SKILL.md', editId: 'a/SKILL.md', name: 'a', description: '', origin: 'builtin', hash: 'base', actions: ['read', 'update'], discovery: 'available', content: '系统原件' };
  let override = null, adopted;
  const writes = [];
  const f = await fixture({ skillLibrary: async input => {
    if (input.action === 'list') return { ok: true, value: { entries: [base], offset: 0, total: 1, truncated: false } };
    if (input.action === 'update') { writes.push(input); override = { ...base, id: base.editId, origin: 'override', baseId: base.id, baseHash: base.hash, hash: 'override', content: 'canonical\n个人修改', actions: ['read', 'update', 'reset'] }; return { ok: true, value: { entry: override } }; }
    return { ok: true, value: { entry: input.id === base.id ? base : override } };
  } });
  await button(f.render(), '技能成长').props.onClick(); await button(f.render(), 'a').props.onClick(); await button(f.render(), '编辑技能').props.onClick();
  const editor = nodes(f.render()).find(node => node.type?.name === 'SkillEditor');
  assert.equal(editor.props.entry, base); editor.props.onSaved = value => { adopted = value; };
  const render = f.isolate(editor); render(); f.flushEffects();
  nodes(render()).find(node => node.type === 'textarea').props.onChange({ target: { value: '个人修改' } });
  await button(render(), '保存修改').props.onClick();
  assert.deepEqual(writes, [{ action: 'update', id: base.id, content: '个人修改', expectedHash: base.hash }]);
  assert.equal(adopted, override); assert.equal(base.content, '系统原件'); f.unmount();
});

test('系统编辑不接管同名user或其它原件覆盖，入口与未知回执读取使用相同身份检查', async () => {
  const base = { id: '.system/whalewing/builtin/a/SKILL.md', editId: 'a/SKILL.md', name: 'a', description: '', origin: 'builtin', hash: 'base', actions: ['read', 'update'], discovery: 'shadowed', content: '系统原件' };
  for (const target of [{ origin: 'user' }, { origin: 'override', baseId: 'other/SKILL.md', baseHash: 'base' }, { origin: 'override', baseId: base.id, baseHash: 'other-version' }]) {
    const other = { ...base, ...target, id: base.editId, hash: 'other', content: '别的技能' };
    const f = await fixture({ skillLibrary: async input => {
      assert.ok(['list', 'read'].includes(input.action));
      return { ok: true, value: input.action === 'list' ? { entries: [base, other], offset: 0, total: 2, truncated: false } : { entry: input.id === base.id ? base : other } };
    } });
    await button(f.render(), '技能成长').props.onClick();
    await nodes(f.render()).find(node => node.type === 'button' && node.props.key === base.id).props.onClick();
    await button(f.render(), '编辑技能').props.onClick();
    assert.equal(nodes(f.render()).some(node => node.type?.name === 'SkillEditor'), false);
    assert.ok(nodes(f.render()).some(node => node.props.role === 'alert'));
    await assert.rejects(f.clients.skills.resolveSkillEdit(base), { code: 'skill_origin_conflict' });
  }
});

test('首次原件编辑未知回执保留草稿，显式恢复只采用有效覆盖；未写入失败不误丢原件编辑入口', async () => {
  for (const committed of [false, true]) {
    const base = { id: '.system/whalewing/builtin/a/SKILL.md', editId: 'a/SKILL.md', name: 'a', description: '', origin: 'builtin', hash: 'base', actions: ['read', 'update'], discovery: 'available', content: '原件' };
    let actual = null;
    const f = await fixture({ skillLibrary: async input => {
      if (input.action === 'list') return { ok: true, value: { entries: [base], offset: 0, total: 1, truncated: false } };
      if (input.action === 'update') { if (committed) actual = { ...base, id: base.editId, origin: 'override', baseId: base.id, baseHash: base.hash, hash: 'written', content: 'canonical 修改' }; throw new Error('保存响应异常'); }
      return { ok: true, value: { entry: input.id === base.id ? base : actual } };
    } });
    await button(f.render(), '技能成长').props.onClick(); await button(f.render(), 'a').props.onClick(); await button(f.render(), '编辑技能').props.onClick();
    const editor = nodes(f.render()).find(node => node.type?.name === 'SkillEditor'); editor.props.onSaved = () => assert.fail('未知回执不自动认成功');
    const render = f.isolate(editor); render(); f.flushEffects();
    nodes(render()).find(node => node.type === 'textarea').props.onChange({ target: { value: '保留的修改' } });
    await button(render(), '保存修改').props.onClick();
    assert.equal(nodes(render()).find(node => node.type === 'textarea').props.value, '保留的修改');
    assert.equal(button(render(), '保存修改').props.disabled, committed);
    if (committed) { await button(render(), '加载已保存版本').props.onClick(); assert.equal(nodes(render()).find(node => node.type === 'textarea').props.value, 'canonical 修改'); }
    f.unmount();
  }
});

test('技能A与B讨论分别合入同一原生草稿，重复点击不重插且完全不发送', async () => {
  const records = ['A', 'B'].map(name => ({ id: `fixture/${name}.md`, name, description: '', state: 'active', origin: 'evolution', hash: `hash-${name}`, actions: ['read', 'evolve'], discovery: 'available', content: name }));
  const sends = [];
  const f = await fixture({ skillLibrary: async input => ({ ok: true, value: input.action === 'list' ? { entries: records, total: 2, offset: 0, truncated: false } : { entry: records.find(item => item.id === input.id) } }), prompt: async request => { sends.push(request); assert.fail('讨论入口不得提交模型问题'); } });
  const render = () => f.render('main', { SessionProvider: 'SessionProvider', renderSlot: name => ({ type: name, props: { children: [] } }) });
  await button(render(), '技能成长').props.onClick(); await button(render(), 'A').props.onClick(); await discuss(f, button(render(), '与小鲸编辑技能').props.onClick);
  const reference = nodes(render()).find(node => node.type === 'SessionProvider').props.session;
  const input = f.inputFor(reference.sessionId);
  assert.ok(input.state.getSnapshot().draft.includes('hash-A'));
  await button(render(), 'B').props.onClick(); await discuss(f, button(render(), '与小鲸编辑技能').props.onClick);
  await discuss(f, button(render(), '与小鲸编辑技能').props.onClick);
  assert.equal(sends.length, 0); assert.equal(input.inserts.length, 2);
  assert.ok(input.state.getSnapshot().draft.includes('hash-A')); assert.ok(input.state.getSnapshot().draft.includes('hash-B'));
  assert.equal(nodes(render()).find(node => node.type === 'SessionProvider').props.session, reference);
  assert.equal(f.clients.assistant.pendingQuestion, undefined);
  assert.equal(f.calls.some(item => item[0] === 'open'), false);
  f.unmount();
});

test('等待原生输入期间取消或卸载不晚到插入，会话保留至组件卸载再释放', async () => {
  for (const cancel of ['stop', 'unmount']) {
  let ready;
  const f = await fixture({ retainReady: new Promise(resolve => { ready = resolve; }) });
  f.render(); f.flushEffects();
  await button(f.render(), '技能成长').props.onClick();
  const pending = button(f.render(), '与小鲸讨论提炼').props.onClick();
  await new Promise(setImmediate);
  f.render(); f.flushEffects();
  if (cancel === 'stop') button(f.render(), '停止等待结果').props.onClick(); else f.unmount();
  await pending; ready(); await new Promise(setImmediate);
  assert.equal(f.inputs.size, 0);
  if (cancel === 'stop') { assert.equal(f.calls.filter(item => item[0] === 'release').length, 0); f.unmount(); }
  assert.equal(f.calls.filter(item => item[0] === 'release').length, 1);
  assert.equal(f.calls.filter(item => item[0] === 'create').length, 1);
  assert.equal(f.calls.some(item => item[0] === 'prompt'), false);
  }
});

test('技能入库状态消费正式契约并明确区分实际会话使用，覆盖提示仅描述库内关系', async () => {
  const value = skillLibraryContract(z).result.parse({ entries: [{ id: 'catalogue/SKILL.md', name: 'catalogue', description: '我的技能', origin: 'user', hash: 'content-hash', actions: ['read', 'update', 'remove'], discovery: 'catalogued' }], offset: 0, total: 1, truncated: false });
  const f = await fixture({ skillLibrary: async input => { assert.equal(input.action, 'list'); return { ok: true, value }; } });
  await button(f.render(), '技能成长').props.onClick();
  assert.ok(nodes(f.render()).some(node => node.type === 'small' && node.props.children.includes(' · 已入库')));
  const locale = f.dictionaries.get('whalewing');
  assert.equal(locale.zh.catalogued, '已入库'); assert.equal(locale.en.catalogued, 'In library');
  assert.equal(locale.zh.shadowed, '库内存在同名优先项'); assert.match(locale.en.shadowed, /in the library/);
  assert.match(locale.zh.skillHelp, /不代表当前对话已使用/); assert.match(locale.en.skillHelp, /does not mean this conversation has used/);
  assert.ok(nodes(f.render()).some(node => node.type === 'small' && node.props.title === locale.zh.skillHelp));
  assert.equal(f.calls.some(item => item[0] === 'create' || item[0] === 'prompt'), false);
});

test('目录分隔支持拖动键盘与容器夹取，取消恢复起点且离开和卸载释放捕获及观察器', async () => {
  const f = await fixture(); const observers = [];
  f.browser.ResizeObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe(element) { this.element = element; } disconnect() { this.disconnected = true; } };
  await button(f.render(), '个人知识').props.onClick();
  const split = () => nodes(f.render()).find(node => node.props.className === 'ww-knowledge-split');
  const separator = () => nodes(f.render()).find(node => node.props.role === 'separator');
  const container = { clientWidth: 800 }; split().props.ref.current = container; f.flushEffects();
  assert.equal(separator().props['aria-orientation'], 'vertical'); assert.equal(separator().props.tabIndex, 0);
  assert.equal(separator().props['aria-valuemin'], 120); assert.equal(separator().props['aria-valuemax'], 552);
  const captures = new Set(); let focused = 0;
  const target = { focus: () => focused++, setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id) };
  const event = (clientX, pointerId = 7) => ({ button: 0, clientX, pointerId, currentTarget: target, preventDefault() {} });
  separator().props.onPointerDown(event(195)); separator().props.onPointerMove(event(350));
  assert.equal(split().props.style['--ww-directory-width'], '350px'); assert.equal(focused, 1);
  separator().props.onPointerMove(event(700, 99)); assert.equal(split().props.style['--ww-directory-width'], '350px');
  separator().props.onPointerCancel(event(350)); assert.equal(split().props.style['--ww-directory-width'], '195px'); assert.equal(captures.size, 0);
  const key = (name, shiftKey = false) => separator().props.onKeyDown({ key: name, shiftKey, preventDefault() {} });
  key('ArrowRight'); assert.equal(separator().props['aria-valuenow'], 203);
  key('ArrowLeft', true); assert.equal(separator().props['aria-valuenow'], 179);
  key('End'); assert.equal(separator().props['aria-valuenow'], 552);
  key('Home'); assert.equal(separator().props['aria-valuenow'], 120);
  separator().props.onPointerDown(event(120)); separator().props.onPointerMove(event(-200)); separator().props.onPointerUp(event(-200));
  assert.equal(separator().props['aria-valuenow'], 120); assert.equal(captures.size, 0);
  key('End'); separator().props.onPointerDown(event(552)); container.clientWidth = 300; observers[0].callback();
  assert.equal(separator().props['aria-valuemax'], 142); assert.equal(separator().props['aria-valuenow'], 142); assert.equal(captures.size, 0);
  separator().props.onPointerDown(event(142)); separator().props.onPointerMove(event(110)); key('Escape'); assert.equal(separator().props['aria-valuenow'], 142);
  await button(f.render(), '技能成长').props.onClick(); f.render(); assert.equal(observers[0].disconnected, true);
  await button(f.render(), '个人知识').props.onClick(); split().props.ref.current = container; f.flushEffects();
  separator().props.onPointerDown(event(142)); f.unmount();
  assert.equal(captures.size, 0); assert.equal(observers.at(-1).disconnected, true);
  const css = nodes(f.render()).find(node => node.type === 'style').props.children[0];
  assert.match(css, /grid-template-columns:var\(--ww-directory-width,195px\) 8px minmax\(0,1fr\)/);
  assert.match(css, /ww-directory-separator:focus-visible/); assert.match(css, /touch-action:none/);
});

test('个人知识默认全库图，刷新保留阅读与编辑，往返标签和重点击不丢冲突草稿', async () => {
  const graph = { ...emptyGraph(), nodes: [{ kind: 'note', readOnly: false, path: 'a.md', title: 'A', degree: 0 }], total: 1 };
  const requests = []; let content = '原正文', hash = 'old', conflict = true;
  const f = await fixture({ knowledge: async input => {
    requests.push(input);
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'vault', limits: { maxGraphNodes: 200 } } };
    if (input.action === 'search') return { ok: true, value: { notes: [], total: 0, truncated: false } };
    if (input.action === 'graph') return { ok: true, value: graph };
    if (input.action === 'document') return { ok: true, value: { path: 'a.md', content, hash, view: { type: 'text', value: content }, links: [], backlinks: [] } };
    if (input.action === 'write') { if (conflict) return { ok: false, error: { code: 'conflict', message: '已修改' } }; content = input.content; hash = 'new'; return { ok: true, value: { path: input.path, hash } }; }
    assert.fail(input.action);
  } });
  await button(f.render(), '个人知识').props.onClick();
  const canvas = nodes(f.render()).find(node => node.type?.name === 'GraphCanvas'); assert.equal(canvas.props.label, '关系图谱');
  await canvas.props.onOpenNote({ path: 'a.md' });
  const before = requests.filter(item => item.action === 'graph').length;
  await button(f.render(), '刷新').props.onClick(); assert.equal(requests.filter(item => item.action === 'graph').length, before);
  assert.ok(nodes(f.render()).some(node => node.props.className === 'ww-reader'));
  button(f.render(), '编辑').props.onClick(); nodes(f.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: '保留草稿' } });
  await button(f.render(), '保存').props.onClick();
  await button(f.render(), '技能成长').props.onClick(); assert.equal(button(f.render(), '技能成长').props['aria-pressed'], true);
  await button(f.render(), '个人知识').props.onClick(); await button(f.render(), '个人知识').props.onClick(); await button(f.render(), '刷新').props.onClick();
  assert.equal(nodes(f.render()).find(node => node.type === 'textarea').props.value, '保留草稿');
  assert.equal(button(f.render(), '读取最新内容').props.disabled, false);
  assert.equal(requests.filter(item => item.action === 'graph').length, before);
  assert.equal(button(f.render(), '关系图谱').props.disabled, true);
  assert.equal(button(f.render(), '当前笔记关系图').props.disabled, true);
  conflict = false; await button(f.render(), '保存').props.onClick();
  await button(f.render(), '个人知识').props.onClick();
  assert.deepEqual(requests.at(-1), { action: 'graph', query: '', offset: 0 });
  assert.ok(nodes(f.render()).some(node => node.type?.name === 'GraphCanvas'));
});

test('图谱加载失败保留原画面与原分页请求，重试成功再更新；显式知识入口恢复全库', async () => {
  const graph = { ...emptyGraph(), nodes: [{ kind: 'note', readOnly: false, path: 'a.md', title: 'A', degree: 0 }], total: 2, truncated: true };
  const requests = []; let failed = false;
  const f = await fixture({ knowledge: async input => {
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'vault', limits: { maxGraphNodes: 200 } } };
    if (input.action === 'search') return { ok: true, value: { notes: [], total: 0, truncated: false } };
    if (input.action === 'graph') { requests.push(input); if (failed) return { ok: false, error: { code: 'offline', message: '图谱暂时不可读' } }; return { ok: true, value: graph }; }
    assert.fail(input.action);
  } });
  await button(f.render(), '个人知识').props.onClick();
  failed = true; await button(f.render(), '下一页').props.onClick();
  assert.deepEqual(nodes(f.render()).find(node => node.type?.name === 'GraphCanvas').props.graph, graph);
  assert.ok(nodes(f.render()).some(node => node.props.role === 'alert' && node.props.children.includes(shown('offline', '图谱暂时不可读'))));
  failed = false; await button(f.render(), '重试').props.onClick();
  assert.deepEqual(requests.at(-1), requests.at(-2)); assert.equal(requests.at(-1).offset, 1);
  await button(f.render(), '个人知识').props.onClick(); assert.deepEqual(requests.at(-1), { action: 'graph', query: '', offset: 0 });
});

test('图谱占满中央区域且无红框信息栏，只有部分范围才显示紧凑范围提示', async () => {
  let graph = { ...emptyGraph(), nodes: [{ kind: 'note', readOnly: false, path: 'a.md', title: 'A', degree: 0 }], total: 1 };
  const f = await fixture({ knowledge: async input => {
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'vault', limits: { maxGraphNodes: 200 } } };
    if (input.action === 'search') return { ok: true, value: { notes: [], total: 0, truncated: false } };
    if (input.action === 'graph') return { ok: true, value: graph };
    assert.fail(input.action);
  } });
  await button(f.render(), '个人知识').props.onClick();
  const region = () => nodes(f.render()).find(node => node.props.className === 'ww-graph-workspace');
  assert.ok(region(), '图谱使用填满中央分栏的独立区域');
  assert.equal(nodes(region()).some(node => ['h2', 'input'].includes(node.type)), false);
  assert.equal(nodes(region()).some(node => node.props.className === 'ww-graph-controls'), false);
  assert.ok(nodes(f.render()).some(node => node.props.className === 'ww-note-canvas ww-graph-mode'));
  const css = nodes(f.render()).find(node => node.type === 'style').props.children[0];
  assert.match(css, /\.ww-note-canvas\.ww-graph-mode\{[^}]*padding:0/);
  assert.match(css, /\.ww-graph-workspace\{[^}]*flex:1/);
  graph = { ...graph, total: 2, truncated: true, omittedEdges: 3 };
  await button(f.render(), '刷新').props.onClick();
  const scope = nodes(region()).find(node => node.props.className === 'ww-graph-controls');
  assert.ok(scope); assert.equal(button(scope, '下一页').props.disabled, false);
  assert.ok(nodes(scope).some(node => node.props.title === '另有 3 条连线不在当前画面内'));
  graph = emptyGraph(); await button(f.render(), '刷新').props.onClick();
  assert.ok(nodes(region()).some(node => node.props.children.includes('该范围没有笔记')));
  assert.equal(nodes(region()).some(node => node.type?.name === 'GraphCanvas'), false);
});

test('搜索截断仅提示实际搜索列表，完整656节点图谱与空关键词目录不误报，真实图谱省略仍提示', async () => {
  const notes = Array.from({ length: 100 }, (_, i) => ({ path: `note-${i}.md`, title: `笔记${i}` }));
  let graph = { ...emptyGraph(), nodes: Array.from({ length: 656 }, (_, i) => ({ kind: 'note', readOnly: false, path: `note-${i}.md`, title: `笔记${i}`, degree: 0 })), total: 656 };
  let truncated = true;
  const f = await fixture({ knowledge: async input => {
    if (input.action === 'status') return { ok: true, value: { initialized: true, root: 'vault', limits: { maxGraphNodes: 1000 } } };
    if (input.action === 'search') return { ok: true, value: { notes, total: 656, truncated } };
    if (input.action === 'graph') return { ok: true, value: graph };
    assert.fail(input.action);
  } });
  const hint = () => nodes(f.render()).some(node => node.props.children.includes('当前仅展示部分结果，请缩小关键词范围'));
  const search = () => nodes(f.render()).find(node => node.type === 'input' && node.props.placeholder === '搜索笔记…');
  await button(f.render(), '个人知识').props.onClick();
  assert.equal(nodes(f.render()).find(node => node.type?.name === 'GraphCanvas').props.graph.nodes.length, 656);
  assert.ok(nodes(f.render()).some(node => node.type?.name === 'Directory'));
  assert.equal(hint(), false, '默认search的100条不是正在显示的图谱或文件树范围');
  search().props.onChange({ target: { value: '笔记' } }); await button(f.render(), '查找笔记').props.onClick();
  assert.equal(nodes(f.render()).some(node => node.type?.name === 'Directory'), false);
  assert.ok(button(f.render(), '笔记0')); assert.equal(hint(), true);
  truncated = false; await button(f.render(), '查找笔记').props.onClick(); assert.equal(hint(), false);
  truncated = true; await button(f.render(), '查找笔记').props.onClick(); assert.equal(hint(), true);
  search().props.onChange({ target: { value: '   ' } }); assert.equal(hint(), false);
  assert.ok(nodes(f.render()).some(node => node.type?.name === 'Directory'));
  graph = { ...graph, nodes: graph.nodes.slice(0, 100), truncated: true, omittedEdges: 20 };
  await button(f.render(), '刷新').props.onClick();
  assert.equal(hint(), false);
  const controls = nodes(f.render()).find(node => node.props.className === 'ww-graph-controls');
  assert.ok(controls); assert.equal(button(controls, '下一页').props.disabled, false);
  assert.ok(nodes(controls).some(node => node.props.title === '另有 20 条连线不在当前画面内'));
});

for (const failureSource of ['refresh', 'skills']) test(`未改正文保存冲突后${failureSource}查询失败仍保留保护，明确回读或正确保存才解除`, async () => {
  const requests = []; let offline = false, rejectSave = true, resolveOffline = false;
  const graph = { ...emptyGraph(), nodes: [{ kind: 'note', readOnly: false, path: 'a.md', title: 'A', degree: 0 }], total: 1 };
  const f = await fixture({
    skillLibrary: async () => offline ? { ok: false, error: { code: 'offline', message: '技能查询离线' } } : { ok: true, value: { entries: [], offset: 0, total: 0, truncated: false } },
    knowledge: async input => {
      requests.push(input);
      if (input.action === 'status') return offline ? { ok: false, error: { code: 'offline', message: '知识查询离线' } } : { ok: true, value: { initialized: true, root: 'vault', limits: { maxGraphNodes: 200 } } };
      if (input.action === 'search') return { ok: true, value: { notes: [], total: 0, truncated: false } };
      if (input.action === 'graph') return { ok: true, value: graph };
      if (resolveOffline && ['document', 'write'].includes(input.action)) return { ok: false, error: { code: 'offline', message: '正文请求离线' } };
      if (input.action === 'document') return { ok: true, value: { path: 'a.md', content: '未改动正文', hash: rejectSave ? 'old' : 'current', view: { type: 'text', value: '未改动正文' }, links: [], backlinks: [] } };
      if (input.action === 'write') return rejectSave ? { ok: false, error: { code: 'CONFLICT', message: '文件已经更新' } } : { ok: true, value: { path: input.path, hash: 'current' } };
      assert.fail(input.action);
    },
  });
  await button(f.render(), '个人知识').props.onClick();
  await nodes(f.render()).find(node => node.type?.name === 'GraphCanvas').props.onOpenNote({ path: 'a.md' });
  button(f.render(), '编辑').props.onClick();
  await button(f.render(), '保存').props.onClick();
  assert.equal(button(f.render(), '关系图谱').props.disabled, true);
  const before = requests.filter(input => input.action === 'graph').length;
  offline = true; await button(f.render(), failureSource === 'refresh' ? '刷新' : '技能成长').props.onClick();
  offline = false; await button(f.render(), '个人知识').props.onClick();
  assert.equal(requests.filter(input => input.action === 'graph').length, before, '普通查询失败不能清除尚未解决的保存冲突');
  assert.equal(nodes(f.render()).find(node => node.type === 'textarea').props.value, '未改动正文');
  assert.equal(button(f.render(), '关系图谱').props.disabled, true);
  await button(f.render(), '刷新').props.onClick();
  await button(f.render(), '技能成长').props.onClick(); await button(f.render(), '个人知识').props.onClick();
  assert.equal(button(f.render(), '关系图谱').props.disabled, true, '成功查询也不能解除冲突');
  resolveOffline = true;
  await button(f.render(), '读取最新内容').props.onClick(); await button(f.render(), '保存').props.onClick();
  assert.equal(button(f.render(), '关系图谱').props.disabled, true, '回读或保存未成功时同样保留原冲突');
  resolveOffline = false;
  rejectSave = false;
  await button(f.render(), failureSource === 'refresh' ? '读取最新内容' : '保存').props.onClick();
  assert.equal(button(f.render(), '关系图谱').props.disabled, false);
  await button(f.render(), '个人知识').props.onClick();
  assert.equal(requests.filter(input => input.action === 'graph').length, before + 1);
});


test('定时暂停恢复以原生完整记录和状态CAS提交，同一身份和历史入口保留', async () => {
  let status = 'active'; const record = taskRecord(); const mutations = [];
  const f = await fixture({ automation: async input => {
    if (input.action === 'catalog') return taskCatalog([{ ...record, sessionId: 'auto-one', purpose: 'custom', status }]);
    if (input.action === 'read') return { ok: true, value: { task: record, displayPrompt: record.prompt, purpose: 'custom', status } };
    assert.ok(['pause', 'resume'].includes(input.action));
    assert.deepEqual(input.expected, record); assert.equal(input.expectedStatus, status);
    mutations.push(input); status = input.action === 'pause' ? 'paused' : 'active';
    return { ok: true, value: { id: record.id, updated: true, record } };
  } });
  await button(f.render(), '定时任务').props.onClick();
  const list = nodes(f.render()).find(node => node.props.className === 'ww-task-list');
  assert.equal(nodes(list).some(node => node.type === 'pre' || node.props.children.includes('auto-one')), false);
  await button(f.render(), '暂停').props.onClick();
  assert.ok(button(f.render(), '恢复')); assert.ok(button(f.render(), '执行记录')); assert.ok(button(f.render(), '编辑计划'));
  await button(f.render(), '恢复').props.onClick();
  assert.deepEqual(mutations.map(input => [input.action, input.sessionId, input.id]), [['pause', 'auto-one', record.id], ['resume', 'auto-one', record.id]]);
  assert.equal(f.calls.some(([kind, input]) => kind === 'create' || kind === 'automation' && input.action === 'delete'), false);
});

test('定时暂停冲突保留原任务，暂停中编辑使用paused状态且回读失败保留草稿', async () => {
  let status = 'active'; const record = taskRecord(); let failPause = true; const updates = [];
  const f = await fixture({ automation: async input => {
    if (input.action === 'catalog') return taskCatalog([{ ...record, sessionId: 'auto-one', purpose: 'custom', status }]);
    if (input.action === 'read') return { ok: true, value: { task: record, displayPrompt: record.prompt, purpose: 'custom', status } };
    if (input.action === 'pause') {
      if (failPause) return { ok: true, value: { id: record.id, code: 'schedule_conflict' } };
      status = 'paused'; return { ok: true, value: { id: record.id, updated: true, record } };
    }
    assert.equal(input.action, 'update'); updates.push(input);
    return { ok: false, error: { code: 'IO', message: '保存状态尚未知' } };
  } });
  await button(f.render(), '定时任务').props.onClick(); await button(f.render(), '暂停').props.onClick();
  assert.ok(button(f.render(), '暂停')); assert.ok(JSON.stringify(f.render()).includes(shown('schedule_conflict')));
  failPause = false; await button(f.render(), '暂停').props.onClick(); await button(f.render(), '编辑计划').props.onClick();
  taskField(f, '任务名称', '暂停中修改'); await button(f.render(), '保存计划').props.onClick();
  assert.equal(updates[0].expectedStatus, 'paused'); assert.equal(taskField(f, '任务名称').props.value, '暂停中修改');
});

test('缺定时服务以刷新为主恢复，旧版设置为次入口且保留草稿', async () => {
  const f = await fixture({ automation: async () => taskCatalog([], [], false) });
  f.ctx.layout = { selectPanel: panel => f.calls.push(['panel', panel]) };
  await button(f.render(), '定时任务').props.onClick();
  const unavailable = nodes(f.render()).find(node => node.props.className === 'ww-schedule-off');
  assert.match(button(unavailable, '重试').props.className, /ww-primary/);
  assert.doesNotMatch(button(f.render(), '旧版：打开插件设置').props.className || '', /ww-primary/);
  await button(f.render(), '旧版：打开插件设置').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['panel', 'plugins']);
  button(f.render(), '新增定时任务').props.onClick();
  taskField(f, '任务名称', '保留草稿'); taskField(f, '工作指令', '待依赖就绪后执行');
  assert.equal(button(f.render(), '确认创建计划').props.disabled, false);
  await button(f.render(), '确认创建计划').props.onClick();
  assert.equal(taskField(f, '任务名称').props.value, '保留草稿');
  assert.ok(nodes(f.render()).some(node => node.props.role === 'alert' && node.props.children.includes('DSH 定时服务尚未就绪')));
  assert.equal(f.calls.some(([kind]) => ['create', 'prompt', 'automationClaim'].includes(kind)), false);
});

test('知识首页失败保留既有卡片，设置草稿收起和重新进入仍保存且不暗中采集', async () => {
  let fail = false;
  const f = await fixture({ news: async input => input.action === 'home' ? fail ? { ok: false, error: { code: 'IO', message: '卡片读取失败' } } : { ok: true, value: newsHomeResult([newsSavedReport()]) } : { ok: true, value: newsList() } });
  await button(f.render(), '知识卡片').props.onClick(); fail = true;
  await button(f.render(), '刷新').props.onClick(); assert.ok(JSON.stringify(f.render()).includes('真实已保存标题'));
  fail = false; await button(f.render(), '卡片设置').props.onClick(); button(f.render(), '编辑领域').props.onClick(); taskField(f, '关注描述', '仍未提交的领域草稿');
  await button(f.render(), '返回知识卡片').props.onClick(); assert.ok(JSON.stringify(f.render()).includes(dailyBook.chapter.title));
  await button(f.render(), '卡片设置').props.onClick(); assert.equal(taskField(f, '关注描述').props.value, '仍未提交的领域草稿');
  assert.equal(f.calls.some(([kind, input]) => kind === 'news' && ['save', 'remove'].includes(input.action) || ['create', 'prompt'].includes(kind)), false);
});

test('AI网页焦点在挂载后取得，重复选择不翻转，返回只释放焦点且再聚焦不重开网页', async () => {
  const sidebar = browserService(), f = await fixture({ sidebarRight: sidebar.service });
  await button(f.render(), 'AI 网页').props.onClick(); await browserCommit(f);
  const pending = aiOpen(f)('https://chat.deepseek.com/'); await browserCommit(f);
  assert.equal(sidebar.focused, undefined); sidebar.mounted = sidebar.presented; await browserCommit(f); await pending;
  const props = () => nodes(f.render()).find(node => node.type?.name === 'AiWebView').props;
  assert.equal(sidebar.focused, sidebar.mounted); assert.equal(props().sessionId, sidebar.mounted);
  const sameFocus = props().focusBrowser(); await browserCommit(f); await sameFocus; assert.equal(sidebar.focusEvents.filter(e => e[0] === 'focus').length, 1);
  props().restoreBrowser(); assert.equal(sidebar.focused, undefined); assert.ok(sidebar.presented); assert.equal(sidebar.opened.length, 1);
  const focusAgain = props().focusBrowser(); await browserCommit(f); await focusAgain; assert.equal(sidebar.focused, sidebar.mounted); assert.equal(sidebar.opened.length, 1);
  await button(f.render(), '专家团队').props.onClick(); await browserCommit(f);
  assert.equal(sidebar.focused, undefined); assert.equal(sidebar.focusEvents.filter(e => e[0] === 'restore').length, 2);
});


test('用户选择暂停后权威状态已变为暂停时不反向恢复', async () => {
  const record = taskRecord(); const f = await fixture({ automation: async input => {
    if (input.action === 'catalog') return taskCatalog([{ ...record, sessionId: 'changed-task', purpose: 'custom', status: 'active' }]);
    assert.equal(input.action, 'read'); return { ok: true, value: { task: record, displayPrompt: record.prompt, purpose: 'custom', status: 'paused' } };
  } });
  await button(f.render(), '定时任务').props.onClick(); await button(f.render(), '暂停').props.onClick();
  assert.equal(f.calls.some(([kind, input]) => kind === 'automation' && ['pause', 'resume'].includes(input.action)), false);
  assert.ok(nodes(f.render()).some(node => node.props.role === 'alert'));
});


test('AI网页离开后再进入继续使用恢复原中性租约，不创建第二会话或重新导航', async () => {
  const sidebar = browserService(), f = await fixture({ sidebarRight: sidebar.service });
  await button(f.render(), 'AI 网页').props.onClick(); await browserCommit(f);
  const opened = aiOpen(f)('https://chat.deepseek.com/'); await browserCommit(f); sidebar.mounted = sidebar.presented; await browserCommit(f); await opened;
  const original = sidebar.presented;
  await button(f.render(), '专家团队').props.onClick(); await browserCommit(f); sidebar.mounted = undefined;
  assert.equal(sidebar.presented, undefined);
  await button(f.render(), 'AI 网页').props.onClick(); await browserCommit(f);
  const resumed = nodes(f.render()).find(node => node.type?.name === 'AiWebView').props.focusBrowser();
  await browserCommit(f); assert.equal(sidebar.presented, original); assert.equal(sidebar.focused, undefined);
  sidebar.mounted = original; await browserCommit(f); await resumed;
  assert.equal(sidebar.focused, original); assert.equal(sidebar.opened.length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1);
  assert.equal(sidebar.leases.filter(call => call[0] === 'present').length, 2);
  f.unmount(); assert.equal(sidebar.focused, undefined);
  assert.equal(f.calls.filter(call => call[0] === 'release').length, 2);
});

for (const exit of ['abort', 'page', 'unmount']) test('AI网页重新进入继续使用在ready前' + exit + '取消，迟到就绪不夺焦点或导航', async () => {
  const sidebar = browserService(), f = await fixture({ sidebarRight: sidebar.service });
  await button(f.render(), 'AI 网页').props.onClick(); await browserCommit(f);
  const opened = aiOpen(f)('https://chat.deepseek.com/'); await browserCommit(f); sidebar.mounted = sidebar.presented; await browserCommit(f); await opened;
  await button(f.render(), '专家团队').props.onClick(); await browserCommit(f); sidebar.mounted = undefined;
  const ready = Promise.withResolvers(), retain = f.ctx.sessions.retain;
  f.ctx.sessions.retain = (...args) => ({ ...retain(...args), ready: ready.promise });
  await button(f.render(), 'AI 网页').props.onClick(); await browserCommit(f);
  const controller = new AbortController();
  const resumed = nodes(f.render()).find(node => node.type?.name === 'AiWebView').props.focusBrowser(controller.signal), rejected = assert.rejects(resumed);
  await browserCommit(f); assert.equal(sidebar.presented, undefined);
  if (exit === 'abort') controller.abort();
  if (exit === 'page') { await button(f.render(), '专家团队').props.onClick(); await browserCommit(f); }
  if (exit === 'unmount') f.unmount();
  await rejected; ready.resolve(); if (exit !== 'unmount') await browserCommit(f);
  assert.equal(sidebar.focused, undefined); assert.equal(sidebar.presented, undefined); assert.equal(sidebar.opened.length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'release').length, 2);
  assert.equal([...f.timers.values()].some(timer => timer.delay === 16 || timer.delay === 15000), false);
  if (exit !== 'unmount') f.unmount();
});


const checkboxLabel = (f, label) => {
  const group = nodes(f.render()).find(node => node.type === 'label' && JSON.stringify(node.props.children).includes(label));
  const input = nodes(group).find(node => node.type === 'input' && node.props.type === 'checkbox'); assert.ok(input, label); return input;
};

test('旧非北京任务编辑如实显示原时区，仅修改标题不改变原计划时间', async () => {
  for (const kind of ['daily', 'weekly', 'cron']) {
    let record = taskRecord({ kind, time: '09:00:00', timeZone: 'America/New_York', ...(kind === 'weekly' ? { weekdays: [1, 3, 5] } : {}), ...(kind === 'cron' ? { expression: '0 9 * * 1-5' } : {}) });
    let submitted;
    const original = structuredClone(record);
    const f = await fixture({ automation: async input => {
      if (input.action === 'catalog') return taskCatalog([{ ...record, sessionId: 'legacy-zone', purpose: 'custom', status: 'active' }]);
      if (input.action === 'read') return { ok: true, value: { task: record, purpose: 'custom', status: 'active', displayPrompt: record.prompt } };
      assert.equal(input.action, 'update'); submitted = input; record = { ...record, title: input.title };
      return { ok: true, value: { id: record.id, updated: true, record } };
    } });
    await button(f.render(), '定时任务').props.onClick(); await button(f.render(), '编辑计划').props.onClick();
    const row = nodes(f.render()).find(node => node.props.className === 'ww-task-time');
    assert.ok(nodes(row).some(node => node.type === 'span' && node.props.children.includes('原任务时区：America/New_York')));
    assert.equal(nodes(row).some(node => node.type === 'span' && node.props.children.includes('北京时间')), false);
    assert.equal(nodes(f.render()).some(node => node.type === 'label' && node.props.children.includes('时区')), false);
    taskField(f, '任务名称', '只改标题'); await button(f.render(), '保存计划').props.onClick();
    assert.deepEqual(submitted.expected, original); assert.equal(Object.hasOwn(submitted, 'change'), false);
    assert.equal(record.timeZone, 'America/New_York'); assert.equal(record.time, '09:00:00');
    assert.equal(nodes(f.render()).some(node => node.props.className === 'ww-task-editor'), false);
  }
});

test('旧任务明确改为北京时间或修改时间后，提交完整时间变更且不自动换算钟点', async () => {
  for (const action of ['convert', 'time', 'rule']) {
    let record = taskRecord({ time: '09:00:00', timeZone: 'America/New_York' }); let submitted;
    const original = structuredClone(record);
    const f = await fixture({ automation: async input => {
      if (input.action === 'catalog') return taskCatalog([{ ...record, sessionId: 'legacy-zone', purpose: 'custom', status: 'active' }]);
      if (input.action === 'read') return { ok: true, value: { task: record, purpose: 'custom', status: 'active', displayPrompt: record.prompt } };
      assert.equal(input.action, 'update'); submitted = input;
      const timing = input.change[input.change.kind];
      record = { ...record, kind: input.change.kind, time: timing.time, timeZone: timing.time_zone, ...(timing.weekdays ? { weekdays: timing.weekdays } : {}) };
      return { ok: true, value: { id: record.id, updated: true, record } };
    } });
    await button(f.render(), '定时任务').props.onClick(); await button(f.render(), '编辑计划').props.onClick();
    if (action === 'convert') button(f.render(), '改为北京时间').props.onClick();
    else if (action === 'time') taskField(f, '每日时间', '10:30');
    else taskField(f, '时间规则', 'weekly');
    const row = nodes(f.render()).find(node => node.props.className === 'ww-task-time');
    assert.ok(nodes(row).some(node => node.type === 'span' && node.props.children.includes('北京时间')));
    assert.equal(JSON.stringify(row).includes('America/New_York'), false);
    assert.equal(taskField(f, '每日时间').props.value, action === 'time' ? '10:30' : '09:00:00');
    await button(f.render(), '保存计划').props.onClick();
    assert.deepEqual(submitted.expected, original);
    assert.deepEqual(submitted.change, action === 'rule'
      ? { kind: 'weekly', weekly: { time: '09:00:00', time_zone: 'Asia/Shanghai', weekdays: [1, 2, 3, 4, 5] } }
      : { kind: 'daily', daily: { time: action === 'time' ? '10:30:00' : '09:00:00', time_zone: 'Asia/Shanghai' } });
    assert.equal(record.timeZone, 'Asia/Shanghai');
    assert.equal(nodes(f.render()).some(node => node.props.className === 'ww-task-editor'), false);
  }
});

test('新任务每日每周和Cron始终显示固定北京时间，无可编辑时区并传入上海时区', async () => {
  for (const rule of ['daily', 'weekly', 'cron']) {
    let submitted; const tasks = [];
    const f = await fixture({ automation: async input => {
      if (input.action === 'catalog') return taskCatalog(tasks);
      assert.equal(input.action, 'create'); submitted = input;
      const timing = input.spec[rule];
      const task = taskRecord({ title: input.spec.title, prompt: input.spec.prompt, kind: rule, timeZone: timing.time_zone });
      tasks.push({ ...task, sessionId: input.sessionId, purpose: 'custom', status: 'active' });
      return { ok: true, value: { task, recovered: false } };
    } });
    await button(f.render(), '定时任务').props.onClick(); button(f.render(), '新增定时任务').props.onClick();
    taskField(f, '时间规则', rule); taskField(f, '任务名称', '北京时间任务'); taskField(f, '工作指令', '检查任务');
    const row = nodes(f.render()).find(node => node.props.className === 'ww-task-time');
    assert.ok(nodes(row).some(node => node.type === 'span' && node.props.children.includes('北京时间')));
    assert.equal(nodes(f.render()).some(node => node.type === 'label' && node.props.children.includes('时区')), false);
    assert.equal(nodes(f.render()).some(node => node.type === 'button' && node.props.children.includes('改为北京时间')), false);
    await button(f.render(), '确认创建计划').props.onClick();
    assert.equal(submitted.spec[rule].time_zone, 'Asia/Shanghai');
    assert.equal(Object.hasOwn(submitted, 'change'), false);
    assert.equal(nodes(f.render()).some(node => node.props.className === 'ww-task-editor'), false);
  }
});

test('定时多选全选与排除通过真实表单传入API，新增工作区仍受全选语义覆盖', async () => {
  const workspaceState = { items: ['甲', '乙', '丙'].map((name, i) => ({ workspaceId: 'w' + i, name, path: 'E:/'+name, sessionIds: [] })) }; const tasks=[]; let submitted;
  const f=await fixture({workspaceState,automation:async input=>{
    if(input.action==='catalog')return taskCatalog(tasks);
    submitted=input;const task=taskRecord({title:'DSH 工作知识整理'});tasks.push({...task,sessionId:input.sessionId,purpose:'knowledge',status:'active',workspaceScope:input.workspaceScope});return {ok:true,value:{task,recovered:false}};
  }});
  await button(f.render(),'定时任务').props.onClick();button(f.render(),'设置并启用').props.onClick();
  assert.equal(checkboxLabel(f,'全部工作区').props.checked,true);assert.ok(nodes(f.render()).some(node=>node.props['aria-haspopup']==='dialog'&&node.props['aria-label']==='已选 3 个工作区'));
  checkboxLabel(f,'乙').props.onChange({target:{checked:false}});assert.equal(checkboxLabel(f,'乙').props.checked,false);assert.equal(checkboxLabel(f,'甲').props.checked,true);
  workspaceState.items.push({workspaceId:'w3',name:'丁',path:'E:/丁',sessionIds:[]});assert.equal(checkboxLabel(f,'丁').props.checked,true);
  await button(f.render(),'确认创建计划').props.onClick();
  assert.deepEqual(submitted.workspaceScope,{mode:'all',excludedWorkspaceIds:['w1']});assert.deepEqual(submitted.spec,{daily:{time:'00:15:00',time_zone:'Asia/Shanghai'}});
});

test('定时显式多选和编辑保留处理范围，空选择拒收且不创建会话',async()=>{
  const workspaceState={items:['甲','乙','丙'].map((name,i)=>({workspaceId:'w'+i,name,path:'E:/'+name,sessionIds:[]}))};let scope={mode:'selected',workspaceIds:['w0','w2']};const record=taskRecord({title:'DSH 工作知识整理'});let updated;
  const f=await fixture({workspaceState,automation:async input=>{
    if(input.action==='catalog')return taskCatalog([{...record,sessionId:'task-one',purpose:'knowledge',status:'active',workspaceScope:scope}]);
    if(input.action==='read')return {ok:true,value:{task:record,purpose:'knowledge',status:'active',displayPrompt:record.prompt,workspaceScope:scope}};
    updated=input;scope=input.workspaceScope;return {ok:true,value:{id:record.id,updated:true,record}};
  }});await button(f.render(),'定时任务').props.onClick();await button(f.render(),'编辑计划').props.onClick();
  assert.equal(checkboxLabel(f,'甲').props.checked,true);assert.equal(checkboxLabel(f,'乙').props.checked,false);assert.equal(checkboxLabel(f,'丙').props.checked,true);
  checkboxLabel(f,'丙').props.onChange({target:{checked:false}});checkboxLabel(f,'乙').props.onChange({target:{checked:true}});await button(f.render(),'保存计划').props.onClick();
  assert.deepEqual(updated.workspaceScope,{mode:'selected',workspaceIds:['w0','w1']});assert.deepEqual(updated.expected,record);
  const empty=await fixture({workspaceState});await button(empty.render(),'定时任务').props.onClick();button(empty.render(),'设置并启用').props.onClick();
  checkboxLabel(empty,'全部工作区').props.onChange({target:{checked:false}});
  await button(empty.render(),'确认创建计划').props.onClick();assert.equal(empty.calls.some(([kind])=>kind==='create'),false);assert.ok(nodes(empty.render()).some(node=>node.props.role==='alert'));assert.equal(taskField(empty,'任务名称').props.value,'DSH 工作知识整理');
});

test('自建任务不显示处理范围：新建不带工作区，旧任务编辑时说明并去掉原清单',async()=>{
  const workspaceState={items:[{workspaceId:'w0',name:'甲',path:'E:/甲',sessionIds:[]}]};const record=taskRecord();let updated,created;
  const hasPicker=f=>nodes(f.render()).some(node=>node.type==='label'&&JSON.stringify(node.props.children).includes('全部工作区'));
  const f=await fixture({workspaceState,automation:async input=>{
    if(input.action==='catalog')return taskCatalog([{...record,sessionId:'task-one',purpose:'custom',status:'active',workspaceScope:{mode:'selected',workspaceIds:['w0']}}]);
    if(input.action==='read')return {ok:true,value:{task:record,purpose:'custom',status:'active',displayPrompt:record.prompt,workspaceScope:{mode:'selected',workspaceIds:['w0']}}};
    if(input.action==='update'){updated=input;return {ok:true,value:{id:record.id,updated:true,record}};}
    created=input;return {ok:true,value:{task:record,recovered:false}};
  }});await button(f.render(),'定时任务').props.onClick();await button(f.render(),'编辑计划').props.onClick();
  assert.equal(hasPicker(f),false);assert.ok(nodes(f.render()).some(node=>node.props.children?.includes?.('这个任务以前附带了工作区清单，保存后只保留你写的工作指令')));
  await button(f.render(),'保存计划').props.onClick();
  assert.equal(Object.hasOwn(updated,'workspaceScope'),false);assert.equal(updated.prompt,record.prompt);
  const fresh=await fixture({workspaceState});await button(fresh.render(),'定时任务').props.onClick();button(fresh.render(),'新增定时任务').props.onClick();
  assert.equal(hasPicker(fresh),false);assert.equal(created,undefined);
});

test('定时放弃确认使用native顶层dialog，Escape保留草稿且关闭归还焦点',async()=>{
 const f=await fixture();await button(f.render(),'定时任务').props.onClick();button(f.render(),'新增定时任务').props.onClick();taskField(f,'任务名称','保留草稿');
 const events=[];f.document.activeElement={isConnected:true,focus:()=>events.push('focus')};button(f.render(),'放弃任务草稿').props.onClick();const tree=f.render(),dialog=nodes(tree).find(node=>node.type==='dialog');assert.ok(dialog);assert.equal(dialog.props['aria-label'],'放弃任务草稿');
 const css=nodes(tree).find(node=>node.type==='style').props.children[0];assert.ok(css.includes('.ww-modal.ww-page[open]{position:fixed;'));assert.ok(css.includes('.ww-modal:not([open]){display:none}'));
 dialog.props.ref.current={showModal:()=>events.push('showModal'),close:()=>events.push('close')};f.flushEffects();assert.deepEqual(events,['showModal']);dialog.props.onCancel({preventDefault:()=>events.push('prevent')});f.render();assert.deepEqual(events,['showModal','prevent','close','focus']);assert.equal(taskField(f,'任务名称').props.value,'保留草稿');
 button(f.render(),'放弃任务草稿').props.onClick();const confirm=nodes(f.render()).find(node=>node.type==='dialog');button(confirm,'放弃任务草稿').props.onClick();assert.equal(nodes(f.render()).some(node=>node.props.className==='ww-task-editor'),false);assert.equal(f.calls.some(([kind])=>kind==='create'),false);
});

test('插件隐藏重复原生任务入口只持有可逆租约，卸载归还入口',async()=>{
 const f=await fixture();assert.deepEqual(f.navigation,['hide']);for(const cleanup of f.disposed)if(typeof cleanup==='function')await cleanup();assert.deepEqual(f.navigation,['hide','restore']);
});

// —— 知识卡片书房改版：首页书桌、AI 使用技巧卡、书架页、常看选择抽屉与替换弹窗 ——
const shelfBook = (n, changes = {}) => ({ ...libraryBook, id: `00000000-0000-4000-8000-00000000001${n}`, title: `书${n}`, author: `作者${n}`, chapters: 10, daily: false, groups: [], addedAt: `2026-10-2${n}T02:00:00.000Z`, progress: { last: 0, next: 0 }, ...changes });
const deskBook = (book, changes = {}) => ({ id: book.id, title: book.title, author: book.author, cover: Boolean(book.cover), chapters: book.chapters, finished: false, chapter: { index: book.progress.next, title: `${book.title} 第 ${book.progress.next + 1} 章`, excerpt: `${book.title} 的摘要`, chars: 9000 }, next: [], ...changes });
const desks = tree => nodes(tree).filter(node => typeof node.props?.className === 'string' && node.props.className.startsWith('ww-desk-card'));
const menuItems = node => nodes(nodes(node).find(child => child.type?.name === 'ActionMenu')).filter(child => child.type === 'button').map(child => child.props.children.join(''));
const pinCalls = f => f.calls.filter(([kind, input]) => kind === 'library' && input.action === 'pins').map(([, input]) => input);
/** 书架宿主替身：按契约实现 list / update / pins / remove，pins 按 expected 做冲突校验；首页学习数据从同一份书架算出（常看书按书名排）。elsewhere 模拟别处先改了常看。 */
function shelfHost(initial, options = {}) {
  const state = { groups: options.groups ?? [], books: structuredClone(initial) };
  const ok = value => ({ ok: true, value });
  const sorted = () => [...state.books].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  const library = () => ({ groups: state.groups, books: sorted() });
  const pins = () => sorted().filter(book => book.daily).map(book => book.id);
  const host = {
    state, pins, elsewhere: null, learning: {},
    news: async input => input.action === 'home'
      ? ok({ reports: [], learning: { date: '2026-10-12', total: state.books.length, daily: pins().length, books: sorted().filter(book => book.daily).map(book => deskBook(book)), tip: dailyTip, tipRecent: [], tipField: { name: 'AI 使用技巧', enabled: true, deleted: false }, ...host.learning } })
      : ok(newsList()),
    library: async input => {
      if (input.action === 'list') return ok({ library: library() });
      if (input.action === 'update') {
        const book = state.books.find(item => item.id === input.id);
        if (input.daily && !book.daily && pins().length >= 2) return { ok: false, error: { code: 'LIBRARY_PIN_FULL', message: '常看书籍最多两本，请先换下一本' } };
        for (const key of ['title', 'author', 'groups', 'daily']) if (Object.hasOwn(input, key)) book[key] = input[key];
        return ok({ book, library: library() });
      }
      if (input.action === 'pins') {
        if (host.elsewhere) { for (const book of state.books) book.daily = host.elsewhere.includes(book.id); host.elsewhere = null; }
        if ([...input.expected].sort().join() !== [...pins()].sort().join()) return { ok: false, error: { code: 'CONFLICT', message: '常看书籍刚在别处改过，请刷新' } };
        for (const book of state.books) book.daily = input.ids.includes(book.id);
        return ok({ library: library() });
      }
      if (input.action === 'remove') { state.books = state.books.filter(book => book.id !== input.id); return ok({ removed: input.id, library: library() }); }
      if (input.action === 'open') { const book = state.books.find(item => item.id === input.id); return ok({ reading: { book, toc: Array.from({ length: book.chapters }, (_, i) => ({ title: `第 ${i + 1} 章`, chars: 9000 })), chapter: { index: input.chapter, title: `第 ${input.chapter + 1} 章`, view: { type: 'root', line: 1, children: [] } } } }); }
      if (input.action === 'image') return ok({ image: { mime: 'image/webp', data: 'Q09WRVI=' } });
      throw new Error('unexpected library action ' + input.action);
    },
  };
  return host;
}

test('今日学习：一本常看是加宽卡，整卡打开下一章并按章阅读，“接下来”打开所点的章，“查看全部”打开即展开目录；关闭阅读器重读首页', async () => {
  const titles = ['前言', '1 软件需求全景图', '2 日常需求分析', '3 目标/愿景分析'];
  const reading = index => ({ reading: { book: libraryBook, toc: titles.map(title => ({ title, chars: 9000 })), chapter: { index, title: titles[index], view: { type: 'root', line: 1, children: [
    { type: 'heading', level: 2, line: 1, children: [{ type: 'text', value: titles[index], line: 1 }] },
    { type: 'paragraph', line: 3, children: [{ type: 'text', value: '章节正文内容', line: 3 }] },
    { type: 'paragraph', line: 5, children: [{ type: 'image', url: 'img-0001.png', value: '插图一', line: 5 }] }] } } } });
  const f = await fixture({ news: async () => ({ ok: true, value: newsHomeResult([newsSavedReport()]) }), library: async input => {
    if (input.action === 'open') return { ok: true, value: reading(input.chapter) };
    if (input.action === 'progress') return { ok: true, value: { book: libraryBook, library: { groups: [], books: [libraryBook] } } };
    if (input.action === 'image') return { ok: true, value: { image: { mime: 'image/png', data: 'AAAA' } } };
    throw new Error('unexpected library action');
  } });
  await button(f.render(), '知识卡片').props.onClick();
  const tree = f.render(), text = JSON.stringify(tree);
  for (const content of ['2 日常需求分析', '日常需求分析的摘要。', '第 3 / 18 章', '约 26 分钟', '11%', '读第 3 章 →', '接下来', '3 目标/愿景分析', '查看全部 18 章', '写长文档前先让 AI 列提纲', '常看 1 / 2 本 · 书架 2 本', '真实已保存标题']) assert.ok(text.includes(content), content);
  const [card] = desks(tree);
  assert.equal(desks(tree).length, 1);
  assert.equal(card.props.className, 'ww-desk-card ww-desk-wide', '只有一本常看时用加宽卡');
  assert.equal(nodes(tree).some(node => node.props?.className === 'ww-desk-add'), false, '不放空位占位卡');
  assert.equal(nodes(card).find(node => node.type?.name === 'ActionMenu').props.label, '有效需求分析 · 更多操作');
  assert.deepEqual(menuItems(card), ['换一本', '再加一本常看', '取消常看', '在书架中查看'], '“…”常显，换一本在第一项');
  assert.equal(nodes(tree).some(node => node.type === 'dialog'), false, '正文只在点开后出现');
  const main = nodes(card).find(node => node.props?.className === 'ww-desk-main');
  assert.equal(main.props.role, 'button');
  assert.equal(nodes(main).some(node => node.type === 'button'), false, '整卡按钮里不嵌按钮，“接下来”另成一组');
  const before = f.calls.length;
  await main.props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'open', id: libraryBook.id, chapter: 2 }], '首页打开定位到下一章');
  let reader = nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === libraryBook.title);
  assert.ok(reader, '按章阅读器以书名为标题');
  assert.ok(JSON.stringify(reader).includes('章节正文内容'));
  f.flushEffects(); await new Promise(setImmediate);
  reader = nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === libraryBook.title);
  assert.ok(nodes(reader).some(node => node.type === 'img' && node.props.src === 'data:image/png;base64,AAAA' && node.props.alt === '插图一'), '书内图片经书架读取后显示');
  // 2026-10-28 用户：电脑上读书改成上下滚动、目录放左侧。阅读器的滚动区和正文在测试里用假的尺寸代替。
  const memory = new Map(), previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) } });
  const attach = (box = { scrollTop: 0, scrollHeight: 400, clientHeight: 400 }) => {
    const dialog = nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === libraryBook.title);
    dialog.props.ref.current ??= { open: false, showModal() { this.open = true; }, close() {} };
    const scroll = nodes(dialog).find(node => node.props?.className === 'ww-book-scroll');
    scroll.props.ref.current = { ...box, focus() {}, scrollTo() {} };
    nodes(dialog).find(node => node.props?.className === 'ww-book-flow').props.ref.current = { querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0 }), addEventListener() {}, removeEventListener() {} };
    return { dialog, scroll };
  };
  // 本章一屏放得下：打开就在本章末尾，记为读完，首页常看书推进到下一章。
  attach().scroll.props.onScroll(); f.flushEffects(); await new Promise(setImmediate);
  assert.deepEqual(f.calls.filter(([kind, input]) => kind === 'library' && input.action === 'progress'), [['library', { action: 'progress', id: libraryBook.id, chapter: 2 }]]);
  reader = nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === libraryBook.title);
  const toc = nodes(reader).find(node => node.type === 'nav' && node.props.className === 'ww-book-toc');
  assert.ok(toc, '宽窗时目录在左侧展开');
  assert.equal(nodes(reader).find(node => node.props?.className === 'ww-book-toggle').props['aria-expanded'], true);
  assert.deepEqual(nodes(toc).filter(node => node.type === 'button').map(node => JSON.stringify(node)).map((text, index) => text.includes(titles[index])), titles.map(() => true), '目录按顺序列出全书各章');
  assert.equal(nodes(toc).filter(node => node.type === 'button' && node.props['aria-current'] === 'true').length, 1, '当前章高亮');
  assert.equal(nodes(reader).some(node => ['ww-book-edge', 'ww-book-viewport', 'ww-book-stage'].includes(node.props?.className)), false, '不再左右翻页');
  const next = nodes(reader).find(node => node.type === 'button' && node.props.className === 'ww-book-next-chapter');
  assert.ok(JSON.stringify(next).includes('3 目标/愿景分析'), '章末接着是下一章');
  assert.ok(JSON.stringify(reader).includes('停一下再往下滚，进入下一章'), '章末说明继续往下滚也能进入下一章');
  await next.props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'open', id: libraryBook.id, chapter: 3 }]);
  // ← → 换章。
  nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === libraryBook.title).props.onKeyDown({ key: 'ArrowLeft', target: { closest: () => null }, preventDefault() {} });
  await new Promise(setImmediate);
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'open', id: libraryBook.id, chapter: 2 }], '← 回到上一章');
  // 读到一半关掉：位置记在本机；再从首页打开同一章，回到原处。
  await new Promise(setImmediate); await new Promise(setImmediate);
  assert.ok(JSON.stringify(nodes(f.render()).find(node => node.props?.className === 'ww-book-progress')).includes(titles[2]), '已换到上一章');
  let { scroll } = attach({ scrollTop: 300, scrollHeight: 1000, clientHeight: 400 });
  f.flushEffects();
  scroll.props.ref.current.scrollTop = 300; scroll.props.onScroll();
  // 滚动停下 0.3 秒后记一次位置（关掉阅读器时也会记）；测试里的计时器由夹具接管，手动触发。
  for (const [id, timer] of [...f.timers]) if (timer.delay === 300) { f.timers.delete(id); timer.fn(); }
  nodes(f.render()).find(node => node.type === 'dialog').props.onCancel({ preventDefault() {} });
  await new Promise(setImmediate); f.flushEffects();
  assert.deepEqual((({ chapter, ratio }) => ({ chapter, ratio }))(JSON.parse(memory.get('whalewing.reader')).books[libraryBook.id]), { chapter: 2, ratio: 0.5 });
  await nodes(f.render()).find(node => node.props?.className === 'ww-desk-main').props.onClick();
  ({ scroll } = attach({ scrollTop: 0, scrollHeight: 1000, clientHeight: 400 }));
  f.flushEffects();
  assert.equal(scroll.props.ref.current.scrollTop, 300, '回到上次读到的地方');
  nodes(f.render()).find(node => node.type === 'dialog').props.onCancel({ preventDefault() {} });
  await new Promise(setImmediate);
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else delete globalThis.localStorage;
  await nodes(f.render()).find(node => node.props?.className === 'ww-desk-next-row').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'open', id: libraryBook.id, chapter: 3 }]);
  // 关闭阅读器回到首页原位，重读首页学习数据。
  const homes = () => f.calls.filter(([kind, input]) => kind === 'news' && input.action === 'home').length, read = homes();
  nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === libraryBook.title).props.onCancel({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(homes(), read + 1);
  assert.equal(nodes(f.render()).some(node => node.type === 'dialog'), false);
  await nodes(f.render()).find(node => node.props?.className === 'ww-desk-next-row').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'open', id: libraryBook.id, chapter: 3 }], '“接下来”打开所点的那一章');
  nodes(f.render()).find(node => node.type === 'dialog').props.onCancel({ preventDefault() {} });
  await new Promise(setImmediate);
  // “查看全部 18 章”：打开当前章，窄窗里目录本来收起，这时直接展开。
  const previousWidth = Object.getOwnPropertyDescriptor(globalThis, 'innerWidth');
  Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: 700 });
  await nodes(f.render()).find(node => node.props?.className === 'ww-desk-main').props.onClick();
  assert.equal(nodes(f.render()).find(node => node.props?.className === 'ww-book-toggle').props['aria-expanded'], false, '窄窗默认收起目录');
  nodes(f.render()).find(node => node.type === 'dialog').props.onCancel({ preventDefault() {} });
  await new Promise(setImmediate);
  await button(f.render(), '查看全部 18 章').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'open', id: libraryBook.id, chapter: 2 }]);
  reader = nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === libraryBook.title);
  assert.equal(nodes(reader).find(node => node.props?.className === 'ww-book-toggle').props['aria-expanded'], true, '“查看全部”打开即展开目录');
  assert.ok(nodes(reader).some(node => node.type === 'nav' && node.props.className === 'ww-book-toc'));
  if (previousWidth) Object.defineProperty(globalThis, 'innerWidth', previousWidth); else delete globalThis.innerWidth;
  assert.equal(f.calls.slice(before).some(([kind]) => !['library', 'news'].includes(kind)), false, '阅读不调用外站或模型');
  f.unmount();
});

test('AI 使用技巧卡整卡进入技巧历史并定位当天首页那条，近 14 天刻度补齐空日；停用时进卡片设置打开它的编辑抽屉，删除后不显示且书桌变宽', async () => {
  let learning = {};
  const tipsField = { ...structuredClone(defaultTipsField), revision: 1 };
  const f = await fixture({ news: async input => ({ ok: true, value: input.action === 'home' ? newsHomeResult([], learning) : newsList([structuredClone(defaultNewsField), tipsField]) }) });
  await button(f.render(), '知识卡片').props.onClick();
  const card = () => nodes(f.render()).find(node => node.props?.className === 'ww-tile ww-tip-card');
  const cells = () => nodes(card()).filter(node => node.type === 'i' && node.props['data-day']);
  assert.equal(cells().length, 14, '近 14 天每天一格，空日补齐');
  assert.deepEqual(cells().map(cell => cell.props['data-day']), [...Array(11).fill('none'), 'partial', 'none', 'issued']);
  assert.deepEqual(cells().map(cell => Boolean(cell.props['data-today'])), [...Array(13).fill(false), true]);
  assert.equal(card().props['aria-label'], 'AI 使用技巧，10 月 12 日 · 星期一，写长文档前先让 AI 列提纲。近 14 天整理了 2 期。打开技巧历史');
  assert.equal(card().props.role, 'button');
  assert.equal(nodes(card()).some(node => ['button', 'a'].includes(node.type)), false, '整卡只有一个可点目标');
  for (const content of ['10/12', '查看往期 →', '宝玉', '近 14 天']) assert.ok(JSON.stringify(card()).includes(content), content);
  const before = f.calls.length;
  card().props.onClick();
  const tips = () => nodes(f.render()).find(node => node.type?.name === 'TipsPage');
  assert.deepEqual(tips().props.focus, { date: '2026-10-12', index: 1 }, '定位到当天首页那条');
  assert.deepEqual(tips().props.field, { name: 'AI 使用技巧', enabled: true, deleted: false });
  assert.equal(card(), undefined, '技巧历史是子页，首页不再显示');
  assert.equal(f.calls.length, before, '进技巧历史不重读首页');
  await button(f.render(), '刷新').props.onClick();
  assert.equal(tips().props.reloadKey, 1, '外壳刷新只让技巧历史重读');
  assert.equal(f.calls.length, before);
  await button(f.render(), '专家团队').props.onClick(); await button(f.render(), '知识卡片').props.onClick();
  assert.ok(tips(), '切页签回来仍停在技巧历史');
  assert.equal(tips().props.reloadKey, 1, '回到页签不重读技巧历史');
  tips().props.onBack();
  assert.ok(card(), '面包屑回到首页');
  // 今天的技巧还没出：日期仍写今天，今天那一格空心，整卡仍进技巧历史。
  learning = { tip: null };
  await button(f.render(), '刷新').props.onClick();
  assert.ok(JSON.stringify(card()).includes('今天的技巧 08:00 后整理好') && JSON.stringify(card()).includes('10/12'));
  assert.deepEqual([cells().at(-1).props['data-day'], cells().at(-1).props['data-today']], ['issued', true]);
  card().props.onClick();
  assert.equal(tips().props.focus, null);
  tips().props.onBack();
  // 领域停用：标题位写已停用，点卡片进卡片设置并直接打开 ai-tips 的编辑抽屉。
  learning = { tipField: { name: 'AI 使用技巧', enabled: false, deleted: false } };
  await button(f.render(), '刷新').props.onClick();
  assert.ok(JSON.stringify(card()).includes('AI 使用技巧已停用') && JSON.stringify(card()).includes('到卡片设置开启'));
  assert.equal(cells().length, 0);
  await card().props.onClick();
  assert.deepEqual(f.calls.at(-1), ['news', { action: 'list' }]);
  assert.ok(nodes(f.render()).some(node => node.type === 'dialog' && node.props['aria-label'] === '编辑领域'));
  assert.equal(taskField(f, '领域名称').props.value, 'AI 使用技巧');
  // 卡片设置里 ai-tips 领域的“查看历史日报”也进技巧历史页。
  const field = nodes(f.render()).find(node => node.type === 'article' && node.props.key === 'ai-tips');
  button(field, '查看历史日报').props.onClick();
  assert.ok(tips());
  assert.equal(f.calls.at(-1)[1].action, 'list', '不再用弹窗读历史日报');
  tips().props.onBack();
  // 领域删除：整张技巧卡不显示，书桌区变宽。
  learning = { tipField: null };
  await button(f.render(), '刷新').props.onClick();
  assert.equal(card(), undefined);
  assert.equal(nodes(f.render()).find(node => node.props?.className?.startsWith?.('ww-desk-row')).props.className, 'ww-desk-row ww-desk-solo');
  f.unmount();
});

test('零本常看只放占位卡：书架有书时打开选择抽屉，勾满两本其余锁住，查找不丢勾选，保存带原列表调用 pins 并可撤销；书架为空时进书架', async () => {
  const a = shelfBook(1, { title: '极简项目管理', author: '郭致星' }), b = shelfBook(2, { title: '有效需求分析', author: '徐锋' }), c = shelfBook(3, { title: '用户故事地图', author: 'Jeff Patton' });
  const host = shelfHost([a, b, c]);
  const f = await fixture({ news: host.news, library: host.library });
  await button(f.render(), '知识卡片').props.onClick();
  const text = JSON.stringify(f.render());
  assert.ok(text.includes('还没有常看书 · 书架 3 本'));
  for (const title of [a.title, b.title, c.title]) assert.equal(text.includes(title), false, '占位卡里不出现任何书');
  const add = nodes(f.render()).find(node => node.props?.className === 'ww-desk-add');
  assert.equal(add.props['aria-label'], '添加常看书籍，打开选择抽屉');
  assert.ok(JSON.stringify(add).includes('从书架选一到两本，首页每天接着读下一章'));
  await add.props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'list' }]);
  const drawer = () => nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === '选择常看书籍');
  const rows = () => nodes(drawer()).filter(node => node.props?.className === 'ww-pin-row');
  const row = title => rows().find(item => JSON.stringify(item).includes(title));
  const box = title => nodes(row(title)).find(node => node.type === 'input');
  assert.deepEqual(rows().map(item => nodes(item).find(node => node.type === 'strong').props.children[0]), [c.title, b.title, a.title], '最近加入在前');
  assert.ok(JSON.stringify(drawer()).includes('已选 0 / 2 本') && JSON.stringify(drawer()).includes('最多两本，首页按书名顺序显示。'));
  assert.equal(button(drawer(), '保存常看书籍').props.disabled, true, '没有改动时保存置灰');
  box(a.title).props.onChange(); box(c.title).props.onChange();
  assert.ok(JSON.stringify(drawer()).includes('已选 2 / 2 本'));
  assert.equal(button(drawer(), '保存常看书籍').props.disabled, false, '改了才能保存');
  assert.equal(box(b.title).props.disabled, true, '选满两本后其余行不可勾');
  assert.equal(row(b.title).props.title, '已选满两本，先取消一本');
  const search = nodes(drawer()).find(node => node.type === 'input' && node.props.type === 'search');
  search.props.onChange({ target: { value: '徐锋' } });
  assert.deepEqual(rows().length, 1, '按作者即时过滤');
  assert.ok(JSON.stringify(drawer()).includes('已选 2 / 2 本'), '被过滤掉的已勾书保持勾选');
  nodes(drawer()).find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value: '' } });
  await button(drawer(), '保存常看书籍').props.onClick();
  assert.deepEqual(pinCalls(f), [{ action: 'pins', ids: [a.id, c.id], expected: [] }]);
  assert.equal(drawer(), undefined);
  assert.deepEqual(f.calls.at(-1), ['news', { action: 'home' }], '保存后首页书桌原位刷新');
  assert.deepEqual(desks(f.render()).map(card => card.props.key), [a.id, c.id], '两本并排，按书名排');
  assert.ok(JSON.stringify(f.render()).includes('常看书籍已保存'));
  assert.ok([...f.timers.values()].some(timer => timer.delay === 4000), '带撤销的提示 4 秒收起');
  await button(f.render(), '撤销').props.onClick();
  assert.deepEqual(pinCalls(f).at(-1), { action: 'pins', ids: [], expected: [a.id, c.id] }, '撤销就是用原列表再调一次 pins');
  assert.equal(desks(f.render()).length, 0);
  assert.ok(JSON.stringify(f.render()).includes('已撤销'));
  assert.equal(f.calls.some(([kind, input]) => kind === 'library' && input.action === 'update'), false);
  f.unmount();
  // 书架为空（S3b）：占位卡写“书架里还没有书”，点了进书架，焦点落在导入卡。
  const empty = shelfHost([]), g = await fixture({ news: empty.news, library: empty.library });
  await button(g.render(), '知识卡片').props.onClick();
  assert.ok(JSON.stringify(g.render()).includes('书架还是空的'));
  const blank = nodes(g.render()).find(node => node.props?.className === 'ww-desk-add');
  assert.ok(JSON.stringify(blank).includes('书架里还没有书') && JSON.stringify(blank).includes('导入电子书，或从在线书目下载开放许可的书'));
  await blank.props.onClick();
  assert.deepEqual(g.calls.at(-1), ['library', { action: 'list' }]);
  assert.ok(nodes(g.render()).some(node => node.props?.className === 'ww-library'));
  assert.ok(JSON.stringify(g.render()).includes('书架是空的'));
  g.unmount();
});

test('两本常看并排；“换一本”打开抽屉勾着当前两本，别处改过时重读并提示、勾选换成最新；改了再关先确认放弃，不提交', async () => {
  const a = shelfBook(1, { title: '极简项目管理', daily: true }), b = shelfBook(2, { title: '有效需求分析', daily: true }), c = shelfBook(3, { title: '用户故事地图' });
  const host = shelfHost([a, b, c]);
  const f = await fixture({ news: host.news, library: host.library });
  await button(f.render(), '知识卡片').props.onClick();
  assert.ok(JSON.stringify(f.render()).includes('常看 2 / 2 本 · 书架 3 本'));
  const cards = desks(f.render());
  assert.deepEqual(cards.map(card => card.props.className), ['ww-desk-card', 'ww-desk-card']);
  assert.deepEqual(menuItems(cards[0]), ['换一本', '取消常看', '在书架中查看'], '两本时没有“再加一本常看”');
  assert.equal(nodes(f.render()).some(node => node.props?.className === 'ww-desk-next'), false, '标准书卡不列“接下来”');
  await button(cards[0], '换一本').props.onClick();
  const drawer = () => nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === '选择常看书籍');
  const box = title => nodes(nodes(drawer()).filter(node => node.props?.className === 'ww-pin-row').find(item => JSON.stringify(item).includes(title))).find(node => node.type === 'input');
  assert.deepEqual([box(a.title).props.checked, box(b.title).props.checked, box(c.title).props.checked], [true, true, false], '打开时勾着当前常看书');
  assert.equal(box(c.title).props.disabled, true);
  assert.ok(box(a.title).props.ref, '焦点落在被换的那本上');
  box(a.title).props.onChange(); box(c.title).props.onChange();
  host.elsewhere = [b.id];
  await button(drawer(), '保存常看书籍').props.onClick();
  assert.deepEqual(pinCalls(f), [{ action: 'pins', ids: [b.id, c.id], expected: [a.id, b.id] }]);
  assert.ok(JSON.stringify(f.render()).includes('常看书籍刚在别处改过，已重新读取'));
  assert.ok(drawer(), '冲突时抽屉留着');
  assert.deepEqual([box(a.title).props.checked, box(b.title).props.checked, box(c.title).props.checked], [false, true, false], '勾选更新为最新');
  assert.equal(button(drawer(), '保存常看书籍').props.disabled, true);
  assert.equal(desks(f.render()).length, 1, '首页书桌按最新常看原位刷新');
  box(c.title).props.onChange();
  button(drawer(), '取消').props.onClick();
  const confirm = nodes(f.render()).filter(node => node.type === 'dialog').at(-1);
  assert.equal(confirm.props['aria-label'], '放弃修改');
  assert.ok(JSON.stringify(confirm).includes('确认放弃对常看书籍的修改？'));
  nodes(confirm).filter(node => node.type === 'button' && node.props.children.includes('放弃修改')).at(-1).props.onClick();
  assert.equal(drawer(), undefined);
  assert.equal(pinCalls(f).length, 1, '放弃不提交');
  // 没改动时直接关闭，不弹确认。
  await button(desks(f.render())[0], '换一本').props.onClick();
  button(drawer(), '取消').props.onClick();
  assert.equal(nodes(f.render()).some(node => node.type === 'dialog'), false);
  f.unmount();
});

test('首页“取消常看”立即生效并可撤销；“在书架中查看”进书架描边那本，常看栏原位显示两个栏位，书架里打开再关闭会重读书架，面包屑回首页', async () => {
  const a = shelfBook(1, { title: '极简项目管理', daily: true, progress: { last: 4, next: 5 }, chapters: 12 }), b = shelfBook(2, { title: '有效需求分析', daily: true, progress: { last: 2, next: 3 }, chapters: 18 }), c = shelfBook(3, { title: '用户故事地图' });
  const host = shelfHost([a, b, c]);
  const f = await fixture({ news: host.news, library: host.library });
  await button(f.render(), '知识卡片').props.onClick();
  await button(desks(f.render())[0], '取消常看').props.onClick();
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'library').at(-1), ['library', { action: 'update', id: a.id, daily: false }]);
  assert.deepEqual(f.calls.at(-1), ['news', { action: 'home' }]);
  assert.deepEqual(desks(f.render()).map(card => card.props.className), ['ww-desk-card ww-desk-wide'], '剩一本收成加宽卡');
  assert.ok(JSON.stringify(f.render()).includes('已取消常看《极简项目管理》'));
  assert.ok([...f.timers.values()].some(timer => timer.delay === 4000));
  await button(f.render(), '撤销').props.onClick();
  assert.deepEqual(pinCalls(f), [{ action: 'pins', ids: [a.id, b.id], expected: [b.id] }]);
  assert.equal(desks(f.render()).length, 2);
  await button(desks(f.render())[1], '在书架中查看').props.onClick();
  const view = () => nodes(f.render()).find(node => node.props?.className === 'ww-library');
  assert.ok(view(), '进书架页');
  const flashed = nodes(view()).filter(node => node.type === 'article' && node.props['data-flash']);
  assert.deepEqual(flashed.map(node => node.props.title), [b.title], '要找的那本描边提示');
  const nav = nodes(view()).find(node => node.props?.className === 'ww-crumbs');
  for (const content of ['知识卡片', '书架', '3']) assert.ok(JSON.stringify(nav).includes(content), content);
  const band = nodes(view()).find(node => node.props?.className === 'ww-pin-band');
  for (const content of ['常看', '2 / 2', '首页每天接着读这两本', '读到第 6 / 12 章 · 极简项目管理 第 6 章', '42%', '读到第 4 / 18 章', '17%']) assert.ok(JSON.stringify(band).includes(content), content);
  const slots = nodes(band).filter(node => node.props?.className === 'ww-pin-slot');
  assert.deepEqual(slots.map(slot => slot.props.key), [a.id, b.id]);
  assert.deepEqual(menuItems(slots[0]), ['换一本', '取消常看']);
  const ribbons = nodes(view()).filter(node => node.type === 'article' && nodes(node).some(child => child.props?.className === 'ww-ribbon')).map(node => node.props.title);
  assert.deepEqual(ribbons.sort(), [a.title, b.title].sort(), '常看书挂书签丝带');
  assert.ok(nodes(view()).filter(node => node.props?.className === 'ww-pin-badge').every(node => JSON.stringify(node).includes('常看')));
  const homes = () => f.calls.filter(([kind, input]) => kind === 'news' && input.action === 'home').length, homeRead = homes();
  await button(slots[0], '取消常看').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'update', id: a.id, daily: false }]);
  assert.equal(homes(), homeRead, '在书架里改常看只刷新书架');
  const emptySlot = nodes(view()).find(node => node.props?.className === 'ww-pin-slot ww-pin-empty');
  assert.ok(JSON.stringify(emptySlot).includes('＋ 设一本常看'), '栏位原位变成空栏位');
  assert.ok(JSON.stringify(view()).includes('1 / 2'));
  // 点栏位从上次读到的章打开；关闭阅读器重读书架，常看栏和书格进度原位更新。
  const slot = nodes(view()).find(node => node.props?.className === 'ww-pin-slot');
  await nodes(slot).find(node => node.props?.className === 'ww-pin-main').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'open', id: b.id, chapter: 3 }]);
  const lists = () => f.calls.filter(([kind, input]) => kind === 'library' && input.action === 'list').length, listed = lists();
  nodes(f.render()).find(node => node.type === 'dialog').props.onCancel({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(lists(), listed + 1, '在书架关闭阅读器重读书架');
  assert.ok(view(), '仍在书架页');
  await nodes(view()).find(node => node.props?.className === 'ww-crumb').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['news', { action: 'home' }]);
  assert.equal(view(), undefined);
  assert.equal(desks(f.render()).length, 1);
  f.unmount();
});

test('常看已满时设第三本弹出替换弹窗：不预选，选中后主按钮写明换下哪本，确认调用 pins 并可撤销；别处改过时弹窗留着并换成最新常看', async () => {
  const a = shelfBook(1, { title: '极简项目管理', daily: true, progress: { last: 5, next: 5 }, chapters: 12 }), b = shelfBook(2, { title: '有效需求分析', daily: true }), c = shelfBook(3, { title: '用户故事地图' });
  const host = shelfHost([a, b, c]);
  const f = await fixture({ news: host.news, library: host.library });
  await button(f.render(), '知识卡片').props.onClick();
  await button(f.render(), '打开书架').props.onClick();
  const card = title => nodes(f.render()).find(node => node.type === 'article' && node.props.className === 'ww-library-book' && node.props.title === title);
  assert.deepEqual(menuItems(card(c.title)), ['阅读', '设为常看', '编辑', '从书架删除']);
  assert.deepEqual(menuItems(card(a.title)), ['阅读', '取消常看', '编辑', '从书架删除']);
  button(card(c.title), '设为常看').props.onClick();
  assert.equal(f.calls.some(([kind, input]) => kind === 'library' && input.action === 'update'), false, '已满两本不先提交');
  const modal = () => nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === '常看书籍最多两本');
  const radios = () => nodes(modal()).filter(node => node.props?.role === 'radio');
  const primary = () => nodes(modal()).find(node => node.type === 'button' && node.props.className === 'ww-primary');
  assert.ok(JSON.stringify(modal()).includes('把《用户故事地图》设为常看，需要换下一本。换下的书留在书架上，阅读进度不变。'));
  assert.deepEqual(radios().map(radio => radio.props['aria-checked']), [false, false], '打开时不预选');
  assert.deepEqual(radios().map(radio => radio.props.tabIndex), [0, -1]);
  assert.ok(JSON.stringify(radios()[0]).includes('读到第 6 / 12 章'));
  assert.equal(primary().props.disabled, true); assert.ok(JSON.stringify(primary()).includes('选一本换下'));
  radios()[0].props.onClick();
  assert.ok(JSON.stringify(primary()).includes('换下《极简项目管理》')); assert.equal(primary().props.disabled, false);
  await primary().props.onClick();
  assert.deepEqual(pinCalls(f), [{ action: 'pins', ids: [b.id, c.id], expected: [a.id, b.id] }]);
  assert.equal(modal(), undefined);
  assert.ok(JSON.stringify(f.render()).includes('《用户故事地图》已设为常看，换下了《极简项目管理》'));
  assert.ok(nodes(card(c.title)).some(node => node.props?.className === 'ww-ribbon'));
  assert.equal(nodes(card(a.title)).some(node => node.props?.className === 'ww-ribbon'), false);
  await button(f.render(), '撤销').props.onClick();
  assert.deepEqual(pinCalls(f).at(-1), { action: 'pins', ids: [a.id, b.id], expected: [b.id, c.id] });
  // 别处改成了另外两本（仍满两本）：冲突提示，弹窗留着，选项换成最新常看，选择清空。
  const d = shelfBook(4, { title: '人月神话' });
  host.state.books.push(d);
  button(card(c.title), '设为常看').props.onClick();
  radios()[1].props.onClick();
  host.elsewhere = [a.id, d.id];
  await primary().props.onClick();
  assert.ok(JSON.stringify(f.render()).includes('常看书籍刚在别处改过，已重新读取'));
  assert.ok(modal(), '仍满两本时冲突后弹窗保持打开');
  assert.deepEqual(radios().map(radio => radio.props['aria-checked']), [false, false]);
  assert.ok(JSON.stringify(radios()).includes(a.title) && JSON.stringify(radios()).includes(d.title));
  // 再次冲突时别处已经取消到只剩一本：有空位了，不用再换下谁，弹窗关掉。
  radios()[0].props.onClick();
  host.elsewhere = [a.id];
  await primary().props.onClick();
  assert.ok(JSON.stringify(f.render()).includes('常看书籍刚在别处改过，已重新读取'));
  assert.equal(modal(), undefined, '有空位后冲突关掉弹窗');
  // 不满两本时“设为常看”立即生效，提示带撤销。
  await button(card(c.title), '设为常看').props.onClick();
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'library').at(-1), ['library', { action: 'update', id: c.id, daily: true }]);
  assert.ok(JSON.stringify(f.render()).includes('《用户故事地图》已设为常看'));
  f.unmount();
});

test('书架头行：查找按书名作者即时过滤，无结果可清除；排序字段与方向记在本机并在下次打开时沿用，切换字段方向回到默认', async () => {
  const a = shelfBook(1, { title: '极简项目管理', author: '郭致星', progress: { last: 2, next: 3 } }), b = shelfBook(2, { title: '有效需求分析', author: '徐锋', progress: { last: 9, next: 10 } }), c = shelfBook(3, { title: '用户故事地图', author: 'Jeff Patton' });
  const host = shelfHost([a, b, c]), storage = new Map();
  const f = await fixture({ news: host.news, library: host.library, storage });
  await button(f.render(), '知识卡片').props.onClick();
  assert.equal(storage.size, 0, '首页不写本机存储');
  await button(f.render(), '打开书架').props.onClick();
  const view = () => nodes(f.render()).find(node => node.props?.className === 'ww-library');
  const order = () => nodes(view()).filter(node => node.type === 'article' && node.props.className === 'ww-library-book').map(node => node.props.title);
  const control = (type, test) => nodes(view()).find(node => node.type === type && test(node.props));
  assert.deepEqual(order(), [c.title, b.title, a.title], '默认最近加入、从新到旧');
  assert.equal(control('button', props => props.className === 'ww-library-dir').props.title, '从新到旧');
  assert.equal(control('button', props => props['aria-label'] === '管理分组').props.className, 'ww-icon-button', '管理分组是齿轮图标按钮');
  const search = () => control('input', props => props.type === 'search');
  assert.equal(search().props.placeholder, '查找书名或作者');
  search().props.onChange({ target: { value: 'jeff' } });
  assert.deepEqual(order(), [c.title], '作者不分大小写');
  search().props.onChange({ target: { value: '需求分析2' } });
  assert.deepEqual(order(), []);
  assert.ok(JSON.stringify(view()).includes('没有找到“需求分析2”'));
  assert.ok(nodes(view()).some(node => node.props?.className === 'ww-library-add'), '导入卡始终在最后一格');
  let escaped = false;
  search().props.onKeyDown({ key: 'Escape', preventDefault() { escaped = true; } });
  assert.equal(escaped, true); assert.deepEqual(order(), [c.title, b.title, a.title], 'Esc 清空查找');
  search().props.onChange({ target: { value: '需求分析2' } });
  button(view(), '清除查找').props.onClick();
  assert.equal(search().props.value, '');
  control('select', props => props.className === 'ww-library-sort').props.onChange({ target: { value: 'title' } });
  assert.deepEqual(order(), [a.title, c.title, b.title], '书名按拼音');
  assert.equal(control('button', props => props.className === 'ww-library-dir').props.title, '按书名拼音从前往后');
  assert.equal(storage.get('whalewing:cards:library-sort'), JSON.stringify({ field: 'title', dir: 'asc' }));
  control('button', props => props.className === 'ww-library-dir').props.onClick();
  assert.deepEqual(order(), [b.title, c.title, a.title]);
  control('select', props => props.className === 'ww-library-sort').props.onChange({ target: { value: 'progress' } });
  assert.deepEqual(order(), [b.title, a.title, c.title], '换字段方向回到默认：读得多的在前');
  assert.equal(control('button', props => props.className === 'ww-library-dir').props.title, '读得多的在前');
  f.unmount();
  const g = await fixture({ news: host.news, library: host.library, storage });
  await button(g.render(), '知识卡片').props.onClick(); await button(g.render(), '打开书架').props.onClick();
  assert.deepEqual(nodes(g.render()).filter(node => node.type === 'article' && node.props.className === 'ww-library-book').map(node => node.props.title), [b.title, a.title, c.title], '下次打开沿用本机记下的排序');
  g.storage.set('whalewing:cards:library-sort', '{"field":"bogus"}');
  g.unmount();
  const h = await fixture({ news: host.news, library: host.library, storage });
  await button(h.render(), '知识卡片').props.onClick(); await button(h.render(), '打开书架').props.onClick();
  assert.deepEqual(nodes(h.render()).filter(node => node.type === 'article' && node.props.className === 'ww-library-book').map(node => node.props.title), [c.title, b.title, a.title], '本机记录不合法时回到默认');
  h.unmount();
});

test('显示书的地方一律用 BookCover：有原封面读 cover 缩略图，读取中只铺书色底，没有或读不出来才用书名和作者生成', async () => {
  const withCover = { ...dailyBook, title: '有效需求分析（第2版）', cover: true }, plain = { ...dailyBook, id: '00000000-0000-4000-8000-000000000002', title: '极简项目管理', author: '郭致星', cover: false }, broken = { ...dailyBook, id: '00000000-0000-4000-8000-000000000003', title: '重构（第2版）', author: 'Martin Fowler', cover: true };
  let books = [plain, withCover];
  const f = await fixture({ expand: ['BookCover'], news: async () => ({ ok: true, value: newsHomeResult([], { books, daily: books.length, total: 3 }) }), library: async input => {
    assert.equal(input.action, 'image'); assert.equal(input.name, 'cover');
    return input.id === withCover.id ? { ok: true, value: { image: { mime: 'image/webp', data: 'Q09WRVI=' } } } : { ok: false, error: { code: 'LIBRARY_MISSING', message: '封面不见了' } };
  } });
  await button(f.render(), '知识卡片').props.onClick();
  const covers = () => nodes(f.render()).filter(node => typeof node.props?.className === 'string' && node.props.className.startsWith('ww-cover ww-cover-'));
  assert.deepEqual(covers().map(cover => cover.props.className), ['ww-cover ww-cover-l', 'ww-cover ww-cover-l']);
  assert.ok(JSON.stringify(covers()[0]).includes('极简项目管理') && JSON.stringify(covers()[0]).includes('郭致星'), '没有封面：书名和作者生成');
  assert.equal(nodes(covers()[1]).some(node => node.type === 'strong'), false, '原封面读取中不先闪生成封面');
  f.flushEffects(); await new Promise(setImmediate);
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'library'), [['library', { action: 'image', id: withCover.id, name: 'cover' }]], '只为有封面的书读缩略图');
  assert.ok(nodes(covers()[1]).some(node => node.type === 'img' && node.props.src === 'data:image/webp;base64,Q09WRVI='), '有封面就用原封面');
  books = [broken];
  await button(f.render(), '刷新').props.onClick();
  f.render(); f.flushEffects(); await new Promise(setImmediate);
  assert.ok(JSON.stringify(covers()[0]).includes('重构（第2版）') && !nodes(covers()[0]).some(node => node.type === 'img'), '原封面读不出来时改用生成封面');
  f.unmount();
});

test('首页一次性提示与异常书卡：旧数据收成两本时提示 8 秒带“打开书架”；书架读不出来换成纸面提示卡；副本丢失的书不可点，只能取消常看或删除', async () => {
  let learning = { books: [], daily: 0, notice: { kept: ['极简项目管理', '有效需求分析'], released: 3 } };
  const missing = { id: '00000000-0000-4000-8000-000000000009', title: '人月神话', author: 'Brooks', cover: false, chapters: 19, finished: false, missing: true, next: [] };
  const lost = shelfBook(9, { id: missing.id, title: '人月神话', daily: true });
  const f = await fixture({ news: async () => ({ ok: true, value: newsHomeResult([], learning) }), library: async input => {
    if (input.action === 'list') return { ok: true, value: { library: { groups: [], books: [lost] } } };
    if (input.action === 'remove') return { ok: true, value: { removed: input.id, library: { groups: [], books: [] } } };
    throw new Error('unexpected library action ' + input.action);
  } });
  await button(f.render(), '知识卡片').props.onClick();
  assert.ok(JSON.stringify(f.render()).includes('常看书籍改为最多两本：保留《极简项目管理》《有效需求分析》，其余 3 本仍在书架'));
  assert.ok([...f.timers.values()].some(timer => timer.delay === 8000), '一次性提示停留 8 秒');
  await button(f.render(), '打开书架').props.onClick();
  assert.ok(nodes(f.render()).some(node => node.props?.className === 'ww-library'));
  await nodes(f.render()).find(node => node.props?.className === 'ww-crumb').props.onClick();
  learning = { books: [], daily: 0, issue: '读取 library.json 失败' };
  await button(f.render(), '刷新').props.onClick();
  const issue = nodes(f.render()).find(node => node.props?.className === 'ww-desk-issue');
  assert.ok(JSON.stringify(issue).includes('书架没读出来：读取 library.json 失败'));
  assert.equal(nodes(f.render()).some(node => node.props?.className === 'ww-desk-add'), false, '读取失败不显示占位卡');
  assert.ok(nodes(f.render()).some(node => node.props?.role === 'alert' && JSON.stringify(node).includes('书架没读出来')), '右上角同时提示');
  const reads = f.calls.length;
  await button(issue, '重新读取').props.onClick();
  assert.deepEqual(f.calls.slice(reads), [['news', { action: 'home' }]]);
  learning = { books: [missing], daily: 1, total: 1 };
  await button(f.render(), '刷新').props.onClick();
  const [card] = desks(f.render());
  assert.equal(card.props.className, 'ww-desk-card ww-desk-missing ww-desk-wide');
  assert.ok(JSON.stringify(card).includes('《人月神话》的阅读副本不见了'));
  assert.equal(nodes(card).find(node => node.props?.className === 'ww-desk-main').props.role, undefined, '整卡不可点');
  assert.deepEqual(menuItems(card), ['取消常看', '从书架删除']);
  button(card, '从书架删除').props.onClick();
  const confirm = nodes(f.render()).filter(node => node.type === 'dialog').at(-1);
  assert.ok(JSON.stringify(confirm).includes('从书架删除《人月神话》？') && JSON.stringify(confirm).includes('它也会从首页常看里移除。'));
  learning = { books: [], daily: 0, total: 0 };
  await nodes(confirm).filter(node => node.type === 'button' && node.props.children.includes('从书架删除')).at(-1).props.onClick();
  assert.deepEqual(f.calls.slice(-2), [['library', { action: 'remove', id: missing.id }], ['news', { action: 'home' }]], '在首页删除后重读首页，不自动补位');
  assert.ok(nodes(f.render()).some(node => node.props?.className === 'ww-desk-add'));
  f.unmount();
});

test('书架：全部与分组筛选，分块导入到当前分组并自动补上常看（提示里可“不放首页”），编辑抽屉不再设常看，删除确认、分组管理和在线书目下载（常看已满时提示“设为常看”）', async () => {
  const groupId = '00000000-0000-4000-8000-0000000000a1';
  const other = { ...libraryBook, id: '00000000-0000-4000-8000-000000000002', title: '极简项目管理', author: '郭致星', daily: false, groups: [], addedAt: '2026-10-21T02:00:00.000Z', progress: { last: 0, next: 0 } };
  let shelf = { groups: [{ id: groupId, name: '工作' }], books: [{ ...libraryBook, groups: [groupId] }, other] };
  const imported = { ...other, id: '00000000-0000-4000-8000-000000000003', title: '新书', groups: [groupId], daily: true, addedAt: '2026-10-23T02:00:00.000Z' };
  const entry = { id: 'open-book', title: '开放教材', author: 'OpenStax', description: '开放许可', category: '管理', format: 'MD', size: 2048, url: 'https://raw.githubusercontent.com/gwen-liu/whalewing-library/main/books/open-book.md', sha256: 'a'.repeat(64), license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: '© OpenStax', installed: null };
  const ok = value => ({ ok: true, value });
  const f = await fixture({ news: async () => ok(newsHomeResult()), library: async input => {
    if (input.action === 'list') return ok({ library: shelf });
    if (input.action === 'uploadStart') return ok({ upload: { id: '00000000-0000-4000-8000-0000000000f1', chunk: 2 * 1024 * 1024, received: 0 } });
    if (input.action === 'uploadChunk') return ok({ upload: { id: input.upload, chunk: 2 * 1024 * 1024, received: input.offset + Buffer.from(input.data, 'base64').length } });
    if (input.action === 'uploadFinish') { shelf = { ...shelf, books: [...shelf.books, imported] }; return ok({ book: imported, library: shelf }); }
    if (input.action === 'update') { shelf = { ...shelf, books: shelf.books.map(book => book.id === input.id ? { ...book, ...(input.title ? { title: input.title } : {}), ...(Object.hasOwn(input, 'daily') ? { daily: input.daily } : {}) } : book) }; return ok({ book: shelf.books.find(book => book.id === input.id), library: shelf }); }
    if (input.action === 'remove') { shelf = { ...shelf, books: shelf.books.filter(book => book.id !== input.id) }; return ok({ removed: input.id, library: shelf }); }
    if (input.action === 'saveGroup') { const group = { id: '00000000-0000-4000-8000-0000000000a2', name: input.name }; shelf = { ...shelf, groups: [...shelf.groups, group] }; return ok({ group, library: shelf }); }
    if (input.action === 'catalog') return ok({ catalog: { source: 'https://raw.githubusercontent.com/gwen-liu/whalewing-library/main/catalog.json', fetchedAt: '2026-10-22T02:00:00.000Z', error: null, entries: [entry] } });
    if (input.action === 'download') { const book = { ...other, id: '00000000-0000-4000-8000-000000000004', title: '开放教材', groups: input.groups ?? [], daily: false }; shelf = { ...shelf, books: [...shelf.books, book] }; return ok({ book, library: shelf }); }
    throw new Error('unexpected library action ' + input.action);
  } });
  await button(f.render(), '知识卡片').props.onClick();
  await button(f.render(), '打开书架').props.onClick();
  const view = () => nodes(f.render()).find(node => node.props?.className === 'ww-library');
  const chips = () => nodes(view()).filter(node => node.props.className === 'ww-library-chip');
  const books = () => nodes(view()).filter(node => node.type === 'article' && node.props.className === 'ww-library-book').map(node => node.props.title);
  assert.deepEqual(chips().map(chip => chip.props.children[0]), ['全部', '工作']);
  assert.equal(chips()[0].props['aria-pressed'], true, '默认分组是“全部”');
  assert.deepEqual(books(), ['有效需求分析', '极简项目管理'], '最近加入在前');
  chips()[1].props.onClick();
  assert.deepEqual(books(), ['有效需求分析']);
  const input = nodes(view()).find(node => node.type === 'input' && node.props.type === 'file');
  for (const extension of ['.epub', '.txt', '.pdf', '.mobi', '.azw3', '.docx', '.fb2']) assert.ok(input.props.accept.split(',').includes(extension), extension);
  const event = { target: { files: [new File([new Uint8Array(3 * 1024 * 1024 + 5)], '新书.txt')], value: 'C:\\fakepath\\新书.txt' } };
  await input.props.onChange(event);
  assert.equal(event.target.value, '', '选完文件清空，便于再次选同一本');
  const uploads = f.calls.filter(([kind, item]) => kind === 'library' && item.action.startsWith('upload')).map(([, item]) => item);
  assert.deepEqual(uploads.map(item => [item.action, item.offset ?? null]), [['uploadStart', null], ['uploadChunk', 0], ['uploadChunk', 2 * 1024 * 1024], ['uploadFinish', null]]);
  assert.deepEqual(uploads[0], { action: 'uploadStart', name: '新书.txt', size: 3 * 1024 * 1024 + 5 });
  assert.deepEqual(uploads.at(-1).groups, [groupId], '在分组里导入的书直接放进这个分组');
  assert.equal(Object.hasOwn(uploads.at(-1), 'daily'), false, '是否补上常看由书架按空位决定');
  assert.deepEqual(books(), ['新书', '有效需求分析']);
  assert.ok(JSON.stringify(f.render()).includes('已导入《新书》，已放到首页常看'));
  assert.ok([...f.timers.values()].some(timer => timer.delay === 8000));
  await button(f.render(), '不放首页').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'update', id: imported.id, daily: false }], '“不放首页”就是取消常看');
  assert.ok(JSON.stringify(f.render()).includes('已取消常看《新书》'));
  const card = nodes(view()).find(node => node.type === 'article' && node.props.title === '新书');
  button(card, '编辑').props.onClick();
  assert.equal(JSON.stringify(nodes(f.render()).find(node => node.type === 'dialog' && node.props['aria-label'] === '编辑书籍信息')).includes('每日学习'), false, '编辑抽屉不再设常看');
  taskField(f, '书名', '改过的书名');
  await button(f.render(), '保存书籍信息').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'update', id: imported.id, title: '改过的书名', author: imported.author, groups: [groupId] }]);
  button(nodes(view()).find(node => node.type === 'article' && node.props.title === '改过的书名'), '从书架删除').props.onClick();
  const confirm = nodes(f.render()).filter(node => node.type === 'dialog').at(-1);
  assert.ok(JSON.stringify(confirm).includes('你的原文件不受影响'));
  assert.equal(JSON.stringify(confirm).includes('首页常看'), false, '不是常看书时不提首页');
  await nodes(confirm).filter(node => node.type === 'button' && node.props.children.includes('从书架删除')).at(-1).props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'remove', id: imported.id }]);
  nodes(view()).find(node => node.type === 'button' && node.props['aria-label'] === '管理分组').props.onClick();
  taskField(f, '分组名称', ' 学习 ');
  await button(f.render(), '添加分组').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'saveGroup', name: '学习' }]);
  assert.deepEqual(chips().map(chip => chip.props.children[0]), ['全部', '工作', '学习']);
  await button(f.render(), '在线书目').props.onClick();
  const catalog = nodes(f.render()).filter(node => node.type === 'dialog').at(-1);
  assert.ok(JSON.stringify(catalog).includes('开放教材'));
  assert.ok(nodes(catalog).some(node => node.type === 'a' && node.props.href === entry.licenseUrl));
  shelf = { ...shelf, books: shelf.books.map(book => ({ ...book, daily: true })) };
  await button(catalog, '下载到书架').props.onClick();
  assert.deepEqual(f.calls.at(-1), ['library', { action: 'download', entry: 'open-book', groups: [groupId] }]);
  assert.ok(JSON.stringify(f.render()).includes('已在书架'));
  assert.ok(JSON.stringify(f.render()).includes('已下载《开放教材》，常看已满两本'));
  button(f.render(), '设为常看').props.onClick();
  assert.ok(nodes(f.render()).some(node => node.type === 'dialog' && node.props['aria-label'] === '常看书籍最多两本'), '已满时从提示里设常看走替换弹窗');
  assert.equal(f.calls.some(([kind]) => ['create', 'prompt', 'knowledge'].includes(kind)), false);
  f.unmount();
});

test('AI网页消费正式RPC，十个默认图标不可删除，自定义仅名字网址完成增改删',async()=>{
 let entries=[...aiWebEntries];const requests=[];
 const f=await fixture({expand:['AiWebView'],aiWeb:async input=>{requests.push(input);if(input.action==='save'){const entry={...input.entry,id:input.id,revision:input.expectedRevision+1,builtin:false,provider:'',keywords:''};entries=[...entries.filter(item=>item.id!==entry.id),entry];}if(input.action==='remove')entries=entries.filter(item=>item.id!==input.id);return {ok:true,value:{entries}};}});
 f.render();f.flushEffects();await new Promise(setImmediate);assert.deepEqual(requests,[]);await button(f.render(),'AI 网页').props.onClick();f.render();f.flushEffects();await new Promise(setImmediate);
 const view=()=>nodes(f.render()).find(node=>node.props.className==='ww-ai-web');let cards=nodes(view()).filter(node=>node.type==='article');assert.equal(cards.length,10);
 for(const card of cards){assert.ok(nodes(card).some(node=>node.type==='img'&&node.props.src.startsWith('data:image/')));assert.equal(nodes(card).some(node=>node.type==='button'&&['编辑','删除'].includes(node.props.children[0])),false);}
 nodes(view()).find(node=>node.type==='button'&&node.props.className==='ww-card ww-add-card').props.onClick();taskField(f,'名字','自定义入口');taskField(f,'网址','https://example.org/');let dialog=nodes(view()).find(node=>node.type==='dialog');await nodes(dialog).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
 assert.deepEqual(requests.at(-1).entry,{name:'自定义入口',url:'https://example.org/',description:'',avatar:null});assert.equal(requests.at(-1).expectedRevision,0);
 let custom=nodes(view()).find(node=>node.type==='article'&&node.props.key===entries.at(-1).id);assert.ok(nodes(custom).some(node=>node.type==='span'&&node.props.children.includes('自')));assert.equal(nodes(custom).some(node=>node.type==='p'&&node.props.children[0]===''),false);
 button(custom,'编辑').props.onClick();taskField(f,'描述（选填）','用户自己的描述');dialog=nodes(view()).find(node=>node.type==='dialog');await nodes(dialog).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});assert.equal(requests.at(-1).expectedRevision,1);
 custom=nodes(view()).find(node=>node.type==='article'&&node.props.key===entries.at(-1).id);assert.ok(JSON.stringify(custom).includes('用户自己的描述'));button(custom,'删除').props.onClick();dialog=nodes(view()).find(node=>node.type==='dialog');await nodes(dialog).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(requests.at(-1).action,'remove');assert.equal(requests.at(-1).expectedRevision,2);assert.equal(entries.length,10);assert.equal(f.calls.some(([kind])=>['create','prompt','knowledge'].includes(kind)),false);f.unmount();
});

/** 浏览器解码对象由测试平台提供；共享decoder及两个真实上传handler仍正常执行。 */
test('专家和AI实际上传入口共同拒收任一边300px，并保留先前299px头像及释放bitmap',async t=>{
 const originals=new Map(['FileReader','createImageBitmap'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));const decoded=[];
 t.after(()=>{for(const [key,descriptor]of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 globalThis.FileReader=class{readAsDataURL(file){this.result=file.data;this.onload();}abort(){this.onabort?.();}};
 globalThis.createImageBitmap=async file=>{const bitmap={width:file.width,height:file.height,closed:false,close(){this.closed=true;}};decoded.push(bitmap);return bitmap;};
 for(const kind of ['expert','ai']){
  const f=await fixture({expand:kind==='expert'?['ExpertEditor']:['AiWebView']});
  if(kind==='expert')nodes(f.render()).find(node=>node.props.className==='ww-card ww-add-card').props.onClick();else{await button(f.render(),'AI 网页').props.onClick();f.render();f.flushEffects();await new Promise(setImmediate);nodes(f.render()).find(node=>node.type==='button'&&node.props.className==='ww-card ww-add-card').props.onClick();}
  f.render();f.flushEffects();await new Promise(setImmediate);
  const dialog=()=>nodes(f.render()).find(node=>node.type==='dialog');const input=()=>nodes(dialog()).find(node=>node.type==='input'&&node.props.type==='file'&&node.props.accept.startsWith('image/'));
  const good={type:'image/png',size:3,data:'data:image/png;base64,AQID',width:299,height:299};await input().props.onChange({target:{files:[good],value:'selected'}});assert.ok(nodes(dialog()).some(node=>node.type==='img'&&node.props.src===good.data));
  for(const [width,height]of [[300,299],[299,300]]){await input().props.onChange({target:{files:[{...good,width,height,data:'data:image/png;base64,BAUG'}],value:'selected'}});assert.ok(JSON.stringify(f.render()).includes('最大 299×299'));assert.ok(nodes(dialog()).some(node=>node.type==='img'&&node.props.src===good.data));}
  assert.equal(f.calls.some(([kind,input])=>kind==='aiWeb'&&input.action==='save'),false);f.unmount();
 }
 assert.equal(decoded.length,6);assert.ok(decoded.every(bitmap=>bitmap.closed));
});

test('原生DSH没有新会话专家位置时，专家选择放到输入框左侧，标题栏不重复', async () => {
  const props = { sessionId: 'blank', useProjection: () => null, useSessions: select => select({ byId: {} }) };
  const native = await fixture({ missingSlots: ['conversation.hero.actions'] });
  const picker = native.registrations.get('conversation.input.left').find(entry => entry.options.id === 'whalewing-expert-picker');
  native.entries.set('conversation.input.left', picker);
  assert.ok(nodes(native.render('conversation.input.left', props)).some(node => node.props?.popover === 'auto'));
  assert.equal(native.render('conversation.session.header.actions', props), null);
  const adapted = await fixture();
  adapted.entries.set('conversation.input.left', adapted.registrations.get('conversation.input.left').find(entry => entry.options.id === 'whalewing-expert-picker'));
  assert.equal(adapted.render('conversation.input.left', props), null);
  assert.ok(nodes(adapted.render('conversation.session.header.actions', props)).some(node => node.props?.popover === 'auto'));
});

test('原生DSH打开AI网页：在专用「AI 网页」会话的右侧浏览器打开，同一个AI复用标签', async () => {
  let mountedId; const tabs = [], opened = [], focused = []; let expanded = false;
  const sidebar = { mounted: { getSnapshot: () => mountedId }, openTab: (...args) => { opened.push(args); tabs.push('tab-' + opened.length); }, tabsIn: () => tabs.map(id => ({ id, kind: 'browser' })), focus: id => focused.push(id), isExpanded: () => expanded, toggleExpanded: () => { expanded = !expanded; } };
  const f = await fixture({ sidebarRight: sidebar });
  f.ctx.uiWorkspace.openSession = id => { mountedId = id; f.calls.push(['open', id]); };
  assert.equal(f.clients['ai-web'].supportsInlinePresentation(), false);
  await f.clients['ai-web'].openAiInConversation('https://chat.deepseek.com/', 'deepseek');
  await f.clients['ai-web'].openAiInConversation('https://chat.deepseek.com/', 'deepseek');
  assert.equal(opened.length, 1); assert.deepEqual(focused, ['tab-1']); assert.equal(expanded, true);
  const created = f.calls.filter(([kind]) => kind === 'create');
  assert.equal(created.length, 1); assert.match(created[0][1].sessionId, /^whalewing-aiweb-/);
  assert.ok(f.calls.some(([kind, request]) => kind === 'rename' && request.title === 'AI 网页'));
  assert.equal(f.calls.filter(([kind]) => kind === 'open').every(([, id]) => id === created[0][1].sessionId), true);
});

test('外部页签使用同一列表插槽，按order动态插入并只渲染选中内容', async () => {
  const f = await fixture({ expand: ['ExternalView'] });
  let title = '扩展报表', shownWorkbench, refreshed = 0;
  function ExternalView({ workbench, active }) {
    shownWorkbench = workbench;
    f.react.useLayoutEffect(() => workbench.onRefresh(() => { refreshed++; }), [workbench]);
    return f.react.createElement('section', { 'data-external': true }, active ? '扩展内容' : '隐藏');
  }
  const frame = featureFrame(1); frame.features.push({ id: 'reports', instance: 100, kind: 'extension', api: 1, package: 'reports', skills: [] });
  await f.featureUpdate(frame);
  const off = f.ctx.slots.register({ name: 'whalewing.workbench.tab', id: 'reports', order: 75, label: () => title }, ExternalView);
  let tree = f.render();
  assert.deepEqual(tabLabels(tree).slice(-3), ['知识卡片', '扩展报表', '模型世界']);
  assert.equal(nodes(tree).some(node => node.props['data-external']), false);
  await button(tree, '扩展报表').props.onClick();
  assert.ok(nodes(f.render()).some(node => node.props.children.includes('扩展内容')));
  assert.equal(refreshed, 1);
  for (const method of ['run', 'notify', 'guardLeave', 'onRefresh', 'openTab', 'manageFeatures', 'explainError']) assert.equal(typeof shownWorkbench[method], 'function');
  await button(f.render(), '刷新').props.onClick(); assert.equal(refreshed, 2);
  const beforeLocale = f.ctx.whalewingWorkbench.internal.tabSnapshot();
  title = 'Report'; f.localeListeners.forEach(listener => listener());
  assert.notEqual(f.ctx.whalewingWorkbench.internal.tabSnapshot(), beforeLocale); assert.ok(button(f.render(), 'Report'));
  await button(f.render(), '专家团队').props.onClick(); off();
  assert.equal(nodes(f.render()).some(node => node.props['data-tab'] === 'reports'), false);
  f.unmount();
});

test('隐藏页签的公开刷新与离开检查固定归属，不覆盖当前页签', async () => {
  const f = await fixture(); f.render();
  await button(f.render(), '个人知识').props.onClick();
  const entries = f.registrations.get('whalewing.workbench.tab');
  const knowledge = entries.find(entry => entry.options.id === 'knowledge');
  let pageWorkbench;
  const original = knowledge.Component;
  knowledge.Component = function KnowledgeView(props) { pageWorkbench = props.workbench; return original(props); };
  f.render(); await button(f.render(), '技能成长').props.onClick();
  let refreshed = 0, guarded = 0;
  const offRefresh = pageWorkbench.onRefresh(() => { refreshed++; });
  const offGuard = pageWorkbench.guardLeave(() => { guarded++; return '知识草稿保留'; });
  await button(f.render(), '刷新').props.onClick();
  assert.equal(refreshed, 0);
  await button(f.render(), '专家团队').props.onClick(); assert.equal(guarded, 0);
  await button(f.render(), '个人知识').props.onClick(); assert.equal(refreshed, 1);
  await button(f.render(), '技能成长').props.onClick(); assert.equal(guarded, 1);
  offRefresh(); offGuard(); f.unmount();
});

test('公共run同步禁用切换并传播停止信号，迟到结果不提交', async () => {
  const f = await fixture(); f.render();
  const held = Promise.withResolvers(); let signal, adopted = false;
  const pending = f.ctx.whalewingWorkbench.run(async value => { signal = value; await held.promise; return () => { adopted = true; }; });
  assert.equal(button(f.render(), '个人知识').props.disabled, true);
  button(f.render(), '停止等待结果').props.onClick(); assert.equal(signal.aborted, true);
  held.resolve(); await pending;
  assert.equal(adopted, false); assert.equal(button(f.render(), '个人知识').props.disabled, false);
  f.unmount();
});

test('主面板卸载与外壳导航布局共同复位，重新进入可重新加载页签', async () => {
  const f = await fixture();
  await button(f.render(), '个人知识').props.onClick();
  button(f.render(), '打开小鲸助手').props.onClick();
  button(f.render(), '停靠').props.onClick();
  assert.ok(nodes(f.render()).some(node => node.props.className === 'ww-workspace ww-workspace-dock'));
  f.unmount();
  const tree = f.render();
  assert.equal(nodes(tree).find(node => node.props['data-tab'] === 'experts').props['aria-pressed'], true);
  assert.ok(button(tree, '打开小鲸助手'));
  assert.ok(nodes(tree).some(node => node.props.className === 'ww-workspace ww-workspace-bubble'));
  const before = f.calls.filter(([kind]) => kind === 'knowledge').length;
  await button(f.render(), '个人知识').props.onClick();
  assert.ok(f.calls.filter(([kind]) => kind === 'knowledge').length > before);
  f.unmount();
});

test('恢复弹窗真实重建并回读工作台身份，然后才继续当前页刷新', async () => {
  const key = 'whalewing:workbench:http://fixture.local';
  const f = await fixture({ storage: new Map([[key, 'foreign-session']]), existing: new Map([['foreign-session', false]]) });
  f.render();
  await f.ctx.whalewingWorkbench.run(signal => f.workbenchSession.ensureWorkbench(signal));
  assert.ok(nodes(f.render()).some(node => node.props.children.includes('foreign-session')));
  const prepare = nodes(f.render()).find(node => node.type === 'button' && node.props.className === 'ww-primary' && node.props.children.includes('重新准备知识工作台'));
  assert.ok(prepare); await prepare.props.onClick();
  const id = f.storage.get(key);
  assert.notEqual(id, 'foreign-session'); assert.equal(f.existing.get(id), true);
  assert.equal(f.existing.get('foreign-session'), false);
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
  assert.ok(f.calls.some(([kind, value]) => kind === 'confirm' && value === id));
  assert.equal(f.ctx.whalewingWorkbench.internal.snapshot().recoverySession, '');
  f.unmount();
});

for (const [label, method, reply] of [
  ['技能成长', 'skillLibrary', input => ({ ok: true, value: { entries: [], offset: 0, total: 0, truncated: false } })],
  ['定时任务', 'automation', input => taskCatalog()],
  ['知识卡片', 'news', input => ({ ok: true, value: newsHomeResult() })],
]) test(`${label}读失败的恢复动作绑定原页，切页后不刷新其他领域`, async () => {
  let failed = true, reads = 0;
  const f = await fixture({ [method]: async input => { reads++; if (failed) return { ok: false, error: { code: 'offline', message: '本页读取中断' } }; return reply(input); } });
  await button(f.render(), label).props.onClick();
  const retry = button(f.render(), '重试').props.onClick;
  failed = false;
  await button(f.render(), '专家团队').props.onClick();
  const before = reads; await retry();
  assert.ok(reads > before);
  assert.equal(nodes(f.render()).find(node => node.props['data-tab'] === 'experts').props['aria-pressed'], true);
  f.unmount();
});

test('专家后台读取失败的重试仍属于专家，不按点击时的页签猜测', async () => {
  const held = Promise.withResolvers(); let reads = 0, skills = 0;
  const f = await fixture({ experts: async input => { assert.equal(input.action, 'list'); reads++; return reads === 2 ? held.promise : { ok: true, value: { experts: roles, deleted: [] } }; }, skillLibrary: async input => { skills++; return { ok: true, value: { entries: [], offset: 0, total: 0, truncated: false } }; } });
  f.render(); f.flushEffects();
  await button(f.render(), '技能成长').props.onClick();
  held.resolve({ ok: false, error: { code: 'offline', message: '专家读取中断' } }); await new Promise(setImmediate);
  const before = skills;
  await button(f.render(), '重试').props.onClick();
  assert.equal(reads, 3); assert.equal(skills, before);
  assert.equal(nodes(f.render()).find(node => node.props['data-tab'] === 'skills').props['aria-pressed'], true);
  f.unmount();
});


// 2026-10-25 改版：标志、页签和“…”同在一行，“管理功能”“刷新”收进“…”；没有可用动作时不出现空的“…”。
test('工作台页头一行排开，无刷新动作时不出现空的更多菜单', async () => {
  const f = await fixture();
  const first = f.render();
  const header = tree => nodes(tree).find(node => node.type === 'header' && node.props.className === 'ww-header ww-workbench-header');
  const menu = tree => nodes(header(tree)).find(node => node.props?.iconOnly && node.props?.label === '更多操作');
  assert.ok(header(first)); assert.ok(menu(first)); assert.ok(button(menu(first), '刷新'));
  assert.ok(nodes(header(first)).some(node => node.type === 'nav' && node.props.className === 'ww-tabs'), '页签在页头这一行里');
  const css = nodes(first).find(node => node.type === 'style').props.children[0];
  assert.match(css, /\.ww-page>\.ww-workbench-header\{display:flex;[^}]*min-height:52px/);
  await button(first, 'AI 网页').props.onClick();
  const second = f.render(); assert.ok(header(second));
  assert.equal(menu(second), undefined);
  assert.equal(nodes(second).filter(node => node.props.className === 'ww-header ww-workbench-header').length, 1);
  f.unmount();
});

// 开关验收只消费真实登记帧，不把个人技能库当作 DSH 的活动技能目录。
const featureFrame = (revision, omitted = [], errors = {}) => ({ revision, features: parts.filter(part => !omitted.includes(part.id)).map(part => ({ instance: parts.indexOf(part) + 1, id: part.id, kind: part.kind, api: 1, package: 'dsh-whalewing', skills: [], ...(errors[part.id] ? { error: errors[part.id] } : {}) })) });
const tabIds = f => nodes(f.render()).filter(node => node.props?.['data-tab']).map(node => node.props['data-tab']);

test('首帧之前只有底座，首帧完整列表驱动四个可选的Remote与页签', async () => {
  let first;
  const f = await fixture({ workbenchRemote: { async *watchFeatures(signal) { yield await new Promise(resolve => { first = resolve; }); await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); } } });
  assert.deepEqual(tabIds(f), ['experts', 'knowledge', 'skills', 'schedule']);
  assert.equal(f.remoteMounts.some(([kind, name]) => kind === 'mount' && name === 'whalewingAiWeb'), false);
  first(featureFrame(0)); await f.settlePlugins();
  assert.deepEqual(tabIds(f), ['experts', 'aiWeb', 'knowledge', 'skills', 'schedule', 'toolbox', 'news', 'models']);
  assert.equal(f.remoteMounts.filter(([kind, name]) => kind === 'mount' && name === 'whalewingAiWeb').length, 1);
  for (const dispose of f.disposed) await dispose();
});

test('四可选关闭撤销全部页签和AI工具栏，再开只注册一次且不清员工数据', async () => {
  const f = await fixture();
  await f.featureUpdate(featureFrame(1, ['ai-web', 'toolbox', 'cards', 'model-world']));
  assert.deepEqual(tabIds(f), ['experts', 'knowledge', 'skills', 'schedule']);
  assert.equal(f.registrations.get('browser.toolbar.actions').length, 0);
  for (const name of ['whalewingAiWeb', 'whalewingCards', 'whalewingModelWorld']) assert.equal(f.remoteMounts.filter(([kind, value]) => kind === 'unmount' && value === name).length, 1);
  assert.equal(f.calls.some(([kind]) => ['news', 'world', 'aiWeb'].includes(kind)), false);
  await f.featureUpdate(featureFrame(2));
  assert.equal(f.registrations.get('browser.toolbar.actions').length, 1);
  assert.equal(tabIds(f).length, 8);
  assert.equal(f.remoteMounts.filter(([kind, name]) => kind === 'mount' && name === 'whalewingAiWeb').length, 2);
  f.unmount();
});

test('关闭正等待的可选功能撤销作用域、解除busy并回专家，迟到任务和旧重试失效', async () => {
  const f = await fixture({ news: async () => ({ ok: true, value: newsList() }) });
  const core = f.ctx.whalewingWorkbench.internal;
  const old = core.scope('cards');
  // 直接公开run模拟外部同型插件，不旁路它的取消与通知所有权。
  let finish, signal, committed = 0, retried = 0;
  old.notify('旧操作', { action: { label: '旧重试', run: () => { retried++; } } });
  const retry = button(f.render(), '旧重试').props.onClick;
  const pending = old.run(async value => { signal = value; await new Promise(resolve => { finish = resolve; }); return () => { committed++; }; });
  assert.equal(core.snapshot().busy, true);
  await f.featureUpdate(featureFrame(1, ['cards']));
  assert.equal(signal.aborted, true); assert.equal(core.snapshot().busy, false);
  finish(); await pending; retry();
  assert.equal(committed, 0); assert.equal(retried, 0);
  await old.run(async () => { committed++; }); assert.equal(committed, 0);
  await f.featureUpdate(featureFrame(2));
  const fresh = core.scope('cards'); assert.notEqual(fresh, old);
  await fresh.run(async () => () => { committed++; }); assert.equal(committed, 1);
  f.unmount();
});

test('当前可选被关立即回专家并提示，keepAlive访问记录清除后重开', async () => {
  const f = await fixture();
  await button(f.render(), '办公工坊').props.onClick(); await settleView(f);
  const core = f.ctx.whalewingWorkbench.internal;
  assert.equal(core.visited.has('toolbox'), true);
  await f.featureUpdate(featureFrame(1, ['toolbox']));
  assert.equal(core.snapshot().tab, 'experts'); assert.equal(core.visited.has('toolbox'), false);
  assert.ok(nodes(f.render()).some(node => node.props.children?.includes('「办公工坊」已关闭')));
  await f.featureUpdate(featureFrame(2));
  assert.equal(core.visited.has('toolbox'), false);
  await button(f.render(), '办公工坊').props.onClick(); await settleView(f);
  assert.ok(nodes(f.render()).some(node => node.type?.name === 'ToolboxView'));
  f.unmount();
});

test('单底座Remote未就绪仍有主入口和其他页面，失败原因与retryBase保持权威帧', async () => {
  let tries = 0;
  const f = await fixture({ featureFrame: featureFrame(0, [], { knowledge: '知识库目录暂不可读，请检查目录后重试' }), retryBase: async id => { assert.equal(id, 'knowledge'); tries++; return { ok: true, value: featureFrame(tries) }; } });
  await button(f.render(), '个人知识').props.onClick();
  assert.ok(nodes(f.render()).some(node => node.props.children?.includes('知识库目录暂不可读，请检查目录后重试')));
  await button(f.render(), '重试').props.onClick();
  assert.equal(tries, 1); f.render(); await f.settlePlugins(); assert.ok(nodes(f.render()).some(node => node.props.className === 'ww-graph-empty')); assert.ok(f.calls.some(([kind, input]) => kind === 'knowledge' && input.action === 'graph'));
  f.unmount();
  const waiting = await fixture({ missingRemotes: ['whalewingKnowledge'] });
  assert.equal(tabIds(waiting).length, 8);
  await button(waiting.render(), '个人知识').props.onClick();
  assert.ok(nodes(waiting.render()).some(node => node.props.children?.includes('正在连接功能…')));
  await button(waiting.render(), '技能成长').props.onClick();
  assert.equal(waiting.calls.some(([kind]) => kind === 'knowledge'), false);
  waiting.unmount();
});

test('小鲸助手失败在自身入口重试，不增页签或阻断其他底座', async () => {
  const f = await fixture({ featureFrame: featureFrame(0, [], { assistant: '小鲸助手加载失败，请重试' }), retryBase: async id => { assert.equal(id, 'assistant'); return { ok: true, value: featureFrame(1) }; } });
  assert.equal(tabIds(f).length, 8);
  assert.ok(nodes(f.render()).some(node => node.props.children?.includes('小鲸助手加载失败，请重试')));
  await button(f.render(), '重试').props.onClick();
  assert.ok(button(f.render(), '打开小鲸助手')); f.unmount();
});

test('每日资讯关闭标记来自共享帧且无知识卡片入口，不跨读或补建默认计划', async () => {
  const task = { ...taskRecord(), sessionId: 'news-1', purpose: 'news', status: 'active' };
  const f = await fixture({ featureFrame: featureFrame(0, ['cards']), automation: async input => { assert.equal(input.action, 'catalog'); return taskCatalog([task]); } });
  await button(f.render(), '定时任务').props.onClick();
  assert.ok(nodes(f.render()).some(node => node.props.children?.some(value => typeof value === 'string' && value.includes('所属功能已关闭'))));
  assert.equal(nodes(f.render()).some(node => node.type === 'button' && node.props.children?.includes('知识卡片')), false);
  assert.equal(f.calls.some(([kind]) => kind === 'news'), false);
  await f.featureUpdate(featureFrame(1));
  assert.ok(button(f.render(), '知识卡片')); f.unmount();
});

test('管理功能使用可选导航服务，未提供不显示空入口', async () => {
  const opened = [];
  const f = await fixture({ pluginNavigation: { openBundle: name => opened.push(name) } });
  button(f.render(), '管理功能').props.onClick(); assert.deepEqual(opened, ['dsh-whalewing']); f.unmount();
  const absent = await fixture(); assert.equal(nodes(absent.render()).some(node => node.type === 'button' && node.props.children?.includes('管理功能')), false); absent.unmount();
});

test('外部metadata按Host身份连接，end整体靠右且SVG仅作为16px蒙版', async () => {
  const frame = featureFrame(0); frame.features.push({ id: 'ordinary', instance: 100, kind: 'extension', api: 1, package: 'ordinary', skills: [] }, { id: 'external', instance: 101, kind: 'extension', api: 1, package: 'external', skills: [], tab: { placement: 'end', keepAlive: true, icon: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h16v16z"/></svg>' } });
  const f = await fixture({ featureFrame: frame });
  f.ctx.slots.register({ name: 'whalewing.workbench.tab', id: 'ordinary', order: 100, label: () => '普通扩展' }, () => null);
  f.ctx.slots.register({ name: 'whalewing.workbench.tab', id: 'external', order: 110, label: () => '末尾扩展' }, () => null);
  const nav = nodes(f.render()).filter(node => node.props?.['data-tab']);
  assert.deepEqual(nav.slice(-3).map(node => node.props['data-tab']), ['ordinary', 'models', 'external']);
  // 2026-10-27 用户纠正：模型世界不随功能开关增减，要单独放在这一行最右、紧挨着“…”，不和功能页签并在一组。
  const group = className => nodes(nodes(f.render()).find(node => node.props?.className === className)).filter(node => node.props?.['data-tab']).map(node => node.props['data-tab']);
  assert.equal(group('ww-tabs').includes('models'), false);
  assert.deepEqual(group('ww-tabs ww-tabs-end'), ['models', 'external']);
  const icon = nodes(nav.at(-1)).find(node => node.props.style?.mask);
  assert.equal(icon.props.style.width, 16); assert.equal(icon.props.style.height, 16);
  assert.match(icon.props.style.mask, /data:image\/svg\+xml,%3Csvg/); assert.equal(icon.props.dangerouslySetInnerHTML, undefined);
  f.unmount();
});


test('关闭AI网页释放自己的内容租约和引用，再开不复活旧浏览器操作', async () => {
  const sidebar = browserService(), f = await fixture({ sidebarRight: sidebar.service });
  await button(f.render(), 'AI 网页').props.onClick();
  const opened = aiOpen(f)('https://chat.deepseek.com/');
  await browserCommit(f); sidebar.mounted = sidebar.presented; await browserCommit(f); await opened;
  const id = sidebar.presented;
  assert.ok(id); assert.equal(sidebar.opened.length, 1);
  await f.featureUpdate(featureFrame(1, ['ai-web'])); f.render(); f.flushEffects();
  assert.equal(sidebar.presented, undefined); assert.equal(sidebar.focused, undefined);
  assert.ok(f.calls.some(([kind, value]) => kind === 'release' && value === id));
  assert.equal(f.registrations.get('browser.toolbar.actions').length, 0);
  await f.featureUpdate(featureFrame(2)); await button(f.render(), 'AI 网页').props.onClick();
  assert.equal(sidebar.opened.length, 1); f.unmount();
});

test('办公工坊关闭真实组件生命周期会终止Worker并撤销下载，普通跨页仍保留同一下载', async t => {
  const originalWorker = globalThis.Worker, workers = [], revoked = []; let serial = 0;
  t.after(() => { globalThis.Worker = originalWorker; });
  globalThis.Worker = class { constructor() { workers.push(this); } postMessage(message) { this.message = message; } terminate() { this.terminated = true; } };
  t.mock.method(globalThis.URL, 'createObjectURL', () => 'blob:fixture-' + ++serial);
  t.mock.method(globalThis.URL, 'revokeObjectURL', value => revoked.push(value));
  const f = await fixture({ expand: ['ToolboxView'] }); t.after(() => f.unmount());
  await button(f.render(), '办公工坊').props.onClick(); await settleView(f); f.flushEffects();
  const search = nodes(f.render()).find(node => node.type === 'input' && node.props.type === 'search');
  search.props.onChange({ target: { value: '生成二维码' } });
  button(f.render(), '生成二维码').props.onClick(); f.render(); f.flushEffects();
  nodes(f.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: 'fixture' } });
  await button(f.render(), '开始处理').props.onClick();
  const first = workers[0]; assert.ok(first);
  first.onmessage({ data: { id: first.message.id, ok: true, result: { files: [{ name: 'fixture.png', mime: 'image/png', bytes: new Uint8Array([1]) }], summary: '已生成' } } });
  const download = nodes(f.render()).find(node => node.type === 'a' && node.props.download).props.href;
  await button(f.render(), '专家团队').props.onClick(); f.flushEffects();
  await button(f.render(), '办公工坊').props.onClick(); await settleView(f); f.flushEffects();
  assert.equal(nodes(f.render()).find(node => node.type === 'a' && node.props.download).props.href, download);
  assert.equal(revoked.includes(download), false);
  await button(f.render(), '开始处理').props.onClick(); const second = workers[1]; assert.ok(second);
  await f.featureUpdate(featureFrame(1, ['toolbox'])); f.render(); f.flushEffects();
  assert.equal(second.terminated, true); assert.equal(revoked.includes(download), true);
  second.onmessage({ data: { id: second.message.id, ok: true, result: { files: [{ name: 'late.png', mime: 'image/png', bytes: new Uint8Array([2]) }], summary: '迟到' } } });
  await f.featureUpdate(featureFrame(2)); await button(f.render(), '办公工坊').props.onClick(); await settleView(f); f.flushEffects();
  assert.equal(nodes(f.render()).some(node => node.type === 'a' && node.props.download), false);
});


test('AI网页已有会话等待只读恢复后完成专用命名，不重复创建', async () => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers(); let mounted;
  const storage = new Map([['whalewing:aiweb:http://fixture.local', 'saved-ai']]);
  const f = await fixture({ storage, existing: new Map([['saved-ai', false]]), workspaceState: { items: [{ workspaceId: 'existing', path: 'E:/fixture', sessionIds: ['saved-ai'] }] }, nativeCommandList: async id => { assert.equal(id, 'saved-ai'); entered.resolve(); await release.promise; return { ok: true, value: [] }; }, sidebarRight: { mounted: { getSnapshot: () => mounted }, openTab() {} } });
  f.ctx.uiWorkspace.openSession = id => { mounted = id; f.calls.push(['open', id]); };
  const operation = f.clients['ai-web'].openAiInConversation(undefined); await entered.promise;
  assert.equal(f.calls.some(([kind]) => kind === 'open'), false);
  release.resolve(); await operation;
  assert.ok(f.calls.some(([kind, id]) => kind === 'lookup' && id === 'saved-ai'));
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'rename'), [['rename', { sessionId: 'saved-ai', title: 'AI 网页' }]]);
  assert.ok(f.calls.findIndex(([kind]) => kind === 'lookup') < f.calls.findIndex(([kind]) => kind === 'rename'));
  assert.equal(f.calls.some(([kind]) => ['create', 'command', 'attach'].includes(kind)), false);
});

test('纯恢复只读查找失败保留原ID并给重新检查，不发工作区接线', async () => {
  const storage = new Map([['whalewing:workbench:http://fixture.local', 'claimed']]);
  const f = await fixture({ storage, existing: new Map([['claimed', true]]), nativeCommandList: async () => ({ ok: false, error: { code: 'session/not-found', message: '尚未找到原会话' } }) });
  await assert.rejects(f.workbenchSession.ensureWorkbench(), { code: 'session/not-found', sessionId: 'claimed', recovery: 'check' });
  assert.equal(storage.get('whalewing:workbench:http://fixture.local'), 'claimed');
  assert.equal(f.calls.some(([kind]) => ['create', 'attach', 'claim', 'confirm'].includes(kind)), false);
});


test('AI专用会话首次命名失败后按原ID恢复，list完成后补命名再打开', async () => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers(); let mounted, attempts = 0; const order = [];
  const f = await fixture({ nativeCommandList: async id => { order.push(['lookup-start', id]); entered.resolve(); await release.promise; order.push(['lookup-done', id]); return { ok: true, value: [] }; }, sidebarRight: { mounted: { getSnapshot: () => mounted }, openTab() {} } });
  f.ctx.remote.session.rename = async input => { order.push(['rename', input]); return ++attempts === 1 ? { ok: false, error: { code: 'RENAME', message: '命名失败' } } : { ok: true, value: input }; };
  f.ctx.uiWorkspace.openSession = id => { mounted = id; order.push(['open', id]); };
  await assert.rejects(f.clients['ai-web'].openAiInConversation(undefined), { code: 'RENAME' });
  const id = f.storage.get('whalewing:aiweb:http://fixture.local');
  assert.ok(id); assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1); assert.equal(order.some(([kind]) => kind === 'open'), false);
  const retry = f.clients['ai-web'].openAiInConversation(undefined); await entered.promise;
  assert.equal(attempts, 1); assert.equal(order.some(([kind]) => kind === 'open'), false);
  release.resolve(); await retry;
  assert.equal(attempts, 2); assert.equal(f.storage.get('whalewing:aiweb:http://fixture.local'), id);
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1);
  assert.deepEqual(order.slice(-3), [['lookup-done', id], ['rename', { sessionId: id, title: 'AI 网页' }], ['open', id]]);
});

test('AI专用会话lookup失败保留原身份，不进入命名和打开业务', async () => {
  const storage = new Map([['whalewing:aiweb:http://fixture.local', 'saved-ai']]);
  const f = await fixture({ storage, existing: new Map([['saved-ai', false]]), workspaceState: { items: [{ workspaceId: 'existing', path: 'E:/fixture', sessionIds: ['saved-ai'] }] }, nativeCommandList: async () => ({ ok: false, error: { code: 'session/writer-held', message: '原生占用', details: { owner: 'other' } } }), sidebarRight: { openTab() {} } });
  await assert.rejects(f.clients['ai-web'].openAiInConversation(undefined), { code: 'session/writer-held', sessionId: 'saved-ai', recovery: 'open' });
  assert.equal(storage.get('whalewing:aiweb:http://fixture.local'), 'saved-ai');
  assert.equal(f.calls.some(([kind]) => ['create', 'rename', 'open', 'command', 'attach'].includes(kind)), false);
});


test('来源标题卡片及详情显式标注证据范围，保留原标题和来源链接', async () => {
  const legacy = newsSavedReport(), source = { ...legacy.items[0].sources[0], title: 'Original source headline', excerpt: '' };
  const item = { category: 'research', label: 'headline', title: source.title, link: source.url, brief: headlineBrief, relevance: '', eventKey: `headline:${source.id}`, sources: [source] };
  const report = { ...legacy, status: 'complete', items: [item] };
  const f = await fixture({ news: async input => ({ ok: true, value: input.action === 'home' ? newsHomeResult([report]) : newsList() }) });
  await button(f.render(), '知识卡片').props.onClick();
  const card = nodes(f.render()).find(node => node.props?.className === 'ww-tile ww-news-tile');
  assert.equal(nodes(card).find(node => node.props?.className === 'ww-tile-title').props.children.join(''), source.title);
  assert.deepEqual(nodes(card).filter(node => node.props?.className?.startsWith?.('ww-brief-flag')).map(node => node.props.children.join('')), ['来源标题']);
  card.props.onClick();
  const detail = nodes(f.render()).find(node => node.type === 'dialog');
  assert.equal(detail.props['aria-label'], source.title);
  assert.ok(JSON.stringify(detail).includes(headlineBrief));
  assert.deepEqual(nodes(detail).filter(node => node.props?.className?.startsWith?.('ww-brief-flag')).map(node => node.props.children.join('')), ['来源标题']);
  assert.ok(nodes(detail).some(node => node.type === 'a' && node.props.href === source.url));
  assert.equal(JSON.stringify(detail).includes('跟我们的关系'), false);
  assert.equal(f.dictionaries.get('whalewing').en.newsHeadline, 'Source headline');
  detail.props.onCancel({ preventDefault() {} });
  assert.equal(nodes(f.render()).some(node => node.type === 'dialog'), false);
});
