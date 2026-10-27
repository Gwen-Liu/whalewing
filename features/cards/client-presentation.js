
import * as tips from './tips-presentation.js';

/** 领域文案与样式；组合入口只保留原有级联位置。 */
export const zh = {
  "newsRemoveTitle": "删除领域",
  "newsDiscardTitle": "放弃领域草稿",
  "newsSaved": "资讯领域已保存",
  "newsRemoved": "资讯领域已删除",
  "news": "知识卡片",
  "newsSettings": "卡片设置",
  "newsSettingsClose": "返回知识卡片",
  "newsDaily": "每日资讯",
  "newsLearning": "今日学习",
  "newsConfigureSchedule": "管理资讯计划",
  "newsInitialize": "重试默认资讯计划",
  "newsDiagnostics": "查看运行详情",
  "newsHelp": "本地模型根据明确配置的 RSS/Atom 来源精选，每期最多十条，不代表覆盖全球所有网站；阅读和配置不会采集新闻或调用模型",
  "newsWindow": "本期发布时间窗口（北京时间）",
  "newsAdd": "添加领域",
  "newsEdit": "编辑领域",
  "newsName": "领域名称",
  "newsFocus": "关注描述",
  "newsEnabled": "纳入每日采集",
  "newsSave": "保存领域",
  "newsRemove": "删除领域",
  "newsRemoveHelp": "删除后不再采集这个领域，已有日报保留",
  "newsLastHelp": "这是最后一个启用的领域，请先暂停每日资讯，再修改领域",
  "newsConfirm": "确认修改领域",
  "newsConflictReload": "读取最新版本（保留草稿）",
  "newsDiscard": "放弃领域草稿",
  "newsDiscardHelp": "确认放弃未提交的领域和来源修改？",
  "newsSources": "公开订阅来源",
  "newsSourceHelp": "选择已有来源，或添加公开的 HTTPS 订阅地址",
  "newsSourceName": "来源名称",
  "newsSourceUrl": "公开 HTTPS 订阅地址",
  "newsSourceKind": "来源性质",
  "newsSourceRegion": "来源地区",
  "newsPrimary": "一手来源",
  "newsMedia": "媒体来源",
  "newsDomestic": "国内",
  "newsOverseas": "海外",
  "newsSourceAdd": "加入来源表单",
  "newsSourceChoose": "请选择",
  "newsStartHelp": "每天北京时间 08:00 自动整理已启用的领域，使用 DSH 默认模型，会产生模型费用；DSH 需要处于运行状态",
  "newsReports": "查看历史日报",
  "newsCurrent": "读取本期日报",
  "newsReportEmpty": "今日日报尚未生成",
  "newsHistoryEmpty": "尚无已保存日报",
  "newsHistoryOlder": "更早日报",
  "newsHistoryFields": "已保存日报的领域",
  "newsDeletedField": "领域已删除，历史只读",
  "newsPartial": "部分来源失败",
  "newsEmpty": "本期没有符合条件的条目",
  "newsImportance": "重要性",
  "newsRelevance": "跟我们的关系",
  "newsHeadline": "来源标题",
  "newsLeak": "内测 / 传闻",
  "newsMediaOnly": "媒体报道",
  "newsCount": "{count} 条",
  "newsCat_model": "大模型",
  "newsCat_agent": "智能体与产品",
  "newsCat_opensource": "开源与工具",
  "newsCat_media": "图像 · 视频 · 语音",
  "newsCat_research": "研究与其他",
  "newsImpact": "可能工作影响（推断）",
  "newsUnverified": "未知",
  "newsOpenSession": "打开生成会话",
  "newsWriteUnknown": "没能确认保存结果，草稿还在；请刷新查看",
  "newsReadback": "保存后的内容和提交的不一致，草稿还在；请刷新查看",
  "unavailable": "不可用",
  "sources": "允许沉淀的会话",
  "newsMore": "展开另外 {count} 条",
  "newsKicker": "资讯",
  "newsToday": "今天",
  "newsYesterday": "昨天",
  "newsCutoff": "截至 {time}",
  "learningDate": "{month} 月 {day} 日 · 星期{week}",
  "bookToc": "目录",
  "bookPrev": "上一页",
  "bookNext": "下一页",
  "bookSmaller": "缩小字号",
  "bookLarger": "放大字号",
  "bookProgress": "阅读进度",
  "bookEnd": "完",
  "newsLess": "收起",
  "newsMoreLabel": "展开或收起本领域的第二行资讯",
  "newsSourcesTitle": "来源",
  "newsViewSource": "查看来源",
  "learningSource": "资料来源",
  "learningMeta": "常看 {daily} / 2 本 · 书架 {total} 本",
  "learningNoPin": "还没有常看书 · 书架 {total} 本",
  "learningShelfEmpty": "书架还是空的",
  "learningMinutes": "约 {minutes} 分钟",
  "learningChapter": "第 {index} / {count} 章",
  "learningChapterShort": "第 {index} 章",
  "learningReadChapter": "读第 {index} 章 →",
  "learningReadLabel": "读《{title}》第 {index} 章：{chapter}",
  "learningRereadLabel": "《{title}》已读完，打开最后一章",
  "learningNext": "接下来",
  "learningAllChapters": "查看全部 {count} 章",
  "learningFinished": "已读完",
  "learningFinishedText": "整本书读完了。可以从目录挑章节重读，或换一本常看。",
  "learningFinishedSwap": "换一本 →",
  "learningMissingTitle": "《{title}》的阅读副本不见了",
  "learningMissingText": "可以取消常看，或从书架删除后重新导入。",
  "learningIssue": "书架没读出来：{reason}",
  "learningReload": "重新读取",
  "learningAddPin": "添加常看书籍",
  "learningAddPinText": "从书架选一到两本，首页每天接着读下一章",
  "learningAddPinLabel": "添加常看书籍，打开选择抽屉",
  "learningEmptyTitle": "书架里还没有书",
  "learningEmptyText": "导入电子书，或从在线书目下载开放许可的书",
  "learningTip": "AI 使用技巧",
  "learningTipWaiting": "今天的技巧 08:00 后整理好",
  "learningTipEmpty": "AI 使用技巧随每日资讯一起整理，DSH 需要开着。",
  "learningTipMore": "查看往期",
  "learningTipRecent": "近 14 天",
  "learningTipLabel": "{name}，{date}，{title}。近 14 天整理了 {count} 期。打开技巧历史",
  "learningTipDisabled": "{name}已停用",
  "learningTipEnable": "到卡片设置开启",
  "library": "书架",
  "libraryOpen": "打开书架",
  "libraryAll": "全部",
  "libraryActions": "更多操作",
  "librarySearch": "查找书名或作者",
  "libraryNoMatch": "没有找到“{query}”",
  "libraryClearSearch": "清除查找",
  "librarySort": "排序",
  "librarySort_added": "最近加入",
  "librarySort_title": "书名",
  "librarySort_progress": "阅读进度",
  "librarySort_added_desc": "从新到旧",
  "librarySort_added_asc": "从旧到新",
  "librarySort_title_asc": "按书名拼音从前往后",
  "librarySort_title_desc": "按书名拼音从后往前",
  "librarySort_progress_desc": "读得多的在前",
  "librarySort_progress_asc": "读得少的在前",
  "libraryImport": "导入电子书",
  "libraryImportHelp": "EPUB、PDF、TXT、MOBI 等格式\n单本不超过 200 MB\n书只存在本机",
  "libraryImporting": "正在上传《{name}》{percent}%",
  "libraryParsing": "正在解析《{name}》",
  "libraryImportCount": "第 {index} / {count} 本",
  "libraryImported": "已导入《{title}》",
  "libraryImportedSkipped": "已导入《{title}》，有 {count} 张图片过大没有保留",
  "libraryImportedMany": "已导入 {count} 本书",
  "libraryEmpty": "书架是空的。点“导入电子书”，或打开在线书目下载开放许可的书。",
  "libraryGroupEmpty": "这个分组还没有书。可以在书的“编辑”里加入分组，或在这个分组里直接导入。",
  "libraryGroups": "管理分组",
  "libraryGroupsHelp": "分组像标签，一本书可以放进多个分组；“全部”总是显示所有书。删除分组不会删除书。",
  "libraryGroupName": "分组名称",
  "libraryGroupAdd": "添加分组",
  "libraryGroupRename": "重命名",
  "libraryGroupSave": "保存名称",
  "libraryGroupRemove": "删除分组",
  "libraryGroupRemoveTitle": "删除分组",
  "libraryGroupRemoveHelp": "删除分组“{name}”？书不会被删除，只是去掉这个分组。",
  "libraryGroupCount": " · {count} 本",
  "libraryGroupSaved": "分组已保存",
  "libraryGroupRemoved": "分组已删除",
  "libraryRead": "阅读",
  "libraryEdit": "编辑",
  "libraryEditTitle": "编辑书籍信息",
  "libraryTitle": "书名",
  "libraryAuthor": "作者",
  "libraryBookGroups": "分组",
  "libraryNoGroups": "还没有分组，可以在“管理分组”里新建。",
  "librarySave": "保存书籍信息",
  "librarySaved": "书籍信息已保存",
  "libraryDiscard": "放弃修改",
  "libraryDiscardTitle": "放弃修改",
  "libraryDiscardHelp": "确认放弃对这本书的修改？",
  "librarySourceImport": "导入自 {name}",
  "librarySourceCatalog": "来自在线书目 · {license}",
  "libraryRemove": "从书架删除",
  "libraryRemoveTitle": "删除这本书",
  "libraryRemoveHelp": "从书架删除《{title}》？本机保存的阅读副本和阅读进度会一起删除，你的原文件不受影响。",
  "libraryRemoveHelpPinned": "它也会从首页常看里移除。",
  "libraryRemoved": "已从书架删除",
  "libraryOpenFailed": "没打开《{title}》：{reason}",
  "libraryReadFailed": "书架没读出来",
  "libraryChapters": "{count} 章",
  "libraryProgress": "读到第 {index} 章",
  "libraryProgressOf": "读到第 {index} / {count} 章",
  "libraryUnread": "未读",
  "libraryDone": "已读完",
  "libraryDailyBadge": "常看",
  "libraryPin": "设为常看",
  "libraryUnpin": "取消常看",
  "librarySwap": "换一本",
  "libraryPinAdd": "再加一本常看",
  "libraryShowInShelf": "在书架中查看",
  "libraryPinSlot": "设一本常看",
  "libraryPinCount": "{count} / 2",
  "libraryPinBandText": "首页每天接着读这两本",
  "libraryPinBandOne": "首页每天接着读这一本",
  "libraryPinBandNone": "设一到两本，首页每天接着读",
  "libraryPinFullTitle": "常看书籍最多两本",
  "libraryPinFullText": "把《{title}》设为常看，需要换下一本。换下的书留在书架上，阅读进度不变。",
  "libraryPinChoose": "选一本换下",
  "libraryPinReplace": "换下《{title}》",
  "libraryPinReplaced": "《{title}》已设为常看，换下了《{old}》",
  "libraryPinDone": "《{title}》已设为常看",
  "libraryUnpinDone": "已取消常看《{title}》",
  "libraryUndo": "撤销",
  "libraryUndone": "已撤销",
  "libraryPinConflict": "常看书籍刚在别处改过，已重新读取",
  "libraryPinsTitle": "选择常看书籍",
  "libraryPinsHelp": "最多两本，首页按书名顺序显示。",
  "libraryPinsSelected": "已选 {count} / 2 本",
  "libraryPinsFull": "已选满两本，先取消一本",
  "libraryPinsSave": "保存常看书籍",
  "libraryPinsSaved": "常看书籍已保存",
  "libraryPinsDiscardHelp": "确认放弃对常看书籍的修改？",
  "libraryPinAuto": "已放到首页常看",
  "libraryPinAutoMany": "{titles}已放到首页常看",
  "libraryPinFullNote": "常看已满两本",
  "libraryUnpinHome": "不放首页",
  "libraryPinNotice": "常看书籍改为最多两本：保留{kept}，其余 {released} 本仍在书架",
  "libraryCatalog": "在线书目",
  "libraryCatalogHelp": "书目里是开放许可的书，存放在鲸翼的 GitHub 书库。需要时再下载到本机书架，不占插件体积；下载后会核对文件校验值。",
  "libraryCatalogEmpty": "在线书目暂时没有书。",
  "libraryDownload": "下载到书架",
  "libraryDownloaded": "已下载《{title}》",
  "libraryInstalled": "已在书架",
  "libraryLicense": "许可",
  "libraryFetchedAt": "书目获取于 {time}",
  "libraryChapterPrev": "上一章",
  "libraryChapterNext": "下一章",
  "libraryChapterEnd": "本章完",
  "libraryBookEnd": "全书完",
  "libraryImageMissing": "图片读取失败"
};
export const en = {
  "newsHeadline": "Source headline",
  "newsMore": "Show {count} more",
  "newsKicker": "News",
  "newsToday": "Today",
  "newsYesterday": "Yesterday",
  "newsCutoff": "As of {time}",
  "learningDate": "{month}/{day}",
  "bookToc": "Contents",
  "bookPrev": "Previous page",
  "bookNext": "Next page",
  "bookSmaller": "Smaller text",
  "bookLarger": "Larger text",
  "bookProgress": "Reading progress",
  "bookEnd": "End",
  "newsLess": "Show less",
  "newsMoreLabel": "Show or hide the second row of this field",
  "newsSourcesTitle": "Sources",
  "newsViewSource": "View source",
  "learningSource": "Sources",
  "learningNoPin": "No pinned books · {total} on the shelf",
  "learningShelfEmpty": "The shelf is empty",
  "learningChapterShort": "Chapter {index}",
  "learningReadChapter": "Read chapter {index} →",
  "learningReadLabel": "Read {title}, chapter {index}: {chapter}",
  "learningRereadLabel": "{title} is finished; open the last chapter",
  "learningMeta": "{daily} / 2 pinned · {total} on the shelf",
  "learningFinishedText": "You finished this book. Pick a chapter from the contents to reread, or pin another book.",
  "learningEmptyText": "Import an e-book, or download an openly licensed book from the online catalog",
  "learningTipWaiting": "Today's tip is ready after 08:00",
  "learningTipEmpty": "AI tips are compiled with the daily news; DSH needs to be running.",
  "learningTipMore": "Past tips",
  "libraryImportHelp": "EPUB, PDF, TXT, MOBI and more\nUp to 200 MB per book\nBooks stay on this computer",
  "libraryDailyBadge": "Pinned",
  "learningNext": "Up next",
  "learningAllChapters": "All {count} chapters",
  "learningFinishedSwap": "Swap book →",
  "learningMissingTitle": "The reading copy of “{title}” is missing",
  "learningMissingText": "Unpin it, or remove it from the shelf and import it again.",
  "learningIssue": "Couldn't read the shelf: {reason}",
  "learningReload": "Reload",
  "learningAddPin": "Pin books",
  "learningAddPinText": "Pick one or two books from the shelf; Home picks up at the next chapter each day",
  "learningAddPinLabel": "Pin books, opens the picker",
  "learningTipRecent": "Last 14 days",
  "learningTipLabel": "{name}, {date}, {title}. {count} issues in the last 14 days. Open tip history",
  "learningTipDisabled": "{name} is turned off",
  "learningTipEnable": "Turn on in card settings",
  "librarySearch": "Search title or author",
  "libraryNoMatch": "Nothing matches “{query}”",
  "libraryClearSearch": "Clear search",
  "librarySort": "Sort",
  "librarySort_added": "Recently added",
  "librarySort_title": "Title",
  "librarySort_progress": "Progress",
  "librarySort_added_desc": "Newest first",
  "librarySort_added_asc": "Oldest first",
  "librarySort_title_asc": "Title A to Z",
  "librarySort_title_desc": "Title Z to A",
  "librarySort_progress_desc": "Most read first",
  "librarySort_progress_asc": "Least read first",
  "libraryRemoveHelpPinned": " It will also leave the pinned books on Home.",
  "libraryOpenFailed": "Couldn't open “{title}”: {reason}",
  "libraryReadFailed": "Couldn't read the shelf",
  "libraryProgressOf": "At chapter {index} / {count}",
  "libraryPin": "Pin",
  "libraryUnpin": "Unpin",
  "librarySwap": "Swap book",
  "libraryPinAdd": "Pin another book",
  "libraryShowInShelf": "Show on shelf",
  "libraryPinSlot": "Pin a book",
  "libraryPinCount": "{count} / 2",
  "libraryPinBandText": "Home picks up both books each day",
  "libraryPinBandOne": "Home picks up this book each day",
  "libraryPinBandNone": "Pin one or two books to read on Home",
  "libraryPinFullTitle": "Up to two pinned books",
  "libraryPinFullText": "To pin “{title}”, unpin one book. It stays on the shelf with its progress.",
  "libraryPinChoose": "Choose one to unpin",
  "libraryPinReplace": "Unpin “{title}”",
  "libraryPinReplaced": "Pinned “{title}”, unpinned “{old}”",
  "libraryPinDone": "Pinned “{title}”",
  "libraryUnpinDone": "Unpinned “{title}”",
  "libraryUndo": "Undo",
  "libraryUndone": "Undone",
  "libraryPinConflict": "Pinned books changed elsewhere; reloaded",
  "libraryPinsTitle": "Choose pinned books",
  "libraryPinsHelp": "Up to two. Home lists them by title.",
  "libraryPinsSelected": "{count} / 2 selected",
  "libraryPinsFull": "Two selected. Clear one first.",
  "libraryPinsSave": "Save pinned books",
  "libraryPinsSaved": "Pinned books saved",
  "libraryPinsDiscardHelp": "Discard your changes to pinned books?",
  "libraryPinAuto": "pinned to Home",
  "libraryPinAutoMany": "{titles} pinned to Home",
  "libraryPinFullNote": "two books are already pinned",
  "libraryUnpinHome": "Keep off Home",
  "libraryPinNotice": "Pinned books are now limited to two: kept {kept}; the other {released} stay on the shelf"
};
// 技巧历史页的词条和样式由 tips-presentation.js 持有，并入本功能的词条表；重名由组合层拒收。
for (const [target, source] of [[zh, tips.zh], [en, tips.en]]) for (const [key, value] of Object.entries(source)) {
  if (Object.hasOwn(target, key)) throw new Error(`重复界面词条：${key}`);
  target[key] = value;
}
/** 书架、每日一章与 AI 技巧卡的样式，追加在卡片样式末尾。 */
export const libraryStyles = ".yj-library{display:flex;flex-direction:column;gap:18px}.yj-library-chips{display:flex;flex-wrap:wrap;gap:8px;min-width:0}.yj-page .yj-library-chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;font-size:13px;color:var(--dsw-alias-label-secondary)}.yj-library-chip small{font-size:11px;opacity:.7}.yj-page .yj-library-chip[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent)}.yj-library-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:22px 18px}.yj-library-book{position:relative;display:flex;flex-direction:column;gap:10px;min-width:0;cursor:pointer;border-radius:12px;outline-offset:4px}.yj-library-book:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}.yj-cover{--yj-accent:var(--dsw-alias-brand-primary);position:relative;aspect-ratio:3/4;border-radius:6px 10px 10px 6px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);box-shadow:0 1px 0 var(--dsw-alias-border-l1),0 14px 26px -18px rgb(0 0 0 / .55);transition:transform .2s,box-shadow .2s}.yj-cover::before{content:'';position:absolute;inset:0 auto 0 0;width:7px;background:linear-gradient(90deg,rgb(0 0 0 / .18),transparent);z-index:1}.yj-library-book:hover .yj-cover{transform:translateY(-3px);box-shadow:0 1px 0 var(--dsw-alias-border-l1),0 20px 30px -18px color-mix(in srgb,var(--yj-accent) 70%,transparent)}.yj-cover img{display:block;width:100%;height:100%;object-fit:cover}.yj-cover-plain{display:flex;flex-direction:column;justify-content:space-between;height:100%;box-sizing:border-box;padding:18px 14px 16px 20px;color:#fff;background:linear-gradient(160deg,var(--yj-accent),color-mix(in srgb,var(--yj-accent) 55%,#111))}.yj-cover-plain strong{font-size:16px;line-height:1.45;font-weight:700;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}.yj-cover-plain small{font-size:12px;opacity:.85}.yj-library-meta{display:flex;flex-direction:column;gap:3px;min-width:0}.yj-library-name{display:flex;align-items:flex-start;gap:4px}.yj-library-name h4{flex:1;margin:0;font-size:14px;font-weight:600;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.yj-library-meta small{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.yj-library-author{color:var(--dsw-alias-label-secondary)}.yj-library-meta .yj-tile-badge{align-self:flex-start;margin-top:4px}.yj-page .yj-library-add{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;aspect-ratio:3/4;padding:16px;border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;background:transparent;text-align:center;color:var(--dsw-alias-label-primary)}.yj-library-add strong{font-size:14px;overflow-wrap:anywhere}.yj-library-add small{font-size:11.5px;line-height:1.6}.yj-library-groups{display:flex;flex-direction:column;gap:8px;margin:12px 0 18px}.yj-library-group{display:flex;align-items:center;gap:8px}.yj-library-group input{flex:1;min-width:0}.yj-library-group-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yj-library-group-add{display:flex;align-items:flex-end;gap:8px}.yj-library-group-add .yj-field{flex:1}.yj-catalog{display:flex;flex-direction:column;gap:10px}.yj-catalog-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}.yj-catalog-list li{display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px}.yj-catalog-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}.yj-catalog-info p{margin:4px 0;font-size:13px;color:var(--dsw-alias-label-secondary)}.yj-book-flow .yj-book-image{display:block;max-width:100%;max-height:60vh;margin:.6em auto;break-inside:avoid;border-radius:4px}.yj-book-image-wait{display:block;height:6em;margin:.6em 0;border-radius:6px;background:var(--yj-sheet)}.yj-book-image-missing{display:block;margin:.6em 0;font-size:.85em;color:var(--yj-ink-2)}.yj-page .yj-book-next-chapter{display:block;margin:0 auto;padding:.4em 1em;border:1px solid var(--yj-rule);border-radius:999px;background:transparent;color:var(--yj-accent);font-size:.9em}@media(max-width:620px){.yj-library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}";
/**
 * 书房改版（2026-10-25）：知识卡片根节点 .yj-cards 上的颜色令牌（深色值用 light-dark()，阅读器 .yj-book 保留自己的纸面变量）、
 * 首页书桌与技巧卡、书架页（常看栏、书格、导入卡）、选择抽屉与替换弹窗。整段追加在书架样式之后，只覆盖、不改前面已审查的样式。
 */
