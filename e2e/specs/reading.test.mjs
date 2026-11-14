// 每日阅读 2026-11-14 改版：首页每天一期、一屏放得下；存一条；告诉它想看什么；上周回顾；让小鲸试一下和鲸翼的用法；
// 阅读器划线、来源笔记和回顾；阅读设置的开关。书架、阅读器翻章、领域设置等原有功能在 cards.test.mjs。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startDsh, removeTree } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, scratchFiles, textOf, toast, modal, dialogButton, isCentered } from '../support/browser.mjs';
import { newsWindow } from '../../features/cards/news.js';
import { beijingDate } from '../../features/cards/tip-index.js';
import { usageOfDay } from '../../features/cards/usage-tips.js';
import { report, seedReports, shiftDate, newsTitle, tipTitle, featuredTip, libraryDir, bookText, paragraphs } from '../support/cards-fixture.mjs';

// 一套临时 DSH：AI 与科技本期 8 条（照员工情况挑的：第 4、6 条写了关联；带三件上周回顾）、上一期 3 条；
// 自建领域“鲸翼测试-制造”本期 2 条；AI 使用技巧本期 3 条、上一期 2 条。书和划线每条用例自己准备。
let dsh, browser, files, period, today;
const news = { fieldId: 'ai-technology', fieldName: 'AI 与科技' }, mine = { fieldId: 'e2e-factory', fieldName: '鲸翼测试-制造' };
const weekPicks = [0, 1, 2].map(i => ({ title: `上周第 ${i + 1} 件大事：厂商发布「示例 ${i + 1}」`, link: `https://example.com/week/${i + 1}` }));
before(async () => {
  period = newsWindow(Date.now()).cutoff.slice(0, 10); today = beijingDate(Date.now());
  const week = { picks: weekPicks.map((pick, i) => ({ date: shiftDate(period, -1 - i), ...pick })) };
  dsh = await startDsh({ seed: ({ home }) => seedReports(home, [
    report({ ...news, date: period, count: 8, personal: true, related: [3, 5], week }),
    report({ ...news, date: shiftDate(period, -1), count: 3 }),
    report({ ...mine, date: period, count: 2 }),
    report({ fieldId: 'ai-tips', fieldName: 'AI 使用技巧', date: period, count: 3, tips: true }),
    report({ fieldId: 'ai-tips', fieldName: 'AI 使用技巧', date: shiftDate(period, -1), count: 2, tips: true }),
  ], { fields: [{ id: mine.fieldId, name: mine.fieldName }] }) });
  browser = await launchBrowser();
  files = scratchFiles('whalewing-e2e-reading-');
});
after(async () => { await browser?.close(); await dsh?.stop(); if (files) removeTree(files.dir); });

// —— 磁盘上的状态 ——
const defaults = { personal: true, diary: false, usage: true, weekly: true, review: 2 };
const shelfFile = () => path.join(libraryDir(dsh.home), 'library.json');
const readingFile = () => path.join(libraryDir(dsh.home), 'reading.json');
const readReading = () => JSON.parse(fs.readFileSync(readingFile(), 'utf8'));
const writeReading = (value = {}) => { fs.mkdirSync(libraryDir(dsh.home), { recursive: true }); fs.writeFileSync(readingFile(), JSON.stringify({ version: 1, settings: defaults, highlights: [], captures: [], ...value })); };
function resetShelf() {
  const dir = libraryDir(dsh.home);
  fs.mkdirSync(path.join(dir, 'books'), { recursive: true });
  for (const name of fs.readdirSync(path.join(dir, 'books'))) removeTree(path.join(dir, 'books', name));
  fs.writeFileSync(shelfFile(), JSON.stringify({ version: 1, groups: [], books: [] }));
}
const bookTitle = '鲸翼测试小书-划线', chapters = ['第一章 起点', '第二章 中段', '第三章 终点'];
const bookFile = () => files.file(`${bookTitle}.txt`, bookText(chapters.map(heading => [heading, paragraphs(`${bookTitle}·${heading.slice(4)}`, 4)]), { lead: `${bookTitle}\n作者：鲸翼测试` }));

