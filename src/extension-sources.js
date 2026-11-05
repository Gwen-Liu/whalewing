import path from 'node:path';
import { z } from 'zod';
import { fail } from './vault.js';
import { parseAvatarData } from './avatar-image.js';

// 扩展给专家团队和知识搜索提供的内容只存在内存里，随扩展的登记一起撤销；鲸翼不替扩展保存一份。
const label = z.strictObject({ zh: z.string().trim().min(1).max(24), en: z.string().trim().min(1).max(40) });
const callable = message => z.custom(value => typeof value === 'function', message);
const localExpertId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '专家 id 只能用小写字母、数字和夹在中间的单个连字符').max(76);
const expertOptions = z.strictObject({ label, save: callable('save 必须是函数').optional() });
export const sourceExpertItem = z.strictObject({
  id: localExpertId, revision: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(40), description: z.string().trim().min(1).max(240), prompt: z.string().trim().min(1).max(32000),
  avatar: z.string().max(700000).nullable().optional(), skills: z.array(z.string().min(1).max(100)).max(40).optional(), readOnly: z.boolean().optional(),
});
const expertItems = z.array(sourceExpertItem).max(200);
// 助手名称会出现在按钮、标题和给模型的说明里：一行字，不带换行和控制字符。
const assistantName = z.string().trim().min(1, '不能为空').max(16, '最长 16 个字').refine(value => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value), '不能带换行或控制字符');

/** 来源笔记的本地路径：正斜杠分隔的相对 .md 路径，不带盘符、不回到上级。 */
export function sourceNotePath(value) {
  if (typeof value !== 'string' || !value || value.length > 230 || /[\\\0]/.test(value) || value.startsWith('/') || !/\.md$/i.test(value)) return false;
  return value.split('/').every(segment => segment && segment !== '.' && segment !== '..' && !/^[a-z]:$/i.test(segment));
}
const localNotePath = z.string().refine(sourceNotePath, '笔记路径须是正斜杠分隔的相对 .md 路径');
const knowledgeOptions = z.strictObject({ label, search: callable('search 必须是函数'), read: callable('read 必须是函数') });
const searchResult = z.strictObject({
  notes: z.array(z.strictObject({ path: localNotePath, title: z.string().max(200), excerpt: z.string().max(2000), hash: z.string().max(128) })).max(500),
  total: z.number().int().nonnegative(), truncated: z.boolean(),
});
const readResult = z.strictObject({ path: localNotePath, content: z.string(), hash: z.string().min(1).max(128), absolutePath: z.string().refine(path.isAbsolute, 'absolutePath 必须是绝对路径').optional() });

export const isSourceExpertId = id => typeof id === 'string' && id.includes('--');
export const isSourceNotePath = value => typeof value === 'string' && value.startsWith('@');

function input(schema, raw, what, code = 'EXTENSION_SOURCE_INPUT') {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) fail(code, `${what}不符合鲸翼扩展接口：${parsed.error.issues.map(issue => `${issue.path.join('.') || '整体'} ${issue.message}`).slice(0, 3).join('；')}`);
  return parsed.data;
}

/** 等扩展的结果，但调用方取消或超时就不再等；扩展迟到的拒绝不变成未处理的错误。 */
async function bounded(work, signal) {
  signal.throwIfAborted();
  const promise = Promise.resolve().then(work);
  promise.catch(() => {});
  let stop;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { stop = () => reject(signal.reason); signal.addEventListener('abort', stop, { once: true }); })]);
  } finally { signal.removeEventListener('abort', stop); }
}

/** 专家来源和知识来源：每个已登记的扩展功能各至多一个；助手名称同一时间只认一个扩展。登记都绑定扩展自己的作用域。 */
export class ExtensionSources {
  constructor(registry, { changed = () => {}, maxNoteBytes = 1048576, maxResults = 50 } = {}) {
    this.registry = registry; this.changed = changed; this.maxNoteBytes = maxNoteBytes; this.maxResults = maxResults;
    this.experts = new Map(); this.knowledge = new Map(); this.names = new Map(); this.closed = false;
  }

