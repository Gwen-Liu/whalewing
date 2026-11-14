import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { z } from 'zod';
import { Vault } from '../src/vault.js';
import { SkillLibrary } from '../src/skills.js';
import { WhalewingSkillProvider } from '../src/skill-provider.js';
import { readPack, planServer, composePackServer, filesFromZip, packArea } from '../src/plugin-packs.js';
import { PackMarket, resolveSource, githubRepo, builtinMarkets } from '../src/pack-market.js';
import { McpServers } from '../src/mcp-servers.js';
import { skillLibraryContract } from '../features/skills/contract.js';
import { seedBundledSkills } from './skill-seed.mjs';

const contract = skillLibraryContract(z);
const file = (name, text) => ({ path: name, bytes: Buffer.from(text) });
const skill = (name, description = `${name} 的说明`) => `---\nname: ${name}\ndescription: ${description}\n---\n\n${name} 的做法。\n`;
/** 一个照 Claude 插件包格式写的包：两项技能（一项缺说明）、几种 MCP、一些 DSH 用不上的命令和钩子。 */
function samplePack(name = 'sample-pack') {
  return [
    file('.claude-plugin/plugin.json', JSON.stringify({ name, version: '1.2.0', description: '示例包', author: { name: '作者' }, homepage: 'https://example.com/pack', userConfig: { mapKey: { type: 'string', title: '地图 Key', description: '去开放平台申请', sensitive: true } } })),
    file('skills/route-plan/SKILL.md', skill('route-plan')),
    file('skills/route-plan/reference.md', '参考资料'),
    file('skills/broken/SKILL.md', '---\nname: broken\n---\n正文\n'),
    file('commands/hello.md', '# hello'),
    file('agents/helper.md', '# helper'),
    file('hooks/hooks.json', '{}'),
    file('server.mjs', 'console.log(1)'),
    file('.mcp.json', JSON.stringify({ mcpServers: {
      map: { type: 'http', url: 'https://maps.example.com/mcp?key=${user_config.mapKey}' },
      search: { type: 'http', url: 'https://search.example.com/mcp', headers: { Authorization: 'Bearer ${SEARCH_TOKEN}', 'X-Region': '${REGION:-cn}' } },
      local: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server.mjs'], env: { DATA_DIR: '${CLAUDE_PLUGIN_DATA}', MODE: 'fast' } },
      own: { type: 'http', url: '' },
      slack: { type: 'http', url: 'https://mcp.slack.com/mcp', oauth: { clientId: 'x' } },
      old: { type: 'sse', url: 'https://old.example.com/sse' },
      open: { type: 'http', url: 'https://mcp.notion.com/mcp' },
    } })),
  ];
}

test('读插件包：技能、MCP 和 DSH 用不上的部分；坏技能写原因不挡整个包', () => {
  const pack = readPack(samplePack(), { rootFor: name => path.join('C:', 'packs', name) });
  assert.equal(pack.name, 'sample-pack'); assert.equal(pack.version, '1.2.0'); assert.equal(pack.author, '作者'); assert.equal(pack.homepage, 'https://example.com/pack');
  assert.deepEqual(pack.skills.map(item => [item.name, item.dir]), [['route-plan', 'skills/route-plan']]);
  assert.deepEqual(pack.issues, ['技能「broken」没装：SKILL.md 缺少说明（description）']);
  assert.deepEqual(pack.skipped, { commands: 1, agents: 1, hooks: true, lsp: false });
  const plans = Object.fromEntries(pack.mcp.map(plan => [plan.key, plan]));
  assert.deepEqual(plans.map.fields, [{ id: 'user_config.mapKey', label: '地图 Key', secret: true, required: true, help: '去开放平台申请' }]);
  assert.deepEqual(plans.search.fields.map(field => [field.id, field.secret, field.required, field.fallback]), [['SEARCH_TOKEN', true, true, undefined], ['REGION', false, false, 'cn']]);
  assert.equal(plans.local.args[0], `${path.join('C:', 'packs', 'sample-pack')}/server.mjs`, '包所在的文件夹换进去');
  assert.equal(plans.local.env.find(row => row.name === 'DATA_DIR').value, path.join('C:', 'packs', 'sample-pack', '.data'));
  assert.deepEqual(plans.own.fields.map(field => field.id), ['__url']);
  assert.match(plans.slack.blocked, /OAuth/); assert.match(plans.old.blocked, /SSE/);
  assert.match(plans.open.hint, /浏览器里授权/); assert.equal(plans.open.blocked, undefined);
  assert.equal(pack.hash, readPack([...samplePack()].reverse(), { rootFor: name => path.join('C:', 'packs', name) }).hash, '文件顺序不影响指纹');
});

