import test from 'node:test';
import assert from 'node:assert/strict';
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy';
import { managementHarness } from './assistant-management-fixture.mjs';
import { handoffDraft, handoffInput, handoffToolName } from '../features/assistant/handoff.js';
import { createHandoffOpener, readHandoff, registerHandoffView } from '../features/assistant/handoff-view.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const brief = { expertId: 'development', title: '修复登录报错', goal: '登录页提交后不再报 500', deliverable: '修好的代码和回归测试', materials: ['docs/登录.md', 'src/login.js'], notes: '员工原话：先别动注册流程' };

async function setup(t, { mode = 'danger-full-access', approval } = {}) {
  const h = await managementHarness(t);
  if (approval) h.ctx.provide('approval', approval);
  await h.ctx.plugin(SandboxPolicy, { mode });
  await tick();
  const select = async (id = 'manager', agent = h.agent) => {
    assert.equal((await h.run({ expertId: id }, agent)).result.kind, 'success');
    await tick();
  };
  const visible = (agent = h.agent) => h.ctx.tools.get(handoffToolName, agent);
  const execute = (args = brief, agent = h.agent) => h.ctx.tools.execute({ name: handoffToolName, arguments: args, agent, callId: 'handoff-test', signal: new AbortController().signal });
  const ids = () => h.ctx.agents.list().map(agent => agent.id);
  return { ...h, select, visible, execute, ids, assistant: h.mounted.service.registry.bases.get('assistant').fiber };
}

test('交接工具只在选了小鲸的普通主会话里出现，切换专家、子代理和功能退出都撤回', async t => {
  const h = await setup(t);
  assert.equal(h.visible(), undefined);
  await h.select('development'); assert.equal(h.visible(), undefined);
  await h.select(); assert.ok(h.visible());
  assert.equal(h.ctx.tools.get(handoffToolName), undefined, '不进全局工具表，其他专家看不到');
  const other = await h.create('other');
  assert.equal(h.visible(other), undefined);
  const child = await h.create('child', { parentAgent: h.agent, meta: { origin: 'subagent', parentSession: h.agent.id } });
  const before = h.ids();
  assert.equal((await h.execute(brief, child)).isError, true);
  // 原生父子链可能继承定义；直接用父会话的定义执行，守卫仍按实际会话拒绝。
  await assert.rejects(h.visible().execute(brief, { agent: child, callId: 'child-call', signal: new AbortController().signal }), /只有小鲸助手的主会话/);
  await assert.rejects(h.visible().execute(brief, { agent: other, callId: 'other-call', signal: new AbortController().signal }), /只有小鲸助手的主会话/);
  assert.deepEqual(h.ids(), before, '子代理和其他会话不能新建任务');
  await h.select(null); assert.equal(h.visible(), undefined);
  await h.select(); assert.ok(h.visible());
  await h.assistant.dispose(); await tick(); assert.equal(h.visible(), undefined);
});

test('交接新建专家任务：选好专家、设标题、不自动发送，结果带打开任务所需的信息', async t => {
  const h = await setup(t);
  await h.select();
  const before = new Set(h.ids());
  const result = await h.execute();
  assert.equal(result.isError, false, JSON.stringify(result.content));
  const created = h.ids().filter(id => !before.has(id));
  assert.equal(created.length, 1);
  const [sessionId] = created;
  assert.equal(result.meta.sessionId, sessionId);
  assert.equal(result.meta.expertName, '研发专家');
  assert.equal(result.meta.draft, handoffInput(brief).draft);
  const task = h.ctx.agents.get(sessionId);
  assert.equal(h.ctx.sessionProjections.stateOf(task.session, 'whalewingExpert').view.expertId, 'development');
  assert.equal(task.session.header.cwd, h.agent.session.header.cwd, '新任务和小鲸在同一目录');
  // 只选了专家：没有用户消息、没有开始轮次，草稿要员工自己发。
  const types = task.session.snapshotEvents().map(event => event.type);
  assert.equal(types.some(type => ['user/message', 'turn/start', 'assistant/message'].includes(type)), false, types.join(','));
  const text = result.content.map(part => part.text).join('\n');
  assert.match(text, /打开任务/); assert.match(text, /不要为同一件事再次调用/); assert.ok(text.includes(result.meta.draft));
  assert.equal(h.ctx.whalewingExperts.selectedFor(task), 'development');
  assert.equal(h.visible(task), undefined, '接手的专家看不到交接工具');
});

test('小鲸在工作区里时，新任务挂到同一工作区', async t => {
  const h = await setup(t);
  await h.select();
  const workspace = await h.ctx.workspaceRegistry.create(h.directory);
  await workspace.attachSession(h.agent.id);
  const result = await h.execute();
  assert.equal(result.isError, false, JSON.stringify(result.content));
  assert.ok(h.ctx.workspaceRegistry.get(workspace.id).sessionIds.includes(result.meta.sessionId));
});

