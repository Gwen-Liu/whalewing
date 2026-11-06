import { mountFeatures } from './feature-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import SessionStore from '@deepseek-ai/dsh-session';
import SessionProjections from '@deepseek-ai/dsh-session-projection';
import CommandRuntime from '@deepseek-ai/dsh-commands';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools';
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import * as JsonlModule from '@deepseek-ai/dsh-session-persistence-jsonl';
import SessionQuery from '@deepseek-ai/dsh-session-query';
import Controller from '@deepseek-ai/dsh-api-session-controller';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import Workspace from '@deepseek-ai/dsh-workspace';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import Presets from '@deepseek-ai/dsh-agent-preset-registry';
import DefaultModel from '@deepseek-ai/dsh-agent-default-model';
import { resolveChildAgentOptions } from '@deepseek-ai/dsh-subagent';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as Experts from '../features/experts/host.js';
import { expertContract } from '../features/experts/contract.js';
import { ExpertStore, expertDomain, expertChangeDomain } from '../features/experts/store.js';
import { roles } from '../content/roles.js';
import { z } from 'zod';
import Whalewing from '../index.js';
import AiWeb from '../features/ai-web/host.js';
import Cards from '../features/cards/host.js';
import ModelWorld from '../features/model-world/host.js';
import * as Toolbox from '../features/toolbox/host.js';
import { automationProjection } from '../src/identity.js';

// DSH 0.2.2 起 dsh-tools 不再导出测试用的 defineContentToolFixture；照它原来的定义在本地写：内容块就是工具的输出值。
const defineContentToolFixture = options => defineTool({ ...options, output: { schema: { type: 'array', items: { type: 'json' } }, render: (_args, value) => value } });

const SessionPersistenceJsonl = JsonlModule.default ?? JsonlModule;

// 模型输出与外围技能内容为内存载体；Controller、命令、日志、投影及loop使用当前真实包。
class Adapter extends LlmAdapter {
  requests = [];
  async resolveModel(provider, model) { return { provider, id: model, name: model }; }
  async *stream(options) {
    this.requests.push(options);
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: 'done' };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

async function harness(t, persistence = true, expertConfig = {}) {
  const ctx = new Context();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-experts-'));
  t.after(async () => {
    await ctx.fiber.dispose();
    // 只回收本测试在系统临时目录创建的资源，不穿越外部联接。
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('whalewing-experts-'));
    await rm(directory, { recursive: true, force: true });
  });
  new TypertRegistry(ctx);
  await ctx.plugin(Storage);
  await ctx.plugin(StorageJson, { root: directory });
  await ctx.plugin(StorageDomain, { backend: 'json' });
  ctx.provide('skills', { async list() { return []; }, async get(name) { return { name, description: '测试基础技能', content: '测试正文' }; } });
  await ctx.plugin(DefaultModel, { provider: 'fixture', model: 'fixture' });
  ctx.agentDefaultModel.saveSelection = () => { throw new Error('禁止写全局默认'); };
  for (const plugin of [LlmRuntime, SessionStore, SessionProjections, CommandRuntime]) await ctx.plugin(plugin);
  await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
  // DSH 0.2.2 起工具注册表和执行器分开，原生函数调用要单独挂执行器。
  for (const plugin of [ToolRuntime, NativeExecutor, AgentRegistry]) await ctx.plugin(plugin);
  await ctx.plugin(AgentLoop, { agents: [] });
  if (persistence) await ctx.plugin(SessionPersistenceJsonl, { root: path.join(directory, 'sessions'), compression: 'none' });
  await ctx.plugin(SessionQuery);
  if (persistence) await ctx.plugin(Workspace);
  // 缺持久化的反例没有工作区；只供Controller装配，不进入创建、恢复或成员判断。
  else ctx.provide('workspaceRegistry', { list: () => [] });
  ctx.provide('attachments', { imageLimits: { maxImageBytes: 1024, maxImagesPerMessage: 1, maxMessageImageBytes: 1024, maxImagePixels: 1024, maxImageDimension: 1024, mediaTypes: ['image/png'] } });
  ctx.provide('fileUploads', { registerAgentResolver() { return () => {}; } });
  ctx.provide('fs', {}); ctx.provide('remoteAccess', { allows: () => true });
  await ctx.plugin(Loader, { baseUrl: import.meta.url });
  await ctx.plugin(Presets, { default: 'standard' });
  await ctx.agentPresets.register({ id: 'standard', plugins: [] });
  // DSH 0.2.2 起会话控制器要读 Gateway 暂存的转发事件。
  await ctx.plugin(Gateway);
  await ctx.plugin(Controller, { nativeOpen: false });
  const adapter = new Adapter();
  ctx.llm.registerAdapter(['fixture'], adapter);
  const saved = new Map();
  let failFlush = false;
  if (persistence) ctx.on('session/flush', session => {
    if (failFlush) throw new Error('fixture persistence failure');
    saved.set(session.id, session.snapshotEvents());
  });
  // 专家操作自己有 15 秒时限；测试只验证对错，放宽到上限，慢电脑、全量并行时不因为慢而报错（要测时限的用例自己传 operationMs）。
  const mounted = await mountFeatures(ctx, directory, { experts: { operationMs: 120000, ...expertConfig } }, false);
  const expertPlugin = mounted.service.registry.bases.get('experts').fiber;
  await expertPlugin.await();
  // 保存专家时会列出可选技能；真去列会先把自带的几十个技能全部复制进临时目录，全量并行时要十几秒、超过保存的 15 秒时限。
  // 专家测试只用到技能名：按自带技能的目录名给出候选（技能候选本身在 skill-library 测试里测），个别测试再自己替换。
  const bundled = (await readdir(new URL('../content/skills/', import.meta.url), { withFileTypes: true })).filter(item => item.isDirectory()).map(item => ({ name: item.name, description: '' }));
  ctx.whalewing.skillCandidates = async () => ({ skills: bundled, issues: [] });
  // 普通身份由真实Controller安装模型投影与选择器；子任务和种子使用原生Agent入口。
  const create = async (id, extra = {}) => {
    if (!persistence || extra.parentAgent || extra.seed) return (await ctx.agents.create({ sessionId: id, meta: { agentPreset: 'standard' }, agentOptions: { provider: 'fixture', model: 'fixture' }, ...extra })).agent;
    const receipt = await ctx.sessionController.create({ sessionId: id, cwd: directory, agentPreset: 'standard' });
    assert.equal(receipt.sessionId, id);
    return (await ctx.sessionController.resolveAgent(id)).agent;
  };
  const agent = await create('parent');
  const run = (input, subject = agent) => ctx.commands.execute(subject, `/whalewing-expert ${typeof input === 'string' ? input : JSON.stringify(input)}`, [], new AbortController().signal);
  const state = (subject = agent) => ctx.sessionProjections.stateOf(subject.session, 'whalewingExpert');
  return { coreFiber: mounted.fiber, ctx, agent, adapter, create, run, state, saved, expertPlugin, directory, failFlush: () => { failFlush = true; } };
}

async function turn(ctx, agent) {
  const idle = new Promise(resolve => {
    const stop = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') { stop(); resolve(); }
    });
  });
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '执行当前任务' }] }));
  await idle;
}

test('正式命令选择、非法输入、清除与持久化回读', async t => {
  const h = await harness(t);
  assert.equal((await h.run({ expertId: 'development' })).result.kind, 'success');
  assert.equal(h.state().view.expertId, 'development');
  for (const input of ['{', { expertId: 'missing' }, { expertId: 'development', extra: true }]) {
    assert.equal((await h.run(input)).result.kind, 'error');
    assert.equal(h.state().view.expertId, 'development');
  }
  const status = await h.run({ action: 'status' });
  assert.equal(JSON.parse(status.result.text).expertId, 'development');
  const restored = h.ctx.sessions.create('restored', { seed: h.saved.get('parent') });
  assert.equal(h.ctx.sessionProjections.stateOf(restored, 'whalewingExpert').view.expertId, 'development');
  h.failFlush();
  assert.match((await h.run({ action: 'status' })).result.text, /persistence failure/);
  assert.equal((await h.run({ expertId: null })).result.kind, 'success');
  assert.equal(h.state().view.expertId, null);
});

test('没有持久化接收者时status明确失败', async t => {
  const h = await harness(t, false);
  await h.run({ expertId: 'development' });
  assert.equal((await h.run({ action: 'status' })).result.kind, 'error');
});

test('真实adapter收到专家上下文且保留complete原生模式和工具；清除后提示撤销', async t => {
  const h = await harness(t);
  h.ctx.systemPrompt.section({ name: 'fixture-mode', order: 0, complete: true, text: '原生创造模式' });
  h.ctx.tools.register(defineContentToolFixture({ name: 'native_fixture', description: '原生工具', parameters: {}, async execute() { return [{ type: 'text', text: 'ok' }]; } }));
  await h.run({ expertId: 'development' });
  await turn(h.ctx, h.agent);
  assert.equal(h.adapter.requests.length, 1);
  const request = h.adapter.requests[0];
  assert.ok(request.tools.some(tool => tool.name === 'native_fixture'));
  assert.ok(request.messages.some(message => message.role === 'system' && message.content.some(block => block.text?.includes('原生创造模式'))));
  const contexts = request.messages.filter(message => message.source.kind === 'whalewing-expert');
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].role, 'user');
  assert.match(contexts[0].content[0].text, /非用户原话[\s\S]*研发专家/);
  await h.run({ expertId: null });
  await turn(h.ctx, h.agent);
  const last = h.adapter.requests.at(-1).messages.filter(message => message.source.kind === 'whalewing-expert').at(-1);
  assert.match(last.content[0].text, /历史专家身份不再生效/);
  assert.equal(h.agent.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'whalewing-expert').length, 2);
});

