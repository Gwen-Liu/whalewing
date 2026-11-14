import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startDsh } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, textOf } from '../support/browser.mjs';

// 需求§技能中心 · 技能（2026-11-09 用户要照 Codex 按项目分类）：DSH 还会从共用目录（~/.agents/skills）和各工作区项目的
// .dsh/skills、.agents/skills 发现技能，鲸翼一起列出来、只读；“已安装”一行两个、能展开收起。
const skill = (name, description) => `---\nname: ${name}\ndescription: ${description}\n---\n\n${name} 的做法。\n`;
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
let dsh, browser, project;
before(async () => {
  dsh = await startDsh({ seed: dirs => {
    write(path.join(dirs.agents, 'skills', 'shared-notes', 'SKILL.md'), skill('shared-notes', '鲸翼测试 SKL-20：共用目录里的技能'));
    project = path.join(dirs.root, 'blog');
    fs.mkdirSync(path.join(project, '.git'), { recursive: true });
    fs.mkdirSync(path.join(project, 'posts'), { recursive: true });
    write(path.join(project, '.agents', 'skills', 'blog-helper', 'SKILL.md'), skill('blog-helper', '鲸翼测试 SKL-20：博客项目里的技能'));
    // 侧栏里的一个工作区，开在项目的子文件夹里：项目按往上找到 .git 的那层算。
    const id = randomUUID(), stamp = new Date().toISOString();
    write(path.join(dirs.home, 'storages', 'workspace.json'), JSON.stringify({
      unit: { name: 'workspace', version: 2 },
      global: { initialized: true, workspaceIds: [id], archivedSessionIds: [], pinnedSessionIds: [] },
      tables: { workspaces: { [id]: { path: path.join(project, 'posts'), title: 'posts', sessionIds: [], createdAt: stamp, updatedAt: stamp } } },
    }));
  } });
  browser = await launchBrowser();
});
after(async () => { await browser?.close(); await dsh?.stop(); });

const kit = page => page.locator('section.ww-kit-page');
const installed = page => kit(page).locator('section[aria-label="已安装"]');
const chips = page => kit(page).locator('[aria-label="按来源和项目看"] button');

// SKL-20 需求§技能中心（我的·技能：一行两个、展开收起；下面按个人、共用、内置、各项目分类；共用和项目里的只读）
test('我的·技能：已安装一行两个，“查看…另有 N 项”展开、“收起”收回；分类里有共用目录和项目，项目技能只读', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    await openWhaleWing(page, dsh.url);
    await openTab(page, '技能中心');
    await installed(page).locator('.ww-kit-row').first().waitFor();
    assert.match(await textOf(kit(page).locator('.ww-pagehead p')), / · 共用 1 · .* · 项目里 1$/);
    // 一行两个：前两项在同一行，第三项换行。
    const boxes = await installed(page).locator('.ww-kit-row').evaluateAll(items => items.slice(0, 3).map(item => item.getBoundingClientRect()).map(box => ({ x: Math.round(box.x), y: Math.round(box.y) })));
    assert.equal(boxes[0].y, boxes[1].y, '前两项同一行'); assert.ok(boxes[1].x > boxes[0].x); assert.ok(boxes[2].y > boxes[0].y, '第三项换行');
    assert.equal(await installed(page).locator('.ww-kit-row').count(), 6, '先露 6 项');
    const more = installed(page).locator('button.ww-kit-more');
    assert.match(await textOf(more), /^查看 .+、.+，另有 \d+ 项$/);
    const total = await installed(page).locator('.ww-kit-row').count();
    await more.click();
    assert.ok(await installed(page).locator('.ww-kit-row').count() > total);
    assert.equal(await textOf(more), '收起');
    await more.click();
    assert.equal(await installed(page).locator('.ww-kit-row').count(), 6);
    // 下面一排分类：个人、共用、内置，再是项目（文件夹名）。
    assert.deepEqual(await chips(page).evaluateAll(items => items.map(item => item.firstChild.textContent)), ['个人', '共用', '内置', 'blog']);
    await chips(page).filter({ hasText: 'blog' }).click();
    const group = kit(page).locator('section[aria-label="blog"]');
    const row = group.locator('.ww-kit-row', { hasText: 'blog-helper' });
    assert.equal(await row.locator('.ww-kit-type').innerText(), '项目 · blog');
    await row.click();
    const drawer = page.locator('dialog.ww-editor[open]');
    await drawer.getByText('只有在这个项目里干活时 DSH 才会用').waitFor();
    assert.match(await textOf(drawer.locator('pre.ww-kit-content')), /blog-helper 的做法/);
    assert.equal(await drawer.getByRole('button', { name: '编辑技能' }).count(), 0, '只读');
    await page.keyboard.press('Escape');
    await chips(page).filter({ hasText: '共用' }).click();
    assert.equal(await kit(page).locator('section[aria-label="共用"] .ww-kit-row .ww-kit-type').innerText(), '共用');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});
