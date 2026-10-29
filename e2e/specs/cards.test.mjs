import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startDsh, removeTree } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, scratchFiles, textOf, toast, drawer, modal, dialogButton, isCentered, isRed } from '../support/browser.mjs';
import { beijingDate } from '../../features/cards/tip-index.js';
import { cardsPlan, seedCardsNews, shiftDate, newsTitle, tipTitle, featuredTip, libraryDir, bookText, paragraphs, gbk, sha256 } from '../support/cards-fixture.mjs';

// 两套临时 DSH：dsh 里预先放了历史日报（每日资讯、AI 使用技巧），blank 是什么日报都没有的新环境。
// 书架每条用例自己从空开始，书在测试里现做 TXT、走界面导入。
let dsh, blank, browser, files, plan;
before(async () => {
  plan = cardsPlan();
  [dsh, blank, browser] = await Promise.all([startDsh({ seed: ({ home }) => seedCardsNews(home, plan) }), startDsh(), launchBrowser()]);
  files = scratchFiles('whalewing-e2e-cards-');
});
after(async () => { await browser?.close(); await Promise.all([dsh?.stop(), blank?.stop()]); if (files) removeTree(files.dir); });

// —— 书 ——
const chapterTitles = ['第一章 起点', '第二章 中段', '第三章 终点'];
/**
 * 一本三章的 TXT；书名就是文件名。每章 4 段，比一屏略长，滚到本章末尾才记为读完；
 * long 时前两章各 40 段，要翻好几页。encoding 为 gbk 时按 GBK 编码保存。
 */
function book(title, { long = false, encoding = 'utf8' } = {}) {
  const text = bookText(chapterTitles.map((heading, i) => [heading, paragraphs(`${title}·${heading.slice(4)}`, long && i < 2 ? 40 : 4)]), { lead: `${title}\n作者：鲸翼测试` });
  return files.file(`${title}.txt`, encoding === 'gbk' ? gbk(text) : text);
}
const books = n => Array.from({ length: n }, (_, i) => book(`鲸翼测试小书-${'甲乙丙丁'[i]}`));
const titleOf = file => path.basename(file, path.extname(file));

// —— 书架的磁盘状态 ——
const shelfFile = instance => path.join(libraryDir(instance.home), 'library.json');
const readShelf = (instance = dsh) => JSON.parse(fs.readFileSync(shelfFile(instance), 'utf8'));
/** 书目文件里每本书是不是常看：{ 书名: true/false }。 */
const dailyFlags = (instance = dsh) => Object.fromEntries(readShelf(instance).books.map(entry => [entry.title, entry.daily]));
/** 每条用例开始前把书架清空：书目写成空的、删掉阅读副本目录（这时没有页面在用书架）。 */
function resetShelf(instance = dsh) {
  const dir = libraryDir(instance.home);
  fs.mkdirSync(path.join(dir, 'books'), { recursive: true });
  for (const name of fs.readdirSync(path.join(dir, 'books'))) removeTree(path.join(dir, 'books', name));
  fs.writeFileSync(shelfFile(instance), JSON.stringify({ version: 1, groups: [], books: [] }));
}
/** 资讯存储文件的指纹：只读的操作前后应当不变。 */
function newsStore(instance) {
  const dir = path.join(instance.home, 'storages'), name = fs.readdirSync(dir).find(entry => entry.startsWith('whalewing_news_'));
  assert.ok(name, '资讯存储已经建好');
  return path.join(dir, name);
}

// —— 页面 ——
/** 首页的“今日学习”（读取中的骨架也带这个样式名，要排除）。 */
const learning = page => page.locator('.ww-learning:not(.ww-skeleton)');
async function openCards(page, instance = dsh) {
  await openWhaleWing(page, instance.url);
  await openTab(page, '知识卡片');
  await learning(page).waitFor();
}
const learningMeta = page => textOf(learning(page).locator('.ww-shelf-head small'));
async function openShelf(page) {
  await learning(page).getByRole('button', { name: '打开书架' }).click();
  await page.locator('.ww-library').waitFor();
}
async function backHome(page) {
  await page.locator('.ww-library .ww-crumb', { hasText: '知识卡片' }).click();
  await learning(page).waitFor();
}
async function closeToast(page) {
  const box = page.locator('.ww-toast');
  if (await box.count()) { await box.getByRole('button', { name: '关闭' }).click(); await box.waitFor({ state: 'detached' }); }
}
/** 在书架页导入一批书，等右上角提示出现，返回提示文字（提示随后关掉，免得挡住页面）。 */
async function importBooks(page, paths, expected = /已导入/) {
  await page.locator('.ww-library input[type=file]').setInputFiles(paths);
  const box = page.locator('.ww-toast').filter({ hasText: expected });
  await box.waitFor({ timeout: 60_000 });
  const text = await textOf(box.locator('.ww-toast-text'));
  await closeToast(page);
  return text;
}
/** 阅读器左侧的目录，和其中各章的标题（不含本章小节）。 */
const readerToc = reader => reader.getByRole('navigation', { name: '目录' });
const chapterList = reader => readerToc(reader).locator(':scope > ol > li > button > span:last-child');
const shelfTitles = page => page.locator('.ww-library-grid .ww-library-book h4').allInnerTexts();
const shelfCard = (page, title) => page.locator(`.ww-library-book[title="${title}"]`);
/** 点某本书的“…”，再点菜单里的一项。 */
async function bookAction(page, scope, title, action) {
  await scope.locator('.ww-book-menu').getByRole('button', { name: `${title} · 更多操作` }).click();
  await page.getByRole('dialog', { name: `${title} · 更多操作` }).getByRole('button', { name: action, exact: true }).click();
}
const deskTitles = page => learning(page).locator('.ww-desk-card .ww-desk-book strong').allInnerTexts();
const learningDate = date => { const [year, month, day] = date.split('-').map(Number); return `${month} 月 ${day} 日 · 星期${'日一二三四五六'[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}`; };
const fullDate = date => { const [year, month, day] = date.split('-').map(Number); return `${year} 年 ${month} 月 ${day} 日`; };
const slash = date => date.replaceAll('-', '/');

// 需求§知识卡片（首页先展示今日学习和最新一期每日资讯；领域设置在“卡片设置”）
test('首页：标题和“卡片设置”，今日学习带日期和“打开书架”，有 AI 使用技巧卡和每日资讯', async t => {
  resetShelf();
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openCards(page);
    const header = page.locator('.ww-cards > .ww-news-header');
    assert.equal(await header.locator('h2').innerText(), '知识卡片');
    await header.getByRole('button', { name: '卡片设置' }).waitFor();
    assert.equal(await textOf(learning(page).locator('.ww-shelf-eyebrow')), '今日学习');
    assert.equal(await learning(page).locator('.ww-shelf-head h3').innerText(), learningDate(plan.today));
    await learning(page).getByRole('button', { name: '打开书架' }).waitFor();
    const tip = learning(page).locator('.ww-tip-card');
    assert.match(await textOf(tip), /AI 使用技巧.*近 14 天.*查看往期 →/);
    const news = page.locator('.ww-cards > .ww-shelf').filter({ has: page.locator('.ww-shelf-eyebrow', { hasText: '每日资讯' }) });
    assert.equal(await news.first().locator('.ww-shelf-head h3').innerText(), 'AI 与科技', '最新一期排在最前');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

// 需求§今日学习与书架（零本只放一张“添加常看书籍”的虚线占位卡，卡里不出现任何书；“换一本”和占位卡打开右侧“选择常看书籍”抽屉）
test('常看为零时首页只有一张虚线占位卡、不出现书：书架空时进书架导入，书架有书时打开“选择常看书籍”', async t => {
  resetShelf();
  const [first] = books(1);
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page);
    const placeholder = learning(page).locator('.ww-desk-add');
    assert.equal(await placeholder.evaluate(element => getComputedStyle(element).borderTopStyle), 'dashed');
    assert.match(await textOf(placeholder), /书架里还没有书.*导入电子书，或从在线书目下载开放许可的书/);
    assert.equal(await learning(page).locator('.ww-desk-card, .ww-desk .ww-cover').count(), 0, '占位卡里没有书');
    assert.equal(await learningMeta(page), '书架还是空的');
    await placeholder.click();
    await page.locator('.ww-library').waitFor();
    await page.waitForFunction(() => document.activeElement?.classList.contains('ww-library-add'));
    // 导入一本后点提示里的“不放首页”：书在书架上，常看为零。
    await page.locator('.ww-library input[type=file]').setInputFiles(first);
    const notice = page.locator('.ww-toast').filter({ hasText: `已导入《${titleOf(first)}》` });
    await notice.getByRole('button', { name: '不放首页' }).click();
    await toast(page, `已取消常看《${titleOf(first)}》`).waitFor();
    await closeToast(page);
    await backHome(page);
    assert.equal(await learningMeta(page), '还没有常看书 · 书架 1 本');
    assert.match(await textOf(placeholder), /添加常看书籍.*从书架选一到两本/);
    assert.equal(await learning(page).locator('.ww-desk-card, .ww-desk .ww-cover').count(), 0, '占位卡里没有书');
    await placeholder.click();
    const picker = drawer(page, '选择常看书籍');
    await picker.waitFor();
    assert.equal(await picker.getByRole('checkbox').count(), 1);
    assert.equal(await picker.getByRole('checkbox').isChecked(), false);
    assert.deepEqual(errors, []);
  });
});

