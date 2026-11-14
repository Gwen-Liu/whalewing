import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ToolboxBroker, composeMessage, describeFile, foldJob, jobProjection, jobTitle, replyLimit } from '../features/toolbox/jobs.js';
import { toolboxAnswer, toolboxRequest, toolboxTool } from '../features/toolbox/tool.js';
import { toolboxContract } from '../features/toolbox/contract.js';
import { functionIds, guideText } from '../features/toolbox/guide.js';
import { utilityCatalog, utilityTools } from '../src/utilities/catalog.js';

const mark = (commandId = 'c1', title = '发票合成一份') => [
  { type: 'command/run', data: { name: 'whalewing-toolbox-job', commandId, args: JSON.stringify({ title }) } },
  { type: 'command/done', data: { commandId, kind: 'success', text: '{}' } },
];
const reply = text => ({ type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text }] } } });
const end = kind => ({ type: 'turn/end', data: { reason: { kind } } });

test('办公工坊的一单从会话自己的记录算进度：登记过才算，开工、做完，留下小鲸最后一句', () => {
  assert.equal(foldJob([{ type: 'turn/start' }, reply('普通会话'), end('completed')]), null, '没登记过的会话不算');
  const events = [...mark(), { type: 'turn/start' }];
  assert.deepEqual(foldJob(events), { title: '发票合成一份', status: 'running', reply: '', turns: 1 });
  events.push(reply('合好了，24 页'), end('completed'));
  assert.deepEqual(foldJob(events), { title: '发票合成一份', status: 'completed', reply: '合好了，24 页', turns: 1 });
  // 员工接着说：新一轮开始时清掉上一轮的回复，不把旧话当成新结果。
  events.push({ type: 'turn/start' });
  assert.deepEqual(foldJob(events), { title: '发票合成一份', status: 'running', reply: '', turns: 2 });
  for (const [kind, status] of [['error', 'error'], ['aborted', 'interrupted'], ['max-tokens', 'incomplete'], ['新原因', 'unknown']]) assert.equal(foldJob([...mark(), { type: 'turn/start' }, end(kind)]).status, status, kind);
  assert.equal([...foldJob([...mark(), { type: 'turn/start' }, reply('长'.repeat(replyLimit + 9))]).reply].length, replyLimit + 1);
  assert.equal(foldJob([{ type: 'command/run', data: { name: 'whalewing-toolbox-job', commandId: 'x', args: '{' } }, { type: 'command/done', data: { commandId: 'x', kind: 'success' } }]), null, '坏的登记不算');
  assert.equal(foldJob([...mark('a', '第一单'), ...mark('b', '第二单')]).title, '第一单', '第二次登记不覆盖');
  assert.equal(jobProjection.wire.view(jobProjection.init()), null);
});

test('员工的话加文件描述作为员工的消息：只有名字、类型、大小、页数和表头，没有内容', () => {
  const files = [
    { id: 'f1', name: '发票01.jpg', type: 'jpg', size: 2516582, width: 4032, height: 3024 },
    { id: 'f2', name: '培训报名表.xlsx', type: 'xlsx', size: 49152, sheets: [{ name: '报名', rows: 86, headers: ['工号', '姓名', '部门'] }] },
    { id: 'f3', name: '截图.png', type: 'png', size: 421888, pasted: true },
  ];
  const text = composeMessage({ text: '对一下名单', files });
  assert.match(text, /^对一下名单\n\n【办公工坊】这次放进来的文件（编号给 whalewing_toolbox 用）：/);
  assert.match(text, /- f1 发票01\.jpg（JPG，2\.4 MB，4032×3024）/);
  assert.match(text, /- f2 培训报名表\.xlsx（XLSX，48 KB；工作表「报名」，数据 86 行，表头：工号、姓名、部门）/);
  assert.match(describeFile(files[2]), /员工粘贴的截图/);
  assert.equal(composeMessage({ text: '再压小一点', files: [] }), '再压小一点');
  assert.match(composeMessage({ text: ' ', files: files.slice(0, 1) }), /^（员工没写要求，只放了文件）/);
  assert.equal(jobTitle({ text: '把发票合成一个 PDF\n加页码', files: [] }), '把发票合成一个 PDF');
  assert.equal(jobTitle({ text: '', files }), '处理 发票01.jpg 等 3 个文件');
  assert.equal([...jobTitle({ text: '长'.repeat(60), files: [] })].length, 40);
});

