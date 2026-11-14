/**
 * 书里划线的定位（2026-11-14）。不改正文的 DOM：正文是 React 渲染的，往里插标记会和它打架。
 * 只算出每条划线在正文里的范围，交给浏览器的自定义高亮（CSS Custom Highlight API）去画底色。
 * 划线按“原文 + 前面紧挨着的几个字”认位置，不记字符偏移：插图载入、字号变化都不影响。
 */
const skipped = '.ww-book-image-missing, .ww-book-image-wait';
export const markNames = Object.freeze({ plain: 'ww-book-mark', noted: 'ww-book-mark-noted' });

/** 正文里的文字节点，按顺序；图片读取失败时显示的替代文字不算正文。 */
export function textNodes(root) {
  const nodes = [], walker = root.ownerDocument.createTreeWalker(root, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.data && !node.parentElement?.closest(skipped)) nodes.push(node);
  return nodes;
}

/** 把文字节点接成一整段，并记下每个节点从第几个字开始。 */
export function flowOf(root) {
  const nodes = textNodes(root), starts = [];
  let text = '';
  for (const node of nodes) { starts.push(text.length); text += node.data; }
  return { nodes, starts, text };
}

/** 这条划线在正文里从第几个字开始；同一句出现几次时挑前面几个字对得上的那一处，都对不上用第一处；找不到返回 -1。 */
export function locate(text, { text: wanted, before = '' }) {
  let first = -1;
  for (let at = text.indexOf(wanted); at >= 0; at = text.indexOf(wanted, at + 1)) {
    if (first < 0) first = at;
    if (!before || text.slice(Math.max(0, at - before.length), at) === before) return at;
  }
  return first;
}

const pointAt = (flow, offset, end) => {
  // 起点落在节点开头时归后一个节点，终点落在节点末尾时归前一个节点，范围不带上相邻的空节点。
  let index = flow.starts.findLastIndex(start => end ? start < offset : start <= offset);
  if (index < 0) index = 0;
  return [flow.nodes[index], Math.min(offset - flow.starts[index], flow.nodes[index].data.length)];
};

/** 每条划线在这一章里的范围；这一章里找不到的（书换过版本）不画。 */
export function locateAll(flow, highlights) {
  const found = [];
  for (const highlight of highlights) {
    const start = locate(flow.text, highlight);
    if (start < 0 || !flow.nodes.length) continue;
    const end = start + highlight.text.length, range = flow.nodes[0].ownerDocument.createRange();
    range.setStart(...pointAt(flow, start, false)); range.setEnd(...pointAt(flow, end, true));
    found.push({ id: highlight.id, noted: Boolean(highlight.note), start, end, range });
  }
  return found;
}

/** 范围的一头落在正文里第几个字。 */
export function offsetOf(flow, container, offset) {
  const index = flow.nodes.indexOf(container);
  if (index >= 0) return flow.starts[index] + Math.min(offset, container.data.length);
  // 落在元素上（比如选到段落边上）：数它前面有多少字。
  const probe = container.ownerDocument.createRange();
  probe.setStart(container, offset); probe.collapse(true);
  let total = 0;
  for (const [at, node] of flow.nodes.entries()) { if (probe.comparePoint(node, node.data.length) > 0) total = flow.starts[at] + node.data.length; else break; }
  return total;
}

/**
 * 员工选中的那一段：两头都在正文里才算，前后的空白去掉。
 * 返回 { text, before, start, end }；没选中、选到正文外面或只剩空白时返回 null。
 */
export function selectionIn(root, selection, flow = flowOf(root), beforeLength = 24) {
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  let start = offsetOf(flow, range.startContainer, range.startOffset), end = offsetOf(flow, range.endContainer, range.endOffset);
  while (start < end && /\s/.test(flow.text[start])) start += 1;
  while (end > start && /\s/.test(flow.text[end - 1])) end -= 1;
  if (end - start < 2) return null;
  return { text: flow.text.slice(start, end), before: flow.text.slice(Math.max(0, start - beforeLength), start), start, end };
}

/** 浏览器能不能画自定义高亮。 */
export const canPaint = view => Boolean(view?.CSS?.highlights && typeof view.Highlight === 'function');

/** 把这一章的划线画出来：写了话的那些另用一种样式（带下划线）。画不了时什么都不做。 */
export function paint(view, entries) {
  if (!canPaint(view)) return false;
  for (const [name, noted] of [[markNames.plain, false], [markNames.noted, true]]) {
    const ranges = entries.filter(entry => entry.noted === noted).map(entry => entry.range);
    if (ranges.length) view.CSS.highlights.set(name, new view.Highlight(...ranges)); else view.CSS.highlights.delete(name);
  }
  return true;
}

export function unpaint(view) { if (canPaint(view)) for (const name of Object.values(markNames)) view.CSS.highlights.delete(name); }

/** 点在哪条划线上：把点击位置换成正文里第几个字，再看落在谁的范围里。 */
export function hitAt(root, flow, entries, x, y) {
  const doc = root.ownerDocument;
  let container, offset;
  if (typeof doc.caretPositionFromPoint === 'function') { const position = doc.caretPositionFromPoint(x, y); container = position?.offsetNode; offset = position?.offset; }
  else if (typeof doc.caretRangeFromPoint === 'function') { const range = doc.caretRangeFromPoint(x, y); container = range?.startContainer; offset = range?.startOffset; }
  if (!container || !root.contains(container)) return null;
  const at = offsetOf(flow, container, offset);
  return entries.find(entry => at >= entry.start && at <= entry.end) ?? null;
}
