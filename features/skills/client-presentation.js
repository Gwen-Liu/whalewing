
/** 领域文案与样式；组合入口只保留原有级联位置。 */
export const zh = {
  "skillRemoveTitle": "删除技能",
  "skillResetTitle": "恢复系统原件",
  "skillRollbackTitle": "恢复旧版技能",
  "skillRemoved": "技能已删除",
  "skillResetDone": "已恢复系统原件",
  "skillRolledBack": "已恢复旧版技能",
  "skillToggled": "技能状态已更新",
  "skillSaved": "技能已保存",
  "skills": "技能中心",
  "emptySkills": "还没有技能。点右上角“添加”新建或上传，或到“发现”里从 skills.sh 装",
  "candidate": "候选",
  "disable": "停用技能",
  "restoreSkill": "恢复技能",
  "skillIssue": "需要修复",
  "rollbackSkill": "回退到发布前旧版",
  "confirmRollback": "确认恢复最近一次发布前的有效旧版？不是恢复停用的当前版本；旧版来源失效时会保留现状",
  "confirmRollbackAction": "确认回退",
  "refinePrompt": "请和我一起创建一项个人技能。先问清它要解决什么问题、什么时候用；查一下现有技能和知识里有没有相关的，有来源笔记就按技能演进流程从知识提炼候选，和我确认后再发布；不要直接发布",
  "skillOverrideConflict": "同名位置不是这项系统技能的有效个人修改，请先在技能库处理冲突；原件与现有文件均保留",
  "skillLibrary": "技能中心",
  "skillExtension": "扩展",
  "skillReadOnly": "只读",
  "skillExtensionHelp": "这项技能由「{name}」提供，只读；专家和{assistantShort}可以直接调用，要修改请到「{name}」里改",
  "skillHelp": "已入库不代表当前对话已使用",
  "newSkill": "新增技能",
  "editSkill": "编辑技能",
  "skillCreate": "创建技能",
  "skillSaveChanges": "保存修改",
  "removeSkill": "删除用户技能",
  "resetSkill": "恢复系统原件",
  "skillContent": "技能内容（Markdown）",
  "skillIdentifier": "技能标识",
  "skillIdentifierHelp": "使用简短的英文小写字母、数字或连字符，保存后保持不变",
  "skillIdentifierRule": "技能标识只能用英文小写字母、数字和连字符（如 my-skill），连字符不能在开头、结尾或连用，最长 80 个字符",
  "builtin": "系统内置",
  "override": "系统技能的个人修改",
  "evolution": "知识提炼",
  "catalogued": "已入库",
  "skillMissing": "此技能已不存在，请刷新技能库",
  "skillReadback": "没能确认保存结果，当前内容还在；请重新读取已保存的版本",
  "skillLoadSaved": "加载已保存版本",
  "skillConfirmRemove": "删除这项用户技能？",
  "skillConfirmReset": "清除个人修改并恢复系统原件？",
  "skillBuiltinHelp": "系统原件保留；编辑会创建个人修改，之后可以重置",
  "skillBaseUpdatedShort": "原件已更新",
  "skillBaseUpdated": "系统原件已随插件更新。你的修改照常生效；想改用新版，点“恢复系统原件”。",
  "sourcePaths": "知识来源",
  "skillEdit": "与{assistantShort}编辑技能",
  "skillEditPrompt": "请协助编辑我所选的自有技能：{reference}。先通过 whalewing_skill 的 read 动作读取指定 name 和 state，核对返回 hash 与上述已读 hash 一致；不一致时停止修改并请我重新选择。读取来源后和我确认编辑内容，再按现有技能演进流程处理；不要按同名的其他状态替换，也不要修改宿主或其他插件的技能正文"
};
export const en = {
  "skillHelp": "In library does not mean this conversation has used it",
  "catalogued": "In library"
};
export const styles = [
// 2026-11-09 技能中心页照 Claude 桌面版“自定义”页：页面撑满主区，顶上一行分段、搜索、筛选、排序、添加，窄了换行；下面列表或卡片自己滚动。
`.ww-page .ww-kit-page{display:flex;flex-direction:column;height:100%;min-height:0}.ww-page .ww-kit-body{flex:1;min-height:0;overflow:auto;padding:2px 2px 24px}
.ww-page .ww-kit-toolbar{flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin:4px 0 16px}.ww-page .ww-kit-tabs{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.ww-page .ww-kit-actions{display:flex;align-items:center;gap:6px;margin-left:auto;min-width:0}.ww-page .ww-grow{flex:1 1 0;min-width:0}
.ww-page .ww-kit-segment{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:color-mix(in srgb,var(--ww-ink) 6%,transparent)}.ww-page .ww-kit-segment button{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;padding:5px 14px;border-radius:8px;color:var(--ww-ink-2);font-size:13px;min-height:28px}.ww-page .ww-kit-segment button[aria-selected=true]{background:var(--ww-surface);color:var(--ww-ink);font-weight:500;box-shadow:0 1px 2px var(--ww-line-2)}.ww-page .ww-kit-segment button:hover:not([aria-selected=true]):not(:disabled){color:var(--ww-ink)}
.ww-page .ww-kit-toolbar .ww-kit-search{flex:0 1 clamp(8rem,18vw,18rem);width:clamp(8rem,18vw,18rem);height:32px}.ww-page .ww-kit-toolbar .ww-icon-button.ww-kit-active{color:var(--ww-brand,var(--ww-ink));background:var(--ww-tint)}
.ww-page .ww-menu-surface .ww-kit-check{display:inline-block;width:1.1em;color:var(--ww-ink)}.ww-page .ww-menu-surface button{display:flex;align-items:center;gap:8px}.ww-page .ww-menu-surface button small{margin-left:auto;padding-left:16px;color:var(--ww-ink-3)}`,
// “我的”：三列列表（名称和说明 / 类型 / 状态），按个人、团队、内置分组；列宽按比例，窄了藏掉“类型”一列。
`.ww-page .ww-kit-table{display:flex;flex-direction:column;gap:6px}.ww-page .ww-kit-thead,.ww-page .ww-kit-row{display:grid;grid-template-columns:2.25rem minmax(0,1fr) minmax(5rem,clamp(6rem,18%,11rem)) minmax(3.5rem,clamp(4rem,12%,7rem));align-items:center;gap:12px}
.ww-page .ww-kit-thead{padding:0 12px 8px;border-bottom:1px solid var(--ww-line);font-size:12px;color:var(--ww-ink-3)}.ww-page .ww-kit-thead span:first-child{grid-column:1 / 3}
.ww-page .ww-kit-group h3{display:flex;align-items:baseline;gap:6px;margin:14px 12px 4px;font-size:12px;font-weight:500;letter-spacing:.06em;color:var(--ww-ink-3)}.ww-page .ww-kit-group h3 small{font-size:12px;opacity:.8}
.ww-page .ww-kit-group ul,.ww-page .ww-kit-cards{list-style:none;margin:0;padding:0}.ww-page .ww-kit-row{width:100%;min-height:0;padding:10px 12px;border:0;border-bottom:1px solid var(--ww-line);border-radius:0;background:transparent;text-align:left;color:var(--ww-ink);font-weight:400}.ww-page .ww-kit-row:hover:not(:disabled){background:var(--ww-tint);border-radius:10px}
.ww-page .ww-kit-icon{display:inline-grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:10px;border:1px solid var(--ww-line);background:var(--ww-surface);font:600 14px/1 var(--ww-serif);color:var(--ww-ink-2)}.ww-page .ww-kit-icon[data-tone=mine],.ww-page .ww-kit-icon[data-tone=official]{color:var(--ww-brand,var(--ww-ink))}.ww-page .ww-kit-icon[data-tone=team]{color:#7c5cc4}
.ww-page .ww-kit-main{display:flex;flex-direction:column;gap:2px;min-width:0}.ww-page .ww-kit-main .ww-kit-name{font:500 14px/1.4 var(--ww-serif);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ww-page .ww-kit-main small{font-size:12.5px;color:var(--ww-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ww-page .ww-kit-type{font-size:12.5px;color:var(--ww-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ww-page .ww-kit-status{font-size:12.5px;color:var(--ww-ink-3);white-space:nowrap}.ww-page .ww-kit-status[data-tone=ok]{color:var(--ww-ok)}.ww-page .ww-kit-status[data-tone=warn]{color:var(--ww-warn)}.ww-page .ww-kit-status[data-tone=error]{color:var(--ww-err)}
.ww-page .ww-kit-more{display:inline-flex;align-items:center;gap:4px;margin:8px 12px 0;border:0;background:transparent;padding:4px 0;color:var(--ww-ink-2);font-size:13px}.ww-page .ww-kit-more:hover{color:var(--ww-ink)}
.ww-page .ww-kit-empty{margin:40px auto;max-width:28rem;text-align:center;color:var(--ww-ink-3)}.ww-page .ww-kit-empty button{margin-top:10px}
@container ww-main (max-width:40rem){.ww-page .ww-kit-thead{display:none}.ww-page .ww-kit-row{grid-template-columns:2.25rem minmax(0,1fr) auto}.ww-page .ww-kit-row .ww-kit-type{display:none}}`,
// “发现”：分栏标题加“显示全部”，下面两列卡片（窄了一列），卡片右边一个加号；点开右侧抽屉预览。
`.ww-page .ww-kit-shelves{display:flex;flex-direction:column;gap:26px}.ww-page .ww-kit-shelf>header{display:flex;align-items:baseline;justify-content:space-between;margin:0 2px 10px}.ww-page .ww-kit-shelf h3{display:inline-flex;align-items:center;gap:8px;margin:0;font:600 16px/1.4 var(--ww-serif)}.ww-page .ww-kit-shelf .ww-kit-more{margin:0}
.ww-page .ww-kit-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr));gap:12px}.ww-page .ww-kit-card{display:grid;grid-template-columns:2.5rem minmax(0,1fr) auto;align-items:start;gap:12px;width:100%;height:100%;min-height:0;padding:14px 16px;border:1px solid var(--ww-line);border-radius:14px;background:var(--ww-surface);text-align:left;color:var(--ww-ink);font-weight:400}.ww-page .ww-kit-card:hover:not(:disabled){border-color:var(--ww-line-3);background:var(--ww-tint)}.ww-page .ww-kit-card .ww-kit-icon{width:2.5rem;height:2.5rem}
.ww-page .ww-kit-add{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;border:1px solid var(--ww-line-2);color:var(--ww-ink-2)}.ww-page .ww-kit-card:hover .ww-kit-add{color:var(--ww-ink);border-color:var(--ww-line-3)}
.ww-page .ww-kit-note{margin:0;font-size:12.5px;color:var(--ww-ink-3)}.ww-page .ww-kit-note a,.ww-page .ww-kit-facts a{margin-left:6px;color:var(--ww-ink-2)}
.ww-page .ww-kit-facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 16px;margin:4px 0 14px;font-size:13px}.ww-page .ww-kit-facts dt{color:var(--ww-ink-3)}.ww-page .ww-kit-facts dd{margin:0;overflow-wrap:anywhere}
.ww-page .ww-kit-rec{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 14px}.ww-page .ww-kit-rec .ww-kit-hint{flex-basis:100%;color:var(--ww-ink-3)}
.ww-page .ww-kit-content{max-width:none;margin:12px 0 0;padding:14px 16px;white-space:pre-wrap;overflow-wrap:anywhere;border:0;border-radius:12px;background:var(--ww-surface-2);font:12.5px/1.75 var(--dsw-font-family-mono,ui-monospace,monospace);color:var(--ww-ink)}.ww-page .ww-kit-subhead{margin:16px 0 6px;font-size:13px}.ww-page .ww-kit-paths{margin:0;padding-left:18px;font-size:12.5px;color:var(--ww-ink-2)}
.ww-page .ww-notice.ww-warn{border-color:color-mix(in srgb,var(--ww-warn) 45%,transparent)}.ww-page .ww-danger-text{color:var(--ww-err)}.ww-page .ww-kit-link{display:inline-flex;align-items:center;gap:4px;font-size:13px;color:var(--ww-ink-2)}
.ww-page .ww-kit-pairs{display:flex;flex-direction:column;gap:8px;margin:14px 0;padding:10px 12px;border:1px solid var(--ww-line);border-radius:12px}.ww-page .ww-kit-pairs legend{padding:0 6px;font-size:12.5px;color:var(--ww-ink-2)}.ww-page .ww-kit-pair{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr) auto auto;align-items:center;gap:8px}.ww-page .ww-kit-pairs .ww-kit-more{margin:0;align-self:flex-start}

.ww-page .ww-kit-links{display:flex;gap:16px;margin:0 0 10px;font-size:13px}.ww-page .ww-kit-links a{display:inline-flex;align-items:center;gap:4px;color:var(--ww-ink-2)}.ww-page .ww-kit-lead{margin:0 0 8px;color:var(--ww-ink-2)}.ww-page .ww-kit-hint{color:var(--ww-ink-3);font-size:12px}.ww-page .ww-kit-facts code{font-size:12px;overflow-wrap:anywhere}
.ww-page .ww-kit-status svg{vertical-align:-2px}
.ww-page img.ww-kit-icon{object-fit:contain;padding:4px}.ww-page .ww-kit-index{display:flex;gap:8px;margin-top:10px}.ww-page .ww-kit-index input{flex:1;min-width:0}`,
// 插件包：抽屉里的技能和 MCP 清单（一行名字一行说明）、安装预览里可勾选的 MCP 和就地填的密钥、市场栏右上角的小按钮。
`.ww-page .ww-kit-items{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}.ww-page .ww-kit-items>li>button,.ww-page .ww-kit-items>li>div{display:flex;flex-direction:column;align-items:stretch;gap:2px;width:100%;min-height:0;padding:7px 10px;border:0;border-radius:10px;background:transparent;text-align:left;color:var(--ww-ink);font-weight:400}.ww-page .ww-kit-items>li>button:hover:not(:disabled){background:var(--ww-tint)}
.ww-page .ww-kit-items strong{display:flex;align-items:center;gap:6px;font:500 13.5px/1.4 var(--ww-serif);overflow-wrap:anywhere}.ww-page .ww-kit-items small{font-size:12.5px;color:var(--ww-ink-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.ww-page .ww-kit-items small[data-tone=ok]{color:var(--ww-ok)}.ww-page .ww-kit-items small[data-tone=error]{color:var(--ww-err)}
.ww-page .ww-kit-picks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.ww-page .ww-kit-picks>li{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:1px solid var(--ww-line);border-radius:12px}.ww-page .ww-kit-picks>li[data-blocked]{opacity:.7}.ww-page .ww-kit-picks label:not(.ww-choice){margin-top:6px}
.ww-page .ww-kit-target{font:12px/1.5 var(--dsw-font-family-mono,ui-monospace,monospace);color:var(--ww-ink-3);overflow-wrap:anywhere}.ww-page .ww-kit-why{font-size:12.5px;color:var(--ww-ink-2)}.ww-page .ww-kit-why[data-tone=error]{color:var(--ww-err)}.ww-page .ww-kit-why[data-tone=warn]{color:var(--ww-warn)}
.ww-page .ww-kit-inline{margin-left:8px;padding:0;border:0;background:transparent;min-height:0;font-size:12.5px;color:var(--ww-ink-2);text-decoration:underline;text-underline-offset:3px}.ww-page .ww-kit-inline:hover{color:var(--ww-ink)}.ww-page .ww-kit-shelf-actions{display:inline-flex;align-items:baseline;gap:14px}.ww-page .ww-kit-shelf h3 .ww-kit-hint{font-family:inherit;font-weight:400;font-size:12px;text-decoration:none}.ww-page dialog .ww-kit-items+.ww-kit-note,.ww-page dialog .ww-kit-paths+.ww-kit-note,.ww-page dialog .ww-kit-note+.ww-kit-note{margin-top:12px}
.ww-page .ww-kit-mine>.ww-kit-group>h3{margin-left:2px}.ww-page .ww-kit-tiles{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px clamp(12px,2vw,28px)}.ww-page .ww-kit-tiles .ww-kit-row{grid-template-columns:2.25rem minmax(0,1fr) auto;border-bottom:0;border-radius:10px}.ww-page .ww-kit-tiles .ww-kit-row:hover:not(:disabled){border-radius:10px}.ww-page .ww-kit-tiles .ww-kit-main .ww-kit-type{display:inline;font-size:inherit;color:var(--ww-ink-3)}
.ww-page .ww-kit-mine>.ww-kit-group>.ww-kit-more{margin-left:12px}.ww-page .ww-kit-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin;margin:22px 0 4px;padding:2px 2px 8px;border-top:1px solid var(--ww-line);padding-top:16px}.ww-page .ww-kit-chips .ww-chip{flex:none}.ww-page .ww-kit-chips small{font-size:12px;color:var(--ww-ink-3)}
@container ww-main (max-width:44rem){.ww-page .ww-kit-tiles{grid-template-columns:minmax(0,1fr)}}`,
// MCP（0.2.2-rc.3.2）：状态一栏放得下“连不上 · 12 秒后第 4 次重试”和下面一行原因；密钥一块一项；试连的结果；升级后的搬家提示。
`.ww-page .ww-kit-table[data-kind=mcp] .ww-kit-thead,.ww-page .ww-kit-table[data-kind=mcp] .ww-kit-row{grid-template-columns:2.25rem minmax(0,1fr) minmax(4.5rem,clamp(5rem,12%,8rem)) minmax(8rem,clamp(9rem,32%,22rem))}
.ww-page .ww-kit-state{display:grid;gap:1px;min-width:0}.ww-page .ww-kit-state .ww-kit-status{overflow:hidden;text-overflow:ellipsis}.ww-page .ww-kit-state .ww-kit-why{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--ww-ink-3)}
.ww-page .ww-kit-name .ww-tag{margin-left:6px;font-size:11px;vertical-align:1px}
.ww-page .ww-kit-secret{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;margin:0 0 8px;padding:8px 12px;border-radius:12px;background:var(--ww-surface-2)}.ww-page .ww-kit-secret .ww-kit-main{display:grid;min-width:0}.ww-page .ww-kit-secret .ww-kit-hint{overflow-wrap:anywhere}
.ww-page .ww-kit-secret-edit{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex:1 1 16rem;justify-content:flex-end}.ww-page .ww-kit-secret-edit input{flex:1 1 10rem;min-width:0}.ww-page .ww-kit-secret-state{display:inline-flex;align-items:baseline;gap:4px}
.ww-page .ww-kit-probe{display:grid;gap:4px}.ww-page .ww-kit-probe p{margin:0}.ww-page .ww-kit-probe[data-tone=ok] strong{color:var(--ww-ok)}
.ww-page .ww-kit-moved{display:flex;align-items:center;gap:12px;margin:0 0 12px}.ww-page .ww-kit-moved p{flex:1;margin:0}.ww-page .ww-kit-moved small{color:var(--ww-ink-3)}
@container ww-main (max-width:40rem){.ww-page .ww-kit-table[data-kind=mcp] .ww-kit-row{grid-template-columns:2.25rem minmax(0,1fr) minmax(0,auto)}.ww-page .ww-kit-state{justify-items:end;max-width:12rem}}`
];

