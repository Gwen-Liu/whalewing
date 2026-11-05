import { Service } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { abort, fail } from '../../src/vault.js';
import { registerBuiltin } from '../../src/features.js';
import { createHash, randomUUID } from 'node:crypto';
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { LockedDomain } from '../../src/host/locked-domain.js';
import { News, newsDomain, newsLimits } from './news.js';
import { newsContract } from './contract.js';
import { Library } from './library/store.js';
import { apply as registerTool } from './tool.js';
const profileNewsDomain = directory => defineDomain({ ...newsDomain, name: `${newsDomain.name}_${createHash('sha256').update(directory).digest('hex')}` });

const contract = newsContract(z);
export default class Cards extends Service {
  static inject = ["whalewing", "typert", "whalewingAutomation", "commands"];
  constructor(ctx) {
    super(ctx, 'whalewingCards');
    registerBuiltin(ctx, 'cards');
    this.host = ctx.whalewing;
    // 书架存在 profile 目录里；服务卸载时取消进行中的解析和下载。
    this.libraryLifecycle = new AbortController();
    this.library = new Library({
      directory: signal => this.host.profileDirectory(signal),
      validate: { state: value => contract.library.state.parse(value), catalog: value => contract.library.catalog.parse(value) },
    });
    this.resource = new LockedDomain({
      directory: signal => this.host.profileDirectory(signal),
      facility: () => {
        const facility = this.ctx.get('storageDomain');
        if (!facility) fail('NEWS_UNAVAILABLE', '宿主本地存储服务尚未加载，未修改资讯或知识库');
        return facility;
      },
      lockName: 'whalewing-news', definition: profileNewsDomain,
      create: domain => new News(domain, {
        learning: nextSignal => this.library.daily(nextSignal),
        identity: (sessionId, nextSignal) => this.host.automationIdentity(sessionId, nextSignal),
        catalog: nextSignal => this.ctx.whalewingAutomation.automation.catalog(nextSignal),
        pause: (task, nextSignal) => {
          const { sessionId, status, purpose: _purpose, lastDelivery: _delivery, displayPrompt: _display, workspaceScope: _scope, ...expected } = task;
          return this.ctx.whalewingAutomation.automation.manage({ action: 'pause', sessionId, id: task.id, expected, expectedStatus: status }, nextSignal);
        },
      }),
    });
    this.typertRemote = bindTypertRemote(this, 'whalewingCards', { namespace: 'whalewingCards' });
    ctx.typert.register(contract.host);
    ctx.inject(['tools', 'whalewingCards'], scope => registerTool(scope));
    ctx.inject(['schedule', 'sessionController', 'storageDomain', 'profileContext', 'agents'], async scope => {
        const lifecycle = new AbortController();
        scope.effect(() => () => lifecycle.abort(new Error('资讯默认任务依赖已卸载')));
        const operation = this.resource.run(() => this.initializeNews(AbortSignal.any([this.resource.signal, lifecycle.signal, AbortSignal.timeout(newsLimits.deadlineMs)])));
        try { await operation; this.defaultNewsError = undefined; }
        catch (error) { this.defaultNewsError = { sessionId: error.sessionId || 'default-news', message: `每日资讯默认任务未完成初始化：${error.message}`.slice(0, 400) }; }
    });

    ctx.effect(() => () => { this.libraryLifecycle.abort(new Error('书架服务已卸载')); return this.resource.close(); });
  }
  /**
   * 书架的全部操作；方法名与 action 一一对应。
   * 报错必须带 details（空对象也要带）：DSH 的连接层只认 details 是对象的失败回复，缺了整条回复被当成坏回复，
   * 员工只看到“插件内部出错（gateway/internal）”，书架写好的原因和办法（如“用 Calibre 转成 EPUB”）就丢了。
   */
  async manageLibrary(raw, signal) {
    try {
      const { action, ...input } = contract.library.manage.parse(raw);
      signal = AbortSignal.any([this.libraryLifecycle.signal, ...(signal ? [signal] : [])]);
      return contract.library.result.parse(await this.library[action](input, signal));
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', String(error.message).slice(0, 400), {}); }
  }

  newsOwner(signal) { return this.resource.get(signal); }

  async manageNews(raw, signal) {
    try {
      const input = contract.manage.parse(raw);
      signal = AbortSignal.any([this.resource.signal, AbortSignal.timeout(newsLimits.deadlineMs), ...(signal ? [signal] : [])]);
      const operation = this.resource.run(async () => {
        const owner = await this.newsOwner(signal); abort(signal);
        const result = await owner.manage(input, signal);
        // 默认计划属于卡片域，诊断随卡片读取返回，不反向污染底座任务目录。
        if (input.action === 'list' && this.defaultNewsError) result.dependencies.issues = [...result.dependencies.issues, this.defaultNewsError].slice(0, 500);
        return contract.result.parse(result);
      });
      return await operation;
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, error.recovery ? { sessionId: error.sessionId, recovery: error.recovery } : {}); }
  }

