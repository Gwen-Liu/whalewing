import { z } from 'zod';
import { jobStatuses, limits } from './contract.js';

/**
 * 办公工坊一单的会话标记和进度。会话上先执行一次 /whalewing-toolbox-job 记下“这是办公工坊的一单”，
 * 之后进度从这个会话自己的记录里算（和小鲸派工同一套）：开始一轮是“进行中”，一轮结束按结束原因记，
 * 留下小鲸最后一条回复的开头。DSH 重启后靠这个标记认出办公工坊的会话，重新只给它 whalewing_toolbox。
 */
export const jobCommand = 'whalewing-toolbox-job';
export const jobKey = 'whalewingToolbox';
export const workspaceTitle = '鲸翼办公工坊';
export const replyLimit = 2000;
const endings = { completed: 'completed', error: 'error', aborted: 'interrupted', interrupted: 'interrupted', 'max-tokens': 'incomplete', blocked: 'incomplete' };
const marker = z.strictObject({ title: z.string().trim().min(1).max(40) });
const view = z.strictObject({ title: z.string(), status: z.enum(jobStatuses), reply: z.string(), turns: z.number().int().nonnegative() }).nullable();
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

export function parseJobMarker(raw) { return marker.parse(JSON.parse(String(raw ?? '').trim())); }

const messageOf = event => event?.data?.message ?? event?.data;
const textOf = message => (Array.isArray(message?.content) ? message.content : []).filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n').trim();
const clip = text => [...text].length > replyLimit ? `${[...text].slice(0, replyLimit).join('')}…` : text;

function step(state, event) {
  if (event?.type === 'command/run' && event.data?.name === jobCommand) {
    try { return { ...state, pending: { ...state.pending, [event.data.commandId]: parseJobMarker(event.data.args) } }; }
    catch { return state; }
  }
  if (event?.type === 'command/done' && Object.hasOwn(state.pending, event.data?.commandId)) {
    const pending = { ...state.pending };
    const input = pending[event.data.commandId];
    delete pending[event.data.commandId];
    if (event.data.kind !== 'success' || state.job) return { ...state, pending };
    return { ...state, pending, job: { ...input, status: 'queued', reply: '', turns: 0 } };
  }
  const current = state.job;
  if (!current) return state;
  const next = patch => ({ ...state, job: { ...current, ...patch } });
  switch (event?.type) {
    case 'turn/start': return next({ status: 'running', reply: '', turns: current.turns + 1 });
    case 'approval/asked': return current.status === 'running' ? next({ status: 'waiting' }) : state;
    case 'approval/decided': return current.status === 'waiting' ? next({ status: 'running' }) : state;
    case 'assistant/message': {
      const text = textOf(messageOf(event));
      return text ? next({ reply: clip(text) }) : state;
    }
    case 'turn/end': return next({ status: endings[event.data?.reason?.kind] ?? 'unknown' });
    default: return state;
  }
}

/** 所有会话都会经过这里，只认登记过的办公工坊会话；任何异常都保持原状态。 */
export const jobProjection = {
  key: jobKey, stateVersion: 1,
  stateSchema: z.object({ pending: z.record(z.string(), marker), job: view }),
  init: () => ({ pending: {}, job: null }),
  apply(state, event) {
    try { return step(state, event); }
    catch { return state; }
  },
  wire: { viewSchema: view, view: state => state.job },
};

export function foldJob(events) {
  let state = jobProjection.init();
  for (const event of events ?? []) state = jobProjection.apply(state, event);
  return state.job;
}

const units = ['B', 'KB', 'MB', 'GB'];
export function formatSize(bytes) {
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  const shown = unit && value < 10 ? Number(value.toFixed(1)) : Math.round(value);
  return `${shown} ${units[unit]}`;
}

/** 一个文件的一行描述：小鲸默认只看这些，看不到内容（2026-11-12 用户定：表头可以看，具体数据员工要求了才看）。 */
export function describeFile(file) {
  const facts = [String(file.type || '').toUpperCase() || '未知类型', formatSize(file.size)];
  if (file.pages !== undefined) facts.push(`${file.pages} 页`);
  if (file.width && file.height) facts.push(`${file.width}×${file.height}`);
  if (file.seconds !== undefined) facts.push(`${Math.round(file.seconds)} 秒`);
  if (file.pasted) facts.push('员工粘贴的截图');
  if (file.folder) facts.push(`在 ${file.folder}`);
  const sheets = (file.sheets ?? []).map(sheet => `工作表「${sheet.name}」${sheet.rows !== undefined ? `，数据 ${sheet.rows} 行` : ''}${sheet.headers.length ? `，表头：${sheet.headers.join('、')}` : ''}`);
  return `- ${file.id} ${file.name}（${facts.join('，')}${sheets.length ? `；${sheets.join('；')}` : ''}）`;
}

/** 员工这次说的话加上这次放进来的文件，作为员工的消息发进这一单的会话。 */
export function composeMessage({ text, files }) {
  const said = String(text ?? '').trim();
  const parts = [said || '（员工没写要求，只放了文件）'];
  if (files.length) parts.push(['【办公工坊】这次放进来的文件（编号给 whalewing_toolbox 用）：', ...files.map(describeFile)].join('\n'));
  return parts.join('\n\n');
}

/** 会话标题：办公工坊 · 员工这句话的开头，一行，最多 40 字。 */
export function jobTitle({ text, files }) {
  const line = String(text ?? '').trim().split(/\r?\n/)[0] || (files[0] ? `处理 ${files[0].name}${files.length > 1 ? ` 等 ${files.length} 个文件` : ''}` : '一单');
  const chars = [...line];
  return chars.length > 40 ? `${chars.slice(0, 39).join('')}…` : line;
}