test('读插件包：不是插件包、名字不合规、包里两项技能同名都说清楚', () => {
  assert.throws(() => readPack([file('SKILL.md', skill('x'))]), { code: 'PACK_FORMAT' });
  assert.throws(() => readPack([file('.claude-plugin/plugin.json', '{"name":"Bad Name"}')]), { code: 'PACK_NAME' });
  assert.throws(() => readPack([file('.claude-plugin/plugin.json', '{"name":"dup"}'), file('skills/a/SKILL.md', skill('same')), file('skills/b/SKILL.md', skill('same'))]), { code: 'PACK_SKILL' });
  assert.throws(() => readPack([file('.claude-plugin/plugin.json', '{"name":"bad-file"}'), file('skills/a:b/SKILL.md', skill('a'))]), { code: 'PACK_FORMAT' });
});

test('拼 MCP：填的值换进去，密钥项标成密钥；可选项没填用默认值，必填没填返回缺什么', () => {
  const plans = Object.fromEntries(readPack(samplePack(), { rootFor: () => 'D:/p' }).mcp.map(plan => [plan.key, plan]));
  assert.deepEqual(composePackServer(plans.search, {}, { name: 'search', title: 'search' }), { missing: ['SEARCH_TOKEN'] });
  const { server } = composePackServer(plans.search, { SEARCH_TOKEN: 'T-1' }, { name: 'search', title: 'search' });
  assert.deepEqual(server.headers, [{ name: 'Authorization', value: 'Bearer T-1', secret: true }, { name: 'X-Region', value: 'cn', secret: false }]);
  assert.equal(server.urlSecret, false);
  const map = composePackServer(plans.map, { 'user_config.mapKey': 'K' }, { name: 'map', title: 'map' }).server;
  assert.equal(map.url, 'https://maps.example.com/mcp?key=K'); assert.equal(map.urlSecret, true);
  assert.deepEqual(composePackServer(plans.own, { __url: 'ftp://x' }, { name: 'own', title: 'own' }).missing, ['以 http:// 或 https:// 开头的服务地址']);
  assert.equal(composePackServer(plans.own, { __url: 'https://own.example.com/mcp' }, { name: 'own', title: 'own' }).server.url, 'https://own.example.com/mcp');
  const local = composePackServer(plans.local, {}, { name: 'local', title: 'local' }).server;
  assert.deepEqual([local.command, local.args, local.env.map(row => row.secret)], ['node', ['D:/p/server.mjs'], [false, false]]);
  for (const result of [server, map, local]) contract.mcpInput.parse({ action: 'save', server: result, expectedRevision: null });
  assert.equal(planServer('x', null, { root: 'r', data: 'd' }).blocked, '配置写得不对，读不懂');
});

test('压缩包：上传的去掉外面一层文件夹；GitHub 仓库包只取包所在的文件夹', () => {
  const upload = zipSync({ 'my-pack/.claude-plugin/plugin.json': strToU8('{"name":"my-pack"}'), 'my-pack/skills/a/SKILL.md': strToU8(skill('a')), '__MACOSX/x': strToU8('x') });
  assert.deepEqual(filesFromZip(upload).map(item => item.path).sort(), ['.claude-plugin/plugin.json', 'skills/a/SKILL.md']);
  const repo = zipSync({ 'repo-abc123/README.md': strToU8('r'), 'repo-abc123/plugins/one/.claude-plugin/plugin.json': strToU8('{"name":"one"}'), 'repo-abc123/plugins/one/skills/a/SKILL.md': strToU8(skill('a')), 'repo-abc123/plugins/oneother/x': strToU8('x') });
  assert.deepEqual(filesFromZip(repo, { prefix: 'plugins/one' }).map(item => item.path).sort(), ['.claude-plugin/plugin.json', 'skills/a/SKILL.md']);
  assert.throws(() => filesFromZip(Buffer.from('not a zip')), { code: 'PACK_FORMAT' });
});

