// 定时任务：页面摘要、状态点与执行记录、新增与取消自建任务、时间规则说明、放弃草稿、知识整理设置、每日资讯。
// 任务绝不能真的到点运行：新建的任务定在一年后，用例结束前在界面上“取消计划”；不点知识整理的“确认创建计划”。
// 临时 DSH 没有历史运行，启动前按 DSH 的落盘格式放一条“只有送达回执、会话里查不到结果”的自建任务（见 schedules-fixture.mjs）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startDsh } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, toast, modal, dialogButton, isCentered, isRed } from '../support/browser.mjs';
import { seedDeliveredTask, storedTasks, storedWorkspaces, beijingParts, beijingTime, nextClockRuns, shortBeijing, fullBeijing } from '../support/schedules-fixture.mjs';

let dsh, browser, seeded;
before(async () => { dsh = await startDsh({ seed: dirs => { seeded = seedDeliveredTask(dirs); } }); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await dsh?.stop(); });

const day = 24 * 3600_000;
const summary = page => page.locator('.ww-schedules .ww-pagehead p');
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 任务名前面是状态点（✓、×、! 或空心圈），按名字结尾匹配。
const row = (page, title) => page.locator('.ww-task-row').filter({ has: page.locator('.ww-task-select > span', { hasText: new RegExp(`^[✓×!]?${escape(title)}$`) }) });
/** 页面上看得见的、文字正好是 text 的元素（切到 DSH 原生页面时鲸翼的元素可能还在但看不见）。 */
const visibleText = (page, text) => page.getByText(text, { exact: true }).locator('visible=true');
const detail = page => page.locator('.ww-task-detail');
const taskEditor = page => page.locator('.ww-task-editor');
const activeTasks = () => storedTasks(dsh.home).filter(task => task.status === 'active');
const newsTask = () => storedTasks(dsh.home).find(task => task.record.title === '每日资讯');

async function openSchedules(page) {
  await openWhaleWing(page, dsh.url);
  await schedulesLoaded(page);
}
/** 切到定时任务页并等任务目录读完（读完之前页头先写“0 个任务”；每日资讯总在列表里）。 */
async function schedulesLoaded(page) {
  await openTab(page, '定时任务');
  await row(page, '每日资讯').waitFor();
}
async function selectTask(page, title) {
  await row(page, title).locator('.ww-task-select').click();
  await detail(page).locator('h2', { hasText: title }).waitFor();
}
/** 任务行的“…”菜单。 */
async function taskMenu(page, title) {
  await row(page, title).getByRole('button', { name: '任务操作' }).click();
  const menu = row(page, title).getByRole('dialog', { name: '任务操作' });
  await menu.waitFor();
  return menu;
}
/** 放弃编辑器里的任务草稿（居中确认后）。 */
async function discardTaskDraft(page) {
  await taskEditor(page).getByRole('button', { name: '放弃任务草稿' }).click();
  const dialog = modal(page, '放弃任务草稿');
  await dialogButton(dialog, '放弃任务草稿').click();
  await dialog.waitFor({ state: 'detached' });
  await taskEditor(page).waitFor({ state: 'detached' });
}

