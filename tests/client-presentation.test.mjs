import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { zh, en, css, explainError } from '../src/shell/presentation-content.js';
import { createSharedUi } from '../src/shell/ui.js';
import * as sharedStyles from '../src/shell/common-presentation.js';
import * as expertsStyles from '../features/experts/client-presentation.js';
import * as assistantStyles from '../features/assistant/client-presentation.js';
import * as knowledgeStyles from '../features/knowledge/client-presentation.js';
import * as skillsStyles from '../features/skills/client-presentation.js';
import * as automationStyles from '../features/automation/client-presentation.js';
import * as cardsStyles from '../features/cards/client-presentation.js';
import * as aiWebStyles from '../features/ai-web/client-presentation.js';

const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const sorted = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')));
// 词条与样式快照：后续产品改动需明确审查这里的变化。
// 2026-10-25 全栏改版（随皮点缀）重定基线：整份样式以 theme-presentation 的变量层开头、外壳样式结尾（另见 theme-skin.test.mjs），
// 各页签按画布改版，专家“恢复原版”、定时任务运行结果、小鲸交接等新增和改写了词条。此前“只追加、逐段还原到上一版”的审查链
// （书架、书房、技巧历史各一层）不再适用：书房的纸色改为跟随皮肤、旧样式被改写，无法再逐字还原，改为对整份词条与样式的新快照。
// 2026-10-27 顶栏页签改成带图标的胶囊、“更多”改成方钮；个人知识阅读区改成正文加右侧栏（目录、反链、出链）并显示笔记属性，
// 去掉了原来正文下面的“链接状态”“反向链接”折叠区和“已定位原文第几行”框（4 个词条）；技能详情正文不再限制 80 字宽。
// 同日按用户纠正，模型世界从功能页签组里拿出来，单独一个小胶囊放回这一行最右、紧挨着“…”。
// 同日用户定鲸翼是全新项目、不留早期开发时的名字：样式前缀统一改成 ww-（WhaleWing）。把前缀换回早期前缀后指纹与之前的基线逐字相同，样式本身没变。
// 同日按用户反馈，让出窗口标题栏的几条样式从只对 macOS 改成 macOS 和 Windows 桌面版都生效。
// 2026-10-28 用户要求电子书阅读器改成电脑上的读法：正文一栏上下滚动、目录在左侧，去掉左右翻页（“上一页”“下一页”两个词条），
// 新增“本章小节”“正文”“查看大图”和章末“停一下再往下滚，进入下一章”四个词条。
// 同日按用户反馈，正文滚动条加宽到 14px、滑块平时就看得见（皮肤把滚动条设成和底色几乎一样），目录滚动条用同一种颜色。
// 同日按用户对 7 个待确认问题的决定：技能、资讯领域抽屉按钮改成具体动作（去掉“保存技能”“保存领域”，新增“创建技能”“添加”和两个“保存修改”），
// 书架分组抽屉的放弃确认、个人知识“用最新内容替换草稿”确认各加词条。
// 同日修功能测试列出的已知问题：每日阅读页头加现状摘要（7 个词条）、导入 0 字节文件的提示、技能标识规则的说明；
// 资讯页头改成和其他页头一样的标题加摘要（去掉垂直居中）。
// 同日用户定“工具台”改名“办公工坊”（DSH 的“工具”指给模型调用的工具）：只改了 toolbox 一个词条（英文没有单独译名，沿用中文），中英文都把它换回“工具台”后指纹与上一版逐字相同。
// 2026-11-01 为扩展来源加 9 个词条（专家查看/复制和来源说明 5 个、扩展笔记只读说明 1 个、技能库“扩展”一组 3 个）和一条只读专家表单的样式；没装扩展时这些都不出现。
// 同日照第二大脑改版升级个人知识：检查弹窗加文风结果 2 个词条（没有用到不推荐的词、几篇用了），样式不变。
// 同日定时任务跟着改版：“DSH 工作知识整理”改名“每日记忆”，新增“每周思考”和旧任务“换成新版”共 9 个词条
// （每周思考名称和说明 2 个、可换新版的提示和按钮 6 个、换好后的提示 1 个），处理范围、旧计划说明里的“知识整理”改成“每日记忆”，样式不变。
// 2026-11-02 关系图谱照第二大脑按层上色：图例 1 个、六层名称 6 个、“图上没画”和三种没画的 4 个、列举用的顿号 1 个，共 12 个词条，样式不变（图例的样式写在画布组件里）。
// 2026-11-05 扩展可以给小鲸改名（企业版要用）：写着“小鲸助手”“小鲸”的 10 个词条改成占位符 {assistant}、{assistantShort}，
// 没有扩展改名时显示的文字和原来一样；交接失败“原因见助手的回复”、扩展笔记“不能引用给助手”两条罕见报错改成通称（这两条不在快照里）；
// 新增 1 个词条：编辑小鲸时名字由扩展定着的说明。样式不变。
test('全栏改版后的双语词条与样式快照', () => {
  // 2026-11-06 适配 DSH 0.2.2：加“自定义规则”（rule_rrule），显示 DSH「自动化任务」设的 RRULE 任务。
  // 2026-11-08 专家的定时任务：新建任务时选“交给哪位专家”、说明，任务属于哪位专家，共 4 个词条，样式不变。
  // 同日专家团队页改版：查找筛选 7 个（沿用原来的“搜索专家”）、置顶 5 个、“有新结果”和点开详情 2 个、没匹配 1 个、
  // 详情的页签和概况 14 个、记忆页 8 个、详情里的定时任务 2 个，加定时任务页“草稿还在”1 个，共 40 个。
  // 同日小鲸对话接着上次：面板加“新对话”和换好后的提示，共 2 个词条。
  // 同日小鲸面板加“派出去的事”：栏名和说明 2 个、摘要 3 个、八种进度 8 个、打开和去审批 2 个，共 15 个。
  // 同日专家团队页改成三栏（第三版）：去掉置顶、旧筛选和名帖详情 10 个；加左栏、中间一栏、专家库、欢迎页、天数设置、选用放回、
  // 小鲸面板“···”菜单和输入框选专家的分组，净增 67 个。
  // 2026-11-09 技能成长改成技能插件：页名两个词条改字，去掉“与小鲸讨论提炼”和“选择技能查看正文与来源”2 个，提炼提示改成“一起创建”，“待处理”改叫“需要修复”。
  // 2026-11-10 个人知识改名知识积累，加左下角知识库切换、团队知识空间、提交到团队：页名、切换、空空间、提交抽屉、可维护提示共 16 个。
  // 同日扩展登记的定时任务：谁登记的、所属扩展已关闭、扩展开着和关着时的说明、读会话的说明，共 5 个。
  // 同日关系图谱设置和生长动画：设置面板四组、筛选说明、三颗按钮、生长进度和放完的话共 36 个；不再替员工藏东西，去掉“图上没画”和它的几种说法共 5 个。
  // 2026-11-11 知识积累对标 Obsidian 的布局（样子是鲸翼自己的）：功能条和左右栏 8 个、搜索 3 个、右栏六页和各页的空说明 15 个、快速切换 8 个、
  // 空白页签 6 个、页签条和关页签确认 6 个、后退前进 2 个、图谱读取 2 个、状态栏 4 个，共 54 个。
  // 2026-11-13 专家团队页加和其他页签一样的页头：现状一句（在用、没有在用、专家库、在做、等你审批）5 个，页头“＋ 添加”的字 1 个，共 6 个。
  // 同日页头改成“常用页签 + 全部功能”：按钮、搜索和搜不到 7 个，“钉在页头的”和钉上、取下、挪位置、提示 16 个，临时页签和“更多”5 个，
  // 页脚和管理功能 2 个，分组名 5 个和扩展组的说明 1 个，扩展第一次出现的提示 1 个、“新装的”1 个，八个功能各一句用途和一组搜索关键词 16 个，共 54 个。
  // 同日用户看过后定“钉在页头的”一排不要左右箭头、改成按住小点拖：“往前挪”“往后挪”2 个换成小点的提示和读屏名字 2 个，那一排的说明改字，条数不变。
  // 2026-11-14 “知识卡片”改名“每日阅读”：页签名、返回首页、资讯任务的说明、技巧页的面包屑改字，全部功能的搜索关键词里留着旧名字，条数不变。
  // 同日每日阅读改版（首页每天一期、存一条、划线和回顾、阅读设置的开关）：首页和小弹窗 80 个、划线 25 个、阅读设置 16 个、鲸翼的用法和往期 7 个，
  // 去掉“今日学习”1 个，净增 127 个；“卡片设置”改叫“阅读设置”，全部功能里每日阅读的一句用途和搜索关键词跟着改。
  // 同日真模型跑了一期之后：今日一招在“今天这一期整理过但没挑出技巧”时的两句（标题和说明），加 2 个。
  // 同日定时任务“打开原会话”遇到还空白的任务会话不打开、改成提示：“还没运行过”和“下一次是几点”2 个。
  // 同日“技能插件”改名“技能中心”（页签和页标题两个词条改字，全部功能的搜索关键词里留着旧名字），条数不变。
  // 2026-11-17 分界线都能拖（共用的 src/split.js）：线上的提示一句（共用）、专家列表、任务列表、知识积累右栏三条线的读屏名字，加 4 个。
  assert.equal(Object.keys(zh).length, 1120); assert.equal(Object.keys(en).length, 1120);
  assert.equal(hash(sorted(zh)), '35cf0c3b2adf10418e401606d4734df1172ec93147690be2cb9a074aeff721f7');
  assert.equal(hash(sorted(en)), '690f1a790f1057c4dd859bf031dad404549cccca7e94adc5f1b8babb07cb65d9');
  // 没有扩展改名时，界面上的名字和原来逐字相同。
  const fill = text => text.replaceAll('{assistant}', '小鲸助手').replaceAll('{assistantShort}', '小鲸');
  assert.deepEqual([zh.question, zh.assistantOpen, zh.assistantStart, zh.skillEdit].map(fill), ['小鲸助手', '打开小鲸助手', '开始与小鲸协作', '与小鲸编辑技能']);
  // 2026-11-02 其余页签按设计稿补点缀：AI 网页每张入口卡底边水纹、办公工坊分类卡水纹和宋体标题、
  // 技能页空卡（左上回纹、右下鲸尾印）、定时任务分栏右上角鲸尾印、个人知识阅读区左下角回纹（右下角留给小鲸气泡）。
  // 2026-11-08 专家团改版：专家页一行查找筛选（同技能页）、名帖名字点开详情、详情抽屉的页签和记忆文本框。
  // 同日小鲸面板的“派出去的事”：一栏折叠列表，进度用主题的状态色淡底小标签。
  // 同日专家团队页三栏：名帖网格和旧页头的样式删掉，换成左栏、中间一栏、专家库和欢迎页，宽度全按所在区域走（容器查询），派出去的事默认收起。
  // 同日全产品尺寸不写死：主区设成容器（ww-main），各页按自己实际多宽换形态；栏宽按比例加 rem 上下限，网格轨道加 min(100%,…) 兜底，
  // 高度由父容器撑满（技能、定时、技巧时间线），停靠栏、抽屉、弹窗、阅读器、模型世界舞台按比例，删掉一批被覆盖的死样式。
  // 2026-11-09 技能中心页照 Claude“自定义”页重排：顶栏分段、三列列表、发现卡片和预览抽屉，旧的技能分栏样式删掉；
  // 同日加 MCP：键值行、复选框标签、申请链接和状态里的对勾；加插件：图标图片、索引地址输入；顶栏分成左右两组，放不下时右边整组换行靠右。
  // 2026-11-10 知识积累：文件列表底部的知识库切换、切换菜单的分组标题和“可维护”、团队空间没有笔记时的说明、提交到团队抽屉里的笔记卡。
  // 同日图谱设置面板、右上角三颗按钮和生长动画的进度条（天青）。
  // 2026-11-11 知识积累新布局：左侧功能条、左栏“文件 / 搜索”、胶囊页签和状态栏、右栏六页和局部图谱、快速切换、空白页签，窄时左右两栏浮出来。
  // 2026-11-13 AI 网页改版：提问台（问题框、带上和发给两行、常用问法）、“想做什么”一排场景、入口卡换成角色小像加官方图标角标、
  // 卡片上一句拿手戏和右上角的“+”、挑笔记和“看一眼”弹窗；带回来的“贴进来”弹窗。卡片里菜单的旧定位样式删掉。
  // 同日“搜了再挑”提成共用：知识积累“快速切换”的列表样式搬进外壳，加多选用的行首方框（ww-pick-mark）；AI 网页的挑笔记弹窗改用这一套，
  // “贴进来”“看一眼”两个弹窗的宽度和文本框样式改成套得上的写法（.弹窗的类.ww-page）。
  // 同日“全部”改成紧凑名录：分组名在每行开头，入口是只有头像和名字的小块（ww-ai-mini），窄了分组名回到上面；已选的“✓”鼠标停上去不再变回空心。
  // 同日各页签页头统一：专家团队页头放到三栏上面（左栏标题和它的窄屏样式删掉，“在用”一行补上边距），知识积累页头上边距和其他页签一样，
  // 页头的“＋ 添加”主按钮下拉从技能中心挪进外壳（ww-add-menu），专家团队也用它；每日阅读不再整页改写宋体字体（--ww-serif），和其他页签同一套。
  // 同日页头改成“常用页签 + 全部功能”：“全部功能”按钮、虚线框的临时页签和它上面两个小钮、页签条末尾的“更多”、从页头下面展开的面板
  // （搜索、钉在页头的一排、分组格子、单行结果、页脚）；页签条不再横着滚（overflow:hidden），收起的页签用 [hidden]；窄了“全部功能”只留图标、再窄收起“鲸翼”两个字。
  // 同日“钉在页头的”一排改成拖动：小块前面的小点（鼠标是抓手）、拖着的那一块浮起来、拖的时候整排不选中文字。
  // 同日用户要求别处同样的设计也改：拖动提成共用（src/sortable.js），手柄 ww-grip、拖着的那一块、拖动中的容器三条样式从页头那一排搬到外壳，办公工坊的文件列表和页面整理一起用。
  // 2026-11-14 每日阅读改版：首页一屏的样式（ww-read 一族：左右两栏、窄了三个页签、两块各自逐级收紧 data-d 0—4、头条和快讯、今日一招、接着读、回顾）、
  // 阅读设置的开关区（ww-reading-set）、阅读器里的划线（::highlight 两种底色、选中后的小条 ww-book-selbar、本章划线列表 ww-book-marks）；
  // 旧首页“书桌”一族的样式删掉。强调底色用天青点缀色（--ww-orn-2 / --ww-orn），不用品牌色铺底。
  // 同日小鲸只留气泡时，专家团队页中间那栏底部留出气泡的高度（.ww-workspace-bubble .ww-expert-conversation），输入框和审批框不被气泡挡住。
  // 同日勾选一项统一成 ww-choice：删掉 ww-check、ww-kit-check-label 两套样式，插件包挑技能那一列名字的加粗并进 .ww-page label.ww-choice strong。
  // 2026-11-15 MCP 改存 DSH 配置（0.2.2-rc.3.2）：MCP 列表的状态一栏加宽、状态下面一行原因（ww-kit-state）、名字后的来源小标签、
  // 详情里一项一块的密钥（ww-kit-secret，填密钥时的输入行）、试连结果（ww-kit-probe）、升级后的搬家提示（ww-kit-moved）。
  // 2026-11-16 小鲸收起时改成圆形悬浮球（ww-fab-mark 鲸尾和水纹、ww-fab-badge 等审批的数、悬停弹出名字、四段动效和减少动效时停下）；
  // 专家对话、AI 网页、每日阅读窄屏底部写死的留白（5rem、5.5rem、46px）删掉；页面不给球让位、不随球拖动挪（同日用户看后定），
  // 右下角两条横栏让出的宽度 --ww-fab-safe 写成球默认位置的占地（.ww-page 上），不再由脚本按拖到的位置改。
  // 同日 AI 网页一屏放得下：页面占满主区高度，名录（选了场景是大卡 ww-ai-body）在自己那块里滚；窗口矮于 760 时收起剪贴板说明、收紧提问台。
  // 2026-11-17 分界线都能拖：共用的 ww-split-line（1px 的线、中间一小截把手、两边各多 4px 好按，悬停和拖着换品牌色）搬到外壳；
  // 专家团队两张分开的卡片合成一整块（和定时任务、知识积累一样，左栏垫一层底色），窄了线藏起来、左栏自己画边；
  // 定时任务列表右边的边框换成那条线；知识积累目录旁 8px 的旧分隔条换成那条线，右栏前也加一条。
  assert.equal(hash(css), 'e9c9fe2e9ce335dceefa2567ec47330c9ffcdef802dee8a0f553329597323682');
  assert.ok(css.includes('.ww-book-scroll{--dsh-scrollbar-width:14px;--dsh-scrollbar-thumb-border:4px;'), '正文滚动条够宽好拖');
  assert.equal(zh.newsHeadline, '来源标题'); assert.equal(en.newsHeadline, 'Source headline'); assert.equal(zh.newsViewSource, '查看来源');
  assert.equal(zh.library, '书架'); assert.equal(zh.learningTip, 'AI 使用技巧'); assert.equal(zh.libraryAll, '全部'); assert.equal(zh.libraryDailyBadge, '常看');
  assert.equal(zh.skillLibrary, '技能中心', '页签和页标题统一叫“技能中心”');
  for (const key of ['saveSkill', 'newsSave']) assert.equal(Object.hasOwn(zh, key), false, `${key} 是笼统写法，已去掉`);
  for (const key of ['learningText', 'learningHighlights', 'bookCover', 'learningReason', 'newsLearningReview']) assert.equal(Object.hasOwn(zh, key), false, key);
});

