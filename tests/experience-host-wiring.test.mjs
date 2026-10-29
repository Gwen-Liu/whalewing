import { mountFeatures } from './feature-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, stat, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import Whalewing from '../index.js';
import { selectedWorkspaces } from '../features/automation/automation.js';

const customId = 'custom-62a4fd50-8951-4133-b09c-4f92e6a48ae1';
const save = (revision = 0, name = '办公AI') => ({ action: 'save', id: customId, expectedRevision: revision, entry: { name, url: 'https://example.com/', description: '', avatar: null } });

function serviceIn(ctx, directory) {
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = path.join(directory, 'dsh');
  try { return new Whalewing(ctx, { vaultRoot: path.join(directory, 'vault') }); }
  finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; }
}
async function host(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-experience-host-'));
  const ctx = new Context(); new TypertRegistry(ctx);
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  const profile = options.profile ?? path.join(directory, 'profile'); await mkdir(profile, { recursive: true });
  const storage = options.storage ?? path.join(directory, 'storage');
  await ctx.plugin(Storage); await ctx.plugin(StorageJson, { root: storage }); await ctx.plugin(StorageDomain, { backend: 'json' });
  if (!options.noProfile) ctx.provide('profileContext', { dir: profile });
  ctx.provide('commands', { register() {} }); ctx.provide('sessions', {}); ctx.provide('sessionQuery', {});
  ctx.provide('sessionProjections', { register() {} }); ctx.provide('skills', {});
  const h = { ctx, directory, profile, storage };
  h.mount = async () => { Object.assign(h, await mountFeatures(ctx, directory)); return h.aiWebHost; };
  await h.mount(); return h;
}

test('AI的真实Typert声明指向独立whalewingAiWeb服务，懒域保存重载读回且不初始化知识', async t => {
  const h = await host(t);
  const registered = h.ctx.typert.getPackage('dsh-whalewing/ai-web');
  assert.ok(registered);
  const descriptor = h.ctx.typert.local.get('whalewingAiWeb/manageAiWeb');
  assert.deepEqual([descriptor.service, descriptor.namespace, descriptor.method], ['whalewingAiWeb', 'whalewingAiWeb', 'manageAiWeb']);
  assert.equal(h.aiWebHost.typertRemote.serviceKey, descriptor.service);
  assert.equal(h.aiWebHost.typertRemote.namespace, descriptor.namespace);
  assert.equal(h.aiWebHost.resource.owner, undefined);
  assert.equal((await h.ctx.get(descriptor.service)[descriptor.method](save())).entries.length, 11);
  assert.equal(await h.service.vault.initialized(), false);
  const previous = h.aiWebHost;
  await h.fiber.dispose();
  await assert.rejects(previous.manageAiWeb({ action: 'list' }), /卸载/);
  assert.equal(h.ctx.typert.getPackage('dsh-whalewing/ai-web'), undefined);
  await assert.rejects(stat(path.join(h.profile, 'whalewing-ai-web.lock')), { code: 'ENOENT' });
  await h.mount();
  assert.equal((await h.aiWebHost.manageAiWeb({ action: 'list' })).entries.find(item => item.id === customId).name, '办公AI');
});

test('缺少真实profile或输入不合法时不打开AI持久域，也不退到全局身份', async t => {
  const h = await host(t, { noProfile: true }); let opens = 0;
  h.ctx.storageDomain.open = async () => { opens++; throw new Error('不应到达'); };
  await assert.rejects(h.aiWebHost.manageAiWeb({ action: 'save', id: 'invalid', expectedRevision: 0, entry: {} }));
  await assert.rejects(h.aiWebHost.manageAiWeb({ action: 'list' }), error => error.code === 'PROFILE_UNAVAILABLE');
  assert.equal(opens, 0); assert.equal(h.aiWebHost.resource.owner, undefined); assert.equal(h.aiWebHost.resource.pending.size, 0);
});

test('同一存储根的不同真实profile隔离，重复profile持锁拒收后可恢复', async t => {
  const a = await host(t); await a.aiWebHost.manageAiWeb(save());
  const b = await host(t, { storage: a.storage });
  const same = await host(t, { storage: a.storage, profile: a.profile });
  try {
    assert.equal((await b.aiWebHost.manageAiWeb({ action: 'list' })).entries.length, 10);
    await assert.rejects(same.aiWebHost.manageAiWeb({ action: 'list' }), /lock|锁|busy|EEXIST/i);
    assert.equal(same.aiWebHost.resource.owner, undefined);
    await a.fiber.dispose();
    assert.equal((await same.aiWebHost.manageAiWeb({ action: 'list' })).entries.length, 11);
  } finally { await same.ctx.fiber.dispose(); await b.ctx.fiber.dispose(); }
});

