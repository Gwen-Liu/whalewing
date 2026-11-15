import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { explainConnect, maskUrl, secretRef, STDIO_STARTUP_MS, legacyCredentialKey } from '../src/mcp-servers.js';
import { mcpCatalog, mcpCategories, composeServer } from '../features/skills/mcp-catalog.js';
import { skillLibraryContract } from '../features/skills/contract.js';
import { makeMcp } from './mcp-fake-dsh.mjs';

const contract = skillLibraryContract(z);
const amap = () => composeServer(mcpCatalog.find(item => item.id === 'amap'), { key: 'AMAP-SECRET' }, { name: 'amap', title: '高德地图' }).server;
const echo = (extra = {}) => ({ name: 'echo-test', title: '本机回声', transport: 'stdio', command: 'node', args: ['echo.mjs'], env: [{ name: 'TOKEN', value: 'SECRET-1', secret: true }, { name: 'MODE', value: 'fast', secret: false }], headers: [], ...extra });
const one = async (mcp, name) => (await mcp.list()).servers.find(server => server.name === name);
const parse = value => contract.mcpResult.parse(value);

// 2026-11-09 用户定：日常常用的二三十个，在精不在多，每个都要能正常用（逐个实测见当前工作）。
test('精选清单：22 个，分类齐全，每个都有官方文档，id 能直接当英文名用；填上值拼出的配置 Host 收得下', () => {
  assert.equal(mcpCatalog.length, 22);
  assert.deepEqual(mcpCatalog.map(item => item.id).filter((id, index, list) => list.indexOf(id) !== index), [], 'id 不重复');
  for (const item of mcpCatalog) {
    assert.ok(mcpCategories.includes(item.category), item.id);
    assert.match(item.docsUrl, /^https:\/\//, item.id);
    assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/); assert.ok(item.id.length <= 32);
    assert.ok(['stdio', 'streamable-http'].includes(item.transport), item.id);
    if (item.transport === 'stdio') assert.equal(item.command, 'npx', `${item.id} 用 npm 包，员工装 Node.js 就能用`);
    const values = Object.fromEntries(item.fields.map(field => [field.id, field.id === 'url' ? 'https://example.com/mcp' : 'x']));
    const { server } = composeServer(item, values, { name: item.id, title: item.name });
    contract.mcpInput.parse({ action: 'save', server, expectedRevision: null });
  }
  assert.deepEqual(new Set(mcpCatalog.map(item => item.category)), new Set(mcpCategories));
  // 语雀的 npm 包认的是 YUQUE_PERSONAL_TOKEN（2026-11-09 实测时发现原来写错了）。
  assert.deepEqual(mcpCatalog.find(item => item.id === 'yuque').env.map(row => row.name), ['YUQUE_PERSONAL_TOKEN', 'YUQUE_BASE_URL']);
});

test('精选清单：每个都写了适合哪几位专家用（只是推荐，不强制绑），写的都是随包专家', () => {
  const builtIn = new Set(fs.readdirSync(new URL('../content/experts/', import.meta.url)).filter(name => name.endsWith('.md') && name !== 'common.md').map(name => name.slice(0, -3)));
  for (const item of mcpCatalog) {
    assert.ok(Array.isArray(item.experts) && item.experts.length >= 1 && item.experts.length <= 3, `${item.id} 推荐 1～3 位`);
    for (const id of item.experts) assert.ok(builtIn.has(id), `${item.id} 推荐的 ${id} 不是随包专家`);
  }
});

