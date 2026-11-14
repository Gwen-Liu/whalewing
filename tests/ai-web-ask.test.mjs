import test from 'node:test';
import assert from 'node:assert/strict';
import { composeAiAsk, noteBody, answerNoteName, answerSection, answerNote, aboutMePath } from '../features/ai-web/client-api.js';
import { fixture as shellFixture } from './client-fixture.mjs';

// 提问台和带回来（2026-11-13）：鲸翼和网页之间只有剪贴板一条路，回答由员工自己复制、贴进来后存进收件箱。

test('提问台：只有问题时原样带过去；带了背景和笔记时分成背景、参考笔记、问题三段，空笔记不带', () => {
  assert.equal(composeAiAsk({ question: '  帮我列个提纲  ' }), '帮我列个提纲');
  assert.equal(composeAiAsk({ question: '问题', background: '', notes: [{ title: '空的', content: '  ' }] }), '问题');
  const text = composeAiAsk({ question: '帮我列个提纲', background: '我做运营', notes: [{ title: '复盘', content: '准时率更高' }, { title: '空的', content: '' }] });
  assert.equal(text, '【我的背景】\n我做运营\n\n【参考笔记】\n《复盘》\n准时率更高\n\n【问题】\n帮我列个提纲');
});

test('笔记带出去之前去掉最前面的属性块；没有属性块的原样保留', () => {
  assert.equal(noteBody('---\ntype: atomic\nstatus: seedling\n---\n\n# 关于我\n\n我做运营\n'), '# 关于我\n\n我做运营');
  assert.equal(noteBody('# 没有属性\n\n正文里的 --- 不算'), '# 没有属性\n\n正文里的 --- 不算');
  assert.equal(noteBody('---\ntype: atomic\n---'), '');
});

test('回答笔记的名字取问题第一行，去掉文件名里不能有的字符，最多 30 个字；没带问题时用日期', () => {
  assert.equal(answerNoteName('\n  下周讲季度复盘：帮我列提纲？\n第二行不要', '2026-11-13'), '下周讲季度复盘：帮我列提纲？');
  assert.equal(answerNoteName('a/b\\c:d*e?"f<g>h|i#j^k[l]m', '2026-11-13'), 'a b c d e f g h i j k l m');
  assert.equal(answerNoteName('一二三四五六七八九十'.repeat(4), '2026-11-13').length, 30);
  assert.equal(answerNoteName('', '2026-11-13'), '2026-11-13 网页 AI 的回答');
  assert.equal(answerNoteName('   ', '2026-11-13'), '2026-11-13 网页 AI 的回答');
});

test('回答笔记：属性照收件箱新笔记的写法，先写问的什么，再写哪家答的、哪天贴回和原文', () => {
  const section = answerSection({ name: 'Kimi', url: 'https://www.kimi.com/', date: '2026-11-13', text: '  提纲分四段  ' });
  assert.equal(section, '## Kimi 的回答\n\n来源：Kimi 网页（https://www.kimi.com/），2026-11-13 贴回\n\n提纲分四段\n');
  assert.equal(answerSection({ name: '网页 AI', url: '', date: '2026-11-13', text: '回答' }), '## 网页 AI 的回答\n\n来源：网页 AI 网页，2026-11-13 贴回\n\n回答\n');
  const note = answerNote({ name: '列提纲', question: '帮我列提纲\n先说结论', date: '2026-11-13', section });
  assert.equal(note, `---\ntype: capture\nstatus: inbox\ncreated: 2026-11-13\nupdated: 2026-11-13\naliases: []\n---\n\n# 列提纲\n\n问的：\n\n> 帮我列提纲\n> 先说结论\n\n${section}`);
  assert.equal(answerNote({ name: '没带问题', question: '', date: '2026-11-13', section }).includes('问的：'), false);
});

