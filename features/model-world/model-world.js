import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withFileLock } from '@deepseek-ai/dsh-atomic-write';
import { modelWorldContract, worldLimits, worldCapabilityKeys as capKeys, worldPriceKeys as priceKeys, worldBoards, worldEffortIds } from './contract.js';
import { rateWorldModels } from '../../src/model-world-rating.js';
import { matchWorldIndex, worldIndex, worldIndexAsOf, worldIndexFrom, worldIndexSource, worldIndexVersion, worldValuePlans } from '../../src/model-world-index.js';
import { fetchAaIndex } from '../../src/model-world-aa.js';
import { worldBenchAsOf, worldBenchRows, worldBenchScores, worldBenchSource } from '../../src/model-world-bench.js';
import { modelWorldVendors } from '../../src/model-world-roster.js';

export { worldLimits } from './contract.js';
const contract = modelWorldContract(z);

/**
 * 模型目录与官方渠道价格都直接读 models.dev；评测成绩随插件发布。
 * 综合实力默认用随插件发布的 AA 指数；员工填了自己的 AA Key 后，「更新数据」也在线更新它。
 */
export const worldCatalogUrl = 'https://models.dev/models.json';
export const worldPriceUrl = 'https://models.dev/api.json';
export const worldAttributionsFor = version => Object.freeze([
  { name: 'models.dev', url: 'https://github.com/anomalyco/models.dev', license: 'MIT', changes: '读取规范模型目录与各厂商官方渠道价格，只收录图鉴名单内的厂商。' },
  { name: `Artificial Analysis Intelligence Index v${version}`, url: worldIndexSource.url, license: '公开排行榜数据，引用须注明来源', changes: '综合实力取各模型最强思考档的指数；性价比按单次任务成本折算相对消耗。' },
  { name: worldBenchSource.name, url: worldBenchSource.url, license: worldBenchSource.license, licenseUrl: worldBenchSource.licenseUrl, changes: '采用 Epoch AI 收录的第三方评测成绩，换算为百分位计算推理、编程、智能体分项。' },
]);
export const worldAttributions = worldAttributionsFor(worldIndexVersion);
const worldLeagues = Object.freeze(Object.entries(worldBoards).map(([id, name]) => ({ id, name })));
const worldVendors = new Map(modelWorldVendors.map(vendor => [vendor.id, vendor]));
const modelKeys = 'capabilities contextWindow id knowledgeCutoff license maxOutput modalities name openWeights pricing releaseDate releaseDatePrecision vendorId'.split(' ');
const pricingNote = 'models.dev 官方渠道价格，不代表员工转发站实际费用';
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
function object(value, keys, required = keys) {
  if (!plain(value) || Object.keys(value).some(key => !keys.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail('WORLD_SCHEMA', '模型快照结构发生变化，保留原数据');
}
function string(value, max = worldLimits.text, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('WORLD_SCHEMA', '模型快照文本格式无效');
}
function number(value, nullable = true) {
  if (nullable && value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e30) fail('WORLD_SCHEMA', '模型快照数值格式无效');
}
function bool(value, nullable = true) {
  if (nullable && value === null) return;
  if (typeof value !== 'boolean') fail('WORLD_SCHEMA', '模型快照布尔格式无效');
}
function array(value, max) { if (!Array.isArray(value) || value.length > max) fail('WORLD_SCALE', '模型快照记录数量超限或结构无效'); }
function timestamp(value) {
  string(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail('WORLD_SCHEMA', '快照时间必须是明确的 UTC 时间');
}
/** 年、年-月或年-月-日；返回精度，日期不存在时拒收。 */
function datePrecision(value) {
  string(value, 10);
  const precision = /^\d{4}$/.test(value) ? 'year' : /^\d{4}-\d{2}$/.test(value) ? 'month' : /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'day' : null;
  const full = precision === 'year' ? `${value}-01-01` : precision === 'month' ? `${value}-01` : value;
  const time = Date.parse(`${full}T00:00:00Z`);
  if (!precision || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== full) fail('WORLD_SCHEMA', '模型日期无效');
  return precision;
}
function modalities(value) {
  object(value, ['input', 'output']);
  for (const values of Object.values(value)) { array(values, worldLimits.modalities); for (const item of values) string(item, 80); }
}
function parseJson(text, label) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > worldLimits.responseBytes) fail('WORLD_SCALE', `${label}超过字节上限`);
  try { return JSON.parse(text); } catch { fail('WORLD_FETCH', `${label}不是完整 JSON`); }
}

/**
 * 把 models.dev 的规范目录（models.json）和各渠道价格（api.json）整理成鲸翼自己的目录格式。
 * 只收图鉴名单内的厂商；价格只取该厂商官方渠道。用到的字段类型不对就整份拒收，未用到的新字段忽略。
 */
export function buildWorldCatalog(catalogText, priceText, fetchedAt = new Date().toISOString()) {
  const catalog = parseJson(catalogText, 'models.dev 模型目录'), prices = parseJson(priceText, 'models.dev 价格目录');
  if (!plain(catalog) || !plain(prices)) fail('WORLD_SCHEMA', 'models.dev 目录结构发生变化，保留原数据');
  // 同一规范模型在官方渠道里常有多个别名，优先渠道 id 与规范名一致的那条。
  const official = new Map();
  for (const vendor of modelWorldVendors) for (const providerId of vendor.providers) {
    const provider = prices[providerId];
    if (provider === undefined) continue;
    if (!plain(provider) || !plain(provider.models)) fail('WORLD_SCHEMA', 'models.dev 价格目录结构发生变化，保留原数据');
    for (const entry of Object.values(provider.models)) {
      if (!plain(entry) || typeof entry.id !== 'string') fail('WORLD_SCHEMA', 'models.dev 价格条目结构发生变化，保留原数据');
      const id = typeof entry.canonical_model_id === 'string' ? entry.canonical_model_id : `${vendor.id}/${entry.id}`;
      if (!id.startsWith(`${vendor.id}/`) || entry.cost === undefined) continue;
      if (!plain(entry.cost)) fail('WORLD_SCHEMA', 'models.dev 价格格式发生变化，保留原数据');
      const exact = id === `${vendor.id}/${entry.id}`;
      if (!official.has(id) || (exact && !official.get(id).exact)) official.set(id, { exact, cost: entry.cost });
    }
  }
  const optional = (value, check) => { if (value === undefined || value === null) return null; check(value); return value; };
  const models = [];
  for (const [id, entry] of Object.entries(catalog)) {
    const vendorId = id.split('/')[0];
    if (!worldVendors.has(vendorId)) continue;
    if (!plain(entry) || entry.id !== id) fail('WORLD_SCHEMA', 'models.dev 模型条目结构发生变化，保留原数据');
    string(id, worldLimits.id); string(entry.name, worldLimits.id);
    const released = optional(entry.release_date, datePrecision);
    const limit = optional(entry.limit, value => { if (!plain(value)) fail('WORLD_SCHEMA', '模型上下文格式无效'); });
    const cost = official.get(id)?.cost ?? {};
    const price = key => optional(cost[key], value => number(value));
    const pricing = { inputPerMTok: price('input'), outputPerMTok: price('output'), cachedInputPerMTok: price('cache_read') };
    const flag = key => optional(entry[key], value => bool(value));
    models.push({
      id, name: entry.name, vendorId,
      releaseDate: released, releaseDatePrecision: released === null ? null : datePrecision(released),
      knowledgeCutoff: optional(entry.knowledge, datePrecision),
      contextWindow: optional(limit?.context, value => number(value)), maxOutput: optional(limit?.output, value => number(value)),
      license: optional(entry.license, value => string(value, 500)), openWeights: flag('open_weights'),
      capabilities: { reasoning: flag('reasoning'), toolCall: flag('tool_call'), structuredOutput: flag('structured_output'), promptCaching: pricing.cachedInputPerMTok === null ? null : true },
      pricing, modalities: optional(entry.modalities, modalities),
    });
  }
  array(models, worldLimits.models);
  return { generatedAt: fetchedAt, models };
}

/**
 * 校验鲸翼目录格式并合成快照：评测成绩按名称对上 Epoch 数据，综合实力对上 AA 指数；未知字段拒收。
 * reference 默认用随插件发布的 AA 指数与 Epoch 成绩，测试可换成合成数据。
 */
export function acceptWorldSnapshot(raw, { index = worldIndex, benchRows = worldBenchRows, indexAsOf = worldIndexAsOf, indexVersion = worldIndexVersion } = {}) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > worldLimits.snapshotBytes) fail('WORLD_SCALE', '模型快照超过字节上限');
  let input;
  try { input = JSON.parse(raw); } catch { fail('WORLD_SCHEMA', '模型快照不是完整 JSON'); }
  object(input, ['generatedAt', 'models']);
  timestamp(input.generatedAt);
  array(input.models, worldLimits.models);
  const ids = new Set();
  const models = input.models.map(model => {
    object(model, modelKeys);
    for (const key of ['id', 'name', 'vendorId']) string(model[key], worldLimits.id);
    if (ids.has(model.id) || !worldVendors.has(model.vendorId)) fail('WORLD_SCHEMA', '模型标识重复或厂商不在名单内');
    ids.add(model.id);
    if (model.releaseDate === null ? model.releaseDatePrecision !== null : datePrecision(model.releaseDate) !== model.releaseDatePrecision) fail('WORLD_SCHEMA', '发布日期与精度不一致');
    if (model.knowledgeCutoff !== null) datePrecision(model.knowledgeCutoff);
    for (const key of ['contextWindow', 'maxOutput']) number(model[key]);
    bool(model.openWeights); string(model.license, 500, true);
    object(model.capabilities, capKeys); for (const key of capKeys) bool(model.capabilities[key]);
    object(model.pricing, priceKeys); for (const key of priceKeys) number(model.pricing[key]);
    if (model.modalities !== null) modalities(model.modalities);
    return { ...model, pricing: { ...model.pricing, unit: 'USD / 1M tokens', note: pricingNote }, scores: worldBenchScores(model, benchRows) };
  });
  // AA 榜单收录、但目录里还没有的模型补一条只有名称和厂商的记录，保证综合实力榜不缺席。
  const { matched, missing } = matchWorldIndex(models, index, indexAsOf);
  for (const entry of missing) if (!ids.has(entry.id) && worldVendors.has(entry.vendorId)) {
    ids.add(entry.id);
    const placeholder = { id: entry.id, name: entry.name, vendorId: entry.vendorId };
    models.push({ ...placeholder, releaseDate: null, releaseDatePrecision: null, contextWindow: null, maxOutput: null, knowledgeCutoff: null, license: null, openWeights: null,
      capabilities: Object.fromEntries(capKeys.map(key => [key, null])), pricing: { ...Object.fromEntries(priceKeys.map(key => [key, null])), unit: 'USD / 1M tokens', note: pricingNote }, modalities: null, scores: worldBenchScores(placeholder, benchRows) });
  }
  const rated = rateWorldModels(models, matched);
  const sources = {
    'models.dev': { fetchedAt: input.generatedAt, note: `规范目录中名单内模型 ${input.models.length} 个`, ok: true },
    'epoch.ai': { fetchedAt: `${worldBenchAsOf}T00:00:00.000Z`, note: '随插件发布的第三方评测成绩', ok: true },
  };
  const vendors = modelWorldVendors.map(({ id, name, nameZh, homepage }) => ({ id, name, nameZh, homepage }));
  return contract.snapshot.parse({ generatedAt: input.generatedAt, sources, vendors, models: rated, leagues: rated.some(model => model.rating.overall !== null) ? worldLeagues : [], attributions: worldAttributionsFor(indexVersion) });
}