// 需求§今日学习与书架（能导入的格式；TXT 自动识别 UTF-8、GBK，识别“第X章”；导入后只保留阅读副本，不另存原文件）
test('导入 TXT：UTF-8 和 GBK 都分成 3 章、中文不乱码，书架上有生成的封面，本机只留每章一份阅读副本', async t => {
  resetShelf();
  const utf8 = book('鲸翼测试小书-CRD03'), legacy = book('鲸翼测试小书-CRD03-GBK', { encoding: 'gbk' });
  const hashes = [await sha256(utf8), await sha256(legacy)];
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openCards(page);
    await openShelf(page);
    const accept = (await page.locator('.ww-library input[type=file]').getAttribute('accept')).split(',');
    for (const extension of ['epub', 'txt', 'pdf', 'mobi', 'azw3', 'prc', 'docx', 'fb2', 'rtf', 'html', 'md', 'cbz', 'zip']) assert.ok(accept.includes(`.${extension}`), `可以选 .${extension}`);
    assert.match(await importBooks(page, utf8), /^已导入《鲸翼测试小书-CRD03》/);
    assert.match(await importBooks(page, legacy, /CRD03-GBK/), /^已导入《鲸翼测试小书-CRD03-GBK》/);
    for (const title of ['鲸翼测试小书-CRD03', '鲸翼测试小书-CRD03-GBK']) {
      const card = shelfCard(page, title);
      assert.equal(await card.locator('.ww-cover-plain strong').innerText(), title, '没有原封面时用书名生成封面');
      assert.match(await textOf(card.locator('.ww-library-meta small.ww-muted')), /^TXT · 3 章 · 未读$/);
      await bookAction(page, card, title, '阅读');
      const reader = page.locator('dialog.ww-book[open]');
      await reader.waitFor();
      assert.match(await textOf(reader.locator('.ww-book-progress > span')), /^第 1 \/ 3 章 · 第一章 起点$/);
      assert.match(await textOf(reader.locator('.ww-rendered')), new RegExp(`${title}·起点第 1 段：鲸翼功能测试的正文`), '正文是正常的中文');
      assert.deepEqual(await chapterList(reader).allInnerTexts(), chapterTitles, '左侧目录列出三章');
      await reader.getByRole('button', { name: '关闭' }).click();
      await reader.waitFor({ state: 'detached' });
    }
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
  // 本机只有阅读副本：每本一个目录，里面是 book.json、每章一份 Markdown，没有原文件。
  const shelf = readShelf(), root = libraryDir(dsh.home);
  assert.equal(shelf.books.length, 2);
  for (const entry of shelf.books) {
    const dir = path.join(root, 'books', entry.id);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['book.json', 'chapters', 'images']);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'chapters')), ['00001.md', '00002.md', '00003.md']);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'images')), []);
    assert.match(fs.readFileSync(path.join(dir, 'chapters', '00002.md'), 'utf8'), /## 第二章 中段/);
  }
  assert.deepEqual(fs.readdirSync(path.join(root, 'uploads')), [], '上传的临时文件已清掉');
  assert.deepEqual([await sha256(utf8), await sha256(legacy)], hashes, '原文件不受影响');
});

/** 不能读的文件：CHM、旧版 .doc、RAR（文件头是真的，内容是填充），文件头对但内容坏掉的 EPUB，0 字节的 TXT。 */
const unreadable = () => ({
  chm: files.file('x.chm', Buffer.concat([Buffer.from('ITSF'), Buffer.alloc(200, 1)])),
  doc: files.file('x.doc', Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(200)])),
  rar: files.file('x.rar', Buffer.concat([Buffer.from('Rar!\x1a\x07\x00', 'latin1'), Buffer.alloc(200)])),
  epub: files.file('broken.epub', Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(60, 7)])),
  empty: files.file('empty.txt', Buffer.alloc(0)),
});
/** 书架页导入一批书，等右上角出现提到 marker 的失败提示，返回提示文字。 */
async function importFailure(page, paths, marker) {
  await page.locator('.ww-library input[type=file]').setInputFiles(paths);
  const failure = toast(page, '', 'error').filter({ hasText: marker });
  await failure.waitFor({ timeout: 60_000 });
  return { failure, message: await textOf(failure.locator('.ww-toast-text')) };
}

// 需求§今日学习与书架（不能读的格式导入时说明原因；同一文件不重复导入）；需求§界面通用约定（失败在右上角提示，带恢复动作）
test('反例：不能读的文件和重复导入都不进书架：右上角报错并带“重试”，书目和上传临时文件都不变', async t => {
  resetShelf();
  const [good] = books(1), bad = unreadable();
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, good);
    const before = fs.readFileSync(shelfFile(dsh), 'utf8');
    const { failure, message } = await importFailure(page, Object.values(bad), 'empty.txt');
    for (const file of Object.values(bad)) assert.ok(message.includes(`《${path.basename(file)}》`), `提示里有 ${path.basename(file)}`);
    assert.doesNotMatch(message, /已导入/, '一本都没导入');
    await failure.getByRole('button', { name: '重试' }).waitFor();
    await closeToast(page);
    await importFailure(page, good, `《${path.basename(good)}》`);
    await closeToast(page);
    assert.deepEqual(await shelfTitles(page), [titleOf(good)]);
    assert.equal(await page.locator('.ww-library .ww-crumbs small').innerText(), '1');
    assert.equal(fs.readFileSync(shelfFile(dsh), 'utf8'), before, '书目文件没变');
    assert.deepEqual(fs.readdirSync(path.join(libraryDir(dsh.home), 'uploads')), [], '上传的临时文件已清掉');
    assert.deepEqual(errors, []);
  });
});

// 需求§今日学习与书架（DRM、CHM、DjVu、UMD、旧版 .doc、RAR/7z 不能读，导入时说明原因和办法（如用 Calibre 转成 EPUB、另存为 DOCX、先解压）；同一文件不重复导入）
test('反例：CHM、旧版 .doc、RAR、坏 EPUB 导入时各自说明原因和办法，重复导入说明已在书架', async t => {
  resetShelf();
  const [good] = books(1), bad = unreadable();
  await withPage(browser, t, async ({ page }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, good);
    const { message } = await importFailure(page, [bad.chm, bad.doc, bad.rar, bad.epub], 'broken.epub');
    assert.match(message, /《x\.chm》[^《]*Calibre[^《]*EPUB/);
    assert.match(message, /《x\.doc》[^《]*另存为 DOCX/);
    assert.match(message, /《x\.rar》[^《]*先解压/);
    assert.match(message, /《broken\.epub》[^《]*(EPUB|压缩包|读取|损坏)/);
    assert.doesNotMatch(message, /内部出错|gateway/);
    await closeToast(page);
    const duplicate = await importFailure(page, good, `《${path.basename(good)}》`);
    assert.match(duplicate.message, new RegExp(`已经在书架上了：《${titleOf(good)}》`));
  });
});

// 需求§今日学习与书架（不能读的文件导入时说明原因）；需求§界面通用约定（失败在右上角提示）
test('反例：导入 0 字节的文件时说明文件是空的，不显示程序内部信息', async t => {
  resetShelf();
  const { empty } = unreadable();
  await withPage(browser, t, async ({ page }) => {
    await openCards(page);
    await openShelf(page);
    const { message } = await importFailure(page, empty, 'empty.txt');
    assert.match(message, /《empty\.txt》[^《]*空/);
    assert.doesNotMatch(message, /too_small|"code"/);
    assert.deepEqual(readShelf().books, []);
  });
});

// 需求§今日学习与书架（新书自动补位，提示里有“不放首页”可撤销；一本时是加宽书卡，右侧“接下来”和“查看全部 n 章”；表头“常看 n / 2 本 · 书架 n 本”）
test('新书自动设为常看：首页是加宽书卡，带章节、时长、摘要和“接下来”；再导入一本点“不放首页”不进常看', async t => {
  resetShelf();
  const [first, second] = books(2);
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    await page.locator('.ww-library input[type=file]').setInputFiles(first);
    const notice = toast(page, `已导入《${titleOf(first)}》，已放到首页常看`);
    await notice.getByRole('button', { name: '不放首页' }).waitFor();
    await closeToast(page);
    await backHome(page);
    assert.equal(await learningMeta(page), '常看 1 / 2 本 · 书架 1 本');
    const card = learning(page).locator('.ww-desk-card.ww-desk-wide');
    assert.equal(await card.count(), 1, '一本时是一张加宽书卡');
    await card.locator('.ww-cover').waitFor();
    assert.match(await textOf(card.locator('.ww-desk-chapter')), /^第 1 \/ 3 章 约 \d+ 分钟$/);
    assert.equal(await card.locator('.ww-desk-title').innerText(), '第一章 起点');
    assert.match(await textOf(card.locator('.ww-desk-excerpt')), /起点第 1 段/);
    assert.equal(await card.locator('.ww-desk-pct').innerText(), '0%');
    assert.equal(await card.locator('.ww-desk-next .ww-desk-eyebrow').innerText(), '接下来');
    assert.deepEqual(await card.locator('.ww-desk-next-row strong').allInnerTexts(), ['第二章 中段', '第三章 终点']);
    await card.getByRole('button', { name: '查看全部 3 章' }).waitFor();
    await openShelf(page);
    await page.locator('.ww-library input[type=file]').setInputFiles(second);
    await toast(page, `已导入《${titleOf(second)}》`).getByRole('button', { name: '不放首页' }).click();
    await toast(page, `已取消常看《${titleOf(second)}》`).waitFor();
    await closeToast(page);
    await backHome(page);
    assert.equal(await learningMeta(page), '常看 1 / 2 本 · 书架 2 本');
    assert.deepEqual(await deskTitles(page), [titleOf(first)]);
    assert.deepEqual(errors, []);
  });
  assert.deepEqual(dailyFlags(), { [titleOf(first)]: true, [titleOf(second)]: false });
});

