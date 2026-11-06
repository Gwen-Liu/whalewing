import { isDeepStrictEqual } from 'node:util';

/**
 * DSH 0.2.2 起定时服务按任务管理：create 带时间规则（timing）和投递目标（target），改、删、暂停、恢复都走 edit，
 * 目录条目不再有 sessionId，结束状态改叫 ended。鲸翼的定时任务、每日资讯和知识来源仍按“一个任务投递到一个已有会话”工作，
 * 这里把新接口包成鲸翼原来用的形状，其余代码和页面不用跟着改：
 * - 只列投递到已有会话（target.kind 为 session）的任务。DSH 自动化页和模型工具建的“新建会话”类任务不归鲸翼管，
 *   也就不会去读还没建出来的会话。
 * - 鲸翼改的都是任务自己会话里的任务，把那个会话当作操作方，DSH 就不往这个会话发“[SCHEDULE CHANGE]”通知。
 * - 改、暂停、恢复先比对员工打开时看到的记录，再带上版本时间提交，两步之间被投递或别处改过都按冲突返回，不覆盖。
 */
const entryFields = new Set(['target', 'involvedSessionIds', 'status', 'createdAt', 'updatedAt', 'executionActive', 'deliveryFloorEndsAt', 'lastDelivery']);
const selectorKinds = { after_seconds: 'after', at: 'at', every_seconds: 'every', daily: 'daily', weekly: 'weekly', cron: 'cron' };

const recordOf = entry => Object.fromEntries(Object.entries(entry).filter(([key]) => !entryFields.has(key)));
const sessionOf = entry => entry?.target?.kind === 'session' ? entry.target.sessionId : undefined;
// 投递到已有会话时目标会话就是任务的会话，不再单独列出。
const receipt = ({ targetSessionId: _target, ...value }) => value;
const sessionEntry = entry => ({
  ...recordOf(entry),
  sessionId: sessionOf(entry),
  status: entry.status === 'ended' ? 'inactive' : entry.status,
  ...(entry.lastDelivery ? { lastDelivery: receipt(entry.lastDelivery) } : {}),
});

/** 把 DSH 0.2.2 的定时服务包成按会话管理的形状；DSH 没有定时服务时返回 undefined。 */
export function sessionSchedule(native) {
  if (!native) return undefined;
  const owned = async (sessionId, id) => {
    const entry = await native.view({ id });
    return entry && !entry.code && sessionOf(entry) === sessionId ? entry : undefined;
  };
  // 先认任务是不是这个会话的、有没有结束、和员工看到的是否一致，再交给 edit。
  const checked = async (request, change) => {
    const current = await owned(request.sessionId, request.id);
    if (!current) return { id: request.id, updated: false, code: 'schedule_not_found' };
    if (current.status === 'ended') return { id: request.id, updated: false, code: 'schedule_ended' };
    if (!isDeepStrictEqual(recordOf(current), request.expected)) return { id: request.id, updated: false, code: 'schedule_conflict' };
    return change(current);
  };
  const edit = async (current, sessionId, patch, signal) => {
    const result = await native.edit({ id: current.id, action: 'update', patch, expectedUpdatedAt: current.updatedAt ?? null }, sessionId, signal);
    if (result?.code) return { id: current.id, updated: false, code: result.code };
    const record = recordOf(result);
    return { id: current.id, updated: result.status !== current.status || !isDeepStrictEqual(record, recordOf(current)), record };
  };
  const toggle = (request, active, signal) => checked(request, current => {
    if (current.status !== request.expectedStatus) return { id: current.id, updated: false, code: 'schedule_conflict' };
    if ((current.status === 'active') === active) return { id: current.id, updated: false, record: recordOf(current) };
    return edit(current, request.sessionId, { active }, signal);
  });
  return {
    async catalog() {
      const rows = (await native.catalog()).filter(sessionOf).map(sessionEntry);
      return rows.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id));
    },
    /** spec 是原来的写法：title、prompt 加一个时间选择器（如 daily），返回建好的记录。 */
    async create(sessionId, spec, signal) {
      const { title, prompt, ...selector } = spec;
      const [key] = Object.keys(selector);
      // 选择器不对或不止一个时原样交给 DSH，由它按自己的规则拒绝。
      const timing = { kind: selectorKinds[key] ?? String(key), ...selector };
      return recordOf(await native.create({ title, prompt, timing, target: { kind: 'session', sessionId } }, sessionId, signal));
    },
    async delete({ sessionId, id }, signal) {
      if (!await owned(sessionId, id)) return { id, deleted: false, code: 'schedule_not_found' };
      const result = await native.edit({ id, action: 'delete' }, sessionId, signal);
      return result?.deleted ? { id, deleted: true } : { id, deleted: false, code: result?.code ?? 'schedule_not_found' };
    },
    /** change 是 { kind, 选择器 } 的写法，正好就是 DSH 0.2.2 的 timing。 */
    update({ sessionId, id, expected, title, prompt, change }, signal) {
      return checked({ sessionId, id, expected }, current => {
        const patch = { ...(title === undefined ? {} : { title }), ...(prompt === undefined ? {} : { prompt }), ...(change === undefined ? {} : { timing: change }) };
        if (!Object.keys(patch).length) return { id, updated: false, record: recordOf(current) };
        return edit(current, sessionId, patch, signal);
      });
    },
    pause: (request, signal) => toggle(request, false, signal),
    resume: (request, signal) => toggle(request, true, signal),
    async history({ sessionId, id, limit, before }) {
      if (!await owned(sessionId, id)) return { id, code: 'schedule_not_found' };
      const page = await native.history({ id, limit, ...(before === undefined ? {} : { before }) });
      return Array.isArray(page?.records) ? { ...page, records: page.records.map(receipt) } : page;
    },
  };
}
