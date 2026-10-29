import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { newsContract } from '../features/cards/contract.js';
import { tipIndex } from '../features/cards/tip-index.js';
import { createTipsView } from '../features/cards/tips.js';
import { zh, en, styles } from '../features/cards/tips-presentation.js';
import {
  buildTimeline, entryHeight, entryTops, entryAt, entryFor, daysFromReports, snapDay, stepDay, stepMonth, stepTip, monthLatest, yearLatest,
  yearsOf, axisLayout, armSpan, armLayout, dayY, dateAtY, tickLength, thumbBox, planFetch, nextDayCutoff, featuredIndex, shiftDate,
} from '../features/cards/tips-model.js';

// —— 示例数据：与规格同一段日子，缩短到 8 期 ——
const today = '2026-10-24';
const cutoff = date => `${date}T00:00:00.000Z`;
const plan = [['2026-10-24', 6], ['2026-10-23', 4, 'partial'], ['2026-10-20', 3], ['2026-10-19', 0, 'empty'], ['2026-09-30', 2], ['2026-09-29', 1], ['2025-12-08', 2]];
const days = plan.map(([date, count, status = 'complete']) => ({ date, cutoff: cutoff(date), count, status }));
const candidate = (date, i) => ({ id: 'a'.repeat(64), title: `原文 ${date} ${i}`, url: `https://example.org/${date}/${i}`, publishedAt: `${shiftDate(date, -1)}T13:40:00.000Z`, eventTime: null, collectedAt: cutoff(date), excerpt: '', source: { name: i % 2 ? '宝玉' : 'Anthropic 工程博客', url: 'https://example.org/feed', kind: 'primary', region: 'overseas' } });
const item = (date, i) => ({ category: 'agent', label: 'official', title: `${date} 第 ${i + 1} 条技巧`, link: `https://www.example.org/${date}/${i}`, brief: `${date} 第 ${i + 1} 条的做法`, relevance: '', eventKey: `${date}-${i}`, sources: [candidate(date, i)] });
const report = ([date, count, status = 'complete']) => ({ fieldId: 'ai-tips', fieldName: 'AI 使用技巧', fieldRevision: 1, start: cutoff(shiftDate(date, -1)), cutoff: cutoff(date), sessionId: 'session-1', completedAt: cutoff(date), items: Array.from({ length: count }, (_, i) => item(date, i)), sourceStatus: [], status, coverage: '示例' });
const reports = plan.map(report);

