import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, roles } from './client-fixture.mjs';

const nodes = tree => tree === null || tree === undefined || tree === false ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree !== 'object' ? [] : [tree, ...nodes(tree.props?.children)];
const text = tree => nodes(tree).flatMap(node => [node.props?.children].flat().filter(child => typeof child === 'string')).join('');
const button = (tree, label) => {
  const found = nodes(tree).find(node => node.type === 'button' && [node.props.children].flat().includes(label));
  assert.ok(found, `按钮 ${label} 存在`);
  return found;
};
const cards = f => nodes(f.render()).filter(node => node.type === 'article' && node.props.className === 'ww-card');

test('恢复原版可以只选几项：确认框列出改过的内容并标出原版有更新的，只提交选中的字段', async () => {
  let data = [{ ...roles[0], customized: ['prompt', 'skills'], baseUpdated: ['prompt'] }, roles[1]];
  const changes = [];
  const f = await fixture({ experts: async input => {
    if (input.action === 'list') return { ok: true, value: { experts: data, deleted: [] } };
    changes.push(input);
    const expert = { ...roles[0], revision: input.expectedRevision + 1 };
    data = [{ ...expert, customized: ['skills'], baseUpdated: [] }, roles[1]];
    return { ok: true, value: { expert } };
  } });
  button(cards(f)[0], '恢复原版').props.onClick();
  const dialog = () => nodes(f.render()).find(node => node.type === 'dialog' && JSON.stringify(node).includes('选择要换回原版的内容：'));
  const options = nodes(dialog()).filter(node => node.type === 'label' && node.props.className === 'ww-check');
  assert.deepEqual(options.map(text), ['提示词（原版有更新）', '技能']);
  nodes(options[1]).find(node => node.type === 'input').props.onChange({ target: { checked: false } });
  await button(dialog(), '恢复原版').props.onClick();
  assert.deepEqual(changes, [{ action: 'restore', id: 'manager', expectedRevision: 0, fields: ['prompt'] }]);
  assert.equal(dialog(), undefined);
  assert.deepEqual(f.clients.experts.experts().experts[0].customized, ['skills']);
});

test('一项都不选不提交；没有改动的内置专家不出现恢复原版', async () => {
  const changes = [];
  const f = await fixture({ experts: async input => {
    if (input.action === 'list') return { ok: true, value: { experts: [{ ...roles[0], customized: ['avatar'], baseUpdated: [] }, { ...roles[1], customized: [], baseUpdated: [] }], deleted: [] } };
    changes.push(input);
    throw new Error('不应提交');
  } });
  assert.equal(nodes(cards(f)[1]).some(node => node.type === 'button' && [node.props.children].flat().includes('恢复原版')), false);
  button(cards(f)[0], '恢复原版').props.onClick();
  const dialog = nodes(f.render()).find(node => node.type === 'dialog' && JSON.stringify(node).includes('选择要换回原版的内容：'));
  nodes(dialog).find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: false } });
  await button(nodes(f.render()).find(node => node.type === 'dialog' && JSON.stringify(node).includes('选择要换回原版的内容：')), '恢复原版').props.onClick();
  assert.deepEqual(changes, []);
});

test('由内置专家转来的自定义专家同时有恢复原版和删除；编辑抽屉顶部提示原版有更新', async () => {
  const converted = { ...roles[1], id: 'presales', name: '售前专家', builtin: false, customized: ['prompt'], baseUpdated: ['prompt'] };
  const f = await fixture({ experts: async input => {
    if (input.action === 'list') return { ok: true, value: { experts: [roles[0], converted], deleted: [] } };
    if (input.action === 'catalog') return { ok: true, value: { models: [], defaultModel: null, skills: [], mcpServers: [], issues: [] } };
    throw new Error(`意外动作 ${input.action}`);
  } });
  const card = cards(f)[1];
  assert.ok(button(card, '恢复原版'));
  assert.ok(button(card, '删除专家'));
  button(card, '编辑专家').props.onClick();
  const editor = nodes(f.render()).find(node => typeof node.type === 'function' && node.type.name === 'ExpertEditor');
  const render = f.isolate(editor); render(); f.flushEffects(); await new Promise(setImmediate);
  const notice = nodes(render()).find(node => node.type === 'p' && node.props.className === 'ww-notice');
  assert.match(text(notice), /^原版有更新：提示词。/);
});

