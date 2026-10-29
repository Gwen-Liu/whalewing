import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { unsupportedImageReason } from '../src/utilities/catalog.js';
import { LIMITS, validateFiles, screenFiles, decodeText, readOfficeZip, inspectOffice, wordToExcel, excelSheets, excelToWord, extractMedia, parseCsv, transformText, convertSpreadsheet, smallTextTool, fileTool } from '../src/utilities/core.js';
import { inspectImage, convertImages } from '../src/utilities/image.js';
import { runUtility } from '../src/utilities/worker.js';

// 转换依赖从真实算法消费者解析，不借用别的 profile 或全局包。
const require = createRequire(new URL('../src/utilities/core.js', import.meta.url));
const ExcelJS = require('exceljs');
const { zipSync, unzipSync } = require('fflate');
const encoder = new TextEncoder(), decoder = new TextDecoder();
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const contentTypes = (extension, main) => encoder.encode(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.${extension === 'docx' ? 'wordprocessingml.document' : extension === 'xlsx' ? 'spreadsheetml.sheet' : 'presentationml.presentation'}.main+xml"/></Types>`);
const docx = (body, extra = {}) => zipSync({ '[Content_Types].xml': contentTypes('docx', 'word/document.xml'), 'word/document.xml': encoder.encode(`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`), ...extra });
const table = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>0012</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>中文 &amp; 数据</w:t></w:r></w:p><w:p><w:r><w:t>第二行</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
const xlsx = async callback => { const book = new ExcelJS.Workbook(); callback(book); return new Uint8Array(await book.xlsx.writeBuffer()); };
const textResult = result => decoder.decode(result.files[0].bytes);

test('选件预算在调用 arrayBuffer 前拒收', async () => {
  let reads = 0;
  const file = { name: '巨大.docx', size: LIMITS.file + 1, async arrayBuffer() { reads++; return new ArrayBuffer(1); } };
  await assert.rejects(runUtility({ tool: 'word-excel', files: [file] }), /25 MiB/);
  assert.equal(reads, 0);
  assert.throws(() => validateFiles(Array.from({ length: 21 }, () => ({ name: 'x.png', size: 1 })), 'image'), /1–20/);
  assert.throws(() => validateFiles(Array.from({ length: 5 }, () => ({ name: 'x.png', size: LIMITS.file })), 'image'), /总输入/);
  assert.throws(() => validateFiles([{ name: 'a.exe', size: 1 }], 'media'), /扩展名/);
  assert.throws(() => decodeText(new Uint8Array([0xff])), /UTF-8/);
  assert.throws(() => decodeText(new Uint8Array(LIMITS.text + 1)), /2 MiB/);
});

test('DOCX 多表提取保留中文、前导零与段落，不改变原字节', async () => {
  const input = docx(table + table), before = input.slice();
  const result = await wordToExcel(input, '资料.docx');
  assert.deepEqual(input, before);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(result.files[0].bytes);
  assert.equal(workbook.worksheets.length, 2);
  assert.equal(workbook.worksheets[0].getCell('A1').value, '0012');
  assert.equal(workbook.worksheets[0].getCell('B1').value, '中文 & 数据\n第二行');
  assert.match(result.summary, /4 个单元格/);
});

test('DOCX 无表、嵌套、合并、畸形 XML 和 DTD 分别拒收', async () => {
  await assert.rejects(wordToExcel(docx('<w:p/>'), 'x.docx'), /没有表格/);
  await assert.rejects(wordToExcel(docx(table.replace('<w:p>', `<w:tbl>${table}</w:tbl><w:p>`)), 'x.docx'), /嵌套/);
  for (const tag of ['gridSpan', 'vMerge', 'hMerge']) await assert.rejects(wordToExcel(docx(table.replace('<w:tc>', `<w:tc><w:tcPr><w:${tag} w:val="2"/></w:tcPr>`)), 'x.docx'), /合并/);
  await assert.rejects(wordToExcel(docx('<w:tbl><bad></w:tbl>'), 'x.docx'), /XML/);
  const bad = zipSync({ '[Content_Types].xml': contentTypes('docx', 'word/document.xml'), 'word/document.xml': encoder.encode(`<!DOCTYPE x [<!ENTITY x SYSTEM "file:///secret">]><w:document xmlns:w="${W}">&x;</w:document>`) });
  await assert.rejects(wordToExcel(bad, 'x.docx'), /DTD/);
  assert.throws(() => inspectOffice(docx(table), 'xlsx'), /实际类型/);
});

test('Word 内容控件、修订和隐藏文字不会以空值或删除值成功导出', async () => {
  const cellControl = '<w:tbl><w:tr><w:tc><w:sdt><w:sdtContent><w:p><w:r><w:t>合同编号0012</w:t></w:r></w:p></w:sdtContent></w:sdt></w:tc></w:tr></w:tbl>';
  const rowControl = `<w:tbl><w:sdt><w:sdtContent>${table.slice(7, -8)}</w:sdtContent></w:sdt></w:tbl>`;
  for (const body of [cellControl, rowControl, `<w:sdt><w:sdtContent>${table}</w:sdtContent></w:sdt>`, table.replace('<w:r>', '<w:r><w:rPr><w:vanish/></w:rPr>'), table.replace('<w:r>', '<w:del><w:r>').replace('</w:r>', '</w:r></w:del>')]) await assert.rejects(wordToExcel(docx(body), 'x.docx'), /复杂结构/);
});

test('Excel 指定工作表导出原数值、字符串、日期、布尔、富文本与公式缓存', async () => {
  const bytes = await xlsx(book => {
    book.addWorksheet('跳过').addRow(['不选择']);
    const sheet = book.addWorksheet('选定表');
    sheet.addRow(['0012', 0.25, true, '  空格  ', new Date('2026-01-02T03:04:05Z'), { richText: [{ text: '富' }, { text: '文本' }] }, { formula: '1+2', result: 3 }, { formula: '1/0', result: { error: '#DIV/0!' } }]);
    sheet.getCell('B1').numFmt = '0%';
  });
  assert.deepEqual((await excelSheets(bytes)).sheets, ['跳过', '选定表']);
  const result = await excelToWord(bytes, '工作簿.xlsx', '选定表');
  const entries = readOfficeZip(result.files[0].bytes), xml = decoder.decode(entries.get('word/document.xml'));
  for (const value of ['0012', '0.25', 'TRUE', '  空格  ', '2026-01-02 03:04:05 UTC', '富文本', '#DIV/0!', '>3<']) assert.ok(xml.includes(value), value);
  assert.equal(xml.includes('25%'), false);
  assert.equal(xml.includes('不选择'), false);
  assert.match(result.summary, /不迁移数字显示格式/);
  await assert.rejects(excelToWord(bytes, 'x.xlsx', ''), /选择工作表/);
  await assert.rejects(excelToWord(bytes, 'x.xlsx', '不存在'), /不存在/);
});

test('Excel 公式缺结果、合并与稀疏超大范围拒收', async () => {
  const formula = await xlsx(book => book.addWorksheet('s').getCell('A1').value = { formula: '1+1' });
  await assert.rejects(excelToWord(formula, 'x.xlsx', 's'), /没有已保存结果/);
  const merged = await xlsx(book => { const sheet = book.addWorksheet('s'); sheet.getCell('A1').value = 'x'; sheet.mergeCells('A1:B1'); });
  await assert.rejects(excelToWord(merged, 'x.xlsx', 's'), /合并/);
  const sparse = await xlsx(book => { const sheet = book.addWorksheet('s'); sheet.getCell('A50001').value = 'a'; sheet.getCell('B1').value = 'b'; });
  await assert.rejects(excelSheets(sparse), /100,000/);
});

test('Excel 极小 XML 中的巨型列声明、倒置区间和非法维度在库解析前拒收', async () => {
  const bytes = await xlsx(book => book.addWorksheet('s').addRow(['x']));
  const original = unzipSync(bytes), xml = decoder.decode(original['xl/worksheets/sheet1.xml']);
  for (const declaration of ['<cols><col min="1" max="2147483647"/></cols>', '<cols><col min="3" max="2"/></cols>', '<cols><col min="1" max="4"/><col min="3" max="5"/></cols>', '<cols><col min="-1" max="4"/></cols>']) {
    const edited = { ...original, 'xl/worksheets/sheet1.xml': encoder.encode(xml.replace('<sheetData>', `${declaration}<sheetData>`)) };
    await assert.rejects(excelSheets(zipSync(edited)), /列范围/);
  }
  for (const range of ['A1:XFD1048576', 'B2:A1', 'A0:B1', 'A1:ZZZ1']) {
    const edited = { ...original, 'xl/worksheets/sheet1.xml': encoder.encode(xml.replace(/<dimension[^>]*\/>/, `<dimension ref="${range}"/>`)) };
    await assert.rejects(excelSheets(zipSync(edited)), /范围/);
  }
  const foreign = xml.replace('<sheetData>', '<cols xmlns="urn:foreign"><col min="1" max="2147483647"/></cols><sheetData>');
  await assert.rejects(excelSheets(zipSync({ ...original, 'xl/worksheets/sheet1.xml': encoder.encode(foreign) })), /命名空间/);
});

test('Excel 数据验证不迁移也不逐地址展开，普通与超范围规则均保留单元格文本', async t => {
  const Range = require('exceljs/lib/doc/range.js');
  const expansion = t.mock.method(Range.prototype, 'forEachAddress', () => { throw new Error('不应展开数据验证地址'); });
  const bytes = await xlsx(book => book.addWorksheet('s').addRow(['001']));
  const original = unzipSync(bytes), xml = decoder.decode(original['xl/worksheets/sheet1.xml']);
  for (const sqref of ['A1:A2', 'A1:A20001']) {
    const rule = `<dataValidations count="1"><dataValidation type="whole" sqref="${sqref}"><formula1>0</formula1><formula2>1</formula2></dataValidation></dataValidations>`;
    const edited = zipSync({ ...original, 'xl/worksheets/sheet1.xml': encoder.encode(xml.replace('</worksheet>', `${rule}</worksheet>`)) });
    const output = await excelToWord(edited, 'x.xlsx', 's');
    assert.match(decoder.decode(readOfficeZip(output.files[0].bytes).get('word/document.xml')), />001</);
  }
  assert.equal(expansion.mock.callCount(), 0);
});

test('Excel 工作表身份、文件引用及命名范围在模型构建前检查', async () => {
  const bytes = await xlsx(book => book.addWorksheet('s').addRow(['x']));
  const original = unzipSync(bytes), workbook = decoder.decode(original['xl/workbook.xml']);
  for (const id of ['100000', '0', '-1', 'NaN']) await assert.rejects(excelSheets(zipSync({ ...original, 'xl/workbook.xml': encoder.encode(workbook.replace('sheetId="1"', `sheetId="${id}"`)) })), /身份/);
  const duplicate = workbook.replace('</sheets>', '<sheet sheetId="1" name="重复" r:id="rId4"/></sheets>');
  await assert.rejects(excelSheets(zipSync({ ...original, 'xl/workbook.xml': encoder.encode(duplicate) })), /身份/);
  const missing = { ...original }; delete missing['xl/worksheets/sheet1.xml'];
  await assert.rejects(excelSheets(zipSync(missing)), /引用/);
  const named = workbook.replace('</workbook>', '<definedNames><definedName name="Large">s!$A$1:$B$50001</definedName></definedNames></workbook>');
  await assert.rejects(excelSheets(zipSync({ ...original, 'xl/workbook.xml': encoder.encode(named) })), /100,000/);
});

test('Excel 共享字符串、XML 转义和换行节点展开在构建 Word 前拒收', async t => {
  // 固定 docx 9.10.0 的 ESM 导出与核心相同；钩住打包调用，失守时也不实际生成大文件。
  const { Packer } = await import(pathToFileURL(require.resolve('docx').replace(/index\.cjs$/, 'index.mjs')).href);
  const packing = t.mock.method(Packer, 'toArrayBuffer', () => { throw new Error('测试阻断：预算未在打包前拒收'); });
  const small = await xlsx(book => book.addWorksheet('s').addRow(['普通文本']));
  await assert.rejects(excelToWord(small, 'x.xlsx', 's'), /测试阻断/);
  assert.equal(packing.mock.callCount(), 1); packing.mock.resetCalls();
  for (const [text, count] of [['x'.repeat(32760), 4000], ['&'.repeat(32760), 800], ['\n'.repeat(32760), 2]]) {
    const input = await xlsx(book => { const sheet = book.addWorksheet('s'); for (let i = 0; i < count; i++) sheet.addRow([text]); });
    assert.ok(input.length < 100000, '压缩输入保持很小，不生成真实的大展开产物');
    await assert.rejects(excelToWord(input, '共享文本.xlsx', 's'), /Word 展开文字与节点构建预算超过 100 MiB/);
  }
  assert.equal(packing.mock.callCount(), 0);
});

test('Office 资源只提取对应 media 与清单，不执行嵌入对象', () => {
  const bytes = docx(table, { 'word/media/a.png': new Uint8Array([1, 2, 3]), 'word/embeddings/run.exe': new Uint8Array([4]), 'xl/media/not-word.png': new Uint8Array([5]) });
  const result = extractMedia(bytes, '合同.docx');
  const output = unzipSync(result.files[0].bytes);
  assert.deepEqual(Object.keys(output).sort(), ['word/media/a.png', '资源清单.txt'].sort());
  assert.match(decoder.decode(output['资源清单.txt']), /3 字节/);
  assert.throws(() => extractMedia(docx(table), 'x.docx'), /没有内置媒体/);
});

test('ZIP 路径、重复条目、加密、错误 CRC 和过多条目拒收', () => {
  for (const path of ['../x', '/x', 'x/../a', 'C:x', 'x\\a']) assert.throws(() => readOfficeZip(zipSync({ [path]: new Uint8Array([1]) })), /路径/);
  const encrypted = zipSync({ a: new Uint8Array([1]) });
  const view = new DataView(encrypted.buffer); view.setUint16(6, view.getUint16(6, true) | 1, true);
  let central = encrypted.findIndex((_, p) => view.byteLength >= p + 4 && view.getUint32(p, true) === 0x02014b50);
  view.setUint16(central + 8, view.getUint16(central + 8, true) | 1, true);
  assert.throws(() => readOfficeZip(encrypted), /加密/);
  const duplicate = zipSync({ a: new Uint8Array([1]), b: new Uint8Array([2]) });
  const d = new DataView(duplicate.buffer);
  for (let p = 0; p + 46 < duplicate.length; p++) { if (d.getUint32(p, true) === 0x02014b50 && duplicate[p + 46] === 98) duplicate[p + 46] = 97; if (d.getUint32(p, true) === 0x04034b50 && duplicate[p + 30] === 98) duplicate[p + 30] = 97; }
  assert.throws(() => readOfficeZip(duplicate), /重复/);
  const badCrc = zipSync({ a: new Uint8Array([1, 2, 3]) }, { level: 0 }); badCrc[31] = 9;
  assert.throws(() => readOfficeZip(badCrc), /校验/);
  assert.throws(() => readOfficeZip(zipSync(Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`f${i}`, new Uint8Array()])))), /2,000/);
});

