import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, ImageRun } from 'docx';
import { PDFDocument } from 'pdf-lib';
import { parseBook, rtfText, imageType } from '../features/cards/library/formats.js';
import { decodeBookText, textBook, splitMarkdown } from '../features/cards/library/text.js';
import { markupToMarkdown, parseMarkup } from '../features/cards/library/html.js';
import { wordPdf } from '../src/utilities/pdf.js';

const utf8 = text => new TextEncoder().encode(text);
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const concat = parts => { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; };
const ascii = text => Uint8Array.from(text, char => char.charCodeAt(0));
// 测试用的 GBK / Big5 编码：用 Node 自带解码器反查双字节表。
const table = (label, seconds) => {
  const map = new Map(), decoder = new TextDecoder(label);
  for (let a = 0x81; a <= 0xfe; a++) for (const b of seconds) { const char = decoder.decode(Uint8Array.of(a, b)); if (char.length === 1 && char !== '�' && !map.has(char)) map.set(char, [a, b]); }
  return text => Uint8Array.from([...text].flatMap(char => char.charCodeAt(0) < 128 ? [char.charCodeAt(0)] : map.get(char) ?? [0x3f]));
};
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const gbk = table('gbk', range(0x40, 0xfe).filter(b => b !== 0x7f));
const big5 = table('big5', [...range(0x40, 0x7e), ...range(0xa1, 0xfe)]);
const prose = (topic, count = 6) => Array.from({ length: count }, (_, i) => `${topic}的第${i + 1}段：需求分析要先弄清用户真正想解决的问题，再讨论方案。这一段用来检查段落是否完整保留。`).join('\n');

