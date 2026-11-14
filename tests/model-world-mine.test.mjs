import test from 'node:test';
import assert from 'node:assert/strict';
import { channelOf, matchWorldModel, worldPriceOf, usageOf, usageCost, usageTokens, dayOf, dayShift, foldUsage, pruneLedger, usageWindow, mineItems, usedWorld, mineAdvice } from '../src/model-world-mine.js';

const world = (id, name, extra = {}) => ({ id, name, vendorId: id.split('/')[0], releaseDate: extra.date ?? '2026-09-01', releaseDatePrecision: 'day', pricing: { inputPerMTok: extra.input ?? 2, cachedInputPerMTok: extra.cached ?? null, outputPerMTok: extra.output ?? 10 }, efforts: extra.efforts ?? [], rating: { overall: extra.overall ?? null }, modalities: null });
const models = [
  world('deepseek/deepseek-v4.1-flash-1017', 'DeepSeek V4.1 Flash 1017', { date: '2026-10-17', overall: 45 }), world('deepseek/deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', { date: '2026-09-10' }), world('deepseek/deepseek-v4-pro-0813', 'DeepSeek V4 Pro 0813', { date: '2026-08-13', overall: 36 }),
  world('anthropic/claude-sonnet-5-5', 'Claude Sonnet 5.5', { overall: 56 }), world('openai/gpt-6.1-sol', 'GPT-6.1 Sol', { overall: 52 }), world('openai/gpt-6.1-terra', 'GPT-6.1 Terra', { date: '2026-10-26' }), world('moonshotai/kimi-k3', 'Kimi K3'),
];

test('渠道只看接口地址的主机名：厂商自己的地址是官方，别的是转发站，本机地址是本机；DSH 自带的 DeepSeek 渠道算官方', () => {
  assert.deepEqual(channelOf('deepseek-account'), { kind: 'official', host: null });
  assert.deepEqual(channelOf('x', 'https://api.deepseek.com/v1'), { kind: 'official', host: 'api.deepseek.com' });
  assert.deepEqual(channelOf('x', 'https://relay.example.com/v1?key=abc'), { kind: 'relay', host: 'relay.example.com' }, '只留主机名，不带路径和参数');
  assert.equal(channelOf('ollama', 'http://localhost:11434/v1').kind, 'local'); assert.equal(channelOf('lan', 'http://192.168.1.8:8000').kind, 'local');
  assert.deepEqual(channelOf('x', '不是地址'), { kind: 'unknown', host: null }); assert.deepEqual(channelOf('x'), { kind: 'unknown', host: null });
});

test('把 DSH 里的型号对到模型世界：名字归一后精确对；别名取这一家最新的；带尾巴和日期的去掉再对；对不上返回空', () => {
  const match = id => matchWorldModel({ id, name: id }, models);
  assert.deepEqual(match('claude-sonnet-5.5'), { id: 'anthropic/claude-sonnet-5-5', exact: true }, '点和短横线不分');
  assert.deepEqual(match('anthropic/claude-sonnet-5-5-20260928'), { id: 'anthropic/claude-sonnet-5-5', exact: true });
  assert.deepEqual(match('gpt-6.1-sol-latest'), { id: 'openai/gpt-6.1-sol', exact: true });
  assert.deepEqual(match('deepseek-flash'), { id: 'deepseek/deepseek-v4.1-flash-1017', exact: false }, '不带版本号的别名取最新发布的');
  assert.deepEqual(match('deepseek-pro'), { id: 'deepseek/deepseek-v4-pro-0813', exact: false });
  assert.equal(match('qwen3.6:27b'), null); assert.equal(match('flash'), null, '只有一个词不猜');
  assert.deepEqual(matchWorldModel({ id: 'my-alias', name: 'Kimi K3' }, models), { id: 'moonshotai/kimi-k3', exact: true }, '显示名对得上也算');
});

test('花费按官网价估：海外用目录美元价，缓存命中按缓存价；国产没收录官网价的不估', () => {
  const usd = world('openai/x', 'X', { input: 2, cached: .2, output: 10 });
  assert.deepEqual(worldPriceOf(usd), { currency: 'USD', input: 2, cached: .2, output: 10 });
  assert.deepEqual(usageCost(usd, usageOf({ inputTokens: 1e6, outputTokens: 5e5, cacheReadTokens: 2e6 })), { currency: 'USD', amount: 2 + 5 + .4 });
  assert.equal(worldPriceOf(world('deepseek/not-listed', '没收录')), null, '国产没收录官网价的不拿美元价冒充');
  assert.equal(usageCost(null, usageOf({})), null);
  assert.deepEqual(usageOf({ uncachedInputTokens: 7, outputTokens: -1, cacheReadTokens: 'x' }, 0), { inputTokens: 7, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 0 });
});

