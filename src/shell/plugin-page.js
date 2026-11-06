import { CONTROL_STYLE } from './control-style.js';

export const CORE_ROW_ID = 'include:whalewing';
export const CORE_ROW_STYLE = `li[data-plugin-row="${CORE_ROW_ID}"], section[data-plugin-rows]:has(li[data-plugin-row="${CORE_ROW_ID}"]) > div:first-child > span { display: none; }`;

/** 原生包名是身份，原生元数据是标题唯一来源；读取失败不改变功能登记事实。 */
export function createBundleTitles(ctx, { deadline = 10_000, notify = () => {} } = {}) {
  let remote, navigation, active = 0, disposed = false, generation = 0, visibility = 0, transport, timer, dirty = false;
  let state = { titles: new Map(), status: 'waiting', pending: false, navigation };
  const listeners = new Set();
  const publish = patch => { if (disposed) return; state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const fail = (request, epoch) => {
    if (disposed || !active || epoch !== generation) return;
    publish({ status: 'error' });
    if (request.notified === visibility) return;
    request.notified = visibility;
    const view = visibility, t = ctx.locale.bind('whalewingExtensions');
    notify(t('readFailed'), { kind: 'error', action: { label: t('retry'), run: () => {
      if (disposed || !active || view !== visibility) return;
      if (transport) notify(t('stillWaiting'), { kind: 'info' }); else refresh();
    } } });
  };
  function armDeadline() {
    clearTimeout(timer); timer = undefined;
    if (disposed || !active || !transport) return;
    const request = transport;
    const expire = () => {
      timer = undefined;
      if (transport !== request) return;
      request.expired = true; fail(request, generation);
    };
    // 截止归属未完成RPC，不因reset/changed重算；离开后重进也只等待剩余时间。
    const remaining = request.expiresAt - Date.now();
    if (request.expired || remaining <= 0) expire();
    else timer = setTimeout(expire, remaining);
  }
  const invalidate = () => { generation++; publish({ titles: new Map(), status: 'waiting' }); armDeadline(); };
  function refresh() {
    if (disposed || !active || !remote) return;
    if (transport) { dirty = true; armDeadline(); return; }
    dirty = false;
    const epoch = generation, source = remote;
    const request = { expiresAt: Date.now() + deadline, expired: false, notified: -1 };
    transport = request;
    publish({ titles: new Map(), status: 'loading', pending: true });
    armDeadline();
    Promise.resolve().then(() => {
      if (disposed || !active || epoch !== generation) return null;
      // 原生listBundles没有cancellation参数；截止时间只结束本地等待，不宣称取消Host。
      return source.listBundles();
    }).then(reply => {
      if (disposed || !active || epoch !== generation || request.expired) return;
      if (!reply?.ok) { fail(request, epoch); return; }
      publish({ titles: new Map(reply.value.map(bundle => [bundle.name, bundle.meta?.title])), status: 'ready' });
    }).catch(() => { if (!request.expired) fail(request, epoch); }).finally(() => {
      if (transport !== request) return;
      transport = undefined; clearTimeout(timer); timer = undefined;
      publish({ pending: false });
      // 变化只合并一轮重读；超时后的未知运输未完成前不叠加请求。
      if (dirty && active && !disposed) refresh();
    });
  }
  ctx.inject(['remote.pluginManager'], scope => {
    remote = scope.remote.pluginManager; invalidate(); refresh();
    scope.effect(() => () => { remote = undefined; invalidate(); });
  });
  ctx.inject(['pluginNavigation'], scope => {
    navigation = name => scope.pluginNavigation.openBundle(name); publish({ navigation });
    scope.effect(() => () => { navigation = undefined; publish({ navigation }); });
  });
  const update = () => { invalidate(); refresh(); };
  const offChanged = ctx.remote.$on('plugin-manager/changed', update);
  const offReset = ctx.on('connection/reset', update);
  const offLocale = ctx.locale.subscribe(() => publish({}));
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot: () => state,
    retain() {
      active++; if (active === 1) { visibility++; armDeadline(); refresh(); }
      let released = false;
      return () => { if (released) return; released = true; if (--active === 0) { visibility++; dirty = false; invalidate(); } };
    },
    retry() { if (!transport) refresh(); },
    dispose() { if (disposed) return; disposed = true; generation++; state = { ...state, navigation: undefined }; clearTimeout(timer); listeners.clear(); offChanged(); offReset(); offLocale(); },
  };
}

