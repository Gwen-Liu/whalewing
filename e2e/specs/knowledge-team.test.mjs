// 知识积累里的团队知识：临时 DSH 另外装上测试用团队扩展（tests/fixtures/team-source），它按公开的知识来源接口给出三个知识空间：
// 自己所在那一层（能维护）、上一层公有的、企业公有的。左下角切换知识库，按层从近到远分组；能维护的空间可以改、新建；
// 自己的笔记在“更多操作”里提交到团队。夹具把改动只记在内存里，不写仓库文件。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDsh } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, toast } from '../support/browser.mjs';

const teamFixture = fileURLToPath(new URL('../../tests/fixtures/team-source/', import.meta.url));
let dsh, browser;
before(async () => { dsh = await startDsh({ extensions: [teamFixture] }); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await dsh?.stop(); });

const exact = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const trigger = page => page.locator('.ww-library-switch .ww-library-trigger');
const noteButton = (page, title) => page.locator('.ww-note-tree .ww-note').filter({ has: page.locator('.ww-tree-title', { hasText: exact(title) }) });
const folder = (page, name) => page.locator('.ww-note-tree .ww-folder', { hasText: exact(name) });
const moreActions = async page => { const details = page.locator('.ww-note-actions'); if (await details.getAttribute('open') === null) await details.locator('summary').click(); return details; };
const editor = page => page.getByRole('textbox', { name: 'Markdown 正文' });

async function openKnowledge(page) {
  await openWhaleWing(page, dsh.url, { assistant: 'float' });
  await openTab(page, '知识积累');
  await page.locator('.ww-knowledge-head p', { hasText: '团队知识 3 个空间' }).waitFor();
}

/** 点左下角切换，选一个知识库；返回切换前菜单里的分组标题和各项文字。 */
async function switchTo(page, name) {
  await trigger(page).click();
  const menu = page.getByRole('dialog', { name: '切换知识库' });
  await menu.waitFor();
  const headings = await menu.locator('.ww-menu-heading').allInnerTexts();
  // 名字和“可维护”之间的间距是样式给的，比较时去掉空白。
  const options = (await menu.locator('.ww-library-option > span').allInnerTexts()).map(text => text.replace(/\s+/g, ''));
  await menu.locator('.ww-library-option').filter({ has: page.locator('span', { hasText: name }) }).first().click();
  await menu.waitFor({ state: 'hidden' });
  return { headings, options };
}

// 需求§知识积累（团队知识插槽，2026-11-10）
test('知识积累：页名改了，左下角能切到团队的知识空间，按层从近到远分组，只读的和能维护的分开', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    assert.equal(await page.locator('.ww-knowledge-head h2').innerText(), '知识积累');
    assert.match(await page.locator('.ww-knowledge-head p').innerText(), /我的第二大脑在 .+ · 团队知识 3 个空间/);
    assert.equal((await trigger(page).innerText()).trim(), '我的第二大脑');
    await page.getByRole('group', { name: '全部笔记', exact: true }).waitFor();

    const listed = await switchTo(page, '实施组');
    assert.deepEqual(listed.headings, ['我所在 · 实施组', '上层公有 · 新客户上线项目', '企业公有'], '分组标题照组织树从近到远');
    assert.deepEqual(listed.options, ['我的第二大脑', '实施组可维护', '项目公共知识', '公司公共知识']);
    assert.equal((await trigger(page).innerText()).trim(), '实施组');
    assert.deepEqual(await page.locator('.ww-note-tree .ww-folder').allInnerTexts(), ['常见问题', '规范']);
    await folder(page, '规范').click();
    await noteButton(page, '发布规范').click();
    await page.locator('.ww-notice', { hasText: '你可以维护' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '编辑', exact: true }).isDisabled(), false);

    await switchTo(page, '公司公共知识');
    await noteButton(page, '员工手册').click();
    await page.locator('.ww-notice', { hasText: '只能阅读' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '编辑', exact: true }).isDisabled(), true, '企业公有的只读');

    await switchTo(page, '我的第二大脑');
    await page.getByRole('group', { name: '全部笔记', exact: true }).waitFor();
    assert.deepEqual(errors, []);
  });
});