test('请求台：小鲸的调用等页面交回；页面没开、超时、取消、功能关闭都撤回这条请求', async () => {
  const timers = [];
  const broker = new ToolboxBroker({ pageWaitMs: 50, setTimer: (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; }, clearTimer: clearTimeout });
  await assert.rejects(broker.request('s1', 'run', { step: 1 }), { code: 'TOOLBOX_PAGE_CLOSED' }, '没有页面订阅时等一会儿就报页面没开');
  const abort = new AbortController();
  const frames = broker.watch(abort.signal)[Symbol.asyncIterator]();
  assert.deepEqual((await frames.next()).value.requests, []);
  const pending = broker.request('s1', 'run', { step: 1, tool: 'pdf-merge' }, { timeoutMs: 1000 });
  const frame = (await frames.next()).value;
  assert.equal(frame.requests.length, 1);
  const [request] = frame.requests;
  assert.deepEqual({ ...request, id: undefined }, { id: undefined, sessionId: 's1', action: 'run', args: { step: 1, tool: 'pdf-merge' } });
  assert.equal(broker.reply({ id: request.id, ok: true, value: { outputs: [] } }), true);
  assert.deepEqual(await pending, { outputs: [] });
  assert.equal(broker.reply({ id: request.id, ok: true }), false, '交回过的请求不能再交');
  assert.deepEqual((await frames.next()).value.requests, [], '交回后从待办里撤掉');
  const failed = broker.request('s1', 'read', { file: 'f1' });
  const next = (await frames.next()).value.requests[0];
  broker.reply({ id: next.id, ok: false, error: '这一单的文件已经不在页面里了' });
  await assert.rejects(failed, { code: 'TOOLBOX_PAGE', message: '这一单的文件已经不在页面里了' });
  await frames.next();
  await assert.rejects(broker.request('s1', 'run', {}, { timeoutMs: 5 }), { code: 'TOOLBOX_TIMEOUT' });
  const cancel = new AbortController();
  const cancelled = broker.request('s1', 'run', {}, { signal: cancel.signal });
  cancel.abort(new Error('员工停下了'));
  await assert.rejects(cancelled, { message: '员工停下了' });
  const left = broker.request('s1', 'run', {});
  broker.close();
  await assert.rejects(left, { code: 'TOOLBOX_CLOSED' });
  abort.abort();
  await frames.return();
  assert.equal(broker.watchers, 0);
});

test('请求台只发当前完整帧，带上页面关心的那几单的进度', async () => {
  const broker = new ToolboxBroker();
  broker.setJob('s1', foldJob([...mark(), { type: 'turn/start' }]));
  assert.equal(broker.tracks('s1'), true);
  const revision = broker.revision;
  broker.setJob('s1', foldJob([...mark(), { type: 'turn/start' }]));
  assert.equal(broker.revision, revision, '进度没变不发新帧');
  broker.setJob('s1', foldJob([...mark(), { type: 'turn/start' }, reply('好了'), end('completed')]));
  assert.deepEqual(broker.snapshot().jobs, [{ sessionId: 's1', status: 'completed', reply: '好了', turns: 1 }]);
  broker.setJob('s2', null);
  assert.equal(broker.tracks('s2'), false);
  const parsed = toolboxContract(z).frame.parse(broker.snapshot());
  assert.equal(parsed.jobs.length, 1);
});

