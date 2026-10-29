import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startDsh } from '../support/dsh.mjs';
import { seedModelWorld } from '../support/world-fixture.mjs';
import { evidenceDir, launchBrowser, withPage, openWhaleWing, openTab, titlebarProblems, windowsTitlebar, toast } from '../support/browser.mjs';

let dsh, browser;
before(async () => { dsh = await startDsh({ seed: ({ home }) => seedModelWorld(home) }); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await dsh?.stop(); });

/** 从 JPG 的帧头读出宽高。 */
function jpegSize(bytes) {
  for (let at = 2; at + 9 < bytes.length;) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1], length = bytes.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)];
    at += 2 + length;
  }
  return null;
}

/** 打开模型世界的角色图鉴，点第 index 张卡片的“查看大图”，等带水印的大图出来。 */
async function openViewer(page, index = 0) {
  await openTab(page, '模型世界');
  const zoom = page.locator('.ww-mw-zoom').nth(index);
  const name = (await zoom.getAttribute('aria-label')).replace(/^查看大图：/, '');
  await zoom.click();
  const viewer = page.getByRole('dialog', { name: `立绘大图：${name}` });
  await viewer.locator('.ww-mw-viewer-img[data-ready=true]').waitFor();
  return { viewer, name };
}

// 需求§角色与对决·查看大图与保存；决策 2026-10-27（按钮组居中、整块不参与拖动、右边让出窗口按钮）
test('查看大图：按钮组在顶栏正中，桌面版不被窗口按钮挡住、整个按钮都点得中', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url, { desktop: true });
    const { viewer } = await openViewer(page);
    const actions = viewer.locator('.ww-mw-viewer-actions');
    assert.deepEqual(await actions.getByRole('button').allInnerTexts(), ['放大', '保存图片', '关闭']);
    const box = await actions.boundingBox(), width = page.viewportSize().width;
    assert.ok(Math.abs(box.x + box.width / 2 - width / 2) <= 2, `按钮组居中（偏了 ${Math.round(box.x + box.width / 2 - width / 2)}px）`);
    assert.deepEqual(await titlebarProblems(viewer.getByRole('button')), []);
    // 点“放大”的最上沿：桌面版里这里原来会变成拖窗口。
    const zoomIn = actions.getByRole('button', { name: '放大' }), zoomBox = await zoomIn.boundingBox();
    await page.mouse.click(zoomBox.x + zoomBox.width / 2, zoomBox.y + 3);
    await assert.doesNotReject(actions.getByRole('button', { name: '适应窗口', pressed: true }).waitFor());
    assert.deepEqual(errors, []);
  });
});

// 测试自检：把查看器改回修复前的样子，检查必须报出问题，证明上一条不是空转
test('反例：检查真的能发现被挡住和点不中的按钮', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url, { desktop: true });
    const { viewer } = await openViewer(page);
    // 还原成修复前的样子：不声明 no-drag，按钮组靠右。
    await page.addStyleTag({ content: '.ww-mw-viewer{-webkit-app-region:initial!important}.ww-mw-viewer-actions{grid-column:3!important;justify-self:end}' });
    const problems = await titlebarProblems(viewer.getByRole('button'));
    assert.ok(problems.some(problem => problem.includes('被右上角窗口按钮挡住')), problems.join('；'));
    assert.ok(problems.some(problem => problem.includes('压在拖动窗口的区域上')), problems.join('；'));
    assert.equal(windowsTitlebar.height, 40);
  });
});

// 需求§角色与对决·查看大图与保存（4K、点图放大、← → 切换、Esc 关闭）
test('看大图：显示带水印的大图，可放大还原、左右切换，Esc 关闭后焦点回到入口', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    const { viewer, name } = await openViewer(page, 1);
    assert.match(await viewer.locator('.ww-mw-viewer-title').innerText(), new RegExp(`^${name}\\s*2 / \\d+$`));
    const image = viewer.locator('.ww-mw-viewer-img');
    assert.match(await image.getAttribute('src'), /^blob:/, '显示的是加好水印的那张');
    assert.deepEqual(await image.evaluate(img => [img.naturalWidth, img.naturalHeight]), [2160, 3840], '4K 原图');
    await image.click();
    await viewer.getByRole('button', { name: '适应窗口', pressed: true }).waitFor();
    assert.ok((await image.boundingBox()).width > page.viewportSize().width, '放大后比窗口宽');
    await viewer.getByRole('button', { name: '适应窗口' }).click();
    await viewer.getByRole('button', { name: '放大', pressed: false }).waitFor();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => /3 \/ \d+$/.test(document.querySelector('.ww-mw-viewer-title')?.innerText ?? ''));
    await page.keyboard.press('Escape');
    await viewer.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), `查看大图：${name}`);
    assert.deepEqual(errors, []);
  });
});