/**
 * 主机和办公工坊页面之间的请求台：小鲸的工具调用变成一条待办请求，页面通过流式订阅拿到全部待办、
 * 处理完调用 reply 交回结果。页面刷新后重新订阅还能拿到没交回的请求；不积压历史，只发当前完整帧。
 */
export class ToolboxBroker {
  constructor({ pageWaitMs = 15000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.pending = new Map(); this.jobs = new Map(); this.handoffs = new Map(); this.listeners = new Set();
    this.revision = 0; this.watchers = 0; this.sequence = 0; this.closed = false;
    this.pageWaitMs = pageWaitMs; this.setTimer = setTimer; this.clearTimer = clearTimer;
  }
  changed() { this.revision++; for (const listener of [...this.listeners]) listener(); }
  snapshot() {
    return {
      revision: this.revision,
      requests: [...this.pending.values()].map(entry => entry.request),
      jobs: [...this.jobs].map(([sessionId, job]) => ({ sessionId, status: job.status, reply: job.reply, turns: job.turns })),
    };
  }
  /** 页面关心的那几单的进度；会话标记没读到时不登记。 */
  setJob(sessionId, job) {
    if (!job) return;
    const previous = this.jobs.get(sessionId);
    if (previous && previous.status === job.status && previous.reply === job.reply && previous.turns === job.turns) return;
    this.jobs.set(sessionId, { status: job.status, reply: job.reply, turns: job.turns });
    this.changed();
  }
  tracks(sessionId) { return this.jobs.has(sessionId); }
  async waitForPage(signal) {
    if (this.watchers) return;
    await new Promise((resolve, reject) => {
      const done = () => { this.listeners.delete(check); signal?.removeEventListener('abort', onAbort); this.clearTimer(timer); };
      const check = () => { if (this.watchers || this.closed) { done(); this.closed ? reject(fail('TOOLBOX_CLOSED', '办公工坊已关闭')) : resolve(); } };
      const onAbort = () => { done(); reject(signal.reason ?? new Error('已取消')); };
      const timer = this.setTimer(() => { done(); reject(Object.assign(new Error('办公工坊页面没开着：请员工打开鲸翼的办公工坊页，再让你接着做'), { code: 'TOOLBOX_PAGE_CLOSED' })); }, this.pageWaitMs);
      this.listeners.add(check);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
  /** 把一次工具调用交给页面，等页面交回；超时、取消或功能关闭时撤回这条请求。 */
  async request(sessionId, action, args, { signal, timeoutMs = 30000 } = {}) {
    if (this.closed) fail('TOOLBOX_CLOSED', '办公工坊已关闭');
    signal?.throwIfAborted();
    await this.waitForPage(signal);
    signal?.throwIfAborted();
    if (this.closed) fail('TOOLBOX_CLOSED', '办公工坊已关闭');
    const id = `t${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const settle = (ok, value) => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id); this.clearTimer(timer); signal?.removeEventListener('abort', onAbort);
        this.changed();
        ok ? resolve(value) : reject(value);
      };
      const onAbort = () => settle(false, signal.reason ?? new Error('已取消'));
      const timer = this.setTimer(() => settle(false, Object.assign(new Error('办公工坊页面没有在限定时间内交回结果'), { code: 'TOOLBOX_TIMEOUT' })), timeoutMs);
      this.pending.set(id, { request: { id, sessionId, action, args }, settle });
      signal?.addEventListener('abort', onAbort, { once: true });
      this.changed();
    });
  }
  reply({ id, ok, value, error }) {
    const entry = this.pending.get(id);
    if (!entry) return false;
    entry.settle(ok, ok ? value : Object.assign(new Error(error || '办公工坊页面没能处理'), { code: 'TOOLBOX_PAGE' }));
    return true;
  }
  async *watch(signal) {
    let wake = Promise.withResolvers();
    const notify = () => wake.resolve();
    this.listeners.add(notify); signal?.addEventListener('abort', notify);
    this.watchers++; this.changed();
    try {
      while (!this.closed && !signal?.aborted) {
        const frame = this.snapshot();
        wake = Promise.withResolvers();
        yield frame;
        if (frame.revision === this.revision) await wake.promise;
      }
    } finally {
      this.watchers--; this.listeners.delete(notify); signal?.removeEventListener('abort', notify);
    }
  }
  /** 和小鲸的对话里转过来的活：等页面认领；页面没开时外壳会先切到办公工坊页。 */
  handoff({ text, from, files }) {
    if (this.closed) fail('TOOLBOX_CLOSED', '办公工坊已关闭');
    const id = `h${++this.sequence}`;
    this.handoffs.set(id, { id, text, from, ...(files?.length ? { files } : {}) });
    this.changed();
    return id;
  }
  claim(id) {
    if (!this.handoffs.delete(id)) return false;
    this.changed();
    return true;
  }
  async *watchHandoffs(signal) {
    let wake = Promise.withResolvers();
    const notify = () => wake.resolve();
    this.listeners.add(notify); signal?.addEventListener('abort', notify);
    try {
      while (!this.closed && !signal?.aborted) {
        const revision = this.revision;
        wake = Promise.withResolvers();
        yield { revision, items: [...this.handoffs.values()] };
        if (revision === this.revision) await wake.promise;
      }
    } finally { this.listeners.delete(notify); signal?.removeEventListener('abort', notify); }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const entry of [...this.pending.values()]) entry.settle(false, Object.assign(new Error('办公工坊已关闭，这一步没做'), { code: 'TOOLBOX_CLOSED' }));
    this.changed();
  }
}

export { limits };
