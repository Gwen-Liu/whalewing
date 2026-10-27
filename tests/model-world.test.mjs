import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { acceptWorldSnapshot, buildWorldCatalog, curateWorldSnapshot, fetchWorldSnapshot, ModelWorld, worldCatalogUrl, worldLimits, worldPriceUrl } from '../features/model-world/model-world.js';
import { rateWorldModels } from '../src/model-world-rating.js';
import { worldIndex, worldValuePlans, worldTierFor, matchWorldIndex, worldNameKey } from '../src/model-world-index.js';
import { worldBenchScores } from '../src/model-world-bench.js';
import { parseAaName, groupAaModels } from '../src/model-world-aa.js';
import { collectEpochScores, epochModelName, parseCsv } from '../scripts/update-model-bench.mjs';
import { modelWorldContract } from '../features/model-world/contract.js';
import { modelWorldVendorIds } from '../src/model-world-roster.js';

const at = '2026-10-11T13:44:58.831Z';
// 测试不依赖随插件发布的真实榜单；需要时显式传入合成数据。
const none = { index: [], benchRows: [] };
/** models.dev 的两个公开文件：规范目录与各渠道价格。 */
function upstream() {
  const entry = (id, name, extra = {}) => ({ id, name, family: 'synthetic', attachment: false, reasoning: true, tool_call: false, temperature: true, knowledge: '2025-06', release_date: '2026-09-01', last_updated: '2026-09-02', modalities: { input: ['text'], output: ['text'] }, open_weights: false, limit: { context: 0, output: 100 }, ...extra });
  return {
    catalog: {
      'deepseek/synthetic-one': entry('deepseek/synthetic-one', '合成模型一', { weights: [{ label: '权重', url: 'https://example.org' }], benchmarks: [{ name: '厂商自报', score: 99 }] }),
      'deepseek/synthetic-two': entry('deepseek/synthetic-two', '合成模型二', { release_date: '2026-08', knowledge: undefined, limit: undefined }),
      'sdaia/other': entry('sdaia/other', '名单外模型'),
    },
    prices: {
      deepseek: { id: 'deepseek', models: {
        'alias-one': { id: 'alias-one', canonical_model_id: 'deepseek/synthetic-one', cost: { input: 9, output: 9 } },
        'synthetic-one': { id: 'synthetic-one', canonical_model_id: 'deepseek/synthetic-one', cost: { input: 0, output: 3, cache_read: 0.02 } },
      } },
      'other-host': { id: 'other-host', models: { two: { id: 'two', canonical_model_id: 'deepseek/synthetic-two', cost: { input: 1, output: 1 } } } },
    },
  };
}
/** 已整理好的鲸翼目录：两个合成模型。 */
function fixture() { const data = upstream(); return buildWorldCatalog(JSON.stringify(data.catalog), JSON.stringify(data.prices), at); }
function publicFixture(data = upstream(), overrides = {}) {
  const calls = [];
  const fetcher = { async fetch({ url }, signal) {
    signal.throwIfAborted(); calls.push(url);
    const content = JSON.stringify(url === worldCatalogUrl ? data.catalog : data.prices);
    return { url, statusCode: 200, body: { kind: 'text', content }, truncated: false, ...overrides };
  } };
  return { fetcher, calls };
}
async function instance(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-world-'));
  // 每例独占目录；清理严格限制在 allocator 返回的根内。
  t.after(async () => { if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('whalewing-world-')) throw new Error('测试目录越界'); await fs.rm(root, { recursive: true, force: true }); });
  const remote = publicFixture();
  const world = new ModelWorld({ root, fetcher: remote.fetcher, reference: none, ...options });
  t.after(() => world.dispose());
  return { world, root, ...remote };
}

test('models.dev 目录只收名单厂商，价格只取官方渠道且优先同名条目；日期精度、零值与缓存价保留，未用到的新字段忽略', () => {
  const catalog = fixture();
  assert.deepEqual(catalog.models.map(model => model.id), ['deepseek/synthetic-one', 'deepseek/synthetic-two']);
  const [one, two] = catalog.models;
  assert.equal(one.name, '合成模型一'); assert.equal(one.contextWindow, 0); assert.equal(one.maxOutput, 100);
  assert.deepEqual([one.releaseDate, one.releaseDatePrecision, one.knowledgeCutoff], ['2026-09-01', 'day', '2025-06']);
  assert.deepEqual(one.pricing, { inputPerMTok: 0, outputPerMTok: 3, cachedInputPerMTok: 0.02 }, '别名条目的价格不覆盖同名条目');
  assert.equal(one.capabilities.promptCaching, true); assert.equal(one.capabilities.structuredOutput, null);
  assert.deepEqual([two.releaseDate, two.releaseDatePrecision, two.knowledgeCutoff, two.contextWindow], ['2026-08', 'month', null, null]);
  assert.deepEqual(two.pricing, { inputPerMTok: null, outputPerMTok: null, cachedInputPerMTok: null }, '非官方渠道的价格不收');
  assert.equal(two.capabilities.promptCaching, null);
});

test('快照只采用 Epoch 第三方成绩，厂商自报不进评测；三项来源署名齐全', () => {
  const benchRows = [['deepseek', worldNameKey('合成模型一'), { gpqa_diamond: 80, eci: 129, unknown_bench: 1 }]];
  const accepted = acceptWorldSnapshot(JSON.stringify(fixture()), { index: [], benchRows });
  const model = accepted.models.find(item => item.id === 'deepseek/synthetic-one');
  assert.deepEqual(model.scores.map(score => [score.league, score.score, score.unit, score.source]), [['eci', 129, 'index', 'epoch.ai'], ['gpqa_diamond', 80, 'pct', 'epoch.ai']]);
  assert.equal(model.pricing.note, 'models.dev 官方渠道价格，不代表员工转发站实际费用');
  // 两个模型不足以换算百分位：不评级、不进榜单，也不编造分数。
  assert.equal(model.rating.overall, null); assert.equal(model.rating.tier, null); assert.deepEqual(accepted.leagues, []);
  assert.deepEqual(accepted.attributions.map(item => [item.name, item.license]).map(([name, license]) => name.startsWith('Artificial Analysis') ? 'AA' : `${name} ${license}`), ['models.dev MIT', 'AA', 'Epoch AI · Benchmarking Hub CC BY 4.0']);
  assert.equal(JSON.stringify(accepted).includes('ai-model-world'), false);
  assert.equal(accepted.vendors.find(vendor => vendor.id === 'deepseek').nameZh, '深度求索');
});

