import test from 'node:test';
import assert from 'node:assert/strict';
import { aiWebEntries } from '../features/ai-web/catalog.js';
import { createAiWebView } from '../features/ai-web/view.js';
import { findAiWebEntries, openAiWebsite } from '../features/ai-web/client-api.js';
import { fixture as shellFixture } from './client-fixture.mjs';

test('官方目录名称唯一，仅包含不带凭据的 HTTPS 入口', () => {
  assert.equal(new Set(aiWebEntries.map(entry => entry.id)).size, aiWebEntries.length);
  assert.equal(aiWebEntries.length, 10);
  for (const entry of aiWebEntries) {
    const url = new URL(entry.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.username + url.password + url.search + url.hash, '');
    assert.ok(Object.isFrozen(entry));
  }
  assert.ok(Object.isFrozen(aiWebEntries));
  for (const id of ['chatgpt', 'deepseek', 'doubao', 'qingyan', 'kimi']) assert.ok(aiWebEntries.some(entry => entry.id === id));
});

test('搜索按全部关键词匹配名称、厂商或用途，空结果不补造入口', () => {
  assert.deepEqual(findAiWebEntries(' OPENAI gPt ').map(entry => entry.id), ['chatgpt']);
  assert.deepEqual(findAiWebEntries('清华').map(entry => entry.id), ['qingyan']);
  assert.deepEqual(findAiWebEntries('不存在的站点'), []);
  assert.equal(findAiWebEntries('').length, 10);
});

test('唯一打开动作使用目录地址，拒收任意 URL，原样传播宿主错误', async () => {
  const calls = [];
  assert.equal((await openAiWebsite('chatgpt', url => calls.push(url))).id, 'chatgpt');
  assert.deepEqual(calls, ['https://chatgpt.com/']);
  await assert.rejects(() => openAiWebsite('https://example.com/', url => calls.push(url)), /不存在/u);
  await assert.rejects(() => openAiWebsite('chatgpt'), /尚未就绪/u);
  const error = new Error('browser tab 未注册');
  await assert.rejects(() => openAiWebsite('kimi', () => { throw error; }), value => value === error);
  assert.equal(calls.length, 1);
});

// 该夹具只检查组件交互契约；真实宿主打开及登录由隔离浏览器验收证明。
function fixture(openBrowser, options = {}) {
  const viewHooks = { states: [], refs: [], effects: [] }, editorHooks = { states: [], refs: [], effects: [] };
  let { states, refs, effects } = viewHooks;
  let cursor = 0, ri = 0, ei = 0;
  const selectHooks = hooks => { ({ states, refs, effects } = hooks); cursor = ri = ei = 0; };
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children: children.flat().filter(child => child !== false && child != null) } }; },
    useRef(initial) { return refs[ri++] ||= { current: initial }; },
    useEffect(fn, deps) { const i = ei++, old = effects[i]; if (!old || !deps || deps.some((d, j) => d !== old.deps[j])) { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; } },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useState(initial) { const target = states, index = cursor++; if (!(index in target)) target[index] = typeof initial === 'function' ? initial() : initial; return [target[index], value => { target[index] = typeof value === 'function' ? value(target[index]) : value; }]; },
  };
  const View = createAiWebView(React);
  // 报错与“重试”改在右上角提示里：把当前提示接在渲染结果末尾，断言员工实际能看到的内容。
  let toast = null;
  const notify = (message, extra = {}) => { toast = message ? { message, ...extra } : null; };
  const withToast = tree => !toast ? tree : { ...tree, props: { ...tree.props, children: [...tree.props.children, { type: 'div', props: { role: toast.kind === 'error' ? 'alert' : 'status', children: [toast.message, ...(toast.action ? [{ type: 'button', props: { onClick: () => { const action = toast.action; toast = null; return action.run(); }, children: [toast.action.label] } }] : [])] } }] } };
  return { render(active = true, sessionId = 'ai-session') { selectHooks(viewHooks); return withToast(View({ active, sessionId, openBrowser, notify, ...options })); }, editor(element) { selectHooks(editorHooks); return withToast(element.type(element.props)); }, toast: () => toast, toolbar(sessionId = 'ai-session', active = true) { return View.Toolbar({ sessionId, active }); }, unmount() { for (const hooks of [viewHooks, editorHooks]) for (const effect of hooks.effects) effect.cleanup?.(); } };
}

// 2026-10-25 改版：打开过的 AI 仍在入口列表里，标为“正在用”；页面里不再有切换下拉，切换在浏览器工具栏里。
const currentTile = tree => nodes(tree).find(node => node.type === 'article' && node.props.className.includes('ww-ai-current'));
const tileName = tile => nodes(tile).find(node => node.type === 'strong').props.children[0];

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...(tree.props?.children || []).flatMap(nodes)];
}