// 需求§角色与对决·查看大图与保存（保存成 鲸翼立绘-角色名.jpg，许可写在文件属性里）
test('保存图片：存下 2160×3840 的 JPG，文件名带角色名，文件属性里写着作者和许可', async t => {
  await withPage(browser, t, { acceptDownloads: true }, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    const { viewer, name } = await openViewer(page);
    const [download] = await Promise.all([page.waitForEvent('download'), viewer.getByRole('button', { name: '保存图片' }).click()]);
    assert.equal(download.suggestedFilename(), `鲸翼立绘-${name}.jpg`);
    fs.mkdirSync(evidenceDir, { recursive: true });
    const file = path.join(evidenceDir, download.suggestedFilename()); await download.saveAs(file);
    const bytes = fs.readFileSync(file);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], 'JPG');
    assert.deepEqual(jpegSize(bytes), [2160, 3840]);
    const text = bytes.subarray(0, 4096).toString('latin1');
    assert.match(text, /Exif/); assert.match(text, /WhaleWing/); assert.match(text, /CC BY-NC-SA 4\.0, non-commercial use only/);
    await page.getByText(`已保存“鲸翼立绘-${name}.jpg”`).waitFor();
    assert.deepEqual(errors, []);
  });
});

// 需求§基础功能与可选功能（重资源失败有重新加载入口）；需求§查看大图与保存（显示的就是要保存的那张，没有大图就不能保存）
test('反例：大图取不到时保留小图、不能保存，网络恢复后点“重试”能看到大图', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await page.route('**/client.portrait-*.js*', route => route.abort());
    await openTab(page, '模型世界');
    const zoom = page.locator('.ww-mw-zoom').first(), name = (await zoom.getAttribute('aria-label')).replace(/^查看大图：/, '');
    await zoom.click();
    const viewer = page.getByRole('dialog', { name: `立绘大图：${name}` });
    await viewer.getByRole('alert').getByText('高清图没有载入').waitFor();
    assert.match(await viewer.locator('.ww-mw-viewer-img').getAttribute('src'), /^data:image\//, '还显示小图');
    assert.equal(await viewer.getByRole('button', { name: '保存图片' }).isDisabled(), true);
    assert.equal(await viewer.getByRole('button', { name: '放大' }).isDisabled(), true);
    await page.unroute('**/client.portrait-*.js*');
    await viewer.getByRole('button', { name: '重试' }).click();
    await viewer.locator('.ww-mw-viewer-img[data-ready=true]').waitFor();
    assert.equal(await viewer.getByRole('button', { name: '保存图片' }).isEnabled(), true);
  });
});

// ---- 图鉴、列表、时间线、详情、价格、实力榜、对决、综合实力数据 ----
// 预期按 support/world-fixture.mjs 里放进去的合成模型算；实力榜的分数来自随插件发布的榜单，只检查规则（排序、梯队），不检查具体分数。

