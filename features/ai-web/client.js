import { createAiWebView } from './view.js';
import { aiWebContract } from './contract.js';
import { aiWebEntries } from './catalog.js';
import { registerFeature, useFeature } from '../../src/shell/feature.js';

/** AI 网页只持有自己的浏览器租约，助手和它通过中立呈现服务协调。 */
export function createView({ React, ActionMenu, useDiscard, Modal, ConfirmDialog, Glyph }) {
  const AiWebView = createAiWebView(React, { useDiscard, Modal, ConfirmDialog, Glyph });
  const { createElement: h, useState, useRef, useEffect, useSyncExternalStore } = React;
  return function AiWebFeature({ active, workbench }) {
    const { api, t, notify, bind } = useFeature(React, workbench, 'ai-web');
    const presentation = workbench.internal.presentation;
    const presented = useSyncExternalStore(presentation.subscribe, presentation.snapshot, presentation.snapshot);
    const [browserReference, setBrowserReference] = useState(null);
    const browserOpening = useRef(null), browserRetained = useRef(null), mounted = useRef(true);
    const presentedIdentity = { get current() { return presentation.snapshot().identity; } };
    const presentedReference = presented.reference;
    const visibleAssistant = presented.reference !== browserReference ? presented.reference : null;
    const restoreBrowser = presentation.restoreFocus;
    const focusMountedBrowser = () => { if (!active) throw new Error(t('browserMissing')); presentation.focus(); };
    const releaseBrowserReference = () => { restoreBrowser(); const reference = browserRetained.current; browserRetained.current = null; reference?.release(); if (mounted.current) setBrowserReference(null); };
    useEffect(() => { const opening = browserOpening.current; const intendedId = presented.reference?.sessionId || null; if (opening && opening.expected !== intendedId) opening.controller.abort(new Error('浏览器会话已切换，请重新打开')); }, [presented.reference]);
    useEffect(() => browserReference && active ? presentation.claim('content', browserReference, 10) : undefined, [browserReference, active]);
    useEffect(() => { if (!active) { browserOpening.current?.controller.abort(new Error('已离开 AI 网页')); releaseBrowserReference(); } else if (visibleAssistant) releaseBrowserReference(); }, [active, visibleAssistant]);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; browserOpening.current?.controller.abort(new Error('工作台已关闭')); releaseBrowserReference(); }; }, []);
    const prepareAiBrowser = async (url, outerSignal, key) => {
      // 原生 DSH 没有把浏览器铺满工作台的接口：在专用的「AI 网页」会话里打开。
      if (!api.supportsInlinePresentation()) return api.openAiInConversation(url, key, outerSignal);
      if (!active || browserOpening.current) throw new Error('浏览器正在准备或页面已离开');
      api.browserAvailable();
      const controller = new AbortController(), ticket = { controller, expected: presentedReference?.sessionId || null };
      browserOpening.current = ticket;
      let acquired, timer;
      const forward = () => controller.abort(outerSignal.reason || new Error('打开已取消'));
      outerSignal?.addEventListener('abort', forward, { once: true });
      if (outerSignal?.aborted) forward();
      const deadline = setTimeout(() => controller.abort(new Error('浏览器准备超时，请保留原会话并重试')), 15000);
      const signal = controller.signal;
      const aborted = new Promise((_, reject) => { if (signal.aborted) reject(signal.reason); else signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
      const wait = promise => Promise.race([promise, aborted]);
      try {
        let target = visibleAssistant || browserReference;
        if (!target) {
          const id = await wait(api.ensureWorkbench(signal));
          signal.throwIfAborted();
          acquired = api.retain(id);
          await wait(acquired.ready);
          signal.throwIfAborted();
          target = acquired;
          ticket.expected = id;
          browserRetained.current = acquired;
          setBrowserReference(acquired);
          acquired = null;
        } else ticket.expected = target.sessionId;
        // presentSession 只表达呈现意图；跨过 React commit 并确认实际 mounted 后才投递。
        do {
          await wait(new Promise(resolve => { timer = setTimeout(resolve, 16); }));
          signal.throwIfAborted();
          if (presentedIdentity.current && presentedIdentity.current !== target.sessionId) throw new Error('浏览器会话已切换，请重新打开');
        } while (presentedIdentity.current !== target.sessionId || api.browserMounted() !== target.sessionId);
        focusMountedBrowser();
        // 继续使用只恢复原浏览器呈现，不创建标签或重新导航已有网页。
        if (url !== undefined) await wait(api.openBrowser(url, target.sessionId, key));
        signal.throwIfAborted();
      } catch (reason) {
        releaseBrowserReference();
        throw reason;
      } finally {
        clearTimeout(deadline); clearTimeout(timer);
        outerSignal?.removeEventListener('abort', forward);
        acquired?.release();
        if (browserOpening.current === ticket) browserOpening.current = null;
      }
    };
    const openAiBrowser = (url, signal, key) => prepareAiBrowser(url, signal, key);
    // 原版的“继续使用”走打开入口的同一条路：这个 AI 的标签还开着就切回去、不重新导航，被关掉了才新开。
    const focusBrowser = (signal, entry) => api.supportsInlinePresentation() || !entry ? prepareAiBrowser(undefined, signal) : api.openAiInConversation(entry.url, entry.id, signal);
    // 原版打开后工作台会卸载，回来时按本机记下的入口恢复“正在用”；宿主适配版不传，由页面自己记着。
    // 右侧栏的标签一变就重算：员工把 AI 的标签关掉，“正在用”随即去掉（2026-11-02）。
    useSyncExternalStore(api.subscribeTabs, api.tabsSnapshot, api.tabsSnapshot);
    useEffect(() => { if (!api.supportsInlinePresentation()) api.watchAiTabs(); }, []);
    const remembered = api.supportsInlinePresentation() ? undefined : api.currentAiInConversation();
    // 提问台：原版在专用会话里依次打开（第二家新开一栏）；能把浏览器铺进工作台的宿主一家一家打开。
    const openMany = (entries, signal) => api.supportsInlinePresentation()
      ? entries.reduce((chain, entry) => chain.then(() => prepareAiBrowser(entry.url, signal, entry.id)), Promise.resolve())
      : api.openManyInConversation(entries, signal);
    // 发出去之后原版会切到「AI 网页」会话、这一页随之卸载，所以结果用全局的右上角提示。
    const ask = { currentAsk: api.currentAsk, savedAsks: api.savedAsks, saveAsks: api.saveAsks, loadBackground: api.loadBackground, findNotes: api.findNotes, loadNotes: api.loadNotes,
      send: async payload => {
        await api.sendAsk(payload, openMany);
        api.notify(`已复制问题。到 ${payload.entries.map(entry => entry.name).join('、')} 的输入框里${payload.entries.length > 1 ? '各' : ''}按一次 Ctrl V，再按发送`);
      } };
    return h(AiWebView, { key: 'aiWeb', active, sessionId: presentedReference?.sessionId, manageAiWeb: api.aiWebRequest, openBrowser: openAiBrowser, restoreBrowser, focusBrowser, remembered, notify, ActionMenu, ask });
  };
}

