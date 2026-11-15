import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDsh } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, textOf, toast } from '../support/browser.mjs';

// 需求§技能中心 · MCP（0.2.2-rc.3.2 起）：DSH 配置文件里手写的 MCP（MCP 管理器那一节）也列在“我的 MCP”，标“配置文件里写的”，
// 鲸翼能改；它引用的密钥凭据库里还没有时，DSH 报“等密钥”，在详情里补上就自己连上。
const echo = fileURLToPath(new URL('../support/echo-mcp.mjs', import.meta.url)).replaceAll('\\', '/');
const node = process.execPath.replaceAll('\\', '/');
let dsh, browser;
before(async () => {
  dsh = await startDsh({
    // 员工自己在 profile 的 cordis.patch.yml 里写了一条，引用凭据库里的 E2E_GH_TOKEN（还没存）。
    seed: dirs => fs.writeFileSync(path.join(dirs.home, 'profiles', 'e2e', 'cordis.patch.yml'), [
      '- id: mcp-manager',
      "  name: '@deepseek-ai/dsh-mcp-manager'",
      '  config:',
      '    servers:',
      '      Hand_Written:',
      '        transport: stdio',
      `        command: '${node}'`,
      '        args:',
      `          - '${echo}'`,
      '        env:',
      "          TOKEN: '${credential:E2E_GH_TOKEN}'",
      '',
    ].join('\n')),
  });
  browser = await launchBrowser();
});
after(async () => { await browser?.close(); await dsh?.stop(); });

const page$ = page => page.locator('section.ww-kit-page');
const drawer = page => page.locator('dialog.ww-editor[open]');

// MCP-04 需求§技能中心（MCP：DSH 配置文件里写的列为“配置文件里写的”；缺密钥显示“等密钥”和原因，详情里补上密钥后自己连上）
test('DSH 配置文件里写的 MCP：标“配置文件里写的”，缺密钥显示“等密钥”；在详情里填密钥后 DSH 自己连上，密钥存在凭据库它原来引用的名字下', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '技能中心');
    await page$(page).getByRole('tab', { name: 'MCP' }).click();
    const row = page$(page).locator('.ww-kit-group[aria-label="我的 MCP"] .ww-kit-row', { hasText: 'Hand_Written' });
    await row.waitFor();
    assert.match(await textOf(row), /配置文件里写的/);
    await row.locator('.ww-kit-status', { hasText: '等密钥' }).waitFor({ timeout: 30_000 });
    assert.match(await textOf(row), /凭据库里还没有它要的密钥，补上后自己连上/);
    await page.getByText('MCP 1 个 · 已连上 0 · 要处理 1').waitFor();
    await row.click();
    const detail = drawer(page);
    assert.match(await textOf(detail), /凭据库里的名字：E2E_GH_TOKEN/);
    await detail.getByRole('button', { name: '填密钥' }).click();
    await detail.getByRole('textbox', { name: 'TOKEN的值' }).fill('hand-token-789');
    await detail.getByRole('button', { name: '保存', exact: true }).click();
    await toast(page, '密钥已存进 DSH 凭据库', 'success').waitFor();
    await detail.filter({ hasText: '工具（1）' }).waitFor({ timeout: 60_000 });
    assert.match(fs.readFileSync(path.join(dsh.home, '.credentials.yaml'), 'utf8'), /E2E_GH_TOKEN/);
    assert.doesNotMatch(fs.readFileSync(path.join(dsh.home, 'profiles', 'e2e', 'cordis.patch.yml'), 'utf8'), /hand-token-789/, '配置文件里还是引用');
    assert.deepEqual(errors, []);
  });
});
