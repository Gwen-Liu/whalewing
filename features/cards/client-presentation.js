
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
  "newsCreate": "添加",
  "newsSaveChanges": "保存修改",
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
  "bookSections": "本章小节",
  "bookText": "正文",
  "bookImageView": "查看大图",
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
  "cardsSummaryLoading": "正在读取书架和每日资讯",
  "cardsSummaryShelf": "书架 {total} 本，常看 {daily} 本",
  "cardsSummaryShelfIssue": "书架没读出来",
  "cardsSummaryNews": "今日资讯 {count} 条",
  "cardsSummaryNewsNone": "今日资讯没有符合条件的条目",
  "cardsSummaryMissing": "{count} 本常看书的阅读副本不见了",
  "cardsSummaryPartial": "{count} 个领域部分来源失败",
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
  "libraryEmptyFile": "文件是空的（0 字节），没有内容可导入。请确认选对了文件，或重新导出后再导入",
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
  "libraryGroupsDiscardHelp": "确认放弃还没保存的分组名？",
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
  "libraryScrollNext": "停一下再往下滚，进入下一章；← → 也能换章",
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
  "bookSections": "Sections in this chapter",
  "bookText": "Text",
  "bookImageView": "View larger image",
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
  "cardsSummaryLoading": "Loading the shelf and daily news",
  "cardsSummaryShelf": "{total} on the shelf, {daily} pinned",
  "cardsSummaryShelfIssue": "Couldn't read the shelf",
  "cardsSummaryNews": "{count} news items today",
  "cardsSummaryNewsNone": "No qualifying news today",
  "cardsSummaryMissing": "Reading copy missing for {count} pinned books",
  "cardsSummaryPartial": "Some sources failed in {count} fields",
  "libraryEmptyFile": "The file is empty (0 bytes), so there is nothing to import. Check that you picked the right file, or export it again and retry",
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
export const libraryStyles = ".ww-library{display:flex;flex-direction:column;gap:18px}.ww-library-chips{display:flex;flex-wrap:wrap;gap:8px;min-width:0}.ww-page .ww-library-chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;font-size:13px;color:var(--dsw-alias-label-secondary)}.ww-library-chip small{font-size:11px;opacity:.7}.ww-page .ww-library-chip[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent)}.ww-library-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:22px 18px}.ww-library-book{position:relative;display:flex;flex-direction:column;gap:10px;min-width:0;cursor:pointer;border-radius:12px;outline-offset:4px}.ww-library-book:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}.ww-cover{--ww-accent:var(--dsw-alias-brand-primary);position:relative;aspect-ratio:3/4;border-radius:6px 10px 10px 6px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);box-shadow:0 1px 0 var(--dsw-alias-border-l1),0 14px 26px -18px rgb(0 0 0 / .55);transition:transform .2s,box-shadow .2s}.ww-cover::before{content:'';position:absolute;inset:0 auto 0 0;width:7px;background:linear-gradient(90deg,rgb(0 0 0 / .18),transparent);z-index:1}.ww-library-book:hover .ww-cover{transform:translateY(-3px);box-shadow:0 1px 0 var(--dsw-alias-border-l1),0 20px 30px -18px color-mix(in srgb,var(--ww-accent) 70%,transparent)}.ww-cover img{display:block;width:100%;height:100%;object-fit:cover}.ww-cover-plain{display:flex;flex-direction:column;justify-content:space-between;height:100%;box-sizing:border-box;padding:18px 14px 16px 20px;color:#fff;background:linear-gradient(160deg,var(--ww-accent),color-mix(in srgb,var(--ww-accent) 55%,#111))}.ww-cover-plain strong{font-size:16px;line-height:1.45;font-weight:700;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}.ww-cover-plain small{font-size:12px;opacity:.85}.ww-library-meta{display:flex;flex-direction:column;gap:3px;min-width:0}.ww-library-name{display:flex;align-items:flex-start;gap:4px}.ww-library-name h4{flex:1;margin:0;font-size:14px;font-weight:600;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.ww-library-meta small{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ww-library-author{color:var(--dsw-alias-label-secondary)}.ww-library-meta .ww-tile-badge{align-self:flex-start;margin-top:4px}.ww-page .ww-library-add{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;aspect-ratio:3/4;padding:16px;border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;background:transparent;text-align:center;color:var(--dsw-alias-label-primary)}.ww-library-add strong{font-size:14px;overflow-wrap:anywhere}.ww-library-add small{font-size:11.5px;line-height:1.6}.ww-library-groups{display:flex;flex-direction:column;gap:8px;margin:12px 0 18px}.ww-library-group{display:flex;align-items:center;gap:8px}.ww-library-group input{flex:1;min-width:0}.ww-library-group-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ww-library-group-add{display:flex;align-items:flex-end;gap:8px}.ww-library-group-add .ww-field{flex:1}.ww-catalog{display:flex;flex-direction:column;gap:10px}.ww-catalog-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}.ww-catalog-list li{display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px}.ww-catalog-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}.ww-catalog-info p{margin:4px 0;font-size:13px;color:var(--dsw-alias-label-secondary)}.ww-book-flow .ww-book-image{display:block;max-width:100%;max-height:60vh;margin:.6em auto;break-inside:avoid;border-radius:4px}.ww-book-image-wait{display:block;height:6em;margin:.6em 0;border-radius:6px;background:var(--ww-sheet)}.ww-book-image-missing{display:block;margin:.6em 0;font-size:.85em;color:var(--ww-ink-2)}.ww-page .ww-book-next-chapter{display:block;margin:0 auto;padding:.4em 1em;border:1px solid var(--ww-rule);border-radius:999px;background:transparent;color:var(--ww-accent);font-size:.9em}@media(max-width:620px){.ww-library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}";
/**
 * 书房改版（2026-10-25）：知识卡片根节点 .ww-cards 上的颜色令牌（深色值用 light-dark()，阅读器 .ww-book 保留自己的纸面变量）、
 * 首页书桌与技巧卡、书架页（常看栏、书格、导入卡）、选择抽屉与替换弹窗。整段追加在书架样式之后，只覆盖、不改前面已审查的样式。
 */
