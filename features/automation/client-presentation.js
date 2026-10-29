
/** 领域文案与样式；组合入口只保留原有级联位置。 */
export const zh = {
  "taskSaved": "定时任务已保存",
  "taskToggled": "任务状态已更新",
  "taskCancelled": "已取消这个定时任务",
  "schedule": "定时任务",
  "taskPaused": "已暂停",
  "taskPause": "暂停",
  "taskResume": "恢复",
  "taskActions": "任务操作",
  "taskSelect": "选择一项任务，查看内容与结果",
  "taskScheduleSettings": "查看调度设置",
  "legacyScheduleSettings": "旧版：打开插件设置",
  "taskUnavailableShort": "DSH 定时服务尚未就绪",
  "taskStatusHelp": "暂停后不会再按时执行，已经开始的不受影响；恢复后从下一次时间开始",
  "scheduleHelp": "定时任务由 DSH 的定时服务执行，DSH 需要处于运行状态；错过的时间点会在下次启动时按规则补上",
  "knowledgeTask": "DSH 工作知识整理",
  "taskDisabled": "未启用",
  "enableTask": "设置并启用",
  "newTask": "新增定时任务",
  "taskScopeHelp": "启用后会整理你在 DSH 里的普通对话（不含子任务和自动任务），写入个人知识库，不会扫描电脑上的其他文件",
  "taskModelHelp": "任务第一次运行用 DSH 的默认模型，之后一直沿用任务会话里的模型，不跟着默认模型变；要换模型，打开原会话在 DSH 里切换。运行可能产生模型费用",
  "scheduleUnavailable": "新版请检查 DSH 启动日志并重启；旧版请确认官方定时任务插件已启用，然后刷新；草稿会保留",
  "taskTitle": "任务名称",
  "taskPrompt": "工作指令",
  "taskRule": "时间规则",
  "taskSeconds": "秒数",
  "taskAt": "时间（含时区的 ISO 日期）",
  "taskExpression": "Cron 表达式",
  "taskWeekdays": "星期（1 周一至 7 周日）",
  "submitTask": "确认创建计划",
  "editTask": "编辑计划",
  "saveTask": "保存计划",
  "cancelPlan": "取消计划",
  "cancelPlanHelp": "取消后不再执行，执行记录会一并删除；已经产生的会话和知识保留",
  "openTaskSession": "打开原会话",
  "taskDetails": "计划详情",
  "taskActive": "已启用",
  "taskInactive": "计划已结束",
  "taskHistory": "执行记录",
  "historyHelp": "结果取自任务会话里那一次的结束情况；查不到时显示“结果未知”，不代表成功或失败",
  "noHistory": "还没有执行记录",
  "historyEarlier": "更早的记录已被清理",
  "historyMore": "加载更早记录",
  "taskLegacy": "旧知识计划",
  "taskLegacyHelp": "这些是旧版工作台创建的计划。请先取消旧计划，再启用新的知识整理，避免重复执行",
  "taskPending": "上次创建的结果还没确认",
  "taskPendingHelp": "上次创建可能已经成功。请先查看原会话确认，避免重复创建",
  "taskRecover": "查看原会话和计划",
  "taskContinue": "继续原会话创建",
  "taskPendingMissing": "还没找到已创建的计划；确认原会话后可以继续创建",
  "taskPendingConflict": "上次创建还没确认，请先查看原会话",
  "taskCacheError": "创建恢复记录尚未可靠保存，请检查浏览器存储后重试；尚未发起新建",
  "taskReadback": "没能确认计划是否保存成功，草稿还在；请刷新查看",
  "taskReload": "读取最新版本（保留草稿）",
  "taskDraftClose": "收起任务草稿",
  "taskDraftResume": "继续编辑草稿",
  "taskDiscard": "放弃任务草稿",
  "taskDiscardConfirm": "放弃未提交的修改？",
  "time": "每日时间",
  "timeZone": "时区",
  "taskTime": "下次时间",
  "legacyTimeZone": "原任务时区：{zone}",
  "convertBeijingTime": "改为北京时间",
  "beijingTime": "北京时间",
  "workspaceAll": "全部工作区",
  "workspaceSelected": "已选 {count} 个工作区",
  "workspaceScope": "处理范围",
  "workspaceScopeHelp": "全选后可取消个别工作区；知识整理只读取纳入范围的会话",
  "customScopeDropped": "这个任务以前附带了工作区清单，保存后只保留你写的工作指令",
  "taskLastRun": "上次运行",
  "taskNeverRun": "还没运行过",
  "newsTaskFixed": "固定每天 08:00 运行。要改关注的领域和来源，到「知识卡片」的卡片设置里改",
  "runLate": "{time} 补上",
  "runStatus_waiting": "排队中",
  "runStatus_running": "进行中",
  "runStatus_completed": "完成",
  "runStatus_error": "出错",
  "runStatus_interrupted": "中断",
  "runStatus_incomplete": "没写完",
  "runStatus_skipped": "未执行",
  "runStatus_unknown": "结果未知"
};
export const en = {
  "legacyTimeZone": "Existing time zone: {zone}",
  "convertBeijingTime": "Use Beijing time",
  "beijingTime": "Beijing time",
  "workspaceAll": "All workspaces",
  "workspaceSelected": "{count} workspaces selected",
  "workspaceScope": "Workspaces",
  "workspaceScopeHelp": "Exclude individual workspaces from knowledge collection",
  "customScopeDropped": "This task used to carry a workspace list; saving keeps only your instructions",
  "taskLastRun": "Last run",
  "taskNeverRun": "Not run yet",
  "newsTaskFixed": "Runs every day at 08:00. Change topics and sources in Knowledge Cards settings",
  "runLate": "caught up at {time}",
  "runStatus_waiting": "Queued",
  "runStatus_running": "Running",
  "runStatus_completed": "Done",
  "runStatus_error": "Failed",
  "runStatus_interrupted": "Interrupted",
  "runStatus_incomplete": "Cut off",
  "runStatus_skipped": "Not run",
  "runStatus_unknown": "Result unknown"
};
export const styles = [
`
.ww-page .ww-task-time{display:flex;align-items:end;gap:16px;margin-block:16px}.ww-page .ww-task-time .ww-field{flex:none;width:160px}.ww-page .ww-task-time>span{padding-bottom:10px}.ww-page .ww-task-workspaces{display:grid;grid-template-columns:1fr 1fr;gap:16px}.ww-page .ww-workspace-options{max-height:280px;overflow:auto}.ww-page .ww-workspace-options .ww-choice{display:flex;gap:8px;align-items:start;padding:8px}.ww-page .ww-workspace-options small{display:block;overflow-wrap:anywhere}
@media(max-width:700px){.ww-page .ww-task-workspaces{grid-template-columns:1fr}}`,
`

    .ww-schedules{height:100%;min-height:360px;display:flex;flex-direction:column}.ww-task-split{display:grid;grid-template-columns:minmax(210px,270px) minmax(0,1fr);flex:1;min-height:0;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;overflow:hidden}.ww-task-list{padding:12px 8px;background:var(--dsw-alias-bg-layer-2);border-right:1px solid var(--dsw-alias-border-l1);overflow:auto}.ww-task-list>.ww-row{justify-content:space-between;padding:0 6px 12px}.ww-task-list h2{font-size:15px}.ww-task-list h3{font-size:13px;margin:0}.ww-task-template{display:grid;gap:6px;padding:12px 8px}.ww-task-template small,.ww-task-row small{color:var(--dsw-alias-label-secondary);font-size:11px}.ww-task-row{display:flex;align-items:center;border-radius:9px;margin:4px 0;min-width:0}.ww-task-row.ww-selected{background:var(--dsw-alias-interactive-bg-hover)}.ww-page .ww-task-select{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1;text-align:left;border:0;background:transparent;padding:10px 8px}.ww-task-select span,.ww-task-select small{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ww-task-main{padding:24px;min-width:0;overflow:auto}.ww-task-prompt{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}.ww-task-detail>details{margin-top:24px}.ww-task-editor{max-width:680px;margin:auto}.ww-task-editor>.ww-field{margin:14px 0}.ww-task-editor h2{margin-bottom:20px}.ww-task-empty{min-height:300px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16px;color:var(--dsw-alias-label-secondary)}.ww-task-empty h2{font-size:16px}`,
`@media(max-width:700px){.ww-task-split{grid-template-columns:1fr}.ww-task-list{max-height:220px;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1)}.ww-task-main{padding:16px}}`,
`.ww-task-time>.ww-field{min-width:0}.ww-workspace-options{min-width:250px;max-width:min(480px,calc(100vw - 48px))}`,
`
    .ww-schedule-off{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:12px 16px;margin:0 0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}.ww-schedule-off p{margin:2px 0 0}.ww-page .ww-schedule-off .ww-primary{margin:0}`,
// 2026-10-25 随皮点缀：任务行前一个状态点；详情两张小卡写下次运行和上次结果；编辑时一句规则预览；执行记录在弹窗里逐条带状态点。
`.ww-task-split{border-color:var(--ww-line)}.ww-task-list{background:var(--ww-surface-2)}.ww-task-select>span:first-child{display:inline-flex;align-items:center;gap:8px}.ww-task-select .ww-dot{width:16px;height:16px;font-size:10px}
.ww-page .ww-task-detail .ww-team-heading h2,.ww-page .ww-task-editor>h2{font:600 22px/1.35 var(--ww-serif);letter-spacing:.01em}.ww-task-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:4px 0 16px}.ww-task-fact{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border-radius:12px;background:var(--ww-surface-2)}.ww-task-fact small{font-size:12px;letter-spacing:.06em;color:var(--ww-ink-3)}.ww-task-fact strong{display:inline-flex;align-items:center;gap:8px;font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ww-ink)}.ww-task-fact span{font-size:12.5px;color:var(--ww-ink-2)}.ww-task-fact-err{background:color-mix(in srgb,var(--ww-err) 10%,transparent)}.ww-task-fact-err strong{color:var(--ww-err)}
.ww-task-preview{margin:4px 0 8px;padding:10px 12px;border-radius:10px;background:var(--ww-tint);font-size:13.5px;color:var(--ww-ink);font-variant-numeric:tabular-nums}
.ww-task-runs{display:flex;flex-direction:column;gap:2px;margin:12px 0 0;padding:0;list-style:none}.ww-task-runs li{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--ww-line)}.ww-task-runs li:first-child{border-top:0}.ww-task-runs .ww-task-run{margin:0;font-variant-numeric:tabular-nums}`
];

