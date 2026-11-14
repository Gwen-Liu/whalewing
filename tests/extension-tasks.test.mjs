import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { mountFeatures } from './feature-fixture.mjs';
import { controllerFixture } from './session-controller-fixture.mjs';
import { sessionSchedule } from '../src/schedule-compat.js';
import { WhalewingCore } from '../src/service.js';
import { taskOwnerProjection } from '../src/identity.js';
import { beijingDate, dayStart, pendingDays, readableWindows, recordKey, replyOf, sessionsNote, taskChanges, taskSpec } from '../features/automation/extension-tasks.js';

const dayMs = 86_400_000, hour = 3_600_000;
const label = { zh: '团队', en: 'Team' };
const digest = { id: 'digest', title: '团队沉淀', daily: { time: '02:00' }, prompt: '把前一天和工作有关的内容整理好交给团队' };

/** 只装底座，宿主服务都是不落盘的替身；定时服务没有，扩展任务停在“等待”。 */
async function lightHarness(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-ext-tasks-'));
  const ctx = new Context();
  new TypertRegistry(ctx);
  ctx.provide('commands', { register() {} }); ctx.provide('sessionProjections', { register() {} });
  ctx.provide('sessions', { create() {}, flush() { return true; } });
  ctx.provide('sessionQuery', {});
  ctx.provide('skills', { async list() { return []; }, async get() {}, async snapshot() { return { skills: [] }; } });
  const mounted = await mountFeatures(ctx, directory, { vaultRoot: path.join(directory, 'vault') }, false);
  t.after(async () => {
    await ctx.fiber.dispose();
    assert.ok(path.basename(directory).startsWith('whalewing-ext-tasks-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { ctx, directory, ...mounted };
}

/** 测试扩展：登记功能后把作用域交出来，测试里直接用它调公开接口。 */
async function extension(ctx, { id = 'team', setup } = {}) {
  let scope;
  const fiber = await ctx.plugin({ inject: ['whalewing'], apply(current) {
    current.whalewing.features.register(current, { id, api: 1, package: `dsh-fixture-${id}` });
    scope = current;
    setup?.(current);
  } });
  return { scope, fiber };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function waitFor(predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
// 模型只用内存替身，每次回一句固定的话；定时投递、任务会话和运行结果都用真实实现。
class Adapter extends LlmAdapter {
  requests = [];
  async resolveModel(provider, model) { return { provider, id: model, name: model }; }
  async *stream(options) {
    this.requests.push(options);
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: '昨天没有可沉淀的内容' };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: '昨天没有可沉淀的内容' } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

test('时间和日子一律按北京时间：还没处理的日子到昨天为止，暂停过的时段不读，DSH 的时间写法对得上', () => {
  const now = Date.parse('2026-11-10T03:00:00Z'); // 北京时间 11-10 11:00
  assert.equal(beijingDate(now), '2026-11-10');
  assert.equal(beijingDate(Date.parse('2026-11-09T16:00:00Z')), '2026-11-10', 'UTC 16:00 已是北京第二天');
  assert.equal(dayStart('2026-11-10'), Date.parse('2026-11-09T16:00:00Z'));
  const since = Date.parse('2026-11-07T07:00:00Z'); // 北京时间 11-07 15:00 登记
  assert.deepEqual(pendingDays({ since }, now), ['2026-11-07', '2026-11-08', '2026-11-09']);
  assert.deepEqual(pendingDays({ since, doneThrough: '2026-11-08' }, now), ['2026-11-09']);
  assert.deepEqual(pendingDays({ since, doneThrough: '2026-11-09' }, now), [], '今天还没过完，不算');
  assert.deepEqual(readableWindows({ since }, '2026-11-07'), [[since, dayStart('2026-11-08')]], '登记那天从登记时刻起');
  const start = dayStart('2026-11-08');
  const record = { since, excluded: [{ from: start + 9 * hour, to: start + 10 * hour }], pausedAt: start + 20 * hour };
  assert.deepEqual(readableWindows(record, '2026-11-08'), [[start, start + 9 * hour], [start + 10 * hour, start + 20 * hour]]);
  assert.deepEqual(readableWindows(record, '2026-11-09'), [], '还在暂停：之后的都不读');
  // 交给 DSH 的规则带秒和北京时区；DSH 存下来是毫秒写法，比对时只看时分。
  const spec = taskSpec({ ...digest, readSessions: true });
  assert.deepEqual(spec, { title: '团队沉淀', prompt: digest.prompt + sessionsNote, daily: { time: '02:00:00', time_zone: 'Asia/Shanghai' } });
  const native = { kind: 'daily', title: '团队沉淀', prompt: spec.prompt, time: '02:00:00.000', timeZone: 'Asia/Shanghai' };
  assert.deepEqual(taskChanges(native, spec), {});
  assert.deepEqual(taskChanges(native, taskSpec({ ...digest, title: '团队每日沉淀', weekly: { time: '03:30', weekdays: [5, 1] }, daily: undefined })), {
    title: '团队每日沉淀', prompt: digest.prompt, change: { kind: 'weekly', weekly: { time: '03:30:00', time_zone: 'Asia/Shanghai', weekdays: [1, 5] } },
  });
  assert.equal(recordKey('team/digest'), 'team--digest');
  const events = [{ seq: 1, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '第一次' }] } } }, { seq: 5, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '第二次最后一句' }] } } }];
  assert.equal(replyOf(events, 0, 3), '第一次'); assert.equal(replyOf(events, 3), '第二次最后一句');
});