test('EPUB：按目录层级合章、跳过封面页、取出插图，DRM 加密给出说明', async () => {
  const page = (title, body) => utf8(`<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body>${body}</body></html>`);
  const long = topic => prose(topic, 40).split('\n').map(line => `<p>${line}</p>`).join('');
  const files = {
    mimetype: [utf8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': utf8('<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OEBPS/content.opf': utf8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>需求之书</dc:title><dc:creator>作者甲</dc:creator><dc:creator>作者乙</dc:creator><dc:language>zh</dc:language></metadata>
      <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/><item id="cp" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>
      <item id="p1" href="Text/part1.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/><item id="s11" href="Text/c1-1.xhtml" media-type="application/xhtml+xml"/><item id="c1b" href="Text/c1-b.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="Text/c2.xhtml" media-type="application/xhtml+xml"/><item id="fig" href="images/fig%201.png" media-type="image/png"/></manifest>
      <spine><itemref idref="cp"/><itemref idref="p1"/><itemref idref="c1"/><itemref idref="s11"/><itemref idref="c1b"/><itemref idref="c2"/></spine></package>`),
    'OEBPS/nav.xhtml': utf8(`<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="Text/part1.xhtml">第一部分</a><ol><li><a href="Text/c1.xhtml">第1章 起点</a><ol><li><a href="Text/c1-1.xhtml#s">1.1 小节</a></li></ol></li><li><a href="Text/c2.xhtml">第2章 终点</a></li></ol></li></ol></nav></body></html>`),
    'OEBPS/images/cover.png': png, 'OEBPS/images/fig 1.png': png,
    'OEBPS/Text/cover.xhtml': page('封面', '<div><svg><image xlink:href="../images/cover.png"/></svg></div>'),
    'OEBPS/Text/part1.xhtml': page('第一部分', '<h1>第一部分</h1>'),
    'OEBPS/Text/c1.xhtml': page('第1章', `<h2><b>第</b><b>1</b><b>章</b> 起点</h2>${long('第一章')}<p><img src="../images/fig%201.png" alt="图1-1"/></p>`),
    'OEBPS/Text/c1-1.xhtml': page('1.1', `<h3 id="s">1.1 小节</h3>${long('小节')}<table><tr><th>名称</th><th>说明</th></tr><tr><td>目标</td><td>a|b</td></tr></table>`),
    'OEBPS/Text/c1-b.xhtml': page('续', `<p>同一章拆到第二个文件的正文。</p>`),
    'OEBPS/Text/c2.xhtml': page('第2章', `<h2>第2章 终点</h2>${long('第二章')}<ul><li>要点一</li><li>要点二<ol><li>细节</li></ol></li></ul>`),
  };
  const book = await parseBook(zipSync(files), '需求之书.epub');
  assert.equal(book.format, 'EPUB');
  assert.equal(book.title, '需求之书');
  assert.equal(book.author, '作者甲、作者乙');
  assert.deepEqual(book.chapters.map(chapter => chapter.title), ['第1章 起点', '第2章 终点']);
  const [first, second] = book.chapters;
  assert.match(first.markdown, /^# 第一部分\n\n## 第1章 起点/, '只有标题的部分页并到下一章开头，逐字加粗的标题合并成纯文字');
  assert.match(first.markdown, /### 1\.1 小节/);
  assert.match(first.markdown, /同一章拆到第二个文件的正文/);
  assert.match(first.markdown, /\| 目标 \| a\\\|b \|/);
  assert.match(first.markdown, /!\[图1-1\]\(img-0002\.png\)/);
  assert.match(second.markdown, /- 要点一\n- 要点二\n {2}1\. 细节/);
  assert.equal(book.cover, 'img-0001.png');
  assert.deepEqual(book.images.map(image => [image.name, image.mime]), [['img-0001.png', 'image/png'], ['img-0002.png', 'image/png']]);
  await assert.rejects(parseBook(zipSync({ ...files, 'META-INF/encryption.xml': utf8('<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>') }), 'x.epub'), /DRM/);
  const fonts = await parseBook(zipSync({ ...files, 'META-INF/encryption.xml': utf8('<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/></EncryptedData></encryption>') }), 'x.epub');
  assert.equal(fonts.chapters.length, 2, '只混淆了字体的 EPUB 照常读取');
});

test('TXT：识别 GBK、Big5、UTF-16 和带坏字节的 UTF-8，按“第X章”分章，卷标题并到下一章', async () => {
  const text = `书名页\n作者：某人\n\n第一卷 风起\n第一章 开始\n${prose('开始')}\n\n第二章 继续\n${prose('继续')}\n# 这一行不是标题\n1. 这一行不是列表\n第三章\n${prose('结尾')}`;
  for (const [label, bytes] of [['GBK', gbk(text)], ['UTF-16', concat([Uint8Array.of(0xff, 0xfe), Buffer.from(text, 'utf16le')])]]) {
    const book = await parseBook(bytes, '小说.txt');
    assert.equal(book.format, 'TXT', label);
    assert.equal(book.title, '小说');
    assert.deepEqual(book.chapters.map(chapter => chapter.title), ['第一章 开始', '第二章 继续', '第三章'], label);
    assert.match(book.chapters[0].markdown, /^书名页\n\n作者：某人\n\n## 第一卷 风起\n\n## 第一章 开始\n\n开始的第1段/, `${label}：开头几行和卷标题都放在第一章开头`);
  }
  const traditional = Array.from({ length: 6 }, (_, i) => `第${i + 1}段：這是一個關於需求的說明，我們會在後面看到更多內容。`).join('\n');
  const big5Book = await parseBook(big5(`第一章 開始\n${traditional}\n第二章 繼續\n${traditional}`), '繁體.txt');
  assert.deepEqual(big5Book.chapters.map(chapter => chapter.title), ['第一章 開始', '第二章 繼續'], 'Big5 繁体按常用字判断出编码');
  const preface = await parseBook(utf8(`内容简介：${prose('简介', 1)}\n第一章 甲\n正文\n第二章 乙\n正文`), 'b.txt');
  assert.deepEqual(preface.chapters.map(chapter => chapter.title), ['开篇', '第一章 甲', '第二章 乙'], '较长的开头单成一章');
  const markdown = (await parseBook(gbk(text), 'a.txt')).chapters[1].markdown;
  assert.match(markdown, /\n\\# 这一行不是标题\n/);
  assert.match(markdown, /\n1\\\. 这一行不是列表$/);
  const damaged = concat([utf8(text), Uint8Array.of(0xe4, 0xb8)]);
  assert.equal(decodeBookText(damaged).slice(0, 3), '书名页', '截断的 UTF-8 末尾不影响整体判断');
  assert.equal(decodeBookText(new Uint8Array(Buffer.from(text, 'utf16le'))).slice(0, 3), '书名页', '没有 BOM 的 UTF-16 按零字节位置判断');
});

test('TXT：没有章节标题时按篇幅切分；英文硬换行排版连成段落', () => {
  const book = textBook(Array.from({ length: 3000 }, (_, i) => `这是第${i}段，没有任何章节标题，只是很长的正文内容。`).join('\n'), '长文');
  assert.ok(book.chapters.length >= 2);
  assert.match(book.chapters[0].title, /^第 1 部分/);
  assert.ok(book.chapters.every(chapter => chapter.markdown.length < 70000));
  const wrapped = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} starts here and the line keeps going until it\nwraps onto a second line without ending the sentence and then\nfinally stops.\n`).join('\n');
  const english = textBook(wrapped, 'English');
  assert.match(english.chapters[0].markdown, /Paragraph 0 starts here and the line keeps going until it wraps onto a second line without ending the sentence and then finally stops\./);
});

test('Markdown 与 HTML：唯一的一级标题当书名，按二级标题分章；HTML 按声明的编码读取并保留内嵌图片', async () => {
  const md = await parseBook(utf8('# 我的笔记\n\n前言文字很长很长很长很长很长很长很长很长很长很长很长很长很长很长。\n\n## 第一篇\n\n内容一\n\n```\n## 代码里的标题不算\n```\n\n## 第二篇\n\n内容二'), 'notes.md');
  assert.equal(md.title, '我的笔记');
  assert.deepEqual(md.chapters.map(chapter => chapter.title), ['开篇', '第一篇', '第二篇']);
  const html = concat([ascii('<html><head><meta charset="gbk"><title>'), gbk('网页书'), ascii('</title><script>alert(1)</script></head><body><h2>'), gbk('第一节'), ascii('</h2><p>'), gbk('正文'), ascii(`<img src="data:image/png;base64,${Buffer.from(png).toString('base64')}"></p><h2>`), gbk('第二节'), ascii('</h2><p>'), gbk('更多'), ascii('</p></body></html>')]);
  const book = await parseBook(html, 'page.html');
  assert.equal(book.format, 'HTML');
  assert.equal(book.title, '网页书');
  assert.deepEqual(book.chapters.map(chapter => chapter.title), ['第一节', '第二节']);
  assert.match(book.chapters[0].markdown, /正文!\[\]\(img-0001\.png\)/);
  assert.doesNotMatch(JSON.stringify(book.chapters), /alert/);
});

test('DOCX：按标题样式分章，保留加粗、表格和图片', async () => {
  const docx = new Document({ creator: '写作者', title: 'Word 书', sections: [{ children: [
    new Paragraph({ text: '第一章 概述', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun('普通文字，'), new TextRun({ text: '重点', bold: true }), new TextRun('。')] }),
    new Paragraph({ children: [new ImageRun({ type: 'png', data: png, transformation: { width: 10, height: 10 } })] }),
    new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('列一')] }), new TableCell({ children: [new Paragraph('列二')] })] }), new TableRow({ children: [new TableCell({ children: [new Paragraph('甲')] }), new TableCell({ children: [new Paragraph('乙')] })] })] }),
    new Paragraph({ text: '第二章 细节', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('第二章正文。'),
  ] }] });
  const book = await parseBook(new Uint8Array(await Packer.toBuffer(docx)), 'word.docx');
  assert.equal(book.format, 'DOCX');
  assert.equal(book.title, 'Word 书');
  assert.equal(book.author, '写作者');
  assert.deepEqual(book.chapters.map(chapter => chapter.title), ['第一章 概述', '第二章 细节']);
  assert.match(book.chapters[0].markdown, /普通文字，\*\*重点\*\*。/);
  assert.match(book.chapters[0].markdown, /!\[\]\(img-0001\.png\)/);
  assert.match(book.chapters[0].markdown, /\| 列一 \| 列二 \|\n\| --- \| --- \|\n\| 甲 \| 乙 \|/);
});