export const name = 'whalewing-ai-web';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
/**
 * 原版打开 AI 时会切到「AI 网页」会话（原版不能在鲸翼页面上显示右侧浏览器）。在这个会话的开始页放一个“返回鲸翼”，
 * 员工知道自己在哪，一点就回到鲸翼的 AI 网页页签；别的会话里不出现（2026-11-02 用户反馈）。
 */
export function createBackToWorkbench(React, api) {
  const style = { display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 10px', border: '.5px solid var(--dsw-alias-border-l2)', borderRadius: 'var(--dsw-radius-sm, 8px)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-secondary)', font: 'var(--dsw-font-xxs-12)', whiteSpace: 'nowrap', cursor: 'pointer' };
  return function BackToWorkbench({ sessionId }) {
    if (!api || api.supportsInlinePresentation() || !sessionId || sessionId !== api.aiWebSessionId()) return null;
    return React.createElement('button', { type: 'button', style, title: '回到鲸翼的 AI 网页页签；右侧的网页标签照常开着', onClick: () => api.backToWorkbench() }, '返回鲸翼');
  };
}

const heroButton = { display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 10px', border: '.5px solid var(--dsw-alias-border-l2)', borderRadius: 'var(--dsw-radius-sm, 8px)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-secondary)', font: 'var(--dsw-font-xxs-12)', whiteSpace: 'nowrap', cursor: 'pointer' };
const firstLine = value => (String(value || '').split(/\r?\n/).map(line => line.trim()).find(Boolean) || '').slice(0, 40);

/**
 * 带回来（2026-11-13）：「AI 网页」会话开始页上的“再复制问题”和“贴进来”。DSH 在这一页只给插件留了这排小按钮的位置。
 * 鲸翼读不到网页里的回答：员工自己在网页里复制，点“贴进来”，鲸翼把这段存进知识积累的收件箱，记上哪家答的、问的什么、哪天。
 */
