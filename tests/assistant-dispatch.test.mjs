import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchProjection, foldDispatch, latestReply, DispatchBook, replyLimit } from '../features/assistant/dispatch.js';
import { registerHandoffView } from '../features/assistant/handoff-view.js';

const mark = (commandId = 'c1', title = '整理需求文档') => [
  { type: 'command/run', data: { name: 'whalewing-dispatch', commandId, args: JSON.stringify({ title, from: 'assistant-1' }) } },
  { type: 'command/done', data: { commandId, kind: 'success', text: '{}' } },
];
const reply = text => ({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text }] } } });
const end = kind => ({ type: 'turn/end', data: { reason: { kind } } });

test('派工进度从任务会话自己的记录算：开工、等审批、做完，留下最后一条回复的开头', () => {
  assert.equal(foldDispatch([{ type: 'turn/start' }, reply('普通会话'), end('completed')]), null, '没登记过的会话不算派工');
  const events = [...mark(), { type: 'turn/start' }];
  assert.deepEqual(foldDispatch(events), { title: '整理需求文档', from: 'assistant-1', status: 'running', reply: '', turns: 1 });
  events.push({ type: 'approval/asked' });
  assert.equal(foldDispatch(events).status, 'waiting');
  events.push({ type: 'approval/decided' }, reply('第一段'), reply('需求文档写好了，在 docs/需求.md'), end('completed'));
  assert.deepEqual(foldDispatch(events), { title: '整理需求文档', from: 'assistant-1', status: 'completed', reply: '需求文档写好了，在 docs/需求.md', turns: 1 });
  for (const [kind, status] of [['error', 'error'], ['aborted', 'interrupted'], ['interrupted', 'interrupted'], ['max-tokens', 'incomplete'], ['something-new', 'unknown']]) {
    assert.equal(foldDispatch([...mark(), { type: 'turn/start' }, end(kind)]).status, status, kind);
  }
  const long = '长'.repeat(replyLimit + 50);
  assert.equal([...foldDispatch([...mark(), { type: 'turn/start' }, reply(long)]).reply].length, replyLimit + 1);
  // 坏的登记、失败的登记不算；第二次登记不覆盖第一次。
  assert.equal(foldDispatch([{ type: 'command/run', data: { name: 'whalewing-dispatch', commandId: 'x', args: '{' } }, { type: 'command/done', data: { commandId: 'x', kind: 'success' } }]), null);
  assert.equal(foldDispatch([mark()[0], { type: 'command/done', data: { commandId: 'c1', kind: 'error' } }]), null);
  assert.equal(foldDispatch([...mark('a', '第一件'), ...mark('b', '第二件')]).title, '第一件');
  assert.equal(dispatchProjection.wire.view(dispatchProjection.init()), null);
});

test('完整回复只取最近一轮；记录本每轮列还在做的，做完的只列一次，七天前的不列', async () => {
  const events = [...mark(), { type: 'turn/start' }, reply('旧的一轮'), end('completed'), { type: 'turn/start' }, reply('新的一轮'), reply('补充'), end('completed')];
  assert.equal(latestReply(events), '新的一轮\n\n补充');
  const rows = new Map();
  const table = { get: id => rows.get(id), keys: () => rows.keys(), put: async (id, value) => { rows.set(id, value); } };
  const logs = { a: [...mark('1', '甲'), { type: 'turn/start' }], b: [...mark('2', '乙'), { type: 'turn/start' }, reply('乙做完了'), end('completed')], old: [...mark('3', '丙'), { type: 'turn/start' }] };
  let now = 1_000_000_000_000;
  const book = new DispatchBook(table, async id => ({ events: logs[id] }), () => now);
  await book.record({ sessionId: 'old', expertId: 'data', expertName: '数据专家', title: '丙', from: 'x' });
  now += 8 * 24 * 3600 * 1000;
  await book.record({ sessionId: 'a', expertId: 'development', expertName: '研发专家', title: '甲', from: 'x' });
  await book.record({ sessionId: 'b', expertId: 'writing', expertName: '写作专家', title: '乙', from: 'x' });
  const first = await book.digest();
  assert.match(first, /- 研发专家 · 甲（标识 a）：正在做。/);
  assert.match(first, /- 写作专家 · 乙（标识 b）：做完了。交付开头：乙做完了/);
  assert.doesNotMatch(first, /丙/);
  const second = await book.digest();
  assert.match(second, /研发专家 · 甲/);
  assert.doesNotMatch(second, /写作专家/);
  logs.a.push({ type: 'approval/asked' });
  assert.match(await book.digest(), /甲（标识 a）：在等员工审批/);
  assert.deepEqual((await book.result('b')).reply, '乙做完了');
  assert.equal(await book.result('不存在'), null);
});