/** 一年后北京时间 03:00（避开 00:05–00:25 和 07:50–08:10），给“指定时间一次”用。 */
function aYearLater() {
  const p = beijingParts(Date.now() + 365 * day), pad = value => String(value).padStart(2, '0');
  return { iso: `${p.year}-${pad(p.month)}-${pad(p.day)}T03:00:00+08:00`, time: beijingTime(p.year, p.month, p.day, 3, 0), parts: p };
}
/** 在界面上新建一条一年后运行一次的自建任务，等它出现在列表里。 */
async function createTask(page, title, prompt = '测试任务，定在一年后，用例结束前取消，不会到点运行') {
  const at = aYearLater();
  await page.getByRole('button', { name: '新增定时任务' }).click();
  const form = taskEditor(page);
  await form.getByRole('textbox', { name: '任务名称' }).fill(title);
  await form.getByRole('textbox', { name: '工作指令' }).fill(prompt);
  await form.getByRole('combobox', { name: '时间规则' }).selectOption('at');
  await form.getByRole('textbox', { name: '时间（含时区的 ISO 日期）' }).fill(at.iso);
  await form.getByRole('button', { name: '确认创建计划' }).click();
  await toast(page, '定时任务已保存', 'success').waitFor();
  await row(page, title).waitFor();
  return { ...at, prompt };
}
/** 在界面上取消计划（居中确认），等它从列表里消失。 */
async function cancelTask(page, title) {
  await (await taskMenu(page, title)).getByRole('button', { name: '取消计划' }).click();
  const dialog = modal(page, '取消计划');
  await dialogButton(dialog, '取消计划').click();
  await toast(page, '已取消这个定时任务', 'success').waitFor();
  await row(page, title).waitFor({ state: 'detached' });
}
/** 点侧栏的“自动化任务”切到 DSH 原生任务页，等鲸翼页面收起、原生列表出来。 */
async function openNativeSchedules(page) {
  await page.getByRole('button', { name: '自动化任务' }).first().click();
  await page.locator('.ww-schedules').waitFor({ state: 'hidden' });
  await visibleText(page, '每日资讯').first().waitFor();
}
const uniqueTitle = label => `鲸翼测试-${label}-${randomUUID().slice(0, 4)}`;
/** 规则说明“之后三次：”后面列出的时刻，解析成 [月, 日, 时, 分]。 */
const listedRuns = text => [...(text.split('之后三次：')[1] ?? '').matchAll(/(\d{1,2})\/(\d{1,2}) (\d{2}):(\d{2})/g)].map(match => match.slice(1).map(Number));
const asParts = time => { const p = beijingParts(time); return [p.month, p.day, p.hour, p.minute]; };

// ===================== 页面、状态点、执行记录 =====================