// 专属错误只解释本领域；输入原文与公共运输错误由共用呈现机制处理。
export const errors = {
  "SCHEDULE_DISABLED": [
    "DSH 定时服务尚未就绪",
    "新版请检查 DSH 启动日志并重启；旧版请确认官方定时任务插件已启用，然后刷新"
  ],
  "AUTOMATION_UNAVAILABLE": [
    "DSH 定时服务尚未就绪",
    "新版请检查 DSH 启动日志并重启；旧版请确认官方定时任务插件已启用，然后刷新"
  ],
  "LEGACY_SCHEDULE": [
    "这是旧版工作台留下的知识整理计划，不能修改，也不能和新的知识整理同时启用",
    "请先在列表里取消旧计划，再启用新的知识整理；已整理进知识库的内容会保留"
  ],
  "SCHEDULE_EXISTS": [
    "已经有一个同类的定时任务",
    "请在列表里找到原任务查看或编辑，不用重复创建"
  ],
  "SCHEDULE_CONTROL_UNAVAILABLE": [
    "当前 DSH 版本不支持暂停和恢复定时任务",
    "不需要时可以取消这个任务，之后再重新创建"
  ],
  "AUTOMATION_IDENTITY": [
    "没能确认这个定时任务对应的会话（插件问题）",
    "请刷新后重试；仍不行请重启 DSH"
  ],
  "SCHEDULE_ENDED": [
    "要操作的内容已经不存在（数据已变化）",
    "请刷新列表后重试"
  ],
  "SCHEDULE_RETIRED": [
    "要操作的内容已经不存在（数据已变化）",
    "请刷新列表后重试"
  ],
  "AUTOMATION_SESSION": [
    "要操作的内容已经不存在（数据已变化）",
    "请刷新列表后重试"
  ]
};
export const inputCodes = [
  "AUTOMATION_PROMPT"
];
