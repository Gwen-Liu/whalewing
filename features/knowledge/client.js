import { createGraphCanvas, graphKindColors } from '../../src/graph-canvas.js';
import { buildGraphView, graphColors, normalizeGraphSettings, defaultGraphSettings } from '../../src/graph-view.js';
import { createGraphSettings } from './graph-settings.js';
import { createKnowledgePanes } from './panes.js';
import { registerEntries } from './entries.js';
import { knowledgeContract } from './contract.js';
import { registerFeature } from '../../src/shell/feature.js';
import { createMarkdown } from '../../src/shell/markdown.js';
import { useFeature } from '../../src/shell/feature.js';

/** 检查弹窗里的文风结果：几篇用了规则里不推荐的词，各是哪些（最多列十篇）。 */
function styleLines(h, validation, t) {
  const style = validation.style;
  if (!style?.words) return [];
  if (!style.total) return [h('p', { key: 'style' }, t('styleClean'))];
  return [h('p', { key: 'style' }, t('styleFlagged', { count: style.total })),
    ...style.notes.slice(0, 10).map(note => h('p', { key: `style-${note.path}`, className: 'ww-muted' }, `${note.path}：${Object.entries(note.words).map(([word, count]) => `${word}×${count}`).join('、')}`))];
}

/**
 * 知识页签怎么摆（2026-11-11）：每个页签记着自己在看什么（关系图谱、一篇笔记或空白）和自己的前进后退。
 * 在笔记页签或空白页签里打开笔记就在原处换（旧的记进“后退”），在关系图谱里点开的笔记另开页签（已经开着就切过去），
 * Ctrl 点击总是另开页签。
 */
function placeNote(state, target, how, from) {
  const current = state.list.find(tab => tab.id === state.active);
  const update = (id, change) => ({ ...state, active: id, list: state.list.map(tab => tab.id === id ? { ...tab, ...change } : tab) });
  if (how.tab) return update(how.tab, { kind: 'note', path: target });
  if (how.back) return update(current.id, { kind: 'note', path: target, back: current.back.slice(0, -1), fwd: from ? [...current.fwd, from] : current.fwd });
  if (how.forward) return update(current.id, { kind: 'note', path: target, fwd: current.fwd.slice(0, -1), back: from ? [...current.back, from] : current.back });
  if (!how.newTab && current && current.kind !== 'graph') {
    if (current.kind === 'note' && current.path === target) return state;
    return update(current.id, { kind: 'note', path: target, back: from ? [...current.back, from] : current.back, fwd: [] });
  }
  const existing = !how.newTab && state.list.find(tab => tab.kind === 'note' && tab.path === target);
  if (existing) return { ...state, active: existing.id };
  return addTab(state, 'note', { path: target });
}
function addTab(state, kind, extra = {}) {
  const id = state.seq + 1, at = state.list.findIndex(tab => tab.id === state.active) + 1;
  return { list: [...state.list.slice(0, at), { id, kind, back: [], fwd: [], ...extra }, ...state.list.slice(at)], active: id, seq: id };
}
const setActiveTab = (state, change) => ({ ...state, list: state.list.map(tab => tab.id === state.active ? { ...tab, ...change } : tab) });
// 状态栏的字数：去掉开头的属性区和所有空白，中文一个字算一个。
const bodyChars = text => text.replace(/\r\n/g, '\n').replace(/^﻿?---\n[\s\S]*?\n---(?:\n|$)/, '').replace(/\s+/g, '').length;

