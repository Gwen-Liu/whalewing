import { graphLayers } from './graph-canvas.js';

/**
 * 关系图谱的显示设置（2026-11-10）。交互照 Obsidian 的图谱设置，名字和样子是鲸翼自己的：
 * “显示哪些”“按层上色”“样子”“排布”四组。默认什么都画（2026-11-10 用户定“默认全打开、默认全显示”）：
 * 标签、附件、还没建的笔记、没有连线的笔记都画，搜索框是空的、什么都不排除；
 * 颜色组和排布的四个数照发起者第二大脑现在的设置，和 Obsidian 设置里的同名项一一对应。
 */
export const defaultGraphSettings = Object.freeze({
  search: '', tags: true, attachments: true, existingOnly: false, orphans: true,
  groups: Object.freeze(graphLayers.map(layer => Object.freeze({ layer: layer.id, query: layer.prefixes.map(prefix => `path:${prefix.replace(/\/$/, '')}`).join(' OR '), color: layer.color }))),
  arrows: false, textFade: 0, nodeSize: 1, lineSize: 1,
  center: 0.52, repel: 10, link: 1, distance: 250,
});

/** 设置里每个数的范围；读回本机存的设置时按它夹住，界面上的滑块也用它。 */
export const graphSettingRanges = Object.freeze({
  textFade: [-3, 3, 0.1], nodeSize: [0.2, 4, 0.05], lineSize: [0.2, 4, 0.05],
  center: [0, 1, 0.01], repel: [0, 20, 0.1], link: [0, 1, 0.01], distance: [30, 500, 1],
});

const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;

/** 本机存的设置可能缺项、过期或被改坏：缺的按默认补上，数夹在范围里，颜色组只认合法的。 */
export function normalizeGraphSettings(value) {
  const input = value && typeof value === 'object' ? value : {};
  const settings = { ...defaultGraphSettings };
  if (typeof input.search === 'string') settings.search = input.search.slice(0, 300);
  for (const key of ['tags', 'attachments', 'existingOnly', 'orphans', 'arrows']) if (typeof input[key] === 'boolean') settings[key] = input[key];
  for (const [key, [low, high]] of Object.entries(graphSettingRanges)) if (Number.isFinite(input[key])) settings[key] = Math.min(high, Math.max(low, input[key]));
  if (Array.isArray(input.groups)) settings.groups = input.groups.slice(0, 20).map(group => ({ ...(typeof group?.layer === 'string' ? { layer: group.layer } : {}), query: typeof group?.query === 'string' ? group.query.slice(0, 300) : '', color: color(group?.color) || '#8a8f94' }));
  return settings;
}

/**
 * 筛选和颜色组共用的查询：空格隔开的几项都要满足，`OR` 隔开的几段满足一段就行，
 * 前面加 `-` 是排除；`path:` 看路径，`tag:` 看标签（带不带 # 都行），`file:` 看笔记名，其余看笔记名和路径。
 * 空查询返回 null，表示不筛。
 */
