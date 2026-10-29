import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startDsh, removeTree } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, textOf, toast, drawer, modal, dialogButton, isCentered, isRed, discardDrawer } from '../support/browser.mjs';
import { bundledRoot, bundledSkills, skillsRoot, builtinFile, userSkillFile, skillText, seeded, seedSkills, userSkills, sessionIds, normalized } from '../support/skills-fixture.mjs';

// 需求§技能成长：随包技能共 93 项。
const shippedCount = 93;

let dsh, browser;
before(async () => { dsh = await startDsh({ seed: ({ home }) => seedSkills(home) }); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await dsh?.stop(); });

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const library = page => page.locator('section.ww-skill-library');
const rows = page => library(page).locator('.ww-skill-row');
/** 列表里名字正好是 name 的那一行；kind 是行里第二行开头的来源（系统内置、我的技能、系统技能的个人修改）。 */
const row = (page, name, kind) => rows(page).filter({ hasText: new RegExp(`^${escape(name)}(?![a-z0-9-])\\s*${kind ? escape(kind) : ''}`) });
const detail = page => library(page).locator('.ww-skill-detail');
const searchBox = page => library(page).getByRole('searchbox', { name: '查找技能' });
const chip = (page, label) => library(page).locator('.ww-skill-filters .ww-chip').filter({ hasText: label });
const chipCount = async (page, label) => Number((await chip(page, label).innerText()).split('\n').pop());
const identifier = editor => editor.locator('label', { hasText: '技能标识' }).locator('input');
const primary = editor => editor.locator('footer button.ww-primary');
/** 每一行：名字、来源、用途、所在分组。 */
const rowInfo = page => rows(page).evaluateAll(items => items.map(item => {
  let group = item.previousElementSibling;
  while (group && !group.classList.contains('ww-skill-group')) group = group.previousElementSibling;
  return { name: item.firstChild.textContent, kind: item.children[0]?.textContent.split(' · ')[0], description: item.querySelector('.ww-clamp')?.getAttribute('title') ?? '', group: group?.textContent };
}));