test('账本按北京时间的日期记，按时间段取出每天合计和每个渠道型号的合计，只留最近的天数', () => {
  assert.equal(dayOf(Date.UTC(2026, 10, 12, 16, 30)), '2026-11-13', '北京时间比 UTC 早 8 小时'); assert.equal(dayShift('2026-11-01', -1), '2026-10-31');
  const ledger = { days: {} };
  foldUsage(ledger, '2026-11-10', 'a', 'm1', usageOf({ inputTokens: 100, outputTokens: 10 })); foldUsage(ledger, '2026-11-12', 'a', 'm1', usageOf({ inputTokens: 50 })); foldUsage(ledger, '2026-11-12', 'b', 'm2', usageOf({ outputTokens: 500 }));
  const window = usageWindow(ledger, '2026-11-11', '2026-11-12');
  assert.deepEqual(window.days.map(day => [day.day, usageTokens(day), day.calls]), [['2026-11-11', 0, 0], ['2026-11-12', 550, 2]]);
  assert.deepEqual(window.rows.map(row => [row.provider, row.model, usageTokens(row)]), [['b', 'm2', 500], ['a', 'm1', 50]], '用得多的在前，窗口外的不算');
  pruneLedger(ledger, '2026-11-12', 1); assert.deepEqual(Object.keys(ledger.days), ['2026-11-12']);
});

test('摊平目录：手动对应优先于按名字对；账本里的渠道型号先按配好的那一项对，配置删了的再按名字对一次', () => {
  const mine = { defaultModel: { provider: 'p', model: 'deepseek-flash' }, mapping: { 'p\nmy-local': 'moonshotai/kimi-k3' }, groups: [{ id: 'p', name: '渠道', kind: 'relay', host: 'h', models: [{ id: 'deepseek-flash', name: 'deepseek-flash', efforts: [], defaultEffort: null }, { id: 'my-local', name: 'my-local', efforts: [], defaultEffort: null }, { id: 'unknown-9', name: 'unknown-9', efforts: [], defaultEffort: null }] }] };
  const items = mineItems(mine, models);
  assert.deepEqual(items.map(item => [item.model, item.world?.id ?? null, item.mapped, item.exact, item.isDefault]), [['deepseek-flash', 'deepseek/deepseek-v4.1-flash-1017', false, false, true], ['my-local', 'moonshotai/kimi-k3', true, true, false], ['unknown-9', null, false, false, false]]);
  assert.equal(usedWorld({ provider: 'p', model: 'my-local' }, items, models).id, 'moonshotai/kimi-k3');
  assert.equal(usedWorld({ provider: 'gone', model: 'gpt-6.1-sol' }, items, models).id, 'openai/gpt-6.1-sol');
  assert.equal(usedWorld({ provider: 'gone', model: 'nothing' }, items, models), null);
});

test('可以试试：同家更划算的、这一家新出的、开低一档就够的', () => {
  const sol = world('openai/sol', 'Sol', { overall: 52, date: '2026-06-01', efforts: [{ effort: 'max', index: 52, cost: 100 }, { effort: 'high', index: 51, cost: 40 }, { effort: 'low', index: 30, cost: 5 }] });
  const fresh = world('openai/next', 'Next', { date: '2026-11-01' }), old = world('openai/old', 'Old', { date: '2026-01-01' });
  const tips = mineAdvice([{ world: sol }, { world: null }], [sol, fresh, old], '2026-11-12');
  assert.deepEqual(tips.map(tip => tip.kind), ['newer', 'effort']);
  assert.deepEqual(tips[0], { kind: 'newer', id: 'newer:openai/next', model: 'openai/next', vendorId: 'openai' }, '60 天内的新型号才提');
  assert.deepEqual([tips[1].effort, tips[1].top, tips[1].saving], ['high', 'max', 60]);
  const strong = world('openai/strong', 'Strong', { overall: 60, output: 4, date: '2026-01-01' }), weak = world('openai/weak', 'Weak', { overall: 50, output: 10, date: '2026-01-01' });
  assert.deepEqual(mineAdvice([{ world: weak }, { world: strong }], [weak, strong], '2026-11-12'), [{ kind: 'pricier', id: 'pricier:openai/weak', model: 'openai/weak', instead: 'openai/strong', times: 2.5 }]);
});
