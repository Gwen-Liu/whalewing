/** PDF 引擎与字体随包离线运行；独占外层 Worker 提供取消和内存生命周期。 */
import { PDFDocument, degrees, StandardFonts, PDFName, PDFRawStream, PDFNumber, PDFArray, PDFDict, PDFBool } from 'pdf-lib';
import pdfMake from 'pdfmake/build/pdfmake.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import font from '../../content/utilities/noto-font.json' with { type: 'json' };
import pdfAssets from '../../content/utilities/pdf-assets.json' with { type: 'json' };
import { zipSync, zlibSync, unzlibSync } from 'fflate';
import { Paragraph, TextRun } from 'docx';
import { LIMITS } from './core.js';
import { inspectImage, checkDecoded, imageExtensions } from './image.js';
import { selectedBytes, safeBase, resultFile, textResult, wordDocument, wordChildren, descendants, paragraphText, makeWord } from './office-tasks.js';

// PDF.js 的解析器已内联到独占任务中，不创建远端 Worker 或动态脚本请求。
globalThis.pdfjsWorker = { WorkerMessageHandler };
const fonts = { Noto: { normal: 'Noto.otf', bold: 'Noto.otf', italics: 'Noto.otf', bolditalics: 'Noto.otf' } };
const vfs = { 'Noto.otf': font.base64 };
/** 读字体 cmap 得到有字形的码点（format 12 优先，其次 format 4）。 */
export function fontCodePoints(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), points = new Set();
  let cmap = -1;
  for (let i = 0; i < view.getUint16(4); i++) if (view.getUint32(12 + i * 16) === 0x636D6170) cmap = view.getUint32(12 + i * 16 + 8);
  if (cmap < 0) throw new Error('内置字体缺少 cmap 表');
  const tables = Array.from({ length: view.getUint16(cmap + 2) }, (_, i) => ({ platform: view.getUint16(cmap + 4 + i * 8), encoding: view.getUint16(cmap + 6 + i * 8), at: cmap + view.getUint32(cmap + 8 + i * 8) }))
    .filter(t => t.platform === 0 || (t.platform === 3 && [1, 10].includes(t.encoding))).map(t => ({ ...t, format: view.getUint16(t.at) }));
  const table = tables.find(t => t.format === 12) || tables.find(t => t.format === 4);
  if (!table) throw new Error('内置字体缺少 Unicode 字符映射');
  const at = table.at;
  if (table.format === 12) {
    for (let g = 0; g < view.getUint32(at + 12); g++) {
      const group = at + 16 + g * 12, start = view.getUint32(group), end = view.getUint32(group + 4), glyph = view.getUint32(group + 8);
      for (let c = start; c <= end; c++) if (glyph + c - start) points.add(c);
    }
    return points;
  }
  const segments = view.getUint16(at + 6) / 2, ends = at + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, offsets = deltas + segments * 2;
  for (let s = 0; s < segments; s++) {
    const start = view.getUint16(starts + s * 2), end = view.getUint16(ends + s * 2), delta = view.getUint16(deltas + s * 2), offset = view.getUint16(offsets + s * 2);
    for (let c = start; c <= end && c !== 0xFFFF; c++) {
      const raw = offset ? view.getUint16(offsets + s * 2 + offset + (c - start) * 2) : c;
      if (raw && (raw + delta) & 0xFFFF) points.add(c);
    }
  }
  return points;
}
let covered;
/**
 * 随包字体只含常用简繁字和符号（scripts/noto-subset.mjs），子集外的字会画成带叉方框。
 * 缺字形的不可见格式符删掉、缺字形的空格换成普通空格，其余缺字记下来告诉员工。
 */
