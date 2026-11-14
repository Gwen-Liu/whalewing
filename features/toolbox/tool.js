import { defineTool } from '@deepseek-ai/dsh-tools';
import { fileIdPattern } from './contract.js';
import { formatSize } from './jobs.js';
import { functionIds, guideText } from './guide.js';

export const toolboxToolName = 'whalewing_toolbox';
const fail = message => { throw Object.assign(new Error(message), { code: 'TOOLBOX_INPUT' }); };
const line = (value, label, max, required = true) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) { if (required) fail(`${label}不能为空`); return ''; }
  if ([...text].length > max) fail(`${label}超过 ${max} 字，请精简`);
  return text;
};
const fileIds = (value, label, max) => {
  if (!Array.isArray(value) || !value.length) fail(`${label}至少写一个文件编号`);
  if (value.length > max) fail(`${label}最多 ${max} 个`);
  const ids = value.map(id => typeof id === 'string' ? id.trim() : '');
  if (ids.some(id => !fileIdPattern.test(id))) fail(`${label}要写文件编号，比如 f1 或 r2-1，不写文件名`);
  return [...new Set(ids)];
};
const toolId = value => {
  const id = line(value, '功能项', 40);
  if (!functionIds.has(id)) fail(`没有「${id}」这个功能项；先用 guide 看分类里的功能项编号`);
  return id;
};

/** 调用参数先全部校验，交给页面的就是能直接执行的请求。 */
export function toolboxRequest(args) {
  switch (args?.action) {
    case 'plan': {
      if (!Array.isArray(args.steps) || !args.steps.length) fail('plan 要列出至少一步');
      if (args.steps.length > 12) fail('一单最多 12 步，太多就拆成几单');
      return { steps: args.steps.map((item, index) => ({ tool: toolId(item?.tool), note: line(item?.note, `第 ${index + 1} 步的说明`, 120) })) };
    }
    case 'run': {
      const step = Number(args.step);
      if (!Number.isInteger(step) || step < 1 || step > 12) fail('step 写这是计划里的第几步（从 1 开始）');
      const options = args.options ?? {};
      if (typeof options !== 'object' || Array.isArray(options) || options === null) fail('options 要写成对象');
      if (JSON.stringify(options).length > 8000) fail('options 太长');
      const text = typeof args.text === 'string' ? args.text : undefined;
      if (text !== undefined && text.length > 200000) fail('text 太长，超过 20 万字');
      const inputs = args.inputs === undefined && text !== undefined ? [] : fileIds(args.inputs, 'inputs', 20);
      return { step, tool: toolId(args.tool), inputs, options, ...(text !== undefined ? { text } : {}) };
    }
    case 'read': {
      const [file] = fileIds([args.file], 'file', 1);
      const reason = line(args.reason, 'reason（员工怎么要求你看内容的）', 200);
      return { file, reason, ...(args.sheet ? { sheet: line(args.sheet, 'sheet', 64) } : {}), ...(args.rows ? { rows: line(args.rows, 'rows', 20) } : {}) };
    }
    case 'ask': {
      const question = line(args.question, 'question', 200);
      const choices = Array.isArray(args.choices) ? args.choices.map((choice, index) => line(choice, `第 ${index + 1} 个选项`, 40)) : [];
      if (choices.length > 5) fail('选项最多 5 个');
      return { question, choices };
    }
    case 'finish': {
      const message = line(args.message, 'message', 2000);
      const results = args.results === undefined ? [] : fileIds(args.results, 'results', 20);
      return { message, results };
    }
    default: fail('action 只能是 guide、plan、run、read、ask、finish');
  }
}

function describeOutputs(outputs) {
  return (outputs ?? []).map(file => {
    const facts = [String(file.type || '').toUpperCase(), formatSize(file.size)];
    if (file.pages !== undefined) facts.push(`${file.pages} 页`);
    if (file.width && file.height) facts.push(`${file.width}×${file.height}`);
    for (const sheet of file.sheets ?? []) facts.push(`工作表「${sheet.name}」${sheet.rows !== undefined ? `，数据 ${sheet.rows} 行` : ''}${sheet.headers?.length ? `，表头：${sheet.headers.join('、')}` : ''}`);
    return `- ${file.id} ${file.name}（${facts.filter(Boolean).join('，')}）`;
  });
}