test('ZIP 伪造解压声明在实际膨胀时被增量拒收', () => {
  const bytes = zipSync({ bomb: new Uint8Array(LIMITS.entry + 1) }, { level: 9 });
  const view = new DataView(bytes.buffer);
  view.setUint32(22, 100, true);
  for (let p = 0; p + 46 < bytes.length; p++) if (view.getUint32(p, true) === 0x02014b50) view.setUint32(p + 24, 100, true);
  assert.throws(() => readOfficeZip(bytes), /实际解压/);
});

test('CSV 保留引号、换行和前导零，拒收模糊表头与不等长行', () => {
  const csv = '编号,说明\r\n001,"甲,乙\n""丙"""\r\n';
  assert.deepEqual(parseCsv(csv), [['编号', '说明'], ['001', '甲,乙\n"丙"']]);
  assert.deepEqual(JSON.parse(textResult(transformText(csv, 'csv-json'))), [{ 编号: '001', 说明: '甲,乙\n"丙"' }]);
  for (const bad of ['', 'a,a\nx,y', ',b\nx,y', 'a,b\nx', 'a\n"未闭合', 'a\n"x"after']) assert.throws(() => parseCsv(bad), /CSV/);
});

test('CSV 长表头多行复制在 JSON 序列化前拒收', t => {
  const input = `${'h'.repeat(1024 ** 2)}\n${Array.from({ length: 200 }, () => 'x').join('\n')}`;
  assert.ok(encoder.encode(input).length < LIMITS.text);
  const original = JSON.stringify;
  const serialization = t.mock.method(JSON, 'stringify', (value, ...args) => {
    if (Array.isArray(value)) throw new Error('测试阻断：预算未在数组序列化前拒收');
    return original(value, ...args);
  });
  assert.throws(() => transformText(input, 'csv-json'), /JSON 展开输出超过 100 MiB/);
  assert.equal(serialization.mock.callCount(), 0);
});

