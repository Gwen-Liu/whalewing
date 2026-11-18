import { z } from 'zod';
import { isExactProjection } from '../../src/session-projection.js';
import { skippedNotices } from '../../src/news-gate.js';
import { runStatuses } from './contract.js';
import { isScheduledDelivery } from '../../src/schedule-notice.js';

export const runsKey = 'whalewingRuns';
// 原生历史默认保留 30 天；按每天一次留足余量，同时限制每个会话页随带的大小。
const keep = 50;
const pendingStates = new Set(['waiting', 'running']);
// 轮次结束原因来自 DSH 会话日志；未列出的新原因不当成功也不当失败。
const endings = { completed: 'completed', error: 'error', aborted: 'interrupted', interrupted: 'interrupted', 'max-tokens': 'incomplete', blocked: 'skipped' };

// 出错时记下 DSH 给的原因（2026-11-18：原来页面只写“出错”两个字，员工不知道怎么办）。
const failure = z.object({ code: z.string(), message: z.string(), status: z.number().optional() });
const run = z.object({ messageId: z.string(), receivedAt: z.number(), seq: z.number(), state: z.enum(runStatuses), error: failure.optional() });

/** turn/end 里的出错原因，整理成短的一份：只留代码、原文（截到 300 字）和 HTTP 状态。 */
function failureOf(reason) {
  if (reason?.kind !== 'error') return undefined;
  const error = reason.error ?? {};
  const message = String(error.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return { code: typeof error.code === 'string' && error.code ? error.code.slice(0, 80) : 'UNKNOWN', message, ...(Number.isSafeInteger(error.status) ? { status: error.status } : {}) };
}
const queue = z.object({ 'next-turn': z.array(z.string()), 'next-step': z.array(z.string()) });
const isSchedule = isScheduledDelivery;

function update(runs, pick, next, error) {
  let changed = false;
  const result = runs.map(row => {
    const state = pick(row) ? next(row) : row.state;
    if (state === row.state) return row;
    changed = true;
    const { error: _old, ...rest } = row;
    return { ...rest, state, ...(state === 'error' && error ? { error } : {}) };
  });
  return changed ? result : runs;
}

/** 镜像收件箱里各位置的定时消息身份，才能知道一次领取或撤下动了哪几条。 */
function splice(state, event) {
  const { target, start, removedCount = 0, inserted = [], outcome } = event.data ?? {};
  let { queue: lists, runs } = state, removed = [];
  const list = lists?.[target];
  if (!Array.isArray(list) || !Array.isArray(inserted) || !Number.isSafeInteger(start) || !Number.isSafeInteger(removedCount) || start < 0 || removedCount < 0 || start + removedCount > list.length) lists = null;
  else {
    removed = list.slice(start, start + removedCount).filter(Boolean);
    lists = { ...lists, [target]: list.toSpliced(start, removedCount, ...inserted.map(message => isSchedule(message) ? message.id : '')) };
  }
  if (removed.length) runs = update(runs, row => removed.includes(row.messageId) && row.state === 'waiting', () => outcome === 'canceled' ? 'skipped' : 'running');
  for (const message of inserted.filter(isSchedule)) {
    const known = runs.find(row => row.messageId === message.id);
    // 同一消息被退回收件箱（如插件处理失败后归还）时回到排队，不重复记一次运行。
    if (known) runs = update(runs, row => row === known && pendingStates.has(row.state), () => 'waiting');
    else runs = [...runs, { messageId: message.id, receivedAt: Number.isFinite(event.time) ? event.time : 0, seq: event.seq, state: 'waiting' }].slice(-keep);
  }
  return lists === state.queue && runs === state.runs ? state : { queue: lists, runs };
}

function step(state, event) {
  switch (event?.type) {
    case 'agent/inbox/spliced': return splice(state, event);
    case 'turn/end': {
      const ending = endings[event.data?.reason?.kind] ?? 'unknown';
      // 镜像失效后无法确定哪些排队消息被这一轮领取，只把它们改成未知。
      const runs = update(state.runs, row => row.state === 'running' || !state.queue && row.state === 'waiting', row => row.state === 'running' ? ending : 'unknown', failureOf(event.data?.reason));
      return runs === state.runs ? state : { ...state, runs };
    }
    case 'command/done': {
      // 运行门写下的跳过说明（资讯、扩展任务）指向送达这条消息的事件序号；其它命令不改变运行结果。
      const data = event.data;
      if (data?.kind !== 'success' || !skippedNotices.has(data.text) || !Number.isSafeInteger(data.sourceEventSeq)) return state;
      const runs = update(state.runs, row => row.seq === data.sourceEventSeq && pendingStates.has(row.state), () => 'skipped');
      return runs === state.runs ? state : { ...state, runs };
    }
    default: return state;
  }
}

/** 从会话日志折叠每次定时送达的结果；所有会话都会经过这里，所以只认定时消息、任何异常都保持原状态。 */
export const runsProjection = {
  // 2：运行记录带上出错原因；换版本让旧记录从会话日志重算一遍，以前出错的那几次也能补上原因。
  key: runsKey, stateVersion: 2,
  stateSchema: z.object({ queue: queue.nullable(), runs: z.array(run) }),
  init: () => ({ queue: { 'next-turn': [], 'next-step': [] }, runs: [] }),
  apply(state, event) {
    try { return step(state, event); }
    catch { return state; }
  },
  wire: { viewSchema: z.array(run), view: state => state.runs },
};

/** 读不到精确投影或没有这次记录时返回 unknown；送达本身不代表执行成功。 */
export function runStatus(projection, messageId) {
  if (!isExactProjection(projection) || !Array.isArray(projection.values[runsKey])) return 'unknown';
  const found = projection.values[runsKey].find(row => row?.messageId === messageId);
  return found && runStatuses.includes(found.state) ? found.state : 'unknown';
}

/** 这次运行的结果和出错原因：{ status, error? }，error 只在出错时有。 */
export function runResult(projection, messageId) {
  const status = runStatus(projection, messageId);
  if (status !== 'error') return { status };
  const found = projection.values[runsKey].find(row => row?.messageId === messageId);
  return found?.error && typeof found.error.code === 'string' ? { status, error: found.error } : { status };
}
