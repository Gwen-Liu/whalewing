import { graphSettingRanges } from '../../src/graph-view.js';

/**
 * 关系图谱的设置面板（2026-11-10）。能调的东西参照 Obsidian 的图谱设置，名字和样子是鲸翼自己的：
 * 四组“显示哪些”“按层上色”“样子”“排布”，开关是鲸翼的胶囊（按下就是开着），颜色、边框、字都用鲸翼和 DSH 的变量。
 * 面板浮在图的右上角，不挤动图；改了马上生效，筛选框停手 0.3 秒后才生效（每敲一个字都重排太费）。
 */
export function createGraphSettings(kit) {
  const { React, Glyph } = kit;
  const { createElement: h, useState, useEffect } = React;
  const digits = (key, value) => key === 'distance' ? String(Math.round(value)) : Number(value).toFixed(2);

  return function GraphSettings({ settings, onChange, onReset, onClose, t }) {
    const [open, setOpen] = useState({ show: true, color: true, look: true, layout: true });
    const [search, setSearch] = useState(settings.search);
    useEffect(() => { setSearch(settings.search); }, [settings.search]);
    useEffect(() => {
      if (search === settings.search) return undefined;
      const timer = setTimeout(() => onChange({ search }), 300);
      return () => clearTimeout(timer);
    }, [search]);
    // inverted：“还没建的笔记”开着表示画出来，对应设置里的 existingOnly 为假。
    const chip = (key, label, inverted = false) => {
      const on = inverted ? !settings[key] : settings[key];
      return h('button', { key, type: 'button', className: 'ww-chip', 'aria-pressed': on, onClick: () => onChange({ [key]: inverted ? on : !on }) }, label);
    };
    const slider = (key, label) => {
      const [min, max, step] = graphSettingRanges[key];
      return h('label', { key, className: 'ww-graph-slider' }, h('span', null, label),
        h('input', { type: 'range', min, max, step, value: settings[key], onChange: event => onChange({ [key]: Number(event.target.value) }) }),
        h('output', null, digits(key, settings[key])));
    };
    const section = (id, title, body) => h('section', { key: id, className: 'ww-graph-section' },
      h('button', { type: 'button', className: 'ww-graph-section-head', 'aria-expanded': open[id], onClick: () => setOpen(value => ({ ...value, [id]: !value[id] })) },
        h('span', { className: open[id] ? 'ww-folder-chevron ww-expanded' : 'ww-folder-chevron' }, h(Glyph, { name: 'chevron', size: 12 })), title),
      open[id] && h('div', { className: 'ww-graph-section-body' }, ...body));
    const groups = settings.groups;
    const setGroup = (i, patch) => onChange({ groups: groups.map((group, j) => j === i ? { ...group, ...patch } : group) });
    return h('aside', { className: 'ww-graph-settings', 'aria-label': t('graphSettings') },
      h('header', null, h('h3', null, t('graphSettings')),
        h('button', { type: 'button', className: 'ww-ghost', onClick: onReset }, t('graphSettingsReset')),
        h('button', { type: 'button', className: 'ww-graph-close', 'aria-label': t('closePanel'), onClick: onClose }, h(Glyph, { name: 'close', size: 14 }))),
      section('show', t('graphShow'), [
        h('label', { key: 'filter', className: 'ww-search ww-graph-filter' }, h(Glyph, { name: 'search', size: 14 }),
          h('input', { value: search, placeholder: t('graphFilterPlaceholder'), title: t('graphFilterHelp'), 'aria-label': t('graphFilter'), spellCheck: false, onChange: event => setSearch(event.target.value) })),
        h('div', { key: 'chips', className: 'ww-graph-chips' }, chip('tags', t('graphTags')), chip('attachments', t('graphAttachments')), chip('existingOnly', t('graphMissing'), true), chip('orphans', t('graphOrphans'))),
      ]),
      section('color', t('graphColors'), [
        ...groups.map((group, i) => h('div', { key: `group-${i}`, className: 'ww-graph-group' },
          h('input', { type: 'color', value: group.color, 'aria-label': t('graphGroupColor', { index: i + 1 }), onChange: event => setGroup(i, { color: event.target.value }) }),
          h('input', { value: group.query, placeholder: 'path:40-知识', 'aria-label': t('graphGroupQuery', { index: i + 1 }), spellCheck: false, onChange: event => setGroup(i, { query: event.target.value, layer: undefined }) }),
          h('button', { type: 'button', className: 'ww-graph-close', 'aria-label': t('graphGroupRemove', { index: i + 1 }), onClick: () => onChange({ groups: groups.filter((_, j) => j !== i) }) }, h(Glyph, { name: 'close', size: 12 })))),
        h('button', { key: 'add', type: 'button', className: 'ww-ghost ww-graph-add', onClick: () => onChange({ groups: [...groups, { query: '', color: '#d6409f' }] }) }, h(Glyph, { name: 'plus', size: 13 }), t('graphGroupAdd')),
      ]),
      section('look', t('graphLook'), [
        slider('nodeSize', t('graphNodeSize')), slider('lineSize', t('graphLineSize')), slider('textFade', t('graphTextFade')),
        h('div', { key: 'arrows', className: 'ww-graph-chips' }, chip('arrows', t('graphArrows'))),
      ]),
      section('layout', t('graphLayout'), [slider('center', t('graphCenter')), slider('repel', t('graphRepel')), slider('link', t('graphLink')), slider('distance', t('graphDistance'))]),
    );
  };
}