// —— 纯逻辑 ——
test('时间线按天倒序：未整理的日子按月折成一行，换月插月分隔，当期为空单独一行，最后是第一期终点', () => {
  const entries = buildTimeline(days, { today });
  assert.deepEqual(entries.slice(0, 10).map(entry => entry.key), ['2026-10-24', '2026-10-23', 'gap:2026-10-22', '2026-10-20', '2026-10-19', 'gap:2026-10-18', 'month:2026-09', '2026-09-30', '2026-09-29', 'gap:2026-09-28']);
  assert.deepEqual(entries.slice(0, 5).map(entry => entry.kind), ['day', 'day', 'gap', 'day', 'empty']);
  assert.deepEqual([entries[2].from, entries[2].to, entries[2].length], ['2026-10-22', '2026-10-21', 2]);
  assert.deepEqual([entries[5].from, entries[5].to], ['2026-10-18', '2026-10-01'], '空日不跨月，月分隔落在正确位置');
  assert.equal(entries[0].today, true);
  const months = entries.filter(entry => entry.kind === 'month').map(entry => entry.month);
  assert.deepEqual(months, ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12']);
  assert.deepEqual(entries.slice(-3).map(entry => entry.key), ['gap:2025-12-31', '2025-12-08', 'end']);
  assert.deepEqual([entries.at(-3).to, entries.at(-1).date], ['2025-12-09', '2025-12-08']);
  // 今天还没整理：顶上一行“今天”，再往下才是未整理。
  const later = buildTimeline(days, { today: '2026-10-26' });
  assert.deepEqual(later.slice(0, 3).map(entry => entry.key), ['pending:2026-10-26', 'gap:2026-10-25', '2026-10-24']);
  assert.equal(later[2].today, false);
  // 没有日期索引、更早的还没读到：末尾是“继续读取”。
  assert.equal(buildTimeline(days.slice(0, 2), { today, complete: false }).at(-1).kind, 'more');
  assert.deepEqual(buildTimeline([], { today }), []);
});

test('条目高度与规格坐标一致：6 条 350、4 条 294、未整理 56，估算即骨架高度', () => {
  const entries = buildTimeline(days, { today }), tops = entryTops(entries, entry => entryHeight(entry, 2));
  assert.deepEqual(tops.slice(0, 5), [0, 350, 644, 700, 938], '10/24 在 268，10/23 在 618，未整理行在 912，10/20 在 968（减去 16 的上沿）');
  assert.equal(entryHeight({ kind: 'day', count: 1 }), 170);
  assert.equal(entryHeight({ kind: 'day', count: 6 }, 1), 134 + 12 + 5 * 56 + 36, '窄屏一列时行数翻倍');
  assert.equal(entryAt(tops, 0), 0); assert.equal(entryAt(tops, 349), 0); assert.equal(entryAt(tops, 350), 1); assert.equal(entryAt(tops, 1e9), entries.length - 1);
  assert.equal(entryFor(entries, '2026-10-21'), 2, '未整理的日子落在折叠行上');
});

test('竖臂几何：297 天每天 2.2px、月间 6px，各月范围与规格一致；不足一个月每天 8px；按这一年自己的第一期起画', () => {
  // 竖臂从这一年的第一期画起：示例里 2026 年最早一期是 9/29，所以只有 9、10 两个月，不留一月到八月的空月份。
  const own = armLayout({ ...armSpan(days, 2026, today), height: 707.4 });
  assert.deepEqual([own.from, own.to, own.months.map(month => month.key), own.step], ['2026-09-29', '2026-10-24', ['2026-10', '2026-09'], 8]);
  // 规格的整年几何：这一年 1 月 1 日就有一期时，从今天到 1 月 1 日共 297 天。
  const fullYear = [...days.filter(day => day.date >= '2026'), { date: '2026-01-01', cutoff: cutoff('2026-01-01'), count: 1, status: 'complete' }, ...days.filter(day => day.date < '2026')];
  const layout = armLayout({ ...armSpan(fullYear, 2026, today), height: 707.4 });
  assert.equal(layout.step.toFixed(4), '2.2000');
  assert.deepEqual(layout.months.map(month => month.key), ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01']);
  const spec = [[252, 304.8], [310.8, 376.8], [382.8, 451.0], [457.0, 525.2], [531.2, 597.2], [603.2, 671.4], [677.4, 743.4], [749.4, 817.6], [823.6, 885.2], [891.2, 959.4]];
  layout.months.forEach((month, i) => { assert.ok(Math.abs(month.top + 252 - spec[i][0]) < 0.01, month.key); assert.ok(Math.abs(month.bottom + 252 - spec[i][1]) < 0.01, month.key); });
  assert.ok(Math.abs(dayY(layout, '2026-09-17') + 252 - (310.8 + 13 * 2.2)) < 0.01, '某天纵坐标 = 月顶 +（该月最后一天 − 日）× 2.2');
  for (let date = '2026-10-24'; date >= '2026-01-01'; date = shiftDate(date, -1)) assert.equal(dateAtY(layout, dayY(layout, date) + 1), date, date);
  assert.equal(dateAtY(layout, -50), '2026-10-24'); assert.equal(dateAtY(layout, 5000), '2026-01-01');
  const short = armLayout({ ...armSpan(days, 2025, today), height: 707.4 });
  assert.deepEqual([short.from, short.to, short.step, short.height], ['2025-12-08', '2025-12-31', 8, 192], '2025 年只有 12 月 24 天，画到约 y=444');
  // 滑块盖住视口里的 10/24–10/20，最小高 16。
  assert.deepEqual(thumbBox(layout, '2026-10-24', '2026-10-20'), { top: -2, height: 16 });
  assert.ok(thumbBox(layout, '2026-10-24', '2026-10-01').height > 50);
  assert.deepEqual([tickLength({ count: 6 }), tickLength({ count: 9 }), tickLength({ count: 0 }), tickLength(undefined)], [22, 28, 3, 3]);
});

test('年份轴：有技巧的年份右对齐，每年最宽 560，只有一年时占满；期数按日报计', () => {
  const years = yearsOf(days);
  assert.deepEqual(years.map(entry => [entry.year, entry.count, entry.tips]), [[2026, 6, 5], [2025, 1, 1]]);
  assert.deepEqual(years[0].months.map(month => month.count), [0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 0, 0]);
  const segments = axisLayout(years, 1260, today);
  assert.deepEqual(segments.map(segment => [segment.year, segment.left, segment.width, segment.last]), [[2026, 700, 560, 10], [2025, 140, 560, 12]]);
  assert.ok(Math.abs(segments[0].cell - 46.667) < 0.001);
  assert.deepEqual(axisLayout(years.slice(0, 1), 1260, today).map(segment => [segment.left, segment.width]), [[0, 1260]]);
  assert.deepEqual(yearsOf([{ date: '2024-05-01', cutoff: cutoff('2024-05-01'), count: 0, status: 'empty' }]), [], '没有技巧的年份不显示');
});

test('定位只落在有技巧的日子：点到空日取更早一侧；键盘按天、按月、到头尾', () => {
  assert.equal(snapDay(days, '2026-10-22').date, '2026-10-20');
  assert.equal(snapDay(days, '2026-10-19').date, '2026-09-30', '当期为空也跳过');
  assert.equal(snapDay(days, '2025-11-01').date, '2025-12-08', '更早没有就取更新一侧');
  assert.equal(stepDay(days, '2026-10-24', 1).date, '2026-10-23');
  assert.equal(stepDay(days, '2026-10-20', 1).date, '2026-09-30');
  assert.equal(stepDay(days, '2026-10-24', -1), null);
  assert.equal(stepDay(days, '2026-10-22', -1).date, '2026-10-23', '从未整理的日子出发');
  assert.equal(stepMonth(days, '2026-10-23', 1).date, '2026-09-30');
  assert.equal(stepMonth(days, '2026-09-29', 1).date, '2025-12-08');
  assert.equal(stepMonth(days, '2025-12-08', -1).date, '2026-09-30');
  assert.equal(stepMonth(days, '2026-10-23', -1), null);
  assert.equal(monthLatest(days, '2026-09').date, '2026-09-30');
  assert.equal(monthLatest(days, '2026-08'), null);
  assert.equal(yearLatest(days, 2025).date, '2025-12-08');
});

test('S6 上一条 / 下一条：当天内先切，到头跨到相邻有技巧的日子，跳过当期为空，到历史尽头为空', () => {
  const at = (date, index) => ({ date, cutoff: cutoff(date), index, count: days.find(day => day.date === date).count });
  assert.deepEqual(stepTip(days, at('2026-10-24', 2), 1), { date: '2026-10-24', cutoff: cutoff('2026-10-24'), index: 3 });
  assert.deepEqual(stepTip(days, at('2026-10-24', 5), 1), { date: '2026-10-23', cutoff: cutoff('2026-10-23'), index: 0 });
  assert.deepEqual(stepTip(days, at('2026-10-23', 0), -1), { date: '2026-10-24', cutoff: cutoff('2026-10-24'), index: 5 });
  assert.deepEqual(stepTip(days, at('2026-10-20', 2), 1).date, '2026-09-30');
  assert.equal(stepTip(days, at('2026-10-24', 0), -1), null);
  assert.equal(stepTip(days, at('2025-12-08', 1), 1), null);
});

test('补读计划：跳到旧月份后往上滚用 after，其余从最新的缺口用 before = 次日 00:00Z', () => {
  const entries = buildTimeline(days, { today }), all = [0, entries.length - 1];
  const below = planFetch(entries, all, value => value === cutoff('2026-10-24'), days);
  assert.deepEqual(below, { key: `before:${cutoff('2026-10-23')}`, input: { before: '2026-10-24T00:00:00.000Z' }, expect: cutoff('2026-10-23') });
  const above = planFetch(entries, [0, 3], value => value === cutoff('2026-10-19'), days);
  assert.deepEqual(above.input, { after: cutoff('2026-10-19') }, '10/20 下面那期已读，往上补读');
  assert.equal(above.expect, cutoff('2026-10-20'));
  assert.equal(planFetch(entries, all, () => true, days), null);
  assert.equal(nextDayCutoff('2025-12-31T00:00:00.000Z'), '2026-01-01T00:00:00.000Z');
  assert.deepEqual(daysFromReports(reports.slice(0, 2)).map(day => [day.date, day.count, day.status]), [['2026-10-24', 6, 'complete'], ['2026-10-23', 4, 'partial']]);
  assert.equal(featuredIndex('2026-10-24', 6), tipIndex('2026-10-24', 6), '当天首页与首页技巧卡同源');
});

test('词条中英一致、都以 tips 开头；样式类只用 ww-tips / ww-ruler，深色走 light-dark，减少动态去掉动画', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const key of Object.keys(zh)) assert.match(key, /^tips[A-Z]/, key);
  assert.equal(zh.tipsMonths.split('|').length, 12); assert.equal(en.tipsWeekdays.split('|').length, 7);
  const classes = new Set([...styles.matchAll(/\.(ww-[a-z0-9-]+)/g)].map(match => match[1]));
  for (const name of classes) assert.ok(/^ww-(tips|ruler)(-|$)/.test(name) || ['ww-modal', 'ww-page', 'ww-header'].includes(name), name);
  assert.ok(styles.includes('light-dark(#9333ea,#cc9bfd)'));
  assert.ok(styles.includes('@media(prefers-reduced-motion:reduce)'));
  assert.equal([...styles.matchAll(/(^|})\.ww-modal\.ww-page\[open\]\{/g)].length, 0, '不改共用弹窗的选择器');
});

