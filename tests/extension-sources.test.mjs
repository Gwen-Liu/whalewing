import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { z } from 'zod';
import { mountFeatures } from './feature-fixture.mjs';
import { knowledgeContract } from '../features/knowledge/contract.js';
import { skillLibraryContract } from '../features/skills/contract.js';
import { sourceNotePath } from '../src/extension-sources.js';
import * as fixtureTeam from './fixtures/team-source/host.js';

const knowledge = knowledgeContract(z), skills = skillLibraryContract(z);
const note = (title, body = '') => `---\ntype: atomic\nstatus: seedling\ncreated: 2026-11-01\nupdated: 2026-11-01\naliases: []\n---\n# ${title}\n\n${body}\n`;
const label = { zh: '团队', en: 'Team' };

/** 只装知识和技能底座；技能注册表是记录调用的替身，列出的技能带真实路径。 */
async function harness(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-sources-'));
  const ctx = new Context();
  new TypertRegistry(ctx);
  const registry = { listed: [], calls: 0 };
  ctx.provide('commands', { register() {} }); ctx.provide('sessionProjections', { register() {} });
  ctx.provide('sessions', { create() {}, flush() { assert.fail('不应落盘会话'); } });
  ctx.provide('sessionQuery', {});
  ctx.provide('skills', {
    async list() { registry.calls++; return registry.listed; },
    async get(name) { registry.calls++; const skill = registry.listed.find(item => item.name === name); return skill && { ...skill, content: `正文：${name}` }; },
    async snapshot() { return { skills: [] }; },
  });
  const mounted = await mountFeatures(ctx, directory, { vaultRoot: path.join(directory, 'vault') }, false);
  t.after(async () => {
    await ctx.fiber.dispose();
    assert.ok(path.basename(directory).startsWith('whalewing-sources-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const manage = input => mounted.knowledge.manage(input);
  await manage({ action: 'status' });
  await manage({ action: 'write', path: '40-知识/个人.md', content: note('个人', '甲乙丙丁 个人的做法'), expectedHash: '' });
  return { ctx, directory, registry, ...mounted, manage, skillRequest: input => mounted.skillsHost.manageSkills(input) };
}

/** 测试扩展：登记功能后把作用域交出来，测试里直接用它调公开接口。 */
async function extension(ctx, { id = 'team', skills: roots = [], setup } = {}) {
  let scope;
  const fiber = await ctx.plugin({ inject: ['whalewing'], apply(current) {
    current.whalewing.features.register(current, { id, api: 1, package: `dsh-fixture-${id}`, ...(roots.length ? { skills: roots } : {}) });
    scope = current;
    setup?.(current);
  } });
  return { scope, fiber };
}

const teamNotes = { '规范/发布.md': note('发布', '甲乙丙丁 团队的发布规范') };
function teamSource(overrides = {}) {
  const calls = { search: 0, read: 0 };
  return { calls, options: {
    label,
    async search(query, { signal }) { calls.search++; signal.throwIfAborted(); const notes = Object.entries(teamNotes).filter(([, content]) => query.split(/\s+/).every(token => content.includes(token))).map(([file, content]) => ({ path: file, title: path.posix.basename(file, '.md'), excerpt: content.slice(0, 60), hash: 'h1' })); return { notes, total: notes.length, truncated: false }; },
    async read(file) { calls.read++; if (!teamNotes[file]) throw Object.assign(new Error('没有这篇'), { code: 'NOT_FOUND' }); return { path: file, content: teamNotes[file], hash: 'h1' }; },
    ...overrides,
  } };
}

test('来源笔记的本地路径只接受相对 .md 路径', () => {
  for (const value of ['a.md', '规范/发布.md', 'x/y/z.MD']) assert.equal(sourceNotePath(value), true, value);
  for (const value of ['', '/a.md', 'a/../b.md', './a.md', 'a\\b.md', 'C:/a.md', 'a.txt', 'a//b.md', `${'x'.repeat(231)}.md`]) assert.equal(sourceNotePath(value), false, value);
});

test('没有知识来源时搜索、阅读和问答的返回与个人知识完全相同', async t => {
  const h = await harness(t);
  const direct = await h.service.vault.search('甲乙丙丁');
  const result = await h.manage({ action: 'search', query: '甲乙丙丁' });
  assert.deepEqual(result, direct);
  for (const key of ['sourceIssues', 'sourceLabels']) assert.equal(Object.hasOwn(result, key), false, key);
  const read = await h.manage({ action: 'read', path: '40-知识/个人.md' });
  assert.deepEqual(Object.keys(read).sort(), ['content', 'hash', 'path', 'readOnly']);
  // 只登记功能、不登记知识来源的扩展也不改变搜索结果。
  await extension(h.ctx);
  assert.deepEqual(await h.manage({ action: 'search', query: '甲乙丙丁' }), direct);
});

test('知识来源一起搜索、只读阅读，扩展自己只碰个人知识', async t => {
  const h = await harness(t);
  const source = teamSource();
  const { scope } = await extension(h.ctx, { setup: current => current.whalewing.knowledge.registerSource(current, source.options) });
  const found = knowledge.result.parse(await h.manage({ action: 'search', query: '甲乙丙丁' }));
  assert.deepEqual(found.notes.map(item => item.path), ['40-知识/个人.md', '@team/规范/发布.md'], '个人结果在前');
  const team = found.notes[1];
  assert.deepEqual([team.readOnly, team.type, team.status, Object.hasOwn(team, 'source')], [true, 'source', '只读', false]);
  assert.deepEqual(found.sourceLabels, { team: label }, '来源名放在结果顶层，不和笔记属性撞名');
  assert.equal(found.total, 2); assert.equal(Object.hasOwn(found, 'sourceIssues'), false);
  // 空查询是列个人笔记，不去问来源。
  const before = source.calls.search;
  await h.manage({ action: 'search', query: '' });
  assert.equal(source.calls.search, before);
  const read = knowledge.result.parse(await h.manage({ action: 'read', path: '@team/规范/发布.md' }));
  assert.deepEqual([read.path, read.readOnly, read.source.label.zh], ['@team/规范/发布.md', true, '团队']);
  assert.equal(Object.hasOwn(read, 'absolutePath'), false, '本机路径只给问答用');
  const doc = knowledge.result.parse(await h.manage({ action: 'document', path: '@team/规范/发布.md' }));
  assert.deepEqual([doc.links, doc.backlinks, doc.totalBacklinks, doc.readOnly], [[], [], 0, true]);
  assert.equal(doc.view.type, 'root');
  for (const action of ['write', 'remove', 'restore']) await assert.rejects(h.manage({ action, path: '@team/规范/发布.md', expectedHash: 'h1', ...(action === 'write' ? { content: note('发布') } : {}) }), { code: 'EXTENSION_NOTE_READ_ONLY' });
  await assert.rejects(h.manage({ action: 'graph', path: '@team/规范/发布.md' }), { code: 'EXTENSION_NOTE_GRAPH' });
  await assert.rejects(h.manage({ action: 'read', path: '@team/没有.md' }), { code: 'NOT_FOUND' });
  await assert.rejects(h.manage({ action: 'read', path: '@team/../x.md' }), { code: 'PATH' });
  // 模型调用同样能搜到；扩展自己调用时只有个人知识，也读不了来源笔记。
  const model = await h.service.execute({ action: 'search', query: '甲乙丙丁' }, { kind: 'model', signal: new AbortController().signal });
  assert.equal(model.notes.length, 2);
  const own = await scope.whalewing.knowledge.search('甲乙丙丁');
  assert.deepEqual(own.notes.map(item => item.path), ['40-知识/个人.md']);
  await assert.rejects(scope.whalewing.knowledge.read('@team/规范/发布.md'), { code: 'EXTENSION_NOTE_PLUGIN' });
});

test('问答引用来源笔记要有本机文件；没有时说明原因', async t => {
  const h = await harness(t);
  const local = path.join(h.directory, 'team-cache', '发布.md');
  await fs.mkdir(path.dirname(local), { recursive: true }); await fs.writeFile(local, teamNotes['规范/发布.md']);
  let withFile = true;
  const source = teamSource({ async read(file) { return { path: file, content: teamNotes[file], hash: 'h1', ...(withFile ? { absolutePath: local } : {}) }; } });
  await extension(h.ctx, { setup: current => current.whalewing.knowledge.registerSource(current, source.options) });
  const prepared = knowledge.result.parse(await h.manage({ action: 'question', question: '发布规范是什么？', paths: ['40-知识/个人.md', '@team/规范/发布.md'] }));
  assert.equal(prepared.sources[1].absolutePath, local.replaceAll('\\', '/'));
  assert.match(prepared.prompt, /团队的发布规范/);
  withFile = false;
  await assert.rejects(h.manage({ action: 'question', question: '发布规范是什么？', paths: ['@team/规范/发布.md'] }), { code: 'EXTENSION_NOTE_LOCAL' });
});

test('一个来源出错只记说明；扩展关闭后撤销、迟到的搜索结果不采用、重开恢复', async t => {
  const h = await harness(t);
  const broken = await extension(h.ctx, { id: 'broken', setup: current => current.whalewing.knowledge.registerSource(current, { label: { zh: '坏来源', en: 'Broken' }, async search() { throw new Error('网络不通'); }, async read() { throw new Error('网络不通'); } }) });
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; }), asked = new Promise(resolve => { entered = resolve; });
  let slow = false;
  const source = teamSource({ async search(query, options) { if (slow) { entered(); await gate; } return teamSource().options.search(query, options); } });
  const team = await extension(h.ctx, { setup: current => current.whalewing.knowledge.registerSource(current, source.options) });
  const found = knowledge.result.parse(await h.manage({ action: 'search', query: '甲乙丙丁' }));
  assert.deepEqual(found.notes.map(item => item.path), ['40-知识/个人.md', '@team/规范/发布.md']);
  assert.deepEqual(found.sourceIssues, ['「坏来源」搜索失败：网络不通']);
  await broken.fiber.dispose();
  // 搜索等着来源时扩展被关掉：结果回来也不采用。
  slow = true;
  const pending = h.manage({ action: 'search', query: '甲乙丙丁' });
  await asked;
  await team.fiber.dispose();
  release();
  const late = await pending;
  assert.deepEqual(late.notes.map(item => item.path), ['40-知识/个人.md']);
  assert.deepEqual(late.sourceIssues, ['「团队」已关闭，它的搜索结果没有采用']);
  assert.deepEqual((await h.manage({ action: 'search', query: '甲乙丙丁' })).notes.map(item => item.path), ['40-知识/个人.md']);
  await assert.rejects(h.manage({ action: 'read', path: '@team/规范/发布.md' }), { code: 'EXTENSION_SOURCE_CLOSED' });
  slow = false;
  await extension(h.ctx, { setup: current => current.whalewing.knowledge.registerSource(current, source.options) });
  assert.equal((await h.manage({ action: 'read', path: '@team/规范/发布.md' })).content, teamNotes['规范/发布.md']);
});

test('来源登记要先登记功能、一个功能只登记一次，字段按严格规则校验', async t => {
  const h = await harness(t);
  let bare;
  await h.ctx.plugin({ inject: ['whalewing'], apply(current) { bare = current; } });
  assert.throws(() => bare.whalewing.knowledge.registerSource(bare, teamSource().options), { code: 'FEATURE_CALLER', message: /登记知识来源/ });
  assert.throws(() => bare.whalewing.experts.registerSource(bare, { label }), { code: 'FEATURE_CALLER', message: /登记专家来源/ });
  const { scope } = await extension(h.ctx);
  for (const options of [{}, { label: { zh: '团队' }, search() {}, read() {} }, { ...teamSource().options, extra: true }, { label, search: 'x', read() {} }]) assert.throws(() => scope.whalewing.knowledge.registerSource(scope, options), { code: 'EXTENSION_SOURCE_INPUT' });
  scope.whalewing.knowledge.registerSource(scope, teamSource().options);
  assert.throws(() => scope.whalewing.knowledge.registerSource(scope, teamSource().options), { code: 'EXTENSION_SOURCE_CONFLICT' });
  const experts = scope.whalewing.experts.registerSource(scope, { label });
  const item = { id: 'lead', revision: 1, name: '组长', description: '带团队', prompt: '按团队规范做事' };
  for (const items of [[item, item], [{ ...item, id: 'Lead' }], [{ ...item, id: 'x'.repeat(76) }], [{ ...item, avatar: 'https://example.com/a.png' }], [{ ...item, model: null }], [{ ...item, name: '' }]]) assert.throws(() => experts.set(items), { code: 'EXTENSION_SOURCE_INPUT' });
  experts.set([item]);
  assert.throws(() => scope.whalewing.experts.registerSource(scope, { label }), { code: 'EXTENSION_SOURCE_CONFLICT' });
  experts.dispose();
  assert.throws(() => experts.set([item]), { code: 'FEATURE_CLOSED' });
  // 撤销后同一功能可以重新登记。
  scope.whalewing.experts.registerSource(scope, { label }).set([item]);
});

test('技能库“扩展”一组只列扩展技能目录里实际发现的技能；没有这样的扩展时不读注册表', async t => {
  const h = await harness(t);
  const root = path.join(h.directory, 'team-skills');
  h.registry.listed = [
    { name: 'team-release', description: '团队发布流程', path: path.join(root, 'team-release', 'SKILL.md') },
    { name: 'personal', description: '别处的技能', path: path.join(h.directory, 'other', 'personal', 'SKILL.md') },
  ];
  const empty = skills.result.parse(await h.skillRequest({ action: 'extensions' }));
  assert.deepEqual(empty, { extensions: [] });
  // 只登记功能、不带技能目录的扩展也不读注册表。
  await extension(h.ctx, { id: 'plain' });
  assert.deepEqual(await h.skillRequest({ action: 'extensions' }), { extensions: [] });
  assert.equal(h.registry.calls, 0);
  const team = await extension(h.ctx, { skills: [root], setup: current => current.whalewing.knowledge.registerSource(current, teamSource().options) });
  const listed = skills.result.parse(await h.skillRequest({ action: 'extensions' }));
  assert.deepEqual(listed, { extensions: [{ id: 'team', package: 'dsh-fixture-team', label, skills: [{ name: 'team-release', description: '团队发布流程' }] }] });
  const read = skills.result.parse(await h.skillRequest({ action: 'extension_read', feature: 'team', name: 'team-release' }));
  assert.deepEqual(read.extension, { id: 'team', package: 'dsh-fixture-team', label, name: 'team-release', description: '团队发布流程', content: '正文：team-release' });
  await assert.rejects(h.skillRequest({ action: 'extension_read', feature: 'team', name: 'personal' }), { code: 'SKILL_MISSING' });
  await team.fiber.dispose();
  await assert.rejects(h.skillRequest({ action: 'extension_read', feature: 'team', name: 'team-release' }), { code: 'SKILL_SOURCE_CLOSED' });
  assert.deepEqual(await h.skillRequest({ action: 'extensions' }), { extensions: [] });
  // 没登记来源的扩展按包名显示（label 省略）。
  await extension(h.ctx, { id: 'kit', skills: [root] });
  assert.deepEqual((await h.skillRequest({ action: 'extensions' })).extensions.map(item => [item.id, item.label]), [['kit', undefined]]);
});

// 企业版功能测试发现：扩展登记的目录写成短文件名或经过联接时，和 DSH 注册表报的真实路径对不上，技能库“扩展”一组是空的。
test('扩展登记的技能目录经过联接时，“扩展”一组照样列出、能读（两边按真实路径比较）', async t => {
  const h = await harness(t);
  const real = path.join(h.directory, 'real-skills'), linked = path.join(h.directory, 'linked-skills');
  await fs.mkdir(path.join(real, 'team-release'), { recursive: true });
  await fs.writeFile(path.join(real, 'team-release', 'SKILL.md'), '---\nname: team-release\ndescription: 团队发布流程\n---\n先测试再发布。\n');
  await fs.symlink(real, linked, 'junction');
  try {
    // DSH 的注册表报的是真实路径；扩展登记的是联接那一种写法。
    h.registry.listed = [{ name: 'team-release', description: '团队发布流程', path: await fs.realpath(path.join(real, 'team-release', 'SKILL.md')) }];
    await extension(h.ctx, { skills: [linked] });
    const listed = skills.result.parse(await h.skillRequest({ action: 'extensions' }));
    assert.deepEqual(listed.extensions[0].skills, [{ name: 'team-release', description: '团队发布流程' }]);
    const read = skills.result.parse(await h.skillRequest({ action: 'extension_read', feature: 'team', name: 'team-release' }));
    assert.equal(read.extension.name, 'team-release');
  } finally {
    // 先只删联接本身，免得清理临时目录时顺着联接删到目标里。
    await fs.unlink(linked).catch(() => fs.rmdir(linked));
  }
});

test('走查用的测试扩展按公开接口登记团队专家、团队知识和团队技能', async t => {
  const h = await harness(t);
  await h.ctx.plugin(fixtureTeam);
  const found = await h.manage({ action: 'search', query: '回滚办法' });
  assert.deepEqual(found.notes.map(item => item.path), ['@team/规范/发布规范.md']);
  const doc = knowledge.result.parse(await h.manage({ action: 'document', path: found.notes[0].path }));
  assert.match(doc.content, /完整回归/);
  assert.deepEqual(h.service.sources.expertList().map(expert => [expert.id, expert.readOnly]), [['team--lead', false], ['team--guide', true]]);
  assert.deepEqual(h.service.registry.entries.get('team').skills, [path.join(fileURLToPath(new URL('./fixtures/team-source/', import.meta.url)), 'skills')]);
});

// 2026-11-01 功能测试发现：个人笔记的搜索结果带着笔记属性，知识库常用的 source 属性曾和来源标记撞名，知识页整页报错。
test('个人笔记属性里有 source 时，有没有知识来源搜索结果都照常', async t => {
  const h = await harness(t);
  const content = '---\ntype: atomic\nstatus: seedling\ncreated: 2026-11-01\nupdated: 2026-11-01\naliases: []\nsource:\n  - "[[40-知识/个人]]"\n---\n# 带来源属性\n\n甲乙丙丁 引用了别的笔记\n';
  await h.manage({ action: 'write', path: '40-知识/带来源属性.md', content, expectedHash: '' });
  const alone = knowledge.result.parse(await h.manage({ action: 'search', query: '甲乙丙丁' }));
  assert.deepEqual(alone.notes.map(item => item.path).sort(), ['40-知识/个人.md', '40-知识/带来源属性.md']);
  await extension(h.ctx, { setup: current => current.whalewing.knowledge.registerSource(current, teamSource().options) });
  const merged = knowledge.result.parse(await h.manage({ action: 'search', query: '甲乙丙丁' }));
  assert.deepEqual(merged.notes.map(item => item.path).slice(-1), ['@team/规范/发布.md']);
  assert.deepEqual(merged.sourceLabels, { team: label });
});
