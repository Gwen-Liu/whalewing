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

// 模拟上一版插件留下的库：清单版本不同，员工又改过首页。
async function previousVersion(setupResult) {
  const core = setupResult.open();
  await core.execute({ action: 'status' }, human);
  const edited = (await fs.readFile(setupResult.file(home), 'utf8')) + '\n员工自己补的入口。\n';
  await fs.writeFile(setupResult.file(home), edited);
  const manifest = JSON.parse(await fs.readFile(setupResult.file('.whalewing/bundle.json'), 'utf8'));
  await fs.writeFile(setupResult.file('.whalewing/bundle.json'), JSON.stringify({ ...manifest, version: 'previous' }));
  await core.dispose();
}

test('升级时保留的员工改动列在状态里，状态结果符合知识契约', async t => {
  const s = await setup(t);
  await previousVersion(s);
  const status = await s.open().execute({ action: 'status' }, human);
  assert.deepEqual(status.bundle, { kept: [home] });
  const parsed = contract.result.safeParse(status);
  assert.equal(parsed.success, true, parsed.error?.message);
});

test('重启后仍列出员工改过的随包文件；改回原样后不再列出', async t => {
  const s = await setup(t);
  await previousVersion(s);
  await s.open().execute({ action: 'status' }, human);
  const restarted = s.open();
  const status = await restarted.execute({ action: 'status' }, human);
  assert.deepEqual(status.bundle, { kept: [home] });
  contract.result.parse(status);
  const original = (await fs.readFile(s.file(home), 'utf8')).replace('\n员工自己补的入口。\n', '');
  await fs.writeFile(s.file(home), original);
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
  assert.deepEqual(status.bundle, { kept: [], issue: '文件被占用' });
  contract.result.parse(status);
});

test('状态里的版本号与插件包一致', async t => {
  const s = await setup(t);
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal((await s.open().execute({ action: 'status' }, human)).version, version);
});

test('契约拒收形状不对的随包状态', () => {
  const base = { version: '1', initialized: true, root: 'vault', skillsDir: 'skills', limits: {}, scheduleAvailable: false };
  assert.equal(contract.result.safeParse({ ...base, bundle: { kept: [home] } }).success, true);
  assert.equal(contract.result.safeParse({ ...base, bundle: { kept: 'home' } }).success, false);
  assert.equal(contract.result.safeParse({ ...base, bundle: { kept: [], extra: true } }).success, false);
});