// —— 组件：最小 hooks 运行时，直接渲染 TipsPage ——
function runtime() {
  const scopes = new Map();
  let current = null, dirty = false, order = [], seen = new Set();
  const hook = kind => current.cursor[kind]++;
  const React = {
    Fragment: 'fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const scope = current, i = hook('state');
      if (!(i in scope.state)) scope.state[i] = typeof initial === 'function' ? initial() : initial;
      return [scope.state[i], value => { const next = typeof value === 'function' ? value(scope.state[i]) : value; if (!Object.is(next, scope.state[i])) { scope.state[i] = next; dirty = true; } }];
    },
    useRef(initial) { const scope = current, i = hook('refs'); if (!(i in scope.refs)) scope.refs[i] = { current: initial }; return scope.refs[i]; },
    useEffect(fn, deps) { effect(fn, deps, false); },
    useLayoutEffect(fn, deps) { effect(fn, deps, true); },
  };
  function effect(fn, deps, layout) {
    const scope = current, i = hook('effects'), old = scope.effects[i];
    if (!old || !deps || deps.some((value, k) => !Object.is(value, old.deps[k]))) scope.effects[i] = { fn, deps, layout, cleanup: old?.cleanup, pending: true };
  }
  function expand(node, path) {
    if (Array.isArray(node)) return node.map((child, i) => expand(child, `${path}/${child?.props?.key ?? i}`));
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const id = `${path}/${node.type.name}`;
      if (!scopes.has(id)) scopes.set(id, { state: [], refs: [], effects: [] });
      const scope = scopes.get(id), previous = current;
      scope.cursor = { state: 0, refs: 0, effects: 0 }; current = scope; seen.add(id);
      const output = node.type(node.props);
      current = previous;
      const tree = expand(output, id);
      order.push(scope);
      return tree;
    }
    return { ...node, props: { ...node.props, children: expand(node.props?.children, path) } };
  }
  function run(layout) {
    for (const scope of order) for (const item of scope.effects) if (item?.pending && item.layout === layout) { item.pending = false; item.cleanup?.(); const cleanup = item.fn(); item.cleanup = typeof cleanup === 'function' ? cleanup : undefined; }
  }
  function render(element) {
    for (let attempt = 0; attempt < 30; attempt++) {
      dirty = false; order = []; seen = new Set();
      const tree = expand(element, 'root');
      for (const [id, scope] of scopes) if (!seen.has(id)) { scope.effects.forEach(item => item?.cleanup?.()); scopes.delete(id); }
      run(true); run(false);
      if (!dirty) return tree;
    }
    throw new Error('渲染没有收敛');
  }
  const unmount = () => { for (const scope of scopes.values()) scope.effects.forEach(item => item?.cleanup?.()); scopes.clear(); };
  return { React, render, unmount };
}
const all = (node, match, out = []) => {
  if (Array.isArray(node)) node.forEach(child => all(child, match, out));
  else if (node && typeof node === 'object') { if (match(node)) out.push(node); all(node.props?.children, match, out); }
  return out;
};
const text = node => Array.isArray(node) ? node.map(text).join('') : node === null || node === undefined || typeof node === 'boolean' ? '' : typeof node === 'object' ? text(node.props?.children) : String(node);
const classed = (tree, name) => all(tree, node => typeof node.type === 'string' && String(node.props?.className ?? '').split(' ').includes(name));
const buttons = (tree, label) => all(tree, node => node.type === 'button' && text(node).includes(label));
const t = (key, args = {}) => Object.entries(args).reduce((value, [name, arg]) => value.replace(`{${name}}`, String(arg)), zh[key] ?? key);
const tick = () => new Promise(resolve => setImmediate(resolve));

