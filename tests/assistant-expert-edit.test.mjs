import test from 'node:test';
import assert from 'node:assert/strict';
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy';
import { managementHarness } from './assistant-management-fixture.mjs';
import { expertEditInput, expertEditToolName } from '../features/assistant/expert-edit.js';
import { readExpertEdit } from '../features/assistant/handoff-view.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const watcher = { action: 'create', name: 'DSH 观察员', description: '出新版第一时间告诉你改了什么、对你的插件有什么影响。', prompt: '# DSH 观察员\n\n## 身份与核心使命\n盯着 DSH 的新版本。', skills: ['whalewing-research'], avatar: 'preset-03', rules: ['只看官方发布页和 npm'], progress: ['已知最新版本 0.2.2-rc.1'] };

async function setup(t, { mode = 'workspace-write', answer = 'allowed-once' } = {}) {
  const h = await managementHarness(t);
  const asked = [];
  h.ctx.provide('approval', { request: async request => { asked.push(request); return typeof answer === 'function' ? answer() : answer; } });
  await h.ctx.plugin(SandboxPolicy, { mode });
  await tick();
  // 保存时会列出可选技能；真去列要先把自带技能复制进临时目录，这里只给用到的几个名字（同专家测试的做法）。
  h.ctx.whalewing.skillCandidates = async () => ({ skills: ['whalewing-research', 'whalewing-writing'].map(name => ({ name, description: '' })), issues: [] });
  const select = async (id = 'manager', agent = h.agent) => {
    assert.equal((await h.run({ expertId: id }, agent)).result.kind, 'success');
    await tick();
  };
  const execute = (args, agent = h.agent) => h.ctx.tools.execute({ calls: [{ id: `edit-${Math.random()}`, name: expertEditToolName, arguments: JSON.stringify(args) }], agent, signal: new AbortController().signal }).then(batch => batch.results[0].result);
  const custom = () => h.ctx.whalewingExperts.list().experts.filter(item => item.id.startsWith('custom-'));
  return { ...h, asked, select, execute, custom };
}
const message = result => (result.content ?? []).map(part => part.text).join('\n');

test('参数先校验：新建要名字、介绍、岗位说明；不收模型和 MCP；改专家不带记忆', () => {
  assert.throws(() => expertEditInput({ action: 'create', name: 'x', description: 'y' }), /岗位说明不能为空/);
  assert.throws(() => expertEditInput({ ...watcher, model: { provider: 'a', model: 'b' } }), /不认识的字段 model/);
  assert.throws(() => expertEditInput({ ...watcher, id: 'custom-1' }), /新建时不填 id/);
  assert.throws(() => expertEditInput({ ...watcher, avatar: 'data:image/png;base64,AAAA' }), /头像只能选插件自带的/);
  assert.throws(() => expertEditInput({ action: 'update', id: 'development', rules: ['x'] }), /改专家时不带记忆/);
  assert.throws(() => expertEditInput({ action: 'update', id: 'development' }), /没有要改的内容/);
  assert.throws(() => expertEditInput({ ...watcher, name: '两\n行' }), /名字只写一行/);
  const parsed = expertEditInput(watcher);
  assert.match(parsed.fields.avatar, /^data:image\/webp;base64,/);
  assert.deepEqual(parsed.rules, ['只看官方发布页和 npm']);
});