function fitFont(text, missing) {
  if (!covered) { const raw = atob(font.base64), bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); covered = fontCodePoints(bytes); }
  let out = '';
  for (const ch of text) {
    if (covered.has(ch.codePointAt(0)) || ch === '\t' || ch === '\n') out += ch;
    else if (/\p{Z}/u.test(ch)) out += ' ';
    else if (!/[\p{Cc}\p{Cf}]/u.test(ch)) { out += ch; missing.add(ch); }
  }
  return out;
}
const missingList = missing => [...missing].slice(0, 20).join('、') + (missing.size > 20 ? ' 等' : '');
/** 所有对外 PDF（含拆分 ZIP 成员）在最终字节上统一回读页数，转换引擎的成功不替代预算门。 */
async function pdfResult(bytes, name, summary) {
  const result = resultFile(name, 'application/pdf', bytes, summary);
  const readback = await PDFDocument.load(result.files[0].bytes, { updateMetadata: false });
  pageSelection('', readback.getPageCount());
  return result;
}
const b64 = bytes => { let out = ''; for (let i = 0; i < bytes.length; i += 16384) out += String.fromCharCode(...bytes.subarray(i, i + 16384)); return btoa(out); };
export function pageSelection(value, total) {
  if (!Number.isSafeInteger(total) || total < 1 || total > 200) throw new Error('PDF 页数应为 1–200');
  if (!value || value.trim() === '') return Array.from({ length: total }, (_, i) => i);
  const result = [];
  for (const segment of String(value).split(',')) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(segment);
    if (!match) throw new Error('页码格式示例：1,3-5,2');
    const a = Number(match[1]), z = Number(match[2] || match[1]);
    if (a < 1 || z < a || z > total || result.length + z - a + 1 > 200) throw new Error('页码超出文档范围或选择超过 200 页');
    for (let p = a; p <= z; p++) result.push(p - 1);
  }
  if (new Set(result).size !== result.length) throw new Error('同一页只能选择一次');
  return result;
}
/** 逐页布局：每页只出现一次，追加旋转为 0/90/180/270，至少保留一页。 */
export function pageLayout(value, total) {
  pageSelection('', total);
  if (!Array.isArray(value) || !value.length || value.length > total) throw new Error('请至少保留一页');
  const seen = new Set();
  return value.map(entry => {
    const page = entry?.page, rotate = entry?.rotate ?? 0;
    if (!Number.isInteger(page) || page < 0 || page >= total || seen.has(page) || ![0, 90, 180, 270].includes(rotate)) throw new Error('页面布局无效：每页只能出现一次，旋转只能是 90 度的倍数');
    seen.add(page); return { page, rotate };
  });
}
async function loadPdf(bytes) {
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('所选文件不是 PDF');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  pageSelection('', doc.getPageCount());
  if (doc.getForm().getFields().length) throw new Error('交互表单或签名 PDF 请先另存为静态副本；办公工坊不保留数字签名效力');
  return doc;
}
async function renderDefinition(definition) {
  return new Promise((resolve, reject) => {
    try { pdfMake.createPdf({ ...definition, defaultStyle: { font: 'Noto', fontSize: 10 }, pageSize: 'A4', pageMargins: [40, 40, 40, 40] }, undefined, fonts, vfs).getBuffer(buffer => resolve(new Uint8Array(buffer))); }
    catch (error) { reject(error); }
  });
}
function validateWordContent(body) {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
  const elements = node => Array.from(node.childNodes).filter(n => n.nodeType === 1);
  const unsupported = node => { throw new Error(`Word 含尚未支持的公式、图表、绘图或正文结构：${node.nodeName}；请先转换为普通文字或内嵌 PNG/JPEG`); };
  const containers = {
    body: ['p', 'tbl', 'sectPr'], p: ['pPr', 'r', 'hyperlink', 'bookmarkStart', 'bookmarkEnd', 'proofErr'],
    hyperlink: ['r', 'bookmarkStart', 'bookmarkEnd', 'proofErr'], r: ['rPr', 't', 'tab', 'br', 'cr', 'drawing'],
    tbl: ['tblPr', 'tblGrid', 'tr'], tr: ['trPr', 'tc'], tc: ['tcPr', 'p'],
  };
  const properties = new Set(['pPr', 'rPr', 'tblPr', 'tblGrid', 'trPr', 'tcPr', 'sectPr']);
  const drawingNodes = new Map([
    [WP, new Set(['inline', 'extent', 'effectExtent', 'docPr', 'cNvGraphicFramePr'])],
    [A, new Set(['graphic', 'graphicData', 'graphicFrameLocks', 'picLocks', 'blip', 'srcRect', 'stretch', 'fillRect', 'xfrm', 'off', 'ext', 'prstGeom', 'avLst'])],
    [PIC, new Set(['pic', 'nvPicPr', 'cNvPr', 'cNvPicPr', 'blipFill', 'spPr'])],
  ]);
  const drawing = node => {
    const children = elements(node);
    if (children.length !== 1 || children[0].namespaceURI !== WP || children[0].localName !== 'inline') unsupported(node);
    const all = [children[0], ...Array.from(children[0].getElementsByTagName('*'))];
    for (const child of all) {
      if (!drawingNodes.get(child.namespaceURI)?.has(child.localName)) unsupported(child);
      if (child.namespaceURI === A && child.localName === 'graphicData' && child.getAttribute('uri') !== PIC) unsupported(child);
      if (child.namespaceURI === A && child.localName === 'prstGeom' && child.getAttribute('prst') !== 'rect') unsupported(child);
      if (child.namespaceURI === A && child.localName === 'xfrm' && ['rot', 'flipH', 'flipV'].some(key => child.hasAttribute(key) && !['0', 'false'].includes(child.getAttribute(key)))) unsupported(child);
      if (child.namespaceURI === A && ['srcRect', 'fillRect'].includes(child.localName) && ['t', 'r', 'b', 'l'].some(key => child.hasAttribute(key) && child.getAttribute(key) !== '0')) unsupported(child);
    }
    if (node.getElementsByTagNameNS(PIC, 'pic').length !== 1 || node.getElementsByTagNameNS(A, 'blip').length !== 1) unsupported(node);
  };
  // 只允许当前转换器实际消费的内容容器；未知命名空间不再被Word标签遍历静默跳过。
  const visit = node => {
    if (node.namespaceURI !== W) unsupported(node);
    if (node.localName === 'drawing') { drawing(node); return; }
    if (properties.has(node.localName)) {
      for (const child of Array.from(node.getElementsByTagName('*'))) if (child.namespaceURI !== W) unsupported(child);
      return;
    }
    const allowed = containers[node.localName];
    for (const child of elements(node)) {
      if (!allowed?.includes(child.localName) || child.namespaceURI !== W) unsupported(child);
      visit(child);
    }
  };
  visit(body);
}
export async function wordPdf(bytes, name) {
  const { body, documents, entries } = wordDocument(bytes);
  validateWordContent(body);
  if (['gridSpan', 'vMerge', 'numPr', 'footnoteReference', 'endnoteReference', 'pict', 'object', 'fldSimple', 'instrText', 'txbxContent'].some(n => descendants(body, n).length) || body.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'anchor').length) throw new Error('该 Word 含合并表格、编号、脚注、域或浮动图形，请先转为普通段落与规则表格');
  const rels = documents.get('word/_rels/document.xml.rels'), missing = new Set();
  const imageFor = node => {
    const blips = Array.from(node.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip'));
    return blips.map(blip => {
      const id = blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
      const relation = rels && Array.from(rels.documentElement.childNodes).find(r => r.nodeType === 1 && r.getAttribute('Id') === id);
      const target = relation?.getAttribute('Target');
      if (!target || relation.getAttribute('TargetMode') === 'External' || !/^media\/[^/]+\.(png|jpe?g)$/i.test(target)) throw new Error('Word 图片必须是本地 PNG/JPEG');
      const data = entries.get(`word/${target}`); if (!data) throw new Error('Word 图片缺失');
      const info = inspectImage(data, target);
      return { image: `data:${info.mime};base64,${b64(data)}`, fit: [480, 360], margin: [0, 4, 0, 8] };
    });
  };
  const paragraph = p => {
    const runs = descendants(p, 'r').map(r => ({ text: fitFont(paragraphText(r), missing), bold: descendants(r, 'b').length > 0, italics: descendants(r, 'i').length > 0 }));
    const text = runs.some(r => r.text) ? runs : ' ';
    const style = descendants(p, 'pStyle')[0]?.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'val') || '';
    return [{ text, fontSize: /^(Title|标题)$/i.test(style) ? 20 : /^Heading[1-3]$/i.test(style) ? 15 : 10, margin: [0, 0, 0, 7] }, ...imageFor(p)];
  };
  const content = [];
  for (const node of wordChildren(body)) {
    if (node.localName === 'p') content.push(...paragraph(node));
    else if (node.localName === 'tbl') {
      if (descendants(node, 'tbl').length) throw new Error('嵌套表格尚不支持');
      const rows = wordChildren(node, 'tr').map(tr => wordChildren(tr, 'tc').map(tc => ({ stack: wordChildren(tc, 'p').flatMap(paragraph) })));
      if (!rows.length || !rows[0].length || rows.some(r => r.length !== rows[0].length) || rows.length * rows[0].length > LIMITS.wordCells) throw new Error('Word 表格结构或大小超出处理范围');
      content.push({ table: { widths: rows[0].map(() => '*'), body: rows }, margin: [0, 0, 0, 10] });
    } else if (node.localName !== 'sectPr') throw new Error(`尚未支持 Word 正文结构：${node.localName}`);
  }
  if (!content.length) throw new Error('Word 正文为空');
  const note = missing.size ? `；有 ${missing.size} 个字不在内置字库（常用简繁体字）里，PDF 中显示为带叉方框：${missingList(missing)}；需要原样显示请用 Word 自带的“另存为 PDF”` : '';
  return pdfResult(await renderDefinition({ content }), `${safeBase(name)}.pdf`, '已将正文、基础样式、规则表格与内嵌图片重新排为 A4 PDF；字体统一为 Noto Sans SC，原页码、页眉页脚、粗斜体字体外观不保真' + note);
}
async function withParsedPdf(bytes, operation) {
  const assetBytes = encoded => Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  class LocalFontData {
    async fetch({ filename }) { const value = pdfAssets.fonts[filename]; if (!value) throw new Error('PDF 请求了未随包提供的标准字体'); return assetBytes(value); }
  }
  class LocalCMaps {
    async fetch({ name }) { const value = pdfAssets.cmaps[`${name}.bcmap`]; if (!value) throw new Error('PDF 请求了未随包提供的字符映射'); return { cMapData: assetBytes(value), isCompressed: true }; }
  }
  class LocalCanvasFactory {
    create(width, height) { if (width * height > LIMITS.pixels) throw new Error('PDF 内嵌图像超过像素预算'); const canvas = new OffscreenCanvas(Math.ceil(width), Math.ceil(height)); return { canvas, context: canvas.getContext('2d') }; }
    reset(target, width, height) { if (width * height > LIMITS.pixels) throw new Error('PDF 内嵌图像超过像素预算'); target.canvas.width = width; target.canvas.height = height; }
    destroy(target) { target.canvas.width = target.canvas.height = 1; target.canvas = target.context = null; }
  }
  const task = getDocument({ data: bytes.slice(), CanvasFactory: LocalCanvasFactory, StandardFontDataFactory: LocalFontData, CMapReaderFactory: LocalCMaps, useWorkerFetch: false, useSystemFonts: false, disableFontFace: true, isEvalSupported: false, useWasm: false, stopAtErrors: true });
  try { const doc = await task.promise; pageSelection('', doc.numPages); return await operation(doc); }
  finally { await task.destroy(); }
}
async function pdfTextPages(doc) {
  const pages = []; let size = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n), content = await page.getTextContent();
    let text = '', lastY = null, lastEnd = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      const sameLine = lastY !== null && Math.abs(y - lastY) <= 2;
      if (lastY !== null && !sameLine && !text.endsWith('\n')) text += '\n';
      if (sameLine && lastEnd !== null && item.transform[4] - lastEnd > Math.abs(item.transform[0]) * 0.3 && !/\s$/.test(text)) text += ' ';
      text += item.str + (item.hasEOL ? '\n' : ''); lastY = y; lastEnd = item.transform[4] + item.width;
      size += item.str.length * 4 + 2;
      if (size > LIMITS.text) throw new Error('提取文字超过 2 MiB');
    }
    page.cleanup();
    if (!text.trim()) throw new Error(`第 ${n} 页没有可提取文字，可能为扫描件；需要 OCR 后再转换`);
    pages.push(text.trim());
  }
  return pages;
}
/** 压缩档位：按页面长边折算的保留分辨率与 JPEG 质量。 */
export const compressPresets = Object.freeze({
  light: { dpi: 200, quality: 0.8, label: '轻度' },
  standard: { dpi: 150, quality: 0.7, label: '标准' },
  strong: { dpi: 100, quality: 0.55, label: '强力' },
});

