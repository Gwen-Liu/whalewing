import { test, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startDsh } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, textOf, toast, drawer, modal, dialogButton, isCentered, isRed, discardDrawer } from '../support/browser.mjs';
import { enableBuiltinBrowser, startLocalSite, storedAiWebEntries } from '../support/ai-web-fixture.mjs';
import { aiWebEntries, aiWebGuide } from '../../features/ai-web/catalog.js';

// 需求§AI 网页：内置 10 个官方入口，聊天类按“聊天 · 国内”“聊天 · 海外，需海外网络”分组。
const domestic = ['DeepSeek', '豆包', 'Kimi', '千问', '腾讯元宝', '智谱清言', '文心助手'];
const overseas = ['ChatGPT', 'Gemini', 'Claude'];
// 专门的工具（2026-11-13 加入）：国内三个，海外两个。
const tools = ['即梦', '海螺视频', '秘塔 AI 搜索'], toolsAbroad = ['Perplexity', 'Gemini Notebook'];
const builtinCount = domestic.length + overseas.length + tools.length + toolsAbroad.length;

// 自建入口一律指向本机替身网页，绝不点真实厂商的磁贴。
let dsh, browser, site;
before(async () => { site = await startLocalSite(); dsh = await startDsh({ seed: ({ home }) => enableBuiltinBrowser(home) }); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await dsh?.stop(); await site?.close(); });

const suffix = () => Math.random().toString(16).slice(2, 6);
const aiView = page => page.locator('section.ww-ai-web');
const group = (page, label) => aiView(page).locator(`section.ww-ai-group[aria-label="${label}"]`);
const tileNames = scope => scope.locator('.ww-ai-tile .ww-ai-name strong').allInnerTexts();
const shownNames = page => aiView(page).locator('.ww-ai-open').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label').replace(/^打开 /, '')));
const searchBox = page => aiView(page).getByRole('searchbox', { name: '查找 AI' });
// 内置浏览器的网页标签（DSH 右侧栏里的标签）和地址栏。
const browserTabs = page => page.locator('[role=tab]:has([data-sidebar-right-tab])');
const selectedTab = page => browserTabs(page).and(page.locator('[aria-selected=true]'));
const addressBar = page => page.getByRole('textbox', { name: '输入 HTTP(S) 地址' });