  dispose() {
    this.closed = true;
    for (const map of [this.experts, this.knowledge, this.names]) { for (const entry of map.values()) entry.closed = true; map.clear(); }
  }

  /** 登记还在、扩展没关：任何一项不成立都视为已撤销，顺手清掉。 */
  alive(map, entry) {
    const feature = entry?.feature;
    const ok = entry && !this.closed && !entry.closed && map.get(feature.id) === entry && this.registry.entries.get(feature.id) === feature && feature.fiber.uid !== null && ![3, 4, 5].includes(feature.fiber.state);
    if (!ok && entry) { entry.closed = true; if (map.get(feature.id) === entry) map.delete(feature.id); }
    return Boolean(ok);
  }

  register(map, kind, ctx, entry) {
    const previous = map.get(entry.feature.id);
    if (previous && this.alive(map, previous)) fail('EXTENSION_SOURCE_CONFLICT', kind === 'experts' ? '这个扩展已经登记过专家来源' : '这个扩展已经登记过知识来源');
    map.set(entry.feature.id, entry);
    const revoke = ctx.effect(() => () => {
      if (map.get(entry.feature.id) === entry) map.delete(entry.feature.id);
      if (!entry.closed) { entry.closed = true; if (!this.closed) this.changed(kind); }
    });
    this.changed(kind);
    return revoke;
  }

  registerExperts(ctx, raw) {
    const feature = this.registry.caller(ctx, '登记专家来源');
    const options = input(expertOptions, raw, '专家来源');
    const entry = { feature, label: options.label, save: options.save, items: new Map(), closed: false };
    const dispose = this.register(this.experts, 'experts', ctx, entry);
    return { set: items => this.setExperts(entry, items), dispose };
  }

  setExperts(entry, raw) {
    if (!this.alive(this.experts, entry)) fail('FEATURE_CLOSED', '专家来源已关闭，请重新打开扩展后再试');
    const items = input(expertItems, raw, '专家列表');
    const next = new Map();
    for (const item of items) {
      if (next.has(item.id)) fail('EXTENSION_SOURCE_INPUT', `专家列表里 id「${item.id}」重复`);
      if (entry.feature.id.length + 2 + item.id.length > 80) fail('EXTENSION_SOURCE_INPUT', `专家 id「${item.id}」加上功能 id 后超过 80 个字符`);
      if (item.avatar) try { parseAvatarData(item.avatar); } catch (error) { fail('EXTENSION_SOURCE_INPUT', `专家「${item.name}」的头像：${error.message}`); }
      next.set(item.id, item);
    }
    entry.items = next;
    this.changed('experts');
  }

  /** 来源专家按鲸翼专家的完整字段给出；模型和 MCP 是员工本机的配置，来源专家一律不绑定。 */
  expert(entry, item) {
    return {
      id: `${entry.feature.id}--${item.id}`, revision: item.revision, builtin: false,
      name: item.name, description: item.description, avatar: item.avatar ?? null, prompt: item.prompt, model: null, skills: [...new Set(item.skills ?? [])], mcpServers: [],
      source: { id: entry.feature.id, label: { ...entry.label } }, readOnly: Boolean(item.readOnly || !entry.save),
    };
  }

  expertList() {
    const experts = [];
    for (const entry of [...this.experts.values()]) if (this.alive(this.experts, entry)) for (const item of entry.items.values()) experts.push(this.expert(entry, item));
    return experts;
  }

  /** 按完整 id 找来源和条目；来源已关闭和条目已移除分开报。 */
  expertEntry(id) {
    const at = id.indexOf('--'), entry = this.experts.get(id.slice(0, at));
    if (!this.alive(this.experts, entry)) fail('EXPERT_SOURCE_CLOSED', '这位专家来自已关闭或卸载的扩展；请重新开启扩展，或改选其他专家');
    const item = entry.items.get(id.slice(at + 2));
    if (!item) fail('EXPERT_DELETED', `专家已从「${entry.label.zh}」移除，请选择其他专家`);
    return { entry, item };
  }

