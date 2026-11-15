/**
 * 办公工坊的一单（2026-11-12 用户定的改版）：员工把文件放进办公工坊、说要什么结果，主机给这一单建一个会话，
 * 小鲸在会话里只拿得到 whalewing_toolbox；它要处理文件时，主机把请求推给开着的办公工坊页面，
 * 页面用现成的 Worker 处理，处理完把结果回给主机。文件内容一直留在页面里，小鲸默认只看到下面这些描述。
 */
export const toolboxNamespace = 'whalewingToolbox';
export const toolboxActions = ['plan', 'run', 'read', 'ask', 'finish'];
export const jobStatuses = ['queued', 'running', 'waiting', 'completed', 'error', 'interrupted', 'incomplete', 'unknown'];
export const fileIdPattern = /^[fr]\d{1,4}(?:-\d{1,3})?$/;
export const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
/** 旧格式转新格式（2026-11-15 用户定，借 DSH 自带的 Office 引擎）：97-2003 格式另存成新格式。 */
export const officeUpgrades = Object.freeze({ doc: 'docx', xls: 'xlsx', ppt: 'pptx' });
// 单个文件最多 25 MiB，base64 后约 34 MB。
export const officeLimit = Math.ceil(25 * 1024 * 1024 / 3) * 4;
// 读文件夹时最多列多少项（文件和子文件夹一起算）。
export const pathEntryLimit = 500;
export const limits = { files: 20, text: 8000, name: 260, sheets: 50, headers: 200, header: 120 };

/** 页面交给主机的文件描述：只有名字、类型、大小这类结构信息，没有内容。 */
export function fileMetaSchema(z) {
  const text = z.string();
  return z.strictObject({
    id: text.regex(fileIdPattern), name: text.trim().min(1).max(limits.name), type: text.max(16), size: z.number().int().min(0).max(2 ** 40),
    pages: z.number().int().min(0).max(100000).optional(),
    width: z.number().int().min(0).max(100000).optional(), height: z.number().int().min(0).max(100000).optional(),
    seconds: z.number().min(0).max(360000).optional(),
    sheets: z.array(z.strictObject({ name: text.max(64), rows: z.number().int().min(0).max(10_000_000).optional(), headers: z.array(text.max(limits.header)).max(limits.headers) })).max(limits.sheets).optional(),
    folder: text.max(1000).optional(), pasted: z.boolean().optional(),
  });
}

