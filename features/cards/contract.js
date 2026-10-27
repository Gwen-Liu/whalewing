import { automationContract } from '../automation/contract.js';
import { bookLimits, libraryLimits } from './library/limits.js';

// 旧版允许删除系统领域后保留20个自定义领域；恢复内置AI须保留这些合法配置。
export const newsFieldLimit = 21;
/** 每期条目上限（旧日报最多 15 条，只读兼容）、每期新提交上限、每个领域的来源上限。 */
export const newsItemLimit = 15, newsSubmitLimit = 8, newsSourceLimit = 16;
/** 条目分类，顺序即日报排序：模型大事在前，其次智能体与产品、开源、多模态，最后研究与其他。 */
export const newsCategories = Object.freeze({ model: '大模型', agent: '智能体与产品', opensource: '开源与工具', media: '图像·视频·语音', research: '研究与其他' });
/** 消息性质；来源标题只表示证据范围，不是发布性质。 */
export const newsLabels = Object.freeze({ official: '官方', media: '媒体', leak: '内测 / 传闻', headline: '来源标题' });

/** 资讯配置和模型提交共用唯一边界；模型无配置写权。 */
export function newsContract(z) {
  const text = z.string(), id = text.regex(/^[a-zA-Z0-9_-]{1,100}$/);
  const source = z.strictObject({ name: text.trim().min(1).max(100), url: text.max(2048), kind: z.enum(['primary', 'media']), region: z.enum(['domestic', 'overseas']) });
  const field = z.strictObject({ name: text.trim().min(1).max(80), focus: text.trim().min(1).max(2000), enabled: z.boolean(), sources: z.array(source).min(1).max(newsSourceLimit) });
  const storedField = field.extend({ id, revision: z.number().int().nonnegative(), deleted: z.boolean() });
  const manage = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('list') }),
    z.strictObject({ action: z.literal('home') }),
    z.strictObject({ action: z.literal('save'), id, expectedRevision: z.number().int().nonnegative(), field, confirmCancel: z.boolean().optional() }),
    z.strictObject({ action: z.literal('remove'), id, expectedRevision: z.number().int().nonnegative(), confirmCancel: z.boolean().optional() }),
    // before 往更早翻页、after 往更新补读，二者只给一个；days 是技巧历史刻度尺用的日期索引，不含正文。
    // 翻页截点只收时间格式，乱填时直接报错，不静默返回空列表。
    z.strictObject({ action: z.literal('reports'), fieldId: id, before: text.datetime().optional(), after: text.datetime().optional() }).refine(value => !(value.before && value.after), 'before 和 after 只能给一个'),
    z.strictObject({ action: z.literal('report'), fieldId: id, cutoff: text.max(30) }),
    z.strictObject({ action: z.literal('days'), fieldId: id }),
  ]);
  // 一行标题 + 一条一手链接；brief 是展开后的一句话说明，relevance 只在和员工工作有关时填写。
  const item = z.strictObject({ sourceIds: z.array(text.max(64)).min(1).max(10), category: z.enum(Object.keys(newsCategories)), label: z.enum(['official', 'media', 'leak']), title: text.trim().min(4).max(120), link: text.max(2048), brief: text.trim().min(1).max(240), relevance: text.trim().max(240), eventKey: text.trim().min(1).max(240) });
  // 仅标题输入没有自由事实字段；保存值由冻结候选投影，不复用模型生成分支。
  const headline = z.strictObject({ sourceIds: z.array(text.max(64)).length(1), category: z.enum(Object.keys(newsCategories)), label: z.literal('headline') });
  // 2026-10-14 之前的日报条目格式，只读保留。
  const legacyItem = z.strictObject({ sourceIds: z.array(text.max(64)).min(1).max(10), title: text.trim().min(1).max(240), summary: text.trim().min(1).max(1200), importance: text.trim().min(1).max(600), relevance: text.trim().min(1).max(600), workImpact: text.trim().min(1).max(600), eventKey: text.trim().min(1).max(240) });
  const execute = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('fields') }),
    z.strictObject({ action: z.literal('candidates'), fieldId: id }),
    z.strictObject({ action: z.literal('submit'), receipt: text.max(100), items: z.array(z.union([item, headline])).max(newsItemLimit) }),
  ]);
  const timestamp = text.datetime(), window = { start: timestamp, cutoff: timestamp };
  // links 是条目正文里指向其他网站的链接，供挑选一手来源；旧日报的来源没有这一项。
  const candidate = z.strictObject({ id: text.regex(/^[a-f0-9]{64}$/), title: text.min(1).max(240), url: text.max(2048), publishedAt: timestamp, eventTime: timestamp.nullable(), collectedAt: timestamp, excerpt: text.max(500), links: z.array(text.max(2048)).max(6).optional(), source });
  const sourceStatus = z.union([source.extend({ status: z.literal('ok'), candidates: z.number().int().min(0).max(100) }), source.extend({ status: z.literal('failed'), message: text.max(400) })]);
  const headlineReport = item.omit({ sourceIds: true }).extend({ label: z.literal('headline'), title: text.min(1).max(240), sources: z.array(candidate).length(1) });
  const reportItem = z.union([headlineReport, item.omit({ sourceIds: true }).extend({ sources: z.array(candidate).min(1).max(10) }), legacyItem.omit({ sourceIds: true }).extend({ sources: z.array(candidate).min(1).max(10) })]);
  const report = z.strictObject({ fieldId: id, fieldName: text.min(1).max(80), fieldRevision: z.number().int().positive(), ...window, sessionId: id, completedAt: timestamp, items: z.array(reportItem).max(newsItemLimit), sourceStatus: z.array(sourceStatus).min(1).max(newsSourceLimit), status: z.enum(['complete', 'partial', 'empty']), coverage: text.min(1).max(1000) });
  // 计划事实仅保留本页直接消费字段，编辑和历史仍回原生自动任务入口。
  const schedule = z.strictObject({ id, sessionId: id, title: text.max(120), status: z.enum(['active', 'paused', 'inactive']), kind: text.max(30), scheduledAt: timestamp });
  const issue = z.strictObject({ sessionId: id, message: text.max(400) });
  const historyField = z.strictObject({ id, name: text.min(1).max(80), deleted: z.boolean() });
  const limits = z.strictObject({ maxFields: z.number().int().min(1).max(100), maxResponseBytes: z.number().int().min(1).max(10485760), maxBodyChars: z.number().int().min(1).max(10485760), maxCandidates: z.number().int().min(1).max(1000), deadlineMs: z.number().int().min(1).max(300000), receiptMs: z.number().int().min(1).max(3600000) });
  const library = libraryContract(z);
  // 当日 AI 技巧取自“AI 使用技巧”领域最新一期日报；index 是该条在当期的序号，count 是当期条数，cutoff 定位整期。
  const date = text.regex(/^\d{4}-\d{2}-\d{2}$/), dayStatus = z.enum(['complete', 'partial', 'empty']);
  const tip = z.strictObject({ title: text.min(1).max(240), brief: text.max(1200), link: text.max(2048), source: text.max(100), date, fieldId: id, index: z.number().int().nonnegative(), count: z.number().int().min(1).max(newsItemLimit), cutoff: timestamp });
  const tipDay = z.strictObject({ date, cutoff: timestamp, count: z.number().int().min(0).max(newsItemLimit), status: dayStatus });
  // tipRecent 只列近 14 天里有日报的日子，空日由界面补齐；tipField 为 null 表示技巧领域已不存在。
  const learning = library.daily.extend({ tip: tip.nullable(), issue: text.max(400).optional(), tipRecent: z.array(tipDay).max(14), tipField: z.strictObject({ name: text.min(1).max(80), enabled: z.boolean(), deleted: z.boolean() }).nullable() });
  const result = z.union([
    z.strictObject({ reports: z.array(report).max(newsFieldLimit), learning }),
    z.strictObject({ fields: z.array(storedField).max(newsFieldLimit), historyFields: z.array(historyField), defaults: storedField, window: z.strictObject(window), errors: z.record(id, z.strictObject({ code: text.max(100), message: text.max(400) })).refine(value => Object.keys(value).length <= newsFieldLimit), limits, schedules: z.array(schedule).max(500), dependencies: z.strictObject({ scheduleAvailable: z.boolean(), issues: z.array(issue).max(500), collection: z.literal('rss'), model: text.max(500) }) }),
    z.strictObject({ field: storedField }),
    z.strictObject({ report: report.nullable() }),
    z.strictObject({ reports: z.array(report).max(30), nextBefore: timestamp.nullable(), nextAfter: timestamp.nullable().optional() }),
    z.strictObject({ fieldId: id, first: date.nullable(), days: z.array(tipDay).max(3660) }),
  ]);
  const executionResult = z.union([
    z.strictObject({ fields: z.array(z.strictObject({ id, name: text.min(1).max(80), focus: text.min(1).max(2000) })).max(newsFieldLimit), window: z.strictObject(window) }),
    z.strictObject({ receipt: text.uuid(), field: storedField, ...window, candidates: z.array(candidate).max(200), sources: z.array(sourceStatus).min(1).max(newsSourceLimit), coverage: text.min(1).max(1000) }),
    z.strictObject({ completed: z.literal(true), recovered: z.boolean().optional(), report }),
  ]);
  const packageName = 'dsh-whalewing/cards';
  const descriptor = { id: `${packageName}#whalewingCards/manageNews`, service: 'whalewingCards', namespace: 'whalewingCards', method: 'manageNews', invocation: { kind: 'direct' }, parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#NewsInput`, create: () => manage } }], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#NewsResult`, create: () => result } };
  const scheduleInput = z.union([z.strictObject({ action: z.literal('initializeNews') }), z.strictObject({ action: z.literal('create'), sessionId: text.regex(/^[\w-]{1,100}$/), purpose: z.literal('news') })]);
  const scheduleResult = automationContract(z).result;
  const scheduleDescriptor = { ...descriptor, id: `${packageName}#whalewingCards/manageSchedules`, method: 'manageSchedules', parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#NewsScheduleInput`, create: () => scheduleInput } }], result: { mode: 'strict', typeSymbol: `${packageName}#NewsScheduleResult`, create: () => scheduleResult } };
  const libraryDescriptor = { ...descriptor, id: `${packageName}#whalewingCards/manageLibrary`, method: 'manageLibrary', parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#LibraryInput`, create: () => library.manage } }], result: { mode: 'strict', typeSymbol: `${packageName}#LibraryResult`, create: () => library.result } };
  const invocations = [descriptor, scheduleDescriptor, libraryDescriptor];
  return { manage, execute, result, scheduleInput, scheduleResult, executionResult, field: storedField, report, library, host: { package: packageName, face: 'host', schemas: [], invocations, model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: invocations } };
}

/** 本地书架：导入、分组、阅读和在线书目共用的唯一边界。 */
export function libraryContract(z) {
  const text = z.string(), count = z.number().int().nonnegative();
  const id = text.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/), entryId = text.regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
  const groups = z.array(id).max(libraryLimits.groups);
  const group = z.strictObject({ id, name: text.trim().min(1).max(libraryLimits.groupName) });
  const source = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('import'), filename: text.max(255) }),
    z.strictObject({ kind: z.literal('catalog'), entry: entryId, url: text.url().max(2048), license: text.min(1).max(80), licenseUrl: text.url().max(2048), attribution: text.max(1000) }),
  ]);
  const book = z.strictObject({
    id, title: text.min(1).max(200), author: text.max(200), language: text.max(35), format: text.min(1).max(20), size: count, chars: count, chapters: count.min(1),
    cover: text.regex(/^(?:cover\.webp|images\/img-\d{4}\.(?:jpg|png|gif|webp|bmp|avif|svg))$/).nullable(), groups, daily: z.boolean(), addedAt: text.datetime(), source,
    progress: z.strictObject({ last: count, next: count }),
  });
  const state = z.strictObject({ version: z.literal(1), groups: z.array(group).max(libraryLimits.groups), books: z.array(book.extend({ sha256: text.regex(/^[a-f0-9]{64}$/) })).max(libraryLimits.books) });
  // 在线书目由仓库维护者登记；地址可以是仓库内相对路径，下载时只接受 GitHub 域名并核对 SHA-256。
  const entry = z.strictObject({
    id: entryId, title: text.trim().min(1).max(200), author: text.max(200), description: text.max(600), category: text.max(30), language: text.max(35).optional(),
    format: text.regex(/^[A-Za-z0-9]{1,10}$/), size: count.min(1).max(bookLimits.file), url: text.min(1).max(2048).refine(value => /^https:\/\//.test(value) || /^[\w./%-]+$/.test(value) && !value.split('/').includes('..')),
    sha256: text.regex(/^[a-f0-9]{64}$/), license: text.min(1).max(80), licenseUrl: text.url().max(2048), attribution: text.max(1000),
  });
  const catalog = z.strictObject({ version: z.literal(1), updatedAt: text.max(40).optional(), books: z.array(entry).max(libraryLimits.catalogEntries) });
  const manage = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('list') }),
    z.strictObject({ action: z.literal('uploadStart'), name: text.min(1).max(255), size: count.min(1) }),
    z.strictObject({ action: z.literal('uploadChunk'), upload: id, offset: count, data: text.min(1).max(Math.ceil(libraryLimits.chunk / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/) }),
    z.strictObject({ action: z.literal('uploadFinish'), upload: id, groups: groups.optional(), daily: z.boolean().optional() }),
    z.strictObject({ action: z.literal('uploadCancel'), upload: id }),
    z.strictObject({ action: z.literal('update'), id, title: text.trim().min(1).max(200).optional(), author: text.trim().max(200).optional(), groups: groups.optional(), daily: z.boolean().optional() }),
    // 常看书籍（存储沿用 daily 字段）整组替换：expected 是界面看到的原常看集合，与当前不一致时按冲突拒收。
    z.strictObject({ action: z.literal('pins'), ids: z.array(id).max(2), expected: z.array(id).max(2) }),
    z.strictObject({ action: z.literal('remove'), id }),
    z.strictObject({ action: z.literal('saveGroup'), id: id.optional(), name: text.trim().min(1).max(libraryLimits.groupName) }),
    z.strictObject({ action: z.literal('removeGroup'), id }),
    z.strictObject({ action: z.literal('open'), id, chapter: count }),
    z.strictObject({ action: z.literal('progress'), id, chapter: count }),
    z.strictObject({ action: z.literal('image'), id, name: text.regex(/^(?:cover|img-\d{4}\.(?:jpg|png|gif|webp|bmp|avif|svg))$/) }),
    z.strictObject({ action: z.literal('catalog') }),
    z.strictObject({ action: z.literal('download'), entry: entryId, groups: groups.optional() }),
  ]);
  // 阅读树与笔记阅读相同，另加 image：url 是书内图片名。
  const view = z.lazy(() => z.strictObject({ type: z.enum(['root', 'group', 'paragraph', 'heading', 'text', 'blockquote', 'code', 'inlineCode', 'strong', 'emphasis', 'delete', 'list', 'listItem', 'thematicBreak', 'break', 'table', 'tableRow', 'tableCell', 'footnoteDefinition', 'link', 'image']), line: count, value: text.optional(), level: z.number().int().min(1).max(6).optional(), ordered: z.boolean().optional(), start: count.optional(), checked: z.boolean().optional(), url: text.optional(), children: z.array(view).optional() }));
  const library = z.strictObject({ groups: z.array(group).max(libraryLimits.groups), books: z.array(book).max(libraryLimits.books) });
  const upload = z.strictObject({ id, chunk: count, received: count });
  // 旧数据常看超过两本时一次性收到两本，执行写回的那次调用带回保留的书名和放下的本数。
  const notice = z.strictObject({ kept: z.array(text.min(1).max(200)).max(2), released: count.min(1) });
  const result = z.union([
    z.strictObject({ library, notice: notice.optional() }),
    z.strictObject({ upload }),
    z.strictObject({ book, library, skippedImages: count.optional() }),
    z.strictObject({ removed: id, library }),
    z.strictObject({ group, library }),
    z.strictObject({ reading: z.strictObject({ book, toc: z.array(z.strictObject({ title: text.min(1).max(200), chars: count })).min(1).max(bookLimits.chapters), chapter: z.strictObject({ index: count, title: text.min(1).max(200), view }) }) }),
    z.strictObject({ image: z.strictObject({ mime: text.max(40), data: text }) }),
    z.strictObject({ catalog: z.strictObject({ source: text.url(), fetchedAt: text.datetime().nullable(), error: text.max(400).nullable(), entries: z.array(entry.extend({ url: text.url().max(2048), installed: id.nullable() })).max(libraryLimits.catalogEntries) }) }),
    z.strictObject({ cancelled: z.literal(true) }),
  ]);
  // 首页常看书籍（存储字段仍叫 daily）：每本给出下一章和之后最多三章；阅读副本丢失时 missing 为 true、不给章节。
  const chapterRef = z.strictObject({ index: count, title: text.min(1).max(200), chars: count });
  const daily = z.strictObject({ date: text.regex(/^\d{4}-\d{2}-\d{2}$/), total: count, daily: count, notice: notice.optional(), books: z.array(z.strictObject({ id, title: text.min(1).max(200), author: text.max(200), cover: z.boolean(), chapters: count.min(1), finished: z.boolean(), missing: z.literal(true).optional(), chapter: chapterRef.extend({ excerpt: text.max(400) }).optional(), next: z.array(chapterRef).max(3) })).max(2) });
  return { manage, result, state, catalog, book, group, view, daily, notice };
}
