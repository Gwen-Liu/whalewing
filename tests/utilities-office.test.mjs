import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { runUtility } from '../src/utilities/worker.js';
import { utilityCatalog, utilityTools } from '../src/utilities/catalog.js';
import { pageSelection, pageLayout, compressPdf, fontCodePoints } from '../src/utilities/pdf.js';
import { subsetCodePoints } from '../scripts/noto-subset.mjs';
import sharp from 'sharp';
import { inspectOffice, LIMITS } from '../src/utilities/core.js';
const require = createRequire(new URL('../src/utilities/core.js', import.meta.url));
const ExcelJS = require('exceljs');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, ImageRun } = require('docx');
const { PDFDocument, PDFName, degrees } = require('pdf-lib');
const { unzipSync, zipSync, unzlibSync } = require('fflate');
const file = (name, bytes) => ({ name, size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer });
const word = async () => Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('实施交付说明 中文合同测试'), new Paragraph('验收范围：银行业务系统升级。'), new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('科目编码')] }), new TableCell({ children: [new Paragraph('科目名称')] })] }), new TableRow({ children: [new TableCell({ children: [new Paragraph('001')] }), new TableCell({ children: [new Paragraph('现金')] })] })] })] }] }));
const excel = async (name = '数据', rows = [['编码', '名称'], ['001', '现金'], ['001', '现金'], ['002', '银行']]) => { const book = new ExcelJS.Workbook(); book.addWorksheet(name).addRows(rows); return book.xlsx.writeBuffer(); };
test('目录7个分类44个功能项且唯一，仍不含截图否定的编码卡片与错误WordExcel方向', () => {
  assert.equal(utilityTools.length, 7); assert.equal(utilityCatalog.length, 44); assert.equal(new Set(utilityCatalog.map(i => i.id)).size, 44);
  // 别名入口只能指向真实存在、且不再转指的功能项。
  for (const item of utilityCatalog.filter(i => i.action)) assert.ok(utilityCatalog.some(target => target.id === item.action && !target.action));
  assert.ok(utilityTools.every(tool => tool.functions.length >= 3 && tool.functions.every(item => item.tool === tool.id)));
  for (const id of ['word-excel', 'excel-word', 'uuid', 'zip', 'base64', 'url-codec', 'timestamp', 'hash', 'line-compare']) assert.ok(!utilityCatalog.some(i => i.id === id));
});
test('页码解析保留用户顺序并拒收重复、越界和超预算', () => {
  assert.deepEqual(pageSelection('3,1-2', 3), [2, 0, 1]);
  for (const value of ['1,1', '0', '4', '2-1', 'a']) assert.throws(() => pageSelection(value, 3));
});
test('中文Word正文和规则表格生成PDF，再回转可编辑DOCX', async () => {
  const pdf = await runUtility({ tool: 'word-pdf', files: [file('验收.docx', await word())] });
  assert.equal(pdf.files[0].mime, 'application/pdf');
  assert.equal((await PDFDocument.load(pdf.files[0].bytes)).getPageCount(), 1);
  assert.doesNotMatch(pdf.summary, /内置字库/);
  const txt = await runUtility({ tool: 'pdf-text', files: [file('验收.pdf', pdf.files[0].bytes)] });
  assert.match(new TextDecoder().decode(txt.files[0].bytes), /实施交付说明/);
  const docx = await runUtility({ tool: 'pdf-word', files: [file('验收.pdf', pdf.files[0].bytes)] });
  const content = inspectOffice(docx.files[0].bytes, 'docx').documents.get('word/document.xml').documentElement.textContent;
  for (const expected of ['实施交付说明', '中文合同测试', '验收范围', '银行业务系统升级', '科目编码', '科目名称', '001', '现金']) assert.ok(content.includes(expected), expected);
});

