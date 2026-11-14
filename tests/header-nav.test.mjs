// 页头：常用页签 + 全部功能（2026-11-13）。需求见 docs/业务能力设计.md「页头：常用页签和全部功能」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { Context } from '@deepseek-ai/cordis';
import { parts, navGroups } from '../features/index.js';
import { FeatureRegistry } from '../src/features.js';
import { workbenchContract } from '../src/workbench-contract.js';
import { DEFAULT_PINS, fitTabs, searchFeatures, highlightParts, pinsKey, seenKey } from '../src/shell/launcher.js';
import { fixture } from './client-fixture.mjs';

const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const textOf = tree => tree === null || tree === undefined || tree === false || tree === true ? '' : typeof tree !== 'object' ? String(tree) : Array.isArray(tree) ? tree.map(textOf).join('') : textOf(tree.props?.children);
/** 页头上的页签文字，按显示顺序：常用页签、没钉住临时放着的那一个、最右的模型世界。 */
const headerTabs = tree => nodes(tree).filter(node => node.type === 'button' && node.props?.['data-tab']).map(node => node.props.children[0]);
const tabButton = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props?.['data-tab'] && node.props.children[0] === label);
const byLabel = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props['aria-label'] === label);
const launchButton = tree => nodes(tree).find(node => node.type === 'button' && node.props.className === 'ww-launch');
const tile = (tree, id) => nodes(tree).find(node => node.type === 'button' && node.props.className === 'ww-launcher-open' && node.props['data-feature'] === id);
const tempTabs = tree => nodes(tree).filter(node => node.props?.className === 'ww-tab-temp').map(node => node.props['data-nav-item']);
const toasted = (tree, text) => nodes(tree).some(node => node.props?.children?.includes?.(text));
/** “全部功能”里每一组有哪些功能，按显示顺序。 */
const groups = tree => nodes(tree).filter(node => node.type === 'section' && node.props['data-group']).map(section => [section.props['data-group'], nodes(section).filter(node => node.props?.className === 'ww-launcher-name').map(node => node.props.children[0])]);
const pinnedRow = tree => nodes(tree).filter(node => node.type === 'li' && node.props['data-pin']).map(node => node.props['data-pin']);
const storedPins = f => JSON.parse(f.storage.get(pinsKey) || 'null')?.pins;
const featureFrame = (revision, omitted = [], extra = []) => ({ revision, features: [...parts.filter(part => !omitted.includes(part.id)).map(part => ({ instance: parts.indexOf(part) + 1, id: part.id, kind: part.kind, api: 1, package: 'dsh-whalewing', skills: [] })), ...extra] });
const extension = (id, tab) => ({ id, instance: 100 + id.length, kind: 'extension', api: 1, package: `dsh-${id}`, skills: [], ...(tab ? { tab } : {}) });
/** 打开“全部功能”并返回打开后的界面。 */
function openLauncher(f) {
  // 上次关面板时清空搜索框是普通 effect，先让它跑完。
  f.render(); f.flushEffects();
  const button = launchButton(f.render());
  assert.equal(button.props['aria-expanded'], false, '面板原来关着');
  button.props.onClick();
  const tree = f.render();
  assert.equal(launchButton(tree).props['aria-expanded'], true);
  return tree;
}
/** 点一下会切页的按钮：切到没打开过的页要等新页面画出来才算完，所以点完先画一遍再等。 */
function go(f, node) { const pending = node.props.onClick(); f.render(); return pending; }
/** 按一次键盘：把事件交给页面挂在窗口上的监听。 */
function press(f, event) {
  f.render(); f.flushEffects();
  let prevented = false;
  for (const listener of [...(f.windowEvents.get('keydown') || [])]) listener({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault() { prevented = true; }, ...event });
  return prevented;
}