test('专家全文只在历史里看不到时重发，其余轮次发短提醒；换专家、改配置或全文被压缩后重发全文', async t => {
  const h = await harness(t);
  const contexts = () => h.adapter.requests.at(-1).messages.filter(message => message.source.kind === 'whalewing-expert').map(message => message.content[0].text);
  const isFull = text => text.includes('【怎么干活】') && text.includes('先加载再动手');
  await h.run({ expertId: 'development' });
  await turn(h.ctx, h.agent);
  const full = contexts().at(-1);
  assert.ok(isFull(full) && full.includes('研发专家') && full.includes('不打补丁'));
  // 第二轮：全文还在历史里，只追加短提醒，模型仍能看到那条全文。
  await turn(h.ctx, h.agent);
  assert.deepEqual(contexts().map(isFull), [true, false]);
  assert.match(contexts().at(-1), /本轮专家身份：研发专家。本会话前面那条完整的鲸翼专家上下文继续有效[^]*whalewing-debugging/);
  // 换成设计专家再换回：最近一条全文属于设计专家，研发专家要重发全文，不能借用别人的说明。
  await h.run({ expertId: 'design' });
  await turn(h.ctx, h.agent);
  assert.ok(isFull(contexts().at(-1)) && contexts().at(-1).includes('设计专家'));
  await h.run({ expertId: 'development' });
  await turn(h.ctx, h.agent);
  assert.equal(contexts().at(-1), full);
  await turn(h.ctx, h.agent);
  assert.ok(!isFull(contexts().at(-1)));
  // 员工改了这位专家的配置：全文变了，重发新全文。
  const current = h.ctx.whalewingExperts.get('development');
  await h.ctx.whalewingExperts.manage({ action: 'save', id: 'development', expectedRevision: current.revision, expert: { ...fieldsOf(current), prompt: `${current.prompt}\n补充：只用工程已有的依赖。` } });
  await turn(h.ctx, h.agent);
  assert.ok(isFull(contexts().at(-1)) && contexts().at(-1).includes('只用工程已有的依赖'));
  // 模拟上下文压缩：用一条摘要替换掉到目前为止的全部对话，下一轮必须重发全文。
  const surface = h.agent.session.snapshotEvents().filter(event => ['user/message', 'assistant/message'].includes(event.type) && event.surfaceOp === 'append');
  const start = surface[0].seq, end = surface.at(-1).seq;
  h.agent.session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '前面对话的摘要' }] }), { surfaceOp: { op: 'replace', startSeq: start, endSeq: end }, sourceEventSeqs: surface.map(event => event.seq) });
  assert.equal(h.agent.session.deriveMessages().filter(message => message.source?.kind === 'whalewing-expert').length, 0);
  await turn(h.ctx, h.agent);
  assert.deepEqual(contexts().map(isFull), [true]);
});

test('新spawn通过正式命令继承，fork直接从成功日志投影继承', async t => {
  const h = await harness(t);
  await h.run({ expertId: 'development' });
  const child = await h.create('child', { parentAgent: h.agent });
  assert.equal(h.state(child).view.expertId, 'development');
  assert.equal(child.session.snapshotEvents().filter(event => event.type === 'command/run').length, 1);
  assert.ok(h.saved.get('child').some(event => event.type === 'command/done'));
  const seed = h.agent.session.snapshotEvents();
  const fork = await h.create('fork', { seed, inheritedEventCount: seed.length, meta: { isSeeded: true, parentSession: 'parent' } });
  assert.equal(h.state(fork).view.expertId, 'development');
  assert.equal(fork.session.snapshotEvents().filter(event => event.type === 'command/run').length, 1);
});

test('投影忽略失败、错配回执和其它命令', () => {
  const run = { type: 'command/run', data: { commandId: 'a', name: 'whalewing-expert', args: '{"expertId":"development"}' } };
  const done = { type: 'command/done', data: { commandId: 'a', kind: 'success', text: '{"expertId":"development","name":"研发专家"}' } };
  const fold = events => events.reduce(Experts.expertProjection.apply, Experts.expertProjection.init());
  for (const events of [[done], [run, { ...done, data: { ...done.data, kind: 'error' } }], [run, { ...done, data: { ...done.data, text: '{}' } }], [{ ...run, data: { ...run.data, name: 'other' } }, done]]) {
    assert.equal(fold(events).selected, false);
  }
  Experts.expertProjection.stateSchema.parse(fold([run, done]));
});

test('运行中拒绝切换，不污染已有身份', async t => {
  const h = await harness(t);
  await h.run({ expertId: 'development' });
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  h.ctx.on('agent/pre-step', async (_, next) => { entered.resolve(); await release.promise; return next(); });
  const running = turn(h.ctx, h.agent);
  await entered.promise;
  try {
    assert.equal(h.agent.status, 'running');
    const result = await h.run({ expertId: null });
    assert.equal(result.result.kind, 'error');
    assert.match(result.result.text, /正在运行/);
    assert.equal(h.state().view.expertId, 'development');
  } finally { release.resolve(); }
  await running;
});

test('waterfall保留reject和元数据；同一轮只附加一次', async t => {
  const h = await harness(t);
  await h.run({ expertId: 'development' });
  const input = { agent: h.agent, turn: 1, step: 1, signal: new AbortController().signal };
  const dispatch = result => h.ctx.waterfall('agent/pre-step', input, () => Promise.resolve(result));
  const rejected = { kind: 'reject', reason: 'fixture' };
  assert.equal(await dispatch(rejected), rejected);
  const original = { kind: 'enter', startsRequestSeries: true, messages: [createUserMessage({ source: { kind: 'user' }, content: [] })] };
  const first = await dispatch(original);
  assert.equal(first.startsRequestSeries, true);
  assert.equal(first.messages.length, 2);
  assert.equal(await dispatch(original), original);
});

test('命令结算等待可取消，插件卸载清理命令、投影与等待者', async t => {
  const h = await harness(t);
  await h.run({ expertId: 'development' });
  h.agent.session.append('command/run', { commandId: 'pending', name: 'whalewing-expert', args: '{"expertId":null}' });
  const controller = new AbortController();
  const original = { kind: 'enter', messages: [createUserMessage({ source: { kind: 'user' }, content: [] })] };
  const dispatch = signal => h.ctx.waterfall('agent/pre-step', { agent: h.agent, turn: 1, step: 1, signal }, () => Promise.resolve(original));
  const listening = Promise.withResolvers();
  const add = controller.signal.addEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => { add(...args); listening.resolve(); };
  const cancelled = dispatch(controller.signal);
  const cancellation = assert.rejects(cancelled, /fixture cancellation/);
  await listening.promise;
  controller.abort(new Error('fixture cancellation'));
  await cancellation;
  const waiting = dispatch(new AbortController().signal);
  await h.expertPlugin.dispose();
  assert.equal(await waiting, original);
  assert.equal(h.ctx.commands.find(h.agent, 'whalewing-expert'), undefined);
  assert.equal(h.ctx.sessionProjections.snapshot(h.agent.session).values.whalewingExpert, undefined);
});

const fieldsOf = ({ id: _id, revision: _revision, builtin: _builtin, ...fields }) => fields;
const draft = () => ({ name: '审计专家', description: '检查已有业务资料与来源', avatar: null, prompt: '只核对有据可查的审计资料，明确出处和缺口。', model: null, skills: [], mcpServers: [] });

test('内置专家默认绑定三项基础技能和各自的通用专业技能，重置回到角色绑定，读回隔离可变数组且保留员工编辑', async t => {
  const h = await harness(t);
  const source = structuredClone(roles);
  const edited = new Map();
  assert.equal(roles.length, 10);
  for (const role of roles) {
    const initial = h.ctx.whalewingExperts.get(role.id);
    assert.deepEqual(initial.skills, role.skills);
    assert.deepEqual(initial.skills.slice(0, 3), ['whalewing-knowledge', 'whalewing-skill-evolution', 'whalewing-check']);
    assert.ok(initial.skills.length > 3);
    assert.notEqual(initial.skills, role.skills);
    initial.skills.push('仅本次读回');
    h.ctx.whalewingExperts.list().experts.find(expert => expert.id === role.id).skills.length = 0;
    assert.deepEqual(h.ctx.whalewingExperts.get(role.id).skills, role.skills);
    const saved = await h.ctx.whalewingExperts.manage({ action: 'save', id: role.id, expectedRevision: 0, expert: { ...fieldsOf(h.ctx.whalewingExperts.get(role.id)), prompt: `员工编辑：${role.id}`, skills: [] } });
    edited.set(role.id, structuredClone(saved.expert));
    saved.expert.skills.push('不应写回存储');
  }
  await h.expertPlugin.dispose();
  await h.ctx.plugin(Experts);
  for (const role of roles) {
    assert.deepEqual(h.ctx.whalewingExperts.get(role.id), edited.get(role.id));
    const reset = await h.ctx.whalewingExperts.manage({ action: 'restore', id: role.id, expectedRevision: 1 });
    assert.deepEqual(reset.expert.skills, role.skills);
    assert.equal(reset.expert.prompt, role.prompt);
    assert.equal(reset.expert.revision, 2);
    reset.expert.skills.length = 0;
    assert.deepEqual(h.ctx.whalewingExperts.get(role.id).skills, role.skills);
  }
  assert.deepEqual(roles, source);
});

