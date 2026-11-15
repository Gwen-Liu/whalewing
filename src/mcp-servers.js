import { createHash } from 'node:crypto';
import { z } from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { fail } from './vault.js';

// 技能中心页的 MCP（2026-11-15 用户选“方向三”，0.2.2-rc.3.2 起）：MCP 存进 DSH 自己的配置，鲸翼只当操作界面。
// DSH 0.2.2-rc.3 的 MCP 管理器（dsh-mcp-manager）管两种：配置里的（经 DSH 设置服务写进 profile 的 cordis.patch.yml），
// 和插件登记的（跟着登记它的插件走）。员工加的写进配置，卸载鲸翼也还在；插件包带的向管理器登记，跟着插件包走。
// 密钥按名字存进 DSH 凭据库，配置里只写 ${credential:名字}；换了密钥 DSH 自己重连。
// 鲸翼自己只记显示名称、来自哪个精选和插件包的定义（存储域按 profile 分开）。
export const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client';
export const MCP_MANAGER = '@deepseek-ai/dsh-mcp-manager';
export const serverNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** DSH 认的名字（配置文件里手写的可能有大写和下划线）。 */
export const dshNamePattern = /^[A-Za-z0-9_-]{1,32}$/;
const text = z.string();

// 0.2.2-rc.3.1 及以前：鲸翼自己挂连接，定义存这个存储域、密钥存一条 whalewing/mcp-<名字> 记录。只用来搬家。
const pair = z.strictObject({ name: text.trim().min(1).max(200), value: text.max(8000).optional(), secret: z.boolean() });
export const storedServer = z.strictObject({
  name: text.max(32).regex(serverNamePattern), title: text.trim().min(1).max(40), catalogId: text.max(300).optional(),
  transport: z.enum(['stdio', 'streamable-http']), command: text.max(500).optional(), args: z.array(text.max(2000)).max(50).optional(), cwd: text.max(1000).optional(),
  url: text.max(4000).optional(), urlSecret: z.boolean().optional(), env: z.array(pair).max(50), headers: z.array(pair).max(50),
  pack: text.max(64).optional(),
  enabled: z.boolean(), revision: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(),
});
export const legacyDomain = defineDomain({ name: 'whalewing_mcp_servers', version: 1, tables: { servers: domainTable(storedServer) } });
export const legacyCredentialKey = name => `whalewing/mcp-${name}`;

// 现在鲸翼自己记的：显示名称、精选 id；插件包带的另记整条定义（密钥是引用）和开没开。
const entry = z.strictObject({
  transport: z.enum(['stdio', 'streamable-http']), command: text.max(500).optional(), args: z.array(text.max(2000)).max(50).optional(),
  env: z.record(text.max(200), text.max(8000)).optional(), cwd: text.max(1000).optional(), url: text.max(4000).optional(),
  headers: z.record(text.max(200), text.max(8000)).optional(), startupTimeoutMs: z.number().int().positive().optional(),
});
const metaRecord = z.strictObject({
  name: text.max(32), title: text.trim().min(1).max(40), catalogId: text.max(300).optional(),
  pack: text.max(64).optional(), enabled: z.boolean().optional(), entry: entry.optional(), updatedAt: z.number().int().nonnegative(),
});
const noteRecord = z.strictObject({ moved: z.number().int().nonnegative(), adopted: z.array(text.max(32)).max(100), at: z.number().int().nonnegative(), dismissed: z.boolean() });
export const metaDomain = directory => defineDomain({ name: `whalewing_mcp_meta_${createHash('sha256').update(directory).digest('hex')}`, version: 1, tables: { meta: domainTable(metaRecord), notes: domainTable(noteRecord) } });

