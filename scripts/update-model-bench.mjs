import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { modelWorldVendorIds } from '../src/model-world-roster.js';
import { worldNameKey } from '../src/model-world-index.js';

/**
 * 从 Epoch AI Benchmarking Hub 的公开数据包生成分项评测成绩 src/model-world-bench-data.js。
 * 用法：node scripts/update-model-bench.mjs。数据依 CC BY 4.0 授权，展示时注明 Epoch AI。
 */
const endpoint = 'https://epoch.ai/data/benchmark_data.zip';
const target = fileURLToPath(new URL('../src/model-world-bench-data.js', import.meta.url));

/** Epoch 的机构名 → 模型世界的厂商 id；名单外的机构不收录。 */
export const epochOrganizations = Object.freeze({
  OpenAI: 'openai', Anthropic: 'anthropic', 'Google DeepMind': 'google', Google: 'google', DeepMind: 'google', DeepSeek: 'deepseek', Alibaba: 'alibaba',
  Moonshot: 'moonshotai', 'Z.ai (Zhipu AI)': 'zhipuai', ByteDance: 'bytedance-seed', MiniMax: 'minimax', Tencent: 'tencent', Baidu: 'baidu',
  'Xiaomi Corp': 'xiaomi', Meituan: 'meituan', StepFun: 'stepfun', xAI: 'xai', 'Meta AI': 'meta', 'Mistral AI': 'mistral', Perplexity: 'perplexity',
});

/** 每个评测取哪个文件的哪一列；scale 把 0–1 的比例换成百分数，单位见 contract.js 的 worldBenchmarks。 */
export const epochLeagues = Object.freeze({
  eci: { file: 'epoch_capabilities_index/eci_scores.csv', column: 'eci', scale: 1 },
  gpqa_diamond: { file: 'gpqa_diamond.csv', column: 'Best score (across scorers)', scale: 100 },
  hle: { file: 'hle_external.csv', column: 'Accuracy', scale: 100 },
  arc_agi_2: { file: 'arc_agi_2_external.csv', column: 'Score', scale: 100 },
  frontiermath: { file: 'frontiermath_tiers_1_3_v2.csv', column: 'Best score (across scorers)', scale: 100 },
  aime: { file: 'otis_mock_aime_2024_2025.csv', column: 'Best score (across scorers)', scale: 100 },
  simplebench: { file: 'simplebench_external.csv', column: 'Score (AVG@5)', scale: 100 },
  swe_bench_verified: { file: 'swe_bench_verified.csv', column: 'Best score (across scorers)', scale: 100 },
  terminal_bench_2_0: { file: 'terminalbench_external.csv', column: 'Accuracy mean', scale: 100, accept: row => row.Source.includes('terminal-bench/2.0') },
  webdev_arena_elo: { file: 'webdev_arena_external.csv', column: 'Arena Score', scale: 1 },
  metr_time_horizons: { file: 'metr_time_horizons_external.csv', column: 'Time horizon', scale: 1 },
  gdpval: { file: 'gdpval_external.csv', column: 'Win Rate (%)', scale: 100 },
  vending_bench_2: { file: 'vending_bench_2_external.csv', column: 'Score', scale: 1 },
  apex_agents: { file: 'apex_agents_external.csv', column: 'Pass@1 score', scale: 100 },
  the_agent_company: { file: 'the_agent_company_external.csv', column: '% Resolved', scale: 100 },
});

/** RFC 4180 CSV：引号内可含逗号、换行和成对的双引号。 */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header = [], ...body] = rows;
  return body.filter(cells => cells.some(Boolean)).map(cells => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ''])));
}

/** “claude-opus-5-5_max”“o3_32K”这类版本名去掉末尾的思考强度或思考预算，剩下的就是模型本身。 */
export const epochModelName = version => version.replace(/_(max|xhigh|high|medium|low|minimal|none|unknown|thinking|promax|\d+K)$/i, '');

const vendorFor = organization => organization.split(',').map(item => epochOrganizations[item.trim()]).find(Boolean) ?? null;

/** 把 Epoch 各评测文件合成“厂商 + 名称归一”的成绩表；同一模型的多个思考档或多种测法取最高分。 */
export function collectEpochScores(files) {
  const roster = new Set(modelWorldVendorIds);
  const scores = new Map();
  for (const [league, config] of Object.entries(epochLeagues)) {
    if (!files[config.file]) throw new Error(`Epoch 数据包缺少 ${config.file}`);
    for (const row of parseCsv(files[config.file])) {
      const vendorId = vendorFor(row.Organization ?? '');
      const value = Number.parseFloat(row[config.column]);
      if (!vendorId || !roster.has(vendorId) || !Number.isFinite(value) || (config.accept && !config.accept(row))) continue;
      const names = league === 'eci' ? [row.Model, row['Display name']] : [epochModelName(row['Model version'] ?? ''), row.Name];
      for (const key of new Set(names.filter(Boolean).map(worldNameKey).filter(key => key && !/^\d+$/.test(key)))) {
        const id = `${vendorId}|${key}`;
        if (!scores.has(id)) scores.set(id, { vendorId, key, values: {} });
        const score = Math.round(value * config.scale * 100) / 100;
        const entry = scores.get(id);
        if (!(league in entry.values) || entry.values[league] < score) entry.values[league] = score;
      }
    }
  }
  return [...scores.values()].sort((a, b) => a.vendorId.localeCompare(b.vendorId) || a.key.localeCompare(b.key));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`Epoch AI 返回 ${response.status}`);
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()), { filter: file => Object.values(epochLeagues).some(config => config.file === file.name) });
  const entries = collectEpochScores(Object.fromEntries(Object.entries(archive).map(([name, bytes]) => [name, strFromU8(bytes)])));
  const asOf = new Date().toISOString().slice(0, 10);
  const lines = entries.map(entry => `  [${JSON.stringify(entry.vendorId)}, ${JSON.stringify(entry.key)}, ${JSON.stringify(entry.values)}],`);
  await writeFile(target, `// 生成来源：scripts/update-model-bench.mjs（Epoch AI Benchmarking Hub，CC BY 4.0）；请重新运行脚本更新，不要手改。\n`
    + `export const worldBenchAsOf = ${JSON.stringify(asOf)};\n`
    + `// [厂商 id, 名称归一, { 评测 id: 成绩 }]\nexport const worldBenchRows = [\n${lines.join('\n')}\n];\n`, 'utf8');
  process.stdout.write(`已生成 ${entries.length} 条模型成绩（${asOf}）\n`);
}
