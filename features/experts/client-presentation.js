
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
  "viewExpert": "查看专家",
  "copyExpert": "复制为我的专家",
  "expertViewClose": "关闭",
  "expertSourceView": "这位专家由「{name}」提供，只能查看；需要改的话可以复制成你自己的专家",
  "expertSourceEdit": "这位专家由「{name}」提供，保存后改动交给「{name}」；模型和 MCP 跟随你本机的设置，这里不绑定",
  "editExpert": "编辑专家",
  "expertName": "专家名字",
  "assistantNameLocked": "名字由「{source}」统一设定，这里改不了；关掉它后恢复原来的名字",
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
  "expertSubagent": "子代理沿用其所属会话的专家职责，请在主会话管理专家",
  "expertDetailTab_overview": "概况",
  "expertDetailTab_memory": "记忆",
  "expertDetailTab_schedule": "定时任务",
  "expertDetailSkills": "技能",
  "expertDetailSkillCount": "{count} 项",
  "expertDetailMemory": "记忆",
  "expertDetailMemoryCount": "{count} 条",
  "expertDetailMemoryEmpty": "还没有",
  "expertDetailSchedules": "定时任务",
  "expertDetailScheduleCount": "{count} 个",
  "expertDetailScheduleNone": "还没有定时任务",
  "expertDetailRecent": "最近的任务",
  "expertDetailRecentNone": "还没有任务",
  "expertDetailUntitled": "未命名任务",
  "expertMemoryHelp": "这位专家每次开工都会带上它的记忆，存在知识积累 {path}。一行一条，可以直接改、删；没写日期的，保存时补上今天。",
  "expertMemoryRules": "规矩",
  "expertMemoryRulesHelp": "你定下的做法和偏好",
  "expertMemoryProgress": "进度",
  "expertMemoryProgressHelp": "手上长期的事做到哪了",
  "expertMemoryPlaceholder": "一行一条",
  "expertMemoryOver": "记忆超过 4000 字，开工时只带前面一部分；把旧条目合并精简一下",
  "expertMemorySaved": "已保存{name}的记忆",
  "expertScheduleHelp": "到点时专家照自己的岗位说明和记忆去做，跑完把进度记进记忆。改时间、暂停、删除在定时任务页。",
  "expertScheduleAdd": "加定时任务",
  "expertNewResult": "有新结果",
  "expertSearchPlaceholder": "名字、介绍或技能",
  "expertFilter_all": "全部",
  "expertFilter_scheduled": "有定时任务",
  "expertNoMatch": "没有匹配的专家，换个词或筛选试试",
  "teamRoster": "在用的专家",
  "teamResize": "调整专家列表宽度",
  "teamInUse": "在用",
  "teamInUseCount": "在用 · {count}",
  "teamAdd": "添加",
  "teamHeadInUse": "在用 {count} 位",
  "teamHeadNoneInUse": "还没有在用的专家",
  "teamHeadLibrary": "专家库 {count} 位",
  "teamHeadRunning": "{count} 位在做",
  "teamHeadWaiting": "{count} 位等你审批",
  "teamInUseEmpty": "还没有在用的专家。用过的专家会出现在这一列。",
  "teamLibrary": "专家库",
  "teamLibraryCount": "全部 {count} 位",
  "teamLibrarySummary": "{count} 位：{parts}",
  "teamLibraryFilter": "按来源筛选",
  "teamLibraryEmpty": "专家库还是空的",
  "teamIdleHint": "{days} 天没用的专家会回专家库，记忆留着",
  "teamIdleNever": "专家不会自动回专家库",
  "teamIdleSetting": "多久不用就回专家库",
  "teamIdleDays": "{days} 天",
  "teamIdleOff": "不自动放回",
  "teamIdleSaved": "已改成 {days} 天不用就回专家库",
  "teamIdleSavedOff": "专家不会再自动回专家库",
  "teamSourceBuiltin": "内置",
  "teamSourceMine": "我建的",
  "teamGroupBuiltinNote": "随鲸翼带来；可以改，改了能恢复原版",
  "teamGroupMineNote": "你或小鲸替你建的",
  "teamGroupSourceNote": "由扩展「{name}」提供",
  "teamState_queued": "排队中",
  "teamState_running": "在做",
  "teamState_waiting": "等你审批",
  "teamState_completed": "做完了",
  "teamState_error": "出错了",
  "teamState_interrupted": "被停下",
  "teamState_incomplete": "没写完",
  "teamState_unknown": "结果未知",
  "teamUntitled": "未命名的任务",
  "teamNewTaskTitle": "新任务",
  "teamNextRun": "下一次 {time}",
  "teamScheduled": "有定时任务",
  "teamToday": "今天",
  "teamYesterday": "昨天",
  "teamDaysAgo": "{days} 天前",
  "teamUsedAgo": "{when}用过",
  "teamPickedAgo": "{when}选用",
  "teamNeverUsed": "还没用过",
  "teamReturnSoon": "再过 {days} 天回专家库",
  "teamPaneLabel": "{name}说的话",
  "teamNotInUse": "不在用",
  "expertBaseUpdatedTag": "原版有更新",
  "teamMemoryCount": "记忆 {count} 条",
  "teamSkillCount": "{count} 项技能",
  "teamDetail": "详情",
  "teamTask": "任务",
  "teamNewTask": "新任务",
  "teamNoTasks": "还没有交给{name}的任务",
  "teamOpenExpert": "打开{name}",
  "teamInUseTag": "在用",
  "teamPick": "选用",
  "teamPickNamed": "选用{name}",
  "teamPickDone": "{name}已在用",
  "teamReturn": "放回专家库",
  "teamReturnDone": "{name}已放回专家库，记忆留着",
  "teamTemplates": "照着模板建一位",
  "teamTemplatesHelp": "随包的模板，套用后还能改",
  "teamTemplatesShow": "展开",
  "teamTemplatesHide": "收起",
  "teamFromTemplate": "照着建",
  "teamFromTemplateNamed": "照着「{name}」建一位",
  "teamCreateByAssistant": "让小鲸建一位",
  "teamCreateManual": "自己填写",
  "teamCreatePrompt": "帮我建一位专家：先问我想让它长期盯什么事、做什么样的活，再起名字、写介绍和工作说明。",
  "teamWelcomeTitle": "专家们说的话会出现在这里",
  "teamWelcomeHelp": "跟右边的小鲸说要做什么，它会挑合适的专家去做。专家干活的过程、要你审批的事、交出来的结果都在这一栏；小鲸那边只留一行进度。",
  "teamWelcomeDirect": "也可以直接找一位：",
  "teamOpenAssistant": "打开小鲸",
  "teamGoLibrary": "去专家库挑一位",
  "pickerInUse": "在用的专家",
  "pickerMore": "更多专家 · 专家库 {count} 位",
  "pickerLess": "收起专家库"
};
export const styles = [
``,
`
    .ww-avatar-picker{display:grid;grid-template-columns:64px minmax(0,1fr);gap:16px;align-items:start;margin:18px 0 6px;padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-2)}`,
`
    .ww-picker-trigger{border:0;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-sm,6px);font:inherit;font-size:13px;display:inline-flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;white-space:nowrap;max-width:min(15rem,40vw)}.ww-picker-trigger:hover,.ww-picker-trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}.ww-picker-popover{position:fixed;inset:auto;margin:0;width:min(328px,calc(100vw - 24px));max-height:min(420px,calc(100dvh - 32px));overflow:auto;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:10px;box-shadow:0 8px 24px var(--dsw-alias-border-l3);font:inherit;font-size:13px}.ww-picker-popover input{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:inherit;padding:8px 10px;margin-bottom:8px}.ww-picker-options button{display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:9px;background:transparent;color:inherit;text-align:left;padding:8px;cursor:pointer;font:inherit}.ww-picker-options button:hover,.ww-picker-options button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover)}.ww-picker-options strong{font-weight:500;display:block}.ww-picker-options small{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;margin-top:2px}.ww-picker-popover :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.ww-picker-group{margin:8px 8px 2px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}.ww-picker-options .ww-picker-more{margin-top:4px;border-top:1px solid var(--dsw-alias-border-l1);border-radius:0 0 9px 9px;color:var(--dsw-alias-label-secondary)}`,
``,
// 2026-11-08 第三版：三栏（左栏在用的专家、中间专家说的话或专家库，右边小鲸在外壳的停靠栏）。宽度全按所在区域走，窄了左栏收成一列头像，再窄收到顶上一排。
// 2026-11-17 用户说两张分开的卡片“和其他模块一眼看过去全不一样，比较割裂”：改成和定时任务、知识积累一样的一整块，左栏垫一层底色，中间一条能拖的线（共用的 ww-split-line）。
`.ww-editor-fields{border:0;margin:0;min-width:0}
.ww-experts{height:100%;min-height:0;display:flex;flex-direction:column;container:ww-team/inline-size}
.ww-experts>.ww-pagehead{flex:none;margin-bottom:14px}
.ww-team{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(0,var(--ww-split,clamp(12.5rem,24%,18rem))) 1px minmax(0,1fr);background:var(--ww-surface);border:1px solid var(--ww-line);border-radius:16px;box-shadow:var(--dsw-elevation-soft,none);overflow:hidden}
.ww-page .ww-team-panel{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}.ww-page .ww-team-panel.ww-roster{background:var(--ww-surface-2)}
.ww-experts [data-tone]{--ww-tone:var(--ww-ink-2)}.ww-experts [data-tone=run]{--ww-tone:var(--dsw-alias-state-business-primary,var(--ww-brand))}.ww-experts [data-tone=wait]{--ww-tone:var(--ww-warn)}.ww-experts [data-tone=ok]{--ww-tone:var(--ww-ok)}.ww-experts [data-tone=err]{--ww-tone:var(--ww-err)}.ww-experts [data-tone=idle]{--ww-tone:var(--ww-ink-3)}
.ww-roster-group{margin:0;padding:.875rem 1rem .25rem;font-size:11.5px;color:var(--ww-ink-2)}
.ww-roster-list{list-style:none;margin:0;padding:0 .375rem;display:flex;flex-direction:column;gap:2px;flex:0 1 auto;min-height:0;overflow:auto}
.ww-roster-empty{margin:.125rem 1rem .5rem;font-size:12.5px;line-height:1.6;color:var(--ww-ink-3)}
.ww-page .ww-roster-item{display:flex;align-items:center;gap:.625rem;width:100%;min-width:0;min-height:0;margin:0;padding:.5rem .625rem;border:0;border-radius:10px;background:transparent;color:var(--ww-ink);font:inherit;text-align:left;cursor:pointer;box-shadow:none}
.ww-page .ww-roster-item:hover{background:var(--ww-hover)}
.ww-page .ww-roster-item[aria-current=true]{background:color-mix(in srgb,var(--ww-ink) 7%,transparent)}
.ww-page .ww-roster-item:focus-visible{outline:2px solid var(--ww-brand);outline-offset:-2px}
.ww-roster-avatar{position:relative;display:inline-flex;flex:none}
.ww-roster-avatar .ww-avatar{border-radius:999px}
.ww-roster-avatar:is([data-tone=run],[data-tone=wait],[data-tone=ok],[data-tone=err])::after{content:'';position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;box-sizing:border-box;border-radius:50%;border:2px solid var(--ww-surface-2);background:var(--ww-tone)}
.ww-roster-icon{width:34px;height:34px;align-items:center;justify-content:center;border-radius:50%;background:var(--ww-surface-2);color:var(--ww-ink-2)}
.ww-roster-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.ww-roster-text strong{display:flex;align-items:center;gap:6px;min-width:0;font-size:13.5px;font-weight:500;line-height:1.45}
.ww-roster-name{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-roster-text small{min-width:0;font-size:12px;line-height:1.5;color:var(--ww-tone,var(--ww-ink-2));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-roster-sep{height:1px;margin:.5rem 1rem;background:var(--ww-line);flex:none}
.ww-page .ww-roster-library{margin:0 .375rem;width:auto}
.ww-roster-foot{margin-top:auto;display:flex;flex-direction:column;gap:.375rem;padding:.75rem 1rem .875rem;border-top:1px solid var(--ww-line)}
.ww-roster-hint{font-size:11.5px;line-height:1.5;color:var(--ww-ink-3)}
.ww-roster-foot .ww-action-menu{align-self:flex-start}
.ww-pane-head{display:flex;align-items:center;gap:.75rem;padding:.875rem 1rem .75rem 1.125rem;border-bottom:1px solid var(--ww-line);flex:none;min-width:0}
.ww-pane-head>.ww-avatar{border-radius:999px;flex:none}
.ww-pane-title{flex:1;min-width:0;display:flex;flex-direction:column}
.ww-pane-name{display:flex;align-items:center;gap:.5rem;min-width:0}
.ww-page .ww-pane-name h2,.ww-page .ww-library-head h2{min-width:0;font-family:var(--ww-serif);font-size:17px;font-weight:600;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-pane-title small{font-size:12.5px;color:var(--ww-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-pane-actions{display:flex;align-items:center;gap:2px;flex:none}
.ww-page .ww-quiet{border:0;background:transparent;color:var(--ww-ink-2);font-size:12.5px;padding:.25rem .5rem;min-height:0;white-space:nowrap}
.ww-page .ww-quiet:hover{background:var(--ww-hover);color:var(--ww-ink)}
.ww-pane-tasks{display:flex;align-items:center;gap:.5rem;padding:.5rem 1rem .5rem 1.125rem;border-bottom:1px solid var(--ww-line);flex:none;min-width:0;flex-wrap:wrap}
.ww-page label.ww-pane-task{flex-direction:row;align-items:center;gap:.5rem;flex:0 1 auto;min-width:0;font-size:12px;color:var(--ww-ink-2)}
.ww-page .ww-pane-task select{width:auto;min-width:0;max-width:min(100%,32rem);font-size:12.5px;color:var(--ww-ink)}
.ww-state{flex:none;padding:0 .4375rem;border-radius:999px;font-size:11.5px;line-height:1.6;color:var(--ww-tone);background:color-mix(in srgb,var(--ww-tone) 12%,transparent)}
.ww-page .ww-pane-new{margin-left:auto;display:inline-flex;align-items:center;gap:.25rem;min-height:0;padding:.25rem .625rem;font-size:12.5px;white-space:nowrap}
.ww-expert-conversation{flex:1;min-height:0}
.ww-pane-empty{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.625rem;padding:2rem;text-align:center;overflow:auto}
.ww-pane-empty .ww-avatar{border-radius:999px}
.ww-pane-empty p{margin:0;max-width:40ch;font-size:13px;line-height:1.7;color:var(--ww-ink-2)}
.ww-library-head{flex-wrap:wrap}
.ww-page .ww-library-search{flex:0 1 clamp(10rem,30%,20rem);min-width:0}
.ww-library-chips{display:flex;flex-wrap:wrap;gap:.375rem;padding:.625rem 1.125rem 0;flex:none}
.ww-library-body{flex:1;min-height:0;overflow:auto;padding:0 .75rem .875rem}
.ww-lib-group{margin-top:1.125rem}
.ww-page .ww-lib-group h3{display:flex;align-items:baseline;flex-wrap:wrap;gap:.5rem;padding:0 .375rem .25rem;font-family:var(--ww-serif);font-size:14.5px;font-weight:600}
.ww-lib-group h3 small{font-family:inherit;font-size:12.5px;font-weight:400;color:var(--ww-ink-2)}
.ww-lib-group h3 span{font-family:var(--dsw-font-family,inherit);font-size:12px;font-weight:400;color:var(--ww-ink-3)}
.ww-lib-group ul,.ww-lib-templates ul{list-style:none;margin:0;padding:0}
.ww-lib-row{display:flex;align-items:center;gap:.75rem;min-width:0;padding:.625rem .375rem;border-bottom:1px solid var(--ww-line)}
.ww-lib-row>.ww-avatar{border-radius:999px;flex:none}
.ww-lib-text{flex:1;min-width:0;display:flex;flex-direction:column}
.ww-lib-name{display:flex;align-items:center;gap:.5rem;min-width:0;font-size:13.5px;font-weight:500}
.ww-lib-name small{font-size:12px;font-weight:400;color:var(--ww-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-page .ww-lib-open{min-height:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:500;cursor:pointer;white-space:nowrap}
.ww-page .ww-lib-open:hover{color:var(--ww-brand)}
.ww-lib-desc{font-size:12.5px;color:var(--ww-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-lib-last{flex:0 1 auto;max-width:28%;text-align:right;font-size:12px;color:var(--ww-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-page .ww-lib-pick,.ww-lib-inuse{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:.25rem;min-width:4.5em;min-height:0;padding:.1875rem .625rem;border-radius:8px;font-size:12.5px;white-space:nowrap}
.ww-lib-inuse{background:color-mix(in srgb,var(--ww-ink) 7%,transparent);color:var(--ww-ink)}
.ww-lib-templates{margin-top:1.125rem;padding:.75rem .875rem;border:1.5px dashed var(--ww-line-2);border-radius:12px}
.ww-lib-templates-head{display:flex;align-items:center;gap:.75rem}
.ww-lib-templates-head>div{flex:1;min-width:0;display:flex;flex-direction:column}
.ww-lib-templates-head small{font-size:12px;color:var(--ww-ink-2)}
.ww-team-welcome{align-items:center;justify-content:center;gap:.75rem;padding:clamp(1.25rem,4cqi,2.5rem);text-align:center;overflow:auto}
.ww-team-welcome-faces{display:flex}
.ww-team-welcome-faces .ww-avatar{border-radius:999px;border:3px solid var(--ww-surface)}
.ww-team-welcome-faces .ww-avatar+.ww-avatar{margin-left:-14px}
.ww-page .ww-team-welcome h2{font-family:var(--ww-serif);font-size:18px;font-weight:600}
.ww-team-welcome>p{margin:0;max-width:46ch;font-size:13px;line-height:1.7;color:var(--ww-ink-2)}
.ww-team-welcome-actions{justify-content:center}
.ww-team-starters{width:min(100%,32rem);display:flex;flex-direction:column;gap:.5rem;margin-top:.75rem;text-align:left}
.ww-team-starters>small{font-size:12px;color:var(--ww-ink-2)}
.ww-starter{display:flex;align-items:center;gap:.75rem;min-width:0;padding:.625rem .75rem;border:1px solid var(--ww-line);border-radius:12px}
.ww-starter .ww-avatar{border-radius:999px;flex:none}
.ww-starter strong{font-size:13.5px;font-weight:500}
.ww-deleted-experts{display:flex;flex-direction:column;gap:.375rem;padding-top:.5rem;border-top:1px solid var(--ww-line)}
@container ww-team (max-width:40rem){.ww-team{grid-template-columns:auto minmax(0,1fr)}.ww-team>.ww-split-line{display:none}.ww-page .ww-team-panel.ww-roster{border-right:1px solid var(--ww-line)}.ww-roster-text,.ww-roster-group,.ww-roster-hint,.ww-roster-empty{display:none}.ww-roster-list{padding:.5rem .375rem 0}.ww-page .ww-roster-item{justify-content:center;padding:.375rem}.ww-roster-sep{margin:.5rem .5rem}.ww-roster-foot{align-items:center;padding:.5rem .375rem}.ww-roster-foot .ww-action-menu{align-self:center}.ww-roster-foot .ww-menu-trigger{font-size:0;gap:0}.ww-lib-last{display:none}}
@container ww-team (max-width:30rem){.ww-team{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.ww-page .ww-team-panel.ww-roster{flex-direction:row;align-items:center;border-right:0;border-bottom:1px solid var(--ww-line)}.ww-roster-list{flex-direction:row;overflow-x:auto;overflow-y:hidden;padding:.25rem}.ww-roster-sep{width:1px;height:auto;align-self:stretch;margin:.375rem 0}.ww-roster-foot{margin:0 0 0 auto;border:0;padding:.375rem}.ww-pane-actions .ww-quiet{display:none}}`,
// 2026-11-08 专家团改版：一行查找和筛选（同技能页）、名帖点开详情、详情抽屉的页签和记忆文本框。
`.ww-detail-tabs{gap:6px;padding:0 0 8px}.ww-expert-detail-title{gap:10px;align-items:center}.ww-expert-detail-body h3{font-size:14px;margin:16px 0 6px}
.ww-expert-recent{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.ww-expert-recent li{display:flex;align-items:baseline;gap:8px;min-width:0}.ww-page .ww-expert-recent button{border:0;background:transparent;padding:0;color:var(--dsw-alias-brand-primary);font:inherit;cursor:pointer;text-align:left;overflow-wrap:anywhere}
.ww-page textarea.ww-memory-text{min-height:120px;font-family:inherit}.ww-page .ww-add-inline{min-height:0;flex-direction:row;justify-content:center;gap:8px;padding:12px;margin-top:12px;width:100%}`
];

// 专属错误只解释本领域；输入原文与公共运输错误由共用呈现机制处理。
export const errors = {
  "EXPERT_SOURCE_CLOSED": [
    "提供这位专家的扩展已关闭或卸载（扩展问题）",
    "在 DSH「插件」页重新开启这个扩展，或改选其他专家"
  ],
  "EXPERT_SOURCE_READONLY": [
    "这位专家由扩展提供，在这里只能查看（扩展的规则）",
    "复制为你自己的专家后再改，或到提供它的扩展里改"
  ],
  "EXPERT_SOURCE_SAVE": [
    "扩展没有保存这位专家（扩展问题）",
    "表单已保留；按提示处理后重试，或到提供它的扩展里查看原因"
  ],
  "EXPERT_READBACK": [
    "操作已提交，但没能确认结果（本机文件问题）",
    "请刷新查看是否已生效，不要重复提交"
  ]
};