test('拼配置：{字段} 换成填的值，用到密钥的那一项标密钥；可选字段没填就不带那一行；缺必填项说清是哪项', () => {
  assert.deepEqual(amap(), { name: 'amap', title: '高德地图', catalogId: 'amap', transport: 'streamable-http', env: [], headers: [], url: 'https://mcp.amap.com/mcp?key=AMAP-SECRET', urlSecret: true });
  const feishu = composeServer(mcpCatalog.find(item => item.id === 'feishu'), { appId: 'cli_1', appSecret: 's3' }, { name: 'feishu', title: '飞书' }).server;
  assert.deepEqual(feishu.env, [{ name: 'APP_ID', value: 'cli_1', secret: false }, { name: 'APP_SECRET', value: 's3', secret: true }]);
  assert.equal(feishu.command, 'npx');
  const context7 = composeServer(mcpCatalog.find(item => item.id === 'context7'), {}, { name: 'context7', title: 'Context7' }).server;
  assert.deepEqual(context7.headers, [], '可选的 Key 没填，就不带 Authorization');
  assert.deepEqual(composeServer(mcpCatalog.find(item => item.id === 'github'), {}, { name: 'github', title: 'GitHub' }), { missing: ['GitHub 个人访问令牌'] });
});


// 2026-11-15 用户选“方向三”：员工加的 MCP 写进 DSH 自己的配置，密钥按名存凭据库、配置里只写引用。
test('添加：写进 DSH 配置（MCP 管理器那一节），密钥存进凭据库，配置里只有 ${credential:名字}；鲸翼只记显示名称', async () => {
  const h = makeMcp();
  const saved = parse(await h.mcp.save({ server: echo(), expectedRevision: null }));
  const ref = secretRef('echo-test', 'ENV', 'TOKEN');
  assert.equal(ref, 'WHALEWING_MCP_ECHO_TEST_ENV_TOKEN');
  assert.deepEqual(h.state.user['echo-test'], { transport: 'stdio', command: 'node', args: ['echo.mjs'], env: { TOKEN: `\${credential:${ref}}`, MODE: 'fast' }, startupTimeoutMs: STDIO_STARTUP_MS, enabled: true });
  assert.equal(h.credentials.values.get(ref), 'SECRET-1');
  assert.doesNotMatch(JSON.stringify(h.state.user), /SECRET-1/, '配置里没有密钥值');
  assert.deepEqual(h.meta.rows.get('echo-test'), { name: 'echo-test', title: '本机回声', updatedAt: 1000 });
  assert.equal(saved.server.source, 'mine'); assert.equal(saved.server.editable, true); assert.equal(saved.server.status, 'connecting');
  assert.deepEqual(saved.server.env, [{ name: 'TOKEN', secret: true, saved: true, ref }, { name: 'MODE', secret: false, value: 'fast' }]);
  assert.doesNotMatch(JSON.stringify(saved), /SECRET-1/, '回给界面的也没有');
  // 远程服务：地址带密钥时整条地址进凭据库。
  const map = parse(await h.mcp.save({ server: amap(), expectedRevision: null })).server;
  assert.equal(h.state.user.amap.url, '${credential:WHALEWING_MCP_AMAP_URL}');
  assert.equal(h.credentials.values.get('WHALEWING_MCP_AMAP_URL'), 'https://mcp.amap.com/mcp?key=AMAP-SECRET');
  assert.deepEqual([map.urlSecret, map.urlRef, map.urlSaved, map.url, map.catalogId], [true, 'WHALEWING_MCP_AMAP_URL', true, '', 'amap']);
  assert.equal(h.state.user.amap.startupTimeoutMs, undefined, '远程服务用 DSH 默认的启动等待');
});

test('状态照 DSH 报的说：已连上几个工具、正在连第几次、重试中（原因、下次时间）、等密钥、停止重试、停用', async () => {
  const h = makeMcp();
  await h.mcp.save({ server: echo(), expectedRevision: null });
  h.statuses.set('echo-test', { state: 'connected', toolCount: 2, connectedAt: 1 });
  let view = await one(h.mcp, 'echo-test');
  assert.deepEqual([view.status, view.toolCount, view.tools], ['connected', 2, ['read', 'search']]);
  h.statuses.set('echo-test', { state: 'connecting', attempt: 2 });
  view = await one(h.mcp, 'echo-test');
  assert.deepEqual([view.status, view.attempt], ['connecting', 2]);
  h.statuses.set('echo-test', { state: 'reconnecting', attempt: 3, maxAttempts: 10, nextRetryAtMs: 5000, lastError: 'mcp-client(echo-test): connect: fetch failed' });
  view = await one(h.mcp, 'echo-test');
  assert.deepEqual([view.status, view.attempt, view.maxAttempts, view.nextRetryAt], ['retrying', 3, 10, 5000]);
  assert.match(view.error, /连不上对方服务器/);
  h.statuses.set('echo-test', { state: 'waiting-credentials', lastError: 'credential "X" is not configured' });
  assert.equal((await one(h.mcp, 'echo-test')).status, 'waiting');
  h.statuses.set('echo-test', { state: 'failed', reason: 'gave-up', lastError: 'spawn node ENOENT' });
  view = await one(h.mcp, 'echo-test');
  assert.equal(view.status, 'failed'); assert.match(view.error, /找不到命令「node」/);
  h.statuses.set('echo-test', { state: 'failed', reason: 'cleanup', result: {} });
  assert.match((await one(h.mcp, 'echo-test')).error, /重启 DSH/);
  parse(await h.mcp.list());
});

