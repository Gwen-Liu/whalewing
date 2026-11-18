import { worldNameKey } from './model-world-index.js';
import { isDomesticVendor, worldCnyPrice } from './model-world-cny-prices.js';
import { isImageEntry } from './image-models.js';

/**
 * 我的模型：把员工在 DSH 里配好的模型对上模型世界的型号，按天按模型记用量，按官网价估算花费，给出“可以试试”。
 * 全是纯函数：Host 用它记账和对型号，界面用它算花费和提示。
 */

/** 渠道的接口地址属于哪一家：对上了算官方渠道，对不上的是转发站，本机地址是本机模型。 */
const officialHosts = Object.freeze({
  'api.deepseek.com': 'deepseek', 'api.openai.com': 'openai', 'api.anthropic.com': 'anthropic', 'generativelanguage.googleapis.com': 'google',
  'api.moonshot.cn': 'moonshotai', 'api.moonshot.ai': 'moonshotai', 'api.kimi.com': 'moonshotai', 'open.bigmodel.cn': 'zhipuai', 'api.z.ai': 'zhipuai',
  'dashscope.aliyuncs.com': 'alibaba', 'dashscope-intl.aliyuncs.com': 'alibaba', 'ark.cn-beijing.volces.com': 'bytedance-seed',
  'api.minimax.io': 'minimax', 'api.minimaxi.com': 'minimax', 'api.minimax.chat': 'minimax', 'tokenhub.tencentmaas.com': 'tencent', 'api.hunyuan.cloud.tencent.com': 'tencent',
  'qianfan.baidubce.com': 'baidu', 'api.xiaomimimo.com': 'xiaomi', 'api.longcat.chat': 'meituan', 'api.stepfun.com': 'stepfun',
  'api.x.ai': 'xai', 'api.meta.ai': 'meta', 'api.llama.com': 'meta', 'api.mistral.ai': 'mistral', 'api.perplexity.ai': 'perplexity',
});
// DSH 自带的 DeepSeek 渠道不填地址也是官方。
const officialProviders = Object.freeze({ 'deepseek-account': 'deepseek', 'deepseek-official': 'deepseek' });

/** 渠道类型：{ kind: 'official' | 'relay' | 'local' | 'unknown', host }。只看地址的主机名，不带路径和 Key。 */
export function channelOf(providerId, baseUrl) {
  if (Object.hasOwn(officialProviders, providerId)) return { kind: 'official', host: null };
  let host = null;
  try { host = baseUrl ? new URL(baseUrl).hostname.toLowerCase() : null; } catch { host = null; }
  if (!host) return { kind: 'unknown', host: null };
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host)) return { kind: 'local', host };
  return { kind: Object.hasOwn(officialHosts, host) ? 'official' : 'relay', host };
}

const tokensOf = key => key.split('-').filter(Boolean);
// 转发站常在型号后面加的尾巴，不算型号本身。
const trimKey = key => key.replace(/-(latest|free|official|thinking|think|nothink|online)$/g, '').replace(/-20\d{2}-?\d{2}-?\d{2}$/, '');

/**
 * 把 DSH 里的一个型号（id 和显示名）对到模型世界的型号。
 * 先按归一后的名字精确对；对不上时把它当成别名或简写：模型世界里包含它全部词的型号中，
 * 不带版本数字的别名（如 deepseek-flash）取最新发布的，带数字的取多出来的词最少的。
 * 返回 { id, exact }；对不上返回 null，界面上让员工手动对应。
 */
export function matchWorldModel(entry, models) {
  const keys = [...new Set([entry.id, entry.name].filter(value => typeof value === 'string' && value).map(value => trimKey(worldNameKey(value))))].filter(Boolean);
  if (!keys.length) return null;
  const indexed = models.map(model => ({ model, keys: [worldNameKey(model.id), worldNameKey(model.name)] }));
  for (const key of keys) { const hit = indexed.find(item => item.keys.includes(key)); if (hit) return { id: hit.model.id, exact: true }; }
  const wanted = tokensOf(keys[0]);
  if (wanted.length < 2) return null;
  const candidates = indexed.map(item => ({ model: item.model, tokens: tokensOf(item.keys[0]) })).filter(item => wanted.every(token => item.tokens.includes(token)));
  if (!candidates.length) return null;
  const alias = !wanted.some(token => /\d/.test(token)), date = item => item.model.releaseDate ?? '';
  candidates.sort((a, b) => (alias ? 0 : a.tokens.length - b.tokens.length) || date(b).localeCompare(date(a)) || a.model.id.localeCompare(b.model.id));
  return { id: candidates[0].model.id, exact: false };
}

