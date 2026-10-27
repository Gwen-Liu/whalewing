import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { parseMarkup, markupToMarkdown, byTag, firstTag, textOf, local, textParagraph } from './html.js';
import { decodeBookText, decodeMarkup, utf16Order, textBook, splitMarkdown, splitLong, plainTitle } from './text.js';
import { isZip, openZip, resolvePath } from './zip.js';
import { bookLimits, BookError } from './limits.js';

export { bookLimits, bookExtensions, BookError } from './limits.js';

/**
 * 把各种电子书读成“书名、作者、按章的 Markdown、图片”。只读字节，不访问网络和磁盘。
 * 支持：EPUB、TXT、Markdown、HTML、DOCX、PDF（文字版）、MOBI / AZW3 / PRC、FB2、RTF、CBZ，以及只装一本书的 ZIP。
 */
const fail = message => { throw new BookError(message); };
const drm = '这本书有 DRM 版权加密（多见于电子书商店购买的书），只能在原商店的阅读器里打开，鲸翼无法读取。';
const convert = format => `${format} 格式暂不支持。可以用免费的 Calibre 把它转换成 EPUB 后再导入。`;
const latin1 = new TextDecoder('latin1');
const ascii = (bytes, from, to) => latin1.decode(bytes.subarray(from, to));
const collapse = text => String(text || '').replace(/\s+/g, ' ').trim();
const baseName = filename => collapse(String(filename).split(/[\\/]/).pop().replace(/\.fb2\.zip$/i, '').replace(/\.[^.]+$/, '')) || '未命名';
const natural = new Intl.Collator('zh-CN', { numeric: true }).compare;
const el = (tag, children = [], attrs = {}) => ({ tag, attrs, children });

/** 按文件头判断图片类型；不认识的字节不当图片保存。 */
export function imageType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ['image/jpeg', 'jpg'];
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') return ['image/png', 'png'];
  if (ascii(bytes, 0, 4) === 'GIF8') return ['image/gif', 'gif'];
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return ['image/webp', 'webp'];
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return ['image/bmp', 'bmp'];
  if (ascii(bytes, 4, 12) === 'ftypavif') return ['image/avif', 'avif'];
  if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(ascii(bytes, 0, 1024))) return ['image/svg+xml', 'svg'];
  return null;
}

function imageStore() {
  const list = [], keys = new Map();
  let total = 0, skipped = 0;
  return {
    list, get skipped() { return skipped; },
    add(key, read) {
      if (keys.has(key)) return keys.get(key);
      const bytes = read();
      const type = imageType(bytes);
      if (!type) { keys.set(key, null); return null; }
      if (list.length >= bookLimits.images || bytes.length > bookLimits.image || total + bytes.length > bookLimits.imageBytes) { skipped++; keys.set(key, null); return null; }
      const name = `img-${String(list.length + 1).padStart(4, '0')}.${type[1]}`;
      list.push({ name, mime: type[0], bytes }); total += bytes.length; keys.set(key, name);
      return name;
    },
  };
}
const dataImage = (images, src) => {
  const match = /^data:image\/[\w.+-]+;base64,([\s\S]+)$/i.exec(String(src || '').trim());
  return match ? images.add(`data:${images.list.length}:${match[1].length}:${match[1].slice(0, 64)}`, () => new Uint8Array(Buffer.from(match[1].replace(/\s+/g, ''), 'base64'))) : null;
};
const imageText = markdown => markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#>*_\\\s-]/g, '');
function chapterTitle(markdown, index) {
  const heading = /^#{1,6}[ \t]+(.+)$/m.exec(markdown)?.[1];
  if (heading && plainTitle(heading)) return plainTitle(heading).slice(0, 80);
  const line = markdown.split('\n').map(plainTitle).find(value => value && !value.startsWith('!'));
  return line && line.length <= 40 ? line : `第 ${index + 1} 节`;
}
/** 过长的章先按小标题切，切不开再按篇幅切。 */
function fitChapters(chapters) {
  return chapters.flatMap(chapter => {
    if (chapter.markdown.length <= 90000) return [chapter];
    const parts = splitMarkdown(chapter.markdown, chapter.title).chapters;
    return parts.length > 1 ? parts.flatMap(splitLong) : splitLong(chapter);
  });
}

