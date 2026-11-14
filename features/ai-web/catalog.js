import { aiWebIcons } from '../../src/utilities/ai-web-icons.js';

/** 只持有经核验的官方地址；登录、额度与网页内容均由厂商和宿主浏览器持有。聊天类 2026-10-12 核验，专门的工具 2026-11-13 核验。 */
export const aiWebEntries = Object.freeze([
  { id: 'deepseek', name: 'DeepSeek', provider: '深度求索', url: 'https://chat.deepseek.com/', description: '问答、写作与代码交流', keywords: '深度求索 代码' },
  { id: 'doubao', name: '豆包', provider: '字节跳动', url: 'https://www.doubao.com/chat/', description: '日常问答与内容创作', keywords: 'doubao 字节' },
  { id: 'kimi', name: 'Kimi', provider: '月之暗面', url: 'https://www.kimi.com/', description: '阅读资料与整理思路', keywords: '月之暗面 kimi' },
  { id: 'qianwen', name: '千问', provider: '阿里巴巴', url: 'https://www.qianwen.com/', description: '通用问答与办公辅助', keywords: '通义 qwen 千问 阿里' },
  { id: 'yuanbao', name: '腾讯元宝', provider: '腾讯', url: 'https://yuanbao.tencent.com/', description: '提问、搜索与资料阅读', keywords: '腾讯 yuanbao' },
  { id: 'qingyan', name: '智谱清言', provider: '智谱', url: 'https://www.chatglm.cn/', description: '通用问答与内容整理', keywords: '清华 智谱 glm zhipu' },
  { id: 'wenxin', name: '文心助手', provider: '百度', url: 'https://wenxin.baidu.com/', description: '工作与学习问答', keywords: '百度 文心一言' },
  { id: 'chatgpt', name: 'ChatGPT', provider: 'OpenAI', url: 'https://chatgpt.com/', description: '问答、写作与资料分析', keywords: 'openai gpt' },
  { id: 'gemini', name: 'Gemini', provider: 'Google', url: 'https://gemini.google.com/', description: '通用问答与创意交流', keywords: 'google 谷歌' },
  { id: 'claude', name: 'Claude', provider: 'Anthropic', url: 'https://claude.ai/', description: '写作、分析与代码交流', keywords: 'anthropic claude' },
  // 专门的工具（2026-11-13 改版加入）：不是聊天，是画图、视频、搜索、读资料这类单项工具。
  { id: 'jimeng', name: '即梦', provider: '脸萌科技', url: 'https://jimeng.jianying.com/ai-tool/home', description: '画图和做视频的创作平台', keywords: 'jimeng 剪映 字节 画图 视频' },
  { id: 'hailuo', name: '海螺视频', provider: 'MiniMax', url: 'https://hailuoai.com/', description: '用文字和参考素材生成视频', keywords: 'hailuo 海螺 AI minimax 视频' },
  { id: 'metaso', name: '秘塔 AI 搜索', provider: '秘塔', url: 'https://metaso.cn/', description: '没有广告的 AI 搜索', keywords: 'metaso 秘塔 搜索' },
  { id: 'perplexity', name: 'Perplexity', provider: 'Perplexity', url: 'https://www.perplexity.ai/', description: '搜完给出处的 AI 搜索', keywords: 'perplexity 搜索' },
  { id: 'gemini-notebook', name: 'Gemini Notebook', provider: 'Google', url: 'https://notebook.google.com/', description: '只依据你给的资料来读和讲（原 NotebookLM）', keywords: 'notebooklm notebook google 谷歌 读资料' },
].map(entry => Object.freeze({ ...entry, avatar: aiWebIcons[entry.id]?.data ?? null, builtin: true, revision: 0 })));

/** “想做什么”的场景，顺序就是界面上的顺序。 */
export const aiWebScenes = Object.freeze([['write', '写东西'], ['search', '查资料'], ['read', '读长文'], ['ppt', '做 PPT'], ['image', '画图'], ['video', '做视频'], ['code', '写代码']]);