test('JSON 转 CSV 严格字符串同键，公式触发字段计数且显式转义', () => {
  const result = transformText(JSON.stringify([{ a: '=1+1', b: '中文,换行\n内容', c: '001' }, { c: '002', b: '@x', a: '安全' }]), 'json-csv');
  assert.equal(result.changed, 2);
  assert.match(result.summary, /2 个/);
  assert.deepEqual(parseCsv(textResult(result)), [['a', 'b', 'c'], ["'=1+1", '中文,换行\n内容', '001'], ['安全', "'@x", '002']]);
  for (const value of [[], [{ a: 1 }], [{ a: true }], [{ a: null }], [{ a: {} }], [{ a: 'x' }, { b: 'y' }], [{ '': 'x' }]]) assert.throws(() => transformText(JSON.stringify(value), 'json-csv'), /JSON/);
  assert.throws(() => transformText(JSON.stringify([{ '=x': '', "'=x": '' }]), 'json-csv'), /重名/);
  for (const prefix of ['=', '+', '-', '@', '\t', '\r', '\n', '＝', '＋', '－', '＠']) {
    const escaped = transformText(JSON.stringify([{ a: `${prefix}test` }]), 'json-csv');
    assert.equal(escaped.changed, 1); assert.equal(parseCsv(textResult(escaped))[1][0], `'${prefix}test`);
  }
});