test('非完全访问时先走原生审批：拒绝不建任务，批准后才建', async t => {
  const asked = [];
  let outcome = 'rejected';
  const h = await setup(t, { mode: 'workspace-write', approval: { request: async request => { asked.push(request); return outcome; } } });
  await h.select();
  const before = h.ids();
  const rejected = await h.execute();
  assert.equal(rejected.isError, true);
  assert.deepEqual(h.ids(), before);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].toolName, handoffToolName);
  assert.match(asked[0].displayReason.zh, /研发专家.*修复登录报错/);
  outcome = 'allowed-once';
  const allowed = await h.execute();
  assert.equal(allowed.isError, false, JSON.stringify(allowed.content));
  assert.equal(h.ids().length, before.length + 1);
});

test('参数在审批和新建之前校验：不交给小鲸自己、不交给不存在的专家', async t => {
  const asked = [];
  const h = await setup(t, { mode: 'workspace-write', approval: { request: async request => { asked.push(request); return 'allowed-once'; } } });
  await h.select();
  const before = h.ids();
  for (const [args, pattern] of [[{ ...brief, expertId: 'manager' }, /不能交给小鲸自己/], [{ ...brief, expertId: 'nobody' }, /专家已删除或不存在/], [{ ...brief, title: '  ' }, /任务名不能为空/], [{ ...brief, title: '第一行\n第二行' }, /任务名只写一行/]]) {
    const result = await h.execute(args);
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), pattern);
  }
  assert.equal(asked.length, 0);
  assert.deepEqual(h.ids(), before);
});

test('交接说明按目标、交付、资料、员工原话分段，重复路径只列一次', () => {
  const input = handoffInput({ ...brief, materials: ['a.md', ' a.md ', 'b.md'], notes: '' });
  assert.deepEqual(input.materials, ['a.md', 'b.md']);
  assert.equal(input.draft, handoffDraft({ title: '修复登录报错', goal: brief.goal, deliverable: brief.deliverable, materials: ['a.md', 'b.md'] }));
  assert.equal(input.draft, '【小鲸交接】修复登录报错\n\n目标：登录页提交后不再报 500\n\n要交付：修好的代码和回归测试\n\n相关笔记和文件：\n- a.md\n- b.md');
  assert.throws(() => handoffInput({ ...brief, materials: Array.from({ length: 21 }, (_, i) => `${i}.md`) }), /最多 20 项/);
});

const meta = { sessionId: 'task-1', expertId: 'development', expertName: '研发专家', title: '修复登录报错', draft: '【小鲸交接】修复登录报错' };
function opener(overrides = {}) {
  const calls = [];
  const deps = {
    check: id => calls.push(['check', id]),
    summary: () => ({ blank: true }),
    retain: id => ({ sessionId: id, binding: { sessionId: id }, release: () => calls.push(['release', id]) }),
    open: id => calls.push(['open', id]),
    input: () => ({ requestDraftInitialization: (binding, options) => { calls.push(['draft', binding.sessionId, options]); return 'applied'; } }),
    notify: (text, options = {}) => calls.push(['notify', options.kind, text, options.action?.label]),
    clipboard: () => ({ writeText: async text => calls.push(['copy', text]) }),
    ...overrides,
  };
  return { calls, handoff: createHandoffOpener(deps) };
}

test('打开任务：空白任务先放草稿再打开，草稿只放进输入框不发送', () => {
  const { calls, handoff } = opener();
  handoff.open(meta);
  assert.deepEqual(calls, [['check', 'task-1'], ['draft', 'task-1', { prompt: meta.draft }], ['open', 'task-1'], ['release', 'task-1'], ['notify', 'success', '交接说明已放进输入框，看过再发送', undefined]]);
});

test('打开任务：已开始、已有草稿、宿主不支持预填或正在提交时如实提示，不覆盖员工内容', async () => {
  let f = opener({ summary: () => ({ blank: false }) });
  f.handoff.open(meta);
  assert.equal(f.calls.some(([kind]) => kind === 'draft'), false);
  assert.deepEqual(f.calls.at(-1), ['notify', 'info', '这个任务已经开始过，交接说明没有再放进输入框', '复制交接说明']);
  f = opener({ input: () => ({ requestDraftInitialization: () => 'preserved' }) });
  f.handoff.open(meta);
  assert.deepEqual(f.calls.at(-1), ['notify', 'info', '输入框里已有内容，交接说明没有覆盖；需要时复制后粘贴', '复制交接说明']);
  f = opener({ input: () => undefined });
  f.handoff.open(meta);
  assert.ok(f.calls.some(([kind]) => kind === 'open'));
  assert.deepEqual(f.calls.at(-1), ['notify', 'info', '当前 DSH 版本不能预先填写输入框；任务已打开，请复制交接说明后粘贴发送', '复制交接说明']);
  f = opener({ input: () => ({ requestDraftInitialization: () => 'blocked' }) });
  f.handoff.open(meta);
  assert.deepEqual(f.calls.at(-1), ['notify', 'error', '输入框正在提交，交接说明没有放入；请稍后重试', '重试']);
  f = opener({ check: () => { throw Object.assign(new Error('这个会话已归档，请在 DSH 里取消归档后重试（task-1）'), { recovery: 'open' }); } });
  f.handoff.open(meta);
  assert.equal(f.calls.some(([kind]) => kind === 'open' || kind === 'draft'), false);
  assert.deepEqual(f.calls.at(-1), ['notify', 'error', '这个会话已归档，请在 DSH 里取消归档后重试（task-1）', undefined]);
  f = opener();
  await f.handoff.copy(meta);
  assert.deepEqual(f.calls, [['copy', meta.draft], ['notify', 'success', '交接说明已复制', undefined]]);
  f = opener({ clipboard: () => undefined });
  await f.handoff.copy(meta);
  assert.deepEqual(f.calls, [['notify', 'error', '没能复制，请展开「交接说明」手动复制', undefined]]);
});