test('任务归属只认第一次成功认领回执，其它用途没有归属', () => {
  const run = { seq: 0, type: 'command/run', data: { commandId: 'claim', name: 'whalewing' } };
  const done = owner => ({ seq: 1, type: 'command/done', data: { commandId: 'claim', kind: 'success', text: JSON.stringify({ action: 'automation_claim', purpose: owner ? 'extension' : 'custom', ...(owner ? { owner } : {}) }) } });
  const fold = (events, inherited = 0) => events.reduce(taskOwnerProjection.apply, taskOwnerProjection.init({}, inherited));
  assert.equal(fold([run, done('team/digest')]).owner, 'team/digest');
  assert.equal(fold([run, done()]).owner, null);
  assert.equal(fold([run, done('Team/Digest')]).owner, null, '归属格式不对不记');
  assert.equal(fold([run, done('team/digest')], 5).owner, null, 'fork 不继承父会话的归属');
  const second = { seq: 3, type: 'command/done', data: { commandId: 'again', kind: 'success', text: JSON.stringify({ action: 'automation_claim', purpose: 'extension', owner: 'other/task' }) } };
  assert.equal(fold([run, done('team/digest'), { ...run, seq: 2, data: { ...run.data, commandId: 'again' } }, second]).owner, 'team/digest');
});

