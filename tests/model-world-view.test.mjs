import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModelWorldPortraits } from '../src/model-world-portraits.js';
import { createModelWorldView, worldDuelScript, worldDuelLog, worldTimelineGroups, worldMetricRows, worldViewCss, worldTokens, worldTime } from '../src/model-world-view.js';
import { modelWorldPortraitIds } from '../src/model-world-roster.js';

const model = (id, score = 100, extra = {}) => ({ id, name: id, vendorId: 'openai', releaseDate: '2026-10', releaseDatePrecision: 'month', contextWindow: 100000, maxOutput: null, knowledgeCutoff: null, openWeights: null, license: null, modalities: null, capabilities: { reasoning: true, toolCall: null, structuredOutput: null, promptCaching: null }, pricing: { inputPerMTok: 0, cachedInputPerMTok: null, outputPerMTok: null, unit: 'USD / 1M tokens', note: '目录价格' }, scores: score === null ? [] : [{ league: 'eci', source: 'epoch.ai', sourceUrl: 'https://epoch.ai/benchmarks', unit: 'index', attribution: 'third-party', score }], efforts: [], rating: { overall: score, tier: score === null ? null : 'T2', effort: null, composite: score, eci: score, reasoning: score, coding: score, agent: score, coverage: score === null ? 0 : 4 }, provenance: {}, ...extra });
const data = (input, models = [model('甲'), model('乙', 90)]) => ({ action: input.action, available: true, models, model: models[0], vendors: [{ id: 'openai', name: 'OpenAI', nameZh: 'OpenAI' }], leagues: [{ id: 'overall', name: '综合实力' }], total: models.length, modelCount: models.length, offset: input.offset || 0, limit: input.limit || 12, unknownDates: 0, generatedAt: '2026-10-12T00:00:00Z', acceptedAt: '2026-10-12T00:00:00Z', attributions: [], lastRefresh: null });
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children || [])];
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : '';
const findButton = (tree, label) => nodes(tree).find(node => node.type === 'button' && text(node) === label);
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

/** 宿主请求和 hooks 用可控调度验证；原生顶层窗口的视觉仍由浏览器验收。 */
function harness(factory, props) {
  const states = [], refs = [], effects = [];
  let cursor = 0, pending = [], tree, toast = null;
  const React = {
    Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return refs[index] ||= { current: initial }; },
    useEffect(callback, dependencies) { const index = cursor++; if (!effects[index] || dependencies.some((value, offset) => value !== effects[index].dependencies[offset])) pending.push(() => { effects[index]?.cleanup?.(); effects[index] = { dependencies, cleanup: callback() }; }); },
  };
  let Component = factory(React);
  return {
    // 报错与恢复入口改在右上角提示里：渲染结果带上当前提示，断言员工实际能看到的内容；测试自带的 notify 只收成功类提示。
    render(next = props, setup = () => {}) {
      props = next; cursor = 0; pending = [];
      const notify = (message, options = {}) => { toast = message ? { message, ...options } : null; if (message && options.kind !== 'error') props.notify?.(message, options); };
      const page = Component({ ...props, notify });
      const shown = toast && { type: 'div', props: { role: toast.kind === 'error' ? 'alert' : 'status', children: [toast.message, toast.action && { type: 'button', props: { onClick: () => { const action = toast.action; toast = null; return action.run(); }, children: [toast.action.label] } }] } };
      tree = { type: 'fragment', props: { children: [page, shown] } };
      setup(tree); const queue = pending; pending = []; queue.forEach(run => run()); return tree;
    },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); effects.length = 0; },
    replace(component, next) { this.unmount(); states.length = 0; refs.length = 0; Component = component; props = next; },
    get tree() { return tree; }, React,
  };
}

