import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { sessionSchedule } from '../src/schedule-compat.js';
import { isScheduleChangeNotice, isScheduledDelivery } from '../src/schedule-notice.js';
import { automationContract } from '../features/automation/contract.js';

// DSH 0.2.2 的目录条目：记录字段铺开，另带投递目标、涉及会话、状态和版本时间。
const row = (id, target, extra = {}) => ({ id, kind: 'daily', title: id, prompt: '指令', scheduledAt: '2030-01-01T00:00:00.000Z', time: '08:00:00.000', timeZone: 'Asia/Shanghai', target, involvedSessionIds: target.sessionId ? [target.sessionId] : [], status: 'active', createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z', ...extra });

function native(rows) {
  const calls = [];
  return {
    calls,
    async catalog() { return structuredClone(rows); },
    async view({ id }) { const found = rows.find(item => item.id === id); return found ? structuredClone(found) : { id, code: 'schedule_not_found' }; },
    async create(request, actor) { calls.push(['create', request, actor]); const created = row('created', request.target, { title: request.title, prompt: request.prompt }); rows.push(created); return structuredClone(created); },
    async edit(request, actor) {
      calls.push(['edit', request, actor]);
      const index = rows.findIndex(item => item.id === request.id);
      if (request.action === 'delete') { rows.splice(index, 1); return { id: request.id, deleted: true }; }
      if (request.expectedUpdatedAt !== rows[index].updatedAt) return { id: request.id, code: 'schedule_conflict' };
      const { active, timing: _timing, ...fields } = request.patch;
      rows[index] = { ...rows[index], ...fields, ...(active === undefined ? {} : { status: active ? 'active' : 'paused' }), updatedAt: '2026-11-06T00:00:01.000Z' };
      return structuredClone(rows[index]);
    },
    async history(request) { calls.push(['history', request]); return { id: request.id, records: [{ scheduledAt: 'a', deliveredAt: 'b', messageId: 'm', targetSessionId: 'own' }], earlierRecordsUnavailable: false, earlierRecordsPruned: false, retention: { days: 30, records: 200 } }; },
  };
}

test('目录只列投递到已有会话的任务，换回 sessionId 和 inactive，去掉新版附加字段', async () => {
  const rows = [
    row('own', { kind: 'session', sessionId: 'own' }, { status: 'ended', lastDelivery: { scheduledAt: 'a', deliveredAt: 'b', messageId: 'm', targetSessionId: 'own' } }),
    row('reserved', { kind: 'new_once', sessionId: 'not-yet', create: {} }),
    row('fresh', { kind: 'new', create: {} }),
    row('custom', { kind: 'session', sessionId: 'own' }, { kind: 'rrule', rrule: 'DTSTART;TZID=Asia/Shanghai:20300101T080000\nRRULE:FREQ=DAILY', time: undefined, timeZone: undefined, executionActive: true }),
  ].map(item => JSON.parse(JSON.stringify(item)));
  const tasks = await sessionSchedule(native(rows)).catalog();
  assert.deepEqual(tasks.map(task => task.id), ['custom', 'own'], 'DSH 自动化页建的新建会话类任务不归鲸翼管');
  const own = tasks.find(task => task.id === 'own');
  assert.equal(own.sessionId, 'own'); assert.equal(own.status, 'inactive');
  assert.deepEqual(own.lastDelivery, { scheduledAt: 'a', deliveredAt: 'b', messageId: 'm' });
  for (const key of ['target', 'involvedSessionIds', 'createdAt', 'updatedAt', 'executionActive']) assert.equal(key in own, false, key);
  // 自定义规则的任务也能过鲸翼的结果契约，页面不会整页解析失败。
  const contract = automationContract(z);
  const managed = tasks.map(task => ({ ...task, purpose: 'custom', displayPrompt: task.prompt }));
  assert.equal(contract.result.safeParse({ available: true, controls: true, tasks: managed, legacyTasks: [], issues: [] }).success, true);
});

test('建任务按新写法提交：时间规则带 kind，投递到自己的会话，并以它为操作方', async () => {
  const service = native([]);
  const record = await sessionSchedule(service).create('own', { title: '任务', prompt: '指令', every_seconds: 3600 });
  assert.deepEqual(service.calls[0], ['create', { title: '任务', prompt: '指令', timing: { kind: 'every', every_seconds: 3600 }, target: { kind: 'session', sessionId: 'own' } }, 'own']);
  assert.equal('target' in record, false); assert.equal(record.id, 'created');
});

test('改、暂停、恢复先比对员工看到的记录，再带版本时间走 edit；别的会话的任务按找不到处理', async () => {
  const rows = [row('own', { kind: 'session', sessionId: 'own' })];
  const service = native(rows), schedule = sessionSchedule(service);
  const [entry] = await schedule.catalog();
  const { sessionId: _session, status: _status, ...expected } = entry;
  assert.equal((await schedule.update({ sessionId: 'other', id: 'own', expected, title: '改' })).code, 'schedule_not_found');
  assert.equal((await schedule.update({ sessionId: 'own', id: 'own', expected: { ...expected, title: '旧' }, title: '改' })).code, 'schedule_conflict');
  const paused = await schedule.pause({ sessionId: 'own', id: 'own', expected, expectedStatus: 'active' });
  assert.equal(paused.updated, true);
  assert.deepEqual(service.calls.at(-1), ['edit', { id: 'own', action: 'update', patch: { active: false }, expectedUpdatedAt: '2026-11-06T00:00:00.000Z' }, 'own']);
  assert.equal((await schedule.catalog())[0].status, 'paused');
  assert.equal((await schedule.resume({ sessionId: 'own', id: 'own', expected, expectedStatus: 'active' })).code, 'schedule_conflict', '状态和员工看到的不一样时不改');
  assert.equal((await schedule.resume({ sessionId: 'own', id: 'own', expected, expectedStatus: 'paused' })).updated, true);
  const renamed = await schedule.update({ sessionId: 'own', id: 'own', expected, title: '新名字' });
  assert.equal(renamed.updated, true); assert.equal(renamed.record.title, '新名字');
  const page = await schedule.history({ sessionId: 'own', id: 'own', limit: 10 });
  assert.deepEqual(page.records, [{ scheduledAt: 'a', deliveredAt: 'b', messageId: 'm' }]);
  assert.deepEqual(service.calls.at(-1), ['history', { id: 'own', limit: 10 }]);
  assert.deepEqual(await schedule.delete({ sessionId: 'own', id: 'own' }), { id: 'own', deleted: true });
  assert.equal(sessionSchedule(undefined), undefined, 'DSH 没有定时服务时照旧当作不可用');
});

test('DSH 的改动通知来源也是 schedule，但不算一次定时送达', () => {
  const notice = { id: 'n', source: { kind: 'schedule' }, content: [{ type: 'text', text: '[SCHEDULE CHANGE]\nA scheduled task involving this session was changed outside this session.' }] };
  const delivery = { id: 'd', source: { kind: 'schedule' }, content: [{ type: 'text', text: '每日记忆' }] };
  assert.equal(isScheduleChangeNotice(notice), true); assert.equal(isScheduledDelivery(notice), false);
  assert.equal(isScheduleChangeNotice(delivery), false); assert.equal(isScheduledDelivery(delivery), true);
  assert.equal(isScheduledDelivery({ ...delivery, source: { kind: 'user' } }), false);
});