test('扩展登记定时任务：先登记功能，字段严格校验，同一个任务只登记一次，撤销或关掉扩展后不再算数', async t => {
  const h = await lightHarness(t);
  let failure;
  await h.ctx.plugin({ inject: ['whalewing'], apply(scope) { try { scope.whalewing.schedule.registerTask(scope, digest); } catch (error) { failure = error; } } });
  assert.equal(failure?.code, 'FEATURE_CALLER');
  const { scope, fiber } = await extension(h.ctx);
  const register = value => scope.whalewing.schedule.registerTask(scope, value);
  for (const bad of [
    { ...digest, id: 'Digest' }, { ...digest, daily: { time: '2:00' } }, { ...digest, daily: { time: '24:00' } },
    { ...digest, weekly: { time: '02:00', weekdays: [1] } }, { id: 'digest', title: '团队沉淀', prompt: '说明' },
    { ...digest, daily: undefined, weekly: { time: '02:00', weekdays: [1, 1] } }, { ...digest, title: '一\n二' }, { ...digest, title: '长'.repeat(41) },
    { ...digest, prompt: ' ' }, { ...digest, extra: true }, { ...digest, onRun: 'later' }, { ...digest, readSessions: 'yes' },
  ]) assert.throws(() => register(bad), { code: 'EXTENSION_TASK_INPUT' }, JSON.stringify(bad));
  const statuses = [];
  const task = register({ ...digest, onStatus: status => statuses.push(status) });
  assert.deepEqual(task.status(), { state: 'waiting', reason: '鲸翼正在建这个任务' });
  assert.throws(() => register(digest), { code: 'EXTENSION_TASK_CONFLICT' });
  assert.throws(() => task.set(digest), { code: 'EXTENSION_TASK_INPUT' }, 'set 不改 id');
  task.set({ title: '团队沉淀', weekly: { time: '03:00', weekdays: [5, 1] }, prompt: '每周沉淀一次' });
  assert.deepEqual(h.service.tasks.live('team/digest').content.weekly, { time: '03:00', weekdays: [5, 1] });
  // 没有 DSH 定时服务：任务停在“等待”，原因告诉扩展。
  await h.automationHost.extensionTasks.sync();
  await tick();
  assert.equal(task.status().state, 'waiting');
  assert.match(task.status().reason, /定时服务/);
  assert.equal(statuses.at(-1).state, 'waiting');
  task.dispose();
  assert.equal(h.service.tasks.live('team/digest'), undefined);
  assert.throws(() => task.set(digest), { code: 'FEATURE_CLOSED' });
  // 到点时扩展还没登记：等它登记上；等不到就返回 false。
  const waiting = h.service.tasks.waitFor('team/digest', 5000);
  const again = register(digest);
  assert.equal(await waiting, true);
  assert.equal(await h.service.tasks.waitFor('team/none', 30), false);
  for (let i = 1; i < 10; i++) register({ ...digest, id: `task-${i}` });
  assert.throws(() => register({ ...digest, id: 'one-more' }), { code: 'EXTENSION_TASK_LIMIT' });
  await fiber.dispose();
  assert.equal(h.service.tasks.live('team/digest'), undefined, '扩展关掉后登记撤销');
  assert.throws(() => again.set(digest), { code: 'FEATURE_CLOSED' });
  await assert.rejects(again.remove(), { code: 'FEATURE_CLOSED' });
});