/** 本机程序第一次用要先下载（npx），DSH 默认只等 30 秒；鲸翼加的给到两分钟（2026-11-09 实测 12306 第一次 60 秒没起来）。 */
export const STDIO_STARTUP_MS = 120_000;
const TEMPLATE = /^\$\{credential:([A-Za-z_][A-Za-z0-9_]*)\}$/;
/** 整个值就是一个 ${credential:名字} 时，返回那个名字。 */
export const refOf = value => TEMPLATE.exec(String(value ?? ''))?.[1];
export const template = ref => `\${credential:${ref}}`;
const slug = value => String(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'X';
/** 鲸翼给密钥起的名字：WHALEWING_MCP_<英文名>_ENV_<变量> / _HEADER_<请求头> / _URL。 */
export const secretRef = (name, kind, key) => ['WHALEWING_MCP', slug(name), kind, ...(key === undefined ? [] : [slug(key)])].join('_');
const ownRef = ref => typeof ref === 'string' && ref.startsWith('WHALEWING_MCP_');

/** 地址里的查询参数（常有 key）只露出参数名；密钥一律不回给界面。 */
export function maskUrl(url) {
  try { const parsed = new URL(url); for (const key of [...parsed.searchParams.keys()]) parsed.searchParams.set(key, '•••'); parsed.username = ''; parsed.password = ''; return decodeURI(parsed.toString()); }
  catch { return '（地址已保存）'; }
}

/** 连接失败的原因说成员工看得懂的一句话。server 只看 transport、command、urlSecret、headers。 */
export function explainConnect(error, server) {
  const messages = []; for (let cause = error; cause && messages.length < 5; cause = cause.cause) messages.push(String(cause.message ?? cause));
  const all = messages.join(' / ');
  if (/ENOENT|not recognized|command not found|spawn .* ENOENT/i.test(all) && server.transport === 'stdio') return `找不到命令「${server.command}」：本机要先装好它（npx 要装 Node.js），装完点“重新连接”`;
  const keyless = server.transport === 'streamable-http' && !server.urlSecret && !(server.headers ?? []).length;
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(all)) return keyless ? '对方要求登录授权：这个服务多半只支持在浏览器里授权（OAuth），DSH 的 MCP 暂时不支持；有密钥的话点“编辑”加上请求头' : '对方拒绝了：密钥不对、过期了或没有权限，点“编辑”重填密钥';
  if (/\b404\b/.test(all)) return '地址不对（对方说找不到），核对一下地址';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(all)) return '找不到这个地址的服务器，检查地址和网络';
  // Windows 上本机程序经命令行启动：命令不存在时 DSH 只报“Connection closed”（2026-11-15 在临时 DSH 里实测）。
  if (server.transport === 'stdio' && /Connection closed|exited|EPIPE/i.test(all)) return `本机程序一启动就退出了：多半是命令「${server.command}」不对（本机没装这个程序，npx 要先装 Node.js）或参数不对；核对后点“重新连接”`;
  if (server.transport === 'stdio' && /timed? ?out/i.test(all)) return '程序一直没启动好：第一次用要先下载，可能要一两分钟；检查网络（npm 能不能下载）后点“重新连接”';
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|timed? ?out|fetch failed/i.test(all)) return '连不上对方服务器（网络问题或对方没响应），稍后点“重新连接”';
  if (/already (in use|configured or registered)|already registers/.test(all)) return '这个英文名已经被另一个 MCP 用了，换一个名字';
  // 对方回的不是 MCP 的消息格式（常见于密钥不对时对方回一段普通错误页或 JSON）。
  if (/invalid_union|"jsonrpc"|Invalid input|Unexpected (token|content type)|not valid JSON/i.test(all)) return '对方返回的不是 MCP 的格式：多半是密钥不对或已失效，也可能地址填错了，点“编辑”核对';
  const last = messages.at(-1)?.trim().replace(/^mcp-client\([^)]*\):\s*/, '');
  return last && !/^[[{]/.test(last) ? `连不上：${last.slice(0, 200)}` : '连不上，对方没说明原因；核对地址和密钥后点“重新连接”';
}

const fingerprint = value => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);
/** 只留一条 MCP 里鲸翼认得、要写的字段（不带 DSH 补的默认值）。 */
function plainEntry(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = { transport: raw.transport === 'stdio' ? 'stdio' : 'streamable-http' };
  if (out.transport === 'stdio') {
    out.command = String(raw.command ?? '');
    if (Array.isArray(raw.args) && raw.args.length) out.args = raw.args.map(String);
    if (raw.env && Object.keys(raw.env).length) out.env = Object.fromEntries(Object.entries(raw.env).map(([key, value]) => [key, String(value)]));
    if (raw.cwd) out.cwd = String(raw.cwd);
  } else {
    out.url = String(raw.url ?? '');
    if (raw.headers && Object.keys(raw.headers).length) out.headers = Object.fromEntries(Object.entries(raw.headers).map(([key, value]) => [key, String(value)]));
  }
  if (Number.isFinite(raw.startupTimeoutMs) && raw.startupTimeoutMs !== 30_000) out.startupTimeoutMs = raw.startupTimeoutMs;
  return out;
}
/** 一条 MCP 引用的全部凭据名。 */
const refsIn = value => [value?.url, ...Object.values(value?.env ?? {}), ...Object.values(value?.headers ?? {})].map(refOf).filter(Boolean);