// 2026-11-05 助手名称：扩展给小鲸起名后，界面上写着小鲸的地方跟着换；编辑小鲸时名字只读，扩展撤销后恢复。
const renamed = async (f, revision, assistant) => {
  const { parts } = await import('../features/index.js');
  await f.featureUpdate({ revision, features: parts.map((part, index) => ({ instance: index + 1, id: part.id, kind: part.kind, api: 1, package: 'dsh-whalewing', skills: [] })), ...(assistant ? { assistant } : {}) });
};
const team = { name: '小司助手', feature: 'team', package: 'dsh-fixture-team', label: { zh: '团队', en: 'Team' } };

test('扩展给小鲸起名：助手入口、标题和欢迎页用新名字，扩展撤销后恢复“小鲸助手”', async () => {
  const f = await fixture();
  f.render(); f.flushEffects();
  assert.ok(button(f.render(), '打开小鲸助手'));
  await renamed(f, 1, team);
  button(f.render(), '打开小司助手').props.onClick();
  f.render(); f.flushEffects();
  const tree = f.render();
  assert.equal(nodes(tree).find(node => node.type === 'aside').props['aria-label'], '小司助手');
  assert.ok(button(tree, '开始与小司助手协作'));
  // 专家卡片和头像拿到的专家数据由宿主换好名字（这里的假数据没换），只核对助手面板显示的文字和提示。
  const aside = nodes(tree).find(node => node.type === 'aside');
  const shown = [text(aside), ...nodes(aside).flatMap(node => [node.props?.title, node.props?.['aria-label']]).filter(value => typeof value === 'string')].join('|');
  assert.match(shown, /小司助手/);
  assert.equal(shown.includes('小鲸'), false, '助手面板上不再显示小鲸');
  await renamed(f, 2);
  assert.ok(button(f.render(), '开始与小鲸协作'));
});

test('扩展给小鲸起名：编辑小鲸时名字只读并写明由谁设定，其他专家照常可改', async () => {
  let lists = 0;
  const f = await fixture({ experts: async input => {
    if (input.action === 'list') { lists++; return { ok: true, value: { experts: [{ ...roles[0], name: '小司助手' }, roles[1]], deleted: [] } }; }
    if (input.action === 'catalog') return { ok: true, value: { models: [], defaultModel: null, skills: [], mcpServers: [], issues: [] } };
    throw new Error(`意外动作 ${input.action}`);
  } });
  const before = lists;
  await renamed(f, 1, team);
  assert.ok(lists > before, '名字变了重新读专家列表');
  const nameInput = index => {
    button(cards(f)[index], '编辑专家').props.onClick();
    const editor = nodes(f.render()).find(node => typeof node.type === 'function' && node.type.name === 'ExpertEditor');
    const render = f.isolate(editor); render(); f.flushEffects();
    const label = nodes(render()).find(node => node.type === 'label' && text(node).startsWith('专家名字'));
    return { input: nodes(label).find(node => node.type === 'input'), help: text(nodes(label).find(node => node.type === 'small')) };
  };
  const other = nameInput(1);
  assert.deepEqual([other.input.props.value, other.input.props.disabled, other.help], ['研发专家', false, '']);
  const manager = nameInput(0);
  assert.deepEqual([manager.input.props.value, manager.input.props.disabled], ['小司助手', true]);
  assert.equal(manager.help, '名字由「团队」统一设定，这里改不了；关掉它后恢复原来的名字');
});