test('内置字体是固定字表与原字体的交集：常用简繁字和符号齐全，生僻字不在内', async () => {
  const bundled = fontCodePoints(Buffer.from(JSON.parse(await readFile(new URL('../content/utilities/noto-font.json', import.meta.url), 'utf8')).base64, 'base64'));
  const original = fontCodePoints(await readFile(new URL('../content/utilities/NotoSansSC-Regular.otf', import.meta.url)));
  const expected = subsetCodePoints().filter(point => original.has(point));
  assert.equal(bundled.size, expected.length); assert.ok(expected.every(point => bundled.has(point)));
  // GB2312 的 6763 个简体字加 Big5 常用字补的 2073 个繁体字，一个不少。
  const hanzi = subsetCodePoints().filter(point => point >= 0x4E00 && point <= 0x9FFF);
  assert.equal(hanzi.length, 8836); assert.ok(hanzi.every(point => bundled.has(point)));
  for (const ch of '鲸翼实施交付們說這個資料①⑪㎡™€—“”《》ＡＢ１') assert.ok(bundled.has(ch.codePointAt(0)), ch);
  for (const ch of '喆堃硚') assert.ok(!bundled.has(ch.codePointAt(0)) && original.has(ch.codePointAt(0)), ch);
});
test('子集外的字照常出PDF并在结果里列出，不可见格式符不画方框；水印含缺字先拒收', async () => {
  const bytes = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('张喆在硚口签约​，繁體資料照常'), new Paragraph('堃')] }] }));
  const result = await runUtility({ tool: 'word-pdf', files: [file('缺字.docx', bytes)] });
  assert.equal((await PDFDocument.load(result.files[0].bytes)).getPageCount(), 1);
  assert.match(result.summary, /有 3 个字不在内置字库（常用简繁体字）里，PDF 中显示为带叉方框：喆、硚、堃；需要原样显示请用 Word 自带的“另存为 PDF”/);
  const text = await runUtility({ tool: 'pdf-text', files: [file('缺字.pdf', result.files[0].bytes)] });
  assert.match(new TextDecoder().decode(text.files[0].bytes), /签约，繁體資料照常/);
  const p = await PDFDocument.create(); p.addPage(); const pdf = await p.save();
  await assert.rejects(runUtility({ tool: 'pdf-watermark', files: [file('a.pdf', pdf)], options: { watermark: '王喆 内部资料' } }), /水印里的“喆”不在内置字库（常用简繁体字）里/);
  await assert.rejects(runUtility({ tool: 'pdf-watermark', files: [file('a.pdf', pdf)], options: { watermark: '​' } }), /请输入 1–60 字水印/);
});
test('Word共同输出在无Node Buffer的浏览器docx运行时保留可编辑中文与前导零', async () => {
  const browserDocx = await readFile(join(dirname(require.resolve('docx')), 'index.umd.cjs'), 'utf8');
  const source = await readFile(new URL('../src/utilities/office-tasks.js', import.meta.url), 'utf8');
  // 独立 realm 在依赖初始化时就没有 Buffer/process；只适配模块导入，不复制被测输出算法。
  const context = createContext({ TextEncoder, TextDecoder, Blob, setTimeout, clearTimeout, LIMITS });
  runInContext(browserDocx, context, { timeout: 5000 });
  assert.equal(runInContext('typeof Buffer', context), 'undefined');
  assert.equal(runInContext('typeof process', context), 'undefined');
  await assert.rejects(runInContext('docx.Packer.toBuffer(new docx.Document({ sections: [{ children: [new docx.Paragraph("旧调用")] }] }))', context), /nodebuffer is not supported/);
  runInContext('const { Document, Packer, Paragraph, TextRun } = docx;\n' + source.replace(/^import [^\n]+;\n/gm, '').replace(/^export /gm, ''), context, { timeout: 5000 });
  const result = await runInContext('makeWord(["中文交付验收", "001", "现金"], "可编辑.docx", "已完成")', context);
  assert.equal(result.files[0].mime, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(result.files[0].name, '可编辑.docx'); assert.equal(result.summary, '已完成');
  const document = inspectOffice(Uint8Array.from(result.files[0].bytes), 'docx').documents.get('word/document.xml');
  const runs = Array.from(document.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't'));
  assert.deepEqual(runs.map(node => node.textContent), ['中文交付验收', '001', '现金']);
});
test('PDF合并、整理、旋转、页码、水印、拆分均生成可重读产物', async () => {
  const p = await PDFDocument.create(); p.addPage(); p.addPage(); const bytes = await p.save();
  for (const tool of ['pdf-merge', 'pdf-pages', 'pdf-rotate', 'pdf-number', 'pdf-watermark', 'pdf-split']) {
    const result = await runUtility({ tool, files: [file('a.pdf', bytes)], options: { pages: '2,1', angle: 90, watermark: '内部评审' } });
    if (tool === 'pdf-split') { const zip = unzipSync(result.files[0].bytes); assert.equal(Object.keys(zip).length, 2); for (const bytes of Object.values(zip)) assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1); }
    else { const read = await PDFDocument.load(result.files[0].bytes); assert.equal(read.getPageCount(), 2); if (tool === 'pdf-rotate') assert.equal(read.getPage(0).getRotation().angle, 90); }
  }
  await assert.rejects(runUtility({ tool: 'pdf-word', files: [file('扫描.pdf', bytes)] }), /没有可提取文字/);
});
test('Excel合并拆分去重核对筛选排序清理都可回读', async () => {
  const bytes = await excel();
  for (const tool of ['excel-merge', 'excel-split', 'excel-dedupe', 'excel-compare', 'excel-filter', 'excel-sort', 'excel-clean']) {
    const files = [file('a.xlsx', bytes)]; if (tool === 'excel-compare') files.push(file('b.xlsx', await excel('新表', [['编码', '名称'], ['003', '新科目']])));
    const result = await runUtility({ tool, files, options: { sheetName: '数据', columns: '编码', match: 'equals', value: '001', sortType: 'text', order: 'desc' } });
    const read = new ExcelJS.Workbook();
    if (tool === 'excel-split') await read.xlsx.load(Object.values(unzipSync(result.files[0].bytes))[0]);
    else await read.xlsx.load(result.files[0].bytes);
    assert.ok(read.worksheets.length); assert.equal(read.worksheets[0].getCell('A1').value, '编码');
    if (tool === 'excel-dedupe') assert.equal(read.worksheets[0].rowCount, 3);
    if (tool === 'excel-filter') assert.equal(read.worksheets[0].rowCount, 3);
    if (tool === 'excel-sort') assert.equal(read.worksheets[0].getCell('A2').value, '002');
  }
});
test('Office正文提取、正文对照和字面替换均处理真实输入', async () => {
  const bytes = await word();
  const txt = await runUtility({ tool: 'word-text', files: [file('a.docx', bytes)] }); assert.match(new TextDecoder().decode(txt.files[0].bytes), /现金/);
  const comparison = await runUtility({ tool: 'word-compare', files: [file('a.docx', bytes), file('b.docx', bytes)] }); assert.match(inspectOffice(comparison.files[0].bytes, 'docx').documents.get('word/document.xml').documentElement.textContent, /原版完整正文/);
  const comparisonDocument = inspectOffice(comparison.files[0].bytes, 'docx').documents.get('word/document.xml');
  const comparisonRuns = Array.from(comparisonDocument.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't')).map(node => node.textContent);
  assert.ok(comparisonRuns.includes('新版完整正文'));
  for (const value of ['实施交付说明 中文合同测试', '001', '现金']) assert.equal(comparisonRuns.filter(text => text === value).length, 2, value);
  const replacement = await runUtility({ tool: 'text-replace', text: '金额 A+B A+B', options: { find: 'A+B', replacement: '100' } }); assert.equal(new TextDecoder().decode(replacement.files[0].bytes), '金额 100 100');
});
test('Office新增入口在读取前拒收数量、类型、体积，并拒收不匹配表头', async () => {
  let reads = 0; const oversized = { name: 'a.pdf', size: 26 * 1024 ** 2, arrayBuffer() { reads++; throw Error('不应读取'); } };
  await assert.rejects(runUtility({ tool: 'pdf-text', files: [oversized] }), /25 MiB/); assert.equal(reads, 0);
  await assert.rejects(runUtility({ tool: 'pdf-merge', files: Array(21).fill(oversized) }), /1–20/);
  await assert.rejects(runUtility({ tool: 'word-pdf', files: [file('a.doc', new Uint8Array([1]))] }), /格式/);
  const a = await excel(), b = await excel('数据', [['错误表头'], ['x']]);
  await assert.rejects(runUtility({ tool: 'excel-merge', files: [file('a.xlsx', a), file('b.xlsx', b)] }), /表头/);
  await assert.rejects(runUtility({ tool: 'excel-filter', files: [file('a.xlsx', a)], options: { sheetName: '数据', columns: '不存在', match: 'equals' } }), /有效列名/);
  await assert.rejects(runUtility({ tool: 'excel-sort', files: [file('a.xlsx', a)], options: { sheetName: '数据', columns: '名称', sortType: 'number', order: 'asc' } }), /非数字/);
  await assert.rejects(runUtility({ tool: 'text-replace', text: 'abc', options: { find: '', replacement: '' } }), /非空/);
});
test('PDF密码、交互表单和损坏内容不产生貌似成功的下载', async () => {
  const form = await PDFDocument.create(); form.addPage(); form.getForm().createTextField('customer');
  await assert.rejects(runUtility({ tool: 'pdf-pages', files: [file('form.pdf', await form.save())] }), /交互表单/);
  await assert.rejects(runUtility({ tool: 'pdf-text', files: [file('a.pdf', new TextEncoder().encode('not a pdf'))] }), /不是 PDF/);
});
test('Word公式、图表、绘图与未知正文容器明确拒收，不以空白成功替代', async () => {
  const bytes = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('KEEP_CONTENT')] }] }));
  const entries = unzipSync(bytes), xml = new TextDecoder().decode(entries['word/document.xml']);
  const cases = [
    '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>FORMULA_MUST_NOT_DISAPPEAR</m:t></m:r></m:oMath>',
    '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
    '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
    '<w:r><w:sym w:font="Wingdings" w:char="F041"/></w:r>',
    '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Fallback><w:r><w:t>DO_NOT_DROP</w:t></w:r></mc:Fallback></mc:AlternateContent>',
  ];
  for (const content of cases) {
    const fixture = zipSync({ ...entries, 'word/document.xml': new TextEncoder().encode(xml.replace('</w:p>', content + '</w:p>')) });
    await assert.rejects(runUtility({ tool: 'word-pdf', files: [file('语义.docx', fixture)] }), /尚未支持/);
  }
});
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64');
const imageWord = count => Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('中文图片验收 KEEP_CONTENT'), ...Array.from({ length: count }, () => new Paragraph({ children: [new ImageRun({ type: 'png', data: png, transformation: { width: 1, height: 1 } })] }))] }] }));
test('中文Word普通图片仍生成含图PDF，401图片反例在实际输出页数门拒收', async () => {
  const normal = await runUtility({ tool: 'word-pdf', files: [file('图文.docx', await imageWord(1))] });
  const pdf = await PDFDocument.load(normal.files[0].bytes);
  assert.ok(pdf.getPages().some(page => page.node.Resources()?.lookup(PDFName.of('XObject'))?.keys().length > 0));
  const text = await runUtility({ tool: 'pdf-text', files: [file('图文.pdf', normal.files[0].bytes)] });
  assert.match(new TextDecoder().decode(text.files[0].bytes), /中文图片验收/);
  const many = await imageWord(401);
  assert.ok(many.length < 25000, '小输入也要检查真实分页结果');
  await assert.rejects(runUtility({ tool: 'word-pdf', files: [file('超页数.docx', many)] }), /PDF 页数应为 1–200/);
  const fromImage = await runUtility({ tool: 'images-pdf', files: [file('图.png', png)] });
  assert.equal((await PDFDocument.load(fromImage.files[0].bytes)).getPageCount(), 1);
});
test('PDF结果200页上边界可回读，合并到201页拒收', async () => {
  const base = await PDFDocument.create(); for (let i = 0; i < 200; i++) base.addPage();
  const bytes = await base.save();
  const output = await runUtility({ tool: 'pdf-pages', files: [file('边界.pdf', bytes)] });
  assert.equal((await PDFDocument.load(output.files[0].bytes)).getPageCount(), 200);
  const one = await PDFDocument.create(); one.addPage();
  await assert.rejects(runUtility({ tool: 'pdf-merge', files: [file('200.pdf', bytes), file('1.pdf', await one.save())] }), /超过 200 页/);
});