test('放不下时从前往后尽量多留，正在看的那一个一定留在外面', () => {
  assert.deepEqual(fitTabs({ widths: [80, 80, 80], gap: 2, budget: 300 }), [], '放得下就都留着');
  assert.deepEqual(fitTabs({ widths: [80, 80, 80, 80], gap: 2, budget: 170 }), [2, 3], '只放得下两个，后两个收起');
  assert.deepEqual(fitTabs({ widths: [80, 80, 80, 80], gap: 2, budget: 170, active: 3 }), [1, 2], '正在看的是最后一个：让出一个位置给它');
  assert.deepEqual(fitTabs({ widths: [80, 80, 80, 80], gap: 2, budget: 170, active: 1 }), [2, 3], '正在看的本来就留着，不动');
  assert.deepEqual(fitTabs({ widths: [80, 300], gap: 2, budget: 100, active: 1 }), [0], '正在看的比剩下的宽度还宽，也只留它');
  assert.deepEqual(fitTabs({ widths: [], gap: 2, budget: 100 }), []);
});

test('按名字或用途找功能：每个词都要对上，名字对上的排前面', () => {
  const items = [
    { id: 'experts', name: '专家团队', purpose: '把事交给专家去做', keys: '小鲸 派活', groupName: '做事' },
    { id: 'toolbox', name: '办公工坊', purpose: 'PDF、图片在本机处理', keys: 'pdf 压缩 excel', groupName: '办公' },
    { id: 'models', name: '模型世界', purpose: '按实力和价格选模型', keys: '排行 榜单', groupName: '资讯' },
    { id: 'office-notes', name: '办公笔记', purpose: '记会议', keys: '', groupName: '扩展' },
  ];
  const ids = text => searchFeatures(items, text).list.map(item => item.id);
  assert.deepEqual(ids('pdf'), ['toolbox'], '用途和关键词不分大小写');
  assert.deepEqual(ids('排行'), ['models'], '关键词里有也算');
  assert.deepEqual(ids('办公'), ['toolbox', 'office-notes'], '名字开头对上的在前，同分按原来的顺序');
  assert.deepEqual(ids('办公笔记'), ['office-notes'], '名字完全一样');
  assert.deepEqual(ids('办公 pdf'), ['toolbox'], '空格隔开的每个词都要对上');
  assert.deepEqual(ids('做事'), ['experts'], '分组名也能搜');
  assert.deepEqual(ids('报销'), []); assert.deepEqual(ids('   '), []);
  assert.deepEqual(highlightParts('办公工坊 PDF', ['pdf']), [{ text: '办公工坊 ', hit: false }, { text: 'PDF', hit: true }]);
  assert.deepEqual(highlightParts('专家团队', ['排行']), [{ text: '专家团队', hit: false }]);
});

test('默认页头只放五个常用页签，模型世界固定在最右；其余功能在全部功能里按分组排', async () => {
  const f = await fixture({ headerPins: null });
  const first = f.render();
  assert.deepEqual(DEFAULT_PINS, ['experts', 'knowledge', 'skills', 'automation', 'toolbox']);
  assert.deepEqual(headerTabs(first), ['专家团队', '知识积累', '技能中心', '定时任务', '办公工坊', '模型世界']);
  assert.equal(tabButton(first, '专家团队').props['aria-pressed'], true);
  assert.deepEqual(tempTabs(first), []); assert.equal(tile(first, 'ai-web'), undefined, '面板没打开时不画里面的格子');
  assert.equal(nodes(first).find(node => node.props?.className === 'ww-tabs-more').props.hidden, true, '放得下时没有“更多”');
  const open = openLauncher(f);
  assert.deepEqual(groups(open), [['work', ['专家团队', 'AI 网页', '定时任务']], ['knowledge', ['知识积累', '技能中心']], ['office', ['办公工坊']], ['news', ['每日阅读', '模型世界']]]);
  assert.deepEqual(navGroups, ['work', 'knowledge', 'office', 'news']);
  assert.deepEqual(pinnedRow(open), DEFAULT_PINS, '“钉在页头的”和页头同一个顺序');
  assert.ok(textOf(open).includes('模型世界 · 固定在最右'));
  assert.equal(byLabel(open, '把模型世界钉到页头'), undefined); assert.equal(byLabel(open, '从页头取下模型世界'), undefined);
  assert.equal(byLabel(open, '把AI 网页钉到页头').props['aria-pressed'], false);
  assert.equal(nodes(open).filter(node => node.type === 'button' && node.props.className?.includes('ww-launcher-pin-toggle') && node.props['aria-pressed']).length, 5);
  for (const part of parts.filter(part => part.label)) assert.ok(f.ctx.whalewingWorkbench.internal.directory().find(item => item.id === part.id).purpose.length > 4, `${part.id} 写了用途`);
  assert.equal(storedPins(f), undefined, '没动过就不往本机写');
  f.unmount();
});

