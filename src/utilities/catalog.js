/** 办公工坊目录：按办公场景分成几个分类，每个分类里有多个功能项（参考 WPS 等办公套件的组织方式）。 */
const images = '.png,.jpg,.jpeg,.jfif,.webp,.avif,.gif,.bmp,.ico';
const media = '.mp4,.mov,.m4v,.webm,.mkv,.avi,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus';
const fn = (id, title, brief, accept, extra = {}) => ({ id, title, brief, accept, ...extra });

export const utilityTools = Object.freeze([
  { id: 'convert', title: '格式转换', brief: 'Word、PDF、Excel、图片互相转换', icon: 'convert', color: '#2563eb', functions: [
    fn('word-pdf', 'Word 转 PDF', '中文正文、表格与图片重新排版', '.docx', { description: '支持 DOCX 正文、基础文字样式、规则表格和普通图片，重新排版为 A4，最多 200 页。不支持公式、图表、浮动图形、修订和合并单元格。' }),
    fn('pdf-word', 'PDF 转 Word', '文字型 PDF 转成可编辑文档', '.pdf', { description: '按页重建可编辑的文字，不恢复原排版、图片和表格。扫描件（图片 PDF）无法转换。' }),
    fn('images-pdf', '图片转 PDF', '多张截图、照片按顺序合成 PDF', images, { multiple: true }),
    fn('pdf-images', 'PDF 转图片', '每页导出为 PNG', '.pdf'),
    fn('image-format', '图片转格式', 'PNG、JPG、WebP、AVIF、GIF 等互转', images, { multiple: true, action: 'image', mode: 'convert', keywords: 'png jpg jpeg jfif webp avif gif bmp ico 图片格式 照片 图标 favicon', description: '读取 PNG、JPEG（含 .jfif）、WebP、AVIF、GIF、BMP、ICO，输出 PNG、JPEG、WebP 或 ICO 图标；默认保持原尺寸。与“图片处理 → 压缩与转格式”是同一功能项。' }),
    fn('table-convert', 'Excel / CSV 互转', '导入模板与文本数据互换', '.xlsx,.csv'),
    fn('excel-json', 'Excel 转 JSON', '为接口联调生成数据', '.xlsx', { sheet: true }),
    fn('word-text', 'Word 转 TXT', '导出段落和表格中的文字', '.docx'),
    fn('media', '提取文档图片', '取出 Word、Excel、PPT 里的原始图片', '.docx,.xlsx,.pptx'),
  ] },
  { id: 'pdf', title: 'PDF 处理', brief: '合并拆分、压缩、整理页面、页码水印', icon: 'pdf', color: '#dc2626', functions: [
    fn('pdf-merge', '合并 PDF', '按选择顺序合并多个文件', '.pdf', { multiple: true }),
    fn('pdf-split', '拆分 PDF', '每页单独保存', '.pdf'),
    fn('pdf-compress', '压缩 PDF', '缩小扫描件和图片多的 PDF', '.pdf', { keywords: 'pdf压缩 压缩pdf 减小 变小 体积 文件太大', description: '只重新处理 PDF 里的图片：按档位降低分辨率和 JPEG 质量，文字、矢量和页面不变。以文字和字体为主的 PDF 基本压不动，压后没有变小时不生成新文件。' }),
    fn('pdf-pages', '页面整理', '缩略图里拖动排序、旋转、删除页面', '.pdf', { keywords: '排序 删除页 调整顺序 缩略图 页面顺序' }),
    fn('pdf-rotate', '旋转页面', '纠正页面方向', '.pdf'),
    fn('pdf-number', '添加页码', '页脚标注“第几页 / 共几页”', '.pdf'),
    fn('pdf-watermark', '添加水印', '为文档加中文文字水印', '.pdf'),
    fn('pdf-text', '提取文字', '导出文字型 PDF 中的文字', '.pdf'),
  ] },
  { id: 'excel', title: '表格处理', brief: '合并拆分、关联补列、去重核对、筛选排序', icon: 'table', color: '#16a34a', functions: [
    fn('excel-merge', '合并表格', '表头相同的多个表纵向合并', '.xlsx', { multiple: true }),
    fn('excel-split', '拆分工作表', '每张工作表单独导出', '.xlsx'),
    fn('excel-split-by', '按字段拆分', '按某列的值拆成多个文件或工作表', '.xlsx', { sheet: true, keywords: '分组 按部门拆分 按地区拆分 按列拆分 拆成多个文件' }),
    fn('excel-join', '按关键列关联', '把另一张表的列按共同列补过来', '.xlsx', { multiple: true, keywords: 'vlookup 匹配 查找 补列 关联 连接 合并列', description: '类似 VLOOKUP：选一张主表和一张查找表（可在同一个或两个文件里），按关键列把查找表的列补到主表。查找表关键值重复时按第一条匹配，未匹配和重复的行分别列在单独的工作表里。' }),
    fn('excel-dedupe', '数据去重', '按关键列保留第一条', '.xlsx', { sheet: true }),
    fn('excel-compare', '两表核对', '找出两张表的相同和差异记录', '.xlsx', { multiple: true }),
    fn('excel-filter', '条件筛选', '按列筛出需要的数据', '.xlsx', { sheet: true }),
    fn('excel-sort', '数据排序', '按指定列排序', '.xlsx', { sheet: true }),
    fn('excel-clean', '清理空白', '去掉首尾空格和空行', '.xlsx', { sheet: true }),
  ] },
  { id: 'image', title: '图片处理', brief: '压缩转格式、裁剪拼接、打码去水印', icon: 'image', color: '#9333ea', functions: [
    fn('image', '压缩与转格式', '转换格式、压缩体积、调整尺寸', images, { multiple: true, keywords: 'png jpg jpeg jfif webp avif gif bmp ico 图片格式 照片压缩 缩小 体积 大小 分辨率 宽高 缩放 图标 favicon' }),
    fn('image-rotate', '旋转翻转', '纠正截图和照片方向', images, { multiple: true }),
    fn('image-crop', '裁剪', '框选要保留的区域', images, { region: true }),
    fn('image-stitch', '拼接长图', '多张截图拼成长图或横图', images, { multiple: true }),
    fn('image-grid', '宫格切图', '切成九宫格等多张小图', images),
    fn('image-watermark', '添加水印', '给截图加上用途说明', images, { multiple: true }),
    fn('image-mosaic', '隐私打码', '框选手机号、账号等区域打马赛克', images, { region: true }),
    fn('image-inpaint', '去除水印', '框选水印区域，用周围颜色填补', images, { region: true, description: '适合纯色或渐变背景上的文字、标志；复杂图案上的水印去除后可能留有痕迹。' }),
  ] },
  { id: 'text', title: '文字处理', brief: '文本整理统计、批量替换、版本对照', icon: 'text', color: '#0891b2', functions: [
    fn('text', '整理与统计', '去重、清空行、字数统计、CSV / JSON 互转', '.txt,.csv,.json', { keywords: '字数 行数' }),
    fn('text-replace', '批量替换', '按原文查找替换'),
    fn('word-compare', 'Word 版本对照', '找出两个版本增删的段落', '.docx', { multiple: true, description: '比较正文段落和表格文字，不比较格式；输出包含双方原文的对照文档。' }),
  ] },
  { id: 'media', title: '音视频', brief: '提取音频、转 MP3、剪切、视频截图', icon: 'media', color: '#ea580c', functions: [
    fn('audio-extract', '视频提取音频', '从视频中导出 MP3 或 WAV', media, { audio: true, keywords: '视频转音频 视频转mp3' }),
    fn('audio-convert', '音频转格式', '转成 MP3 或 WAV', media, { audio: true }),
    fn('audio-trim', '音频剪切', '截取指定时间段', media, { audio: true, trim: true }),
    fn('video-frame', '视频截图', '按时间点导出画面', '.mp4,.mov,.m4v,.webm,.mkv', { video: true }),
  ] },
  { id: 'qr', title: '二维码', brief: '生成、批量生成、识别二维码', icon: 'qr', color: '#475569', functions: [
    fn('qr-make', '生成二维码', '网址、文字转成二维码图片'),
    fn('qr-batch', '批量生成', '每行一条内容，打包下载'),
    fn('qr-read', '识别二维码', '读出图片中的二维码内容', images, { multiple: true }),
  ] },
].map(tool => Object.freeze({ ...tool, functions: Object.freeze(tool.functions.map(item => Object.freeze({ ...item, tool: tool.id, group: tool.title }))) })));