test('测试专家按通用的测试用例模板出 Excel：13 列固定不改，用例编号只写数字从 001 往下排，带上 office 技能', () => {
  const testing = roles.find(role => role.id === 'testing');
  assert.ok(testing.skills.includes('office'), '要生成 Excel 文件得有 DSH 自带的 office 技能');
  const section = testing.prompt.split('## 测试用例模板')[1]?.split('\n## ')[0];
  assert.ok(section, '提示词里要有“测试用例模板”一节');
  const table = section.split('| 列 | 写法 |')[1].split('\n\n')[0];
  const columns = table.split('\n').filter(line => line.startsWith('| ') && !line.startsWith('|---')).map(line => line.split('|')[1].trim());
  assert.deepEqual(columns, ['序号', '测试用例编号', '一级模块', '二级模块', '用例名称', '测试点', '用例类型', '用例性质', '前置条件', '步骤描述', '预期结果', '测试轮次', '所属系统']);
  // 原模板的编号写的是“系统-一级模块-二级模块”，同一模块几十条用例编号相同；用户定只写数字、按行往下排。
  const idRule = table.split('\n').find(line => line.startsWith('| 测试用例编号 |'));
  assert.match(idRule, /只写数字，从 `001` 起按行往下排/);
  assert.match(idRule, /每条都不重复/);
  assert.doesNotMatch(idRule, /模块/, '编号里不再带模块名');
  assert.match(section, /编号接着表里最大的往后编，已有的编号不改/);
  assert.match(testing.prompt, /- \[ \] 测试用例按模板的 13 列出，编号从 001 往下排/);
  assert.match(testing.prompt, /生成或修改测试用例表等 Excel、Word 文件 → office/);
});

test('无会话专家候选允许配置本地技能，真实session目录及回合仍只认scoped运行时', async t => {
  const h = await harness(t); let candidateReads = 0;
  h.ctx.whalewing.skillCandidates = async () => { candidateReads++; return { skills: [{ name: 'local-configurable', description: '已入库但是否可用由真实模式决定' }], issues: [] }; };
  h.ctx.skills.list = async () => Object.freeze([]);
  const catalog = await h.ctx.whalewingExperts.manage({ action: 'catalog' });
  assert.deepEqual(catalog.skills.map(skill => skill.name), ['local-configurable']);
  const saved = await h.ctx.whalewingExperts.manage({ action: 'save', expectedRevision: 0, expert: { ...draft(), skills: ['local-configurable'] } });
  const readsBeforeSession = candidateReads;
  assert.deepEqual((await h.ctx.whalewingExperts.manage({ action: 'catalog', sessionId: h.agent.session.id })).skills, []);
  assert.equal(candidateReads, readsBeforeSession);
  await h.run({ expertId: saved.expert.id });
  let queriedScope;
  h.ctx.skills.get = async (_name, options) => { queriedScope = options.scope; return undefined; };
  const decision = { kind: 'enter', messages: [createUserMessage({ source: { kind: 'user' }, content: [] })] };
  // 绑定技能不存在时跳过，不让本轮失败，也不在专家上下文里提它。
  const skipped = await h.ctx.waterfall('agent/pre-step', { agent: h.agent, turn: 1, step: 1, signal: new AbortController().signal }, () => Promise.resolve(decision));
  assert.equal(queriedScope, h.agent);
  assert.equal(skipped.messages.length, 2);
  assert.doesNotMatch(skipped.messages[1].content[0].text, /local-configurable/);
  h.ctx.skills.get = async name => ({ name, description: '真实模式已发现', content: '真实模式正文' });
  const passed = await h.ctx.waterfall('agent/pre-step', { agent: h.agent, turn: 2, step: 1, signal: new AbortController().signal }, () => Promise.resolve(decision));
  assert.equal(passed.messages.length, 2);
});