test('文本清理、Unicode 统计与大小拒收', () => {
  assert.equal(textResult(transformText('甲\r\n甲\n乙', 'dedupe')), '甲\n乙');
  assert.equal(textResult(transformText('甲\n \n乙\n', 'remove-empty')), '甲\n乙');
  assert.equal(JSON.parse(textResult(transformText('😀中', 'statistics'))).字符数, 2);
  assert.throws(() => transformText('x'.repeat(LIMITS.text + 1), 'statistics'), /2 MiB/);
});

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64'));
test('图片头先拒收超像素、伪扩展名与截断，动图标记为只取第一帧', async () => {
  assert.deepEqual(inspectImage(png, 'x.png'), { width: 1, height: 1, mime: 'image/png' });
  assert.throws(() => inspectImage(png, 'x.jpg'), /扩展名/);
  const big = png.slice(); new DataView(big.buffer).setUint32(16, LIMITS.pixels + 1);
  assert.throws(() => inspectImage(big, 'x.png'), /像素/);
  // 在 IHDR 之后插入动画控制块：图片照常接收，只标记为动图。
  const animated = Uint8Array.from([...png.subarray(0, 33), 0, 0, 0, 8, ...encoder.encode('acTL'), 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, ...png.subarray(33)]);
  assert.equal(inspectImage(animated, 'x.png').animated, true);
  assert.throws(() => inspectImage(png.subarray(0, 40), 'x.png'), /截断|超出|请选择/);
  if (typeof globalThis.OffscreenCanvas === 'undefined') await assert.rejects(convertImages([{ name: 'x.png', size: png.length }], { format: 'jpeg', quality: 0.8, maxEdge: 100 }), /后台图片处理/);
});

const box = (kind, ...parts) => { const body = parts.flatMap(part => [...part]); return Uint8Array.from([...u32(body.length + 8), ...encoder.encode(kind), ...body]); };
const u32 = n => [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const le = (n, bytes) => Array.from({ length: bytes }, (_, i) => n >>> 8 * i & 255);
test('新增格式只读文件头：GIF、BMP、ICO、AVIF、JFIF 取得尺寸，HEIC 与 TIFF 明确说明', () => {
  const gif = Uint8Array.from(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  assert.deepEqual(inspectImage(gif, '动图.gif'), { width: 1, height: 1, mime: 'image/gif', animated: false });
  const frame = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 0x44, 0];
  assert.equal(inspectImage(Uint8Array.from([...gif.subarray(0, gif.length - 1), ...frame, 0x3b]), 'x.gif').animated, true);
  assert.throws(() => inspectImage(gif, 'x.png'), /扩展名/);
  const bmp = Uint8Array.from([...encoder.encode('BM'), ...le(70, 4), 0, 0, 0, 0, ...le(54, 4), ...le(40, 4), ...le(2, 4), ...le(-3, 4), 1, 0, 24, 0, ...new Array(40).fill(0)]);
  assert.deepEqual(inspectImage(bmp, '位图.bmp'), { width: 2, height: 3, mime: 'image/bmp' });
  const ico = Uint8Array.from([0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 32, 0, ...le(png.length, 4), ...le(22, 4), ...png]);
  assert.deepEqual(inspectImage(ico, '图标.ico'), { width: 1, height: 1, mime: 'image/x-icon', bounded: true });
  const ftyp = brand => box('ftyp', encoder.encode(brand), [0, 0, 0, 0], encoder.encode('mif1'));
  const avif = Uint8Array.from([...ftyp('avif'), ...box('meta', [0, 0, 0, 0], box('iprp', box('ipco', box('ispe', [0, 0, 0, 0], u32(64), u32(48)))))]);
  assert.deepEqual(inspectImage(avif, '照片.avif'), { width: 64, height: 48, mime: 'image/avif', bounded: true, animated: false });
  assert.throws(() => inspectImage(avif, '照片.png'), /扩展名/);
  assert.throws(() => inspectImage(Uint8Array.from([...ftyp('heic'), ...box('meta', [0, 0, 0, 0])]), 'IMG.heic'), /HEIC/);
  assert.throws(() => inspectImage(Uint8Array.from([...encoder.encode('II*\0'), 8, 0, 0, 0]), 'scan.tif'), /TIFF/);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 16, 0, 32, 1, 1, 0x11, 0, 0xff, 0xda, 0, 2]);
  assert.deepEqual(inspectImage(jpeg, '下载.jfif'), { width: 32, height: 16, mime: 'image/jpeg' });
  for (const name of ['x.jfif', 'x.avif', 'x.gif', 'x.bmp', 'x.ico']) validateFiles([{ name, size: 1 }], 'image');
  assert.throws(() => validateFiles([{ name: 'IMG_0001.HEIC', size: 1 }], 'image'), /HEIC.*导出为 JPEG 或 PNG/);
  assert.throws(() => validateFiles([{ name: '扫描.tiff', size: 1 }], 'image'), /TIFF 图片尚不支持.*JPEG 或 PNG/);
  assert.throws(() => validateFiles([{ name: '图标.svg', size: 1 }], 'image'), /SVG 图片尚不支持.*JPEG 或 PNG/);
  // 按内容认出的 HEIC、TIFF 也给同一句建议。
  assert.throws(() => inspectImage(Uint8Array.from([...ftyp('heic'), ...box('meta', [0, 0, 0, 0])]), 'IMG.jpg'), /HEIC.*导出为 JPEG 或 PNG/);
  assert.throws(() => inspectImage(Uint8Array.from([...encoder.encode('II*\0'), 8, 0, 0, 0]), 'scan.png'), /TIFF.*JPEG 或 PNG/);
});

