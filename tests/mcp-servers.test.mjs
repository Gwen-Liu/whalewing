import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { McpServers, explainConnect, maskUrl } from '../src/mcp-servers.js';
import { mcpCatalog, mcpCategories, composeServer } from '../features/skills/mcp-catalog.js';
import { skillLibraryContract } from '../features/skills/contract.js';

const contract = skillLibraryContract(z);

/** 假的存储表、凭据库、工具注册表和 MCP 客户端：记下挂了哪些连接、用的什么配置。 */
function harness({ fail: failing = new Set(), profile = [] } = {}) {
  const rows = new Map(), records = new Map(), mounted = [], events = [];
  const table = { get: key => rows.get(key), entries: () => rows.entries(), put: async (key, value) => { rows.set(key, structuredClone(value)); }, delete: async key => { rows.delete(key); } };
  const credentials = { readRecord: async key => records.get(key), modifyRecord: async (key, mutate) => { const next = await mutate(records.get(key)); if (next) records.set(key, next); }, deleteRecord: async key => { records.delete(key); } };
  const tools = { definitions: () => mounted.filter(item => !item.disposed && !failing.has(item.config.serverName)).flatMap(item => ['search', 'read'].map(tool => ({ name: `mcp__${item.config.serverName}__${tool}` }))) };
  const loader = { *entries() { for (const item of profile) yield { options: { name: '@deepseek-ai/dsh-mcp-client', id: `mcp-${item.serverName}`, config: item } }; } };
  const services = { credentials, tools, loader };
  const ctx = {
    get: name => services[name], emit: name => events.push(name),
    plugin(client, config) {
      const item = { client, config, disposed: false };
      mounted.push(item);
      const fiber = failing.has(config.serverName) ? Promise.reject(Object.assign(new Error(`mcp-client(${config.serverName}): initial connection or tool synchronization failed`), { cause: new Error('HTTP 401 Unauthorized') })) : Promise.resolve();
      fiber.catch(() => {});
      return Object.assign(fiber, { dispose() { item.disposed = true; } });
    },
  };
  const mcp = new McpServers(ctx, table, { loadClient: async () => ({ name: 'mcp-client' }), now: () => 1000 });
  return { mcp, rows, records, mounted, events, services };
}

const amap = () => composeServer(mcpCatalog.find(item => item.id === 'amap'), { key: 'AMAP-SECRET' }, { name: 'amap', title: '高德地图' }).server;

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

test('保存：密钥只进 DSH 凭据库，存储表和列表里都没有；连上后列出工具；连不上写明原因', async () => {
  const h = harness({ fail: new Set(['broken']) });
  const saved = await h.mcp.save({ server: amap(), expectedRevision: null });
  assert.equal(saved.server.status, 'connected'); assert.deepEqual(saved.server.tools, ['read', 'search']);
  assert.equal(JSON.stringify([...h.rows.values()]).includes('AMAP-SECRET'), false, '存储表里没有密钥');
  assert.equal(JSON.stringify(h.mcp.list()).includes('AMAP-SECRET'), false, '列表里没有密钥');
  assert.equal(h.mcp.list().servers[0].target, 'https://mcp.amap.com/mcp?key=•••');
  assert.deepEqual(h.records.get('whalewing/mcp-amap'), { kind: 'grant', payload: { env: {}, headers: {}, url: 'https://mcp.amap.com/mcp?key=AMAP-SECRET' } });
  assert.equal(h.mounted[0].config.url, 'https://mcp.amap.com/mcp?key=AMAP-SECRET', '连接时用的是真地址');
  assert.equal(h.mounted[0].config.failOnStartupError, true);
  contract.mcpResult.parse(h.mcp.list());
  const broken = await h.mcp.save({ server: { name: 'broken', title: '坏的', transport: 'streamable-http', url: 'https://example.com/mcp', env: [], headers: [{ name: 'Authorization', value: 'Bearer x', secret: true }] }, expectedRevision: null });
  assert.equal(broken.server.status, 'failed');
  assert.match(broken.server.error, /密钥不对、过期了或没有权限/);
  assert.equal(h.mounted.at(-1).disposed, true, '连不上的连接已释放');
});

