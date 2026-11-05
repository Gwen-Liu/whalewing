import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, installSource, registryPlan, pickUpdate, checkUpdate, tarballOf } from '../src/update-check.js';
import { installReason } from '../src/shell/update.js';
import { fixture } from './client-fixture.mjs';

const tick = () => new Promise(setImmediate);
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => nodes(tree).flatMap(node => node.props?.children || []).filter(value => typeof value === 'string');
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && (node.props.children || []).includes(label));
const compatibleWith = runtime => manifest => manifest.engines?.dsh === runtime;
const doc = versions => ({ name: 'dsh-whalewing', versions: Object.fromEntries(versions.map(([version, dsh, extra = {}]) => [version, { name: 'dsh-whalewing', version, engines: { dsh }, dist: { tarball: `https://registry.example/dsh-whalewing/-/dsh-whalewing-${version}.tgz` }, ...extra }])), time: { '0.2.1-rc.5.4': '2026-11-06T00:00:00.000Z' } });

test('版本先后按 SemVer：预发布逐段比，数字段按数值，正式版高于同号预发布', () => {
  assert.equal(compareVersions('0.2.1-rc.5.10', '0.2.1-rc.5.9'), 1);
  assert.equal(compareVersions('0.2.1-rc.5.3', '0.2.1-rc.5.3'), 0);
  assert.equal(compareVersions('0.2.1-rc.5', '0.2.1-rc.5.1'), -1);
  assert.equal(compareVersions('0.2.1', '0.2.1-rc.9.9'), 1);
  assert.equal(compareVersions('0.2.1-rc.5.1', '0.2.1-stable.1'), -1, 'rc 在字母序上排在 stable 前');
  assert.equal(compareVersions('0.3.0-rc.1.1', '0.2.9'), 1);
  assert.throws(() => compareVersions('latest', '0.2.1'));
});

test('只有从 npm 版本号或安装包装的才在这里更新，本机目录装的说明去开发目录更新', () => {
  assert.equal(installSource('dsh-whalewing@0.2.1-rc.5.2'), 'registry');
  assert.equal(installSource('https://registry.npmmirror.com/dsh-whalewing/-/dsh-whalewing-0.2.1-rc.5.3.tgz'), 'tarball');
  assert.equal(installSource('file:E:/release/dsh-whalewing-0.2.1-rc.5.3.tgz'), 'tarball');
  assert.equal(installSource('link:E:/gwenliu/WhaleWing/plugins/whalewing'), 'local');
  assert.equal(installSource('file:E:/gwenliu/WhaleWing/plugins/whalewing'), 'local');
  assert.equal(installSource(undefined), 'unknown');
});

test('安装源顺序同 DSH：配置的或 pnpm 指向的在先，备用源在后，去重；读不到配置时问官方源和国内镜像', () => {
  assert.deepEqual(registryPlan({ registry: null, resolved: 'https://registry.npmjs.org', fallbackRegistries: ['https://registry.npmmirror.com/', 'https://registry.npmjs.org/'] }), ['https://registry.npmjs.org/', 'https://registry.npmmirror.com/']);
  assert.deepEqual(registryPlan({ registry: 'https://npm.corp.example/', resolved: 'https://registry.npmjs.org/', fallbackRegistries: [] }), ['https://npm.corp.example/']);
  assert.deepEqual(registryPlan({ registry: 'https://user:pw@npm.corp.example/', resolved: null, fallbackRegistries: ['ftp://x/'] }), ['https://registry.npmjs.org/', 'https://registry.npmmirror.com/'], '带凭据或非 http(s) 的地址不用');
  assert.deepEqual(registryPlan(undefined), ['https://registry.npmjs.org/', 'https://registry.npmmirror.com/']);
});

