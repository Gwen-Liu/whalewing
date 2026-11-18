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

/** 打开模型世界并切到里面的一个页签（2026-11-12 改版后默认停在「我的模型」，图鉴要点一下）。 */
async function openWorld(page, sub = '角色图鉴') {
  await openTab(page, '模型世界');
  await page.locator('.ww-mw-tabs button', { hasText: sub }).click();
  await page.locator(`.ww-mw-body[data-tab]`).waitFor();
}

/** 打开模型世界的角色图鉴，点第 index 张卡片的“查看大图”，等带水印的大图出来。 */
async function openViewer(page, index = 0) {
  await openWorld(page);
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
    await openWorld(page);
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

const subTab = (page, name) => page.locator('.ww-mw-tabs button', { hasText: name }).click();
/** 「新模型」页签里按名字找一行（2026-11-12 改版：型号名是可点的按钮，点了看详情）。 */
const modelRow = (page, name) => page.locator('.ww-mw-model-row').filter({ has: page.locator('.ww-mw-name', { hasText: new RegExp(`^${name}$`) }) });
/** 从「新模型」打开某个模型的详情窗口。 */
async function openDetail(page, name) {
  await subTab(page, '新模型');
  const row = modelRow(page, name).first();
  await row.waitFor();
  await row.locator('.ww-mw-name').click();
  const dialog = page.locator('dialog.ww-modal[open]').filter({ has: page.locator('header h2', { hasText: new RegExp(`^${name}$`) }) });
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
/** 需求§实力榜：T0 ≥ 50、T1 ≥ 30、T2 ≥ 20，其余 T3（2026-11-18 换 AA v5 后重定）；按 AA 榜单显示的整数（四舍五入后）比较。 */
const tierOf = score => { const shown = Math.round(score); return shown >= 50 ? 'T0' : shown >= 30 ? 'T1' : shown >= 20 ? 'T2' : 'T3'; };

// 需求§模型世界·数据（只收录有角色立绘的 18 家厂商）
test('角色图鉴：19 位角色各一张卡（18 家厂商加 DeepSeek Flash），每张有立绘、梯队或最强型号、模型数和“查看大图”', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await openWorld(page);
    const slots = page.locator('.ww-mw-role-slot');
    await slots.first().waitFor();
    assert.equal(await slots.count(), 19);
    const cards = await slots.evaluateAll(nodes => nodes.map(node => ({ art: Boolean(node.querySelector('img.ww-mw-persona')), count: /\d+ 个模型/.test(node.textContent), zoom: Boolean(node.querySelector('button.ww-mw-zoom[aria-label^="查看大图："]')) })));
    assert.ok(cards.every(card => card.art && card.count && card.zoom), JSON.stringify(cards));
    assert.deepEqual(errors, []);
  });
});

// 需求§模型世界（图鉴：点厂商看它的模型）
test('点角色卡片看档案：一句话介绍、必杀名、官网和开放平台入口；“看这家的全部模型”跳到实力榜并按这家筛好', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openWorld(page);
    await page.getByRole('button', { name: 'OpenAI 的角色档案' }).click();
    const profile = page.locator('dialog.ww-modal[open]');
    await profile.waitFor();
    assert.match(await profile.locator('header h2').innerText(), /^OpenAI · /);
    assert.match(await profile.locator('.ww-mw-tags').innerText(), /必杀 · 神谕降临/); assert.match(await profile.locator('.ww-mw-kit').innerText(), /神谕诗人，使白羽笔和神谕卷轴：落羽、展卷、谶言/);
    const links = await profile.locator('footer a').evaluateAll(nodes => nodes.map(node => [node.textContent.trim(), node.href, node.target, node.rel]));
    assert.deepEqual(links, [['官网', 'https://openai.com/', '_blank', 'noopener noreferrer'], ['开放平台', 'https://platform.openai.com/', '_blank', 'noopener noreferrer']]);
    await profile.getByRole('button', { name: /^看这家的全部 \d+ 个模型$/ }).click();
    await profile.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.ww-mw-tabs button[aria-pressed=true]').innerText(), '实力榜');
    assert.equal(await page.locator('.ww-mw-toolbar select').inputValue(), 'openai');
  });
});