test('编辑时密钥留空沿用原来的；名称重复、和 DSH 配置重名、版本对不上都拒绝', async () => {
  const h = harness({ profile: [{ serverName: 'github', transport: 'streamable-http', url: 'https://api.githubcopilot.com/mcp/' }] });
  await h.mcp.save({ server: { name: 'notion', title: 'Notion', transport: 'stdio', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'], env: [{ name: 'NOTION_TOKEN', value: 'ntn_1', secret: true }], headers: [] }, expectedRevision: null });
  const edited = await h.mcp.save({ server: { name: 'notion', title: 'Notion 公司', transport: 'stdio', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'], env: [{ name: 'NOTION_TOKEN', secret: true }], headers: [] }, expectedRevision: 0 });
  assert.equal(edited.server.title, 'Notion 公司'); assert.equal(edited.server.revision, 1);
  assert.deepEqual(h.records.get('whalewing/mcp-notion').payload.env, { NOTION_TOKEN: 'ntn_1' }, '密钥留空沿用原来的');
  assert.deepEqual(h.mounted.at(-1).config.env, { NOTION_TOKEN: 'ntn_1' });
  await assert.rejects(h.mcp.save({ server: { name: 'notion', title: 'x', transport: 'stdio', command: 'npx', env: [], headers: [] }, expectedRevision: null }), { code: 'MCP_NAME' });
  await assert.rejects(h.mcp.save({ server: { name: 'github', title: 'x', transport: 'streamable-http', url: 'https://a.b', env: [], headers: [] }, expectedRevision: null }), { code: 'MCP_NAME', message: /DSH 配置文件里已经有/ });
  await assert.rejects(h.mcp.save({ server: { name: 'notion', title: 'x', transport: 'stdio', command: 'npx', env: [], headers: [] }, expectedRevision: 0 }), { code: 'CONFLICT' });
  await assert.rejects(h.mcp.save({ server: { name: 'fresh', title: 'x', transport: 'stdio', command: 'npx', env: [{ name: 'KEY', secret: true }], headers: [] }, expectedRevision: null }), { code: 'MCP_SECRET' });
  assert.deepEqual(h.mcp.list().profile, [{ name: 'github', transport: 'streamable-http', target: 'https://api.githubcopilot.com/mcp/', enabled: true }]);
});

test('断开、重新连接、删除：删除时连凭据库里的密钥一起删；没有凭据库时带密钥的存不了', async () => {
  const h = harness();
  const saved = await h.mcp.save({ server: amap(), expectedRevision: null });
  const off = await h.mcp.setEnabled('amap', false, saved.server.revision);
  assert.equal(off.server.status, 'disabled'); assert.equal(h.mounted[0].disposed, true);
  await assert.rejects(h.mcp.reconnect('amap'), { code: 'MCP_DISABLED' });
  const on = await h.mcp.setEnabled('amap', true, off.server.revision);
  assert.equal(on.server.status, 'connected');
  assert.equal((await h.mcp.reconnect('amap')).server.status, 'connected');
  await h.mcp.remove('amap', on.server.revision);
  assert.equal(h.rows.size, 0); assert.equal(h.records.size, 0);
  assert.ok(h.mounted.every(item => item.disposed));
  delete h.services.credentials;
  await assert.rejects(h.mcp.save({ server: amap(), expectedRevision: null }), { code: 'MCP_NO_CREDENTIALS' });
});

test('连接失败的原因说成大白话', () => {
  const stdio = { transport: 'stdio', command: 'npx' };
  assert.match(explainConnect(Object.assign(new Error('failed'), { cause: new Error('spawn npx ENOENT') }), stdio), /找不到命令「npx」.*Node\.js/);
  assert.match(explainConnect(new Error('getaddrinfo ENOTFOUND x.y'), {}), /找不到这个地址/);
  assert.match(explainConnect(new Error('fetch failed'), {}), /连不上对方服务器/);
  assert.match(explainConnect(Object.assign(new Error('failed'), { cause: new Error('[ { "code": "invalid_union", "path": [ "jsonrpc" ] } ]') }), {}), /不是 MCP 的格式.*密钥/);
  assert.match(explainConnect(Object.assign(new Error('failed'), { cause: new Error('{"weird":1}') }), {}), /对方没说明原因/);
  assert.equal(maskUrl('https://u:p@mcp.amap.com/mcp?key=abc&x=1'), 'https://mcp.amap.com/mcp?key=•••&x=•••');
});

// 2026-11-09 实测：npx 第一次要下载程序，可能超过 DSH 等待的 60 秒。
test('本机程序第一次启动超时：再等两轮，起来了就算连上；三轮都超时才算连不上，并说明是下载慢', async () => {
  const rows = new Map();
  const table = { get: key => rows.get(key), entries: () => rows.entries(), put: async (key, value) => { rows.set(key, structuredClone(value)); }, delete: async key => { rows.delete(key); } };
  let attempts = 0, failUntil = 2;
  const ctx = { get: name => ({ tools: { definitions: () => [] } })[name], emit() {}, plugin() {
    attempts++;
    const fiber = attempts <= failUntil ? Promise.reject(Object.assign(new Error('mcp-client(x): initial connection failed'), { cause: new Error('Request timed out') })) : Promise.resolve();
    fiber.catch(() => {});
    return Object.assign(fiber, { dispose() {} });
  } };
  const mcp = new McpServers(ctx, table, { loadClient: async () => ({}) });
  const server = { name: 'slow', title: '慢', transport: 'stdio', command: 'npx', args: ['-y', 'slow-mcp'], env: [], headers: [] };
  assert.equal((await mcp.save({ server, expectedRevision: null })).server.status, 'connected');
  assert.equal(attempts, 3, '第三轮起来了');
  attempts = 0; failUntil = 5;
  assert.equal((await mcp.reconnect('slow')).server.status, 'failed');
  assert.equal(attempts, 3, '最多三轮');
  assert.match(mcp.list().servers[0].error, /第一次用要先下载/);
  // 远程服务超时不重试，直接说连不上。
  attempts = 0;
  await mcp.save({ server: { name: 'remote', title: '远程', transport: 'streamable-http', url: 'https://example.com/mcp', env: [], headers: [] }, expectedRevision: null });
  assert.equal(attempts, 1);
});