/** 在线更新得到的 AA 指数：与随包数据同样的行，保存在快照里，读取时逐项核对。 */
export function acceptWorldIndex(value) {
  object(value, ['asOf', 'version', 'rows']);
  if (datePrecision(value.asOf) !== 'day') fail('WORLD_SCHEMA', '综合实力数据日期无效');
  string(value.version, 40); array(value.rows, worldLimits.models);
  for (const row of value.rows) {
    if (!Array.isArray(row) || row.length !== 4) fail('WORLD_SCHEMA', '综合实力数据结构无效');
    const [vendorId, name, released, levels] = row;
    if (!worldVendors.has(vendorId)) fail('WORLD_SCHEMA', '综合实力数据厂商不在名单内');
    string(name, worldLimits.id);
    if (released !== null && datePrecision(released) !== 'day') fail('WORLD_SCHEMA', '综合实力数据发布日期无效');
    array(levels, worldLimits.efforts);
    if (!levels.length) fail('WORLD_SCHEMA', '综合实力数据缺少成绩');
    for (const level of levels) {
      if (!Array.isArray(level) || level.length !== 3 || !(level[0] === null || worldEffortIds.includes(level[0]))) fail('WORLD_SCHEMA', '综合实力思考强度无效');
      number(level[1], false); if (level[1] > 100) fail('WORLD_SCHEMA', '综合实力分数超出范围'); number(level[2]);
    }
  }
  return value;
}

