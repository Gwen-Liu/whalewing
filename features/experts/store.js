import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { roles, expertTemplates, retiredBuiltinIds } from '../../content/roles.js';
import { expertContract } from './contract.js';
import { originHistory } from './history.js';
import { avatarLimits, assertAvatarDimensions, parseAvatarData } from '../../src/avatar-image.js';
import { loadExpertAvatars } from '../../src/expert-avatars.js';

const contract = expertContract(z);
// 专业绑定由角色持有；复制数组避免运行时默认值改写角色分发源。
const defaults = new Map(roles.map(role => [role.id, { ...role, revision: 0, builtin: true, avatar: null, model: null, skills: [...role.skills], mcpServers: [] }]));
// 有原版的专家：内置专家的原版是随包定义；改为模板的原内置专家（员工改过才留下来）原版是同名模板。
const origins = new Map([...defaults, ...expertTemplates.filter(item => retiredBuiltinIds.includes(item.id)).map(item => [item.id, { id: item.id, name: item.name, description: item.description, prompt: item.prompt, avatar: null, model: null, skills: [...item.skills], mcpServers: [] }])]);
export const expertDomain = defineDomain({ name: 'whalewing_experts', version: 1, tables: { experts: domainTable(contract.stored) } });
// 员工相对原版改了什么另存一个域：旧版插件打开上面那个域时逐条严格校验，记录里多一个字段旧版就打不开专家。
export const expertChangeDomain = defineDomain({ name: 'whalewing_expert_changes', version: 1, tables: { changes: domainTable(contract.changed) } });

export function expertError(code, message) { return Object.assign(new Error(message), { code }); }

const valueFields = ['name', 'description', 'avatar', 'prompt', 'model', 'mcpServers'];
const textFields = ['name', 'description', 'prompt'];
const fieldOrder = ['name', 'description', 'avatar', 'prompt', 'model', 'skills', 'mcpServers'];
/** 原版文本的指纹，与 history.js 同一算法；先去掉首尾空白，与保存时的规范化一致。 */
export const fingerprint = value => createHash('sha256').update(String(value).trim()).digest('base64url').slice(0, 16);
const prints = new Map([...origins].map(([id, origin]) => [id, Object.fromEntries(textFields.map(field => [field, fingerprint(origin[field])]))]));
const sameSet = (a, b) => a.length === b.length && a.every(item => b.includes(item));
const sameValue = (field, a, b) => textFields.includes(field) ? String(a).trim() === String(b).trim() : field === 'mcpServers' ? sameSet(a, b) : JSON.stringify(a) === JSON.stringify(b);
const distance = (a, b) => a.filter(item => !b.includes(item)).length + b.filter(item => !a.includes(item)).length;
// 改动记录说的必须是当前这条专家记录：版本号之外再核对内容，防止记录被备份还原或旧版插件改过后套错。
const contents = new WeakMap();
const contentPrint = record => {
  if (!contents.has(record)) contents.set(record, fingerprint(JSON.stringify(fieldOrder.map(field => record[field]))));
  return contents.get(record);
};

/** 当前生效的值：员工改过的字段用员工的，没改的跟随最新原版；技能在最新原版上应用员工的增删。 */
function effective(origin, record, change) {
  const value = { ...record };
  for (const field of valueFields) if (!change.fields.includes(field)) value[field] = structuredClone(origin[field]);
  // 保留员工排好的顺序；原版后来去掉的技能（员工没自己加过）跟着去掉，原版新加的接在后面。
  value.skills = !change.added.length && !change.removed.length ? [...origin.skills]
    : [...new Set([...record.skills.filter(name => change.added.includes(name) || origin.skills.includes(name)), ...origin.skills.filter(name => !change.removed.includes(name))])];
  return value;
}

/**
 * 推断记录相对原版改了什么：修复前的旧记录、旧版插件改过的记录都没有可用的改动记录。
 * 规则：与任一版原版（history.js、上次记下的原版、当前原版）相同的字段视为没改；没改的字段来自同一版原版，
 * 用它们缩小“当时的原版”的范围，改过的文本字段在范围内只有一种原版时记为它，否则记为推断不出（''）；
 * 技能清单与哪一版原版最接近，就当是从那一版增删出来的。hint 是上次记下的改动，它记的原版也算一版。
 */
