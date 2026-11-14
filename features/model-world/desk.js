import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm';
import { deskLimits } from './contract.js';
import { probeQuestion, probeGrade } from '../../src/model-world-probe.js';
import { addUsage, channelOf, dayOf, emptyUsage, foldUsage, pruneLedger, usageOf, usageTokens, usageWindow, dayShift } from '../../src/model-world-mine.js';

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const recordKey = record => `${record.testId}|${record.classic ? 1 : 0}|${record.provider}\n${record.model}`;
const emptyState = today => ({ version: 1, mapping: {}, ledger: { since: today, backfilled: false, days: {} }, runs: [] });

/**
 * 模型世界里和员工自己有关的部分：读 DSH 配好的模型和默认模型、按天按模型记用量、手动对应型号、
 * 给会话选模型、改默认模型，以及模型测智（不建会话，直接调一次模型）。
 * 只在员工操作时才改 DSH 的设置；账本、对应关系和测智记录只存在本机 profile 目录里。
 */
export class ModelDesk {
  /**
   * root：放账本和测智记录的目录。services()：现取 DSH 服务 { sessionController, agentDefaultModel, llm, settings }，
   * DSH 重载插件后不留旧引用。stored：契约里的落盘校验。
   */
  constructor({ root, services, stored, fileSystem = fsPromises, now = () => Date.now(), flushMs = 5000 }) {
    if (!path.isAbsolute(root)) fail('DESK_PATH', '模型世界数据目录须为绝对路径');
    this.root = path.resolve(root); this.file = path.join(this.root, 'desk.json'); this.replies = path.join(this.root, 'probes');
    this.services = services; this.stored = stored; this.fs = fileSystem; this.now = now; this.flushMs = flushMs;
    this.state = null; this.loading = null; this.saving = Promise.resolve(); this.timer = null; this.dirty = false;
    // 会话 → 当前用的渠道和型号；会话 id → 本次启动后已经逐次记下的用量（补记历史时要扣掉，免得记两遍）。
    this.routes = new WeakMap(); this.live = new Map(); this.queue = [];
  }
  today() { return dayOf(this.now()); }
  async load() {
    return this.loading ??= (async () => {
      let state = emptyState(this.today()), text = null;
      try { text = await this.fs.readFile(this.file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (text !== null) {
        let parsed = null;
        try { parsed = this.stored.safeParse(JSON.parse(text)); } catch { parsed = null; }
        // 读得到但对不上格式：原文件改名留着，不覆盖也不删，从空的开始记。
        if (parsed?.success) state = parsed.data; else await this.fs.rename(this.file, path.join(this.root, `desk.unreadable-${this.now()}.json`)).catch(() => {});
      }
      this.state = state;
      for (const item of this.queue.splice(0)) this.fold(item.provider, item.model, item.usage, item.sessionId);
    })();
  }
  save() {
    this.dirty = false; clearTimeout(this.timer); this.timer = null;
    const text = JSON.stringify(this.state);
    return this.saving = this.saving.catch(() => {}).then(async () => { await this.fs.mkdir(this.root, { recursive: true }); await writeFileAtomic(this.file, text, { mode: 0o600 }); });
  }
  scheduleSave() {
    this.dirty = true;
    if (this.timer === null) { this.timer = setTimeout(() => { this.timer = null; if (this.dirty) this.save().catch(() => {}); }, this.flushMs); this.timer.unref?.(); }
  }

  // ---- 用量 ----
  fold(provider, model, usage, sessionId) {
    foldUsage(this.state.ledger, this.today(), provider, model, usage);
    if (sessionId) addUsage(this.live.get(sessionId) ?? this.live.set(sessionId, emptyUsage()).get(sessionId), usage);
    this.scheduleSave();
  }
  /** 接 DSH 的会话事件：记下会话当前用的渠道和型号，每收到一条模型回复就把这次调用的用量记进当天的账。 */
  observe(session, event) {
    try {
      const data = event?.data;
      if (event?.type === 'request/header') { const config = data?.header?.config; if (config?.provider) this.routes.set(session, { provider: String(config.provider), model: String(config.model ?? '') }); }
      else if (event?.type === 'request/context') { if (data?.provider) this.routes.set(session, { provider: String(data.provider), model: String(data.model ?? '') }); }
      else if (event?.type === 'assistant/message') {
        const route = this.routes.get(session);
        if (!data?.usage || !route?.provider) return;
        const item = { provider: route.provider.slice(0, 120), model: (route.model || 'unknown').slice(0, 160), usage: usageOf(data.usage), sessionId: typeof session?.id === 'string' ? session.id : null };
        if (this.state) this.fold(item.provider, item.model, item.usage, item.sessionId); else this.queue.push(item);
      }
    } catch { /* 一条读不懂的事件不能影响会话。 */ }
  }
  /** 装这一版之前的用量：按每个会话的累计数补记一次，归到会话最后活动那天和它最后用的型号。 */
  async backfill(signal) {
    const { sessionController } = this.services();
    if (this.state.ledger.backfilled || typeof sessionController?.list !== 'function') return;
    const listed = await sessionController.list({}, signal);
    for (const item of listed?.items ?? []) {
      const values = item?.projections?.values ?? {}, route = values.modelSelection?.lastUsed, total = values.tokenUsage;
      const time = new Date(item?.updatedAt ?? NaN).getTime();
      if (!route?.provider || !route?.model || !total || !Number.isFinite(time)) continue;
      const usage = usageOf(total, 0), seen = this.live.get(item.sessionId);
      if (seen) for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) usage[key] = Math.max(0, usage[key] - seen[key]);
      if (usageTokens(usage) > 0) foldUsage(this.state.ledger, dayOf(time), String(route.provider).slice(0, 120), String(route.model).slice(0, 160), usage);
    }
    this.state.ledger.backfilled = true; pruneLedger(this.state.ledger, this.today(), deskLimits.days);
    await this.save();
  }
  async usage(input, signal) {
    await this.backfill(signal).catch(() => { /* 补记不成不影响看已经记下的。 */ });
    const today = this.today(), window = usageWindow(this.state.ledger, dayShift(today, 1 - input.days), today);
    return { today, since: this.state.ledger.since, backfilled: this.state.ledger.backfilled, days: window.days, rows: window.rows.slice(0, deskLimits.used) };
  }

  // ---- 配好的模型 ----
  async catalog() {
    const { sessionController } = this.services();
    if (typeof sessionController?.modelCatalog !== 'function') return null;
    return sessionController.modelCatalog();
  }
  /** 渠道的接口地址只用来判断是官方、转发站还是本机；读不到就算不知道。 */
  bases() {
    const { settings, llm } = this.services(), out = {};
    try { for (const item of llm?.listConfigurableProviders?.() ?? []) if (item?.provider && item.defaultBaseURL) out[item.provider] = item.defaultBaseURL; } catch { /* 没有这个接口 */ }
    try { for (const [id, value] of Object.entries(settings?.get?.('llm-pi-ai')?.providers ?? {})) if (typeof value?.baseURL === 'string' && value.baseURL) out[id] = value.baseURL; } catch { /* 没有这个设置 */ }
    return out;
  }
  async mine(signal) {
    const { sessionController, agentDefaultModel, llm } = this.services();
    const supported = { catalog: typeof sessionController?.modelCatalog === 'function', setDefault: typeof agentDefaultModel?.saveSelection === 'function' && typeof agentDefaultModel?.currentSelection === 'function', probe: typeof llm?.prepareCall === 'function', selectModel: typeof sessionController?.resolveAgent === 'function' };
    let groups = [], defaultModel = null, issues = [];
    if (supported.catalog) {
      const catalog = await this.catalog(); signal?.throwIfAborted();
      const bases = this.bases();
      issues = (catalog.failures ?? []).slice(0, deskLimits.issues).map(item => `${item.name ?? item.id ?? '渠道'}：${item.message ?? '读取失败'}`.slice(0, 1000));
      groups = (catalog.groups ?? []).slice(0, deskLimits.groups).map(group => ({
        id: group.id, name: group.name || group.id, ...channelOf(group.id, bases[group.id]),
        models: (group.models ?? []).slice(0, deskLimits.models).map(model => ({ id: model.id, name: model.name || model.id, efforts: (model.reasoning?.efforts ?? []).slice(0, 12).map(effort => ({ id: effort.id, name: effort.name || effort.id })), defaultEffort: model.reasoning?.defaultEffort ?? null, contextWindow: null })),
      }));
      if (catalog.default?.provider && catalog.default?.model) defaultModel = { provider: catalog.default.provider, model: catalog.default.model, ...(catalog.default.reasoningEffort ? { effort: catalog.default.reasoningEffort } : {}) };
    }
    await this.backfill(signal).catch(() => {});
    const used = new Map();
    for (const [day, providers] of Object.entries(this.state.ledger.days)) for (const [provider, models] of Object.entries(providers)) for (const [model, usage] of Object.entries(models)) {
      const key = `${provider}\n${model}`, row = used.get(key) ?? used.set(key, { provider, model, calls: 0, tokens: 0, lastDay: day }).get(key);
      row.calls += usage.calls; row.tokens += usageTokens(usage); if (day > row.lastDay) row.lastDay = day;
    }
    return { supported, defaultModel, groups, mapping: { ...this.state.mapping }, used: [...used.values()].sort((a, b) => b.tokens - a.tokens).slice(0, deskLimits.used), issues };
  }
  /** 目标必须是 DSH 目录里真有的型号和思考档位。 */
  async target(input) {
    const catalog = await this.catalog();
    const model = catalog?.groups?.find(group => group.id === input.provider)?.models?.find(item => item.id === input.model);
    if (!model) fail('DESK_MODEL_MISSING', '这个型号已经不在 DSH 的模型列表里了，请重新读取');
    if (input.effort !== undefined && !model.reasoning?.efforts?.some(effort => effort.id === input.effort)) fail('DESK_MODEL_MISSING', '这个型号没有这一档思考强度，请重新读取');
    return { provider: input.provider, model: input.model, ...(input.effort ? { reasoningEffort: input.effort } : {}) };
  }
  async setMapping(input) {
    const key = `${input.provider}\n${input.model}`;
    if (input.modelId === null) delete this.state.mapping[key]; else this.state.mapping[key] = input.modelId;
    await this.save();
    return { mapping: { ...this.state.mapping } };
  }
  /** 改 DSH 的默认模型：新开的对话用它，已有对话不变。界面上先确认过才会调到这里。 */
  async setDefault(input) {
    const { agentDefaultModel } = this.services();
    if (typeof agentDefaultModel?.saveSelection !== 'function') fail('DESK_UNAVAILABLE', '当前 DSH 不支持在这里改默认模型，请到 DSH 的模型设置里改');
    const selected = await this.target(input);
    await agentDefaultModel.saveSelection(selected);
    const current = agentDefaultModel.currentSelection?.();
    if (current && (current.provider !== selected.provider || current.model !== selected.model)) fail('DESK_READBACK', '默认模型没有改成，请到 DSH 的模型设置里核对');
    return { defaultModel: { provider: selected.provider, model: selected.model, ...(selected.reasoningEffort ? { effort: selected.reasoningEffort } : {}) } };
  }
  /** 只给这一个会话选模型，不动默认模型。 */
  async selectModel(input) {
    const { sessionController } = this.services();
    if (typeof sessionController?.resolveAgent !== 'function') fail('DESK_UNAVAILABLE', '当前 DSH 不支持在这里给对话选模型');
    const selected = await this.target(input);
    const agent = (await sessionController.resolveAgent(input.sessionId))?.agent;
    if (typeof agent?.model?.select !== 'function') fail('DESK_UNAVAILABLE', '对话已经建好，但没能选上模型，请在对话里手动选');
    agent.model.select(selected);
    return { sessionId: input.sessionId, selected: { provider: selected.provider, model: selected.model, ...(selected.reasoningEffort ? { effort: selected.reasoningEffort } : {}) } };
  }

  // ---- 模型测智 ----
  /** 直接调一次模型，不建会话。失败（没配 Key、被限流、超时）记成这一格的错误，不抛给整轮。 */
  async probe(input, signal) {
    const { llm } = this.services();
    if (typeof llm?.prepareCall !== 'function') fail('DESK_UNAVAILABLE', '当前 DSH 不能直接调用模型，模型测智用不了');
    const selected = await this.target(input), question = probeQuestion(input.testId, input.seed, input.classic), started = this.now();
    let reply = '', usage = null, finish = 'stop', error = null;
    try {
      const call = await llm.prepareCall(selected, signal);
      const assembler = new BlockAssembler();
      for await (const chunk of call.stream({ ...call.config, messages: [createUserMessage({ content: [{ type: 'text', text: question.prompt }], source: { kind: 'whalewing-model-probe' } })], purpose: 'whalewing-model-probe', signal })) { signal?.throwIfAborted(); assembler.push(chunk); }
      const end = assembler.finish;
      finish = String(end?.kind ?? 'stop').slice(0, 40);
      reply = assembler.blocks().filter(block => block.type === 'text').map(block => block.text).join('').slice(0, deskLimits.reply);
      if (assembler.usage) usage = usageOf(assembler.usage);
      if (end?.kind === 'error' || end?.kind === 'aborted') error = `模型没有答完（${end.failure?.code ?? end.kind}）${end.failure?.message ? `：${end.failure.message}` : ''}`.slice(0, 1000);
      else if (end?.kind === 'max-tokens') error = '回答太长，被模型的输出上限截断了';
    } catch (failure) {
      if (signal?.aborted) { finish = 'aborted'; error = '已停止或超时'; }
      else { finish = 'error'; error = `调用没有成功：${failure?.message ?? failure}`.slice(0, 1000); }
    }
    if (usage) this.fold(selected.provider, selected.model, usage, null);
    const judged = probeGrade(question, reply);
    const record = {
      runId: input.runId, at: new Date(this.now()).toISOString(), testId: input.testId, seed: question.seed, classic: input.classic, provider: selected.provider, model: selected.model, effort: selected.reasoningEffort ?? null,
      ms: Math.max(0, Math.round(this.now() - started)), usage, finish, error,
      grade: { made: judged.made, pass: error && !reply ? false : judged.pass, answer: judged.answer === null ? null : String(judged.answer).slice(0, 400), expect: judged.expect, note: (error && !reply ? error : judged.note).slice(0, 400) },
    };
    await this.keep(record, reply);
    return { ...record, reply };
  }
  replyFile(runId) { return path.join(this.replies, `${runId}.json`); }
  async readReplies(runId) { try { const value = JSON.parse(await this.fs.readFile(this.replyFile(runId), 'utf8')); return value && typeof value === 'object' ? value : {}; } catch { return {}; } }
  /** 记进这一轮：摘要进 desk.json，回答原文单独一份文件；超过上限的旧轮次连同回答一起删。 */
  keep(record, reply) {
    return this.saving = this.saving.catch(() => {}).then(async () => {
      let run = this.state.runs.find(item => item.runId === record.runId);
      if (!run) { run = { runId: record.runId, at: record.at, stars: {}, records: [] }; this.state.runs.unshift(run); }
      const key = recordKey(record), at = run.records.findIndex(item => recordKey(item) === key);
      if (at >= 0) run.records[at] = record; else if (run.records.length < deskLimits.records) run.records.push(record);
      const dropped = this.state.runs.splice(deskLimits.runs);
      await this.fs.mkdir(this.replies, { recursive: true });
      const replies = await this.readReplies(record.runId); replies[key] = reply;
      await writeFileAtomic(this.replyFile(record.runId), JSON.stringify(replies), { mode: 0o600 });
      for (const old of dropped) await this.fs.rm(this.replyFile(old.runId), { force: true }).catch(() => {});
      await this.fs.mkdir(this.root, { recursive: true }); await writeFileAtomic(this.file, JSON.stringify(this.state), { mode: 0o600 });
    });
  }
  run(runId) { return this.state.runs.find(item => item.runId === runId) ?? fail('DESK_RUN_MISSING', '这一轮测智记录已经不在了'); }
  async probeRun(input) {
    const run = this.run(input.runId), replies = await this.readReplies(run.runId);
    return { runId: run.runId, at: run.at, stars: { ...run.stars }, records: run.records.map(record => ({ ...record, reply: String(replies[recordKey(record)] ?? '').slice(0, deskLimits.reply) })) };
  }
  async probeStar(input) {
    const run = this.run(input.runId);
    if (input.key === null) delete run.stars[input.row]; else run.stars[input.row] = input.key;
    await this.save();
    return { runId: run.runId, stars: { ...run.stars } };
  }
  async probeDelete(input) {
    const at = this.state.runs.findIndex(item => item.runId === input.runId);
    if (at >= 0) { this.state.runs.splice(at, 1); await this.fs.rm(this.replyFile(input.runId), { force: true }).catch(() => {}); await this.save(); }
    return { runs: structuredClone(this.state.runs) };
  }

  async execute(input, signal) {
    await this.load(); signal?.throwIfAborted();
    switch (input.action) {
      case 'mine': return this.mine(signal);
      case 'setMapping': return this.setMapping(input);
      case 'setDefault': return this.setDefault(input);
      case 'selectModel': return this.selectModel(input);
      case 'usage': return this.usage(input, signal);
      case 'probe': return this.probe(input, signal);
      case 'probes': return { runs: structuredClone(this.state.runs) };
      case 'probeRun': return this.probeRun(input);
      case 'probeStar': return this.probeStar(input);
      case 'probeDelete': return this.probeDelete(input);
      default: return fail('DESK_INPUT', '未知操作');
    }
  }
  /** 退出前把还没落盘的账写完。 */
  async dispose() { clearTimeout(this.timer); this.timer = null; if (this.state && this.dirty) await this.save().catch(() => {}); await this.saving.catch(() => {}); }
}
