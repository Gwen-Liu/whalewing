/**
 * DSH 0.2.2 起，任务在别处被改动（比如员工在 DSH「自动化任务」里改了鲸翼的任务），DSH 会往相关会话插一条
 * 来源同样是 schedule 的“[SCHEDULE CHANGE]”通知。它只是告知，不是一次定时送达，不能记成运行，也不按资讯输入拦截。
 */
export const scheduleChangePrefix = '[SCHEDULE CHANGE]';

export function isScheduleChangeNotice(message) {
  if (message?.source?.kind !== 'schedule' || !Array.isArray(message.content)) return false;
  const first = message.content.find(part => part?.type === 'text');
  return typeof first?.text === 'string' && first.text.startsWith(scheduleChangePrefix);
}

/** 定时送达的消息：来源是 schedule、带消息身份，且不是改动通知。 */
export const isScheduledDelivery = message => message?.source?.kind === 'schedule' && typeof message.id === 'string' && !isScheduleChangeNotice(message);