const sheetRows = async bytes => { const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes); return Object.fromEntries(book.worksheets.map(sheet => [sheet.name, sheet.getSheetValues().slice(1).map(row => row.slice(1))])); };
test('按关键列关联：读表头、左关联与内关联、重复关键值、数值与大小写比较、同名列改名', async () => {
  const main = await excel('员工', [['工号', '姓名', '部门'], ['001', '张三', '研发'], ['2', '李四', '销售'], ['A7', '王五', '研发'], ['9', '赵六', '财务']]);
  const lookup = await excel('通讯录', [['编号', '部门', '电话'], ['1', '研发部', '1001'], ['002', '销售部', '1002'], ['002', '重复', '9999'], ['a7', '研发部', '1007']]);
  const files = [file('员工.xlsx', main), file('通讯录.xlsx', lookup)];
  const { tables } = await runUtility({ tool: 'excel-headers', files });
  assert.deepEqual(tables.map(table => [table.id, table.label, table.headers]), [['0/0', '员工.xlsx · 员工', ['工号', '姓名', '部门']], ['1/0', '通讯录.xlsx · 通讯录', ['编号', '部门', '电话']]]);
  const base = { leftTable: '0/0', rightTable: '1/0', leftKey: '工号', rightKey: '编号', joinColumns: ['部门', '电话'], joinType: 'left', numericKey: true, ignoreCase: true };
  const left = await runUtility({ tool: 'excel-join', files, options: base });
  assert.match(left.summary, /主表 4 行，匹配 3 行，未匹配 1 行；查找表有 1 行关键值重复，按第一条匹配/);
  const rows = await sheetRows(left.files[0].bytes);
  assert.deepEqual(rows['关联结果'], [['工号', '姓名', '部门', '部门（查找表）', '电话'], ['001', '张三', '研发', '研发部', '1001'], ['2', '李四', '销售', '销售部', '1002'], ['A7', '王五', '研发', '研发部', '1007'], ['9', '赵六', '财务', '', '']]);
  assert.deepEqual(rows['主表未匹配'], [['工号', '姓名', '部门'], ['9', '赵六', '财务']]);
  assert.deepEqual(rows['查找表重复（未使用）'][1], ['002', '重复', '9999']);
  const strict = await sheetRows((await runUtility({ tool: 'excel-join', files, options: { ...base, joinType: 'inner', numericKey: false, ignoreCase: false } })).files[0].bytes);
  assert.equal(strict['关联结果'].length, 1, '不按数值、区分大小写时一行也匹配不上');
  // 一个文件里的两张表也可以关联。
  const book = new ExcelJS.Workbook(); book.addWorksheet('主').addRows([['键', '值'], ['k', '1']]); book.addWorksheet('查').addRows([['键', '补充'], ['k', 'x']]);
  const single = await runUtility({ tool: 'excel-join', files: [file('一个.xlsx', await book.xlsx.writeBuffer())], options: { ...base, leftTable: '0/0', rightTable: '0/1', leftKey: '键', rightKey: '键', joinColumns: ['补充'] } });
  assert.deepEqual((await sheetRows(single.files[0].bytes))['关联结果'], [['键', '值', '补充'], ['k', '1', 'x']]);
  await assert.rejects(runUtility({ tool: 'excel-join', files, options: { ...base, rightTable: '0/0' } }), /同一张表/);
  await assert.rejects(runUtility({ tool: 'excel-join', files, options: { ...base, joinColumns: ['编号'] } }), /关键列/);
  await assert.rejects(runUtility({ tool: 'excel-join', files, options: { ...base, leftKey: '不存在' } }), /现有的关键列/);
  await assert.rejects(runUtility({ tool: 'excel-join', files: [...files, file('c.xlsx', main)], options: base }), /1–2 个文件/);
});