test('暂不支持的图片格式按扩展名认出（不分大小写），给出先导出为 JPEG 或 PNG 的说明；能处理的格式不提示', () => {
  for (const name of ['IMG_0001.HEIC', 'a.heif', 'scan.TIF', '扫描.tiff', 'logo.svg']) assert.match(unsupportedImageReason(name), /尚不支持|暂不支持/, name);
  assert.match(unsupportedImageReason('photo.heic'), /^HEIC \/ HEIF 照片暂不支持.*导出为 JPEG 或 PNG/);
  for (const name of ['a.png', 'b.jpg', 'c.jfif', 'd.webp', 'e.avif', 'heic', 'heic.png', '', undefined]) assert.equal(unsupportedImageReason(name), '', String(name));
});

test('批量选件：个数和总输入整批检查，单个文件超过 25 MiB 或格式暂不支持只返回它的原因', () => {
  const ok = { name: 'a.png', size: LIMITS.file }, big = { name: 'big.png', size: LIMITS.file + 1 };
  assert.deepEqual(screenFiles([ok, big, { name: 'IMG.heic', size: 9 }, { name: 'empty.png', size: 0 }, { name: 'x.doc', size: 9 }], 'image').map(Boolean), [false, true, true, true, true]);
  assert.match(screenFiles([big], 'image')[0], /25 MiB/);
  // 不合格的文件不读取，也不计入总输入：4 个刚好 25 MiB 的合格文件加一个超大文件，合计没超过 100 MiB。
  assert.deepEqual(screenFiles([ok, ok, ok, ok, big], 'image'), ['', '', '', '', screenFiles([big], 'image')[0]]);
  assert.throws(() => screenFiles([ok, ok, ok, ok, ok], 'image'), /总输入超过 100 MiB/);
  assert.throws(() => screenFiles(Array.from({ length: 21 }, () => ({ name: 'x.png', size: 1 })), 'image'), /1–20/);
  assert.throws(() => screenFiles([ok, null], 'image'), /文件信息无效/);
  // 其余功能项仍是任何一个不合格就整体停止。
  assert.throws(() => validateFiles([ok, big], 'image'), /25 MiB/);
});

/** 画布夹具：输出大小随像素和质量变化，便于核对尺寸、格式与按目标大小压缩。 */
async function withCanvas(callback) {
  const saved = new Map(), outputs = [];
  for (const key of ['createImageBitmap', 'OffscreenCanvas']) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async blob => { const v = new DataView(await blob.arrayBuffer()); return { width: v.getUint32(16), height: v.getUint32(20), close() {} }; } });
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { return { fillRect() {}, drawImage() {}, translate() {}, rotate() {}, scale() {}, measureText: text => ({ width: text.length * 5 }), strokeText() {}, fillText() {} }; }
    async convertToBlob({ type, quality }) { outputs.push([this.width, this.height, type]); return new Blob([new Uint8Array(Math.max(1, Math.round(this.width * this.height * (type === 'image/png' ? 1 : quality))))], { type }); }
  } });
  try { await callback(outputs); } finally { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
}
const sized = (name, width, height) => { const b = png.slice(), v = new DataView(b.buffer); v.setUint32(16, width); v.setUint32(20, height); return new File([b], name); };