export function inferChange(id, record, hint) {
  const origin = origins.get(id), current = prints.get(id), history = originHistory[id] ?? { skills: [], rows: [] };
  const snapshots = history.rows.map(row => { const [name, description, prompt, skills] = row.split(' '); return { name, description, prompt, skills: skills === '-' ? null : history.skills[Number(skills)] }; });
  if (hint) snapshots.push({ ...hint.base, skills: hint.baseSkills });
  snapshots.push({ ...current, skills: origin.skills });
  const own = Object.fromEntries(textFields.map(field => [field, fingerprint(record[field])]));
  const kept = new Set([...textFields.filter(field => snapshots.some(item => item[field] === own[field])), ...['avatar', 'model', 'mcpServers'].filter(field => sameValue(field, record[field], origin[field]))]);
  const skillsKept = snapshots.some(item => item.skills && sameSet(item.skills, record.skills));
  const matching = snapshots.filter(item => textFields.every(field => !kept.has(field) || !item[field] || item[field] === own[field]) && (!skillsKept || !item.skills || sameSet(item.skills, record.skills)));
  const candidates = matching.length ? matching : snapshots;
  const base = { ...current };
  for (const field of textFields) {
    if (kept.has(field)) continue;
    const values = new Set(candidates.map(item => item[field]).filter(Boolean));
    base[field] = hint?.fields.includes(field) ? hint.base[field] : values.size === 1 ? [...values][0] : '';
  }
  let added = [], removed = [];
  if (!skillsKept) {
    let closest;
    for (const item of candidates.some(item => item.skills) ? candidates : snapshots) if (item.skills && (!closest || distance(item.skills, record.skills) <= distance(closest.skills, record.skills))) closest = item;
    // 留下的不到那一版的一半，说明是员工自己列的清单：按当前原版记增删，现在不增不减，以后原版新加的照常加入。
    const from = closest.skills.filter(name => record.skills.includes(name)).length * 2 < closest.skills.length ? origin.skills : closest.skills;
    added = record.skills.filter(name => !from.includes(name));
    removed = from.filter(name => !record.skills.includes(name));
  }
  return { revision: record.revision, record: contentPrint(record), fields: valueFields.filter(field => !kept.has(field)), base, baseSkills: [...origin.skills], added, removed };
}

/** 这次保存的值相对最新原版的改动；原版指纹按现在的原版重记：看过“原版有更新”仍保存，就是要保留自己的版本。 */
function diffChange(id, value) {
  const origin = origins.get(id);
  return { fields: valueFields.filter(field => !sameValue(field, value[field], origin[field])), base: { ...prints.get(id) }, baseSkills: [...origin.skills], added: value.skills.filter(name => !origin.skills.includes(name)), removed: origin.skills.filter(name => !value.skills.includes(name)) };
}

let bundled;
/** 预置头像和插件自带插画原样保存：WebP 只有几 KB，转成 PNG 要几十 KB；仍是图片数据，旧版插件照样能显示。 */
function bundledAvatar(value) {
  if (!bundled) { try { bundled = new Set(Object.values(loadExpertAvatars())); } catch { bundled = new Set(); } }
  return bundled.has(value);
}

/** 只接受有界栅格数据；SVG、外部 URL 与非规范 Base64 不进入持久配置。 */
export async function validateAvatar(value) {
  if (value === null) return null;
  if (bundledAvatar(value)) return value;
  const parsed = parseAvatarData(value);
  const bytes = Buffer.from(parsed.bytes);
  try {
    const { default: sharp } = await import('sharp');
    // 完整解码而非仅检查文件头；限制解码像素，拒绝截断和多帧图片。
    const image = sharp(bytes, { limitInputPixels: avatarLimits.edge ** 2, failOn: 'warning' });
    const metadata = await image.metadata();
    if (`image/${metadata.format}` !== parsed.mime || (metadata.pages ?? 1) !== 1) throw new Error('头像格式不匹配或包含多帧');
    assertAvatarDimensions(metadata.width, metadata.height);
    const normalized = await image.rotate().png().toBuffer();
    if (normalized.length > avatarLimits.bytes) throw new Error('规范化后的头像超过 512 KiB');
    return `data:image/png;base64,${normalized.toString('base64')}`;
  } catch (error) { throw expertError('AVATAR', `头像未通过完整图像检查，原头像未修改：${error.message}`); }
}

/**
 * 默认身份由内置集合持有；员工记录保存编辑值，自定义删除记录继续保留。
 * 专家记录仍按旧格式保存当前生效的完整值（回退到旧版插件时看到的就是员工最后看到的样子）；
 * 有原版的专家另在改动域记下改过哪些字段，读取时按“最新原版 + 改过的字段”拼出来，没改的字段随插件升级。
 */
