/**
 * 助手名称：默认叫“小鲸助手”，简称“小鲸”。扩展可以给它起企业自己的叫法（同一时间只认一个扩展），
 * 扩展关掉就恢复默认。代码认的是小鲸的内部标识 manager，名字只出现在界面文字和给模型的说明里。
 * 宿主和界面共用这份，不引入 Node 模块。
 */
export const defaultAssistantName = Object.freeze({ full: '小鲸助手', short: '小鲸' });

/** 扩展起的名字没有简称，全称和简称都用它。 */
export const assistantNames = custom => custom ? { full: custom, short: custom } : defaultAssistantName;

/** 界面词条里的占位符：{assistant} 是全称，{assistantShort} 是简称。 */
export function assistantTextArgs(custom) {
  const names = assistantNames(custom);
  return { assistant: names.full, assistantShort: names.short };
}
