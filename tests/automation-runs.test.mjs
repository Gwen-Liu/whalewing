import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { runsProjection, runStatus, runsKey } from '../features/automation/runs.js';
import { automationContract, runStatuses } from '../features/automation/contract.js';
import { newsSkippedNotice } from '../src/news-gate.js';
import { controllerFixture } from './session-controller-fixture.mjs';

const scheduled = id => ({ id, role: 'user', content: [{ type: 'text', text: id }], source: { kind: 'schedule' } });
const typed = id => ({ id, role: 'user', content: [{ type: 'text', text: id }], source: { kind: 'user' } });
function log() {
  let seq = 0;
  const at = (type, data) => ({ seq: seq++, time: 1700000000000 + seq, type, data });
  return {
    at,
    insert: (start, ...inserted) => at('agent/inbox/spliced', { target: 'next-turn', start, inserted }),
    claim: (start, removedCount, target = 'next-turn') => at('agent/inbox/spliced', { target, start, removedCount, inserted: [] }),
    cancel: (start, removedCount) => at('agent/inbox/spliced', { target: 'next-turn', start, removedCount, inserted: [], outcome: 'canceled' }),
    end: kind => at('turn/end', { turn: 1, reason: { kind } }),
  };
}
const fold = events => events.reduce((state, event) => runsProjection.apply(state, event), runsProjection.init());
const states = state => Object.fromEntries(state.runs.map(row => [row.messageId, row.state]));

test('运行结果按轮次结束原因折叠：完成、出错、中断、未写完、被拦下各归其类，未知原因不当成功', () => {
  for (const [kind, expected] of [['completed', 'completed'], ['error', 'error'], ['aborted', 'interrupted'], ['interrupted', 'interrupted'], ['max-tokens', 'incomplete'], ['blocked', 'skipped'], ['someday-new', 'unknown']]) {
    const l = log();
    const state = fold([l.insert(0, scheduled('s1')), l.at('turn/start', { turn: 1 }), l.claim(0, 1), l.end(kind)]);
    assert.deepEqual(states(state), { s1: expected }, kind);
  }
  const l = log(), delivered = l.insert(0, scheduled('s1'));
  const waiting = fold([delivered]);
  assert.deepEqual(states(waiting), { s1: 'waiting' });
  const running = fold([delivered, l.at('turn/start', { turn: 1 }), l.claim(0, 1)]);
  assert.deepEqual(states(running), { s1: 'running' });
  assert.equal(running.runs[0].receivedAt, delivered.time); assert.equal(running.runs[0].seq, delivered.seq);
});

test('只认定时消息：人工消息不记运行，部分领取、撤下、退回收件箱和资讯跳过说明都对到原消息', () => {
  let l = log();
  // 人工消息和定时消息排在一起，只领取了前面的人工消息：定时消息仍在排队。
  let state = fold([l.insert(0, typed('u1')), l.insert(1, scheduled('s1')), l.claim(0, 1), l.end('completed')]);
  assert.deepEqual(states(state), { s1: 'waiting' });
  l = log();
  state = fold([l.insert(0, typed('u1'), scheduled('s1')), l.claim(0, 2), l.end('error')]);
  assert.deepEqual(states(state), { s1: 'error' });
  l = log();
  state = fold([l.insert(0, scheduled('s1')), l.cancel(0, 1), l.end('completed')]);
  assert.deepEqual(states(state), { s1: 'skipped' }, '从排队中撤下的不再被后来的轮次改写');
  l = log();
  state = fold([l.insert(0, scheduled('s1')), l.claim(0, 1), l.insert(0, scheduled('s1'))]);
  assert.deepEqual(states(state), { s1: 'waiting' }); assert.equal(state.runs.length, 1, '退回收件箱不重复记一次运行');
  l = log();
  const delivered = l.insert(0, scheduled('s1'));
  state = fold([delivered, l.claim(0, 1), l.at('command/done', { commandId: 'c', kind: 'success', text: newsSkippedNotice, sourceEventSeq: delivered.seq }), l.end('completed')]);
  assert.deepEqual(states(state), { s1: 'skipped' }, '同批还有人工消息时轮次正常结束，被跳过的资讯仍是跳过');
  l = log();
  state = fold([l.insert(0, scheduled('s1')), l.claim(0, 1), l.at('command/done', { commandId: 'c', kind: 'success', text: newsSkippedNotice, sourceEventSeq: 99 }), l.end('completed')]);
  assert.deepEqual(states(state), { s1: 'completed' }, '说明必须指向这次送达');
  l = log();
  state = fold([l.insert(0, scheduled('a')), l.insert(1, scheduled('b')), l.claim(0, 1, 'next-turn'), l.end('completed'), l.claim(0, 1), l.end('aborted')]);
  assert.deepEqual(states(state), { a: 'completed', b: 'interrupted' });
});