const search = async (page, text) => {
  await page.getByPlaceholder('搜索模型或厂商').fill(text);
  await page.getByRole('button', { name: '查找', exact: true }).click();
};
const modelRow = (page, name) => page.locator('.ww-mw-model-row').filter({ has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) });
/** 在当前列表里打开某个模型的详情窗口。 */
async function openDetail(page, name) {
  await search(page, name);
  const row = modelRow(page, name).first();
  await row.hover();
  await row.getByRole('button', { name: `详情 ${name}` }).click();
  const dialog = page.locator('dialog.ww-mw-dialog[open]').filter({ has: page.locator('h2', { hasText: new RegExp(`^${name}$`) }) });
  await dialog.waitFor();
  return dialog;
}
/** 详情里“发布日期”“输入价格”这类一项的值。 */
const metric = (dialog, label) => dialog.locator('dl.ww-mw-metrics > div').filter({ has: dialog.page().locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');
const rankingRows = page => page.locator('.ww-mw-table tbody tr');
/** 实力榜一行：名次、模型名、梯队、综合实力。 */
const readRows = page => rankingRows(page).evaluateAll(rows => rows.map(row => {
  const cells = row.querySelectorAll('td');
  return { name: cells[1]?.querySelector('strong, .ww-mw-model-name strong, div strong')?.textContent.trim() || cells[1]?.innerText.split('\n')[0].trim(), tier: cells[2]?.innerText.trim(), score: Number.parseFloat(cells[3]?.innerText) };
}));
/** 需求§实力榜：T0 ≥ 52、T1 ≥ 44、T2 ≥ 34，其余 T3；按 AA 榜单显示的整数（四舍五入后）比较。 */
const tierOf = score => { const shown = Math.round(score); return shown >= 52 ? 'T0' : shown >= 44 ? 'T1' : shown >= 34 ? 'T2' : 'T3'; };

// 需求§模型世界·数据（只收录有角色立绘的 18 家厂商）
test('角色图鉴：18 家厂商各一张卡，每张有立绘、梯队或最强型号、模型数和“查看大图”', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    const slots = page.locator('.ww-mw-role-slot');
    await slots.first().waitFor();
    assert.equal(await slots.count(), 18);
    const cards = await slots.evaluateAll(nodes => nodes.map(node => ({ art: Boolean(node.querySelector('img.ww-mw-persona')), count: /\d+ 个模型/.test(node.textContent), zoom: Boolean(node.querySelector('button.ww-mw-zoom[aria-label^="查看大图："]')) })));
    assert.ok(cards.every(card => card.art && card.count && card.zoom), JSON.stringify(cards));
    assert.deepEqual(errors, []);
  });
});

// 需求§模型世界（图鉴：点厂商看它的模型）
test('点厂商卡片看这家的模型，带发布日期和上下文；“返回角色图鉴”回到 18 张卡', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    await page.getByRole('button', { name: '浏览 OpenAI 的模型' }).click();
    const row = modelRow(page, 'GPT E2E');
    await row.waitFor();
    assert.equal((await row.locator('small').innerText()).trim(), 'OpenAI · 2026-09-20 · 128K 上下文');
    assert.equal(await page.locator('.ww-mw-model-row').filter({ hasText: 'Claude E2E' }).count(), 0, '只有这家的模型');
    await page.getByRole('button', { name: '返回角色图鉴' }).click();
    await page.locator('.ww-mw-role-slot').nth(17).waitFor();
    assert.equal(await page.locator('.ww-mw-role-slot').count(), 18);
  });
});

// 需求§模型世界·数据（发布日期只保留实际精度，不把年月补造成具体日期）
test('反例：只有年月的发布日期原样显示，不补成具体日期', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    await search(page, 'Kimi E2E');
    await modelRow(page, 'Kimi E2E').waitFor();
    assert.equal((await modelRow(page, 'Kimi E2E').locator('small').innerText()).trim(), '月之暗面 · 2026-08 · 128K 上下文');
    const dialog = await openDetail(page, 'Kimi E2E');
    assert.equal((await metric(dialog, '发布日期').innerText()).trim(), '2026-08');
  });
});

// 需求§模型世界·数据（未知和 0 分开表示；没有评测不等于能力差）
test('反例：没有综合实力分的模型显示“—”和“评测不足”，不当成 0 分', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    const dialog = await openDetail(page, 'GPT E2E');
    const score = dialog.locator('.ww-mw-rating-score');
    assert.equal((await score.locator('strong').innerText()).trim(), '—');
    assert.match(await score.innerText(), /评测不足/);
    assert.equal(await dialog.locator('.ww-mw-tier').count(), 0, '没有分就没有梯队');
  });
});