/** 扁平功能项列表：分类内的每个功能项都有唯一 id；action 存在时与另一项共用同一处理实现。 */
export const utilityCatalog = Object.freeze(utilityTools.flatMap(tool => tool.functions));

/** 尚未内置的常见需求：搜到时明确说明，不把搜索结果当成能力承诺。 */
export const utilityGaps = Object.freeze([
  { words: ['heic', 'heif'], text: 'HEIC / HEIF 照片：当前客户端不能本地解码，请先在手机或相册里导出为 JPEG 或 PNG 再转换' },
  { words: ['tif', 'tiff'], text: 'TIFF 图片尚未内置转换' },
  { words: ['svg'], text: 'SVG 转位图尚未内置；“生成二维码”可以直接输出 SVG' },
  { words: ['ocr', '文字识别', '识别文字', '提字', '扫描件'], text: 'OCR 文字识别（图片、扫描件提取文字）尚未内置' },
  { words: ['ppt转pdf', 'pptx', 'excel转pdf', 'xlsx转pdf'], text: 'Excel、PPT 转 PDF 尚未内置' },
  { words: ['视频压缩', '压缩视频', '视频转码', '剪视频', '视频剪切'], text: '视频压缩、转码与剪切尚未内置' },
  { words: ['抠图', '去背景', '背景移除'], text: '去背景尚未内置' },
]);

