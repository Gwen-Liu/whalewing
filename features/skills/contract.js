/**
 * 新增技能的标识（技能目录名）和技能内容里的名称（name）共用一条规则：英文小写字母、数字和连字符，
 * 连字符只夹在字母或数字中间，最长 80 个字符。界面先查一遍，宿主保存前再查一遍。
 */
export function isSkillIdentifier(value) {
  return typeof value === 'string' && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

/** 员工技能管理与浏览器共享唯一严格契约；模型工具不注册此管理入口。 */
export function skillLibraryContract(z) {
  const text = z.string();
  const id = text.min(1).max(300);
  const hash = text.max(64);
  const count = z.number().int().nonnegative();
  const state = z.enum(['candidate', 'active', 'disabled']);
  const input = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('list'), offset: count.optional() }),
    z.strictObject({ action: z.literal('read'), id }),
    z.strictObject({ action: z.literal('create'), id, content: text.max(1048576), expectedHash: z.literal('') }),
    z.strictObject({ action: z.literal('update'), id, content: text.max(1048576), expectedHash: hash, expectedBaseHash: hash.optional() }),
    ...['remove', 'reset'].map(action => z.strictObject({ action: z.literal(action), id, expectedHash: hash, expectedBaseHash: hash.optional() })),
    z.strictObject({ action: z.literal('stage'), name: text, content: text.max(1048576), sourcePaths: z.array(text).min(1).max(20), sourceHashes: z.record(text, text), expectedHash: hash }),
    z.strictObject({ action: z.literal('publish'), name: text, expectedHash: hash, activeHash: hash, review: z.strictObject({ reviewer: text, positive: text, negative: text }) }),
    ...['disable', 'restore', 'rollback'].map(action => z.strictObject({ action: z.literal(action), name: text, expectedHash: hash })),
    // 扩展带的技能只读：列出 DSH 实际从各扩展技能目录发现的技能，读其中一项的正文。
    z.strictObject({ action: z.literal('extensions') }),
    z.strictObject({ action: z.literal('extension_read'), feature: text.min(1).max(80), name: text.min(1).max(100) }),
    // 维护人改团队技能：交给登记技能来源的扩展保存。
    z.strictObject({ action: z.literal('extension_save'), feature: text.min(1).max(80), name: text.min(1).max(100), content: text.min(1).max(1048576), expectedHash: hash.min(1) }),
    // 共用目录和各项目里的技能（DSH 会用、鲸翼只读）：列出来、读一项的正文。
    z.strictObject({ action: z.literal('scopes') }),
    z.strictObject({ action: z.literal('scope_read'), path: text.min(1).max(2000) }),
    // 上传：.zip / .skill 压缩包或单个 SKILL.md，base64，最多 10 MB。
    z.strictObject({ action: z.literal('upload'), fileName: text.min(1).max(255), data: text.min(1).max(14000000) }),
    // 发现：skills.sh 的首屏排行、搜索、装前预览、安装。
    z.strictObject({ action: z.literal('market_home'), refresh: z.boolean().optional() }),
    z.strictObject({ action: z.literal('market_search'), query: text.max(100) }),
    z.strictObject({ action: z.literal('market_preview'), id: text.min(1).max(330) }),
    z.strictObject({ action: z.literal('market_install'), id: text.min(1).max(330), expectedHash: text.min(1).max(128) }),
  ]);
  const extensionLabel = z.strictObject({ zh: text, en: text });
  // 知识提炼的技能来源笔记变了：changed 内容有改动，missing 找不到或读不出，otherVault 来源在另一个知识库无法核对。技能照常可用，只提示复核。
  const review = z.strictObject({ changed: z.array(text), missing: z.array(text), otherVault: z.literal(true).optional() });
  const entry = z.strictObject({
    id, name: text, description: text, origin: z.enum(['builtin', 'user', 'override', 'evolution']), hash,
    actions: z.array(z.enum(['read', 'update', 'remove', 'reset', 'evolve'])),
    discovery: z.enum(['available', 'catalogued', 'shadowed', 'unavailable', 'inactive', 'unknown']), issue: text.optional(),
    editId: id.optional(), baseId: id.optional(), baseHash: hash.optional(), baseUpdated: z.literal(true).optional(), state: state.optional(), review: review.optional(),
    source: z.strictObject({ kind: z.literal('skills.sh'), id: text }).optional(),
  });
  const marketItem = z.strictObject({ id: text, source: text, name: text, installs: count, official: z.literal(true).optional() });
  const result = z.union([
    z.strictObject({ entries: z.array(entry), offset: count, total: count, truncated: z.boolean() }),
    z.strictObject({ entry: entry.extend({ content: text, sourcePaths: z.array(text).optional() }).nullable() }),
    z.strictObject({ id, removed: z.literal(true) }),
    z.strictObject({ id, reset: z.literal(true), baseId: id }),
    z.strictObject({ name: text, state, hash, sourcePaths: z.array(text).optional(), discovery: z.literal('verified').optional(), behavior: text.optional() }),
    z.strictObject({ extensions: z.array(z.strictObject({ id: text, package: text, label: extensionLabel.optional(), skills: z.array(z.strictObject({ name: text, description: text, editable: z.literal(true).optional(), note: text.optional() })) })) }),
    z.strictObject({ extension: z.strictObject({ id: text, package: text, label: extensionLabel.optional(), name: text, description: text, content: text, hash, editable: z.literal(true).optional(), note: text.optional() }) }),
    z.strictObject({ market: z.strictObject({ official: z.array(marketItem), popular: z.array(marketItem), total: count, issue: text.optional() }) }),
    z.strictObject({ skills: z.array(marketItem) }),
    z.strictObject({ scopes: z.array(z.strictObject({ id: text, kind: z.enum(['agents', 'project']), label: text, root: text, skills: z.array(z.strictObject({ name: text, description: text, path: text })) })) }),
    z.strictObject({ scoped: z.strictObject({ path: text, content: text }) }),
    z.strictObject({ preview: z.strictObject({ id: text, hash: text, name: text, description: text, content: text, files: z.array(z.strictObject({ path: text, size: count })), scripts: z.array(text) }) }),
  ]);
  // 技能中心页的 MCP：鲸翼加的服务器（密钥只进不出）、DSH 配置文件里的只读列出。
  const pair = z.strictObject({ name: text.min(1).max(200), value: text.max(8000).optional(), secret: z.boolean() });
  const server = z.strictObject({
    name: text.min(1).max(32), title: text.trim().min(1).max(40), catalogId: text.max(300).optional(), transport: z.enum(['stdio', 'streamable-http']),
    command: text.max(500).optional(), args: z.array(text.max(2000)).max(50).optional(), cwd: text.max(1000).optional(), url: text.max(4000).optional(), urlSecret: z.boolean().optional(),
    env: z.array(pair).max(50), headers: z.array(pair).max(50),
  });
  const revision = z.number().int().nonnegative();
  const mcpInput = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('list') }),
    z.strictObject({ action: z.literal('save'), server, expectedRevision: revision.nullable() }),
    z.strictObject({ action: z.literal('toggle'), name: text.min(1).max(32), enabled: z.boolean(), expectedRevision: revision }),
    z.strictObject({ action: z.literal('reconnect'), name: text.min(1).max(32) }),
    z.strictObject({ action: z.literal('remove'), name: text.min(1).max(32), expectedRevision: revision }),
  ]);
  const shownPair = z.strictObject({ name: text, secret: z.boolean(), value: text.optional() });
  const serverView = z.strictObject({
    name: text, title: text, catalogId: text.optional(), transport: z.enum(['stdio', 'streamable-http']), target: text,
    command: text.optional(), args: z.array(text).optional(), url: text.optional(), urlSecret: z.boolean().optional(),
    env: z.array(shownPair), headers: z.array(shownPair), enabled: z.boolean(), revision,
    status: z.enum(['connecting', 'connected', 'failed', 'disabled']), error: text.optional(), tools: z.array(text),
    pack: text.optional(), packOff: z.literal(true).optional(),
  });
  const mcpResult = z.union([
    z.strictObject({ servers: z.array(serverView), profile: z.array(z.strictObject({ name: text, transport: z.enum(['stdio', 'streamable-http']), target: text, enabled: z.boolean() })), credentials: z.boolean() }),
    z.strictObject({ server: serverView }),
    z.strictObject({ removed: text }),
  ]);
  // 插件包：装好的列表、发现页的市场、装前预览（市场里的或上传的）、安装、启用停用、卸载、看包里一项技能、加或移除市场。
  const packName = text.min(1).max(64);
  const packInput = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('list') }),
    z.strictObject({ action: z.literal('market'), refresh: z.boolean().optional(), id: text.min(1).max(200).optional() }),
    z.strictObject({ action: z.literal('preview'), entry: z.strictObject({ market: text.min(1).max(200), name: packName }) }),
    z.strictObject({ action: z.literal('upload'), fileName: text.min(1).max(255), data: text.min(1).max(45000000) }),
    z.strictObject({ action: z.literal('install'), stage: text.min(1).max(64), expectedHash: text.min(1).max(128), mcp: z.array(z.strictObject({ key: text.min(1).max(200), values: z.record(text.max(200), text.max(8000)) })).max(30) }),
    z.strictObject({ action: z.literal('toggle'), name: packName, enabled: z.boolean() }),
    z.strictObject({ action: z.literal('remove'), name: packName }),
    z.strictObject({ action: z.literal('skill'), name: packName, skill: text.min(1).max(120) }),
    z.strictObject({ action: z.literal('market_add'), repo: text.min(1).max(300) }),
    z.strictObject({ action: z.literal('market_remove'), id: text.min(1).max(200) }),
  ]);
  const packSource = z.strictObject({ kind: z.enum(['curated', 'market', 'upload']), label: text, market: text.optional(), entry: text.optional(), repo: text.optional(), ref: text.optional(), path: text.optional() });
  const skipped = z.strictObject({ commands: count, agents: count, hooks: z.boolean(), lsp: z.boolean() });
  const packSkill = z.strictObject({ name: text, description: text });
  const packView = z.strictObject({
    name: text, title: text, description: text, version: text, author: text, homepage: text, source: packSource, enabled: z.boolean(), installedAt: text,
    skills: z.array(packSkill), mcp: z.array(z.strictObject({ key: text, server: text })), skippedMcp: z.array(z.strictObject({ key: text, reason: text })), skipped, issues: z.array(text),
  });
  const field = z.strictObject({ id: text, label: text, secret: z.boolean(), required: z.boolean(), help: text.optional() });
  const packEntry = z.strictObject({ id: text, market: text, name: text, title: text, description: text, author: text, category: text, homepage: text.optional(), own: z.literal(true).optional(), installable: z.boolean(), reason: text.optional() });
  const packResult = z.union([
    z.strictObject({ packs: z.array(packView) }),
    z.strictObject({ markets: z.array(z.strictObject({ id: text, title: text, kind: z.enum(['local', 'github']), repo: text.optional(), removable: z.literal(true).optional(), entries: z.array(packEntry), issue: text.optional(), loading: z.literal(true).optional() })) }),
    z.strictObject({ preview: z.strictObject({
      stage: text, hash: text, name: text, title: text, description: text, version: text, author: text, homepage: text, source: packSource, installed: z.boolean(),
      skills: z.array(packSkill.extend({ conflict: z.literal(true).optional() })), skipped, issues: z.array(text),
      mcp: z.array(z.strictObject({ key: text, title: text, transport: z.enum(['stdio', 'streamable-http']), target: text, fields: z.array(field), blocked: text.optional(), hint: text.optional(), ready: z.boolean() })),
    }) }),
    z.strictObject({ pack: packView, failed: z.array(z.strictObject({ key: text, reason: text })) }),
    z.strictObject({ pack: packView }),
    z.strictObject({ removed: text, mcp: z.array(text) }),
    z.strictObject({ skill: z.strictObject({ pack: text, packTitle: text, name: text, description: text, content: text, enabled: z.boolean() }) }),
  ]);
  const packageName = 'dsh-whalewing/skills';
  const packDescriptor = {
    id: `${packageName}#whalewingSkills/managePacks`, service: 'whalewingSkills', namespace: 'whalewingSkills', method: 'managePacks', invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#PackInput`, create: () => packInput } }],
    cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#PackResult`, create: () => packResult },
  };
  const mcpDescriptor = {
    id: `${packageName}#whalewingSkills/manageMcp`, service: 'whalewingSkills', namespace: 'whalewingSkills', method: 'manageMcp', invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#McpInput`, create: () => mcpInput } }],
    cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#McpResult`, create: () => mcpResult },
  };
  const descriptor = {
    id: `${packageName}#whalewingSkills/manageSkills`, service: 'whalewingSkills', namespace: 'whalewingSkills', method: 'manageSkills', invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#SkillLibraryInput`, create: () => input } }],
    cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#SkillLibraryResult`, create: () => result },
  };
  return { input, result, mcpInput, mcpResult, packInput, packResult, host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor, mcpDescriptor, packDescriptor], model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: [descriptor, mcpDescriptor, packDescriptor] } };
}
