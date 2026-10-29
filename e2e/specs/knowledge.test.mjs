// 个人知识：建库、阅读与链接、关系图谱、新建保存、移出恢复、冲突保护。
// 知识库是临时 DSH 的 dsh.vault。插件第一次打开个人知识时自动建库（库目录里已有东西会拒绝建库），
// 所以测试先让插件建好库，再像员工用 Obsidian 那样把夹具笔记写进对应目录；保存、移出、恢复都回读磁盘核对。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startDsh } from '../support/dsh.mjs';
import { launchBrowser, withPage, openWhaleWing, openTab, toast, modal, dialogButton, isCentered, isRed } from '../support/browser.mjs';
import { zones, fixtures, writeFixture, vaultNotes, titleOf, linesWith, noteText } from '../support/knowledge-fixture.mjs';

let dsh, browser, vaultWasEmpty;
before(async () => { dsh = await startDsh(); vaultWasEmpty = fs.readdirSync(dsh.vault).length === 0; browser = await launchBrowser(); });
after(async () => { await browser?.close(); await dsh?.stop(); });

const exact = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const settingsFile = () => path.join(dsh.vault, '.whalewing', 'settings.json');
const vaultFile = relative => path.join(dsh.vault, ...relative.split('/'));
const shortId = () => randomUUID().slice(0, 4);

async function openKnowledge(page) {
  await openWhaleWing(page, dsh.url);
  await openTab(page, '个人知识');
  await page.locator('.ww-knowledge-head p', { hasText: '知识库在' }).waitFor();
  await directoryLoaded(page, '全部笔记');
}
/** 等某个目录读完：里面列出了文件夹或笔记（加载中只有转圈）。 */
const directoryLoaded = (page, name) => page.getByRole('group', { name, exact: true }).locator('> div:not([role=alert])').first().waitFor();

/** 库还没建时先打开一次个人知识让插件建库，再把夹具笔记写进去（员工在 Obsidian 里写笔记也是这样落盘）。 */
async function prepare(t, ...items) {
  if (!fs.existsSync(settingsFile())) await withPage(browser, t, async ({ page }) => openKnowledge(page));
  for (const item of items) writeFixture(dsh.vault, item);
}

// ---- 目录 ----
const noteButton = (page, title) => page.locator('.ww-note-tree .ww-note').filter({ has: page.locator('.ww-tree-title', { hasText: exact(title) }) });
/** 依次展开一串文件夹（每一级在上一级里面找），等每一级读完。 */
async function expand(page, ...names) {
  for (let i = 0; i < names.length; i++) {
    const parent = i ? names.slice(0, i).join('/') : '全部笔记', here = names.slice(0, i + 1).join('/');
    const button = page.getByRole('group', { name: parent, exact: true }).locator('> div > button.ww-folder').filter({ has: page.locator('.ww-tree-title', { hasText: exact(names[i]) }) });
    if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
    await directoryLoaded(page, here);
  }
}
/** 一个目录下直接列出的子文件夹和笔记。 */
async function listing(page, directory) {
  return page.getByRole('group', { name: directory, exact: true }).evaluate(group => ({
    folders: [...group.children].flatMap(child => [...child.children].filter(node => node.matches('button.ww-folder')).map(node => node.querySelector('.ww-tree-title').textContent)),
    notes: [...group.children].filter(child => child.matches('.ww-note-row')).map(child => child.querySelector('.ww-note .ww-tree-title').textContent),
  }));
}
/** 在左侧目录里点开一篇笔记，等阅读区换成它。 */
async function openNote(page, relative) {
  await expand(page, ...relative.split('/').slice(0, -1));
  await noteButton(page, titleOf(relative)).click();
  await waitReading(page, relative);
}
const waitReading = async (page, relative) => { await page.locator(`.ww-note-path summary[title="${relative}"]`).waitFor(); await page.locator('.ww-reader').waitFor(); };

// ---- 阅读区右侧栏 ----
const sideTab = (page, label) => page.locator('.ww-side-tabs [role=tab]', { hasText: label });
async function sideCount(page, label) { const em = sideTab(page, label).locator('em'); return await em.count() ? Number(await em.innerText()) : 0; }
const moreActions = async page => { const details = page.locator('.ww-note-actions'); if (await details.getAttribute('open') === null) await details.locator('summary').click(); return details; };
const editor = page => page.getByRole('textbox', { name: 'Markdown 正文' });
const draftChip = page => page.locator('.ww-draft-chip');

/** 打开工具菜单（…），返回菜单或其中一项。 */
async function libraryTool(page, name) {
  const menu = page.getByRole('dialog', { name: '知识库工具' });
  if (!await menu.isVisible()) await page.getByRole('button', { name: '知识库工具' }).click();
  await menu.waitFor();
  return name ? menu.getByRole('button', { name, exact: true }) : menu;
}
/** 再点一次“…”收起工具菜单。 */
async function closeLibraryTools(page) {
  const menu = page.getByRole('dialog', { name: '知识库工具' });
  if (await menu.isVisible()) await page.getByRole('button', { name: '知识库工具' }).click();
  await menu.waitFor({ state: 'hidden' });
}

/** 放弃编辑区草稿（居中确认后）。 */
async function discardDraft(page) {
  await draftChip(page).getByRole('button', { name: '放弃当前草稿' }).click();
  const dialog = modal(page, '放弃草稿');
  await dialogButton(dialog, '放弃当前草稿').click();
  await dialog.waitFor({ state: 'detached' });
  await draftChip(page).waitFor({ state: 'detached' });
}