/**
 * 鲸翼这边的 MCP：在 DSH 的 MCP 管理器和设置服务之上，列出、添加、修改、停用、删除、试连，插件包带的登记和撤回，
 * 旧版存的搬进 DSH 配置。ctx 是注入了 mcpManager、settings 的作用域。
 */
export class McpServers {
  constructor(ctx, { meta, notes, legacy, loadClient = () => import(MCP_CLIENT), now = () => Date.now(), packEnabled = () => true }) {
    this.ctx = ctx; this.meta = meta; this.notes = notes; this.legacy = legacy; this.loadClient = loadClient; this.now = now; this.packEnabled = packEnabled;
    this.registered = new Map(); this.closed = false;
  }

  get manager() { return this.ctx.get('mcpManager'); }
  get settings() { return this.ctx.get('settings'); }
  get credentials() { return this.ctx.get('credentials'); }

  close() { this.closed = true; for (const name of [...this.registered.keys()]) this.unregister(name); }

  /** MCP 管理器在设置服务里的条目 id（DSH 的网页、桌面组合里叫 mcp-manager）。 */
  namespace() {
    try { return this.ctx.get('configEditor')?.entries().find(entry => entry.options?.name === MCP_MANAGER)?.options.id ?? 'mcp-manager'; }
    catch { return 'mcp-manager'; }
  }

  /** 设置服务里 MCP 管理器这一节：修订号、生效的 servers、profile 自己写的那层。 */
  section() {
    const ns = this.namespace();
    const found = this.settings?.describe().find(item => item.ns === ns);
    if (!found || !this.manager) fail('MCP_MANAGER', 'DSH 的 MCP 管理器没有加载，MCP 暂时用不了；请确认 DSH 是 0.2.2-rc.3 或更新的版本');
    return { ns, revision: found.revision, servers: found.value?.servers ?? {}, user: found.user?.servers ?? {} };
  }

  /** 一次写进 DSH 配置（几处改动用同一个修订号，别处刚改过就被 DSH 拒绝）。 */
  async write(ops, section = this.section()) {
    try { await this.settings.mutate(section.ns, ops, section.revision); }
    catch (error) {
      if (error?.code === 'SETTINGS_CONFLICT') fail('CONFLICT', 'MCP 设置刚在别处改过，请关掉重新打开再改');
      if (/overridden by a home patch or command-line overlay/.test(error?.message ?? '')) fail('MCP_LOCKED', 'DSH 的 MCP 设置被启动参数或全局配置固定了，这里改不了');
      throw error;
    }
  }

  statuses() {
    try { return new Map(this.manager.list().map(item => [item.name, item.status])); } catch { return new Map(); }
  }

  tools(name) {
    try { return (this.ctx.get('tools')?.definitions() ?? []).map(item => item.name).filter(item => typeof item === 'string' && item.startsWith(`mcp__${name}__`)).map(item => item.slice(name.length + 7)).sort(); }
    catch { return []; }
  }

  /** 老式写法：配置文件里直接写的 dsh-mcp-client 行（不归 MCP 管理器管），只读列出。 */
  staticServers() {
    const loader = this.ctx.get('loader');
    if (!loader?.entries) return [];
    const found = [];
    try {
      for (const item of loader.entries()) {
        if (item?.options?.name !== MCP_CLIENT) continue;
        const config = item.options.config ?? {};
        if (typeof config.serverName !== 'string') continue;
        // MCP 管理器自己挂的实例不算（它们挂在管理器下面，不是 profile 的行）。
        if (item.parent?.tree?.ctx?.fiber?.entry?.options?.name === MCP_MANAGER) continue;
        found.push({ name: config.serverName, transport: config.transport === 'stdio' ? 'stdio' : 'streamable-http', target: config.transport === 'stdio' ? [config.command, ...(Array.isArray(config.args) ? config.args : [])].filter(part => typeof part === 'string').join(' ').slice(0, 500) : maskUrl(String(config.url ?? '')), enabled: !item.options.disabled });
      }
    } catch { /* 读不到就当没有 */ }
    return found;
  }

  /** 已经被占的英文名：配置里的、登记的、老式写法的。 */
  takenNames() {
    let names = [];
    try { names = this.manager.list().map(item => item.name); } catch { /* 管理器不在 */ }
    try { names.push(...Object.keys(this.section().servers)); } catch { /* 同上 */ }
    for (const [name, meta] of this.meta.entries()) if (meta.pack) names.push(name);
    names.push(...this.staticServers().map(item => item.name));
    return new Set(names);
  }

