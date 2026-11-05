import { createAiWebView } from './view.js';
import { aiWebContract } from './contract.js';
import { registerFeature, useFeature } from '../../src/shell/feature.js';

/** AI 网页只持有自己的浏览器租约，助手和它通过中立呈现服务协调。 */
export function createView({ React, ActionMenu, useDiscard }) {
  const AiWebView = createAiWebView(React, { useDiscard });
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
    return h(AiWebView, { key: 'aiWeb', active, sessionId: presentedReference?.sessionId, manageAiWeb: api.aiWebRequest, openBrowser: openAiBrowser, restoreBrowser, focusBrowser, remembered, notify, ActionMenu });
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

export function apply(ctx) {
  return registerFeature(ctx, 'ai-web', createView, { contract: aiWebContract, namespace: 'whalewingAiWeb', entries: (scope, kit, api) => {
    scope.slots.inject('browser.toolbar.actions', () => scope.slots.register({ name: 'browser.toolbar.actions', id: 'whalewing-ai-picker', order: 10 }, createAiWebView(kit.React).Toolbar));
    scope.slots.inject('conversation.hero.options', () => scope.slots.register({ name: 'conversation.hero.options', id: 'whalewing-ai-web-back', order: 100 }, createBackToWorkbench(kit.React, api)));
  } });
}
