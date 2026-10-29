// 定时任务的测试数据：一条“只有送达回执、查不到运行结果”的自建任务，和北京时间的时间计算。
// 临时 DSH 里没有任何历史运行；功能测试又不能让任务真的到点运行（会调模型）。这里在 DSH 启动前，
// 按 DSH 自己落盘的格式写好三样东西：任务会话（只有认领用途的那条命令回执，和鲸翼新建任务时写的一样）、
// 侧栏“鲸翼定时任务”工作区、定时服务里的任务行和两条送达记录。会话里没有这两次运行的记录，
// 按需求它们的结果应当是“结果未知”，不能按“已送达”当成功。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { randomUUID } from 'node:crypto';

const hour = 3600_000, day = 24 * hour, beijing = 8 * hour;

/** 北京时间（固定 UTC+8，没有夏令时）的年月日时分。 */
export function beijingParts(time) {
  const d = new Date(time + beijing);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), weekday: (d.getUTCDay() + 6) % 7 + 1 };
}
/** 北京时间的某天某刻对应的时刻（毫秒）。 */
export const beijingTime = (year, month, dayOfMonth, h = 0, m = 0) => Date.UTC(year, month - 1, dayOfMonth, h, m) - beijing;
const pad = value => String(value).padStart(2, '0');
/** “10/28 08:00”：月/日不补零，时分补零（需求里的写法）。 */
export const shortBeijing = time => { const p = beijingParts(time); return `${p.month}/${p.day} ${pad(p.hour)}:${pad(p.minute)}`; };
/** “2026/10/28 08:00:00” */
export const fullBeijing = time => { const p = beijingParts(time); return `${p.year}/${pad(p.month)}/${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`; };

/**
 * 按北京时间往后找 count 次运行：每天或每周（weekdays 用 1 周一到 7 周日）在 hour:minute，严格晚于 now。
 * 和界面用的不是同一份代码，按需求的规则自己算。
 */
export function nextClockRuns(now, { hour: h, minute: m, weekdays = [1, 2, 3, 4, 5, 6, 7] }, count = 3) {
  const runs = [], today = beijingParts(now);
  for (let i = 0; runs.length < count && i < 400; i++) {
    const time = beijingTime(today.year, today.month, today.day + i, h, m);
    if (time > now && weekdays.includes(beijingParts(time).weekday)) runs.push(time);
  }
  return runs;
}

/** DSH 会话目录名的写法（与 dsh-session-persistence-jsonl 的 projectKey 一致）：分隔符和盘符冒号变成 -，其他不安全字符写成 ~XXXX。 */
function projectKey(cwd) {
  let readable = '', separatorRun = false;
  for (const ch of cwd) {
    if (ch === '/' || ch === '\\' || ch === ':') { if (!separatorRun) readable += '-'; separatorRun = true; continue; }
    separatorRun = false;
    readable += ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch) ? ch : `~${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`;
}

const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

/**
 * 在 DSH 启动前写一条每天运行的自建任务和它的两次送达：前天按时送达，昨天晚 10 分钟送达（开机后补上的那种）。
 * 每天的时刻取离现在约 12 小时的整点，测试期间不会到点。返回任务名、会话、下一次时间和两条送达（旧的在前）。
 */
