import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { ExpertStore, expertDomain, expertChangeDomain, validateAvatar } from '../features/experts/store.js';
import { expertContract } from '../features/experts/contract.js';
import { roles, expertTemplates } from '../content/roles.js';
import { loadExpertAvatars } from '../src/expert-avatars.js';

// 回退目标（修复前）的专家记录声明，逐字照抄：旧版插件打开存储域时逐条按它严格校验，有一条不过专家和小鲸都打不开。
function legacyStored(z) {
  const text = z.string();
  const id = text.regex(/^[a-z][a-z0-9-]{0,79}$/);
  const revision = z.number().int().nonnegative();
  const model = z.strictObject({ provider: text.min(1).max(120), model: text.min(1).max(160), reasoningEffort: text.max(80).optional() });
  const fields = z.strictObject({ name: text.trim().min(1).max(40), description: text.trim().min(1).max(240), avatar: text.max(700000).nullable(), prompt: text.trim().min(1).max(32000), model: model.nullable(), skills: z.array(text.min(1).max(100)).max(40), mcpServers: z.array(text.min(1).max(32)).max(30) });
  return fields.extend({ id, revision, builtin: z.boolean() }).extend({ deleted: z.boolean() });
}
const legacyDomain = defineDomain({ name: 'whalewing_experts', version: 1, tables: { experts: domainTable(legacyStored(z)) } });

// 修复前开发版（2026-10-19）的原版，员工第一次编辑时被整份拷进了记录。
const old = {
  manager: { name: '小鲸助手', description: '回答问题、整理知识和工作材料，协调必要专家交付可用成果。', prompt: '你是小鲸助手，鲸翼统一的工作助手。先明确员工要拿到的成果和当前资料，简单工作直接完成，跨领域工作才拆成可验收任务并交接有效原文、责任和来源。帮助员工使用知识、技能和定时任务，配置修改通过实际管理界面完成，不把口头安排冒称已保存或已启用。需要调查、方案或汇报时，有对应技能就加载，以事实支持建议，汇总时保留分歧和未验证范围。不强制接管其他专家会话，不要求同事陪跑或持续带教。', skills: ['whalewing-knowledge', 'whalewing-skill-evolution', 'whalewing-check', 'whalewing-clarify', 'whalewing-writing', 'office'] },
  presales: { name: '售前专家', description: '形成有依据的招投标响应、售前方案及可编辑汇报材料。', prompt: '从客户原始要求、评分与交付约束出发，逐项核对产品和版本证据，形成有来源的响应矩阵。区分已有能力、需要配置、需要定制和缺少证据的承诺；商务条件和报价只消费员工确认口径。先形成适合受众的方案主张、范围和论据，再按请求交付 Word、PPT 或其他可编辑材料。资料不足时指出会改变响应的具体缺口，不编造客户案例、资质、性能数据或上线承诺。' },
};
const manager = roles.find(role => role.id === 'manager');
const presalesTemplate = expertTemplates.find(item => item.id === 'presales');
const preset = loadExpertAvatars()['preset-03'];
const contract = expertContract(z);
const legacyRecord = (id, values) => ({ id, ...values, avatar: null, model: null, mcpServers: [], builtin: true, deleted: false, ...values });
const fieldsOf = ({ id: _id, revision: _revision, builtin: _builtin, customized: _customized, baseUpdated: _updated, ...fields }) => fields;

async function storage(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-expert-origin-'));
  const ctx = new Context();
  await ctx.plugin(Storage);
  await ctx.plugin(StorageJson, { root: directory });
  await ctx.plugin(StorageDomain, { backend: 'json' });
  const opened = new Set();
  const open = async spec => { const domain = await ctx.storageDomain.open(spec); opened.add(domain); return domain; };
  const close = async domain => { opened.delete(domain); await domain.close(); };
  // 每次按“插件重新启动”打开：两个域都重新从磁盘读。
  const start = async () => {
    const experts = await open(expertDomain), changes = await open(expertChangeDomain);
    const store = new ExpertStore(experts, 200, changes);
    await store.restoreDeletedBuiltins();
    await store.retireBuiltins(['presales', 'implementation']);
    await store.recordChanges();
    return { store, stop: async () => { await close(experts); await close(changes); } };
  };
  t.after(async () => {
    for (const domain of opened) await domain.close();
    await ctx.fiber.dispose();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    await rm(directory, { recursive: true, force: true });
  });
  return { open, close, start };
}

