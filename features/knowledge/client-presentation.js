
/** 领域文案与样式；组合入口只保留原有级联位置。 */
export const zh = {
  "noteRemoveTitle": "移出笔记",
  "draftDiscardTitle": "放弃草稿",
  "reloadConfirmTitle": "用最新内容替换草稿",
  "reloadConfirmHelp": "读取最新内容会替换编辑区，你还没保存的草稿会丢失。要留着的话，先点“导出当前正文”。",
  "draftDirty": "有未保存的修改",
  "root": "知识库位置",
  "query": "关键词（留空列出笔记）",
  "emptyNotes": "没有匹配笔记，可新建或交给专家整理",
  "truncated": "当前仅展示部分结果，请缩小关键词范围",
  "newNote": "新建笔记",
  "notePath": "库内 Markdown 路径",
  "confirmRemove": "确认移出这篇笔记",
  "restorePath": "要恢复的笔记路径",
  "export": "导出当前正文",
  "validate": "检查属性与链接",
  "valid": "检查通过，共 {count} 篇笔记",
  "invalid": "发现待处理项，共 {count} 篇笔记",
  "saved": "已保存",
  "deleted": "已移到可恢复区",
  "restored": "已恢复",
  "savedReadback": "文件已保存，但没能读回最新内容；草稿还在，请先重新读取",
  "listRefreshFailed": "文件操作已完成，列表尚未刷新；可重试查找笔记",
  "relationsUnavailable": "正文已打开；链接和反向链接暂时读不到",
  "reloadHelp": "读取后用最新正文替换编辑区；请先导出需要保留的草稿",
  "newNoteTitle": "新笔记",
  "resetGraph": "重置视图",
  "graphVersionMismatch": "图谱数据与当前界面不匹配，请完全退出并重新打开 DSH",
  "graphPreparing": "正在准备图谱 {done}/{total}",
  "graphCanvasError": "当前环境尚未提供 Canvas 图谱支持",
  "graphDataError": "图谱包含未返回的节点，请重新读取图谱",
  "selectNote": "选择笔记阅读，或新建一篇",
  "draftWarning": "切换笔记或会话前，请保存或导出编辑区草稿",
  "confirmDiscard": "确认放弃未保存的修改",
  "preparing": "正在连接知识库",
  "edit": "编辑",
  "noBacklinks": "暂无反向链接",
  "linkMissing": "链接目标缺失",
  "linkAmbiguous": "链接存在多个目标，请从列表选择",
  "fragmentMissing": "目标笔记存在，但标题或块定位缺失或重名",
  "invalidLink": "此链接不是有效的库内笔记引用",
  "linkAttachment": "这是附件引用，不作为笔记打开，也未检查附件是否存在",
  "noteReadOnly": "此笔记仅供阅读，不在插件编辑、删除或恢复范围内",
  "missingGraphNote": "此笔记尚不存在；这里只展示引用关系，不是实际文件",
  "missingGraphSources": "引用来源",
  "reading": "笔记阅读",
  "graph": "关系图谱",
  "directoryResize": "调整目录宽度",
  "localGraph": "当前笔记关系图",
  "graphRange": "图谱显示范围",
  "graphPage": "{from}–{to} / {total}",
  "graphPartial": "部分关系",
  "graphOmitted": "另有 {count} 条连线不在当前画面内",
  "graphEmpty": "该范围没有笔记",
  "selectForQuestion": "选入问答：{name}",
  "allNotes": "全部笔记",
  "folder": "文件夹",
  "more": "更多操作",
  "notes": "笔记",
  "noteDetails": "笔记详情",
  "libraryTools": "知识库工具",
  "directoryLoading": "正在读取目录",
  "directoryRetry": "重试目录",
  "searchPlaceholder": "搜索笔记…"
};
export const en = {
  "graphVersionMismatch": "Graph data does not match this interface. Fully quit and reopen DSH",
  "graphPreparing": "Preparing graph {done}/{total}",
  "graphCanvasError": "Canvas graph is not available in this environment",
  "graphDataError": "The graph references missing nodes; reload the graph",
  "linkAttachment": "This is an attachment reference, not a note; attachment existence has not been checked",
  "noteReadOnly": "This note is read-only; editing, deleting and restoring are not available in the plugin",
  "missingGraphNote": "This note does not exist. The graph shows references, not a file",
  "missingGraphSources": "Referenced by",
  "graph": "Knowledge graph",
  "directoryResize": "Resize note directory"
};
export const styles = [
`.ww-note{text-align:left;overflow-wrap:anywhere}.ww-note small{display:block;color:var(--dsw-alias-label-secondary);font-weight:400}`,
`
    .ww-note-row{display:flex;gap:8px;align-items:center}.ww-note-row .ww-note{flex:1;min-width:0}`,
`.ww-graph{width:100%;height:440px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}.ww-graph line{stroke:var(--dsw-alias-border-l2);stroke-width:1.5}.ww-graph circle{fill:var(--dsw-alias-brand-primary);cursor:pointer}.ww-graph text{fill:var(--dsw-alias-label-primary);font-size:13px;pointer-events:none}.ww-graph [role=button]:focus circle{stroke:var(--dsw-alias-label-primary);stroke-width:3}`,
`.ww-graph-frame{overflow:auto;max-height:440px}.ww-graph{display:block}.ww-graph [role=button]{pointer-events:bounding-box;cursor:pointer}`,
`
    .ww-knowledge{height:100%;min-height:0;display:flex;flex-direction:column;gap:8px}.ww-knowledge>.ww-row{flex:none}.ww-knowledge .ww-field{min-width:120px}.ww-knowledge-split{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:0;flex:1;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;overflow:hidden}.ww-note-tree{padding:12px 8px;min-height:0;overflow:auto;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}.ww-directory .ww-directory{padding-left:12px}`,
`.ww-note-row{gap:4px}.ww-page .ww-note-tree .ww-note{border:0;background:transparent;padding:6px 8px;border-radius:7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:12px}.ww-page .ww-note-tree .ww-note:hover,.ww-page .ww-note-tree .ww-selected{background:var(--dsw-alias-interactive-bg-hover)}.ww-note-tree input[type=checkbox]{width:12px;height:12px;flex:none}.ww-note-canvas{overflow:auto;min-width:0;min-height:0;padding:20px 24px;background:var(--dsw-alias-bg-layer-1)}.ww-note-canvas .ww-reader{max-width:800px;margin:auto;padding-top:16px}.ww-note-canvas>.ww-section{margin:0;border:0;padding:0}.ww-note-canvas label:first-child input{font-size:12px;color:var(--dsw-alias-label-secondary);border:0;background:var(--dsw-alias-bg-layer-2);padding:5px 8px}.ww-note-actions,.ww-backlinks{margin-top:16px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px}`,
`.ww-graph-frame{max-height:none}.ww-graph{height:100%;min-height:380px;border:0;background:var(--dsw-alias-bg-layer-1)}`,
`
    @media(max-width:1100px){.ww-workspace{grid-template-columns:minmax(0,1fr) 300px;gap:12px}.ww-workspace-float,.ww-workspace-bubble{grid-template-columns:minmax(0,1fr)}.ww-knowledge-split{grid-template-columns:165px minmax(0,1fr)}.ww-note-canvas{padding:16px}.ww-page{padding:18px}.ww-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,195px),1fr))}}`,
`
    .ww-knowledge{gap:10px}.ww-knowledge-toolbar{display:flex;align-items:center;gap:6px;flex:none;min-height:36px}`,
`.ww-knowledge-split{border-radius:14px;grid-template-columns:195px minmax(0,1fr);background:var(--dsw-alias-bg-layer-1)}.ww-note-tree{padding:10px 7px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 97%,var(--dsw-alias-label-primary) 3%)}`,
`.ww-note-row{min-height:29px}.ww-page .ww-note-tree .ww-note{display:flex;align-items:center;gap:7px;padding:4px 6px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}.ww-page .ww-note-tree .ww-selected{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.ww-note-tree input[type=checkbox]{appearance:auto;opacity:0;transition:opacity .12s}.ww-note-row:hover input,.ww-note-row:focus-within input,.ww-note-tree input:checked{opacity:1}.ww-note-tree .ww-row button{font-size:11px;border:0;background:transparent;padding:3px 5px}.ww-note-canvas{padding:16px 22px}.ww-note-toolbar{display:flex;align-items:start;gap:10px;margin-bottom:16px}.ww-note-path{flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary)}.ww-note-path>summary{list-style:none;display:flex;gap:6px;align-items:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:28px}.ww-note-path[open]>label{padding-top:8px}.ww-note-toolbar .ww-row{gap:2px;flex-wrap:nowrap}.ww-note-toolbar .ww-row button{border:0;background:transparent;padding:4px 8px;font-size:11px}`,
`.ww-backlinks,.ww-note-actions{border:0;margin-top:10px;padding-top:0;font-size:12px;color:var(--dsw-alias-label-secondary)}`,
`
    @media(max-width:1100px){.ww-workspace{grid-template-columns:minmax(0,1fr) 290px;gap:12px}.ww-workspace-float,.ww-workspace-bubble{grid-template-columns:minmax(0,1fr)}.ww-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,195px),1fr))}.ww-knowledge-split{grid-template-columns:155px minmax(0,1fr)}.ww-knowledge-toolbar{flex-wrap:wrap}.ww-search{flex-basis:180px}.ww-note-canvas{padding:14px}}`,
`
    @media(max-width:520px){.ww-page{padding:12px}.ww-knowledge-split{grid-template-columns:125px minmax(0,1fr)}.ww-note-tree{padding:8px 3px}.ww-page .ww-folder{font-size:11px;gap:3px}.ww-note-canvas{padding:10px}.ww-grid{grid-template-columns:1fr}.ww-note-toolbar .ww-row button{padding:4px 6px}}`,
`
    .ww-note-canvas.ww-graph-mode{padding:0;overflow:hidden;display:flex}.ww-graph-workspace{position:relative;display:flex;flex:1;min-width:0;min-height:0}.ww-graph-empty{display:flex;flex:1;align-items:center;justify-content:center}.ww-graph-controls{position:absolute;left:10px;bottom:10px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 20px);flex-wrap:wrap;padding:4px 6px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 6px var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}.ww-page .ww-graph-controls button{padding:4px 6px;border:0;background:transparent;font-size:11px}.ww-graph-missing{position:absolute;left:12px;top:12px;max-width:min(420px,calc(100% - 24px));max-height:50%;overflow:auto;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
    .ww-knowledge-split{grid-template-columns:var(--ww-directory-width,195px) 8px minmax(0,1fr)}.ww-note-tree{min-width:0;border-right:0}.ww-directory-separator{cursor:col-resize;touch-action:none;background:var(--dsw-alias-bg-layer-2);position:relative}.ww-directory-separator:before{content:'';position:absolute;left:3px;top:0;bottom:0;width:2px;background:var(--dsw-alias-border-l1)}.ww-directory-separator:hover:before,.ww-directory-separator:focus-visible:before{background:var(--dsw-alias-state-business-primary)}.ww-directory-separator:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}`,
`.ww-folder>svg,.ww-folder-chevron,.ww-note>svg{flex-shrink:0}.ww-note-tree .ww-note{flex:1}.ww-note-row{min-width:0}`,
// 2026-10-25 随皮点缀：页头一句现状，面和分隔线跟随 DSH 与皮肤，阅读区标题用宋体、正文放宽行距。
`.ww-page .ww-knowledge-head{flex:none;margin:20px 0 6px}.ww-knowledge-head p{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.ww-knowledge-split{border-color:var(--ww-line);background:var(--ww-surface)}.ww-note-tree{background:var(--ww-surface-2)}.ww-note-canvas{background:transparent}.ww-note-canvas .ww-reader{max-width:78ch;font-size:14px;line-height:1.8}.ww-note-canvas .ww-reader :is(h1,h2,h3){font-family:var(--ww-serif);font-weight:600;letter-spacing:.01em}.ww-note-canvas .ww-reader h1{font-size:26px;line-height:1.35}.ww-note-canvas .ww-reader h2{font-size:20px}.ww-directory-separator{background:var(--ww-surface-2)}.ww-graph-controls,.ww-graph-missing{background:var(--ww-raised)}`,
// 2026-10-27 阅读区两栏：工具条固定在上，正文单独滚动；右侧栏放目录、反链、出链（Obsidian 的用法），正文大标题下面是笔记属性。
`.ww-note-canvas:not(.ww-graph-mode){display:flex;flex-direction:column;overflow:hidden;padding:0}.ww-note-canvas>.ww-note-toolbar{flex:none;align-items:center;margin:0;padding:8px 12px 8px 20px;border-bottom:1px solid var(--ww-line)}
.ww-note-body{position:relative;flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr)}.ww-note-body.ww-with-side{grid-template-columns:minmax(0,1fr) clamp(220px,25%,300px)}.ww-note-scroll{min-width:0;min-height:0;overflow:auto;padding:4px 32px 48px}
.ww-note-side{min-width:0;min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--ww-line);background:var(--ww-surface-2)}.ww-side-overlay>.ww-note-side{position:absolute;top:0;right:0;bottom:0;z-index:3;width:min(300px,88%);background:var(--ww-raised);box-shadow:-18px 0 36px -26px #00000059}
.ww-page .ww-side-toggle{flex:none;display:inline-grid;place-items:center;width:30px;height:30px;min-height:30px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--ww-ink-2)}.ww-page .ww-side-toggle[aria-pressed=true]{background:color-mix(in srgb,var(--ww-brand) 11%,transparent);color:var(--ww-brand)}.ww-page .ww-side-toggle:hover:not(:disabled){background:var(--ww-tint);color:var(--ww-ink)}
.ww-side-tabs{flex:none;display:flex;gap:2px;margin:10px 10px 6px;padding:3px;border-radius:10px;background:var(--ww-tint)}.ww-page .ww-side-tabs>button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:0;height:28px;min-height:28px;padding:0 6px;border:0;border-radius:8px;background:transparent;color:var(--ww-ink-2);font-size:12.5px;white-space:nowrap}.ww-page .ww-side-tabs>button:hover:not(:disabled){background:transparent;color:var(--ww-ink)}.ww-page .ww-side-tabs>button[aria-selected=true]{background:var(--ww-surface);color:var(--ww-ink);font-weight:600;box-shadow:0 1px 2px #0000001f,0 0 0 1px var(--ww-line)}.ww-side-tabs em{font-style:normal;font-size:11px;font-weight:500;color:var(--ww-ink-3);font-variant-numeric:tabular-nums}.ww-side-tabs [aria-selected=true] em{color:var(--ww-brand)}.ww-side-tabs svg{flex:none}
.ww-side-panel{flex:1;min-height:0;overflow:auto;padding:4px 8px 24px}.ww-side-empty{margin:14px 8px;font-size:12.5px;line-height:1.6;color:var(--ww-ink-3)}
.ww-side-outline{display:flex;flex-direction:column;gap:1px}.ww-page .ww-side-outline>button{position:relative;display:block;width:100%;height:auto;min-height:0;padding:5px 10px;border:0;border-radius:8px;background:transparent;color:var(--ww-ink-2);font-size:13px;line-height:1.45;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ww-page .ww-side-outline>button:hover:not(:disabled){background:var(--ww-tint);color:var(--ww-ink)}.ww-page .ww-side-outline>button.ww-current{background:color-mix(in srgb,var(--ww-brand) 10%,transparent);color:var(--ww-brand);font-weight:600}.ww-page .ww-side-outline>button.ww-current::before{content:"";position:absolute;left:2px;top:7px;bottom:7px;width:2px;border-radius:2px;background:var(--ww-brand)}
.ww-side-links{display:flex;flex-direction:column;gap:2px}.ww-side-group{display:flex;flex-direction:column;gap:2px;padding-bottom:6px}.ww-page .ww-side-note{display:flex;align-items:flex-start;gap:7px;width:100%;height:auto;min-height:30px;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:var(--ww-ink);font-size:13px;line-height:1.45;text-align:left}.ww-page .ww-side-note:hover:not(:disabled){background:var(--ww-tint)}.ww-side-note>svg{margin-top:2px;color:var(--ww-ink-3)}.ww-side-text{flex:1;min-width:0;display:flex;flex-direction:column}.ww-side-text strong{font-weight:500;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere}.ww-side-text small{margin-top:1px;font-size:11.5px;color:var(--ww-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ww-side-note em{flex:none;margin-top:1px;font-style:normal;font-size:11px;color:var(--ww-ink-3);font-variant-numeric:tabular-nums}.ww-side-note.ww-unresolved{color:var(--ww-ink-3)}.ww-side-note.ww-unresolved em{padding:0 6px;border-radius:6px;background:var(--ww-tint)}
.ww-page .ww-side-snippet{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;width:calc(100% - 22px);height:auto;min-height:0;margin-left:22px;padding:4px 8px;border:0;border-left:2px solid var(--ww-line-2);border-radius:0 8px 8px 0;background:transparent;color:var(--ww-ink-2);font-size:12px;line-height:1.55;text-align:left;overflow-wrap:anywhere}.ww-page .ww-side-snippet:hover:not(:disabled){background:var(--ww-tint);border-left-color:var(--ww-brand);color:var(--ww-ink)}.ww-side-snippet .ww-tag{height:18px;font-size:11px}
.ww-note-props{margin:4px 0 24px;padding:9px 14px 11px;border:1px solid var(--ww-line);border-radius:12px;background:var(--ww-tint);font-size:13px;line-height:1.6}.ww-note-props>summary{display:flex;align-items:center;gap:7px;cursor:pointer;list-style:none;color:var(--ww-ink-2);font-size:12.5px;font-weight:500}.ww-note-props>summary::-webkit-details-marker{display:none}.ww-note-props>summary::before{content:"";width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .15s}.ww-note-props[open]>summary::before{transform:rotate(45deg)}
.ww-note-props dl{display:grid;grid-template-columns:minmax(64px,max-content) minmax(0,1fr);gap:4px 18px;margin:10px 0 0}.ww-note-props dt{color:var(--ww-ink-3);font-size:12.5px;line-height:22px}.ww-note-props dd{display:flex;flex-wrap:wrap;gap:2px 12px;min-width:0;margin:0;color:var(--ww-ink);line-height:22px;overflow-wrap:anywhere}.ww-prop-empty{color:var(--ww-ink-3)}
.ww-page .ww-reader button.ww-unresolved{color:var(--ww-ink-3)!important;text-decoration:underline dashed;text-underline-offset:3px}.ww-page .ww-reader button:hover:not(:disabled){text-decoration:underline;text-underline-offset:3px}
@keyframes ww-flash{0%,35%{background:color-mix(in srgb,var(--ww-brand) 18%,transparent)}100%{background:transparent}}.ww-reader .ww-flash{border-radius:6px;animation:ww-flash 2s ease-out}
@media(max-width:1100px){.ww-note-scroll{padding:4px 20px 40px}}@media(max-width:520px){.ww-note-scroll{padding:4px 12px 32px}.ww-note-canvas>.ww-note-toolbar{padding:6px 8px 6px 12px}}
@media(prefers-reduced-motion:reduce){.ww-reader .ww-flash{animation-duration:.01s}.ww-note-props>summary::before{transition:none}}`
];

// 专属错误只解释本领域；输入原文与公共运输错误由共用呈现机制处理。
export const errors = {
  "SOURCE_CONFIG": [
    "插件没找到可用的配置目录或知识库位置（DSH 设置问题）",
    "请确认 DSH 正常启动，并检查插件配置里的知识库位置，然后重启 DSH"
  ],
  "SOURCE_DIRECTORY": [
    "目标位置不能使用（本机文件问题）",
    "请换一个普通文件夹（不要用快捷方式、网络盘或系统目录）后重试"
  ],
  "SOURCE_MODE": [
    "目标位置不能使用（本机文件问题）",
    "请换一个普通文件夹（不要用快捷方式、网络盘或系统目录）后重试"
  ],
  "GRAPH_CONTRACT_MISMATCH": [
    "插件收到的结果不完整（插件问题）",
    "请重试；仍不行请完全退出 DSH 后重新打开"
  ],
  "COVERAGE_OUTPUT": [
    "插件收到的结果不完整（插件问题）",
    "请重试；仍不行请完全退出 DSH 后重新打开"
  ]
};
export const inputCodes = [
  "COVERAGE_CONFLICT",
  "SOURCE_SCOPE",
  "SOURCE_UNAVAILABLE",
  "NOTE_"
];