/** 页面交回的结果变成给小鲸看的几行字：只有结果文件的描述和工具自己的说明，没有文件内容。 */
export function toolboxAnswer(action, request, value) {
  switch (action) {
    case 'plan': return `${request.steps.length} 步已经列给员工看了。按顺序用 run 做，step 写第几步；中途要改做法就重新 plan。`;
    case 'run': {
      if (value?.needs === 'region') return `第 ${request.step} 步要员工在页面上框出位置，页面已经提示员工了。先结束这一轮，不要猜位置；员工框好后会发消息告诉你。`;
      const outputs = describeOutputs(value?.outputs);
      return [
        `第 ${request.step} 步做完${value?.seconds !== undefined ? `，用了 ${value.seconds} 秒` : ''}。`,
        ...(outputs.length ? ['结果（后面的步骤用这些编号）：', ...outputs] : ['这一步没有生成文件。']),
        ...(value?.summary ? [`功能项的说明：${value.summary}`] : []),
        ...(value?.failed?.length ? [`没做成的：${value.failed.join('、')}`] : []),
      ].join('\n');
    }
    case 'read': return `按员工的要求读到的内容（页面上会写明你读了这些）：\n${value?.text ?? ''}${value?.truncated ? '\n（后面还有，没读完；需要再用 rows 往下读）' : ''}`;
    case 'ask': return '问题已经摆在员工面前了。结束这一轮，等员工回答；回答会作为下一条消息发来。';
    case 'finish': return '已经交给员工：结果在办公工坊页上，员工点「保存…」自己存。结束这一轮。';
    default: return '';
  }
}

const parameters = {
  action: { type: 'string', enum: ['guide', 'plan', 'run', 'read', 'ask', 'finish'], required: true, description: 'guide 读用法和功能项；plan 列步骤；run 做一步；read 读文件内容（员工要求时才用）；ask 问员工；finish 交结果。' },
  category: { type: 'string', description: 'guide：分类编号，比如 pdf、excel；省略时读总用法和分类目录。' },
  steps: { type: 'array', items: { type: 'object', properties: { tool: { type: 'string', required: true, description: '功能项编号' }, note: { type: 'string', required: true, description: '给员工看的一句话：这一步做什么' } }, additionalProperties: false }, description: 'plan：要做的几步，按顺序。' },
  step: { type: 'number', description: 'run：计划里的第几步，从 1 开始。' },
  tool: { type: 'string', description: 'run：功能项编号。' },
  inputs: { type: 'array', items: { type: 'string' }, description: 'run：输入文件编号，f 开头是员工放进来的，r 开头是前面步骤的结果。' },
  options: { type: 'object', additionalProperties: true, description: 'run：这个功能项的设置，写法见 guide。' },
  text: { type: 'string', description: 'run：要处理的文字（文字类功能项用）。' },
  file: { type: 'string', description: 'read：文件编号。' },
  reason: { type: 'string', description: 'read：员工是怎么要求你看内容的，用员工的原话。' },
  sheet: { type: 'string', description: 'read：工作表名。' },
  rows: { type: 'string', description: 'read：读哪几行，比如 1-50；PDF 和 Word 是第几页到第几页。' },
  question: { type: 'string', description: 'ask：问员工的一句话。' },
  choices: { type: 'array', items: { type: 'string' }, description: 'ask：给员工点的选项，最多 5 个，每个不超过 40 字。' },
  message: { type: 'string', description: 'finish：给员工的交代：做了什么、结果怎样、要留意什么。' },
  results: { type: 'array', items: { type: 'string' }, description: 'finish：交给员工的结果文件编号。' },
};

/** 只登记在办公工坊这一单的会话上；guide 在主机侧直接回，其余交给开着的办公工坊页面。 */
export function toolboxTool(broker) {
  return defineTool({
    name: toolboxToolName,
    description: '鲸翼办公工坊：用做好的功能项处理员工放进来的文件，文件在员工电脑上处理，你只看得到名字、大小、页数、表头这类描述。第一次用先 guide 读用法。只用这里的功能项，不自己写代码处理文件。',
    parameters,
    timeoutMs: 5 * 60 * 1000,
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      if (args?.action === 'guide') return guideText(typeof args.category === 'string' ? args.category.trim() : '');
      const request = toolboxRequest(args);
      if (!exec.agent) fail('只有办公工坊的会话能用');
      const value = await broker.request(exec.agent.session.id, args.action, request, { signal: exec.signal, timeoutMs: args.action === 'run' ? 4 * 60 * 1000 : 30000 });
      return toolboxAnswer(args.action, request, value);
    },
    presentCall: args => ({ card: 'generic', title: '鲸翼办公工坊', kind: args?.action === 'guide' || args?.action === 'read' ? 'read' : 'other', rawInput: args }),
  });
}