test('完整 DSH 里按扩展登记建任务：默认打开、标来源；员工只能暂停恢复；扩展改内容跟着改；关掉保留，重新打开不另建，remove 才删', async t => {
  const h = await controllerFixture(t);
  const profile = path.join(h.root, 'profile'); await fs.mkdir(profile, { recursive: true });
  h.ctx.provide('profileContext', { dir: profile });
  await h.automationHost.openBuiltIns(h.signal());
  const statuses = [], runs = [];
  const open = () => extension(h.ctx, { setup: current => {
    current.whalewing.experts.registerSource(current, { label }).set([]);
  } });
  let { scope, fiber } = await open();
  let task = scope.whalewing.schedule.registerTask(scope, { ...digest, description: '每天把前一天的工作沉淀进团队知识', readSessions: true, onStatus: status => statuses.push(status.state), onRun: run => runs.push(run) });
  await h.automationHost.extensionTasks.sync(h.signal());
  await tick();
  const schedule = sessionSchedule(h.ctx.schedule);
  const mine = async () => (await schedule.catalog()).filter(row => row.title.startsWith('团队'));
  let [native] = await mine();
  assert.equal((await mine()).length, 1);
  assert.deepEqual([native.kind, native.time, native.timeZone, native.status], ['daily', '02:00:00.000', 'Asia/Shanghai', 'active']);
  assert.equal(native.prompt, digest.prompt + sessionsNote, '读会话的任务接上鲸翼维护的读法说明');
  const projection = await h.projection(native.sessionId);
  assert.equal(projection.values.whalewingAutomation, 'extension');
  assert.equal(projection.values.whalewingTaskOwner, 'team/digest');
  assert.ok((await h.automationHost.taskWorkspace(h.signal())).sessionIds.includes(native.sessionId), '任务会话在“鲸翼定时任务”工作区');
  assert.deepEqual(task.status(), { state: 'active' }); assert.equal(statuses.at(-1), 'active');
  const catalog = async () => (await h.automationHost.manageAutomation({ action: 'catalog' })).tasks.find(row => row.purpose === 'extension');
  const listed = await catalog();
  assert.deepEqual({ ...listed.extension, since: typeof listed.extension.since }, { feature: 'team', task: 'digest', registered: true, package: 'dsh-fixture-team', readSessions: true, description: '每天把前一天的工作沉淀进团队知识', label, since: 'number' });

  // 员工不能改名字、时间和说明，扩展开着时不能取消；能暂停和恢复，扩展都知道。
  const read = async () => h.automationHost.manageAutomation({ action: 'read', sessionId: native.sessionId, id: native.id });
  let current = await read();
  await assert.rejects(h.automationHost.manageAutomation({ action: 'update', sessionId: native.sessionId, id: native.id, expected: current.task, expectedStatus: 'active', title: '我改的名字' }), { code: 'EXTENSION_TASK_OWNED' });
  await assert.rejects(h.automationHost.manageAutomation({ action: 'delete', sessionId: native.sessionId, id: native.id }), { code: 'EXTENSION_TASK_OWNED' });
  await h.automationHost.manageAutomation({ action: 'pause', sessionId: native.sessionId, id: native.id, expected: current.task, expectedStatus: 'active' });
  await tick();
  assert.deepEqual(task.status(), { state: 'paused' }); assert.equal(statuses.at(-1), 'paused');
  const { tasks } = await h.automationHost.extensionTasks.domain.get(h.signal());
  assert.equal(typeof tasks.get('team--digest').pausedAt, 'number');
  current = await read();
  await h.automationHost.manageAutomation({ action: 'resume', sessionId: native.sessionId, id: native.id, expected: current.task, expectedStatus: 'paused' });
  await tick();
  assert.equal(statuses.at(-1), 'active');
  assert.equal(tasks.get('team--digest').pausedAt, undefined);
  assert.equal(tasks.get('team--digest').excluded.length, 1, '暂停的时段记下来，读会话时扣掉');

  // 跑一轮（DSH 的“立即执行”）：一轮结束后把结果和模型最后说的话告诉扩展，只报一次。
  const adapter = new Adapter();
  h.ctx.llm.registerAdapter(['fixture'], adapter);
  const started = await h.ctx.schedule.run({ id: native.id });
  assert.equal(started.code, undefined);
  await waitFor(() => runs.length === 1, '扩展收到运行结果');
  assert.equal(adapter.requests.length, 1);
  assert.equal(runs[0].status, 'completed');
  assert.equal(runs[0].reply, '昨天没有可沉淀的内容');
  assert.ok(Date.parse(runs[0].deliveredAt) > 0);
  await h.automationHost.extensionTasks.reportRuns('team/digest');
  assert.equal(runs.length, 1, '报过的不再报');
  assert.ok(tasks.get('team--digest').reportedSeq >= 0);

  // 扩展改了时间和名字：照着改，还是同一个会话、同一个任务。
  task.set({ title: '团队每日沉淀', daily: { time: '03:30' }, prompt: digest.prompt, readSessions: true });
  await h.automationHost.extensionTasks.sync(h.signal());
  [native] = await mine();
  assert.equal((await mine()).length, 1);
  assert.deepEqual([native.title, native.time, native.status], ['团队每日沉淀', '03:30:00.000', 'active']);
  const sessionId = native.sessionId;

  // 按天标记：登记当天还没过完，没有能标的；把登记时间往前挪两天再试，只能按顺序标。
  await assert.rejects(h.automationHost.markTaskDay('team/digest', beijingDate(Date.now()), h.signal()), { code: 'TASK_DAY_ORDER' });
  await tasks.update('team--digest', record => ({ ...record, since: Date.now() - 2 * dayMs }));
  const [first, second] = pendingDays(tasks.get('team--digest'));
  await assert.rejects(h.automationHost.markTaskDay('team/digest', second, h.signal()), { code: 'TASK_DAY_ORDER' });
  assert.deepEqual(await h.automationHost.markTaskDay('team/digest', first, h.signal()), { done: first, pending: [second] });

  // 扩展关掉：任务保留，页面上写着没开；这时员工可以取消，但先不取消，重新打开后不另建。
  await fiber.dispose();
  assert.equal((await catalog()).extension.registered, false);
  assert.equal((await mine()).length, 1);
  ({ scope, fiber } = await open());
  task = scope.whalewing.schedule.registerTask(scope, { ...digest, title: '团队每日沉淀', daily: { time: '03:30' }, readSessions: true });
  await h.automationHost.extensionTasks.sync(h.signal());
  assert.deepEqual((await mine()).map(row => row.sessionId), [sessionId], '重新打开用原来的会话和任务');
  assert.equal((await catalog()).extension.registered, true);

  // 退出团队之类：扩展调 remove，DSH 里的任务和记录删掉，会话保留。
  await task.remove();
  assert.deepEqual(await mine(), []);
  assert.equal(tasks.get('team--digest'), undefined);
  assert.equal(h.service.tasks.live('team/digest'), undefined);
  assert.equal((await h.projection(sessionId)).values.whalewingTaskOwner, 'team/digest', '会话和里面的记录保留');
  assert.equal(runs.length, 1);
});