test('工具参数先校验：功能项要在目录里，文件写编号，读内容要写员工的原话', () => {
  assert.deepEqual(toolboxRequest({ action: 'plan', steps: [{ tool: 'images-pdf', note: '图片转成 PDF' }, { tool: 'pdf-merge', note: '合成一份' }] }).steps.map(step => step.tool), ['images-pdf', 'pdf-merge']);
  assert.throws(() => toolboxRequest({ action: 'plan', steps: [{ tool: 'rm-rf', note: '删' }] }), /没有「rm-rf」这个功能项/);
  assert.throws(() => toolboxRequest({ action: 'plan', steps: [] }), /至少一步/);
  assert.deepEqual(toolboxRequest({ action: 'run', step: 2, tool: 'pdf-merge', inputs: ['r1-1', 'f8', 'f8'] }), { step: 2, tool: 'pdf-merge', inputs: ['r1-1', 'f8'], options: {} });
  assert.throws(() => toolboxRequest({ action: 'run', step: 1, tool: 'pdf-merge', inputs: ['发票.pdf'] }), /要写文件编号/);
  assert.throws(() => toolboxRequest({ action: 'run', step: 0, tool: 'pdf-merge', inputs: ['f1'] }), /第几步/);
  assert.throws(() => toolboxRequest({ action: 'run', step: 1, tool: 'pdf-merge', inputs: ['f1'], options: [] }), /options 要写成对象/);
  assert.deepEqual(toolboxRequest({ action: 'run', step: 1, tool: 'qr-make', text: 'https://example.com' }), { step: 1, tool: 'qr-make', inputs: [], options: {}, text: 'https://example.com' });
  assert.throws(() => toolboxRequest({ action: 'read', file: 'f1' }), /reason/);
  assert.deepEqual(toolboxRequest({ action: 'read', file: 'r2-1', reason: '直接告诉我是哪几个人', rows: '1-20' }), { file: 'r2-1', reason: '直接告诉我是哪几个人', rows: '1-20' });
  assert.throws(() => toolboxRequest({ action: 'ask', question: '按哪列对？', choices: ['1', '2', '3', '4', '5', '6'] }), /最多 5 个/);
  assert.deepEqual(toolboxRequest({ action: 'finish', message: '合好了', results: ['r4-1'] }), { message: '合好了', results: ['r4-1'] });
  assert.throws(() => toolboxRequest({ action: 'shell' }), /action 只能是/);
});

test('页面交回的结果变成给小鲸看的几行字：结果编号和功能项的说明，要框位置时让小鲸先停下', () => {
  const run = toolboxRequest({ action: 'run', step: 4, tool: 'pdf-compress', inputs: ['r3-1'] });
  const text = toolboxAnswer('run', run, { seconds: 3.1, outputs: [{ id: 'r4-1', name: '11月发票-合并.pdf', type: 'pdf', size: 9017753, pages: 24 }], summary: '第 18–20 页是扫描件，压缩后字会略糊', failed: [] });
  assert.match(text, /第 4 步做完，用了 3\.1 秒。/);
  assert.match(text, /- r4-1 11月发票-合并\.pdf（PDF，8\.6 MB，24 页）/);
  assert.match(text, /功能项的说明：第 18–20 页是扫描件/);
  assert.match(toolboxAnswer('run', run, { needs: 'region' }), /先结束这一轮，不要猜位置/);
  assert.match(toolboxAnswer('ask', {}, {}), /结束这一轮，等员工回答/);
  assert.match(toolboxAnswer('read', {}, { text: '林子航', truncated: true }), /林子航\n（后面还有/);
});

test('工具执行：guide 在主机直接回，其余交给页面；只登记在办公工坊的会话上', async () => {
  const calls = [];
  const broker = { request: async (...args) => { calls.push(args); return { outputs: [{ id: 'r1-1', name: 'a.pdf', type: 'pdf', size: 10 }] }; } };
  const tool = toolboxTool(broker);
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'job-1' } } };
  assert.match(await tool.execute({ action: 'guide' }, exec), /分类目录/);
  assert.equal(calls.length, 0);
  assert.match(await tool.execute({ action: 'run', step: 1, tool: 'pdf-merge', inputs: ['f1', 'f2'] }, exec), /r1-1 a\.pdf/);
  assert.equal(calls[0][0], 'job-1');
  assert.equal(calls[0][1], 'run');
  assert.equal(calls[0][3].timeoutMs, 4 * 60 * 1000);
  await assert.rejects(tool.execute({ action: 'run', step: 1, tool: 'pdf-merge', inputs: ['f1'] }, { ...exec, agent: undefined }), /只有办公工坊的会话能用/);
});

test('用法说明覆盖目录里的每个分类和每个功能项，新功能项加进目录就会出现在说明里', () => {
  const index = guideText('');
  for (const category of utilityTools) assert.match(index, new RegExp(`${category.id}：${category.title}`));
  for (const category of utilityTools) {
    const text = guideText(category.id);
    for (const item of category.functions) if (functionIds.has(item.id)) assert.match(text, new RegExp(`\\b${item.id}\\b`), item.id);
  }
  assert.match(guideText('不存在'), /没有这个分类/);
  for (const item of utilityCatalog) assert.ok(functionIds.has(item.id), `${item.id} 不该从说明里漏掉`);
});