/** 反复读到期望值为止（界面重绘、存储写入都是异步的），超时就按最后一次读到的值报错。 */
async function settled(read, expected, message, timeout = 5_000) {
  for (const end = Date.now() + timeout; ;) {
    const actual = await read();
    try { assert.deepEqual(actual, expected, message); return; } catch (error) { if (Date.now() > end) throw error; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

/**
 * 切到 AI 网页页签，等入口清单按本机存储读回来（内置 10 个加上自建的；刚切过来时先只显示内置的）。返回入口总数。
 * 按磁贴数等，不按页头：打开过入口再回来时，页头写的是“正在用 …”而不是入口数。
 */
async function showAiWeb(page) {
  await openTab(page, 'AI 网页');
  const total = builtinCount + storedAiWebEntries(dsh.home).length;
  await settled(() => aiView(page).locator('.ww-ai-tile').count(), total, `入口清单读回 ${total} 个`, 15_000);
  return total;
}

async function openAiWeb(page) {
  await openWhaleWing(page, dsh.url);
  return showAiWeb(page);
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

/** 用加号卡片添加一个自建入口，等成功提示。 */
async function addEntry(page, name, url) {
  await aiView(page).locator('.ww-add-card').click();
  const editor = drawer(page, '添加 AI 入口');
  await editor.getByLabel('名字', { exact: true }).fill(name);
  await editor.getByLabel('网址', { exact: true }).fill(url);
  await dialogButton(editor, '添加').click();
  await editor.waitFor({ state: 'detached' });
  await toast(page, `已添加“${name}”`, 'success').waitFor();
  await group(page, '我的入口').getByRole('button', { name: `打开 ${name}`, exact: true }).waitFor();
}

/** 点自建入口的磁贴，等它在「AI 网页」会话右侧的内置浏览器里把本机替身网页载入完。 */
async function openEntry(page, name, url) {
  await page.getByRole('button', { name: `打开 ${name}`, exact: true }).click();
  await page.waitForFunction(() => document.title.startsWith('AI 网页'), null, { timeout: 30_000 });
  const frame = page.frameLocator(`iframe[src="${url}"]`);
  await frame.locator('#marker').waitFor({ timeout: 30_000 });
  return frame;
}

/** 从会话回到鲸翼的 AI 网页页签。 */
async function backToAiWeb(page) {
  await page.getByRole('button', { name: '鲸翼', exact: true }).first().click();
  return showAiWeb(page);
}

/** 某个入口的磁贴。 */
const tileOf = (page, name) => aiView(page).locator('.ww-ai-tile').filter({ has: page.getByRole('button', { name: `打开 ${name}`, exact: true }) });
/** 标着“正在用”的磁贴上写的名字。 */
const currentNames = page => aiView(page).locator('.ww-ai-tile').filter({ has: page.locator('.ww-ai-name small', { hasText: /^正在用$/ }) }).locator('.ww-ai-name strong').allInnerTexts();
const resumeButton = page => aiView(page).getByRole('button', { name: '继续使用', exact: true });
/** 「AI 网页」会话的 ID（鲸翼记在本机存储里）。 */
const aiWebSessionId = page => page.evaluate(() => localStorage.getItem(`whalewing:aiweb:${location.origin}`));

/** 删除一个自建入口，等成功提示。 */
async function removeEntry(page, name) {
  await page.getByRole('button', { name: `${name} · 入口操作` }).click();
  await page.getByRole('dialog', { name: `${name} · 入口操作` }).getByRole('button', { name: '删除' }).click();
  const confirm = modal(page, '删除 AI 入口');
  await dialogButton(confirm, '确认删除').click();
  await confirm.waitFor({ state: 'detached' });
  await toast(page, `已删除“${name}”`, 'success').waitFor();
}

// AIW-01 需求§AI 网页·入口目录（内置入口分组；“全部”是只有头像和名字的小块，场景里是带称号和拿手戏的大卡；加号卡片在“我的入口”末尾；标题右侧同一行是查找框）；决策 2026-10-15、2026-10-25、2026-11-13
test('“全部”是紧凑名录：内置入口按聊天、专门的工具分组，小块只有头像和名字，整页一屏放得下；选了场景是带拿手戏的大卡；加号卡片在我的入口末尾', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const total = await openAiWeb(page);
    const view = aiView(page);
    assert.equal(await textOf(view.locator('.ww-pagehead h2')), 'AI 网页');
    assert.match(await textOf(view.locator('.ww-pagehead p')), new RegExp(`^${total} 个入口`));
    const title = await view.locator('.ww-pagehead h2').boundingBox(), search = await searchBox(page).boundingBox();
    assert.ok(search.x > title.x + title.width, '查找框在标题右侧');
    assert.ok(search.y < title.y + title.height && search.y + search.height > title.y, '查找框和标题在同一行');
    assert.deepEqual(await view.locator('section.ww-ai-group').evaluateAll(groups => groups.map(item => item.getAttribute('aria-label'))), ['聊天 · 国内', '聊天 · 海外，需海外网络', '专门的工具', '专门的工具 · 海外，需海外网络', '我的入口']);
    assert.deepEqual(await tileNames(group(page, '聊天 · 国内')), domestic);
    assert.deepEqual(await tileNames(group(page, '聊天 · 海外，需海外网络')), overseas);
    assert.deepEqual(await tileNames(group(page, '专门的工具')), tools);
    assert.deepEqual(await tileNames(group(page, '专门的工具 · 海外，需海外网络')), toolsAbroad);
    // “全部”是紧凑名录：每个小块只有头像（有立绘的是角色小像，右下角叠官方图标）、名字和一个“+”；称号和拿手戏在悬停说明里，网址不写。
    const read = items => items.map(tile => ({
      name: tile.querySelector('.ww-ai-name strong')?.textContent ?? '', sub: tile.querySelector('.ww-ai-name small')?.textContent ?? '',
      line: tile.querySelector('.ww-ai-line')?.textContent ?? '', avatars: tile.querySelectorAll('.ww-ai-open .ww-avatar').length,
      face: !!tile.querySelector('.ww-ai-face'), badge: !!tile.querySelector('.ww-ai-badge'), pick: tile.querySelector('.ww-ai-pick')?.textContent ?? '', text: tile.innerText,
      mini: tile.classList.contains('ww-ai-mini'), hint: tile.querySelector('.ww-ai-open').title, height: Math.round(tile.getBoundingClientRect().height),
    }));
    const tiles = await view.locator('section.ww-ai-group:not([aria-label="我的入口"]) .ww-ai-tile').evaluateAll(read);
    assert.equal(tiles.length, builtinCount);
    for (const tile of tiles) {
      assert.equal(tile.mini, true, `${tile.name} 是名录里的小块`);
      assert.equal(tile.avatars, 1, `${tile.name} 有一个头像`);
      assert.equal(tile.sub + tile.line, '', `${tile.name} 小块上只有名字`);
      assert.ok(tile.hint, `${tile.name} 悬停有说明`);
      assert.equal(tile.pick, '+', `${tile.name} 有“+”`);
      assert.ok(tile.height < 60, `${tile.name} 是矮的小块：${tile.height}`);
      assert.doesNotMatch(tile.text, /https?:|www\.|\.com/, `${tile.name} 不写网址`);
    }
    // 十个聊天入口都有立绘：角色小像加官方图标角标，称号在悬停说明里。
    const chat = tiles.filter(tile => [...domestic, ...overseas].includes(tile.name));
    assert.equal(chat.every(tile => tile.face && tile.badge), true, '聊天入口用角色小像，右下角叠官方图标');
    assert.match(chat.find(tile => tile.name === 'DeepSeek').hint, /^大飞鱼姐姐 · /);
    // 入口再多也不把页面拉长：1440×900 的窗口里，“全部”整页一屏放得下。
    assert.ok((await view.locator('.ww-ai-dir').evaluate(element => element.getBoundingClientRect().bottom)) < 900, '“全部”的名录在一屏以内，不用往下滚');
    // 选一个场景：换成大卡，写着称号和这件事上的拿手戏；回到“全部”又是名录。
    await view.getByRole('button', { name: '写东西', exact: true }).click();
    const big = await view.locator('.ww-ai-tile').evaluateAll(read);
    assert.ok(big.length > 0 && big.every(tile => !tile.mini && tile.sub && tile.line), '场景里是带称号和拿手戏的大卡');
    assert.equal(big.find(tile => tile.name === '豆包').sub, '包子铺掌柜');
    await view.getByRole('button', { name: '全部', exact: true }).click();
    await settled(() => view.locator('.ww-ai-dir .ww-ai-mini').count(), total, '回到“全部”又是名录');
    const mine = group(page, '我的入口').locator('.ww-ai-grid > *');
    assert.match(await textOf(mine.last()), /^\+ 添加 AI$/);
    assert.match(await mine.last().getAttribute('class'), /ww-add-card/);
    assert.equal(await mine.count() - 1, total - builtinCount, '我的入口里是全部自建入口');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// AIW-02 需求§AI 网页（内置 10 个不可删除；自建入口的编辑、删除在卡片“…”菜单里）
test('反例：内置入口没有编辑、删除菜单，键盘按 Delete 也删不掉', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const name = `鲸翼测试-AIW02-${suffix()}`;
    await openAiWeb(page);
    // 对照：自建入口右上角有“…”菜单。
    await addEntry(page, name, site.url('aiw02.html'));
    assert.equal(await page.getByRole('button', { name: `${name} · 入口操作` }).count(), 1);
    for (const builtin of [...domestic, ...overseas]) assert.equal(await page.getByRole('button', { name: `${builtin} · 入口操作` }).count(), 0, `${builtin} 没有“…”菜单`);
    assert.equal(await aiView(page).locator('section.ww-ai-group:not([aria-label="我的入口"]) .ww-action-menu').count(), 0);
    const stored = storedAiWebEntries(dsh.home);
    // 键盘聚焦内置磁贴按 Delete：不打开网页，也不弹出删除确认。
    await page.getByRole('button', { name: '打开 DeepSeek', exact: true }).focus();
    await page.keyboard.press('Delete');
    assert.equal(await page.locator('dialog[open]').count(), 0, '没有弹出任何确认或编辑窗口');
    assert.deepEqual(await tileNames(group(page, '聊天 · 国内')), domestic);
    assert.deepEqual(await tileNames(group(page, '聊天 · 海外，需海外网络')), overseas);
    assert.doesNotMatch(await page.title(), /^AI 网页/, '没有打开 DeepSeek');
    assert.deepEqual(storedAiWebEntries(dsh.home), stored);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// AIW-03 需求§AI 网页（查找按名称、厂商或用途）
test('按名字、厂商或用途查找，不分大小写，清空后恢复全部', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openAiWeb(page);
    const all = await shownNames(page);
    // 用途写在磁贴的悬停说明里，拿手戏写在目录指引里（一句总的，加各场景下的），查找都要能查到。
    const byPurpose = aiWebEntries.filter(entry => `${entry.description} ${aiWebGuide[entry.id].line ?? ''} ${Object.values(aiWebGuide[entry.id].scenes ?? {}).join(' ')}`.includes('写作')).map(entry => entry.name);
    assert.ok(byPurpose.length > 3, '有用途或拿手戏写着“写作”的入口');
    await searchBox(page).fill('KIMI');
    await settled(() => shownNames(page), ['Kimi'], '按名字查，不分大小写');
    await searchBox(page).fill('阿里');
    await settled(() => shownNames(page), ['千问'], '按厂商查');
    await searchBox(page).fill('写作');
    await settled(() => shownNames(page), byPurpose, '按用途查');
    await searchBox(page).fill('');
    await settled(() => shownNames(page), all, '清空后恢复全部');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// AIW-04 需求§AI 网页（查找）；空状态文案以界面为准
test('查找没有匹配时说明没找到，清空后恢复全部', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openAiWeb(page);
    const all = await shownNames(page);
    await searchBox(page).fill('鲸翼测试不存在的AI');
    await aiView(page).getByRole('status').filter({ hasText: '没有匹配的 AI 入口' }).waitFor();
    assert.deepEqual(await shownNames(page), []);
    await searchBox(page).fill('');
    await settled(() => shownNames(page), all);
    assert.equal(await aiView(page).getByRole('status').filter({ hasText: '没有匹配' }).count(), 0);
    assert.deepEqual(errors, []);
  });
});

// AIW-04 需求§AI 网页（查找）；需求§验证原则（覆盖空输入、越权等情形）
test('反例：查找框里输入网页代码或通配符只当普通文字，不报错、不执行', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); return dialog.dismiss(); });
    await openAiWeb(page);
    const all = await shownNames(page);
    for (const query of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '.*', '\\']) {
      await searchBox(page).fill(query);
      await aiView(page).getByRole('status').filter({ hasText: '没有匹配的 AI 入口' }).waitFor();
      assert.deepEqual(await shownNames(page), [], `“${query}”按原样当文字查，查不到任何入口`);
    }
    assert.equal(await aiView(page).locator('img[src="x"]').count(), 0, '输入的内容没有变成页面元素');
    await searchBox(page).fill('');
    await settled(() => shownNames(page), all);
    assert.deepEqual(dialogs, [], '没有执行输入里的脚本');
    assert.deepEqual(errors, []);
  });
});