test('随插件发布的 Epoch 成绩能对上真实目录里的模型', () => {
  const scores = worldBenchScores({ id: 'deepseek/deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro 0813', vendorId: 'deepseek' });
  assert.ok(scores.some(score => score.league === 'eci') && scores.every(score => score.source === 'epoch.ai' && score.attribution === 'third-party'));
  assert.deepEqual(worldBenchScores({ id: 'deepseek/deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro 0813', vendorId: 'openai' }), [], '不跨厂商匹配');
});

test('Epoch 数据包：CSV 引号、机构映射、思考档去除与同模型取最高分', () => {
  assert.deepEqual(parseCsv('a,b\n"x, ""y""","多\n行"\n\n'), [{ a: 'x, "y"', b: '多\n行' }]);
  assert.equal(epochModelName('claude-opus-5-5_max'), 'claude-opus-5-5'); assert.equal(epochModelName('o3_32K'), 'o3'); assert.equal(epochModelName('gemini-2.5-pro-exp-03-25'), 'gemini-2.5-pro-exp-03-25');
  const header = 'Model version,Best score (across scorers),Organization,Name';
  const files = {
    'epoch_capabilities_index/eci_scores.csv': 'Model,Display name,eci,Organization\nClaude Opus 5.5,Claude Opus 5.5,168.83,Anthropic\nLlama X,Llama X,99,Unknown Lab\n',
    'gpqa_diamond.csv': `${header}\nclaude-opus-5-5_max,0.9,Anthropic,\nclaude-opus-5-5_high,0.8,Anthropic,\ngemini-4-argon_high,0.95,"Google DeepMind,Google",Gemini 4 Argon\n`,
    'terminalbench_external.csv': 'Model version,Accuracy mean,Organization,Source\nclaude-opus-5-5_max,0.7,Anthropic,https://www.tbench.ai/leaderboard/terminal-bench/2.0\nclaude-opus-5-5_max,0.99,Anthropic,https://www.tbench.ai/leaderboard/terminal-bench/1.0\n',
  };
  for (const file of ['hle_external.csv', 'arc_agi_2_external.csv', 'frontiermath_tiers_1_3_v2.csv', 'otis_mock_aime_2024_2025.csv', 'simplebench_external.csv', 'swe_bench_verified.csv', 'webdev_arena_external.csv', 'metr_time_horizons_external.csv', 'gdpval_external.csv', 'vending_bench_2_external.csv', 'apex_agents_external.csv', 'the_agent_company_external.csv']) files[file] = 'Model version,Organization\n';
  const entries = collectEpochScores(files);
  assert.deepEqual(entries.map(entry => [entry.vendorId, entry.key, entry.values]), [
    ['anthropic', 'claude-opus-5-5', { eci: 168.83, gpqa_diamond: 90, terminal_bench_2_0: 70 }],
    ['google', 'gemini-4-argon', { gpqa_diamond: 95 }],
  ], '名单外机构不收，比例换成百分数，Terminal-Bench 只收 2.0');
  delete files['gpqa_diamond.csv'];
  assert.throws(() => collectEpochScores(files), /缺少 gpqa_diamond\.csv/);
});

test('收录名单只保留名单厂商及其模型，按名单排序并给出模型数', async t => {
  const data = upstream();
  data.catalog['meta/synthetic-three'] = { ...data.catalog['deepseek/synthetic-one'], id: 'meta/synthetic-three', name: '合成模型三' };
  const accepted = acceptWorldSnapshot(JSON.stringify(buildWorldCatalog(JSON.stringify(data.catalog), JSON.stringify(data.prices), at)), none);
  const curated = curateWorldSnapshot(accepted, ['meta', 'deepseek']);
  assert.deepEqual(curated.vendors.map(vendor => [vendor.id, vendor.modelCount]), [['meta', 1], ['deepseek', 2]]);
  assert.deepEqual(curated.models.map(model => model.vendorId).sort(), ['deepseek', 'deepseek', 'meta']);
  assert.equal(curateWorldSnapshot(accepted, null).vendors.length, modelWorldVendorIds.length);
  const { world, root } = await instance(t, { vendorIds: ['deepseek'] });
  world.fetcher = publicFixture(data).fetcher;
  const status = await world.execute({ action: 'refresh' });
  assert.deepEqual(status.vendors.map(vendor => vendor.id), ['deepseek']); assert.equal(status.modelCount, 2);
  assert.equal((await world.execute({ action: 'list', vendorId: 'meta' })).total, 0);
  const saved = JSON.parse(await fs.readFile(path.join(root, 'snapshot.json'), 'utf8'));
  assert.equal(saved.source, 'models.dev'); assert.equal(JSON.parse(saved.raw).models.length, 3, '保存的是整理后的名单内目录，调整收录名单无需重新下载');
});