test('办公工坊的会话只留 whalewing_toolbox：会话标记写好后补上，别的会话不动，卸载时撤掉', async () => {
  const { default: Toolbox } = await import('../features/toolbox/host.js');
  const handlers = {}, effects = [], registered = [], restricted = [], guards = [];
  const jobs = new Set(['job-1']);
  const agent = id => {
    const disposers = [];
    return { id, session: { id }, ctx: {
      tools: {
        register: tool => { registered.push([id, tool.name]); return () => registered.splice(registered.findIndex(([a]) => a === id), 1); },
        restrict: filter => { restricted.push([id, filter]); return () => {}; },
        guard: fn => { guards.push([id, fn]); return () => {}; },
      },
      effect: fn => { disposers.push(fn()); return () => {}; },
    } };
  };
  const agents = new Map([['job-1', agent('job-1')], ['chat-1', agent('chat-1')]]);
  const scope = {
    sessionProjections: { register: () => {}, stateOf: session => (jobs.has(session.id) ? { job: { title: 'x', status: 'running', reply: '', turns: 1 } } : undefined) },
    commands: { register: command => { handlers.command = command; } },
    agents: { get: id => agents.get(id), list: () => [...agents.values()] },
    on: (name, fn) => { handlers[name] = fn; },
    effect: fn => { effects.push(fn()); },
  };
  const self = { broker: new ToolboxBroker() };
  Toolbox.prototype.attach.call(self, scope);
  assert.deepEqual(registered, [['job-1', 'whalewing_toolbox']], '只给办公工坊的会话登记');
  assert.deepEqual(restricted, [['job-1', { allow: [] }]], '全局工具一个不留');
  const [, guard] = guards[0];
  assert.equal(guard({ name: 'whalewing_toolbox' }), undefined);
  assert.match(guard({ name: 'bash' }), /只用 whalewing_toolbox/);
  // 普通会话后来登记成办公工坊的一单：命令做完时补上。
  jobs.add('chat-1');
  handlers['session/event']({ id: 'chat-1' }, { type: 'command/done' });
  assert.deepEqual(registered.map(([id]) => id), ['job-1', 'chat-1']);
  // 页面关心的那一单，会话事件过来时更新进度。
  self.broker.setJob('job-1', { status: 'queued', reply: '', turns: 0 });
  handlers['session/event']({ id: 'job-1' }, { type: 'turn/start' });
  assert.equal(self.broker.snapshot().jobs[0].status, 'running');
  assert.deepEqual(await handlers.command.handler({ rawInput: '{"title":"发票合成一份"}' }), { kind: 'success', text: '{"title":"发票合成一份"}' });
  assert.equal((await handlers.command.handler({ rawInput: '{}' })).kind, 'error');
  effects[0]?.();
});

test('交给小鲸：新的一单建会话、记标记、改标题，把员工的话和文件描述作为员工的消息发进去', async () => {
  const { default: Toolbox } = await import('../features/toolbox/host.js');
  const os = await import('node:os'), fs = await import('node:fs/promises'), path = await import('node:path');
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-toolbox-'));
  const sent = [], commands = [], renamed = [];
  let marked = false;
  const agent = { id: 'job-9', session: { id: 'job-9' }, followup: message => sent.push(message) };
  const services = {
    sessionController: { create: async input => { assert.equal(input.agentPreset, 'standard'); assert.ok(input.workspaceId === 'ws-1'); return { sessionId: 'job-9' }; }, resolveAgent: async () => ({ agent }), rename: async input => renamed.push(input) },
    commands: { execute: async (_agent, line) => { commands.push(line); marked = true; return { result: { kind: 'success', text: '{}' } }; } },
    sessions: { flush: async () => true },
    sessionProjections: { stateOf: () => (marked ? { job: { title: '发票', status: 'queued', reply: '', turns: 0 } } : undefined) },
    workspaceRegistry: { create: async (directory, title) => { assert.equal(title, '鲸翼办公工坊'); assert.match(directory, /whalewing-toolbox$/); return { id: 'ws-1' }; } },
    agents: { get: () => undefined },
  };
  const self = { host: { dshHome: home }, broker: new ToolboxBroker(), ctx: { get: name => services[name] } };
  self.directory = Toolbox.prototype.directory.bind(self);
  self.create = Toolbox.prototype.create.bind(self);
  const result = await Toolbox.prototype.start.call(self, { text: '把发票合成一个 PDF', files: [{ id: 'f1', name: '发票01.jpg', type: 'jpg', size: 1024 }] });
  assert.deepEqual(result, { sessionId: 'job-9' });
  assert.deepEqual(commands, ['/whalewing-toolbox-job {"title":"把发票合成一个 PDF"}']);
  assert.deepEqual(renamed, [{ sessionId: 'job-9', title: '办公工坊 · 把发票合成一个 PDF' }]);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content[0].text, /^把发票合成一个 PDF\n\n【办公工坊】.*\n- f1 发票01\.jpg（JPG，1 KB）$/s);
  assert.equal(self.broker.tracks('job-9'), true);
  // 员工接着说：发进同一单的会话，不再新建。
  services.agents.get = id => (id === 'job-9' ? agent : undefined);
  await Toolbox.prototype.start.call(self, { sessionId: 'job-9', text: '再压小一点', files: [] });
  assert.equal(sent[1].content[0].text, '再压小一点');
  assert.equal(commands.length, 1);
  await assert.rejects(Toolbox.prototype.start.call(self, { sessionId: 'nope', text: '继续', files: [] }), /这一单的会话找不到了/);
  await assert.rejects(Toolbox.prototype.start.call(self, { text: '  ', files: [] }), /先放文件进来/);
  await fs.rm(home, { recursive: true, force: true });
});

