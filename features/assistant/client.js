import { registerEntries } from './entries.js';
import { registerFeature, useFeature } from '../../src/shell/feature.js';
import { createDispatchStrip, dispatchItems } from './dispatch-strip.js';

/** 助手独立持有会话、引用范围和窗口形态；只向外壳申请呈现租约。 */
const noSubscribe = () => () => {}, noSnapshot = () => null;

export function createView(kit) {
  const { React, Avatar, ActionMenu } = kit;
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } = React;
  const DispatchStrip = createDispatchStrip(React);
  function useDraggableBubble() {
    const key = 'whalewing.assistantBubble.v1';
    const [offset, setOffset] = useState(() => {
      try { const value = JSON.parse(window.localStorage.getItem(key)); if (Number.isFinite(value?.right) && Number.isFinite(value?.bottom)) return value; } catch { /* 读不到位置时用默认右下角。 */ }
      return null;
    });
    const drag = useRef(null), dragged = useRef(false), element = useRef(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    useLayoutEffect(() => {
      const node = element.current;
      if (!node) return;
      if (node.offsetWidth !== size.width || node.offsetHeight !== size.height) setSize({ width: node.offsetWidth, height: node.offsetHeight });
      // 页面不因为球拖到哪而挪动（2026-11-16 用户定）：右下角那两条横栏让出的宽度（--ww-fab-safe）是球默认位置的占地，写在样式里，不跟着拖动变。
      // 悬停时的名字条朝窗口里面那一边弹出：球拖到左半边就往右弹，免得出了窗口。
      const box = node.getBoundingClientRect?.();
      if (box && node.dataset) node.dataset.side = box.left + box.width / 2 < window.innerWidth / 2 ? 'right' : 'left';
    });
    const edge = 8;
    const clamp = (element, right, bottom) => {
      // 按整个窗口定位：AI 网页全屏时主栏会变窄，按主栏算会把按钮挤到屏幕中间。
      const box = { width: window.innerWidth, height: window.innerHeight };
      return { right: Math.round(Math.max(edge, Math.min(right, box.width - element.offsetWidth - edge))), bottom: Math.round(Math.max(edge, Math.min(bottom, box.height - element.offsetHeight - edge))) };
    };
    const save = value => { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* 位置只是个人偏好，存不下不影响使用。 */ } };
    const end = (event, keep) => {
      const active = drag.current;
      if (!active || active.id !== event.pointerId) return;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (keep && dragged.current) setOffset(value => { if (value) save(value); return value; });
    };
    const handlers = {
      ref: element,
      onPointerDown: event => {
        if (event.button !== 0) return;
        const style = window.getComputedStyle(event.currentTarget);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, right: parseFloat(style.right) || 0, bottom: parseFloat(style.bottom) || 0 };
        dragged.current = false;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: event => {
        const active = drag.current;
        if (!active || active.id !== event.pointerId) return;
        const dx = event.clientX - active.x, dy = event.clientY - active.y;
        if (!dragged.current && Math.hypot(dx, dy) < 5) return;
        dragged.current = true;
        setOffset(clamp(event.currentTarget, active.right - dx, active.bottom - dy));
      },
      onPointerUp: event => end(event, true),
      onPointerCancel: event => end(event, true),
    };
    // 拖动之后的那次 click 只结束拖动，不打开助手。
    const consumeDrag = () => { const value = dragged.current; dragged.current = false; return value; };
    // 窗口缩小时位置仍留在可见范围内：按气泡实际量到的宽高夹紧，窗口再放大时回到员工拖到的地方。
    const style = offset ? { right: `max(${edge}px, min(${offset.right}px, calc(100vw - ${size.width + edge}px)))`, bottom: `max(${edge}px, min(${offset.bottom}px, calc(100vh - ${size.height + edge}px)))` } : undefined;
    return { style, handlers, consumeDrag };
  }

  /**
   * 小鲸收起时的悬浮球（2026-11-16 用户定：气泡改成小圆球浮着，做得生动些）。
   * 球里是鲸翼的鲸尾露在水面上：平时尾巴轻轻摆、水纹慢慢流，隔一会儿漾一圈；专家手上有事时水纹漾得勤，
   * 有事等员工审批时右上角挂个数字。名字只在悬停或键盘聚焦时从球边弹出来（名字仍是按钮的读屏名和文字），平时不占地方。
   */
  function FabBall({ api, t, notify, bubble, onOpen }) {
    const snapshot = useSyncExternalStore(api.subscribeSessions ?? noSubscribe, api.sessionsSnapshot ?? noSnapshot, api.sessionsSnapshot ?? noSnapshot);
    const { active, waiting } = dispatchItems(snapshot, { archived: api.archivedSessions?.() ?? [] });
    const label = t('assistantOpen');
    const status = waiting ? t('dispatchWaitingCount', { count: waiting }) : active.length ? t('dispatchActiveCount', { count: active.length }) : '';
    return h('button', { type: 'button', className: 'ww-assistant-bubble', 'aria-label': label, 'data-state': waiting ? 'waiting' : active.length ? 'busy' : 'idle', title: [status, t('assistantDrag')].filter(Boolean).join(' · '), style: bubble.style, ...bubble.handlers,
      onClick: () => { notify(null); if (!bubble.consumeDrag()) onOpen(); } },
    h('span', { className: 'ww-fab-mark', 'aria-hidden': 'true' }),
    label,
    waiting > 0 && h('span', { className: 'ww-fab-badge', 'aria-hidden': 'true' }, waiting > 9 ? '9+' : String(waiting)));
  }

  function useFloatingAssistant(form) {
    const frame = useRef(null);
    const gesture = useRef(null);
    const [rect, setRect] = useState(null);
    const viewport = () => ({ width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) });
    const fit = value => {
      const view = viewport();
      const edge = Math.min(16, view.width / 4, view.height / 4);
      const width = Math.min(Math.max(value.width, Math.min(320, view.width - edge * 2)), view.width - edge * 2);
      const height = Math.min(Math.max(value.height, Math.min(360, view.height - edge * 2)), view.height - edge * 2);
      return { left: Math.max(edge, Math.min(value.left, view.width - width - edge)), top: Math.max(edge, Math.min(value.top, view.height - height - edge)), width, height };
    };
    const initial = () => {
      const view = viewport();
      const width = Math.round(Math.min(560, Math.max(360, view.width * 0.3))), height = Math.round(Math.min(900, Math.max(420, view.height * 0.8)));
      return fit({ left: view.width - width - 24, top: view.height - height - 24, width, height });
    };
    const finish = event => {
      const active = gesture.current;
      if (!active || (event && event.pointerId !== active.id)) return;
      gesture.current = null;
      if (active.target.hasPointerCapture(active.id)) active.target.releasePointerCapture(active.id);
    };
    useEffect(() => {
      if (form !== 'float') { finish(); return; }
      setRect(value => fit(value || initial()));
      const resized = () => { finish(); setRect(value => fit(value || initial())); };
      window.addEventListener('resize', resized);
      return () => { finish(); window.removeEventListener('resize', resized); };
    }, [form === 'float']);
    const begin = (event, direction) => {
      if (form !== 'float' || event.button !== 0 || gesture.current) return;
      if (direction === 'move' && event.target.closest('button,input,textarea,select,a')) return;
      event.preventDefault();
      const bounds = frame.current.getBoundingClientRect();
      gesture.current = { id: event.pointerId, target: event.currentTarget, direction, x: event.clientX, y: event.clientY, rect: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height } };
      event.currentTarget.setPointerCapture(event.pointerId);
    };
    const applyMotion = (direction, start, dx, dy) => {
      if (direction === 'move') { setRect(fit({ width: start.width, height: start.height, left: start.left + dx, top: start.top + dy })); return; }
      const view = viewport(), edge = Math.min(16, view.width / 4, view.height / 4);
      const minWidth = Math.min(320, view.width - edge * 2), minHeight = Math.min(360, view.height - edge * 2);
      let left = start.left, top = start.top, right = left + start.width, bottom = top + start.height;
      if (direction.includes('w')) left = Math.max(edge, Math.min(left + dx, right - minWidth));
      if (direction.includes('e')) right = Math.min(view.width - edge, Math.max(right + dx, left + minWidth));
      if (direction.includes('n')) top = Math.max(edge, Math.min(top + dy, bottom - minHeight));
      if (direction.includes('s')) bottom = Math.min(view.height - edge, Math.max(bottom + dy, top + minHeight));
      setRect({ left, top, width: right - left, height: bottom - top });
    };
    const moved = event => {
      const active = gesture.current;
      if (!active || active.id !== event.pointerId) return;
      event.preventDefault();
      applyMotion(active.direction, active.rect, event.clientX - active.x, event.clientY - active.y);
    };
    const handle = direction => ({ onPointerDown: event => begin(event, direction), onPointerMove: moved, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish, onKeyDown: event => {
      if (form !== 'float' || event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 24 : 8;
      applyMotion(direction, frame.current.getBoundingClientRect(), event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
    } });
    return { frame, style: form === 'float' && rect ? { ...rect, right: 'auto', bottom: 'auto' } : undefined, handle };
  }

  /** 分隔宽度仅属于当前工作台；容器变窄时同时给目录与正文保留空间。 */
  return function AssistantDock({ workbench, SessionProvider, renderSlot }) {
    const { api, t, notify, busy, run, operation, setError, button, row, help } = useFeature(React, workbench, 'assistant');
    const [selectedPaths, setSelectedPaths] = useState([]);
    const [contextExplicit, setContextExplicit] = useState(false);
    const [noteState, setNoteState] = useState({ path: '', dirty: false });
    const note = noteState.path ? noteState : null, dirty = noteState.dirty;
    const registry = useSyncExternalStore(api.subscribeExperts, api.experts, api.experts);
    const roleCards = registry.experts;
    // 工作区先留给内容；仅在员工主动唤起后展开，不触发会话准备。
    const [assistantForm, setAssistantForm] = useState('bubble');
    // 工作区窄到放不下停靠栏和页面时不停靠；用工作区实际宽度判断，读不到时退回按窗口宽度。
    const narrowRef = useRef(null);
    // 停靠栏至少 20rem，页面再留 26rem 才放得下；按根字号换算，跟着员工的缩放走。
    const dockLimit = () => 46 * (parseFloat(window.getComputedStyle?.(document.documentElement)?.fontSize) || 16);
    const isNarrow = () => {
      if (narrowRef.current !== null) return narrowRef.current;
      // 还没量过（刚挂上）就当场量一次工作区，量不到才按窗口宽度猜。
      const workspace = floating.frame.current?.closest?.('.ww-workspace');
      if (workspace && typeof window.ResizeObserver === 'function') return workspace.getBoundingClientRect().width < dockLimit();
      return Boolean(window.matchMedia?.('(max-width: 850px)')?.matches);
    };
    // 记住员工上次选的停靠或悬浮；从小圆球打开、或别处唤起小鲸时照这个来。
    const formKey = 'whalewing.assistantForm.v1';
    const lastOpenForm = useRef(null);
    if (lastOpenForm.current === null) { try { lastOpenForm.current = window.localStorage.getItem(formKey) === 'dock' ? 'dock' : 'float'; } catch { lastOpenForm.current = 'float'; } }
    const chooseForm = form => {
      lastOpenForm.current = form;
      try { window.localStorage.setItem(formKey, form); } catch { /* 存不下就只在这次打开里记住。 */ }
      setAssistantForm(form);
    };
    // 已经打开就不动停靠或悬浮；收着时按上次的样子打开，窄屏没地方停靠就悬浮。
    const showAssistant = () => setAssistantForm(form => form !== 'bubble' ? form : lastOpenForm.current === 'dock' && !isNarrow() ? 'dock' : 'float');
    // 进鲸翼、进哪一页小鲸都不自己打开，只留气泡，员工想用再点开（2026-11-10 用户定，取代 11-08 进专家团队页自动停靠）。
    const collapseByUser = () => setAssistantForm('bubble');
    // 专家团队页左栏已经写了谁在干什么，那一页上不再列“派出去的事”。
    const shell = useSyncExternalStore(workbench.internal.subscribe ?? noSubscribe, workbench.internal.snapshot ?? noSnapshot, workbench.internal.snapshot ?? noSnapshot);
    const floating = useFloatingAssistant(assistantForm);
    const bubble = useDraggableBubble();
    const [assistantId, setAssistantId] = useState('');
    const [assistantReference, setAssistantReference] = useState(null);
    const [assistantPresentedReady, setAssistantPresentedReady] = useState(null);
    const [previewError, setPreviewError] = useState('');
    const [previewRetry, setPreviewRetry] = useState(0);
    useEffect(() => {
      // 窄了先让出页面：停靠的收回小圆球；显式打开的悬浮窗与同一个原生会话不重建。
      const collapse = narrow => { if (narrow) setAssistantForm(value => value === 'dock' ? 'bubble' : value); };
      const workspace = floating.frame.current?.closest?.('.ww-workspace');
      const Observer = window.ResizeObserver;
      if (workspace && typeof Observer === 'function') {
        const check = () => { narrowRef.current = workspace.getBoundingClientRect().width < dockLimit(); collapse(narrowRef.current); };
        // 拉窗口时 DSH 自己的左栏会跟着收起或展开，中间有一瞬工作区特别窄；等宽度停下来再判断，免得停靠的被误收。
        let timer = null;
        const settle = () => { clearTimeout(timer); timer = setTimeout(check, 300); };
        const observer = new Observer(settle);
        observer.observe(workspace); check();
        return () => { clearTimeout(timer); observer.disconnect(); narrowRef.current = null; };
      }
      const media = window.matchMedia?.('(max-width: 850px)');
      if (!media) return undefined;
      const adapt = event => collapse(event.matches);
      adapt(media);
      media.addEventListener('change', adapt);
      return () => media.removeEventListener('change', adapt);
    }, []);
    useEffect(() => () => { assistantReference?.release(); }, [assistantReference]);
    useEffect(() => {
      let live = true;
      setAssistantPresentedReady(null);
      if (assistantReference && assistantReference.sessionId === assistantId && assistantForm !== 'bubble') {
        assistantReference.ready.then(() => { if (live) setAssistantPresentedReady(assistantReference); }, reason => { if (live) setPreviewError(reason.message || t('requestFailed')); });
      }
      return () => { live = false; };
    }, [assistantReference, assistantId, assistantForm === 'bubble', previewRetry]);
    const visibleAssistant = assistantForm !== 'bubble' && assistantPresentedReady === assistantReference && assistantReference?.sessionId === assistantId ? assistantReference : null;
    const presentation = workbench.internal.presentation;
    const presented = useSyncExternalStore(presentation.subscribe, presentation.snapshot, presentation.snapshot);
    useEffect(() => visibleAssistant ? presentation.claim('dock', visibleAssistant, 100) : undefined, [visibleAssistant, previewRetry]);
    useEffect(() => { setPreviewError(presented.error); }, [presented.error]);
    useLayoutEffect(() => workbench.internal.layout(assistantForm), [assistantForm]);
    const activePaths = contextExplicit ? selectedPaths : note ? [note.path] : [];
    // “新对话”：换成一段新的小鲸对话；原来的会话引用由上面的清理释放。
    const newConversation = () => run(async () => {
      const id = await api.newAssistant();
      operation.current.controller.signal.throwIfAborted();
      const reference = api.retain(id);
      setAssistantId(id); setAssistantReference(reference);
      return () => notify(t('assistantNewDone'));
    });
    const openAssistant = async proposal => {
      let acquired;
      try {
        await run(async () => {
          const id = await api.ensureAssistant();
          operation.current.controller.signal.throwIfAborted();
          const reference = assistantReference?.sessionId === id ? assistantReference : (acquired = api.retain(id));
          setAssistantId(id); setAssistantReference(reference); showAssistant(); acquired = undefined;
          if (typeof proposal === 'string') await api.proposeDiscussion(reference, proposal, operation.current.controller.signal);
        }, typeof proposal === 'string' ? 'draftPrepared' : undefined);
      } finally { acquired?.release(); }
    };
    // 打开小鲸就回到上次那段对话（设计“对话接着上次”）：有上次的对话直接接上，不再先停在“开始与小鲸协作”；
    // 第一次用、本机没记着上次的才显示起始页。从 DSH 别处回到鲸翼时页面会重新挂上，原来要再点一次才接上（2026-11-14 手测时看到）。
    const resumeTried = useRef(false);
    useEffect(() => {
      if (assistantForm === 'bubble' || assistantReference || resumeTried.current || !api.hasPrevious?.()) return;
      resumeTried.current = true;
      openAssistant();
    }, [assistantForm, assistantReference]);
    useEffect(() => {
      api.setAssistantContext(assistantId, activePaths);
      return () => api.setAssistantContext('', []);
    }, [assistantId, JSON.stringify(activePaths)]);
    const current = useRef(null);
    current.current = { selectedPaths, open: async (prompt, options) => { if (options?.paths) { setContextExplicit(true); setSelectedPaths(options.paths); } return openAssistant(prompt); }, setContext: paths => { setContextExplicit(true); setSelectedPaths(paths); }, currentNote: (path, dirty) => setNoteState(value => value.path === path && value.dirty === dirty ? value : { path, dirty }) };
    useLayoutEffect(() => workbench.internal.bindAssistant({ get selectedPaths() { return current.current.selectedPaths; }, open: (...args) => current.current.open(...args), setContext: paths => current.current.setContext(paths), currentNote: (...args) => current.current.currentNote(...args) }), []);
    useLayoutEffect(() => { workbench.internal.assistantChanged(); }, [selectedPaths, contextExplicit]);
    const assistant = h('aside', { ref: floating.frame, style: floating.style, className: `ww-assistant ww-assistant-${assistantForm}`, 'aria-label': t('question'), hidden: assistantForm === 'bubble' },
      h('header', { className: 'ww-assistant-header', ...floating.handle('move'), tabIndex: assistantForm === 'float' ? 0 : undefined, title: assistantForm === 'float' ? t('assistantMove') : undefined }, h(Avatar, { expert: roleCards.find(role => role.id === 'manager'), size: 32 }), h('div', null, h('h2', null, t('question')), h('small', null, t('assistantTagline'))), ActionMenu && h(ActionMenu, { label: t('assistantMenu'), iconOnly: true }, button('assistantDetail', () => api.showExpertDetail?.('manager', 'overview')), button('assistantEdit', () => api.showExpertDetail?.('manager', 'edit')), roleCards.find(role => role.id === 'manager')?.customized?.length > 0 && button('assistantReset', () => api.showExpertDetail?.('manager', 'reset'))), button('assistantMinimize', collapseByUser, false, { className: 'ww-assistant-minimize', 'aria-label': t('assistantMinimize'), title: t('assistantMinimize') })),
      assistantForm === 'float' && ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map(direction => h('div', { key: direction, className: `ww-resize ww-resize-${direction}`, role: 'button', tabIndex: 0, 'aria-label': `${t('assistantResize')} · ${t(`resize_${direction}`)}`, ...floating.handle(direction) })),
      h('div', { className: 'ww-row ww-assistant-tools' }, button(assistantForm === 'float' ? 'assistantDock' : 'assistantFloat', () => chooseForm(assistantForm === 'float' ? 'dock' : 'float')), assistantId && button('assistantNew', newConversation), assistantId && button('assistantHistory', () => api.open(assistantId))),
      previewError && h('div', { className: 'ww-notice ww-error', role: 'alert' }, previewError, button('assistantPreviewRetry', () => setPreviewRetry(value => value + 1))),
      !roleCards.some(role => role.id === 'manager') ? h('p', { className: 'ww-notice' }, t('assistantMissing')) : h(React.Fragment, null,
        h('details', { className: 'ww-assistant-context', open: Boolean(activePaths.length) }, h('summary', null, activePaths.length ? `${t('noteScope')} · ${activePaths.length}` : t('generalScope')),
          h('ul', null, ...activePaths.map(name => h('li', { key: name }, name.split('/').at(-1)))),
          row(button('askCurrent', () => { setContextExplicit(true); setSelectedPaths([note.path]); }, !note || dirty), button('clearSelection', () => { setContextExplicit(true); setSelectedPaths([]); })),
          help('citeHelp')),
        // “打开”“去审批”和对话里的派工卡片一样，回到专家团队页、在中间那栏打开那件任务（不属于在用专家的，专家团队页会改在主区打开）。
        assistantReference && shell?.tab !== 'experts' && h(DispatchStrip, { api, t, openTask: id => { try { api.checkSession(id); if (api.showTask) api.showTask(id); else api.open(id); } catch (error) { api.notify(error.message, { kind: 'error' }); } } }),
        assistantReference ? h('div', { className: 'ww-assistant-conversation' }, h(SessionProvider, { session: assistantReference }, renderSlot('whalewing.assistant.conversation', {}))) : h('div', { className: 'ww-assistant-welcome' }, h(Avatar, { expert: roleCards.find(role => role.id === 'manager'), size: 72 }), h('h3', null, t('question')), help('questionHelp'), button('assistantStart', openAssistant, false, { className: 'ww-primary' }))));
    return h(React.Fragment, null, assistant,
      assistantForm === 'bubble' && h(FabBall, { api, t, notify, bubble, onOpen: showAssistant }));
  };
}

export const name = 'whalewing-assistant';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'assistant', createView, { entries: registerEntries, dependencies: ['remote.whalewingExperts'], requires: ['experts'] }); }