// 需求§今日学习与书架（删除常看书不自动补位）
test('删除一本常看书后不自动补位：常看剩 1 本，另一本仍不是常看', async t => {
  resetShelf();
  const [a, b, c] = books(3);
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    assert.match(await importBooks(page, [a, b, c]), /已导入 3 本书，《鲸翼测试小书-甲》《鲸翼测试小书-乙》已放到首页常看/);
    await bookAction(page, shelfCard(page, titleOf(a)), titleOf(a), '从书架删除');
    await dialogButton(modal(page, '删除这本书'), '从书架删除').click();
    await toast(page, '已从书架删除').waitFor();
    assert.equal(await page.locator('.ww-pin-label strong').innerText(), '1 / 2');
    assert.equal(await shelfCard(page, titleOf(c)).locator('.ww-pin-badge').count(), 0, '第三本没有被设为常看');
    await closeToast(page);
    await backHome(page);
    assert.equal(await learningMeta(page), '常看 1 / 2 本 · 书架 2 本');
    assert.deepEqual(await deskTitles(page), [titleOf(b)]);
    assert.deepEqual(errors, []);
  });
  assert.deepEqual(dailyFlags(), { [titleOf(b)]: true, [titleOf(c)]: false });
});

// 需求§今日学习与书架·换书（已满两本再设第三本时弹出居中弹窗，选一本换下，换下的书留在书架、进度不变；替换在右上角提示里能撤销）
test('已满两本时设第三本：居中弹窗选一本换下，换下的书留在书架、进度不变，提示里能撤销', async t => {
  resetShelf();
  const [a, b, c] = books(3);
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, [a, b, c]);
    // 先把甲读到第二章：在目录里点第二章，滚到本章末尾算读完，记下它的进度。
    await bookAction(page, shelfCard(page, titleOf(a)), titleOf(a), '阅读');
    const reader = page.locator('dialog.ww-book[open]');
    await readerToc(reader).getByRole('button', { name: /第二章 中段/ }).click();
    await reader.locator('.ww-book-progress > span', { hasText: '第 2 / 3 章' }).waitFor();
    await scrollTo(reader, 1);
    await reader.getByRole('button', { name: '关闭' }).click();
    await reader.waitFor({ state: 'detached' });
    await shelfCard(page, titleOf(a)).locator('.ww-library-meta small.ww-muted', { hasText: '读到第 3 章' }).waitFor();
    const progress = readShelf().books.find(entry => entry.title === titleOf(a)).progress;
    await bookAction(page, shelfCard(page, titleOf(c)), titleOf(c), '设为常看');
    const dialog = modal(page, '常看书籍最多两本');
    await dialog.waitFor();
    assert.ok(await isCentered(page, dialog), '居中弹窗');
    assert.match(await textOf(dialog.locator('.ww-confirm-body > p')), new RegExp(`把《${titleOf(c)}》设为常看，需要换下一本`));
    assert.deepEqual((await dialog.getByRole('radio').allInnerTexts()).map(text => text.split('\n')[0]).sort(), [titleOf(a), titleOf(b)].sort());
    assert.equal(await dialogButton(dialog, '选一本换下').isDisabled(), true, '没选时不能确认');
    await dialog.getByRole('radio', { name: new RegExp(titleOf(a)) }).click();
    await dialogButton(dialog, `换下《${titleOf(a)}》`).click();
    const notice = toast(page, `《${titleOf(c)}》已设为常看，换下了《${titleOf(a)}》`);
    await notice.waitFor();
    assert.deepEqual(await shelfTitles(page).then(list => list.sort()), [titleOf(a), titleOf(b), titleOf(c)].sort(), '换下的书还在书架上');
    assert.equal(await shelfCard(page, titleOf(a)).locator('.ww-pin-badge').count(), 0);
    const after = readShelf().books;
    assert.deepEqual(after.find(entry => entry.title === titleOf(a)).progress, progress, '换下的书进度不变');
    assert.deepEqual(after.filter(entry => entry.daily).map(entry => entry.title).sort(), [titleOf(b), titleOf(c)].sort());
    await notice.getByRole('button', { name: '撤销' }).click();
    await toast(page, '已撤销').waitFor();
    assert.deepEqual(readShelf().books.filter(entry => entry.daily).map(entry => entry.title).sort(), [titleOf(a), titleOf(b)].sort(), '撤销后恢复原来的两本');
    assert.equal(await shelfCard(page, titleOf(a)).locator('.ww-pin-badge').count(), 1);
    assert.deepEqual(errors, []);
  });
});

// 需求§今日学习与书架·换书（“选择常看书籍”抽屉最多勾两本）
test('反例：“选择常看书籍”已勾两本时第三本勾不上，并说明已选满；取消后常看不变', async t => {
  resetShelf();
  const [a, b, c] = books(3);
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, [a, b, c]);
    const before = fs.readFileSync(shelfFile(dsh), 'utf8');
    await backHome(page);
    const card = learning(page).locator('.ww-desk-card').filter({ hasText: titleOf(a) });
    await bookAction(page, card, titleOf(a), '换一本');
    const picker = drawer(page, '选择常看书籍');
    await picker.waitFor();
    assert.equal(await textOf(picker.locator('.ww-pin-count')), '已选 2 / 2 本 · 已选满两本，先取消一本');
    const third = picker.getByRole('checkbox', { name: new RegExp(titleOf(c)) });
    assert.equal(await third.isDisabled(), true, '第三本不能勾');
    assert.equal(await third.isChecked(), false);
    assert.equal(await picker.getByRole('checkbox', { checked: true }).count(), 2);
    assert.equal(await dialogButton(picker, '保存常看书籍').isDisabled(), true, '没有改动不能保存');
    await dialogButton(picker, '取消').click();
    await picker.waitFor({ state: 'detached' });
    assert.deepEqual((await deskTitles(page)).sort(), [titleOf(a), titleOf(b)].sort());
    assert.equal(fs.readFileSync(shelfFile(dsh), 'utf8'), before, '书目文件没变');
    assert.deepEqual(errors, []);
  });
});

/** 阅读器正文的滚动区，以及它现在滚到哪、能滚多少。 */
const readerScroll = reader => reader.locator('.ww-book-scroll');
const scrollState = reader => readerScroll(reader).evaluate(element => ({ top: Math.round(element.scrollTop), room: element.scrollHeight - element.clientHeight }));
const chapterNow = reader => textOf(reader.locator('.ww-book-progress > span'));
/** 把正文滚到底（或某个比例），等滚动事件处理完。 */
async function scrollTo(reader, ratio) {
  await readerScroll(reader).evaluate((element, value) => { element.scrollTop = value * (element.scrollHeight - element.clientHeight); element.dispatchEvent(new Event('scroll')); }, ratio);
}
/**
 * 在正文上滚一下滚轮。换章要在本章末尾（开头）停一下再接着滚：两次之间隔开 0.3 秒，这段间隔就是员工的停顿，不是等界面。
 */
async function wheelTwice(page, reader, deltaY) {
  const box = await readerScroll(reader).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await new Promise(resolve => setTimeout(resolve, 300));
  await page.mouse.wheel(0, deltaY);
}
/** 一本带小节和插图的 HTML 书：三章，每章三个二级标题，第一章第一节里有一张图。 */
async function illustratedBook(title) {
  const { createRequire } = await import('node:module');
  const sharp = createRequire(new URL('../../package.json', import.meta.url))('sharp');
  const png = await sharp({ create: { width: 900, height: 520, channels: 3, background: '#e7eef8' } }).png().toBuffer();
  const para = (label, n) => Array.from({ length: n }, (_, i) => `<p>${label}第 ${i + 1} 段：鲸翼功能测试的正文，用来检查上下滚动、本章小节和阅读位置。这一段写满一百个字左右，内容没有实际意义。</p>`).join('');
  const chapter = (n, name) => `<h1>${n} ${name}</h1>${para(`${name}·引言`, 2)}<h2>${n}.1 任务执行指引</h2>${para(`${name}·指引`, 3)}${n === 1 ? `<p><img src="data:image/png;base64,${png.toString('base64')}" alt="图 ${n}-1 执行指引"></p>` : ''}<h2>${n}.2 知识准备</h2>${para(`${name}·知识`, 8)}<h2>${n}.3 案例</h2>${para(`${name}·案例`, 24)}`;
  return files.file(`${title}.html`, `<html><head><title>${title}</title></head><body>${chapter(1, '需求从哪来')}${chapter(2, '日常需求分析')}${chapter(3, '需求评审')}</body></html>`);
}

