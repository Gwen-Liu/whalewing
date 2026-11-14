import { z } from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { Service } from '@deepseek-ai/cordis';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { applyManagerTool } from './handoff.js';

/**
 * 小鲸派工后专家直接开工（2026-11-08 用户定，见 docs/专家团改版方案.md 第五节第 4 项）。
 * 派出去的任务会话上先执行一次 /whalewing-dispatch 记下“这是小鲸派的哪件事”，之后它的进度从这个会话自己的记录里算：
 * 开始一轮是“进行中”，等审批是“在等你审批”，一轮结束按结束原因记“做完了 / 出错了 / 被停下 / 没写完”，
 * 并留下专家最后一条回复的开头。小鲸对话里的卡片和小鲸每轮带的“派出去的事”都读这一份，不另存进度。
 */
export const dispatchCommand = 'whalewing-dispatch';
export const dispatchKey = 'whalewingDispatch';
export const dispatchStatuses = ['queued', 'running', 'waiting', 'completed', 'error', 'interrupted', 'incomplete', 'unknown'];
// 轮次结束原因来自 DSH 会话日志，和定时任务页同一套；没列出的新原因记“结果未知”。
const endings = { completed: 'completed', error: 'error', aborted: 'interrupted', interrupted: 'interrupted', 'max-tokens': 'incomplete', blocked: 'incomplete' };
export const replyLimit = 600;
const marker = z.strictObject({ title: z.string().trim().min(1).max(40), from: z.string().min(1).max(160) });
const view = z.strictObject({ title: z.string(), from: z.string(), status: z.enum(dispatchStatuses), reply: z.string(), turns: z.number().int().nonnegative() }).nullable();

export function parseDispatch(raw) {
  const value = JSON.parse(String(raw ?? '').trim());
  return marker.parse(value);
}

// 会话日志里助手消息的正文在 data.message 里（同每日记忆读会话的写法）。
const messageOf = event => event?.data?.message ?? event?.data;
const textOf = message => (Array.isArray(message?.content) ? message.content : []).filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n').trim();
const clip = text => [...text].length > replyLimit ? `${[...text].slice(0, replyLimit).join('')}…` : text;

