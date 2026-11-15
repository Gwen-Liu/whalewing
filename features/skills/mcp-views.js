import { mcpCatalog, mcpCategories, composeServer, freeName } from './mcp-catalog.js';

// 技能中心页里“MCP”这一类：我的（按来源分三组）和发现（鲸翼精选）。页面外壳在 client.js。
// 0.2.2-rc.3.2 起（2026-11-15 用户选“方向三”）：员工加的存在 DSH 自己的配置里，插件包带的向 DSH 的 MCP 管理器登记；
// 状态是 DSH 实时报的，状态下面一行写原因；添加和编辑时可以先“试连一下”。
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const initial = name => [...String(name || '?')][0]?.toUpperCase() || '?';
const transportText = transport => transport === 'stdio' ? '本机程序' : '远程服务';
export { slugify, freeName } from './mcp-catalog.js';

/** DSH 报的状态 → 一句话、颜色、原因。now 用来算“几秒后重试”。 */
export function statusOf(server, now = Date.now()) {
  if (server.packOff) return { text: '包已停用', tone: 'muted', why: '所在的插件包停用了，这个 MCP 暂时不连' };
  switch (server.status) {
    case 'connected': return { text: `已连上 · ${server.toolCount ?? server.tools.length} 个工具`, tone: 'ok', why: '' };
    case 'connecting': return { text: server.attempt ? `正在连（第 ${server.attempt + 1} 次）` : '正在连', tone: 'muted', why: server.transport === 'stdio' ? '第一次用要先下载程序，可能要一两分钟' : '' };
    case 'retrying': {
      const wait = Math.max(0, Math.round(((server.nextRetryAt ?? now) - now) / 1000));
      return { text: wait ? `连不上 · ${wait} 秒后第 ${(server.attempt ?? 0) + 1} 次重试` : `连不上 · 正在第 ${(server.attempt ?? 0) + 1} 次重试`, tone: 'error', why: `${server.error ?? '对方没响应'}${server.maxAttempts ? `；DSH 最多试 ${server.maxAttempts} 次` : ''}` };
    }
    case 'waiting': return { text: '等密钥', tone: 'warn', why: '凭据库里还没有它要的密钥，补上后自己连上' };
    case 'failed': return { text: '连不上 · 已停止重试', tone: 'error', why: server.error ?? '核对地址和密钥后点“重新连接”' };
    case 'external': return { text: 'DSH 管', tone: 'muted', why: '写在 DSH 配置文件里的老式写法，鲸翼只读' };
    default: return { text: '已停用', tone: 'muted', why: '' };
  }
}
const needsAction = server => !server.packOff && ['waiting', 'retrying', 'failed'].includes(server.status);
const mine = server => server.source === 'mine' || server.source === 'dsh';
const others = server => server.source === 'plugin' || server.source === 'static';