// 需求§今日学习与书架（2026-10-28 用户要求改成电脑上的读法：正文一栏上下滚动，目录在左侧；滚到本章末尾记为读完，章末有“下一章”，
// 停一下再往下滚进入下一章；关闭后回到打开它的那一页并原位刷新进度）
test('阅读器：正文上下滚动、目录在左侧；滚到第一章末尾有“下一章”，停一下再往下滚进入第二章；关闭后首页书卡推进到第 2 章', async t => {
  resetShelf();
  const long = book('鲸翼测试长书', { long: true });
  await withPage(browser, t, { reducedMotion: 'reduce' }, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, long);
    await backHome(page);
    await learning(page).getByRole('button', { name: `读《鲸翼测试长书》第 1 章：第一章 起点` }).click();
    const reader = page.getByRole('dialog', { name: '鲸翼测试长书' });
    await reader.locator('.ww-book-progress > span', { hasText: '第 1 / 3 章 · 第一章 起点' }).waitFor();
    for (const name of ['目录', '缩小字号', '放大字号', '关闭']) await reader.getByRole('button', { name, exact: true }).waitFor();
    assert.equal(await reader.getByRole('button', { name: '目录', exact: true }).getAttribute('aria-expanded'), 'true', '宽窗时目录默认展开');
    assert.deepEqual(await chapterList(reader).allInnerTexts(), chapterTitles);
    assert.equal(await readerToc(reader).locator(':scope > ol > li > button[aria-current=true]').innerText().then(text => text.includes('第一章 起点')), true, '当前章高亮');
    assert.equal(await reader.locator('.ww-book-edge, .ww-book-viewport').count(), 0, '不再左右翻页');
    const start = await scrollState(reader);
    assert.ok(start.top === 0 && start.room > 0, `第一章要往下滚好几屏（可滚 ${start.room}px）`);
    assert.equal(readShelf().books[0].progress.next, 0, '还没读到末尾，不算读完');
    await scrollTo(reader, 1);
    await reader.locator('.ww-book-next-chapter', { hasText: '下一章：第二章 中段' }).waitFor();
    assert.match(await textOf(reader.locator('.ww-book-scroll-hint')), /停一下再往下滚，进入下一章/);
    assert.match(await chapterNow(reader), /^第 1 \/ 3 章/, '滚到底还在第一章');
    await wheelTwice(page, reader, 100);
    await reader.locator('.ww-book-progress > span', { hasText: '第 2 / 3 章 · 第二章 中段' }).waitFor();
    assert.equal((await scrollState(reader)).top, 0, '从第二章开头读起');
    await reader.getByRole('button', { name: '关闭' }).click();
    await reader.waitFor({ state: 'detached' });
    const card = learning(page).locator('.ww-desk-card');
    await card.locator('.ww-desk-chapter', { hasText: '第 2 / 3 章' }).waitFor();
    assert.equal(await card.locator('.ww-desk-title').innerText(), '第二章 中段');
    assert.notEqual(await card.locator('.ww-desk-pct').innerText(), '0%', '百分比增加');
    assert.deepEqual(errors, []);
  });
  assert.equal(readShelf().books[0].progress.next, 1, '第一章记为读完');
});

// 需求§今日学习与书架（读到的位置记在本机，下次打开回到原处；字号也记住）
test('读到一半关掉，再打开同一章回到原来的位置，字号也还是上次的', async t => {
  resetShelf();
  const long = book('鲸翼测试记位置', { long: true });
  await withPage(browser, t, { reducedMotion: 'reduce' }, async ({ page }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, long);
    await bookAction(page, shelfCard(page, '鲸翼测试记位置'), '鲸翼测试记位置', '阅读');
    let reader = page.getByRole('dialog', { name: '鲸翼测试记位置' });
    await reader.locator('.ww-book-progress > span', { hasText: '第 1 / 3 章' }).waitFor();
    await reader.getByRole('button', { name: '放大字号', exact: true }).click();
    const size = await reader.evaluate(element => element.style.getPropertyValue('--ww-book-size'));
    await scrollTo(reader, 0.5);
    const before = await scrollState(reader);
    await reader.getByRole('button', { name: '关闭' }).click();
    await reader.waitFor({ state: 'detached' });
    await bookAction(page, shelfCard(page, '鲸翼测试记位置'), '鲸翼测试记位置', '阅读');
    reader = page.getByRole('dialog', { name: '鲸翼测试记位置' });
    await reader.locator('.ww-book-progress > span', { hasText: '第 1 / 3 章' }).waitFor();
    await page.waitForFunction(([element, expected]) => Math.abs(element.scrollTop - expected) <= 4, [await readerScroll(reader).elementHandle(), before.top]);
    assert.equal(await reader.evaluate(element => element.style.getPropertyValue('--ww-book-size')), size, '字号是上次调的');
    assert.notEqual(size, '16.5px');
  });
});

// 需求§今日学习与书架（一章一读；最后一章没有下一章）——在头和尾继续滚、按方向键都不越界
test('反例：第一章开头往上滚、按 ← 都不会离开第一章；最后一章末尾没有“下一章”，再往下滚、按 → 都停在原地、不出错', async t => {
  resetShelf();
  const [only] = books(1);
  await withPage(browser, t, { reducedMotion: 'reduce' }, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, only);
    await bookAction(page, shelfCard(page, titleOf(only)), titleOf(only), '阅读');
    const reader = page.getByRole('dialog', { name: titleOf(only) });
    await reader.locator('.ww-book-progress > span', { hasText: '第 1 / 3 章' }).waitFor();
    await wheelTwice(page, reader, -100);
    await page.keyboard.press('ArrowLeft');
    assert.match(await chapterNow(reader), /^第 1 \/ 3 章/, '还在第一章');
    await readerToc(reader).getByRole('button', { name: /第三章 终点/ }).click();
    await reader.locator('.ww-book-progress > span', { hasText: '第 3 / 3 章 · 第三章 终点' }).waitFor();
    await scrollTo(reader, 1);
    assert.equal(await reader.locator('.ww-book-next-chapter').count(), 0, '最后一章没有“下一章”');
    assert.match(await textOf(reader.locator('.ww-book-end')), /全书完/);
    await wheelTwice(page, reader, 100);
    await page.keyboard.press('ArrowRight');
    assert.match(await chapterNow(reader), /^第 3 \/ 3 章/, '停在最后一章');
    assert.equal(await reader.isVisible(), true);
    assert.deepEqual(errors, []);
  });
});

// 需求§今日学习与书架（目录在左侧，本章小节跟着阅读位置；插图按正文宽度显示，点开看大图）
test('本章小节列在目录里，点了跳到那一节并高亮；插图点开看大图，Esc 只关大图', async t => {
  resetShelf();
  const file = await illustratedBook('鲸翼测试插图书');
  await withPage(browser, t, { reducedMotion: 'reduce' }, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, file);
    await bookAction(page, shelfCard(page, '鲸翼测试插图书'), '鲸翼测试插图书', '阅读');
    const reader = page.getByRole('dialog', { name: '鲸翼测试插图书' });
    await reader.locator('.ww-book-progress > span', { hasText: '第 1 / 3 章' }).waitFor();
    const sections = readerToc(reader).locator('.ww-book-sections button');
    await sections.first().waitFor();
    assert.deepEqual(await sections.allInnerTexts(), ['1.1 任务执行指引', '1.2 知识准备', '1.3 案例'], '只列本章的小节，不重复章名');
    await sections.filter({ hasText: '1.3 案例' }).click();
    await readerToc(reader).locator('.ww-book-sections button[aria-current=location]', { hasText: '1.3 案例' }).waitFor();
    const heading = await reader.locator('.ww-rendered h2', { hasText: '1.3 案例' }).boundingBox(), area = await readerScroll(reader).boundingBox();
    assert.ok(heading.y >= area.y - 2 && heading.y - area.y < 80, `那一节的标题滚到了顶上（离顶 ${Math.round(heading.y - area.y)}px）`);
    const image = reader.getByRole('button', { name: '查看大图：图 1-1 执行指引' });
    await scrollTo(reader, 0);
    const width = await image.evaluate(element => element.getBoundingClientRect().width), column = await reader.locator('.ww-rendered').evaluate(element => element.getBoundingClientRect().width);
    assert.ok(width <= column + 1, '插图不超出正文宽度');
    await image.click();
    const zoom = reader.getByRole('dialog', { name: '查看大图' });
    await zoom.locator('img[alt="图 1-1 执行指引"]').waitFor();
    await page.keyboard.press('Escape');
    await zoom.waitFor({ state: 'detached' });
    assert.equal(await reader.isVisible(), true, 'Esc 只关大图，阅读器还在');
    assert.deepEqual(errors, []);
  });
});