/** 反复读到期望值为止（界面重绘是异步的），超时就按最后一次读到的值报错。 */
async function settled(read, expected, message, timeout = 5_000) {
  for (const end = Date.now() + timeout; ;) {
    const actual = await read();
    try { assert.deepEqual(actual, expected, message); return; } catch (error) { if (Date.now() > end) throw error; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

/**
 * 做一个会弹出右上角提示的动作，等新的那条提示出来（每条新提示都是新元素，旧的会被换掉）。
 * 编辑抽屉开着时，提示上的“×”被抽屉挡着点不中，所以不先关旧提示，而是等旧的那条被换掉。
 */
async function nextToast(page, act, kind) {
  const previous = await page.$('.ww-toast');
  await act();
  if (previous) await previous.waitForElementState('hidden');
  const fresh = toast(page, null, kind);
  await fresh.waitFor();
  return fresh;
}

/** 等元素的进场动画播完，截图留证据时才看得清。 */
const animationsDone = locator => locator.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));

/** 磁盘上应该认出的技能数：随包系统技能，加上技能目录下一层的员工技能（含企业技能包和系统技能的个人修改）。 */
const expectedTotal = () => bundledSkills.length + userSkills(dsh.home).length;

/** 进鲸翼的技能成长页签，等技能清单读回来，核对数量和磁盘一致。返回总数。 */
async function openSkills(page) {
  await openWhaleWing(page, dsh.url);
  await openTab(page, '技能成长');
  await rows(page).first().waitFor();
  const expected = expectedTotal(), summary = await textOf(library(page).locator('.ww-pagehead p'));
  assert.match(summary, new RegExp(`^${expected} 项`), `技能数应为 ${expected}（随包 ${bundledSkills.length} + 下一层员工技能 ${userSkills(dsh.home).join('、')}），页头写着“${summary}”`);
  return expected;
}

/** 查找并选中一项技能，等右侧显示它的正文。 */
async function selectSkill(page, name, kind) {
  await searchBox(page).fill(name);
  await row(page, name, kind).click();
  await detail(page).locator('h3').first().filter({ hasText: new RegExp(`^${escape(name)}$`) }).waitFor();
}

// SKL-01 需求§技能成长（技能页一行查找和筛选，各带数量；列表按“我的、从知识提炼、系统内置”分组；选中后右侧看正文，正文铺满详情卡；页签和页标题都叫“技能成长”；随包 93 项）
test('页面叫“技能成长”，一行查找和筛选带数量，随包系统技能 93 项，按我的、系统内置分组，选中后右侧铺满正文', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const total = await openSkills(page);
    assert.equal(bundledSkills.length, shippedCount, '插件随包 93 项系统技能');
    assert.match(await textOf(page.locator('.ww-workbench-header button[data-tab][aria-pressed=true]')), /技能成长/);
    assert.equal(await textOf(library(page).locator('.ww-pagehead h2')), '技能成长');
    const mine = userSkills(dsh.home).length;
    assert.deepEqual(await library(page).locator('.ww-skill-filters .ww-chip').evaluateAll(chips => chips.map(item => item.firstChild.textContent)), ['全部', '我的', '提炼', '系统', '有更新', '待复核']);
    assert.equal(await chipCount(page, '全部'), total);
    assert.equal(await chipCount(page, '我的'), mine);
    assert.equal(await chipCount(page, '提炼'), 0);
    assert.equal(await chipCount(page, '系统'), shippedCount);
    assert.equal(await chipCount(page, '有更新'), 0);
    assert.equal(await chipCount(page, '待复核'), 0);
    const search = await searchBox(page).boundingBox(), lastChip = await chip(page, '待复核').boundingBox();
    assert.ok(lastChip.y < search.y + search.height && lastChip.y + lastChip.height > search.y, '查找框和筛选在同一行');
    assert.deepEqual(await library(page).locator('.ww-skill-group').allInnerTexts(), ['我的', '系统内置']);
    const info = await rowInfo(page);
    assert.equal(info.length, total);
    assert.deepEqual(info.filter(item => item.group === '系统内置').map(item => item.name).sort(), bundledSkills);
    assert.deepEqual(info.filter(item => item.group === '我的').map(item => item.name).sort(), userSkills(dsh.home));
    await library(page).getByText('选择技能查看正文与来源').waitFor();
    await selectSkill(page, 'whalewing-writing', '系统内置');
    const card = detail(page), body = card.locator('pre');
    assert.equal(normalized(await body.innerText()), normalized(fs.readFileSync(builtinFile(dsh.home, 'whalewing-writing'), 'utf8')), '右侧是这项技能的正文');
    await card.getByRole('button', { name: '编辑技能' }).waitFor();
    const inner = await card.evaluate(element => { const style = getComputedStyle(element); return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight); });
    assert.ok((await body.boundingBox()).width >= inner - 2, '正文铺满详情卡');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// SKL-03 需求§技能成长（一行查找：名字或用途）
test('按名字或用途查找技能', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openSkills(page);
    const all = await rowInfo(page);
    for (const query of ['测试', 'web-testing']) {
      const expected = all.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase())).map(item => item.name);
      assert.ok(expected.length > 0, `有名字或用途含“${query}”的技能`);
      await searchBox(page).fill(query);
      await settled(async () => (await rowInfo(page)).map(item => item.name), expected, `查“${query}”`);
    }
    assert.ok((await rowInfo(page)).some(item => item.name === 'whalewing-web-testing'), '按名字查得到');
    await searchBox(page).fill('');
    await settled(() => rows(page).count(), all.length, '清空后恢复全部');
    assert.deepEqual(errors, []);
  });
});

// SKL-04 需求§技能成长（查找和筛选）；空状态文案以界面为准
test('查找或筛选没有结果时说明没找到', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const total = await openSkills(page);
    const empty = library(page).locator('.ww-skill-list').getByRole('status').filter({ hasText: '没有匹配的技能' });
    await searchBox(page).fill('鲸翼测试不存在的技能zzz');
    await empty.waitFor();
    assert.equal(await rows(page).count(), 0);
    await searchBox(page).fill('');
    await settled(() => rows(page).count(), total);
    assert.equal(await chipCount(page, '提炼'), 0);
    await chip(page, '提炼').click();
    await empty.waitFor();
    assert.equal(await rows(page).count(), 0);
    await chip(page, '全部').click();
    await settled(() => rows(page).count(), total);
    assert.deepEqual(errors, []);
  });
});