test('综合实力取 AA 指数最强档，梯队按指数划分；分项按百分位跨单位合成，评测不足不给加权分', () => {
  const mk = (id, value, extra = {}) => ({ id, vendorId: 'v', capabilities: { reasoning: false }, pricing: { inputPerMTok: 1, outputPerMTok: 4 }, scores: [
    { league: 'eci', score: 100 + value, unit: 'index' }, { league: 'gpqa_diamond', score: value, unit: 'pct' }, { league: 'webdev_arena_elo', score: 1000 + value * 10, unit: 'elo' },
  ], ...extra });
  const rated = rateWorldModels([mk('a', 10), mk('b', 20), mk('c', 30), mk('d', 40), mk('anthropic/claude-sonnet-5-5', 60), mk('anthropic/claude-opus-5-5', 50), mk('anthropic/claude-fable-5-1', 55), mk('lone', 0, { scores: [{ league: 'eci', score: 1, unit: 'index' }] })]);
  const by = Object.fromEntries(rated.map(model => [model.id, model]));
  const opus = by['anthropic/claude-opus-5-5'], sonnet = by['anthropic/claude-sonnet-5-5'], fable = by['anthropic/claude-fable-5-1'];
  assert.ok(sonnet.rating.composite > opus.rating.composite, '分项百分位 Sonnet 更高');
  assert.deepEqual([opus.rating.overall, opus.rating.tier, opus.rating.effort], [57.6, 'T0', 'max'], '综合实力仍以 AA 最强档为准，Opus 5.5 第一');
  assert.ok(sonnet.rating.overall < opus.rating.overall);
  assert.deepEqual([fable.rating.tier, fable.rating.effort], ['T0', 'max']);
  assert.equal(opus.efforts.length, 5); assert.deepEqual(opus.efforts[2], { effort: 'high', index: 53.6, cost: 182.25 }, '成本按 GPT-5.6 Luna 轻度 ≈ $0.01 = 1 折算');
  assert.equal(by.a.rating.overall, null, 'AA 未收录的模型不进综合实力榜'); assert.equal(by.a.rating.tier, null);
  assert.ok(by.d.rating.reasoning > by.a.rating.reasoning); assert.equal(by.a.rating.coverage, 3);
  assert.equal(by.lone.rating.composite, null, '只有一项评测不给加权分');
  assert.deepEqual([52, 51, 44, 43, 34, 33].map(worldTierFor), ['T0', 'T1', 'T1', 'T2', 'T2', 'T3']);
});

test('性价比先按相对消耗分档，档内推荐能力最强的模型与思考强度；同价最强标记无被支配方案', () => {
  const { bands, plans } = worldValuePlans(worldIndex.map(entry => ({ ...entry, id: `${entry.vendorId}/${entry.key}` })));
  const best = Object.fromEntries(bands.map(band => [band.id, band.best && `${band.best.name} ${band.best.effort} ${band.best.index}`]));
  assert.equal(best.c200, 'Claude Opus 5.5 high 53.6', '100–200 消耗档推荐 Opus 5.5 高强度思考');
  assert.equal(best.c100, 'GPT-6.1 Sol max 51.8');
  assert.equal(best['c-max'], 'Claude Opus 5.5 max 57.6');
  assert.ok(bands.every(band => band.alternatives.length <= 3 && band.alternatives.every(plan => !band.best || plan.index <= band.best.index)));
  const key = (name, effort) => plans.find(plan => plan.name === name && plan.effort === effort);
  assert.equal(key('Claude Opus 5.5', 'high').frontier, true);
  assert.equal(key('Gemini 4 Argon', 'high').frontier, false, '更贵且更弱的方案不算同价最强');
  assert.equal(plans.some(plan => plan.name === 'Muse Wonder Full'), false, '未公布成本的方案不参与性价比');
  assert.ok(plans.every((plan, index) => index === 0 || plans[index - 1].index >= plan.index));
});

test('AA 数据：括号里的思考强度与版本号分开，同名多档合并；名称归一后对上模型目录，缺失的新模型补记录', () => {
  assert.deepEqual(parseAaName('Claude Opus 5.5 (Max, Default Fallback)'), { name: 'Claude Opus 5.5', effort: 'max' });
  assert.deepEqual(parseAaName('GPT-6 Luna (Non-reasoning)'), { name: 'GPT-6 Luna', effort: 'none' });
  assert.deepEqual(parseAaName('Hy3-preview (Reasoning)'), { name: 'Hy3-preview', effort: null });
  assert.deepEqual(parseAaName('Qwen3.8 Max (0902)'), { name: 'Qwen3.8 Max (0902)', effort: null }, '版本号不是思考强度');
  const row = (name, creator, index, cost, release = '2026-09-01') => ({ name, model_creator: { name: creator }, release_date: release, evaluations: { artificial_analysis_intelligence_index: index }, artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: cost } } });
  const groups = groupAaModels([row('Claude Opus 5.5 (High, Default Fallback)', 'Anthropic', 53.6, 1.8225), row('Claude Opus 5.5 (Max, Default Fallback)', 'Anthropic', 57.6, 5.982), row('Llama X', 'Unknown Lab', 60, 1), row('Grok 4.7 (High)', 'SpaceXAI', 46.3, null), row('No Score', 'OpenAI', null, 1)]);
  assert.deepEqual(groups.map(group => [group.vendorId, group.name, group.levels.map(level => level[0])]), [['anthropic', 'Claude Opus 5.5', ['max', 'high']], ['xai', 'Grok 4.7', ['high']]], '名单外厂商和没有指数的行不收，档位按强度排序');
  assert.equal(worldNameKey('openai/gpt-6.1-sol'), worldNameKey('GPT-6.1 Sol'));
  const entries = [{ vendorId: 'openai', name: 'GPT-6.1 Sol', key: worldNameKey('GPT-6.1 Sol'), released: '2026-09-29', efforts: [] }, { vendorId: 'google', name: 'Gemini 9', key: 'gemini-9', released: '2026-10-01', efforts: [] }, { vendorId: 'google', name: 'Gemini 1', key: 'gemini-1', released: '2024-01-01', efforts: [] }];
  const { matched, missing } = matchWorldIndex([{ id: 'openai/gpt-6.1-sol', vendorId: 'openai' }], entries);
  assert.equal(matched.get('openai/gpt-6.1-sol').name, 'GPT-6.1 Sol');
  assert.deepEqual(missing.map(entry => entry.id), ['google/gemini-9'], '目录里没有的一年内新模型补记录，老模型不补');
  const accepted = acceptWorldSnapshot(JSON.stringify(fixture()), { index: entries, benchRows: [] });
  assert.deepEqual(accepted.models.map(model => model.id), ['deepseek/synthetic-one', 'deepseek/synthetic-two', 'openai/gpt-6-1-sol', 'google/gemini-9'], '快照里补上 AA 新模型');
});