// 专属错误只解释本领域；输入原文与公共运输错误由共用呈现机制处理。
export const errors = {
  "SKILL_ROOT": [
    "目标位置不能使用（本机文件问题）",
    "请换一个普通文件夹（不要用快捷方式、网络盘或系统目录）后重试"
  ],
  "SKILL_SOURCE_ROOT": [
    "目标位置不能使用（本机文件问题）",
    "请换一个普通文件夹（不要用快捷方式、网络盘或系统目录）后重试"
  ],
  "SKILL_SIZE": [
    "内容超出了允许的大小或数量（填写内容问题）",
    "请缩短内容或减少数量后重试"
  ],
  "SKILL_STALE": [
    "这项内容刚在别处被修改过（数据已变化）",
    "你的修改仍在编辑区，请先「重新读取」查看最新内容，再决定如何保存"
  ],
  "SKILL_ORIGIN": [
    "系统内置的内容不能直接这样修改",
    "可以先复制或新建一份属于你的，再修改"
  ],
  "SKILL_STATE": [
    "系统内置的内容不能直接这样修改",
    "可以先复制或新建一份属于你的，再修改"
  ],
  "SKILL_SHADOWED": [
    "系统内置的内容不能直接这样修改",
    "可以先复制或新建一份属于你的，再修改"
  ]
};
errors.SKILL_SOURCE_READONLY = ["这项团队技能只能查看", "要改请找它的维护人，或在提供它的扩展里改"];
errors.SKILL_SOURCE_SAVE = ["提供这项技能的扩展没有保存成功", "你的修改还在编辑框里，看一下右上角写的原因后重试"];
errors.SKILL_SOURCE_CLOSED = ["提供这项技能的扩展已关闭或卸载", "重新打开那个扩展后刷新技能页"];
errors.MCP_NAME = ["MCP 的英文名不能用（填写问题）", "只用小写字母、数字和单个短横线，最长 32 个字符，也不能和已有的重名"];
errors.MCP_INPUT = ["MCP 的设置没填完整（填写问题）", "远程服务填 http(s) 地址，本机程序填命令（如 npx）"];
errors.MCP_SECRET = ["有密钥还没填（填写问题）", "第一次保存要把标了“密钥”的项都填上"];
errors.MCP_NO_CREDENTIALS = ["DSH 的凭据库没有加载，带密钥的 MCP 存不了（DSH 配置问题）", "在 DSH 插件页确认凭据相关的内置插件开着，重启 DSH 后再试"];
errors.MCP_MISSING = ["这个 MCP 已经删掉了", "刷新一下列表"];
errors.MCP_DISABLED = ["这个 MCP 已断开", "先点“连接”"];
errors.MCP_CLOSED = ["MCP 暂时读不了（插件正在启动或关闭）", "稍等一下点“重试”"];
errors.SKILL_EXISTS = ["已经有同名的技能（没有覆盖）", "要换成新的，先在“我的”里删掉原来那个再装"];
errors.MARKET_NETWORK = ["连不上 skills.sh（网络问题）", "检查网络后点“重试”；skills.sh 在国内一般能直连"];
errors.MARKET_BUSY = ["skills.sh 说请求太频繁", "过一分钟再试"];
errors.MARKET_MISSING = ["skills.sh 上找不到这项技能了", "可能被作者删掉或改了名，换一个搜搜"];
errors.MARKET_CHANGED = ["这项技能在 skills.sh 上刚更新过", "关掉重新打开看一眼新版本再装"];
errors.MARKET_REPLY = ["skills.sh 返回的内容不完整或读不懂", "稍后重试；一直这样的话可能是它改版了，请反馈给鲸翼"];
errors.PACK_FORMAT = ["这不是能装的插件包（填写问题）", "插件包要打包成 .zip，最上层有 .claude-plugin/plugin.json"];
errors.PACK_NAME = ["插件包的名称不合规（填写问题）", "plugin.json 里的 name 只用英文小写字母、数字和短横线"];
errors.PACK_SKILL = ["插件包里的技能有问题", "看一下提示里说的是哪项技能，改好后重新打包"];
errors.PACK_SIZE = ["插件包太大了", "最多约 500 个文件、32 MB"];
errors.PACK_EXISTS = ["这个插件包已经装了（没有覆盖）", "要换成新版，先在“我的”里卸载原来那个再装"];
errors.PACK_MISSING = ["找不到这个插件包了", "刷新一下；市场里的包可能被作者挪走或删了"];
errors.PACK_NETWORK = ["连不上 GitHub（网络问题）", "国内网络可能要开代理；鲸翼精选照常能装"];
errors.PACK_BUSY = ["GitHub 说请求太频繁", "过几分钟再试"];
errors.PACK_REPLY = ["插件包市场的清单读不懂", "稍后重试；一直这样请反馈给这个市场的作者"];
errors.PACK_SOURCE = ["这个插件包鲸翼暂时装不了", "它放在 GitHub 以外的地方，或者要用命令行装"];
errors.PACK_STALE = ["预览已经过期了", "关掉重新打开这个包再装"];
errors.PACK_CHANGED = ["插件包的内容刚变了", "关掉重新打开看一眼再装"];
errors.PACK_MCP_MISSING = ["有 MCP 的密钥还没填（填写问题）", "填上，或者取消勾选那个 MCP"];
errors.PACK_INPUT = ["插件包市场的地址不对（填写问题）", "填 GitHub 仓库，比如 owner/repo"];
export const inputCodes = [
  "MARKET_ID",
  "SKILL_NAME",
  "SKILL_FORMAT",
  "SKILL_SOURCE",
  "SKILL_REVIEW",
  "SKILL_EVOLUTION",
  "SKILL_DISCOVERY"
];