/** 本页持有自己的草稿、动作和恢复状态；切走时不把状态交给外壳。 */
export function createView(kit) {
  const { React, Glyph, ActionMenu, Modal, ConfirmDialog, Drawer } = kit;
  // 扩展登记的来源名是 { zh, en }；取不到语言服务时用中文。
  const labelText = label => kit.resolveText ? kit.resolveText(label) : label.zh;
  const GraphCanvas = createGraphCanvas(React);
  const GraphSettings = createGraphSettings(kit);
  const { SidePanel, QuickSwitcher, EmptyTab } = createKnowledgePanes(kit);
  // 图谱设置记在本机（每位员工自己的偏好），读不到或被改坏就按默认。
  const graphSettingsKey = 'whalewing.graphSettings.v1';
  const loadGraphSettings = () => { try { return normalizeGraphSettings(JSON.parse(window.localStorage.getItem(graphSettingsKey) || 'null')); } catch { return normalizeGraphSettings(null); } };
  const saveGraphSettings = value => { try { window.localStorage.setItem(graphSettingsKey, JSON.stringify(value)); } catch { /* 存不下就只在这次打开里有效。 */ } };
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } = React;
  const noSubscribe = () => () => {}, noFrame = () => null;
  // 扩展的知识空间一次给全笔记清单，按路径里的文件夹排成目录；路径是 `@功能id/空间id/…`。
  const spaceTree = (notes, prefix) => {
    const root = { folders: new Map(), notes: [] };
    for (const item of notes) {
      const parts = item.path.slice(prefix.length).split('/');
      let node = root, key = '';
      for (const name of parts.slice(0, -1)) {
        key = key ? `${key}/${name}` : name;
        if (!node.folders.has(name)) node.folders.set(name, { name, key, folders: new Map(), notes: [] });
        node = node.folders.get(name);
      }
      node.notes.push(item);
    }
    return root;
  };
  const plainText = node => node.value ?? (node.children || []).map(plainText).join('');
  // 目录取正文各级标题；行号和阅读区元素上的 data-note-line 对得上，点了就滚过去。
  const outlineOf = view => {
    const items = [];
    const walk = node => {
      if (!node) return;
      if (node.type === 'heading') { const text = plainText(node).trim(); if (text) items.push({ level: node.level || 1, line: node.line, text }); return; }
      node.children?.forEach(walk);
    };
    walk(view);
    return items;
  };
  // Ctrl（苹果上是 Command）点击、鼠标中键都是另开页签。
  const newTabClick = event => Boolean(event?.ctrlKey || event?.metaKey);

  /** 目录分页只持有可重建列表；打开笔记仍从知识服务读取正文。 */
  function Directory({ api, t, directory = '', selected, disabled, onSelect, selectedPaths, onToggle, version = 0 }) {
    const [listing, setListing] = useState(null);
    const [expanded, setExpanded] = useState([]);
    const [error, setError] = useState('');
    const [offset, setOffset] = useState(0);
    const [retry, setRetry] = useState(0);
    const [loading, setLoading] = useState(true);
    const pages = useRef([]);
    useEffect(() => {
      const controller = new AbortController();
      let live = true;
      setLoading(true);
      api.knowledge({ action: 'browse', directory, offset }, controller.signal).then(value => { if (live) { setListing(value); setError(''); setLoading(false); } }, reason => { if (live) { setError(reason.message); setLoading(false); } });
      return () => { live = false; controller.abort(); };
    }, [directory, offset, version, retry]);
    // Host 在同一目录下统一分页文件夹与笔记，偏移不能仅计数文件。
    const pageSize = (listing?.folders.length || 0) + (listing?.notes.length || 0);
    return h('div', { className: 'ww-directory', role: 'group', 'aria-label': directory || t('allNotes') },
      error && h('div', { role: 'alert' }, error, h('button', { type: 'button', onClick: () => setRetry(value => value + 1) }, t('directoryRetry'))),
      !listing && !error && h('span', { className: 'ww-spinner', role: 'status', 'aria-label': t('directoryLoading') }),
      ...(listing?.folders || []).map(folder => h('div', { key: folder.path }, h('button', { type: 'button', className: 'ww-folder', title: folder.name, 'aria-expanded': expanded.includes(folder.path), onClick: () => setExpanded(value => value.includes(folder.path) ? value.filter(path => path !== folder.path) : [...value, folder.path]) }, h('span', { className: expanded.includes(folder.path) ? 'ww-folder-chevron ww-expanded' : 'ww-folder-chevron' }, h(Glyph, { name: 'chevron', size: 12 })), h(Glyph, { name: 'folder', size: 15 }), h('span', { className: 'ww-tree-title' }, folder.name)),
        expanded.includes(folder.path) && h(Directory, { api, t, directory: folder.path, selected, disabled, onSelect, selectedPaths, onToggle, version }))),
      ...(listing?.notes || []).map(item => h('div', { key: item.path, className: 'ww-note-row' }, h('input', { type: 'checkbox', checked: selectedPaths.includes(item.path), 'aria-label': t('selectForQuestion', { name: item.title }), disabled: disabled || (!selectedPaths.includes(item.path) && selectedPaths.length >= 12), onChange: event => onToggle(item.path, event.target.checked) }), h('button', { type: 'button', className: `ww-note ${selected === item.path ? 'ww-selected' : ''}`, disabled, onClick: event => onSelect(item, { newTab: newTabClick(event) }), onAuxClick: event => { if (event.button === 1) onSelect(item, { newTab: true }); }, title: `${item.title}\n${item.path}` }, h(Glyph, { name: 'file', size: 14 }), h('span', { className: 'ww-tree-title' }, item.title)))),
      listing && (offset > 0 || listing.total > pageSize) && h('div', { className: 'ww-row' }, h('button', { type: 'button', disabled: disabled || loading || Boolean(error) || offset !== listing.offset || offset === 0, onClick: () => setOffset(pages.current.pop() || 0) }, t('previous')), h('button', { type: 'button', disabled: disabled || loading || Boolean(error) || offset !== listing.offset || !listing.truncated || pageSize === 0, onClick: () => { pages.current.push(listing.offset); setOffset(listing.offset + pageSize); } }, t('next'))));
  }

  /** 团队的一个知识空间：和自己的目录一样能展开文件夹、勾选后问小鲸。 */
  function SpaceTree({ space, prefix, t, selected, disabled, onSelect, selectedPaths, onToggle }) {
    const [expanded, setExpanded] = useState([]);
    const root = useMemo(() => spaceTree(space.notes, prefix), [space.notes, prefix]);
    const toggle = key => setExpanded(value => value.includes(key) ? value.filter(item => item !== key) : [...value, key]);
    const render = node => [
      ...[...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh')).map(folder => h('div', { key: folder.key },
        h('button', { type: 'button', className: 'ww-folder', title: folder.name, 'aria-expanded': expanded.includes(folder.key), onClick: () => toggle(folder.key) }, h('span', { className: expanded.includes(folder.key) ? 'ww-folder-chevron ww-expanded' : 'ww-folder-chevron' }, h(Glyph, { name: 'chevron', size: 12 })), h(Glyph, { name: 'folder', size: 15 }), h('span', { className: 'ww-tree-title' }, folder.name)),
        expanded.includes(folder.key) && h('div', { className: 'ww-directory', role: 'group', 'aria-label': folder.name }, ...render(folder)))),
      ...[...node.notes].sort((a, b) => a.title.localeCompare(b.title, 'zh')).map(item => h('div', { key: item.path, className: 'ww-note-row' },
        h('input', { type: 'checkbox', checked: selectedPaths.includes(item.path), 'aria-label': t('selectForQuestion', { name: item.title }), disabled: disabled || (!selectedPaths.includes(item.path) && selectedPaths.length >= 12), onChange: event => onToggle(item.path, event.target.checked) }),
        h('button', { type: 'button', className: `ww-note ${selected === item.path ? 'ww-selected' : ''}`, disabled, onClick: event => onSelect(item, { newTab: newTabClick(event) }), onAuxClick: event => { if (event.button === 1) onSelect(item, { newTab: true }); }, title: item.title }, h(Glyph, { name: 'file', size: 14 }), h('span', { className: 'ww-tree-title' }, item.title)))),
    ];
    return h('div', { className: 'ww-directory', role: 'group', 'aria-label': space.name }, ...(space.notes.length ? render(root) : [h('p', { key: 'empty', className: 'ww-muted ww-space-empty' }, t('spaceEmpty'))]));
  }

  /** 把自己的一篇笔记交给团队：选知识空间、放到哪里；只发这一篇，个人知识库不动。 */
  function SubmitDrawer({ note, libraries, busy, t, onClose, onSubmit }) {
    const options = libraries.filter(library => library.submit).flatMap(library => library.spaces.map(space => ({ library, space, value: `${library.id}\n${space.id}` })));
    const [choice, setChoice] = useState(options[0]?.value || '');
    const [target, setTarget] = useState(note.path.split('/').at(-1));
    const picked = options.find(option => option.value === choice);
    const valid = Boolean(picked) && /^[^\\/]+(\/[^\\/]+)*\.md$/i.test(target.trim()) && !target.split('/').some(part => part === '.' || part === '..');
    // 下拉按“来源 · 分组”归成几组，顺序照扩展给的（离自己近的在前）。
    const groups = [];
    for (const option of options) {
      const name = [labelText(option.library.label), option.space.group].filter(Boolean).join(' · ');
      const last = groups.at(-1);
      if (last?.name === name) last.options.push(option); else groups.push({ name, options: [option] });
    }
    return h(Drawer, { title: t('submitTitle'), busy, onClose, footer: [h('button', { type: 'button', key: 'cancel', disabled: busy, onClick: onClose }, t('cancel')), h('button', { type: 'button', key: 'ok', className: 'ww-primary', disabled: busy || !valid, onClick: () => onSubmit({ source: picked.library.id, space: picked.space.id, target: target.trim() }) }, t('submitConfirm'))] },
      h('div', { className: 'ww-submit-note' }, h('strong', null, note.path.split('/').at(-1).replace(/\.md$/i, '')), h('span', { className: 'ww-muted' }, note.path)),
      h('label', { className: 'ww-field' }, t('submitSpace'), h('select', { value: choice, disabled: busy, onChange: event => setChoice(event.target.value) }, ...groups.map(group => h('optgroup', { key: group.name, label: group.name }, ...group.options.map(option => h('option', { key: option.value, value: option.value }, option.space.note ? `${option.space.name}（${option.space.note}）` : option.space.name)))))),
      h('label', { className: 'ww-field' }, t('submitTarget'), h('input', { value: target, disabled: busy, onChange: event => setTarget(event.target.value), spellCheck: false })),
      h('p', { className: 'ww-muted' }, t('submitHelp')));
  }

  // 目录默认占可用宽度约四分之一，夹在 160 到 300 之间；拖过或用方向键调过以后按员工定的宽度走。
  // 可用宽度是整块知识区减去左侧功能条和停靠着的右栏（reserveOf 按整块宽度算）。
  const preferredDirectoryWidth = size => Math.round(Math.max(160, Math.min(size * 0.244, 300)));
  function useDirectorySplit(active, reserveOf) {
    const frame = useRef(null);
    const gesture = useRef(null);
    const [width, setWidth] = useState(null);
    const [total, setTotal] = useState(1200);
    const available = Math.max(0, total - reserveOf(total));
    const limits = size => ({ min: Math.min(120, Math.max(0, (size - 8) / 3)), max: Math.max(0, Math.min(560, size - 8 - Math.min(240, size / 2))) });
    const clamp = (value, size = available) => { const range = limits(size); return Math.max(range.min, Math.min(value ?? preferredDirectoryWidth(size), Math.max(range.min, range.max))); };
    const finish = (event, cancel = false) => {
      const drag = gesture.current;
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
      gesture.current = null;
      if (cancel) setWidth(drag.previous === null ? null : clamp(drag.previous));
      if (drag.target.hasPointerCapture(drag.id)) drag.target.releasePointerCapture(drag.id);
    };
    useEffect(() => {
      if (!active || !frame.current) return;
      const resize = () => { finish(); setTotal(Math.max(0, frame.current.clientWidth)); };
      resize();
      const observer = new window.ResizeObserver(resize);
      observer.observe(frame.current);
      return () => { finish(); observer.disconnect(); };
    }, [active]);
    const range = limits(available);
    const value = clamp(width);
    return { frame, width: value, total, available, separator: {
      role: 'separator', tabIndex: 0, 'aria-orientation': 'vertical', 'aria-valuemin': Math.round(range.min), 'aria-valuemax': Math.round(Math.max(range.min, range.max)), 'aria-valuenow': Math.round(value),
      onPointerDown: event => { if (event.button !== 0 || gesture.current) return; event.preventDefault(); event.currentTarget.focus(); gesture.current = { id: event.pointerId, target: event.currentTarget, x: event.clientX, width: value, previous: width }; event.currentTarget.setPointerCapture(event.pointerId); },
      onPointerMove: event => { const drag = gesture.current; if (!drag || event.pointerId !== drag.id) return; event.preventDefault(); setWidth(clamp(drag.width + event.clientX - drag.x)); },
      onPointerUp: event => finish(event), onPointerCancel: event => finish(event, true), onLostPointerCapture: event => finish(event, true),
      onKeyDown: event => {
        if (event.key === 'Escape') { finish(undefined, true); return; }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        setWidth(clamp(event.key === 'Home' ? range.min : event.key === 'End' ? range.max : value + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 24 : 8)));
      },
    } };
  }

  // 尺寸跟着知识区走（不写死窗口宽度）：左侧功能条固定一列；够宽时左右两栏都停靠，中等宽度右栏改成点了才浮出来，再窄左栏也浮出来。
  const ribbonWidth = 44;
  const sideWidthOf = total => Math.round(Math.max(220, Math.min(total * 0.2, 300)));
  const dockOf = total => ({ left: total >= 640, right: total >= 1000 });

  return function KnowledgeView({ active, workbench }) {
    const { api, t, notify, busy, run, operation, setError: reportError, button, field, row, help, bind } = useFeature(React, workbench, 'knowledge');
    const setError = (message, action) => reportError(message, action || { label: t('retry'), run: () => refreshTab() });
    const [confirm, setConfirm] = useState(null);
    const [leftOpen, setLeftOpen] = useState(true);
    const [leftOverlay, setLeftOverlay] = useState(false);
    const [rightOpen, setRightOpen] = useState(true);
    const [rightOverlay, setRightOverlay] = useState(false);
    const directorySplit = useDirectorySplit(active, total => ribbonWidth + (dockOf(total).right && rightOpen ? sideWidthOf(total) : 0));
    const dock = dockOf(directorySplit.total), sideWidth = sideWidthOf(directorySplit.total);
    const leftShown = dock.left ? leftOpen : leftOverlay;
    const sideShown = dock.right ? rightOpen : rightOverlay;
    const [status, setStatus] = useState(null);
    const [conflict, setConflict] = useState(false);
    const [readbackPath, setReadbackPath] = useState('');
    const [query, setQuery] = useState('');
    const [notes, setNotes] = useState([]);
    const [truncated, setTruncated] = useState(false);
    const [note, setNote] = useState(null);
    const [path, setPath] = useState('');
    const [content, setContent] = useState('');
    const [restorePath, setRestorePath] = useState('');
    const [validation, setValidation] = useState(null);
    const [editing, setEditing] = useState(false);
    const [location, setLocation] = useState(0);
    const [linkIssue, setLinkIssue] = useState(null);
    const [graph, setGraph] = useState(null);
    const [missingGraph, setMissingGraph] = useState(null);
    const graphRequest = useRef(null);
    const graphLoadingLabel = useRef((done, total) => t('graphPreparing', { done, total }));
    // 页签：一开始只有关系图谱；每个页签自己的前进后退见 placeNote。recentPath 是最近看过的那篇，图上把它标出来。
    const [tabState, setTabState] = useState(() => ({ list: [{ id: 1, kind: 'graph', back: [], fwd: [] }], active: 1, seq: 1 }));
    const activeTab = tabState.list.find(tab => tab.id === tabState.active) || tabState.list[0];
    const [recentPath, setRecentPath] = useState('');
    const [leftTab, setLeftTab] = useState('files');
    const [treeEpoch, setTreeEpoch] = useState(0);
    const [switcher, setSwitcher] = useState(false);
    const [searching, setSearching] = useState(false);
    // 知识库有改动（保存、移出、恢复、刷新）就加一，右栏的标签、属性、局部图谱和快速切换的清单跟着重读。
    const [vaultVersion, setVaultVersion] = useState(0);
    const [overview, setOverview] = useState(null);
    const [localGraph, setLocalGraph] = useState(null);
    // 图谱设置、设置面板开没开、生长动画放到哪了；graphControl 是画布交出来的 grow、stopGrow、reset。
    const [graphSettings, setGraphSettingsState] = useState(loadGraphSettings);
    const changeGraphSettings = patch => setGraphSettingsState(current => { const next = normalizeGraphSettings({ ...current, ...patch }); saveGraphSettings(next); return next; });
    const [graphPanel, setGraphPanel] = useState(false);
    const [growth, setGrowth] = useState(null);
    const graphControl = useRef(null);
    const [directoryVersion, setDirectoryVersion] = useState(0);
    // 左下角的知识库切换：null 是“我的第二大脑”，否则是扩展（比如企业版）列出的一个知识空间。
    const [libraries, setLibraries] = useState([]);
    const [library, setLibrary] = useState(null);
    const [spacesReload, setSpacesReload] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const frame = useSyncExternalStore(workbench.internal.subscribe ?? noSubscribe, workbench.internal.featureSnapshot ?? noFrame, workbench.internal.featureSnapshot ?? noFrame);
    const currentSpace = library ? libraries.find(item => item.id === library.source)?.spaces.find(space => space.id === library.space) : null;
    const scrollRef = useRef(null), spyFrame = useRef(0), spyPause = useRef(0);
    const [sideTab, setSideTab] = useState('outline');
    const [propsOpen, setPropsOpen] = useState(true);
    const [activeLine, setActiveLine] = useState(0);
    const outline = note ? outlineOf(note.view) : [];
    const dirty = content !== (note?.content || '');
    const blocked = dirty || conflict || Boolean(readbackPath);
    const selectedPaths = workbench.internal.assistant()?.selectedPaths || [];
    const setSelectedPaths = value => workbench.assistant.setContext(typeof value === 'function' ? value(selectedPaths) : value);
    const sessionId = '';
    const localActions = ['status', 'initialize', 'search', 'read', 'document', 'write', 'remove', 'restore', 'validate', 'graph', 'spaces', 'submit', 'overview'];
    const command = (action, extra = {}, id = sessionId) => !extra.domain && localActions.includes(action)
      ? (note?.readOnly && note.path === extra.path && ['write', 'remove', 'restore'].includes(action)
        ? Promise.reject(new Error(t('noteReadOnly')))
        : api.knowledge({ action, ...extra }, operation.current?.controller.signal)).catch(reason => {
        // 同名CONFLICT也来自专家和技能；只有知识正文写入持有编辑保护的归属。
        if (['write', 'remove', 'restore'].includes(action)) reason.notePath = extra.path;
        throw reason;
      })
      : api.request(id, { action, ...extra });
    const refreshNotes = async () => command('search', { query });
    // 扩展的搜索出了问题只在右上角说明，个人结果照常显示。
    // 来源笔记的路径以“@功能id/”开头，来源名在结果顶层；个人笔记原样不动。
    const applyNotes = (value) => {
      const labels = value.sourceLabels;
      setNotes(labels ? value.notes.map(item => item.path.startsWith('@') ? { ...item, sourceTag: labels[item.path.slice(1, item.path.indexOf('/'))] } : item) : value.notes);
      setTruncated(Boolean(value.truncated));
      if (value.sourceIssues?.length) notify(value.sourceIssues.join('；'), { kind: 'error' });
    };
    // 列表是派生视图，其失败不否定已经提交并回读的单文件结果。
    const refreshAfterMutation = async () => {
      try { return { found: await refreshNotes() }; }
      catch (reason) { return { issue: `${t('listRefreshFailed')}：${reason.message}` }; }
    };
    const applyRefreshed = value => { setDirectoryVersion(version => version + 1); setSpacesReload(version => version + 1); setVaultVersion(version => version + 1); if (value.found) applyNotes(value.found); if (value.issue) setError(value.issue); };
    const readAfterMutation = async name => {
      try { return await command('document', { path: name }); }
      // 新建和恢复也可能已落盘；恢复身份不依赖尚未读到的 note，也不被再次读取失败清除。
      catch (reason) { throw Object.assign(new Error(`${t('savedReadback')}：${reason.message}`), { code: 'committed_readback', notePath: name }); }
    };
    const warnDraft = () => notify(t('draftWarning'), { kind: 'info' });
    const clearNote = () => { setNote(null); setPath(''); setContent(''); setEditing(false); setConflict(false); setReadbackPath(''); setLinkIssue(null); setLocation(0); setConfirm(null); };
    const closeOverlays = () => { if (!dock.left) setLeftOverlay(false); if (!dock.right) setRightOverlay(false); };
    const newNote = (title = '') => {
      if (blocked) { warnDraft(); return; }
      // 用本地日期生成仅在编辑区存在的初稿，路径与正文仍由 Host 校验；快速切换里新建的用敲的名字。
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const name = title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim() || `${date} ${t('newNoteTitle')}`;
      let draftPath, draftContent;
      // 正在看一个自己能维护的团队知识空间时，新笔记建在这个空间里，保存交给扩展；否则进自己的收件箱。
      if (!title && currentSpace?.editable) { draftPath = `@${library.source}/${library.space}/${name}.md`; draftContent = `# ${name}\n\n`; }
      else { draftPath = `10-收件箱/${name}.md`; draftContent = `---\ntype: capture\nstatus: inbox\ncreated: ${date}\nupdated: ${date}\naliases: []\n---\n\n# ${name}\n\n`; }
      const from = note ? { path: note.path, targetLine: location } : null;
      setTabState(state => placeNote(state, draftPath, {}, from));
      setNote(null); setPath(draftPath); setContent(draftContent);
      setConflict(false); setConfirm(null); setReadbackPath('');
      setEditing(true); setLocation(0); setLinkIssue(null); setMissingGraph(null);
      closeOverlays();
    };
    // how：{ newTab } 另开页签，{ back } / { forward } 是这个页签的后退前进，{ tab } 是切到一个开着的笔记页签。
    const selectNote = (item, how = {}) => {
      // 缺失节点是图投影，不获得文件读取或自动新建入口。
      if (item.kind === 'missing') { if (activeTab.kind === 'graph') setMissingGraph(item); else notify(`${t('linkMissing')}：${item.title}`, { kind: 'info' }); return; }
      return run(async () => {
        const value = await command('document', { path: item.path });
        return () => {
          const from = note && note.path !== value.path ? { path: note.path, targetLine: location } : null;
          setTabState(state => placeNote(state, value.path, how, from));
          setNote(value); setPath(value.path); setContent(value.content); setReadbackPath(''); setConflict(false); setConfirm(null); setEditing(false); setLocation(item.targetLine || 0); setLinkIssue(null); setMissingGraph(null); setRecentPath(value.path);
          closeOverlays();
        };
      });
    };
    const openLink = (token) => {
      if (busy || dirty) return;
      const match = /^whalewing-link\/(\d+)\.md$/.exec(token);
      const link = match && note?.links?.[Number(match[1])];
      if (!link) { setError(t('invalidLink')); return; }
      if (link.status !== 'resolved') { setLinkIssue(link); return; }
      return selectNote(link);
    };
    const loadGraph = (offset = 0) => run(async () => {
      graphRequest.current = { query: '', offset };
      const value = await command('graph', graphRequest.current);
      return () => { setGraph(value); setMissingGraph(null); };
    });
    // 左侧功能条的“关系图谱”：切到开着的图谱页签（没有就新开一个），每次都重读一遍。
    const openGraph = () => {
      if (blocked) { warnDraft(); return; }
      const existing = tabState.list.find(tab => tab.kind === 'graph');
      clearNote(); setMissingGraph(null);
      setTabState(state => existing ? { ...state, active: existing.id } : addTab(state, 'graph'));
      return loadGraph();
    };
    const activateTab = id => {
      if (id === tabState.active) return;
      if (blocked) { warnDraft(); return; }
      const tab = tabState.list.find(item => item.id === id);
      if (!tab) return;
      if (tab.kind === 'note') return selectNote({ path: tab.path }, { tab: id });
      clearNote(); setMissingGraph(null);
      setTabState(state => ({ ...state, active: id }));
      if (tab.kind === 'graph' && !graph) return loadGraph();
    };
    const newTab = () => {
      if (blocked) { warnDraft(); return; }
      clearNote(); setMissingGraph(null);
      setTabState(state => addTab(state, 'empty'));
    };
    // 关掉正在编辑、有没保存修改的页签先居中确认；关掉最后一个页签留一个空白页签。
    const closeTab = (id, force = false) => {
      const index = tabState.list.findIndex(tab => tab.id === id);
      if (index < 0) return;
      const closingActive = id === tabState.active;
      if (closingActive && !force && blocked) { if (dirty && !conflict && !readbackPath) setConfirm({ kind: 'closeTab', id }); else warnDraft(); return; }
      let rest = tabState.list.filter(tab => tab.id !== id), seq = tabState.seq;
      if (!rest.length) { seq += 1; rest = [{ id: seq, kind: 'empty', back: [], fwd: [] }]; }
      if (!closingActive) { setTabState({ ...tabState, list: rest, seq }); return; }
      const next = rest[Math.min(index, rest.length - 1)];
      clearNote(); setMissingGraph(null);
      setTabState({ list: rest, active: next.id, seq });
      if (next.kind === 'note') return selectNote({ path: next.path }, { tab: next.id });
      if (next.kind === 'graph' && !graph) return loadGraph();
    };
    const goBack = () => { const entry = activeTab.back.at(-1); return entry && selectNote(entry, { back: true }); };
    const goForward = () => { const entry = activeTab.fwd.at(-1); return entry && selectNote(entry, { forward: true }); };
    const onError = reason => {
          const isConflict = Boolean(reason.notePath) && /conflict|hash|已.*修改/i.test(`${reason.code || ''} ${reason.message || ''}`);
          const needsReadback = Boolean(reason.notePath) && /readback/i.test(reason.code || '');
          if (needsReadback || (isConflict && reason.notePath !== path)) {
            setReadbackPath(reason.notePath);
            // 正在看关系图谱或空白页签时切到这篇的笔记页签，“读取最新内容”才看得到。
            setTabState(state => state.list.find(tab => tab.id === state.active)?.kind === 'note' ? state : placeNote(state, reason.notePath, {}, null));
          }
          // 普通查询的结果不解决保存冲突；只由正文的成功回读或写后回执解除。
          setConflict(value => value || isConflict || needsReadback);
          setError(reason.sessionId ? `${t('expertSelectionFailed')} (${reason.sessionId}): ${reason.message}` : isConflict && !needsReadback ? t('conflict') : reason.message || t('requestFailed'), reason.sessionId ? { label: t('openCreated'), run: () => api.open(reason.sessionId) } : undefined);
      return true;
    };
    // 刷新：重读状态；开着关系图谱页签时连图一起重读，否则把图记成旧的，切过去时再读。
    const refreshTab = ({ entering = false } = {}) => {
      if (entering && blocked) { warnDraft(); return; }
      const showingGraph = activeTab.kind === 'graph';
      return run(async () => {
        if (entering) graphRequest.current = { query: '', offset: 0 };
        const id = '';
        const current = await command('status', {}, id);
        let value, nextGraph, graphError;
        if (current.initialized) {
          if (query.trim()) value = await command('search', { query }, id);
          if (showingGraph && !blocked) {
            try { nextGraph = await command('graph', graphRequest.current || { query: '', offset: 0 }, id); }
            catch (reason) { graphError = reason.message; }
          }
        }
        return () => {
          setStatus(current);
          setSpacesReload(version => version + 1);
          setVaultVersion(version => version + 1);
          if (value) applyNotes(value);
          if (nextGraph) { setGraph(nextGraph); setMissingGraph(null); }
          else if (!showingGraph) setGraph(null);
          if (graphError) setError(graphError);
        };
      });
    };
    bind({ refresh: refreshTab, blocked: dirty, guard: () => blocked ? t('draftWarning') : '', onError });
    // 扩展的知识空间：打开页面、刷新、扩展登记或说目录变了（快照里的 knowledgeSources）时重读；一个扩展出问题只在右上角说明。
    const sourcesKey = frame?.knowledgeSources ?? 0;
    useEffect(() => {
      if (!active || !status?.initialized) return;
      const controller = new AbortController();
      let live = true;
      api.knowledge({ action: 'spaces' }, controller.signal).then(value => {
        if (!live) return;
        // 一个空间都没有的来源（比如刚退出团队）不算：左下角没有可切的就不显示切换。
        setLibraries(value.libraries.filter(item => item.spaces.length));
        if (value.issues.length) notify(value.issues.join('；'), { kind: 'error' });
      }, reason => { if (live && !controller.signal.aborted) notify(reason.message, { kind: 'error' }); });
      return () => { live = false; controller.abort(); };
    }, [active, status?.initialized, sourcesKey, spacesReload]);
    // 正在看的空间不在了（退出团队、换了部门、扩展关了）：回到自己的第二大脑。
    useEffect(() => { if (library && !currentSpace) setLibrary(null); }, [libraries, library]);
    // 左栏“搜索”边敲边搜（停手 0.35 秒）；回车立刻搜。直接问知识服务，不占页面的忙碌状态，敲字不会被打断。
    useEffect(() => {
      const text = query.trim();
      if (!active || leftTab !== 'search' || !status?.initialized || !text) { setSearching(false); return undefined; }
      const controller = new AbortController();
      setSearching(true);
      const timer = setTimeout(() => api.knowledge({ action: 'search', query: text }, controller.signal).then(value => { if (!controller.signal.aborted) { applyNotes(value); setSearching(false); } }, reason => { if (!controller.signal.aborted) { setSearching(false); notify(reason.message, { kind: 'error' }); } }), 350);
      return () => { clearTimeout(timer); controller.abort(); };
    }, [active, leftTab, query, status?.initialized]);
    // 右栏的标签、属性和快速切换的清单：用到时才读，知识库改过再读一次；读的时候旧的照常显示。
    const needOverview = Boolean(active && status?.initialized && (switcher || (sideShown && ['tags', 'properties'].includes(sideTab))));
    useEffect(() => {
      if (!needOverview || overview?.version === vaultVersion) return undefined;
      const controller = new AbortController();
      let live = true;
      api.knowledge({ action: 'overview' }, controller.signal).then(value => { if (live) setOverview({ value, version: vaultVersion }); }, reason => { if (live && !controller.signal.aborted) setOverview(previous => ({ value: previous?.value, error: reason.message, version: vaultVersion })); });
      return () => { live = false; controller.abort(); };
    }, [needOverview, vaultVersion]);
    // 右栏的局部图谱：当前笔记和直接相连的；团队知识的笔记不在个人知识的图里。
    const localPath = active && sideShown && sideTab === 'local' && note && !note.source ? note.path : '';
    useEffect(() => {
      if (!localPath || (localGraph?.path === localPath && localGraph.version === vaultVersion)) return undefined;
      const controller = new AbortController();
      let live = true;
      api.knowledge({ action: 'graph', path: localPath }, controller.signal).then(value => { if (live) setLocalGraph({ path: localPath, value, version: vaultVersion }); }, reason => { if (live && !controller.signal.aborted) setLocalGraph({ path: localPath, error: reason.message, version: vaultVersion }); });
      return () => { live = false; controller.abort(); };
    }, [localPath, vaultVersion]);
    // Ctrl O（苹果上 Command O）打开快速切换，只在知识积累页开着时管用。
    useEffect(() => {
      if (!active || typeof window === 'undefined') return undefined;
      const onKey = event => { if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key?.toLowerCase() === 'o' && status?.initialized) { event.preventDefault(); setSwitcher(true); } };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [active, status?.initialized]);
    const switchLibrary = target => {
      if (blocked) { warnDraft(); return; }
      setLibrary(target); setQuery(''); setNotes([]);
    };
    const submitLibraries = libraries.filter(item => item.submit && item.spaces.length);
    const submitNote = request => run(async () => {
      const value = await command('submit', { path: note.path, ...request });
      return () => { setSubmitting(false); setSpacesReload(version => version + 1); notify(value.message || t(value.applied ? 'submitApplied' : 'submitPending')); };
    });
    useLayoutEffect(() => { workbench.internal.assistant()?.currentNote(note?.path || '', dirty); }, [note?.path, dirty]);
    const markdown = createMarkdown(h, { busy, dirty, openLink, linkClass: index => note?.links?.[index] && note.links[index].status !== 'resolved' ? 'ww-unresolved' : undefined });
    // 滚到不晚于这一行的最后一块正文；属性里的链接落在属性区。从反链跳过来时让那一段闪一下，好找。
    const scrollToLine = (line, { smooth = false, flash = false } = {}) => {
      const box = scrollRef.current;
      if (!box?.querySelectorAll) return;
      let target = null, best = 0;
      for (const element of box.querySelectorAll('.ww-reader :is(p,li,h1,h2,h3,h4,h5,h6,pre,blockquote,tr,.ww-note-props)[data-note-line]')) {
        const value = Number(element.dataset.noteLine);
        if (value <= line && value >= best) { target = element; best = value; }
      }
      if (!target) return;
      box.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12), behavior: smooth ? 'smooth' : 'auto' });
      if (flash) { target.classList.remove('ww-flash'); void target.offsetWidth; target.classList.add('ww-flash'); }
    };
    // 目录跟着阅读位置走：最后一个越过顶部的标题是当前标题，滚到底时算最后一个；点目录跳转的那一小会儿不改，停在点的那一项。
    const spy = () => {
      const box = scrollRef.current;
      if (!box?.querySelectorAll || !outline.length || typeof requestAnimationFrame !== 'function' || Date.now() < spyPause.current) return;
      cancelAnimationFrame(spyFrame.current);
      spyFrame.current = requestAnimationFrame(() => {
        const headings = [...box.querySelectorAll('.ww-reader :is(h1,h2,h3,h4,h5,h6)[data-note-line]')], edge = box.getBoundingClientRect().top + 80;
        let current = outline[0].line;
        if (box.scrollTop > 0 && box.scrollTop + box.clientHeight >= box.scrollHeight - 4 && headings.length) current = Number(headings.at(-1).dataset.noteLine);
        else for (const element of headings) { if (element.getBoundingClientRect().top <= edge) current = Number(element.dataset.noteLine); else break; }
        setActiveLine(current);
      });
    };
    useLayoutEffect(() => {
      if (!note || editing) return;
      setActiveLine(outline[0]?.line || 0);
      if (location > 1) scrollToLine(location, { flash: true });
      else scrollRef.current?.scrollTo?.({ top: 0 });
      spy();
    }, [note, location, editing]);
    useEffect(() => () => { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(spyFrame.current); }, []);
    const toggleLeft = () => dock.left ? setLeftOpen(value => !value) : setLeftOverlay(value => !value);
    const toggleRight = () => dock.right ? setRightOpen(value => !value) : setRightOverlay(value => !value);
    // 右栏浮在上面时，点里面的东西跳转以后自动收起。
    const fromSide = action => (...args) => { if (!dock.right) setRightOverlay(false); return action(...args); };
    // 笔记属性放在大标题下面（和 Obsidian 一样）；属性里的链接能点，只显示笔记名（完整路径在悬停提示里），没找到的目标显示成虚线。
    const properties = note?.properties?.length ? h('details', { key: 'properties', className: 'ww-note-props', 'data-note-line': 1, open: propsOpen, onToggle: event => setPropsOpen(event.currentTarget.open) }, h('summary', null, '笔记属性'),
      h('dl', null, ...note.properties.flatMap(({ key, values }) => [h('dt', { key: `k:${key}` }, key), h('dd', { key: `v:${key}` }, values.length ? values.map((value, i) => value.link !== undefined && note.links?.[value.link]
        ? h('button', { type: 'button', key: i, className: note.links[value.link].status === 'resolved' ? 'ww-prop-link' : 'ww-prop-link ww-unresolved', disabled: busy || dirty, title: note.links[value.link].path || note.links[value.link].target, onClick: () => openLink(`whalewing-link/${value.link}.md`) }, value.text.split('/').at(-1))
        : h('span', { key: i }, value.text)) : h('span', { className: 'ww-prop-empty' }, '没有值'))]))) : null;
    const readerBody = () => {
      const children = note.view?.type === 'root' ? note.view.children || [] : null;
      if (!children) return h(React.Fragment, null, properties, markdown(note.view));
      const lead = children[0]?.type === 'heading' && children[0].level === 1 ? 1 : 0;
      return h('div', { 'data-note-line': note.view.line }, ...children.slice(0, lead).map((node, i) => markdown(node, i)), properties, ...children.slice(lead).map((node, i) => markdown(node, i + lead)));
    };
    // 全库图按图谱设置筛选、上色；右栏的局部图谱什么都不藏，只按颜色组上色。
    const viewSettings = graphSettings;
    const graphViewData = useMemo(() => graph ? buildGraphView(graph, viewSettings) : null, [graph, viewSettings.search, viewSettings.tags, viewSettings.attachments, viewSettings.existingOnly, viewSettings.orphans]);
    const graphPaint = useMemo(() => graphViewData ? graphColors(graphViewData.nodes, viewSettings.groups) : null, [graphViewData, viewSettings.groups]);
    const localPaint = useMemo(() => localGraph?.value ? graphColors(localGraph.value.nodes, viewSettings.groups) : null, [localGraph?.value, viewSettings.groups]);
    const graphDisplay = useMemo(() => ({ nodeSize: viewSettings.nodeSize, lineSize: viewSettings.lineSize, textFade: viewSettings.textFade, arrows: viewSettings.arrows }), [viewSettings.nodeSize, viewSettings.lineSize, viewSettings.textFade, viewSettings.arrows]);
    const graphForces = useMemo(() => ({ center: viewSettings.center, repel: viewSettings.repel, link: viewSettings.link, distance: viewSettings.distance }), [viewSettings.center, viewSettings.repel, viewSettings.link, viewSettings.distance]);
    // 快速切换的清单：自己的全部笔记，加上团队知识空间里的；最近开过的排在前面。
    const switcherItems = useMemo(() => [
      ...(overview?.value?.notes || []).map(item => ({ ...item, where: item.path.includes('/') ? item.path.split('/').slice(0, -1).join('/') : t('vaultRoot') })),
      ...libraries.flatMap(item => item.spaces.flatMap(space => space.notes.map(entry => ({ path: entry.path, title: entry.title, aliases: [], created: '', where: `${labelText(item.label)} · ${space.name}`, team: true })))),
    ], [overview?.value, libraries]);
    const recent = useMemo(() => [...new Set([recentPath, ...tabState.list.filter(tab => tab.kind === 'note').map(tab => tab.path)].filter(Boolean))], [recentPath, tabState]);
    // 换了图（重新读、换筛选）就停下正在放的生长动画的进度条。
    useEffect(() => { setGrowth(null); }, [graphViewData]);
    const playGrowth = () => {
      if (growth && !growth.done) { graphControl.current?.stopGrow(); return; }
      const started = graphControl.current?.grow({
        onTick: value => setGrowth({ ...value, done: false }),
        onEnd: value => setGrowth(value.stopped ? null : { count: value.count, total: value.count, date: value.date, done: true, instant: Boolean(value.instant) }),
      });
      if (started) setGrowth(current => current?.done === false ? current : { count: 0, total: graphViewData?.nodes.length || 0, date: '', done: false });
    };
    useEffect(() => {
      if (!growth?.done) return undefined;
      const timer = setTimeout(() => setGrowth(null), 3200);
      return () => clearTimeout(timer);
    }, [growth?.done]);
    const openGraphNode = node => {
      // 标签：图只留带这个标签的笔记；附件：知识库里没有附件的阅读器，说明去哪里打开。
      if (node.kind === 'tag') { changeGraphSettings({ search: `tag:${node.tag}` }); notify(t('graphTagFiltered', { tag: node.tag }), { kind: 'info' }); return; }
      if (node.kind === 'attachment') { notify(t('graphAttachmentInfo', { name: node.file }), { kind: 'info' }); return; }
      return selectNote(node);
    };
    const graphCanvasProps = { display: graphDisplay, forces: graphForces, showReset: false, disabled: busy || dirty, resetLabel: t('resetGraph'), subscribeTheme: api.subscribeTheme, loadingLabel: graphLoadingLabel.current, canvasErrorLabel: t('graphCanvasError'), dataErrorLabel: t('graphDataError'), legendLabel: t('graphLegend') };

    // ---- 中间：关系图谱、笔记或空白页签 ----
    let centerView;
    if (activeTab.kind === 'graph' && graph) {
      const paged = graph.offset > 0 || graph.total > graph.nodes.length;
      const shownGraph = graphViewData;
      const legendItems = [...graphPaint.legend.map(group => ({ color: group.color, label: group.layer ? t(`graphLayer${group.layer[0].toUpperCase()}${group.layer.slice(1)}`) : group.query || t('graphGroupUnnamed') })),
        ...(shownGraph.kinds.tags ? [{ color: graphKindColors.tag, label: t('graphTags') }] : []), ...(shownGraph.kinds.attachments ? [{ color: graphKindColors.attachment, label: t('graphAttachments') }] : [])];
      const hiddenNote = shownGraph.excluded > 0 ? t('graphExcluded', { count: shownGraph.excluded }) : '';
      const growing = growth && !growth.done;
      centerView = h('section', { className: 'ww-graph-workspace', 'aria-label': t('graph') },
        shownGraph.nodes.length ? h(GraphCanvas, { ...graphCanvasProps, graph: shownGraph, colors: graphPaint.colors, controllerRef: graphControl, selectedPath: recentPath, onOpenNote: openGraphNode, label: t('graph'), legendItems: growth ? [] : legendItems, hiddenNote: growth ? '' : hiddenNote }) : h('div', { className: 'ww-graph-empty' }, help('graphEmpty'), hiddenNote && h('p', { className: 'ww-muted' }, hiddenNote)),
        // 右上角三颗按钮：图谱设置、看它长出来（再点一次停下）、回到全图。
        h('div', { className: 'ww-graph-tools' },
          h('button', { type: 'button', className: 'ww-graph-tool', 'aria-pressed': graphPanel, 'aria-label': t('graphSettings'), title: t('graphSettings'), onClick: () => setGraphPanel(value => !value) }, h(Glyph, { name: 'gear', size: 16 })),
          h('button', { type: 'button', className: 'ww-graph-tool', 'aria-pressed': Boolean(growing), 'aria-label': growing ? t('graphGrowStop') : t('graphGrow'), title: growing ? t('graphGrowStop') : t('graphGrow'), disabled: !shownGraph.nodes.length, onClick: playGrowth }, h(Glyph, { name: 'sprout', size: 16 })),
          h('button', { type: 'button', className: 'ww-graph-tool', 'aria-label': t('resetGraph'), title: t('resetGraph'), disabled: !shownGraph.nodes.length, onClick: () => graphControl.current?.reset() }, h(Glyph, { name: 'frame', size: 16 }))),
        graphPanel && h(GraphSettings, { settings: graphSettings, onChange: changeGraphSettings, onReset: () => { changeGraphSettings(defaultGraphSettings); notify(t('graphSettingsRestored')); }, onClose: () => setGraphPanel(false), t }),
        // 生长动画：左下角走日期和长到第几个，细线是进度；放完写一句到今天长到多少，3 秒后收起。
        growth && h('div', { className: 'ww-graph-growth', role: 'status' },
          h('strong', null, growth.done ? t('graphGrowToday') : growth.date || t('graphGrowUndated')),
          h('span', null, growth.done ? t('graphGrowDone', { total: growth.total }) : t('graphGrowCount', { count: growth.count, total: growth.total })),
          h('i', { 'aria-hidden': true }, h('b', { style: { width: `${growth.total ? Math.round(growth.count / growth.total * 100) : 0}%` } }))),
        missingGraph && h('div', { className: 'ww-graph-missing', role: 'status' }, h('h3', null, missingGraph.title), help('missingGraphNote'), h('h4', null, t('missingGraphSources')),
          ...missingGraph.sources.map(source => h('div', { key: `${source.path}:${source.line}` }, h('button', { type: 'button', disabled: busy || dirty, onClick: event => selectNote({ path: source.path, targetLine: source.line }, { newTab: newTabClick(event) }) }, `${source.title} · ${source.line}`))), button('closePanel', () => setMissingGraph(null))),
        // 完整单页只呈现画布；有界响应确有省略时才说明范围，不将局部图冒称全库。
        (paged || graph.omittedEdges > 0) && h('div', { className: 'ww-graph-controls', 'aria-label': t('graphRange') },
          paged && button('previous', () => loadGraph(Math.max(0, graph.offset - status.limits.maxGraphNodes)), graph.offset === 0),
          paged && h('span', null, t('graphPage', { from: graph.nodes.length ? graph.offset + 1 : 0, to: graph.offset + graph.nodes.length, total: graph.total })),
          paged && button('next', () => loadGraph(graph.offset + graph.nodes.length), graph.offset + graph.nodes.length >= graph.total || !graph.nodes.length),
          graph.omittedEdges > 0 && h('span', { title: t('graphOmitted', { count: graph.omittedEdges }) }, t('graphPartial'))));
    } else if (activeTab.kind === 'graph') {
      centerView = h('div', { className: 'ww-graph-empty' }, busy || !status ? h('span', { className: 'ww-spinner', role: 'status', 'aria-label': t('graphLoading') }) : button('graphReload', () => loadGraph(), !status?.initialized, { className: 'ww-ghost' }));
    } else if (activeTab.kind === 'empty') {
      centerView = h(EmptyTab, { t, actions: [['emptyNewNote', 'pencil', () => newNote(), !status?.initialized || busy], ['emptySwitcher', 'findfile', () => setSwitcher(true), !status?.initialized], ['emptyGraph', 'graph', openGraph, !status?.initialized || busy], ['emptyClose', 'close', () => closeTab(activeTab.id), tabState.list.length === 1]] });
    } else {
      centerView = h(React.Fragment, null, h('div', { className: 'ww-note-toolbar' },
        h('button', { type: 'button', className: 'ww-kn-icon', 'aria-label': t('goBack'), title: t('goBack'), disabled: busy || dirty || !activeTab.back.length, onClick: goBack }, h(Glyph, { name: 'back', size: 16 })),
        h('button', { type: 'button', className: 'ww-kn-icon', 'aria-label': t('goForward'), title: t('goForward'), disabled: busy || dirty || !activeTab.fwd.length, onClick: goForward }, h(Glyph, { name: 'forward', size: 16 })),
        h('details', { className: 'ww-note-path', open: editing }, h('summary', { title: path }, h(Glyph, { name: 'file', size: 14 }), path.split('/').at(-1) || t('noteDetails')), field('notePath', path, setPath, { readOnly: Boolean(note || readbackPath) })),
        row(button('read', () => note ? setEditing(false) : selectNote({ path }), !path.trim() || dirty), button('edit', () => { if (!note?.readOnly) setEditing(true); }, !status?.initialized || Boolean(note?.readOnly))),
        dirty && h('span', { className: 'ww-draft-chip', role: 'status' }, t('draftDirty'), h('button', { type: 'button', onClick: () => setConfirm({ kind: 'draft' }) }, t('discard')))),
        h('div', { className: 'ww-note-body' }, h('div', { className: editing ? 'ww-note-scroll ww-note-editing' : 'ww-note-scroll', ref: scrollRef, onScroll: spy },
          note?.readOnly && h('div', { className: 'ww-notice', role: 'status' }, note.source ? t('noteSourceReadOnly', { name: labelText(note.source.label) }) : t('noteReadOnly')),
          note?.source && !note.readOnly && h('div', { className: 'ww-notice', role: 'status' }, t('noteSourceEditable', { name: labelText(note.source.label) })),
          editing ? h('label', { className: 'ww-note-editor' }, t('content'), h('textarea', { 'aria-label': t('content'), value: content, disabled: busy || !status?.initialized, onChange: (event) => setContent(event.target.value), spellCheck: false })) : note ? h('div', { className: 'ww-reader', 'aria-label': t('reading') }, readerBody()) : help('selectNote'),
          linkIssue && h('div', { className: 'ww-notice', role: 'status' }, t(linkIssue.status === 'ambiguous' ? 'linkAmbiguous' : linkIssue.status.startsWith('fragment_') ? 'fragmentMissing' : linkIssue.status === 'attachment' ? 'linkAttachment' : linkIssue.status === 'invalid' ? 'invalidLink' : 'linkMissing'), `：${linkIssue.target}`,
            ...linkIssue.candidates.map(candidate => h('button', { type: 'button', key: candidate, disabled: busy || dirty, onClick: () => selectNote({ path: candidate }) }, candidate)), linkIssue.candidateTotal > linkIssue.candidates.length && help('truncated'), linkIssue.path && button('read', () => selectNote({ path: linkIssue.path }), dirty)),
          note?.relationsIssue && h('div', { className: 'ww-notice', role: 'status' }, t('relationsUnavailable'), `：${note.relationsIssue}`),
          editing && help('draftWarning'),
          h('details', { className: 'ww-note-actions', open: editing || conflict || Boolean(readbackPath) }, h('summary', null, t('more')), row(button('save', () => run(async () => {
            const saved = await command('write', { path, content, expectedHash: note?.hash || '' });
            const value = await readAfterMutation(path); const refreshed = await refreshAfterMutation();
            if (saved.hash !== value.hash) throw Object.assign(new Error(t('conflict')), { code: 'conflict', notePath: path });
            return () => { setNote(value); setPath(value.path); setContent(value.content); setConflict(false); setGraph(null); setRecentPath(value.path); setTabState(state => setActiveTab(state, { kind: 'note', path: value.path })); applyRefreshed(refreshed); };
          }, 'saved'), !status?.initialized || !path.trim() || Boolean(readbackPath) || Boolean(note?.readOnly)),
          // 读取最新内容会替换草稿：有没保存的修改时先居中确认（已经写进文件、只是读回失败时不会丢东西，不用确认）。
          button('reload', () => dirty && !readbackPath ? setConfirm({ kind: 'reload' }) : selectNote({ path: readbackPath || path }), !readbackPath && (!path.trim() || !conflict)),
          h('a', { download: path.split(/[\\/]/).at(-1) || 'note.md', href: `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}` }, t('export')),
          note && !note.source && submitLibraries.length > 0 && h('button', { type: 'button', disabled: busy || dirty || Boolean(readbackPath), onClick: () => setSubmitting(true) }, t('submitToLibrary', { name: labelText(submitLibraries[0].label) })),
          button('remove', () => { if (!note?.readOnly) setConfirm({ kind: 'note', path }); }, !note || dirty || Boolean(readbackPath) || Boolean(note?.readOnly) || Boolean(note?.source)))),
          (conflict || readbackPath) && help('reloadHelp'),
          confirm?.kind === 'reload' && h(ConfirmDialog, { title: t('reloadConfirmTitle'), message: t('reloadConfirmHelp'), confirmLabel: t('reload'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setConfirm(null); selectNote({ path: readbackPath || path }); } }),
          confirm?.kind === 'note' && h(ConfirmDialog, { title: t('noteRemoveTitle'), message: t('confirmRemove'), confirmLabel: t('remove'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => run(async () => { await command('remove', { path: note.path, expectedHash: note.hash }); const refreshed = await refreshAfterMutation(); return () => { clearNote(); setGraph(null); setTabState(state => setActiveTab(state, { kind: 'empty', path: undefined })); applyRefreshed(refreshed); }; }, 'deleted') }))));
    }
    const statusItems = (activeTab.kind === 'graph' ? graphViewData ? [t('statusDots', { count: graphViewData.nodes.length }), t('statusLines', { count: graphViewData.edges.length })] : []
      : activeTab.kind === 'note' && path ? [note && !note.relationsIssue && t('statusBacklinks', { count: note.totalBacklinks ?? note.backlinks?.length ?? 0 }), t('statusChars', { count: bodyChars(content) }), dirty && t('draftDirty')] : []).filter(Boolean);
    const tabTitle = tab => tab.kind === 'graph' ? t('graph') : tab.kind === 'empty' ? t('emptyTab') : tab.path.split('/').at(-1).replace(/\.md$/i, '');
    const center = h('div', { className: activeTab.kind === 'graph' ? 'ww-note-canvas ww-graph-mode' : 'ww-note-canvas' },
      // 页签条：左右两头是收起左栏、右栏；中间每个页签一颗胶囊，正在编辑没保存的标一个天青点。
      h('div', { className: 'ww-kn-tabstrip' },
        h('button', { type: 'button', className: 'ww-kn-icon', 'aria-pressed': leftShown, 'aria-label': t(leftShown ? 'hideLeft' : 'showLeft'), title: t(leftShown ? 'hideLeft' : 'showLeft'), onClick: toggleLeft }, h(Glyph, { name: 'panelLeft', size: 16 })),
        h('div', { className: 'ww-kn-tabs', role: 'tablist', 'aria-label': t('openTabs') }, ...tabState.list.map(tab => {
          const on = tab.id === activeTab.id, title = tabTitle(tab);
          return h('div', { key: tab.id, className: on ? 'ww-kn-tab ww-active' : 'ww-kn-tab', title: tab.kind === 'note' ? tab.path : title },
            h('button', { type: 'button', role: 'tab', className: 'ww-kn-tab-main', 'aria-selected': on, disabled: !on && busy, onClick: () => activateTab(tab.id), onAuxClick: event => { if (event.button === 1) closeTab(tab.id); } }, tab.kind === 'graph' && h(Glyph, { name: 'graph', size: 13 }), h('span', null, title), on && dirty && h('i', { className: 'ww-kn-dot', 'aria-label': t('draftDirty') })),
            h('button', { type: 'button', className: 'ww-kn-tab-close', 'aria-label': t('closeTab', { name: title }), title: t('closeTab', { name: title }), disabled: busy, onClick: () => closeTab(tab.id) }, h(Glyph, { name: 'close', size: 11 })));
        })),
        h('button', { type: 'button', className: 'ww-kn-icon', 'aria-label': t('newTab'), title: t('newTab'), disabled: busy || !status?.initialized, onClick: newTab }, h(Glyph, { name: 'plus', size: 16 })),
        h('button', { type: 'button', className: 'ww-kn-icon ww-side-toggle', 'aria-pressed': sideShown, 'aria-label': t(sideShown ? 'hideRight' : 'showRight'), title: t(sideShown ? 'hideRight' : 'showRight'), onClick: toggleRight }, h(Glyph, { name: 'panel', size: 16 }))),
      centerView,
      statusItems.length > 0 && h('footer', { className: 'ww-kn-status' }, ...statusItems.map(item => h('span', { key: item }, item))));

    // ---- 左边：功能条和“文件 / 搜索”两页 ----
    const toggleSelected = (name, selected) => { setSelectedPaths(value => selected ? [...value, name] : value.filter(item => item !== name)); };
    const runSearch = () => run(async () => { const value = await refreshNotes(); return () => applyNotes(value); });
    const ribbon = h('nav', { className: 'ww-kn-ribbon', 'aria-label': t('ribbon') },
      h('button', { type: 'button', className: 'ww-kn-icon', 'aria-label': t('switcher'), title: t('switcherShortcut'), disabled: !status?.initialized, onClick: () => setSwitcher(true) }, h(Glyph, { name: 'findfile', size: 17 })),
      h('button', { type: 'button', className: 'ww-kn-icon', 'aria-label': t('graph'), title: t('graph'), 'aria-pressed': activeTab.kind === 'graph', disabled: busy || !status?.initialized || blocked, onClick: openGraph }, h(Glyph, { name: 'graph', size: 17 })),
      h('div', { className: 'ww-kn-ribbon-end' }, h(ActionMenu, { label: t('libraryTools'), iconOnly: true, icon: 'gear', align: 'start' },
        button('validate', () => run(async () => { const value = await command('validate'); return () => setValidation(value); }), !status?.initialized),
        h('details', null, h('summary', null, t('restore')), row(field('restorePath', restorePath, setRestorePath), button('restore', () => run(async () => { await command('restore', { path: restorePath, expectedHash: '' }); const value = await readAfterMutation(restorePath); const refreshed = await refreshAfterMutation(); return () => { const from = note && note.path !== value.path ? { path: note.path, targetLine: location } : null; setTabState(state => placeNote(state, value.path, {}, from)); setNote(value); setPath(value.path); setContent(value.content); setConflict(false); setEditing(false); setGraph(null); setRecentPath(value.path); applyRefreshed(refreshed); }; }, 'restored'), !status?.initialized || !restorePath.trim() || dirty || Boolean(readbackPath) || Boolean(note?.readOnly && note.path === restorePath)))),
        h('details', null, h('summary', null, t('root')), status ? h('p', null, status.root, status.locationNotice && h('span', null, status.locationNotice)) : help('preparing')))));
    const libraryMenu = libraries.length > 0 && h('div', { className: 'ww-library-switch' }, h(ActionMenu, { label: t('switchLibrary'), icon: 'sort', text: currentSpace ? currentSpace.name : t('myLibrary'), className: 'ww-library-trigger' },
      h('button', { type: 'button', className: 'ww-library-option', 'aria-current': library ? undefined : 'true', onClick: () => switchLibrary(null) }, h('span', null, t('myLibrary'), !library && h(Glyph, { name: 'check', size: 13 })), h('small', null, t('myLibraryNote'))),
      ...libraries.flatMap(item => item.spaces.map((space, index) => {
        const headingOf = entry => [libraries.length > 1 && labelText(item.label), entry.group].filter(Boolean).join(' · ') || labelText(item.label);
        const heading = headingOf(space), previous = index > 0 ? headingOf(item.spaces[index - 1]) : null;
        const on = library?.source === item.id && library.space === space.id;
        return h(React.Fragment, { key: `${item.id}/${space.id}` }, heading !== previous && h('p', { className: 'ww-menu-heading' }, heading),
          h('button', { type: 'button', className: 'ww-library-option', 'aria-current': on ? 'true' : undefined, onClick: () => switchLibrary({ source: item.id, space: space.id }) },
            h('span', null, space.name, space.editable && h('em', null, t('maintainable')), on && h(Glyph, { name: 'check', size: 13 })), space.note && h('small', null, space.note)));
      }))));
    const results = notes.map(item => h('div', { key: item.path, className: 'ww-note-row' },
      h('input', { type: 'checkbox', checked: selectedPaths.includes(item.path), 'aria-label': t('selectForQuestion', { name: item.title || item.path }), disabled: busy || (!selectedPaths.includes(item.path) && selectedPaths.length >= 12), onChange: event => toggleSelected(item.path, event.target.checked) }),
      h('button', { type: 'button', className: `ww-note ${path === item.path ? 'ww-selected' : ''}`, disabled: busy || dirty, title: `${item.title || item.path}\n${item.path}`, onClick: event => selectNote(item, { newTab: newTabClick(event) }), onAuxClick: event => { if (event.button === 1) selectNote(item, { newTab: true }); } }, h('span', { className: 'ww-tree-title' }, item.title || item.path), item.sourceTag && h('span', { className: 'ww-tag' }, labelText(item.sourceTag)))));
    const leftPanel = leftShown && h('aside', { className: ['ww-note-tree', libraries.length > 0 && 'ww-with-libraries', !dock.left && 'ww-overlay'].filter(Boolean).join(' '), 'aria-label': t('leftPanel') },
      h('div', { className: 'ww-side-tabs', role: 'tablist', 'aria-label': t('leftPanel') },
        h('button', { type: 'button', role: 'tab', 'aria-selected': leftTab === 'files', onClick: () => setLeftTab('files') }, h(Glyph, { name: 'folder', size: 14 }), t('leftFiles')),
        h('button', { type: 'button', role: 'tab', 'aria-selected': leftTab === 'search', onClick: () => setLeftTab('search') }, h(Glyph, { name: 'search', size: 14 }), t('leftSearch'))),
      leftTab === 'files' ? h(React.Fragment, null,
        h('div', { className: 'ww-kn-tools' }, h('span', { title: currentSpace ? currentSpace.name : t('myLibrary') }, currentSpace ? currentSpace.name : t('myLibrary')),
          h('button', { type: 'button', className: 'ww-kn-icon', 'aria-label': t('newNote'), title: t('newNote'), disabled: busy || !status?.initialized || blocked, onClick: () => newNote() }, h(Glyph, { name: 'pencil', size: 15 })),
          h('button', { type: 'button', className: 'ww-kn-icon', 'aria-label': t('collapseAll'), title: t('collapseAll'), onClick: () => setTreeEpoch(value => value + 1) }, h(Glyph, { name: 'collapse', size: 15 }))),
        h('div', { className: 'ww-tree-scroll' }, currentSpace
          ? h(SpaceTree, { key: `${library.source}/${library.space}/${treeEpoch}`, space: currentSpace, prefix: `@${library.source}/${library.space}/`, t, selected: path, disabled: busy || dirty, onSelect: selectNote, selectedPaths, onToggle: toggleSelected })
          : h(Directory, { key: treeEpoch, api, t, selected: path, disabled: busy || dirty, onSelect: selectNote, selectedPaths, version: directoryVersion, onToggle: toggleSelected })),
        libraryMenu)
        : h('div', { className: 'ww-kn-search' },
          h('label', { className: 'ww-search' }, h(Glyph, { name: 'search', size: 15 }), h('input', { 'aria-label': t('searchLabel'), placeholder: t('searchPlaceholder'), value: query, spellCheck: false, onChange: event => setQuery(event.target.value), onKeyDown: event => { if (event.key === 'Enter' && !event.isComposing) runSearch(); } })),
          // search 的截断只描述当前搜索列表，不代表独立目录或图谱缺失数据。
          // 搜的时候先说“正在搜索”（大库要一两秒），旧结果照常留着，不先说“没有匹配”。
          h('div', { className: 'ww-tree-scroll' }, !query.trim() ? h('p', { className: 'ww-side-empty' }, t('searchHint')) : h(React.Fragment, null,
            searching && h('p', { className: 'ww-kn-searching', role: 'status' }, h('span', { className: 'ww-spinner', 'aria-hidden': true }), t('searching')),
            notes.length ? results : !searching && help('emptyNotes'), notes.length > 0 && truncated && help('truncated')))));

    // ---- 右栏 ----
    const sideEmpty = text => h('p', { className: 'ww-side-empty' }, text);
    const localView = !note ? null : note.source ? sideEmpty(t('sideLocalTeam')) : !localGraph || localGraph.path !== note.path ? h('span', { className: 'ww-spinner', role: 'status', 'aria-label': t('sideLoading') }) : localGraph.error ? sideEmpty(localGraph.error)
      : h(React.Fragment, null, h(GraphCanvas, { ...graphCanvasProps, graph: localGraph.value, colors: localPaint.colors, selectedPath: note.path, onOpenNote: node => selectNote(node), label: t('localGraph'), legendItems: [] }), sideEmpty(t('sideLocalHint')));
    const right = sideShown && h(SidePanel, { note, tab: sideTab, setTab: setSideTab, outline, activeLine, overview, local: localView, disabled: busy || dirty, overlay: !dock.right, onClose: () => setRightOverlay(false), t, help,
      onHeading: fromSide(line => { spyPause.current = Date.now() + 900; setActiveLine(line); scrollToLine(line, { smooth: true }); }),
      onOpen: fromSide((item, how) => selectNote(item, how)), openLink: fromSide(openLink),
      onTagGraph: fromSide(name => { changeGraphSettings({ search: `tag:${name}` }); openGraph(); }) });

    let body;
    // 页头一句现状：知识库在哪。规则、模板这一层只用新版（2026-11-02）：这次升级换掉了几个、原来的另存在哪；
    // 还有和新版不一样或不属于插件的，写明下次升级会换掉（每次读状态时现查）。悬停看文件清单。
    const edited = status?.bundle?.edited || [], replaced = status?.bundle?.replaced;
    const spaceCount = libraries.map(item => item.spaces.length ? t('librarySummary', { name: labelText(item.label), count: item.spaces.length }) : '').filter(Boolean);
    const summary = !status ? t('preparing') : !status.initialized ? '' : [`${t('myLibrary')}在 ${status.root}`, ...spaceCount, replaced && `规则和模板已换成新版，原来的 ${replaced.files.length} 个文件另存在 ${replaced.folder}`, edited.length > 0 && `有 ${edited.length} 个规则或模板和新版不一样，插件下次更新会换成新版，原来的另存`, status.bundle?.issue && `规则和模板没能更新：${status.bundle.issue}，下次打开会再试`].filter(Boolean).join(' · ');
    const bundleFiles = [...(replaced?.files || []), ...edited];
    const columns = [`${ribbonWidth}px`, dock.left && leftOpen && `${directorySplit.width}px`, dock.left && leftOpen && '8px', 'minmax(0,1fr)', dock.right && rightOpen && `${sideWidth}px`].filter(Boolean).join(' ');
    body = h('section', { className: 'ww-knowledge' },
      h('header', { className: 'ww-pagehead ww-knowledge-head' }, h('div', null, h('h2', null, t('pageTitle')), summary && h('p', { title: bundleFiles.length ? bundleFiles.join('\n') : undefined }, summary))),
      validation && h(Modal, { title: t('validation'), onClose: () => setValidation(null), className: 'ww-confirm' }, h('div', { className: 'ww-confirm-body' }, h('p', null, t(validation.valid ? 'valid' : 'invalid', { count: validation.notes })), ...(validation.issues || []).map((issue, i) => h('p', { key: i }, issue)), ...styleLines(h, validation, t)), h('footer', { className: 'ww-dialog-actions' }, button('closePanel', () => setValidation(null), false, { className: 'ww-primary' }))),
      h('div', { className: 'ww-knowledge-split', ref: directorySplit.frame, style: { '--ww-directory-width': `${directorySplit.width}px`, gridTemplateColumns: columns } },
        ribbon, leftPanel,
        dock.left && leftOpen && h('div', { ...directorySplit.separator, className: 'ww-directory-separator', 'aria-label': t('directoryResize') }),
        center, right,
        ((!dock.left && leftShown) || (!dock.right && sideShown)) && h('div', { className: 'ww-kn-scrim', 'aria-hidden': true, onClick: () => { setLeftOverlay(false); setRightOverlay(false); } })));

    body = h(React.Fragment, null, body, submitting && note && !note.source && h(SubmitDrawer, { note, libraries: submitLibraries, busy, t, onClose: () => setSubmitting(false), onSubmit: submitNote }),
      switcher && h(QuickSwitcher, { items: switcherItems, loading: !overview?.value && !overview?.error, error: overview?.error, recent, t, onClose: () => setSwitcher(false),
        onPick: (item, openNew) => { setSwitcher(false); if (blocked) { warnDraft(); return; } selectNote({ path: item.path }, { newTab: openNew }); },
        onCreate: title => { setSwitcher(false); newNote(title); } }),
      confirm?.kind === 'closeTab' && h(ConfirmDialog, { title: t('draftDiscardTitle'), message: t('closeTabConfirm'), confirmLabel: t('discard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { const id = confirm.id; setConfirm(null); setContent(note?.content || ''); closeTab(id, true); } }),
      confirm?.kind === 'draft' && h(ConfirmDialog, { title: t('draftDiscardTitle'), message: t('confirmDiscard'), confirmLabel: t('discard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => {
        setConfirm(null); notify(t('draftDiscarded'));
        if (note) { setContent(note.content || ''); return; }
        // 新建的草稿放弃了，这个页签变成空白页签。
        clearNote(); setTabState(state => setActiveTab(state, { kind: 'empty', path: undefined }));
      } }));
    return active ? body : null;
  };
}

export const name = 'whalewing-knowledge';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'knowledge', createView, { contract: knowledgeContract, namespace: 'whalewingKnowledge', entries: registerEntries }); }