/** 一个型号的官网价（每百万 tokens）：国产用人民币官网价，海外用目录美元价；没有价格返回 null。 */
export function worldPriceOf(model) {
  if (!model) return null;
  if (isDomesticVendor(model.vendorId)) {
    const entry = worldCnyPrice(model.id);
    return entry && typeof entry.inputPerMTok === 'number' && typeof entry.outputPerMTok === 'number' ? { currency: 'CNY', input: entry.inputPerMTok, cached: entry.cachedInputPerMTok ?? null, output: entry.outputPerMTok } : null;
  }
  const pricing = model.pricing;
  return pricing && typeof pricing.inputPerMTok === 'number' && typeof pricing.outputPerMTok === 'number' ? { currency: 'USD', input: pricing.inputPerMTok, cached: pricing.cachedInputPerMTok ?? null, output: pricing.outputPerMTok } : null;
}

export const emptyUsage = () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 0 });
const amount = value => Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
/** 把一次调用的用量规整成账本里的格子；inputTokens 不含缓存命中的部分。 */
export const usageOf = (usage, calls = 1) => ({ inputTokens: amount(usage?.inputTokens ?? usage?.uncachedInputTokens), outputTokens: amount(usage?.outputTokens), cacheReadTokens: amount(usage?.cacheReadTokens), cacheWriteTokens: amount(usage?.cacheWriteTokens), calls });
export const usageTokens = usage => usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
export function addUsage(target, usage) { for (const key of Object.keys(emptyUsage())) target[key] += usage[key] ?? 0; return target; }

/** 按官网价估算花费：缓存命中按缓存价（没有缓存价按输入价），写缓存按输入价。 */
export function usageCost(model, usage) {
  const price = worldPriceOf(model);
  if (!price) return null;
  return { currency: price.currency, amount: (usage.inputTokens * price.input + usage.cacheWriteTokens * price.input + usage.cacheReadTokens * (price.cached ?? price.input) + usage.outputTokens * price.output) / 1e6 };
}

/** 日期一律按北京时间。 */
export const dayOf = time => new Date(time + 8 * 3600e3).toISOString().slice(0, 10);
export const dayShift = (day, offset) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * 864e5).toISOString().slice(0, 10);

/** 账本：days[日期][渠道][型号] = 用量。 */
export function foldUsage(ledger, day, provider, model, usage) {
  const cell = ((ledger.days[day] ??= {})[provider] ??= {})[model] ??= emptyUsage();
  addUsage(cell, usage);
  return ledger;
}
/** 只留最近 keep 天。 */
export function pruneLedger(ledger, today, keep = 400) {
  const floor = dayShift(today, -keep);
  for (const day of Object.keys(ledger.days)) if (day < floor) delete ledger.days[day];
  return ledger;
}
/** 取 [from, to] 这段日子：每天的总量，和每个“渠道 + 型号”的合计。 */
export function usageWindow(ledger, from, to) {
  const days = [], rows = new Map();
  for (let day = from; day <= to; day = dayShift(day, 1)) {
    const total = emptyUsage();
    for (const [provider, models] of Object.entries(ledger.days[day] ?? {})) for (const [model, usage] of Object.entries(models)) {
      addUsage(total, usage);
      const key = `${provider}\n${model}`;
      addUsage(rows.get(key) ?? rows.set(key, { provider, model, ...emptyUsage() }).get(key), usage);
    }
    days.push({ day, ...total });
  }
  return { days, rows: [...rows.values()].sort((a, b) => usageTokens(b) - usageTokens(a)) };
}

/**
 * “可以试试”：只看员工已经配好、且对上了型号的模型（items：{ provider, model, world }）。
 * - pricier：同一家里有另一个配好的型号不比它弱、输出价不到它的六成。
 * - newer：这一家 60 天内出了新型号，员工还没配。
 * - effort：这个型号开低一档思考，成绩还有最强档的 97% 以上、消耗不到六成。
 */