/** Worker 内的图片编解码：JPEG 重新编码与原始像素缩放都用浏览器自带的 createImageBitmap 和 OffscreenCanvas。 */
export const canvasCodec = Object.freeze({
  async jpeg(bytes, width, height, quality) {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }), { resizeWidth: width, resizeHeight: height, resizeQuality: 'high', imageOrientation: 'none' });
    const canvas = new OffscreenCanvas(width, height);
    try {
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0);
      return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer());
    } finally { bitmap.close(); canvas.width = canvas.height = 1; }
  },
  async resize(data, channels, sourceWidth, sourceHeight, width, height) {
    const rgba = new Uint8ClampedArray(sourceWidth * sourceHeight * 4);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += channels) { rgba[i] = data[j]; rgba[i + 1] = data[j + (channels === 3 ? 1 : 0)]; rgba[i + 2] = data[j + (channels === 3 ? 2 : 0)]; rgba[i + 3] = 255; }
    const bitmap = await createImageBitmap(new ImageData(rgba, sourceWidth, sourceHeight), { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
    const canvas = new OffscreenCanvas(width, height);
    try {
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, width, height).data, out = new Uint8Array(width * height * channels);
      for (let i = 0, j = 0; i < pixels.length; i += 4, j += channels) { out[j] = pixels[i]; if (channels === 3) { out[j + 1] = pixels[i + 1]; out[j + 2] = pixels[i + 2]; } }
      return out;
    } finally { bitmap.close(); canvas.width = canvas.height = 1; }
  },
});

