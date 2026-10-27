import { beijingDate } from './tip-index.js';
import {
  tipsFieldId, dayNumber, dateParts, daysFromReports, buildTimeline, entryHeight, entryTops, entryAt, entrySpan, entryFor, featuredIndex, monoColor,
  tipDays, snapDay, stepDay, stepMonth, monthLatest, yearLatest, stepTip, yearsOf, axisLayout, armSpan, armLayout, dayY, dateAtY, tickLength, thumbBox, planFetch,
} from './tips-model.js';

/**
 * AI 使用技巧历史页（S5）与技巧详情弹窗（S6）。
 * createTipsView(kit) 返回 { TipsPage }；TipsPage 自己读取 days 与 reports，不依赖首页状态。
 * props: { api, t, busy, setError, field, focus, externalLink, onBack, onEditSources, onFocusApplied?, reloadKey? }
 *   field: learning.tipField（{ name, enabled, deleted }，null 表示领域已不存在）；focus: { date, index } 进入时滚到并描边的那条，可省略，
 *   用过后调 onFocusApplied 让调用方清掉，之后回到这页按上次停的位置恢复；
 *   reloadKey 变化时整页重读（外壳“刷新”用）。run / notify 不用：分页读取在后台进行，不占外壳的忙碌锁。
 * 页面自带面包屑页头，自己算高度占满所在滚动容器；只有时间线在内部滚动，年份轴、刻度尺和页头不动。
 */