const codes = [
  "FEATURE_API",
  "FEATURE_CONFLICT",
  "FEATURE_CLOSED",
  "FEATURE_DISABLED",
  "FEATURE_CALLER",
  "FEATURE_RETRY",
  "WORLD_FETCH",
  "NEWS_FETCH_FAILED",
  "NEWS_FEED",
  "NEWS_URL",
  "SCHEDULE_DISABLED",
  "AUTOMATION_UNAVAILABLE",
  "NEWS_SCHEDULE",
  "LEGACY_SCHEDULE",
  "NEWS_UNAVAILABLE",
  "DSH",
  "MODEL_UNAVAILABLE",
  "API",
  "AI_WEB_UNAVAILABLE",
  "BROWSER_MISSING",
  "PROFILE_UNAVAILABLE",
  "CONFIG",
  "SOURCE_CONFIG",
  "NOT_INITIALIZED",
  "ROOT",
  "WORKSPACE_",
  "PATH",
  "SYMLINK",
  "ROOT_NOT_EMPTY",
  "SOURCE_DIRECTORY",
  "DIRECTORY_LIMIT",
  "WORLD_PATH",
  "SKILL_ROOT",
  "SKILL_SOURCE_ROOT",
  "SOURCE_MODE",
  "ENCODING",
  "INVALID_TEXT",
  "UTF",
  "SIZE",
  "SKILL_SIZE",
  "QUESTION_LIMIT",
  "LIMIT",
  "CONFLICT",
  "EXPECTED_HASH",
  "SKILL_STALE",
  "NEWS_DUPLICATE",
  "CHANGED",
  "EXISTS",
  "READBACK",
  "UNKNOWN",
  "PERSISTENCE",
  "RECOVERY",
  "RECOVERY_MOVE",
  "NOT_FOUND",
  "MISSING",
  "SCHEDULE_ENDED",
  "SCHEDULE_RETIRED",
  "NO_RECOVERY",
  "AUTOMATION_SESSION",
  "SESSION",
  "BUSY",
  "PROTECTED",
  "SKILL_ORIGIN",
  "USER_ONLY",
  "AI_WEB_BUILTIN",
  "FIXED_RULE",
  "SKILL_STATE",
  "SKILL_SHADOWED",
  "CLOSED",
  "ABORTERROR",
  "NEWS_CANCELLED",
  "SESSION_REQUIRED",
  "COMMAND_MISSING",
  "BAD_REPLY",
  "GRAPH_CONTRACT_MISMATCH",
  "EXPERT_READBACK",
  "WORLD_SCHEMA",
  "WORLD_SCALE",
  "WORLD_LINK",
  "WORLD_STORAGE",
  "METADATA",
  "RECEIPT",
  "NEWS_RECEIPT",
  "COVERAGE_OUTPUT",
  "INPUT",
  "VALIDATION",
  "QUERY",
  "OFFSET",
  "ACTION",
  "DOMAIN",
  "QUESTION",
  "SKILL_NAME",
  "SKILL_FORMAT",
  "SKILL_SOURCE",
  "SKILL_REVIEW",
  "SKILL_EVOLUTION",
  "SKILL_DISCOVERY",
  "AUTOMATION_PROMPT",
  "AUTOMATION_IDENTITY",
  "NEWS_IDENTITY",
  "NEWS_SOURCE",
  "NEWS_DISABLED",
  "COVERAGE_CONFLICT",
  "EVENT_LIMIT",
  "INDEX_LIMIT",
  "SOURCE_SCOPE",
  "SOURCE_UNAVAILABLE",
  "WORLD_INPUT",
  "ZODERROR",
  "NOTE_",
  "ECONN",
  "ETIMEDOUT",
  "ENOTFOUND",
  "SESSION_",
  "MIGRATION",
  "UNCONFIRMED",
  "CREATED_DIFFERENT",
  "ARCHIVED",
  "NOTE_SAMPLE",
  "WHATEVER",
  "example_CONFLICT",
  "session/writer-held"
];
// 2026-10-25 审查过的变化只有两项：LEGACY_SCHEDULE 改说“旧版留下的知识整理计划”，AUTOMATION_IDENTITY 不再当作填写错误。
// 2026-11-01 只改了 LEGACY_SCHEDULE 的说法：新的每天整理任务叫“每日记忆”，“不能和每日记忆同时启用”“再启用每日记忆”。
test('领域错误归位保留原122项错误及未知码的显示与优先级', () => {
  assert.equal(explainError('LEGACY_SCHEDULE', '测试原文').text.includes('每日记忆'), true);
  assert.equal(hash(codes.map(code => [code, explainError(code, '测试原文')])), 'a4dda1c73ac44abb7e9e2ee6ee94c3b11863fe2e50c5c9a0c8d4912cd2762aa0');
});