test('从全部功能打开没钉住的功能：页头临时多一个页签，再开别的就换掉；可以直接钉住或关掉', async () => {
  const f = await fixture({ headerPins: null, featureFrame: featureFrame(0, [], [extension('reports')]) });
  f.ctx.slots.register({ name: 'whalewing.workbench.tab', id: 'reports', order: 100, label: () => '扩展报表' }, () => null);
  await go(f, tile(openLauncher(f), 'ai-web'));
  let tree = f.render();
  assert.equal(launchButton(tree).props['aria-expanded'], false, '打开功能后面板收起');
  assert.deepEqual(headerTabs(tree), ['专家团队', '知识积累', '技能中心', '定时任务', '办公工坊', 'AI 网页', '模型世界']);
  assert.deepEqual(tempTabs(tree), ['ai-web']); assert.equal(tabButton(tree, 'AI 网页').props['aria-pressed'], true);
  await go(f, tile(openLauncher(f), 'reports'));
  tree = f.render();
  assert.deepEqual(tempTabs(tree), ['reports'], '再打开一个没钉住的，原来那个换掉，不会越开越多');
  assert.equal(headerTabs(tree).includes('AI 网页'), false);
  await tabButton(tree, '专家团队').props.onClick();
  tree = f.render();
  assert.deepEqual(tempTabs(tree), ['reports'], '切到别的页，临时页签还留着');
  assert.equal(tabButton(tree, '扩展报表').props['aria-pressed'], false);
  byLabel(tree, '把扩展报表钉到页头').props.onClick();
  tree = f.render();
  assert.deepEqual(tempTabs(tree), []);
  assert.deepEqual(headerTabs(tree), ['专家团队', '知识积累', '技能中心', '定时任务', '办公工坊', '扩展报表', '模型世界']);
  assert.ok(toasted(tree, '“扩展报表”钉到页头了'));
  assert.deepEqual(storedPins(f), [...DEFAULT_PINS, 'reports']);
  // 关掉正在看的临时页签，回到第一个常用页签。
  await go(f, tile(openLauncher(f), 'ai-web'));
  byLabel(f.render(), '关掉这个页签').props.onClick();
  tree = f.render();
  assert.deepEqual(tempTabs(tree), []); assert.equal(tabButton(tree, '专家团队').props['aria-pressed'], true);
  f.unmount();
});