  async executeNews(raw, caller) {
    const input = contract.execute.parse(raw);
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException('资讯操作超时', 'TimeoutError')), newsLimits.deadlineMs);
    const signal = AbortSignal.any([this.resource.signal, deadline.signal, ...(caller.signal ? [caller.signal] : [])]);
    const operation = this.resource.run(async () => {
      const owner = await this.newsOwner(signal); abort(signal);
      return contract.executionResult.parse(await owner.execute(input, { sessionId: caller.agent?.session.id, signal }));
    });
    // 候选返回后的 receipt 继续受真实调用取消约束，但已结束请求的超时不得提前作废它。
    try { return await operation; } finally { clearTimeout(timer); }
  }

  async initializeNews(signal) {
    if (this.initializing) return this.initializing;
    const operation = (async () => {
      if (!this.ctx.get('schedule')) return this.ctx.whalewingAutomation.automation.catalog(signal);
      const state = await this.newsOwner(signal).then(async owner => { await owner.initialize(); return owner.lifecycleTable; });
      if (state.get('default-news')?.accepted) return this.ctx.whalewingAutomation.automation.catalog(signal);
      const catalog = await this.ctx.whalewingAutomation.automation.catalog(signal);
      if (catalog.issues.length) fail('AUTOMATION_IDENTITY', '资讯默认计划等待原任务身份恢复；请在设置中重试');
      const existing = catalog.tasks.filter(task => task.purpose === 'news');
      if (existing.length > 1) fail('AUTOMATION_CONFLICT', '发现多条资讯计划，请先核对原任务');
      if (existing.length) {
        await state.put('default-news', { accepted: true });
        return catalog;
      }
      let pending = state.get('default-news');
      const fresh = !pending;
      if (!pending) {
        pending = { sessionId: `whalewing-news-${randomUUID()}` };
        // 先保存身份再调用宿主；未知接纳只恢复同一身份，绝不另建会话。
        await state.put('default-news', pending);
      }
      await this.createNewsSession(pending.sessionId, signal, fresh);
      // 启动时和每日记忆、每周思考的默认任务同时提交，排队等前一个提交结束，不因 BUSY 落空。
      await this.manageSchedules({ action: 'create', sessionId: pending.sessionId, purpose: 'news' }, signal, { waitForWrites: true });
      await state.put('default-news', { accepted: true });
      return this.ctx.whalewingAutomation.automation.catalog(signal);
    })();
    this.initializing = operation;
    try { return await operation; } finally { this.initializing = undefined; }
  }

  /** 资讯会话和每日记忆、每周思考的会话同一套做法，由定时任务功能负责。 */
  createNewsSession(sessionId, signal, fresh = false) { return this.ctx.whalewingAutomation.claimTaskSession(sessionId, 'news', signal, fresh); }
  async manageSchedules(raw, signal, { waitForWrites = false } = {}) {
    const input = contract.scheduleInput.parse(raw);
    signal = AbortSignal.any([this.resource.signal, AbortSignal.timeout(newsLimits.deadlineMs), ...(signal ? [signal] : [])]);
    const operation = this.resource.run(async () => {
      if (input.action === 'initializeNews') return this.initializeNews(signal);
      const owner = await this.newsOwner(signal);
      const automation = this.ctx.whalewingAutomation.automation;
      return owner.withScheduleSpec(input.sessionId, spec => waitForWrites ? automation.manageWhenIdle({ ...input, spec }, signal) : automation.manage({ ...input, spec }, signal), signal);
    });
    try { const result = contract.scheduleResult.parse(await operation); this.defaultNewsError = undefined; return result; } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, error.recovery ? { sessionId: error.sessionId, recovery: error.recovery } : {}); }
  }
}
