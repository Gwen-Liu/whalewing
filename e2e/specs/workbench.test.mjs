// 工作台外壳：页头、“…”菜单、可选功能开关、重资源按需加载、窄窗口和桌面版标题栏。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDsh } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, resizeAndSettle, toast, titlebarProblems } from '../support/browser.mjs';
import { bundledSkills } from '../support/skills-fixture.mjs';

let dsh, browser;
before(async () => { dsh = await startDsh(); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await dsh?.stop(); });

// 页头只放钉住的常用页签（2026-11-13，默认这五个），模型世界固定在最右；AI 网页、每日阅读在“全部功能”里。
const pinnedTabs = ['专家团队', '知识积累', '技能中心', '定时任务', '办公工坊'];
const featureTabs = ['专家团队', 'AI 网页', '知识积累', '技能中心', '定时任务', '办公工坊', '每日阅读'];
const baseTabs = ['专家团队', '知识积累', '技能中心', '定时任务'];
const optional = ['AI 网页', '办公工坊', '每日阅读', '模型世界'];
const launcherGroups = [['做事', ['专家团队', 'AI 网页', '定时任务']], ['积累', ['知识积累', '技能中心']], ['办公', ['办公工坊']], ['资讯', ['每日阅读', '模型世界']]];

const header = page => page.locator('.ww-workbench-header');
/** 钉在页头的常用页签（不含没钉住、临时放着的那一个，也不含最右的模型世界）。 */
const groupTabs = page => header(page).locator('nav.ww-tabs:not(.ww-tabs-end) > button');
const endTabs = page => header(page).locator('.ww-tabs-end > button');
const texts = locator => locator.allInnerTexts().then(list => list.map(text => text.trim()));
/** 页头上看得见的页签，按显示顺序：常用页签、临时页签、模型世界。 */
const shownTabs = page => texts(header(page).locator('button[data-tab]:visible'));
const tempTab = page => header(page).locator('.ww-tab-temp');
const launchButton = page => header(page).locator('.ww-launch');
const launcher = page => page.locator('.ww-launcher');
const launcherShown = page => launcher(page).evaluate(element => element.matches(':popover-open'));
const launcherTile = (page, name) => launcher(page).locator('.ww-launcher-tile', { has: page.locator('.ww-launcher-name', { hasText: name }) });
const moreTabs = page => header(page).locator('.ww-tabs-more');
/** “全部功能”里“钉在页头的”那一排，按顺序。 */
const pinnedRow = page => launcher(page).locator('.ww-launcher-pin[data-pin] > span:not([class])').allInnerTexts();
const moreButton = page => header(page).getByRole('button', { name: '更多操作' });
// 切过的页签会留在页面里隐藏着，只看当前显示的那个；模型世界用自己的页头（.ww-mw-header），其余页签都用外壳的 .ww-pagehead
// （2026-11-13 起办公工坊、专家团队也是：专家团队的页头在三栏上面，不再在左栏顶上）。
const pageHead = page => page.locator('.ww-pagehead:visible, .ww-mw-header:visible').first();
const pageTitle = page => pageHead(page).locator('h2').first();
/** 页标题下面那句现状摘要。 */
const pageSummary = page => page.locator(':is(.ww-pagehead, .ww-mw-header):visible :is(h2 + p, h2 ~ p)').first();
/** 切到页签并等它的页标题显示出来。 */
async function showTab(page, name) {
  await openTab(page, name);
  await page.locator(':is(.ww-pagehead, .ww-mw-header) h2:visible', { hasText: name }).first().waitFor();
}

/** 从“…”→“管理功能”进到 DSH 插件页里鲸翼的详情。 */
async function openManage(page) {
  await moreButton(page).click();
  await page.getByRole('dialog', { name: '更多操作' }).getByRole('button', { name: '管理功能' }).click();
  await page.getByRole('switch', { name: '启用 鲸翼' }).waitFor();
}
const featureSwitch = (page, name) => page.getByRole('switch', { name: `启用组件 ${name}` });
/** 拨开关并等它真的变过去（DSH 处理完才会改 aria-checked）。 */
async function setFeature(page, name, on) {
  const control = featureSwitch(page, name);
  if ((await control.getAttribute('aria-checked')) !== String(on)) await control.click();
  await page.waitForFunction(([label, value]) => document.querySelector(`[role=switch][aria-label="启用组件 ${label}"]`)?.getAttribute('aria-checked') === value, [name, String(on)]);
}
const backToWhaleWing = async page => {
  await page.getByRole('button', { name: '鲸翼', exact: true }).first().click();
  await header(page).waitFor();
};
/** 每条改开关的用例结束时把四个可选功能都开回来，并回读开关状态。 */
async function restoreAll(page) {
  if (!(await page.getByRole('switch', { name: '启用 鲸翼' }).isVisible())) { await backToWhaleWing(page); await openManage(page); }
  for (const name of optional) await setFeature(page, name, true);
  for (const name of optional) assert.equal(await featureSwitch(page, name).getAttribute('aria-checked'), 'true');
}