test('在全部功能里钉上、取下、拖到哪放到哪，记在本机，下次打开还是这样；页头至少留一个', async () => {
  const storage = new Map();
  const f = await fixture({ headerPins: null, storage });
  let tree = openLauncher(f);
  byLabel(tree, '把AI 网页钉到页头').props.onClick();
  byLabel(f.render(), '从页头取下办公工坊').props.onClick();
  tree = f.render();
  assert.ok(toasted(tree, '“办公工坊”从页头取下了，还在全部功能里'));
  assert.equal(launchButton(tree).props['aria-expanded'], true, '钉上、取下不关面板');
  assert.deepEqual(headerTabs(tree), ['专家团队', '知识积累', '技能中心', '定时任务', 'AI 网页', '模型世界']);
  // 每个小块前面一个小点（共用的拖动，算位置和键盘的细节在 tests/sortable.test.mjs）：鼠标按住它拖（真实的拖动在功能测试里点），焦点在它上面时按左右方向键一次挪一位。没有一格一格挪的箭头按钮。
  const grip = (view, name) => byLabel(view, `拖动${name}调整位置，也可以按左右方向键`);
  const key = name => ({ key: name, preventDefault() {} });
  assert.equal(byLabel(tree, '专家团队往前挪'), undefined); assert.equal(byLabel(tree, 'AI 网页往后挪'), undefined);
  assert.equal(nodes(tree).filter(node => node.type === 'button' && node.props.className === 'ww-grip').length, 5, '钉着的每个都有小点');
  grip(tree, 'AI 网页').props.onKeyDown(key('ArrowLeft')); grip(f.render(), 'AI 网页').props.onKeyDown(key('ArrowLeft'));
  grip(f.render(), '专家团队').props.onKeyDown(key('ArrowRight'));
  grip(f.render(), '专家团队').props.onKeyDown(key('Enter'));
  grip(f.render(), '知识积累').props.onKeyDown(key('ArrowLeft'));
  tree = f.render();
  assert.deepEqual(headerTabs(tree), ['知识积累', '专家团队', 'AI 网页', '技能中心', '定时任务', '模型世界'], '别的键不动，已经在最前的再往前也不动');
  // 拖到哪放到哪：直接放到第几个，页头跟着换；放回原处不重新写本机存储。
  const core = f.ctx.whalewingWorkbench.internal;
  core.movePinTo('automation', 0);
  assert.deepEqual(headerTabs(f.render()), ['定时任务', '知识积累', '专家团队', 'AI 网页', '技能中心', '模型世界']);
  core.movePinTo('automation', 2);
  assert.deepEqual(pinnedRow(f.render()), ['knowledge', 'experts', 'automation', 'ai-web', 'skills']);
  core.movePinTo('automation', 99);
  const written = f.storage.get(pinsKey);
  f.storage.set(pinsKey, 'sentinel'); core.movePinTo('automation', 4); core.movePinTo('model-world', 0); core.movePinTo('missing', 0);
  assert.equal(f.storage.get(pinsKey), 'sentinel', '位置没变、固定在最右的、不存在的都不写');
  f.storage.set(pinsKey, written);
  tree = f.render();
  assert.deepEqual(headerTabs(tree), ['知识积累', '专家团队', 'AI 网页', '技能中心', '定时任务', '模型世界']);
  assert.deepEqual(pinnedRow(tree), ['knowledge', 'experts', 'ai-web', 'skills', 'automation']);
  assert.deepEqual(storedPins(f), ['knowledge', 'experts', 'ai-web', 'skills', 'automation']);
  f.unmount();
  const again = await fixture({ headerPins: null, storage });
  assert.deepEqual(headerTabs(again.render()), ['知识积累', '专家团队', 'AI 网页', '技能中心', '定时任务', '模型世界'], '重新打开还是上次排的');
  // 正在看的页签被取下：它变成临时页签，不会突然找不到。
  tree = openLauncher(again);
  byLabel(tree, '从页头取下专家团队').props.onClick();
  tree = again.render();
  assert.deepEqual(tempTabs(tree), ['experts']); assert.equal(tabButton(tree, '专家团队').props['aria-pressed'], true);
  for (const name of ['AI 网页', '技能中心', '定时任务']) byLabel(again.render(), `从页头取下${name}`).props.onClick();
  tree = again.render();
  assert.deepEqual(pinnedRow(tree), ['knowledge']);
  assert.equal(byLabel(tree, '从页头取下知识积累').props.disabled, true, '只剩一个时不能再取下');
  assert.equal(byLabel(tree, '拖动知识积累调整位置，也可以按左右方向键').props.disabled, true, '只剩一个也没处可拖');
  again.ctx.whalewingWorkbench.internal.unpinTab('knowledge');
  tree = again.render();
  assert.ok(toasted(tree, '页头至少留一个常用页签')); assert.deepEqual(storedPins(again), ['knowledge']);
  again.unmount();
});

