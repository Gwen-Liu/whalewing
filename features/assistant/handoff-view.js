import { handoffText, expertEditText } from './client-presentation.js';

// 与 handoff.js 的工具名一致；浏览器端不引入 Host 工具定义。
const toolName = 'whalewing_handoff';
// 卡片也出现在专家任务的对话里（鲸翼页面之外），自带样式；颜色直接取 DSH 变量，跟着员工的皮肤走。
const handoffCss = '.ww-handoff{display:flex;flex-direction:column;gap:8px;margin:6px 0;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13.5px;line-height:1.6}.ww-handoff>.ww-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.ww-handoff>.ww-row>span{flex:1;min-width:0;font-weight:500}.ww-handoff>.ww-row>button{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;font-weight:500;cursor:pointer}.ww-handoff>.ww-row>button:first-of-type{border-color:var(--dsw-alias-button-primary-fill,var(--dsw-alias-label-primary));background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-label-primary));color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-layer-1))}.ww-handoff details{color:var(--dsw-alias-label-secondary);font-size:13px}.ww-handoff summary{cursor:pointer}.ww-handoff[data-state=started]{padding:6px 8px 6px 10px;border-radius:10px;font-size:12.5px}.ww-handoff[data-state=started]>.ww-row{flex-wrap:nowrap}.ww-handoff[data-state=started]>.ww-row>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:400}.ww-handoff[data-state=started]>.ww-row>button{height:26px;padding:0 10px;font-size:12px}.ww-handoff[data-state=started] .ww-avatar{flex:none;border-radius:999px}';
const format = (template, values = {}) => template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
const zhText = (key, values) => format(handoffText[key].zh, values);
const firstLine = value => value.split('\n').map(line => line.trim()).find(Boolean) ?? '';
const resultText = block => (block.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n');
/**
 * 员工在审批里点了拒绝：DSH 沙箱抛的是一句给模型看的英文（“the user rejected escalating this … it stays denied, so stop and
 * explain …”），没有错误码。卡片认出这句，改说“你没有批准”，不把给模型的话原样给员工（2026-11-14 真模型手测时看到）。
 */
export const declined = text => /rejected escalating .* stays denied/.test(text);

/** 只读工具记录本身：展示信息来自宿主记录的元数据，不解析给模型看的文字。 */
export function readHandoff(block) {
  const settled = 'kind' in block;
  let args;
  try { args = JSON.parse((settled ? block.call?.argsRaw : block.argsRaw) ?? ''); } catch { args = undefined; }
  const title = typeof args?.title === 'string' ? args.title.trim() : '';
  if (!settled) return { state: 'running', title };
  if (block.error?.code === 'interrupted') return { state: 'stopped', title };
  const meta = block.meta;
  if (!block.isError && meta && typeof meta === 'object' && ['sessionId', 'expertName', 'title', 'draft'].every(key => typeof meta[key] === 'string' && meta[key])) return { state: 'done', title, meta };
  const text = resultText(block);
  if (declined(text)) return { state: 'declined', title };
  // 宿主把失败写成“Error: 原因”，卡片只留原因。
  return { state: 'error', title, message: firstLine(text).replace(/^\w*Error:\s*/, '') };
}

/**
 * 打开交接任务：先把交接说明放进那个任务的输入框，再打开它；只填草稿，不发送。
 * 已开始的任务、已有草稿或宿主不支持预填时如实提示，并给出复制入口。
 */
export function createHandoffOpener({ check, summary, retain, open, input, notify, clipboard, text = zhText }) {
  async function copy(meta) {
    try {
      const target = clipboard();
      if (typeof target?.writeText !== 'function') throw new Error('clipboard unavailable');
      await target.writeText(meta.draft);
      notify(text('copied'), { kind: 'success' });
    } catch { notify(text('copyFailed'), { kind: 'error' }); }
  }
  const copyAction = meta => ({ label: text('copy'), run: () => copy(meta) });
  function prepare(meta, reference) {
    // 员工已经发过消息的任务不再补草稿，避免把交接说明当成新消息再塞进去。
    if (summary(meta.sessionId)?.blank === false) return 'started';
    try {
      const target = input();
      if (typeof target?.requestDraftInitialization !== 'function' || !reference.binding) return 'unsupported';
      return target.requestDraftInitialization(reference.binding, { prompt: meta.draft });
    } catch { return 'failed'; }
  }
  function openTask(meta) {
    try { check(meta.sessionId); }
    catch (error) { notify(error.message, { kind: 'error' }); return; }
    // 先由本次保留住会话再写草稿；打开后主视图接手同一份会话，再释放自己的保留。
    const reference = retain(meta.sessionId);
    let outcome;
    try {
      outcome = prepare(meta, reference);
      open(meta.sessionId);
    } catch (error) { notify(error.message || text('draftFailed'), { kind: 'error', action: copyAction(meta) }); return; }
    finally { reference.release(); }
    if (outcome === 'applied') notify(text('draftReady'), { kind: 'success' });
    else if (outcome === 'preserved') notify(text('draftKept'), { kind: 'info', action: copyAction(meta) });
    else if (outcome === 'started') notify(text('started'), { kind: 'info', action: copyAction(meta) });
    else if (outcome === 'unsupported') notify(text('unsupported'), { kind: 'info', action: copyAction(meta) });
    else if (outcome === 'blocked') notify(text('blocked'), { kind: 'error', action: { label: text('retry'), run: () => openTask(meta) } });
    else notify(text('draftFailed'), { kind: 'error', action: copyAction(meta) });
  }
  return { open: openTask, copy };
}

/** 交接记录在对话里显示成卡片：打开任务、复制交接说明、展开看全文。 */
export function registerHandoffView(ctx, kit, api) {
  const { React } = kit;
  const h = React.createElement;
  const text = (key, values) => format(ctx.locale.resolveText(handoffText[key]), values);
  const handoff = createHandoffOpener({
    check: api.checkSession, summary: api.sessionSummary, retain: api.retain, open: api.open,
    input: () => ctx.get('conversation')?.input, notify: api.notify, clipboard: () => globalThis.navigator?.clipboard, text,
  });
  function HandoffRow(props) {
    if (props.phase === 'preparing') return h('div', { className: 'ww-muted', 'data-tool': toolName }, text('preparing'));
    const value = readHandoff(props.block);
    if (value.state !== 'done') return h('div', { className: 'ww-muted', 'data-tool': toolName, 'data-state': value.state }, text(value.state, { title: value.title, message: value.message || text('errorUnknown') }));
    const { meta } = value;
    if (meta.started === true) return h(DispatchCard, { meta });
    return h('div', { className: 'ww-handoff', 'data-tool': toolName, 'data-state': 'done' }, h('style', null, handoffCss),
      h('div', { className: 'ww-row' },
        h('span', null, text('done', { expert: meta.expertName, title: meta.title })),
        h('button', { type: 'button', className: 'ww-icon-button', onClick: () => handoff.open(meta) }, text('open')),
        h('button', { type: 'button', className: 'ww-icon-button', onClick: () => handoff.copy(meta) }, text('copy'))),
      h('details', null, h('summary', null, text('draft')), ...meta.draft.split('\n').map(line => h('div', null, line || ' '))));
  }
  /**
   * 派出去直接开工的任务（2026-11-08 起）：进度从那个任务会话的投影里实时读，做完显示交付开头；按钮直接打开任务，
   * 不再往输入框放草稿。会话列表里还没有它时只写“已派给…”。
   */
  const openStarted = meta => {
    try { api.checkSession(meta.sessionId); if (api.showTask) api.showTask(meta.sessionId); else api.open(meta.sessionId); }
    catch (error) { api.notify(error.message, { kind: 'error' }); }
  };
  function DispatchCard({ meta }) {
    const live = React.useSyncExternalStore(api.subscribeSessions, () => api.dispatchStatus(meta.sessionId), () => null);
    const status = live?.status ?? 'unknown';
    const values = { expert: meta.expertName, title: meta.title };
    // 2026-11-08 第三版：只占一行，专家干活的过程和交付在专家团队页中间那栏看。
    const role = api.experts?.().experts.find(item => item.name === meta.expertName);
    const line = text(`dispatch_${status}`, values);
    return h('div', { className: 'ww-handoff', 'data-tool': toolName, 'data-state': 'started', 'data-status': status }, h('style', null, handoffCss),
      h('div', { className: 'ww-row' },
        role && kit.Avatar && h(kit.Avatar, { expert: role, size: 20 }),
        h('span', { role: 'status', title: line }, line),
        h('button', { type: 'button', className: 'ww-icon-button', onClick: () => openStarted(meta) }, text(status === 'waiting' ? 'approve' : 'open'))));
  }
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: toolName }, HandoffRow));
  registerExpertEditView(ctx, kit, api);
}