/** 只读的假服务端：按契约校验入参，before 倒序、after 升序，每页 page 期。 */
function server({ page = 30, hooks = {} } = {}) {
  const calls = [], contract = newsContract(z);
  const newsRequest = async (input, signal) => {
    contract.manage.parse(input);
    calls.push(input);
    signal?.throwIfAborted();
    const custom = hooks[input.action]?.(input, calls);
    if (custom) return custom;
    if (input.action === 'days') return { fieldId: 'ai-tips', first: days.at(-1).date, days };
    if (input.after) {
      const list = reports.filter(item => item.cutoff > input.after).sort((a, b) => a.cutoff.localeCompare(b.cutoff)).slice(0, page);
      return { reports: list, nextBefore: null, nextAfter: list.length === page ? list.at(-1).cutoff : null };
    }
    const list = reports.filter(item => !input.before || item.cutoff < input.before).slice(0, page);
    return { reports: list, nextBefore: list.length === page ? list.at(-1).cutoff : null };
  };
  return { calls, newsRequest };
}
function mount(props = {}) {
  const react = runtime(), h = react.React.createElement;
  const Glyph = function Glyph({ name }) { return h('svg', { 'data-glyph': name }); };
  const Modal = function Modal({ title, onClose, className, children }) {
    return h('dialog', { className: ['ww-modal ww-page', className].filter(Boolean).join(' '), 'aria-label': title }, h('header', { className: 'ww-header' }, h('h2', null, title), h('button', { type: 'button', onClick: onClose, 'aria-label': title }, '×')), children);
  };
  const { TipsPage } = createTipsView({ React: react.React, Glyph, Modal });
  const errors = [], links = [], events = [];
  const api = props.api ?? server();
  const base = { api, t, busy: false, today, field: { name: 'AI 使用技巧', enabled: true, deleted: false }, setError: (message, action) => errors.push({ message, action }), externalLink: (url, label) => { links.push(url); return h('a', { href: url }, label); }, onBack: () => events.push('back'), onEditSources: () => events.push('edit') };
  let element = h(TipsPage, { ...base, ...props, api });
  let tree = react.render(element);
  const view = {
    api, errors, links, events,
    get tree() { return tree; },
    render(next) { if (next) element = h(TipsPage, { ...base, ...props, api, ...next }); tree = react.render(element); return tree; },
    async settle() { for (let i = 0; i < 6; i++) { await tick(); tree = react.render(element); } return tree; },
    unmount: react.unmount,
  };
  return view;
}
const press = node => node.props.onClick({ preventDefault() {}, stopPropagation() {} });
const key = (node, name) => node.props.onKeyDown({ key: name, preventDefault() {}, target: node, currentTarget: node });