test('钉着的可选功能关掉时页签撤下，再开回到原来的位置；钉着的都不在时页头用默认的那几个', async () => {
  const f = await fixture({ headerPins: ['toolbox', 'experts', 'cards'] });
  assert.deepEqual(headerTabs(f.render()), ['办公工坊', '专家团队', '每日阅读', '模型世界']);
  await f.featureUpdate(featureFrame(1, ['toolbox', 'model-world']));
  assert.deepEqual(headerTabs(f.render()), ['专家团队', '每日阅读']);
  // 这时候换位置：关掉的办公工坊留在它原来的格子里，只重排现在有的两个。
  f.ctx.whalewingWorkbench.internal.movePinTo('cards', 0);
  assert.deepEqual(headerTabs(f.render()), ['每日阅读', '专家团队']);
  assert.deepEqual(storedPins(f), ['toolbox', 'cards', 'experts']);
  f.ctx.whalewingWorkbench.internal.movePinTo('cards', 1);
  await f.featureUpdate(featureFrame(2));
  assert.deepEqual(headerTabs(f.render()), ['办公工坊', '专家团队', '每日阅读', '模型世界']);
  f.unmount();
  const only = await fixture({ headerPins: ['toolbox'] });
  assert.deepEqual(headerTabs(only.render()), ['办公工坊', '专家团队', '模型世界']); assert.deepEqual(tempTabs(only.render()), ['experts'], '进来先到专家团队，它没钉着就临时放着');
  await only.featureUpdate(featureFrame(1, ['toolbox']));
  assert.deepEqual(headerTabs(only.render()), ['专家团队', '知识积累', '技能中心', '定时任务', '模型世界'], '钉着的唯一一个关掉了，页头不空着');
  assert.deepEqual(tempTabs(only.render()), []);
  only.unmount();
  // 本机记的东西读不出来或者不是清单，都当成没钉过。
  for (const broken of ['{', '{"pins":"experts"}', '[]']) {
    const storage = new Map([[pinsKey, broken]]);
    const bad = await fixture({ headerPins: null, storage });
    assert.deepEqual(headerTabs(bad.render()), ['专家团队', '知识积累', '技能中心', '定时任务', '办公工坊', '模型世界'], broken);
    bad.unmount();
  }
});

test('Ctrl K 打开全部功能并直接搜：上下键选、回车打开；“…”里的“调整常用页签”也打开它', async () => {
  const f = await fixture({ headerPins: null });
  assert.equal(press(f, { metaKey: true, key: 'k' }), false, '不是苹果电脑时 Command K 不管');
  assert.equal(press(f, { ctrlKey: true, shiftKey: true, key: 'K' }), false);
  assert.equal(launchButton(f.render()).props['aria-expanded'], false);
  assert.equal(press(f, { ctrlKey: true, key: 'k' }), true);
  let tree = f.render();
  assert.equal(launchButton(tree).props['aria-expanded'], true);
  const field = () => nodes(f.render()).find(node => node.type === 'input' && node.props['aria-label'] === '搜功能');
  const options = () => nodes(f.render()).filter(node => node.type === 'li' && node.props.role === 'option');
  field().props.onChange({ target: { value: '排行' } });
  assert.deepEqual(options().map(option => [textOf(option), option.props['aria-selected']]), [['模型世界按实力和价格选对模型、花对钱资讯 · 在页头', true]]);
  field().props.onChange({ target: { value: '知识卡片' } });
  assert.deepEqual(options().map(option => nodes(option).find(node => node.type === 'strong').props.children.map(textOf).join('')), ['每日阅读'], '改名前叫“知识卡片”，按旧名字也搜得到');
  field().props.onChange({ target: { value: '报销' } });
  assert.ok(textOf(f.render()).includes('没找到“报销”。')); assert.equal(options().length, 0);
  field().props.onChange({ target: { value: '每' } });
  assert.deepEqual(options().map(option => nodes(option).find(node => node.type === 'strong').props.children.map(textOf).join('')), ['每日阅读', '定时任务'], '名字以“每”开头的排前面，用途里有“每”的排后面');
  assert.equal(options().every(option => nodes(option).some(node => node.type === 'mark')), true, '命中的字标出来');
  let prevented = 0;
  field().props.onKeyDown({ key: 'ArrowDown', preventDefault() { prevented++; } });
  assert.deepEqual(options().map(option => option.props['aria-selected']), [false, true]);
  field().props.onKeyDown({ key: 'ArrowDown', preventDefault() { prevented++; } });
  assert.deepEqual(options().map(option => option.props['aria-selected']), [true, false], '到底再按回到第一项');
  field().props.onKeyDown({ key: 'ArrowUp', preventDefault() { prevented++; } });
  assert.deepEqual(options().map(option => option.props['aria-selected']), [false, true], '在第一项再往上到最后一项');
  await field().props.onKeyDown({ key: 'Enter', preventDefault() { prevented++; } });
  tree = f.render();
  assert.equal(prevented, 4); assert.equal(launchButton(tree).props['aria-expanded'], false);
  assert.equal(tabButton(tree, '定时任务').props['aria-pressed'], true);
  // 再打开时搜索框是空的。
  press(f, { ctrlKey: true, key: 'k' });
  f.render(); f.flushEffects();
  assert.equal(field().props.value, '');
  nodes(f.render()).find(node => node.type === 'div' && node.props.className === 'ww-launcher').props.onKeyDown({ key: 'Escape', preventDefault() {} });
  assert.equal(launchButton(f.render()).props['aria-expanded'], false, 'Esc 收起');
  const header = nodes(f.render()).find(node => node.type === 'header' && node.props.className === 'ww-header ww-workbench-header');
  const menu = nodes(header).find(node => node.props?.iconOnly && node.props?.label === '更多操作');
  nodes(menu).find(node => node.type === 'button' && node.props.children.includes('调整常用页签')).props.onClick();
  assert.equal(launchButton(f.render()).props['aria-expanded'], true);
  f.unmount();
});