test('按字段拆分：多个文件或多张工作表，空值归组、非法表名替换、超过 200 组拒收', async () => {
  const bytes = await excel('名单', [['姓名', '部门'], ['甲', '研发'], ['乙', '销售/华东'], ['丙', '研发'], ['丁', '']]);
  const zip = await runUtility({ tool: 'excel-split-by', files: [file('名单.xlsx', bytes)], options: { sheetName: '名单', columns: '部门', splitOutput: 'files' } });
  const entries = unzipSync(zip.files[0].bytes);
  assert.deepEqual(Object.keys(entries).sort(), ['研发.xlsx', '销售_华东.xlsx', '（空）.xlsx'].sort());
  assert.deepEqual((await sheetRows(entries['研发.xlsx']))['名单'], [['姓名', '部门'], ['甲', '研发'], ['丙', '研发']]);
  assert.deepEqual(zip.listing, ['研发：2 行', '销售/华东：1 行', '（空）：1 行']);
  const sheets = await runUtility({ tool: 'excel-split-by', files: [file('名单.xlsx', bytes)], options: { sheetName: '名单', columns: '部门', splitOutput: 'sheets' } });
  assert.deepEqual(Object.keys(await sheetRows(sheets.files[0].bytes)), ['研发', '销售_华东', '（空）']);
  const many = await excel('多', [['编号'], ...Array.from({ length: 201 }, (_, i) => [String(i)])]);
  await assert.rejects(runUtility({ tool: 'excel-split-by', files: [file('多.xlsx', many)], options: { sheetName: '多', columns: '编号', splitOutput: 'files' } }), /超过 200 组/);
  await assert.rejects(runUtility({ tool: 'excel-split-by', files: [file('名单.xlsx', bytes)], options: { sheetName: '名单', columns: '岗位', splitOutput: 'files' } }), /现有列名/);
});