test('图片转换默认保持原尺寸；单张失败只记入明细，成功的照常交付并报告进度', async () => {
  await withCanvas(async outputs => {
    const progress = [];
    const result = await convertImages([sized('大图.png', 4000, 3000), new File(['坏数据'], '坏图.png'), sized('小图.png', 120, 80)], { action: 'image', mode: 'convert', format: 'keep', quality: 0.9 }, (done, total) => progress.push([done, total]));
    assert.deepEqual(outputs, [[4000, 3000, 'image/png'], [120, 80, 'image/png']], '保持原格式与原尺寸，不再默认缩到 1920');
    assert.deepEqual(result.files.map(file => file.name), ['1-大图-处理.png', '3-小图-处理.png']);
    assert.deepEqual(result.failed, [1]); assert.match(result.listing[1], /坏图\.png：失败/); assert.match(result.summary, /已处理 2 张图片，1 张失败/);
    assert.deepEqual(progress, [[0, 3], [1, 3], [2, 3]]);
    const retried = await convertImages([sized('小图.png', 120, 80)], { action: 'image', mode: 'convert', format: 'webp', quality: 0.9, positions: [1] });
    assert.equal(retried.files[0].name, '2-小图-处理.webp', '只重试失败项时沿用原序号');
    await assert.rejects(convertImages([new File(['x'], 'a.png'), new File(['y'], 'b.png')], { action: 'image', format: 'png' }), /2 张图片全部处理失败/);
    await assert.rejects(convertImages([new File(['x'], 'a.png')], { action: 'image', format: 'png' }), /PNG|请选择有效/);
    await assert.rejects(convertImages([sized('a.png', 10, 10)], { action: 'image-rotate', format: 'ico', angle: 90, flip: 'none' }), /有效格式/, 'ICO 只用于转换格式');
  });
});

test('一批里有超过 25 MiB 的文件或 HEIC 照片时，只有它们记为失败并写明原因，其余照常处理；拼接仍整体停止', async () => {
  await withCanvas(async outputs => {
    let reads = 0;
    const unread = (name, size) => ({ name, size, async arrayBuffer() { reads++; return new ArrayBuffer(size); } });
    const big = unread('超大.png', LIMITS.file + 1), heic = unread('IMG_0001.HEIC', 64), progress = [];
    const result = await convertImages([sized('小图.png', 120, 80), big, heic, sized('另一张.png', 60, 40)], { action: 'image', mode: 'convert', format: 'keep', quality: 0.9 }, (done, total) => progress.push([done, total]));
    assert.deepEqual(result.files.map(file => file.name), ['1-小图-处理.png', '4-另一张-处理.png'], '其余照常处理，沿用原序号');
    assert.deepEqual(outputs, [[120, 80, 'image/png'], [60, 40, 'image/png']]);
    assert.deepEqual(result.failed, [1, 2], '只重试失败的会只重试这两个');
    assert.match(result.listing[1], /^超大\.png：失败，.*25 MiB/);
    assert.match(result.listing[2], /^IMG_0001\.HEIC：失败，HEIC.*导出为 JPEG 或 PNG/);
    assert.match(result.summary, /^已处理 2 张图片，2 张失败/);
    assert.deepEqual(progress, [[0, 4], [1, 4], [2, 4], [3, 4]]);
    assert.equal(reads, 0, '不合格的文件不读取');
    // 只选了一个不合格的文件：直接说明原因，不生成结果。
    await assert.rejects(convertImages([big], { action: 'image', mode: 'convert', format: 'png' }), /25 MiB/);
    await assert.rejects(convertImages([heic], { action: 'image', mode: 'convert', format: 'png' }), /HEIC.*导出为 JPEG 或 PNG/);
    await assert.rejects(convertImages([big, heic], { action: 'image', mode: 'convert', format: 'png' }), /2 张图片全部处理失败/);
    // 拼接要用到每一张：有一张不合格就整体停止，并写明是哪个文件。
    outputs.length = 0;
    await assert.rejects(convertImages([sized('a.png', 10, 10), big], { action: 'image-stitch', format: 'png', direction: 'vertical' }), /超大\.png：.*25 MiB/);
    assert.deepEqual(outputs, []); assert.equal(reads, 0);
  });
});

test('ICO 图标按不超过原图的尺寸打包多帧 PNG；调整尺寸与按目标大小压缩', async () => {
  await withCanvas(async outputs => {
    const icon = await convertImages([sized('标志.png', 120, 90)], { action: 'image', mode: 'convert', format: 'ico' });
    const bytes = icon.files[0].bytes, view = new DataView(bytes.buffer);
    assert.equal(icon.files[0].mime, 'image/x-icon'); assert.equal(icon.files[0].name, '1-标志-处理.ico');
    assert.deepEqual([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)], [0, 1, 4]);
    assert.deepEqual([0, 1, 2, 3].map(i => bytes[6 + 16 * i]), [16, 32, 48, 64]);
    assert.ok(outputs.every(([width, height]) => width === height), '图标帧都是方形');
    outputs.length = 0;
    await convertImages([sized('a.png', 1200, 800)], { action: 'image', mode: 'resize', format: 'keep', resizeWidth: 600, resizeHeight: '' });
    await convertImages([sized('a.png', 1200, 800)], { action: 'image', mode: 'resize', format: 'jpeg', quality: 0.8, resizeWidth: 300, resizeHeight: 300, keepRatio: false });
    assert.deepEqual(outputs, [[600, 400, 'image/png'], [300, 300, 'image/jpeg']]);
    await assert.rejects(convertImages([sized('a.png', 10, 10)], { action: 'image', mode: 'resize', format: 'png', resizeWidth: '', resizeHeight: '' }), /宽度或高度/);
    const small = await convertImages([sized('照片.png', 1000, 800)], { action: 'image', mode: 'compress', format: 'jpeg', target: 'size', targetKB: 50 });
    assert.ok(small.files[0].bytes.length <= 50 * 1024); assert.match(small.listing[0], /缩小了尺寸/);
    const floor = await convertImages([sized('照片.png', 4000, 4000)], { action: 'image', mode: 'compress', format: 'webp', target: 'size', targetKB: 10 });
    assert.match(floor.summary, /未能压到目标大小/);
    await assert.rejects(convertImages([sized('a.png', 10, 10)], { action: 'image', mode: 'compress', format: 'png' }), /有效格式/, 'PNG 无损，压缩只能选 JPEG 或 WebP');
  });
});