test('对决只看综合实力：双方互相出手，高分方每回合都打得更重并获胜；缺分与平局按公开规则处理', () => {
  const rated = (id, overall, dims) => model(id, overall, { rating: { ...model(id).rating, overall, composite: overall, reasoning: dims[0], coding: dims[1], agent: dims[2] } });
  const win = worldDuelScript([rated('opus', 58, [91.8, 99.3, 95.3]), rated('astra', 53, [99, 98.9, 94.3])]);
  assert.equal(win.kind, 'winner'); assert.equal(win.winner, 0); assert.equal(win.basis, 'overall'); assert.deepEqual(win.totals, [58, 53]);
  assert.equal(win.events.length, 8, '四个回合各出手两次');
  const log = worldDuelLog(win.events);
  assert.deepEqual(log.map(row => row.round), ['probe', 'clash', 'assault', 'finale']);
  assert.ok(log.every(row => row.damage[0] > row.damage[1] && row.damage[1] > 0), '单项领先不改变出手轻重：高分方每回合都更重，低分方也有还手');
  assert.ok(log.every((row, index) => index === 0 || row.damage[0] >= log[index - 1].damage[0]), '越往后打得越重');
  assert.deepEqual(win.events.map(event => event.attacker), [0, 1, 1, 0, 0, 1, 1, 0], '先后手轮换，决胜回合由高分方终结');
  assert.deepEqual(win.hp, [42, 0], '胜方剩 12 + 5 × 6 = 42');
  assert.ok(win.events.slice(0, -1).every(event => event.hp.every(value => value > 0)), '终结一击之前双方都未倒下');
  const flip = worldDuelScript([rated('b', 44, [99, 99, 99]), rated('a', 58, [10, 10, 10])]);
  assert.equal(flip.winner, 1); assert.deepEqual(flip.hp, [0, 70], '分差大时胜方剩余体力封顶 70');
  const composite = worldDuelScript([model('a', 50, { rating: { ...model('a').rating, overall: null, composite: 70 } }), model('b', 50, { rating: { ...model('b').rating, overall: 60, composite: 60 } })]);
  assert.equal(composite.basis, 'composite', '一方缺综合实力时双方改比分项加权百分位'); assert.equal(composite.winner, 0);
  assert.equal(worldDuelScript([model('a', 50), model('b', null)]).kind, 'unknown', '双方缺可比分数，不判胜负');
  const tie = worldDuelScript([model('a', 8), model('b', 8)]);
  assert.equal(tie.kind, 'tie'); assert.deepEqual(tie.hp, [35, 35]);
  assert.equal(worldDuelScript([model('a'), model('a')]).kind, 'invalid');
  assert.equal(worldDuelScript([model('a')]).kind, 'invalid');
});

test('年份分组按原精度显示日期，保留空值与价格零值；详情可只列已知字段', () => {
  const a = model('a'), b = model('b', null, { releaseDate: '2025', releaseDatePrecision: 'year' });
  assert.deepEqual(worldTimelineGroups([a, b, model('unknown', 1, { releaseDate: null })]).map(group => [group.year, group.models.length]), [['2026', 1], ['2025', 1]]);
  const rows = new Map(worldMetricRows(a));
  assert.equal(rows.get('发布日期'), '2026-10');
  assert.equal(rows.get('输入价格'), '$0');
  assert.equal(rows.get('缓存输入价格'), '—');
  assert.equal(rows.get('上下文'), '100K');
  const known = new Map(worldMetricRows(a, undefined, { known: true }));
  assert.equal(known.has('缓存输入价格'), false); assert.equal(known.get('输入价格'), '$0'); assert.equal(known.get('推理'), '是');
});

test('token 数按常见写法缩写，时间按北京时间显示', () => {
  assert.deepEqual([131072, 128000, 1048576, 1000000, 2000000, 65536, 400000, 512, 0, null].map(worldTokens), ['128K', '128K', '1M', '1M', '2M', '64K', '400K', '512', '0', null]);
  assert.equal(worldTime('2026-10-13T02:08:15.274Z'), '2026/10/13 10:08');
  assert.equal(worldTime(null), null); assert.equal(worldTime('无效'), null);
});