export function compileGraphQuery(query) {
  const alternatives = String(query || '').split(/\s+OR\s+/).map(part => part.trim()).filter(Boolean);
  if (!alternatives.length) return null;
  const tests = alternatives.map(part => {
    const tokens = part.match(/\S+/g) || [];
    return node => tokens.every(token => {
      const negate = token.length > 1 && token.startsWith('-');
      const word = (negate ? token.slice(1) : token).toLocaleLowerCase();
      let hit;
      if (word.startsWith('path:')) hit = node.path.toLocaleLowerCase().includes(word.slice(5));
      else if (word.startsWith('tag:')) { const tag = word.slice(4).replace(/^#/, ''); hit = (node.tags || []).some(item => item.toLocaleLowerCase() === tag || item.toLocaleLowerCase().startsWith(`${tag}/`)); }
      else if (word.startsWith('file:')) hit = node.title.toLocaleLowerCase().includes(word.slice(5));
      else hit = `${node.title} ${node.path}`.toLocaleLowerCase().includes(word);
      return negate ? !hit : hit;
    });
  });
  return node => tests.some(test => test(node));
}

/**
 * 按设置把知识服务给的全库图变成要画的图：先按搜索筛笔记，再按开关加上标签和附件、去掉没建的笔记和没有连线的；
 * 连接度按这张图重新数（标签和附件的连线也算），笔记的颜色取第一组对上的颜色组。
 * 标签、附件的建立日期取最早引用它的那篇，生长动画跟着它们一起长出来。
 */
export function buildGraphView(graph, settings) {
  const notes = graph.nodes.filter(node => node.kind === 'note');
  const filter = compileGraphQuery(settings.search);
  const kept = filter ? notes.filter(filter) : notes;
  const excluded = notes.length - kept.length;
  const nodes = new Map(kept.map(node => [node.path, { ...node }]));
  const missing = new Map(graph.nodes.filter(node => node.kind === 'missing').map(node => [node.path, node]));
  const edges = [];
  const seen = new Set();
  const link = (source, target) => { const key = `${source}\n${target}`; if (source === target || seen.has(key)) return; seen.add(key); edges.push({ source, target }); };
  for (const edge of graph.edges) {
    if (!nodes.has(edge.source)) continue;
    if (nodes.has(edge.target)) { link(edge.source, edge.target); continue; }
    const absent = missing.get(edge.target);
    if (absent && !settings.existingOnly) { if (!nodes.has(absent.path)) nodes.set(absent.path, { ...absent }); link(edge.source, absent.path); }
  }
  const earliest = (key, node, created) => { const current = nodes.get(key); if (created && (!current.created || created < current.created)) current.created = created; return current; };
  for (const note of kept) {
    if (settings.tags) for (const tag of note.tags || []) {
      const key = `tag:${tag}`;
      if (!nodes.has(key)) nodes.set(key, { kind: 'tag', path: key, title: `#${tag}`, tag, created: note.created || '' });
      earliest(key, note, note.created); link(note.path, key);
    }
    if (settings.attachments) for (const file of note.attachments || []) {
      const key = `attachment:${file}`;
      if (!nodes.has(key)) nodes.set(key, { kind: 'attachment', path: key, title: file.split('/').at(-1), file, created: note.created || '' });
      earliest(key, note, note.created); link(note.path, key);
    }
  }
  const neighbors = new Map([...nodes.keys()].map(key => [key, new Set()]));
  for (const edge of edges) { neighbors.get(edge.source).add(edge.target); neighbors.get(edge.target).add(edge.source); }
  const list = [];
  for (const node of nodes.values()) {
    const degree = neighbors.get(node.path).size;
    if (!settings.orphans && degree === 0) continue;
    node.degree = degree;
    list.push(node);
  }
  const shown = new Set(list.map(node => node.path));
  return {
    version: 2, nodes: list, edges: edges.filter(edge => shown.has(edge.source) && shown.has(edge.target)),
    total: list.length, offset: 0, truncated: false, omittedEdges: 0, unresolved: graph.unresolved || 0, excluded,
    kinds: { tags: list.some(node => node.kind === 'tag'), attachments: list.some(node => node.kind === 'attachment') },
  };
}

/**
 * 按颜色组给笔记上色：从上往下取第一组对上的，哪组都不是的给空串（画布用次要文字色画成灰点）。标签、附件不归颜色组管。
 * 和要画哪些分开算：只改颜色组时画布只重新上色，不重新排布。legend 只列这张图上用到的组。
 */
export function graphColors(nodes, groups) {
  const tests = groups.map(group => ({ ...group, test: compileGraphQuery(group.query) }));
  const colors = new Map(), used = new Set();
  for (const node of nodes) {
    if (node.kind !== 'note') continue;
    const group = tests.find(item => item.test?.(node));
    colors.set(node.path, group?.color || '');
    if (group) used.add(group);
  }
  return { colors, legend: tests.filter(group => used.has(group)).map(group => ({ layer: group.layer, query: group.query, color: group.color })) };
}