test('挑能装在当前 DSH 上的最高版本：比当前新才算有新版本，已弃用的不选，只有不兼容的更高版本时说明要先升级 DSH', () => {
  const versions = doc([['0.2.1-rc.3.3', '0.2.1-rc.3'], ['0.2.1-rc.5.3', '0.2.1-rc.5'], ['0.2.1-rc.5.4', '0.2.1-rc.5'], ['0.2.1-rc.5.5', '0.2.1-rc.5', { deprecated: '装不上' }], ['0.2.1-rc.6.1', '0.2.1-rc.6']]);
  const onRc5 = compatibleWith('0.2.1-rc.5');
  assert.deepEqual((({ status, version }) => ({ status, version }))(pickUpdate({ current: '0.2.1-rc.5.3', document: versions, compatible: onRc5 })), { status: 'available', version: '0.2.1-rc.5.4' });
  assert.deepEqual(pickUpdate({ current: '0.2.1-rc.5.4', document: versions, compatible: onRc5 }), { status: 'needs-dsh', version: '0.2.1-rc.6.1', requires: '0.2.1-rc.6' });
  assert.deepEqual(pickUpdate({ current: '0.2.1-rc.6.1', document: versions, compatible: compatibleWith('0.2.1-rc.6') }), { status: 'latest' });
  assert.equal(pickUpdate({ current: '0.2.1-rc.3.2', document: versions, compatible: compatibleWith('0.2.1-rc.3') }).version, '0.2.1-rc.3.3', '旧 DSH 上只给适配旧 DSH 的版本');
  assert.deepEqual(pickUpdate({ current: '0.2.1-rc.5.9', document: versions, compatible: onRc5 }).status, 'needs-dsh', '开发版本比 npm 上兼容的都新时不倒退');
  const withStable = doc([['0.3.0', '0.2.1-rc.5'], ['0.3.1-rc.1', '0.2.1-rc.5']]);
  assert.equal(pickUpdate({ current: '0.2.1-rc.5.3', document: withStable, compatible: onRc5 }).version, '0.3.0', '有正式版时先给正式版');
});

test('检查更新按安装源顺序问：超时或没有这个包就问下一个，给出作答源的安装包地址和其余源的同版本地址', async () => {
  const asked = [];
  const fetch = async (url, init) => {
    asked.push(url);
    assert.equal(init.headers.accept, 'application/json');
    if (url.startsWith('https://registry.npmjs.org/')) throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    if (url.startsWith('https://mirror-a.example/')) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(doc([['0.2.1-rc.5.3', '0.2.1-rc.5'], ['0.2.1-rc.5.4', '0.2.1-rc.5']])), { status: 200 });
  };
  const registries = { registry: null, resolved: 'https://registry.npmjs.org/', fallbackRegistries: ['https://mirror-a.example/', 'https://mirror-b.example/'] };
  const result = await checkUpdate({ current: '0.2.1-rc.5.3', source: 'dsh-whalewing@0.2.1-rc.5.3', registries, compatible: compatibleWith('0.2.1-rc.5'), fetch });
  assert.deepEqual(asked, ['https://registry.npmjs.org/dsh-whalewing', 'https://mirror-a.example/dsh-whalewing', 'https://mirror-b.example/dsh-whalewing']);
  assert.equal(result.status, 'available'); assert.equal(result.version, '0.2.1-rc.5.4'); assert.equal(result.registry, 'https://mirror-b.example/');
  assert.equal(result.tarball, 'https://registry.example/dsh-whalewing/-/dsh-whalewing-0.2.1-rc.5.4.tgz', '用安装源回复里的下载地址');
  assert.deepEqual(result.fallbacks, [tarballOf('https://registry.npmjs.org/', '0.2.1-rc.5.4'), tarballOf('https://mirror-a.example/', '0.2.1-rc.5.4')]);
  assert.equal(result.releaseUrl, 'https://github.com/gwen-liu/whalewing/releases/tag/v0.2.1-rc.5.4');
  assert.equal(result.publishedAt, '2026-11-06T00:00:00.000Z'); assert.equal(result.requires, '0.2.1-rc.5');
});