// 2026-10-28 用户要求修功能测试里的已知问题：校验失败的原句是 JSON，员工看到的不能是 JSON、字段路径和英文原句。
test('校验失败的原句是 JSON 时，只给员工看写给人看的中文说明；全是英文默认句时换成通用说法', () => {
  const json = issues => JSON.stringify(issues, null, 2);
  const own = explainError('INPUT', json([{ origin: 'string', code: 'custom', path: ['url'], message: '网址只能以 http:// 或 https:// 开头' }]));
  assert.equal(own.text, '填写的内容不符合要求：网址只能以 http:// 或 https:// 开头');
  const english = explainError('ZODERROR', '《empty.txt》' + json([{ origin: 'number', code: 'too_small', minimum: 1, path: ['size'], message: 'Too small: expected number to be >=1' }]));
  assert.equal(english.text, '填写的内容不符合要求：《empty.txt》有一项内容的格式或长度不对，请检查后重试');
  for (const value of [own.text, english.text]) assert.doesNotMatch(value, /[{}[]]|code|path|Too small/, value);
  assert.equal(explainError('INPUT', '笔记 [[链接]] 写法不对').text, '填写的内容不符合要求：笔记 [[链接]] 写法不对', '不是 JSON 的原句不动');
  // 宿主原句带“错误码: ”前缀时去掉前缀，员工看不到内部错误码。
  assert.equal(explainError('SKILL_FORMAT', 'SKILL_FORMAT: 技能需要名称、说明和正文').text.includes('SKILL_FORMAT'), false);
  assert.equal(explainError('NOTE_PATH', 'NOTE_PATH: 笔记只能放在知识库的十个分区里').text, '填写的内容不符合要求：笔记只能放在知识库的十个分区里');
});

