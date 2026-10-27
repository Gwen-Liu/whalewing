/** 专家配置的 Host、浏览器与持久记录共用同一严格声明。 */
export function expertContract(z) {
  const text = z.string();
  const id = text.regex(/^[a-z][a-z0-9-]{0,79}$/);
  const revision = z.number().int().nonnegative();
  const model = z.strictObject({ provider: text.min(1).max(120), model: text.min(1).max(160), reasoningEffort: text.max(80).optional() });
  const fields = z.strictObject({ name: text.trim().min(1).max(40), description: text.trim().min(1).max(240), avatar: text.max(700000).nullable(), prompt: text.trim().min(1).max(32000), model: model.nullable(), skills: z.array(text.min(1).max(100)).max(40), mcpServers: z.array(text.min(1).max(32)).max(30) });
  const expert = fields.extend({ id, revision, builtin: z.boolean() });
  const deleted = z.strictObject({ id, name: text, revision, builtin: z.boolean() });
  // 有原版的专家（内置专家、改为模板的原内置专家）可以逐项恢复原版；列表另带“改过哪些、原版在哪些有更新”。
  const field = z.enum(['name', 'description', 'avatar', 'prompt', 'model', 'skills', 'mcpServers']);
  const listed = expert.extend({ customized: z.array(field).optional(), baseUpdated: z.array(field).optional() });
  const skill = text.min(1).max(100), print = text.max(64);
  // 员工相对原版改了什么，单独存一个域：fields 是员工改过的字段（值仍在专家记录里），技能只记增删；
  // base 是改时原版的指纹（'' 表示旧记录推断不出当时的原版）；revision 与 record（记录内容指纹）对应专家记录，对不上就重新推断。
  const changed = z.strictObject({ revision: revision.min(1), record: print, fields: z.array(field.exclude(['skills'])).max(6), base: z.strictObject({ name: print, description: print, prompt: print }), baseSkills: z.array(skill).max(200), added: z.array(skill).max(40), removed: z.array(skill).max(200) });
  const input = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('list') }),
    z.strictObject({ action: z.literal('templates') }),
    z.strictObject({ action: z.literal('catalog'), sessionId: text.min(1).max(160).optional() }),
    z.strictObject({ action: z.literal('prepare_model'), sessionId: text.min(1).max(160), expertId: id, expectedRevision: revision }),
    z.strictObject({ action: z.literal('save'), id: id.optional(), expectedRevision: revision, expert: fields }),
    z.strictObject({ action: z.literal('remove'), id, expectedRevision: revision }),
    z.strictObject({ action: z.literal('restore'), id, expectedRevision: revision, fields: z.array(field).min(1).max(7).optional() }),
  ]);
  const modelItem = z.object({ id: text, name: text, description: text.optional(), reasoning: z.object({ efforts: z.array(z.object({ id: text, name: text, description: text.optional() })), defaultEffort: text.optional() }).optional() });
  const result = z.union([
    z.strictObject({ experts: z.array(listed), deleted: z.array(deleted) }),
    // 随包模板库：创建出来的是员工的自定义专家；avatar 是插件自带头像的标识，浏览器换成图片。
    z.strictObject({ templates: z.array(z.strictObject({ id, name: text, description: text, prompt: text, skills: z.array(text), avatar: text.nullable() })) }),
    z.strictObject({ models: z.array(z.object({ id: text, name: text, models: z.array(modelItem) })), defaultModel: model.nullable(), skills: z.array(z.strictObject({ name: text, description: text })), mcpServers: z.array(z.strictObject({ name: text, connected: z.boolean(), tools: z.array(text) })), issues: z.array(text), mcpSupported: z.boolean().optional(), modelSupported: z.boolean().optional() }),
    z.strictObject({ selected: model, applied: z.boolean().optional() }),
    z.strictObject({ expert }), z.strictObject({ id, revision, deleted: z.literal(true) }),
  ]);
  const packageName = 'dsh-whalewing/experts';
  const descriptor = { id: `${packageName}#whalewingExperts/manage`, service: 'whalewingExperts', namespace: 'whalewingExperts', method: 'manage', invocation: { kind: 'direct' }, parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#ExpertInput`, create: () => input } }], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#ExpertResult`, create: () => result } };
  return { input, result, fields, expert, changed, stored: expert.extend({ deleted: z.boolean() }), host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor], model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: [descriptor] } };
}
