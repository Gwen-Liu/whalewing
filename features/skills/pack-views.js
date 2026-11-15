// 技能中心页里“插件”这一类（2026-11-09 用户定，照 Claude 的插件包）：我的（装好的插件包）和发现（鲸翼精选、Anthropic 的插件包市场、自己加的市场）。
// 一个插件包 = 一组技能 + 一组 MCP；DSH 自己的程序插件（鲸翼本身、终端等）不在这里列，到 DSH 的插件页管。页面外壳在 client.js。
import { statusOf } from './mcp-views.js';

const initial = name => [...String(name || '?').replace(/^[^\p{L}\p{N}]+/u, '')][0]?.toUpperCase() || '?';
const transportText = transport => transport === 'stdio' ? '本机程序' : '远程服务';
const dateText = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const repoUrl = source => source?.repo ? `https://github.com/${source.repo}${source.path ? `/tree/${source.ref || 'HEAD'}/${source.path}` : ''}` : '';

/** DSH 的插件页导航：只用来提供“打开 DSH 插件页”的入口；DSH 没有时就不显示。 */
export function createNavigation(ctx) {
  const state = { navigation: undefined };
  ctx.inject(['pluginNavigation'], scope => { state.navigation = scope.pluginNavigation; scope.effect(() => () => { state.navigation = undefined; }); });
  return state;
}

