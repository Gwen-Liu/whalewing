import { worldEfforts } from '../../src/model-world-index.js';
import { probeTestIds } from '../../src/model-world-probe.js';

export const worldLimits = Object.freeze({ plans: 400, efforts: 8, snapshotBytes: 8 * 1024 * 1024, responseBytes: 12 * 1024 * 1024, models: 10000, vendors: 500, operationMs: 60000, sources: 10, scores: 300, modalities: 20, text: 500, id: 240, sourceId: 100, query: 160, link: 2000, sourceNote: 4000, error: 1000, page: 200, defaultPage: 100, compare: 4 });
/** 我的模型、用量和模型测智的上限：测智一次调用最长等 4 分钟，回答最多留 6 万字，记录最多留 30 轮。 */
export const deskLimits = Object.freeze({ probeMs: 240000, reply: 60000, runs: 30, records: 48, groups: 100, models: 500, used: 2000, days: 400, issues: 50 });
export const worldCapabilityKeys = Object.freeze(['promptCaching', 'reasoning', 'structuredOutput', 'toolCall']);
export const worldPriceKeys = Object.freeze(['cachedInputPerMTok', 'inputPerMTok', 'outputPerMTok']);

/** 分项评分采用的第三方评测：按维度归组，只接纳 Epoch AI 收录的第三方成绩，不采信厂商自报。 */
export const worldDimensions = Object.freeze({
  eci: { name: 'Epoch 综合指数', weight: 0.35 },
  reasoning: { name: '推理与知识', weight: 0.25 },
  coding: { name: '编程', weight: 0.25 },
  agent: { name: '智能体', weight: 0.15 },
});
export const worldBenchmarks = Object.freeze({
  eci: { name: 'Epoch 综合指数 (ECI)', dimension: 'eci', unit: 'index' },
  gpqa_diamond: { name: 'GPQA Diamond', dimension: 'reasoning', unit: 'pct' },
  hle: { name: "Humanity's Last Exam", dimension: 'reasoning', unit: 'pct' },
  arc_agi_2: { name: 'ARC-AGI-2', dimension: 'reasoning', unit: 'pct' },
  frontiermath: { name: 'FrontierMath', dimension: 'reasoning', unit: 'pct' },
  aime: { name: 'AIME', dimension: 'reasoning', unit: 'pct' },
  simplebench: { name: 'SimpleBench', dimension: 'reasoning', unit: 'pct' },
  swe_bench_verified: { name: 'SWE-bench Verified', dimension: 'coding', unit: 'pct' },
  terminal_bench_2_0: { name: 'Terminal-Bench 2.0', dimension: 'coding', unit: 'pct' },
  webdev_arena_elo: { name: 'WebDev Arena', dimension: 'coding', unit: 'elo' },
  metr_time_horizons: { name: 'METR 任务时长', dimension: 'agent', unit: 'minutes' },
  gdpval: { name: 'GDPval', dimension: 'agent', unit: 'pct' },
  vending_bench_2: { name: 'Vending-Bench 2', dimension: 'agent', unit: 'usd' },
  apex_agents: { name: 'APEX-Agents', dimension: 'agent', unit: 'pct' },
  the_agent_company: { name: 'TheAgentCompany', dimension: 'agent', unit: 'pct' },
});
export const worldScoreSources = Object.freeze(['epoch.ai']);
export const worldUnits = Object.freeze(['pct', 'index', 'elo', 'minutes', 'usd']);
export const worldTiers = Object.freeze(['T0', 'T1', 'T2', 'T3']);
/** 榜单：综合实力、三个分项与性价比。性价比按“模型 + 思考强度”方案比较，由独立的 value 操作返回。 */
export const worldBoards = Object.freeze({ overall: '综合实力', reasoning: '推理与知识', coding: '编程', agent: '智能体', value: '性价比' });
export const worldRankingBoards = Object.freeze(['overall', 'reasoning', 'coding', 'agent']);
export const worldEffortIds = Object.freeze(Object.keys(worldEfforts));

