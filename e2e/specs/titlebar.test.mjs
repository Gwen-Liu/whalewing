// 桌面版标题栏：各种弹层在小窗和大窗里都不压进窗口顶部，位置规则一致。
// 2026-10-27 用户：阅读器顶栏和抽屉的“×”只在小窗时被窗口按钮挡住，大窗没事；
// 只改小窗下的，大窗小窗位置要一致，不能大窗一个位置、小窗换一个位置——小窗时把显示区域稍微调小一点就能完全露出来。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDsh, removeTree } from '../support/dsh.mjs';
import { seedModelWorld } from '../support/world-fixture.mjs';
import { bookText, paragraphs } from '../support/cards-fixture.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, titlebarProblems, windowsTitlebar, scratchFiles, drawer } from '../support/browser.mjs';

let dsh, browser, files;
before(async () => {
  files = scratchFiles();
  [dsh, browser] = await Promise.all([startDsh({ seed: ({ home }) => seedModelWorld(home) }), launchBrowser()]);
});
after(async () => { await browser?.close(); await dsh?.stop(); if (files) removeTree(files.dir); });

const small = { width: 1280, height: 640 }, large = { width: 1920, height: 1080 };

/** 量弹层的位置：上下左右、有没有按钮落进标题栏，以及它是“居中”还是“贴着某个高度”。 */
async function measure(page, overlay) {
  await page.waitForFunction(element => { const box = element.getBoundingClientRect(); return box.height > 0; }, await overlay.elementHandle());
  // 等尺寸稳定（弹层有进场动画）。
  await overlay.evaluate(element => new Promise(resolve => { let last = ''; const check = () => { const box = element.getBoundingClientRect(), now = `${box.top},${box.height}`; if (now === last) resolve(); else { last = now; setTimeout(check, 80); } }; check(); }));
  const box = await overlay.evaluate(element => { const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }; });
  const { width, height } = page.viewportSize(), below = windowsTitlebar.height + 24;
  // 两种居中：在整个窗口里居中（高度上限已扣掉标题栏），或在标题栏下面、上下各留 24px 的区域里居中。
  const rule = Math.abs((box.top - below) - (height - 24 - box.bottom)) <= 2 ? '在标题栏下的区域里居中'
    : Math.abs(box.top - (height - box.bottom)) <= 2 ? '在整个窗口里居中' : `顶边 ${Math.round(box.top)}px`;
  return { ...box, width, height, rule, problems: await titlebarProblems(overlay.getByRole('button')) };
}

/** 小窗、大窗各量一次：按钮都不进标题栏，弹层顶边在标题栏下面，两种窗口用同一条位置规则。 */
async function checkBothSizes(page, overlay, name) {
  const results = {};
  for (const [label, size] of [['小窗', small], ['大窗', large]]) {
    await page.setViewportSize(size);
    const result = results[label] = await measure(page, overlay);
    assert.deepEqual(result.problems, [], `${name}（${label}）有按钮落进标题栏`);
    assert.ok(result.top >= windowsTitlebar.height, `${name}（${label}）顶边 ${Math.round(result.top)}px，压进了 ${windowsTitlebar.height}px 的标题栏`);
  }
  assert.equal(results.小窗.rule, results.大窗.rule, `${name}在小窗和大窗的位置规则不同：${results.小窗.rule} / ${results.大窗.rule}`);
  return results;
}

// 决策 2026-10-27（窗口最上面 40px 是拖动区域、右上角是窗口按钮）；用户 2026-10-27（小窗时缩小显示区域，大窗小窗位置一致）
test('电子书阅读器：小窗和大窗里顶栏的“目录”“字号”“关闭”都在标题栏下面，都是居中', async t => {
  const file = files.file('鲸翼测试标题栏.txt', bookText(['第一章 起点', '第二章 中段'].map(heading => [heading, paragraphs(heading, 40)]), { lead: '鲸翼测试标题栏\n作者：鲸翼测试' }));
  await withPage(browser, t, small, async ({ page }) => {
    await openWhaleWing(page, dsh.url, { desktop: true });
    await openTab(page, '知识卡片');
    await page.locator('.ww-learning:not(.ww-skeleton)').getByRole('button', { name: '打开书架' }).click();
    await page.locator('.ww-library input[type=file]').setInputFiles(file);
    await page.locator('.ww-toast').filter({ hasText: '已导入' }).waitFor({ timeout: 60_000 });
    await page.locator('.ww-library .ww-crumb', { hasText: '知识卡片' }).click();
    await page.locator('.ww-learning:not(.ww-skeleton)').getByRole('button', { name: /^读《鲸翼测试标题栏》/ }).click();
    const reader = page.getByRole('dialog', { name: '鲸翼测试标题栏' });
    await reader.getByRole('button', { name: '关闭', exact: true }).waitFor();
    const results = await checkBothSizes(page, reader, '阅读器');
    assert.notEqual(results.小窗.rule.startsWith('顶边'), true, `阅读器应居中：${results.小窗.rule}`);
    assert.ok(results.大窗.bottom - results.大窗.top <= 900 + 1, '大窗时高度仍是上限 900');
    assert.ok(results.小窗.bottom - results.小窗.top < results.大窗.bottom - results.大窗.top, '小窗时只是显示区域变矮');
  });
});