// —— 页面 ——
const board = page => page.locator('.ww-read');
const pane = (page, name) => board(page).locator(`.ww-read-${name}`);
const summary = page => textOf(board(page).locator('.ww-pagehead p'));
const dateLabel = date => { const [year, month, day] = date.split('-').map(Number); return `${month} 月 ${day} 日 · 星期${'日一二三四五六'[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}`; };
const short = date => date.slice(5).replace('-', '/');
/** 进每日阅读首页，等划线和阅读设置也读回来（“存一条”这时才能点）。 */
async function openReading(page, options = {}) {
  await openWhaleWing(page, dsh.url, { assistant: 'float', ...options });
  await openTab(page, '每日阅读');
  await pane(page, 'news').waitFor();
  await page.waitForFunction(() => { const button = document.querySelector('.ww-read-lead .ww-read-btn[aria-pressed]'); return button && !button.disabled; });
}
async function closeToasts(page) {
  for (const box of await page.locator('.ww-toast').all()) await box.getByRole('button', { name: '关闭' }).click().catch(() => {});
  await page.locator('.ww-toast').first().waitFor({ state: 'detached' }).catch(() => {});
}
/** 一屏放不放得下：外壳的内容容器不该能上下滚，左右两块各自的内容也都在自己的格子里。 */
const measure = page => page.evaluate(() => {
  const view = document.querySelector('.ww-read').closest('.ww-view'), read = document.querySelector('.ww-read');
  return {
    form: read.dataset.form, pageScroll: view.scrollHeight - view.clientHeight, sideways: view.scrollWidth - view.clientWidth,
    bottom: Math.round(read.getBoundingClientRect().bottom), height: innerHeight,
    regions: [...read.querySelectorAll('.ww-read-fit')].filter(element => element.offsetParent !== null).map(element => ({ level: element.dataset.d, over: element.scrollHeight - element.clientHeight })),
    // 右栏里的每一块自己也不能冒出来：冒出来会压到下一块上（书卡压住“回顾”那种）。
    panes: [...read.querySelectorAll('.ww-read-side>.ww-read-pane')].filter(element => element.offsetParent !== null).map(element => element.scrollHeight - element.clientHeight),
  };
});
async function assertOneScreen(page, form, label) {
  await page.waitForFunction(expected => document.querySelector('.ww-read')?.dataset.form === expected, form);
  // 窗口大小刚变时界面要重新量一遍：等它量完（最多 5 秒），量完还放不下由下面的断言报出来。
  await page.waitForFunction(() => [...document.querySelectorAll('.ww-read .ww-read-fit')].filter(element => element.offsetParent !== null).every(element => element.scrollHeight <= element.clientHeight + 1), null, { timeout: 5000 }).catch(() => {});
  const state = await measure(page);
  assert.ok(state.pageScroll <= 1, `${label}：整页不能上下滚（多出 ${state.pageScroll}px）`);
  assert.ok(state.sideways <= 1, `${label}：不能左右滚（多出 ${state.sideways}px）`);
  assert.ok(state.bottom <= state.height, `${label}：内容没超出窗口底边（${state.bottom} / ${state.height}）`);
  assert.ok(state.regions.length > 0 && state.regions.every(region => region.over <= 1), `${label}：每一块的内容都在自己的格子里 ${JSON.stringify(state.regions)}`);
  assert.ok(state.panes.every(over => over <= 1), `${label}：右栏的每一块不压到下一块 ${JSON.stringify(state.panes)}`);
  return state;
}
const bubble = page => page.getByRole('button', { name: '打开小鲸助手', exact: true });
const composer = page => page.locator('aside.ww-assistant [data-composer-input]');
/** 记下并拦下发给模型的消息：“让小鲸试一下”只能放进输入框，不能自己发出去。 */
async function guardSend(page) {
  const sent = [];
  await page.route(/\/api\/session\/(prompt|updateQueue)(\?|$)/, route => { sent.push(route.request().url()); return route.abort(); });
  page.on('websocket', socket => socket.on('framesent', frame => { if (/session\/(prompt|updateQueue)/.test(String(frame.payload))) sent.push(String(frame.payload).slice(0, 200)); }));
  return sent;
}

