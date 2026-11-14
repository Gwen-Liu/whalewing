// 扩展登记的定时任务（TSK-21，2026-11-10）：临时 DSH 另外装上测试用团队扩展（tests/fixtures/team-source），它按公开接口
// 登记“团队沉淀”，每天北京时间 02:00、读会话。鲸翼启动后自动建好；员工只能暂停和恢复，扩展开着时不能编辑、不能取消。
// 任务不能真的到点运行：别在北京时间 01:55–02:05 跑这个文件（同一夹具的知识积累用例也一样）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startDsh } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab } from '../support/browser.mjs';
import { storedTasks, storedWorkspaces } from '../support/schedules-fixture.mjs';

const teamFixture = fileURLToPath(new URL('../../tests/fixtures/team-source/', import.meta.url));
let dsh, browser;
const digest = () => storedTasks(dsh.home).find(task => task.record.title === '团队沉淀');
before(async () => {
  dsh = await startDsh({ extensions: [teamFixture] }); browser = await launchBrowser();
  const deadline = Date.now() + 60_000;
  while (!digest()) {
    if (Date.now() > deadline) throw new Error(`扩展的“团队沉淀”60 秒内没建好，现在有：${storedTasks(dsh.home).map(task => task.record.title).join('、') || '没有'}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
});
after(async () => { await browser?.close(); await dsh?.stop(); });

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const row = (page, title) => page.locator('.ww-task-row').filter({ has: page.locator('.ww-task-select > span', { hasText: new RegExp(`^[✓×!]?${escape(title)}$`) }) });
const detail = page => page.locator('.ww-task-detail');
async function taskMenu(page, title) {
  await row(page, title).getByRole('button', { name: '任务操作' }).click();
  const menu = row(page, title).getByRole('dialog', { name: '任务操作' });
  await menu.waitFor();
  return menu;
}

// 需求§定时任务（扩展登记的任务：标来源，名字、时间和说明由扩展维护，员工只能暂停和恢复，扩展开着时不能取消）
test('扩展登记的“团队沉淀”：自动建好、在鲸翼定时任务工作区；任务行标来源，详情写扩展的说明和读会话；菜单只有暂停、打开原会话和执行记录；暂停恢复后 DSH 里跟着变', async t => {
  const stored = digest();
  assert.equal(stored.record.kind, 'daily');
  assert.equal(stored.record.time, '02:00:00.000'); assert.equal(stored.record.timeZone, 'Asia/Shanghai');
  assert.equal(stored.status, 'active', '默认打开');
  assert.equal(storedWorkspaces(dsh.home).find(item => item.sessionIds.includes(stored.sessionId))?.title, '鲸翼定时任务', '任务会话归在侧栏“鲸翼定时任务”工作区');
  await withPage(browser, t, async ({ page, errors, shot }) => {
    await openWhaleWing(page, dsh.url, { assistant: 'float' });
    await openTab(page, '定时任务');
    await row(page, '团队沉淀').waitFor();
    assert.match(await row(page, '团队沉淀').locator('small').innerText(), /^团队 · 已启用 · /);
    await row(page, '团队沉淀').locator('.ww-task-select').click();
    await detail(page).locator('h2', { hasText: '团队沉淀' }).waitFor();
    const text = await detail(page).innerText();
    assert.match(text, /「团队」登记的任务/);
    assert.match(text, /每天把前一天和工作有关的内容整理成一篇沉淀/);
    assert.match(text, /名字、时间和说明由「团队」维护/);
    assert.match(text, /这个任务会读你 \d{4}\/\d{2}\/\d{2} \d{2}:\d{2} 以后的对话/);
    assert.doesNotMatch(text, /Markdown 沉淀|day_sources/, '给模型的说明不显示');
    await shot('详情');
    const menu = await taskMenu(page, '团队沉淀');
    assert.deepEqual((await menu.getByRole('button').allInnerTexts()).map(item => item.trim()), ['暂停', '打开原会话', '执行记录']);
    await menu.getByRole('button', { name: '暂停', exact: true }).click();
    await row(page, '团队沉淀').locator('small', { hasText: '已暂停' }).waitFor();
    assert.equal(digest().status, 'paused', 'DSH 自己的存储里也暂停了');
    await (await taskMenu(page, '团队沉淀')).getByRole('button', { name: '恢复', exact: true }).click();
    await row(page, '团队沉淀').locator('small', { hasText: '已启用' }).waitFor();
    assert.equal(digest().status, 'active');
    assert.equal(storedTasks(dsh.home).filter(task => task.record.title === '团队沉淀').length, 1);
    assert.deepEqual(errors, []);
  });
});

// 需求§界面通用约定（宽高跟着窗口走，换几种宽度和深色看没有横向溢出）
for (const [width, colorScheme] of [[1093, 'light'], [820, 'dark']]) test(`扩展任务的详情在 ${width} 宽${colorScheme === 'dark' ? '、深色' : ''}下没有横向溢出`, async t => {
  await withPage(browser, t, { width, colorScheme }, async ({ page, errors, shot }) => {
    await openWhaleWing(page, dsh.url, { assistant: 'float' });
    await openTab(page, '定时任务');
    await row(page, '团队沉淀').locator('.ww-task-select').click();
    await detail(page).locator('h2', { hasText: '团队沉淀' }).waitFor();
    await detail(page).getByText('这个任务会读你', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), true, '没有横向滚动');
    const overflow = await detail(page).evaluate(element => element.scrollWidth - element.clientWidth);
    assert.ok(overflow <= 1, `详情区没有横向溢出（多出 ${overflow}px）`);
    await shot(`${width}`);
    assert.deepEqual(errors, []);
  });
});
