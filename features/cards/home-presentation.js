/**
 * 每日阅读首页（2026-11-14 改版）、划线和阅读设置开关的词条与样式。
 * 首页占满一屏、不整页滚动：左边今日资讯，右边今日一招、接着读、回顾；放不下时两边各自逐级收紧（data-d 0 到 3），再窄换页签。
 * 词条并入本功能的词条表（client-presentation.js），重名由组合层拒收。
 */
export const zh = {
  "homeNews": "今日资讯",
  "homeTip": "今日一招",
  "homeBook": "接着读",
  "homeReview": "回顾",
  "homeSummary": "今天这一期 {count} 条资讯，看过 {seen} 条 · 存下 {saved} 条 · 书里划线 {marks} 条",
  "homeSummaryOld": "今天这一期还没出，下面是 {date} 那一期 · 存下 {saved} 条 · 书里划线 {marks} 条",
  "homeSummaryPast": "{date} 那一期，{count} 条资讯",
  "homeSummaryNone": "今天这一期还没出 · 存下 {saved} 条 · 书里划线 {marks} 条",
  "homeSummaryEmpty": "今天这一期没有符合条件的条目 · 存下 {saved} 条 · 书里划线 {marks} 条",
  "homePrev": "前一期",
  "homeNext": "后一期",
  "homeNoOlder": "没有更早的日报了",
  "homeTabNews": "今日资讯 {count}",
  "homeTabRead": "接着读和回顾",
  "homeTabs": "今天这一期",
  "homeFields": "看哪个领域",
  "homeCount": "{count} 条",
  "homeLead": "头条",
  "homeRelated": "和你有关",
  "homeRelation": "和你的关系",
  "homeSources": "{count} 个来源",
  "homeViewSource": "查看来源",
  "homeNewsMenu": "{name} · 运行详情和历史日报",
  "homeNewsNone": "今日日报尚未生成。每天北京时间 08:00 整理，DSH 需要开着。",
  "homeNewsFailed": "今天这一期没生成出来：{reason}",
  "homeNewsFailedFix": "{fix}。也可以现在重新生成一期。",
  "homeNewsMissing": "今天 {time} 那次跑完了，但没有交出日报。可以打开原会话看看，或者现在重新生成一期。",
  "homeNewsWorking":"正在整理今天这一期，一般要几分钟，好了这里会显示。",
  "homeNewsGenerate": "现在生成一期",
  "homeNewsWhy": "打开原会话",
  "homeNewsGenerating": "已经开始整理今天这一期，好了首页会显示；08:00 那次照常运行",
  "homeNewsNoTask": "还没有每日资讯任务，先到阅读设置里打开一个资讯领域",
  "homeNewsRefresh": "看看好了没有",
  "homeNewsEmpty": "这一期没有符合条件的条目。",
  "homeOfficial": "官方",
  "homeWeekToday": "这一期",
  "homeWeek": "上周回顾",
  "homeWeekMeta": "从上周几期里挑的 {count} 件",
  "homeWeekMine": "上周你存了 {captures} 条，划了 {marks} 条线。每周思考周一早上会读收件箱，结果写在周记里。",
  "homeWeekNote": "去看周记",
  "homeMeOn": "按《关于我》挑",
  "homeMeOff": "没读《关于我》",
  "homeMeTitle": "这一期怎么挑的",
  "homeMePersonal": "这一期是按你的《关于我》挑的：头条换成和你最有关的那条，有关的快讯标了“和你有关”。",
  "homeMePlain": "这一期没有读《关于我》，谁看都是同一份。",
  "homeMeNext": "“按我的情况来挑”现在开着，下一期开始读《关于我》。",
  "homeMeOffHelp": "“按我的情况来挑”现在关着。到阅读设置里打开后，每天 08:00 把《关于我》交给你在 DSH 里配的模型，用来排头条、写“和你的关系”。",
  "homeTell": "明天想多看点什么",
  "homeTellPlaceholder": "比如：多来点和排产、质检有关的",
  "homeTellSend": "告诉它",
  "homeTellDone": "记下了，写进了“{name}”的关注描述，下一期开始用",
  "homeTellFull": "“{name}”的关注描述已经写满 2000 字了，请到阅读设置里整理后再加",
  "homeTellLine": "另外想多看：{text}",
  "homeMoreLine": "多看「{category}」这类",
  "homeLessLine": "少看「{category}」这类",
  "homeLikeLabel": "「{category}」这类消息",
  "homeMore": "多来点",
  "homeLess": "少来点",
  "homeToSettings": "到阅读设置里改",
  "homeSave": "存一条",
  "homeSaved": "已存",
  "homeSavedOpen": "已存，点开看存在哪",
  "homeSaveTitle": "存进知识积累的收件箱",
  "homeSaveWhy": "为什么存？写一句，可以不写",
  "homeSaveWhyPlaceholder": "比如：下周对交付表时试试",
  "homeSaveHelp": "照“网页剪藏”建一篇，只记链接和这句说明，不抄原文。之后由每周思考来问怎么处理。",
  "homeSaveConfirm": "存进收件箱",
  "homeSaveDone": "已存进知识积累的收件箱：《{name}》",
  "homeSavedAt": "这一条存在收件箱的《{name}》里",
  "homeToKnowledge": "去知识积累看",
  "homeTipAi": "AI 技巧",
  "homeTipUsage": "鲸翼的用法",
  "homeTipUsageNote": "随鲸翼带的，不用模型",
  "homeTipUsageNew": "今天还没看",
  "homeTipTry": "让{assistantShort}试一下",
  "homeTipPast": "往期",
  "homeTipNone": "那天没有整理技巧。",
  "homeTipEmptyToday": "今天没有可照着做的技巧",
  "homeTipEmptyTodayText": "今天的来源里没挑出能照着做的做法，明天 08:00 再整理。往期里有以前的。",
  "homeTryPrompt": "我想照这个办法试一次：{title}。\n做法：{brief}\n先问我要处理什么事，再带我一步一步做。",
  "homeUsageNext": "换一条",
  "homeUsageGo": "去{name}试试",
  "homeUsageLauncher": "打开全部功能",
  "homeUsageClosed": "「{name}」现在关着。点页头右边的“…”进“管理功能”打开它",
  "homeBookLine": "读到 {percent}% · 划线 {marks} 条",
  "homeBookActions": "{title} · 更多操作",
  "homeReviewMeta": "以前划的线，今天还有 {count} 条",
  "homeReviewIdle": "以前划的线",
  "homeReviewMine": "我写的：{note}",
  "homeReviewFrom": "《{title}》第 {index} 章 · {date}划的",
  "homeReviewLooked": "看过了",
  "homeReviewGo": "去原文",
  "homeReviewPrev": "上一条",
  "homeReviewNext": "下一条",
  "homeReviewDone": "今天的回顾看完了。",
  "homeReviewMore": "再来几条",
  "homeReviewNoMore": "划过的线今天都看过了",
  "homeReviewEmpty": "还没有划线。读书时选中一句话就能划线，过一天它会回到这里。",
  "homeReviewWaiting": "今天没有到期的划线。划线后第 1、7、30 天各回来一次。",
  "homeReviewOff": "回顾关着。到阅读设置里选每天回顾几条。",
  "homeReadingFailed": "划线和阅读设置没读出来",
  "markAdd": "划线",
  "markAddNote": "划线并写一句",
  "markDone": "已划线。留在每日阅读里，过几天会在回顾里再见到它",
  "markNotePlaceholder": "用自己的话写一句",
  "markNoteSave": "记下",
  "markNoteCancel": "不写了",
  "markNoteWrite": "写一句",
  "markNoteEdit": "改这句",
  "markRemove": "取消划线",
  "markRemoved": "已取消划线",
  "markTooLong": "一次最多划 {count} 个字，请少选一点",
  "markOverlap": "这句和已有的划线有重叠。点一下原来那条，可以先取消",
  "markNoted": "记下了。这句话写进了知识积累的《{name}》",
  "markNotedNew": "记下了。在知识积累里新建了《{name}》，这句话写在“我的理解与批注”里",
  "markPanel": "划线 {count} 条",
  "markPanelTitle": "本章划线",
  "markPanelEmpty": "这一章还没有划线。选中正文里的一句话试试。",
  "markPanelHelp": "划的原文留在每日阅读里，不抄进知识库；你写的那句话记进这本书的来源笔记。",
  "markPanelNote": "来源笔记",
  "markPanelNoteWhere": "你写的话记在知识积累的《{name}》里",
  "markMine": "我写的：{note}",
  "markMenu": "这条划线",
  "markUnsupported": "这个浏览器画不出划线的底色，划线照样存着，在右上角“划线”里看",
  "readingSettings": "按我的情况读",
  "readingPersonal": "按我的情况来挑",
  "readingPersonalHelp": "每天 08:00 生成这一期时，把《关于我》的正文交给你在 DSH 里配的模型，用来排头条、写“和你的关系”。不发到别处。关掉后谁看都是同一份。",
  "readingDiary": "也带上最近 7 天的日记",
  "readingDiaryHelp": "让它知道你这几天在忙什么；上一项开着才能开",
  "readingUsage": "今日一招里放鲸翼的用法",
  "readingUsageHelp": "每天一条鲸翼自己的功能，随鲸翼带的，不用模型",
  "readingWeekly": "周一出上周回顾",
  "readingWeeklyHelp": "周一那一期多一页：上周最多五件大事，和你上周存了多少、划了多少",
  "readingReview": "每天回顾几条划线",
  "readingReviewHelp": "划线后第 1、7、30 天各回来一次",
  "readingReview_0": "不回顾",
  "readingReview_2": "2 条",
  "readingReview_3": "3 条",
  "readingSaved": "阅读设置已保存"
};