test('models.dev 结构变化与鲸翼目录契约漂移、重复标识、名单外厂商和异常规模都拒收', () => {
  for (const mutate of [
    data => { data.catalog['deepseek/synthetic-one'].id = 'deepseek/other'; }, data => { data.catalog['deepseek/synthetic-one'].release_date = '2026-02-31'; },
    data => { data.catalog['deepseek/synthetic-one'].limit = { context: '大' }; }, data => { data.catalog['deepseek/synthetic-one'].reasoning = 'yes'; },
    data => { data.prices.deepseek.models = null; }, data => { data.prices.deepseek.models['synthetic-one'].cost = 1; }, data => { data.catalog = []; },
  ]) { const data = upstream(); mutate(data); assert.throws(() => buildWorldCatalog(JSON.stringify(data.catalog), JSON.stringify(data.prices), at), { code: 'WORLD_SCHEMA' }); }
  assert.throws(() => buildWorldCatalog('{', '{}', at), { code: 'WORLD_FETCH' });
  for (const mutate of [
    data => { data.schemaVersion = 1; }, data => { data.models[0].newField = true; }, data => { data.models[1].id = data.models[0].id; },
    data => { data.models[0].vendorId = 'sdaia'; }, data => { data.models[0].releaseDatePrecision = 'month'; }, data => { data.models[0].capabilities.newFlag = true; },
  ]) { const input = fixture(); mutate(input); assert.throws(() => acceptWorldSnapshot(JSON.stringify(input), none)); }
  assert.throws(() => acceptWorldSnapshot('x'.repeat(worldLimits.snapshotBytes + 1)), { code: 'WORLD_SCALE' });
  const oversized = fixture(); oversized.models = Array(worldLimits.models + 1).fill(oversized.models[0]);
  assert.throws(() => acceptWorldSnapshot(JSON.stringify(oversized), none), { code: 'WORLD_SCALE' });
});

test('下载只读 models.dev 两个固定文件，异常响应拒收', async () => {
  const remote = publicFixture();
  const { raw } = await fetchWorldSnapshot(remote.fetcher, new AbortController().signal);
  assert.deepEqual(JSON.parse(raw).models.map(model => model.id), ['deepseek/synthetic-one', 'deepseek/synthetic-two']);
  assert.deepEqual(remote.calls, [worldCatalogUrl, worldPriceUrl]);
  for (const overrides of [{ truncated: true }, { statusCode: 429 }, { url: 'https://other.example' }, { body: { kind: 'text', content: 'not json' } }]) {
    await assert.rejects(fetchWorldSnapshot(publicFixture(upstream(), overrides).fetcher, new AbortController().signal), { code: 'WORLD_FETCH' });
  }
});

test('无账号离线读取、原子保存重载、搜索/厂商/能力/时间线/排序/详情/比较', async t => {
  const { world, calls, root } = await instance(t);
  assert.equal((await world.execute({ action: 'status' })).available, false); assert.equal(calls.length, 0);
  await world.execute({ action: 'refresh' }); assert.equal(calls.length, 2);
  assert.equal((await world.execute({ action: 'ranking', league: 'overall' })).total, 0, '评测不足的模型不进榜');
  assert.equal((await world.execute({ action: 'list', query: '深度求索', capability: 'reasoning', limit: 1 })).models.length, 1);
  assert.equal((await world.execute({ action: 'list', capability: 'toolCall' })).total, 0);
  assert.equal((await world.execute({ action: 'list', capability: 'promptCaching' })).total, 1);
  assert.equal((await world.execute({ action: 'list', vendorId: 'missing' })).total, 0);
  assert.equal((await world.execute({ action: 'detail', id: 'deepseek/synthetic-one' })).model.id, 'deepseek/synthetic-one');
  assert.equal((await world.execute({ action: 'compare', ids: ['deepseek/synthetic-one', 'deepseek/synthetic-two'] })).models.length, 2);
  assert.equal((await world.execute({ action: 'timeline' })).models[0].releaseDate, '2026-09-01');
  await assert.rejects(world.execute({ action: 'compare', ids: ['deepseek/synthetic-one', 'deepseek/synthetic-one'] }), { code: 'WORLD_INPUT' });
  const offline = new ModelWorld({ root, reference: none, fetcher: { fetch() { throw new Error('读取不应联网'); } } }); t.after(() => offline.dispose());
  assert.equal((await offline.execute({ action: 'status' })).modelCount, 2);
  const status = await offline.execute({ action: 'status' }); status.vendors[0].name = '不得污染';
  assert.equal((await offline.execute({ action: 'status' })).vendors[0].name, 'OpenAI');
  assert.equal(calls.length, 2); assert.deepEqual(await fs.readdir(root), ['snapshot.json']);
});

test('改用 models.dev 之前保存的快照提示重新获取，显式刷新后恢复', async t => {
  const { world, root } = await instance(t);
  await fs.writeFile(path.join(root, 'snapshot.json'), JSON.stringify({ commit: '1'.repeat(40), blob: '2'.repeat(40), acceptedAt: at, raw: '{}', sha256: '3'.repeat(64) }));
  const status = await world.execute({ action: 'status' });
  assert.equal(status.available, false); assert.equal(status.lastRefresh.code, 'WORLD_SOURCE_CHANGED'); assert.match(status.lastRefresh.message, /更新数据/);
  assert.equal((await world.execute({ action: 'refresh' })).available, true);
});

