import { Service } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { abort, fail } from '../../src/vault.js';
import { registerBuiltin } from '../../src/features.js';
import { LockedDomain } from '../../src/host/locked-domain.js';
import { requireExactProjection, assertCreatedSession, sessionIssue } from '../../src/session-projection.js';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';
import { Automation, initializeBuiltIns } from './automation.js';
import { sessionSchedule } from '../../src/schedule-compat.js';
import { automationContract } from './contract.js';
import { runsProjection } from './runs.js';
const taskWorkspaceTitle = '鲸翼定时任务';
const purposeLabel = { news: '资讯', knowledge: '每日记忆', thinking: '每周思考' };

// 每日记忆和每周思考“已自动建过”的记录，按 profile 分开；和资讯一样，只记会话身份和是否建过。
const defaultsDomain = defineDomain({ name: 'whalewing_automation_defaults', version: 1, tables: { lifecycle: domainTable(z.union([z.strictObject({ accepted: z.literal(true) }), z.strictObject({ sessionId: z.string().regex(/^[\w-]{1,100}$/) })])) } });
const profileDefaultsDomain = directory => defineDomain({ ...defaultsDomain, name: `${defaultsDomain.name}_${createHash('sha256').update(directory).digest('hex')}` });

const contract = automationContract(z);
export default class AutomationHost extends Service {
  static inject = ["whalewing", "typert", "sessions"];
  constructor(ctx) {
    super(ctx, 'whalewingAutomation');
    registerBuiltin(ctx, 'automation');
    this.host = ctx.whalewing;
    this.closing = new AbortController();
    this.pending = new Set();
    this.typertRemote = bindTypertRemote(this, 'whalewingAutomation', { namespace: 'whalewingAutomation' });
    ctx.typert.register(contract.host);
    this.automation = new Automation({
      listWorkspaces: signal => this.host.listWorkspaces(signal),
      taskDirectory: signal => this.taskDirectory(signal),
      schedule: () => sessionSchedule(ctx.get('schedule')),
      projections: (sessionId, signal) => {
        const controller = ctx.get('sessionController');
        if (!controller) fail('AUTOMATION_UNAVAILABLE', '宿主会话服务尚未加载');
        return controller.projections({ sessionId }, signal);
      },
      confirmClaim: async (sessionId, signal) => {
        abort(signal);
        const session = ctx.sessions.get(sessionId);
        if (!session || !await ctx.sessions.flush(session)) fail('PERSISTENCE', '自动任务用途尚未确认持久化，请保留原会话并回读');
      },
      prepareModel: (sessionId, signal) => {
        const experts = ctx.get('whalewingExperts');
        if (!experts) fail('MODEL_UNAVAILABLE', '专家模型准备服务尚未加载');
        return experts.prepareModel({ sessionId, automation: true }, signal);
      },
    });
    this.defaults = new LockedDomain({
      directory: signal => this.host.profileDirectory(signal),
      facility: () => {
        const facility = ctx.get('storageDomain');
        if (!facility) fail('AUTOMATION_UNAVAILABLE', '宿主本地存储服务尚未加载，没有自动开启每日记忆和每周思考');
        return facility;
      },
      lockName: 'whalewing-automation-defaults', definition: profileDefaultsDomain,
      create: domain => ({ lifecycle: domain.table('lifecycle'), async dispose() {} }),
    });
    ctx.inject(['workspaceRegistry'], async () => { try { await this.taskWorkspace(this.closing.signal); } catch { /* 创建任务时保留原入口重试。 */ } });
    // 运行结果随会话日志折叠；注册随本功能卸载，旧版插件读到缓存里的这一项会直接忽略。
    ctx.inject(['sessionProjections'], scope => { scope.sessionProjections.register(runsProjection); });
    // 每日记忆和每周思考默认打开：完整的 DSH 启动后自动建一次；没配模型或没建成的，打开定时任务页时再试。
    ctx.inject(['schedule', 'sessionController', 'storageDomain', 'profileContext', 'agents', 'commands', 'whalewingExperts', 'agentDefaultModel'], async scope => {
      const lifecycle = new AbortController();
      scope.effect(() => () => lifecycle.abort(new Error('每日记忆和每周思考的默认任务依赖已卸载')));
      try { await this.openBuiltIns(lifecycle.signal); } catch { /* 原因记在 builtInsError，打开定时任务页时再试。 */ }
    });

    ctx.effect(() => async () => {
      this.closing.abort(new Error('功能已卸载，当前操作停止'));
      await Promise.allSettled([...this.pending]);
      await this.defaults.close();
    });
  }
  async manageAutomation(raw, signal) {
    try {
      const input = contract.input.parse(raw);
      if (Buffer.byteLength(JSON.stringify(input)) > 131072) fail('SIZE', '计划请求超过 128 KiB');
      signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(this.host.vault.limits.operationMs), ...(signal ? [signal] : [])]);
      // 启动时没配模型或没建成的，员工打开定时任务页时再试一次；没建成不影响列出任务。
      if (input.action === 'catalog' && this.builtInsRetry && this.modelReady()) await this.openBuiltIns(signal).catch(() => {});
      const operation = this.automation.manage(input, signal);
      this.pending.add(operation);
      try { return contract.result.parse(await operation); }
      finally { this.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, error.recovery ? { sessionId: error.sessionId, recovery: error.recovery } : {}); }
  }

  modelReady() {
    const selected = this.ctx.get('agentDefaultModel')?.currentSelection?.();
    return Boolean(selected?.provider && selected?.model);
  }

  /** 自动建每日记忆和每周思考；同一时间只跑一份。和资讯默认任务同时提交时排队，见 Automation.manageWhenIdle。 */
  async openBuiltIns(signal) {
    if (this.openingBuiltIns) return this.openingBuiltIns;
    const operation = (async () => {
      const limit = AbortSignal.any([this.defaults.signal, this.closing.signal, AbortSignal.timeout(120_000), ...(signal ? [signal] : [])]);
      try {
        const result = await this.defaults.run(async () => {
          const owner = await this.defaults.get(limit);
          return initializeBuiltIns({
            automation: this.automation, state: owner.lifecycle, signal: limit,
            claimSession: (sessionId, purpose, nextSignal, fresh) => this.claimTaskSession(sessionId, purpose, nextSignal, fresh),
            modelReady: () => this.modelReady(),
            newSessionId: purpose => `whalewing-${purpose}-${randomUUID()}`,
          });
        });
        this.builtInsRetry = Boolean(result.waiting);
        this.builtInsError = undefined;
        return result;
      } catch (error) {
        this.builtInsRetry = true;
        this.builtInsError = String(error?.message || error).slice(0, 400);
        throw error;
      }
    })();
    this.openingBuiltIns = operation;
    try { return await operation; } finally { this.openingBuiltIns = undefined; }
  }

  /**
   * 定时任务的会话：建在“鲸翼定时任务”工作区里（宿主没有工作区服务时退回只给目录），认领用途并确认已经写盘。
   * fresh 为假时只恢复同一个会话，不另建。每日资讯和默认打开的每日记忆、每周思考共用。
   */
  async claimTaskSession(sessionId, purpose, signal, fresh = false) {
    const label = purposeLabel[purpose];
    const controller = this.ctx.get('sessionController');
    const workspace = await this.taskWorkspace(signal);
    const location = workspace ? { workspaceId: workspace.id } : { cwd: await this.taskDirectory(signal) };
    abort(signal);
    let agent;
    if (fresh) {
      const created = await controller.create({ sessionId, ...location, agentPreset: 'standard' });
      assertCreatedSession(created, sessionId);
      if (created.agentPreset !== 'standard') fail('AUTOMATION_IDENTITY', `${label}会话身份尚未确认`);
    } else {
      requireExactProjection(await controller.projections({ sessionId }, signal), sessionId, ['whalewingAutomation']);
      const registry = this.ctx.get('workspaceRegistry');
      if (!registry || !Array.isArray(registry.archivedSessionIds)) throw sessionIssue('SESSION_UNCONFIRMED', '会话归档状态还没确认，请等待工作区加载后重新检查', sessionId);
      if (registry.archivedSessionIds.includes(sessionId)) throw sessionIssue('SESSION_ARCHIVED', '这个会话已归档，请在 DSH 里取消归档后重试', sessionId, 'open');
      const resolved = await controller.resolveAgent(sessionId);
      if (resolved.error) {
        // 原生归属错误可能不带身份；只使用本次恢复请求的原ID。
        const reasons = { 'session/writer-held': '原会话写入权正被其它窗口或进程占用，请关闭占用后重试', 'session/agent-busy': '原会话属于子代理，请打开原会话处理', 'session/conflict': '原会话工作目录不同，请打开原会话核对' };
        if (reasons[resolved.error.code]) throw sessionIssue(resolved.error.code, reasons[resolved.error.code], sessionId, 'open');
        throw resolved.error;
      }
      agent = resolved.agent;
      const expectedCwd = workspace?.path || await this.taskDirectory(signal);
      if (agent.session.header.cwd !== expectedCwd) throw sessionIssue('session/conflict', '原会话工作目录与定时任务目录不同，请打开原会话核对', sessionId, 'open');
      if (workspace) {
        await workspace.attachSession(sessionId);
        if (!workspace.sessionIds.includes(sessionId)) throw sessionIssue('SESSION_UNCONFIRMED', '原会话工作区关联还没确认，请重新检查', sessionId);
      }
    }
    abort(signal);
    if (await this.host.automationIdentity(sessionId, signal) !== purpose) {
      agent ||= this.ctx.get('agents')?.get(sessionId);
      if (!agent) fail('AUTOMATION_UNAVAILABLE', `${label}会话尚未就绪，请按原身份重试`);
      const commands = this.ctx.get('commands');
      if (!commands) fail('AUTOMATION_UNAVAILABLE', '宿主命令服务尚未加载，请稍后重试');
      const execution = await commands.execute(agent, `/whalewing ${JSON.stringify({ action: 'automation_claim', purpose })}`, [], signal);
      if (execution?.result?.kind !== 'success') fail('AUTOMATION_IDENTITY', `${label}会话用途认领失败，请按原身份重试`);
    }
    await this.automation.dependencies.confirmClaim(sessionId, signal);
    if (await this.host.automationIdentity(sessionId, signal) !== purpose) fail('AUTOMATION_IDENTITY', `${label}会话用途尚未回读确认`);
  }

  async taskDirectory(signal) {
    abort(signal);
    const directory = path.join(this.host.dshHome, 'whalewing-tasks');
    await mkdir(directory, { recursive: true });
    abort(signal);
    return realpath(directory);
  }

  async taskWorkspace(signal) {
    const registry = this.ctx.get('workspaceRegistry');
    if (!registry) return undefined;
    const directory = await this.taskDirectory(signal);
    const workspace = await registry.create(directory, taskWorkspaceTitle);
    abort(signal);
    return workspace;
  }

}