/** 知识积累的读写：只按路径存正文，哈希用长度代替；写入时核对期望哈希，和真实接口一样拒收冲突。 */
function vault(initial = {}) {
  const notes = new Map(Object.entries(initial)), writes = [];
  const hash = content => `h${content.length}`;
  const reply = async input => {
    if (input.action === 'read') {
      if (!notes.has(input.path)) return { ok: false, error: { code: 'NOT_FOUND', message: '没有这篇笔记' } };
      return { ok: true, value: { path: input.path, content: notes.get(input.path), hash: hash(notes.get(input.path)), readOnly: false } };
    }
    if (input.action === 'write') {
      if ((notes.has(input.path) ? hash(notes.get(input.path)) : '') !== input.expectedHash) return { ok: false, error: { code: 'CONFLICT', message: '文件已变化，请回读并合并，不覆盖新内容' } };
      notes.set(input.path, input.content); writes.push(input.path);
      return { ok: true, value: { path: input.path, hash: hash(input.content) } };
    }
    throw new Error(`测试没准备这个动作：${input.action}`);
  };
  return { notes, writes, reply };
}
/** 原版 DSH 的右栏：只有标签的打开、切换和列出。 */
function nativeSidebar() {
  const state = { mounted: undefined, tabs: [], opened: [] };
  state.service = {
    mounted: { getSnapshot: () => state.mounted },
    openTab: (...args) => { state.opened.push(args); state.tabs.push(`tab-${state.opened.length}`); },
    tabsIn: () => state.tabs.map(id => ({ id, kind: 'browser' })), focus: () => {}, isExpanded: () => true,
  };
  return state;
}
async function shell(store = vault()) {
  const sidebar = nativeSidebar(), f = await shellFixture({ sidebarRight: sidebar.service, knowledge: store.reply });
  f.ctx.uiWorkspace.openSession = id => { sidebar.mounted = id; };
  return { f, sidebar, store, api: f.clients['ai-web'] };
}
/** 测试里换一个记得住内容的剪贴板；用完还原。 */
function clipboard(t, writable = true) {
  const copied = [], previous = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async text => { if (!writable) throw new Error('denied'); copied.push(text); }, readText: async () => { if (!copied.length) throw new Error('denied'); return copied.at(-1); } } });
  t.after(() => { if (previous) Object.defineProperty(globalThis.navigator, 'clipboard', previous); else delete globalThis.navigator.clipboard; });
  return copied;
}
const kimi = { id: 'kimi', name: 'Kimi', url: 'https://www.kimi.com/' }, deepseek = { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/' };
const today = () => { const now = new Date(), two = value => String(value).padStart(2, '0'); return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`; };

test('没带问题贴进来：在收件箱按日期新建一篇，写明哪家答的；空内容不写任何东西', async () => {
  const { f, store, api } = await shell();
  await assert.rejects(api.saveAnswer({ text: '   ', entry: kimi, ask: null }), /先在网页里复制要留的回答/);
  assert.deepEqual(store.writes, []);
  const saved = await api.saveAnswer({ text: '提纲分四段', entry: kimi, ask: null });
  assert.deepEqual(saved, { path: `10-收件箱/${today()} 网页 AI 的回答.md`, name: `${today()} 网页 AI 的回答`, appended: false });
  const note = store.notes.get(saved.path);
  assert.match(note, /^---\ntype: capture\nstatus: inbox\n/);
  assert.match(note, /## Kimi 的回答\n\n来源：Kimi 网页（https:\/\/www\.kimi\.com\/），/);
  assert.equal(note.includes('问的：'), false);
  f.unmount();
});

test('发出去：全部内容进剪贴板、记下这一问、依次打开；第二家要求新开一栏；同一问的回答接着存进同一篇', async t => {
  const copied = clipboard(t), { f, sidebar, store, api } = await shell();
  assert.equal(api.currentAsk(), null);
  const text = composeAiAsk({ question: '帮我列个提纲', background: '我做运营' });
  await api.sendAsk({ entries: [kimi, deepseek], question: '帮我列个提纲', text, background: true, notes: [] }, api.openManyInConversation);
  assert.deepEqual(copied, [text]);
  assert.deepEqual(sidebar.opened, [['browser', { params: { url: kimi.url } }], ['browser', { params: { url: deepseek.url }, preferNewPane: true }]]);
  const ask = api.currentAsk();
  assert.equal(ask.question, '帮我列个提纲'); assert.equal(ask.text, text); assert.deepEqual(ask.entries, ['kimi', 'deepseek']); assert.equal(ask.notePath, '');
  assert.equal(api.currentAiInConversation(), 'kimi', '回到页签时标第一家“正在用”');

  const first = await api.saveAnswer({ text: 'Kimi 说分四段', entry: kimi, ask });
  assert.deepEqual(first, { path: '10-收件箱/帮我列个提纲.md', name: '帮我列个提纲', appended: false });
  assert.equal(api.currentAsk().notePath, first.path, '记下这一问存在哪篇');
  const second = await api.saveAnswer({ text: 'DeepSeek 说先放结论', entry: deepseek, ask: api.currentAsk() });
  assert.deepEqual(second, { path: first.path, name: '帮我列个提纲', appended: true });
  const note = store.notes.get(first.path);
  assert.match(note, /问的：\n\n> 帮我列个提纲\n\n## Kimi 的回答[\s\S]+Kimi 说分四段\n\n## DeepSeek 的回答[\s\S]+DeepSeek 说先放结论\n$/);
  assert.deepEqual(store.writes, [first.path, first.path]);
  f.unmount();
});

test('收件箱里已有同名笔记时不覆盖，另起“名字 2”；原来那篇被删后再贴，另建一篇', async t => {
  clipboard(t);
  const { f, store, api } = await shell(vault({ '10-收件箱/帮我列个提纲.md': '# 员工自己写的同名笔记\n' }));
  await api.sendAsk({ entries: [kimi], question: '帮我列个提纲', text: '帮我列个提纲' }, async () => {});
  const saved = await api.saveAnswer({ text: '回答一', entry: kimi, ask: api.currentAsk() });
  assert.equal(saved.path, '10-收件箱/帮我列个提纲 2.md');
  assert.equal(store.notes.get('10-收件箱/帮我列个提纲.md'), '# 员工自己写的同名笔记\n', '原来那篇一个字不动');
  store.notes.delete(saved.path);
  const again = await api.saveAnswer({ text: '回答二', entry: kimi, ask: api.currentAsk() });
  assert.deepEqual(again, { path: '10-收件箱/帮我列个提纲 2.md', name: '帮我列个提纲 2', appended: false });
  f.unmount();
});

test('剪贴板不让写时发不出去：说明原因，不记这一问、不打开网页；这一问 12 小时后不再算数', async t => {
  clipboard(t, false);
  const { f, sidebar, api } = await shell();
  await assert.rejects(api.sendAsk({ entries: [kimi], question: '问题', text: '问题' }, api.openManyInConversation), /没能放进剪贴板/);
  assert.equal(api.currentAsk(), null); assert.deepEqual(sidebar.opened, []);
  const key = [...f.storage.keys()].find(name => name.startsWith('whalewing:aiweb-ask:')) ?? 'whalewing:aiweb-ask:http://fixture.local';
  f.storage.set(key, JSON.stringify({ question: '旧问题', text: '旧问题', entries: ['kimi'], at: Date.now() - 13 * 3600 * 1000, notePath: '' }));
  assert.equal(api.currentAsk(), null);
  f.storage.set(key, JSON.stringify({ question: '新问题', text: '新问题', entries: ['kimi'], at: Date.now() - 3600 * 1000, notePath: '' }));
  assert.equal(api.currentAsk().question, '新问题');
  f.unmount();
});

test('我的背景读《关于我》的正文；没有这篇或还是空的时说清去哪写；挑的笔记去掉属性块', async () => {
  const filled = await shell(vault({ [aboutMePath]: '---\ntype: atomic\n---\n\n我在制造企业做运营。\n', '40-知识/工作方法/复盘.md': '---\ntype: atomic\n---\n\n# 复盘\n\n先说结论。\n' }));
  assert.equal(await filled.api.loadBackground(), '我在制造企业做运营。');
  assert.deepEqual(await filled.api.loadNotes(['40-知识/工作方法/复盘.md']), [{ path: '40-知识/工作方法/复盘.md', title: '复盘', content: '# 复盘\n\n先说结论。' }]);
  filled.f.unmount();
  const missing = await shell();
  await assert.rejects(missing.api.loadBackground(), /没读到《关于我》/);
  missing.f.unmount();
  const empty = await shell(vault({ [aboutMePath]: '---\ntype: atomic\n---\n' }));
  await assert.rejects(empty.api.loadBackground(), /《关于我》还是空的/);
  empty.f.unmount();
});

// —— 提问台的界面：只核对组件的交互约定；真的打开网页、读写知识库由上面的接线测试和隔离环境走查证明。——
const { createAiWebView } = await import('../features/ai-web/view.js');
const { aiWebEntries, aiWebGuide, aiWebScenes } = await import('../features/ai-web/catalog.js');
const { aiWebFaces } = await import('../src/utilities/ai-web-faces.js');
const { worldPersonas } = await import('../src/model-world-persona.js');
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children || []).flatMap(nodes)];
const textOf = node => typeof node === 'string' ? node : nodes(node).flatMap(item => item.props.children.filter(child => typeof child === 'string')).join('');
function page(askOverrides, options = {}) {
  const hooks = { states: [], refs: [], effects: [] };
  let cursor = 0, ri = 0, ei = 0;
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children: children.flat().filter(child => child !== false && child != null && child !== '') } }; },
    useRef(initial) { return hooks.refs[ri++] ||= { current: initial }; },
    useEffect(fn, deps) { const i = ei++, old = hooks.effects[i]; if (!old || !deps || deps.some((d, j) => d !== old.deps[j])) { old?.cleanup?.(); hooks.effects[i] = { deps, cleanup: fn() }; } },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useState(initial) { const index = cursor++; if (!(index in hooks.states)) hooks.states[index] = typeof initial === 'function' ? initial() : initial; return [hooks.states[index], value => { hooks.states[index] = typeof value === 'function' ? value(hooks.states[index]) : value; }]; },
  };
  const Modal = props => ({ type: 'dialog', props: { ...props, children: [props.children].flat() } });
  const ConfirmDialog = props => ({ type: 'dialog', props: { ...props, children: [] } });
  const View = createAiWebView(React, { Modal, ConfirmDialog });
  const toasts = [], sent = [], stored = { asks: [] };
  const ask = askOverrides === null ? undefined : {
    currentAsk: () => null, savedAsks: () => stored.asks, saveAsks: list => { stored.asks = list; return true; },
    loadBackground: async () => '我做运营', findNotes: async () => [], loadNotes: async paths => paths.map(path => ({ path, title: path, content: '笔记正文' })),
    send: async payload => { sent.push(payload); }, ...askOverrides,
  };
  const render = () => { cursor = ri = ei = 0; return View({ active: true, sessionId: 's', openBrowser: async () => {}, notify: (message, extra = {}) => { if (message) toasts.push({ message, ...extra }); }, ask, ...options }); };
  const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && (node.props['aria-label'] === label || textOf(node) === label));
  return { render, button, toasts, sent, stored };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('没接提问台时页面照旧只是入口：没有提问台，卡片上也没有“+”；接上才有', () => {
  const bare = page(null).render();
  assert.equal(nodes(bare).some(node => node.props?.className === 'ww-ai-desk'), false);
  assert.equal(nodes(bare).some(node => node.props?.className === 'ww-ai-pick'), false);
  const full = page().render();
  assert.equal(nodes(full).filter(node => node.props?.className === 'ww-ai-desk').length, 1);
  assert.equal(nodes(full).filter(node => node.props?.className === 'ww-ai-pick').length, aiWebEntries.length);
});

test('提问台：没写问题、没选人时发不出去并说明；选两家、勾背景后把问题、要带的内容和这两家交出去', async () => {
  const p = page();
  let tree = p.render();
  assert.equal(p.button(tree, '发给…').props.disabled, true);
  p.button(tree, '加进提问台 Kimi').props.onClick(); tree = p.render();
  p.button(tree, '发给 1 家').props.onClick(); await settle();
  assert.equal(p.toasts.at(-1).message, '先写下想问的'); assert.deepEqual(p.sent, []);
  nodes(tree).find(node => node.type === 'textarea').props.onChange({ target: { value: '帮我列个提纲' } });
  p.button(p.render(), '加进提问台 DeepSeek').props.onClick();
  p.button(p.render(), '我的背景').props.onClick();
  tree = p.render();
  assert.deepEqual(nodes(tree).filter(node => node.props?.className === 'ww-ai-to').map(node => node.props.children[0]), ['Kimi', 'DeepSeek']);
  assert.match(textOf(nodes(tree).find(node => node.props?.className === 'ww-ai-desk-safe')), /只放进剪贴板，不放进网址/);
  p.button(tree, '发给 2 家').props.onClick(); await settle(); await settle();
  assert.equal(p.sent.length, 1);
  assert.deepEqual(p.sent[0].entries.map(entry => entry.id), ['kimi', 'deepseek']);
  assert.equal(p.sent[0].question, '帮我列个提纲'); assert.equal(p.sent[0].background, true);
  assert.equal(p.sent[0].text, '【我的背景】\n我做运营\n\n【问题】\n帮我列个提纲');
});

test('提问台：《关于我》读不到时不发，说清原因；一次最多发给 4 家；再点一次“✓”就去掉', async () => {
  const p = page({ loadBackground: async () => { throw new Error('知识积累里没读到《关于我》'); } });
  nodes(p.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: '问题' } });
  for (const name of ['DeepSeek', '豆包', 'Kimi', '千问']) p.button(p.render(), `加进提问台 ${name}`).props.onClick();
  p.button(p.render(), '加进提问台 腾讯元宝').props.onClick();
  assert.equal(p.toasts.at(-1).message, '一次最多发给 4 家');
  p.button(p.render(), '我的背景').props.onClick();
  p.button(p.render(), '发给 4 家').props.onClick(); await settle(); await settle();
  assert.match(p.toasts.at(-1).message, /没读到《关于我》/); assert.deepEqual(p.sent, []);
  p.button(p.render(), '从提问台去掉 豆包').props.onClick();
  assert.ok(p.button(p.render(), '发给 3 家'));
});

test('常用问法：存下现在这一问，之后一点套用；删除先居中确认', async () => {
  const p = page();
  nodes(p.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: '帮我把周报改简洁\n先说结果' } });
  p.button(p.render(), '加进提问台 Kimi').props.onClick();
  p.button(p.render(), '+ 把这一问存成常用').props.onClick();
  assert.deepEqual(p.stored.asks, [{ name: '帮我把周报改简洁', question: '帮我把周报改简洁\n先说结果', entries: ['kimi'], background: false, notes: [] }]);
  nodes(p.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: '别的问题' } });
  p.button(p.render(), '从提问台去掉 Kimi').props.onClick();
  p.button(p.render(), '帮我把周报改简洁').props.onClick();
  const tree = p.render();
  assert.equal(nodes(tree).find(node => node.type === 'textarea').props.value, '帮我把周报改简洁\n先说结果');
  assert.ok(p.button(tree, '发给 1 家'));
  p.button(tree, '删除常用问法 帮我把周报改简洁').props.onClick();
  const confirm = nodes(p.render()).find(node => node.props?.title === '删除常用问法');
  assert.equal(confirm.props.danger, true); assert.equal(p.stored.asks.length, 1, '确认之前不删');
  confirm.props.onConfirm();
  assert.deepEqual(p.stored.asks, []);
});

test('目录指引：每条对得上内置入口，场景和角色都认得；选一个场景只列写了这个场景的入口，卡片上的话换成这件事上的拿手戏', () => {
  const ids = new Set(aiWebEntries.map(entry => entry.id)), scenes = new Set(aiWebScenes.map(([id]) => id));
  assert.deepEqual(Object.keys(aiWebGuide).sort(), [...ids].sort(), '每个内置入口都有指引，指引不多出入口');
  for (const [id, guide] of Object.entries(aiWebGuide)) {
    assert.ok(['cn', 'global', 'tool', 'tool-global'].includes(guide.group), id);
    if (guide.persona) { assert.ok(aiWebFaces[guide.persona], `${id} 的角色小像`); assert.ok(worldPersonas[guide.persona]?.title, `${id} 的角色称号`); }
    if (guide.line) assert.ok([...guide.line].length <= 16, `${id} 的拿手戏不超过 16 个字`);
    for (const [scene, line] of Object.entries(guide.scenes ?? {})) { assert.ok(scenes.has(scene), `${id} 的场景 ${scene}`); assert.ok(line && [...line].length <= 14, `${id}/${scene}`); }
  }
  for (const [scene, label] of aiWebScenes) {
    const expected = aiWebEntries.filter(entry => aiWebGuide[entry.id].scenes?.[scene]);
    if (!expected.length) continue;
    const p = page();
    p.button(p.render(), label).props.onClick();
    const tiles = nodes(p.render()).filter(node => node.type === 'article');
    assert.deepEqual(tiles.map(tile => textOf(nodes(tile).find(node => node.type === 'strong'))), expected.map(entry => entry.name), label);
    assert.deepEqual(tiles.map(tile => textOf(nodes(tile).find(node => node.props?.className === 'ww-ai-line'))), expected.map(entry => aiWebGuide[entry.id].scenes[scene]), label);
  }
});

test('“全部”是紧凑名录：小块只有头像和名字，称号和拿手戏放在悬停说明里，分组名在每行开头；选了场景才是带拿手戏的大卡', () => {
  const p = page();
  const all = p.render();
  const dir = nodes(all).find(node => node.props?.className === 'ww-ai-dir');
  const minis = nodes(dir).filter(node => node.type === 'article');
  assert.equal(minis.length, aiWebEntries.length);
  for (const tile of minis) {
    assert.ok(tile.props.className.includes('ww-ai-mini'));
    assert.equal(nodes(tile).some(node => node.type === 'small' || node.props?.className === 'ww-ai-line' || node.props?.className === 'ww-orn-wave'), false, '小块上没有第二行字、拿手戏和水纹');
  }
  const deepseek = minis.find(tile => textOf(nodes(tile).find(node => node.type === 'strong')) === 'DeepSeek');
  assert.equal(nodes(deepseek).find(node => node.props?.className === 'ww-ai-open').props.title, `大飞鱼姐姐 · ${aiWebGuide.deepseek.line}`);
  // 分组名：逗号前半句是名字，后半句（需海外网络）是第二行小字；整组的无障碍名字还是完整的一句。
  const abroad = nodes(dir).find(node => node.type === 'section' && node.props['aria-label'] === '聊天 · 海外，需海外网络');
  const label = nodes(abroad).find(node => node.props?.className === 'ww-ai-group-label');
  assert.equal(label.props.children[0], '聊天 · 海外'); assert.equal(textOf(nodes(label).find(node => node.type === 'small')), '需海外网络');
  // 标着“正在用”的小块才多一个小字。
  const using = page(undefined, { remembered: 'kimi' }).render();
  const kimi = nodes(using).filter(node => node.type === 'article').find(tile => tile.props.className.includes('ww-ai-current'));
  assert.equal(textOf(nodes(kimi).find(node => node.type === 'small')), '正在用');
  // 选了场景：不在名录里，是大卡。
  p.button(all, '写东西').props.onClick();
  const scene = p.render();
  assert.equal(nodes(scene).some(node => node.props?.className === 'ww-ai-dir'), false);
  const big = nodes(scene).filter(node => node.type === 'article');
  assert.ok(big.length > 0 && big.every(tile => !tile.props.className.includes('ww-ai-mini') && nodes(tile).some(node => node.props?.className === 'ww-ai-line') && nodes(tile).some(node => node.type === 'small')));
});
