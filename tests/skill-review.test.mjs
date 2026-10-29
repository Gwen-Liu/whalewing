import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { allSkills } from './feature-fixture.mjs';
import { WhalewingSkillProvider } from '../src/skill-provider.js';
import { Vault } from '../src/vault.js';
import { SkillLibrary } from '../src/skills.js';
import { skillLibraryContract } from '../features/skills/contract.js';
import { apply as skillTool } from '../features/skills/tool.js';
import { seedBundledSkills } from './skill-seed.mjs';

const contract = skillLibraryContract(z);
const review = { reviewer: '测试夹具独立检查角色', positive: '适用输入与结果已经核对', negative: '无来源输入已阻断检查' };
const notePath = '40-知识/依据.md';
const noteText = (updated = '2026-10-08', body = '来源。') => `---\ntype: atomic\nstatus: seedling\ncreated: 2026-10-08\nupdated: ${updated}\naliases: []\n---\n# 依据\n${body}\n`;
const skillText = name => `---\nname: ${name}\ndescription: 有依据时执行有效方法并检查任务成果\n---\n读取来源并完成任务。\n`;
const signal = () => new AbortController().signal;

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-skill-review-'));
  t.after(() => fs.rm(directory, { force: true, recursive: true }));
  const vault = new Vault(path.join(directory, 'vault'));
  await vault.initialize();
  await seedBundledSkills(path.join(directory, 'skills'));
  const library = new SkillLibrary(vault, path.join(directory, 'skills'));
  const ctx = { logger: { warn() {} }, get: () => undefined, on() { return () => {}; } };
  const provider = new WhalewingSkillProvider(ctx, { signal: new AbortController().signal, invalidate() {} }, library, allSkills);
  t.after(() => provider.dispose());
  const note = await vault.write(notePath, noteText(), '');
  const name = 'whalewing-user-reviewed';
  const candidate = await library.stage({ name, content: skillText(name), sourcePaths: [notePath], sourceHashes: { [notePath]: note.hash }, expectedHash: '' });
  await library.publish({ name, expectedHash: candidate.hash, activeHash: '', review }, async () => {});
  const discovered = async () => { const observed = await provider.list({ cwd: vault.root, signal: signal() }); return Array.isArray(observed) ? observed : observed.candidates; };
  const listed = async () => (await discovered()).find(skill => skill.name === name);
  // 技能库按 DSH 实际发现的结果标“可用”；这里用本插件的发现器充当 DSH 目录。
  library.dependencies.snapshot = async () => ({ complete: true, skills: await Promise.all((await discovered()).map(async skill => ({ name: skill.name, path: await fs.realpath(skill.locator.path) }))) });
  const entry = async state => (await library.catalog()).entries.find(item => item.origin === 'evolution' && item.name === name && item.state === state);
  return { directory, vault, library, provider, name, listed, entry };
}

test('来源笔记只改了 updated，技能照常留在 DSH，列表标待复核且不改技能文件', async t => {
  const s = await setup(t);
  assert.ok(await s.listed());
  assert.equal((await s.entry('active')).review, undefined);
  const before = await s.library.files.read(s.library.location(s.name, 'active'));
  // 每晚整理只刷新 updated 属性。
  await s.vault.write(notePath, noteText('2026-10-09'), (await s.vault.read(notePath)).hash);
  const found = await s.listed();
  assert.ok(found, '来源变了不能撤出 DSH');
  assert.match((await s.provider.get(found, { signal: signal() })).content, /读取来源并完成任务/);
  assert.deepEqual((await s.library.list()).skills.find(skill => skill.state === 'active').review, { changed: [notePath], missing: [] });
  const entry = await s.entry('active');
  assert.deepEqual(entry.review, { changed: [notePath], missing: [] });
  assert.equal(entry.issue, undefined);
  assert.equal(entry.discovery, 'available');
  contract.result.parse({ entries: [entry], offset: 0, total: 1, truncated: false });
  contract.result.parse(await s.library.manage({ action: 'read', id: entry.id }));
  // 标记只在读取时算出，技能文件逐字节不变，旧版插件读到的数据与以前相同。
  assert.ok((await s.library.files.read(s.library.location(s.name, 'active'))).bytes.equals(before.bytes));
  // 专家仍能绑定它。
  assert.ok((await s.library.candidates()).skills.some(skill => skill.name === s.name));
});