// AIW-05 需求§AI 网页（只需要名称和网址；加号卡片在“我的入口”末尾）；需求§界面通用约定（编辑用右侧抽屉、按钮写具体动作“添加”、结果用右上角提示）；需求§数据与隐私（写入后回读）
test('添加自建入口：右侧抽屉只要名字和网址，添加后出现在我的入口，存进本机', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const name = `鲸翼测试-AIW05-${suffix()}`, url = site.url('aiw05.html');
    const total = await openAiWeb(page);
    const before = storedAiWebEntries(dsh.home);
    await aiView(page).locator('.ww-add-card').click();
    const editor = drawer(page, '添加 AI 入口');
    await editor.waitFor();
    const box = await editor.boundingBox(), { width, height } = page.viewportSize();
    assert.ok(width - (box.x + box.width) <= 16, '抽屉贴着右边');
    assert.ok(box.height >= height * 0.9, '抽屉占满高度');
    assert.deepEqual(await editor.locator('footer button').allInnerTexts(), ['取消', '添加']);
    assert.deepEqual(await editor.locator('input[required]').evaluateAll(inputs => inputs.map(input => input.closest('label').firstChild.textContent)), ['名字', '网址'], '只有名字和网址必填');
    await editor.getByLabel('名字', { exact: true }).fill(name);
    await editor.getByLabel('网址', { exact: true }).fill(url);
    await dialogButton(editor, '添加').click();
    await editor.waitFor({ state: 'detached' });
    await toast(page, `已添加“${name}”`, 'success').waitFor();
    const mine = group(page, '我的入口');
    const tile = mine.locator('.ww-ai-tile').filter({ has: page.getByRole('button', { name: `打开 ${name}`, exact: true }) });
    // 名录里的小块只写名字；它在“我的入口”这一组里，不另写“自定义”。
    assert.equal(await textOf(tile.locator('.ww-ai-name')), name);
    assert.match(await mine.locator('.ww-ai-grid > *').last().getAttribute('class'), /ww-add-card/, '加号卡片仍在最后');
    assert.match(await textOf(aiView(page).locator('.ww-pagehead p')), new RegExp(`^${total + 1} 个入口`));
    const added = storedAiWebEntries(dsh.home).filter(entry => !before.some(old => old.id === entry.id));
    assert.equal(added.length, 1);
    assert.equal(added[0].name, name);
    assert.equal(added[0].url, url);
    assert.equal(added[0].builtin, false);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

const badUrls = ['ftp://example.com', 'javascript:alert(1)', 'https://user:pass@example.com'];
// 缺协议、留空由浏览器表单先拦下。
const incompleteUrls = ['example.com', ''];

// AIW-06 需求§AI 网页（网址为 HTTP 或 HTTPS）；需求§界面通用约定（失败用右上角提示）
test('反例：网址不是完整的 HTTP 或 HTTPS 地址时不保存，抽屉和已填内容保留', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const name = `鲸翼测试-AIW06-${suffix()}`;
    await openAiWeb(page);
    const stored = storedAiWebEntries(dsh.home), mine = await tileNames(group(page, '我的入口'));
    await aiView(page).locator('.ww-add-card').click();
    const editor = drawer(page, '添加 AI 入口');
    const nameInput = editor.getByLabel('名字', { exact: true }), urlInput = editor.getByLabel('网址', { exact: true });
    await nameInput.fill(name);
    for (const url of [...badUrls, ...incompleteUrls]) {
      await urlInput.fill(url);
      if (incompleteUrls.includes(url)) {
        await dialogButton(editor, '添加').click();
        // 浏览器自己的表单校验挡住提交，并给出原因（文字语言跟随浏览器）。
        assert.equal(await urlInput.evaluate(input => input.validity.valid), false, `“${url}”被浏览器表单拦下`);
        assert.ok(await urlInput.evaluate(input => input.validationMessage), `“${url}”有说明`);
      } else await nextToast(page, () => dialogButton(editor, '添加').click(), 'error');
      assert.ok(await editor.isVisible(), `“${url}”：抽屉保持打开`);
      assert.equal(await nameInput.inputValue(), name, '已填的名字还在');
      assert.equal(await urlInput.inputValue(), url, '已填的网址还在，可以接着改');
    }
    await discardDrawer(page, editor);
    assert.deepEqual(await tileNames(group(page, '我的入口')), mine, '我的入口没有多出来');
    assert.deepEqual(storedAiWebEntries(dsh.home), stored, '本机存储没有变化');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// AIW-06 需求§AI 网页（网址为 HTTP 或 HTTPS）；决策 2026-10-13（报错说清原因，不写工程用语）；需求§界面通用约定（失败用右上角提示）
test('反例：网址不合规时右上角说清原因，不显示内部数据格式', async t => {
  await withPage(browser, t, async ({ page, shot }) => {
    await openAiWeb(page);
    await aiView(page).locator('.ww-add-card').click();
    const editor = drawer(page, '添加 AI 入口');
    await editor.getByLabel('名字', { exact: true }).fill(`鲸翼测试-AIW06-${suffix()}`);
    for (const url of badUrls) {
      await editor.getByLabel('网址', { exact: true }).fill(url);
      const message = await nextToast(page, () => dialogButton(editor, '添加').click(), 'error');
      const text = await textOf(message.locator('.ww-toast-text'));
      if (url === badUrls[0]) { await animationsDone(message); t.diagnostic(`截图：${await shot('网址提示')}`); }
      assert.doesNotMatch(text, /"code"|"path"|[[\]{}]/, `“${url}”的提示不应显示内部数据格式：${text}`);
      assert.match(text, /HTTP|网址/, `“${url}”的提示说明网址要求：${text}`);
    }
  });
});

// AIW-07 需求§AI 网页（自建入口的编辑、删除在卡片“…”菜单里）；需求§界面通用约定（编辑用右侧抽屉，按钮写“保存修改”，结果用右上角提示）
test('编辑自建入口：“…”菜单里有编辑和删除，抽屉按钮写“保存修改”，改名后磁贴和存储都更新', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const name = `鲸翼测试-AIW07-${suffix()}`, renamed = `${name}-改`, url = site.url('aiw07.html');
    await openAiWeb(page);
    await addEntry(page, name, url);
    const id = storedAiWebEntries(dsh.home).find(entry => entry.name === name).id;
    await page.getByRole('button', { name: `${name} · 入口操作` }).click();
    const menu = page.getByRole('dialog', { name: `${name} · 入口操作` });
    assert.deepEqual(await menu.getByRole('button').allInnerTexts(), ['编辑', '删除']);
    await menu.getByRole('button', { name: '编辑' }).click();
    const editor = drawer(page, '编辑 AI 入口');
    await editor.waitFor();
    assert.deepEqual(await editor.locator('footer button').allInnerTexts(), ['取消', '保存修改']);
    assert.equal(await editor.getByLabel('名字', { exact: true }).inputValue(), name);
    assert.equal(await editor.getByLabel('网址', { exact: true }).inputValue(), url);
    await editor.getByLabel('名字', { exact: true }).fill(renamed);
    await dialogButton(editor, '保存修改').click();
    await editor.waitFor({ state: 'detached' });
    await toast(page, `已保存“${renamed}”的修改`, 'success').waitFor();
    const names = await tileNames(group(page, '我的入口'));
    assert.ok(names.includes(renamed) && !names.includes(name), `磁贴改名：${names.join('、')}`);
    const entry = storedAiWebEntries(dsh.home).find(item => item.id === id);
    assert.equal(entry.name, renamed);
    assert.equal(entry.url, url);
    assert.equal(entry.revision, 2);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// AIW-05、AIW-07 需求§界面通用约定（编辑用右侧抽屉：添加或编辑 AI 入口都从右侧滑出同一种抽屉，底部固定操作按钮）
test('添加和编辑 AI 入口的抽屉，操作按钮固定在抽屉底部', async t => {
  await withPage(browser, t, async ({ page, shot }) => {
    const name = `鲸翼测试-AIW05-${suffix()}`;
    await openAiWeb(page);
    await addEntry(page, name, site.url('aiw05b.html'));
    for (const [title, open] of [
      ['添加 AI 入口', () => aiView(page).locator('.ww-add-card').click()],
      ['编辑 AI 入口', async () => {
        await page.getByRole('button', { name: `${name} · 入口操作` }).click();
        await page.getByRole('dialog', { name: `${name} · 入口操作` }).getByRole('button', { name: '编辑' }).click();
      }],
    ]) {
      await open();
      const editor = drawer(page, title);
      await editor.waitFor();
      const box = await editor.boundingBox(), footer = await editor.locator('footer').boundingBox();
      if (title === '添加 AI 入口') t.diagnostic(`截图：${await shot('抽屉按钮')}`);
      assert.ok(box.y + box.height - (footer.y + footer.height) <= 32, `“${title}”的操作按钮在抽屉底部（抽屉底边 ${Math.round(box.y + box.height)}，按钮区底边 ${Math.round(footer.y + footer.height)}）`);
      await dialogButton(editor, '取消').click();
      await editor.waitFor({ state: 'detached' });
    }
  });
});

// AIW-08 需求§界面通用约定（删除用居中确认框，右下角“取消 + 确认”）
test('反例：删除自建入口时点“取消”，入口和存储都不变', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const name = `鲸翼测试-AIW08-${suffix()}`;
    await openAiWeb(page);
    await addEntry(page, name, site.url('aiw08.html'));
    const stored = storedAiWebEntries(dsh.home);
    await page.getByRole('button', { name: `${name} · 入口操作` }).click();
    await page.getByRole('dialog', { name: `${name} · 入口操作` }).getByRole('button', { name: '删除' }).click();
    const confirm = modal(page, '删除 AI 入口');
    await confirm.waitFor();
    await dialogButton(confirm, '取消').click();
    await confirm.waitFor({ state: 'detached' });
    assert.ok((await tileNames(group(page, '我的入口'))).includes(name), '入口还在');
    assert.deepEqual(storedAiWebEntries(dsh.home), stored, '存储没有变化');
    assert.equal(await toast(page, '已删除').count(), 0);
    assert.deepEqual(errors, []);
  });
});

