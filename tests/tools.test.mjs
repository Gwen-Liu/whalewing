import { apply as knowledgeTool } from '../features/knowledge/tool.js';
import { apply as skillTool } from '../features/skills/tool.js';
import { apply as expertTool } from '../features/experts/tool.js';
import { apply as newsTool } from '../features/cards/tool.js';
import { allSkills } from './feature-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WhalewingSkillProvider } from '../src/skill-provider.js';
import { Vault } from '../src/vault.js';
import { SkillLibrary } from '../src/skills.js';
import { seedBundledSkills } from './skill-seed.mjs';

// 随包技能 = 鲸翼自写的 whalewing-* 加上来源清单里收录的开源技能。
const bundledSkills = [...['whalewing-check', 'whalewing-clarify', 'whalewing-code-review', 'whalewing-coding', 'whalewing-data-analysis', 'whalewing-debugging', 'whalewing-frontend-design', 'whalewing-knowledge', 'whalewing-news', 'whalewing-plugin-management', 'whalewing-research', 'whalewing-skill-evolution', 'whalewing-slides', 'whalewing-toolbox', 'whalewing-ui-review', 'whalewing-visual', 'whalewing-web-testing', 'whalewing-writing'], ...JSON.parse(await fs.readFile(new URL('../scripts/skill-sources.json', import.meta.url), 'utf8')).map(item => item.name)].sort();

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-tools-'));
  t.after(() => fs.rm(directory, { force: true, recursive: true }));
  const vault = new Vault(path.join(directory, 'vault'));
  await vault.initialize();
  await seedBundledSkills(path.join(directory, 'skills'));
  const library = new SkillLibrary(vault, path.join(directory, 'skills'));
  const lifecycle = new AbortController();
  const ctx = { logger: { warn() {} }, get: () => undefined, on() { return () => {}; } };
  const provider = new WhalewingSkillProvider(ctx, { signal: lifecycle.signal, invalidate() {} }, library, allSkills);
  t.after(() => provider.dispose());
  return { vault, library, provider, ctx, lifecycle };
}

test('真实宿主defineTool接受全部schema，原生审批拒绝不会执行数据动作', async t => {
  const { vault, library, ctx, lifecycle } = await setup(t);
  const tools = new Map();
  const cleanups = [];
  const calls = [];
  let approvalCount = 0;
  Object.assign(ctx, {
    whalewing: { vault, skills: library, executeNews: async (args, caller) => ({ action: args.action, sessionId: caller.agent?.session.id }), execute: async (...args) => { calls.push(args); return { ok: true }; } },
    whalewingExperts: { list: () => ({ experts: [{ id: 'manager', name: '小鲸助手', description: '统一助手', avatar: '不应送入工具结果' }], deleted: [] }), get: id => ({ id, name: '小鲸助手', prompt: '配置正文', avatar: '不应送入工具结果', model: null, skills: [], mcpServers: [] }), manage() { throw new Error('模型不得写配置'); } },
    skills: { registerProvider: factory => factory({ signal: lifecycle.signal, invalidate() {} }) },
    tools: { register: definition => tools.set(definition.name, definition) },
    on() {}, effect(fn) { cleanups.push(fn()); },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
    get: key => key === 'approval' ? { request: async () => { approvalCount++; return 'rejected'; } } : undefined,
    // 会话上记的定时任务用途：每日记忆 knowledge、每周思考 thinking、自建 custom、扩展 extension，员工自己的会话没有。
    sessionProjections: { stateOf: (session, key) => key === 'whalewingAutomation' ? { purpose: { daily: 'knowledge', weekly: 'thinking', custom: 'custom', extension: 'extension' }[session.id] ?? null } : undefined },
  });
  ctx.whalewingCards = { executeNews: ctx.whalewing.executeNews };
  expertTool(ctx); newsTool(ctx); knowledgeTool(ctx); skillTool(ctx);
  t.after(async () => { for (const cleanup of cleanups) await cleanup(); });
  assert.deepEqual([...tools.keys()], ['whalewing_experts', 'whalewing_news', 'whalewing_knowledge', 'whalewing_skill']);
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'fixture' } }, callId: 'fixture-call' };
  // 只读的动作不审批（2026-11-08 用户定）；写入、删除、恢复、提交覆盖每次都要批。
  const reads = ['status', 'search', 'read', 'document', 'graph', 'validate', 'sources', 'coverage', 'source_read'];
  for (const action of reads) await tools.get('whalewing_knowledge').execute({ action }, exec);
  assert.equal(approvalCount, 0);
  assert.equal(calls.length, reads.length);
  for (const action of ['write', 'remove', 'restore', 'complete']) await assert.rejects(tools.get('whalewing_knowledge').execute({ action, path: '40-知识/a.md' }, exec), /rejected/);
  assert.equal(approvalCount, 4);
  assert.equal(calls.length, reads.length, '没批准的写入不执行');
  assert.deepEqual(['search', 'write', 'complete'].map(action => tools.get('whalewing_knowledge').presentCall({ action }).kind), ['read', 'other', 'other']);
  for (const action of ['list', 'read']) await tools.get('whalewing_skill').execute({ action }, exec);
  assert.equal(approvalCount, 4, '查看技能不审批');
  await assert.rejects(tools.get('whalewing_skill').execute({ action: 'stage' }, exec), /rejected/);
  assert.equal(approvalCount, 5);
  const before = calls.length;
  assert.deepEqual(JSON.parse(await tools.get('whalewing_news').execute({ action: 'fields' }, exec)), { action: 'fields', sessionId: 'fixture' });
  assert.equal(calls.length, before, '资讯不得经过知识执行入口');
  const list = JSON.parse(await tools.get('whalewing_experts').execute({ action: 'list' }, exec));
  assert.deepEqual(list.experts, [{ id: 'manager', name: '小鲸助手', description: '统一助手', from: '员工的' }]);
  assert.deepEqual(JSON.parse(await tools.get('whalewing_experts').execute({ action: 'list', query: '统一' }, exec)).experts.map(item => item.id), ['manager']);
  assert.deepEqual(JSON.parse(await tools.get('whalewing_experts').execute({ action: 'list', query: '没有这个词' }, exec)).experts, []);
  const detail = JSON.parse(await tools.get('whalewing_experts').execute({ action: 'get', id: 'manager' }, exec));
  assert.equal(detail.prompt, '配置正文');
  assert.equal(Object.hasOwn(detail, 'avatar'), false);
  await assert.rejects(tools.get('whalewing_experts').execute({ action: 'save' }, exec), { code: 'INVALID_ARGS' });
  await assert.rejects(tools.get('whalewing_experts').execute({ action: 'get' }, exec), { code: 'INPUT' });
  await assert.rejects(tools.get('whalewing_experts').execute({ action: 'list', prompt: '写入企图' }, exec), { code: 'INPUT' });
  assert.equal(approvalCount, 5);
  // 每日记忆、每周思考到点运行时没人批（2026-11-11 用户选 A）：这两个任务自己的会话里写笔记、交回进度不审批；删除、恢复照样要批。
  const knowledge = tools.get('whalewing_knowledge');
  for (const id of ['daily', 'weekly']) {
    const routine = { ...exec, agent: { session: { id } } };
    for (const action of ['write', 'complete']) await knowledge.execute({ action, path: '60-时间线/日记/2026/2026-11-11.md' }, routine);
    for (const action of ['remove', 'restore']) await assert.rejects(knowledge.execute({ action, path: '40-知识/a.md' }, routine), /rejected/);
  }
  assert.equal(approvalCount, 9, '内置任务里只有删除、恢复弹审批');
  assert.deepEqual(calls.slice(-4).map(([args, caller]) => [args.action, caller.agent.session.id]), [['write', 'daily'], ['complete', 'daily'], ['write', 'weekly'], ['complete', 'weekly']]);
  // 自建任务、扩展任务和员工自己的会话里，写入照旧要批。
  for (const id of ['custom', 'extension', 'fixture']) await assert.rejects(knowledge.execute({ action: 'write', path: '40-知识/a.md' }, { ...exec, agent: { session: { id } } }), /rejected/);
  assert.equal(approvalCount, 12);
  assert.equal(calls.length, before + 4, '没批准的写入不执行');
});

