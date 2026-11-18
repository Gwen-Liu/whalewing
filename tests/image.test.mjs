import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyImage, imageDefinition, imageRequest, imageModels, rankImageModels, isImageModel, imageToolName } from '../features/experts/image.js';

// 一张 1×1 的 PNG，当作接口返回的图。
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const secret = 'sk-test-不应出现在结果里';

/** 假的 DSH：一条 OpenAI 兼容的中转渠道（带生图模型）、一条 Anthropic 渠道、一条 OpenAI 官方目录渠道、一条 ChatGPT 登录渠道。 */
async function setup(t, { mode = 'workspace-write', approval = 'allowed-once', providers, models, key = secret } = {}) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-image-'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const calls = [], approvals = [], reads = [];
  const listed = providers ?? [{ id: 'relay', name: '中转站' }, { id: 'claude', name: 'Claude' }, { id: 'openai', name: 'OpenAI' }, { id: 'openai-codex', name: 'ChatGPT' }];
  const catalog = models ?? {
    relay: ['gpt-6-astra', 'gpt-image-2', 'gpt-image-2.6-flare', 'gpt-image-2.6', 'gpt-image-2.5'],
    claude: ['claude-image-test'],
    openai: ['gpt-6', 'gpt-image-2'],
    'openai-codex': ['gpt-image-2'],
  };
  const services = {
    llm: {
      listProviders: () => listed,
      listModels: async id => (catalog[id] ?? []).map(model => ({ id: model, name: model })),
      listConfigurableProviders: () => [
        { provider: 'relay', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'relay'] },
        { provider: 'claude', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'claude'] },
        { provider: 'openai', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'], defaultBaseURL: 'https://api.openai.com/v1', nativeAuth: { env: ['OPENAI_API_KEY'], oauth: false } },
        { provider: 'openai-codex', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai-codex'], defaultBaseURL: 'https://chatgpt.com/backend-api', nativeAuth: { env: [], oauth: true } },
      ],
    },
    // DSH 的设置服务只有 describe()：每一节一项，value 是这一节能在设置页改的配置。
    settings: { describe: () => [{ ns: 'ui-settings', value: {} }, { ns: 'llm-pi-ai', value: { providers: {
      relay: { apiKeyEnv: 'RELAY_API_KEY', api: 'openai-completions', baseURL: 'https://relay.example/', headers: { 'x-team': 'ww' } },
      claude: { apiKeyEnv: 'CLAUDE_KEY', api: 'anthropic-messages', baseURL: 'https://claude.example' },
    } } }] },
    credentials: { resolve: async name => (name === 'RELAY_API_KEY' && key ? { value: key, source: 'store' } : undefined) },
    approval: { request: async request => { approvals.push(request); return approval; } },
    fs: {
      resolve: async (file, { cwd: base }) => ({ path: path.resolve(base, file) }),
      readBytes: async (target, _signal, max) => { reads.push({ file: target.path, max }); return fs.readFile(target.path); },
    },
    workingDirectory: { ensure: async () => cwd },
    sandboxPolicy: { resolve: () => ({ mode }) },
  };
  let reply = () => new Response(JSON.stringify({ created: 1, output_format: 'png', size: '1024x1024', quality: 'low', data: [{ b64_json: pixel, revised_prompt: '一只小蓝鲸' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const fetch = async (url, init = {}) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined }); return reply(url, init); };
  const now = () => new Date('2026-11-17T08:30:05Z');
  const tool = imageDefinition(services, { fetch, now });
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'fixture' } }, callId: 'call-1' };
  const run = async args => JSON.parse(await tool.execute(args, exec));
  return { cwd, calls, approvals, reads, services, tool, exec, run, setReply: value => { reply = value; } };
}

