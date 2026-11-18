/**
 * 自动任务的五种用途：每日记忆（knowledge）、每周思考（thinking）、自建任务、每日资讯，
 * 和扩展登记的任务（extension，2026-11-10 起）。前后端和会话身份共用这一份。
 */
export const automationPurposes = ['knowledge', 'thinking', 'custom', 'news', 'extension'];

/** 扩展登记的任务在会话里记下是谁的：`功能id/任务id`，两段都是小写字母、数字和夹在中间的单个连字符。 */
export const taskOwnerPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 工作区身份由宿主登记表持有；全选保留排除项以覆盖后续新增工作区。 */
export function workspaceScopeContract(z) {
  const ids = z.array(z.string().min(1).max(200)).max(500).refine(values => new Set(values).size === values.length, '工作区不得重复');
  return z.union([
    z.strictObject({ mode: z.literal('all'), excludedWorkspaceIds: ids }),
    z.strictObject({ mode: z.literal('selected'), workspaceIds: ids.min(1) }),
  ]);
}

/**
 * 每次运行的结果。DSH 定时服务只记录“已送达会话”，后续结果取自任务会话里那一轮的结束原因；
 * 读不到会话记录时一律是 unknown，不按送达推断成功或失败。
 * - waiting：已送达任务会话，还没开始执行
 * - running：已开始，那一轮还没结束
 * - completed：那一轮正常结束
 * - error：那一轮因模型或工具出错而结束
 * - interrupted：被手动停止，或 DSH 关闭打断
 * - incomplete：输出达到长度上限，结果可能不完整
 * - skipped：送达后没有执行（被跳过、被拦下或从排队中移除，如每日阅读关闭时的资讯）
 * - unknown：送达已确认，但会话记录读不到或没有这次的记录
 */
export const runStatuses = ['waiting', 'running', 'completed', 'error', 'interrupted', 'incomplete', 'skipped', 'unknown'];

