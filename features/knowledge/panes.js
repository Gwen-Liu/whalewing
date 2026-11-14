/**
 * 知识积累的几块面板（2026-11-11）：右栏六页（目录、反链、出链、标签、属性、局部图谱）、快速切换、空白页签。
 * 用法对标 Obsidian，名字、图标和样子是鲸翼自己的（2026-11-11 用户定：不用 Obsidian 原生主题，免得像抄的）：
 * 鲸翼的分段页签和胶囊、宋体小标题、DSH 和鲸翼的颜色变量。
 */
export function createKnowledgePanes(kit) {
  const { React, Glyph, Modal } = kit;
  const { createElement: h, useState, useEffect, useRef, useMemo } = React;
  const linkStates = { missing: '未创建', ambiguous: '多个同名', attachment: '附件', fragment_missing: '定位缺失', fragment_ambiguous: '定位重名', invalid: '无效' };
  const sideTabs = [['outline', 'sideOutline', 'outline'], ['backlinks', 'sideBacklinks', 'backlink'], ['outgoing', 'sideOutgoing', 'outlink'], ['tags', 'sideTags', 'tag'], ['properties', 'sideProperties', 'table'], ['local', 'sideLocal', 'graph']];

  /**
   * 右栏：前三页跟着当前笔记走，标签、属性看整个知识库，局部图谱画当前笔记和直接相连的。
   * 页签只放图标（六个字排不下），选中那页的名字和数量写在下面的小标题里；数量也挂在图标角上。
   */
  function SidePanel({ note, tab, setTab, outline, activeLine, onHeading, onOpen, openLink, onTagGraph, overview, local, disabled, overlay, onClose, t, help }) {
    const backlinks = note?.backlinks || [];
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
    (note?.links || []).forEach((link, index) => {
      const key = link.status === 'resolved' ? link.path : `${link.status}:${link.target}`;
      if (!links.some(value => value.key === key)) links.push({ key, link, index });
    });
    const counts = { outline: note ? outline.length : 0, backlinks: note ? note.totalBacklinks ?? backlinks.length : 0, outgoing: links.length };
    const [openTag, setOpenTag] = useState('');
    const titles = useMemo(() => new Map((overview?.value?.notes || []).map(item => [item.path, item.title])), [overview?.value]);
    const label = t(sideTabs.find(([id]) => id === tab)?.[1] || 'sideOutline');
    const empty = text => h('p', { className: 'ww-side-empty' }, text);
    const needNote = () => empty(t('sideNeedNote', { name: label }));
    const loading = () => h('span', { className: 'ww-spinner', role: 'status', 'aria-label': t('sideLoading') });
    let panel;
    if (tab === 'tags' || tab === 'properties') {
      if (!overview?.value) panel = overview?.error ? empty(overview.error) : loading();
      else if (tab === 'tags') panel = overview.value.tags.length ? h('div', { className: 'ww-side-links' }, ...overview.value.tags.map(tag => h('section', { key: tag.name, className: 'ww-side-group' },
        h('button', { type: 'button', className: 'ww-side-note ww-side-facet', 'aria-expanded': openTag === tag.name, onClick: () => setOpenTag(value => value === tag.name ? '' : tag.name) }, h(Glyph, { name: 'tag', size: 14 }), h('span', { className: 'ww-side-text' }, h('strong', null, `#${tag.name}`)), h('em', null, tag.count)),
        openTag === tag.name && h('div', { className: 'ww-side-tagged' },
          h('button', { type: 'button', className: 'ww-side-snippet ww-side-action', disabled, onClick: () => onTagGraph(tag.name) }, h(Glyph, { name: 'graph', size: 13 }), t('sideTagGraph')),
          ...tag.notes.map(path => h('button', { type: 'button', key: path, className: 'ww-side-snippet', disabled, title: path, onClick: event => onOpen({ path }, { newTab: event.ctrlKey || event.metaKey }) }, titles.get(path) || path.split('/').at(-1).replace(/\.md$/i, ''))),
          tag.count > tag.notes.length && help('truncated'))))) : empty(t('sideNoTags'));
      else panel = overview.value.properties.length ? h('div', { className: 'ww-side-links' }, ...overview.value.properties.map(property => h('div', { key: property.name, className: 'ww-side-note ww-side-facet' }, h(Glyph, { name: 'table', size: 14 }), h('span', { className: 'ww-side-text' }, h('strong', null, property.name)), h('em', null, property.count)))) : empty(t('sideNoProperties'));
    } else if (!note) panel = needNote();
    else if (tab === 'local') panel = local;
    else if (tab === 'outline') {
      const top = Math.min(...outline.map(item => item.level));
      panel = outline.length ? h('nav', { className: 'ww-side-outline', 'aria-label': t('sideOutline') }, ...outline.map(item => h('button', { type: 'button', key: item.line, className: item.line === activeLine ? 'ww-current' : undefined, 'aria-current': item.line === activeLine ? 'location' : undefined, style: { paddingInlineStart: `${10 + (item.level - top) * 14}px` }, title: item.text, onClick: () => onHeading(item.line) }, item.text))) : empty(t('sideNoHeadings'));
    } else if (note.relationsIssue) panel = empty(t('relationsUnavailable'));
    else if (tab === 'backlinks') panel = groups.length ? h('div', { className: 'ww-side-links' }, ...groups.map(group => h('section', { key: group.path, className: 'ww-side-group' },
      h('button', { type: 'button', className: 'ww-side-note', disabled, title: group.path, onClick: event => onOpen({ path: group.path }, { newTab: event.ctrlKey || event.metaKey }) }, h(Glyph, { name: 'file', size: 14 }), h('span', { className: 'ww-side-text' }, h('strong', null, group.title)), h('em', null, group.count)),
      ...group.items.map(item => h('button', { type: 'button', key: item.line, className: 'ww-side-snippet', disabled, title: `第 ${item.line} 行`, onClick: () => onOpen({ path: item.path, targetLine: item.line }) }, item.property ? h('span', { className: 'ww-tag' }, `属性 · ${item.property}`) : item.context || `第 ${item.line} 行`)))),
      note.totalBacklinks > backlinks.length && help('truncated')) : empty(t('noBacklinks'));
    else panel = links.length ? h('div', { className: 'ww-side-links' }, ...links.map(({ key, link, index }) => {
      // 没写别名的链接只显示笔记名，所在文件夹放在下面一行小字。
      const resolved = link.status === 'resolved', parts = (resolved ? link.path : link.label === link.target ? link.target.split('#')[0] : link.label).replace(/\.md$/i, '').split('/');
      return h('button', { type: 'button', key, className: resolved ? 'ww-side-note' : 'ww-side-note ww-unresolved', disabled, title: link.path || link.target, onClick: () => openLink(`whalewing-link/${index}.md`) }, h(Glyph, { name: 'file', size: 14 }),
        h('span', { className: 'ww-side-text' }, h('strong', null, parts.at(-1) || link.target), parts.length > 1 && h('small', null, parts.slice(0, -1).join('/'))), !resolved && h('em', null, linkStates[link.status] || link.status));
    })) : empty(t('sideNoOutgoing'));
    return h('aside', { className: overlay ? 'ww-note-side ww-overlay' : 'ww-note-side', 'aria-label': t('rightPanel') },
      h('div', { className: 'ww-side-tabs', role: 'tablist', 'aria-label': t('rightPanel') }, ...sideTabs.map(([id, key, icon]) => h('button', { type: 'button', key: id, role: 'tab', 'aria-selected': tab === id, 'aria-label': t(key), title: t(key), onClick: () => setTab(id) }, h(Glyph, { name: icon, size: 15 }), counts[id] > 0 && h('em', null, counts[id])))),
      h('div', { className: 'ww-side-head' }, h('h3', null, label), counts[tab] > 0 && h('span', null, counts[tab]), overlay && h('button', { type: 'button', className: 'ww-kn-icon', 'aria-label': t('closePanel'), onClick: onClose }, h(Glyph, { name: 'close', size: 14 }))),
      h('div', { className: tab === 'local' && note ? 'ww-side-panel ww-side-local' : 'ww-side-panel', role: 'tabpanel', 'aria-label': label }, panel));
  }

  // 快速切换的排序：没输入时最近开过的在前，再按建立日期新到旧；输入了就是名字一样的、名字开头对上的、名字里有的、别名里有的、路径里有的。
  const rank = (items, query, recent) => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) {
      const order = new Map(recent.map((path, i) => [path, i]));
      return [...items].sort((a, b) => (order.get(a.path) ?? 1e9) - (order.get(b.path) ?? 1e9) || (b.created || '').localeCompare(a.created || '') || a.title.localeCompare(b.title, 'zh')).slice(0, 50);
    }
    const score = item => {
      const title = item.title.toLocaleLowerCase();
      if (title === q) return 0;
      if (title.startsWith(q)) return 1;
      if (title.includes(q)) return 2;
      if ((item.aliases || []).some(alias => alias.toLocaleLowerCase().includes(q))) return 3;
      return item.path.toLocaleLowerCase().includes(q) ? 4 : 9;
    };
    return items.map(item => [score(item), item]).filter(([value]) => value < 9).sort((a, b) => a[0] - b[0] || a[1].title.length - b[1].title.length || a[1].title.localeCompare(b[1].title, 'zh')).slice(0, 50).map(([, item]) => item);
  };

  /** 快速切换（Ctrl O）：敲笔记名，上下键挑，回车打开，Ctrl 回车在新页签打开；没有这篇就回车新建到收件箱。 */
  function QuickSwitcher({ items, loading, error, recent, t, onPick, onCreate, onClose }) {
    const [query, setQuery] = useState('');
    const [index, setIndex] = useState(0);
    const input = useRef(null), list = useRef(null);
    const shown = useMemo(() => rank(items, query, recent), [items, query, recent]);
    const text = query.trim();
    const total = shown.length + (text && !shown.some(item => item.title === text) ? 1 : 0);
    const at = Math.min(index, Math.max(0, total - 1));
    useEffect(() => { input.current?.focus(); }, []);
    useEffect(() => { list.current?.querySelector?.('[aria-selected=true]')?.scrollIntoView?.({ block: 'nearest' }); }, [at, shown]);
    const pick = (i, newTab) => { if (i < shown.length) onPick(shown[i], newTab); else if (text) onCreate(text); };
    const option = (i, children, onClick) => h('li', { key: i, id: `ww-switcher-${i}`, role: 'option', 'aria-selected': i === at }, h('button', { type: 'button', tabIndex: -1, onMouseMove: () => setIndex(i), onClick }, ...children));
    return h(Modal, { title: t('switcher'), onClose, className: 'ww-switcher' },
      h('label', { className: 'ww-search ww-switcher-input' }, h(Glyph, { name: 'findfile', size: 16 }),
        h('input', { ref: input, value: query, placeholder: t('switcherPlaceholder'), 'aria-label': t('switcherPlaceholder'), role: 'combobox', 'aria-expanded': true, 'aria-controls': 'ww-switcher-list', 'aria-activedescendant': total ? `ww-switcher-${at}` : undefined, spellCheck: false, autoComplete: 'off',
          onChange: event => { setQuery(event.target.value); setIndex(0); },
          onKeyDown: event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (total) setIndex((at + (event.key === 'ArrowDown' ? 1 : total - 1)) % total); }
            else if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); pick(at, event.ctrlKey || event.metaKey); }
          } })),
      h('ul', { id: 'ww-switcher-list', ref: list, role: 'listbox', className: 'ww-switcher-list', 'aria-label': t('switcher') },
        loading && !items.length ? h('li', { className: 'ww-side-empty' }, h('span', { className: 'ww-spinner', role: 'status', 'aria-label': t('sideLoading') })) : error && !items.length ? h('li', { className: 'ww-side-empty' }, error) : null,
        ...shown.map((item, i) => option(i, [h(Glyph, { key: 'icon', name: item.team ? 'puzzle' : 'file', size: 14 }), h('span', { key: 'title' }, item.title), h('small', { key: 'where' }, item.where)], event => pick(i, event.ctrlKey || event.metaKey))),
        text && !shown.some(item => item.title === text) && option(shown.length, [h(Glyph, { key: 'icon', name: 'plus', size: 14 }), h('span', { key: 'title' }, t('switcherCreate', { title: text })), h('small', { key: 'where' }, t('switcherCreateWhere'))], () => onCreate(text)),
        !loading && !error && !text && !shown.length && h('li', { className: 'ww-side-empty' }, t('switcherEmpty'))),
      h('p', { className: 'ww-switcher-foot' }, t('switcherHelp')));
  }

  /** 空白页签：几件常做的事。 */
  function EmptyTab({ t, actions }) {
    return h('div', { className: 'ww-kn-empty' }, h('h3', null, t('emptyTab')), h('p', { className: 'ww-muted' }, t('emptyTabHelp')),
      h('div', { className: 'ww-kn-empty-actions' }, ...actions.map(([key, icon, onClick, disabled]) => h('button', { type: 'button', key, className: 'ww-ghost', disabled, onClick }, h(Glyph, { name: icon, size: 15 }), t(key)))));
  }

  return { SidePanel, QuickSwitcher, EmptyTab };
}
