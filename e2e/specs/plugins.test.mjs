import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import { startDsh } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, textOf, toast, modal, dialogButton } from '../support/browser.mjs';

// 需求§技能中心 · 插件：插件包（照 Claude 的插件包，一组技能加一组 MCP），一次装好、一起停用、一起卸载。
const echo = fileURLToPath(new URL('../support/echo-mcp.mjs', import.meta.url));
let dsh, browser;
before(async () => { dsh = await startDsh({}); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await dsh?.stop(); });

const kit = page => page.locator('section.ww-kit-page');
const drawer = page => page.locator('dialog.ww-editor[open]');
const packsDir = () => path.join(dsh.home, 'skills', '.system', 'whalewing', 'packs');
/** 临时 DSH 里所有含这段文字的文件（不看 node_modules）。 */
function holders(text) {
  const found = [];
  const walk = dir => { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, item.name); if (item.isDirectory()) { if (item.name !== 'node_modules') walk(full); } else if (fs.statSync(full).size < 5e6 && fs.readFileSync(full, 'utf8').includes(text)) found.push(path.relative(dsh.home, full).split(path.sep).join('/')); } };
  walk(dsh.home);
  return found;
}
async function openPlugins(page) {
  await openWhaleWing(page, dsh.url);
  await openTab(page, '技能中心');
  await kit(page).getByRole('tab', { name: '插件', exact: true }).click();
}