// SKL-05 需求§技能成长（技能文件放在 ~/.dsh/skills；员工可以新建自己的技能，不需要先开会话）；需求§界面通用约定（编辑用右侧抽屉，成功右上角提示）；需求§数据与隐私（写入后回读）
test('新增个人技能：不用开会话，保存后列在“我的”，磁盘上写进技能目录', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const name = 'ww-e2e-skl05', content = skillText(name, '鲸翼测试 SKL05：核对发布清单时使用', '# 步骤\n\n1. 逐项核对发布清单。\n2. 缺的项写进备注。\n');
    await openSkills(page);
    const mine = await chipCount(page, '我的'), sessions = sessionIds(dsh.home);
    await library(page).getByRole('button', { name: '新增技能' }).click();
    const editor = drawer(page, '新增技能');
    await editor.waitFor();
    const box = await editor.boundingBox();
    assert.ok(page.viewportSize().width - (box.x + box.width) <= 16, '从右侧滑出的抽屉');
    await identifier(editor).fill(name);
    await editor.locator('textarea').fill(content);
    await primary(editor).click();
    await editor.waitFor({ state: 'detached' });
    await toast(page, '已保存', 'success').waitFor();
    await settled(() => chipCount(page, '我的'), mine + 1, '“我的”多一项');
    await searchBox(page).fill(name);
    assert.deepEqual((await rowInfo(page)).map(({ name: item, kind, group }) => [item, kind, group]), [[name, '我的技能', '我的']]);
    assert.equal(await textOf(detail(page).locator('h3').first()), name);
    assert.equal(fs.readFileSync(userSkillFile(dsh.home, name), 'utf8'), content, '磁盘上的技能文件和填写的一致');
    assert.deepEqual(sessionIds(dsh.home), sessions, '没有为此开会话');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// SKL-05、SKL-07 需求§界面通用约定（编辑技能从右侧滑出同一种抽屉，底部固定操作按钮；按钮写具体动作“保存修改”“创建专家”“添加”，不写“保存专家”这类笼统说法）
test('新增和编辑技能的抽屉，底部按钮写具体动作', async t => {
  await withPage(browser, t, async ({ page, shot }) => {
    await openSkills(page);
    const check = async (title, pattern) => {
      const editor = drawer(page, title);
      await editor.waitFor();
      const box = await editor.boundingBox(), footer = await editor.locator('footer').boundingBox();
      assert.ok(page.viewportSize().width - (box.x + box.width) <= 16, `“${title}”从右侧滑出`);
      assert.ok(box.y + box.height - (footer.y + footer.height) <= 32, `“${title}”的按钮在抽屉底部`);
      const label = await textOf(primary(editor));
      if (title === '新增技能') t.diagnostic(`截图：${await shot('新增技能按钮')}`);
      await discardDrawer(page, editor, '取消');
      assert.match(label, pattern, `“${title}”的主按钮写具体动作，实际是“${label}”`);
    };
    await library(page).getByRole('button', { name: '新增技能' }).click();
    await check('新增技能', /^(创建技能|添加技能|添加)$/);
    await selectSkill(page, 'whalewing-writing', '系统内置');
    await detail(page).getByRole('button', { name: '编辑技能' }).click();
    await check('编辑技能', /^保存修改$/);
  });
});

// SKL-06 界面提示“技能标识：使用简短的英文小写字母、数字或连字符，保存后保持不变”；需求§界面通用约定（失败右上角提示）
test('反例：技能标识为空时不保存，提示标识规则，已填内容保留', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const content = skillText('ww-e2e-skl06-empty', '鲸翼测试 SKL06：空标识');
    await openSkills(page);
    const mine = await chipCount(page, '我的'), onDisk = userSkills(dsh.home);
    await library(page).getByRole('button', { name: '新增技能' }).click();
    const editor = drawer(page, '新增技能');
    await editor.locator('textarea').fill(content);
    const message = await nextToast(page, () => primary(editor).click(), 'error');
    assert.match(await textOf(message), /英文.*连字符/, '提示标识规则');
    assert.ok(await editor.isVisible(), '抽屉保持打开');
    assert.equal(await editor.locator('textarea').inputValue(), content, '已填内容还在');
    assert.ok(await identifier(editor).isEnabled(), '标识还能填');
    await discardDrawer(page, editor, '取消');
    assert.equal(await chipCount(page, '我的'), mine);
    assert.deepEqual(userSkills(dsh.home), onDisk, '磁盘上没有多出技能');
    assert.deepEqual(errors, []);
  });
});