/** 小鲸建专家、改专家的记录：建好了谁、改了哪几项，带“到专家团队看看”。展示信息来自宿主记录的元数据。 */
export function readExpertEdit(block) {
  const settled = 'kind' in block;
  let args;
  try { args = JSON.parse((settled ? block.call?.argsRaw : block.argsRaw) ?? ''); } catch { args = undefined; }
  const name = typeof args?.name === 'string' ? args.name.trim() : '';
  if (!settled) return { state: 'running', name };
  if (block.error?.code === 'interrupted') return { state: 'stopped', name };
  const meta = block.meta;
  if (!block.isError && meta && typeof meta === 'object' && ['action', 'expertId', 'name'].every(key => typeof meta[key] === 'string' && meta[key]) && Array.isArray(meta.changed)) return { state: 'done', name, meta };
  const text = resultText(block);
  if (declined(text)) return { state: 'declined', name };
  return { state: 'error', name, message: firstLine(text).replace(/^\w*Error:\s*/, '') };
}

function registerExpertEditView(ctx, kit, api) {
  const { React } = kit;
  const h = React.createElement;
  const text = (key, values) => format(ctx.locale.resolveText(expertEditText[key]), values);
  function ExpertEditRow(props) {
    if (props.phase === 'preparing') return h('div', { className: 'ww-muted', 'data-tool': 'whalewing_expert_edit' }, text('saving'));
    const value = readExpertEdit(props.block);
    // 改专家时参数里可能没有名字，只说“正在保存专家…”。
    const state = value.state === 'running' && !value.name ? 'saving' : value.state;
    if (value.state !== 'done') return h('div', { className: 'ww-muted', 'data-tool': 'whalewing_expert_edit', 'data-state': value.state }, text(state, { name: value.name, message: value.message || ctx.locale.resolveText(handoffText.errorUnknown) }));
    const { meta } = value;
    const fields = meta.changed.filter(key => Object.hasOwn(expertEditText, key)).map(key => text(key)).join(text('separator'));
    return h('div', { className: 'ww-handoff', 'data-tool': 'whalewing_expert_edit', 'data-state': 'done' }, h('style', null, handoffCss),
      h('div', { className: 'ww-row' },
        h('span', null, meta.action === 'create' ? text('created', { name: meta.name }) : text('updated', { name: meta.name, fields })),
        h('button', { type: 'button', className: 'ww-icon-button', onClick: () => api.showExperts() }, text('view'))));
  }
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'whalewing_expert_edit' }, ExpertEditRow));
  // 给专家加定时任务的记录：加给了谁、叫什么，带“到定时任务看看”。
  function ExpertScheduleRow(props) {
    const block = props.block ?? {};
    const settled = 'kind' in block;
    const meta = block.meta;
    if (props.phase === 'preparing' || !settled) return h('div', { className: 'ww-muted', 'data-tool': 'whalewing_expert_schedule' }, text('scheduleRunning'));
    if (block.isError || !meta || typeof meta.expertName !== 'string' || typeof meta.title !== 'string') {
      const result = resultText(block);
      if (declined(result)) return h('div', { className: 'ww-muted', 'data-tool': 'whalewing_expert_schedule', 'data-state': 'declined' }, text('scheduleDeclined'));
      const reason = firstLine(result).replace(/^\w*Error:\s*/, '');
      return h('div', { className: 'ww-muted', 'data-tool': 'whalewing_expert_schedule', 'data-state': 'error' }, text('scheduleError', { message: reason || ctx.locale.resolveText(handoffText.errorUnknown) }));
    }
    return h('div', { className: 'ww-handoff', 'data-tool': 'whalewing_expert_schedule', 'data-state': 'done' }, h('style', null, handoffCss),
      h('div', { className: 'ww-row' },
        h('span', null, text('scheduleDone', { name: meta.expertName, title: meta.title })),
        h('button', { type: 'button', className: 'ww-icon-button', onClick: () => api.showAutomation() }, text('scheduleView'))));
  }
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'whalewing_expert_schedule' }, ExpertScheduleRow));
}