  /** DSH 报的状态 → 界面用的：状态、第几次、下次什么时候、原因（说成大白话）。 */
  statusView(raw, value, { enabled, packOff }) {
    if (packOff) return { status: 'disabled' };
    if (!enabled) return { status: 'disabled' };
    const hint = { transport: value.transport, command: value.command, urlSecret: Boolean(refOf(value.url)), headers: Object.keys(value.headers ?? {}) };
    const why = message => explainConnect({ message }, hint);
    switch (raw?.state) {
      case 'connected': return { status: 'connected', toolCount: raw.toolCount };
      case 'reconnecting': return { status: 'retrying', attempt: raw.attempt, maxAttempts: raw.maxAttempts, nextRetryAt: raw.nextRetryAtMs, error: why(raw.lastError) };
      case 'waiting-credentials': return { status: 'waiting' };
      case 'failed': return { status: 'failed', error: raw.reason === 'cleanup' ? '上一次连接没关干净，要重启 DSH 才能再连' : raw.lastError ? why(raw.lastError) : '连不上，DSH 停止了重试；核对地址和密钥后点“重新连接”' };
      case 'disabled': return { status: 'disabled' };
      case 'closed': return { status: 'failed', error: '连接已关闭，点“重新连接”' };
      default: return { status: 'connecting', attempt: raw?.attempt ?? 0 };
    }
  }

  /** 一行键值：是密钥就只说存没存、存在哪个名字下；不是密钥的照原样给。 */
  async pairs(map) {
    const rows = [];
    for (const [name, value] of Object.entries(map ?? {})) {
      const ref = refOf(value);
      if (!ref) { rows.push({ name, secret: false, value }); continue; }
      const saved = Boolean(await this.credentials?.describe(ref).then(info => info?.configured, () => false));
      rows.push({ name, secret: true, saved, ref });
    }
    return rows;
  }

  async view(name, raw, { source, meta, status }) {
    const value = plainEntry(raw) ?? { transport: 'streamable-http', url: '' };
    const packOff = Boolean(meta?.pack && !this.packEnabled(meta.pack));
    const enabled = source === 'pack' ? meta?.enabled !== false : source === 'plugin' ? true : raw?.enabled !== false;
    const urlRef = value.transport === 'streamable-http' ? refOf(value.url) : undefined;
    const urlSaved = urlRef ? Boolean(await this.credentials?.describe(urlRef).then(info => info?.configured, () => false)) : undefined;
    const shown = this.statusView(status, value, { enabled, packOff });
    return {
      name, title: meta?.title ?? name, ...(meta?.catalogId ? { catalogId: meta.catalogId } : {}), source,
      ...(meta?.pack ? { pack: meta.pack } : {}), ...(packOff ? { packOff: true } : {}),
      transport: value.transport,
      target: value.transport === 'stdio' ? [value.command, ...(value.args ?? [])].join(' ') : urlRef ? '（地址带密钥，已保存）' : maskUrl(value.url ?? ''),
      ...(value.transport === 'stdio' ? { command: value.command, args: value.args ?? [] } : { url: urlRef ? '' : value.url ?? '', urlSecret: Boolean(urlRef), ...(urlRef ? { urlRef, urlSaved } : {}) }),
      env: await this.pairs(value.env), headers: await this.pairs(value.headers),
      enabled, revision: fingerprint(source === 'pack' ? meta : raw), editable: source === 'mine' || source === 'dsh',
      ...shown, tools: shown.status === 'connected' ? this.tools(name) : [],
    };
  }

  async list() {
    const statuses = this.statuses();
    let section = null, issue;
    try { section = this.section(); } catch (error) { issue = error.message; }
    const servers = [];
    const configured = new Set(Object.keys(section?.servers ?? {}));
    for (const [name, raw] of Object.entries(section?.servers ?? {})) {
      const meta = this.meta.get(name);
      servers.push(await this.view(name, raw, { source: meta && !meta.pack ? 'mine' : 'dsh', meta: meta?.pack ? undefined : meta, status: statuses.get(name) }));
    }
    for (const [name, meta] of this.meta.entries()) {
      if (!meta.pack || configured.has(name)) continue;
      // 登记被 DSH 拒了（比如和别的插件同名）：照实说，不显示成“正在连”。
      const issue = this.runnable(meta) && !this.registered.has(name) ? this.registerIssues.get(name) : undefined;
      servers.push(await this.view(name, meta.entry, { source: 'pack', meta, status: issue ? { state: 'failed', reason: 'gave-up', lastError: issue } : statuses.get(name) }));
    }
    for (const [name, status] of statuses) {
      if (configured.has(name) || this.meta.get(name)?.pack) continue;
      servers.push({ name, title: name, source: 'plugin', transport: 'streamable-http', target: '由别的插件登记', env: [], headers: [], enabled: true, revision: '', editable: false, ...this.statusView(status, { transport: 'streamable-http', headers: {} }, { enabled: true }), tools: status?.state === 'connected' ? this.tools(name) : [] });
    }
    for (const item of this.staticServers()) {
      if (servers.some(server => server.name === item.name)) continue;
      servers.push({ name: item.name, title: item.name, source: 'static', transport: item.transport, target: item.target, env: [], headers: [], enabled: item.enabled, revision: '', editable: false, status: item.enabled ? 'external' : 'disabled', tools: item.enabled ? this.tools(item.name) : [] });
    }
    servers.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
    const note = this.notes.get('migration');
    return {
      servers, credentials: Boolean(this.credentials), manager: Boolean(section), ...(issue ? { issue } : {}),
      ...(note && !note.dismissed && (note.moved || note.adopted.length) ? { notice: { moved: note.moved, adopted: note.adopted } } : {}),
    };
  }

