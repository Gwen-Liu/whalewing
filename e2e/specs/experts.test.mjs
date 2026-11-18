// 专家团队页（2026-11-08 第三版）：左栏在用的专家、中间专家说的话或专家库、右边小鲸。
// 新装的环境里没有会话，左栏是空的、中间是欢迎页；要看某位专家，先打开专家库、点名字在中间打开它，再用它标题行上的“…”。
// 同一个文件共用一套 DSH：改了“在用”的用例（选用、开始新任务）在 finally 里把左栏的专家都放回专家库，欢迎页那条放在最前面。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startDsh, removeTree } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, resizeAndSettle, textOf, toast, drawer, modal, dialogButton, isCentered, isRed, scratchFiles, discardDrawer } from '../support/browser.mjs';
import { png, pngSize, animatedGif, templateText, expertsFileText, storedExperts, storedByName, storedRoster } from '../support/experts-fixture.mjs';
import { roles, expertTemplates } from '../../content/roles.js';
import { skillTitles } from '../../src/skill-titles.js';

// 需求§专家团队·内置专家：小鲸领头，其余九位依次排开。小鲸常驻右边的面板，专家库里是其余九位。
const builtinNames = ['小鲸助手', '产品专家', '设计专家', '研发专家', '测试专家', '运维专家', '数据专家', '研究专家', '写作专家', '运营专家'];
const libraryNames = builtinNames.slice(1);
// 需求§专家模板·随包模板库：按名称拼音排序。
const templateNames = ['财务专家', '法务专家', '翻译专家', '课程专家', '实施专家', '视频编导', '售前专家', '效率教练', '学习教练', '招聘专家'];
// 需求§专家团队·专家页：欢迎页给三位常用专家（研发、写作、研究）直接开工。
const starterNames = ['研发专家', '写作专家', '研究专家'];
// 左栏在专家页这块窄于 40rem 时收成一列头像（EXP-29）：1440 宽停靠小鲸时约 700px 还写名字，1200 宽停靠时约 540px 收成头像；要看左栏文字的用例用 1680 宽更稳。
const wide = { width: 1680, height: 1000 };

let dsh, browser, files;
before(async () => { dsh = await startDsh(); browser = await launchBrowser(); files = scratchFiles('whalewing-e2e-experts-'); });
after(async () => { await browser?.close(); await dsh?.stop(); if (files) removeTree(files.dir); });

