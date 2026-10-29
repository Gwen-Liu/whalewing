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
// 同日用户定鲸翼是全新项目、和旧名彻底无关：样式前缀统一改成 ww-（WhaleWing）。把前缀换回旧名后指纹与改名前的基线逐字相同，样式本身没变。
// 同日按用户反馈，让出窗口标题栏的几条样式从只对 macOS 改成 macOS 和 Windows 桌面版都生效。
// 2026-10-28 用户要求电子书阅读器改成电脑上的读法：正文一栏上下滚动、目录在左侧，去掉左右翻页（“上一页”“下一页”两个词条），
// 新增“本章小节”“正文”“查看大图”和章末“停一下再往下滚，进入下一章”四个词条。
// 同日按用户反馈，正文滚动条加宽到 14px、滑块平时就看得见（皮肤把滚动条设成和底色几乎一样），目录滚动条用同一种颜色。
// 同日按用户对 7 个待确认问题的决定：技能、资讯领域抽屉按钮改成具体动作（去掉“保存技能”“保存领域”，新增“创建技能”“添加”和两个“保存修改”），
// 书架分组抽屉的放弃确认、个人知识“用最新内容替换草稿”确认各加词条。
// 同日修功能测试列出的已知问题：知识卡片页头加现状摘要（7 个词条）、导入 0 字节文件的提示、技能标识规则的说明；
// 资讯页头改成和其他页头一样的标题加摘要（去掉垂直居中）。
// 同日用户定“工具台”改名“办公工坊”（DSH 的“工具”指给模型调用的工具）：只改了 toolbox 一个词条（英文没有单独译名，沿用中文），中英文都把它换回“工具台”后指纹与上一版逐字相同。
test('全栏改版后的双语词条与样式快照', () => {
  assert.equal(Object.keys(zh).length, 659); assert.equal(Object.keys(en).length, 659);
  assert.equal(hash(sorted(zh)), 'f7821d58deaba65b9b1e1f7387be1747abdd7df0186fdc80bc6664cf2bb956cd');
  assert.equal(hash(sorted(en)), '70249dbb562b13b1971011266e0174ed915f234028bb5772603452ccbe99e56a');
  assert.equal(hash(css), '06260ea6b8cd1197203fd33ae9a4f15159914a35db83f50cbc2a1ed18fdbc130');
  assert.ok(css.includes('.ww-book-scroll{--dsh-scrollbar-width:14px;--dsh-scrollbar-thumb-border:4px;'), '正文滚动条够宽好拖');
  assert.equal(zh.newsHeadline, '来源标题'); assert.equal(en.newsHeadline, 'Source headline'); assert.equal(zh.newsViewSource, '查看来源');
  assert.equal(zh.library, '书架'); assert.equal(zh.learningTip, 'AI 使用技巧'); assert.equal(zh.libraryAll, '全部'); assert.equal(zh.libraryDailyBadge, '常看');
  assert.equal(zh.skillLibrary, '技能成长', '页签和页标题统一叫“技能成长”');
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
test('领域错误归位保留原122项错误及未知码的显示与优先级', () => {
  assert.equal(hash(codes.map(code => [code, explainError(code, '测试原文')])), 'ffe6707db298b063be1e614d1604c793e9511efc322a74213277255e84c09872');
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
  assert.equal(modal.width, 'min(820px,calc(100vw - 32px))');
  assert.equal(modal['max-height'], 'calc(100dvh - 48px)');
  const confirm = declarations('.ww-modal.ww-confirm.ww-page[open]');
  assert.equal(confirm.width, 'min(440px,calc(100vw - 32px))');
  const book = declarations('.ww-modal.ww-book[open]');
  assert.equal(book.width, 'min(1240px,calc(100vw - 48px))');
  const drawer = declarations('.ww-editor');
  assert.equal(drawer.inset, '12px 12px 12px auto');
  assert.equal(drawer.margin, '0');
  // 2026-10-27 用户：Windows 桌面版小窗时阅读器顶栏、抽屉的“×”压进窗口标题栏；大窗小窗位置规则要一致，小窗只把显示区域调小。
  // 所以让出标题栏的规则对 macOS 和 Windows 桌面版都生效（DSH 在两者上都给出 --dsh-frame-top-clearance）。
  const clear = 'html:is([data-platform=darwin],[data-windows-titlebar])';
  assert.equal(declarations(`${clear} .ww-modal.ww-page[open]`).top, 'calc(var(--dsh-frame-top-clearance,0px) + 24px)');
  assert.equal(declarations(`${clear} .ww-modal`)['max-height'], 'calc(100dvh - var(--dsh-frame-top-clearance,0px) - 48px)');
  assert.deepEqual(declarations(`${clear} .ww-editor`), { top: 'calc(var(--dsh-frame-top-clearance,0px) + 12px)', height: 'calc(100dvh - var(--dsh-frame-top-clearance,0px) - 24px)' });
  assert.equal(declarations(`${clear} .ww-modal.ww-book[open]`).height, 'min(900px,calc(100dvh - var(--dsh-frame-top-clearance,0px) - 48px))');
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

test('技能详情的正文铺满详情卡，不在宽屏右边留一大片空白', () => {
  assert.match(css, /.ww-page .ww-skill-library .ww-skill-detail pre{max-width:none;/);
  assert.doesNotMatch(css, /ww-skill-detail pre{max-width:80ch/);
});
