import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { startDsh, removeTree, pluginRoot } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, scratchFiles, textOf } from '../support/browser.mjs';

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
/** 打开办公工坊，点某个分类卡里的功能项，等办公工坊窗口打开并切到该功能项。 */
async function openTool(page, tool, fn) {
  await openTab(page, '办公工坊');
  await page.getByRole('button', { name: `${tool}：${fn}`, exact: true }).click();
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
  ['格式转换', ['Word 转 PDF', 'PDF 转 Word', '图片转 PDF', 'PDF 转图片', '图片转格式', 'Excel／CSV 互转', 'Excel 转 JSON', 'Word 转 TXT', '提取文档图片']],
  ['PDF 处理', ['合并', '拆分', '压缩', '页面整理', '旋转', '添加页码', '添加水印', '提取文字']],
  ['表格处理', ['合并表格', '拆分工作表', '按字段拆分', '按关键列关联', '数据去重', '两表核对', '条件筛选', '数据排序', '清理空白']],
  ['图片处理', ['压缩与转格式', '旋转翻转', '裁剪', '拼接长图', '宫格切图', '添加水印', '隐私打码', '去除水印']],
  ['文字处理', ['整理与统计', '批量替换', 'Word 版本对照']],
  ['音视频', ['视频提取音频', '音频转格式', '音频剪切', '视频截图']],
  ['二维码', ['生成', '批量生成', '识别']],
];
const squash = value => value.replace(/\s+/g, '').replace(/／/g, '/');

// 需求§办公工坊（7 个分类、功能项表）
test('办公工坊页面：7 个分类共 44 项，每个分类的功能项和需求的功能项表一致', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '办公工坊');
    const section = page.locator('section[aria-label=办公工坊]');
    await section.locator('.ww-tool-card').first().waitFor();
    assert.equal(await textOf(section.locator('.ww-pagehead p')), '44 项本机处理 · 文件不离开这台电脑');
    const cards = section.locator('.ww-tool-card');
    assert.equal(await cards.count(), requiredTools.length);
    for (const [index, [tool, functions]] of requiredTools.entries()) {
      const card = cards.nth(index);
      assert.equal(await card.locator('.ww-tool-card-head strong').innerText(), tool);
      assert.match(await card.locator('.ww-tool-card-head small').innerText(), new RegExp(`· ${functions.length} 个功能项$`), tool);
      const chips = await card.locator('.ww-tool-chip').allInnerTexts();
      assert.equal(chips.length, functions.length, `${tool}的功能项数`);
      functions.forEach((name, i) => assert.ok(squash(chips[i]).includes(squash(name)), `${tool}第 ${i + 1} 项应是“${name}”，界面是“${chips[i]}”`));
    }
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊·搜索（词序和大小写不限，能搜格式名和常用说法）
test('搜索：词序、大小写、中英文连写都能搜到；能搜格式名和常用说法', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '办公工坊');
    const search = page.getByRole('searchbox', { name: '搜索功能项' });
    const hits = async query => {
      await search.fill(query);
      await page.locator('.ww-tool-results, section[aria-label=办公工坊] p[role=status]').first().waitFor();
      return page.locator('.ww-tool-hit').evaluateAll(buttons => buttons.map(button => button.children[1].textContent));
    };
    for (const query of ['合并 PDF', 'pdf 合并', 'PDF合并']) assert.deepEqual(await hits(query), ['合并 PDF'], query);
    const avif = await hits('AVIF');
    assert.ok(avif.includes('压缩与转格式') && avif.includes('图片转格式'), `AVIF 搜到：${avif.join('、')}`);
    const imageFunctions = new Set(requiredTools.find(([tool]) => tool === '图片处理')[1].concat(['图片转格式', '图片转 PDF', '识别二维码']));
    assert.deepEqual(avif.filter(title => !imageFunctions.has(title)), [], 'AVIF 只搜到能读图片的功能项');
    assert.ok((await hits('照片压缩')).includes('压缩与转格式'));
    assert.ok((await hits('视频转音频')).includes('视频提取音频'));
    assert.ok((await hits('PDF 压缩')).includes('压缩 PDF'));
    await search.fill('');
    await page.locator('.ww-tool-card').first().waitFor();
    assert.equal(await page.locator('.ww-tool-card').count(), 7, '清空搜索回到 7 个分类');
    assert.deepEqual(errors, []);
  });
});

// 需求§办公工坊·搜索（搜到 HEIC、OCR 等尚未内置的能力时单独说明，不当作已有功能项）
test('反例：搜到尚未内置的能力时说明“没有匹配的功能项”和原因，不列出功能项', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '办公工坊');
    const section = page.locator('section[aria-label=办公工坊]'), search = page.getByRole('searchbox', { name: '搜索功能项' });
    const gaps = section.getByRole('list', { name: '尚未内置' });
    for (const [query, pattern] of [['HEIC', /HEIC/], ['OCR', /OCR.*尚未内置/]]) {
      await search.fill(query);
      await section.getByRole('status').filter({ hasText: '没有匹配的功能项' }).waitFor();
      assert.equal(await page.locator('.ww-tool-hit').count(), 0, `${query} 不列出功能项`);
      assert.match(await textOf(gaps), pattern, query);
    }
    await search.fill('xyz不存在');
    await section.getByRole('status').filter({ hasText: '没有匹配的功能项' }).waitFor();
    assert.equal(await gaps.count(), 0, '无关的词只说没有匹配');
    assert.equal(await page.locator('.ww-tool-hit').count(), 0);
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

// 需求§办公工坊·批量（多选可调整顺序、单独移除、继续添加；处理时显示第几个；单个失败只记入明细，成功的照常下载，可只重试失败的；可打包 ZIP）
test('批量处理：可调顺序和移除，显示第几个；坏文件只记入明细，其余照常下载并能打包', async t => {
  const a = await image('a.png', { width: 1200, height: 900 }), b = await image('b.jpg', { width: 1200, height: 900, format: 'jpeg', color: { r: 200, g: 160, b: 40 } });
  const good = fs.readFileSync(await image('broken-source.png', { width: 1200, height: 900, color: { r: 90, g: 90, b: 90 } }));
  const broken = files.file('broken.png', good.subarray(0, Math.floor(good.length / 2)));
  const alpha = await image('alpha-batch.png', { width: 1200, height: 900, alpha: true });
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    const dialog = await openTool(page, '图片处理', '压缩与转格式');
    await fileInput(dialog).setInputFiles([a, b, broken]);
    assert.deepEqual(await fileList(dialog), ['a.png', 'b.jpg', 'broken.png']);
    await dialog.getByRole('button', { name: '下移 a.png' }).click();
    assert.deepEqual(await fileList(dialog), ['b.jpg', 'a.png', 'broken.png']);
    await dialog.getByRole('button', { name: '上移 a.png' }).click();
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
    await dialog.getByRole('button', { name: '上移 one.pdf' }).click();
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