  async one(name) {
    const found = (await this.list()).servers.find(server => server.name === name);
    if (!found) fail('MCP_MISSING', '这个 MCP 已经删掉了，请刷新');
    return found;
  }

  // ---- 插件包带的：向 MCP 管理器登记，跟着插件包走 ----

  runnable(meta) { return Boolean(meta?.pack && meta.entry && meta.enabled !== false && this.packEnabled(meta.pack)); }

  register(name) {
    const meta = this.meta.get(name);
    if (this.closed || !this.runnable(meta) || this.registered.has(name) || !this.manager) return;
    const value = plainEntry(meta.entry);
    try { this.registered.set(name, this.manager.register(name, { ...value, ...(value.transport === 'stdio' && !value.startupTimeoutMs ? { startupTimeoutMs: STDIO_STARTUP_MS } : {}) })); this.registerIssues.delete(name); }
    catch (error) { this.registerIssues.set(name, error?.message ?? String(error)); }
  }
  get registerIssues() { return this._registerIssues ??= new Map(); }

  unregister(name) {
    const dispose = this.registered.get(name);
    this.registered.delete(name);
    try { dispose?.(); } catch { /* 已经撤回 */ }
  }

  /** 鲸翼加载时把开着的包里开着的 MCP 都登记上。 */
  startPacks() { for (const [name, meta] of this.meta.entries()) if (meta.pack) this.register(name); }

  /** 插件包开了或关了：它带的 MCP 跟着登记或撤回（各自的“启用 / 停用”不变）。 */
  setPack(pack, enabled) {
    for (const [name, meta] of this.meta.entries()) {
      if (meta.pack !== pack) continue;
      if (enabled) this.register(name); else this.unregister(name);
    }
  }

  /** 卸载插件包：它带的 MCP 撤回、记录删掉，凭据库里鲸翼给它们存的密钥也删。 */
  async removePack(pack) {
    const names = [...this.meta.entries()].filter(([, meta]) => meta.pack === pack).map(([name]) => name);
    for (const name of names) {
      const meta = this.meta.get(name);
      this.unregister(name);
      await this.meta.delete(name);
      for (const ref of refsIn(meta.entry)) if (ownRef(ref)) await this.credentials?.unset(ref).catch(() => {});
    }
    return names;
  }

  // ---- 添加、修改 ----

  /**
   * 把界面填的拼成一条 DSH 的 MCP：密钥项换成 ${credential:名字}，要存的密钥值另外列出来。
   * 密钥留空表示沿用原来引用的那个；原来不是引用、第一次标成密钥的必须填。
   */
  compose(server, previous, { missingOk = false } = {}) {
    const secrets = new Map();
    const pairsOf = (rows, previousMap, kind) => Object.fromEntries(rows.filter(row => row.name.trim()).map(row => {
      const key = row.name.trim();
      if (!row.secret) return [key, row.value ?? ''];
      const kept = refOf(previousMap?.[key]);
      if (row.value) { const ref = kept ?? secretRef(server.name, kind, key); secrets.set(ref, row.value); return [key, template(ref)]; }
      if (kept) return [key, template(kept)];
      // 搬家时旧密钥丢了：照样写成引用，DSH 显示“等密钥”，员工补上就行。
      if (missingOk) return [key, template(secretRef(server.name, kind, key))];
      fail('MCP_SECRET', `${kind === 'ENV' ? '环境变量' : '请求头'}「${key}」是密钥，第一次保存要填上`);
    }));
    const value = { transport: server.transport };
    if (server.transport === 'stdio') {
      value.command = server.command?.trim() ?? '';
      if (server.args?.length) value.args = server.args;
      const env = pairsOf(server.env ?? [], previous?.env, 'ENV'); if (Object.keys(env).length) value.env = env;
      if (server.cwd) value.cwd = server.cwd;
      value.startupTimeoutMs = previous?.startupTimeoutMs ?? STDIO_STARTUP_MS;
    } else {
      if (server.urlSecret) {
        const kept = refOf(previous?.url);
        if (server.url) { const ref = kept ?? secretRef(server.name, 'URL'); secrets.set(ref, server.url); value.url = template(ref); }
        else if (kept) value.url = template(kept);
        else if (missingOk) value.url = template(secretRef(server.name, 'URL'));
        else fail('MCP_SECRET', '地址里带着密钥，第一次保存要填上整条地址');
      } else value.url = server.url ?? '';
      const headers = pairsOf(server.headers ?? [], previous?.headers, 'HEADER'); if (Object.keys(headers).length) value.headers = headers;
      if (previous?.startupTimeoutMs) value.startupTimeoutMs = previous.startupTimeoutMs;
    }
    return { value, secrets };
  }