test('官方filesystem发现器隔离坏个人Skill，基础Skills持续可用；卸载关闭watcher', async t => {
  const { vault, library, provider } = await setup(t);
  const name = 'whalewing-user-malformed';
  await library.files.atomic(library.location(name, 'active'), `---\nname: ${name}\ndescription: 测试损坏来源不会冲掉基础技能目录\nmetadata:\n  whalewingSources: [null]\n---\n损坏测试。\n`);
  const observed = await provider.list({ cwd: vault.root, signal: new AbortController().signal });
  const candidates = Array.isArray(observed) ? observed : observed.candidates;
  assert.deepEqual(candidates.map(s => s.name).sort(), bundledSkills);
  const knowledge = await provider.get(candidates.find(s => s.name === 'whalewing-knowledge'), { signal: new AbortController().signal });
  assert.match(knowledge.content, /个人知识：员工的第二大脑/);
  await provider.dispose();
});

test('已缓存发现后来源外改，get照常提供正文，来源变化只在技能库标待复核', async t => {
  const { vault, library, provider } = await setup(t);
  const notePath = '40-知识/依据.md';
  const content = '---\ntype: atomic\nstatus: seedling\ncreated: 2026-10-08\nupdated: 2026-10-08\naliases: []\n---\n# 依据\n来源。\n';
  const note = await vault.write(notePath, content, '');
  const name = 'whalewing-user-valid';
  const candidate = await library.stage({ name, content: `---\nname: ${name}\ndescription: 有依据时执行有效方法并检查任务成果\n---\n读取来源并完成任务。\n`, sourcePaths: [notePath], sourceHashes: { [notePath]: note.hash }, expectedHash: '' });
  await library.publish({ name, expectedHash: candidate.hash, activeHash: '', review: { reviewer: '测试夹具独立检查角色', positive: '适用输入与结果已经核对', negative: '无来源输入已阻断检查' } }, async () => {});
  const observed = await provider.list({ cwd: vault.root, signal: new AbortController().signal });
  const found = (Array.isArray(observed) ? observed : observed.candidates).find(s => s.name === name);
  assert.ok(found);
  await fs.writeFile(await vault.resolve(notePath), content.replace('来源。', '已纠偏。'));
  assert.match((await provider.get(found, { signal: new AbortController().signal })).content, /读取来源并完成任务/);
  assert.deepEqual((await library.list()).skills.find(s => s.name === name).review, { changed: [notePath], missing: [] });
});