export function createMcpViews(kit) {
  const { React, Drawer, Glyph, useDiscard } = kit;
  const { createElement: h, useState } = React;

  /** 我的 · MCP 的一行行（名字在 DSH 里唯一，直接当 key）。 */
  function mcpRows(data) { return data ? data.servers.map(server => ({ ...server, key: server.name })) : []; }
  const mcpMatches = (row, filter) => filter === 'all' || (filter === 'mine' ? mine(row) : filter === 'pack' ? row.source === 'pack' : filter === 'plugin' ? others(row) : filter === 'todo' ? needsAction(row) : true);
  function mcpFilters(data) {
    const rows = mcpRows(data);
    const count = id => rows.filter(row => mcpMatches(row, id)).length;
    return { rows, options: [['all', '全部'], ['mine', '我的 MCP'], ['pack', '插件包带的'], ['plugin', '其他插件带的'], ['todo', '要处理']].map(([id, label]) => ({ id, label, count: count(id) })).filter(option => ['all', 'mine'].includes(option.id) || option.count > 0), count };
  }

  /** 状态：上面一句（带颜色），下面一行原因。 */
  function State({ server }) {
    const status = statusOf(server);
    return h('span', { className: 'ww-kit-state' },
      h('span', { className: 'ww-kit-status', 'data-tone': status.tone, title: status.why || undefined }, status.tone === 'ok' ? h(React.Fragment, null, h(Glyph, { name: 'check', size: 14 }), ` ${status.text}`) : status.text),
      status.why && h('small', { className: 'ww-kit-why', title: status.why }, status.why));
  }

  function MineMcp({ data, packTitle = name => name, filter, query, sortDown, busy, onOpen, onDiscover, onDismiss }) {
    const rows = mcpRows(data);
    if (!data) return h('p', { className: 'ww-kit-empty', role: 'status' }, '正在读 MCP…');
    const notice = data.notice && h('div', { className: 'ww-notice ww-kit-moved', role: 'status' },
      h('p', null, `MCP 现在存在 DSH 自己的配置里：原来的 ${data.notice.moved + data.notice.adopted.length} 个已经搬过去，密钥也搬进了 DSH 凭据库，不用重填。卸载鲸翼后它们照样能用。`,
        data.notice.adopted.length > 0 && h('small', null, ` DSH 配置里本来就有同名的 ${data.notice.adopted.join('、')}，用的是 DSH 那条，只留了显示名称。`)),
      h('button', { type: 'button', disabled: busy, onClick: onDismiss }, '知道了'));
    const issue = !data.manager && h('p', { className: 'ww-notice ww-error', role: 'status' }, data.issue ?? 'DSH 的 MCP 管理器没有加载，MCP 暂时用不了');
    if (!rows.length) return h(React.Fragment, null, issue, notice, h('div', { className: 'ww-kit-empty', role: 'status' }, h('p', null, '还没有 MCP。MCP 让专家能读写外部软件里的东西，比如地图、飞书文档、录音卡的转写。'), h('button', { type: 'button', onClick: onDiscover }, '到“发现”里加')));
    const keyword = query.trim().toLowerCase();
    const shown = rows.filter(row => mcpMatches(row, filter) && (!keyword || `${row.title} ${row.name} ${row.target}`.toLowerCase().includes(keyword))).sort((a, b) => (sortDown ? -1 : 1) * a.title.localeCompare(b.title, 'zh'));
    const row = server => h('li', { key: server.key }, h('button', { type: 'button', className: 'ww-kit-row', disabled: busy, onClick: () => onOpen(server) },
      h('span', { className: 'ww-kit-icon', 'data-tone': server.source === 'pack' ? 'official' : others(server) ? 'builtin' : 'mine', 'aria-hidden': true }, initial(server.title)),
      h('span', { className: 'ww-kit-main' },
        h('span', { className: 'ww-kit-name' }, server.title, server.source === 'dsh' && h('span', { className: 'ww-tag', title: '写在 DSH 配置文件里的，鲸翼也能改' }, '配置文件里写的'), server.source === 'pack' && h('span', { className: 'ww-tag' }, packTitle(server.pack))),
        h('small', { title: server.target }, server.target || server.name)),
      h('span', { className: 'ww-kit-type' }, transportText(server.transport)),
      h(State, { server })));
    const groups = [
      ['我的 MCP', '存在 DSH 自己的配置里，卸载鲸翼也还在', shown.filter(mine)],
      ['插件包带的', '跟着插件包走：停用包就断开，卸载包就删掉', shown.filter(server => server.source === 'pack')],
      ['其他插件带的', '别的插件或 DSH 配置文件里老式写法的，这里只能看和重新连接', shown.filter(others)],
    ].filter(([, , list]) => list.length);
    return h(React.Fragment, null, issue, notice,
      shown.length ? h('div', { className: 'ww-kit-table', 'data-kind': 'mcp' },
        h('div', { className: 'ww-kit-thead', 'aria-hidden': true }, h('span', null, 'MCP'), h('span', null, '方式'), h('span', null, '状态')),
        ...groups.map(([title, note, list]) => h('section', { key: title, className: 'ww-kit-group', 'aria-label': title }, h('h3', null, title, h('small', null, `${list.length} 个 · ${note}`)), h('ul', null, ...list.map(row)))),
        !data.credentials && h('p', { className: 'ww-kit-note' }, 'DSH 的凭据库没有加载，带密钥的 MCP 暂时加不了。'),
        h('p', { className: 'ww-kit-note' }, '所有专家和小鲸都能用这里的工具；推荐给哪几位专家写在每个 MCP 的详情里。'))
      : h('p', { className: 'ww-kit-empty', role: 'status' }, '没有匹配的 MCP，换个词或筛选试试'));
  }

  /** 一项密钥：存没存、存在凭据库哪个名字下；没存或要换就在这里填，DSH 拿到就自己连。 */
  function Secret({ label, row, busy, onSave }) {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');
    const save = async () => { if (!value) return; await onSave(value); setOpen(false); setValue(''); };
    return h('div', { className: 'ww-kit-secret' },
      h('div', { className: 'ww-kit-main' }, h('strong', null, label), row.ref && h('small', { className: 'ww-kit-hint' }, `凭据库里的名字：${row.ref}`)),
      open ? h('span', { className: 'ww-kit-secret-edit' },
        h('input', { type: 'password', value, autoComplete: 'off', 'aria-label': `${label}的值`, placeholder: '粘贴密钥', disabled: busy, onChange: event => setValue(event.target.value), onKeyDown: event => { if (event.key === 'Enter') save(); } }),
        h('button', { type: 'button', disabled: busy, onClick: () => { setOpen(false); setValue(''); } }, '取消'),
        h('button', { type: 'button', className: 'ww-primary', disabled: busy || !value, onClick: save }, '保存'))
      : row.saved ? h('span', { className: 'ww-kit-secret-state' }, h('span', { className: 'ww-kit-hint' }, '已保存 ••••••'), onSave && h('button', { type: 'button', className: 'ww-kit-inline', disabled: busy, onClick: () => setOpen(true) }, '换一个'))
      : onSave ? h('button', { type: 'button', className: 'ww-primary', disabled: busy, onClick: () => setOpen(true) }, '填密钥') : h('span', { className: 'ww-kit-hint' }, '还没存'));
  }

  /** 点开一个 MCP：来源、方式、命令或地址、状态和原因、密钥、推荐给谁、工具；底部按来源给能做的事。 */
  function McpDrawer({ server, packTitle = name => name, busy, onClose, onEdit, onToggle, onReconnect, onRemove, onSecret, recommend = [] }) {
    const status = statusOf(server);
    const editable = server.editable;
    const canToggle = editable || server.source === 'pack';
    const canSecret = editable || server.source === 'pack';
    const live = server.enabled && !server.packOff && server.source !== 'static';
    const footer = [
      editable && h('button', { key: 'remove', type: 'button', className: 'ww-danger-text', disabled: busy, onClick: onRemove }, '删除'),
      canToggle && h('button', { key: 'toggle', type: 'button', disabled: busy, onClick: onToggle }, server.enabled ? '停用' : '启用'),
      live && h('button', { key: 'retry', type: 'button', disabled: busy, onClick: onReconnect }, '重新连接'),
      h('span', { key: 'gap', className: 'ww-grow' }),
      canToggle ? h('button', { key: 'edit', type: 'button', className: 'ww-primary', disabled: busy, onClick: onEdit }, '编辑') : h('button', { key: 'close', type: 'button', onClick: onClose }, '关闭'),
    ].filter(Boolean);
    const source = server.source === 'pack' ? `插件包 · ${packTitle(server.pack)}` : server.source === 'plugin' ? '别的插件登记的' : server.source === 'static' ? 'DSH 配置文件（老式写法）' : server.source === 'dsh' ? 'DSH 配置文件里写的' : '我加的';
    const where = server.source === 'pack' ? `跟着插件包「${packTitle(server.pack)}」走：停用包就断开，卸载包时一起删掉${server.packOff ? '；那个包现在停用了，所以没连' : ''}。`
      : server.source === 'plugin' ? '由别的插件登记，鲸翼不能改，只能看和重新连接。'
      : server.source === 'static' ? '写在 DSH 配置文件里的老式写法，鲸翼只读；要改请改配置文件。'
      : `存在 DSH 自己的配置里，卸载鲸翼也还在。${server.source === 'dsh' ? '它是写在 DSH 配置文件里的，鲸翼也能改。' : ''}`;
    const secrets = [
      ...(server.urlSecret ? [{ label: '地址（带密钥）', row: { ref: server.urlRef, saved: server.urlSaved }, field: { kind: 'url' } }] : []),
      ...server.env.filter(row => row.secret).map(row => ({ label: row.name, row, field: { kind: 'env', key: row.name } })),
      ...server.headers.filter(row => row.secret).map(row => ({ label: `请求头 ${row.name}`, row, field: { kind: 'header', key: row.name } })),
    ];
    const plain = (server.transport === 'stdio' ? server.env : server.headers).filter(row => !row.secret);
    return h(Drawer, { title: server.title, busy, onClose, footer },
      h('dl', { className: 'ww-kit-facts' },
        h('dt', null, '英文名'), h('dd', null, server.name, h('small', { className: 'ww-kit-hint' }, `  工具名是 mcp__${server.name}__…`)),
        h('dt', null, '来源'), h('dd', null, source),
        h('dt', null, '方式'), h('dd', null, transportText(server.transport)),
        server.source !== 'plugin' && h(React.Fragment, null, h('dt', null, server.transport === 'stdio' ? '命令' : '地址'), h('dd', null, h('code', null, server.target || '—'))),
        h('dt', null, '状态'), h('dd', null, h('span', { className: 'ww-kit-status', 'data-tone': status.tone }, status.text))),
      status.why && status.tone !== 'muted' && h('p', { className: `ww-notice${status.tone === 'error' ? ' ww-error' : ''}`, role: 'status' }, status.why),
      secrets.length > 0 && h(React.Fragment, null, h('h3', { className: 'ww-kit-subhead' }, '密钥'),
        ...secrets.map(item => h(Secret, { key: `${item.field.kind}:${item.field.key ?? ''}`, label: item.label, row: item.row, busy, onSave: canSecret && item.row.ref ? value => onSecret(item.field, value) : null })),
        h('p', { className: 'ww-kit-note' }, '密钥存在 DSH 自带的凭据库里，配置里只写“用凭据库里的哪个”；换了密钥 DSH 自己重连。')),
      plain.length > 0 && h(React.Fragment, null, h('h3', { className: 'ww-kit-subhead' }, server.transport === 'stdio' ? '环境变量' : '请求头'), h('pre', { className: 'ww-kit-content' }, plain.map(item => `${item.name}: ${item.value ?? ''}`).join('\n'))),
      // 适合哪几位专家用（2026-11-14 用户定：MCP 不按专家分、不强制绑，给推荐）。
      recommend.length > 0 && h(React.Fragment, null, h('h3', { className: 'ww-kit-subhead' }, '适合这几位专家用'),
        h('p', { className: 'ww-kit-rec' }, ...recommend.map(name => h('span', { key: name, className: 'ww-tag' }, name)), h('small', { className: 'ww-kit-hint' }, '做相关的活找他们最顺手；别的专家和小鲸也能用。'))),
      server.tools.length > 0 && h(React.Fragment, null, h('h3', { className: 'ww-kit-subhead' }, `工具（${server.tools.length}）`), h('ul', { className: 'ww-kit-paths' }, ...server.tools.map(tool => h('li', { key: tool }, tool)))),
      h('p', { className: 'ww-kit-note' }, where));
  }

  /** 一行键值（环境变量或请求头）：名字、值、勾不勾“密钥”。编辑时已保存的密钥留空表示不改。 */
  function Pairs({ label, rows, setRows, disabled }) {
    const change = (index, patch) => setRows(rows.map((row, at) => at === index ? { ...row, ...patch } : row));
    return h('fieldset', { className: 'ww-kit-pairs' }, h('legend', null, label),
      ...rows.map((row, index) => h('div', { key: index, className: 'ww-kit-pair' },
        h('input', { 'aria-label': `${label}名`, placeholder: '名字', value: row.name, disabled, onChange: event => change(index, { name: event.target.value }) }),
        h('input', { 'aria-label': `${label}值`, type: row.secret ? 'password' : 'text', placeholder: row.secret && row.saved ? '已保存，不改就留空' : row.secret && row.ref ? '还没存，填上' : '值', value: row.value ?? '', disabled, autoComplete: 'off', onChange: event => change(index, { value: event.target.value }) }),
        h('label', { className: 'ww-choice' }, h('input', { type: 'checkbox', checked: row.secret, disabled, onChange: event => change(index, { secret: event.target.checked, saved: false, ref: undefined }) }), '密钥'),
        h('button', { type: 'button', className: 'ww-icon-button', 'aria-label': `删掉这一行${label}`, disabled, onClick: () => setRows(rows.filter((_, at) => at !== index)) }, '×'))),
      h('button', { type: 'button', className: 'ww-kit-more', disabled, onClick: () => setRows([...rows, { name: '', value: '', secret: false }]) }, h(Glyph, { name: 'plus', size: 14 }), `加一行${label}`));
  }

  /** 试连的结果：连上了是谁、有哪些工具；没连上说原因。 */
  function ProbeResult({ probe }) {
    if (probe === 'running') return h('p', { className: 'ww-notice ww-kit-probe', role: 'status' }, '正在试连…只连一下看看，不会保存，也不会给专家用。');
    if (!probe) return null;
    if (!probe.ok) return h('p', { className: 'ww-notice ww-error ww-kit-probe', role: 'status' }, `连不上：${probe.error}`);
    const who = probe.server?.name ? `对方是「${probe.server.name}${probe.server.version ? ` ${probe.server.version}` : ''}」，` : '';
    return h('div', { className: 'ww-notice ww-kit-probe', role: 'status', 'data-tone': 'ok' },
      h('p', null, h('strong', null, '能连上'), `（${(probe.ms / 1000).toFixed(1)} 秒）：${who}有 ${probe.tools.length}${probe.truncated ? ' 个以上' : ' 个'}工具。`),
      probe.tools.length > 0 && h('p', { className: 'ww-kit-hint' }, probe.tools.slice(0, 20).join('、') + (probe.tools.length > 20 ? ' …' : '')));
  }

  /**
   * 添加或编辑 MCP 的右侧抽屉。从精选、官方目录加：只填它要的几项（密钥框是密码框），旁边是去哪申请；
   * 自定义和编辑：填完整的方式、地址或命令、请求头或环境变量，每个值可以标“密钥”。保存前可以先“试连一下”。
   */
  function McpEditor({ spec, taken, t, onClose, onSave, onProbe }) {
    const { item, server } = spec;
    const editing = Boolean(server);
    const [title, setTitle] = useState(server?.title ?? item?.name ?? '');
    const [name, setName] = useState(server?.name ?? (item ? freeName(item.id.split('/').at(-1), taken) : ''));
    const [values, setValues] = useState({});
    const [transport, setTransport] = useState(server?.transport ?? item?.transport ?? 'streamable-http');
    const [url, setUrl] = useState(server && !server.urlSecret ? server.url ?? '' : '');
    const [urlSecret, setUrlSecret] = useState(Boolean(server?.urlSecret));
    const [command, setCommand] = useState(server?.command ?? 'npx');
    const [args, setArgs] = useState((server?.args ?? []).join('\n'));
    const [env, setEnv] = useState((server?.env ?? []).map(row => ({ ...row, value: row.secret ? '' : row.value })));
    const [headers, setHeaders] = useState((server?.headers ?? []).map(row => ({ ...row, value: row.secret ? '' : row.value })));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [probe, setProbe] = useState(null);
    const touched = title !== (server?.title ?? item?.name ?? '') || Object.values(values).some(Boolean) || (!item && (url || args !== (server?.args ?? []).join('\n') || env.some(row => row.value) || headers.some(row => row.value)));
    const [requestClose, discard] = useDiscard({ dirty: Boolean(touched), onClose, busy });
    /** 照填的拼好要交给宿主的样子；缺东西就说缺什么。 */
    const compose = ({ forProbe = false } = {}) => {
      if (!forProbe && !title.trim()) return { error: '填一个显示名称' };
      if (!editing && !namePattern.test(name || (forProbe ? 'probe' : ''))) return { error: '英文名只能用小写字母、数字和单个短横线，最长 32 个字符' };
      if (!forProbe && !editing && taken.has(name)) return { error: `已经有叫「${name}」的 MCP 了，换一个英文名` };
      if (item && !editing) {
        const composed = composeServer(item, values, { name: name || 'probe', title: title.trim() || item.name });
        if (composed.missing) return { error: `还没填：${composed.missing.join('、')}` };
        return { payload: composed.server };
      }
      const rows = list => list.filter(row => row.name.trim()).map(row => ({ name: row.name.trim(), secret: row.secret, ...(row.value || !row.secret ? { value: row.value ?? '' } : {}) }));
      const payload = { name: name || 'probe', title: title.trim() || name || '试连', ...(server?.catalogId ? { catalogId: server.catalogId } : {}), transport, env: [], headers: [] };
      if (transport === 'stdio') Object.assign(payload, { command: command.trim(), args: args.split('\n').map(line => line.trim()).filter(Boolean), env: rows(env) });
      else Object.assign(payload, { url: url.trim(), urlSecret, headers: rows(headers) });
      if (transport === 'stdio' && !payload.command) return { error: '本机程序要填命令，比如 npx' };
      if (transport !== 'stdio' && !payload.url && !(editing && server.urlSecret && urlSecret)) return { error: '远程服务要填地址' };
      return { payload };
    };
    const save = async () => {
      setError('');
      const { payload, error: problem } = compose();
      if (problem) return setError(problem);
      setBusy(true);
      try { await onSave(payload, editing ? server.revision : null); } catch (reason) { setError(reason.message || '没保存成功'); } finally { setBusy(false); }
    };
    const tryIt = async () => {
      setError('');
      const { payload, error: problem } = compose({ forProbe: true });
      if (problem) return setError(problem);
      setBusy(true); setProbe('running');
      try { setProbe(await onProbe(payload)); } catch (reason) { setProbe(null); setError(reason.message || '没试成'); } finally { setBusy(false); }
    };
    const footer = [
      onProbe && h('button', { key: 'probe', type: 'button', disabled: busy, onClick: tryIt }, '试连一下'),
      h('span', { key: 'gap', className: 'ww-grow' }),
      h('button', { key: 'cancel', type: 'button', disabled: busy, onClick: requestClose }, t('cancelEdit')),
      h('button', { key: 'save', type: 'button', className: 'ww-primary', disabled: busy, onClick: save }, editing ? t('skillSaveChanges') : '添加'),
    ].filter(Boolean);
    const links = item && (item.keyUrl || item.docsUrl) && h('p', { className: 'ww-kit-links' }, item.keyUrl && h('a', { href: item.keyUrl, target: '_blank', rel: 'noreferrer' }, '去申请密钥', h(Glyph, { name: 'external', size: 13 })), item.docsUrl && h('a', { href: item.docsUrl, target: '_blank', rel: 'noreferrer' }, '官方说明', h(Glyph, { name: 'external', size: 13 })));
    return h(React.Fragment, null, h(Drawer, { title: editing ? `编辑 ${server.title}` : item ? `添加 ${item.name}` : '自定义 MCP', busy, onClose: requestClose, footer },
      item && !editing && h('p', { className: 'ww-kit-lead' }, item.description),
      links,
      item?.note && h('p', { className: 'ww-notice' }, item.note),
      h('label', null, '显示名称', h('input', { value: title, disabled: busy, maxLength: 40, onChange: event => setTitle(event.target.value) })),
      h('label', null, '英文名', h('input', { value: name, disabled: busy || editing, maxLength: 32, onChange: event => setName(event.target.value.toLowerCase()) }), h('small', null, editing ? '英文名定了就不能改，工具名跟着它' : '小写字母、数字、短横线；工具名会是 mcp__英文名__工具')),
      item && !editing ? item.fields.map(field => h('label', { key: field.id }, `${field.label}${field.required ? '' : '（可不填）'}`,
        h('input', { type: field.secret ? 'password' : 'text', value: values[field.id] ?? '', disabled: busy, autoComplete: 'off', onChange: event => setValues(current => ({ ...current, [field.id]: event.target.value })) }),
        field.help && h('small', null, field.help))).concat(item.fields.length ? [] : [h('p', { key: 'none', className: 'ww-kit-note' }, '不用填密钥，点“添加”就行。')])
      : h(React.Fragment, null,
        h('label', null, '方式', h('select', { value: transport, disabled: busy || editing, onChange: event => setTransport(event.target.value) }, h('option', { value: 'streamable-http' }, '远程服务（填地址）'), h('option', { value: 'stdio' }, '本机程序（填命令，如 npx）'))),
        transport === 'stdio' ? h(React.Fragment, null,
          h('label', null, '命令', h('input', { value: command, disabled: busy, onChange: event => setCommand(event.target.value) })),
          h('label', null, '参数（一行一个）', h('textarea', { value: args, disabled: busy, rows: 4, spellCheck: false, onChange: event => setArgs(event.target.value) })),
          h(Pairs, { label: '环境变量', rows: env, setRows: setEnv, disabled: busy }))
        : h(React.Fragment, null,
          h('label', null, '地址', h('input', { type: urlSecret ? 'password' : 'url', value: url, disabled: busy, placeholder: editing && server.urlSecret ? '已保存（带密钥），不改就留空' : 'https://…', autoComplete: 'off', onChange: event => setUrl(event.target.value) })),
          h('label', { className: 'ww-choice' }, h('input', { type: 'checkbox', checked: urlSecret, disabled: busy, onChange: event => setUrlSecret(event.target.checked) }), '地址里带着密钥（整条地址存进凭据库）'),
          h(Pairs, { label: '请求头', rows: headers, setRows: setHeaders, disabled: busy }))),
      h(ProbeResult, { probe }),
      error && h('p', { className: 'ww-notice ww-error', role: 'alert' }, error),
      h('p', { className: 'ww-kit-note' }, '保存后写进 DSH 自己的配置；标了“密钥”的值存进 DSH 凭据库，配置里只写“用凭据库里的哪个”，也不回显。')), discard);
  }

  /** 发现 · MCP：鲸翼精选按分类摆，搜索只筛精选；精选里没有的用“添加 → 自定义 MCP”。 */
  function DiscoverMcp({ query, filter, sortDown, added, busy, onOpen, onCustom, expertName = () => '' }) {
    const keyword = query.trim().toLowerCase();
    const order = list => [...list].sort((a, b) => (sortDown ? -1 : 1) * a.name.localeCompare(b.name, 'zh'));
    const card = item => {
      const has = added.has(item.id);
      // 推荐给谁只是建议（2026-11-14 用户定：MCP 不按专家分、不强制绑）；专家没读到或不在团队里的不写。
      const names = (item.experts ?? []).map(expertName).filter(Boolean);
      return h('li', { key: item.id }, h('button', { type: 'button', className: 'ww-kit-card', disabled: busy, onClick: () => onOpen(item), 'aria-label': `${item.name}${has ? '，已添加' : ''}` },
        h('span', { className: 'ww-kit-icon', 'data-tone': 'official', 'aria-hidden': true }, initial(item.name)),
        h('span', { className: 'ww-kit-main' }, h('span', { className: 'ww-kit-name' }, item.name), h('small', { title: item.description }, item.description || '没有说明'), names.length > 0 && h('small', { className: 'ww-kit-rec-line' }, `推荐给${names.join('、')}`), h('small', null, `${item.category} · ${transportText(item.transport)}`)),
        has ? h('span', { className: 'ww-tag' }, '已添加') : h('span', { className: 'ww-kit-add', 'aria-hidden': true }, h(Glyph, { name: 'plus', size: 16 }))));
    };
    const curated = mcpCatalog.filter(item => (filter === 'all' || item.category === filter) && (!keyword || `${item.name} ${item.description} ${item.id}`.toLowerCase().includes(keyword)));
    const shelves = (filter === 'all' ? mcpCategories : [filter]).map(category => {
      const list = curated.filter(item => item.category === category);
      return list.length > 0 && h('section', { key: category, className: 'ww-kit-shelf' }, h('header', null, h('h3', null, category, h('i', { className: 'ww-cloud', 'aria-hidden': true }))), h('ul', { className: 'ww-kit-cards' }, ...order(list).map(card)));
    });
    return h('div', { className: 'ww-kit-shelves' },
      ...shelves,
      !curated.length && h('div', { className: 'ww-kit-empty', role: 'status' }, h('p', null, '精选里没有匹配的 MCP。别的 MCP 可以照它的说明自己添加。'), onCustom && h('button', { type: 'button', disabled: busy, onClick: onCustom }, '自定义 MCP')),
      h('p', { className: 'ww-kit-note' }, '鲸翼精选是日常常用的 22 个，每个都在 DSH 上实测连通过；只能在浏览器里授权登录的暂时不收。精选里没有的，点“添加 → 自定义 MCP”照它的说明填。'));
  }

  return { MineMcp, McpDrawer, McpEditor, DiscoverMcp, mcpFilters, statusOf, needsAction };
}