test('派出去的卡片只占一行，按任务的实时进度显示，按钮到专家团队页中间那栏打开任务', () => {
  const registered = [];
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useSyncExternalStore: (_subscribe, read) => read() };
  const ctx = { locale: { resolveText: value => value.zh }, slots: { inject: (_name, fn) => fn(), register: (options, Component) => { registered.push({ options, Component }); return () => {}; } }, get: () => undefined };
  let live = null;
  const calls = [];
  const api = { checkSession: id => calls.push(['check', id]), open: id => calls.push(['open', id]), showTask: id => calls.push(['showTask', id]), notify: text => calls.push(['notify', text]), subscribeSessions: () => () => {}, dispatchStatus: () => live, showExperts() {}, experts: () => ({ experts: [{ id: 'requirements', name: '产品专家' }] }) };
  registerHandoffView(ctx, { React: react, Avatar: 'Avatar' }, api);
  const Row = registered[0].Component;
  assert.deepEqual(registered.map(item => item.options.key), ['whalewing_handoff', 'whalewing_expert_edit', 'whalewing_expert_schedule']);
  const meta = { sessionId: 'task-1', expertId: 'requirements', expertName: '产品专家', title: '整理需求文档', draft: '【小鲸交接】整理需求文档', started: true };
  const render = () => {
    const outer = Row({ phase: 'result', block: { kind: 'result', call: { argsRaw: '{}' }, isError: false, content: [], meta } });
    return outer.type({ ...outer.props });
  };
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  const textOf = tree => nodes(tree).flatMap(node => (node.props.children ?? []).filter(child => typeof child === 'string')).join('');
  assert.match(textOf(render()), /已派给产品专家：整理需求文档/);
  live = { title: '整理需求文档', from: 'a', status: 'running', reply: '', turns: 1 };
  assert.match(textOf(render()), /产品专家正在做：整理需求文档/);
  live = { ...live, status: 'waiting' };
  const waiting = render();
  assert.match(textOf(waiting), /产品专家在等你审批/);
  const approve = nodes(waiting).find(node => node.type === 'button');
  assert.equal(approve.props.children[0], '去审批');
  approve.props.onClick();
  assert.deepEqual(calls, [['check', 'task-1'], ['showTask', 'task-1']]);
  assert.ok(nodes(waiting).some(node => node.type === 'Avatar' && node.props.expert.id === 'requirements'), '带专家头像');
  live = { ...live, status: 'completed', reply: '需求文档写好了\n在 docs/需求.md' };
  const done = render();
  assert.match(textOf(done), /产品专家做完了：整理需求文档/);
  assert.equal(nodes(done).some(node => node.type === 'details'), false, '交付和交接说明不在小鲸对话里展开，到专家团队页中间那栏看');
});

test('员工在审批里点了拒绝：三张卡片都说“你没有批准”，不把给模型看的英文原话给员工', () => {
  const registered = [];
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useSyncExternalStore: (_subscribe, read) => read() };
  const ctx = { locale: { resolveText: value => value.zh }, slots: { inject: (_name, fn) => fn(), register: (options, Component) => { registered.push({ options, Component }); return () => {}; } }, get: () => undefined };
  registerHandoffView(ctx, { React: react, Avatar: 'Avatar' }, { subscribeSessions: () => () => {}, dispatchStatus: () => null, experts: () => ({ experts: [] }) });
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  const textOf = tree => nodes(tree).flatMap(node => (node.props.children ?? []).filter(child => typeof child === 'string')).join('');
  // DSH 沙箱被拒时抛的原话（2026-11-14 真模型手测时的工具结果）。
  const rejected = subject => ({ kind: 'result', call: { argsRaw: JSON.stringify({ title: '修复导出乱码', name: '周报整理员' }) }, isError: true, content: [{ type: 'text', text: `Error: the user rejected escalating this ${subject} to "danger-full-access"; it stays denied, so stop and explain instead of working around it` }] });
  const [handoff, edit, schedule] = registered.map(item => item.Component);
  const cases = [[handoff, '鲸翼派工', '你没有批准，没有交给专家'], [edit, '鲸翼专家', '你没有批准，专家没有保存'], [schedule, '鲸翼定时任务', '你没有批准，定时任务没有加上']];
  for (const [Row, subject, expected] of cases) {
    const shown = Row({ phase: 'result', block: rejected(subject) });
    assert.equal(textOf(shown), expected);
    assert.equal(shown.props['data-state'], 'declined');
  }
  // 别的失败照旧写原因。
  const other = edit({ phase: 'result', block: { kind: 'result', call: { argsRaw: '{}' }, isError: true, content: [{ type: 'text', text: 'Error: 名字和已有专家重复' }] } });
  assert.equal(textOf(other), '专家没有保存：名字和已有专家重复');
});
