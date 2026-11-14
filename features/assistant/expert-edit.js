import { randomUUID } from 'node:crypto';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { approveEscalation } from '@deepseek-ai/dsh-sandbox';
import { defaultAssistantName } from '../../src/assistant-name.js';
import { expertAvatarIds, presetAvatarIds, loadExpertAvatars } from '../../src/expert-avatars.js';
import { applyManagerTool } from './handoff.js';

/**
 * 小鲸替员工建专家、改专家（2026-11-08 用户定，见 docs/专家团改版方案.md 第五节第 3 项）。
 * 只有选了小鲸的主会话有这项工具；每次写入都经 DSH 原生审批，审批框里看得到要建或要改的内容。
 * 建出来的就是员工的自定义专家，和员工手建的一样能改、能删、能恢复。保存走专家页同一个入口，校验一样。
 */
export const expertEditToolName = 'whalewing_expert_edit';
const fail = message => { throw Object.assign(new Error(message), { code: 'EXPERT_EDIT' }); };
const avatarIds = new Set([...expertAvatarIds, ...presetAvatarIds]);
let avatars;
const avatarOf = id => (avatars ??= loadExpertAvatars())[id];
const fieldNames = { name: '名字', description: '介绍', prompt: '岗位说明', skills: '技能', avatar: '头像' };

function text(value, label, required) {
  if (value === undefined) { if (required) fail(`${label}不能为空`); return undefined; }
  if (typeof value !== 'string' || !value.trim()) fail(`${label}不能为空`);
  return value.trim();
}
function list(value, label, max) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) fail(`${label}要写成一组文字`);
  if (value.length > max) fail(`${label}最多 ${max} 项`);
  return [...new Set(value.map(item => item.trim()))];
}
function avatar(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!avatarIds.has(value)) fail(`头像只能选插件自带的：${[...avatarIds].join('、')}，或不填`);
  return avatarOf(value);
}

/** 先把参数全部校验完，审批框里看到的就是将要保存的内容。 */
export function expertEditInput(args) {
  const known = ['action', 'id', 'name', 'description', 'prompt', 'skills', 'avatar', 'rules', 'progress'];
  for (const key of Object.keys(args)) if (!known.includes(key)) fail(`不认识的字段 ${key}；模型、MCP 由员工在专家页设`);
  if (!['create', 'update'].includes(args.action)) fail('action 只能是 create 或 update');
  const creating = args.action === 'create';
  const id = creating ? undefined : text(args.id, '要修改的专家标识', true);
  if (creating && args.id !== undefined) fail('新建时不填 id，保存时自动生成');
  const fields = {
    name: text(args.name, '名字', creating), description: text(args.description, '介绍', creating), prompt: text(args.prompt, '岗位说明', creating),
    skills: list(args.skills, '技能', 40), avatar: avatar(args.avatar),
  };
  if (fields.name && /[\r\n]/.test(fields.name)) fail('名字只写一行');
  const rules = list(args.rules, '开头的规矩', 20) ?? [], progress = list(args.progress, '开头的进度', 20) ?? [];
  if (!creating && (rules.length || progress.length)) fail('改专家时不带记忆；要改记忆请用 whalewing_memory（填 expertId）');
  if (!creating && Object.values(fields).every(value => value === undefined)) fail('没有要改的内容');
  return { action: args.action, id, fields, rules, progress };
}

