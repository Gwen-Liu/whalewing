
/** 领域文案与样式；组合入口只保留原有级联位置。 */
export const zh = {
  "mcpUnsupported": "当前 DSH 版本列不出 MCP 连接，专家暂时不能单独绑定 MCP，会照常使用 DSH 里启用的全部 MCP。",
  "modelUnsupported": "当前 DSH 版本切换模型会改掉你的默认模型，所以专家暂时跟随会话当前的模型。",
  "expertSaveChanges": "保存修改",
  "expertCreate": "创建专家",
  "expertSavedNamed": "已保存「{name}」的修改",
  "expertCreated": "已添加专家「{name}」",
  "expertResetDone": "「{name}」已恢复原版：{fields}",
  "expertDeleteDone": "已删除专家「{name}」",
  "expertRestoreDone": "已找回专家「{name}」",
  "expertDeleteTitle": "删除专家",
  "expertResetTitle": "恢复原版",
  "experts": "专家团队",
  "project": "工程绝对路径（可选）",
  "workspace": "使用已有工作区",
  "defaultWorkspace": "使用 DSH 默认位置",
  "start": "开始新任务",
  "includeSource": "将本次新任务纳入我的知识沉淀",
  "sourceRegisterFailed": "专家会话已创建，但没能加入知识沉淀；可以在来源列表中手动添加",
  "resetExpert": "恢复原版",
  "expertConfirmReset": "选择要换回原版的内容：",
  "expertResetHelp": "没选的保留你的修改，历史会话不受影响",
  "expertResetPick": "请至少选一项要恢复的内容",
  "expertBaseUpdated": "原版有更新：{fields}。你的修改照常生效；想改用新版，在专家卡片的“…”里点“恢复原版”",
  "expertFieldUpdated": "（原版有更新）",
  "expertField_name": "名字",
  "expertField_description": "介绍",
  "expertField_avatar": "头像",
  "expertField_prompt": "提示词",
  "expertField_model": "模型",
  "expertField_skills": "技能",
  "expertField_mcpServers": "MCP",
  "noRoles": "角色配置尚未加载",
  "mode": "DSH 模式",
  "defaultMode": "使用 DSH 默认模式",
  "expert": "专家",
  "noExpert": "不使用专家",
  "expertSearch": "搜索专家",
  "noExpertMatch": "没有匹配专家",
  "historicalExpert": "历史专家：{name}（新建任务接续）",
  "advanced": "可选设置",
  "expertSelectionFailed": "任务已创建，但专家还没设置好；请打开任务查看",
  "addExpert": "添加专家",
  "expertTemplate": "从模板开始",
  "expertTemplateBlank": "空白专家",
  "expertTemplateImport": "导入模板文件",
  "expertTemplateHelp": "模板会填好名字、介绍、提示词、技能和头像，创建前都可以改",
  "expertTemplateApplied": "已套用模板“{name}”",
  "expertTemplateSkipped": "已套用模板“{name}”；这些技能当前没有装，已跳过：{skills}",
  "expertCustom": "自定义",
  "editExpert": "编辑专家",
  "expertName": "专家名字",
  "expertDescription": "一句话介绍",
  "expertPrompt": "系统提示词（必填）",
  "expertModel": "对话模型",
  "inheritModel": "跟随系统默认",
  "clearAvatar": "使用默认头像",
  "avatarPresets": "选择预置头像",
  "deleteExpert": "删除专家",
  "restoreExpert": "恢复专家",
  "deletedExperts": "已删除的专家",
  "expertDeleteHelp": "删除不会影响历史会话，可随时恢复",
  "expertSaved": "专家配置已保存",
  "requiredExpert": "请填写专家名字、介绍和系统提示词",
  "optionalSkills": "Skills · 可选",
  "optionalMcp": "MCP · 可选",
  "missingBinding": "当前目录未发现，取消勾选可移除绑定",
  "emptyCatalog": "尚未发现可选项目",
  "catalogHelp": "绑定现有能力；取消绑定不会删除原技能或连接",
  "modelMissing": "没找到所选模型，请在 DSH 设置里检查模型配置",
  "editorClose": "关闭专家编辑",
  "expertOptions": "专家操作",
  "expertConfirmDelete": "确认删除这位专家？",
  "reasoning": "思考强度",
  "reasoningDefault": "模型默认",
  "expertRecovery": "已发现该专家的已保存版本，当前表单已保留；加载已保存配置将替换当前表单",
  "loadSavedExpert": "加载已保存配置",
  "expertPreparationStopped": "已停止等待专家准备，你的问题还没发送；请稍后重试",
  "expertSubagent": "子代理沿用其所属会话的专家职责，请在主会话管理专家"
};
export const styles = [
`.ww-team-heading{display:flex;justify-content:space-between;align-items:start;gap:16px;margin:8px 0 24px}.ww-team-heading h2{font-size:22px;line-height:1.4;letter-spacing:-.4px}.ww-team-heading p{margin:6px 0}`,
`
    .ww-avatar-picker{display:grid;grid-template-columns:64px 1fr;gap:16px;align-items:start;margin:18px 0 6px;padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-2)}`,
`
    .ww-picker-trigger{border:0;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-sm,6px);font:inherit;font-size:13px;display:inline-flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;white-space:nowrap;max-width:240px}.ww-picker-trigger:hover,.ww-picker-trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}.ww-picker-popover{position:fixed;inset:auto;margin:0;width:min(328px,calc(100vw - 24px));max-height:min(420px,calc(100dvh - 32px));overflow:auto;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:10px;box-shadow:0 8px 24px var(--dsw-alias-border-l3);font:inherit;font-size:13px}.ww-picker-popover input{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:inherit;padding:8px 10px;margin-bottom:8px}.ww-picker-options button{display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:9px;background:transparent;color:inherit;text-align:left;padding:8px;cursor:pointer;font:inherit}.ww-picker-options button:hover,.ww-picker-options button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover)}.ww-picker-options strong{font-weight:500;display:block}.ww-picker-options small{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;margin-top:2px}.ww-picker-popover :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}`,
`
    .ww-team-heading{margin:2px 0 16px;align-items:center}.ww-team-heading h2{font-size:19px;line-height:28px}.ww-team-heading p{font-size:12px;line-height:20px;margin:3px 0}`,
// 2026-10-25 随皮点缀：名帖式专家卡，小鲸领头一整行；卡片底跟随 DSH 与皮肤，底边水纹、小鲸卡角上鲸尾印。
`.ww-page .ww-expert-grid{grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}.ww-page .ww-expert-grid>.ww-card{overflow:hidden;min-height:0;padding:20px 20px 30px;gap:12px}.ww-expert-grid>.ww-card .ww-avatar{border-radius:999px;object-fit:cover}.ww-expert-grid>.ww-card h2{font-size:18px;line-height:1.4}.ww-expert-grid>.ww-card>p{flex:1;min-height:0;font-size:13px;line-height:1.7;color:var(--ww-ink-2)}
.ww-expert-foot{display:flex;align-items:center;gap:8px;margin-top:auto}.ww-expert-meta{flex:1;min-width:0;font-size:12.5px;color:var(--ww-ink-2)}.ww-page .ww-expert-foot .ww-card-start{flex:none;width:auto;min-height:32px;padding:0 14px;border:1px solid var(--ww-line-2);background:var(--ww-surface);font-size:13px}.ww-page .ww-expert-foot .ww-card-start.ww-primary{border-color:var(--ww-fill);background:var(--ww-fill);color:var(--ww-on-fill)}
.ww-page .ww-expert-grid>[data-lead]{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:24px;padding:24px 28px 30px}.ww-expert-grid>[data-lead]>.ww-card-top{grid-column:1}.ww-expert-grid>[data-lead]>p{grid-column:1;max-width:64ch;margin:0}.ww-expert-grid>[data-lead]>.ww-expert-foot{grid-column:2;grid-row:1/3}.ww-expert-grid>[data-lead] h2{font-size:22px}
.ww-page .ww-expert-grid>.ww-add-card{min-height:180px}.ww-team-settings .ww-menu-trigger{white-space:nowrap}`
];

// 专属错误只解释本领域；输入原文与公共运输错误由共用呈现机制处理。
export const errors = {
  "EXPERT_READBACK": [
    "操作已提交，但没能确认结果（本机文件问题）",
    "请刷新查看是否已生效，不要重复提交"
  ]
};