test('仅点击才打开，隐藏页陈旧按钮无效，成功文案不冒称登录通过', async () => {
  const calls = [];
  const f = fixture(url => calls.push(url));
  const first = f.render();
  assert.equal(calls.length, 0);
  await nodes(first).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  assert.deepEqual(calls, ['https://www.kimi.com/']);
  // 打开后直接切到浏览器里的网页，不再额外弹“已请求打开”的提示。
  f.render(); assert.equal(nodes(f.toolbar()).find(node => node.type === 'select').props.value, 'kimi');
  const hidden = f.render(false);
  assert.equal(hidden.props.hidden, true);
  nodes(hidden).find(node => node.type === 'button').props.onClick();
  assert.equal(calls.length, 1);
});

test('宿主失败保留完整目录和网址，原位重试成功，搜索空态仍可恢复', async () => {
  let fail = true;
  const f = fixture(() => { if (fail) throw new Error('浏览器未注册'); });
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 DeepSeek').props.onClick();
  const failed = f.render();
  assert.equal(nodes(failed).filter(node => node.type === 'article').length, 10);
  assert.ok(nodes(failed).some(node => node.props.role === 'alert'));
  assert.ok(nodes(failed).some(node => node.props.role === 'alert' && node.props.children[0].includes('DeepSeek')));
  nodes(f.render()).find(node => node.type === 'input').props.onChange({ target: { value: '无此服务' } });
  assert.equal(nodes(f.render()).filter(node => node.type === 'article').length, 0);
  nodes(f.render()).find(node => node.type === 'input').props.onChange({ target: { value: '' } });
  assert.equal(nodes(f.render()).filter(node => node.type === 'article').length, 10);
  fail = false;
  await nodes(failed).find(node => node.type === 'button' && node.props.children[0] === '重试打开').props.onClick();
  assert.equal(nodes(f.render()).some(node => node.props.role === 'alert'), false);
  assert.equal(nodes(f.render()).filter(node => node.type === 'article').length, 10);
  assert.equal(tileName(currentTile(f.render())), 'DeepSeek');
  assert.equal(nodes(f.render()).filter(node => node.type === 'select').length, 0);
});

test('打开后入口照常列出并标出正在用的，工具栏按租约会话投射，返回和继续不重新导航', async () => {
  const calls = []; let restores = 0, focuses = 0;
  const f = fixture(url => calls.push(url), { restoreBrowser: () => restores++, focusBrowser: () => focuses++ });
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  const opened = f.render();
  assert.equal(nodes(opened).filter(node => node.type === 'article').length, 10);
  assert.equal(tileName(currentTile(opened)), 'Kimi');
  assert.equal(nodes(f.toolbar()).find(node => node.type === 'select').props.value, 'kimi');
  assert.equal(f.toolbar('other-session'), null);
  assert.equal(f.toolbar('ai-session', false), null);
  nodes(f.toolbar()).find(node => node.props.children.includes('返回工作台')).props.onClick();
  await nodes(opened).find(node => node.props.children.includes('继续使用')).props.onClick();
  assert.equal(restores, 1); assert.equal(focuses, 1); assert.equal(calls.length, 1);
  f.render(false); assert.equal(f.toolbar(), null);
  f.render(); f.unmount(); assert.equal(f.toolbar(), null);
});

test('厂商切换仍走同一受控打开入口，失败保留原选择和完整重试网址', async () => {
  let fail = false; const calls = [];
  const f = fixture(url => { calls.push(url); if (fail) throw new Error('标签打开失败'); });
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  f.render(); fail = true;
  await nodes(f.toolbar()).find(node => node.type === 'select').props.onChange({ target: { value: 'deepseek' } });
  const failed = f.render();
  assert.equal(nodes(f.toolbar()).find(node => node.type === 'select').props.value, 'kimi');
  assert.ok(nodes(failed).some(node => node.props.role === 'alert' && node.props.children[0].includes('DeepSeek')));
  fail = false;
  await nodes(failed).find(node => node.props.children.includes('重试打开')).props.onClick();
  f.render(); assert.equal(nodes(f.toolbar()).find(node => node.type === 'select').props.value, 'deepseek');
  assert.equal(calls.length, 3);
});


test('异步准备完成才显示成功，重复点击不并发，拒绝后保留重试', async () => {
  const wait = Promise.withResolvers(); let calls = 0;
  const f = fixture(async () => { calls++; await wait.promise; });
  const click = () => nodes(f.render()).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  const pending = click(); await click(); assert.equal(calls, 1);
  assert.equal(JSON.stringify(f.render()).includes('已请求在 DSH 浏览器中打开 Kimi'), false);
  wait.reject(new Error('挂载失败')); await pending;
  assert.ok(JSON.stringify(f.render()).includes('挂载失败')); assert.ok(JSON.stringify(f.render()).includes('重试打开'));
});

