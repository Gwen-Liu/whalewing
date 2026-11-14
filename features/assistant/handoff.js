import { defineTool } from '@deepseek-ai/dsh-tools';
import { approveEscalation } from '@deepseek-ai/dsh-sandbox';
import { defaultAssistantName } from '../../src/assistant-name.js';

export const handoffToolName = 'whalewing_handoff';
const expertIdPattern = /^[a-z][a-z0-9-]{0,79}$/;
const limits = { title: 40, field: 4000, materials: 20, material: 500 };
const fail = message => { throw Object.assign(new Error(message), { code: 'HANDOFF' }); };

function field(value, label, max, required = true) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) { if (required) fail(`${label}不能为空`); return ''; }
  if ([...text].length > max) fail(`${label}超过 ${max} 字，请精简后重试`);
  return text;
}

/** 交接说明是员工将要发给专家的原话草稿，只分员工看得懂的几段；开头用助手现在的简称（默认“小鲸”）。 */
export function handoffDraft({ title, goal, deliverable, materials = [], notes = '' }, names = defaultAssistantName) {
  return [
    `【${names.short}交接】${title}`,
    `目标：${goal}`,
    `要交付：${deliverable}`,
    ...(materials.length ? [['相关笔记和文件：', ...materials.map(item => `- ${item}`)].join('\n')] : []),
    ...(notes ? [`员工的要求和已有结论：\n${notes}`] : []),
  ].join('\n\n');
}

/** 参数先在副作用之前全部校验，审批弹窗里看到的就是将要建的任务。 */
export function handoffInput(args, names = defaultAssistantName) {
  const expertId = typeof args.expertId === 'string' ? args.expertId.trim() : '';
  if (!expertIdPattern.test(expertId)) fail('专家标识无效，请先用 whalewing_experts 的 list 查到准确标识');
  if (expertId === 'manager') fail(`不能交给${names.short}自己，请选一位负责这件事的专家`);
  const title = field(args.title, '任务名', limits.title);
  if (/[\r\n]/.test(title)) fail('任务名只写一行');
  const goal = field(args.goal, '目标', limits.field);
  const deliverable = field(args.deliverable, '要交付的内容', limits.field);
  const notes = field(args.notes, '员工的要求和已有结论', limits.field, false);
  const materials = [...new Set((args.materials ?? []).map(item => field(item, '资料路径', limits.material)))];
  if (materials.length > limits.materials) fail(`相关资料最多 ${limits.materials} 项，请只带上专家必须先看的`);
  if (materials.some(item => /[\r\n]/.test(item))) fail('每项资料路径只写一行');
  return { expertId, title, goal, deliverable, materials, notes, draft: handoffDraft({ title, goal, deliverable, materials, notes }, names) };
}

// 新任务放进小鲸所在的工作区，交接说明里的相对路径对专家同样有效。
async function placement(scope, agent) {
  const registry = scope.get('workspaceRegistry');
  if (registry) {
    const workspace = (await registry.list()).find(item => item.sessionIds?.includes(agent.session.id));
    if (workspace) return { workspaceId: workspace.id };
  }
  const cwd = agent.session.header?.cwd;
  return typeof cwd === 'string' && cwd ? { cwd } : {};
}