test('Worker 真实处理入口读取文件并返回可回读产物', async () => {
  const bytes = docx(table), file = new File([bytes], '样例.docx');
  const result = await runUtility({ tool: 'word-excel', files: [file] });
  assert.equal(readOfficeZip(result.files[0].bytes).has('xl/workbook.xml'), true);
  const csv = new File([encoder.encode('a\n001')], '资料.csv');
  assert.deepEqual(JSON.parse(textResult(await runUtility({ tool: 'text', files: [csv], options: { operation: 'csv-json' } }))), [{ a: '001' }]);
});

test('新增 Excel/CSV 与 Excel JSON 使用同一数据语义并回读真实文件', async () => {
  const csv = encoder.encode('编号,值\r\n001,"甲,乙"\r\n002,=1+1');
  const imported = await runUtility({ tool: 'csv-excel', files: [new File([csv], '数据.csv')] });
  const bytes = imported.files[0].bytes, book = new ExcelJS.Workbook(); await book.xlsx.load(bytes);
  assert.equal(book.worksheets[0].getCell('A2').value, '001'); assert.equal(book.worksheets[0].getCell('B3').value, '=1+1');
  const output = await convertSpreadsheet(bytes, 'x.xlsx', 'excel-csv', '数据');
  assert.deepEqual(parseCsv(textResult(output)), [['编号', '值'], ['001', '甲,乙'], ['002', "'=1+1"]]); assert.match(output.summary, /1 个/);
  const json = await convertSpreadsheet(bytes, 'x.xlsx', 'excel-json', '数据');
  assert.deepEqual(JSON.parse(textResult(json)), [{ 编号: '001', 值: '甲,乙' }, { 编号: '002', 值: '=1+1' }]);
  await assert.rejects(convertSpreadsheet(bytes, 'x.xlsx', 'excel-json', ''), /选择工作表/);
  await assert.rejects(convertSpreadsheet(encoder.encode('a,a\nx,y'), 'x.csv', 'csv-excel'), /唯一/);
  const noHeader = await xlsx(book => book.addWorksheet('s').addRow(['', '值']));
  await assert.rejects(convertSpreadsheet(noHeader, 'x.xlsx', 'excel-json', 's'), /表头/);
});

test('逐行集合与大小写空白保持明确操作边界', () => {
  assert.equal(textResult(smallTextTool('line-compare', ' a\nb\nb', { other: 'b\nc', mode: 'common' })), 'b');
  assert.equal(textResult(smallTextTool('line-compare', ' a\nb', { other: 'b\nc', mode: 'left' })), ' a');
  assert.equal(textResult(smallTextTool('line-compare', ' a\nb', { other: 'b\nc', mode: 'right' })), 'c');
  assert.equal(textResult(smallTextTool('text-case', 'Ab中', { mode: 'upper' })), 'AB中');
  assert.equal(textResult(smallTextTool('text-case', 'Ab中', { mode: 'lower' })), 'ab中');
  assert.equal(textResult(smallTextTool('text-case', ' a \r\n b ', { mode: 'trim' })), 'a\nb');
  assert.equal(textResult(smallTextTool('text-case', 'a\t  b\nc', { mode: 'spaces' })), 'a b\nc');
  assert.throws(() => smallTextTool('line-compare', 'a', { other: 'x'.repeat(LIMITS.text + 1), mode: 'common' }), /2 MiB/);
});

test('Base64 与 URL 组件严格 Unicode 往返，畸形字节明确拒收', () => {
  for (const text of ['中文😀\n', '\ufeff内容', '']) {
    const encoded = textResult(smallTextTool('base64', text, { mode: 'encode' }));
    assert.deepEqual(smallTextTool('base64', encoded, { mode: 'decode' }).files[0].bytes, encoder.encode(text));
  }
  for (const invalid of ['YQ', 'YQ= ', 'YR==', '/w==', '=AAA']) assert.throws(() => smallTextTool('base64', invalid, { mode: 'decode' }), /Base64|UTF-8/);
  const source = '中文 &/=+%';
  assert.equal(textResult(smallTextTool('url-codec', textResult(smallTextTool('url-codec', source, { mode: 'encode' })), { mode: 'decode' })), source);
  assert.throws(() => smallTextTool('url-codec', '%GG', { mode: 'decode' }), /无效/);
  assert.equal(textResult(smallTextTool('base64', 'A'.repeat(LIMITS.text), { mode: 'decode' })).length, LIMITS.text / 4 * 3);
});

test('时间戳显式秒/毫秒/时区，UUID 按数量生成有效且不同的值', () => {
  assert.match(textResult(smallTextTool('timestamp', '0', { mode: 'seconds' })), /1970-01-01T00:00:00.000Z/);
  assert.match(textResult(smallTextTool('timestamp', '1000', { mode: 'milliseconds' })), /毫秒：1000/);
  assert.match(textResult(smallTextTool('timestamp', '2026-10-12T08:00:00+08:00', { mode: 'iso' })), /2026-10-12T00:00:00.000Z/);
  for (const value of ['2026-02-30T00:00:00Z', '2026-10-12T08:00:00', '2026-10-12T25:00:00Z']) assert.throws(() => smallTextTool('timestamp', value, { mode: 'iso' }), /有效|无效/);
  assert.match(textResult(smallTextTool('timestamp', '0000-02-29T00:00:00Z', { mode: 'iso' })), /0000-02-29T00:00:00.000Z/);
  assert.throws(() => smallTextTool('timestamp', '9007199254740992', { mode: 'seconds' }), /安全整数/);
  const ids = textResult(smallTextTool('uuid', '', { count: 20 })).split('\n');
  assert.equal(new Set(ids).size, 20); assert.ok(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));
  assert.throws(() => smallTextTool('uuid', '', { count: 1001 }), /1,000/);
});