test('只有选了小鲸的主会话有建专家工具；批准后建好一位员工的自定义专家，开头的记忆写进它的记忆笔记', async t => {
  const h = await setup(t);
  assert.equal(h.ctx.tools.get(expertEditToolName, h.agent), undefined);
  await h.select('development');
  assert.equal(h.ctx.tools.get(expertEditToolName, h.agent), undefined);
  await h.select();
  assert.ok(h.ctx.tools.get(expertEditToolName, h.agent));
  assert.equal(h.ctx.tools.get(expertEditToolName), undefined, '不进全局工具表');

  const result = await h.execute(watcher);
  assert.ok(!result.isError, message(result));
  assert.equal(h.asked.length, 1);
  assert.equal(h.asked[0].toolName, expertEditToolName);
  assert.match(h.asked[0].displayReason.zh, /新建专家「DSH 观察员」/);
  assert.doesNotMatch(h.asked[0].displayReason.zh, /[。.]；/, '介绍末尾的句号不和分号连在一起');
  const [created] = h.custom();
  assert.equal(created.name, 'DSH 观察员');
  assert.deepEqual(created.skills, ['whalewing-research']);
  assert.equal(created.builtin, false);
  assert.match(created.avatar, /^data:image\/webp;base64,/);
  assert.deepEqual(result.meta, { action: 'create', expertId: created.id, name: 'DSH 观察员', changed: ['name', 'description', 'prompt', 'skills', 'avatar'] });
  assert.match(message(result), /已建好专家「DSH 观察员」[\s\S]*开头的记忆写了 2 条/);
  const memory = await h.ctx.whalewingExperts.memory.context(created);
  assert.match(memory.text, /## 规矩\n- \d{4}-\d{2}-\d{2} 只看官方发布页和 npm/);
  assert.match(memory.text, /## 进度\n- \d{4}-\d{2}-\d{2} 已知最新版本 0\.2\.2-rc\.1/);

  // 卡片读宿主记录的元数据。
  assert.deepEqual(readExpertEdit({ kind: 'result', call: { argsRaw: JSON.stringify(watcher) }, isError: false, meta: result.meta }), { state: 'done', name: 'DSH 观察员', meta: result.meta });
  assert.equal(readExpertEdit({ argsRaw: JSON.stringify(watcher) }).state, 'running');

  // 改专家：只改给的那几项，按最新版本保存。
  const updated = await h.execute({ action: 'update', id: created.id, description: '盯 DSH 新版本，告诉你对插件的影响', skills: ['whalewing-research', 'whalewing-writing'] });
  assert.ok(!updated.isError, message(updated));
  assert.deepEqual(updated.meta.changed, ['description', 'skills']);
  const after = h.ctx.whalewingExperts.get(created.id);
  assert.equal(after.prompt, watcher.prompt);
  assert.equal(after.revision, created.revision + 1);
  assert.match(message(await h.execute({ action: 'update', id: created.id, description: '盯 DSH 新版本，告诉你对插件的影响' })), /已经是这样了/);

  // 内置专家也能替员工改，改过的字段照常记成员工改的。
  const builtin = await h.execute({ action: 'update', id: 'writing', description: '方案、报告和公众号长文' });
  assert.ok(!builtin.isError, message(builtin));
  assert.deepEqual(h.ctx.whalewingExperts.manage ? (await h.ctx.whalewingExperts.manage({ action: 'list' })).experts.find(item => item.id === 'writing').customized : [], ['description']);
});

test('审批拒绝时什么都不建；参数不对时不弹审批', async t => {
  const h = await setup(t, { answer: 'rejected' });
  await h.select();
  assert.equal((await h.execute(watcher)).isError, true);
  assert.equal(h.asked.length, 1);
  assert.equal(h.custom().length, 0);
  assert.equal((await h.execute({ ...watcher, prompt: '' })).isError, true);
  assert.equal(h.asked.length, 1, '参数没过不问员工');
});

test('技能没装时专家页同一套校验拒收，不留半个专家', async t => {
  const h = await setup(t);
  await h.select();
  const result = await h.execute({ ...watcher, skills: ['not-installed-skill'] });
  assert.equal(result.isError, true);
  assert.match(message(result), /技能 not-installed-skill 当前不可用/);
  assert.equal(h.custom().length, 0);
});

test('时间规则都按北京时间；每隔多少秒至少 5 分钟', async () => {
  const { scheduleTiming } = await import('../features/assistant/expert-schedule.js');
  assert.deepEqual(scheduleTiming({ daily: '09:00' }), { daily: { time: '09:00:00', time_zone: 'Asia/Shanghai' } });
  assert.deepEqual(scheduleTiming({ weekly: { time: '07:30', weekdays: [1, 3, 3] } }), { weekly: { time: '07:30:00', time_zone: 'Asia/Shanghai', weekdays: [1, 3] } });
  assert.deepEqual(scheduleTiming({ cron: '0 9 * * 1-5' }), { cron: { expression: '0 9 * * 1-5', time_zone: 'Asia/Shanghai' } });
  assert.deepEqual(scheduleTiming({ every_seconds: 3600 }), { every_seconds: 3600 });
  assert.deepEqual(scheduleTiming({ at: '2026-11-09T09:00:00+08:00' }), { at: '2026-11-09T09:00:00+08:00' });
  assert.throws(() => scheduleTiming({ every_seconds: 60 }), /至少 300 秒/);
  assert.throws(() => scheduleTiming({ daily: '9点' }), /24 小时制/);
  assert.throws(() => scheduleTiming({ daily: '09:00', cron: '* * * * *' }), /只写一种规则/);
  assert.throws(() => scheduleTiming({ weekly: { time: '09:00', weekdays: [0] } }), /1–7/);
});

test('小鲸给专家加定时任务：只在小鲸会话里有，批准后照定时任务页同一条路建，挂到这位专家名下', async t => {
  const { expertScheduleToolName } = await import('../features/assistant/expert-schedule.js');
  const h = await setup(t);
  const automation = h.ctx.get('whalewingAutomation');
  const calls = [];
  automation.claimTaskSession = async (sessionId, purpose, _signal, fresh) => { calls.push(['claim', sessionId, purpose, fresh]); };
  automation.manageAutomation = async input => { calls.push(['create', input]); return { task: { id: 'schedule-1', scheduledAt: '2026-11-09T01:00:00.000Z' }, recovered: false }; };
  const run = (args, agent = h.agent) => h.ctx.tools.execute({ calls: [{ id: `schedule-${Math.random()}`, name: expertScheduleToolName, arguments: JSON.stringify(args) }], agent, signal: new AbortController().signal }).then(batch => batch.results[0].result);
  const args = { expertId: 'research', title: '每天看 DSH 新版本', prompt: '看官方发布页和 npm，有新版就说改了什么', when: { daily: '09:00' } };
  await h.select('development');
  assert.equal(h.ctx.tools.get(expertScheduleToolName, h.agent), undefined);
  await h.select();
  assert.match(message(await run({ ...args, expertId: 'manager' })), /不挂在小鲸自己名下/);
  assert.equal(h.asked.length, 0, '参数不对不问员工');
  const result = await run(args);
  assert.ok(!result.isError, message(result));
  assert.equal(h.asked.length, 1);
  assert.match(h.asked[0].displayReason.zh, /给「研究专家」加定时任务「每天看 DSH 新版本」/);
  assert.equal(calls[0][0], 'claim'); assert.equal(calls[0][2], 'custom'); assert.equal(calls[0][3], true);
  assert.match(calls[0][1], /^whalewing-auto-[0-9a-f-]{36}$/);
  assert.deepEqual(calls[1], ['create', { action: 'create', sessionId: calls[0][1], purpose: 'custom', expertId: 'research', spec: { title: args.title, prompt: args.prompt, daily: { time: '09:00:00', time_zone: 'Asia/Shanghai' } } }]);
  assert.deepEqual(result.meta, { expertId: 'research', expertName: '研究专家', title: args.title, sessionId: calls[0][1], scheduledAt: '2026-11-09T01:00:00.000Z' });
});

test('员工没定多久跑一次（没说或跳过了），小鲸不替员工挑默认时间去加定时任务：说明和工具说明都写明', async () => {
  const { roles } = await import('../content/roles.js');
  const { readFileSync } = await import('node:fs');
  const manager = roles.find(role => role.id === 'manager').prompt;
  assert.match(manager, /员工说了多久看一次，再用 whalewing_expert_schedule/);
  assert.match(manager, /问了被跳过，就先不加：不替员工挑一个默认时间/);
  const tool = readFileSync(new URL('../features/assistant/expert-schedule.js', import.meta.url), 'utf8');
  assert.match(tool, /多久跑一次要员工说过或同意过；员工没说、或问了被跳过，就不要调用这个工具/);
});