// ---- 关系图谱画布 ----
const canvasOf = page => page.locator('.ww-graph-canvas canvas');
const graphStatus = page => page.locator('.ww-graph-canvas > div[role=status]');
const frames = (page, count = 2) => page.evaluate(count => new Promise(resolve => { const step = left => left ? requestAnimationFrame(() => step(left - 1)) : resolve(); step(count); }), count);
/** 画布像素的指纹和墨量（各像素不透明度之和）。 */
const digest = page => canvasOf(page).evaluate(canvas => {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 2166136261, ink = 0;
  for (let i = 0; i < data.length; i += 4) { ink += data[i + 3]; hash = Math.imul(hash ^ (data[i] + data[i + 1] * 3 + data[i + 2] * 7 + data[i + 3] * 11), 16777619) >>> 0; }
  return { hash, ink };
});
/** 等画面停下来：连续三帧不变。 */
async function settled(page) {
  await page.locator('.ww-graph-canvas canvas[aria-busy=false]').waitFor();
  let last = await digest(page);
  for (let i = 0; i < 120; i++) {
    await frames(page, 3);
    const now = await digest(page);
    if (now.hash === last.hash) return now;
    last = now;
  }
  throw new Error('关系图谱的画面一直在变，没有停下来');
}
/** 用键盘在图谱里逐个选中节点，读出全部节点标题（画布没有 DOM 节点，键盘选中时下方状态条显示标题）。 */
async function graphTitles(page) {
  await settled(page);
  await canvasOf(page).focus();
  await page.keyboard.press('Home');
  const first = await graphStatus(page).innerText(), titles = [first];
  for (let previous = first; titles.length < 400;) {
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(([selector, text]) => document.querySelector(selector)?.textContent !== text, ['.ww-graph-canvas > div[role=status]', previous]);
    previous = await graphStatus(page).innerText();
    if (previous === first) break;
    titles.push(previous);
  }
  await page.keyboard.press('Escape');
  return titles;
}
/** 键盘选中标题为 title 的节点。 */
async function selectGraphNode(page, title) {
  await canvasOf(page).focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 400; i++) {
    if (await graphStatus(page).innerText() === title) return;
    const previous = await graphStatus(page).innerText();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(([selector, text]) => document.querySelector(selector)?.textContent !== text, ['.ww-graph-canvas > div[role=status]', previous]);
  }
  throw new Error(`图谱里没有“${title}”`);
}
/** 找到画布上几个节点的位置：先按像素找实心圆点的候选位置，再把指针移过去，看状态条显示的标题确认。 */
async function locateNodes(page, wanted) {
  const spots = await canvasOf(page).evaluate(canvas => {
    const w = canvas.width, h = canvas.height, data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const dark = (x, y) => { const i = (y * w + x) * 4; return data[i + 3] > 220 && data[i] < 80 && data[i + 1] < 80 && data[i + 2] < 80; };
    const clusters = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let solid = true;
      for (let dy = -1; dy <= 1 && solid; dy++) for (let dx = -1; dx <= 1 && solid; dx++) solid = dark(x + dx, y + dy);
      if (!solid) continue;
      const cluster = clusters.find(c => Math.hypot(c.x / c.n - x, c.y / c.n - y) < 10);
      if (cluster) { cluster.x += x; cluster.y += y; cluster.n += 1; } else clusters.push({ x, y, n: 1 });
    }
    const box = canvas.getBoundingClientRect();
    return clusters.map(c => [box.left + c.x / c.n * box.width / w, box.top + c.y / c.n * box.height / h]);
  });
  const found = {};
  for (const [x, y] of spots) {
    await page.mouse.move(x, y);
    // 指针移动后画布在下一帧判断落在哪个节点上、更新状态条；等两帧再读，没有落在节点上时状态条不出现。
    await frames(page, 2);
    const title = await graphStatus(page).count() ? await graphStatus(page).innerText() : '';
    if (wanted.includes(title) && !found[title]) found[title] = { x, y };
    if (wanted.every(name => found[name])) break;
  }
  await page.mouse.move(2, 2);
  return found;
}
/** 画布上某一点（页面坐标）的不透明度。 */
const alphaAt = (page, { x, y }) => canvasOf(page).evaluate((canvas, [x, y]) => {
  const box = canvas.getBoundingClientRect();
  return canvas.getContext('2d').getImageData(Math.round((x - box.left) * canvas.width / box.width), Math.round((y - box.top) * canvas.height / box.height), 1, 1).data[3];
}, [x, y]);
/** 逐帧看某一点的不透明度，直到降到 limit 以下或过了 1.5 秒（过渡约 0.14 秒），返回最后看到的值。 */
async function alphaDropsTo(page, point, limit) {
  const start = Date.now();
  let value = await alphaAt(page, point);
  while (value > limit && Date.now() - start < 1500) { await frames(page, 1); value = await alphaAt(page, point); }
  return value;
}
/** 在打开个人知识之前装上逐帧记录：图谱画好后每一帧的墨量，记 2.5 秒。 */
const recordFadeIn = page => page.evaluate(() => {
  window.__wwInk = null;
  const series = [];
  let start = 0;
  const step = () => {
    const canvas = document.querySelector('.ww-graph-canvas canvas');
    if (canvas?.getAttribute('aria-busy') === 'false') {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 3; i < data.length; i += 4) ink += data[i];
      if (!start) start = performance.now();
      series.push([performance.now() - start, ink]);
    }
    if (!start || performance.now() - start < 2500) requestAnimationFrame(step); else window.__wwInk = series;
  };
  requestAnimationFrame(step);
});
const fadeInSeries = async page => { await page.waitForFunction(() => window.__wwInk); return page.evaluate(() => window.__wwInk); };

// ===================== 页面与建库 =====================

// 需求§个人知识·初始化得到什么（员工第一次使用时插件自动建库）、阅读、Wiki 与图谱；需求§界面通用约定·一行排开
test('第一次打开个人知识自动建库：页头写明知识库位置，查找和工具排成一行，左侧是十区目录，中间是关系图谱，分隔条能拖', async t => {
  await withPage(browser, t, async ({ page, errors, external }) => {
    assert.equal(vaultWasEmpty, true, '启动时知识库目录是空的');
    await openKnowledge(page);
    assert.equal(fs.existsSync(settingsFile()), true, '打开个人知识后插件已建库');
    const head = page.locator('.ww-knowledge-head');
    assert.equal(await head.locator('h2').innerText(), '个人知识');
    assert.ok((await head.locator('p').innerText()).includes(`知识库在 ${path.resolve(dsh.vault)}`), '页头写明知识库位置');

    const toolbar = page.locator('.ww-knowledge-toolbar');
    const parts = [toolbar.getByRole('textbox', { name: '关键词（留空列出笔记）' }), ...['查找笔记', '新建笔记', '关系图谱', '知识库工具'].map(name => toolbar.getByRole('button', { name, exact: true }))];
    const middles = [];
    for (const part of parts) { const box = await part.boundingBox(); middles.push(box.y + box.height / 2); }
    assert.ok(Math.max(...middles) - Math.min(...middles) <= 4, `搜索框和四个按钮在同一行（纵向中线 ${middles.map(Math.round).join('、')}）`);

    assert.deepEqual(await listing(page, '全部笔记'), { folders: zones, notes: ['AGENTS'] });
    await page.locator('.ww-note-canvas.ww-graph-mode').getByRole('group', { name: '关系图谱', exact: true }).waitFor();
    await page.locator('.ww-graph-canvas').getByRole('button', { name: '重置视图' }).waitFor();

    const separator = page.getByRole('separator', { name: '调整目录宽度' });
    const before = Number(await separator.getAttribute('aria-valuenow')), treeBefore = (await page.locator('.ww-note-tree').boundingBox()).width;
    const box = await separator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(([selector, value]) => Number(document.querySelector(selector)?.getAttribute('aria-valuenow')) === value, ['.ww-directory-separator', before + 80]);
    assert.ok(Math.abs((await page.locator('.ww-note-tree').boundingBox()).width - treeBefore - 80) <= 2, '目录宽了 80px');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
});

// 需求§个人知识·初始化得到什么（十区、常用二级目录、3 份规则、13 个模板、首页与入口、5 个视图；库里不预装任何人的知识）
test('建库得到需求列出的内容：十区和常用二级目录、3 份规则、13 个模板、首页、AGENTS 和 5 个视图，目录里看到的和磁盘一致', async t => {
  await prepare(t);
  const layout = ['00-系统/索引/任务', '20-项目/工作', '20-项目/学习', '30-领域/职业发展', '40-知识/产品与业务', '40-知识/工作方法', '40-知识/工程与工具', '40-知识/人工智能', '40-知识/学习与成长', '50-来源/书籍', '50-来源/网页', '50-来源/课程与视频', '50-来源/对话与会议', '60-时间线/日记', '60-时间线/周记', '60-时间线/月记', '60-时间线/人生事件', '70-作品/报告', '70-作品/文章', '70-作品/PPT', '80-外部索引/代码项目', '80-外部索引/工作文件', '80-外部索引/数字资产', '90-归档/已完成项目'];
  const rules = ['作品写作规范', '知识库使用说明', '知识库规则'];
  const namedTemplates = ['项目', '领域', '原子笔记', 'MOC', '书籍来源', '网页剪藏', '作品', '外部文件索引', '日记', '周回顾', '月回顾'].map(name => `${name}模板`);
  const bases = ['任务记录', '幼苗知识', '收件箱', '活动项目', '草稿作品'];
  const list = dir => fs.readdirSync(vaultFile(dir)).sort();
  for (const dir of [...zones, ...layout]) assert.ok(fs.statSync(vaultFile(dir)).isDirectory(), `磁盘上有 ${dir}`);
  assert.deepEqual(list('00-系统/规则'), rules.map(name => `${name}.md`).sort());
  const templates = list('00-系统/模板');
  assert.equal(templates.filter(name => name.endsWith('.md')).length, 13, `13 个模板：${templates.join('、')}`);
  for (const name of namedTemplates) assert.ok(templates.includes(`${name}.md`), `有${name}`);
  assert.deepEqual(list('00-系统/Bases'), bases.map(name => `${name}.base`).sort());
  assert.ok(fs.statSync(vaultFile('00-系统/知识库首页.md')).isFile());
  assert.ok(fs.statSync(vaultFile('AGENTS.md')).isFile());
  assert.deepEqual(vaultNotes(dsh.vault).filter(name => !name.startsWith('00-系统/') && name !== 'AGENTS.md' && !titleOf(name).startsWith('鲸翼测试-')), [], '十区里没有预装任何笔记');

  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await expand(page, '00-系统');
    const system = await listing(page, '00-系统');
    assert.deepEqual([...system.folders].sort(), ['Bases', '索引', '模板', '规则'].sort());
    assert.deepEqual(system.notes, ['知识库首页']);
    await expand(page, '00-系统', '规则');
    assert.deepEqual([...(await listing(page, '00-系统/规则')).notes].sort(), [...rules].sort());
    await expand(page, '00-系统', '模板');
    assert.deepEqual([...(await listing(page, '00-系统/模板')).notes].sort(), templates.filter(name => name.endsWith('.md')).map(titleOf).sort());
    await expand(page, '00-系统', '索引');
    assert.deepEqual(await listing(page, '00-系统/索引'), { folders: ['任务'], notes: [] });
    assert.deepEqual(errors, []);
  });
});

