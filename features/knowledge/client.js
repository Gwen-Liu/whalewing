import { createGraphCanvas } from '../../src/graph-canvas.js';
import { registerEntries } from './entries.js';
import { knowledgeContract } from './contract.js';
import { registerFeature } from '../../src/shell/feature.js';
import { createMarkdown } from '../../src/shell/markdown.js';
import { useFeature } from '../../src/shell/feature.js';

/** 本页持有自己的草稿、动作和恢复状态；切走时不把状态交给外壳。 */
export function createView(kit) {
  const { React, Glyph, ActionMenu, Modal, ConfirmDialog } = kit;
  const GraphCanvas = createGraphCanvas(React);
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } = React;
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
  const linkStates = { missing: '未创建', ambiguous: '多个同名', attachment: '附件', fragment_missing: '定位缺失', fragment_ambiguous: '定位重名', invalid: '无效' };
  const sideGlyph = { outline: 'outline', backlinks: 'backlink', outgoing: 'outlink' };

  /** 阅读区右侧栏：目录、反链、出链三页，和 Obsidian 的右栏一个用法。 */
  function NoteSide({ note, tab, setTab, outline, activeLine, onHeading, onOpen, openLink, disabled, t, help }) {
    const backlinks = note.backlinks || [];
    // 反链按来源笔记归组：数字是提到几次，同一行只列一次。
    const groups = [];
    for (const item of backlinks) {
      let group = groups.find(value => value.path === item.path);
      if (!group) groups.push(group = { path: item.path, title: item.title, count: 0, items: [] });
      group.count += 1;
      if (!group.items.some(value => value.line === item.line)) group.items.push(item);
    }
    // 出链同一目标只列一次；没找到的目标标出原因，点了照常给出提示和候选。
    const links = [];
    (note.links || []).forEach((link, index) => {
      const key = link.status === 'resolved' ? link.path : `${link.status}:${link.target}`;
      if (!links.some(value => value.key === key)) links.push({ key, link, index });
    });
    const tabs = [['outline', '目录', outline.length], ['backlinks', '反链', note.totalBacklinks ?? backlinks.length], ['outgoing', '出链', links.length]];
    const top = Math.min(...outline.map(item => item.level));
    const empty = text => h('p', { className: 'ww-side-empty' }, text);
    let panel;
    if (tab === 'outline') panel = outline.length ? h('nav', { className: 'ww-side-outline', 'aria-label': '目录' }, ...outline.map(item => h('button', { type: 'button', key: item.line, className: item.line === activeLine ? 'ww-current' : undefined, 'aria-current': item.line === activeLine ? 'location' : undefined, style: { paddingInlineStart: `${10 + (item.level - top) * 14}px` }, title: item.text, onClick: () => onHeading(item.line) }, item.text))) : empty('这篇笔记没有小标题');
    else if (note.relationsIssue) panel = empty(t('relationsUnavailable'));
    else if (tab === 'backlinks') panel = groups.length ? h('div', { className: 'ww-side-links' }, ...groups.map(group => h('section', { key: group.path, className: 'ww-side-group' },
      h('button', { type: 'button', className: 'ww-side-note', disabled, title: group.path, onClick: () => onOpen({ path: group.path }) }, h(Glyph, { name: 'file', size: 14 }), h('span', { className: 'ww-side-text' }, h('strong', null, group.title)), h('em', null, group.count)),
      ...group.items.map(item => h('button', { type: 'button', key: item.line, className: 'ww-side-snippet', disabled, title: `第 ${item.line} 行`, onClick: () => onOpen({ path: item.path, targetLine: item.line }) }, item.property ? h('span', { className: 'ww-tag' }, `属性 · ${item.property}`) : item.context || `第 ${item.line} 行`)))),
      note.totalBacklinks > backlinks.length && help('truncated')) : empty(t('noBacklinks'));
    else panel = links.length ? h('div', { className: 'ww-side-links' }, ...links.map(({ key, link, index }) => {
      // 没写别名的链接只显示笔记名，所在文件夹放在下面一行小字。
      const resolved = link.status === 'resolved', parts = (resolved ? link.path : link.label === link.target ? link.target.split('#')[0] : link.label).replace(/\.md$/i, '').split('/');
      return h('button', { type: 'button', key, className: resolved ? 'ww-side-note' : 'ww-side-note ww-unresolved', disabled, title: link.path || link.target, onClick: () => openLink(`whalewing-link/${index}.md`) }, h(Glyph, { name: 'file', size: 14 }),
        h('span', { className: 'ww-side-text' }, h('strong', null, parts.at(-1) || link.target), parts.length > 1 && h('small', null, parts.slice(0, -1).join('/'))), !resolved && h('em', null, linkStates[link.status] || link.status));
    })) : empty('没有链到别的笔记');
    return h('aside', { className: 'ww-note-side', 'aria-label': '目录与链接' },
      h('div', { className: 'ww-side-tabs', role: 'tablist' }, ...tabs.map(([id, label, count]) => h('button', { type: 'button', key: id, role: 'tab', 'aria-selected': tab === id, onClick: () => setTab(id) }, h(Glyph, { name: sideGlyph[id], size: 14 }), label, count > 0 && h('em', null, count)))),
      h('div', { className: 'ww-side-panel', role: 'tabpanel' }, panel));
  }
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
      ...(listing?.notes || []).map(item => h('div', { key: item.path, className: 'ww-note-row' }, h('input', { type: 'checkbox', checked: selectedPaths.includes(item.path), 'aria-label': t('selectForQuestion', { name: item.title }), disabled: disabled || (!selectedPaths.includes(item.path) && selectedPaths.length >= 12), onChange: event => onToggle(item.path, event.target.checked) }), h('button', { type: 'button', className: `ww-note ${selected === item.path ? 'ww-selected' : ''}`, disabled, onClick: () => onSelect(item), title: `${item.title}\n${item.path}` }, h(Glyph, { name: 'file', size: 14 }), h('span', { className: 'ww-tree-title' }, item.title)))),
      listing && (offset > 0 || listing.total > pageSize) && h('div', { className: 'ww-row' }, h('button', { type: 'button', disabled: disabled || loading || Boolean(error) || offset !== listing.offset || offset === 0, onClick: () => setOffset(pages.current.pop() || 0) }, t('previous')), h('button', { type: 'button', disabled: disabled || loading || Boolean(error) || offset !== listing.offset || !listing.truncated || pageSize === 0, onClick: () => { pages.current.push(listing.offset); setOffset(listing.offset + pageSize); } }, t('next'))));
  }

  function useDirectorySplit(active) {
    const frame = useRef(null);
    const gesture = useRef(null);
    const [width, setWidth] = useState(195);
    const [available, setAvailable] = useState(800);
    const limits = size => ({ min: Math.min(120, Math.max(0, (size - 8) / 3)), max: Math.max(0, Math.min(560, size - 8 - Math.min(240, size / 2))) });
    const clamp = (value, size = available) => { const range = limits(size); return Math.max(range.min, Math.min(value, Math.max(range.min, range.max))); };
    const finish = (event, cancel = false) => {
      const drag = gesture.current;
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
      gesture.current = null;
      if (cancel) setWidth(clamp(drag.width));
      if (drag.target.hasPointerCapture(drag.id)) drag.target.releasePointerCapture(drag.id);
    };
    useEffect(() => {
      if (!active || !frame.current) return;
      const resize = () => { finish(); const size = Math.max(0, frame.current.clientWidth); setAvailable(size); setWidth(value => clamp(value, size)); };
      resize();
      const observer = new window.ResizeObserver(resize);
      observer.observe(frame.current);
      return () => { finish(); observer.disconnect(); };
    }, [active]);
    const range = limits(available);
    const value = clamp(width);
    return { frame, width: value, available, separator: {
      role: 'separator', tabIndex: 0, 'aria-orientation': 'vertical', 'aria-valuemin': Math.round(range.min), 'aria-valuemax': Math.round(Math.max(range.min, range.max)), 'aria-valuenow': Math.round(value),
      onPointerDown: event => { if (event.button !== 0 || gesture.current) return; event.preventDefault(); event.currentTarget.focus(); gesture.current = { id: event.pointerId, target: event.currentTarget, x: event.clientX, width: value }; event.currentTarget.setPointerCapture(event.pointerId); },
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

  return function KnowledgeView({ active, workbench }) {
    const { api, t, notify, busy, run, operation, setError: reportError, button, field, row, help, bind, openAssistant } = useFeature(React, workbench, 'knowledge');
    const setError = (message, action) => reportError(message, action || { label: t('retry'), run: () => refreshTab() });
    const [confirm, setConfirm] = useState(null);
    const directorySplit = useDirectorySplit(active);
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
    const [graphCenter, setGraphCenter] = useState('');
    const [directoryVersion, setDirectoryVersion] = useState(0);
    const history = useRef([]);
    const scrollRef = useRef(null), spyFrame = useRef(0), spyPause = useRef(0);
    const [sideTab, setSideTab] = useState('outline');
    const [sideOpen, setSideOpen] = useState(true);
    const [sideOverlay, setSideOverlay] = useState(false);
    const [propsOpen, setPropsOpen] = useState(true);
    const [activeLine, setActiveLine] = useState(0);
    const outline = note ? outlineOf(note.view) : [];
    const dirty = content !== (note?.content || '');
    const selectedPaths = workbench.internal.assistant()?.selectedPaths || [];
    const setSelectedPaths = value => workbench.assistant.setContext(typeof value === 'function' ? value(selectedPaths) : value);
    const sessionId = '';
    const localActions = ['status', 'initialize', 'search', 'read', 'document', 'write', 'remove', 'restore', 'validate', 'graph'];
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
    const applyNotes = (value) => { setNotes(value.notes); setTruncated(Boolean(value.truncated)); };
    // 列表是派生视图，其失败不否定已经提交并回读的单文件结果。
    const refreshAfterMutation = async () => {
      try { return { found: await refreshNotes() }; }
      catch (reason) { return { issue: `${t('listRefreshFailed')}：${reason.message}` }; }
    };
    const applyRefreshed = value => { setDirectoryVersion(version => version + 1); if (value.found) applyNotes(value.found); if (value.issue) setError(value.issue); };
    const readAfterMutation = async name => {
      try { return await command('document', { path: name }); }
      // 新建和恢复也可能已落盘；恢复身份不依赖尚未读到的 note，也不被再次读取失败清除。
      catch (reason) { throw Object.assign(new Error(`${t('savedReadback')}：${reason.message}`), { code: 'committed_readback', notePath: name }); }
    };
    const newNote = () => {
      // 用本地日期生成仅在编辑区存在的初稿，路径与正文仍由 Host 校验。
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const title = `${date} ${t('newNoteTitle')}`;
      setNote(null); setPath(`10-收件箱/${title}.md`);
      setContent(`---\ntype: capture\nstatus: inbox\ncreated: ${date}\nupdated: ${date}\naliases: []\n---\n\n# ${title}\n\n`);
      setConflict(false); setConfirm(null);
      setEditing(true); setLocation(0); setLinkIssue(null); setGraph(null); graphRequest.current = null;
    };
    const selectNote = (item, backwards = false) => run(async () => {
      // 缺失节点是图投影，不获得文件读取或自动新建入口。
      if (item.kind === 'missing') return () => setMissingGraph(item);
      const value = await command('document', { path: item.path });
      return () => {
        if (backwards) history.current.pop();
        else if (note && note.path !== value.path) history.current.push({ path: note.path, targetLine: location });
        setNote(value); setPath(value.path); setContent(value.content); setReadbackPath(''); setConflict(false); setConfirm(null); setEditing(false); setLocation(item.targetLine || 0); setLinkIssue(null); setGraph(null); setMissingGraph(null); graphRequest.current = null;
      };
    });
    const openLink = (token) => {
      if (busy || dirty) return;
      const match = /^whalewing-link\/(\d+)\.md$/.exec(token);
      const link = match && note?.links?.[Number(match[1])];
      if (!link) { setError(t('invalidLink')); return; }
      if (link.status !== 'resolved') { setLinkIssue(link); return; }
      return selectNote(link);
    };
    const loadGraph = (center = graphCenter, offset = 0) => run(async () => {
      graphRequest.current = { ...(center ? { path: center } : {}), query: '', offset };
      const value = await command('graph', graphRequest.current);
      return () => { setGraph(value); setGraphCenter(center); setMissingGraph(null); };
    });
    const onError = reason => {
          const isConflict = Boolean(reason.notePath) && /conflict|hash|已.*修改/i.test(`${reason.code || ''} ${reason.message || ''}`);
          const needsReadback = Boolean(reason.notePath) && /readback/i.test(reason.code || '');
          if (needsReadback || (isConflict && reason.notePath !== path)) { setReadbackPath(reason.notePath); setGraph(null); graphRequest.current = null; }
          // 普通查询的结果不解决保存冲突；只由正文的成功回读或写后回执解除。
          setConflict(value => value || isConflict || needsReadback);
          setError(reason.sessionId ? `${t('expertSelectionFailed')} (${reason.sessionId}): ${reason.message}` : isConflict && !needsReadback ? t('conflict') : reason.message || t('requestFailed'), reason.sessionId ? { label: t('openCreated'), run: () => api.open(reason.sessionId) } : undefined);
      return true;
    };
    const refreshTab = ({ entering = false } = {}) => {
      if (entering && (dirty || conflict || readbackPath)) { notify(t('draftWarning'), { kind: 'info' }); return; }
      return run(async () => {
      if (entering) graphRequest.current = { query: '', offset: 0 };
      const id = '';
      const current = await command('status', {}, id);
      let value, nextGraph, graphError;
      if (current.initialized) {
        if (query.trim() || !graphRequest.current) value = await command('search', { query }, id);
        if (graphRequest.current && !dirty && !conflict && !readbackPath) {
          try { nextGraph = await command('graph', graphRequest.current, id); }
          catch (reason) { graphError = reason.message; }
        }
      }
      return () => {
        setStatus(current);
        if (value) applyNotes(value);
        if (nextGraph) { setGraph(nextGraph); setGraphCenter(graphRequest.current.path || ''); setMissingGraph(null); }
        if (graphError) setError(graphError);
      };

      });
    };
    bind({ refresh: refreshTab, blocked: dirty, guard: () => dirty || conflict || readbackPath ? t('draftWarning') : '', onError });
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
    // 右侧栏：知识区够宽时和正文并排（默认打开），窄时点按钮才浮出来，跳转后自动收起。
    const readerWide = directorySplit.available - directorySplit.width - 8 >= 760;
    const sideShown = Boolean(note) && !editing && (readerWide ? sideOpen : sideOverlay);
    const toggleSide = () => readerWide ? setSideOpen(value => !value) : setSideOverlay(value => !value);
    const fromSide = action => (...args) => { if (!readerWide) setSideOverlay(false); return action(...args); };
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
    let graphView;
    if (graph) {
      const paged = graph.offset > 0 || graph.total > graph.nodes.length;
      graphView = h('section', { className: 'ww-graph-workspace', 'aria-label': t(graphCenter ? 'localGraph' : 'graph') },
        graph.nodes.length ? h(GraphCanvas, { graph, selectedPath: path, disabled: busy || dirty, onOpenNote: selectNote, label: t(graphCenter ? 'localGraph' : 'graph'), resetLabel: t('resetGraph'), subscribeTheme: api.subscribeTheme, loadingLabel: graphLoadingLabel.current, canvasErrorLabel: t('graphCanvasError'), dataErrorLabel: t('graphDataError') }) : h('div', { className: 'ww-graph-empty' }, help('graphEmpty')),
        missingGraph && h('div', { className: 'ww-graph-missing', role: 'status' }, h('h3', null, missingGraph.title), help('missingGraphNote'), h('h4', null, t('missingGraphSources')),
          ...missingGraph.sources.map(source => h('div', { key: `${source.path}:${source.line}` }, h('button', { type: 'button', disabled: busy || dirty, onClick: () => selectNote({ path: source.path, targetLine: source.line }) }, `${source.title} · ${source.line}`))), button('closePanel', () => setMissingGraph(null))),
        // 完整单页只呈现画布；有界响应确有省略时才说明范围，不将局部图冒称全库。
        (paged || graph.omittedEdges > 0) && h('div', { className: 'ww-graph-controls', 'aria-label': t('graphRange') },
          paged && button('previous', () => loadGraph(graphCenter, Math.max(0, graph.offset - status.limits.maxGraphNodes)), graph.offset === 0),
          paged && h('span', null, t('graphPage', { from: graph.nodes.length ? graph.offset + 1 : 0, to: graph.offset + graph.nodes.length, total: graph.total })),
          paged && button('next', () => loadGraph(graphCenter, graph.offset + graph.nodes.length), graph.offset + graph.nodes.length >= graph.total || !graph.nodes.length),
          graph.omittedEdges > 0 && h('span', { title: t('graphOmitted', { count: graph.omittedEdges }) }, t('graphPartial'))));
    }

    let body;
    // 页头一句现状：知识库在哪；插件更新时员工改过的规则和模板保留原样，也写在这里（每次读状态时现查）。
    const kept = status?.bundle?.kept || [];
    const summary = !status ? t('preparing') : !status.initialized ? '' : [`知识库在 ${status.root}`, kept.length > 0 && `你改过 ${kept.length} 个规则或模板，插件更新时保留了你的版本`, status.bundle?.issue && `规则和模板没能更新：${status.bundle.issue}，下次打开会再试`].filter(Boolean).join(' · ');
    body = h('section', { className: 'ww-knowledge' },
      h('header', { className: 'ww-pagehead ww-knowledge-head' }, h('div', null, h('h2', null, '个人知识'), summary && h('p', { title: kept.length ? kept.join('\n') : undefined }, summary))),
      h('div', { className: 'ww-knowledge-toolbar' },
        h('label', { className: 'ww-search' }, h(Glyph, { name: 'search', size: 16 }), h('input', { 'aria-label': t('query'), placeholder: t('searchPlaceholder'), value: query, disabled: busy, onChange: event => setQuery(event.target.value), onKeyDown: event => { if (event.key === 'Enter') run(async () => { const value = await refreshNotes(); return () => applyNotes(value); }); } })),
        button('search', () => run(async () => { const value = await refreshNotes(); return () => applyNotes(value); }), !status?.initialized, { className: 'ww-ghost' }),
        button('newNote', newNote, !status?.initialized || dirty || Boolean(readbackPath), { className: 'ww-ghost' }),
        button('graph', () => loadGraph(''), !status?.initialized || dirty || conflict || Boolean(readbackPath), { className: 'ww-ghost' }),
        h(ActionMenu, { label: t('libraryTools'), iconOnly: true }, button('localGraph', () => loadGraph(note.path), !note || dirty || conflict || Boolean(readbackPath)), button('validate', () => run(async () => { const value = await command('validate'); return () => setValidation(value); }), !status?.initialized),
          h('details', null, h('summary', null, t('restore')), row(field('restorePath', restorePath, setRestorePath), button('restore', () => run(async () => { await command('restore', { path: restorePath, expectedHash: '' }); const value = await readAfterMutation(restorePath); const refreshed = await refreshAfterMutation(); return () => { setNote(value); setPath(value.path); setContent(value.content); setConflict(false); setEditing(false); setGraph(null); graphRequest.current = null; applyRefreshed(refreshed); }; }, 'restored'), !status?.initialized || !restorePath.trim() || dirty || Boolean(readbackPath) || Boolean(note?.readOnly && note.path === restorePath)))),
          h('details', null, h('summary', null, t('root')), status ? h('p', null, status.root, status.locationNotice && h('span', null, status.locationNotice)) : help('preparing')))),
      validation && h(Modal, { title: t('validation'), onClose: () => setValidation(null), className: 'ww-confirm' }, h('div', { className: 'ww-confirm-body' }, h('p', null, t(validation.valid ? 'valid' : 'invalid', { count: validation.notes })), ...(validation.issues || []).map((issue, i) => h('p', { key: i }, issue))), h('footer', { className: 'ww-dialog-actions' }, button('closePanel', () => setValidation(null), false, { className: 'ww-primary' }))),
      // search 的截断只描述当前搜索列表，不代表独立目录或图谱缺失数据。
      Boolean(query.trim()) && notes.length > 0 && truncated && help('truncated'),
      h('div', { className: 'ww-knowledge-split', ref: directorySplit.frame, style: { '--ww-directory-width': `${directorySplit.width}px` } }, h('aside', { className: 'ww-note-tree', 'aria-label': t('notes') },
        query.trim() ? notes.length ? notes.map(item => h('div', { key: item.path, className: 'ww-note-row' },
          h('input', { type: 'checkbox', checked: selectedPaths.includes(item.path), 'aria-label': t('selectForQuestion', { name: item.title || item.path }), disabled: busy || (!selectedPaths.includes(item.path) && selectedPaths.length >= 12), onChange: event => { setSelectedPaths(event.target.checked ? [...selectedPaths, item.path] : selectedPaths.filter(value => value !== item.path)); } }),
          h('button', { type: 'button', className: 'ww-note', disabled: busy || dirty, title: `${item.title || item.path}\n${item.path}`, onClick: () => selectNote(item) }, h('span', { className: 'ww-tree-title' }, item.title || item.path)))) : help('emptyNotes') : h(Directory, { api, t, selected: path, disabled: busy || dirty, onSelect: selectNote, selectedPaths, version: directoryVersion, onToggle: (name, selected) => { setSelectedPaths(value => selected ? [...value, name] : value.filter(path => path !== name)); } })),
        h('div', { ...directorySplit.separator, className: 'ww-directory-separator', 'aria-label': t('directoryResize') }),
        h('div', { className: graphView ? 'ww-note-canvas ww-graph-mode' : 'ww-note-canvas' }, graphView || h(React.Fragment, null, h('div', { className: 'ww-note-toolbar' }, h('details', { className: 'ww-note-path', open: editing }, h('summary', { title: path }, h(Glyph, { name: 'file', size: 14 }), path.split('/').at(-1) || t('noteDetails')), field('notePath', path, setPath, { readOnly: Boolean(note || readbackPath) })),
          row(button('read', () => note ? setEditing(false) : selectNote({ path }), !path.trim() || dirty), button('edit', () => { if (!note?.readOnly) setEditing(true); }, !status?.initialized || Boolean(note?.readOnly)), button('back', () => selectNote(history.current.at(-1), true), !history.current.length || dirty)),
            dirty && h('span', { className: 'ww-draft-chip', role: 'status' }, t('draftDirty'), h('button', { type: 'button', onClick: () => setConfirm({ kind: 'draft' }) }, t('discard'))),
            note && !editing && h('button', { type: 'button', className: 'ww-side-toggle', 'aria-pressed': sideShown, title: sideShown ? '收起目录与链接' : '显示目录与链接', 'aria-label': sideShown ? '收起目录与链接' : '显示目录与链接', onClick: toggleSide }, h(Glyph, { name: 'panel', size: 16 }))),
          h('div', { className: ['ww-note-body', sideShown && (readerWide ? 'ww-with-side' : 'ww-side-overlay')].filter(Boolean).join(' ') }, h('div', { className: 'ww-note-scroll', ref: scrollRef, onScroll: spy },
          note?.readOnly && h('div', { className: 'ww-notice', role: 'status' }, t('noteReadOnly')),
          editing ? h('label', null, t('content'), h('textarea', { 'aria-label': t('content'), value: content, disabled: busy || !status?.initialized, onChange: (event) => setContent(event.target.value), spellCheck: false })) : note ? h('div', { className: 'ww-reader', 'aria-label': t('reading') }, readerBody()) : help('selectNote'),
          linkIssue && h('div', { className: 'ww-notice', role: 'status' }, t(linkIssue.status === 'ambiguous' ? 'linkAmbiguous' : linkIssue.status.startsWith('fragment_') ? 'fragmentMissing' : linkIssue.status === 'attachment' ? 'linkAttachment' : linkIssue.status === 'invalid' ? 'invalidLink' : 'linkMissing'), `：${linkIssue.target}`,
            ...linkIssue.candidates.map(candidate => h('button', { type: 'button', key: candidate, disabled: busy || dirty, onClick: () => selectNote({ path: candidate }) }, candidate)), linkIssue.candidateTotal > linkIssue.candidates.length && help('truncated'), linkIssue.path && button('read', () => selectNote({ path: linkIssue.path }), dirty)),
          note?.relationsIssue && h('div', { className: 'ww-notice', role: 'status' }, t('relationsUnavailable'), `：${note.relationsIssue}`),
          editing && help('draftWarning'),
          h('details', { className: 'ww-note-actions', open: editing || conflict || Boolean(readbackPath) }, h('summary', null, t('more')), row(button('save', () => run(async () => {
            const saved = await command('write', { path, content, expectedHash: note?.hash || '' });
            const value = await readAfterMutation(path); const refreshed = await refreshAfterMutation();
            if (saved.hash !== value.hash) throw Object.assign(new Error(t('conflict')), { code: 'conflict', notePath: path });
            return () => { setNote(value); setPath(value.path); setContent(value.content); setConflict(false); setGraph(null); graphRequest.current = null; applyRefreshed(refreshed); };
          }, 'saved'), !status?.initialized || !path.trim() || Boolean(readbackPath) || Boolean(note?.readOnly)),
          // 读取最新内容会替换草稿：有没保存的修改时先居中确认（已经写进文件、只是读回失败时不会丢东西，不用确认）。
          button('reload', () => dirty && !readbackPath ? setConfirm({ kind: 'reload' }) : selectNote({ path: readbackPath || path }), !readbackPath && (!path.trim() || !conflict)),
          h('a', { download: path.split(/[\\/]/).at(-1) || 'note.md', href: `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}` }, t('export')),
          button('remove', () => { if (!note?.readOnly) setConfirm({ kind: 'note', path }); }, !note || dirty || Boolean(readbackPath) || Boolean(note?.readOnly)))),
          (conflict || readbackPath) && help('reloadHelp'),
           confirm?.kind === 'reload' && h(ConfirmDialog, { title: t('reloadConfirmTitle'), message: t('reloadConfirmHelp'), confirmLabel: t('reload'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setConfirm(null); selectNote({ path: readbackPath || path }); } }),
           confirm?.kind === 'note' && h(ConfirmDialog, { title: t('noteRemoveTitle'), message: t('confirmRemove'), confirmLabel: t('remove'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => run(async () => { await command('remove', { path: note.path, expectedHash: note.hash }); const refreshed = await refreshAfterMutation(); return () => { setNote(null); setPath(''); setContent(''); setConflict(false); setConfirm(null); setGraph(null); graphRequest.current = null; applyRefreshed(refreshed); }; }, 'deleted') })),
          sideShown && h(NoteSide, { note, tab: sideTab, setTab: setSideTab, outline, activeLine, onHeading: fromSide(line => { spyPause.current = Date.now() + 900; setActiveLine(line); scrollToLine(line, { smooth: true }); }), onOpen: fromSide(selectNote), openLink: fromSide(openLink), disabled: busy || dirty, t, help }))))),
);

    body = h(React.Fragment, null, body, confirm?.kind === 'draft' && h(ConfirmDialog, { title: t('draftDiscardTitle'), message: t('confirmDiscard'), confirmLabel: t('discard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setContent(note?.content || ''); if (!note) setPath(''); setConfirm(null); notify(t('draftDiscarded')); } }));
    return active ? body : null;
  };
}

export const name = 'whalewing-knowledge';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'knowledge', createView, { contract: knowledgeContract, namespace: 'whalewingKnowledge', entries: registerEntries }); }
