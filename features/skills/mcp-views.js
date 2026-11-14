import { mcpCatalog, mcpCategories, composeServer, freeName } from './mcp-catalog.js';

// 技能中心页里“MCP”这一类：我的（鲸翼加的、DSH 配置文件里的）和发现（鲸翼精选）。页面外壳在 client.js。
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const initial = name => [...String(name || '?')][0]?.toUpperCase() || '?';
const transportText = transport => transport === 'stdio' ? '本机程序' : '远程服务';
export { slugify, freeName } from './mcp-catalog.js';

export function createMcpViews(kit) {
  const { React, Drawer, Glyph, useDiscard } = kit;
  const { createElement: h, useState } = React;

  function statusOf(server) {
    if (server.packOff) return { text: '包已停用', tone: 'muted', title: '所在的插件包停用了，这个 MCP 暂时不连' };
    if (server.profile) return { text: server.enabled ? 'DSH 管' : '已关闭', tone: 'muted', title: '写在 DSH 配置文件里，鲸翼只读；要改请改配置文件' };
    if (server.status === 'connected') return { text: `${server.tools.length} 个工具`, tone: 'ok', title: '已连上' };
    if (server.status === 'connecting') return { text: '正在连', tone: 'muted' };
    if (server.status === 'disabled') return { text: '已断开', tone: 'muted' };
    return { text: '连不上', tone: 'error', title: server.error };
  }
  /** 我的 · MCP 的一行行：鲸翼加的在前，DSH 配置文件里的标“DSH 配置”在后。 */
  function mcpRows(data) {
    if (!data) return [];
    return [...data.servers.map(server => ({ ...server, key: `ww:${server.name}` })), ...data.profile.map(server => ({ ...server, key: `dsh:${server.name}`, title: server.name, profile: true, env: [], headers: [], tools: [] }))];
  }
  const mcpMatches = (row, filter) => filter === 'all' || (filter === 'mine' ? !row.profile && !row.pack : filter === 'pack' ? Boolean(row.pack) : filter === 'profile' ? row.profile : filter === 'failed' ? row.status === 'failed' : true);
  function mcpFilters(data) {
    const rows = mcpRows(data);
    const count = id => rows.filter(row => mcpMatches(row, id)).length;
    return { rows, options: [['all', '全部'], ['mine', '鲸翼添加'], ['pack', '插件包带的'], ['profile', 'DSH 配置'], ['failed', '连不上']].map(([id, label]) => ({ id, label, count: count(id) })).filter(option => ['all', 'mine'].includes(option.id) || option.count > 0), count };
  }

  function MineMcp({ data, packTitle = name => name, filter, query, sortDown, busy, onOpen, onDiscover }) {
    const rows = mcpRows(data);
    if (!data) return h('p', { className: 'ww-kit-empty', role: 'status' }, '正在读 MCP…');
    if (!rows.length) return h('div', { className: 'ww-kit-empty', role: 'status' }, h('p', null, '还没有 MCP。MCP 让专家能读写外部软件里的东西，比如地图、飞书文档、录音卡的转写。'), h('button', { type: 'button', onClick: onDiscover }, '到“发现”里加'));
    const keyword = query.trim().toLowerCase();
    const shown = rows.filter(row => mcpMatches(row, filter) && (!keyword || `${row.title} ${row.name} ${row.target}`.toLowerCase().includes(keyword))).sort((a, b) => (sortDown ? -1 : 1) * a.title.localeCompare(b.title, 'zh'));
    if (!shown.length) return h('p', { className: 'ww-kit-empty', role: 'status' }, '没有匹配的 MCP，换个词或筛选试试');
    const row = server => {
      const status = statusOf(server);
      return h('li', { key: server.key }, h('button', { type: 'button', className: 'ww-kit-row', disabled: busy, onClick: () => onOpen(server) },
        h('span', { className: 'ww-kit-icon', 'data-tone': server.profile ? 'builtin' : 'mine', 'aria-hidden': true }, initial(server.title)),
        h('span', { className: 'ww-kit-main' }, h('span', { className: 'ww-kit-name' }, server.title), h('small', { title: server.target }, server.target || server.name)),
        h('span', { className: 'ww-kit-type', title: server.pack ? `随插件包「${packTitle(server.pack)}」装上` : undefined }, server.profile ? `DSH 配置 · ${transportText(server.transport)}` : server.pack ? `插件包 · ${packTitle(server.pack)}` : transportText(server.transport)),
        h('span', { className: 'ww-kit-status', 'data-tone': status.tone, title: status.title }, status.tone === 'ok' ? h(React.Fragment, null, h(Glyph, { name: 'check', size: 14 }), ` ${status.text}`) : status.text)));
    };
    return h('div', { className: 'ww-kit-table' },
      h('div', { className: 'ww-kit-thead', 'aria-hidden': true }, h('span', null, 'MCP'), h('span', null, '方式'), h('span', null, '状态')),
      h('section', { className: 'ww-kit-group' }, h('ul', null, ...shown.map(row))),
      !data.credentials && h('p', { className: 'ww-kit-note' }, 'DSH 的凭据库没有加载，带密钥的 MCP 暂时加不了。'));
  }

  /** 点开一个 MCP：方式、命令或地址（密钥一律圆点）、工具、最近的问题；底部删除、断开或连接、重新连接、编辑。 */
  function McpDrawer({ server, packTitle = name => name, busy, onClose, onEdit, onToggle, onReconnect, onRemove, recommend = [] }) {
    const status = statusOf(server);
    const pairs = list => list.map(item => `${item.name}: ${item.secret ? '••••••（已保存）' : item.value}`).join('\n');
    const footer = server.profile ? [h('span', { key: 'gap', className: 'ww-grow' }), h('button', { key: 'close', type: 'button', onClick: onClose }, '关闭')] : [
      h('button', { key: 'remove', type: 'button', className: 'ww-danger-text', disabled: busy, onClick: onRemove }, '删除'),
      h('button', { key: 'toggle', type: 'button', disabled: busy, onClick: onToggle }, server.enabled ? '断开' : '连接'),
      server.status === 'failed' && h('button', { key: 'retry', type: 'button', disabled: busy, onClick: onReconnect }, '重新连接'),
      h('span', { key: 'gap', className: 'ww-grow' }),
      h('button', { key: 'edit', type: 'button', className: 'ww-primary', disabled: busy, onClick: onEdit }, '编辑'),
    ].filter(Boolean);
    return h(Drawer, { title: server.title, busy, onClose, footer },
      h('dl', { className: 'ww-kit-facts' },
        h('dt', null, '英文名'), h('dd', null, server.name, h('small', { className: 'ww-kit-hint' }, `  工具名是 mcp__${server.name}__…`)),
        h('dt', null, '方式'), h('dd', null, transportText(server.transport)),
        h('dt', null, server.transport === 'stdio' ? '命令' : '地址'), h('dd', null, h('code', null, server.target || '—')),
        h('dt', null, '状态'), h('dd', null, server.profile ? status.title : status.tone === 'ok' ? `已连上，${status.text}` : status.text)),
      // 适合哪几位专家用（2026-11-14 用户定：MCP 不按专家分、不强制绑，给推荐）。现在的 DSH 列不出 MCP 归属，
      // 专家不按绑定过滤，所有专家和小鲸都能用，所以只是提示做相关的活找谁，不放“绑定”按钮。
      recommend.length > 0 && h(React.Fragment, null, h('h3', { className: 'ww-kit-subhead' }, '适合这几位专家用'),
        h('p', { className: 'ww-kit-rec' }, ...recommend.map(name => h('span', { key: name, className: 'ww-tag' }, name)), h('small', { className: 'ww-kit-hint' }, '做相关的活找他们最顺手；别的专家和小鲸也能用。'))),
      server.profile && h('p', { className: 'ww-notice' }, '这个 MCP 写在 DSH 的配置文件里，鲸翼只读；所有专家和小鲸都能用它的工具。'),
      server.pack && h('p', { className: 'ww-notice', role: 'status' }, `这个 MCP 随插件包「${packTitle(server.pack)}」装上${server.packOff ? '；那个包停用了，所以没连' : ''}；卸载那个包时会一起删掉。`),
      server.error && h('p', { className: 'ww-notice ww-error', role: 'status' }, server.error),
      (server.env.length > 0 || server.headers.length > 0) && h(React.Fragment, null, h('h3', { className: 'ww-kit-subhead' }, server.transport === 'stdio' ? '环境变量' : '请求头'), h('pre', { className: 'ww-kit-content' }, pairs(server.transport === 'stdio' ? server.env : server.headers))),
      server.tools.length > 0 && h(React.Fragment, null, h('h3', { className: 'ww-kit-subhead' }, `工具（${server.tools.length}）`), h('ul', { className: 'ww-kit-paths' }, ...server.tools.map(tool => h('li', { key: tool }, tool)))),
      !server.profile && h('p', { className: 'ww-kit-note' }, '密钥存在 DSH 自带的凭据库里，鲸翼的设置里只记“这里有个密钥”。所有专家和小鲸都能用这里的工具。'));
  }

  /** 一行键值（环境变量或请求头）：名字、值、勾不勾“密钥”。编辑时已保存的密钥留空表示不改。 */
  function Pairs({ label, rows, setRows, disabled }) {
    const change = (index, patch) => setRows(rows.map((row, at) => at === index ? { ...row, ...patch } : row));
    return h('fieldset', { className: 'ww-kit-pairs' }, h('legend', null, label),
      ...rows.map((row, index) => h('div', { key: index, className: 'ww-kit-pair' },
        h('input', { 'aria-label': `${label}名`, placeholder: '名字', value: row.name, disabled, onChange: event => change(index, { name: event.target.value }) }),
        h('input', { 'aria-label': `${label}值`, type: row.secret ? 'password' : 'text', placeholder: row.secret && row.saved ? '已保存，不改就留空' : '值', value: row.value ?? '', disabled, autoComplete: 'off', onChange: event => change(index, { value: event.target.value }) }),
        h('label', { className: 'ww-choice' }, h('input', { type: 'checkbox', checked: row.secret, disabled, onChange: event => change(index, { secret: event.target.checked, saved: false }) }), '密钥'),
        h('button', { type: 'button', className: 'ww-icon-button', 'aria-label': `删掉这一行${label}`, disabled, onClick: () => setRows(rows.filter((_, at) => at !== index)) }, '×'))),
      h('button', { type: 'button', className: 'ww-kit-more', disabled, onClick: () => setRows([...rows, { name: '', value: '', secret: false }]) }, h(Glyph, { name: 'plus', size: 14 }), `加一行${label}`));
  }

  /**
   * 添加或编辑 MCP 的右侧抽屉。从精选、官方目录加：只填它要的几项（密钥框是密码框），旁边是去哪申请；
   * 自定义和编辑：填完整的方式、地址或命令、请求头或环境变量，每个值可以标“密钥”。
   */
  function McpEditor({ spec, taken, t, onClose, onSave }) {
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
    const [env, setEnv] = useState((server?.env ?? []).map(row => ({ ...row, saved: row.secret, value: row.secret ? '' : row.value })));
    const [headers, setHeaders] = useState((server?.headers ?? []).map(row => ({ ...row, saved: row.secret, value: row.secret ? '' : row.value })));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const touched = title !== (server?.title ?? item?.name ?? '') || Object.values(values).some(Boolean) || (!item && (url || args !== (server?.args ?? []).join('\n') || env.some(row => row.value) || headers.some(row => row.value)));
    const [requestClose, discard] = useDiscard({ dirty: Boolean(touched), onClose, busy });
    const save = async () => {
      setError('');
      if (!title.trim()) return setError('填一个显示名称');
      if (!namePattern.test(name) || name.length > 32) return setError('英文名只能用小写字母、数字和单个短横线，最长 32 个字符');
      if (!editing && taken.has(name)) return setError(`已经有叫「${name}」的 MCP 了，换一个英文名`);
      let payload;
      if (item && !editing) {
        const composed = composeServer(item, values, { name, title: title.trim() });
        if (composed.missing) return setError(`还没填：${composed.missing.join('、')}`);
        payload = composed.server;
      } else {
        const rows = list => list.filter(row => row.name.trim()).map(row => ({ name: row.name.trim(), secret: row.secret, ...(row.value || !row.secret ? { value: row.value ?? '' } : {}) }));
        payload = { name, title: title.trim(), ...(server?.catalogId ? { catalogId: server.catalogId } : {}), transport, env: [], headers: [] };
        if (transport === 'stdio') Object.assign(payload, { command: command.trim(), args: args.split('\n').map(line => line.trim()).filter(Boolean), env: rows(env) });
        else Object.assign(payload, { url: url.trim(), urlSecret, headers: rows(headers) });
        if (transport === 'stdio' && !payload.command) return setError('本机程序要填命令，比如 npx');
        if (transport !== 'stdio' && !payload.url && !(editing && server.urlSecret && urlSecret)) return setError('远程服务要填地址');
      }
      setBusy(true);
      try { await onSave(payload, editing ? server.revision : null); } catch (reason) { setError(reason.message || '没保存成功'); } finally { setBusy(false); }
    };
    const footer = [
      h('button', { key: 'cancel', type: 'button', disabled: busy, onClick: requestClose }, t('cancelEdit')),
      h('button', { key: 'save', type: 'button', className: 'ww-primary', disabled: busy, onClick: save }, editing ? t('skillSaveChanges') : '添加'),
    ];
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
      error && h('p', { className: 'ww-notice ww-error', role: 'alert' }, error),
      h('p', { className: 'ww-kit-note' }, '标了“密钥”的值存进 DSH 自带的凭据库，不写进配置文件，也不回显。')), discard);
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

  return { MineMcp, McpDrawer, McpEditor, DiscoverMcp, mcpFilters, statusOf };
}
