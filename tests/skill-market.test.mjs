import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { z } from 'zod';
import { Vault } from '../src/vault.js';
import { SkillLibrary, unpackUpload, sourceFile } from '../src/skills.js';
import { SkillMarket, parseHome, marketOrigin } from '../src/skill-market.js';
import { skillLibraryContract } from '../features/skills/contract.js';
import { seedBundledSkills } from './skill-seed.mjs';

const text = (name, body = '读取输入，执行任务并检查结果。') => `---\nname: ${name}\ndescription: 任务需要时执行本方法并核对输入和结果\n---\n${body}\n`;

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-market-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const skills = path.join(root, 'dsh', 'skills');
  await seedBundledSkills(skills);
  return { root, skills, library: new SkillLibrary(new Vault(path.join(root, 'vault')), skills) };
}

/** 假的 skills.sh：按路径回答，记下问了哪些地址。 */
function fakeSite(routes) {
  const asked = [];
  const fetch = async (url, options) => {
    asked.push(url);
    options.signal.throwIfAborted();
    const route = routes[url.slice(marketOrigin.length)];
    if (!route) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    const value = typeof route === 'function' ? route() : route;
    return { ok: true, status: 200, json: async () => value, text: async () => String(value) };
  };
  return { fetch, asked };
}

test('上传：压缩包外面套一层文件夹也认，系统垃圾文件不要，装成个人技能；单个 SKILL.md 也行', async t => {
  const { library, skills } = await setup(t);
  const zip = zipSync({ 'report-helper/SKILL.md': strToU8(text('report-helper')), 'report-helper/scripts/run.py': strToU8('print(1)\n'), '__MACOSX/report-helper/._SKILL.md': strToU8('x'), 'report-helper/.DS_Store': strToU8('x') });
  const files = unpackUpload(Buffer.from(zip));
  assert.deepEqual(files.map(file => file.path).sort(), ['SKILL.md', 'scripts/run.py']);
  const { entry } = await library.importBundle(files, null, new AbortController().signal);
  assert.equal(entry.id, 'report-helper/SKILL.md'); assert.equal(entry.origin, 'user'); assert.equal(entry.source, undefined);
  assert.equal(await fs.readFile(path.join(skills, 'report-helper', 'scripts', 'run.py'), 'utf8'), 'print(1)\n');
  const single = await library.importBundle(unpackUpload(Buffer.from(text('single-note'))), null);
  assert.equal(single.entry.id, 'single-note/SKILL.md');
});

test('上传：同名不覆盖，格式不对说清原因，什么都不写', async t => {
  const { library, skills } = await setup(t);
  await library.importBundle(unpackUpload(Buffer.from(text('dup-skill', '第一份'))), null);
  await assert.rejects(library.importBundle(unpackUpload(Buffer.from(text('dup-skill', '第二份'))), null), { code: 'SKILL_EXISTS', message: /已经有叫「dup-skill」的技能了/ });
  assert.match(await fs.readFile(path.join(skills, 'dup-skill', 'SKILL.md'), 'utf8'), /第一份/);
  // 和随包系统技能同名也不装。
  await assert.rejects(library.importBundle(unpackUpload(Buffer.from(text('grilling'))), null), { code: 'SKILL_EXISTS' });
  await assert.rejects(library.importBundle(unpackUpload(Buffer.from(zipSync({ 'a/b/README.md': strToU8('x') }))), null), { code: 'SKILL_FORMAT', message: /最上层要有一个 SKILL\.md/ });
  await assert.rejects(library.importBundle(unpackUpload(Buffer.from(text('Bad Name'))), null), { code: 'SKILL_FORMAT' });
  assert.throws(() => unpackUpload(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])), { code: 'SKILL_FORMAT', message: /压缩包打不开/ });
  await assert.rejects(library.importBundle([{ path: 'SKILL.md', bytes: Buffer.from(text('escape')) }, { path: '../evil.md', bytes: Buffer.from('x') }], null), { code: 'PATH' });
  await assert.rejects(fs.stat(path.join(skills, 'escape')), { code: 'ENOENT' });
});