test('网络失联、目录结构变化保留当前与磁盘旧数据，恢复仍从显式刷新入口', async t => {
  const { world, root } = await instance(t); await world.execute({ action: 'refresh' });
  const prior = await fs.readFile(path.join(root, 'snapshot.json'), 'utf8');
  world.fetcher = { fetch() { throw new Error('离线'); } };
  await assert.rejects(world.execute({ action: 'refresh' }), /离线/);
  assert.equal((await world.execute({ action: 'status' })).modelCount, 2);
  const data = upstream(); data.catalog['deepseek/synthetic-one'].tool_call = 'yes'; world.fetcher = publicFixture(data).fetcher;
  await assert.rejects(world.execute({ action: 'refresh' }), { code: 'WORLD_SCHEMA' });
  assert.equal(await fs.readFile(path.join(root, 'snapshot.json'), 'utf8'), prior);
  world.fetcher = publicFixture().fetcher; assert.equal((await world.execute({ action: 'refresh' })).lastRefresh.status, 'ok');
});

test('并发刷新拒收；真实取消结束等待，迟到下载不提交且清理 owner', async t => {
  const { world, root } = await instance(t); await world.execute({ action: 'status' });
  const started = Promise.withResolvers(), late = Promise.withResolvers();
  world.fetcher = { fetch() { started.resolve(); return late.promise; } };
  const abort = new AbortController(); const running = world.execute({ action: 'refresh' }, abort.signal);
  await started.promise;
  await assert.rejects(world.execute({ action: 'refresh' }), { code: 'WORLD_BUSY' });
  abort.abort(new Error('员工取消')); await assert.rejects(running, /员工取消/);
  late.resolve({ statusCode: 200, body: { kind: 'text', content: '{}' } });
  assert.equal((await world.execute({ action: 'status' })).lastRefresh.status, 'cancelled');
  assert.equal((await world.execute({ action: 'status' })).refreshing, false);
  assert.deepEqual(await fs.readdir(root), []);
});

const renamed = name => { const data = upstream(); data.catalog['deepseek/synthetic-one'].name = name; return data; };

test('写后读回失败恢复原快照；临时文件无残留', async t => {
  const { world, root } = await instance(t); await world.execute({ action: 'refresh' });
  const prior = await fs.readFile(path.join(root, 'snapshot.json'), 'utf8');
  let replaced = false, injected = false;
  world.fs = {
    ...fs,
    async rename(...args) { await fs.rename(...args); replaced = true; },
    async readFile(file, ...args) { if (replaced && !injected && file === world.file) { injected = true; return Buffer.from('{}'); } return fs.readFile(file, ...args); },
  };
  world.fetcher = publicFixture(renamed('更新模型')).fetcher;
  await assert.rejects(world.execute({ action: 'refresh' }), { code: 'WORLD_READBACK' });
  assert.equal(await fs.readFile(world.file, 'utf8'), prior);
  assert.equal((await world.execute({ action: 'detail', id: 'deepseek/synthetic-one' })).model.name, '合成模型一');
  assert.deepEqual(await fs.readdir(root), ['snapshot.json']);
});

test('损坏本地快照报告空态，显式刷新修复；路径拒绝符号链接', async t => {
  const { world, root } = await instance(t);
  await fs.writeFile(path.join(root, 'snapshot.json'), '{');
  assert.equal((await world.execute({ action: 'status' })).lastRefresh.code, 'WORLD_STORAGE');
  assert.equal((await world.execute({ action: 'refresh' })).available, true);
  const blocked = new ModelWorld({ root, reference: none, fetcher: publicFixture().fetcher, fileSystem: { ...fs, async lstat() { return { isSymbolicLink: () => true, isDirectory: () => true }; } } }); t.after(() => blocked.dispose());
  await assert.rejects(blocked.execute({ action: 'refresh' }), { code: 'WORLD_PATH' });
});

test('Remote 输入拒绝任意地址、跨赛制、无限分页与比较滥用', () => {
  const contract = modelWorldContract(z);
  for (const value of [{ action: 'refresh', url: 'https://other.example' }, { action: 'ranking', league: 'other' }, { action: 'list', limit: 201 }, { action: 'compare', ids: ['one'] }]) assert.equal(contract.input.safeParse(value).success, false);
  assert.equal(contract.input.parse({ action: 'refresh' }).action, 'refresh');
  assert.equal(contract.host.invocations[0].cancellation.parameter, 'signal');
});

test('严格结果拒绝空成功、缺失元数据、缺模型与未知字段，空态保留完整结构', async t => {
  const contract = modelWorldContract(z), { world } = await instance(t);
  assert.equal(contract.result.safeParse({}).success, false);
  for (const action of ['list', 'timeline', 'ranking', 'detail', 'compare']) {
    const input = action === 'ranking' ? { action, league: 'overall' } : action === 'detail' ? { action, id: 'deepseek/synthetic-one' } : action === 'compare' ? { action, ids: ['deepseek/synthetic-one', 'deepseek/synthetic-two'] } : { action };
    const result = await world.execute(input);
    assert.equal(contract.result.safeParse(result).success, true); assert.equal(result.available, false);
    const missing = { ...result }; delete missing.generatedAt; assert.equal(contract.result.safeParse(missing).success, false);
    assert.equal(contract.result.safeParse({ ...result, invented: true }).success, false);
  }
  await world.execute({ action: 'refresh' });
  const detail = await world.execute({ action: 'detail', id: 'deepseek/synthetic-one' });
  assert.equal(contract.result.safeParse({ ...detail, model: null }).success, false);
  const list = await world.execute({ action: 'list' });
  assert.equal(contract.result.safeParse({ ...list, models: undefined }).success, false);
  assert.equal(contract.result.safeParse({ ...list, total: 0 }).success, false);
});