test('与运行无关的事件和异常输入不改变状态引用，也不抛错；记录只留最近 50 次', () => {
  const initial = runsProjection.init();
  for (const event of [null, {}, { type: 'turn/start', data: { turn: 1 } }, { type: 'assistant/message', data: {} }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }, { type: 'command/done', data: { kind: 'success', text: '其它命令' } }, { type: 'agent/inbox/spliced', data: null }]) {
    const next = runsProjection.apply(initial, event);
    assert.equal(next.runs, initial.runs, JSON.stringify(event));
  }
  assert.equal(runsProjection.wire.view(runsProjection.apply(initial, { type: 'turn/start' })), initial.runs);
  // 收件箱镜像对不上时不猜：之后排队中的定时消息在轮次结束时记为未知。
  const l = log();
  const lost = fold([l.insert(0, scheduled('s1')), l.claim(5, 1), l.end('completed')]);
  assert.equal(lost.queue, null); assert.deepEqual(states(lost), { s1: 'unknown' });
  const many = log();
  const events = [];
  for (let i = 0; i < 60; i++) events.push(many.insert(0, scheduled('m' + i)), many.claim(0, 1), many.end('completed'));
  const trimmed = fold(events);
  assert.equal(trimmed.runs.length, 50); assert.equal(trimmed.runs[0].messageId, 'm10'); assert.equal(trimmed.runs.at(-1).messageId, 'm59');
  assert.deepEqual(runsProjection.stateSchema.parse(trimmed), trimmed);
  assert.deepEqual(runsProjection.wire.viewSchema.parse(runsProjection.wire.view(trimmed)), trimmed.runs);
});

test('按消息身份读取结果：投影读不到、需要迁移、缺少这一项或没有这次记录都是未知', () => {
  const runs = [{ messageId: 'm1', receivedAt: 1, seq: 0, state: 'completed' }];
  assert.equal(runStatus({ asOfSeq: 3, values: { [runsKey]: runs } }, 'm1'), 'completed');
  assert.equal(runStatus({ kind: 'sequenced', asOfSeq: 3, values: { [runsKey]: runs } }, 'm1'), 'completed');
  for (const projection of [null, undefined, { kind: 'migration-required', values: { [runsKey]: runs } }, { asOfSeq: 3, values: {} }, { asOfSeq: 3, values: { [runsKey]: null } }]) assert.equal(runStatus(projection, 'm1'), 'unknown');
  assert.equal(runStatus({ asOfSeq: 3, values: { [runsKey]: runs } }, 'other'), 'unknown');
  assert.equal(runStatus({ asOfSeq: 3, values: { [runsKey]: [{ messageId: 'm1', state: 'made-up' }] } }, 'm1'), 'unknown');
  assert.deepEqual(runStatuses, ['waiting', 'running', 'completed', 'error', 'interrupted', 'incomplete', 'skipped', 'unknown']);
});

// 模型只用内存 adapter；Controller、Schedule、AgentLoop、命令、JSONL 和投影注册表都是实际运行依赖。
class Adapter extends LlmAdapter {
  fail = false;
  async resolveModel(provider, model) { return { provider, id: model, name: model }; }
  async *stream() {
    if (this.fail) throw new Error('隔离模型故障');
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: '隔离模型响应' };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: '隔离模型响应' } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