test('页头标题下一句现状摘要：读取中、没有数据、有数据时写几家厂商、几个模型和哪天更新', async () => {
  const summary = tree => text(nodes(tree).find(node => node.props?.className === 'ww-mw-summary'));
  let reply = input => ({ ...data(input), modelCount: 192, acceptedAt: '2026-10-22T01:30:00.000Z' });
  const f = harness(React => createModelWorldView(React, 'data:image/png;base64,fixture'), { api: { worldRequest: async input => reply(input) } });
  assert.equal(summary(f.render()), '正在读取模型数据…');
  await tick();
  assert.equal(summary(f.render()), '1 家厂商 · 192 个模型 · 2026-10-22 更新');
  f.unmount();
  reply = input => ({ ...data(input), available: false, models: [], vendors: [], modelCount: 0, acceptedAt: null });
  const empty = harness(React => createModelWorldView(React, 'data:image/png;base64,fixture'), { api: { worldRequest: async input => reply(input) } });
  empty.render(); await tick();
  assert.equal(summary(empty.render()), '还没有模型数据');
  empty.unmount();
});

test('更新失败重试仍为更新，取消更新不继续追加读取', async () => {
  let fail = true, refreshResolve;
  const requests = [];
  const f = harness(React => createModelWorldView(React, 'art'), { api: { worldRequest: async input => { requests.push(input); if (input.action === 'refresh') { if (fail) throw new Error('网络失败'); await new Promise(resolve => { refreshResolve = resolve; }); } return data(input); } } });
  f.render(); await tick();
  await findButton(f.render(), '更新数据').props.onClick();
  fail = false; const pending = findButton(f.render(), '重试更新').props.onClick(); await tick();
  assert.equal(requests.at(-1).action, 'refresh');
  findButton(f.render(), '取消').props.onClick(); refreshResolve(); await pending;
  assert.equal(requests.at(-1).action, 'refresh');
  f.unmount();
});

async function modalHarness(models, options = {}) {
  let returnFocused = 0, closed = 0;
  const parent = harness(React => createModelWorldView(React, 'art'), { api: { worldRequest: async input => data(input, models) } });
  parent.render(); await tick(); findButton(parent.render(), '发布时间线').props.onClick(); await tick();
  const row = nodes(parent.render()).find(node => node.props['aria-label'] === `详情 ${models[0].name}`);
  await row.props.onClick({ currentTarget: { isConnected: true, focus() { returnFocused++; } } });
  const window = nodes(parent.render()).find(node => node.type?.name === 'ModelWindow');
  const props = { ...window.props, onClose() { closed++; }, state: { ...window.props.state, kind: 'compare', data: data({ action: 'compare' }, models) }, ...options };
  const f = parent;
  f.replace(window.type, props);
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  f.render(props, tree => { for (const node of nodes(tree)) if (node.props.ref) node.props.ref.current = node.type === 'dialog' ? dialog : { focus() {} }; });
  return { f, parent, props, dialog, get closed() { return closed; }, get returnFocused() { return returnFocused; } };
}

test('CSS遵循宿主主题、窗口尺寸、键盘焦点与减少动画，不固定黑白主题', () => {
  assert.match(worldViewCss, /prefers-reduced-motion:reduce/);
  assert.match(worldViewCss, /\.ww-mw-dialog:not\(\[open\]\)/);
  assert.match(worldViewCss, /data-platform=darwin/);
  assert.match(worldViewCss, /:focus-visible/);
  assert.doesNotMatch(worldViewCss, /font-weight:(600|700|800|900)/);
});

/** 综合实力数据窗口：从页面按钮打开，再单独渲染窗口组件。 */
async function keyHarness(index, worldRequest = async input => ({ ...data(input), index })) {
  const toasts = [], requests = [];
  const parent = harness(React => createModelWorldView(React), { api: { worldRequest: async (input, signal) => { requests.push(input); return input.action === 'all' ? { ...data(input), index } : worldRequest(input, signal); } }, notify: message => toasts.push(message) });
  parent.render(); await tick();
  findButton(parent.render(), '综合实力数据').props.onClick({ currentTarget: { isConnected: true, focus() {} } });
  const window = nodes(parent.render()).find(node => node.type?.name === 'KeyWindow');
  let closed = 0, changed = null;
  const props = { ...window.props, notify: message => toasts.push(message), onClose() { closed++; }, onChange(value) { changed = value; } };
  parent.replace(window.type, props);
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  parent.render(props, tree => { for (const node of nodes(tree)) if (node.props.ref) node.props.ref.current = node.type === 'dialog' ? dialog : { focus() {} }; });
  return { f: parent, props, dialog, toasts, requests, get closed() { return closed; }, get changed() { return changed; } };
}
const bundledIndex = { source: 'bundled', asOf: '2026-10-21', version: '4.3', key: 'none', error: null };
const typeKey = (f, value) => nodes(f.render()).find(node => node.type === 'input' && node.props.type === 'password').props.onChange({ target: { value } });
const submit = f => nodes(f.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });

