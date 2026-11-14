import { skillLibraryContract } from './contract.js';
import { registerFeature, useFeature } from '../../src/shell/feature.js';
import { createSkillViews } from './skill-views.js';
import { createMcpViews } from './mcp-views.js';
import { mcpCatalog, mcpCategories } from './mcp-catalog.js';
import { createPackViews, createNavigation } from './pack-views.js';

// 技能中心页（2026-11-09 用户定，照 Claude 桌面版“自定义”页）：顶上一行“技能 / MCP / 插件”和“我的 / 发现”，
// 右边搜索、筛选、排序、“＋ 添加”；“我的”是一张三列列表，“发现”是两列卡片，点开都在右侧抽屉。
// “插件”是插件包（照 Claude 的插件包：一组技能加一组 MCP），不是 DSH 的程序插件。
const kinds = [['skills', '技能', 'spark'], ['mcp', 'MCP', 'plug'], ['plugins', '插件', 'puzzle']];

/** 本页持有自己的草稿、动作和恢复状态；切走时不把状态交给外壳。 */
export function createView(kit, navigation) {
  const { React, ConfirmDialog, ActionMenu, Glyph } = kit;
  const { createElement: h, useState, useRef, useEffect, useSyncExternalStore } = React;
  // 扩展登记的来源名是 { zh, en }；没有登记来源的扩展按包名显示。
  const labelText = extension => extension.label ? (kit.resolveText ? kit.resolveText(extension.label) : extension.label.zh) : extension.package;
  const noFrame = () => null;
  const noSubscribe = () => () => {};
  const emptyExperts = { experts: [] };
  const noExperts = () => emptyExperts;
  const views = createSkillViews(kit, { labelText });
  const { SkillEditor, TeamSkillEditor, MineSkills, SkillDrawer, DiscoverSkills, MarketDrawer, skillFilters } = views;
  const { MineMcp, McpDrawer, McpEditor, DiscoverMcp, mcpFilters } = createMcpViews(kit);
  const { MinePacks, PackDrawer, DiscoverPacks, PackPreview, MarketEditor, packFilters } = createPackViews(kit);
  // 上传的文件转成 base64 交给宿主。
  const fileData = async file => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
    return btoa(binary);
  };

  function Segment({ label, value, options, onChange, disabled }) {
    return h('div', { className: 'ww-kit-segment', role: 'tablist', 'aria-label': label }, ...options.map(([id, text, icon]) => h('button', { type: 'button', key: id, role: 'tab', 'aria-selected': value === id, disabled, onClick: () => onChange(id) }, icon && h(Glyph, { name: icon, size: 15 }), text)));
  }

  return function SkillsView({ active, workbench }) {
    const { api, t, notify, busy, run, operation, setError: reportError, help, bind, openAssistant } = useFeature(React, workbench, 'skills');
    const setError = (message, action) => reportError(message, action || { label: t('retry'), run: () => refreshTab() });
    const core = workbench.internal;
    const assistantShort = core.assistantName().short;
    const [kind, setKind] = useState('skills');
    const [view, setView] = useState('mine');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [sortDown, setSortDown] = useState(false);
    const [confirm, setConfirm] = useState(null);
    const [skills, setSkills] = useState([]);
    const [total, setTotal] = useState(0);
    const [skill, setSkill] = useState(null);
    const [skillEditor, setSkillEditor] = useState(undefined);
    const [market, setMarket] = useState(null);
    const [results, setResults] = useState(null);
    const [searching, setSearching] = useState(false);
    const [marketItem, setMarketItem] = useState(null);
    const upload = useRef(null);
    // MCP：列表只在切到 MCP 时读；有正在连的，每 3 秒再读一次状态，连完就停。
    const [mcp, setMcp] = useState(null);
    const [mcpOpen, setMcpOpen] = useState(null);
    const [mcpEditor, setMcpEditor] = useState(null);
    const [mcpRemove, setMcpRemove] = useState(null);
    // 专家团队的名单（推荐给哪几位专家用）：跟着专家团队页实时变（改了名字这里跟着变）；切到 MCP 时还没读过就读一次。
    const expertsApi = core.clients?.experts;
    const expertList = useSyncExternalStore(expertsApi?.subscribeExperts ?? noSubscribe, expertsApi?.experts ?? noExperts, expertsApi?.experts ?? noExperts);
    useEffect(() => { if (kind === 'mcp' && expertsApi && !expertList.experts.length) expertsApi.loadExperts().catch(() => {}); }, [kind]);
    const mcpCommand = (action, extra = {}) => api.mcpRequest({ action, ...extra }, operation.current?.controller.signal);
    const loadMcp = () => run(async () => { const value = await mcpCommand('list'); return () => setMcp(value); });
    // 工作台同一时间只跑一个操作，忙时新操作会被丢掉：等不忙了再读。插件包的详情里也要看 MCP 连没连上。
    useEffect(() => { if (active && (kind === 'mcp' || kind === 'plugins') && !mcp && !busy) loadMcp(); }, [active, kind, busy, Boolean(mcp)]);
    const connecting = Boolean(mcp?.servers.some(server => server.status === 'connecting'));
    useEffect(() => {
      if (!active || (kind !== 'mcp' && kind !== 'plugins') || !connecting) return;
      let live = true;
      const timer = setInterval(() => { api.mcpRequest({ action: 'list' }).then(value => { if (live) setMcp(value); }, () => {}); }, 3000);
      return () => { live = false; clearInterval(timer); };
    }, [active, kind, connecting]);
    // 插件包：装好的列表“技能”和“插件”都要用（包里的技能也列在技能里）；市场只在“发现 · 插件”时读，读 GitHub 慢，不占着页面。
    const [packs, setPacks] = useState(null);
    const [packMarkets, setPackMarkets] = useState(null);
    const [marketsLoading, setMarketsLoading] = useState(false);
    const [packOpen, setPackOpen] = useState(null);
    const [packPreview, setPackPreview] = useState(null);
    const [packRemove, setPackRemove] = useState(null);
    const [marketEditor, setMarketEditor] = useState(false);
    const [installing, setInstalling] = useState(false);
    const packUpload = useRef(null);
    const packCommand = (action, extra = {}) => api.packRequest({ action, ...extra }, operation.current?.controller.signal);
    useEffect(() => { if (active && kind === 'plugins' && !packs && !busy) run(async () => { const value = await packCommand('list'); return () => setPacks(value.packs); }); }, [active, kind, busy, Boolean(packs)]);
    // 先拿马上有的几栏，GitHub 上的市场再逐个读，读完一栏补一栏。
    const fillMarket = (market, refresh) => api.packRequest({ action: 'market', id: market.id, ...(refresh ? { refresh: true } : {}) }).then(
      value => setPackMarkets(current => current?.map(item => item.id === market.id ? value.markets[0] ?? item : item)),
      reason => setPackMarkets(current => current?.map(item => item.id === market.id ? { ...item, loading: undefined, issue: reason.message || t('requestFailed') } : item)));
    const adoptMarkets = (markets, refresh) => { setPackMarkets(markets); for (const market of markets) if (market.loading) fillMarket(market, refresh); };
    const readPackMarkets = refresh => {
      setMarketsLoading(true);
      return api.packRequest({ action: 'market', ...(refresh ? { refresh: true } : {}) }).then(value => adoptMarkets(value.markets, refresh), reason => setError(reason.message || t('requestFailed'))).finally(() => setMarketsLoading(false));
    };
    const refreshMarket = market => { setPackMarkets(current => current?.map(item => item.id === market.id ? { ...item, issue: undefined, loading: true } : item)); fillMarket(market, true); };
    useEffect(() => { if (active && kind === 'plugins' && view === 'discover' && !packMarkets && !marketsLoading) readPackMarkets(false); }, [active, kind, view, Boolean(packMarkets)]);
    const openPackEntry = entry => {
      setPackPreview({ entry, preview: null });
      api.packRequest({ action: 'preview', entry: { market: entry.market, name: entry.name } }).then(
        value => setPackPreview(current => current?.entry?.id === entry.id ? { entry, preview: value.preview } : current),
        reason => { setPackPreview(current => current?.entry?.id === entry.id ? null : current); notify(`读不了「${entry.title}」：${reason.message}`, { kind: 'error' }); });
    };
    const pickPackUpload = event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > 32 * 1024 * 1024) { setError('上传的文件太大了，插件包最多 32 MB', null); return; }
      run(async () => { const value = await packCommand('upload', { fileName: file.name, data: await fileData(file) }); return () => setPackPreview({ entry: null, preview: value.preview }); });
    };
    const installPack = async choices => {
      setInstalling(true);
      try {
        const { stage, hash } = packPreview.preview;
        const value = await api.packRequest({ action: 'install', stage, expectedHash: hash, mcp: choices });
        const servers = await api.mcpRequest({ action: 'list' }).catch(() => null);
        setPacks(current => [...(current ?? []).filter(pack => pack.name !== value.pack.name), value.pack]);
        if (servers) setMcp(servers);
        setPackPreview(null); setView('mine'); setFilter('all'); setQuery(''); setPackOpen(value.pack.name);
        if (value.failed.length) notify(`已装好「${value.pack.title}」，但有 ${value.failed.length} 个 MCP 没加上：${value.failed.map(item => `${item.key}（${item.reason}）`).join('；')}`, { kind: 'error' });
        else notify(`已装好「${value.pack.title}」`);
      } finally { setInstalling(false); }
    };
    const togglePack = pack => run(async () => {
      const value = await packCommand('toggle', { name: pack.name, enabled: !pack.enabled });
      const servers = await mcpCommand('list').catch(() => null);
      return () => { setPacks(list => list.map(item => item.name === value.pack.name ? value.pack : item)); if (servers) setMcp(servers); notify(value.pack.enabled ? `已启用「${value.pack.title}」` : `已停用「${value.pack.title}」`); };
    });
    const removePack = () => run(async () => {
      const target = packRemove;
      await packCommand('remove', { name: target.name });
      const servers = await mcpCommand('list').catch(() => null);
      return () => { setPacks(list => list.filter(item => item.name !== target.name)); if (servers) setMcp(servers); setPackRemove(null); setPackOpen(null); notify(`已卸载「${target.title}」`); };
    });
    const openPackSkill = (pack, item) => run(async () => {
      const value = await packCommand('skill', { name: pack.name, skill: item.name });
      return () => { setPackOpen(null); setSkill({ id: `pack:${pack.name}:${item.name}`, name: value.skill.name, description: value.skill.description, content: value.skill.content, origin: 'pack', pack: { name: pack.name, title: pack.title, enabled: pack.enabled }, actions: [] }); };
    });
    const [marketBusy, setMarketBusy] = useState(false);
    const addMarket = async repo => {
      setMarketBusy(true);
      try { const value = await api.packRequest({ action: 'market_add', repo }); adoptMarkets(value.markets); setMarketEditor(false); setView('discover'); notify('已添加插件包市场，在“发现”里多了一栏'); }
      finally { setMarketBusy(false); }
    };
    const removeMarket = market => run(async () => { const value = await packCommand('market_remove', { id: market.id }); return () => { adoptMarkets(value.markets); notify(`已移除「${market.title}」`); }; });
    const skillCommand = (action, extra = {}) => api.skillRequest({ action, ...extra }, operation.current?.controller.signal);
    // 带技能目录的扩展在活动登记里才读“团队”这类来源；没有这样的扩展时不多发请求。
    const frame = useSyncExternalStore(core.subscribe ?? (() => () => {}), core.featureSnapshot ?? noFrame, core.featureSnapshot ?? noFrame);
    // 来源换了能改的项（skillSources 变了）也重读。
    const extensionKey = (frame?.features || []).filter(feature => feature.kind === 'extension' && feature.skills.length).map(feature => `${feature.id}:${feature.instance}`).join(',') + (frame?.skillSources ? `#${frame.skillSources}` : '');
    const [extensions, setExtensions] = useState([]);
    // 共用目录和各项目里的技能（DSH 会用、鲸翼只读），和“我的”一起读。
    const [scopes, setScopes] = useState([]);
    const readExtensions = async () => extensionKey ? (await skillCommand('extensions')).extensions : [];
    // “我的”一次读完所有页：员工技能通常一两百项，列表里搜索、筛选、排序都在本页做。
    const readAll = async () => {
      let offset = 0, entries = [], count = 0;
      for (let page = 0; page < 100; page++) {
        const value = await skillCommand('list', { offset });
        entries = entries.concat(value.entries); count = value.total;
        if (!value.truncated || !value.entries.length) break;
        offset = value.offset + value.entries.length;
      }
      return { entries, count };
    };
    const adopt = value => { setSkills(value.entries); setTotal(value.count); };
    // 包里的技能也列在“技能”里，重读技能时一起重读装了哪些包。
    const reloadMine = async () => { const value = await readAll(); const extra = await readExtensions(); const packList = (await packCommand('list')).packs; const scoped = await skillCommand('scopes').then(reply => reply.scopes, () => []); return () => { adopt(value); setExtensions(extra); setPacks(packList); setScopes(scoped); }; };
    const loadMarket = refresh => run(async () => { const value = await skillCommand('market_home', refresh ? { refresh: true } : {}); return () => setMarket(value.market); });
    const refreshTab = () => run(async () => {
      if (kind === 'mcp') { const value = await mcpCommand('list'); return () => setMcp(value); }
      if (kind === 'plugins') {
        const list = (await packCommand('list')).packs;
        const markets = view === 'discover' ? (await packCommand('market', { refresh: true })).markets : null;
        return () => { setPacks(list); if (markets) adoptMarkets(markets, true); };
      }
      const apply = await reloadMine();
      const home = view === 'discover' ? (await skillCommand('market_home', { refresh: true })).market : null;
      return () => { apply(); if (home) setMarket(home); };
    });
    // 扩展开关或换代时只重读来源技能；读不到时保留上次的结果并说明。
    useEffect(() => {
      if (!extensionKey) { setExtensions([]); return; }
      let live = true;
      skillCommand('extensions').then(value => { if (live) setExtensions(value.extensions); }, reason => { if (live) setError(reason.message || t('requestFailed')); });
      return () => { live = false; };
    }, [extensionKey]);
    useEffect(() => { if (active && view === 'discover' && kind === 'skills' && !market && !busy) loadMarket(false); }, [active, view, kind, busy, Boolean(market)]);
    // 发现页搜索：停手 400 毫秒再问 skills.sh，后发的结果盖掉先发的。
    useEffect(() => {
      if (view !== 'discover' || kind !== 'skills' || query.trim().length < 2) { setResults(null); setSearching(false); return; }
      let live = true; setSearching(true);
      const timer = setTimeout(() => { api.skillRequest({ action: 'market_search', query: query.trim() }).then(value => { if (live) setResults(value.skills); }, reason => { if (live) { setResults([]); setError(reason.message); } }).finally(() => { if (live) setSearching(false); }); }, 400);
      return () => { live = false; clearTimeout(timer); };
    }, [query, view, kind]);
    bind({ refresh: refreshTab, onError: reason => { if (reason.sessionId) return false; setError(reason.message || t('requestFailed')); return true; } });

    const { rows, options: mineOptions, count } = skillFilters(skills, extensions, packs, scopes);
    const discoverOptions = [{ id: 'all', label: '全部' }, { id: 'official', label: '官方技能' }, { id: 'popular', label: '安装最多' }];
    const mcpView = mcpFilters(mcp);
    const mcpDiscoverOptions = [{ id: 'all', label: '全部' }, ...mcpCategories.map(category => ({ id: category, label: category }))];
    const packView = packFilters(packs);
    const filterOptions = kind === 'plugins' ? (view === 'mine' ? packView.options : [{ id: 'all', label: '全部' }, ...(packMarkets ?? []).map(market => ({ id: market.id, label: market.title, count: market.entries.length }))]) : kind === 'mcp' ? (view === 'mine' ? mcpView.options : mcpDiscoverOptions) : view === 'mine' ? mineOptions : discoverOptions;
    const currentFilter = filterOptions.some(option => option.id === filter) ? filter : 'all';
    const switchView = next => { setView(next); setFilter('all'); setQuery(''); };
    const installedNames = new Set(rows.map(item => item.name));
    const mcpSummary = mcp ? [`MCP ${mcpView.rows.length} 个`, `已连上 ${mcp.servers.filter(server => server.status === 'connected').length}`, mcpView.count('failed') > 0 && `${mcpView.count('failed')} 个连不上`, mcp.profile.length > 0 && `DSH 配置 ${mcp.profile.length}`].filter(Boolean).join(' · ') : '正在读 MCP…';
    const projectCount = rows.filter(item => item.origin === 'project').length;
    const skillSummary = [`技能 ${total + rows.filter(item => ['extension', 'pack', 'agents', 'project'].includes(item.origin)).length} 项`, `个人 ${count('mine')}`, count('agents') > 0 && `共用 ${count('agents')}`, ...extensions.map(extension => `${labelText(extension)} ${count(`ext:${extension.id}`)}`), count('pack') > 0 && `插件包 ${count('pack')}`, `内置 ${count('builtin')}`, projectCount > 0 && `项目里 ${projectCount}`, count('updated') > 0 && `${count('updated')} 项原件有更新`, count('review') > 0 && `${count('review')} 项待复核`, count('issue') > 0 && `${count('issue')} 项需要修复`].filter(Boolean).join(' · ');
    const pluginSummary = packs ? [`插件包 ${packs.length} 个`, `开着 ${packView.count('on')}`, packView.count('off') > 0 && `停用 ${packView.count('off')}`, `技能 ${packs.reduce((sum, pack) => sum + pack.skills.length, 0)} 项`, `MCP ${packs.reduce((sum, pack) => sum + pack.mcp.length, 0)} 个`].filter(Boolean).join(' · ') : '正在读插件包…';
    const summary = kind === 'plugins' ? pluginSummary : kind === 'mcp' ? mcpSummary : skillSummary;

    const openSkill = item => item.origin === 'pack' ? openPackSkill(item.pack, item) : item.origin === 'agents' || item.origin === 'project' ? run(async () => {
      const value = await skillCommand('scope_read', { path: item.path });
      return () => setSkill({ ...item, content: value.scoped.content, actions: [] });
    }) : run(async () => {
      if (item.origin === 'extension') {
        const value = await skillCommand('extension_read', { feature: item.extension.id, name: item.name });
        return () => setSkill({ ...item, ...value.extension, id: item.id, origin: 'extension', extension: item.extension, actions: [] });
      }
      const value = await skillCommand('read', { id: item.id });
      if (!value.entry) throw new Error(t('skillMissing'));
      return () => setSkill(value.entry);
    });
    const [teamEditor, setTeamEditor] = useState(null);
    const saveTeamSkill = async content => {
      const value = await api.skillRequest({ action: 'extension_save', feature: teamEditor.extension.id, name: teamEditor.name, content, expectedHash: teamEditor.hash });
      const entry = { ...teamEditor, ...value.extension };
      setTeamEditor(null); setSkill(entry); notify(t('skillSaved'));
    };
    const editSkill = () => skill.origin === 'extension' ? (setTeamEditor(skill), setSkill(null)) : run(async () => { const current = await api.resolveSkillEdit(skill, operation.current.controller.signal); if (!current) throw new Error(t('skillMissing')); return () => { setSkill(null); setSkillEditor(current); }; });
    const toggleSkill = () => run(async () => { await skillCommand(skill.state === 'active' ? 'disable' : 'restore', { name: skill.name, expectedHash: skill.hash }); const apply = await reloadMine(); return () => { apply(); setSkill(null); }; }, 'skillToggled');
    const readEvolution = async (name, state) => {
      const all = await readAll();
      const entry = all.entries.find(item => item.origin === 'evolution' && item.name === name && item.state === state);
      if (!entry) throw new Error(t('skillMissing'));
      return (await skillCommand('read', { id: entry.id })).entry;
    };
    const confirmAction = action => {
      if (action === 'rollback') return setConfirm({ kind: 'rollback', name: skill.name, expectedHash: skill.state === 'active' ? skill.hash : rows.find(item => item.name === skill.name && item.state === 'active')?.hash || '' });
      setConfirm({ kind: action, id: skill.id });
    };
    const runConfirm = () => {
      if (confirm.kind === 'rollback') return run(async () => {
        // 回退以当前 active 的版本为前提，停用文件不是发布前备份。
        const saved = await skillCommand('rollback', { name: confirm.name, expectedHash: confirm.expectedHash });
        const restored = await readEvolution(confirm.name, 'active');
        if (saved.hash !== restored.hash) throw Object.assign(new Error(t('conflict')), { code: 'conflict' });
        const apply = await reloadMine();
        return () => { apply(); setSkill(restored); setConfirm(null); };
      }, 'skillRolledBack');
      const action = confirm.kind;
      return run(async () => {
        const result = await skillCommand(action, { id: skill.id, expectedHash: skill.hash, ...(skill.baseHash === undefined ? {} : { expectedBaseHash: skill.baseHash }) });
        if ((await skillCommand('read', { id: skill.id })).entry !== null) throw new Error(t('skillReadback'));
        const base = action === 'reset' ? (await skillCommand('read', { id: result.baseId })).entry : null;
        const apply = await reloadMine();
        return () => { apply(); setSkill(base); setConfirm(null); };
      }, action === 'remove' ? 'skillRemoved' : 'skillResetDone');
    };
    const pickUpload = event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { setError('上传的文件太大了，技能压缩包最多 10 MB', null); return; }
      run(async () => {
        const value = await skillCommand('upload', { fileName: file.name, data: await fileData(file) });
        const apply = await reloadMine();
        return () => { apply(); setView('mine'); setSkill(value.entry); notify(`已上传技能「${value.entry.name}」`); };
      });
    };
    const openMarket = item => { setMarketItem({ item, preview: null }); run(async () => { const value = await skillCommand('market_preview', { id: item.id }); return () => setMarketItem(current => current?.item.id === item.id ? { item, preview: value.preview } : current); }); };
    const installMarket = () => run(async () => {
      const { item, preview } = marketItem;
      const value = await skillCommand('market_install', { id: item.id, expectedHash: preview.hash });
      const apply = await reloadMine();
      return () => { apply(); setMarketItem(null); notify(`已安装「${value.entry.name}」，在“我的”里能看到`); };
    });

    const mcpTaken = new Set(mcpView.rows.map(row => row.name));
    const packTitle = name => packs?.find(pack => pack.name === name)?.title ?? name;
    const packShown = packOpen && packs?.find(pack => pack.name === packOpen);
    const openMcpServer = server => setMcpOpen(server.key);
    const mcpShown = mcpOpen && mcpView.rows.find(row => row.key === mcpOpen);
    // 适合哪几位专家用：只认鲸翼精选里写了推荐的；专家团队里没有的（删了）不写。
    const expertName = id => expertList.experts.find(role => role.id === id)?.name ?? '';
    const recommendFor = server => (!server || server.profile ? [] : mcpCatalog.find(item => item.id === server.catalogId)?.experts ?? []).map(expertName).filter(Boolean);
    const mcpDone = (value, message) => () => { setMcp(current => current && ({ ...current, servers: [...current.servers.filter(server => server.name !== value.server.name), value.server] })); if (message) notify(message); };
    const saveMcp = async (server, expectedRevision) => {
      const value = await api.mcpRequest({ action: 'save', server, expectedRevision });
      mcpDone(value)();
      setMcpEditor(null); setView('mine'); setMcpOpen(`ww:${value.server.name}`);
      notify(value.server.status === 'failed' ? `已保存「${value.server.title}」，但没连上：${value.server.error}` : `已添加「${value.server.title}」`, value.server.status === 'failed' ? { kind: 'error' } : undefined);
    };
    const toggleMcp = server => run(async () => mcpDone(await mcpCommand('toggle', { name: server.name, enabled: !server.enabled, expectedRevision: server.revision }), server.enabled ? `已断开「${server.title}」` : `正在连「${server.title}」`));
    const reconnectMcp = server => run(async () => mcpDone(await mcpCommand('reconnect', { name: server.name })));
    const removeMcp = () => run(async () => {
      await mcpCommand('remove', { name: mcpRemove.name, expectedRevision: mcpRemove.revision });
      const value = await mcpCommand('list');
      return () => { setMcp(value); setMcpRemove(null); setMcpOpen(null); notify(`已删除「${mcpRemove.title}」`); };
    });

    // 顶上一行：左边分类和“我的 / 发现”，右边搜索、筛选、排序、添加；窄了自动换行。
    const filterMenu = h(ActionMenu, { label: '筛选', icon: 'filter', iconOnly: true, className: currentFilter === 'all' ? '' : 'ww-kit-active' },
      ...filterOptions.map(option => h('button', { type: 'button', key: option.id, 'aria-pressed': currentFilter === option.id, onClick: () => setFilter(option.id) }, h('span', { className: 'ww-kit-check', 'aria-hidden': true }, currentFilter === option.id ? '✓' : ''), option.label, option.count !== undefined && h('small', null, String(option.count)))));
    const sortLabel = view === 'mine' || kind === 'mcp' ? (sortDown ? '按名称 Z→A' : '按名称 A→Z') : (sortDown ? '安装从少到多' : '安装从多到少');
    const addMenu = kind === 'plugins' ? h(ActionMenu, { label: '添加插件包', text: '添加', icon: 'plus', className: 'ww-primary ww-add-menu' },
      h('button', { type: 'button', disabled: busy, onClick: () => packUpload.current?.click() }, h(Glyph, { name: 'upload', size: 15 }), '上传插件包（.zip）'),
      h('button', { type: 'button', disabled: busy, onClick: () => setMarketEditor(true) }, h(Glyph, { name: 'puzzle', size: 15 }), '添加插件包市场（GitHub）'),
      h('button', { type: 'button', onClick: () => switchView('discover') }, h(Glyph, { name: 'search', size: 15 }), '从发现里找'))
    : kind === 'mcp' ? h(ActionMenu, { label: '添加 MCP', text: '添加', icon: 'plus', className: 'ww-primary ww-add-menu' },
      h('button', { type: 'button', disabled: busy || !mcp, onClick: () => setMcpEditor({}) }, h(Glyph, { name: 'plug', size: 15 }), '自定义 MCP'),
      h('button', { type: 'button', onClick: () => switchView('discover') }, h(Glyph, { name: 'search', size: 15 }), '从精选里加'))
    : h(ActionMenu, { label: '添加技能', text: '添加', icon: 'plus', className: 'ww-primary ww-add-menu' },
      h('button', { type: 'button', disabled: busy, onClick: () => setSkillEditor(null) }, h(Glyph, { name: 'spark', size: 15 }), '创建技能'),
      h('button', { type: 'button', disabled: busy, onClick: () => upload.current?.click() }, h(Glyph, { name: 'upload', size: 15 }), '上传技能（.zip 或 SKILL.md）'),
      h('button', { type: 'button', disabled: busy, onClick: () => openAssistant(t('refinePrompt')) }, h(Glyph, { name: 'chat', size: 15 }), `与${assistantShort}一起创建`),
      h('button', { type: 'button', onClick: () => switchView('discover') }, h(Glyph, { name: 'search', size: 15 }), '从 skills.sh 找'));
    // 左边分段一组，右边搜索、筛选、排序、添加一组；放不下时右边整组换到下一行并靠右。
    const toolbar = h('div', { className: 'ww-kit-toolbar' },
      h('div', { className: 'ww-kit-tabs' },
      h(Segment, { label: '类别', value: kind, options: kinds, disabled: busy, onChange: next => { setKind(next); setFilter('all'); setQuery(''); } }),
      h(Segment, { label: '我的或发现', value: view, options: [['mine', '我的'], ['discover', '发现']], disabled: busy, onChange: switchView })),
      h('div', { className: 'ww-kit-actions' },
      h('label', { className: 'ww-search ww-kit-search' }, h(Glyph, { name: 'search', size: 15 }), h('input', { type: 'search', value: query, placeholder: kind === 'plugins' ? '搜索插件包' : kind === 'mcp' ? '搜索 MCP' : view === 'discover' ? '搜索 skills.sh' : '搜索技能', 'aria-label': '搜索', onChange: event => setQuery(event.target.value) })),
      filterMenu,
      h('button', { type: 'button', className: 'ww-icon-button', title: sortLabel, 'aria-label': sortLabel, onClick: () => setSortDown(value => !value) }, h(Glyph, { name: 'sort', size: 16 })),
      addMenu,
      kind === 'plugins'
        ? h('input', { key: 'pack-upload', ref: packUpload, type: 'file', accept: '.zip', hidden: true, 'aria-label': '上传插件包', onChange: pickPackUpload })
        : h('input', { key: 'skill-upload', ref: upload, type: 'file', accept: '.zip,.skill,.md', hidden: true, 'aria-label': '上传技能', onChange: pickUpload })));

    const content = kind === 'plugins'
      ? (view === 'mine'
        ? h(MinePacks, { packs, filter: currentFilter, query, sortDown, busy, onOpen: pack => setPackOpen(pack.name), onDiscover: () => switchView('discover'), onOpenDsh: navigation?.navigation ? () => navigation.navigation.openList() : null })
        : h(DiscoverPacks, { markets: packMarkets, installed: new Set((packs ?? []).map(pack => pack.name)), filter: currentFilter, query, sortDown, busy, onOpen: openPackEntry, onRefresh: refreshMarket, onRemoveMarket: removeMarket }))
      : kind === 'mcp'
      ? (view === 'mine'
        ? h(MineMcp, { data: mcp, packTitle, filter: currentFilter, query, sortDown, busy, onOpen: openMcpServer, onDiscover: () => switchView('discover') })
        : h(DiscoverMcp, { query, filter: currentFilter, sortDown, added: new Set((mcp?.servers ?? []).map(server => server.catalogId).filter(Boolean)), busy, expertName, onOpen: item => setMcpEditor({ item }), onCustom: mcp ? () => setMcpEditor({}) : null }))
      : view === 'mine'
      ? h(MineSkills, { rows, filter: currentFilter, query, sortDown, t, busy, onOpen: openSkill, empty: help('emptySkills') })
      : h(DiscoverSkills, { market, results, searching, query, filter: currentFilter, sortDown, installedNames, busy, onOpen: openMarket, onRefresh: () => loadMarket(true) });

    const confirmText = { remove: ['skillRemoveTitle', 'skillConfirmRemove', 'removeSkill', true], reset: ['skillResetTitle', 'skillConfirmReset', 'resetSkill', false], rollback: ['skillRollbackTitle', 'confirmRollback', 'confirmRollbackAction', false] };
    const body = h('section', { className: 'ww-kit-page' },
      h('header', { className: 'ww-pagehead' }, h('div', null, h('h2', null, t('skillLibrary')), h('p', null, summary))),
      toolbar,
      h('div', { className: 'ww-kit-body' }, content),
      skill && h(SkillDrawer, { skill, t, busy, assistantShort, onOpenPack: skill.pack ? () => { setSkill(null); setKind('plugins'); setView('mine'); setPackOpen(skill.pack.name); } : undefined, onClose: () => setSkill(null), onEdit: editSkill, onAsk: confirmAction, onToggle: toggleSkill, onAssist: () => openAssistant(t('skillEditPrompt', { reference: JSON.stringify({ name: skill.name, state: skill.state, hash: skill.hash }) })) }),
      confirm && h(ConfirmDialog, { title: t(confirmText[confirm.kind][0]), message: t(confirmText[confirm.kind][1]), confirmLabel: t(confirmText[confirm.kind][2]), cancelLabel: t('cancel'), danger: confirmText[confirm.kind][3], busy, onCancel: () => setConfirm(null), onConfirm: runConfirm }),
      marketItem && h(MarketDrawer, { item: marketItem.item, preview: marketItem.preview, installed: installedNames.has(marketItem.item.name), busy, onClose: () => setMarketItem(null), onInstall: installMarket }),
      packShown && h(PackDrawer, { pack: packShown, servers: mcp?.servers, busy, onClose: () => setPackOpen(null), onToggle: () => togglePack(packShown), onRemove: () => setPackRemove(packShown), onSkill: item => openPackSkill(packShown, item), onMcp: server => { setPackOpen(null); setKind('mcp'); setView('mine'); setFilter('all'); setQuery(''); setMcpOpen(`ww:${server.name}`); } }),
      packPreview && h(PackPreview, { key: packPreview.preview?.stage ?? `loading:${packPreview.entry?.id}`, entry: packPreview.entry, preview: packPreview.preview, busy: installing, onClose: () => setPackPreview(null), onInstall: installPack }),
      packRemove && h(ConfirmDialog, { title: '卸载插件包', message: `卸载「${packRemove.title}」？里面的 ${packRemove.skills.length} 项技能和 ${packRemove.mcp.length} 个 MCP 一起删掉，凭据库里这些 MCP 的密钥也删掉。要用可以再从“发现”里装。`, confirmLabel: '卸载', cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setPackRemove(null), onConfirm: removePack }),
      marketEditor && h(MarketEditor, { busy: marketBusy, onClose: () => setMarketEditor(false), onAdd: addMarket }),
      mcpShown && !mcpEditor && h(McpDrawer, { server: mcpShown, packTitle, busy, onClose: () => setMcpOpen(null), onEdit: () => setMcpEditor({ server: mcpShown }), onToggle: () => toggleMcp(mcpShown), onReconnect: () => reconnectMcp(mcpShown), onRemove: () => setMcpRemove(mcpShown), recommend: recommendFor(mcpShown) }),
      mcpEditor && h(McpEditor, { key: mcpEditor.server?.name ?? mcpEditor.item?.id ?? 'custom', spec: mcpEditor, taken: mcpTaken, t, onClose: () => setMcpEditor(null), onSave: saveMcp }),
      mcpRemove && h(ConfirmDialog, { title: '删除 MCP', message: `删除「${mcpRemove.title}」？连接会断开，DSH 凭据库里它的密钥也一起删掉；专家以后就用不了它的工具。`, confirmLabel: '删除', cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setMcpRemove(null), onConfirm: removeMcp }),
      teamEditor && h(TeamSkillEditor, { key: teamEditor.id, skill: teamEditor, t, onClose: () => setTeamEditor(null), onSave: content => saveTeamSkill(content).catch(reason => notify(reason.message || t('requestFailed'), { kind: 'error' })) }),
      skillEditor !== undefined && h(SkillEditor, { key: skillEditor?.id || 'new-skill', api, entry: skillEditor, t, notify, onClose: () => setSkillEditor(undefined), onSaved: async entry => { const value = await readAll(); adopt(value); setSkillEditor(undefined); setView('mine'); setSkill(entry); notify(t('skillSaved')); } }));
    return active ? body : null;
  };
}

export const name = 'whalewing-skills';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) {
  // “插件”里给一个“打开 DSH 插件页”的入口：DSH 有插件页导航时才显示。
  const navigation = createNavigation(ctx);
  return registerFeature(ctx, 'skills', kit => createView(kit, navigation), { contract: skillLibraryContract, namespace: 'whalewingSkills' });
}
