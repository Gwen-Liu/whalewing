/**
 * 专家团队页左栏的“在用”专家（2026-11-08 用户定，见 docs/业务能力设计.md「专家团队」）。
 * 在用：手上有事（在做、等你审批）、有定时任务在跑、最近 N 天里用过（开过任务、在输入框选过、小鲸派过活，
 * 都会在会话列表里留下这位专家的会话），或员工点了“选用”。N 天没用就回专家库，记忆留着；员工也能手动“放回”。
 * 全部从会话列表和定时任务算，另存的只有员工的“选用 / 放回”记号和天数（宿主 whalewing_expert_roster 域）。
 */
export const dayMs = 24 * 3600 * 1000;
export const defaultIdleDays = 14;
/** “可选设置”里能选的天数；0 表示不自动放回。 */
export const idleChoices = [7, 14, 30, 0];
// 手上的事：等你审批的排最前，其次在做、排队；和小鲸面板“派出去的事”同一个时间窗。
const busyOrder = { waiting: 0, running: 1, queued: 2 };
export const busyWindowMs = 7 * dayMs;

/** 任务会话的标题是“专家名 · 事项”；在专家自己那栏里去掉名字。 */
export function taskTitle(title, name) {
  const text = String(title ?? '').trim();
  const prefix = `${name} · `;
  return name && text.startsWith(prefix) ? text.slice(prefix.length).trim() || text : text;
}

/** 会话列表按专家归拢：最后一次用的时间、这位专家的任务（新的在前）、手上最要紧的一件事。 */
export function expertActivity(snapshot, { archived = [], now = Date.now() } = {}) {
  const hidden = new Set(archived);
  const byExpert = new Map();
  for (const [id, summary] of Object.entries(snapshot?.byId ?? {})) {
    const expertId = summary?.projectionValues?.whalewingExpert?.expertId;
    if (!expertId || summary.parentSessionId || summary.origin === 'subagent') continue;
    const entry = byExpert.get(expertId) ?? { lastUsed: 0, sessions: [], busy: null };
    const updatedAt = Number(summary.updatedAt) || 0;
    // 开了还没说过话的会话不算用过。
    if (!summary.blank) entry.lastUsed = Math.max(entry.lastUsed, updatedAt);
    const dispatch = summary.projectionValues?.whalewingDispatch;
    const status = dispatch && Object.hasOwn(busyOrder, dispatch.status) ? dispatch.status : summary.running ? 'running' : dispatch?.status ?? null;
    const item = { id, title: String(summary.title || dispatch?.title || '').trim(), updatedAt, status, dispatched: Boolean(dispatch), automation: Boolean(summary.projectionValues?.whalewingAutomation), archived: hidden.has(id), blank: summary.blank === true };
    entry.sessions.push(item);
    if (Object.hasOwn(busyOrder, status) && !item.archived && now - updatedAt < busyWindowMs) {
      const current = entry.busy;
      if (!current || busyOrder[status] < busyOrder[current.status] || (busyOrder[status] === busyOrder[current.status] && updatedAt > current.updatedAt)) entry.busy = item;
    }
    byExpert.set(expertId, entry);
  }
  for (const entry of byExpert.values()) entry.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  return byExpert;
}

/**
 * 每位专家（小鲸除外，它常驻在右边）算出是否在用和左栏那一行要写的东西。
 * marks：员工的“选用 / 放回”记号 { id: { state, at } }；schedules：挂在专家名下的定时任务（带 expertId、status、scheduledAt）。
 */
export function rosterOf({ experts = [], activity = new Map(), marks = {}, idleDays = defaultIdleDays, schedules = [], now = Date.now() }) {
  return experts.filter(role => role.id !== 'manager').map(role => {
    const act = activity.get(role.id) ?? { lastUsed: 0, sessions: [], busy: null };
    const mark = marks[role.id];
    const picked = mark?.state === 'picked' ? mark.at : 0;
    const returned = mark?.state === 'returned' ? mark.at : 0;
    const lastUsed = Math.max(act.lastUsed, picked);
    const scheduled = schedules.filter(task => task.expertId === role.id && task.status === 'active');
    // 手上有事、有定时任务在跑的一直在用，不会被放回。
    const working = Boolean(act.busy) || scheduled.length > 0;
    const recent = lastUsed > returned && (!idleDays || now - lastUsed < idleDays * dayMs);
    const remainingDays = !working && recent && idleDays ? Math.max(1, Math.ceil((lastUsed + idleDays * dayMs - now) / dayMs)) : null;
    return { role, inUse: working || recent, working, lastUsed, pickedOnly: picked > act.lastUsed, busy: act.busy, sessions: act.sessions, scheduled, nextRun: scheduled.map(task => task.scheduledAt).filter(Boolean).sort()[0] ?? null, remainingDays };
  });
}

/** 左栏的顺序：等你审批的在最前，其次在做的，其余按最近用过排。 */
export function sortInUse(entries) {
  const rank = entry => entry.busy ? busyOrder[entry.busy.status] : 9;
  return entries.filter(entry => entry.inUse).sort((a, b) => rank(a) - rank(b) || b.lastUsed - a.lastUsed || a.role.name.localeCompare(b.role.name, 'zh-CN'));
}

/** 多久以前：今天、昨天、N 天前。按北京时间的日子算。 */
export function daysAgo(time, now = Date.now()) {
  if (!time) return null;
  const day = value => Math.floor((value + 8 * 3600 * 1000) / dayMs);
  return Math.max(0, day(now) - day(time));
}