test('PDF：提取中文文字并连成段落，没有书签时每 10 页一章；扫描件和加密件给出说明', async () => {
  const children = [new Paragraph({ text: '第一章 PDF 测试', heading: HeadingLevel.HEADING_1 })];
  for (let i = 0; i < 160; i++) children.push(new Paragraph(`第${i}段。${'项目管理需要明确目标、范围和验收标准，团队才知道往哪里走。'.repeat(4)}`));
  const docx = new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children }] })));
  const pdf = (await wordPdf(docx, 'book.docx')).files[0].bytes;
  const book = await parseBook(pdf, 'book.pdf');
  assert.equal(book.format, 'PDF');
  assert.ok(book.chapters.length >= 2, '多于 10 页时分成多章');
  assert.match(book.chapters[0].title, /^第 1–10 页$/);
  const all = book.chapters.map(chapter => chapter.markdown).join('\n');
  assert.match(all, /第0段。项目管理需要明确目标、范围和验收标准，团队才知道往哪里走。项目管理需要/);
  assert.match(all, /第159段/);
  const blank = await PDFDocument.create();
  for (let i = 0; i < 3; i++) blank.addPage();
  await assert.rejects(parseBook(await blank.save(), 'scan.pdf'), /扫描图片/);
});

test('FB2：按 section 分章，取出 binary 图片和作者', async () => {
  const fb2 = `<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><author><first-name>Lev</first-name><last-name>Tolstoy</last-name></author><book-title>Short Tale</book-title><lang>en</lang><coverpage><image l:href="#cover.png"/></coverpage></title-info></description>
    <body><section><title><p>Chapter One</p></title><p>First <emphasis>line</emphasis>.</p><image l:href="#cover.png"/><section><title><p>Part A</p></title><p>Nested.</p></section></section><section><title><p>Chapter Two</p></title><poem><stanza><v>Verse one</v></stanza></poem></section></body>
    <body name="notes"><section id="n1"><title><p>1</p></title><p>A note.</p></section></body><binary id="cover.png" content-type="image/png">${Buffer.from(png).toString('base64')}</binary></FictionBook>`;
  const book = await parseBook(utf8(fb2), 'tale.fb2');
  assert.equal(book.format, 'FB2');
  assert.equal(book.title, 'Short Tale');
  assert.equal(book.author, 'Lev Tolstoy');
  assert.deepEqual(book.chapters.map(chapter => chapter.title), ['Chapter One', 'Chapter Two', '注释']);
  assert.match(book.chapters[0].markdown, /^## Chapter One\n\nFirst \*line\*\.\n\n!\[\]\(img-0001\.png\)\n\n### Part A\n\nNested\./);
  assert.equal(book.cover, 'img-0001.png');
});

test('RTF：按代码页解码十六进制转义和 Unicode 转义，跳过字体表', async () => {
  const hex = bytes => [...bytes].map(byte => `\\'${byte.toString(16)}`).join('');
  const rtf = `{\\rtf1\\ansi\\ansicpg936{\\fonttbl{\\f0\\fnil \\'cb\\'ce\\'cc\\'e5;}}{\\*\\generator Test;}\\f0 ${hex(gbk('第一章 开始'))}\\par ${hex(gbk(prose('开始', 2).replace('\n', '')))}\\par\\u20013?\\u25991?\\par ${hex(gbk('第二章 继续'))}\\par Plain \\{text\\}\\par}`;
  const text = rtfText(ascii(rtf));
  assert.match(text, /^第一章 开始\n/);
  assert.match(text, /\n中文\n/);
  assert.doesNotMatch(text, /宋体|Test/);
  const book = await parseBook(ascii(rtf), 'doc.rtf');
  assert.equal(book.format, 'RTF');
  assert.deepEqual(book.chapters.map(chapter => chapter.title), ['第一章 开始', '第二章 继续']);
  assert.match(book.chapters[1].markdown, /Plain \\\{text\\\}|Plain \{text\}/);
});

// PalmDOC 压缩：贪心回溯引用，测试用。
function palmCompress(input) {
  const out = [];
  for (let i = 0; i < input.length;) {
    let best = 0, distance = 0;
    for (let d = 1; d <= Math.min(2047, i); d++) { let length = 0; while (length < 10 && i + length < input.length && input[i + length] === input[i - d + length]) length++; if (length > best) { best = length; distance = d; } }
    if (best >= 3) { const value = 0x8000 | distance << 3 | best - 3; out.push(value >> 8, value & 0xff); i += best; continue; }
    const c = input[i], literal = value => value === 0 || value >= 0x09 && value <= 0x7f;
    if (c === 0x20 && input[i + 1] >= 0x40 && input[i + 1] <= 0x7f) { out.push(input[i + 1] ^ 0x80); i += 2; continue; }
    if (literal(c)) { out.push(c); i++; continue; }
    let n = 1;
    while (n < 8 && i + n < input.length && !literal(input[i + n])) n++;
    out.push(n, ...input.subarray(i, i + n)); i += n;
  }
  return Uint8Array.from(out);
}
function palmDatabase(type, records) {
  const header = new Uint8Array(78 + records.length * 8 + 2), view = new DataView(header.buffer);
  header.set(ascii('Palm_Name'), 0); header.set(ascii(type), 60); view.setUint16(76, records.length);
  let offset = header.length;
  records.forEach((record, i) => { view.setUint32(78 + i * 8, offset); view.setUint32(82 + i * 8, i * 2); offset += record.length; });
  return concat([header, ...records]);
}
function mobi(html, { version = 6, encryption = 0, compression = 2, images = [png], flows = null, exth = { 100: '作者丙', 503: '移动书' } } = {}) {
  const raw = flows ? concat(flows.map(utf8)) : utf8(html);
  const trailer = Uint8Array.of(0xaa, 0xbb, 0x83);
  const text = [];
  for (let i = 0; i < raw.length; i += 4096) text.push(concat([compression === 2 ? palmCompress(raw.subarray(i, i + 4096)) : raw.subarray(i, i + 4096), trailer]));
  const entries = Object.entries(exth).map(([kind, value]) => { const data = utf8(value), entry = new Uint8Array(8 + data.length), view = new DataView(entry.buffer); view.setUint32(0, Number(kind)); view.setUint32(4, entry.length); entry.set(data, 8); return entry; });
  const body = concat(entries), block = new Uint8Array(12 + body.length + (4 - (12 + body.length) % 4) % 4), blockView = new DataView(block.buffer);
  block.set(ascii('EXTH')); blockView.setUint32(4, 12 + body.length); blockView.setUint32(8, entries.length); block.set(body, 12);
  const name = utf8('全名书'), head = new Uint8Array(16 + 0xe8 + block.length + name.length + 4), view = new DataView(head.buffer);
  const firstImage = 1 + text.length, fdstIndex = firstImage + images.length;
  view.setUint16(0, compression); view.setUint32(4, raw.length); view.setUint16(8, text.length); view.setUint16(10, 4096); view.setUint16(12, encryption);
  head.set(ascii('MOBI'), 16); view.setUint32(20, 0xe8); view.setUint32(24, 2); view.setUint32(28, 65001); view.setUint32(36, version);
  view.setUint32(0x54, 16 + 0xe8 + block.length); view.setUint32(0x58, name.length); view.setUint32(0x6c, firstImage); view.setUint32(0x80, 0x40); view.setUint32(0xc0, flows ? fdstIndex : 0xffffffff); view.setUint16(0xf2, 2);
  head.set(block, 16 + 0xe8); head.set(name, 16 + 0xe8 + block.length);
  const records = [head, ...text, ...images];
  if (flows) {
    const fdst = new Uint8Array(12 + flows.length * 8), fdstView = new DataView(fdst.buffer);
    fdst.set(ascii('FDST')); fdstView.setUint32(4, 12); fdstView.setUint32(8, flows.length);
    let start = 0;
    flows.forEach((flow, i) => { const length = utf8(flow).length; fdstView.setUint32(12 + i * 8, start); fdstView.setUint32(16 + i * 8, start + length); start += length; });
    records.push(fdst);
  }
  return palmDatabase('BOOKMOBI', [...records, ascii('FLIS\0\0\0\x08')]);
}

test('MOBI / AZW3 / PRC：PalmDOC 解压、去掉记录尾部数据、按分页分章、按记录号取图', async () => {
  const chapter = (title, topic) => `<h2>${title}</h2>${prose(topic, 30).split('\n').map(line => `<p>${line}</p>`).join('')}`;
  const book = await parseBook(mobi(`<html><body>${chapter('第一章 起点', '起点')}<p><img recindex="00001"/></p><mbp:pagebreak/>${chapter('第二章 终点', '终点')}</body></html>`), 'book.mobi');
  assert.equal(book.format, 'MOBI');
  assert.equal(book.title, '移动书');
  assert.equal(book.author, '作者丙');
  assert.deepEqual(book.chapters.map(item => item.title), ['第一章 起点', '第二章 终点']);
  assert.match(book.chapters[0].markdown, /起点的第30段：需求分析要先弄清用户真正想解决的问题，再讨论方案。/);
  assert.match(book.chapters[0].markdown, /!\[\]\(img-0001\.png\)/);
  assert.doesNotMatch(book.chapters.map(item => item.markdown).join(''), /�/, '记录尾部数据没有混进正文');
  const kf8 = await parseBook(mobi('', { version: 8, flows: [`<?xml version="1.0"?><html><body>${chapter('第一节', '甲')}<img src="kindle:embed:0001?mime=image/png"/></body></html><?xml version="1.0"?><html><body>${chapter('第二节', '乙')}</body></html>`, 'body { color: red }'] }), 'book.azw3');
  assert.equal(kf8.format, 'AZW3');
  assert.deepEqual(kf8.chapters.map(item => item.title), ['第一节', '第二节']);
  assert.match(kf8.chapters[0].markdown, /!\[\]\(img-0001\.png\)/);
  assert.doesNotMatch(kf8.chapters.at(-1).markdown, /color: red/, '只取正文流，不带样式表');
  await assert.rejects(parseBook(mobi('<p>x</p>', { encryption: 2 }), 'drm.azw'), /DRM/);
  await assert.rejects(parseBook(mobi('<p>x</p>', { compression: 17480 }), 'huff.mobi'), /HUFF\/CDIC/);
  const palmText = `第一章 甲\n${prose('甲')}\n第二章 乙\n${prose('乙')}`;
  const record0 = new Uint8Array(16), view = new DataView(record0.buffer);
  const raw = utf8(palmText);
  view.setUint16(0, 2); view.setUint32(4, raw.length); view.setUint16(8, Math.ceil(raw.length / 4096)); view.setUint16(10, 4096);
  const textRecords = [];
  for (let i = 0; i < raw.length; i += 4096) textRecords.push(palmCompress(raw.subarray(i, i + 4096)));
  const prc = await parseBook(palmDatabase('TEXtREAd', [record0, ...textRecords]), 'old.prc');
  assert.equal(prc.format, 'PRC');
  assert.deepEqual(prc.chapters.map(item => item.title), ['第一章 甲', '第二章 乙']);
});

test('CBZ 与 ZIP：漫画按页序成章；只装一本书的压缩包直接读里面的书；多本或不支持的格式给出说明', async () => {
  const comic = await parseBook(zipSync({ 'p10.png': png, 'p2.png': png, 'p1.png': png, '__MACOSX/._p1.png': png }), 'comic.cbz');
  assert.equal(comic.format, 'CBZ');
  assert.equal(comic.chapters[0].markdown, '![](img-0001.png)\n\n![](img-0002.png)\n\n![](img-0003.png)');
  const single = await parseBook(zipSync({ '书/小说.txt': gbk(`第一章 甲\n${prose('甲')}\n第二章 乙\n${prose('乙')}`) }), '小说.zip');
  assert.equal(single.format, 'TXT');
  assert.equal(single.title, '小说');
  await assert.rejects(parseBook(zipSync({ 'a.txt': utf8('a'), 'b.epub': utf8('b') }), 'two.zip'), /2 个书籍文件/);
  await assert.rejects(parseBook(concat([ascii('ITSF'), new Uint8Array(100)]), 'help.chm'), /CHM.*Calibre/);
  await assert.rejects(parseBook(Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, ...new Uint8Array(100)), 'old.doc'), /另存为 DOCX/);
  await assert.rejects(parseBook(concat([ascii('Rar!'), new Uint8Array(100)]), 'a.rar'), /先解压/);
  await assert.rejects(parseBook(png, 'photo.png'), /图片/);
  await assert.rejects(parseBook(new Uint8Array(0), 'empty.txt'), /空的/);
  await assert.rejects(parseBook(Uint8Array.from({ length: 5000 }, (_, i) => (i * 7919) % 256), 'random.bin'), /无法识别/);
});

test('HTML 转 Markdown：不执行脚本、只保留公开网页链接，原文里的 Markdown 符号被转义', () => {
  const markdown = markupToMarkdown(parseMarkup('<p>价格 *打折* [1] <a href="javascript:alert(1)">坏链接</a> <a href="https://example.com/a">好链接</a></p><script>x()</script><p>- 不是列表</p><pre>## 代码\n```</pre>'));
  assert.equal(markdown, '价格 \\*打折\\* \\[1\\] 坏链接 [好链接](https://example.com/a)\n\n\\- 不是列表\n\n~~~~\n## 代码\n```\n~~~~');
  assert.deepEqual(splitMarkdown('只有正文', '无题'), { title: '无题', chapters: [{ title: '无题', markdown: '只有正文' }] });
  assert.equal(imageType(png)[0], 'image/png');
  assert.equal(imageType(utf8('<svg xmlns="http://www.w3.org/2000/svg"></svg>      '))[0], 'image/svg+xml');
});
