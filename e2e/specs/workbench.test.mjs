// 工作台外壳：页头、“…”菜单、可选功能开关、重资源按需加载、窄窗口和桌面版标题栏。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDsh } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, toast, titlebarProblems } from '../support/browser.mjs';

let dsh, browser;
before(async () => { dsh = await startDsh(); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await dsh?.stop(); });

const featureTabs = ['专家团队', 'AI 网页', '个人知识', '技能成长', '定时任务', '办公工坊', '知识卡片'];
const baseTabs = ['专家团队', '个人知识', '技能成长', '定时任务'];
const optional = ['AI 网页', '办公工坊', '知识卡片', '模型世界'];

const header = page => page.locator('.ww-workbench-header');
const groupTabs = page => header(page).locator('nav.ww-tabs:not(.ww-tabs-end) > button');
const endTabs = page => header(page).locator('.ww-tabs-end > button');
const moreButton = page => header(page).getByRole('button', { name: '更多操作' });
// 切过的页签会留在页面里隐藏着，只看当前显示的那个；模型世界用自己的页头。
const pageHead = page => page.locator('.ww-pagehead:visible, .ww-mw-header:visible').first();
const pageTitle = page => pageHead(page).locator('h2').first();
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

// 需求§界面通用约定·页头；决策 2026-10-27（模型世界单独放最右）
test('页头：鲸翼标志、七个功能页签按顺序、默认在专家团队；模型世界单独一组在最右，紧挨“…”', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    assert.equal((await header(page).locator('h1').innerText()).trim(), '鲸翼');
    assert.deepEqual((await groupTabs(page).allInnerTexts()).map(text => text.trim()), featureTabs);
    assert.deepEqual((await endTabs(page).allInnerTexts()).map(text => text.trim()), ['模型世界']);
    assert.equal(await groupTabs(page).first().getAttribute('aria-pressed'), 'true');
    assert.equal((await pageTitle(page).innerText()).trim(), '专家团队');
    const group = await header(page).locator('nav.ww-tabs:not(.ww-tabs-end)').boundingBox(), end = await header(page).locator('.ww-tabs-end').boundingBox(), more = await moreButton(page).boundingBox();
    assert.ok(end.x > group.x + group.width, '模型世界在功能页签组右边');
    assert.ok(more.x >= end.x + end.width && more.x - (end.x + end.width) <= 16, `“…”紧挨着模型世界（间隔 ${Math.round(more.x - end.x - end.width)}px）`);
    for (const name of [...featureTabs, '模型世界']) {
      await showTab(page, name);
      assert.equal((await pageTitle(page).innerText()).trim(), name, `点“${name}”后页标题对应`);
      assert.equal(await header(page).locator('button[data-tab][aria-pressed=true]').innerText().then(text => text.trim()), name, '选中态跟着移动');
    }
    assert.deepEqual(errors, []);
  });
});

// 需求§界面通用约定·页头（每个页签开头一行宋体标题，下面一句现状摘要）
test('每个页签开头是标题，下面一句现状摘要', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    const missing = [];
    for (const name of [...featureTabs, '模型世界']) {
      await showTab(page, name);
      const summary = pageHead(page).locator('h2 + p, h2 ~ p').first();
      if (!(await summary.count()) || !(await summary.innerText()).trim()) missing.push(name);
    }
    assert.deepEqual(missing, [], `标题下没有摘要的页签：${missing.join('、')}`);
  });
});