export const deskStyles = `
.yj-cards{--yj-serif:"Noto Serif SC","Source Han Serif SC","Songti SC",var(--dsw-font-family);--yj-paper:var(--dsw-alias-bg-layer-1);--yj-sheet:var(--dsw-alias-bg-layer-2);--yj-rule:var(--dsw-alias-border-l1);--yj-ink:var(--dsw-alias-label-primary);--yj-ink-2:var(--dsw-alias-label-secondary);--yj-tip:#9333ea;--yj-tip-strong:#7e22ce;--yj-tip-tint:#f4ebfd;--yj-ribbon:#b23a2e;--yj-ribbon-tint:#f7ebea;--yj-warn:#b45309;--yj-warn-dot:#d97706;--yj-warn-tint:#fef3e2;--yj-paper-shadow:var(--dsw-elevation-soft,0 1px 2px #0000000a);--yj-cover-shadow:0 1px 0 #0000000a,0 14px 26px -18px #0000008c}
.yj-desk-card,.yj-pin-slot,.yj-library-book,.yj-pin-row,.yj-pin-choice{--yj-fill:var(--yj-accent)}
@supports (color:light-dark(#000,#fff)){.yj-cards{--yj-tip:light-dark(#9333ea,#cc9bfd);--yj-tip-strong:light-dark(#7e22ce,#cc9bfd);--yj-tip-tint:light-dark(#f4ebfd,#3f3947);--yj-ribbon:light-dark(#b23a2e,#ee8e7b);--yj-ribbon-tint:light-dark(#f7ebea,#473830);--yj-warn:light-dark(#b45309,#fbbf24);--yj-warn-dot:light-dark(#d97706,#f59e0b);--yj-warn-tint:light-dark(#fef3e2,#4c3e28);--yj-cover-shadow:0 1px 0 light-dark(#0000000a,#ffffff0f),0 14px 26px -18px light-dark(#0000008c,#000000b3)}.yj-desk-card,.yj-pin-slot,.yj-library-book,.yj-pin-row,.yj-pin-choice{--yj-fill:color-mix(in srgb,var(--yj-accent) 75%,light-dark(var(--yj-accent),#f9fafb))}.yj-desk-card{--yj-glow:light-dark(color-mix(in srgb,var(--yj-fill) 55%,transparent),color-mix(in srgb,var(--yj-fill) 35%,transparent))}.yj-cards .yj-news-tile .yj-tile-kicker{color:color-mix(in srgb,var(--yj-accent) 72%,light-dark(var(--yj-accent),#f9fafb))}.yj-cards .yj-news-tile .yj-tile-num{color:light-dark(color-mix(in srgb,var(--yj-accent) 28%,transparent),color-mix(in srgb,var(--yj-accent) 35%,transparent))}.yj-tip-cells i{border-color:light-dark(#0000001a,#ffffff29)}}
.yj-cards .yj-tile{background:var(--dsw-alias-bg-layer-2)}.yj-cards .yj-shelf{margin-bottom:48px}.yj-cards .yj-shelf-head{margin-bottom:20px}.yj-cards .yj-brief-flag{color:var(--yj-warn);border-color:color-mix(in srgb,var(--yj-warn-dot) 55%,transparent)}.yj-cards .yj-brief-flag-media{color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l2)}.yj-warn-mark{display:inline-flex;align-items:center;gap:4px;font-weight:500;color:var(--yj-warn)}.yj-warn-mark::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--yj-warn-dot)}
.yj-cards .yj-cover{background:var(--yj-accent);box-shadow:var(--yj-cover-shadow)}.yj-cover::after{content:'';position:absolute;top:0;bottom:0;left:7px;width:1px;background:#ffffff38;z-index:1}.yj-cover-plain strong{font-family:var(--yj-serif)}.yj-cover-l{width:150px;border-radius:4px 8px 8px 4px}.yj-cover-l .yj-cover-plain{padding:18px 14px 18px 18px}.yj-cover-l .yj-cover-plain strong{font-size:16px;line-height:24px;-webkit-line-clamp:4}.yj-cover-m .yj-cover-plain{padding:20px 18px 20px 20px}.yj-cover-m .yj-cover-plain strong{font-size:18px;line-height:26px}.yj-cover-s,.yj-cover-xs,.yj-cover-xxs{flex:none;border-radius:3px 6px 6px 3px}.yj-cover-s{width:87px}.yj-cover-xs{width:60px}.yj-cover-xxs{width:42px}.yj-cover-s .yj-cover-plain{padding:10px 8px 8px 12px}.yj-cover-xs .yj-cover-plain{padding:8px 6px 6px 10px}.yj-cover-s .yj-cover-plain strong,.yj-cover-xs .yj-cover-plain strong{font-family:var(--dsw-font-family);font-size:11px;line-height:15px;-webkit-line-clamp:4}.yj-cover-xs .yj-cover-plain strong{font-size:9px;line-height:12px}.yj-cover-s small,.yj-cover-xs small,.yj-cover-xxs .yj-cover-plain>*{display:none}
.yj-learning{container-type:inline-size}.yj-desk-row{display:grid;grid-template-columns:minmax(0,920fr) minmax(0,316fr);gap:24px;align-items:stretch}.yj-desk-solo{grid-template-columns:minmax(0,1fr)}.yj-desk{display:grid;grid-template-columns:minmax(0,1fr);gap:24px;min-width:0}.yj-desk-pair{grid-template-columns:repeat(2,minmax(0,1fr))}
.yj-desk-card{overflow:hidden;position:relative;min-width:0;min-height:264px;border:1px solid var(--yj-rule);border-radius:16px;background:var(--yj-paper);color:var(--yj-ink);box-shadow:4px 4px 0 -1px var(--yj-paper),4px 4px 0 0 var(--yj-rule),var(--yj-paper-shadow);transition:transform .2s ease,box-shadow .2s ease;animation:yj-skel-in .2s ease backwards;--yj-glow:color-mix(in srgb,var(--yj-fill) 55%,transparent)}.yj-desk-card:not(.yj-desk-missing):has(>.yj-desk-main:hover){transform:translateY(-2px);box-shadow:4px 4px 0 -1px var(--yj-paper),4px 4px 0 0 var(--yj-rule),var(--yj-paper-shadow),0 22px 38px -24px var(--yj-glow)}.yj-desk-card:not(.yj-desk-missing):has(>.yj-desk-main:active){transform:none;transition-duration:.1s}
.yj-desk-wide{display:grid;grid-template-columns:minmax(0,1fr) 307px}.yj-desk-main{display:grid;grid-template-columns:150px minmax(0,1fr);gap:24px;align-items:start;min-width:0;height:100%;padding:24px;border-radius:16px;cursor:pointer;outline:none}.yj-desk-main:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.yj-desk-main .yj-cover{margin-top:8px}.yj-desk-card:not(.yj-desk-missing) .yj-desk-main:hover .yj-cover{transform:translateY(-2px)}
.yj-desk-text{display:flex;flex-direction:column;min-width:0;min-height:216px}.yj-desk-chapter{display:flex;align-items:center;gap:6px;margin:0;padding-right:28px;font-size:12px;line-height:20px;font-weight:600;color:var(--yj-ink);font-variant-numeric:tabular-nums}.yj-desk-chapter i{flex:none;width:6px;height:6px;border-radius:50%;background:var(--yj-fill)}.yj-desk-chip{margin-left:2px;height:18px;padding:0 8px;border-radius:999px;background:var(--yj-sheet);color:var(--yj-ink-2);font-size:11px;line-height:18px;font-weight:400;white-space:nowrap}
.yj-desk-title{margin:12px 0 0;font:600 21px/30px var(--yj-serif);color:var(--yj-ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.yj-desk-wide .yj-desk-title{font-size:22px;line-height:32px}.yj-desk-excerpt{margin:8px 0 0;font-size:13px;line-height:22px;color:var(--yj-ink-2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.yj-desk-track{flex:none;margin-top:auto;height:3px;border-radius:2px;background:var(--yj-rule);overflow:hidden}.yj-desk-track i{display:block;height:100%;border-radius:2px;background:var(--yj-fill);transition:width .35s ease}.yj-desk-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:9px;font-size:12px;line-height:18px;color:var(--yj-ink-2)}.yj-desk-book{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yj-desk-book strong{font:600 14px/18px var(--yj-serif)}.yj-desk-go{flex:none;display:grid;justify-items:end;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}.yj-desk-go>span{grid-area:1/1;transition:opacity .12s ease}.yj-desk-read{opacity:0;font-weight:600;color:var(--yj-ink)}.yj-desk-main:hover .yj-desk-pct,.yj-desk-main:focus-visible .yj-desk-pct{opacity:0}.yj-desk-main:hover .yj-desk-read,.yj-desk-main:focus-visible .yj-desk-read{opacity:1}
.yj-desk-next{display:flex;flex-direction:column;min-width:0;margin:24px 0;padding:0 24px;border-left:1px solid var(--yj-rule)}.yj-desk-eyebrow{margin:0 0 14px;font-size:12px;line-height:18px;font-weight:600;letter-spacing:.08em;color:var(--yj-ink-2)}.yj-cards .yj-desk-next-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"no no" "name time";align-items:baseline;column-gap:12px;height:48px;margin:0 -8px;padding:6px 8px 0;border:0;border-radius:8px;background:transparent;color:var(--yj-ink);text-align:left;font-weight:400}.yj-desk-next-row+.yj-desk-next-row::before{content:'';position:absolute;top:0;left:8px;right:8px;border-top:1px dashed var(--yj-rule)}.yj-cards .yj-desk-next-row:hover:not(:disabled){background:var(--yj-sheet)}.yj-desk-next-row small{font-size:11px;line-height:16px;color:var(--yj-ink-2);font-variant-numeric:tabular-nums}.yj-desk-next-row small:first-child{grid-area:no}.yj-desk-next-row small:last-child{grid-area:time;white-space:nowrap}.yj-desk-next-row strong{grid-area:name;min-width:0;font:600 14px/22px var(--yj-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.yj-cards .yj-desk-all{align-self:flex-start;margin-top:16px;padding:0;border:0;background:transparent;font-size:12px;line-height:18px;font-weight:600;color:var(--yj-ink)}.yj-cards .yj-desk-all:hover:not(:disabled){background:transparent;text-decoration:underline}
.yj-desk-card>.yj-book-menu{position:absolute;top:12px;right:12px;z-index:1}.yj-cards .yj-book-menu .yj-icon-button{width:28px;height:28px;min-height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);opacity:.6;transition:opacity .2s,background .2s}.yj-cards .yj-book-menu .yj-icon-button:is(:hover,:focus-visible,[aria-expanded=true]),.yj-library-book:hover .yj-book-menu .yj-icon-button{opacity:1;background:var(--dsw-alias-interactive-bg-hover)}.yj-cards :is(.yj-desk-card,.yj-pin-slot) .yj-book-menu .yj-icon-button{color:var(--yj-ink-2)}.yj-cards :is(.yj-desk-card:hover,.yj-pin-slot:hover) .yj-book-menu .yj-icon-button,.yj-cards :is(.yj-desk-card,.yj-pin-slot) .yj-book-menu .yj-icon-button:is(:hover,:focus-visible,[aria-expanded=true]){opacity:1;background:var(--yj-sheet)}
.yj-desk-missing .yj-desk-main{cursor:default;filter:saturate(.3)}.yj-desk-missing .yj-cover{opacity:.4}.yj-desk-card[aria-busy=true] .yj-desk-main{pointer-events:none}.yj-desk-card[aria-busy=true]::after{content:'';position:absolute;top:0;left:16px;right:16px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,var(--yj-fill),transparent) 0 0/40% 100% no-repeat;opacity:0;animation:yj-desk-load 1s linear .15s infinite}@keyframes yj-desk-load{from{opacity:1;background-position:-60% 0}to{opacity:1;background-position:160% 0}}
.yj-desk-issue{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:14px;min-height:264px;padding:24px 32px;border:1px solid var(--yj-rule);border-radius:16px;background:var(--yj-paper);color:var(--yj-ink);box-shadow:var(--yj-paper-shadow)}.yj-desk-issue p{margin:0;font-size:14px;line-height:22px;overflow-wrap:anywhere}
.yj-cards .yj-desk-add{display:flex;align-items:center;justify-content:center;gap:30px;width:100%;min-height:264px;padding:24px;border:1.5px dashed var(--dsw-alias-border-l3);border-radius:16px;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;font-weight:400;transition:border-color .16s,background .16s}.yj-cards .yj-desk-add:hover:not(:disabled){border-color:var(--dsw-alias-border-l4);background:var(--dsw-alias-interactive-bg-hover)}.yj-cards .yj-desk-add:focus-visible{outline-offset:4px}.yj-desk-ghosts{position:relative;flex:none;width:148px;height:144px}.yj-desk-ghosts i{position:absolute;left:10px;top:0;width:96px;height:128px;border:1px dashed var(--yj-rule);border-radius:3px 6px 6px 3px;background:var(--yj-paper);transform:rotate(-6deg);transition:transform .16s ease}.yj-desk-ghosts i+i{left:48px;top:16px;border-style:solid;background:var(--yj-sheet);transform:rotate(4deg)}.yj-desk-ghost-one i{left:32px;top:8px;transform:none}.yj-desk-ghosts b{position:absolute;left:80px;top:96px;display:grid;place-items:center;width:40px;height:40px;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;background:var(--dsw-alias-bg-layer-1);font-size:20px;font-weight:400;line-height:1;transition:transform .16s ease}.yj-desk-add:hover .yj-desk-ghosts b{transform:translateY(-2px)}.yj-desk-add:hover .yj-desk-ghosts i+i{transform:rotate(6deg)}.yj-desk-add-text{display:flex;flex-direction:column;gap:8px;max-width:330px}.yj-desk-add-text strong{font-size:18px;line-height:26px;font-weight:600}.yj-desk-add-text small{font-size:13px;line-height:22px;color:var(--dsw-alias-label-secondary)}
.yj-tip-card{--yj-accent:var(--yj-tip);min-height:264px;padding:22px 24px 20px}.yj-cards .yj-tip-card .yj-tile-icon{background:var(--yj-tip-tint)}.yj-tip-card .yj-tile-title{font-size:16px;line-height:26px;-webkit-line-clamp:2}.yj-tip-card .yj-tile-text{line-height:22px;-webkit-line-clamp:2}.yj-cards .yj-tip-date{margin-left:auto;background:var(--dsw-alias-interactive-bg-hover);font-weight:500;font-variant-numeric:tabular-nums}.yj-tip-strip{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto}.yj-tip-cells{display:flex;gap:3px}.yj-tip-cells i{width:12px;height:8px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:2px}.yj-tip-cells i[data-day=issued]{border:0;background:color-mix(in srgb,var(--yj-tip) 72%,transparent)}.yj-tip-cells i[data-day=partial]{border:0;background:color-mix(in srgb,var(--yj-tip) 40%,transparent)}.yj-tip-cells i[data-today]{outline:1px solid var(--yj-tip);outline-offset:1px}.yj-tip-cells i[data-today]:not([data-day=none]){background:var(--yj-tip)}.yj-tip-cells i[data-today][data-day=none]{border-color:var(--yj-tip)}.yj-tip-strip small{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.yj-tip-card .yj-tile-foot{margin-top:18px}.yj-tip-more{flex:none;font-weight:600;color:var(--yj-tip);white-space:nowrap}
.yj-skeleton{pointer-events:none;animation:yj-skel-in .2s ease .2s backwards}@keyframes yj-skel-in{from{opacity:0}}.yj-skeleton :is(i,b){animation:yj-skel 1.2s ease-in-out infinite}@keyframes yj-skel{50%{opacity:.55}}.yj-skel-paper{display:grid;grid-template-columns:150px minmax(0,1fr);gap:24px;padding:32px 24px}.yj-skel-paper i{height:200px;border-radius:4px 8px 8px 4px;background:var(--yj-sheet)}.yj-skel-paper span{display:flex;flex-direction:column;gap:14px}.yj-skeleton b{display:block;height:12px;border-radius:6px;background:var(--yj-sheet)}.yj-skeleton b:nth-child(2){width:80%}.yj-skeleton b:nth-child(3){width:55%}.yj-skel-tile{min-height:172px;cursor:default}.yj-skel-tile b{background:var(--dsw-alias-interactive-bg-hover)}
.yj-cards .yj-library{container-type:inline-size;gap:0}.yj-library-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:36px}.yj-crumbs{display:flex;align-items:baseline;gap:8px;margin-right:30px;white-space:nowrap}.yj-cards .yj-crumb{padding:0;border:0;background:transparent;font-size:20px;line-height:28px;font-weight:400;color:var(--dsw-alias-label-secondary)}.yj-cards .yj-crumb:hover:not(:disabled){background:transparent;color:var(--dsw-alias-label-primary);text-decoration:underline}.yj-crumbs>span{font-size:16px;color:var(--dsw-alias-label-tertiary)}.yj-crumbs h2{margin:0;font-size:20px;line-height:28px;font-weight:600}.yj-crumbs small{font-size:13px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}.yj-cards .yj-library-head>.yj-icon-button{width:28px;height:28px;min-height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary)}.yj-cards .yj-library-head>.yj-icon-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.yj-shelf-tools{display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap}.yj-cards label.yj-library-search{display:flex;flex-direction:row;align-items:center;gap:8px;width:200px;height:32px;padding:0 6px 0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary)}.yj-library-search:focus-within{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.yj-cards .yj-library-search input{flex:1;width:auto;min-width:0;height:100%;padding:0;border:0;outline:none;background:transparent;font-size:13px;color:var(--dsw-alias-label-primary)}.yj-library-search input::-webkit-search-cancel-button{display:none}.yj-library-search kbd{flex:none;display:grid;place-items:center;width:16px;height:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;font:11px/1 var(--dsw-font-family-mono,ui-monospace,monospace)}.yj-library-search:focus-within kbd{visibility:hidden}.yj-cards .yj-shelf-tools>button,.yj-cards .yj-library-sort{width:auto;height:32px;padding:0 12px;font-size:13px}.yj-cards .yj-library-dir{width:32px;padding:0;font-size:16px;color:var(--dsw-alias-label-secondary)}
.yj-pin-band{display:grid;grid-template-columns:144px minmax(0,1fr);gap:24px;margin:20px 0 24px;padding:20px 24px;border:1px solid var(--yj-rule);border-radius:16px;background:var(--yj-paper);color:var(--yj-ink);box-shadow:var(--yj-paper-shadow)}.yj-pin-label{display:flex;flex-direction:column;gap:6px}.yj-pin-label p{margin:0;font-size:12px;line-height:18px;font-weight:600;letter-spacing:.08em;color:var(--yj-ink-2)}.yj-pin-label strong{font-size:28px;line-height:32px;font-weight:300;font-variant-numeric:tabular-nums}.yj-pin-label small{font-size:12px;line-height:18px;color:var(--yj-ink-2)}.yj-pin-slots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;padding-left:23px;border-left:1px solid var(--yj-rule)}
.yj-pin-slot{position:relative;min-width:0;min-height:116px}.yj-pin-main{display:flex;gap:20px;height:calc(100% + 16px);margin:-8px;padding:8px;border-radius:10px;cursor:pointer;transition:background .2s}.yj-pin-main:hover{background:var(--yj-sheet)}.yj-pin-text{display:flex;flex-direction:column;flex:1;min-width:0;padding-right:32px}.yj-pin-text strong{font:600 16px/24px var(--yj-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.yj-pin-text small{font-size:12px;line-height:18px;color:var(--yj-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.yj-pin-text>small:nth-child(2){margin-top:6px}.yj-pin-line{margin-top:14px}.yj-pin-track{display:flex;align-items:center;gap:8px;margin-top:12px}.yj-pin-track i{flex:0 1 260px;height:3px;border-radius:2px;background:var(--yj-rule);overflow:hidden}.yj-pin-track b{display:block;height:100%;background:var(--yj-fill);transition:width .35s ease}.yj-pin-track small{font-size:11px;line-height:14px;font-variant-numeric:tabular-nums}.yj-pin-slot>.yj-book-menu{position:absolute;top:0;right:0}.yj-cards .yj-pin-empty{display:grid;place-items:center;width:100%;border:1.5px dashed var(--yj-rule);border-radius:10px;background:transparent;color:var(--yj-ink-2);font-size:13px;font-weight:600}.yj-cards .yj-pin-empty:hover:not(:disabled){border-color:var(--yj-ink-2);background:transparent}
.yj-cards .yj-library-grid{grid-template-columns:repeat(auto-fill,minmax(172px,1fr));gap:28px 24px}.yj-cards .yj-library-book{gap:12px;cursor:default}.yj-library-cover{position:relative;border-radius:6px 10px 10px 6px;cursor:pointer;outline:2px solid transparent;outline-offset:2px}.yj-library-cover:focus-visible{outline-color:var(--dsw-alias-brand-primary)}.yj-library-book[data-flash] .yj-library-cover{animation:yj-flash 1.2s ease forwards}@keyframes yj-flash{from,60%{outline-color:var(--dsw-alias-brand-primary)}to{outline-color:transparent}}.yj-cards .yj-library-name h4{font:600 15px/22px var(--yj-serif);cursor:pointer}.yj-library-name .yj-book-menu{flex:none}
.yj-ribbon{position:absolute;top:-3px;right:16px;z-index:2;width:14px;height:34px;filter:drop-shadow(0 2px 4px #00000040);transition:transform .2s;animation:yj-ribbon-in .18s ease backwards}.yj-ribbon::before{content:'';position:absolute;inset:0;background:var(--yj-ribbon);clip-path:polygon(0 0,100% 0,100% 100%,50% calc(100% - 6px),0 100%)}@keyframes yj-ribbon-in{from{opacity:0;transform:translateY(-12px)}}.yj-library-book:hover .yj-ribbon{transform:translateY(-3px)}.yj-pin-badge{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;height:18px;margin-top:6px;padding:0 8px;border-radius:999px;background:var(--yj-ribbon-tint);color:var(--yj-ribbon);font-size:11px;line-height:18px;font-weight:600;animation:yj-skel-in .2s ease backwards}
.yj-cards .yj-library-add{position:relative;gap:8px;border-radius:6px 10px 10px 6px;overflow:hidden}.yj-cards .yj-library-add:hover:not(:disabled){border-color:var(--dsw-alias-border-l4);background:var(--dsw-alias-interactive-bg-hover)}.yj-cards .yj-library-add .yj-add-mark{width:40px;height:40px;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:20px}.yj-library-add small{white-space:pre-line}.yj-library-add-bar{position:absolute;left:0;bottom:0;height:2px;background:var(--dsw-alias-brand-primary);transition:width .35s ease}.yj-library-none{display:flex;align-items:center;gap:12px;margin:0 0 16px;font-size:13px;color:var(--dsw-alias-label-secondary)}.yj-cards .yj-text-button{padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-weight:600;text-decoration:underline}
.yj-pin-drawer{display:flex;flex-direction:column;gap:12px}.yj-pin-drawer>.yj-muted{margin:0}.yj-cards .yj-pin-drawer label.yj-library-search{width:100%}.yj-pin-count{margin:0;font-size:12px;line-height:18px;font-weight:600}.yj-pin-list{list-style:none;margin:0;padding:0}.yj-pin-row{border-top:1px solid var(--dsw-alias-border-l1)}.yj-pin-row label{display:flex;flex-direction:row;align-items:center;gap:14px;min-height:72px;padding:8px;border-radius:8px;cursor:pointer}.yj-pin-row[data-on] label{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 4%,transparent)}.yj-pin-row[data-locked] label{opacity:.45;cursor:not-allowed}.yj-pin-row-text{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}.yj-pin-row-text strong{font:600 15px/22px var(--yj-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.yj-pin-row-text small{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.yj-cards .yj-pin-row input{appearance:none;flex:none;display:grid;place-items:center;width:18px;height:18px;margin:0;padding:0;border:1.5px solid var(--dsw-alias-border-l3);border-radius:4px;background:transparent;cursor:inherit}.yj-cards .yj-pin-row input:checked{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary)}.yj-cards .yj-pin-row input:checked::after{content:'';width:9px;height:5px;margin-top:-2px;border:solid var(--dsw-alias-bg-layer-1);border-width:0 0 2px 2px;transform:rotate(-45deg)}.yj-pin-error{display:flex;flex-direction:column;align-items:flex-start;gap:12px}.yj-pin-error p{margin:0}
.yj-modal.yj-confirm.yj-pin-replace.yj-page[open]{width:min(520px,calc(100vw - 32px))}.yj-pin-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}.yj-cards .yj-pin-choice{position:relative;display:flex;align-items:flex-start;gap:14px;min-height:140px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);text-align:left;font-weight:400}.yj-pin-choice>span{display:flex;flex-direction:column;gap:8px;min-width:0;padding-right:22px}.yj-pin-choice strong{font:600 14px/20px var(--yj-serif);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.yj-pin-choice small{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.yj-radio{position:absolute;top:14px;right:14px;width:16px;height:16px;box-sizing:border-box;border:1.5px solid var(--dsw-alias-border-l3);border-radius:50%}.yj-cards .yj-pin-choice[aria-checked=true]{padding:13px;border:2px solid var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 4%,var(--dsw-alias-bg-layer-1))}.yj-pin-choice[aria-checked=true] .yj-radio{top:13px;right:13px;border:5px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1)}.yj-pin-replace .yj-primary .yj-spinner{display:inline-block;width:12px;height:12px;margin-right:6px;vertical-align:-2px;border-color:currentColor;border-top-color:transparent}
.yj-serif-off :is(.yj-desk-title,.yj-desk-book strong,.yj-desk-next-row strong,.yj-pin-text strong,.yj-library-name h4,.yj-pin-row-text strong,.yj-pin-choice strong,.yj-cover-plain strong){letter-spacing:-.01em}.yj-serif-off .yj-desk-title{font-size:20px}.yj-serif-off .yj-desk-wide .yj-desk-title{font-size:21px}
@container (max-width:1239px){.yj-desk-row{grid-template-columns:minmax(0,1fr)}.yj-tip-card{min-height:0}}@container (max-width:899px){.yj-desk-main{grid-template-columns:minmax(0,1fr)}.yj-desk-main .yj-cover{margin-top:0}.yj-desk-text{min-height:0}.yj-desk-track{margin-top:16px}.yj-desk-wide{grid-template-columns:minmax(0,1fr)}.yj-desk-next{margin:0 24px 24px;padding:16px 0 0;border-left:0;border-top:1px solid var(--yj-rule)}.yj-pin-band{grid-template-columns:minmax(0,1fr)}.yj-pin-slots{padding-left:0;border-left:0}}@container (max-width:599px){.yj-desk-pair,.yj-pin-slots{grid-template-columns:minmax(0,1fr)}.yj-shelf-tools{margin-left:0}.yj-desk-add{flex-direction:column;text-align:center}}
.yj-cards .yj-tile:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.yj-cards .yj-library-add[data-importing]:disabled{opacity:1;cursor:progress}
.yj-cards :is(.yj-desk-chapter i,.yj-desk-chip,.yj-desk-ghosts b,.yj-pin-badge,.yj-add-mark,.yj-radio,.yj-library-chip,.yj-book-next-chapter,.yj-tile-badge,.yj-tile-mono,.yj-brief-more,.yj-brief-flag,.yj-spinner),.yj-cards .yj-warn-mark::before{corner-shape:round}
@media(prefers-reduced-motion:reduce){.yj-cards :is(.yj-desk-card,.yj-cover,.yj-desk-track i,.yj-pin-track b,.yj-ribbon,.yj-desk-ghosts *,.yj-tile,.yj-pin-badge){transition:none!important;animation:none!important;transform:none!important}.yj-cards .yj-desk-card[aria-busy=true]::after{animation:none;opacity:1;background-position:50% 0}.yj-cards .yj-skeleton{animation:yj-skel-in 1ms .2s backwards!important}.yj-cards .yj-skeleton :is(i,b){animation:none!important}}`;
export const styles = [
`.yj-news .yj-choice{display:flex;gap:8px;overflow-wrap:anywhere}.yj-news .yj-section{min-width:0}.yj-news fieldset{margin-inline:0}.yj-news .yj-field{margin-block:10px}`,
`.yj-news-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}.yj-news-settings{max-width:800px;margin:auto}`,
`
    .yj-shelf{margin:0 0 36px}.yj-shelf-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}.yj-shelf-eyebrow{display:flex;align-items:center;gap:6px;margin:0 0 6px;font-size:12px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary)}.yj-shelf-head h3{margin:0 0 3px;font-size:18px;font-weight:600;letter-spacing:.01em}.yj-shelf-head small{font-size:12px}.yj-shelf-head .yj-row{gap:8px}.yj-shelf-grid{display:grid;gap:16px}.yj-shelf-news{grid-template-columns:repeat(4,minmax(0,1fr))}`,
`.yj-news-tile{min-height:172px}`,
`.yj-book{--yj-paper:var(--dsw-alias-bg-layer-1);--yj-ink:var(--dsw-alias-label-primary);--yj-ink-2:var(--dsw-alias-label-secondary);--yj-rule:var(--dsw-alias-border-l2);--yj-sheet:var(--dsw-alias-bg-layer-2);--yj-gutter:rgb(0 0 0 / .12)}@supports (color:light-dark(#000,#fff)){.yj-book{--yj-paper:light-dark(#fbf8f1,#1f1d1a);--yj-ink:light-dark(#2f2a23,#e9e4da);--yj-ink-2:light-dark(#857a6a,#a49d90);--yj-rule:light-dark(#e8e0d0,#35322c);--yj-sheet:light-dark(#f2ecdf,#292723);--yj-gutter:light-dark(rgb(110 85 45 / .16),rgb(0 0 0 / .55))}}.yj-modal.yj-book[open]{width:min(1240px,calc(100vw - 48px));height:min(900px,calc(100dvh - 48px));max-height:none;padding:0;overflow:hidden;border-color:var(--yj-rule);background:var(--yj-paper);color:var(--yj-ink);box-shadow:0 30px 80px -30px rgb(0 0 0 / .5)}html[data-platform=darwin] .yj-modal.yj-book[open]{height:min(900px,calc(100dvh - var(--dsh-frame-top-clearance,0px) - 48px))}.yj-book-bar{flex:none;display:grid;grid-template-columns:1fr minmax(0,auto) 1fr;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--yj-rule)}.yj-book-bar>:first-child{justify-self:start}.yj-book-title{margin:0;min-width:0;font-size:13px;letter-spacing:.04em;color:var(--yj-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.yj-book-tools{justify-self:end;display:flex;align-items:center;gap:2px}.yj-page .yj-book-tools .yj-icon-button{min-width:32px;font-size:13px;color:var(--yj-ink-2)}.yj-book .yj-menu-trigger{color:var(--yj-ink-2)}`,
`.yj-book-stage{position:relative;flex:1;min-height:0;display:flex;padding:40px 76px 10px}.yj-book-viewport{position:relative;flex:1;min-width:0;overflow:hidden}.yj-book-flow{position:absolute;inset:0;column-count:1;column-gap:56px;column-fill:auto;font-family:"Noto Serif SC","Source Han Serif SC","Songti SC",var(--dsw-font-family);font-size:var(--yj-book-size,16.5px);line-height:1.95;letter-spacing:.01em;color:var(--yj-ink);text-align:justify;overflow-wrap:break-word}.yj-book-spread::before{content:'';position:absolute;top:28px;bottom:6px;left:50%;width:84px;transform:translateX(-50%);pointer-events:none;background:linear-gradient(90deg,transparent,var(--yj-gutter) 47%,var(--yj-gutter) 53%,transparent);opacity:.6}.yj-book-spread::after{content:'';position:absolute;top:28px;bottom:6px;left:50%;width:1px;pointer-events:none;background:var(--yj-rule)}.yj-page .yj-book-edge{position:absolute;top:0;bottom:0;z-index:1;width:76px;display:grid;place-items:center;padding:0;border:0;border-radius:0;background:transparent;color:var(--yj-ink-2);opacity:0;transition:opacity .2s,background .2s}.yj-book-prev{left:0}.yj-book-next{right:0}.yj-book-stage:hover .yj-book-edge:not(:disabled),.yj-page .yj-book-edge:focus-visible{opacity:.7}.yj-page .yj-book-prev:hover:not(:disabled){opacity:1;background:linear-gradient(90deg,var(--yj-sheet),transparent)}.yj-page .yj-book-next:hover:not(:disabled){opacity:1;background:linear-gradient(270deg,var(--yj-sheet),transparent)}.yj-page .yj-book-edge:disabled{opacity:0;cursor:default}.yj-book-foot{flex:none;display:grid;grid-template-columns:1fr minmax(0,2fr) 1fr;align-items:center;gap:16px;padding:4px 76px 16px;font-size:12px;color:var(--yj-ink-2)}.yj-book-folio{font-family:var(--dsw-font-family-mono,ui-monospace,monospace);letter-spacing:.06em}.yj-book-folio:last-child{text-align:right}.yj-book-progress{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}.yj-book-progress>span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yj-book-track{width:min(260px,100%);height:3px;border-radius:3px;background:var(--yj-rule);overflow:hidden}.yj-book-track i{display:block;height:100%;border-radius:3px;background:var(--yj-accent);transition:width .35s ease}.yj-book-flow p{margin:0 0 .95em;orphans:2;widows:2}.yj-book-flow h1,.yj-book-flow h2,.yj-book-flow h3,.yj-book-flow h4{break-after:avoid;text-align:left;line-height:1.45;color:var(--yj-ink)}.yj-book-flow h1{margin:0 0 .7em;font-size:1.6em;font-weight:700}.yj-book-flow h2{margin:1.5em 0 .7em;font-size:1.3em;font-weight:600}.yj-book-flow h3{margin:1.3em 0 .5em;font-size:1.1em;font-weight:600}.yj-book-flow h4{margin:1.1em 0 .4em;font-size:1em}.yj-book-flow ul,.yj-book-flow ol{margin:0 0 1em;padding-left:1.4em}.yj-book-flow li{margin:.2em 0}.yj-book-flow pre{break-inside:avoid;margin:0 0 1em;padding:.8em 1em;border-radius:10px;background:var(--yj-sheet);white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8em;line-height:1.7;text-align:left}.yj-book-flow code{font-family:var(--dsw-font-family-mono,ui-monospace,monospace);font-size:.88em}.yj-book-flow :not(pre)>code{padding:.1em .35em;border-radius:5px;background:var(--yj-sheet)}.yj-book-flow blockquote{margin:0 0 1em;padding:.1em 0 .1em 1em;border-left:3px solid color-mix(in srgb,var(--yj-accent) 60%,transparent);color:var(--yj-ink-2)}.yj-book-flow hr{margin:1.4em 0;border:0;text-align:center}.yj-book-flow hr::after{content:'· · ·';letter-spacing:.5em;color:var(--yj-ink-2)}.yj-book-flow img{max-width:100%;max-height:55vh;break-inside:avoid}.yj-book-flow .yj-table{break-inside:avoid;overflow-x:auto;margin:0 0 1em;font-size:.82em}.yj-book-flow table{width:100%;border-collapse:collapse}.yj-book-flow th,.yj-book-flow td{padding:.35em .6em;border:1px solid var(--yj-rule);text-align:left}.yj-book-flow a{color:var(--yj-accent)}.yj-book-flow [lang=en]{text-align:left;hyphens:auto}.yj-book-colophon{break-inside:avoid;margin-top:2.4em;padding-top:1.2em;border-top:1px solid var(--yj-rule);font-size:.85em;color:var(--yj-ink-2);overflow-wrap:anywhere}.yj-book-end{margin:0 0 1.2em!important;text-align:center;letter-spacing:.3em}@media(max-width:1100px){.yj-shelf-news{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.yj-shelf-news{grid-template-columns:1fr}.yj-book-stage{padding:24px 40px 8px}.yj-page .yj-book-edge{width:40px}.yj-book-foot{padding:4px 40px 12px}}@media(prefers-reduced-motion:reduce){.yj-tile,.yj-brief-chevron,.yj-tile-go,.yj-book-track i,.yj-page .yj-book-edge{animation:none;transition:none}}`,
`
    .yj-page .yj-news-settings{max-width:none;margin:0;display:flex;flex-direction:column;gap:16px}.yj-news-toolbar{display:flex;gap:10px;flex-wrap:wrap}.yj-news-field h2{font-size:15px;margin:0}.yj-news-field .yj-error{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
`
    .yj-news-form{border:0;padding:0;margin:0;min-width:0;display:flex;flex-direction:column;gap:10px}.yj-news-history{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px}${libraryStyles}${deskStyles}${tips.styles}`
];

// 专属错误只解释本领域；输入原文与公共运输错误由共用呈现机制处理。
export const errors = {
  "NEWS_FETCH_FAILED": [
    "订阅来源暂时读不到（来源网站或网络问题）",
    "请确认订阅地址能在浏览器里打开，其他来源不受影响"
  ],
  "NEWS_FEED": [
    "订阅来源暂时读不到（来源网站或网络问题）",
    "请确认订阅地址能在浏览器里打开，其他来源不受影响"
  ],
  "NEWS_URL": [
    "订阅来源暂时读不到（来源网站或网络问题）",
    "请确认订阅地址能在浏览器里打开，其他来源不受影响"
  ],
  "NEWS_SCHEDULE": [
    "DSH 定时服务尚未就绪",
    "新版请检查 DSH 启动日志并重启；旧版请确认官方定时任务插件已启用，然后刷新"
  ],
  "NEWS_UNAVAILABLE": [
    "DSH 定时服务尚未就绪",
    "新版请检查 DSH 启动日志并重启；旧版请确认官方定时任务插件已启用，然后刷新"
  ],
  "NEWS_DUPLICATE": [
    "这项内容刚在别处被修改过（数据已变化）",
    "你的修改仍在编辑区，请先「重新读取」查看最新内容，再决定如何保存"
  ],
  "NEWS_CANCELLED": [
    "操作已取消",
    "需要时可以重新开始"
  ],
  "NEWS_RECEIPT": [
    "插件收到的结果不完整（插件问题）",
    "请重试；仍不行请完全退出 DSH 后重新打开"
  ]
};
export const inputCodes = [
  "NEWS_IDENTITY",
  "NEWS_SOURCE",
  "NEWS_DISABLED"
];
// 书架和电子书解析的报错原句就是具体原因与办法（如“有 DRM 加密”“请先解压”），原样展示。
export const messageCodes = [
  "LIBRARY_STORAGE", "LIBRARY_PATH", "LIBRARY_MISSING", "LIBRARY_UPLOAD", "LIBRARY_SIZE", "LIBRARY_BUSY", "LIBRARY_DUPLICATE", "LIBRARY_FULL",
  "LIBRARY_GROUP", "LIBRARY_SOURCE", "LIBRARY_NETWORK", "LIBRARY_INTEGRITY", "LIBRARY_PIN_FULL", "BOOK_FORMAT", "BOOK_PARSE", "BOOK_TIMEOUT"
];
