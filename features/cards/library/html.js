/**
 * 电子书正文是 HTML / XHTML / XML 片段，质量参差（Kindle 转出、手工拼接、不闭合标签都常见）。
 * 这里用宽容的标签扫描建一棵简化树，再转成 Markdown；不执行脚本、不加载外部资源。
 */

const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'image', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'mbp:pagebreak']);
const dropped = new Set(['script', 'style', 'head', 'title', 'noscript', 'template', 'iframe', 'object', 'math', 'button', 'select', 'textarea', 'rt', 'rp']);
const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '', zwj: '', shy: '', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', times: '×', divide: '÷', deg: '°', plusmn: '±', para: '¶', sect: '§', yen: '¥', euro: '€', pound: '£', cent: '¢', frac12: '½', frac14: '¼', frac34: '¾', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', le: '≤', ge: '≥', ne: '≠', asymp: '≈', infin: '∞', minus: '−', prime: '′', Prime: '″', dagger: '†', Dagger: '‡', permil: '‰', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', pi: 'π', sigma: 'σ', mu: 'μ', lambda: 'λ', omega: 'ω', theta: 'θ' };

/** 解码 HTML 实体；未知命名实体原样保留，不猜测。 */
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,15});/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
    }
    return named[body] ?? named[body.toLowerCase()] ?? whole;
  });
}