/** 测试用编解码：sharp 代替浏览器画布，行为一致（按目标尺寸缩放、JPEG 按质量编码）。 */
const sharpCodec = {
  jpeg: async (bytes, width, height, quality) => new Uint8Array(await sharp(bytes).resize(width, height, { fit: 'fill' }).jpeg({ quality: Math.round(quality * 100) }).toBuffer()),
  resize: async (data, channels, sourceWidth, sourceHeight, width, height) => new Uint8Array(await sharp(Buffer.from(data), { raw: { width: sourceWidth, height: sourceHeight, channels } }).resize(width, height, { fit: 'fill' }).raw().toBuffer()),
};
const imageStreams = (doc, filter) => [...doc.context.enumerateIndirectObjects()].map(([, object]) => object).filter(object => object.dict?.get(PDFName.of('Subtype')) === PDFName.of('Image') && String(object.dict.get(PDFName.of('Filter'))).includes(filter));
test('PDF 压缩只重新处理图片：JPEG 缩小降质，无损图缩小仍无损，CMYK 原样保留，没变小不交付', async () => {
  const doc = await PDFDocument.create(), noise = Buffer.alloc(2480 * 3508 * 3);
  for (let i = 0; i < noise.length; i += 3) noise[i] = noise[i + 1] = noise[i + 2] = 200 + (i * 7919 % 50);
  const photo = await doc.embedJpg(await sharp(noise, { raw: { width: 2480, height: 3508, channels: 3 } }).jpeg({ quality: 92 }).toBuffer());
  const cmyk = await doc.embedJpg(await sharp({ create: { width: 400, height: 400, channels: 3, background: '#3366cc' } }).toColourspace('cmyk').jpeg().toBuffer());
  const page = doc.addPage([595.28, 841.89]); page.drawImage(photo, { x: 0, y: 0, width: 595.28, height: 841.89 }); page.drawImage(cmyk, { x: 10, y: 10, width: 50, height: 50 });
  // 手工放一张带 PNG 预测（Sub 过滤）的无损纯色图，核对还原与缩小后颜色不变。
  const width = 3000, height = 2000, row = Buffer.alloc(1 + width * 3); row[0] = 1; row[1] = 10; row[2] = 120; row[3] = 230;
  const flate = doc.context.flateStream(Buffer.concat(Array.from({ length: height }, () => row)), { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, DecodeParms: { Predictor: 15, Colors: 3, Columns: width } });
  doc.context.register(flate);
  const original = await doc.save();
  const result = await compressPdf(original, '扫描件.pdf', 'standard', sharpCodec);
  assert.equal(result.files[0].name, '扫描件-压缩.pdf'); assert.ok(result.files[0].bytes.length < original.length / 3, `${original.length} → ${result.files[0].bytes.length}`);
  assert.match(result.summary, /重新处理 2 张图片（标准，约 150 DPI）/); assert.deepEqual(result.listing, ['跳过 1 张：CMYK 等印刷色图片']);
  const read = await PDFDocument.load(result.files[0].bytes);
  assert.equal(read.getPageCount(), 1);
  const [jpeg] = imageStreams(read, 'DCTDecode').filter(object => object.dict.get(PDFName.of('Width')).asNumber() !== 400);
  assert.deepEqual([jpeg.dict.get(PDFName.of('Width')).asNumber(), jpeg.dict.get(PDFName.of('Height')).asNumber()], [1240, 1754]);
  const [lossless] = imageStreams(read, 'FlateDecode'), pixels = unzlibSync(lossless.contents);
  assert.deepEqual([lossless.dict.get(PDFName.of('Width')).asNumber(), lossless.dict.get(PDFName.of('Height')).asNumber(), lossless.dict.has(PDFName.of('DecodeParms'))], [1754, 1169, true]);
  // 重新压缩时逐行按 Up 预测：首行与原值相同，之后的行与上一行相同所以全为 0。
  assert.equal(pixels.length, 1169 * (1754 * 3 + 1)); assert.deepEqual([...pixels.subarray(0, 7)], [2, 10, 120, 230, 10, 120, 230]); assert.ok(pixels.subarray(1754 * 3 + 2, 2 * (1754 * 3 + 1)).every(value => value === 0));
  // 轻度保留更多像素，强力更小。
  const light = await compressPdf(original, 'a.pdf', 'light', sharpCodec), strong = await compressPdf(original, 'a.pdf', 'strong', sharpCodec);
  assert.ok(strong.files[0].bytes.length < result.files[0].bytes.length && result.files[0].bytes.length < light.files[0].bytes.length);
  const text = await PDFDocument.create(); text.addPage().drawText('only text');
  await assert.rejects(compressPdf(await text.save(), 'a.pdf', 'standard', sharpCodec), /没有变小/);
  await assert.rejects(compressPdf(original, 'a.pdf', 'extreme', sharpCodec), /档位/);
});

