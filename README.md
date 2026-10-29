---
description: "在 DSH 中使用可配置专家、个人知识库与小鲸助手，管理个人技能、定时任务、每日资讯、本地办公工坊与模型世界。"
kind: "package-bundle"
---

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="art/brand/whalewing-dark.svg">
    <img src="art/brand/whalewing.svg" width="96" alt="鲸翼标志：鲸尾为翼">
  </picture>
</p>

# 鲸翼 DSH 插件

> 鲸翼 · DSH 超级个体工作台 —— 积厚培风，扶摇九万里

DSH 超级个体工作台：选专家直接干活，经验沉淀到个人知识库，常用办公处理在本机完成。

名字取自《庄子·逍遥游》：“北冥有鱼，其名为鲲……化而为鸟，其名为鹏。”DSH 是那条鲸，鲸翼给它装上鹏的翅膀。知识沉淀、技能复用、专家团队都是托起翅膀的风：“风之积也不厚，则其负大翼也无力。”标志“鲸尾为翼”的说明见 [art/brand](art/brand/README.md)。

## 功能

| 功能 | 内容 |
|---|---|
| 专家团队 | 10 位内置专家（小鲸助手、产品、设计、研发、测试、运维、数据、研究、写作、运营），另有 10 份专家模板（售前、实施、财务、法务、翻译、课程、视频编导、招聘、学习教练、效率教练）一键添加，也可以导入模板文件或新增自己的专家，配置提示词、模型、技能、MCP 和头像；每位专家都有一份完整的岗位说明（使命、底线、工作流程、交付模板、自检清单）；内置专家你改过的部分会保留，没改的部分随插件升级，原版有更新时会提示并可以恢复原版；每位专家默认带上对口的专业技能：鲸翼自写的写作、设计、编码、排查、代码审查、数据分析、调研、视觉物料、汇报演示等，以及收录的 76 项社区开源技能（来自 obra/superpowers、mattpocock/skills、wshobson/agents、phuryn/pm-skills、coreyhaines31/marketingskills、zarazhangrui/frontend-slides、Addy Osmani、Obsidian、ui-ux-pro-max 等） |
| 小鲸助手 | 停靠在页面右侧或悬浮，随时对话；事情该交给专家时，小鲸为那位专家新建任务并把交接说明放进输入框，你看过再发；也能帮你管理鲸翼的功能和扩展 |
| 个人知识 | 本机 Markdown 知识库：首次使用自动建好目录、规则、笔记模板和 Obsidian 视图；支持阅读编辑、关系图谱，笔记可引用到对话 |
| 技能成长 | 管理系统技能与个人技能，可按来源筛选和查找；和小鲸一起从知识里提炼新技能，来源笔记变了会标“待复核”，技能照常可用 |
| 定时任务 | 每日知识整理、每日资讯和自建任务，到点自动执行 |
| AI 网页 | 在 DSH 内置浏览器里打开 DeepSeek、豆包、Kimi、ChatGPT 等官方网页，按国内、海外分组，可自行添加；回到鲸翼时标出正在用的那个 |
| 办公工坊 | 44 项本地文件处理：格式转换、PDF、表格、图片（含打码、去水印）、文字、音视频、二维码，文件可以直接拖进来，不上传 |
| 知识卡片 | 本地书架（EPUB、TXT、PDF、MOBI、AZW3、DOCX 等），首页接着读最多两本常看书；每日 AI 使用技巧（可按年月日翻看历史）和每天 08:00 的资讯简报 |
| 模型世界 | 18 家厂商的模型图鉴、发布时间线、实力榜和角色对决；原创立绘可以点开看大图、保存（带水印，不能商用） |

界面跟随 DSH 的浅色、深色主题和你装的皮肤（例如皮肤中心的半透明主题），鲸翼不自己铺底色，只在卡片边缘加一些水纹、回纹之类的小点缀。

AI 网页、办公工坊、知识卡片、模型世界是可选功能，默认开启，可以在 DSH「插件」页的鲸翼详情里单独关闭；关闭后数据保留，重新开启继续使用。