// PLG-01 需求§技能中心（插件·我的：上传插件包，预览里填密钥，装好后技能列在“技能”、MCP 连上；停用一起停，卸载一起删）
test('上传插件包：预览里看技能和 MCP、填密钥再装；装好后技能在“技能”里、MCP 连上，密钥只在凭据库；停用、卸载都一起', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-e2e-pack-'));
  try {
    const zip = path.join(dir, 'echo-pack.zip');
    fs.writeFileSync(zip, zipSync({
      'echo-pack/.claude-plugin/plugin.json': strToU8(JSON.stringify({ name: 'echo-pack', version: '0.1.0', description: '鲸翼测试 PLG01：一项技能和一个本机 MCP', author: { name: '测试' }, userConfig: { token: { type: 'string', title: '回声口令', sensitive: true } } })),
      'echo-pack/skills/echo-notes/SKILL.md': strToU8('---\nname: echo-notes\ndescription: 鲸翼测试 PLG01 的技能\n---\n\n照着回声做。\n'),
      'echo-pack/server/echo.mjs': new Uint8Array(fs.readFileSync(echo)),
      'echo-pack/commands/hi.md': strToU8('# hi'),
      'echo-pack/.mcp.json': strToU8(JSON.stringify({ mcpServers: { echo: { command: process.execPath, args: ['${CLAUDE_PLUGIN_ROOT}/server/echo.mjs'], env: { TOKEN: '${user_config.token}' } } } })),
    }));
    await withPage(browser, t, async ({ page, errors, external }) => {
      await openPlugins(page);
      await kit(page).getByText('还没有插件包').waitFor();
      await kit(page).locator('input[aria-label="上传插件包"]').setInputFiles(zip);
      const preview = drawer(page).filter({ has: page.locator('header h2', { hasText: 'echo-pack' }) });
      await preview.waitFor();
      const text = await textOf(preview);
      for (const part of ['echo-notes', '上传（echo-pack.zip）', '回声口令', '会在你的电脑上运行这条命令']) assert.ok(text.includes(part), `预览里有“${part}”`);
      assert.ok(!text.includes('命令（') && !text.includes('个命令'), '包里给 Claude 用的命令 DSH 用不上，不写（用户定：用不了的就不写）');
      assert.equal(await preview.locator('input[type=checkbox]').isChecked(), true, '自己上传的本机程序默认勾上，只提醒');
      await preview.getByRole('button', { name: '安装' }).click();
      await preview.getByRole('alert').filter({ hasText: '还没填：回声口令' }).waitFor();
      await preview.locator('input[type=password]').fill('SECRET-PACK-42');
      await preview.getByRole('button', { name: '安装' }).click();
      await toast(page, '已装好「echo-pack」', 'success').waitFor({ timeout: 60_000 });
      const detail = drawer(page).filter({ hasText: '已连上 · 1 个工具' });
      await detail.waitFor({ timeout: 60_000 });
      assert.match(await textOf(detail), /没装的 MCP|技能（1）/);
      assert.deepEqual(holders('SECRET-PACK-42'), ['.credentials.yaml'], '密钥只在 DSH 凭据库');
      assert.ok(fs.existsSync(path.join(packsDir(), 'echo-pack', 'server', 'echo.mjs')), '包的文件放在鲸翼区');
      await page.keyboard.press('Escape');
      const row = kit(page).locator('.ww-kit-row', { hasText: 'echo-pack' });
      assert.equal(await row.locator('.ww-kit-type').innerText(), '上传');
      // 包里的技能列在“技能”的“插件包”一组，只读。
      await kit(page).getByRole('tab', { name: '技能', exact: true }).click();
      const skill = kit(page).locator('section[aria-label="插件包"] .ww-kit-row', { hasText: 'echo-notes' });
      await skill.waitFor();
      assert.equal(await skill.locator('.ww-kit-type').innerText(), '插件包 · echo-pack');
      await skill.click();
      await drawer(page).getByText('这项技能来自插件包「echo-pack」，只读').waitFor();
      await drawer(page).getByRole('button', { name: '查看插件包' }).click();
      // 停用：MCP 跟着断开；再启用。
      const packDrawer = drawer(page).filter({ has: page.locator('header h2', { hasText: 'echo-pack' }) });
      await packDrawer.getByRole('button', { name: '停用' }).click();
      await toast(page, '已停用「echo-pack」', 'success').waitFor();
      await packDrawer.getByText('包已停用').waitFor();
      await packDrawer.getByRole('button', { name: '启用' }).click();
      await toast(page, '已启用「echo-pack」', 'success').waitFor();
      // 卸载：居中确认，技能、MCP、密钥和文件夹一起删。
      await packDrawer.getByRole('button', { name: '卸载' }).click();
      await dialogButton(modal(page, '卸载插件包'), '卸载', { exact: true }).click();
      await toast(page, '已卸载「echo-pack」', 'success').waitFor();
      await kit(page).getByText('还没有插件包').waitFor();
      assert.deepEqual(holders('SECRET-PACK-42'), [], '凭据库里的密钥一起删了');
      assert.equal(fs.existsSync(path.join(packsDir(), 'echo-pack')), false);
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// PLG-06 需求§技能中心（插件·更新：装过同名的包时原地更新到新的一份，原来装好的 MCP 沿用设置和密钥，开没开照旧；2026-11-18）
test('插件包原地更新：再传新版，预览写“更新到这一版”、原来的 MCP 不用再填；更新后新技能在、MCP 照样连上、密钥还在；同一份再传是“已是这一版”', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-e2e-pack-update-'));
  const zipOf = (version, extra = {}) => {
    const file = path.join(dir, `echo-pack-${version}.zip`);
    fs.writeFileSync(file, zipSync({
      'echo-pack/.claude-plugin/plugin.json': strToU8(JSON.stringify({ name: 'echo-pack', version, description: '鲸翼测试 PLG06', userConfig: { token: { type: 'string', title: '回声口令', sensitive: true } } })),
      'echo-pack/skills/echo-notes/SKILL.md': strToU8('---\nname: echo-notes\ndescription: 鲸翼测试 PLG06 的技能\n---\n\n照着回声做。\n'),
      'echo-pack/server/echo.mjs': new Uint8Array(fs.readFileSync(echo)),
      'echo-pack/.mcp.json': strToU8(JSON.stringify({ mcpServers: { echo: { command: process.execPath, args: ['${CLAUDE_PLUGIN_ROOT}/server/echo.mjs'], env: { TOKEN: '${user_config.token}' } } } })),
      ...extra,
    }));
    return file;
  };
  try {
    const v1 = zipOf('0.1.0'), v2 = zipOf('0.2.0', { 'echo-pack/skills/echo-more/SKILL.md': strToU8('---\nname: echo-more\ndescription: 鲸翼测试 PLG06 新版加的技能\n---\n\n多回一句。\n') });
    await withPage(browser, t, async ({ page, errors, external }) => {
      await openPlugins(page);
      const upload = async file => { await kit(page).locator('input[aria-label="上传插件包"]').setInputFiles(file); const preview = drawer(page).filter({ has: page.locator('header h2', { hasText: 'echo-pack' }) }).filter({ has: page.locator('footer') }); await preview.locator('footer .ww-primary').waitFor(); return preview; };
      let preview = await upload(v1);
      await preview.locator('input[type=password]').fill('SECRET-PACK-UPDATE');
      await preview.getByRole('button', { name: '安装' }).click();
      await toast(page, '已装好「echo-pack」', 'success').waitFor({ timeout: 60_000 });
      await drawer(page).filter({ hasText: '已连上 · 1 个工具' }).waitFor({ timeout: 60_000 });
      await page.keyboard.press('Escape');
      preview = await upload(v2);
      const text = await textOf(preview);
      assert.ok(text.includes('已经装了这个包（0.1.0）') && text.includes('原来装好的 MCP 沿用原来的设置和密钥'), text);
      assert.ok(text.includes('已经装好，沿用原来的设置和密钥'));
      assert.equal(await preview.locator('input[type=password]').count(), 0, '原来的 MCP 不用再填密钥');
      await preview.getByRole('button', { name: '更新到这一版' }).click();
      await toast(page, '已更新「echo-pack」到 0.2.0', 'success').waitFor({ timeout: 60_000 });
      const detail = drawer(page).filter({ hasText: '已连上 · 1 个工具' });
      await detail.waitFor({ timeout: 60_000 });
      assert.match(await textOf(detail), /echo-more/, '新版加的技能在');
      assert.deepEqual(holders('SECRET-PACK-UPDATE'), ['.credentials.yaml'], '密钥还在凭据库');
      await page.keyboard.press('Escape');
      preview = await upload(v2);
      assert.equal(await preview.getByRole('button', { name: '已是这一版' }).isDisabled(), true, '同一份再传不用更新');
      await page.keyboard.press('Escape');
      // 收尾：卸载。
      await kit(page).locator('.ww-kit-row', { hasText: 'echo-pack' }).click();
      await drawer(page).getByRole('button', { name: '卸载' }).click();
      await dialogButton(modal(page, '卸载插件包'), '卸载', { exact: true }).click();
      await toast(page, '已卸载「echo-pack」', 'success').waitFor();
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// PLG-02 需求§技能中心（插件·发现：鲸翼精选四个包，点开先预览，里面的技能和 MCP 列清楚）
test('发现·插件：鲸翼精选四个包排在最前，点开“录音进第二大脑”先预览两项技能和 Plaud MCP', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openPlugins(page);
    await kit(page).getByRole('tab', { name: '发现', exact: true }).click();
    const curated = kit(page).locator('.ww-kit-shelf').first();
    await curated.locator('.ww-kit-card').first().waitFor();
    assert.equal(await curated.locator('h3').evaluate(item => item.firstChild.textContent), '鲸翼精选');
    assert.deepEqual(await curated.locator('.ww-kit-card .ww-kit-name').allInnerTexts(), ['出行规划', '飞书办公', '联网搜索', '录音进第二大脑']);
    await curated.getByRole('button', { name: '录音进第二大脑' }).click();
    const preview = drawer(page).filter({ has: page.locator('header h2', { hasText: '录音进第二大脑' }) });
    await preview.getByText('recording-digest').waitFor();
    const text = await textOf(preview);
    for (const part of ['recording-archive', 'plaud', '鲸翼精选']) assert.ok(text.includes(part), `预览里有“${part}”`);
    assert.equal(await preview.locator('input[type=checkbox]').isChecked(), true, '不用填密钥的 MCP 默认勾上');
    await preview.getByRole('button', { name: '取消' }).click();
    await preview.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});