// 需求§每日阅读·首页（一屏：整页占满窗口、不整页滚；放不下逐级收紧；主区再窄换成三个页签；四个名字）
test('首页一屏放得下：宽、中两种窗口左右两栏都不滚，窄了换成三个页签、每个页签也不滚；四块叫今日资讯、今日一招、接着读、回顾', async t => {
  resetShelf(); writeReading();
  await withPage(browser, t, async ({ page, errors, external, shot }) => {
    await openReading(page);
    assert.equal(await board(page).locator('.ww-pagehead h2').innerText(), '每日阅读');
    await board(page).locator('.ww-pagehead').getByRole('button', { name: '阅读设置', exact: true }).waitFor();
    await board(page).locator('.ww-pagehead').getByRole('button', { name: '书架', exact: true }).waitFor();
    assert.deepEqual(await board(page).locator('.ww-read-head h3').allInnerTexts(), ['今日资讯', '今日一招', '接着读', '回顾']);
    assert.equal(await page.getByText('卡片设置').count() + await page.getByText('今日学习').count(), 0, '旧名字不再出现');
    await assertOneScreen(page, 'board', '宽 1440×900');
    // 两个领域加“这一期 / 上周回顾”时最挤：宽窗口里标题行仍是一行，菜单不掉到第二行。
    assert.ok(await pane(page, 'news').locator('.ww-read-head').evaluate(element => element.getBoundingClientRect().height) <= 34, '今日资讯的标题行一行放得下');
    t.diagnostic(`截图：${await shot('宽')}`);
    await page.setViewportSize({ width: 1180, height: 800 });
    const mid = await assertOneScreen(page, 'board', '中 1180×800');
    assert.ok(mid.regions.some(region => region.level !== '0'), `窗口小了至少有一块收紧过 ${JSON.stringify(mid.regions)}`);
    t.diagnostic(`截图：${await shot('中')}`);
    await page.setViewportSize({ width: 780, height: 760 });
    await assertOneScreen(page, 'tabs', '窄 780×760 · 今日资讯');
    const tabs = board(page).getByRole('navigation', { name: '今天这一期' });
    assert.deepEqual(await tabs.getByRole('button').allInnerTexts(), ['今日资讯 8', '今日一招', '接着读和回顾']);
    assert.equal(await pane(page, 'tip').isVisible(), false, '页签排法一次只看一块');
    t.diagnostic(`截图：${await shot('窄-资讯')}`);
    await tabs.getByRole('button', { name: '今日一招' }).click();
    assert.equal(await pane(page, 'tip').locator('.ww-read-tipcard').count(), 2, '页签排法时 AI 技巧和鲸翼的用法两张都显示');
    assert.equal(await pane(page, 'news').isVisible(), false);
    await assertOneScreen(page, 'tabs', '窄 · 今日一招');
    t.diagnostic(`截图：${await shot('窄-一招')}`);
    await tabs.getByRole('button', { name: '接着读和回顾' }).click();
    await pane(page, 'book').waitFor(); await pane(page, 'rv').waitFor();
    await assertOneScreen(page, 'tabs', '窄 · 接着读和回顾');
    t.diagnostic(`截图：${await shot('窄-接着读')}`);
    // 拉回宽窗口又是左右两栏。
    await page.setViewportSize({ width: 1440, height: 900 });
    await assertOneScreen(page, 'board', '拉回宽窗口');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });
});

// 需求§每日资讯·展示、按员工的情况挑（头条是第一条写了关联的；写了关联的快讯标“和你有关”；一次看一个领域）
test('照员工情况挑的一期：第一条写了关联的当头条并写“和你的关系”，快讯里有关的标“和你有关”；换到自建领域只有它的两条，没有这些标记', async t => {
  resetShelf(); writeReading();
  await withPage(browser, t, async ({ page, errors }) => {
    await openReading(page);
    const lead = pane(page, 'news').locator('.ww-read-lead'), rows = pane(page, 'news').locator('.ww-read-q');
    assert.equal(await lead.locator('.ww-read-lead-t').innerText(), newsTitle(news.fieldName, period, 3), '头条是第一条写了关联的（第 4 条）');
    assert.equal(await textOf(lead.locator('.ww-read-rel')), '和你的关系第 4 条和你手上的事有关。');
    assert.equal(await textOf(lead.locator('.ww-read-row').first().locator('.ww-tag').first()), '头条');
    assert.deepEqual(await rows.locator('.ww-read-q-t').allInnerTexts(), [0, 1, 2, 4, 5, 6, 7].map(i => newsTitle(news.fieldName, period, i)), '其余按日报原来的顺序');
    assert.deepEqual(await rows.locator('.ww-read-q-n').allInnerTexts(), ['2', '3', '4', '5', '6', '7', '8']);
    const related = rows.filter({ has: page.locator('.ww-read-tag-me') });
    assert.deepEqual(await related.locator('.ww-read-q-t').allInnerTexts(), [newsTitle(news.fieldName, period, 5)]);
    assert.equal(await textOf(related.locator('.ww-read-tag-me')), '和你有关');
    // 点标题在弹框里看说明和来源，看过的在摘要里计数。
    await rows.nth(0).locator('.ww-read-q-t').click();
    const detail = modal(page, newsTitle(news.fieldName, period, 0));
    await detail.waitFor();
    assert.ok(await isCentered(page, detail), '居中弹框');
    assert.match(await textOf(detail), new RegExp(`${period} 第 1 条的一句话说明。`));
    await detail.getByRole('button', { name: '关闭' }).first().click();
    if (period === today) assert.match(await summary(page), /^今天这一期 8 条资讯，看过 1 条 · 存下 0 条 · 书里划线 0 条$/);
    else assert.equal(await summary(page), `今天这一期还没出，下面是 ${short(period)} 那一期 · 存下 0 条 · 书里划线 0 条`);
    // 换领域：标题旁的领域小片。
    const fields = pane(page, 'news').getByRole('group', { name: '看哪个领域' });
    assert.deepEqual(await fields.getByRole('button').allInnerTexts(), [news.fieldName, mine.fieldName]);
    await fields.getByRole('button', { name: mine.fieldName }).click();
    assert.equal(await lead.locator('.ww-read-lead-t').innerText(), newsTitle(mine.fieldName, period, 0));
    assert.deepEqual(await rows.locator('.ww-read-q-t').allInnerTexts(), [newsTitle(mine.fieldName, period, 1)]);
    assert.equal(await pane(page, 'news').locator('.ww-read-tag-me').filter({ hasText: '和你有关' }).count() + await lead.locator('.ww-read-rel').count(), 0, '不是照员工情况挑的一期没有这些标记');
    assert.deepEqual(errors, []);
  });
});

