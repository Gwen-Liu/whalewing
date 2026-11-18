/**
 * 可拖的分界线（2026-11-17 用户定，全产品共用）：两栏之间那条线按住左右拖，松手后记在这台电脑上，下次打开还是这个宽度；
 * 双击那条线回到默认宽度；焦点在线上时左右方向键微调（按住 Shift 一次挪得多），Home / End 到头，拖到一半按 Esc 撤回。
 * 记的是“占可用宽度的比例”，不是像素：换到大屏或把窗口拉窄，两栏照这个比例跟着变，再夹在上下限里（宽度不写死）。
 * 专家团队、定时任务、知识积累都用它；别的页要分两栏也用这一套，不另写。样式（ww-split-line）在 src/shell/theme-presentation.js。
 * 窄到页面换成上下排、或左栏收成一列头像时，由调用方的样式把这条线藏起来（容器查询），这时也就拖不了。
 */

const storageKey = key => `whalewing.split.${key}.v1`;

/** 读这条线上次定的比例（0 到 1 之间）；没拖过、读不出来都返回 null（用默认宽度）。 */
export function readSplit(key) {
  try {
    const ratio = Number(JSON.parse(window.localStorage.getItem(storageKey(key)) || 'null')?.ratio);
    return ratio > 0 && ratio < 1 ? ratio : null;
  } catch { return null; }
}

/** 记下这条线的比例；null 表示回到默认（删掉记录）。 */
export function writeSplit(key, ratio) {
  try {
    if (ratio === null) window.localStorage.removeItem(storageKey(key));
    else window.localStorage.setItem(storageKey(key), JSON.stringify({ ratio }));
  } catch { /* 存不下就只在这次打开里有效。 */ }
}

export function createSplit(React) {
  const { useRef, useState, useEffect } = React;
  /**
   * key：记宽度用的名字（如 'experts'），每条线一个。active：页面在显示时为 true，不显示时不量尺寸、不挂监听。
   * side：'start' 调的是线左边那一栏（往右拖变宽），'end' 调的是线右边那一栏（往左拖变宽）。
   * preferred(size)：没拖过时这一栏多宽；limits(size)：{ min, max }。两者都按可用宽度 size（px）算。
   * reserve(total)：整块宽度里不归这两栏分的部分（如知识积累最左边的功能条、另一侧停靠的栏），默认 0。
   * label：读屏念的名字（如“调整目录宽度”）；hint：鼠标停在线上时的提示。
   * node：一块里有两条线时（知识积累左右各一条），第二条传第一条返回的 node 共用一块，不用再挂 frame。
   * 返回 frame（ref 回调，挂在整块上量宽度；整块晚一点才画出来也量得到）、node（量的那一块）、width（这一栏现在多宽，整数 px）、
   * total（整块宽度，量到以前是 fallback）、measured（量到了没有）、custom（员工拖过、定了自己的宽度没有）、
   * style(name)：给整块的样式，员工拖过并且量到了才把宽度写进 CSS 变量 name，没拖过就让样式里的默认值（跟着 rem 和比例走）顶着、
   * separator（铺到分界线元素上的属性）。
   */
  return function useSplit({ key, active = true, side = 'start', preferred, limits, reserve = () => 0, label, hint, fallback = 1200, node: shared }) {
    const [own, frame] = useState(null);
    const node = shared === undefined ? own : shared;
    const gesture = useRef(null);
    const latest = useRef(null);
    const [ratio, setRatio] = useState(() => readSplit(key));
    const [measured, setMeasured] = useState(null);
    const total = measured ?? fallback;
    const available = Math.max(0, total - reserve(total));
    const bounds = limits(available);
    const min = Math.max(0, bounds.min), max = Math.max(min, bounds.max);
    const clamp = value => Math.round(Math.max(min, Math.min(value, max)));
    const width = clamp(ratio === null ? preferred(available) : ratio * available);
    const ratioOf = value => (available > 0 ? clamp(value) / available : null);
    latest.current = ratio;

    const finish = (event, cancel = false) => {
      const drag = gesture.current;
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
      gesture.current = null;
      if (cancel) setRatio(drag.previous);
      else if (latest.current !== drag.previous) writeSplit(key, latest.current);
      if (drag.target.hasPointerCapture?.(drag.id)) drag.target.releasePointerCapture(drag.id);
      delete drag.target.dataset?.dragging;
    };
    const commit = value => { const next = ratioOf(value); setRatio(next); writeSplit(key, next); };

    useEffect(() => {
      if (!active || !node) return;
      const resize = () => { finish(); setMeasured(Math.max(0, node.clientWidth)); };
      resize();
      const observer = new window.ResizeObserver(resize);
      observer.observe(node);
      return () => { finish(); observer.disconnect(); };
    }, [active, node]);

    const direction = side === 'end' ? -1 : 1;
    // 没拖过时栏宽由样式里的默认值定（跟着 rem 和比例走），和这里算的可能差几像素；按下时量一下那一栏实际多宽，免得一按就跳。
    const shown = target => {
      const pane = side === 'end' ? target?.nextElementSibling : target?.previousElementSibling;
      const box = pane?.getBoundingClientRect?.();
      return box && box.width > 0 ? Math.round(box.width) : width;
    };
    const custom = ratio !== null;
    return { frame, node, width, total, measured: measured !== null, custom, style: name => (custom && measured !== null ? { [name]: `${width}px` } : undefined), separator: {
      role: 'separator', tabIndex: 0, 'aria-orientation': 'vertical', 'aria-label': label, title: hint,
      'aria-valuemin': Math.round(min), 'aria-valuemax': Math.round(max), 'aria-valuenow': width,
      onPointerDown: event => {
        if (event.button !== 0 || gesture.current) return;
        event.preventDefault();
        event.currentTarget.focus();
        gesture.current = { id: event.pointerId, target: event.currentTarget, x: event.clientX, width: shown(event.currentTarget), previous: ratio };
        event.currentTarget.setPointerCapture(event.pointerId);
        if (event.currentTarget.dataset) event.currentTarget.dataset.dragging = '';
      },
      onPointerMove: event => {
        const drag = gesture.current;
        if (!drag || event.pointerId !== drag.id) return;
        event.preventDefault();
        setRatio(ratioOf(drag.width + direction * (event.clientX - drag.x)));
      },
      onPointerUp: event => finish(event),
      onPointerCancel: event => finish(event, true),
      onLostPointerCapture: event => finish(event, true),
      onDoubleClick: () => { finish(undefined, true); setRatio(null); writeSplit(key, null); },
      onKeyDown: event => {
        if (event.key === 'Escape') { finish(undefined, true); return; }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const step = (event.key === 'ArrowLeft' ? -1 : 1) * direction * (event.shiftKey ? 24 : 8);
        commit(event.key === 'Home' ? min : event.key === 'End' ? max : shown(event.currentTarget) + step);
      },
    } };
  };
}