// 需求§今日学习与书架（2026-10-28 用户反馈：正文旁边也要有目录那样看得见、能拖的滚动条，长章节好定位；拖到底只算读完，
// 换章仍要停一下再往下滚）
test('正文右边有看得见的滚动条：拖动滑块跳到本章中间，小节高亮跟着走；反例：拖到底只记读完，不自动换章', async t => {
  resetShelf();
  const file = await illustratedBook('鲸翼测试滚动条');
  await withPage(browser, t, { reducedMotion: 'reduce' }, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, file);
    await bookAction(page, shelfCard(page, '鲸翼测试滚动条'), '鲸翼测试滚动条', '阅读');
    const reader = page.getByRole('dialog', { name: '鲸翼测试滚动条' });
    await reader.locator('.ww-book-progress > span', { hasText: '第 1 / 3 章' }).waitFor();
    await readerToc(reader).locator('.ww-book-sections button').first().waitFor();
    const area = readerScroll(reader);
    const bar = await area.evaluate(element => element.offsetWidth - element.clientWidth);
    assert.ok(bar >= 12, `正文滚动条占出位置、够宽好拖（${bar}px）`);
    // 滑块的位置按滚动比例算：轨道上下各留 8px，滑块长度按一屏占整章的比例。
    const thumb = async () => {
      const box = await area.boundingBox();
      const { top, room, height, total } = await area.evaluate(element => ({ top: element.scrollTop, room: element.scrollHeight - element.clientHeight, height: element.clientHeight, total: element.scrollHeight }));
      const track = box.height - 16, length = Math.max(24, track * height / total);
      return { box, x: box.x + box.width - bar / 2, y: box.y + 8 + (track - length) * (room ? top / room : 0) + length / 2 };
    };
    const dragTo = async y => { const at = await thumb(); await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x, y, { steps: 8 }); await page.mouse.up(); };
    const start = await thumb();
    await dragTo(start.box.y + start.box.height / 2);
    const middle = await scrollState(reader);
    assert.ok(middle.top > middle.room * 0.25 && middle.top < middle.room * 0.85, `拖到中间，正文也到了本章中间（${middle.top}/${middle.room}）`);
    // 当前小节：标题已经滚到顶上（离顶不超过 32px）的最后一节。
    const expected = await area.evaluate(element => { const top = element.getBoundingClientRect().top; return [...element.querySelectorAll('.ww-rendered h2')].filter(heading => heading.getBoundingClientRect().top - top <= 32).pop()?.textContent.trim(); });
    assert.ok(expected, '拖到中间时已经过了至少一节');
    await readerToc(reader).locator('.ww-book-sections button[aria-current=location]', { hasText: expected }).waitFor();
    assert.notEqual(await textOf(reader.locator('.ww-book-percent')), '0%', '底部百分比跟着变');
    await dragTo(start.box.y + start.box.height + 40);
    await reader.locator('.ww-book-next-chapter', { hasText: '下一章：2 日常需求分析' }).waitFor();
    assert.equal((await scrollState(reader)).top, (await scrollState(reader)).room, '拖到底');
    // 停在底部片刻：拖动滚动条不是“停一下再往下滚”，不该换章。
    await page.waitForTimeout(600);
    assert.match(await chapterNow(reader), /^第 1 \/ 3 章/, '还在第一章');
    await reader.getByRole('button', { name: '关闭' }).click();
    await reader.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
  });
  assert.equal(readShelf().books[0].progress.next, 1, '拖到底也记第一章读完');
});

// 需求§今日学习与书架（窄窗时目录收起，点“目录”浮出，选完自动收起）
test('窄窗时目录默认收起，点“目录”浮出，选了一章后自动收起', async t => {
  resetShelf();
  const [only] = books(1);
  await withPage(browser, t, { width: 820, height: 700, reducedMotion: 'reduce' }, async ({ page }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, only);
    await bookAction(page, shelfCard(page, titleOf(only)), titleOf(only), '阅读');
    const reader = page.getByRole('dialog', { name: titleOf(only) });
    await reader.locator('.ww-book-progress > span', { hasText: '第 1 / 3 章' }).waitFor();
    const toggle = reader.getByRole('button', { name: '目录', exact: true });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await readerToc(reader).count(), 0);
    await toggle.click();
    await readerToc(reader).getByRole('button', { name: /第二章 中段/ }).click();
    await reader.locator('.ww-book-progress > span', { hasText: '第 2 / 3 章' }).waitFor();
    await readerToc(reader).waitFor({ state: 'detached' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', '选完自动收起');
  });
});

// 需求§今日学习与书架·书架页（头行一行排开；新建分组、一本书放进分组；查找框按 / 聚焦、即时过滤；排序默认“最近加入 ↓”，选择记在本机）
test('书架：头行一行排开；分组只显示组里的书；按 / 查找即时过滤；排序改成书名后刷新页面还在', async t => {
  resetShelf();
  const [a, b] = books(2);
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, [a, b]);
    const head = page.locator('.ww-library-head');
    const parts = [head.locator('.ww-crumbs'), head.locator('.ww-library-chips'), head.getByRole('button', { name: '管理分组' }), head.getByRole('searchbox', { name: '查找书名或作者' }), head.getByRole('button', { name: '在线书目' }), head.getByRole('combobox', { name: '排序' }), head.locator('.ww-library-dir')];
    const centers = await Promise.all(parts.map(async part => { const box = await part.boundingBox(); return box.y + box.height / 2; }));
    assert.ok(Math.max(...centers) - Math.min(...centers) < 16, `头行各项在同一行（纵向中心 ${centers.map(Math.round).join('、')}）`);
    assert.equal(await head.getByRole('combobox', { name: '排序' }).inputValue(), 'added');
    assert.equal(await head.locator('.ww-library-dir').innerText(), '↓');
    assert.equal(await head.locator('.ww-library-chip[aria-pressed=true]').innerText().then(text => text.split('\n')[0]), '全部');
    assert.deepEqual(await shelfTitles(page), [titleOf(b), titleOf(a)], '最近加入的在前');
    // 新建分组，把甲放进去。
    await head.getByRole('button', { name: '管理分组' }).click();
    const groups = drawer(page, '管理分组');
    await groups.getByRole('textbox', { name: '分组名称' }).fill('鲸翼测试-组');
    await groups.getByRole('button', { name: '添加分组' }).click();
    await toast(page, '分组已保存').waitFor();
    await dialogButton(groups, '关闭').click();
    await groups.waitFor({ state: 'detached' });
    await bookAction(page, shelfCard(page, titleOf(a)), titleOf(a), '编辑');
    const editor = drawer(page, '编辑书籍信息');
    await editor.getByRole('checkbox', { name: '鲸翼测试-组' }).check();
    await dialogButton(editor, '保存书籍信息').click();
    await toast(page, '书籍信息已保存').waitFor();
    await closeToast(page);
    await head.locator('.ww-library-chip', { hasText: '鲸翼测试-组' }).click();
    assert.deepEqual(await shelfTitles(page), [titleOf(a)], '分组里只有甲');
    await head.locator('.ww-library-chip', { hasText: '全部' }).click();
    // 按 / 聚焦查找框，输入书名的一部分即时过滤。
    await page.locator('.ww-library h2').click();
    await page.keyboard.press('/');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '查找书名或作者');
    await page.keyboard.type('乙');
    assert.deepEqual(await shelfTitles(page), [titleOf(b)]);
    await page.keyboard.press('Escape');
    assert.deepEqual((await shelfTitles(page)).length, 2, 'Esc 清空查找');
    // 排序改成书名（↑ 从前往后），再把方向改成 ↓；刷新页面后还是这样。
    await head.getByRole('combobox', { name: '排序' }).selectOption('title');
    assert.equal(await head.locator('.ww-library-dir').innerText(), '↑');
    assert.deepEqual(await shelfTitles(page), [titleOf(a), titleOf(b)], '书名从前往后：甲、乙');
    await head.locator('.ww-library-dir').click();
    assert.equal(await head.locator('.ww-library-dir').getAttribute('aria-label'), '按书名拼音从后往前');
    await page.reload();
    await page.getByRole('button', { name: '鲸翼', exact: true }).first().click();
    await openTab(page, '知识卡片');
    await learning(page).waitFor();
    await openShelf(page);
    assert.equal(await page.locator('.ww-library-head').getByRole('combobox', { name: '排序' }).inputValue(), 'title');
    assert.equal(await page.locator('.ww-library-dir').innerText(), '↓');
    assert.deepEqual(await shelfTitles(page), [titleOf(b), titleOf(a)]);
    assert.deepEqual(errors, []);
  });
});

// 需求§今日学习与书架·书架页（删分组不删书）；需求§界面通用约定（删除确认用居中弹窗，确认按钮为红色）
test('删除分组：居中红色确认后只去掉分组，书还在“全部”里；查找不到时说明，并能一键清除', async t => {
  resetShelf();
  const [a] = books(1);
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, a);
    const head = page.locator('.ww-library-head');
    await head.getByRole('button', { name: '管理分组' }).click();
    const groups = drawer(page, '管理分组');
    await groups.getByRole('textbox', { name: '分组名称' }).fill('鲸翼测试-组');
    await groups.getByRole('button', { name: '添加分组' }).click();
    await groups.locator('.ww-library-group', { hasText: '鲸翼测试-组' }).waitFor();
    await dialogButton(groups, '关闭').click();
    await bookAction(page, shelfCard(page, titleOf(a)), titleOf(a), '编辑');
    const editor = drawer(page, '编辑书籍信息');
    await editor.getByRole('checkbox', { name: '鲸翼测试-组' }).check();
    await dialogButton(editor, '保存书籍信息').click();
    await editor.waitFor({ state: 'detached' });
    await head.getByRole('button', { name: '管理分组' }).click();
    await groups.locator('.ww-library-group', { hasText: '鲸翼测试-组' }).getByRole('button', { name: '删除分组' }).click();
    const confirm = modal(page, '删除分组');
    await confirm.waitFor();
    assert.ok(await isCentered(page, confirm), '居中确认');
    assert.match(await textOf(confirm.locator('.ww-confirm-body')), /删除分组“鲸翼测试-组”？书不会被删除/);
    assert.ok(await isRed(dialogButton(confirm, '删除分组')), '确认按钮是红色');
    await dialogButton(confirm, '删除分组').click();
    await toast(page, '分组已删除').waitFor();
    await dialogButton(groups, '关闭').click();
    assert.deepEqual(await head.locator('.ww-library-chip').allInnerTexts().then(list => list.map(text => text.split('\n')[0])), ['全部']);
    assert.deepEqual(await shelfTitles(page), [titleOf(a)], '书还在');
    const shelf = readShelf();
    assert.deepEqual([shelf.groups, shelf.books[0].groups], [[], []]);
    await head.getByRole('searchbox', { name: '查找书名或作者' }).fill('zzz');
    assert.equal(await textOf(page.locator('.ww-library-none')), '没有找到“zzz” 清除查找');
    assert.deepEqual(await shelfTitles(page), []);
    await page.locator('.ww-library-none').getByRole('button', { name: '清除查找' }).click();
    assert.deepEqual(await shelfTitles(page), [titleOf(a)]);
    assert.deepEqual(errors, []);
  });
});