// 需求§界面通用约定·页头；决策 2026-10-27（模型世界单独放最右）、2026-11-13（页头只放钉住的常用页签）
test('页头：鲸翼标志、“全部功能”、五个常用页签按顺序、默认在专家团队；模型世界单独一组在最右，紧挨“…”；八个功能都打得开', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url, { assistant: 'float' });
    assert.equal((await header(page).locator('h1').innerText()).trim(), '鲸翼');
    assert.deepEqual(await texts(groupTabs(page)), pinnedTabs);
    assert.deepEqual(await texts(endTabs(page)), ['模型世界']);
    assert.equal(await tempTab(page).count(), 0, '一开始没有临时页签');
    assert.equal(await moreTabs(page).isVisible(), false, '放得下时没有“更多”');
    assert.equal(await groupTabs(page).first().getAttribute('aria-pressed'), 'true');
    assert.equal((await pageTitle(page).innerText()).trim(), '专家团队');
    assert.equal((await launchButton(page).innerText()).trim(), '全部功能');
    const brand = await header(page).locator('h1').boundingBox(), launch = await launchButton(page).boundingBox();
    const group = await header(page).locator('nav.ww-tabs:not(.ww-tabs-end)').boundingBox(), end = await header(page).locator('.ww-tabs-end').boundingBox(), more = await moreButton(page).boundingBox();
    assert.ok(launch.x >= brand.x + brand.width && group.x >= launch.x + launch.width, '“全部功能”在标志和页签之间');
    assert.ok(end.x > group.x + group.width, '模型世界在功能页签组右边');
    assert.ok(more.x >= end.x + end.width && more.x - (end.x + end.width) <= 16, `“…”紧挨着模型世界（间隔 ${Math.round(more.x - end.x - end.width)}px）`);
    for (const name of [...featureTabs, '模型世界']) {
      await showTab(page, name);
      assert.equal((await pageTitle(page).innerText()).trim(), name, `打开“${name}”后页标题对应`);
      assert.equal(await header(page).locator('button[data-tab][aria-pressed=true]').innerText().then(text => text.trim()), name, '选中态跟着移动');
    }
    assert.deepEqual(errors, []);
  });
});

// 需求§界面通用约定·页头（全部功能从页头下面展开、按分组排；Esc、点外面、再点按钮都收起）
test('全部功能：点按钮从页头下面展开，和页头一样宽，不把页面往下挤；按做事、积累、办公、资讯分组；Esc、点面板外面、再点按钮都收起', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url, { assistant: 'float' });
    const titleTop = (await pageTitle(page).boundingBox()).y;
    assert.equal(await launcherShown(page), false);
    await launchButton(page).click();
    await page.waitForFunction(() => document.querySelector('.ww-launcher')?.matches(':popover-open'));
    assert.equal(await launchButton(page).getAttribute('aria-expanded'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '搜功能', '打开就能直接打字搜');
    const panel = await launcher(page).boundingBox(), head = await header(page).boundingBox();
    assert.ok(Math.abs(panel.x - head.x) <= 1 && Math.abs(panel.width - head.width) <= 1, '和页头一样宽');
    assert.ok(panel.y >= head.y + head.height && panel.y - (head.y + head.height) <= 8, '贴着页头下沿');
    assert.ok(panel.y + panel.height <= 900, '没超出窗口');
    assert.equal((await pageTitle(page).boundingBox()).y, titleTop, '页面内容没被往下挤');
    const groups = await launcher(page).locator('section[data-group]').evaluateAll(sections => sections.map(section => [section.querySelector('h3').textContent.trim(), [...section.querySelectorAll('.ww-launcher-name')].map(name => name.firstChild.textContent.trim())]));
    assert.deepEqual(groups, launcherGroups);
    assert.deepEqual(await pinnedRow(page), pinnedTabs, '“钉在页头的”和页头同一个顺序');
    assert.ok((await launcher(page).locator('.ww-launcher-pin-fixed').innerText()).includes('模型世界 · 固定在最右'));
    assert.equal(await launcherTile(page, '模型世界').getByRole('button', { name: /钉到页头|从页头取下/ }).count(), 0, '模型世界不能钉、不能取下');
    for (const [, names] of launcherGroups) for (const name of names) assert.ok((await launcherTile(page, name).locator('.ww-launcher-purpose').innerText()).trim().length > 4, `“${name}”写了一句用途`);
    assert.ok((await launcherTile(page, '专家团队').innerText()).includes('正在看'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.ww-launcher')?.matches(':popover-open'));
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('ww-launch')), true, 'Esc 后焦点回到按钮');
    await launchButton(page).click();
    await page.waitForFunction(() => document.querySelector('.ww-launcher')?.matches(':popover-open'));
    await page.mouse.click(panel.x + panel.width / 2, 880);
    await page.waitForFunction(() => !document.querySelector('.ww-launcher')?.matches(':popover-open'));
    await launchButton(page).click();
    await page.waitForFunction(() => document.querySelector('.ww-launcher')?.matches(':popover-open'));
    await launchButton(page).click();
    await page.waitForTimeout(400);
    assert.equal(await launcherShown(page), false, '开着时再点按钮是收起，不会收了又开');
    assert.equal(await launchButton(page).getAttribute('aria-expanded'), 'false');
    // 面板开着时直接点页头上的页签：一下就切过去，面板跟着收起。
    await launchButton(page).click();
    await page.waitForFunction(() => document.querySelector('.ww-launcher')?.matches(':popover-open'));
    await groupTabs(page).filter({ hasText: '技能中心' }).click();
    await page.locator(':is(.ww-pagehead, .ww-mw-header) h2:visible', { hasText: '技能中心' }).first().waitFor();
    assert.equal(await launcherShown(page), false);
    assert.deepEqual(errors, []);
  });
});