test('页面整理按逐页布局重排、旋转、删除；布局无效拒收；缩略图在无渲染能力时说明原因', async () => {
  const p = await PDFDocument.create(); for (const size of [[100, 100], [200, 200], [300, 300]]) p.addPage(size); p.getPage(1).setRotation(degrees(90));
  const bytes = await p.save();
  const result = await runUtility({ tool: 'pdf-pages', files: [file('a.pdf', bytes)], options: { layout: [{ page: 2, rotate: 0 }, { page: 1, rotate: 90 }] } });
  const read = await PDFDocument.load(result.files[0].bytes);
  assert.deepEqual(read.getPages().map(page => [page.getWidth(), page.getRotation().angle]), [[300, 0], [200, 180]]);
  for (const layout of [[], [{ page: 0 }, { page: 0 }], [{ page: 3 }], [{ page: 0, rotate: 45 }], 'x']) await assert.rejects(runUtility({ tool: 'pdf-pages', files: [file('a.pdf', bytes)], options: { layout } }), /保留一页|布局无效/);
  assert.deepEqual(pageLayout([{ page: 1 }], 3), [{ page: 1, rotate: 0 }]);
  if (typeof globalThis.OffscreenCanvas === 'undefined') await assert.rejects(runUtility({ tool: 'pdf-thumbs', files: [file('a.pdf', bytes)] }), /渲染能力/);
});