export class ExpertStore {
  constructor(domain, maxExperts, changeDomain) {
    this.domain = domain; this.table = domain.table('experts'); this.changes = changeDomain.table('changes');
    this.maxExperts = maxExperts; this.creating = new Set(); this.inferred = new Map(); this.writing = Promise.resolve();
  }
  async restoreDeletedBuiltins() {
    // 服务发布前修复旧删除标记，不重置员工编辑；失败重启只处理尚未完成的记录。
    for (const id of defaults.keys()) {
      const previous = this.table.get(id);
      if (!previous?.deleted) continue;
      await this.change(id, previous.revision, (current, change) => [{ ...current, revision: current.revision + 1, deleted: false }, change], true);
    }
  }
  /** 改为模板的原内置专家：员工改过的转成自定义专家，照常可用、可以删除；没改过的本来就没有记录，不再显示。 */
  async retireBuiltins(ids) {
    for (const id of ids) {
      const previous = this.table.get(id);
      if (defaults.has(id) || !previous?.builtin) continue;
      await this.change(id, previous.revision, (current, change) => [{ ...current, revision: current.revision + 1, builtin: false }, change], true);
    }
  }
  /** 启动时记下推断出的改动（只写改动域，不动专家记录）：以后原版再更新，才能按当时的原版判断“原版有更新”。 */
  async recordChanges() {
    for (const id of origins.keys()) {
      const record = this.table.get(id);
      if (!record || record.revision === 0 || this.saved(id, record)) continue;
      await this.writeChange(id, this.changeOf(id, record));
    }
  }
  saved(id, record) {
    const saved = this.changes.get(id);
    return saved?.revision === record.revision && saved.record === contentPrint(record) ? saved : undefined;
  }
  changeOf(id, record) {
    const saved = this.saved(id, record);
    if (saved) return saved;
    const cached = this.inferred.get(id), hint = this.changes.get(id);
    if (cached?.record === record && cached.hint === hint) return cached.change;
    const change = inferChange(id, record, hint);
    this.inferred.set(id, { record, hint, change });
    return change;
  }
  writeChange(id, change) {
    const value = contract.changed.parse(change);
    // 同一位专家的改动按顺序写；专家记录已被之后的写入取代时跳过，由那次写入记下。
    const write = this.writing.then(async () => {
      const record = this.table.get(id);
      if (record?.revision === value.revision && contentPrint(record) === value.record) await this.changes.put(id, value);
    });
    this.writing = write.catch(() => {});
    return write;
  }
  record(id) {
    const record = this.table.get(id);
    if (!record) return defaults.get(id);
    const origin = origins.get(id);
    return origin ? effective(origin, record, this.changeOf(id, record)) : record;
  }
  /** 有原版的专家改过哪些字段、原版在哪些改过的文本字段上有了新版本（技能自动合并，不需要提示）。 */
  status(id) {
    const origin = origins.get(id), record = this.table.get(id);
    if (!origin) return {};
    if (!record) return { customized: [], baseUpdated: [] };
    const change = this.changeOf(id, record), current = prints.get(id);
    return {
      customized: fieldOrder.filter(field => field === 'skills' ? change.added.length + change.removed.length > 0 : change.fields.includes(field)),
      baseUpdated: textFields.filter(field => change.fields.includes(field) && change.base[field] !== current[field]),
    };
  }
  get(id) {
    const value = this.record(id);
    if (!value || value.deleted) throw expertError('EXPERT_DELETED', '专家已删除或不存在，请恢复专家或选择其他专家');
    const { deleted: _deleted, ...expert } = value;
    return structuredClone(expert);
  }
  list(withStatus = false) {
    const ids = new Set([...defaults.keys(), ...this.table.keys()]);
    const experts = [], deleted = [];
    for (const id of ids) {
      const value = this.record(id);
      if (value.deleted) deleted.push({ id, name: value.name, revision: value.revision, builtin: value.builtin });
      else experts.push(withStatus ? { ...this.get(id), ...this.status(id) } : this.get(id));
    }
    return { experts, deleted };
  }
  /** 新建身份与版本检查在同一 owner，供管理入口的模型/绑定校验与最终提交共用。 */
  previousForSave(input) {
    if (!input.id) {
      if (input.expectedRevision !== 0) throw expertError('CONFLICT', '新增专家版本须为 0');
      return undefined;
    }
    if (this.creating.has(input.id)) throw expertError('CONFLICT', '此专家创建请求仍在保存，请按原标识刷新核对');
    const current = this.record(input.id);
    if (current) {
      if (current.revision !== input.expectedRevision) throw expertError('CONFLICT', '专家已保存或被另一处修改，请按原标识刷新核对');
      return this.get(input.id);
    }
    if (input.expectedRevision !== 0 || !/^custom-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.id)) throw expertError('EXPERT_ID', '新建专家须使用固定的 custom-UUID 标识及版本 0');
    return undefined;
  }
  async save(input, signal) {
    const fields = contract.fields.parse(input.expert);
    const previous = this.previousForSave(input);
    // 历史头像保留原字节；仅新建或替换执行新尺寸边界，改名不隐式重写头像。
    if (!previous || fields.avatar !== previous.avatar) fields.avatar = await validateAvatar(fields.avatar);
    signal?.throwIfAborted();
    this.previousForSave(input);
    fields.skills = [...new Set(fields.skills)]; fields.mcpServers = [...new Set(fields.mcpServers)];
    if (!previous) {
      if (new Set([...defaults.keys(), ...this.table.keys(), ...this.creating]).size >= this.maxExperts) throw expertError('EXPERT_LIMIT', '专家数量达到当前限制，请调整专家服务配置后重试');
      const id = input.id ?? `custom-${randomUUID()}`;
      // 身份与容量同时预留，持久化失败释放；回执丢失后同一 id 只返回冲突，不覆盖既有记录。
      this.creating.add(id);
      try { await this.table.put(id, contract.stored.parse({ ...fields, id, revision: 1, builtin: false, deleted: false })); }
      finally { this.creating.delete(id); }
      return { expert: this.get(id) };
    }
    return this.change(input.id, input.expectedRevision, current => [{ ...fields, id: current.id, builtin: current.builtin, revision: current.revision + 1, deleted: false }, origins.has(input.id) ? diffChange(input.id, fields) : undefined], false, signal);
  }
  async remove(input, signal) {
    signal?.throwIfAborted();
    if (defaults.has(input.id)) throw expertError('EXPERT_BUILTIN', '内置专家可以编辑或恢复原版，不可删除');
    await this.change(input.id, input.expectedRevision, (current, change) => [{ ...current, revision: current.revision + 1, deleted: true }, change], true, signal);
    return { id: input.id, revision: this.record(input.id).revision, deleted: true };
  }
  /** 找回已删除的专家；有原版的专家按 fields 恢复原版（不给就整位恢复），没选的字段保留员工的修改。 */
  async restore(input, signal) {
    const origin = origins.get(input.id);
    if (input.fields && !origin) throw expertError('EXPERT_INPUT', '这位专家没有原版，不能恢复原版');
    const fields = input.fields ?? fieldOrder;
    return this.change(input.id, input.expectedRevision, (current, change) => {
      if (!origin) return [{ ...current, revision: current.revision + 1, deleted: false }];
      const value = { ...current, revision: current.revision + 1, deleted: false, ...(defaults.has(input.id) ? { builtin: true } : {}) };
      for (const field of fields) value[field] = structuredClone(origin[field]);
      return [value, { ...change, fields: change.fields.filter(field => !fields.includes(field)), ...(fields.includes('skills') ? { added: [], removed: [] } : {}) }];
    }, true, signal);
  }
  /** transform(当前生效值, 当前改动) 返回 [新记录, 新改动]；没有原版的专家不记改动。 */
  async change(id, expectedRevision, transform, allowDeleted = false, signal) {
    signal?.throwIfAborted();
    // 首次内置写入也通过同一记录的 update 队列比较，避免两个编辑器同时覆盖版本 0。
    if (!this.table.get(id)) {
      const initial = defaults.get(id);
      if (!initial) throw expertError('EXPERT_DELETED', '专家不存在，请刷新列表');
      if (!this.seeding) this.seeding = new Map();
      let seed = this.seeding.get(id);
      if (!seed) { seed = this.table.put(id, { ...initial, deleted: false }).finally(() => this.seeding.delete(id)); this.seeding.set(id, seed); }
      await seed;
    }
    const origin = origins.get(id);
    let next;
    await this.table.update(id, current => {
      signal?.throwIfAborted();
      if (current.revision !== expectedRevision) throw expertError('CONFLICT', '专家已被另一处修改，请保留当前表单并刷新后重试');
      if (current.deleted && !allowDeleted) throw expertError('EXPERT_DELETED', '专家已删除，请先恢复');
      const before = origin && this.changeOf(id, current);
      const [record, change] = transform(origin ? effective(origin, current, before) : current, before);
      const value = contract.stored.parse(record);
      // 没改的字段这次按最新原版写进记录，指纹也随之更新；改过的字段保留改时的原版指纹。
      if (change) next = { ...change, revision: value.revision, record: contentPrint(value), base: Object.fromEntries(textFields.map(field => [field, change.fields.includes(field) ? change.base[field] : prints.get(id)[field]])), baseSkills: [...origin.skills] };
      return value;
    });
    if (next && this.table.get(id).revision === next.revision) {
      next.record = contentPrint(this.table.get(id));
      await this.writeChange(id, next);
    }
    return this.record(id).deleted ? undefined : { expert: this.get(id) };
  }
}