// 需求§定时任务（看得到结果：页头写几个任务、下一次是哪个、几个上次没完成；列表每个任务前一个状态点；详情是“下次时间”“上次运行”两张小卡，上次运行写结果、计划时间和是否补发）；需求§定时任务（每日资讯：知识卡片开启时默认初始化，每天北京时间 08:00）
test('页头一句写任务数和下一次，左侧有未启用的知识整理和任务列表，详情是“下次时间”“上次运行”两张小卡', async t => {
  const now = Date.now();
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openSchedules(page);
    const news = newsTask();
    assert.ok(news, '知识卡片开着，DSH 里已默认建好每日资讯');
    assert.equal(news.record.kind, 'daily');
    assert.equal(news.record.timeZone, 'Asia/Shanghai');
    assert.match(news.record.time, /^08:00/);
    assert.equal(Date.parse(news.record.scheduledAt), nextClockRuns(now, { hour: 8, minute: 0 }, 1)[0], '下一次是北京时间的下一个 08:00');

    const tasks = activeTasks(), next = [...tasks].sort((a, b) => Date.parse(a.record.scheduledAt) - Date.parse(b.record.scheduledAt))[0];
    const head = await summary(page).innerText();
    assert.ok(head.startsWith(`${tasks.length} 个任务 · 下一次 ${shortBeijing(Date.parse(next.record.scheduledAt))} ${next.record.title}`), `页头：${head}`);
    assert.doesNotMatch(head, /[1-9]\d* 个上次没完成/, '没有出错的任务，不报没完成');

    const template = page.locator('.ww-task-template');
    assert.equal(await template.locator('h3').innerText(), 'DSH 工作知识整理');
    assert.match(await template.innerText(), /未启用/);
    await template.getByRole('button', { name: '设置并启用' }).waitFor();
    for (const task of tasks) {
      const item = row(page, task.record.title);
      assert.equal(await item.locator('small').innerText(), `已启用 · ${fullBeijing(Date.parse(task.record.scheduledAt))}`, `${task.record.title} 的下次时间`);
    }
    assert.equal(await row(page, '每日资讯').locator('.ww-dot').getAttribute('class'), 'ww-dot ww-dot-idle', '每日资讯没运行过：空心圈');

    await selectTask(page, '每日资讯');
    const facts = detail(page).locator('.ww-task-fact');
    assert.deepEqual(await facts.locator('small').allInnerTexts(), ['下次时间', '上次运行']);
    assert.equal(await facts.nth(0).locator('strong').innerText(), shortBeijing(Date.parse(news.record.scheduledAt)));
    assert.match(await facts.nth(1).innerText(), /没运行过/);
    assert.equal(await facts.nth(1).locator('.ww-dot-idle').count(), 1, '上次运行：空心圈');
    for (const name of ['执行记录', '打开原会话']) await detail(page).getByRole('button', { name, exact: true }).waitFor();

    await selectTask(page, seeded.title);
    const last = seeded.deliveries.at(-1), card = detail(page).locator('.ww-task-fact').nth(1);
    const lastText = await card.innerText();
    assert.match(lastText, /结果未知/, `写结果：${lastText}`);
    assert.ok(lastText.includes(shortBeijing(Date.parse(last.scheduledAt))), `写计划时间：${lastText}`);
    assert.ok(lastText.includes(shortBeijing(Date.parse(last.deliveredAt))) && /补/.test(lastText), `晚了 10 分钟送达，写出补发时间：${lastText}`);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// 需求§定时任务（结果取自任务会话里送达那一轮的结束情况，查不到就写“结果未知”，不按“已送达”推断成功；没运行过或结果未知是空心圈）
test('反例：只有送达回执、会话里查不到结果的运行写“结果未知”，画空心圈，不当成功也不算没完成', async t => {
  const before = JSON.stringify(storedTasks(dsh.home).find(task => task.record.title === seeded.title));
  await withPage(browser, t, async ({ page, errors }) => {
    await openSchedules(page);
    const dot = row(page, seeded.title).locator('.ww-dot');
    assert.equal(await dot.getAttribute('class'), 'ww-dot ww-dot-idle', '列表里是空心圈');
    assert.equal(await dot.innerText(), '', '没有打勾也没有打叉');
    await selectTask(page, seeded.title);
    const card = detail(page).locator('.ww-task-fact').nth(1);
    assert.equal(await card.locator('strong').innerText().then(text => text.trim()), '结果未知');
    assert.equal(await card.locator('.ww-dot-idle').count(), 1);
    assert.doesNotMatch(await summary(page).innerText(), /上次没完成/, '结果未知不算没完成');
    assert.deepEqual(errors, []);
  });
  assert.equal(JSON.stringify(storedTasks(dsh.home).find(task => task.record.title === seeded.title)), before, '看页面不改动任务和送达记录');
});

// 需求§定时任务（“执行记录”在居中弹窗里逐次列出计划时间、结果、补发时间，不往页面下面堆；查不到就写“结果未知”）；需求§界面通用约定·不往下堆
test('执行记录在居中弹窗里逐次列出计划时间、结果和补发时间，新的在前；页面不被推挤，“关闭”和“×”都能关', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openSchedules(page);
    await selectTask(page, seeded.title);
    const layout = await page.locator('.ww-task-split').boundingBox();
    await detail(page).getByRole('button', { name: '执行记录', exact: true }).click();
    const history = modal(page, `执行记录 · ${seeded.title}`);
    await history.waitFor();
    assert.equal(await isCentered(page, history), true, '居中');
    assert.match(await history.locator('.ww-confirm-body > p').first().innerText(), /结果未知/, '先说明查不到时写“结果未知”');
    const rows = await history.locator('.ww-task-runs li').allInnerTexts();
    const [older, latest] = seeded.deliveries;
    assert.equal(rows.length, seeded.deliveries.length, `每次送达一行：${rows.join(' / ')}`);
    assert.ok(rows[0].startsWith(`${shortBeijing(Date.parse(latest.scheduledAt))} · 结果未知`), `最新的一次在最前：${rows[0]}`);
    assert.ok(rows[0].includes(shortBeijing(Date.parse(latest.deliveredAt))) && /补/.test(rows[0]), `晚送达的写出补发时间：${rows[0]}`);
    assert.equal(rows[1], `${shortBeijing(Date.parse(older.scheduledAt))} · 结果未知`, '按时送达的不写补发');
    assert.equal(await history.locator('.ww-task-runs .ww-dot-idle').count(), 2, '每行一个空心圈');
    assert.deepEqual(await page.locator('.ww-task-split').boundingBox(), layout, '页面没被往下推');
    await dialogButton(history, '关闭').click();
    await history.waitFor({ state: 'detached' });

    await detail(page).getByRole('button', { name: '执行记录', exact: true }).click();
    await history.waitFor();
    await history.locator('header button').click();
    await history.waitFor({ state: 'detached' });

    await selectTask(page, '每日资讯');
    await detail(page).getByRole('button', { name: '执行记录', exact: true }).click();
    const empty = modal(page, '执行记录 · 每日资讯');
    await empty.waitFor();
    assert.equal(await empty.locator('.ww-task-runs li').count(), 0, '没运行过的任务没有记录行');
    assert.match(await empty.innerText(), /没有执行记录/);
    await dialogButton(empty, '关闭').click();
    assert.deepEqual(errors, []);
  });
});