// SKL-06 界面提示“技能标识：使用简短的英文小写字母、数字或连字符，保存后保持不变”；需求§界面通用约定（失败右上角提示）；决策 2026-10-13（报错说清原因）
test('反例：技能标识含中文或空格时不保存，说明标识规则，改成合法标识后能保存', async t => {
  // 两种填法都试：正文里的名称另取一个合法的（只有标识不合规），或者正文名称跟着写成这个标识。
  const attempts = ['中文技能', 'has space'].flatMap((id, index) => [
    { id, label: `标识“${id}”、正文名称另取合法的`, valid: `ww-e2e-skl06-${index}a`, name: `ww-e2e-skl06-${index}a` },
    { id, label: `标识“${id}”、正文名称也写成它`, valid: `ww-e2e-skl06-${index}b`, name: id },
  ]);
  const cleanup = () => { for (const { id, valid } of attempts) { removeTree(path.join(skillsRoot(dsh.home), id)); removeTree(path.join(skillsRoot(dsh.home), valid)); } };
  try {
    await withPage(browser, t, async ({ page, shot }) => {
      await openSkills(page);
      const results = [];
      for (const attempt of attempts) {
        await library(page).getByRole('button', { name: '新增技能' }).click();
        const editor = drawer(page, '新增技能');
        await identifier(editor).fill(attempt.id);
        await editor.locator('textarea').fill(skillText(attempt.name, '鲸翼测试 SKL06：标识不合规'));
        // 等这次保存出结果：保存了会关上抽屉并提示成功，被拒会弹出失败提示；两种都是一条新提示。
        const message = await nextToast(page, () => primary(editor).click());
        if (!results.length) { await animationsDone(message); t.diagnostic(`截图：${await shot('中文标识')}`); }
        const result = { label: attempt.label, created: fs.existsSync(path.join(skillsRoot(dsh.home), attempt.id)), kept: await editor.isVisible() };
        if (result.kept) {
          result.message = await textOf(toast(page).locator('.ww-toast-text'));
          result.editable = await identifier(editor).isEnabled();
          if (result.editable) {
            // 改成合法标识（正文名称跟着改）再保存。
            await identifier(editor).fill(attempt.valid);
            await editor.locator('textarea').fill(skillText(attempt.valid, '鲸翼测试 SKL06：改好的标识'));
            await primary(editor).click();
            await editor.waitFor({ state: 'detached' });
            await toast(page, '已保存', 'success').waitFor();
            result.fixed = fs.existsSync(userSkillFile(dsh.home, attempt.valid));
          } else {
            await discardDrawer(page, editor, '取消');
          }
        }
        results.push(result);
        // 每次试完把可能建出来的目录删掉，下一次从同样的状态开始。
        cleanup();
      }
      t.diagnostic(results.map(item => `${item.label}：${item.created ? '保存了，磁盘上多出这个目录' : `被拒，提示“${item.message}”，标识框${item.editable ? '能改' : '被锁住'}`}`).join('；'));
      assert.deepEqual(results.filter(item => item.created).map(item => item.label), [], '标识不合规时技能目录里不应多出目录');
      for (const item of results) {
        assert.ok(item.kept, `${item.label}：抽屉保持打开`);
        assert.match(item.message, /英文|连字符/, `${item.label}：提示说明标识规则，实际是“${item.message}”`);
        assert.doesNotMatch(item.message, /[A-Z]{2,}_[A-Z]{2,}/, `${item.label}：提示不带内部错误码`);
        assert.ok(item.editable && item.fixed, `${item.label}：被拒后能改成合法标识并保存`);
      }
    });
  } finally { cleanup(); }
});

