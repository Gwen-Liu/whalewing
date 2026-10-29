import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { renderArtifacts } from '../scripts/build.mjs';
import { loadModelWorldPortraits, loadLargePortrait, largePortraitChunk, largePortraitChunks } from '../src/model-world-portraits.js';
import { modelWorldPortraitIds } from '../src/model-world-roster.js';
import { loadExpertAvatars } from '../src/expert-avatars.js';
import { parts } from '../features/index.js';
import { worldAttributions } from '../features/model-world/model-world.js';
import { fixture } from './client-fixture.mjs';

const artifacts = renderArtifacts();
const utilityNotice = (await readFile(new URL('../content/utilities/THIRD_PARTY_NOTICES.txt', import.meta.url), 'utf8')).replaceAll('*/', '* /').replace(/[ \t]+$/gm, '');
const nativeSource = await readFile(new URL('client.js', import.meta.resolve('@deepseek-ai/dsh-client-modules')), 'utf8');
const compiledScripts = new Map();
function script(source) {
  // 只按完整文本复用解析产物；缺注册响应和换代仍在各自独立上下文重新执行。
  if (!compiledScripts.has(source)) compiledScripts.set(source, new vm.Script(source));
  return compiledScripts.get(source);
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const button = (f, text) => { const found = nodes(f.render()).find(node => node.type === 'button' && node.props.children?.includes(text)); assert.ok(found, text); return found; };
const frame = (revision, omitted = []) => ({ revision, features: parts.map((part, index) => ({ instance: index + 1, id: part.id, kind: part.kind, api: 1, package: 'dsh-whalewing', skills: [] })).filter(part => !omitted.includes(part.id)) });
async function tick(f) { f.render(); f.flushEffects(); await new Promise(setImmediate); f.render(); }

// 只替换脚本传输；缓存、注册、工厂和换代都执行目标DSH真实模块系统。
async function loader(transport) {
  let native, ownerRequire;
  const target = { mode: 'queue', pendingQueue: [], load: value => { native = value; } };
  const sandbox = vm.createContext({ window: { __ModuleLoader__: target } });
  script(nativeSource).runInContext(sandbox);
  const kernel = native.factory(() => { throw new Error('原生模块内核不应导入平台依赖'); });
  const requests = [], packageId = 'dsh-whalewing';
  const row = { id: packageId, url: 'plugins/??dsh-whalewing/client.js&rev=first', rev: 'first', inject: [], external: [] };
  const system = kernel.createClientModuleSystem(target, { id: native.id, exports: kernel }, {
    boot: { rev: 'first', entries: [row], batches: [{ phase: 'application', url: row.url, rev: row.rev, entries: [row.id] }] },
    staticModules: { react: {} },
    async loadBundle(url) {
      requests.push(url);
      const name = url.includes('/??') ? 'client.js' : new URL(url, 'http://fixture/').pathname.split('/').at(-1);
      const source = await transport?.(url, name, requests.length) ?? artifacts[name];
      assert.equal(typeof source, 'string');
      script(source).runInContext(sandbox);
    },
  });
  const register = target.load;
  target.load = value => register(value.chunk ? value : { ...value, factory(require) { ownerRequire = require; return value.factory(require); } });
  await system.import(packageId);
  return { system, requests, target, sandbox, load: name => ownerRequire.async('./' + name), row };
}

// 三块浏览器脚本合计上限。2026-10-25 0.1.1 办公工坊字体裁成常用字子集后重定基线：
// 实测 client.js 1,167,699 + client.model-world.js 746,690 + client.toolbox.js 12,651,308 = 14,565,697 字节，加 256 KiB 余量。
const browserBudget = 14827841;
test('入口与所有浏览器脚本总量均不超过体积基线，资源完整且入口最后发布', () => {
  const bytes = Object.entries(artifacts).filter(([name]) => /^client(?:\..+)?\.js$/.test(name) && !largePortraitChunks.includes(name)).map(([name, text]) => ({ name, bytes: Buffer.byteLength(text) }));
  assert.deepEqual(bytes.map(item => item.name).sort(), ['client.js', 'client.model-world.js', 'client.toolbox.js']);
  assert.ok(Buffer.byteLength(artifacts['client.js']) <= browserBudget);
  assert.ok(bytes.reduce((total, item) => total + item.bytes, 0) <= browserBudget, JSON.stringify(bytes));
  assert.equal(Object.keys(artifacts).at(-1), 'client.js');
  for (const data of Object.values(loadModelWorldPortraits())) { assert.ok(artifacts['client.model-world.js'].includes(data)); assert.ok(!artifacts['client.js'].includes(data)); }
  for (const data of Object.values(loadExpertAvatars())) assert.ok(artifacts['client.js'].includes(data));
  assert.ok(artifacts['client.toolbox.js'].startsWith(`/*!\n${utilityNotice}\n*/\n`), '完整批准许可随实际Worker分发');
  assert.ok(!artifacts['client.js'].includes(utilityNotice));
});

// 2026-10-27 立绘查看大图：19 张 4K 原图各一个按需分块，只在员工点开那一张时下载，不计入上面三块常驻脚本的基线。
// 实测单块最大 1,085,118 字节、合计 16,053,865 字节（约 15.3 MiB）。
test('立绘大图每张一个分块，只含自己那张并带许可声明，单块和合计体积有界', () => {
  assert.deepEqual(Object.keys(artifacts).filter(name => name.startsWith('client.portrait-')).sort(), [...largePortraitChunks].sort());
  let total = 0;
  for (const id of modelWorldPortraitIds) {
    const source = artifacts[largePortraitChunk(id)], data = loadLargePortrait(id), size = Buffer.byteLength(source);
    assert.ok(source.startsWith('/*! 立绘 © 鲸翼 WhaleWing，依 CC BY-NC-SA 4.0 授权'), id);
    assert.ok(source.includes(JSON.stringify(data)), id);
    for (const other of ['client.js', 'client.model-world.js', 'client.toolbox.js']) assert.ok(!artifacts[other].includes(data), `${id} 不进 ${other}`);
    assert.ok(size <= 1.1 * 1024 * 1024, `${id} ${size}`); total += size;
  }
  assert.ok(total <= 16.5 * 1024 * 1024, String(total));
});

test('真实原生loader按需取得立绘大图分块，得到那张立绘的数据地址', async () => {
  const f = await loader();
  const chunk = await f.load('client.portrait-openai.js');
  assert.equal(chunk.source, loadLargePortrait('openai'));
  assert.match(f.requests.at(-1), /client\.portrait-openai\.js\?rev=first$/);
  assert.equal(await f.load('client.portrait-openai.js'), chunk, '同一张只下载一次');
});

test('真实原生loader仅按需下载，同flight合并，工厂同步且成功缓存复用', async () => {
  const gate = Promise.withResolvers();
  const f = await loader(async (_url, name) => { if (name === 'client.toolbox.js') await gate.promise; });
  assert.equal(f.requests.length, 1);
  const a = f.load('client.toolbox.js'), b = f.load('client.toolbox.js');
  assert.equal(f.requests.length, 2); gate.resolve();
  const [first, second] = await Promise.all([a, b]);
  assert.equal(first, second); assert.equal(typeof first.createViews, 'function');
  assert.equal(await f.load('client.toolbox.js'), first); assert.equal(f.requests.length, 2);
  const world = await f.load('client.model-world.js'); assert.equal(typeof world.createView, 'function');
  assert.equal(typeof world.then, 'undefined');
  assert.match(f.requests[1], /client\.toolbox\.js\?rev=first$/);
});

test('真实原生loader下载失败和未注册均可重新请求，不缓存拒绝Promise', async () => {
  for (const failure of ['transport', 'registration']) {
    let tries = 0;
    const f = await loader((_url, name) => { if (name === 'client.toolbox.js' && ++tries === 1) { if (failure === 'transport') throw new Error('传输中断'); return '// 缺少注册'; } });
    await assert.rejects(f.load('client.toolbox.js'));
    assert.equal(typeof (await f.load('client.toolbox.js')).createViews, 'function'); assert.equal(tries, 2);
  }
});

test('真实原生loader同步工厂失败重试同工厂，换代后重新下载新revision', async () => {
  const f = await loader(); let calls = 0;
  f.target.load({ id: 'dsh-whalewing', chunk: 'client.probe.js', factory() { if (++calls === 1) throw new Error('工厂失败'); return { ok: true }; } });
  await assert.rejects(f.load('client.probe.js'), /工厂失败/);
  assert.equal((await f.load('client.probe.js')).ok, true); assert.equal(calls, 2); assert.equal(f.requests.length, 1);
  await f.load('client.model-world.js');
  f.system.invalidate('dsh-whalewing', 'second');
  await f.load('client.model-world.js'); assert.match(f.requests.at(-1), /rev=second$/);
});

test('真实原生loader丢弃旧代在途结果，按新revision重新取得分块', async () => {
  const gate = Promise.withResolvers(); let calls = 0;
  const f = await loader(async (_url, name) => { if (name === 'client.model-world.js' && ++calls === 1) await gate.promise; });
  const loading = f.load('client.model-world.js');
  f.system.invalidate('dsh-whalewing', 'second'); gate.resolve();
  assert.equal(typeof (await loading).createView, 'function'); assert.equal(calls, 2);
  assert.match(f.requests.at(-1), /rev=second$/);
});

test('模型世界把立绘编号换成对应的大图分块，格式不对的编号不发请求', async t => {
  const calls = []; let options, f;
  f = await fixture({ loadChunk: async name => { calls.push(name); return name === './client.model-world.js' ? { createView: (React, value) => { options = value; return () => React.createElement('span', null, '分块已显示'); } } : { source: `data:${name}` }; } });
  t.after(() => f.unmount());
  await button(f, '模型世界').props.onClick(); await tick(f);
  assert.equal(await options.loadLarge('deepseek-flash'), 'data:./client.portrait-deepseek-flash.js');
  await assert.rejects(options.loadLarge('../client'), /立绘编号无效/);
  assert.deepEqual(calls, ['./client.model-world.js', './client.portrait-deepseek-flash.js']);
});

for (const [id, label, method] of [['toolbox', '办公工坊', 'createViews'], ['model-world', '模型世界', 'createView']]) {
  const module = (React, mounted) => {
    const ChunkProbeView = props => { mounted.push(props); return React.createElement('span', null, '分块已显示'); };
    return { [method]: () => method === 'createViews' ? { ToolboxView: ChunkProbeView } : ChunkProbeView };
  };
  test(`${label}启用不下载，首次展示才加载，失败在原位置及右上角提供显式重试`, async t => {
    const calls = [], mounted = []; let fail = true, f;
    f = await fixture({ expand: ['ChunkProbeView'], loadChunk: async name => { calls.push(name); if (fail) throw new Error('离线'); return module(f.react, mounted); } }); t.after(() => f.unmount());
    await tick(f); assert.equal(calls.length, 0);
    await button(f, label).props.onClick(); await tick(f); assert.equal(calls.length, 1);
    assert.ok(JSON.stringify(f.render()).includes(`「${label}」加载未完成`));
    fail = false; button(f, '重新加载').props.onClick(); await tick(f);
    assert.equal(calls.length, 2); assert.ok(JSON.stringify(f.render()).includes('分块已显示'));
    await tick(f); assert.equal(calls.length, 2);
  });
  for (const action of ['leave', 'cancel', 'disable', 'unmount']) test(`${label}在途${action}不接收迟到资源，后续明确访问仍可加载`, async t => {
    const pending = Promise.withResolvers(), calls = [], mounted = []; let f;
    f = await fixture({ expand: ['ChunkProbeView'], loadChunk: name => { calls.push(name); return calls.length === 1 ? pending.promise : Promise.resolve(module(f.react, mounted)); } }); t.after(() => f.unmount());
    await button(f, label).props.onClick(); await tick(f); assert.equal(calls.length, 1);
    if (action === 'leave') await button(f, '专家团队').props.onClick();
    if (action === 'cancel') button(f, '停止等待').props.onClick();
    if (action === 'disable') await f.featureUpdate(frame(1, [id]));
    if (action === 'unmount') f.unmount(); else await tick(f);
    pending.resolve(module(f.react, mounted)); await new Promise(setImmediate);
    if (action !== 'unmount') { f.render(); assert.equal(mounted.length, 0); }
    else { assert.equal(mounted.length, 0); return; }
    if (action === 'disable') { await f.featureUpdate(frame(2)); await tick(f); assert.equal(calls.length, 1); }
    if (action === 'cancel') button(f, '重新加载').props.onClick(); else await button(f, label).props.onClick();
    await tick(f); assert.ok(JSON.stringify(f.render()).includes('分块已显示')); assert.equal(calls.length, 2);
  });
}

for (const mode of ['源码', '生成物']) test(`${mode}相同编译产物的两个fixture保持状态、取消与清理隔离`, async t => {
  async function instance(name) {
    const pending = [], mounted = [];
    let f, closed = false;
    f = await fixture({ ...(mode === '生成物' ? { clientSource: artifacts['client.js'] } : {}), expand: ['ChunkProbeView'],
      loadChunk: name => { assert.equal(name, './client.toolbox.js'); const gate = Promise.withResolvers(); pending.push(gate); return gate.promise; } });
    const ChunkProbeView = () => {
      const [count, setCount] = f.react.useState(0);
      mounted.push(count);
      return f.react.createElement('button', { onClick: () => setCount(value => value + 1) }, `${name}计数${count}`);
    };
    const resolve = index => pending[index].resolve({ createViews: () => ({ ToolboxView: ChunkProbeView }) });
    const close = async () => { if (closed) return; closed = true; f.unmount(); for (const dispose of [...f.disposed].reverse()) await dispose(); };
    t.after(close);
    return { f, pending, mounted, resolve, close };
  }
  const a = await instance('甲'), b = await instance('乙');
  for (const key of ['plugin', 'react', 'ctx', 'browser', 'document', 'timers', 'storage', 'disposed']) assert.notEqual(a.f[key], b.f[key], key);
  a.f.storage.set('隔离', '甲'); assert.equal(b.f.storage.has('隔离'), false);
  await button(a.f, '办公工坊').props.onClick(); await tick(a.f);
  assert.equal(a.pending.length, 1); assert.equal(b.pending.length, 0);
  await button(b.f, '办公工坊').props.onClick(); await tick(b.f);
  button(a.f, '停止等待').props.onClick(); await tick(a.f);
  a.resolve(0); await tick(a.f); assert.equal(a.mounted.length, 0);
  assert.equal(b.pending.length, 1); assert.equal(b.mounted.length, 0);
  b.resolve(0); await tick(b.f);
  button(b.f, '乙计数0').props.onClick(); await tick(b.f); button(b.f, '乙计数1');
  button(a.f, '重新加载').props.onClick(); await tick(a.f);
  assert.equal(a.pending.length, 2); a.resolve(1); await tick(a.f); button(a.f, '甲计数0');
  const styles = [...b.f.document.head.children], timers = [...b.f.timers];
  assert.ok(styles.length > 0);
  await a.close();
  assert.equal(a.f.document.head.children.length, 0);
  assert.deepEqual(b.f.document.head.children, styles); assert.deepEqual([...b.f.timers], timers);
  button(b.f, '乙计数1');
  await b.close(); assert.equal(b.f.document.head.children.length, 0);
});

// 真实产物走同一工作台fixture，不用假视图掩盖分块导出或参数接线错误。
test('真实生成主入口与两个分块展示办公工坊和模型页，默认加载不取得重资源', async t => {
  const f = await fixture({ clientSource: artifacts['client.js'], chunkSources: artifacts,
    world: async input => ({ ok: true, value: { action: input.action, available: false, refreshing: false,
      acceptedAt: null, generatedAt: null, sources: {}, modelCount: 0, vendors: [], leagues: [],
      lastRefresh: null, attributions: structuredClone(worldAttributions), index: { source: 'bundled', asOf: '2026-10-21', version: '4.3', key: 'none', error: null }, models: [], total: 0, offset: 0, limit: 12, unknownDates: 0 } }) });
  t.after(() => f.unmount());
  assert.equal(f.calls.filter(([kind]) => kind === 'world').length, 0);
  await button(f, '办公工坊').props.onClick();
  for (let i = 0; i < 3; i++) await tick(f);
  assert.ok(nodes(f.render()).some(node => node.type === 'input' && node.props['aria-label'] === '搜索功能项'));
  await button(f, '模型世界').props.onClick();
  for (let i = 0; i < 3; i++) await tick(f);
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'world'), [['world', { action: 'list', limit: 12, offset: 0 }]]);
  assert.ok(JSON.stringify(f.render()).includes('更新数据'));
  assert.ok(!JSON.stringify(f.render()).includes('worldView.'));
});