  async storeSecrets(secrets) {
    if (!secrets.size) return;
    if (!this.credentials) fail('MCP_NO_CREDENTIALS', 'DSH 的凭据库没有加载，带密钥的 MCP 暂时存不了');
    for (const [ref, value] of secrets) await this.credentials.set(ref, value);
  }

  /** 改完以后不再用的、鲸翼自己起名的密钥从凭据库删掉。 */
  async dropRefs(before, after) {
    const still = new Set(refsIn(after));
    for (const ref of refsIn(before)) if (ownRef(ref) && !still.has(ref)) await this.credentials?.unset(ref).catch(() => {});
  }

  /** 新增或修改。wait 为假时不等（装插件包时一次加好几个）。pack 有值时是插件包带的，登记而不写配置。 */
  async save(input, { pack } = {}) {
    const server = input.server;
    const creating = input.expectedRevision === null;
    if (pack) return this.savePack(server, pack);
    const section = this.section();
    const previousRaw = section.servers[server.name];
    const previousMeta = this.meta.get(server.name);
    if (creating) {
      if (!serverNamePattern.test(server.name) || server.name.length > 32) fail('MCP_NAME', '英文名只能用小写字母、数字和单个短横线，最长 32 个字符');
      if (this.takenNames().has(server.name)) fail('MCP_NAME', `已经有叫「${server.name}」的 MCP 了，换一个英文名`);
    } else {
      if (previousMeta?.pack) return this.savePack(server, previousMeta.pack, input.expectedRevision);
      if (!previousRaw) fail('MCP_MISSING', '这个 MCP 已经删掉了，请刷新');
      if (fingerprint(previousRaw) !== input.expectedRevision) fail('CONFLICT', '这个 MCP 刚在别处改过，请关掉重新打开再改');
    }
    const base = plainEntry(previousRaw);
    const { value, secrets } = this.compose(server, base);
    // 手写的那条里鲸翼不认得的字段（工具超时、重连规则）原样留着。
    const keep = Object.fromEntries(Object.entries(section.user[server.name] ?? {}).filter(([key]) => ['toolCallTimeoutMs', 'closeTimeoutMs', 'reconnect'].includes(key)));
    await this.storeSecrets(secrets);
    await this.write([{ op: 'set', path: ['servers', server.name], value: { ...keep, ...value, enabled: previousRaw?.enabled !== false } }], section);
    await this.meta.put(server.name, metaRecord.parse({ name: server.name, title: server.title, ...(server.catalogId ?? previousMeta?.catalogId ? { catalogId: server.catalogId ?? previousMeta.catalogId } : {}), updatedAt: this.now() }));
    await this.dropRefs(base, value);
    return { server: await this.one(server.name) };
  }

  async savePack(server, pack, expectedRevision) {
    const previous = this.meta.get(server.name);
    if (expectedRevision !== undefined && (!previous || fingerprint(previous) !== expectedRevision)) fail('CONFLICT', '这个 MCP 刚在别处改过，请关掉重新打开再改');
    if (!previous && this.takenNames().has(server.name)) fail('MCP_NAME', `已经有叫「${server.name}」的 MCP 了，换一个英文名`);
    const base = plainEntry(previous?.entry);
    const { value, secrets } = this.compose(server, base);
    await this.storeSecrets(secrets);
    const record = metaRecord.parse({ name: server.name, title: server.title, ...(server.catalogId ?? previous?.catalogId ? { catalogId: server.catalogId ?? previous.catalogId } : {}), pack, enabled: previous?.enabled ?? true, entry: value, updatedAt: this.now() });
    this.unregister(server.name);
    await this.meta.put(server.name, record);
    this.register(server.name);
    await this.dropRefs(base, value);
    return { server: await this.one(server.name) };
  }