test('综合实力数据窗口：说明来源和截止日期，给出注册与生成 Key 的链接，保存后关闭并在右上角提示', async () => {
  const m = await keyHarness(bundledIndex, async input => ({ ...data(input), index: { ...bundledIndex, key: 'saved' } }));
  assert.equal(m.dialog.open, true);
  const shown = text(m.f.render());
  assert.ok(shown.includes('随插件发布的数据，截至 2026-10-21') && shown.includes('还没有填写 Key') && shown.includes('不随插件导出'));
  const links = nodes(m.f.render()).filter(node => node.type === 'a').map(node => [text(node), node.props.href, node.props.rel]);
  assert.deepEqual(links, [['Artificial Analysis 登录页', 'https://artificialanalysis.ai/login', 'noopener noreferrer'], ['免费接口文档', 'https://artificialanalysis.ai/api-reference#free-api', 'noopener noreferrer']]);
  const input = nodes(m.f.render()).find(node => node.type === 'input');
  assert.deepEqual([input.props.type, input.props.autoComplete], ['password', 'off'], 'Key 不明文显示');
  const save = () => nodes(m.f.render()).find(node => node.type === 'button' && node.props.type === 'submit');
  assert.equal(save().props.disabled, true, '没填不能保存');
  typeKey(m.f, ' aa_test_key_0123456789 '); assert.equal(save().props.disabled, false);
  await submit(m.f); await tick();
  assert.deepEqual(m.requests.at(-1), { action: 'setIndexKey', key: 'aa_test_key_0123456789' });
  assert.deepEqual([m.closed, m.changed.key, m.toasts.at(-1)], [1, 'saved', 'Key 已保存，点「更新数据」时会一起更新综合实力']);
  m.f.unmount();
});

test('保存失败留在窗口里说明原因；清除 Key 先确认；没有凭据服务时不显示输入框', async () => {
  const failing = await keyHarness(bundledIndex, async () => { throw new Error('凭据文件不可写'); });
  typeKey(failing.f, 'aa_test_key_0123456789'); await submit(failing.f); await tick();
  assert.equal(failing.closed, 0); assert.ok(text(failing.f.render()).includes('保存没有成功：凭据文件不可写'));
  failing.f.unmount();
  const saved = await keyHarness({ ...bundledIndex, source: 'online', key: 'saved', error: 'Artificial Analysis 今天的免费额度已用完，明天再更新' }, async input => ({ ...data(input), index: { ...bundledIndex, key: 'none' } }));
  const shown = text(saved.f.render());
  assert.ok(shown.includes('在线更新的数据') && shown.includes('Key 已保存在本机') && shown.includes('上次在线更新综合实力没有成功：Artificial Analysis 今天的免费额度已用完'));
  findButton(saved.f.render(), '清除 Key').props.onClick();
  assert.equal(saved.requests.some(input => input.action === 'clearIndexKey'), false, '先确认再清除');
  await findButton(saved.f.render(), '确定清除').props.onClick(); await tick();
  assert.deepEqual([saved.requests.at(-1).action, saved.closed, saved.toasts.at(-1)], ['clearIndexKey', 1, 'Key 已清除，之后使用随插件发布的综合实力数据']);
  saved.f.unmount();
  const unavailable = await keyHarness({ ...bundledIndex, key: 'unavailable' });
  assert.equal(nodes(unavailable.f.render()).some(node => node.type === 'input'), false);
  assert.ok(text(unavailable.f.render()).includes('当前 DSH 没有凭据服务'));
  unavailable.f.unmount();
});

