import { parts, navGroups } from '../../features/index.js';
import { createSortable } from '../sortable.js';

/**
 * 页头的常用页签和“全部功能”（2026-11-13）。
 * 页头只放钉住的常用页签，其余功能都在“全部功能”里按分组排；钉了哪些、怎么排记在这台电脑上。
 * 这里只有排法、查找和界面：有哪些页签、现在在哪一页仍由外壳服务（workbench.js）说了算。
 */
export const DEFAULT_PINS = ['experts', 'knowledge', 'skills', 'automation', 'toolbox'];
/** 扩展没写分组时单独一组，排在内置分组后面。 */
export const EXTENSION_GROUP = 'extension';
export const pinsKey = 'whalewing.header.pins.v1';
export const seenKey = 'whalewing.header.seen.v1';

const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const idList = value => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && id.length <= 80 && idPattern.test(id)))] : null;

/** 员工钉过的页签；没钉过（或记的东西读不出来）返回 null，页头用默认的那几个。 */
export const readPins = () => { try { return idList(JSON.parse(window.localStorage.getItem(pinsKey) || 'null')?.pins); } catch { return null; } };
export const writePins = pins => { try { window.localStorage.setItem(pinsKey, JSON.stringify({ pins })); } catch { /* 存不下就只在这次打开里有效。 */ } };
/** 扩展带来的页签：told 是提示过“在全部功能里”的，opened 是员工打开过的（没打开过的标“新装的”）。 */
export const readSeen = () => {
  let value = null;
  try { value = JSON.parse(window.localStorage.getItem(seenKey) || 'null'); } catch { /* 读不出来就当都没见过。 */ }
  return { told: new Set(idList(value?.told) || []), opened: new Set(idList(value?.opened) || []) };
};
export const writeSeen = seen => { try { window.localStorage.setItem(seenKey, JSON.stringify({ told: [...seen.told], opened: [...seen.opened] })); } catch { /* 存不下就下次再提示一遍。 */ } };

/**
 * 页头放不下时收起哪几个：从前往后尽量多留，正在看的那一个一定留着。
 * widths 是每个页签的宽度，budget 是去掉“更多”按钮以后剩下的宽度；返回要收进“更多”的下标。
 */
export function fitTabs({ widths, gap = 0, budget, active = -1 }) {
  const keep = [];
  let used = 0;
  for (let index = 0; index < widths.length; index++) {
    const width = widths[index] + (keep.length ? gap : 0);
    if (used + width > budget) break;
    keep.push(index); used += width;
  }
  if (active >= 0 && active < widths.length && !keep.includes(active)) {
    while (keep.length && used + widths[active] + gap > budget) { const last = keep.pop(); used -= widths[last] + (keep.length ? gap : 0); }
    keep.push(active);
  }
  return widths.map((_, index) => index).filter(index => !keep.includes(index));
}

/**
 * 按名字或用途找功能：空格隔开的每个词都要出现在名字、用途、关键词或分组名里。
 * 名字完全一样的排最前，其次名字开头、名字里有、用途里有，其余按原来的顺序。
 */
export function searchFeatures(items, text) {
  const terms = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return { terms, list: [] };
  const whole = terms.join(' ');
  const list = items.map((item, index) => {
    const name = String(item.name || '').toLowerCase(), purpose = String(item.purpose || '').toLowerCase();
    const hay = `${name} ${purpose} ${String(item.keys || '').toLowerCase()} ${String(item.groupName || '').toLowerCase()}`;
    if (!terms.every(term => hay.includes(term))) return null;
    const score = name === whole ? 0 : name.startsWith(terms[0]) ? 1 : name.includes(terms[0]) ? 2 : purpose.includes(terms[0]) ? 3 : 4;
    return { item, score, index };
  }).filter(Boolean).sort((a, b) => a.score - b.score || a.index - b.index);
  return { terms, list: list.map(entry => entry.item) };
}

/** 把一段文字按搜索词切开，命中的那几段标出来。 */
export function highlightParts(text, terms) {
  const source = String(text || ''), lower = source.toLowerCase(), out = [];
  let plain = '';
  for (let index = 0; index < source.length;) {
    const term = terms.find(value => value && lower.startsWith(value, index));
    if (term) { if (plain) { out.push({ text: plain, hit: false }); plain = ''; } out.push({ text: source.slice(index, index + term.length), hit: true }); index += term.length; }
    else plain += source[index++];
  }
  if (plain) out.push({ text: plain, hit: false });
  return out;
}