test('扩展任务按天读会话：只读登记以后、没暂停时的普通会话对话；只能按顺序标完一天；不碰每日记忆的进度', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-ext-days-'));
  const now = Date.now(), d1 = beijingDate(now - 2 * dayMs), d2 = beijingDate(now - dayMs), today = beijingDate(now);
  const record = { sessionId: 'task', package: 'dsh-fixture-team', since: dayStart(d1) + 10 * hour, accepted: true, excluded: [{ from: dayStart(d2) + 9 * hour, to: dayStart(d2) + 10 * hour }] };
  const purposes = new Map([['task', 'extension'], ['auto', 'custom']]);
  const headers = [
    { id: 'work', cwd: root, createdAt: dayStart(d1) - dayMs },
    { id: 'auto', cwd: root, createdAt: dayStart(d1) },
    { id: 'sub', cwd: root, createdAt: dayStart(d1), origin: 'subagent' },
    { id: 'task', cwd: root, createdAt: dayStart(d1) },
    { id: 'old', cwd: root, createdAt: dayStart(d1) - 30 * dayMs },
    { id: 'later', cwd: root, createdAt: now },
  ];
  const text = (seq, time, type, value) => ({ seq, time, type, data: type === 'user/message' ? { source: { kind: 'user' }, content: [{ type: 'text', text: value }] } : { message: { content: [{ type: 'text', text: value }] } } });
  const events = [
    text(0, dayStart(d1) + 8 * hour, 'user/message', '登记之前说的'),
    text(1, dayStart(d1) + 11 * hour, 'assistant/message', '登记以后那天的回复'),
    text(2, dayStart(d2) + 9.5 * hour, 'user/message', '暂停时说的'),
    text(3, dayStart(d2) + 12 * hour, 'user/message', '昨天的问题'),
    { seq: 4, time: dayStart(d2) + 12 * hour + 1, type: 'tool/result', data: {} },
    text(5, dayStart(d2) + 12 * hour + 2, 'assistant/message', '昨天的回复'),
    text(6, now, 'user/message', '今天说的'),
  ];
  let progress = { registered: true, readSessions: true, record };
  const dependencies = {
    skillsRoot: path.join(root, 'skills'),
    listSessions: async () => headers.map(header => ({ header })),
    readSession: async id => ({ session: headers.find(header => header.id === id), inheritedEventCount: 0, events: id === 'work' ? structuredClone(events) : [] }),
    automationIdentity: async id => purposes.get(id) ?? null,
    automationClaim: async id => ({ purpose: purposes.get(id) ?? null, owner: id === 'task' ? 'team/digest' : null }),
    readProjection: async id => ({ asOfSeq: 0, values: { whalewingAutomation: purposes.get(id) ?? null, sessionListMetadata: { blank: false, lastPromptAt: id === 'old' ? dayStart(d1) - 30 * dayMs : now } } }),
    extensionTask: async () => structuredClone(progress),
    extensionTaskDone: async (owner, date) => {
      assert.equal(owner, 'team/digest');
      const pending = pendingDays(progress.record);
      if (pending[0] !== date) throw Object.assign(new Error(`要按顺序标：${pending[0]}`), { code: 'TASK_DAY_ORDER' });
      progress = { ...progress, record: { ...progress.record, doneThrough: date } };
      return { done: date, pending: pendingDays(progress.record) };
    },
  };
  const core = new WhalewingCore(path.join(root, 'vault'), dependencies, { maxEvents: 1 });
  t.after(async () => { await core.dispose(); await fs.rm(root, { recursive: true, force: true }); });
  const actor = { kind: 'model', agent: { session: { id: 'task' } } };
  const run = input => core.execute(input, actor);

  await assert.rejects(core.execute({ action: 'day_sources' }, { kind: 'model', agent: { session: { id: 'auto' } } }), { code: 'TASK_SESSIONS' }, '别的定时任务不能用');
  const listing = await run({ action: 'day_sources' });
  assert.deepEqual(listing.pending, [d1, d2]); assert.equal(listing.date, d1);
  assert.deepEqual(listing.sessions.map(row => row.sessionId), ['work'], '子代理、定时任务自己的、那天以后才建的、很久没提问的都不列');
  assert.equal(listing.excluded, 1);
  assert.deepEqual(listing.readable, [{ from: new Date(record.since).toISOString(), to: new Date(dayStart(d2)).toISOString() }]);

  const first = await run({ action: 'day_read', sessionId: 'work', date: d1 });
  assert.deepEqual(first.events.map(event => event.text), ['登记以后那天的回复']); assert.equal(first.hasMore, false);
  const page = await run({ action: 'day_read', sessionId: 'work', date: d2 });
  assert.deepEqual(page.events.map(event => event.text), ['昨天的问题'], '暂停时说的不读；一页一条');
  assert.equal(page.hasMore, true);
  const next = await run({ action: 'day_read', sessionId: 'work', date: d2, afterSeq: page.throughSeq });
  assert.deepEqual(next.events.map(event => event.text), ['昨天的回复']); assert.equal(next.hasMore, false);
  await assert.rejects(run({ action: 'day_read', sessionId: 'work', date: today }), { code: 'TASK_DAY' }, '今天还没过完');
  await assert.rejects(run({ action: 'day_read', sessionId: 'work', date: beijingDate(now - 3 * dayMs) }), { code: 'TASK_DAY' }, '登记以前的不读');
  await assert.rejects(run({ action: 'day_read', sessionId: 'work', date: '2026-02-30' }), { code: 'TASK_DAY' });
  for (const id of ['auto', 'task', 'sub']) await assert.rejects(run({ action: 'day_read', sessionId: id, date: d1 }), { code: 'SOURCE_SCOPE' }, id);

  await assert.rejects(run({ action: 'day_done', date: d2 }), { code: 'TASK_DAY_ORDER' });
  assert.deepEqual(await run({ action: 'day_done', date: d1 }), { done: d1, pending: [d2] });
  assert.equal((await run({ action: 'day_sources' })).date, d2);
  assert.equal((await core.vault.settings()).profileCoverage, undefined, '每日记忆的整理进度没动');

  progress = { ...progress, readSessions: false };
  await assert.rejects(run({ action: 'day_sources' }), { code: 'TASK_SESSIONS' });
  progress = { ...progress, readSessions: true, registered: false };
  await assert.rejects(run({ action: 'day_read', sessionId: 'work', date: d2 }), { code: 'EXTENSION_TASK_CLOSED' });
});