function step(state, event) {
  if (event?.type === 'command/run' && event.data?.name === dispatchCommand) {
    try { return { ...state, pending: { ...state.pending, [event.data.commandId]: parseDispatch(event.data.args) } }; }
    catch { return state; }
  }
  if (event?.type === 'command/done' && Object.hasOwn(state.pending, event.data?.commandId)) {
    const pending = { ...state.pending };
    const input = pending[event.data.commandId];
    delete pending[event.data.commandId];
    // 只认第一次成功的登记；同一个任务不会被派两次。
    if (event.data.kind !== 'success' || state.dispatch) return { ...state, pending };
    return { ...state, pending, dispatch: { ...input, status: 'queued', reply: '', turns: 0 } };
  }
  const current = state.dispatch;
  if (!current) return state;
  const next = patch => ({ ...state, dispatch: { ...current, ...patch } });
  switch (event?.type) {
    case 'turn/start': return next({ status: 'running', turns: current.turns + 1 });
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

/** 所有会话都会经过这里，只认登记过的派工任务；任何异常都保持原状态。 */
export const dispatchProjection = {
  key: dispatchKey, stateVersion: 1,
  stateSchema: z.object({ pending: z.record(z.string(), marker), dispatch: view }),
  init: () => ({ pending: {}, dispatch: null }),
  apply(state, event) {
    try { return step(state, event); }
    catch { return state; }
  },
  wire: { viewSchema: view, view: state => state.dispatch },
};

/** 派工记录：派给谁、什么事、从哪段小鲸对话派的。只记身份，进度从任务会话的投影读。 */
export const dispatchRecord = z.strictObject({ sessionId: z.string(), expertId: z.string(), expertName: z.string(), title: z.string(), from: z.string(), createdAt: z.number(), reported: z.enum(dispatchStatuses).nullable() });
export const dispatchDomain = defineDomain({ name: 'whalewing_dispatches', version: 1, tables: { dispatches: domainTable(dispatchRecord) } });

/** 从一份完整的会话记录重算派工进度（会话没加载时也能读）。 */
export function foldDispatch(events) {
  let state = dispatchProjection.init();
  for (const event of events ?? []) state = dispatchProjection.apply(state, event);
  return state.dispatch;
}

/** 专家最近一轮的完整回复（给小鲸读完整交付用），超长截断。 */
export function latestReply(events, limit = 8000) {
  let since = -1;
  const list = events ?? [];
  list.forEach((event, index) => { if (event?.type === 'turn/start') since = index; });
  const text = list.slice(Math.max(0, since)).filter(event => event?.type === 'assistant/message').map(event => textOf(messageOf(event))).filter(Boolean).join('\n\n');
  return [...text].length > limit ? `${[...text].slice(0, limit).join('')}…（后面还有，员工可以打开任务看全文）` : text;
}

const finished = new Set(['completed', 'error', 'interrupted', 'incomplete', 'unknown']);
const statusText = { queued: '已派出，还没开始', running: '正在做', waiting: '在等员工审批', completed: '做完了', error: '出错了', interrupted: '被停下了', incomplete: '没写完（输出写满）', unknown: '结果未知' };
export const dispatchStatusText = statusText;
const recentMs = 7 * 24 * 3600 * 1000;

/**
 * 派工记录本：派出去时记一笔；小鲸每一轮开头带一份很短的“派出去的事”。
 * 还在做的、等审批的每轮都列；做完的只列一次（列过就记下“已汇报”），免得每轮重复。七天前派的不再列。
 */
export class DispatchBook {
  constructor(table, readSession, now = () => Date.now()) {
    this.table = table;
    this.readSession = readSession;
    this.now = now;
  }
  async record(entry) {
    await this.table.put(entry.sessionId, dispatchRecord.parse({ ...entry, createdAt: this.now(), reported: null }));
  }
  async status(sessionId) {
    try { return foldDispatch((await this.readSession(sessionId))?.events); }
    catch { return null; }
  }
  async result(sessionId) {
    if (!this.table.get(sessionId)) return null;
    const snapshot = await this.readSession(sessionId);
    return { dispatch: foldDispatch(snapshot?.events), reply: latestReply(snapshot?.events) };
  }
  /** 这一轮要告诉小鲸的；同时把这次列出的“做完了”记成已汇报。没有要说的返回空串。 */
  async digest() {
    const lines = [], reported = [];
    const records = [...this.table.keys()].map(id => this.table.get(id)).filter(item => item && this.now() - item.createdAt < recentMs).sort((a, b) => a.createdAt - b.createdAt);
    for (const item of records) {
      const current = await this.status(item.sessionId);
      const status = current?.status ?? 'unknown';
      if (finished.has(status) && item.reported === status) continue;
      const head = `- ${item.expertName} · ${item.title}（标识 ${item.sessionId}）：${statusText[status]}`;
      lines.push(status === 'completed' && current?.reply ? `${head}。交付开头：${current.reply.replace(/\s+/g, ' ')}` : `${head}。`);
      if (finished.has(status)) reported.push({ ...item, reported: status });
    }
    for (const item of reported) await this.table.put(item.sessionId, item);
    if (!lines.length) return '';
    return ['【派出去的事 · 非用户原话】下面是你交给专家的任务现在的情况，由鲸翼按那些任务的记录整理：', ...lines.slice(-12),
      '做完的向员工汇报，要完整交付用 whalewing_handoff_result 读；在等审批的提醒员工去那个任务里批；出错、被停下的说明情况，问员工要不要重新派。不要为同一件事再派一次。',
      '标识只用来调用 whalewing_handoff_result；跟员工说的时候用专家和任务名（员工点小鲸对话里的派工卡片就能打开任务），不要把标识写出来。'].join('\n');
  }
}

const fail = message => { throw Object.assign(new Error(message), { code: 'DISPATCH' }); };

/** 派工服务：交接工具用它让专家开工，小鲸每轮用它知道派出去的事怎么样了。 */
export class Dispatches extends Service {
  constructor(ctx, book) {
    super(ctx, 'whalewingDispatches');
    this.book = book;
  }
  /** 任务已建好、选好专家后：登记“这是小鲸派的”，记一笔，再把交接说明作为第一条消息发进去。 */
  async start({ task, sessionId, expert, title, from, draft }) {
    const commands = this.ctx.get('commands'), sessions = this.ctx.get('sessions');
    const done = await commands.execute(task, `/${dispatchCommand} ${JSON.stringify({ title, from })}`, [], new AbortController().signal);
    if (done?.result.kind !== 'success') fail(done?.result.text || '派工登记没有完成');
    if (!(await sessions.flush(task.session))) fail('派工登记还没确认保存');
    await this.book.record({ sessionId, expertId: expert.id, expertName: expert.name, title, from });
    // 员工批准派工就是确认发出这条交接说明；它是员工交给专家的活，按员工的消息记。
    task.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: draft }] }));
  }
}