// 需求§个人知识·只读与升级（根目录 AGENTS.md 由插件维护；根目录的 Markdown 只读可见，不能写入）
test('反例：根目录 AGENTS 只能阅读，编辑、保存和移出都不可用，文件不变', async t => {
  await prepare(t);
  const before = fs.readFileSync(vaultFile('AGENTS.md'));
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await noteButton(page, 'AGENTS').click();
    await waitReading(page, 'AGENTS.md');
    await page.locator('.ww-note-scroll .ww-notice', { hasText: '仅供阅读' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '编辑', exact: true }).isDisabled(), true);
    const actions = await moreActions(page);
    assert.equal(await actions.getByRole('button', { name: '保存', exact: true }).isDisabled(), true);
    assert.equal(await actions.getByRole('button', { name: '移到可恢复区' }).isDisabled(), true);
    assert.equal(await editor(page).count(), 0, '没有编辑框');
    assert.deepEqual(errors, []);
  });
  assert.deepEqual(fs.readFileSync(vaultFile('AGENTS.md')), before, 'AGENTS.md 没被改动');
});

// ===================== 新建、草稿 =====================

// 需求§个人知识·规则要点（正式笔记五个通用属性，文件名与 H1 一致；员工笔记写在十区内）；需求§数据与隐私（写入后回读）；需求§阅读、Wiki 与图谱（反向链接）
test('新建笔记：默认放进收件箱并预填五个属性和标题，改路径和正文后保存，磁盘内容一致、目录里出现、首页反链多一条', async t => {
  await prepare(t);
  const name = `鲸翼测试-KNO03-${shortId()}`, relative = `10-收件箱/${name}.md`;
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await openNote(page, '00-系统/知识库首页.md');
    const backlinksBefore = await sideCount(page, '反链');

    await page.getByRole('button', { name: '新建笔记', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '库内 Markdown 路径' }).inputValue(), `10-收件箱/${today} 新笔记.md`);
    const draft = await editor(page).inputValue();
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(draft)?.[1] ?? '';
    assert.deepEqual(frontmatter.split('\n').map(line => line.split(':')[0]), ['type', 'status', 'created', 'updated', 'aliases'], '预填五个通用属性');
    assert.match(draft, new RegExp(`\\n# ${today} 新笔记\\n`), '预填一级标题，和文件名一致');
    await draftChip(page).getByText('有未保存的修改').waitFor();
    await draftChip(page).getByRole('button', { name: '放弃当前草稿' }).waitFor();

    await page.getByRole('textbox', { name: '库内 Markdown 路径' }).fill(relative);
    const content = `${draft.replace(`# ${today} 新笔记`, `# ${name}`).trimEnd()}\n\n见 [[知识库首页]]\n`;
    await editor(page).fill(content);
    await (await moreActions(page)).getByRole('button', { name: '保存', exact: true }).click();
    await toast(page, '已保存', 'success').waitFor();
    assert.equal(fs.readFileSync(vaultFile(relative), 'utf8'), content, '磁盘上的文件和编辑区一致');
    await draftChip(page).waitFor({ state: 'detached' });

    await expand(page, '10-收件箱');
    await noteButton(page, name).waitFor();
    await openNote(page, '00-系统/知识库首页.md');
    assert.equal(await sideCount(page, '反链'), backlinksBefore + 1, '知识库首页的反链多一条');
    await sideTab(page, '反链').click();
    const group = page.locator('.ww-side-group').filter({ has: page.locator('.ww-side-note strong', { hasText: exact(name) }) });
    assert.match(await group.locator('.ww-side-snippet').innerText(), /知识库首页/, '列出链接所在那一行');
    assert.deepEqual(errors, []);
  });
});