function definition(scope) {
  return defineTool({
    name: handoffToolName,
    description: '把一件事派给另一位鲸翼专家：为这位专家新建一个任务，把交接说明作为第一条消息发进去，专家马上开工。需要员工批准，批准就是确认派出去。专家做完后，你每轮开头的【派出去的事】会写它的情况和交付开头，完整交付用 whalewing_handoff_result 读。每件事调用一次，不要为同一件事再派。专家标识先用 whalewing_experts 的 list 查。',
    parameters: {
      expertId: { type: 'string', required: true, description: '接手的专家标识，来自 whalewing_experts 的 list；不能是 manager。' },
      title: { type: 'string', required: true, description: '新任务的名字，一行，不超过40字。' },
      goal: { type: 'string', required: true, description: '这件事要达成什么。' },
      deliverable: { type: 'string', required: true, description: '要交付什么、怎样算完成（验收标准）。' },
      materials: { type: 'array', items: { type: 'string' }, description: '专家需要先看的笔记或文件路径，每项一个，最多20项。' },
      notes: { type: 'string', description: '员工的原话要求、限制和已经讨论出的结论，原样转达，不要概括掉。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        sessionId: { type: 'string', required: true }, expertId: { type: 'string', required: true }, expertName: { type: 'string', required: true },
        title: { type: 'string', required: true }, draft: { type: 'string', required: true }, renamed: { type: 'boolean', required: true },
        started: { type: 'boolean', required: true }, startIssue: { type: 'string' },
      } },
      render: (_args, value) => [{ type: 'text', text: [
        ...(value.started
          ? [`已派给「${value.expertName}」，任务「${value.title}」（${value.sessionId}）已经开工。它做完后，你下一轮开头的【派出去的事】会写结果；员工这时也能在这条记录上看到进度。不要为同一件事再派一次。`]
          : [`已为「${value.expertName}」新建任务「${value.title}」，但没能让它开工：${value.startIssue || '原因不明'}。员工点这条记录上的「打开任务」，交接说明会放进那个任务的输入框，看过后自己发送。不要为同一件事再次调用。`]),
        ...(value.renamed ? [] : ['任务标题没有设上，不影响使用。']),
        `交接说明全文：\n${value.draft}`,
      ].join('\n') }],
      // 卡片据此打开任务和填草稿，不必再解析给模型看的文字。
      presentationMeta: (_args, value) => ({ sessionId: value.sessionId, expertId: value.expertId, expertName: value.expertName, title: value.title, draft: value.draft, started: value.started }),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const agent = exec.agent;
      // 原生父子链会继承这项定义，执行时仍按实际会话核对。
      const names = scope.get('whalewing')?.assistantName?.() ?? defaultAssistantName;
      if (!agent || scope.whalewingExperts.selectedFor(agent) !== 'manager') fail(`只有${names.full}的主会话能把任务交给专家；子代理和其他专家请把建议交回负责的会话`);
      const input = handoffInput(args, names);
      const role = scope.whalewingExperts.get(input.expertId);
      const controller = scope.get('sessionController'), commands = scope.get('commands'), sessions = scope.get('sessions'), projections = scope.get('sessionProjections');
      if (typeof controller?.create !== 'function' || typeof controller.resolveAgent !== 'function' || !commands || !sessions || !projections) {
        fail(`当前 DSH 不支持插件新建任务，没有交接。请员工在专家页选「${role.name}」开始新任务，再把下面的交接说明贴进去：\n${input.draft}`);
      }
      // 与知识写入同一套原生一次授权：完全访问时直接执行，其余模式问员工。
      await approveEscalation({
        requestedMode: 'danger-full-access', effectiveMode: scope.sandboxPolicy.resolve({ session: agent.session }).mode, subject: '鲸翼专家交接',
        justification: `派给「${role.name}」：新建任务「${input.title}」，把交接说明发进去让它马上开工；它干活中途要审批的操作照常问你。不改变会话权限模式。`,
      }, { approver: scope.get('approval'), agent, callId: exec.callId, toolName: handoffToolName, signal: exec.signal });
      exec.signal.throwIfAborted();
      // 等待批准期间专家可能被删除，按创建前的最新配置执行。
      const target = scope.whalewingExperts.get(role.id);
      let created;
      try { created = await controller.create(await placement(scope, agent)); }
      catch (error) { fail(`DSH 没能新建任务，没有交接：${error.message}`); }
      const sessionId = created?.sessionId;
      if (typeof sessionId !== 'string' || !sessionId) fail('DSH 没有返回新任务，交接没有完成；请稍后重试');
      // 建好之后不再响应取消：选专家很快，半途停下会留下没有专家的空任务。
      let task;
      try {
        ({ agent: task } = await controller.resolveAgent(sessionId));
        const done = await commands.execute(task, `/whalewing-expert ${JSON.stringify({ expertId: target.id })}`, [], new AbortController().signal);
        if (done?.result.kind !== 'success') throw new Error(done?.result.text || '专家选择没有完成');
        if (!(await sessions.flush(task.session))) throw new Error('专家选择还没确认保存');
        if (projections.stateOf(task.session, 'whalewingExpert')?.view.expertId !== target.id) throw new Error('专家选择读回不一致');
      } catch (error) {
        fail(`新任务已建好（${sessionId}），但没能选上「${target.name}」：${error.message}。交接没有完成，不要再次调用；请员工在专家页选「${target.name}」开始新任务，再把交接说明贴进去。`);
      }
      let renamed = false;
      if (typeof controller.rename === 'function') {
        try { await controller.rename({ sessionId, title: `${target.name} · ${input.title}` }); renamed = true; }
        catch { /* 标题只方便查找，设不上不影响交接。 */ }
      }
      // 员工批准了就直接开工（2026-11-08 用户定）；开不了工时退回原来的做法：交接说明留给员工自己发。
      let started = false, startIssue;
      try {
        const dispatches = scope.get('whalewingDispatches');
        if (!dispatches) throw new Error('派工记录还没准备好');
        await dispatches.start({ task, sessionId, expert: target, title: input.title, from: agent.session.id, draft: input.draft });
        started = true;
      } catch (error) { startIssue = error.message; }
      return { sessionId, expertId: target.id, expertName: target.name, title: input.title, draft: input.draft, renamed, started, ...(startIssue ? { startIssue } : {}) };
    },
    presentCall: args => ({ card: 'generic', title: '交给专家', kind: 'other', rawInput: args }),
  });
}

/** 只在实际选了小鲸的普通主会话里出现，其他专家和子代理看不到这项工具。 */
export function applyHandoff(ctx) { applyManagerTool(ctx, definition, 'whalewing handoff'); }

/** 小鲸专用的工具（交接、建专家）都这样登记：选了小鲸的普通主会话才有，换专家、子代理、功能退出都撤回。 */
export function applyManagerTool(ctx, makeDefinition, label) {
  ctx.inject(['tools', 'agents', 'whalewingExperts', 'sandboxPolicy'], scope => {
    const tool = makeDefinition(scope);
    const owned = new Map();
    let closing = false;
    const release = agent => {
      const record = owned.get(agent);
      if (!record) return;
      owned.delete(agent);
      record.unregister(); record.lifetime();
    };
    function sync(agent) {
      if (closing) return;
      if (scope.agents.get(agent.id) !== agent || scope.whalewingExperts.selectedFor(agent) !== 'manager') { release(agent); return; }
      if (owned.has(agent)) return;
      const record = {};
      owned.set(agent, record);
      record.unregister = agent.ctx.tools.register(tool);
      // 会话结束时登记随 Agent 作用域一起撤销，这里只清掉自己的记录。
      record.lifetime = agent.ctx.effect(() => () => { if (owned.get(agent) === record) owned.delete(agent); }, `${label} lifetime`);
    }
    scope.on('agent/created', ({ agent }) => sync(agent));
    scope.on('session/event', (session, event) => {
      if (event.type !== 'command/done') return;
      const agent = scope.agents.get(session.id);
      if (agent) sync(agent);
    });
    scope.effect(() => () => {
      closing = true;
      for (const agent of [...owned.keys()]) release(agent);
    }, `${label} scope`);
    for (const agent of scope.agents.list()) sync(agent);
  });
}