export const deskStyles = `
.ww-cards{--ww-serif:"Noto Serif SC","Source Han Serif SC","Songti SC",var(--dsw-font-family);--ww-paper:var(--dsw-alias-bg-layer-1);--ww-sheet:var(--dsw-alias-bg-layer-2);--ww-rule:var(--dsw-alias-border-l1);--ww-ink:var(--dsw-alias-label-primary);--ww-ink-2:var(--dsw-alias-label-secondary);--ww-tip:#9333ea;--ww-tip-strong:#7e22ce;--ww-tip-tint:#f4ebfd;--ww-ribbon:#b23a2e;--ww-ribbon-tint:#f7ebea;--ww-warn:#b45309;--ww-warn-dot:#d97706;--ww-warn-tint:#fef3e2;--ww-paper-shadow:var(--dsw-elevation-soft,0 1px 2px #0000000a);--ww-cover-shadow:0 1px 0 #0000000a,0 14px 26px -18px #0000008c}
.ww-desk-card,.ww-pin-slot,.ww-library-book,.ww-pin-row,.ww-pin-choice{--ww-fill:var(--ww-accent)}
@supports (color:light-dark(#000,#fff)){.ww-cards{--ww-tip:light-dark(#9333ea,#cc9bfd);--ww-tip-strong:light-dark(#7e22ce,#cc9bfd);--ww-tip-tint:light-dark(#f4ebfd,#3f3947);--ww-ribbon:light-dark(#b23a2e,#ee8e7b);--ww-ribbon-tint:light-dark(#f7ebea,#473830);--ww-warn:light-dark(#b45309,#fbbf24);--ww-warn-dot:light-dark(#d97706,#f59e0b);--ww-warn-tint:light-dark(#fef3e2,#4c3e28);--ww-cover-shadow:0 1px 0 light-dark(#0000000a,#ffffff0f),0 14px 26px -18px light-dark(#0000008c,#000000b3)}.ww-desk-card,.ww-pin-slot,.ww-library-book,.ww-pin-row,.ww-pin-choice{--ww-fill:color-mix(in srgb,var(--ww-accent) 75%,light-dark(var(--ww-accent),#f9fafb))}.ww-desk-card{--ww-glow:light-dark(color-mix(in srgb,var(--ww-fill) 55%,transparent),color-mix(in srgb,var(--ww-fill) 35%,transparent))}.ww-cards .ww-news-tile .ww-tile-kicker{color:color-mix(in srgb,var(--ww-accent) 72%,light-dark(var(--ww-accent),#f9fafb))}.ww-cards .ww-news-tile .ww-tile-num{color:light-dark(color-mix(in srgb,var(--ww-accent) 28%,transparent),color-mix(in srgb,var(--ww-accent) 35%,transparent))}.ww-tip-cells i{border-color:light-dark(#0000001a,#ffffff29)}}
.ww-cards .ww-tile{background:var(--dsw-alias-bg-layer-2)}.ww-cards .ww-shelf{margin-bottom:48px}.ww-cards .ww-shelf-head{margin-bottom:20px}.ww-cards .ww-brief-flag{color:var(--ww-warn);border-color:color-mix(in srgb,var(--ww-warn-dot) 55%,transparent)}.ww-cards .ww-brief-flag-media{color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l2)}.ww-warn-mark{display:inline-flex;align-items:center;gap:4px;font-weight:500;color:var(--ww-warn)}.ww-warn-mark::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--ww-warn-dot)}
.ww-cards .ww-cover{background:var(--ww-accent);box-shadow:var(--ww-cover-shadow)}.ww-cover::after{content:'';position:absolute;top:0;bottom:0;left:7px;width:1px;background:#ffffff38;z-index:1}.ww-cover-plain strong{font-family:var(--ww-serif)}.ww-cover-l{width:150px;border-radius:4px 8px 8px 4px}.ww-cover-l .ww-cover-plain{padding:18px 14px 18px 18px}.ww-cover-l .ww-cover-plain strong{font-size:16px;line-height:24px;-webkit-line-clamp:4}.ww-cover-m .ww-cover-plain{padding:20px 18px 20px 20px}.ww-cover-m .ww-cover-plain strong{font-size:18px;line-height:26px}.ww-cover-s,.ww-cover-xs,.ww-cover-xxs{flex:none;border-radius:3px 6px 6px 3px}.ww-cover-s{width:87px}.ww-cover-xs{width:60px}.ww-cover-xxs{width:42px}.ww-cover-s .ww-cover-plain{padding:10px 8px 8px 12px}.ww-cover-xs .ww-cover-plain{padding:8px 6px 6px 10px}.ww-cover-s .ww-cover-plain strong,.ww-cover-xs .ww-cover-plain strong{font-family:var(--dsw-font-family);font-size:11px;line-height:15px;-webkit-line-clamp:4}.ww-cover-xs .ww-cover-plain strong{font-size:9px;line-height:12px}.ww-cover-s small,.ww-cover-xs small,.ww-cover-xxs .ww-cover-plain>*{display:none}
.ww-learning{container-type:inline-size}.ww-desk-row{display:grid;grid-template-columns:minmax(0,920fr) minmax(0,316fr);gap:24px;align-items:stretch}.ww-desk-solo{grid-template-columns:minmax(0,1fr)}.ww-desk{display:grid;grid-template-columns:minmax(0,1fr);gap:24px;min-width:0}.ww-desk-pair{grid-template-columns:repeat(2,minmax(0,1fr))}
.ww-desk-card{overflow:hidden;position:relative;min-width:0;min-height:264px;border:1px solid var(--ww-rule);border-radius:16px;background:var(--ww-paper);color:var(--ww-ink);box-shadow:4px 4px 0 -1px var(--ww-paper),4px 4px 0 0 var(--ww-rule),var(--ww-paper-shadow);transition:transform .2s ease,box-shadow .2s ease;animation:ww-skel-in .2s ease backwards;--ww-glow:color-mix(in srgb,var(--ww-fill) 55%,transparent)}.ww-desk-card:not(.ww-desk-missing):has(>.ww-desk-main:hover){transform:translateY(-2px);box-shadow:4px 4px 0 -1px var(--ww-paper),4px 4px 0 0 var(--ww-rule),var(--ww-paper-shadow),0 22px 38px -24px var(--ww-glow)}.ww-desk-card:not(.ww-desk-missing):has(>.ww-desk-main:active){transform:none;transition-duration:.1s}
.ww-desk-wide{display:grid;grid-template-columns:minmax(0,1fr) 307px}.ww-desk-main{display:grid;grid-template-columns:150px minmax(0,1fr);gap:24px;align-items:start;min-width:0;height:100%;padding:24px;border-radius:16px;cursor:pointer;outline:none}.ww-desk-main:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.ww-desk-main .ww-cover{margin-top:8px}.ww-desk-card:not(.ww-desk-missing) .ww-desk-main:hover .ww-cover{transform:translateY(-2px)}
.ww-desk-text{display:flex;flex-direction:column;min-width:0;min-height:216px}.ww-desk-chapter{display:flex;align-items:center;gap:6px;margin:0;padding-right:28px;font-size:12px;line-height:20px;font-weight:600;color:var(--ww-ink);font-variant-numeric:tabular-nums}.ww-desk-chapter i{flex:none;width:6px;height:6px;border-radius:50%;background:var(--ww-fill)}.ww-desk-chip{margin-left:2px;height:18px;padding:0 8px;border-radius:999px;background:var(--ww-sheet);color:var(--ww-ink-2);font-size:11px;line-height:18px;font-weight:400;white-space:nowrap}
.ww-desk-title{margin:12px 0 0;font:600 21px/30px var(--ww-serif);color:var(--ww-ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.ww-desk-wide .ww-desk-title{font-size:22px;line-height:32px}.ww-desk-excerpt{margin:8px 0 0;font-size:13px;line-height:22px;color:var(--ww-ink-2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.ww-desk-track{flex:none;margin-top:auto;height:3px;border-radius:2px;background:var(--ww-rule);overflow:hidden}.ww-desk-track i{display:block;height:100%;border-radius:2px;background:var(--ww-fill);transition:width .35s ease}.ww-desk-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:9px;font-size:12px;line-height:18px;color:var(--ww-ink-2)}.ww-desk-book{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ww-desk-book strong{font:600 14px/18px var(--ww-serif)}.ww-desk-go{flex:none;display:grid;justify-items:end;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}.ww-desk-go>span{grid-area:1/1;transition:opacity .12s ease}.ww-desk-read{opacity:0;font-weight:600;color:var(--ww-ink)}.ww-desk-main:hover .ww-desk-pct,.ww-desk-main:focus-visible .ww-desk-pct{opacity:0}.ww-desk-main:hover .ww-desk-read,.ww-desk-main:focus-visible .ww-desk-read{opacity:1}
.ww-desk-next{display:flex;flex-direction:column;min-width:0;margin:24px 0;padding:0 24px;border-left:1px solid var(--ww-rule)}.ww-desk-eyebrow{margin:0 0 14px;font-size:12px;line-height:18px;font-weight:600;letter-spacing:.08em;color:var(--ww-ink-2)}.ww-cards .ww-desk-next-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"no no" "name time";align-items:baseline;column-gap:12px;height:48px;margin:0 -8px;padding:6px 8px 0;border:0;border-radius:8px;background:transparent;color:var(--ww-ink);text-align:left;font-weight:400}.ww-desk-next-row+.ww-desk-next-row::before{content:'';position:absolute;top:0;left:8px;right:8px;border-top:1px dashed var(--ww-rule)}.ww-cards .ww-desk-next-row:hover:not(:disabled){background:var(--ww-sheet)}.ww-desk-next-row small{font-size:11px;line-height:16px;color:var(--ww-ink-2);font-variant-numeric:tabular-nums}.ww-desk-next-row small:first-child{grid-area:no}.ww-desk-next-row small:last-child{grid-area:time;white-space:nowrap}.ww-desk-next-row strong{grid-area:name;min-width:0;font:600 14px/22px var(--ww-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ww-cards .ww-desk-all{align-self:flex-start;margin-top:16px;padding:0;border:0;background:transparent;font-size:12px;line-height:18px;font-weight:600;color:var(--ww-ink)}.ww-cards .ww-desk-all:hover:not(:disabled){background:transparent;text-decoration:underline}
.ww-desk-card>.ww-book-menu{position:absolute;top:12px;right:12px;z-index:1}.ww-cards .ww-book-menu .ww-icon-button{width:28px;height:28px;min-height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);opacity:.6;transition:opacity .2s,background .2s}.ww-cards .ww-book-menu .ww-icon-button:is(:hover,:focus-visible,[aria-expanded=true]),.ww-library-book:hover .ww-book-menu .ww-icon-button{opacity:1;background:var(--dsw-alias-interactive-bg-hover)}.ww-cards :is(.ww-desk-card,.ww-pin-slot) .ww-book-menu .ww-icon-button{color:var(--ww-ink-2)}.ww-cards :is(.ww-desk-card:hover,.ww-pin-slot:hover) .ww-book-menu .ww-icon-button,.ww-cards :is(.ww-desk-card,.ww-pin-slot) .ww-book-menu .ww-icon-button:is(:hover,:focus-visible,[aria-expanded=true]){opacity:1;background:var(--ww-sheet)}
.ww-desk-missing .ww-desk-main{cursor:default;filter:saturate(.3)}.ww-desk-missing .ww-cover{opacity:.4}.ww-desk-card[aria-busy=true] .ww-desk-main{pointer-events:none}.ww-desk-card[aria-busy=true]::after{content:'';position:absolute;top:0;left:16px;right:16px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,var(--ww-fill),transparent) 0 0/40% 100% no-repeat;opacity:0;animation:ww-desk-load 1s linear .15s infinite}@keyframes ww-desk-load{from{opacity:1;background-position:-60% 0}to{opacity:1;background-position:160% 0}}
.ww-desk-issue{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:14px;min-height:264px;padding:24px 32px;border:1px solid var(--ww-rule);border-radius:16px;background:var(--ww-paper);color:var(--ww-ink);box-shadow:var(--ww-paper-shadow)}.ww-desk-issue p{margin:0;font-size:14px;line-height:22px;overflow-wrap:anywhere}
.ww-cards .ww-desk-add{display:flex;align-items:center;justify-content:center;gap:30px;width:100%;min-height:264px;padding:24px;border:1.5px dashed var(--dsw-alias-border-l3);border-radius:16px;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;font-weight:400;transition:border-color .16s,background .16s}.ww-cards .ww-desk-add:hover:not(:disabled){border-color:var(--dsw-alias-border-l4);background:var(--dsw-alias-interactive-bg-hover)}.ww-cards .ww-desk-add:focus-visible{outline-offset:4px}.ww-desk-ghosts{position:relative;flex:none;width:148px;height:144px}.ww-desk-ghosts i{position:absolute;left:10px;top:0;width:96px;height:128px;border:1px dashed var(--ww-rule);border-radius:3px 6px 6px 3px;background:var(--ww-paper);transform:rotate(-6deg);transition:transform .16s ease}.ww-desk-ghosts i+i{left:48px;top:16px;border-style:solid;background:var(--ww-sheet);transform:rotate(4deg)}.ww-desk-ghost-one i{left:32px;top:8px;transform:none}.ww-desk-ghosts b{position:absolute;left:80px;top:96px;display:grid;place-items:center;width:40px;height:40px;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;background:var(--dsw-alias-bg-layer-1);font-size:20px;font-weight:400;line-height:1;transition:transform .16s ease}.ww-desk-add:hover .ww-desk-ghosts b{transform:translateY(-2px)}.ww-desk-add:hover .ww-desk-ghosts i+i{transform:rotate(6deg)}.ww-desk-add-text{display:flex;flex-direction:column;gap:8px;max-width:330px}.ww-desk-add-text strong{font-size:18px;line-height:26px;font-weight:600}.ww-desk-add-text small{font-size:13px;line-height:22px;color:var(--dsw-alias-label-secondary)}
.ww-tip-card{--ww-accent:var(--ww-tip);min-height:264px;padding:22px 24px 20px}.ww-cards .ww-tip-card .ww-tile-icon{background:var(--ww-tip-tint)}.ww-tip-card .ww-tile-title{font-size:16px;line-height:26px;-webkit-line-clamp:2}.ww-tip-card .ww-tile-text{line-height:22px;-webkit-line-clamp:2}.ww-cards .ww-tip-date{margin-left:auto;background:var(--dsw-alias-interactive-bg-hover);font-weight:500;font-variant-numeric:tabular-nums}.ww-tip-strip{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto}.ww-tip-cells{display:flex;gap:3px}.ww-tip-cells i{width:12px;height:8px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:2px}.ww-tip-cells i[data-day=issued]{border:0;background:color-mix(in srgb,var(--ww-tip) 72%,transparent)}.ww-tip-cells i[data-day=partial]{border:0;background:color-mix(in srgb,var(--ww-tip) 40%,transparent)}.ww-tip-cells i[data-today]{outline:1px solid var(--ww-tip);outline-offset:1px}.ww-tip-cells i[data-today]:not([data-day=none]){background:var(--ww-tip)}.ww-tip-cells i[data-today][data-day=none]{border-color:var(--ww-tip)}.ww-tip-strip small{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.ww-tip-card .ww-tile-foot{margin-top:18px}.ww-tip-more{flex:none;font-weight:600;color:var(--ww-tip);white-space:nowrap}
.ww-skeleton{pointer-events:none;animation:ww-skel-in .2s ease .2s backwards}@keyframes ww-skel-in{from{opacity:0}}.ww-skeleton :is(i,b){animation:ww-skel 1.2s ease-in-out infinite}@keyframes ww-skel{50%{opacity:.55}}.ww-skel-paper{display:grid;grid-template-columns:150px minmax(0,1fr);gap:24px;padding:32px 24px}.ww-skel-paper i{height:200px;border-radius:4px 8px 8px 4px;background:var(--ww-sheet)}.ww-skel-paper span{display:flex;flex-direction:column;gap:14px}.ww-skeleton b{display:block;height:12px;border-radius:6px;background:var(--ww-sheet)}.ww-skeleton b:nth-child(2){width:80%}.ww-skeleton b:nth-child(3){width:55%}.ww-skel-tile{min-height:172px;cursor:default}.ww-skel-tile b{background:var(--dsw-alias-interactive-bg-hover)}
.ww-cards .ww-library{container-type:inline-size;gap:0}.ww-library-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:36px}.ww-crumbs{display:flex;align-items:baseline;gap:8px;margin-right:30px;white-space:nowrap}.ww-cards .ww-crumb{padding:0;border:0;background:transparent;font-size:20px;line-height:28px;font-weight:400;color:var(--dsw-alias-label-secondary)}.ww-cards .ww-crumb:hover:not(:disabled){background:transparent;color:var(--dsw-alias-label-primary);text-decoration:underline}.ww-crumbs>span{font-size:16px;color:var(--dsw-alias-label-tertiary)}.ww-crumbs h2{margin:0;font-size:20px;line-height:28px;font-weight:600}.ww-crumbs small{font-size:13px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}.ww-cards .ww-library-head>.ww-icon-button{width:28px;height:28px;min-height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary)}.ww-cards .ww-library-head>.ww-icon-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.ww-shelf-tools{display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap}.ww-cards label.ww-library-search{display:flex;flex-direction:row;align-items:center;gap:8px;width:200px;height:32px;padding:0 6px 0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary)}.ww-library-search:focus-within{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.ww-cards .ww-library-search input{flex:1;width:auto;min-width:0;height:100%;padding:0;border:0;outline:none;background:transparent;font-size:13px;color:var(--dsw-alias-label-primary)}.ww-library-search input::-webkit-search-cancel-button{display:none}.ww-library-search kbd{flex:none;display:grid;place-items:center;width:16px;height:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;font:11px/1 var(--dsw-font-family-mono,ui-monospace,monospace)}.ww-library-search:focus-within kbd{visibility:hidden}.ww-cards .ww-shelf-tools>button,.ww-cards .ww-library-sort{width:auto;height:32px;padding:0 12px;font-size:13px}.ww-cards .ww-library-dir{width:32px;padding:0;font-size:16px;color:var(--dsw-alias-label-secondary)}
.ww-pin-band{display:grid;grid-template-columns:144px minmax(0,1fr);gap:24px;margin:20px 0 24px;padding:20px 24px;border:1px solid var(--ww-rule);border-radius:16px;background:var(--ww-paper);color:var(--ww-ink);box-shadow:var(--ww-paper-shadow)}.ww-pin-label{display:flex;flex-direction:column;gap:6px}.ww-pin-label p{margin:0;font-size:12px;line-height:18px;font-weight:600;letter-spacing:.08em;color:var(--ww-ink-2)}.ww-pin-label strong{font-size:28px;line-height:32px;font-weight:300;font-variant-numeric:tabular-nums}.ww-pin-label small{font-size:12px;line-height:18px;color:var(--ww-ink-2)}.ww-pin-slots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;padding-left:23px;border-left:1px solid var(--ww-rule)}
.ww-pin-slot{position:relative;min-width:0;min-height:116px}.ww-pin-main{display:flex;gap:20px;height:calc(100% + 16px);margin:-8px;padding:8px;border-radius:10px;cursor:pointer;transition:background .2s}.ww-pin-main:hover{background:var(--ww-sheet)}.ww-pin-text{display:flex;flex-direction:column;flex:1;min-width:0;padding-right:32px}.ww-pin-text strong{font:600 16px/24px var(--ww-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ww-pin-text small{font-size:12px;line-height:18px;color:var(--ww-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ww-pin-text>small:nth-child(2){margin-top:6px}.ww-pin-line{margin-top:14px}.ww-pin-track{display:flex;align-items:center;gap:8px;margin-top:12px}.ww-pin-track i{flex:0 1 260px;height:3px;border-radius:2px;background:var(--ww-rule);overflow:hidden}.ww-pin-track b{display:block;height:100%;background:var(--ww-fill);transition:width .35s ease}.ww-pin-track small{font-size:11px;line-height:14px;font-variant-numeric:tabular-nums}.ww-pin-slot>.ww-book-menu{position:absolute;top:0;right:0}.ww-cards .ww-pin-empty{display:grid;place-items:center;width:100%;border:1.5px dashed var(--ww-rule);border-radius:10px;background:transparent;color:var(--ww-ink-2);font-size:13px;font-weight:600}.ww-cards .ww-pin-empty:hover:not(:disabled){border-color:var(--ww-ink-2);background:transparent}
.ww-cards .ww-library-grid{grid-template-columns:repeat(auto-fill,minmax(172px,1fr));gap:28px 24px}.ww-cards .ww-library-book{gap:12px;cursor:default}.ww-library-cover{position:relative;border-radius:6px 10px 10px 6px;cursor:pointer;outline:2px solid transparent;outline-offset:2px}.ww-library-cover:focus-visible{outline-color:var(--dsw-alias-brand-primary)}.ww-library-book[data-flash] .ww-library-cover{animation:ww-flash 1.2s ease forwards}@keyframes ww-flash{from,60%{outline-color:var(--dsw-alias-brand-primary)}to{outline-color:transparent}}.ww-cards .ww-library-name h4{font:600 15px/22px var(--ww-serif);cursor:pointer}.ww-library-name .ww-book-menu{flex:none}
.ww-ribbon{position:absolute;top:-3px;right:16px;z-index:2;width:14px;height:34px;filter:drop-shadow(0 2px 4px #00000040);transition:transform .2s;animation:ww-ribbon-in .18s ease backwards}.ww-ribbon::before{content:'';position:absolute;inset:0;background:var(--ww-ribbon);clip-path:polygon(0 0,100% 0,100% 100%,50% calc(100% - 6px),0 100%)}@keyframes ww-ribbon-in{from{opacity:0;transform:translateY(-12px)}}.ww-library-book:hover .ww-ribbon{transform:translateY(-3px)}.ww-pin-badge{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;height:18px;margin-top:6px;padding:0 8px;border-radius:999px;background:var(--ww-ribbon-tint);color:var(--ww-ribbon);font-size:11px;line-height:18px;font-weight:600;animation:ww-skel-in .2s ease backwards}
.ww-cards .ww-library-add{position:relative;gap:8px;border-radius:6px 10px 10px 6px;overflow:hidden}.ww-cards .ww-library-add:hover:not(:disabled){border-color:var(--dsw-alias-border-l4);background:var(--dsw-alias-interactive-bg-hover)}.ww-cards .ww-library-add .ww-add-mark{width:40px;height:40px;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:20px}.ww-library-add small{white-space:pre-line}.ww-library-add-bar{position:absolute;left:0;bottom:0;height:2px;background:var(--dsw-alias-brand-primary);transition:width .35s ease}.ww-library-none{display:flex;align-items:center;gap:12px;margin:0 0 16px;font-size:13px;color:var(--dsw-alias-label-secondary)}.ww-cards .ww-text-button{padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-weight:600;text-decoration:underline}
.ww-pin-drawer{display:flex;flex-direction:column;gap:12px}.ww-pin-drawer>.ww-muted{margin:0}.ww-cards .ww-pin-drawer label.ww-library-search{width:100%}.ww-pin-count{margin:0;font-size:12px;line-height:18px;font-weight:600}.ww-pin-list{list-style:none;margin:0;padding:0}.ww-pin-row{border-top:1px solid var(--dsw-alias-border-l1)}.ww-pin-row label{display:flex;flex-direction:row;align-items:center;gap:14px;min-height:72px;padding:8px;border-radius:8px;cursor:pointer}.ww-pin-row[data-on] label{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 4%,transparent)}.ww-pin-row[data-locked] label{opacity:.45;cursor:not-allowed}.ww-pin-row-text{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}.ww-pin-row-text strong{font:600 15px/22px var(--ww-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ww-pin-row-text small{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ww-cards .ww-pin-row input{appearance:none;flex:none;display:grid;place-items:center;width:18px;height:18px;margin:0;padding:0;border:1.5px solid var(--dsw-alias-border-l3);border-radius:4px;background:transparent;cursor:inherit}.ww-cards .ww-pin-row input:checked{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary)}.ww-cards .ww-pin-row input:checked::after{content:'';width:9px;height:5px;margin-top:-2px;border:solid var(--dsw-alias-bg-layer-1);border-width:0 0 2px 2px;transform:rotate(-45deg)}.ww-pin-error{display:flex;flex-direction:column;align-items:flex-start;gap:12px}.ww-pin-error p{margin:0}
.ww-modal.ww-confirm.ww-pin-replace.ww-page[open]{width:min(520px,calc(100vw - 32px))}.ww-pin-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}.ww-cards .ww-pin-choice{position:relative;display:flex;align-items:flex-start;gap:14px;min-height:140px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);text-align:left;font-weight:400}.ww-pin-choice>span{display:flex;flex-direction:column;gap:8px;min-width:0;padding-right:22px}.ww-pin-choice strong{font:600 14px/20px var(--ww-serif);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.ww-pin-choice small{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.ww-radio{position:absolute;top:14px;right:14px;width:16px;height:16px;box-sizing:border-box;border:1.5px solid var(--dsw-alias-border-l3);border-radius:50%}.ww-cards .ww-pin-choice[aria-checked=true]{padding:13px;border:2px solid var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 4%,var(--dsw-alias-bg-layer-1))}.ww-pin-choice[aria-checked=true] .ww-radio{top:13px;right:13px;border:5px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1)}.ww-pin-replace .ww-primary .ww-spinner{display:inline-block;width:12px;height:12px;margin-right:6px;vertical-align:-2px;border-color:currentColor;border-top-color:transparent}
.ww-serif-off :is(.ww-desk-title,.ww-desk-book strong,.ww-desk-next-row strong,.ww-pin-text strong,.ww-library-name h4,.ww-pin-row-text strong,.ww-pin-choice strong,.ww-cover-plain strong){letter-spacing:-.01em}.ww-serif-off .ww-desk-title{font-size:20px}.ww-serif-off .ww-desk-wide .ww-desk-title{font-size:21px}
@container (max-width:1239px){.ww-desk-row{grid-template-columns:minmax(0,1fr)}.ww-tip-card{min-height:0}}@container (max-width:899px){.ww-desk-main{grid-template-columns:minmax(0,1fr)}.ww-desk-main .ww-cover{margin-top:0}.ww-desk-text{min-height:0}.ww-desk-track{margin-top:16px}.ww-desk-wide{grid-template-columns:minmax(0,1fr)}.ww-desk-next{margin:0 24px 24px;padding:16px 0 0;border-left:0;border-top:1px solid var(--ww-rule)}.ww-pin-band{grid-template-columns:minmax(0,1fr)}.ww-pin-slots{padding-left:0;border-left:0}}@container (max-width:599px){.ww-desk-pair,.ww-pin-slots{grid-template-columns:minmax(0,1fr)}.ww-shelf-tools{margin-left:0}.ww-desk-add{flex-direction:column;text-align:center}}
.ww-cards .ww-tile:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.ww-cards .ww-library-add[data-importing]:disabled{opacity:1;cursor:progress}
.ww-cards :is(.ww-desk-chapter i,.ww-desk-chip,.ww-desk-ghosts b,.ww-pin-badge,.ww-add-mark,.ww-radio,.ww-library-chip,.ww-book-next-chapter,.ww-tile-badge,.ww-tile-mono,.ww-brief-more,.ww-brief-flag,.ww-spinner),.ww-cards .ww-warn-mark::before{corner-shape:round}
@media(prefers-reduced-motion:reduce){.ww-cards :is(.ww-desk-card,.ww-cover,.ww-desk-track i,.ww-pin-track b,.ww-ribbon,.ww-desk-ghosts *,.ww-tile,.ww-pin-badge){transition:none!important;animation:none!important;transform:none!important}.ww-cards .ww-desk-card[aria-busy=true]::after{animation:none;opacity:1;background-position:50% 0}.ww-cards .ww-skeleton{animation:ww-skel-in 1ms .2s backwards!important}.ww-cards .ww-skeleton :is(i,b){animation:none!important}}`;
export const styles = [
`.ww-news .ww-choice{display:flex;gap:8px;overflow-wrap:anywhere}.ww-news .ww-section{min-width:0}.ww-news fieldset{margin-inline:0}.ww-news .ww-field{margin-block:10px}`,
`.ww-news-header{display:flex;justify-content:space-between;gap:12px;margin-bottom:20px}.ww-news-settings{max-width:800px;margin:auto}`,
`
    .ww-shelf{margin:0 0 36px}.ww-shelf-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}.ww-shelf-eyebrow{display:flex;align-items:center;gap:6px;margin:0 0 6px;font-size:12px;letter-spacing:.08em;color:var(--dsw-alias-label-secondary)}.ww-shelf-head h3{margin:0 0 3px;font-size:18px;font-weight:600;letter-spacing:.01em}.ww-shelf-head small{font-size:12px}.ww-shelf-head .ww-row{gap:8px}.ww-shelf-grid{display:grid;gap:16px}.ww-shelf-news{grid-template-columns:repeat(4,minmax(0,1fr))}`,
`.ww-news-tile{min-height:172px}`,
`.ww-book{--ww-paper:var(--dsw-alias-bg-layer-1);--ww-ink:var(--dsw-alias-label-primary);--ww-ink-2:var(--dsw-alias-label-secondary);--ww-rule:var(--dsw-alias-border-l2);--ww-sheet:var(--dsw-alias-bg-layer-2);--ww-gutter:rgb(0 0 0 / .12)}@supports (color:light-dark(#000,#fff)){.ww-book{--ww-paper:light-dark(#fbf8f1,#1f1d1a);--ww-ink:light-dark(#2f2a23,#e9e4da);--ww-ink-2:light-dark(#857a6a,#a49d90);--ww-rule:light-dark(#e8e0d0,#35322c);--ww-sheet:light-dark(#f2ecdf,#292723);--ww-gutter:light-dark(rgb(110 85 45 / .16),rgb(0 0 0 / .55))}}.ww-modal.ww-book[open]{width:min(1240px,calc(100vw - 48px));height:min(900px,calc(100dvh - 48px));max-height:none;padding:0;overflow:hidden;border-color:var(--ww-rule);background:var(--ww-paper);color:var(--ww-ink);box-shadow:0 30px 80px -30px rgb(0 0 0 / .5)}html:is([data-platform=darwin],[data-windows-titlebar]) .ww-modal.ww-book[open]{height:min(900px,calc(100dvh - var(--dsh-frame-top-clearance,0px) - 48px))}.ww-book-bar{flex:none;display:grid;grid-template-columns:1fr minmax(0,auto) 1fr;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--ww-rule)}.ww-book-bar>:first-child{justify-self:start}.ww-book-title{margin:0;min-width:0;font-size:13px;letter-spacing:.04em;color:var(--ww-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ww-book-tools{justify-self:end;display:flex;align-items:center;gap:2px}.ww-page .ww-book-tools .ww-icon-button{min-width:32px;font-size:13px;color:var(--ww-ink-2)}.ww-book .ww-menu-trigger{color:var(--ww-ink-2)}`,
`.ww-book-body{position:relative;flex:1;min-height:0;display:grid;grid-template-columns:248px minmax(0,1fr)}.ww-book-body[data-toc=closed]{grid-template-columns:minmax(0,1fr)}.ww-book-toc{min-height:0;overflow:auto;overscroll-behavior:contain;padding:14px 10px 24px;border-right:1px solid var(--ww-rule);background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);font-size:13px}.ww-book-toc ol{list-style:none;margin:0;padding:0}.ww-page .ww-book-toc button{display:flex;align-items:baseline;gap:8px;width:100%;padding:6px 10px;border:0;border-radius:8px;background:transparent;color:var(--ww-ink-2);text-align:left;line-height:1.5;font-size:13px;overflow-wrap:anywhere}.ww-page .ww-book-toc button:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--ww-ink)}.ww-page .ww-book-toc button[aria-current=true]{background:color-mix(in srgb,var(--ww-accent) 14%,transparent);color:var(--ww-ink);font-weight:500}.ww-book-toc-num{flex:none;min-width:1.5em;font-variant-numeric:tabular-nums;color:var(--ww-ink-2);font-weight:400}.ww-book-sections{margin:2px 0 6px!important}.ww-page .ww-book-sections button{padding:4px 10px 4px 34px;font-size:12px}.ww-page .ww-book-sections button[data-level="3"]{padding-left:48px}.ww-page .ww-book-sections button[aria-current=location]{color:var(--ww-accent)}.ww-book-scroll{min-height:0;overflow-y:auto;overscroll-behavior:contain;outline:none}.ww-book-toc,.ww-book-scroll{--dsh-scrollbar-thumb:color-mix(in srgb,var(--dsw-alias-scrollbar-hover-l1,var(--ww-rule)) 70%,var(--ww-ink));--dsh-scrollbar-thumb-hover:color-mix(in srgb,var(--dsw-alias-scrollbar-hover-l1,var(--ww-rule)) 45%,var(--ww-ink))}.ww-book-scroll{--dsh-scrollbar-width:14px;--dsh-scrollbar-thumb-border:4px;--dsh-scrollbar-track-margin:8px}.ww-book-scroll::-webkit-scrollbar-track{border:4px solid transparent;border-radius:999px;background:color-mix(in srgb,var(--ww-ink) 7%,transparent);background-clip:content-box}.ww-book-scroll:focus-visible{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--ww-accent) 45%,transparent)}.ww-book-flow{box-sizing:border-box;max-width:calc(38em + 112px);margin:0 auto;padding:40px 56px 72px;font-family:"Noto Serif SC","Source Han Serif SC","Songti SC",var(--dsw-font-family);font-size:var(--ww-book-size,16.5px);line-height:1.95;letter-spacing:.01em;color:var(--ww-ink);text-align:justify;overflow-wrap:break-word}.ww-page .ww-book-image-zoom{display:block;margin:.6em auto;padding:0;border:0;border-radius:4px;background:transparent;cursor:zoom-in;max-width:100%}.ww-book-flow .ww-book-image-zoom .ww-book-image{margin:0}.ww-book-flow img{max-width:100%;height:auto}.ww-book-zoom{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:28px;background:color-mix(in srgb,var(--ww-raised,var(--ww-paper)) 94%,transparent);cursor:zoom-out}.ww-book-zoom img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;box-shadow:0 18px 50px -20px rgb(0 0 0 / .45)}.ww-book-zoom>button{position:absolute;top:12px;right:12px}.ww-page .ww-book-toggle{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:0;border-radius:8px;background:transparent;color:var(--ww-ink-2);font-size:13px}.ww-page .ww-book-toggle:hover,.ww-page .ww-book-toggle[aria-expanded=true]{color:var(--ww-ink);background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent)}.ww-book-foot{flex:none;display:grid;grid-template-columns:minmax(0,1fr) minmax(120px,260px) auto;align-items:center;gap:16px;padding:8px 20px 12px;border-top:1px solid var(--ww-rule);font-size:12px;color:var(--ww-ink-2)}.ww-book-progress{min-width:0}.ww-book-progress>span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ww-book-track{width:100%;height:3px;border-radius:3px;background:var(--ww-rule);overflow:hidden}.ww-book-track i{display:block;height:100%;border-radius:3px;background:var(--ww-accent);transition:width .35s ease}.ww-book-percent{font-variant-numeric:tabular-nums;min-width:3em;text-align:right}.ww-book-scroll-hint{display:block;margin-top:.8em;text-align:center;font-size:.85em;color:var(--ww-ink-2)}.ww-book-flow p{margin:0 0 .95em;orphans:2;widows:2}.ww-book-flow h1,.ww-book-flow h2,.ww-book-flow h3,.ww-book-flow h4{break-after:avoid;text-align:left;line-height:1.45;color:var(--ww-ink)}.ww-book-flow h1{margin:0 0 .7em;font-size:1.6em;font-weight:700}.ww-book-flow h2{margin:1.5em 0 .7em;font-size:1.3em;font-weight:600}.ww-book-flow h3{margin:1.3em 0 .5em;font-size:1.1em;font-weight:600}.ww-book-flow h4{margin:1.1em 0 .4em;font-size:1em}.ww-book-flow ul,.ww-book-flow ol{margin:0 0 1em;padding-left:1.4em}.ww-book-flow li{margin:.2em 0}.ww-book-flow pre{break-inside:avoid;margin:0 0 1em;padding:.8em 1em;border-radius:10px;background:var(--ww-sheet);white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8em;line-height:1.7;text-align:left}.ww-book-flow code{font-family:var(--dsw-font-family-mono,ui-monospace,monospace);font-size:.88em}.ww-book-flow :not(pre)>code{padding:.1em .35em;border-radius:5px;background:var(--ww-sheet)}.ww-book-flow blockquote{margin:0 0 1em;padding:.1em 0 .1em 1em;border-left:3px solid color-mix(in srgb,var(--ww-accent) 60%,transparent);color:var(--ww-ink-2)}.ww-book-flow hr{margin:1.4em 0;border:0;text-align:center}.ww-book-flow hr::after{content:'· · ·';letter-spacing:.5em;color:var(--ww-ink-2)}.ww-book-flow .ww-table{break-inside:avoid;overflow-x:auto;margin:0 0 1em;font-size:.82em}.ww-book-flow table{width:100%;border-collapse:collapse}.ww-book-flow th,.ww-book-flow td{padding:.35em .6em;border:1px solid var(--ww-rule);text-align:left}.ww-book-flow a{color:var(--ww-accent)}.ww-book-flow [lang=en]{text-align:left;hyphens:auto}.ww-book-colophon{break-inside:avoid;margin-top:2.4em;padding-top:1.2em;border-top:1px solid var(--ww-rule);font-size:.85em;color:var(--ww-ink-2);overflow-wrap:anywhere}.ww-book-end{margin:0 0 1.2em!important;text-align:center;letter-spacing:.3em}@media(max-width:1100px){.ww-shelf-news{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:899px){.ww-book-body{grid-template-columns:minmax(0,1fr)!important}.ww-book-toc{position:absolute;inset:0 auto 0 0;z-index:3;width:min(300px,85%);background:var(--ww-raised,var(--ww-paper));box-shadow:12px 0 32px -18px rgb(0 0 0 / .45)}}
@media(max-width:620px){.ww-shelf-news{grid-template-columns:1fr}.ww-book-flow{padding:24px 22px 56px}.ww-book-foot{padding:6px 14px 10px;grid-template-columns:minmax(0,1fr) auto}.ww-book-track{display:none}}
@media(prefers-reduced-motion:reduce){.ww-tile,.ww-brief-chevron,.ww-tile-go,.ww-book-track i{animation:none;transition:none}}
`,
`
    .ww-page .ww-news-settings{max-width:none;margin:0;display:flex;flex-direction:column;gap:16px}.ww-news-toolbar{display:flex;gap:10px;flex-wrap:wrap}.ww-news-field h2{font-size:15px;margin:0}.ww-news-field .ww-error{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
`
    .ww-news-form{border:0;padding:0;margin:0;min-width:0;display:flex;flex-direction:column;gap:10px}.ww-news-history{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px}${libraryStyles}${deskStyles}${tips.styles}`
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
