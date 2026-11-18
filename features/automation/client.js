import { createWorkspacePicker } from './workspace-picker.js';
import { automationContract } from './contract.js';
import { describeSchedule, nextRuns } from './schedule-rule.js';
import { registerFeature, useFeature } from '../../src/shell/feature.js';
import { createSplit } from '../../src/split.js';

/** 本页持有自己的草稿、动作和恢复状态；切走时不把状态交给外壳。 */
export function createView(kit) {
  const { React, Glyph, ActionMenu, ConfirmDialog, Modal } = kit;
  const WorkspacePicker = createWorkspacePicker(React, ActionMenu);
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } = React;
  const labelText = label => kit.resolveText ? kit.resolveText(label) : label.zh;
  // 任务列表和右边详情之间那条线能拖（共用的 src/split.js）：没拖过时列表占约四分之一，夹在 13.75rem 到 22.5rem（样式里）；拖的范围是 180px 到一半，右边至少留 320px。
  const useSplit = createSplit(React);
  const listLimits = size => ({ min: Math.min(180, size / 3), max: Math.max(0, Math.min(size * 0.5, size - 320)) });
  const listPreferred = size => Math.max(220, Math.min(size * 0.26, 360));
  return function AutomationView({ active, workbench }) {
    const { api, t, notify, busy, run, operation, setError: reportError, button, field, row, help, bind, dirty, openAssistant } = useFeature(React, workbench, 'automation');
    const split = useSplit({ key: 'schedules', active, preferred: listPreferred, limits: listLimits, reserve: () => 1, label: t('taskListResize'), hint: t('splitHint') });
    const setError = (message, action) => reportError(message, action || { label: t('retry'), run: () => refreshTab() });
    const cardsEnabled = workbench.internal.featureEnabled('cards');
    const [confirm, setConfirm] = useState(null);
    const [automations, setAutomations] = useState({ available: null, tasks: [], legacyTasks: [], issues: [] });
    const [taskDraft, setTaskDraft] = useState(null);
    const [taskDraftHidden, setTaskDraftHidden] = useState(false);
    const [taskRecovery, setTaskRecovery] = useState(null);
    const [taskHistory, setTaskHistory] = useState(null);
    const [selectedTask, setSelectedTask] = useState('');
    const workspaces = useSyncExternalStore(api.subscribeWorkspaces, api.workspaces, api.workspaces);
    // 专家的定时任务：任务属于哪位专家看任务会话上的专家选择，会话列表或专家名单变了都跟着更新。
    const expertDirectory = useSyncExternalStore(api.subscribeExperts, api.experts, api.experts);
    useSyncExternalStore(api.subscribeSessions, api.sessionsSnapshot, api.sessionsSnapshot);
    useEffect(() => { if (active) api.loadExperts?.()?.catch?.(() => {}); }, [active]);
    const taskExpertName = task => { const id = api.taskExpertId(task); return id ? expertDirectory.experts.find(expert => expert.id === id)?.name ?? id : null; };
    // 扩展登记的任务（2026-11-10）：标来源名（没有就用包名），扩展关着时到点跳过。
    const extensionName = task => task.extension ? (task.extension.label ? labelText(task.extension.label) : task.extension.package || task.extension.feature) : null;
    const ownedTask = task => task.purpose === 'extension' && task.extension?.registered;
    const expertChoices = expertDirectory.experts.filter(expert => expert.id !== 'manager');
    // 从专家详情过来的“加定时任务”：页面显示时打开新建抽屉，专家已选好。
    const takeRequest = () => {
      const request = api.takeNewTaskRequest?.();
      if (!request) return;
      if (taskDraft) { setTaskDraftHidden(false); notify(t('taskDraftKept'), { kind: 'info' }); return; }
      beginTask('custom', { expertId: request.expertId });
    };
    useEffect(() => { if (active) takeRequest(); }, [active]);
    useEffect(() => api.subscribeNewTaskRequest?.(() => { if (active) takeRequest(); }), [active, taskDraft]);
    // 两个内置任务：名称和指令由插件给，员工只定时间（每日记忆还定处理范围）。
    const builtInTitle = { knowledge: 'knowledgeTask', thinking: 'thinkingTask' };
    const taskTiming = draft => {
      // HTML time 控件可能省略秒；只补齐原生输入格式，不在客户端计算触发时间。
      const time = /^\d{2}:\d{2}$/.test(draft.time) ? `${draft.time}:00` : draft.time;
      if (draft.rule === 'daily') return { daily: { time, time_zone: 'Asia/Shanghai' } };
      if (draft.rule === 'weekly') return { weekly: { time, time_zone: 'Asia/Shanghai', weekdays: draft.weekdays.split(',').map(value => Number(value.trim())) } };
      if (draft.rule === 'cron') return { cron: { expression: draft.expression, time_zone: 'Asia/Shanghai' } };
      return { [draft.rule]: draft.rule === 'at' ? draft.at.trim() : Number(draft.seconds) };
    };
    const beginTask = (purpose, preset = {}) => {
      if (taskDraft) { setTaskDraftHidden(false); return; }
      // 只有每日记忆需要处理范围；每周思考只读知识库，自建任务不涉及工作区。
      // 默认时间：每日记忆每天 01:00，每周思考每周一 07:00（北京时间）。
      const weekly = purpose === 'thinking';
      setTaskDraft({ purpose, title: builtInTitle[purpose] ? t(builtInTitle[purpose]) : purpose === 'news' ? t('newsDaily') : '', prompt: '', workspaceScope: purpose === 'knowledge' ? { mode: 'all', excludedWorkspaceIds: [] } : undefined, rule: weekly ? 'weekly' : 'daily', time: purpose === 'knowledge' ? '01:00:00' : weekly ? '07:00:00' : '00:15:00', timeZone: 'Asia/Shanghai', weekdays: weekly ? '1' : '1,2,3,4,5', seconds: '3600', at: '', expression: '0 8 * * *', expertId: preset.expertId || '' });
      setTaskDraftHidden(false);
    };
    const editTask = task => run(async () => {
      const value = await api.automationRequest({ action: 'read', sessionId: task.sessionId, id: task.id }, operation.current?.controller.signal);
      if (!value.task || value.task.id !== task.id || value.legacy || value.purpose === 'news' || value.purpose === 'extension') throw new Error(t('taskReadback'));
      const record = value.task;
      return () => { setTaskDraft({ id: task.id, sessionId: task.sessionId, purpose: value.purpose, expected: record, expectedStatus: value.status, title: record.title || '', prompt: value.displayPrompt ?? record.prompt, workspaceScope: value.purpose === 'knowledge' ? value.workspaceScope || { mode: 'all', excludedWorkspaceIds: [] } : undefined, scopeDropped: value.purpose === 'custom' && Boolean(value.workspaceScope), rule: record.kind === 'every' ? 'every_seconds' : record.kind === 'after' ? 'at' : record.kind === 'rrule' ? 'daily' : record.kind, time: record.time || '00:15:00', timeZone: record.timeZone || 'Asia/Shanghai', weekdays: (record.weekdays || [1, 2, 3, 4, 5]).join(','), seconds: String(record.everySeconds || 3600), at: record.scheduledAt || '', expression: record.expression || '', changeTime: false, expertId: value.purpose === 'custom' ? api.taskExpertId(task) || '' : '' }); setTaskDraftHidden(false); };
    });
    const saveTask = resume => run(async () => {
      const signal = operation.current?.controller.signal;
      const draft = taskDraft;
      if (automations.available !== true) throw new Error(t('taskUnavailableShort'));
      let catalog;
      if (draft.id) {
        const update = { action: 'update', sessionId: draft.sessionId, id: draft.id, expected: draft.expected, expectedStatus: draft.expectedStatus, title: draft.title.trim(), ...(draft.workspaceScope ? { workspaceScope: draft.workspaceScope } : {}), ...(draft.purpose === 'custom' ? { prompt: draft.prompt.trim() } : {}) };
        if (draft.changeTime) update.change = { kind: draft.rule === 'every_seconds' ? 'every' : draft.rule, ...taskTiming(draft) };
        const receipt = await api.automationRequest(update, signal);
        const current = await api.automationRequest({ action: 'read', sessionId: draft.sessionId, id: draft.id }, signal);
        // CAS 的完整原生记录来自 read，不从带 catalog 元数据的卡片拼装。
        if (!receipt.record || !current.task || current.status !== draft.expectedStatus || Object.keys(current.task).length !== Object.keys(receipt.record).length || Object.keys(receipt.record).some(key => JSON.stringify(current.task[key]) !== JSON.stringify(receipt.record[key]))) throw new Error(t('taskReadback'));
        catalog = await api.automationCatalog(signal);
      } else {
        const spec = { ...(draft.purpose === 'custom' ? { title: draft.title.trim(), prompt: draft.prompt.trim() } : {}), ...taskTiming(draft) };
        catalog = await api.createAutomation({ purpose: draft.purpose, spec, workspaceScope: draft.workspaceScope, ...(draft.purpose === 'custom' && draft.expertId ? { expertId: draft.expertId } : {}) }, resume, signal);
      }
      return () => { setAutomations(catalog); setTaskDraft(null); setTaskRecovery(null); setConfirm(null); };
    }, 'taskSaved');
    const recoverTask = () => run(async () => {
      const recovered = await api.recoverAutomation(operation.current?.controller.signal);
      return () => { setAutomations(recovered.catalog); setTaskRecovery(recovered); if (recovered.recovered) { setTaskDraft(null); setConfirm(null); } };
    });
    const reloadTask = () => run(async () => {
      const value = await api.automationRequest({ action: 'read', sessionId: taskDraft.sessionId, id: taskDraft.id }, operation.current?.controller.signal);
      if (!value.task || value.task.id !== taskDraft.id) throw new Error(t('taskReadback'));
      return () => setTaskDraft(draft => ({ ...draft, expected: value.task, expectedStatus: value.status }));
    });
    // 任务会话还是空白（从没跑过、也没人在里面说过话）时不打开，说清下一次什么时候跑；有内容的照常打开。
    const openTaskSession = task => run(async () => {
      if (await api.openAutomation(task.sessionId, task) !== 'empty') return undefined;
      const next = task.status === 'active' && task.scheduledAt ? t('taskSessionEmptyNext', { time: short(task.scheduledAt) }) : '';
      return () => notify(t('taskSessionEmpty', { title: task.title || t('schedule'), next }), { kind: 'info' });
    });
    const showTaskHistory = (task, before) => run(async () => {
      const value = await api.automationRuns(task, { before }, operation.current?.controller.signal);
      return () => setTaskHistory({ task, ...value, runs: before ? [...taskHistory.runs, ...value.runs] : value.runs });
    });
    const toggleTask = task => run(async () => {
      const signal = operation.current?.controller.signal;
      const current = await api.automationRequest({ action: 'read', sessionId: task.sessionId, id: task.id }, signal);
      if (!current.task || current.legacy || !['active', 'paused'].includes(current.status) || current.status !== task.status) throw new Error(t('taskReadback'));
      // 状态与完整记录来自同一次权威读取，暂停/恢复不复用目录附加字段。
      const action = task.status === 'paused' ? 'resume' : 'pause';
      await api.automationRequest({ action, sessionId: task.sessionId, id: task.id, expected: current.task, expectedStatus: current.status }, signal);
      const catalog = await api.automationCatalog(signal);
      const saved = catalog.tasks.find(item => item.id === task.id && item.sessionId === task.sessionId);
      if (!saved || saved.status !== (action === 'pause' ? 'paused' : 'active')) throw new Error(t('taskReadback'));
      return () => setAutomations(catalog);
    }, 'taskToggled');
    // 升级前建的内置任务：读最新记录后提交一次保存，后端换上当前版本的指令，处理范围和时间照旧。
    const upgradeTask = task => run(async () => {
      const signal = operation.current?.controller.signal;
      const current = await api.automationRequest({ action: 'read', sessionId: task.sessionId, id: task.id }, signal);
      if (!current.task || current.legacy || !builtInTitle[current.purpose] || !['active', 'paused'].includes(current.status)) throw new Error(t('taskReadback'));
      const receipt = await api.automationRequest({ action: 'update', sessionId: task.sessionId, id: task.id, expected: current.task, expectedStatus: current.status }, signal);
      const catalog = await api.automationCatalog(signal);
      const saved = catalog.tasks.find(item => item.id === task.id && item.sessionId === task.sessionId);
      if (receipt.updated !== true || !saved || saved.outdated) throw new Error(t('taskReadback'));
      return () => setAutomations(catalog);
    }, 'taskUpgraded');
    const cancelTask = task => run(async () => {
      const signal = operation.current?.controller.signal;
      const receipt = await api.automationRequest({ action: 'delete', sessionId: task.sessionId, id: task.id }, signal);
      const current = await api.automationCatalog(signal);
      if (receipt.deleted !== true || [...current.tasks, ...current.legacyTasks].some(item => item.id === task.id && item.sessionId === task.sessionId)) throw new Error(t('taskReadback'));
      return () => { setAutomations(current); setConfirm(null); if (taskHistory?.task.id === task.id) setTaskHistory(null); };
    }, 'taskCancelled');
    const beijing = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) : t('newsUnverified');
    const short = value => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
    const refreshTab = () => run(async () => { const value = await api.automationCatalog(operation.current?.controller.signal); return () => setAutomations(value); });
    bind({ refresh: refreshTab, onError: reason => { if (reason.sessionId) return false; setError(reason.message || t('requestFailed')); return true; } });

    let body;
      const pending = api.pendingAutomation();
      const locked = Boolean(api.automationCacheIssue());
      const missingBuiltIns = Object.keys(builtInTitle).filter(purpose => !automations.tasks.some(task => task.purpose === purpose));
      const allTasks = [...automations.tasks, ...automations.legacyTasks.map(task => ({ ...task, legacy: true }))];
      const taskKey = task => `${task.sessionId}:${task.id}`;
      const selected = allTasks.find(task => taskKey(task) === selectedTask) || allTasks[0];
      const lastRun = selected && api.lastRun(selected);
      // 只给计划时间和结果；补发的标出来，消息编号和原始时间串不显示。
      const runText = item => [short(item.scheduledAt), t('runStatus_' + item.status), item.late && t('runLate', { time: short(item.deliveredAt) })].filter(Boolean).join(' · ');
      const dotKind = run => !run ? 'idle' : run.status === 'completed' ? 'ok' : ['error', 'interrupted', 'incomplete'].includes(run.status) ? 'err' : ['waiting', 'running', 'skipped'].includes(run.status) ? 'warn' : 'idle';
      const statusDot = run => { const kind = dotKind(run); return h('span', { className: `ww-dot ww-dot-${kind}`, 'aria-hidden': true }, kind === 'ok' ? '✓' : kind === 'err' ? '×' : kind === 'warn' ? '!' : ''); };
      const preview = draft => { try { const rule = taskTiming(draft), next = nextRuns(rule, Date.now(), 3); return [describeSchedule(rule), next.length > 0 && `之后三次：${next.map(short).join('、')}`].filter(Boolean).join(' · '); } catch { return ''; } };
      const upcoming = allTasks.filter(task => task.status === 'active' && task.scheduledAt).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
      const failed = allTasks.filter(task => dotKind(api.lastRun(task)) === 'err').length;
      const summary = [`${allTasks.length} 个任务`, upcoming && `下一次 ${short(upcoming.scheduledAt)} ${upcoming.title || ''}`.trim(), failed > 0 && `${failed} 个上次没完成`].filter(Boolean).join(' · ');
      const taskStatus = task => (task.purpose === 'news' && !cardsEnabled ? '所属功能已关闭 · ' : '') + (task.purpose === 'extension' && !task.extension?.registered ? t('taskExtensionClosed') + ' · ' : '') + (task.outdated ? t('taskOutdatedShort') + ' · ' : '') + t(task.status === 'active' ? 'taskActive' : task.status === 'paused' ? 'taskPaused' : 'taskInactive');
      // 扩展任务：名字、时间和说明由扩展维护，不能编辑；扩展开着时不能取消，只能暂停。
      const taskActions = task => h(ActionMenu, { label: t('taskActions'), iconOnly: true },
        !task.legacy && automations.controls !== false && ['active', 'paused'].includes(task.status) && button(task.status === 'paused' ? 'taskResume' : 'taskPause', () => toggleTask(task), Boolean(taskDraft)),
        !task.legacy && task.purpose !== 'news' && task.purpose !== 'extension' && ['active', 'paused'].includes(task.status) && button('editTask', () => editTask(task), Boolean(taskDraft)),
        button('openTaskSession', () => openTaskSession(task)),
        button('taskHistory', () => showTaskHistory(task)),
        !ownedTask(task) && button('cancelPlan', () => { setSelectedTask(taskKey(task)); setConfirm({ kind: 'automation', task }); }, Boolean(taskDraft)));
      const taskOwnerName = task => taskExpertName(task) ?? extensionName(task);
      const extensionHelp = task => {
        const name = extensionName(task);
        const lines = [task.extension?.description, t(task.extension?.registered ? 'taskExtensionHelp' : 'taskExtensionClosedHelp', { name })];
        if (task.extension?.readSessions && task.extension.since) lines.push(t('taskExtensionSessions', { since: beijing(task.extension.since).slice(0, 16) }));
        return h('div', { className: 'ww-task-extension' }, ...lines.filter(Boolean).map((text, i) => h('p', { key: i, className: i === 0 && task.extension?.description ? 'ww-task-prompt' : 'ww-muted' }, text)));
      };
      const patchTask = (key, value, timing = false) => setTaskDraft(draft => ({ ...draft, [key]: value, ...(timing ? { changeTime: true, timeZone: 'Asia/Shanghai' } : {}) }));
      // 新版调度内建于宿主；刷新是共同恢复入口，插件页只用于旧版。
      body = h('section', { className: 'ww-schedules' },
        h('header', { className: 'ww-pagehead' }, h('div', null, h('h2', null, t('schedule')), h('p', null, summary)), h('div', { className: 'ww-pagehead-actions' }, button('newTask', () => beginTask('custom'), locked || Boolean(pending) || Boolean(taskDraft), { className: 'ww-primary' }))),
        automations.available === false && h('div', { className: 'ww-schedule-off', role: 'status' }, h('div', null, h('strong', null, t('taskUnavailableShort')), help('scheduleUnavailable')), row(button('retry', refreshTab, false, { className: 'ww-primary' }), button('legacyScheduleSettings', () => run(async () => api.openPlugins())))),
        api.automationCacheIssue() && h('p', { className: 'ww-notice ww-error', role: 'alert' }, api.automationCacheIssue()),
        automations.issues.length > 0 && h('details', { className: 'ww-notice' }, h('summary', null, t('newsDiagnostics')), ...automations.issues.map((issue, i) => h('p', { key: i, className: 'ww-error' }, issue.message))),
        h('div', { className: 'ww-task-split', ref: split.frame, style: split.style('--ww-split') },
          h('aside', { className: 'ww-task-list', 'aria-label': t('schedule') },
            taskDraft && taskDraftHidden && button('taskDraftResume', () => setTaskDraftHidden(false)),

            ...missingBuiltIns.map(purpose => h('article', { key: purpose, className: 'ww-task-template' }, h('h3', null, t(builtInTitle[purpose])), h('small', null, t('taskDisabled')), button('enableTask', () => beginTask(purpose), locked || Boolean(pending) || purpose === 'knowledge' && automations.legacyTasks.length > 0 || Boolean(taskDraft)))),
            ...allTasks.map(task => h('article', { key: taskKey(task), className: `ww-task-row${selected && taskKey(task) === taskKey(selected) ? ' ww-selected' : ''}` },
              h('button', { type: 'button', className: 'ww-task-select', 'aria-pressed': selected && taskKey(task) === taskKey(selected), onClick: () => { setSelectedTask(taskKey(task)); setTaskHistory(null); } },
                h('span', null, statusDot(api.lastRun(task)), task.title || t(task.legacy ? 'taskLegacy' : 'schedule')), h('small', null, ...(taskOwnerName(task) ? [taskOwnerName(task), ' · '] : []), taskStatus(task), ' · ', task.status === 'active' ? beijing(task.scheduledAt) : t('rule_' + (task.kind === 'every' ? 'every_seconds' : task.kind === 'after' ? 'at' : task.kind)))), taskActions(task)))),
          h('div', { ...split.separator, className: 'ww-split-line' }),
          h('div', { className: 'ww-task-main' },
            pending && h('section', { className: 'ww-notice', role: 'status' }, h('h3', null, t('taskPending')), help('taskPendingHelp'),
              row(button('taskRecover', recoverTask), button('openTaskSession', () => run(async () => api.openAutomation(pending.sessionId)))),
              taskRecovery?.pending?.sessionId === pending.sessionId && h(React.Fragment, null, help('taskPendingMissing'), !taskDraft && button('taskDraftResume', () => beginTask(pending.purpose), locked))),
        taskDraft && !taskDraftHidden && h('section', { className: 'ww-task-editor', 'aria-label': t(taskDraft.id ? 'editTask' : 'newTask') },
          h('h2', null, t(taskDraft.id ? 'editTask' : builtInTitle[taskDraft.purpose] ?? 'newTask')),
          taskDraft.purpose === 'knowledge' && help('taskScopeHelp'), taskDraft.purpose === 'thinking' && help('thinkingTaskHelp'), !(taskDraft.purpose === 'custom' && taskDraft.expertId) && help('taskModelHelp'),
          field('taskTitle', taskDraft.title, value => patchTask('title', value), { disabled: busy || Boolean(builtInTitle[taskDraft.purpose]) && !taskDraft.id }),
          taskDraft.purpose === 'custom' && !taskDraft.id && h('label', { className: 'ww-field' }, t('taskExpert'), h('select', { value: taskDraft.expertId || '', disabled: busy, onChange: event => patchTask('expertId', event.target.value) },
            h('option', { value: '' }, t('taskExpertNone')), ...expertChoices.map(expert => h('option', { key: expert.id, value: expert.id }, expert.name)))),
          taskDraft.purpose === 'custom' && taskDraft.expertId && help('taskExpertHelp'),
          taskDraft.purpose === 'custom' && h('label', { className: 'ww-field' }, t('taskPrompt'), h('textarea', { value: taskDraft.prompt, disabled: busy, onChange: event => patchTask('prompt', event.target.value) })),
          taskDraft.purpose === 'knowledge' && h(WorkspacePicker, { items: workspaces.items || [], scope: taskDraft.workspaceScope, disabled: busy, t, onChange: value => patchTask('workspaceScope', value) }),
          taskDraft.purpose === 'knowledge' && help('workspaceScopeHelp'),
          taskDraft.scopeDropped && help('customScopeDropped'),
          taskDraft.purpose !== 'news' && h('label', { className: 'ww-field' }, t('taskRule'), h('select', { value: taskDraft.rule, disabled: busy, onChange: event => patchTask('rule', event.target.value, true) },
            ...['after_seconds', 'at', 'every_seconds', 'daily', 'weekly', 'cron'].filter(rule => !taskDraft.id || rule !== 'after_seconds').map(rule => h('option', { key: rule, value: rule }, t('rule_' + rule))))),
          ['after_seconds', 'every_seconds'].includes(taskDraft.rule) && field('taskSeconds', taskDraft.seconds, value => patchTask('seconds', value, true), { type: 'number' }),
          taskDraft.rule === 'at' && field('taskAt', taskDraft.at, value => patchTask('at', value, true)),
          taskDraft.purpose !== 'news' && ['daily', 'weekly'].includes(taskDraft.rule) && h('div', { className: 'ww-task-time' }, field('time', taskDraft.time, value => patchTask('time', value, true), { type: 'time', step: '60' }), h('span', { className: 'ww-muted' }, taskDraft.timeZone === 'Asia/Shanghai' ? t('beijingTime') : t('legacyTimeZone', { zone: taskDraft.timeZone })), taskDraft.timeZone !== 'Asia/Shanghai' && button('convertBeijingTime', () => patchTask('timeZone', 'Asia/Shanghai', true))),
          taskDraft.rule === 'weekly' && field('taskWeekdays', taskDraft.weekdays, value => patchTask('weekdays', value, true)),
          taskDraft.rule === 'cron' && h('div', { className: 'ww-task-time' }, field('taskExpression', taskDraft.expression, value => patchTask('expression', value, true)), h('span', { className: 'ww-muted' }, taskDraft.timeZone === 'Asia/Shanghai' ? t('beijingTime') : t('legacyTimeZone', { zone: taskDraft.timeZone })), taskDraft.timeZone !== 'Asia/Shanghai' && button('convertBeijingTime', () => patchTask('timeZone', 'Asia/Shanghai', true))),
          taskDraft.purpose !== 'news' && preview(taskDraft) && h('p', { className: 'ww-task-preview', role: 'status' }, preview(taskDraft)),
          row(button(taskDraft.id ? 'saveTask' : pending ? 'taskContinue' : 'submitTask', () => saveTask(Boolean(pending)), !taskDraft.title.trim() || taskDraft.purpose === 'custom' && !taskDraft.prompt.trim() || Boolean(pending) && taskRecovery?.pending?.sessionId !== pending.sessionId),
            taskDraft.id && button('taskReload', reloadTask), button('taskDraftClose', () => setTaskDraftHidden(true)), button('taskDiscard', () => setConfirm({ kind: 'taskDraft' }))),
          confirm?.kind === 'taskDraft' && h(ConfirmDialog, { title: t('taskDiscard'), message: t('taskDiscardConfirm'), confirmLabel: t('taskDiscard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setTaskDraft(null); setConfirm(null); notify(t('draftDiscarded')); } })),
            (!taskDraft || taskDraftHidden) && (selected ? h('section', { className: 'ww-task-detail' },
              h('div', { className: 'ww-team-heading' }, h('div', null, h('h2', null, selected.title || t('schedule')), h('p', { className: 'ww-muted' }, [taskExpertName(selected) && t('taskExpertOf', { name: taskExpertName(selected) }), extensionName(selected) && t('taskExtensionOf', { name: extensionName(selected) }), taskStatus(selected), describeSchedule(selected)].filter(Boolean).join(' · '))), h('div', { className: 'ww-row' }, button('taskHistory', () => showTaskHistory(selected)), button('openTaskSession', () => openTaskSession(selected)))),
              h('div', { className: 'ww-task-facts' },
                h('div', { className: 'ww-task-fact' }, h('small', null, t('taskTime')), h('strong', { title: selected.status === 'active' ? beijing(selected.scheduledAt) : undefined }, selected.status === 'active' ? short(selected.scheduledAt) : t(selected.status === 'paused' ? 'taskPaused' : 'taskInactive'))),
                h('div', { className: `ww-task-fact ww-task-fact-${dotKind(lastRun)}` }, h('small', null, t('taskLastRun')), h('strong', null, statusDot(lastRun), lastRun ? t('runStatus_' + lastRun.status) : t('taskNeverRun')), lastRun && h('span', null, runText(lastRun)))),
              // 内置任务的指令是给模型看的，员工只需要知道它做什么。
              selected.outdated && h('div', { className: 'ww-schedule-off', role: 'status' }, h('div', null, h('strong', null, t(selected.purpose === 'knowledge' ? 'taskOutdatedKnowledge' : 'taskOutdated')), help('taskOutdatedHelp')), button(selected.purpose === 'knowledge' ? 'taskUpgradeKnowledge' : 'taskUpgrade', () => upgradeTask(selected), locked || Boolean(taskDraft), { className: 'ww-primary' })),
              selected.purpose === 'knowledge' ? help('taskScopeHelp') : selected.purpose === 'thinking' ? help('thinkingTaskHelp') : selected.purpose === 'news' ? help('newsTaskFixed') : selected.purpose === 'extension' ? extensionHelp(selected) : h('p', { className: 'ww-task-prompt' }, selected.displayPrompt ?? selected.prompt),
              selected.legacy && help('taskLegacyHelp'),
              h('details', null, h('summary', null, t('taskDetails')), help('scheduleHelp'), help('taskModelHelp'), help('taskStatusHelp')))
              : h('div', { className: 'ww-task-empty' }, h(Glyph, { name: 'spark', size: 28 }), h('h2', null, t('taskSelect')))),
            // 右下角淡淡的鲸翼水印，和专家团队里小鲸卡同一种点缀（2026-11-02 补齐设计稿）。
            h('i', { className: 'ww-whale', 'aria-hidden': true }),
            confirm?.kind === 'automation' && h(ConfirmDialog, { title: t('cancelPlan'), message: t('cancelPlanHelp'), confirmLabel: t('cancelPlan'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => cancelTask(confirm.task) }),
            taskHistory && h(Modal, { title: `${t('taskHistory')} · ${taskHistory.task.title || t('schedule')}`, busy, onClose: () => setTaskHistory(null), className: 'ww-confirm ww-task-history' },
              h('section', { className: 'ww-confirm-body', 'aria-label': t('taskHistory') }, help('historyHelp'),
                taskHistory.runs.length ? h('ol', { className: 'ww-task-runs' }, taskHistory.runs.map(item => h('li', { key: item.id }, statusDot(item), h('p', { className: 'ww-task-run' }, runText(item))))) : help('noHistory'),
                taskHistory.earlierRemoved && help('historyEarlier')),
              h('footer', { className: 'ww-dialog-actions' }, taskHistory.nextBefore && button('historyMore', () => showTaskHistory(taskHistory.task, taskHistory.nextBefore)), button('closePanel', () => setTaskHistory(null), false, { className: 'ww-primary' }))))));


    return active ? body : null;
  };
}

export const name = 'whalewing-automation';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'automation', createView, { contract: automationContract, namespace: 'whalewingAutomation', entries: scope => scope.inject(['uiScheduleNavigation'], child => child.effect(() => child.uiScheduleNavigation.hide())) }); }