test('SHA-256 校验与 ZIP 打包回读真实字节，空文件与重复名处理明确', async () => {
  const file = new File(['abc'], '原文.txt');
  const digest = await runUtility({ tool: 'hash', files: [file], options: { expected: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' } });
  assert.match(digest.summary, /一致/);
  assert.match((await fileTool('hash', [new File([], '空.txt')])).files[0].name, /SHA256/);
  await assert.rejects(fileTool('hash', [file], { expected: '错误' }), /64 位/);
  const packed = await fileTool('zip', [file, new File([], '空.txt')]);
  const entries = unzipSync(packed.files[0].bytes); assert.equal(decoder.decode(entries['原文.txt']), 'abc'); assert.equal(entries['空.txt'].length, 0);
  assert.equal(await file.text(), 'abc');
  await assert.rejects(fileTool('zip', [file, new File(['不同'], '原文.txt')]), /同名/);
  await assert.rejects(fileTool('zip', [new File(['x'], '../危险')]), /不安全/);
});

test('新增图片操作的坐标、尺寸、方向和清理边界夹具', async () => {
  const saved = new Map(), canvases = [], calls = []; let opened = 0, closed = 0, alive = 0, peak = 0;
  for (const key of ['createImageBitmap', 'OffscreenCanvas']) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async blob => { const b = new Uint8Array(await blob.arrayBuffer()), v = new DataView(b.buffer); opened++; alive++; peak = Math.max(peak, alive); return { width: v.getUint32(16), height: v.getUint32(20), close() { closed++; alive--; } }; } });
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: class {
    constructor(width, height) { this.width = width; this.height = height; canvases.push(this); }
    getContext() { return { fillRect: (...args) => calls.push(['fill', ...args]), drawImage: (...args) => calls.push(['draw', ...args.slice(1)]), translate: (...args) => calls.push(['translate', ...args]), rotate: (...args) => calls.push(['rotate', ...args]), scale: (...args) => calls.push(['scale', ...args]), measureText: text => ({ width: text.length * 5 }), strokeText() {}, fillText: (...args) => calls.push(['watermark', ...args]) }; }
    async convertToBlob({ type }) { calls.push(['output', this.width, this.height]); return new Blob(['图像边界夹具'], { type }); }
  } });
  try {
    const b = png.slice(); new DataView(b.buffer).setUint32(16, 120); new DataView(b.buffer).setUint32(20, 80);
    const file = new File([b], '输入.png'), common = { format: 'jpeg', quality: 0.8, maxEdge: 1000 };
    await convertImages([file], { ...common, action: 'image-rotate', angle: 90, flip: 'horizontal' });
    assert.ok(calls.some(call => call[0] === 'output' && call[1] === 80 && call[2] === 120));
    await convertImages([file], { ...common, action: 'image-crop', x: 10, y: 10, width: 30, height: 20 });
    assert.ok(calls.some(call => call[0] === 'output' && call[1] === 30 && call[2] === 20));
    await assert.rejects(convertImages([file], { ...common, action: 'image-crop', x: 119, y: 0, width: 2, height: 20 }), /裁剪区域/);
    await convertImages([file], { ...common, action: 'image-watermark', watermark: '测试', opacity: 0.5, fontSize: 12, position: 'center' });
    assert.ok(calls.some(call => call[0] === 'watermark'));
    await convertImages([file, file], { ...common, action: 'image-stitch', direction: 'vertical' });
    assert.ok(calls.some(call => call[0] === 'output' && call[1] === 120 && call[2] === 160));
    const large = png.slice(); new DataView(large.buffer).setUint32(16, 4000); new DataView(large.buffer).setUint32(20, 5000);
    const largeFile = new File([large], '大图.png'), allocated = canvases.length;
    await assert.rejects(convertImages([largeFile, largeFile], { ...common, maxEdge: 5000, action: 'image-stitch', direction: 'vertical' }), /像素/);
    assert.equal(canvases.length, allocated, '拼接像素总预算在创建结果画布前拒收');
    assert.equal(peak, 1); assert.equal(opened, closed); assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  } finally { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
});

test('新增表格导出在共享值展开及长表头复制前拒收，不生成大 JSON', async t => {
  const shared = await xlsx(book => { const sheet = book.addWorksheet('s'); for (let i = 0; i < 4000; i++) sheet.addRow(['x'.repeat(32760)]); });
  const header = await xlsx(book => { const sheet = book.addWorksheet('s'); sheet.addRow(['h'.repeat(32760)]); for (let i = 0; i < 4000; i++) sheet.addRow(['x']); });
  assert.ok(shared.length < 100000 && header.length < 100000);
  const original = JSON.stringify;
  // 拦住数组序列化，预算回归时也不分配超过上限的真实 JSON。
  const serialization = t.mock.method(JSON, 'stringify', (value, ...args) => {
    if (Array.isArray(value) && value.length === 4000) throw new Error('测试阻断：进入大数组序列化');
    return original(value, ...args);
  });
  for (const mode of ['excel-csv', 'excel-json']) await assert.rejects(convertSpreadsheet(shared, 'x.xlsx', mode, 's'), /展开输出超过 100 MiB/);
  await assert.rejects(convertSpreadsheet(header, 'x.xlsx', 'excel-json', 's'), /JSON 展开输出超过 100 MiB/);
  assert.ok(serialization.mock.calls.every(call => !Array.isArray(call.arguments[0]) || call.arguments[0].length !== 4000));
});