test('更新数据时综合实力在线更新失败：右上角说明模型目录已更新、综合实力沿用之前的数据', async () => {
  const notices = [];
  const index = { ...bundledIndex, source: 'online', key: 'saved', error: 'Artificial Analysis 拒绝了这个 API Key，请检查后重新填写' };
  const f = harness(React => createModelWorldView(React), { api: { worldRequest: async input => ({ ...data(input.action === 'refresh' ? { action: 'refresh' } : input), index }) }, notify: message => notices.push(message) });
  f.render(); await tick();
  await findButton(f.render(), '更新数据').props.onClick(); await tick();
  assert.ok(text(f.render()).includes('模型目录已更新，综合实力仍用之前的数据：Artificial Analysis 拒绝了这个 API Key'));
  assert.ok(text(f.render()).includes('智能指数（2026-10-21 更新）'), '算法说明用实际使用的数据日期');
  f.unmount();
});

// 2026-10-27 用户：模型娘立绘是我们生成的高清图，要能点开放大、自己保存（不能商用）；保存的图右下角带鲸翼水印，不占画面。
const flush = () => new Promise(setImmediate);
async function viewerParent({ loadLarge } = {}) {
  // 只批准三张立绘：图鉴和查看器里就是这三位，按名单顺序排。
  const all = loadModelWorldPortraits(), portraits = { openai: all.openai, anthropic: all.anthropic, google: all.google };
  const calls = { large: [], watermark: [], download: [], revoked: [], notes: [] };
  const options = {
    loadLarge: loadLarge ?? (async id => { calls.large.push(id); return `data:large/${id}`; }),
    watermark: async source => { calls.watermark.push(source); return { from: source }; },
    download: (url, name) => calls.download.push([url, name]),
    objectUrl: { create: blob => `blob:${blob.from.slice('data:large/'.length)}`, revoke: url => calls.revoked.push(url) },
  };
  const vendors = [{ id: 'openai', name: 'OpenAI', nameZh: 'OpenAI' }, { id: 'anthropic', name: 'Anthropic', nameZh: 'Anthropic' }, { id: 'google', name: 'Google', nameZh: '谷歌' }];
  const parent = harness(React => createModelWorldView(React, portraits, options), { api: { worldRequest: async input => ({ ...data(input), vendors }) }, notify: message => calls.notes.push(message) });
  parent.render(); await tick();
  findButton(parent.render(), '角色图鉴').props.onClick();
  return { parent, calls, portraits };
}
async function openViewer(start, setup) {
  const h = await viewerParent(setup);
  const returnFocus = { isConnected: true, focused: 0, focus() { this.focused++; } };
  nodes(h.parent.render()).filter(node => node.props?.className === 'ww-mw-zoom')[start].props.onClick({ currentTarget: returnFocus });
  const element = nodes(h.parent.render()).find(node => node.type?.name === 'PortraitViewer');
  let closed = 0;
  // 单独渲染查看器时换上测试自己的提示收集，免得绕回外壳的提示函数。
  const props = { ...element.props, onClose() { closed++; }, notify: message => h.calls.notes.push(message) };
  h.parent.replace(element.type, props);
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const image = { naturalWidth: 2160, clientWidth: 450, offsetLeft: 76, offsetTop: 0, offsetWidth: 2160, offsetHeight: 3840 };
  const stage = { scrollLeft: 0, scrollTop: 0, clientWidth: 1000, clientHeight: 800, querySelector: () => image };
  const render = () => h.parent.render(props, tree => { for (const node of nodes(tree)) if (node.props.ref) node.props.ref.current = node.type === 'dialog' ? dialog : stage; });
  render(); await flush();
  return { ...h, render, dialog, stage, props, returnFocus, get closed() { return closed; } };
}
const shownImage = tree => nodes(tree).find(node => node.type === 'img' && node.props.className === 'ww-mw-viewer-img');
const byLabel = (tree, label) => nodes(tree).find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label));

