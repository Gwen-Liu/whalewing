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
 * - skipped：送达后没有执行（被跳过、被拦下或从排队中移除，如知识卡片关闭时的资讯）
 * - unknown：送达已确认，但会话记录读不到或没有这次的记录
 */
export const runStatuses = ['waiting', 'running', 'completed', 'error', 'interrupted', 'incomplete', 'skipped', 'unknown'];

/** 自动任务只做宿主管理协议适配；时间和 expected 记录的语义仍由 Schedule 校验。 */
export function automationContract(z) {
  const text = z.string(), id = text.regex(/^[\w-]{1,100}$/), purpose = z.enum(['knowledge', 'custom', 'news']);
  const workspaceScope = workspaceScopeContract(z);
  const daily = z.strictObject({ time: text.max(30), time_zone: text.max(100) });
  const weekly = daily.extend({ weekdays: z.array(z.number().int()).min(1).max(7) });
  const cron = z.strictObject({ expression: text.max(300), time_zone: text.max(100) });
  const selectors = { after_seconds: z.number(), at: text.max(100), every_seconds: z.number(), daily, weekly, cron };
  const spec = z.union(Object.entries(selectors).map(([key, value]) => z.strictObject({ title: text.trim().min(1).max(120), prompt: text.trim().min(1).max(32000), [key]: value })));
  const timing = z.union(Object.entries(selectors).map(([key, value]) => z.strictObject({ [key]: value })));
  const change = z.union(Object.entries(selectors).filter(([key]) => key !== 'after_seconds').map(([key, value]) => z.strictObject({ kind: z.literal(key === 'every_seconds' ? 'every' : key), [key]: value })));
  const record = z.strictObject({ id: text, kind: z.enum(['after', 'at', 'every', 'daily', 'weekly', 'cron']), title: text, prompt: text, scheduledAt: text,
    afterSeconds: z.number().optional(), everySeconds: z.number().optional(), time: text.optional(), timeZone: text.optional(), weekdays: z.array(z.number()).optional(), expression: text.optional() });
  const input = z.union([
    z.strictObject({ action: z.literal('create'), sessionId: id, purpose: z.literal('custom'), spec, workspaceScope: workspaceScope.optional() }),
    z.strictObject({ action: z.literal('create'), sessionId: id, purpose: z.literal('knowledge'), spec: timing, workspaceScope: workspaceScope.optional() }),
    z.discriminatedUnion('action', [
      z.strictObject({ action: z.literal('catalog') }),
      z.strictObject({ action: z.literal('directory') }),
      ...['pause', 'resume'].map(action => z.strictObject({ action: z.literal(action), sessionId: id, id, expected: record, expectedStatus: z.enum(['active', 'paused']) })),
      ...['read', 'delete'].map(action => z.strictObject({ action: z.literal(action), sessionId: id, id })),
      z.strictObject({ action: z.literal('history'), sessionId: id, id, limit: z.number().int().min(1).max(100), before: text.max(150).optional() }),
      z.strictObject({ action: z.literal('update'), sessionId: id, id, expected: record, expectedStatus: z.enum(['active', 'paused']), title: text.trim().min(1).max(120).optional(), prompt: text.trim().min(1).max(32000).optional(), change: change.optional(), workspaceScope: workspaceScope.optional() }),
    ]),
  ]);
  // 原生结果完整保留，避免丢弃其冲突码、投递游标或将投递冒充执行完成。
  const delivery = z.strictObject({ scheduledAt: text, deliveredAt: text, messageId: text });
  // 运行结果只在目录与历史的返回里附加，不进入 expected 记录，也不写回原生任务。
  const runStatus = z.enum(runStatuses);
  const entry = record.extend({ sessionId: text, status: z.enum(['active', 'paused', 'inactive']), lastDelivery: delivery.optional(), lastRun: delivery.extend({ status: runStatus }).optional() });
  const presentation = { workspaceScope: workspaceScope.optional(), displayPrompt: text };
  const managed = entry.extend({ purpose, ...presentation });
  const result = z.union([
    z.strictObject({ available: z.boolean(), controls: z.boolean().optional(), tasks: z.array(managed), legacyTasks: z.array(entry), issues: z.array(z.strictObject({ sessionId: text, message: text })) }),
    z.strictObject({ task: z.union([record, managed]), recovered: z.boolean() }),
    z.strictObject({ task: record, purpose, status: z.enum(['active', 'paused', 'inactive']), ...presentation }), z.strictObject({ task: record, legacy: z.literal(true), status: z.enum(['active', 'paused', 'inactive']) }),
    z.strictObject({ id: text, records: z.array(delivery.extend({ prompt: text.optional(), status: runStatus.optional() })), earlierRecordsUnavailable: z.boolean(), earlierRecordsPruned: z.boolean(), retention: z.strictObject({ days: z.number(), records: z.number() }), nextBefore: text.optional() }),
    z.strictObject({ id: text, updated: z.boolean(), record: record.optional(), code: text.optional() }),
    z.strictObject({ id: text, deleted: z.boolean(), code: text.optional() }),
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
