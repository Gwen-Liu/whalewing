import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDsh, removeTree } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, textOf, toast, drawer, modal, dialogButton, isCentered, isRed, scratchFiles, discardDrawer } from '../support/browser.mjs';
import { png, pngSize, animatedGif, templateText, expertsFileText, storedExperts, storedByName } from '../support/experts-fixture.mjs';
import { roles, expertTemplates } from '../../content/roles.js';

// 需求§专家团队·内置专家：小鲸领头，其余九位依次排开。
const builtinNames = ['小鲸助手', '产品专家', '设计专家', '研发专家', '测试专家', '运维专家', '数据专家', '研究专家', '写作专家', '运营专家'];
// 需求§专家模板·随包模板库：按名称拼音排序。
const templateNames = ['财务专家', '法务专家', '翻译专家', '课程专家', '实施专家', '视频编导', '售前专家', '效率教练', '学习教练', '招聘专家'];

let dsh, browser, files;
before(async () => { dsh = await startDsh(); browser = await launchBrowser(); files = scratchFiles('whalewing-e2e-experts-'); });
after(async () => { await browser?.close(); await dsh?.stop(); if (files) removeTree(files.dir); });

const suffix = () => Math.random().toString(16).slice(2, 6);
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

/** 记下专家管理接口收到的动作（save、remove、restore……）。 */
function trackExpertActions(page) {
  const actions = [];
  page.on('request', request => {
    if (!request.url().includes('/api/whalewingExperts/manage')) return;
    try { actions.push(JSON.parse(request.postData()).payload.args.input.action); } catch { actions.push('无法解析'); }
  });
  return actions;
}

const grid = page => page.locator('.ww-experts .ww-expert-grid');
const card = (page, name) => grid(page).locator(':scope > article').filter({ has: page.locator('h2', { hasText: new RegExp(`^${escape(name)}$`) }) });
const cardNames = page => grid(page).locator(':scope > article h2').allInnerTexts();
const summary = page => textOf(page.locator('.ww-experts .ww-pagehead p'));

/** 页头摘要“N 位专家 · 其中 M 位是你建的”拆成数字。 */
async function counts(page) {
  const text = await summary(page);
  const match = text.match(/^(\d+) 位专家(?: · 其中 (\d+) 位是你建的)?/);
  assert.ok(match, `页头摘要的格式：${text}`);
  return { total: Number(match[1]), custom: Number(match[2] ?? 0) };
}

async function openExperts(page) {
  await openWhaleWing(page, dsh.url);
  await grid(page).locator(':scope > article').first().waitFor();
}

/** 打开某位专家名帖右上角的“…”菜单，返回菜单浮层。 */
async function openMenu(page, name) {
  await page.getByRole('button', { name: `${name} · 专家操作`, exact: true }).click();
  const menu = page.getByRole('dialog', { name: `${name} · 专家操作`, exact: true });
  await menu.waitFor();
  return menu;
}

async function closeMenu(page, menu) {
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
}

/** 点“＋ 添加专家”，等抽屉里的技能目录和模板都读好。 */
async function openAddDrawer(page) {
  await grid(page).locator(':scope > .ww-add-card').click();
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
const checkedSkills = editor => skillSection(editor).locator('label.ww-choice').evaluateAll(labels => labels.filter(label => label.querySelector('input').checked).map(label => label.querySelector('span').firstChild.textContent));
/** 抽屉里列出的、本机装了的技能名（没装的绑定会标“当前目录未发现”）。 */
const installedSkills = editor => skillSection(editor).locator('label.ww-choice').evaluateAll(labels => labels.filter(label => !label.querySelector('small')?.textContent.includes('当前目录未发现')).map(label => label.querySelector('span').firstChild.textContent));
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
  await card(page, name).waitFor();
  await until(() => storedByName(dsh.home, name), `专家文件里出现“${name}”`);
  return name;
}