test('扩展的页签进全部功能：没写分组的在“扩展”一组，写了的进对应分组；第一次出现提示一次，没打开过标“新装的”', async () => {
  const storage = new Map();
  const frame = featureFrame(0, [], [extension('reports', { group: 'office', summary: { zh: '把这周做的事导出成周报', en: 'Export a weekly report' } }), extension('team')]);
  const mount = async () => {
    const f = await fixture({ headerPins: null, storage, featureFrame: frame });
    f.ctx.slots.register({ name: 'whalewing.workbench.tab', id: 'reports', order: 100, label: () => '周报' }, () => null);
    f.ctx.slots.register({ name: 'whalewing.workbench.tab', id: 'team', order: 110, label: () => '团队' }, () => null);
    return f;
  };
  const f = await mount();
  let tree = f.render();
  assert.equal(headerTabs(tree).includes('团队'), false); assert.equal(headerTabs(tree).includes('周报'), false);
  assert.ok(toasted(tree, '「团队」装好了，在“全部功能”里；常用的话可以钉到页头'), '提示里能直接钉上');
  assert.deepEqual(JSON.parse(storage.get(seenKey)), { told: ['reports', 'team'], opened: [] });
  tree = openLauncher(f);
  assert.deepEqual(groups(tree).slice(2), [['office', ['办公工坊', '周报']], ['news', ['每日阅读', '模型世界']], ['extension', ['团队']]]);
  assert.ok(textOf(tree).includes('扩展装上后先放这里，不占页头'));
  assert.ok(textOf(tile(tree, 'reports')).includes('把这周做的事导出成周报')); assert.ok(textOf(tile(tree, 'reports')).includes('新装的'));
  nodes(tree).find(node => node.type === 'input' && node.props['aria-label'] === '搜功能').props.onChange({ target: { value: '周报' } });
  assert.deepEqual(nodes(f.render()).filter(node => node.type === 'li' && node.props.role === 'option').map(option => option.props.children[0].props['data-feature']), ['reports'], '扩展写的用途也能搜到');
  await go(f, nodes(f.render()).find(node => node.type === 'li' && node.props.role === 'option').props.children[0]);
  tree = openLauncher(f);
  assert.equal(textOf(tile(tree, 'reports')).includes('新装的'), false, '打开过就不标了'); assert.ok(textOf(tile(tree, 'reports')).includes('正在看'));
  assert.ok(textOf(tile(tree, 'team')).includes('新装的'));
  f.unmount();
  const again = await mount();
  tree = again.render();
  assert.equal(toasted(tree, '「团队」装好了，在“全部功能”里；常用的话可以钉到页头'), false, '同一个扩展只提示一次');
  assert.equal(textOf(tile(openLauncher(again), 'reports')).includes('新装的'), false);
  again.unmount();
});

