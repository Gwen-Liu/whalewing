/**
 * 检查更新与原地更新。检查问鲸翼宿主（读 npm 版本、按 DSH 的兼容判断挑版本）；更新交给 DSH 插件管理器，
 * 装的是新版本的安装包地址：DSH 不按包名拦它，装好后原地换成新版，不卸载，重启 DSH 生效；装失败 DSH 自己还原配置。
 * 只在员工点“检查更新”时联网；从哪里点的（鲸翼页头或 DSH 插件详情页），确认弹窗就开在哪里。
 * DSH 0.2.2 起按包名装的插件，详情页还有 DSH 自己的“版本”区块。它只把正式版当作可更新，鲸翼的版本号（DSH 版本加序号）
 * 都算预发布，所以那块对鲸翼一直显示“没有可直接安装的新版本”；它的更新还会先卸掉正在运行的鲸翼再装。2026-11-06 用户定：
 * 保留鲸翼自己的更新（不卸载、不删员工已有的东西），只在详情页鲸翼这块说明一句。
 */
export const UPDATE_LOCALE = {
  zh: {
    check: '检查更新', checking: '正在检查更新…', title: '更新', dialogTitle: '更新鲸翼',
    latest: '已是最新版本 {current}', available: '有新版本 {version}', updateTo: '更新到 {version}', updated: '已装好 {version}，重启 DSH 后生效',
    needsDsh: '新版本 {version} 需要 DSH {requires}，当前 DSH 是 {runtime}，请先升级 DSH', local: '这份鲸翼是从本机目录装的（开发用），请在开发目录里更新',
    failed: '检查更新没有问到安装源：{reason}', unreachable: '检查更新暂未完成：{reason}', retry: '重试',
    summary: '当前版本 {current}，新版本 {version}（适配 DSH {requires}）。', keep: '不用卸载，专家、知识库、资讯和各项设置都保留；装好后重启 DSH 生效。',
    notes: '查看更新内容', cancel: '取消', update: '更新', installing: '正在下载并安装新版本…', stop: '停止',
    stopped: '已停止更新，鲸翼仍是 {current}', done: '已更新到 {version}，重启 DSH 后生效', installFailed: '更新没有完成，鲸翼仍是 {current}：{reason}',
    unknown: '没有收到 DSH 的安装结果，请到「插件」页看鲸翼的版本',
    nativeNote: '上面 DSH 的「版本」只把正式版当作可更新，鲸翼的版本都算预发布，它不会提示鲸翼有新版本。请在这里检查更新：不卸载鲸翼，专家、知识库和各项设置都保留。',
  },
  en: {
    check: 'Check for updates', checking: 'Checking for updates…', title: 'Updates', dialogTitle: 'Update WhaleWing',
    latest: 'Up to date ({current})', available: 'Version {version} is available', updateTo: 'Update to {version}', updated: '{version} installed; restart DSH to use it',
    needsDsh: 'Version {version} needs DSH {requires}; this DSH is {runtime}. Update DSH first', local: 'This WhaleWing was installed from a local folder (development); update it in that folder',
    failed: 'No install source answered: {reason}', unreachable: 'Update check did not finish: {reason}', retry: 'Retry',
    summary: 'Current version {current}; new version {version} (for DSH {requires}).', keep: 'No uninstall needed. Experts, knowledge, news and settings are kept. Restart DSH after the update.',
    notes: 'What\'s new', cancel: 'Cancel', update: 'Update', installing: 'Downloading and installing…', stop: 'Stop',
    stopped: 'Update stopped; WhaleWing is still {current}', done: 'Updated to {version}; restart DSH to use it', installFailed: 'Update did not finish; WhaleWing is still {current}: {reason}',
    unknown: 'DSH did not report the install result. Check the WhaleWing version on the Plugins page',
    nativeNote: 'The Versions section above only offers stable releases. Every WhaleWing version counts as a prerelease, so it will not offer WhaleWing updates. Check for updates here: WhaleWing is not uninstalled and your experts, knowledge and settings stay.',
  },
};

const fill = (text, values) => String(text).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

/** DSH 安装失败的归因，按它的错误码说成员工看得懂的一句。 */
export function installReason(value) {
  const code = value?.error?.code, kind = value?.packageResult?.kind;
  if (value?.failedAt === 'spec-host') return '下载地址连不上';
  if (value?.failedAt === 'registry') return '安装源连不上';
  if (code === 'incompatible-version') return '新版本和当前 DSH 不兼容';
  if (kind === 'disk-full' || kind === 'no-space') return '磁盘空间不足';
  if (kind === 'timeout') return '安装等待超时';
  return value?.error?.diagnostic || code || kind || '原因未知';
}