// 需求§界面通用约定·页头（Ctrl K 按名字或用途搜；没钉住的功能临时多一个页签，再开别的就换掉）
test('Ctrl K 搜功能，上下键选、回车打开；没钉住的功能在页头临时多一个虚线页签，再开别的就换掉，能关掉', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url, { assistant: 'float' });
    await page.keyboard.press('Control+k');
    await page.waitForFunction(() => document.querySelector('.ww-launcher')?.matches(':popover-open'));
    const field = launcher(page).getByRole('searchbox', { name: '搜功能' });
    const options = launcher(page).getByRole('option');
    await field.fill('pdf');
    assert.deepEqual(await options.locator('strong').allInnerTexts(), ['办公工坊'], '按用途搜，不分大小写');
    assert.ok((await options.first().innerText()).includes('办公 · 在页头'));
    assert.equal(await options.first().locator('mark').innerText(), 'PDF', '命中的字标出来');
    await field.fill('报销');
    assert.equal(await options.count(), 0);
    assert.ok((await launcher(page).innerText()).includes('没找到“报销”。'));
    await field.fill('每');
    assert.deepEqual(await options.locator('strong').allInnerTexts(), ['每日阅读', '定时任务'], '名字以“每”开头的排前面');
    await page.keyboard.press('ArrowDown');
    assert.equal(await options.nth(1).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowUp');
    assert.equal(await options.nth(0).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Enter');
    await page.locator(':is(.ww-pagehead, .ww-mw-header) h2:visible', { hasText: '每日阅读' }).first().waitFor();
    assert.equal(await launcherShown(page), false, '打开功能后面板收起');
    assert.deepEqual(await shownTabs(page), [...pinnedTabs, '每日阅读', '模型世界'], '没钉住的临时放在常用页签后面');
    assert.equal((await tempTab(page).locator('button[data-tab]').innerText()).trim(), '每日阅读');
    assert.equal(await tempTab(page).evaluate(element => getComputedStyle(element).borderTopStyle), 'dashed', '临时页签是虚线框');
    // 再开一个没钉住的：换掉，不会越开越多。
    await page.keyboard.press('Control+k');
    assert.equal(await field.inputValue(), '', '再打开时搜索框是空的');
    await launcherTile(page, 'AI 网页').locator('.ww-launcher-open').click();
    await page.locator(':is(.ww-pagehead, .ww-mw-header) h2:visible', { hasText: 'AI 网页' }).first().waitFor();
    assert.deepEqual(await shownTabs(page), [...pinnedTabs, 'AI 网页', '模型世界']);
    // 切到别的页，临时页签还在；关掉它，页头回到五个。
    await openTab(page, '知识积累');
    assert.equal(await tempTab(page).count(), 1);
    await tempTab(page).getByRole('button', { name: '关掉这个页签' }).click();
    assert.deepEqual(await shownTabs(page), [...pinnedTabs, '模型世界']);
    // 正在看的临时页签关掉后回到第一个常用页签。
    await openTab(page, 'AI 网页');
    await tempTab(page).getByRole('button', { name: '关掉这个页签' }).click();
    await page.locator(':is(.ww-pagehead, .ww-mw-header) h2:visible', { hasText: '专家团队' }).first().waitFor();
    assert.equal(await groupTabs(page).first().getAttribute('aria-pressed'), 'true');
    // “…”里的“调整常用页签”也打开它。
    await moreButton(page).click();
    await page.getByRole('dialog', { name: '更多操作' }).getByRole('button', { name: '调整常用页签' }).click();
    await page.waitForFunction(() => document.querySelector('.ww-launcher')?.matches(':popover-open'));
    assert.deepEqual(errors, []);
  });
});