test('编辑：密钥留空沿用原来的引用；改了值就换掉凭据库里的；不再用的鲸翼密钥删掉；别处改过（指纹或修订号对不上）拒绝', async () => {
  const h = makeMcp();
  const first = (await h.mcp.save({ server: echo(), expectedRevision: null })).server;
  const ref = secretRef('echo-test', 'ENV', 'TOKEN');
  const kept = (await h.mcp.save({ server: echo({ title: '回声', env: [{ name: 'TOKEN', secret: true }] }), expectedRevision: first.revision })).server;
  assert.equal(h.state.user['echo-test'].env.TOKEN, `\${credential:${ref}}`); assert.equal(h.credentials.values.get(ref), 'SECRET-1'); assert.equal(kept.title, '回声');
  const changed = (await h.mcp.save({ server: echo({ env: [{ name: 'TOKEN', value: 'SECRET-2', secret: true }] }), expectedRevision: kept.revision })).server;
  assert.equal(h.credentials.values.get(ref), 'SECRET-2');
  await h.mcp.save({ server: echo({ env: [{ name: 'TOKEN', value: 'plain', secret: false }] }), expectedRevision: changed.revision });
  assert.equal(h.state.user['echo-test'].env.TOKEN, 'plain'); assert.equal(h.credentials.values.has(ref), false, '不再用的鲸翼密钥删掉');
  await assert.rejects(h.mcp.save({ server: echo(), expectedRevision: first.revision }), { code: 'CONFLICT' });
  await assert.rejects(h.mcp.save({ server: echo({ name: 'fresh', env: [{ name: 'TOKEN', secret: true }] }), expectedRevision: null }), { code: 'MCP_SECRET' }, '第一次保存的密钥必须填');
  // 设置服务的修订号对不上（别处刚写过 DSH 配置）：DSH 拒绝，鲸翼说成“刚在别处改过”。
  const latest = await one(h.mcp, 'echo-test');
  const section = h.mcp.section.bind(h.mcp);
  h.mcp.section = () => ({ ...section(), revision: section().revision - 1 });
  await assert.rejects(h.mcp.setEnabled('echo-test', false, latest.revision), { code: 'CONFLICT' });
});

test('名字：新加的照鲸翼的规则；和配置里的、别的插件登记的、老式写法的重名都拒绝', async () => {
  const h = makeMcp({ base: { github: { transport: 'stdio', command: 'npx' } }, statics: [{ serverName: 'old-one', transport: 'stdio', command: 'x' }] });
  h.manager.register('other-plugin', { transport: 'streamable-http', url: 'https://x' });
  for (const name of ['github', 'other-plugin', 'old-one']) await assert.rejects(h.mcp.save({ server: echo({ name }), expectedRevision: null }), { code: 'MCP_NAME' }, name);
  await assert.rejects(h.mcp.save({ server: echo({ name: 'Bad_Name' }), expectedRevision: null }), { code: 'MCP_NAME' });
});

