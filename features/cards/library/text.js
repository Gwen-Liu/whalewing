import { textParagraph } from './html.js';

const decoders = new Map();
const decoder = label => { if (!decoders.has(label)) decoders.set(label, new TextDecoder(label)); return decoders.get(label); };
// 简繁两种写法的高频字。解码对了的中文里大量出现，解码错了的乱码里几乎没有。
const common = new Set('的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感這們個來時為說國後會對學麼還發當沒現點裡過讓開問種樣從無兒於書與門長見');
const score = text => { let hits = 0; const sample = text.slice(0, 20000); for (const char of sample) if (common.has(char)) hits++; return hits; };

// 正常文字：空白、拉丁字母与标点、西里尔、通用标点、中日韩标点与假名、汉字、韩文、全角字符。
const readable = code => code === 9 || code === 10 || code === 13 || code >= 0x20 && code < 0x7f || code >= 0xa0 && code < 0x530 || code >= 0x2000 && code < 0x2070 || code >= 0x3000 && code < 0x3100 || code >= 0x4e00 && code < 0xa000 || code >= 0xac00 && code < 0xd7a4 || code >= 0xff00 && code < 0xfff0;
/**
 * UTF-16：有 BOM 按 BOM。没有 BOM 时，UTF-8 和 GBK 文本里不会有零字节；有零字节就分别按小端、大端试解，
 * 九成以上是正常文字的才算（常用字“一”“需”本身含零字节，不能只看零字节在奇数位还是偶数位）。
 */
export function utf16Order(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  const sample = bytes.subarray(0, Math.min(bytes.length, 65536) & ~1);
  let zeros = 0;
  for (const value of sample) if (!value) zeros++;
  if (zeros < 4 || zeros < sample.length / 200) return null;
  let best = null;
  for (const order of ['utf-16le', 'utf-16be']) {
    const text = decoder(order).decode(sample);
    let good = 0, total = 0;
    for (const char of text) { total++; if (readable(char.codePointAt(0))) good++; }
    const ratio = good / Math.max(1, total);
    if (ratio > 0.9 && (!best || ratio > best.ratio)) best = { order, ratio };
  }
  return best?.order ?? null;
}

/** 纯文本的编码：BOM → 严格 UTF-8 → UTF-16 → GB18030 与 Big5 里常用字多的一个。 */
export function decodeBookText(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return decoder('utf-8').decode(bytes.subarray(3));
  const order = utf16Order(bytes);
  const bom = bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0xfe && bytes[1] === 0xff;
  if (order) return decoder(order).decode(bytes.subarray(bom ? 2 : 0));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* 继续判断 */ }
  // 截断或夹杂个别坏字节的 UTF-8：坏字节极少时仍按 UTF-8 读。
  const head = decoder('utf-8').decode(bytes.subarray(0, 262144));
  const bad = head.split('\ufffd').length - 1;
  if (bad <= Math.max(2, head.length / 2000)) return decoder('utf-8').decode(bytes);
  const gb = decoder('gb18030').decode(bytes), big5 = decoder('big5').decode(bytes.subarray(0, 65536));
  return score(big5) > score(gb) * 1.5 ? decoder('big5').decode(bytes) : gb;
}

/** HTML / XML 的编码：BOM → 文件头声明的 charset / encoding → 按纯文本判断。 */
export function decodeMarkup(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf || bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0xfe && bytes[1] === 0xff) return decodeBookText(bytes);
  const head = decoder('latin1').decode(bytes.subarray(0, 2048));
  const declared = /<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i.exec(head)?.[1] || /<meta[^>]*charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1];
  if (declared && !/^utf-?8$/i.test(declared)) {
    const label = /^(gb2312|gbk|x-gbk|cp936|euc-cn)$/i.test(declared) ? 'gb18030' : declared.toLowerCase();
    try { return decoder(label).decode(bytes); } catch { /* 声明了不认识的编码，退回判断 */ }
  }
  return decodeBookText(bytes);
}

const numeral = '0-9０-９零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟';
const chapterPattern = new RegExp([
  `^第\\s*[${numeral}]+\\s*[章节回卷集部篇幕話话](?:$|[\\s：:、.．·—-])`,
  '^(?:序章|序言|序幕|序|楔子|引子|引言|前言|导言|導言|后记|後記|尾声|尾聲|番外|附录|附錄|终章|終章|自序|跋|结语|結語|致谢|致謝)(?:$|[\\s：:、·—-])',
  `^卷\\s*[${numeral}]+(?:$|[\\s：:、·—-])`,
  '^(?:chapter|part|book)\\s+(?:\\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\\b',
  '^(?:prologue|epilogue|preface|introduction|afterword|appendix)\\b',
].join('|'), 'i');
const isChapterLine = line => line.length <= 50 && chapterPattern.test(line);
const terminal = /[。！？!?.…”」』"'）)】：:]$/;
const cjk = /[⺀-鿿豈-﫿＀-￯]/;

/** 段落：硬换行排版（多数行停在句中、段间空行）时把行连起来，否则一行一段。 */
function paragraphs(lines) {
  const filled = lines.map(line => line.trim()).filter(Boolean);
  const blanks = lines.length - filled.length;
  const wrapped = filled.length > 20 && blanks > filled.length * 0.1 && filled.filter(line => terminal.test(line)).length < filled.length * 0.5;
  if (!wrapped) return filled;
  const result = [];
  let current = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (current) result.push(current); current = ''; continue; }
    if (!current) current = line;
    else if (current.endsWith('-') && /^[a-z]/.test(line)) current = current.slice(0, -1) + line;
    else current += cjk.test(current.at(-1)) && cjk.test(line[0]) ? line : ` ${line}`;
  }
  if (current) result.push(current);
  return result;
}