test('Modal声明的水平留白与宽度预算一致，保留阅读器和抽屉独立尺寸', () => {
  // 这里只锁定真实样式声明；视口居中、UA默认值和top layer仍由真实浏览器验收。
  const declarations = selector => {
    const matches = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match => match[1].trim() === selector);
    assert.equal(matches.length, 1, selector);
    return Object.fromEntries(matches[0][2].split(';').filter(Boolean).map(value => {
      const colon = value.indexOf(':');
      return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()];
    }));
  };
  const modal = declarations('.ww-modal.ww-page[open]');
  assert.equal(modal.position, 'fixed');
  assert.equal(modal.inset, '24px 16px');
  assert.equal(modal.margin, 'auto');
  // 2026-11-08 尺寸不写死：宽度按窗口比例，上下限用 rem。
  assert.equal(modal.width, 'min(calc(100vw - 32px),clamp(35rem,56vw,68.75rem))');
  assert.equal(modal['max-height'], 'calc(100dvh - 48px)');
  const confirm = declarations('.ww-modal.ww-confirm.ww-page[open]');
  assert.equal(confirm.width, 'min(440px,calc(100vw - 32px))');
  const book = declarations('.ww-modal.ww-book[open]');
  assert.equal(book.width, 'min(calc(100vw - 48px),105rem)');
  const drawer = declarations('.ww-editor');
  assert.equal(drawer.inset, '12px 12px 12px auto');
  assert.equal(drawer.margin, '0');
  // 2026-10-27 用户：Windows 桌面版小窗时阅读器顶栏、抽屉的“×”压进窗口标题栏；大窗小窗位置规则要一致，小窗只把显示区域调小。
  // 所以让出标题栏的规则对 macOS 和 Windows 桌面版都生效（DSH 在两者上都给出 --dsh-frame-top-clearance）。
  const clear = 'html:is([data-platform=darwin],[data-windows-titlebar])';
  assert.equal(declarations(`${clear} .ww-modal.ww-page[open]`).top, 'calc(var(--dsh-frame-top-clearance,0px) + 24px)');
  assert.equal(declarations(`${clear} .ww-modal`)['max-height'], 'calc(100dvh - var(--dsh-frame-top-clearance,0px) - 48px)');
  assert.deepEqual(declarations(`${clear} .ww-editor`), { top: 'calc(var(--dsh-frame-top-clearance,0px) + 12px)', height: 'calc(100dvh - var(--dsh-frame-top-clearance,0px) - 24px)' });
  assert.equal(declarations(`${clear} .ww-modal.ww-book[open]`).height, 'calc(100dvh - var(--dsh-frame-top-clearance,0px) - 48px)');
  for (const old of ['html[data-platform=darwin] .ww-modal.ww-page[open]', 'html[data-platform=darwin] .ww-editor', 'html[data-platform=darwin] .ww-modal.ww-book[open]']) assert.equal(css.includes(`${old}{`), false, `${old} 不再只对 macOS 生效`);
});