test('图鉴每张有立绘的卡片右上角都有“查看大图”，点开按图鉴顺序浏览；没有大图来源时不显示入口', async () => {
  const { parent } = await viewerParent();
  const zooms = nodes(parent.render()).filter(node => node.props?.className === 'ww-mw-zoom');
  assert.deepEqual(zooms.map(node => node.props['aria-label']), ['查看大图：OpenAI', '查看大图：Anthropic', '查看大图：谷歌']);
  assert.equal(nodes(parent.render()).filter(node => node.props?.className === 'ww-mw-role').length, 3, '卡片本身仍是进入该厂商的按钮');
  zooms[1].props.onClick({ currentTarget: null });
  const viewer = nodes(parent.render()).find(node => node.type?.name === 'PortraitViewer');
  assert.deepEqual(viewer.props.items, [{ id: 'openai', name: 'OpenAI' }, { id: 'anthropic', name: 'Anthropic' }, { id: 'google', name: '谷歌' }]);
  assert.equal(viewer.props.start, 1);
  parent.unmount();
  const plain = harness(React => createModelWorldView(React, loadModelWorldPortraits()), { api: { worldRequest: async input => data(input) } });
  plain.render(); await tick();
  assert.equal(nodes(plain.render()).some(node => node.props?.className === 'ww-mw-zoom'), false);
  plain.unmount();
});

test('查看器先显示小图，取到大图后显示带水印的那张；保存的就是这张，文件名带角色名', async () => {
  const v = await openViewer(1);
  assert.equal(v.dialog.open, true);
  assert.deepEqual(v.calls.large, ['anthropic']); assert.deepEqual(v.calls.watermark, ['data:large/anthropic'], '大图先加水印再显示');
  const tree = v.render();
  assert.equal(shownImage(tree).props.src, 'blob:anthropic'); assert.equal(shownImage(tree).props['data-ready'], true);
  assert.equal(text(nodes(tree).find(node => node.props?.className === 'ww-mw-viewer-title')), 'Anthropic2 / 3');
  assert.match(text(nodes(tree).find(node => node.props?.className === 'ww-mw-viewer-note')), /水印.*不能商用（CC BY-NC-SA 4\.0）/);
  byLabel(tree, '保存图片').props.onClick();
  assert.deepEqual(v.calls.download, [['blob:anthropic', '鲸翼立绘-Anthropic.jpg']]);
  assert.equal(v.calls.notes.at(-1), '已保存“鲸翼立绘-Anthropic.jpg”，在浏览器的下载里');
  v.parent.unmount();
});

test('点图片放大到原图一比一并把点到的地方滚到中间，再点或“适应窗口”还原', async () => {
  const v = await openViewer(0);
  let tree = v.render();
  shownImage(tree).props.onClick({ stopPropagation() {}, detail: 1, clientX: 225, clientY: 200, currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 450, height: 800 }) } });
  tree = v.render();
  assert.deepEqual(shownImage(tree).props.style, { width: '2160px' });
  assert.equal(v.stage.scrollLeft, 76 + 0.5 * 2160 - 500); assert.equal(v.stage.scrollTop, 0.25 * 3840 - 400);
  assert.equal(byLabel(tree, '适应窗口').props['aria-pressed'], true);
  shownImage(tree).props.onClick({ stopPropagation() {}, detail: 2, currentTarget: {} });
  assert.deepEqual(shownImage(v.render()).props.style, { width: '2160px' }, '双击的第二下不再切回');
  byLabel(v.render(), '适应窗口').props.onClick();
  assert.equal(shownImage(v.render()).props.style, undefined);
  v.parent.unmount();
});

test('左右按钮和方向键切换角色并循环，每张大图只取一次；关闭释放图片、焦点回到入口', async () => {
  const v = await openViewer(0);
  byLabel(v.render(), '下一位').props.onClick(); v.render(); await flush();
  assert.equal(shownImage(v.render()).props.src, 'blob:anthropic');
  const dialog = () => nodes(v.render()).find(node => node.type === 'dialog');
  dialog().props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} }); v.render();
  dialog().props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} }); v.render(); await flush();
  assert.equal(shownImage(v.render()).props.src, 'blob:google', '从第一位往前回到最后一位');
  byLabel(v.render(), '下一位').props.onClick(); v.render(); await flush();
  assert.deepEqual(v.calls.large, ['openai', 'anthropic', 'google'], '看过的不再重取');
  let prevented = false; dialog().props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(v.closed, 1);
  v.parent.unmount();
  assert.equal(v.dialog.open, false); assert.deepEqual(v.calls.revoked.sort(), ['blob:anthropic', 'blob:google', 'blob:openai']); assert.equal(v.returnFocus.focused, 1);
});

