/**
 * 鲸翼的用法（2026-11-14）：今日一招里每天一条鲸翼自己的功能，随包带、不用模型。
 * 只写设计文档里已经做了的功能；feature 是去哪个功能页试，launcher 表示打开“全部功能”。
 * 功能改了说法，这里跟着改，免得教错。
 */
export const usageTips = Object.freeze([
  { id: 'toolbox-merge', feature: 'toolbox', where: '办公工坊', title: '几份 PDF 要合成一份，交给小鲸说一句就行', how: '在办公工坊把文件拖进输入框，说“合成一份”。小鲸挑合并的功能项，在这台电脑上处理，不上传。' },
  { id: 'launcher', feature: 'launcher', where: '全部功能', title: '想不起功能在哪，按 Ctrl K 搜', how: '在鲸翼里按 Ctrl K（苹果电脑按 Command K），输入“pdf”“排行”这样的词，回车直接打开对应的功能。' },
  { id: 'remember', feature: 'experts', where: '专家团队', title: '对专家说“记一下”，这句话就进当天的日记', how: '聊到值得留的结论时说一声“记一下”，专家把它追加到当天日记的“随手记录”里，每周思考会接着整理。' },
  { id: 'ask-many', feature: 'ai-web', where: 'AI 网页', title: '同一个问题想问几家 AI，在提问台写一次', how: '在提问台写好问题，勾上“我的背景”，点几家卡片右上角的“＋”，一键带过去；进去按 Ctrl V 再发送。' },
  { id: 'bring-back', feature: 'ai-web', where: 'AI 网页', title: '网页 AI 答得好，点“贴进来”存进收件箱', how: '在网页里复制要留的那段，回到「AI 网页」会话的开始页点“贴进来”，鲸翼把它存进知识积累的收件箱。' },
  { id: 'new-expert', feature: 'experts', where: '专家团队', title: '反复要做的事，让小鲸替你建一位专家', how: '跟小鲸说清这件事要长期做。它先找现成的专家，没有合适的就提议建一位，你同意后才建。' },
  { id: 'spend', feature: 'model-world', where: '模型世界', title: '想知道这个月模型花了多少，看“我的模型”', how: '模型世界的“我的模型”下面有近 7 天、本月的用量和大约花费，按渠道和型号分开。' },
  { id: 'compare', feature: 'model-world', where: '模型世界', title: '拿不准用哪个模型，放进“比一比”', how: '模型世界里任何一页都能把模型放进底部的“比一比”，并排看成绩和价格。' },
  { id: 'expert-task', feature: 'automation', where: '定时任务', title: '想让专家按时做一件事，给它挂一个定时任务', how: '新建定时任务时选“交给哪位专家”。到点它带着自己的岗位说明和记忆去做，接着上次往下做。' },
  { id: 'about-me', feature: 'knowledge', where: '知识积累', title: '先写《关于我》，专家就不用你每次重新交代', how: '知识积累里有“关于我”等三篇，写上你是谁、怎样和你协作；专家开工前会先读。每日资讯也照它来挑。' },
  { id: 'find-skill', feature: 'skills', where: '技能中心', title: '想给专家加本事，到技能中心的“发现”里找', how: '“发现”能搜 skills.sh 上的技能，装之前先预览，只装预览过的那一份。' },
]);

/** 当天那一条：按北京日期轮，shift 是员工点了几次“换一条”。 */
export function usageOfDay(date, shift = 0) {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return usageTips[(((day + shift) % usageTips.length) + usageTips.length) % usageTips.length];
}