// 需求§专家团队·专家页、内置专家；需求§界面通用约定（宋体只用于页标题和对象名、加号卡片）
test('专家页：小鲸领头占一整行，其余九位内置专家依次排开，名帖信息齐全，末尾是虚线“＋ 添加专家”', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openExperts(page);
    assert.equal(await textOf(page.locator('.ww-experts .ww-pagehead h2')), '专家团队');
    assert.match(await summary(page), new RegExp(`^${builtinNames.length} 位专家`));
    assert.deepEqual(roles.map(role => role.name), builtinNames, '随包角色定义和需求的内置名单一致');
    assert.deepEqual(await cardNames(page), builtinNames);
    const lead = grid(page).locator(':scope > article[data-lead]');
    assert.equal(await textOf(lead.locator('h2')), '小鲸助手');
    const [leadBox, gridBox] = [await lead.boundingBox(), await grid(page).boundingBox()];
    assert.ok(leadBox.width >= gridBox.width - 2, `小鲸占满一整行（${leadBox.width} / ${gridBox.width}）`);
    for (const role of roles) {
      const item = card(page, role.name);
      assert.ok(await item.locator('img.ww-avatar').isVisible(), `${role.name}有头像`);
      assert.match(await item.locator('h2').evaluate(element => getComputedStyle(element).fontFamily), /serif|song/i, `${role.name}的名字用宋体`);
      assert.equal(await textOf(item.locator(':scope > p')), role.description, `${role.name}的介绍`);
      assert.equal(await textOf(item.locator('.ww-expert-meta')), `${role.skills.length} 项技能`, `${role.name}的技能数`);
      assert.ok(await item.getByRole('button', { name: '开始新任务' }).isVisible(), `${role.name}有“开始新任务”`);
    }
    const last = grid(page).locator(':scope > *').last();
    assert.match(await textOf(last), /添加专家/);
    assert.equal(await last.evaluate(element => getComputedStyle(element).borderTopStyle), 'dashed', '添加卡片是虚线框');
    // 右上“可选设置”：DSH 模式、工作区、是否纳入知识沉淀。
    await page.getByRole('button', { name: '可选设置', exact: true }).click();
    const options = page.getByRole('dialog', { name: '可选设置' });
    await options.waitFor();
    assert.ok(await options.getByRole('combobox', { name: 'DSH 模式' }).isVisible());
    await options.locator('summary', { hasText: '可选设置' }).click();
    assert.ok(await options.getByRole('textbox', { name: '工程绝对路径（可选）' }).isVisible());
    assert.ok(await options.getByRole('combobox', { name: '使用已有工作区' }).isVisible());
    assert.ok(await options.getByRole('checkbox', { name: '将本次新任务纳入我的知识沉淀' }).isVisible());
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// 需求§专家模板（售前、实施 2026-10-23 起改为模板；随包模板库按名称拼音排序）
test('售前、实施不再是内置专家，只在“从模板开始”里；模板按名称拼音排序', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openExperts(page);
    const names = await cardNames(page);
    assert.ok(!names.includes('售前专家') && !names.includes('实施专家'), `专家网格：${names.join('、')}`);
    assert.deepEqual(expertTemplates.map(item => item.name), templateNames, '随包模板库和需求的模板名单一致');
    const editor = await openAddDrawer(page);
    const options = await templateSelect(editor).locator('option').allInnerTexts();
    assert.equal(options[0], '空白专家');
    assert.deepEqual(options.slice(1).map(text => text.split(' · ')[0]), templateNames);
    await discardDrawer(page, editor, '取消编辑');
  });
});

// 需求§专家团队·自定义与配置（内置专家可以编辑、不能删除；“恢复原版”只在有改动时出现）
test('反例：内置专家不能删除，“…”菜单只有“编辑专家”，没改过时也没有“恢复原版”', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openExperts(page);
    const before = await counts(page);
    for (const role of roles) {
      const menu = await openMenu(page, role.name);
      assert.deepEqual(await menu.getByRole('button').allInnerTexts(), ['编辑专家'], `${role.name}的菜单`);
      await closeMenu(page, menu);
    }
    assert.deepEqual(await counts(page), before);
    assert.deepEqual(await cardNames(page), builtinNames);
  });
});

// 需求§专家团队·内置专家（默认绑定技能）
test('每位内置专家名帖上的技能数，等于编辑抽屉里勾选的技能数', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openExperts(page);
    for (const role of roles) {
      const shown = Number((await textOf(card(page, role.name).locator('.ww-expert-meta'))).match(/^(\d+) 项技能$/)[1]);
      const menu = await openMenu(page, role.name);
      await menu.getByRole('button', { name: '编辑专家' }).click();
      const editor = drawer(page, '编辑专家');
      await editor.waitFor();
      await dialogButton(editor, '保存修改').and(page.locator(':enabled')).waitFor();
      assert.equal(await textOf(skillSection(editor).locator('summary')), `Skills · 可选 (${shown})`, `${role.name}抽屉里的技能数`);
      assert.equal((await checkedSkills(editor)).length, shown, `${role.name}勾选的技能数`);
      await discardDrawer(page, editor, '取消编辑');
    }
  });
});

