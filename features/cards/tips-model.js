import { tipIndex } from './tip-index.js';

/** AI 使用技巧历史页的纯逻辑：日期换算、按天时间线、刻度尺几何、跨天导航。界面与测试共用，不碰 DOM。 */
export const tipsFieldId = 'ai-tips';
const dayMs = 86400000;
const later = (a, b) => a > b ? a : b, earlier = (a, b) => a < b ? a : b;

export const dayNumber = date => Math.floor(Date.parse(`${date}T00:00:00Z`) / dayMs);
export const dateOfDay = number => new Date(number * dayMs).toISOString().slice(0, 10);
export const shiftDate = (date, days) => dateOfDay(dayNumber(date) + days);
/** cutoff 是北京时间 08:00 即 UTC 00:00，日期直接取前 10 位。 */
export const cutoffDate = cutoff => cutoff.slice(0, 10);
/** “跳到某天”用 before = 目标日次日 00:00Z；沿用服务端 cutoff 的 ISO 写法。 */
export const nextDayCutoff = cutoff => new Date(Date.parse(cutoff) + dayMs).toISOString();
export const dateParts = date => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)), week: new Date(`${date}T00:00:00Z`).getUTCDay() });

// 与知识卡片其它来源圆徽同一套配色和取色公式，同一来源在首页和历史页颜色一致。
const monoColors = ['#2563eb', '#0d9488', '#d97706', '#db2777', '#7c3aed', '#0284c7', '#65a30d', '#e11d48'];
export const monoColor = name => monoColors[[...(name || '')].reduce((sum, char) => (sum * 31 + char.codePointAt(0)) >>> 0, 7) % monoColors.length];

/** 当天首页展示的那条；与首页技巧卡、详情序号同源。 */
export const featuredIndex = (date, count) => tipIndex(date, count);

