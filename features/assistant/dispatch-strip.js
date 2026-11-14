/**
 * 小鲸面板上的“派出去的事”（2026-11-08 用户定）：派工卡片会被收进那一轮“已完成”的折叠里，不好找，
 * 所以在面板上单列一栏。数据只读 DSH 会话列表里各任务的派工投影（whalewingDispatch），和卡片同一份，不另存。
 * 列最近 7 天的：还在做、等审批的全列，排在前面；做完的（含出错、被停下）只列最近 3 件。
 */
export const stripWindowMs = 7 * 24 * 3600 * 1000;
export const finishedLimit = 3;
const activeOrder = { waiting: 0, running: 1, queued: 2 };

export function dispatchItems(snapshot, { now = Date.now(), archived = [] } = {}) {
  const hidden = new Set(archived);
  const all = Object.entries(snapshot?.byId ?? {}).flatMap(([id, summary]) => {
    const view = summary?.projectionValues?.whalewingDispatch;
    if (!view || hidden.has(id) || summary.parentSessionId) return [];
    const updatedAt = Number(summary.updatedAt) || 0;
    if (now - updatedAt >= stripWindowMs) return [];
    // 任务会话的标题是“专家名 · 事项”；员工改过标题就用改过的。
    return [{ id, title: String(summary.title || view.title || '').trim() || view.title, status: view.status, updatedAt }];
  });
  const newest = (a, b) => b.updatedAt - a.updatedAt;
  const active = all.filter(item => Object.hasOwn(activeOrder, item.status)).sort((a, b) => activeOrder[a.status] - activeOrder[b.status] || newest(a, b));
  const finished = all.filter(item => !Object.hasOwn(activeOrder, item.status)).sort(newest).slice(0, finishedLimit);
  return { active, finished, waiting: active.filter(item => item.status === 'waiting').length };
}

/** 没有最近派出去的事时整栏不显示；默认收成一行（2026-11-08 用户嫌占地方），标题行写几件等审批、几件在做，员工点开过就按员工的来。 */
export function createDispatchStrip(React) {
  const { createElement: h, useState, useSyncExternalStore } = React;
  return function DispatchStrip({ api, t, openTask }) {
    const snapshot = useSyncExternalStore(api.subscribeSessions, api.sessionsSnapshot, api.sessionsSnapshot);
    const [open, setOpen] = useState(null);
    const { active, finished, waiting } = dispatchItems(snapshot, { archived: api.archivedSessions() });
    if (!active.length && !finished.length) return null;
    const summary = [
      waiting && t('dispatchWaitingCount', { count: waiting }),
      active.length - waiting && t('dispatchActiveCount', { count: active.length - waiting }),
      !active.length && t('dispatchDoneCount', { count: finished.length }),
    ].filter(Boolean).join(' · ');
    const row = item => {
      const action = item.status === 'waiting' ? 'dispatchApprove' : 'dispatchOpen';
      return h('li', { key: item.id, 'data-status': item.status },
        h('span', { className: 'ww-dispatch-state' }, t(`dispatchState_${item.status}`)),
        h('span', { className: 'ww-dispatch-title', title: item.title }, item.title),
        h('button', { type: 'button', 'aria-label': `${t(action)}：${item.title}`, onClick: () => openTask(item.id) }, t(action)));
    };
    return h('details', { className: 'ww-dispatch-strip', open: open ?? false, onToggle: event => setOpen(event.currentTarget.open) },
      h('summary', { title: t('dispatchStripHelp') }, h('span', null, t('dispatchStrip')), h('small', null, summary)),
      h('ul', null, ...[...active, ...finished].map(row)));
  };
}