test('进入时先读日期索引和最新 30 期：页头、当天首页、今天、部分来源失败、未整理、当期为空、月分隔和终点', async () => {
  const page = mount();
  assert.deepEqual(page.api.calls, [{ action: 'days', fieldId: 'ai-tips' }, { action: 'reports', fieldId: 'ai-tips' }]);
  assert.ok(all(page.tree, node => node.props?.['aria-busy'] === true).length, '读取中先显示骨架');
  assert.match(text(page.tree), /知识卡片›AI 使用技巧/);
  const tree = await page.settle(), body = text(tree);
  assert.ok(body.includes('每天 08:00 随每日资讯整理 · 共 7 期'));
  assert.equal(page.api.calls.length, 2, '最新 30 期已经覆盖全部，不再多读');
  const featured = tipIndex('2026-10-24', 6), feature = classed(tree, 'ww-tips-feature')[0];
  assert.equal(feature.props['data-tip'], `2026-10-24#${featured}`);
  assert.ok(text(feature).includes(`当天首页${String(featured + 1).padStart(2, '0')}`));
  assert.equal(classed(classed(tree, 'ww-tips-day')[0], 'ww-tips-row').length, 5, '其余 5 条排两列');
  assert.ok(body.includes('24') && body.includes('10 月 · 周六') && body.includes('今天'));
  assert.ok(text(classed(tree, 'ww-tips-day')[1]).includes('部分来源失败'));
  assert.ok(body.includes('21–22未整理 · 这两天 08:00 时 DSH 没有运行，或整理没有完成'));
  assert.ok(body.includes('当天来源里没有可照着做的技巧'));
  assert.ok(body.includes('1–18未整理 · 这 18 天'));
  assert.ok(body.includes('2026 年 9 月'));
  assert.ok(body.includes('2025 年 12 月 8 日 · 第一期'));
  assert.equal(classed(tree, 'ww-ruler-arm').length, 1); assert.equal(classed(tree, 'ww-ruler-year').length, 1);
  page.unmount();
});

test('面包屑回首页、编辑来源；停用时换成“到卡片设置开启”，删除后只读并隐藏按钮', async () => {
  const page = mount();
  await page.settle();
  press(buttons(page.tree, '知识卡片')[0]); press(buttons(page.tree, '编辑来源')[0]);
  assert.deepEqual(page.events, ['back', 'edit']);
  page.render({ busy: true });
  assert.equal(buttons(page.tree, '编辑来源')[0].props.disabled, true);
  page.render({ busy: false, field: { name: 'AI 使用技巧', enabled: false, deleted: false } });
  assert.ok(text(classed(page.tree, 'ww-tips-crumbs')[0]).includes('已停用'));
  press(buttons(page.tree, '到卡片设置开启')[0]);
  assert.deepEqual(page.events, ['back', 'edit', 'edit']);
  page.render({ field: { name: 'AI 使用技巧', enabled: false, deleted: true } });
  assert.ok(text(page.tree).includes('领域已删除 · 只读'));
  assert.equal(buttons(page.tree, '编辑来源').length + buttons(page.tree, '到卡片设置开启').length, 0);
  page.render({ field: null });
  assert.ok(text(page.tree).includes('领域已删除 · 只读'), '领域记录不存在按只读处理');
  assert.ok(text(page.tree).includes('2026-10-24 第 1 条技巧'), '历史仍可读');
  page.unmount();
});