// 需求§今日学习与书架（书的“…”里有从书架删除）；需求§界面通用约定（确认用居中弹窗，删除类确认按钮为红色；结果用右上角提示）
test('从书架删除：居中红色确认写明会删什么，删除后书架和首页常看都没有它，阅读副本目录删掉，原文件不动', async t => {
  resetShelf();
  const [a] = books(1), hash = await sha256(a);
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, a);
    const id = readShelf().books[0].id, dir = path.join(libraryDir(dsh.home), 'books', id);
    assert.ok(fs.existsSync(dir));
    await bookAction(page, shelfCard(page, titleOf(a)), titleOf(a), '从书架删除');
    const confirm = modal(page, '删除这本书');
    await confirm.waitFor();
    assert.ok(await isCentered(page, confirm), '居中确认');
    const message = await textOf(confirm.locator('.ww-confirm-body'));
    assert.match(message, /阅读副本和阅读进度会一起删除/); assert.match(message, /原文件不受影响/); assert.match(message, /从首页常看里移除/);
    assert.deepEqual(await confirm.locator('footer button').allInnerTexts(), ['取消', '从书架删除'], '右下角取消 + 确认');
    assert.ok(await isRed(dialogButton(confirm, '从书架删除')), '确认按钮是红色');
    await dialogButton(confirm, '从书架删除').click();
    await toast(page, '已从书架删除', 'success').waitFor();
    assert.deepEqual(await shelfTitles(page), []);
    assert.equal(await page.locator('.ww-pin-label strong').innerText(), '0 / 2');
    await closeToast(page);
    await backHome(page);
    assert.equal(await learningMeta(page), '书架还是空的');
    assert.equal(await learning(page).locator('.ww-desk-card').count(), 0);
    assert.equal(fs.existsSync(dir), false, '阅读副本目录删掉了');
    assert.deepEqual(errors, []);
  });
  assert.deepEqual(readShelf().books, []);
  assert.equal(await sha256(a), hash, '原文件不受影响');
});

// 需求§界面通用约定（确认用居中弹窗，“取消 + 确认”）；需求§今日学习与书架（从书架删除）
test('反例：删除确认框点“取消”，书还在、仍是常看，书目和阅读副本都没变', async t => {
  resetShelf();
  const [a] = books(1);
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    await importBooks(page, a);
    const before = fs.readFileSync(shelfFile(dsh), 'utf8'), dir = path.join(libraryDir(dsh.home), 'books', readShelf().books[0].id);
    await bookAction(page, shelfCard(page, titleOf(a)), titleOf(a), '从书架删除');
    const confirm = modal(page, '删除这本书');
    await dialogButton(confirm, '取消').click();
    await confirm.waitFor({ state: 'detached' });
    assert.deepEqual(await shelfTitles(page), [titleOf(a)]);
    assert.equal(await shelfCard(page, titleOf(a)).locator('.ww-pin-badge').count(), 1, '仍是常看');
    assert.equal(await page.locator('.ww-toast').count(), 0, '没有提示删除');
    assert.equal(fs.readFileSync(shelfFile(dsh), 'utf8'), before);
    assert.ok(fs.existsSync(path.join(dir, 'book.json')));
    assert.deepEqual(errors, []);
  });
});

/** 技巧卡近 14 天刻度应有的样子：以今天为最后一格往前排，有日报、部分来源失败、没有日报。 */
function expectedStrip() {
  return Array.from({ length: 14 }, (_, i) => {
    const date = shiftDate(plan.today, i - 13), day = plan.tips.find(entry => entry.date === date);
    return { date, kind: day ? day.status === 'partial' ? 'partial' : 'issued' : 'none', today: date === plan.today };
  });
}
/** 按插件的规则算 PageDown / PageUp 应跳到哪一期：更早（或更新）一个有技巧的月份里最新的一期。 */
function monthStep(date, delta) {
  const list = plan.tips.map(entry => entry.date).sort().reverse(), month = date.slice(0, 7);
  if (delta > 0) return list.find(day => day.slice(0, 7) < month) ?? null;
  const newer = list.filter(day => day.slice(0, 7) > month);
  return newer.length ? newer.find(day => day.startsWith(newer.at(-1).slice(0, 7))) : null;
}