test('页面执行器：小鲸写的 options 按 Worker 的要求整理，要框位置的先请员工框，关联按文件和工作表认表', async () => {
  const { createExecutor, workerOptions, workerTool, rowRange, hasRegion } = await import('../src/utilities/workshop-exec.js');
  assert.equal(workerTool('image-format'), 'image');
  assert.equal(workerTool('table-convert', { conversion: 'csv-excel' }), 'csv-excel');
  assert.equal(workerTool('table-convert'), 'excel-csv');
  assert.deepEqual(workerOptions('image-format', { format: 'png' }), { format: 'png', mode: 'convert' });
  assert.deepEqual(workerOptions('pdf-rotate', { angle: '90', pages: [1, 3] }), { angle: 90, pages: '1,3' });
  assert.deepEqual(workerOptions('excel-split-by', { columns: '部门' }), { columns: '部门' }, '表格的 columns 是列名，不转数字');
  assert.deepEqual(workerOptions('image-grid', { rows: '2', columns: '3' }), { rows: 2, columns: 3 });
  assert.deepEqual(workerOptions('excel-join', { joinColumns: '手机，邮箱' }).joinColumns, ['手机', '邮箱']);
  assert.deepEqual(rowRange('3-5', 10), [2, 5]);
  assert.deepEqual(rowRange('', 10), [0, 10]);
  assert.deepEqual(rowRange('8-99', 10), [7, 10]);
  assert.equal(hasRegion({ x: 0, y: 0, width: 10, height: 5 }), true);
  assert.equal(hasRegion({ x: 0, y: 0, width: 0, height: 5 }), false);
  const requests = [];
  const exec = createExecutor({ runWorker: async request => {
    requests.push(request);
    if (request.tool === 'excel-headers') return { tables: [{ id: '0/0', label: '名单.xlsx · 报名', headers: ['工号'] }, { id: '1/0', label: '已交.xlsx · Sheet1', headers: ['工号'] }] };
    if (request.tool === 'excel-sheets') return { sheets: ['报名'] };
    if (request.tool === 'excel-json') return { files: [{ bytes: new TextEncoder().encode(JSON.stringify([{ 工号: '1', 姓名: '甲' }, { 工号: '2', 姓名: '乙' }, { 工号: '3', 姓名: '丙' }])) }] };
    return { files: [], summary: 'ok' };
  } });
  assert.deepEqual(await exec.run('image-mosaic', [{}], {}), { needs: 'region' });
  assert.deepEqual(await exec.run('image-crop', [{}], { x: 1 }), { needs: 'region' });
  await exec.run('excel-join', [{}, {}], { main: { file: 'f1', sheet: '报名' }, lookup: { file: 'f2' }, leftKey: '工号', rightKey: '工号', joinColumns: ['工号'] }, undefined, ['f1', 'f2']);
  const join = requests.find(request => request.tool === 'excel-join');
  assert.equal(join.options.leftTable, '0/0'); assert.equal(join.options.rightTable, '1/0');
  assert.equal(join.options.main, undefined);
  await assert.rejects(exec.run('excel-join', [{}], { main: { file: 'f1', sheet: '没有' }, lookup: { file: 'f1' } }, undefined, ['f1']), /主表找不到/);
  await assert.rejects(exec.run('shell', [{}], {}), /没有「shell」这个功能项/);
  const read = await exec.read({}, 'xlsx', { rows: '2-3' });
  assert.equal(read.text, '工作表「报名」共 3 行，下面是第 2 到 3 行\n工号\t姓名\n2\t乙\n3\t丙');
  assert.equal(read.truncated, false);
  const text = await exec.read({ arrayBuffer: async () => new TextEncoder().encode('一\n二\n三').buffer }, 'txt', { rows: '1-2' });
  assert.deepEqual(text, { text: '一\n二', truncated: true });
});