test('动态专家使用唯一存储、默认模型、并发版本比较和卸载重读', async t => {
  const h = await harness(t);
  const api = h.ctx.whalewingExperts;
  const initial = api.get('manager');
  assert.equal(initial.name, '小鲸助手');
  const created = (await api.manage({ action: 'save', expectedRevision: 0, expert: draft() })).expert;
  const contract = expertContract(z);
  contract.result.parse({ expert: created });
  contract.result.parse(await api.manage({ action: 'list' }));
  contract.result.parse(await api.manage({ action: 'catalog' }));
  assert.equal(created.model, null);
  assert.equal((await h.run({ expertId: created.id })).result.kind, 'success');
  const edit = { action: 'save', id: 'manager', expectedRevision: 0, expert: { ...fieldsOf(initial), prompt: '本轮小鲸提示词已修改。' } };
  const results = await Promise.allSettled([api.manage(edit), api.manage(edit)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message, /另一处修改/);
  await assert.rejects(api.manage({ action: 'remove', id: 'manager', expectedRevision: 1 }), { code: 'EXPERT_BUILTIN' });
  assert.equal(api.get('manager').revision, 1);
  assert.equal(api.get('manager').prompt, edit.expert.prompt);
  await api.manage({ action: 'remove', id: created.id, expectedRevision: 1 });
  assert.equal(api.list().experts.some(item => item.id === created.id), false);
  await h.expertPlugin.dispose();
  await h.ctx.plugin(Experts);
  assert.equal(h.ctx.whalewingExperts.list().deleted.find(item => item.id === created.id).revision, 2);
  assert.equal(h.ctx.whalewingExperts.get('manager').prompt, edit.expert.prompt);
  const custom = await h.ctx.whalewingExperts.manage({ action: 'restore', id: created.id, expectedRevision: 2 });
  assert.deepEqual(custom.expert, { ...created, revision: 3 });
  const restored = await h.ctx.whalewingExperts.manage({ action: 'restore', id: 'manager', expectedRevision: 1 });
  assert.equal(restored.expert.name, '小鲸助手');
  assert.deepEqual(restored.expert, { ...initial, revision: 2 });
});

test('售前、实施改为模板：员工改过的转成可删除的自定义专家并保留内容，没改过的不再显示，模板库可读', async t => {
  const h = await harness(t);
  const edited = { id: 'presales', name: '售前专家', description: '员工改过的售前', avatar: null, prompt: '员工自己的售前提示词', model: null, skills: ['whalewing-check'], mcpServers: [], revision: 3, builtin: true, deleted: false };
  await h.ctx.whalewingExperts.store.table.put('presales', edited);
  await h.expertPlugin.dispose();
  await h.ctx.plugin(Experts);
  const api = h.ctx.whalewingExperts;
  const listed = (await api.manage({ action: 'list' })).experts;
  const { deleted: _deleted, ...fields } = edited;
  // 员工改过的介绍、提示词和自己列的技能保留；原版是同名模板，列表标出改过哪些。
  const { customized, baseUpdated: _updated, ...converted } = listed.find(item => item.id === 'presales');
  assert.deepEqual(converted, { ...fields, builtin: false, revision: 4 });
  assert.deepEqual(customized, ['description', 'prompt', 'skills']);
  assert.equal(listed.some(item => item.id === 'implementation'), false);
  assert.equal(listed.length, roles.length + 1);
  // 再次启动时的迁移不会重复改写已转好的记录。
  await api.store.retireBuiltins(['presales', 'implementation']);
  assert.equal(api.get('presales').revision, 4);
  await h.ctx.whalewingExperts.manage({ action: 'remove', id: 'presales', expectedRevision: 4 });
  assert.equal((await h.ctx.whalewingExperts.manage({ action: 'list' })).deleted.some(item => item.id === 'presales'), true);
  const { templates } = await h.ctx.whalewingExperts.manage({ action: 'templates' });
  assert.equal(templates.length, 10);
  const presales = templates.find(item => item.id === 'presales');
  assert.equal(presales.name, '售前专家'); assert.equal(presales.avatar, 'presales');
  assert.match(presales.prompt, /^# 售前专家\n\n你是售前专家，/u);
  // 返回的是副本，改它不影响模板库。
  presales.skills.length = 0;
  assert.ok((await h.ctx.whalewingExperts.manage({ action: 'templates' })).templates.find(item => item.id === 'presales').skills.length > 3);
});

test('全部内置身份禁止删除，保护不依赖记录的 builtin 字段', async t => {
  const h = await harness(t);
  const api = h.ctx.whalewingExperts;
  const builtins = api.list().experts;
  assert.equal(builtins.length, roles.length);
  for (const expert of builtins) {
    await assert.rejects(api.manage({ action: 'remove', id: expert.id, expectedRevision: expert.revision }), { code: 'EXPERT_BUILTIN' });
    assert.deepEqual(api.get(expert.id), expert);
    assert.equal(api.store.table.get(expert.id), undefined);
  }
  // 即使旧持久记录的元数据失真，身份集合仍是唯一保护依据。
  await api.store.table.put('manager', { ...api.get('manager'), builtin: false, deleted: false });
  await assert.rejects(api.manage({ action: 'remove', id: 'manager', expectedRevision: 0 }), { code: 'EXPERT_BUILTIN' });
  assert.equal(api.store.table.get('manager').deleted, false);
  const custom = (await api.manage({ action: 'save', expectedRevision: 0, expert: draft() })).expert;
  await api.store.table.put(custom.id, { ...custom, builtin: true, deleted: false });
  assert.equal((await api.manage({ action: 'remove', id: custom.id, expectedRevision: 1 })).deleted, true);
});

test('旧内置删除记录在服务就绪前恢复，保留编辑、自定义删除与迁移版本', async t => {
  const h = await harness(t);
  const api = h.ctx.whalewingExperts;
  const initial = api.list().experts;
  const legacy = initial.map((expert, index) => ({ ...expert, name: `员工编辑${index}`, prompt: `保留提示词${index}`, model: { provider: 'old-provider', model: 'old-model' }, skills: ['old-skill'], mcpServers: ['old-mcp'], revision: 10 + index, deleted: true }));
  for (const record of legacy) await api.store.table.put(record.id, record);
  const customId = 'custom-00000000-0000-4000-8000-000000000007';
  const custom = { ...draft(), id: customId, revision: 4, builtin: false, deleted: true };
  await api.store.table.put(customId, custom);
  await h.expertPlugin.dispose();
  const plugin = h.ctx.plugin(Experts);
  await plugin;
  for (const record of legacy) {
    const { deleted: _deleted, ...expert } = record;
    assert.deepEqual(h.ctx.whalewingExperts.get(record.id), { ...expert, revision: expert.revision + 1 });
    assert.equal(h.ctx.whalewingExperts.store.table.get(record.id).deleted, false);
  }
  assert.deepEqual(h.ctx.whalewingExperts.store.table.get(customId), custom);
  await assert.rejects(h.ctx.whalewingExperts.manage({ action: 'restore', id: 'manager', expectedRevision: 10 }), { code: 'CONFLICT' });
  await plugin.dispose();
  await h.ctx.plugin(Experts);
  assert.equal(h.ctx.whalewingExperts.get('manager').revision, 11);
  const reset = await h.ctx.whalewingExperts.manage({ action: 'restore', id: 'manager', expectedRevision: 11 });
  assert.deepEqual(reset.expert, { ...initial.find(expert => expert.id === 'manager'), revision: 12 });
});

test('内置迁移持久失败阻止启动就绪，重试不重复递增已恢复记录', async t => {
  const h = await harness(t);
  const initial = h.ctx.whalewingExperts.list().experts.slice(0, 2);
  for (const expert of initial) await h.ctx.whalewingExperts.store.table.put(expert.id, { ...expert, revision: 5, deleted: true });
  await h.expertPlugin.dispose();
  let domain = await h.ctx.storageDomain.open(expertDomain);
  let table = domain.table('experts');
  const update = table.update;
  table.update = async (...args) => {
    if (args[0] === initial[1].id) throw new Error('fixture migration persistence failure');
    return update.apply(table, args);
  };
  const open = h.ctx.storageDomain.open;
  h.ctx.storageDomain.open = async spec => spec === expertDomain ? domain : open.call(h.ctx.storageDomain, spec);
  try {
    const failed = h.ctx.plugin(Experts, { maxExperts: 200, operationMs: 15000 });
    await assert.rejects(failed.await(), /migration persistence failure/);
    await failed.dispose();
    assert.equal(h.ctx.get('whalewingExperts'), undefined);
  } finally { h.ctx.storageDomain.open = open; table.update = update; }
  domain = await h.ctx.storageDomain.open(expertDomain); table = domain.table('experts');
  assert.equal(table.get(initial[0].id).revision, 6);
  assert.equal(table.get(initial[0].id).deleted, false);
  assert.equal(table.get(initial[1].id).revision, 5);
  assert.equal(table.get(initial[1].id).deleted, true);
  const changes = await h.ctx.storageDomain.open(expertChangeDomain);
  await new ExpertStore(domain, 200, changes).restoreDeletedBuiltins();
  assert.equal(table.get(initial[0].id).revision, 6);
  assert.equal(table.get(initial[1].id).revision, 6);
  await domain.close(); await changes.close();
  await h.ctx.plugin(Experts);
  assert.equal(h.ctx.whalewingExperts.get(initial[0].id).revision, 6);
  assert.equal(h.ctx.whalewingExperts.get(initial[1].id).revision, 6);
});

test('目录不广播固定默认模型缺失，实际提供者与模型错误仍保留', async t => {
  const h = await harness(t);
  const api = h.ctx.whalewingExperts;
  h.ctx.sessionController.modelCatalog = async () => ({ groups: [{ id: 'other', name: '其它提供者', models: [{ id: 'available', name: '现有模型' }] }], failures: [] });
  assert.deepEqual((await api.manage({ action: 'catalog' })).issues, []);
  const created = (await api.manage({ action: 'save', expectedRevision: 0, expert: { ...draft(), model: { provider: 'other', model: 'available' } } })).expert;
  assert.equal((await api.manage({ action: 'save', expectedRevision: 0, expert: draft() })).expert.model, null);
  await assert.rejects(api.manage({ action: 'save', id: created.id, expectedRevision: 1, expert: { ...fieldsOf(created), model: { provider: 'other', model: 'missing' } } }), { code: 'MODEL_UNAVAILABLE' });
  assert.deepEqual(api.get(created.id), created);
  h.ctx.sessionController.modelCatalog = async () => ({ groups: [], failures: [{ message: '实际模型提供者连接失败' }] });
  h.ctx.provide('mcpResources', { catalog: () => [{ name: 'offline', connected: false, tools: [] }] });
  assert.deepEqual((await api.manage({ action: 'catalog' })).issues, ['实际模型提供者连接失败', 'MCP 连接 offline 尚未连接']);
});

test('内置重置遵循持久化与 CAS，迁移不覆盖较新的编辑', async t => {
  const h = await harness(t);
  const api = h.ctx.whalewingExperts;
  const initial = api.get('manager');
  const edited = (await api.manage({ action: 'save', id: 'manager', expectedRevision: 0, expert: { ...fieldsOf(initial), prompt: '保留员工编辑直到明确重置成功' } })).expert;
  const table = api.store.table, update = table.update;
  table.update = async () => { throw new Error('fixture reset persistence failure'); };
  try { await assert.rejects(api.manage({ action: 'restore', id: 'manager', expectedRevision: 1 }), /reset persistence failure/); }
  finally { table.update = update; }
  assert.deepEqual(api.get('manager'), edited);
  const reset = { action: 'restore', id: 'manager', expectedRevision: 1 };
  const results = await Promise.allSettled([api.manage(reset), api.manage(reset)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'CONFLICT');
  assert.deepEqual(api.get('manager'), { ...initial, revision: 2 });
  await table.put('manager', { ...edited, deleted: true });
  // 在迁移读取版本之后模拟另一个持久写入，不让迁移吞掉并发编辑。
  table.update = async (id, transform) => {
    await update.call(table, id, current => ({ ...current, revision: current.revision + 1, prompt: '并发保存的新版提示词' }));
    return update.call(table, id, transform);
  };
  try { await assert.rejects(api.store.restoreDeletedBuiltins(), { code: 'CONFLICT' }); }
  finally { table.update = update; }
  assert.equal(table.get('manager').prompt, '并发保存的新版提示词');
  assert.equal(table.get('manager').deleted, true);
  assert.equal(table.get('manager').revision, 2);
  await api.store.restoreDeletedBuiltins();
  assert.equal(api.get('manager').prompt, '并发保存的新版提示词');
  assert.equal(api.get('manager').revision, 3);
});

test('动态提示词和技能绑定进入真实请求，删除专家不静默回答', async t => {
  const h = await harness(t);
  const created = (await h.ctx.whalewingExperts.manage({ action: 'save', expectedRevision: 0, expert: draft() })).expert;
  await h.run({ expertId: created.id });
  await turn(h.ctx, h.agent);
  assert.match(h.adapter.requests.at(-1).messages.filter(item => item.source.kind === 'whalewing-expert').at(-1).content[0].text, /只核对有据可查的审计资料/);
  await h.ctx.whalewingExperts.manage({ action: 'save', id: created.id, expectedRevision: 1, expert: { ...fieldsOf(created), prompt: '仅使用新的提示词。' } });
  await turn(h.ctx, h.agent);
  assert.match(h.adapter.requests.at(-1).messages.filter(item => item.source.kind === 'whalewing-expert').at(-1).content[0].text, /仅使用新的提示词/);
  await h.ctx.whalewingExperts.manage({ action: 'remove', id: created.id, expectedRevision: 2 });
  const count = h.adapter.requests.length;
  await turn(h.ctx, h.agent);
  assert.equal(h.adapter.requests.length, count);
  assert.equal((await h.run({ expertId: created.id })).result.kind, 'error');
  assert.equal(h.state().view.expertId, created.id);
});

test('历史 manager 成功记录不依赖可变名称，配置错误保留原记录', async t => {
  const run = { type: 'command/run', data: { commandId: 'old', name: 'whalewing-expert', args: '{"expertId":"manager"}' } };
  const done = { type: 'command/done', data: { commandId: 'old', kind: 'success', text: '{"expertId":"manager","name":"项目管家"}' } };
  assert.equal([run, done].reduce(Experts.expertProjection.apply, Experts.expertProjection.init()).view.expertId, 'manager');
  const h = await harness(t);
  const original = h.ctx.whalewingExperts.get('manager');
  for (const change of [{ prompt: ' ' }, { avatar: 'data:image/svg+xml;base64,PHN2Zz4=' }, { model: { provider: 'missing', model: 'missing' } }, { skills: ['missing'] }, { mcpServers: ['missing'] }]) {
    await assert.rejects(h.ctx.whalewingExperts.manage({ action: 'save', id: 'manager', expectedRevision: 0, expert: { ...fieldsOf(original), ...change } }));
    assert.deepEqual(h.ctx.whalewingExperts.get('manager'), original);
  }
});

test('MCP 按正式归属限制实际请求工具，切换和继承不泄漏', async t => {
  const h = await harness(t);
  const servers = [{ name: 'bound__name', connected: true, tools: ['mcp__opaque_hash'] }, { name: 'other', connected: true, tools: ['mcp__other_read'] }];
  h.ctx.provide('mcpResources', { catalog: () => servers });
  for (const name of servers.flatMap(server => server.tools)) h.ctx.tools.register(defineContentToolFixture({ name, description: name, parameters: {}, async execute() { return [{ type: 'text', text: 'ok' }]; } }));
  const created = (await h.ctx.whalewingExperts.manage({ action: 'save', expectedRevision: 0, expert: { ...draft(), mcpServers: ['bound__name'] } })).expert;
  await h.run({ expertId: created.id });
  await turn(h.ctx, h.agent);
  assert.equal(h.adapter.requests.length, 1);
  assert.ok(h.adapter.requests[0].tools.some(tool => tool.name === 'mcp__opaque_hash'));
  assert.ok(!h.adapter.requests[0].tools.some(tool => tool.name === 'mcp__other_read'));
  const child = await h.create('mcp-child', { parentAgent: h.agent });
  await turn(h.ctx, child);
  assert.ok(!h.adapter.requests.at(-1).tools.some(tool => tool.name === 'mcp__other_read'));
  await h.run({ expertId: null });
  assert.ok(h.ctx.tools.schemas(h.agent).some(tool => tool.name === 'mcp__other_read'));
  await h.run({ expertId: created.id });
  await turn(h.ctx, h.agent);
  assert.ok(!h.adapter.requests.at(-1).tools.some(tool => tool.name === 'mcp__other_read'));
});

test('同层 MCP 遮蔽拒绝模型请求，缺服务不阻断普通专家', async t => {
  const h = await harness(t);
  await h.run({ expertId: 'development' });
  await turn(h.ctx, h.agent);
  assert.equal(h.adapter.requests.length, 1);
  h.ctx.provide('mcpResources', { catalog: () => [{ name: 'same-layer', connected: true, tools: ['mcp__local'] }] });
  h.agent.ctx.tools.register(defineContentToolFixture({ name: 'mcp__local', description: '本层 MCP', parameters: {}, async execute() { return [{ type: 'text', text: 'ok' }]; } }));
  await turn(h.ctx, h.agent);
  assert.equal(h.adapter.requests.length, 1);
});

test('头像完整解码、持久失败和取消保留原配置', async t => {
  const h = await harness(t);
  const { default: sharp } = await import('sharp');
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#aabbcc' } }).png().toBuffer();
  const fields = { ...draft(), avatar: `data:image/png;base64,${png.toString('base64')}` };
  const created = (await h.ctx.whalewingExperts.manage({ action: 'save', expectedRevision: 0, expert: fields })).expert;
  assert.equal(created.avatar, fields.avatar);
  await assert.rejects(h.ctx.whalewingExperts.manage({ action: 'save', id: created.id, expectedRevision: 1, expert: { ...fields, avatar: 'data:image/jpeg;base64,/9j/2Q==' } }), /图像检查/);
  const table = h.ctx.whalewingExperts.store.table;
  const update = table.update;
  // 在正式 domain 写入口注入持久层失败，不把内存替身当成真实磁盘故障证据。
  table.update = async () => { throw new Error('fixture durable write failure'); };
  try { await assert.rejects(h.ctx.whalewingExperts.manage({ action: 'remove', id: created.id, expectedRevision: 1 }), /durable write failure/); }
  finally { table.update = update; }
  assert.deepEqual(h.ctx.whalewingExperts.get(created.id), created);
  const controller = new AbortController(); controller.abort(new Error('员工取消'));
  await assert.rejects(h.ctx.whalewingExperts.manage({ action: 'remove', id: created.id, expectedRevision: 1 }, controller.signal), /员工取消/);
  assert.deepEqual(h.ctx.whalewingExperts.get(created.id), created);
});

// 2026-11-02 用户反馈：小鲸做插件管理时用第三方 dsh-ego-browser 的浏览器工具去开 DSH 自己的网页“亲自看一眼”，弹出空窗口。
test('小鲸不带 ego_* 浏览器工具，宿主列不出 MCP 时也藏；其他专家照常可用', async t => {
  for (const catalog of [() => [], undefined]) {
    const h = await harness(t);
    h.ctx.provide('mcpResources', catalog ? { catalog } : {});
    for (const name of ['ego_navigate', 'plain_fixture']) h.ctx.tools.register(defineContentToolFixture({ name, description: name, parameters: {}, async execute() { return [{ type: 'text', text: 'ok' }]; } }));
    await h.run({ expertId: 'manager' });
    await turn(h.ctx, h.agent);
    assert.ok(!h.adapter.requests.at(-1).tools.some(tool => tool.name === 'ego_navigate'), '小鲸的请求里没有 ego 工具');
    assert.ok(h.adapter.requests.at(-1).tools.some(tool => tool.name === 'plain_fixture'), '别的工具照常带上');
    await h.run({ expertId: 'research' });
    await turn(h.ctx, h.agent);
    assert.ok(h.adapter.requests.at(-1).tools.some(tool => tool.name === 'ego_navigate'), '研究专家照常可用');
  }
});

test('MCP 资源守卫按 server 判断、断线阻断并在卸载时清理', async t => {
  const h = await harness(t);
  const servers = [{ name: 'bound', connected: true, tools: ['mcp__bound_read'] }, { name: 'other', connected: true, tools: [] }];
  h.ctx.provide('mcpResources', { catalog: () => servers });
  let calls = 0;
  for (const name of ['mcp__bound_read', 'read_mcp_resource']) h.ctx.tools.register(defineContentToolFixture({ name, description: name, parameters: { server: { type: 'string', required: true } }, async execute() { calls++; return [{ type: 'text', text: 'ok' }]; } }));
  const created = (await h.ctx.whalewingExperts.manage({ action: 'save', expectedRevision: 0, expert: { ...draft(), mcpServers: ['bound'] } })).expert;
  await h.run({ expertId: created.id });
  // DSH 0.2.2 起 tools.execute 按批执行；单次调用包成只有一条的批，取回这一条的结果。
  const execute = server => h.ctx.tools.execute({ calls: [{ id: `resource-${server}`, name: 'read_mcp_resource', arguments: JSON.stringify({ server }) }], agent: h.agent, signal: new AbortController().signal }).then(batch => batch.results[0].result);
  await execute('other'); assert.equal(calls, 0);
  await execute('bound'); assert.equal(calls, 1);
  servers[0].connected = false;
  await execute('bound'); assert.equal(calls, 1);
  await turn(h.ctx, h.agent); assert.equal(h.adapter.requests.length, 0);
  const catalog = await h.ctx.whalewingExperts.manage({ action: 'catalog' });
  assert.equal(catalog.mcpServers[0].connected, false);
  assert.ok(catalog.issues.some(issue => issue.includes('bound')));
  await h.expertPlugin.dispose();
  await execute('other'); assert.equal(calls, 2);
});

test('绑定技能缺失时照常对话，未证明归属的新 MCP 工具仍阻断回合', async t => {
  const h = await harness(t);
  await h.run({ expertId: 'development' });
  h.ctx.skills.get = async () => undefined;
  await turn(h.ctx, h.agent);
  assert.equal(h.adapter.requests.length, 1, '技能没装就跳过，不让本轮失败');
  const unknown = h.agent.ctx.tools.register(defineContentToolFixture({ name: 'mcp__unknown', description: '无归属证明', parameters: {}, async execute() { throw new Error('不应执行'); } }));
  h.ctx.skills.get = async name => ({ name, description: '恢复技能' });
  await turn(h.ctx, h.agent);
  assert.equal(h.adapter.requests.length, 1);
  unknown();
  await turn(h.ctx, h.agent);
  assert.equal(h.adapter.requests.length, 2);
});

test('固定新建身份在回执丢失与并发重试时只保存一份，冲突不覆盖', async t => {
  const h = await harness(t);
  const api = h.ctx.whalewingExperts;
  const id = 'custom-00000000-0000-4000-8000-000000000001';
  const input = { action: 'save', id, expectedRevision: 0, expert: draft() };
  const results = await Promise.allSettled([api.manage(input), api.manage(input)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'CONFLICT');
  assert.equal(api.list().experts.filter(expert => expert.id === id).length, 1);
  assert.equal(api.get(id).revision, 1);
  assert.equal(api.get(id).model, null);
  // 模拟客户端丢失第一次响应后携带同一身份重试，服务器不得按名字另建或覆盖。
  await assert.rejects(api.manage({ ...input, expert: { ...draft(), name: '不应覆盖的名字' } }), { code: 'CONFLICT' });
  assert.equal(api.get(id).name, '审计专家');
  assert.equal(api.get(id).revision, 1);
  for (const invalid of ['custom-not-a-uuid', 'other-expert', 'custom-00000000-0000-0000-0000-000000000001']) await assert.rejects(api.manage({ ...input, id: invalid }), { code: 'EXPERT_ID' });
  await assert.rejects(api.manage({ ...input, id: 'custom-00000000-0000-4000-8000-000000000002', expectedRevision: 1 }), { code: 'EXPERT_ID' });
});

test('新增专家容量预留为原子操作，持久化失败不占身份或声称成功', async t => {
  const h = await harness(t, true, { maxExperts: roles.length + 1 });
  const api = h.ctx.whalewingExperts;
  const first = { action: 'save', id: 'custom-00000000-0000-4000-8000-000000000003', expectedRevision: 0, expert: draft() };
  const table = api.store.table, put = table.put;
  table.put = async () => { throw Object.assign(new Error('fixture create persistence failure'), { code: 'DISK_FAILURE' }); };
  try { await assert.rejects(api.manage(first), { code: 'DISK_FAILURE' }); }
  finally { table.put = put; }
  assert.equal(api.list().experts.length, roles.length);
  assert.throws(() => api.get(first.id), { code: 'EXPERT_DELETED' });
  const results = await Promise.allSettled([api.manage(first), api.manage({ ...first, id: 'custom-00000000-0000-4000-8000-000000000004' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'EXPERT_LIMIT');
  assert.equal(api.list().experts.length, roles.length + 1);
});

test('真实 TypertRegistry 核心内部知识与专家分别注册，子插件卸载不注销其它命名空间', async t => {
  const h = await harness(t);
  const knowledge = h.ctx.whalewing.registry.bases.get('knowledge').fiber;
  assert.ok(h.ctx.typert.getPackage('dsh-whalewing'));
  assert.ok(h.ctx.typert.getPackage('dsh-whalewing/experts'));
  assert.equal((await h.ctx.whalewingKnowledge.manage({ action: 'status' }, new AbortController().signal)).initialized, true);
  assert.equal((await h.ctx.whalewingExperts.manage({ action: 'list' })).experts.length, roles.length);
  await h.expertPlugin.dispose();
  assert.equal(h.ctx.typert.getPackage('dsh-whalewing/experts'), undefined);
  assert.ok(h.ctx.typert.getPackage('dsh-whalewing'));
  await h.ctx.plugin(Experts);
  assert.equal((await h.ctx.whalewingExperts.manage({ action: 'list' })).experts.length, roles.length);
  await knowledge.dispose();
  assert.equal(h.ctx.typert.getPackage('dsh-whalewing/knowledge'), undefined);
  assert.ok(h.ctx.typert.getPackage('dsh-whalewing/experts'));
  assert.ok(h.ctx.typert.getPackage('dsh-whalewing'));
  await h.coreFiber.dispose();
  assert.equal(h.ctx.typert.getPackage('dsh-whalewing'), undefined);
});


test('两种注册顺序均保留原生模型快照，专家不写选择事件或全局默认', async t => {
  for (const ownerFirst of [false, true]) {
    const h = await harness(t);
    if (ownerFirst) { await h.expertPlugin.dispose(); await h.ctx.plugin(Experts); }
    let model = 'first';
    h.ctx.agentDefaultModel.currentSelection = () => ({ provider: 'fixture', model });
    h.adapter.resolveModel = async (provider, id) => ({ provider, id, name: id, reasoning: { efforts: [{ id: 'medium', name: '中' }], defaultEffort: 'medium' } });
    await h.run({ expertId: 'manager' });
    await turn(h.ctx, h.agent);
    assert.equal(h.agent.session.requestHeader().config.model, 'first');
    model = 'second';
    await turn(h.ctx, h.agent);
    const config = h.agent.session.requestHeader().config;
    assert.equal(config.model, 'first');
    assert.equal(config.reasoningEffort, 'medium');
    // DSH 0.2.2 起循环每一步把固定下来的模型选择传给组装；这里照样传，核对的是同一份快照。
    const assembly = await h.ctx.systemPrompt.assemble({ agent: h.agent, scope: h.agent, modelSelection: h.agent.model.current() });
    assert.equal(assembly.variables.model, 'first');
    const selections = () => h.agent.session.snapshotEvents().filter(event => event.type === 'model/selection');
    assert.equal(selections().length, 0);
    await turn(h.ctx, h.agent);
    assert.equal(selections().length, 0);
    assert.equal(h.adapter.requests.length, 3);
  }
});

test('原版保留会话实际模型，manager和普通专家的专属配置不取得选模权', async t => {
  const h = await harness(t);
  await turn(h.ctx, h.agent);
  h.ctx.agentDefaultModel.currentSelection = () => ({ provider: 'fixture', model: 'new-default' });
  await turn(h.ctx, h.agent);
  assert.equal(h.agent.session.requestHeader().config.model, 'fixture');
  assert.equal(h.agent.session.snapshotEvents().some(event => event.type === 'model/selection'), false);
  for (const id of ['manager', 'development']) {
    const api = h.ctx.whalewingExperts;
    const old = api.get(id);
    const expert = (await api.store.save({ id, expectedRevision: old.revision, expert: { ...fieldsOf(old), model: { provider: 'fixture', model: 'dedicated-' + id } } })).expert;
    await h.run({ expertId: id });
    const prepared = await api.manage({ action: 'prepare_model', sessionId: h.agent.id, expertId: id, expectedRevision: expert.revision });
    assert.equal(prepared.selected.model, 'fixture');
    assert.equal(prepared.applied, false);
    await turn(h.ctx, h.agent);
    assert.equal(h.agent.session.requestHeader().config.model, 'fixture');
  }
});

test('模型准备的身份断言不授予选择权，缺默认和失效路由不回退', async t => {
  const h = await harness(t);
  const api = h.ctx.whalewingExperts;
  const input = { action: 'prepare_model', sessionId: h.agent.id, expertId: 'manager', expectedRevision: 0 };
  await assert.rejects(api.manage(input), { code: 'EXPERT_CHANGED' });
  assert.equal(h.state().view.expertId, null);
  await h.run({ expertId: 'manager' });
  await assert.rejects(api.manage({ ...input, expectedRevision: 2 }), { code: 'EXPERT_CHANGED' });
  h.ctx.agentDefaultModel.currentSelection = () => ({ provider: '', model: '' });
  await assert.rejects(api.manage(input), { code: 'MODEL_UNAVAILABLE' });
  h.ctx.agentDefaultModel.currentSelection = () => ({ provider: 'not-configured', model: 'missing' });
  assert.deepEqual((await api.manage(input)).selected, { provider: 'not-configured', model: 'missing' });
  // 只检查本次回合的持久失败事件，普通配置中的provider字段不构成错误证据。
  const before = h.agent.session.snapshotEvents().length;
  await turn(h.ctx, h.agent);
  assert.equal(await h.ctx.sessions.flush(h.agent.session), true);
  const { events } = await h.ctx.sessionQuery.readSession(h.agent.id);
  const starts = events.slice(before).filter(event => event.type === 'turn/start');
  const ends = events.slice(before).filter(event => event.type === 'turn/end');
  assert.equal(starts.length, 1); assert.equal(ends.length, 1);
  assert.equal(ends[0].data.turn, starts[0].data.turn);
  assert.deepEqual(ends[0].data.reason, {
    kind: 'error',
    error: { code: 'NO_ADAPTER', message: 'no adapter registered for provider "not-configured"' },
  });
  assert.equal(h.adapter.requests.length, 0);
  assert.equal(h.agent.session.snapshotEvents().some(event => event.type === 'model/selection'), false);
});

test('原生子代理继承父真实请求型号且保留子任务显式覆盖，不走普通会话选择器', async t => {
  const h = await harness(t);
  h.ctx.agentDefaultModel.currentSelection = () => ({ provider: 'fixture', model: 'parent-default' });
  await h.run({ expertId: 'development' });
  await turn(h.ctx, h.agent);
  h.ctx.sessionController.selectModel = async () => { throw new Error('子代理不得调用普通会话选模'); };
  for (const override of [undefined, { model: 'child-explicit' }]) {
    const options = resolveChildAgentOptions(h.agent, override, 1);
    const child = await h.create(override ? 'explicit-child' : 'inherited-child', { parentAgent: h.agent, meta: { origin: 'subagent', parentSession: h.agent.id }, agentOptions: options });
    await turn(h.ctx, child);
    assert.equal(child.session.requestHeader().config.model, override?.model ?? 'parent-default');
    await assert.rejects(h.ctx.whalewingExperts.manage({ action: 'prepare_model', sessionId: child.id, expertId: 'development', expectedRevision: 0 }), { code: 'SESSION_UNAVAILABLE' });
  }
});

test('原版模型准备在取消或卸载后拒收，不发送请求也不改模型', async t => {
  for (const unload of [false, true]) {
    const h = await harness(t);
    await h.run({ expertId: 'manager' });
    const api = h.ctx.whalewingExperts, control = new AbortController();
    if (unload) await h.expertPlugin.dispose(); else control.abort(new Error('取消准备'));
    await assert.rejects(api.prepareModel({ sessionId: h.agent.id, expertId: 'manager', expectedRevision: 0 }, control.signal));
    assert.equal(h.adapter.requests.length, 0);
    assert.equal(h.agent.session.requestHeader(), undefined);
    assert.equal(h.agent.session.snapshotEvents().some(event => event.type === 'model/selection'), false);
  }
});

test('真实JSONL冷恢复保留原生已用模型，不由专家覆盖为新默认', async t => {
  const h = await harness(t);
  const created = await h.ctx.agents.create({ sessionId: 'cold-model', meta: { cwd: h.directory, agentPreset: 'standard' }, agentOptions: { provider: 'fixture', model: 'initial' } });
  await h.run({ expertId: 'manager' }, created.agent);
  await turn(h.ctx, created.agent);
  assert.equal(created.agent.session.requestHeader().config.model, 'initial');
  assert.equal(await h.ctx.sessions.flush(created.agent.session), true);
  await created.dispose();
  h.ctx.agentDefaultModel.currentSelection = () => ({ provider: 'fixture', model: 'after-restart' });
  const { agent } = await h.ctx.sessionController.resolveAgent('cold-model');
  assert.equal(h.state(agent).view.expertId, 'manager');
  await turn(h.ctx, agent);
  assert.equal(agent.session.requestHeader().config.model, 'initial');
  assert.equal(agent.session.snapshotEvents().some(event => event.type === 'model/selection'), false);
});

test('原版模型准备拒收过期专家版本和退出的会话身份，不接管新身份', async t => {
  for (const changeRole of [false, true]) {
    const h = await harness(t);
    await h.run({ expertId: 'manager' });
    if (changeRole) {
      const role = h.ctx.whalewingExperts.get('manager');
      await h.ctx.whalewingExperts.store.save({ id: role.id, expectedRevision: role.revision, expert: { ...fieldsOf(role), description: '员工正在更新角色' } });
    } else await h.run({ expertId: null });
    await assert.rejects(h.ctx.whalewingExperts.manage({ action: 'prepare_model', sessionId: h.agent.id, expertId: 'manager', expectedRevision: 0 }), { code: 'EXPERT_CHANGED' });
    assert.equal(h.adapter.requests.length, 0);
    assert.equal(h.agent.session.snapshotEvents().some(event => event.type === 'model/selection'), false);
  }
});

test('凭据失败保留所选路由和原错误，不静默重试其它型号', async t => {
  const h = await harness(t);
  h.ctx.agentDefaultModel.currentSelection = () => ({ provider: 'fixture', model: 'employee-model' });
  let attempts = 0;
  h.adapter.stream = async function* () { attempts++; throw new Error('fixture credential unavailable'); };
  await h.run({ expertId: 'manager' });
  await turn(h.ctx, h.agent);
  assert.equal(attempts, 1);
  assert.equal(h.agent.session.requestHeader().config.model, 'employee-model');
  assert.match(JSON.stringify(h.agent.session.snapshotEvents()), /fixture credential unavailable/);
  assert.deepEqual(h.ctx.agentDefaultModel.currentSelection(), { provider: 'fixture', model: 'employee-model' });
});

test('自动会话保留原生模型快照，manager专用型号不影响任务且未认领拒绝准备', async t => {
  const h = await harness(t);
  await assert.rejects(h.ctx.whalewingExperts.prepareModel({ sessionId: h.agent.id, automation: true }), { code: 'AUTOMATION_IDENTITY' });
  const manager = h.ctx.whalewingExperts.get('manager');
  await h.ctx.whalewingExperts.store.save({ id: 'manager', expectedRevision: manager.revision, expert: { ...fieldsOf(manager), model: { provider: 'fixture', model: 'manager-only' } } });
  await h.run({ expertId: 'manager' });
  await h.ctx.commands.execute(h.agent, '/whalewing {"action":"automation_claim","purpose":"knowledge"}', [], new AbortController().signal);
  for (const model of ['employee-gpt', 'employee-claude']) {
    h.ctx.agentDefaultModel.currentSelection = () => ({ provider: 'fixture', model });
    await turn(h.ctx, h.agent);
    assert.equal(h.agent.session.requestHeader().config.model, 'employee-gpt');
  }
  assert.equal(h.adapter.requests.length, 2);
  h.ctx.agentDefaultModel.currentSelection = () => ({ provider: '', model: '' });
  assert.equal((await h.ctx.whalewingExperts.prepareModel({ sessionId: h.agent.id, automation: true })).selected.model, 'employee-gpt');
  const fresh = await h.create('empty-default');
  await h.ctx.commands.execute(fresh, '/whalewing {"action":"automation_claim","purpose":"knowledge"}', [], new AbortController().signal);
  await assert.rejects(h.ctx.whalewingExperts.prepareModel({ sessionId: fresh.id, automation: true }), { code: 'MODEL_UNAVAILABLE' });
});

test('自动任务用途从目标版JSONL冷日志恢复，普通fork排除父用途且未激活Agent', async t => {
  const h = await harness(t);
  const created = await h.ctx.agents.create({ sessionId: 'cold-auto', meta: { agentPreset: 'standard' }, agentOptions: { provider: 'fixture', model: 'fixture' } });
  await h.ctx.commands.execute(created.agent, '/whalewing {"action":"automation_claim","purpose":"custom"}', [], new AbortController().signal);
  assert.equal(await h.ctx.sessions.flush(created.agent.session), true);
  await created.dispose();
  assert.equal(h.ctx.agents.get('cold-auto'), undefined);
  const observation = await h.ctx.sessionQuery.observeSession('cold-auto', { signal: new AbortController().signal });
  try { assert.equal(observation.projections.values.whalewingAutomation, 'custom'); }
  finally { observation[Symbol.dispose](); }
  assert.equal(h.ctx.agents.get('cold-auto'), undefined);
  const snapshot = await h.ctx.sessionQuery.readSession('cold-auto');
  const forked = snapshot.events.reduce(automationProjection.apply, automationProjection.init({}, snapshot.events.length));
  assert.equal(forked.purpose, null);
});

test('未适配的DSH：专家不切换专属模型也不写全局默认，列不出MCP时不拦截请求', async t => {
  const h = await harness(t);
  // 宿主有 MCP 服务但没有目录接口：专家不做绑定过滤，照常发请求。
  h.ctx.provide('mcpResources', {});
  const api = h.ctx.whalewingExperts;
  const old = api.get('development');
  await api.store.save({ id: 'development', expectedRevision: old.revision, expert: { ...fieldsOf(old), model: { provider: 'fixture', model: 'dedicated' } } });
  await h.run({ expertId: 'development' });
  await turn(h.ctx, h.agent);
  // agentDefaultModel.saveSelection 一旦被调用就会抛错；会话仍用原模型，没有发生切换。
  assert.equal(h.agent.session.requestHeader().config.model, 'fixture');
  assert.equal(h.agent.session.snapshotEvents().some(event => event.type === 'model/selection'), false);
  assert.equal(h.adapter.requests.length, 1);
  const prepared = await api.manage({ action: 'prepare_model', sessionId: h.agent.session.id, expertId: 'development', expectedRevision: api.get('development').revision });
  assert.deepEqual(prepared, { selected: { provider: 'fixture', model: 'fixture' }, applied: false });
  const catalog = await api.manage({ action: 'catalog' });
  assert.equal(catalog.mcpSupported, false); assert.equal(catalog.modelSupported, false); assert.deepEqual(catalog.mcpServers, []);
});


test('四可选原生fiber关闭与重载不卸载五底座，独立持久域保留且模型技能知识仍可用', async t => {
  const h = await harness(t), ctx = h.ctx;
  ctx.provide('profileContext', { dir: h.directory });
  const hosts = [AiWeb, Toolbox, Cards, ModelWorld], fibers = [];
  for (const host of hosts) fibers.push(await ctx.plugin(host));
  const aiInput = { action: 'save', id: 'custom-12345678-1234-4234-8234-123456789abc', expectedRevision: 0, entry: { name: '保留入口', url: 'https://example.com/' } };
  await ctx.whalewingAiWeb.manageAiWeb(aiInput);
  const news = await ctx.whalewingCards.manageNews({ action: 'list' });
  const world = await ctx.whalewingModelWorld.manageModelWorld({ action: 'status' });
  const previous = [ctx.whalewingAiWeb, ctx.whalewingCards, ctx.whalewingModelWorld];
  for (const fiber of fibers) await fiber.dispose();
  assert.deepEqual(ctx.whalewing.features().features.map(feature => [feature.id, feature.kind, feature.error]), ['experts', 'assistant', 'knowledge', 'skills', 'automation'].map(id => [id, 'base', undefined]));
  for (const name of ['whalewingAiWeb', 'whalewingCards', 'whalewingModelWorld']) assert.equal(ctx.get(name), undefined);
  assert.equal((await ctx.whalewingKnowledge.manage({ action: 'status' })).initialized, true);
  const found = await ctx.whalewingKnowledge.manage({ action: 'search' }); assert.ok(found.notes.length);
  assert.ok((await ctx.whalewingKnowledge.manage({ action: 'read', path: found.notes[0].path })).content);
  assert.ok(await ctx.whalewingSkills.manageSkills({ action: 'list' }));
  assert.deepEqual((await ctx.whalewingAutomation.manageAutomation({ action: 'catalog' })).tasks, []);
  assert.ok(await ctx.whalewingAutomation.manageAutomation({ action: 'directory' }));
  assert.equal((await h.run({ expertId: 'development' })).result.kind, 'success');
  const role = ctx.whalewingExperts.get('development');
  assert.ok((await ctx.whalewingExperts.prepareModel({ sessionId: h.agent.id, expertId: role.id, expectedRevision: role.revision })).selected);
  await turn(ctx, h.agent); assert.equal(h.adapter.requests.length, 1);
  for (const [action, args] of [['browse', {}], ['question', { question: '现有知识', paths: [found.notes[0].path] }]]) {
    const result = await ctx.commands.execute(h.agent, `/whalewing ${JSON.stringify({ action, ...args })}`, [], new AbortController().signal);
    assert.equal(result.result.kind, 'success');
  }
  for (const host of hosts) await ctx.plugin(host);
  assert.ok((await ctx.whalewingAiWeb.manageAiWeb({ action: 'list' })).entries.some(entry => entry.id === aiInput.id));
  assert.deepEqual((await ctx.whalewingCards.manageNews({ action: 'list' })).fields, news.fields);
  assert.deepEqual(await ctx.whalewingModelWorld.manageModelWorld({ action: 'status' }), world);
  for (const [host, method] of [[previous[0], 'manageAiWeb'], [previous[1], 'manageNews'], [previous[2], 'manageModelWorld']]) await assert.rejects(host[method]({ action: method === 'manageModelWorld' ? 'status' : 'list' }), /卸载/);
});

// 2026-11-01 专家来源插槽：扩展把专家推给专家团队，和自己的专家一起显示；没装扩展时一切照旧。
const sourceLabel = { zh: '团队', en: 'Team' };
async function teamExtension(ctx, setup) {
  let source;
  const fiber = await ctx.plugin({ inject: ['whalewing'], apply(current) {
    current.whalewing.features.register(current, { id: 'team', api: 1, package: 'dsh-fixture-team' });
    source = setup(current);
  } });
  return { fiber, source: () => source };
}
const lead = { id: 'lead', revision: 1, name: '团队组长', description: '按团队规范带大家干活', prompt: '团队提示词：先看团队规范再动手', skills: ['whalewing-debugging'] };
const guide = { id: 'guide', revision: 3, name: '新人向导', description: '带新人熟悉团队', prompt: '团队提示词：耐心解释', readOnly: true };

test('没装专家来源时专家列表、模型工具和管理列表与原来完全相同', async t => {
  const h = await harness(t);
  const registry = h.ctx.whalewingExperts;
  assert.deepEqual(registry.list(), registry.store.list());
  assert.deepEqual(await registry.manage({ action: 'list' }), registry.store.list(true));
  assert.ok((await registry.manage({ action: 'list' })).experts.every(expert => !Object.hasOwn(expert, 'source') && !Object.hasOwn(expert, 'readOnly')));
  // 只登记功能、不登记专家来源的扩展也不改变列表。
  await h.ctx.plugin({ inject: ['whalewing'], apply(current) { current.whalewing.features.register(current, { id: 'plain', api: 1, package: 'dsh-fixture-plain' }); } });
  assert.deepEqual(await registry.manage({ action: 'list' }), registry.store.list(true));
});

test('来源专家和自己的专家一起列出，可以选来开会话并注入团队提示词', async t => {
  const h = await harness(t);
  const contract = expertContract(z);
  const team = await teamExtension(h.ctx, current => { const source = current.whalewing.experts.registerSource(current, { label: sourceLabel, async save() { throw new Error('不该保存'); } }); source.set([lead, guide]); return source; });
  const listed = contract.result.parse(await h.ctx.whalewingExperts.manage({ action: 'list' }));
  const fromTeam = listed.experts.filter(expert => expert.source);
  assert.deepEqual(fromTeam.map(expert => [expert.id, expert.readOnly, expert.source.label.zh, expert.model, expert.mcpServers.length, expert.builtin]), [['team--lead', false, '团队', null, 0, false], ['team--guide', true, '团队', null, 0, false]]);
  assert.deepEqual(listed.experts.slice(0, -2).map(expert => expert.id), h.ctx.whalewingExperts.store.list(true).experts.map(expert => expert.id), '自己的专家在前，顺序不变');
  assert.ok(h.ctx.whalewingExperts.list().experts.some(expert => expert.id === 'team--lead'), '模型工具读的列表也有来源专家');
  assert.equal((await h.run({ expertId: 'team--lead' })).result.kind, 'success');
  assert.equal(h.state().view.expertId, 'team--lead');
  await turn(h.ctx, h.agent);
  const context = () => h.adapter.requests.at(-1).messages.filter(message => message.source.kind === 'whalewing-expert').at(-1).content[0].text;
  assert.match(context(), /本轮专家身份：团队组长[\s\S]*团队提示词：先看团队规范再动手[\s\S]*whalewing-debugging/);
  // 扩展换了列表：同一会话下一轮用新的提示词。
  team.source().set([{ ...lead, revision: 2, prompt: '团队提示词：第二版' }]);
  await turn(h.ctx, h.agent);
  assert.match(context(), /团队提示词：第二版/);
});

test('维护人在专家团队里改来源专家：保存交给扩展，只读、删除、模型绑定和版本冲突都拒收', async t => {
  const h = await harness(t);
  const contract = expertContract(z);
  const saves = [];
  let closeDuringSave = null;
  const team = await teamExtension(h.ctx, current => {
    const source = current.whalewing.experts.registerSource(current, { label: sourceLabel, async save(input, { signal }) {
      assert.ok(signal instanceof AbortSignal);
      saves.push(input);
      if (closeDuringSave) await closeDuringSave();
      return { ...lead, ...input.expert, id: input.id, revision: input.expectedRevision + 1 };
    } });
    source.set([lead, guide]); return source;
  });
  const registry = h.ctx.whalewingExperts;
  const current = registry.get('team--lead');
  const fields = { name: '团队组长', description: '改过的介绍', avatar: null, prompt: '改过的提示词', model: null, skills: ['whalewing-debugging'], mcpServers: [] };
  const saved = contract.result.parse(await registry.manage({ action: 'save', id: 'team--lead', expectedRevision: current.revision, expert: fields }));
  assert.deepEqual(saves.at(-1), { id: 'lead', expectedRevision: 1, expert: { name: '团队组长', description: '改过的介绍', avatar: null, prompt: '改过的提示词', skills: ['whalewing-debugging'] } });
  assert.deepEqual([saved.expert.id, saved.expert.revision, saved.expert.description], ['team--lead', 2, '改过的介绍']);
  assert.equal(Object.hasOwn(saved.expert, 'source'), false, '保存回执和自定义专家同一格式');
  assert.equal((await registry.manage({ action: 'list' })).experts.find(expert => expert.id === 'team--lead').revision, 2, '列表马上读回扩展确认的版本');
  await assert.rejects(registry.manage({ action: 'save', id: 'team--lead', expectedRevision: 1, expert: fields }), { code: 'CONFLICT' });
  await assert.rejects(registry.manage({ action: 'save', id: 'team--lead', expectedRevision: 2, expert: { ...fields, model: { provider: 'fixture', model: 'fixture' } } }), { code: 'EXPERT_INPUT' });
  await assert.rejects(registry.manage({ action: 'save', id: 'team--guide', expectedRevision: 3, expert: { ...fields, name: '新人向导' } }), { code: 'EXPERT_SOURCE_READONLY' });
  for (const action of ['remove', 'restore']) await assert.rejects(registry.manage({ action, id: 'team--lead', expectedRevision: 2 }), { code: 'EXPERT_SOURCE_READONLY' });
  assert.equal(saves.length, 1);
  // 扩展在保存途中被关掉：不认这次结果。
  closeDuringSave = () => team.fiber.dispose();
  await assert.rejects(registry.manage({ action: 'save', id: 'team--lead', expectedRevision: 2, expert: fields }), { code: 'EXPERT_SOURCE_CLOSED' });
});

test('扩展关闭后来源专家撤下，已选它的会话说明原因；重开恢复，卸载后迟到的 set 被拒收', async t => {
  const h = await harness(t);
  let team = await teamExtension(h.ctx, current => { const source = current.whalewing.experts.registerSource(current, { label: sourceLabel }); source.set([lead]); return source; });
  assert.equal((await h.run({ expertId: 'team--lead' })).result.kind, 'success');
  const old = team.source();
  await team.fiber.dispose();
  assert.equal((await h.ctx.whalewingExperts.manage({ action: 'list' })).experts.some(expert => expert.source), false);
  assert.throws(() => h.ctx.whalewingExperts.get('team--lead'), { code: 'EXPERT_SOURCE_CLOSED' });
  assert.throws(() => old.set([lead]), { code: 'FEATURE_CLOSED' });
  assert.equal((await h.run({ expertId: 'team--lead' })).result.kind, 'error', '来源关闭时不能选它');
  team = await teamExtension(h.ctx, current => { const source = current.whalewing.experts.registerSource(current, { label: sourceLabel }); source.set([lead]); return source; });
  assert.equal(h.ctx.whalewingExperts.get('team--lead').name, '团队组长');
  // 来源还在但这位专家被移除：和“专家已删除”同一条路。
  team.source().set([]);
  assert.throws(() => h.ctx.whalewingExperts.get('team--lead'), { code: 'EXPERT_DELETED' });
});

// 2026-11-05 助手名称：扩展给小鲸起名后，专家列表、读取和会话里给模型的说明都用新名字；员工自己那份不变，扩展关掉就回来。
test('扩展给小鲸起名：列表和读取换成新名字，保存不把它记成员工改的，给模型的说明写明新叫法，扩展关掉后恢复', async t => {
  const h = await harness(t);
  const registry = h.ctx.whalewingExperts;
  const team = await teamExtension(h.ctx, current => current.whalewing.assistant.registerName(current, '小司助手'));
  assert.equal(registry.get('manager').name, '小司助手');
  assert.equal(registry.list().experts.find(expert => expert.id === 'manager').name, '小司助手', '模型工具读的列表也换了');
  const manager = (await registry.manage({ action: 'list' })).experts.find(expert => expert.id === 'manager');
  assert.equal(manager.name, '小司助手');
  assert.equal(registry.get('development').name, '研发专家', '别的专家不受影响');
  assert.equal(registry.store.get('manager').name, '小鲸助手', '存储里还是原来的名字');
  // 抽屉里名字只读、送来的是新名字；只改介绍，保存后存储里的名字不变，回执显示新名字。
  const { name: _name, description: _description, revision, ...rest } = manager;
  const saved = await registry.manage({ action: 'save', id: 'manager', expectedRevision: revision, expert: { name: '小司助手', description: '改过的介绍', avatar: rest.avatar, prompt: rest.prompt, model: rest.model, skills: rest.skills, mcpServers: rest.mcpServers } });
  assert.deepEqual([saved.expert.name, saved.expert.description], ['小司助手', '改过的介绍']);
  assert.equal(registry.store.get('manager').name, '小鲸助手');
  const context = () => h.adapter.requests.at(-1).messages.filter(message => message.source.kind === 'whalewing-expert').at(-1).content[0].text;
  assert.equal((await h.run({ expertId: 'manager' })).result.kind, 'success');
  await turn(h.ctx, h.agent);
  assert.match(context(), /本轮专家身份：小司助手。[^\n]*\n在这里你的名字是「小司助手」：下文和技能里说的“小鲸助手”“小鲸”都是你/);
  assert.equal((await h.run({ expertId: 'development' })).result.kind, 'success');
  await turn(h.ctx, h.agent);
  assert.match(context(), /本轮专家身份：研发专家。[^\n]*\n在这里助手叫「小司助手」/);
  // 扩展改名：下一轮重发带新名字的全文。
  team.source().set('小航助手');
  assert.equal(registry.get('manager').name, '小航助手');
  await turn(h.ctx, h.agent);
  assert.match(context(), /在这里助手叫「小航助手」/);
  // 扩展关掉：名字回到员工自己那份，员工改过的介绍还在；说明里不再提新叫法。
  await team.fiber.dispose();
  const restored = registry.get('manager');
  assert.deepEqual([restored.name, restored.description], ['小鲸助手', '改过的介绍']);
  await turn(h.ctx, h.agent);
  assert.doesNotMatch(context(), /在这里助手叫/);
});
