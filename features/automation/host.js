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
import { ExtensionTaskOwner } from './extension-tasks.js';
const taskWorkspaceTitle = '鲸翼定时任务';
const purposeLabel = { news: '资讯', knowledge: '每日记忆', thinking: '每周思考', extension: '扩展任务' };

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
      bindExpert: (sessionId, expertId, title, signal) => this.bindExpert(sessionId, expertId, title, signal),
      prepareModel: (sessionId, signal) => {
        const experts = ctx.get('whalewingExperts');
        if (!experts) fail('MODEL_UNAVAILABLE', '专家模型准备服务尚未加载');
        return experts.prepareModel({ sessionId, automation: true }, signal);
      },
      // 扩展登记的任务：页面上显示归属，扩展开着时员工不能取消，暂停恢复后告诉扩展。
      extensionInfo: (owner, signal) => this.extensionTasks.info(owner, signal),
      extensionRegistered: owner => Boolean(this.host.tasks?.live(owner)),
      extensionToggled: (owner, state, signal) => this.extensionTasks.toggled(owner, state, signal),
    });
    this.extensionTasks = new ExtensionTaskOwner(this);
    // 扩展登记、改内容或撤销时对一遍 DSH 里的任务；扩展 remove() 由这里删。
    if (this.host.tasks) {
      this.host.tasks.remover = (owner, signal) => this.extensionTasks.remove(owner, signal);
      const off = this.host.tasks.subscribe(() => { this.extensionTasks.sync(this.closing.signal).catch(() => {}); });
      ctx.effect(() => () => { off(); if (this.host.tasks.remover) this.host.tasks.remover = undefined; });
      if (this.host.tasks.list().length) this.extensionTasks.sync(this.closing.signal).catch(() => {});
    }
    // 扩展任务的一轮跑完（任务会话空闲下来）就把结果告诉扩展。
    ctx.on('agent/status', ({ status, agent }) => {
      if (status !== 'idle' || !agent?.session) return;
      const owner = ctx.get('sessionProjections')?.stateOf(agent.session, 'whalewingTaskOwner')?.owner;
      if (owner) this.extensionTasks.reportRuns(owner).catch(() => {});
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
      // 扩展登记的任务在依赖齐了以后再对一遍（扩展可能比定时服务先登记）。
      try { await this.extensionTasks.sync(lifecycle.signal); } catch { /* 每个任务的原因已经告诉扩展。 */ }
    });

    ctx.effect(() => async () => {
      this.closing.abort(new Error('功能已卸载，当前操作停止'));
      await Promise.allSettled([...this.pending]);
      await this.defaults.close();
      await this.extensionTasks.close();
    });
  }
  async manageAutomation(raw, signal) {
    try {
      const input = contract.input.parse(raw);
      if (Buffer.byteLength(JSON.stringify(input)) > 131072) fail('SIZE', '计划请求超过 128 KiB');
      signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(this.host.vault.limits.operationMs), ...(signal ? [signal] : [])]);
      // 启动时没配模型或没建成的，员工打开定时任务页时再试一次；没建成不影响列出任务。
      if (input.action === 'catalog' && this.builtInsRetry && this.modelReady()) await this.openBuiltIns(signal).catch(() => {});
      if (input.action === 'catalog' && this.extensionTasks.retry) await this.extensionTasks.sync(signal).catch(() => {});
      const operation = this.automation.manage(input, signal);
      this.pending.add(operation);
      try { return contract.result.parse(await operation); }
      finally { this.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, error.recovery ? { sessionId: error.sessionId, recovery: error.recovery } : {}); }
  }

  /** 扩展任务读会话：任务的记录（从什么时候起读、暂停过的时段、处理到哪天）和登记情况。 */
  taskProgress(owner, signal) { return this.extensionTasks.progress(owner, signal); }
  /** 扩展任务读会话：模型标记一天做完了。 */
  markTaskDay(owner, date, signal) { return this.extensionTasks.markDay(owner, date, signal); }

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
   * fresh 为假时只恢复同一个会话，不另建。每日资讯、默认打开的每日记忆和每周思考、扩展登记的任务共用；
   * 扩展任务另带归属 owner（`功能id/任务id`），认领时一起记进会话。
   */
  async claimTaskSession(sessionId, purpose, signal, fresh = false, owner) {
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
    const claimed = async () => {
      const current = await this.host.automationClaim(sessionId, signal);
      return current.purpose === purpose && (purpose !== 'extension' || current.owner === owner);
    };
    if (!await claimed()) {
      agent ||= this.ctx.get('agents')?.get(sessionId);
      if (!agent) fail('AUTOMATION_UNAVAILABLE', `${label}会话尚未就绪，请按原身份重试`);
      const commands = this.ctx.get('commands');
      if (!commands) fail('AUTOMATION_UNAVAILABLE', '宿主命令服务尚未加载，请稍后重试');
      const execution = await commands.execute(agent, `/whalewing ${JSON.stringify({ action: 'automation_claim', purpose, ...(purpose === 'extension' ? { owner } : {}) })}`, [], signal);
      if (execution?.result?.kind !== 'success') fail('AUTOMATION_IDENTITY', `${label}会话用途认领失败，请按原身份重试`);
    }
    await this.automation.dependencies.confirmClaim(sessionId, signal);
    if (!await claimed()) fail('AUTOMATION_IDENTITY', `${label}会话用途尚未回读确认`);
  }

  /** 把自建任务的会话挂到专家名下：用正式的专家选择命令，写盘后回读确认；标题改成“专家名 · 任务名”方便在侧栏找。 */
  async bindExpert(sessionId, expertId, title, signal) {
    const experts = this.ctx.get('whalewingExperts'), commands = this.ctx.get('commands'), controller = this.ctx.get('sessionController'), projections = this.ctx.get('sessionProjections');
    if (!experts || !commands || !projections) fail('AUTOMATION_UNAVAILABLE', '专家服务尚未加载，请稍后重试');
    const expert = experts.get(expertId);
    if (expert.id === 'manager') fail('AUTOMATION_EXPERT', '定时任务请交给负责这件事的专家，不挂在助手自己名下');
    let agent = this.ctx.get('agents')?.get(sessionId);
    if (!agent && controller) {
      const resolved = await controller.resolveAgent(sessionId);
      if (resolved.error) throw resolved.error;
      agent = resolved.agent;
    }
    if (!agent) fail('AUTOMATION_UNAVAILABLE', '任务会话尚未就绪，请按原身份重试');
    abort(signal);
    const done = await commands.execute(agent, `/whalewing-expert ${JSON.stringify({ expertId: expert.id })}`, [], signal ?? new AbortController().signal);
    if (done?.result?.kind !== 'success') fail('AUTOMATION_EXPERT', `没能挂到「${expert.name}」名下：${done?.result?.text || '专家选择没有完成'}`);
    if (!(await this.ctx.sessions.flush(agent.session))) fail('PERSISTENCE', '专家选择尚未确认保存，请保留原会话并回读');
    if (projections.stateOf(agent.session, 'whalewingExpert')?.view.expertId !== expert.id) fail('AUTOMATION_EXPERT', '专家选择读回不一致，请保留原会话核对');
    if (typeof controller?.rename === 'function') {
      try { await controller.rename({ sessionId, title: `${expert.name} · ${title}` }); }
      catch { /* 标题只方便查找，设不上不影响任务。 */ }
    }
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
