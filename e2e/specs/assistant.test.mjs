import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDsh } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, textOf, toast } from '../support/browser.mjs';
import { seedNotes, noteFolder, noteTitle } from '../support/assistant-fixture.mjs';
import { zh as skillsText } from '../../features/skills/client-presentation.js';

// 功能测试只测到“发出之前”：小鲸的发送按钮一次也不点。
const proposal = skillsText.refinePrompt;
const noteCount = 13;

let dsh, browser;
before(async () => { dsh = await startDsh({ seed: ({ vault }) => seedNotes(vault, noteCount) }); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await dsh?.stop(); });

/** 记下发出的消息（session/prompt、排队消息）并直接拦下：就算产品出错想发，也到不了 DSH、更到不了模型。 */
async function guardSend(page) {
  const sent = [];
  await page.route(/\/api\/session\/(prompt|updateQueue)(\?|$)/, route => { sent.push(route.request().url()); return route.abort(); });
  page.on('websocket', socket => socket.on('framesent', frame => { if (/session\/(prompt|updateQueue)/.test(String(frame.payload))) sent.push(String(frame.payload).slice(0, 200)); }));
  return sent;
}

const bubble = page => page.getByRole('button', { name: '打开小鲸助手', exact: true });
const panel = page => page.locator('aside.ww-assistant');
const composer = page => panel(page).locator('[data-composer-input]');
const tool = (page, name) => panel(page).getByRole('button', { name, exact: true });
const draftText = async page => (await composer(page).innerText()).trim();
const contextSummary = page => textOf(panel(page).locator('.ww-assistant-context > summary'));
const contextNotes = page => panel(page).locator('.ww-assistant-context li').allInnerTexts();

/** 在技能成长点“与小鲸讨论提炼”，等小鲸悬浮打开、提议进了输入框。 */
async function discussFromSkills(page) {
  await openTab(page, '技能成长');
  await page.getByRole('button', { name: '与小鲸讨论提炼' }).click();
  await composer(page).waitFor();
  await page.waitForFunction(text => document.querySelector('aside.ww-assistant [data-composer-input]')?.innerText.includes(text), proposal);
}

/** 元素中心点（按下时按钮有 0.98 的缩放动画，比较位置看中心）。 */
const center = box => ({ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) });

/** 两个框是否有重叠（停靠时页面让出位置，不重叠；悬浮时盖在页面上）。 */
const overlaps =(a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** 个人知识的目录里逐层展开文件夹。 */
async function expandFolders(page, path) {
  const tree = page.locator('aside.ww-note-tree');
  for (const name of path.split('/')) {
    const folder = tree.getByRole('button', { name, exact: true });
    if (await folder.getAttribute('aria-expanded') !== 'true') await folder.click();
  }
}

const noteBox = (page, title) => page.getByRole('checkbox', { name: `选入问答：${title}`, exact: true });

// 需求§小鲸助手（进入工作台默认收起只显示气泡；点开后悬浮，可停靠到右侧或收起回气泡，切换时会话和草稿保留）
test('进入工作台只有右下角的小鲸气泡；讨论提炼后悬浮打开，能停靠到右侧、回到悬浮、收起成气泡，再打开草稿还在', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const sent = await guardSend(page);
    await openWhaleWing(page, dsh.url);
    const { width, height } = page.viewportSize();
    await bubble(page).waitFor();
    const start = await bubble(page).boundingBox();
    assert.ok(width - (start.x + start.width) <= 64 && height - (start.y + start.height) <= 64, `气泡在右下角（${JSON.stringify(start)}）`);
    assert.equal(await panel(page).isVisible(), false, '助手面板默认收起');
    await discussFromSkills(page);
    assert.ok(await tool(page, '停靠').isVisible(), '悬浮状态下有“停靠”');
    assert.equal(await bubble(page).isVisible(), false, '打开后不再显示气泡');
    const head = page.locator('.ww-skills .ww-pagehead, section .ww-pagehead').first();
    assert.ok(overlaps(await panel(page).boundingBox(), await head.boundingBox()), '悬浮的面板盖在页面上');
    await tool(page, '停靠').click();
    await tool(page, '悬浮').waitFor();
    const docked = await panel(page).boundingBox();
    assert.ok(width - (docked.x + docked.width) <= 32, `停靠在右侧（${JSON.stringify(docked)}）`);
    assert.ok(docked.height >= height * 0.75, '停靠时占满右侧的高度');
    await page.waitForFunction(() => {
      const aside = document.querySelector('aside.ww-assistant')?.getBoundingClientRect();
      const head = document.querySelector('section .ww-pagehead')?.getBoundingClientRect();
      return aside && head && head.right <= aside.left + 1;
    });
    assert.equal(await draftText(page), proposal, '停靠后草稿还在');
    await tool(page, '悬浮').click();
    await tool(page, '停靠').waitFor();
    assert.equal(await draftText(page), proposal, '回到悬浮后草稿还在');
    await panel(page).getByRole('button', { name: '收起助手' }).click();
    await bubble(page).waitFor();
    assert.equal(await panel(page).isVisible(), false, '收起后只剩气泡');
    await bubble(page).click();
    await tool(page, '停靠').waitFor();
    assert.equal(await draftText(page), proposal, '再打开时草稿原样还在');
    assert.deepEqual(sent, [], '没有发出消息');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// 需求§小鲸助手（气泡可以拖动，并记住位置；按整个窗口定位）；决策 2026-10-14
test('把气泡拖到左下方松手后位置跟着变，刷新页面再进鲸翼、切换页签都还在原处', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await bubble(page).waitFor();
    const start = await bubble(page).boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(700, 650, { steps: 8 });
    await page.mouse.move(200, 600, { steps: 8 });
    await page.mouse.up();
    const moved = center(await bubble(page).boundingBox());
    assert.ok(Math.abs(moved.x - 200) <= 2 && Math.abs(moved.y - 600) <= 2, `气泡停在松手处（中心 ${JSON.stringify(moved)}）`);
    assert.equal(await panel(page).isVisible(), false, '拖动不会打开助手');
    await page.reload();
    await page.getByRole('button', { name: '鲸翼', exact: true }).first().click();
    await bubble(page).waitFor();
    assert.deepEqual(center(await bubble(page).boundingBox()), moved, '刷新后还在原处');
    await openTab(page, '个人知识');
    assert.deepEqual(center(await bubble(page).boundingBox()), moved, '切换页签后还在原处');
  });
});