test('修复前只换过头像的内置专家：提示词、介绍和技能跟上最新原版，头像保留', async t => {
  const s = await storage(t);
  const seed = await s.open(expertDomain);
  await seed.table('experts').put('manager', legacyRecord('manager', { ...old.manager, avatar: preset, revision: 2 }));
  await s.close(seed);
  const { store } = await s.start();
  const expert = store.get('manager');
  assert.equal(expert.prompt, manager.prompt);
  assert.equal(expert.description, manager.description);
  assert.deepEqual(expert.skills, manager.skills);
  assert.equal(expert.avatar, preset);
  assert.deepEqual(store.status('manager'), { customized: ['avatar'], baseUpdated: [] });
  // 启动时推断结果已经记下，专家记录本身没有被改写。
  assert.equal(store.changes.get('manager').revision, 2);
  assert.equal(store.table.get('manager').prompt, old.manager.prompt);
});

test('改过提示词又加了技能：保留员工的改动，原版新加的技能照常加入，提示词标“原版有更新”', async t => {
  const s = await storage(t);
  const seed = await s.open(expertDomain);
  await seed.table('experts').put('manager', legacyRecord('manager', { ...old.manager, prompt: '员工自己写的小鲸提示词', skills: [...old.manager.skills, 'acme-skill'], revision: 3 }));
  await s.close(seed);
  const { store } = await s.start();
  const expert = store.get('manager');
  assert.equal(expert.prompt, '员工自己写的小鲸提示词');
  assert.deepEqual(new Set(expert.skills), new Set([...manager.skills, 'acme-skill']));
  assert.ok(manager.skills.some(name => !old.manager.skills.includes(name)), '夹具要覆盖原版后来新加的技能');
  assert.deepEqual(store.status('manager'), { customized: ['prompt', 'skills'], baseUpdated: ['prompt'] });
  contract.result.parse(store.list(true));
  // 员工看过提示再保存，就是要保留自己的版本：提示消失，改动照旧。
  const saved = await store.save({ id: 'manager', expectedRevision: 3, expert: fieldsOf(expert) });
  assert.equal(saved.expert.revision, 4);
  assert.deepEqual(store.status('manager'), { customized: ['prompt', 'skills'], baseUpdated: [] });
});

test('新版保存只记改过的字段；重启后不变，可以逐项或整位恢复原版', async t => {
  const s = await storage(t);
  let { store, stop } = await s.start();
  const initial = store.get('manager');
  const edited = { ...fieldsOf(initial), avatar: preset, prompt: '员工改过的提示词', skills: [...initial.skills.filter(name => name !== 'office'), 'acme-skill'] };
  const saved = (await store.save({ id: 'manager', expectedRevision: 0, expert: edited })).expert;
  // 预置头像原样保存 WebP，不再转成几十 KB 的 PNG。
  assert.equal(saved.avatar, preset);
  assert.ok(preset.length < 20000);
  assert.deepEqual(store.changes.get('manager').fields, ['avatar', 'prompt']);
  assert.deepEqual([store.changes.get('manager').added, store.changes.get('manager').removed], [['acme-skill'], ['office']]);
  await stop();
  ({ store, stop } = await s.start());
  assert.deepEqual(store.get('manager'), saved);
  assert.deepEqual(store.status('manager'), { customized: ['avatar', 'prompt', 'skills'], baseUpdated: [] });
  const prompt = (await store.restore({ id: 'manager', expectedRevision: 1, fields: ['prompt'] })).expert;
  assert.equal(prompt.prompt, initial.prompt);
  assert.equal(prompt.avatar, preset);
  assert.deepEqual(prompt.skills, edited.skills);
  assert.deepEqual(store.status('manager'), { customized: ['avatar', 'skills'], baseUpdated: [] });
  const whole = (await store.restore({ id: 'manager', expectedRevision: 2 })).expert;
  assert.deepEqual(whole, { ...initial, revision: 3 });
  assert.deepEqual(store.status('manager'), { customized: [], baseUpdated: [] });
  await assert.rejects(store.restore({ id: 'custom-00000000-0000-4000-8000-000000000009', expectedRevision: 0, fields: ['prompt'] }), { code: 'EXPERT_INPUT' });
  contract.input.parse({ action: 'restore', id: 'manager', expectedRevision: 3, fields: ['prompt', 'skills'] });
  assert.throws(() => contract.input.parse({ action: 'restore', id: 'manager', expectedRevision: 3, fields: [] }));
});

