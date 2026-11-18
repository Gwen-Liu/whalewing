import { readAvatarFile } from '../../src/avatar-image.js';
import { registerEntries } from './entries.js';
import { expertContract } from './contract.js';
import { parseExpertTemplate } from './template.js';
import { registerFeature, useFeature } from '../../src/shell/feature.js';
import { createSplit } from '../../src/split.js';
import { createExpertDetail } from './detail.js';
import { createTeam } from './team.js';
import { expertActivity, rosterOf, sortInUse, daysAgo, defaultIdleDays } from './roster.js';

// 名帖和详情里的时间按北京时间写成“11/09 09:00”。
const shortTime = value => { const time = new Date(value); return Number.isFinite(time.getTime()) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(time) : ''; };
// “有新结果”：定时任务上次运行之后员工还没在详情里看过。只是这台电脑上的提示，存不下时照常显示。
const seenKey = 'whalewing.expertSeen';
const readSeen = () => { try { return JSON.parse(window.localStorage.getItem(seenKey) || '{}') || {}; } catch { return {}; } };
const markSeen = id => { try { window.localStorage.setItem(seenKey, JSON.stringify({ ...readSeen(), [id]: Date.now() })); } catch { /* 存不下就下次还提示。 */ } };

/** 本页持有自己的草稿、动作和恢复状态；切走时不把状态交给外壳。 */
export function createView(kit) {
  const { React, Avatar, ActionMenu, ConfirmDialog, useDiscard, PageHead, z, avatarArt, presetAvatars } = kit;
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } = React;
  // 扩展登记的来源名是 { zh, en }；取不到语言服务时用中文。
  const labelText = label => kit.resolveText ? kit.resolveText(label) : label.zh;
  const ExpertDetail = createExpertDetail(kit);
  function ExpertEditor({ api, expert, preset, initialTemplate = '', onClose, t, notify, nameLock = null }) {
    // 扩展提供的专家：只读的只能查看；可改的不绑定模型和 MCP（那是员工本机的配置），保存交给扩展。
    const sourced = Boolean(expert?.source), viewing = Boolean(expert?.readOnly);
    const avatarRead = useRef(null);
    const [avatarReading, setAvatarReading] = useState(false);
    useEffect(() => () => avatarRead.current?.abort(), []);
    const [draft, setDraft] = useState(() => expert ? { ...expert, skills: [...expert.skills], mcpServers: [...expert.mcpServers] } : preset ? { name: preset.name, description: preset.description, avatar: preset.avatar, prompt: preset.prompt, model: null, skills: [...preset.skills], mcpServers: [] } : { name: '', description: '', avatar: null, prompt: '', model: null, skills: [], mcpServers: [] });
    const [catalog, setCatalog] = useState(null);
    const [templates, setTemplates] = useState(null);
    const [templateId, setTemplateId] = useState('');
    const [busy, setBusy] = useState(false);
    // 报错走右上角提示，不在表单底部插入一行把按钮往下挤。
    const setError = message => { if (message) notify(message, { kind: 'error' }); };
    const [recovery, setRecovery] = useState(null);
    const modal = useRef(null);
    const saving = useRef(false);
    const [initialIdentity] = useState(() => expert || { id: `custom-${globalThis.crypto.randomUUID()}`, revision: 0 });
    const committed = useRef(initialIdentity);
    const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
    // 打开时的样子；之后有改动，关闭前先确认放弃。
    const [baseline] = useState(() => JSON.stringify(draft));
    const [requestClose, discard] = useDiscard({ dirty: !viewing && JSON.stringify(draft) !== baseline, onClose, busy });
    useEffect(() => {
      const previous = typeof document === 'undefined' ? null : document.activeElement;
      modal.current?.showModal();
      let live = true;
      api.expertRequest({ action: 'catalog' }).then(value => { if (live) setCatalog(value); }, reason => { if (live) setError(reason.message); });
      if (!expert) api.expertRequest({ action: 'templates' }).then(value => { if (live) setTemplates(value.templates); }, reason => { if (live) setError(reason.message); });
      return () => { live = false; modal.current?.close(); previous?.focus(); };
    }, []);
    // 套用模板只填表单，创建前都能改；保存时没装的技能会被拒收，所以只保留当前装了的，跳过的告诉员工。
    const applyTemplate = template => {
      const available = new Set((catalog?.skills || []).map(item => item.name));
      const skipped = template.skills.filter(name => !available.has(name));
      setDraft(current => ({ ...current, name: template.name, description: template.description, prompt: template.prompt, skills: template.skills.filter(name => available.has(name)), avatar: (template.avatar && avatarArt[template.avatar]) || null }));
      notify(t(skipped.length ? 'expertTemplateSkipped' : 'expertTemplateApplied', { name: template.name, skills: skipped.join('、') }));
    };
    const chooseTemplate = id => {
      setTemplateId(id);
      const chosen = templates?.find(item => item.id === id);
      if (chosen) applyTemplate(chosen);
      else setDraft(current => ({ ...current, name: '', description: '', prompt: '', skills: [], avatar: null }));
    };
    // 从专家库的模板列表点“照着建”进来：技能目录和模板都读到后套用一次。
    const templateApplied = useRef(false);
    useEffect(() => { if (templateApplied.current || !initialTemplate || !catalog || !templates) return; templateApplied.current = true; chooseTemplate(initialTemplate); }, [catalog, templates]);
    const importTemplate = async event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try { const template = parseExpertTemplate(await file.text()); setTemplateId(''); applyTemplate(template); }
      catch (reason) { setError(reason.message); }
    };
    const savedText = value => t(expert ? 'expertSavedNamed' : 'expertCreated', { name: value.name });
    const save = async () => {
      if (saving.current || avatarReading || viewing) return;
      if (![draft.name, draft.description, draft.prompt].every(value => value.trim())) { setError(t('requiredExpert')); return; }
      saving.current = true; setBusy(true); setError('');
      const identity = committed.current;
      const { name, description, avatar, prompt, model, skills, mcpServers } = draft;
      const fields = { name, description, avatar, prompt, model, skills, mcpServers };
      try {
        const saved = await api.expertRequest({ action: 'save', id: identity.id, expectedRevision: identity.revision, expert: fields });
        // 成功回执已经确定身份；列表失败后重试仍更新同一专家，不再创建第二位。
        committed.current = saved.expert;
        const readback = await api.loadExperts();
        if (!readback.experts.some(item => item.id === saved.expert.id && item.revision === saved.expert.revision)) throw new Error(t('badReply'));
        notify(savedText(saved.expert)); onClose();
      } catch (reason) {
        // 未知接受只按表单的固定身份读回核对；头像规范化后不一致时仍保留表单，不猜测成功。
        try {
          const actual = (await api.loadExperts()).experts.find(item => item.id === identity.id);
          const expected = expertContract(z).fields.parse(fields);
          if (actual && actual.revision > identity.revision && Object.keys(expected).every(key => JSON.stringify(actual[key]) === JSON.stringify(expected[key]))) {
            committed.current = actual; notify(savedText(actual)); onClose(); return;
          }
          if (actual && actual.revision > identity.revision) setRecovery(actual);
        } catch { /* 读回失败不触发新身份或自动重试写入。 */ }
        setError(reason.message);
      }
      finally { saving.current = false; setBusy(false); }
    };
    const upload = async event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      avatarRead.current?.abort();
      const controller = new AbortController(); avatarRead.current = controller;
      setAvatarReading(true); setError('');
      try {
        const value = await readAvatarFile(file, { signal: controller.signal });
        if (!controller.signal.aborted) update('avatar', value);
      } catch (reason) { if (!controller.signal.aborted) setError(reason.message); }
      finally { if (!controller.signal.aborted) setAvatarReading(false); }
    };
    const modelOptions = (catalog?.models || []).flatMap(group => (group.models || []).map(model => ({ ...model, provider: group.id, value: JSON.stringify({ provider: group.id, model: model.id }) })));
    const selectedModel = modelOptions.find(item => item.provider === draft.model?.provider && item.id === draft.model?.model);
    const modelValue = draft.model ? JSON.stringify({ provider: draft.model.provider, model: draft.model.model }) : '';
    const choices = (kind, title) => {
      const available = catalog?.[kind] || [];
      return h('details', { className: 'ww-section' }, h('summary', null, t(title), ` (${draft[kind].length})`), h('p', { className: 'ww-muted' }, t('catalogHelp')),
        ...[...available, ...draft[kind].filter(name => !available.some(item => item.name === name)).map(name => ({ name, missing: true }))].map(item => h('label', { className: 'ww-choice', key: item.name },
          h('input', { type: 'checkbox', checked: draft[kind].includes(item.name), disabled: busy, onChange: event => update(kind, event.target.checked ? [...draft[kind], item.name] : draft[kind].filter(name => name !== item.name)) }),
          h('span', null, item.name, h('small', null, item.missing ? t('missingBinding') : item.description || item.tools?.join(' · '))))), !available.length && h('p', { className: 'ww-muted' }, t('emptyCatalog')));
    };
    const title = t(viewing ? 'viewExpert' : expert ? 'editExpert' : 'addExpert');
    return h(React.Fragment, null, h('dialog', { ref: modal, className: 'ww-editor ww-page', 'aria-label': title, onCancel: event => { event.preventDefault(); requestClose(); }, onClick: event => { if (event.target === event.currentTarget) requestClose(); } },
      h('header', { className: 'ww-header' }, h('h2', null, title), h('button', { type: 'button', disabled: busy, onClick: requestClose, 'aria-label': t('editorClose') }, '×')),
      h(viewing ? 'fieldset' : 'div', viewing ? { className: 'ww-editor-body ww-editor-fields', disabled: true } : { className: 'ww-editor-body' },
        sourced && h('p', { className: 'ww-notice', role: 'status' }, t(viewing ? 'expertSourceView' : 'expertSourceEdit', { name: labelText(expert.source.label) })),
        expert?.baseUpdated?.length > 0 && h('p', { className: 'ww-notice', role: 'status' }, t('expertBaseUpdated', { fields: expert.baseUpdated.map(field => t(`expertField_${field}`)).join('、') })),
        !expert && h('div', { className: 'ww-section' },
          h('div', { className: 'ww-row' },
            h('label', { className: 'ww-field' }, t('expertTemplate'), h('select', { value: templateId, disabled: busy || !catalog || !templates, onChange: event => chooseTemplate(event.target.value) },
              h('option', { value: '' }, t('expertTemplateBlank')), ...(templates || []).map(item => h('option', { key: item.id, value: item.id }, `${item.name} · ${item.description}`)))),
            h('label', { className: 'ww-avatar-upload' }, t('expertTemplateImport'), h('input', { type: 'file', accept: '.md,text/markdown,text/plain', disabled: busy || !catalog, onChange: importTemplate }))),
          h('p', { className: 'ww-muted' }, t('expertTemplateHelp'))),
        h('div', { className: 'ww-avatar-picker' }, h(Avatar, { expert: draft, size: 64 }),
        h('div', { className: 'ww-avatar-side' },
          h('div', { className: 'ww-avatar-actions' }, h('label', { className: 'ww-avatar-upload' }, t('avatar'), h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', disabled: busy, onChange: upload })), h('button', { type: 'button', disabled: busy, onClick: () => update('avatar', null) }, t('clearAvatar'))),
          presetAvatars.length > 0 && h('div', { className: 'ww-avatar-presets', role: 'group', 'aria-label': t('avatarPresets') }, ...presetAvatars.map((id, index) => h('button', { type: 'button', key: id, className: 'ww-avatar-preset', 'aria-pressed': draft.avatar === avatarArt[id], 'aria-label': `${t('avatarPresets')} ${index + 1}`, disabled: busy, onClick: () => update('avatar', avatarArt[id]) }, h('img', { src: avatarArt[id], alt: '' })))))),
      ...[['name', 'expertName'], ['description', 'expertDescription']].map(([key, label]) => {
        // 小鲸的名字由扩展定着时只读，保存时宿主保留员工原来的名字；扩展关掉后原来的名字回来。
        const lock = key === 'name' ? nameLock : null;
        return h('label', { key }, t(label), lock && h('small', { className: 'ww-muted' }, t('assistantNameLocked', { source: lock.label ? labelText(lock.label) : lock.package })), h('input', { value: lock ? lock.name : draft[key], required: true, disabled: busy || Boolean(lock), maxLength: key === 'name' ? 40 : 240, onChange: event => update(key, event.target.value) }));
      }),
      h('label', null, t('expertPrompt'), h('textarea', { required: true, value: draft.prompt, disabled: busy, onChange: event => update('prompt', event.target.value), spellCheck: false })),
      !sourced && h('label', null, t('expertModel'), catalog?.modelSupported === false && h('small', { className: 'ww-muted' }, t('modelUnsupported')), h('select', { value: modelValue, disabled: busy || !catalog || catalog.modelSupported === false, onChange: event => update('model', event.target.value ? JSON.parse(event.target.value) : null) }, h('option', { value: '' }, t('inheritModel')), draft.model && !modelOptions.some(item => item.value === modelValue) && h('option', { value: modelValue }, `${draft.model.provider} / ${draft.model.model} · ${t('modelMissing')}`), ...modelOptions.map(item => h('option', { value: item.value, key: item.value }, item.name || item.model || item.id)))),
      !sourced && selectedModel?.reasoning && h('label', null, t('reasoning'), h('select', { value: draft.model?.reasoningEffort || '', disabled: busy, onChange: event => { const { reasoningEffort, ...model } = draft.model; update('model', event.target.value ? { ...model, reasoningEffort: event.target.value } : model); } }, h('option', { value: '' }, t('reasoningDefault')), ...selectedModel.reasoning.efforts.map(item => h('option', { value: item.id, key: item.id }, item.name)))),
      choices('skills', 'optionalSkills'), sourced ? null : catalog?.mcpSupported === false ? h('p', { className: 'ww-muted' }, t('mcpUnsupported')) : choices('mcpServers', 'optionalMcp'), ...(catalog?.issues || []).map(issue => h('p', { key: issue, className: 'ww-notice' }, issue))),
      recovery && h('div', { className: 'ww-notice' }, t('expertRecovery'), h('button', { type: 'button', disabled: busy, onClick: () => { committed.current = recovery; setDraft({ ...recovery, skills: [...recovery.skills], mcpServers: [...recovery.mcpServers] }); setRecovery(null); setError(''); } }, t('loadSavedExpert'))),
      h('footer', { className: 'ww-row' }, ...(viewing ? [h('button', { type: 'button', className: 'ww-primary', onClick: requestClose }, t('expertViewClose'))] : [h('button', { type: 'button', disabled: busy, onClick: requestClose }, t('cancelEdit')), h('button', { type: 'button', className: 'ww-primary', disabled: busy || avatarReading || !catalog || Boolean(recovery), onClick: save }, t(busy ? 'loading' : expert ? 'expertSaveChanges' : 'expertCreate'))]))), discard);
  }

  const Team = createTeam(kit);
  // 左栏和右边之间那条线能拖（共用的 src/split.js）：没拖过时左栏占约四分之一，夹在 12.5rem 到 18rem（样式里）；拖的范围是 176px 到一半，右边至少留 320px。
  const useSplit = createSplit(React);
  const rosterLimits = size => ({ min: Math.min(176, size / 3), max: Math.max(0, Math.min(size * 0.5, size - 320)) });
  const rosterPreferred = size => Math.max(200, Math.min(size * 0.24, 288));
  const IdleSelect = Team.IdleSelect;
  const dayText = (t, days) => days === 0 ? t('teamToday') : days === 1 ? t('teamYesterday') : t('teamDaysAgo', { days });

  return function ExpertsView({ active, workbench, SessionProvider, renderSlot }) {
    const { api, t, notify, busy, run, setError: reportError, button, field, row, bind, openAssistant } = useFeature(React, workbench, 'experts');
    const split = useSplit({ key: 'experts', active, preferred: rosterPreferred, limits: rosterLimits, reserve: () => 1, label: t('teamResize'), hint: t('splitHint') });
    const setError = (message, action) => reportError(message, action || { label: t('retry'), run: () => refreshTab() });
    const [confirm, setConfirm] = useState(null);
    const [cwd, setCwd] = useState('');
    const [workspaceId, setWorkspaceId] = useState('');
    const [mode, setMode] = useState('');
    const [modes, setModes] = useState([]);
    const [includeSource, setIncludeSource] = useState(false);
    const registry = useSyncExternalStore(api.subscribeExperts, api.experts, api.experts);
    const roleCards = registry.experts;
    const [expertEditor, setExpertEditor] = useState(undefined);
    const [expertPreset, setExpertPreset] = useState(null);
    const [editorTemplate, setEditorTemplate] = useState('');
    const openEditor = (expert, preset = null, template = '') => { setExpertPreset(preset); setEditorTemplate(template); setExpertEditor(expert); };
    // 2026-11-08 第三版：左栏在用的专家；中间是选中的专家（它的任务会话）、专家库，或还没有在用专家时的欢迎页。
    const [selection, setSelection] = useState(null);
    const [taskFor, setTaskFor] = useState({});
    const created = useRef(new Set());
    const latest = useRef([]);
    const [starting, setStarting] = useState(false);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [templates, setTemplates] = useState(null);
    const [detail, setDetail] = useState(null);
    const [memoryCounts, setMemoryCounts] = useState({});
    const [schedules, setSchedules] = useState([]);
    const [seen, setSeen] = useState(readSeen);
    const automation = workbench.internal.clients?.automation;
    const sessions = useSyncExternalStore(api.subscribeSessions, api.sessionsSnapshot, api.sessionsSnapshot);
    const loadExtras = async signal => {
      const [counts, catalog] = await Promise.all([api.memorySummary(signal).catch(() => ({})), automation?.automationCatalog ? automation.automationCatalog(signal).catch(() => null) : null]);
      setMemoryCounts(counts || {});
      setSchedules((catalog?.tasks || []).filter(task => task.purpose === 'custom').map(task => ({ ...task, expertId: automation.taskExpertId(task) })).filter(task => task.expertId));
    };
    const openDetail = (id, tab = 'overview') => { markSeen(id); setSeen(readSeen()); setDetail({ id, tab }); };
    const workspaces = useSyncExternalStore(api.subscribeWorkspaces, api.workspaces, api.workspaces);
    const refreshTab = () => run(async () => { await api.loadExperts(); const value = await api.modes(); await loadExtras(); return () => setModes(value); });
    bind({ refresh: refreshTab, onError: reason => { if (reason.sessionId) return false; setError(reason.message || t('requestFailed')); return true; } });
    useEffect(() => {
      let live = true;
      api.loadExperts().catch(reason => { if (live) setError(reason.message); });
      api.modes().then((value) => { if (live) setModes(value); }, (reason) => { if (live) setError(reason.message || t('requestFailed')); });
      return () => { live = false; };
    }, []);
    useEffect(() => { if (active) loadExtras().catch(() => {}); }, [active]);
    // 小鲸面板右上角“···”要看小鲸的详情或编辑小鲸：切到本页后照办。
    useEffect(() => {
      if (!active || !api.subscribeViewRequest) return undefined;
      const take = () => {
        const request = api.takeViewRequest();
        if (request?.task) {
          const owner = latest.current.find(entry => entry.sessions.some(task => task.id === request.task));
          if (!owner) { api.open(request.task); return; }
          setTaskFor(value => ({ ...value, [owner.role.id]: request.task }));
          setSelection({ kind: 'expert', id: owner.role.id });
          return;
        }
        const role = request && api.experts().experts.find(item => item.id === request.id);
        if (!role) return;
        if (request.tab === 'edit') openEditor(role);
        else if (request.tab === 'reset') { if (role.customized?.length) setConfirm({ kind: 'reset', id: role.id, selected: [...role.customized] }); }
        else openDetail(role.id, request.tab);
      };
      take();
      return api.subscribeViewRequest(take);
    }, [active]);

    const now = Date.now();
    const roster = rosterOf({ experts: roleCards, activity: expertActivity(sessions, { archived: api.archivedSessions(), now }), marks: registry.roster?.marks, idleDays: registry.roster?.idleDays ?? defaultIdleDays, schedules, now });
    const inUse = sortInUse(roster);
    latest.current = roster;
    const entryOf = id => roster.find(entry => entry.role.id === id);
    const showLibrary = selection?.kind === 'library';
    const current = showLibrary ? null : entryOf(selection?.id) ?? inUse[0] ?? null;
    const taskOf = entry => {
      const chosen = taskFor[entry.role.id];
      if (chosen && (created.current.has(chosen) || entry.sessions.some(task => task.id === chosen))) return chosen;
      return entry.busy?.id ?? entry.sessions.find(task => !task.archived)?.id ?? null;
    };
    const scheduleOf = id => schedules.filter(task => task.expertId === id);
    const hasNewResult = role => scheduleOf(role.id).some(task => task.lastRun && Date.parse(task.lastRun.deliveredAt) > (seen[role.id] || 0));
    const statusFor = entry => Team.statusOf(entry, { t, newResult: hasNewResult(entry.role), now, shortTime });
    const sourceLabelOf = role => role.source ? labelText(role.source.label) : role.builtin ? t('teamSourceBuiltin') : t('teamSourceMine');

    // 开始新任务：在中间这栏开一段新的专家会话，不跳走；还不在用的顺便记成选用。
    const newTask = role => {
      if (starting) return undefined;
      setStarting(true);
      return run(async () => {
        const id = await api.createExpert(role.id, { cwd, workspaceId, mode });
        let sourceError;
        if (includeSource) {
          try { await api.request(id, { action: 'status' }); await api.request(id, { action: 'source_add', sessionId: id }); }
          catch (reason) { sourceError = reason; }
        }
        if (!entryOf(role.id)?.inUse) await api.markExpert(role.id, 'picked').catch(() => {});
        return () => {
          created.current.add(id);
          setTaskFor(value => ({ ...value, [role.id]: id }));
          setSelection({ kind: 'expert', id: role.id });
          if (sourceError) notify(`${t('sourceRegisterFailed')} (${id}): ${sourceError.message}`, { kind: 'error', action: { label: t('openCreated'), run: () => api.open(id) } });
        };
      }).finally(() => setStarting(false));
    };
    const mark = (role, state) => run(async () => {
      await api.markExpert(role.id, state);
      return () => { notify(t(state === 'picked' ? 'teamPickDone' : 'teamReturnDone', { name: role.name })); setSelection(state === 'picked' ? { kind: 'expert', id: role.id } : null); };
    });
    const roleMenu = entry => {
      const role = entry.role;
      const items = role.source ? [button(role.readOnly ? 'viewExpert' : 'editExpert', () => openEditor(role)), button('copyExpert', () => openEditor(null, role))] : [button('editExpert', () => openEditor(role))];
      if (entry.inUse && !entry.working) items.push(button('teamReturn', () => mark(role, 'returned')));
      if (!entry.inUse) items.push(button('teamPick', () => mark(role, 'picked')));
      if (!role.source && role.customized?.length > 0) items.push(button('resetExpert', () => setConfirm({ kind: 'reset', id: role.id, selected: [...role.customized] })));
      if (!role.source && !role.builtin) items.push(button('deleteExpert', () => setConfirm({ kind: 'delete', id: role.id })));
      return h(ActionMenu, { label: `${role.name} · ${t('expertOptions')}`, iconOnly: true }, ...items.map((item, index) => h(React.Fragment, { key: index }, item)));
    };
    // 添加专家在页头右边（2026-11-13 起，和其他页签一样操作靠右；原来在左栏标题旁、专家库标题行各有一个），和技能中心的“＋ 添加”同一个主按钮下拉。
    const createMenu = h(ActionMenu, { label: t('addExpert'), text: t('teamAdd'), icon: 'plus', className: 'ww-primary ww-add-menu' }, button('teamCreateByAssistant', () => openAssistant(t('teamCreatePrompt'))), button('teamCreateManual', () => openEditor(null)));
    const scope = h('details', { className: 'ww-section' }, h('summary', null, t('advanced')),
      row(field('project', cwd, setCwd), h('label', { className: 'ww-field' }, t('workspace'), h('select', { value: workspaceId, disabled: busy || Boolean(cwd.trim()), onChange: (event) => setWorkspaceId(event.target.value) }, h('option', { value: '' }, t('defaultWorkspace')), ...(workspaces.items || []).map((item) => h('option', { value: item.workspaceId, key: item.workspaceId }, item.name || item.path || item.workspaceId))))));
    const settings = h(ActionMenu, { label: t('advanced'), icon: 'gear' },
      h(IdleSelect, { t, value: registry.roster?.idleDays ?? defaultIdleDays, disabled: busy, onChange: days => run(async () => { await api.setIdleDays(days); return () => notify(days ? t('teamIdleSaved', { days }) : t('teamIdleSavedOff')); }) }),
      h('label', { className: 'ww-field' }, t('mode'), h('select', { 'aria-label': t('mode'), value: mode, disabled: busy, onChange: event => setMode(event.target.value) }, h('option', { value: '' }, t('defaultMode')), ...modes.map(item => h('option', { key: item.id, value: item.id, disabled: Boolean(item.broken) }, item.name ?? item.id)))), scope,
      h('label', { className: 'ww-choice' }, h('input', { type: 'checkbox', checked: includeSource, disabled: busy, onChange: event => setIncludeSource(event.target.checked) }), t('includeSource')),
      registry.deleted.length > 0 && h('div', { className: 'ww-deleted-experts' }, h('strong', null, `${t('deletedExperts')} (${registry.deleted.length})`), ...registry.deleted.map(expert => h('div', { key: expert.id, className: 'ww-row' }, expert.name, button('restoreExpert', () => run(async () => { await api.expertRequest({ action: 'restore', id: expert.id, expectedRevision: expert.revision }); await api.loadExperts(); return () => notify(t('expertRestoreDone', { name: expert.name })); }))))));

    // 专家库：按内置、我建的、各扩展分组；能按来源和有没有定时任务筛，按名字、介绍、技能找。
    const keyword = query.trim().toLowerCase();
    const sourceNames = [...new Set(roster.filter(entry => entry.role.source).map(entry => labelText(entry.role.source.label)))];
    const kindOf = role => role.source ? `source:${labelText(role.source.label)}` : role.builtin ? 'builtin' : 'mine';
    const matchesFilter = (entry, value) => value === 'all' || (value === 'scheduled' ? scheduleOf(entry.role.id).length > 0 : kindOf(entry.role) === value);
    const visible = roster.filter(entry => matchesFilter(entry, filter) && (!keyword || [entry.role.name, entry.role.description, ...(entry.role.skills || [])].some(value => String(value).toLowerCase().includes(keyword))));
    const groups = [
      { id: 'builtin', label: t('teamSourceBuiltin'), note: t('teamGroupBuiltinNote') },
      { id: 'mine', label: t('teamSourceMine'), note: t('teamGroupMineNote') },
      ...sourceNames.map(name => ({ id: `source:${name}`, label: name, note: t('teamGroupSourceNote', { name }) })),
    ].map(group => ({ ...group, entries: visible.filter(entry => kindOf(entry.role) === group.id) }));
    const count = id => roster.filter(entry => matchesFilter(entry, id)).length;
    const chips = [{ id: 'all', label: t('expertFilter_all') }, { id: 'builtin', label: t('teamSourceBuiltin') }, { id: 'mine', label: t('teamSourceMine') }, ...sourceNames.map(name => ({ id: `source:${name}`, label: name })), { id: 'scheduled', label: t('expertFilter_scheduled') }]
      .map(chip => ({ ...chip, count: count(chip.id) })).filter(chip => chip.id === 'all' || chip.count > 0);
    const summary = t('teamLibrarySummary', { count: roster.length, parts: chips.filter(chip => chip.id !== 'all' && chip.id !== 'scheduled').map(chip => `${chip.label} ${chip.count}`).join('、') });
    const metaFor = entry => [entry.role.skills?.length ? t('teamSkillCount', { count: entry.role.skills.length }) : '', memoryCounts[entry.role.id] ? t('teamMemoryCount', { count: memoryCounts[entry.role.id] }) : ''].filter(Boolean).join(' · ');
    const lastFor = entry => {
      if (entry.busy) return t(`teamState_${entry.busy.status}`);
      if (entry.nextRun) return t('teamNextRun', { time: shortTime(entry.nextRun) });
      const days = daysAgo(entry.lastUsed, now);
      return days === null ? t('teamNeverUsed') : t(entry.pickedOnly ? 'teamPickedAgo' : 'teamUsedAgo', { when: dayText(t, days) });
    };
    const loadTemplates = () => { if (templates === null) api.expertRequest({ action: 'templates' }).then(value => setTemplates(value.templates), reason => { setTemplates([]); setError(reason.message); }); };
    const starters = (() => { const preferred = ['development', 'writing', 'research'].map(id => roleCards.find(role => role.id === id)).filter(Boolean); return preferred.length ? preferred : roleCards.filter(role => role.builtin && role.id !== 'manager').slice(0, 3); })();

    let middle;
    if (showLibrary) middle = h(Team.LibraryPane, { t, groups, total: roster.length, summary, query, setQuery, filter, setFilter, chips, metaFor, lastFor, sourceLabelFor: sourceLabelOf, onOpen: id => setSelection({ kind: 'expert', id }), onPick: role => mark(role, 'picked'), templates, onTemplates: loadTemplates, onTemplate: id => openEditor(null, null, id) });
    else if (current) middle = h(Team.ExpertPane, { key: current.role.id, t, api, entry: current, sourceLabel: sourceLabelOf(current.role), taskId: taskOf(current), onTask: id => setTaskFor(value => ({ ...value, [current.role.id]: id })), onNewTask: () => newTask(current.role), starting: starting || busy, SessionProvider, renderSlot, menu: roleMenu(current), memoryCount: memoryCounts[current.role.id] || 0, openDetail: tab => openDetail(current.role.id, tab), status: statusFor(current) });
    else middle = h(Team.WelcomePane, { t, starters, starting: starting || busy, onStart: newTask, onLibrary: () => setSelection({ kind: 'library' }), onAssistant: () => openAssistant() });

    const confirmDialog = (() => {
      const role = confirm && roleCards.find(item => item.id === confirm.id);
      if (!role) return null;
      const label = field => t(`expertField_${field}`);
      if (confirm.kind === 'delete') {
        const confirmDelete = () => run(async () => { await api.expertRequest({ action: 'remove', id: role.id, expectedRevision: role.revision }); await api.loadExperts(); return () => { setConfirm(null); setSelection(null); notify(t('expertDeleteDone', { name: role.name })); }; });
        return h(ConfirmDialog, { title: t('expertDeleteTitle'), message: [h('p', { key: 'q' }, t('expertConfirmDelete')), h('p', { key: 'h' }, t('expertDeleteHelp'))], confirmLabel: t('deleteExpert'), cancelLabel: t('cancel'), danger: true, busy, onConfirm: confirmDelete, onCancel: () => setConfirm(null) });
      }
      // 恢复原版可以只选几项；全选时整位恢复。
      const customized = role.customized || [];
      const confirmReset = () => {
        if (!confirm.selected.length) { notify(t('expertResetPick'), { kind: 'error' }); return; }
        const fields = customized.filter(field => confirm.selected.includes(field));
        return run(async () => { await api.restoreExpertOriginal(role, fields.length === customized.length ? undefined : fields); return () => { setConfirm(null); notify(t('expertResetDone', { name: role.name, fields: fields.map(label).join('、') })); }; });
      };
      return h(ConfirmDialog, { title: t('expertResetTitle'), message: [h('p', { key: 'q' }, t('expertConfirmReset')),
        ...customized.map(field => h('label', { key: field, className: 'ww-choice' }, h('input', { type: 'checkbox', checked: confirm.selected.includes(field), disabled: busy, onChange: event => setConfirm({ ...confirm, selected: event.target.checked ? [...confirm.selected, field] : confirm.selected.filter(item => item !== field) }) }), label(field), role.baseUpdated?.includes(field) && t('expertFieldUpdated'))),
        h('p', { key: 'h' }, t('expertResetHelp'))], confirmLabel: t('resetExpert'), cancelLabel: t('cancel'), busy, onConfirm: confirmReset, onCancel: () => setConfirm(null) });
    })();

    const detailRole = detail && roleCards.find(role => role.id === detail.id);
    const describeTask = task => task.status === 'active' ? `下一次 ${shortTime(task.scheduledAt)}` : task.status === 'paused' ? '已暂停' : '已结束';
    // 页头和其他页签一样：一行宋体标题，下面一句现状（在用几位、专家库几位、几位在做或等你审批），操作靠右。
    const busyCount = states => inUse.filter(entry => states.includes(entry.busy?.status)).length;
    const headSummary = [inUse.length ? t('teamHeadInUse', { count: inUse.length }) : t('teamHeadNoneInUse'), t('teamHeadLibrary', { count: roster.length }),
      busyCount(['running', 'queued']) && t('teamHeadRunning', { count: busyCount(['running', 'queued']) }), busyCount(['waiting']) && t('teamHeadWaiting', { count: busyCount(['waiting']) })].filter(Boolean).join(' · ');
    const body = h('section', { className: 'ww-experts' },
      h(PageHead, { title: t('experts'), summary: headSummary, actions: createMenu }),
      h('div', { className: 'ww-team', ref: split.frame, style: split.style('--ww-split') },
        h(Team.Roster, { t, entries: inUse, selection: showLibrary ? selection : current ? { kind: 'expert', id: current.role.id } : null, statusFor, sourceLabelFor: role => role.source ? labelText(role.source.label) : '', onSelect: setSelection, libraryCount: roster.length, idleDays: registry.roster?.idleDays ?? defaultIdleDays, settings }),
        h('div', { ...split.separator, className: 'ww-split-line' }),
        middle),
      confirmDialog,
      detailRole && h(ExpertDetail, { key: `${detailRole.id}-${detail.tab}`, initialTab: detail.tab, api, expert: detailRole, t, notify, onClose: () => setDetail(null),
        onEdit: () => { setDetail(null); openEditor(detailRole); }, onStart: () => { setDetail(null); if (detailRole.id === 'manager') openAssistant(); else newTask(detailRole); },
        schedules: scheduleOf(detailRole.id), describeSchedule: describeTask, openSession: id => run(async () => { await api.open(id); }), onSaved: () => { loadExtras().catch(() => {}); },
        onNewSchedule: () => { setDetail(null); automation?.requestNewTask?.({ expertId: detailRole.id }); workbench.openTab('automation'); } }),
      expertEditor !== undefined && h(ExpertEditor, { key: expertEditor?.id || (expertPreset ? `copy-${expertPreset.id}` : `new-${editorTemplate}`), api, expert: expertEditor, preset: expertPreset, initialTemplate: editorTemplate, onClose: () => openEditor(undefined), t, notify, nameLock: expertEditor?.id === 'manager' ? workbench.internal.assistantName().custom : null }));
    return active ? body : null;
  };
}

export const name = 'whalewing-experts';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'experts', createView, { contract: expertContract, namespace: 'whalewingExperts', entries: registerEntries }); }