  async setEnabled(name, enabled, expectedRevision) {
    const meta = this.meta.get(name);
    if (meta?.pack) {
      if (fingerprint(meta) !== expectedRevision) fail('CONFLICT', '这个 MCP 刚在别处改过，请刷新后再试');
      await this.meta.put(name, { ...meta, enabled, updatedAt: this.now() });
      if (enabled) this.register(name); else this.unregister(name);
      return { server: await this.one(name) };
    }
    const section = this.section();
    const raw = section.servers[name];
    if (!raw) fail('MCP_MISSING', '这个 MCP 已经删掉了，请刷新');
    if (fingerprint(raw) !== expectedRevision) fail('CONFLICT', '这个 MCP 刚在别处改过，请刷新后再试');
    await this.write([{ op: 'set', path: ['servers', name, 'enabled'], value: enabled }], section);
    return { server: await this.one(name) };
  }

  async reconnect(name) {
    const meta = this.meta.get(name);
    if (meta?.pack && !this.packEnabled(meta.pack)) fail('MCP_DISABLED', '它所在的插件包停用了，先到“插件”里启用这个包');
    const found = await this.one(name);
    if (!found.enabled) fail('MCP_DISABLED', '这个 MCP 已停用，先点“启用”');
    try { await this.manager.restart(name); }
    catch (error) { fail('MCP_RESTART', explainConnect(error, found)); }
    return { server: await this.one(name) };
  }

  async remove(name, expectedRevision) {
    const meta = this.meta.get(name);
    if (meta?.pack) {
      if (fingerprint(meta) !== expectedRevision) fail('CONFLICT', '这个 MCP 刚在别处改过，请刷新后再试');
      this.unregister(name);
      await this.meta.delete(name);
      for (const ref of refsIn(meta.entry)) if (ownRef(ref)) await this.credentials?.unset(ref).catch(() => {});
      return { removed: name };
    }
    const section = this.section();
    const raw = section.servers[name];
    if (!raw) fail('MCP_MISSING', '这个 MCP 已经删掉了，请刷新');
    if (fingerprint(raw) !== expectedRevision) fail('CONFLICT', '这个 MCP 刚在别处改过，请刷新后再试');
    await this.write([{ op: 'unset', path: ['servers', name] }], section);
    if (this.section().servers[name]) fail('MCP_INHERITED', '这个 MCP 写在 DSH 自带的组合配置里，删不掉，可以停用');
    await this.meta.delete(name);
    for (const ref of refsIn(raw)) if (ownRef(ref)) await this.credentials?.unset(ref).catch(() => {});
    return { removed: name };
  }

  /** 补上或换掉一个密钥（只认已经是引用的那一项）；DSH 拿到新值会自己重连。 */
  async setSecret(name, field, value) {
    const meta = this.meta.get(name);
    const raw = meta?.pack ? meta.entry : this.section().servers[name];
    if (!raw) fail('MCP_MISSING', '这个 MCP 已经删掉了，请刷新');
    const current = field.kind === 'url' ? raw.url : (field.kind === 'env' ? raw.env : raw.headers)?.[field.key];
    const ref = refOf(current);
    if (!ref) fail('MCP_SECRET', '这一项不是密钥，点“编辑”修改');
    await this.storeSecrets(new Map([[ref, value]]));
    return { server: await this.one(name) };
  }