test('DSH 配置文件里手写的：列为“配置文件里写的”，鲸翼能改能停用；它自己的凭据名和重连规则原样留着，删除时不动别人的凭据', async () => {
  const user = { GitHub_Main: { transport: 'stdio', command: 'npx', args: ['-y', 'server-github'], env: { GITHUB_TOKEN: '${credential:GITHUB_TOKEN}' }, reconnect: { enabled: true, maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 30000 } } };
  const h = makeMcp({ user, credentialValues: { GITHUB_TOKEN: 'ghp-x' } });
  let view = await one(h.mcp, 'GitHub_Main');
  assert.deepEqual([view.source, view.title, view.editable], ['dsh', 'GitHub_Main', true]);
  assert.deepEqual(view.env, [{ name: 'GITHUB_TOKEN', secret: true, saved: true, ref: 'GITHUB_TOKEN' }]);
  view = (await h.mcp.save({ server: { name: 'GitHub_Main', title: 'GitHub', transport: 'stdio', command: 'npx', args: ['-y', 'server-github'], env: [{ name: 'GITHUB_TOKEN', secret: true }], headers: [] }, expectedRevision: view.revision })).server;
  assert.equal(h.state.user.GitHub_Main.env.GITHUB_TOKEN, '${credential:GITHUB_TOKEN}');
  assert.equal(h.state.user.GitHub_Main.reconnect.maxAttempts, 3, '鲸翼不认得的重连规则留着');
  assert.deepEqual([view.source, view.title], ['mine', 'GitHub'], '鲸翼记了显示名称以后算“我加的”');
  view = (await h.mcp.setEnabled('GitHub_Main', false, view.revision)).server;
  assert.equal(h.state.user.GitHub_Main.enabled, false); assert.equal(view.status, 'disabled');
  await h.mcp.remove('GitHub_Main', view.revision);
  assert.equal(h.state.user.GitHub_Main, undefined); assert.equal(h.credentials.values.get('GITHUB_TOKEN'), 'ghp-x', '不是鲸翼起名的凭据不删');
});

test('停用、重新连接、删除、补密钥：删除时鲸翼起名的密钥一起删；补密钥只认已经是引用的那项', async () => {
  const h = makeMcp();
  const saved = (await h.mcp.save({ server: echo(), expectedRevision: null })).server;
  const off = (await h.mcp.setEnabled('echo-test', false, saved.revision)).server;
  assert.equal(off.enabled, false);
  await assert.rejects(h.mcp.reconnect('echo-test'), { code: 'MCP_DISABLED' });
  const on = (await h.mcp.setEnabled('echo-test', true, off.revision)).server;
  await h.mcp.reconnect('echo-test');
  assert.deepEqual(h.restarts, ['echo-test']);
  const filled = parse(await h.mcp.setSecret('echo-test', { kind: 'env', key: 'TOKEN' }, 'NEW')).server;
  assert.equal(h.credentials.values.get(secretRef('echo-test', 'ENV', 'TOKEN')), 'NEW'); assert.equal(filled.name, 'echo-test');
  await assert.rejects(h.mcp.setSecret('echo-test', { kind: 'env', key: 'MODE' }, 'x'), { code: 'MCP_SECRET' });
  assert.deepEqual(parse(await h.mcp.remove('echo-test', on.revision)), { removed: 'echo-test' });
  assert.equal(h.state.user['echo-test'], undefined); assert.equal(h.credentials.values.size, 0); assert.equal(h.meta.rows.size, 0);
  // DSH 组合自带（不在 profile 那层）的删不掉，只能停用。
  const inherited = makeMcp({ base: { builtin: { transport: 'streamable-http', url: 'https://b' } } });
  await assert.rejects(inherited.mcp.remove('builtin', (await one(inherited.mcp, 'builtin')).revision), { code: 'MCP_INHERITED' });
});

test('别的插件登记的和老式写法的：只列出来，不能改', async () => {
  const h = makeMcp({ statics: [{ serverName: 'legacy-row', transport: 'streamable-http', url: 'https://x/mcp?key=1' }] });
  h.manager.register('from-plugin', { transport: 'streamable-http', url: 'https://p' });
  h.statuses.set('from-plugin', { state: 'connected', toolCount: 2 });
  const list = parse(await h.mcp.list());
  const plugin = list.servers.find(server => server.name === 'from-plugin'), row = list.servers.find(server => server.name === 'legacy-row');
  assert.deepEqual([plugin.source, plugin.editable, plugin.status], ['plugin', false, 'connected']);
  assert.deepEqual([row.source, row.editable, row.status, row.target], ['static', false, 'external', 'https://x/mcp?key=•••']);
});