/** 只保留图鉴收录的厂商及其模型并按名单排序；原始快照仍完整校验与保存，调整名单无需重新下载。 */
export function curateWorldSnapshot(snapshot, vendorIds) {
  if (!vendorIds) return snapshot;
  const order = new Map(vendorIds.map((id, index) => [id, index]));
  const models = snapshot.models.filter(model => order.has(model.vendorId));
  const counts = new Map();
  for (const model of models) counts.set(model.vendorId, (counts.get(model.vendorId) ?? 0) + 1);
  // 每家给出综合实力最高的型号，图鉴卡片据此展示“最强型号”。
  const top = new Map();
  for (const model of models) if (model.rating.overall !== null && (top.get(model.vendorId)?.overall ?? -1) < model.rating.overall) top.set(model.vendorId, { id: model.id, name: model.name, overall: model.rating.overall, tier: model.rating.tier });
  const vendors = snapshot.vendors.filter(vendor => order.has(vendor.id)).sort((a, b) => order.get(a.id) - order.get(b.id)).map(vendor => ({ ...vendor, modelCount: counts.get(vendor.id) ?? 0, top: top.get(vendor.id) ?? null }));
  return { ...snapshot, vendors, models };
}

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
async function abortableRead(read, signal) {
  signal.throwIfAborted();
  let cancel;
  const cancelled = new Promise((_, reject) => { cancel = () => reject(signal.reason); signal.addEventListener('abort', cancel, { once: true }); });
  try { return await Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return read(); }), cancelled]); }
  finally { signal.removeEventListener('abort', cancel); }
}