test('扩展登记页签时可以选分组、写一句用途，界面收到的帧原样带上', async t => {
  const ctx = new Context(), registry = new FeatureRegistry(ctx);
  t.after(() => ctx.fiber.dispose());
  const controller = new AbortController(), stream = registry.watch(controller.signal);
  await stream.next();
  const tab = { keepAlive: true, group: 'office', summary: { zh: '把这周做的事导出成周报', en: 'Export a weekly report' } };
  const feature = await ctx.plugin(scope => { registry.register(scope, { id: 'reports', api: 1, package: 'dsh-reports', tab }); });
  const frame = (await stream.next()).value;
  assert.deepEqual(frame.features[0].tab, tab);
  assert.deepEqual(workbenchContract(z).snapshot.parse(frame).features[0].tab, tab);
  for (const group of navGroups) assert.doesNotThrow(() => workbenchContract(z).snapshot.parse({ revision: 1, features: [{ ...frame.features[0], tab: { group } }] }));
  assert.throws(() => workbenchContract(z).snapshot.parse({ revision: 1, features: [{ ...frame.features[0], tab: { group: 'tools' } }] }), '分组名不用“工具”，也不接受清单以外的');
  controller.abort(); await feature.dispose();
});

// 2026-11-14 办公工坊方案 A：员工不在那一页时，功能可以在自己的页签上标个点（处理中、做好了、没做成），回来看过就去掉。
test('功能可以在自己的页签上标个点：钉着的标在页签上，没在页头的标在“全部功能”上（收进“更多”的标在“更多”上，要量宽度，在功能测试里看）；去掉、功能撤下时跟着消失', async () => {
  const f = await fixture({ headerPins: null, featureFrame: featureFrame(0) });
  const core = f.ctx.whalewingWorkbench.internal, toolbox = core.scope('toolbox'), aiWeb = core.scope('ai-web');
  const dotOf = node => nodes(node).find(child => child.props?.className === 'ww-tab-dot');
  let tree = f.render();
  assert.equal(dotOf(tabButton(tree, '办公工坊')), undefined);
  toolbox.setAttention({ tone: 'busy', label: '办公工坊：还在处理' });
  tree = f.render();
  let dot = dotOf(tabButton(tree, '办公工坊'));
  assert.equal(dot.props['data-tone'], 'busy'); assert.equal(dot.props['aria-label'], '办公工坊：还在处理'); assert.equal(dot.props.role, 'img');
  assert.equal(dotOf(launchButton(tree)), undefined, '页签在页头，不再标在“全部功能”上');
  toolbox.setAttention({ tone: 'done', label: '办公工坊：做好了，结果还没下载' });
  assert.equal(dotOf(tabButton(f.render(), '办公工坊')).props['data-tone'], 'done');
  toolbox.setAttention(null);
  assert.equal(dotOf(tabButton(f.render(), '办公工坊')), undefined, '传 null 去掉');
  // AI 网页默认没钉在页头：点标在“全部功能”按钮上。
  aiWeb.setAttention({ tone: 'failed', label: 'AI 网页：没做成' });
  tree = f.render();
  assert.equal(dotOf(launchButton(tree)).props['data-tone'], 'failed');
  assert.deepEqual(Object.keys(core.attention()), ['ai-web']);
  core.releaseFeature('ai-web');
  assert.deepEqual(core.attention(), {}, '功能撤下时点跟着消失');
  assert.equal(dotOf(launchButton(f.render())), undefined);
  f.unmount();
});