for (const exit of ['cancel', 'hide', 'unmount']) test('AI网页准备期间' + exit + '取消向宿主传播且迟到结果不显示成功', async () => {
  const wait = Promise.withResolvers(); let signal;
  const f = fixture(async (_url, received) => { signal = received; await wait.promise; });
  const pending = nodes(f.render()).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  if (exit === 'cancel') nodes(f.render()).find(node => node.type === 'button' && node.props.children.includes('取消打开')).props.onClick();
  else if (exit === 'hide') f.render(false); else f.unmount();
  assert.equal(signal.aborted, true); wait.resolve(); await pending;
  assert.equal(JSON.stringify(f.render(false)).includes('已请求在 DSH 浏览器中打开 Kimi'), false);
});

for (const exit of ['cancel', 'back', 'hide', 'unmount']) test(`点击继续使用后${exit}取消同一准备，迟到结果不聚焦也不新增标签`, async t => {
  const ready = Promise.withResolvers(); let signal, focuses = 0, preparations = 0, opens = 0, restores = 0;
  const f = fixture(() => opens++, {
    focusBrowser: async received => { preparations++; signal = received; await ready.promise; received.throwIfAborted(); focuses++; },
    restoreBrowser: () => restores++,
  });
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  const resume = nodes(f.render()).find(node => node.props.children.includes('继续使用'));
  const pending = resume.props.onClick();
  t.after(async () => { f.unmount(); ready.resolve(); await pending; });
  const busy = f.render();
  assert.equal(nodes(busy).find(node => node.props.children.includes('继续使用')).props.disabled, true);
  await resume.props.onClick(); assert.equal(preparations, 1);
  if (exit === 'cancel') nodes(busy).find(node => node.type === 'button' && node.props.children.includes('取消打开')).props.onClick();
  else if (exit === 'back') nodes(f.toolbar()).find(node => node.props.children.includes('返回工作台')).props.onClick();
  else if (exit === 'hide') f.render(false); else f.unmount();
  assert.equal(signal.aborted, true);
  ready.resolve(); await pending;
  assert.equal(focuses, 0); assert.equal(opens, 1); assert.equal(restores, exit === 'back' ? 1 : 0);
  assert.equal(nodes(f.render(false)).some(node => node.props.role === 'alert'), false);
});

test('继续使用失败保留选择，重试仍只恢复呈现且最终释放忙碌状态', async () => {
  let fail = true, focuses = 0, opens = 0; const signals = [];
  const f = fixture(() => opens++, { focusBrowser: async signal => {
    signals.push(signal); signal.throwIfAborted();
    if (fail) throw new Error('原浏览器尚未挂载');
    focuses++;
  } });
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 Kimi').props.onClick();
  await nodes(f.render()).find(node => node.props.children.includes('继续使用')).props.onClick();
  const failed = f.render();
  assert.ok(JSON.stringify(failed).includes('原浏览器尚未挂载'));
  assert.equal(tileName(currentTile(failed)), 'Kimi');
  fail = false;
  await nodes(failed).find(node => node.props.children.includes('重试打开')).props.onClick();
  const restored = f.render();
  assert.equal(focuses, 1); assert.equal(opens, 1);
  assert.equal(signals.length, 2); assert.notEqual(signals[0], signals[1]);
  assert.equal(nodes(restored).find(node => node.props.children.includes('继续使用')).props.disabled, false);
  assert.equal(nodes(restored).some(node => node.props.role === 'alert'), false);
});

test('默认十项显示离线官方图标且无删除按钮，自定义首字和选填描述按持久结果展示', async () => {
  const custom = { id: 'custom-fixture', name: '办公助手', url: 'https://example.com/', description: '', avatar: null, provider: '', keywords: '', builtin: false, revision: 1 };
  const f = fixture(() => {}, { manageAiWeb: async () => ({ entries: [...aiWebEntries, custom] }) });
  const initial = f.render();
  assert.equal(nodes(initial).filter(node => node.type === 'img' && node.props.src.startsWith('data:image/png;base64,')).length, 10);
  assert.equal(nodes(initial).filter(node => node.props['aria-label']?.startsWith('删除 ')).length, 0);
  await Promise.resolve();
  const loaded = f.render();
  const card = nodes(loaded).find(node => node.type === 'article' && nodes(node).some(child => child.type === 'strong' && child.props.children.includes('办公助手')));
  assert.ok(nodes(card).some(node => node.type === 'span' && node.props.children.includes('办')));
  // 磁贴只写名字和厂商（自定义入口写“自定义”），不再列网址和用途。
  assert.ok(nodes(card).some(node => node.type === 'small' && node.props.children.includes('自定义')));
  assert.equal(nodes(card).filter(node => node.type === 'p').length, 0);
  assert.equal(nodes(loaded).filter(node => node.props['aria-label']?.startsWith('编辑 ')).length, 1);
  assert.equal(nodes(loaded).filter(node => node.props['aria-label']?.startsWith('删除 ')).length, 1);
  nodes(card).find(node => node.props['aria-label'] === '编辑 办公助手').props.onClick();
  const modal = nodes(f.render()).find(node => typeof node.type === 'function');
  assert.equal(modal.props.entry, custom); assert.equal(modal.props.removing, undefined);
});