// 需求§AI 使用技巧（卡上有近 14 天小刻度；技巧历史纵向时间线新的在上；连续没有日报折叠成一行“未整理”；部分来源失败在日期旁标出；刻度尺 ↑↓ 逐日、PageUp/PageDown 逐月；居中弹窗看做法和原文，可跨天切换上一条、下一条）
test('AI 使用技巧：卡上近 14 天刻度和日报一致；历史时间线新的在上、空档折叠、标出部分失败；刻度尺键盘跳转；弹窗跨天切换', async t => {
  await withPage(browser, t, { reducedMotion: 'reduce' }, async ({ page, errors, external }) => {
    await openCards(page);
    const card = learning(page).locator('.ww-tip-card');
    const [newest] = plan.tips, featured = featuredTip(newest.date, newest.count);
    assert.equal(await card.locator('.ww-tile-title').innerText(), tipTitle(newest.date, featured), '卡上是最新一期的“当天首页”那条');
    const cells = await card.locator('.ww-tip-cells i').evaluateAll(list => list.map(cell => ({ kind: cell.dataset.day, today: cell.hasAttribute('data-today') })));
    assert.deepEqual(cells, expectedStrip().map(({ kind, today }) => ({ kind, today })));
    await card.click();
    const history = page.locator('section.ww-tips');
    await history.waitFor();
    assert.equal(await textOf(history.getByRole('navigation', { name: '位置' })), '知识卡片 › AI 使用技巧');
    await history.locator('.ww-tips-meta', { hasText: '共' }).waitFor();
    assert.equal(await textOf(history.locator('.ww-tips-meta')), `每天 08:00 随每日资讯整理 · 共 ${plan.tips.length} 期`);
    await history.locator('.ww-tips-day').first().waitFor();
    // 时间线：只看近一个月这一段，按天倒序。
    const days = history.locator('.ww-tips-day');
    const recent = plan.tips.filter(entry => entry.date >= plan.gap[1]).map(entry => fullDate(entry.date));
    assert.deepEqual((await days.evaluateAll(list => list.map(entry => entry.getAttribute('aria-label')))).slice(0, recent.length), recent, '新的在上');
    assert.match(await textOf(days.nth(1).locator('.ww-tips-margin')), /部分来源失败/);
    assert.doesNotMatch(await textOf(days.nth(0).locator('.ww-tips-margin')), /部分来源失败/);
    // 上一期之后连续 3 天没有日报：折叠成“未整理”一行（跨月时按月分成几行，和插件规则一致）。
    const entries = await history.locator('.ww-tips-entry').evaluateAll(list => list.map(entry => ({ label: entry.getAttribute('aria-label'), gap: entry.classList.contains('ww-tips-gap'), month: entry.classList.contains('ww-tips-month'), text: entry.textContent })));
    const after = entries.slice(entries.findIndex(entry => entry.label === fullDate(plan.tips[1].date)) + 1).filter(entry => !entry.month);
    const gapMonths = [...new Set([plan.gap[0], shiftDate(plan.gap[0], -1), plan.gap[1]].map(date => date.slice(0, 7)))];
    const gapLengths = gapMonths.map(month => [plan.gap[0], shiftDate(plan.gap[0], -1), plan.gap[1]].filter(date => date.startsWith(month)).length);
    gapLengths.forEach((length, i) => {
      assert.equal(after[i].gap, true, `第 ${i + 1} 段空档折叠成一行`);
      assert.match(after[i].text, new RegExp(`未整理 · ${length === 1 ? '这天' : length === 2 ? '这两天' : `这 ${length} 天`} 08:00 时 DSH 没有运行`));
    });
    assert.equal(after[gapLengths.length].label, fullDate(plan.tips[2].date), '空档之后是再往前的一期');
    // 刻度尺：↓ 逐日往更早，PageDown 跳到更早一个月，PageUp 回来。
    const ruler = history.getByRole('slider', { name: '日期定位' });
    const at = async date => page.waitForFunction(([element, text]) => element.getAttribute('aria-valuetext')?.startsWith(text), [await ruler.elementHandle(), `${fullDate(date)}，`]);
    await ruler.focus();
    await at(newest.date);
    await page.keyboard.press('ArrowDown'); await at(plan.tips[1].date);
    await page.keyboard.press('ArrowDown'); await at(plan.tips[2].date);
    await page.keyboard.press('ArrowUp'); await at(plan.tips[1].date);
    const down = monthStep(plan.tips[1].date, 1);
    await page.keyboard.press('PageDown'); await at(down);
    await page.keyboard.press('PageUp'); await at(monthStep(down, -1));
    // 点最新一期的最后一条，在居中弹窗里看做法和原文；“下一条”跨到前一天的第一条。
    await page.keyboard.press('Home'); await at(newest.date);
    const last = newest.count - 1;
    await history.locator(`[data-tip="${newest.date}#${last}"]`).click();
    const detail = page.locator('dialog.ww-tips-detail[open]');
    await detail.waitFor();
    assert.ok(await isCentered(page, detail), '居中弹窗');
    assert.equal(await detail.locator('header h2').innerText(), tipTitle(newest.date, last));
    assert.match(await textOf(detail.locator('.ww-tips-guide')), /把任务拆成三步/);
    assert.match(await textOf(detail.locator('.ww-tips-origin')), /原文/);
    assert.match(await textOf(detail.locator('.ww-tips-kicker')), new RegExp(`第 ${newest.count} / ${newest.count} 条`));
    await detail.getByRole('button', { name: '下一条 →' }).click();
    await detail.locator('header h2', { hasText: tipTitle(plan.tips[1].date, 0) }).waitFor();
    assert.match(await textOf(detail.locator('.ww-tips-kicker')), new RegExp(`第 1 / ${plan.tips[1].count} 条`));
    await detail.getByRole('button', { name: '← 上一条' }).click();
    await detail.locator('header h2', { hasText: tipTitle(newest.date, last) }).waitFor();
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

// 需求§AI 使用技巧（历史只读已保存的日报，不采集、不调模型）
test('还没有技巧日报时：首页技巧卡说明随每日资讯整理，历史页说明第一期什么时候出，不联网、不生成', async t => {
  resetShelf(blank);
  const store = newsStore(blank), before = await sha256(store);
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openCards(page, blank);
    const card = learning(page).locator('.ww-tip-card');
    assert.match(await textOf(card), /AI 使用技巧随每日资讯一起整理，DSH 需要开着/);
    assert.equal(await card.locator('.ww-tip-cells i[data-day=none]').count(), 14, '近 14 天都没有日报');
    await card.click();
    const history = page.locator('section.ww-tips');
    await history.locator('.ww-tips-blank').waitFor();
    assert.equal(await textOf(history.locator('.ww-tips-blank')), '还没有技巧。第一期会在 08:00 随每日资讯整理好，DSH 需要开着。');
    assert.equal(await textOf(history.locator('.ww-tips-meta')), '每天 08:00 随每日资讯整理');
    await history.getByRole('button', { name: '编辑来源' }).waitFor();
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
  assert.equal(await sha256(store), before, '资讯存储没变（没有采集、没有生成日报）');
});

// 需求§每日资讯（失败时保留上一期，不把旧日报显示成今天的）；需求§每日资讯·展示
test('反例：某个领域本期没有日报时，首页仍显示它的上一期，并写明那一期的日期，不当成本期', async t => {
  const store = newsStore(dsh), before = await sha256(store);
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openCards(page);
    const block = page.locator('.ww-cards > .ww-shelf').filter({ has: page.locator('.ww-shelf-head h3', { hasText: plan.stale.fieldName }) });
    await block.waitFor();
    const meta = await textOf(block.locator('.ww-shelf-head small'));
    assert.match(meta, new RegExp(`^截至 ${slash(plan.stale.date)} 08:00 · ${plan.stale.count} 条`));
    assert.doesNotMatch(meta, new RegExp(slash(plan.period)), '不写成本期的日期');
    assert.deepEqual(await block.locator('.ww-tile-title').allInnerTexts(), [newsTitle(plan.stale.fieldName, plan.stale.date, 0), newsTitle(plan.stale.fieldName, plan.stale.date, 1)]);
    assert.doesNotMatch(await textOf(block.locator('.ww-tile-source').first()), /今天/, '来源时间不写成今天');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
  assert.equal(await sha256(store), before, '没有补采或改写日报');
});

// 需求§每日资讯（失败时保留上一期）；界面文案（还没有日报时的说明）
test('还没有任何日报时，每日资讯写明“今日日报尚未生成”', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openCards(page, blank);
    const block = page.locator('.ww-cards > .ww-shelf').filter({ has: page.locator('.ww-shelf-eyebrow', { hasText: '每日资讯' }) });
    assert.equal(await block.count(), 1);
    assert.equal(await block.locator('.ww-shelf-head h3').innerText(), '今日日报尚未生成');
    assert.equal(await block.locator('.ww-news-tile').count(), 0);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

// 需求§每日资讯·展示（默认一行 4 张，展开再加一行，最多 8 张，超过 8 条的旧日报也只显示前 8 条；卡片只放类别图标、编号、标签、标题和来源时间；点卡片在弹框里看说明、关联和全部来源，链接标为“查看来源”；运行详情也在弹框里）
test('每日资讯：默认一行 4 张，展开到 8 张、第 9 和 10 条不显示，收起回一行；点卡片在弹框看说明和来源，运行详情也在弹框里', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openCards(page);
    const block = page.locator('.ww-cards > .ww-shelf').filter({ has: page.locator('.ww-shelf-head h3', { hasText: 'AI 与科技' }) });
    const tiles = block.locator('.ww-news-tile');
    await tiles.first().waitFor();
    assert.match(await textOf(block.locator('.ww-shelf-head small')), new RegExp(`^截至 ${slash(plan.news.date)} 08:00 · 8 条`));
    const titles = Array.from({ length: plan.news.count }, (_, i) => newsTitle('AI 与科技', plan.news.date, i));
    assert.deepEqual(await tiles.locator('.ww-tile-title').allInnerTexts(), titles.slice(0, 4));
    const tops = await tiles.evaluateAll(list => list.map(tile => Math.round(tile.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size, 1, '4 张在同一行');
    // 卡片上只有图标、类别、编号、标题、来源和时间，不放说明。
    const first = tiles.first();
    await first.locator('.ww-tile-icon').waitFor();
    assert.equal(await first.locator('.ww-tile-num').innerText(), '01');
    assert.equal(await first.locator('.ww-tile-kicker').innerText(), '大模型');
    // 来源时间是本期前一天的北京 20:00。北京 0—8 点本期还是前一天那期，这时它已经是前天，界面写日期而不是“昨天”。
    const sourceDay = shiftDate(plan.news.date, -1), today = beijingDate(Date.now());
    const sourceLabel = sourceDay === shiftDate(today, -1) ? '昨天' : sourceDay === today ? '今天' : sourceDay.slice(5).replace('-', '/');
    assert.match(await textOf(first.locator('.ww-tile-source')), new RegExp(`测试来源甲 · ${sourceLabel} 20:00$`));
    assert.doesNotMatch(await textOf(first), /一句话说明|关联说明/);
    const more = block.getByRole('button', { name: '展开另外 4 条' });
    assert.equal(await more.getAttribute('aria-expanded'), 'false');
    await more.click();
    assert.deepEqual(await tiles.locator('.ww-tile-title').allInnerTexts(), titles.slice(0, 8));
    assert.equal(await page.getByText(titles[8]).count() + await page.getByText(titles[9]).count(), 0, '第 9、10 条不显示');
    await block.getByRole('button', { name: '收起' }).click();
    assert.equal(await tiles.count(), 4);
    // 点卡片：弹框里看说明、关联和来源。
    await first.click();
    const detail = page.locator('dialog.ww-modal[open]').filter({ has: page.locator('header h2', { hasText: titles[0] }) });
    await detail.waitFor();
    assert.match(await textOf(detail.locator('.ww-brief-lead')), new RegExp(`${plan.news.date} 第 1 条的一句话说明`));
    assert.match(await textOf(detail), /跟我们的关系 测试用的关联说明/);
    assert.equal(await detail.locator('.ww-brief-sources strong').innerText(), '查看来源');
    assert.match(await textOf(detail.locator('.ww-brief-sources ul')), /测试来源甲/);
    await page.keyboard.press('Escape');
    await detail.waitFor({ state: 'detached' });
    await block.getByRole('button', { name: '查看运行详情' }).click();
    const run = modal(page, 'AI 与科技 · 查看运行详情');
    await run.waitFor();
    assert.match(await textOf(run), /本期发布时间窗口（北京时间）.*功能测试数据/);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

/** 打开“卡片设置”，返回设置页。 */
async function openSettings(page) {
  await page.locator('.ww-cards > .ww-news-header').getByRole('button', { name: '卡片设置' }).click();
  const settings = page.locator('.ww-news-settings');
  await settings.waitFor();
  return settings;
}
const fieldNames = settings => settings.locator('article.ww-news-field h2').allInnerTexts();
async function fieldAction(page, name, action) {
  await page.getByRole('button', { name: `${name} · 编辑领域`, exact: true }).click();
  await page.getByRole('dialog', { name: `${name} · 编辑领域`, exact: true }).getByRole('button', { name: action, exact: true }).click();
}

// 需求§每日资讯（员工可以新增、编辑、删除自己的领域；卡片设置里每个领域是一张卡片，最后一张是“＋ 添加领域”；编辑在右侧抽屉）；需求§界面通用约定（删除用居中确认，结果用右上角提示）
test('卡片设置：添加自己的领域出现在加号卡前面，编辑关注描述后保存，删除时居中确认，删完卡片消失', async t => {
  const name = `鲸翼测试-CRD19-${Math.random().toString(16).slice(2, 6)}`;
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openCards(page);
    const settings = await openSettings(page);
    const original = await fieldNames(settings);
    for (const field of ['AI 与科技', 'AI 使用技巧']) {
      const card = settings.locator('article.ww-news-field').filter({ has: page.locator('h2', { hasText: field }) });
      await card.getByRole('button', { name: '读取本期日报' }).waitFor();
      assert.ok((await textOf(card.locator('p.ww-clamp'))).length > 0, `${field}有关注描述`);
    }
    const add = settings.locator('.ww-grid > :last-child');
    assert.match(await textOf(add), /^\+ ?添加领域$/, '最后一张是“＋ 添加领域”');
    await add.click();
    const editor = drawer(page, '添加领域');
    await editor.waitFor();
    await editor.getByRole('textbox', { name: '领域名称' }).fill(name);
    await editor.getByRole('textbox', { name: '关注描述' }).fill('功能测试：只关注测试用的事情。');
    await editor.locator('.ww-news-form label.ww-choice input[type=checkbox]').nth(1).check();
    await dialogButton(editor, '添加', { exact: true }).click();
    await toast(page, '资讯领域已保存', 'success').waitFor();
    await editor.waitFor({ state: 'detached' });
    assert.deepEqual(await fieldNames(settings), [...original, name], '多了一张，排在原有领域后面');
    assert.match(await textOf(settings.locator('.ww-grid > :last-child')), /添加领域/, '新卡在加号卡之前');
    // 编辑关注描述。
    await fieldAction(page, name, '编辑领域');
    const edit = drawer(page, '编辑领域');
    await edit.getByRole('textbox', { name: '关注描述' }).fill('功能测试：改过的关注描述。');
    await dialogButton(edit, '保存修改', { exact: true }).click();
    await toast(page, '资讯领域已保存', 'success').waitFor();
    await edit.waitFor({ state: 'detached' });
    const card = settings.locator('article.ww-news-field').filter({ has: page.locator('h2', { hasText: name }) });
    assert.equal(await textOf(card.locator('p.ww-clamp')), '功能测试：改过的关注描述。');
    // 删除：居中确认，确认按钮红色。
    await fieldAction(page, name, '删除领域');
    const confirm = modal(page, '删除领域');
    await confirm.waitFor();
    assert.ok(await isCentered(page, confirm), '居中确认');
    assert.match(await textOf(confirm.locator('.ww-confirm-body')), /删除后不再采集这个领域，已有日报保留/);
    assert.ok(await isRed(dialogButton(confirm, '确认修改领域')), '确认按钮是红色');
    await dialogButton(confirm, '确认修改领域').click();
    await toast(page, '资讯领域已删除', 'success').waitFor();
    await card.waitFor({ state: 'detached' });
    assert.deepEqual(await fieldNames(settings), original);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

// 需求§界面通用约定（编辑用右侧抽屉：添加或编辑资讯领域……按钮写具体动作（“保存修改”“创建专家”“添加”），不写“保存专家”这类笼统说法）
test('添加领域的抽屉主按钮写“添加”，编辑领域的写“保存修改”', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openCards(page);
    const settings = await openSettings(page);
    await settings.locator('.ww-grid > :last-child').click();
    const add = drawer(page, '添加领域');
    await add.waitFor();
    assert.equal(await add.locator('footer button.ww-primary').innerText(), '添加');
    // 什么都没填，点“取消”直接关上，不弹放弃确认。
    await dialogButton(add, '取消').click();
    await add.waitFor({ state: 'detached' });
    assert.equal(await modal(page, '放弃领域草稿').count(), 0);
    await fieldAction(page, 'AI 与科技', '编辑领域');
    const edit = drawer(page, '编辑领域');
    await edit.waitFor();
    assert.equal(await edit.locator('footer button.ww-primary').innerText(), '保存修改');
  });
});

// 需求§界面通用约定（放弃草稿要居中确认；2026-10-28 用户确认：有改动才确认，没改动直接关）
test('添加领域时填了名称再按 Esc：先居中确认“放弃领域草稿”，确认后抽屉关上，领域没有多', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openCards(page);
    const settings = await openSettings(page);
    const names = await fieldNames(settings);
    await settings.locator('.ww-grid > :last-child').click();
    const add = drawer(page, '添加领域');
    await add.waitFor();
    await add.getByRole('textbox', { name: '领域名称' }).fill('鲸翼测试-放弃草稿');
    await page.keyboard.press('Escape');
    const confirm = modal(page, '放弃领域草稿');
    await confirm.waitFor();
    assert.ok(await isCentered(page, confirm), '确认框居中');
    await dialogButton(confirm, '放弃领域草稿').click();
    await add.waitFor({ state: 'detached' });
    assert.deepEqual(await fieldNames(settings), names, '没有多出领域');
  });
});

// 需求§每日资讯（默认领域“AI 与科技”不能删除）
test('反例：默认领域“AI 与科技”的菜单里没有“删除领域”，领域配置不变', async t => {
  const store = newsStore(dsh), before = await sha256(store);
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page);
    await openSettings(page);
    await page.getByRole('button', { name: 'AI 与科技 · 编辑领域', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'AI 与科技 · 编辑领域', exact: true });
    assert.deepEqual(await menu.getByRole('button').allInnerTexts(), ['编辑领域', '查看历史日报']);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'AI 使用技巧 · 编辑领域', exact: true }).click();
    assert.deepEqual(await page.getByRole('dialog', { name: 'AI 使用技巧 · 编辑领域', exact: true }).getByRole('button').allInnerTexts(), ['编辑领域', '查看历史日报', '删除领域'], '“AI 使用技巧”可以删');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
  });
  assert.equal(await sha256(store), before);
});