export function createUpdater(ctx, { notify, deadline = 30_000 }) {
  const t = (key, values = {}) => fill(ctx.locale.bind('whalewingUpdate')(key), values);
  let workbench, manager, disposed = false, request;
  // nativeVersions：DSH 详情页会不会显示它自己的“版本”区块（按包名装的才有），只读插件列表、不联网。
  let state = { phase: 'idle', owner: null, result: null, dialog: false, error: null, updated: null, nativeVersions: false };
  let detecting = false;
  const listeners = new Set();
  const publish = patch => { if (disposed) return; state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  ctx.inject(['remote.whalewingWorkbench'], scope => { workbench = scope.remote.whalewingWorkbench; scope.effect(() => () => { workbench = undefined; }); });
  ctx.inject(['remote.pluginManager'], scope => { manager = scope.remote.pluginManager; scope.effect(() => () => { manager = undefined; }); });
  const bounded = promise => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待超时')), deadline);
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });

  async function check(owner = 'workbench') {
    if (state.phase === 'checking' || state.phase === 'installing') return;
    publish({ phase: 'checking', owner, error: null, dialog: false });
    let reply;
    try {
      if (!workbench) throw new Error('鲸翼还没连上 DSH');
      reply = await bounded(workbench.checkUpdate());
      if (!reply?.ok) throw new Error(reply?.error?.message || '鲸翼没有回复');
    } catch (error) {
      publish({ phase: 'idle' });
      notify(t('unreachable', { reason: error?.message || String(error) }), { kind: 'error', action: { label: t('retry'), run: () => check(owner) } });
      return;
    }
    const result = reply.value;
    publish({ phase: 'idle', result, dialog: result.status === 'available' });
    if (result.status === 'latest') notify(t('latest', { current: result.current }), { kind: 'success' });
    else if (result.status === 'needs-dsh') notify(t('needsDsh', { version: result.version, requires: result.requires, runtime: result.runtimeVersion }), { kind: 'info', duration: 8000 });
    else if (result.status === 'local') notify(t('local'), { kind: 'info', duration: 8000 });
    else if (result.status === 'failed') notify(t('failed', { reason: result.reason }), { kind: 'error', action: { label: t('retry'), run: () => check(owner) } });
  }

  async function install() {
    const result = state.result;
    if (state.phase === 'installing' || result?.status !== 'available') return;
    if (!manager) { publish({ error: '鲸翼还没连上 DSH 插件管理器' }); return; }
    publish({ phase: 'installing', error: null });
    // 先装作答安装源给的安装包地址；下载地址连不上时换别的安装源的同一版本。
    const specs = [result.tarball, ...(result.fallbacks || [])];
    for (const [index, spec] of specs.entries()) {
      const requestId = `whalewing-update-${Date.now()}-${index}`;
      request = requestId;
      let reply;
      try { reply = await manager.installBundle(spec, { enabled: true, requestId, ...(result.registry ? { registry: result.registry } : {}) }); } catch (error) { reply = { ok: false, error }; }
      if (disposed) return;
      request = undefined;
      if (!reply?.ok) {
        // 回复丢了：DSH 可能还在装，按同一个请求等它的结果。
        const waited = await Promise.resolve().then(() => manager?.waitForInstall?.(requestId)).catch(() => undefined);
        if (waited?.ok && waited.value) reply = waited;
        else { publish({ phase: 'idle', error: t('unknown') }); return; }
      }
      const value = reply.value;
      if (value.application === 'applied' || value.application === 'restart-required') {
        publish({ phase: 'idle', dialog: false, updated: value.version || result.version });
        notify(t('done', { version: value.version || result.version }), { kind: 'success', duration: 10_000 });
        return;
      }
      if (value.application === 'cancelled') {
        publish({ phase: 'idle', dialog: false });
        notify(t('stopped', { current: result.current }), { kind: 'info' });
        return;
      }
      if (value.failedAt === 'spec-host' && index < specs.length - 1) continue;
      publish({ phase: 'idle', error: t('installFailed', { current: result.current, reason: installReason(value) }) });
      return;
    }
  }

  /** 打开详情页时读一次 DSH 插件列表里鲸翼的 updatable：为真时 DSH 会显示它自己的“版本”区块。读不到就当没有，不报错。 */
  async function detectNative() {
    if (detecting || !manager) return;
    detecting = true;
    try {
      const reply = await bounded(manager.listBundles());
      const entry = reply?.ok && Array.isArray(reply.value) ? reply.value.find(bundle => bundle?.name === 'dsh-whalewing') : undefined;
      publish({ nativeVersions: entry?.updatable === true });
    } catch { /* 只影响说明文字。 */ } finally { detecting = false; }
  }

  async function stop() {
    if (state.phase !== 'installing' || !request || !manager) return;
    try { await manager.cancelInstall(request); } catch { /* 结果仍以 installBundle 的回复为准。 */ }
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot: () => state,
    check, install, stop, detectNative,
    open(owner = state.owner) { if (state.result?.status === 'available' && state.phase !== 'installing') publish({ dialog: true, owner, error: null }); },
    close() { if (state.phase !== 'installing') publish({ dialog: false, error: null }); },
    t,
    dispose() { disposed = true; listeners.clear(); },
  };
}

/** 居中确认框：写清当前和新版本、不卸载、重启生效；装的时候能停止，失败写原因并可重试。 */
export function createUpdateDialog({ React, Modal }) {
  const { createElement: h, useSyncExternalStore } = React;
  return function UpdateDialog({ updater, owner }) {
    const state = useSyncExternalStore(updater.subscribe, updater.snapshot, updater.snapshot);
    if (!state.dialog || state.owner !== owner || state.result?.status !== 'available') return null;
    const { t } = updater, result = state.result, installing = state.phase === 'installing';
    return h(Modal, { title: t('dialogTitle'), busy: installing, onClose: updater.close, className: 'ww-confirm ww-update-dialog' },
      h('div', { className: 'ww-confirm-body' },
        h('p', null, t('summary', { current: result.current, version: result.version, requires: result.requires || result.runtimeVersion })),
        h('p', null, t('keep')),
        result.releaseUrl && h('p', null, h('a', { href: result.releaseUrl, target: '_blank', rel: 'noreferrer' }, t('notes'))),
        installing && h('p', { role: 'status' }, h('span', { className: 'ww-spinner', 'aria-hidden': true }), ' ', t('installing')),
        state.error && h('p', { role: 'alert', className: 'ww-error-text' }, state.error)),
      h('footer', { className: 'ww-dialog-actions' },
        installing ? h('button', { type: 'button', onClick: updater.stop }, t('stop')) : h('button', { type: 'button', onClick: updater.close }, t('cancel')),
        h('button', { type: 'button', className: 'ww-primary', disabled: installing, onClick: updater.install }, state.error ? t('retry') : t('update'))));
  };
}