// ===================== 新增、校验、规则说明 =====================

// 需求§定时任务（自建任务由员工填写名称、工作指令和时间规则；在 whalewing-tasks 执行，员工不需要填写工作目录；自建任务不往指令里追加工作区清单；原生“自动化任务”与鲸翼页面读取同一份任务）
test('新增自建任务：编辑器里没有工作目录，填名称、指令和一年后的时间，规则下写出意思；创建后列表、DSH 原生自动化任务和磁盘上都有，在鲸翼定时任务目录里执行', async t => {
  const title = uniqueTitle('AUT05');
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openSchedules(page);
    const countBefore = activeTasks().length;
    await page.getByRole('button', { name: '新增定时任务' }).click();
    const form = taskEditor(page);
    await form.waitFor();
    const labels = await form.locator('label.ww-field').evaluateAll(fields => fields.map(field => field.firstChild.textContent.trim()));
    assert.ok(!labels.some(label => /目录/.test(label)), `没有工作目录字段：${labels.join('、')}`);

    const at = aYearLater(), prompt = '测试任务，定在一年后，用例结束前取消，不会到点运行';
    await form.getByRole('textbox', { name: '任务名称' }).fill(title);
    await form.getByRole('textbox', { name: '工作指令' }).fill(prompt);
    await form.getByRole('combobox', { name: '时间规则' }).selectOption('at');
    await form.getByRole('textbox', { name: '时间（含时区的 ISO 日期）' }).fill(at.iso);
    const preview = await form.locator('.ww-task-preview').innerText();
    assert.match(preview, /一次/, `说明是运行一次：${preview}`);
    assert.deepEqual(listedRuns(preview), [asParts(at.time)], `写出唯一一次运行的北京时间：${preview}`);

    await form.getByRole('button', { name: '确认创建计划' }).click();
    await toast(page, '定时任务已保存', 'success').waitFor();
    await form.waitFor({ state: 'detached' });
    await row(page, title).waitFor();
    assert.equal(await row(page, title).locator('small').innerText(), `已启用 · ${fullBeijing(at.time)}`);
    assert.ok((await summary(page).innerText()).startsWith(`${countBefore + 1} 个任务`), '页头任务数加一');

    const stored = activeTasks().find(task => task.record.title === title);
    assert.ok(stored, 'DSH 定时服务里有这条任务');
    assert.equal(stored.record.kind, 'at');
    assert.equal(Date.parse(stored.record.scheduledAt), at.time);
    assert.equal(stored.record.prompt, prompt, '指令原样保存，没有追加工作区清单');
    const workspace = storedWorkspaces(dsh.home).find(item => item.sessionIds.includes(stored.sessionId));
    assert.equal(workspace?.title, '鲸翼定时任务', '任务会话归在侧栏“鲸翼定时任务”工作区');
    assert.equal(path.basename(workspace.path), 'whalewing-tasks');
    assert.equal(fs.realpathSync.native(path.dirname(workspace.path)), fs.realpathSync.native(dsh.home), '执行目录在 DSH 数据目录下的 whalewing-tasks');

    await openNativeSchedules(page);
    await visibleText(page, title).first().waitFor();
    await page.getByRole('button', { name: '鲸翼', exact: true }).first().click();
    await schedulesLoaded(page);
    await cancelTask(page, title);
    assert.equal(activeTasks().some(task => task.record.title === title), false, '用例结束前已取消');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// 需求§定时任务（自建任务由员工填写名称、工作指令和时间规则）
test('反例：名称或工作指令没填（或只有空格）时“确认创建计划”不可用，任务数不变', async t => {
  const tasksBefore = JSON.stringify(storedTasks(dsh.home));
  await withPage(browser, t, async ({ page, errors }) => {
    await openSchedules(page);
    const head = await summary(page).innerText();
    await page.getByRole('button', { name: '新增定时任务' }).click();
    const form = taskEditor(page), submit = form.getByRole('button', { name: '确认创建计划' });
    const name = form.getByRole('textbox', { name: '任务名称' }), prompt = form.getByRole('textbox', { name: '工作指令' });
    assert.equal(await submit.isDisabled(), true, '都没填');
    await name.fill(uniqueTitle('AUT06'));
    assert.equal(await submit.isDisabled(), true, '只填名称');
    await name.fill('');
    await prompt.fill('只填了指令');
    assert.equal(await submit.isDisabled(), true, '只填指令');
    await name.fill('   ');
    assert.equal(await submit.isDisabled(), true, '名称只有空格');
    await name.fill(uniqueTitle('AUT06'));
    await prompt.fill('  ');
    assert.equal(await submit.isDisabled(), true, '指令只有空格');
    await discardTaskDraft(page);
    assert.equal(await summary(page).innerText(), head, '页头没变');
    assert.deepEqual(errors, []);
  });
  assert.equal(JSON.stringify(storedTasks(dsh.home)), tasksBefore, 'DSH 里的任务没变');
});

// 需求§定时任务（时间规则支持指定时刻一次、每隔若干秒、每天、每周、cron；编辑时在规则下面用一句话写出规则的意思和之后三次运行时间（北京时间），例如“每个工作日 08:00 · 之后三次：…”）
test('编辑时规则下写出意思和之后三次运行时间（北京时间）：每天、每个工作日、Cron、固定间隔都按当前时间往后算', async t => {
  // 浏览器时间固定在北京时间 2026-10-27（星期二）10:00，之后改到 10-30（星期五）10:00 看跨周末。
  const tuesday = beijingTime(2026, 10, 27, 10, 0), friday = beijingTime(2026, 10, 30, 10, 0);
  await withPage(browser, t, async ({ page, errors }) => {
    await page.clock.setFixedTime(new Date(tuesday));
    await openSchedules(page);
    await page.getByRole('button', { name: '新增定时任务' }).click();
    const form = taskEditor(page), preview = form.locator('.ww-task-preview'), rule = form.getByRole('combobox', { name: '时间规则' });
    const check = async (now, description, expected, label) => {
      const text = await preview.innerText();
      assert.ok(text.startsWith(`${description} · 之后三次：`), `${label}：${text}`);
      assert.deepEqual(listedRuns(text), expected.map(asParts), `${label}：${text}`);
    };
    await rule.selectOption('daily');
    await form.getByLabel('每日时间').fill('00:15');
    await check(tuesday, '每天 00:15', nextClockRuns(tuesday, { hour: 0, minute: 15 }), '每天 00:15');

    await rule.selectOption('weekly');
    assert.equal(await form.getByRole('textbox', { name: '星期（1 周一至 7 周日）' }).inputValue(), '1,2,3,4,5', '每周默认工作日');
    await form.getByLabel('每日时间').fill('08:00');
    const workdays = { hour: 8, minute: 0, weekdays: [1, 2, 3, 4, 5] };
    await check(tuesday, '每个工作日 08:00', nextClockRuns(tuesday, workdays), '每周一到五 08:00');

    await rule.selectOption('cron');
    await form.getByRole('textbox', { name: 'Cron 表达式' }).fill('0 8 * * 1-5');
    await check(tuesday, '每个工作日 08:00', nextClockRuns(tuesday, workdays), 'Cron 0 8 * * 1-5');

    await rule.selectOption('every_seconds');
    await form.getByRole('spinbutton', { name: '秒数' }).fill('3600');
    await check(tuesday, '每小时', [1, 2, 3].map(hours => tuesday + hours * 3600_000), '固定间隔 3600 秒');

    await page.clock.setFixedTime(new Date(friday));
    await rule.selectOption('weekly');
    await check(friday, '每个工作日 08:00', nextClockRuns(friday, workdays), '星期五之后跳过周末');
    await discardTaskDraft(page);
    assert.deepEqual(errors, []);
  });
});

// 需求§定时任务（读不懂的 Cron 原样说明）
test('反例：读不懂的 Cron 表达式原样写出，不编造之后的运行时间', async t => {
  const tasksBefore = JSON.stringify(storedTasks(dsh.home));
  await withPage(browser, t, async ({ page, errors }) => {
    await openSchedules(page);
    await page.getByRole('button', { name: '新增定时任务' }).click();
    const form = taskEditor(page);
    await form.getByRole('combobox', { name: '时间规则' }).selectOption('cron');
    for (const expression of ['abc def', '0 8 * * MON', '0 8 L * *']) {
      await form.getByRole('textbox', { name: 'Cron 表达式' }).fill(expression);
      assert.equal(await form.locator('.ww-task-preview').innerText(), `按 Cron 表达式：${expression}`);
    }
    await discardTaskDraft(page);
    assert.deepEqual(errors, []);
  });
  assert.equal(JSON.stringify(storedTasks(dsh.home)), tasksBefore, '没有保存任何任务');
});

// ===================== 草稿 =====================

// 需求§界面通用约定（放弃草稿用居中确认框，标题、说明、右下角“取消 + 确认”；结果用右上角提示）
test('放弃任务草稿：居中确认、确认按钮是红色，确认后编辑器关掉、右上角提示，“新增定时任务”重新可用', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openSchedules(page);
    const add = page.getByRole('button', { name: '新增定时任务' });
    await add.click();
    await taskEditor(page).getByRole('textbox', { name: '任务名称' }).fill(uniqueTitle('AUT09'));
    assert.equal(await add.isDisabled(), true, '有草稿时不能再新增');
    await taskEditor(page).getByRole('button', { name: '放弃任务草稿' }).click();
    const dialog = modal(page, '放弃任务草稿');
    await dialog.waitFor();
    assert.equal(await isCentered(page, dialog), true, '居中');
    assert.ok((await dialog.locator('.ww-confirm-body').innerText()).trim(), '有说明');
    assert.deepEqual(await dialog.locator('footer button').allInnerTexts(), ['取消', '放弃任务草稿'], '右下角“取消 + 确认”');
    assert.equal(await isRed(dialogButton(dialog, '放弃任务草稿')), true, '确认按钮是红色');
    await dialogButton(dialog, '放弃任务草稿').click();
    await taskEditor(page).waitFor({ state: 'detached' });
    await toast(page, '已放弃未保存的修改').waitFor();
    assert.equal(await add.isEnabled(), true);
    assert.deepEqual(errors, []);
  });
});