function resultTool(scope) {
  return defineTool({
    name: 'whalewing_handoff_result',
    description: '读一件派出去的任务现在的情况和专家最近一轮的完整回复。任务标识在【派出去的事】或交接记录里，只给这个工具用，不要写给员工看。只读，不打扰专家。',
    parameters: { sessionId: { type: 'string', required: true, description: '派出去的任务标识。' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      if (!exec.agent || scope.whalewingExperts.selectedFor(exec.agent) !== 'manager') fail('只有小鲸的主会话能读派出去的任务');
      const id = typeof args.sessionId === 'string' ? args.sessionId.trim() : '';
      const service = scope.get('whalewingDispatches');
      const result = id && service ? await service.book.result(id) : null;
      if (!result) fail('没有这件派出去的任务；任务标识见【派出去的事】或交接记录');
      const status = result.dispatch?.status ?? 'unknown';
      return [`「${result.dispatch?.title ?? '这件任务'}」：${statusText[status]}。`, result.reply ? `专家最近一轮的回复：\n${result.reply}` : '专家还没有回复。'].join('\n');
    },
    presentCall: args => ({ card: 'generic', title: '看派出去的任务', kind: 'read', rawInput: args }),
  });
}

/** 派工的会话投影、登记命令、记录本、每轮“派出去的事”和读结果的工具，随小鲸功能装卸。 */
export function applyDispatch(ctx) {
  ctx.inject(['sessionProjections', 'commands', 'sessions', 'storageDomain', 'sessionQuery', 'whalewingExperts'], async scope => {
    scope.sessionProjections.register(dispatchProjection);
    scope.commands.register({
      name: dispatchCommand,
      description: '鲸翼内部用：记下这个任务是小鲸派的哪件事，用来显示进度。',
      input: { hint: '{"title":"任务名","from":"小鲸会话标识"}' },
      handler: async ({ rawInput }) => {
        try { return { kind: 'success', text: JSON.stringify(parseDispatch(rawInput)) }; }
        catch { return { kind: 'error', text: '派工登记需要 title（一行，最多 40 字）和 from' }; }
      },
    });
    const domain = await scope.storageDomain.open(dispatchDomain);
    scope.effect(() => () => domain.close(), 'whalewing dispatch storage');
    const book = new DispatchBook(domain.table('dispatches'), id => scope.sessionQuery.readSession(id));
    new Dispatches(scope, book);
    const lastTurn = new WeakMap();
    scope.on('agent/pre-step', async ({ agent, turn, signal }, next) => {
      const decision = await next();
      if (decision.kind === 'reject' || signal.aborted || decision.messages.length === 0) return decision;
      if (lastTurn.get(agent) === turn || scope.whalewingExperts.selectedFor(agent) !== 'manager') return decision;
      lastTurn.set(agent, turn);
      const text = await book.digest().catch(() => '');
      if (!text) return decision;
      return { ...decision, messages: [...decision.messages, createUserMessage({ source: { kind: 'whalewing-dispatch' }, content: [{ type: 'text', text }] })] };
    });
  });
  applyManagerTool(ctx, resultTool, 'whalewing handoff result');
}