test('大图取不到时保留小图、不能保存，并给出重试', async () => {
  let fail = true; const asked = [];
  const v = await openViewer(0, { loadLarge: async id => { asked.push(id); if (fail) throw new Error('离线'); return `data:large/${id}`; } });
  const tree = v.render();
  assert.equal(shownImage(tree).props.src, v.portraits.openai, '先用小图');
  assert.equal(byLabel(tree, '保存图片').props.disabled, true);
  const status = nodes(tree).find(node => node.props?.className === 'ww-mw-viewer-status');
  assert.equal(status.props.role, 'alert'); assert.match(text(status), /高清图没有载入/);
  fail = false; byLabel(tree, '重试').props.onClick(); v.render(); await flush();
  assert.equal(shownImage(v.render()).props.src, 'blob:openai'); assert.deepEqual(asked, ['openai', 'openai']);
  v.parent.unmount();
});

test('查看器样式：压暗底、图片适应窗口、放大可拖动，入口跟随皮肤且触屏常显', () => {
  assert.match(worldViewCss, /\.ww-mw-viewer::backdrop\{background:rgba\(8,10,16,\.86\)/);
  assert.match(worldViewCss, /\.ww-mw-viewer-img\{display:block;height:100%;max-width:100%;object-fit:contain/);
  assert.match(worldViewCss, /\.ww-mw-viewer-stage\.ww-zoomed\{display:block;overflow:auto/);
  assert.match(worldViewCss, /\.ww-mw \.ww-mw-zoom\{[^}]*background:color-mix\(in srgb,var\(--ww-surface\) 80%,transparent\)/);
  assert.match(worldViewCss, /@media\(hover:none\)\{\.ww-mw \.ww-mw-zoom\{opacity:1\}\}/);
  assert.match(worldViewCss, /\.ww-mw-viewer:not\(\[open\]\)\{display:none\}/);
});

// 2026-10-27 用户：放大、适应窗口这几个按钮只有最下面一点能点，还被 DSH 右上角的窗口按钮挡住，挪到中间去。
// 原因是 DSH 桌面版顶上 40px 是拖动窗口的区域（Windows 右上角还有窗口自己的三个按钮）；只改我们自己的查看器，不动 DSH。
test('查看器按钮组在顶栏正中，整块不参与拖动窗口，并给桌面版的窗口按钮让位', async () => {
  assert.match(worldViewCss, /\.ww-mw-viewer\{[^}]*-webkit-app-region:no-drag/, '压在拖动区域上的按钮也要点得中');
  assert.match(worldViewCss, /\.ww-mw-viewer-bar\{display:grid;grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/, '左右两栏等宽，按钮组正好居中');
  assert.match(worldViewCss, /\.ww-mw-viewer-actions\{grid-column:2;/);
  assert.match(worldViewCss, /html\[data-windows-titlebar\] \.ww-mw-viewer-bar\{grid-template-columns:minmax\(0,1fr\) auto minmax\(150px,1fr\)\}/, '右栏至少让出窗口按钮的宽度');
  assert.match(worldViewCss, /html\[data-platform=darwin\] \.ww-mw-viewer-title\{padding-inline-start:68px\}/, 'macOS 让出左上角红绿灯');
  const v = await openViewer(0);
  const bar = nodes(v.render()).find(node => node.type === 'header');
  assert.deepEqual(bar.props.children.filter(Boolean).map(child => child.props.className), ['ww-mw-viewer-title', 'ww-mw-viewer-actions']);
  assert.deepEqual(nodes(bar).filter(node => node.type === 'button').map(text), ['放大', '保存图片', '关闭']);
  v.parent.unmount();
});
