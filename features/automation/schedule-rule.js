/**
 * 定时规则的中文说明和之后几次运行时间，纯函数，浏览器和宿主都能用。
 * 接受两种形状：原生任务记录（kind: after/at/every/daily/weekly/cron，带 scheduledAt、time、timeZone、weekdays、expression、everySeconds）
 * 和创建时的规则（after_seconds / at / every_seconds / daily / weekly / cron 六选一）。
 * 计算口径与 DSH 定时服务一致：钟表时间按规则自己的时区，缺失的本地时间跳过，重叠时间取较早一次；展示一律用北京时间。
 */
const beijing = 'Asia/Shanghai';
const weekdayNames = ['', '一', '二', '三', '四', '五', '六', '日'];

/** 把两种形状统一成 { kind, ... }；认不出的返回 null。 */
export function normalizeRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  if (typeof rule.kind === 'string') {
    const kind = rule.kind === 'after' ? 'at' : rule.kind;
    return { kind, at: rule.scheduledAt, time: rule.time, timeZone: rule.timeZone || beijing, weekdays: rule.weekdays, expression: rule.expression, everySeconds: rule.everySeconds, anchor: rule.scheduledAt };
  }
  if (rule.daily) return { kind: 'daily', time: rule.daily.time, timeZone: rule.daily.time_zone || beijing };
  if (rule.weekly) return { kind: 'weekly', time: rule.weekly.time, timeZone: rule.weekly.time_zone || beijing, weekdays: rule.weekly.weekdays };
  if (rule.cron) return { kind: 'cron', expression: rule.cron.expression, timeZone: rule.cron.time_zone || beijing };
  if (rule.at !== undefined) return { kind: 'at', at: rule.at };
  if (rule.after_seconds !== undefined) return { kind: 'after', seconds: rule.after_seconds };
  if (rule.every_seconds !== undefined) return { kind: 'every', everySeconds: rule.every_seconds };
  return null;
}

const instant = value => {
  const time = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(time) ? time : NaN;
};