// SKL-06 需求§技能成长（技能需要名称、说明和正文）；决策 2026-10-13（报错说清原因、不写工程用语）；需求§界面通用约定（失败右上角提示）
test('反例：技能内容里的名称不合规时不保存，提示说清原因、不显示内部错误码，改好后能保存', async t => {
  const name = 'ww-e2e-skl06-c';
  try {
    await withPage(browser, t, async ({ page, shot }) => {
      await openSkills(page);
      const mine = await chipCount(page, '我的');
      await library(page).getByRole('button', { name: '新增技能' }).click();
      const editor = drawer(page, '新增技能');
      await identifier(editor).fill(name);
      const bad = skillText('Bad Name', '鲸翼测试 SKL06：名称有大写和空格');
      await editor.locator('textarea').fill(bad);
      const message = await nextToast(page, () => primary(editor).click(), 'error');
      assert.ok(await editor.isVisible(), '抽屉保持打开');
      assert.equal(await editor.locator('textarea').inputValue(), bad, '已填内容还在');
      assert.equal(fs.existsSync(path.join(skillsRoot(dsh.home), name)), false, '磁盘上没有写入');
      assert.equal(await chipCount(page, '我的'), mine);
      const text = await textOf(message.locator('.ww-toast-text'));
      await animationsDone(message);
      t.diagnostic(`截图：${await shot('名称不合规')}`);
      assert.doesNotMatch(text, /[A-Z]{2,}_[A-Z]{2,}/, `提示不应带内部错误码：${text}`);
      assert.match(text, /名称|名字/, `提示指出是名称的问题：${text}`);
      const good = skillText(name, '鲸翼测试 SKL06：改好的名称');
      await editor.locator('textarea').fill(good);
      await primary(editor).click();
      await editor.waitFor({ state: 'detached' });
      await toast(page, '已保存', 'success').waitFor();
      assert.equal(fs.readFileSync(userSkillFile(dsh.home, name), 'utf8'), good);
    });
  } finally { removeTree(path.join(skillsRoot(dsh.home), name)); }
});

// SKL-07 需求§技能成长（员工编辑系统技能会生成一份覆盖，重置就恢复原件）；决策 2026-10-23；需求§界面通用约定（重置用居中确认，成功右上角提示）
test('编辑系统技能生成个人修改，恢复系统原件后正文回到原件、个人修改移走', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const name = 'whalewing-writing', mark = '<!-- 鲸翼测试-SKL07 -->';
    const shipped = fs.readFileSync(path.join(bundledRoot, name, 'SKILL.md'), 'utf8');
    await openSkills(page);
    const mine = await chipCount(page, '我的');
    await selectSkill(page, name, '系统内置');
    await detail(page).getByRole('button', { name: '编辑技能' }).click();
    const editor = drawer(page, '编辑技能');
    await editor.waitFor();
    assert.match(await textOf(editor.locator('.ww-notice')), /系统原件保留.*个人修改/, '说明编辑会另存个人修改');
    const original = await editor.locator('textarea').inputValue();
    await editor.locator('textarea').fill(`${original.trimEnd()}\n\n${mark}\n`);
    await primary(editor).click();
    await editor.waitFor({ state: 'detached' });
    await toast(page, '已保存', 'success').waitFor();
    assert.ok((await detail(page).locator('pre').innerText()).includes(mark), '右侧显示改过的正文');
    await row(page, name, '系统技能的个人修改').waitFor();
    assert.equal(await chipCount(page, '我的'), mine + 1);
    const override = fs.readFileSync(userSkillFile(dsh.home, name), 'utf8');
    assert.ok(override.includes(mark) && /whalewingBuiltin/.test(override), '个人修改另存在技能目录下一层');
    assert.equal(fs.readFileSync(builtinFile(dsh.home, name), 'utf8'), shipped, '系统原件没被改');
    await detail(page).getByRole('button', { name: '恢复系统原件' }).click();
    const confirm = modal(page, '恢复系统原件');
    await confirm.waitFor();
    assert.ok(await isCentered(page, confirm), '确认框居中');
    assert.deepEqual(await confirm.locator('footer button').allInnerTexts(), ['取消', '恢复系统原件']);
    await dialogButton(confirm, '恢复系统原件').click();
    await confirm.waitFor({ state: 'detached' });
    await toast(page, '已恢复系统原件', 'success').waitFor();
    assert.equal(normalized(await detail(page).locator('pre').innerText()), normalized(shipped), '右侧回到系统原件');
    assert.equal(fs.existsSync(path.join(skillsRoot(dsh.home), name)), false, '个人修改从技能目录移走');
    assert.equal(fs.readFileSync(builtinFile(dsh.home, name), 'utf8'), shipped);
    await settled(() => row(page, name, '系统技能的个人修改').count(), 0);
    assert.equal(await chipCount(page, '我的'), mine);
    assert.deepEqual(errors, []);
  });
});

