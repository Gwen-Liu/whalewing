import { readAvatarFile } from '../../src/avatar-image.js';
import { aiWebEntries, aiWebGroup, aiWebGuide, aiWebScenes } from './catalog.js';
import { findAiWebEntries, openAiWebsite, composeAiAsk, askLimits } from './client-api.js';
import { aiWebFaces } from '../../src/utilities/ai-web-faces.js';
import { worldPersonas } from '../../src/model-world-persona.js';

/** 组件可常驻挂载；隐藏时没有网络、登录或会话初始化动作。 */
/** useDiscard：外壳的“有改动先确认放弃”；单独测试视图时不传，关闭直接关。Modal、ConfirmDialog：外壳的居中弹窗，提问台用。 */
export function createAiWebView(React, { useDiscard = ({ onClose }) => [onClose, null], Modal, ConfirmDialog, Glyph = () => null } = {}) {
  const { createElement: h, useState, useRef, useEffect, useSyncExternalStore } = React;
  /** 内置入口的拿手戏、场景和接待它的角色；自定义入口没有。 */
  const guideOf = entry => entry?.builtin ? aiWebGuide[entry.id] : undefined;
  const plain = entry => entry.avatar ? h('img', { src: entry.avatar, alt: '', width: 48, height: 48, className: 'ww-avatar', style: { objectFit: 'contain', background: 'var(--ww-ai-plate,#fff)', padding: 6, boxSizing: 'border-box' } }) : h('span', { className: 'ww-avatar', 'aria-hidden': true, style: { display: 'grid', placeItems: 'center', width: 48, height: 48, fontSize: 22, background: 'var(--dsw-alias-interactive-bg-hover)' } }, Array.from(entry.name.trim())[0] || 'AI');
  // 有立绘的厂商用模型世界的角色小像，右下角叠这家的官方图标；没有立绘的照旧用官方图标或名字首字。
  const avatar = entry => {
    const face = aiWebFaces[guideOf(entry)?.persona];
    return face ? h('span', { className: 'ww-ai-face' }, h('img', { src: face, alt: '', width: 48, height: 48, className: 'ww-avatar' }), entry.avatar && h('img', { src: entry.avatar, alt: '', width: 18, height: 18, className: 'ww-ai-badge' })) : plain(entry);
  };
  function Editor({ entry, removing, manageAiWeb, onSaved, onClose, notify }) {
    const [draft, setDraft] = useState(() => ({ name: entry?.name ?? '', url: entry?.url ?? '', description: entry?.description ?? '', avatar: entry?.avatar ?? null }));
    const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [recovery, setRecovery] = useState(null);
    // 报错走右上角提示，不在表单底部插入一行。
    const setError = message => { if (message) notify?.(message, { kind: 'error' }); };
    const identity = useRef(entry ?? { id: `custom-${globalThis.crypto.randomUUID()}`, revision: 0 });
    // 底部按钮在表单外面（和其它抽屉一样固定在底部），靠 form 属性仍算这张表单的按钮：点“添加”、在输入框里按回车都照常提交。
    const [formId] = useState(() => `ww-ai-web-form-${identity.current.id}`);
    const dialog = useRef(null), lock = useRef(false), alive = useRef(true), uploadTask = useRef(null), request = useRef(null);
    useEffect(() => {
      const previous = globalThis.document?.activeElement;
      alive.current = true;
      try { dialog.current?.showModal(); } catch { setError('编辑窗口打开失败，请关闭后重试'); }
      return () => { alive.current = false; uploadTask.current?.abort(); request.current?.abort(); dialog.current?.close(); previous?.focus(); };
    }, []);
    const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
    // 打开时的样子；之后有改动，关闭前先确认放弃（删除确认不算编辑）。
    const [baseline] = useState(() => JSON.stringify(draft));
    const [requestClose, discard] = useDiscard({ dirty: !removing && JSON.stringify(draft) !== baseline, onClose, busy });
    const upload = async event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      uploadTask.current?.abort();
      const controller = new AbortController(); uploadTask.current = controller; setUploading(true);
      try { const value = await readAvatarFile(file, { signal: controller.signal }); if (alive.current && !controller.signal.aborted) { update('avatar', value); setError(''); } }
      catch (reason) { if (alive.current && !controller.signal.aborted) setError(reason.message); }
      finally { if (alive.current && uploadTask.current === controller) { uploadTask.current = null; setUploading(false); } }
    };
    const save = async event => {
      event?.preventDefault();
      if (lock.current || uploading) return;
      lock.current = true; setBusy(true); setError('');
      const controller = new AbortController(); request.current = controller;
      try {
        const value = await manageAiWeb(removing ? { action: 'remove', id: identity.current.id, expectedRevision: identity.current.revision } : { action: 'save', id: identity.current.id, expectedRevision: identity.current.revision, entry: draft }, controller.signal);
        if (!alive.current) return;
        const actual = value.entries.find(item => item.id === identity.current.id);
        if (removing ? !!actual : !actual || actual.revision <= identity.current.revision) throw new Error('保存读回未确认，请刷新核对；表单已保留');
        onSaved(value.entries); onClose();
        notify?.(removing ? `已删除“${entry.name}”` : entry ? `已保存“${draft.name.trim()}”的修改` : `已添加“${draft.name.trim()}”`);
      } catch (reason) {
        if (!alive.current || controller.signal.aborted) return;
        setError(reason.message);
        try {
          const value = await manageAiWeb({ action: 'list' }, controller.signal);
          if (!alive.current) return;
          onSaved(value.entries);
          const actual = value.entries.find(item => item.id === identity.current.id);
          if (removing && !actual) { onClose(); notify?.(`已删除“${entry.name}”`); return; }
          if (actual && actual.revision !== identity.current.revision) setRecovery(actual);
        } catch { /* 保留草稿与固定身份；读回失败不自动再次写入。 */ }
      } finally { lock.current = false; if (alive.current) setBusy(false); }
    };
    const close = () => { if (!lock.current) requestClose(); };
    const cancel = h('button', { type: 'button', disabled: busy, onClick: close }, '取消');
    const submit = h('button', { type: 'submit', form: formId, disabled: busy || uploading || !!recovery, className: removing ? 'ww-danger' : 'ww-primary' }, busy ? '正在保存…' : uploading ? '正在检查头像…' : removing ? '确认删除' : entry ? '保存修改' : '添加');
    const recoveryNotice = recovery && h('p', { className: 'ww-notice' }, '发现已保存的版本，当前输入仍保留', h('button', { type: 'button', disabled: busy, onClick: () => { identity.current = recovery; setDraft({ name: recovery.name, url: recovery.url, description: recovery.description, avatar: recovery.avatar }); setRecovery(null); setError(''); } }, '加载已保存版本'));
    // 删除是居中确认框，按钮跟在说明后面；添加、编辑是右侧抽屉，和外壳 Drawer、专家抽屉同一种结构：正文滚动，底部按钮固定。
    const body = removing ? [h('form', { id: formId, onSubmit: save, className: 'ww-editor-body' }, h('p', null, `确认删除“${entry.name}”？网站账号及浏览器会话保持不变`), recoveryNotice, h('footer', { className: 'ww-dialog-actions' }, cancel, submit))] : [
      h('form', { id: formId, onSubmit: save, className: 'ww-editor-body' },
        h('div', { className: 'ww-avatar-picker' }, plain(draft), h('div', { className: 'ww-avatar-side' },
          h('div', { className: 'ww-avatar-actions' }, h('label', { className: 'ww-avatar-upload' }, '上传头像', h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', disabled: busy || uploading, onChange: upload })), h('button', { type: 'button', disabled: busy || uploading, onClick: () => update('avatar', null) }, '使用名字首字')),
          h('p', { className: 'ww-help' }, 'PNG、JPEG 或 WebP，不超过 512 KiB；宽和高均须小于 300 像素'))),
        ...[['name', '名字', 80], ['url', '网址', 2048], ['description', '描述（选填）', 400]].map(([key, label, maxLength]) => h('label', { key, className: 'ww-field' }, label, h('input', { type: key === 'url' ? 'url' : 'text', required: key !== 'description', autoFocus: key === 'name', maxLength, value: draft[key], disabled: busy, placeholder: key === 'url' ? 'https://…' : '', onChange: event => update(key, event.target.value) })))),
      recoveryNotice,
      h('footer', { className: 'ww-row' }, cancel, submit)];
    return h(React.Fragment, null, h('dialog', { ref: dialog, className: removing ? 'ww-modal ww-confirm ww-page' : 'ww-editor ww-page', 'aria-label': removing ? '删除 AI 入口' : entry ? '编辑 AI 入口' : '添加 AI 入口', onCancel: event => { event.preventDefault(); close(); }, onClick: event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } } },
      h('header', { className: 'ww-header' }, h('h2', null, removing ? '删除 AI 入口' : entry ? '编辑 AI 入口' : '添加 AI 入口'), h('button', { type: 'button', disabled: busy, onClick: close, 'aria-label': '关闭 AI 入口编辑' }, '×')),
      ...body), discard);
  }
  /**
   * 提问台挑笔记：和知识积累“快速切换”同一种弹窗（外壳共用的“搜了再挑”）——带图标的搜索框、单行列表、行尾写它在哪个文件夹。
   * 多选：点一行勾上，再点去掉，最多带 askLimits.notes 篇；没敲关键词时列最近建的。
   */
  function NotePicker({ ask, picked, onDone, onClose, notify }) {
    const [query, setQuery] = useState(''), [list, setList] = useState(null), [chosen, setChosen] = useState(picked);
    const turn = useRef(0);
    useEffect(() => {
      const mine = ++turn.current;
      const timer = setTimeout(() => {
        ask.findNotes(query).then(notes => { if (turn.current === mine) setList(notes); }, error => { if (turn.current === mine) { setList([]); notify?.(error.message, { kind: 'error' }); } });
      }, query ? 250 : 0);
      return () => clearTimeout(timer);
    }, [query]);
    useEffect(() => () => { turn.current = -1; }, []);
    const has = note => chosen.some(item => item.path === note.path);
    const toggle = note => {
      if (has(note)) return setChosen(chosen.filter(item => item.path !== note.path));
      if (chosen.length >= askLimits.notes) return notify?.(`一次最多带 ${askLimits.notes} 篇笔记`, { kind: 'error' });
      setChosen([...chosen, { path: note.path, title: note.title }]);
    };
    // 已经勾上、但这次没搜出来的也列着，免得看不到自己带了什么。
    const rows = [...chosen.filter(item => !(list ?? []).some(note => note.path === item.path)), ...(list ?? [])];
    const row = note => h('li', { key: note.path, role: 'option', 'aria-selected': has(note) }, h('button', { type: 'button', onClick: () => toggle(note) },
      h('i', { className: 'ww-pick-mark', 'aria-hidden': true }, has(note) && h(Glyph, { name: 'check', size: 12 })),
      h('span', null, note.title), h('small', null, note.path.includes('/') ? note.path.slice(0, note.path.lastIndexOf('/')) : '')));
    return h(Modal, { title: '带上哪几篇笔记', onClose, className: 'ww-switcher ww-ai-notes' },
      h('label', { className: 'ww-search ww-switcher-input' }, h(Glyph, { name: 'findfile', size: 16 }),
        h('input', { value: query, autoFocus: true, placeholder: '搜笔记名字或内容', 'aria-label': '搜笔记', spellCheck: false, autoComplete: 'off', onChange: event => setQuery(event.target.value) })),
      h('ul', { role: 'listbox', 'aria-multiselectable': true, 'aria-label': '笔记', className: 'ww-switcher-list' },
        list === null ? h('li', { className: 'ww-switcher-empty' }, h('span', { className: 'ww-spinner', role: 'status', 'aria-label': '正在读笔记' }))
          : rows.length ? rows.map(row) : h('li', { className: 'ww-switcher-empty', role: 'status' }, query.trim() ? '没搜到，换个词试试' : '知识积累里还没有笔记')),
      h('footer', { className: 'ww-dialog-actions' }, h('span', { className: 'ww-switcher-foot' }, `已选 ${chosen.length} 篇，最多 ${askLimits.notes} 篇；带出去的是正文，不带属性`),
        h('button', { type: 'button', onClick: onClose }, '取消'), h('button', { type: 'button', className: 'ww-primary', onClick: () => onDone(chosen) }, '选好了')));
  }
  // 工具栏是当前工作台的只读投影，不取得会话、登录或导航的第二 owner。
  let toolbar = null;
  const listeners = new Set();
  const publish = value => { toolbar = value; for (const listener of listeners) listener(); };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const snapshot = () => toolbar;
  const select = (selected, busy, onSelect, catalog = aiWebEntries) => h('select', {
    'aria-label': '切换 AI 厂商', value: selected, disabled: busy,
    onChange: event => { const entry = catalog.find(item => item.id === event.target.value); if (entry) return onSelect(entry); },
    style: { width: 'auto', maxWidth: '20ch', minWidth: 0, height: 28, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)', border: '.5px solid var(--dsw-alias-border-l2)', borderRadius: 'var(--dsw-radius-sm)', font: 'var(--dsw-font-xxs-12)' },
  }, h('option', { value: '', disabled: true }, '选择 AI'), ...catalog.map(entry => h('option', { key: entry.id, value: entry.id }, entry.name)));
  function Toolbar({ sessionId, active: tabActive = true }) {
    const value = useSyncExternalStore(subscribe, snapshot, snapshot);
    if (!value?.active || !tabActive || value.sessionId !== sessionId) return null;
    const style = { height: 28, color: 'var(--dsw-alias-label-secondary)', background: 'transparent', border: 0, borderRadius: 'var(--dsw-radius-sm)', whiteSpace: 'nowrap', font: 'var(--dsw-font-xxs-12)' };
    return h('div', { 'aria-label': 'AI 网页快捷入口', style: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 } },
      select(value.selected, value.busy, value.open, value.catalog),
      value.busy && h('button', { type: 'button', style, onClick: value.cancel, 'aria-label': '取消打开' }, '取消'),
      h('button', { type: 'button', style, onClick: value.back }, '返回工作台'),
      value.failure && h('button', { type: 'button', style, title: value.failure.message, onClick: value.back, 'aria-label': '打开失败，返回工作台重试' }, '打开失败'));
  }
  /** remembered：原版 DSH 上本机记下的正在用的入口 id（空串表示没有）；宿主适配版不传，由页面自己记着。 */
  /**
   * ask：提问台用的那组动作（读《关于我》和笔记、发出去、常用问法）；不传就没有提问台，页面和原来一样只是入口。
   */
  function AiWebView({ active = true, sessionId, openBrowser, focusBrowser, restoreBrowser, manageAiWeb, notify, ActionMenu, remembered, ask }) {
    const [query, setQuery] = useState('');
    // 提问台：问题、带上什么、发给谁。回到页签时把上一问填回来，方便改了再发。
    const last = useRef(undefined);
    if (last.current === undefined) last.current = ask?.currentAsk() ?? null;
    const [scene, setScene] = useState('');
    const [question, setQuestion] = useState(last.current?.question ?? '');
    const [lineup, setLineup] = useState(last.current?.entries ?? []);
    const [withBackground, setWithBackground] = useState(Boolean(last.current?.background));
    const [notes, setNotes] = useState(last.current?.notes ?? []);
    const [saved, setSaved] = useState(() => ask?.savedAsks() ?? []);
    const [sending, setSending] = useState(false), [dialog, setDialog] = useState(null);
    const [failure, setFailureValue] = useState(null);
    const setFailure = value => {
      const next = typeof value === 'function' ? value(failure) : value;
      setFailureValue(next);
      if (next && next !== failure) notify?.(`${next.entry?.name ?? 'DSH 浏览器'}：${next.message}`, { kind: 'error', action: { label: '重试打开', run: () => prepare(next.entry, next.resumeOnly) } });
    };
    const [opened, setOpened] = useState('');
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState(remembered ?? '');
    const [catalog, setCatalog] = useState(aiWebEntries), [loading, setLoading] = useState(false), [editor, setEditor] = useState(null);
    // 原版打开 AI 后工作台会卸载，回来时按记下的入口标“正在用”；记下的会话不在了就清掉。入口删了由目录读回清掉。
    useEffect(() => { if (remembered !== undefined) setSelected(remembered); }, [remembered]);
    // 失败只在右上角提示，并给出重试；不在卡片上方插入整行把卡片往下挤。
    const setCatalogError = message => { if (message) notify?.(message, { kind: 'error', action: { label: '刷新入口', run: () => refresh() } }); };
    const loadingRequest = useRef(null), catalogCurrent = useRef(aiWebEntries);
    const pending = useRef(null), live = useRef(active);
    live.current = active;
    const back = () => { if (live.current) { pending.current?.abort(new Error('已返回工作台')); restoreBrowser?.(); } };
    const cancel = () => { pending.current?.abort(new Error('员工取消打开')); setBusy(false); };
    useEffect(() => {
      live.current = active;
      if (!active) { pending.current?.abort(new Error('已离开 AI 网页')); setBusy(false); }
      return () => { live.current = false; pending.current?.abort(new Error('AI 网页已关闭或切换')); };
    }, [active]);
    const acceptCatalog = entries => {
      catalogCurrent.current = entries;
      setCatalog(entries);
      setSelected(current => entries.some(entry => entry.id === current) ? current : '');
      setFailure(current => current?.entry && !entries.some(entry => entry.id === current.entry.id) ? null : current);
      setOpened('');
      setCatalogError('');
    };
    const acceptSaved = entries => {
      // 写后权威读回替代更早发出的列表；即使取消未被传输层执行，旧请求也失去接纳权。
      loadingRequest.current?.abort();
      loadingRequest.current = null;
      setLoading(false);
      acceptCatalog(entries);
    };
    const refresh = async () => {
      if (!live.current || !manageAiWeb) return;
      loadingRequest.current?.abort();
      const controller = new AbortController(); loadingRequest.current = controller; setLoading(true);
      try { const value = await manageAiWeb({ action: 'list' }, controller.signal); if (live.current && loadingRequest.current === controller && !controller.signal.aborted) acceptCatalog(value.entries); }
      catch (reason) { if (live.current && loadingRequest.current === controller && !controller.signal.aborted) setCatalogError(reason.message); }
      finally { if (loadingRequest.current === controller && live.current) setLoading(false); }
    };
    useEffect(() => { if (active) void refresh(); return () => loadingRequest.current?.abort(); }, [active, manageAiWeb]);
    const entries = findAiWebEntries(query, catalog);
    // 打开与继续共用一次准备动作，取消沿同一 signal 进入 Workbench 的有界挂载门。
    const prepare = async (entry, resumeOnly = false) => {
      if (!live.current || pending.current) return;
      // 旧按钮闭包不授予已删除目录项导航权；清理选择而不关闭宿主持有的网页标签。
      entry = catalogCurrent.current.find(current => current.id === entry?.id);
      if (!entry) { setSelected(''); setOpened(''); setFailure(null); setCatalogError('此 AI 入口已不存在，请重新选择'); return; }
      const controller = new AbortController();
      pending.current = controller;
      setBusy(true);
      setFailure(null);
      try {
        if (resumeOnly) {
          if (typeof focusBrowser !== 'function') throw new Error('DSH 浏览器尚未就绪，请稍后重试');
          await focusBrowser(controller.signal, entry);
        } else await openAiWebsite(entry.id, openBrowser, controller.signal, catalog);
        if (!live.current || controller.signal.aborted) return;
        if (!resumeOnly && catalogCurrent.current.some(current => current.id === entry.id)) {
          setSelected(entry.id);
          setOpened(`已请求在 DSH 浏览器中打开 ${entry.name}`);
        }
      } catch (error) {
        if (!live.current || controller.signal.aborted) return;
        setFailure({ entry, resumeOnly, message: error instanceof Error ? error.message : '打开未完成，请检查 DSH 浏览器后重试' });
      } finally {
        if (pending.current === controller) pending.current = null;
        if (live.current) setBusy(false);
      }
    };
    const open = entry => prepare(entry);
    useEffect(() => {
      publish(active && sessionId ? { active, sessionId, selected, busy, failure, open, cancel, back, catalog } : null);
    });
    useEffect(() => () => publish(null), []);
    const resume = () => {
      if (!live.current || !selected) return;
      return prepare(catalog.find(entry => entry.id === selected), true);
    };
    const entryMenu = entry => ActionMenu ? h(ActionMenu, { label: `${entry.name} · 入口操作`, iconOnly: true },
      h('button', { type: 'button', onClick: () => setEditor({ entry }), disabled: !active || !manageAiWeb }, '编辑'),
      h('button', { type: 'button', onClick: () => setEditor({ entry, removing: true }), disabled: !active || !manageAiWeb }, '删除'))
      : h('div', { className: 'ww-row' }, h('button', { type: 'button', onClick: () => setEditor({ entry }), disabled: !active || !manageAiWeb, 'aria-label': `编辑 ${entry.name}` }, '编辑'), h('button', { type: 'button', onClick: () => setEditor({ entry, removing: true }), disabled: !active || !manageAiWeb, 'aria-label': `删除 ${entry.name}` }, '删除'));
    const status = busy && h('span', { className: 'ww-ai-status', role: 'status' }, h('span', { className: 'ww-spinner', 'aria-hidden': true }), '正在打开', h('button', { type: 'button', onClick: cancel }, '取消打开'));
    // 打开过一个 AI 再回来，入口照常列着，正在用的那个标出来，不再只剩一行工具条。
    const current = selected && catalog.find(entry => entry.id === selected);
    // —— 提问台（2026-11-13）：问题写一次，带上背景和笔记，放进剪贴板，再依次打开几家；粘贴和发送由员工在网页里自己按。——
    const lineupEntries = lineup.map(id => catalog.find(entry => entry.id === id)).filter(Boolean);
    const pick = entry => {
      if (lineup.includes(entry.id)) return setLineup(lineup.filter(id => id !== entry.id));
      if (lineupEntries.length >= askLimits.entries) return notify?.(`一次最多发给 ${askLimits.entries} 家`, { kind: 'error' });
      setLineup([...lineupEntries.map(item => item.id), entry.id]);
    };
    // 两种卡片：选了场景是大卡（头像、名字、称号、这件事上的拿手戏）；“全部”是名录里的小块（只有头像和名字，拿手戏放在悬停说明里），
    // 入口再多也不把页面拉长（2026-11-13 用户反馈“全部”把所有卡片铺开，页面被拉得很长）。
    const tile = entry => {
      const guide = guideOf(entry), picked = lineup.includes(entry.id), mini = !scene;
      // 选了场景时，卡片上那句话换成它在这件事上的拿手戏。
      const line = (scene && guide?.scenes?.[scene]) || guide?.line || entry.description;
      const who = worldPersonas[guide?.persona]?.title || entry.provider || '自定义';
      const hint = mini && entry.builtin ? [who, line].filter(Boolean).join(' · ') : [entry.provider, entry.description].filter(Boolean).join(' · ');
      return h('article', { key: entry.id, className: `ww-ai-tile${mini ? ' ww-ai-mini' : ''}${entry.id === selected ? ' ww-ai-current' : ''}${picked ? ' ww-ai-picked' : ''}` },
        h('button', { type: 'button', className: 'ww-ai-open', disabled: busy || sending || !active, onClick: () => open(entry), 'aria-label': `打开 ${entry.name}`, title: hint || undefined },
          avatar(entry), h('span', { className: 'ww-ai-name' }, h('strong', null, entry.name), (!mini || entry.id === selected) && h('small', null, entry.id === selected ? '正在用' : who))),
        !mini && line && h('p', { className: 'ww-ai-line' }, line),
        h('div', { className: 'ww-ai-ops' },
          ask && h('button', { type: 'button', className: 'ww-ai-pick', 'aria-pressed': picked, disabled: sending || !active, onClick: () => pick(entry), title: picked ? '不发给它' : '加进提问台', 'aria-label': `${picked ? '从提问台去掉' : '加进提问台'} ${entry.name}` }, picked ? '✓' : '+'),
          !entry.builtin && entryMenu(entry)),
        // 大卡底边一道水纹，和专家卡同一种点缀（2026-11-02 补齐设计稿）；名录里的小块太小，不加点缀。
        !mini && h('i', { className: 'ww-orn-wave', 'aria-hidden': true }));
    };
    // 添加入口与“添加专家”同一种加号卡片，放在“我的入口”末尾；搜索时收起。
    const addCard = !query.trim() && h('button', { type: 'button', className: 'ww-card ww-add-card', disabled: !active || !manageAiWeb || loading, onClick: () => setEditor({ entry: null }), 'aria-haspopup': 'dialog' }, h('span', { className: 'ww-add-mark', 'aria-hidden': true }, '+'), h('h2', null, '添加 AI'));
    // 想做什么：选一个场景，只列拿手这件事的入口。
    const sceneLabel = scene && aiWebScenes.find(([id]) => id === scene)[1];
    // 只列目录里真有入口写了的场景，免得点进去是空的。
    const liveScenes = aiWebScenes.filter(([id]) => catalog.some(entry => guideOf(entry)?.scenes?.[id]));
    const sceneRow = liveScenes.length > 0 && h('div', { className: 'ww-ai-scenes', role: 'group', 'aria-label': '想做什么' }, h('span', { className: 'ww-ai-label' }, '想做什么'),
      ...[['', '全部'], ...liveScenes].map(([id, label]) => h('button', { key: id || 'all', type: 'button', className: 'ww-chip', 'aria-pressed': scene === id, disabled: !active, onClick: () => setScene(id) }, label)));
    const fits = scene ? entries.filter(entry => guideOf(entry)?.scenes?.[scene]) : [];
    const groups = scene ? [h('section', { key: 'scene', className: 'ww-ai-group', 'aria-label': `拿手${sceneLabel}的` },
      h('p', { className: 'ww-ai-group-label' }, `拿手「${sceneLabel}」的 ${fits.length} 家`, h('i', { className: 'ww-cloud', 'aria-hidden': true })),
      fits.length ? h('div', { className: 'ww-ai-grid' }, ...fits.map(tile)) : h('p', { className: 'ww-muted', role: 'status' }, '没有对得上的入口，换个场景或清空查找'))]
      : [['cn', '聊天 · 国内'], ['global', '聊天 · 海外，需海外网络'], ['tool', '专门的工具'], ['tool-global', '专门的工具 · 海外，需海外网络'], ['mine', '我的入口']].map(([group, label]) => {
        const list = entries.filter(entry => aiWebGroup(entry) === group), add = group === 'mine' && addCard;
        const [main, note] = label.split('，');
        return (list.length > 0 || add) && h('section', { key: group, className: 'ww-ai-group', 'aria-label': label },
          h('p', { className: 'ww-ai-group-label' }, main, note && h('small', null, note)),
          h('div', { className: 'ww-ai-grid' }, ...list.map(tile), add));
      });
    const buildText = async () => composeAiAsk({ question, background: withBackground ? await ask.loadBackground() : '', notes: notes.length ? await ask.loadNotes(notes.map(note => note.path)) : [] });
    const ready = () => {
      if (!question.trim()) { notify?.('先写下想问的', { kind: 'error' }); return false; }
      if (!lineupEntries.length) { notify?.('先选发给谁：点下面卡片右上角的“+”', { kind: 'error' }); return false; }
      return true;
    };
    const send = async prepared => {
      if (sending || busy || !ready()) return;
      setSending(true);
      try {
        const text = typeof prepared === 'string' ? prepared : await buildText();
        if (!live.current) return;
        setDialog(null);
        await ask.send({ entries: lineupEntries, question: question.trim(), text, background: withBackground, notes });
        if (live.current) setSelected(lineupEntries[0].id);
      } catch (error) { if (live.current) notify?.(error.message, { kind: 'error' }); }
      finally { if (live.current) setSending(false); }
    };
    const preview = async () => {
      if (sending || !ready()) return;
      setSending(true);
      try { const text = await buildText(); if (live.current) setDialog({ kind: 'preview', text }); }
      catch (error) { if (live.current) notify?.(error.message, { kind: 'error' }); }
      finally { if (live.current) setSending(false); }
    };
    // 常用问法：把现在的问题、带上什么、发给谁存成一条，下次一点套用。只记在本机。
    const keepAsk = () => {
      if (!ready()) return;
      const name = (question.split(/\r?\n/).map(line => line.trim()).find(Boolean) || '').slice(0, 12);
      const next = [...saved.filter(item => item.name !== name), { name, question: question.trim(), entries: lineupEntries.map(entry => entry.id), background: withBackground, notes }];
      if (!ask.saveAsks(next)) return notify?.('没存上：这台电脑的本机存储写不进去', { kind: 'error' });
      setSaved(next); notify?.(`已存成常用问法“${name}”`);
    };
    const useAsk = item => {
      setQuestion(item.question || ''); setLineup((item.entries ?? []).filter(id => catalog.some(entry => entry.id === id)));
      setWithBackground(Boolean(item.background)); setNotes(item.notes ?? []); notify?.(`已套用“${item.name}”`);
    };
    const dropAsk = name => { const next = saved.filter(item => item.name !== name); ask.saveAsks(next); setSaved(next); setDialog(null); notify?.(`已删除常用问法“${name}”`); };
    const carried = withBackground || notes.length > 0, idle = sending || !active;
    const desk = ask && h('section', { className: 'ww-ai-desk', 'aria-label': '提问台' },
      h('div', { className: 'ww-ai-desk-top' }, h('h3', null, '提问台'), h('span', null, '问题写一次，带着你的背景，发给几家'), h('i', { className: 'ww-cloud', 'aria-hidden': true })),
      h('textarea', { value: question, rows: 2, disabled: idle, placeholder: '想问什么？写在这里，Ctrl Enter 发出去', 'aria-label': '想问什么', onChange: event => setQuestion(event.target.value),
        onKeyDown: event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send(); } } }),
      h('div', { className: 'ww-ai-desk-row' }, h('span', { className: 'ww-ai-label' }, '带上'),
        h('button', { type: 'button', className: 'ww-chip ww-ai-tick', 'aria-pressed': withBackground, disabled: idle, title: '知识积累里的《关于我》', onClick: () => setWithBackground(!withBackground) }, '我的背景'),
        h('button', { type: 'button', className: 'ww-chip ww-ai-tick', 'aria-pressed': notes.length > 0, disabled: idle, 'aria-haspopup': 'dialog', onClick: () => setDialog({ kind: 'notes' }) }, notes.length ? `笔记 · ${notes.length} 篇` : '笔记')),
      h('div', { className: 'ww-ai-desk-row' }, h('span', { className: 'ww-ai-label' }, '发给'),
        lineupEntries.length ? lineupEntries.map(entry => h('span', { key: entry.id, className: 'ww-ai-to' }, entry.name, h('button', { type: 'button', disabled: idle, onClick: () => pick(entry), 'aria-label': `不发给 ${entry.name}` }, '×')))
          : h('span', { className: 'ww-muted' }, '还没选。点下面卡片右上角的“+”'),
        h('span', { className: 'ww-ai-grow' }),
        h('button', { type: 'button', className: 'ww-ai-link', disabled: idle, 'aria-haspopup': 'dialog', onClick: preview }, '看一眼要发的内容'),
        h('button', { type: 'button', className: 'ww-primary', disabled: idle || busy || !lineupEntries.length, onClick: () => send() }, sending ? '正在准备…' : lineupEntries.length ? `发给 ${lineupEntries.length} 家` : '发给…')),
      h('div', { className: 'ww-ai-desk-foot' }, h('span', { className: 'ww-ai-label' }, '常用问法'),
        ...saved.map(item => h('span', { key: item.name, className: 'ww-ai-saved' },
          h('button', { type: 'button', disabled: idle, onClick: () => useAsk(item), title: item.question }, item.name),
          h('button', { type: 'button', disabled: idle, onClick: () => setDialog({ kind: 'drop', name: item.name }), 'aria-label': `删除常用问法 ${item.name}` }, '×'))),
        h('button', { type: 'button', className: 'ww-chip ww-ai-keep', disabled: idle, onClick: keepAsk }, '+ 把这一问存成常用')),
      h('p', { className: 'ww-ai-desk-safe' }, carried ? '带了背景或笔记：内容只放进剪贴板，不放进网址。发之前可以先看一眼。' : '问题放进剪贴板，进去按 Ctrl V，再按发送。'));
    const dialogs = active && ask && dialog && (dialog.kind === 'notes' ? h(NotePicker, { ask, picked: notes, notify, onClose: () => setDialog(null), onDone: value => { setNotes(value); setDialog(null); } })
      : dialog.kind === 'preview' ? h(Modal, { title: '发之前看一眼', busy: sending, onClose: () => setDialog(null), className: 'ww-ai-preview' }, h('div', { className: 'ww-ai-preview-body' },
        h('p', { className: 'ww-muted' }, `下面是要带过去的全部内容，共 ${dialog.text.length} 个字。${carried ? '里面有你的背景或笔记，只放进剪贴板，不放进网址。' : ''}`),
        h('pre', { className: 'ww-ai-payload', tabIndex: 0 }, dialog.text),
        h('p', { className: 'ww-muted' }, `发给：${lineupEntries.map(entry => entry.name).join('、')}。放进剪贴板后依次打开，进去按 Ctrl V，再按发送。`),
        h('footer', { className: 'ww-dialog-actions' }, h('button', { type: 'button', disabled: sending, onClick: () => setDialog(null) }, '取消'),
          h('button', { type: 'button', className: 'ww-primary', disabled: sending, onClick: () => send(dialog.text) }, sending ? '正在准备…' : `复制并打开 ${lineupEntries.length} 家`))))
        : h(ConfirmDialog, { title: '删除常用问法', message: `确认删除“${dialog.name}”？只删这条常用问法，已经存的笔记不动。`, confirmLabel: '确认删除', cancelLabel: '取消', danger: true, onCancel: () => setDialog(null), onConfirm: () => dropAsk(dialog.name) }));
    return h('section', { hidden: !active, 'aria-label': 'AI 网页', className: 'ww-ai-web' },
      h('header', { className: 'ww-pagehead' }, h('div', null, h('h2', null, 'AI 网页'), h('p', null, current ? `正在用 ${current.name} · 登录和额度由各家决定，鲸翼不读 Cookie` : `${catalog.length} 个入口 · 登录和额度由各家决定，鲸翼不读 Cookie`)),
        h('div', { className: 'ww-pagehead-actions' }, status,
          h('label', { className: 'ww-ai-search' }, h('span', null, '查找 AI'), h('input', { type: 'search', value: query, placeholder: '名字、厂商或拿手戏', onChange: event => setQuery(event.target.value) })),
          current && h('button', { type: 'button', className: 'ww-primary', disabled: busy || !active, onClick: resume }, '继续使用'))),
      desk, sceneRow,
      // 名录和选了场景后的大卡都放进一块，在这块里滚，页面本身一屏放得下。
      scene ? h('div', { className: 'ww-ai-body' }, ...groups) : h('div', { className: 'ww-ai-dir' }, ...groups),
      !scene && query.trim() && !entries.length && h('p', { className: 'ww-muted', role: 'status' }, '没有匹配的 AI 入口，换个关键词试试'),
      dialogs,
      active && editor && h(Editor, { key: editor.entry?.id ?? 'new', ...editor, manageAiWeb, notify, onSaved: acceptSaved, onClose: () => setEditor(null) }));
  }
  AiWebView.Toolbar = Toolbar;
  return AiWebView;
}