test('交接卡片按工具名登记，打开任务经会话保留写草稿再打开，复制入口和全文都在卡片里', () => {
  const calls = [], registered = [];
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const ctx = {
    locale: { resolveText: value => value.zh },
    slots: { inject: (_name, fn) => fn(), register: (options, Component) => { registered.push({ options, Component }); return () => {}; } },
    get: name => name === 'conversation' ? { input: { requestDraftInitialization: (binding, options) => { calls.push(['draft', binding.sessionId, options.prompt]); return 'applied'; } } } : undefined,
  };
  const api = {
    checkSession: id => calls.push(['check', id]), sessionSummary: () => undefined,
    retain: id => ({ binding: { sessionId: id }, release: () => calls.push(['release', id]) }), open: id => calls.push(['open', id]),
    notify: text => calls.push(['notify', text]),
  };
  registerHandoffView(ctx, { React: react }, api);
  assert.equal(registered.length, 1);
  assert.deepEqual(registered[0].options, { name: 'tool.call.toolview', key: handoffToolName });
  const Row = registered[0].Component;
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  const textOf = tree => nodes(tree).flatMap(node => (node.props.children ?? []).filter(child => typeof child === 'string')).join('');
  assert.equal(textOf(Row({ phase: 'preparing', block: { argsRaw: '' } })), '正在整理交接说明…');
  assert.equal(textOf(Row({ phase: 'start', block: { argsRaw: JSON.stringify({ title: '修复登录报错' }) } })), '正在为专家新建任务：修复登录报错');
  const card = Row({ phase: 'result', block: { kind: 'result', call: { argsRaw: '{}' }, isError: false, content: [], meta } });
  const buttons = nodes(card).filter(node => node.type === 'button');
  assert.deepEqual(buttons.map(node => node.props.children[0]), ['打开任务', '复制交接说明']);
  assert.ok(textOf(card).includes('已交给研发专家：修复登录报错'));
  assert.ok(textOf(card).includes(meta.draft), '展开可看交接说明全文');
  buttons[0].props.onClick();
  assert.deepEqual(calls, [['check', 'task-1'], ['draft', 'task-1', meta.draft], ['open', 'task-1'], ['release', 'task-1'], ['notify', '交接说明已放进输入框，看过再发送']]);
  const failed = Row({ phase: 'result', block: { kind: 'result', call: { argsRaw: '{}' }, isError: true, content: [{ type: 'text', text: 'Error: 不能交给小鲸自己' }] } });
  assert.equal(nodes(failed).some(node => node.type === 'button'), false);
  assert.equal(textOf(failed), '没有交给专家：不能交给小鲸自己');
});

test('卡片只认工具记录里的展示信息，失败和中止不给打开入口', () => {
  const args = JSON.stringify({ title: '修复登录报错' });
  assert.deepEqual(readHandoff({ argsRaw: args }), { state: 'running', title: '修复登录报错' });
  assert.deepEqual(readHandoff({ kind: 'result', call: { argsRaw: args }, isError: false, content: [], meta }), { state: 'done', title: '修复登录报错', meta });
  assert.deepEqual(readHandoff({ kind: 'result', call: { argsRaw: args }, isError: true, content: [{ type: 'text', text: 'Error: 专家已删除或不存在\n第二行' }] }), { state: 'error', title: '修复登录报错', message: '专家已删除或不存在' });
  assert.deepEqual(readHandoff({ kind: 'result', call: { argsRaw: '{' }, isError: true, error: { code: 'interrupted', name: 'Abort' }, content: [] }), { state: 'stopped', title: '' });
  assert.equal(readHandoff({ kind: 'result', call: { argsRaw: args }, isError: false, content: [], meta: { sessionId: 'x' } }).state, 'error', '缺字段的记录不当作成功');
});