const badPaths = ['鲸翼测试-KNO04.md', '../鲸翼测试-越界.md', 'C:\\Windows\\鲸翼测试-KNO04.md'];
/** 新建一篇笔记，把路径依次改成不允许的位置并保存，返回每次的失败提示；onToast 在提示还显示着时调用（留证据用）。 */
async function saveToBadPaths(page, onToast) {
  await page.getByRole('button', { name: '新建笔记', exact: true }).click();
  const messages = [];
  for (const bad of badPaths) {
    await page.getByRole('textbox', { name: '库内 Markdown 路径' }).fill(bad);
    await editor(page).fill(noteText(titleOf(bad.replaceAll('\\', '/')), '不该被保存。', { type: 'capture', status: 'inbox' }));
    await (await moreActions(page)).getByRole('button', { name: '保存', exact: true }).click();
    const failure = toast(page, null, 'error');
    await failure.waitFor();
    messages.push((await failure.locator('.ww-toast-text').innerText()).trim());
    await onToast?.(messages.length, failure);
    await failure.locator('.ww-toast-close').click();
    await failure.waitFor({ state: 'detached' });
    await draftChip(page).getByText('有未保存的修改').waitFor();
  }
  return messages;
}

// 需求§个人知识·只读与升级（员工自己的笔记只写在十区内；根目录的 Markdown 只读可见，不能写入）；需求§界面通用约定（失败在右上角提示）
test('反例：路径写到根目录、跳出知识库或写成绝对路径时都不保存，右上角提示失败，草稿保留，磁盘上没有这些文件', async t => {
  await prepare(t);
  const notesBefore = vaultNotes(dsh.vault);
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    const messages = await saveToBadPaths(page);
    assert.equal(messages.length, 3);
    assert.ok(messages.every(Boolean), '每次都有失败说明');
    assert.equal(await page.getByRole('textbox', { name: '库内 Markdown 路径' }).inputValue(), badPaths.at(-1), '草稿还在编辑区');
    await discardDraft(page);
    assert.deepEqual(errors, []);
  });
  assert.equal(fs.existsSync(path.join(dsh.vault, '鲸翼测试-KNO04.md')), false, '根目录没有新文件');
  assert.equal(fs.existsSync(path.join(path.dirname(dsh.vault), '鲸翼测试-越界.md')), false, '知识库外面没有新文件');
  if (process.platform === 'win32') assert.equal(fs.existsSync('C:\\Windows\\鲸翼测试-KNO04.md'), false, '绝对路径处没有新文件');
  assert.deepEqual(vaultNotes(dsh.vault), notesBefore, '知识库里的笔记没变');
});

// 需求§个人知识·只读与升级（员工自己的笔记只写在十区内）；需求§界面通用约定（失败提示说明原因）
test('反例：路径不在十区内时，失败提示说明笔记只能放在十区里，而不是归成本机文件问题', async t => {
  await prepare(t);
  await withPage(browser, t, async ({ page, shot }) => {
    await openKnowledge(page);
    const messages = await saveToBadPaths(page, async (index, failure) => {
      if (index !== 1) return;
      // 提示有 0.18 秒的滑入动画，等动画放完再截图，证据里字才清楚。
      await failure.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
      t.diagnostic(`提示截图：${await shot('根目录路径的提示')}`);
    });
    await discardDraft(page);
    for (const [i, message] of messages.entries()) {
      assert.match(message, /十区|十个/, `“${badPaths[i]}”的提示说明只能写在十区内：${message}`);
      assert.doesNotMatch(message, /本机文件问题/, `“${badPaths[i]}”不是本机文件问题：${message}`);
    }
  });
});

// 需求§界面通用约定·状态放在原位（“有未保存的修改”以小标记放在所在工具栏）
test('知识库工具菜单：打开时焦点落在第一个能用的项上；按 Esc 或点别处收起后，点一下“…”就能再打开', async t => {
  await prepare(t);
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    const trigger = page.getByRole('button', { name: '知识库工具' }), menu = page.getByRole('dialog', { name: '知识库工具' });
    // 浏览器收起菜单后，界面要等收起事件到了才记成已关。
    const recordedClosed = () => page.locator('button[aria-label="知识库工具"][aria-expanded="false"]').waitFor({ timeout: 2000 });
    // 没打开笔记时第一项“当前笔记关系图”不可用，焦点跳过它。
    await trigger.click(); await menu.waitFor();
    assert.equal(await menu.getByRole('button').first().isDisabled(), true, '第一项不可用');
    assert.equal(await menu.evaluate(element => element.contains(document.activeElement) && !document.activeElement.disabled), true, '焦点在菜单里能用的项上');
    await page.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Esc 后焦点回到“…”');
    await trigger.click(); await menu.waitFor({ timeout: 3000 });
    // 焦点在“…”上按 Esc：由浏览器收起菜单（原来界面没跟上，下一次要点两下）。
    await trigger.focus(); await page.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' });
    await recordedClosed();
    await trigger.click(); await menu.waitFor({ timeout: 3000 });
    // 点页面别处收起。
    await page.locator('.ww-knowledge-head p', { hasText: '知识库在' }).click(); await menu.waitFor({ state: 'hidden' });
    await recordedClosed();
    await trigger.click(); await menu.waitFor({ timeout: 3000 });
    // 开着时再点“…”收起，不会关了又开。
    await trigger.click(); await menu.waitFor({ state: 'hidden' });
    await recordedClosed();
    await trigger.click(); await menu.waitFor({ timeout: 3000 });
    assert.deepEqual(errors, []);
  });
});

test('有未保存的草稿时：工具条上标“有未保存的修改”，不能再新建或看图谱，目录里的笔记点不了', async t => {
  await prepare(t);
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await page.getByRole('button', { name: '新建笔记', exact: true }).click();
    const chip = draftChip(page);
    await chip.getByText('有未保存的修改').waitFor();
    assert.equal(await chip.evaluate(element => Boolean(element.closest('.ww-note-toolbar'))), true, '标记在笔记工具条里');
    const toolbar = page.locator('.ww-knowledge-toolbar');
    assert.equal(await toolbar.getByRole('button', { name: '新建笔记', exact: true }).isDisabled(), true);
    assert.equal(await toolbar.getByRole('button', { name: '关系图谱', exact: true }).isDisabled(), true);
    assert.equal(await noteButton(page, 'AGENTS').isDisabled(), true);
    await expand(page, '00-系统');
    assert.equal(await noteButton(page, '知识库首页').isDisabled(), true);
    await discardDraft(page);
    assert.equal(await toolbar.getByRole('button', { name: '新建笔记', exact: true }).isEnabled(), true, '放弃草稿后恢复');
    assert.deepEqual(errors, []);
  });
});

