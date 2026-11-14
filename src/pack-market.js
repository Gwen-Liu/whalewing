import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abort, fail } from './vault.js';
import { skillArea } from './skill-files.js';
import { filesFromZip, readPack } from './plugin-packs.js';

// 插件包的“发现”：鲸翼精选（随鲸翼一起发的），以及员工自己加的 GitHub 插件包市场。
// 市场就是 Claude 插件市场的格式：仓库里 .claude-plugin/marketplace.json 列出每个包和它放在哪。鲸翼只从 GitHub 下载，
// npm、命令行装的和放在 GitHub 以外的包标“暂不支持”。
export const curatedRoot = fileURLToPath(new URL('../content/packs', import.meta.url));
// 默认只有鲸翼精选（2026-11-09 用户定：不要 Anthropic 的市场，里面的包多数 MCP 在 DSH 上连不上）；员工可以自己加 GitHub 上的市场。
export const builtinMarkets = [
  { id: 'whalewing', title: '鲸翼精选', kind: 'local' },
];
const marketsFile = `${skillArea}/pack-markets.json`;
const maxZipBytes = 80 * 1024 * 1024;
const local = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
const clip = (value, size) => typeof value === 'string' ? value.trim().slice(0, size) : '';

/** GitHub 仓库：接受 owner/repo、https://github.com/owner/repo 和带 .git 的写法。 */
export function githubRepo(value) {
  const text = String(value ?? '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const match = /^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})$/.exec(text);
  return match && !match[1].endsWith('/.') && !match[1].endsWith('/..') ? match[1] : null;
}

/** 市场里一个包放在哪：同一个仓库里的文件夹、另一个 GitHub 仓库（可带子文件夹和版本）；别的方式说明为什么装不了。 */
export function resolveSource(market, plugin, pluginRoot = '') {
  const source = plugin?.source;
  const safe = value => !local(value).split('/').includes('..');
  if (typeof source === 'string') {
    if (!safe(source) || /^[a-z]+:/i.test(source)) return { error: '包的位置写得不对' };
    const full = [local(pluginRoot), local(source)].filter(Boolean).join('/');
    return market.kind === 'local' ? { kind: 'local', path: full } : { kind: 'github', repo: market.repo, ref: market.ref, path: full };
  }
  const kind = source?.source;
  if (kind === 'github' || kind === 'url' || kind === 'git-subdir') {
    const repo = githubRepo(kind === 'github' ? source.repo : source.url);
    if (!repo) return { error: '这个包放在 GitHub 以外的地方，鲸翼暂时只会从 GitHub 下载' };
    if (source.path !== undefined && !safe(source.path)) return { error: '包的位置写得不对' };
    const ref = [source.sha, source.ref].find(value => typeof value === 'string' && /^[A-Za-z0-9._/-]{1,200}$/.test(value) && !value.includes('..'));
    return { kind: 'github', repo, ...(ref ? { ref } : {}), path: local(source.path) };
  }
  if (kind === 'npm' || kind === 'pip') return { error: '这个包要用 npm 或 pip 装，鲸翼暂时不支持' };
  return { error: '这个包要用命令行装，鲸翼暂时不支持' };
}

/** 市场清单里的一条，整理成卡片要的样子。放在市场自己仓库里的（own）是市场主人自己的包，作者没写时就是市场主人。 */
function entryOf(market, plugin, pluginRoot, owner) {
  const name = clip(plugin?.name, 64);
  if (!name) return null;
  const resolved = resolveSource(market, plugin, pluginRoot);
  return {
    id: `${market.id}:${name}`, market: market.id, name, title: clip(plugin.displayName, 80) || name, description: clip(plugin.description, 600),
    author: clip(typeof plugin.author === 'string' ? plugin.author : plugin.author?.name, 80) || (typeof plugin.source === 'string' ? owner : ''), category: clip(plugin.category, 40),
    ...(typeof plugin.source === 'string' ? { own: true } : {}),
    ...(/^https:\/\//.test(plugin.homepage ?? '') ? { homepage: clip(plugin.homepage, 500) } : {}),
    installable: !resolved.error, ...(resolved.error ? { reason: resolved.error } : {}),
  };
}

export class PackMarket {
  constructor(packs, { fetch: fetchImpl = globalThis.fetch, timeoutMs = 30000, now = () => Date.now(), curated = curatedRoot } = {}) {
    this.packs = packs; this.files = packs.files; this.fetch = fetchImpl; this.timeoutMs = timeoutMs; this.now = now; this.curated = curated;
    this.cache = new Map(); this.zips = new Map(); this.stages = new Map();
  }

  async request(url, signal, kind) {
    let response;
    try { response = await this.fetch(url, { redirect: 'follow', signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) }); }
    catch (error) {
      abort(signal);
      fail('PACK_NETWORK', error?.name === 'TimeoutError' ? '连 GitHub 超时了：国内网络可能要开代理，稍后重试' : `连不上 GitHub：${error?.message || error}；国内网络可能要开代理`);
    }
    if (response.status === 404) fail('PACK_MISSING', kind === 'market' ? '这个仓库里没有插件包市场清单（.claude-plugin/marketplace.json），或者仓库不公开' : 'GitHub 上找不到这个包了，可能被作者删掉或改名');
    if (response.status === 403 || response.status === 429) fail('PACK_BUSY', 'GitHub 说请求太频繁，请过几分钟再试');
    if (!response.ok) fail('PACK_NETWORK', `GitHub 暂时没响应（${response.status}），请稍后重试`);
    if (kind === 'market') {
      try { return JSON.parse(await response.text()); } catch { abort(signal); fail('PACK_REPLY', '市场清单不是合法的 JSON'); }
    }
    const length = Number(response.headers?.get?.('content-length') ?? 0);
    if (length > maxZipBytes) fail('PACK_SIZE', '这个仓库太大了（超过 80 MB），鲸翼不下载');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxZipBytes) fail('PACK_SIZE', '这个仓库太大了（超过 80 MB），鲸翼不下载');
    return bytes;
  }

  /** 员工自己加的市场（GitHub 仓库），存在技能目录的鲸翼区。 */
  async userMarkets() {
    const raw = await this.files.read(marketsFile).catch(() => null);
    try { const list = raw ? JSON.parse(raw.content) : []; return Array.isArray(list) ? list.filter(item => githubRepo(item?.repo)).map(item => ({ id: `github:${item.repo.toLowerCase()}`, title: clip(item.title, 80) || item.repo, kind: 'github', repo: item.repo, removable: true })) : []; }
    catch { return []; }
  }

  async markets() { return [...builtinMarkets, ...await this.userMarkets()]; }

  /** 读一个市场的清单：本地的读文件，GitHub 的半小时内用上次读到的。 */
  async catalog(market, refresh, signal) {
    const cached = this.cache.get(market.id);
    if (!refresh && cached && (market.kind === 'local' || this.now() - cached.at < 1800000)) return cached;
    let value;
    if (market.kind === 'local') {
      try { value = JSON.parse(await fs.readFile(path.join(this.curated, '.claude-plugin', 'marketplace.json'), 'utf8')); }
      catch { fail('PACK_REPLY', '鲸翼精选的清单读不出来，请重装鲸翼'); }
    } else value = await this.request(`https://raw.githubusercontent.com/${market.repo}/HEAD/.claude-plugin/marketplace.json`, signal, 'market');
    const plugins = Array.isArray(value?.plugins) ? value.plugins.slice(0, 500) : [];
    const pluginRoot = value?.metadata?.pluginRoot ?? value?.pluginRoot ?? '';
    const raw = new Map(plugins.filter(plugin => typeof plugin?.name === 'string').map(plugin => [plugin.name, plugin]));
    const owner = clip(typeof value?.owner === 'string' ? value.owner : value?.owner?.name, 80);
    const entries = plugins.map(plugin => entryOf(market, plugin, pluginRoot, owner)).filter(Boolean);
    const result = { at: this.now(), entries, raw, pluginRoot, title: clip(value?.name, 80) };
    this.cache.set(market.id, result);
    return result;
  }

  /**
   * 发现页：每个市场一栏；读不到的那一栏写原因，不影响别的市场。
   * 不带 only 时只给马上拿得到的（鲸翼精选、半小时内读过的），GitHub 上还没读的标 loading，页面再逐个用 only 来要，慢的不拖住快的。
   */
  async home(refresh, signal, only) {
    const markets = (await this.markets()).filter(market => !only || market.id === only);
    if (only && !markets.length) fail('PACK_MISSING', '这个市场已经移除了，请刷新');
    return Promise.all(markets.map(async market => {
      const base = { id: market.id, title: market.title, kind: market.kind, ...(market.repo ? { repo: market.repo } : {}), ...(market.removable ? { removable: true } : {}) };
      const cached = this.cache.get(market.id);
      if (!only && market.kind !== 'local' && (refresh || !cached || this.now() - cached.at >= 1800000)) {
        if (refresh) this.cache.delete(market.id);
        return { ...base, entries: [], loading: true };
      }
      try { const { entries } = await this.catalog(market, refresh, signal); return { ...base, entries }; }
      catch (error) { abort(signal); return { ...base, entries: [], issue: String(error.message).replace(/^[A-Z_]+: /, '') }; }
    }));
  }

  async addMarket(value, signal) {
    const repo = githubRepo(value);
    if (!repo) fail('PACK_INPUT', '填 GitHub 仓库，比如 owner/repo 或 https://github.com/owner/repo');
    const list = await this.userMarkets();
    if ([...builtinMarkets, ...list].some(market => market.repo?.toLowerCase() === repo.toLowerCase())) fail('PACK_INPUT', '这个市场已经在了');
    if (list.length >= 20) fail('PACK_INPUT', '最多加 20 个市场');
    const market = { id: `github:${repo.toLowerCase()}`, title: repo, kind: 'github', repo, removable: true };
    const { entries, title } = await this.catalog(market, true, signal);
    if (!entries.length) fail('PACK_INPUT', '这个仓库的市场清单里一个包也没有');
    await this.files.locked(() => this.files.atomic(marketsFile, `${JSON.stringify([...list.map(item => ({ repo: item.repo, title: item.title })), { repo, title: title || repo }], null, 2)}\n`, signal), signal);
    return this.home(false, signal);
  }

  async removeMarket(id, signal) {
    const list = await this.userMarkets();
    if (!list.some(market => market.id === id)) fail('PACK_INPUT', '只能移除你自己加的市场');
    await this.files.locked(() => this.files.atomic(marketsFile, `${JSON.stringify(list.filter(market => market.id !== id).map(item => ({ repo: item.repo, title: item.title })), null, 2)}\n`, signal), signal);
    this.cache.delete(id);
    return this.home(false, signal);
  }

  /** 下载 GitHub 仓库的压缩包，取其中一个文件夹；同一仓库同一版本十分钟内用下载过的。 */
  async githubFiles({ repo, ref, path: folder }, signal) {
    const key = `${repo}@${ref ?? 'HEAD'}`;
    let cached = this.zips.get(key);
    if (!cached || this.now() - cached.at > 600000) {
      cached = { at: this.now(), bytes: await this.request(`https://codeload.github.com/${repo}/zip/${ref ?? 'HEAD'}`, signal, 'zip') };
      this.zips.set(key, cached);
      for (const [name, value] of this.zips) if (this.zips.size > 3 || this.now() - value.at > 600000) { if (name !== key) this.zips.delete(name); }
    }
    const list = filesFromZip(cached.bytes, { prefix: folder ?? '' });
    if (!list.length) fail('PACK_MISSING', '仓库里没找到这个包的文件夹，可能作者挪了位置');
    return list;
  }

  async localFiles(folder) {
    const base = path.join(this.curated, ...local(folder).split('/'));
    const list = [];
    const visit = async (absolute, relative) => {
      for (const item of await fs.readdir(absolute, { withFileTypes: true })) {
        const child = relative ? `${relative}/${item.name}` : item.name;
        if (item.isDirectory()) await visit(path.join(absolute, item.name), child);
        else if (item.isFile()) list.push({ path: child, bytes: await fs.readFile(path.join(absolute, item.name)) });
      }
    };
    try { await visit(base, ''); } catch { fail('PACK_MISSING', '鲸翼精选里这个包的文件不全，请重装鲸翼'); }
    return list;
  }

  /** 装之前先看：读出包里的技能、MCP 和要跳过的部分，暂存十分钟；安装时只装员工看过的这一份。 */
  async preview(input, signal) {
    let list, source, displayName;
    if (input.upload) {
      const bytes = Buffer.from(input.upload.data, 'base64');
      if (!bytes.length || bytes.length > 32 * 1024 * 1024) fail('PACK_SIZE', '上传的插件包最多 32 MB');
      if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) fail('PACK_FORMAT', '插件包要打包成 .zip 再上传');
      list = filesFromZip(bytes);
      source = { kind: 'upload', label: '上传', ...(clip(input.upload.fileName, 120) ? { entry: clip(input.upload.fileName, 120) } : {}) };
    } else {
      const market = (await this.markets()).find(item => item.id === input.entry.market);
      if (!market) fail('PACK_MISSING', '这个市场已经移除了，请刷新');
      const catalog = await this.catalog(market, false, signal);
      const plugin = catalog.raw.get(input.entry.name);
      if (!plugin) fail('PACK_MISSING', '市场里已经没有这个包了，请刷新');
      const resolved = resolveSource(market, plugin, catalog.pluginRoot);
      if (resolved.error) fail('PACK_SOURCE', resolved.error);
      list = resolved.kind === 'local' ? await this.localFiles(resolved.path) : await this.githubFiles(resolved, signal);
      displayName = clip(plugin.displayName, 80);
      source = { kind: market.kind === 'local' ? 'curated' : 'market', label: market.title, market: market.id, entry: input.entry.name, ...(resolved.repo ? { repo: resolved.repo, ...(resolved.ref ? { ref: resolved.ref } : {}), ...(resolved.path ? { path: resolved.path } : {}) } : {}) };
    }
    const pack = readPack(list, { rootFor: name => this.packs.absolute(name), displayName });
    const stage = pack.hash.slice(0, 40);
    for (const [key, value] of this.stages) if (this.now() - value.at > 600000) this.stages.delete(key);
    this.stages.set(stage, { at: this.now(), pack, source });
    return { stage, pack, source };
  }

  staged(stage, expectedHash) {
    const value = this.stages.get(stage);
    if (!value || this.now() - value.at > 600000) fail('PACK_STALE', '预览已经过期了，请重新打开这个包再装');
    if (value.pack.hash !== expectedHash) fail('PACK_CHANGED', '包的内容变了，请重新打开看一眼再装');
    return value;
  }

  forget(stage) { this.stages.delete(stage); }
}