test('共享Modal调用原生showModal并保留忙碌保护、关闭及归焦', () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  try {
    for (const busy of [false, true]) {
      const events = [], effects = [];
      const previous = { isConnected: true, focus: () => events.push('focus') };
      Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: previous } });
      // 直接调用生产组件，记录原生边界；此夹具不模拟浏览器布局或声称进入真实top layer。
      const React = {
        createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
        useRef: current => ({ current }),
        useEffect: effect => effects.push(effect),
      };
      const { Modal } = createSharedUi(React, {});
      let closed = 0, prevented = 0;
      const tree = Modal({ title: '资讯详情', busy, onClose: () => closed++, children: '正文' });
      assert.equal(tree.type, 'dialog');
      assert.equal(tree.props.className, 'ww-modal ww-page');
      assert.equal(tree.props['aria-label'], '资讯详情');
      assert.equal(Object.hasOwn(tree.props, 'open'), false);
      const dom = { showModal: () => events.push('showModal'), close: () => events.push('close') };
      tree.props.ref.current = dom;
      assert.equal(effects.length, 1);
      const cleanup = effects[0]();
      assert.deepEqual(events, ['showModal']);
      tree.props.onCancel({ preventDefault: () => prevented++ });
      tree.props.onClick({ target: dom, currentTarget: dom });
      assert.equal(prevented, 1);
      assert.equal(closed, busy ? 0 : 2);
      cleanup();
      assert.deepEqual(events, ['showModal', 'close', 'focus']);
    }
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  }
});