test('持久目录读取失败保留默认目录，刷新恢复自定义入口；隐藏后取消目录读', async () => {
  let fail = true, signal;
  const f = fixture(() => {}, { manageAiWeb: async (_input, value) => { signal = value; if (fail) throw new Error('目录读取失败'); return { entries: aiWebEntries }; } });
  f.render(); await Promise.resolve();
  assert.equal(nodes(f.render()).filter(node => node.type === 'article').length, 10);
  assert.ok(nodes(f.render()).some(node => node.props.role === 'alert' && node.props.children.includes('目录读取失败')));
  fail = false; await nodes(f.render()).find(node => node.props.children.includes('刷新入口')).props.onClick();
  assert.equal(nodes(f.render()).filter(node => node.props.role === 'alert').length, 0);
  f.render(false); assert.equal(signal.aborted, true); f.unmount();
});

// 通过实际 Editor 保存回调与可控 Promise 建立竞争，不依赖时间延迟或仅检查源码。
const customEntry = { id: 'custom-fixture', name: '旧名字', url: 'https://example.com/', description: '', avatar: null, provider: '', keywords: '', builtin: false, revision: 1 };
const button = (tree, text) => nodes(tree).find(node => node.type === 'button' && node.props.children.includes(text));
const dialogElement = tree => nodes(tree).find(node => typeof node.type === 'function');

test('他客户端删除所选入口后清理目录选择，陈旧继续按钮不操作宿主标签也不崩溃', async t => {
  let entries = [...aiWebEntries, customEntry], opens = 0, focuses = 0, restores = 0;
  const f = fixture(() => opens++, { manageAiWeb: async () => ({ entries }), focusBrowser: () => { focuses++; throw new Error('原浏览器尚未挂载'); }, restoreBrowser: () => restores++ });
  t.after(() => f.unmount());
  f.render(); await Promise.resolve();
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 旧名字').props.onClick();
  const stale = button(f.render(), '继续使用');
  entries = aiWebEntries; f.render(false); f.render(); await Promise.resolve();
  assert.equal(button(f.render(), '继续使用'), undefined);
  assert.equal(nodes(f.render()).filter(node => node.type === 'article').length, 10);
  await stale.props.onClick();
  assert.ok(JSON.stringify(f.render()).includes('此 AI 入口已不存在'));
  assert.equal(opens, 1); assert.equal(focuses, 0); assert.equal(restores, 0);
  assert.equal(nodes(f.toolbar()).find(node => node.type === 'select').props.value, '');
});

for (const late of ['resolve', 'reject']) test(`Editor 已保存读回使早发 list 失效，迟到 ${late} 不回滚新名称或产生旧错误`, async t => {
  const pending = Promise.withResolvers(); let lists = 0, listSignal, saved;
  const newer = { ...customEntry, name: '新名字', revision: 2 };
  const f = fixture(() => {}, { manageAiWeb: async (input, signal) => {
    if (input.action === 'list') { if (++lists === 1) return { entries: [...aiWebEntries, customEntry] }; listSignal = signal; return pending.promise; }
    saved = input; return { entries: [...aiWebEntries, newer] };
  } });
  t.after(() => { pending.resolve({ entries: aiWebEntries }); f.unmount(); });
  f.render(); await Promise.resolve(); f.render(false); f.render();
  nodes(f.render()).find(node => node.props['aria-label'] === '编辑 旧名字').props.onClick();
  const modal = dialogElement(f.render());
  nodes(f.editor(modal)).find(node => node.type === 'input' && node.props.value === '旧名字').props.onChange({ target: { value: '新名字' } });
  await nodes(f.editor(modal)).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved.entry.name, '新名字'); assert.equal(saved.expectedRevision, 1); assert.equal(listSignal.aborted, true);
  assert.ok(nodes(f.render()).some(node => node.props['aria-label'] === '编辑 新名字'));
  if (late === 'resolve') pending.resolve({ entries: [...aiWebEntries, customEntry] }); else pending.reject(new Error('已失效读取失败'));
  await pending.promise.catch(() => {}); await Promise.resolve();
  assert.ok(nodes(f.render()).some(node => node.props['aria-label'] === '编辑 新名字'));
  assert.equal(nodes(f.render()).some(node => node.props['aria-label'] === '编辑 旧名字'), false);
  assert.equal(JSON.stringify(f.render()).includes('已失效读取失败'), false);
  assert.equal(nodes(f.render()).filter(node => node.type === 'article').length, 11);
});