async function waitFor(predicate, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('真实到点运行：完成、出错和资讯跳过写进会话投影，目录与历史给出结果，释放会话后冷读不变', async t => {
  const h = await controllerFixture(t), adapter = new Adapter(), contract = automationContract(z);
  h.ctx.llm.registerAdapter(['fixture'], adapter);
  const owner = h.automationHost.automation;
  const run = async (sessionId, purpose, fail) => {
    const handle = await h.ctx.agents.create({ sessionId, meta: { cwd: h.cwd, agentPreset: 'standard' }, agentOptions: { provider: 'fixture', model: 'fixture' } });
    const claim = await h.ctx.commands.execute(handle.agent, `/whalewing ${JSON.stringify({ action: 'automation_claim', purpose })}`, [], h.signal());
    assert.equal(claim.result.kind, 'success'); assert.equal(await h.ctx.sessions.flush(handle.agent.session), true);
    adapter.fail = fail;
    const task = await h.ctx.schedule.create(sessionId, { title: `运行结果 ${sessionId}`, prompt: '隔离到点任务', after_seconds: 1 });
    await waitFor(async () => (await h.ctx.schedule.catalog()).find(row => row.id === task.id)?.lastDelivery, '原生送达回执');
    await waitFor(() => (h.ctx.sessionProjections.stateOf(handle.agent.session, runsKey)?.runs ?? []).some(row => !['waiting', 'running'].includes(row.state)), '那一轮结束');
    await handle.agent.whenIdle();
    return { handle, task };
  };
  const done = await run('runs-done', 'custom', false);
  const failed = await run('runs-failed', 'custom', true);
  const skipped = await run('runs-news', 'news', false);
  const expected = { 'runs-done': 'completed', 'runs-failed': 'error', 'runs-news': 'skipped' };
  const check = async () => {
    const catalog = contract.result.parse(await owner.manage({ action: 'catalog' }, h.signal()));
    for (const [sessionId, status] of Object.entries(expected)) {
      const row = catalog.tasks.find(task => task.sessionId === sessionId);
      assert.equal(row.lastRun.status, status, sessionId);
      assert.equal(row.lastRun.messageId, row.lastDelivery.messageId); assert.equal(row.lastRun.scheduledAt, row.lastDelivery.scheduledAt);
      const history = contract.result.parse(await owner.manage({ action: 'history', sessionId, id: row.id, limit: 10 }, h.signal()));
      assert.equal(history.records.length, 1); assert.equal(history.records[0].status, status);
    }
  };
  await check();
  // 资讯等内部调用拿到的目录不带附加字段，暂停时的 expected 记录保持原生形状。
  assert.equal((await owner.catalog(h.signal())).tasks.some(task => Object.hasOwn(task, 'lastRun')), false);
  for (const { handle } of [done, failed, skipped]) await handle.dispose();
  for (const sessionId of Object.keys(expected)) assert.equal(h.ctx.agents.get(sessionId), undefined);
  await check();
  assert.equal((await h.projection('runs-done')).values[runsKey][0].state, 'completed');
});

test('界面拿到的运行记录只有计划时间、送达时间、结果和会话；晚 5 分钟以上送达标为补上，缺结果按未知', async () => {
  const { taskRun } = await import('../features/automation/client-api.js');
  const task = { id: 'schedule-1', sessionId: 'task-session' };
  assert.deepEqual(taskRun(task, { scheduledAt: '2026-10-25T00:00:00Z', deliveredAt: '2026-10-25T00:00:01Z', messageId: 'm1', prompt: '原始指令', status: 'completed' }),
    { id: 'm1', scheduledAt: '2026-10-25T00:00:00Z', deliveredAt: '2026-10-25T00:00:01Z', status: 'completed', sessionId: 'task-session', late: false });
  assert.equal(taskRun(task, { scheduledAt: '2026-10-25T00:00:00Z', deliveredAt: '2026-10-25T00:06:00Z', messageId: 'm2' }).late, true);
  assert.equal(taskRun(task, { scheduledAt: '2026-10-25T00:00:00Z', deliveredAt: '2026-10-25T00:00:00Z', messageId: 'm3' }).status, 'unknown');
  assert.equal(taskRun(task, { scheduledAt: 'x', deliveredAt: 'y', messageId: 'm4', status: 'made-up' }).status, 'unknown');
  assert.equal(taskRun(task, undefined), null);
});