// 需求§小鲸助手（「与小鲸讨论提炼」只把提议放进输入框草稿，由员工修改后自己发送）；需求§技能成长
test('“与小鲸讨论提炼”只把提议放进输入框：右上角提示可编辑后发送，对话里没有消息，也没有发出消息', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const sent = await guardSend(page);
    await openWhaleWing(page, dsh.url);
    await openTab(page, '技能成长');
    await page.getByRole('button', { name: '与小鲸讨论提炼' }).click();
    const note = toast(page, '讨论提议已放入输入框，可编辑后发送', 'success');
    await note.waitFor();
    const box = await note.boundingBox();
    assert.ok(page.viewportSize().width - (box.x + box.width) <= 32 && box.y < page.viewportSize().height / 4, `提示在右上角（${JSON.stringify(box)}）`);
    assert.equal(await draftText(page), proposal, '输入框里是提议原文');
    assert.equal(await panel(page).locator('[data-chat-node-key]').count(), 0, '对话里没有消息');
    assert.equal(await tool(page, '发送消息').isEnabled(), true, '提议等员工自己发送');
    assert.deepEqual(sent, [], '没有发出消息');
    assert.deepEqual(errors, []);
  });
});

// 需求§小鲸助手（真实 DSH 会话，行为和原生一致）；空输入的处理按原生行为
test('反例：把输入框清空后发送按钮不可用，按回车也不会发出消息', async t => {
  await withPage(browser, t, async ({ page }) => {
    const sent = await guardSend(page);
    await openWhaleWing(page, dsh.url);
    await discussFromSkills(page);
    await composer(page).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.waitForFunction(() => document.querySelector('aside.ww-assistant [data-composer-input]')?.innerText.trim() === '');
    const send = tool(page, '发送消息');
    assert.equal(await send.isDisabled(), true, '空输入时发送按钮不可用');
    await page.keyboard.press('Enter');
    assert.equal(await draftText(page), '', '输入框还是空的');
    assert.equal(await send.isDisabled(), true);
    assert.equal(await panel(page).locator('[data-chat-node-key]').count(), 0, '对话里没有消息');
    assert.deepEqual(sent, [], '没有发出消息');
  });
});

// 需求§小鲸助手（在个人知识里选中的笔记会作为资料标签带进输入框）
test('个人知识里选中两篇笔记，小鲸的“当前资料”列出这两篇，点“引用所选笔记”后输入框里是“2 篇笔记”资料标签；取消一篇后资料变成一篇', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const sent = await guardSend(page);
    await openWhaleWing(page, dsh.url);
    await openTab(page, '个人知识');
    await expandFolders(page, '00-系统/规则');
    await noteBox(page, '知识库首页').check();
    await noteBox(page, '知识库规则').check();
    await bubble(page).click();
    await panel(page).waitFor();
    assert.equal(await contextSummary(page), '当前资料 · 2');
    assert.deepEqual(await contextNotes(page), ['知识库首页.md', '知识库规则.md']);
    await panel(page).getByRole('button', { name: '开始与小鲸协作' }).click();
    await composer(page).waitFor();
    await tool(page, '引用所选笔记').click();
    const chip = composer(page).locator('[data-composer-chip="whalewing-knowledge"]');
    await chip.waitFor();
    assert.equal(await textOf(chip), '2 篇笔记');
    await noteBox(page, '知识库规则').uncheck();
    await page.waitForFunction(() => document.querySelector('aside.ww-assistant .ww-assistant-context > summary')?.textContent === '当前资料 · 1');
    assert.deepEqual(await contextNotes(page), ['知识库首页.md']);
    assert.deepEqual(sent, [], '没有发出消息');
    assert.deepEqual(errors, []);
  });
});

// 需求§小鲸助手（选中的笔记最多 12 篇）
test('反例：已选 12 篇笔记时第 13 篇不能再选，已选的 12 篇不受影响；去掉一篇后又能选', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '个人知识');
    await expandFolders(page, noteFolder);
    const titles = Array.from({ length: noteCount }, (_, index) => noteTitle(index + 1));
    for (const title of titles.slice(0, 12)) await noteBox(page, title).check();
    const last = noteBox(page, titles[12]);
    assert.equal(await last.isDisabled(), true, '第 13 篇的勾选框不可用');
    assert.equal(await last.isChecked(), false);
    await bubble(page).click();
    await panel(page).waitFor();
    assert.equal(await contextSummary(page), '当前资料 · 12');
    assert.deepEqual(await contextNotes(page), titles.slice(0, 12).map(title => `${title}.md`), '已选的 12 篇原样保留');
    await noteBox(page, titles[0]).uncheck();
    await page.waitForFunction(() => document.querySelector('aside.ww-assistant .ww-assistant-context > summary')?.textContent === '当前资料 · 11');
    assert.equal(await last.isEnabled(), true, '少于 12 篇后又能选');
  });
});
