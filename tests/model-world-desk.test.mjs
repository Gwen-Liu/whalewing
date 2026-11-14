import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { ModelDesk } from '../features/model-world/desk.js';
import { modelWorldContract, deskLimits } from '../features/model-world/contract.js';
import { probeQuestion } from '../src/model-world-probe.js';

const contract = modelWorldContract(z);
const now = Date.UTC(2026, 10, 12, 4, 0), today = '2026-11-12';
const catalog = { default: { provider: 'direct', model: 'flash', reasoningEffort: 'high' }, failures: [{ id: 'bad', name: '坏渠道', message: '没登录' }], groups: [
  { id: 'direct', name: '直连', models: [{ id: 'flash', name: 'Flash', reasoning: { efforts: [{ id: 'high', name: '高' }], defaultEffort: 'high' } }] },
  { id: 'relay', name: '转发站', models: [{ id: 'sonnet', name: 'Sonnet' }] }] };

/** 一套假的 DSH 服务：记下谁被调用，模型流按给定的分片回放。 */
async function desk({ chunks, list = [] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-desk-')), calls = { saved: [], selected: [], prepared: [], prompts: [] };
  let current = { ...catalog.default };
  const services = () => ({
    sessionController: { modelCatalog: async () => catalog, list: async () => ({ items: list }), resolveAgent: async id => ({ agent: { model: { select: value => calls.selected.push([id, value]) } } }) },
    agentDefaultModel: { currentSelection: () => current, saveSelection: async value => { calls.saved.push(value); current = value; } },
    settings: { get: name => name === 'llm-pi-ai' ? { providers: { relay: { baseURL: 'https://relay.example.com/v1', apiKeyEnv: 'SECRET_NAME' }, direct: { baseURL: 'https://api.deepseek.com' } } } : undefined },
    llm: { listConfigurableProviders: () => [], async prepareCall(config) { calls.prepared.push(config); return { config, async *stream(options) { calls.prompts.push(options.messages[0].content[0].text); for (const chunk of typeof chunks === 'function' ? chunks(config, options) : chunks ?? []) yield chunk; } }; } },
  });
  const make = () => new ModelDesk({ root, services, stored: contract.desk.stored, now: () => now, flushMs: 60000 });
  const instance = make();
  const run = async (target, input) => contract.desk.result.parse({ action: input.action, ...await target.execute(contract.desk.input.parse(input), AbortSignal.timeout(5000)) });
  return { root, calls, desk: instance, make, run: input => run(instance, input), runOn: run, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}
const reply = (text, usage = { inputTokens: 40, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 60 }) => [{ type: 'text-delta', index: 0, text }, { type: 'usage', usage }, { type: 'finish', reason: { kind: 'stop' } }];
const session = id => ({ id });

test('读配好的模型：渠道、型号、思考档位和默认模型照 DSH 的目录给；渠道按接口地址分官方和转发站，不带出 Key 的名字', async () => {
  const d = await desk(); const mine = await d.run({ action: 'mine' });
  assert.deepEqual(mine.supported, { catalog: true, setDefault: true, probe: true, selectModel: true });
  assert.deepEqual(mine.defaultModel, { provider: 'direct', model: 'flash', effort: 'high' });
  assert.deepEqual(mine.groups.map(group => [group.id, group.kind, group.host, group.models.map(model => [model.id, model.defaultEffort])]), [['direct', 'official', 'api.deepseek.com', [['flash', 'high']]], ['relay', 'relay', 'relay.example.com', [['sonnet', null]]]]);
  assert.deepEqual(mine.issues, ['坏渠道：没登录']); assert.equal(JSON.stringify(mine).includes('SECRET_NAME'), false);
  await d.cleanup();
});

test('用量逐次记：会话报出渠道和型号后，每条模型回复记一笔到当天；退出前落盘，下次读回；读不懂的事件不影响会话', async () => {
  const d = await desk(); await d.desk.load();
  const chat = session('s1');
  d.desk.observe(chat, { type: 'assistant/message', data: { usage: { inputTokens: 9 } } });
  d.desk.observe(chat, { type: 'request/header', data: { header: { config: { provider: 'direct', model: 'flash' } } } });
  d.desk.observe(chat, { type: 'assistant/message', data: { usage: { inputTokens: 100, outputTokens: 30, cacheReadTokens: 500, cacheWriteTokens: 0 } } });
  d.desk.observe(chat, { type: 'request/context', data: { provider: 'relay', model: 'sonnet' } });
  d.desk.observe(chat, { type: 'assistant/message', data: { usage: { inputTokens: 7, outputTokens: 3 } } });
  d.desk.observe(chat, null); d.desk.observe(chat, { type: 'assistant/message', data: {} });
  const usage = await d.run({ action: 'usage', days: 2 });
  assert.equal(usage.today, today); assert.equal(usage.since, today);
  assert.deepEqual(usage.days.map(day => [day.day, day.inputTokens, day.calls]), [['2026-11-11', 0, 0], [today, 107, 2]], '没报渠道之前的那条不记');
  assert.deepEqual(usage.rows.map(row => [row.provider, row.model, row.cacheReadTokens, row.calls]), [['direct', 'flash', 500, 1], ['relay', 'sonnet', 0, 1]]);
  await d.desk.dispose();
  const again = d.make(); assert.deepEqual((await d.runOn(again, { action: 'usage', days: 1 })).rows.length, 2, '落盘后重开读得回');
  assert.deepEqual((await d.runOn(again, { action: 'mine' })).used.map(row => [row.provider, row.model, row.calls, row.lastDay]), [['direct', 'flash', 1, today], ['relay', 'sonnet', 1, today]]);
  await d.cleanup();
});

test('装这一版之前的用量按会话累计数补记一次：归到会话最后活动那天和最后用的型号，本次启动后已逐次记的部分扣掉', async () => {
  const list = [
    { sessionId: 's1', updatedAt: Date.UTC(2026, 10, 10, 20, 0), projections: { values: { modelSelection: { lastUsed: { provider: 'direct', model: 'flash' } }, tokenUsage: { uncachedInputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 } } } },
    { sessionId: 's2', updatedAt: '2026-11-01T02:00:00.000Z', projections: { values: { modelSelection: { lastUsed: { provider: 'relay', model: 'sonnet' } }, tokenUsage: { uncachedInputTokens: 50, outputTokens: 5 } } } },
    { sessionId: 's3', updatedAt: 1, projections: { values: {} } }];
  const d = await desk({ list }); await d.desk.load();
  const live = session('s1');
  d.desk.observe(live, { type: 'request/header', data: { header: { config: { provider: 'direct', model: 'flash' } } } });
  d.desk.observe(live, { type: 'assistant/message', data: { usage: { inputTokens: 300, outputTokens: 0 } } });
  const usage = await d.run({ action: 'usage', days: 30 });
  assert.equal(usage.backfilled, true);
  const by = Object.fromEntries(usage.days.filter(day => day.inputTokens).map(day => [day.day, day.inputTokens]));
  assert.deepEqual(by, { '2026-11-01': 50, '2026-11-11': 700, [today]: 300 }, '北京时间 11-11 04:00 的会话补 1000 − 300，今天的 300 是逐次记的');
  assert.equal((await d.run({ action: 'usage', days: 30 })).days.reduce((sum, day) => sum + day.inputTokens, 0), 1050, '再问不重复补记');
  await d.cleanup();
});

test('改默认模型和给会话选模型：目标必须在 DSH 目录里；改默认走默认模型服务，给会话选模型只动这个会话', async () => {
  const d = await desk();
  assert.deepEqual(await d.run({ action: 'setDefault', provider: 'relay', model: 'sonnet' }), { action: 'setDefault', defaultModel: { provider: 'relay', model: 'sonnet' } });
  assert.deepEqual(d.calls.saved, [{ provider: 'relay', model: 'sonnet' }]);
  await assert.rejects(d.run({ action: 'setDefault', provider: 'relay', model: 'gone' }), { code: 'DESK_MODEL_MISSING' });
  await assert.rejects(d.run({ action: 'setDefault', provider: 'relay', model: 'sonnet', effort: 'max' }), { code: 'DESK_MODEL_MISSING' }, '这个型号没有的思考档位不收');
  assert.deepEqual(await d.run({ action: 'selectModel', sessionId: 'abc', provider: 'direct', model: 'flash', effort: 'high' }), { action: 'selectModel', sessionId: 'abc', selected: { provider: 'direct', model: 'flash', effort: 'high' } });
  assert.deepEqual(d.calls.selected, [['abc', { provider: 'direct', model: 'flash', reasoningEffort: 'high' }]]); assert.equal(d.calls.saved.length, 1, '给会话选模型不改默认');
  await d.cleanup();
});

test('手动对应只记在鲸翼这边：存、取消都落盘', async () => {
  const d = await desk();
  assert.deepEqual((await d.run({ action: 'setMapping', provider: 'relay', model: 'x:7b', modelId: 'alibaba/qwen' })).mapping, { 'relay\nx:7b': 'alibaba/qwen' });
  assert.deepEqual((await d.runOn(d.make(), { action: 'mine' })).mapping, { 'relay\nx:7b': 'alibaba/qwen' });
  assert.deepEqual((await d.run({ action: 'setMapping', provider: 'relay', model: 'x:7b', modelId: null })).mapping, {});
  await d.cleanup();
});

test('模型测智直接调一次模型：发的是按种子现出的题，回答判分后记进这一轮；用量也记进账本；记录能回看、标最佳、删除', async () => {
  const question = probeQuestion('candy', 77);
  const d = await desk({ chunks: config => reply(config.model === 'flash' ? `推理……\n答案：${question.expect}` : '答案：999') });
  const input = { action: 'probe', runId: 'r-abc123', testId: 'candy', seed: 77, classic: false };
  const right = await d.run({ ...input, provider: 'direct', model: 'flash', effort: 'high' }), wrong = await d.run({ ...input, provider: 'relay', model: 'sonnet' });
  assert.deepEqual(d.calls.prepared, [{ provider: 'direct', model: 'flash', reasoningEffort: 'high' }, { provider: 'relay', model: 'sonnet' }]);
  assert.deepEqual(d.calls.prompts, [question.prompt, question.prompt], '两个模型答同一道现出的题');
  assert.deepEqual([right.grade.pass, right.grade.answer, right.finish, right.error, right.usage.outputTokens], [true, question.expect, 'stop', null, 20]);
  assert.deepEqual([wrong.grade.pass, wrong.grade.expect], [false, question.expect]); assert.match(wrong.grade.note, /正确答案是/);
  assert.deepEqual((await d.run({ action: 'usage', days: 1 })).rows.map(row => [row.provider, row.calls, row.outputTokens]), [['direct', 1, 20], ['relay', 1, 20]], '测智不走会话，用量由这里补记');
  const runs = (await d.run({ action: 'probes' })).runs;
  assert.deepEqual(runs.map(run => [run.runId, run.records.length, run.records.some(record => 'reply' in record)]), [['r-abc123', 2, false]], '摘要里不带回答原文');
  assert.deepEqual((await d.run({ action: 'probeRun', runId: 'r-abc123' })).records.map(record => record.reply), [`推理……\n答案：${question.expect}`, '答案：999']);
  assert.deepEqual((await d.run({ action: 'probeStar', runId: 'r-abc123', row: 'candy|0', key: 'direct\nflash' })).stars, { 'candy|0': 'direct\nflash' });
  assert.deepEqual((await d.runOn(d.make(), { action: 'probes' })).runs[0].stars, { 'candy|0': 'direct\nflash' }, '重开读得回');
  assert.deepEqual((await d.run({ action: 'probeDelete', runId: 'r-abc123' })).runs, []);
  await assert.rejects(fs.stat(path.join(d.root, 'probes', 'r-abc123.json')), { code: 'ENOENT' }, '回答原文一起删');
  await assert.rejects(d.run({ action: 'probeRun', runId: 'r-abc123' }), { code: 'DESK_RUN_MISSING' });
  await d.cleanup();
});

test('模型没答完或调用失败记成这一格的结果，不让整轮失败；画图题发回别的图标成不像现做的', async () => {
  const failed = await desk({ chunks: [{ type: 'finish', reason: { kind: 'error', failure: { code: 'MISSING_CREDENTIAL', message: '没有 Key' } } }] });
  const record = await failed.run({ action: 'probe', runId: 'r-fail01', testId: 'decimal', seed: 1, classic: false, provider: 'relay', model: 'sonnet' });
  assert.deepEqual([record.finish, record.grade.pass, record.usage], ['error', false, null]); assert.match(record.error, /MISSING_CREDENTIAL）：没有 Key/); assert.match(record.grade.note, /模型没有答完/);
  await failed.cleanup();
  const thrown = await desk({ chunks: () => { throw new Error('连不上'); } });
  assert.match((await thrown.run({ action: 'probe', runId: 'r-fail02', testId: 'decimal', seed: 1, classic: false, provider: 'relay', model: 'sonnet' })).error, /调用没有成功：连不上/);
  await thrown.cleanup();
  const canned = await desk({ chunks: reply('<svg viewBox="0 0 9 9"><circle r="2"/></svg>') });
  const drawn = await canned.run({ action: 'probe', runId: 'r-canned', testId: 'pelican', seed: 5, classic: false, provider: 'relay', model: 'sonnet' });
  assert.deepEqual([drawn.grade.made, drawn.grade.pass], [false, null]); assert.match(drawn.grade.note, /可能不是按这次的题现做的/);
  await canned.cleanup();
});

test('测智记录最多留三十轮，旧的连同回答一起删；账本文件读不懂时另存原文件、从空的开始，不覆盖', async () => {
  const d = await desk({ chunks: reply('答案：1') });
  for (let index = 0; index < deskLimits.runs + 2; index++) await d.run({ action: 'probe', runId: `r-many-${String(index).padStart(3, '0')}`, testId: 'strawberry', seed: index, classic: false, provider: 'relay', model: 'sonnet' });
  const runs = (await d.run({ action: 'probes' })).runs;
  assert.equal(runs.length, deskLimits.runs); assert.equal(runs[0].runId, `r-many-${String(deskLimits.runs + 1).padStart(3, '0')}`, '新的在前');
  assert.deepEqual((await fs.readdir(path.join(d.root, 'probes'))).length, deskLimits.runs);
  await d.desk.dispose();
  await fs.writeFile(path.join(d.root, 'desk.json'), '{"version":9,"oops":true}');
  const fresh = d.make(); assert.deepEqual((await d.runOn(fresh, { action: 'probes' })).runs, []);
  assert.ok((await fs.readdir(d.root)).some(name => /^desk\.unreadable-\d+\.json$/.test(name)), '原文件改名留着');
  await d.cleanup();
});