// SKL-08 需求§界面通用约定（重置用居中确认框，右下角“取消 + 确认”）
test('反例：恢复系统原件时点“取消”，个人修改还在', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const name = 'whalewing-clarify', mark = '<!-- 鲸翼测试-SKL08 -->';
    await openSkills(page);
    await selectSkill(page, name, '系统内置');
    await detail(page).getByRole('button', { name: '编辑技能' }).click();
    const editor = drawer(page, '编辑技能');
    const original = await editor.locator('textarea').inputValue();
    await editor.locator('textarea').fill(`${original.trimEnd()}\n\n${mark}\n`);
    await primary(editor).click();
    await editor.waitFor({ state: 'detached' });
    await toast(page, '已保存', 'success').waitFor();
    const saved = fs.readFileSync(userSkillFile(dsh.home, name), 'utf8');
    await detail(page).getByRole('button', { name: '恢复系统原件' }).click();
    const confirm = modal(page, '恢复系统原件');
    await confirm.waitFor();
    await dialogButton(confirm, '取消').click();
    await confirm.waitFor({ state: 'detached' });
    assert.equal(fs.readFileSync(userSkillFile(dsh.home, name), 'utf8'), saved, '个人修改原样还在');
    assert.ok((await detail(page).locator('pre').innerText()).includes(mark), '右侧仍是改过的正文');
    assert.equal(await row(page, name, '系统技能的个人修改').count(), 1);
    assert.equal(await toast(page, '已恢复系统原件').count(), 0);
    // 收尾：真的恢复原件，不影响后面的用例。
    await detail(page).getByRole('button', { name: '恢复系统原件' }).click();
    await confirm.waitFor();
    await dialogButton(confirm, '恢复系统原件').click();
    await toast(page, '已恢复系统原件', 'success').waitFor();
    assert.equal(fs.existsSync(path.join(skillsRoot(dsh.home), name)), false);
    assert.deepEqual(errors, []);
  });
});

// SKL-09 需求§技能成长（员工可以删除自己的技能）；需求§界面通用约定（删除居中确认、确认按钮红色、成功右上角提示）
test('删除个人技能：居中红色确认，删除后“我的”少一项，技能目录里也没有了', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const { name } = seeded.mine;
    await openSkills(page);
    const mine = await chipCount(page, '我的');
    await selectSkill(page, name, '我的技能');
    await detail(page).getByRole('button', { name: '删除用户技能' }).click();
    const confirm = modal(page, '删除技能');
    await confirm.waitFor();
    assert.ok(await isCentered(page, confirm), '确认框居中');
    assert.match(await textOf(confirm), /删除这项用户技能/);
    assert.deepEqual(await confirm.locator('footer button').allInnerTexts(), ['取消', '删除用户技能']);
    assert.ok(await isRed(dialogButton(confirm, '删除用户技能')), '确认按钮是红色');
    await dialogButton(confirm, '删除用户技能').click();
    await confirm.waitFor({ state: 'detached' });
    await toast(page, '已删除', 'success').waitFor();
    await settled(() => chipCount(page, '我的'), mine - 1, '“我的”少一项');
    assert.equal(await row(page, name).count(), 0, '列表里没有了');
    await library(page).getByText('选择技能查看正文与来源').waitFor();
    assert.equal(fs.existsSync(path.join(skillsRoot(dsh.home), name)), false, '技能目录里没有了');
    assert.deepEqual(errors, []);
  });
});

