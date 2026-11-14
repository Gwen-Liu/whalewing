import { z } from 'zod';
import { fail } from './vault.js';

/**
 * 扩展登记的定时任务（2026-11-10 起，企业版“团队沉淀”用）：扩展给名字、时间和给模型的说明，
 * 鲸翼在 DSH 定时服务里建好、默认打开，员工只能暂停和恢复。登记只在内存里，绑定扩展自己的作用域；
 * DSH 里的任务、任务会话和读会话的进度由定时任务功能持有（features/automation/host.js），
 * 扩展关闭时任务保留、到点跳过（src/news-gate.js），扩展调 remove() 才删掉。
 */
const line = max => z.string().trim().min(1).max(max).refine(value => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value), '不能带换行或控制字符');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, '时间写成 24 小时制的 HH:MM，如 02:00');
const weekdays = z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(values => new Set(values).size === values.length, '星期不能重复');
const content = z.strictObject({
  title: line(40),
  description: z.string().trim().min(1).max(240).optional(),
  daily: z.strictObject({ time }).optional(),
  weekly: z.strictObject({ time, weekdays }).optional(),
  prompt: z.string().trim().min(1).max(16000),
  readSessions: z.boolean().optional(),
}).refine(value => Boolean(value.daily) !== Boolean(value.weekly), '每天（daily）和每周（weekly）要给一个，只给一个');
const callable = z.custom(value => typeof value === 'function', '必须是函数');
const options = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '任务 id 只能用小写字母、数字和夹在中间的单个连字符').max(40),
  title: z.unknown(), description: z.unknown().optional(), daily: z.unknown().optional(), weekly: z.unknown().optional(),
  prompt: z.unknown(), readSessions: z.unknown().optional(),
  onStatus: callable.optional(), onRun: callable.optional(),
});
export const maxTasksPerFeature = 10;

function input(schema, raw, what) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) fail('EXTENSION_TASK_INPUT', `${what}不符合鲸翼扩展接口：${parsed.error.issues.map(issue => `${issue.path.join('.') || '整体'} ${issue.message}`).slice(0, 3).join('；')}`);
  return parsed.data;
}

/** 扩展登记的内容去掉 id 和回调；daily/weekly 留下给出的那一个。 */
const contentOf = raw => {
  const { id: _id, onStatus: _status, onRun: _run, ...rest } = raw;
  return input(content, rest, '定时任务');
};

const sameStatus = (a, b) => a?.state === b?.state && a?.reason === b?.reason;

export class ExtensionTasks {
  constructor(registry) {
    this.registry = registry;
    this.entries = new Map();
    this.listeners = new Set();
    this.waiters = new Set();
    this.closed = false;
    // 定时任务功能挂上来的删除方法；没挂上（功能没加载）时 remove() 报定时服务没就绪。
    this.remover = undefined;
    // 到点时扩展还没登记，运行门最多等这么久（DSH 刚启动补投错过的那次时，扩展往往还在加载）。
    this.startupWaitMs = 60_000;
  }

  dispose() {
    this.closed = true;
    for (const entry of this.entries.values()) entry.closed = true;
    this.entries.clear();
    for (const wake of this.waiters) wake();
    this.waiters.clear();
    this.listeners.clear();
  }

  /** 登记还在、扩展没关：任何一项不成立都视为已撤销，顺手清掉。 */
  alive(entry) {
    const feature = entry?.feature;
    const ok = entry && !this.closed && !entry.closed && this.entries.get(entry.owner) === entry && this.registry.entries.get(feature.id) === feature && feature.fiber.uid !== null && ![3, 4, 5].includes(feature.fiber.state);
    if (!ok && entry) { entry.closed = true; if (this.entries.get(entry.owner) === entry) this.entries.delete(entry.owner); }
    return Boolean(ok);
  }

  /** 定时任务功能订阅登记变化：登记、改内容、撤销都通知，参数是 `功能id/任务id`。 */
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  changed(owner) {
    if (this.closed) return;
    for (const listener of [...this.listeners]) { try { listener(owner); } catch { /* 订阅方自己记录失败。 */ } }
    for (const wake of [...this.waiters]) wake();
  }