test('插件包带的：向 MCP 管理器登记、不写配置；包停用就撤回，启用再登记；卸载包时撤回并删掉鲸翼起名的密钥', async () => {
  let on = true;
  const h = makeMcp({ packOn: () => on });
  const server = { name: 'pack-map', title: 'map', transport: 'streamable-http', url: 'https://maps.example.com/mcp', headers: [{ name: 'Authorization', value: 'Bearer K', secret: true }], env: [] };
  const saved = parse(await h.mcp.save({ server, expectedRevision: null }, { pack: 'sample-pack' })).server;
  assert.deepEqual([saved.source, saved.pack], ['pack', 'sample-pack']);
  assert.deepEqual(h.registered.get('pack-map'), { transport: 'streamable-http', url: 'https://maps.example.com/mcp', headers: { Authorization: '${credential:WHALEWING_MCP_PACK_MAP_HEADER_AUTHORIZATION}' } });
  assert.equal(h.state.user['pack-map'], undefined, '不写进 DSH 配置');
  assert.equal(h.credentials.values.get('WHALEWING_MCP_PACK_MAP_HEADER_AUTHORIZATION'), 'Bearer K');
  on = false; h.mcp.setPack('sample-pack', false);
  assert.equal(h.registered.size, 0, '包停用就撤回');
  const off = await one(h.mcp, 'pack-map');
  assert.deepEqual([off.status, off.packOff], ['disabled', true]);
  await assert.rejects(h.mcp.reconnect('pack-map'), { code: 'MCP_DISABLED' });
  h.mcp.startPacks(); assert.equal(h.registered.size, 0, '启动时也不登记停用包的');
  on = true; h.mcp.setPack('sample-pack', true); assert.equal(h.registered.size, 1);
  // 包里的单个 MCP 也能停用。
  const paused = (await h.mcp.setEnabled('pack-map', false, (await one(h.mcp, 'pack-map')).revision)).server;
  assert.equal(h.registered.size, 0); assert.equal(paused.enabled, false);
  await h.mcp.setEnabled('pack-map', true, paused.revision);
  assert.equal(h.registered.size, 1);
  assert.deepEqual(await h.mcp.removePack('sample-pack'), ['pack-map']);
  assert.equal(h.meta.rows.size, 0); assert.equal(h.credentials.values.size, 0); assert.equal(h.registered.size, 0);
});

test('插件包带的登记被 DSH 拒了（和别的插件同名）：显示连不上和原因，不显示成“正在连”', async () => {
  const h = makeMcp();
  h.manager.register('clash', { transport: 'streamable-http', url: 'https://other' });
  await h.meta.put('clash', { name: 'clash', title: '撞名', pack: 'p', enabled: true, entry: { transport: 'streamable-http', url: 'https://mine' }, updatedAt: 1 });
  h.mcp.startPacks();
  const view = (await h.mcp.list()).servers.find(server => server.source === 'pack');
  assert.deepEqual([view.status, view.error], ['failed', '这个英文名已经被另一个 MCP 用了，换一个名字']);
});