test('取消发生在替换前保留旧数据，提交后的取消仍完成权威 readback', async t => {
  const { world, root } = await instance(t); await world.execute({ action: 'refresh' });
  const before = await fs.readFile(world.file, 'utf8');
  const abort = new AbortController();
  world.fs = { ...fs, async writeFile(...args) { await fs.writeFile(...args); abort.abort(new Error('写临时文件后取消')); } };
  await assert.rejects(world.execute({ action: 'refresh' }, abort.signal), /写临时文件后取消/);
  assert.equal(await fs.readFile(world.file, 'utf8'), before); assert.deepEqual(await fs.readdir(root), ['snapshot.json']);
  const committed = new AbortController();
  world.fs = { ...fs, async rename(...args) { await fs.rename(...args); committed.abort(new Error('提交后取消')); } };
  assert.equal((await world.execute({ action: 'refresh' }, committed.signal)).lastRefresh.status, 'ok');
});

test('替换后的恢复失败明确未知接受，不伪报确定回滚', async t => {
  const { world } = await instance(t); await world.execute({ action: 'refresh' });
  let replaced = false;
  world.fs = {
    ...fs,
    async rename(...args) { if (replaced) throw new Error('恢复失败'); await fs.rename(...args); replaced = true; },
    async readFile(file, ...args) { if (replaced && file === world.file) return Buffer.from('{}'); return fs.readFile(file, ...args); },
  };
  await assert.rejects(world.execute({ action: 'refresh' }), { code: 'WORLD_STORAGE_UNKNOWN' });
  assert.equal((await world.execute({ action: 'status' })).lastRefresh.code, 'WORLD_STORAGE_UNKNOWN');
  assert.equal((await world.execute({ action: 'status' })).available, true);
});

test('原子替换后同时取消不掩盖 readback 失败和未知接受', async t => {
  for (const recoveryFails of [true, false]) {
    const { world } = await instance(t); await world.execute({ action: 'refresh' });
    const before = await fs.readFile(world.file, 'utf8');
    const cancel = new AbortController(); let replaced = false, failedReadback = false;
    world.fs = {
      ...fs,
      async rename(...args) {
        if (replaced && recoveryFails) throw new Error('恢复替换失败');
        await fs.rename(...args); replaced = true; cancel.abort(new Error('替换后员工取消'));
      },
      async readFile(file, ...args) {
        if (replaced && !failedReadback && file === world.file) { failedReadback = true; return Buffer.from('{}'); }
        return fs.readFile(file, ...args);
      },
    };
    const code = recoveryFails ? 'WORLD_STORAGE_UNKNOWN' : 'WORLD_READBACK';
    await assert.rejects(world.execute({ action: 'refresh' }, cancel.signal), { code });
    const status = await world.execute({ action: 'status' });
    assert.equal(status.lastRefresh.code, code); assert.equal(status.lastRefresh.status, 'error');
    assert.doesNotMatch(status.lastRefresh.message, /刷新已取消，保留原数据/);
    if (recoveryFails) assert.match(status.lastRefresh.message, /恢复结果未确认/);
    else assert.equal(await fs.readFile(world.file, 'utf8'), before);
  }
});

test('同 profile 第二实例争用零写入，不同 profile 独立提交，释放后可显式刷新', async t => {
  const { world: first, root } = await instance(t); await first.execute({ action: 'refresh' });
  let writes = 0;
  const second = new ModelWorld({ root, reference: none, fetcher: publicFixture(renamed('第二实例更新')).fetcher, fileSystem: { ...fs, async writeFile(...args) { writes++; return fs.writeFile(...args); } } });
  t.after(() => second.dispose()); await second.execute({ action: 'status' });
  const { world: separate } = await instance(t);
  const held = Promise.withResolvers(), release = Promise.withResolvers();
  first.fs = { ...fs, async writeFile(...args) { await fs.writeFile(...args); held.resolve(); await release.promise; } };
  const running = first.execute({ action: 'refresh' });
  try {
    await held.promise;
    await assert.rejects(second.execute({ action: 'refresh' }), /timed out waiting for the writer lock/);
    assert.equal(writes, 0);
    assert.equal((await separate.execute({ action: 'refresh' })).available, true);
    assert.equal((await fs.readFile(`${first.file}.lock`, 'utf8')).trim(), String(process.pid));
  } finally { release.resolve(); await running; }
  assert.equal((await second.execute({ action: 'refresh' })).available, true); assert.equal(writes, 1);
  assert.equal((await second.execute({ action: 'detail', id: 'deepseek/synthetic-one' })).model.name, '第二实例更新');
  assert.deepEqual(await fs.readdir(root), ['snapshot.json']);
});

test('持有恢复锁时其他实例零写入，失败恢复以磁盘最新成功快照为准', async t => {
  const { world: first, root } = await instance(t); await first.execute({ action: 'refresh' });
  const initial = await fs.readFile(first.file, 'utf8');
  let secondWrites = 0;
  const second = new ModelWorld({ root, reference: none, fetcher: publicFixture(renamed('另实例已接纳模型')).fetcher, fileSystem: { ...fs, async writeFile(...args) { secondWrites++; return fs.writeFile(...args); } } });
  t.after(() => second.dispose()); await second.execute({ action: 'status' });
  const held = Promise.withResolvers(), release = Promise.withResolvers(); let renames = 0, injected = false;
  first.fs = {
    ...fs,
    async rename(...args) { await fs.rename(...args); renames++; },
    async readFile(file, ...args) {
      if (renames === 1 && !injected && file === first.file) { injected = true; held.resolve(); await release.promise; return Buffer.from('{}'); }
      return fs.readFile(file, ...args);
    },
  };
  const running = assert.rejects(first.execute({ action: 'refresh' }), { code: 'WORLD_READBACK' });
  try {
    await held.promise;
    await assert.rejects(second.execute({ action: 'refresh' }), /timed out waiting for the writer lock/);
    assert.equal(secondWrites, 0);
  } finally { release.resolve(); await running; }
  assert.equal(await fs.readFile(first.file, 'utf8'), initial);
  await second.execute({ action: 'refresh' }); const latest = await fs.readFile(first.file, 'utf8');
  // 第一实例的内存仍旧；第二次失败必须恢复锁内新读到的文件，而非内存旧快照。
  renames = 0; injected = false;
  await assert.rejects(first.execute({ action: 'refresh' }), { code: 'WORLD_READBACK' });
  assert.equal(await fs.readFile(first.file, 'utf8'), latest); assert.equal(secondWrites, 1);
  assert.deepEqual(await fs.readdir(root), ['snapshot.json']);
});

