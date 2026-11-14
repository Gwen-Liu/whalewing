import { z } from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { fail } from './vault.js';

// 技能中心页的 MCP（2026-11-09 用户定“鲸翼里填表添加”）：DSH 0.2.2 只认配置文件里手写的 MCP 客户端行，没有添加界面，
// 也没有让插件新增配置行的接口。鲸翼自己用 DSH 自带的 MCP 客户端挂连接：定义存 DSH 存储域，密钥存 DSH 凭据库，不写配置文件。
export const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client';
export const serverNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = z.string();
const pair = z.strictObject({ name: text.trim().min(1).max(200), value: text.max(8000).optional(), secret: z.boolean() });
export const storedServer = z.strictObject({
  name: text.max(32).regex(serverNamePattern), title: text.trim().min(1).max(40), catalogId: text.max(300).optional(),
  transport: z.enum(['stdio', 'streamable-http']), command: text.max(500).optional(), args: z.array(text.max(2000)).max(50).optional(), cwd: text.max(1000).optional(),
  url: text.max(4000).optional(), urlSecret: z.boolean().optional(), env: z.array(pair).max(50), headers: z.array(pair).max(50),
  // 随插件包装的：记下包名，包关了它也不连，卸载包时一起删。
  pack: text.max(64).optional(),
  enabled: z.boolean(), revision: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(),
});
export const mcpDomain = defineDomain({ name: 'whalewing_mcp_servers', version: 1, tables: { servers: domainTable(storedServer) } });
const credentialKey = name => `whalewing/mcp-${name}`;

/** 地址里的查询参数（常有 key）只露出参数名；密钥一律不回给界面。 */
export function maskUrl(url) {
  try { const parsed = new URL(url); for (const key of [...parsed.searchParams.keys()]) parsed.searchParams.set(key, '•••'); parsed.username = ''; parsed.password = ''; return decodeURI(parsed.toString()); }
  catch { return '（地址已保存）'; }
}

