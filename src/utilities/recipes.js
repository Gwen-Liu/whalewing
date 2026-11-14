/**
 * 办公工坊“最近做过”（2026-11-14 用户定做）：做好的一单记下做法——哪几步功能项、每步的设置、文件怎么一步步往下传；
 * 换上新文件照原样再做一遍，直接交给功能项，不经过小鲸、不花 token。
 * 只记做法和上次用的文件名、类型，不记文件内容；存在这台电脑上（浏览器本地存储），最多记 6 件。
 *
 * 文件怎么对上上次的：
 * - 上次的原文件只喂给同一步、这一步本来就能一次处理多个（合并 PDF、批量转图片格式）：这次放几个都行，整批交给这一步；
 * - 这次放的个数和上次一样：按顺序一一对上（比如核对两张表：第一个对主表、第二个对查找表）；
 * - 上次只用了一个文件、这次放了几个：每个文件照这个做法各做一遍；
 * - 别的情况说清要几个、按什么顺序。
 * 要框位置的（打码、去水印）和按上次文件的页面排的（页面整理）换了文件对不上，不记；不用文件的（做二维码）也不记。
 */
import { modelFunctions } from './model-specs.js';

export const recentKey = 'whalewing.toolbox.recent.v1';
export const recentLimit = 6;
export const replayLimit = 20;
const imageTypes = new Set(['png', 'jpg', 'webp', 'gif', 'bmp', 'avif', 'ico']);
const family = type => imageTypes.has(type) ? 'image' : type;
const familyName = name => ({ image: '图片', pdf: 'PDF', xlsx: 'Excel', csv: 'CSV', docx: 'Word', pptx: 'PPT', txt: 'TXT', json: 'JSON' })[name] || String(name).toUpperCase();
// 按上次那个文件的页面排的设置，换了文件就对不上。
const fileSpecific = new Set(['pdf-pages']);
const multiple = tool => /到 20|以上/.test(modelFunctions[tool]?.inputs ?? '');
const clip = (text, size) => { const chars = [...String(text ?? '')]; return chars.length > size ? `${chars.slice(0, size).join('')}…` : chars.join(''); };

