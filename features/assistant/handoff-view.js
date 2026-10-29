import { handoffText } from './client-presentation.js';

// 与 handoff.js 的工具名一致；浏览器端不引入 Host 工具定义。
const toolName = 'whalewing_handoff';
// 卡片也出现在专家任务的对话里（鲸翼页面之外），自带样式；颜色直接取 DSH 变量，跟着员工的皮肤走。
const handoffCss = '.ww-handoff{display:flex;flex-direction:column;gap:8px;margin:6px 0;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13.5px;line-height:1.6}.ww-handoff>.ww-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.ww-handoff>.ww-row>span{flex:1;min-width:0;font-weight:500}.ww-handoff>.ww-row>button{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;font-weight:500;cursor:pointer}.ww-handoff>.ww-row>button:first-of-type{border-color:var(--dsw-alias-button-primary-fill,var(--dsw-alias-label-primary));background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-label-primary));color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-layer-1))}.ww-handoff details{color:var(--dsw-alias-label-secondary);font-size:13px}.ww-handoff summary{cursor:pointer}';
const format = (template, values = {}) => template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
const zhText = (key, values) => format(handoffText[key].zh, values);
const firstLine = value => value.split('\n').map(line => line.trim()).find(Boolean) ?? '';

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
  const text = (block.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n');
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
    return h('div', { className: 'ww-handoff', 'data-tool': toolName, 'data-state': 'done' }, h('style', null, handoffCss),
      h('div', { className: 'ww-row' },
        h('span', null, text('done', { expert: meta.expertName, title: meta.title })),
        h('button', { type: 'button', className: 'ww-icon-button', onClick: () => handoff.open(meta) }, text('open')),
        h('button', { type: 'button', className: 'ww-icon-button', onClick: () => handoff.copy(meta) }, text('copy'))),
      h('details', null, h('summary', null, text('draft')), ...meta.draft.split('\n').map(line => h('div', null, line || ' '))));
  }
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: toolName }, HandoffRow));
}
