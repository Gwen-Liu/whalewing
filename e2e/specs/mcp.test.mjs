import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDsh } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, textOf, toast, modal, dialogButton } from '../support/browser.mjs';

// 需求§技能中心 · MCP（0.2.2-rc.3.2 起，2026-11-15 用户选“方向三”）：员工加的 MCP 写进 DSH 自己的配置（profile 的 cordis.patch.yml，
// 经 DSH 的设置服务），密钥按名字存进 DSH 凭据库、配置里只写 ${credential:名字}；由 DSH 的 MCP 管理器连。
const echo = fileURLToPath(new URL('../support/echo-mcp.mjs', import.meta.url));
let dsh, browser;
before(async () => { dsh = await startDsh({}); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await dsh?.stop(); });

const page$ = page => page.locator('section.ww-kit-page');
const drawer = page => page.locator('dialog.ww-editor[open]');
const profilePatch = () => { try { return fs.readFileSync(path.join(dsh.home, 'profiles', 'e2e', 'cordis.patch.yml'), 'utf8'); } catch { return ''; } };
/** 临时 DSH 里所有含这段文字的文件（不看 node_modules）。 */
function holders(text) {
  const found = [];
  const walk = dir => { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, item.name); if (item.isDirectory()) { if (item.name !== 'node_modules') walk(full); } else if (fs.statSync(full).size < 5e6 && fs.readFileSync(full, 'utf8').includes(text)) found.push(path.relative(dsh.home, full).split(path.sep).join('/')); } };
  walk(dsh.home);
  return found;
}
/** 打开“自定义 MCP”，填一个本机回声。 */
async function fillEcho(page, { title, name, token }) {
  await page$(page).getByRole('button', { name: '添加 MCP', exact: true }).click();
  await page.locator('.ww-menu-surface:popover-open').getByRole('button', { name: '自定义 MCP' }).click();
  const editor = drawer(page);
  await editor.locator('label', { hasText: '显示名称' }).locator('input').fill(title);
  await editor.locator('label', { hasText: '英文名' }).locator('input').fill(name);
  await editor.locator('label', { hasText: '方式' }).locator('select').selectOption('stdio');
  await editor.locator('label', { hasText: '命令' }).locator('input').fill(process.execPath);
  await editor.locator('label', { hasText: '参数' }).locator('textarea').fill(echo);
  await editor.getByRole('button', { name: '加一行环境变量' }).click();
  await editor.getByRole('textbox', { name: '环境变量名' }).fill('TOKEN');
  await editor.getByRole('textbox', { name: '环境变量值' }).fill(token);
  await editor.locator('.ww-kit-pair input[type=checkbox]').check();
  return editor;
}

// MCP-01 需求§技能中心（MCP：自定义添加本机程序，写进 DSH 配置，连上列出工具，密钥只进 DSH 凭据库；删除时配置和密钥一起删）
test('自定义添加本机 MCP：写进 DSH 配置（只有密钥引用），连上后列出工具，密钥只在 DSH 凭据库；删除后配置和密钥都删掉', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '技能中心');
    await page$(page).getByRole('tab', { name: 'MCP' }).click();
    await page$(page).getByText('还没有 MCP').waitFor();
    const editor = await fillEcho(page, { title: '本机回声', name: 'echo-test', token: 'SECRET-ECHO-123' });
    await editor.getByRole('button', { name: '添加' }).click();
    await toast(page, '已添加「本机回声」', 'success').waitFor({ timeout: 60_000 });
    // 保存后先显示“正在连”，DSH 连上后列表每 3 秒刷新一次，详情里出现工具。
    const detail = drawer(page).filter({ hasText: '工具（1）' });
    await detail.waitFor({ timeout: 60_000 });
    const text = await textOf(detail);
    assert.match(text, /已保存 ••••••/); assert.match(text, /凭据库里的名字：WHALEWING_MCP_ECHO_TEST_ENV_TOKEN/); assert.doesNotMatch(text, /SECRET-ECHO-123/);
    assert.match(text, /mcp__echo-test__/); assert.match(text, /存在 DSH 自己的配置里，卸载鲸翼也还在/);
    assert.deepEqual(holders('SECRET-ECHO-123'), ['.credentials.yaml'], '密钥只在 DSH 凭据库');
    const patch = profilePatch();
    assert.match(patch, /echo-test:/); assert.match(patch, /TOKEN: \$\{credential:WHALEWING_MCP_ECHO_TEST_ENV_TOKEN\}/, 'DSH 配置里只写引用');
    await page.keyboard.press('Escape');
    const row = page$(page).locator('.ww-kit-group[aria-label="我的 MCP"] .ww-kit-row', { hasText: '本机回声' });
    await row.locator('.ww-kit-status', { hasText: '已连上 · 1 个工具' }).waitFor();
    // 删除：居中确认，DSH 配置里那条和凭据库里的密钥一起删。
    await row.click();
    await drawer(page).getByRole('button', { name: '删除' }).click();
    const confirm = modal(page, '删除 MCP');
    assert.match(await textOf(confirm), /会从 DSH 配置里删掉/);
    await dialogButton(confirm, '删除').click();
    await toast(page, '已删除「本机回声」', 'success').waitFor();
    await page$(page).getByText('还没有 MCP').waitFor();
    assert.deepEqual(holders('SECRET-ECHO-123'), [], '凭据库里的密钥一起删了');
    assert.doesNotMatch(profilePatch(), /echo-test:/, 'DSH 配置里也删了');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// MCP-03 需求§技能中心（MCP：添加时可以先“试连一下”，看到对方是谁、有哪些工具；试连不保存、不存密钥）