// 需求§界面通用约定（放弃草稿用居中确认框，标题、说明、右下角“取消 + 确认”；结果用右上角提示）
test('反例：放弃草稿先居中确认，点“取消”草稿原样；确认后草稿清掉、右上角提示，磁盘上没有这篇', async t => {
  await prepare(t);
  const relative = `10-收件箱/鲸翼测试-KNO06-${shortId()}.md`;
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await page.getByRole('button', { name: '新建笔记', exact: true }).click();
    await page.getByRole('textbox', { name: '库内 Markdown 路径' }).fill(relative);
    const content = noteText(titleOf(relative), '这篇草稿会被放弃。', { type: 'capture', status: 'inbox' });
    await editor(page).fill(content);

    await draftChip(page).getByRole('button', { name: '放弃当前草稿' }).click();
    const dialog = modal(page, '放弃草稿');
    await dialog.waitFor();
    assert.equal(await isCentered(page, dialog), true, '确认框居中');
    assert.ok((await dialog.locator('.ww-confirm-body').innerText()).trim(), '有说明');
    assert.deepEqual(await dialog.locator('footer button').allInnerTexts(), ['取消', '放弃当前草稿']);
    assert.equal(await isRed(dialogButton(dialog, '放弃当前草稿')), true, '确认按钮是红色');
    await dialog.locator('footer').getByRole('button', { name: '取消', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await editor(page).inputValue(), content, '草稿原样');
    assert.equal(await page.getByRole('textbox', { name: '库内 Markdown 路径' }).inputValue(), relative);

    await discardDraft(page);
    await toast(page, '已放弃未保存的修改').waitFor();
    assert.equal(await editor(page).count() ? await editor(page).inputValue() : '', '', '草稿清掉了');
    assert.deepEqual(errors, []);
  });
  assert.equal(fs.existsSync(vaultFile(relative)), false, '磁盘上没有这篇');
});

// ===================== 查找 =====================

// 需求§个人知识·知识库位置（检索用目录、属性、关键词和全文）
test('查找笔记：按关键词列出路径或正文含这个词的笔记，清空再查回到完整目录', async t => {
  await prepare(t, fixtures.link, fixtures.refer);
  const keyword = '知识库';
  const expected = vaultNotes(dsh.vault).filter(name => !name.startsWith('90-归档/') && `${name}\n${fs.readFileSync(vaultFile(name), 'utf8')}`.toLowerCase().includes(keyword)).map(titleOf).sort();
  assert.ok(expected.includes(fixtures.refer.title), '夹具“鲸翼测试-引用”只在正文里有这个词，用来检查全文查找');
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await page.getByRole('textbox', { name: '关键词（留空列出笔记）' }).fill(keyword);
    await page.getByRole('button', { name: '查找笔记', exact: true }).click();
    // 输入关键词后左栏换成结果列表，查完才填进结果。
    await page.locator('.ww-note-tree .ww-note').first().waitFor();
    assert.equal(await page.locator('.ww-note-tree .ww-directory').count(), 0, '左栏换成查找结果');
    assert.deepEqual((await page.locator('.ww-note-tree .ww-note .ww-tree-title').allInnerTexts()).sort(), expected);

    await page.getByRole('textbox', { name: '关键词（留空列出笔记）' }).fill('');
    await page.getByRole('button', { name: '查找笔记', exact: true }).click();
    await directoryLoaded(page, '全部笔记');
    assert.deepEqual(await listing(page, '全部笔记'), { folders: zones, notes: ['AGENTS'] });
    assert.deepEqual(errors, []);
  });
});

// ===================== 阅读区：目录、反链、出链、属性 =====================