/** 自动任务只做宿主管理协议适配；时间和 expected 记录的语义仍由 Schedule 校验。 */
export function automationContract(z) {
  const text = z.string(), id = text.regex(/^[\w-]{1,100}$/), purpose = z.enum(automationPurposes);
  const workspaceScope = workspaceScopeContract(z);
  const daily = z.strictObject({ time: text.max(30), time_zone: text.max(100) });
  const weekly = daily.extend({ weekdays: z.array(z.number().int()).min(1).max(7) });
  const cron = z.strictObject({ expression: text.max(300), time_zone: text.max(100) });
  const selectors = { after_seconds: z.number(), at: text.max(100), every_seconds: z.number(), daily, weekly, cron };
  const spec = z.union(Object.entries(selectors).map(([key, value]) => z.strictObject({ title: text.trim().min(1).max(120), prompt: text.trim().min(1).max(32000), [key]: value })));
  const timing = z.union(Object.entries(selectors).map(([key, value]) => z.strictObject({ [key]: value })));
  const change = z.union(Object.entries(selectors).filter(([key]) => key !== 'after_seconds').map(([key, value]) => z.strictObject({ kind: z.literal(key === 'every_seconds' ? 'every' : key), [key]: value })));
  // rrule 是 DSH 0.2.2 起「自动化任务」和模型工具用的自定义规则；鲸翼只显示、不新建这种规则。
  const record = z.strictObject({ id: text, kind: z.enum(['after', 'at', 'every', 'daily', 'weekly', 'cron', 'rrule']), title: text, prompt: text, scheduledAt: text,
    afterSeconds: z.number().optional(), everySeconds: z.number().optional(), time: text.optional(), timeZone: text.optional(), weekdays: z.array(z.number()).optional(), expression: text.optional(), rrule: text.optional() });
  const input = z.union([
    // 自建任务可以挂到某位专家名下（2026-11-08）：任务会话选好这位专家，每次运行带上它的说明、记忆和模型。
    z.strictObject({ action: z.literal('create'), sessionId: id, purpose: z.literal('custom'), spec, workspaceScope: workspaceScope.optional(), expertId: id.optional() }),
    z.strictObject({ action: z.literal('create'), sessionId: id, purpose: z.literal('knowledge'), spec: timing, workspaceScope: workspaceScope.optional() }),
    // 每周思考只读知识库，不读会话，没有处理范围。
    z.strictObject({ action: z.literal('create'), sessionId: id, purpose: z.literal('thinking'), spec: timing }),
    z.discriminatedUnion('action', [
      z.strictObject({ action: z.literal('catalog') }),
      z.strictObject({ action: z.literal('directory') }),
      ...['pause', 'resume'].map(action => z.strictObject({ action: z.literal(action), sessionId: id, id, expected: record, expectedStatus: z.enum(['active', 'paused']) })),
      // run：现在跑一次，不挪动下一次到点（2026-11-18）。
      ...['read', 'delete', 'run'].map(action => z.strictObject({ action: z.literal(action), sessionId: id, id })),
      z.strictObject({ action: z.literal('history'), sessionId: id, id, limit: z.number().int().min(1).max(100), before: text.max(150).optional() }),
      z.strictObject({ action: z.literal('update'), sessionId: id, id, expected: record, expectedStatus: z.enum(['active', 'paused']), title: text.trim().min(1).max(120).optional(), prompt: text.trim().min(1).max(32000).optional(), change: change.optional(), workspaceScope: workspaceScope.optional() }),
    ]),
  ]);
  // 原生结果完整保留，避免丢弃其冲突码、投递游标或将投递冒充执行完成。
  const delivery = z.strictObject({ scheduledAt: text, deliveredAt: text, messageId: text });
  // 运行结果只在目录与历史的返回里附加，不进入 expected 记录，也不写回原生任务。
  const runStatus = z.enum(runStatuses);
  // 出错的那次带上 DSH 给的原因（代码、原文、HTTP 状态），页面据此说清楚怎么办。
  const runError = z.strictObject({ code: text.max(80), message: text.max(300), status: z.number().int().optional() });
  const entry = record.extend({ sessionId: text, status: z.enum(['active', 'paused', 'inactive']), lastDelivery: delivery.optional(), lastRun: delivery.extend({ status: runStatus, error: runError.optional() }).optional() });
  const presentation = { workspaceScope: workspaceScope.optional(), displayPrompt: text };
  // 扩展登记的任务：哪个扩展、现在开没开（没开时到点跳过）、给员工看的说明、读不读会话和从什么时候起读。
  const owner = z.strictObject({
    feature: text, task: text, package: text.optional(), label: z.strictObject({ zh: text, en: text }).optional(),
    registered: z.boolean(), description: text.optional(), readSessions: z.boolean().optional(), since: z.number().optional(),
  });
  // outdated：内置任务的指令不是当前版本（比如升级前建的“DSH 工作知识整理”），页面提示员工点一下换成新版。
  const managed = entry.extend({ purpose, ...presentation, outdated: z.literal(true).optional(), extension: owner.optional() });
  const result = z.union([
    z.strictObject({ available: z.boolean(), controls: z.boolean().optional(), tasks: z.array(managed), legacyTasks: z.array(entry), issues: z.array(z.strictObject({ sessionId: text, message: text })) }),
    z.strictObject({ task: z.union([record, managed]), recovered: z.boolean() }),
    z.strictObject({ task: record, purpose, status: z.enum(['active', 'paused', 'inactive']), ...presentation, extension: owner.optional() }), z.strictObject({ task: record, legacy: z.literal(true), status: z.enum(['active', 'paused', 'inactive']) }),
    z.strictObject({ id: text, records: z.array(delivery.extend({ prompt: text.optional(), status: runStatus.optional(), error: runError.optional() })), earlierRecordsUnavailable: z.boolean(), earlierRecordsPruned: z.boolean(), retention: z.strictObject({ days: z.number(), records: z.number() }), nextBefore: text.optional() }),
    z.strictObject({ id: text, updated: z.boolean(), record: record.optional(), code: text.optional() }),
    z.strictObject({ id: text, deleted: z.boolean(), code: text.optional() }),
    z.strictObject({ id: text, ran: z.literal(true), deliveredAt: text.optional(), messageId: text.optional() }),
    z.strictObject({ directory: text }),
    z.strictObject({ id: text.optional(), code: text, message: text.optional() }),
  ]);
  const packageName = 'dsh-whalewing/automation';
  const descriptor = {
    id: `${packageName}#whalewingAutomation/manageAutomation`, service: 'whalewingAutomation', namespace: 'whalewingAutomation', method: 'manageAutomation', invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#AutomationInput`, create: () => input } }],
    cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#AutomationResult`, create: () => result },
  };
  return { input, result, host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor], model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: [descriptor] } };
}