/** JPEG 的颜色分量数（1 灰度、3 彩色、4 CMYK）；读不到时返回 0。 */
function jpegComponents(bytes) {
  let p = 2;
  while (p + 9 < bytes.length && bytes[0] === 0xff && bytes[1] === 0xd8) {
    if (bytes[p] !== 0xff) return 0;
    const marker = bytes[p + 1], length = bytes[p + 2] << 8 | bytes[p + 3];
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return bytes[p + 9];
    if (marker === 0xda || length < 2) return 0;
    p += 2 + length;
  }
  return 0;
}

/** 重新压缩无损图时按 PNG “Up” 预测逐行存差值，渐变和大面积纯色压得更小。 */
function predictUp(data, row) {
  const rows = data.length / row, out = new Uint8Array(rows * (row + 1));
  for (let r = 0; r < rows; r++) {
    const dst = r * (row + 1), src = r * row; out[dst] = 2;
    for (let i = 0; i < row; i++) out[dst + 1 + i] = (data[src + i] - (r ? data[src - row + i] : 0)) & 255;
  }
  return out;
}

/** 还原 PNG 预测（Predictor ≥ 10）；每行前一个字节标明过滤方式。 */
function unpredict(data, columns, colors) {
  const row = columns * colors, rows = data.length / (row + 1);
  if (!Number.isInteger(rows)) throw new Error('图片数据长度不符');
  const out = new Uint8Array(rows * row);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (row + 1)], src = r * (row + 1) + 1, dst = r * row;
    for (let i = 0; i < row; i++) {
      const a = i >= colors ? out[dst + i - colors] : 0, b = r ? out[dst - row + i] : 0, c = r && i >= colors ? out[dst - row + i - colors] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predicted = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : type === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : -1;
      if (predicted < 0) throw new Error('图片预测方式无效');
      out[dst + i] = (data[src + i] + predicted) & 255;
    }
  }
  return out;
}

