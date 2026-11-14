import { randomUUID } from 'node:crypto';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { approveEscalation } from '@deepseek-ai/dsh-sandbox';
import { defaultAssistantName } from '../../src/assistant-name.js';
import { applyManagerTool } from './handoff.js';

/**
 * 小鲸给专家加定时任务（2026-11-08 用户定，见 docs/专家团改版方案.md 第五节第 5 项）。
 * 和定时任务页“新建任务”同一条路：在“鲸翼定时任务”工作区建任务会话、认领自建任务用途，再挂到这位专家名下，
 * 最后交给 DSH 定时服务。每次运行都带上这位专家的岗位说明、技能、记忆和模型。
 */
export const expertScheduleToolName = 'whalewing_expert_schedule';
const fail = message => { throw Object.assign(new Error(message), { code: 'EXPERT_SCHEDULE' }); };
const zone = 'Asia/Shanghai';
const clock = value => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(text)) fail('时间写成 09:00 这样的 24 小时制');
  return text.length === 5 ? `${text}:00` : text;
};

/** 时间规则：每天、每周、每隔多少秒、某个时刻一次、cron；都按北京时间。 */
export function scheduleTiming(when) {
  if (!when || typeof when !== 'object' || Array.isArray(when)) fail('when 要写成 { daily: "09:00" } 这样的对象');
  const keys = Object.keys(when);
  if (keys.length !== 1) fail('when 只写一种规则：daily、weekly、every_seconds、at 或 cron');
  const [key] = keys, value = when[key];
  if (key === 'daily') return { daily: { time: clock(value), time_zone: zone } };
  if (key === 'weekly') {
    const weekdays = value?.weekdays;
    if (!Array.isArray(weekdays) || !weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) fail('weekly 的 weekdays 写 1–7（周一到周日）');
    return { weekly: { time: clock(value.time), time_zone: zone, weekdays: [...new Set(weekdays)] } };
  }
  if (key === 'every_seconds') {
    if (!Number.isInteger(value) || value < 300) fail('every_seconds 至少 300 秒（5 分钟）；太频繁会白白花员工的模型额度');
    return { every_seconds: value };
  }
  if (key === 'at') {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('at 写一个带时区的时间，例如 2026-11-09T09:00:00+08:00');
    return { at: value };
  }
  if (key === 'cron') {
    if (typeof value !== 'string' || !value.trim()) fail('cron 写一条表达式，例如 0 9 * * 1-5');
    return { cron: { expression: value.trim(), time_zone: zone } };
  }
  fail('when 只写一种规则：daily、weekly、every_seconds、at 或 cron');
}

function definition(scope) {
  return defineTool({
    name: expertScheduleToolName,
    description: '给一位鲸翼专家加一个定时任务，需要员工批准。到点时 DSH 把 prompt 发进这个任务的会话，专家照自己的岗位说明、技能和记忆去做，跑完把进度记进它的记忆，下一次接着往下做。适合要一直跟着的事（比如每天看一次某个项目的新版本）。多久跑一次要员工说过或同意过；员工没说、或问了被跳过，就不要调用这个工具替员工挑一个默认时间。prompt 写清每次要做什么、结果怎么交；时间一律按北京时间（UTC+8）填，不按电脑系统的时区换算。员工能在定时任务页改时间、暂停、删除。',
    parameters: {
      expertId: { type: 'string', required: true, description: '专家标识，来自 whalewing_experts 的 list。' },
      title: { type: 'string', required: true, description: '任务名，一行，最多 60 字。' },
      prompt: { type: 'string', required: true, description: '每次运行时发给专家的指令。' },
      when: { type: 'object', required: true, additionalProperties: false, properties: {
        daily: { type: 'string', description: '每天几点，如 "09:00"。' },
        weekly: { type: 'object', additionalProperties: false, properties: { time: { type: 'string' }, weekdays: { type: 'array', items: { type: 'number' } } }, description: '每周哪几天几点，weekdays 写 1–7（周一到周日）。' },
        every_seconds: { type: 'number', description: '每隔多少秒，至少 300。' },
        at: { type: 'string', description: '某个时刻跑一次，带时区的时间。' },
        cron: { type: 'string', description: 'cron 表达式。' },
      }, description: '时间规则，只写一种：{ daily: "09:00" }、{ weekly: { time: "09:00", weekdays: [1,3,5] } }、{ every_seconds: 3600 }、{ at: "2026-11-09T09:00:00+08:00" }、{ cron: "0 9 * * 1-5" }。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        expertId: { type: 'string', required: true }, expertName: { type: 'string', required: true }, title: { type: 'string', required: true },
        sessionId: { type: 'string', required: true }, taskId: { type: 'string', required: true }, scheduledAt: { type: 'string', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: `已给「${value.expertName}」加了定时任务「${value.title}」，下一次 ${value.scheduledAt}。员工能在定时任务页改时间、暂停、删除；每次的结果在那个任务的会话里。` }],
      presentationMeta: (_args, value) => ({ expertId: value.expertId, expertName: value.expertName, title: value.title, sessionId: value.sessionId, scheduledAt: value.scheduledAt }),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const agent = exec.agent;
      const names = scope.get('whalewing')?.assistantName?.() ?? defaultAssistantName;
      if (!agent || scope.whalewingExperts.selectedFor(agent) !== 'manager') fail(`只有${names.full}的主会话能给专家加定时任务`);
      for (const key of Object.keys(args)) if (!['expertId', 'title', 'prompt', 'when'].includes(key)) fail(`不认识的字段 ${key}`);
      const title = typeof args.title === 'string' ? args.title.trim() : '';
      if (!title || [...title].length > 60 || /[\r\n]/.test(title)) fail('任务名写一行，最多 60 字');
      const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
      if (!prompt) fail('每次运行的指令不能为空');
      const timing = scheduleTiming(args.when);
      const expert = scope.whalewingExperts.get(String(args.expertId ?? '').trim());
      if (expert.id === 'manager') fail(`定时任务请交给负责这件事的专家，不挂在${names.short}自己名下`);
      const automation = scope.get('whalewingAutomation');
      if (!automation) fail('定时任务功能没有加载，请员工在定时任务页新建');
      await approveEscalation({
        requestedMode: 'danger-full-access', effectiveMode: scope.sandboxPolicy.resolve({ session: agent.session }).mode, subject: '鲸翼定时任务',
        justification: `给「${expert.name}」加定时任务「${title}」。每次运行都会用员工的模型、产生费用；员工能在定时任务页改时间、暂停、删除。不改变会话权限模式。`,
      }, { approver: scope.get('approval'), agent, callId: exec.callId, toolName: expertScheduleToolName, signal: exec.signal });
      exec.signal.throwIfAborted();
      const sessionId = `whalewing-auto-${randomUUID()}`;
      try { await automation.claimTaskSession(sessionId, 'custom', exec.signal, true); }
      catch (error) { fail(`没能建好任务会话：${error.message}`); }
      const receipt = await automation.manageAutomation({ action: 'create', sessionId, purpose: 'custom', expertId: expert.id, spec: { title, prompt, ...timing } }, exec.signal);
      return { expertId: expert.id, expertName: expert.name, title, sessionId, taskId: receipt.task.id, scheduledAt: receipt.task.scheduledAt };
    },
    presentCall: args => ({ card: 'generic', title: '给专家加定时任务', kind: 'other', rawInput: args }),
  });
}

export function applyExpertSchedule(ctx) { applyManagerTool(ctx, definition, 'whalewing expert schedule'); }