test('市场里一个包放在哪：同仓库文件夹、GitHub 仓库、带子文件夹和版本；npm、命令行、GitHub 以外的说明装不了', () => {
  const market = { id: 'm', kind: 'github', repo: 'owner/market' };
  assert.deepEqual(resolveSource(market, { source: './finance' }), { kind: 'github', repo: 'owner/market', ref: undefined, path: 'finance' });
  assert.deepEqual(resolveSource(market, { source: 'one' }, './plugins'), { kind: 'github', repo: 'owner/market', ref: undefined, path: 'plugins/one' });
  assert.deepEqual(resolveSource(market, { source: { source: 'github', repo: 'a/b', ref: 'v1' } }), { kind: 'github', repo: 'a/b', ref: 'v1', path: '' });
  assert.deepEqual(resolveSource(market, { source: { source: 'git-subdir', url: 'https://github.com/a/b.git', path: 'plugins/x', ref: 'main', sha: 'abc123' } }), { kind: 'github', repo: 'a/b', ref: 'abc123', path: 'plugins/x' });
  assert.match(resolveSource(market, { source: { source: 'url', url: 'https://gitlab.com/a/b.git' } }).error, /GitHub 以外/);
  assert.match(resolveSource(market, { source: { source: 'npm', package: 'x' } }).error, /npm/);
  assert.match(resolveSource(market, { source: { source: 'command', command: 'x' } }).error, /命令行/);
  assert.match(resolveSource(market, { source: '../outside' }).error, /位置/);
  assert.equal(githubRepo('https://github.com/Owner/Repo.git'), 'Owner/Repo'); assert.equal(githubRepo('owner/repo'), 'owner/repo'); assert.equal(githubRepo('https://gitlab.com/a/b'), null);
  assert.deepEqual(builtinMarkets.map(item => item.id), ['whalewing'], '默认只有鲸翼精选（用户定：不要 Anthropic 的市场）');
});

async function makeLibrary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-packs-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const skills = path.join(root, 'skills');
  await seedBundledSkills(skills);
  return { root, library: new SkillLibrary(new Vault(path.join(root, 'vault')), skills) };
}

/** 假的 GitHub：市场清单和仓库压缩包都从这里给，记下下载了几次。 */
function fakeGithub() {
  const calls = [];
  const repoZip = zipSync({ 'market-sha/.claude-plugin/marketplace.json': strToU8('{}'), ...Object.fromEntries(samplePack('remote-pack').map(item => [`market-sha/packs/remote/${item.path}`, new Uint8Array(item.bytes)])) });
  const marketplace = { name: 'owner-market', plugins: [{ name: 'remote-pack', displayName: '远程包', description: '从 GitHub 来', source: './packs/remote', category: 'productivity' }, { name: 'npm-pack', source: { source: 'npm', package: 'x' } }] };
  const fetch = async url => {
    calls.push(url);
    if (url === 'https://raw.githubusercontent.com/owner/market/HEAD/.claude-plugin/marketplace.json') return new Response(JSON.stringify(marketplace));
    if (url === 'https://codeload.github.com/owner/market/zip/HEAD') return new Response(repoZip);
    return new Response('missing', { status: 404 });
  };
  return { fetch, calls };
}