/** 隐藏规则随核心释放；关闭状态保留DSH原生详情，不留下脱离插件的页面改动。 */
export function registerPluginPage(ctx, workbench, React) {
  const { createElement: h, useEffect, useSyncExternalStore } = React;
  ctx.effect(() => {
    const style = document.createElement('style');
    style.textContent = CORE_ROW_STYLE; document.head.appendChild(style);
    return () => style.remove();
  });
  ctx.effect(() => ctx.locale.register('whalewingExtensions', {
    zh: { title: '扩展功能', open: '打开', waiting: '正在读取名称', failed: '名称暂未读取，暂按包名显示', retry: '重试', readFailed: '扩展名称暂未读取，请检查 DSH 连接后重试', stillWaiting: '上次读取仍在等待结果，请稍后再试' },
    en: { title: 'Extensions', open: 'Open', waiting: 'Loading names', failed: 'Names unavailable; showing package names', retry: 'Retry', readFailed: 'Extension names could not be read. Check the DSH connection and retry', stillWaiting: 'The previous request is still pending. Please try again later' },
  }));
  const titles = createBundleTitles(ctx, { notify: workbench.notify });
  ctx.effect(() => () => titles.dispose());
  const core = workbench.internal;
  function ExtensionList({ features }) {
    const state = useSyncExternalStore(titles.subscribe, titles.snapshot, titles.snapshot);
    useEffect(() => titles.retain(), []);
    const t = ctx.locale.bind('whalewingExtensions');
    return h('section', { className: 'ww-plugin-section', 'data-whalewing-extensions': true, style: { padding: 16, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12 } },
      h('style', null, CONTROL_STYLE),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, height: 28, minWidth: 0 } },
        h('h4', { style: { margin: 0, fontSize: 14 } }, t('title')),
        state.status !== 'ready' && h('small', { role: 'status', style: { color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, t(state.status === 'error' ? 'failed' : 'waiting')),
        state.status === 'error' && h('button', { type: 'button', disabled: state.pending, onClick: titles.retry }, t('retry'))),
      h('ul', { style: { listStyle: 'none', padding: 0, margin: '8px 0 0' } }, ...features.map(feature => {
        const name = feature.package;
        const title = state.titles.get(name);
        return h('li', { key: feature.id, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36 } },
          h('span', null, title === undefined ? name : ctx.locale.resolveText(title)),
          state.navigation && h('button', { type: 'button', onClick: () => titles.snapshot().navigation?.(name) }, t('open')));
      })));
  }
  function ExtensionsSection({ subject }) {
    const frame = useSyncExternalStore(core.subscribe, core.featureSnapshot, core.featureSnapshot);
    const features = frame?.features.filter(feature => feature.kind === 'extension') || [];
    return subject?.kind === 'bundle' && subject.pkg?.name === 'dsh-whalewing' && features.length ? h(ExtensionList, { features }) : null;
  }
  ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({ name: 'plugins.detail.section', id: 'whalewing-extensions', order: 20 }, ExtensionsSection));
  // 鲸翼在自己的详情页放一块检查更新，确认框开在这一页。DSH 0.2.2 起按包名从安装源装的插件，详情页上面另有 DSH 自己的“版本”区块，
  // 它把鲸翼的版本都算作预发布、更新时还会先卸载；鲸翼保留自己的更新，在这块说明一句（2026-11-06 用户定）。
  function UpdateBlock() {
    const updater = core.updater, UpdateDialog = core.UpdateDialog;
    const state = useSyncExternalStore(updater.subscribe, updater.snapshot, updater.snapshot);
    useEffect(() => { updater.detectNative?.(); }, [updater]);
    const { t } = updater, result = state.result, busy = state.phase === 'checking' || state.phase === 'installing';
    const status = state.phase === 'checking' ? t('checking') : state.phase === 'installing' ? t('installing') : state.updated ? t('updated', { version: state.updated }) : !result ? null
      : result.status === 'latest' ? t('latest', { current: result.current }) : result.status === 'available' ? t('available', { version: result.version })
        : result.status === 'needs-dsh' ? t('needsDsh', { version: result.version, requires: result.requires, runtime: result.runtimeVersion }) : result.status === 'local' ? t('local') : t('failed', { reason: result.reason });
    const dialog = state.dialog && state.owner === 'plugin-page';
    return h('section', { className: 'ww-plugin-section', 'data-whalewing-update': true, style: { padding: 16, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12 } },
      h('style', null, CONTROL_STYLE),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, minHeight: 28, minWidth: 0, flexWrap: 'wrap' } },
        h('h4', { style: { margin: 0, fontSize: 14 } }, t('title')),
        status && h('small', { role: 'status', style: { color: 'var(--dsw-alias-label-secondary)', flex: '1 1 160px', minWidth: 0 } }, status),
        h('span', { style: { display: 'flex', gap: 8, marginLeft: 'auto' } },
          result?.status === 'available' && !state.updated && h('button', { type: 'button', disabled: busy, onClick: () => updater.open('plugin-page') }, t('updateTo', { version: result.version })),
          h('button', { type: 'button', disabled: busy, onClick: () => updater.check('plugin-page') }, t('check')))),
      state.nativeVersions && !state.updated && h('p', { 'data-whalewing-update-note': true, style: { margin: '8px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)' } }, t('nativeNote')),
      dialog && core.kit?.css && h('style', null, core.kit.css),
      UpdateDialog && h(UpdateDialog, { updater, owner: 'plugin-page' }));
  }
  function UpdateSection({ subject }) {
    return subject?.kind === 'bundle' && subject.pkg?.name === 'dsh-whalewing' && core.updater ? h(UpdateBlock) : null;
  }
  ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({ name: 'plugins.detail.section', id: 'whalewing-update', order: 10 }, UpdateSection));
}