const suffix = () => Math.random().toString(16).slice(2, 6);
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactly = text => new RegExp(`^${escape(text)}$`);
// 北京时间的今天，写成 2026-11-08（记忆里没写日期的条目保存时补上今天）。
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** 等一个真实条件成立（例如专家文件写好），超时报错。 */
async function until(check, message, timeout = 10_000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`等待超时：${message}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/** 记下发出的消息（session/prompt、排队消息）并直接拦下：功能测试绝不调模型。 */
async function guardSend(page) {
  const sent = [];
  await page.route(/\/api\/session\/(prompt|updateQueue)(\?|$)/, route => { sent.push(route.request().url()); return route.abort(); });
  page.on('websocket', socket => socket.on('framesent', frame => { if (/session\/(prompt|updateQueue)/.test(String(frame.payload))) sent.push(String(frame.payload).slice(0, 200)); }));
  return sent;
}

/** 记下新建的会话。 */
function trackCreated(page) {
  const created = [];
  page.on('request', request => { if (request.url().includes('/api/session/create')) created.push(request.url()); });
  return created;
}

/** 记下专家管理接口收到的动作（save、remove、restore……）。 */
function trackExpertActions(page) {
  const actions = [];
  page.on('request', request => {
    if (!request.url().includes('/api/whalewingExperts/manage')) return;
    try { actions.push(JSON.parse(request.postData()).payload.args.input.action); } catch { actions.push('无法解析'); }
  });
  return actions;
}

// ---- 页面上的几块 ----
/** 三栏上面的页头（2026-11-13 起和其他页签一样：宋体标题、一句现状、右边“＋ 添加”）。 */
const teamHead = page => page.locator('section.ww-experts > header.ww-pagehead');
const roster = page => page.getByRole('navigation', { name: '在用的专家', exact: true });
const rosterItems = page => roster(page).locator('.ww-roster-list .ww-roster-item');
/** 左栏在用的专家名字（窄了名字收起时也读得到）。 */
const rosterNames = page => rosterItems(page).locator('.ww-roster-name').allTextContents();
const rosterItem = (page, name) => rosterItems(page).filter({ has: page.locator('.ww-roster-name', { hasText: exactly(name) }) });
const libraryEntry = page => roster(page).locator('.ww-roster-library');
const welcome = page => page.getByRole('region', { name: '专家们说的话会出现在这里', exact: true });
const library = page => page.getByRole('region', { name: '专家库', exact: true });
const libraryGroup = (page, label) => library(page).getByRole('region', { name: label, exact: true });
const libraryNamesIn = (page, label) => libraryGroup(page, label).locator('.ww-lib-open').allInnerTexts();
/** 专家库里正显示的全部名字（各组合起来）。 */
const libraryShown = page => library(page).locator('.ww-lib-group .ww-lib-open').allInnerTexts();
const libraryRow = (page, name) => library(page).locator('li.ww-lib-row').filter({ has: page.getByRole('button', { name: `打开${name}`, exact: true }) });
/** 中间一栏：选中的专家（标题行、任务、嵌着的会话）。 */
const pane = (page, name) => page.getByRole('region', { name: `${name}说的话`, exact: true });
const paneTags = async (page, name) => pane(page, name).locator('.ww-pane-name .ww-tag').allInnerTexts();
const paneDescription = (page, name) => pane(page, name).locator('.ww-pane-title > small');
const taskSelect = (page, name) => pane(page, name).locator('.ww-pane-tasks select');
const paneComposer = (page, name) => pane(page, name).locator('[data-composer-input]');
const assistantPanel = page => page.locator('aside.ww-assistant');

async function openExperts(page, options) {
  await openWhaleWing(page, dsh.url, options);
  await roster(page).waitFor();
  // 专家名单读到之前，专家库写“全部 0 位”。
  await page.waitForFunction(() => /^全部 [1-9]\d* 位$/.test(document.querySelector('nav.ww-roster .ww-roster-library')?.title ?? ''));
}

/** 点左栏的“专家库”，等中间一栏列出专家。 */
async function openLibrary(page) {
  await libraryEntry(page).click();
  await library(page).locator('li.ww-lib-row').first().waitFor();
  return library(page);
}

/** 打开专家库，点名字在中间打开这位专家。 */
async function openExpert(page, name) {
  await openLibrary(page);
  await library(page).getByRole('button', { name: `打开${name}`, exact: true }).click();
  await pane(page, name).waitFor();
  return pane(page, name);
}

/** 专家库标题下的“10 位：内置 9、我建的 1”拆成数字（小鲸常驻右边，不在库里）。 */
async function counts(page) {
  await openLibrary(page);
  const text = await textOf(library(page).locator('.ww-pane-title small'));
  const match = text.match(/^(\d+) 位：(.*)$/);
  assert.ok(match, `专家库摘要的格式：${text}`);
  const parts = Object.fromEntries(match[2].split('、').map(part => part.match(/^(.+) (\d+)$/)).filter(Boolean).map(([, label, count]) => [label, Number(count)]));
  return { total: Number(match[1]), builtin: parts['内置'] ?? 0, custom: parts['我建的'] ?? 0 };
}

/** 打开中间标题行上这位专家的“…”菜单，返回菜单浮层。 */
async function openMenu(page, name) {
  await pane(page, name).getByRole('button', { name: `${name} · 专家操作`, exact: true }).click();
  const menu = page.getByRole('dialog', { name: `${name} · 专家操作`, exact: true });
  await menu.waitFor();
  return menu;
}

async function closeMenu(page, menu) {
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
}

/** 打开左栏底部的“可选设置”菜单。 */
async function openSettings(page) {
  await roster(page).getByRole('button', { name: '可选设置', exact: true }).click();
  const menu = roster(page).getByRole('dialog', { name: '可选设置' });
  await menu.waitFor();
  return menu;
}
const idleSelect = menu => menu.getByRole('combobox', { name: /多久不用就回专家库/ });

/** 页头右边“＋ 添加”（添加专家）→“自己填写”，等抽屉里的技能目录和模板都读好。 */
async function openAddDrawer(page) {
  await teamHead(page).getByRole('button', { name: '添加专家', exact: true }).click();
  await teamHead(page).getByRole('dialog', { name: '添加专家' }).getByRole('button', { name: '自己填写', exact: true }).click();
  const editor = drawer(page, '添加专家');
  await editor.waitFor();
  await page.waitForFunction(() => {
    const dialog = document.querySelector('dialog.ww-editor[open]');
    const select = dialog?.querySelector('select');
    const create = [...(dialog?.querySelectorAll('footer button') ?? [])].find(button => button.textContent.includes('创建专家'));
    return select && !select.disabled && select.options.length > 1 && create && !create.disabled;
  });
  return editor;
}

const nameField = editor => editor.getByRole('textbox', { name: '专家名字', exact: true });
const descriptionField = editor => editor.getByRole('textbox', { name: '一句话介绍', exact: true });
const promptField = editor => editor.getByRole('textbox', { name: '系统提示词（必填）', exact: true });
const templateSelect = editor => editor.getByRole('combobox', { name: '从模板开始' });
const preset = (editor, index) => editor.getByRole('button', { name: `选择预置头像 ${index}`, exact: true });
const preview = editor => editor.locator('.ww-avatar-picker > .ww-avatar').first();
// filter 的 has 要用从页面起算的定位，它在每个 details 里面再找。
const skillSection = editor => editor.locator('details').filter({ has: editor.page().locator('summary', { hasText: 'Skills · 可选' }) });

/** 抽屉里勾选的技能名。 */
// 2026-11-18 起随包技能在抽屉里显示中文名：读回来的名字按对照表换回英文短名再比。
const skillIds = new Map(Object.entries(skillTitles).map(([name, title]) => [title, name]));
const skillId = shown => skillIds.get(shown) ?? shown;
const checkedSkills = async editor => (await skillSection(editor).locator('label.ww-choice').evaluateAll(labels => labels.filter(label => label.querySelector('input').checked).map(label => label.querySelector('span').firstChild.textContent))).map(skillId);
/** 抽屉里列出的、本机装了的技能名（没装的绑定会标“当前目录未发现”）。 */
const installedSkills = async editor => (await skillSection(editor).locator('label.ww-choice').evaluateAll(labels => labels.filter(label => !label.querySelector('small')?.textContent.includes('当前目录未发现')).map(label => label.querySelector('span').firstChild.textContent))).map(skillId);
/** 按下状态的预置头像序号（没有为 0）。 */
const pressedPreset = editor => editor.locator('.ww-avatar-presets button').evaluateAll(buttons => buttons.findIndex(button => button.getAttribute('aria-pressed') === 'true') + 1);

/** 表单当前的样子，用来比较“有没有被改动”。 */
async function formState(editor) {
  return {
    name: await nameField(editor).inputValue(), description: await descriptionField(editor).inputValue(), prompt: await promptField(editor).inputValue(),
    skills: await checkedSkills(editor), preset: await pressedPreset(editor), avatar: await preview(editor).getAttribute('src'),
  };
}

/** 右上角提示：贴近视口右边、在上部。 */
async function assertTopRight(page, locator) {
  const box = await locator.boundingBox(), { width, height } = page.viewportSize();
  assert.ok(box && width - (box.x + box.width) <= 32 && box.y < height / 4, `提示应在右上角（实际位置 ${JSON.stringify(box)}）`);
}

/**
 * 做一个动作，等它弹出的那条新提示（鲸翼同一时间只有一条提示，新提示换一个新元素）。
 * 抽屉开着时提示点不到（模态抽屉外的元素都不可交互），所以不靠点“×”关旧提示来区分同样文字的两条。
 */
async function nextToast(page, action, text, kind) {
  const previous = await page.evaluateHandle(() => document.querySelector('.ww-toast'));
  await action();
  await page.waitForFunction(([old, text, kind]) => {
    const note = document.querySelector('.ww-toast');
    return note && note !== old && note.textContent.includes(text) && (!kind || note.classList.contains(`ww-toast-${kind}`));
  }, [previous, text, kind]);
  await previous.dispose();
  return toast(page, text, kind);
}

/** 用空白表单建一位自定义专家，返回名字。 */
async function createBlankExpert(page, name) {
  const editor = await openAddDrawer(page);
  await nameField(editor).fill(name);
  await descriptionField(editor).fill('功能测试建的专家');
  await promptField(editor).fill('你是功能测试建的专家，只用于检查界面。');
  await dialogButton(editor, '创建专家').click();
  await editor.waitFor({ state: 'detached' });
  await until(() => storedByName(dsh.home, name), `专家文件里出现“${name}”`);
  return name;
}

/** 在专家库点“选用”，等右上角说明、左栏出现它。 */
async function pick(page, name) {
  await openLibrary(page);
  await libraryRow(page, name).getByRole('button', { name: `选用${name}`, exact: true }).click();
  await toast(page, `${name}已在用`, 'success').waitFor();
  await rosterItem(page, name).waitFor();
}

/** 点左栏里的这位专家，用中间标题行“…”里的“放回专家库”。 */
async function putBack(page, name) {
  await rosterItem(page, name).click();
  const menu = await openMenu(page, name);
  await menu.getByRole('button', { name: '放回专家库', exact: true }).click();
  await toast(page, `${name}已放回专家库，记忆留着`, 'success').waitFor();
  await rosterItem(page, name).waitFor({ state: 'detached' });
}

/** 清理：左栏里还在用的专家都放回专家库（改了“在用”的用例在 finally 里调用）。 */
async function returnAll(page) {
  for (const name of await rosterNames(page)) await putBack(page, name);
}

/**
 * 中间一栏这位专家还没有任务时，点空状态里的“开始新任务”，等嵌着的会话和输入框出来。
 * 会话一建好就嵌进来了，“选用”记号随后才写好：再等它进左栏。
 */
async function startFirstTask(page, name) {
  await pane(page, name).locator('.ww-pane-empty').getByRole('button', { name: '开始新任务', exact: true }).click();
  await paneComposer(page, name).waitFor({ timeout: 20_000 });
  await taskSelect(page, name).waitFor();
  await rosterItem(page, name).waitFor();
}

/** 专家详情抽屉（标题是专家名）。 */
const detailDrawer = (page, name) => page.locator('dialog.ww-editor.ww-expert-detail[open]').filter({ has: page.locator('header h2', { hasText: exactly(name) }) });

/**
 * 关上详情抽屉。保存记忆时右上角提示先出来、抽屉随后才结束“保存中”，这期间按 Esc 不理：先等记忆框能编辑（没在保存）。
 * 有没保存的改动时会先弹“放弃修改”，这里确认放弃。
 */
async function closeDetail(page, detail) {
  const box = detail.locator('textarea').first();
  if (await box.count()) await until(async () => await box.isEnabled(), '详情抽屉保存完');
  await page.keyboard.press('Escape');
  const confirm = modal(page, '放弃修改');
  await Promise.race([detail.waitFor({ state: 'detached' }), confirm.waitFor()]);
  if (await confirm.isVisible()) await dialogButton(confirm, '放弃修改').click();
  await detail.waitFor({ state: 'detached' });
}

/** 清理：在中间打开着这位专家时，把它的记忆（规矩、进度）清空保存，再关上详情。 */
async function clearMemory(page, name) {
  const detail = detailDrawer(page, name);
  if (!(await detail.isVisible())) await pane(page, name).getByRole('button', { name: '详情', exact: true }).click();
  await detail.waitFor();
  await detail.getByRole('tab', { name: '记忆' }).click();
  const rules = detail.getByRole('textbox', { name: /规矩/ }), progress = detail.getByRole('textbox', { name: /进度/ });
  await until(async () => await rules.isEnabled(), '记忆读好');
  if (await rules.inputValue() || await progress.inputValue()) {
    await rules.fill(''); await progress.fill('');
    await nextToast(page, () => dialogButton(detail, '保存修改').click(), `已保存${name}的记忆`);
  }
  await closeDetail(page, detail);
}

// ======================= 三栏、欢迎页、可选设置 =======================

// EXP-01 需求§专家团队·专家页（第三版：左栏在用、中间专家说的话或欢迎页、右边小鲸）；需求§小鲸助手第 1 条（第一次进专家团队页小鲸直接停靠）；需求§界面通用约定（宋体只用于页标题和对象名）
// 这条要求左栏是空的，放在文件最前面；后面改了“在用”的用例都在 finally 里放回。
test('专家页三栏：新装时左栏“在用”是空的，下面是专家库、天数说明和“可选设置”；中间是欢迎页，给“打开小鲸”“去专家库挑一位”和研发、写作、研究三位的“开始新任务”；小鲸只留气泡，点“打开小鲸”才出来', async t => {
  await withPage(browser, t, wide, async ({ page, errors, external }) => {
    await openExperts(page);
    assert.deepEqual(await rosterNames(page), [], '前提：新装的环境里没有在用的专家');
    // 页头和其他页签一样在三栏上面（2026-11-13 用户反馈专家团没有左上角的模块名称）。
    const head = teamHead(page).locator('h2');
    assert.equal(await textOf(head), '专家团队');
    assert.match(await head.evaluate(element => getComputedStyle(element).fontFamily), /serif|song/i, '页标题用宋体');
    const custom = Object.values(storedExperts(dsh.home)).filter(record => !record.builtin && !record.deleted).length;
    assert.equal(await textOf(teamHead(page).locator('h2 + p')), `还没有在用的专家 · 专家库 ${libraryNames.length + custom} 位`, '标题下一句现状');
    const add = teamHead(page).getByRole('button', { name: '添加专家', exact: true });
    assert.equal(await textOf(add), '添加', '页头右边是“＋ 添加”');
    assert.match(await add.getAttribute('class'), /\bww-primary\b/, '和技能中心的“＋ 添加”同一个主按钮');
    const [headBox, rosterBox] = [await teamHead(page).boundingBox(), await roster(page).boundingBox()];
    assert.ok(headBox.y + headBox.height <= rosterBox.y, '页头在三栏上面');
    assert.equal(await textOf(roster(page).locator('.ww-roster-group')), '在用');
    assert.equal(await textOf(roster(page).locator('.ww-roster-empty')), '还没有在用的专家。用过的专家会出现在这一列。');
    assert.equal(await textOf(libraryEntry(page)), `专家库 全部 ${libraryNames.length + custom} 位`, '“在用”下面一行是专家库（小鲸不算在库里）');
    const foot = roster(page).locator('footer.ww-roster-foot');
    assert.equal(await textOf(foot.locator('.ww-roster-hint')), '14 天没用的专家会回专家库，记忆留着', '最底下是天数说明');
    assert.ok(await foot.getByRole('button', { name: '可选设置', exact: true }).isVisible(), '“可选设置”在左栏最底下');
    // 中间：欢迎页
    await welcome(page).waitFor();
    assert.equal(await textOf(welcome(page).locator('h2')), '专家们说的话会出现在这里');
    assert.match(await textOf(welcome(page).locator(':scope > p')), /跟右边的小鲸说要做什么，它会挑合适的专家去做/);
    assert.ok(await welcome(page).getByRole('button', { name: '打开小鲸', exact: true }).isVisible());
    assert.ok(await welcome(page).getByRole('button', { name: '去专家库挑一位', exact: true }).isVisible());
    const starters = welcome(page).locator('.ww-starter');
    assert.deepEqual(await starters.locator('strong').allInnerTexts(), starterNames, '三位常用专家：研发、写作、研究');
    for (const name of starterNames) {
      const role = roles.find(item => item.name === name), row = starters.filter({ has: page.locator('strong', { hasText: exactly(name) }) });
      assert.equal(await textOf(row.locator('.ww-lib-desc')), role.description, `${name}的介绍`);
      assert.ok(await row.getByRole('button', { name: '开始新任务', exact: true }).isVisible(), `${name}有“开始新任务”`);
    }
    // 进鲸翼小鲸不自己打开，只留气泡（2026-11-10 用户定）；左栏、中间两栏排开，中间占满右边。
    await page.locator('button.ww-assistant-bubble').waitFor();
    assert.equal(await assistantPanel(page).isVisible(), false, '小鲸不自己停靠');
    const [left, middle] = [await roster(page).boundingBox(), await welcome(page).boundingBox()];
    assert.ok(left.x + left.width <= middle.x + 1, '左栏在中间一栏左边');
    await welcome(page).getByRole('button', { name: '打开小鲸', exact: true }).click();
    await assistantPanel(page).waitFor();
    assert.ok(await roster(page).locator('.ww-roster-name, .ww-roster-text').first().evaluate(element => getComputedStyle(element).display !== 'none'), '这个宽度左栏写字，不收成头像');
    // 原来的名帖网格和“置顶”都删了。
    assert.equal(await page.locator('.ww-expert-grid').count(), 0, '没有名帖网格');
    assert.equal(await page.getByText('置顶', { exact: true }).count(), 0, '没有“置顶”');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// EXP-02 需求§专家团队·专家页（最底下是天数说明和“可选设置”：多久不用就回专家库、DSH 模式、工作区、是否纳入知识沉淀、已删除的专家）
test('左栏底部“可选设置”：多久不用就回专家库（默认 14 天）、DSH 模式（默认使用 DSH 默认模式）、工作区、纳入知识沉淀；没删过专家时没有“已删除的专家”；打开时中间一栏不动', async t => {
  await withPage(browser, t, wide, async ({ page }) => {
    await openExperts(page);
    const middle = page.locator('.ww-team > section');
    const before = await middle.boundingBox();
    const menu = await openSettings(page);
    const idle = idleSelect(menu);
    assert.equal(await idle.inputValue(), '14', '默认 14 天');
    assert.deepEqual(await idle.locator('option').allInnerTexts(), ['7 天', '14 天', '30 天', '不自动放回']);
    const mode = menu.getByRole('combobox', { name: 'DSH 模式', exact: true });
    assert.equal(await mode.inputValue(), '');
    assert.equal(await mode.locator('option:checked').innerText(), '使用 DSH 默认模式');
    await menu.locator('summary', { hasText: '可选设置' }).click();
    assert.ok(await menu.getByRole('textbox', { name: '工程绝对路径（可选）' }).isVisible());
    assert.ok(await menu.getByRole('combobox', { name: '使用已有工作区' }).isVisible());
    assert.ok(await menu.getByRole('checkbox', { name: '将本次新任务纳入我的知识沉淀' }).isVisible());
    if (!Object.values(storedExperts(dsh.home)).some(record => record.deleted)) assert.equal(await menu.getByText(/已删除的专家/).count(), 0, '没删过专家时不列“已删除的专家”');
    assert.deepEqual(await middle.boundingBox(), before, '菜单浮在上面，中间一栏不被挤动');
    await closeMenu(page, menu);
  });
});

// EXP-26 需求§专家团队·在用和专家库（N 默认 14，“可选设置”里能改成 7、30 天或不自动放回；另存的只有记号和天数，在鲸翼自己的存储里）
test('“多久不用就回专家库”改成 7 天、不自动放回：右上角说明，左栏底下的说明跟着改，刷新后还在；最后改回 14 天', async t => {
  await withPage(browser, t, wide, async ({ page }) => {
    await openExperts(page);
    const hint = roster(page).locator('.ww-roster-hint');
    try {
      let menu = await openSettings(page);
      const done = await nextToast(page, () => idleSelect(menu).selectOption('7'), '已改成 7 天不用就回专家库', 'success');
      await assertTopRight(page, done);
      await until(async () => await textOf(hint) === '7 天没用的专家会回专家库，记忆留着', '左栏底下写 7 天');
      await until(() => storedRoster(dsh.home).idleDays === 7, '天数存进鲸翼自己的存储');
      await page.reload();
      await page.getByRole('button', { name: '鲸翼', exact: true }).first().click();
      await roster(page).waitFor();
      await until(async () => await textOf(hint) === '7 天没用的专家会回专家库，记忆留着', '刷新后还是 7 天');
      menu = await openSettings(page);
      assert.equal(await idleSelect(menu).inputValue(), '7');
      await nextToast(page, () => idleSelect(menu).selectOption('0'), '专家不会再自动回专家库', 'success');
      await until(async () => await textOf(hint) === '专家不会自动回专家库', '左栏底下写不会自动回专家库');
      await nextToast(page, () => idleSelect(menu).selectOption('14'), '已改成 14 天不用就回专家库', 'success');
      await until(async () => await textOf(hint) === '14 天没用的专家会回专家库，记忆留着', '改回 14 天');
      await closeMenu(page, menu);
    } finally {
      const days = storedRoster(dsh.home).idleDays;
      if (days !== undefined && days !== 14) {
        const menu = roster(page).getByRole('dialog', { name: '可选设置' });
        if (!(await menu.isVisible())) await openSettings(page);
        await nextToast(page, () => idleSelect(menu).selectOption('14'), '已改成 14 天不用就回专家库');
      }
    }
  });
});

// ======================= 专家库、在用 =======================

// EXP-24 需求§专家团队·在用和专家库（专家库在中间一栏打开，一行一位，按内置、我建的、各扩展分组；查找框按名字、介绍、技能找，筛选按来源和有没有定时任务；每行写技能数、记忆条数、上次什么时候用的）
test('专家库：欢迎页点“去专家库挑一位”在中间打开，“内置”一组按顺序列出九位，每行有技能数、“还没用过”和“选用”；筛选带数量；查找“运维”只剩对得上的，查不到写“没有匹配的专家，换个词或筛选试试”', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openExperts(page);
    await welcome(page).getByRole('button', { name: '去专家库挑一位', exact: true }).click();
    await library(page).locator('li.ww-lib-row').first().waitFor();
    assert.equal(await libraryEntry(page).getAttribute('aria-current'), 'true', '左栏的“专家库”标成当前');
    assert.equal(await textOf(library(page).locator('h2')), '专家库');
    const custom = Object.values(storedExperts(dsh.home)).filter(record => !record.builtin && !record.deleted).length;
    assert.equal(await textOf(library(page).locator('.ww-pane-title small')), `${libraryNames.length + custom} 位：内置 ${libraryNames.length}${custom ? `、我建的 ${custom}` : ''}`);
    const builtin = libraryGroup(page, '内置');
    assert.match(await textOf(builtin.locator('h3')), /^内置\s*9\s*随鲸翼带来；可以改，改了能恢复原版$/, '分组写一句来历');
    assert.deepEqual(await libraryNamesIn(page, '内置'), libraryNames, '内置九位按「内置专家」表的顺序');
    for (const role of roles.filter(item => item.id !== 'manager')) {
      const row = libraryRow(page, role.name);
      assert.match(await textOf(row.locator('.ww-lib-name small')), new RegExp(`^${role.skills.length} 项技能`), `${role.name}的技能数`);
      assert.equal(await textOf(row.locator('.ww-lib-desc')), role.description, `${role.name}的介绍`);
      assert.ok(await row.getByRole('button', { name: `选用${role.name}`, exact: true }).isVisible() || await row.locator('.ww-lib-inuse').isVisible(), `${role.name}能选用或标着在用`);
    }
    // 运营专家别的用例都不碰：没用过。1440 宽停靠时“上次用的”一列收起，读文字内容。
    assert.equal(await libraryRow(page, '运营专家').locator('.ww-lib-last').textContent(), '还没用过');
    const chips = library(page).getByRole('group', { name: '按来源筛选' }).getByRole('button');
    const chipTexts = (await chips.allInnerTexts()).map(text => text.replace(/\s+/g, ''));
    assert.deepEqual(chipTexts, [`全部${libraryNames.length + custom}`, `内置${libraryNames.length}`, ...(custom ? [`我建的${custom}`] : [])], '筛选带数量；没有扩展、没有定时任务时不列这两种');
    await chips.filter({ hasText: '内置' }).click();
    assert.equal(await chips.filter({ hasText: '内置' }).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await libraryShown(page), libraryNames, '只看内置');
    await chips.filter({ hasText: '全部' }).click();
    // 查找按名字、介绍、技能找。
    const search = library(page).getByRole('searchbox', { name: '搜索专家' });
    await search.fill('运维');
    const expected = roles.filter(role => role.id !== 'manager' && [role.name, role.description, ...role.skills].some(value => value.includes('运维'))).map(role => role.name);
    assert.ok(expected.includes('运维专家'));
    await until(async () => JSON.stringify(await libraryShown(page)) === JSON.stringify(expected), `查找“运维”只剩 ${expected.join('、')}`);
    await search.fill('鲸翼测试-不存在的专家');
    await library(page).getByRole('status').filter({ hasText: '没有匹配的专家，换个词或筛选试试' }).waitFor();
    assert.deepEqual(await libraryShown(page), []);
    assert.ok(await library(page).getByRole('region', { name: '照着模板建一位', exact: true }).isVisible(), '查不到时模板那一行还在');
    await search.fill('');
    assert.deepEqual(await libraryNamesIn(page, '内置'), libraryNames);
    assert.deepEqual(errors, []);
  });
});

// EXP-26 需求§专家团队·在用和专家库（点“选用”就进左栏；左栏顺序：等你审批的在最前，其次在做的，其余按最近用过排；“…”里能手动“放回专家库”）；需求§专家团队·专家页（左栏一行一位：头像、名字、在干什么）
test('在专家库点“选用”：右上角说“已在用”，左栏出现它、写“今天选用”，中间打开它，库里那行标“在用”；后选用的排在左栏最上面；“…”里“放回专家库”后左栏少了它，库里又能选用', async t => {
  await withPage(browser, t, wide, async ({ page, errors }) => {
    await openExperts(page);
    try {
      assert.deepEqual(await rosterNames(page), [], '前提：左栏是空的');
      await openLibrary(page);
      const first = await nextToast(page, () => libraryRow(page, '写作专家').getByRole('button', { name: '选用写作专家', exact: true }).click(), '写作专家已在用', 'success');
      await assertTopRight(page, first);
      await rosterItem(page, '写作专家').waitFor();
      assert.equal(await textOf(rosterItem(page, '写作专家').locator('small')), '今天选用', '左栏写在干什么');
      assert.equal(await rosterItem(page, '写作专家').getAttribute('aria-current'), 'true', '左栏标着当前');
      assert.equal(await textOf(roster(page).locator('.ww-roster-group')), '在用 · 1');
      await pane(page, '写作专家').waitFor();
      assert.deepEqual(await paneTags(page, '写作专家'), ['内置'], '在用了，标题行不再标“不在用”');
      assert.equal(storedRoster(dsh.home).marks.writing?.state, 'picked', '“选用”记号存进鲸翼自己的存储');
      await openLibrary(page);
      assert.equal(await textOf(libraryRow(page, '写作专家').locator('.ww-lib-inuse')), '在用');
      assert.equal(await libraryRow(page, '写作专家').getByRole('button', { name: '选用写作专家' }).count(), 0, '在用的不再有“选用”');
      assert.equal(await textOf(libraryRow(page, '写作专家').locator('.ww-lib-last')), '今天选用');
      await pick(page, '数据专家');
      assert.deepEqual(await rosterNames(page), ['数据专家', '写作专家'], '后选用的排在最上面');
      assert.equal(await textOf(roster(page).locator('.ww-roster-group')), '在用 · 2');
      // 放回专家库
      await rosterItem(page, '写作专家').click();
      const menu = await openMenu(page, '写作专家');
      assert.deepEqual(await menu.getByRole('button').allInnerTexts(), ['编辑专家', '放回专家库'], '在用、手上没事的内置专家');
      const back = await nextToast(page, () => menu.getByRole('button', { name: '放回专家库', exact: true }).click(), '写作专家已放回专家库，记忆留着', 'success');
      await assertTopRight(page, back);
      await rosterItem(page, '写作专家').waitFor({ state: 'detached' });
      assert.deepEqual(await rosterNames(page), ['数据专家']);
      await pane(page, '数据专家').waitFor();
      assert.equal(storedRoster(dsh.home).marks.writing?.state, 'returned');
      await openLibrary(page);
      assert.ok(await libraryRow(page, '写作专家').getByRole('button', { name: '选用写作专家', exact: true }).isVisible(), '放回后库里又能选用');
      await putBack(page, '数据专家');
      await welcome(page).waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await returnAll(page);
    }
  });
});

// EXP-16 需求§专家团队·专家页（欢迎页三位常用专家直接开工；“开始新任务”在中间一栏开一段新的专家会话，不跳走；还不在用的记成选用）；需求§入口与会话（专家选择在输入框左侧）
test('欢迎页点研发专家的“开始新任务”：不离开工作台，中间开一段新的研发专家会话，输入框左侧选好研发专家、是空的，研发专家进了左栏；没有发出任何消息', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const sent = await guardSend(page), created = trackCreated(page);
    await openExperts(page);
    try {
      assert.deepEqual(await rosterNames(page), [], '前提：左栏是空的，中间是欢迎页');
      created.length = 0; // DSH 打开时自己会备一个空白会话，只数点“开始新任务”之后的
      await welcome(page).locator('.ww-starter').filter({ has: page.locator('strong', { hasText: '研发专家' }) }).getByRole('button', { name: '开始新任务' }).click();
      const input = paneComposer(page, '研发专家');
      await input.waitFor({ timeout: 20_000 });
      assert.equal(created.length, 1, '建了一个新会话');
      assert.ok(await page.locator('.ww-workbench-header').isVisible(), '还在鲸翼工作台');
      assert.equal(await page.locator('.ww-workbench-header button[data-tab][aria-pressed=true]').innerText().then(text => text.trim()), '专家团队');
      assert.deepEqual(await taskSelect(page, '研发专家').locator('option').allInnerTexts(), ['新任务'], '任务下拉里就是这件新任务');
      await rosterItem(page, '研发专家').waitFor();
      assert.equal(await rosterItem(page, '研发专家').getAttribute('title'), '研发专家：今天选用', '还不在用的记成选用，进了左栏');
      const picker = pane(page, '研发专家').locator('.ww-expert-picker .ww-picker-trigger');
      await picker.filter({ hasText: '研发专家' }).waitFor();
      assert.equal((await input.innerText()).trim(), '', '输入框是空的');
      const send = pane(page, '研发专家').locator('button[aria-label="发送消息"]');
      assert.equal(await send.isDisabled(), true, '没有内容，发送按钮不可用');
      const [pickerBox, inputBox, sendBox] = [await picker.boundingBox(), await input.boundingBox(), await send.boundingBox()];
      assert.ok(pickerBox.y >= inputBox.y && pickerBox.y <= sendBox.y + sendBox.height, '专家选择在输入框这一块里');
      assert.ok(pickerBox.x < sendBox.x && pickerBox.x < inputBox.x + inputBox.width / 2, '专家选择在输入框左侧');
      // 选专家的浮层点别处收起后，点一下就能再打开（原来浮层被浏览器收起时界面没跟上，要点两下）。
      const popover = pane(page, '研发专家').locator('.ww-expert-picker .ww-picker-popover');
      await picker.click(); await popover.waitFor();
      // 点输入框右端（浮层盖在左边，点中间会点到浮层上）。
      const [field, cover] = [await input.boundingBox(), await popover.boundingBox()], away = { x: field.x + field.width - 8, y: field.y + field.height / 2 };
      assert.ok(away.x > cover.x + cover.width || away.y < cover.y || away.y > cover.y + cover.height, '点的地方没被浮层盖住');
      await page.mouse.click(away.x, away.y); await popover.waitFor({ state: 'hidden' });
      await pane(page, '研发专家').locator('.ww-expert-picker .ww-picker-trigger[aria-expanded="false"]').waitFor({ timeout: 2000 });
      await picker.click(); await popover.waitFor({ timeout: 3000 });
      await page.keyboard.press('Escape'); await popover.waitFor({ state: 'hidden' });
      await picker.click(); await popover.waitFor({ timeout: 3000 });
      await page.keyboard.press('Escape'); await popover.waitFor({ state: 'hidden' });
      assert.equal(await pane(page, '研发专家').locator('[data-chat-node-key]').count(), 0, '会话里没有消息');
      assert.deepEqual(sent, [], '没有发出消息');
      assert.deepEqual(errors, []);
    } finally {
      await returnAll(page);
    }
  });
});

// EXP-27 需求§专家团队·专家页（下面一行切换它的几件任务，新的在前；“＋ 新任务”在这一栏开一段新的专家会话；正文是那件任务的 DSH 原生对话，底下能直接跟它说话）；需求§入口与会话（同一专家可以同时有多个任务）
// 切换任务时页面不报错另见下一条（2026-11-08 修好：换任务时先换上新会话再释放旧的）。
test('中间一栏：从专家库打开研究专家，标“不在用”、写“还没有交给研究专家的任务”；开始新任务后在嵌着的输入框里打字，“＋ 新任务”再开一件、新的在前，切回上一件草稿还在；没有发出消息', async t => {
  await withPage(browser, t, async ({ page }) => {
    const sent = await guardSend(page), created = trackCreated(page);
    await openExperts(page);
    try {
      await openExpert(page, '研究专家');
      assert.deepEqual(await paneTags(page, '研究专家'), ['内置', '不在用']);
      assert.equal(await textOf(pane(page, '研究专家').locator('.ww-pane-empty h3')), '还没有交给研究专家的任务');
      assert.equal(await taskSelect(page, '研究专家').count(), 0, '没有任务时没有任务下拉');
      created.length = 0;
      await startFirstTask(page, '研究专家');
      await until(async () => JSON.stringify(await paneTags(page, '研究专家')) === JSON.stringify(['内置']), '开始新任务后就在用了，标题行不再标“不在用”');
      const firstId = await taskSelect(page, '研究专家').inputValue();
      const draft = `鲸翼测试-EXP27 草稿 ${suffix()}`;
      await paneComposer(page, '研究专家').click();
      await page.keyboard.type(draft);
      assert.equal((await paneComposer(page, '研究专家').innerText()).trim(), draft, '在中间一栏直接跟它说话');
      assert.equal(await pane(page, '研究专家').locator('button[aria-label="发送消息"]').isEnabled(), true, '有内容后能发送（这里不发）');
      await pane(page, '研究专家').getByRole('button', { name: '新任务', exact: true }).click();
      await until(async () => (await taskSelect(page, '研究专家').locator('option').count()) === 2, '任务下拉里有两件');
      assert.equal(created.length, 2, '又建了一个新会话');
      const ids = await taskSelect(page, '研究专家').locator('option').evaluateAll(options => options.map(option => option.value));
      assert.notEqual(ids[0], firstId, '新开的那件排在最前');
      assert.equal(ids[1], firstId);
      // 新会话先出现在下拉里，等“新建专家会话”读回完成才选中它，中间约两帧（2026-11-13 逐帧量过约 30ms）；所以等它选中，不在出现的那一刻判断。
      await until(async () => await taskSelect(page, '研究专家').inputValue() === ids[0], '新开的那件选中');
      await until(async () => (await paneComposer(page, '研究专家').innerText()).trim() === '', '新任务的输入框是空的');
      await taskSelect(page, '研究专家').selectOption(firstId);
      await until(async () => (await paneComposer(page, '研究专家').innerText()).trim() === draft, '切回上一件，草稿还在');
      assert.ok(await page.locator('.ww-workbench-header').isVisible(), '一直在鲸翼工作台');
      assert.deepEqual(sent, [], '没有发出消息');
    } finally {
      await returnAll(page);
    }
  });
});

// EXP-27 反例；需求§3 每条用例结束时 pageerror 为空
test('反例：在中间一栏开第二件任务、在任务下拉里来回切换，页面不报错', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await guardSend(page);
    await openExperts(page);
    try {
      await openExpert(page, '产品专家');
      await startFirstTask(page, '产品专家');
      const firstId = await taskSelect(page, '产品专家').inputValue();
      await pane(page, '产品专家').getByRole('button', { name: '新任务', exact: true }).click();
      await until(async () => (await taskSelect(page, '产品专家').locator('option').count()) === 2, '任务下拉里有两件');
      await paneComposer(page, '产品专家').waitFor();
      await taskSelect(page, '产品专家').selectOption(firstId);
      await paneComposer(page, '产品专家').waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await returnAll(page);
    }
  });
});

// EXP-28 需求§入口与会话（会话里的专家选择：小鲸在最上面，其次一组“在用的专家”，其余收进“更多专家 · 专家库 N 位”，输入名字找时全部一起找）
test('输入框里的专家选择：小鲸在最上面，其次“在用的专家”，其余收在“更多专家 · 专家库 N 位”里、点开才列；输入名字时全部一起找', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await guardSend(page);
    await openExperts(page);
    try {
      await openExpert(page, '测试专家');
      await startFirstTask(page, '测试专家');
      const total = Number((await libraryEntry(page).getAttribute('title')).match(/\d+/)[0]);
      const inUse = await rosterNames(page);
      assert.deepEqual(inUse, ['测试专家'], '前提：在用的只有测试专家');
      await pane(page, '测试专家').locator('.ww-picker-trigger').click();
      const popover = pane(page, '测试专家').locator('.ww-picker-popover');
      await popover.waitFor();
      const entries = () => popover.locator('.ww-picker-options > *').evaluateAll(nodes => nodes.map(node => (node.querySelector('strong')?.textContent ?? node.textContent).trim()));
      const rest = total - inUse.length;
      assert.deepEqual(await entries(), ['不使用专家', '小鲸助手', '在用的专家', '测试专家', `更多专家 · 专家库 ${rest} 位`]);
      assert.equal(await popover.getByRole('button', { name: /测试专家/ }).getAttribute('aria-pressed'), 'true', '当前选的是测试专家');
      const more = popover.locator('.ww-picker-more');
      assert.equal(await more.getAttribute('aria-expanded'), 'false');
      await more.click();
      assert.equal(await more.getAttribute('aria-expanded'), 'true');
      const opened = await entries();
      assert.equal(opened[4], '收起专家库');
      assert.equal(opened.length - 5, rest, '点开后列出专家库里其余的专家');
      assert.ok(libraryNames.filter(name => name !== '测试专家').every(name => opened.slice(5).includes(name)), `其余内置专家都在：${opened.slice(5).join('、')}`);
      await popover.getByRole('textbox', { name: '搜索专家' }).fill('运维');
      const found = await entries();
      assert.equal(found[0], '不使用专家');
      assert.ok(found.includes('运维专家'), `找名字：${found.join('、')}`);
      for (const text of await popover.locator('.ww-picker-options button:not(:first-child)').allInnerTexts()) assert.match(text, /运维/, '只列对得上的专家');
      assert.equal(await popover.locator('.ww-picker-group, .ww-picker-more').count(), 0, '找的时候不分组');
      await page.keyboard.press('Escape');
      await popover.waitFor({ state: 'hidden' });
      assert.deepEqual(errors, []);
    } finally {
      await returnAll(page);
    }
  });
});

// EXP-29 需求§专家团队·在用和专家库（宽度全跟着所在区域走：区域窄了左栏收成一列头像，鼠标停上去看名字和在干什么）；需求§界面通用约定（尺寸跟着窗口走）
test('专家页宽度看所在区域：同样 1200 宽，小鲸收着时左栏写名字和在干什么；小鲸停靠后这块变窄，左栏收成一列头像，鼠标停上去看名字；回到悬浮又展开', async t => {
  await withPage(browser, t, { width: 1200, height: 800 }, async ({ page, errors }) => {
    await openExperts(page, { assistant: 'float' });
    try {
      await pick(page, '运维专家');
      const item = rosterItem(page, '运维专家');
      assert.ok(await item.locator('.ww-roster-name').isVisible(), '小鲸收着时左栏写名字');
      assert.equal(await textOf(item.locator('small')), '今天选用');
      const wideBox = await roster(page).boundingBox();
      await page.getByRole('button', { name: '打开小鲸助手', exact: true }).click();
      await assistantPanel(page).getByRole('button', { name: '停靠', exact: true }).click();
      await assistantPanel(page).getByRole('button', { name: '悬浮', exact: true }).waitFor();
      await item.locator('.ww-roster-name').waitFor({ state: 'hidden' });
      const narrowBox = await roster(page).boundingBox();
      assert.ok(narrowBox.width < wideBox.width / 2 && narrowBox.width <= 96, `左栏收成一列头像（${Math.round(wideBox.width)} → ${Math.round(narrowBox.width)}px）`);
      assert.ok(await item.locator('img.ww-avatar').isVisible(), '头像还在');
      assert.equal(await item.getAttribute('title'), '运维专家：今天选用', '鼠标停上去看名字和在干什么');
      assert.match(await libraryEntry(page).getAttribute('title'), /^全部 \d+ 位$/);
      assert.ok(await roster(page).getByRole('button', { name: '可选设置', exact: true }).isVisible(), '可选设置还点得到');
      await item.click();
      await pane(page, '运维专家').waitFor();
      const [middle, dock] = [await pane(page, '运维专家').boundingBox(), await assistantPanel(page).boundingBox()];
      assert.ok(middle.x + middle.width <= dock.x + 1, '中间一栏让出小鲸的位置');
      assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), true, '没有横向滚动');
      await assistantPanel(page).getByRole('button', { name: '悬浮', exact: true }).click();
      await item.locator('.ww-roster-name').waitFor();
    } finally {
      // 悬浮的小鲸盖在页面右上方，会挡住中间一栏标题行的“…”（页头在三栏上面以后正好压住）；先收起再放回专家库。
      if (await assistantPanel(page).isVisible()) await assistantPanel(page).getByRole('button', { name: '收起助手' }).click();
      await returnAll(page);
    }
    assert.deepEqual(errors, []);
  });
});

// EXP-29 反例（最窄）：需求§专家团队·在用和专家库（再窄收到顶上一排）
test('窗口最窄（480 宽）时左栏收到中间一栏上面，头像、专家库和设置排成一排', async t => {
  await withPage(browser, t, async ({ page }) => {
    // 480 宽时 DSH 收起了侧栏，点不到“鲸翼”：先在正常宽度进来再把窗口缩窄。
    await openExperts(page, { assistant: 'float' });
    await resizeAndSettle(page, { width: 480, height: 800 });
    const middle = page.locator('.ww-team > section');
    await page.waitForFunction(() => { const nav = document.querySelector('nav.ww-roster')?.getBoundingClientRect(), mid = document.querySelector('.ww-team > section')?.getBoundingClientRect(); return nav && mid && nav.bottom <= mid.top + 1; });
    const [top, below] = [await roster(page).boundingBox(), await middle.boundingBox()];
    assert.ok(top.y + top.height <= below.y + 1, '左栏在中间一栏上面');
    // 页头还在最上面，“＋ 添加”看得到（2026-11-13 起添加专家在页头，不在左栏）。
    assert.ok((await teamHead(page).boundingBox()).y + (await teamHead(page).boundingBox()).height <= top.y + 1, '页头在左栏上面');
    assert.ok(await teamHead(page).getByRole('button', { name: '添加专家', exact: true }).isVisible(), '窄了“＋ 添加”还在页头');
    const centers = await Promise.all([libraryEntry(page), roster(page).getByRole('button', { name: '可选设置', exact: true })]
      .map(async locator => { const box = await locator.boundingBox(); return box.y + box.height / 2; }));
    assert.ok(Math.max(...centers) - Math.min(...centers) <= 12, `排成一排（各按钮中线 ${centers.map(Math.round).join('、')}）`);
  });
});

// ======================= 菜单、编辑、模板 =======================

// EXP-13 需求§专家团队·自定义与配置（内置专家可以编辑、不能删除；“恢复原版”只在有改动时出现）；需求§专家团队·专家详情（小鲸的详情、编辑和恢复原版在小鲸面板右上角的“…”里）
test('反例：内置专家不能删除：九位内置专家中间标题行的“…”只有“编辑专家”“选用”，小鲸面板的“…”只有详情和改名字，没改过时都没有“恢复原版”', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openExperts(page);
    const before = await counts(page);
    for (const name of libraryNames) {
      await openExpert(page, name);
      assert.deepEqual(await paneTags(page, name), ['内置', '不在用'], `${name}的标题行`);
      const menu = await openMenu(page, name);
      assert.deepEqual(await menu.getByRole('button').allInnerTexts(), ['编辑专家', '选用'], `${name}的菜单`);
      await closeMenu(page, menu);
    }
    // 进鲸翼小鲸只留气泡，先点开再看它的菜单。
    await page.locator('button.ww-assistant-bubble').click();
    await assistantPanel(page).getByRole('button', { name: '小鲸助手的更多操作', exact: true }).click();
    const menu = page.getByRole('dialog', { name: '小鲸助手的更多操作', exact: true });
    await menu.waitFor();
    assert.deepEqual(await menu.getByRole('button').allInnerTexts(), ['详情、技能和记忆', '改名字、头像和说明'], '小鲸的菜单');
    await closeMenu(page, menu);
    assert.deepEqual(await counts(page), before);
    assert.deepEqual(await libraryNamesIn(page, '内置'), libraryNames);
  });
});

// 需求§专家团队·内置专家（默认绑定技能）；需求§专家团队·在用和专家库（每行写技能数）
test('每位内置专家在专家库里写的技能数，等于编辑抽屉里勾选的技能数', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openExperts(page);
    for (const name of libraryNames) {
      await openLibrary(page);
      const shown = Number((await textOf(libraryRow(page, name).locator('.ww-lib-name small'))).match(/^(\d+) 项技能/)[1]);
      await library(page).getByRole('button', { name: `打开${name}`, exact: true }).click();
      const menu = await openMenu(page, name);
      await menu.getByRole('button', { name: '编辑专家' }).click();
      const editor = drawer(page, '编辑专家');
      await editor.waitFor();
      await dialogButton(editor, '保存修改').and(page.locator(':enabled')).waitFor();
      assert.equal(await textOf(skillSection(editor).locator('summary')), `Skills · 可选 (${shown})`, `${name}抽屉里的技能数`);
      assert.equal((await checkedSkills(editor)).length, shown, `${name}勾选的技能数`);
      await discardDrawer(page, editor, '取消编辑');
    }
  });
});

// EXP-05 需求§专家模板（售前、实施 2026-10-23 起改为模板；随包模板库按名称拼音排序）；需求§专家团队·从模板创建（专家库最后一行“照着模板建一位”，展开后点“照着建”打开新建抽屉、模板已套好）
test('售前、实施不在专家库里，只在模板里：专家库最后一行“照着模板建一位”展开后十份模板按拼音排序，“照着建”打开套好模板的添加抽屉；“自己填写”的“从模板开始”也是这十份', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openExperts(page);
    await openLibrary(page);
    const names = await libraryShown(page);
    assert.ok(!names.includes('售前专家') && !names.includes('实施专家'), `专家库：${names.join('、')}`);
    assert.deepEqual(expertTemplates.map(item => item.name), templateNames, '随包模板库和需求的模板名单一致');
    const box = library(page).getByRole('region', { name: '照着模板建一位', exact: true });
    const toggle = box.getByRole('button', { name: '展开', exact: true });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', '默认收着');
    await toggle.click();
    await box.locator('li.ww-lib-row').first().waitFor();
    assert.deepEqual(await box.locator('li.ww-lib-row strong').allInnerTexts(), templateNames);
    const template = expertTemplates.find(item => item.name === '学习教练');
    await box.getByRole('button', { name: '照着「学习教练」建一位', exact: true }).click();
    let editor = drawer(page, '添加专家');
    await editor.waitFor();
    await until(async () => await nameField(editor).inputValue() === template.name, '抽屉按学习教练模板填好');
    assert.equal(await descriptionField(editor).inputValue(), template.description);
    assert.equal(await templateSelect(editor).locator('option:checked').innerText(), `${template.name} · ${template.description}`, '“从模板开始”选的就是它');
    await discardDrawer(page, editor, '取消编辑');
    editor = await openAddDrawer(page);
    const options = await templateSelect(editor).locator('option').allInnerTexts();
    assert.equal(options[0], '空白专家');
    assert.deepEqual(options.slice(1).map(text => text.split(' · ')[0]), templateNames);
    await discardDrawer(page, editor, '取消编辑');
  });
});

// EXP-03、EXP-05 需求§专家模板·从模板创建；需求§专家团队·在用和专家库（专家库按内置、我建的分组）；需求§界面通用约定（编辑用右侧抽屉、结果用右上角提示）
test('“＋”→“自己填写”、从“学习教练”模板创建自定义专家：表单按模板填好，创建后专家库“我建的”一组里有它、摘要多一位，打开后标题行标“我建的”，专家文件里有它', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openExperts(page);
    const before = await counts(page);
    const template = expertTemplates.find(item => item.name === '学习教练');
    const editor = await openAddDrawer(page);
    const box = await editor.boundingBox();
    assert.ok(page.viewportSize().width - (box.x + box.width) <= 16, '抽屉贴着右边');
    assert.deepEqual(await editor.locator('footer button').allInnerTexts(), ['取消编辑', '创建专家']);
    await templateSelect(editor).selectOption({ label: `${template.name} · ${template.description}` });
    const installed = await installedSkills(editor);
    const expected = template.skills.filter(name => installed.includes(name));
    assert.equal(await nameField(editor).inputValue(), template.name);
    assert.equal(await descriptionField(editor).inputValue(), template.description);
    assert.equal(await promptField(editor).inputValue(), template.prompt);
    assert.deepEqual((await checkedSkills(editor)).sort(), [...expected].sort());
    const presetIndex = Number(template.avatar.replace('preset-', ''));
    assert.equal(await pressedPreset(editor), presetIndex, `头像是模板里的 ${template.avatar}`);
    const avatar = await preset(editor, presetIndex).locator('img').getAttribute('src');
    assert.equal(await preview(editor).getAttribute('src'), avatar);
    const name = `鲸翼测试-EXP03-${suffix()}`;
    await nameField(editor).fill(name);
    await dialogButton(editor, '创建专家').click();
    const done = toast(page, `已添加专家「${name}」`, 'success');
    await done.waitFor();
    await assertTopRight(page, done);
    await editor.waitFor({ state: 'detached' });
    assert.deepEqual(await counts(page), { total: before.total + 1, builtin: before.builtin, custom: before.custom + 1 });
    const mine = await libraryNamesIn(page, '我建的');
    assert.equal(mine.at(-1), name, '排在“我建的”一组最后');
    assert.match(await textOf(libraryGroup(page, '我建的').locator('h3')), /你或小鲸替你建的/);
    assert.match(await textOf(libraryRow(page, name).locator('.ww-lib-name small')), new RegExp(`^${expected.length} 项技能`));
    await library(page).getByRole('button', { name: `打开${name}`, exact: true }).click();
    assert.deepEqual(await paneTags(page, name), ['我建的', '不在用']);
    assert.equal(await textOf(paneDescription(page, name)), template.description);
    const record = await until(() => storedByName(dsh.home, name), '专家文件里出现新专家');
    assert.equal(record.builtin, false); assert.equal(record.deleted, false);
    assert.equal(record.description, template.description);
    assert.equal(record.prompt, template.prompt.trim());
    assert.equal(record.avatar, avatar);
    assert.deepEqual([...record.skills].sort(), [...expected].sort(), '只存了本机装了的技能');
    assert.deepEqual(await rosterNames(page), [], '新建不等于选用，左栏不变');
    assert.deepEqual(errors, []);
  });
});

// EXP-04 需求§专家团队·自定义与配置；界面标签“系统提示词（必填）”
test('反例：系统提示词为空时不创建，右上角说明要填提示词，专家数和专家文件都不变', async t => {
  await withPage(browser, t, async ({ page }) => {
    const actions = trackExpertActions(page);
    await openExperts(page);
    const before = await counts(page), names = await libraryShown(page), stored = expertsFileText(dsh.home);
    const editor = await openAddDrawer(page);
    await nameField(editor).fill(`鲸翼测试-EXP04-${suffix()}`);
    await dialogButton(editor, '创建专家').click();
    const problem = toast(page, '系统提示词', 'error');
    await problem.waitFor();
    await assertTopRight(page, problem);
    assert.ok(await editor.isVisible(), '抽屉还开着，填的内容还在');
    await discardDrawer(page, editor, '取消编辑');
    assert.ok(!actions.includes('save'), `没有发出保存请求（${actions.join('、')}）`);
    assert.deepEqual(await counts(page), before);
    assert.deepEqual(await libraryShown(page), names);
    assert.equal(expertsFileText(dsh.home), stored, '专家文件没变');
  });
});

// EXP-21 需求§界面通用约定（放弃草稿用居中弹窗确认；2026-10-28 用户确认：编辑抽屉里有改动时，按 Esc、点遮罩、×、“取消编辑”都先确认）
test('添加专家时填了名字再按 Esc 或点遮罩：先居中确认“放弃修改”，点“取消”内容还在；确认放弃后抽屉关上，没有新建专家', async t => {
  await withPage(browser, t, async ({ page }) => {
    const actions = trackExpertActions(page);
    await openExperts(page);
    const before = await counts(page), stored = expertsFileText(dsh.home);
    const editor = await openAddDrawer(page);
    const name = `鲸翼测试-EXP21-${suffix()}`;
    await nameField(editor).fill(name);
    await page.keyboard.press('Escape');
    const confirm = modal(page, '放弃修改');
    await confirm.waitFor();
    assert.ok(await isCentered(page, confirm), '确认框居中');
    assert.ok(await isRed(dialogButton(confirm, '放弃修改')), '放弃按钮是红色');
    await dialogButton(confirm, '取消').click();
    await confirm.waitFor({ state: 'detached' });
    assert.ok(await editor.isVisible(), '点“取消”后抽屉还开着');
    assert.equal(await nameField(editor).inputValue(), name, '填的名字还在');
    // 点抽屉左边的遮罩
    await page.mouse.click(40, 450);
    await confirm.waitFor();
    await dialogButton(confirm, '放弃修改').click();
    await editor.waitFor({ state: 'detached' });
    assert.ok(!actions.includes('save'), `没有发出保存请求（${actions.join('、')}）`);
    assert.deepEqual(await counts(page), before);
    assert.equal(expertsFileText(dsh.home), stored, '专家文件没变');
  });
});

// EXP-21 反例：没有改动时关闭不打扰，Esc 直接关上
test('反例：打开添加专家什么都没改，按 Esc 直接关上，不弹“放弃修改”', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openExperts(page);
    const editor = await openAddDrawer(page);
    await page.keyboard.press('Escape');
    await editor.waitFor({ state: 'detached' });
    assert.equal(await modal(page, '放弃修改').count(), 0);
  });
});

// EXP-06 需求§专家模板·从模板创建（导入模板文件；只保留当前装了的技能，跳过的在右上角提示）
test('导入合法的模板文件：按文件填好表单，没装的技能被跳过并在右上角列出，这时还没有创建', async t => {
  await withPage(browser, t, async ({ page }) => {
    const actions = trackExpertActions(page);
    await openExperts(page);
    const before = await counts(page);
    const name = `鲸翼测试-EXP05-${suffix()}`, prompt = '# 鲸翼测试专家\n\n你是功能测试导入的专家，只用于检查界面。';
    const file = files.file('tpl-ok.md', templateText({ name, description: '从模板文件导入的测试专家', skills: ['whalewing-writing', 'not-installed-skill'], avatar: 'preset-03', prompt }));
    const editor = await openAddDrawer(page);
    assert.ok((await installedSkills(editor)).includes('whalewing-writing'), '前提：本机装了 whalewing-writing');
    await editor.getByLabel('导入模板文件').setInputFiles(file);
    const skipped = toast(page, `已套用模板“${name}”；这些技能当前没有装，已跳过：not-installed-skill`);
    await skipped.waitFor();
    await assertTopRight(page, skipped);
    assert.equal(await nameField(editor).inputValue(), name);
    assert.equal(await descriptionField(editor).inputValue(), '从模板文件导入的测试专家');
    assert.equal(await promptField(editor).inputValue(), prompt);
    assert.deepEqual(await checkedSkills(editor), ['whalewing-writing']);
    assert.equal(await pressedPreset(editor), 3);
    assert.ok(!actions.includes('save'));
    await discardDrawer(page, editor, '取消编辑');
    assert.deepEqual(await counts(page), before, '导入只填表单，专家数不变');
    assert.equal(storedByName(dsh.home, name), undefined, '专家文件里没有它');
  });
});

// EXP-07 需求§专家模板（不认识的字段、格式不对的文件直接拒收并说明原因）
test('反例：模板文件有不认识的字段、或开头没有 --- 时拒收并说明原因，表单保持原样', async t => {
  await withPage(browser, t, async ({ page }) => {
    const actions = trackExpertActions(page);
    await openExperts(page);
    const before = await counts(page);
    const unknown = files.file('tpl-unknown-field.md', `${templateText({ name: '鲸翼测试-EXP06', description: '多了一个字段', skills: ['whalewing-writing'], prompt: '正文' }).replace('skills:', 'foo: bar\nskills:')}`);
    const bare = files.file('tpl-no-frontmatter.md', '# 鲸翼测试-EXP06\n\n没有开头的 --- 信息。\n');
    const editor = await openAddDrawer(page);
    const finance = expertTemplates.find(item => item.name === '财务专家');
    await templateSelect(editor).selectOption({ label: `${finance.name} · ${finance.description}` });
    await until(async () => await nameField(editor).inputValue() === '财务专家', '表单按财务专家模板填好');
    const original = await formState(editor);
    const unknownError = await nextToast(page, () => editor.getByLabel('导入模板文件').setInputFiles(unknown), '专家模板格式不对', 'error');
    assert.match(await textOf(unknownError), /foo/, '说明哪一行看不懂');
    await assertTopRight(page, unknownError);
    assert.deepEqual(await formState(editor), original, '不认识的字段：表单没有被部分填入');
    const bareError = await nextToast(page, () => editor.getByLabel('导入模板文件').setInputFiles(bare), '专家模板格式不对', 'error');
    assert.match(await textOf(bareError), /开头要用两行 ---/, '说明缺少开头的 --- 信息');
    assert.deepEqual(await formState(editor), original, '缺少开头信息：表单没有被部分填入');
    await discardDrawer(page, editor, '取消编辑');
    assert.ok(!actions.includes('save'));
    assert.deepEqual(await counts(page), before);
    assert.equal(storedByName(dsh.home, '鲸翼测试-EXP06'), undefined);
  });
});

// EXP-05 需求§专家模板·从模板创建（选回“空白专家”清空模板填入的内容）
test('选了模板再选回“空白专家”：名字、介绍、提示词清空，技能取消勾选，头像回到默认', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openExperts(page);
    const editor = await openAddDrawer(page);
    const blank = await formState(editor);
    assert.deepEqual({ ...blank, avatar: undefined }, { name: '', description: '', prompt: '', skills: [], preset: 0, avatar: undefined }, '新抽屉是空白的');
    const finance = expertTemplates.find(item => item.name === '财务专家');
    await templateSelect(editor).selectOption({ label: `${finance.name} · ${finance.description}` });
    await until(async () => await nameField(editor).inputValue() === '财务专家', '表单按财务专家模板填好');
    const filled = await formState(editor);
    assert.equal(filled.description, finance.description);
    assert.ok(filled.prompt.length > 0 && filled.skills.length > 0, '模板填好了提示词和技能');
    assert.equal(filled.preset, Number(finance.avatar.replace('preset-', '')));
    await templateSelect(editor).selectOption({ label: '空白专家' });
    await until(async () => await nameField(editor).inputValue() === '', '表单清空');
    assert.deepEqual(await formState(editor), blank);
    assert.equal(await textOf(skillSection(editor).locator('summary')), 'Skills · 可选 (0)');
    await discardDrawer(page, editor, '取消编辑');
  });
});

// EXP-10、EXP-11 需求§专家团队·自定义与配置（内置专家可以编辑；“恢复原版”可以勾选只恢复哪几项）；决策 2026-10-15（按钮写“保存修改”）、2026-10-25
test('编辑内置专家“测试专家”的介绍并保存，再用“恢复原版”只恢复介绍，中间标题行和专家文件都回到原文', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openExperts(page);
    const role = roles.find(item => item.id === 'testing'), changed = `鲸翼测试-EXP09 介绍 ${suffix()}`;
    await openExpert(page, role.name);
    const description = paneDescription(page, role.name);
    assert.equal(await textOf(description), role.description);
    let menu = await openMenu(page, role.name);
    await menu.getByRole('button', { name: '编辑专家' }).click();
    const editor = drawer(page, '编辑专家');
    await editor.waitFor();
    assert.deepEqual(await editor.locator('footer button').allInnerTexts(), ['取消编辑', '保存修改']);
    assert.equal(await descriptionField(editor).inputValue(), role.description);
    await descriptionField(editor).fill(changed);
    await dialogButton(editor, '保存修改').click();
    const saved = toast(page, `已保存「${role.name}」的修改`, 'success');
    await saved.waitFor();
    await assertTopRight(page, saved);
    await editor.waitFor({ state: 'detached' });
    assert.equal(await textOf(description), changed);
    await until(() => storedExperts(dsh.home).testing?.description === changed, '专家文件里的介绍改成新的');
    menu = await openMenu(page, role.name);
    assert.deepEqual(await menu.getByRole('button').allInnerTexts(), ['编辑专家', '选用', '恢复原版']);
    await menu.getByRole('button', { name: '恢复原版' }).click();
    const confirm = modal(page, '恢复原版');
    await confirm.waitFor();
    assert.ok(await isCentered(page, confirm), '确认框居中');
    assert.deepEqual(await confirm.locator('footer button').allInnerTexts(), ['取消', '恢复原版']);
    const field = confirm.getByRole('checkbox', { name: '介绍' });
    assert.equal(await field.isChecked(), true, '默认勾着改过的“介绍”');
    await dialogButton(confirm, '恢复原版').click();
    const restored = toast(page, `「${role.name}」已恢复原版：介绍`, 'success');
    await restored.waitFor();
    await confirm.waitFor({ state: 'detached' });
    assert.equal(await textOf(description), role.description);
    await until(() => storedExperts(dsh.home).testing?.description === role.description, '专家文件里的介绍回到原文');
    menu = await openMenu(page, role.name);
    assert.deepEqual(await menu.getByRole('button').allInnerTexts(), ['编辑专家', '选用'], '恢复后“恢复原版”消失');
    await closeMenu(page, menu);
    assert.deepEqual(errors, []);
  });
});

// EXP-08 需求§专家团队·自定义与配置（12 个预置插画；上传静态 PNG、JPEG、WebP，不超过 512 KiB，宽高都小于 300 像素）
test('添加专家时有 12 个预置头像，选第 5 个、再上传合规的 PNG，预览随之更新，创建后存下这张图', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openExperts(page);
    const avatarFile = files.file('ok-avatar.png', png(128, 128));
    const editor = await openAddDrawer(page);
    assert.equal(await editor.getByRole('group', { name: '选择预置头像' }).getByRole('button').count(), 12);
    await preset(editor, 5).click();
    assert.equal(await pressedPreset(editor), 5);
    assert.equal(await preview(editor).getAttribute('src'), await preset(editor, 5).locator('img').getAttribute('src'));
    await editor.getByLabel('上传头像').setInputFiles(avatarFile);
    const uploaded = `data:image/png;base64,${png(128, 128).toString('base64')}`;
    await page.waitForFunction(src => document.querySelector('dialog.ww-editor[open] .ww-avatar-picker > .ww-avatar')?.getAttribute('src') === src, uploaded);
    assert.equal(await pressedPreset(editor), 0, '上传后不再按着预置头像');
    const name = `鲸翼测试-EXP11-${suffix()}`;
    await nameField(editor).fill(name);
    await descriptionField(editor).fill('上传了头像的测试专家');
    await promptField(editor).fill('你是功能测试建的专家。');
    await dialogButton(editor, '创建专家').click();
    await toast(page, `已添加专家「${name}」`, 'success').waitFor();
    const record = await until(() => storedByName(dsh.home, name), '专家文件里出现新专家');
    assert.match(record.avatar, /^data:image\/png;base64,/);
    assert.deepEqual(pngSize(Buffer.from(record.avatar.split(',')[1], 'base64')), [128, 128], '存下的是 128×128 的图');
    await openLibrary(page);
    assert.match(await libraryRow(page, name).locator('img.ww-avatar').getAttribute('src'), /^data:image\/png;base64,/, '专家库那一行的头像是这张图');
  });
});

// EXP-09 需求§专家团队·自定义与配置（头像不超过 512 KiB、宽高都小于 300 像素、只收静态 PNG/JPEG/WebP）
test('反例：超过 512 KiB、宽高到 300 像素、GIF 动图和 HEIC 头像都被拒收并说明原因，预览保持原头像', async t => {
  await withPage(browser, t, async ({ page }) => {
    const actions = trackExpertActions(page);
    await openExperts(page);
    const before = await counts(page);
    const cases = [
      [files.file('edge.png', png(300, 300)), '宽和高都须小于 300 像素'],
      [files.file('big.png', png(64, 64, { padBytes: 600 * 1024 })), '不超过 512 KiB'],
      [files.file('anim.gif', animatedGif()), 'PNG、JPEG 或 WebP'],
      [files.file('fake.heic', '这不是图片，只是冒充 HEIC 的文本'), 'PNG、JPEG 或 WebP'],
    ];
    const editor = await openAddDrawer(page);
    await preset(editor, 3).click();
    const original = await preview(editor).getAttribute('src');
    for (const [file, reason] of cases) {
      const problem = await nextToast(page, () => editor.getByLabel('上传头像').setInputFiles(file), reason, 'error');
      await assertTopRight(page, problem);
      assert.equal(await preview(editor).getAttribute('src'), original, `${file}：预览还是原头像`);
      assert.equal(await pressedPreset(editor), 3);
    }
    await discardDrawer(page, editor, '取消编辑');
    assert.ok(!actions.includes('save'));
    assert.deepEqual(await counts(page), before);
  });
});

// EXP-14 需求§专家团队·自定义与配置（可以删除自定义专家）；需求§专家团队·专家页（“可选设置”里有已删除的专家）；需求§界面通用约定（删除用居中确认框、确认按钮红色，结果用右上角提示）
test('删除自定义专家：居中确认框、确认按钮是红色，确认后中间一栏不再是它、专家库少一位、专家文件标为已删除；“可选设置”的“已删除的专家”里能找回', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openExperts(page);
    const name = await createBlankExpert(page, `鲸翼测试-EXP13-${suffix()}`);
    const before = await counts(page), id = storedByName(dsh.home, name).id;
    await library(page).getByRole('button', { name: `打开${name}`, exact: true }).click();
    const menu = await openMenu(page, name);
    assert.deepEqual(await menu.getByRole('button').allInnerTexts(), ['编辑专家', '选用', '删除专家']);
    await menu.getByRole('button', { name: '删除专家' }).click();
    const confirm = modal(page, '删除专家');
    await confirm.waitFor();
    assert.ok(await isCentered(page, confirm), '确认框居中');
    assert.match(await textOf(confirm), /确认删除这位专家/);
    assert.deepEqual(await confirm.locator('footer button').allInnerTexts(), ['取消', '删除专家']);
    assert.ok(await isRed(dialogButton(confirm, '删除专家')), '删除按钮是红色');
    // 右上角“×”叫“关闭”，不和确认按钮同名：读屏按名字找按钮时分得清哪个是关、哪个是删。
    assert.equal(await confirm.getByRole('button', { name: '删除专家', exact: true }).count(), 1, '只有确认按钮叫“删除专家”');
    assert.equal(await confirm.locator('header button').getAttribute('aria-label'), '关闭');
    await dialogButton(confirm, '删除专家').click();
    const done = toast(page, `已删除专家「${name}」`, 'success');
    await done.waitFor();
    await assertTopRight(page, done);
    await confirm.waitFor({ state: 'detached' });
    await pane(page, name).waitFor({ state: 'detached' });
    assert.deepEqual(await counts(page), { total: before.total - 1, builtin: before.builtin, custom: before.custom - 1 });
    assert.ok(!(await libraryShown(page)).includes(name), '专家库里没有它了');
    await until(() => storedExperts(dsh.home)[id]?.deleted === true, '专家文件里标为已删除');
    // 找回
    const settings = await openSettings(page);
    assert.match(await textOf(settings.locator('.ww-deleted-experts > strong')), /^已删除的专家 \(\d+\)$/);
    const row = settings.locator('.ww-deleted-experts .ww-row').filter({ hasText: name });
    await nextToast(page, () => row.getByRole('button', { name: '恢复专家', exact: true }).click(), `已找回专家「${name}」`, 'success');
    await until(() => storedExperts(dsh.home)[id]?.deleted === false, '专家文件里不再标为已删除');
    assert.deepEqual(await counts(page), before, '找回后专家库又多一位');
    assert.ok((await libraryNamesIn(page, '我建的')).includes(name));
  });
});

// EXP-14 反例；需求§界面通用约定（确认框“取消 + 确认”）
test('反例：删除自定义专家时点“取消”，专家还在、没有删除提示，专家文件不变', async t => {
  await withPage(browser, t, async ({ page }) => {
    const actions = trackExpertActions(page);
    await openExperts(page);
    const name = await createBlankExpert(page, `鲸翼测试-EXP14-${suffix()}`);
    const before = await counts(page), stored = expertsFileText(dsh.home);
    await library(page).getByRole('button', { name: `打开${name}`, exact: true }).click();
    const menu = await openMenu(page, name);
    await menu.getByRole('button', { name: '删除专家' }).click();
    const confirm = modal(page, '删除专家');
    await confirm.waitFor();
    await dialogButton(confirm, '取消').click();
    await confirm.waitFor({ state: 'detached' });
    assert.ok(await pane(page, name).isVisible(), '中间一栏还是它');
    assert.equal(await toast(page, '删除').count(), 0, '没有删除提示');
    assert.ok(!actions.includes('remove'), '没有发出删除请求');
    assert.deepEqual(await counts(page), before);
    assert.ok((await libraryNamesIn(page, '我建的')).includes(name));
    assert.equal(expertsFileText(dsh.home), stored, '专家文件没变');
    assert.equal(storedByName(dsh.home, name).deleted, false);
  });
});

// ======================= 专家详情 =======================

// EXP-25 需求§专家团队·专家详情（中间一栏标题行的“详情”打开右侧抽屉，分概况、记忆、定时任务三页；“＋ 加定时任务”切到定时任务页并打开新建抽屉，专家已选好；右上角“编辑专家”打开原来的编辑抽屉）；需求§专家团队·记忆
test('中间标题行的“详情”打开专家详情：概况 / 记忆 / 定时任务；记忆页写两条规矩“保存修改”后右上角说明、没写日期的补上今天、个人知识里有这篇；改了没保存就关先确认；“＋ 加定时任务”切到定时任务页、专家已选好；“编辑专家”打开编辑抽屉', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openExperts(page);
    const role = roles.find(item => item.id === 'development');
    const note = path.join(dsh.vault, '00-系统', '专家记忆', `${role.name}.md`);
    try {
      await openExpert(page, role.name);
      await pane(page, role.name).getByRole('button', { name: '详情', exact: true }).click();
      const detail = detailDrawer(page, role.name);
      await detail.waitFor();
      assert.deepEqual(await detail.getByRole('tab').allInnerTexts(), ['概况', '记忆', '定时任务']);
      assert.equal(await detail.getByRole('tab', { name: '概况' }).getAttribute('aria-selected'), 'true', '先看概况');
      assert.ok(await detail.locator('header').getByRole('button', { name: '编辑专家', exact: true }).isVisible(), '右上角“编辑专家”');
      assert.equal(await textOf(detail.locator('.ww-expert-detail-body > p').first()), role.description);
      assert.match(await textOf(detail.locator('.ww-task-facts')), new RegExp(`技能 ${role.skills.length} 项`));
      // 记忆
      await detail.getByRole('tab', { name: '记忆' }).click();
      const rules = detail.getByRole('textbox', { name: /规矩/ });
      await rules.waitFor();
      await until(async () => await rules.isEnabled(), '记忆读好');
      await rules.fill('鲸翼测试-EXP25 先写测试再改代码\n2026-11-01 鲸翼测试-EXP25 提交前跑一遍单元测试');
      await nextToast(page, () => dialogButton(detail, '保存修改').click(), `已保存${role.name}的记忆`, 'success');
      await until(async () => await rules.inputValue() === `${today()} 鲸翼测试-EXP25 先写测试再改代码\n2026-11-01 鲸翼测试-EXP25 提交前跑一遍单元测试`, '没写日期的那条补上今天，写了的保留');
      const text = await until(() => fs.existsSync(note) && fs.readFileSync(note, 'utf8'), `个人知识里出现 ${note}`);
      assert.match(text, /expert: "development"/, '属性里写着是哪位专家');
      assert.ok(text.includes(`- ${today()} 鲸翼测试-EXP25 先写测试再改代码`), '规矩一节写进笔记');
      // 改了没保存就点 ×：先确认放弃
      await rules.fill('鲸翼测试-EXP25 没保存的一条');
      await detail.locator('header').getByRole('button', { name: '关闭专家编辑' }).click();
      const discard = modal(page, '放弃修改');
      await discard.waitFor();
      assert.ok(await isCentered(page, discard));
      await dialogButton(discard, '取消').click();
      await discard.waitFor({ state: 'detached' });
      assert.equal(await rules.inputValue(), '鲸翼测试-EXP25 没保存的一条', '点“取消”后草稿还在');
      await detail.getByRole('tab', { name: '概况' }).click();
      await detail.locator('header').getByRole('button', { name: '关闭专家编辑' }).click();
      await dialogButton(modal(page, '放弃修改'), '放弃修改').click();
      await detail.waitFor({ state: 'detached' });
      // 编辑专家
      await pane(page, role.name).getByRole('button', { name: '详情', exact: true }).click();
      await detail.waitFor();
      await detail.locator('header').getByRole('button', { name: '编辑专家', exact: true }).click();
      const editor = drawer(page, '编辑专家');
      await editor.waitFor();
      assert.equal(await nameField(editor).inputValue(), role.name, '打开原来的编辑抽屉');
      await discardDrawer(page, editor, '取消编辑');
      // 定时任务
      await pane(page, role.name).getByRole('button', { name: '详情', exact: true }).click();
      await detail.waitFor();
      await detail.getByRole('tab', { name: '定时任务' }).click();
      assert.match(await textOf(detail.locator('.ww-expert-detail-body')), /还没有定时任务/);
      await detail.getByRole('button', { name: '加定时任务' }).click();
      const taskEditor = page.locator('.ww-task-editor');
      await taskEditor.waitFor();
      assert.equal(await page.locator('.ww-workbench-header button[data-tab][aria-pressed=true]').innerText().then(value => value.trim()), '定时任务', '切到定时任务页');
      assert.equal(await taskEditor.getByRole('combobox', { name: /交给哪位专家/ }).inputValue(), role.id, '交给哪位专家已选好');
      await taskEditor.getByRole('button', { name: '放弃任务草稿' }).click();
      const drop = modal(page, '放弃任务草稿');
      await Promise.race([drop.waitFor(), taskEditor.waitFor({ state: 'detached' })]);
      if (await drop.isVisible()) await dialogButton(drop, '放弃任务草稿').click();
      await taskEditor.waitFor({ state: 'detached' });
      // 回到专家团队：标题行写记忆条数
      await openTab(page, '专家团队');
      await pane(page, role.name).getByRole('button', { name: '记忆 2 条', exact: true }).waitFor();
      assert.deepEqual(errors, []);
    } finally {
      // 清空这位专家的记忆；清理出错不盖掉上面真正的失败原因。
      if (fs.existsSync(note)) {
        await (async () => {
          await page.keyboard.press('Escape');
          await openTab(page, '专家团队');
          if (!(await pane(page, role.name).isVisible())) await openExpert(page, role.name);
          await clearMemory(page, role.name);
        })().catch(error => t.diagnostic(`清空${role.name}的记忆没做完：${error.message.split('\n')[0]}`));
      }
    }
  });
});

// EXP-25 需求§专家团队·专家页（标题行右边“记忆 N 条”）
test('在详情里保存记忆后，中间标题行马上写“记忆 N 条”，不用切走再回来', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openExperts(page);
    const name = '写作专家';
    await openExpert(page, name);
    try {
      await pane(page, name).getByRole('button', { name: '详情', exact: true }).click();
      const detail = detailDrawer(page, name);
      await detail.getByRole('tab', { name: '记忆' }).click();
      const rules = detail.getByRole('textbox', { name: /规矩/ });
      await until(async () => await rules.isEnabled(), '记忆读好');
      await rules.fill('鲸翼测试-EXP25 标题不超过二十个字');
      await nextToast(page, () => dialogButton(detail, '保存修改').click(), `已保存${name}的记忆`, 'success');
      await closeDetail(page, detail);
      await pane(page, name).getByRole('button', { name: '记忆 1 条', exact: true }).waitFor({ timeout: 3000 });
    } finally {
      await clearMemory(page, name).catch(error => t.diagnostic(`清空${name}的记忆没做完：${error.message.split('\n')[0]}`));
    }
  });
});