test('一期都没有：隐藏横臂和竖臂，只画今天的空心节点和说明', async () => {
  const page = mount({ api: server({ hooks: { days: () => ({ fieldId: 'ai-tips', first: null, days: [] }), reports: () => ({ reports: [], nextBefore: null }) } }) });
  const tree = await page.settle();
  assert.ok(text(tree).includes('还没有技巧。第一期会在 08:00 随每日资讯整理好，DSH 需要开着。'));
  assert.equal(classed(tree, 'ww-ruler-arm').length + classed(tree, 'ww-ruler-year').length, 0);
  assert.ok(text(tree).includes('每天 08:00 随每日资讯整理') && !text(tree).includes('共 0 期'));
  page.unmount();
});

test('日期索引没读出来：不显示曲尺，按 reports 往下读并在底部取更早的，右上角提示带重试', async () => {
  let fail = true;
  const page = mount({ api: server({ page: 3, hooks: { days: () => { if (fail) throw new Error('索引坏了'); } } }) });
  let tree = await page.settle();
  assert.equal(page.errors[0].message, '日期索引没读出来，刻度尺先不显示：索引坏了');
  assert.equal(page.errors[0].action.label, '重试');
  assert.equal(classed(tree, 'ww-ruler-arm').length, 0);
  assert.ok(text(tree).includes('2026-10-24 第 1 条技巧'));
  assert.ok(page.api.calls.some(call => call.before === cutoff('2026-10-20')), '离底部近时用 nextBefore 取更早的');
  assert.ok(text(classed(tree, 'ww-tips-more')[0]).includes('正在读取更早的技巧'), '还有更早的：底部转圈');
  fail = false; page.errors[0].action.run();
  tree = await page.settle();
  assert.equal(classed(tree, 'ww-ruler-arm').length, 1, '重试后刻度尺出来');
  page.unmount();
});

test('索引和日报都没读出来：时间线中央写原因，“重新读取”整页重读', async () => {
  let fail = true;
  const broken = () => { if (fail) throw new Error('网络断了'); };
  const page = mount({ api: server({ hooks: { days: broken, reports: broken } }) });
  let tree = await page.settle();
  assert.ok(text(classed(tree, 'ww-tips-error')[0]).includes('技巧历史没读出来：网络断了'));
  assert.equal(page.errors.length, 0, '整页说明原因，不再弹提示');
  fail = false; press(buttons(tree, '重新读取')[0]);
  tree = await page.settle();
  assert.equal(classed(tree, 'ww-tips-error').length, 0);
  assert.ok(text(tree).includes('共 7 期'));
  page.unmount();
});

test('没读取的日子按估算高度放骨架，取回后换成正文；某一段失败原位留“重新读取”，提示带重试', async () => {
  let fail = true;
  const page = mount({ api: server({ page: 1, hooks: { reports: input => { if (input.before && fail) throw new Error('超时'); } } }) });
  let tree = await page.settle();
  const day23 = classed(tree, 'ww-tips-day')[1];
  assert.ok(text(day23).includes('这一段没读出来'), '失败原位留一行');
  assert.equal(page.errors.at(-1).message, '这一段技巧没读出来：超时');
  assert.deepEqual(page.api.calls.filter(call => call.before).map(call => call.before), [cutoff('2026-10-24')], '失败后不反复请求');
  fail = false; press(buttons(day23, '重新读取')[0]);
  tree = await page.settle();
  assert.ok(text(classed(tree, 'ww-tips-day')[1]).includes('2026-10-23 第 1 条技巧'));
  assert.ok(page.api.calls.filter(call => call.before).length >= 2);
  page.unmount();
});