test('回退：新版写出的专家记录按旧版声明逐条严格校验仍能打开，旧版看到员工最后保存的样子；再升级时旧版里的修改也保留', async t => {
  // 专家记录的声明一个字都不能变；改动信息另存在旧版不打开的域里。
  assert.deepEqual(z.toJSONSchema(contract.stored), z.toJSONSchema(legacyStored(z)));
  assert.notEqual(expertChangeDomain.name, expertDomain.name);
  const s = await storage(t);
  let { store, stop } = await s.start();
  const initial = store.get('manager');
  const saved = (await store.save({ id: 'manager', expectedRevision: 0, expert: { ...fieldsOf(initial), avatar: preset, prompt: '员工改过的提示词', skills: [...initial.skills, 'acme-skill'] } })).expert;
  await store.save({ id: 'custom-00000000-0000-4000-8000-000000000010', expectedRevision: 0, expert: { name: '审计专家', description: '核对资料', avatar: null, prompt: '只核对有据可查的资料。', model: null, skills: [], mcpServers: [] } });
  await stop();
  // 旧版：只打开专家域，读取 = 记录 ?? 内置默认。
  const legacy = await s.open(legacyDomain);
  const { deleted: _deleted, ...oldView } = legacy.table('experts').get('manager');
  assert.deepEqual(oldView, saved);
  // 旧版里再改一次名字（版本号加一，其余照抄），然后升级回新版。
  await legacy.table('experts').update('manager', current => ({ ...current, revision: current.revision + 1, name: '旧版里改的名字' }));
  await s.close(legacy);
  ({ store, stop } = await s.start());
  const expert = store.get('manager');
  assert.equal(expert.name, '旧版里改的名字');
  assert.equal(expert.prompt, '员工改过的提示词');
  assert.equal(expert.avatar, preset);
  assert.deepEqual(expert.skills, [...initial.skills, 'acme-skill']);
  assert.equal(expert.description, initial.description);
  assert.deepEqual(store.status('manager'), { customized: ['name', 'avatar', 'prompt', 'skills'], baseUpdated: [] });
  // 新版接着写，旧版仍然能打开。
  await store.restore({ id: 'manager', expectedRevision: 2, fields: ['name'] });
  await stop();
  const again = await s.open(legacyDomain);
  assert.equal(again.table('experts').get('manager').name, initial.name);
  assert.equal(again.table('experts').get('manager').prompt, '员工改过的提示词');
  await s.close(again);
});

test('改为模板的原内置专家：原版是同名模板，没改过的跟随模板，员工加的技能保留，可以恢复原版也可以删除', async t => {
  const s = await storage(t);
  const seed = await s.open(expertDomain);
  await seed.table('experts').put('presales', legacyRecord('presales', { ...old.presales, skills: ['whalewing-knowledge', 'whalewing-skill-evolution', 'whalewing-check', 'acme-solution'], revision: 4 }));
  await s.close(seed);
  const { store } = await s.start();
  const expert = store.get('presales');
  assert.equal(expert.builtin, false);
  assert.equal(expert.revision, 5);
  assert.equal(expert.prompt, presalesTemplate.prompt);
  assert.deepEqual(new Set(expert.skills), new Set([...presalesTemplate.skills, 'acme-solution']));
  assert.deepEqual(store.status('presales'), { customized: ['skills'], baseUpdated: [] });
  const restored = (await store.restore({ id: 'presales', expectedRevision: 5 })).expert;
  assert.deepEqual(restored.skills, presalesTemplate.skills);
  assert.equal(restored.builtin, false);
  await store.remove({ id: 'presales', expectedRevision: 6 });
  assert.equal(store.list().deleted.some(item => item.id === 'presales'), true);
});

test('只有插件自带的头像原样保存，其他图片照旧完整检查后转成 PNG', async () => {
  for (const value of Object.values(loadExpertAvatars())) assert.equal(await validateAvatar(value), value);
  const { default: sharp } = await import('sharp');
  const webp = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#aabbcc' } }).webp().toBuffer();
  assert.match(await validateAvatar(`data:image/webp;base64,${webp.toString('base64')}`), /^data:image\/png;base64,/);
});