test('反例：本机目录装的不联网；所有安装源都问不到时写明问了哪些、各自原因；回复不是包信息也算问不到', async () => {
  let calls = 0;
  const local = await checkUpdate({ current: '0.2.1-rc.5.4', source: 'link:E:/dev/whalewing', registries: undefined, compatible: () => true, fetch: async () => { calls++; } });
  assert.deepEqual(local, { status: 'local', current: '0.2.1-rc.5.4' }); assert.equal(calls, 0);
  const failed = await checkUpdate({ current: '0.2.1-rc.5.4', source: 'dsh-whalewing@0.2.1-rc.5.4', registries: { registry: null, resolved: 'https://a.example/', fallbackRegistries: ['https://b.example/'] }, compatible: () => true,
    fetch: async url => url.startsWith('https://a.example/') ? new Response('nope', { status: 503 }) : new Response('<html>', { status: 200 }) });
  assert.equal(failed.status, 'failed'); assert.deepEqual(failed.asked, ['https://a.example/', 'https://b.example/']);
  assert.match(failed.reason, /a\.example：安装源回复 503/); assert.match(failed.reason, /b\.example：/);
  await assert.rejects(checkUpdate({ current: '0.2.1-rc.5.4', source: 'dsh-whalewing@0.2.1-rc.5.4', registries: undefined, compatible: () => true, fetch: async () => new Response('{}'), signal: AbortSignal.abort(new Error('员工离开')) }), /员工离开/);
});

test('DSH 安装失败的原因说成一句话', () => {
  assert.equal(installReason({ failedAt: 'spec-host' }), '下载地址连不上');
  assert.equal(installReason({ failedAt: 'registry' }), '安装源连不上');
  assert.equal(installReason({ error: { code: 'incompatible-version' } }), '新版本和当前 DSH 不兼容');
  assert.equal(installReason({ error: { code: 'operation-error', diagnostic: 'EPERM' } }), 'EPERM');
  assert.equal(installReason({}), '原因未知');
});

const subject = { kind: 'bundle', pkg: { name: 'dsh-whalewing' } };
const available = { status: 'available', current: '0.2.1-rc.5.4', runtimeVersion: '0.2.1-rc.5', registry: 'https://registry.npmmirror.com/', version: '0.2.1-rc.5.5', requires: '0.2.1-rc.5', tarball: 'https://registry.npmmirror.com/dsh-whalewing/-/dsh-whalewing-0.2.1-rc.5.5.tgz', fallbacks: ['https://registry.npmjs.org/dsh-whalewing/-/dsh-whalewing-0.2.1-rc.5.5.tgz'], releaseUrl: 'https://github.com/gwen-liu/whalewing/releases/tag/v0.2.1-rc.5.5' };
const section = f => f.render('plugins.detail.section', { subject, only: 'whalewing-update' });
async function updateFixture({ result = available, installs = [] } = {}) {
  const calls = { check: 0, install: [], cancel: [] };
  const f = await fixture({
    workbenchRemote: { async checkUpdate(...args) { assert.equal(args.length, 0); calls.check++; return { ok: true, value: result }; } },
    pluginManager: {
      async listBundles() { return { ok: true, value: [] }; },
      async installBundle(spec, options) { calls.install.push([spec, options]); return installs.shift() ?? { ok: true, value: { application: 'restart-required', version: result.version } }; },
      async cancelInstall(requestId) { calls.cancel.push(requestId); return { ok: true, value: 'cancelled' }; },
    },
  });
  return { f, calls };
}
const toast = f => text(f.render('shell.overlay')).join(' ');

test('详情页检查更新：已是最新只说一句，不弹窗；不在别的插件页出现', async () => {
  const { f, calls } = await updateFixture({ result: { status: 'latest', current: '0.2.1-rc.5.4', runtimeVersion: '0.2.1-rc.5' } });
  assert.equal(f.render('plugins.detail.section', { subject: { kind: 'bundle', pkg: { name: 'other' } }, only: 'whalewing-update' }), null);
  assert.equal(calls.check, 0, '打开详情页不自动联网');
  await button(section(f), '检查更新').props.onClick(); await tick();
  assert.equal(calls.check, 1);
  assert.ok(text(section(f)).includes('已是最新版本 0.2.1-rc.5.4'));
  assert.match(toast(f), /已是最新版本 0\.2\.1-rc\.5\.4/);
  assert.equal(button(section(f), '更新'), undefined); assert.equal(calls.install.length, 0);
  f.unmount();
});