test('能维护的空间里改笔记保存，交给扩展回读；新建笔记建在这个空间里', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await switchTo(page, '实施组');
    await folder(page, '常见问题').click();
    await noteButton(page, '登录失败怎么办').click();
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    const changed = `${(await editor(page).inputValue()).trimEnd()}\n\n补一条：先清浏览器缓存再试。\n`;
    await editor(page).fill(changed);
    await (await moreActions(page)).getByRole('button', { name: '保存', exact: true }).click();
    await toast(page, '已保存', 'success').waitFor();
    await page.getByRole('button', { name: '阅读', exact: true }).click();
    await page.locator('.ww-reader', { hasText: '先清浏览器缓存再试' }).waitFor();

    await page.getByRole('button', { name: '新建笔记', exact: true }).click();
    const target = await page.getByRole('textbox', { name: '库内 Markdown 路径' }).inputValue();
    assert.match(target, /^@fixture-team\/impl\/\d{4}-\d{2}-\d{2} 新笔记\.md$|^@team\/impl\/\d{4}-\d{2}-\d{2} 新笔记\.md$/, '建在正在看的空间里');
    await page.getByRole('textbox', { name: '库内 Markdown 路径' }).fill(target.replace(/[^/]+\.md$/, '交接清单.md'));
    await editor(page).fill('# 交接清单\n\n交接前把账号和文档都列出来。\n');
    await (await moreActions(page)).getByRole('button', { name: '保存', exact: true }).click();
    await toast(page, '已保存', 'success').waitFor();
    await noteButton(page, '交接清单').waitFor();
    assert.equal(fs.readdirSync(path.join(teamFixture, 'notes', 'impl')).includes('交接清单.md'), false, '夹具只记在内存里，不写仓库文件');
    assert.deepEqual(errors, []);
  });
});

test('自己的笔记在“更多操作”里提交到团队：右侧抽屉选知识空间和位置，结果在右上角说明', async t => {
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await page.locator('.ww-note-tree .ww-folder', { hasText: exact('30-领域') }).click();
    await page.locator('.ww-note-tree .ww-folder', { hasText: exact('个人管理') }).click();
    await noteButton(page, '关于我').click();
    await (await moreActions(page)).getByRole('button', { name: '提交到「团队」…' }).click();
    const drawer = page.getByRole('dialog', { name: '提交到团队' });
    await drawer.waitFor();
    assert.equal(await drawer.getByRole('combobox').inputValue(), 'team\nimpl', '默认是离自己最近的那个空间');
    assert.equal(await drawer.getByRole('textbox', { name: '放到空间里的位置' }).inputValue(), '关于我.md');
    await drawer.getByRole('combobox').selectOption({ label: '公司公共知识（企业）' });
    await drawer.getByRole('button', { name: '提交', exact: true }).click();
    await toast(page, '已提交，等「公司公共知识」的负责人审核').waitFor();
    await drawer.waitFor({ state: 'detached' });
    // 团队的笔记没有“提交到团队”，也不能在这里删。
    await page.locator('.ww-library-switch .ww-library-trigger').click();
    await page.getByRole('dialog', { name: '切换知识库' }).locator('.ww-library-option', { hasText: '实施组' }).click();
    await folder(page, '规范').click();
    await noteButton(page, '发布规范').click();
    await page.locator('.ww-notice', { hasText: '你可以维护' }).waitFor();
    const actions = await moreActions(page);
    assert.equal(await actions.getByRole('button', { name: /提交到/ }).count(), 0);
    assert.equal(await actions.getByRole('button', { name: '移到可恢复区', exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []);
  });
});
