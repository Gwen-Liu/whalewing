import { automationContract, automationPurposes, runStatuses } from './contract.js';
import { requireExactProjection, assertCreatedSession } from '../../src/session-projection.js';

// 送达比计划时间晚这么多，多半是 DSH 当时没开、开机后补上的那一次。
const lateMs = 5 * 60 * 1000;
/**
 * 一次运行给界面的样子：计划时间、实际送达时间、结果和可以打开的会话。每次运行都在任务自己的会话里，
 * 所以 sessionId 就是任务会话；id 只作列表键，不显示。结果取值见 contract.js 的 runStatuses。
 */
export function taskRun(task, record) {
  if (!record) return null;
  const scheduled = Date.parse(record.scheduledAt), delivered = Date.parse(record.deliveredAt);
  return { id: record.messageId, scheduledAt: record.scheduledAt, deliveredAt: record.deliveredAt, status: runStatuses.includes(record.status) ? record.status : 'unknown', sessionId: task.sessionId, late: delivered - scheduled > lateMs };
}
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createAutomationClient(bridge, t, z, directory) {
    let newTaskRequest = null;
    const requestListeners = new Set();
    const { featureRemote, unwrap, failure } = bridge;
    const { hostFailure, request, attachExistingSession, readProjection, assertActiveSession } = bridge;
    const NS = 'whalewing', automationSchema = automationContract(z);
    let newsAdapter;
    const requireNewsAdapter = () => { if (!newsAdapter) throw failure('每日阅读功能已关闭，请启用后继续原任务', 'FEATURE_DISABLED'); return newsAdapter; };
    const automationRequest = async (input, signal) => {
      const parsed = automationSchema.input.parse(input);
      signal?.throwIfAborted();
      const result = automationSchema.result.safeParse(unwrap(await featureRemote('whalewingAutomation').manageAutomation(parsed, signal)));
      if (!result.success) throw failure(t('badReply'), 'bad_reply');
      const value = result.data;
      if (value.code) throw hostFailure(value.message || value.code, value.code);
      return value;
    };
    const automationCatalog = async signal => {
      const value = await automationRequest({ action: 'catalog' }, signal);
      if (typeof value.available !== 'boolean' || !['tasks', 'legacyTasks', 'issues'].every(key => Array.isArray(value[key]))) throw failure(t('badReply'), 'bad_reply');
      return value;
    };
    // 只缓存未核实创建的身份，不保存员工指令、目录或原生计划镜像。
    const automationKey = `${NS}:automation-pending:${typeof window === 'undefined' ? '' : window.location.origin}`;
    let pendingAutomation = null, automationCacheIssue = '', automationWriting = false;
    try {
      const saved = window.localStorage.getItem(automationKey);
      if (saved) pendingAutomation = z.strictObject({ sessionId: z.string().regex(/^[\w-]{1,100}$/), purpose: z.enum(automationPurposes) }).parse(JSON.parse(saved));
    } catch { automationCacheIssue = t('taskCacheError'); }
    const cacheAutomation = value => {
      try {
        if (value) window.localStorage.setItem(automationKey, JSON.stringify(value));
        else window.localStorage.removeItem(automationKey);
      } catch { throw failure(t('taskCacheError'), 'automation_cache'); }
      pendingAutomation = value;
    };
    async function recoverAutomation(signal) {
      if (automationCacheIssue) throw failure(automationCacheIssue, 'automation_cache');
      const catalog = await automationCatalog(signal);
      if (!pendingAutomation) return { catalog, pending: null };
      const pending = pendingAutomation;
      const own = catalog.tasks.filter(task => task.sessionId === pending.sessionId);
      if (own.length > 1 || own.some(task => task.purpose !== pending.purpose)) throw failure(t('taskPendingConflict'), 'automation_identity');
      if (own.length === 1) { cacheAutomation(null); return { catalog, pending: null, recovered: own[0] }; }
      const projection = unwrap(await bridge.session.projections({ sessionId: pending.sessionId }, signal), pending.sessionId);
      signal?.throwIfAborted();
      requireExactProjection(projection, pending.sessionId, ['whalewingAutomation']);
      assertActiveSession(pending.sessionId);
      if (projection.values.whalewingAutomation !== null && projection.values.whalewingAutomation !== pending.purpose) throw failure(t('taskPendingConflict'), 'automation_identity');
      return { catalog, pending, exists: projection !== null };
    }
    async function createAutomation({ purpose, spec, workspaceScope, expertId }, resume, signal) {
      if (automationWriting) throw failure(t('taskPendingConflict'), 'automation_busy');
      if (automationCacheIssue) throw failure(automationCacheIssue, 'automation_cache');
      // 执行目录由插件统一持有，所有定时任务在同一处运行，员工不选择、不填写。
      const { directory } = await automationRequest({ action: 'directory' }, signal);
      if (typeof directory !== 'string' || !/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+|\/)/.test(directory)) throw failure(t('badReply'), 'bad_reply');
      // 自建任务可以挂到某位专家名下：Host 在提交计划前给任务会话选好这位专家。
      const specification = purpose === 'news' ? {} : { spec, ...(workspaceScope ? { workspaceScope } : {}), ...(purpose === 'custom' && expertId ? { expertId } : {}) };
      const adapter = purpose === 'news' ? requireNewsAdapter() : null;
      (adapter ? adapter.validate : input => automationSchema.input.parse(input))({ action: 'create', sessionId: 'validation', purpose, ...specification });
      automationWriting = true;
      try {
        if (pendingAutomation && !resume) throw failure(t('taskPendingConflict'), 'automation_pending');
        if (resume && (!pendingAutomation || pendingAutomation.purpose !== purpose)) throw failure(t('taskPendingConflict'), 'automation_pending');
        const recovered = await recoverAutomation(signal);
        if (recovered.recovered) return recovered.catalog;
        if (!recovered.catalog.available) throw failure(t('scheduleUnavailable'), 'SCHEDULE_DISABLED');
        signal?.throwIfAborted();
        const fresh = !pendingAutomation;
        if (fresh) cacheAutomation({ sessionId: `whalewing-auto-${globalThis.crypto.randomUUID()}`, purpose });
        const { sessionId } = pendingAutomation;
        if (fresh) {
          const created = unwrap(await bridge.session.create({ sessionId, cwd: directory, agentPreset: 'standard' }), sessionId);
          assertCreatedSession(created, sessionId);
          if (created.agentPreset && created.agentPreset !== 'standard') throw failure(t('badReply'), 'bad_reply');
        }
        signal?.throwIfAborted();
        await attachExistingSession(sessionId, directory, signal);
        // Cards退出后保留已分配身份，停止尚未提交的领域动作。
        if (adapter && adapter !== requireNewsAdapter()) throw failure('每日阅读连接已更换，请检查原任务后重试', 'FEATURE_DISABLED');
        const claim = await request(sessionId, { action: 'automation_claim', purpose });
        if (claim?.action !== 'automation_claim' || claim.purpose !== purpose) throw failure(t('taskPendingConflict'), 'automation_identity');
        const projection = await readProjection(sessionId, ['whalewingAutomation'], signal);
        if (projection.values.whalewingAutomation !== purpose) throw failure(t('taskPendingConflict'), 'automation_identity');
        signal?.throwIfAborted();
        if (adapter && adapter !== requireNewsAdapter()) throw failure('每日阅读连接已更换，请检查原任务后重试', 'FEATURE_DISABLED');
        const receipt = await (adapter ? adapter.submit : automationRequest)({ action: 'create', sessionId, purpose, ...specification }, signal);
        const catalog = await automationCatalog(signal);
        if (!receipt.task?.id || !catalog.tasks.some(task => task.sessionId === sessionId && task.id === receipt.task.id && task.purpose === purpose)) throw failure(t('taskReadback'), 'automation_readback');
        cacheAutomation(null);
        return catalog;
      } finally { automationWriting = false; }
    }

    /** 最近几次运行，新的在前；nextBefore 用来加载更早的，earlierRemoved 表示更早的记录已被 DSH 清理。 */
    async function automationRuns(task, { before, limit = 20 } = {}, signal) {
      const value = await automationRequest({ action: 'history', sessionId: task.sessionId, id: task.id, limit, ...(before ? { before } : {}) }, signal);
      if (value.id !== task.id || !Array.isArray(value.records)) throw failure(t('badReply'), 'bad_reply');
      return { runs: value.records.map(record => taskRun(task, record)), nextBefore: value.nextBefore, earlierRemoved: Boolean(value.earlierRecordsUnavailable || value.earlierRecordsPruned) };
    }

  return {
    automationRequest, automationCatalog, createAutomation, recoverAutomation, automationRuns,
    // 目录已附带上次运行的结果；只有送达回执、没有结果时按未知给出。
    lastRun: task => taskRun(task, task.lastRun ?? (task.lastDelivery && { ...task.lastDelivery, status: 'unknown' })),
    pendingAutomation: () => pendingAutomation && { ...pendingAutomation }, automationCacheIssue: () => automationCacheIssue,
    bindNewsAdapter(adapter) { newsAdapter = adapter; return () => { if (newsAdapter === adapter) newsAdapter = undefined; }; },
    /**
     * 打开任务会话。给了任务时先看会话里有没有内容：从没跑过、也没人在里面说过话的会话，DSH 会当成一段全新的对话打开
     * （标题“新会话”、空白首页），员工以为点错了，顺手打字还会发进这个任务的会话（2026-11-14 手测时看到）。
     * 这种情况不打开，返回 'empty' 由页面提示“还没运行过”；会话列表里查不到时按有没有送达过判断。
     */
    openAutomation: async (id, task) => {
      if (task) {
        const summary = bridge.sessionSnapshot?.().byId?.[id];
        if (summary ? summary.blank === true : !task.lastDelivery && !task.lastRun) return 'empty';
      }
      await attachExistingSession(id); bridge.open(id);
      return 'opened';
    },
    // 专家详情里点“加定时任务”：先记下要给哪位专家建，定时任务页打开时接着开新建抽屉。
    requestNewTask: preset => { newTaskRequest = preset; for (const listener of requestListeners) listener(); },
    takeNewTaskRequest: () => { const value = newTaskRequest; newTaskRequest = null; return value; },
    subscribeNewTaskRequest: listener => { requestListeners.add(listener); return () => requestListeners.delete(listener); },
    // 专家的定时任务：新建时选专家；任务属于哪位专家看任务会话上的专家选择（会话列表里的投影值）。
    experts: () => directory?.experts() ?? { experts: [], deleted: [] }, subscribeExperts: listener => directory?.subscribeExperts(listener) ?? (() => {}), loadExperts: signal => directory?.loadExperts(signal),
    // 内置定时任务按自己的说明跑，以前选上过专家也不算（同专家功能宿主侧的 expertState）。
    taskExpertId: task => task.purpose && task.purpose !== 'custom' ? null : bridge.sessionSnapshot().byId?.[task.sessionId]?.projectionValues?.whalewingExpert?.expertId ?? null,
    subscribeSessions: listener => bridge.subscribeSessions(listener), sessionsSnapshot: () => bridge.sessionSnapshot(),
    openPlugins: bridge.openPlugins, workspaces: bridge.workspaces, subscribeWorkspaces: bridge.subscribeWorkspaces,
  };
}
