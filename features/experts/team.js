/**
 * 专家团队页（2026-11-08 用户定第三版，见 docs/业务能力设计.md「专家团队」）：
 * 左栏在用的专家一行一位；中间是选中那位专家说的话（它的任务会话，DSH 原生对话嵌在这里，底下能直接跟它说话），
 * 或者专家库；右边固定是小鲸（小鲸面板，不在本页里）。宽度全跟着所在区域走，窄了左栏收成一列头像（容器查询）。
 */
import { taskTitle, daysAgo, idleChoices } from './roster.js';

export const busyTone = { waiting: 'wait', running: 'run', queued: 'run', error: 'err', completed: 'ok' };

export function createTeam(kit) {
  const { React, Avatar, ActionMenu, Glyph } = kit;
  const { createElement: h, useState, useEffect } = React;

  /** 左栏那一行写的话：手上的事 > 有新结果 > 定时任务 > 多久前用过（快回专家库时写还剩几天）。 */
  function statusOf(entry, { t, newResult, now, shortTime }) {
    const name = entry.role.name;
    if (entry.busy) return { tone: busyTone[entry.busy.status], text: `${t(`teamState_${entry.busy.status}`)} · ${taskTitle(entry.busy.title, name) || t('teamUntitled')}` };
    const next = entry.nextRun ? t('teamNextRun', { time: shortTime(entry.nextRun) }) : '';
    if (newResult) return { tone: 'ok', text: [t('expertNewResult'), next].filter(Boolean).join(' · ') };
    if (entry.scheduled.length) return { tone: '', text: next || t('teamScheduled') };
    const days = daysAgo(entry.lastUsed, now);
    const used = days === null ? '' : t(entry.pickedOnly ? 'teamPickedAgo' : 'teamUsedAgo', { when: days === 0 ? t('teamToday') : days === 1 ? t('teamYesterday') : t('teamDaysAgo', { days }) });
    if (entry.remainingDays !== null && entry.remainingDays <= 5) return { tone: 'idle', text: [used, t('teamReturnSoon', { days: entry.remainingDays })].filter(Boolean).join(' · ') };
    return { tone: '', text: used };
  }

  function RosterItem({ entry, selected, status, sourceLabel, onSelect }) {
    const { role } = entry;
    return h('li', null, h('button', { type: 'button', className: 'ww-roster-item', 'aria-current': selected ? 'true' : undefined, title: status.text ? `${role.name}：${status.text}` : role.name, onClick: onSelect },
      h('span', { className: 'ww-roster-avatar', 'data-tone': status.tone || undefined }, h(Avatar, { expert: role, size: 34 })),
      h('span', { className: 'ww-roster-text' },
        h('strong', null, h('span', { className: 'ww-roster-name' }, role.name), sourceLabel && h('span', { className: 'ww-tag' }, sourceLabel)),
        status.text && h('small', { 'data-tone': status.tone || undefined }, status.text))));
  }

  /** 左栏：在用的专家、专家库入口、天数说明和可选设置。页标题和“添加专家”在三栏上面的页头里（2026-11-13 起）。 */
  function Roster({ t, entries, selection, statusFor, sourceLabelFor, onSelect, libraryCount, idleDays, settings }) {
    return h('nav', { className: 'ww-team-panel ww-roster', 'aria-label': t('teamRoster') },
      h('p', { className: 'ww-roster-group' }, entries.length ? t('teamInUseCount', { count: entries.length }) : t('teamInUse')),
      entries.length
        ? h('ul', { className: 'ww-roster-list' }, ...entries.map(entry => h(RosterItem, { key: entry.role.id, entry, selected: selection?.kind === 'expert' && selection.id === entry.role.id, status: statusFor(entry), sourceLabel: sourceLabelFor(entry.role), onSelect: () => onSelect({ kind: 'expert', id: entry.role.id }) })))
        : h('p', { className: 'ww-roster-empty' }, t('teamInUseEmpty')),
      h('div', { className: 'ww-roster-sep', role: 'presentation' }),
      h('button', { type: 'button', className: 'ww-roster-item ww-roster-library', 'aria-current': selection?.kind === 'library' ? 'true' : undefined, title: t('teamLibraryCount', { count: libraryCount }), onClick: () => onSelect({ kind: 'library' }) },
        h('span', { className: 'ww-roster-avatar ww-roster-icon', 'aria-hidden': true }, h(Glyph, { name: 'grid', size: 16 })),
        h('span', { className: 'ww-roster-text' }, h('strong', null, t('teamLibrary')), h('small', null, t('teamLibraryCount', { count: libraryCount })))),
      h('footer', { className: 'ww-roster-foot' }, h('small', { className: 'ww-roster-hint' }, idleDays ? t('teamIdleHint', { days: idleDays }) : t('teamIdleNever')), settings));
  }

  /** 中间一栏：一位专家。顶上是它是谁、记忆和详情；下面切换它的几件任务，正文是那件任务的 DSH 原生对话。 */
  function ExpertPane({ t, api, entry, sourceLabel, taskId, onTask, onNewTask, starting, SessionProvider, renderSlot, menu, memoryCount, openDetail, status }) {
    const { role } = entry;
    // 换任务时先换上新会话，等界面不再用旧的那段了再释放它（同小鲸面板）；先放后换会让嵌着的会话报“引用已释放”。
    const [reference, setReference] = useState(null);
    useEffect(() => {
      if (!taskId || !SessionProvider || !api.retain) { setReference(null); return; }
      setReference(api.retain(taskId));
    }, [taskId]);
    useEffect(() => () => { reference?.release(); }, [reference]);
    const shown = reference;
    const tasks = entry.sessions.filter(task => !task.archived || task.id === taskId).slice(0, 30);
    const current = tasks.find(task => task.id === taskId);
    const label = task => `${taskTitle(task.title, role.name) || t(task.blank ? 'teamNewTaskTitle' : 'teamUntitled')}${task.status ? ` · ${t(`teamState_${task.status}`)}` : ''}`;
    return h('section', { className: 'ww-team-panel ww-expert-pane', 'aria-label': t('teamPaneLabel', { name: role.name }) },
      h('header', { className: 'ww-pane-head' }, h(Avatar, { expert: role, size: 40 }),
        h('div', { className: 'ww-pane-title' },
          h('div', { className: 'ww-pane-name' }, h('h2', null, role.name), sourceLabel && h('span', { className: 'ww-tag' }, sourceLabel), !entry.inUse && h('span', { className: 'ww-tag' }, t('teamNotInUse')), role.baseUpdated?.length > 0 && h('span', { className: 'ww-tag ww-tag-warn' }, t('expertBaseUpdatedTag'))),
          h('small', { title: role.description }, role.description)),
        h('div', { className: 'ww-pane-actions' },
          memoryCount > 0 && h('button', { type: 'button', className: 'ww-quiet', onClick: () => openDetail('memory') }, t('teamMemoryCount', { count: memoryCount })),
          h('button', { type: 'button', className: 'ww-quiet', onClick: () => openDetail('overview') }, t('teamDetail')), menu)),
      h('div', { className: 'ww-pane-tasks' },
        tasks.length > 0 && h('label', { className: 'ww-pane-task' }, h('span', null, t('teamTask')),
          h('select', { value: taskId || '', onChange: event => onTask(event.target.value) }, ...tasks.map(task => h('option', { key: task.id, value: task.id }, label(task))))),
        current?.status && h('span', { className: 'ww-state', 'data-tone': busyTone[current.status] || undefined }, t(`teamState_${current.status}`)),
        status?.tone === 'ok' && !current?.status && h('span', { className: 'ww-state', 'data-tone': 'ok' }, t('expertNewResult')),
        h('button', { type: 'button', className: 'ww-pane-new', disabled: starting, onClick: onNewTask }, h(Glyph, { name: 'plus', size: 14 }), t('teamNewTask'))),
      shown
        ? h('div', { className: 'ww-assistant-conversation ww-expert-conversation', key: shown.sessionId }, h(SessionProvider, { session: shown }, renderSlot('whalewing.experts.conversation', {})))
        : h('div', { className: 'ww-pane-empty' }, h(Avatar, { expert: role, size: 56 }), h('h3', null, t('teamNoTasks', { name: role.name })), h('p', null, role.description),
          h('button', { type: 'button', className: 'ww-primary', disabled: starting, onClick: onNewTask }, t('start'))));
  }

  function LibraryRow({ t, entry, meta, last, sourceLabel, onOpen, onPick }) {
    const { role } = entry;
    return h('li', { className: 'ww-lib-row' }, h(Avatar, { expert: role, size: 36 }),
      h('div', { className: 'ww-lib-text' },
        h('div', { className: 'ww-lib-name' }, h('button', { type: 'button', className: 'ww-lib-open', onClick: onOpen, 'aria-label': t('teamOpenExpert', { name: role.name }) }, role.name), sourceLabel && h('span', { className: 'ww-tag' }, sourceLabel), meta && h('small', null, meta)),
        h('small', { className: 'ww-lib-desc', title: role.description }, role.description)),
      h('small', { className: 'ww-lib-last' }, last),
      entry.inUse ? h('span', { className: 'ww-lib-inuse' }, t('teamInUseTag'))
        : h('button', { type: 'button', className: 'ww-lib-pick', onClick: onPick, 'aria-label': t('teamPickNamed', { name: role.name }) }, t('teamPick')));
  }

  /** 中间一栏：专家库。按内置、我建的、各扩展分组，一行一位；在用的标“在用”，其余能“选用”。随包模板收在最后一行。 */
  function LibraryPane({ t, groups, total, summary, query, setQuery, filter, setFilter, chips, metaFor, lastFor, sourceLabelFor, onOpen, onPick, templates, onTemplates, onTemplate }) {
    const [showTemplates, setShowTemplates] = useState(false);
    const shown = groups.filter(group => group.entries.length);
    return h('section', { className: 'ww-team-panel ww-library-pane', 'aria-label': t('teamLibrary') },
      h('header', { className: 'ww-pane-head ww-library-head' },
        h('div', { className: 'ww-pane-title' }, h('h2', null, t('teamLibrary')), h('small', null, summary)),
        h('label', { className: 'ww-search ww-library-search' }, h('input', { type: 'search', value: query, placeholder: t('expertSearchPlaceholder'), 'aria-label': t('expertSearch'), onChange: event => setQuery(event.target.value) }))),
      h('div', { className: 'ww-library-chips', role: 'group', 'aria-label': t('teamLibraryFilter') }, ...chips.map(chip => h('button', { type: 'button', key: chip.id, className: 'ww-chip', 'aria-pressed': filter === chip.id, onClick: () => setFilter(chip.id) }, chip.label, h('small', null, String(chip.count))))),
      h('div', { className: 'ww-library-body' },
        shown.length ? shown.map(group => h('section', { key: group.id, className: 'ww-lib-group', 'aria-label': group.label },
          h('h3', null, group.label, h('small', null, String(group.entries.length)), group.note && h('span', null, group.note)),
          h('ul', null, ...group.entries.map(entry => h(LibraryRow, { key: entry.role.id, t, entry, meta: metaFor(entry), last: lastFor(entry), sourceLabel: group.tagged ? sourceLabelFor(entry.role) : '', onOpen: () => onOpen(entry.role.id), onPick: () => onPick(entry.role) })))))
          : h('p', { className: 'ww-muted', role: 'status' }, total ? t('expertNoMatch') : t('teamLibraryEmpty')),
        h('section', { className: 'ww-lib-templates', 'aria-label': t('teamTemplates') },
          h('div', { className: 'ww-lib-templates-head' }, h('div', null, h('strong', null, t('teamTemplates')), h('small', null, t('teamTemplatesHelp'))),
            h('button', { type: 'button', 'aria-expanded': showTemplates, onClick: () => { if (!showTemplates) onTemplates(); setShowTemplates(!showTemplates); } }, t(showTemplates ? 'teamTemplatesHide' : 'teamTemplatesShow'))),
          showTemplates && (templates === null ? h('p', { className: 'ww-muted', role: 'status' }, t('loading'))
            : h('ul', null, ...templates.map(item => h('li', { key: item.id, className: 'ww-lib-row' }, h('div', { className: 'ww-lib-text' }, h('div', { className: 'ww-lib-name' }, h('strong', null, item.name)), h('small', { className: 'ww-lib-desc', title: item.description }, item.description)),
              h('button', { type: 'button', className: 'ww-lib-pick', onClick: () => onTemplate(item.id), 'aria-label': t('teamFromTemplateNamed', { name: item.name }) }, t('teamFromTemplate')))))))));
  }

  /** 还没有在用的专家：说清专家的话会出现在这里，给几位常用的直接开工。 */
  function WelcomePane({ t, starters, onStart, onLibrary, onAssistant, starting }) {
    return h('section', { className: 'ww-team-panel ww-team-welcome', 'aria-label': t('teamWelcomeTitle') },
      h('div', { className: 'ww-team-welcome-faces', 'aria-hidden': true }, ...starters.map(role => h(Avatar, { key: role.id, expert: role, size: 44 }))),
      h('h2', null, t('teamWelcomeTitle')),
      h('p', null, t('teamWelcomeHelp')),
      h('div', { className: 'ww-row ww-team-welcome-actions' }, h('button', { type: 'button', className: 'ww-primary', onClick: onAssistant }, t('teamOpenAssistant')), h('button', { type: 'button', onClick: onLibrary }, t('teamGoLibrary'))),
      starters.length > 0 && h('div', { className: 'ww-team-starters' }, h('small', null, t('teamWelcomeDirect')),
        ...starters.map(role => h('div', { className: 'ww-starter', key: role.id }, h(Avatar, { expert: role, size: 32 }),
          h('div', { className: 'ww-lib-text' }, h('strong', null, role.name), h('small', { className: 'ww-lib-desc', title: role.description }, role.description)),
          h('button', { type: 'button', disabled: starting, onClick: () => onStart(role) }, t('start'))))));
  }

  /** 可选设置里“多久不用就回专家库”的选择。 */
  function IdleSelect({ t, value, onChange, disabled }) {
    return h('label', { className: 'ww-field' }, t('teamIdleSetting'), h('select', { value: String(value), disabled, onChange: event => onChange(Number(event.target.value)) },
      ...idleChoices.map(days => h('option', { key: days, value: String(days) }, days ? t('teamIdleDays', { days }) : t('teamIdleOff')))));
  }

  return { statusOf, Roster, ExpertPane, LibraryPane, WelcomePane, IdleSelect };
}