test('点主卡或任一行打开详情：序号、当天首页、发布时间、引导块、原文；上一条 / 下一条跨天，到头置灰', async () => {
  const page = mount();
  let tree = await page.settle();
  const featured = tipIndex('2026-10-24', 6);
  press(classed(tree, 'ww-tips-feature')[0]);
  tree = page.render();
  let dialog = classed(tree, 'ww-tips-detail')[0];
  assert.equal(dialog.props['aria-label'], `2026-10-24 第 ${featured + 1} 条技巧`);
  assert.ok(text(dialog).includes(`AI 使用技巧 · 10 月 24 日 · 第 ${featured + 1} / 6 条`));
  assert.ok(text(dialog).includes('当天首页'));
  assert.ok(text(dialog).includes(`${featured % 2 ? '宝玉' : 'Anthropic 工程博客'} · 10 月 23 日 21:40 发布`), '发布时间按北京时间');
  assert.ok(text(classed(dialog, 'ww-tips-guide')[0]).includes(`第 ${featured + 1} 条的做法`));
  assert.ok(page.links.includes(`https://www.example.org/2026-10-24/${featured}`));
  assert.ok(text(classed(dialog, 'ww-tips-origin')[0]).includes(`example.org/2026-10-24/${featured} ↗`));
  // 一路往后翻到 10/23 的第一条。
  for (let i = featured; i < 6; i++) { press(buttons(classed(page.tree, 'ww-tips-detail')[0], '下一条')[0]); page.render(); }
  dialog = classed(page.tree, 'ww-tips-detail')[0];
  assert.ok(text(dialog).includes('10 月 23 日 · 第 1 / 4 条'));
  press(buttons(dialog, '上一条')[0]); dialog = classed(page.render(), 'ww-tips-detail')[0];
  assert.ok(text(dialog).includes('10 月 24 日 · 第 6 / 6 条'));
  // 第一条往前到头置灰；关闭后弹窗消失。
  for (let i = 0; i < 5; i++) { press(buttons(classed(page.tree, 'ww-tips-detail')[0], '上一条')[0]); page.render(); }
  dialog = classed(page.tree, 'ww-tips-detail')[0];
  assert.ok(text(dialog).includes('第 1 / 6 条'));
  assert.equal(buttons(dialog, '上一条')[0].props.disabled, true);
  press(all(dialog, node => node.type === 'button' && text(node) === '×')[0]);
  assert.equal(classed(page.render(), 'ww-tips-detail').length, 0);
  // 行也能打开；最早一期最后一条的“下一条”置灰。先用键盘 End 把时间线带到最早一期。
  key(all(page.tree, node => node.props?.role === 'slider')[0], 'End'); page.render();
  press(classed(page.tree, 'ww-tips-row').find(row => row.props['data-tip'] === '2025-12-08#1') ?? classed(page.tree, 'ww-tips-feature').find(card => card.props['data-tip'] === '2025-12-08#1'));
  dialog = classed(page.render(), 'ww-tips-detail')[0];
  assert.ok(text(dialog).includes('12 月 8 日 · 第 2 / 2 条'));
  assert.equal(buttons(dialog, '下一条')[0].props.disabled, true);
  page.unmount();
});

test('详情切到还没读取的日期：先用 before 取再切；读取失败停在当前条，提示带重试', async () => {
  let fail = false, auto = true;
  const page = mount({ api: server({ page: 1, hooks: { reports: input => { if (input.before && (auto || fail)) { auto = false; throw new Error('超时'); } } } }) });
  let tree = await page.settle();
  const featured = tipIndex('2026-10-24', 6);
  press(classed(tree, 'ww-tips-feature')[0]); page.render();
  for (let i = featured; i < 5; i++) { press(buttons(classed(page.tree, 'ww-tips-detail')[0], '下一条')[0]); page.render(); }
  fail = true;
  press(buttons(classed(page.tree, 'ww-tips-detail')[0], '下一条')[0]);
  assert.equal(all(classed(page.render(), 'ww-tips-detail')[0], node => node.props?.['aria-busy'] === true).length, 1, '按钮上显示小转圈');
  tree = await page.settle();
  assert.ok(text(classed(tree, 'ww-tips-detail')[0]).includes('第 6 / 6 条'), '失败停在当前条');
  assert.equal(page.errors.at(-1).message, '没读到 10 月 23 日的技巧');
  fail = false; page.errors.at(-1).action.run();
  tree = await page.settle();
  assert.ok(text(classed(tree, 'ww-tips-detail')[0]).includes('10 月 23 日 · 第 1 / 4 条'));
  assert.deepEqual(page.api.calls.at(-1), { action: 'reports', fieldId: 'ai-tips', before: cutoff('2026-10-24') });
  page.unmount();
});

test('竖臂是可聚焦的 slider：↑↓ 按有技巧的日子、PageUp/PageDown 按月、Home/End 到头尾，年份随之切换', async () => {
  const page = mount();
  let tree = await page.settle();
  const slider = () => all(page.tree, node => node.props?.role === 'slider')[0];
  assert.equal(slider().props.tabIndex, 0);
  assert.equal(slider().props['aria-label'], '日期定位');
  assert.equal(slider().props['aria-valuetext'], '2026 年 10 月 24 日，6 条');
  key(slider(), 'ArrowDown'); page.render();
  assert.equal(slider().props['aria-valuetext'], '2026 年 10 月 23 日，4 条');
  key(slider(), 'PageDown'); page.render();
  assert.equal(slider().props['aria-valuetext'], '2026 年 9 月 30 日，2 条');
  assert.ok(classed(page.tree, 'ww-ruler-month-on').some(node => text(node).startsWith('9 月')), '所在月的标签加深');
  key(slider(), 'End'); tree = page.render();
  assert.equal(slider().props['aria-valuetext'], '2025 年 12 月 8 日，2 条');
  assert.equal(all(tree, node => node.props?.['data-year'] === 2025)[0].props['aria-pressed'], true, '滚过 1 月 1 日后年份轴选中 2025');
  assert.deepEqual(classed(tree, 'ww-ruler-month').map(node => text(node)), ['12 月1 期'], '竖臂换成 2025 年 12 月一段');
  key(slider(), 'Home'); page.render();
  assert.equal(slider().props['aria-valuetext'], '2026 年 10 月 24 日，6 条');
  page.unmount();
});

