import { z } from 'zod';
import { isExactProjection } from '../../src/session-projection.js';
import { newsSkippedNotice } from '../../src/news-gate.js';
import { runStatuses } from './contract.js';

export const runsKey = 'whalewingRuns';
// 原生历史默认保留 30 天；按每天一次留足余量，同时限制每个会话页随带的大小。
const keep = 50;
const pendingStates = new Set(['waiting', 'running']);
// 轮次结束原因来自 DSH 会话日志；未列出的新原因不当成功也不当失败。
const endings = { completed: 'completed', error: 'error', aborted: 'interrupted', interrupted: 'interrupted', 'max-tokens': 'incomplete', blocked: 'skipped' };

const run = z.object({ messageId: z.string(), receivedAt: z.number(), seq: z.number(), state: z.enum(runStatuses) });
const queue = z.object({ 'next-turn': z.array(z.string()), 'next-step': z.array(z.string()) });
const isSchedule = message => message?.source?.kind === 'schedule' && typeof message.id === 'string';

function update(runs, pick, next) {
  let changed = false;
  const result = runs.map(row => {
    const state = pick(row) ? next(row) : row.state;
    if (state === row.state) return row;
    changed = true;
    return { ...row, state };
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
      const runs = update(state.runs, row => row.state === 'running' || !state.queue && row.state === 'waiting', row => row.state === 'running' ? ending : 'unknown');
      return runs === state.runs ? state : { ...state, runs };
    }
    case 'command/done': {
      // 资讯门写下的跳过说明指向送达这条消息的事件序号；其它命令不改变运行结果。
      const data = event.data;
      if (data?.kind !== 'success' || data.text !== newsSkippedNotice || !Number.isSafeInteger(data.sourceEventSeq)) return state;
      const runs = update(state.runs, row => row.seq === data.sourceEventSeq && pendingStates.has(row.state), () => 'skipped');
      return runs === state.runs ? state : { ...state, runs };
    }
    default: return state;
  }
}

/** 从会话日志折叠每次定时送达的结果；所有会话都会经过这里，所以只认定时消息、任何异常都保持原状态。 */
export const runsProjection = {
  key: runsKey, stateVersion: 1,
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
