/**
 * 给小鲸看的功能项用法（2026-11-12 办公工坊改版）：每个功能项要什么输入、options 怎么写、做出什么。
 * 和页面上的表单是同一套处理实现，键名和取值以 Worker 实际读的为准（core.js、pdf.js、office-tasks.js、image.js、extras.js）。
 * 目录里加了功能项，这里没写用法的不会交给小鲸，测试会提醒补上。
 * Office 转 PDF 用 DSH 自带的转换（2026-11-12 用户定），鲸翼自己的 Word 转 PDF 去掉了。
 */
const imageOut = [
  ['format', "输出格式：keep（保持原格式，AVIF/GIF/BMP/ICO 变 PNG）、png、jpeg、webp；默认 keep"],
  ['quality', 'JPEG、WebP 的质量，0.1 到 1 的小数，默认 0.9'],
  ['maxEdge', '可选，结果最长边不超过多少像素（1 到 10000）'],
];
const sheet = ['sheetName', '工作表名，照文件清单里写的抄，必填'];
const pages = ['pages', '哪些页：空着是全部；否则写 1-3,5 这样的页码，按写的顺序输出，最多 200 页'];

export const modelFunctions = Object.freeze({
  'office-pdf': { inputs: '1 个 Word、Excel 或 PPT（doc、docx、xls、xlsx、ppt、pptx）', options: [], makes: '一个 PDF；用 DSH 自带的转换，排版和原文件接近，Excel 按打印设置分页' },
  'office-images': { inputs: '1 个 Word、Excel 或 PPT（doc、docx、xls、xlsx、ppt、pptx）', options: [pages], makes: '一个压缩包，每页一张 PNG；先用 DSH 自带的转换转成 PDF 再导出，页码按转出来的 PDF 算，Excel 按打印设置分页' },
  'office-upgrade': { inputs: '1 到 20 个 Word、Excel 或 PPT 的旧格式文件（doc、xls、ppt）', options: [], makes: '每个一个新格式文件（docx、xlsx、pptx）；用 DSH 自带的转换，宏和旧式控件可能丢失' },
  'pdf-word': { inputs: '1 个文字型 PDF', options: [], makes: '一个 Word，只有文字、保留分页；扫描件转不了' },
  'images-pdf': { inputs: '1 到 20 张图片，按 inputs 的顺序每张一页 A4', options: [], makes: '一个 PDF' },
  'pdf-images': { inputs: '1 个 PDF', options: [pages], makes: '一个压缩包，每页一张 PNG' },
  'image-format': { inputs: '1 到 20 张图片', options: [['format', '输出格式：png、jpeg、webp、ico（多尺寸图标）；默认 png'], imageOut[1], imageOut[2]], makes: '每张一个文件' },
  'table-convert': { inputs: '1 个 Excel 或 CSV', options: [['conversion', 'excel-csv（Excel 转 CSV，默认）或 csv-excel'], ['sheetName', 'excel-csv 时必填：工作表名']], makes: 'CSV 或 Excel' },
  'excel-json': { inputs: '1 个 Excel', options: [sheet], makes: 'JSON，值全是文字' },
  'word-text': { inputs: '1 个 Word', options: [], makes: 'TXT，只有正文和表格文字' },
  media: { inputs: '1 个 Word、Excel 或 PPT', options: [], makes: '压缩包，里面是文档里的原图' },
  'pdf-merge': { inputs: '1 到 20 个 PDF，按 inputs 的顺序合并', options: [], makes: '一个 PDF，最多 200 页' },
  'pdf-split': { inputs: '1 个 PDF', options: [pages], makes: '压缩包，每页一个 PDF' },
  'pdf-compress': { inputs: '1 个 PDF', options: [['preset', 'light（约 200 DPI，轻度）、standard（约 150 DPI，默认）、strong（约 100 DPI，强力）']], makes: '压缩后的 PDF；只压图片，文字为主的 PDF 基本压不动，没变小时这一步会失败' },
  'pdf-pages': { inputs: '1 个 PDF', options: [['layout', '新的页序：[{"page":0,"rotate":0},…]，page 从 0 数，不写的页就删掉，rotate 是顺时针再转 0/90/180/270']], makes: '整理后的 PDF；要删页、调顺序用它' },
  'pdf-rotate': { inputs: '1 个 PDF', options: [['angle', '顺时针转 90、180 或 270'], pages], makes: '转好的 PDF' },
  'pdf-number': { inputs: '1 个 PDF', options: [pages], makes: '加了页码的 PDF：页脚中间印“1 / 24”这种格式，位置和样式不能改' },
  'pdf-watermark': { inputs: '1 个 PDF', options: [['watermark', '水印文字，1 到 60 字，生僻字会被拒'], pages], makes: '加了水印的 PDF：灰色、居中、半透明，样式不能改' },
  'pdf-text': { inputs: '1 个文字型 PDF', options: [], makes: 'TXT，按页分开；扫描件提不出' },
  'excel-merge': { inputs: '1 到 20 个 Excel，所有工作表的表头要完全一样', options: [], makes: '一个 Excel，所有表接在一起' },
  'excel-split': { inputs: '1 个 Excel', options: [], makes: '压缩包，每张工作表一个文件，最多 20 张' },
  'excel-split-by': { inputs: '1 个 Excel', options: [sheet, ['columns', '按哪一列分组，写一个表头名'], ['splitOutput', 'files（拆成几个文件打包，默认）或 sheets（一个文件、每组一张工作表）']], makes: '按这一列的值分好的结果，最多 200 组' },
  'excel-join': { inputs: '1 到 2 个 Excel', options: [['main', '主表：{"file":"f1","sheet":"工作表名"}，主表的行都保留'], ['lookup', '查找表：{"file":"f2","sheet":"工作表名"}'], ['leftKey', '主表里用来对的列名'], ['rightKey', '查找表里用来对的列名'], ['joinColumns', '要从查找表补过来的列名数组'], ['joinType', 'left（主表全留，没匹配的留空，默认）或 inner（只留两边都有的）'], ['ignoreCase', '对的时候忽略大小写，默认 false'], ['numericKey', '001 和 1 算同一个，默认 false']], makes: '关联好的 Excel，没匹配上的单列一张表' },
  'excel-dedupe': { inputs: '1 个 Excel', options: [sheet, ['columns', '按哪几列判断重复，表头名用英文逗号隔开']], makes: '去重后的 Excel，留第一条' },
  'excel-compare': { inputs: '两张表：1 个文件里有两张工作表，或 2 个文件各一张；表头要一样，第一张当原表', options: [], makes: '核对结果：只在原表的、只在新表的、两边都有的各一张表（按整行比）' },
  'excel-filter': { inputs: '1 个 Excel', options: [sheet, ['columns', '按哪一列筛，写一个表头名'], ['match', 'equals（等于，默认）、contains（包含）、not-empty（不为空）'], ['value', '要比的值']], makes: '筛好的 Excel' },
  'excel-sort': { inputs: '1 个 Excel', options: [sheet, ['columns', '按哪一列排，写一个表头名'], ['sortType', 'text（按文字，默认）或 number（按数字，这一列不能有空的或非数字）'], ['order', 'asc（从小到大，默认）或 desc']], makes: '排好的 Excel' },
  'excel-clean': { inputs: '1 个 Excel', options: [sheet], makes: '去掉首尾空格和整行空行的 Excel' },
  image: { inputs: '1 到 20 张图片', options: [['mode', 'convert（转格式，默认）、compress（压体积）、resize（改尺寸）'], ['format', 'convert：keep/png/jpeg/webp/ico，默认 png；compress：jpeg（默认）或 webp；resize：keep/png/jpeg/webp，默认 keep'], ['target', 'compress 时：quality（按质量，默认）或 size（压到指定大小）'], ['targetKB', 'target 是 size 时：不超过多少 KB，整数 10 到 25600'], ['resizeWidth', 'resize 时：宽，像素'], ['resizeHeight', 'resize 时：高，像素；宽高可只写一个'], ['keepRatio', 'resize 时保持比例，默认 true'], imageOut[1], imageOut[2]], makes: '每张一个文件；压不到目标大小时会再缩小并说明' },
  'image-rotate': { inputs: '1 到 20 张图片', options: [['angle', '顺时针 0、90、180、270，写数字'], ['flip', 'none（默认）、horizontal（左右翻）、vertical（上下翻）'], ...imageOut], makes: '每张一个文件' },
  'image-crop': { inputs: '1 张图片', options: [['x', '左上角横坐标，原图像素'], ['y', '左上角纵坐标'], ['width', '宽'], ['height', '高；不超出原图。按尺寸居中裁时用文件清单里的宽高自己算；要看画面才能定的位置就不写这四项，页面会请员工框'], ...imageOut], makes: '裁好的图片', region: 'optional' },
  'image-stitch': { inputs: '1 到 20 张图片，按 inputs 的顺序拼', options: [['direction', 'vertical（竖着拼长图，默认）或 horizontal'], ...imageOut], makes: '一张拼好的图' },
  'image-grid': { inputs: '1 张图片', options: [['rows', '几行，1 到 10，默认 3'], ['columns', '几列，1 到 10，默认 3']], makes: '压缩包，切好的小图' },
  'image-watermark': { inputs: '1 到 20 张图片', options: [['watermark', '水印文字，1 到 100 字'], ['fontSize', '字号，整数 10 到 200，默认 24'], ['opacity', '不透明度 0.1 到 1，默认 0.5'], ['position', 'top-left、center、bottom-right（默认）'], ...imageOut], makes: '每张一个文件' },
  'image-mosaic': { inputs: '1 张图片', options: [['block', '马赛克块大小，2 到 200 像素，默认 14']], makes: '打好码的图片；位置由员工在页面上框', region: 'employee' },
  'image-inpaint': { inputs: '1 张图片', options: [], makes: '去掉水印的图片；位置由员工在页面上框，适合纯色或渐变背景', region: 'employee' },
  text: { inputs: '1 个 TXT、CSV、JSON，或者不放文件、把文字写在 text 里', text: true, options: [['operation', 'dedupe（去重行，默认）、remove-empty（删空行）、statistics（字数统计）、csv-json、json-csv']], makes: '处理后的文本文件' },
  'text-replace': { inputs: '不放文件，把文字写在 text 里', text: true, options: [['find', '要找的原文（按字面，不是正则）'], ['replacement', '换成什么，可以是空串']], makes: '替换后的 TXT' },
  'word-compare': { inputs: '2 个 Word，原版在前、新版在后', options: [], makes: '对照文档：各自独有的段落和双方全文' },
  'audio-extract': { inputs: '1 个视频或音频', options: [], makes: 'WAV（只导出 WAV，每分钟约 10 MB）' },
  'audio-convert': { inputs: '1 个音频', options: [], makes: 'WAV' },
  'audio-trim': { inputs: '1 个音频或视频', options: [['start', '从第几秒开始，默认 0'], ['end', '到第几秒，不写就到结尾']], makes: '截好的 WAV' },
  'video-frame': { inputs: '1 个视频', options: [['times', '截哪几秒：写 1, 5.5, 10，或者“每 5 秒”；最多 50 张']], makes: '截图 PNG，多于 20 张时打成压缩包' },
  'qr-make': { inputs: '不放文件，把内容写在 text 里（最多 2000 字节）', text: true, options: [['size', '边长像素 128 到 2048，默认 512；印刷用 1200 左右'], ['level', '容错 L、M（默认）、Q、H；印刷、要贴标志用 H']], makes: '二维码 PNG 和 SVG 各一个' },
  'qr-batch': { inputs: '不放文件，text 里每行一条内容，最多 500 行', text: true, options: [['size', '同生成二维码'], ['level', '同生成二维码']], makes: '压缩包，每行一个二维码' },
  'qr-read': { inputs: '1 到 20 张图片', options: [], makes: '识别结果 TXT；可以用来自查刚做的二维码' },
});