test('和小鲸的对话里转过来的活：只在小鲸的主会话里能转，转过去等页面认领，认领一次就撤掉', async () => {
  const { toolboxHandoffDefinition } = await import('../features/toolbox/handoff.js');
  const broker = new ToolboxBroker();
  const scope = { whalewingExperts: { selectedFor: agent => agent.expert } };
  const tool = toolboxHandoffDefinition(scope, broker);
  const exec = expert => ({ signal: new AbortController().signal, agent: { expert, session: { id: 'chat-7', header: { title: '11月报销' } } } });
  assert.match(await tool.execute({ request: '把 D:\报销 里的发票合成一个 PDF，加页码' }, exec('manager')), /已经转给办公工坊/);
  await assert.rejects(tool.execute({ request: '合成 PDF' }, exec('writing')), /只有小鲸的主会话能转给办公工坊/);
  await assert.rejects(tool.execute({ request: '  ' }, exec('manager')), /request 写员工的原话/);
  const abort = new AbortController();
  const frames = broker.watchHandoffs(abort.signal)[Symbol.asyncIterator]();
  const { value } = await frames.next();
  assert.deepEqual(value.items.map(({ text, from }) => ({ text, from })), [{ text: '把 D:\报销 里的发票合成一个 PDF，加页码', from: { sessionId: 'chat-7', title: '11月报销' } }]);
  assert.equal(broker.watchers, 0, '外壳订阅转来的活不算页面开着');
  assert.equal(broker.claim(value.items[0].id), true);
  assert.equal(broker.claim(value.items[0].id), false);
  assert.deepEqual((await frames.next()).value.items, []);
  abort.abort(); await frames.return();
  const parsed = toolboxContract(z).handoffs.parse({ revision: 1, items: [{ id: 'h1', text: '做二维码', from: { sessionId: 's', title: 't' } }] });
  assert.equal(parsed.items.length, 1);
});

test('结果文件名不叠：一个输入时去掉序号，一步接一步的“-处理”只留一个（2026-11-12 真模型验收时发现）', async () => {
  const { tidyName } = await import('../src/utilities/workshop-exec.js');
  assert.equal(tidyName('1-海报-处理.jpg', '海报.png'), '海报-处理.jpg');
  assert.equal(tidyName('1-海报-处理-处理.jpg', '海报-处理.jpg'), '海报-处理.jpg', '第二步接着第一步的结果');
  assert.equal(tidyName('2-合同-处理.png'), '2-合同-处理.png', '多张图片时序号留着，分得清是哪张');
  assert.equal(tidyName('2026-11-报表-整理.xlsx', '2026-11-报表.xlsx'), '2026-11-报表-整理.xlsx', '本来就以数字开头的文件名不动');
  assert.equal(tidyName('1-2026-11-截图-处理.png', '2026-11-截图.png'), '2026-11-截图-处理.png');
});