// 需求§界面通用约定（放弃草稿要先确认，取消则不放弃）
test('反例：放弃任务草稿时点“取消”，草稿原样保留，任务数不变', async t => {
  const tasksBefore = JSON.stringify(storedTasks(dsh.home));
  await withPage(browser, t, async ({ page, errors }) => {
    await openSchedules(page);
    await page.getByRole('button', { name: '新增定时任务' }).click();
    const form = taskEditor(page), title = uniqueTitle('AUT10');
    await form.getByRole('textbox', { name: '任务名称' }).fill(title);
    await form.getByRole('textbox', { name: '工作指令' }).fill('草稿里的指令');
    await form.getByRole('button', { name: '放弃任务草稿' }).click();
    const dialog = modal(page, '放弃任务草稿');
    await dialog.locator('footer').getByRole('button', { name: '取消', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await form.getByRole('textbox', { name: '任务名称' }).inputValue(), title);
    assert.equal(await form.getByRole('textbox', { name: '工作指令' }).inputValue(), '草稿里的指令');
    await discardTaskDraft(page);
    assert.deepEqual(errors, []);
  });
  assert.equal(JSON.stringify(storedTasks(dsh.home)), tasksBefore);
});

// ===================== 知识整理 =====================

// 需求§定时任务（DSH 工作知识整理默认关闭，员工确认后启用，建议每日北京时间 00:15；处理范围默认全部工作区，可以排除个别；子代理会话和定时任务自己的会话不纳入）
test('知识整理设置：说明只整理普通对话，名称不能改，处理范围默认全部工作区，默认每天 00:15 并写出之后三次（不启用）', async t => {
  const now = beijingTime(2026, 10, 27, 10, 0);
  await withPage(browser, t, async ({ page, errors }) => {
    await page.clock.setFixedTime(new Date(now));
    await openSchedules(page);
    await page.locator('.ww-task-template').getByRole('button', { name: '设置并启用' }).click();
    const form = taskEditor(page);
    assert.equal(await form.locator('h2').innerText(), 'DSH 工作知识整理');
    const help = await form.locator('.ww-muted').first().innerText();
    assert.match(help, /普通对话/, `说明整理什么：${help}`);
    assert.match(help, /子任务/, '说明不含子任务');
    assert.match(help, /自动任务/, '说明不含自动任务');
    const name = form.getByRole('textbox', { name: '任务名称' });
    assert.equal(await name.inputValue(), 'DSH 工作知识整理');
    assert.equal(await name.isDisabled(), true, '名称不能改');

    const workspaces = storedWorkspaces(dsh.home);
    const scope = form.getByRole('button', { name: `已选 ${workspaces.length} 个工作区` });
    await scope.click();
    const picker = page.getByRole('dialog', { name: `已选 ${workspaces.length} 个工作区` });
    await picker.waitFor();
    assert.equal(await picker.getByRole('checkbox', { name: '全部工作区' }).isChecked(), true, '默认全部工作区');
    assert.equal(await picker.locator('.ww-workspace-options input[type=checkbox]:checked').count(), workspaces.length);
    await scope.click();
    await picker.waitFor({ state: 'hidden' });

    assert.equal(await form.getByRole('combobox', { name: '时间规则' }).inputValue(), 'daily');
    const preview = await form.locator('.ww-task-preview').innerText();
    assert.ok(preview.startsWith('每天 00:15 · 之后三次：'), preview);
    assert.deepEqual(listedRuns(preview), nextClockRuns(now, { hour: 0, minute: 15 }).map(asParts));
    await discardTaskDraft(page);
    await page.locator('.ww-task-template').getByRole('button', { name: '设置并启用' }).waitFor();
    assert.deepEqual(errors, []);
  });
  assert.equal(storedTasks(dsh.home).some(task => task.record.title === 'DSH 工作知识整理'), false, '没有启用知识整理');
});

// ===================== 取消计划 =====================

// 需求§定时任务（任务支持删除；删除不清理已有会话和知识）；需求§界面通用约定（取消计划用居中确认，删除类确认按钮为红色）
test('取消计划：“…”里有打开原会话、执行记录、取消计划，红色确认后列表和原生自动化任务里都没有了，任务会话保留', async t => {
  const title = uniqueTitle('AUT13');
  await withPage(browser, t, async ({ page, errors }) => {
    await openSchedules(page);
    await createTask(page, title);
    const stored = activeTasks().find(task => task.record.title === title);
    const countAfterCreate = activeTasks().length;
    const menu = await taskMenu(page, title);
    const items = await menu.getByRole('button').allInnerTexts();
    for (const item of ['打开原会话', '执行记录', '取消计划']) assert.ok(items.includes(item), `菜单里有“${item}”：${items.join('、')}`);
    await menu.getByRole('button', { name: '取消计划' }).click();
    const dialog = modal(page, '取消计划');
    await dialog.waitFor();
    assert.equal(await isCentered(page, dialog), true, '居中');
    assert.ok((await dialog.locator('.ww-confirm-body').innerText()).trim(), '有说明');
    assert.equal(await isRed(dialogButton(dialog, '取消计划')), true, '确认按钮是红色');
    await dialogButton(dialog, '取消计划').click();
    await toast(page, '已取消这个定时任务', 'success').waitFor();
    await row(page, title).waitFor({ state: 'detached' });
    assert.ok((await summary(page).innerText()).startsWith(`${countAfterCreate - 1} 个任务`), '页头任务数减一');
    assert.equal(storedTasks(dsh.home).some(task => task.record.title === title), false, 'DSH 定时服务里没有了');
    assert.ok(storedWorkspaces(dsh.home).some(item => item.sessionIds.includes(stored.sessionId)), '任务会话还在“鲸翼定时任务”工作区里');
    assert.ok(fs.readdirSync(path.join(dsh.home, 'sessions'), { recursive: true }).some(entry => String(entry).endsWith(stored.sessionId)), '会话记录还在磁盘上');

    await openNativeSchedules(page);
    assert.equal(await page.getByText(title, { exact: true }).count(), 0, '原生自动化任务里也没有了');
    assert.deepEqual(errors, []);
  });
});

// 需求§界面通用约定（取消计划要先居中确认，取消则不动）
test('反例：取消计划时在确认框点“取消”，任务还在、下次时间不变', async t => {
  const title = uniqueTitle('AUT14');
  await withPage(browser, t, async ({ page, errors }) => {
    await openSchedules(page);
    const created = await createTask(page, title);
    const stored = JSON.stringify(activeTasks().find(task => task.record.title === title));
    await (await taskMenu(page, title)).getByRole('button', { name: '取消计划' }).click();
    const dialog = modal(page, '取消计划');
    await dialog.locator('footer').getByRole('button', { name: '取消', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await selectTask(page, title);
    assert.equal(await detail(page).locator('.ww-task-fact').nth(0).locator('strong').innerText(), shortBeijing(created.time), '下次时间不变');
    assert.equal(JSON.stringify(activeTasks().find(task => task.record.title === title)), stored, 'DSH 里的任务原样');
    await cancelTask(page, title);
    assert.deepEqual(errors, []);
  });
});

// ===================== 每日资讯 =====================

// 需求§定时任务（每日资讯固定每天 08:00，详情写明要改关注的领域和来源到知识卡片的卡片设置里改，只留暂停、删除等原生允许的操作；暂停和恢复只在原生服务公开相应接口时显示，当前原版未提供）
test('每日资讯详情写明固定每天 08:00、到知识卡片的卡片设置里改领域和来源；菜单里没有编辑，原版没有暂停', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openSchedules(page);
    await selectTask(page, '每日资讯');
    const text = await detail(page).innerText();
    assert.match(text, /固定每天 08:00/);
    assert.match(text, /知识卡片/);
    assert.match(text, /卡片设置/);
    assert.match(text, /领域和来源/);
    const items = await (await taskMenu(page, '每日资讯')).getByRole('button').allInnerTexts();
    assert.ok(!items.some(item => /编辑/.test(item)), `没有编辑项：${items.join('、')}`);
    assert.ok(!items.some(item => /暂停|恢复/.test(item)), `原版没有暂停、恢复：${items.join('、')}`);
    assert.ok(items.includes('取消计划'), '保留删除（取消计划）');
    assert.deepEqual(errors, []);
  });
});