const headingsOf = text => text.split('\n').filter(line => /^#{1,6}\s/.test(line)).map(line => line.replace(/^#+\s+/, ''));
const wikiTargets = text => [...new Set([...text.matchAll(/\[\[([^\]|#]+)/g)].map(match => match[1].trim()))];

// 需求§个人知识·阅读、Wiki 与图谱（2026-10-27：右侧栏分目录、反链、出链三页，各带数量；目录点了滚到那一节并跟着高亮；反链按来源笔记归组，点了打开那篇并定位到那一行、闪一下）；决策 2026-10-27
test('阅读区右侧栏：目录、反链、出链三页带数量；点目录滚到那一节并高亮，出链能打开也能返回，反链按笔记归组、点了定位到那一行并闪一下', async t => {
  await prepare(t, fixtures.link, fixtures.refer);
  const { link, refer } = fixtures;
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await openNote(page, link.path);
    const headings = headingsOf(link.text);
    assert.equal(await sideCount(page, '目录'), headings.length, '目录数量 = 标题数');
    assert.equal(await sideCount(page, '反链'), linesWith(refer.text, `[[${link.title}]]`).length, '反链数量 = 别的笔记里链到它的次数');
    assert.equal(await sideCount(page, '出链'), wikiTargets(link.text).length, '出链数量 = 不同的链接目标数（含属性里的）');

    const outline = page.getByRole('navigation', { name: '目录' });
    assert.deepEqual(await outline.getByRole('button').allInnerTexts(), headings);
    const target = headings[2];
    await outline.getByRole('button', { name: target }).click();
    await page.waitForFunction(text => {
      const box = document.querySelector('.ww-note-scroll'), heading = [...box.querySelectorAll('.ww-reader h2')].find(h => h.textContent === text);
      return heading && Math.abs(heading.getBoundingClientRect().top - box.getBoundingClientRect().top) <= 40;
    }, target);
    assert.equal(await outline.getByRole('button', { name: target }).getAttribute('aria-current'), 'location', '目录高亮跟着到这一节');

    await sideTab(page, '出链').click();
    await page.locator('.ww-side-panel .ww-side-note', { hasText: '知识库规则' }).click();
    await waitReading(page, '00-系统/规则/知识库规则.md');
    await page.getByRole('button', { name: '返回上一篇' }).click();
    await waitReading(page, link.path);

    await sideTab(page, '反链').click();
    const groups = page.locator('.ww-side-panel .ww-side-group');
    assert.equal(await groups.count(), 1, '同一篇来源笔记只归成一组');
    assert.equal(await groups.locator('.ww-side-note strong').innerText(), refer.title);
    assert.equal(await groups.locator('.ww-side-note em').innerText(), String(linesWith(refer.text, `[[${link.title}]]`).length), '组上写提到几次');
    assert.equal(await groups.locator('.ww-side-snippet').count(), 2, '两行各列一条');

    await openNote(page, '00-系统/知识库首页.md');
    await sideTab(page, '反链').click();
    const from = page.locator('.ww-side-group').filter({ has: page.locator('.ww-side-note strong', { hasText: exact(refer.title) }) });
    await from.locator('.ww-side-snippet', { hasText: '最后回到' }).click();
    await waitReading(page, refer.path);
    const flashed = page.locator('.ww-reader .ww-flash');
    await flashed.waitFor();
    assert.match(await flashed.innerText(), /最后回到/, '闪的是链接所在那一行');
    const [line, box] = [await flashed.boundingBox(), await page.locator('.ww-note-scroll').boundingBox()];
    assert.ok(line.y >= box.y && line.y + line.height <= box.y + box.height, '那一行滚到了可见范围里');
    assert.deepEqual(errors, []);
  });
});

// 需求§个人知识·阅读、Wiki 与图谱（出链同一目标只列一次，没找到的标出原因；指向不存在笔记的链接在图谱里显示为缺失节点，点开能看到是哪些笔记引用了它）
test('反例：链到还没有的笔记时，出链标“未创建”且只列一次，点了只说明缺失；图谱里是缺失节点，点开列出引用它的那几行，不会新建文件', async t => {
  await prepare(t, fixtures.link, fixtures.refer);
  const { link } = fixtures, missing = '鲸翼测试-不存在';
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await openNote(page, link.path);
    await sideTab(page, '出链').click();
    const unresolved = page.locator('.ww-side-panel .ww-side-note').filter({ has: page.locator('strong', { hasText: exact(missing) }) });
    assert.equal(await unresolved.count(), 1, `正文里链了 ${linesWith(link.text, `[[${missing}]]`).length} 次，只列一次`);
    assert.equal(await unresolved.locator('em').innerText(), '未创建');
    await unresolved.click();
    await page.locator('.ww-note-scroll .ww-notice', { hasText: missing }).waitFor();
    assert.equal(await page.locator('.ww-note-path summary').getAttribute('title'), link.path, '没有跳走');

    await page.getByRole('button', { name: '关系图谱', exact: true }).click();
    assert.ok((await graphTitles(page)).includes(missing), '图谱里有缺失节点');
    await selectGraphNode(page, missing);
    await page.keyboard.press('Enter');
    const panel = page.locator('.ww-graph-missing');
    await panel.waitFor();
    assert.equal(await panel.locator('h3').innerText(), missing);
    const sources = linesWith(link.text, `[[${missing}]]`).map(line => `${link.title} · ${line}`);
    assert.deepEqual(await panel.locator('button', { hasText: link.title }).allInnerTexts(), sources, '列出引用它的笔记和行号');
    await panel.getByRole('button', { name: sources.at(-1) }).click();
    await waitReading(page, link.path);
    assert.match(await page.locator('.ww-reader .ww-flash').innerText(), /再提一次/, '打开引用它的笔记并定位到那一行');
    assert.deepEqual(errors, []);
  });
  assert.equal(vaultNotes(dsh.vault).some(name => titleOf(name) === missing), false, '没有新建这篇笔记');
});

// 需求§个人知识·阅读、Wiki 与图谱（笔记属性显示在正文大标题下面，可以收起；属性里的 [[链接]] 能点开，只显示笔记名，和正文链接一样算进出链）
test('笔记属性在大标题下、可以收起；属性里的链接只显示笔记名、点了能打开，并排在出链里正文链接的后面', async t => {
  await prepare(t, fixtures.link);
  const { link } = fixtures;
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await openNote(page, link.path);
    const props = page.locator('.ww-reader .ww-note-props');
    assert.equal(await props.evaluate(element => element.previousElementSibling?.tagName), 'H1', '紧跟在大标题下面');
    assert.deepEqual(await props.locator('dt').allInnerTexts(), ['type', 'status', 'created', 'updated', 'aliases', 'source']);
    const value = props.getByRole('button', { name: '知识库首页', exact: true });
    assert.equal(await value.getAttribute('title'), '00-系统/知识库首页.md', '只显示笔记名，完整路径在悬停提示里');

    await props.locator('summary').click();
    assert.equal(await props.getAttribute('open'), null, '收起');
    assert.equal(await props.locator('dl').isVisible(), false);
    await props.locator('summary').click();
    assert.notEqual(await props.getAttribute('open'), null, '展开');

    await sideTab(page, '出链').click();
    assert.deepEqual(await page.locator('.ww-side-panel .ww-side-note strong').allInnerTexts(), ['知识库规则', '鲸翼测试-不存在', '知识库首页'], '属性里的链接排在正文链接后面');
    await value.click();
    await waitReading(page, '00-系统/知识库首页.md');
    assert.deepEqual(errors, []);
  });
});

// 需求§个人知识·阅读、Wiki 与图谱（属性里的链接没找到的显示成虚线；“检查属性与链接”也会查它们）
test('反例：属性里的链接找不到目标时显示成虚线，点了不跳走、只说明缺失，“检查属性与链接”也报出它', async t => {
  await prepare(t, fixtures.propMissing);
  const { propMissing } = fixtures, missing = '鲸翼测试-属性目标缺失';
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await openNote(page, propMissing.path);
    const value = page.locator('.ww-reader .ww-note-props').getByRole('button', { name: missing, exact: true });
    assert.equal(await value.evaluate(element => getComputedStyle(element).textDecorationStyle), 'dashed', '虚线');
    await value.click();
    await page.locator('.ww-note-scroll .ww-notice', { hasText: missing }).waitFor();
    assert.equal(await page.locator('.ww-note-path summary').getAttribute('title'), propMissing.path, '没有跳走');

    await (await libraryTool(page, '检查属性与链接')).click();
    const report = modal(page, '知识检查');
    await report.waitFor();
    const issues = await report.locator('.ww-confirm-body p').allInnerTexts();
    assert.ok(issues.some(line => line.includes(propMissing.path) && line.includes(missing)), `报出属性里的失效链接：${issues.join(' / ')}`);
    assert.deepEqual(errors, []);
  });
  assert.equal(vaultNotes(dsh.vault).some(name => titleOf(name) === missing), false, '没有新建目标笔记');
});

// 需求§个人知识·阅读、Wiki 与图谱（“检查属性与链接”也查属性里的链接）；需求§界面通用约定（结果用居中弹窗或右上角提示，不往下堆）
test('检查属性与链接：居中弹窗写明检查了多少篇、列出每一处失效链接（含属性里的），点“关闭”关掉', async t => {
  await prepare(t, fixtures.link, fixtures.propMissing);
  const { link, propMissing } = fixtures;
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    const listBox = await page.locator('.ww-knowledge-split').boundingBox();
    await (await libraryTool(page, '检查属性与链接')).click();
    const report = modal(page, '知识检查');
    await report.waitFor();
    assert.equal(await isCentered(page, report), true, '居中');
    const lines = await report.locator('.ww-confirm-body p').allInnerTexts();
    assert.ok(lines[0].includes(`${vaultNotes(dsh.vault).length} 篇`), `写明检查了全部 ${vaultNotes(dsh.vault).length} 篇：${lines[0]}`);
    const bodyMissing = lines.filter(line => line.includes(link.path) && line.includes('鲸翼测试-不存在'));
    assert.equal(bodyMissing.length, linesWith(link.text, '[[鲸翼测试-不存在]]').length, '正文里每一处失效链接各报一条');
    assert.ok(lines.some(line => line.includes(propMissing.path) && line.includes('鲸翼测试-属性目标缺失')), '属性里的失效链接也报出');
    assert.deepEqual(await page.locator('.ww-knowledge-split').boundingBox(), listBox, '页面没被往下推');
    await dialogButton(report, '关闭').click();
    await report.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
  });
});

// ===================== 关系图谱 =====================

/** 图谱里应有的节点：库里每篇笔记，加上夹具里链到但还没有的笔记。 */
function expectedGraphTitles() {
  const notes = vaultNotes(dsh.vault);
  const missing = [[fixtures.link, '鲸翼测试-不存在'], [fixtures.propMissing, '鲸翼测试-属性目标缺失']].filter(([fixture]) => notes.includes(fixture.path)).map(([, title]) => title);
  return [...notes.map(titleOf), ...missing].sort();
}