/** 内存里的 Key 存取，形状与宿主接到 DSH 凭据服务的一致。 */
function memoryKey(initial, { writable = true, source = 'file' } = {}) {
  let value = initial;
  return {
    writable, writes: [],
    async describe() { return value ? { configured: true, source } : { configured: false }; },
    async resolve() { return value; },
    async set(next) { this.writes.push('set'); value = next; },
    async unset() { this.writes.push('unset'); value = undefined; },
  };
}
const aaRow = (name, creator, index, cost = 1, release = '2026-10-01') => ({ name, model_creator: { name: creator }, release_date: release, evaluations: { artificial_analysis_intelligence_index: index }, artificial_analysis_intelligence_index_cost: { cost_per_task: { total_cost: cost } } });
/** AA 免费接口：默认两页数据，第二页结束。 */
function aaPages(pages = [[aaRow('Synthetic One (High)', 'DeepSeek', 50)], [aaRow('Synthetic Two', 'DeepSeek', 40)]], status = 200) {
  const calls = [];
  const indexFetch = async (url, key) => {
    calls.push({ url, key });
    const page = Number(new URL(url).searchParams.get('page'));
    return { statusCode: status, content: JSON.stringify({ intelligence_index_version: '9.9', data: pages[page - 1] ?? [], pagination: { has_more: page < pages.length } }) };
  };
  return { indexFetch, calls };
}
const secret = 'aa_test_key_0123456789';

test('填了 Key：「更新数据」一起在线更新综合实力，快照与返回结果里都没有 Key', async t => {
  const aa = aaPages(), indexKey = memoryKey(secret);
  const { world, root } = await instance(t, { indexKey, indexFetch: aa.indexFetch });
  const status = await world.execute({ action: 'refresh' });
  assert.deepEqual(aa.calls.map(call => [new URL(call.url).searchParams.get('page'), call.key]), [['1', secret], ['2', secret]]);
  assert.deepEqual({ ...status.index, asOf: undefined }, { source: 'online', asOf: undefined, version: '9.9', key: 'saved', error: null });
  assert.equal(status.attributions[1].name, 'Artificial Analysis Intelligence Index v9.9');
  const detail = await world.execute({ action: 'detail', id: 'deepseek/synthetic-one' });
  assert.deepEqual([detail.model.rating.overall, detail.model.rating.effort], [50, 'high'], '在线指数对上目录模型');
  const saved = await fs.readFile(path.join(root, 'snapshot.json'), 'utf8');
  assert.equal(saved.includes(secret), false); assert.equal(JSON.stringify(status).includes(secret), false);
  assert.equal(JSON.parse(saved).index.rows.length, 2);
  // 没有 Key 的新实例离线读取，仍用已保存的在线数据。
  const offline = new ModelWorld({ root, reference: none, fetcher: { fetch() { throw new Error('读取不应联网'); } } }); t.after(() => offline.dispose());
  const offlineStatus = await offline.execute({ action: 'status' });
  assert.deepEqual([offlineStatus.index.source, offlineStatus.index.key], ['online', 'unavailable']);
});

test('没填 Key 不请求 AA，使用随插件发布的数据；随包数据更新后旧的在线数据让位', async t => {
  const aa = aaPages();
  const { world } = await instance(t, { indexKey: memoryKey(undefined), indexFetch: aa.indexFetch });
  const status = await world.execute({ action: 'refresh' });
  assert.equal(aa.calls.length, 0); assert.deepEqual([status.index.source, status.index.key, status.index.error], ['bundled', 'none', null]);
  const { world: online, root } = await instance(t, { indexKey: memoryKey(secret), indexFetch: aaPages().indexFetch });
  assert.equal((await online.execute({ action: 'refresh' })).index.source, 'online');
  const upgraded = new ModelWorld({ root, reference: { ...none, indexAsOf: '2999-01-01', indexVersion: '10' }, fetcher: publicFixture().fetcher }); t.after(() => upgraded.dispose());
  const upgradedStatus = await upgraded.execute({ action: 'status' });
  assert.deepEqual([upgradedStatus.index.source, upgradedStatus.index.version], ['bundled', '10']);
});

test('AA 拒绝 Key 或额度用完：模型目录照常更新，综合实力沿用之前的数据并说明原因', async t => {
  const { world } = await instance(t, { indexKey: memoryKey(secret), indexFetch: aaPages().indexFetch });
  await world.execute({ action: 'refresh' });
  for (const [status, pattern] of [[401, /拒绝了这个 API Key/], [429, /免费额度已用完/], [500, /返回 500/]]) {
    world.indexFetch = aaPages(undefined, status).indexFetch; world.fetcher = publicFixture(renamed(`更新 ${status}`)).fetcher;
    const result = await world.execute({ action: 'refresh' });
    assert.equal(result.lastRefresh.status, 'ok'); assert.match(result.index.error, pattern); assert.equal(result.index.source, 'online', '保留上次在线数据');
    assert.equal((await world.execute({ action: 'detail', id: 'deepseek/synthetic-one' })).model.name, `更新 ${status}`);
  }
  world.indexFetch = aaPages().indexFetch;
  assert.equal((await world.execute({ action: 'refresh' })).index.error, null, '恢复后清掉原因');
});