/** 传输只承载已准入快照；Host 投影与 Client 使用同一行定义，不允许泛 JSON 成功回执。 */
export function modelWorldContract(z) {
  const text = z.string().min(1).max(worldLimits.text), id = text.max(worldLimits.id);
  const time = z.string().datetime();
  const link = z.string().url().max(worldLimits.link).refine(value => { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; });
  const numeric = z.number().finite().min(0).max(1e30).nullable();
  const source = z.strictObject({ fetchedAt: time.nullable(), note: z.string().max(worldLimits.sourceNote).nullable(), ok: z.boolean() });
  const sources = z.record(text.max(100), source).refine(value => Object.keys(value).length <= worldLimits.sources);
  const vendor = z.strictObject({ id, name: id, nameZh: id, homepage: link.nullable(), modelCount: z.number().int().min(0).max(worldLimits.models).optional(), top: z.strictObject({ id, name: id, overall: z.number().finite().min(0).max(100), tier: z.enum(worldTiers) }).nullable().optional() });
  const attribution = z.strictObject({ name: text, url: link, license: text, changes: text, licenseUrl: link.optional() });
  const benchmarkIds = Object.keys(worldBenchmarks), boardIds = Object.keys(worldBoards);
  const score = z.strictObject({ league: z.enum(benchmarkIds), score: z.number().finite().min(-1e30).max(1e30), source: z.enum(worldScoreSources), sourceUrl: link.nullable(), attribution: z.literal('third-party'), unit: z.enum(worldUnits) });
  const league = z.strictObject({ id: z.enum(boardIds), name: text });
  const percent = z.number().finite().min(0).max(100).nullable();
  const effortId = z.enum(worldEffortIds).nullable();
  const rating = z.strictObject({ overall: percent, tier: z.enum(worldTiers).nullable(), effort: effortId, composite: percent, ...Object.fromEntries(Object.keys(worldDimensions).map(key => [key, percent])), coverage: z.number().int().min(0).max(benchmarkIds.length) });
  const effort = z.strictObject({ effort: effortId, index: z.number().finite().min(0).max(100), cost: numeric });
  const plan = z.strictObject({ key: text, modelId: id, name: id, vendorId: id, effort: effortId, index: z.number().finite().min(0).max(100), cost: z.number().finite().min(0).max(1e9), frontier: z.boolean() });
  const band = z.strictObject({ id: text.max(40), name: text, best: plan.nullable(), alternatives: z.array(plan).max(3) });
  const model = z.strictObject({
    id, name: id, vendorId: id,
    releaseDate: z.string().regex(/^\d{4}(-\d{2})?(-\d{2})?$/).nullable(), releaseDatePrecision: z.enum(['year', 'month', 'day']).nullable(),
    contextWindow: numeric, maxOutput: numeric, knowledgeCutoff: z.string().max(10).nullable(), license: text.nullable(), openWeights: z.boolean().nullable(),
    capabilities: z.strictObject(Object.fromEntries(worldCapabilityKeys.map(key => [key, z.boolean().nullable()]))),
    pricing: z.strictObject({ ...Object.fromEntries(worldPriceKeys.map(key => [key, numeric])), unit: z.literal('USD / 1M tokens'), note: z.literal('models.dev 官方渠道价格，不代表员工转发站实际费用') }),
    modalities: z.strictObject({ input: z.array(text.max(80)).max(worldLimits.modalities), output: z.array(text.max(80)).max(worldLimits.modalities) }).nullable(),
    scores: z.array(score).max(benchmarkIds.length), efforts: z.array(effort).max(worldLimits.efforts), rating,
  }).refine(value => value.releaseDate === null ? value.releaseDatePrecision === null : value.releaseDate.length === ({ year: 4, month: 7, day: 10 })[value.releaseDatePrecision], '发布日期与精度不一致');
  const snapshot = z.strictObject({ generatedAt: time, sources, vendors: z.array(vendor).max(worldLimits.vendors), models: z.array(model).max(worldLimits.models), leagues: z.array(league).max(boardIds.length), attributions: z.array(attribution).min(3).max(3) });
  const refresh = z.discriminatedUnion('status', [
    z.strictObject({ status: z.literal('ok'), at: time }),
    ...['error', 'cancelled'].map(status => z.strictObject({ status: z.literal(status), code: z.union([text, z.number().int()]), message: z.string().max(worldLimits.error) })),
  ]).nullable();
  const status = {
    available: z.boolean(), refreshing: z.boolean(), acceptedAt: time.nullable(), generatedAt: time.nullable(), sources,
    modelCount: z.number().int().min(0).max(worldLimits.models), vendors: z.array(vendor).max(worldLimits.vendors), leagues: z.array(league).max(boardIds.length),
    lastRefresh: refresh, attributions: z.array(attribution).min(3).max(3),
    // 综合实力数据来自随包还是在线更新；key 只说明是否配置及来源，从不携带 Key 本身。
    index: z.strictObject({ source: z.enum(['bundled', 'online']), asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), version: z.string().min(1).max(40), key: z.enum(['none', 'saved', 'env', 'unavailable']), error: z.string().max(worldLimits.error).nullable() }),
  };
  const page = { models: z.array(model).max(worldLimits.page), total: z.number().int().min(0).max(worldLimits.models), offset: z.number().int().min(0).max(worldLimits.models), limit: z.number().int().min(1).max(worldLimits.page), unknownDates: z.number().int().min(0).max(worldLimits.models) };
  const filters = {
    query: z.string().max(worldLimits.query).optional(), vendorId: id.optional(),
    capability: z.enum(['reasoning', 'toolCall', 'structuredOutput', 'promptCaching']).optional(),
    offset: z.number().int().min(0).max(worldLimits.models).optional(), limit: z.number().int().min(1).max(worldLimits.page).optional(),
  };
  const input = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('status') }),
    z.strictObject({ action: z.literal('refresh') }),
    z.strictObject({ action: z.literal('setIndexKey'), key: z.string().min(8).max(200).regex(/^[\x21-\x7e]+$/) }),
    z.strictObject({ action: z.literal('clearIndexKey') }),
    z.strictObject({ action: z.literal('all') }),
    z.strictObject({ action: z.literal('list'), ...filters }),
    z.strictObject({ action: z.literal('timeline'), ...filters }),
    z.strictObject({ action: z.literal('ranking'), league: z.enum(worldRankingBoards), direction: z.enum(['asc', 'desc']).optional(), ...filters }),
    z.strictObject({ action: z.literal('value'), query: filters.query, vendorId: filters.vendorId }),
    z.strictObject({ action: z.literal('detail'), id }),
    z.strictObject({ action: z.literal('compare'), ids: z.array(id).min(2).max(worldLimits.compare) }),
  ]);
  const result = z.discriminatedUnion('action', [
    ...['status', 'refresh', 'setIndexKey', 'clearIndexKey'].map(action => z.strictObject({ action: z.literal(action), ...status })),
    z.strictObject({ action: z.literal('all'), ...status, models: z.array(model).max(worldLimits.models) }),
    ...['list', 'timeline', 'ranking'].map(action => z.strictObject({ action: z.literal(action), ...status, ...page })),
    z.strictObject({ action: z.literal('value'), ...status, bands: z.array(band).max(10), plans: z.array(plan).max(worldLimits.plans) }),
    z.strictObject({ action: z.literal('detail'), ...status, model: model.nullable(), vendor: vendor.nullable() }),
    z.strictObject({ action: z.literal('compare'), ...status, models: z.array(model).max(worldLimits.compare) }),
  ]).refine(value => value.available ? value.generatedAt !== null && value.acceptedAt !== null : value.generatedAt === null && value.acceptedAt === null && value.modelCount === 0, '快照可用状态与元数据不一致')
    .refine(value => value.action !== 'detail' || (value.available ? value.model !== null && value.vendor !== null && value.model.vendorId === value.vendor.id : value.model === null && value.vendor === null), '详情结果与快照不一致')
    .refine(value => value.action !== 'compare' || (value.available ? value.models.length >= 2 : value.models.length === 0), '比较结果缺少模型')
    .refine(value => !['list', 'timeline', 'ranking'].includes(value.action) || (value.models.length <= value.limit && value.models.length <= value.total && (value.available || value.total === 0)), '模型分页结果不一致');
  const packageName = 'dsh-whalewing/model-world';
  const descriptor = {
    id: `${packageName}#whalewingModelWorld/manageModelWorld`, service: 'whalewingModelWorld', namespace: 'whalewingModelWorld', method: 'manageModelWorld', invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#ModelWorldInput`, create: () => input } }],
    cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#ModelWorldResult`, create: () => result },
  };
  // ---- 我的模型、用量、模型测智：读 DSH 的模型目录和会话用量，按员工的操作改默认模型、直接调一次模型 ----
  const count = z.number().int().min(0).max(1e15), day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const provider = text.max(120), modelName = text.max(160), effortName = text.max(80);
  const target = { provider, model: modelName, effort: effortName.optional() };
  const totals = { inputTokens: count, outputTokens: count, cacheReadTokens: count, cacheWriteTokens: count, calls: count };
  const runId = z.string().regex(/^[a-z0-9-]{6,60}$/), probeId = z.enum(probeTestIds), seed = z.number().int().min(0).max(0xffffffff);
  const grade = z.strictObject({ made: z.boolean().nullable(), pass: z.boolean().nullable(), answer: z.string().max(400).nullable(), expect: z.string().max(100).nullable(), note: z.string().max(400) });
  const record = { runId, at: time, testId: probeId, seed, classic: z.boolean(), provider, model: modelName, effort: effortName.nullable(), ms: count, usage: z.strictObject(totals).nullable(), finish: z.string().max(40), error: z.string().max(worldLimits.error).nullable(), grade };
  const deskInput = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('mine') }),
    z.strictObject({ action: z.literal('setMapping'), provider, model: modelName, modelId: id.nullable() }),
    z.strictObject({ action: z.literal('setDefault'), ...target }),
    z.strictObject({ action: z.literal('selectModel'), sessionId: text.max(200), ...target }),
    z.strictObject({ action: z.literal('usage'), days: z.number().int().min(1).max(deskLimits.days) }),
    z.strictObject({ action: z.literal('probe'), runId, testId: probeId, seed, classic: z.boolean(), ...target }),
    z.strictObject({ action: z.literal('probes') }),
    z.strictObject({ action: z.literal('probeRun'), runId }),
    z.strictObject({ action: z.literal('probeStar'), runId, row: z.string().regex(/^[a-z]+\|[01]$/), key: z.string().max(300).nullable() }),
    z.strictObject({ action: z.literal('probeDelete'), runId }),
  ]);
  const mineModel = z.strictObject({ id: modelName, name: text.max(200), efforts: z.array(z.strictObject({ id: effortName, name: text.max(120) })).max(12), defaultEffort: effortName.nullable(), contextWindow: numeric });
  const mineGroup = z.strictObject({ id: provider, name: text.max(200), kind: z.enum(['official', 'relay', 'local', 'unknown']), host: z.string().max(253).nullable(), models: z.array(mineModel).max(deskLimits.models) });
  const runSummary = z.strictObject({ runId, at: time, stars: z.record(z.string().max(40), z.string().max(300)), records: z.array(z.strictObject(record)).max(deskLimits.records) });
  const deskResult = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('mine'), supported: z.strictObject({ catalog: z.boolean(), setDefault: z.boolean(), probe: z.boolean(), selectModel: z.boolean() }), defaultModel: z.strictObject(target).nullable(),
      groups: z.array(mineGroup).max(deskLimits.groups), mapping: z.record(z.string().max(300), id.nullable()), used: z.array(z.strictObject({ provider, model: modelName, calls: count, tokens: count, lastDay: day })).max(deskLimits.used), issues: z.array(z.string().max(worldLimits.error)).max(deskLimits.issues) }),
    z.strictObject({ action: z.literal('setMapping'), mapping: z.record(z.string().max(300), id.nullable()) }),
    z.strictObject({ action: z.literal('setDefault'), defaultModel: z.strictObject(target) }),
    z.strictObject({ action: z.literal('selectModel'), sessionId: text.max(200), selected: z.strictObject(target) }),
    z.strictObject({ action: z.literal('usage'), today: day, since: day.nullable(), backfilled: z.boolean(), days: z.array(z.strictObject({ day, ...totals })).max(deskLimits.days), rows: z.array(z.strictObject({ provider, model: modelName, ...totals })).max(deskLimits.used) }),
    z.strictObject({ action: z.literal('probe'), ...record, reply: z.string().max(deskLimits.reply) }),
    z.strictObject({ action: z.literal('probes'), runs: z.array(runSummary).max(deskLimits.runs) }),
    z.strictObject({ action: z.literal('probeRun'), runId, at: time, stars: z.record(z.string().max(40), z.string().max(300)), records: z.array(z.strictObject({ ...record, reply: z.string().max(deskLimits.reply) })).max(deskLimits.records) }),
    z.strictObject({ action: z.literal('probeStar'), runId, stars: z.record(z.string().max(40), z.string().max(300)) }),
    z.strictObject({ action: z.literal('probeDelete'), runs: z.array(runSummary).max(deskLimits.runs) }),
  ]);
  // 落盘格式：对应关系、账本（days[日期][渠道][型号]）、测智轮次摘要。读回时按它校验，对不上就另存原文件、从空的开始。
  const stored = z.strictObject({ version: z.literal(1), mapping: z.record(z.string().max(300), id), ledger: z.strictObject({ since: day, backfilled: z.boolean(), days: z.record(day, z.record(provider, z.record(modelName, z.strictObject(totals)))) }), runs: z.array(runSummary).max(deskLimits.runs) });
  const deskDescriptor = {
    id: `${packageName}#whalewingModelWorld/manageModelDesk`, service: 'whalewingModelWorld', namespace: 'whalewingModelWorld', method: 'manageModelDesk', invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#ModelDeskInput`, create: () => deskInput } }],
    cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#ModelDeskResult`, create: () => deskResult },
  };
  return { input, result, snapshot, model, desk: { input: deskInput, result: deskResult, stored }, host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor, deskDescriptor], model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: [descriptor, deskDescriptor] } };
}