// 测试自检：把阅读器恢复成修复前只在 Mac 上让位的样子，小窗时检查必须报出问题。
test('反例：阅读器在小窗不让出标题栏时，检查能报出顶栏按钮压进标题栏', async t => {
  const file = files.file('鲸翼测试自检.txt', bookText(['第一章 起点'].map(heading => [heading, paragraphs(heading, 40)]), { lead: '鲸翼测试自检\n作者：鲸翼测试' }));
  await withPage(browser, t, small, async ({ page }) => {
    await openWhaleWing(page, dsh.url, { desktop: true });
    await openTab(page, '知识卡片');
    await page.locator('.ww-learning:not(.ww-skeleton)').getByRole('button', { name: '打开书架' }).click();
    await page.locator('.ww-library input[type=file]').setInputFiles(file);
    await page.locator('.ww-toast').filter({ hasText: '已导入' }).waitFor({ timeout: 60_000 });
    await page.locator('.ww-library-book[title="鲸翼测试自检"]').click();
    const reader = page.getByRole('dialog', { name: '鲸翼测试自检' });
    await reader.getByRole('button', { name: '关闭', exact: true }).waitFor();
    // 修复前 Windows 上没有让位：上边距只有 24px，高度上限只扣上下各 24px。
    await page.addStyleTag({ content: 'html[data-windows-titlebar] .ww-modal.ww-book[open]{top:24px!important;height:min(900px,calc(100dvh - 48px))!important;max-height:none!important}' });
    const result = await measure(page, reader);
    assert.ok(result.top < windowsTitlebar.height, `修复前的样子顶边应压进标题栏（${Math.round(result.top)}px）`);
    assert.ok(result.problems.some(problem => problem.includes('拖动窗口的区域')), result.problems.join('；'));
  });
});

// 需求§界面通用约定（编辑用右侧抽屉）；决策 2026-10-27
test('右侧抽屉：小窗和大窗里都从标题栏下面开始，右上角“×”不被窗口按钮挡住', async t => {
  await withPage(browser, t, small, async ({ page }) => {
    await openWhaleWing(page, dsh.url, { desktop: true });
    await page.locator('.ww-add-card', { hasText: '添加专家' }).click();
    const editor = drawer(page, '添加专家');
    await editor.waitFor();
    const results = await checkBothSizes(page, editor, '添加专家抽屉');
    assert.equal(Math.round(results.小窗.top), Math.round(results.大窗.top), '两种窗口里抽屉顶边一样');
    assert.equal(Math.round(results.小窗.width - results.小窗.right), Math.round(results.大窗.width - results.大窗.right), '右边距一样');
  });
});

// 需求§办公工坊；决策 2026-10-27
test('办公工坊窗口：小窗和大窗里都在标题栏下面，位置规则一致', async t => {
  await withPage(browser, t, small, async ({ page }) => {
    await openWhaleWing(page, dsh.url, { desktop: true });
    await openTab(page, '办公工坊');
    await page.getByRole('button', { name: '二维码：生成二维码', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '二维码', exact: true });
    await dialog.locator('.ww-tool-body h3', { hasText: '生成二维码' }).waitFor();
    await checkBothSizes(page, dialog, '办公工坊窗口');
  });
});

// 需求§模型世界；决策 2026-10-27
test('模型详情窗口：小窗和大窗里都在标题栏下面，位置规则一致', async t => {
  await withPage(browser, t, small, async ({ page }) => {
    await openWhaleWing(page, dsh.url, { desktop: true });
    await openTab(page, '模型世界');
    await page.getByPlaceholder('搜索模型或厂商').fill('DeepSeek V4 Flash');
    await page.getByRole('button', { name: '查找', exact: true }).click();
    const row = page.locator('.ww-mw-model-row').filter({ has: page.locator('strong', { hasText: /^DeepSeek V4 Flash$/ }) }).first();
    await row.hover();
    await row.getByRole('button', { name: '详情 DeepSeek V4 Flash' }).click();
    const dialog = page.locator('dialog.ww-mw-dialog[open]');
    await dialog.locator('h2', { hasText: 'DeepSeek V4 Flash' }).waitFor();
    await checkBothSizes(page, dialog, '模型详情窗口');
  });
});

// 需求§个人知识（检查属性与链接用居中弹窗）；需求§界面通用约定（确认用居中弹窗）；决策 2026-10-27
test('居中弹窗（知识检查）：小窗和大窗里都在标题栏下面，位置规则一致', async t => {
  await withPage(browser, t, small, async ({ page }) => {
    await openWhaleWing(page, dsh.url, { desktop: true });
    await openTab(page, '个人知识');
    await page.getByRole('button', { name: '知识库工具' }).click();
    await page.getByRole('dialog', { name: '知识库工具' }).getByRole('button', { name: '检查属性与链接', exact: true }).click();
    const dialog = page.locator('dialog.ww-modal[open]');
    await dialog.waitFor();
    await checkBothSizes(page, dialog, '知识检查弹窗');
  });
});