test('编辑冲突读回保留草稿，可显式加载已保存版本并按新修订重试', async t => {
  const actual = { ...customEntry, name: '他客户端名字', revision: 2 }; let lists = 0, attempts = 0;
  const f = fixture(() => {}, { manageAiWeb: async input => {
    if (input.action === 'list') return { entries: [...aiWebEntries, ++lists === 1 ? customEntry : actual] };
    if (++attempts === 1) throw new Error('版本冲突');
    assert.equal(input.expectedRevision, 2); assert.equal(input.entry.name, actual.name);
    return { entries: [...aiWebEntries, { ...actual, revision: 3 }] };
  } });
  t.after(() => f.unmount()); f.render(); await Promise.resolve();
  nodes(f.render()).find(node => node.props['aria-label'] === '编辑 旧名字').props.onClick();
  const modal = dialogElement(f.render());
  nodes(f.editor(modal)).find(node => node.type === 'input' && node.props.value === '旧名字').props.onChange({ target: { value: '未保存草稿' } });
  await nodes(f.editor(modal)).find(node => node.type === 'form').props.onSubmit();
  const failed = f.editor(modal);
  assert.ok(JSON.stringify(failed).includes('版本冲突'));
  assert.ok(nodes(failed).some(node => node.type === 'input' && node.props.value === '未保存草稿'));
  assert.equal(button(failed, '保存修改').props.disabled, true);
  button(failed, '加载已保存版本').props.onClick();
  assert.ok(nodes(f.editor(modal)).some(node => node.type === 'input' && node.props.value === actual.name));
  await nodes(f.editor(modal)).find(node => node.type === 'form').props.onSubmit();
  assert.equal(dialogElement(f.render()), undefined); assert.equal(attempts, 2);
});

test('正常切回接纳新目录，旧取消 list 不覆盖新读回，原选择与恢复网页保留', async t => {
  const delayed = Promise.withResolvers(); let calls = 0, focuses = 0, opens = 0;
  const updated = { ...customEntry, name: '更新名称', revision: 2 };
  const f = fixture(() => opens++, { focusBrowser: () => focuses++, manageAiWeb: async () => {
    calls++; return calls === 2 ? delayed.promise : { entries: [...aiWebEntries, calls === 1 ? customEntry : updated] };
  } });
  t.after(() => { delayed.resolve({ entries: [...aiWebEntries, customEntry] }); f.unmount(); });
  f.render(); await Promise.resolve();
  await nodes(f.render()).find(node => node.props['aria-label'] === '打开 旧名字').props.onClick();
  f.render(false); f.render(); f.render(false); f.render(); await Promise.resolve();
  delayed.resolve({ entries: [...aiWebEntries, customEntry] }); await delayed.promise; await Promise.resolve();
  const current = f.render();
  assert.equal(tileName(currentTile(current)), '更新名称');
  await button(current, '继续使用').props.onClick(); assert.equal(focuses, 1); assert.equal(opens, 1);
});

// 需求§AI 网页第 4 条（回到页签时正在用的标“正在用”，页头有“继续使用”）；原版 DSH 上打开后工作台会卸载，页面靠外面记下的入口恢复。
const pageHead = tree => nodes(nodes(tree).find(node => node.type === 'header' && node.props.className === 'ww-pagehead')).find(node => node.type === 'p').props.children[0];

test('原版回到页签时按记下的入口标“正在用”，页头写“正在用 名字”，继续使用把这个入口交出去切回它的标签', async () => {
  const opens = [], resumed = [];
  const f = fixture(url => opens.push(url), { remembered: 'kimi', focusBrowser: async (signal, entry) => { assert.ok(signal instanceof AbortSignal); resumed.push(entry); } });
  const back = f.render();
  assert.equal(nodes(back).filter(node => node.type === 'article').length, 10, '入口照常列着');
  assert.equal(tileName(currentTile(back)), 'Kimi');
  assert.ok(nodes(currentTile(back)).some(node => node.type === 'small' && node.props.children.includes('正在用')));
  assert.match(pageHead(back), /^正在用 Kimi · /);
  await button(back, '继续使用').props.onClick();
  assert.deepEqual(resumed.map(entry => [entry.id, entry.url]), [['kimi', 'https://www.kimi.com/']]);
  assert.deepEqual(opens, [], '继续使用不走打开入口那条路');
  f.unmount();
});

test('原版没有记下入口或记下的会话已不在时，不标“正在用”也没有继续使用', () => {
  const options = { remembered: '' };
  const f = fixture(() => {}, options);
  const none = f.render();
  assert.equal(currentTile(none), undefined);
  assert.equal(button(none, '继续使用'), undefined);
  assert.match(pageHead(none), /^10 个入口 · /);
  // 回来时会话列表还没读完先标上，读完发现会话不在了就去掉（这个夹具里 effect 改的状态下一次渲染才看得到）。
  options.remembered = 'kimi'; f.render(); assert.equal(tileName(currentTile(f.render())), 'Kimi');
  options.remembered = ''; f.render(); const gone = f.render();
  assert.equal(currentTile(gone), undefined);
  assert.equal(button(gone, '继续使用'), undefined);
  f.unmount();
});