export function createBringBack(kit, api) {
  const { React, Modal } = kit, { createElement: h, useState, useRef, useEffect } = React;
  function Paste({ sessionId, onClose }) {
    const [ask, setAsk] = useState(() => api.currentAsk());
    const [text, setText] = useState(''), [reading, setReading] = useState(true), [busy, setBusy] = useState(false);
    const [catalog, setCatalog] = useState(aiWebEntries), [from, setFrom] = useState('');
    const box = useRef(null), alive = useRef(true);
    useEffect(() => {
      alive.current = true;
      // 读得到剪贴板就直接放进来（剪贴板里还是刚才那一问时不放）；读不到就请员工在框里按 Ctrl V。
      api.readClipboard().then(value => {
        if (!alive.current) return;
        // Windows 的剪贴板会把换行换成回车加换行，比对和放进框里之前先换回来。
        const copied = value.replace(/\r\n/g, '\n');
        if (copied.trim() && copied.trim() !== ask?.text?.trim()) setText(copied);
        setReading(false); box.current?.focus();
      });
      api.aiWebRequest({ action: 'list' }).then(value => { if (alive.current) setCatalog(value.entries); }, () => { /* 读不到自定义入口时用随包目录。 */ });
      return () => { alive.current = false; };
    }, []);
    // “哪家答的”先列这个会话里开着的，其次是这一问发给的，都没有才列全部。
    const open = api.openEntries(sessionId) ?? [];
    const near = (open.length ? open : ask?.entries ?? []).map(id => catalog.find(entry => entry.id === id)).filter(Boolean);
    const options = near.length ? near : catalog;
    const selected = options.find(entry => entry.id === from) ?? options[0];
    const save = async event => {
      event?.preventDefault();
      if (busy || !text.trim()) return;
      setBusy(true);
      try {
        const saved = await api.saveAnswer({ text, entry: selected, ask });
        if (!alive.current) return;
        onClose();
        api.notify(saved.appended ? `已接着存进《${saved.name}》` : `已存进知识积累的收件箱：《${saved.name}》`, { action: { label: '去知识积累看', run: () => api.showKnowledge() } });
      } catch (error) { if (alive.current) { setBusy(false); api.notify(error.message, { kind: 'error' }); } }
    };
    return h(Modal, { title: '贴进来', busy, onClose, className: 'ww-ai-paste' },
      h('form', { className: 'ww-ai-paste-body', onSubmit: save },
        h('p', { className: 'ww-muted', role: 'status' }, reading ? '正在读剪贴板…' : text ? '这是你刚复制的内容，存之前可以改。' : '没读到剪贴板。在下面的框里按 Ctrl V 贴进来。'),
        h('textarea', { ref: box, value: text, disabled: busy, rows: 8, placeholder: '在网页里选中要留的回答，复制，再到这里按 Ctrl V', 'aria-label': '要存的回答', onChange: event => setText(event.target.value) }),
        h('label', { className: 'ww-field' }, '哪家答的', h('select', { value: selected?.id ?? '', disabled: busy, onChange: event => setFrom(event.target.value) }, ...options.map(entry => h('option', { key: entry.id, value: entry.id }, entry.name)))),
        ask ? h('p', { className: 'ww-ai-paste-ask' }, h('span', null, `问的：${firstLine(ask.question)}`), h('button', { type: 'button', disabled: busy, onClick: () => setAsk(null) }, '不是这一问'))
          : h('p', { className: 'ww-muted' }, '没带问题：按今天的日期起名，单独存一篇。'),
        h('footer', { className: 'ww-dialog-actions' }, h('button', { type: 'button', disabled: busy, onClick: onClose }, '取消'),
          h('button', { type: 'submit', className: 'ww-primary', disabled: busy || !text.trim() }, busy ? '正在保存…' : '存进知识积累'))));
  }
  return function BringBack({ sessionId }) {
    const [pasting, setPasting] = useState(false);
    if (!api || api.supportsInlinePresentation() || !sessionId || sessionId !== api.aiWebSessionId()) return null;
    const ask = api.currentAsk();
    const recopy = () => api.copyText(ask.text).then(() => api.notify('问题又放进剪贴板了，到网页的输入框里按 Ctrl V'), error => api.notify(error.message, { kind: 'error' }));
    return h(React.Fragment, null,
      ask && h('button', { type: 'button', style: heroButton, title: '把刚才那一问再放进剪贴板', onClick: recopy }, '再复制问题'),
      h('button', { type: 'button', style: heroButton, title: '把你在网页里复制的回答存进知识积累的收件箱', onClick: () => setPasting(true) }, '贴进来'),
      pasting && h(Paste, { sessionId, onClose: () => setPasting(false) }));
  };
}

export function apply(ctx) {
  return registerFeature(ctx, 'ai-web', createView, { contract: aiWebContract, namespace: 'whalewingAiWeb', entries: (scope, kit, api) => {
    scope.slots.inject('conversation.hero.options', () => scope.slots.register({ name: 'conversation.hero.options', id: 'whalewing-ai-web-bring', order: 101 }, createBringBack(kit, api)));
    scope.slots.inject('browser.toolbar.actions', () => scope.slots.register({ name: 'browser.toolbar.actions', id: 'whalewing-ai-picker', order: 10 }, createAiWebView(kit.React).Toolbar));
    scope.slots.inject('conversation.hero.options', () => scope.slots.register({ name: 'conversation.hero.options', id: 'whalewing-ai-web-back', order: 100 }, createBackToWorkbench(kit.React, api)));
  } });
}
