import path from 'node:path';
import { mkdir, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Service } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { registerBuiltin } from '../../src/features.js';
import { pathEntryLimit, toolboxContract, toolboxNamespace } from './contract.js';
import { ToolboxBroker, composeMessage, jobCommand, jobKey, jobProjection, jobTitle, parseJobMarker, workspaceTitle } from './jobs.js';
import { toolboxTool, toolboxToolName } from './tool.js';
import { applyToolboxHandoff } from './handoff.js';

const contract = toolboxContract(z);
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
// 和拖进来的一样：单个文件最多 25 MiB。
const pathFileLimit = 25 * 1024 * 1024;
// 文件夹里不列出来的：隐藏文件、Office 打开时留的锁文件、系统的缩略图和文件夹设置。
const skipName = name => name.startsWith('.') || name.startsWith('~$') || /^(thumbs\.db|desktop\.ini)$/i.test(name);
const collator = new Intl.Collator('zh-Hans-CN', { numeric: true });
/** 员工贴的路径：去掉两头的引号和空白；只认绝对路径（从文件夹地址栏或“复制文件地址”复制来的那种）。 */
function cleanPath(raw) {
  const value = String(raw).trim().replace(/^["“”']+|["“”']+$/g, '').trim();
  if (!path.isAbsolute(value)) fail('TOOLBOX_PATH_RELATIVE', '要写完整的路径（比如从文件夹地址栏复制的那种）');
  return path.resolve(value);
}

/**
 * 办公工坊（2026-11-12 用户定的改版）：员工在办公工坊页放文件、说要什么结果，这里给这一单建会话，
 * 小鲸在会话里只拿得到 whalewing_toolbox（命令行、写文件这些都藏起来，想绕开功能项自己写代码也绕不开）；
 * 它要处理文件时，请求经 watch 推给办公工坊页面，页面处理完用 reply 交回。
 */
export default class Toolbox extends Service {
  static inject = ['whalewing', 'typert'];
  constructor(ctx) {
    super(ctx, toolboxNamespace);
    registerBuiltin(ctx, 'toolbox');
    this.host = ctx.whalewing;
    this.broker = new ToolboxBroker();
    this.typertRemote = bindTypertRemote(this, toolboxNamespace, { namespace: toolboxNamespace });
    ctx.typert.register(contract.host);
    ctx.inject(['tools', 'agents', 'sessionProjections', 'commands'], scope => this.attach(scope));
    // 和小鲸的对话里接到处理文件的活，转给办公工坊（只在小鲸的主会话里有这个工具）。
    // 员工在小鲸对话里发的附件，DSH 原样存在家目录的 attachments 下；转过来时只认这里的文件。
    applyToolboxHandoff(ctx, this.broker, () => this.host.dshHome && path.join(this.host.dshHome, 'attachments'));
    ctx.effect(() => () => this.broker.close());
  }

  /** 办公工坊的会话上只留 whalewing_toolbox：会话标记写好后、DSH 重启恢复会话时都会补上。 */
  attach(scope) {
    scope.sessionProjections.register(jobProjection);
    scope.commands.register({
      name: jobCommand,
      description: '鲸翼内部用：记下这个会话是办公工坊的一单。',
      input: { hint: '{"title":"这一单的名字"}' },
      handler: async ({ rawInput }) => {
        try { return { kind: 'success', text: JSON.stringify(parseJobMarker(rawInput)) }; }
        catch { return { kind: 'error', text: '办公工坊登记需要 title（一行，最多 40 字）' }; }
      },
    });
    const tool = toolboxTool(this.broker);
    const owned = new Map();
    const isJob = session => Boolean(scope.sessionProjections.stateOf(session, jobKey)?.job);
    const release = agent => {
      const record = owned.get(agent);
      if (!record) return;
      owned.delete(agent);
      for (const dispose of record) dispose();
    };
    const sync = agent => {
      if (scope.agents.get(agent.id) !== agent || !isJob(agent.session)) { release(agent); return; }
      if (owned.has(agent)) return;
      const record = [];
      owned.set(agent, record);
      record.push(agent.ctx.tools.register(tool));
      // 全局工具一个不留；会话自己的登记不受限制，所以再加一道执行前的守卫。
      record.push(agent.ctx.tools.restrict({ allow: [] }));
      record.push(agent.ctx.tools.guard(exec => exec.name === toolboxToolName ? undefined : '办公工坊里只用 whalewing_toolbox 的功能项处理文件，不用别的工具'));
      record.push(agent.ctx.effect(() => () => { if (owned.get(agent) === record) owned.delete(agent); }, 'whalewing toolbox job'));
    };
    scope.on('agent/created', ({ agent }) => sync(agent));
    scope.on('session/event', (session, event) => {
      if (event.type === 'command/done') { const agent = scope.agents.get(session.id); if (agent) sync(agent); }
      if (this.broker.tracks(session.id)) this.broker.setJob(session.id, scope.sessionProjections.stateOf(session, jobKey)?.job);
    });
    scope.effect(() => () => { for (const agent of [...owned.keys()]) release(agent); }, 'whalewing toolbox jobs');
    for (const agent of scope.agents.list()) sync(agent);
  }

  async directory(signal) {
    const directory = path.join(this.host.dshHome, 'whalewing-toolbox');
    await mkdir(directory, { recursive: true });
    signal?.throwIfAborted();
    return realpath(directory);
  }

  /** 新的一单：建会话、记标记、改标题，再把员工的话和文件描述作为员工的消息发进去，小鲸马上开工。 */
  async create(input, signal) {
    const controller = this.ctx.get('sessionController'), commands = this.ctx.get('commands'), sessions = this.ctx.get('sessions'), projections = this.ctx.get('sessionProjections');
    if (typeof controller?.create !== 'function' || typeof controller.resolveAgent !== 'function' || !commands || !sessions || !projections) fail('TOOLBOX_UNAVAILABLE', '当前 DSH 不支持插件新建会话，办公工坊没法交给小鲸');
    const registry = this.ctx.get('workspaceRegistry');
    const directory = await this.directory(signal);
    const workspace = registry ? await registry.create(directory, workspaceTitle) : undefined;
    signal?.throwIfAborted();
    const created = await controller.create({ ...(workspace ? { workspaceId: workspace.id } : { cwd: directory }), agentPreset: 'standard' });
    const sessionId = created?.sessionId;
    if (typeof sessionId !== 'string' || !sessionId) fail('TOOLBOX_SESSION', 'DSH 没有建好会话，请稍后重试');
    // 建好之后不再响应取消：半途停下会留下没有标记的空会话。
    const { agent } = await controller.resolveAgent(sessionId);
    if (!agent) fail('TOOLBOX_SESSION', `会话已建好（${sessionId}），但没能打开，请稍后重试`);
    const title = jobTitle(input);
    const done = await commands.execute(agent, `/${jobCommand} ${JSON.stringify({ title })}`, [], new AbortController().signal);
    if (done?.result.kind !== 'success') fail('TOOLBOX_SESSION', done?.result.text || '办公工坊登记没有完成');
    if (!(await sessions.flush(agent.session))) fail('TOOLBOX_SESSION', '办公工坊登记还没确认保存');
    if (!projections.stateOf(agent.session, jobKey)?.job) fail('TOOLBOX_SESSION', '办公工坊登记读回不一致');
    if (typeof controller.rename === 'function') {
      try { await controller.rename({ sessionId, title: `办公工坊 · ${title}` }); } catch { /* 标题只方便在侧栏找，设不上不影响这一单。 */ }
    }
    return agent;
  }

  async start(input, signal) {
    try {
      const parsed = contract.start.parse(input);
      let agent;
      if (parsed.sessionId) {
        agent = this.ctx.get('agents')?.get(parsed.sessionId) ?? (await this.ctx.get('sessionController')?.resolveAgent?.(parsed.sessionId))?.agent;
        if (!agent || agent.session?.id !== parsed.sessionId || !this.ctx.get('sessionProjections')?.stateOf(agent.session, jobKey)?.job) fail('TOOLBOX_SESSION', '这一单的会话找不到了，请重新交给小鲸');
      } else agent = await this.create(parsed, signal);
      const sessionId = agent.session.id;
      this.broker.setJob(sessionId, this.ctx.get('sessionProjections')?.stateOf(agent.session, jobKey)?.job);
      // 员工的话就是员工的消息；文件只带描述，内容留在页面里。
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: composeMessage(parsed) }] }));
      return { sessionId };
    } catch (error) { throw new RemoteError(error.code || error.name || 'TOOLBOX', error.message, {}); }
  }

  watch(signal) { return this.broker.watch(signal); }

  handoffs(signal) { return this.broker.watchHandoffs(signal); }

  /** Office 转 PDF：交给 DSH 自带的 Office 服务 `officeKit`（随包 LibreOffice；DSH 0.2.2-rc.3 起取代原来的 `officeToPdf`，convert 的参数和结果不变），不走命令行、不弹审批。 */
  async officePdf(input, signal) {
    try {
      const parsed = contract.officeInput.parse(input);
      const service = this.ctx.get('officeKit');
      if (typeof service?.convert !== 'function') fail('TOOLBOX_OFFICE_UNAVAILABLE', '这个 DSH 没有开 Office 转 PDF 服务，转不了；可以先在 Word、Excel 里“另存为 PDF”');
      const bytes = new Uint8Array(Buffer.from(parsed.data, 'base64'));
      const digest = createHash('sha256').update(bytes).digest('hex');
      const result = await service.convert({ source: { key: `whalewing-toolbox:${digest}`, version: digest, bytes: bytes.byteLength, read: async () => ({ bytes, version: digest }) }, extension: parsed.extension, priority: 'foreground' }, signal);
      return { data: Buffer.from(result.pdf).toString('base64'), missingFonts: [...(result.missingFonts ?? [])].map(String).slice(0, 200) };
    } catch (error) { throw new RemoteError(error.code || error.name || 'TOOLBOX', error.message, {}); }
  }

  /**
   * 员工在输入框里贴的路径（2026-11-14 用户定：员工一般复制文件夹路径，不会拖文件夹）。是文件夹就列出这一层的文件和子文件夹
   * （子文件夹不进去读），是文件就只列它自己；页面让员工挑，挑好再用 readPathFile 一个一个读。只有办公工坊页面调得到，小鲸调不到。
   */
  async listPath(input, signal) {
    try {
      const target = cleanPath(contract.pathInput.parse(input).path);
      const info = await stat(target).catch(() => fail('TOOLBOX_PATH_MISSING', '找不到这个路径，看看是不是复制完整了'));
      if (info.isFile()) return { path: path.dirname(target), kind: 'file', entries: [{ name: path.basename(target), size: info.size, folder: false }], truncated: false };
      if (!info.isDirectory()) fail('TOOLBOX_PATH_KIND', '这个路径既不是文件也不是文件夹');
      const items = (await readdir(target, { withFileTypes: true })).filter(item => !skipName(item.name) && (item.isFile() || item.isDirectory()));
      items.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || collator.compare(a.name, b.name));
      const entries = [];
      for (const item of items.slice(0, pathEntryLimit)) {
        signal?.throwIfAborted?.();
        if (item.isDirectory()) { entries.push({ name: item.name, size: 0, folder: true }); continue; }
        const size = await stat(path.join(target, item.name)).then(value => value.size, () => null);
        if (size !== null) entries.push({ name: item.name, size, folder: false });
      }
      return { path: target, kind: 'folder', entries, truncated: items.length > pathEntryLimit };
    } catch (error) { throw new RemoteError(error.code || error.name || 'TOOLBOX', error.message, {}); }
  }

  /** 读 listPath 列出来的一个文件交给页面：只认那个文件夹里的文件名，不认带路径的名字。 */
  async readPathFile(input, signal) {
    try {
      const parsed = contract.pathFileInput.parse(input);
      const folder = cleanPath(parsed.path);
      if (parsed.name !== path.basename(parsed.name) || parsed.name === '.' || parsed.name === '..') fail('TOOLBOX_PATH_NAME', '文件名不对');
      const file = path.join(folder, parsed.name);
      const info = await stat(file).catch(() => fail('TOOLBOX_PATH_MISSING', `找不到「${parsed.name}」，可能刚被挪走或删掉了`));
      if (!info.isFile()) fail('TOOLBOX_PATH_KIND', `「${parsed.name}」不是文件`);
      if (info.size > pathFileLimit) fail('TOOLBOX_PATH_SIZE', `「${parsed.name}」超过单个文件 25 MiB 的上限`);
      signal?.throwIfAborted?.();
      const bytes = await readFile(file);
      return { name: parsed.name, size: bytes.length, data: bytes.toString('base64') };
    } catch (error) { throw new RemoteError(error.code || error.name || 'TOOLBOX', error.message, {}); }
  }

  async claim(input) {
    try { return { accepted: this.broker.claim(contract.claim.parse(input).id) }; }
    catch (error) { throw new RemoteError(error.code || error.name || 'TOOLBOX', error.message, {}); }
  }

  async reply(input) {
    try { return { accepted: this.broker.reply(contract.reply.parse(input)) }; }
    catch (error) { throw new RemoteError(error.code || error.name || 'TOOLBOX', error.message, {}); }
  }
}