  /**
   * 试连一下：照填的拼一份连接配置，连上读对方名称和工具名就断开；不写配置、不登记、不给专家用。
   * 已保存的密钥留空就用凭据库里的；新填的密钥直接用，不先存。
   */
  async probe(server, signal) {
    const section = (() => { try { return this.section(); } catch { return null; } })();
    const meta = this.meta.get(server.name);
    const base = plainEntry(meta?.pack ? meta.entry : section?.servers[server.name]);
    const { value, secrets } = this.compose(server, base);
    // 新填的密钥直接代进去（只在这次试连里用）；沿用的还是引用，由 DSH 从凭据库取。
    const fill = text => { const ref = refOf(text); return ref && secrets.has(ref) ? secrets.get(ref) : text; };
    const client = await this.loadClient();
    const shared = { serverName: dshNamePattern.test(server.name) ? server.name : 'whalewing-probe', expandTemplates: true, startupTimeoutMs: value.transport === 'stdio' ? STDIO_STARTUP_MS : 30_000 };
    const config = client.Config(value.transport === 'stdio'
      ? { transport: 'stdio', command: value.command, args: value.args ?? [], env: Object.fromEntries(Object.entries(value.env ?? {}).map(([key, item]) => [key, fill(item)])), cwd: value.cwd ?? '', ...shared }
      : { transport: 'streamable-http', url: fill(value.url), headers: Object.fromEntries(Object.entries(value.headers ?? {}).map(([key, item]) => [key, fill(item)])), ...shared });
    const hint = { transport: value.transport, command: value.command, urlSecret: Boolean(server.urlSecret), headers: Object.keys(value.headers ?? {}) };
    let result;
    try { result = await client.probeServer(this.ctx, config, { timeoutMs: value.transport === 'stdio' ? 90_000 : 15_000, ...(signal ? { signal } : {}) }); }
    catch (error) { return { probe: { ok: false, error: explainConnect(error, hint), tools: [], ms: 0 } }; }
    return { probe: result.ok
      ? { ok: true, ...(result.serverInfo ? { server: { name: String(result.serverInfo.name ?? ''), version: String(result.serverInfo.version ?? '') } } : {}), tools: result.toolNames, truncated: Boolean(result.truncated), ms: result.durationMs }
      : { ok: false, error: /credential "[^"]+" is not configured/.test(result.message) ? '凭据库里还没有它要的密钥，先把密钥填上' : explainConnect({ message: result.message }, hint), tools: [], ms: result.durationMs } };
  }

  async dismissNotice() {
    const note = this.notes.get('migration');
    if (note) await this.notes.put('migration', { ...note, dismissed: true });
    return this.list();
  }

  /**
   * 搬家（0.2.2-rc.3.2 起，一次）：旧版自己存的 MCP，员工加的写进 DSH 配置，插件包带的改成登记；
   * 密钥从旧的那条记录拆开、按名字存进凭据库。DSH 配置里已经有同名的就用 DSH 那条，只留显示名称。
   */
  async migrate() {
    if (!this.legacy) return;
    const old = [...this.legacy.entries()].map(([, record]) => record);
    if (!old.length) return;
    const section = this.section();
    const ops = [], adopted = [], done = [];
    let moved = 0;
    for (const record of old) {
      const stored = await this.credentials?.readRecord(legacyCredentialKey(record.name)).catch(() => undefined);
      const payload = stored?.kind === 'grant' && stored.payload && typeof stored.payload === 'object' ? stored.payload : {};
      const filled = (list, values) => list.map(row => row.secret ? { ...row, value: typeof values?.[row.name] === 'string' ? values[row.name] : '' } : row);
      const server = { ...record, env: filled(record.env, payload.env), headers: filled(record.headers, payload.headers), ...(record.urlSecret ? { url: typeof payload.url === 'string' ? payload.url : '' } : {}) };
      const meta = { name: record.name, title: record.title, ...(record.catalogId ? { catalogId: record.catalogId } : {}), updatedAt: this.now() };
      try {
        if (record.pack) {
          const { value, secrets } = this.compose(server, undefined, { missingOk: true });
          await this.storeSecrets(secrets);
          await this.meta.put(record.name, metaRecord.parse({ ...meta, pack: record.pack, enabled: record.enabled, entry: value }));
        } else if (section.servers[record.name]) {
          adopted.push(record.name);
          await this.meta.put(record.name, metaRecord.parse(meta));
        } else {
          const { value, secrets } = this.compose(server, undefined, { missingOk: true });
          await this.storeSecrets(secrets);
          ops.push({ op: 'set', path: ['servers', record.name], value: { ...value, enabled: record.enabled } });
          await this.meta.put(record.name, metaRecord.parse(meta));
          moved += 1;
        }
        done.push(record.name);
      } catch { /* 这一个搬不了（比如密钥丢了）：留在旧表里，下次启动再试 */ }
    }
    if (ops.length) await this.write(ops, section);
    for (const name of done) {
      await this.legacy.delete(name);
      await this.credentials?.deleteRecord(legacyCredentialKey(name)).catch(() => {});
    }
    if (moved || adopted.length) {
      // 上一次的提示员工还没点“知道了”就接着累计；点过了就只说这一次搬的（退回旧版加了 MCP 再升级时不会把上次的也算进去）。
      const note = this.notes.get('migration');
      const carry = note && !note.dismissed;
      await this.notes.put('migration', { moved: (carry ? note.moved : 0) + moved, adopted: [...new Set([...(carry ? note.adopted : []), ...adopted])], at: this.now(), dismissed: false });
    }
  }
}
