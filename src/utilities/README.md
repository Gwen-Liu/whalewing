# 工具台与 AI 网页

员工选择本地文件，工具台在本机处理并提供下载：不上传文件，不调用模型，不覆盖原件。

## 工具与功能

目录由 [catalog.js](catalog.js) 持有：7 个工具，每个工具包含多项功能。

| 工具 | 功能 |
|---|---|
| 格式转换 | Word 转 PDF、PDF 转 Word、图片转 PDF、PDF 转图片、图片转格式、Excel / CSV 互转、Excel 转 JSON、Word 转 TXT、提取文档图片 |
| PDF 工具 | 合并、拆分、压缩、页面整理（缩略图拖动排序、旋转、删除）、旋转、添加页码、添加水印、提取文字 |
| 表格处理 | 合并表格、拆分工作表、按字段拆分、按关键列关联、数据去重、两表核对、条件筛选、数据排序、清理空白 |
| 图片处理 | 压缩与转格式（转换格式／压缩体积／调整尺寸）、旋转翻转、裁剪、拼接长图、宫格切图、添加水印、隐私打码、去除水印 |
| 文字处理 | 整理与统计（去重、清空行、字数统计、CSV / JSON 互转）、批量替换、Word 版本对照 |
| 音视频 | 视频提取音频、音频转格式、音频剪切（MP3 / WAV）、视频截图 |
| 二维码 | 生成二维码（PNG + SVG）、批量生成、识别二维码 |

“图片转格式”与“压缩与转格式”是同一实现（目录项用 `action` 指向）。图片读取 PNG、JPEG（含 .jfif）、WebP、AVIF、GIF、BMP、ICO，输出 PNG、JPEG、WebP、ICO；解码全部交给浏览器自带能力，文件头先在 [image.js](image.js) 里核验尺寸，解码后再复核。动图只取第一帧。

搜索与“尚未内置”说明在 [catalog.js](catalog.js) 的 `searchUtilities`、`utilityGapsFor`：查询按空格和中英文边界分词，每个词都要出现在功能的工具名、标题、简介、别名或扩展名里。

批量图片逐张处理，单张失败记入明细、返回 `failed` 序号，其余照常交付；运行器支持把只重试失败项和打包 ZIP 的结果追加到上次结果后面。

PDF 压缩在 [pdf.js](pdf.js) 的 `compressPdf`：用 pdf-lib 遍历图片对象，JPEG 重新编码、无损图缩小后按 PNG Up 预测重新 Flate 压缩；编解码通过 `canvasCodec`（浏览器）注入，测试里换成 sharp。页面整理先由 `pdf-thumbs` 用 PDF.js 渲染缩略图，提交时传逐页布局（顺序 + 追加旋转）。表格关联先由 `excel-headers` 读出各表首行，再由 `excel-join` 关联。

裁剪、打码、去水印在预览图上拖框选区。去水印用周围颜色由外向内填补，适合纯色或渐变背景上的文字水印。

## 结构

| 文件 | 内容 |
|---|---|
| [views.js](views.js) | 工具卡片、工具窗口（左侧功能、右侧操作）、选区工具、任务运行器 |
| [worker.js](worker.js) | Worker 入口，按功能 id 分派到下列模块 |
| [core.js](core.js) [pdf.js](pdf.js) [office-tasks.js](office-tasks.js) [image.js](image.js) | 文档、PDF、表格、图片处理 |
| [extras.js](extras.js) | 打码、去水印、宫格切图、二维码、音频编码 |
| [media-prep.js](media-prep.js) | 主线程的音频解码和视频截图（Worker 中没有这些浏览器能力） |
| [ai-web.js](ai-web.js) | AI 网页入口 |

每次处理开一个独立 Worker，60 秒超时；取消、超时、关闭工具都会立即终止任务并释放下载链接。音视频先在主线程解码，再交 Worker 编码。

## 限制

单文件 25 MB，总输入与输出 100 MB，一次最多 20 个文件，PDF 最多 200 页，图片最多 3200 万像素，表格处理所有输入合计最多 10 万个单元格（Word 表格相关仍为 2 万），音视频最长 30 分钟、500 MB。扫描件 PDF 不做文字识别。Word 转 PDF 不支持公式、图表、浮动图形和修订。

Word 转 PDF 和 PDF 加水印用随包的 Noto Sans SC 常用字子集（常用符号、GB2312 全部字符、Big5 常用字，共 10957 个字符）。子集外的字（如“喆”“堃”“硚”）在 PDF 里显示为带叉方框、不报错，Word 转 PDF 在结果里列出这些字；水印含这类字时处理前就提示换字。字体缺的零宽字符等不可见格式符直接删掉，缺的特殊空格换成普通空格。

## 依赖与许可

依赖装在 `.artifacts/youjin-workbench/dependencies/utilities`，构建时内联进 Worker。`content/utilities/noto-font.json` 是原字体 `NotoSansSC-Regular.otf` 的常用字子集，由 `node scripts/noto-subset.mjs` 生成（需要 Python 与 fontTools 4.65.0，可用 `WHALEWING_FONTTOOLS_PYTHON` 指定解释器；加 `--check` 只核对不写入），同样输入逐字节一致。改字表后同步 `audited-source.json` 的指纹和 `tests/client-chunks.test.mjs` 的体积门槛。`scripts/utility-licenses.mjs` 按 `content/utilities/audited-source.json` 核对每个依赖的版本和文件指纹，许可原文汇总在 `content/utilities/THIRD_PARTY_NOTICES.txt`。新增依赖必须先登记，否则构建拒收。

`@breezystack/lamejs`（MP3 编码）为 LGPL-3.0；其余为 MIT、Apache-2.0 等宽松许可。