test('来源笔记被删或改名时标 missing，技能仍可用', async t => {
  const s = await setup(t);
  await s.vault.remove(notePath, (await s.vault.read(notePath)).hash);
  assert.ok(await s.listed());
  assert.deepEqual((await s.entry('active')).review, { changed: [], missing: [notePath] });
});

test('知识库换了位置时标 otherVault，技能仍可用', async t => {
  const s = await setup(t);
  const other = new Vault(path.join(s.directory, 'other-vault'));
  await other.initialize();
  const switched = new SkillLibrary(other, s.library.root);
  const ctx = { logger: { warn() {} }, get: () => undefined, on() { return () => {}; } };
  const provider = new WhalewingSkillProvider(ctx, { signal: new AbortController().signal, invalidate() {} }, switched, allSkills);
  t.after(() => provider.dispose());
  const observed = await provider.list({ cwd: other.root, signal: signal() });
  assert.ok((Array.isArray(observed) ? observed : observed.candidates).some(skill => skill.name === s.name));
  const entry = (await switched.catalog()).entries.find(item => item.name === s.name);
  assert.deepEqual(entry.review, { changed: [], missing: [], otherVault: true });
  contract.result.parse({ entries: [entry], offset: 0, total: 1, truncated: false });
});

test('来源变了的停用技能也能恢复，恢复后标待复核；发布新候选仍要求来源一致', async t => {
  const s = await setup(t);
  const current = await s.library.read(s.name);
  await s.library.disable({ name: s.name, expectedHash: current.hash });
  await s.vault.write(notePath, noteText('2026-10-09', '已纠偏。'), (await s.vault.read(notePath)).hash);
  assert.deepEqual((await s.entry('disabled')).review, { changed: [notePath], missing: [] });
  await s.library.restore({ name: s.name, expectedHash: current.hash }, async () => {});
  assert.ok(await s.listed());
  assert.deepEqual((await s.entry('active')).review, { changed: [notePath], missing: [] });
  // 候选提炼后来源又变了，检查记录已不对应当前原文，必须重新提炼。
  const fresh = await s.vault.read(notePath);
  const candidate = await s.library.stage({ name: s.name, content: skillText(s.name).replace('完成任务', '完成并核对任务'), sourcePaths: [notePath], sourceHashes: { [notePath]: fresh.hash }, expectedHash: '' });
  await s.vault.write(notePath, noteText('2026-10-10', '已纠偏。'), fresh.hash);
  await assert.rejects(s.library.publish({ name: s.name, expectedHash: candidate.hash, activeHash: current.hash, review }, async () => {}), { code: 'SKILL_STALE' });
});

test('技能工具审批说的是技能操作和技能目录，不再套用知识工具的说法', async t => {
  const s = await setup(t);
  const tools = new Map(), requests = [];
  const ctx = {
    whalewing: { vault: s.vault, skills: s.library, execute: async () => assert.fail('拒绝后不得执行') },
    tools: { register: definition => tools.set(definition.name, definition) },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
    get: key => key === 'approval' ? { request: async input => { requests.push(input); return 'rejected'; } } : undefined,
  };
  skillTool(ctx);
  const tool = tools.get('whalewing_skill');
  await assert.rejects(tool.execute({ action: 'list' }, { signal: signal(), agent: { session: { id: 'fixture' } }, callId: 'call' }), /鲸翼个人技能操作/);
  assert.equal(requests.length, 1);
  assert.match(requests[0].displayReason.zh, /whalewing_skill\/list/);
  assert.ok(requests[0].displayReason.zh.includes(s.library.root));
  assert.doesNotMatch(requests[0].displayReason.zh, /登记的本机来源/);
  assert.equal(tool.presentCall({ action: 'list' }).kind, 'read');
  assert.equal(tool.presentCall({ action: 'publish' }).kind, 'other');
});
