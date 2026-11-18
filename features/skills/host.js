import { Service } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { registerBuiltin } from '../../src/features.js';
import { skillLibraryContract } from './contract.js';
import { apply as registerTool } from './tool.js';
import { SkillMarket } from '../../src/skill-market.js';
import { unpackUpload } from '../../src/skills.js';
import { McpServers, metaDomain, legacyDomain, serverNamePattern } from '../../src/mcp-servers.js';
import { PackMarket } from '../../src/pack-market.js';
import { composePackServer } from '../../src/plugin-packs.js';
import { freeName } from './mcp-catalog.js';
import { fail } from '../../src/vault.js';

const plain = message => String(message ?? '').replace(/^[A-Z_]+: /, '');
/** 装好的插件包回给界面的样子（记录文件里多余的字段不带）。 */
const packView = record => ({
  name: record.name, title: record.title || record.name, description: record.description ?? '', version: record.version ?? '', author: record.author ?? '', homepage: record.homepage ?? '',
  source: record.source ?? { kind: 'upload', label: '未知来源' }, enabled: Boolean(record.enabled), installedAt: record.installedAt ?? '',
  skills: (record.skills ?? []).map(({ name, description }) => ({ name, description })), mcp: record.mcp ?? [], skippedMcp: record.skippedMcp ?? [],
  skipped: { commands: 0, agents: 0, hooks: false, lsp: false, ...record.skipped }, issues: record.issues ?? [],
});

