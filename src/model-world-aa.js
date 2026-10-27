import { modelWorldVendorIds } from './model-world-roster.js';

/**
 * Artificial Analysis 免费接口：开发者脚本生成随包数据，员工填了自己的 Key 后「更新数据」也用它在线更新综合实力。
 * Key 只放在 x-api-key 请求头里发给 AA，不写进快照、日志或返回结果。免费版每天 100 次请求，一次更新约 4 次。
 */
export const aaEndpoint = 'https://artificialanalysis.ai/api/v2/language/models/free';
export const aaMaxPages = 20;
/** 员工自己申请 Key 的入口：注册账号后在 Insights Platform 里生成。 */
export const aaLinks = Object.freeze({ signup: 'https://artificialanalysis.ai/login', docs: 'https://artificialanalysis.ai/api-reference#free-api' });

/** AA 的厂商名 → 模型世界的厂商 id；名单外的厂商不收录。 */
export const aaCreators = Object.freeze({
  Anthropic: 'anthropic', OpenAI: 'openai', Google: 'google', DeepSeek: 'deepseek', Alibaba: 'alibaba', Kimi: 'moonshotai', 'Z AI': 'zhipuai',
  'ByteDance Seed': 'bytedance-seed', MiniMax: 'minimax', Tencent: 'tencent', Baidu: 'baidu', Xiaomi: 'xiaomi', LongCat: 'meituan', StepFun: 'stepfun',
  SpaceXAI: 'xai', xAI: 'xai', Meta: 'meta', Mistral: 'mistral', Perplexity: 'perplexity',
});
const efforts = { max: 'max', xhigh: 'xhigh', high: 'high', medium: 'medium', low: 'low', minimal: 'minimal', reasoning: null, 'non-reasoning': 'none' };

/** 拆出名称末尾括号里的思考强度：“Claude Opus 5.5 (Max, Default Fallback)” → 名称 + max；括号里不是强度（如 0902、Preview）则保留在名称里。 */
export function parseAaName(name) {
  const match = name.match(/^(.*\S)\s*\(([^)]*)\)\s*$/);
  if (!match) return { name, effort: null };
  const first = match[2].split(',')[0].trim().toLowerCase();
  return Object.hasOwn(efforts, first) ? { name: match[1], effort: efforts[first] } : { name, effort: null };
}

const order = ['max', 'xhigh', 'high', 'medium', 'low', 'minimal', null, 'none'];
const roster = new Set(modelWorldVendorIds);

/** 把 AA 的模型行按“厂商 + 名称”合并成一个模型的多档成绩；没有智能指数的行不收。 */
export function groupAaModels(rows) {
  const groups = new Map();
  for (const row of rows) {
    const vendorId = aaCreators[row?.model_creator?.name];
    const index = row?.evaluations?.artificial_analysis_intelligence_index;
    if (!vendorId || !roster.has(vendorId) || typeof index !== 'number' || !Number.isFinite(index) || typeof row.name !== 'string' || !row.name) continue;
    const { name, effort } = parseAaName(row.name);
    const released = typeof row.release_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.release_date) ? row.release_date : null;
    const key = `${vendorId}|${name}`;
    if (!groups.has(key)) groups.set(key, { vendorId, name, released, levels: new Map() });
    const group = groups.get(key);
    const cost = row.artificial_analysis_intelligence_index_cost?.cost_per_task?.total_cost;
    // 同一档出现多次时保留分数更高的一条。
    if (!group.levels.has(effort) || group.levels.get(effort)[1] < index) group.levels.set(effort, [effort, Math.round(index * 10) / 10, typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 10000) / 10000 : null]);
    if (released && (!group.released || released > group.released)) group.released = released;
  }
  return [...groups.values()].map(group => ({ ...group, levels: [...group.levels.values()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])) }))
    .sort((a, b) => Math.max(...b.levels.map(level => level[1])) - Math.max(...a.levels.map(level => level[1])) || a.name.localeCompare(b.name));
}

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

/**
 * 逐页读取 AA 免费接口并整理成随包数据同样的行：[厂商 id, 名称, 发布日期, [[思考强度, 智能指数, 单次任务美元成本], ...]]。
 * getPage(url) 负责带 Key 发请求，返回 { statusCode, content }；这里只认状态码和 JSON 结构。
 */
export async function fetchAaIndex(getPage) {
  const rows = [];
  let version = null;
  for (let page = 1; page <= aaMaxPages; page++) {
    const { statusCode, content } = await getPage(`${aaEndpoint}?page=${page}`);
    if (statusCode === 401 || statusCode === 403) fail('AA_KEY_INVALID', 'Artificial Analysis 拒绝了这个 API Key，请检查后重新填写');
    if (statusCode === 429) fail('AA_RATE_LIMIT', 'Artificial Analysis 今天的免费额度已用完，明天再更新');
    if (statusCode !== 200) fail('AA_FETCH', `Artificial Analysis 返回 ${statusCode}，请稍后重试`);
    let body;
    try { body = JSON.parse(content); } catch { fail('AA_FETCH', 'Artificial Analysis 返回的数据不完整'); }
    if (!body || !Array.isArray(body.data) || (body.intelligence_index_version !== undefined && !['string', 'number'].includes(typeof body.intelligence_index_version))) fail('AA_FETCH', 'Artificial Analysis 接口格式发生变化');
    version = body.intelligence_index_version === undefined ? version : String(body.intelligence_index_version);
    rows.push(...body.data);
    if (!body.pagination?.has_more) break;
  }
  const groups = groupAaModels(rows);
  if (!groups.length) fail('AA_FETCH', 'Artificial Analysis 没有返回名单内厂商的智能指数');
  return { version: version ?? '未知', count: rows.length, rows: groups.map(group => [group.vendorId, group.name, group.released, group.levels]) };
}