// AIW-08 需求§AI 网页（自建入口可删除）；需求§界面通用约定（删除居中确认、确认按钮红色、成功右上角提示）
test('删除自建入口：居中确认、红色按钮，说明网站账号不受影响，确认后磁贴和存储里都没有了', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    const name = `鲸翼测试-AIW08-${suffix()}`;
    await openAiWeb(page);
    await addEntry(page, name, site.url('aiw08b.html'));
    const id = storedAiWebEntries(dsh.home).find(entry => entry.name === name).id;
    await page.getByRole('button', { name: `${name} · 入口操作` }).click();
    await page.getByRole('dialog', { name: `${name} · 入口操作` }).getByRole('button', { name: '删除' }).click();
    const confirm = modal(page, '删除 AI 入口');
    await confirm.waitFor();
    assert.ok(await isCentered(page, confirm), '确认框居中');
    assert.match(await textOf(confirm.locator('form')), new RegExp(`确认删除“${name}”？.*网站账号及浏览器会话保持不变`));
    assert.deepEqual(await confirm.locator('footer button').allInnerTexts(), ['取消', '确认删除']);
    assert.ok(await isRed(dialogButton(confirm, '确认删除')), '确认按钮是红色');
    await dialogButton(confirm, '确认删除').click();
    await confirm.waitFor({ state: 'detached' });
    await toast(page, `已删除“${name}”`, 'success').waitFor();
    assert.ok(!(await tileNames(group(page, '我的入口'))).includes(name), '磁贴不见了');
    assert.equal(storedAiWebEntries(dsh.home).some(entry => entry.id === id), false, '存储里也没有了');
    assert.deepEqual(errors, []);
  });
});