// 需求§模型世界·数据（价格按币种显示：海外美元、国产官网人民币）
test('价格按币种：海外模型显示公开目录的美元价，价目表里的国产模型显示官网人民币价并注明', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    let dialog = await openDetail(page, 'GPT E2E');
    assert.deepEqual([await metric(dialog, '输入价格').innerText(), await metric(dialog, '输出价格').innerText()].map(text => text.trim()), ['$1.25', '$10']);
    await dialog.getByRole('button', { name: '关闭' }).click();
    dialog = await openDetail(page, 'DeepSeek V4 Flash');
    assert.deepEqual([await metric(dialog, '输入价格').innerText(), await metric(dialog, '缓存输入价格').innerText(), await metric(dialog, '输出价格').innerText()].map(text => text.trim()), ['¥2', '¥0.04', '¥8']);
    assert.match(await dialog.innerText(), /人民币 \/ 百万 tokens，按厂商官网标价/);
  });
});

// 需求§模型世界·数据（没收录的国产模型不显示价格，不拿美元价换算冒充官网价）
test('反例：没核对过官网价的国产模型不显示价格，也不拿美元价换算', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    const dialog = await openDetail(page, 'DeepSeek V4');
    // 不显示价格：价格那几项要么没有，要么是“—”。
    for (const label of ['输入价格', '缓存输入价格', '输出价格']) {
      const value = metric(dialog, label);
      if (await value.count()) assert.equal((await value.innerText()).trim(), '—', label);
    }
    assert.equal((await metric(dialog, '发布日期').innerText()).trim(), '2026-09-10', '详情本身正常显示');
    assert.doesNotMatch(await dialog.locator('dl.ww-mw-metrics').innerText(), /\$|¥/);
  });
});

// 需求§模型世界（发布时间线）
test('发布时间线按年分组，同一年里新的在上', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    await search(page, 'E2E');
    await page.getByRole('button', { name: '发布时间线' }).click();
    await page.locator('.ww-mw-timeline').waitFor();
    assert.deepEqual(await page.locator('.ww-mw-timeline .ww-mw-year').allInnerTexts(), ['2026']);
    // 合成数据里名字带 E2E 的五个，按发布日期从新到旧。
    assert.deepEqual(await page.locator('.ww-mw-timeline .ww-mw-model-row strong').allInnerTexts(), ['GPT E2E', 'Claude E2E', 'Gemini E2E', 'Qwen E2E', 'Kimi E2E']);
  });
});

// 需求§实力榜（五个榜单；排序用行尾箭头，默认从高到低）；需求§界面通用约定·一行排开
test('实力榜：五个榜单，默认综合实力从高到低；点箭头改成从低到高，顺序反过来', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    await page.getByRole('button', { name: '实力榜' }).click();
    await rankingRows(page).first().waitFor();
    assert.deepEqual((await page.locator('.ww-mw-boards > button:not(.ww-mw-sort)').allInnerTexts()).map(text => text.trim()), ['综合实力', '推理与知识', '编程', '智能体', '性价比']);
    const sort = page.locator('.ww-mw-sort');
    assert.equal((await sort.innerText()).trim(), '↓ 从高到低');
    const down = (await readRows(page)).map(row => row.score);
    assert.ok(down.length >= 2 && down.every((score, index) => index === 0 || score <= down[index - 1]), `从高到低：${down.join(' ')}`);
    await sort.click();
    await page.waitForFunction(() => document.querySelector('.ww-mw-sort')?.textContent.trim() === '↑ 从低到高');
    await page.waitForFunction(first => Number.parseFloat(document.querySelectorAll('.ww-mw-table tbody tr td')[3]?.innerText) !== first, down[0]);
    const up = (await readRows(page)).map(row => row.score);
    assert.ok(up.every((score, index) => index === 0 || score >= up[index - 1]), `从低到高：${up.join(' ')}`);
  });
});

// 需求§实力榜（按指数分梯队：T0 ≥ 52、T1 ≥ 44、T2 ≥ 34，其余 T3；按 AA 榜单显示的整数）
test('实力榜每一行的梯队都和综合实力分对得上', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    await page.getByRole('button', { name: '实力榜' }).click();
    await rankingRows(page).first().waitFor();
    const wrong = (await readRows(page)).filter(row => row.tier !== tierOf(row.score));
    assert.deepEqual(wrong, []);
  });
});