/** 只读取 models.dev 的两个固定公开文件；网络安全由宿主 HttpFetchProvider 持有。 */
export async function fetchWorldSnapshot(fetcher, signal) {
  async function get(url) {
    signal.throwIfAborted();
    const result = await abortableRead(() => fetcher.fetch({ url }, signal), signal);
    signal.throwIfAborted();
    if (result.statusCode !== 200 || result.truncated || result.body?.kind !== 'text' || Buffer.byteLength(result.body.content, 'utf8') > worldLimits.responseBytes) fail('WORLD_FETCH', 'models.dev 下载不完整或网络返回异常，保留原数据');
    if (result.url && result.url !== url) fail('WORLD_FETCH', 'models.dev 下载路径发生变化');
    return result.body.content;
  }
  const catalog = await get(worldCatalogUrl);
  const prices = await get(worldPriceUrl);
  return { raw: JSON.stringify(buildWorldCatalog(catalog, prices)) };
}

/** 一个 profile 只实例化一个 owner；快照文件不放进员工知识库或插件安装包。 */
export class ModelWorld {
  /**
   * indexKey：员工 AA Key 的存取（{ writable, describe, resolve, set, unset }），由宿主接到 DSH 凭据服务；没有时只能用随包数据。
   * indexFetch(url, key, signal)：带 Key 请求 AA，返回 { statusCode, content }。Key 只在这两处流转，不进快照和返回结果。
   */
  constructor({ root, fetcher, fileSystem = fs, vendorIds = null, reference = {}, indexKey = null, indexFetch = null }) {
    if (!path.isAbsolute(root)) fail('WORLD_PATH', '模型数据目录须为绝对路径');
    this.root = path.resolve(root); this.file = path.join(this.root, 'snapshot.json'); this.fs = fileSystem; this.fetcher = fetcher; this.vendorIds = vendorIds; this.reference = reference;
    this.indexKey = indexKey; this.indexFetch = indexFetch; this.keyState = indexKey ? 'none' : 'unavailable'; this.indexError = null;
    this.closing = new AbortController(); this.current = null; this.refreshing = null; this.lastRefresh = null;
  }
  bundledIndex() { return { source: 'bundled', asOf: this.reference.indexAsOf ?? worldIndexAsOf, version: this.reference.indexVersion ?? worldIndexVersion }; }
  /** 在线数据比随包数据新才用它；插件升级带来更新的随包数据时，旧的在线数据自动让位。 */
  referenceFor(online) {
    const bundled = this.bundledIndex();
    if (!online || online.asOf < bundled.asOf) return { reference: this.reference, info: bundled };
    return { reference: { ...this.reference, index: worldIndexFrom(online.rows), indexAsOf: online.asOf, indexVersion: online.version }, info: { source: 'online', asOf: online.asOf, version: online.version } };
  }
  async syncKey() {
    if (!this.indexKey) { this.keyState = 'unavailable'; return; }
    const described = await this.indexKey.describe();
    this.keyState = !described ? 'unavailable' : !described.configured ? 'none' : described.source === 'file' ? 'saved' : 'env';
  }
  /** 有 Key 才联网取 AA；失败不影响模型目录更新，沿用上次的在线数据并记下原因。 */
  async fetchIndex(signal) {
    const key = this.indexKey && this.indexFetch ? await this.indexKey.resolve() : undefined;
    if (!key) return { index: null, error: null };
    try {
      const result = await fetchAaIndex(url => abortableRead(() => this.indexFetch(url, key, signal), signal));
      return { index: acceptWorldIndex({ asOf: new Date().toISOString().slice(0, 10), version: result.version.slice(0, 40), rows: result.rows }), error: null };
    } catch (error) {
      if (signal.aborted) throw error;
      return { index: this.current?.index ?? null, error: String(error.message).slice(0, worldLimits.error) };
    }
  }
  async safePath(file, directory = false) {
    try { const stat = await this.fs.lstat(file); if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) fail('WORLD_PATH', '模型快照路径类型不安全'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async prepareRoot() {
    // 向上核对已有父目录，避免通过联接或符号链接写入其他 owner。
    for (let cursor = this.root; ; cursor = path.dirname(cursor)) { await this.safePath(cursor, true); if (path.dirname(cursor) === cursor) break; }
    await this.fs.mkdir(this.root, { recursive: true }); await this.safePath(this.root, true); await this.safePath(this.file);
  }
  decode(text) {
    let stored;
    try { stored = JSON.parse(text); } catch { fail('WORLD_STORAGE', '本地模型快照损坏，可手动刷新恢复'); }
    // 改用 models.dev 之前保存的快照格式不同，提示重新获取而不是报损坏。
    if (plain(stored) && Object.hasOwn(stored, 'commit') && Object.hasOwn(stored, 'blob')) fail('WORLD_SOURCE_CHANGED', '模型数据来源已改为 models.dev，点「更新数据」重新获取');
    object(stored, ['source', 'acceptedAt', 'raw', 'sha256', 'index'], ['source', 'acceptedAt', 'raw', 'sha256']);
    if (stored.source !== 'models.dev' || typeof stored.raw !== 'string' || hash(stored.raw) !== stored.sha256) fail('WORLD_STORAGE', '本地模型快照内容校验失败');
    timestamp(stored.acceptedAt);
    if (stored.index !== undefined) acceptWorldIndex(stored.index);
    const { reference, info } = this.referenceFor(stored.index);
    return { ...stored, indexInfo: info, snapshot: curateWorldSnapshot(acceptWorldSnapshot(stored.raw, reference), this.vendorIds) };
  }
  async readFile() {
    await this.safePath(this.file);
    const stat = await this.fs.stat(this.file);
    if (stat.size > worldLimits.responseBytes) fail('WORLD_SCALE', '本地快照文件超过上限');
    const bytes = await this.fs.readFile(this.file);
    if (bytes.length > worldLimits.responseBytes) fail('WORLD_SCALE', '本地快照文件超过上限');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('WORLD_STORAGE', '本地模型快照编码损坏'); }
  }
  async load() {
    return this.loaded ??= (async () => {
      try { await this.prepareRoot(); this.current = this.decode(await this.readFile()); }
      catch (error) { if (error.code !== 'ENOENT') this.lastRefresh = { status: 'error', code: error.code ?? 'WORLD_STORAGE', message: String(error.message).slice(0, worldLimits.error) }; }
    })();
  }
  status() {
    return structuredClone({
      available: !!this.current, refreshing: !!this.refreshing,
      acceptedAt: this.current?.acceptedAt ?? null, generatedAt: this.current?.snapshot.generatedAt ?? null,
      sources: this.current?.snapshot.sources ?? {}, modelCount: this.current?.snapshot.models.length ?? 0,
      vendors: this.current?.snapshot.vendors ?? [], leagues: this.current?.snapshot.leagues ?? [],
      lastRefresh: this.lastRefresh, attributions: this.current?.snapshot.attributions ?? worldAttributions,
      index: { ...(this.current?.indexInfo ?? this.bundledIndex()), key: this.keyState, error: this.indexError },
    });
  }
  async persist(candidate, signal) {
    await this.prepareRoot(); signal.throwIfAborted();
    // 网络在锁外；同 profile 的整个提交/恢复闭包互斥，争用直接失败而不后台排队。
    return withFileLock(this.file, async () => {
      signal.throwIfAborted();
      const text = JSON.stringify(candidate), temporary = path.join(this.root, `.snapshot-${randomUUID()}.tmp`);
      let previous = null, replaced = false;
      try {
        try { previous = await this.readFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await this.fs.writeFile(temporary, text, { flag: 'wx', encoding: 'utf8', mode: 0o600, flush: true });
        this.decode(await this.fs.readFile(temporary, 'utf8')); signal.throwIfAborted();
        await this.safePath(this.file); await this.fs.rename(temporary, this.file); replaced = true;
        // 原子替换后不再响应取消：必须确定持久 readback 或恢复旧文件，不能把已接受伪装成取消。
        const readback = await this.readFile(); if (readback !== text) fail('WORLD_READBACK', '模型快照写后读回不一致');
        return this.decode(readback);
      } catch (error) {
        if (replaced) {
          try {
            if (previous === null) await this.fs.unlink(this.file);
            else { await this.fs.writeFile(temporary, previous, { flag: 'wx', encoding: 'utf8', mode: 0o600, flush: true }); await this.fs.rename(temporary, this.file); if (await this.readFile() !== previous) throw new Error('恢复读回失败'); }
          } catch { fail('WORLD_STORAGE_UNKNOWN', '快照提交后的恢复结果未确认；保留内存旧数据，请修复本地目录后重新加载核对'); }
        }
        throw error;
      } finally { await this.fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    }, { waitMs: 0 });
  }
  async refresh(signal) {
    if (this.refreshing) fail('WORLD_BUSY', '模型快照正在刷新，请等待结果');
    const operation = (async () => {
      try {
        const downloaded = await fetchWorldSnapshot(this.fetcher, signal);
        const { index, error: indexError } = await this.fetchIndex(signal);
        acceptWorldSnapshot(downloaded.raw, this.referenceFor(index).reference); signal.throwIfAborted();
        const candidate = { source: 'models.dev', acceptedAt: new Date().toISOString(), raw: downloaded.raw, sha256: hash(downloaded.raw), ...(index ? { index } : {}) };
        this.current = await this.persist(candidate, signal);
        this.indexError = indexError;
        this.lastRefresh = { status: 'ok', at: candidate.acceptedAt };
      } catch (error) {
        // 只有取消自身的拒绝才算取消；同时到达的取消不能覆盖提交/readback/恢复结果。
        const cancelled = signal.aborted && error === signal.reason;
        this.lastRefresh = { status: cancelled ? 'cancelled' : 'error', code: error.code ?? 'WORLD_FETCH', message: cancelled ? '刷新已取消，保留原数据' : String(error.message).slice(0, worldLimits.error) };
        throw error;
      }
    })();
    this.refreshing = operation;
    try { await operation; } finally { this.refreshing = null; }
    return this.status();
  }
  async execute(input, callerSignal) {
    const parsed = contract.input.parse(input);
    return contract.result.parse({ action: parsed.action, ...await this.dispatch(parsed, callerSignal) });
  }
  async dispatch(input, callerSignal) {
    const signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(worldLimits.operationMs), ...(callerSignal ? [callerSignal] : [])]);
    signal.throwIfAborted(); await this.load(); await this.syncKey(); signal.throwIfAborted();
    if (input.action === 'refresh') return this.refresh(signal);
    if (input.action === 'setIndexKey' || input.action === 'clearIndexKey') {
      if (!this.indexKey?.writable) fail('WORLD_KEY_UNAVAILABLE', '当前 DSH 没有凭据服务，无法在这里保存 Key');
      if (input.action === 'setIndexKey') await this.indexKey.set(input.key); else await this.indexKey.unset();
      this.indexError = null; await this.syncKey();
      return this.status();
    }
    if (input.action === 'status') return this.status();
    if (!this.current) {
      if (input.action === 'detail') return { ...this.status(), model: null, vendor: null };
      if (input.action === 'compare') return { ...this.status(), models: [] };
      if (input.action === 'value') return { ...this.status(), bands: [], plans: [] };
      return { ...this.status(), models: [], total: 0, offset: input.offset ?? 0, limit: input.limit ?? worldLimits.defaultPage, unknownDates: 0 };
    }
    const snapshot = this.current.snapshot;
    if (input.action === 'detail') {
      const model = snapshot.models.find(item => item.id === input.id);
      if (!model) fail('WORLD_NOT_FOUND', '模型不在当前已接受快照中');
      return structuredClone({ model, vendor: snapshot.vendors.find(vendor => vendor.id === model.vendorId), ...this.status() });
    }
    if (input.action === 'compare') {
      if (new Set(input.ids).size !== input.ids.length) fail('WORLD_INPUT', '请选择 2 至 4 个不同模型');
      const models = input.ids.map(id => snapshot.models.find(model => model.id === id));
      if (models.some(model => !model)) fail('WORLD_NOT_FOUND', '比较模型不在当前快照中');
      return structuredClone({ models, ...this.status() });
    }
    const query = (input.query ?? '').trim().toLocaleLowerCase();
    const vendorMatches = new Set(snapshot.vendors.filter(vendor => `${vendor.name} ${vendor.nameZh} ${vendor.id}`.toLocaleLowerCase().includes(query)).map(vendor => vendor.id));
    const matches = model => (!input.vendorId || model.vendorId === input.vendorId) && (!query || `${model.name} ${model.id}`.toLocaleLowerCase().includes(query) || vendorMatches.has(model.vendorId));
    if (input.action === 'value') {
      const entries = snapshot.models.filter(model => model.efforts.length && matches(model)).map(model => ({ id: model.id, name: model.name, vendorId: model.vendorId, efforts: model.efforts }));
      return structuredClone({ ...this.status(), ...worldValuePlans(entries) });
    }
    if (!['list', 'timeline', 'ranking'].includes(input.action)) fail('WORLD_INPUT', '未知模型浏览操作');
    let models = snapshot.models.filter(model => matches(model) && (!input.capability || model.capabilities[input.capability] === true));
    let unknownDates = 0;
    if (input.action === 'timeline') { unknownDates = models.filter(model => !model.releaseDate).length; models = models.filter(model => model.releaseDate).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.id.localeCompare(b.id)); }
    else if (input.action === 'ranking') {
      const metric = model => model.rating[input.league];
      models = models.filter(model => metric(model) !== null);
      models.sort((a, b) => (input.direction === 'asc' ? 1 : -1) * (metric(a) - metric(b)) || (b.rating.overall ?? 0) - (a.rating.overall ?? 0) || a.id.localeCompare(b.id));
    } else models.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const offset = input.offset ?? 0, limit = input.limit ?? worldLimits.defaultPage;
    return structuredClone({ ...this.status(), models: models.slice(offset, offset + limit), total: models.length, offset, limit, unknownDates });
  }
  async dispose() { this.closing.abort(new Error('模型世界服务已关闭')); if (this.refreshing) await this.refreshing.catch(() => {}); }
}
