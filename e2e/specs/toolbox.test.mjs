import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { startDsh, removeTree, pluginRoot } from '../support/dsh.mjs';
import { recentKey } from '../../src/utilities/recipes.js';
import { launchBrowser, withPage, openWhaleWing, openTab, scratchFiles, textOf, toast } from '../support/browser.mjs';

// 造文件、回读结果用插件自己的依赖：sharp 读写图片，jsQR 识别二维码，qrcode-generator 生成二维码，pdf-lib 读写 PDF，exceljs 读写表格，fflate 解 ZIP。
const require = createRequire(path.join(pluginRoot, 'package.json'));
const sharp = require('sharp'), jsQR = require('jsqr'), qrcode = require('qrcode-generator'), ExcelJS = require('exceljs');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { unzipSync } = require('fflate');

let dsh, browser, files;
before(async () => {
  [dsh, browser] = await Promise.all([startDsh(), launchBrowser()]);
  files = scratchFiles('whalewing-e2e-toolbox-');
});
after(async () => { await browser?.close(); await dsh?.stop(); if (files) removeTree(files.dir); });

// —— 测试文件 ——
/** 纯色 PNG/JPEG；alpha 为真时左半边全透明、右半边红色。 */
async function image(name, { width = 200, height = 100, alpha = false, format = 'png', color = { r: 30, g: 120, b: 220 } } = {}) {
  let pipeline;
  if (alpha) {
    const raw = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const at = (y * width + x) * 4; if (x >= width / 2) { raw[at] = 220; raw[at + 1] = 20; raw[at + 2] = 20; raw[at + 3] = 255; } }
    pipeline = sharp(raw, { raw: { width, height, channels: 4 } });
  } else pipeline = sharp({ create: { width, height, channels: 3, background: color } });
  return files.file(name, await (format === 'jpeg' ? pipeline.jpeg() : pipeline.png()).toBuffer());
}
/** 每个像素颜色不同的 PNG：压缩不了，文件够大，用来检查文件内容有没有被发给 DSH。 */
async function noisyImage(name, width = 420, height = 300) {
  const raw = Buffer.alloc(width * height * 3);
  let seed = 7;
  for (let i = 0; i < raw.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; raw[i] = seed >>> 24; }
  return files.file(name, await sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer());
}
/** 用 qrcode-generator 在测试里现做一张二维码 PNG（黑白方块，四周留白）；文字按 UTF-8 编码，和插件生成时一样。 */
async function qrImage(name, text) {
  qrcode.stringToBytes = value => Array.from(new TextEncoder().encode(value));
  const code = qrcode(0, 'M'); code.addData(text, 'Byte'); code.make();
  const count = code.getModuleCount(), scale = 8, margin = 4, size = (count + margin * 2) * scale, raw = Buffer.alloc(size * size, 255);
  for (let row = 0; row < count; row++) for (let column = 0; column < count; column++) if (code.isDark(row, column))
    for (let y = 0; y < scale; y++) raw.fill(0, ((row + margin) * scale + y) * size + (column + margin) * scale, ((row + margin) * scale + y) * size + (column + margin + 1) * scale);
  return files.file(name, await sharp(raw, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer());
}
/** 读出图片里的二维码内容。 */
async function readQr(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}
/** 每页尺寸不同的 PDF，合并后按页面尺寸认出每页来自哪个文件。 */
async function pdf(name, sizes, label) {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  sizes.forEach(([width, height], i) => doc.addPage([width, height]).drawText(`${label} page ${i + 1}`, { x: 40, y: 40, font, size: 18 }));
  return files.file(name, await doc.save());
}
async function workbook(name, sheets) {
  const book = new ExcelJS.Workbook();
  for (const [sheetName, rows] of Object.entries(sheets)) { const sheet = book.addWorksheet(sheetName); rows.forEach(row => sheet.addRow(row)); }
  return files.file(name, Buffer.from(await book.xlsx.writeBuffer()));
}
/** 文件的 SHA-256，用来核对原件没被改。 */
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const countFiles = dir =>fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => sum + (entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1), 0);