const attributePattern = /([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
function attributes(text) {
  const result = {};
  for (const match of text.matchAll(attributePattern)) result[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? '');
  return result;
}

/** 宽容地把标记文本建成树：不闭合的标签在遇到外层结束标签时自动收尾，多余的结束标签忽略。 */
export function parseMarkup(source) {
  const root = { tag: '#root', attrs: {}, children: [] }, stack = [root];
  const pattern = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/\s*([a-zA-Z][\w:.-]*)\s*>|<([a-zA-Z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|</g;
  for (const match of source.matchAll(pattern)) {
    const top = stack.at(-1);
    if (match[1] !== undefined) top.children.push(match[1]);
    else if (match[2]) {
      const name = match[2].toLowerCase(), index = stack.findLastIndex(node => node.tag === name);
      if (index > 0) stack.length = index;
    } else if (match[3]) {
      const name = match[3].toLowerCase(), node = { tag: name, attrs: attributes(match[4] || ''), children: [] };
      top.children.push(node);
      if (!match[5] && !voids.has(name)) stack.push(node);
    } else if (match[6] !== undefined) top.children.push(decodeEntities(match[6]));
    else if (match[0] === '<') top.children.push('<');
  }
  return root;
}

export const local = name => name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
export const find = (node, test, out = []) => { if (typeof node !== 'string') { if (test(node)) out.push(node); for (const child of node.children) find(child, test, out); } return out; };
export const textOf = node => typeof node === 'string' ? node : node.children.map(textOf).join('');
export const byTag = (node, tag) => find(node, element => local(element.tag) === tag);
export const firstTag = (node, tag) => byTag(node, tag)[0];

/** Markdown 正文里的普通文字：转义会被误读成格式的字符。 */
export function escapeMarkdown(text) {
  return text.replace(/[\\`*_[\]<>|~]/g, '\\$&');
}
/** 行首的 #、-、+、=、“1.” 会被读成标题、列表或分隔线，原文里出现时转义。 */
export const escapeLineStart = line => line.replace(/^[#=+-]/, '\\$&').replace(/^(\d{1,9})([.)])(\s|$)/, '$1\\$2$3');
const collapse = line => line.replace(/[ \t\u3000]+/g, ' ').trim();
/** 一段纯文字转成 Markdown 段落；段内换行保留为硬换行。 */
export const textParagraph = text => text.split('\n').map(collapse).filter(Boolean).map(line => escapeLineStart(escapeMarkdown(line))).join('  \n');

const blocks = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'figure', 'figcaption', 'center', 'body', 'html', 'nav', 'dl', 'dt', 'dd', 'address', 'hgroup', 'details', 'summary', 'caption', 'fieldset', 'legend', 'poem', 'stanza', 'v', 'epigraph', 'cite', 'annotation', 'text-author', 'subtitle', 'empty-line']);
const headingLevel = tag => /^h[1-6]$/.test(tag) ? Number(tag[1]) : null;

/**
 * 把树转成 Markdown。image(attrs) 返回图片在书里的存储名（找不到返回 null）；
 * 链接只保留公开网页地址，书内跳转只留文字。
 */
export function markupToMarkdown(tree, { image = () => null } = {}) {
  const out = [];
  // 排版软件常把每个字单独加粗（<b>P</b><b>a</b>…），相邻的同类格式先合并。
  const merge = node => {
    if (typeof node === 'string') return node;
    const children = [];
    for (const child of node.children.map(merge)) {
      const last = children.at(-1);
      if (last && typeof last !== 'string' && typeof child !== 'string' && local(child.tag) === local(last.tag) && ['b', 'strong', 'em', 'i'].includes(local(child.tag))) last.children.push(...child.children);
      else children.push(child);
    }
    return { ...node, children };
  };
  const plain = node => typeof node === 'string' ? node : local(node.tag) === 'br' ? ' ' : dropped.has(local(node.tag)) ? '' : node.children.map(plain).join('');
  const wrap = (content, mark) => {
    const lead = content.match(/^\s*/)[0], tail = content.match(/\s*$/)[0], core = content.trim();
    return core ? `${lead}${mark}${core}${mark}${tail}` : content;
  };
  const inline = node => {
    if (typeof node === 'string') return escapeMarkdown(node.replace(/\s+/g, ' '));
    const tag = local(node.tag);
    if (dropped.has(tag)) return '';
    if (tag === 'br') return '\n';
    if (tag === 'img' || tag === 'image') {
      const name = image(node.attrs);
      return name ? `![${escapeMarkdown(collapse(node.attrs.alt || node.attrs.title || ''))}](${name})` : '';
    }
    const content = node.children.map(inline).join('');
    if (!content.trim()) return content;
    if (['strong', 'b'].includes(tag)) return wrap(content, '**');
    if (['em', 'i', 'emphasis'].includes(tag)) return wrap(content, '*');
    if (['del', 's', 'strike', 'strikethrough'].includes(tag)) return wrap(content, '~~');
    if (['code', 'kbd', 'samp', 'tt'].includes(tag)) { const value = textOf(node).replace(/\s+/g, ' '); return value.includes('`') ? `\`\` ${value} \`\`` : `\`${value}\``; }
    if (tag === 'a') {
      const href = node.attrs.href || node.attrs['l:href'] || node.attrs['xlink:href'] || '';
      return /^https?:\/\//i.test(href) && !/[\s()<>]/.test(href) ? `[${content.trim()}](${href})` : content;
    }
    return content;
  };
  const paragraph = text => { const value = text.split('\n').map(collapse).filter(Boolean).map(escapeLineStart).join('  \n'); if (value) out.push(value); };
  // 块内的行内内容先累积，遇到块级元素时冲刷成一个段落。
  const walk = (node, emit) => {
    let buffer = '';
    const flush = () => { if (buffer.trim()) emit(buffer); buffer = ''; };
    for (const child of node.children) {
      if (typeof child === 'string') { buffer += inline(child); continue; }
      const tag = local(child.tag);
      if (dropped.has(tag)) continue;
      const level = headingLevel(tag);
      // 标题只留文字，不带加粗等格式。
      if (level) { flush(); const text = escapeMarkdown(collapse(plain(child))); if (text) out.push(`${'#'.repeat(level)} ${text}`); continue; }
      if (tag === 'pagebreak') { flush(); continue; }
      if (tag === 'hr') { flush(); out.push('---'); continue; }
      if (tag === 'pre') { flush(); const value = textOf(child).replace(/\n$/, ''); if (value.trim()) { const fence = value.includes('```') ? '~~~~' : '```'; out.push(`${fence}\n${value}\n${fence}`); } continue; }
      if (tag === 'ul' || tag === 'ol') { flush(); const lines = list(child, tag === 'ol', ''); if (lines.length) out.push(lines.join('\n')); continue; }
      if (tag === 'li') { flush(); const lines = list({ attrs: {}, children: [child] }, false, ''); if (lines.length) out.push(lines.join('\n')); continue; }
      if (tag === 'blockquote') { flush(); const start = out.length; walk(child, paragraph); const quoted = out.splice(start).join('\n\n'); if (quoted.trim()) out.push(quoted.split('\n').map(line => `> ${line}`).join('\n')); continue; }
      if (tag === 'table') { flush(); table(child); continue; }
      if (blocks.has(tag)) { flush(); walk(child, emit); continue; }
      buffer += inline(child);
    }
    flush();
  };
  // 列表项连成一块；子列表缩进到父项文字起点（“- ”两格、“10. ”四格）。
  const list = (node, ordered, indent) => {
    const lines = [];
    let index = Number(node.attrs?.start) || 1;
    for (const item of node.children) {
      if (typeof item === 'string' || local(item.tag) !== 'li') continue;
      const nested = item.children.filter(child => typeof child !== 'string' && ['ul', 'ol'].includes(local(child.tag)));
      const text = collapse(item.children.filter(child => !nested.includes(child)).map(child => typeof child !== 'string' && blocks.has(local(child.tag)) ? ` ${child.children.map(inline).join('')} ` : inline(child)).join('').replace(/\n/g, ' '));
      const marker = ordered ? `${index++}.` : '-';
      if (text) lines.push(`${indent}${marker} ${text}`);
      for (const child of nested) lines.push(...list(child, local(child.tag) === 'ol', `${indent}${' '.repeat(marker.length + 1)}`));
    }
    return lines;
  };
  const table = node => {
    const rows = byTag(node, 'tr').map(row => row.children.filter(cell => typeof cell !== 'string' && ['td', 'th'].includes(local(cell.tag))).map(cell => collapse(cell.children.map(inline).join('').replace(/\n/g, ' '))));
    const width = Math.max(0, ...rows.map(row => row.length));
    if (!width) return;
    // 单行或单列的“表格”多是排版用的，按段落输出更易读。
    if (rows.length < 2 || width < 2) { for (const row of rows) paragraph(row.join(' ')); return; }
    const line = row => `| ${Array.from({ length: width }, (_, i) => row[i] || ' ').join(' | ')} |`;
    out.push([line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n'));
  };
  walk(merge(tree), paragraph);
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
