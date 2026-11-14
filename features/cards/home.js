import { tipIndex } from './tip-index.js';
import { usageOfDay } from './usage-tips.js';

/**
 * 每日阅读首页（2026-11-14 改版）：每天一期，占满一屏、不整页滚动。
 * 左边今日资讯（一次看一个领域：头条一条加快讯几条），右边从上到下是今日一招、接着读、回顾。
 * 放不下时左右两边各自逐级收紧（样式按 data-d 0 到 3 收起次要信息），主区再窄换成三个页签。
 */

/** 这一期怎么排：照员工的情况挑的那些期，把第一条写了关联的提到最前当头条；其余保持日报原来的顺序。旧日报超过 8 条只显示前 8 条。 */
export function arrange(report) {
  const items = report.items.slice(0, 8);
  if (!report.personal) return items;
  const at = items.findIndex(item => item.relevance);
  return at > 0 ? [items[at], ...items.slice(0, at), ...items.slice(at + 1)] : items;
}
/** 存一条时认是哪一条：资讯按领域、期次和事件，技巧按期次和第几条。 */
export const newsKey = (report, item) => `news:${report.fieldId}:${report.cutoff}:${item.eventKey}`.slice(0, 400);
export const tipKey = tip => `tip:${tip.cutoff}:${tip.index}`;
/** 某一期技巧日报里“当天首页”那条；和后端 dailyTip 同一个算法。 */
export function tipOf(report) {
  const items = report?.items ?? [];
  if (!items.length) return null;
  const index = tipIndex(report.cutoff.slice(0, 10), items.length), item = items[index];
  return { title: item.title, brief: item.brief ?? item.summary ?? '', link: item.link ?? item.sources[0].url, source: item.sources[0].source.name, date: report.cutoff.slice(0, 10), fieldId: report.fieldId, index, count: items.length, cutoff: report.cutoff };
}
/** 看过哪些条：只记在这台电脑上（浏览器本机存储），留最近 30 期。 */
const seenKey = 'whalewing:cards:seen';
export const seenStore = {
  read() { try { const value = JSON.parse(globalThis.localStorage?.getItem(seenKey) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } },
  add(issue, key) {
    const value = this.read(), list = Array.isArray(value[issue]) ? value[issue] : [];
    if (list.includes(key)) return value;
    const kept = Object.fromEntries(Object.entries({ ...value, [issue]: [...list, key].slice(-40) }).sort((a, b) => b[0].slice(-24).localeCompare(a[0].slice(-24))).slice(0, 30));
    try { globalThis.localStorage?.setItem(seenKey, JSON.stringify(kept)); } catch { /* 存不下只是下次不变淡 */ }
    return kept;
  },
};
/** 主区不到这个宽度时换成页签。 */
export const tabsBelow = 780;
/**
 * 一块内容放不放得下：从最宽松的一级开始试，收到放得下为止。第 0 到 3 级是收起次要信息、换小号；
 * 第 3 级还放不下就到第 4 级：这一块里的列表在自己那一块里滚，整页仍然不滚。
 */
export const fitLevels = 4;
export function fitRegion(element) {
  for (let level = 0; level <= fitLevels; level += 1) {
    element.dataset.d = String(level);
    if (element.scrollHeight <= element.clientHeight + 1) break;
  }
  return Number(element.dataset.d);
}

export function createHomeBoard(kit, { BookCover }) {
  const { React, ActionMenu } = kit;
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect } = React;
  const bookmark = () => h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true }, h('path', { d: 'M4 2.5h8v11.2L8 10.9l-4 2.8z' }));
  const grow = () => h('span', { className: 'ww-read-grow' });

  return function HomeBoard({ t, busy, button, home, reading, loadImage, opening, format, assistant, actions }) {
    const root = useRef(null);
    const [form, setForm] = useState('board'), [tab, setTab] = useState('news');
    const [fieldId, setFieldId] = useState(null), [past, setPast] = useState(null), [loading, setLoading] = useState(false);
    const [newsTab, setNewsTab] = useState('today'), [tipTab, setTipTab] = useState('ai');
    const [usage, setUsage] = useState({ shift: 0, seen: false });
    const [rv, setRv] = useState({ index: 0, extra: null, done: false });
    const [seen, setSeen] = useState(() => seenStore.read());
    const [, setTick] = useState(0);
    // 按主区自己的宽度换形态（停靠小鲸会让出一块），不按窗口猜；宽高一变就重新量放不放得下。
    useEffect(() => {
      const element = root.current;
      if (!element) return;
      const measure = () => { setForm(element.clientWidth < tabsBelow ? 'tabs' : 'board'); setTick(value => value + 1); };
      measure();
      if (typeof ResizeObserver !== 'function') return;
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }, []);
    useLayoutEffect(() => { for (const element of root.current?.querySelectorAll('.ww-read-fit') ?? []) if (element.offsetParent !== null) fitRegion(element); });

    const learning = home.learning, today = learning.date, settings = reading?.settings ?? { personal: false, diary: false, usage: true, weekly: false, review: 0 };
    const reports = home.reports, latest = reports.find(report => report.fieldId === fieldId) ?? reports[0] ?? null;
    const back = past && latest && past.fieldId === latest.fieldId ? past : null;
    const shown = back ? back.reports[back.index] : latest;
    const date = shown?.cutoff.slice(0, 10) ?? today, isToday = date === today;
    const items = shown ? arrange(shown) : [], personal = Boolean(shown?.personal);
    const issue = shown ? `${shown.fieldId}/${shown.cutoff}` : '';
    const seenOf = item => (seen[issue] ?? []).includes(item.eventKey);
    const markSeen = item => setSeen(seenStore.add(issue, item.eventKey));
    const captures = new Map((reading?.captures ?? []).map(capture => [capture.key, capture]));
    const briefOf = item => item.brief ?? item.summary ?? '', urlOf = item => item.link ?? item.sources[0]?.url ?? '';
    const chip = (on, onClick, label, key) => h('button', { type: 'button', key, className: 'ww-chip', 'aria-pressed': on, disabled: busy, onClick }, label);

    // 翻到前一期、后一期：第一次往前翻时读这个领域已保存的日报（一次 30 期）和同一天的技巧。
    const step = async delta => {
      if (!latest || loading) return;
      if (back) {
        const index = back.index + delta;
        if (index <= 0) return setPast(null);
        if (index >= back.reports.length) return actions.info(t('homeNoOlder'));
        return setPast({ ...back, index });
      }
      if (delta < 0) return;
      setLoading(true);
      try {
        const [list, tips] = await Promise.all([actions.loadReports(latest.fieldId), actions.loadReports('ai-tips').catch(() => [])]);
        const index = list.findIndex(report => report.cutoff === latest.cutoff) + 1;
        if (!index || index >= list.length) actions.info(t('homeNoOlder'));
        else { setNewsTab('today'); setPast({ fieldId: latest.fieldId, reports: list, tips, index }); }
      } catch (reason) { actions.fail(reason); } finally { setLoading(false); }
    };

    const summary = () => {
      const saved = reading?.counts.captures ?? 0, marks = reading?.counts.highlights ?? 0;
      const missing = learning.books.filter(book => book.missing || !book.chapter).length, partial = reports.filter(report => report.cutoff.slice(0, 10) === today && report.status === 'partial').length;
      return [
        !shown ? t('homeSummaryNone', { saved, marks }) : back ? t('homeSummaryPast', { date: format.short(date), count: items.length })
          : !isToday ? t('homeSummaryOld', { date: format.short(date), saved, marks })
            : items.length ? t('homeSummary', { count: items.length, seen: items.filter(seenOf).length, saved, marks }) : t('homeSummaryEmpty', { saved, marks }),
        learning.issue && t('cardsSummaryShelfIssue'), missing > 0 && t('cardsSummaryMissing', { count: missing }), partial > 0 && t('cardsSummaryPartial', { count: partial }),
        // reading 还没读回来是 undefined，读失败才是 null。
        reading === null && t('homeReadingFailed'),
      ].filter(Boolean).join(' · ');
    };

    const saveControl = (key, payload, icon) => {
      const saved = captures.get(key), label = t(saved ? 'homeSavedOpen' : 'homeSave');
      const props = { type: 'button', disabled: busy || !reading, 'aria-pressed': Boolean(saved), onClick: () => saved ? actions.showSaved(saved) : actions.saveItem({ key, ...payload }) };
      return icon ? h('button', { ...props, className: 'ww-read-mark', title: label, 'aria-label': label }, bookmark()) : h('button', { ...props, className: 'ww-read-btn' }, t(saved ? 'homeSaved' : 'homeSave'));
    };
    const sourceLink = (url, onOpen) => {
      try { const parsed = new URL(url); if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return h('a', { className: 'ww-read-btn', href: url, target: '_blank', rel: 'noopener noreferrer', onClick: onOpen }, t('homeViewSource')); } catch { /* 不是网页地址就不给“查看来源” */ }
      return null;
    };
    const statusTag = item => !item.label ? null : item.label === 'leak' ? h('span', { className: 'ww-tag ww-read-tag-leak' }, t('newsLeak'))
      : h('span', { className: 'ww-tag ww-read-tag-plain' }, t(item.label === 'official' ? 'homeOfficial' : item.label === 'headline' ? 'newsHeadline' : 'newsMediaOnly'));
    const openItem = (item, index) => { markSeen(item); actions.openItem({ report: shown, item, index, total: items.length }); };
    const captureOf = item => ({ title: item.title, brief: briefOf(item), url: urlOf(item) });

    const leadCard = item => h('article', { className: `ww-read-lead${seenOf(item) ? ' ww-read-seen' : ''}` },
      h('div', { className: 'ww-read-row' }, h('span', { className: 'ww-tag ww-read-tag-me' }, t('homeLead')), item.category && h('span', { className: 'ww-tag' }, t(`newsCat_${item.category}`)), statusTag(item), grow(), h('span', { className: 'ww-read-hint' }, format.when(item.sources[0]?.publishedAt))),
      h('button', { type: 'button', className: 'ww-read-t ww-read-lead-t', disabled: busy, onClick: () => openItem(item, 0) }, h('span', null, item.title)),
      briefOf(item) && h('p', { className: 'ww-read-lead-d' }, briefOf(item)),
      personal && item.relevance && h('p', { className: 'ww-read-rel' }, h('b', null, t('homeRelation')), item.relevance),
      h('div', { className: 'ww-read-row' }, sourceLink(urlOf(item), () => markSeen(item)), saveControl(newsKey(shown, item), captureOf(item)), grow(), h('span', { className: 'ww-read-hint' }, t('homeSources', { count: item.sources.length }))),
      h('i', { className: 'ww-orn-wave', 'aria-hidden': true }));
    const quickRow = (item, index) => h('li', { key: item.eventKey, className: `ww-read-q${seenOf(item) ? ' ww-read-seen' : ''}` },
      h('span', { className: 'ww-read-q-n', 'aria-hidden': true }, index + 1),
      h('div', { className: 'ww-read-q-m' }, h('button', { type: 'button', className: 'ww-read-t ww-read-q-t', disabled: busy, onClick: () => openItem(item, index) }, h('span', null, item.title)), briefOf(item) && h('span', { className: 'ww-read-q-d' }, briefOf(item))),
      personal && item.relevance && h('span', { className: 'ww-tag ww-read-tag-me' }, t('homeRelated')), statusTag(item),
      h('span', { className: 'ww-read-q-s' }, format.when(item.sources[0]?.publishedAt)), saveControl(newsKey(shown, item), captureOf(item), true));

    const newsPane = () => {
      const picks = shown?.week?.picks ?? [], week = picks.length > 0 && newsTab === 'week';
      return h('section', { className: 'ww-read-pane ww-read-news' },
        h('header', { className: 'ww-read-head' },
          h('h3', null, t(week ? 'homeWeek' : 'homeNews')), h('small', null, week ? t('homeWeekMeta', { count: picks.length }) : shown ? t('homeCount', { count: items.length }) : ''),
          reports.length > 1 && h('div', { className: 'ww-read-chips', role: 'group', 'aria-label': t('homeFields') }, ...reports.map(report => chip(report.fieldId === latest.fieldId, () => { setFieldId(report.fieldId); setPast(null); setNewsTab('today'); }, report.fieldName, report.fieldId))),
          picks.length > 0 && h('div', { className: 'ww-read-chips' }, chip(!week, () => setNewsTab('today'), t('homeWeekToday'), 'today'), chip(week, () => setNewsTab('week'), t('homeWeek'), 'week')),
          // “怎么挑的”和菜单捆在一起靠右：标题行挤了就两个一起换到下一行，不让菜单单独掉下去。
          h('div', { className: 'ww-read-headend' },
            h('button', { type: 'button', className: 'ww-chip', 'data-on': settings.personal, disabled: busy || !reading, onClick: () => actions.openMe(shown) }, t(settings.personal ? 'homeMeOn' : 'homeMeOff')),
            shown && h(ActionMenu, { label: t('homeNewsMenu', { name: shown.fieldName }), iconOnly: true }, button('newsDiagnostics', () => actions.runDetails(shown)), button('newsReports', () => actions.history({ id: shown.fieldId, name: shown.fieldName }))))),
        h('div', { className: 'ww-read-fit ww-read-newsbody' }, week
          ? h(React.Fragment, null,
            h('ol', { className: 'ww-read-quick', style: { '--n': picks.length } }, ...picks.map((pick, index) => h('li', { key: `${pick.date}/${index}`, className: 'ww-read-q' },
              h('span', { className: 'ww-read-q-n', 'aria-hidden': true }, index + 1),
              h('div', { className: 'ww-read-q-m' }, h('span', { className: 'ww-read-q-t' }, pick.title)), h('span', { className: 'ww-read-q-s' }, format.short(pick.date)), sourceLink(pick.link)))),
            h('p', { className: 'ww-read-wkme' }, t('homeWeekMine', { captures: reading?.lastWeek.captures ?? 0, marks: reading?.lastWeek.highlights ?? 0 }), ' ', h('button', { type: 'button', className: 'ww-read-link', disabled: busy, onClick: actions.weekNote }, t('homeWeekNote'))))
          : !shown ? h('p', { className: 'ww-read-blank' }, t('homeNewsNone'))
            : !items.length ? h('p', { className: 'ww-read-blank' }, t('homeNewsEmpty'))
              : h(React.Fragment, null, leadCard(items[0]), items.length > 1 && h('ul', { className: 'ww-read-quick', style: { '--n': items.length - 1 } }, ...items.slice(1).map((item, index) => quickRow(item, index + 1))))));
    };

    // 今日一招：AI 技巧和鲸翼的用法两页；换成页签那种窄排法时两张都显示。
    const tip = back ? tipOf(back.tips?.find(report => report.cutoff === shown.cutoff)) : learning.tip;
    // “往期”进技巧历史页，并定位到卡上这一条。
    const pastLink = () => h('button', { type: 'button', className: 'ww-read-link', disabled: busy, onClick: () => actions.openTips(tip ? { date: tip.date, index: tip.index } : null) }, t('homeTipPast'));
    const aiCard = () => {
      const field = learning.tipField, name = field.name || t('learningTip');
      if (!field.enabled) return h('article', { className: 'ww-read-tipcard' }, h('div', { className: 'ww-read-row' }, h('span', { className: 'ww-read-kind' }, t('homeTipAi'))), h('h4', null, t('learningTipDisabled', { name })),
        h('div', { className: 'ww-read-row ww-read-foot' }, h('button', { type: 'button', className: 'ww-read-btn', disabled: busy, onClick: actions.editTipSources }, t('learningTipEnable'))));
      // 今天这一期已经整理过、只是没挑出技巧（近 14 天的索引里有今天、条数是 0）：照实说今天没有，不再写“08:00 后整理好”。
      const emptyToday = !back && !tip && learning.tipRecent.some(entry => entry.date === today && !entry.count);
      if (!tip) return h('article', { className: 'ww-read-tipcard' }, h('div', { className: 'ww-read-row' }, h('span', { className: 'ww-read-kind' }, t('homeTipAi'))), h('h4', null, t(back ? 'homeTipNone' : emptyToday ? 'homeTipEmptyToday' : 'learningTipWaiting')), !back && h('p', null, t(emptyToday ? 'homeTipEmptyTodayText' : 'learningTipEmpty')), h('div', { className: 'ww-read-row ww-read-foot' }, grow(), pastLink()));
      const end = Date.parse(`${today}T00:00:00Z`);
      const days = Array.from({ length: 14 }, (_, index) => { const day = new Date(end - (13 - index) * 86400000).toISOString().slice(0, 10), found = learning.tipRecent.find(entry => entry.date === day); return { day, state: !found?.count ? 'none' : found.status === 'partial' ? 'partial' : 'issued' }; });
      return h('article', { className: 'ww-read-tipcard' },
        h('div', { className: 'ww-read-row' }, h('span', { className: 'ww-read-kind' }, t('homeTipAi')), h('span', { className: 'ww-read-hint' }, [tip.source, tip.date !== today && format.short(tip.date)].filter(Boolean).join(' · '))),
        h('h4', null, tip.title), tip.brief && h('p', null, tip.brief),
        !back && h('div', { className: 'ww-read-row ww-read-ticksrow', 'aria-hidden': true }, h('span', { className: 'ww-read-ticks' }, ...days.map(entry => h('i', { key: entry.day, 'data-day': entry.state, 'data-today': entry.day === today || undefined }))), h('span', { className: 'ww-read-hint' }, t('learningTipRecent'))),
        h('div', { className: 'ww-read-row ww-read-foot' }, h('button', { type: 'button', className: 'ww-read-btn ww-primary', disabled: busy, onClick: () => actions.tryTip(tip) }, t('homeTipTry', { assistantShort: assistant })), saveControl(tipKey(tip), { title: tip.title, brief: tip.brief, url: tip.link }), grow(), pastLink()));
    };
    const usageCard = () => {
      const entry = usageOfDay(today, usage.shift);
      return h('article', { className: 'ww-read-tipcard' },
        h('div', { className: 'ww-read-row' }, h('span', { className: 'ww-read-kind ww-read-kind-usage' }, t('homeTipUsage')), h('span', { className: 'ww-read-hint' }, t('homeTipUsageNote'))),
        h('h4', null, entry.title), h('p', null, entry.how),
        h('div', { className: 'ww-read-row ww-read-foot' }, h('button', { type: 'button', className: 'ww-read-btn', disabled: busy, onClick: () => actions.usageGo(entry) }, entry.feature === 'launcher' ? t('homeUsageLauncher') : t('homeUsageGo', { name: entry.where })),
          h('button', { type: 'button', className: 'ww-read-btn ww-ghost', disabled: busy, onClick: () => setUsage(value => ({ shift: value.shift + 1, seen: true })) }, t('homeUsageNext'))));
    };
    const tipPane = () => {
      const hasAi = Boolean(learning.tipField && !learning.tipField.deleted), usageOn = settings.usage && !back, both = form === 'tabs';
      if (!hasAi && !usageOn) return null;
      const showUsage = usageOn && (both || !hasAi || tipTab === 'usage'), showAi = hasAi && (both || !showUsage);
      return h('section', { className: 'ww-read-pane ww-read-tip' },
        h('header', { className: 'ww-read-head' }, h('h3', null, t('homeTip')), h('i', { className: 'ww-cloud', 'aria-hidden': true }), grow(),
          hasAi && usageOn && !both && h('div', { className: 'ww-read-chips' }, chip(!showUsage, () => setTipTab('ai'), t('homeTipAi'), 'ai'),
            chip(showUsage, () => { setTipTab('usage'); setUsage(value => ({ ...value, seen: true })); }, [t('homeTipUsage'), !usage.seen && h('i', { key: 'dot', className: 'ww-read-dot', title: t('homeTipUsageNew') })], 'usage')),
          ),
        h('div', { className: 'ww-read-cards' }, showAi && aiCard(), showUsage && usageCard()));
    };

    // 接着读：每本常看书一行；只有一本时下面列“接下来”三章；零本只放占位。
    const bookMenu = (book, ...entries) => h('div', { className: 'ww-book-menu' }, h(ActionMenu, { label: t('homeBookActions', { title: book.title }), iconOnly: true }, ...entries));
    const bookRow = (book, single) => {
      const accent = { '--ww-accent': format.accent(book.title) };
      if (book.missing || !book.chapter) return h('div', { className: 'ww-read-bookrow', key: book.id, 'data-missing': true, style: accent },
        h('div', { className: 'ww-read-bookopen' }, h(BookCover, { load: loadImage, book, size: 'xs' }), h('span', { className: 'ww-read-booktxt' }, h('strong', null, t('learningMissingTitle', { title: book.title })), h('small', null, t('learningMissingText')))),
        bookMenu(book, button('libraryUnpin', () => actions.setPinned(book, false)), button('libraryRemove', () => actions.removeBook(book))));
      const { chapter } = book, percent = book.finished ? 100 : Math.round(chapter.index / book.chapters * 100), marks = reading?.byBook[book.id] ?? 0;
      return h('div', { className: 'ww-read-bookrow', key: book.id, style: accent, 'aria-busy': opening === book.id || undefined },
        h('button', { type: 'button', className: 'ww-read-bookopen', disabled: busy, 'aria-label': book.finished ? t('learningRereadLabel', { title: book.title }) : t('learningReadLabel', { title: book.title, index: chapter.index + 1, chapter: chapter.title }), onClick: () => actions.openChapter(book, chapter.index) },
          h(BookCover, { load: loadImage, book, size: 'xs' }),
          h('span', { className: 'ww-read-booktxt' },
            h('small', null, book.finished ? t('learningFinished') : `${t('learningChapter', { index: chapter.index + 1, count: book.chapters })} · ${t('learningMinutes', { minutes: format.minutes(chapter.chars) })}`),
            h('strong', null, book.finished ? book.title : chapter.title),
            h('span', { className: 'ww-read-bar', 'aria-hidden': true }, h('i', { style: { width: `${percent}%` } })),
            h('small', null, h('b', { className: 'ww-read-booktitle' }, book.title), ` · ${t('homeBookLine', { percent, marks })}`))),
        bookMenu(book, button('librarySwap', () => actions.openPins(book.id)), single && button('libraryPinAdd', () => actions.openPins(null)), button('libraryUnpin', () => actions.setPinned(book, false)), button('libraryShowInShelf', () => actions.openLibrary({ id: book.id }))),
        h('i', { className: 'ww-orn-spine', 'aria-hidden': true }));
    };
    const bookPane = () => {
      const books = learning.books, only = books.length === 1 && !books[0].missing && books[0].chapter ? books[0] : null;
      const meta = learning.daily ? t('learningMeta', { daily: learning.daily, total: learning.total }) : learning.total ? t('learningNoPin', { total: learning.total }) : t('learningShelfEmpty');
      return h('section', { className: 'ww-read-pane ww-read-book' },
        h('header', { className: 'ww-read-head' }, h('h3', null, t('homeBook')), h('small', null, meta)),
        learning.issue ? h('p', { className: 'ww-read-blank', role: 'status' }, t('learningIssue', { reason: learning.issue }), h('button', { type: 'button', className: 'ww-read-btn', disabled: busy, onClick: actions.reload }, t('learningReload')))
          : !books.length ? h('button', { type: 'button', className: 'ww-read-add', disabled: busy, 'aria-label': learning.total ? t('learningAddPinLabel') : undefined, onClick: () => learning.total ? actions.openPins(null) : actions.openLibrary({ id: 'import' }) },
            h('strong', null, `＋ ${t(learning.total ? 'learningAddPin' : 'learningEmptyTitle')}`), h('small', null, t(learning.total ? 'learningAddPinText' : 'learningEmptyText')))
            : h('div', { className: 'ww-read-books' }, ...books.map(book => bookRow(book, books.length === 1))),
        only && only.next.length > 0 && h('div', { className: 'ww-read-next' },
          ...only.next.map(entry => h('button', { type: 'button', key: entry.index, className: 'ww-read-nextrow', disabled: busy, onClick: () => actions.openChapter(only, entry.index) }, h('small', null, t('learningChapterShort', { index: entry.index + 1 })), h('strong', null, entry.title), h('small', null, t('learningMinutes', { minutes: format.minutes(entry.chars) })))),
          h('button', { type: 'button', className: 'ww-read-link', disabled: busy, onClick: () => actions.openChapter(only, only.chapter.index, true) }, t('learningAllChapters', { count: only.chapters }))));
    };

    // 回顾：到期的划线一次显示一条、能翻；页签排法时都显示。
    const reviewPane = () => {
      if (!reading || !settings.review && !rv.extra) return null;
      const list = rv.extra ?? reading.review, all = form === 'tabs', index = Math.min(rv.index, Math.max(0, list.length - 1));
      const looked = async highlight => { await actions.looked(highlight.id); setRv(value => ({ index: 0, extra: value.extra ? value.extra.filter(entry => entry.id !== highlight.id) : null, done: true })); };
      const more = async () => { const next = await actions.more(); if (next && !next.length) actions.info(t('homeReviewNoMore')); if (next?.length) setRv({ index: 0, extra: next, done: true }); };
      const quote = highlight => h('article', { className: 'ww-read-quote', key: highlight.id },
        h('blockquote', null, highlight.text), highlight.note && h('p', { className: 'ww-read-mine' }, t('homeReviewMine', { note: highlight.note })),
        h('p', { className: 'ww-read-from' }, t('homeReviewFrom', { title: highlight.bookTitle, index: highlight.chapter + 1, date: format.short(format.day(highlight.at)) })),
        h('div', { className: 'ww-read-row ww-read-foot' }, h('button', { type: 'button', className: 'ww-read-btn', disabled: busy, onClick: () => looked(highlight) }, t('homeReviewLooked')), h('button', { type: 'button', className: 'ww-read-btn ww-ghost', disabled: busy, onClick: () => actions.openMark(highlight) }, t('homeReviewGo'))));
      return h('section', { className: 'ww-read-pane ww-read-rv' },
        h('header', { className: 'ww-read-head' }, h('h3', null, t('homeReview')), h('small', null, list.length ? t('homeReviewMeta', { count: list.length }) : t('homeReviewIdle')), grow(),
          !all && list.length > 1 && h('span', { className: 'ww-read-stepper' },
            h('button', { type: 'button', className: 'ww-read-nav', 'aria-label': t('homeReviewPrev'), disabled: busy, onClick: () => setRv(value => ({ ...value, index: (index - 1 + list.length) % list.length })) }, '‹'),
            h('span', { className: 'ww-read-hint' }, `${index + 1} / ${list.length}`),
            h('button', { type: 'button', className: 'ww-read-nav', 'aria-label': t('homeReviewNext'), disabled: busy, onClick: () => setRv(value => ({ ...value, index: (index + 1) % list.length })) }, '›'))),
        h('div', { className: 'ww-read-cards' }, list.length ? (all ? list : list.slice(index, index + 1)).map(quote)
          : h('p', { className: 'ww-read-blank' }, t(!reading.counts.highlights ? 'homeReviewEmpty' : rv.done ? 'homeReviewDone' : 'homeReviewWaiting'),
            reading.counts.highlights > 0 && h('button', { type: 'button', className: 'ww-read-link', disabled: busy, onClick: more }, t('homeReviewMore')))));
    };

    return h('div', { ref: root, className: 'ww-read', 'data-form': form, 'data-tab': tab },
      h('header', { className: 'ww-news-header ww-pagehead' }, h('div', null, h('h2', null, t('news')), h('p', null, summary())),
        h('div', { className: 'ww-pagehead-actions' },
          h('span', { className: 'ww-read-stepper' },
            h('button', { type: 'button', className: 'ww-read-nav', 'aria-label': t('homePrev'), title: t('homePrev'), disabled: busy || loading || !latest, onClick: () => step(1) }, '‹'),
            h('b', null, format.date(date)),
            h('button', { type: 'button', className: 'ww-read-nav', 'aria-label': t('homeNext'), title: t('homeNext'), disabled: busy || loading || !back, onClick: () => step(-1) }, '›')),
          button('library', () => actions.openLibrary()), button('newsSettings', actions.openSettings))),
      form === 'tabs' && h('nav', { className: 'ww-read-tabs', 'aria-label': t('homeTabs') }, chip(tab === 'news', () => setTab('news'), t('homeTabNews', { count: items.length }), 'news'), chip(tab === 'tip', () => setTab('tip'), t('homeTip'), 'tip'), chip(tab === 'read', () => setTab('read'), t('homeTabRead'), 'read')),
      h('div', { className: 'ww-read-board' }, newsPane(), h('div', { className: 'ww-read-side ww-read-fit' }, tipPane(), bookPane(), reviewPane())));
  };
}
