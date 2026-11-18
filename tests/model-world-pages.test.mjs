import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelWorldView } from '../src/model-world-view.js';
import { worldRoleIds, worldMonthGroups, worldSpend, worldCount, worldMoney } from '../src/model-world-pages.js';
import { modelWorldPortraitIds, modelWorldPlatforms, modelWorldVendorIds } from '../src/model-world-roster.js';
import { worldPersonas } from '../src/model-world-persona.js';

// 2026-11-12 模型世界改版：我的模型、实力榜在界面里筛选、比一比、相遇、对决台、模型测智。
const model = (id, vendorId, overall, extra = {}) => ({
  id: `${vendorId}/${id}`, name: extra.name ?? id, vendorId, releaseDate: extra.date ?? '2026-09-10', releaseDatePrecision: 'day', contextWindow: 200000, maxOutput: null, knowledgeCutoff: null, openWeights: null, license: null, modalities: null,
  capabilities: { reasoning: true, toolCall: null, structuredOutput: null, promptCaching: null }, pricing: { inputPerMTok: extra.input ?? 2, cachedInputPerMTok: null, outputPerMTok: extra.output ?? 10, unit: 'USD / 1M tokens', note: 'models.dev 官方渠道价格，不代表员工转发站实际费用' },
  scores: [], efforts: extra.efforts ?? (overall === null ? [] : [{ effort: null, index: overall, cost: extra.cost ?? 40 }]),
  rating: { overall, tier: overall === null ? null : overall >= 52 ? 'T0' : overall >= 44 ? 'T1' : 'T3', effort: null, composite: overall, eci: null, reasoning: extra.reasoning ?? 80, coding: 70, agent: 60, coverage: 3 },
});
const models = [model('gpt-a', 'openai', 60, { name: 'GPT A' }), model('claude-b', 'anthropic', 56, { name: 'Claude B', reasoning: 95 }), model('gemini-c', 'google', 50, { name: 'Gemini C', date: '2026-10-20' }), model('grok-d', 'xai', 40, { name: 'Grok D' }), model('mistral-e', 'mistral', null, { name: 'Mistral E', date: '2026-10-28' })];
const vendors = ['openai', 'anthropic', 'google', 'xai', 'mistral'].map(id => ({ id, name: id, nameZh: id, homepage: null }));
const status = { available: true, refreshing: false, acceptedAt: '2026-11-12T02:00:00.000Z', generatedAt: '2026-11-12T01:00:00.000Z', sources: {}, modelCount: models.length, vendors, leagues: [], lastRefresh: null, attributions: [], index: { source: 'bundled', asOf: '2026-10-22', version: '4.3', key: 'none', error: null } };
const mine = {
  supported: { catalog: true, setDefault: true, probe: true, selectModel: true }, defaultModel: { provider: 'direct', model: 'gpt-a' }, mapping: {}, issues: [],
  groups: [{ id: 'direct', name: '直连', kind: 'official', host: 'api.openai.com', models: [{ id: 'gpt-a', name: 'GPT A', efforts: [], defaultEffort: null, contextWindow: null }] },
    { id: 'relay', name: '转发站', kind: 'relay', host: 'relay.example.com', models: [{ id: 'claude-b', name: 'Claude B', efforts: [], defaultEffort: null, contextWindow: null }, { id: 'local-x:7b', name: 'local-x:7b', efforts: [], defaultEffort: null, contextWindow: null }] }],
  used: [{ provider: 'direct', model: 'gpt-a', calls: 12, tokens: 3e6, lastDay: '2026-11-12' }],
};
const usage = { today: '2026-11-12', since: '2026-11-12', backfilled: true, days: [{ day: '2026-11-11', inputTokens: 1e6, outputTokens: 2e5, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 5 }, { day: '2026-11-12', inputTokens: 2e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 7 }], rows: [{ provider: 'direct', model: 'gpt-a', inputTokens: 3e6, outputTokens: 2e5, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 12 }] };

