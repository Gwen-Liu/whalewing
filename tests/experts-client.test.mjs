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
const cards = f => nodes(f.render()).filter(node => node.type === 'article' && node.props.className === 'yj-card');

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
  const options = nodes(dialog()).filter(node => node.type === 'label' && node.props.className === 'yj-check');
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
  const notice = nodes(render()).find(node => node.type === 'p' && node.props.className === 'yj-notice');
  assert.match(text(notice), /^原版有更新：提示词。/);
});