// 需求§个人知识·阅读、Wiki 与图谱（关系图谱以笔记为节点、链接为边，可看全库；平移缩放；新图约 0.7 秒淡入）
test('关系图谱：打开时淡入，画出全部笔记（含缺失节点），滚轮缩放、拖动平移后点“重置视图”回到原样', async t => {
  await prepare(t, fixtures.link, fixtures.refer);
  await withPage(browser, t, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await recordFadeIn(page);
    await openTab(page, '个人知识');
    const series = await fadeInSeries(page), final = series.at(-1)[1];
    assert.ok(final > 0, '画出了内容');
    assert.ok(series[0][1] < final * 0.5, `第一帧还没显示完整（${series[0][1]} / ${final}）`);
    const full = series.find(([, ink]) => ink >= final * 0.99)[0];
    assert.ok(full >= 300 && full <= 1500, `约 0.7 秒淡入完成（实际 ${Math.round(full)} 毫秒）`);

    const initial = await settled(page);
    const box = await canvasOf(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    const zoomed = await settled(page);
    assert.notEqual(zoomed.hash, initial.hash, '滚轮缩放后画面变了');
    // 从没有笔记的空白处拖动画布，不拖到节点。
    const empty = await canvasOf(page).evaluate(canvas => {
      const w = canvas.width, h = canvas.height, data = canvas.getContext('2d').getImageData(0, 0, w, h).data, box = canvas.getBoundingClientRect();
      for (let y = h - 40; y > 40; y -= 10) for (let x = 40; x < w - 120; x += 10) {
        let clear = true;
        for (let dy = -24; dy <= 24 && clear; dy += 2) for (let dx = -24; dx <= 24 && clear; dx += 2) clear = data[((y + dy) * w + x + dx) * 4 + 3] === 0;
        if (clear) return [box.left + x * box.width / w, box.top + y * box.height / h];
      }
      return null;
    });
    assert.ok(empty, '画布上找得到空白处');
    await page.mouse.move(empty[0], empty[1]);
    await page.mouse.down();
    await page.mouse.move(empty[0] + 60, empty[1] - 40, { steps: 6 });
    await page.mouse.up();
    const panned = await settled(page);
    assert.notEqual(panned.hash, zoomed.hash, '拖动后画面平移了');
    await page.locator('.ww-graph-canvas').getByRole('button', { name: '重置视图' }).click();
    assert.equal((await settled(page)).hash, initial.hash, '重置后和打开时一模一样');

    assert.deepEqual((await graphTitles(page)).sort(), expectedGraphTitles(), '全库每篇笔记和缺失节点都在图上');
    assert.deepEqual(errors, []);
  });
});

/** 悬停 A 时看 B（不相邻）的不透明度：返回 [悬停前, 悬停中, 移开后]；reduced 时悬停后只等两帧。 */
async function hoverDimming(page, immediate) {
  const a = fixtures.refer.title, b = '知识库规则';
  await settled(page);
  const spots = await locateNodes(page, [a, b]);
  assert.ok(spots[a] && spots[b], `画布上找到“${a}”和“${b}”`);
  await settled(page);
  const before = await alphaAt(page, spots[b]);
  await page.mouse.move(spots[a].x, spots[a].y);
  await graphStatus(page).getByText(a, { exact: true }).waitFor();
  let during;
  if (immediate) { await frames(page, 2); during = await alphaAt(page, spots[b]); }
  else during = await alphaDropsTo(page, spots[b], before * 0.35);
  const self = await alphaAt(page, spots[a]);
  await page.mouse.move(2, 2);
  await settled(page);
  return { before, during, self, after: await alphaAt(page, spots[b]) };
}

// 需求§个人知识·阅读、Wiki 与图谱（悬停时突出相邻节点，其余节点柔和变淡，移开后恢复）
test('关系图谱：悬停一篇笔记时，不相邻的节点变淡，移开后恢复', async t => {
  await prepare(t, fixtures.link, fixtures.refer);
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    const { before, during, self, after } = await hoverDimming(page, false);
    assert.ok(before >= 200, `悬停前“知识库规则”是实心的（不透明度 ${before}）`);
    assert.ok(during <= before * 0.35, `悬停时不相邻的“知识库规则”变淡（${before} → ${during}）`);
    assert.ok(self >= 200, `悬停的那篇不变淡（${self}）`);
    assert.equal(after, before, '移开后恢复');
    assert.deepEqual(errors, []);
  });
});

// 需求§个人知识·阅读、Wiki 与图谱（系统开启“减弱动态效果”时直接显示完整图，悬停立即切换）
test('系统要求减弱动态效果时：图谱第一帧就是完整的图，悬停时其余节点立即变淡', async t => {
  await prepare(t, fixtures.link, fixtures.refer);
  await withPage(browser, t, { reducedMotion: 'reduce' }, async ({ page, errors }) => {
    await openWhaleWing(page, dsh.url);
    await recordFadeIn(page);
    await openTab(page, '个人知识');
    const series = await fadeInSeries(page), final = series.at(-1)[1];
    assert.ok(final > 0);
    assert.ok(series[0][1] >= final * 0.98, `第一帧就是完整的图（${series[0][1]} / ${final}）`);
    const { before, during } = await hoverDimming(page, true);
    assert.ok(during <= before * 0.35, `悬停后两帧内已经变淡（${before} → ${during}）`);
    assert.deepEqual(errors, []);
  });
});

// 需求§个人知识·阅读、Wiki 与图谱（可以只看当前笔记的关系）
test('当前笔记关系图：没打开笔记时不可用；打开一篇后只画它和直接相连的笔记（含缺失节点）', async t => {
  await prepare(t, fixtures.link, fixtures.refer);
  const { link } = fixtures;
  const linkedFrom = vaultNotes(dsh.vault).filter(name => name !== link.path && fs.readFileSync(vaultFile(name), 'utf8').includes(`[[${link.title}]]`)).map(titleOf);
  const expected = [link.title, ...wikiTargets(link.text), ...linkedFrom].sort();
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    assert.equal(await (await libraryTool(page, '当前笔记关系图')).isDisabled(), true, '没打开笔记时不可用');
    await closeLibraryTools(page);
    await openNote(page, link.path);
    await (await libraryTool(page, '当前笔记关系图')).click();
    await page.getByRole('group', { name: '当前笔记关系图', exact: true }).waitFor();
    assert.deepEqual((await graphTitles(page)).sort(), expected);
    assert.deepEqual(errors, []);
  });
});

// ===================== 移出与恢复 =====================

