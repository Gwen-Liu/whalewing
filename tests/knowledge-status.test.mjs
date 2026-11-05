import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { WhalewingCore } from '../src/service.js';
import { knowledgeContract } from '../features/knowledge/contract.js';

const contract = knowledgeContract(z);
const human = { kind: 'human', agent: { session: { id: 'workbench' } } };
const home = '00-系统/知识库首页.md';

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-status-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const open = () => {
    const core = new WhalewingCore(path.join(directory, 'vault'), { skillsRoot: path.join(directory, 'skills'), readSession: async () => ({ session: {}, inheritedEventCount: 0, events: [] }), schedule: () => undefined });
    t.after(() => core.dispose());
    return core;
  };
  return { directory, open, file: name => path.join(directory, 'vault', ...name.split('/')) };
}

// 模拟上一版插件留下的库：清单版本不同；员工改过首页和一个模板，规则文件夹里还有一篇从别处带进来的旧规则。
const rule = '00-系统/规则/知识库规则.md', template = '00-系统/模板/日记模板.md', stray = '00-系统/规则/旧的使用说明.md';
async function previousVersion(setupResult) {
  const core = setupResult.open();
  await core.execute({ action: 'status' }, human);
  await fs.appendFile(setupResult.file(home), '\n员工自己补的入口。\n');
  await fs.appendFile(setupResult.file(template), '\n员工改的模板。\n');
  await fs.writeFile(setupResult.file(stray), '# 旧的使用说明\n');
  const manifest = JSON.parse(await fs.readFile(setupResult.file('.whalewing/bundle.json'), 'utf8'));
  await fs.writeFile(setupResult.file('.whalewing/bundle.json'), JSON.stringify({ ...manifest, version: 'previous' }));
  await core.dispose();
}

// 2026-11-02 用户定规则、模板这一层“只用新版”：升级换掉的写明另存在哪，首页改了照旧保留、不提示。
test('升级时换成新版的规则和模板列在状态里，写明原来的另存在哪；首页保留不提示', async t => {
  const s = await setup(t);
  await previousVersion(s);
  const status = await s.open().execute({ action: 'status' }, human);
  assert.deepEqual(status.bundle.edited, []);
  assert.deepEqual(status.bundle.replaced.files, [template, stray]);
  assert.match(status.bundle.replaced.folder, /^\.whalewing\/replaced\/\d{4}-\d{2}-\d{2}-\d{6}$/);
  assert.match(await fs.readFile(s.file(`${status.bundle.replaced.folder}/${template}`), 'utf8'), /员工改的模板/);
  assert.match(await fs.readFile(s.file(home), 'utf8'), /员工自己补的入口/);
  const parsed = contract.result.safeParse(status);
  assert.equal(parsed.success, true, parsed.error?.message);
});

test('重启后不再提示换过的；之后又改了规则就列出来，改回原样后不再列出', async t => {
  const s = await setup(t);
  await previousVersion(s);
  await s.open().execute({ action: 'status' }, human);
  const restarted = s.open();
  assert.equal(Object.hasOwn(await restarted.execute({ action: 'status' }, human), 'bundle'), false);
  const original = await fs.readFile(s.file(rule), 'utf8');
  await fs.writeFile(s.file(rule), original + '\n员工在规则里加的一句。\n');
  const status = await restarted.execute({ action: 'status' }, human);
  assert.deepEqual(status.bundle, { edited: [rule] });
  contract.result.parse(status);
  await fs.writeFile(s.file(rule), original);
  const clean = await restarted.execute({ action: 'status' }, human);
  assert.equal(Object.hasOwn(clean, 'bundle'), false);
  contract.result.parse(clean);
});

test('随包更新失败时状态带上原因，仍符合契约', async t => {
  const s = await setup(t);
  await previousVersion(s);
  const core = s.open();
  core.vault.upgrade = async () => { throw new Error('文件被占用'); };
  const status = await core.execute({ action: 'status' }, human);
  // 没换成新版的旧原文不能冒充员工改动。
  assert.deepEqual(status.bundle, { edited: [], issue: '文件被占用' });
  contract.result.parse(status);
});

test('状态里的版本号与插件包一致', async t => {
  const s = await setup(t);
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal((await s.open().execute({ action: 'status' }, human)).version, version);
});

test('契约拒收形状不对的随包状态', () => {
  const base = { version: '1', initialized: true, root: 'vault', skillsDir: 'skills', limits: {}, scheduleAvailable: false };
  assert.equal(contract.result.safeParse({ ...base, bundle: { edited: [home] } }).success, true);
  assert.equal(contract.result.safeParse({ ...base, bundle: { edited: [], replaced: { folder: '.whalewing/replaced/x', files: [home] } } }).success, true);
  assert.equal(contract.result.safeParse({ ...base, bundle: { edited: [], replaced: { folder: 'x', files: [] } } }).success, false);
  assert.equal(contract.result.safeParse({ ...base, bundle: { kept: [home] } }).success, false);
  assert.equal(contract.result.safeParse({ ...base, bundle: { edited: 'home' } }).success, false);
  assert.equal(contract.result.safeParse({ ...base, bundle: { edited: [], extra: true } }).success, false);
});
