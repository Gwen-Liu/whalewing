/**
 * 网址哪里不合格，写成员工看得懂的一句话；合格返回空串。
 * 空网址由“请填写网址”那条说明，这里不重复报。
 */
function urlProblem(value) {
  if (!value) return '';
  if (/[\u0000- \u007f]/u.test(value)) return '网址里不能有空格或换行';
  let parsed;
  try { parsed = new URL(value); } catch { return '网址不完整，请填写以 http:// 或 https:// 开头的完整网址'; }
  if (!['https:', 'http:'].includes(parsed.protocol)) return '网址只能以 http:// 或 https:// 开头';
  if (parsed.username || parsed.password) return '网址里不能带账号密码，请去掉其中的“账号:密码@”';
  if (!parsed.hostname) return '网址不完整，请填写以 http:// 或 https:// 开头的完整网址';
  return '';
}

/** 输入、存储与客户端读回共享入口字段和 URL 校验。员工会看到的校验说明都写成中文的具体原因。 */
export function aiWebContract(z) {
  const text = z.string(), id = text.regex(/^(?:[a-z][a-z0-9-]{0,79})$/);
  const url = text.trim().min(1, '请填写网址').max(2048, '网址太长，不能超过 2048 个字符').superRefine((value, ctx) => {
    const problem = urlProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  }).transform(value => new URL(value).href);
  const fields = z.strictObject({ name: text.trim().min(1, '请填写名字').max(80, '名字不能超过 80 个字'), url, description: text.trim().max(400, '描述不能超过 400 个字').default(''), avatar: text.max(700000).nullable().default(null) });
  const revision = z.number().int().nonnegative();
  const entry = fields.extend({ id, revision, builtin: z.boolean(), provider: text.max(100), keywords: text.max(400) });
  const input = z.discriminatedUnion('action', [z.strictObject({ action: z.literal('list') }),
    z.strictObject({ action: z.literal('save'), id: text.regex(/^custom-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/), expectedRevision: revision, entry: fields }),
    z.strictObject({ action: z.literal('remove'), id, expectedRevision: revision })]);
  const result = z.strictObject({ entries: z.array(entry).max(210) });
  const packageName = 'dsh-whalewing/ai-web';
  const descriptor = { id: `${packageName}#whalewingAiWeb/manageAiWeb`, service: 'whalewingAiWeb', namespace: 'whalewingAiWeb', method: 'manageAiWeb', invocation: { kind: 'direct' }, parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#AiWebInput`, create: () => input } }], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#AiWebResult`, create: () => result } };
  return { input, result, stored: entry.extend({ builtin: z.literal(false) }), host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor], model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: [descriptor] } };
}
