import path from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { applyManagerTool } from '../assistant/handoff.js';

export const toolboxHandoffName = 'whalewing_toolbox_handoff';
const limit = 4000;
const fail = message => { throw Object.assign(new Error(message), { code: 'TOOLBOX_HANDOFF' }); };

/**
 * 和小鲸的对话里接到处理文件的活（2026-11-12 用户定：活都在办公工坊里干）：小鲸把员工的原话转给办公工坊，
 * 鲸翼切到办公工坊页，页面按原话交给小鲸照常做。只在选了小鲸的普通主会话里有，办公工坊关掉时跟着撤回；
 * 没选专家的普通 DSH 对话不挂（用户：“如果用户没用专家，就说明他们根本就不想用鲸翼了”）。
 */
// 一次最多带过去的附件数，和办公工坊一单的文件数一样。
const attachmentLimit = 20;

/**
 * 员工在小鲸对话里发的附件（2026-11-14 用户定：小鲸是全能的超级助理，员工发了附件就按情况带过去处理）。
 * DSH 把文件原样存在 DSH 家目录的 attachments 下，给模型一行“saved at 路径”的提示；这里只认那个目录里的路径，
 * 小鲸借这个口子读不了别的文件。原文件名照附件提示填，存的文件名是编号。
 */
export function checkAttachments(value, attachmentsRoot) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail('attachments 要写成列表');
  if (value.length > attachmentLimit) fail(`attachments 一次最多 ${attachmentLimit} 个`);
  const root = attachmentsRoot && path.resolve(attachmentsRoot);
  return value.map(item => {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const raw = typeof item?.path === 'string' ? item.path.trim().replace(/^["“”']+|["“”']+$/g, '') : '';
    if (!name || name.length > 260 || /[\\/]/.test(name)) fail('attachments 的 name 写附件提示里的原文件名（不带路径）');
    if (!raw || !path.isAbsolute(raw)) fail(`「${name}」的 path 写附件提示里 saved at 后面那个完整路径`);
    const resolved = path.resolve(raw);
    if (!root || !resolved.toLowerCase().startsWith(root.toLowerCase() + path.sep)) fail(`「${name}」不是员工在对话里发的附件（只认 DSH 附件目录里的文件）`);
    return { path: resolved, name };
  });
}

export function toolboxHandoffDefinition(scope, broker, attachmentsRoot = () => undefined) {
  return defineTool({
    name: toolboxHandoffName,
    description: '只在员工要用办公工坊的功能项处理文件、做出文件时用（比如修证件照、改图片尺寸、合并压缩 PDF、核对表格、打码、加页码水印、做二维码）；问问题、聊天、写文字、看文件回答问题不用转。把员工的原话转给鲸翼办公工坊：鲸翼会切到办公工坊页，用做好的功能项在员工电脑上处理。不自己写代码处理文件。',
    parameters: {
      request: { type: 'string', required: true, description: '员工的原话和要求，原样转达，不要概括掉；提到的文件名、路径一并写上。' },
      attachments: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', required: true }, name: { type: 'string', required: true } } }, description: `员工在这段对话里发过、和这件活有关的附件，最多 ${attachmentLimit} 个：path 照附件提示里 saved at 后面的完整路径，name 照提示里引号中的原文件名。办公工坊会把它们读进来一起处理；员工没发附件就不填。` },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const request = typeof args.request === 'string' ? args.request.trim() : '';
      if (!request) fail('request 写员工的原话和要求');
      if ([...request].length > limit) fail(`request 超过 ${limit} 字，请精简`);
      const agent = exec.agent;
      if (!agent || scope.whalewingExperts.selectedFor(agent) !== 'manager') fail('只有小鲸的主会话能转给办公工坊');
      const files = checkAttachments(args.attachments, attachmentsRoot());
      const title = String(agent.session.header?.title ?? '').slice(0, 120);
      broker.handoff({ text: request, from: { sessionId: agent.session.id, title }, ...(files.length ? { files } : {}) });
      if (files.length) return `已经转给办公工坊，鲸翼正在打开办公工坊页；${files.map(file => `「${file.name}」`).join('、')}会一起读进去处理。在对话里告诉员工去办公工坊看进度和结果。`;
      return '已经转给办公工坊，鲸翼正在打开办公工坊页，在那边照常处理。这次没带附件：要处理的文件请员工在办公工坊页拖进去，或者把文件夹路径贴进输入框（没有文件的活不用）。在对话里用一两句话告诉员工去办公工坊看进度和保存结果，不要自己处理文件。';
    },
    presentCall: () => ({ card: 'generic', title: '转给办公工坊', kind: 'other' }),
  });
}

export function applyToolboxHandoff(ctx, broker, attachmentsRoot) { applyManagerTool(ctx, scope => toolboxHandoffDefinition(scope, broker, attachmentsRoot), 'whalewing toolbox handoff'); }