// 需求§专家模板·从模板创建；需求§界面通用约定（编辑用右侧抽屉、结果用右上角提示）
test('从“学习教练”模板创建自定义专家：表单按模板填好，创建后出现名帖、摘要多一位你建的，专家文件里有它', async t => {
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
    const names = await cardNames(page);
    assert.equal(names.at(-1), name, '新名帖排在“＋ 添加专家”前面');
    assert.match(await textOf(card(page, name)), /自定义/);
    assert.deepEqual(await counts(page), { total: before.total + 1, custom: before.custom + 1 });
    const record = await until(() => storedByName(dsh.home, name), '专家文件里出现新专家');
    assert.equal(record.builtin, false); assert.equal(record.deleted, false);
    assert.equal(record.description, template.description);
    assert.equal(record.prompt, template.prompt.trim());
    assert.equal(record.avatar, avatar);
    assert.deepEqual([...record.skills].sort(), [...expected].sort(), '只存了本机装了的技能');
    assert.deepEqual(errors, []);
  });
});

// 需求§专家团队·自定义与配置；界面标签“系统提示词（必填）”
test('反例：系统提示词为空时不创建，右上角说明要填提示词，专家数和专家文件都不变', async t => {
  await withPage(browser, t, async ({ page }) => {
    const actions = trackExpertActions(page);
    await openExperts(page);
    const before = await counts(page), names = await cardNames(page), stored = expertsFileText(dsh.home);
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
    assert.deepEqual(await cardNames(page), names);
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

// 需求§专家模板·从模板创建（导入模板文件；只保留当前装了的技能，跳过的在右上角提示）
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
    assert.deepEqual(await counts(page), before, '导入只填表单，专家数不变');
    assert.ok(!actions.includes('save'));
    await discardDrawer(page, editor, '取消编辑');
    assert.equal(storedByName(dsh.home, name), undefined, '专家文件里没有它');
  });
});

// 需求§专家模板（不认识的字段、格式不对的文件直接拒收并说明原因）
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

// 需求§专家模板·从模板创建（选回“空白专家”清空模板填入的内容）
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

// 需求§专家团队·自定义与配置（内置专家可以编辑；“恢复原版”可以勾选只恢复哪几项）；决策 2026-10-15（按钮写“保存修改”）、2026-10-25
test('编辑内置专家“测试专家”的介绍并保存，再用“恢复原版”只恢复介绍，名帖和专家文件都回到原文', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openExperts(page);
    const role = roles.find(item => item.id === 'testing'), changed = `鲸翼测试-EXP09 介绍 ${suffix()}`;
    const description = card(page, role.name).locator(':scope > p');
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
    assert.deepEqual(await menu.getByRole('button').allInnerTexts(), ['编辑专家', '恢复原版']);
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
    assert.deepEqual(await menu.getByRole('button').allInnerTexts(), ['编辑专家'], '恢复后“恢复原版”消失');
    await closeMenu(page, menu);
    assert.deepEqual(errors, []);
  });
});

// 需求§专家团队·自定义与配置（12 个预置插画；上传静态 PNG、JPEG、WebP，不超过 512 KiB，宽高都小于 300 像素）
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
    assert.match(await card(page, name).locator('img.ww-avatar').getAttribute('src'), /^data:image\/png;base64,/);
  });
});

// 需求§专家团队·自定义与配置（头像不超过 512 KiB、宽高都小于 300 像素、只收静态 PNG/JPEG/WebP）
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