for (const kept of [true, false]) test(`原版记下的是自建入口：${kept ? '入口还在，目录读回后标“正在用”' : '入口已删除，读回后不标“正在用”'}`, async () => {
  const f = fixture(() => {}, { remembered: customEntry.id, manageAiWeb: async () => ({ entries: kept ? [...aiWebEntries, customEntry] : aiWebEntries }) });
  // 目录读回前只有内置入口，自建入口还对不上，先不标。
  const loading = f.render();
  assert.equal(currentTile(loading), undefined); assert.equal(button(loading, '继续使用'), undefined);
  await Promise.resolve();
  const loaded = f.render();
  if (kept) { assert.equal(tileName(currentTile(loaded)), '旧名字'); assert.match(pageHead(loaded), /^正在用 旧名字 · /); assert.ok(button(loaded, '继续使用')); }
  else {
    assert.equal(currentTile(loaded), undefined); assert.equal(button(loaded, '继续使用'), undefined);
    assert.equal(JSON.stringify(loaded).includes('正在用'), false);
  }
  f.unmount();
});

// 下面用工作台的真实接线（tests/client-fixture.mjs）核对原版路径：记下入口、交给页面、继续使用回到原标签。
const allNodes = tree => tree === null || tree === undefined || tree === false || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(allNodes) : [tree, ...allNodes(tree.props?.children)];
const tabButton = (tree, label) => allNodes(tree).find(node => node.type === 'button' && node.props['data-tab'] && node.props.children.includes(label));
async function settle(f) { for (let i = 0; i < 4; i++) { f.render(); f.flushEffects(); await new Promise(setImmediate); } }
const aiWebProps = f => allNodes(f.render()).find(node => node.type?.name === 'AiWebView').props;
const aiWebKey = 'whalewing:aiweb:http://fixture.local', aiWebCurrentKey = 'whalewing:aiweb-current:http://fixture.local';
/** 原版 DSH 的右栏：没有把浏览器铺满工作台的接口，只有标签的打开、切换和列出。 */
function nativeSidebar() {
  const state = { mounted: undefined, tabs: [], opened: [], focused: [] };
  state.service = {
    mounted: { getSnapshot: () => state.mounted },
    openTab: (...args) => { state.opened.push(args); state.tabs.push(`tab-${state.opened.length}`); },
    tabsIn: () => state.tabs.map(id => ({ id, kind: 'browser' })), focus: id => state.focused.push(id), isExpanded: () => true,
  };
  return state;
}
async function nativeShell(overrides = {}) {
  const sidebar = nativeSidebar(), f = await shellFixture({ sidebarRight: sidebar.service, ...overrides });
  f.ctx.uiWorkspace.openSession = id => { sidebar.mounted = id; f.calls.push(['open', id]); };
  return { f, sidebar, api: f.clients['ai-web'] };
}

test('原版在「AI 网页」会话里打开成功后记下入口，回到页签时页面拿到它；继续使用切回原标签，标签关掉了才新开', async () => {
  const { f, sidebar, api } = await nativeShell();
  assert.equal(api.supportsInlinePresentation(), false);
  assert.equal(api.currentAiInConversation(), '');
  await api.openAiInConversation('https://www.kimi.com/', 'kimi');
  const session = f.storage.get(aiWebKey);
  assert.deepEqual(JSON.parse(f.storage.get(aiWebCurrentKey)), { sessionId: session, entryId: 'kimi' });
  assert.equal(api.currentAiInConversation(), 'kimi');
  // 只切到会话、不打开网页时不改记下的入口。
  await api.openAiInConversation(undefined); assert.equal(api.currentAiInConversation(), 'kimi');
  await tabButton(f.render(), 'AI 网页').props.onClick(); await settle(f);
  assert.equal(aiWebProps(f).remembered, 'kimi');
  const kimi = aiWebEntries.find(entry => entry.id === 'kimi');
  await aiWebProps(f).focusBrowser(new AbortController().signal, kimi);
  assert.equal(sidebar.opened.length, 1, '没有新开标签'); assert.deepEqual(sidebar.focused, ['tab-1'], '切回原来的标签');
  assert.equal(f.calls.filter(([kind]) => kind === 'create').length, 1, '还是原来的「AI 网页」会话');
  assert.equal(f.calls.filter(([kind]) => kind === 'open').every(([, id]) => id === session), true);
  // 员工把标签关掉了：按打开入口的逻辑新开一个。
  sidebar.tabs.length = 0;
  await aiWebProps(f).focusBrowser(new AbortController().signal, kimi);
  assert.deepEqual(sidebar.opened.at(-1), ['browser', { params: { url: 'https://www.kimi.com/' } }]);
  assert.equal(sidebar.opened.length, 2); assert.deepEqual(sidebar.focused, ['tab-1']);
  f.unmount();
});