export function seedDeliveredTask({ home }, { title = '鲸翼测试-送达未知', prompt = '测试任务：只有送达回执，没有运行结果', now = Date.now() } = {}) {
  const directory = path.join(home, 'whalewing-tasks');
  fs.mkdirSync(directory, { recursive: true });
  const cwd = fs.realpathSync.native(directory);
  const runHour = (beijingParts(now).hour + 12) % 24;
  const [scheduledAt] = nextClockRuns(now, { hour: runHour, minute: 0 }, 1);
  const deliveries = [2, 1].map((back, i) => {
    const planned = scheduledAt - back * day;
    return { scheduledAt: new Date(planned).toISOString(), deliveredAt: new Date(planned + (i === 1 ? 10 * 60_000 : 2_000)).toISOString(), messageId: `msg-${randomUUID()}` };
  });
  const sessionId = `whalewing-auto-${randomUUID()}`, taskId = `schedule-${randomUUID()}`, workspaceId = randomUUID();
  const created = scheduledAt - 3 * day;

  // 会话日志：和鲸翼新建任务时 DSH 写下的一样，开头一行会话信息，然后是权限设置和认领“自建任务”用途的命令回执。
  const commandId = `cmd-${randomUUID().slice(0, 8)}-1`;
  const events = [
    { type: 'session', version: 4, id: sessionId, createdAt: created, cwd, isSeeded: false, delegationDepth: 0, agentPreset: 'standard' },
    { type: 'permission/preset', seq: 0, time: created + 4, data: { preset: 'workspace-write' } },
    { type: 'sandbox/mode', seq: 1, time: created + 6, data: { mode: 'workspace-write' } },
    { type: 'approval/policy', seq: 2, time: created + 6, data: { policy: 'ask' } },
    { type: 'command/run', seq: 3, time: created + 28, data: { commandId, name: 'whalewing', source: { kind: 'user' } } },
    { type: 'command/done', seq: 4, time: created + 29, data: { commandId, kind: 'success', text: JSON.stringify({ action: 'automation_claim', purpose: 'custom' }) } },
  ];
  // 和 DSH 一样分帧写：第一帧只放会话信息那一行，之后每批事件一帧，每帧带校验和。
  const frame = lines => zlib.zstdCompressSync(Buffer.from(lines.map(event => `${JSON.stringify(event)}\n`).join('')), { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } });
  const log = path.join(home, 'sessions', projectKey(cwd), sessionId, 'session.v4.jsonl.zstd');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(log, Buffer.concat([frame(events.slice(0, 1)), frame(events.slice(1, 4)), frame(events.slice(4))]));

  // 侧栏工作区：鲸翼启动时按目录复用这个工作区，标题就是“鲸翼定时任务”。
  const stamp = new Date(created).toISOString();
  writeJson(path.join(home, 'storages', 'workspace.json'), {
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [], pinnedSessionIds: [] },
    tables: { workspaces: { [workspaceId]: { path: cwd, title: '鲸翼定时任务', sessionIds: [sessionId], createdAt: stamp, updatedAt: stamp } } },
  });

  // 定时服务的任务行：每天 runHour:00（北京时间），下一次在约 12 小时后；送达记录最后一条与 lastDelivery 一致。
  const time = `${pad(runHour)}:00:00.000`;
  writeJson(path.join(home, 'storages', 'schedule.json'), {
    unit: { name: 'schedule', version: 1 }, global: null,
    tables: { tasks: { [taskId]: {
      sessionId,
      record: { id: taskId, kind: 'daily', title, prompt, time, timeZone: 'Asia/Shanghai', scheduledAt: new Date(scheduledAt).toISOString() },
      status: 'active',
      lastDelivery: deliveries.at(-1),
      deliveryHistory: { records: deliveries.map(record => ({ ...record, prompt })), earlierRecordsUnavailable: false },
    } } },
  });
  return { title, prompt, sessionId, taskId, scheduledAt, runHour, deliveries };
}

/** 读临时 DSH 定时服务里的任务（DSH 自己的存储，界面之外的事实）。 */
export function storedTasks(home) {
  const file = path.join(home, 'storages', 'schedule.json');
  if (!fs.existsSync(file)) return [];
  return Object.values(JSON.parse(fs.readFileSync(file, 'utf8')).tables?.tasks ?? {});
}

/** 读侧栏工作区登记。 */
export function storedWorkspaces(home) {
  const file = path.join(home, 'storages', 'workspace.json');
  return Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).tables?.workspaces ?? {}).map(([id, value]) => ({ id, ...value }));
}