const groupLabels = { work: 'navGroupWork', knowledge: 'navGroupKnowledge', office: 'navGroupOffice', news: 'navGroupNews', [EXTENSION_GROUP]: 'navGroupExtension' };
const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

export function createNavViews({ React, Glyph, ActionMenu, useClosedPopover }) {
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect } = React;
  const useSortable = createSortable(React);
  const maskOf = icon => `url("data:image/svg+xml,${encodeURIComponent(icon)}") center / contain no-repeat`;
  /** 功能自己的图标：单色 SVG 只当蒙版，颜色跟着文字，不作为页面 HTML 插入。 */
  const featureIcon = (icon, size = 16) => icon ? [h('span', { key: 'icon', className: 'ww-tab-icon', 'aria-hidden': true, style: { display: 'inline-block', width: size, height: size, flexShrink: 0, backgroundColor: 'currentColor', mask: maskOf(icon), WebkitMask: maskOf(icon) } })] : [];
  const tabName = id => parts.find(part => part.id === id)?.label || id;
  const labelOf = entry => typeof entry.options.label === 'function' ? entry.options.label() : entry.options.label;
  // 苹果电脑上 Ctrl K 是输入框里“删到行尾”，所以那边用 Command K。
  const mac = () => /Mac|iPhone|iPad/.test(window.navigator?.platform || '');

  /** 页头上的常用页签：钉住的按员工排的顺序，后面跟一个没钉住、临时放着的；放不下的收进末尾的“更多”，不横着滚。 */
  /** 功能要员工回来看一眼时页签上的小点（见工作台的 setAttention）；读屏读出 label。 */
  const attentionDot = mark => mark && h('span', { key: 'attention', className: 'ww-tab-dot', 'data-tone': mark.tone, role: 'img', 'aria-label': mark.label, title: mark.label });

  function NavTabs({ workbench, state, entries, t }) {
    const core = workbench.internal, nav = core.nav(), marks = core.attention?.() ?? {};
    const strip = useRef(null);
    const [tucked, setTucked] = useState([]);
    const byId = new Map(entries.map(entry => [entry.options.id, entry]));
    const ids = [...nav.pins, ...(nav.temp ? [nav.temp] : [])].filter(id => byId.has(id));
    const hidden = tucked.filter(id => ids.includes(id));
    const signature = `${ids.map(id => `${id}:${labelOf(byId.get(id))}`).join('|')}>${state.tab}>${nav.temp || ''}`;
    useLayoutEffect(() => {
      const element = strip.current;
      if (!element) return;
      const fit = () => {
        const items = [...element.querySelectorAll(':scope > [data-nav-item]')], more = element.querySelector(':scope > .ww-tabs-more');
        if (!more) return;
        // 先全部摆出来量一遍，量完放回原样，再交给 React 按结果收起。
        const was = items.map(item => item.hidden), wasMore = more.hidden;
        for (const item of items) item.hidden = false;
        more.hidden = true;
        let next = [];
        if (element.scrollWidth > element.clientWidth + 0.5) {
          more.hidden = false;
          const style = window.getComputedStyle(element), gap = parseFloat(style.columnGap) || 0;
          const budget = element.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - more.offsetWidth - gap;
          next = fitTabs({ widths: items.map(item => item.offsetWidth), gap, budget, active: items.findIndex(item => item.dataset.navItem === state.tab) }).map(index => items[index].dataset.navItem);
        }
        items.forEach((item, index) => { item.hidden = was[index]; });
        more.hidden = wasMore;
        setTucked(previous => sameList(previous, next) ? previous : next);
      };
      fit();
      const observer = typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(fit) : null;
      if (observer && element.parentElement) observer.observe(element.parentElement);
      return () => observer?.disconnect();
    }, [signature]);
    const tab = id => h('button', { type: 'button', key: id, 'data-tab': tabName(id), 'data-nav-item': id, hidden: hidden.includes(id), disabled: state.busy, 'aria-pressed': state.tab === id, className: state.tab === id ? 'ww-selected' : '', onClick: () => workbench.openTab(id) }, labelOf(byId.get(id)), ...featureIcon(core.metadata(id).icon), attentionDot(marks[id]));
    // 没钉住的那一个：虚线框，上面能直接钉住或关掉；再从全部功能打开别的没钉住的，它就换成新的。
    const temp = id => {
      const name = labelOf(byId.get(id));
      return h('span', { key: id, className: 'ww-tab-temp', 'data-nav-item': id, 'data-current': state.tab === id ? '' : undefined, hidden: hidden.includes(id) },
        h('button', { type: 'button', 'data-tab': tabName(id), disabled: state.busy, 'aria-pressed': state.tab === id, className: state.tab === id ? 'ww-selected' : '', title: t('navTempTitle'), onClick: () => workbench.openTab(id) }, name, ...featureIcon(core.metadata(id).icon), attentionDot(marks[id])),
        h('button', { type: 'button', className: 'ww-tab-mini', 'aria-label': t('navPinName', { name }), title: t('navPin'), onClick: () => core.pinTab(id) }, h(Glyph, { name: 'pin', size: 14 })),
        h('button', { type: 'button', className: 'ww-tab-mini', 'aria-label': t('navCloseTemp'), title: t('navCloseTemp'), disabled: state.busy, onClick: () => core.closeTemp() }, h(Glyph, { name: 'close', size: 13 })));
    };
    return h('nav', { ref: strip, className: 'ww-tabs', 'aria-label': t('panel') },
      ...ids.map(id => id === nav.temp ? temp(id) : tab(id)),
      h('span', { key: 'more', className: 'ww-tabs-more', hidden: hidden.length === 0 },
        h(ActionMenu, { label: t('navMoreHint'), text: [t('navMore'), h('span', { key: 'count', className: 'ww-tabs-count' }, hidden.length), attentionDot(hidden.map(id => marks[id]).find(Boolean))], icon: 'chevron', align: 'start', className: 'ww-tabs-more-trigger' },
          h('p', { className: 'ww-menu-note' }, t('navMoreHint')),
          ...hidden.map(id => h('button', { type: 'button', key: id, disabled: state.busy, onClick: () => workbench.openTab(id) }, labelOf(byId.get(id)), attentionDot(marks[id]))),
          h('hr', { className: 'ww-menu-rule' }),
          h('button', { type: 'button', key: 'arrange', onClick: () => core.openLauncher() }, t('navArrange')))));
  }

  /** “全部功能”：按钮在页签左边，面板从页头下面展开；Ctrl K 打开并直接搜。 */
  /** 要员工回来看的功能没在页头（没钉也不是临时放上去的）时，点标在“全部功能”按钮上。 */
  const offHeadMark = core => {
    const marks = core.attention?.() ?? {}, nav = core.nav(), shown = new Set([...nav.pins, nav.temp]);
    const id = Object.keys(marks).find(key => !shown.has(key) && core.metadata(key).placement !== 'end');
    return id ? marks[id] : null;
  };

  function Launcher({ workbench, state, t, anchor }) {
    const core = workbench.internal, open = Boolean(state.launcher);
    const surface = useRef(null), trigger = useRef(null), field = useRef(null), pressed = useRef(null);
    const [query, setQuery] = useState(''), [selected, setSelected] = useState(0);
    // “钉在页头的”一排换位置：按住小块前面的小点拖到哪放到哪（共用的拖动，见 src/sortable.js）。
    const sortable = useSortable({ order: core.nav().pins, move: (id, index) => core.movePinTo(id, index) });
    const shortcut = mac() ? '⌘ K' : 'Ctrl K';
    // 浏览器自己把面板收起（按 Esc、点别处）时跟着记成关了。
    useClosedPopover(surface, () => core.closeLauncher());
    useEffect(() => {
      if (!open) { setQuery(''); setSelected(0); return; }
      const element = surface.current;
      if (!element) return;
      // 面板贴着页头下沿，和页头一样宽；窗口变了跟着重新摆。
      const place = () => {
        const box = anchor.current?.getBoundingClientRect();
        if (!box) return;
        const top = Math.round(box.bottom + 4);
        Object.assign(element.style, { left: `${Math.round(box.left)}px`, width: `${Math.round(box.width)}px`, top: `${top}px`, maxHeight: `${Math.max(200, window.innerHeight - top - 16)}px` });
      };
      try { element.showPopover(); } catch { /* 已经开着，或宿主不支持浮层。 */ }
      place(); field.current?.focus();
      const observer = typeof window.ResizeObserver === 'function' && anchor.current ? new window.ResizeObserver(place) : null;
      observer?.observe(anchor.current);
      window.addEventListener('resize', place);
      return () => { observer?.disconnect(); window.removeEventListener('resize', place); try { if (element.matches(':popover-open')) element.hidePopover(); } catch { /* 元素已经不在页面上。 */ } };
    }, [open]);
    useEffect(() => {
      const onKey = event => {
        if (!(mac() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) || event.shiftKey || event.altKey || event.key?.toLowerCase() !== 'k') return;
        // 弹窗、抽屉开着时不抢：面板会开在它们后面，点不到。
        if (typeof document.querySelectorAll === 'function' && [...document.querySelectorAll('dialog[open]')].some(dialog => dialog.matches(':modal'))) return;
        event.preventDefault();
        if (open) { field.current?.focus(); field.current?.select?.(); } else core.openLauncher();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open]);
    const close = () => { core.closeLauncher(); trigger.current?.focus(); };
    // 面板开着时点按钮：鼠标一松开浏览器就先把面板收起了，等点击事件到的时候已经是“关着”。所以按下那一刻先记住当时开没开，点击照那时的样子来，开着就收起，不会收了又开。
    const toggle = () => { const was = pressed.current ?? open; pressed.current = null; if (was) core.closeLauncher(); else core.openLauncher(); };
    const groupName = group => t(groupLabels[group] || groupLabels[EXTENSION_GROUP]);
    const items = open ? core.directory().map(item => ({ ...item, groupName: groupName(item.group) })) : [];
    const text = query.trim(), found = text ? searchFeatures(items, text) : null;
    const index = found ? Math.min(selected, Math.max(0, found.list.length - 1)) : 0;
    const marked = (value, terms) => highlightParts(value, terms).map((part, position) => part.hit ? h('mark', { key: position }, part.text) : part.text);
    const onFieldKey = event => {
      if (!found?.list.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSelected((index + (event.key === 'ArrowDown' ? 1 : -1) + found.list.length) % found.list.length); }
      else if (event.key === 'Enter') { event.preventDefault(); workbench.openTab(found.list[index].id); }
    };
    const tile = item => h('div', { key: item.id, className: 'ww-launcher-tile', 'data-pinned': item.pinned || item.fixed ? '' : undefined, 'data-current': state.tab === item.id ? '' : undefined },
      h('button', { type: 'button', className: 'ww-launcher-open', 'data-feature': item.id, disabled: state.busy, onClick: () => workbench.openTab(item.id) },
        h('span', { className: 'ww-launcher-icon' }, ...(item.icon ? featureIcon(item.icon, 20) : [h(Glyph, { key: 'icon', name: 'puzzle', size: 20 })])),
        h('span', { className: 'ww-launcher-text' },
          h('span', { className: 'ww-launcher-name' }, item.name, item.fresh && h('em', { className: 'ww-tag ww-tag-ok' }, t('navNew')), state.tab === item.id && h('em', { className: 'ww-tag' }, t('navViewing'))),
          item.purpose && h('span', { className: 'ww-launcher-purpose' }, item.purpose))),
      item.fixed ? h('span', { className: 'ww-launcher-fixed', title: t('navFixedEnd', { name: item.name }) }, t('navAtEnd'))
        : h('button', { type: 'button', className: 'ww-icon-button ww-launcher-pin-toggle', 'aria-pressed': item.pinned, 'aria-label': t(item.pinned ? 'navUnpinName' : 'navPinName', { name: item.name }), title: t(item.pinned ? 'navUnpinTitle' : 'navPin'), onClick: () => item.pinned ? core.unpinTab(item.id) : core.pinTab(item.id) }, h(Glyph, { name: 'pin', size: 16 })));
    const body = () => {
      if (found) {
        if (!found.list.length) return h('div', { className: 'ww-launcher-empty' }, h('p', null, t('navEmpty', { text })), h('p', null, t('navEmptyHint')));
        // “搜了再挑”用外壳共用的单行列表（和知识积累的快速切换同一套）。
        return h('ul', { className: 'ww-switcher-list ww-launcher-results', role: 'listbox', 'aria-label': t('navResults') }, ...found.list.map((item, position) =>
          h('li', { key: item.id, role: 'option', 'aria-selected': position === index },
            h('button', { type: 'button', 'data-feature': item.id, disabled: state.busy, onClick: () => workbench.openTab(item.id), onMouseEnter: () => setSelected(position) },
              ...(item.icon ? featureIcon(item.icon, 16) : [h(Glyph, { key: 'icon', name: 'puzzle' })]),
              h('span', null, h('strong', null, ...marked(item.name, found.terms)), item.purpose && h('span', { className: 'ww-launcher-result-purpose' }, ...marked(item.purpose, found.terms))),
              h('small', null, [item.groupName, (item.pinned || item.fixed) && t('navOnHeader')].filter(Boolean).join(' · '))))));
      }
      const byId = new Map(items.map(item => [item.id, item]));
      const pins = core.nav().pins.map(id => byId.get(id)).filter(Boolean), fixed = items.filter(item => item.fixed);
      return h(React.Fragment, null,
        h('section', { className: 'ww-launcher-section' },
          h('header', { className: 'ww-launcher-heading' }, h('h3', null, t('navPinned')), h('span', { className: 'ww-launcher-count' }, t('navPinnedCount', { count: pins.length })), h('span', { className: 'ww-launcher-hint' }, t('navPinnedHint'))),
          h('ol', { ...sortable.list, className: 'ww-launcher-pins' },
            ...pins.map((item, position) => h('li', { key: item.id, className: 'ww-launcher-pin', 'data-pin': item.id, ...sortable.item(item.id) },
              sortable.grip(item.id, { label: t('navDragName', { name: item.name }), title: t('navDrag') }),
              h('span', { className: 'ww-launcher-num' }, position + 1), ...featureIcon(item.icon, 15), h('span', null, item.name),
              h('span', { className: 'ww-launcher-pin-actions' },
                h('button', { type: 'button', className: 'ww-icon-button', disabled: pins.length === 1, 'aria-label': t('navUnpinName', { name: item.name }), title: t('navUnpinName', { name: item.name }), onClick: () => core.unpinTab(item.id) }, h(Glyph, { name: 'close', size: 14 }))))),
            ...fixed.map(item => h('li', { key: item.id, className: 'ww-launcher-pin ww-launcher-pin-fixed' }, ...featureIcon(item.icon, 15), h('span', null, t('navFixedEnd', { name: item.name })))))),
        h('div', { className: 'ww-launcher-groups' }, ...[...navGroups, EXTENSION_GROUP].map(group => {
          const list = items.filter(item => item.group === group);
          return list.length > 0 && h('section', { key: group, className: 'ww-launcher-section', 'data-group': group },
            h('header', { className: 'ww-launcher-heading' }, h('h3', null, groupName(group)), h('span', { className: 'ww-launcher-count' }, list.length), group === EXTENSION_GROUP && h('span', { className: 'ww-launcher-hint' }, t('navGroupExtensionHint'))),
            h('div', { className: 'ww-launcher-tiles' }, ...list.map(tile)));
        })));
    };
    return h(React.Fragment, null,
      h('button', { ref: trigger, type: 'button', className: 'ww-launch', 'aria-expanded': open, 'aria-haspopup': 'dialog', title: t('navAllTitle', { key: shortcut }), onPointerDown: () => { pressed.current = open; }, onBlur: () => { pressed.current = null; }, onClick: toggle }, h(Glyph, { name: 'grid', size: 17 }), h('span', null, t('navAll')), attentionDot(offHeadMark(core))),
      h('div', { ref: surface, popover: 'auto', role: 'dialog', 'aria-label': t('navAll'), className: 'ww-launcher', onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); close(); } } }, open && h(React.Fragment, null,
        h('div', { className: 'ww-launcher-top' },
          h('label', { className: 'ww-search ww-launcher-search' }, h(Glyph, { name: 'search' }), h('input', { ref: field, type: 'search', value: query, autoComplete: 'off', placeholder: t('navSearch'), 'aria-label': t('navSearchLabel'), onChange: event => { setQuery(event.target.value); setSelected(0); }, onKeyDown: onFieldKey })),
          h('kbd', { className: 'ww-launcher-kbd' }, shortcut),
          h('button', { type: 'button', className: 'ww-icon-button', 'aria-label': t('closePanel'), onClick: close }, h(Glyph, { name: 'close' }))),
        h('div', { className: 'ww-launcher-list' }, body()),
        h('footer', { className: 'ww-launcher-foot' }, h('span', null, t('navFoot')),
          core.canManageFeatures() && h('button', { type: 'button', onClick: () => { core.closeLauncher(); workbench.manageFeatures(); } }, t('navManage'))))));
  }

  return { NavTabs, Launcher };
}