export const en = {
  "homeNews": "Today's news",
  "homeTip": "Tip of the day",
  "homeBook": "Keep reading",
  "homeReview": "Review",
  "homeSave": "Save",
  "homeSaved": "Saved",
  "markAdd": "Highlight",
  "markAddNote": "Highlight and note",
  "markRemove": "Remove highlight"
};

const mark = 'light-dark(#f4c43066,#f4c43047)', markLine = 'light-dark(#ce980acc,#f4c430bf)', soft = 'var(--ww-orn-2)', softLine = 'var(--ww-orn)';

export const styles = `
.ww-cards:has(>.ww-read){display:flex;flex-direction:column;height:100%;min-height:0}
.ww-cards:has(>.ww-read)>.ww-news-header{flex:none;margin-bottom:12px}
.ww-read{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;padding-bottom:2px}
.ww-read-stepper{display:inline-flex;align-items:center;gap:2px}
.ww-read-stepper b{font:600 14.5px var(--ww-serif);padding:0 4px;white-space:nowrap}
.ww-read .ww-read-nav,.ww-read-stepper .ww-read-nav{width:28px;height:28px;min-height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--ww-ink-2);font-size:16px;line-height:1}
.ww-read-nav:hover:not(:disabled){background:var(--ww-hover);color:var(--ww-ink)}
.ww-read-nav:disabled{opacity:.3}
.ww-read-tabs{flex:none;display:flex;gap:6px;flex-wrap:wrap}
.ww-read-board{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:16px}
.ww-read[data-form=tabs] .ww-read-board{grid-template-columns:minmax(0,1fr)}
.ww-read[data-form=tabs][data-tab=news] .ww-read-side,.ww-read[data-form=tabs]:not([data-tab=news]) .ww-read-news,
.ww-read[data-form=tabs][data-tab=tip] :is(.ww-read-book,.ww-read-rv),.ww-read[data-form=tabs][data-tab=read] .ww-read-tip{display:none}
.ww-read-pane{min-width:0;min-height:0;display:flex;flex-direction:column;gap:8px}
.ww-read-head{flex:none;display:flex;align-items:center;gap:4px 10px;flex-wrap:wrap;min-height:30px}
.ww-read-head h3{margin:0;font:600 16px/1.4 var(--ww-serif);color:var(--ww-ink);white-space:nowrap}
.ww-read-head small{font-size:12.5px;color:var(--ww-ink-3);white-space:nowrap}
.ww-read-grow{flex:1}
.ww-read-headend{flex:none;margin-left:auto;display:inline-flex;align-items:center;gap:6px}
.ww-read-chips{display:inline-flex;gap:4px;flex-wrap:wrap}
.ww-read .ww-chip{position:relative;min-height:26px;height:26px;padding:0 10px;font-size:12.5px}
.ww-read .ww-chip[data-on=true]{background:${soft};border-color:${softLine};color:var(--ww-ink)}
.ww-read-dot{position:absolute;top:2px;right:3px;width:6px;height:6px;border-radius:50%;background:var(--ww-ribbon)}
.ww-read-fit{flex:1;min-height:0;overflow:hidden}
.ww-read-newsbody{display:flex;flex-direction:column;gap:10px}
.ww-read-side{min-width:0;min-height:0;overflow:hidden;display:grid;grid-auto-rows:auto;align-content:stretch;gap:14px}
.ww-read-side>.ww-read-pane{min-height:auto}
.ww-read-cards{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px}
.ww-read-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.ww-read-foot{margin-top:auto;padding-top:2px}
.ww-read .ww-read-btn,.ww-read a.ww-read-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:26px;height:26px;padding:0 10px;border:1px solid var(--ww-line-2);border-radius:8px;background:var(--ww-surface);color:var(--ww-ink);font-size:12.5px;font-weight:400;text-decoration:none;white-space:nowrap}
.ww-read .ww-read-btn:hover:not(:disabled){background:var(--ww-hover)}
.ww-read .ww-read-btn[aria-pressed=true]{background:${soft};border-color:${softLine};color:var(--ww-ink)}
.ww-read .ww-read-btn.ww-primary{background:var(--ww-fill);border-color:var(--ww-fill);color:var(--ww-on-fill)}
.ww-read .ww-read-btn.ww-ghost{border-color:transparent;background:transparent;color:var(--ww-ink-2)}
.ww-read .ww-read-link{min-height:0;padding:0;border:0;background:transparent;color:var(--ww-brand);font-size:12.5px;font-weight:400;white-space:nowrap}
.ww-read .ww-read-link:hover:not(:disabled){background:transparent;text-decoration:underline}
.ww-read .ww-read-mark{flex:none;width:26px;height:26px;min-height:26px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--ww-ink-3);display:inline-grid;place-items:center}
.ww-read .ww-read-mark:hover:not(:disabled){background:var(--ww-hover);color:var(--ww-ink)}
.ww-read-mark svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linejoin:round}
.ww-read .ww-read-mark[aria-pressed=true]{color:var(--ww-brand)}
.ww-read-mark[aria-pressed=true] svg{fill:currentColor}
.ww-read .ww-tag{flex:none}
.ww-read-tag-me{background:${soft};color:var(--ww-ink)}
.ww-read-tag-leak{background:color-mix(in srgb,var(--ww-warn) 14%,transparent);color:var(--ww-warn)}
.ww-read-hint{font-size:12.5px;color:var(--ww-ink-3)}
.ww-read-lead{flex:none;position:relative;overflow:hidden;border:1px solid var(--ww-line-2);border-radius:16px;background:var(--ww-surface-2);padding:14px 16px 20px;display:flex;flex-direction:column;gap:7px}
.ww-read .ww-read-t{min-height:0;padding:0;border:0;border-radius:4px;background:transparent;color:var(--ww-ink);text-align:left;font-weight:400}
.ww-read .ww-read-t:hover:not(:disabled){background:transparent;color:var(--ww-brand)}
.ww-read-t span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.ww-read .ww-read-lead-t{font:600 clamp(18px,2.2cqw,22px)/1.42 var(--ww-serif)}
.ww-read-lead-d{margin:0;color:var(--ww-ink-2);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.ww-read-rel{margin:0;padding:6px 10px;border-radius:8px;background:${soft};font-size:13px;color:var(--ww-ink)}
.ww-read-rel b{font-weight:600;color:var(--ww-ink);margin-right:8px;white-space:nowrap}
.ww-read-quick{flex:1 0 auto;max-height:calc(var(--n)*62px);list-style:none;margin:0;padding:0;border:1px solid var(--ww-line);border-radius:14px;background:var(--ww-surface-2);overflow:hidden;display:flex;flex-direction:column}
.ww-read-q{flex:1 0 auto;min-height:34px;display:flex;align-items:center;gap:8px;padding:3px 8px 3px 12px;border-top:1px solid var(--ww-line)}
.ww-read-q:first-child{border-top:0}
.ww-read-q-n{flex:none;width:18px;font:600 13px var(--ww-serif);color:var(--ww-ink-3);font-variant-numeric:tabular-nums;text-align:center}
.ww-read-q-m{flex:1;min-width:0;display:flex;flex-direction:column}
.ww-read .ww-read-q-t{font-size:14px;line-height:1.5}
.ww-read-q-d{display:none;font-size:12.5px;line-height:1.45;color:var(--ww-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-read-q-s{flex:none;font-size:12px;color:var(--ww-ink-3);white-space:nowrap}
.ww-read-seen .ww-read-t{color:var(--ww-ink-3)}
.ww-read-blank{flex:1 0 auto;margin:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border:1px dashed var(--ww-line-2);border-radius:14px;font-size:13px;color:var(--ww-ink-3)}
.ww-read-today{display:flex;flex-direction:column;gap:10px;margin-bottom:10px}.ww-read-today .ww-read-blank{flex:0 0 auto;display:block;line-height:1.7}.ww-read-today .ww-read-blank strong{display:block;color:var(--ww-ink-2);font-weight:600}
.ww-read-wkme{flex:none;margin:0;padding:10px 12px;border:1px solid var(--ww-orn);border-radius:12px;background:linear-gradient(120deg,var(--ww-orn-2),transparent 60%),var(--ww-surface-2);font-size:13px;color:var(--ww-ink-2)}
.ww-read-newsbody[data-d="0"] .ww-read-q-d{display:block}
.ww-read-newsbody:not([data-d="0"]) .ww-read-q-s{display:none}
.ww-read-newsbody:not([data-d="0"]) .ww-read-lead-d{-webkit-line-clamp:2}
.ww-read-newsbody:is([data-d="2"],[data-d="3"],[data-d="4"]) .ww-read-q .ww-read-tag-plain{display:none}
.ww-read-newsbody:is([data-d="3"],[data-d="4"]) .ww-read-lead-d{display:none}
.ww-read-newsbody:is([data-d="3"],[data-d="4"]) .ww-read-q-t span{-webkit-line-clamp:1}
.ww-read-newsbody:is([data-d="3"],[data-d="4"]) .ww-read-q{min-height:30px;padding-block:1px}
.ww-read-newsbody:is([data-d="3"],[data-d="4"]) .ww-read-lead{padding:10px 14px 14px;gap:5px}
.ww-read-newsbody:is([data-d="3"],[data-d="4"]){gap:8px}
.ww-read-newsbody[data-d="4"] .ww-read-quick{flex:1 1 0;min-height:0;max-height:none;overflow:auto;scrollbar-width:thin}
.ww-read-newsbody[data-d="4"] .ww-read-q{flex:none}
.ww-read-tipcard{flex:1 0 auto;position:relative;border:1px solid var(--ww-line);border-radius:14px;background:var(--ww-surface-2);padding:12px 14px;display:flex;flex-direction:column;gap:7px;min-width:0}
.ww-read-kind{font-size:12px;font-weight:600;color:var(--ww-tip);background:var(--ww-tip-tint);border-radius:5px;padding:0 7px;white-space:nowrap}
.ww-read-kind-usage{color:var(--ww-ink);background:${soft}}
.ww-read-tipcard h4{margin:0;font:600 15.5px/1.45 var(--ww-serif);color:var(--ww-ink);text-wrap:balance}
.ww-read-tipcard p{margin:0;font-size:13px;color:var(--ww-ink-2);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.ww-read-ticks{display:flex;gap:3px;align-items:center}
.ww-read-ticks i{width:10px;height:6px;border-radius:2px;background:transparent;box-shadow:inset 0 0 0 1px var(--ww-line-2)}
.ww-read-ticks i[data-day=issued]{background:var(--ww-tip-tint);box-shadow:none}
.ww-read-ticks i[data-day=partial]{background:color-mix(in srgb,var(--ww-warn-dot) 40%,transparent);box-shadow:none}
.ww-read-ticks i[data-today]{outline:1.5px solid var(--ww-tip);outline-offset:1px}
.ww-read-books{display:flex;flex-direction:column;gap:8px}
.ww-read[data-form=tabs] .ww-read-books{flex-direction:row;flex-wrap:wrap}
.ww-read[data-form=tabs] .ww-read-bookrow{flex:1 1 220px}
.ww-read-bookrow{flex:none;position:relative;overflow:hidden;display:flex;align-items:center;border:1px solid var(--ww-line);border-radius:14px;background:var(--ww-surface-2);min-width:0}
.ww-read-bookrow[data-missing]{filter:saturate(.3)}
.ww-read .ww-read-bookopen{flex:1;min-width:0;display:flex;gap:12px;align-items:center;min-height:0;border:0;border-radius:0;background:transparent;padding:9px 4px 9px 14px;text-align:left;color:inherit;font-weight:400}
.ww-read .ww-read-bookopen:hover:not(:disabled){background:var(--ww-tint)}
.ww-read-bookrow .ww-cover{flex:none;width:var(--ww-read-cover,58px);height:auto;aspect-ratio:3/4}
.ww-read-booktxt{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;justify-content:center}
.ww-read-booktxt small{font-size:12px;color:var(--ww-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-read-booktxt strong{font:600 15px/1.4 var(--ww-serif);color:var(--ww-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-read-bar{height:4px;border-radius:2px;background:var(--ww-tint);overflow:hidden}
.ww-read-bar i{display:block;height:100%;background:var(--ww-brand);border-radius:2px}
.ww-read-bookrow .ww-book-menu{flex:none;align-self:flex-start;margin:6px 6px 0 0}
.ww-read-next{display:flex;flex-direction:column;gap:2px}
.ww-read .ww-read-nextrow{display:flex;align-items:baseline;gap:10px;min-height:28px;padding:2px 10px;border:0;border-radius:8px;background:transparent;text-align:left;font-weight:400;color:var(--ww-ink)}
.ww-read .ww-read-nextrow:hover:not(:disabled){background:var(--ww-hover)}
.ww-read-nextrow small{flex:none;font-size:12px;color:var(--ww-ink-3)}
.ww-read-nextrow strong{flex:1;min-width:0;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-read .ww-read-add{flex:1 0 auto;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;min-height:72px;padding:12px 16px;border:1.5px dashed var(--ww-line-3);border-radius:14px;background:transparent;text-align:left;font-weight:400;color:var(--ww-ink)}
.ww-read-add small{font-size:12.5px;color:var(--ww-ink-3)}
.ww-read-quote{flex:1 0 auto;border:1px solid var(--ww-line);border-radius:14px;background:var(--ww-surface-2);padding:11px 14px;display:flex;flex-direction:column;gap:6px;min-width:0}
.ww-read-quote blockquote{margin:0;font:500 15px/1.65 var(--ww-serif);color:var(--ww-ink);border-left:3px solid ${markLine};padding-left:10px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.ww-read-mine{margin:0;font-size:13px;color:var(--ww-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ww-read-from{margin:0;font-size:12px;color:var(--ww-ink-3)}
.ww-read[data-form=board] .ww-read-rv .ww-read-foot{padding-inline-end:var(--ww-fab-safe,150px)}
.ww-read-side:not([data-d="0"]) .ww-read-ticksrow{display:none}
.ww-read-side:not([data-d="0"]) .ww-read-bookrow{--ww-read-cover:44px}
.ww-read-side[data-d="1"] .ww-read-tipcard p{-webkit-line-clamp:3}
.ww-read-side:is([data-d="2"],[data-d="3"],[data-d="4"]) .ww-read-tipcard p{-webkit-line-clamp:2}
.ww-read-side[data-d="2"] .ww-read-quote blockquote{-webkit-line-clamp:3}
.ww-read-side:is([data-d="3"],[data-d="4"]) .ww-read-quote blockquote{-webkit-line-clamp:2}
.ww-read-side[data-d="4"]{overflow:auto;scrollbar-width:thin}
.ww-read-side:is([data-d="2"],[data-d="3"],[data-d="4"]) .ww-read-mine,.ww-read-side:is([data-d="3"],[data-d="4"]) :is(.ww-read-from,.ww-read-bar,.ww-read-next){display:none}
.ww-read-form{display:flex;flex-direction:column;gap:8px}
.ww-read-form input{width:100%}
.ww-read-formrow{display:flex;gap:8px;align-items:center}
.ww-read-formrow input{flex:1;width:auto;min-width:0}
.ww-read-like{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}
.ww-reading-set{display:flex;flex-direction:column;gap:2px;padding:14px 16px;border:1px solid var(--ww-line);border-radius:14px;background:var(--ww-surface-2)}
.ww-reading-set h3{margin:0 0 6px;font:600 15px var(--ww-serif)}
.ww-reading-set .ww-choice{align-items:flex-start;padding:6px 0}
.ww-reading-set .ww-choice span{display:flex;flex-direction:column}
.ww-reading-set .ww-choice small{font-size:12.5px;color:var(--ww-ink-3)}
.ww-reading-sub{padding-left:26px}
.ww-reading-review{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0}
.ww-reading-review>span{display:flex;flex-direction:column}
.ww-reading-review small{font-size:12.5px;color:var(--ww-ink-3)}
::highlight(ww-book-mark){background-color:${mark}}
::highlight(ww-book-mark-noted){background-color:${mark};text-decoration:underline;text-decoration-color:${markLine};text-decoration-thickness:2px;text-underline-offset:3px}
.ww-book-marks{display:flex;flex-direction:column;gap:10px;min-width:0;padding:16px 14px;border-left:1px solid var(--ww-rule);overflow:auto;background:var(--ww-paper)}
.ww-book-marks h3{margin:0;font:600 14px var(--ww-serif)}
.ww-book-marks .ww-read-quote{flex:none;background:var(--ww-sheet)}
.ww-book-marks .ww-read-quote blockquote{font-size:14px;display:block}
.ww-book-marks .ww-read-mine{white-space:normal}
.ww-book-marks-help{margin:0;font-size:12.5px;color:var(--ww-ink-2)}
.ww-book-body[data-marks=open]{grid-template-columns:clamp(12.5rem,22%,20rem) minmax(0,1fr) clamp(13.5rem,24%,19rem)}
.ww-book-body[data-marks=open][data-toc=closed]{grid-template-columns:minmax(0,1fr) clamp(13.5rem,24%,19rem)}
@container ww-book (max-width:52rem){.ww-book-marks{position:absolute;inset:0 0 0 auto;z-index:3;width:min(18.75rem,85%);box-shadow:-12px 0 30px -18px #0006}}
.ww-book-selbar{position:fixed;z-index:6;transform:translateX(-50%);display:flex;align-items:center;gap:2px;padding:4px;border-radius:10px;background:var(--ww-fill,var(--dsw-alias-label-primary));color:var(--ww-on-fill,var(--dsw-alias-bg-layer-1));box-shadow:0 12px 30px -12px #0008;white-space:nowrap}
.ww-book .ww-book-selbar button{min-height:0;height:28px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:inherit;font-size:13px;font-weight:400}
.ww-book .ww-book-selbar button:hover:not(:disabled){background:color-mix(in srgb,currentColor 18%,transparent)}
.ww-book .ww-book-selbar input{width:min(260px,46vw);height:28px;min-height:0;border:0;border-radius:7px;padding:0 8px;font-size:13px;background:color-mix(in srgb,currentColor 14%,transparent);color:inherit;outline:none}
.ww-book-selbar input::placeholder{color:color-mix(in srgb,currentColor 55%,transparent)}
.ww-book .ww-book-markbtn{min-height:0;height:28px;padding:0 10px;border:1px solid var(--ww-rule);border-radius:8px;background:transparent;color:var(--ww-ink-2);font-size:12.5px;font-weight:400;white-space:nowrap}
.ww-book .ww-book-markbtn[aria-expanded=true]{background:var(--ww-sheet);color:var(--ww-ink)}
`;