test('试连：照填的拼一份连接配置连一下，不保存；新填的密钥直接代进去，沿用的留引用让 DSH 去凭据库取', async () => {
  const h = makeMcp();
  const result = parse(await h.mcp.probe(echo()));
  assert.deepEqual(result, { probe: { ok: true, server: { name: 'fake', version: '1.0' }, tools: ['read', 'search'], truncated: false, ms: 120 } });
  assert.deepEqual(h.probes[0].config, { transport: 'stdio', command: 'node', args: ['echo.mjs'], env: { TOKEN: 'SECRET-1', MODE: 'fast' }, cwd: '', serverName: 'echo-test', expandTemplates: true, startupTimeoutMs: STDIO_STARTUP_MS });
  assert.equal(h.probes[0].opts.timeoutMs, 90000, '本机程序第一次要下载，试连等久一点');
  assert.equal(h.credentials.values.size, 0, '试连不存密钥'); assert.deepEqual(h.state.user, {}, '也不写配置');
  await h.mcp.save({ server: echo(), expectedRevision: null });
  await h.mcp.probe(echo({ env: [{ name: 'TOKEN', secret: true }] }));
  assert.equal(h.probes[1].config.env.TOKEN, `\${credential:${secretRef('echo-test', 'ENV', 'TOKEN')}}`);
  const failing = makeMcp({ probe: () => ({ ok: false, stage: 'connect', message: 'mcp-client(x): connect: HTTP 401 Unauthorized', durationMs: 50, closeConfirmed: true }) });
  const failed = parse(await failing.mcp.probe(amap())).probe;
  assert.deepEqual([failed.ok, failed.ms], [false, 50]); assert.match(failed.error, /对方拒绝了/);
  assert.equal(failing.probes[0].opts.timeoutMs, 15000, '远程服务等 15 秒');
  const noKey = makeMcp({ probe: () => ({ ok: false, stage: 'connect', message: 'env.TOKEN: credential "WHALEWING_MCP_X" is not configured — store it', durationMs: 5, closeConfirmed: true }) });
  assert.match((await noKey.mcp.probe(echo())).probe.error, /还没有它要的密钥/);
});

test('搬家：旧版自己存的 MCP 写进 DSH 配置，密钥拆开按名存；插件包带的改成登记；同名的用 DSH 那条；缺密钥的照样搬、显示“等密钥”；只搬一次', async () => {
  const h = makeMcp({ base: { taken: { transport: 'streamable-http', url: 'https://dsh' } } });
  const old = (name, extra) => ({ name, title: `旧 ${name}`, transport: 'stdio', command: 'npx', args: ['-y', name], env: [], headers: [], enabled: true, revision: 3, updatedAt: 1, ...extra });
  await h.legacy.put('feishu', old('feishu', { catalogId: 'feishu', env: [{ name: 'APP_ID', value: 'cli', secret: false }, { name: 'APP_SECRET', secret: true }] }));
  await h.legacy.put('remote', old('remote', { transport: 'streamable-http', command: undefined, args: undefined, url: 'https://r/mcp?key=•••', urlSecret: true, headers: [{ name: 'X-Key', secret: true }], enabled: false }));
  await h.legacy.put('lost', old('lost', { env: [{ name: 'TOKEN', secret: true }] }));
  await h.legacy.put('taken', old('taken'));
  await h.legacy.put('packed', old('packed', { pack: 'kit', env: [{ name: 'K', secret: true }] }));
  h.credentials.records.set(legacyCredentialKey('feishu'), { kind: 'grant', payload: { env: { APP_SECRET: 'fs-secret' }, headers: {} } });
  h.credentials.records.set(legacyCredentialKey('remote'), { kind: 'grant', payload: { url: 'https://r/mcp?key=REAL', env: {}, headers: { 'X-Key': 'xk' } } });
  h.credentials.records.set(legacyCredentialKey('packed'), { kind: 'grant', payload: { env: { K: 'pk' }, headers: {} } });
  await h.mcp.migrate();
  assert.deepEqual(h.state.user.feishu, { transport: 'stdio', command: 'npx', args: ['-y', 'feishu'], env: { APP_ID: 'cli', APP_SECRET: '${credential:WHALEWING_MCP_FEISHU_ENV_APP_SECRET}' }, startupTimeoutMs: STDIO_STARTUP_MS, enabled: true });
  assert.equal(h.credentials.values.get('WHALEWING_MCP_FEISHU_ENV_APP_SECRET'), 'fs-secret');
  assert.deepEqual(h.state.user.remote, { transport: 'streamable-http', url: '${credential:WHALEWING_MCP_REMOTE_URL}', headers: { 'X-Key': '${credential:WHALEWING_MCP_REMOTE_HEADER_X_KEY}' }, enabled: false });
  assert.equal(h.credentials.values.get('WHALEWING_MCP_REMOTE_URL'), 'https://r/mcp?key=REAL');
  assert.equal(h.state.user.lost.env.TOKEN, '${credential:WHALEWING_MCP_LOST_ENV_TOKEN}'); assert.equal(h.credentials.values.has('WHALEWING_MCP_LOST_ENV_TOKEN'), false);
  assert.equal(h.state.user.taken, undefined, '同名的不覆盖 DSH 那条');
  assert.deepEqual(h.meta.rows.get('taken'), { name: 'taken', title: '旧 taken', updatedAt: 1000 });
  assert.equal(h.state.user.packed, undefined); assert.equal(h.meta.rows.get('packed').pack, 'kit'); assert.equal(h.credentials.values.get('WHALEWING_MCP_PACKED_ENV_K'), 'pk');
  assert.equal(h.state.writes.length, 1, '几条一起写，一次修订');
  assert.equal(h.legacy.rows.size, 0); assert.equal(h.credentials.records.size, 0, '旧记录删掉');
  h.statuses.set('lost', { state: 'waiting-credentials', lastError: 'not configured' });
  const list = parse(await h.mcp.list());
  assert.deepEqual(list.notice, { moved: 3, adopted: ['taken'] });
  assert.equal(list.servers.find(server => server.name === 'lost').status, 'waiting');
  assert.equal(list.servers.find(server => server.name === 'feishu').title, '旧 feishu');
  await h.mcp.migrate(); assert.equal(h.state.writes.length, 1, '没东西可搬就不写');
  assert.equal(parse(await h.mcp.dismissNotice()).notice, undefined);
  // 点过“知道了”以后又搬了一次（退回旧版加了 MCP 再升级）：只说这一次搬的，不把上次的也算进去（2026-11-15 封版验装时发现）。
  await h.legacy.put('later', old('later'));
  await h.mcp.migrate();
  assert.deepEqual(parse(await h.mcp.list()).notice, { moved: 1, adopted: [] });
});

