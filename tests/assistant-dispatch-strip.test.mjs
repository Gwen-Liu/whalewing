import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchItems, createDispatchStrip, stripWindowMs, finishedLimit } from '../features/assistant/dispatch-strip.js';

const now = Date.UTC(2026, 10, 8, 18, 0);
const task = (status, minutesAgo, extra = {}) => ({ title: `专家 · ${status}${minutesAgo}`, updatedAt: now - minutesAgo * 60000, projectionValues: { whalewingDispatch: { title: '事项', from: 'whalewing-assistant-x', status, reply: '', turns: 1 } }, ...extra });

test('派出去的事：在做、等审批的全列，等审批排最前；做完的只留最近 3 件；七天前的、归档的、普通会话不列', () => {
  const snapshot = { byId: {
    a: task('running', 30), b: task('waiting', 50), c: task('queued', 5), d: task('running', 1),
    e: task('completed', 2), f: task('error', 3), g: task('interrupted', 4), h: task('completed', 6),
    old: task('running', stripWindowMs / 60000 + 1), gone: task('waiting', 1), plain: { title: '普通会话', updatedAt: now, projectionValues: { whalewingDispatch: null } },
    child: task('running', 1, { parentSessionId: 'a' }),
  } };
  const { active, finished, waiting } = dispatchItems(snapshot, { now, archived: ['gone'] });
  assert.deepEqual(active.map(item => item.id), ['b', 'd', 'a', 'c']);
  assert.deepEqual(finished.map(item => item.id), ['e', 'f', 'g']);
  assert.equal(finished.length, finishedLimit);
  assert.equal(waiting, 1);
  assert.equal(active[0].title, '专家 · waiting50');
  // 标题没有时用派工登记的事项名。
  assert.equal(dispatchItems({ byId: { x: task('completed', 1, { title: '' }) } }, { now }).finished[0].title, '事项');
  assert.deepEqual(dispatchItems({ byId: {} }, { now }), { active: [], finished: [], waiting: 0 });
  assert.deepEqual(dispatchItems(undefined, { now }), { active: [], finished: [], waiting: 0 });
});

test('面板上的“派出去的事”：没有就不显示；默认收成一行，按钮打开任务，等审批的按钮叫“去审批”', () => {
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  const textOf = tree => nodes(tree).flatMap(node => (node.props.children ?? []).filter(child => typeof child === 'string')).join('|');
  let state = null;
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useSyncExternalStore: (_subscribe, read) => read(), useState: initial => [state ?? initial, value => { state = value; }] };
  const words = { dispatchStrip: '派出去的事', dispatchWaitingCount: '{count} 件等你审批', dispatchActiveCount: '{count} 件在做', dispatchDoneCount: '最近做完 {count} 件', dispatchOpen: '打开', dispatchApprove: '去审批', dispatchStripHelp: '说明', dispatchState_waiting: '等你审批', dispatchState_running: '在做', dispatchState_completed: '做完了' };
  const t = (key, values = {}) => (words[key] ?? key).replace(/\{(\w+)\}/g, (_m, name) => values[name]);
  const opened = [];
  let snapshot = { byId: {} };
  const api = { subscribeSessions: () => () => {}, sessionsSnapshot: () => snapshot, archivedSessions: () => [] };
  const Strip = createDispatchStrip(react);
  const render = () => Strip({ api, t, openTask: id => opened.push(id) });
  assert.equal(render(), null, '没有派出去的事时不显示');

  const fresh = Date.now();
  snapshot = { byId: {
    w: { title: '写作专家 · 写介绍', updatedAt: fresh, projectionValues: { whalewingDispatch: { title: '写介绍', from: 'x', status: 'waiting', reply: '', turns: 1 } } },
    r: { title: '研发专家 · 修登录', updatedAt: fresh - 1000, projectionValues: { whalewingDispatch: { title: '修登录', from: 'x', status: 'running', reply: '', turns: 1 } } },
    c: { title: '研究专家 · 查资料', updatedAt: fresh - 2000, projectionValues: { whalewingDispatch: { title: '查资料', from: 'x', status: 'completed', reply: '好了', turns: 1 } } },
  } };
  const busy = render();
  assert.equal(busy.type, 'details');
  assert.equal(busy.props.open, false, '默认收成一行（2026-11-08 用户嫌占地方）');
  assert.match(textOf(busy), /派出去的事\|1 件等你审批 · 1 件在做/);
  assert.match(textOf(busy), /等你审批\|写作专家 · 写介绍\|去审批\|在做\|研发专家 · 修登录\|打开\|做完了\|研究专家 · 查资料\|打开/);
  const buttons = nodes(busy).filter(node => node.type === 'button');
  assert.equal(buttons[0].props['aria-label'], '去审批：写作专家 · 写介绍');
  buttons[0].props.onClick();
  buttons[2].props.onClick();
  assert.deepEqual(opened, ['w', 'c']);

  // 都做完了：默认收起，摘要写最近做完几件；员工展开过就按员工的来。
  snapshot = { byId: { c: snapshot.byId.c } };
  const quiet = render();
  assert.equal(quiet.props.open, false);
  assert.match(textOf(quiet), /最近做完 1 件/);
  quiet.props.onToggle({ currentTarget: { open: true } });
  assert.equal(render().props.open, true);
});