export function createPackViews(kit) {
  const { React, Drawer, Glyph, useDiscard } = kit;
  const { createElement: h, useState } = React;

  const sourceText = pack => pack.source?.label || '上传';
  const sourceDetail = pack => pack.source?.kind === 'upload' && pack.source.entry ? `上传（${pack.source.entry}）` : sourceText(pack);
  const matches = (pack, filter) => filter === 'all' || (filter === 'on' ? pack.enabled : filter === 'off' ? !pack.enabled : filter === 'curated' ? pack.source?.kind === 'curated' : filter === 'market' ? pack.source?.kind === 'market' : pack.source?.kind === 'upload');
  function packFilters(packs) {
    const list = packs ?? [];
    const count = id => list.filter(pack => matches(pack, id)).length;
    return { options: [['all', '全部'], ['on', '开着'], ['off', '已停用'], ['curated', '鲸翼精选'], ['market', '插件包市场'], ['upload', '上传的']].map(([id, label]) => ({ id, label, count: count(id) })).filter(option => option.id === 'all' || option.count > 0), count };
  }

  function MinePacks({ packs, filter, query, sortDown, busy, onOpen, onDiscover, onOpenDsh }) {
    if (!packs) return h('p', { className: 'ww-kit-empty', role: 'status' }, '正在读插件包…');
    const dshNote = h('p', { className: 'ww-kit-note' }, 'DSH 自己的程序插件（鲸翼本身、终端、语音输入等）在 DSH 左侧的“插件”页管理。', onOpenDsh && h('button', { type: 'button', className: 'ww-kit-inline', onClick: onOpenDsh }, '打开 DSH 插件页'));
    if (!packs.length) return h('div', { className: 'ww-kit-empty', role: 'status' }, h('p', null, '还没有插件包。插件包把一组技能和 MCP 按场景打好包，装一个就能用，也能一起停用和卸载。'), h('button', { type: 'button', onClick: onDiscover }, '到“发现”里看看'), dshNote);
    const keyword = query.trim().toLowerCase();
    const shown = packs.filter(pack => matches(pack, filter) && (!keyword || `${pack.title} ${pack.name} ${pack.description} ${pack.skills.map(skill => skill.name).join(' ')}`.toLowerCase().includes(keyword))).sort((a, b) => (sortDown ? -1 : 1) * a.title.localeCompare(b.title, 'zh'));
    if (!shown.length) return h('p', { className: 'ww-kit-empty', role: 'status' }, '没有匹配的插件包，换个词或筛选试试');
    const row = pack => h('li', { key: pack.name }, h('button', { type: 'button', className: 'ww-kit-row', disabled: busy, onClick: () => onOpen(pack) },
      h('span', { className: 'ww-kit-icon', 'data-tone': pack.source?.kind === 'curated' ? 'official' : 'market', 'aria-hidden': true }, initial(pack.title)),
      h('span', { className: 'ww-kit-main' }, h('span', { className: 'ww-kit-name' }, pack.title), h('small', { title: pack.description }, [`${pack.skills.length} 项技能 · ${pack.mcp.length} 个 MCP`, pack.description].filter(Boolean).join(' · '))),
      h('span', { className: 'ww-kit-type' }, sourceText(pack)),
      h('span', { className: 'ww-kit-status', 'data-tone': pack.enabled ? 'ok' : 'muted', title: pack.enabled ? '开着' : '已停用' }, pack.enabled ? h(Glyph, { name: 'check', size: 16 }) : '已停用')));
    return h('div', { className: 'ww-kit-table' },
      h('div', { className: 'ww-kit-thead', 'aria-hidden': true }, h('span', null, '插件包'), h('span', null, '来源'), h('span', null, '状态')),
      h('section', { className: 'ww-kit-group' }, h('ul', null, ...shown.map(row))),
      dshNote);
  }

  /** 一个 MCP 现在的状态，写成一小段字。 */
  function mcpState(server) {
    if (!server) return { text: '找不到了（可能在 MCP 页删了）', tone: 'muted' };
    // 和 MCP 页同一套说法（DSH 报的状态）；这里地方小，不写原因那一行。
    const status = statusOf(server);
    return { text: status.tone === 'error' && server.error ? `${status.text}：${server.error}` : status.text, tone: status.tone };
  }

  /** 装好的插件包：从哪来、里面的技能和 MCP（带连接状态）、没装的部分；底部卸载、停用或启用。 */
  function PackDrawer({ pack, servers, busy, onClose, onToggle, onRemove, onSkill, onMcp }) {
    const footer = [
      h('button', { key: 'remove', type: 'button', className: 'ww-danger-text', disabled: busy, onClick: onRemove }, '卸载'),
      h('button', { key: 'toggle', type: 'button', disabled: busy, onClick: onToggle }, pack.enabled ? '停用' : '启用'),
      h('span', { key: 'gap', className: 'ww-grow' }),
      pack.homepage && h('a', { key: 'home', className: 'ww-kit-link', href: pack.homepage, target: '_blank', rel: 'noreferrer' }, '主页', h(Glyph, { name: 'external', size: 14 })),
    ].filter(Boolean);
    return h(Drawer, { title: pack.title, busy, onClose, footer },
      pack.description && h('p', { className: 'ww-kit-lead' }, pack.description),
      h('dl', { className: 'ww-kit-facts' },
        h('dt', null, '来源'), h('dd', null, sourceDetail(pack), repoUrl(pack.source) && h('a', { href: repoUrl(pack.source), target: '_blank', rel: 'noreferrer' }, pack.source.repo)),
        pack.author && h(React.Fragment, null, h('dt', null, '作者'), h('dd', null, pack.author)),
        pack.version && h(React.Fragment, null, h('dt', null, '版本'), h('dd', null, pack.version)),
        h('dt', null, '安装'), h('dd', null, dateText(pack.installedAt) || '—'),
        h('dt', null, '状态'), h('dd', null, pack.enabled ? '开着' : '已停用')),
      !pack.enabled && h('p', { className: 'ww-notice', role: 'status' }, '这个包停用了：里面的技能专家用不到，MCP 也断开了。点“启用”恢复。'),
      h('h3', { className: 'ww-kit-subhead' }, `技能（${pack.skills.length}）`),
      pack.skills.length ? h('ul', { className: 'ww-kit-items' }, ...pack.skills.map(skill => h('li', { key: skill.name }, h('button', { type: 'button', disabled: busy, onClick: () => onSkill(skill) }, h('strong', null, skill.name), h('small', null, skill.description))))) : h('p', { className: 'ww-kit-note' }, '这个包没有技能。'),
      h('h3', { className: 'ww-kit-subhead' }, `MCP（${pack.mcp.length}）`),
      pack.mcp.length ? h('ul', { className: 'ww-kit-items' }, ...pack.mcp.map(item => {
        const server = servers?.find(entry => entry.name === item.server);
        const state = servers ? mcpState(server) : { text: '正在读…', tone: 'muted' };
        return h('li', { key: item.server }, h('button', { type: 'button', disabled: busy || !server, onClick: () => onMcp(server) }, h('strong', null, server?.title ?? item.key), h('small', { 'data-tone': state.tone }, state.text)));
      })) : h('p', { className: 'ww-kit-note' }, '这个包没有装 MCP。'),
      pack.skippedMcp.length > 0 && h(React.Fragment, null, h('h3', { className: 'ww-kit-subhead' }, '没装的 MCP'), h('ul', { className: 'ww-kit-paths' }, ...pack.skippedMcp.map(item => h('li', { key: item.key }, `${item.key}：${item.reason}`)))),
      h('p', { className: 'ww-kit-note' }, '包里的技能只读，和个人技能一起出现在“技能”里；MCP 的密钥在“MCP”里改。卸载会把这个包的技能和 MCP（连同凭据库里的密钥）一起删掉。'));
  }

  /** 发现 · 插件：每个市场一栏，卡片两列；装不了的标原因。 */
  function DiscoverPacks({ markets, installed, filter, query, sortDown, busy, onOpen, onRefresh, onRemoveMarket }) {
    const [expanded, setExpanded] = useState('');
    if (!markets) return h('p', { className: 'ww-kit-empty', role: 'status' }, '正在读插件包市场…');
    const keyword = query.trim().toLowerCase();
    // 市场主人自己的包排在前面（比如 Anthropic 市场里 Anthropic 自己做的），合作方的在后；各自按名称排。
    const order = list => [...list].sort((a, b) => Number(Boolean(b.own)) - Number(Boolean(a.own)) || (sortDown ? -1 : 1) * a.title.localeCompare(b.title, 'zh'));
    const card = entry => {
      const has = installed.has(entry.name);
      return h('li', { key: entry.id }, h('button', { type: 'button', className: 'ww-kit-card', disabled: busy, onClick: () => onOpen(entry), 'aria-label': `${entry.title}${has ? '，已安装' : ''}` },
        h('span', { className: 'ww-kit-icon', 'data-tone': entry.market === 'whalewing' ? 'official' : 'market', 'aria-hidden': true }, initial(entry.title)),
        h('span', { className: 'ww-kit-main' }, h('span', { className: 'ww-kit-name' }, entry.title), h('small', { title: entry.description }, entry.description || '没有说明'), h('small', null, [entry.author, entry.category].filter(Boolean).join(' · ') || entry.name)),
        has ? h('span', { className: 'ww-tag' }, '已安装') : h('span', { className: 'ww-kit-add', 'aria-hidden': true }, h(Glyph, { name: 'plus', size: 16 }))));
    };
    const shelves = markets.filter(market => filter === 'all' || market.id === filter).map(market => {
      // DSH 装不了的包（放在 GitHub 以外、要用命令行装的）不列。
      const list = order(market.entries.filter(entry => entry.installable && (!keyword || `${entry.title} ${entry.name} ${entry.description} ${entry.category}`.toLowerCase().includes(keyword))));
      if (keyword && !list.length && !market.loading) return null;
      const all = expanded === market.id || Boolean(keyword);
      return h('section', { key: market.id, className: 'ww-kit-shelf' },
        h('header', null,
          h('h3', null, market.title, market.id === 'whalewing' && h('i', { className: 'ww-cloud', 'aria-hidden': true }), market.repo && h('a', { className: 'ww-kit-hint', href: `https://github.com/${market.repo}`, target: '_blank', rel: 'noreferrer' }, market.repo)),
          h('span', { className: 'ww-kit-shelf-actions' },
            market.removable && h('button', { type: 'button', className: 'ww-kit-more', disabled: busy, onClick: () => onRemoveMarket(market) }, '移除'),
            !keyword && list.length > 6 && h('button', { type: 'button', className: 'ww-kit-more', onClick: () => setExpanded(all ? '' : market.id) }, all ? '收起' : `显示全部 ${list.length} 项`, h(Glyph, { name: all ? 'back' : 'chevron', size: 14 })))),
        market.loading ? h('p', { className: 'ww-kit-note', role: 'status' }, market.repo ? `正在从 GitHub 读 ${market.repo}…` : '正在读…')
          : market.issue ? h('div', { className: 'ww-kit-note', role: 'status' }, market.issue, h('button', { type: 'button', className: 'ww-kit-inline', disabled: busy, onClick: () => onRefresh(market) }, '重新读取'))
          : list.length ? h('ul', { className: 'ww-kit-cards' }, ...(all ? list : list.slice(0, 6)).map(card)) : h('p', { className: 'ww-kit-note' }, '这个市场里还没有包。'));
    }).filter(Boolean);
    return h('div', { className: 'ww-kit-shelves' },
      ...(shelves.length ? shelves : [h('p', { key: 'none', className: 'ww-kit-empty', role: 'status' }, '没有匹配的插件包，换个词试试')]),
      h('p', { className: 'ww-kit-note' }, '插件包由各自的作者维护，装之前先看清楚里面有哪些技能和 MCP。别的插件包可以上传 .zip，或在“添加”里加 GitHub 上的插件包市场；DSH 连不上的 MCP，安装时会标出来。'));
  }

  /**
   * 装之前的预览：包里的技能（标出同名的）、MCP（每个可勾选，要填的项就地填，连不了的标原因），
   * 以及 DSH 用不上、会跳过的部分。安装只装这一份。
   */
  function PackPreview({ entry, preview, busy, onClose, onInstall }) {
    const [picked, setPicked] = useState(() => Object.fromEntries((preview?.mcp ?? []).map(item => [item.key, item.ready])));
    const [values, setValues] = useState({});
    const [error, setError] = useState('');
    const touched = Object.values(values).some(group => Object.values(group).some(Boolean));
    const [requestClose, discard] = useDiscard({ dirty: touched, onClose, busy });
    const title = preview?.title || entry?.title || '插件包';
    if (!preview) return h(Drawer, { title, busy: true, onClose }, h('p', { className: 'ww-kit-empty', role: 'status' }, '正在下载和读取这个插件包…'));
    const usable = preview.mcp.filter(item => !item.blocked);
    const nothing = !preview.skills.length && !usable.length;
    const install = () => {
      setError('');
      const chosen = usable.filter(item => picked[item.key]);
      for (const item of chosen) {
        const missing = item.fields.filter(field => field.required && !String(values[item.key]?.[field.id] ?? '').trim()).map(field => field.label);
        if (missing.length) return setError(`MCP「${item.title}」还没填：${missing.join('、')}；不想现在填就取消勾选它`);
      }
      onInstall(chosen.map(item => ({ key: item.key, values: values[item.key] ?? {} }))).catch(reason => setError(reason.message || '没装上'));
    };
    const footer = [
      preview.homepage && h('a', { key: 'home', className: 'ww-kit-link', href: preview.homepage, target: '_blank', rel: 'noreferrer' }, '主页', h(Glyph, { name: 'external', size: 14 })),
      h('span', { key: 'gap', className: 'ww-grow' }),
      h('button', { key: 'cancel', type: 'button', disabled: busy, onClick: requestClose }, '取消'),
      h('button', { key: 'install', type: 'button', className: 'ww-primary', disabled: busy || preview.installed || nothing, onClick: install }, preview.installed ? '已安装' : busy ? '正在装…' : '安装'),
    ].filter(Boolean);
    const conflicts = preview.skills.filter(skill => skill.conflict);
    return h(React.Fragment, null, h(Drawer, { title, busy, onClose: requestClose, footer },
      preview.description && h('p', { className: 'ww-kit-lead' }, preview.description),
      h('dl', { className: 'ww-kit-facts' },
        h('dt', null, '来源'), h('dd', null, sourceDetail(preview), repoUrl(preview.source) && h('a', { href: repoUrl(preview.source), target: '_blank', rel: 'noreferrer' }, preview.source.repo)),
        preview.author && h(React.Fragment, null, h('dt', null, '作者'), h('dd', null, preview.author)),
        preview.version && h(React.Fragment, null, h('dt', null, '版本'), h('dd', null, preview.version))),
      preview.installed && h('p', { className: 'ww-notice', role: 'status' }, '已经装了这个包；要换成这一份，先在“我的”里卸载原来那个。'),
      nothing && h('p', { className: 'ww-notice ww-warn', role: 'status' }, '这个包里没有 DSH 能用的技能或 MCP，装了也用不上。'),
      preview.skills.length > 0 && h(React.Fragment, null, h('h3', { className: 'ww-kit-subhead' }, `技能（${preview.skills.length}）`),
        h('ul', { className: 'ww-kit-items' }, ...preview.skills.map(skill => h('li', { key: skill.name }, h('div', null, h('strong', null, skill.name, skill.conflict && h('span', { className: 'ww-tag ww-tag-warn' }, '同名')), h('small', null, skill.description)))))),
      conflicts.length > 0 && h('p', { className: 'ww-notice ww-warn', role: 'status' }, `你已经有叫「${conflicts.map(skill => skill.name).join('」「')}」的技能；装上后同名的两项只有一项生效。`),
      usable.length > 0 && h('h3', { className: 'ww-kit-subhead' }, `MCP（${usable.length}）`),
      usable.length > 0 && h('ul', { className: 'ww-kit-picks' }, ...usable.map(item => h('li', { key: item.key },
        h('label', { className: 'ww-choice' }, h('input', { type: 'checkbox', checked: Boolean(picked[item.key]), disabled: busy, onChange: event => setPicked(current => ({ ...current, [item.key]: event.target.checked })) }), h('strong', null, item.title), h('small', null, transportText(item.transport))),
        h('small', { className: 'ww-kit-target', title: item.target }, item.target),
        item.hint && h('small', { className: 'ww-kit-why', 'data-tone': 'warn' }, item.hint),
        picked[item.key] && item.fields.map(field => h('label', { key: field.id }, `${field.label}${field.required ? '' : '（可不填）'}`,
          h('input', { type: field.secret ? 'password' : 'text', value: values[item.key]?.[field.id] ?? '', disabled: busy, autoComplete: 'off', onChange: event => setValues(current => ({ ...current, [item.key]: { ...current[item.key], [field.id]: event.target.value } })) }),
          field.help && h('small', null, field.help)))))),
      error && h('p', { className: 'ww-notice ww-error', role: 'alert' }, error),
      h('p', { className: 'ww-kit-note' }, '密钥存进 DSH 自带的凭据库，不写进配置文件；包里的技能只读，装好后在“技能”里能看到。')), discard);
  }

  /** 加一个插件包市场：填 GitHub 仓库，仓库里要有 .claude-plugin/marketplace.json。 */
  function MarketEditor({ busy, onClose, onAdd }) {
    const [repo, setRepo] = useState('');
    const [error, setError] = useState('');
    const add = () => { setError(''); onAdd(repo.trim()).catch(reason => setError(reason.message || '没加上')); };
    return h(Drawer, { title: '添加插件包市场', busy, onClose, footer: [
      h('span', { key: 'gap', className: 'ww-grow' }),
      h('button', { key: 'cancel', type: 'button', disabled: busy, onClick: onClose }, '取消'),
      h('button', { key: 'add', type: 'button', className: 'ww-primary', disabled: busy || !repo.trim(), onClick: add }, busy ? '正在读…' : '添加'),
    ] },
      h('p', { className: 'ww-kit-lead' }, '插件包市场就是一个 GitHub 仓库，里面用 Claude 插件市场的格式（.claude-plugin/marketplace.json）列出一批插件包。'),
      h('label', null, 'GitHub 仓库', h('input', { value: repo, disabled: busy, placeholder: 'owner/repo 或 https://github.com/owner/repo', onChange: event => setRepo(event.target.value), onKeyDown: event => { if (event.key === 'Enter' && repo.trim()) add(); } })),
      error && h('p', { className: 'ww-notice ww-error', role: 'alert' }, error),
      h('p', { className: 'ww-kit-note' }, '市场由第三方维护，只加你信得过的；加好后在“发现”里多一栏。'));
  }

  return { MinePacks, PackDrawer, DiscoverPacks, PackPreview, MarketEditor, packFilters };
}
