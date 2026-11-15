// 测试用的假 DSH（0.2.2-rc.3 起）：设置服务（MCP 管理器那一节，带修订号）、MCP 管理器（配置的 + 登记的、状态、重启）、
// 凭据库（按名字存的值 + 旧版的记录）、工具注册表、存储表。行为照 2026-11-15 在临时 DSH 里试出来的样子（.artifacts/mcp-probe）。
import { McpServers, MCP_MANAGER } from '../src/mcp-servers.js';

const defaults = { command: '', args: [], env: {}, cwd: '', url: '', headers: {}, enabled: true, startupTimeoutMs: 30000, reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 } };

export function table() {
  const rows = new Map();
  return { rows, get: key => rows.get(key), entries: () => rows.entries(), put: async (key, value) => { rows.set(key, structuredClone(value)); }, delete: async key => { rows.delete(key); } };
}

export function fakeDsh({ base = {}, user = {}, statics = [], credentialValues = {}, records = {} } = {}) {
  const state = { base: structuredClone(base), user: structuredClone(user), revision: 0, writes: [] };
  const effective = () => Object.fromEntries(Object.entries({ ...state.base, ...state.user }).map(([name, value]) => [name, { ...structuredClone(defaults), ...structuredClone(value) }]));
  const settings = {
    describe: () => [{ ns: 'mcp-manager', revision: state.revision, value: { servers: effective() }, base: { servers: structuredClone(state.base) }, user: { servers: structuredClone(state.user) } }],
    async mutate(ns, ops, revision) {
      if (ns !== 'mcp-manager') throw new Error(`No configurable plugin entry "${ns}"`);
      if (revision !== undefined && revision !== state.revision) throw Object.assign(new Error('changed since it was read'), { name: 'SettingsConflictError', code: 'SETTINGS_CONFLICT' });
      for (const op of ops) {
        const [, name, field] = op.path;
        if (registered.has(name)) throw new Error(`servers.${name}: a plugin already registers this server name — rename the entry key`);
        if (op.op === 'set' && field) state.user[name] = { ...(state.user[name] ?? state.base[name]), [field]: op.value };
        else if (op.op === 'set') state.user[name] = structuredClone(op.value);
        else delete state.user[name];
      }
      state.revision += 1; state.writes.push(structuredClone(ops));
    },
  };
  // MCP 管理器：状态默认“正在连”，测试里用 statuses.set 换。
  const statuses = new Map(), registered = new Map(), restarts = [];
  const manager = {
    list: () => [...new Set([...Object.keys(effective()), ...registered.keys()])].map(name => ({ name, configured: true, status: statuses.get(name) ?? (effective()[name]?.enabled === false ? { state: 'disabled' } : { state: 'connecting', attempt: 0 }) })),
    register(name, entry) {
      if (name in effective() || registered.has(name)) throw new Error(`mcp-manager: server "${name}" is already configured or registered`);
      registered.set(name, structuredClone(entry));
      return () => { registered.delete(name); };
    },
    async restart(name) { if (!(name in effective()) && !registered.has(name)) throw new Error(`mcp-manager: unknown server "${name}"`); restarts.push(name); },
  };
  const values = new Map(Object.entries(credentialValues)), recordMap = new Map(Object.entries(records));
  const credentials = {
    values, records: recordMap,
    async set(ref, value) { if (!value) throw new Error('empty'); values.set(ref, value); },
    async unset(ref) { values.delete(ref); },
    async describe(ref) { return values.has(ref) ? { configured: true, source: 'file', writable: true } : { configured: false, writable: true }; },
    async resolve(ref) { return values.has(ref) ? { value: values.get(ref), source: 'file' } : undefined; },
    async readRecord(key) { return recordMap.get(key); },
    async deleteRecord(key) { recordMap.delete(key); },
  };
  const tools = { definitions: () => manager.list().filter(item => item.status.state === 'connected').flatMap(item => ['read', 'search'].map(tool => ({ name: `mcp__${item.name}__${tool}` }))) };
  const loader = { *entries() { for (const item of statics) yield { options: { name: '@deepseek-ai/dsh-mcp-client', id: `mcp-${item.serverName}`, config: item } }; } };
  const configEditor = { entries: () => [{ options: { name: MCP_MANAGER, id: 'mcp-manager' } }] };
  const services = { settings, mcpManager: manager, credentials, tools, loader, configEditor };
  const ctx = { get: name => services[name], emit() {} };
  return { ctx, state, effective, settings, manager, statuses, registered, restarts, credentials, services };
}

/** 拿假 DSH 建一个鲸翼的 MCP；probe 用假的连接库（记下拿到的配置）。 */
export function makeMcp(options = {}) {
  const dsh = fakeDsh(options);
  const meta = table(), notes = table(), legacy = table();
  const probes = [];
  const client = {
    Config: value => ({ ...value }),
    async probeServer(ctx, config, opts) { probes.push({ config, opts }); return options.probe ? options.probe(config) : { ok: true, serverInfo: { name: 'fake', version: '1.0' }, toolNames: ['read', 'search'], truncated: false, durationMs: 120, closeConfirmed: true }; },
  };
  let packOn = options.packOn ?? (() => true);
  const mcp = new McpServers(dsh.ctx, { meta, notes, legacy, loadClient: async () => client, now: () => 1000, packEnabled: name => packOn(name) });
  return { ...dsh, mcp, meta, notes, legacy, probes, setPackOn: fn => { packOn = fn; } };
}