test('认生图模型：只按名字认，默认挑 GPT Image 版本最高、不带后缀的', () => {
  assert.ok(['gpt-image-2', 'gpt-image-2.6-flare', 'dall-e-3', 'doubao-seedream-4', 'gemini-2.5-flash-image', 'qwen-image'].every(isImageModel));
  assert.ok(!['gpt-6-astra', 'claude-sonnet-5', 'imagination', 'deepseek-v4'].some(isImageModel));
  const ranked = rankImageModels(['gpt-image-2', 'gpt-image-2.6-flare', 'doubao-seedream-4', 'gpt-image-2.6', 'gpt-image-2.5', 'dall-e-3'].map(model => ({ provider: 'relay', model })));
  assert.deepEqual(ranked.map(item => item.model), ['gpt-image-2.6', 'gpt-image-2.6-flare', 'gpt-image-2.5', 'gpt-image-2', 'dall-e-3', 'doubao-seedream-4']);
});

test('只列 OpenAI 兼容渠道里的生图模型：Anthropic 渠道和 ChatGPT 登录渠道不算', async t => {
  const { services } = await setup(t);
  const list = await imageModels(services);
  assert.deepEqual(list.map(item => `${item.provider}/${item.model}`), ['relay/gpt-image-2.6', 'relay/gpt-image-2.6-flare', 'relay/gpt-image-2.5', 'relay/gpt-image-2', 'openai/gpt-image-2'], '同名型号按渠道在 DSH 里的顺序');
});

test('参数先校验，不合规的不发请求', () => {
  assert.throws(() => imageRequest({ action: 'generate' }), /prompt 写要画什么/);
  assert.throws(() => imageRequest({ action: 'draw', prompt: 'x' }), /generate 或 models/);
  assert.throws(() => imageRequest({ action: 'generate', prompt: 'x', size: '大图' }), /size 写成/);
  assert.throws(() => imageRequest({ action: 'generate', prompt: 'x', quality: 'ultra' }), /quality 只能是/);
  assert.throws(() => imageRequest({ action: 'generate', prompt: 'x', images: ['a.png', 'b.png', 'c.png', 'd.png', 'e.png'] }), /最多 4 张/);
  assert.throws(() => imageRequest({ action: 'generate', prompt: 'x', images: ['a.gif'] }), /不是 PNG、JPG 或 WebP/);
  assert.throws(() => imageRequest({ action: 'generate', prompt: 'x', path: '封面.gif' }), /扩展名只能是/);
  assert.throws(() => imageRequest({ action: 'generate', prompt: 'x', path: '封面.jpg', format: 'png' }), /format 要写 jpeg/);
  assert.throws(() => imageRequest({ action: 'generate', prompt: 'x', apiKey: 'sk' }), /不接受这些字段/);
  assert.equal(imageRequest({ action: 'generate', prompt: 'x', path: '封面.jpg' }).format, 'jpeg', '文件名写了扩展名就按它存');
  assert.deepEqual(imageRequest({ action: 'models' }), { action: 'models' });
});

