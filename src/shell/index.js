import { createClients } from './clients.js';
import { zh, en, css, explainError } from './presentation-content.js';
import { registerPluginPage } from './plugin-page.js';
import { connectRemote } from './remote.js';
import { createWorkbenchService, createWorkbenchView } from './workbench.js';
import { startFeatures } from './features.js';
import { workbenchContract } from '../workbench-contract.js';
import { createSharedUi } from './ui.js';

/** DSH工厂只接实际使用的宿主资源；组合只接线，领域通过实际模块形成依赖闭包。 */
export function createShell(require, validator, avatars) {
  const { z, formatFileMention } = validator;
  const React = require('react');
  const { createElement: h, useRef, useState, useEffect, useSyncExternalStore } = React;
  // 取不到时提示照常显示在原处，只是弹窗开着时点不到。
  let createPortal = null;
  try { createPortal = require('react-dom').createPortal ?? null; } catch { /* 宿主没提供 react-dom。 */ }
  const NS = 'whalewing';
  const { Glyph, Avatar, ActionMenu, useClosedPopover, Modal, ConfirmDialog, Drawer, useDiscard, Logo, PageHead, avatarArt, presetAvatars } = createSharedUi(React, avatars);
  const kit = { React, loadChunk: path => require.async(path), Glyph, Avatar, ActionMenu, useClosedPopover, Modal, ConfirmDialog, Drawer, useDiscard, Logo, PageHead, z, avatarArt, presetAvatars, css, formatFileMention };
  const Workbench = createWorkbenchView({ React, css, Logo, Modal, ActionMenu });

  function registerUi(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), '鲸翼文案');
      const t = ctx.locale.bind(NS);
      const { bridge, clients, workbenchSession } = createClients(ctx, t, z, explainError);
      let toast = null;
      let toastTimer;
      let toastSeq = 0;
      const listeners = new Set();
      // 提示统一出现在右上角：成功 4 秒、失败 8 秒后自动收起；带操作按钮的提示等员工处理，给了 duration（如“撤销”）的到时收起。
      // 鼠标停在提示上或键盘焦点进到提示里时暂停计时，离开后按剩下的时间接着走，来得及点“撤销”。
      let toastLeft = 0, toastSince = 0;
      const countdown = ms => { toastLeft = ms; toastSince = Date.now(); toastTimer = setTimeout(() => publish(null), ms); };
      const publish = (message, options = {}) => {
        clearTimeout(toastTimer); toastTimer = undefined; toastLeft = 0;
        toast = message ? { id: ++toastSeq, text: String(message), kind: options.kind || 'success', action: options.action || null } : null;
        if (toast && (!toast.action || options.duration)) countdown(options.duration || (toast.kind === 'error' ? 8000 : 4000));
        for (const listener of listeners) listener();
      };
      const holdToast = () => { if (!toastTimer) return; clearTimeout(toastTimer); toastTimer = undefined; toastLeft = Math.max(0, toastLeft - (Date.now() - toastSince)); };
      const releaseToast = () => { if (toast && !toastTimer && toastLeft) countdown(Math.max(1500, toastLeft)); };
      const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
      const snapshot = () => toast;
      bridge.bindNotify(publish);
      const toastMarks = { success: '✓', error: '!', info: 'i' };
      /**
       * 弹窗、抽屉用 showModal 打开时，浏览器把弹层外面的东西都设成点不到，右上角提示也一样（看得见，点不了“重试”和“×”）。
       * 所以提示显示期间留意最上面那个还开着的模态弹层，提示放进它里面；弹层关了再回到原处。叠着几层时取文档里最后一个。
       */
      const topModal = () => [...document.querySelectorAll('dialog[open]')].filter(dialog => dialog.matches(':modal')).at(-1) || null;
      function useTopModal(active) {
        const [, redraw] = useState(0);
        // 渲染时直接定位置：提示一出现就在对的地方，不先在原处出现再挪进弹层（那样会闪一下、进场动画播两遍）。
        const host = active && createPortal ? topModal() : null;
        const shown = useRef(host);
        shown.current = host;
        useEffect(() => {
          if (!active || !createPortal) return;
          const check = () => { if (topModal() !== shown.current) redraw(value => value + 1); };
          check();
          const observer = new MutationObserver(check);
          observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
          return () => observer.disconnect();
        }, [active]);
        return host;
      }
      function Toast() {
        const value = useSyncExternalStore(subscribe, snapshot, snapshot);
        const element = useRef(null);
        const host = useTopModal(Boolean(value));
        useEffect(() => {
          const node = element.current;
          // 放进浏览器顶层：盖在编辑弹窗之上，也不受页面布局影响；每条新提示、每次换到别的弹层里都排到最上面。
          try { if (node?.matches(':popover-open')) node.hidePopover(); node?.showPopover?.(); } catch { /* 不支持顶层时按普通浮层显示。 */ }
        }, [value?.id, host]);
        if (!value) return null;
        const notice = h(React.Fragment, null, h('style', null, css), h('div', { ref: element, key: value.id, popover: 'manual', className: `ww-toast ww-toast-${value.kind}`, onMouseEnter: holdToast, onMouseLeave: releaseToast, onFocus: holdToast, onBlur: releaseToast },
          h('span', { className: 'ww-toast-mark', 'aria-hidden': true }, toastMarks[value.kind] || toastMarks.info),
          h('span', { className: 'ww-toast-text', role: value.kind === 'error' ? 'alert' : 'status' }, value.text),
          value.action && h('button', { type: 'button', className: 'ww-toast-action', onClick: () => { publish(null); return value.action.run(); } }, value.action.label),
          h('button', { type: 'button', className: 'ww-toast-close', onClick: () => publish(null), 'aria-label': t('toastClose') }, '×')));
        return host ? createPortal(notice, host) : notice;
      }
      // 标准字形作为文字标识，不维护第二套图标库或读取宿主 DOM。
      function Icon({ size }) { return h(Logo, { size }); }
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'whalewing', order: 20, locale: NS, label: () => t('panel') }, Icon));
      const workbench = createWorkbenchService(ctx, { bridge, clients, workbenchSession, t, notify: publish, ui: { ConfirmDialog, Drawer, Modal, ActionMenu, Logo }, explainError: (error, extraGuide) => extraGuide?.[error.code] || explainError(error.code, error.message).text });
      workbench.internal.kit = kit;
      ctx.provide('whalewingWorkbench', workbench);
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'whalewing', locale: NS, children: { 'whalewing.workbench.tab': { kind: 'list', scope: 'root' }, 'whalewing.workbench.dock': { kind: 'single', scope: 'root' }, 'whalewing.assistant.conversation': { kind: 'single', scope: 'session' } }, inject: () => ({ bridge, clients, workbenchSession, notify: publish, workbench }) }, Workbench));
      startFeatures(ctx, workbench);
      registerPluginPage(ctx, workbench, React);
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'whalewing-notice', locale: NS }, Toast));
      ctx.effect(() => () => { clearTimeout(toastTimer); listeners.clear(); toast = null; }, '鲸翼提示释放');
  }
  return {
    inject: ['slots', 'locale', 'remote', 'remote.commands', 'remote.session', 'remote.agentPresets', 'sessions', 'workspaces', 'uiWorkspace', 'inputTriggers'],
    apply(ctx) {
      registerUi(ctx);
      const reconnect = connectRemote(ctx, workbenchContract(z).client, () => {}, error => ctx.whalewingWorkbench.notify(error.message, { kind: 'error', action: { label: '重试连接', run: () => reconnect() } }));
    },
  };
}