test('横臂年份轴：点年份跳到该年最新一期；月格可点，没有技巧的月格写“没有技巧”，未来月份不画', async () => {
  const page = mount();
  let tree = await page.settle();
  const labels = all(tree, node => node.props?.['data-year']);
  assert.deepEqual(labels.map(node => text(node)), ['20266 期', '20251 期']);
  const cells = classed(tree, 'ww-ruler-cell');
  assert.equal(cells.length, 10 + 12, '2026 年只画到 10 月');
  const august = cells.find(cell => cell.props.title.startsWith('2026 年 8 月'));
  assert.equal(august.props['aria-disabled'], true); assert.equal(august.props.title, '2026 年 8 月 · 没有技巧');
  assert.equal(cells.find(cell => cell.props.title.startsWith('2026 年 9 月')).props.title, '2026 年 9 月 · 2 期');
  press(labels[1]); tree = page.render();
  assert.equal(all(tree, node => node.props?.['data-year'] === 2025)[0].props['aria-pressed'], true);
  press(classed(tree, 'ww-ruler-cell').find(cell => cell.props.title.startsWith('2026 年 9 月'))); page.render();
  assert.equal(all(page.tree, node => node.props?.role === 'slider')[0].props['aria-valuetext'], '2026 年 9 月 30 日，2 条');
  // ←/→ 切换年份。
  all(page.tree, node => node.props?.role === 'toolbar')[0].props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} }); page.render();
  assert.equal(all(page.tree, node => node.props?.['data-year'] === 2025)[0].props['aria-pressed'], true);
  // 竖臂月标签跳到该月最新一期。
  key(all(page.tree, node => node.props?.role === 'slider')[0], 'Home'); page.render();
  press(classed(page.tree, 'ww-ruler-month').find(node => text(node).startsWith('9 月'))); page.render();
  assert.equal(all(page.tree, node => node.props?.role === 'slider')[0].props['aria-valuetext'], '2026 年 9 月 30 日，2 条');
  page.unmount();
});

test('从首页技巧卡进入：滚到那天，当天首页那条（或指定那条）描边', async () => {
  const featured = tipIndex('2026-10-24', 6);
  const page = mount({ focus: { date: '2026-10-24', index: featured } });
  const tree = await page.settle();
  assert.ok(String(classed(tree, 'ww-tips-feature')[0].props.className).includes('ww-tips-flash'));
  page.unmount();
  const other = mount({ focus: { date: '2026-10-23', index: 2 } });
  const next = await other.settle();
  assert.ok(String(all(next, node => node.props?.['data-tip'] === '2026-10-23#2')[0].props.className).includes('ww-tips-flash'));
  other.unmount();
});

test('旧格式条目只有 summary：主卡说明和引导块都显示 summary 原文；没有链接时隐藏原文区和“打开原文”', async () => {
  const legacy = { ...report(['2026-10-24', 1]), items: [{ title: '旧格式的一条技巧', summary: '旧格式的做法说明', importance: '重要', relevance: '相关', workImpact: '影响', eventKey: 'old', sources: [{ ...candidate('2026-10-24', 0), url: '' }] }] };
  const page = mount({ api: server({ hooks: { days: () => ({ fieldId: 'ai-tips', first: '2026-10-24', days: [{ date: '2026-10-24', cutoff: cutoff('2026-10-24'), count: 1, status: 'complete' }] }), reports: () => ({ reports: [legacy], nextBefore: null }) } }) });
  let tree = await page.settle();
  assert.ok(text(classed(tree, 'ww-tips-feature')[0]).includes('旧格式的做法说明'));
  press(classed(tree, 'ww-tips-feature')[0]); tree = page.render();
  const dialog = classed(tree, 'ww-tips-detail')[0];
  assert.ok(text(classed(dialog, 'ww-tips-guide')[0]).includes('旧格式的做法说明'));
  assert.equal(classed(dialog, 'ww-tips-origin').length + classed(dialog, 'ww-tips-open').length, 0);
  assert.equal(buttons(dialog, '上一条')[0].props.disabled, true); assert.equal(buttons(dialog, '下一条')[0].props.disabled, true);
  page.unmount();
});

test('外壳“刷新”改 reloadKey：整页重读索引和最新一页，详情随之关闭', async () => {
  const page = mount({ reloadKey: 0 });
  let tree = await page.settle();
  press(classed(tree, 'ww-tips-feature')[0]); page.render();
  assert.equal(classed(page.tree, 'ww-tips-detail').length, 1);
  page.render({ reloadKey: 1 });
  tree = await page.settle();
  assert.deepEqual(page.api.calls.slice(-2), [{ action: 'days', fieldId: 'ai-tips' }, { action: 'reports', fieldId: 'ai-tips' }]);
  assert.equal(classed(tree, 'ww-tips-detail').length, 0);
  assert.ok(text(tree).includes('共 7 期'));
  page.unmount();
});