// 需求§每日资讯·存一条（照“网页剪藏”模板在收件箱建一篇，只记链接和说明；存过的显示已存）
test('存一条：点快讯的书签，居中小弹窗里写一句为什么存，收件箱多一篇网页剪藏；这一条变成已存，页头的“存下”加一', async t => {
  resetShelf(); writeReading();
  const title = newsTitle(news.fieldName, period, 0), file = path.join(dsh.vault, '10-收件箱', `网页 - ${title}.md`);
  fs.rmSync(file, { force: true });
  await withPage(browser, t, async ({ page, errors }) => {
    await openReading(page);
    const row = pane(page, 'news').locator('.ww-read-q').first();
    await row.getByRole('button', { name: '存一条' }).click();
    const dialog = modal(page, '存进知识积累的收件箱');
    await dialog.waitFor();
    assert.ok(await isCentered(page, dialog), '居中弹窗');
    assert.match(await textOf(dialog), new RegExp(title));
    await dialog.getByLabel('为什么存？写一句，可以不写').fill('下周对交付表时试试');
    await dialogButton(dialog, '存进收件箱').click();
    const note = toast(page, `已存进知识积累的收件箱：《网页 - ${title}》`, 'success');
    await note.waitFor();
    await note.getByRole('button', { name: '去知识积累看' }).waitFor();
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /^---\ntype: capture\nstatus: inbox\nsource_type: web\n/);
    assert.match(text, new RegExp(`url: "https://example.com/${news.fieldId}/${period}/1"`));
    assert.match(text, /## 为什么保存\n\n下周对交付表时试试\n/);
    assert.match(text, new RegExp(`每日阅读给的说明（不是你的话，读过原文后可以改）：${period} 第 1 条的一句话说明。`));
    assert.match(text, /- \[ \] 转为来源笔记/);
    await closeToasts(page);
    const saved = row.getByRole('button', { name: '已存，点开看存在哪' });
    assert.equal(await saved.getAttribute('aria-pressed'), 'true');
    assert.match(await summary(page), /存下 1 条/);
    await saved.click();
    await toast(page, `这一条存在收件箱的《网页 - ${title}》里`, 'info').waitFor();
    assert.equal(readReading().captures.length, 1);
    assert.deepEqual(errors, []);
  });
});

// 需求§每日资讯·告诉它想看什么（追加到这个领域的关注描述末尾，下一期开始用）
test('告诉它想看什么：点“按《关于我》挑”说明这一期怎么挑的，写一句“明天想多看点什么”，这句话追加到领域的关注描述末尾', async t => {
  resetShelf(); writeReading();
  await withPage(browser, t, async ({ page, errors }) => {
    await openReading(page);
    await pane(page, 'news').getByRole('button', { name: '按《关于我》挑' }).click();
    const dialog = modal(page, '这一期怎么挑的');
    await dialog.waitFor();
    assert.match(await textOf(dialog.locator('.ww-confirm-body')), /这一期是按你的《关于我》挑的/);
    assert.equal(await dialogButton(dialog, '告诉它').isDisabled(), true, '没写时不能点');
    await dialog.getByLabel('明天想多看点什么').fill('多来点和排产、质检有关的');
    await dialogButton(dialog, '告诉它').click();
    await toast(page, `记下了，写进了“${news.fieldName}”的关注描述，下一期开始用`, 'success').waitFor();
    await dialog.waitFor({ state: 'detached' });
    await closeToasts(page);
    await board(page).locator('.ww-pagehead').getByRole('button', { name: '阅读设置', exact: true }).click();
    const card = page.locator('.ww-news-field').filter({ has: page.locator('h2', { hasText: news.fieldName }) });
    await card.waitFor();
    assert.match(await card.locator('p.ww-clamp').getAttribute('title'), /\n另外想多看：多来点和排产、质检有关的$/);
    assert.deepEqual(errors, []);
  });
});