const contract = skillLibraryContract(z);
export default class Skills extends Service {
  static inject = ["whalewing", "typert"];
  constructor(ctx) {
    super(ctx, 'whalewingSkills');
    registerBuiltin(ctx, 'skills');
    this.host = ctx.whalewing;
    this.closing = new AbortController();
    this.pending = new Set();
    this.market = new SkillMarket(this.host.skills);
    this.packs = this.host.skills.packs;
    this.packMarket = new PackMarket(this.packs);
    this.typertRemote = bindTypertRemote(this, 'whalewingSkills', { namespace: 'whalewingSkills' });
    ctx.typert.register(contract.host);
    ctx.inject(['tools', 'sandboxPolicy'], scope => registerTool(scope));
    this.host.commands.handle('skill', (input, caller) => this.host.execute(input, caller));
    // MCP（0.2.2-rc.3.2 起）：存在 DSH 自己的配置里，由 DSH 的 MCP 管理器连；鲸翼只记显示名称和插件包带的定义。
    // 要 DSH 的 MCP 管理器、设置服务和存储服务都在才开；插件包带的登记随这个作用域一起撤回。
    this.mcpReady = new Promise(resolve => { this.resolveMcp = resolve; });
    ctx.inject(['storageDomain', 'mcpManager', 'settings'], async scope => {
      const directory = await this.host.profileDirectory();
      const metaStore = await scope.storageDomain.open(metaDomain(directory));
      const legacyStore = await scope.storageDomain.open(legacyDomain);
      // 插件包带的 MCP 只在包开着时登记：先读一遍装了哪些包。
      const mcp = new McpServers(scope, { meta: metaStore.table('meta'), notes: metaStore.table('notes'), legacy: legacyStore.table('servers'), packEnabled: name => Boolean(this.packs.get(name)?.enabled) });
      scope.effect(() => () => { mcp.close(); metaStore.close(); legacyStore.close(); if (this.mcp === mcp) this.mcp = undefined; }, '鲸翼 MCP');
      await this.packs.load().catch(() => {});
      // 旧版自己存的 MCP 搬进 DSH 配置（只第一次有东西可搬）；搬不了的留着，下次启动再试。
      await mcp.migrate().catch(error => scope.logger?.warn?.(`鲸翼 MCP 搬家没完成：${error.message}`));
      mcp.startPacks();
      this.mcp = mcp; this.resolveMcp(mcp);
    });
    ctx.effect(() => async () => {
      this.closing.abort(new Error('功能已卸载，当前操作停止'));
      await Promise.allSettled([...this.pending]);

    });
  }
  async manageSkills(raw, signal) {
    try {
      const input = contract.input.parse(raw);
      signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(this.host.vault.limits.operationMs), ...(signal ? [signal] : [])]);
      const operation = input.action === 'extensions' ? this.host.extensionSkills(signal)
        : input.action === 'extension_read' ? this.host.extensionSkill(input.feature, input.name, signal)
        : input.action === 'extension_save' ? this.host.saveExtensionSkill(input.feature, input.name, input.content, input.expectedHash, signal)
        : input.action === 'scopes' ? this.host.scopedSkills(signal)
        : input.action === 'scope_read' ? this.host.scopedSkill(input.path, signal)
        : input.action === 'upload' ? this.upload(input, signal)
        : input.action === 'market_home' ? this.market.home(Boolean(input.refresh), signal).then(market => ({ market }))
        : input.action === 'market_search' ? this.market.search(input.query, signal)
        : input.action === 'market_preview' ? this.market.preview(input.id, signal)
        : input.action === 'market_install' ? this.market.install(input.id, input.expectedHash, signal)
        : ['list', 'read', 'create', 'update', 'remove', 'reset'].includes(input.action)
        ? this.host.skills.manage(input, signal)
        : this.host.execute({ ...input, domain: 'skill' }, { kind: 'human', signal });
      this.pending.add(operation);
      try {
        const result = await operation;
        if (!['list', 'read', 'extensions', 'extension_read', 'scopes', 'scope_read', 'market_home', 'market_search', 'market_preview'].includes(input.action)) this.ctx.emit('whalewing/changed');
        return contract.result.parse(result);
      } finally { this.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }
  async manageMcp(raw, signal) {
    try {
      const input = contract.mcpInput.parse(raw);
      signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(this.host.vault.limits.operationMs), ...(signal ? [signal] : [])]);
      const mcp = await this.mcpService();
      if (input.action === 'save' || input.action === 'probe') {
        const server = input.server;
        // 新加的英文名照鲸翼的规则；DSH 配置文件里手写的（可能有大写、下划线）改的时候不拦。
        if (input.action === 'save' && input.expectedRevision === null && !serverNamePattern.test(server.name)) fail('MCP_NAME', '英文名只能用小写字母、数字和单个短横线，最长 32 个字符');
        if (server.transport === 'stdio' && !server.command?.trim()) fail('MCP_INPUT', '本机程序要填命令，比如 npx');
        if (server.transport === 'streamable-http' && !server.urlSecret && !/^https?:\/\//.test(server.url ?? '')) fail('MCP_INPUT', '远程服务要填 http:// 或 https:// 开头的地址');
      }
      const result = input.action === 'list' ? await mcp.list()
        : input.action === 'save' ? await mcp.save(input)
        : input.action === 'toggle' ? await mcp.setEnabled(input.name, input.enabled, input.expectedRevision)
        : input.action === 'reconnect' ? await mcp.reconnect(input.name)
        : input.action === 'secret' ? await mcp.setSecret(input.name, input.field, input.value)
        : input.action === 'probe' ? await mcp.probe(input.server, signal)
        : input.action === 'dismiss' ? await mcp.dismissNotice()
        : await mcp.remove(input.name, input.expectedRevision);
      return contract.mcpResult.parse(result);
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

  /** MCP 挂载要等 DSH 的存储服务；十秒还没好就说明一句。 */
  async mcpService() {
    return this.mcp ?? Promise.race([this.mcpReady, new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('DSH 的 MCP 管理器还没准备好，MCP 暂时读不了，请稍后重试；MCP 要 DSH 0.2.2-rc.3 或更新的版本'), { code: 'MCP_CLOSED' })), 10000).unref?.())]);
  }

  async managePacks(raw, signal) {
    try {
      const input = contract.packInput.parse(raw);
      // 下载 GitHub 上的包可能比一般操作慢，给到至少两分钟。
      signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(Math.max(this.host.vault.limits.operationMs, 120000)), ...(signal ? [signal] : [])]);
      const operation = this.packOperation(input, signal);
      this.pending.add(operation);
      try {
        const result = await operation;
        if (['install', 'toggle', 'remove'].includes(input.action)) this.ctx.emit('whalewing/changed');
        return contract.packResult.parse(result);
      } finally { this.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

  async packOperation(input, signal) {
    const packs = this.packs;
    if (input.action === 'list') return { packs: (await packs.load(signal)).map(packView) };
    if (input.action === 'market') return { markets: await this.packMarket.home(Boolean(input.refresh), signal, input.id) };
    if (input.action === 'market_add') return { markets: await this.packMarket.addMarket(input.repo, signal) };
    if (input.action === 'market_remove') return { markets: await this.packMarket.removeMarket(input.id, signal) };
    if (input.action === 'skill') return { skill: await packs.readSkill(input.name, input.skill, signal) };
    if (input.action === 'preview' || input.action === 'upload') {
      const { stage, pack, source } = await this.packMarket.preview(input.action === 'upload' ? { upload: input } : { entry: input.entry }, signal);
      await packs.load(signal);
      const taken = await this.skillNames(pack.name, signal), old = packs.get(pack.name);
      // 原来就装好的 MCP（按包里的 key 认）：更新时沿用，不再填。
      const kept = new Set((old?.mcp ?? []).map(item => item.key));
      return { preview: {
        stage, hash: pack.hash, name: pack.name, title: pack.title, description: pack.description, version: pack.version, author: pack.author, homepage: pack.homepage, source, installed: Boolean(old),
        ...(old ? { update: { version: old.version ?? '', same: old.hash === pack.hash } } : {}),
        skills: pack.skills.map(skill => ({ name: skill.name, description: skill.description, ...(taken.has(skill.name) ? { conflict: true } : {}) })), skipped: pack.skipped, issues: pack.issues,
        // 本机程序装好就会在员工电脑上运行：鲸翼精选以外的都提醒一句，市场里的默认不勾。
        mcp: pack.mcp.map(plan => {
          const runs = plan.transport === 'stdio' && source.kind !== 'curated';
          const hint = plan.hint || (runs ? '装好后会在你的电脑上运行这条命令；不认识作者的话先看看包里的内容' : '');
          if (!plan.blocked && kept.has(plan.key)) return { key: plan.key, title: plan.title, transport: plan.transport, target: plan.target, fields: [], ready: true, kept: true };
          return {
            key: plan.key, title: plan.title, transport: plan.transport, target: plan.target,
            fields: plan.fields.map(({ fallback, ...field }) => ({ ...field, ...(fallback !== undefined && !field.help ? { help: fallback ? `不填就用 ${fallback}` : '可以不填' } : {}) })),
            ...(plan.blocked ? { blocked: plan.blocked } : {}), ...(hint ? { hint } : {}),
            ready: !plan.blocked && !plan.hint && !plan.fields.some(field => field.id === '__url') && !(runs && source.kind === 'market'),
          };
        }),
      } };
    }
    if (input.action === 'install') return this.installPack(input, signal);
    if (input.action === 'toggle') {
      const record = await packs.update(input.name, { enabled: input.enabled }, signal);
      (await this.mcpService().catch(() => null))?.setPack(input.name, input.enabled);
      return { pack: packView(record) };
    }
    const mcp = await this.mcpService().catch(() => null);
    const removed = mcp ? await mcp.removePack(input.name) : [];
    await packs.remove(input.name, signal);
    return { removed: input.name, mcp: removed };
  }

  /** 已有的技能名：个人的、内置的，和别的插件包里的；预览时标出同名的。 */
  async skillNames(except, signal) {
    const names = new Set();
    let offset = 0;
    for (let page = 0; page < 100; page++) {
      const value = await this.host.skills.catalog(offset, signal);
      for (const entry of value.entries) names.add(entry.name);
      if (!value.truncated || !value.entries.length) break;
      offset = value.offset + value.entries.length;
    }
    for (const record of this.packs.records.values()) if (record.name !== except) for (const skill of record.skills) names.add(skill.name);
    return names;
  }

  /**
   * 安装插件包：先把勾选的 MCP 都拼好（缺必填的就停，什么都不写），再放包的文件，最后逐个加 MCP（不等连上）。
   * 某个 MCP 加不上不影响整个包，记进“没装的 MCP”并告诉员工。
   */
  async installPack(input, signal) {
    const { pack, source } = this.packMarket.staged(input.stage, input.expectedHash);
    await this.packs.load(signal);
    // 装过同名的包：原地更新到这一份（2026-11-18 起；原来要先卸载）。
    const old = this.packs.get(pack.name);
    if (old && old.hash === pack.hash) fail('PACK_SAME', `装的已经是这一份「${pack.title}」了，不用更新`);
    // 原来就装好、新版里还在的 MCP 沿用原来的设置和密钥；新版去掉了的撤掉。
    const keptMcp = (old?.mcp ?? []).filter(item => pack.mcp.some(plan => plan.key === item.key && !plan.blocked));
    const droppedMcp = (old?.mcp ?? []).filter(item => !keptMcp.includes(item));
    const wanted = pack.mcp.filter(plan => !plan.blocked && !keptMcp.some(item => item.key === plan.key) && input.mcp.some(item => item.key === plan.key));
    const mcp = wanted.length || droppedMcp.length || keptMcp.length ? await this.mcpService() : null;
    const taken = mcp ? mcp.takenNames() : new Set();
    const chosen = [], skippedMcp = [];
    for (const plan of pack.mcp) {
      const pick = input.mcp.find(item => item.key === plan.key);
      // DSH 连不了的（浏览器授权、老式 SSE）不装，也不记进“没装的 MCP”：用不了的不写（2026-11-09 用户定）。
      if (plan.blocked || keptMcp.some(item => item.key === plan.key)) continue;
      if (!pick) { skippedMcp.push({ key: plan.key, reason: '安装时没勾选' }); continue; }
      const name = freeName(plan.key, taken); taken.add(name);
      const composed = composePackServer(plan, pick.values, { name, title: plan.title });
      if (composed.missing) fail('PACK_MCP_MISSING', `MCP「${plan.title}」还没填：${composed.missing.join('、')}`);
      chosen.push({ plan, server: composed.server });
    }
    if (mcp && !mcp.credentials && chosen.some(({ server }) => server.urlSecret || server.env.some(row => row.secret) || server.headers.some(row => row.secret))) fail('MCP_NO_CREDENTIALS', 'DSH 的凭据库没有加载，带密钥的 MCP 暂时存不了；可以先不勾这些 MCP');
    const record = {
      name: pack.name, title: pack.title, description: pack.description, version: pack.version, author: pack.author, homepage: pack.homepage, source,
      // 更新时开没开、什么时候装的照旧，另记一个更新时间。
      enabled: old ? Boolean(old.enabled) : true, installedAt: old?.installedAt ?? new Date().toISOString(), ...(old ? { updatedAt: new Date().toISOString() } : {}),
      hash: pack.hash, skills: pack.skills, mcp: keptMcp, skippedMcp, skipped: pack.skipped, issues: pack.issues,
    };
    if (old) {
      // 换文件前先停掉这个包的 MCP（本机程序可能正用着包里的文件），换完按包开没开再登记回去。
      mcp?.setPack(pack.name, false);
      try { await this.packs.replace(pack, record, signal); }
      finally { mcp?.setPack(pack.name, Boolean(old.enabled)); }
    } else await this.packs.install(pack, record, signal);
    const removedMcp = droppedMcp.length && mcp ? await mcp.removePack(pack.name, droppedMcp.map(item => item.server)) : [];
    const done = [], failed = [];
    for (const { plan, server } of chosen) {
      try { await mcp.save({ server, expectedRevision: null }, { pack: pack.name }); done.push({ key: plan.key, server: server.name }); }
      catch (error) { failed.push({ key: plan.key, reason: plain(error.message) }); }
    }
    const saved = await this.packs.update(pack.name, { mcp: [...keptMcp, ...done], skippedMcp: [...skippedMcp, ...failed] }, signal);
    this.packMarket.forget(input.stage);
    return { pack: packView(saved), failed, ...(old ? { updated: true, removedMcp } : {}) };
  }

  /** 上传的压缩包或 SKILL.md：摊开后装成“我的”里的个人技能。 */
  async upload({ data }, signal) {
    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw Object.assign(new Error('上传的文件太大了，技能压缩包最多 10 MB'), { code: 'SKILL_SIZE' });
    return this.host.skills.importBundle(unpackUpload(bytes), null, signal);
  }

}