// 需求§模型世界·数据（发布日期只保留实际精度，不把年月补造成具体日期）
test('反例：只有年月的发布日期原样显示，不补成具体日期', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openWorld(page);
    await subTab(page, '新模型');
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
    await openWorld(page);
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
    await openWorld(page);
    let dialog = await openDetail(page, 'GPT E2E');
    assert.deepEqual([await metric(dialog, '输入价格').innerText(), await metric(dialog, '输出价格').innerText()].map(text => text.trim()), ['$1.25', '$10']);
    await dialog.locator('footer').getByRole('button', { name: '关闭' }).click();
    dialog = await openDetail(page, 'DeepSeek V4 Flash');
    assert.deepEqual([await metric(dialog, '输入价格').innerText(), await metric(dialog, '缓存输入价格').innerText(), await metric(dialog, '输出价格').innerText()].map(text => text.trim()), ['¥2', '¥0.04', '¥8']);
    assert.match(await dialog.innerText(), /人民币 \/ 百万 tokens，按厂商官网标价/);
  });
});

// 需求§模型世界·数据（没收录的国产模型不显示价格，不拿美元价换算冒充官网价）
test('反例：没核对过官网价的国产模型不显示价格，也不拿美元价换算', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openWorld(page);
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
test('新模型按月分组，新的月份在上，同一个月里新的在上', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openWorld(page, '新模型');
    await page.locator('.ww-mw-timeline').first().waitFor();
    const months = (await page.locator('.ww-mw-timeline .ww-mw-year').allInnerTexts()).map(text => /^(\d{4}) 年 (\d+) 月/.exec(text)).map(match => Number(match[1]) * 100 + Number(match[2]));
    assert.ok(months.length >= 2 && months.every((month, index) => index === 0 || month < months[index - 1]), `月份从新到旧：${months}`);
    // 合成数据里名字带 E2E 的五个，按发布日期从新到旧。
    const names = (await page.locator('.ww-mw-timeline .ww-mw-name').allInnerTexts()).filter(name => / E2E$/.test(name));
    assert.deepEqual(names, ['GPT E2E', 'Claude E2E', 'Gemini E2E', 'Qwen E2E', 'Kimi E2E']);
  });
});

// 需求§实力榜（五个榜单；排序用行尾箭头，默认从高到低）；需求§界面通用约定·一行排开
test('实力榜：五个榜单，默认综合实力从高到低；点箭头改成从低到高，顺序反过来', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openWorld(page);
    await page.getByRole('button', { name: '实力榜' }).click();
    await rankingRows(page).first().waitFor();
    assert.deepEqual((await page.locator('.ww-mw-boards').first().locator('> button:not(.ww-mw-sort)').allInnerTexts()).map(text => text.trim()), ['综合实力', '推理与知识', '编程', '智能体', '性价比']);
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

// 需求§实力榜（按指数分梯队：T0 ≥ 50、T1 ≥ 30、T2 ≥ 20，其余 T3；按 AA 榜单显示的整数）
test('实力榜每一行的梯队都和综合实力分对得上', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openWorld(page);
    await page.getByRole('button', { name: '实力榜' }).click();
    await rankingRows(page).first().waitFor();
    const wrong = (await readRows(page)).filter(row => row.tier !== tierOf(row.score));
    assert.deepEqual(wrong, []);
  });
});

