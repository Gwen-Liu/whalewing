import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, roles } from './client-fixture.mjs';

// 2026-11-08 专家团队页第三版：左栏在用的专家、中间那位专家说的话或专家库、右边小鲸。
const nodes = tree => tree === null || tree === undefined || tree === false ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree !== 'object' ? [] : [tree, ...nodes(tree.props?.children)];
const text = tree => nodes(tree).flatMap(node => [node.props?.children].flat().filter(child => typeof child === 'string')).join('');
const button = (tree, label) => {
  const found = nodes(tree).find(node => node.type === 'button' && [node.props.children].flat().includes(label));
  assert.ok(found, `按钮 ${label} 存在`);
  return found;
};
const day = 24 * 3600 * 1000;
const testing = { ...roles[1], id: 'testing', name: '测试专家', description: '写测试' };
const weekly = { ...roles[1], id: 'custom-weekly', name: '周报整理员', description: '整理周报', builtin: false };

async function team(options = {}) {
  const roster = { marks: {}, idleDays: 14 }, marks = [];
  const f = await fixture({ ...options, experts: async input => {
    if (input.action === 'list') return { ok: true, value: { experts: [roles[0], roles[1], testing, weekly], deleted: [], roster } };
    if (input.action === 'roster_mark') { roster.marks[input.id] = { state: input.state, at: Date.now() }; marks.push([input.id, input.state]); return { ok: true, value: { roster } }; }
    if (input.action === 'roster_settings') { roster.idleDays = input.idleDays; marks.push(['idleDays', input.idleDays]); return { ok: true, value: { roster } }; }
    if (input.action === 'memory_summary') return { ok: true, value: { memories: { development: 3 } } };
    if (input.action === 'templates') return { ok: true, value: { templates: [] } };
    throw new Error(`意外动作 ${input.action}`);
  } });
  const now = Date.now();
  const session = (id, expertId, ago, extra = {}) => [id, { id, title: extra.title ?? '', updatedAt: now - ago, blank: false, ...extra, projectionValues: { whalewingExpert: { expertId }, ...(extra.projectionValues ?? {}) } }];
  const current = f.ctx.sessions.list.getSnapshot();
  f.ctx.sessions.list.set({ ...current, byId: { ...current.byId, ...Object.fromEntries([
    session('dev-task', 'development', 60_000, { title: '研发专家 · 修复导出乱码', projectionValues: { whalewingDispatch: { title: '修复导出乱码', from: 'a', status: 'waiting', reply: '', turns: 1 } } }),
    session('dev-old', 'development', 3 * day, { title: '研发专家 · 旧任务' }),
    session('test-old', 'testing', 20 * day),
    session('weekly-1', 'custom-weekly', 2 * day, { title: '周报整理员 · 本周周报' }),
  ]) } });
  return { f, marks };
}
const rosterNames = f => nodes(f.render()).filter(node => node.type === 'button' && node.props.className === 'ww-roster-item').map(node => text(nodes(node).find(child => child.props?.className === 'ww-roster-name')));
const rosterLine = (f, name) => text(nodes(nodes(f.render()).find(node => node.type === 'button' && node.props.className === 'ww-roster-item' && text(node).includes(name))).find(node => node.type === 'small'));
const library = f => nodes(f.render()).find(node => node.type === 'button' && String(node.props.className).includes('ww-roster-library')).props.onClick();
const pane = (f, name) => nodes(f.render()).find(node => node.type === 'section' && node.props['aria-label'] === `${name}说的话`);

test('左栏只列在用的专家：等你审批的在前，写着在干什么；20 天没用的回了专家库；中间默认是第一位', async () => {
  const { f } = await team();
  assert.deepEqual(rosterNames(f), ['研发专家', '周报整理员']);
  assert.equal(rosterLine(f, '研发专家'), '等你审批 · 修复导出乱码');
  assert.equal(rosterLine(f, '周报整理员'), '2 天前用过');
  const dev = pane(f, '研发专家');
  assert.ok(dev, '中间默认是左栏第一位');
  const select = nodes(dev).find(node => node.type === 'select');
  assert.equal(select.props.value, 'dev-task', '默认打开手上那件事');
  assert.deepEqual(nodes(select).filter(node => node.type === 'option').map(text), ['修复导出乱码 · 等你审批', '旧任务']);
  assert.equal(nodes(f.render()).some(node => text(node) === '小鲸助手' && node.props?.className === 'ww-roster-name'), false, '小鲸不在左栏');
});

test('专家库按内置、我建的分组，在用的标“在用”；选用后进左栏，放回后离开；手上有事的不能放回', async () => {
  const { f, marks } = await team();
  library(f);
  const groups = nodes(f.render()).filter(node => node.type === 'section' && node.props.className === 'ww-lib-group');
  assert.deepEqual(groups.map(group => group.props['aria-label']), ['内置', '我建的']);
  const row = name => nodes(f.render()).find(node => node.type === 'li' && node.props.className === 'ww-lib-row' && text(node).includes(name));
  assert.match(text(row('研发专家')), /在用/);
  assert.match(text(row('测试专家')), /20 天前用过/);
  await button(row('测试专家'), '选用').props.onClick();
  assert.deepEqual(marks, [['testing', 'picked']]);
  assert.deepEqual(rosterNames(f), ['研发专家', '测试专家', '周报整理员']);
  assert.ok(pane(f, '测试专家'), '选用后中间打开它');
  // 手上有事的放不回去；周报整理员能放回。
  library(f); nodes(f.render()).find(node => node.type === 'button' && node.props['aria-label'] === '打开研发专家').props.onClick();
  assert.equal(nodes(pane(f, '研发专家')).some(node => node.type === 'button' && [node.props.children].flat().includes('放回专家库')), false);
  library(f); nodes(f.render()).find(node => node.type === 'button' && node.props['aria-label'] === '打开周报整理员').props.onClick();
  await button(pane(f, '周报整理员'), '放回专家库').props.onClick();
  assert.deepEqual(marks.at(-1), ['custom-weekly', 'returned']);
  assert.deepEqual(rosterNames(f), ['研发专家', '测试专家']);
});