// 2026-10-27 个人知识新加的一段样式没登记进总样式表，页面上整段不生效：每个领域的每一段样式都必须拼进去。
test('各领域的每一段样式都拼进了总样式表', () => {
  for (const [name, module] of Object.entries({ sharedStyles, expertsStyles, assistantStyles, knowledgeStyles, skillsStyles, automationStyles, cardsStyles, aiWebStyles })) {
    module.styles.forEach((block, index) => assert.ok(css.includes(block), `${name}.styles[${index}] 没有拼进总样式表`));
  }
});

test('“更多”的三个点用粗笔画，16px 下也看得见', () => {
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useState: value => [value, () => {}], useRef: current => ({ current }), useEffect: () => {} };
  const { Glyph } = createSharedUi(React, {});
  assert.equal(Glyph({ name: 'more' }).props.strokeWidth, 3.6);
  assert.equal(Glyph({ name: 'file' }).props.strokeWidth, 1.6);
  for (const name of ['outline', 'backlink', 'outlink', 'panel']) assert.notEqual(Glyph({ name }).props.children[0].props.d, Glyph({ name: 'more' }).props.children[0].props.d, name);
});

test('技能详情的正文铺满抽屉，不在右边留一大片空白', () => {
  assert.match(css, /\.ww-page \.ww-kit-content\{max-width:none;/);
  assert.doesNotMatch(css, /ww-skill-detail/);
});

// 2026-10-30 用户反馈：卸载鲸翼后点开还没撤掉的鲸翼页，提示“插件内部出错”，像是插件坏了。
test('插件卸载或停用后接口已撤下，提示说清是状态变化、重启 DSH 后消失', () => {
  const { text } = explainError('gateway/definition-unavailable', 'its strict definition was withdrawn and SRC fallback is forbidden');
  assert.match(text, /鲸翼已经卸载或停用/);
  assert.match(text, /重启 DSH/);
  assert.doesNotMatch(text, /插件内部出错|withdrawn/);
});