const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children || [])];
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : '';
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
// 带状态的子窗口单独验证，其余组件就地展开成普通节点。
const hooked = new Set(['DuelWindow', 'MapWindow', 'PortraitViewer', 'KeyWindow']);
const expand = node => Array.isArray(node) ? node.map(expand) : !node || typeof node !== 'object' ? node : typeof node.type === 'function' && !hooked.has(node.type.name) ? expand(node.type(node.props)) : { ...node, props: { ...node.props, children: expand(node.props?.children ?? []) } };
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && (text(node) === label || node.props['aria-label'] === label));

function page({ world = { ...status, models }, desk = {}, portraits = Object.fromEntries(modelWorldPortraitIds.map(id => [id, `data:${id}`])) } = {}) {
  const states = [], refs = [], effects = [], calls = { world: [], desk: [], notes: [], chats: [] };
  let cursor = 0, pending = [];
  const React = {
    Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return refs[index] ||= { current: initial }; },
    useEffect(callback, dependencies) { const index = cursor++; if (!effects[index]) pending.push(() => { effects[index] = { dependencies, cleanup: callback() }; }); },
  };
  const View = createModelWorldView(React, portraits, { loadLarge: async id => `large:${id}` });
  const api = {
    async worldRequest(input) { calls.world.push(input); return typeof world === 'function' ? world(input) : { action: input.action, ...world }; },
    async deskRequest(input, signal) { calls.desk.push(input); const answer = desk[input.action]; if (answer) return { action: input.action, ...await answer(input, signal) }; return { action: input.action, ...({ mine, usage, probes: { runs: [] } })[input.action] }; },
    async openChat(target) { calls.chats.push(target); return 'session-1'; }, openSession() {},
  };
  const props = { api, notify: (message, options) => calls.notes.push([message, options?.kind ?? 'ok', options?.action]) };
  const render = () => { cursor = 0; pending = []; const tree = View(props); const queue = pending; pending = []; queue.forEach(run => run()); return expand(tree); };
  return { render, calls, tab: async name => { button(render(), name).props.onClick(); await tick(); return render(); }, unmount: () => effects.forEach(effect => effect?.cleanup?.()) };
}

