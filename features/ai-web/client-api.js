import { aiWebEntries, aiWebGuide } from './catalog.js';
import { aiWebContract } from './contract.js';
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createAiWebClient(bridge, t, z, workbenchSession, knowledge) {
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
    async function openBrowser(url, sessionId, key, { split = false } = {}) {
      const sidebar = requireBrowser();
      if (!sessionId || sidebar.mounted?.getSnapshot() !== sessionId) throw new Error(t('browserMissing'));
      const tabs = () => typeof sidebar.tabsIn === 'function' ? sidebar.tabsIn(sessionId).filter(tab => tab?.kind === 'browser') : [];
      const known = key && aiTabs.read()[sessionId]?.[key];
      // 同一个 AI 只占一个网页标签：已经开着就切回去，员工在里面的对话和登录都还在。
      if (known && typeof sidebar.focus === 'function' && tabs().some(tab => tab.id === known)) { sidebar.focus(known); return; }
      const before = new Set(tabs().map(tab => tab.id));
      sidebar.openTab('browser', split ? { params: { url }, preferNewPane: true } : { params: { url } });
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
    const waitMounted = async id => {
      const sidebar = requireBrowser();
      for (const deadline = Date.now() + 10000; sidebar.mounted?.getSnapshot() !== id;) {
        if (Date.now() > deadline) throw new Error(t('browserMissing'));
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return sidebar;
    };
    // 会话刚切到前台时右栏面板还没就绪，openTab 会报“没有挂载的会话面板”，稍等重试。
    const openRetrying = async (url, id, key, options) => {
      for (const deadline = Date.now() + 10000; ;) {
        try { await openBrowser(url, id, key, options); return; }
        catch (error) {
          if (!/no session surface/.test(String(error?.message)) || Date.now() > deadline) throw error;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    };
    async function openAiInConversation(url, key, signal) {
      requireBrowser();
      const id = await ensureAiWebSession(signal);
      signal?.throwIfAborted();
      // 切到会话后工作台页面会卸载，后续步骤不再跟随页面的取消信号。
      bridge.open(id);
      try {
        const sidebar = await waitMounted(id);
        if (url !== undefined) await openRetrying(url, id, key);
        if (url !== undefined && key) rememberAiInConversation(id, key);
        watchAiTabs();
        if (typeof sidebar.isExpanded === 'function' && !sidebar.isExpanded()) sidebar.toggleExpanded?.();
      } catch (error) { bridge.notify(error.message, { kind: 'error' }); throw error; }
    }

    /** 一问多发（原版 DSH）：切到「AI 网页」会话，依次打开这几家；第二家要求新开一栏，窗口够宽时两家并排。 */
    async function openManyInConversation(entries, signal) {
      requireBrowser();
      const id = await ensureAiWebSession(signal);
      signal?.throwIfAborted();
      // 切到会话后工作台页面会卸载，后续步骤不再跟随页面的取消信号。
      bridge.open(id);
      try {
        const sidebar = await waitMounted(id);
        for (const [index, entry] of entries.entries()) await openRetrying(entry.url, id, entry.id, { split: index === 1 });
        if (entries[0]) rememberAiInConversation(id, entries[0].id);
        watchAiTabs();
        if (typeof sidebar.isExpanded === 'function' && !sidebar.isExpanded()) sidebar.toggleExpanded?.();
      } catch (error) { bridge.notify(error.message, { kind: 'error' }); throw error; }
    }

    // —— 提问台和带回来（2026-11-13）——
    // 鲸翼和网页之间只有剪贴板这一条路：不替员工在网页里输入，也读不到网页里的内容。
    const askKey = `${NS}:aiweb-ask:${origin}`, asksKey = `${NS}:aiweb-asks:${origin}`;
    const readJson = (key, fallback) => { try { return JSON.parse(window.localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
    const writeJson = (key, value) => { try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
    const today = () => { const now = new Date(), two = value => String(value).padStart(2, '0'); return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`; };
    const needKnowledge = () => { if (typeof knowledge !== 'function') throw failure('知识积累还没连上，请稍后重试', 'knowledge_missing'); return knowledge; };
    async function copyText(text) {
      try { await globalThis.navigator.clipboard.writeText(text); return; } catch { /* DSH 没放行时用老办法。 */ }
      let copied = false;
      try {
        const area = document.createElement('textarea');
        area.value = text; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(area); area.select();
        copied = document.execCommand('copy'); area.remove();
      } catch { copied = false; }
      if (!copied) throw failure('没能放进剪贴板（DSH 或系统没放行）。请点“看一眼要发的内容”，在里面全选后自己复制', 'clipboard_denied');
    }
    /** 读不了剪贴板时返回空串，由界面改成“在这里按 Ctrl V”。 */
    async function readClipboard() { try { return String(await globalThis.navigator.clipboard.readText() || ''); } catch { return ''; } }
    /** 《关于我》的正文；没有这篇或是空的时说清去哪写。 */
    async function loadBackground(signal) {
      let note;
      try { note = await needKnowledge()({ action: 'read', path: aboutMePath }, signal); }
      catch (error) { if (error?.code === 'knowledge_missing') throw error; throw failure(`知识积累里没读到《关于我》（${aboutMePath}）。先去知识积累把它写上，再回来勾“我的背景”`, 'background_missing'); }
      const body = noteBody(note.content).slice(0, askLimits.background);
      if (!body) throw failure('《关于我》还是空的。先去知识积累写几句，再回来勾“我的背景”', 'background_empty');
      return body;
    }
    /** 挑笔记用的清单：有关键词时搜，没有时列最近建的。 */
    async function findNotes(query, signal) {
      const words = String(query || '').trim();
      if (words) return (await needKnowledge()({ action: 'search', query: words.slice(0, 200) }, signal)).notes.slice(0, 30).map(note => ({ path: note.path, title: note.title }));
      const overview = await needKnowledge()({ action: 'overview' }, signal);
      return overview.notes.filter(note => !/^(?:00-系统|90-归档)\//.test(note.path)).sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 30).map(note => ({ path: note.path, title: note.title }));
    }
    async function loadNotes(paths, signal) {
      const notes = [];
      for (const path of paths.slice(0, askLimits.notes)) {
        const note = await needKnowledge()({ action: 'read', path }, signal);
        notes.push({ path, title: path.split('/').pop().replace(/\.md$/i, ''), content: noteBody(note.content).slice(0, askLimits.note) });
      }
      return notes;
    }
    /** 最近发出去的那一问，12 小时内有效；贴回答时用它起名字、写“问的什么”。 */
    function currentAsk() {
      const ask = readJson(askKey, null);
      return ask && typeof ask.text === 'string' && Date.now() - Number(ask.at) < 12 * 3600 * 1000 ? ask : null;
    }
    /** 发出去：全部内容放进剪贴板，记下这一问，再依次打开这几家。打开由调用方给（原版和宿主适配版走法不同）。 */
    async function sendAsk({ entries, question, text, background = false, notes = [] }, openMany, signal) {
      await copyText(text);
      writeJson(askKey, { question, text, entries: entries.map(entry => entry.id), background, notes, at: Date.now(), notePath: '' });
      await openMany(entries, signal);
    }
    /** 常用问法只是本机偏好：存不下时照常用，只是下次没有。 */
    const savedAsks = () => { const list = readJson(asksKey, []); return Array.isArray(list) ? list.filter(item => item && typeof item.name === 'string') : []; };
    const saveAsks = list => writeJson(asksKey, list.slice(0, 30));
    /**
     * 把员工自己复制的一段回答存进知识积累的收件箱。同一问的回答接着存进同一篇；那篇被删或挪走了就另建。
     * 只写员工贴进来的文字，不读网页、不存对话。
     */
    async function saveAnswer({ text, entry, ask }, signal) {
      const body = String(text || '').trim();
      if (!body) throw failure('还没有内容。先在网页里复制要留的回答', 'answer_empty');
      const write = needKnowledge(), date = today();
      const section = answerSection({ name: entry?.name || '网页 AI', url: entry?.url || '', date, text: body });
      if (ask?.notePath) {
        try {
          const note = await write({ action: 'read', path: ask.notePath }, signal);
          const saved = await write({ action: 'write', path: note.path, content: `${note.content.replace(/\s*$/, '')}\n\n${section}`, expectedHash: note.hash }, signal);
          return { path: saved.path, name: saved.path.split('/').pop().replace(/\.md$/i, ''), appended: true };
        } catch (error) { if (signal?.aborted) throw error; /* 原来那篇不在了或刚被改过，另建一篇。 */ }
      }
      const base = answerNoteName(ask?.question, date);
      for (let attempt = 1; attempt <= 9; attempt++) {
        const name = attempt === 1 ? base : `${base} ${attempt}`;
        try {
          const saved = await write({ action: 'write', path: `10-收件箱/${name}.md`, content: answerNote({ name, question: ask?.question || '', date, section }), expectedHash: '' }, signal);
          const stored = readJson(askKey, null);
          if (ask && stored && stored.at === ask.at) writeJson(askKey, { ...stored, notePath: saved.path });
          return { path: saved.path, name, appended: false };
        } catch (error) { if (error?.code !== 'CONFLICT') throw error; }
      }
      throw failure('收件箱里同名的笔记太多了，请先去知识积累整理一下', 'answer_name_taken');
    }

  return {
    openManyInConversation, copyText, readClipboard, loadBackground, findNotes, loadNotes, currentAsk, sendAsk, savedAsks, saveAsks, saveAnswer, openEntries,
    showKnowledge: () => bridge.showWorkbench?.('knowledge'), notify: (...args) => bridge.notify(...args),
    aiWebRequest, openBrowser, openAiInConversation, currentAiInConversation, subscribeTabs, tabsSnapshot, aiWebSessionId, watchAiTabs,
    backToWorkbench: () => bridge.showWorkbench?.('ai-web'), retain: bridge.retain,
    supportsInlinePresentation: bridge.canFocusPresentation, browserAvailable: bridge.browserAvailable, browserMounted: bridge.browserMounted,
    ensureWorkbench: workbenchSession.ensureWorkbench,
  };
}

export function findAiWebEntries(query = '', entries = aiWebEntries) {
  const words = String(query).trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  // 内置入口连同它的拿手戏一起搜（一句总的，加各场景下的）。
  const guide = entry => { const value = entry.builtin ? aiWebGuide[entry.id] : undefined; return value ? `${value.line ?? ''} ${Object.values(value.scenes ?? {}).join(' ')}` : ''; };
  return entries.filter(entry => words.every(word => `${entry.name} ${entry.provider} ${entry.description} ${entry.keywords} ${guide(entry)}`.toLocaleLowerCase().includes(word)));
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

/** 提问台带出去的东西有上限：网页输入框放不下太长的内容。 */
export const askLimits = Object.freeze({ background: 6000, note: 8000, notes: 5, entries: 4 });
export const aboutMePath = '30-领域/个人管理/关于我.md';

/** 笔记带出去之前去掉最前面的属性块，只留正文。 */
export function noteBody(markdown = '') { return String(markdown).replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '').trim(); }

/** 把问题、背景和笔记拼成要带过去的一段文字；只有问题时原样返回，不加小标题。 */
export function composeAiAsk({ question = '', background = '', notes = [] } = {}) {
  const ask = String(question).trim(), about = String(background).trim();
  const used = notes.filter(note => note && String(note.content || '').trim());
  if (!about && !used.length) return ask;
  const parts = [];
  if (about) parts.push(`【我的背景】\n${about}`);
  if (used.length) parts.push(`【参考笔记】\n${used.map(note => `《${note.title}》\n${String(note.content).trim()}`).join('\n\n')}`);
  parts.push(`【问题】\n${ask}`);
  return parts.join('\n\n');
}

/** 回答存成笔记时的名字：取问题第一行，去掉文件名里不能有的字符；没带问题时用日期。 */
export function answerNoteName(question = '', date = '') {
  const line = String(question).split(/\r?\n/).map(value => value.trim()).find(Boolean) || '';
  const name = line.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30).replace(/[. ]+$/, '');
  return name || `${date} 网页 AI 的回答`;
}

/** 一段回答：哪家答的、哪天贴回的、原文。 */
export function answerSection({ name, url, date, text }) {
  return `## ${name} 的回答\n\n来源：${name} 网页${url ? `（${url}）` : ''}，${date} 贴回\n\n${String(text).trim()}\n`;
}

/** 收件箱里的新笔记：属性照知识积累新建笔记的写法，正文先写问的什么，再接回答。 */
export function answerNote({ name, question, date, section }) {
  const asked = String(question).trim();
  const quote = asked ? `问的：\n\n${asked.split(/\r?\n/).map(line => `> ${line}`).join('\n')}\n\n` : '';
  return `---\ntype: capture\nstatus: inbox\ncreated: ${date}\nupdated: ${date}\naliases: []\n---\n\n# ${name}\n\n${quote}${section}`;
}