export function toolboxContract(z) {
  const text = z.string(), fileMeta = fileMetaSchema(z);
  const start = z.strictObject({ sessionId: text.min(1).max(200).optional(), text: text.max(limits.text), files: z.array(fileMeta).max(limits.files) })
    .refine(value => value.text.trim() || value.files.length, '先放文件进来，或者说一句要做什么');
  const started = z.strictObject({ sessionId: text });
  const reply = z.strictObject({ id: text.min(1).max(80), ok: z.boolean(), value: z.unknown().optional(), error: text.max(2000).optional() });
  const accepted = z.strictObject({ accepted: z.boolean() });
  const request = z.strictObject({ id: text, sessionId: text, action: z.enum(toolboxActions), args: z.record(z.string(), z.unknown()) });
  const job = z.strictObject({ sessionId: text, status: z.enum(jobStatuses), reply: text, turns: z.number().int().min(0) });
  const frame = z.strictObject({ revision: z.number().int().min(0), requests: z.array(request), jobs: z.array(job) });
  // 和小鲸的对话里转过来的活（2026-11-12 用户定：活都在办公工坊里干）：员工的原话和从哪段对话转来。
  // files：员工在小鲸对话里发的附件（DSH 附件目录里的路径和原文件名，主机核对过），页面读进来一起处理（2026-11-14）。
  const handoff = z.strictObject({ id: text, text: text.max(limits.text), from: z.strictObject({ sessionId: text, title: text.max(120) }), files: z.array(z.strictObject({ path: text.min(3).max(1000), name: text.min(1).max(limits.name) })).max(limits.files).optional() });
  const handoffs = z.strictObject({ revision: z.number().int().min(0), items: z.array(handoff) });
  const claim = z.strictObject({ id: text.min(1).max(80) });
  // Office 转 PDF 用 DSH 自带的转换（2026-11-12 用户定）：页面把文件以 base64 交给主机，主机转好交回。
  const officeInput = z.strictObject({ name: text.min(1).max(limits.name), extension: z.enum(officeExtensions), data: text.max(officeLimit) });
  const officeOutput = z.strictObject({ data: text, missingFonts: z.array(text.max(200)).max(200) });
  const officeConvertInput = z.strictObject({ name: text.min(1).max(limits.name), extension: z.enum(Object.keys(officeUpgrades)), data: text.max(officeLimit) });
  const officeConvertOutput = z.strictObject({ name: text.min(1).max(limits.name), data: text, missingFonts: z.array(text.max(200)).max(200) });
  // 员工在输入框里贴的路径（2026-11-14 用户定：员工一般复制文件夹路径，不会拖文件夹）：主机列出这一层的文件给页面挑，
  // 再一个一个读给页面。只有办公工坊页面调得到，小鲸调不到；单个文件和拖进来的一样最多 25 MiB。
  const pathInput = z.strictObject({ path: text.min(3).max(1000) });
  const pathEntry = z.strictObject({ name: text.min(1).max(limits.name), size: z.number().int().min(0), folder: z.boolean() });
  const pathListing = z.strictObject({ path: text.max(1000), kind: z.enum(['file', 'folder']), entries: z.array(pathEntry).max(pathEntryLimit), truncated: z.boolean() });
  const pathFileInput = z.strictObject({ path: text.min(3).max(1000), name: text.min(1).max(limits.name) });
  const pathFile = z.strictObject({ name: text.min(1).max(limits.name), size: z.number().int().min(0), data: text.max(officeLimit) });
  const packageName = 'dsh-whalewing/toolbox';
  const json = (name, symbol, create) => ({ name, wire: name, source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#${symbol}`, create } });
  const descriptor = (method, extra) => ({ id: `${packageName}#${toolboxNamespace}/${method}`, service: toolboxNamespace, namespace: toolboxNamespace, method, invocation: { kind: 'direct' }, ...extra });
  const descriptors = [
    descriptor('start', { parameters: [json('input', 'ToolboxStart', () => start)], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#ToolboxStarted`, create: () => started } }),
    descriptor('watch', { mode: 'stream', parameters: [], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#ToolboxFrame`, create: () => frame } }),
    descriptor('reply', { parameters: [json('input', 'ToolboxReply', () => reply)], result: { mode: 'strict', typeSymbol: `${packageName}#ToolboxAccepted`, create: () => accepted } }),
    descriptor('handoffs', { mode: 'stream', parameters: [], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#ToolboxHandoffs`, create: () => handoffs } }),
    descriptor('officePdf', { parameters: [json('input', 'ToolboxOfficeInput', () => officeInput)], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#ToolboxOfficeOutput`, create: () => officeOutput } }),
    descriptor('claim', { parameters: [json('input', 'ToolboxClaim', () => claim)], result: { mode: 'strict', typeSymbol: `${packageName}#ToolboxClaimed`, create: () => accepted } }),
    descriptor('listPath', { parameters: [json('input', 'ToolboxPathInput', () => pathInput)], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#ToolboxPathListing`, create: () => pathListing } }),
    descriptor('readPathFile', { parameters: [json('input', 'ToolboxPathFileInput', () => pathFileInput)], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#ToolboxPathFile`, create: () => pathFile } }),
    descriptor('officeConvert', { parameters: [json('input', 'ToolboxOfficeConvertInput', () => officeConvertInput)], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#ToolboxOfficeConvertOutput`, create: () => officeConvertOutput } }),
  ];
  return { start, started, reply, request, job, frame, handoff, handoffs, claim, officeInput, officeOutput, officeConvertInput, officeConvertOutput, pathInput, pathListing, pathFileInput, pathFile, fileMeta, host: { package: packageName, face: 'host', schemas: [], invocations: descriptors, model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors } };
}