test('表格处理上限 10 万单元格：正好 10 万可处理，多一行拒收；转 Word 仍按 2 万；列数只取一次', async t => {
  const rows = count => [['编号', '部门', '金额', '日期', '备注', '状态', '城市', '电话', '邮箱', '序号'], ...Array.from({ length: count - 1 }, (_, i) => [String(i).padStart(6, '0'), `部门${i % 20}`, i * 3 % 1000, '2026-10-22', '按合同付款', '已通过', '上海', '13800000000', `u${i}@example.com`, String(i)])];
  assert.equal(LIMITS.cells, 100000); assert.equal(LIMITS.wordCells, 20000);
  const exact = await excel('数据', rows(10000));
  const sorted = await runUtility({ tool: 'excel-sort', files: [file('十万.xlsx', exact)], options: { sheetName: '数据', columns: '金额', sortType: 'number', order: 'desc' } });
  assert.match(sorted.summary, /9999 行输入，9999 行输出/);
  await assert.rejects(runUtility({ tool: 'excel-sort', files: [file('超出.xlsx', await excel('数据', rows(10001)))], options: { sheetName: '数据', columns: '金额', sortType: 'number', order: 'desc' } }), /100,000/);
  // 3 万单元格：表格处理可以，转成 Word 表格仍拒收。
  const mid = await excel('数据', rows(3000));
  assert.match((await runUtility({ tool: 'excel-csv', files: [file('三万.xlsx', mid)], options: { sheetName: '数据' } })).summary, /CSV|行/);
  await assert.rejects(runUtility({ tool: 'excel-word', files: [file('三万.xlsx', mid)], options: { sheetName: '数据' } }), /Word 表格最多 20,000/);
  // ExcelJS 的 columnCount 每次都遍历全部行；读表时只能取一次，避免耗时随行数平方增长。
  const Worksheet = require('exceljs/lib/doc/worksheet.js');
  const original = Object.getOwnPropertyDescriptor(Worksheet.prototype, 'columnCount');
  let reads = 0;
  t.mock.getter(Worksheet.prototype, 'columnCount', function () { reads++; return original.get.call(this); });
  await runUtility({ tool: 'excel-dedupe', files: [file('三万.xlsx', mid)], options: { sheetName: '数据', columns: '部门' } });
  assert.ok(reads < 10, `columnCount 被读取 ${reads} 次`);
});