test('保存、替换、清除 Key 走宿主凭据服务；没有凭据服务时拒绝保存，非法 Key 在契约层拒收', async t => {
  const indexKey = memoryKey(undefined);
  const { world } = await instance(t, { indexKey, indexFetch: aaPages().indexFetch });
  assert.equal((await world.execute({ action: 'status' })).index.key, 'none');
  const saved = await world.execute({ action: 'setIndexKey', key: secret });
  assert.equal(saved.index.key, 'saved'); assert.equal(JSON.stringify(saved).includes(secret), false);
  assert.equal((await world.execute({ action: 'clearIndexKey' })).index.key, 'none'); assert.deepEqual(indexKey.writes, ['set', 'unset']);
  const { world: fromEnv } = await instance(t, { indexKey: memoryKey(secret, { source: 'env' }) });
  assert.equal((await fromEnv.execute({ action: 'status' })).index.key, 'env');
  const { world: readonly } = await instance(t, { indexKey: memoryKey(undefined, { writable: false }) });
  await assert.rejects(readonly.execute({ action: 'setIndexKey', key: secret }), { code: 'WORLD_KEY_UNAVAILABLE' });
  const { world: bare } = await instance(t);
  assert.equal((await bare.execute({ action: 'status' })).index.key, 'unavailable');
  const contract = modelWorldContract(z);
  for (const key of ['short', 'has space inside', 'x'.repeat(201), '中文密钥中文密钥中文']) assert.equal(contract.input.safeParse({ action: 'setIndexKey', key }).success, false, key);
});

test('AA 免费接口逐页读取并整理成随包数据同样的行；在线数据结构异常拒收', async () => {
  const { fetchAaIndex } = await import('../src/model-world-aa.js');
  const { acceptWorldIndex } = await import('../features/model-world/model-world.js');
  const aa = aaPages([[aaRow('Claude Opus 5.5 (Max)', 'Anthropic', 57.6, 5.982), aaRow('Llama X', 'Unknown Lab', 60)], [aaRow('Claude Opus 5.5 (High)', 'Anthropic', 53.6, 1.8225)]]);
  const result = await fetchAaIndex(url => aa.indexFetch(url, secret));
  assert.deepEqual(result, { version: '9.9', count: 3, rows: [['anthropic', 'Claude Opus 5.5', '2026-10-01', [['max', 57.6, 5.982], ['high', 53.6, 1.8225]]]] });
  await assert.rejects(fetchAaIndex(async () => ({ statusCode: 200, content: '{"data":"x"}' })), { code: 'AA_FETCH' });
  await assert.rejects(fetchAaIndex(async () => ({ statusCode: 200, content: JSON.stringify({ data: [aaRow('Llama X', 'Unknown Lab', 60)] }) })), /没有返回名单内厂商/);
  const good = { asOf: '2026-10-21', version: '9.9', rows: result.rows };
  assert.equal(acceptWorldIndex(structuredClone(good)).rows.length, 1);
  for (const mutate of [value => { value.rows[0][0] = 'sdaia'; }, value => { value.rows[0][3][0][0] = 'turbo'; }, value => { value.rows[0][3][0][1] = 101; }, value => { value.asOf = '2026-10'; }, value => { value.extra = 1; }]) {
    const value = structuredClone(good); mutate(value); assert.throws(() => acceptWorldIndex(value));
  }
});

test('宿主 Key 存取：有凭据服务时读写都走它，没有时只读环境变量', async () => {
  const { credentialIndexKey, worldIndexKeyRef } = await import('../features/model-world/index-key.js');
  const store = new Map();
  const credentials = { describe: async ref => store.has(ref) ? { configured: true, source: 'file' } : { configured: false }, resolve: async ref => store.has(ref) ? { value: store.get(ref) } : undefined, set: async (ref, value) => { store.set(ref, value); }, unset: async ref => { store.delete(ref); } };
  const linked = credentialIndexKey(() => credentials, {});
  assert.equal(linked.writable, true); await linked.set(secret);
  assert.deepEqual([store.get(worldIndexKeyRef), await linked.resolve(), (await linked.describe()).source], [secret, secret, 'file']);
  const ambient = credentialIndexKey(() => undefined, { [worldIndexKeyRef]: secret });
  assert.deepEqual([ambient.writable, await ambient.resolve(), await ambient.describe()], [false, secret, { configured: true, source: 'env' }]);
  assert.equal(await credentialIndexKey(() => undefined, {}).describe(), null);
});

test('国产人民币价目表：每条都有官方出处，型号 id 不区分大小写，阶梯价与限时价如实标注', async () => {
  const { worldCnyPrices, worldCnyPrice, worldPriceText, worldDomesticVendors } = await import('../src/model-world-cny-prices.js');
  for (const [id, entry] of Object.entries(worldCnyPrices)) {
    assert.ok(worldDomesticVendors.includes(id.split('/')[0]), `${id} 不是国产厂商`);
    assert.match(entry.source, /^https:\/\//, `${id} 缺官方出处`);
    for (const key of ['inputPerMTok', 'outputPerMTok']) assert.equal(typeof entry[key], 'number', `${id} 缺 ${key}`);
  }
  // models.dev 把 MiniMax 型号改成大小写混写后，仍对得上官网价。
  assert.equal(worldCnyPrice('minimax/MiniMax-M3').inputPerMTok, 2.1);
  assert.equal(worldPriceText({ vendorId: 'minimax', id: 'minimax/MiniMax-M3' }, 'outputPerMTok'), '¥8.4 起');
  assert.equal(worldPriceText({ vendorId: 'meituan', id: 'meituan/longcat-2.0' }, 'inputPerMTok'), '¥2（限时价）');
  assert.equal(worldPriceText({ vendorId: 'zhipuai', id: 'zhipuai/glm-4.6v-flash' }, 'outputPerMTok'), '免费');
  assert.equal(worldPriceText({ vendorId: 'xiaomi', id: 'xiaomi/mimo-v2.5-pro' }, 'inputPerMTok'), null, '已下线型号不显示旧价');
  assert.equal(worldPriceText({ vendorId: 'openai', id: 'openai/gpt-x', pricing: { inputPerMTok: 1.25 } }, 'inputPerMTok'), '$1.25');
});
