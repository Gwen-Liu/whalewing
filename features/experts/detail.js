/**
 * 专家详情（2026-11-08 用户定，见 docs/专家团改版方案.md 第五节第 6 项）：点专家名帖打开的右侧抽屉。
 * 三页：概况（介绍、最近的任务、定时任务和记忆的摘要）、记忆（逐条看、改、删）、定时任务（这位专家名下的任务）。
 * 改专家本身的设置用右上角“编辑专家”，打开原来的编辑抽屉，不在这里另做一套表单。
 */
export const detailTabs = ['overview', 'memory', 'schedule'];

/** 一节记忆在文本框里一行一条；保存时去掉空行和行首的“- ”，日期留着。 */
export const memoryLines = text => text.split('\n').map(line => line.trim().replace(/^-\s*/, '')).filter(Boolean);
export const memoryText = entries => entries.map(line => line.replace(/^-\s*/, '')).join('\n');

/** 会话列表里属于这位专家的普通任务（不含定时任务和子代理），新的在前。 */
export function expertSessions(snapshot, expertId, limit = 6) {
  const items = Object.values(snapshot?.byId ?? {});
  return items.filter(item => item?.projectionValues?.whalewingExpert?.expertId === expertId && !item.projectionValues?.whalewingAutomation && !item.parentSessionId)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, limit);
}