// 需求§角色与对决（选两个不同的模型，只看综合实力，分高的一方最后击倒对方）
test('对决：在对决台上从名单里点两位，开打后综合实力高的一方获胜，胜方还剩体力、败方体力为 0', async t => {
  await withPage(browser, t, { reducedMotion: 'reduce' }, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await openWorld(page, '对决');
    await page.locator('.ww-mw-boards button', { hasText: '每家最强' }).click();
    const roster = page.locator('.ww-mw-rost');
    await roster.nth(3).waitFor();
    const read = async index => ({ name: await roster.nth(index).locator('strong').innerText(), score: Number(await roster.nth(index).locator('b').innerText()) });
    const high = await read(0), low = await read(3);
    assert.equal(await page.locator('.ww-mw-desk .ww-primary').isDisabled(), true, '没选齐不能开打');
    await roster.nth(3).click();
    assert.equal(await page.locator('.ww-mw-slot[data-side=right]').getAttribute('data-active'), 'true', '放好左边自动跳到右边');
    await roster.nth(0).click();
    await page.locator('.ww-mw-desk .ww-primary').click();
    const duel = page.locator('dialog.ww-modal[open]');
    await duel.getByText(`${high.name} 获胜，剩`).waitFor({ timeout: 20000 });
    const hp = (await duel.locator('.ww-mw-hp-num').allInnerTexts()).map(text => Number(/体力 (\d+)/.exec(text)[1]));
    assert.equal(hp[0], 0, '左边是分低的一方，被击倒'); assert.ok(hp[1] > 0, `胜方体力 ${hp[1]}`); assert.ok(low.score < high.score);
    assert.equal(await duel.locator('.ww-mw-duel-log li').count(), 4, '四个回合的记录');
    const kits = await duel.locator('.ww-mw-kits p').allInnerTexts();
    assert.equal(kits.length, 2, '两位各一行职业和招式'); assert.ok(kits.every(text => /使.+：.+、.+、.+；必杀「.+」/.test(text)), JSON.stringify(kits));
    assert.equal(await duel.locator('canvas').count(), 1);
    assert.deepEqual(errors, []);
  });
});

// 需求§角色与对决（选两个不同的模型）
test('反例：同一个模型不会占两边；比一比最多放 4 个，超过两位不能直接对决，“清空”后底栏消失', async t => {
  await withPage(browser, t, async ({ page }) => {
    await openWhaleWing(page, dsh.url);
    await openWorld(page, '对决');
    await page.locator('.ww-mw-boards button', { hasText: '每家最强' }).click();
    const roster = page.locator('.ww-mw-rost');
    await roster.nth(1).waitFor();
    await roster.nth(0).click(); await roster.nth(0).click();
    assert.equal(await page.locator('.ww-mw-rost[aria-pressed=true]').count(), 1, '再点同一位只是把他换到亮着的那一边，不会两边都是他');
    assert.equal(await page.locator('.ww-mw-desk .ww-primary').isDisabled(), true);
    await subTab(page, '实力榜');
    await rankingRows(page).first().waitFor();
    const adds = page.locator('.ww-mw-table .ww-mw-iconbtn');
    for (const index of [0, 1, 2, 3]) await adds.nth(index).click();
    const bar = page.locator('.ww-mw-selected');
    assert.equal((await bar.locator('span').first().innerText()).trim(), '比一比 · 4/4');
    assert.equal(await adds.nth(4).isDisabled(), true, '第五个放不进去');
    assert.equal(await bar.getByRole('button', { name: '去对决台' }).isDisabled(), true, '超过两位不能直接对决');
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
    await openWorld(page);
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
test('模型详情里的立绘也能点开大图；DeepSeek Flash 打开的是小飞鱼那张', async t => {
  await withPage(browser, t, async ({ page }) => {
    const chunks = [];
    page.on('request', request => { const match = /\/client\.portrait-([a-z0-9-]+)\.js/.exec(request.url()); if (match) chunks.push(match[1]); });
    await openWhaleWing(page, dsh.url);
    await openWorld(page);
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
    await openWorld(page);
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
    await openWorld(page);
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