test('DSH 没有 MCP 管理器时：列表说明原因，添加报错', async () => {
  const h = makeMcp();
  h.services.mcpManager = undefined;
  const list = parse(await h.mcp.list());
  assert.equal(list.manager, false); assert.match(list.issue, /MCP 管理器没有加载/);
  await assert.rejects(h.mcp.save({ server: echo(), expectedRevision: null }), { code: 'MCP_MANAGER' });
});

test('连接失败的原因说成大白话', () => {
  const stdio = { transport: 'stdio', command: 'npx' };
  assert.match(explainConnect(Object.assign(new Error('failed'), { cause: new Error('spawn npx ENOENT') }), stdio), /找不到命令「npx」.*Node\.js/);
  assert.match(explainConnect(new Error('getaddrinfo ENOTFOUND x.y'), {}), /找不到这个地址/);
  // DSH 0.2.2-rc.3 报的原因都带“startup:”阶段名：不能因为这个词就说成“下载慢”（2026-11-15 走查发现）。
  assert.match(explainConnect(new Error('mcp-client(x): startup: SdkError: Connection closed'), stdio), /一启动就退出了.*命令「npx」/);
  assert.match(explainConnect(new Error('mcp-client(x): startup: SdkError: Request timed out'), stdio), /第一次用要先下载/);
  assert.match(explainConnect(new Error('mcp-client(x): startup: SdkError: Version negotiation probe failed: fetch failed, cause: bad port'), { transport: 'streamable-http' }), /连不上对方服务器/);
  assert.match(explainConnect(new Error('fetch failed'), {}), /连不上对方服务器/);
  assert.match(explainConnect(Object.assign(new Error('failed'), { cause: new Error('[ { "code": "invalid_union", "path": [ "jsonrpc" ] } ]') }), {}), /不是 MCP 的格式.*密钥/);
  assert.match(explainConnect(Object.assign(new Error('failed'), { cause: new Error('{"weird":1}') }), {}), /对方没说明原因/);
  assert.equal(maskUrl('https://u:p@mcp.amap.com/mcp?key=abc&x=1'), 'https://mcp.amap.com/mcp?key=•••&x=•••');
});