test('原版记下的会话已换掉、不在会话列表里或已归档时不算“正在用”，本机存储坏了或读不了也不报错', async () => {
  const storage = new Map([[aiWebKey, 'ai-now'], [aiWebCurrentKey, JSON.stringify({ sessionId: 'ai-now', entryId: 'kimi' })]]);
  const { f, api } = await nativeShell({ storage });
  const sessions = f.ctx.sessions.list, workspaces = f.ctx.workspaces.list, listed = { ids: ['ai-now'], byId: { 'ai-now': { id: 'ai-now', blank: true } }, phase: 'ready' };
  assert.equal(api.currentAiInConversation(), 'kimi', '会话列表还没读完时先按记下的算');
  sessions.set(listed); assert.equal(api.currentAiInConversation(), 'kimi');
  sessions.set({ ids: [], byId: {}, phase: 'ready' }); assert.equal(api.currentAiInConversation(), '', '会话已不在列表里');
  sessions.set(listed);
  workspaces.set({ ...workspaces.getSnapshot(), archivedSessionIds: ['ai-now'] }); assert.equal(api.currentAiInConversation(), '', '会话已归档');
  workspaces.set({ ...workspaces.getSnapshot(), archivedSessionIds: [] }); assert.equal(api.currentAiInConversation(), 'kimi');
  storage.set(aiWebKey, 'ai-other'); assert.equal(api.currentAiInConversation(), '', '「AI 网页」会话已换成别的');
  storage.delete(aiWebKey); assert.equal(api.currentAiInConversation(), '');
  storage.set(aiWebKey, 'ai-now');
  for (const broken of ['不是 JSON', 'null', '{"sessionId":"ai-now"}', '{"sessionId":"ai-now","entryId":7}']) { storage.set(aiWebCurrentKey, broken); assert.equal(api.currentAiInConversation(), '', broken); }
  storage.set(aiWebCurrentKey, JSON.stringify({ sessionId: 'ai-now', entryId: 'kimi' }));
  f.browser.localStorage.getItem = () => { throw new Error('浏览器禁用了本机存储'); };
  assert.equal(api.currentAiInConversation(), '');
  await tabButton(f.render(), 'AI 网页').props.onClick(); await settle(f);
  assert.equal(aiWebProps(f).remembered, '');
  f.unmount();
});

test('原版打开没成功不改记下的入口；记不住时照常打开', async () => {
  const { f, sidebar, api } = await nativeShell();
  await api.openAiInConversation('https://www.kimi.com/', 'kimi');
  const openTab = sidebar.service.openTab;
  sidebar.service.openTab = () => { throw new Error('浏览器标签打不开'); };
  await assert.rejects(api.openAiInConversation('https://chat.deepseek.com/', 'deepseek'), /浏览器标签打不开/);
  assert.equal(api.currentAiInConversation(), 'kimi');
  sidebar.service.openTab = openTab;
  const setItem = f.browser.localStorage.setItem;
  f.browser.localStorage.setItem = (key, value) => { if (key === aiWebCurrentKey) throw new Error('本机存储已满'); return setItem(key, value); };
  await api.openAiInConversation('https://chat.deepseek.com/', 'deepseek');
  assert.deepEqual(sidebar.opened.at(-1), ['browser', { params: { url: 'https://chat.deepseek.com/' } }]);
  assert.equal(api.currentAiInConversation(), 'kimi');
  f.unmount();
});

test('宿主适配版不读原版记下的入口，“正在用”仍由页面自己记着', async () => {
  const storage = new Map([[aiWebKey, 'ai-now'], [aiWebCurrentKey, JSON.stringify({ sessionId: 'ai-now', entryId: 'kimi' })]]);
  const f = await shellFixture({ storage, sidebarRight: { mounted: { getSnapshot: () => undefined }, focusPresentation() {}, presentSession() { return () => {}; }, openTab() {} } });
  assert.equal(f.clients['ai-web'].supportsInlinePresentation(), true);
  await tabButton(f.render(), 'AI 网页').props.onClick(); await settle(f);
  assert.equal(aiWebProps(f).remembered, undefined);
  f.unmount();
});