/**
 * 内置入口的指引，只在界面上用，不进存储和 Remote：
 * group 分组（cn 聊天·国内，global 聊天·海外，tool 专门的工具，tool-global 专门的工具·海外）；
 * persona 接待它的模型世界角色（立绘 id，没有就不写）；line 一句拿手戏；
 * scenes 各场景下的拿手戏（写了哪个场景，选那个场景时就列出它）。
 *
 * 只写在官方网站或官方帮助里看到的能力，用的是官方页面上的说法，不做高下评价，不写免费额度这类常变的信息；
 * 没核对到的场景宁可不写，所以多数入口不满七项。核对日期：2026-11-13。
 * 智谱清言的官网当天先被人机验证挡住，用户自己过了验证后补核：首页的入口是任务、研究报告、PPT 制作、数据分析、创意海报、网页应用。
 */
export const aiWebGuide = Object.freeze({
  deepseek: { group: 'cn', persona: 'deepseek', line: '深度思考、智能搜索', scenes: { search: '深度思考加智能搜索' } },
  doubao: { group: 'cn', persona: 'bytedance-seed', line: '写方案、做 PPT、查资料', scenes: { write: '帮你写方案', search: '帮你查资料', read: '文档表格电子书都能传', ppt: '帮你做 PPT', image: '抠图、擦除、扩图、变清晰' } },
  kimi: { group: 'cn', persona: 'moonshotai', line: '智能体做 PPT 和深度研究', scenes: { write: '文档智能体帮写', search: '深度研究智能体', ppt: '智能体生成演示文稿', code: '生成应用和网站' } },
  qianwen: { group: 'cn', persona: 'alibaba', line: '写作、PPT、生图、生视频', scenes: { write: '有专门的 AI 写作', search: 'AI 搜索加研究模式', ppt: 'PPT 创作带模板', image: '对话里 AI 生图', video: '对话里 AI 生视频', code: '有代码模式' } },
  yuanbao: { group: 'cn', persona: 'tencent', line: '聊天、写作、搜索都在行', scenes: { write: '写作在行', search: '搜索在行' } },
  qingyan: { group: 'cn', persona: 'zhipuai', line: '研究报告、PPT、数据分析', scenes: { search: '有研究报告入口', ppt: '有 PPT 制作入口', image: '有创意海报入口', code: '有网页应用入口' } },
  wenxin: { group: 'cn', persona: 'baidu', line: '办公学习一站解决', scenes: { write: '帮我写作、写文案', search: '任务模式查资料做分析', ppt: '有 PPT 生成入口', image: '有图片生成入口' } },
  chatgpt: { group: 'global', persona: 'openai', line: '搜索、生图、写代码', scenes: { search: '联网搜索加深度研究', ppt: '能生成和修改幻灯片', image: '一句话生成图片', code: 'Codex 写码查错改码' } },
  gemini: { group: 'global', persona: 'google', line: '读长资料、生成配图', scenes: { read: '上传长资料出综述', image: '给文章生成配图' } },
  claude: { group: 'global', persona: 'anthropic', line: '写作改稿，产出成品文件', scenes: { write: '起草初稿和改稿', search: '联网查最新信息', read: 'PDF、Word、表格都能读', ppt: '直接产出可编辑幻灯片', code: '看得懂各种编程语言' } },
  jimeng: { group: 'tool', line: '画图做视频一站式', scenes: { image: '文生图加画布精修', video: '运镜和首尾帧可控' } },
  hailuo: { group: 'tool', persona: 'minimax', line: '文字加参考素材出片', scenes: { video: '文字加参考素材出片' } },
  metaso: { group: 'tool', line: '没有广告，直达结果', scenes: { search: '没有广告，直达结果', read: '可上传文件', ppt: '有幻灯片入口' } },
  perplexity: { group: 'tool-global', persona: 'perplexity', line: '搜完给出处和原文链接', scenes: { search: '搜完给出处和原文链接' } },
  'gemini-notebook': { group: 'tool-global', line: '只依据你给的资料来读', scenes: { read: '只依据你给的资料', ppt: '把文件变成幻灯片', video: '把教材变成视频概览' } },
});

// 入口按聊天（国内、海外）、专门的工具（国内、海外）、员工自己加的分组显示；海外的要海外网络才能用。
export const aiWebGroup = entry => !entry.builtin ? 'mine' : aiWebGuide[entry.id]?.group ?? 'cn';