export function mineAdvice(items, models, today) {
  const tips = [], mine = items.filter(item => item.world), owned = new Set(mine.map(item => item.world.id));
  for (const item of mine) {
    const price = worldPriceOf(item.world), score = item.world.rating?.overall;
    if (!price || typeof score !== 'number') continue;
    const better = mine.filter(other => other !== item && other.world.vendorId === item.world.vendorId && other.world.id !== item.world.id && typeof other.world.rating?.overall === 'number' && other.world.rating.overall >= score)
      .map(other => ({ other, price: worldPriceOf(other.world) })).filter(entry => entry.price && entry.price.currency === price.currency && entry.price.output <= price.output * .6)
      .sort((a, b) => b.other.world.rating.overall - a.other.world.rating.overall)[0];
    if (better) tips.push({ kind: 'pricier', id: `pricier:${item.world.id}`, model: item.world.id, instead: better.other.world.id, times: Math.round(price.output / Math.max(better.price.output, 1e-9) * 10) / 10 });
  }
  const floor = dayShift(today, -60);
  for (const vendorId of new Set(mine.map(item => item.world.vendorId))) {
    const fresh = models.filter(model => model.vendorId === vendorId && model.releaseDatePrecision === 'day' && model.releaseDate >= floor && !owned.has(model.id) && (model.modalities?.output ?? ['text']).includes('text'))
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))[0];
    if (fresh) tips.push({ kind: 'newer', id: `newer:${fresh.id}`, model: fresh.id, vendorId });
  }
  for (const item of mine) {
    const efforts = item.world.efforts ?? [], top = efforts.reduce((best, entry) => !best || entry.index > best.index ? entry : best, null);
    if (!top || typeof top.cost !== 'number' || efforts.length < 2) continue;
    const lighter = efforts.filter(entry => entry !== top && typeof entry.cost === 'number' && entry.index >= top.index * .97 && entry.cost <= top.cost * .6).sort((a, b) => a.cost - b.cost)[0];
    if (lighter) tips.push({ kind: 'effort', id: `effort:${item.world.id}`, model: item.world.id, effort: lighter.effort, top: top.effort, index: lighter.index, topIndex: top.index, saving: Math.round((1 - lighter.cost / top.cost) * 100) });
  }
  return tips;
}

/**
 * 把 DSH 的模型目录摊平成一项一个型号，并对上模型世界的型号：员工手动对应的优先，其次按名字对。
 * 每项：{ key, provider, providerName, kind, host, model, name, efforts, defaultEffort, world, mapped, exact, image, isDefault }。
 * image 为真的是生图模型：不对型号、不能开对话、不进测智和对决，专家和小鲸要图时用它。
 */
export function mineItems(mine, models) {
  const byId = new Map(models.map(model => [model.id, model])), items = [];
  for (const group of mine?.groups ?? []) for (const model of group.models) {
    const key = `${group.id}\n${model.id}`, image = isImageEntry(model);
    // 生图模型不对模型世界的型号：模型世界只收对话模型，硬对会对到同名的对话模型上。
    const mapped = image ? null : byId.get(mine.mapping?.[key]) ?? null, guess = mapped || image ? null : matchWorldModel(model, models);
    items.push({
      key, provider: group.id, providerName: group.name, kind: group.kind, host: group.host, model: model.id, name: model.name, efforts: model.efforts, defaultEffort: model.defaultEffort,
      world: mapped ?? (guess ? byId.get(guess.id) ?? null : null), mapped: Boolean(mapped), exact: mapped ? true : guess?.exact ?? false, image,
      isDefault: mine.defaultModel?.provider === group.id && mine.defaultModel?.model === model.id,
    });
  }
  return items;
}
/** 账本里记过的“渠道 + 型号”对到模型世界：先看员工配好的那一项，配置已经删掉的按名字再对一次。 */
export function usedWorld(row, items, models) {
  const item = items.find(entry => entry.provider === row.provider && entry.model === row.model);
  if (item) return item.world;
  if (isImageEntry({ id: row.model })) return null;
  const guess = matchWorldModel({ id: row.model, name: row.model }, models);
  return guess ? models.find(model => model.id === guess.id) ?? null : null;
}