  getExpert(id) { const { entry, item } = this.expertEntry(id); return this.expert(entry, item); }

  /** 维护人改来源专家：交给扩展保存，扩展确认的结果替换这一条；扩展这期间关掉就不认这次结果。 */
  async saveExpert(id, value, signal) {
    const { entry, item } = this.expertEntry(id);
    const name = entry.label.zh;
    if (!entry.save || item.readOnly) fail('EXPERT_SOURCE_READONLY', `这位专家来自「${name}」，只能查看；可以“复制为我的专家”后再改`);
    if (item.revision !== value.expectedRevision) fail('CONFLICT', '专家已被另一处修改，请保留当前表单并刷新后重试');
    let saved;
    try {
      saved = await bounded(() => entry.save({ id: item.id, expectedRevision: item.revision, expert: value.expert }, { signal }), signal);
    } catch (error) {
      signal?.throwIfAborted();
      const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,40}$/.test(error.code) ? error.code : 'EXPERT_SOURCE_SAVE';
      fail(code, `「${name}」没有保存这位专家：${error?.message || '扩展没有说明原因'}`);
    }
    if (!this.alive(this.experts, entry)) fail('EXPERT_SOURCE_CLOSED', `「${name}」已关闭，这次保存的结果没有确认；重新开启后请刷新核对`);
    const next = input(sourceExpertItem, saved, '保存结果');
    if (next.id !== item.id || next.revision <= item.revision) fail('EXPERT_READBACK', `「${name}」返回的保存结果和这位专家对不上，请刷新核对`);
    if (next.avatar) try { parseAvatarData(next.avatar); } catch (error) { fail('EXTENSION_SOURCE_INPUT', `保存结果的头像：${error.message}`); }
    entry.items = new Map([...entry.items].map(([key, current]) => [key, key === next.id ? next : current]));
    this.changed('experts');
    return this.expert(entry, next);
  }

  registerKnowledge(ctx, raw) {
    const feature = this.registry.caller(ctx, '登记知识来源');
    const options = input(knowledgeOptions, raw, '知识来源');
    return this.register(this.knowledge, 'knowledge', ctx, { feature, label: options.label, search: options.search, read: options.read, closed: false });
  }

  hasKnowledge() { return [...this.knowledge.values()].some(entry => this.alive(this.knowledge, entry)); }

  /** 每个来源单独限时；一个来源出错只记一条说明，不影响个人知识和其它来源。 */
  async searchKnowledge(query, signal) {
    const entries = [...this.knowledge.values()].filter(entry => this.alive(this.knowledge, entry));
    if (!entries.length) return null;
    const results = await Promise.all(entries.map(async entry => {
      const local = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      try {
        const value = input(searchResult, await bounded(() => entry.search(query, { signal: local }), local), '搜索结果');
        if (!this.alive(this.knowledge, entry)) return { entry, issue: `「${entry.label.zh}」已关闭，它的搜索结果没有采用` };
        return { entry, value };
      } catch (error) {
        signal.throwIfAborted();
        return { entry, issue: `「${entry.label.zh}」${local.aborted ? '没有及时返回搜索结果' : `搜索失败：${error.message}`}` };
      }
    }));
    // 个人笔记的搜索结果会带上笔记属性，属性名不受控；来源笔记靠 @ 路径辨认，来源名放在结果顶层，不往每条里加字段。
    const notes = [], issues = [], labels = {};
    let total = 0, truncated = false;
    for (const { entry, value, issue } of results) {
      if (issue) { issues.push(issue); continue; }
      labels[entry.feature.id] = { ...entry.label };
      const shown = value.notes.slice(0, this.maxResults);
      total += Math.max(value.total, value.notes.length);
      truncated ||= value.truncated || shown.length < value.notes.length || value.total > shown.length;
      for (const note of shown) notes.push({ path: `@${entry.feature.id}/${note.path}`, title: note.title || path.posix.basename(note.path, '.md'), type: 'source', status: '只读', excerpt: note.excerpt.slice(0, 240), hash: note.hash, readOnly: true });
    }
    return { notes, total, truncated, issues, labels };
  }

  /** `@功能id/本地路径` 交给对应来源读取；返回带来源标记的只读笔记和可选的本机文件路径。 */
  async readKnowledge(full, signal) {
    const match = /^@([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/(.+)$/.exec(full);
    if (!match || !sourceNotePath(match[2])) fail('PATH', '扩展笔记的路径不对，请从搜索结果重新打开');
    const entry = this.knowledge.get(match[1]);
    if (!this.alive(this.knowledge, entry)) fail('EXTENSION_SOURCE_CLOSED', '这篇笔记来自已关闭或卸载的扩展；请重新开启扩展后再打开');
    let value;
    try { value = input(readResult, await bounded(() => entry.read(match[2], { signal }), signal), '笔记'); }
    catch (error) {
      signal?.throwIfAborted();
      if (error.code === 'EXTENSION_SOURCE_INPUT') throw error;
      fail(typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,40}$/.test(error.code) ? error.code : 'EXTENSION_NOTE_READ', `「${entry.label.zh}」没能读出这篇笔记：${error?.message || '扩展没有说明原因'}`);
    }
    if (!this.alive(this.knowledge, entry)) fail('EXTENSION_SOURCE_CLOSED', `「${entry.label.zh}」已关闭，这篇笔记没有读出`);
    if (value.path !== match[2]) fail('EXTENSION_SOURCE_INPUT', `「${entry.label.zh}」返回的笔记和请求的路径对不上`);
    if (Buffer.byteLength(value.content) > this.maxNoteBytes) fail('SIZE', `「${entry.label.zh}」的这篇笔记超出单篇大小限制`);
    return { path: full, content: value.content, hash: value.hash, readOnly: true, source: { id: entry.feature.id, label: { ...entry.label } }, ...(value.absolutePath ? { absolutePath: value.absolutePath } : {}) };
  }

  /** 给小鲸起名：同一时间只认一个扩展；扩展关闭、卸载或调 dispose 后恢复“小鲸助手”。 */
  registerAssistantName(ctx, raw) {
    const feature = this.registry.caller(ctx, '设置助手名称');
    const name = input(assistantName, raw, '助手名称', 'ASSISTANT_NAME_INPUT');
    const holder = this.assistantEntry();
    if (holder) fail('ASSISTANT_NAME_CONFLICT', holder.feature.id === feature.id ? '这个扩展已经设置过助手名称；要改名请调 set' : `助手名称已由「${this.labelOf(holder.feature.id)?.zh ?? holder.feature.package}」设置，同一时间只认一个扩展`);
    const entry = { feature, name, closed: false };
    const dispose = this.register(this.names, 'assistant', ctx, entry);
    return { set: value => this.setAssistantName(entry, value), dispose };
  }

  setAssistantName(entry, raw) {
    if (!this.alive(this.names, entry)) fail('FEATURE_CLOSED', '助手名称已撤销，请重新打开扩展后再试');
    const name = input(assistantName, raw, '助手名称', 'ASSISTANT_NAME_INPUT');
    if (name === entry.name) return;
    entry.name = name;
    this.changed('assistant');
  }

  assistantEntry() {
    for (const entry of [...this.names.values()]) if (this.alive(this.names, entry)) return entry;
    return undefined;
  }

  /** 扩展起的助手名称和是谁起的；没有扩展起名时为 undefined。 */
  assistantName() {
    const entry = this.assistantEntry();
    if (!entry) return undefined;
    const label = this.labelOf(entry.feature.id);
    return { name: entry.name, feature: entry.feature.id, package: entry.feature.package, ...(label ? { label } : {}) };
  }

  /** 技能库分组用的名字：同一扩展登记了来源就用来源的名字，否则由调用方退回包名。 */
  labelOf(featureId) {
    for (const map of [this.experts, this.knowledge]) {
      const entry = map.get(featureId);
      if (entry && this.alive(map, entry)) return { ...entry.label };
    }
    return undefined;
  }
}