test('插件包市场：鲸翼精选读本地，GitHub 市场读清单；读不到的那栏写原因；员工加的市场能移除', async t => {
  const { library } = await makeLibrary(t);
  const github = fakeGithub();
  const market = new PackMarket(library.packs, { fetch: github.fetch });
  const home = await market.home(false, AbortSignal.timeout(5000));
  assert.deepEqual(home.map(item => item.id), ['whalewing']);
  assert.deepEqual(home[0].entries.map(entry => entry.title), ['录音进第二大脑', '出行规划', '飞书办公', '联网搜索']);
  await assert.rejects(market.addMarket('owner/empty', AbortSignal.timeout(5000)), /没有插件包市场清单/);
  await assert.rejects(market.home(false, AbortSignal.timeout(5000), 'nope'), { code: 'PACK_MISSING' });
  await assert.rejects(market.addMarket('not a repo', AbortSignal.timeout(5000)), { code: 'PACK_INPUT' });
  const added = await market.addMarket('https://github.com/owner/market', AbortSignal.timeout(5000));
  assert.deepEqual(added.map(item => [item.id, Boolean(item.loading)]), [['whalewing', false], ['github:owner/market', false]]);
  assert.deepEqual((await market.home(true, AbortSignal.timeout(5000))).map(item => [item.id, Boolean(item.loading)]), [['whalewing', false], ['github:owner/market', true]], '刷新时 GitHub 上的市场先标“正在读”，不拖住鲸翼精选');
  const mine = added.find(item => item.id === 'github:owner/market');
  assert.equal(mine.title, 'owner-market'); assert.equal(mine.removable, true);
  assert.deepEqual(mine.entries.map(entry => [entry.name, entry.installable, entry.own]), [['remote-pack', true, true], ['npm-pack', false, undefined]]);
  await assert.rejects(market.addMarket('owner/market', AbortSignal.timeout(5000)), { code: 'PACK_INPUT' }, '不重复加');
  const removed = await market.removeMarket('github:owner/market', AbortSignal.timeout(5000));
  assert.equal(removed.some(item => item.id === 'github:owner/market'), false);
  await assert.rejects(market.removeMarket('whalewing', AbortSignal.timeout(5000)), { code: 'PACK_INPUT' }, '内置的市场不能移除');
});

test('装插件包：预览暂存，只装看过的那一份；技能交给 DSH 发现（停用后不发现），记录里带来源；卸载整个删掉', async t => {
  const { library } = await makeLibrary(t);
  const github = fakeGithub();
  const market = new PackMarket(library.packs, { fetch: github.fetch });
  await market.addMarket('owner/market', AbortSignal.timeout(5000));
  const { stage, pack, source } = await market.preview({ entry: { market: 'github:owner/market', name: 'remote-pack' } }, AbortSignal.timeout(5000));
  assert.equal(pack.title, '远程包'); assert.deepEqual(source, { kind: 'market', label: 'owner-market', market: 'github:owner/market', entry: 'remote-pack', repo: 'owner/market', path: 'packs/remote' });
  assert.throws(() => market.staged(stage, 'other'), { code: 'PACK_CHANGED' });
  assert.throws(() => market.staged('missing', pack.hash), { code: 'PACK_STALE' });
  assert.equal(github.calls.filter(url => url.includes('codeload')).length, 1);
  await market.preview({ entry: { market: 'github:owner/market', name: 'remote-pack' } }, AbortSignal.timeout(5000));
  assert.equal(github.calls.filter(url => url.includes('codeload')).length, 1, '十分钟内同一仓库不重复下载');
  await assert.rejects(market.preview({ entry: { market: 'github:owner/market', name: 'npm-pack' } }, AbortSignal.timeout(5000)), { code: 'PACK_SOURCE' });

  const record = { name: pack.name, title: pack.title, source, enabled: true, skills: pack.skills, mcp: [], skippedMcp: [], skipped: pack.skipped, issues: pack.issues };
  await library.packs.install(market.staged(stage, pack.hash).pack, record, AbortSignal.timeout(5000));
  await assert.rejects(library.packs.install(pack, record, AbortSignal.timeout(5000)), { code: 'PACK_EXISTS' });
  const installedDir = path.join(library.root, ...packArea.split('/'), 'remote-pack');
  assert.equal(await fs.readFile(path.join(installedDir, 'server.mjs'), 'utf8'), 'console.log(1)', '包的文件原样放好');
  assert.equal((await library.packs.load()).length, 1);
  assert.equal((await library.packs.readSkill('remote-pack', 'route-plan')).content, skill('route-plan'));
  assert.equal((await library.catalog(0)).entries.some(entry => entry.name === 'route-plan'), false, '不复制成个人技能');

  const control = { signal: new AbortController().signal, invalidate() {} };
  const provider = new WhalewingSkillProvider({ logger: { warn() {} }, get() {}, on() { return () => {}; } }, control, library, () => ({ features: [] }));
  t.after(() => provider.dispose());
  const names = async () => { const value = await provider.list(control); return (Array.isArray(value) ? value : value.candidates).map(item => item.name); };
  assert.ok((await names()).includes('route-plan'), '开着的包里的技能 DSH 能发现');
  await library.packs.update('remote-pack', { enabled: false });
  assert.equal((await names()).includes('route-plan'), false, '停用后不发现');
  await library.packs.update('remote-pack', { enabled: true });
  assert.ok((await names()).includes('route-plan'));
  await library.packs.remove('remote-pack');
  assert.equal((await names()).includes('route-plan'), false);
  await assert.rejects(fs.stat(installedDir), { code: 'ENOENT' });
});