export function createTipsView(kit) {
  const { React, Glyph, Modal } = kit;
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect } = React;
  // 切到别的页签时组件会卸载；记住停在哪一条，回来时接着看。
  const memory = { anchor: null };
  const raf = fn => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16);
  const unraf = id => { if (!id) return; if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); else clearTimeout(id); };
  // 窗口被挡住或在后台时 requestAnimationFrame 会大幅降频；配一个计时器兜底，滚动同步和跳转一定落地。
  const soon = fn => { let done = false; const handle = {}; const run = () => { if (done) return; done = true; unraf(handle.frame); clearTimeout(handle.timer); fn(); }; handle.frame = raf(run); handle.timer = setTimeout(run, 48); return handle; };
  const cancel = handle => { if (handle) { unraf(handle.frame); clearTimeout(handle.timer); } };
  const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const pad = value => String(value).padStart(2, '0');
  const sourceName = item => item.sources?.[0]?.source?.name ?? '';
  const leadText = item => item.brief ?? item.summary ?? '';
  const linkOf = item => item.link || item.sources?.[0]?.url || '';
  const pressable = open => ({ role: 'button', tabIndex: 0, onClick: open, onKeyDown: event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } } });
  const spinner = () => h('span', { className: 'yj-tips-spin', 'aria-hidden': true });
  const scrollParent = node => {
    for (let element = node.parentElement; element; element = element.parentElement) {
      const overflow = globalThis.getComputedStyle?.(element).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') return element;
    }
    return null;
  };
  const formats = t => {
    const months = t('tipsMonths').split('|'), weeks = t('tipsWeekdays').split('|'), name = month => months[month - 1] ?? String(month);
    return {
      month: name,
      week: date => weeks[dateParts(date).week] ?? '',
      date: date => { const { month, day } = dateParts(date); return t('tipsDate', { month, day, name: name(month) }); },
      full: date => { const { year, month, day } = dateParts(date); return t('tipsFullDate', { year, month, day, name: name(month) }); },
      monthYear: key => { const year = Number(key.slice(0, 4)), month = Number(key.slice(5, 7)); return t('tipsMonthYear', { year, month, name: name(month) }); },
      short: date => `${date.slice(5, 7)}/${date.slice(8, 10)}`,
      published: iso => { const local = new Date(Date.parse(iso) + 8 * 3600000).toISOString(), month = Number(local.slice(5, 7)); return t('tipsDateTime', { month, day: Number(local.slice(8, 10)), time: local.slice(11, 16), name: name(month) }); },
    };
  };

  /** S6：叠在历史页上的技巧详情。底栏不随条目重建，键盘连按“下一条”焦点不丢。 */
  function TipDetail({ t, f, day, report, index, stepping, canPrev, canNext, onStep, onClose, externalLink }) {
    const sheet = useRef(null), handlers = useRef(null);
    handlers.current = { canPrev, canNext, onStep, stepping };
    useEffect(() => {
      const dialog = sheet.current?.closest?.('dialog');
      if (!dialog) return;
      // 打开时焦点落在标题上；←/→ 切换上一条、下一条。
      const title = dialog.querySelector?.('.yj-header h2');
      if (title) { title.tabIndex = -1; title.focus?.({ preventScroll: true }); }
      const onKey = event => {
        const current = handlers.current;
        if (current.stepping || event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('input, textarea, select')) return;
        if (event.key === 'ArrowLeft' && current.canPrev) { event.preventDefault(); current.onStep(-1); }
        if (event.key === 'ArrowRight' && current.canNext) { event.preventDefault(); current.onStep(1); }
      };
      dialog.addEventListener('keydown', onKey);
      return () => dialog.removeEventListener('keydown', onKey);
    }, []);
    // 外壳弹窗用标题给“×”命名；这里按规格叫“关闭”。每次提交后重设，标题随切换变化时也不会被盖回去。
    useLayoutEffect(() => { sheet.current?.closest?.('dialog')?.querySelector?.('.yj-header > button')?.setAttribute('aria-label', t('tipsClose')); });
    const item = report.items[index], count = report.items.length, source = item.sources?.[0], name = sourceName(item), link = linkOf(item), lead = leadText(item);
    return h(Modal, { title: item.title, onClose, className: 'yj-tips-detail' },
      h('div', { className: 'yj-tips-kicker' },
        h('i', { 'aria-hidden': true }, h(Glyph, { name: 'spark', size: 15 })),
        h('strong', null, t('tipsTitle')),
        h('span', null, ` · ${f.date(day.date)} · ${t('tipsPosition', { index: index + 1, count })}`)),
      h('div', { ref: sheet, className: 'yj-tips-sheet', key: `${day.date}#${index}` },
        h('div', { className: 'yj-tips-tags' },
          featuredIndex(day.date, count) === index && h('span', { className: 'yj-tips-tag' }, t('tipsFeatured')),
          name && h('span', null, source?.publishedAt ? t('tipsPublished', { source: name, time: f.published(source.publishedAt) }) : name)),
        lead && h('div', { className: 'yj-tips-guide' }, lead),
        link && h('section', { className: 'yj-tips-origin' }, h('h3', null, t('tipsOrigin')), h('p', { title: link }, externalLink(link, `${link.replace(/^https?:\/\/(www\.)?/, '')} ↗`)))),
      h('footer', { className: 'yj-tips-detail-foot' },
        h('button', { type: 'button', disabled: !canPrev || Boolean(stepping), 'aria-busy': stepping === -1 || undefined, onClick: () => onStep(-1) }, stepping === -1 && spinner(), t('tipsPrev')),
        h('button', { type: 'button', disabled: !canNext || Boolean(stepping), 'aria-busy': stepping === 1 || undefined, onClick: () => onStep(1) }, stepping === 1 && spinner(), t('tipsNext')),
        link && h('span', { className: 'yj-tips-open' }, externalLink(link, t('tipsOpenSource')))));
  }

  function TipsPage({ api, t, busy, setError, field, focus, externalLink, onBack, onEditSources, onFocusApplied, reloadKey, today: fixedToday }) {
    const today = fixedToday || beijingDate(Date.now()), f = formats(t);
    const [index, setIndex] = useState({ status: 'loading', days: [], first: null });
    const [store, setStore] = useState({ loaded: new Map(), nextBefore: undefined, started: false });
    const [failure, setFailure] = useState(null);
    const [pending, setPending] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [view, setView] = useState({ start: 0, end: 40, month: null });
    const [size, setSize] = useState({ width: 1260, height: 640, scrollbar: 0 });
    const [measured, setMeasured] = useState(0);
    const [detail, setDetail] = useState(null);
    const [flash, setFlash] = useState(null);
    const root = useRef(null), scroller = useRef(null), list = useRef(null), rail = useRef(null), thumb = useRef(null), guide = useRef(null), bubble = useRef(null);
    const heights = useRef(new Map()), anchor = useRef(null), position = useRef(null), keyTarget = useRef(null), drag = useRef(false), motion = useRef({ frame: null, hover: null, scroll: null });
    const session = useRef(null), inflight = useRef(null), refocus = useRef(null), applied = useRef(null), flashTimer = useRef(0), stepRef = useRef(null), cache = useRef({}), latest = useRef({});
    // 挂载时记下的上次位置；之后每次滚动都会改写 memory，恢复要用挂载那一刻的值。
    const remembered = useRef(memory.anchor), boot = useRef(null);

    // —— 读取：日期索引与日报分页；都只读，失败原位重试 ——
    const merge = (reports, nextBefore) => setStore(value => {
      const loaded = new Map(value.loaded);
      for (const report of reports) loaded.set(report.cutoff, report);
      return { loaded, nextBefore: nextBefore === undefined ? value.nextBefore : nextBefore, started: true };
    });
    // 首次进入时索引和最新一页并行读取，两边都有结果后再决定提示：都失败只在页内说明原因，不弹提示。
    const settle = (part, outcome, toast) => {
      const state = boot.current;
      if (!state || state[part] !== 'pending') { toast?.(); return; }
      state[part] = outcome; if (toast) state.toasts.push(toast);
      if (state.index === 'pending' || state.latest === 'pending') return;
      boot.current = null;
      if (state.index !== 'failed' || state.latest !== 'failed') state.toasts.forEach(run => run());
    };
    const loadIndex = (controller = session.current) => {
      if (!controller || controller.signal.aborted) return;
      setIndex(value => ({ ...value, status: 'loading' }));
      api.newsRequest({ action: 'days', fieldId: tipsFieldId }, controller.signal).then(value => {
        if (controller.signal.aborted) return;
        setIndex({ status: 'ready', days: value.days, first: value.first });
        settle('index', 'ok');
      }, reason => {
        if (controller.signal.aborted) return;
        setIndex({ status: 'failed', days: [], first: null });
        settle('index', 'failed', () => setError(t('tipsIndexFailed', { reason: reason?.message || t('tipsUnknown') }), { label: t('tipsRetry'), run: () => loadIndex() }));
      });
    };
    const fetchSegment = (plan, controller = session.current) => {
      if (inflight.current || !controller || controller.signal.aborted) return;
      inflight.current = plan.key; setPending(plan.key);
      api.newsRequest({ action: 'reports', fieldId: tipsFieldId, ...plan.input }, controller.signal).then(value => {
        if (controller.signal.aborted) return;
        inflight.current = null; setPending(null);
        merge(value.reports, plan.input.after ? undefined : value.nextBefore);
        if (plan.expect && !value.reports.some(report => report.cutoff === plan.expect)) setFailure({ key: plan.key, message: t('tipsMissing') });
        if (plan.key === 'latest') settle('latest', 'ok');
      }, reason => {
        if (controller.signal.aborted) return;
        inflight.current = null; setPending(null);
        const message = reason?.message || t('tipsUnknown'), toast = () => setError(t('tipsSegmentToast', { reason: message }), { label: t('tipsRetry'), run: () => setFailure(null) });
        setFailure({ key: plan.key, message });
        if (plan.key === 'latest') settle('latest', 'failed', toast); else toast();
      });
    };
    useEffect(() => {
      const controller = new AbortController();
      if (session.current) {
        // 刷新后回到刷新前停的位置，而不是进页那一刻的位置。
        heights.current = new Map(); anchor.current = null; applied.current = null; inflight.current = null; remembered.current = memory.anchor;
        setIndex({ status: 'loading', days: [], first: null }); setStore({ loaded: new Map(), nextBefore: undefined, started: false }); setFailure(null); setPending(null); setDetail(null);
      }
      session.current = controller; boot.current = { index: 'pending', latest: 'pending', toasts: [] };
      // 先读日期索引和最新 30 期；刻度尺在索引返回后出来。
      loadIndex(controller);
      fetchSegment({ key: 'latest', input: {} }, controller);
      return () => { controller.abort(); inflight.current = null; };
    }, [reloadKey, attempt]);
    useEffect(() => () => { cancel(motion.current.frame); cancel(motion.current.hover); cancel(motion.current.scroll); clearTimeout(flashTimer.current); }, []);

    // —— 派生：时间线条目、位置、刻度尺 ——
    const indexReady = index.status === 'ready', complete = indexReady || store.nextBefore === null;
    const ready = indexReady || store.started;
    const derived = cache.current;
    const source = indexReady ? index.days : store.loaded;
    if (derived.source !== source || derived.today !== today || derived.complete !== complete) {
      derived.days = indexReady ? index.days : daysFromReports([...store.loaded.values()]);
      derived.entries = buildTimeline(derived.days, { today, complete });
      derived.dayMap = new Map(derived.days.map(day => [day.date, day]));
      derived.years = indexReady ? yearsOf(derived.days) : [];
      Object.assign(derived, { source, today, complete, tops: null });
    }
    const { days, entries, dayMap, years } = derived;
    const ruled = indexReady && years.length > 0, narrow = size.width < 1100;
    const armWidth = narrow ? 48 : 96, columns = size.width - size.scrollbar - (ruled ? armWidth + (narrow ? 16 : 24) : 0) - 140 >= 600 ? 2 : 1;
    // 一列和两列的条目高度不同，换列数时实测值作废。
    if (derived.columns !== undefined && derived.columns !== columns) heights.current = new Map();
    if (!derived.tops || derived.columns !== columns || derived.measured !== measured) {
      derived.tops = entryTops(entries, entry => heights.current.get(entry.key) ?? entryHeight(entry, columns));
      Object.assign(derived, { columns, measured });
    }
    const tops = derived.tops;
    const firstSpan = entrySpan(entries.find(entry => entrySpan(entry)) ?? {});
    const currentMonth = view.month ?? firstSpan?.newest.slice(0, 7) ?? today.slice(0, 7);
    const wantedYear = Number(currentMonth.slice(0, 4));
    const armYear = years.some(entry => entry.year === wantedYear) ? wantedYear : (years.find(entry => entry.year < wantedYear) ?? years.at(-1))?.year;
    const armHeight = Math.max(160, size.height - 64);
    let layout = null;
    if (ruled && armYear) {
      const span = armSpan(days, armYear, today);
      if (derived.layout?.from !== span.from || derived.layout?.to !== span.to || derived.layoutHeight !== armHeight) { derived.layout = armLayout({ ...span, height: armHeight }); derived.layoutHeight = armHeight; }
      layout = derived.layout;
    }
    latest.current = { index, store, failure, days, entries, tops, layout, view, indexReady, complete, years, armYear, dayMap };

    // —— 滚动：窗口、锚定、滑块 ——
    const visibleSpan = (first, last) => {
      let newest = null, oldest = null;
      for (let i = first; i <= last; i++) { const span = entrySpan(entries[i] ?? {}); if (span) { newest ??= span.newest; oldest = span.oldest; } }
      return newest ? { newest, oldest } : null;
    };
    const valueText = date => {
      const day = latest.current.dayMap.get(date);
      return `${f.full(date)}，${day ? day.count > 0 ? t('tipsCount', { count: day.count }) : t('tipsHoverEmpty') : t('tipsGap')}`;
    };
    // preview 是拖动中的滑块跟手，不改“当前位置”，松手后按真实位置判断跳转远近。
    const paint = (span, preview = false) => {
      const s = latest.current, node = thumb.current;
      if (!span) return;
      if (!preview) position.current = span.newest;
      if (rail.current && !preview) { rail.current.setAttribute('aria-valuetext', valueText(span.newest)); rail.current.setAttribute('aria-valuenow', String(dayNumber(span.newest))); }
      if (!node || !s.layout) return;
      const box = thumbBox(s.layout, span.newest, span.oldest);
      node.style.top = `${box.top}px`; node.style.height = `${box.height}px`; node.dataset.label = f.short(span.newest);
      // 数据稀疏时一屏盖住很多天，滑块会很高；这时改成半透明框，日期仍是顶端的实心小牌。
      if (box.height > 28) node.dataset.tall = ''; else delete node.dataset.tall;
    };
    const autoFetch = () => {
      const s = latest.current, node = scroller.current;
      if (s.failure || inflight.current || !s.entries.length) return;
      const y = node?.scrollTop ?? 0, height = node?.clientHeight ?? 800;
      const from = entryAt(s.tops, Math.max(0, y - 600)), to = entryAt(s.tops, y + height + 600);
      if (s.indexReady) {
        const plan = planFetch(s.entries, [from, to], cutoff => s.store.loaded.has(cutoff), s.days);
        if (plan) fetchSegment(plan);
      } else if (s.index.status === 'failed' && s.store.nextBefore && s.entries.at(-1).kind === 'more' && to >= s.entries.length - 1) fetchSegment({ key: `before:${s.store.nextBefore}`, input: { before: s.store.nextBefore } });
    };
    const sync = () => {
      const s = latest.current, node = scroller.current;
      if (!node || !s.entries.length) return;
      const y = node.scrollTop, first = entryAt(s.tops, y), last = Math.max(first, entryAt(s.tops, y + node.clientHeight - 1));
      anchor.current = { key: s.entries[first].key, top: s.tops[first] };
      memory.anchor = { key: s.entries[first].key, delta: y - s.tops[first] };
      const span = visibleSpan(first, last);
      if (!drag.current) paint(span);
      // 只渲染视口前后约 20 条；滚到窗口边缘附近或换月时再重排。
      const start = Math.max(0, first - 20), end = Math.min(s.entries.length - 1, last + 20), month = span?.newest.slice(0, 7) ?? s.view.month;
      if (first < s.view.start || last > s.view.end || Math.abs(start - s.view.start) > 8 || Math.abs(end - s.view.end) > 8 || month !== s.view.month) setView({ start, end, month });
      autoFetch();
    };
    const onScroll = () => { if (!motion.current.scroll) motion.current.scroll = soon(() => { motion.current.scroll = null; sync(); }); };
    const stopMotion = () => { cancel(motion.current.frame); motion.current.frame = null; keyTarget.current = null; };
    const arrive = () => {
      const node = list.current;
      if (!node?.classList) return;
      node.classList.remove('yj-tips-arrive'); void node.offsetWidth; node.classList.add('yj-tips-arrive');
    };
    /** 跳到某天：400ms 内平滑滚到；跨度超过 90 天直接到位再淡入。 */
    const jump = (date, { instant = false, retry = false } = {}) => {
      const s = latest.current, i = entryFor(s.entries, date), node = scroller.current;
      if (i < 0) return;
      const key = s.entries[i].key;
      if (retry && s.failure) setFailure(null);
      if (!node) { setView({ start: Math.max(0, i - 20), end: Math.min(s.entries.length - 1, i + 20), month: date.slice(0, 7) }); position.current = date; return; }
      stopMotion();
      const far = instant || reducedMotion() || !position.current || Math.abs(dayNumber(position.current) - dayNumber(date)) > 90;
      if (far) {
        node.scrollTop = s.tops[i]; anchor.current = { key, top: s.tops[i] };
        if (!instant && !reducedMotion()) arrive();
        sync(); return;
      }
      const begin = node.scrollTop, started = Date.now();
      keyTarget.current = date;
      const frame = () => {
        const current = latest.current, j = current.entries.findIndex(entry => entry.key === key);
        if (j < 0) { stopMotion(); return; }
        const progress = Math.min(1, (Date.now() - started) / 320);
        node.scrollTop = begin + (current.tops[j] - begin) * (1 - (1 - progress) ** 3);
        if (progress < 1) motion.current.frame = soon(frame);
        else { motion.current.frame = null; keyTarget.current = null; anchor.current = { key, top: current.tops[j] }; sync(); }
      };
      motion.current.frame = soon(frame);
    };
    const jumpSnap = date => { const target = snapDay(latest.current.days, date); if (target) jump(target.date, { retry: true }); };
    const reveal = date => {
      const s = latest.current, node = scroller.current, i = entryFor(s.entries, date);
      if (i < 0) return;
      if (!node || s.tops[i] < node.scrollTop || s.tops[i + 1] > node.scrollTop + node.clientHeight) jump(date);
    };

    // 每次提交后：实测条目高度 → 按锚点补偿 scrollTop（往视口上方插入内容时画面不动）→ 更新滑块和窗口。
    useLayoutEffect(() => {
      const container = list.current, node = scroller.current;
      if (container?.children) {
        let changed = false;
        for (const element of container.children) {
          const i = Number(element.dataset?.index);
          if (!Number.isInteger(i) || !entries[i]) continue;
          const height = element.offsetHeight;
          if (height > 0 && Math.abs(height - (tops[i + 1] - tops[i])) > 0.5) { heights.current.set(entries[i].key, height); changed = true; }
        }
        if (changed) { setMeasured(value => value + 1); return; }
      }
      if (node && anchor.current && !motion.current.frame) {
        const i = entries.findIndex(entry => entry.key === anchor.current.key);
        if (i >= 0 && Math.abs(tops[i] - anchor.current.top) > 0.5) { node.scrollTop += tops[i] - anchor.current.top; anchor.current.top = tops[i]; }
      }
      sync();
    });
    // 尺寸：整页占满所在滚动容器剩下的高度，只让时间线在内部滚动。
    useLayoutEffect(() => {
      const node = root.current;
      if (!node?.getBoundingClientRect) return;
      const fit = () => {
        const parent = scrollParent(node), box = scroller.current;
        if (parent) {
          const outer = parent.getBoundingClientRect(), own = node.getBoundingClientRect(), padding = parseFloat(globalThis.getComputedStyle?.(parent).paddingBottom) || 0;
          node.style.setProperty('--yj-tips-height', `${Math.max(420, Math.floor(parent.clientHeight - (own.top - outer.top + parent.scrollTop) - padding))}px`);
        }
        const next = { width: node.clientWidth, height: box?.clientHeight || 640, scrollbar: box ? box.offsetWidth - box.clientWidth : 0 };
        setSize(value => value.width === next.width && value.height === next.height && value.scrollbar === next.scrollbar ? value : next);
      };
      fit();
      const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fit()) : null;
      observer?.observe(node); if (scroller.current) observer?.observe(scroller.current);
      globalThis.addEventListener?.('resize', fit);
      return () => { observer?.disconnect(); globalThis.removeEventListener?.('resize', fit); };
    }, []);
    // 进入时定位：从首页技巧卡进来滚到那条并描边 1.6 秒，用过就告诉首页清掉，切页签回来或刷新不再拉回；
    // 否则回到上次停的位置。目标那天还没读到时先等，不把“已定位”记死。
    useLayoutEffect(() => {
      if (!ready || !entries.length) return;
      const want = focus?.date ? `${focus.date}#${focus.index ?? ''}` : null;
      if (want && applied.current !== want) {
        if (entryFor(entries, focus.date) < 0 && !complete) return;
        applied.current = want;
        jump(focus.date, { instant: true });
        if (Number.isInteger(focus.index)) { setFlash(`${focus.date}#${focus.index}`); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlash(null), 1600); }
        onFocusApplied?.();
        return;
      }
      if (want || applied.current !== null) return;
      const i = remembered.current ? entries.findIndex(entry => entry.key === remembered.current.key) : -1;
      if (remembered.current && i < 0 && !complete) return;
      applied.current = 'memory';
      if (i >= 0 && scroller.current) { scroller.current.scrollTop = tops[i] + remembered.current.delta; anchor.current = { key: entries[i].key, top: tops[i] }; sync(); }
    });
    useEffect(() => { autoFetch(); });
    // 关闭详情：焦点回到最后看的那一条。
    useEffect(() => {
      if (detail || !refocus.current) return;
      const id = refocus.current;
      refocus.current = null;
      list.current?.querySelector?.(`[data-tip="${id}"]`)?.focus?.({ preventScroll: true });
    }, [detail]);

    // —— 详情：上一条 / 下一条跨天，未读取的日期先取再切 ——
    // 每次打开、关闭或开始跨天读取都换一个序号；读取回来时序号变了，说明弹窗已经关掉或换成别的条目，不再套用旧结果。
    const stepSeq = useRef(0);
    const openTip = (entry, i) => { stepSeq.current++; setDetail({ date: entry.date, cutoff: entry.cutoff, index: i, step: 0 }); };
    const closeDetail = () => { stepSeq.current++; const current = latest.current.detail; if (current) refocus.current = `${current.date}#${current.index}`; setDetail(null); };
    const stepDetail = delta => {
      const s = latest.current, current = latest.current.detail;
      if (!current || current.step) return;
      const report = s.store.loaded.get(current.cutoff);
      if (!report) return;
      const target = stepTip(s.days, { ...current, count: report.items.length }, delta);
      const go = (date, cutoff, i) => { setDetail({ date, cutoff, index: i, step: 0 }); reveal(date); };
      if (target) {
        const known = s.store.loaded.get(target.cutoff);
        if (known) return go(target.date, target.cutoff, target.date === current.date ? target.index : delta > 0 ? 0 : known.items.length - 1);
      } else if (delta < 0 || s.complete) return;
      setDetail({ ...current, step: delta });
      const controller = session.current, mine = ++stepSeq.current;
      api.newsRequest({ action: 'reports', fieldId: tipsFieldId, [delta > 0 ? 'before' : 'after']: current.cutoff }, controller?.signal).then(value => {
        if (controller?.signal.aborted || stepSeq.current !== mine) return;
        const loaded = new Map(latest.current.store.loaded);
        for (const item of value.reports) loaded.set(item.cutoff, item);
        merge(value.reports, delta > 0 && !latest.current.indexReady ? value.nextBefore : undefined);
        const list = latest.current.indexReady ? latest.current.days : daysFromReports([...loaded.values()]);
        const next = stepTip(list, { ...current, count: report.items.length }, delta), found = next && loaded.get(next.cutoff);
        if (!found) throw new Error(t('tipsMissing'));
        // 读取期间弹窗可能已经关了，这时不再挪动时间线。
        if (!latest.current.detail) return;
        setDetail(value => value && { date: next.date, cutoff: next.cutoff, index: delta > 0 ? 0 : found.items.length - 1, step: 0 });
        reveal(next.date);
      }).catch(() => {
        if (controller?.signal.aborted || stepSeq.current !== mine) return;
        setDetail(value => value && { ...value, step: 0 });
        setError(target ? t('tipsStepFailed', { date: f.date(target.date) }) : t('tipsStepFailedEarlier'), { label: t('tipsRetry'), run: () => stepRef.current?.(delta) });
      });
    };
    stepRef.current = stepDetail;
    latest.current.detail = detail;

    // —— 刻度尺交互 ——
    const hideHover = () => { if (guide.current) guide.current.hidden = true; if (bubble.current) bubble.current.hidden = true; };
    const hoverText = date => {
      const day = latest.current.dayMap.get(date), label = f.date(date);
      if (!day) return `${label} · ${t('tipsGap')}`;
      if (day.count === 0) return `${label} · ${t('tipsHoverEmpty')}`;
      return [label, t('tipsCount', { count: day.count }), day.status === 'partial' && t('tipsPartial')].filter(Boolean).join(' · ');
    };
    const pointerDate = event => { const s = latest.current, box = rail.current?.getBoundingClientRect?.(); return box && s.layout ? dateAtY(s.layout, event.clientY - box.top) : null; };
    const preview = event => {
      const date = pointerDate(event), s = latest.current;
      if (!date || !s.layout) return;
      cancel(motion.current.hover);
      // 悬停准线、日期提示、拖动时的滑块每帧最多更新一次。
      motion.current.hover = soon(() => {
        motion.current.hover = null;
        const y = dayY(s.layout, date);
        if (guide.current) { guide.current.hidden = false; guide.current.style.top = `${y}px`; }
        if (bubble.current) { bubble.current.hidden = false; bubble.current.style.top = `${y - 14}px`; bubble.current.textContent = hoverText(date); }
        if (drag.current) paint({ newest: date, oldest: date }, true);
      });
    };
    const armEvents = {
      onPointerDown: event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture?.(event.pointerId); drag.current = true; stopMotion(); preview(event); },
      onPointerMove: preview,
      onPointerUp: event => { if (!drag.current) return; drag.current = false; const date = pointerDate(event); hideHover(); if (date) jumpSnap(date); },
      onPointerCancel: () => { drag.current = false; hideHover(); sync(); },
      onPointerLeave: () => { if (!drag.current) hideHover(); },
      onKeyDown: event => {
        const s = latest.current, current = keyTarget.current ?? position.current ?? tipDays(s.days)[0]?.date;
        if (!current) return;
        const list = tipDays(s.days);
        const target = { ArrowUp: () => stepDay(s.days, current, -1), ArrowDown: () => stepDay(s.days, current, 1), PageUp: () => stepMonth(s.days, current, -1), PageDown: () => stepMonth(s.days, current, 1), Home: () => list[0], End: () => list.at(-1) }[event.key];
        if (!target) return;
        event.preventDefault();
        const day = target();
        if (day) jump(day.date, { retry: true });
      },
    };
    const jumpMonth = key => { const day = monthLatest(latest.current.days, key); if (day) jump(day.date, { retry: true }); };
    const jumpYear = year => { const day = yearLatest(latest.current.days, year); if (day) jump(day.date, { retry: true }); };
    const axisKeys = event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const s = latest.current, i = s.years.findIndex(entry => entry.year === s.armYear), next = s.years[i + (event.key === 'ArrowLeft' ? 1 : -1)];
      event.preventDefault();
      if (!next) return;
      jumpYear(next.year);
      root.current?.querySelector?.(`[data-year="${next.year}"]`)?.focus?.();
    };

    // —— 画面 ——
    const fieldName = field?.name || t('tipsTitle'), deleted = field === null || Boolean(field?.deleted), paused = Boolean(field) && !field.deleted && !field.enabled;
    const head = h('header', { className: 'yj-tips-head' },
      h('nav', { className: 'yj-tips-crumbs', 'aria-label': t('tipsCrumbs') },
        h('button', { type: 'button', onClick: onBack }, t('tipsHome')),
        h('span', { className: 'yj-tips-sep', 'aria-hidden': true }, '›'),
        h('h2', null, fieldName),
        paused && h('span', { className: 'yj-tips-flag' }, t('tipsPaused')),
        deleted && h('span', { className: 'yj-tips-flag yj-tips-flag-muted' }, t('tipsDeleted'))),
      h('div', { className: 'yj-tips-side' },
        h('p', { className: 'yj-tips-meta' }, indexReady && index.days.length ? t('tipsMeta', { count: index.days.length }) : t('tipsSchedule')),
        !deleted && h('button', { type: 'button', disabled: busy, onClick: onEditSources }, t(paused ? 'tipsEnable' : 'tipsEditSources'))));

    const axis = () => {
      if (!ruled) return null;
      if (narrow) return h('label', { className: 'yj-ruler-pill' }, h('select', { value: String(armYear), 'aria-label': t('tipsYearPick'), onChange: event => jumpYear(Number(event.target.value)) }, ...years.map(entry => h('option', { key: entry.year, value: String(entry.year) }, `${entry.year} · ${t('tipsIssues', { count: entry.count })}`))));
      const width = size.width - size.scrollbar, segments = axisLayout(years, width, today), selected = segments.find(entry => entry.year === armYear);
      const month = Number(currentMonth.slice(5, 7)), caret = selected && Number(currentMonth.slice(0, 4)) === armYear ? selected.left + (month - 0.5) * selected.cell : null;
      return h('div', { className: 'yj-ruler-year', role: 'toolbar', 'aria-label': t('tipsYears'), style: { marginRight: size.scrollbar }, onKeyDown: axisKeys },
        h('span', { className: 'yj-ruler-base', 'aria-hidden': true }), h('span', { className: 'yj-ruler-drop', 'aria-hidden': true }), h('span', { className: 'yj-ruler-corner', 'aria-hidden': true }),
        ...segments.map(segment => h('div', { key: segment.year, className: 'yj-ruler-seg', style: { left: segment.left, width: segment.width } },
          h('span', { className: 'yj-ruler-major', 'aria-hidden': true }),
          ...segment.months.slice(0, segment.last).map((cell, i) => i > 0 && h('span', { key: `tick${i}`, className: cell.tips ? 'yj-ruler-mtick yj-ruler-mtick-on' : 'yj-ruler-mtick', style: { left: i * segment.cell }, 'aria-hidden': true })),
          ...segment.months.slice(0, segment.last).map((cell, i) => {
            const key = `${segment.year}-${pad(i + 1)}`, label = cell.tips ? `${f.monthYear(key)} · ${t('tipsIssues', { count: cell.count })}` : `${f.monthYear(key)} · ${t('tipsNoTips')}`;
            return h('button', { type: 'button', key, className: 'yj-ruler-cell', tabIndex: -1, style: { left: i * segment.cell, width: segment.cell }, title: label, 'aria-label': label, 'aria-disabled': cell.tips ? undefined : true, onClick: () => { if (cell.tips) jumpMonth(key); } });
          }),
          h('button', { type: 'button', className: 'yj-ruler-label', 'data-year': segment.year, 'aria-pressed': segment.year === armYear, onClick: () => jumpYear(segment.year) },
            h('strong', null, String(segment.year)), h('small', null, t('tipsIssues', { count: segment.count }))))),
        selected && h('span', { className: 'yj-ruler-sel', style: { left: selected.left, width: selected.cell * selected.last }, 'aria-hidden': true }),
        caret !== null && h('span', { className: 'yj-ruler-caret', style: { left: caret - 3 }, 'aria-hidden': true }));
    };

    const armArt = () => {
      if (derived.art && derived.artLayout === layout && derived.artWidth === armWidth && derived.artToday === today) return derived.art;
      const ratio = globalThis.devicePixelRatio || 1, crisp = y => Math.round(y * ratio) / ratio + 0.5 / ratio;
      const paths = { tips: '', partial: '', none: '', major: '', today: '' };
      for (const month of layout.months) {
        if (!narrow) for (let d = 0; d < month.days; d++) {
          const date = new Date(Date.parse(`${month.last}T00:00:00Z`) - d * 86400000).toISOString().slice(0, 10), day = dayMap.get(date);
          const kind = !day || day.count === 0 ? 'none' : day.status === 'partial' ? 'partial' : 'tips';
          paths[kind] += `M${armWidth} ${crisp(month.top + d * layout.step)}h-${tickLength(day)}`;
        }
        paths.major += `M${armWidth} ${crisp(month.top)}h-${narrow ? 24 : 36}`;
      }
      if (today >= layout.from && today <= layout.to) paths.today = `M${armWidth} ${crisp(dayY(layout, today))}h-10`;
      Object.assign(derived, { art: paths, artLayout: layout, artWidth: armWidth, artToday: today });
      return paths;
    };
    const arm = () => {
      if (!ruled || !layout) return null;
      const paths = armArt(), counts = years.find(entry => entry.year === armYear)?.months ?? [], labels = [];
      let floor = -Infinity;
      if (!narrow) for (const month of layout.months) {
        // 月份很短时标签往下让，让不开就不画，点击区不互相盖住。
        const top = Math.max(month.top, floor);
        if (labels.length && top > month.bottom - 8) continue;
        labels.push({ ...month, labelTop: top }); floor = top + 32;
      }
      const current = position.current ?? firstSpan?.newest ?? today;
      return h('div', { className: 'yj-ruler yj-ruler-arm', style: { width: armWidth } },
        h('div', { ref: rail, className: 'yj-ruler-rail', role: 'slider', tabIndex: 0, 'aria-label': t('tipsRuler'), 'aria-orientation': 'vertical', 'aria-valuemin': dayNumber(days.at(-1).date), 'aria-valuemax': dayNumber(days[0].date > today ? days[0].date : today), 'aria-valuenow': dayNumber(current), 'aria-valuetext': valueText(current), ...armEvents },
          h('svg', { className: 'yj-ruler-ticks', width: armWidth, height: Math.ceil(layout.height) + 2, shapeRendering: 'crispEdges', 'aria-hidden': true, focusable: 'false' },
            ...['none', 'tips', 'partial', 'major', 'today'].map(kind => paths[kind] && h('path', { key: kind, className: `yj-ruler-tick-${kind}`, d: paths[kind] }))),
          h('div', { ref: thumb, className: 'yj-ruler-thumb', 'data-label': f.short(current), 'aria-hidden': true }),
          h('div', { ref: guide, className: 'yj-ruler-guide', hidden: true, 'aria-hidden': true }),
          h('div', { ref: bubble, className: 'yj-ruler-bubble', hidden: true, 'aria-hidden': true })),
        // 没有技巧的月份和年份轴的月格一样不可点，悬停写“没有技巧”。
        ...labels.map(month => {
          const cell = counts[Number(month.key.slice(5, 7)) - 1], empty = !cell?.tips;
          return h('button', { type: 'button', key: month.key, tabIndex: -1, className: `yj-ruler-month${month.key === currentMonth ? ' yj-ruler-month-on' : ''}`, style: { top: month.labelTop }, title: empty ? `${f.monthYear(month.key)} · ${t('tipsNoTips')}` : f.monthYear(month.key), 'aria-disabled': empty || undefined, onClick: () => { if (!empty) jumpMonth(month.key); } },
            h('strong', null, f.month(Number(month.key.slice(5, 7)))), h('small', null, t('tipsIssues', { count: cell?.count ?? 0 })));
        }));
    };

    const reload = () => setFailure(null);
    const failLine = () => h('div', { className: 'yj-tips-fail', role: 'status' }, h('span', null, t('tipsSegmentFailed')), h('button', { type: 'button', onClick: reload }, t('tipsReload')));
    // 骨架与正文同高；失败行占住主卡的位置和高度，原位提示，不挪动下面的内容。
    const skeleton = (count, dated) => h('div', { className: `yj-tips-items${failure ? ' yj-tips-still' : ''}`, 'aria-hidden': !dated || undefined },
      h('div', { className: 'yj-tips-feature yj-tips-ghost' }, ...failure && dated ? [failLine()] : [32, 70, 92, 64].map((width, i) => h('span', { key: i, className: 'yj-tips-skel', style: { width: `${width}%` } }))),
      count > 1 && h('div', { className: 'yj-tips-rows' }, ...Array.from({ length: count - 1 }, (_, i) => h('div', { key: i, className: 'yj-tips-row yj-tips-ghost' }, h('span', { className: 'yj-tips-skel' }), h('span', { className: 'yj-tips-skel' })))));
    const sourceBadge = item => { const name = sourceName(item); return name && h('span', { className: 'yj-tips-source' }, h('i', { style: { '--yj-tips-mono': monoColor(name) }, 'aria-hidden': true }, name.trim().charAt(0).toUpperCase()), h('span', null, name)); };
    const tipBlock = (entry, report) => {
      const items = report.items, featured = featuredIndex(entry.date, items.length), main = items[featured];
      if (!main) return h('p', { className: 'yj-tips-slim-text' }, t('tipsEmptyDay'));
      const id = i => `${entry.date}#${i}`, rest = items.map((item, i) => ({ item, i })).filter(row => row.i !== featured);
      return h('div', { className: 'yj-tips-items' },
        h('article', { className: `yj-tips-feature${flash === id(featured) ? ' yj-tips-flash' : ''}`, 'data-tip': id(featured), 'aria-label': `${t('tipsFeatured')} · ${main.title}`, ...pressable(() => openTip(entry, featured)) },
          h('div', { className: 'yj-tips-feature-top' }, h('span', { className: 'yj-tips-tag' }, t('tipsFeatured')), h('span', { className: 'yj-tips-num' }, pad(featured + 1)), sourceBadge(main), h('span', { className: 'yj-tips-go', 'aria-hidden': true }, t('tipsMore'))),
          h('h3', null, main.title),
          leadText(main) && h('p', null, leadText(main))),
        rest.length > 0 && h('div', { className: 'yj-tips-rows' }, ...rest.map(({ item, i }) => h('div', { key: i, className: `yj-tips-row${flash === id(i) ? ' yj-tips-flash' : ''}`, 'data-tip': id(i), 'aria-label': item.title, ...pressable(() => openTip(entry, i)) },
          h('span', { className: 'yj-tips-num' }, pad(i + 1)), h('strong', null, item.title), h('small', null, sourceName(item)), h('span', { className: 'yj-tips-chevron', 'aria-hidden': true }, '›')))));
    };
    const slim = (slot, kind, label, ...text) => h('div', { ...slot, className: `yj-tips-entry yj-tips-slim yj-tips-${kind}` },
      h('div', { className: 'yj-tips-margin' }, h('span', { className: 'yj-tips-slimday' }, label)),
      h('div', { className: 'yj-tips-rail' }, h('span', { className: 'yj-tips-node', 'aria-hidden': true })),
      h('p', null, ...text));
    const renderEntry = (entry, i) => {
      const slot = { key: entry.key, 'data-index': i };
      if (entry.kind === 'day') {
        const report = store.loaded.get(entry.cutoff), { day, month } = dateParts(entry.date);
        return h('div', { ...slot, className: 'yj-tips-entry yj-tips-day', role: 'group', 'aria-label': f.full(entry.date) },
          h('div', { className: 'yj-tips-margin' },
            h('strong', { className: 'yj-tips-daynum' }, String(day)),
            h('span', { className: 'yj-tips-week' }, `${f.month(month)} · ${f.week(entry.date)}`),
            entry.today && h('span', { className: 'yj-tips-tag' }, t('tipsToday')),
            entry.status === 'partial' && h('span', { className: 'yj-tips-partial' }, t('tipsPartial'))),
          h('div', { className: 'yj-tips-rail' }, h('span', { className: `yj-tips-node${entry.today ? ' yj-tips-node-today' : ''}`, 'aria-hidden': true })),
          report ? tipBlock(entry, report) : skeleton(entry.count, true));
      }
      if (entry.kind === 'empty') return slim(slot, 'empty', String(dateParts(entry.date).day), t('tipsEmptyDay'));
      if (entry.kind === 'pending') return slim(slot, 'pending', String(dateParts(entry.date).day), h('strong', null, t('tipsToday')), ' · ', t('tipsPending'));
      if (entry.kind === 'gap') {
        const range = entry.length > 1 ? `${dateParts(entry.to).day}–${dateParts(entry.from).day}` : String(dateParts(entry.from).day);
        return slim(slot, 'gap', range, h('strong', null, t('tipsGap')), ' · ', entry.length === 1 ? t('tipsGapOne') : entry.length === 2 ? t('tipsGapTwo') : t('tipsGapMany', { count: entry.length }));
      }
      if (entry.kind === 'month') return h('div', { ...slot, className: 'yj-tips-entry yj-tips-month' }, h('span'), h('div', { className: 'yj-tips-rail' }), h('div', { className: 'yj-tips-monthline' }, f.monthYear(entry.month)));
      if (entry.kind === 'end') return h('div', { ...slot, className: 'yj-tips-entry yj-tips-end' }, h('span'), h('div', { className: 'yj-tips-rail' }, h('span', { className: 'yj-tips-node', 'aria-hidden': true })), h('p', null, `${f.full(entry.date)} · ${t('tipsFirst')}`));
      return h('div', { ...slot, className: 'yj-tips-entry yj-tips-end yj-tips-more' }, h('span'), h('div', { className: 'yj-tips-rail' }),
        failure && !pending ? failLine() : h('p', { className: 'yj-tips-note', role: 'status' }, spinner(), t('tipsLoadingMore')));
    };

    let timeline;
    if (index.status === 'failed' && !store.started && failure?.key === 'latest') {
      timeline = h('div', { className: 'yj-tips-error', role: 'alert' }, h('p', null, t('tipsFailed', { reason: failure.message })), h('button', { type: 'button', onClick: () => setAttempt(value => value + 1) }, t('tipsReload')));
    } else if (!ready) {
      // 首次读取：页边灰条、主卡和行的骨架。
      timeline = h('div', { className: 'yj-tips-line', 'aria-busy': true },
        ...[6, 4, 5].map((count, i) => h('div', { key: i, className: 'yj-tips-entry yj-tips-day', 'aria-hidden': true },
          h('div', { className: 'yj-tips-margin' }, h('span', { className: 'yj-tips-skel yj-tips-skel-day' }), h('span', { className: 'yj-tips-skel yj-tips-skel-week' })),
          h('div', { className: 'yj-tips-rail' }, h('span', { className: 'yj-tips-node', 'aria-hidden': true })),
          skeleton(count, false))));
    } else if (!entries.length) {
      timeline = h('div', { className: 'yj-tips-blank' }, h('span'), h('div', { className: 'yj-tips-rail' }, h('span', { className: 'yj-tips-node', 'aria-hidden': true })), h('p', null, t('tipsEmpty')));
    } else {
      const start = Math.min(view.start, entries.length - 1), end = Math.min(Math.max(view.end, start), entries.length - 1);
      timeline = h('div', { ref: list, className: 'yj-tips-line' },
        h('span', { className: 'yj-tips-fade', 'aria-hidden': true }),
        h('div', { className: 'yj-tips-spacer', style: { height: tops[start] }, 'aria-hidden': true }),
        ...entries.slice(start, end + 1).map((entry, k) => renderEntry(entry, start + k)),
        h('div', { className: 'yj-tips-spacer', style: { height: tops[entries.length] - tops[end + 1] }, 'aria-hidden': true }));
    }

    const current = detail && store.loaded.get(detail.cutoff);
    const detailView = current && current.items[detail.index] && (() => {
      const at = { ...detail, count: current.items.length };
      return h(TipDetail, { t, f, day: { date: detail.date }, report: current, index: detail.index, stepping: detail.step, externalLink, onClose: closeDetail, onStep: stepDetail,
        canPrev: Boolean(stepTip(days, at, -1)), canNext: Boolean(stepTip(days, at, 1)) || !complete });
    })();

    return h('section', { ref: root, className: `yj-tips${ruled ? ' yj-tips-ruled' : ''}${narrow ? ' yj-tips-narrow' : ''}`, style: { '--yj-tips-arm': `${armHeight}px`, '--yj-tips-columns': columns } },
      head,
      axis(),
      h('div', { className: 'yj-tips-body' },
        h('div', { ref: scroller, className: 'yj-tips-scroll', onScroll, onWheel: stopMotion, onTouchStart: stopMotion },
          h('div', { className: 'yj-tips-grid' }, timeline, ruled && ready && entries.length > 0 && arm()))),
      detailView);
  }

  return { TipsPage };
}