/** 日期索引没读出来时，从已读的日报推出同样形状的索引（按日期倒序）。 */
export function daysFromReports(reports) {
  const byDate = new Map();
  for (const report of reports) {
    const date = cutoffDate(report.cutoff), known = byDate.get(date);
    if (!known || known.cutoff < report.cutoff) byDate.set(date, { date, cutoff: report.cutoff, count: report.items.length, status: report.status });
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * 时间线条目，新的在上：有技巧的日子（day）、当期为空（empty）、连续没有日报的日子折成一行（gap，按月拆开）、
 * 今天还没整理（pending），每逢换月先插一条月分隔（month），最后是终点（end）或“继续读取更早”（more）。
 * complete 为假表示更早的日报还没读到（只在没有日期索引时出现）。
 */
export function buildTimeline(days, { today, complete = true }) {
  const entries = [];
  if (!days.length) return entries;
  let month = null;
  const push = entry => {
    const key = (entry.date ?? entry.from).slice(0, 7);
    if (month !== null && key !== month) entries.push({ kind: 'month', key: `month:${key}`, month: key });
    month = key; entries.push(entry);
  };
  const gap = (from, to) => {
    for (let start = from; start >= to;) {
      const first = later(`${start.slice(0, 8)}01`, to);
      push({ kind: 'gap', key: `gap:${start}`, from: start, to: first, length: dayNumber(start) - dayNumber(first) + 1 });
      start = shiftDate(first, -1);
    }
  };
  let cursor = later(days[0].date, today);
  if (days[0].date < today) { push({ kind: 'pending', key: `pending:${today}`, date: today, today: true }); cursor = shiftDate(today, -1); }
  for (const day of days) {
    if (day.date > cursor) continue;
    if (day.date < cursor) gap(cursor, shiftDate(day.date, 1));
    push({ kind: day.count > 0 ? 'day' : 'empty', key: day.date, date: day.date, cutoff: day.cutoff, count: day.count, status: day.status, today: day.date === today });
    cursor = shiftDate(day.date, -1);
  }
  entries.push(complete ? { kind: 'end', key: 'end', date: days.at(-1).date } : { kind: 'more', key: 'more' });
  return entries;
}

/** 条目高度（含下方间距）。骨架与正文同高，估算即准确值；界面仍按实测修正。 */
export const tipsMetrics = Object.freeze({ top: 16, card: 134, cardGap: 12, row: 56, dayGap: 36, slim: 32, slimGap: 24, month: 48, end: 56 });
export const restRows = (count, columns) => count > 1 ? Math.ceil((count - 1) / columns) : 0;
export function entryHeight(entry, columns = 2) {
  const m = tipsMetrics;
  if (entry.kind === 'day') return m.card + (entry.count > 1 ? m.cardGap + restRows(entry.count, columns) * m.row : 0) + m.dayGap;
  if (entry.kind === 'month') return m.month;
  if (entry.kind === 'end' || entry.kind === 'more') return m.end;
  return m.slim + m.slimGap;
}
/** tops[i] 是第 i 条的顶边，tops[n] 是总高。 */
export function entryTops(entries, heightOf) {
  const tops = [0];
  for (const entry of entries) tops.push(tops.at(-1) + heightOf(entry));
  return tops;
}
/** 顶边不超过 y 的最后一条。 */
export function entryAt(tops, y) {
  let low = 0, high = tops.length - 2;
  if (high < 0) return -1;
  while (low < high) { const mid = (low + high + 1) >> 1; if (tops[mid] <= y) low = mid; else high = mid - 1; }
  return low;
}
/** 条目覆盖的日期，月分隔和“继续读取”没有日期。 */
export const entrySpan = entry => entry.kind === 'gap' ? { newest: entry.from, oldest: entry.to } : entry.date && entry.kind !== 'end' ? { newest: entry.date, oldest: entry.date } : null;
export const entryFor = (entries, date) => entries.findIndex(entry => entry.kind === 'gap' ? entry.from >= date && entry.to <= date : entry.date === date && entry.kind !== 'end');

// —— 定位与导航：只落在有技巧的日子 ——
export const tipDays = days => days.filter(day => day.count > 0);
/** 点到未整理或当期为空的日子：取更早一侧最近有技巧的那天，更早没有就取更新一侧最近的。 */
export function snapDay(days, date) {
  const list = tipDays(days);
  return list.find(day => day.date <= date) ?? list.at(-1) ?? null;
}
/** ↑（delta −1）到更新一个有技巧的日子，↓（+1）到更早一个。 */
export function stepDay(days, date, delta) {
  const list = tipDays(days), i = list.findIndex(day => day.date === date);
  if (i >= 0) return list[i + delta] ?? null;
  return delta > 0 ? list.find(day => day.date < date) ?? null : list.filter(day => day.date > date).at(-1) ?? null;
}
/** PageUp（−1）到更新一个有技巧的月份的最新一期，PageDown（+1）到更早一个月。 */
export function stepMonth(days, date, delta) {
  const list = tipDays(days), month = date.slice(0, 7);
  if (delta > 0) return list.find(day => day.date.slice(0, 7) < month) ?? null;
  const newer = list.filter(day => day.date.slice(0, 7) > month);
  if (!newer.length) return null;
  const target = newer.at(-1).date.slice(0, 7);
  return newer.find(day => day.date.startsWith(target));
}
export const monthLatest = (days, month) => tipDays(days).find(day => day.date.startsWith(month)) ?? null;
export const yearLatest = (days, year) => monthLatest(days, `${year}-`);
/**
 * S6 的上一条 / 下一条：先在当天各条之间切换，到头后跨到相邻有技巧的日子（跳过未整理和当期为空）。
 * 下一条往更早走、落在那天第一条；上一条往更新走、落在那天最后一条。到整个历史的尽头返回 null。
 */
export function stepTip(days, { date, cutoff, index, count }, delta) {
  if (delta > 0 && index < count - 1) return { date, cutoff, index: index + 1 };
  if (delta < 0 && index > 0) return { date, cutoff, index: index - 1 };
  const list = tipDays(days), i = list.findIndex(day => day.date === date);
  const next = i < 0 ? null : list[i + (delta > 0 ? 1 : -1)];
  return next ? { date: next.date, cutoff: next.cutoff, index: delta > 0 ? 0 : next.count - 1 } : null;
}

// —— 曲尺：横臂年份轴、竖臂月 / 日刻度 ——
/** 有技巧的年份，新的在前；期数按日报计，月格是否可点按有没有技巧。 */
export function yearsOf(days) {
  const years = new Map();
  for (const day of days) {
    const { year, month } = dateParts(day.date);
    if (!years.has(year)) years.set(year, { year, count: 0, tips: 0, months: Array.from({ length: 12 }, () => ({ count: 0, tips: 0 })) });
    const entry = years.get(year), cell = entry.months[month - 1];
    entry.count++; cell.count++;
    if (day.count > 0) { entry.tips++; cell.tips++; }
  }
  return [...years.values()].filter(entry => entry.tips > 0).sort((a, b) => b.year - a.year);
}
/** 年段右对齐，每年最宽 560；只有一年时占满整条。last 是该年最后一个不在未来的月份。 */
export function axisLayout(years, width, today) {
  if (!years.length) return [];
  const segment = years.length === 1 ? width : Math.min(560, width / years.length), now = dateParts(today);
  return years.map((entry, i) => ({ ...entry, left: width - segment * (i + 1), width: segment, cell: segment / 12, last: entry.year === now.year ? now.month : 12 }));
}
/**
 * 竖臂显示的日期范围：该年 1 月 1 日或这一年的第一期（取晚）到今天或年底（取早）。
 * 按这一年自己的第一期算，技巧从年中才开始时不会留出一大段空月份。
 */
export function armSpan(days, year, today) {
  const latest = later(today, days[0].date), inYear = days.filter(day => day.date.startsWith(`${year}-`));
  return { from: later(`${year}-01-01`, inYear.length ? inYear.at(-1).date : days.at(-1).date), to: earlier(`${year}-12-31`, latest) };
}
/** 新的月份在上；每天等距，月与月之间留 gap，数据不足时每天最多 maxStep。 */
export function armLayout({ from, to, height, maxStep = 8, gap = 6 }) {
  const months = [];
  for (let last = to; last >= from;) {
    const first = later(`${last.slice(0, 8)}01`, from);
    months.push({ key: last.slice(0, 7), first, last, days: dayNumber(last) - dayNumber(first) + 1 });
    last = shiftDate(first, -1);
  }
  const total = months.reduce((sum, month) => sum + month.days, 0);
  const step = total ? Math.min(maxStep, Math.max(0.5, (height - gap * (months.length - 1)) / total)) : maxStep;
  let y = 0;
  for (const month of months) { month.top = y; month.bottom = y + month.days * step; y = month.bottom + gap; }
  return { from, to, step, gap, months, height: months.length ? months.at(-1).bottom : 0 };
}
/** 某天的纵坐标 = 月顶 +（该月显示的最后一天 − 日）× 步长；超出范围贴到两端。 */
export function dayY(layout, date) {
  const month = layout.months.find(item => date >= item.first && date <= item.last);
  if (!month) return date > layout.to ? 0 : layout.height;
  return month.top + (dayNumber(month.last) - dayNumber(date)) * layout.step;
}
export function dateAtY(layout, y) {
  const { months, step, gap } = layout;
  if (!months.length) return null;
  const month = months.find(item => y < item.bottom + gap / 2) ?? months.at(-1);
  return shiftDate(month.last, -Math.max(0, Math.min(month.days - 1, Math.floor((y - month.top) / step))));
}
/** 日刻度长度 = 4 + 3 × 当天条数，最长 28；没有日报或当期为空画 3。 */
export const tickLength = day => day?.count > 0 ? Math.min(28, 4 + 3 * day.count) : 3;
/** 滑块盖住视口里看得到的日期，最小高 16。 */
export function thumbBox(layout, newest, oldest, minHeight = 16) {
  const top = dayY(layout, newest) - 2, height = Math.max(minHeight, dayY(layout, oldest) + 2 - top);
  return { top: Math.max(-2, Math.min(top, layout.height + 2 - height)), height };
}

/**
 * 视口附近还没读取的日子怎么取：紧挨着下面那期已经读过，说明是跳到旧月份后往上滚，用 after 往更新补读；
 * 其余用 before 从最新的缺口往下取。expect 是这次必须带回的那期，没带回按失败处理，避免反复请求。
 */
export function planFetch(entries, [start, end], has, days) {
  const missing = [];
  for (let i = Math.max(0, start); i <= end && i < entries.length; i++) if (entries[i].kind === 'day' && !has(entries[i].cutoff)) missing.push(entries[i]);
  if (!missing.length) return null;
  const newest = missing[0], oldest = missing.at(-1), older = days[days.findIndex(day => day.cutoff === oldest.cutoff) + 1];
  if (older && has(older.cutoff)) return { key: `after:${older.cutoff}`, input: { after: older.cutoff }, expect: oldest.cutoff };
  return { key: `before:${newest.cutoff}`, input: { before: nextDayCutoff(newest.cutoff) }, expect: newest.cutoff };
}