test('插件包带的 MCP：包停用时不连，启用再连；卸载包时一起删，凭据库里的密钥也删', async () => {
  const rows = new Map(), records = new Map(), mounted = [];
  const table = { get: key => rows.get(key), entries: () => rows.entries(), put: async (key, value) => { rows.set(key, structuredClone(value)); }, delete: async key => { rows.delete(key); } };
  const credentials = { readRecord: async key => records.get(key), modifyRecord: async (key, mutate) => { records.set(key, await mutate(records.get(key))); }, deleteRecord: async key => { records.delete(key); } };
  const ctx = { get: name => ({ credentials, tools: { definitions: () => [] } })[name], emit() {}, plugin(client, config) { const item = { config, disposed: false }; mounted.push(item); return Object.assign(Promise.resolve(), { dispose() { item.disposed = true; } }); } };
  let enabled = true;
  const mcp = new McpServers(ctx, table, { loadClient: async () => ({}), packEnabled: () => enabled });
  const server = { name: 'pack-map', title: 'map', transport: 'streamable-http', url: 'https://maps.example.com/mcp', headers: [{ name: 'Authorization', value: 'Bearer K', secret: true }], env: [] };
  const saved = await mcp.save({ server, expectedRevision: null }, { pack: 'sample-pack', wait: false });
  assert.equal(saved.server.pack, 'sample-pack');
  await new Promise(setImmediate);
  assert.equal(mounted.filter(item => !item.disposed).length, 1);
  enabled = false; mcp.setPack('sample-pack', false);
  assert.equal(mounted.filter(item => !item.disposed).length, 0, '包停用就断开');
  assert.deepEqual([mcp.list().servers[0].status, mcp.list().servers[0].packOff], ['disabled', true]);
  await assert.rejects(mcp.reconnect('pack-map'), { code: 'MCP_DISABLED' });
  mcp.startAll(); assert.equal(mounted.filter(item => !item.disposed).length, 0, '启动时也不连停用包的');
  enabled = true; mcp.setPack('sample-pack', true); await new Promise(setImmediate);
  assert.equal(mounted.filter(item => !item.disposed).length, 1);
  assert.ok(records.has('whalewing/mcp-pack-map'));
  assert.deepEqual(await mcp.removePack('sample-pack'), ['pack-map']);
  assert.equal(rows.size, 0); assert.equal(records.size, 0); assert.equal(mounted.filter(item => !item.disposed).length, 0);
});

test('鲸翼精选的四个包都能读：每个都有技能，MCP 的要填项有中文名，密钥标成密钥', async t => {
  const { library } = await makeLibrary(t);
  const market = new PackMarket(library.packs, { fetch: async () => { throw new Error('offline'); } });
  const home = await market.home(false, AbortSignal.timeout(5000));
  for (const entry of home[0].entries) {
    const { pack } = await market.preview({ entry: { market: 'whalewing', name: entry.name } }, AbortSignal.timeout(5000));
    assert.equal(pack.title, entry.title); assert.deepEqual(pack.issues, [], entry.name);
    assert.ok(pack.skills.length >= 1, entry.name); assert.ok(pack.mcp.length >= 1, entry.name);
    for (const plan of pack.mcp) {
      assert.equal(plan.blocked, undefined, `${entry.name}/${plan.key}`); assert.equal(plan.hint, undefined, `${entry.name}/${plan.key}`);
      for (const field of plan.fields) { assert.match(field.label, /[\u4e00-\u9fa5]|Key|ID|Secret/, field.id); if (/key|secret/i.test(field.id)) assert.equal(field.secret, true, field.id); }
    }
  }
});