// 需求§每日资讯·周一的上周回顾（标题旁“这一期 / 上周回顾”切换，不另占一行；下面写上周存了几条、划了几条线，带“去看周记”）
test('上周回顾：今日资讯标题旁切到“上周回顾”，列出挑的三件，下面写上周存了几条划了几条；点“去看周记”到知识积累', async t => {
  resetShelf(); writeReading();
  await withPage(browser, t, async ({ page, errors }) => {
    await openReading(page);
    const head = pane(page, 'news').locator('.ww-read-head');
    await head.getByRole('button', { name: '上周回顾', exact: true }).click();
    assert.equal(await head.locator('h3').innerText(), '上周回顾');
    assert.deepEqual(await pane(page, 'news').locator('.ww-read-q .ww-read-q-t').allInnerTexts(), weekPicks.map(pick => pick.title));
    assert.match(await textOf(pane(page, 'news').locator('.ww-read-wkme')), /^上周你存了 0 条，划了 0 条线。每周思考周一早上会读收件箱，结果写在周记里。 去看周记$/);
    await assertOneScreen(page, 'board', '上周回顾');
    await head.getByRole('button', { name: '这一期', exact: true }).click();
    assert.equal(await pane(page, 'news').locator('.ww-read-lead').count(), 1);
    await head.getByRole('button', { name: '上周回顾', exact: true }).click();
    await pane(page, 'news').getByRole('button', { name: '去看周记' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.ww-workbench-header button[data-tab]')].some(button => button.textContent.includes('知识积累') && button.getAttribute('aria-pressed') === 'true'));
    assert.deepEqual(errors, []);
  });
});

// 需求§每日阅读·首页（页头右边的日期和左右箭头翻到前一期、后一期，只换资讯和技巧）
test('翻到前一期：日期、资讯和技巧换成那一期的，接着读和回顾不变；再点后一期回来', async t => {
  resetShelf(); writeReading();
  const previous = shiftDate(period, -1);
  await withPage(browser, t, async ({ page, errors }) => {
    await openReading(page);
    const stepper = board(page).locator('.ww-pagehead .ww-read-stepper');
    assert.equal(await stepper.locator('b').innerText(), dateLabel(period));
    assert.equal(await stepper.getByRole('button', { name: '后一期' }).isDisabled(), true);
    await stepper.getByRole('button', { name: '前一期' }).click();
    await page.waitForFunction(label => document.querySelector('.ww-pagehead .ww-read-stepper b')?.textContent === label, dateLabel(previous));
    assert.equal(await pane(page, 'news').locator('.ww-read-lead-t').innerText(), newsTitle(news.fieldName, previous, 0));
    assert.equal(await summary(page), `${short(previous)} 那一期，3 条资讯`);
    assert.equal(await pane(page, 'tip').locator('.ww-read-tipcard h4').innerText(), tipTitle(previous, featuredTip(previous, 2)), '技巧也是那一天的');
    await pane(page, 'book').waitFor();
    await assertOneScreen(page, 'board', '前一期');
    await stepper.getByRole('button', { name: '前一期' }).click();
    await toast(page, '没有更早的日报了', 'info').waitFor();
    await stepper.getByRole('button', { name: '后一期' }).click();
    assert.equal(await stepper.locator('b').innerText(), dateLabel(period));
    assert.equal(await pane(page, 'news').locator('.ww-read-lead-t').innerText(), newsTitle(news.fieldName, period, 3));
    assert.deepEqual(errors, []);
  });
});

// 需求§今日一招（让小鲸试一下：把技巧放进小鲸的输入框，不自己发；鲸翼的用法：每天一条，换一条，去试试）
test('今日一招：“让小鲸试一下”把技巧的标题和做法放进小鲸输入框、没有发出去；切到“鲸翼的用法”能换一条，“去试试”切到那个功能', async t => {
  resetShelf(); writeReading();
  await withPage(browser, t, async ({ page, errors }) => {
    const sent = await guardSend(page);
    await openReading(page);
    const tips = pane(page, 'tip'), tip = tipTitle(period, featuredTip(period, 3));
    assert.equal(await tips.locator('.ww-read-tipcard h4').innerText(), tip);
    assert.equal(await tips.locator('.ww-read-tipcard').count(), 1, '左右两栏时一次显示一张');
    await tips.getByRole('button', { name: '让小鲸试一下' }).click();
    await toast(page, '讨论提议已放入输入框，可编辑后发送', 'success').waitFor();
    const draft = (await composer(page).innerText()).trim();
    assert.ok(draft.startsWith(`我想照这个办法试一次：${tip}。`), draft);
    assert.match(draft, /先问我要处理什么事，再带我一步一步做。$/);
    assert.deepEqual(sent, [], '没有替员工发出去');
    await page.locator('aside.ww-assistant').getByRole('button', { name: '收起助手' }).click();
    await page.locator('aside.ww-assistant').waitFor({ state: 'hidden' });
    await closeToasts(page);
    // 鲸翼的用法：今天还没看过时带小红点，点了就没了。
    const usage = tips.locator('.ww-read-head').getByRole('button', { name: /鲸翼的用法/ });
    assert.equal(await usage.locator('.ww-read-dot').count(), 1);
    await usage.click();
    assert.equal(await usage.locator('.ww-read-dot').count(), 0);
    assert.equal(await tips.locator('.ww-read-tipcard h4').innerText(), usageOfDay(today).title);
    assert.match(await textOf(tips.locator('.ww-read-tipcard')), /随鲸翼带的，不用模型/);
    await tips.getByRole('button', { name: '换一条' }).click();
    const next = usageOfDay(today, 1);
    assert.equal(await tips.locator('.ww-read-tipcard h4').innerText(), next.title);
    await tips.locator('.ww-read-tipcard .ww-read-foot button').first().click();
    if (next.feature === 'launcher') await page.waitForFunction(() => document.querySelector('.ww-launcher')?.matches(':popover-open'));
    else await page.waitForFunction(name => [...document.querySelectorAll('.ww-workbench-header button[data-tab]')].some(button => button.textContent.includes(name) && button.getAttribute('aria-pressed') === 'true'), next.where);
    assert.deepEqual(errors, []);
  });
});

// —— 划线 ——
const reader = page => page.locator('dialog.ww-book[open]');
/** 在阅读器正文里选中含 marker 那一段的一截文字（像员工用鼠标拖选），返回选中的原文。 */
const selectText = (page, marker, start, length) => page.evaluate(([text, from, size]) => {
  const flow = document.querySelector('dialog.ww-book[open] .ww-book-flow');
  const paragraph = [...flow.querySelectorAll('.ww-rendered p')].find(element => element.textContent.includes(text));
  const node = [...paragraph.childNodes].find(child => child.nodeType === 3);
  const range = document.createRange(); range.setStart(node, from); range.setEnd(node, from + size);
  const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  flow.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  return range.toString();
}, [marker, start, length]);
/** 浏览器这会儿画了几条划线：[没写话的, 写了话的]。 */
const painted = page => page.evaluate(() => ['ww-book-mark', 'ww-book-mark-noted'].map(name => CSS.highlights.get(name)?.size ?? 0));
async function importAndOpen(page) {
  await board(page).locator('.ww-pagehead').getByRole('button', { name: '书架', exact: true }).click();
  await page.locator('.ww-library').waitFor();
  await page.locator('.ww-library input[type=file]').setInputFiles(bookFile());
  await toast(page, `已导入《${bookTitle}》`).waitFor({ timeout: 60_000 });
  await closeToasts(page);
  await page.locator('.ww-library .ww-crumb', { hasText: '每日阅读' }).click();
  const row = pane(page, 'book').locator('.ww-read-bookrow');
  await row.waitFor();
  return row;
}

// 需求§接着读与书架·划线（选中一句话浮出小条；底色由浏览器的自定义高亮画；原文只存本机；员工写的那句记进这本书的来源笔记）
test('划线：阅读器里选中一句话点“划线并写一句”，这句有了底色、存进本机记录；写的那句话记进知识积累新建的来源笔记，原文不进知识库', async t => {
  resetShelf(); writeReading();
  const sourceNote = path.join(dsh.vault, '50-来源', '书籍', `书籍 - ${bookTitle}.md`);
  fs.rmSync(sourceNote, { force: true });
  await withPage(browser, t, async ({ page, errors, shot }) => {
    await openReading(page);
    const row = await importAndOpen(page);
    assert.match(await textOf(row), /读到 0% · 划线 0 条/);
    await row.locator('.ww-read-bookopen').click();
    await reader(page).locator('.ww-rendered p').first().waitFor();
    assert.deepEqual(await painted(page), [0, 0]);
    const picked = await selectText(page, '起点第 1 段', 8, 16);
    const bar = reader(page).locator('.ww-book-selbar');
    await bar.waitFor();
    assert.deepEqual(await bar.getByRole('button').allInnerTexts(), ['划线', '划线并写一句']);
    await bar.getByRole('button', { name: '划线并写一句' }).click();
    await toast(page, '已划线。留在每日阅读里，过几天会在回顾里再见到它', 'success').waitFor();
    const input = bar.getByPlaceholder('用自己的话写一句');
    await input.waitFor();
    await input.fill('读书时先看这一段在说什么');
    await input.press('Enter');
    const noted = toast(page, `记下了。在知识积累里新建了《书籍 - ${bookTitle}》，这句话写在“我的理解与批注”里`, 'success');
    await noted.waitFor();
    await bar.waitFor({ state: 'detached' });
    assert.deepEqual(await painted(page), [0, 1], '这句画上了底色（写了话的那一种）');
    const stored = readReading().highlights;
    assert.equal(stored.length, 1);
    assert.deepEqual([stored[0].text, stored[0].note, stored[0].chapter, stored[0].chapterTitle, stored[0].bookTitle], [picked, '读书时先看这一段在说什么', 0, chapters[0], bookTitle]);
    const note = fs.readFileSync(sourceNote, 'utf8');
    assert.match(note, /^---\ntype: source\nsource_type: book\nstatus: reading\n/);
    assert.match(note, new RegExp(`## 我的理解与批注\\n\\n- ${today} 第 1 章《${chapters[0]}》：读书时先看这一段在说什么\\n`));
    assert.ok(!note.includes(picked), '划的原文不抄进知识库');
    await closeToasts(page);
    t.diagnostic(`截图：${await shot('划线')}`);
    // 右上角“划线 1 条”打开本章划线列表。
    await reader(page).getByRole('button', { name: '划线 1 条' }).click();
    const list = reader(page).locator('.ww-book-marks');
    assert.equal(await list.locator('blockquote').innerText(), picked);
    assert.equal(await textOf(list.locator('.ww-read-mine')), '我写的：读书时先看这一段在说什么');
    // 反例：和已有的划线重叠时不收，说明先取消原来那条。
    await selectText(page, '起点第 1 段', 12, 16);
    await bar.getByRole('button', { name: '划线', exact: true }).click();
    await toast(page, '这句和已有的划线有重叠。点一下原来那条，可以先取消', 'info').waitFor();
    assert.equal(readReading().highlights.length, 1);
    await closeToasts(page);
    // 取消划线能撤销。
    await list.getByRole('button', { name: '取消划线' }).click();
    const removed = toast(page, '已取消划线');
    await removed.waitFor();
    assert.deepEqual(await painted(page), [0, 0]);
    assert.equal(readReading().highlights.length, 0);
    await removed.getByRole('button', { name: '撤销' }).click();
    await page.waitForFunction(() => (CSS.highlights.get('ww-book-mark-noted')?.size ?? 0) === 1);
    assert.equal(readReading().highlights.length, 1);
    await closeToasts(page);
    await reader(page).getByRole('button', { name: '关闭' }).click();
    await reader(page).waitFor({ state: 'detached' });
    await page.waitForFunction(() => /划线 1 条/.test(document.querySelector('.ww-read-bookrow')?.textContent ?? ''));
    assert.match(await summary(page), /书里划线 1 条/);
    assert.deepEqual(errors, []);
  });
});

// 需求§接着读与书架·划线（点已有的划线浮出“写一句 / 取消划线”）、回顾（到期的一次显示一条；看过了今天不再出现；去原文定位到那一句）
test('回顾：两天前划的线今天到期，首页显示原文和出处；“去原文”打开阅读器并画着这条线，点它能取消；“看过了”之后今天不再出现', async t => {
  resetShelf(); writeReading();
  await withPage(browser, t, async ({ page, errors, shot }) => {
    await openReading(page);
    await importAndOpen(page);
    // 这本书的编号从书架记录里取；划线直接写进本机记录，时间是两天前。
    const book = JSON.parse(fs.readFileSync(shelfFile(), 'utf8')).books[0], text = `${bookTitle}·起点第 2 段：鲸翼功能测试的正文`;
    const at = new Date(Date.now() - 2 * 86400000).toISOString(), id = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
    writeReading({ highlights: [{ id, book: book.id, bookTitle, chapter: 0, chapterTitle: chapters[0], text, before: '', note: '回头看这句还成立吗', at, seen: [] }] });
    await page.reload();
    await openReading(page);
    const review = pane(page, 'rv');
    assert.equal(await textOf(review.locator('.ww-read-head small')), '以前划的线，今天还有 1 条');
    assert.equal(await review.locator('blockquote').innerText(), text);
    assert.equal(await textOf(review.locator('.ww-read-mine')), '我写的：回头看这句还成立吗');
    assert.equal(await textOf(review.locator('.ww-read-from')), `《${bookTitle}》第 1 章 · ${short(beijingDate(Date.parse(at)))}划的`);
    await assertOneScreen(page, 'board', '有书有回顾');
    t.diagnostic(`截图：${await shot('有书有回顾')}`);
    await review.getByRole('button', { name: '去原文' }).click();
    await reader(page).locator('.ww-rendered p').first().waitFor();
    await page.waitForFunction(() => (CSS.highlights.get('ww-book-mark-noted')?.size ?? 0) === 1);
    // 点在划线上：浮出“改这句 / 取消划线”。
    const spot = await page.evaluate(() => { const [range] = [...CSS.highlights.get('ww-book-mark-noted')]; const box = range.getClientRects()[0]; return { x: box.left + 24, y: box.top + box.height / 2 }; });
    await page.mouse.click(spot.x, spot.y);
    const bar = reader(page).locator('.ww-book-selbar');
    await bar.waitFor();
    assert.deepEqual(await bar.getByRole('button').allInnerTexts(), ['改这句', '取消划线']);
    await page.keyboard.press('Escape');
    await bar.waitFor({ state: 'detached' });
    assert.equal(await reader(page).count(), 1, 'Esc 先收起小条，阅读器还开着');
    await reader(page).getByRole('button', { name: '关闭' }).click();
    await reader(page).waitFor({ state: 'detached' });
    await review.getByRole('button', { name: '看过了' }).click();
    await review.locator('.ww-read-blank').waitFor();
    assert.match(await textOf(review.locator('.ww-read-blank')), /^今天的回顾看完了。 再来几条$/);
    assert.deepEqual(readReading().highlights[0].seen, [today]);
    assert.deepEqual(errors, []);
  });
});

// 需求§阅读设置（最上面一组开关，改了马上生效；日记那一项跟着上一项；每天回顾几条）
test('阅读设置：五个开关的默认值；关掉“鲸翼的用法”首页就只剩 AI 技巧，关掉“按我的情况来挑”首页写“没读《关于我》”、日记那一项不能点；回顾改成 3 条', async t => {
  resetShelf(); writeReading();
  try {
    await withPage(browser, t, async ({ page, errors, shot }) => {
      await openReading(page);
      await board(page).locator('.ww-pagehead').getByRole('button', { name: '阅读设置', exact: true }).click();
      const set = page.locator('.ww-reading-set');
      await set.waitFor();
      assert.equal(await page.locator('.ww-cards > .ww-pagehead h2').innerText(), '阅读设置');
      const box = name => set.getByRole('checkbox', { name: new RegExp(`^${name}`) });
      assert.deepEqual(await Promise.all(['按我的情况来挑', '也带上最近 7 天的日记', '今日一招里放鲸翼的用法', '周一出上周回顾'].map(name => box(name).isChecked())), [true, false, true, true]);
      assert.equal(await set.getByRole('button', { name: '2 条' }).getAttribute('aria-pressed'), 'true');
      t.diagnostic(`截图：${await shot('阅读设置')}`);
      // 开关点了先存、存好才变：所以用点击，再等提示。
      await box('今日一招里放鲸翼的用法').click();
      await toast(page, '阅读设置已保存', 'success').waitFor();
      assert.equal(await box('今日一招里放鲸翼的用法').isChecked(), false);
      await closeToasts(page);
      await box('按我的情况来挑').click();
      await toast(page, '阅读设置已保存', 'success').waitFor();
      assert.equal(await box('按我的情况来挑').isChecked(), false);
      await closeToasts(page);
      assert.equal(await box('也带上最近 7 天的日记').isDisabled(), true, '上一项关着时这一项不能点');
      await set.getByRole('button', { name: '3 条' }).click();
      await toast(page, '阅读设置已保存', 'success').waitFor();
      assert.deepEqual(readReading().settings, { personal: false, diary: false, usage: false, weekly: true, review: 3 });
      await closeToasts(page);
      await page.getByRole('button', { name: '返回每日阅读' }).click();
      await pane(page, 'news').waitFor();
      await pane(page, 'news').getByRole('button', { name: '没读《关于我》' }).waitFor();
      assert.equal(await pane(page, 'tip').getByRole('button', { name: /鲸翼的用法/ }).count(), 0);
      assert.equal(await pane(page, 'tip').locator('.ww-read-tipcard').count(), 1);
      assert.deepEqual(errors, []);
    });
  } finally { writeReading(); }
});