test('skills.sh 首页排行：读出官方标记和安装量，按安装量排；读不出时说明可以直接搜', async t => {
  const home = 'x self.__next_f.push([1,"{\\"source\\":\\"anthropics/skills\\",\\"skillId\\":\\"pdf\\",\\"name\\":\\"pdf\\",\\"installs\\":225361,\\"weeklyInstalls\\":[1,2],\\"isOfficial\\":true},{\\"source\\":\\"someone/repo\\",\\"skillId\\":\\"grill-me\\",\\"name\\":\\"grill-me\\",\\"installs\\":1519064}"])';
  assert.deepEqual(parseHome(home), [
    { id: 'someone/repo/grill-me', source: 'someone/repo', name: 'grill-me', installs: 1519064 },
    { id: 'anthropics/skills/pdf', source: 'anthropics/skills', name: 'pdf', installs: 225361, official: true },
  ]);
  let now = 0;
  const site = fakeSite({ '/': () => home });
  const market = new SkillMarket(null, { fetch: site.fetch, now: () => now });
  const signal = new AbortController().signal;
  const first = await market.home(false, signal);
  assert.deepEqual(first.official.map(item => item.id), ['anthropics/skills/pdf']); assert.equal(first.popular.length, 2);
  await market.home(false, signal); assert.equal(site.asked.length, 1, '十分钟内复用');
  now = 601000; await market.home(false, signal); assert.equal(site.asked.length, 2);
  await market.home(true, signal); assert.equal(site.asked.length, 3, '刷新时重读');
  const broken = new SkillMarket(null, { fetch: fakeSite({ '/': '<html>改版了</html>' }).fetch });
  assert.match((await broken.home(false, signal)).issue, /可以直接搜索/);
});

test('skills.sh 搜索：少于两个字不问，结果按格式过滤；连不上、太频繁都说清楚', async t => {
  const site = fakeSite({ '/api/search?q=pdf&limit=60': { skills: [{ source: 'anthropics/skills', skillId: 'pdf', name: 'pdf', installs: 5 }, { source: '../evil', skillId: 'x', name: 'x', installs: 1 }] } });
  const market = new SkillMarket(null, { fetch: site.fetch });
  const signal = new AbortController().signal;
  assert.deepEqual(await market.search('p', signal), { skills: [] }); assert.equal(site.asked.length, 0);
  assert.deepEqual((await market.search('pdf', signal)).skills.map(item => item.id), ['anthropics/skills/pdf']);
  const down = new SkillMarket(null, { fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(down.search('pdf', signal), { code: 'MARKET_NETWORK', message: /连不上 skills\.sh/ });
  const busy = new SkillMarket(null, { fetch: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(busy.search('pdf', signal), { code: 'MARKET_BUSY' });
});

test('skills.sh 预览和安装：只装预览过的那一份，记下来源；作者刚更新就停下请重新看', async t => {
  const { library, skills } = await setup(t);
  let version = 'aaaaaaaaaaaaaaaa1';
  const files = () => ({ hash: version, files: [{ path: 'SKILL.md', contents: text('pdf-tools') }, { path: 'scripts/fill.py', contents: 'print(2)\n' }] });
  const site = fakeSite({ '/api/download/anthropics/skills/pdf-tools': files });
  const market = new SkillMarket(library, { fetch: site.fetch });
  const signal = new AbortController().signal;
  const { preview } = await market.preview('anthropics/skills/pdf-tools', signal);
  assert.equal(preview.name, 'pdf-tools'); assert.deepEqual(preview.scripts, ['scripts/fill.py']); assert.equal(preview.files.length, 2);
  skillLibraryContract(z).result.parse({ preview });
  version = 'bbbbbbbbbbbbbbbb2';
  await assert.rejects(market.install('anthropics/skills/pdf-tools', 'cccccccccccccccc3', signal), { code: 'MARKET_CHANGED' });
  await assert.rejects(fs.stat(path.join(skills, 'pdf-tools')), { code: 'ENOENT' });
  const { entry } = await market.install('anthropics/skills/pdf-tools', preview.hash, signal);
  assert.equal(entry.origin, 'user'); assert.deepEqual(entry.source, { kind: 'skills.sh', id: 'anthropics/skills/pdf-tools' });
  const record = JSON.parse(await fs.readFile(path.join(skills, 'pdf-tools', sourceFile), 'utf8'));
  assert.equal(record.hash, 'aaaaaaaaaaaaaaaa1', '装的是预览时那一份');
  assert.equal(await fs.readFile(path.join(skills, 'pdf-tools', 'scripts', 'fill.py'), 'utf8'), 'print(2)\n');
  skillLibraryContract(z).result.parse({ entry: { ...entry } });
  await assert.rejects(market.preview('not a valid id', signal), { code: 'MARKET_ID' });
});