export function createExpertDetail(kit) {
  const { React, Avatar, useDiscard } = kit;
  const { createElement: h, useState, useRef, useEffect, useSyncExternalStore } = React;
  return function ExpertDetail({ api, expert, t, notify, onClose, onEdit, onStart, schedules, onNewSchedule, openSession, describeSchedule, onSaved, initialTab = 'overview' }) {
    const modal = useRef(null);
    const [tab, setTab] = useState(detailTabs.includes(initialTab) ? initialTab : 'overview');
    const [memory, setMemory] = useState(null);
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const sessions = useSyncExternalStore(api.subscribeSessions, api.sessionsSnapshot, api.sessionsSnapshot);
    const recent = expertSessions(sessions, expert.id);
    const dirty = Boolean(memory && draft && (draft.rules !== memoryText(memory.rules) || draft.progress !== memoryText(memory.progress)));
    const [requestClose, discard] = useDiscard({ dirty, onClose, busy });
    const load = async () => {
      const value = await api.expertMemory(expert.id);
      setMemory(value);
      setDraft({ rules: memoryText(value.rules), progress: memoryText(value.progress) });
    };
    useEffect(() => {
      const previous = typeof document === 'undefined' ? null : document.activeElement;
      modal.current?.showModal();
      let live = true;
      api.expertMemory(expert.id).then(value => { if (live) { setMemory(value); setDraft({ rules: memoryText(value.rules), progress: memoryText(value.progress) }); } }, reason => { if (live) notify(reason.message, { kind: 'error', action: { label: t('retry'), run: load } }); });
      return () => { live = false; modal.current?.close(); previous?.focus(); };
    }, []);
    const saveMemory = async () => {
      if (busy || !dirty) return;
      setBusy(true);
      try {
        await api.saveExpertMemory(expert.id, { rules: memoryLines(draft.rules), progress: memoryLines(draft.progress) });
        await load();
        // 专家团队页标题行的“记忆 N 条”跟着刷新。
        onSaved?.();
        notify(t('expertMemorySaved', { name: expert.name }));
      } catch (reason) { notify(reason.message, { kind: 'error', action: { label: t('retry'), run: saveMemory } }); }
      finally { setBusy(false); }
    };
    const count = memory ? memory.rules.length + memory.progress.length : null;
    const own = schedules ?? [];
    const fact = (label, value) => h('div', { className: 'ww-task-fact' }, h('small', null, label), h('strong', null, value));
    const overview = h('div', { className: 'ww-editor-body ww-expert-detail-body' },
      h('p', null, expert.description),
      h('div', { className: 'ww-task-facts' },
        fact(t('expertDetailSkills'), t('expertDetailSkillCount', { count: expert.skills?.length ?? 0 })),
        fact(t('expertDetailMemory'), count === null ? '…' : count ? t('expertDetailMemoryCount', { count }) : t('expertDetailMemoryEmpty')),
        fact(t('expertDetailSchedules'), own.length ? t('expertDetailScheduleCount', { count: own.length }) : t('expertDetailScheduleNone'))),
      h('h3', null, t('expertDetailRecent')),
      recent.length ? h('ul', { className: 'ww-expert-recent' }, ...recent.map(item => h('li', { key: item.sessionId }, h('button', { type: 'button', onClick: () => openSession(item.sessionId) }, item.title || t('expertDetailUntitled')))))
        : h('p', { className: 'ww-muted' }, t('expertDetailRecentNone')),
      memory && !memory.empty && h(React.Fragment, null, h('h3', null, t('expertDetailMemory')), ...[...memory.rules, ...memory.progress].slice(-3).map((line, index) => h('p', { key: index, className: 'ww-muted' }, line))));
    const memoryPage = h('div', { className: 'ww-editor-body ww-expert-detail-body' },
      h('p', { className: 'ww-muted' }, t('expertMemoryHelp', { path: memory?.path ?? '00-系统/专家记忆' })),
      ...['rules', 'progress'].map(key => h('label', { key }, t(key === 'rules' ? 'expertMemoryRules' : 'expertMemoryProgress'), h('small', { className: 'ww-muted' }, t(key === 'rules' ? 'expertMemoryRulesHelp' : 'expertMemoryProgressHelp')),
        h('textarea', { value: draft?.[key] ?? '', disabled: busy || !draft, spellCheck: false, className: 'ww-memory-text', placeholder: t('expertMemoryPlaceholder'), onChange: event => setDraft(current => ({ ...current, [key]: event.target.value })) }))),
      memory?.over && h('p', { className: 'ww-notice', role: 'status' }, t('expertMemoryOver')));
    const schedulePage = h('div', { className: 'ww-editor-body ww-expert-detail-body' },
      h('p', { className: 'ww-muted' }, t('expertScheduleHelp')),
      own.length ? h('ul', { className: 'ww-expert-recent' }, ...own.map(task => h('li', { key: `${task.sessionId}-${task.id}` },
        h('button', { type: 'button', onClick: () => openSession(task.sessionId) }, task.title || t('expertDetailUntitled')), h('small', { className: 'ww-muted' }, describeSchedule(task)))))
        : h('p', { className: 'ww-muted' }, t('expertDetailScheduleNone')),
      h('button', { type: 'button', className: 'ww-card ww-add-card ww-add-inline', onClick: onNewSchedule }, h('span', { className: 'ww-add-mark', 'aria-hidden': true }, '+'), h('span', null, t('expertScheduleAdd'))));
    const pages = { overview, memory: memoryPage, schedule: schedulePage };
    const footer = tab === 'memory'
      ? [h('button', { type: 'button', key: 'close', disabled: busy, onClick: requestClose }, t('cancelEdit')), h('button', { type: 'button', key: 'save', className: 'ww-primary', disabled: busy || !dirty, onClick: saveMemory }, t(busy ? 'loading' : 'expertSaveChanges'))]
      : [h('button', { type: 'button', key: 'start', className: 'ww-primary', onClick: onStart }, t('start'))];
    return h(React.Fragment, null, h('dialog', { ref: modal, className: 'ww-editor ww-page ww-expert-detail', 'aria-label': expert.name, onCancel: event => { event.preventDefault(); requestClose(); }, onClick: event => { if (event.target === event.currentTarget) requestClose(); } },
      h('header', { className: 'ww-header' },
        h('div', { className: 'ww-row ww-expert-detail-title' }, h(Avatar, { expert, size: 40 }), h('h2', null, expert.name)),
        h('div', { className: 'ww-row' }, h('button', { type: 'button', disabled: busy, onClick: onEdit }, t(expert.readOnly ? 'viewExpert' : 'editExpert')), h('button', { type: 'button', disabled: busy, onClick: requestClose, 'aria-label': t('editorClose') }, '×'))),
      h('div', { className: 'ww-row ww-detail-tabs', role: 'tablist' }, ...detailTabs.map(id => h('button', { type: 'button', key: id, role: 'tab', 'aria-selected': tab === id, className: tab === id ? 'ww-selected' : '', disabled: busy, onClick: () => setTab(id) }, t(`expertDetailTab_${id}`)))),
      pages[tab],
      h('footer', { className: 'ww-row' }, ...footer)), discard);
  };
}