// SKL-11 需求§技能成长（企业技能包直接放在 ~/.dsh/skills 下一层，不管叫什么名字，技能库都能扫描、编辑、删除）；决策 2026-10-16、2026-10-19
test('企业技能包放在技能目录下一层：刷新就能扫到，能查看、编辑、删除', async t => {
  const later = 'ww-e2e-company-y';
  try {
    await withPage(browser, t, async ({ page, errors }) => {
      const { name, description } = seeded.company;
      await openSkills(page);
      assert.deepEqual((await rowInfo(page)).filter(item => item.name === name).map(({ kind, group }) => [kind, group]), [['我的技能', '我的']]);
      // DSH 运行中又放进来一个企业技能，点“…”里的“刷新”就扫到。
      fs.mkdirSync(path.join(skillsRoot(dsh.home), later));
      fs.writeFileSync(userSkillFile(dsh.home, later), skillText(later, '鲸翼测试企业技能包：运行中放进来的'));
      const total = expectedTotal();
      await page.locator('.ww-workbench-header').getByRole('button', { name: '更多操作' }).click();
      await page.locator('.ww-menu-surface:popover-open').getByRole('button', { name: '刷新' }).click();
      await library(page).locator('.ww-pagehead p', { hasText: new RegExp(`^${total} 项`) }).waitFor();
      await row(page, later, '我的技能').waitFor();
      // 查看
      await selectSkill(page, name, '我的技能');
      assert.equal(normalized(await detail(page).locator('pre').innerText()), normalized(skillText(name, description)));
      // 编辑
      await detail(page).getByRole('button', { name: '编辑技能' }).click();
      const editor = drawer(page, '编辑技能');
      const edited = `${(await editor.locator('textarea').inputValue()).trimEnd()}\n2. 鲸翼测试 SKL11 补充的一步。\n`;
      await editor.locator('textarea').fill(edited);
      await primary(editor).click();
      await editor.waitFor({ state: 'detached' });
      await toast(page, '已保存', 'success').waitFor();
      assert.equal(fs.readFileSync(userSkillFile(dsh.home, name), 'utf8'), edited, '改动写回企业技能包的文件');
      // 删除
      await detail(page).getByRole('button', { name: '删除用户技能' }).click();
      const confirm = modal(page, '删除技能');
      await dialogButton(confirm, '删除用户技能').click();
      await confirm.waitFor({ state: 'detached' });
      await toast(page, '已删除', 'success').waitFor();
      assert.equal(fs.existsSync(path.join(skillsRoot(dsh.home), name)), false, '企业技能包的目录移走了');
      assert.deepEqual(errors, []);
    });
  } finally { removeTree(path.join(skillsRoot(dsh.home), later)); }
});

// SKL-12 需求§技能成长（DSH 只扫 ~/.dsh/skills 下一层，再深一层的目录认不出来）；决策 2026-10-19
test('反例：再深一层的技能目录不被认出来，数量不变', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const { dir, name, description } = seeded.nested;
    const file = path.join(skillsRoot(dsh.home), dir, name, 'SKILL.md'), before = fs.readFileSync(file, 'utf8');
    const total = await openSkills(page);
    assert.equal(await chipCount(page, '全部'), total, '只算随包技能和下一层的技能');
    const info = await rowInfo(page);
    assert.equal(info.some(item => [name, dir].includes(item.name) || item.description === description), false, '列表里没有再深一层的技能');
    for (const query of [name, dir, '再深一层']) {
      await searchBox(page).fill(query);
      await library(page).locator('.ww-skill-list').getByRole('status').filter({ hasText: '没有匹配的技能' }).waitFor();
    }
    assert.equal(fs.readFileSync(file, 'utf8'), before, '这份文件原样留着，没被改动或删除');
    assert.deepEqual(errors, []);
  });
});
