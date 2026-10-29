
/** 领域文案与样式；组合入口只保留原有级联位置。 */
export const zh = {
  "aiWebSessionTitle": "AI 网页",
  "aiWeb": "AI 网页",
  "browserMissing": "DSH 内置浏览器还没就绪，请在「插件」页启用浏览器后重试"
};
export const styles = [
`
    .ww-ai-web{--ww-ai-plate:color-mix(in srgb,#fff 92%,transparent)}.ww-page label.ww-ai-search{position:relative;display:flex;flex-direction:row;align-items:center;gap:8px;width:280px;max-width:100%;height:36px;padding:0 12px;border:1px solid var(--ww-line-2);border-radius:10px;background:var(--ww-surface)}.ww-ai-search>span{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.ww-page .ww-ai-search input{flex:1;min-width:0;width:auto;padding:0;border:0;background:transparent;outline:none}
    .ww-ai-status{display:inline-flex;align-items:center;gap:8px;color:var(--ww-ink-2);font-size:12.5px}.ww-page .ww-ai-status button{min-height:0;border:0;background:transparent;padding:2px 6px;text-decoration:underline}
    .ww-ai-group{display:flex;flex-direction:column;gap:10px;margin:0 0 24px}.ww-ai-group-label{display:flex;align-items:center;gap:8px;margin:0;font-size:12px;letter-spacing:.08em;color:var(--ww-ink-3)}.ww-ai-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
    .ww-ai-tile{position:relative;display:flex;align-items:center;min-width:0;border:1px solid var(--ww-line);border-radius:14px;background:var(--ww-surface);overflow:hidden;transition:border-color .16s ease}.ww-ai-tile:hover{border-color:var(--ww-line-2)}.ww-page .ww-ai-open{flex:1;min-width:0;display:flex;align-items:center;gap:12px;min-height:70px;padding:14px 16px;border:0;border-radius:0;background:transparent;text-align:left}.ww-page .ww-ai-open:hover:not(:disabled){background:transparent}.ww-ai-tile .ww-avatar{width:40px!important;height:40px!important;border-radius:11px;flex:none}.ww-ai-name{display:flex;flex-direction:column;gap:2px;min-width:0}.ww-ai-name strong{font-size:15px;font-weight:600;color:var(--ww-ink)}.ww-ai-name small{font-size:12.5px;font-weight:400;color:var(--ww-ink-2)}.ww-ai-tile>.ww-action-menu{margin-right:8px}
    .ww-ai-current{border-color:var(--ww-brand)}.ww-ai-current .ww-ai-name small{color:var(--ww-ok)}.ww-ai-current .ww-ai-name small::before{content:"";display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:999px;background:var(--ww-ok);vertical-align:1px}
    .ww-page .ww-ai-grid>.ww-add-card{flex-direction:row;justify-content:center;gap:8px;min-height:70px;padding:0 16px;border-radius:14px}.ww-ai-grid>.ww-add-card h2{margin:0;font:500 14px/1 var(--dsw-font-family,inherit);color:var(--ww-ink-2)}.ww-ai-grid>.ww-add-card .ww-add-mark{width:24px;height:24px;font-size:16px}`
];

// 专属错误只解释本领域；输入原文与公共运输错误由共用呈现机制处理。
export const errors = {
  "AI_WEB_UNAVAILABLE": [
    "DSH 内置浏览器还没就绪（DSH 设置问题）",
    "请在 DSH「插件」页启用浏览器后重试"
  ],
  "BROWSER_MISSING": [
    "DSH 内置浏览器还没就绪（DSH 设置问题）",
    "请在 DSH「插件」页启用浏览器后重试"
  ],
  "AI_WEB_BUILTIN": [
    "系统内置的内容不能直接这样修改",
    "可以先复制或新建一份属于你的，再修改"
  ]
};
