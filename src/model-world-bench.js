import { worldBenchAsOf, worldBenchRows } from './model-world-bench-data.js';
import { worldNameKey } from './model-world-index.js';
import { worldBenchmarks } from '../features/model-world/contract.js';

/**
 * Epoch AI 的第三方评测成绩：数据由 scripts/update-model-bench.mjs 从 Epoch 公开数据包生成，按“厂商 + 名称归一”收录。
 * 推理与知识、编程、智能体三个分项由这些成绩换算百分位得出。
 */
export { worldBenchAsOf, worldBenchRows };
export const worldBenchSource = Object.freeze({ name: 'Epoch AI · Benchmarking Hub', url: 'https://epoch.ai/benchmarks', license: 'CC BY 4.0', licenseUrl: 'https://epoch.ai/benchmarks/use-this-data' });

/** 按模型 id 与名称归一后在同厂商里查成绩；两处都命中时合并，同一评测取较高分。 */
export function worldBenchScores(model, rows = worldBenchRows) {
  const table = rows === worldBenchRows ? defaultTable : tableOf(rows);
  const values = {};
  for (const key of new Set([worldNameKey(model.id), worldNameKey(model.name)])) {
    for (const [league, score] of Object.entries(table.get(`${model.vendorId}|${key}`) ?? {})) if (!(league in values) || values[league] < score) values[league] = score;
  }
  return Object.entries(values).filter(([league]) => Object.hasOwn(worldBenchmarks, league)).sort(([a], [b]) => a.localeCompare(b))
    .map(([league, score]) => ({ league, score, source: 'epoch.ai', sourceUrl: worldBenchSource.url, attribution: 'third-party', unit: worldBenchmarks[league].unit }));
}
function tableOf(rows) { return new Map(rows.map(([vendorId, key, values]) => [`${vendorId}|${key}`, values])); }
const defaultTable = tableOf(worldBenchRows);