/** 连接失败的原因说成员工看得懂的一句话。 */
export function explainConnect(error, server) {
  const messages = []; for (let cause = error; cause && messages.length < 5; cause = cause.cause) messages.push(String(cause.message ?? cause));
  const all = messages.join(' / ');
  if (/ENOENT/.test(all) && server.transport === 'stdio') return `找不到命令「${server.command}」：本机要先装好它（npx 要装 Node.js），装完点“重新连接”`;
  const keyless = server.transport === 'streamable-http' && !server.urlSecret && !(server.headers ?? []).length;
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(all)) return keyless ? '对方要求登录授权：这个服务多半只支持在浏览器里授权（OAuth），DSH 的 MCP 暂时不支持；有密钥的话点“编辑”加上请求头' : '对方拒绝了：密钥不对、过期了或没有权限，点“编辑”重填密钥';
  if (/\b404\b/.test(all)) return '地址不对（对方说找不到），核对一下地址';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(all)) return '找不到这个地址的服务器，检查地址和网络';
  if (server.transport === 'stdio' && /timed? ?out/i.test(all)) return '程序一直没启动好：第一次用要先下载，等了三轮还没好；检查网络（npm 能不能下载）后点“重新连接”';
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|timed? ?out|fetch failed/i.test(all)) return '连不上对方服务器（网络问题或对方没响应），稍后点“重新连接”';
  if (/already in use/.test(all)) return '这个英文名已经被另一个 MCP 用了，换一个名字';
  // 对方回的不是 MCP 的消息格式（常见于密钥不对时对方回一段普通错误页或 JSON）。
  if (/invalid_union|"jsonrpc"|Invalid input|Unexpected (token|content type)|not valid JSON/i.test(all)) return '对方返回的不是 MCP 的格式：多半是密钥不对或已失效，也可能地址填错了，点“编辑”核对';
  const last = messages.at(-1)?.trim();
  return last && !/^[[{]/.test(last) ? `连不上：${last.slice(0, 200)}` : '连不上，对方没说明原因；核对地址和密钥后点“重新连接”';
}

/** 鲸翼加的 MCP：保存、连接、断开、删除；DSH 配置文件里手写的只读列出。 */
export class McpServers {
  constructor(ctx, table, { loadClient = () => import(MCP_CLIENT), now = () => Date.now(), packEnabled = () => true } = {}) {
    this.ctx = ctx; this.table = table; this.loadClient = loadClient; this.now = now; this.packEnabled = packEnabled;
    this.live = new Map(); this.closed = false;
  }

  get credentials() { return this.ctx.get('credentials'); }

  all() { return [...this.table.entries()].map(([, value]) => value); }

  close() { this.closed = true; for (const name of [...this.live.keys()]) this.stop(name); }

  /** DSH 配置文件里手写的 MCP（不带密钥）：名字、方式、命令或地址、开没开。 */
  profileServers() {
    const loader = this.ctx.get('loader');
    if (!loader?.entries) return [];
    const found = [];
    try {
      for (const entry of loader.entries()) {
        if (entry?.options?.name !== MCP_CLIENT) continue;
        const config = entry.options.config ?? {};
        if (typeof config.serverName !== 'string') continue;
        found.push({ name: config.serverName, transport: config.transport === 'stdio' ? 'stdio' : 'streamable-http', target: config.transport === 'stdio' ? [config.command, ...(Array.isArray(config.args) ? config.args : [])].filter(item => typeof item === 'string').join(' ').slice(0, 500) : maskUrl(String(config.url ?? '')), enabled: !entry.options.disabled });
      }
    } catch { /* 读不到就当没有，不影响鲸翼自己加的。 */ }
    return found;
  }

  tools(name) {
    try { return (this.ctx.get('tools')?.definitions() ?? []).map(item => item.name).filter(item => typeof item === 'string' && item.startsWith(`mcp__${name}__`)).map(item => item.slice(name.length + 7)).sort(); }
    catch { return []; }
  }

  async secrets(name) {
    const record = await this.credentials?.readRecord(credentialKey(name)).catch(() => undefined);
    const payload = record?.kind === 'grant' && record.payload && typeof record.payload === 'object' ? record.payload : {};
    return { url: typeof payload.url === 'string' ? payload.url : undefined, env: payload.env && typeof payload.env === 'object' ? payload.env : {}, headers: payload.headers && typeof payload.headers === 'object' ? payload.headers : {} };
  }

  view(server) {
    const state = this.live.get(server.name);
    const packOff = Boolean(server.pack && !this.packEnabled(server.pack));
    const status = !server.enabled || packOff ? 'disabled' : state?.status ?? 'connecting';
    return {
      name: server.name, title: server.title, ...(server.catalogId ? { catalogId: server.catalogId } : {}), ...(server.pack ? { pack: server.pack } : {}), ...(packOff ? { packOff: true } : {}), transport: server.transport,
      target: server.transport === 'stdio' ? [server.command, ...(server.args ?? [])].join(' ') : server.urlSecret ? maskUrl(server.url ?? '') : server.url ?? '',
      ...(server.transport === 'stdio' ? { command: server.command, args: server.args ?? [] } : { url: server.urlSecret ? '' : server.url ?? '', urlSecret: Boolean(server.urlSecret) }),
      env: server.env.map(({ name, value, secret }) => ({ name, secret, ...(secret ? {} : { value: value ?? '' }) })),
      headers: server.headers.map(({ name, value, secret }) => ({ name, secret, ...(secret ? {} : { value: value ?? '' }) })),
      enabled: server.enabled, revision: server.revision, status, ...(status === 'failed' && state?.error ? { error: state.error } : {}),
      tools: status === 'connected' ? this.tools(server.name) : [],
    };
  }

  list() {
    const servers = [...this.all()].sort((a, b) => a.title.localeCompare(b.title, 'zh'));
    return { servers: servers.map(server => this.view(server)), profile: this.profileServers(), credentials: Boolean(this.credentials) };
  }

  /** 鲸翼加载时把打开的都连上；不等它们连完，免得拖慢启动。 */
  startAll() { for (const server of this.all()) if (this.runnable(server)) this.start(server).catch(() => {}); }

  runnable(server) { return server.enabled && !(server.pack && !this.packEnabled(server.pack)); }

  /** 插件包开了或关了：它带的 MCP 跟着连上或断开（各自的“连接 / 断开”设置不变）。 */
  setPack(pack, enabled) {
    for (const server of this.all()) {
      if (server.pack !== pack) continue;
      if (enabled && server.enabled) this.start(server).catch(() => {}); else this.stop(server.name);
    }
    this.ctx.emit?.('whalewing-mcp/changed');
  }

  /** 卸载插件包：它带的 MCP 一起删，凭据库里的密钥也删。 */
  async removePack(pack) {
    const names = this.all().filter(server => server.pack === pack).map(server => server.name);
    for (const name of names) {
      this.stop(name);
      await this.table.delete(name);
      await this.credentials?.deleteRecord(credentialKey(name)).catch(() => {});
    }
    this.ctx.emit?.('whalewing-mcp/changed');
    return names;
  }

  stop(name) {
    const state = this.live.get(name);
    this.live.delete(name);
    state?.fiber?.dispose?.();
  }

  /**
   * 连上一个 MCP。本机程序第一次用要先下载（npx），可能超过 DSH 等待的 60 秒；超时的话接着再等两轮，
   * 已经下载的部分留在 npm 缓存里，不用重来（2026-11-09 实测 12306 第一次 60 秒没起来，第二次 20 秒）。
   */
  async start(server, attempt = 1) {
    if (attempt === 1) this.stop(server.name);
    const state = attempt === 1 ? { status: 'connecting', error: undefined, fiber: undefined } : this.live.get(server.name);
    if (!state) return;
    if (attempt === 1) this.live.set(server.name, state);
    let retry = false;
    try {
      const client = await this.loadClient();
      const secret = await this.secrets(server.name);
      const pairs = (list, stored) => Object.fromEntries(list.map(({ name, value, secret: hidden }) => [name, hidden ? String(stored[name] ?? '') : value ?? '']));
      // 首次连接或发现工具失败就报出来（不在后台无限重试），员工看到原因后点“重新连接”；连上以后断了照 DSH 默认的规则重连。
      const config = server.transport === 'stdio'
        ? { transport: 'stdio', serverName: server.name, command: server.command, args: server.args ?? [], env: pairs(server.env, secret.env), ...(server.cwd ? { cwd: server.cwd } : {}), failOnStartupError: true }
        : { transport: 'streamable-http', serverName: server.name, url: server.urlSecret ? secret.url ?? '' : server.url, headers: pairs(server.headers, secret.headers), failOnStartupError: true };
      if (this.closed || this.live.get(server.name) !== state) return;
      state.fiber = this.ctx.plugin(client, config);
      await state.fiber;
      if (this.live.get(server.name) === state) state.status = 'connected';
    } catch (error) {
      if (this.live.get(server.name) !== state) return;
      state.fiber?.dispose?.(); state.fiber = undefined;
      const all = []; for (let cause = error; cause && all.length < 5; cause = cause.cause) all.push(String(cause.message ?? cause));
      if (server.transport === 'stdio' && attempt < 3 && !this.closed && /timed? ?out/i.test(all.join(' '))) retry = true;
      else { state.status = 'failed'; state.error = explainConnect(error, server); }
    } finally { if (!retry) this.ctx.emit?.('whalewing-mcp/changed'); }
    if (retry) return this.start(server, attempt + 1);
  }

  /** 新增或修改。密钥项留空表示沿用已保存的；名称改不了（工具名跟着它）。wait 为假时不等连上（装插件包时一次加好几个）。 */
  async save(input, { pack, wait = true } = {}) {
    const previous = this.table.get(input.server.name);
    if (input.expectedRevision === null && previous) fail('MCP_NAME', `已经有叫「${input.server.name}」的 MCP 了，换一个英文名`);
    if (input.expectedRevision !== null && (!previous || previous.revision !== input.expectedRevision)) fail('CONFLICT', '这个 MCP 刚在别处改过，请关掉重新打开再改');
    if (!previous && this.profileServers().some(item => item.name === input.server.name)) fail('MCP_NAME', `DSH 配置文件里已经有叫「${input.server.name}」的 MCP，换一个英文名`);
    const server = input.server;
    const hasSecret = server.env.some(item => item.secret) || server.headers.some(item => item.secret) || server.urlSecret;
    if (hasSecret && !this.credentials) fail('MCP_NO_CREDENTIALS', 'DSH 的凭据库没有加载，带密钥的 MCP 暂时存不了');
    const kept = previous ? await this.secrets(previous.name) : { env: {}, headers: {} };
    const collect = (list, keptValues, kind) => Object.fromEntries(list.filter(item => item.secret).map(item => {
      const value = item.value ?? keptValues[item.name];
      if (!value) fail('MCP_SECRET', `${kind}「${item.name}」是密钥，第一次保存要填上`);
      return [item.name, value];
    }));
    const secret = {
      env: collect(server.env, kept.env, '环境变量'), headers: collect(server.headers, kept.headers, '请求头'),
      ...(server.urlSecret ? { url: server.url || kept.url || fail('MCP_SECRET', '地址里带着密钥，第一次保存要填上整条地址') } : {}),
    };
    const strip = list => list.map(({ name, value, secret: hidden }) => hidden ? { name, secret: true } : { name, value: value ?? '', secret: false });
    const record = storedServer.parse({
      name: server.name, title: server.title, ...(server.catalogId ? { catalogId: server.catalogId } : {}), transport: server.transport,
      ...(server.transport === 'stdio' ? { command: server.command, args: server.args ?? [], ...(server.cwd ? { cwd: server.cwd } : {}) } : { url: server.urlSecret ? maskUrl(secret.url) : server.url, ...(server.urlSecret ? { urlSecret: true } : {}) }),
      env: server.transport === 'stdio' ? strip(server.env) : [], headers: server.transport === 'streamable-http' ? strip(server.headers) : [],
      ...(previous?.pack ?? pack ? { pack: previous?.pack ?? pack } : {}),
      enabled: previous?.enabled ?? true, revision: (previous?.revision ?? -1) + 1, updatedAt: this.now(),
    });
    if (hasSecret) await this.credentials.modifyRecord(credentialKey(record.name), async () => ({ kind: 'grant', payload: secret }));
    else await this.credentials?.deleteRecord(credentialKey(record.name)).catch(() => {});
    await this.table.put(record.name, record);
    if (this.runnable(record)) { if (wait) await this.start(record); else this.start(record).catch(() => {}); }
    return { server: this.view(record) };
  }

  async setEnabled(name, enabled, expectedRevision) {
    const previous = this.table.get(name);
    if (!previous || previous.revision !== expectedRevision) fail('CONFLICT', '这个 MCP 刚在别处改过，请刷新后再试');
    const record = { ...previous, enabled, revision: previous.revision + 1, updatedAt: this.now() };
    await this.table.put(name, record);
    if (this.runnable(record)) await this.start(record); else { this.stop(name); this.ctx.emit?.('whalewing-mcp/changed'); }
    return { server: this.view(record) };
  }

  async reconnect(name) {
    const server = this.table.get(name);
    if (!server) fail('MCP_MISSING', '这个 MCP 已经删掉了，请刷新');
    if (!server.enabled) fail('MCP_DISABLED', '这个 MCP 已断开，先点“连接”');
    if (!this.runnable(server)) fail('MCP_DISABLED', '它所在的插件包停用了，先到“插件”里启用这个包');
    await this.start(server);
    return { server: this.view(server) };
  }

  async remove(name, expectedRevision) {
    const previous = this.table.get(name);
    if (!previous || previous.revision !== expectedRevision) fail('CONFLICT', '这个 MCP 刚在别处改过，请刷新后再试');
    this.stop(name);
    await this.table.delete(name);
    await this.credentials?.deleteRecord(credentialKey(name)).catch(() => {});
    this.ctx.emit?.('whalewing-mcp/changed');
    return { removed: name };
  }
}