test('有新版本：确认框写清版本、不卸载和重启生效，点更新交给 DSH 装安装包地址并保持启用', async () => {
  const { f, calls } = await updateFixture();
  await button(section(f), '检查更新').props.onClick(); await tick();
  const dialog = section(f);
  const words = text(dialog).join(' ');
  assert.match(words, /当前版本 0\.2\.1-rc\.5\.4，新版本 0\.2\.1-rc\.5\.5（适配 DSH 0\.2\.1-rc\.5）/);
  assert.match(words, /不用卸载/); assert.match(words, /装好后重启 DSH 生效/);
  assert.ok(nodes(dialog).some(node => node.type === 'a' && node.props.href === available.releaseUrl));
  await button(dialog, '更新').props.onClick(); await tick();
  assert.equal(calls.install.length, 1);
  const [spec, options] = calls.install[0];
  assert.equal(spec, available.tarball); assert.equal(options.enabled, true); assert.equal(options.registry, available.registry); assert.match(options.requestId, /^whalewing-update-/);
  assert.match(toast(f), /已更新到 0\.2\.1-rc\.5\.5，重启 DSH 后生效/);
  assert.ok(text(section(f)).includes('已装好 0.2.1-rc.5.5，重启 DSH 后生效'));
  assert.equal(button(section(f), '更新到 0.2.1-rc.5.5'), undefined, '装好后不再提供同一版本的更新');
  f.unmount();
});

test('反例：下载地址连不上换别的安装源的同一版本；DSH 报失败时旧版照常、写明原因可重试；停止后说明仍是旧版', async () => {
  const hostDown = { ok: true, value: { application: 'failed', failedAt: 'spec-host', error: { code: 'operation-error' } } };
  const diskFull = { ok: true, value: { application: 'failed', packageResult: { kind: 'disk-full' }, error: { code: 'operation-error' } } };
  const { f, calls } = await updateFixture({ installs: [hostDown, diskFull, { ok: true, value: { application: 'cancelled' } }] });
  await button(section(f), '检查更新').props.onClick(); await tick();
  await button(section(f), '更新').props.onClick(); await tick();
  assert.deepEqual(calls.install.map(([spec]) => spec), [available.tarball, available.fallbacks[0]]);
  assert.ok(text(section(f)).some(value => value.includes('更新没有完成，鲸翼仍是 0.2.1-rc.5.4：磁盘空间不足')));
  await button(section(f), '重试').props.onClick(); await tick();
  assert.equal(calls.install.length, 3);
  assert.match(toast(f), /已停止更新，鲸翼仍是 0\.2\.1-rc\.5\.4/);
  f.unmount();
});

test('反例：新版本要先升级 DSH、本机目录安装、安装源都问不到时只提示，不弹确认框；问不到的可重试', async () => {
  for (const [result, pattern] of [
    [{ status: 'needs-dsh', current: '0.2.1-rc.5.4', runtimeVersion: '0.2.1-rc.5', version: '0.2.1-rc.6.1', requires: '0.2.1-rc.6' }, /新版本 0\.2\.1-rc\.6\.1 需要 DSH 0\.2\.1-rc\.6，当前 DSH 是 0\.2\.1-rc\.5/],
    [{ status: 'local', current: '0.2.1-rc.5.4', runtimeVersion: '0.2.1-rc.5' }, /本机目录装的/],
    [{ status: 'failed', current: '0.2.1-rc.5.4', runtimeVersion: '0.2.1-rc.5', reason: 'registry.npmjs.org：超时' }, /没有问到安装源：registry\.npmjs\.org：超时/],
  ]) {
    const { f, calls } = await updateFixture({ result });
    await button(section(f), '检查更新').props.onClick(); await tick();
    assert.match(toast(f), pattern);
    assert.equal(button(section(f), '更新'), undefined); assert.equal(calls.install.length, 0);
    if (result.status === 'failed') { await button(f.render('shell.overlay'), '重试').props.onClick(); await tick(); assert.equal(calls.check, 2); }
    f.unmount();
  }
});

test('鲸翼页头“…”里检查更新，确认框开在工作台里，不同时出现在插件详情页', async () => {
  const { f, calls } = await updateFixture();
  const menuButton = tree => nodes(tree).find(node => node.type === 'button' && (node.props.children || []).includes('检查更新'));
  await menuButton(f.render()).props.onClick(); await tick();
  assert.equal(calls.check, 1);
  assert.ok(button(f.render(), '更新'), '工作台里出现确认框');
  assert.equal(button(section(f), '更新'), undefined, '详情页不重复弹');
  assert.ok(button(section(f), '更新到 0.2.1-rc.5.5'));
  f.unmount();
});