const chapterChars = 60000;
/** 没有章节标题、或单章过长时按段落切成大小适中的部分。 */
function chunk(title, items, size = chapterChars) {
  const parts = [];
  let current = [], length = 0;
  for (const item of items) {
    if (length && length + item.length > size) { parts.push(current); current = []; length = 0; }
    current.push(item); length += item.length;
  }
  if (current.length) parts.push(current);
  return parts.map((part, index) => ({ title: parts.length > 1 ? `${title}（${index + 1}）` : title, items: part }));
}

/** TXT：识别“第X章”“Chapter N”等标题分章；识别不到就按篇幅分成若干部分。 */
export function textBook(text, fallbackTitle) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').split('\n');
  const marks = [];
  lines.forEach((line, index) => { if (isChapterLine(line.trim())) marks.push(index); });
  const sections = [];
  let lead = [];
  if (marks.length >= 2) {
    // 第一章之前的文字：较长时单成“开篇”，只有书名、作者几行时放在第一章开头，都不丢。
    const preface = paragraphs(lines.slice(0, marks[0]));
    if (preface.join('').length > 30) sections.push({ title: '开篇', items: preface });
    else lead = preface;
    marks.forEach((start, index) => {
      const title = lines[start].trim().replace(/\s+/g, ' ');
      sections.push({ title, items: paragraphs(lines.slice(start + 1, marks[index + 1] ?? lines.length)) });
    });
  } else sections.push(...chunk('第 1 部分', paragraphs(lines)).map((part, index) => ({ ...part, title: `第 ${index + 1} 部分` })));
  const chapters = [];
  let pending = [];
  for (const section of sections) {
    // “第一卷”这类只有标题的行并到下一章开头，不单独成章。
    if (!section.items.length) { pending.push(section.title); continue; }
    for (const part of chunk(section.title, section.items)) {
      const heading = [...lead.map(textParagraph), ...[...pending, part.title].map(title => `## ${textParagraph(title)}`)].join('\n\n');
      chapters.push({ title: part.title, markdown: `${heading}\n\n${part.items.map(textParagraph).filter(Boolean).join('\n\n')}` });
      pending = []; lead = [];
    }
  }
  if (pending.length && chapters.length) chapters.at(-1).markdown += `\n\n${pending.map(title => `## ${textParagraph(title)}`).join('\n\n')}`;
  return { title: fallbackTitle, chapters };
}

const headingPattern = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
export const plainTitle = markdown => markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\\(.)/g, '$1').replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();

/** Markdown 按标题分章：取出现两次以上的最高一级标题；只出现一次的一级标题当作书名。 */
export function splitMarkdown(markdown, fallbackTitle) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const headings = [];
  let fence = null;
  lines.forEach((line, index) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && (!fence || marker[0] === fence[0] && marker.length >= fence.length)) { fence = fence ? null : marker; return; }
    const match = !fence && headingPattern.exec(line);
    if (match) headings.push({ index, level: match[1].length, title: plainTitle(match[2]) });
  });
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const heading of headings) counts[heading.level]++;
  let title = fallbackTitle, skip = -1;
  if (counts[1] === 1) { const first = headings.find(heading => heading.level === 1); title = first.title || title; skip = first.index; }
  const level = [1, 2, 3, 4, 5, 6].find(value => counts[value] >= 2 && !(value === 1 && skip >= 0));
  const body = (from, to) => lines.slice(from, to).filter((_, offset) => from + offset !== skip).join('\n').trim();
  if (!level) {
    const text = body(0, lines.length);
    return { title, chapters: text ? splitLong({ title, markdown: text }) : [] };
  }
  const marks = headings.filter(heading => heading.level === level);
  const chapters = [];
  // 第一个分章标题之前的内容：较长时单成“开篇”，较短时放在第一章开头。
  const preface = body(0, marks[0].index);
  const long = preface.replace(/[#\s]/g, '').length > 30 || /!\[/.test(preface);
  if (long) chapters.push({ title: '开篇', markdown: preface });
  marks.forEach((mark, index) => chapters.push({ title: mark.title || `第 ${index + 1} 章`, markdown: [index || long ? '' : preface, body(mark.index, marks[index + 1]?.index ?? lines.length)].filter(Boolean).join('\n\n') }));
  return { title, chapters: chapters.flatMap(splitLong) };
}

/** 单章过长时在段落之间切开，避免一次渲染几十万字。 */
export function splitLong(chapter) {
  if (chapter.markdown.length <= chapterChars * 1.5) return [chapter];
  const blocks = chapter.markdown.split(/\n{2,}/);
  return chunk(chapter.title, blocks).map(part => ({ title: part.title, markdown: part.items.join('\n\n') }));
}
