import { aiWebEntries } from './catalog.js';
import { aiWebContract } from './contract.js';
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createAiWebClient(bridge, t, z, workbenchSession) {
    const { featureRemote, unwrap, failure, hostFailure } = bridge;
    const { prepareSession, browserAvailable: requireBrowser } = bridge;
    const NS = 'whalewing', aiWebSchema = aiWebContract(z);
    // 填写的内容先在本机按契约核对：不合格时和宿主报错一样经报错指南写成一句话（如“网址只能以 http:// 或 https:// 开头”），
    // 不把校验结果的原始 JSON 交给页面；原文只进开发者控制台。读回不合契约按“结果不完整”处理。
    const aiWebRequest = async (input, signal) => {
      const parsed = aiWebSchema.input.safeParse(input);
      if (!parsed.success) throw hostFailure(parsed.error.message, 'INPUT');
      const result = aiWebSchema.result.safeParse(unwrap(await featureRemote('whalewingAiWeb').manageAiWeb(parsed.data, signal)));
      if (!result.success) throw failure(t('badReply'), 'bad_reply');
      return result.data;
    };
    // AI 入口 → 浏览器标签的对应关系，按工作台会话分开；只是个人偏好，存不下也不影响打开。
    const aiTabs = {
      key: 'whalewing.aiWebTabs.v1',
      read() { try { const value = JSON.parse(window.localStorage.getItem(this.key)); return value && typeof value === 'object' ? value : {}; } catch { return {}; } },
      remember(sessionId, entryId, tabId, openIds) {
        const all = this.read();
        const live = new Set(openIds);
        const current = Object.fromEntries(Object.entries(all[sessionId] || {}).filter(([, id]) => live.has(id)));
        current[entryId] = tabId;
        try { window.localStorage.setItem(this.key, JSON.stringify({ ...all, [sessionId]: current })); } catch { /* 记不住时下次照常新开。 */ }
      },
    };
    async function openBrowser(url, sessionId, key) {
      const sidebar = requireBrowser();
      if (!sessionId || sidebar.mounted?.getSnapshot() !== sessionId) throw new Error(t('browserMissing'));
      const tabs = () => typeof sidebar.tabsIn === 'function' ? sidebar.tabsIn(sessionId).filter(tab => tab?.kind === 'browser') : [];
      const known = key && aiTabs.read()[sessionId]?.[key];
      // 同一个 AI 只占一个网页标签：已经开着就切回去，员工在里面的对话和登录都还在。
      if (known && typeof sidebar.focus === 'function' && tabs().some(tab => tab.id === known)) { sidebar.focus(known); return; }
      const before = new Set(tabs().map(tab => tab.id));
      sidebar.openTab('browser', { params: { url } });
      if (!key) return;
      // 记下新开的标签；标签被员工关掉后下次再新开。
      for (let attempt = 0; attempt < 30; attempt++) {
        const added = tabs().find(tab => !before.has(tab.id));
        if (added) { aiTabs.remember(sessionId, key, added.id, tabs().map(tab => tab.id)); return; }
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    }
    // 未适配的 DSH 不能把浏览器铺满工作台：改为打开专用的「AI 网页」会话，在它右侧的内置浏览器里打开。
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const aiWebKey = `${NS}:aiweb:${origin}`;
    // 切到会话后工作台页面会卸载，记下最后一次在「AI 网页」会话里打开的入口，回来时据此标“正在用”。只是本机偏好，读写失败当没有。
    const aiWebCurrentKey = `${NS}:aiweb-current:${origin}`;
    function rememberAiInConversation(sessionId, entryId) {
      try { window.localStorage.setItem(aiWebCurrentKey, JSON.stringify({ sessionId, entryId })); } catch { /* 记不住时回来不标“正在用”。 */ }
    }
    // 右侧栏开着的标签（rc.5 起有）。拿不到时当作不知道：照旧按记下的入口显示“正在用”。
    const noTabs = [];
    const tabStore = () => bridge.browserTabs?.() ?? null;
    const subscribeTabs = listener => tabStore()?.subscribe(listener) ?? (() => {});
    const tabsSnapshot = () => tabStore()?.getSnapshot() ?? noTabs;
    /** 这个会话里标签还开着的入口 id（按打开时记下的标签 id 认）；拿不到标签列表时返回 null。 */
    function openEntries(sessionId) {
      if (!tabStore()) return null;
      const live = new Set(tabsSnapshot().filter(tab => tab?.sessionId === sessionId).map(tab => tab.tabId));
      return Object.entries(aiTabs.read()[sessionId] || {}).filter(([, tabId]) => live.has(tabId)).map(([entryId]) => entryId);
    }
    /**
     * “正在用”的入口 id：记下时的会话已不是现在的「AI 网页」会话、会话已不在 DSH 会话列表里或已归档时返回空；
     * 员工在右侧栏把这个 AI 的标签关掉了也返回空，还有别的 AI 标签开着就标那一个（2026-11-02）。入口还在不在由页面按目录核对。
     */
    function currentAiInConversation() {
      try {
        const saved = JSON.parse(window.localStorage.getItem(aiWebCurrentKey)), sessionId = window.localStorage.getItem(aiWebKey);
        if (!sessionId || saved?.sessionId !== sessionId || typeof saved.entryId !== 'string') return '';
        // 会话列表还没读完时不据此判断，免得刚回来时误把“正在用”去掉。
        const sessions = bridge.sessionSnapshot();
        if (sessions?.phase === 'ready' && !sessions.byId?.[sessionId]) return '';
        const archived = bridge.workspaces()?.archivedSessionIds;
        if (Array.isArray(archived) && archived.includes(sessionId)) return '';
        const open = openEntries(sessionId);
        if (open === null || open.includes(saved.entryId)) return saved.entryId;
        return open[0] ?? '';
      } catch { return ''; }
    }
    /** 「AI 网页」会话的 id（没建过时为空串），开始页的“返回鲸翼”按钮据此只在这个会话里出现。 */
    function aiWebSessionId() { try { return window.localStorage.getItem(aiWebKey) || ''; } catch { return ''; } }
    /**
     * 原版 DSH 不能在鲸翼页面上显示右侧浏览器，打开 AI 时会切到「AI 网页」会话。员工把最后一个 AI 标签关掉时，
     * 如果正看着这个会话，就自动回到鲸翼的 AI 网页页签，不把人留在空会话里（2026-11-02 用户反馈）。
     * 只在记下的标签从“开着”变成“没了”时动作；打开过程中还没记下标签时不会误判。
     */
    let watching = null;
    function watchAiTabs() {
      const store = tabStore();
      if (!store || watching) return;
      let before = new Set(tabsSnapshot().map(tab => tab.tabId));
      watching = store.subscribe(() => {
        const tabs = tabsSnapshot(), now = new Set(tabs.map(tab => tab.tabId));
        const sessionId = aiWebSessionId(), recorded = Object.values(aiTabs.read()[sessionId] || {});
        const closed = recorded.some(tabId => before.has(tabId) && !now.has(tabId));
        before = now;
        if (!closed || bridge.browserMounted() !== sessionId) return;
        if (tabs.some(tab => tab.sessionId === sessionId && tab.kind === 'browser')) return;
        bridge.showWorkbench?.('ai-web');
      });
    }
    async function ensureAiWebSession(signal) {
      let id;
      try { id = window.localStorage.getItem(aiWebKey) || undefined; } catch { /* 记不住时本次新建。 */ }
      const fresh = !id;
      id ||= `whalewing-aiweb-${globalThis.crypto.randomUUID()}`;
      try { window.localStorage.setItem(aiWebKey, id); } catch { /* 同上。 */ }
      const created = await prepareSession(id, fresh, { agentPreset: 'standard' }, undefined, signal);
      if (created?.sessionId !== id) throw failure(t('badReply'), 'bad_reply');
      // 专用会话命名是既有业务步骤；上次命名失败时仍按原ID补做，不用它证明恢复。
      unwrap(await bridge.session.rename({ sessionId: id, title: t('aiWebSessionTitle') }), id);
      return id;
    }
    async function openAiInConversation(url, key, signal) {
      requireBrowser();
      const id = await ensureAiWebSession(signal);
      signal?.throwIfAborted();
      // 切到会话后工作台页面会卸载，后续步骤不再跟随页面的取消信号。
      bridge.open(id);
      try {
        const sidebar = requireBrowser();
        for (const deadline = Date.now() + 10000; sidebar.mounted?.getSnapshot() !== id;) {
          if (Date.now() > deadline) throw new Error(t('browserMissing'));
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        // 会话刚切到前台时右栏面板还没就绪，openTab 会报“没有挂载的会话面板”，稍等重试。
        for (const deadline = Date.now() + 10000; ;) {
          try { if (url !== undefined) await openBrowser(url, id, key); break; }
          catch (error) {
            if (!/no session surface/.test(String(error?.message)) || Date.now() > deadline) throw error;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        if (url !== undefined && key) rememberAiInConversation(id, key);
        watchAiTabs();
        if (typeof sidebar.isExpanded === 'function' && !sidebar.isExpanded()) sidebar.toggleExpanded?.();
      } catch (error) { bridge.notify(error.message, { kind: 'error' }); throw error; }
    }

  return {
    aiWebRequest, openBrowser, openAiInConversation, currentAiInConversation, subscribeTabs, tabsSnapshot, aiWebSessionId, watchAiTabs,
    backToWorkbench: () => bridge.showWorkbench?.('ai-web'), retain: bridge.retain,
    supportsInlinePresentation: bridge.canFocusPresentation, browserAvailable: bridge.browserAvailable, browserMounted: bridge.browserMounted,
    ensureWorkbench: workbenchSession.ensureWorkbench,
  };
}

export function findAiWebEntries(query = '', entries = aiWebEntries) {
  const words = String(query).trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return entries.filter(entry => words.every(word => `${entry.name} ${entry.provider} ${entry.description} ${entry.keywords}`.toLocaleLowerCase().includes(word)));
}

/** 仅把目录中的官方地址交给宿主异步准备后的 openTab；入口 id 用来让同一个 AI 只占一个网页标签。不代理网络或补建浏览器。 */
export async function openAiWebsite(id, openBrowser, signal, entries = aiWebEntries) {
  const entry = entries.find(item => item.id === id);
  if (!entry) throw new Error('此 AI 入口不存在，请重新选择');
  if (typeof openBrowser !== 'function') throw new Error('DSH 浏览器尚未就绪，请启用宿主浏览器后重试');
  signal?.throwIfAborted();
  await openBrowser(entry.url, signal, entry.id);
  signal?.throwIfAborted();
  return entry;
}