// 需求§知识卡片（书架和技巧历史是子页，面包屑“知识卡片 › 书架 / AI 使用技巧”，切走页签再回来停在原来的子页）
test('子页：书架和技巧历史有面包屑，切到别的页签再回来仍停在原子页，点“知识卡片”回首页', async t => {
  resetShelf();
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page);
    await openShelf(page);
    assert.equal(await textOf(page.locator('.ww-library .ww-crumbs')), '知识卡片 › 书架 0');
    await openTab(page, '办公工坊');
    await openTab(page, '知识卡片');
    await page.locator('.ww-library').waitFor();
    assert.equal(await learning(page).count(), 0, '还在书架');
    await backHome(page);
    await learning(page).locator('.ww-tip-card').click();
    const history = page.locator('section.ww-tips');
    await history.waitFor();
    await openTab(page, '办公工坊');
    await openTab(page, '知识卡片');
    await history.waitFor();
    assert.equal(await textOf(history.getByRole('navigation', { name: '位置' })), '知识卡片 › AI 使用技巧');
    await history.getByRole('navigation', { name: '位置' }).getByRole('button', { name: '知识卡片' }).click();
    await learning(page).waitFor();
    assert.deepEqual(errors, []);
  });
});

// 需求§每日资讯（本期日报、历史日报在弹窗里看）；需求§AI 使用技巧（只读已保存的日报，不采集、不调模型）
test('读取本期日报只读已保存的内容：有就在弹窗里显示，没有就说尚未生成；不联网、不生成', async t => {
  const store = newsStore(dsh), before = await sha256(store);
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openCards(page);
    const settings = await openSettings(page);
    const card = name => settings.locator('article.ww-news-field').filter({ has: page.locator('h2', { hasText: name }) });
    await card('AI 与科技').getByRole('button', { name: '读取本期日报' }).click();
    const report = modal(page, '查看历史日报');
    await report.waitFor();
    assert.equal(await report.locator('.ww-shelf-head h3').innerText(), 'AI 与科技');
    assert.equal(await report.locator('.ww-tile-title').first().innerText(), newsTitle('AI 与科技', plan.news.date, 0));
    await page.keyboard.press('Escape');
    await report.waitFor({ state: 'detached' });
    await card(plan.stale.fieldName).getByRole('button', { name: '读取本期日报' }).click();
    await report.waitFor();
    assert.match(await textOf(report), /今日日报尚未生成/);
    assert.equal(await report.locator('.ww-news-tile').count(), 0, '不拿上一期冒充本期');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
  assert.equal(await sha256(store), before, '资讯存储没变');
});

// 需求§AI 使用技巧（员工可以删除，删除后不再自动恢复；领域删除后不显示技巧卡）。删除会改变 blank 环境，放在文件最后。
test('删除“AI 使用技巧”领域后，首页不再显示技巧卡', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openCards(page, blank);
    await learning(page).locator('.ww-tip-card').waitFor();
    const settings = await openSettings(page);
    await fieldAction(page, 'AI 使用技巧', '删除领域');
    await dialogButton(modal(page, '删除领域'), '确认修改领域').click();
    await toast(page, '资讯领域已删除').waitFor();
    assert.deepEqual(await fieldNames(settings), ['AI 与科技']);
    await page.getByRole('button', { name: '返回知识卡片' }).click();
    await learning(page).waitFor();
    await learning(page).locator('.ww-desk-row.ww-desk-solo').waitFor();
    assert.equal(await learning(page).locator('.ww-tip-card').count(), 0);
    assert.deepEqual(errors, []);
  });
});