test('图鉴顺序里系列形象紧跟主形象；每位角色都有档案和开放平台入口', () => {
  assert.equal(worldRoleIds.length, 19); assert.equal(worldRoleIds[worldRoleIds.indexOf('deepseek') + 1], 'deepseek-flash');
  assert.ok(worldRoleIds.every(id => worldPersonas[id]?.title && worldPersonas[id].line && worldPersonas[id].tags.length === 3));
  assert.ok(modelWorldVendorIds.every(id => /^https:\/\//.test(modelWorldPlatforms[id])));
});

test('数量、金额和按月分组的写法', () => {
  assert.deepEqual([worldCount(999), worldCount(12860000), worldCount(123456789)], ['999', '1286 万', '1.23 亿']);
  assert.deepEqual([worldMoney(.034, 'CNY'), worldMoney(4.72, 'USD'), worldMoney(1234.5, 'CNY')], ['¥0.03', '$4.7', '¥1,235']);
  assert.deepEqual(worldMonthGroups(models).map(group => [group.month, group.models.map(item => item.name)]), [['2026-10', ['Mistral E', 'Gemini C']], ['2026-09', ['Claude B', 'GPT A', 'Grok D']]]);
  const spent = worldSpend(usage.rows, () => models[0]);
  assert.equal(spent.text, '$8.0', '300 万输入 × $2 + 20 万输出 × $10'); assert.equal(worldSpend(usage.rows, () => null).text, '—', '对不上型号的不估价');
});

test('打开只读本地数据：一次取全部型号，不联网更新；默认停在「我的模型」，列出配好的型号、默认模型和渠道', async () => {
  const view = page(); view.render(); await tick();
  assert.deepEqual(view.calls.world, [{ action: 'all' }], '打开不触发联网更新');
  assert.deepEqual(view.calls.desk.map(input => input.action), ['mine', 'usage', 'probes']);
  const shown = text(view.render());
  assert.ok(shown.includes('你在 DSH 里配了 3 个模型，2 个对上了模型世界') && shown.includes('默认模型：GPT A'));
  assert.ok(shown.includes('直连 · 官方渠道') && shown.includes('转发站 · 转发站 · relay.example.com'), '写明是官方渠道还是转发站');
  assert.ok(shown.includes('没对上模型世界的型号'), '本机小模型对不上，提示手动对应');
  assert.ok(shown.includes('大约花了$8.0') && shown.includes('按官网价估算'), '花费写明是估算');
  const cards = nodes(view.render()).filter(node => node.props?.className === 'ww-mw-mycard');
  assert.deepEqual(cards.map(card => card.props['data-default']), [true, false, false], '默认模型排第一');
  view.unmount();
});

test('我的模型卡片的成绩条：四项共用一套列宽，条从同一条竖线开始；条长就是分数（满分 100），综合实力不放大', async () => {
  // 2026-11-17 用户：“文字背后的能力条……是直接紧跟在文字后边的，我觉得他们应该左对齐”“56.9分跟98分之间都没差啥”。
  const view = page(); view.render(); await tick();
  const card = nodes(view.render()).find(node => node.props?.className === 'ww-mw-mycard');
  const rows = nodes(card).filter(node => node.props?.className === 'ww-mw-dim');
  assert.deepEqual(rows.map(row => [text(row.props.children[0]), nodes(row).find(node => node.type === 'b').props.style.width, text(row.props.children[2])]),
    [['综合实力', '60%', '60'], ['推理与知识', '80%', '80'], ['编程', '70%', '70'], ['智能体', '60%', '60']], 'GPT A 综合 60 就画 60%，不再乘 1.5');
  view.unmount();
  const { worldPagesCss } = await import('../src/model-world-style.js');
  assert.match(worldPagesCss, /\.ww-mw-mycard \.ww-mw-dims\{grid-template-columns:max-content minmax\(2rem,1fr\) minmax\(2\.6em,max-content\)/, '列宽定在整组上，文字列取最长的那个');
  const viewCss = (await import('node:fs')).readFileSync(new URL('../src/model-world-view.js', import.meta.url), 'utf8');
  assert.match(viewCss, /\.ww-mw-dim\{display:grid;grid-column:1\/-1;grid-template-columns:subgrid/, '每一行跟着整组的列宽（子网格），不各算各的');
});

test('综合条上有一根竖线标出榜首的分数，条长仍是分数；生图模型单独标出来，不开对话、不进测智候选', async () => {
  // 2026-11-18 走查：生图模型（gpt-image-2.6）被当成对话模型，给了“没对上型号”和“开个对话”，测智还默认勾上了它。
  const withImage = { ...mine, defaultModel: { provider: 'relay', model: 'gpt-image-2.6' }, groups: [{ ...mine.groups[1], models: [{ id: 'gpt-image-2.6', name: 'gpt-image-2.6', efforts: [], defaultEffort: null, contextWindow: null }, ...mine.groups[1].models] }, mine.groups[0]] };
  const view = page({ desk: { mine: async () => withImage } }); view.render(); await tick();
  const tree = view.render(), shown = text(tree);
  assert.ok(shown.includes('你在 DSH 里配了 3 个对话模型、1 个生图模型'), shown.slice(0, 200));
  assert.ok(shown.includes('综合条上的竖线是榜首 60 分'));
  const image = nodes(tree).find(node => node.props?.className === 'ww-mw-mycard' && node.props['data-image']);
  assert.ok(text(image).includes('生图模型。专家和小鲸要出图时会用它'));
  assert.equal(nodes(image).some(node => node.type === 'button'), false, '生图模型没有开对话、比一比、测一测');
  const claude = nodes(tree).find(node => node.props?.className === 'ww-mw-mycard' && text(node).includes('Claude B'));
  const bar = nodes(claude).find(node => node.type === 'i' && node.props['data-top']);
  assert.equal(bar.props.style['--ww-mw-top'], '60%'); assert.equal(nodes(bar).find(node => node.type === 'b').props.style.width, '56%', '条长仍是自己的分数');
  const probe = await view.tab('模型测智');
  assert.equal(text(probe).includes('gpt-image-2.6'), false, '测智候选里没有生图模型');
  view.unmount();
});

test('实力榜的成绩条和卡片同一套：条在前、数字在后，条长就是分数；条跟着这一栏伸缩，窄的时候才缩短', async () => {
  // 2026-11-17 用户看实力榜：“不也一样嘛”。原来条写死 72px、数字在前，底槽看不出满分那头。
  const view = page(); view.render(); await tick();
  const tree = await view.tab('实力榜');
  const cells = nodes(tree).filter(node => node.type === 'td' && node.props?.className === 'ww-mw-barcell');
  assert.ok(cells.length >= 3);
  const shape = cell => { const bar = nodes(cell).find(node => node.props?.className === 'ww-mw-bar'); const [track, number] = bar.props.children; return [track.type, nodes(track).find(node => node.type === 'b').props.style.width, number.type, text(number)]; };
  assert.deepEqual(shape(cells[0]), ['i', '80%', 'span', '80'], 'GPT A 推理与知识 80：条在前画 80%，数字在后');
  view.unmount();
  const viewCss = (await import('node:fs')).readFileSync(new URL('../src/model-world-view.js', import.meta.url), 'utf8');
  assert.match(viewCss, /\.ww-mw-bar\{display:grid;grid-template-columns:minmax\(4\.5rem,1fr\) minmax\(2\.6em,max-content\)/, '条不写死宽度，跟着这一栏伸缩');
  assert.ok(!/42px 72px/.test(viewCss), '不再写死 72px');
  const { worldPagesCss } = await import('../src/model-world-style.js');
  assert.match(worldPagesCss, /@container ww-mw-body \(max-width:64rem\)\{\.ww-mw-bar\{grid-template-columns:minmax\(3rem,1fr\)/, '窄的时候条最短缩到 3rem，实力榜不用横着滚');
  assert.match(worldPagesCss, /\.ww-mw-dim i,\.ww-mw-bar i\{background:var\(--ww-tint\)\}/, '底槽看得出满分那头');
});

test('开个对话只给这一个会话选模型；设成默认要先确认，确认后才改 DSH 设置', async () => {
  const view = page({ desk: { setDefault: async input => ({ defaultModel: { provider: input.provider, model: input.model } }) } }); view.render(); await tick();
  nodes(view.render()).filter(node => node.type === 'button' && text(node) === '开个对话')[1].props.onClick(); await tick();
  assert.deepEqual(view.calls.chats, [{ provider: 'relay', model: 'claude-b' }]);
  nodes(view.render()).filter(node => node.type === 'button' && text(node) === '设成默认模型')[0].props.onClick({ currentTarget: null });
  assert.equal(view.calls.desk.some(input => input.action === 'setDefault'), false, '没确认前不改');
  assert.match(text(view.render()), /这会改 DSH 的设置：之后新开的对话用它，已有的对话不变/);
  button(view.render(), '设成默认').props.onClick(); await tick();
  assert.deepEqual(view.calls.desk.at(-1), { action: 'setDefault', provider: 'relay', model: 'claude-b' });
  assert.match(view.calls.notes.at(-1)[0], /默认模型换成了 Claude B/);
  assert.ok(text(view.render()).includes('默认模型：Claude B'));
  view.unmount();
});

test('实力榜在界面里筛选和排序：只看我能用的、换榜、升降序都不再问宿主；带官网价', async () => {
  const view = page(); view.render(); await tick();
  let tree = await view.tab('实力榜');
  const names = () => nodes(view.render()).filter(node => node.props?.className === 'ww-mw-name').map(text);
  assert.deepEqual(names(), ['GPT A', 'Claude B', 'Gemini C', 'Grok D'], '没有综合实力的不上榜');
  assert.ok(text(tree).includes('$2 / $10'));
  nodes(tree).find(node => node.props?.role === 'switch').props.onClick(); assert.deepEqual(names(), ['GPT A', 'Claude B']);
  button(view.render(), '推理与知识').props.onClick(); assert.deepEqual(names(), ['Claude B', 'GPT A'], '按分项重排');
  nodes(view.render()).find(node => node.props?.className === 'ww-mw-sort').props.onClick(); assert.deepEqual(names(), ['GPT A', 'Claude B']);
  assert.deepEqual(view.calls.world, [{ action: 'all' }], '筛选排序全在界面里做');
  view.unmount();
});

test('比一比最多放 4 个：两个以上能并排比较并标出最高，正好两位才能直接动画对决', async () => {
  const view = page(); view.render(); await tick(); await view.tab('实力榜');
  const picks = () => nodes(view.render()).filter(node => node.props?.className === 'ww-mw-iconbtn' && /比一比/.test(node.props['aria-label']));
  picks()[0].props.onClick(); assert.equal(button(view.render(), '并排比较').props.disabled, true, '一个不能比');
  picks()[1].props.onClick(); assert.equal(button(view.render(), '动画对决').props.disabled, false);
  picks()[2].props.onClick(); picks()[3].props.onClick();
  assert.ok(text(view.render()).includes('比一比 · 4/4')); assert.equal(button(view.render(), '去对决台').props.disabled, true, '超过两位不能直接对决');
  button(view.render(), '并排比较').props.onClick({ currentTarget: null });
  const best = nodes(view.render()).filter(node => node.type === 'td' && node.props['data-best'] === true).map(text);
  assert.deepEqual(best, ['60', '95', '70', '60'].slice(0, best.length)); assert.ok(best.includes('60') && best.includes('95'), '综合最高是 GPT A，推理最高是 Claude B');
  view.unmount();
});

test('相遇自动判断：聊过的点亮，配好没聊过的可以去打个招呼，没配的直接给开放平台链接', async () => {
  const view = page(); view.render(); await tick(); const tree = await view.tab('角色图鉴');
  const slots = Object.fromEntries(nodes(tree).filter(node => node.props?.className === 'ww-mw-role-slot').map(node => [node.key ?? text(nodes(node).find(item => item.type === 'strong')), node]));
  const tag = id => nodes(slots[id]).find(node => node.props?.className === 'ww-mw-met');
  assert.equal(text(tag('openai')), '已相遇 · 聊过 12 次'); assert.equal(tag('openai').props['data-state'], 'met');
  assert.equal(text(tag('anthropic')), '已配好 · 去打个招呼'); tag('anthropic').props.onClick(); await tick();
  assert.deepEqual(view.calls.chats, [{ provider: 'relay', model: 'claude-b' }]);
  assert.equal(tag('xai').type, 'a'); assert.equal(tag('xai').props.href, 'https://console.x.ai'); assert.equal(tag('xai').props.rel, 'noopener noreferrer');
  assert.ok(text(tree).includes('1 / 19') && text(tree).includes('自动点亮'));
  view.unmount();
});

test('对决台直接在页面上选两位：点名单放进亮着的一边并跳到另一边，再点已上场的会换边，两位齐了才能开打', async () => {
  const view = page(); view.render(); await tick(); await view.tab('对决');
  const roster = () => nodes(view.render()).filter(node => node.props?.className === 'ww-mw-rost'), slots = () => nodes(view.render()).filter(node => node.props?.className === 'ww-mw-slot');
  assert.deepEqual(roster().map(node => text(nodes(node).find(item => item.type === 'strong'))), ['GPT A', 'Claude B'], '默认只列我能用的');
  assert.equal(button(view.render(), '开打').props.disabled, true);
  roster()[0].props.onClick();
  assert.deepEqual(slots().map(slot => slot.props['data-active']), [false, true], '放好左边自动跳到右边');
  roster()[1].props.onClick(); assert.equal(button(view.render(), '开打').props.disabled, false);
  roster()[0].props.onClick();
  assert.deepEqual(slots().map(slot => text(nodes(slot).find(item => item.type === 'strong'))), ['Claude B', 'GPT A'], '点已在另一边的那位，两边对调');
  button(view.render(), '开打').props.onClick({ currentTarget: null });
  const duel = nodes(view.render()).find(node => node.type?.name === 'DuelWindow');
  assert.deepEqual(duel.props.models.map(item => item.name), ['Claude B', 'GPT A']);
  view.unmount();
});

test('模型测智：每个模型一条队逐题发，同一轮同一个种子；结果进表并给出掺水提示，记录留给下次看', async () => {
  const replies = { 'direct\ngpt-a': true, 'relay\nclaude-b': false };
  const probe = async input => ({ runId: input.runId, at: '2026-11-12T03:00:00.000Z', testId: input.testId, seed: input.seed, classic: input.classic, provider: input.provider, model: input.model, effort: null, ms: 1200, usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 1 }, finish: 'stop', error: null,
    reply: input.testId === 'pelican' ? '<svg></svg>' : '答案：1', grade: input.testId === 'pelican' ? { made: replies[`${input.provider}\n${input.model}`], pass: null, answer: null, expect: null, note: '' } : { made: null, pass: replies[`${input.provider}\n${input.model}`], answer: '1', expect: '2', note: '' } });
  const view = page({ desk: { probe } }); view.render(); await tick(); await view.tab('模型测智');
  const chips = () => nodes(view.render()).filter(node => node.props?.className === 'ww-mw-chip2' && node.props.onClick && /直连|转发站/.test(text(node)));
  assert.deepEqual(chips().map(chip => chip.props['aria-pressed']), [true, true, false], '默认勾默认模型和一个转发站的');
  assert.equal(text(nodes(view.render()).find(node => node.props?.className === 'ww-primary')), '开始测（6 次调用）');
  nodes(view.render()).find(node => node.props?.className === 'ww-primary').props.onClick(); await tick(); await tick(); await tick();
  const sent = view.calls.desk.filter(input => input.action === 'probe');
  assert.equal(sent.length, 6); assert.equal(new Set(sent.map(input => input.runId)).size, 1); assert.equal(new Set(sent.map(input => input.seed)).size, 1, '几个模型答同一道现出的题');
  assert.deepEqual(sent.filter(input => input.provider === 'direct').map(input => input.testId), ['pelican', 'carwash', 'candy'], '一个模型的题按顺序一题一题发');
  const shown = text(view.render());
  assert.ok(shown.includes('自动判的 2 题对 2 题') && shown.includes('和它在榜上的水平对得上'));
  assert.ok(shown.includes('1 题不像现做的，可能是预制答案') && shown.includes('这个渠道可能被掺水或降智'));
  assert.equal(view.calls.notes.at(-1)[0], '测完了，结果记在「测智记录」里');
  assert.equal(view.calls.desk.at(-1).action, 'probes', '测完重新读记录');
  view.unmount();
});

test('更新数据后新进来的型号标「新」并提示去看；更新失败保留原来的数据并给重试', async () => {
  let extra = [], failing = false;
  const world = input => { if (input.action === 'refresh') { if (failing) throw new Error('网络不通'); extra = [model('gpt-new', 'openai', null, { name: 'GPT New', date: '2026-11-10' })]; } return { action: input.action, ...status, models: [...models, ...extra] }; };
  const view = page({ world }); view.render(); await tick();
  button(view.render(), '更新数据').props.onClick(); await tick();
  assert.deepEqual(view.calls.world.map(input => input.action), ['all', 'refresh', 'all']);
  assert.equal(view.calls.notes.at(-1)[0], '模型数据已更新：新增 1 个模型'); assert.equal(view.calls.notes.at(-1)[2].label, '去看看');
  const tree = await view.tab('新模型');
  const row = nodes(tree).find(node => node.props?.className === 'ww-mw-model-row' && text(node).includes('GPT New'));
  assert.ok(text(row).includes('新') && text(row).includes('待评测'));
  failing = true; button(view.render(), '更新数据').props.onClick(); await tick();
  assert.deepEqual([view.calls.notes.at(-1)[0], view.calls.notes.at(-1)[1], view.calls.notes.at(-1)[2].label], ['更新未完成 · 网络不通', 'error', '重试更新']);
  assert.ok(text(view.render()).includes('GPT New'), '失败不清掉已有数据');
  view.unmount();
});