## 安装

当前版本 0.2.1-rc.2.2（预发布，还在打磨）。版本号去掉最后一段就是适配的 DSH 版本，最后一段是鲸翼自己的更新序号：`0.2.1-rc.2.2` 就是适配 DSH `0.2.1-rc.2` 的第 2 版。

推荐用安装包装，网络慢也装得上：

1. 从 [Releases](https://github.com/gwenliu1025/whalewing/releases) 下载 `dsh-whalewing-0.2.1-rc.2.2.tgz`。
2. 在 DSH 里打开「插件 → 添加插件」，填这个文件在本机的绝对路径。

也可以直接填 GitHub 地址：

```text
github:gwenliu1025/whalewing#v0.2.1-rc.2.2
```

`#` 后面是版本标签，换成别的标签或提交即可装对应版本；不带 `#` 会装开发主线上的最新代码，不保证稳定。这种方式要先连上 GitHub、再下载整个源码包，DSH 连 GitHub 超过 5 秒就判失败，国内网络下常常装不上，装不上就改用安装包。两种方式装上的插件完全一样。

需要 DSH `0.2.1-rc.2`，原版 DSH 即可使用，与定制版的个别体验差异和从旧版升级的方法见[兼容与升级](COMPATIBILITY.md)。

## 扩展

可以给鲸翼开发自己的扩展（依赖鲸翼的独立组合包），不需要改鲸翼源码：从[起步模板](examples/feature-starter/README.md)或[保存状态模板](examples/stateful-feature/README.md)开始，接口和安装、卸载流程见 [EXTENDING.md](EXTENDING.md)。

## 数据存放

| 内容 | 位置 |
|---|---|
| 个人知识库 | 插件配置 `vaultRoot`；Windows 默认在 DSH 安装目录同级的 `whalewing-vault` |
| 专家配置、技能、定时任务 | DSH 当前 profile 的存储 |
| AI 网页入口、每日资讯 | profile 目录下 `whalewing-ai-web`、`whalewing-news` |
| 书架 | profile 目录下 `whalewing-library`；只存导入或下载的书的阅读副本，不上传 |
| 定时任务执行目录 | DSH 数据目录下 `whalewing-tasks`（侧栏“鲸翼定时任务”） |
| 模型数据快照 | profile 目录下 `cache/whalewing-model-world`；点「更新数据」才联网获取 |

停用、升级或替换插件都不会删除这些数据；插件升级时，知识库里你改过的规则和模板保持原样，笔记不动。

## 模型世界的数据

模型目录和价格来自 [models.dev](https://models.dev)；综合实力取 Artificial Analysis 智能指数，推理、编程、智能体分项采用 [Epoch AI](https://epoch.ai/benchmarks) 收录的第三方评测，不采信厂商自报。角色立绘由鲸翼作者原创，见[立绘说明](content/model-world/portraits/NOTICE.md)。

综合实力默认使用随插件发布的数据，不需要任何 Key。想随时更新到最新，可以在模型世界点「综合实力数据」，按提示到 Artificial Analysis 免费注册并生成自己的 API Key，粘贴保存后再点「更新数据」。Key 只保存在本机 DSH 的凭据文件里，不进知识库，也不随插件导出。

## 使用限制

办公工坊在浏览器里本地处理：单文件 25 MB、总量 100 MB、PDF 200 页、音视频 30 分钟以内；扫描件 PDF 不做文字识别。Word 转 PDF 和 PDF 水印只内置常用简繁体字，生僻字显示为方框，结果里会列出来。

## 开发

```powershell
npm run build
npm test
```

源码结构、开发依赖和验证要求见 [MAINTAINING.md](MAINTAINING.md)。

## 许可

代码依 [Apache License 2.0](LICENSE) 授权。“鲸翼”“WhaleWing”名称和“鲸尾为翼”标志不在许可范围内，发布改版请换用其他名称和标志；模型世界立绘依 CC BY-NC-SA 4.0 单独授权，商用须先取得作者授权；第三方内容保留各自许可。详见 [NOTICE](NOTICE)。