// 需求§界面通用约定（编辑用右侧抽屉：添加或编辑 AI 入口都从右侧滑出同一种抽屉，底部固定操作按钮）。
// 结构和外壳 Drawer、专家抽屉一样：标题、可滚动的正文、正文外面贴底的按钮行；按钮靠 form 属性仍算这张表单的，回车照常提交。
for (const editing of [false, true]) test(`${editing ? '编辑' : '添加'} AI 入口的抽屉和其它抽屉同一种结构，底部按钮在正文外面、仍提交这张表单`, async t => {
  const saved = [];
  const f = fixture(() => {}, { manageAiWeb: async input => {
    if (input.action === 'list') return { entries: [...aiWebEntries, customEntry] };
    saved.push(input); return { entries: [...aiWebEntries, { ...customEntry, ...input.entry, id: input.id, revision: input.expectedRevision + 1 }] };
  } });
  t.after(() => f.unmount()); f.render(); await Promise.resolve();
  if (editing) nodes(f.render()).find(node => node.props['aria-label'] === '编辑 旧名字').props.onClick();
  else nodes(f.render()).find(node => node.props.className === 'ww-card ww-add-card').props.onClick();
  const modal = dialogElement(f.render()), dialog = nodes(f.editor(modal)).find(node => node.type === 'dialog');
  assert.equal(dialog.props.className, 'ww-editor ww-page');
  assert.deepEqual(dialog.props.children.map(node => node.type), ['header', 'form', 'footer'], '标题、正文、按钮行');
  const [, form, footer] = dialog.props.children;
  assert.equal(form.props.className, 'ww-editor-body', '正文用抽屉共用的可滚动正文');
  assert.equal(footer.props.className, 'ww-row', '按钮行和外壳 Drawer 一样');
  assert.equal(nodes(form).some(node => node.type === 'footer' || node.type === 'button' && node.props.type === 'submit'), false, '按钮不在正文里，不跟着表单停在中间');
  assert.deepEqual(footer.props.children.map(node => node.props.children[0]), ['取消', editing ? '保存修改' : '添加']);
  const submit = footer.props.children.find(node => node.props.type === 'submit');
  assert.ok(form.props.id?.startsWith('ww-ai-web-form-'));
  assert.equal(submit.props.form, form.props.id, '提交按钮属于这张表单：点它或在输入框里按回车都提交');
  if (!editing) {
    const fill = (label, value) => nodes(form).find(node => node.type === 'label' && node.props.children[0] === label).props.children[1].props.onChange({ target: { value } });
    fill('名字', '办公助手'); fill('网址', 'https://example.com/');
  }
  // 浏览器提交时触发的是表单的 submit 事件，保存仍走原来那条路。
  await nodes(f.editor(modal)).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved.length, 1); assert.equal(saved[0].action, 'save');
  assert.equal(dialogElement(f.render()), undefined, '保存后抽屉关上');
});

test('删除 AI 入口仍是居中确认框，说明和“取消、确认删除”在一起', async t => {
  const f = fixture(() => {}, { manageAiWeb: async () => ({ entries: [...aiWebEntries, customEntry] }) });
  t.after(() => f.unmount()); f.render(); await Promise.resolve();
  nodes(f.render()).find(node => node.props['aria-label'] === '删除 旧名字').props.onClick();
  const dialog = nodes(f.editor(dialogElement(f.render()))).find(node => node.type === 'dialog');
  assert.equal(dialog.props.className, 'ww-modal ww-confirm ww-page');
  const form = dialog.props.children.find(node => node.type === 'form'), footer = nodes(form).find(node => node.type === 'footer');
  assert.equal(footer.props.className, 'ww-dialog-actions');
  assert.deepEqual(footer.props.children.map(node => node.props.children[0]), ['取消', '确认删除']);
});

// 需求§AI 网页（网址为 HTTP 或 HTTPS）；决策 2026-10-13（报错说清原因，不写工程用语）。
// 走真实的工作台接线：本机核对不过时经报错指南写成一句话，不把校验结果的 JSON 交给页面，也不发给宿主。
test('网址不合规时，AI 入口的报错是一句看得懂的话，说清原因，不出现 JSON 和错误码，也不发给宿主', async () => {
  const f = await shellFixture(), api = f.clients['ai-web'];
  const host = f.ctx.remote.whalewingAiWeb, sent = [], manage = host.manageAiWeb;
  host.manageAiWeb = (input, ...rest) => { sent.push(input); return manage(input, ...rest); };
  const warn = console.warn; console.warn = () => {};
  try {
    for (const [url, reason] of [['ftp://example.com', '网址只能以 http:// 或 https:// 开头'], ['javascript:alert(1)', '网址只能以 http:// 或 https:// 开头'], ['https://user:pass@example.com', '网址里不能带账号密码']]) {
      const error = await api.aiWebRequest({ action: 'save', id: 'custom-85e1008c-acfe-4fea-956c-d402ccf2be67', expectedRevision: 0, entry: { name: '办公助手', url, description: '', avatar: null } }).then(() => null, value => value);
      assert.ok(error, `“${url}”被拒`);
      assert.ok(error.message.includes(reason), `“${url}”说清原因：${error.message}`);
      assert.doesNotMatch(error.message, /"code"|"path"|[[\]{}]|INPUT|ZodError|custom/i, `“${url}”不显示内部数据格式：${error.message}`);
    }
    assert.deepEqual(sent, [], '没过本机核对的内容不发给宿主');
    // 合规的照常发出去。
    await api.aiWebRequest({ action: 'list' });
    assert.deepEqual(sent, [{ action: 'list' }]);
  } finally { console.warn = warn; f.unmount(); }
});
