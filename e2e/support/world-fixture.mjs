// 模型世界的固定测试数据：用插件自己的 ModelWorld 把一份合成的 models.dev 目录“更新”进临时 profile，
// 和员工点“更新数据”走同一条整理、校验、落盘的路；不联网。
import path from 'node:path';
import { ModelWorld, worldCatalogUrl } from '../../features/model-world/model-world.js';
import { modelWorldVendorIds } from '../../src/model-world-roster.js';

/**
 * 合成数据里的厂商和型号：[厂商 id, 型号 id, 名称, 发布日期, 输入价, 输出价]（美元 / 百万 tokens）。
 * - DeepSeek V4 Flash 用来测系列形象（小肥鱼），它的 id 在人民币价目表里，应显示官网人民币价；
 * - DeepSeek V4 是国产但不在价目表里，应不显示价格，不拿这里的美元价换算；
 * - Kimi E2E 只有年月，用来测发布日期不被补成具体日期。
 */
export const worldModels = Object.freeze([
  ['openai', 'gpt-e2e', 'GPT E2E', '2026-09-20', 1.25, 10],
  ['anthropic', 'claude-e2e', 'Claude E2E', '2026-09-18', 3, 15],
  ['google', 'gemini-e2e', 'Gemini E2E', '2026-09-15', 1.25, 10],
  ['deepseek', 'deepseek-v4', 'DeepSeek V4', '2026-09-10', 0.27, 1.1],
  ['deepseek', 'deepseek-v4-flash', 'DeepSeek V4 Flash', '2026-09-12', 0.07, 0.28],
  ['alibaba', 'qwen-e2e', 'Qwen E2E', '2026-08-30', 0.4, 1.2],
  ['moonshotai', 'kimi-e2e', 'Kimi E2E', '2026-08', 0.6, 2.5],
]);

function upstream() {
  const catalog = {}, prices = {};
  for (const [vendor, model, name, released, input, output] of worldModels) {
    const id = `${vendor}/${model}`;
    catalog[id] = { id, name, family: 'e2e', attachment: false, reasoning: true, tool_call: true, structured_output: true, temperature: true, knowledge: '2026-06', release_date: released, last_updated: released, modalities: { input: ['text'], output: ['text'] }, open_weights: false, limit: { context: 128000, output: 8192 } };
    (prices[vendor] ??= { id: vendor, models: {} }).models[model] = { id: model, canonical_model_id: id, cost: { input, output, cache_read: input / 10 } };
  }
  return { catalog, prices };
}

/** 写进 <home>/profiles/<profile>/cache/whalewing-model-world/snapshot.json，位置和插件运行时一致。 */
export async function seedModelWorld(home, profile = 'e2e') {
  const data = upstream();
  const fetcher = { async fetch({ url }) { return { url, statusCode: 200, body: { kind: 'text', content: JSON.stringify(url === worldCatalogUrl ? data.catalog : data.prices) }, truncated: false }; } };
  const world = new ModelWorld({ root: path.join(home, 'profiles', profile, 'cache', 'whalewing-model-world'), fetcher, vendorIds: modelWorldVendorIds });
  try {
    const result = await world.execute({ action: 'refresh' }, AbortSignal.timeout(30_000));
    // 型号总数还包括随插件发布的榜单补进来的型号，这里只确认合成的几个都在。
    if (!result.available || result.modelCount < worldModels.length) throw new Error(`模型世界测试数据没有写进去：${JSON.stringify(result.lastRefresh)}`);
  } finally { world.dispose(); }
}