test('生图：用渠道配置的地址、key 和请求头调接口，图存进工作目录的“图片”文件夹，结果里没有 key', async t => {
  const { cwd, calls, approvals, run, tool } = await setup(t);
  assert.equal(tool.name, imageToolName);
  assert.equal(tool.timeoutMs, 600000, '高清图可能要几分钟，给足时间');
  const result = await run({ action: 'generate', prompt: '一只小蓝鲸', size: '1024x1024', quality: 'low' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://relay.example/images/generations', '地址末尾的斜杠不重复');
  assert.equal(calls[0].init.headers.authorization, `Bearer ${secret}`);
  assert.equal(calls[0].init.headers['x-team'], 'ww', '渠道自己配的请求头照带');
  assert.deepEqual(calls[0].body, { model: 'gpt-image-2.6', prompt: '一只小蓝鲸', n: 1, size: '1024x1024', quality: 'low' });
  assert.equal(result.model, 'relay/gpt-image-2.6');
  assert.equal(result.relative, '图片/20261117-163005.png', '按北京时间起名');
  assert.equal(result.revisedPrompt, '一只小蓝鲸');
  assert.match(result.next, /present/);
  assert.deepEqual(await fs.readFile(path.join(cwd, '图片', '20261117-163005.png')), Buffer.from(pixel, 'base64'));
  assert.equal(approvals.length, 0, '能写工作区的会话不用再批');
  assert.ok(!JSON.stringify(result).includes(secret));
  const again = await run({ action: 'generate', prompt: '再来一张' });
  assert.equal(again.relative, '图片/20261117-163005-2.png', '同名不覆盖');
});

test('指定模型、存放位置和格式；带参考图走改图接口，参考图经 DSH 的文件系统读', async t => {
  const { cwd, calls, reads, run } = await setup(t);
  await fs.writeFile(path.join(cwd, '参考.png'), Buffer.from(pixel, 'base64'));
  const result = await run({ action: 'generate', prompt: '照这张改成夜景', model: 'relay/gpt-image-2.5', images: ['参考.png'], path: '海报/夜景.webp' });
  assert.equal(calls[0].url, 'https://relay.example/images/edits');
  assert.equal(calls[0].body.model, 'gpt-image-2.5');
  assert.equal(calls[0].body.output_format, 'webp');
  assert.match(calls[0].body.images[0].image_url, /^data:image\/png;base64,/);
  assert.equal(reads[0].file, path.join(cwd, '参考.png'));
  assert.equal(result.relative, '海报/夜景.webp');
  // 只写型号也认；写明渠道时型号不在列表里也照发，由接口回答行不行。
  assert.equal((await run({ action: 'generate', prompt: 'x', model: 'gpt-image-2' })).model, 'relay/gpt-image-2');
  assert.equal((await run({ action: 'generate', prompt: 'x', model: 'relay/gpt-image-9' })).model, 'relay/gpt-image-9');
  await assert.rejects(run({ action: 'generate', prompt: 'x', model: 'gpt-image-9' }), /没有 gpt-image-9 这个生图模型。能用的有：relay\/gpt-image-2.6/);
  await assert.rejects(run({ action: 'generate', prompt: 'x', model: 'claude/claude-image-test' }), /不是 OpenAI 兼容的接口/);
  assert.equal(calls.length, 3, '认不出的模型不发请求');
});

test('存放位置出了工作目录就拒绝，而且在发请求之前', async t => {
  const { calls, run } = await setup(t);
  await assert.rejects(run({ action: 'generate', prompt: 'x', path: '../外面.png' }), { code: 'IMAGE_PATH' });
  await assert.rejects(run({ action: 'generate', prompt: 'x', path: path.join(os.tmpdir(), 'whalewing-image-外面.png') }), { code: 'IMAGE_PATH' });
  assert.equal(calls.length, 0);
});

test('只读权限的会话：存图前要员工点头，不批就不发请求', async t => {
  const { calls, approvals, run } = await setup(t, { mode: 'read-only', approval: 'rejected' });
  await assert.rejects(run({ action: 'generate', prompt: 'x' }), /rejected/);
  assert.equal(approvals.length, 1);
  assert.match(approvals[0].displayReason.zh, /workspace-write.*图片/);
  assert.equal(calls.length, 0);
});

test('接口给的是链接也能存；接口报错翻成员工看得懂的话', async t => {
  const { cwd, calls, run, setReply } = await setup(t);
  setReply(url => url.startsWith('https://cdn.example/')
    ? new Response(Buffer.from(pixel, 'base64'), { status: 200 })
    : new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/a.png' }] }), { status: 200 }));
  const result = await run({ action: 'generate', prompt: 'x' });
  assert.equal(calls[1].url, 'https://cdn.example/a.png');
  assert.deepEqual(await fs.readFile(path.join(cwd, result.relative)), Buffer.from(pixel, 'base64'));
  const cases = [
    [401, { error: { message: 'invalid api key' } }, /key 不对或没有生图权限（401）：invalid api key/],
    [404, 'Not Found', /不支持生图接口/],
    [429, { error: { message: 'quota exceeded' } }, /额度用完了/],
    [400, { error: { message: 'Your request was rejected by the safety system' } }, /拒绝了这个提示词/],
    [500, { error: { message: 'upstream down' } }, /生图没有成功（500）：upstream down/],
  ];
  for (const [status, body, message] of cases) {
    setReply(() => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
    await assert.rejects(run({ action: 'generate', prompt: 'x' }), message);
  }
  setReply(() => new Response(JSON.stringify({ data: [] }), { status: 200 }));
  await assert.rejects(run({ action: 'generate', prompt: 'x' }), /没有返回图片/);
});

test('别家的生图模型：Seedream、FLUX、Imagen、Gemini 出图都认得；DSH 自带的 xAI、Together、Google、OpenRouter 渠道也能接', async t => {
  assert.ok(['doubao-seedream-4-0-250828', 'black-forest-labs/FLUX.1-schnell', 'imagen-4.0-generate-001', 'google/gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'cogview-4', 'Kwai-Kolors/Kolors', 'grok-2-image', 'wanx2.1-t2i-turbo', 'nano-banana'].every(isImageModel));
  const { channelOf, imageMethod } = await import('../features/experts/image.js');
  const services = { llm: { listConfigurableProviders: () => [
    { provider: 'xai', defaultBaseURL: 'https://api.x.ai/v1', nativeAuth: { env: ['XAI_API_KEY'] } },
    { provider: 'google', defaultBaseURL: 'https://generativelanguage.googleapis.com/v1beta', nativeAuth: { env: ['GEMINI_API_KEY'] } },
    { provider: 'openrouter', defaultBaseURL: 'https://openrouter.ai/api/v1', nativeAuth: { env: ['OPENROUTER_API_KEY'] } },
    { provider: 'deepseek', defaultBaseURL: 'https://api.deepseek.com', nativeAuth: { env: ['DEEPSEEK_API_KEY'] } },
  ] }, settings: { describe: () => [] } };
  assert.equal(channelOf(services, 'xai').root, 'https://api.x.ai/v1');
  assert.equal(channelOf(services, 'google').root, 'https://generativelanguage.googleapis.com/v1beta/openai', 'Google 走它的 OpenAI 兼容地址');
  assert.equal(channelOf(services, 'deepseek').openai, false, '没有生图接口的渠道不算');
  assert.equal(imageMethod(channelOf(services, 'google'), 'imagen-4.0-generate-001'), 'images');
  assert.equal(imageMethod(channelOf(services, 'google'), 'gemini-2.5-flash-image'), 'chat');
  assert.equal(imageMethod(channelOf(services, 'openrouter'), 'black-forest-labs/flux-1.1-pro'), 'chat', 'OpenRouter 只有对话接口');
  assert.equal(imageMethod(channelOf(services, 'xai'), 'grok-2-image'), 'images');
});

test('对话接口出图：Gemini 出图模型走 /chat/completions，参考图放进消息，图从回复里取，按真实格式存', async t => {
  const { cwd, calls, run, setReply } = await setup(t, { models: { relay: ['gemini-2.5-flash-image'] }, providers: [{ id: 'relay', name: '中转站' }] });
  await fs.writeFile(path.join(cwd, '参考.png'), Buffer.from(pixel, 'base64'));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
  setReply(() => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '画好了', images: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` } }] } }] }), { status: 200 }));
  const result = await run({ action: 'generate', prompt: '照这张改成夜景', size: '1536x1024', images: ['参考.png'] });
  assert.equal(calls[0].url, 'https://relay.example/chat/completions');
  assert.deepEqual(calls[0].body.modalities, ['image', 'text']);
  assert.match(calls[0].body.messages[0].content[0].text, /照这张改成夜景[\s\S]*尺寸 1536x1024/);
  assert.match(calls[0].body.messages[0].content[1].image_url.url, /^data:image\/png;base64,/);
  assert.equal(result.relative, '图片/20261117-163005.jpg', '回的是 JPEG 就存成 .jpg');
  assert.deepEqual(await fs.readFile(path.join(cwd, result.relative)), jpeg);
  // 中转站常把图写成 Markdown 链接。
  setReply(url => url.startsWith('https://cdn.example/') ? new Response(Buffer.from(pixel, 'base64'), { status: 200 })
    : new Response(JSON.stringify({ choices: [{ message: { content: '好的 ![图](https://cdn.example/x.png)' } }] }), { status: 200 }));
  assert.equal((await run({ action: 'generate', prompt: 'x' })).relative, '图片/20261117-163005.png');
  setReply(() => new Response(JSON.stringify({ choices: [{ message: { content: '我画不了图' } }] }), { status: 200 }));
  await assert.rejects(run({ action: 'generate', prompt: 'x' }), /没有返回图片/);
});

test('百炼的万相、通义千问生图走原生异步任务：提交、查结果、下载存好；带参考图在发请求前就说不支持', async t => {
  const { cwd, services, exec } = await setup(t, { models: { relay: ['wanx2.1-t2i-turbo', 'qwen-image'] }, providers: [{ id: 'relay', name: '百炼' }] });
  services.settings.describe = () => [{ ns: 'llm-pi-ai', value: { providers: { relay: { apiKeyEnv: 'RELAY_API_KEY', api: 'openai-completions', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' } } } }];
  const calls = [];
  let polls = 0, finalStatus = 'SUCCEEDED';
  const fetch = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (url.startsWith('https://oss.example/')) return new Response(Buffer.from(pixel, 'base64'), { status: 200 });
    if (url.endsWith('/image-synthesis')) return new Response(JSON.stringify({ output: { task_id: 't-1', task_status: 'PENDING' } }), { status: 200 });
    polls += 1;
    if (polls < 2) return new Response(JSON.stringify({ output: { task_id: 't-1', task_status: 'RUNNING' } }), { status: 200 });
    return new Response(JSON.stringify(finalStatus === 'SUCCEEDED' ? { output: { task_status: 'SUCCEEDED', results: [{ url: 'https://oss.example/a.png', actual_prompt: '一只小蓝鲸，水彩' }] } } : { output: { task_status: 'FAILED', code: 'DataInspectionFailed', message: 'Input data may contain inappropriate content.' } }), { status: 200 });
  };
  const tool = imageDefinition(services, { fetch, now: () => new Date('2026-11-17T08:30:05Z'), sleep: async () => {} });
  const run = async args => JSON.parse(await tool.execute(args, exec));
  const result = await run({ action: 'generate', prompt: '一只小蓝鲸', model: 'wanx2.1-t2i-turbo', size: '1024x1024' });
  assert.equal(calls[0].url, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis');
  assert.equal(calls[0].init.headers['x-dashscope-async'], 'enable');
  assert.deepEqual(calls[0].body, { model: 'wanx2.1-t2i-turbo', input: { prompt: '一只小蓝鲸' }, parameters: { n: 1, size: '1024*1024' } });
  assert.equal(calls[1].url, 'https://dashscope.aliyuncs.com/api/v1/tasks/t-1', '提交后按任务号查结果');
  assert.equal(calls.length, 4, '提交、查两次、下载');
  assert.equal(result.relative, '图片/20261117-163005.png'); assert.equal(result.revisedPrompt, '一只小蓝鲸，水彩');
  assert.deepEqual(await fs.readFile(path.join(cwd, result.relative)), Buffer.from(pixel, 'base64'));
  polls = 1; finalStatus = 'FAILED';
  await assert.rejects(run({ action: 'generate', prompt: 'x', model: 'qwen-image' }), /拒绝了这个提示词/);
  await fs.writeFile(path.join(cwd, '参考.png'), Buffer.from(pixel, 'base64'));
  const before = calls.length;
  await assert.rejects(run({ action: 'generate', prompt: 'x', model: 'qwen-image', images: ['参考.png'] }), /不支持带参考图改图/);
  assert.equal(calls.length, before, '不支持的请求不发');
});

test('生图接口回的是 images 列表（硅基流动这类）也能存', async t => {
  const { cwd, run, setReply } = await setup(t, { models: { relay: ['Kwai-Kolors/Kolors'] }, providers: [{ id: 'relay', name: '中转站' }] });
  setReply(url => url.startsWith('https://cdn.example/') ? new Response(Buffer.from(pixel, 'base64'), { status: 200 }) : new Response(JSON.stringify({ images: [{ url: 'https://cdn.example/k.png' }] }), { status: 200 }));
  const result = await run({ action: 'generate', prompt: 'x' });
  assert.deepEqual(await fs.readFile(path.join(cwd, result.relative)), Buffer.from(pixel, 'base64'));
});

test('没配 key、没有生图模型时说清楚怎么补', async t => {
  const noKey = await setup(t, { key: null });
  await assert.rejects(noKey.run({ action: 'generate', prompt: 'x' }), /渠道 relay 没有配 key/);
  assert.equal(noKey.calls.length, 0);
  const none = await setup(t, { models: { relay: ['gpt-6-astra'] }, providers: [{ id: 'relay', name: '中转站' }] });
  await assert.rejects(none.run({ action: 'generate', prompt: 'x' }), /还没有生图模型.*gpt-image-2/);
  assert.deepEqual(await none.run({ action: 'models' }), { models: [], default: null });
  const some = await setup(t);
  assert.deepEqual((await some.run({ action: 'models' })).default, 'relay/gpt-image-2.6');
});

test('DSH 里没有生图模型时工具不出现，有了才出现', async t => {
  const { services } = await setup(t);
  const registered = [];
  let models = ['gpt-6-astra'];
  services.llm.listModels = async () => models.map(id => ({ id, name: id }));
  services.llm.listProviders = () => [{ id: 'relay', name: '中转站' }];
  const ctx = { get: key => services[key], fs: services.fs, workingDirectory: services.workingDirectory, sandboxPolicy: services.sandboxPolicy, tools: { register: (definition, options) => registered.push({ definition, options }) } };
  applyImage(ctx);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].definition.name, imageToolName);
  const when = registered[0].options.when;
  assert.equal(await when({ signal: new AbortController().signal }), false);
  models = ['gpt-image-2'];
  assert.equal(await when({ signal: new AbortController().signal }), false, '30 秒内用上次的结果');
  const realNow = Date.now;
  Date.now = () => realNow() + 31000;
  try { assert.equal(await when({ signal: new AbortController().signal }), true); } finally { Date.now = realNow; }
});

test('渠道配置从 DSH 设置的 describe() 里读：按渠道目录给的位置找，列不出目录时读 pi-ai 一节；读不到、出错都当没有', async () => {
  const { providerProfiles, providerProfile } = await import('../src/llm-profiles.js');
  const sections = [{ ns: 'other', value: { providers: { x: { baseURL: 'https://wrong.example' } } } }, { ns: 'llm-pi-ai', value: { providers: { relay: { baseURL: 'https://relay.example', apiKeyEnv: 'K' }, extra: { baseURL: 'https://extra.example' } } } }];
  let asked;
  const settings = { describe: options => { asked = options; return sections; } };
  const llm = { listConfigurableProviders: () => [{ provider: 'relay', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'relay'] }, { provider: 'openai', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'] }] };
  const all = providerProfiles({ settings, llm }, { redactSecrets: true });
  assert.deepEqual([...all.keys()], ['relay', 'extra'], '没写配置的目录渠道不算，pi-ai 一节里写了的都读出来');
  assert.deepEqual(asked, { redactSecrets: true });
  assert.equal(providerProfile({ settings, llm }, 'relay').baseURL, 'https://relay.example');
  assert.deepEqual(providerProfile({ settings, llm }, 'openai'), {});
  assert.deepEqual([...providerProfiles({ settings, llm: { listConfigurableProviders() { throw new Error('没有'); } } }).keys()], ['relay', 'extra']);
  assert.equal(providerProfiles({ settings: { describe() { throw new Error('坏了'); } }, llm }).size, 0);
  assert.equal(providerProfiles({ settings: { get: () => ({ providers: { relay: {} } }) }, llm }).size, 0, 'DSH 的设置服务没有 get，不靠它');
});