// 需求§专家团队·自定义与配置（可以删除自定义专家）；需求§界面通用约定（删除用居中确认框、确认按钮红色，结果用右上角提示）
test('删除自定义专家：居中确认框、确认按钮是红色，确认后名帖消失、摘要少一位，专家文件里标为已删除', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openExperts(page);
    const name = await createBlankExpert(page, `鲸翼测试-EXP13-${suffix()}`);
    const before = await counts(page), id = storedByName(dsh.home, name).id;
    const menu = await openMenu(page, name);
    assert.deepEqual(await menu.getByRole('button').allInnerTexts(), ['编辑专家', '删除专家']);
    await menu.getByRole('button', { name: '删除专家' }).click();
    const confirm = modal(page, '删除专家');
    await confirm.waitFor();
    assert.ok(await isCentered(page, confirm), '确认框居中');
    assert.match(await textOf(confirm), /确认删除这位专家/);
    assert.deepEqual(await confirm.locator('footer button').allInnerTexts(), ['取消', '删除专家']);
    assert.ok(await isRed(dialogButton(confirm, '删除专家')), '删除按钮是红色');
    await dialogButton(confirm, '删除专家').click();
    const done = toast(page, `已删除专家「${name}」`, 'success');
    await done.waitFor();
    await assertTopRight(page, done);
    await confirm.waitFor({ state: 'detached' });
    await card(page, name).waitFor({ state: 'detached' });
    assert.deepEqual(await counts(page), { total: before.total - 1, custom: before.custom - 1 });
    assert.ok(await page.getByRole('button', { name: /^已删除的专家 \(\d+\)$/ }).isVisible(), '页头出现“已删除的专家”菜单');
    await until(() => storedExperts(dsh.home)[id]?.deleted === true, '专家文件里标为已删除');
  });
});

// 需求§界面通用约定（确认框“取消 + 确认”）
test('反例：删除自定义专家时点“取消”，专家还在、没有删除提示，专家文件不变', async t => {
  await withPage(browser, t, async ({ page }) => {
    const actions = trackExpertActions(page);
    await openExperts(page);
    const name = await createBlankExpert(page, `鲸翼测试-EXP14-${suffix()}`);
    const before = await counts(page), stored = expertsFileText(dsh.home);
    const menu = await openMenu(page, name);
    await menu.getByRole('button', { name: '删除专家' }).click();
    const confirm = modal(page, '删除专家');
    await confirm.waitFor();
    await dialogButton(confirm, '取消').click();
    await confirm.waitFor({ state: 'detached' });
    assert.ok(await card(page, name).isVisible(), '名帖还在');
    assert.equal(await toast(page, '删除').count(), 0, '没有删除提示');
    assert.ok(!actions.includes('remove'), '没有发出删除请求');
    assert.deepEqual(await counts(page), before);
    assert.equal(expertsFileText(dsh.home), stored, '专家文件没变');
    assert.equal(storedByName(dsh.home, name).deleted, false);
  });
});

// 需求§专家团队·入口与会话（每次任务是一个独立的 DSH 会话）；兼容（原版专家选择在输入框左侧）
test('“开始新任务”打开新会话，输入框左侧选中这位专家，输入框是空的，没有发出任何消息', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const sent = await guardSend(page);
    const created = [];
    page.on('request', request => { if (request.url().includes('/api/session/create')) created.push(request.url()); });
    await openExperts(page);
    created.length = 0; // DSH 打开时自己会备一个空白会话，只数点“开始新任务”之后的
    await card(page, '测试专家').getByRole('button', { name: '开始新任务' }).click();
    const input = page.locator('[data-composer-input]:visible');
    await input.waitFor();
    const picker = page.locator('.ww-expert-picker:visible .ww-picker-trigger');
    await picker.filter({ hasText: '测试专家' }).waitFor();
    assert.equal(created.length, 1, '建了一个新会话');
    assert.equal((await input.innerText()).trim(), '', '输入框是空的');
    const send = page.locator('button[aria-label="发送消息"]:visible');
    assert.equal(await send.isDisabled(), true, '没有内容，发送按钮不可用');
    const [pickerBox, inputBox, sendBox] = [await picker.boundingBox(), await input.boundingBox(), await send.boundingBox()];
    assert.ok(pickerBox.y >= inputBox.y && pickerBox.y <= sendBox.y + sendBox.height, '专家选择在输入框这一块里');
    assert.ok(pickerBox.x < sendBox.x && pickerBox.x < inputBox.x + inputBox.width / 2, '专家选择在输入框左侧');
    assert.equal(await page.locator('[data-chat-node-key]:visible').count(), 0, '会话里没有消息');
    assert.deepEqual(sent, [], '没有发出消息');
    assert.deepEqual(errors, []);
  });
});