// —— 界面 ——
// 2026-11-12 改版：办公工坊页是“文件交给小鲸”，原来的分类卡片和功能项窗口收进页面右上角的“全部功能项”，
// 从右侧拉出抽屉，每个分类一行、默认收起；点一个功能项标签就关掉抽屉、打开那个功能项的窗口，不经过小鲸。
// 这个文件测的都是员工自己点开功能项用的这条路，不调模型；交给小鲸的那条路要真模型，不在这里。
const shelfOf = page => page.getByRole('dialog', { name: '全部功能项', exact: true });
const shelfButton = page => page.locator('.ww-ws-head').getByRole('button', { name: '全部功能项', exact: true });
/** 打开办公工坊，点“全部功能项”，等右侧抽屉里的分类出来。 */
async function openShelf(page) {
  await openTab(page, '办公工坊');
  await shelfButton(page).click();
  const shelf = shelfOf(page);
  await shelf.locator('.ww-tool-card').first().waitFor();
  return shelf;
}
/** 打开“全部功能项”，点开某个分类、点里面的功能项标签，等抽屉关上、办公工坊窗口打开并切到该功能项。 */
async function openTool(page, tool, fn) {
  const shelf = await openShelf(page);
  await shelf.getByRole('button', { name: new RegExp(`^${tool}，\\d+ 个功能项$`) }).click();
  await shelf.getByRole('button', { name: `${tool}：${fn}`, exact: true }).click();
  await shelf.waitFor({ state: 'detached' });
  const dialog = page.getByRole('dialog', { name: tool, exact: true });
  await dialog.locator('.ww-tool-body h3', { hasText: fn }).waitFor();
  return dialog;
}
const fileInput = dialog => dialog.locator('.ww-tool-drop input[type=file]');
const startButton = dialog => dialog.getByRole('button', { name: '开始处理', exact: true });
const resultBox = dialog => dialog.locator('.ww-tool-result');
const alertOf = dialog => dialog.locator('.ww-tool-body [role=alert]');
const fileList = dialog => dialog.locator('.ww-tool-files li > span').allInnerTexts();
/** 等处理结束：要么出现结果，要么出现错误说明。 */
async function finished(dialog) {
  await dialog.locator('.ww-tool-result, .ww-tool-body [role=alert]').first().waitFor({ timeout: 60_000 });
  await dialog.locator('.ww-tool-body[aria-busy=true]').waitFor({ state: 'detached' });
}
/** 点结果里的下载链接，把文件存到测试目录，返回路径。 */
async function save(page, dialog, name) {
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('.ww-tool-result a', { hasText: `下载 ${name}` }).click()]);
  assert.equal(download.suggestedFilename(), name);
  const target = path.join(files.dir, 'downloads', `${Date.now()}-${name}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await download.saveAs(target);
  return target;
}

// 需求§办公工坊的功能项表：每个分类的功能项，按需求原文写（括号里的补充说明去掉）。
const requiredTools = [
  ['格式转换', ['Office 转 PDF', 'Office 转图片', '旧格式转新格式', 'PDF 转 Word', '图片转 PDF', 'PDF 转图片', '图片转格式', 'Excel／CSV 互转', 'Excel 转 JSON', 'Word 转 TXT', '提取文档图片']],
  ['PDF 处理', ['合并', '拆分', '压缩', '页面整理', '旋转', '添加页码', '添加水印', '提取文字']],
  ['表格处理', ['合并表格', '拆分工作表', '按字段拆分', '按关键列关联', '数据去重', '两表核对', '条件筛选', '数据排序', '清理空白']],
  ['图片处理', ['压缩与转格式', '旋转翻转', '裁剪', '拼接长图', '宫格切图', '添加水印', '隐私打码', '去除水印']],
  ['文字处理', ['整理与统计', '批量替换', 'Word 版本对照']],
  ['音视频', ['视频提取音频', '音频转格式', '音频剪切', '视频截图']],
  ['二维码', ['生成', '批量生成', '识别']],
];
const squash = value => value.replace(/\s+/g, '').replace(/／/g, '/');

// 需求§办公工坊（7 个分类、功能项表）；需求§办公工坊·怎么用（开始页放文件、说要求；“全部功能项”从右侧拉出抽屉，每个分类一行、默认收起，点一下展开功能项标签、再点收起）
test('办公工坊开始页和“全部功能项”抽屉：7 个分类共 46 项，默认收起，点开后每个分类的功能项和需求的功能项表一致', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '办公工坊');
    const section = page.locator('section.ww-ws[aria-label=办公工坊]');
    assert.equal(await textOf(section.locator('.ww-ws-head h2')), '办公工坊');
    assert.match(await textOf(section.locator('.ww-ws-head p')), /小鲸.*这台电脑/, '页头摘要说明交给小鲸、在这台电脑上处理');
    // 开始页：放文件、说要求的输入框，“选文件”和“交给小鲸”；功能项不铺在页面上，抽屉要点了才出来。
    await section.getByRole('textbox', { name: '要求' }).waitFor();
    await section.getByRole('button', { name: '选文件', exact: true }).waitFor();
    await section.getByRole('button', { name: '交给小鲸', exact: true }).waitFor();
    assert.equal(await shelfOf(page).count(), 0, '没点“全部功能项”时抽屉不在');
    assert.equal(await page.locator('.ww-tool-chip:visible').count(), 0, '功能项不铺在页面上');

    const shelf = await openShelf(page);
    assert.equal(await textOf(shelf.locator('.ww-tool-shelf-head h2')), '全部功能项');
    const total = requiredTools.reduce((sum, [, functions]) => sum + functions.length, 0);
    assert.equal(total, 46, '需求的功能项表合计 46 项（2026-11-15 加了 Office 转图片、旧格式转新格式）');
    assert.match(await textOf(shelf.locator('.ww-tool-shelf-head p')), new RegExp(`^${total} 项 · `));
    // 抽屉贴着窗口右边，从上到下，不占满整页。
    const box = await shelf.boundingBox(), { width, height } = page.viewportSize();
    assert.ok(box.x >= width / 2 && width - (box.x + box.width) <= 1 && height - (box.y + box.height) <= 1 && box.height >= height * 0.9, `抽屉在右侧：${JSON.stringify(box)}（窗口 ${width}×${height}）`);
    const cards = shelf.locator('.ww-tool-card');
    assert.equal(await cards.count(), requiredTools.length);
    assert.equal(await shelf.locator('.ww-tool-chip').count(), 0, '分类默认都收起');
    for (const [index, [tool, functions]] of requiredTools.entries()) {
      const card = cards.nth(index), head = card.locator('.ww-tool-card-head');
      assert.equal(await head.locator('strong').innerText(), tool);
      assert.equal(await textOf(head.locator('.ww-tool-count')), `${functions.length} 个`, tool);
      assert.equal(await head.getAttribute('aria-expanded'), 'false', `${tool}默认收起`);
      await head.click();
      assert.equal(await head.getAttribute('aria-expanded'), 'true', `${tool}点一下展开`);
      const chips = await card.locator('.ww-tool-chip').allInnerTexts();
      assert.equal(chips.length, functions.length, `${tool}的功能项数`);
      functions.forEach((name, i) => assert.ok(squash(chips[i]).includes(squash(name)), `${tool}第 ${i + 1} 项应是“${name}”，界面是“${chips[i]}”`));
    }
    assert.equal(await shelf.locator('.ww-tool-chip').count(), total, '可以同时展开几个分类');
    // 再点一下收起，别的分类不受影响。
    const first = cards.first().locator('.ww-tool-card-head');
    await first.click();
    assert.equal(await first.getAttribute('aria-expanded'), 'false');
    assert.equal(await cards.first().locator('.ww-tool-chip').count(), 0, '再点一下收起');
    assert.equal(await shelf.locator('.ww-tool-chip').count(), total - requiredTools[0][1].length);
    // 关上再打开，还是上次展开的样子。
    await shelf.getByRole('button', { name: '关闭', exact: true }).click();
    await shelf.waitFor({ state: 'detached' });
    await shelfButton(page).click();
    await shelf.locator('.ww-tool-card').first().waitFor();
    assert.equal(await shelf.locator('.ww-tool-chip').count(), total - requiredTools[0][1].length, '抽屉关上再打开，展开的分类还展开着');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊·搜索（词序和大小写不限，能搜格式名和常用说法）
test('搜索：词序、大小写、中英文连写都能搜到；能搜格式名和常用说法', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    const shelf = await openShelf(page);
    const search = shelf.getByRole('searchbox', { name: '搜索功能项' });
    const hits = async query => {
      await search.fill(query);
      await shelf.locator('.ww-tool-results, p[role=status]').first().waitFor();
      return shelf.locator('.ww-tool-hit').evaluateAll(buttons => buttons.map(button => button.children[1].textContent));
    };
    for (const query of ['合并 PDF', 'pdf 合并', 'PDF合并']) assert.deepEqual(await hits(query), ['合并 PDF'], query);
    const avif = await hits('AVIF');
    assert.ok(avif.includes('压缩与转格式') && avif.includes('图片转格式'), `AVIF 搜到：${avif.join('、')}`);
    const imageFunctions = new Set(requiredTools.find(([tool]) => tool === '图片处理')[1].concat(['图片转格式', '图片转 PDF', '识别二维码']));
    assert.deepEqual(avif.filter(title => !imageFunctions.has(title)), [], 'AVIF 只搜到能读图片的功能项');
    assert.ok((await hits('照片压缩')).includes('压缩与转格式'));
    assert.ok((await hits('视频转音频')).includes('视频提取音频'));
    assert.ok((await hits('PDF 压缩')).includes('压缩 PDF'));
    // 点搜到的功能项：抽屉关上，直接打开那个功能项的窗口。
    await search.fill('pdf 合并');
    await shelf.locator('.ww-tool-hit').first().click();
    await shelf.waitFor({ state: 'detached' });
    const dialog = page.getByRole('dialog', { name: 'PDF 处理', exact: true });
    await dialog.locator('.ww-tool-body h3', { hasText: '合并 PDF' }).waitFor();
    await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    // 再打开抽屉，清空搜索回到 7 个分类。
    await shelfButton(page).click();
    await search.fill('');
    await shelf.locator('.ww-tool-card').first().waitFor();
    assert.equal(await shelf.locator('.ww-tool-card').count(), 7, '清空搜索回到 7 个分类');
    assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊·搜索（搜到 HEIC、OCR 等尚未内置的能力时单独说明，不当作已有功能项）
test('反例：搜到尚未内置的能力时说明“没有匹配的功能项”和原因，不列出功能项', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    const shelf = await openShelf(page), search = shelf.getByRole('searchbox', { name: '搜索功能项' });
    const gaps = shelf.getByRole('list', { name: '尚未内置' });
    for (const [query, pattern] of [['HEIC', /HEIC/], ['OCR', /OCR.*尚未内置/]]) {
      await search.fill(query);
      await shelf.getByRole('status').filter({ hasText: '没有匹配的功能项' }).waitFor();
      assert.equal(await shelf.locator('.ww-tool-hit').count(), 0, `${query} 不列出功能项`);
      assert.match(await textOf(gaps), pattern, query);
    }
    await search.fill('xyz不存在');
    await shelf.getByRole('status').filter({ hasText: '没有匹配的功能项' }).waitFor();
    assert.equal(await gaps.count(), 0, '无关的词只说没有匹配');
    assert.equal(await shelf.locator('.ww-tool-hit').count(), 0);
    assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊（员工选择本机文件，在浏览器 Worker 里处理并提供下载：不上传、不调用模型、不覆盖原件、不写知识库）
test('处理只在本机：不发外网请求，不把文件内容发给 DSH，原件和知识库都不变', async t => {
  const original = await noisyImage('noise.png');
  const before = { hash: await sha256(original), vault: countFiles(dsh.vault) };
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors, external }) => {
    // 记下页面发出的每个请求体和 WebSocket 消息的大小：文件约 370 KB，任何一条接近这个大小都说明文件内容被发了出去。
    const sent = [];
    page.on('request', request => sent.push(request.postDataBuffer()?.length ?? 0));
    page.on('websocket', socket => socket.on('framesent', frame => sent.push(typeof frame.payload === 'string' ? Buffer.byteLength(frame.payload) : frame.payload.length)));
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '图片处理', '压缩与转格式');
    await fileInput(dialog).setInputFiles(original);
    await startButton(dialog).click();
    await finished(dialog);
    assert.match(await textOf(resultBox(dialog)), /已处理 1 张图片.*原件保持不变/);
    const output = await save(page, dialog, '1-noise-处理.png');
    const { width, height } = await sharp(output).metadata();
    assert.deepEqual([width, height], [420, 300], '尺寸不变');
    const size = fs.statSync(original).size;
    assert.ok(size > 300_000, `测试图片够大（${size} 字节）`);
    assert.ok(Math.max(0, ...sent) < size / 4, `发出的最大一条消息 ${Math.max(0, ...sent)} 字节，远小于文件`);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
  assert.equal(await sha256(original), before.hash, '原件没被改');
  assert.equal(countFiles(dsh.vault), before.vault, '知识库文件数不变');
});

// 需求§办公工坊（二维码：生成）
test('生成二维码：给出两种格式的下载，PNG 扫出来就是输入的网址', async t => {
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '二维码', '生成二维码');
    const text = 'https://example.com/whalewing-test';
    await dialog.getByRole('textbox', { name: '网址或文字' }).fill(text);
    await startButton(dialog).click();
    await finished(dialog);
    const result = resultBox(dialog);
    assert.match(await result.locator('strong').innerText(), /^二维码 \d+ × \d+ 模块，容错等级 M$/);
    assert.deepEqual(await result.locator('a').allInnerTexts(), ['下载 二维码.png', '下载 二维码.svg']);
    await result.getByRole('button', { name: '全部打包下载（ZIP）' }).waitFor();
    const png = await save(page, dialog, '二维码.png');
    const { width, height } = await sharp(png).metadata();
    assert.equal(width, height, '正方形');
    assert.ok(width <= 512, `不超过设定的 512 像素（实际 ${width}）`);
    assert.equal(await readQr(png), text);
    const svg = fs.readFileSync(await save(page, dialog, '二维码.svg'), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊（不支持的内容明确拒收，不静默丢弃）；清单 TBX-06 的提示文字未定义，这里只核对拒收和不出结果
test('反例：二维码内容为空时不能开始；内容超出容量时说明原因，不生成图片', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '二维码', '生成二维码');
    const input = dialog.getByRole('textbox', { name: '网址或文字' });
    assert.equal(await startButton(dialog).isDisabled(), true, '空内容不能开始');
    await input.fill('   ');
    assert.equal(await startButton(dialog).isDisabled(), true, '只有空格也不能开始');
    await input.fill('鲸'.repeat(3000));
    await startButton(dialog).click();
    await finished(dialog);
    assert.match(await textOf(alertOf(dialog)), /二维码/);
    assert.equal(await resultBox(dialog).count(), 0, '没有生成结果');
    assert.equal(await startButton(dialog).isEnabled(), true, '可以改了内容再试');
    assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊（二维码：识别）
test('识别二维码：读出图片里的内容，并能下载识别结果', async t => {
  const text = 'https://example.com/whalewing-qr-read';
  const picture = await qrImage('qr-read.png', text);
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '二维码', '识别二维码');
    await fileInput(dialog).setInputFiles(picture);
    await startButton(dialog).click();
    await finished(dialog);
    assert.equal(await resultBox(dialog).locator('strong').innerText(), '识别到 1 个二维码');
    await resultBox(dialog).locator('summary', { hasText: '处理明细' }).click();
    assert.equal(await textOf(resultBox(dialog).locator('details li')), `qr-read.png：${text}`);
    assert.equal(fs.readFileSync(await save(page, dialog, '二维码识别结果.txt'), 'utf8'), text);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊（不支持的内容明确拒收）；清单 TBX-08 的提示文字未定义，这里只核对说明原因、不出结果、还能接着用
test('反例：图片里没有二维码时说明没识别到，不出结果，换一张能接着识别', async t => {
  const plain = await image('no-qr.png'), code = await qrImage('qr-again.png', '鲸翼测试');
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '二维码', '识别二维码');
    await fileInput(dialog).setInputFiles(plain);
    await startButton(dialog).click();
    await finished(dialog);
    assert.match(await textOf(alertOf(dialog)), /没有.*识别到二维码/);
    assert.equal(await resultBox(dialog).count(), 0);
    await dialog.getByRole('button', { name: '清除选件' }).click();
    await fileInput(dialog).setInputFiles(code);
    await startButton(dialog).click();
    await finished(dialog);
    assert.equal(await resultBox(dialog).locator('strong').innerText(), '识别到 1 个二维码');
    await resultBox(dialog).locator('summary', { hasText: '处理明细' }).click();
    assert.equal(await textOf(resultBox(dialog).locator('details li')), 'qr-again.png：鲸翼测试', '中文内容按 UTF-8 读出');
    assert.equal(await alertOf(dialog).count(), 0, '上次的说明清掉了');
    assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊·图片（转换格式保持原尺寸）；办公工坊说明（转 JPEG 时透明区域填白）
// TOOL-31 需求§办公工坊（格式转换·旧格式转新格式：.doc、.xls、.ppt 用 DSH 自带的转换另存成新格式，2026-11-15 加）
test('旧格式转新格式：Excel 97-2003 的 .xls 用 DSH 自带的转换另存成 .xlsx，工作表名、内容和公式都在；原件不变', async t => {
  // 真正的 97-2003 格式（OLE 复合文档），由 e2e/fixtures/make-legacy-xls.py 用 xlwt 生成；改后缀的 CSV、HTML DSH 不认。
  const original = files.file('legacy-sales.xls', fs.readFileSync(path.join(pluginRoot, 'e2e', 'fixtures', 'legacy-sales.xls')));
  const hash = sha256(original);
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '格式转换', '旧格式转新格式');
    await fileInput(dialog).setInputFiles(original);
    await startButton(dialog).click();
    await finished(dialog);
    assert.match(await textOf(resultBox(dialog)), /已用 DSH 自带的转换另存成新格式，共 1 个/);
    const output = await save(page, dialog, 'legacy-sales.xlsx');
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(output);
    const sheet = book.getWorksheet('销售');
    assert.ok(sheet, '工作表名照旧');
    assert.deepEqual(sheet.getRow(1).values.slice(1), ['月份', '地区', '金额']);
    assert.deepEqual(sheet.getRow(3).values.slice(1), ['一月', '华南', 980]);
    const total = sheet.getCell('C5').value;
    assert.equal(String(total?.formula ?? '').replace(/^=/, ''), 'SUM(C2:C4)', '公式还在');
    assert.equal(total?.result, 3530, '公式的结果也在');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
  assert.equal(sha256(original), hash, '原件没被改');
});

// TOOL-32 需求§办公工坊（格式转换·Office 转图片：先用 DSH 自带的转换转成 PDF，再每页导出 PNG，2026-11-15 加）
test('Office 转图片：两张工作表的 Excel 先用 DSH 自带的转换转成 PDF，再每页导出一张 PNG，打包成一个压缩包', async t => {
  const original = await workbook('季度表.xlsx', { 一季度: [['月份', '金额'], ['一月', 120], ['二月', 98]], 二季度: [['月份', '金额'], ['四月', 135]] });
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '格式转换', 'Office 转图片');
    await fileInput(dialog).setInputFiles(original);
    await dialog.getByRole('textbox', { name: '页码' }).waitFor();
    await startButton(dialog).click();
    await finished(dialog);
    assert.match(await textOf(resultBox(dialog)), /已渲染 2 页 PNG/);
    const output = await save(page, dialog, '季度表-图片.zip');
    const entries = unzipSync(new Uint8Array(fs.readFileSync(output)));
    assert.deepEqual(Object.keys(entries).sort(), ['季度表-1.png', '季度表-2.png'], '一页一张，两张工作表各一页');
    for (const bytes of Object.values(entries)) {
      const meta = await sharp(Buffer.from(bytes)).metadata();
      assert.equal(meta.format, 'png'); assert.ok(meta.width > 300 && meta.height > 300, `图片够大：${meta.width}×${meta.height}`);
    }
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

test('PNG 转 JPEG：宽高和原图相同，原来透明的地方是白色', async t => {
  const original = await image('alpha.png', { alpha: true });
  const hash = await sha256(original);
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '图片处理', '压缩与转格式');
    await fileInput(dialog).setInputFiles(original);
    assert.equal(await dialog.getByRole('combobox', { name: '处理方式' }).inputValue(), 'convert', '默认是转换格式');
    await dialog.getByRole('combobox', { name: '转换为' }).selectOption('jpeg');
    await startButton(dialog).click();
    await finished(dialog);
    assert.match(await textOf(resultBox(dialog)), /JPEG 透明区域填充白色/);
    const output = await save(page, dialog, '1-alpha-处理.jpg');
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height], [200, 100], '尺寸不变');
    const pixel = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    assert.ok(pixel(20, 50).every(value => value >= 245), `透明处是白色：${pixel(20, 50)}`);
    const [r, g, b] = pixel(180, 50);
    assert.ok(r > 180 && g < 70 && b < 70, `不透明处还是红色：${[r, g, b]}`);
    assert.equal((await sharp(output).metadata()).format, 'jpeg');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
  assert.equal(await sha256(original), hash, '原件没被改');
});

// 需求§办公工坊·图片（HEIC/HEIF、TIFF、SVG 暂不支持，选到时提示先导出为 JPEG 或 PNG）
test('反例：选到 HEIC 照片时就提示先导出为 JPEG 或 PNG，不生成文件', async t => {
  const heic = files.file('photo.heic', Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic\0\0\0\0mif1heic'), Buffer.alloc(64)]));
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '图片处理', '压缩与转格式');
    await fileInput(dialog).setInputFiles(heic);
    // 需求：选到时就提示，不用等到处理。
    const hint = dialog.locator('.ww-tool-body [role=alert], .ww-tool-body [role=status]').filter({ hasText: /HEIC/ });
    await hint.waitFor({ timeout: 3000 });
    assert.match(await textOf(hint), /JPEG/); assert.match(await textOf(hint), /PNG/);
    await startButton(dialog).click();
    await finished(dialog);
    assert.equal(await resultBox(dialog).count(), 0, '不生成文件');
    assert.deepEqual(errors, []);
  });
});

/** 多文件列表里某个文件那一行、它前面的拖动手柄。 */
const fileRow = (dialog, name) => dialog.locator('.ww-tool-files li', { has: dialog.page().locator('span', { hasText: name }) });
const fileGrip = (dialog, name) => fileRow(dialog, name).locator('.ww-grip');
/** 按住 from 的中心，拖到 to 的某个位置（fx、fy 是在 to 里面的比例）再松开。 */
async function dragOnto(page, from, to, fx = 0.5, fy = 0.5) {
  const start = await from.boundingBox(), end = await to.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width * fx, end.y + end.height * fy, { steps: 14 });
  await page.mouse.up();
}

// 需求§办公工坊·批量（多选可调整顺序、单独移除、继续添加；处理时显示第几个；单个失败只记入明细，成功的照常下载，可只重试失败的；可打包 ZIP）
// 决策 2026-11-13：调顺序不用“上移 / 下移”，按住每行前面的小点拖到哪放到哪。
test('批量处理：按住小点拖动调顺序、能移除，显示第几个；坏文件只记入明细，其余照常下载并能打包', async t => {
  const a = await image('a.png', { width: 1200, height: 900 }), b = await image('b.jpg', { width: 1200, height: 900, format: 'jpeg', color: { r: 200, g: 160, b: 40 } });
  const good = fs.readFileSync(await image('broken-source.png', { width: 1200, height: 900, color: { r: 90, g: 90, b: 90 } }));
  const broken = files.file('broken.png', good.subarray(0, Math.floor(good.length / 2)));
  const alpha = await image('alpha-batch.png', { width: 1200, height: 900, alpha: true });
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '图片处理', '压缩与转格式');
    await fileInput(dialog).setInputFiles([a, b, broken]);
    assert.deepEqual(await fileList(dialog), ['a.png', 'b.jpg', 'broken.png']);
    assert.equal(await dialog.getByRole('button', { name: /上移|下移/ }).count(), 0, '没有一格一格挪的按钮');
    assert.equal(await dialog.locator('.ww-tool-files .ww-grip').count(), 3, '每行前面一个小点');
    // 按住文件名拖：拖不动。
    await dragOnto(page, fileRow(dialog, 'a.png').locator('span'), fileRow(dialog, 'broken.png'), 0.5, 0.8);
    assert.deepEqual(await fileList(dialog), ['a.png', 'b.jpg', 'broken.png'], '只有按住小点才拖得动');
    // 按住 a.png 前面的小点，一口气拖到最后一行的下半边：排到最后。
    await dragOnto(page, fileGrip(dialog, 'a.png'), fileRow(dialog, 'broken.png'), 0.3, 0.8);
    assert.deepEqual(await fileList(dialog), ['b.jpg', 'broken.png', 'a.png']);
    assert.equal(await fileRow(dialog, 'a.png').evaluate(element => element.style.transform + '|' + element.hasAttribute('data-dragging')), '|false', '放下后回到格子里');
    // 再拖回第一行的上半边：排到最前。
    await dragOnto(page, fileGrip(dialog, 'a.png'), fileRow(dialog, 'b.jpg'), 0.3, 0.2);
    assert.deepEqual(await fileList(dialog), ['a.png', 'b.jpg', 'broken.png']);
    // 不用鼠标：焦点在小点上按上下方向键，一次挪一位，焦点跟着走。
    await fileGrip(dialog, 'a.png').focus();
    await page.keyboard.press('ArrowDown');
    assert.deepEqual(await fileList(dialog), ['b.jpg', 'a.png', 'broken.png']);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '拖动 a.png 调整顺序，也可以按上下方向键');
    await page.keyboard.press('ArrowUp');
    await dialog.getByRole('button', { name: '移除 b.jpg' }).click();
    assert.deepEqual(await fileList(dialog), ['a.png', 'broken.png']);
    await dialog.locator('.ww-tool-files input[type=file]').setInputFiles([b, alpha]);
    assert.deepEqual(await fileList(dialog), ['a.png', 'broken.png', 'b.jpg', 'alpha-batch.png'], '继续添加接在后面');
    // 记下处理中出现过的“第几个”。
    await dialog.evaluate(element => {
      window.__progress = [];
      new MutationObserver(() => { const text = element.querySelector('[aria-live] [role=status]')?.textContent; if (text && !window.__progress.includes(text)) window.__progress.push(text); }).observe(element, { subtree: true, childList: true, characterData: true });
    });
    await startButton(dialog).click();
    await finished(dialog);
    const progress = await page.evaluate(() => window.__progress);
    assert.ok(progress.some(text => /^正在处理第 [1-4] \/ 4 个/.test(text)), `处理中显示第几个：${progress.join(' | ')}`);
    const result = resultBox(dialog);
    assert.equal(await result.locator('strong').innerText().then(text => text.split('；')[0]), '已处理 3 张图片，1 张失败');
    assert.deepEqual(await result.locator('a').allInnerTexts(), ['下载 1-a-处理.png', '下载 3-b-处理.png', '下载 4-alpha-batch-处理.png']);
    await result.locator('summary', { hasText: '处理明细' }).click();
    assert.match(await textOf(result.locator('details li').nth(1)), /^broken\.png：失败，/);
    const retry = result.getByRole('button', { name: '只重试失败的 1 个' });
    await retry.waitFor();
    // 打包：ZIP 接在原来的下载后面，里面是成功的 3 个文件。
    await result.getByRole('button', { name: '全部打包下载（ZIP）' }).click();
    await result.locator('a', { hasText: '.zip' }).waitFor();
    const zip = unzipSync(fs.readFileSync(await save(page, dialog, '压缩与转格式-全部结果.zip')));
    assert.deepEqual(Object.keys(zip).sort(), ['1-a-处理.png', '3-b-处理.png', '4-alpha-batch-处理.png']);
    assert.equal((await sharp(Buffer.from(zip['3-b-处理.png'])).metadata()).format, 'png');
    // 只重试失败的：坏文件仍然失败，已经成功的下载都还在。
    await retry.click();
    await alertOf(dialog).waitFor();
    await finished(dialog);
    assert.match(await textOf(alertOf(dialog)), /PNG/);
    assert.equal(await result.locator('a').count(), 4, '原来的下载和 ZIP 都还在');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

// README·使用限制（单文件 25 MB）
test('反例：单个文件超过 25 MB 时说明上限、不生成文件，页面照常可用', async t => {
  const big = files.file('big.png', Buffer.concat([fs.readFileSync(await image('big-head.png')), Buffer.alloc(26 * 1024 * 1024)]));
  const small = await image('small.png');
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '图片处理', '压缩与转格式');
    await fileInput(dialog).setInputFiles(big);
    await startButton(dialog).click();
    await finished(dialog);
    assert.match(await textOf(alertOf(dialog)), /25 MiB/);
    assert.equal(await resultBox(dialog).count(), 0);
    await dialog.getByRole('button', { name: '清除选件' }).click();
    await fileInput(dialog).setInputFiles(small);
    await startButton(dialog).click();
    await finished(dialog);
    assert.match(await textOf(resultBox(dialog)), /已处理 1 张图片/);
    assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊·批量（单个文件失败只记入明细，成功的照常下载）；README·使用限制（单文件 25 MB）
test('反例：一批里有一个超过 25 MB 的文件时，只有它记为失败，其余照常处理', async t => {
  const big = files.file('big-in-batch.png', Buffer.concat([fs.readFileSync(await image('big-head-2.png')), Buffer.alloc(26 * 1024 * 1024)]));
  const small = await image('small-in-batch.png');
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '图片处理', '压缩与转格式');
    await fileInput(dialog).setInputFiles([small, big]);
    await startButton(dialog).click();
    await finished(dialog);
    assert.equal(await resultBox(dialog).locator('a').count(), 1, '小文件照常可以下载');
    await resultBox(dialog).locator('summary', { hasText: '处理明细' }).click();
    assert.match(await textOf(resultBox(dialog).locator('details li').nth(1)), /big-in-batch\.png：失败.*25 MiB/);
  });
});

// 需求§办公工坊·表格关联（关键值去首尾空格，可选忽略大小写、数字按数值比较；重复按第一条；未匹配、未使用的重复行各一张表；重名加“（查找表）”）
test('表格按关键列关联：001 对上 1、“ A ”对上 a，重复取第一条，未匹配和重复各列一张表', async t => {
  const main = await workbook('main.xlsx', { 主表: [['编号', '名称', '数量'], ['001', '苹果', 3], [' A ', '香蕉', 5], ['999', '没对上', 1]] });
  const lookup = await workbook('lookup.xlsx', { 查找表: [['编号', '名称', '单价'], [1, '苹果-查找表', 10], ['a', '香蕉-查找表', 20], ['a', '香蕉-重复', 99], ['777', '没用到', 1]] });
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '表格处理', '按关键列关联');
    await fileInput(dialog).setInputFiles([main, lookup]);
    await dialog.getByRole('button', { name: '读取表头' }).click();
    await dialog.locator('[role=status]', { hasText: '已读取 2 张表的表头' }).waitFor();
    assert.equal(await dialog.getByRole('combobox', { name: '主表（保留它的行）' }).locator('option:checked').innerText(), 'main.xlsx · 主表');
    assert.equal(await dialog.getByRole('combobox', { name: '查找表（从这里取列）' }).locator('option:checked').innerText(), 'lookup.xlsx · 查找表');
    assert.equal(await dialog.getByRole('combobox', { name: '主表关键列' }).inputValue(), '编号');
    assert.equal(await dialog.getByRole('combobox', { name: '查找表关键列' }).inputValue(), '编号');
    const columns = dialog.getByRole('group', { name: '要补过来的列' });
    await columns.getByRole('checkbox', { name: '名称' }).check();
    await columns.getByRole('checkbox', { name: '单价' }).check();
    // 两个勾选框写在同一个标签里（读屏名字相同），按顺序取：先“忽略大小写”，后“数字按数值比较”。
    const compare = dialog.locator('label.ww-field', { hasText: '关键值比较' }).locator('input[type=checkbox]');
    assert.match(await textOf(dialog.locator('label.ww-field', { hasText: '关键值比较' })), /忽略大小写.*数字按数值比较（001 = 1）/);
    await compare.nth(0).check(); await compare.nth(1).check();
    await startButton(dialog).click();
    await finished(dialog);
    assert.match(await resultBox(dialog).locator('strong').innerText(), /^主表 3 行，匹配 2 行，未匹配 1 行；查找表有 1 行关键值重复，按第一条匹配/);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(await save(page, dialog, '关联结果.xlsx'));
    // 末尾的空单元格读回来可能不存在，按表头宽度补齐。
    const rows = name => { const sheet = book.getWorksheet(name); assert.ok(sheet, `有“${name}”工作表`); const values = []; sheet.eachRow(row => values.push(row.values.slice(1))); return values.map(row => Array.from({ length: values[0].length }, (_, i) => row[i] ?? '')); };
    assert.deepEqual(book.worksheets.map(sheet => sheet.name), ['关联结果', '主表未匹配', '查找表重复（未使用）']);
    assert.deepEqual(rows('关联结果'), [['编号', '名称', '数量', '名称（查找表）', '单价'], ['001', '苹果', '3', '苹果-查找表', '10'], [' A ', '香蕉', '5', '香蕉-查找表', '20'], ['999', '没对上', '1', '', '']]);
    assert.deepEqual(rows('主表未匹配'), [['编号', '名称', '数量'], ['999', '没对上', '1']]);
    assert.deepEqual(rows('查找表重复（未使用）'), [['编号', '名称', '单价'], ['a', '香蕉-重复', '99']]);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊·表格规模（表格处理所有输入合计最多 10 万个单元格）
test('反例：表格超过 10 万个单元格时读取前就说明上限，不出结果，页面不卡住', async t => {
  const header = Array.from({ length: 10 }, (_, i) => `列${i + 1}`);
  const huge = await workbook('huge.xlsx', { 大表: [header, ...Array.from({ length: 11_000 }, (_, r) => header.map((_, c) => r * 10 + c))] });
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '表格处理', '按关键列关联');
    await fileInput(dialog).setInputFiles(huge);
    const started = Date.now();
    await dialog.getByRole('button', { name: '读取表头' }).click();
    await finished(dialog);
    assert.ok(Date.now() - started < 30_000, '30 秒内有结论');
    assert.match(await textOf(alertOf(dialog)), /100,000 个单元格/);
    assert.equal(await dialog.getByRole('combobox', { name: '主表（保留它的行）' }).count(), 0, '没有读出表头');
    assert.equal(await startButton(dialog).isDisabled(), true);
    assert.equal(await resultBox(dialog).count(), 0);
    await dialog.getByRole('button', { name: '清除选件' }).click();
    assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊（PDF：合并）；界面说明“按选择顺序合并多个文件”
test('合并 PDF：按调整后的顺序合并，页数和每页来源都对', async t => {
  const two = await pdf('two.pdf', [[400, 500], [410, 510]], 'TWO'), one = await pdf('one.pdf', [[300, 300]], 'ONE');
  const hashes = [await sha256(two), await sha256(one)];
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, 'PDF 处理', '合并 PDF');
    await fileInput(dialog).setInputFiles([two, one]);
    await dragOnto(page, fileGrip(dialog, 'one.pdf'), fileRow(dialog, 'two.pdf'), 0.3, 0.2);
    assert.deepEqual(await fileList(dialog), ['one.pdf', 'two.pdf']);
    await startButton(dialog).click();
    await finished(dialog);
    assert.match(await resultBox(dialog).locator('strong').innerText(), /^已生成 3 页 PDF/);
    const merged = await PDFDocument.load(fs.readFileSync(await save(page, dialog, 'one-合并.pdf')));
    assert.deepEqual(merged.getPages().map(p => [Math.round(p.getWidth()), Math.round(p.getHeight())]), [[300, 300], [400, 500], [410, 510]]);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
  assert.deepEqual([await sha256(two), await sha256(one)], hashes, '原件没被改');
});

// 需求§办公工坊（PDF：页面整理，缩略图里调整页面顺序）；决策 2026-11-13（调顺序按住缩略图或页码前面的小点拖，不用“←”“→”）
test('页面整理：按住缩略图或页码前面的小点拖动换页序，输出按新的顺序', async t => {
  const three = await pdf('three.pdf', [[300, 300], [400, 500], [500, 400]], 'THREE');
  const hash = await sha256(three);
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, 'PDF 处理', '页面整理');
    await fileInput(dialog).setInputFiles(three);
    const items = dialog.locator('.ww-pdf-grid > li');
    await items.nth(2).locator('img').waitFor({ timeout: 60_000 });
    const captions = () => dialog.locator('.ww-pdf-grid .ww-pdf-caption').allInnerTexts().then(list => list.map(text => text.trim()));
    assert.deepEqual(await captions(), ['1. 原第 1 页', '2. 原第 2 页', '3. 原第 3 页']);
    assert.equal(await dialog.getByRole('button', { name: /前移|后移/ }).count(), 0, '没有一格一格挪的箭头');
    assert.equal(await dialog.locator('.ww-pdf-grid .ww-grip').count(), 3, '每页页码前面一个小点');
    // 按住第 3 页的缩略图，一口气拖到第 1 页的左半边：排到最前。
    await dragOnto(page, items.nth(2).locator('.ww-pdf-thumb'), items.nth(0), 0.25, 0.5);
    assert.deepEqual(await captions(), ['1. 原第 3 页', '2. 原第 1 页', '3. 原第 2 页']);
    // 按住“原第 1 页”前面的小点，拖到最后一页的右半边：排到最后。
    await dragOnto(page, items.nth(1).locator('.ww-grip'), items.nth(2), 0.8, 0.5);
    assert.deepEqual(await captions(), ['1. 原第 3 页', '2. 原第 2 页', '3. 原第 1 页']);
    assert.equal(await items.nth(2).evaluate(element => element.style.transform + '|' + element.hasAttribute('data-dragging')), '|false', '放下后回到格子里');
    // 按住“旋转”“删除”这些按钮拖：拖不动。
    await dragOnto(page, items.nth(0).getByRole('button', { name: '原第 3 页顺时针旋转' }), items.nth(2), 0.8, 0.5);
    assert.deepEqual(await captions(), ['1. 原第 3 页', '2. 原第 2 页', '3. 原第 1 页'], '按住按钮拖不走这一页');
    // 不用鼠标：焦点在小点上按左右方向键，一次挪一位。
    await items.nth(2).locator('.ww-grip').focus();
    await page.keyboard.press('ArrowLeft');
    assert.deepEqual(await captions(), ['1. 原第 3 页', '2. 原第 1 页', '3. 原第 2 页']);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '拖动原第 1 页调整顺序，也可以按左右方向键');
    await startButton(dialog).click();
    await finished(dialog);
    const name = (await dialog.locator('.ww-tool-result a').first().innerText()).trim().replace(/^下载\s*/, '');
    const arranged = await PDFDocument.load(fs.readFileSync(await save(page, dialog, name)));
    assert.deepEqual(arranged.getPages().map(p => [Math.round(p.getWidth()), Math.round(p.getHeight())]), [[500, 400], [300, 300], [400, 500]], '输出按拖好的顺序');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
  assert.equal(await sha256(three), hash, '原件没被改');
});

// 需求§办公工坊（不支持的内容明确拒收，不静默丢弃）
test('反例：合并时有一个不是 PDF 的文件，说明原因，不生成缺页的结果', async t => {
  const one = await pdf('one-ok.pdf', [[300, 300]], 'ONE'), broken = files.file('broken.pdf', Buffer.from('这不是 PDF 文件，只是改了扩展名的文字。'));
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, 'PDF 处理', '合并 PDF');
    await fileInput(dialog).setInputFiles([one, broken]);
    await startButton(dialog).click();
    await finished(dialog);
    assert.match(await textOf(alertOf(dialog)), /不是 PDF/);
    assert.equal(await resultBox(dialog).count(), 0, '没有只含部分页面的结果');
    assert.deepEqual(errors, []);
  });
});

/** 在拖放区上模拟把文件拖进来：用页面里的 DataTransfer 装上文件，依次派发 dragover、drop。 */
async function dropFiles(page, target, entries) {
  const payload = entries.map(([name, file, type]) => ({ name, type, data: fs.readFileSync(file).toString('base64') }));
  const transfer = await page.evaluateHandle(items => {
    const data = new DataTransfer();
    for (const item of items) data.items.add(new File([Uint8Array.from(atob(item.data), c => c.charCodeAt(0))], item.name, { type: item.type }));
    return data;
  }, payload);
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await target.dispatchEvent('drop', { dataTransfer: transfer });
}

// 需求§办公工坊（选文件的地方可以直接把文件拖进去）；决策 2026-10-25
test('把文件拖进选择区：两张图片进入列表，可以直接开始处理', async t => {
  const first = await image('drop-1.png'), second = await image('drop-2.png', { width: 64, height: 48 });
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '图片处理', '压缩与转格式');
    const zone = dialog.locator('.ww-tool-drop');
    assert.match(await zone.locator('strong').innerText(), /把文件拖到这里/);
    await dropFiles(page, zone, [['drop-1.png', first, 'image/png'], ['drop-2.png', second, 'image/png']]);
    assert.deepEqual(await fileList(dialog), ['drop-1.png', 'drop-2.png']);
    await startButton(dialog).click();
    await finished(dialog);
    assert.deepEqual(await resultBox(dialog).locator('a').allInnerTexts(), ['下载 1-drop-1-处理.png', '下载 2-drop-2-处理.png']);
    assert.match(await textOf(resultBox(dialog).locator('strong')), /已处理 2 张图片/);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊（不支持的内容明确拒收，不静默丢弃）；需求§办公工坊·图片（读取的格式清单）
test('反例：往图片处理里拖进 Word 旧版 .doc 文件，处理时说明不符，不生成文件', async t => {
  const doc = files.file('x.doc', Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]));
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '图片处理', '压缩与转格式');
    await dropFiles(page, dialog.locator('.ww-tool-drop'), [['x.doc', doc, 'application/msword']]);
    await startButton(dialog).click();
    await finished(dialog);
    assert.match(await textOf(alertOf(dialog)), /扩展名与功能项要求不符/);
    assert.equal(await resultBox(dialog).count(), 0);
    assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊·放文件（2026-11-14 用户定：员工一般复制文件夹路径，不会拖文件夹，输入框要认贴进来的文件夹路径）
test('在输入框贴文件夹路径：读取后列出这一层的文件（不列隐藏文件、不进子文件夹），勾好放进来，和拖进来的文件一样出现在输入框上', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const folder = path.join(files.dir, '报名材料');
    files.file('报名材料/报名表.csv', '姓名,电话\n张三,13800000000\n');
    files.file('报名材料/说明.txt', '示例说明');
    files.file('报名材料/.备份.txt', '隐藏文件');
    files.file('报名材料/往年/2025.csv', '姓名\n李四\n');
    await openWhaleWing(page, dsh.url);
    await openTab(page, '办公工坊');
    const section = page.locator('section.ww-ws[aria-label=办公工坊]');
    // 资源管理器“复制文件地址”带引号，原样贴进来也认。
    await section.getByRole('textbox', { name: '要求' }).fill(`核对一下这个文件夹里的报名表 "${folder}"`);
    const picker = section.locator('.ww-ws-pathbox');
    assert.match(await textOf(picker), /认出了路径/);
    await picker.getByRole('button', { name: '读取', exact: true }).click();
    await picker.locator('.ww-ws-pathlist').waitFor();
    assert.match(await textOf(picker), /里有 2 个文件.*1 个子文件夹（不进去读/, '说清这一层几个文件、子文件夹不进去读');
    const names = await picker.locator('.ww-ws-pathlist label > span').evaluateAll(spans => spans.map(span => span.firstChild.textContent.trim()));
    assert.deepEqual(names, ['报名表.csv', '说明.txt'], '只列这一层的文件，隐藏文件不列');
    // 默认都勾上；去掉“说明.txt”，只放报名表。
    await picker.getByRole('checkbox', { name: /说明\.txt/ }).uncheck();
    await picker.getByRole('button', { name: '放进来（1 个）', exact: true }).click();
    const tray = section.locator('.ww-ws-tray');
    await tray.waitFor();
    assert.deepEqual(await tray.locator('.ww-ws-file > span').allInnerTexts(), ['报名表.csv'], '放进来的就是勾的那个');
    assert.equal(await tray.getByRole('button', { name: '拿掉 报名表.csv' }).count(), 1, '和拖进来的一样能拿掉');
    // 路径还在输入框里，认路径那一栏还会再出现（员工可以接着从同一个文件夹放别的）；路径不对时说清楚。
    await section.getByRole('textbox', { name: '要求' }).fill(`看看 "${path.join(folder, '没有这个')}"`);
    await section.locator('.ww-ws-pathbox').getByRole('button', { name: '读取', exact: true }).click();
    await section.locator('.ww-ws-pathbox [role=alert]').waitFor();
    assert.match(await textOf(section.locator('.ww-ws-pathbox [role=alert]')), /没有|找不到|不存在/);
    assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊·窗口收起和恢复（2026-11-14 用户看了原型定方案 A）
test('功能项窗口收起和恢复：最小化后页头出胶囊、页面不往下挤；点胶囊恢复；Esc 和点窗口外面只收起；结果没下载时关闭先问', async t => {
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '办公工坊');
    const section = page.locator('section.ww-ws[aria-label=办公工坊]');
    const headTop = async () => Math.round((await section.locator('.ww-ws-head').boundingBox()).y);
    const before = await headTop();
    const dialog = await openTool(page, '二维码', '生成二维码');
    await dialog.getByRole('textbox', { name: '网址或文字' }).fill('https://example.com/dock');
    await startButton(dialog).click();
    await finished(dialog);
    await dialog.getByRole('button', { name: '最小化窗口' }).click();
    await dialog.waitFor({ state: 'hidden' });
    const dock = section.locator('.ww-ws-head .ww-ws-dock');
    await dock.waitFor();
    assert.match(await textOf(dock), /^生成二维码\s*· 做好了，没下载$/, '胶囊写功能项名字和进度');
    assert.equal(await headTop(), before, '页头没被挤下去（原来插一整行“恢复 / 关闭窗口”，下移 88px）');
    assert.equal(await section.getByRole('button', { name: '恢复', exact: true }).count(), 0, '页面里不再插“恢复”一行');
    // 点胶囊恢复，结果还在。
    await dock.getByRole('button', { name: /^恢复二维码：生成二维码/ }).click();
    await dialog.waitFor();
    // 恢复后胶囊收走：窗口先打开，胶囊在下一次渲染时收走，等它，不在同一刻数。
    await dock.waitFor({ state: 'detached', timeout: 5000 });
    assert.deepEqual(await resultBox(dialog).locator('a').allInnerTexts(), ['下载 二维码.png', '下载 二维码.svg']);
    // Esc 只收起。
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await dock.waitFor();
    await dock.getByRole('button', { name: /^恢复/ }).click();
    await dialog.waitFor();
    // 点窗口外面也只收起。
    const box = await dialog.boundingBox();
    await page.mouse.click(Math.max(4, box.x - 12), box.y + 40);
    await dialog.waitFor({ state: 'hidden' });
    await dock.waitFor();
    // 胶囊上点 ×：结果没下载，先把窗口打开问一句；“先不关”什么都不动。
    await dock.getByRole('button', { name: '关闭生成二维码窗口' }).click();
    await dialog.waitFor();
    const ask = dialog.getByRole('alertdialog', { name: '关闭窗口' });
    assert.match(await textOf(ask), /做好的结果还没下载，关掉窗口就没了/);
    await ask.getByRole('button', { name: '先不关', exact: true }).click();
    assert.equal(await ask.count(), 0);
    assert.equal(await resultBox(dialog).count(), 1);
    // 下载过以后关闭不再问。
    await save(page, dialog, '二维码.png');
    await dialog.getByRole('button', { name: '关闭窗口' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await dock.count(), 0);
    assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊·窗口收起和恢复：员工切到别的页签时处理照常做完，页头的办公工坊页签上标点，做好了右上角提示（2026-11-14 方案 A）
test('收起后切到别的页签，处理照常做完：办公工坊页签上标点，做好了右上角提示“去看看”，点了回到办公工坊、窗口打开、点消失', async t => {
  const many = [];
  for (let i = 0; i < 8; i++) many.push(await noisyImage(`噪点-${i}.png`, 1600, 1200));
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '图片处理', '压缩与转格式');
    await fileInput(dialog).setInputFiles(many);
    await startButton(dialog).click();
    await dialog.getByRole('button', { name: '最小化窗口' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await openTab(page, '专家团队');
    const dot = page.locator('.ww-tabs [data-nav-item="toolbox"] .ww-tab-dot');
    await page.locator('.ww-tabs [data-nav-item="toolbox"] .ww-tab-dot[data-tone="done"]').waitFor({ timeout: 90_000 });
    assert.equal(await dot.getAttribute('aria-label'), '办公工坊：做好了，结果还没下载');
    const note = toast(page, '「压缩与转格式」做好了，结果还没下载');
    await note.waitFor();
    await note.getByRole('button', { name: '去看看' }).click();
    await dialog.waitFor();
    await resultBox(dialog).waitFor();
    assert.match(await textOf(resultBox(dialog)), /8/, '8 张都处理了');
    assert.equal(await dot.count(), 0, '回到办公工坊点就消失');
    assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊·最近做过（2026-11-14 用户定做：做好的一单换个文件照原样再做一遍，直接交给功能项，不经过小鲸、不花 token）
test('最近做过：开始页列出记下的做法；换文件再做一遍直接交给功能项，上次一个文件、这次两个就各做一遍；类型不对说清楚；能从列表里去掉', async t => {
  const one = await pdf('新合同-1.pdf', [[300, 400], [300, 400]], 'one'), two = await pdf('新合同-2.pdf', [[300, 400]], 'two');
  const wrong = files.file('说明.txt', '不是 PDF');
  const recipe = { id: 'r-e2e', title: '给这份合同加页码', chain: '添加页码', at: Date.now() - 3600_000, slots: [{ name: '合同.pdf', type: 'pdf' }], steps: [{ tool: 'pdf-number', note: '每页底下中间加“1 / 3”', options: {}, inputs: [{ slot: 0 }] }] };
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [recentKey, JSON.stringify([recipe])]);
    await openTab(page, '办公工坊');
    const section = page.locator('section.ww-ws[aria-label=办公工坊]');
    const recent = section.getByRole('region', { name: '最近做过' });
    await recent.waitFor();
    assert.match(await textOf(recent), /给这份合同加页码\s*添加页码 · (今天|昨天) \d\d:\d\d/);
    await recent.getByRole('button', { name: '换文件再做一遍', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '换文件再做一遍' });
    await drawer.waitFor();
    assert.match(await textOf(drawer), /上次用的文件：合同\.pdf/);
    assert.match(await textOf(drawer), /每个文件照上次的做法各做一遍/);
    assert.match(await textOf(drawer), /不经过小鲸，不花 token/);
    // 类型不对：说清楚，不开始。
    await drawer.getByLabel('这次要处理的文件').setInputFiles(wrong);
    await drawer.getByRole('button', { name: /^开始/ }).click();
    assert.equal(await textOf(drawer.getByRole('alert')), '上次处理的是PDF，「说明.txt」不是，换一个再试。');
    await drawer.getByRole('button', { name: '拿掉 说明.txt' }).click();
    // 两个 PDF：照“加页码”各做一遍，成两单。
    await drawer.getByLabel('这次要处理的文件').setInputFiles([one, two]);
    await drawer.getByRole('button', { name: '开始（2 个文件）', exact: true }).click();
    await drawer.waitFor({ state: 'detached' });
    const jobs = section.locator('.ww-ws-job');
    await jobs.nth(1).locator('.ww-ws-result').first().waitFor({ timeout: 60_000 });
    assert.equal(await jobs.count(), 2, '每个文件各做一遍');
    for (const index of [0, 1]) {
      const job = jobs.nth(index);
      assert.match(await textOf(job), /照上次的做法/);
      assert.match(await textOf(job), /这一单没经过小鲸：照上次的做法直接交给功能项/);
      assert.match(await textOf(job), /做完了 · 原文件没动/);
      await job.getByRole('button', { name: '保存…' }).waitFor();
      await job.getByRole('button', { name: '换文件再做一遍', exact: true }).waitFor();
    }
    // 重新打开：一单一单的记录不留，“最近做过”还是这一件（同一件做法只留一条），能去掉。
    await openWhaleWing(page, dsh.url);
    await openTab(page, '办公工坊');
    await recent.waitFor();
    assert.equal(await recent.locator('.ww-ws-recent-row').count(), 1);
    await recent.getByRole('button', { name: '从最近做过里去掉「给这份合同加页码」' }).click();
    await recent.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(key => localStorage.getItem(key), recentKey), '[]');
    assert.deepEqual(errors, []);
  });
});