  register(ctx, raw) {
    const feature = this.registry.caller(ctx, '登记定时任务');
    const parsed = input(options, raw, '定时任务');
    const owner = `${feature.id}/${parsed.id}`;
    const previous = this.entries.get(owner);
    if (previous && this.alive(previous)) fail('EXTENSION_TASK_CONFLICT', `这个扩展已经登记过定时任务「${parsed.id}」；改内容请调 set`);
    if (this.list().filter(entry => entry.feature === feature).length >= maxTasksPerFeature) fail('EXTENSION_TASK_LIMIT', `一个扩展最多登记 ${maxTasksPerFeature} 个定时任务`);
    const entry = {
      owner, id: parsed.id, feature, content: contentOf(raw), onStatus: parsed.onStatus, onRun: parsed.onRun,
      status: { state: 'waiting', reason: '鲸翼正在建这个任务' }, closed: false,
    };
    this.entries.set(owner, entry);
    const dispose = ctx.effect(() => () => {
      if (this.entries.get(owner) === entry) this.entries.delete(owner);
      if (!entry.closed) { entry.closed = true; this.changed(owner); }
    });
    this.changed(owner);
    return {
      status: () => ({ ...entry.status }),
      set: value => this.set(entry, value),
      remove: signal => this.remove(entry, signal),
      dispose,
    };
  }

  set(entry, raw) {
    if (!this.alive(entry)) fail('FEATURE_CLOSED', '定时任务登记已撤销，请重新打开扩展后再试');
    if (raw && typeof raw === 'object' && ('id' in raw || 'onStatus' in raw || 'onRun' in raw)) fail('EXTENSION_TASK_INPUT', 'set 只改名字、说明、时间和读不读会话，不改 id 和回调');
    entry.content = contentOf(raw);
    this.changed(entry.owner);
  }

  /** 扩展要彻底撤掉这个任务（比如员工退出团队）：删掉 DSH 里的任务，再撤销登记。 */
  async remove(entry, signal) {
    if (!this.alive(entry)) fail('FEATURE_CLOSED', '定时任务登记已撤销，请重新打开扩展后再试');
    if (!this.remover) fail('SCHEDULE_DISABLED', '鲸翼的定时任务功能还没加载，任务没有删掉；请稍后重试');
    if (entry.removing) fail('EXTENSION_TASK_CONFLICT', '这个任务正在删除');
    // 删的时候不再拿它去建或改任务，免得排在后面的一次核对把刚删的又建回来；没删成就恢复。
    entry.removing = true;
    try { await this.remover(entry.owner, signal); }
    catch (error) { entry.removing = false; throw error; }
    if (this.entries.get(entry.owner) === entry) this.entries.delete(entry.owner);
    entry.closed = true;
    this.changed(entry.owner);
  }

  /** 还开着的登记。 */
  live(owner) {
    const entry = this.entries.get(owner);
    return this.alive(entry) ? entry : undefined;
  }

  /** 还开着、不在删除中的登记（定时任务功能按它们建和改任务）。 */
  list() { return [...this.entries.values()].filter(entry => this.alive(entry) && !entry.removing); }

  /** 到点时扩展可能还没加载完（DSH 刚启动补跑错过的那次）：等它登记，最多等 ms 毫秒。 */
  async waitFor(owner, ms, signal) {
    if (this.live(owner)) return true;
    const deadline = Date.now() + ms;
    while (!this.closed && !signal?.aborted && Date.now() < deadline) {
      let wake;
      const woken = new Promise(resolve => { wake = resolve; });
      this.waiters.add(wake);
      const timer = setTimeout(wake, Math.max(0, deadline - Date.now()));
      const abort = () => wake();
      signal?.addEventListener('abort', abort, { once: true });
      try { await woken; } finally { clearTimeout(timer); this.waiters.delete(wake); signal?.removeEventListener('abort', abort); }
      if (this.live(owner)) return true;
    }
    return false;
  }

  /** 状态变了才告诉扩展；扩展的回调出错不影响鲸翼。 */
  report(owner, status) {
    const entry = this.live(owner);
    if (!entry || sameStatus(entry.status, status)) return;
    entry.status = { ...status };
    if (entry.onStatus) queueMicrotask(() => { if (this.alive(entry)) { try { Promise.resolve(entry.onStatus({ ...status })).catch(() => {}); } catch { /* 扩展的回调出错不影响鲸翼。 */ } } });
  }

  /** 一次运行结束后告诉扩展结果。返回是否交给了扩展（扩展已关时不算）。 */
  reportRun(owner, run) {
    const entry = this.live(owner);
    if (!entry) return false;
    if (entry.onRun) queueMicrotask(() => { if (this.alive(entry)) { try { Promise.resolve(entry.onRun({ ...run })).catch(() => {}); } catch { /* 扩展的回调出错不影响鲸翼。 */ } } });
    return true;
  }

  /** 定时任务页用：扩展登记时给的来源名由来源接口提供，这里只给包名、说明和读不读会话。 */
  info(owner) {
    const entry = this.live(owner);
    if (!entry) return undefined;
    return { feature: entry.feature.id, task: entry.id, package: entry.feature.package, title: entry.content.title, ...(entry.content.description ? { description: entry.content.description } : {}), readSessions: Boolean(entry.content.readSessions) };
  }
}