const tokenPattern = /[a-z0-9+#]+|[^\sa-z0-9+#.]+/g;
const normalize = value => value.toLowerCase().replace(/[，。、,;；:：/／|·()（）“”"']/g, ' ');
const searchText = item => normalize([item.title, item.keywords].filter(Boolean).join(' '));
/** 每个功能项可被搜索的文字：分类名、标题、简介、别名和支持的扩展名；详细说明里的限制性文字不参与，避免误中。 */
const haystacks = new Map(utilityCatalog.map(item => [item.id, normalize([item.group, item.title, item.brief, item.keywords, (item.accept || '').replace(/[.,]/g, ' '), /jpe?g/.test(item.accept || '') ? 'jpg jpeg' : ''].filter(Boolean).join(' '))]));

/**
 * 词序无关、大小写无关：查询里每个词都在功能项文字中出现才算命中。标题或别名直接命中的排最前，其次是分类名命中的，其余按目录顺序。
 * “工具”是员工找分类的习惯说法（“PDF 工具”“图片工具”），不当作搜索词：去掉后改为分类名命中的排最前，PDF 处理的功能项排在格式转换前面；只搜“工具”时列出全部。
 */
export function searchUtilities(query) {
  const text = String(query || ''), tokens = normalize(text.replace(/工具/g, ' ')).match(tokenPattern) || [];
  if (!tokens.length) return /工具/.test(text) ? utilityTools.flatMap(tool => tool.functions.map(item => ({ tool, item }))) : [];
  const hits = utilityTools.flatMap(tool => tool.functions.filter(item => tokens.every(token => haystacks.get(item.id).includes(token))).map(item => ({ tool, item })));
  const direct = hit => tokens.every(token => searchText(hit.item).includes(token)), inGroup = hit => tokens.every(token => normalize(hit.item.group).includes(token));
  const rank = /工具/.test(text) ? hit => inGroup(hit) ? 0 : direct(hit) ? 1 : 2 : hit => direct(hit) ? 0 : inGroup(hit) ? 1 : 2;
  return hits.map((hit, order) => ({ hit, order, rank: rank(hit) })).sort((a, b) => a.rank - b.rank || a.order - b.order).map(entry => entry.hit);
}

/** 常见但暂不支持的图片格式（按扩展名）：选文件时就提示，处理时用同一句话说明失败原因；其余返回空字符串。 */
export function unsupportedImageReason(name) {
  const extension = /\.([^.]+)$/.exec(String(name || ''))?.[1].toLowerCase();
  if (extension === 'heic' || extension === 'heif') return 'HEIC / HEIF 照片暂不支持，当前客户端不能本地解码，请先在手机或相册里导出为 JPEG 或 PNG 再来处理';
  if (['tif', 'tiff', 'svg'].includes(extension)) return `${extension.toUpperCase()} 图片尚不支持，请先导出为 JPEG 或 PNG 再来处理`;
  return '';
}

/** 查询提到尚未内置的能力时返回说明。 */
export function utilityGapsFor(query) {
  const compact = normalize(String(query || '')).replace(/\s+/g, '');
  return compact ? utilityGaps.filter(gap => gap.words.some(word => compact.includes(word))).map(gap => gap.text) : [];
}