// ---- 时区换算：只用浏览器和 Node 自带的 Intl 数据 ----
const formatters = new Map();
function partsAt(time, zone) {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
    formatters.set(zone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(new Date(time)).map(part => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second), weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1 };
}
const offsetAt = (time, zone) => {
  const p = partsAt(time, zone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(time / 1000) * 1000;
};
/** 本地钟表时间换成时刻；不存在（夏令时跳过）返回 null，重叠取较早一次。 */
function zoned(year, month, day, hour, minute, second, ms, zone) {
  const local = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const candidates = new Set([offsetAt(local - 43200000, zone), offsetAt(local + 43200000, zone)].map(offset => local - offset));
  const matches = [...candidates].filter(time => {
    const p = partsAt(time, zone);
    return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute && p.second === second;
  }).sort((a, b) => a - b);
  return matches.length ? matches[0] : null;
}
const zoneValid = zone => { try { partsAt(0, zone); return true; } catch { return false; } };

function parseTime(text) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(String(text ?? ''));
  if (!match) return null;
  const [hour, minute, second = 0] = match.slice(1, 4).map(Number);
  const ms = match[4] ? Number(match[4].padEnd(3, '0')) : 0;
  return hour < 24 && minute < 60 && second < 60 ? { hour, minute, second, ms } : null;
}
const clock = ({ hour, minute, second }) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}${second ? ':' + String(second).padStart(2, '0') : ''}`;
const zoneNote = zone => zone && zone !== beijing ? `（${zone} 时间）` : '';

function weekdayText(days) {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return '每天';
  if (set.join() === '1,2,3,4,5') return '每个工作日';
  if (set.join() === '6,7') return '每个周末';
  return '每周' + set.map(day => weekdayNames[day]).join('、');
}

// ---- cron：五字段 Vixie 方言，和 DSH 定时服务接受的写法一致 ----
const cronFields = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
function parseField(text, [low, high]) {
  const values = new Set();
  for (const part of text.split(',')) {
    const match = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!match) return null;
    const step = match[4] === undefined ? 1 : Number(match[4]);
    let from = low, to = high;
    // DSH 只接受 */n 和 a-b/n 两种步长，单个数字带步长按读不懂处理。
    if (match[1] !== '*') {
      if (match[3] === undefined && match[4] !== undefined) return null;
      from = Number(match[2]); to = match[3] === undefined ? from : Number(match[3]);
    }
    if (!step || from < low || to > high || from > to) return null;
    for (let value = from; value <= to; value += step) values.add(value);
  }
  return values;
}
/** 读不懂的表达式返回 null（含 L、W、#、月份或星期名称、@daily 和六字段）。 */
export function parseCron(expression) {
  const fields = String(expression ?? '').trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const sets = fields.map((field, i) => parseField(field, cronFields[i]));
  if (sets.some(set => !set)) return null;
  const [minutes, hours, days, months, weekdays] = sets;
  if (weekdays.has(7)) { weekdays.delete(7); weekdays.add(0); }
  return { fields, minutes, hours, days, months, weekdays, dayStar: fields[2].startsWith('*'), weekStar: fields[4].startsWith('*') };
}
const cronDay = (cron, { month, day, weekday }) => {
  if (!cron.months.has(month)) return false;
  const dom = cron.days.has(day), dow = cron.weekdays.has(weekday % 7);
  // 任一字段以 * 开头时两个都要满足；都不是时满足其一即可。
  return cron.dayStar || cron.weekStar ? dom && dow : dom || dow;
};
const single = set => set.size === 1 ? [...set][0] : null;
const stepOf = (field, high) => { const match = /^\*\/(\d+)$/.exec(field); return match && Number(match[1]) > 1 && Number(match[1]) <= high ? Number(match[1]) : null; };

function describeCron(expression, zone) {
  const cron = parseCron(expression);
  const fallback = `按 Cron 表达式：${String(expression ?? '').trim()}${zoneNote(zone)}`;
  if (!cron) return fallback;
  const [minuteField, hourField, dayField, monthField, weekField] = cron.fields;
  const minute = single(cron.minutes), hour = single(cron.hours), note = zoneNote(zone);
  const allDays = dayField === '*' && monthField === '*' && weekField === '*';
  if (allDays && hourField === '*' && minuteField === '*') return `每分钟${note}`;
  if (allDays && hourField === '*' && stepOf(minuteField, 59)) return `每 ${stepOf(minuteField, 59)} 分钟${note}`;
  if (allDays && hourField === '*' && minute !== null) return `每小时${minute ? `第 ${minute} 分` : '整点'}${note}`;
  if (allDays && stepOf(hourField, 23) && minute !== null) return `每 ${stepOf(hourField, 23)} 小时${minute ? `（第 ${minute} 分）` : '（整点）'}${note}`;
  if (minute === null || cron.hours.size > 6 || /[*/-]/.test(hourField)) return fallback;
  const times = [...cron.hours].sort((a, b) => a - b).map(value => clock({ hour: value, minute, second: 0 })).join('、');
  if (allDays) return `每天 ${times}${note}`;
  if (dayField === '*' && monthField === '*' && !weekField.startsWith('*')) return `${weekdayText([...cron.weekdays].map(day => day || 7))} ${times}${note}`;
  if (weekField === '*' && !dayField.startsWith('*') && cron.days.size <= 3 && !/[/-]/.test(dayField)) {
    const days = [...cron.days].sort((a, b) => a - b).join('、');
    if (monthField === '*') return `每月 ${days} 日 ${times}${note}`;
    if (single(cron.months) !== null) return `每年 ${single(cron.months)} 月 ${days} 日 ${times}${note}`;
  }
  return fallback;
}

function onceText(time, now) {
  if (!Number.isFinite(time)) return '只运行一次';
  const p = partsAt(time, beijing), year = partsAt(now, beijing).year;
  return `${p.year !== year ? `${p.year} 年 ` : ''}${p.month} 月 ${p.day} 日 ${clock(p)} 一次`;
}

// 整天只在两天以上时用，避免把固定间隔 24 小时说成按钟表的“每天”。
function amount(seconds) {
  if (seconds % 86400 === 0 && seconds >= 172800) return [seconds / 86400, '天'];
  if (seconds % 3600 === 0) return [seconds / 3600, '小时'];
  if (seconds % 60 === 0) return [seconds / 60, '分钟'];
  return [seconds, '秒'];
}
function intervalText(seconds) {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return '按固定间隔';
  const [count, unit] = amount(seconds);
  return count === 1 && unit !== '秒' ? `每${unit === '天' ? '天' : unit}` : `每 ${count} ${unit}`;
}

/** 一句话说明时间规则：“每天 08:00”“每个工作日 08:00”“每周五 17:30”“10 月 31 日 09:00 一次”“每 2 小时”……；读不懂的 cron 原样给出。 */
export function describeSchedule(rule, { now = Date.now() } = {}) {
  const value = normalizeRule(rule);
  if (!value) return '时间规则未知';
  const current = instant(now);
  switch (value.kind) {
    case 'daily': { const time = parseTime(value.time); return time ? `每天 ${clock(time)}${zoneNote(value.timeZone)}` : '每天'; }
    case 'weekly': {
      const time = parseTime(value.time), days = Array.isArray(value.weekdays) ? value.weekdays.filter(day => Number.isInteger(day) && day >= 1 && day <= 7) : [];
      return `${days.length ? weekdayText(days) : '每周'}${time ? ' ' + clock(time) : ''}${zoneNote(value.timeZone)}`;
    }
    case 'cron': return describeCron(value.expression, value.timeZone);
    case 'every': return intervalText(value.everySeconds);
    case 'at': return onceText(instant(value.at), current);
    case 'after': return Number.isSafeInteger(value.seconds) && value.seconds > 0 ? `${amount(value.seconds).join(' ')}后运行一次` : '只运行一次';
    default: return '时间规则未知';
  }
}

/** 按本地日期逐日向后找，最多看 4 年（覆盖 2 月 29 日这类规则）。 */
function* localDays(start, zone) {
  const p = partsAt(start, zone);
  const first = Date.UTC(p.year, p.month - 1, p.day);
  for (let i = 0; i <= 1461; i++) {
    const date = new Date(first + i * 86400000);
    const weekday = (date.getUTCDay() + 6) % 7 + 1;
    yield { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday };
  }
}

/**
 * 之后 count 次运行时间（ISO 字符串，严格晚于 now）。每天、每周、cron 按钟表时间；固定间隔从任务记录的下一次时间往后排；
 * 一次性任务只返回未来的那一次。读不懂或缺少起点时返回空数组，不猜。
 */
export function nextRuns(rule, now = Date.now(), count = 3) {
  const value = normalizeRule(rule), from = instant(now);
  if (!value || !Number.isFinite(from) || !Number.isSafeInteger(count) || count <= 0) return [];
  // 目录里的任务带状态；暂停或已结束的不会再运行。
  if (typeof rule.status === 'string' && rule.status !== 'active') return [];
  const results = [];
  const zone = value.timeZone || beijing;
  if (['daily', 'weekly', 'cron'].includes(value.kind) && !zoneValid(zone)) return [];
  const push = time => { if (time !== null && time > from && !results.includes(time)) results.push(time); return results.length >= count; };
  switch (value.kind) {
    case 'at': { const time = instant(value.at); if (time > from) results.push(time); break; }
    case 'after': if (Number.isSafeInteger(value.seconds) && value.seconds > 0) results.push(from + value.seconds * 1000); break;
    case 'every': {
      const step = value.everySeconds * 1000;
      if (!Number.isSafeInteger(value.everySeconds) || value.everySeconds <= 0) break;
      // 规则里没有起点（尚未创建）时从现在起算，和 DSH 创建时的对齐方式一致。
      let time = Number.isFinite(instant(value.anchor)) ? instant(value.anchor) : from + step;
      if (time <= from) time += Math.ceil((from - time + 1) / step) * step;
      while (results.length < count) { results.push(time); time += step; }
      break;
    }
    case 'daily': case 'weekly': {
      const time = parseTime(value.time);
      const days = value.kind === 'weekly' ? new Set(Array.isArray(value.weekdays) ? value.weekdays : []) : null;
      if (!time || days && !days.size) break;
      for (const date of localDays(from, zone)) {
        if (days && !days.has(date.weekday)) continue;
        if (push(zoned(date.year, date.month, date.day, time.hour, time.minute, time.second, time.ms, zone))) break;
      }
      break;
    }
    case 'cron': {
      const cron = parseCron(value.expression);
      if (!cron) break;
      const hours = [...cron.hours].sort((a, b) => a - b), minutes = [...cron.minutes].sort((a, b) => a - b);
      outer: for (const date of localDays(from, zone)) {
        if (!cronDay(cron, date)) continue;
        for (const hour of hours) for (const minute of minutes) if (push(zoned(date.year, date.month, date.day, hour, minute, 0, 0, zone))) break outer;
      }
      break;
    }
    default: break;
  }
  return results.sort((a, b) => a - b).slice(0, count).map(time => new Date(time).toISOString());
}
