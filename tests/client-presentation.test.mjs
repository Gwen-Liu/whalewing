import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { zh, en, css, explainError } from '../src/shell/presentation-content.js';
import { createSharedUi } from '../src/shell/ui.js';

const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const sorted = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')));
// 词条与样式快照：后续产品改动需明确审查这里的变化。
// 2026-10-25 全栏改版（随皮点缀）重定基线：整份样式以 theme-presentation 的变量层开头、外壳样式结尾（另见 theme-skin.test.mjs），
// 各页签按画布改版，专家“恢复原版”、定时任务运行结果、小鲸交接等新增和改写了词条。此前“只追加、逐段还原到上一版”的审查链
// （书架、书房、技巧历史各一层）不再适用：书房的纸色改为跟随皮肤、旧样式被改写，无法再逐字还原，改为对整份词条与样式的新快照。
test('全栏改版后的双语词条与样式快照', () => {
  assert.equal(Object.keys(zh).length, 647); assert.equal(Object.keys(en).length, 647);
  assert.equal(hash(sorted(zh)), '9300b2c9a350df5a392e9e40e683689f148631a5a14d1f9df90ee6506f4145d7');
  assert.equal(hash(sorted(en)), '6e034589d4acfff7ebd80e8a53cd272593543209c193374cd740b1c668438614');
  assert.equal(hash(css), 'e1eb01080d4db090495421a861ff63a9ac4b0546445e6dc18c7b99cc5c536b04');
  assert.equal(zh.newsHeadline, '来源标题'); assert.equal(en.newsHeadline, 'Source headline'); assert.equal(zh.newsViewSource, '查看来源');
  assert.equal(zh.library, '书架'); assert.equal(zh.learningTip, 'AI 使用技巧'); assert.equal(zh.libraryAll, '全部'); assert.equal(zh.libraryDailyBadge, '常看');
  assert.equal(zh.skillLibrary, '技能成长', '页签和页标题统一叫“技能成长”');
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
  const modal = declarations('.yj-modal.yj-page[open]');
  assert.equal(modal.position, 'fixed');
  assert.equal(modal.inset, '24px 16px');
  assert.equal(modal.margin, 'auto');
  assert.equal(modal.width, 'min(820px,calc(100vw - 32px))');
  assert.equal(modal['max-height'], 'calc(100dvh - 48px)');
  const confirm = declarations('.yj-modal.yj-confirm.yj-page[open]');
  assert.equal(confirm.width, 'min(440px,calc(100vw - 32px))');
  const book = declarations('.yj-modal.yj-book[open]');
  assert.equal(book.width, 'min(1240px,calc(100vw - 48px))');
  const drawer = declarations('.yj-editor');
  assert.equal(drawer.inset, '12px 12px 12px auto');
  assert.equal(drawer.margin, '0');
  assert.equal(declarations('html[data-platform=darwin] .yj-modal.yj-page[open]').top, 'calc(var(--dsh-frame-top-clearance,0px) + 24px)');
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
      assert.equal(tree.props.className, 'yj-modal yj-page');
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