function definition(scope) {
  return defineTool({
    name: expertEditToolName,
    description: '新建或修改一位鲸翼专家，需要员工批准。先用 whalewing_experts 的 list 找现成的专家，能用就用或用 handoff 交给它，没有合适的再建。建专家要“给目标，不交代杂事”：介绍写这位专家帮员工达成什么；岗位说明照内置专家同一套结构写（身份与使命、擅长与边界、底线、工作流程、交付）；技能只填已经装了的（whalewing_experts 的 get 能看到别的专家绑了哪些）；要长期跟的事，用 rules、progress 写好开头的记忆。改专家只填要改的字段，技能要给改后的完整名单。模型和 MCP 由员工在专家页设。',
    parameters: {
      action: { type: 'string', enum: ['create', 'update'], required: true },
      id: { type: 'string', description: 'update 时填要改的专家标识（whalewing_experts 的 list 查）；create 不填。' },
      name: { type: 'string', description: '名字，一行，最多 40 字，比如“DSH 观察员”。' },
      description: { type: 'string', description: '一句话介绍：帮员工达成什么，最多 240 字。' },
      prompt: { type: 'string', description: '岗位说明全文（Markdown），最多 32000 字。' },
      skills: { type: 'array', items: { type: 'string' }, description: '绑定的技能名，最多 40 项；update 时是改后的完整名单。' },
      avatar: { type: 'string', description: `头像，插件自带的标识之一：${presetAvatarIds.join('、')}；不填就没有头像。` },
      rules: { type: 'array', items: { type: 'string' }, description: 'create：开头记忆里的“规矩”，一条一句，最多 20 条。' },
      progress: { type: 'array', items: { type: 'string' }, description: 'create：开头记忆里的“进度”，比如追踪对象现在的状态，一条一句，最多 20 条。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        action: { type: 'string', required: true }, expertId: { type: 'string', required: true }, name: { type: 'string', required: true },
        changed: { type: 'array', items: { type: 'string' }, required: true }, memory: { type: 'number', required: true }, memoryIssue: { type: 'string' },
      } },
      render: (_args, value) => [{ type: 'text', text: [
        value.action === 'create' ? `已建好专家「${value.name}」（${value.expertId}），出现在专家团队里，员工可以改、删。` : `已修改专家「${value.name}」：${value.changed.map(key => fieldNames[key] ?? key).join('、')}。`,
        ...(value.memory ? [`开头的记忆写了 ${value.memory} 条。`] : []),
        ...(value.memoryIssue ? [`开头的记忆没写上：${value.memoryIssue}。可以用 whalewing_memory 的 add（填 expertId）补上。`] : []),
        '要它干活就用 whalewing_handoff 交给它。',
      ].join('\n') }],
      presentationMeta: (_args, value) => ({ action: value.action, expertId: value.expertId, name: value.name, changed: value.changed }),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const agent = exec.agent;
      const names = scope.get('whalewing')?.assistantName?.() ?? defaultAssistantName;
      if (!agent || scope.whalewingExperts.selectedFor(agent) !== 'manager') fail(`只有${names.full}的主会话能建专家、改专家`);
      const input = expertEditInput(args);
      const registry = scope.whalewingExperts;
      const previous = input.id ? registry.get(input.id) : undefined;
      if (previous?.readOnly) fail(`「${previous.name}」来自「${previous.source.label.zh}」，只能查看；可以新建一位自己的专家`);
      const expert = previous
        ? { name: input.fields.name ?? previous.name, description: input.fields.description ?? previous.description, avatar: input.fields.avatar === undefined ? previous.avatar : input.fields.avatar, prompt: input.fields.prompt ?? previous.prompt, model: previous.model ?? null, skills: input.fields.skills ?? previous.skills, mcpServers: previous.mcpServers ?? [] }
        : { name: input.fields.name, description: input.fields.description, avatar: input.fields.avatar ?? null, prompt: input.fields.prompt, model: null, skills: input.fields.skills ?? [], mcpServers: [] };
      const changed = previous ? Object.keys(fieldNames).filter(key => input.fields[key] !== undefined && JSON.stringify(input.fields[key]) !== JSON.stringify(previous[key])) : Object.keys(fieldNames).filter(key => key !== 'avatar' || expert.avatar);
      if (previous && !changed.length) fail(`「${previous.name}」已经是这样了，没有要改的`);
      const what = previous ? `修改「${previous.name}」的${changed.map(key => fieldNames[key]).join('、')}` : `新建专家「${expert.name}」：${expert.description.replace(/[。．.！!；;，,\s]+$/u, '')}；技能 ${expert.skills.length} 项${input.rules.length + input.progress.length ? `，开头的记忆 ${input.rules.length + input.progress.length} 条` : ''}`;
      await approveEscalation({
        requestedMode: 'danger-full-access', effectiveMode: scope.sandboxPolicy.resolve({ session: agent.session }).mode, subject: '鲸翼专家',
        justification: `${what}。建好后员工可以在专家团队里改、删；不改变会话权限模式。`,
      }, { approver: scope.get('approval'), agent, callId: exec.callId, toolName: expertEditToolName, signal: exec.signal });
      exec.signal.throwIfAborted();
      // 等批准期间员工可能刚改过这位专家，按最新版本保存；专家页的保存入口同样校验技能和名字。
      const current = previous ? registry.get(previous.id) : undefined;
      if (current && current.revision !== previous.revision) fail(`「${current.name}」刚被别处改过，没有保存；请重新 get 看过再改`);
      const saved = await registry.manage({ action: 'save', id: previous?.id ?? `custom-${randomUUID()}`, expectedRevision: previous?.revision ?? 0, expert }, exec.signal);
      const result = { action: input.action, expertId: saved.expert.id, name: saved.expert.name, changed, memory: 0 };
      try {
        for (const entry of input.rules) { await registry.memory.add(saved.expert, '规矩', entry, exec.signal); result.memory += 1; }
        for (const entry of input.progress) { await registry.memory.add(saved.expert, '进度', entry, exec.signal); result.memory += 1; }
      } catch (error) { result.memoryIssue = error.message.replace(/^\w+: /, ''); }
      return result;
    },
    presentCall: args => ({ card: 'generic', title: args.action === 'update' ? '修改专家' : '新建专家', kind: 'other', rawInput: args }),
  });
}

export function applyExpertEdit(ctx) { applyManagerTool(ctx, definition, 'whalewing expert edit'); }