// 需求§定时任务（DSH 所有运行共用一个任务会话，“打开原会话”打开的是整个会话）
test('打开原会话：进入每日资讯的任务会话，不触发运行；回到鲸翼后定时任务页没变', async t => {
  const news = newsTask(), storedBefore = JSON.stringify(news);
  await withPage(browser, t, async ({ page, errors }) => {
    await openSchedules(page);
    await selectTask(page, '每日资讯');
    const head = await summary(page).innerText(), card = await detail(page).locator('.ww-task-fact').nth(1).innerText();
    await detail(page).getByRole('button', { name: '打开原会话' }).click();
    await page.locator(`[data-conversation-session="${news.sessionId}"]`).waitFor();
    await page.getByRole('button', { name: '鲸翼', exact: true }).first().click();
    await schedulesLoaded(page);
    assert.equal(await summary(page).innerText(), head);
    await selectTask(page, '每日资讯');
    assert.equal(await detail(page).locator('.ww-task-fact').nth(1).innerText(), card, '上次运行没变');
    await detail(page).getByRole('button', { name: '执行记录', exact: true }).click();
    const history = modal(page, '执行记录 · 每日资讯');
    await history.waitFor();
    assert.equal(await history.locator('.ww-task-runs li').count(), 0, '没有新的执行记录');
    await dialogButton(history, '关闭').click();
    assert.deepEqual(errors, []);
  });
  assert.equal(JSON.stringify(newsTask()), storedBefore, 'DSH 里每日资讯没有新的送达');
});
