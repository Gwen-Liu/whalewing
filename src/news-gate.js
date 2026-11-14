import { abort, fail } from './vault.js';
import { isScheduledDelivery } from './schedule-notice.js';

export const newsSkippedNotice = '「每日阅读」已关闭，本次资讯未生成';
// 扩展登记的任务：登记它的扩展关着（或卸载了）时到点跳过，和资讯一样在任务会话里留这句说明。
export const taskSkippedNotice = '登记这个任务的扩展没有打开，本次没有运行';
export const skippedNotices = new Set([newsSkippedNotice, taskSkippedNotice]);

/**
 * 到点运行门：每日阅读关闭时跳过资讯；登记任务的扩展没打开时跳过扩展任务。
 * 关闭判断归核心；这里只消费活动登记与宿主身份、inbox和命令日志，不写资讯或任务域。
 * DSH 刚启动时会先补投错过的那次，扩展可能还没登记，所以扩展任务先等一会儿（tasks.startupWaitMs）再判断。
 */
export function installNewsGate(ctx, registry, tasks) {
  const closing = new AbortController(), pending = new Set(), receipts = new WeakMap();
  const active = () => registry.snapshot().features.some(feature => feature.id === 'cards' && feature.kind === 'optional' && !feature.error);
  const stop = ctx.on('agent/pre-step', (payload, next) => {
    const operation = (async () => {
      const decision = await next();
      const { agent, messages, signal } = payload;
      if (decision.kind === 'reject') return decision;
      const purpose = ctx.sessionProjections.stateOf(agent.session, 'whalewingAutomation')?.purpose;
      if (purpose !== 'news' && purpose !== 'extension') return decision;
      const blocked = new Set(messages.filter(isScheduledDelivery).map(message => message.id));
      if (!blocked.size) return decision;
      let notice;
      if (purpose === 'news') {
        if (active()) return decision;
        notice = newsSkippedNotice;
      } else {
        const owner = ctx.sessionProjections.stateOf(agent.session, 'whalewingTaskOwner')?.owner;
        if (owner && tasks && await tasks.waitFor(owner, tasks.startupWaitMs, AbortSignal.any([signal, closing.signal]))) return decision;
        notice = taskSkippedNotice;
      }
      try {
        abort(signal); abort(closing.signal);
        const events = agent.session.snapshotEvents();
        const origins = new Map(), recorded = new Set(), commands = new Set();
        // 一次扫描原生日志，不为每条同批消息重扫历史，也不保存第二份持久状态。
        for (const event of events) {
          if (event.type === 'agent/inbox/spliced') {
            for (const message of event.data.inserted) if (blocked.has(message.id) && isScheduledDelivery(message) && !origins.has(message.id)) origins.set(message.id, event.seq);
          } else if (event.type === 'command/run' && event.data.name === 'whalewing') commands.add(event.data.commandId);
          else if (event.type === 'command/done' && commands.delete(event.data.commandId) && event.data.kind === 'success' && event.data.text === notice) recorded.add(event.data.sourceEventSeq);
        }
        if (origins.size !== blocked.size) fail('NEWS_SKIP_SOURCE', '资讯输入的原始记录尚未确认，未跳过本次请求');
        for (const sourceEventSeq of new Set(origins.values())) {
          // 未知持久化结果后重试，复用已有命令回执而不是重复追加说明。
          if (recorded.has(sourceEventSeq)) continue;
          receipts.set(agent, { sourceEventSeq, notice });
          try {
            const result = await ctx.commands.execute(agent, '/whalewing {"action":"automation_skip"}', [], signal);
            if (result?.result.kind !== 'success' || result.result.text !== notice || result.result.sourceEventSeq !== sourceEventSeq) fail('NEWS_SKIP_NOTICE', '跳过说明尚未写入，请保留原会话并重试');
          } finally { receipts.delete(agent); }
          abort(signal); abort(closing.signal);
        }
        // 命令回执与此前的claim一同经过原生持久化检查点，确认后才把输入判为已跳过。
        if (!await ctx.sessions.flush(agent.session)) fail('PERSISTENCE', '跳过说明尚未确认保存，请保留原会话并重试');
        abort(signal); abort(closing.signal);
        if (messages.every(message => blocked.has(message.id))) return { kind: 'reject' };
        return { ...decision, messages: decision.messages.filter(message => !blocked.has(message.id)) };
      } catch (error) {
        // 原生cancel拥有清空决定；门自身失败只退还已claim输入，不自行唤醒或重试。
        if (!signal.aborted) {
          try { for (const message of messages) agent.inject(message); }
          catch (recoveryError) { throw new AggregateError([error, recoveryError], '跳过未完成，原输入恢复也失败；请保留会话日志核对'); }
        }
        throw error;
      }
    })();
    pending.add(operation);
    return operation.finally(() => pending.delete(operation));
  }, { prepend: true });
  ctx.effect(() => async () => {
    stop(); closing.abort(new Error('鲸翼已卸载，跳过操作停止'));
    await Promise.allSettled([...pending]);
  });
  return {
    notice(input, agent, signal) {
      abort(signal); abort(closing.signal);
      if (Object.keys(input).length !== 1 || !receipts.has(agent)) fail('NEWS_SKIP_NOTICE', '跳过说明仅由当前定时执行生成');
      const { sourceEventSeq, notice } = receipts.get(agent);
      return { kind: 'success', text: notice, sourceEventSeq };
    },
  };
}