// AIW-09 需求§AI 网页（点击后在 DSH 内置浏览器里打开）；兼容§原版 DSH 上的差异（在名为「AI 网页」的会话右侧内置浏览器里打开）
test('点自建入口，在名为“AI 网页”的会话右侧内置浏览器里打开这个网址', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const name = `鲸翼测试-AIW09-${suffix()}`, url = site.url('aiw09.html');
    await openAiWeb(page);
    await addEntry(page, name, url);
    assert.doesNotMatch(await page.title(), /^AI 网页/);
    const loads = site.hits('aiw09.html');
    const frame = await openEntry(page, name, url);
    assert.match(await page.title(), /^AI 网页 — /, '进入名为“AI 网页”的会话');
    assert.equal(await addressBar(page).inputValue(), url, '地址栏是这个入口的网址');
    assert.equal(await textOf(frame.locator('#marker')), '本机替身网页 /aiw09.html', '右侧显示的是这个网页');
    assert.equal(await browserTabs(page).count(), 1, '只开了一个网页标签');
    assert.equal(site.hits('aiw09.html'), loads + 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, [], '没有访问任何外网');
  });
});

// AIW-11 需求§AI 网页（一个 AI 只占一个网页标签：再次选择同一个 AI 时直接切回已经开着的标签；回到页签时入口照常列着）；决策 2026-10-15
test('再次选择已经开着的 AI，切回它原来的标签，不新开', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const a = { name: `鲸翼测试-AIW11-甲-${suffix()}`, url: site.url('aiw11-a.html') };
    const b = { name: `鲸翼测试-AIW11-乙-${suffix()}`, url: site.url('aiw11-b.html') };
    await openAiWeb(page);
    await addEntry(page, a.name, a.url);
    await addEntry(page, b.name, b.url);
    await openEntry(page, a.name, a.url);
    const tabA = await selectedTab(page).getAttribute('data-dockkit-tab');
    await backToAiWeb(page);
    const names = await tileNames(group(page, '我的入口'));
    assert.ok(names.includes(a.name) && names.includes(b.name), '回到 AI 网页页签时入口照常列着');
    assert.deepEqual(await tileNames(group(page, '聊天 · 国内')), domestic);
    // 换另一个 AI：新开它自己的标签。
    await openEntry(page, b.name, b.url);
    assert.equal(await browserTabs(page).count(), 2);
    const tabB = await selectedTab(page).getAttribute('data-dockkit-tab');
    assert.notEqual(tabB, tabA);
    // 再选第一个：切回它原来的那个标签，不再新开。
    await backToAiWeb(page);
    await openEntry(page, a.name, a.url);
    await settled(() => selectedTab(page).getAttribute('data-dockkit-tab'), tabA, '切回原来的标签');
    assert.equal(await browserTabs(page).count(), 2, '没有新开标签');
    assert.equal(await addressBar(page).inputValue(), a.url);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// AIW-12 需求§AI 网页（员工把标签关掉后，下次才新开）；决策 2026-10-15
test('员工关掉标签后再选同一个 AI，新开一个标签并重新载入网页', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const name = `鲸翼测试-AIW12-${suffix()}`, url = site.url('aiw12.html');
    await openAiWeb(page);
    await addEntry(page, name, url);
    await openEntry(page, name, url);
    const first = await selectedTab(page).getAttribute('data-dockkit-tab');
    await selectedTab(page).getByRole('button', { name: '关闭' }).click();
    await settled(() => browserTabs(page).count(), 0, '标签关掉了');
    const loads = site.hits('aiw12.html');
    await backToAiWeb(page);
    const frame = await openEntry(page, name, url);
    assert.equal(await browserTabs(page).count(), 1, '新开了一个标签');
    assert.notEqual(await selectedTab(page).getAttribute('data-dockkit-tab'), first, '不是原来那个标签');
    assert.ok(site.hits('aiw12.html') > loads, '网页重新载入了');
    assert.equal(await textOf(frame.locator('#marker')), '本机替身网页 /aiw12.html');
    assert.equal(await addressBar(page).inputValue(), url);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// AIW-10 需求§AI 网页第 4 条（回到 AI 网页页签时入口照常列着，正在用的那个标“正在用”，页头有“继续使用”回到那个标签；一个 AI 只占一个网页标签）；兼容§原版 DSH 上的差异
test('打开入口后回到 AI 网页页签：这个入口标“正在用”，页头写“正在用 名字”；点“继续使用”回到原来的标签，地址不变，不新开标签', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const other = { name: `鲸翼测试-AIW10-乙-${suffix()}`, url: site.url('aiw10-b.html') };
    const name = `鲸翼测试-AIW10-${suffix()}`, url = site.url('aiw10.html');
    await openAiWeb(page);
    await addEntry(page, other.name, other.url);
    await addEntry(page, name, url);
    // 先开乙再开甲：“正在用”的是最后打开的那个，“继续使用”回到的是它的标签，不是右栏里随便哪个。
    await openEntry(page, other.name, other.url);
    const otherTab = await selectedTab(page).getAttribute('data-dockkit-tab');
    await backToAiWeb(page);
    await openEntry(page, name, url);
    const tab = await selectedTab(page).getAttribute('data-dockkit-tab'), session = await aiWebSessionId(page);
    // 离开前员工在右栏切到了乙的标签。
    await browserTabs(page).and(page.locator(`[data-dockkit-tab="${otherTab}"]`)).click();
    await settled(() => selectedTab(page).getAttribute('data-dockkit-tab'), otherTab, '右栏切到了乙的标签');
    // 回到鲸翼 AI 网页页签。
    const total = await backToAiWeb(page);
    assert.deepEqual(await tileNames(group(page, '聊天 · 国内')), domestic, '入口照常列着');
    assert.deepEqual(await tileNames(group(page, '聊天 · 海外，需海外网络')), overseas);
    await settled(() => currentNames(page), [name], '只有最后打开的这个标“正在用”');
    assert.equal(await textOf(tileOf(page, name).locator('.ww-ai-name')), `${name} 正在用`);
    assert.match(await textOf(aiView(page).locator('.ww-pagehead p')), new RegExp(`^正在用 ${name} · `));
    assert.equal(await aiView(page).locator('.ww-ai-tile').count(), total);
    // 点“继续使用”：回到「AI 网页」会话里这个 AI 原来的标签。
    await resumeButton(page).click();
    await page.waitForFunction(() => document.title.startsWith('AI 网页'), null, { timeout: 30_000 });
    assert.equal(await aiWebSessionId(page), session, '还是原来的「AI 网页」会话');
    await settled(() => selectedTab(page).getAttribute('data-dockkit-tab'), tab, '回到原来那个标签');
    assert.equal(await browserTabs(page).count(), 2, '没有新开标签');
    assert.equal(await addressBar(page).inputValue(), url, '地址不变');
    // 网页里的内容不在这里核对：浏览器版 DSH 的内置浏览器是 iframe，标签不在前台（右栏切到别的标签、或切走会话）时网页就被卸载，
    // 回到前台重新载入，草稿留不住；这是 DSH 的行为，鲸翼这边只负责回到原标签、不重新导航、不新开。
    await page.frameLocator(`iframe[src="${url}"]`).locator('#marker').waitFor({ timeout: 30_000 });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// AIW-10 需求§AI 网页第 4 条（员工把标签关掉后，下次才新开）；需求§AI 网页“原版 DSH 上离开和回到鲸翼”
// 2026-11-02 用户反馈：关掉了标签还一直标“正在用”、关掉后停在空会话里。改为：关掉最后一个 AI 标签自动回到鲸翼的 AI 网页页签，不再标“正在用”。
test('正在用的 AI 的标签被员工关掉后，自动回到鲸翼的 AI 网页页签、不再标“正在用”；再点这个入口新开标签重新载入', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const name = `鲸翼测试-AIW10-关-${suffix()}`, url = site.url('aiw10-closed.html');
    await openAiWeb(page);
    await addEntry(page, name, url);
    await openEntry(page, name, url);
    const first = await selectedTab(page).getAttribute('data-dockkit-tab');
    await page.getByRole('button', { name: '返回鲸翼', exact: true }).waitFor();
    await selectedTab(page).getByRole('button', { name: '关闭' }).click();
    await settled(() => browserTabs(page).count(), 0, '标签关掉了');
    const loads = site.hits('aiw10-closed.html');
    await aiView(page).waitFor({ state: 'visible', timeout: 15_000 });
    await settled(() => currentNames(page), [], '关掉标签后不再标“正在用”');
    assert.equal(await resumeButton(page).count(), 0, '没有“继续使用”');
    await openEntry(page, name, url);
    assert.equal(await browserTabs(page).count(), 1, '新开了一个标签');
    assert.notEqual(await selectedTab(page).getAttribute('data-dockkit-tab'), first, '不是原来那个标签');
    assert.equal(await addressBar(page).inputValue(), url);
    assert.ok(site.hits('aiw10-closed.html') > loads, '网页重新载入了');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// AIW-10 需求§AI 网页第 4 条（正在用的那个标“正在用”）；需求§AI 网页（自建入口可删除）
test('反例：正在用的入口被删除后，AI 网页页签不再标“正在用”、没有“继续使用”，刷新后回来也一样', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    const name = `鲸翼测试-AIW10-删-${suffix()}`, url = site.url('aiw10-removed.html');
    await openAiWeb(page);
    await addEntry(page, name, url);
    await openEntry(page, name, url);
    await backToAiWeb(page);
    // 对照：删除前标着“正在用”，有“继续使用”。
    await settled(() => currentNames(page), [name]);
    await resumeButton(page).waitFor();
    await removeEntry(page, name);
    const nothingInUse = async when => {
      const total = builtinCount + storedAiWebEntries(dsh.home).length;
      await settled(() => aiView(page).locator('.ww-ai-tile').count(), total, `${when}：入口清单读回来了`);
      assert.deepEqual(await currentNames(page), [], `${when}：没有标“正在用”的入口`);
      assert.equal(await aiView(page).locator('.ww-ai-current').count(), 0);
      assert.equal(await resumeButton(page).count(), 0, `${when}：没有“继续使用”`);
      assert.match(await textOf(aiView(page).locator('.ww-pagehead p')), new RegExp(`^${total} 个入口`), `${when}：页头写入口数`);
    };
    await nothingInUse('刚删掉');
    // 刷新页面：工作台重新挂载，按本机记下的入口恢复时，入口已不在目录里。
    await page.reload();
    await backToAiWeb(page);
    await nothingInUse('刷新后回来');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

/** 「AI 网页」会话开始页上鲸翼的那排小按钮（“返回鲸翼”旁边）。 */
const heroButton = (page, name) => page.getByRole('button', { name, exact: true });

/** 提问台：写问题、把几个自建入口加进“发给”。入口都指向本机替身网页。 */
async function composeAsk(page, question, names) {
  const desk = aiView(page).locator('.ww-ai-desk');
  await desk.getByRole('textbox', { name: '想问什么' }).fill(question);
  for (const name of names) await aiView(page).getByRole('button', { name: `加进提问台 ${name}`, exact: true }).click();
  return desk;
}

// AIW-13 需求§AI 网页·提问台（问题写一次，点卡片“+”选几家；发之前能看一眼；发出去全部内容进剪贴板、依次打开，前两家并排）；决策 2026-11-13
test('提问台：写问题、点“+”选两家，看一眼后发出去；问题在剪贴板里，两家在「AI 网页」会话右侧并排打开', async t => {
  await withPage(browser, t, { width: 1600 }, async ({ page, errors, external }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await openAiWeb(page);
    const tag = suffix(), first = `提问甲${tag}`, second = `提问乙${tag}`, question = `帮我列一个季度复盘的提纲 ${tag}`;
    const urls = [site.url(`aiw13a-${tag}.html`), site.url(`aiw13b-${tag}.html`)];
    await addEntry(page, first, urls[0]); await addEntry(page, second, urls[1]);
    const desk = aiView(page).locator('.ww-ai-desk');
    assert.equal(await desk.getByRole('button', { name: '发给…', exact: true }).isDisabled(), true, '没选人时发不出去');
    await composeAsk(page, question, [first, second]);
    assert.deepEqual(await desk.locator('.ww-ai-to').evaluateAll(items => items.map(item => item.firstChild.textContent)), [first, second]);
    assert.equal(await aiView(page).getByRole('button', { name: `从提问台去掉 ${first}`, exact: true }).getAttribute('aria-pressed'), 'true');
    await desk.getByRole('button', { name: '看一眼要发的内容', exact: true }).click();
    const preview = modal(page, '发之前看一眼');
    await preview.waitFor();
    assert.equal(await isCentered(page, preview), true, '看一眼是居中弹窗');
    assert.equal(await textOf(preview.locator('.ww-ai-payload')), question, '只有问题时原样带过去');
    assert.equal(site.hits(`aiw13a-${tag}.html`), 0, '看一眼不打开网页');
    await dialogButton(preview, '复制并打开 2 家').click();
    await page.waitForFunction(() => document.title.startsWith('AI 网页'), null, { timeout: 30_000 });
    for (const url of urls) await page.frameLocator(`iframe[src="${url}"]`).locator('#marker').waitFor({ timeout: 30_000 });
    const boxes = await Promise.all(urls.map(url => page.locator(`iframe[src="${url}"]`).boundingBox()));
    assert.ok(boxes[0].width > 100 && boxes[1].width > 100, `两家都看得见：${JSON.stringify(boxes)}`);
    assert.ok(boxes[0].x + boxes[0].width <= boxes[1].x + 1, `两家各占一栏、不重叠：${JSON.stringify(boxes)}`);
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), question, '问题在剪贴板里');
    await toast(page, `已复制问题。到 ${first}、${second} 的输入框里各按一次 Ctrl V，再按发送`, 'success').waitFor();
    // 开始页“返回鲸翼”旁边：再复制问题、贴进来。
    for (const name of ['返回鲸翼', '再复制问题', '贴进来']) await heroButton(page, name).waitFor();
    // 员工复制了别的东西之后，“再复制问题”把问题放回剪贴板。
    await page.evaluate(() => navigator.clipboard.writeText('别的内容'));
    await heroButton(page, '再复制问题').click();
    await settled(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), question, '问题又回到剪贴板');
    // 回到鲸翼：上一问填回提问台，第一家标“正在用”。
    await backToAiWeb(page);
    assert.equal(await aiView(page).locator('.ww-ai-desk textarea').inputValue(), question);
    assert.deepEqual(await currentNames(page), [first]);
    await removeEntry(page, first); await removeEntry(page, second);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// AIW-14 需求§AI 网页·带回来（员工自己复制回答，点“贴进来”，存进知识积累收件箱：哪家答的、问的什么、哪天；同一问接着存同一篇）；决策 2026-11-13
test('带回来：在「AI 网页」会话开始页点“贴进来”，复制的回答存进知识积累的收件箱；同一问的第二段接着存进同一篇', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await openAiWeb(page);
    const tag = suffix(), name = `带回${tag}`, question = `帮我把周报改简洁 ${tag}`, url = site.url(`aiw14-${tag}.html`);
    await addEntry(page, name, url);
    const desk = await composeAsk(page, question, [name]);
    await desk.getByRole('button', { name: '发给 1 家', exact: true }).click();
    await page.frameLocator(`iframe[src="${url}"]`).locator('#marker').waitFor({ timeout: 30_000 });
    // 刚发出去时剪贴板里还是问题：贴进来的框是空的，请员工粘贴，不把问题当成回答。
    await heroButton(page, '贴进来').click();
    const paste = modal(page, '贴进来');
    await paste.waitFor();
    assert.equal(await isCentered(page, paste), true, '贴进来是居中弹窗');
    await settled(() => textOf(paste.locator('p[role=status]')), '没读到剪贴板。在下面的框里按 Ctrl V 贴进来。', '剪贴板里还是那一问时不放进框里');
    assert.equal(await dialogButton(paste, '存进知识积累').isDisabled(), true, '没有内容时不能存');
    assert.match(await textOf(paste.locator('.ww-ai-paste-ask')), new RegExp(`^问的：${question}`));
    assert.deepEqual(await paste.locator('select option').allInnerTexts(), [name], '“哪家答的”列这个会话里开着的');
    await dialogButton(paste, '取消').click();
    await paste.waitFor({ state: 'detached' });
    // 员工在网页里复制了一段回答。
    await page.evaluate(() => navigator.clipboard.writeText('第一段回答：先说结果，再说原因。'));
    await heroButton(page, '贴进来').click();
    await paste.waitFor();
    await settled(() => paste.locator('textarea').inputValue(), '第一段回答：先说结果，再说原因。', '读到剪贴板就直接放进框里');
    await dialogButton(paste, '存进知识积累').click();
    await toast(page, `已存进知识积累的收件箱：《${question}》`, 'success').waitFor();
    const file = path.join(dsh.vault, '10-收件箱', `${question}.md`);
    const today = await page.evaluate(() => { const now = new Date(), two = value => String(value).padStart(2, '0'); return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`; });
    assert.equal(fs.readFileSync(file, 'utf8'), `---\ntype: capture\nstatus: inbox\ncreated: ${today}\nupdated: ${today}\naliases: []\n---\n\n# ${question}\n\n问的：\n\n> ${question}\n\n## ${name} 的回答\n\n来源：${name} 网页（${url}），${today} 贴回\n\n第一段回答：先说结果，再说原因。\n`);
    // 同一问再贴一段：接着存进同一篇，不另起一篇。
    await page.evaluate(() => navigator.clipboard.writeText('第二段回答：补一个数字。'));
    await heroButton(page, '贴进来').click();
    await paste.waitFor();
    await settled(() => paste.locator('textarea').inputValue(), '第二段回答：补一个数字。', '第二段也读到了');
    await dialogButton(paste, '存进知识积累').click();
    await toast(page, `已接着存进《${question}》`, 'success').waitFor();
    assert.match(fs.readFileSync(file, 'utf8'), /第一段回答：先说结果，再说原因。\n\n## .+ 的回答\n\n来源：.+ 贴回\n\n第二段回答：补一个数字。\n$/);
    assert.deepEqual(fs.readdirSync(path.join(dsh.vault, '10-收件箱')).filter(item => item.includes(tag)), [`${question}.md`]);
    await backToAiWeb(page);
    await removeEntry(page, name);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});