// 需求§基础功能与可选功能（“管理功能”直接打开鲸翼详情页，只显示四个可选开关）；需求§界面通用约定·页头
test('“…”菜单只有“管理功能”“刷新”；“管理功能”打开 DSH 插件页里鲸翼的详情，四个可选功能默认都开着', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await moreButton(page).click();
    const menu = page.getByRole('dialog', { name: '更多操作' });
    assert.deepEqual((await menu.getByRole('button').allInnerTexts()).map(text => text.trim()), ['管理功能', '刷新']);
    await menu.getByRole('button', { name: '管理功能' }).click();
    await page.getByRole('switch', { name: '启用 鲸翼' }).waitFor();
    const labels = await page.getByRole('switch').evaluateAll(nodes => nodes.map(node => [node.getAttribute('aria-label'), node.getAttribute('aria-checked')]));
    assert.deepEqual(labels, [['启用 鲸翼', 'true'], ...optional.map(name => [`启用组件 ${name}`, 'true'])]);
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
    await showTab(page, '技能成长');
    // 需求§技能成长：随包技能共 93 项。
    const summary = pageHead(page).locator('p').first();
    await page.waitForFunction(element => element.textContent.trim() === '93 项', await summary.elementHandle());
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await moreButton(page).click();
    await page.getByRole('dialog', { name: '更多操作' }).getByRole('button', { name: '刷新' }).click();
    await page.waitForFunction(() => !document.querySelector('.ww-busy'));
    assert.ok(requests.length > 0, '确实重新读取了');
    assert.equal(await header(page).locator('button[data-tab]', { hasText: '技能成长' }).getAttribute('aria-pressed'), 'true');
    assert.equal((await summary.innerText()).trim(), '93 项', '数量不变');
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
      assert.deepEqual((await groupTabs(page).allInnerTexts()).map(text => text.trim()), featureTabs.filter(tab => tab !== 'AI 网页'));
      assert.deepEqual((await endTabs(page).allInnerTexts()).map(text => text.trim()), ['模型世界']);
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
    await openWhaleWing(page, dsh.url);
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
    await openWhaleWing(page, dsh.url);
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
    await showTab(page, '技能成长');
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

// 需求§基础功能与可选功能（四项全关时，五项底座仍可用）
test('四个可选功能全关：只剩四个底座页签，都能打开，小鲸气泡还在', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    try {
      await openManage(page);
      for (const name of optional) await setFeature(page, name, false);
      await backToWhaleWing(page);
      assert.deepEqual((await groupTabs(page).allInnerTexts()).map(text => text.trim()), baseTabs);
      for (const name of baseTabs) await showTab(page, name);
      await page.getByRole('button', { name: '打开小鲸助手' }).waitFor();
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
    await openTab(page, '个人知识');
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
    await showTab(page, '个人知识');
    // 切回办公工坊会自动再试一次，网络还坏着，所以仍是失败页。
    await openTab(page, '办公工坊');
    await failed.getByRole('button', { name: '重新加载' }).waitFor();
    await page.unroute('**/client.toolbox.js*');
    await failed.getByRole('button', { name: '重新加载' }).click();
    await page.locator('.ww-pagehead h2:visible', { hasText: '办公工坊' }).waitFor();
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
    await page.locator('.ww-pagehead h2:visible', { hasText: '办公工坊' }).waitFor();
  });
});

// 需求§界面通用约定·页头（放不下时先收起图标、再收紧间距）
test('窄窗口（1024 宽）：所有页签、模型世界和“…”都在一行里看得见、点得到，页面不横向滚动', async t => {
  await withPage(browser, t, { width: 1024, height: 700 }, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    const buttons = header(page).locator('button[data-tab], button[aria-label="更多操作"]');
    const boxes = await buttons.evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { text: node.textContent.trim() || node.getAttribute('aria-label'), middle: box.top + box.height / 2, right: box.right, width: box.width, hit: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('button') === node }; }));
    assert.equal(boxes.length, featureTabs.length + 2);
    const middles = boxes.map(box => box.middle);
    assert.ok(Math.max(...middles) - Math.min(...middles) <= 4, `都在同一行：${JSON.stringify(boxes.map(box => [box.text, Math.round(box.middle)]))}`);
    for (const box of boxes) { assert.ok(box.right <= 1024, `“${box.text}”没出窗口`); assert.ok(box.hit, `“${box.text}”中心点得到`); }
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), true, '没有横向滚动');
  });
});

// 决策 2026-10-27（DSH 桌面版顶上 40px 是拖动区域、右上角是窗口按钮）
test('桌面版：页头的页签和“…”都不在拖动区域和窗口按钮下面', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url, { desktop: true });
    assert.deepEqual(await titlebarProblems(header(page).getByRole('button')), []);
  });
});
