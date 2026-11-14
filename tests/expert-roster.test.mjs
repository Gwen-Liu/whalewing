import test from 'node:test';
import assert from 'node:assert/strict';
import { expertActivity, rosterOf, sortInUse, taskTitle, daysAgo, dayMs } from '../features/experts/roster.js';

const now = Date.UTC(2026, 10, 8, 12);
const session = (expertId, updatedAt, { projectionValues = {}, ...extra } = {}) => ({ updatedAt, title: '', blank: false, ...extra, projectionValues: { whalewingExpert: { expertId }, ...projectionValues } });
const experts = ['manager', 'development', 'writing', 'research', 'p03'].map(id => ({ id, name: { manager: '小鲸助手', development: '研发专家', writing: '写作专家', research: '研究专家', p03: 'DSH 版本观察员' }[id] }));

test('会话按专家归拢：最后一次用的时间、任务新的在前、手上最要紧的一件，子代理和没说过话的不算用过', () => {
  const snapshot = { byId: {
    a: session('development', now - 3 * dayMs, { title: '研发专家 · 旧任务' }),
    b: session('development', now - 60_000, { title: '研发专家 · 修复导出 Excel 乱码', projectionValues: { whalewingDispatch: { title: '修复导出 Excel 乱码', status: 'waiting' } } }),
    c: session('development', now - 30_000, { running: true }),
    d: session('writing', now - dayMs, { parentSessionId: 'x' }),
    e: session('writing', now - 2 * dayMs, { blank: true }),
    f: session('research', now - 10 * dayMs, { projectionValues: { whalewingDispatch: { title: '老调研', status: 'running' } } }),
  } };
  const activity = expertActivity(snapshot, { now });
  const dev = activity.get('development');
  assert.equal(dev.lastUsed, now - 30_000);
  assert.deepEqual(dev.sessions.map(item => item.id), ['c', 'b', 'a']);
  assert.equal(dev.busy.id, 'b', '等你审批的比在做的要紧');
  assert.equal(dev.busy.status, 'waiting');
  assert.equal(activity.get('writing').lastUsed, 0, '子代理不算、没说过话的不算用过');
  assert.equal(activity.get('writing').sessions.length, 1);
  assert.equal(activity.get('research').busy, null, '一周前还挂着“在做”的不算手上的事');
});

test('归档的任务不算手上的事', () => {
  const snapshot = { byId: { b: session('development', now - 60_000, { projectionValues: { whalewingDispatch: { title: 'x', status: 'running' } } }) } };
  assert.equal(expertActivity(snapshot, { now, archived: ['b'] }).get('development').busy, null);
});

test('在用：手上有事、有定时任务、最近用过或选用；没用满天数回专家库，放回后再用又回来；小鲸不在列表里', () => {
  const activity = new Map([
    ['development', { lastUsed: now - 20 * dayMs, sessions: [], busy: { id: 'b', status: 'running', updatedAt: now } }],
    ['writing', { lastUsed: now - 2 * dayMs, sessions: [], busy: null }],
    ['research', { lastUsed: now - 15 * dayMs, sessions: [], busy: null }],
  ]);
  const schedules = [{ expertId: 'p03', status: 'active', scheduledAt: '2026-11-09T01:00:00.000Z' }, { expertId: 'research', status: 'paused', scheduledAt: '2026-11-09T01:00:00.000Z' }];
  const roster = rosterOf({ experts, activity, schedules, now });
  const byId = Object.fromEntries(roster.map(entry => [entry.role.id, entry]));
  assert.equal(byId.manager, undefined);
  assert.equal(byId.development.inUse, true); assert.equal(byId.development.working, true);
  assert.equal(byId.writing.inUse, true); assert.equal(byId.writing.remainingDays, 12);
  assert.equal(byId.research.inUse, false, '15 天没用、定时任务暂停了：回专家库');
  assert.equal(byId.p03.inUse, true); assert.equal(byId.p03.nextRun, '2026-11-09T01:00:00.000Z');
  const returned = rosterOf({ experts, activity, schedules, now, marks: { writing: { state: 'returned', at: now - 3 * dayMs }, development: { state: 'returned', at: now } } });
  assert.equal(returned.find(entry => entry.role.id === 'writing').inUse, true, '放回之后又用过');
  assert.equal(returned.find(entry => entry.role.id === 'development').inUse, true, '手上有事的放不回去');
  const putBack = rosterOf({ experts, activity, schedules, now, marks: { writing: { state: 'returned', at: now } } });
  assert.equal(putBack.find(entry => entry.role.id === 'writing').inUse, false);
  const picked = rosterOf({ experts, activity, schedules, now, marks: { research: { state: 'picked', at: now - dayMs } } });
  assert.equal(picked.find(entry => entry.role.id === 'research').inUse, true);
  const never = rosterOf({ experts, activity, schedules, now, idleDays: 0 });
  assert.equal(never.find(entry => entry.role.id === 'research').inUse, true, '设成不自动放回');
  assert.equal(never.find(entry => entry.role.id === 'writing').remainingDays, null);
});

test('左栏顺序：等审批、在做，其余按最近用过', () => {
  const entry = (id, lastUsed, busy) => ({ role: { id, name: id }, inUse: true, lastUsed, busy: busy ? { status: busy } : null });
  const sorted = sortInUse([entry('a', now - 1000), entry('b', now - 5000, 'running'), entry('c', now - 9000, 'waiting'), entry('d', now), { ...entry('e', now), inUse: false }]);
  assert.deepEqual(sorted.map(item => item.role.id), ['c', 'b', 'd', 'a']);
});

test('任务标题去掉专家名；几天前按北京时间的日子算', () => {
  assert.equal(taskTitle('研发专家 · 修复导出 Excel 乱码', '研发专家'), '修复导出 Excel 乱码');
  assert.equal(taskTitle('自己起的名字', '研发专家'), '自己起的名字');
  assert.equal(daysAgo(null, now), null);
  const beijingMidnight = Date.UTC(2026, 10, 8, 16); // 北京 11-09 00:00
  assert.equal(daysAgo(beijingMidnight - 60_000, beijingMidnight + 60_000), 1, '跨过北京零点算昨天');
  assert.equal(daysAgo(beijingMidnight + 60_000, beijingMidnight + 120_000), 0);
});