test('AI初始化失败不发布owner，原入口可恢复且并发读取只打开一次', async t => {
  const h = await host(t), original = h.ctx.storageDomain.open.bind(h.ctx.storageDomain); let calls = 0;
  h.ctx.storageDomain.open = async spec => { if (++calls === 1) throw new Error('测试存储打开失败'); return original(spec); };
  await assert.rejects(h.aiWebHost.manageAiWeb({ action: 'list' }), /存储打开失败/);
  assert.equal(h.aiWebHost.resource.owner, undefined); assert.equal(h.aiWebHost.resource.pending.size, 0);
  const results = await Promise.all([h.aiWebHost.manageAiWeb({ action: 'list' }), h.aiWebHost.manageAiWeb({ action: 'list' })]);
  assert.equal(calls, 2); assert.deepEqual(results[0], results[1]);
});

test('AI持久写进行时拒收busy；提交后取消不报假失败，卸载等实际读回再关域', async t => {
  const h = await host(t); await h.aiWebHost.manageAiWeb({ action: 'list' });
  const table = h.aiWebHost.resource.owner.table, put = table.put.bind(table), entered = Promise.withResolvers(), release = Promise.withResolvers();
  table.put = async (...args) => { entered.resolve(); await release.promise; return put(...args); };
  const controller = new AbortController(); const operation = h.aiWebHost.manageAiWeb(save(), controller.signal);
  let disposal;
  try {
    await entered.promise;
    await assert.rejects(h.aiWebHost.manageAiWeb(save()), error => error.code === 'BUSY');
    controller.abort(new Error('提交后取消等待'));
    let disposed = false; disposal = h.fiber.dispose().then(() => { disposed = true; });
    await Promise.resolve(); assert.equal(disposed, false);
    release.resolve();
    const result = await operation; assert.equal(result.entries.find(item => item.id === customId).revision, 1);
    await disposal;
    assert.equal(h.aiWebHost.resource.pending.size, 0);
    await h.mount(); assert.equal((await h.aiWebHost.manageAiWeb({ action: 'list' })).entries.length, 11);
  } finally { release.resolve(); await Promise.allSettled([operation, disposal]); }
});

test('取消初始化等待不启动AI业务，卸载等迟到open并关闭域与锁', async t => {
  const h = await host(t), original = h.ctx.storageDomain.open.bind(h.ctx.storageDomain);
  const entered = Promise.withResolvers(), release = Promise.withResolvers(); let closed = 0;
  h.ctx.storageDomain.open = async spec => { entered.resolve(); await release.promise; const domain = await original(spec), close = domain.close.bind(domain); domain.close = async () => { closed++; await close(); }; return domain; };
  const controller = new AbortController(); const operation = h.aiWebHost.manageAiWeb(save(), controller.signal); let disposal;
  try {
    await entered.promise; controller.abort(new Error('取消初始化'));
    await assert.rejects(operation, /取消初始化/);
    disposal = h.fiber.dispose(); release.resolve(); await disposal;
    assert.equal(closed, 1); assert.equal(h.aiWebHost.resource.owner, undefined); assert.equal(h.aiWebHost.resource.pending.size, 0);
    await assert.rejects(stat(path.join(h.profile, 'whalewing-ai-web.lock')), { code: 'ENOENT' });
  } finally { release.resolve(); await Promise.allSettled([operation, disposal]); }
});

for (const [label, hostKey, method, lockName] of [
  ['AI', 'aiWebHost', 'manageAiWeb', 'whalewing-ai-web'],
  ['资讯', 'cards', 'manageNews', 'whalewing-news'],
]) test(`${label}真实Host业务dispose失败仍关闭原生域并放锁，重挂不复用旧实例`, async t => {
  const h = await host(t), feature = h[hostKey];
  await feature[method]({ action: 'list' });
  const { owner, domain } = feature.resource, dispose = owner.dispose.bind(owner), close = domain.close.bind(domain);
  let closed = false;
  owner.dispose = async () => { await dispose(); throw new Error('业务dispose失败'); };
  domain.close = async () => { await stat(path.join(h.profile, `${lockName}.lock`)); await close(); closed = true; };
  await assert.rejects(feature.resource.close(), /业务dispose失败/);
  assert.equal(closed, true);
  await assert.rejects(stat(path.join(h.profile, `${lockName}.lock`)), { code: 'ENOENT' });
  await assert.rejects(feature[method]({ action: 'list' }), /卸载/);
  await h.fiber.dispose(); await h.mount();
  await h[hostKey][method]({ action: 'list' });
  assert.notEqual(h[hostKey].resource.owner, owner);
});

