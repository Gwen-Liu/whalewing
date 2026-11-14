
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createAssistantClient(bridge, t, directory) {
    const { failure, restoreSession, prepareSession } = bridge;
    const { loadExperts, selectExpert } = directory;
    let assistantContext = { sessionId: '', paths: [] };
    const contextListeners = new Set();
    const setAssistantContext = (sessionId, paths) => {
      if (assistantContext.sessionId === sessionId && JSON.stringify(assistantContext.paths) === JSON.stringify(paths)) return;
      assistantContext = { sessionId, paths: [...paths] };
      contextListeners.forEach(listener => listener());
    };
    let assistantId;
    let assistantReady = false;
    let assistantPromise;
    // 2026-11-08 用户定：重开 DSH 后回到上次的小鲸对话。只记会话标识，存不下时照旧每次新开。
    const lastKey = 'whalewing.assistantSession';
    const readLast = () => { try { const value = window.localStorage.getItem(lastKey); return typeof value === 'string' && /^whalewing-assistant-[0-9a-f-]{36}$/.test(value) ? value : null; } catch { return null; } };
    const writeLast = value => { try { if (value) window.localStorage.setItem(lastKey, value); else window.localStorage.removeItem(lastKey); } catch { /* 存不下就下次新开。 */ } };
    /** 上次的小鲸对话还能接着用：会话在、没归档、选的仍是小鲸。接不上返回 false，不报错。 */
    async function resumeLast(id) {
      try {
        await prepareSession(id, false, { agentPreset: 'standard' });
        const projection = await bridge.readProjection(id, ['whalewingExpert']);
        return projection?.values?.whalewingExpert?.expertId === 'manager';
      } catch { return false; }
    }
    // DSH 会把还没说过话的会话当“新会话”复用（2026-11-08 真模型验证时见到），员工在那里换了专家，这段就不再是小鲸了。
    // 读得到、确实不是小鲸了才另开；读不到时照旧用，免得一时读不到就丢了对话。
    async function stillManager(id) {
      try { return (await bridge.readProjection(id, ['whalewingExpert']))?.values?.whalewingExpert?.expertId === 'manager'; }
      catch { return true; }
    }
    function ensureAssistant() {
      if (assistantReady) return restoreSession(assistantId).then(async () => {
        if (await stillManager(assistantId)) return assistantId;
        if (!assistantReady) return ensureAssistant();
        assistantId = undefined; assistantReady = false; writeLast(null);
        return ensureAssistant();
      });
      if (assistantPromise) return assistantPromise;
      assistantPromise = (async () => {
        const role = (await loadExperts()).experts.find(item => item.id === 'manager');
        if (!role) throw failure(t('assistantMissing'), 'role_missing');
        if (!assistantId) {
          const last = readLast();
          if (last && await resumeLast(last)) { assistantId = last; assistantReady = true; return assistantId; }
          if (last) writeLast(null);
        }
        const fresh = !assistantId;
        assistantId ||= `whalewing-assistant-${globalThis.crypto.randomUUID()}`;
        await prepareSession(assistantId, fresh, { agentPreset: 'standard' });
        await selectExpert(assistantId, 'manager');
        assistantReady = true;
        writeLast(assistantId);
        return assistantId;
      })().catch(error => { error.sessionId ??= assistantId; throw error; }).finally(() => { assistantPromise = undefined; });
      return assistantPromise;
    }
    /** “新对话”：另起一段小鲸对话，原来那段留在 DSH 侧栏里不删。 */
    function newAssistant() {
      if (assistantPromise) return assistantPromise;
      assistantId = undefined; assistantReady = false; writeLast(null);
      return ensureAssistant();
    }
    const inputViews = new Map();
    const inputViewListeners = new Set();
    function mountAssistantInput(sessionId) {
      const token = {};
      inputViews.set(sessionId, token);
      for (const listener of inputViewListeners) listener();
      return () => { if (inputViews.get(sessionId) === token) inputViews.delete(sessionId); };
    }
    async function proposeDiscussion(reference, proposal, signal) {
      const waiting = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
      waiting.throwIfAborted();
      await new Promise((resolve, reject) => {
        const aborted = () => { cleanup(); reject(waiting.reason); };
        let ready = false;
        const check = () => { if (ready && inputViews.has(reference.sessionId)) { cleanup(); resolve(); } };
        const cleanup = () => { waiting.removeEventListener('abort', aborted); inputViewListeners.delete(check); };
        waiting.addEventListener('abort', aborted, { once: true });
        inputViewListeners.add(check);
        reference.ready.then(() => { ready = true; check(); }, error => { cleanup(); reject(error); });
      });
      waiting.throwIfAborted();
      const binding = bridge.inputBinding(reference);
      if (!binding) throw failure(t('draftUnavailable'), 'input_unavailable');
      const input = binding.hooks.input;
      const actions = binding.props.inputActions;
      if (binding.key !== reference.sessionId || !input || !actions) throw failure(t('draftUnavailable'), 'input_unavailable');
      const draft = input.getSnapshot();
      if (draft.draft.includes(proposal)) return;
      const span = actions.captureInsertion();
      waiting.throwIfAborted();
      // 折叠到当前选区末端，只插入提议，不重建正文或破坏已有资料 chip。
      if (!actions.insertText(draft.draft ? `\n\n${proposal}\n\n` : proposal, { ...span, start: span.end }) || !input.getSnapshot().draft.includes(proposal)) throw failure(t('draftUnavailable'), 'draft_insert_rejected');
    }

  return {
    // 有没有上次那段小鲸对话可以接着用（这次打开页面里用过，或本机记着上次的会话标识）；只看本地记录，不读会话。
    hasPrevious: () => Boolean(assistantReady && assistantId) || Boolean(readLast()),
    ensureAssistant, newAssistant, proposeDiscussion, mountAssistantInput, setAssistantContext, assistantContext: () => assistantContext,
    subscribeContext: listener => { contextListeners.add(listener); return () => contextListeners.delete(listener); },
    experts: directory.experts, subscribeExperts: directory.subscribeExperts, open: bridge.open, retain: bridge.retain,
    // 建专家、改专家的卡片：回到鲸翼页面的专家团队。
    showExperts: () => bridge.showWorkbench?.('experts'),
    showAutomation: () => bridge.showWorkbench?.('automation'),
    // 派出去的任务、小鲸自己的详情：回到专家团队页，在中间那栏打开（2026-11-08 第三版）。
    showTask: id => { directory.requestTask?.(id); bridge.showWorkbench?.('experts'); },
    showExpertDetail: (id, tab) => { directory.requestDetail?.(id, tab); bridge.showWorkbench?.('experts'); },
    // 派出去的任务的进度：会话列表里那个任务的投影值，跟着会话变化实时更新。
    subscribeSessions: listener => bridge.subscribeSessions(listener),
    dispatchStatus: id => bridge.sessionSnapshot().byId?.[id]?.projectionValues?.whalewingDispatch ?? null,
    // 面板上的“派出去的事”：整份会话列表，以及已归档的会话（归档的不列）。
    sessionsSnapshot: () => bridge.sessionSnapshot(),
    archivedSessions: () => { try { return bridge.workspaces?.()?.archivedSessionIds ?? []; } catch { return []; } },
    // 交接卡片打开任务前核对归档与子代理归属，并按会话列表判断任务是否已经开始。
    checkSession: id => bridge.assertActiveSession(id), sessionSummary: id => bridge.sessionSnapshot().byId?.[id], notify: (...args) => bridge.notify(...args),
    insertReference: (id, span, paths) => {
      const reference = { source: 'whalewing-knowledge', ref: JSON.stringify(paths), label: t('citeLabel', { count: paths.length }), appearance: 'file', clipboardText: paths.join('\n') };
      const result = bridge.insertInputReference(id, { reference, span });
      if (!result.bound) throw failure(t('citeFailed'), 'session_unbound');
      if (!result.accepted) throw failure(t('citeFailed'), 'reference_rejected');
    },
  };
}