// 需求§界面通用约定·页头（钉哪些、怎么排由员工定，记在这台电脑上；至少留一个）；决策 2026-11-13（不要一格一格挪的箭头，按住小点拖到哪放到哪）
test('钉到页头、按住小点拖到哪放到哪、取下，刷新页面后还是这样；只剩一个时不能再取下', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url, { assistant: 'float' });
    await launchButton(page).click();
    await launcherTile(page, 'AI 网页').getByRole('button', { name: '把AI 网页钉到页头' }).click();
    await toast(page, '“AI 网页”钉到页头了').waitFor();
    assert.equal(await launcherShown(page), true, '钉上、取下不关面板');
    assert.deepEqual(await texts(groupTabs(page)), [...pinnedTabs, 'AI 网页']);
    assert.equal(await launcherTile(page, 'AI 网页').getByRole('button', { name: '从页头取下AI 网页' }).getAttribute('aria-pressed'), 'true');
    const row = launcher(page).locator('.ww-launcher-pins');
    const chip = name => row.locator('.ww-launcher-pin[data-pin]', { hasText: name });
    const grip = name => chip(name).locator('.ww-grip');
    const center = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }; };
    assert.equal(await row.getByRole('button', { name: /往前挪|往后挪/ }).count(), 0, '没有一格一格挪的箭头');
    assert.equal(await row.locator('.ww-grip').count(), 6, '每个小块前面一个小点');
    // 按住小块本身（不是小点）拖：拖不动。
    const name = await center(chip('AI 网页').locator('span:not([class])'));
    await page.mouse.move(name.x, name.y); await page.mouse.down();
    await page.mouse.move((await center(chip('专家团队'))).x, name.y, { steps: 8 }); await page.mouse.up();
    assert.deepEqual(await pinnedRow(page), [...pinnedTabs, 'AI 网页'], '只有按住小点才拖得动');
    // 按住 AI 网页前面的小点，一口气从最后拖到“知识积累”前面放下。
    const from = await center(grip('AI 网页')), target = await center(chip('知识积累'));
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(target.box.x + target.box.width * 0.25, target.y, { steps: 16 });
    assert.equal(await chip('AI 网页').getAttribute('data-dragging'), '', '拖着的时候这一块浮起来');
    assert.deepEqual(await texts(groupTabs(page)), ['专家团队', 'AI 网页', '知识积累', '技能中心', '定时任务', '办公工坊'], '没松手时页头已经跟着换好');
    await page.mouse.up();
    assert.deepEqual(await pinnedRow(page), ['专家团队', 'AI 网页', '知识积累', '技能中心', '定时任务', '办公工坊']);
    assert.equal(await chip('AI 网页').evaluate(element => element.style.transform + '|' + element.hasAttribute('data-dragging')), '|false', '放下后回到格子里');
    assert.equal(await launcherShown(page), true, '拖完面板还开着');
    // 再往右拖过两个放下。
    const second = await center(grip('AI 网页')), past = await center(chip('技能中心'));
    await page.mouse.move(second.x, second.y); await page.mouse.down();
    await page.mouse.move(past.box.x + past.box.width * 0.8, past.y, { steps: 16 }); await page.mouse.up();
    assert.deepEqual(await pinnedRow(page), ['专家团队', '知识积累', '技能中心', 'AI 网页', '定时任务', '办公工坊']);
    // 不用鼠标：焦点在小点上按左右方向键，一次挪一位，焦点跟着走。
    await grip('AI 网页').focus();
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    assert.deepEqual(await pinnedRow(page), ['专家团队', 'AI 网页', '知识积累', '技能中心', '定时任务', '办公工坊']);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '拖动AI 网页调整位置，也可以按左右方向键');
    await row.getByRole('button', { name: '从页头取下办公工坊' }).click();
    await toast(page, '“办公工坊”从页头取下了，还在全部功能里').waitFor();
    const order = ['专家团队', 'AI 网页', '知识积累', '技能中心', '定时任务'];
    assert.deepEqual(await texts(groupTabs(page)), order);
    assert.deepEqual(await pinnedRow(page), order);
    assert.equal(await launcherTile(page, '办公工坊').count(), 1, '取下的还在全部功能里');
    // 刷新页面再进鲸翼：还是上次排的。
    await openWhaleWing(page, dsh.url, { assistant: 'float' });
    assert.deepEqual(await texts(groupTabs(page)), order);
    // 取到只剩一个。
    await launchButton(page).click();
    const again = launcher(page).locator('.ww-launcher-pins');
    for (const name of order.slice(1)) await again.getByRole('button', { name: `从页头取下${name}` }).click();
    assert.deepEqual(await pinnedRow(page), ['专家团队']);
    assert.equal(await again.getByRole('button', { name: '从页头取下专家团队' }).isDisabled(), true, '页头至少留一个');
    assert.equal(await again.locator('.ww-grip').first().isDisabled(), true, '只剩一个也没处可拖');
    assert.deepEqual(await texts(groupTabs(page)), ['专家团队']);
    assert.deepEqual(errors, []);
  });
});