test('Office 转 PDF 交给 DSH 的转换服务：读回的版本和登记的一样，结果和缺字体原样交回（2026-11-12 验收时发现少了版本）', async () => {
  const { default: Toolbox } = await import('../features/toolbox/host.js');
  const requests = [];
  // 照 DSH 转换服务的规矩：读回的 version 必须和登记的 source.version 一样，否则报 source-changed。
  const officeToPdf = { async convert(request, signal) {
    requests.push(request);
    const input = await request.source.read(signal, request.source.bytes);
    if (input.version !== request.source.version) throw Object.assign(new Error('The source changed while waiting for conversion.'), { code: 'source-changed' });
    assert.equal(input.bytes.byteLength, request.source.bytes);
    return { pdf: new TextEncoder().encode('%PDF-1.7 fake'), missingFonts: ['方正小标宋'] };
  } };
  const self = { ctx: { get: name => (name === 'officeToPdf' ? officeToPdf : undefined) } };
  const data = Buffer.from('word bytes').toString('base64');
  const value = await Toolbox.prototype.officePdf.call(self, { name: '培训通知.docx', extension: 'docx', data });
  assert.equal(Buffer.from(value.data, 'base64').toString(), '%PDF-1.7 fake');
  assert.deepEqual(value.missingFonts, ['方正小标宋']);
  assert.equal(requests[0].extension, 'docx'); assert.equal(requests[0].priority, 'foreground');
  await assert.rejects(Toolbox.prototype.officePdf.call(self, { name: 'a.pdf', extension: 'pdf', data }), /Invalid/);
  await assert.rejects(Toolbox.prototype.officePdf.call({ ctx: { get: () => undefined } }, { name: 'a.docx', extension: 'docx', data }), /没有开 Office 转 PDF 服务/);
});

test('转过来的那一单：标题从会话列表实时读，“回到对话”在专家团队页中间那栏打开（2026-11-12 真模型验收时发现）', async () => {
  const { createToolboxClient } = await import('../features/toolbox/client-api.js');
  const calls = [];
  const bridge = { featureRemote: () => ({}), unwrap: value => value, open: id => calls.push(['open', id]), showWorkbench: tab => calls.push(['tab', tab]),
    sessionSnapshot: () => ({ byId: { 'chat-7': { title: '  海报二维码  ' } } }) };
  const client = createToolboxClient(bridge, { requestTask: id => calls.push(['task', id]) });
  assert.equal(client.sessionTitle('chat-7'), '海报二维码');
  assert.equal(client.sessionTitle('没有'), '');
  client.openSession('chat-7');
  assert.deepEqual(calls, [['task', 'chat-7'], ['tab', 'experts']]);
  createToolboxClient(bridge).openSession('chat-8');
  assert.deepEqual(calls.at(-1), ['open', 'chat-8'], '没有专家团队页时退回 DSH 自己打开');
  assert.equal(createToolboxClient({ ...bridge, sessionSnapshot: () => { throw new Error('还没连上'); } }).sessionTitle('chat-7'), '');
});

test('员工贴的路径：文件夹列出这一层（隐藏文件、锁文件、系统文件不列，子文件夹不进去），文件只列自己；读文件只认那一层的文件名，超过 25 MiB 不读', async t => {
  const { default: Toolbox } = await import('../features/toolbox/host.js');
  const { mkdtemp, mkdir, writeFile, rm, truncate } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(join(tmpdir(), '鲸翼 路径 '));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, '发票 10.pdf'), 'pdf10'); await writeFile(join(dir, '发票 2.pdf'), 'pdf2');
  await writeFile(join(dir, '.隐藏.txt'), 'x'); await writeFile(join(dir, '~$报表.xlsx'), 'x'); await writeFile(join(dir, 'Thumbs.db'), 'x');
  await mkdir(join(dir, '子文件夹')); await writeFile(join(dir, '子文件夹', '里面.pdf'), 'x');
  await writeFile(join(dir, '大文件.mp4'), ''); await truncate(join(dir, '大文件.mp4'), 25 * 1024 * 1024 + 1);
  const self = {};
  const listing = await Toolbox.prototype.listPath.call(self, { path: `"${dir}"` });
  assert.equal(listing.kind, 'folder'); assert.equal(listing.path, dir); assert.equal(listing.truncated, false);
  assert.deepEqual(listing.entries.map(entry => [entry.name, entry.folder]), [['子文件夹', true], ['大文件.mp4', false], ['发票 2.pdf', false], ['发票 10.pdf', false]], '子文件夹在前，文件名按数字顺序排，隐藏文件、锁文件、Thumbs.db 不列');
  const single = await Toolbox.prototype.listPath.call(self, { path: join(dir, '发票 2.pdf') });
  assert.deepEqual([single.kind, single.path, single.entries.map(entry => entry.name)], ['file', dir, ['发票 2.pdf']]);
  const read = await Toolbox.prototype.readPathFile.call(self, { path: dir, name: '发票 10.pdf' });
  assert.equal(Buffer.from(read.data, 'base64').toString(), 'pdf10'); assert.equal(read.size, 5);
  await assert.rejects(Toolbox.prototype.readPathFile.call(self, { path: dir, name: join('子文件夹', '里面.pdf') }), /文件名不对/);
  await assert.rejects(Toolbox.prototype.readPathFile.call(self, { path: dir, name: '..' }), /文件名不对/);
  await assert.rejects(Toolbox.prototype.readPathFile.call(self, { path: dir, name: '子文件夹' }), /不是文件/);
  await assert.rejects(Toolbox.prototype.readPathFile.call(self, { path: dir, name: '大文件.mp4' }), /超过单个文件 25 MiB/);
  await assert.rejects(Toolbox.prototype.listPath.call(self, { path: join(dir, '没有这个') }), /找不到这个路径/);
  await assert.rejects(Toolbox.prototype.listPath.call(self, { path: '发票/2026' }), /要写完整的路径/);
});