test('工作区依赖只消费登记id/path/sessionIds，两个直接消费者共享真实成员，缺失与错误不伪空', async t => {
  const h = await host(t);
  await assert.rejects(h.automationHost.automation.dependencies.listWorkspaces(), error => error.code === 'WORKSPACE_UNAVAILABLE');
  const workspaces = [{ id: 'ws-a', path: path.join(h.directory, 'A'), sessionIds: ['one', 'two'], title: '不参与身份' }, { id: 'ws-b', path: path.join(h.directory, 'B'), sessionIds: ['three'] }];
  h.ctx.provide('workspaceRegistry', { list: () => workspaces });
  const expected = workspaces.map(workspace => ({ workspaceId: workspace.id, path: workspace.path, sessionIds: workspace.sessionIds }));
  assert.deepEqual(await h.service.core.dependencies.listWorkspaces(), expected);
  assert.deepEqual(await h.automationHost.automation.dependencies.listWorkspaces(), expected);
  assert.deepEqual(await selectedWorkspaces(h.service.core.dependencies, { mode: 'all', excludedWorkspaceIds: ['ws-b'] }), [expected[0]]);
  workspaces[0].sessionIds = ['changed']; assert.deepEqual((await h.service.core.dependencies.listWorkspaces())[0].sessionIds, ['changed']);
  h.ctx.get('workspaceRegistry').list = () => { throw new Error('宿主目录失败'); };
  await assert.rejects(h.service.core.dependencies.listWorkspaces(), /宿主目录失败/);
  const controller = new AbortController(); controller.abort(new Error('取消工作区读取'));
  await assert.rejects(h.automationHost.automation.dependencies.listWorkspaces(controller.signal), /取消工作区读取/);
});

test('书架经真实 Typert 声明进卡片服务，存在当前 profile 目录，首页学习区读书架且不碰知识库', async t => {
  const h = await host(t);
  const descriptor = h.ctx.typert.local.get('whalewingCards/manageLibrary');
  assert.deepEqual([descriptor.service, descriptor.namespace, descriptor.method], ['whalewingCards', 'whalewingCards', 'manageLibrary']);
  const call = input => h.ctx.get(descriptor.service)[descriptor.method](input);
  const group = (await call({ action: 'saveGroup', name: '工作' })).group;
  const stored = JSON.parse(await readFile(path.join(h.profile, 'whalewing-library', 'library.json'), 'utf8'));
  assert.deepEqual(stored.groups, [group]);
  const bytes = Buffer.from('第一章 起\n正文一\n第二章 承\n正文二');
  const { upload } = await call({ action: 'uploadStart', name: '书.txt', size: bytes.length });
  await call({ action: 'uploadChunk', upload: upload.id, offset: 0, data: bytes.toString('base64') });
  const { book } = await call({ action: 'uploadFinish', upload: upload.id, groups: [group.id] });
  assert.deepEqual([book.title, book.chapters, book.daily, book.groups], ['书', 2, true, [group.id]]);
  const owner = await h.cards.newsOwner();
  const learning = await owner.dependencies.learning(new AbortController().signal);
  assert.equal(learning.books[0].chapter.title, '第一章 起');
  assert.equal(learning.books[0].chapter.excerpt, '正文一');
  await assert.rejects(call({ action: 'image', id: book.id, name: '../library.json' }), error => error.name === 'RemoteError' || /ZodError|Invalid/.test(String(error.code ?? error.message)));
  await assert.rejects(call({ action: 'open', id: book.id, chapter: 5 }), /没有这一章/);
  assert.equal(await h.service.vault.initialized(), false, '书架不初始化知识库');
});

test('没有真实 profile 时书架不读写任何目录，也不退到全局位置', async t => {
  const h = await host(t, { noProfile: true });
  await assert.rejects(h.ctx.get('whalewingCards').manageLibrary({ action: 'list' }), /profile/i);
  await assert.rejects(stat(path.join(h.directory, 'whalewing-library')), { code: 'ENOENT' });
});