test('添加时先“试连一下”：显示能连上、对方名称和工具；不写配置、不存密钥；关掉要确认放弃', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '技能中心');
    await page$(page).getByRole('tab', { name: 'MCP' }).click();
    const editor = await fillEcho(page, { title: '试一下', name: 'echo-try', token: 'TRY-TOKEN-456' });
    await editor.getByRole('button', { name: '试连一下' }).click();
    const result = editor.locator('.ww-kit-probe', { hasText: '能连上' });
    await result.waitFor({ timeout: 60_000 });
    assert.match(await textOf(result), /对方是「echo-test 1\.0\.0」，有 1 个工具/);
    assert.match(await textOf(result), /echo/);
    assert.doesNotMatch(profilePatch(), /echo-try/, '试连不写配置');
    assert.deepEqual(holders('TRY-TOKEN-456'), [], '试连不存密钥');
    // 地址填错的远程服务：试连说清连不上。
    await editor.locator('label', { hasText: '方式' }).locator('select').selectOption('streamable-http');
    await editor.locator('input[type=url]').fill('http://127.0.0.1:9/mcp');
    await editor.getByRole('button', { name: '试连一下' }).click();
    await editor.locator('.ww-kit-probe.ww-error', { hasText: '连不上' }).waitFor({ timeout: 30_000 });
    await editor.getByRole('button', { name: '取消编辑' }).click();
    await dialogButton(modal(page, '放弃修改'), '放弃修改').click();
    await page$(page).getByText('还没有 MCP').waitFor();
    assert.deepEqual(errors, []);
  });
});

// MCP-02 需求§技能中心（发现·MCP：鲸翼精选日常常用的 22 个按分类摆，每张卡写分类和方式；不再搜 MCP 官方目录）
test('发现·MCP：鲸翼精选按七个分类摆，22 个，卡片写推荐给哪几位专家；筛选到一个分类只显示那一类；搜不到时给“自定义 MCP”', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '技能中心');
    await page$(page).getByRole('tab', { name: 'MCP' }).click();
    await page$(page).getByRole('tab', { name: '发现' }).click();
    const shelves = page$(page).locator('.ww-kit-shelf h3');
    await shelves.first().waitFor();
    assert.deepEqual(await shelves.evaluateAll(items => items.map(item => item.firstChild.textContent)), ['地图出行', '办公协作', '文档知识', '录音会议', '搜索资料', '浏览器与图表', '开发设计']);
    assert.equal(await page$(page).locator('.ww-kit-card').count(), 22);
    await page$(page).getByRole('button', { name: '筛选', exact: true }).click();
    await page.locator('.ww-menu-surface:popover-open').locator('button').filter({ hasText: '录音会议' }).click();
    assert.deepEqual(await page$(page).locator('.ww-kit-card .ww-kit-name').allInnerTexts(), ['Plaud 录音']);
    // 2026-11-14 用户定：MCP 不按专家分、不强制绑，卡片上写推荐给哪几位专家（名字跟着专家团队，小鲸改了名这里也跟着变）。
    assert.match(await textOf(page$(page).locator('.ww-kit-card .ww-kit-rec-line')), /^推荐给小鲸[^、]*、写作专家$/);
    await page$(page).getByRole('button', { name: '筛选', exact: true }).click();
    await page.locator('.ww-menu-surface:popover-open').locator('button').filter({ hasText: '全部' }).click();
    await page$(page).getByRole('searchbox', { name: '搜索' }).fill('没有这种服务');
    await page$(page).getByText('精选里没有匹配的 MCP').waitFor();
    await page$(page).locator('.ww-kit-empty').getByRole('button', { name: '自定义 MCP' }).click();
    await drawer(page).locator('header h2', { hasText: '自定义 MCP' }).waitFor();
    assert.deepEqual(errors, []);
  });
});