/** 从实力榜挑分数不同的两行加入对决，返回它们的名字和分数。 */
async function pickTwo(page) {
  await page.getByRole('button', { name: '实力榜' }).click();
  await rankingRows(page).first().waitFor();
  const rows = await readRows(page);
  const high = rows[0], low = rows.find(row => row.score < high.score - 5);
  for (const row of [high, low]) await page.getByRole('button', { name: `加入对决 ${row.name}` }).first().click();
  return { high, low };
}

// 需求§角色与对决（选两个不同的模型，只看综合实力，分高的一方最后击倒对方）
test('对决：选两个模型，综合实力高的一方获胜，胜方还剩体力、败方体力为 0', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    const { high, low } = await pickTwo(page);
    const bar = page.locator('.ww-mw-selected');
    assert.equal((await bar.locator('span').first().innerText()).trim(), '对决 · 2/2');
    await bar.getByRole('button', { name: '对决', exact: true }).click();
    const duel = page.locator('dialog.ww-mw-dialog[open][aria-label="对决"]');
    await duel.getByRole('button', { name: '开始对决' }).click();
    await duel.getByText(`${high.name} 获胜 · 综合实力`).waitFor({ timeout: 20000 });
    const hp = (await duel.locator('.ww-mw-hp-num').allInnerTexts()).map(text => Number(/体力 (\d+)/.exec(text)[1]));
    const highFirst = (await duel.locator('.ww-mw-hud-side.left .ww-mw-hud-name').innerText()).startsWith(high.name);
    const [winner, loser] = highFirst ? hp : [hp[1], hp[0]];
    assert.ok(winner > 0, `胜方体力 ${winner}`); assert.equal(loser, 0, '败方被击倒');
    assert.ok(low.score < high.score);
  });
});

// 需求§角色与对决（选两个不同的模型）
test('反例：只选一个模型不能开始对决，同一个模型不能选两次，“清空”后对决栏消失', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    await page.getByRole('button', { name: '实力榜' }).click();
    await rankingRows(page).first().waitFor();
    const [first] = await readRows(page);
    // 选中后按钮的名字会变，所以按行找，取行里的第二个按钮（详情、加入对决）。
    const add = rankingRows(page).filter({ has: page.locator('strong', { hasText: new RegExp(`^${first.name}$`) }) }).first().getByRole('button').nth(1);
    await add.click();
    const bar = page.locator('.ww-mw-selected');
    assert.equal((await bar.locator('span').first().innerText()).trim(), '对决 · 1/2');
    assert.equal(await bar.getByRole('button', { name: '对决', exact: true }).isDisabled(), true, '只有一个时不能对决');
    assert.equal(await add.getAttribute('aria-pressed'), 'true');
    await add.click();
    // 再点一次：取消选择（对决栏消失）或者不变（仍是 1/2），绝不会变成 2/2。
    await add.evaluate(button => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await bar.count() ? (await bar.locator('span').first().innerText()).trim() : '';
    assert.notEqual(after, '对决 · 2/2', '同一个不会算两次');
    if (!after) await add.click();
    await bar.getByRole('button', { name: '清空' }).click();
    await bar.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.ww-mw-table button[aria-pressed=true]').count(), 0);
  });
});

// 需求§查看大图与保存（大图每张一个按需分块，点开哪张才下载哪张）
test('立绘大图点开哪张才下载哪张，切到下一位才下载下一张', async t => {
  await withPage(browser, t, async ({ page }) => {
    const chunks = [];
    page.on('request', request => { const match = /\/client\.portrait-([a-z0-9-]+)\.js/.exec(request.url()); if (match) chunks.push(match[1]); });
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    await page.locator('.ww-mw-role-slot').first().waitFor();
    assert.deepEqual(chunks, [], '只看图鉴时不下载大图');
    await page.getByRole('button', { name: '查看大图：OpenAI' }).click();
    await page.locator('.ww-mw-viewer-img[data-ready=true]').waitFor();
    assert.deepEqual(chunks, ['openai']);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => /^Anthropic/.test(document.querySelector('.ww-mw-viewer-title')?.innerText ?? ''));
    await page.locator('.ww-mw-viewer-img[data-ready=true]').waitFor();
    assert.deepEqual(chunks, ['openai', 'anthropic']);
  });
});