/**
 * 只重新处理图片，不动文字和矢量：JPEG 按档位缩小并降低质量；无损图只在分辨率高于档位时缩小并保持无损；
 * CMYK、遮罩、带 Decode 的图和 JBIG2 等格式原样保留。结果没有变小就不交付。
 */
export async function compressPdf(bytes, name, presetName, codec = canvasCodec) {
  const preset = compressPresets[presetName];
  if (!preset) throw new Error('请选择压缩档位');
  const doc = await loadPdf(bytes);
  // 以最大页面长边折算保留像素：铺满整页的图正好是目标 DPI，页内较小的图会偏保守。
  const limit = Math.round(Math.max(...doc.getPages().map(page => Math.max(page.getWidth(), page.getHeight()))) / 72 * preset.dpi);
  const skipped = new Map(), skip = reason => skipped.set(reason, (skipped.get(reason) || 0) + 1);
  const number = value => value instanceof PDFNumber ? value.asNumber() : NaN;
  let replaced = 0;
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || object.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    const dict = object.dict, width = number(dict.lookup(PDFName.of('Width'))), height = number(dict.lookup(PDFName.of('Height')));
    let filter = dict.lookup(PDFName.of('Filter'));
    if (filter instanceof PDFArray && filter.size() === 1) filter = filter.lookup(0);
    if (dict.lookup(PDFName.of('ImageMask')) === PDFBool.True) { skip('遮罩图片'); continue; }
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > LIMITS.pixels) { skip('尺寸无效或超过 3,200 万像素'); continue; }
    const scale = Math.min(1, limit / Math.max(width, height)), targetWidth = Math.max(1, Math.round(width * scale)), targetHeight = Math.max(1, Math.round(height * scale));
    try {
      let output, update;
      if (filter === PDFName.of('DCTDecode')) {
        if (![1, 3].includes(jpegComponents(object.contents))) { skip('CMYK 等印刷色图片'); continue; }
        if (dict.has(PDFName.of('Decode'))) { skip('自定义解码的图片'); continue; }
        output = await codec.jpeg(object.contents, targetWidth, targetHeight, preset.quality);
        update = { ColorSpace: PDFName.of('DeviceRGB') };
      } else if (filter === PDFName.of('FlateDecode')) {
        if (scale === 1) { skip('分辨率不高于档位的无损图片'); continue; }
        if (dict.has(PDFName.of('Decode'))) { skip('自定义解码的图片'); continue; }
        let space = dict.lookup(PDFName.of('ColorSpace'));
        if (space instanceof PDFArray && space.lookup(0) === PDFName.of('ICCBased')) space = number(space.lookup(1)?.dict?.lookup(PDFName.of('N')));
        const channels = space === PDFName.of('DeviceRGB') || space === 3 ? 3 : space === PDFName.of('DeviceGray') || space === 1 ? 1 : 0;
        const parms = dict.lookup(PDFName.of('DecodeParms')), predictor = parms instanceof PDFDict ? number(parms.lookup(PDFName.of('Predictor'))) : NaN;
        if (!channels || number(dict.lookup(PDFName.of('BitsPerComponent'))) !== 8 || parms && !(parms instanceof PDFDict) || predictor > 1 && predictor < 10) { skip('不常见的颜色格式'); continue; }
        let raw = unzlibSync(object.contents);
        if (predictor >= 10) raw = unpredict(raw, width, channels);
        if (raw.length !== width * height * channels) { skip('图片数据长度不符'); continue; }
        output = zlibSync(predictUp(await codec.resize(raw, channels, width, height, targetWidth, targetHeight), targetWidth * channels), { level: 9 });
        update = { DecodeParms: doc.context.obj({ Predictor: 15, Colors: channels, BitsPerComponent: 8, Columns: targetWidth }) };
      } else { skip('JBIG2、CCITT 等已很紧凑的格式'); continue; }
      if (output.length >= object.contents.length) { skip('重新处理后没有变小'); continue; }
      dict.delete(PDFName.of('DecodeParms'));
      for (const [key, value] of Object.entries({ ...update, Width: PDFNumber.of(targetWidth), Height: PDFNumber.of(targetHeight), BitsPerComponent: PDFNumber.of(8), Length: PDFNumber.of(output.length) })) dict.set(PDFName.of(key), value);
      doc.context.assign(ref, PDFRawStream.of(dict, output)); replaced++;
    } catch { skip('无法解码'); }
  }
  const output = await doc.save({ useObjectStreams: true });
  if (output.length >= bytes.length) throw new Error('压缩后没有变小：这个 PDF 主要是文字和字体，或图片已经很精简');
  const mb = n => `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1)} MB`;
  const result = await pdfResult(output, `${safeBase(name)}-压缩.pdf`, `${mb(bytes.length)} → ${mb(output.length)}（减少 ${Math.round((1 - output.length / bytes.length) * 100)}%），重新处理 ${replaced} 张图片（${preset.label}，约 ${preset.dpi} DPI）；文字与矢量内容不变`);
  return { ...result, listing: [...skipped].map(([reason, count]) => `跳过 ${count} 张：${reason}`) };
}