/** 从做好的一单里取出做法；取不出（没做完、要框位置、不用文件）时是 null。titleOf 把功能项编号换成名字。 */
export function recipeOf(turn, { titleOf = id => id, now = Date.now() } = {}) {
  const steps = turn?.steps ?? [];
  if (!steps.length || steps.some(step => step.state !== 'done' || !step.call || !step.result)) return null;
  if (steps.some(step => !modelFunctions[step.tool] || modelFunctions[step.tool].region || fileSpecific.has(step.tool))) return null;
  const produced = new Map(), slotOf = new Map(), slots = [];
  // 设置里写的文件编号（比如按关键列关联的主表、查找表）也换成“第几个原文件 / 第几步做出的第几个”。
  const encode = value => {
    if (typeof value === 'string') return slotOf.has(value) ? { $slot: slotOf.get(value) } : produced.has(value) ? { $from: produced.get(value) } : value;
    if (Array.isArray(value)) return value.map(encode);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
    return value;
  };
  const recipeSteps = steps.map((step, index) => {
    const inputs = (step.call.inputs ?? []).map(id => {
      if (produced.has(id)) return { from: produced.get(id) };
      if (!slotOf.has(id)) {
        const entry = turn.job?.files?.get?.(id);
        slotOf.set(id, slots.length);
        slots.push({ name: clip(entry?.name ?? id, 120), type: String(entry?.meta?.type || 'file') });
      }
      return { slot: slotOf.get(id) };
    });
    const options = encode(step.call.options ?? {});
    step.result.outputs.forEach((id, output) => produced.set(id, [index, output]));
    return { tool: step.tool, note: clip(step.note, 200), options, ...(typeof step.call.text === 'string' && step.call.text ? { text: step.call.text } : {}), inputs };
  });
  if (!slots.length) return null;
  const chain = recipeSteps.map(step => titleOf(step.tool)).join(' → ');
  const ask = String(turn.ask?.text ?? '').trim().replace(/\s+/g, ' ');
  return { id: `r${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: ask ? clip(ask, 40) : chain, chain, at: now, slots, steps: recipeSteps };
}

const signature = recipe => JSON.stringify([recipe.steps.map(({ tool, options, text, inputs }) => [tool, options, text ?? '', inputs]), recipe.slots.length]);
const valid = recipe => recipe && typeof recipe.id === 'string' && typeof recipe.title === 'string' && typeof recipe.chain === 'string' && Number.isFinite(recipe.at)
  && Array.isArray(recipe.slots) && recipe.slots.length > 0 && Array.isArray(recipe.steps) && recipe.steps.length > 0
  && recipe.steps.every(step => modelFunctions[step?.tool] && Array.isArray(step.inputs) && step.inputs.every(input => Number.isInteger(input?.slot) || Array.isArray(input?.from)));

/** 读本机记的做法；读不了（隐私模式、被清掉、内容坏了）就当没有。 */
export function readRecent(storage) {
  try { const list = JSON.parse(storage?.getItem(recentKey) || '[]'); return Array.isArray(list) ? list.filter(valid).slice(0, recentLimit) : []; }
  catch { return []; }
}
function write(storage, list) { try { storage?.setItem(recentKey, JSON.stringify(list)); } catch { /* 存不了就只在这次打开里有。 */ } return list; }
/** 记一件：同样的做法只留一条，最新的排前面。 */
export function saveRecent(storage, recipe) {
  const key = signature(recipe);
  return write(storage, [recipe, ...readRecent(storage).filter(item => item.id !== recipe.id && signature(item) !== key)].slice(0, recentLimit));
}
export function forgetRecent(storage, id) { return write(storage, readRecent(storage).filter(item => item.id !== id)); }

/** 上次的原文件只喂给同一步、这一步能一次处理多个：这次的文件整批交给它。 */
function batchStep(recipe) {
  const users = recipe.steps.filter(step => step.inputs.some(input => input.slot !== undefined));
  const only = users.length === 1 ? users[0] : null;
  const slotInOptions = JSON.stringify(recipe.steps.map(step => step.options)).includes('"$slot"');
  return only && only.inputs.every(input => input.slot !== undefined) && multiple(only.tool) && !slotInOptions ? only : null;
}

/** 抽屉里那一句：这次要放什么。 */
export function replayHint(recipe) {
  const n = recipe.slots.length;
  if (batchStep(recipe)) return '放进这次要处理的文件，可以一次放几个，照上次的做法一起做。';
  if (n === 1) return '放一个或几个文件，每个文件照上次的做法各做一遍。';
  return `放 ${n} 个文件，按顺序对应上次的：${recipe.slots.map(slot => `「${slot.name}」`).join('、')}。`;
}

/**
 * 这次放的文件怎么跑：{ runs: [{ batch: 文件[] } | { slots: 文件[] }] }，要跑几遍就几项；对不上时 { error }。
 * typeOf 按文件名认类型（和页面描述文件用的同一个）。
 */
export function planReplay(recipe, files, typeOf) {
  const n = recipe.slots.length, k = files.length;
  if (!k) return { error: '先放这次要处理的文件。' };
  if (k > replayLimit) return { error: `一次最多 ${replayLimit} 个文件。` };
  const allowed = new Set(recipe.slots.map(slot => family(slot.type)));
  const wrong = files.find(file => !allowed.has(family(typeOf(file.name))));
  if (wrong) return { error: `上次处理的是${[...allowed].map(familyName).join('、')}，「${wrong.name}」不是，换一个再试。` };
  if (batchStep(recipe)) return { runs: [{ batch: files }] };
  if (k === n) return { runs: [{ slots: files }] };
  if (n === 1) return { runs: files.map(file => ({ slots: [file] })) };
  return { error: `这件事要 ${n} 个文件，按顺序对应上次的：${recipe.slots.map(slot => `「${slot.name}」`).join('、')}；这次放了 ${k} 个。` };
}

/**
 * 第 index 步这次怎么调用：原文件换成这次的文件编号，前面步骤做出的换成这次做出的编号；设置里写的文件编号也一样换。
 * batch 是整批模式下这次所有文件的编号；slotIds 是一一对上时第几个原文件对应的编号；outputs[i] 是第 i 步这次做出的编号。
 */
export function stepCall(recipe, index, { batch, slotIds = [], outputs = [] }) {
  const step = recipe.steps[index];
  const from = ([at, output]) => {
    const id = outputs[at]?.[output];
    if (!id) throw new Error(`第 ${index + 1} 步要用第 ${at + 1} 步做出的第 ${output + 1} 个文件，这次没做出来`);
    return id;
  };
  const slot = n => { const id = batch ? batch[n] ?? batch[0] : slotIds[n]; if (!id) throw new Error('这次的文件和上次的对不上'); return id; };
  const decode = value => {
    if (Array.isArray(value)) return value.map(decode);
    if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 1 && Number.isInteger(value.$slot)) return slot(value.$slot);
      if (keys.length === 1 && Array.isArray(value.$from)) return from(value.$from);
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
    }
    return value;
  };
  const whole = batch && step.inputs.length > 0 && step.inputs.every(input => input.slot !== undefined);
  const inputs = whole ? [...batch] : step.inputs.map(input => input.slot !== undefined ? slot(input.slot) : from(input.from));
  return { inputs, options: decode(step.options ?? {}), ...(step.text ? { text: step.text } : {}) };
}

/** “今天 14:05”“昨天 09:30”“11月12日”，按北京时间。 */
export function whenText(at, now = Date.now()) {
  const zone = { timeZone: 'Asia/Shanghai' };
  const day = value => new Intl.DateTimeFormat('zh-CN', { ...zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  const time = new Intl.DateTimeFormat('zh-CN', { ...zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
  if (day(at) === day(now)) return `今天 ${time}`;
  if (day(at) === day(now - 86400000)) return `昨天 ${time}`;
  // 中文的月日格式各环境不一样（有的给“11/10”），自己拼。
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { ...zone, month: 'numeric', day: 'numeric' }).formatToParts(at).map(part => [part.type, part.value]));
  return `${parts.month}月${parts.day}日`;
}
