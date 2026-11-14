import { requireExactProjection } from './session-projection.js';
import { z } from 'zod';
import { abort, fail } from './vault.js';
import { automationPurposes, taskOwnerPattern } from '../features/automation/contract.js';

export const claimCommands = new Set(['whalewing']);
export { automationPurposes, taskOwnerPattern };

/**
 * 扩展登记的任务属于谁（`功能id/任务id`）：和用途出自同一条认领回执，只认第一次成功认领；
 * 其它用途的会话、旧版鲸翼建的会话都是 null。
 */
export const taskOwnerProjection = {
  key: 'whalewingTaskOwner', stateVersion: 1,
  stateSchema: z.object({ owner: z.string().nullable(), claimed: z.boolean(), inherited: z.number(), pending: z.array(z.string()) }),
  init: (_header, inheritedEventCount) => ({ owner: null, claimed: false, inherited: inheritedEventCount, pending: [] }),
  apply(state, event) {
    if (state.claimed || event.seq < state.inherited) return state;
    if (event.type === 'command/run' && claimCommands.has(event.data.name)) return { ...state, pending: [...state.pending, event.data.commandId] };
    if (event.type !== 'command/done' || !state.pending.includes(event.data.commandId)) return state;
    let claimed = false, owner = null;
    if (event.data.kind === 'success') try {
      const result = JSON.parse(event.data.text);
      if (result.action === 'automation_claim' && automationPurposes.includes(result.purpose)) {
        claimed = true;
        if (result.purpose === 'extension' && typeof result.owner === 'string' && taskOwnerPattern.test(result.owner)) owner = result.owner;
      }
    } catch { /* 损坏或其它命令回执不记归属。 */ }
    return { ...state, owner, claimed, pending: state.pending.filter(id => id !== event.data.commandId) };
  },
  wire: { viewSchema: z.string().nullable(), view: state => state.owner },
};

/** 自动任务用途只从本命令成功回执恢复，取消计划不会抹掉排除知识来源所需身份。 */
export const automationProjection = {
  key: 'whalewingAutomation', stateVersion: 1,
  stateSchema: z.object({ purpose: z.enum(automationPurposes).nullable(), inherited: z.number(), pending: z.array(z.string()) }),
  init: (_header, inheritedEventCount) => ({ purpose: null, inherited: inheritedEventCount, pending: [] }),
  apply(state, event) {
    if (state.purpose || event.seq < state.inherited) return state;
    if (event.type === 'command/run' && claimCommands.has(event.data.name)) return { ...state, pending: [...state.pending, event.data.commandId] };
    if (event.type !== 'command/done' || !state.pending.includes(event.data.commandId)) return state;
    let purpose = null;
    if (event.data.kind === 'success') try {
      const result = JSON.parse(event.data.text);
      if (result.action === 'automation_claim' && automationPurposes.includes(result.purpose)) purpose = result.purpose;
    } catch { /* 损坏或其它命令回执不授予用途。 */ }
    return { ...state, purpose, pending: state.pending.filter(id => id !== event.data.commandId) };
  },
  wire: { viewSchema: z.enum(automationPurposes).nullable(), view: state => state.purpose },
};

/** 没有 signal 的宿主只读调用只取消本地等待，写操作始终等待真实接纳结果。 */
export async function observeAutomation(read, signal) {
  abort(signal);
  let cancel;
  try {
    return await Promise.race([Promise.resolve().then(() => { abort(signal); return read(); }), new Promise((_, reject) => {
      cancel = () => reject(signal.reason); signal?.addEventListener('abort', cancel, { once: true });
    })]);
  } finally { signal?.removeEventListener('abort', cancel); }
}

/** 自动任务身份始终从宿主投影读取，不依赖定时任务页或可选功能。 */
export async function automationIdentity(projections, sessionId, signal) {
  return (await automationClaim(projections, sessionId, signal)).purpose;
}

/** 用途和（扩展任务的）归属一起读：同一次投影读取，不分两次读出前后不一的结果。 */
export async function automationClaim(projections, sessionId, signal) {
  const result = await observeAutomation(() => projections(sessionId, signal), signal);
  abort(signal);
  requireExactProjection(result, sessionId);
  if (!Object.hasOwn(result.values, 'whalewingAutomation')) fail('AUTOMATION_IDENTITY', '自动任务投影未恢复，请保留原会话并检查日志及插件加载');
  const purpose = result.values.whalewingAutomation;
  if (purpose !== null && !automationPurposes.includes(purpose)) fail('AUTOMATION_IDENTITY', '自动任务投影无效');
  if (purpose !== 'extension') return { purpose, owner: null };
  const owner = result.values.whalewingTaskOwner;
  if (typeof owner !== 'string' || !taskOwnerPattern.test(owner)) fail('AUTOMATION_IDENTITY', '扩展任务的归属还没恢复，请保留原会话并检查鲸翼是否完整加载');
  return { purpose, owner };
}