export async function pdfTask(tool, files, options = {}) {
  if (tool === 'word-pdf') { const [f] = await selectedBytes(files, ['docx']); return wordPdf(f.bytes, f.name); }
  if (tool === 'images-pdf') {
    const inputs = await selectedBytes(files, imageExtensions, 20), doc = await PDFDocument.create();
    for (const input of inputs) {
      const info = inspectImage(input.bytes, input.name); let bytes = input.bytes;
      // PDF 只能直接嵌入 JPEG 与 PNG，其余格式先在本地转成 PNG（动图取第一帧）。
      if (!['image/jpeg', 'image/png'].includes(info.mime)) {
        if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') throw new Error('当前环境缺少本地图像转换能力');
        const bitmap = await createImageBitmap(new Blob([bytes], { type: info.mime })); let canvas;
        try { checkDecoded(bitmap, info); canvas = new OffscreenCanvas(bitmap.width, bitmap.height); canvas.getContext('2d').drawImage(bitmap, 0, 0); bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()); }
        finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 1; }
      }
      const image = info.mime === 'image/jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
      const page = doc.addPage([595.28, 841.89]), scale = Math.min(515 / image.width, 762 / image.height);
      page.drawImage(image, { x: (595.28 - image.width * scale) / 2, y: (841.89 - image.height * scale) / 2, width: image.width * scale, height: image.height * scale });
    }
    return pdfResult(await doc.save(), '图片汇总.pdf', `已按选件顺序生成 ${inputs.length} 页 PDF`);
  }
  const inputs = await selectedBytes(files, ['pdf'], tool === 'pdf-merge' ? 20 : 1);
  if (tool === 'pdf-compress') return compressPdf(inputs[0].bytes, inputs[0].name, options.preset);
  const source = await loadPdf(inputs[0].bytes), base = safeBase(inputs[0].name);
  // 页面整理可以传逐页布局（顺序 + 追加旋转），删除的页不在布局里；否则沿用页码文字。
  const layout = tool === 'pdf-pages' && options.layout !== undefined ? pageLayout(options.layout, source.getPageCount()) : null;
  const selected = layout ? layout.map(entry => entry.page) : pageSelection(options.pages, source.getPageCount());
  if (tool === 'pdf-thumbs') return withParsedPdf(inputs[0].bytes, async doc => {
    if (typeof OffscreenCanvas !== 'function') throw new Error('当前环境缺少本地 PDF 渲染能力');
    const thumbs = []; let total = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n), natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 240 / Math.max(natural.width, natural.height)) });
      const canvas = new OffscreenCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
      try {
        const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 })).arrayBuffer());
        total += bytes.length; if (total > 20 * 1024 ** 2) throw new Error('缩略图合计超过 20 MiB');
        thumbs.push({ page: n - 1, width: canvas.width, height: canvas.height, bytes });
      } finally { canvas.width = canvas.height = 1; page.cleanup(); }
    }
    return { thumbs, summary: `共 ${doc.numPages} 页` };
  });
  if (['pdf-word', 'pdf-text', 'pdf-images'].includes(tool)) return withParsedPdf(inputs[0].bytes, async doc => {
    if (tool === 'pdf-images') {
      if (typeof OffscreenCanvas !== 'function') throw new Error('当前环境缺少本地 PDF 图片渲染能力');
      const entries = {}; let total = 0;
      for (const p of selected) {
        const page = await doc.getPage(p + 1), viewport = page.getViewport({ scale: 1.5 });
        if (viewport.width * viewport.height > LIMITS.pixels) throw new Error('PDF 页面渲染超过 3,200 万像素');
        const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        try { await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise; const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()); total += bytes.length; if (total > LIMITS.output) throw new Error('PDF 图片输出超过 100 MiB'); entries[`${base}-${p + 1}.png`] = bytes; }
        finally { canvas.width = canvas.height = 1; page.cleanup(); }
      }
      return resultFile(`${base}-图片.zip`, 'application/zip', zipSync(entries, { level: 0 }), `已渲染 ${selected.length} 页 PNG`);
    }
    const pages = await pdfTextPages(doc);
    if (tool === 'pdf-text') return textResult(pages.map((text, i) => `第 ${i + 1} 页\n${text}`).join('\n\n'), `${base}.txt`, `已提取 ${pages.length} 页文字，不含图片或 OCR`);
    return makeWord(pages.flatMap((text, i) => text.split('\n').map((line, j) => new Paragraph({ pageBreakBefore: i > 0 && j === 0, children: [new TextRun(line)] }))), `${base}.docx`, `已生成 ${pages.length} 页可编辑文字文档；按阅读文字重排，不复刻图片、表格与版式`);
  });
  if (tool === 'pdf-split') {
    const entries = {}; let total = 0;
    for (const p of selected) { const doc = await PDFDocument.create(); const [page] = await doc.copyPages(source, [p]); doc.addPage(page); const checked = await pdfResult(await doc.save(), `${base}-${p + 1}.pdf`, '拆分页'); const bytes = checked.files[0].bytes; total += bytes.length; if (total > LIMITS.output) throw new Error('拆分输出超过 100 MiB'); entries[checked.files[0].name] = bytes; }
    return resultFile(`${base}-拆分.zip`, 'application/zip', zipSync(entries, { level: 0 }), `已拆分 ${selected.length} 页`);
  }
  if (tool === 'pdf-merge' || tool === 'pdf-pages') {
    const doc = await PDFDocument.create();
    const sources = tool === 'pdf-merge' ? [source, ...await Promise.all(inputs.slice(1).map(f => loadPdf(f.bytes)))] : [source];
    for (const s of sources) { const pages = await doc.copyPages(s, tool === 'pdf-pages' ? selected : s.getPageIndices()); if (doc.getPageCount() + pages.length > 200) throw new Error('结果超过 200 页'); pages.forEach(page => doc.addPage(page)); }
    if (layout) doc.getPages().forEach((page, i) => { if (layout[i].rotate) page.setRotation(degrees((page.getRotation().angle + layout[i].rotate) % 360)); });
    return pdfResult(await doc.save(), `${base}-${tool === 'pdf-merge' ? '合并' : '整理'}.pdf`, `已生成 ${doc.getPageCount()} 页 PDF；页面注释、链接与表单不作为保留承诺`);
  }
  if (tool === 'pdf-rotate') {
    const angle = Number(options.angle); if (![90, 180, 270].includes(angle)) throw new Error('请选择 90、180 或 270 度');
    selected.forEach(p => source.getPage(p).setRotation(degrees((source.getPage(p).getRotation().angle + angle) % 360)));
  } else if (tool === 'pdf-number') {
    const font = await source.embedFont(StandardFonts.Helvetica);
    selected.forEach(p => { const page = source.getPage(p); page.drawText(`${p + 1} / ${source.getPageCount()}`, { x: page.getWidth() / 2 - 20, y: 18, size: 10, font }); });
  } else if (tool === 'pdf-watermark') {
    if (typeof options.watermark !== 'string' || !options.watermark.trim() || options.watermark.length > 60) throw new Error('请输入 1–60 字水印');
    // 水印每页都印，缺字会满篇方框；在处理前就请员工换字。
    const missing = new Set(), watermark = fitFont(options.watermark, missing);
    if (missing.size) throw new Error(`水印里的“${missingList(missing)}”不在内置字库（常用简繁体字）里，会显示为方框；请换成常用字`);
    if (!watermark.trim()) throw new Error('请输入 1–60 字水印');
    // 由同一中文排版引擎生成透明文字页，再嵌入原 PDF，避免第二套字体实现。
    const stampBytes = await renderDefinition({ content: [{ text: watermark, fontSize: 32, color: '#aaaaaa', alignment: 'center', margin: [0, 320, 0, 0] }] });
    const [stamp] = await source.embedPdf(stampBytes);
    selected.forEach(p => { const page = source.getPage(p); page.drawPage(stamp, { width: page.getWidth(), height: page.getHeight(), opacity: 0.3 }); });
  } else throw new Error('未知 PDF 功能项');
  return pdfResult(await source.save(), `${base}-处理.pdf`, `已处理 ${selected.length} 页；原件保持不变`);
}
