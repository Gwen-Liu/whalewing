import { defineTool } from '@deepseek-ai/dsh-tools';
import { approveEscalation } from '@deepseek-ai/dsh-sandbox';

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

/** 交接说明是员工将要发给专家的原话草稿，只分员工看得懂的几段。 */
export function handoffDraft({ title, goal, deliverable, materials = [], notes = '' }) {
  return [
    `【小鲸交接】${title}`,
    `目标：${goal}`,
    `要交付：${deliverable}`,
    ...(materials.length ? [['相关笔记和文件：', ...materials.map(item => `- ${item}`)].join('\n')] : []),
    ...(notes ? [`员工的要求和已有结论：\n${notes}`] : []),
  ].join('\n\n');
}

/** 参数先在副作用之前全部校验，审批弹窗里看到的就是将要建的任务。 */
export function handoffInput(args) {
  const expertId = typeof args.expertId === 'string' ? args.expertId.trim() : '';
  if (!expertIdPattern.test(expertId)) fail('专家标识无效，请先用 whalewing_experts 的 list 查到准确标识');
  if (expertId === 'manager') fail('不能交给小鲸自己，请选一位负责这件事的专家');
  const title = field(args.title, '任务名', limits.title);
  if (/[\r\n]/.test(title)) fail('任务名只写一行');
  const goal = field(args.goal, '目标', limits.field);
  const deliverable = field(args.deliverable, '要交付的内容', limits.field);
  const notes = field(args.notes, '员工的要求和已有结论', limits.field, false);
  const materials = [...new Set((args.materials ?? []).map(item => field(item, '资料路径', limits.material)))];
  if (materials.length > limits.materials) fail(`相关资料最多 ${limits.materials} 项，请只带上专家必须先看的`);
  if (materials.some(item => /[\r\n]/.test(item))) fail('每项资料路径只写一行');
  return { expertId, title, goal, deliverable, materials, notes, draft: handoffDraft({ title, goal, deliverable, materials, notes }) };
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
    description: '把一件事交给另一位鲸翼专家：为这位专家新建一个任务，交接说明作为草稿放进那个任务的输入框，由员工看过后自己发送。不会自动发送，也不会替员工开始对话；新任务和当前对话互不相通。只在员工同意交给这位专家后调用，每件事调用一次，需要员工批准。专家标识先用 whalewing_experts 的 list 查。',
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
      } },
      render: (_args, value) => [{ type: 'text', text: [
        `已为「${value.expertName}」新建任务「${value.title}」，交接说明还没有发送。员工点这条记录上的「打开任务」，交接说明会放进那个任务的输入框，看过、改好后由员工自己发送。`,
        '新任务和当前对话互不相通，你看不到它的进展；不要为同一件事再次调用。',
        ...(value.renamed ? [] : ['任务标题没有设上，不影响使用。']),
        `交接说明全文：\n${value.draft}`,
      ].join('\n') }],
      // 卡片据此打开任务和填草稿，不必再解析给模型看的文字。
      presentationMeta: (_args, value) => ({ sessionId: value.sessionId, expertId: value.expertId, expertName: value.expertName, title: value.title, draft: value.draft }),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const agent = exec.agent;
      // 原生父子链会继承这项定义，执行时仍按实际会话核对。
      if (!agent || scope.whalewingExperts.selectedFor(agent) !== 'manager') fail('只有小鲸助手的主会话能把任务交给专家；子代理和其他专家请把建议交回负责的会话');
      const input = handoffInput(args);
      const role = scope.whalewingExperts.get(input.expertId);
      const controller = scope.get('sessionController'), commands = scope.get('commands'), sessions = scope.get('sessions'), projections = scope.get('sessionProjections');
      if (typeof controller?.create !== 'function' || typeof controller.resolveAgent !== 'function' || !commands || !sessions || !projections) {
        fail(`当前 DSH 不支持插件新建任务，没有交接。请员工在专家页选「${role.name}」开始新任务，再把下面的交接说明贴进去：\n${input.draft}`);
      }
      // 与知识写入同一套原生一次授权：完全访问时直接执行，其余模式问员工。
      await approveEscalation({
        requestedMode: 'danger-full-access', effectiveMode: scope.sandboxPolicy.resolve({ session: agent.session }).mode, subject: '鲸翼专家交接',
        justification: `为「${role.name}」新建任务「${input.title}」，交接说明作为草稿放进那个任务，由员工看过后自己发送；不改变会话权限模式。`,
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
      try {
        const { agent: task } = await controller.resolveAgent(sessionId);
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
      return { sessionId, expertId: target.id, expertName: target.name, title: input.title, draft: input.draft, renamed };
    },
    presentCall: args => ({ card: 'generic', title: '交给专家', kind: 'other', rawInput: args }),
  });
}

/** 只在实际选了小鲸的普通主会话里出现，其他专家和子代理看不到这项工具。 */
export function applyHandoff(ctx) {
  ctx.inject(['tools', 'agents', 'whalewingExperts', 'sandboxPolicy'], scope => {
    const tool = definition(scope);
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
      record.lifetime = agent.ctx.effect(() => () => { if (owned.get(agent) === record) owned.delete(agent); }, 'whalewing handoff lifetime');
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
    }, 'whalewing handoff scope');
    for (const agent of scope.agents.list()) sync(agent);
  });
}
