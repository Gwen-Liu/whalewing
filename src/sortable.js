/**
 * 拖动换位置（2026-11-13，全产品共用）：一排或一列小块，每块上一个拖动手柄（六个小点），按住手柄拖到哪就放到哪；
 * 拖着的那一块浮起来跟着指针走，别的小块随时让位。用户定的：不用“上移 / 下移”“← / →”这种一格一格挪的按钮。
 * 页头“钉在页头的”一排、办公工坊的多文件列表和页面整理的缩略图都用这一套；别的地方要让员工调顺序也用它，不另写。
 * 样式（手柄 ww-grip、拖着的那一块 data-dragging、拖动中的容器 data-sorting）在 src/shell/theme-presentation.js。
 */

/**
 * 指针落在别的小块上时，被拖的那个该排到第几个（从 0 数）：
 * 一排（axis 'x'，窄了会折成几行）看左右，落在它左半边插到它前面、右半边插到它后面；一列（axis 'y'）看上下。
 * boxes 是除了被拖的那个以外、按现在顺序排的各小块的位置；指针没落在任何小块上返回 -1（不动）。
 * 落在紧挨着的那一块的近半边时，算出来就是它现在的位置，所以不会来回跳。
 */
export function dropIndex(boxes, x, y, axis = 'x') {
  const at = boxes.findIndex(box => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
  if (at < 0) return -1;
  const box = boxes[at];
  return (axis === 'y' ? y > (box.top + box.bottom) / 2 : x > (box.left + box.right) / 2) ? at + 1 : at;
}

/** 把数组里第 from 个挪到第 to 个（按挪走以后的位置算）；位置没变或下标不对时原样返回同一个数组。 */
export function moveItem(list, from, to) {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const next = list.slice(), [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 拖动手柄上的图标：六个小点。笔画加粗，缩小了、换了皮肤也看得见。 */
export const gripIcon = (h, size = 14) => h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', 'aria-hidden': true, className: 'ww-glyph' },
  h('path', { d: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01' }));

export function createSortable(React) {
  const { createElement: h, useRef, useState } = React;
  // 每次重新画完都要跑一遍（把拖着的那一块对回指针下面、把焦点放回手柄），所以给一个每次都不同的依赖。
  const afterRender = React.useLayoutEffect || React.useEffect;
  /**
   * order：现在的顺序，一组互不相同的标识（字符串或数字）。axis：'x' 一排、'y' 一列。disabled：这时候不许拖（比如正在处理）。
   * move(key, index)：把 key 排到第 index 个（从 0 数，已经确认和现在不一样）。拖的过程中每越过一块就叫一次，调用方立即改顺序。
   * 返回：
   *   list            加在这一排的容器上的属性（ref 和拖动中的标记）；
   *   item(key)       加在每个小块上的属性；
   *   grip(key, { label, title })  这个小块的拖动手柄：按住开始拖；焦点在它上面时按方向键一次挪一位；
   *   start(event, key)  小块上别的地方也想当抓手时（比如缩略图本身），在它的 onPointerDown 里调用；
   *   dragging        正拖着的标识，没有在拖是 null。
   */
  return function useSortable({ order, move, axis = 'x', disabled = false }) {
    const container = useRef(null), drag = useRef(null), refocus = useRef(null), latest = useRef(null);
    const [dragging, setDragging] = useState(null);
    latest.current = { order: order.map(String), move, disabled };
    const elements = () => typeof container.current?.querySelectorAll === 'function' ? [...container.current.querySelectorAll('[data-sort-key]')] : [];
    const find = key => elements().find(element => element.dataset.sortKey === String(key));
    // 换好位置以后被拖的那一块已经在新格子里了，所以每次指针动、每次重新画完，都按它现在的格子重算偏移，让它一直在指针下面。
    const follow = () => {
      const current = drag.current, element = current && find(current.key);
      if (!element) return;
      element.style.transform = '';
      const box = element.getBoundingClientRect();
      element.style.transform = `translate(${Math.round(current.x - current.offsetX - box.left)}px,${Math.round(current.y - current.offsetY - box.top)}px)`;
    };
    afterRender(() => {
      follow();
      // 换位置时浏览器会把这一块从页面上拿下来再放回去，焦点会丢；用键盘挪的要放回原来的手柄上，才能接着按。
      if (refocus.current !== null) { find(refocus.current)?.querySelector('[data-sort-grip]')?.focus(); refocus.current = null; }
    }, [{}]);
    // 这一排从页面上撤下时（比如面板关了）还在拖：收掉挂在窗口上的监听。
    React.useEffect(() => () => drag.current?.stop(), []);
    const start = (event, key) => {
      const element = find(key);
      if (latest.current.disabled || latest.current.order.length < 2 || event.button > 0 || drag.current || !element) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      // 拖的过程挂在窗口上听：小块在页面里换了位置、指针拖出这一排，都不会断。
      const onMove = moved => {
        const current = drag.current;
        if (!current) return;
        current.x = moved.clientX; current.y = moved.clientY;
        const others = elements().filter(item => item.dataset.sortKey !== String(key)).map(item => item.getBoundingClientRect());
        const target = dropIndex(others, moved.clientX, moved.clientY, axis);
        if (target >= 0 && target !== latest.current.order.indexOf(String(key))) latest.current.move(key, target);
        follow();
      };
      const stop = () => {
        window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop);
        const dropped = find(key);
        if (dropped) dropped.style.transform = '';
        drag.current = null; setDragging(null);
      };
      drag.current = { key, x: event.clientX, y: event.clientY, offsetX: event.clientX - box.left, offsetY: event.clientY - box.top, stop };
      setDragging(key);
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
    };
    const step = (key, delta) => {
      const { order: keys, move: apply, disabled: locked } = latest.current, to = keys.indexOf(String(key)) + delta;
      if (locked || !keys.includes(String(key)) || to < 0 || to >= keys.length) return;
      refocus.current = key; apply(key, to);
    };
    const onKeyDown = (event, key) => {
      const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
      if (!delta) return;
      event.preventDefault(); step(key, delta);
    };
    const held = key => dragging !== null && String(dragging) === String(key);
    return {
      dragging, start,
      list: { ref: container, 'data-sorting': dragging !== null ? '' : undefined },
      item: key => ({ 'data-sort-key': String(key), 'data-dragging': held(key) ? '' : undefined }),
      grip: (key, { label, title }) => h('button', { type: 'button', className: 'ww-grip', 'data-sort-grip': '', disabled: disabled || order.length < 2, 'aria-label': label, title, onPointerDown: event => start(event, key), onKeyDown: event => onKeyDown(event, key) }, gripIcon(h)),
    };
  };
}
