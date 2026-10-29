import { logoFluke, logoStem, logoWave } from '../brand-mark.js';

/** 共享控件只消费React与随包图像，不持有功能状态或领域请求。 */
export function createSharedUi(React, avatars) {
  const { createElement: h, useState, useRef, useEffect } = React;
  // 鲸翼标志“鲸尾为翼”：两片尾鳍画成一对鹏翼，下面一道水纹是北冥。原图在 art/brand，图形数据在 src/brand-mark.js。
  /** tone=mono 跟随文字颜色（侧栏）；tone=brand 用品牌深蓝与天青，深色主题换浅色版。 */
  function Logo({ size = 16, tone = 'mono' }) {
    const deep = tone === 'brand' ? 'var(--ww-logo-deep, currentColor)' : 'currentColor', sky = tone === 'brand' ? 'var(--ww-logo-sky, currentColor)' : 'currentColor';
    return h('svg', { className: 'ww-logo', viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': true, focusable: 'false' },
      h('g', { fill: deep }, h('path', { d: logoFluke }), h('path', { d: logoFluke, transform: 'matrix(-1 0 0 1 64 0)' }), h('path', { d: logoStem })),
      h('path', { d: logoWave, fill: 'none', stroke: sky, strokeWidth: 3.2, strokeLinecap: 'round' }));
  }
  // 暖金来自原创专家头像的艺术配色，仅作装饰，不借用业务状态色。
  const warmArt = '#e9be65';
  function Glyph({ name, size = 16 }) {
    const paths = { folder: 'M3 6h6l2 2h10v12H3zM3 6V4h6l2 2', file: 'M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6', search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', more: 'M5 12h.01M12 12h.01M19 12h.01', spark: 'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z', chevron: 'M9 5l7 7-7 7', back: 'M15 5l-7 7 7 7', close: 'M6 6l12 12M18 6L6 18', list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01', clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', book: 'M12 6.5C10.5 5 8.3 4.5 4 4.5v14c4.3 0 6.5.5 8 2 1.5-1.5 3.7-2 8-2v-14c-4.3 0-6.5.5-8 2zM12 6.5v14', news: 'M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM16 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3', chip: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4', bot: 'M5 9h14v10H5zM12 5v4M9 13h.01M15 13h.01M9.5 16h5M12 3.5h.01', code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01', flask: 'M9 3h6M10 3v6l-5.5 9.5A1.6 1.6 0 0 0 5.9 21h12.2a1.6 1.6 0 0 0 1.4-2.5L14 9V3M7.5 15h9', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z', bookmark: 'M6 3h12v18l-6-4.5L6 21z', outline: 'M4 6h16M8 12h12M12 18h8', backlink: 'M14 4h5v16h-5M3 12h11M10 8l4 4-4 4', outlink: 'M10 4H5v16h5M10 12h11M17 8l4 4-4 4', panel: 'M4 5h16v14H4zM15 5v14' };
    // “更多”的三个点用粗笔画：原来的细笔画缩到 16px 后不到 1px，换了皮肤几乎看不见。
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: name === 'more' ? 3.6 : 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: 'ww-glyph' }, h('path', { d: paths[name] || paths.more }));
  }

  /** 低频动作借助原生 top layer，保持菜单独立于工作区滚动与裁剪。 */
  function ActionMenu({ label, children, iconOnly = false, icon = 'more' }) {
    const anchor = useRef(null);
    const surface = useRef(null);
    const [open, setOpen] = useState(false);
    useEffect(() => {
      if (!open || !surface.current) return;
      const element = surface.current;
      const place = () => { const box = anchor.current.getBoundingClientRect(); element.style.left = `${Math.max(12, Math.min(box.right - element.offsetWidth, window.innerWidth - element.offsetWidth - 12))}px`; element.style.top = `${Math.max(12, Math.min(box.bottom + 6, window.innerHeight - element.offsetHeight - 12))}px`; };
      element.showPopover(); place(); element.querySelector('button,input')?.focus();
      window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
      return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); if (element.matches(':popover-open')) element.hidePopover(); };
    }, [open]);
    return h('div', { className: 'ww-action-menu' }, h('button', { type: 'button', ref: anchor, title: label, 'aria-label': label, 'aria-expanded': open, 'aria-haspopup': 'dialog', className: iconOnly ? 'ww-icon-button' : 'ww-menu-trigger', onClick: () => setOpen(value => !value) }, h(Glyph, { name: icon }), !iconOnly && label),
      h('div', { className: 'ww-menu-surface', ref: surface, popover: 'auto', role: 'dialog', 'aria-label': label, onToggle: event => { if (event.nativeEvent.newState === 'closed') setOpen(false); }, onClick: event => { if (event.target.closest('button:not(:disabled)')) { surface.current?.hidePopover(); setOpen(false); } }, onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); surface.current.hidePopover(); setOpen(false); anchor.current.focus(); } } }, children));
  }

  /** 内置专家用原创插画头像；自定义专家未设置头像时，按名字稳定分配一个预置头像。 */
  const avatarArt = avatars || {};
  const presetAvatars = Object.keys(avatarArt).filter(id => id.startsWith('preset-'));
  const ownAvatar = id => typeof id === 'string' && Object.hasOwn(avatarArt, id) ? avatarArt[id] : undefined;
  function Avatar({ expert, size = 44 }) {
    const fallback = presetAvatars.length ? avatarArt[presetAvatars[[...(expert?.name || '小鲸')].reduce((sum, char) => sum + char.codePointAt(0), 0) % presetAvatars.length]] : undefined;
    const source = expert?.avatar || ownAvatar(expert?.id) || fallback;
    if (source) return h('img', { className: 'ww-avatar', src: source, alt: '', width: size, height: size });
    return h('span', { className: 'ww-avatar ww-avatar-letter', style: { width: size, height: size, background: warmArt }, 'aria-hidden': true }, [...(expert?.name || '金')][0]);
  }

  /** 弹层使用浏览器 top layer，避免宿主滚动容器裁剪。 */
  function Modal({ title, busy = false, onClose, className = '', children }) {
    const element = useRef(null);
    useEffect(() => {
      const previous = document.activeElement;
      element.current?.showModal();
      return () => { element.current?.close(); if (previous?.isConnected) previous.focus(); };
    }, []);
    return h('dialog', { ref: element, className: ['ww-modal ww-page', className].filter(Boolean).join(' '), 'aria-label': title, onCancel: event => { event.preventDefault(); if (!busy) onClose(); }, onClick: event => { if (event.target === event.currentTarget && !busy) onClose(); } },
      h('header', { className: 'ww-header' }, h('h2', null, title), h('button', { type: 'button', disabled: busy, onClick: onClose, 'aria-label': title }, '×')), children);
  }

  /**
   * 编辑里还有没保存的修改时，关闭（Esc、点遮罩、×、“取消”）先弹居中确认“放弃修改”；没改动直接关。
   * 返回 [请求关闭, 确认框]：确认框要和抽屉并排放（不放进抽屉里），免得 Esc 一路传到抽屉。
   */
  function useDiscard({ dirty, onClose, busy = false, message = '还有没保存的修改，关闭后这些修改会丢失。' }) {
    const [asking, setAsking] = useState(false);
    const requestClose = () => { if (busy) return; if (dirty) setAsking(true); else onClose(); };
    const dialog = asking && h(ConfirmDialog, { title: '放弃修改', message, confirmLabel: '放弃修改', cancelLabel: '取消', danger: true, onCancel: () => setAsking(false), onConfirm: () => { setAsking(false); onClose(); } });
    return [requestClose, dialog || null];
  }

  /** 编辑类表单统一用右侧抽屉：与“编辑专家”同一套样式，底部固定操作按钮。有改动时由调用方在 onClose 里先确认。 */
  function Drawer({ title, busy = false, onClose, footer, children }) {
    const element = useRef(null);
    useEffect(() => {
      const previous = document.activeElement;
      element.current?.showModal();
      return () => { element.current?.close(); if (previous?.isConnected) previous.focus(); };
    }, []);
    return h('dialog', { ref: element, className: 'ww-editor ww-page', 'aria-label': title, onCancel: event => { event.preventDefault(); if (!busy) onClose(); }, onClick: event => { if (event.target === event.currentTarget && !busy) onClose(); } },
      h('header', { className: 'ww-header' }, h('h2', null, title), h('button', { type: 'button', disabled: busy, onClick: onClose, 'aria-label': title }, '×')),
      h('div', { className: 'ww-editor-body' }, children), footer && h('footer', { className: 'ww-row' }, ...footer));
  }

  /** 确认类操作统一用居中弹窗：标题、说明、右下角“取消 + 确认”，不在页面里展开、不挤动下面的内容。 */
  function ConfirmDialog({ title, message, confirmLabel, cancelLabel, danger = false, busy = false, onConfirm, onCancel }) {
    return h(Modal, { title, busy, onClose: onCancel, className: 'ww-confirm' },
      message && h('div', { className: 'ww-confirm-body' }, message),
      h('footer', { className: 'ww-dialog-actions' }, h('button', { type: 'button', disabled: busy, onClick: onCancel }, cancelLabel),
        h('button', { type: 'button', className: danger ? 'ww-danger' : 'ww-primary', disabled: busy, onClick: onConfirm }, confirmLabel)));
  }

  /** 每个页签开头同一个页头：宋体标题、一句现状摘要、操作靠右。 */
  function PageHead({ title, summary, actions, children }) {
    return h('header', { className: 'ww-pagehead' }, h('div', null, h('h2', null, title), summary && h('p', null, summary)),
      (actions || children) && h('div', { className: 'ww-pagehead-actions' }, actions, children));
  }

  return { Glyph, Avatar, ActionMenu, Modal, ConfirmDialog, Drawer, useDiscard, Logo, PageHead, avatarArt, presetAvatars };
}