// 需求§查看大图与保存（模型详情里的立绘也能直接点开）；需求§角色与对决（DeepSeek 分 Pro 和 Flash 两个形象）
test('模型详情里的立绘也能点开大图；DeepSeek Flash 打开的是小肥鱼那张', async t => {
  await withPage(browser, t, async ({ page }) => {
    const chunks = [];
    page.on('request', request => { const match = /\/client\.portrait-([a-z0-9-]+)\.js/.exec(request.url()); if (match) chunks.push(match[1]); });
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    const dialog = await openDetail(page, 'DeepSeek V4 Flash');
    await dialog.getByRole('button', { name: '查看大图：深度求索 Flash' }).click();
    const viewer = page.getByRole('dialog', { name: '立绘大图：深度求索 Flash' });
    await viewer.locator('.ww-mw-viewer-img[data-ready=true]').waitFor();
    assert.deepEqual(chunks, ['deepseek-flash']);
  });
});

const aaWindow = page => page.locator('dialog.ww-mw-key[open]');
/** 打开“综合实力数据”窗口，返回它和“当前使用：……”那一行的文字。 */
async function openAaWindow(page) {
  await page.getByRole('button', { name: '综合实力数据' }).click();
  const dialog = aaWindow(page);
  await dialog.waitFor();
  return { dialog, status: (await dialog.locator('p', { hasText: '当前使用' }).innerText()).trim() };
}
/** 保存或清除成功后窗口会关上并在右上角提示；重新打开读状态。 */
async function clearKey(page, dialog) {
  await dialog.getByRole('button', { name: '清除 Key' }).click();
  await dialog.getByRole('group', { name: '清除 Key' }).getByRole('button', { name: '确定清除' }).click();
  await toast(page, 'Key 已清除').waitFor();
}

// 需求§模型世界·自己的 AA Key（窗口说明当前用哪份数据、截至哪天，给出两个链接，Key 存在本机凭据服务、不进返回结果）
test('综合实力数据窗口：说明用的是随插件发布的数据，给出 AA 登录页和免费接口文档；保存 Key 后不显示明文，可以清除', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    let { dialog, status } = await openAaWindow(page);
    assert.match(status, /^当前使用：随插件发布的数据，截至 \d{4}-\d{2}-\d{2} · 还没有填写 Key$/);
    const hrefs = await dialog.locator('a').evaluateAll(links => links.map(link => link.href));
    assert.ok(hrefs.includes('https://artificialanalysis.ai/login'), hrefs.join(' '));
    assert.ok(hrefs.includes('https://artificialanalysis.ai/api-reference#free-api'), hrefs.join(' '));
    const fake = 'e2e-fake-key-0123456789';
    const field = dialog.getByLabel('Artificial Analysis API Key');
    assert.equal(await field.getAttribute('type'), 'password');
    await field.fill(fake);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await toast(page, 'Key 已保存', 'success').waitFor();
    ({ dialog, status } = await openAaWindow(page));
    try {
      assert.match(status, /Key 已保存在本机$/);
      assert.equal(await dialog.getByLabel('Artificial Analysis API Key').inputValue(), '', '输入框不回显 Key');
      assert.ok(!(await page.content()).includes(fake), '页面里看不到 Key 明文');
    } finally {
      await clearKey(page, dialog);
    }
    ({ status } = await openAaWindow(page));
    assert.match(status, /还没有填写 Key$/);
  });
});

// 需求§模型世界·自己的 AA Key（只保存员工粘贴的有效 Key）
test('反例：Key 为空、太短或带空格时不能保存，状态不变', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '模型世界');
    const { dialog, status } = await openAaWindow(page);
    const field = dialog.getByLabel('Artificial Analysis API Key'), save = dialog.getByRole('button', { name: '保存', exact: true });
    for (const value of ['', 'short', 'has space key 123']) {
      await field.fill(value);
      assert.equal(await save.isDisabled(), true, `“${value}”不能保存`);
      await field.press('Enter');
      assert.equal(await dialog.isVisible(), true, '窗口没关，说明没保存');
    }
    assert.equal(await toast(page, 'Key 已保存').count(), 0);
    assert.equal((await dialog.locator('p', { hasText: '当前使用' }).innerText()).trim(), status);
  });
});
