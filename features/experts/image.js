import path from 'node:path';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { approveEscalation } from '@deepseek-ai/dsh-sandbox';
import { providerProfile } from '../../src/llm-profiles.js';

/**
 * 鲸翼生图（2026-11-17 用户定：鲸翼自带生图工具）。DSH 本身没有生图工具，模型只会出文字；
 * 这里借 DSH 已经配好的模型渠道（接口地址和 key 都按 DSH 的渠道配置在后台取，不经过界面和模型），
 * 请求 OpenAI 兼容的生图接口（/images/generations，带参考图时 /images/edits），把图存进会话的工作目录，
 * 再由模型用 DSH 的 present 把文件交给员工。生图模型就是员工在 DSH 模型设置里给渠道加的型号（如 gpt-image-2），
 * 鲸翼不另设一套模型配置。渠道里没有生图模型时工具不出现，免得模型以为能画。
 * 不用 ChatGPT 登录凭证去调 ChatGPT 后端：那是没公开的内部接口，违反服务条款。
 */

export const imageToolName = 'whalewing_image';
export const imageLimits = Object.freeze({ prompt: 32000, references: 4, referenceBytes: 20 * 1024 * 1024, resultBytes: 64 * 1024 * 1024, timeoutMs: 10 * 60 * 1000 });
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

/** 型号名看得出是生图模型的：GPT Image、DALL·E 和中转站常见的几家；只按名字认，接口不支持时请求会如实报错。 */
const imagePattern = /gpt-image|chatgpt-image|dall-e|seedream|imagen|flux|cogview|wanx|kolors|qwen-image|hunyuan-image|recraft|ideogram|(^|[-_/.])image($|[-_/.])/i;
export const isImageModel = id => typeof id === 'string' && imagePattern.test(id);