test('中间那栏嵌选中任务的原生会话，换任务换会话，离开时释放', async () => {
  const { f } = await team();
  const render = () => f.render('main', { SessionProvider: 'SessionProvider', renderSlot: name => ({ type: name, props: { children: [] } }) });
  render(); f.flushEffects(); render();
  const provider = () => nodes(pane({ render }, '研发专家')).find(node => node.type === 'SessionProvider');
  assert.equal(provider().props.session.sessionId, 'dev-task');
  assert.ok(nodes(provider()).some(node => node.type === 'whalewing.experts.conversation'));
  nodes(pane({ render }, '研发专家')).find(node => node.type === 'select').props.onChange({ target: { value: 'dev-old' } });
  // 换任务的那一刻旧会话还嵌在页面上，先不放；新会话接上之后才放旧的（先放会让嵌着的会话报“引用已释放”）。
  render();
  assert.equal(provider().props.session.sessionId, 'dev-task');
  assert.equal(f.calls.some(call => call[0] === 'release' && call[1] === 'dev-task'), false);
  f.flushEffects(); render(); f.flushEffects(); render();
  assert.equal(provider().props.session.sessionId, 'dev-old');
  assert.equal(f.calls.some(call => call[0] === 'release' && call[1] === 'dev-task'), true, '换上新会话之后放掉旧的');
});

test('小鲸对话里点派出去的任务：回到专家团队页，中间打开那位专家的那件任务', async () => {
  const { f } = await team();
  f.render(); f.flushEffects();
  f.clients.assistant.showTask('weekly-1');
  const weeklyPane = pane(f, '周报整理员');
  assert.ok(weeklyPane);
  assert.equal(nodes(weeklyPane).find(node => node.type === 'select').props.value, 'weekly-1');
});

test('可选设置里改多久不用就回专家库', async () => {
  const { f, marks } = await team();
  const select = nodes(f.render()).find(node => node.type === 'select' && nodes(node).some(option => option.type === 'option' && text(option) === '不自动放回'));
  assert.equal(select.props.value, '14');
  await select.props.onChange({ target: { value: '0' } });
  assert.deepEqual(marks, [['idleDays', 0]]);
  assert.deepEqual(rosterNames(f), ['研发专家', '周报整理员', '测试专家'], '不自动放回时用过的都在，按最近用过排');
});

// 2026-11-10 用户定：进鲸翼小鲸不自己打开，只留气泡，员工想用再点开；取代 11-08 进专家团队页自动停靠。
test('进专家团队页小鲸不自己打开：没选过的只有气泡，点开是悬浮；上次停靠的，进来也只有气泡，点开照旧停靠', async () => {
  const aside = f => nodes(f.render()).find(node => node.type === 'aside');
  const bubble = f => nodes(f.render()).find(node => node.type === 'button' && node.props.className === 'ww-assistant-bubble');
  const first = await fixture({ assistantForm: null });
  first.render(); first.flushEffects();
  assert.equal(aside(first).props.hidden, true, '进来只有气泡');
  assert.equal(first.browser.localStorage.getItem('whalewing.assistantForm.v1'), undefined, '不替员工记成停靠');
  bubble(first).props.onClick(); first.render(); first.flushEffects();
  assert.match(aside(first).props.className, /ww-assistant-float/, '没选过的点开是悬浮');
  const docked = await fixture({ assistantForm: 'dock' });
  docked.render(); docked.flushEffects();
  assert.equal(aside(docked).props.hidden, true, '上次停靠的进来也先只有气泡');
  bubble(docked).props.onClick(); docked.render(); docked.flushEffects();
  assert.match(aside(docked).props.className, /ww-assistant-dock/, '点开照上次停靠');
});

test('还没有在用的专家时，中间说清专家的话会出现在这里，给几位常用的直接开工', async () => {
  const f = await fixture();
  const welcome = nodes(f.render()).find(node => node.type === 'section' && node.props.className === 'ww-team-panel ww-team-welcome');
  assert.ok(welcome);
  assert.match(text(welcome), /专家们说的话会出现在这里/);
  assert.ok(button(welcome, '打开小鲸'));
  assert.ok(button(welcome, '开始新任务'));
});

test('输入框选专家：小鲸在最上面，在用的单列一组，其余收进“更多专家”', async () => {
  const { f } = await team();
  f.existing.set('bound-session', false);
  const props = { sessionId: 'bound-session', useProjection: () => ({ expertId: null }), useSessions: select => select({ byId: {} }) };
  const tree = f.render('conversation.session.header.actions', props);
  const options = nodes(tree).find(node => node.props?.className === 'ww-picker-options');
  const labels = nodes(options).filter(node => node.type === 'strong' || node.type === 'p' || (node.type === 'button' && node.props.className === 'ww-picker-more')).map(text);
  assert.deepEqual(labels, ['小鲸助手', '在用的专家', '研发专家', '周报整理员', '更多专家 · 专家库 1 位']);
});