// 需求§界面通用约定·页头（每个页签开头一行宋体标题，下面一句现状摘要）；决策 2026-11-13（各页签标题字号不一、专家团队没有左上角标题）
test('每个页签开头是标题，下面一句现状摘要；标题和摘要在每个页签都是同一个字号、字重和位置', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url, { assistant: 'float' });
    const missing = [], looks = {};
    for (const name of [...featureTabs, '模型世界']) {
      await showTab(page, name);
      const summary = pageSummary(page);
      if (!(await summary.count()) || !(await summary.innerText()).trim()) { missing.push(name); continue; }
      const [title, line] = await Promise.all([pageTitle(page), summary].map(locator => locator.evaluate(element => {
        const style = getComputedStyle(element), box = element.getBoundingClientRect();
        return { font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`, x: Math.round(box.x), y: Math.round(box.y) };
      })));
      looks[name] = { title, summary: line.font };
    }
    assert.deepEqual(missing, [], `标题下没有摘要的页签：${missing.join('、')}`);
    const [first, ...rest] = Object.entries(looks);
    const differ = rest.filter(([, look]) => JSON.stringify(look) !== JSON.stringify(first[1])).map(([name, look]) => `${name}：${JSON.stringify(look)}`);
    assert.deepEqual(differ, [], `和「${first[0]}」${JSON.stringify(first[1])} 不一样的页签`);
  });
});

// 需求§基础功能与可选功能（“管理功能”直接打开鲸翼详情页，只显示四个可选开关）；需求§界面通用约定·页头
test('“…”菜单有“调整常用页签”“管理功能”“刷新”“检查更新”；“管理功能”打开 DSH 插件页里鲸翼的详情，四个可选功能默认都开着', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await moreButton(page).click();
    const menu = page.getByRole('dialog', { name: '更多操作' });
    assert.deepEqual((await menu.getByRole('button').allInnerTexts()).map(text => text.trim()), ['调整常用页签', '管理功能', '刷新', '检查更新']);
    await menu.getByRole('button', { name: '管理功能' }).click();
    await page.getByRole('switch', { name: '启用 鲸翼' }).waitFor();
    const labels = await page.getByRole('switch').evaluateAll(nodes => nodes.map(node => [node.getAttribute('aria-label'), node.getAttribute('aria-checked')]));
    assert.deepEqual(labels, [['启用 鲸翼', 'true'], ...optional.map(name => [`启用组件 ${name}`, 'true'])]);
  });
});

// 需求§安装与更新（检查更新只在员工点时联网；从本机目录装的鲸翼不在这里更新）
test('反例：从开发目录装的鲸翼点“检查更新”，页头和插件详情页都说明请在开发目录里更新，不弹确认框', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await moreButton(page).click();
    await page.getByRole('dialog', { name: '更多操作' }).getByRole('button', { name: '检查更新' }).click();
    await toast(page, '本机目录装的（开发用），请在开发目录里更新').waitFor();
    assert.equal(await page.locator('.ww-update-dialog').count(), 0);
    await openManage(page);
    const block = page.locator('[data-whalewing-update]');
    await block.getByRole('button', { name: '检查更新' }).click();
    await block.getByRole('status').filter({ hasText: '本机目录装的' }).waitFor();
    assert.equal(await block.getByRole('button', { name: /^更新到/ }).count(), 0);
    assert.deepEqual(errors, []);
  });
});

// 需求§基础功能与可选功能（五项底座不显示为可选项，不提供把底座永久关闭的开关）
test('反例：鲸翼详情里没有关闭底座功能的开关', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openManage(page);
    const labels = await page.getByRole('switch').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
    for (const base of [...baseTabs, '小鲸助手']) assert.ok(!labels.some(label => label.includes(base)), `没有“${base}”的开关`);
  });
});

// 需求§“…”菜单里的刷新：重新读取当前页，停在原页签
test('“…”里的“刷新”重新读取当前页，仍停在原页签', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await showTab(page, '技能中心');
    // 新装的临时 DSH 里只有随包技能，摘要里的数就是插件 content/skills 里的项数（需求§技能：共 94 项）；项数对不对由 skills.test.mjs 核对，这条只看刷新前后不变。
    const count = `技能 ${bundledSkills.length} 项`;
    const summary = pageHead(page).locator('p').first();
    await page.waitForFunction(([element, text]) => element.textContent.trim().startsWith(text), [await summary.elementHandle(), count]);
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await moreButton(page).click();
    await page.getByRole('dialog', { name: '更多操作' }).getByRole('button', { name: '刷新' }).click();
    await page.waitForFunction(() => !document.querySelector('.ww-busy'));
    assert.ok(requests.length > 0, '确实重新读取了');
    assert.equal(await header(page).locator('button[data-tab]', { hasText: '技能中心' }).getAttribute('aria-pressed'), 'true');
    assert.ok((await summary.innerText()).trim().startsWith(count), '数量不变');
    assert.equal(await toast(page, '', 'error').count(), 0, '没有失败提示');
    assert.deepEqual(errors, []);
  });
});

// 需求§基础功能与可选功能（关闭某项后其页签撤下；已保存数据不删除，再开重新读取）；需求§界面通用约定·页头（模型世界不随开关增减）
test('关闭再开启 AI 网页：页签撤下又回来，模型世界一直在最右，自建的入口还在', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, 'AI 网页');
    await page.getByRole('button', { name: /添加 AI/ }).click();
    const name = `鲸翼测试-开关-${Date.now() % 10000}`;
    const form = page.locator('dialog.ww-editor[open]');
    await form.getByLabel('名字').fill(name);
    await form.getByLabel(/网址/).fill('http://127.0.0.1:9/whalewing-e2e');
    await form.locator('footer button', { hasText: '添加' }).click();
    await page.getByText(name).first().waitFor();
    try {
      await openManage(page);
      await setFeature(page, 'AI 网页', false);
      await backToWhaleWing(page);
      // AI 网页没钉在页头：刚才开着的临时页签撤下，“全部功能”里也不再列；常用页签和最右的模型世界不变。
      assert.deepEqual(await shownTabs(page), [...pinnedTabs, '模型世界']);
      await launchButton(page).click();
      await launcherTile(page, '专家团队').waitFor();
      assert.equal(await launcherTile(page, 'AI 网页').count(), 0, '关掉的功能不在全部功能里');
      await page.keyboard.press('Escape');
      await openManage(page);
      await setFeature(page, 'AI 网页', true);
      await backToWhaleWing(page);
      await openTab(page, 'AI 网页');
      await page.getByText(name).first().waitFor();
    } finally {
      await restoreAll(page);
    }
  });
});

// 需求§基础功能与可选功能（正在看的功能关闭时回到专家团队，并在右上角说明）。
// 从本页的“管理功能”去关时工作台已经不在眼前，所以用第二个窗口去关，本窗口一直停在办公工坊上看。
test('反例：正在看的办公工坊在别处被关闭时，回到专家团队并在右上角说明', async t => {
  await withPage(browser, t, async ({ page, context }) => {
    await openWhaleWing(page, dsh.url, { assistant: 'float' });
    await showTab(page, '办公工坊');
    const other = await context.newPage();
    try {
      await openWhaleWing(other, dsh.url);
      await openManage(other);
      await setFeature(other, '办公工坊', false);
      await toast(page, '「办公工坊」已关闭').waitFor();
      assert.equal(await groupTabs(page).filter({ hasText: '办公工坊' }).count(), 0, '办公工坊页签撤下');
      assert.equal(await groupTabs(page).first().getAttribute('aria-pressed'), 'true', '回到专家团队');
      assert.equal((await pageTitle(page).innerText()).trim(), '专家团队');
    } finally {
      await restoreAll(other);
      await other.close();
    }
  });
});

// 需求§基础功能与可选功能（2026-10-28 用户确认：从本页“管理功能”关掉正在看的功能，说明在回到鲸翼时出现）
test('从“管理功能”关掉正在看的办公工坊，回到鲸翼时停在专家团队，右上角说明“「办公工坊」已关闭”', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url, { assistant: 'float' });
    await showTab(page, '办公工坊');
    try {
      await openManage(page);
      await setFeature(page, '办公工坊', false);
      await backToWhaleWing(page);
      await toast(page, '「办公工坊」已关闭').waitFor();
      assert.equal(await groupTabs(page).filter({ hasText: '办公工坊' }).count(), 0, '办公工坊页签撤下');
      assert.equal(await groupTabs(page).first().getAttribute('aria-pressed'), 'true', '回到专家团队');
      assert.equal((await pageTitle(page).innerText()).trim(), '专家团队');
    } finally {
      await restoreAll(page);
    }
  });
});

// 反例：关掉的不是离开时正在看的那一项，回到鲸翼时不弹“已关闭”（离开鲸翼再回来都从专家团队开始，这是现有行为，不在这条里断言）。
test('反例：从“管理功能”关掉没在看的办公工坊，回到鲸翼时不说明“已关闭”', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await showTab(page, '技能中心');
    try {
      await openManage(page);
      await setFeature(page, '办公工坊', false);
      await backToWhaleWing(page);
      await page.waitForTimeout(500);
      assert.equal(await toast(page, '已关闭').count(), 0, '没有“已关闭”说明');
    } finally {
      await restoreAll(page);
    }
  });
});

// 需求§基础功能与可选功能（四项全关时，五项底座仍可用）；需求§小鲸助手第 1 条（进专家团队页时小鲸停靠在右侧，上次停靠着的照旧）
// 1680 宽：小鲸停靠后专家团队页左栏仍写字、标题看得见。
test('四个可选功能全关：只剩四个底座页签，都能打开；回到专家团队页小鲸只留气泡', async t => {
  await withPage(browser, t, { width: 1680, height: 1000 }, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    try {
      await openManage(page);
      for (const name of optional) await setFeature(page, name, false);
      await backToWhaleWing(page);
      assert.deepEqual((await groupTabs(page).allInnerTexts()).map(text => text.trim()), baseTabs);
      for (const name of baseTabs) await showTab(page, name);
      // 从 DSH 插件页回来再进专家团队页：小鲸不自己打开，只留气泡（2026-11-10 用户定）。
      await showTab(page, '专家团队');
      await page.locator('button.ww-assistant-bubble').waitFor();
      assert.equal(await page.locator('aside.ww-assistant').isVisible(), false, '小鲸不自己停靠');
      assert.deepEqual(errors, []);
    } finally {
      await restoreAll(page);
    }
  });
});

// 需求§基础功能与可选功能（办公工坊与模型世界的重资源只在功能开启且首次打开页签时下载）
test('办公工坊和模型世界的资源第一次打开页签时才下载', async t => {
  await withPage(browser, t, async ({ page }) => {
    const chunks = [];
    page.on('request', request => { const match = /\/(client\.[a-z0-9-]+\.js)/.exec(request.url()); if (match) chunks.push(match[1]); });
    await openWhaleWing(page, dsh.url);
    await openTab(page, '知识积累');
    assert.deepEqual(chunks.filter(name => /toolbox|model-world|portrait/.test(name)), [], '进鲸翼、看别的页签时不下载');
    await showTab(page, '办公工坊');
    assert.ok(chunks.includes('client.toolbox.js')); assert.ok(!chunks.includes('client.model-world.js'));
    await showTab(page, '模型世界');
    assert.ok(chunks.includes('client.model-world.js'));
    assert.deepEqual(chunks.filter(name => name.startsWith('client.portrait-')), [], '立绘大图要点开才下载');
  });
});

// 需求§基础功能与可选功能（等待可以停止，失败有重新加载入口；底座加载失败只影响自身）
test('反例：办公工坊资源下载失败时保留页签、说明原因，网络恢复后“重新加载”能打开', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await page.route('**/client.toolbox.js*', route => route.fulfill({ status: 500, body: 'error' }));
    await openTab(page, '办公工坊');
    const failed = page.locator('section.ww-task-empty[role=alert]');
    await failed.getByRole('button', { name: '重新加载' }).waitFor();
    await toast(page, '「办公工坊」加载未完成', 'error').waitFor();
    assert.equal(await groupTabs(page).filter({ hasText: '办公工坊' }).count(), 1, '页签还在');
    await showTab(page, '知识积累');
    // 切回办公工坊会自动再试一次，网络还坏着，所以仍是失败页。
    await openTab(page, '办公工坊');
    await failed.getByRole('button', { name: '重新加载' }).waitFor();
    await page.unroute('**/client.toolbox.js*');
    await failed.getByRole('button', { name: '重新加载' }).click();
    await page.locator('.ww-ws-head h2:visible', { hasText: '办公工坊' }).waitFor();
  });
});

// 需求§基础功能与可选功能（等待可以停止）
test('反例：办公工坊资源一直下载不完时可以“停止等待”，之后能重新加载', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    await page.route('**/client.toolbox.js*', async route => { await hold; await route.continue().catch(() => {}); });
    await openTab(page, '办公工坊');
    const waiting = page.locator('section.ww-task-empty[role=status]');
    await waiting.getByText('正在加载…').waitFor();
    await waiting.getByRole('button', { name: '停止等待' }).click();
    await page.locator('section.ww-task-empty').getByRole('button', { name: '重新加载' }).waitFor();
    await page.unroute('**/client.toolbox.js*'); release();
    await page.locator('section.ww-task-empty').getByRole('button', { name: '重新加载' }).click();
    await page.locator('.ww-ws-head h2:visible', { hasText: '办公工坊' }).waitFor();
  });
});

// 需求§界面通用约定·页头（放不下时先收起图标、再收紧间距）
test('窄窗口（1024 宽）：“全部功能”、五个常用页签、模型世界和“…”都在一行里看得见、点得到，页面不横向滚动', async t => {
  await withPage(browser, t, { width: 1024, height: 700 }, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    const buttons = header(page).locator('button.ww-launch, button[data-tab], button[aria-label="更多操作"]');
    const boxes = await buttons.evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { text: node.textContent.trim() || node.getAttribute('aria-label'), middle: box.top + box.height / 2, right: box.right, width: box.width, hit: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('button') === node }; }));
    assert.equal(boxes.length, pinnedTabs.length + 3);
    assert.equal(await moreTabs(page).isVisible(), false, '五个常用页签都放得下，没有“更多”');
    const middles = boxes.map(box => box.middle);
    assert.ok(Math.max(...middles) - Math.min(...middles) <= 4, `都在同一行：${JSON.stringify(boxes.map(box => [box.text, Math.round(box.middle)]))}`);
    for (const box of boxes) { assert.ok(box.right <= 1024, `“${box.text}”没出窗口`); assert.ok(box.hit, `“${box.text}”中心点得到`); }
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), true, '没有横向滚动');
  });
});

// 需求§界面通用约定·页头（还放不下的常用页签收进“更多”，不横着滚；正在看的那一页总留在外面）
// DSH 在窄窗口里默认收起左侧栏，所以先用 1280 宽进鲸翼，再把窗口改窄。
test('窄窗口：钉的页签放不下时收进页签条末尾的“更多”，正在看的留在外面，页面不横向滚动；拉宽后都回来', async t => {
  await withPage(browser, t, { width: 1280, height: 900 }, async ({ page, errors }) => {
    const ids = ['experts', 'ai-web', 'knowledge', 'skills', 'automation', 'toolbox', 'cards'];
    await page.addInitScript(pins => { try { if (!window.localStorage.getItem('whalewing.header.pins.v1')) window.localStorage.setItem('whalewing.header.pins.v1', JSON.stringify({ pins })); } catch { /* 存储用不了时照默认 */ } }, ids);
    await openWhaleWing(page, dsh.url, { assistant: 'float' });
    await groupTabs(page).filter({ hasText: '每日阅读' }).waitFor({ state: 'attached' });
    assert.deepEqual(await header(page).locator('nav.ww-tabs:not(.ww-tabs-end) > button').evaluateAll(list => list.map(button => button.textContent.trim())), featureTabs, '七个都钉着');
    await resizeAndSettle(page, { width: 760, height: 900 });
    await moreTabs(page).waitFor();
    const state = async () => {
      const all = await header(page).locator('nav.ww-tabs:not(.ww-tabs-end) > button').evaluateAll(list => list.map(button => ({ name: button.textContent.trim(), shown: button.offsetParent !== null, pressed: button.getAttribute('aria-pressed') === 'true' })));
      return { shown: all.filter(tab => tab.shown).map(tab => tab.name), tucked: all.filter(tab => !tab.shown).map(tab => tab.name), pressed: all.find(tab => tab.pressed)?.name, count: (await moreTabs(page).locator('.ww-tabs-count').innerText()).trim() };
    };
    // 侧栏收好以后页签条还要一两帧才把放得下的放回来，连着两次量得一样再比。
    const settled = async () => {
      let last = JSON.stringify(await state());
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(150);
        const now = JSON.stringify(await state());
        if (now === last) return JSON.parse(now);
        last = now;
      }
      return JSON.parse(last);
    };
    const narrow = await settled();
    assert.ok(narrow.tucked.length >= 1, `有页签被收起：${JSON.stringify(narrow)}`);
    assert.equal(narrow.count, String(narrow.tucked.length), '“更多”上的数字是收了几个');
    assert.deepEqual([...narrow.shown, ...narrow.tucked], featureTabs, '从前往后留，后面的收起，一个不少');
    assert.ok(narrow.shown.includes('专家团队'), '正在看的留在外面');
    const overflow = await page.evaluate(() => { const head = document.querySelector('.ww-workbench-header'), nav = head.querySelector('nav.ww-tabs'); return { nav: nav.scrollWidth - nav.clientWidth, head: head.scrollWidth - head.clientWidth, page: document.scrollingElement.scrollWidth - innerWidth }; });
    assert.deepEqual(overflow, { nav: 0, head: 0, page: 0 }, '页签条不横着滚，页头和页面都没有横向溢出');
    const middles = await header(page).locator('button:visible').evaluateAll(list => list.map(button => { const box = button.getBoundingClientRect(); return Math.round(box.top + box.height / 2); }));
    assert.ok(Math.max(...middles) - Math.min(...middles) <= 4, '页头还是一行');
    // 点“更多”里最后一个：它换到外面，别的让位。
    await moreTabs(page).getByRole('button').first().click();
    const menu = page.getByRole('dialog', { name: '页头放不下的常用页签' });
    assert.deepEqual(await texts(menu.getByRole('button')), [...narrow.tucked, '调整常用页签']);
    const target = narrow.tucked.at(-1);
    await menu.getByRole('button', { name: target }).click();
    await page.locator(':is(.ww-pagehead, .ww-mw-header) h2:visible', { hasText: target }).first().waitFor();
    const switched = await state();
    assert.equal(switched.pressed, target); assert.ok(switched.shown.includes(target), '切过去的那一页留在外面');
    assert.deepEqual([...switched.shown, ...switched.tucked].sort(), [...featureTabs].sort());
    await page.setViewportSize({ width: 1600, height: 900 });
    await moreTabs(page).waitFor({ state: 'hidden' });
    assert.deepEqual(await texts(groupTabs(page)), featureTabs, '拉宽后收起的都回来');
    assert.deepEqual(errors, []);
  });
});

// 决策 2026-10-27（DSH 桌面版顶上 40px 是拖动区域、右上角是窗口按钮）
test('桌面版：页头的页签和“…”都不在拖动区域和窗口按钮下面', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url, { desktop: true });
    assert.deepEqual(await titlebarProblems(header(page).getByRole('button')), []);
  });
});