/** 挑默认用哪个：GPT Image 优先，版本高的优先，同版本不带后缀的优先（gpt-image-2.6 先于 gpt-image-2.6-flare）。 */
export function rankImageModels(list) {
  const score = item => {
    const match = /gpt-image-(\d+)(?:[.-](\d+))?(.*)$/i.exec(item.model);
    if (!match) return [/gpt-image|dall-e/i.test(item.model) ? 1 : 0, 0, 0];
    return [2, Number(match[1]) + Number(match[2] ?? 0) / 100, match[3] ? 0 : 1];
  };
  return [...list].sort((a, b) => {
    const [x, y] = [score(a), score(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return a.provider === b.provider ? a.model.localeCompare(b.model) : 0;
  });
}

/** 渠道的配置：接口地址、协议、key 名和自定义请求头，都从 DSH 的渠道设置里读（见 src/llm-profiles.js），只在 Host 里用。 */
export function channelOf(services, provider) {
  let info;
  try { info = (services.llm?.listConfigurableProviders?.() ?? []).find(item => item?.provider === provider); } catch { info = undefined; }
  const profile = providerProfile(services, provider);
  const api = typeof profile.api === 'string' ? profile.api : null;
  const baseURL = typeof profile.baseURL === 'string' && profile.baseURL ? profile.baseURL : info?.defaultBaseURL ?? null;
  // 只认 OpenAI 兼容的渠道：自己声明了 openai 协议的中转站，或者 OpenAI 官方渠道。用 ChatGPT 账号登录的渠道不算。
  const openai = api ? /^openai-(completions|responses)$/.test(api) : provider === 'openai';
  const keys = typeof profile.apiKeyEnv === 'string' && profile.apiKeyEnv ? [profile.apiKeyEnv] : [...(info?.nativeAuth?.env ?? [])];
  const headers = profile.headers && typeof profile.headers === 'object' ? Object.fromEntries(Object.entries(profile.headers).filter(([, value]) => typeof value === 'string')) : {};
  return { provider, api, baseURL, openai, keys, headers };
}

/** DSH 里配好的、能走生图接口的生图模型。 */
export async function imageModels(services, signal) {
  const { llm } = services;
  const out = [];
  for (const provider of llm?.listProviders?.() ?? []) {
    signal?.throwIfAborted();
    const channel = channelOf(services, provider.id);
    if (!channel.openai || !channel.baseURL) continue;
    let models = [];
    try { models = await llm.listModels(provider.id); } catch { continue; }
    for (const model of models) if (isImageModel(model?.id)) out.push({ provider: provider.id, providerName: provider.name || provider.id, model: model.id, name: model.name || model.id });
  }
  return rankImageModels(out);
}

/** 员工说了用哪个就用哪个（“渠道/型号”或只写型号），没说就用排第一的。 */
export async function pickImageModel(services, wanted, signal) {
  const list = await imageModels(services, signal);
  const text = typeof wanted === 'string' ? wanted.trim() : '';
  if (!text) {
    if (!list.length) fail('IMAGE_NO_MODEL', 'DSH 的模型设置里还没有生图模型。请员工在 DSH 设置的“模型”里，给 OpenAI 兼容的渠道加上生图模型（比如 gpt-image-2），加好后再来');
    return list[0];
  }
  const slash = text.indexOf('/');
  const [provider, model] = slash > 0 ? [text.slice(0, slash), text.slice(slash + 1)] : [null, text];
  const hit = list.find(item => item.model === model && (!provider || item.provider === provider));
  if (hit) return hit;
  // 写明了渠道的，型号不在列表里也照发（中转站常有没列出来的型号），由接口回答行不行。
  if (provider) {
    const known = (services.llm?.listProviders?.() ?? []).find(item => item.id === provider);
    const channel = known && channelOf(services, provider);
    if (channel?.openai && channel.baseURL) return { provider, providerName: known.name || provider, model, name: model };
    fail('IMAGE_MODEL_MISSING', known ? `渠道 ${provider} 不是 OpenAI 兼容的接口，生不了图` : `DSH 里没有 ${provider} 这条渠道`);
  }
  fail('IMAGE_MODEL_MISSING', list.length ? `没有 ${model} 这个生图模型。能用的有：${list.map(item => `${item.provider}/${item.model}`).join('、')}` : 'DSH 的模型设置里还没有生图模型');
}

const sizePattern = /^(auto|\d{3,4}x\d{3,4})$/;
const enums = { quality: ['auto', 'low', 'medium', 'high'], background: ['auto', 'transparent', 'opaque'], format: ['png', 'jpeg', 'webp'] };
const mediaTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const extensionOf = format => (format === 'jpeg' ? '.jpg' : `.${format}`);

/** 调用参数先全部校验，不合规的直接告诉模型怎么改，不花钱发请求。 */
export function imageRequest(args) {
  if (Object.keys(args ?? {}).some(key => !['action', 'prompt', 'model', 'size', 'quality', 'background', 'format', 'images', 'path'].includes(key))) fail('IMAGE_INPUT', '生图不接受这些字段');
  if (args.action === 'models') return { action: 'models' };
  if (args.action !== 'generate') fail('IMAGE_INPUT', 'action 只能是 generate 或 models');
  const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
  if (!prompt) fail('IMAGE_INPUT', 'prompt 写要画什么');
  if (prompt.length > imageLimits.prompt) fail('IMAGE_INPUT', `prompt 超过 ${imageLimits.prompt} 字，请精简`);
  const pick = (key, list) => {
    if (args[key] === undefined) return undefined;
    if (!list.includes(args[key])) fail('IMAGE_INPUT', `${key} 只能是 ${list.join('、')}`);
    return args[key];
  };
  if (args.size !== undefined && (typeof args.size !== 'string' || !sizePattern.test(args.size))) fail('IMAGE_INPUT', 'size 写成 宽x高（如 1024x1024、1536x1024、1024x1536）或 auto');
  const images = args.images === undefined ? [] : args.images;
  if (!Array.isArray(images) || images.some(item => typeof item !== 'string' || !item.trim())) fail('IMAGE_INPUT', 'images 写参考图的路径列表');
  if (images.length > imageLimits.references) fail('IMAGE_INPUT', `参考图一次最多 ${imageLimits.references} 张`);
  for (const item of images) if (!mediaTypes[path.extname(item.trim()).toLowerCase()]) fail('IMAGE_INPUT', `参考图「${item}」不是 PNG、JPG 或 WebP`);
  const output = typeof args.path === 'string' && args.path.trim() ? args.path.trim() : undefined;
  const named = output && path.extname(output) ? path.extname(output).toLowerCase() : null;
  if (named && !mediaTypes[named]) fail('IMAGE_INPUT', 'path 的扩展名只能是 .png、.jpg 或 .webp');
  // 文件名写了扩展名就按它存，免得 PNG 的内容起个 .jpg 的名字。
  const implied = named ? mediaTypes[named].slice('image/'.length) : undefined;
  const format = pick('format', enums.format) ?? implied;
  if (implied && format !== implied) fail('IMAGE_INPUT', `path 是 ${named} 文件，format 要写 ${implied}，或者不写`);
  return {
    action: 'generate', prompt, model: typeof args.model === 'string' ? args.model : undefined,
    ...(args.size ? { size: args.size } : {}), ...(args.quality ? { quality: pick('quality', enums.quality) } : {}),
    ...(args.background ? { background: pick('background', enums.background) } : {}), ...(format ? { format } : {}),
    images: images.map(item => item.trim()), ...(output ? { path: output } : {}),
  };
}

/** 接口的报错翻成员工看得懂的话；不带 key，只留接口自己说的原因。 */
function failure(status, body) {
  let reason = '';
  try { const value = JSON.parse(body); reason = String(value?.error?.message ?? value?.message ?? ''); } catch { reason = body; }
  reason = reason.replace(/\s+/g, ' ').trim().slice(0, 300);
  const said = reason ? `：${reason}` : '';
  if (status === 401 || status === 403) fail('IMAGE_AUTH', `渠道的 key 不对或没有生图权限（${status}）${said}`);
  if (status === 404) fail('IMAGE_UNSUPPORTED', `这条渠道不支持生图接口，或者没有这个模型（404）${said}`);
  if (status === 429) fail('IMAGE_RATE', `请求太频繁或额度用完了（429）${said}`);
  if (/moderation|safety|content.?policy|违规|敏感/i.test(reason)) fail('IMAGE_REFUSED', `生图服务拒绝了这个提示词${said}。换个说法再试，不要绕过`);
  fail('IMAGE_FAILED', `生图没有成功（${status}）${said}`);
}

const stamp = (now, zone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}${parts.month}${parts.day}-${parts.hour === '24' ? '00' : parts.hour}${parts.minute}${parts.second}`;
};
const inside = (root, target) => { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); };

/**
 * 定好存到哪：没写 path 就放“图片”文件夹，按北京时间起名。发请求之前就查好，路径不对不白花钱。
 * 返回真实的文件夹和不带扩展名的文件名；扩展名等拿到图再定（员工没指定格式时按接口给的格式）。
 */
async function destination(cwd, wanted, now) {
  const root = path.resolve(cwd), name = stamp(now, 'Asia/Shanghai');
  const target = path.resolve(root, wanted ?? '图片');
  const file = path.extname(target) ? target : path.join(target, name);
  if (!inside(root, file)) fail('IMAGE_PATH', 'path 要在当前工作目录里面');
  await mkdir(path.dirname(file), { recursive: true });
  const [realRoot, realDir] = await Promise.all([realpath(root), realpath(path.dirname(file))]);
  if (!inside(realRoot, realDir)) fail('IMAGE_PATH', 'path 经过了指向工作目录外的链接，换一个文件夹');
  return { root: realRoot, dir: realDir, stem: path.basename(file, path.extname(file)) };
}

/** 写文件：同名不覆盖，往后加 -2、-3。 */
async function save(place, extension, bytes) {
  for (let attempt = 1; attempt <= 99; attempt++) {
    const file = path.join(place.dir, `${place.stem}${attempt === 1 ? '' : `-${attempt}`}${extension}`);
    try { await writeFile(file, bytes, { flag: 'wx' }); return file; } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  }
  fail('IMAGE_PATH', '同名文件太多了，换一个文件名');
}

/** 读参考图：走 DSH 的文件系统，读得到的范围和 DSH 自己的读文件工具一样。 */
async function reference(services, cwd, file, signal) {
  const target = await services.fs.resolve(file, { cwd, signal });
  const bytes = await services.fs.readBytes(target, signal, imageLimits.referenceBytes + 1);
  if (bytes.byteLength > imageLimits.referenceBytes) fail('IMAGE_INPUT', `参考图「${file}」超过 20 MB`);
  return `data:${mediaTypes[path.extname(file).toLowerCase()]};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** 拿到图片字节：接口给 base64 就直接解，给链接就下载（限大小）。 */
async function bytesOf(item, fetcher, signal) {
  if (typeof item?.b64_json === 'string' && item.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (typeof item?.url === 'string' && /^https?:\/\//.test(item.url)) {
    const response = await fetcher(item.url, { signal });
    if (!response.ok) fail('IMAGE_FAILED', `图片生成了，但下载没成功（${response.status}）`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > imageLimits.resultBytes) fail('IMAGE_FAILED', '生成的图片太大了');
    return bytes;
  }
  fail('IMAGE_FAILED', '生图接口没有返回图片');
}

/** 一次出一张：调接口、存文件，返回给模型的说明里写明存在哪、下一步用 present 交给员工。 */
export async function generateImage(services, request, exec, options = {}) {
  const fetcher = options.fetch ?? globalThis.fetch, now = options.now ?? (() => new Date());
  const agent = exec.agent;
  if (!agent) fail('IMAGE_NO_SESSION', '生图要在会话里用');
  const cwd = await services.workingDirectory.ensure(agent, exec.signal);
  const chosen = await pickImageModel(services, request.model, exec.signal);
  const channel = channelOf(services, chosen.provider);
  let key;
  for (const name of channel.keys) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    const hit = await services.credentials?.resolve?.(name);
    if (hit?.value) { key = hit.value; break; }
  }
  if (!key) fail('IMAGE_AUTH', `渠道 ${chosen.provider} 没有配 key，或者 key 是空的。请员工在 DSH 设置的“模型”里给这条渠道填上 key`);
  // 会话是只读权限时，往工作目录里存图要员工点头；能写工作区的会话直接存。
  const policy = services.sandboxPolicy.resolve({ session: agent.session });
  if (policy?.mode === 'read-only') {
    await approveEscalation({ requestedMode: 'workspace-write', effectiveMode: policy.mode, subject: '鲸翼生图', justification: `把生成的图片存进工作目录${request.path ? `（${request.path}）` : '的“图片”文件夹'}；只新建这一个文件，不改别的。` }, { approver: services.approval, agent, callId: exec.callId, toolName: imageToolName, signal: exec.signal });
  }
  const place = await destination(cwd, request.path, now());
  const images = [];
  for (const file of request.images) images.push(await reference(services, cwd, file, exec.signal));
  const body = {
    model: chosen.model, prompt: request.prompt, n: 1,
    ...(request.size ? { size: request.size } : {}), ...(request.quality ? { quality: request.quality } : {}),
    ...(request.background ? { background: request.background } : {}), ...(request.format ? { output_format: request.format } : {}),
    ...(images.length ? { images: images.map(url => ({ image_url: url })) } : {}),
  };
  const endpoint = `${channel.baseURL.replace(/\/+$/, '')}/images/${images.length ? 'edits' : 'generations'}`;
  const started = Date.now();
  let response;
  try {
    response = await fetcher(endpoint, { method: 'POST', headers: { ...channel.headers, authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: exec.signal });
  } catch (error) {
    if (exec.signal.aborted) throw error;
    fail('IMAGE_NETWORK', `连不上渠道 ${chosen.provider} 的生图接口：${String(error?.message ?? error).slice(0, 200)}`);
  }
  const text = await response.text();
  if (!response.ok) failure(response.status, text);
  let value;
  try { value = JSON.parse(text); } catch { fail('IMAGE_FAILED', '生图接口返回的不是 JSON'); }
  const item = value?.data?.[0];
  const bytes = await bytesOf(item, fetcher, exec.signal);
  const format = request.format ?? (typeof value?.output_format === 'string' && enums.format.includes(value.output_format) ? value.output_format : 'png');
  const saved = await save(place, extensionOf(format), bytes);
  return {
    path: saved, relative: path.relative(place.root, saved).split(path.sep).join('/'), model: `${chosen.provider}/${chosen.model}`,
    ...(value?.size ? { size: value.size } : request.size ? { size: request.size } : {}), ...(value?.quality ? { quality: value.quality } : {}),
    seconds: Math.round((Date.now() - started) / 1000), bytes: bytes.byteLength,
    ...(typeof item?.revised_prompt === 'string' && item.revised_prompt ? { revisedPrompt: item.revised_prompt.slice(0, 2000) } : {}),
    next: '图已经存好。用 present 把这个文件交给员工；能看图的话先打开看一眼，文字错了、糊了就重新生成，不在原图上涂改。',
  };
}

const description = [
  '鲸翼生图：用 DSH 里配好的生图模型（如 GPT Image）画一张图，存进当前工作目录。',
  '只在员工要一张真的图片（插画、海报底图、照片风格的画面、封面）时用；每次调用都要花钱，一次一张，不要为了试试多画。',
  '中文字多、数字多、要排得很准的图，让它出无字底图，文字另用 HTML 排上去。',
  'generate：prompt 写完整的画面描述（主体、场景、风格、配色、构图、要不要文字）；带 images（工作目录里的参考图路径，最多 4 张）就是照着参考图改。',
  'models：列出能用的生图模型。员工指定了模型时，model 写“渠道/型号”或型号。',
  '画好后用 present 把文件交给员工。拒绝的提示词不要换着法子绕过。',
].join('');

export function imageDefinition(services, options = {}) {
  return defineTool({
    name: imageToolName, description, timeoutMs: imageLimits.timeoutMs,
    parameters: {
      action: { type: 'string', enum: ['generate', 'models'], required: true },
      prompt: { type: 'string', description: 'generate：画面描述，最长 32000 字。' },
      model: { type: 'string', description: '可选：员工指定的生图模型，写“渠道/型号”或型号；不写用默认的。' },
      size: { type: 'string', description: '可选：宽x高，常用 1024x1024（方图）、1536x1024（横图）、1024x1536（竖图），或 auto。' },
      quality: { type: 'string', enum: enums.quality, description: '可选：low 快且便宜，适合先出草图；high 慢且贵。' },
      background: { type: 'string', enum: enums.background, description: '可选：要透明底时写 transparent（配 png 或 webp）。' },
      format: { type: 'string', enum: enums.format, description: '可选：存成什么格式，默认 png。' },
      images: { type: 'array', items: { type: 'string' }, description: '可选：参考图路径（相对工作目录或绝对路径），最多 4 张，PNG、JPG 或 WebP。' },
      path: { type: 'string', description: '可选：存到工作目录里的哪个文件或文件夹；不写就存进“图片”文件夹，按时间起名。' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const request = imageRequest(args);
      if (request.action === 'models') {
        const list = await imageModels(services, exec.signal);
        return JSON.stringify({ models: list.map(item => ({ model: `${item.provider}/${item.model}`, name: item.name, channel: item.providerName })), default: list[0] ? `${list[0].provider}/${list[0].model}` : null });
      }
      return JSON.stringify(await generateImage(services, request, exec, options));
    },
    presentCall: args => ({ card: 'generic', title: args?.action === 'models' ? '查看生图模型' : '生成图片', kind: args?.action === 'models' ? 'read' : 'other', rawInput: args }),
  });
}

/**
 * 随专家功能注册与撤销。只在 DSH 里真有生图模型时出现；查不到（没配、读不出来）就不出现，也不报错。
 * 每一步都会问一次，30 秒内用上次的结果，免得每步都去列模型。
 */
export function applyImage(ctx, options = {}) {
  const services = {
    get llm() { return ctx.get('llm'); }, get settings() { return ctx.get('settings'); }, get credentials() { return ctx.get('credentials'); },
    get approval() { return ctx.get('approval'); }, fs: ctx.fs, workingDirectory: ctx.workingDirectory, sandboxPolicy: ctx.sandboxPolicy,
  };
  let cache = { at: 0, value: false };
  const available = async ({ signal } = {}) => {
    const now = Date.now();
    if (now - cache.at < 30000) return cache.value;
    let value = false;
    try { value = (await imageModels(services, signal)).length > 0; } catch { if (signal?.aborted) throw signal.reason; value = false; }
    cache = { at: Date.now(), value };
    return value;
  };
  ctx.tools.register(imageDefinition(services, options), { when: available });
}