test('输入框里认路径：带英文引号的（可以有空格）、中文引号里的、不带引号不带空格的；结尾的反斜杠去掉', async () => {
  const { findPath } = await import('../src/utilities/workshop.js');
  const bs = String.fromCharCode(92);
  const p = (...parts) => parts.join(bs);
  assert.equal(findPath(`把 "${p('E:', '我的 文档', '发票')}" 里的发票合成一个 PDF`), p('E:', '我的 文档', '发票'));
  assert.equal(findPath(`处理“${p('D:', '工作 资料', '2026')}”`), p('D:', '工作 资料', '2026'));
  assert.equal(findPath(`${p('C:', 'Users', 'me', 'Desktop', '截图')}${bs}，压缩一下`), p('C:', 'Users', 'me', 'Desktop', '截图'));
  assert.equal(findPath('没有路径的要求'), undefined);
});

test('小鲸转活时带上员工在对话里发的附件：只认 DSH 附件目录里的路径，原文件名照附件提示填；带了附件就告诉小鲸会一起读进去', async () => {
  const { toolboxHandoffDefinition, checkAttachments } = await import('../features/toolbox/handoff.js');
  const { join, resolve } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const root = join(tmpdir(), 'dsh-home', 'attachments');
  const saved = join(root, 'v1', 'files', 'sha256-abcd');
  assert.deepEqual(checkAttachments([{ path: `"${saved}"`, name: '发票.pdf' }], root), [{ path: resolve(saved), name: '发票.pdf' }]);
  assert.deepEqual(checkAttachments(undefined, root), []);
  assert.throws(() => checkAttachments([{ path: join(tmpdir(), 'secret.txt'), name: 'secret.txt' }], root), /不是员工在对话里发的附件/);
  assert.throws(() => checkAttachments([{ path: join(root, '..', 'attachments-x', 'a'), name: 'a.pdf' }], root), /不是员工在对话里发的附件/, '名字像但不在附件目录里');
  assert.throws(() => checkAttachments([{ path: 'v1/files/x', name: 'a.pdf' }], root), /完整路径/);
  assert.throws(() => checkAttachments([{ path: saved, name: join('子', 'a.pdf') }], root), /原文件名/);
  assert.throws(() => checkAttachments([{ path: saved, name: 'a.pdf' }], undefined), /不是员工在对话里发的附件/, '拿不到附件目录时一律不认');
  assert.throws(() => checkAttachments(Array.from({ length: 21 }, () => ({ path: saved, name: 'a.pdf' })), root), /最多 20 个/);
  const broker = new ToolboxBroker();
  const tool = toolboxHandoffDefinition({ whalewingExperts: { selectedFor: () => 'manager' } }, broker, () => root);
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'chat-8', header: { title: '证件照' } } } };
  assert.match(await tool.execute({ request: '把这张照片改成一寸', attachments: [{ path: saved, name: '照片.jpg' }] }, exec), /「照片\.jpg」会一起读进去处理/);
  await assert.rejects(tool.execute({ request: '改成一寸', attachments: [{ path: join(tmpdir(), 'x.jpg'), name: 'x.jpg' }] }, exec), /不是员工在对话里发的附件/);
  assert.match(await tool.execute({ request: '做一个二维码' }, exec), /这次没带附件/);
  const abort = new AbortController();
  const { value } = await broker.watchHandoffs(abort.signal)[Symbol.asyncIterator]().next();
  abort.abort();
  assert.deepEqual(value.items.map(item => item.files), [[{ path: resolve(saved), name: '照片.jpg' }], undefined]);
  const parsed = toolboxContract(z).handoffs.parse({ revision: 1, items: value.items });
  assert.equal(parsed.items[0].files[0].name, '照片.jpg');
});