function epub(zip) {
  if (zip.has('META-INF/rights.xml')) fail(drm);
  const encryption = zip.read('META-INF/encryption.xml');
  // 字体混淆不算 DRM；正文被加密才不能读。
  if (encryption && byTag(parseMarkup(decodeMarkup(encryption)), 'encryptionmethod').some(node => !/idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC/i.test(node.attrs.algorithm || ''))) fail(drm);
  const container = zip.read('META-INF/container.xml');
  let opfPath = container && firstTag(parseMarkup(decodeMarkup(container)), 'rootfile')?.attrs['full-path'];
  if (!opfPath || !zip.has(opfPath)) opfPath = zip.names.find(name => name.toLowerCase().endsWith('.opf'));
  if (!opfPath) fail('EPUB 缺少内容清单（OPF），文件可能已损坏');
  const opf = parseMarkup(decodeMarkup(zip.read(opfPath)));
  const metadata = firstTag(opf, 'metadata') ?? opf;
  const manifest = new Map(byTag(opf, 'item').filter(node => node.attrs.id && node.attrs.href).map(node => [node.attrs.id, { path: resolvePath(opfPath, node.attrs.href), type: (node.attrs['media-type'] || '').toLowerCase(), properties: node.attrs.properties || '' }]));
  const spine = firstTag(opf, 'spine');
  // 目录：文件 → 第一次出现时的标题和层级。
  const toc = new Map();
  const remember = (path, title, depth) => { title = collapse(title); if (path && title && !toc.has(path)) toc.set(path, { title: title.slice(0, 80), depth }); };
  const elements = node => node.children.filter(child => typeof child !== 'string');
  const nav = [...manifest.values()].find(item => /(?:^|\s)nav(?:\s|$)/.test(item.properties));
  const navBytes = nav && zip.read(nav.path);
  if (navBytes) {
    const navs = byTag(parseMarkup(decodeMarkup(navBytes)), 'nav');
    const walk = (node, depth) => {
      for (const child of elements(node)) {
        if (local(child.tag) !== 'li') { walk(child, depth); continue; }
        const label = elements(child).find(item => local(item.tag) !== 'ol' && (local(item.tag) === 'a' || firstTag(item, 'a')));
        const link = label && (local(label.tag) === 'a' ? label : firstTag(label, 'a'));
        if (link) remember(resolvePath(nav.path, link.attrs.href), textOf(link), depth);
        walk(child, depth + 1);
      }
    };
    const list = navs.find(node => /toc/.test(node.attrs['epub:type'] || node.attrs.role || '')) ?? navs[0];
    if (list) walk(list, 1);
  }
  const ncx = manifest.get(spine?.attrs.toc) ?? [...manifest.values()].find(item => item.type === 'application/x-dtbncx+xml');
  const ncxBytes = ncx && zip.read(ncx.path);
  if (ncxBytes) {
    const walk = (node, depth) => {
      for (const child of elements(node)) {
        if (local(child.tag) !== 'navpoint') { walk(child, depth); continue; }
        remember(resolvePath(ncx.path, firstTag(child, 'content')?.attrs.src), textOf(firstTag(child, 'text') ?? el('x')), depth);
        walk(child, depth + 1);
      }
    };
    walk(parseMarkup(decodeMarkup(ncxBytes)), 1);
  }
  const images = imageStore();
  const addImage = (base, attrs) => {
    const href = attrs.src || attrs['xlink:href'] || attrs['l:href'] || attrs.href;
    const inline = dataImage(images, href);
    if (inline) return inline;
    const path = resolvePath(base, href);
    return path && zip.has(path) ? images.add(path, () => zip.read(path)) : null;
  };
  const coverId = byTag(metadata, 'meta').find(node => node.attrs.name === 'cover')?.attrs.content;
  const coverItem = [...manifest.values()].find(item => /(?:^|\s)cover-image(?:\s|$)/.test(item.properties)) ?? manifest.get(coverId);
  const cover = coverItem && /^image\//.test(coverItem.type || 'image/') && zip.has(coverItem.path) ? images.add(coverItem.path, () => zip.read(coverItem.path)) : null;
  const docs = [];
  for (const ref of spine ? byTag(spine, 'itemref') : []) {
    const item = manifest.get(ref.attrs.idref);
    if (!item || item === nav || !/html|xml/.test(item.type || 'html')) continue;
    const raw = zip.read(item.path);
    if (!raw) continue;
    const tree = parseMarkup(decodeMarkup(raw));
    const markdown = markupToMarkdown(firstTag(tree, 'body') ?? tree, { image: attrs => addImage(item.path, attrs) });
    if (markdown) docs.push({ entry: toc.get(item.path), markdown });
  }
  // 第一页只有图片时是封面页，书架上已经显示封面。
  if (docs.length > 1 && !imageText(docs[0].markdown)) docs.shift();
  // 目录没列出的分页（同一章拆成的多个文件、版权页等）和比所选层级更深的小节并到前一章。
  const group = level => {
    const result = [];
    for (const doc of docs) {
      if (toc.size && result.length && !(doc.entry && doc.entry.depth <= level)) { result.at(-1).markdown += `\n\n${doc.markdown}`; continue; }
      result.push({ title: doc.entry?.title || chapterTitle(doc.markdown, result.length), markdown: doc.markdown });
    }
    return result;
  };
  // 分章层级：没有哪章超过约 6 万字的层级里，取章节篇幅中位数最接近 1.2 万字的一层，
  // 既不把小节拆成碎章，也不把整个部分塞进一章。
  const deepest = Math.max(1, ...[...toc.values()].map(entry => entry.depth));
  const enough = Math.min(3, group(deepest).length);
  let best = null;
  for (let level = 1; level <= deepest; level++) {
    const candidate = group(level), lengths = candidate.map(chapter => chapter.markdown.length);
    // 太粗（不到 3 章）或有章超长的层级不选，除非已经是最细一层。
    if ((Math.max(...lengths) > 60000 || candidate.length < enough) && level < deepest) continue;
    const body = lengths.filter(length => length >= 500).sort((a, b) => a - b);
    const distance = Math.abs(Math.log((body[Math.floor(body.length / 2)] ?? lengths[0] ?? 1) / 12000));
    if (!best || distance < best.distance) best = { chapters: candidate, distance };
  }
  let chapters = best?.chapters ?? [];
  // 只有标题的分隔页（“第一部分”）并到下一章开头。
  let carry = '';
  chapters = chapters.flatMap((chapter, index) => {
    if (index < chapters.length - 1 && imageText(chapter.markdown).length < 80 && !/!\[/.test(chapter.markdown)) { carry += `${chapter.markdown}\n\n`; return []; }
    const merged = { title: chapter.title, markdown: carry + chapter.markdown };
    carry = '';
    return [merged];
  });
  const creators = byTag(metadata, 'creator').map(textOf).map(collapse).filter(Boolean);
  return { title: textOf(firstTag(metadata, 'title') ?? el('x')), author: creators.join('、'), language: collapse(textOf(firstTag(metadata, 'language') ?? el('x'))), chapters: fitChapters(chapters), images, cover };
}

function docx(zip) {
  const main = zip.read('word/document.xml');
  if (!main) fail('Word 文档缺少正文');
  const rels = new Map();
  const relBytes = zip.read('word/_rels/document.xml.rels');
  if (relBytes) for (const node of byTag(parseMarkup(decodeMarkup(relBytes)), 'relationship')) if (!/external/i.test(node.attrs.targetmode || '')) rels.set(node.attrs.id, resolvePath('word/document.xml', node.attrs.target));
  const levels = new Map();
  const styleBytes = zip.read('word/styles.xml');
  if (styleBytes) for (const style of byTag(parseMarkup(decodeMarkup(styleBytes)), 'style')) {
    const name = firstTag(style, 'name')?.attrs['w:val'] || '', outline = firstTag(style, 'outlinelvl')?.attrs['w:val'];
    const level = /^(?:title|标题)$/i.test(name) ? 1 : Number(/^(?:heading|标题)\s*(\d)$/i.exec(name)?.[1]) || (outline != null && Number(outline) < 6 ? Number(outline) + 1 : 0);
    if (level) levels.set(style.attrs['w:styleid'], level);
  }
  const child = (node, tag) => node.children.find(item => typeof item !== 'string' && local(item.tag) === tag);
  const flag = (props, tag) => { const node = props && child(props, tag); return Boolean(node) && !/^(?:0|false|off)$/i.test(node.attrs['w:val'] ?? ''); };
  const run = node => {
    const props = child(node, 'rpr'), parts = [];
    for (const item of node.children) {
      if (typeof item === 'string') continue;
      const tag = local(item.tag);
      if (tag === 't') parts.push(textOf(item));
      else if (tag === 'tab') parts.push(' ');
      else if ((tag === 'br' && item.attrs['w:type'] !== 'page') || tag === 'cr') parts.push(el('br'));
      else if (['drawing', 'pict', 'object'].includes(tag)) for (const image of [...byTag(item, 'blip'), ...byTag(item, 'imagedata')]) { const target = rels.get(image.attrs['r:embed'] || image.attrs['r:id']); if (target) parts.push(el('img', [], { src: target })); }
    }
    let result = parts;
    if (flag(props, 'i')) result = [el('em', result)];
    if (flag(props, 'b')) result = [el('strong', result)];
    return result;
  };
  const inline = node => node.children.flatMap(item => {
    if (typeof item === 'string') return [];
    const tag = local(item.tag);
    if (tag === 'r') return run(item);
    if (['del', 'ppr', 'rpr', 'instrtext', 'movefrom'].includes(tag)) return [];
    return inline(item);
  });
  const blocks = node => node.children.flatMap(item => {
    if (typeof item === 'string') return [];
    const tag = local(item.tag);
    if (tag === 'p') {
      const props = child(item, 'ppr');
      const style = props && child(props, 'pstyle')?.attrs['w:val'], outline = props && child(props, 'outlinelvl')?.attrs['w:val'];
      const level = levels.get(style) || (outline != null && Number(outline) < 6 ? Number(outline) + 1 : 0);
      return [el(level ? `h${level}` : props && child(props, 'numpr') ? 'li' : 'p', inline(item))];
    }
    if (tag === 'tbl') return [el('table', byTag(item, 'tr').map(row => el('tr', row.children.filter(cell => typeof cell !== 'string' && local(cell.tag) === 'tc').map(cell => el('td', byTag(cell, 'p').flatMap((paragraph, index) => [...(index ? [el('br')] : []), ...inline(paragraph)]))))))];
    if (['sdt', 'sdtcontent', 'customxml', 'ins', 'smarttag'].includes(tag)) return blocks(item);
    return [];
  });
  const document = parseMarkup(decodeMarkup(main));
  const images = imageStore();
  const markdown = markupToMarkdown(el('body', blocks(firstTag(document, 'body') ?? document)), { image: attrs => zip.has(attrs.src) ? images.add(attrs.src, () => zip.read(attrs.src)) : null });
  const core = zip.read('docProps/core.xml'), props = core ? parseMarkup(decodeMarkup(core)) : el('x');
  const book = splitMarkdown(markdown, collapse(textOf(firstTag(props, 'title') ?? el('x'))));
  return { title: book.title, author: collapse(textOf(firstTag(props, 'creator') ?? el('x'))), chapters: book.chapters, images };
}

function fb2(text) {
  const tree = parseMarkup(text);
  const info = firstTag(tree, 'title-info') ?? el('x');
  const authors = byTag(info, 'author').map(node => collapse(['first-name', 'middle-name', 'last-name'].map(tag => textOf(firstTag(node, tag) ?? el('x'))).join(' ')) || collapse(textOf(firstTag(node, 'nickname') ?? el('x')))).filter(Boolean);
  const binaries = new Map(byTag(tree, 'binary').map(node => [node.attrs.id, node]));
  const images = imageStore();
  const image = attrs => {
    const id = String(attrs['l:href'] || attrs['xlink:href'] || attrs.href || '').replace(/^#/, ''), node = binaries.get(id);
    return node ? images.add(`#${id}`, () => new Uint8Array(Buffer.from(textOf(node).replace(/\s+/g, ''), 'base64'))) : dataImage(images, attrs.src);
  };
  const html = (node, depth) => {
    if (typeof node === 'string') return node;
    const tag = local(node.tag), next = tag === 'section' ? depth + 1 : depth;
    const children = () => node.children.map(item => html(item, next));
    if (tag === 'title') return el(`h${Math.min(6, depth + 1)}`, [collapse(node.children.map(textOf).join(' '))]);
    if (tag === 'subtitle') return el('p', [el('strong', children())]);
    if (tag === 'epigraph' || tag === 'cite') return el('blockquote', children());
    if (tag === 'v' || tag === 'text-author') return el('p', children());
    if (tag === 'empty-line') return el('span');
    if (tag === 'image') return el('img', [], node.attrs);
    return el(['section', 'poem', 'stanza', 'annotation'].includes(tag) ? 'div' : tag, children(), node.attrs);
  };
  const bodies = byTag(tree, 'body');
  const main = bodies.find(body => !body.attrs.name) ?? bodies[0];
  if (!main) fail('FB2 文件里没有正文');
  const sections = main.children.filter(node => typeof node !== 'string' && local(node.tag) === 'section');
  const parts = sections.length ? sections : [main];
  const chapters = parts.map((section, index) => {
    const markdown = markupToMarkdown(el('div', [html(section, 0)]), { image });
    const heading = firstTag(section, 'title');
    return { title: heading ? collapse(heading.children.map(textOf).join(' ')).slice(0, 80) || chapterTitle(markdown, index) : chapterTitle(markdown, index), markdown };
  });
  for (const notes of bodies.filter(body => body !== main)) {
    const markdown = markupToMarkdown(el('div', [html(notes, 0)]), { image });
    if (markdown) chapters.push({ title: '注释', markdown });
  }
  const coverHref = firstTag(firstTag(info, 'coverpage') ?? el('x'), 'image')?.attrs;
  return { title: textOf(firstTag(info, 'book-title') ?? el('x')), author: authors.join('、'), language: collapse(textOf(firstTag(info, 'lang') ?? el('x'))), chapters: fitChapters(chapters), images, cover: coverHref ? image(coverHref) : null };
}

function htmlBook(text, filename) {
  const tree = parseMarkup(text);
  const images = imageStore();
  const markdown = markupToMarkdown(firstTag(tree, 'body') ?? tree, { image: attrs => dataImage(images, attrs.src) });
  const book = splitMarkdown(markdown, collapse(textOf(firstTag(tree, 'title') ?? el('x'))) || baseName(filename));
  return { ...book, images };
}

const codepages = { 936: 'gb18030', 54936: 'gb18030', 950: 'big5', 932: 'shift_jis', 949: 'euc-kr', 1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257', 1258: 'windows-1258', 874: 'windows-874', 65001: 'utf-8', 10000: 'macintosh' };
const ignored = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf', 'object', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'mmathpr', 'fldinst', 'filetbl', 'revtbl', 'pgdsctbl', 'footnote', 'annotation', 'shppict', 'nonshppict', 'shpinst', 'userprops', 'docvar', 'ftnsep', 'ftnsepc', 'aftnsep', 'aftnsepc', 'listtext', 'pntext', 'pntxta', 'pntxtb', 'xe', 'tc', 'bkmkstart', 'bkmkend', 'template', 'operator', 'author', 'title', 'subject']);
const symbols = { par: '\n', line: '\n', sect: '\n', page: '\n', row: '\n', cell: ' ', tab: ' ', emdash: '—', endash: '–', bullet: '•', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', emspace: ' ', enspace: ' ', qmspace: ' ' };

/** RTF 只取正文文字：按 \ansicpg 解码 \'hh，\uN 取 Unicode，跳过字体表、图片等目标组。 */
export function rtfText(bytes) {
  const source = latin1.decode(bytes), out = [], stack = [];
  let state = { skip: false, uc: 1, codepage: 'windows-1252' }, pending = [], skipChars = 0;
  const flush = () => { if (pending.length) { let text; try { text = new TextDecoder(state.codepage).decode(Uint8Array.from(pending)); } catch { text = latin1.decode(Uint8Array.from(pending)); } out.push(text); pending = []; } };
  const emit = text => { if (!state.skip) { flush(); out.push(text); } };
  for (let i = 0; i < source.length;) {
    const char = source[i];
    if (char === '{') { flush(); stack.push({ ...state }); i++; continue; }
    if (char === '}') { flush(); state = stack.pop() ?? state; i++; continue; }
    if (char === '\r' || char === '\n') { i++; continue; }
    if (char !== '\\') { if (skipChars) skipChars--; else if (!state.skip) pending.push(char.charCodeAt(0)); i++; continue; }
    const next = source[i + 1];
    if (next === "'") { const value = parseInt(source.slice(i + 2, i + 4), 16); i += 4; if (skipChars) skipChars--; else if (!state.skip && !Number.isNaN(value)) pending.push(value); continue; }
    if ('\\{}'.includes(next)) { if (skipChars) skipChars--; else if (!state.skip) pending.push(next.charCodeAt(0)); i += 2; continue; }
    if (next === '*') { state.skip = true; i += 2; continue; }
    if (next === '~') { emit(' '); i += 2; continue; }
    if (next === '_') { emit('-'); i += 2; continue; }
    if (next === '\n' || next === '\r') { emit('\n'); i += 2; continue; }
    const match = /^([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(source.slice(i + 1, i + 48));
    if (!match) { i += 2; continue; }
    i += 1 + match[0].length;
    const word = match[1].toLowerCase(), parameter = match[2] === undefined ? null : Number(match[2]);
    if (word === 'bin' && parameter > 0) { i += parameter; continue; }
    if (word === 'ansicpg' && codepages[parameter]) { flush(); state.codepage = codepages[parameter]; continue; }
    if (word === 'uc') { state.uc = parameter ?? 1; continue; }
    if (word === 'u' && parameter !== null) { emit(String.fromCharCode(parameter < 0 ? parameter + 65536 : parameter)); skipChars = state.uc; continue; }
    if (ignored.has(word)) { state.skip = true; continue; }
    if (symbols[word]) emit(symbols[word]);
  }
  flush();
  return out.join('');
}

function palmdoc(data) {
  const out = [];
  for (let i = 0; i < data.length;) {
    const c = data[i++];
    if (c >= 1 && c <= 8) for (let k = 0; k < c && i < data.length; k++) out.push(data[i++]);
    else if (c < 0x80) out.push(c);
    else if (c >= 0xc0) out.push(0x20, c ^ 0x80);
    else if (i < data.length) {
      const pair = (c << 8 | data[i++]) & 0x3fff, distance = pair >> 3, length = (pair & 7) + 3;
      if (!distance || distance > out.length) continue;
      for (let k = 0; k < length; k++) out.push(out[out.length - distance]);
    }
  }
  return Uint8Array.from(out);
}
/** 文本记录末尾的附加数据（索引、多字节续接）不是正文，按标志位逐项去掉。 */
function trailing(data, flags) {
  const entry = end => {
    let result = 0, shift = 0;
    for (let p = end - 1; p >= 0; p--) { const value = data[p]; result |= (value & 0x7f) << shift; shift += 7; if (value & 0x80 || shift >= 28) break; }
    return result;
  };
  let size = 0;
  for (let bits = flags >> 1; bits; bits >>= 1) if (bits & 1) size += entry(data.length - size);
  if (flags & 1 && data.length - size - 1 >= 0) size += (data[data.length - size - 1] & 3) + 1;
  return Math.min(size, data.length);
}

/** MOBI / AZW3 / PRC（Palm 数据库）。KF8 只取正文流，不重排骨架；图片按记录号取出。 */
function palm(bytes, filename) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = ascii(bytes, 60, 68), count = view.getUint16(76);
  if (78 + count * 8 > bytes.length || !count) fail('MOBI 文件头损坏');
  const offsets = Array.from({ length: count }, (_, i) => view.getUint32(78 + i * 8));
  const record = i => i >= 0 && i < count ? bytes.subarray(offsets[i], i + 1 < count ? offsets[i + 1] : bytes.length) : new Uint8Array(0);
  const head = record(0);
  if (head.length < 16) fail('MOBI 文件头损坏');
  const header = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const compression = header.getUint16(0), textRecords = header.getUint16(8), encryption = header.getUint16(12);
  if (encryption) fail(drm);
  if (compression === 17480) fail('这本 MOBI 使用 Kindle 专有压缩（HUFF/CDIC），暂不支持。可以用 Calibre 转换成 EPUB 后再导入。');
  if (![1, 2].includes(compression)) fail('MOBI 压缩方式无法识别，文件可能已损坏');
  const isMobi = type === 'BOOKMOBI' && ascii(head, 16, 20) === 'MOBI';
  const headerLength = isMobi ? header.getUint32(20) : 0;
  const extraFlags = isMobi && headerLength >= 0xe4 && head.length >= 0xf4 ? header.getUint16(0xf2) : 0;
  const chunks = [];
  for (let i = 1; i <= textRecords; i++) {
    const data = record(i), size = data.length - trailing(data, extraFlags);
    chunks.push(compression === 2 ? palmdoc(data.subarray(0, size)) : data.subarray(0, size));
  }
  const raw = Buffer.concat(chunks);
  if (!isMobi) return textBook(decodeBookText(raw), baseName(filename));
  const encoding = header.getUint32(28) === 65001 ? 'utf-8' : 'windows-1252';
  const decode = data => new TextDecoder(encoding).decode(data);
  const exth = new Map();
  if (head.length >= 0x84 && header.getUint32(0x80) & 0x40 && ascii(head, 16 + headerLength, 20 + headerLength) === 'EXTH') {
    let p = 16 + headerLength + 12;
    const total = header.getUint32(16 + headerLength + 8);
    for (let k = 0; k < total && p + 8 <= head.length; k++) {
      const kind = header.getUint32(p), length = header.getUint32(p + 4);
      if (length < 8 || p + length > head.length) break;
      if (!exth.has(kind)) exth.set(kind, []);
      exth.get(kind).push(head.subarray(p + 8, p + length));
      p += length;
    }
  }
  const exthText = kind => (exth.get(kind) ?? []).map(value => collapse(decode(value))).filter(Boolean);
  const nameOffset = header.getUint32(0x54), nameLength = header.getUint32(0x58);
  const fullName = nameOffset + nameLength <= head.length ? collapse(decode(head.subarray(nameOffset, nameOffset + nameLength))) : '';
  const version = header.getUint32(36), firstImage = header.getUint32(0x6c);
  const images = imageStore();
  const resource = index => Number.isInteger(index) && index >= 0 && firstImage !== 0xffffffff ? images.add(`r${index}`, () => record(firstImage + index).slice()) : null;
  let html = decode(raw), pieces;
  if (version >= 8) {
    // KF8：正文是第一个数据流；每个分页文件以 <?xml 或 <html 开头。
    const fdst = head.length >= 0xc4 ? header.getUint32(0xc0) : 0xffffffff, table = fdst !== 0xffffffff ? record(fdst) : null;
    if (table && ascii(table, 0, 4) === 'FDST' && table.length >= 20) {
      const flows = new DataView(table.buffer, table.byteOffset, table.byteLength);
      const start = flows.getUint32(12), end = flows.getUint32(16);
      if (end > start && end <= raw.length) html = decode(raw.subarray(start, end));
    }
    pieces = html.split(/(?=<\?xml|<html[\s>])/i);
  } else pieces = html.split(/<mbp:pagebreak\s*\/?>/i);
  const image = attrs => {
    const embed = /kindle:embed:([0-9a-v]+)/i.exec(attrs.src || attrs['xlink:href'] || '')?.[1];
    if (embed) return resource(parseInt(embed, 32) - 1);
    const index = Number(attrs.recindex || attrs.hirecindex || attrs.lorecindex);
    return index > 0 ? resource(index - 1) : null;
  };
  const chapters = [];
  let carry = '';
  for (const piece of pieces) {
    const markdown = markupToMarkdown(parseMarkup(piece), { image });
    if (!markdown) continue;
    // 分页之间的零碎（扉页、空页）并到下一章开头。
    if (imageText(markdown).length < 60 && !/^#{1,6}\s/m.test(markdown)) { carry += `${markdown}\n\n`; continue; }
    chapters.push({ title: chapterTitle(markdown, chapters.length), markdown: carry + markdown }); carry = '';
  }
  if (carry.trim()) chapters.length ? chapters.at(-1).markdown += `\n\n${carry.trim()}` : chapters.push({ title: '正文', markdown: carry.trim() });
  const cover = exth.get(201)?.[0]?.length >= 4 ? resource(new DataView(exth.get(201)[0].buffer, exth.get(201)[0].byteOffset).getUint32(0)) : null;
  return { title: exthText(503)[0] || fullName || ascii(bytes, 0, 32).replace(/\0.*$/s, ''), author: exthText(100).join('、'), language: exthText(524)[0] || '', chapters: fitChapters(chapters), images, cover };
}

let pdfjs = null;
/** PDF.js 体积大，只在遇到 PDF 时加载；解析器内联运行，不另起 PDF.js 线程。 */
async function loadPdfjs() {
  if (!pdfjs) {
    const [main, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.mjs')]);
    globalThis.pdfjsWorker = { WorkerMessageHandler: worker.WorkerMessageHandler };
    pdfjs = main;
  }
  return pdfjs;
}
/** PDF 只提取文字：有书签按书签分章，没有就每 10 页一章；页眉页脚和页码按重复规律去掉。 */
async function pdf(bytes, filename) {
  const { getDocument } = await loadPdfjs();
  const assets = new URL('./', import.meta.resolve('pdfjs-dist/package.json'));
  let document;
  try {
    document = await getDocument({ data: bytes, cMapUrl: fileURLToPath(new URL('cmaps/', assets)), cMapPacked: true, standardFontDataUrl: fileURLToPath(new URL('standard_fonts/', assets)), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  } catch (error) {
    if (error?.name === 'PasswordException') fail('这本 PDF 设置了打开密码，请先在 PDF 阅读器里去掉密码再导入');
    fail('PDF 文件已损坏或无法解析');
  }
  try {
    const pages = document.numPages;
    if (pages > bookLimits.pdfPages) fail(`PDF 超过 ${bookLimits.pdfPages} 页`);
    const lines = [];
    for (let number = 1; number <= pages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const pageLines = [];
      let current = null;
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        const x = item.transform[4], y = item.transform[5], size = Math.abs(item.transform[3]) || item.height || 10;
        if (current && Math.abs(y - current.y) > size * 0.5 && current.text.trim()) { pageLines.push(current); current = null; }
        if (!current) current = { text: '', x, y, size };
        current.text += item.str;
        if (item.hasEOL) { if (current.text.trim()) pageLines.push(current); current = null; }
      }
      if (current?.text.trim()) pageLines.push(current);
      const left = Math.min(...pageLines.map(line => line.x));
      pageLines.forEach((line, index) => lines.push({ page: number - 1, text: collapse(line.text), indent: line.x - left > line.size * 1.2, edge: index === 0 || index === pageLines.length - 1 }));
      page.cleanup();
    }
    const total = lines.reduce((sum, line) => sum + line.text.length, 0);
    if (total < pages * 25) fail('这本 PDF 是扫描图片，没有可提取的文字；暂不支持识别图片里的文字（OCR）。');
    // 页眉页脚：每页第一行或最后一行，是页码，或是在两成以上页面重复出现的短行（数字视为相同）。
    const shape = text => text.replace(/\d+/g, '#');
    const repeats = new Map();
    for (const line of lines) if (line.edge && line.text.length <= 30) repeats.set(shape(line.text), (repeats.get(shape(line.text)) ?? 0) + 1);
    const body = lines.filter(line => !(line.edge && (/^[-—–\s]*(?:第\s*)?\d+\s*(?:页|\/\s*\d+)?[-—–\s]*$/.test(line.text) || pages >= 6 && line.text.length <= 30 && repeats.get(shape(line.text)) >= pages * 0.2)));
    const lengths = body.map(line => line.text.length).filter(length => length > 5).sort((a, b) => a - b);
    const typical = lengths[Math.floor(lengths.length * 0.6)] || 30;
    const paragraphs = range => {
      const result = [];
      let current = '';
      for (const line of body.filter(item => range(item.page))) {
        if (current && line.indent) { result.push(current); current = ''; }
        current = !current ? line.text : current.endsWith('-') && /^[a-z]/.test(line.text) ? current.slice(0, -1) + line.text : /[⺀-鿿＀-￯]$/.test(current) || /^[⺀-鿿＀-￯]/.test(line.text) ? current + line.text : `${current} ${line.text}`;
        if (line.text.length < typical * 0.75) { result.push(current); current = ''; }
      }
      if (current) result.push(current);
      return result;
    };
    const pageOf = async destination => {
      try {
        const target = typeof destination === 'string' ? await document.getDestination(destination) : destination;
        if (!Array.isArray(target)) return null;
        return typeof target[0] === 'number' ? target[0] : await document.getPageIndex(target[0]);
      } catch { return null; }
    };
    let outline = (await document.getOutline().catch(() => null)) ?? [];
    if (outline.length === 1 && outline[0].items?.length >= 2) outline = outline[0].items;
    const marks = [];
    for (const item of outline.slice(0, 2000)) { const page = await pageOf(item.dest); if (Number.isInteger(page) && page >= 0 && page < pages && !marks.some(mark => mark.page === page)) marks.push({ title: collapse(item.title).slice(0, 80), page }); }
    marks.sort((a, b) => a.page - b.page);
    const ranges = [];
    if (marks.length >= 2) {
      if (marks[0].page > 0) ranges.push({ title: '开篇', from: 0, to: marks[0].page });
      marks.forEach((mark, index) => ranges.push({ title: mark.title || `第 ${index + 1} 章`, from: mark.page, to: marks[index + 1]?.page ?? pages }));
    } else for (let from = 0; from < pages; from += 10) ranges.push({ title: `第 ${from + 1}–${Math.min(pages, from + 10)} 页`, from, to: Math.min(pages, from + 10) });
    const chapters = ranges.map(range => ({ title: range.title || '正文', markdown: [`## ${textParagraph(range.title)}`, ...paragraphs(page => page >= range.from && page < range.to).map(textParagraph)].filter(Boolean).join('\n\n') })).filter(chapter => chapter.markdown.includes('\n\n'));
    const info = (await document.getMetadata().catch(() => null))?.info ?? {};
    return { title: collapse(info.Title), author: collapse(info.Author), chapters: fitChapters(chapters), images: imageStore() };
  } finally { await document.destroy(); }
}

function comic(zip, filename) {
  const names = zip.names.filter(name => /\.(?:jpe?g|png|gif|webp|bmp|avif)$/i.test(name) && !/(?:^|\/)(?:__MACOSX|\.)/.test(name)).sort(natural);
  if (!names.length) return null;
  const images = imageStore(), chapters = [];
  for (let start = 0; start < names.length; start += 20) {
    const markdown = names.slice(start, start + 20).map(name => images.add(name, () => zip.read(name))).filter(Boolean).map(name => `![](${name})`).join('\n\n');
    if (markdown) chapters.push({ title: `第 ${start + 1}–${Math.min(names.length, start + 20)} 页`, markdown });
  }
  return { title: baseName(filename), chapters, images, cover: images.list[0]?.name ?? null };
}

async function archive(bytes, filename, depth) {
  const zip = openZip(bytes, fail);
  const mimetype = collapse(latin1.decode(zip.read('mimetype') ?? new Uint8Array(0)));
  if (/epub/i.test(mimetype) || zip.has('META-INF/container.xml')) return ['EPUB', epub(zip)];
  if (zip.has('word/document.xml')) return ['DOCX', docx(zip)];
  if (/opendocument\.text/i.test(mimetype)) fail('ODT 文档请先用 WPS 或 Word 另存为 DOCX 再导入');
  if (zip.has('xl/workbook.xml') || zip.has('ppt/presentation.xml')) fail('这是表格或演示文稿，不是电子书');
  const fb2Name = zip.names.filter(name => /\.fb2$/i.test(name));
  if (fb2Name.length === 1) return ['FB2', fb2(decodeMarkup(zip.read(fb2Name[0])))];
  const books = zip.names.filter(name => !/(?:^|\/)__MACOSX\//.test(name) && /\.(?:epub|kepub|txt|md|markdown|html?|xhtml|docx|pdf|mobi|azw3?|prc|fb2|rtf)$/i.test(name));
  if (depth === 0 && books.length === 1) return parseFormat(zip.read(books[0]), books[0], 1);
  if (books.length > 1) fail(`压缩包里有 ${books.length} 个书籍文件，请解压后逐本导入`);
  const pictures = comic(zip, filename);
  if (pictures) return ['CBZ', pictures];
  fail('压缩包里没有找到可识别的电子书');
}

async function parseFormat(bytes, filename, depth = 0) {
  if (!bytes.length) fail('文件是空的');
  if (bytes.length > bookLimits.file) fail(`电子书超过 ${bookLimits.file / 1024 ** 2} MiB`);
  const extension = /\.fb2\.zip$/i.test(filename) ? 'fbz' : String(filename).split('.').pop().toLowerCase();
  const head = ascii(bytes, 0, 1024);
  if (head.includes('%PDF-')) return ['PDF', await pdf(bytes, filename)];
  if (bytes.length > 78 && ['BOOKMOBI', 'TEXtREAd'].includes(ascii(bytes, 60, 68))) return [extension === 'azw3' ? 'AZW3' : extension === 'prc' || extension === 'pdb' ? extension.toUpperCase() : 'MOBI', palm(bytes, filename)];
  if (isZip(bytes)) return archive(bytes, filename, depth);
  if (head.startsWith('{\\rtf')) return ['RTF', textBook(rtfText(bytes), baseName(filename))];
  if (head.startsWith('ITSF')) fail(convert('CHM'));
  if (head.startsWith('AT&TFORM')) fail(convert('DjVu'));
  if (head.startsWith('ITOLITLS')) fail(convert('LIT'));
  if (head.startsWith('CONT') || extension === 'kfx') fail('KFX 是亚马逊 Kindle 的专有格式，通常带 DRM，鲸翼无法读取。');
  if (bytes[0] === 0x89 && bytes[1] === 0x9b && bytes[2] === 0x9a && bytes[3] === 0xde) fail(convert('UMD'));
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) fail('旧版 Word 文档（.doc）请先用 WPS 或 Word 另存为 DOCX 再导入');
  if (head.startsWith('Rar!') || head.startsWith('7z\xbc\xaf') || bytes[0] === 0x1f && bytes[1] === 0x8b) fail('RAR、7z、gz 压缩包请先解压，再导入里面的电子书');
  if (imageType(bytes)) fail('这是一张图片，不是电子书');
  // 二进制文件里控制字符很多；UTF-16 的零字节是编码本身，不算。
  const sample = bytes.subarray(0, 65536);
  let control = 0;
  if (!utf16Order(bytes)) for (const value of sample) if (value < 9 || value > 13 && value < 32 && value !== 27) control++;
  const text = control > sample.length * 0.01 ? null : decodeMarkup(bytes);
  if (text === null || text.slice(0, 65536).split('\ufffd').length > 200) fail(`无法识别 .${extension} 文件的格式。支持 EPUB、TXT、PDF、MOBI、AZW3、DOCX、FB2、RTF、HTML、Markdown 和 CBZ。`);
  if (/<FictionBook[\s>]/.test(text.slice(0, 4096))) return ['FB2', fb2(text)];
  if (['md', 'markdown', 'mdown', 'mkd'].includes(extension)) return ['Markdown', splitMarkdown(text, baseName(filename))];
  if (['html', 'htm', 'xhtml'].includes(extension) || /^\s*(?:<\?xml[^>]*>\s*)?(?:<!DOCTYPE html|<html[\s>])/i.test(text.slice(0, 2048))) return ['HTML', htmlBook(text, filename)];
  return ['TXT', textBook(text, baseName(filename))];
}

/** 解析入口：返回统一的书籍结构，章节为空或超限时给出说明。 */
export async function parseBook(bytes, filename) {
  const [format, book] = await parseFormat(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), String(filename || '未命名'));
  const chapters = book.chapters.filter(chapter => chapter.markdown.trim()).map((chapter, index) => ({ title: collapse(chapter.title).slice(0, 120) || `第 ${index + 1} 节`, markdown: chapter.markdown.trim() }));
  if (!chapters.length) fail('没有读出正文内容，文件可能是空的、加密的或扫描图片');
  if (chapters.length > bookLimits.chapters) fail(`章节超过 ${bookLimits.chapters} 个`);
  if (chapters.reduce((sum, chapter) => sum + chapter.markdown.length, 0) > bookLimits.text) fail('正文超过 8000 万字，请拆分后导入');
  const images = book.images?.list ?? [];
  const used = new Set(chapters.flatMap(chapter => [...chapter.markdown.matchAll(/!\[[^\]]*\]\((img-\d{4}\.\w+)\)/g)].map(match => match[1])));
  if (book.cover) used.add(book.cover);
  return {
    format, title: collapse(book.title).slice(0, 200) || baseName(filename), author: collapse(book.author).slice(0, 200), language: collapse(book.language).slice(0, 35),
    chapters, images: images.filter(image => used.has(image.name)), cover: book.cover || null, skippedImages: book.images?.skipped ?? 0,
  };
}