// 需求§个人知识（删除只移到可恢复区，可以恢复）；需求§界面通用约定（删除类确认用居中弹窗、红色按钮；结果用右上角提示）
test('移到可恢复区：居中红色确认后，笔记从目录和磁盘上消失；用“恢复”填路径放回原处，内容不变', async t => {
  const note = { path: `10-收件箱/鲸翼测试-KNO17-${shortId()}.md` };
  note.text = noteText(titleOf(note.path), '这篇笔记会被移出再恢复。', { type: 'capture', status: 'inbox' });
  await prepare(t, note);
  const original = fs.readFileSync(vaultFile(note.path));
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await openNote(page, note.path);
    await (await moreActions(page)).getByRole('button', { name: '移到可恢复区' }).click();
    const dialog = modal(page, '移出笔记');
    await dialog.waitFor();
    assert.equal(await isCentered(page, dialog), true, '居中');
    assert.ok((await dialog.locator('.ww-confirm-body').innerText()).trim(), '有说明');
    assert.equal(await isRed(dialogButton(dialog, '移到可恢复区')), true, '确认按钮是红色');
    await dialogButton(dialog, '移到可恢复区').click();
    await toast(page, '已移到可恢复区', 'success').waitFor();
    assert.equal(fs.existsSync(vaultFile(note.path)), false, '磁盘原位置没有这篇了');
    await noteButton(page, titleOf(note.path)).waitFor({ state: 'detached' });

    const restore = await libraryTool(page);
    await restore.locator('summary', { hasText: '恢复' }).click();
    await restore.getByRole('textbox', { name: '要恢复的笔记路径' }).fill(note.path);
    await restore.getByRole('button', { name: '恢复', exact: true }).click();
    await toast(page, '已恢复', 'success').waitFor();
    await waitReading(page, note.path);
    assert.deepEqual(fs.readFileSync(vaultFile(note.path)), original, '放回原处，内容不变');
    await expand(page, '10-收件箱');
    await noteButton(page, titleOf(note.path)).waitFor();
    assert.deepEqual(errors, []);
  });
});

// 需求§个人知识（删除只移到可恢复区，可以恢复）；需求§界面通用约定（失败在右上角提示）
test('反例：恢复路径为空时按钮不可用；填一篇没移出过的笔记，提示找不到，不新建文件', async t => {
  await prepare(t);
  const never = '10-收件箱/鲸翼测试-没删过.md', notesBefore = vaultNotes(dsh.vault);
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    const restore = await libraryTool(page);
    await restore.locator('summary', { hasText: '恢复' }).click();
    const button = restore.getByRole('button', { name: '恢复', exact: true });
    assert.equal(await button.isDisabled(), true, '路径为空时不可用');
    await restore.getByRole('textbox', { name: '要恢复的笔记路径' }).fill('   ');
    assert.equal(await button.isDisabled(), true, '只有空格也不可用');
    await restore.getByRole('textbox', { name: '要恢复的笔记路径' }).fill(never);
    await button.click();
    const failure = toast(page, null, 'error');
    await failure.waitFor();
    assert.match(await failure.innerText(), /不存在|找不到|没有/, '说明找不到可恢复的内容');
    assert.deepEqual(errors, []);
  });
  assert.equal(fs.existsSync(vaultFile(never)), false, '没有新建文件');
  assert.deepEqual(vaultNotes(dsh.vault), notesBefore);
});

// ===================== 冲突 =====================

// 需求§数据与隐私（写入先回读当前版本、再写入、再回读确认；冲突时保留员工的修改，不静默覆盖）；KNO-19 需求§界面通用约定
// （2026-10-28 用户确认：读取最新内容会替换草稿，先居中确认）
test('反例：编辑时文件在别处被改过，保存提示冲突、不覆盖磁盘上的新内容，草稿还能导出；读取最新内容先确认，取消时草稿不动，确认后看到别处的修改', async t => {
  await prepare(t, fixtures.conflict);
  const { conflict } = fixtures, file = vaultFile(conflict.path);
  await withPage(browser, t, async ({ page, errors }) => {
    await openKnowledge(page);
    await openNote(page, conflict.path);
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    const draft = (await editor(page).inputValue()).replace('第一行：员工会在编辑区改这一行。', '第一行：员工在编辑区改过这一行。');
    await editor(page).fill(draft);
    const external = fs.readFileSync(file, 'utf8').replace('第二行：外部编辑器会改这一行。', '第二行：外部编辑器改过这一行。');
    fs.writeFileSync(file, external);

    const actions = await moreActions(page);
    await actions.getByRole('button', { name: '保存', exact: true }).click();
    const failure = toast(page, null, 'error');
    await failure.waitFor();
    assert.match(await failure.innerText(), /别处.*修改|修改过|冲突/, '提示文件在别处被改过');
    assert.equal(fs.readFileSync(file, 'utf8'), external, '磁盘上保留别处的新内容，没被草稿覆盖');
    assert.equal(await editor(page).inputValue(), draft, '草稿还在编辑区');
    const exported = decodeURIComponent((await actions.getByRole('link', { name: '导出当前正文' }).getAttribute('href')).split(',').slice(1).join(','));
    assert.equal(exported, draft, '可以导出草稿');

    await actions.getByRole('button', { name: '读取最新内容' }).click();
    const confirm = modal(page, '用最新内容替换草稿');
    await confirm.waitFor();
    assert.ok(await isCentered(page, confirm), '确认框居中');
    assert.match(await confirm.innerText(), /草稿会丢失/);
    await dialogButton(confirm, '取消').click();
    await confirm.waitFor({ state: 'detached' });
    assert.equal(await editor(page).inputValue(), draft, '取消后草稿还在编辑区');
    await actions.getByRole('button', { name: '读取最新内容' }).click();
    await dialogButton(confirm, '读取最新内容').click();
    await page.locator('.ww-reader').waitFor();
    const reading = await page.locator('.ww-reader').innerText();
    assert.match(reading, /外部编辑器改过这一行/, '读到别处的修改');
    assert.doesNotMatch(reading, /员工在编辑区改过这一行/);
    assert.deepEqual(errors, []);
  });
  assert.equal(fs.readFileSync(file, 'utf8').includes('外部编辑器改过这一行'), true);
});

// ===================== 窄宽度 =====================

// 需求§个人知识·阅读、Wiki 与图谱（知识区够宽时右侧栏和正文并排、默认打开，窄时点工具条上的按钮才浮出来，跳转后自动收起）
test('知识区窄时右侧栏默认收起，点按钮浮出，点目录跳转后自动收起；够宽时并排打开', async t => {
  await prepare(t, fixtures.link);
  const { link } = fixtures, target = headingsOf(link.text)[2];
  await withPage(browser, t, { width: 1024, height: 700 }, async ({ page, errors }) => {
    await openKnowledge(page);
    await openNote(page, link.path);
    assert.equal(await page.locator('.ww-note-side').count(), 0, '窄时默认收起');
    const toggle = page.locator('.ww-side-toggle');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await toggle.click();
    await page.locator('.ww-note-body.ww-side-overlay .ww-note-side').waitFor();
    await page.getByRole('navigation', { name: '目录' }).getByRole('button', { name: target }).click();
    await page.locator('.ww-note-side').waitFor({ state: 'detached' });
    await page.waitForFunction(text => {
      const box = document.querySelector('.ww-note-scroll'), heading = [...box.querySelectorAll('.ww-reader h2')].find(h => h.textContent === text);
      return heading && Math.abs(heading.getBoundingClientRect().top - box.getBoundingClientRect().top) <= 40;
    }, target);
    assert.deepEqual(errors, []);
  });
  await withPage(browser, t, async ({ page }) => {
    await openKnowledge(page);
    await openNote(page, link.path);
    await page.locator('.ww-note-body.ww-with-side .ww-note-side').waitFor();
    assert.equal(await page.locator('.ww-side-toggle').getAttribute('aria-pressed'), 'true', '够宽时默认并排打开');
  });
});
