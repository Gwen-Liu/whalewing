import { worldBoards, worldDimensions } from '../features/model-world/contract.js';
import { modelWorldVendors, modelWorldVariants, modelWorldPlatforms, portraitIdFor } from './model-world-roster.js';
import { worldPersonas } from './model-world-persona.js';
import { worldIndexAsOf, worldTierText, worldValuePlans } from './model-world-index.js';
import { isDomesticVendor, worldPriceText } from './model-world-cny-prices.js';
import { battleKit } from './model-world-battle-kits.js';
import { probeTests, probeTest, probeQuestion, probeArtifact, probeFrameDocument, probeSvgUrl, probeSummary } from './model-world-probe.js';
import { addUsage, dayOf, emptyUsage, mineAdvice, mineItems, usageCost, usageTokens, usedWorld, worldPriceOf } from './model-world-mine.js';
import { worldViewCopy, worldCostText, worldEffortText, worldDuelScript, worldDuelRounds, worldDuelLog, worldTokens, worldTime } from './model-world-view.js';

/** 图鉴顺序：厂商主形象后面紧跟它的系列形象（深度求索后面是 Flash）。 */
export const worldRoleIds = Object.freeze(modelWorldVendors.flatMap(vendor => [vendor.id, ...modelWorldVariants.filter(variant => variant.vendorId === vendor.id).map(variant => variant.id)]));
const roleVendor = id => modelWorldVariants.find(variant => variant.id === id)?.vendorId ?? id;
const roleOf = model => portraitIdFor(model.vendorId, model.id);
const homepages = Object.fromEntries(modelWorldVendors.map(vendor => [vendor.id, vendor.homepage]));

export const worldTabs = Object.freeze([['mine', '我的模型'], ['rank', '实力榜'], ['new', '新模型'], ['gallery', '角色图鉴'], ['duel', '对决'], ['probe', '模型测智']]);
const periods = Object.freeze({ week: '近 7 天', month: '本月', d30: '近 30 天' });
/** 一个时间段要读几天：本月从 1 号到今天（北京时间）。 */
const periodDays = key => key === 'week' ? 7 : key === 'd30' ? 30 : Number(dayOf(Date.now()).slice(8));
const channelText = { official: '官方渠道', relay: '转发站', local: '本机', unknown: '' };

/** 数量按“万、亿”写，钱分币种写：不到 1 的留两位小数。 */
export const worldCount = value => value >= 1e8 ? `${(value / 1e8).toFixed(2)} 亿` : value >= 1e4 ? `${(value / 1e4).toFixed(value >= 1e6 ? 0 : 1)} 万` : String(Math.round(value));
export const worldMoney = (amount, currency) => `${currency === 'CNY' ? '¥' : '$'}${amount < 1 ? amount.toFixed(2) : amount < 100 ? amount.toFixed(1) : Math.round(amount).toLocaleString('en-US')}`;
/** 一段时间的花费：人民币和美元分开合计，不换算；没有官网价的不计入。 */
export function worldSpend(rows, worldOf) {
  const sums = { CNY: 0, USD: 0 }, list = rows.map(row => { const world = worldOf(row), cost = world ? usageCost(world, row) : null; if (cost) sums[cost.currency] += cost.amount; return { ...row, world, cost }; });
  const parts = Object.entries(sums).filter(([, amount]) => amount > 0).map(([currency, amount]) => worldMoney(amount, currency));
  return { rows: list, text: parts.length ? parts.join(' + ') : '—' };
}
/** 新模型按月分组，新的在前；缺日期的不列。 */
export function worldMonthGroups(models) {
  const groups = [];
  for (const model of [...models].filter(item => item.releaseDate && item.releaseDate.length >= 7).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name))) {
    const month = model.releaseDate.slice(0, 7);
    if (groups.at(-1)?.month !== month) groups.push({ month, models: [] });
    groups.at(-1).models.push(model);
  }
  return groups;
}

export function createModelWorldPages(React, kit) {
  const { createElement: h, useState, useRef, useEffect } = React;
  const { Portrait, portraitSource, zoomable, roleName, PortraitViewer, KeyWindow, Metrics, Rating, Efforts, Benchmarks, tierBadge, link, own, loadLarge, battle, loadImage, ui = {} } = kit;
  // 文字和图标一起当按钮内容时逐个摊开，不整组塞进去。
  const button = (label, onClick, props = {}) => h('button', { type: 'button', onClick, ...props }, ...[].concat(label));
  const c = worldViewCopy;
  // 外壳的共享弹窗、确认框和“…”菜单；没给时（单元测试）用最简单的替身。
  const Modal = ui.Modal ?? (({ title, onClose, className = '', children }) => h('div', { role: 'dialog', 'aria-label': title, className }, h('header', null, h('h2', null, title), button(c.close, onClose)), children));
  const ConfirmDialog = ui.ConfirmDialog ?? (({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel }) => h(Modal, { title, onClose: onCancel }, h('div', null, message), button(cancelLabel, onCancel), button(confirmLabel, onConfirm)));
  const ActionMenu = ui.ActionMenu ?? (({ label, children }) => h('div', { role: 'group', 'aria-label': label }, children));
  const icon = (path, size = 14) => h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: path }));
  const icons = { out: 'M14 5h5v5M19 5l-8 8M11 7H6v11h11v-5', plus: 'M12 5v14M5 12h14', check: 'M5 12.5l4.5 4.5L19 7.5', close: 'M6 6l12 12M18 6L6 18', star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8-4.3-4.1 5.9-.9z', chat: 'M4 5.5h16v10H9l-5 4z', swap: 'M7 7h12l-3-3M17 17H5l3 3', bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z', flask: 'M9.5 3.5h5M10.5 3.5v6L5 19.5a1 1 0 0 0 .9 1.5h12.2a1 1 0 0 0 .9-1.5L13.5 9.5v-6M7.5 15h9' };
  const outLink = (url, label, className = '') => h('a', { className: `ww-mw-link ${className}`, href: url, target: '_blank', rel: 'noopener noreferrer' }, label, icon(icons.out, 12));
  const chip = (label, on, onClick, props = {}) => h('button', { type: 'button', className: 'ww-mw-chip2', 'aria-pressed': on, onClick, ...props }, ...[].concat(label));
  const toggle = (label, on, onClick, props = {}) => h('button', { type: 'button', className: 'ww-mw-switch', role: 'switch', 'aria-checked': on, onClick, ...props }, h('i', { 'aria-hidden': true }), label);
  const mini = model => h('span', { className: 'ww-mw-mini' }, model ? h(Portrait, { vendorId: model.vendorId, modelId: model.id }) : null);
  // 表格里的成绩条（2026-11-17 用户：实力榜“不也一样嘛”）：和“我的模型”卡片同一套——条在前、数字在后，条长就是分数（满分 100），
  // 条跟着这一栏的宽度伸缩、不写死，同一栏里每行的条从同一条竖线开始。
  const bar = value => h('span', { className: 'ww-mw-bar' }, h('i', null, h('b', { style: { width: `${Math.max(0, Math.min(100, value ?? 0))}%` } })), h('span', null, value ?? '—'));
  const priceOf = model => { const input = worldPriceText(model, 'inputPerMTok'), output = worldPriceText(model, 'outputPerMTok'); return input || output ? `${input ?? '—'} / ${output ?? '—'}` : null; };
  const empty = (title, text, ...actions) => h('div', { className: 'ww-mw-empty' }, title && h('h3', null, title), h('p', null, text), actions.length > 0 && h('div', { className: 'ww-mw-actions' }, ...actions));
  const section = (title, sub, extra, ...children) => h('section', { className: 'ww-mw-sec' }, h('div', { className: 'ww-mw-sec-h' }, h('h3', null, title), sub && h('small', null, sub), h('span', { className: 'ww-mw-grow' }), extra), ...children);
  const dims = Object.entries(worldDimensions).filter(([key]) => key !== 'eci');

  /** 模型写的网页放进隔离框：不给同源，页面里另有一条不许联网的策略。 */
  const frame = (html, title) => h('iframe', { sandbox: 'allow-scripts', title, srcDoc: probeFrameDocument(html) });

  /** 手动对应：DSH 里的型号名字对不上时，员工自己指一个模型世界的型号。只存在鲸翼这边，不改 DSH。 */
  function MapWindow({ item, models, onSave, onClose }) {
    const [query, setQuery] = useState(''), [picked, setPicked] = useState(item.mapped ? item.world?.id ?? null : null);
    const text = query.trim().toLowerCase();
    const list = models.filter(model => !text || `${model.name} ${model.id}`.toLowerCase().includes(text)).sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '')).slice(0, 40);
    return h(Modal, { title: '手动对应型号', onClose, className: 'ww-mw-modal ww-mw-map' },
      h('div', { className: 'ww-mw-modal-body' },
        h('p', null, `DSH 里的「${item.name}」（${item.providerName}）对应模型世界的哪个型号？只是鲸翼这边记一下，用来显示成绩和价格，不改 DSH 的设置。`),
        h('input', { type: 'search', 'aria-label': '搜索型号', placeholder: '搜索型号', value: query, onChange: event => setQuery(event.target.value) }),
        h('div', { className: 'ww-mw-maplist', role: 'listbox', 'aria-label': '模型世界的型号' }, ...list.map(model => h('button', { key: model.id, type: 'button', role: 'option', 'aria-selected': picked === model.id, onClick: () => setPicked(model.id) }, mini(model), h('span', { className: 'ww-mw-grow' }, model.name), h('small', null, model.releaseDate ?? ''), tierBadge(model.rating?.tier))),
          list.length === 0 && h('p', { className: 'ww-mw-hint' }, c.empty))),
      h('footer', { className: 'ww-dialog-actions' }, item.mapped && button('取消对应', () => onSave(null)), h('span', { className: 'ww-mw-grow' }), button(c.cancel, onClose), button('保存对应', () => onSave(picked), { className: 'ww-primary', disabled: !picked })));
  }

  /** 动画对决：画布逐帧画的打斗，体力条和回合记录在画布外面，读屏读得到。 */
  function DuelWindow({ models, vendorName, onClose, onBack, onProbe }) {
    const canvas = useRef(null), engine = useRef(null), alive = useRef(true);
    const script = worldDuelScript(models), playable = script.kind === 'winner' || script.kind === 'tie';
    const [phase, setPhase] = useState(playable ? 'loading' : 'done'), [hp, setHp] = useState([100, 100]), [round, setRound] = useState(null), [fast, setFast] = useState(false), [played, setPlayed] = useState([]);
    const reduced = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    const start = () => { setHp([100, 100]); setRound(null); setPlayed([]); setFast(false); setPhase('play'); engine.current?.setSpeed(1); if (reduced()) engine.current?.skip(); else engine.current?.play(); };
    useEffect(() => {
      alive.current = true;
      if (!playable) return undefined;
      Promise.all(models.map(model => loadImage(portraitSource(model.vendorId, model.id)))).then(images => {
        if (!alive.current || !canvas.current) return;
        engine.current = battle(canvas.current, {
          script, fighters: models.map((model, index) => ({ image: images[index], theme: battleKit(roleOf(model)), name: model.name })),
          labels: { guard: '格挡', dodge: '闪开', crit: '暴击', clash: '对拼', skill: '必杀', tie: c.tie, round: '第 {n} 回合' },
          onRound: value => { if (alive.current) setRound(value); },
          // 每一场的过程是现排的：战斗记录照台上实际打出来的每一击记，不照剧本。
          onHit: value => { if (alive.current) { setHp(value.hp); setPlayed(list => [...list, { round: value.round, name: value.name, attacker: value.attacker, damage: value.damage, hp: value.hp }]); } },
          onDone: result => { if (alive.current) { setPhase('done'); setPlayed(result?.events ?? script.events); } },
        });
        start();
      });
      const resize = () => engine.current?.resize();
      globalThis.addEventListener?.('resize', resize);
      return () => { alive.current = false; globalThis.removeEventListener?.('resize', resize); engine.current?.destroy(); engine.current = null; };
    }, []);
    const verdict = script.kind === 'winner' ? `${models[script.winner].name} ${c.wins}，剩 ${script.hp[script.winner]} 体力 · ${script.basis === 'overall' ? c.duelBasis : c.duelFallback} ${script.totals[0]} : ${script.totals[1]}` : script.kind === 'tie' ? `${c.tie} · ${c.duelBasis} ${script.totals[0]} : ${script.totals[1]}` : c.incomparable;
    const status = phase === 'done' ? verdict : phase === 'loading' ? '准备上场' : round ? `第 ${round.index + 1} 回合 · ${round.name}` : c.battling;
    const log = worldDuelLog(played), kits = models.map(model => battleKit(roleOf(model)));
    const dealt = value => value === null ? '…' : value === 0 ? '被闪开' : `${c.dealt} ${value}`;
    return h(Modal, { title: `动画对决 · ${models[0].name} 对 ${models[1].name}`, onClose, className: 'ww-mw-modal ww-mw-duel' },
      h('div', { className: 'ww-mw-modal-body' },
        h('div', { className: 'ww-mw-arena' },
          h('canvas', { ref: canvas, 'aria-hidden': true }),
          h('div', { className: 'ww-mw-hud' }, ...[0, 1].flatMap(index => [
            index === 1 && h('span', { key: 'vs', className: 'ww-mw-vs' }, 'VS'),
            h('div', { key: index, className: `ww-mw-hud-side ${index ? 'right' : 'left'}` }, h('div', { className: 'ww-mw-hud-name' }, models[index].name, h('small', null, vendorName(models[index]))),
              h('div', { className: 'ww-mw-hp', 'data-low': hp[index] <= 30 }, h('b', { style: { width: `${hp[index]}%` } })), h('span', { className: 'ww-mw-hp-num' }, `${c.hp} ${hp[index]} / 100`)),
          ]).filter(Boolean))),
        h('div', { className: 'ww-mw-duel-bar', role: 'status', 'aria-live': 'polite' }, h('span', null, status),
          phase === 'play' && button('2 倍速', () => { engine.current?.setSpeed(fast ? 1 : 2); setFast(!fast); }, { 'aria-pressed': fast }),
          phase === 'play' && button('跳到结果', () => engine.current?.skip()),
          phase === 'done' && playable && button(c.replay, start)),
        playable && h('div', { className: 'ww-mw-kits' }, ...models.map((model, index) => h('p', { key: model.id }, h('strong', null, `${model.name} · ${kits[index].job}`), h('span', null, `使${kits[index].weapon}：${kits[index].moves.map(move => move.name).join('、')}；必杀「${kits[index].skill}」`)))),
        h('p', { className: 'ww-mw-duel-help' }, c.duelRule),
        log.length > 0 && h('ol', { className: 'ww-mw-duel-log' }, ...log.map((item, index) => h('li', { key: item.round, 'data-win': item.damage[0] === item.damage[1] || item.damage.includes(null) ? '' : item.damage[0] > item.damage[1] ? 'left' : 'right' },
          h('em', null, `${c.round} ${index + 1} · ${item.name}`), h('span', null, dealt(item.damage[0])), h('span', null, `${c.hp} ${item.hp[0]} : ${item.hp[1]}`), h('span', null, dealt(item.damage[1]))))),
        h('div', { className: 'ww-mw-table-wrap' }, h('table', { className: 'ww-mw-table ww-mw-cmp' }, h('thead', null, h('tr', null, h('th', null), ...models.map(model => h('th', { key: model.id, scope: 'col' }, model.name)))),
          h('tbody', null, ...[[c.overall, 'overall'], ...dims.map(([key, dimension]) => [dimension.name, key])].map(([label, key]) => { const values = models.map(model => model.rating[key]); return h('tr', { key }, h('th', { scope: 'row' }, label), ...values.map((value, index) => h('td', { key: index, 'data-best': typeof value === 'number' && typeof values[1 - index] === 'number' && value > values[1 - index] }, value ?? '—'))); }))))),
      h('footer', { className: 'ww-dialog-actions' }, button('换人再战', onBack), h('span', { className: 'ww-mw-grow' }), onProbe && button('测一测真实水平', onProbe), button(c.close, onClose)));
  }

  return function ModelWorldView({ api, notify = () => {} }) {
    const [world, setWorld] = useState(null), [busy, setBusy] = useState(false), [mine, setMine] = useState(null), [usage, setUsage] = useState(null), [runs, setRuns] = useState([]);
    const [tab, setTab] = useState('mine'), [rank, setRank] = useState({ board: 'overall', query: '', vendorId: '', onlyMine: false, view: 'table', direction: 'desc', page: 0, allPlans: false });
    const [picks, setPicks] = useState([]), [dialog, setDialog] = useState(null), [viewer, setViewer] = useState(null), [keyWindow, setKeyWindow] = useState(false);
    const [period, setPeriod] = useState('month'), [hidden, setHidden] = useState({}), [showAll, setShowAll] = useState(false);
    const [fresh, setFresh] = useState([]), [newFilter, setNewFilter] = useState('all'), [older, setOlder] = useState(false), [onlyMet, setOnlyMet] = useState(false);
    const [duel, setDuel] = useState({ slots: [null, null], active: 0, query: '', filter: '' });
    const [probe, setProbe] = useState({ who: null, what: ['pelican', 'candy', 'carwash'], classic: false, run: null, view: null, live: false });
    const mounted = useRef(true), request = useRef(null), probing = useRef(null), trigger = useRef(null), fallback = useRef(null), cache = useRef({ mine: null, world: null, items: [] });

    const models = world?.models ?? [], byId = new Map(models.map(model => [model.id, model]));
    const vendorName = model => { const vendor = world?.vendors.find(item => item.id === model.vendorId); return vendor?.nameZh || vendor?.name || model.vendorId; };
    const roleTitle = id => { const vendorId = roleVendor(id), vendor = world?.vendors.find(item => item.id === vendorId) ?? modelWorldVendors.find(item => item.id === vendorId); return roleName(id, vendorId, vendor?.nameZh || vendor?.name || vendorId); };
    // 员工配好的型号对到模型世界：目录或模型数据变了才重算。
    if (cache.current.mine !== mine || cache.current.world !== world) cache.current = { mine, world, items: mine?.groups && world?.available ? mineItems(mine, models) : [] };
    const items = cache.current.items, mineIds = new Set(items.filter(item => item.world).map(item => item.world.id)), itemOf = model => items.find(item => item.world?.id === model.id) ?? null;
    const usedRows = (mine?.used ?? []).map(row => ({ ...row, world: usedWorld(row, items, models) }));
    // 相遇：用哪个角色的模型聊过（有用量记录）就点亮；只配好没聊过的是“已配好”。
    const met = {};
    for (const row of usedRows) if (row.world && row.calls > 0) { const role = met[roleOf(row.world)] ??= { calls: 0, used: new Set(), ready: [] }; role.calls += row.calls; role.used.add(row.world.name); }
    for (const item of items) if (item.world) (met[roleOf(item.world)] ??= { calls: 0, used: new Set(), ready: [] }).ready.push(item);
    const metState = id => !met[id] ? 'none' : met[id].calls > 0 ? 'met' : 'ready';

    const fail = (error, retry) => notify(error?.message || c.loadFailed, { kind: 'error', ...(retry ? { action: { label: c.retry, run: retry } } : {}) });
    const loadWorld = async (refresh = false) => {
      request.current?.abort(); const controller = new AbortController(); request.current = controller; setBusy(true);
      const live = () => mounted.current && request.current === controller && !controller.signal.aborted;
      let refreshed = false;
      try {
        if (refresh) { await api.worldRequest({ action: 'refresh' }, controller.signal); if (!live()) return; refreshed = true; }
        const value = await api.worldRequest({ action: 'all' }, controller.signal);
        if (!live()) return;
        if (refreshed && world?.available) { const before = new Set(world.models.map(model => model.id)), added = value.models.filter(model => !before.has(model.id)).map(model => model.id); setFresh(added); notify(value.index?.error ? `${c.indexRefreshFailed}${value.index.error}` : added.length ? `${c.refreshOk}：新增 ${added.length} 个模型` : c.refreshOk, value.index?.error ? { kind: 'error' } : added.length ? { action: { label: '去看看', run: () => setTab('new') } } : undefined); }
        else if (refreshed) notify(c.refreshOk);
        setWorld(value);
      } catch (error) {
        // 本地写入结果没确认时不再联网重试，只给“重新读取”核对。
        const unknown = String(error.code ?? '') === 'WORLD_STORAGE_UNKNOWN', again = refresh && !refreshed && !unknown;
        if (live()) notify([refreshed ? c.refreshReadback : refresh ? c.refreshFail : '', error.message || c.loadFailed, unknown && c.storageUnknown].filter(Boolean).join(' · '), { kind: 'error', action: { label: again ? c.retryRefresh : refresh ? c.readback : c.retry, run: () => loadWorld(again) } });
      } finally { if (mounted.current && request.current === controller) { request.current = null; setBusy(false); } }
    };
    const loadMine = async () => {
      try {
        const [catalog, spent, history] = await Promise.all([api.deskRequest({ action: 'mine' }), api.deskRequest({ action: 'usage', days: periodDays(period) }), api.deskRequest({ action: 'probes' })]);
        if (!mounted.current) return;
        setMine(catalog); setUsage(spent); setRuns(history.runs);
      } catch (error) { if (mounted.current) { setMine({ failed: error?.message || c.loadFailed, groups: [], used: [], mapping: {}, supported: {}, issues: [], defaultModel: null }); } }
    };
    const loadUsage = async key => { setPeriod(key); try { const value = await api.deskRequest({ action: 'usage', days: periodDays(key) }); if (mounted.current) setUsage(value); } catch (error) { fail(error, () => loadUsage(key)); } };
    useEffect(() => { mounted.current = true; loadWorld(); loadMine(); return () => { mounted.current = false; request.current?.abort(); probing.current?.abort(); }; }, []);

    const open = (value, element) => { if (element) trigger.current = element; setDialog(value); };
    const detail = (model, event) => open({ kind: 'detail', id: model.id }, event?.currentTarget);
    const togglePick = model => setPicks(previous => previous.includes(model.id) ? previous.filter(id => id !== model.id) : previous.length < 4 ? [...previous, model.id] : previous);
    const pickButton = (model, compact = true) => { const on = picks.includes(model.id), full = !on && picks.length >= 4, label = on ? '移出比一比' : full ? '比一比最多放 4 个' : '加入比一比';
      return h('button', { type: 'button', className: compact ? 'ww-mw-iconbtn' : '', 'aria-pressed': on, disabled: full, title: label, 'aria-label': `${label}：${model.name}`, onClick: () => togglePick(model) }, icon(on ? icons.check : icons.plus), !compact && (on ? '已加入' : '比一比')); };
    const nameButton = model => h('button', { type: 'button', className: 'ww-mw-name', title: '看详情', onClick: event => detail(model, event) }, model.name);
    const target = item => ({ provider: item.provider, model: item.model, ...(item.defaultEffort ? { effort: item.defaultEffort } : {}) });
    const openChat = async item => {
      try { await api.openChat(target(item)); }
      catch (error) { notify(`对话没有开成：${error?.message || c.loadFailed}`, { kind: 'error', ...(error?.sessionId ? { action: { label: '打开已建的对话', run: () => api.openSession(error.sessionId) } } : {}) }); }
    };
    const toProbe = keys => { setProbe(previous => ({ ...previous, who: keys.slice(0, 4) })); setDialog(null); setTab('probe'); };
    const toDuel = ids => { setDuel(previous => ({ ...previous, slots: [ids[0] ?? null, ids[1] ?? null], active: ids[0] && !ids[1] ? 1 : 0 })); setDialog(null); setTab('duel'); };
    const setDefault = async item => {
      setDialog(null);
      try { const result = await api.deskRequest({ action: 'setDefault', ...target(item) }); setMine(previous => previous && { ...previous, defaultModel: result.defaultModel }); notify(`DSH 的默认模型换成了 ${item.world?.name ?? item.name}，新开的对话会用它`); }
      catch (error) { fail(error); }
    };
    const saveMapping = async (item, modelId) => {
      setDialog(null);
      try { const result = await api.deskRequest({ action: 'setMapping', provider: item.provider, model: item.model, modelId }); setMine(previous => previous && { ...previous, mapping: result.mapping }); notify(modelId ? `已对应到 ${byId.get(modelId)?.name ?? modelId}，只改了鲸翼这边` : '已取消手动对应'); }
      catch (error) { fail(error); }
    };

    // ---------- 我的模型 ----------
    const today = usage?.today ?? dayOf(Date.now());
    const spentOf = () => { const days = usage?.days ?? [], total = days.reduce((sum, day) => addUsage(sum, day), emptyUsage()); return { days, total, ...worldSpend((usage?.rows ?? []).filter(row => usageTokens(row) > 0), row => usedWorld(row, items, models)) }; };
    const myCard = item => {
      const world = item.world, usedRow = usedRows.find(row => row.provider === item.provider && row.model === item.model), channel = [item.providerName, channelText[item.kind], item.kind === 'relay' && item.host].filter(Boolean).join(' · ');
      return h('article', { key: item.key, className: 'ww-mw-mycard', 'data-default': item.isDefault },
        h('header', null, mini(world), h('div', { className: 'ww-mw-grow' }, world ? nameButton(world) : h('strong', null, item.name), h('small', null, channel)),
          item.isDefault && h('span', { className: 'ww-mw-badge' }, '默认'), world && tierBadge(world.rating?.tier)),
        world ? h('div', { className: 'ww-mw-dims' }, h('div', { className: 'ww-mw-dim' }, h('span', null, c.overall), h('i', null, h('b', { style: { width: `${Math.min(100, world.rating?.overall ?? 0)}%` } })), h('span', null, world.rating?.overall ?? '—')),
          ...dims.map(([key, dimension]) => h('div', { key, className: 'ww-mw-dim' }, h('span', null, dimension.name), h('i', null, h('b', { style: { width: `${world.rating?.[key] ?? 0}%` } })), h('span', null, world.rating?.[key] ?? '—'))))
          : h('p', { className: 'ww-mw-hint' }, '没对上模型世界的型号，看不到成绩和价格。可以手动指一个。'),
        h('small', { className: 'ww-mw-meta' }, [world && (priceOf(world) ? `官网价 ${priceOf(world)}` : '官网价未公布'), world && !item.exact && !item.mapped && `按名字对到 ${world.name}`, item.mapped && '手动对应', usedRow ? `用过 ${worldCount(usedRow.tokens)} tokens` : '还没用过'].filter(Boolean).join(' · ')),
        h('footer', null, mine.supported.selectModel && button([icon(icons.chat), '开个对话'], () => openChat(item)), world && pickButton(world, false), h('span', { className: 'ww-mw-grow' }),
          h(ActionMenu, { label: `${item.name} 的更多操作`, iconOnly: true },
            world && button(c.detail, event => detail(world, event)), world && mine.supported.probe && button('测一测它', () => toProbe([item.key])),
            mine.supported.setDefault && button(item.isDefault ? '已是默认模型' : '设成默认模型', () => open({ kind: 'default', key: item.key }), { disabled: item.isDefault }),
            button(item.mapped ? '改手动对应' : world ? '对得不对？手动对应' : '手动对应', () => open({ kind: 'map', key: item.key })))));
    };
    const minePage = () => {
      if (!mine) return h('div', { className: 'ww-mw-skeleton', role: 'progressbar', 'aria-label': '我的模型' });
      if (mine.failed) return empty('没读到你在 DSH 里配的模型', mine.failed, button(c.retry, () => { setMine(null); loadMine(); }));
      if (!mine.supported.catalog) return empty('当前 DSH 读不到模型列表', '这一版 DSH 没有开放模型目录，「我的模型」用不了；实力榜、图鉴和对决照常能用。', button('先看实力榜', () => setTab('rank')));
      if (!items.length) return empty('还没在 DSH 里配模型', '在 DSH 的设置里加好模型后，这里会列出你能用的每个模型：实力排第几、官网价多少、这个月用了多少，有更划算的换法也会提醒你。', button('先看实力榜', () => setTab('rank')));
      const order = item => (item.isDefault ? 0 : 1) * 1e18 - (usedRows.find(row => row.provider === item.provider && row.model === item.model)?.tokens ?? 0) - (item.world?.rating?.overall ?? 0);
      const sorted = [...items].sort((a, b) => order(a) - order(b)), shown = showAll ? sorted : sorted.slice(0, 12), spent = spentOf();
      const tips = mineAdvice(items, models, today).filter(tip => !hidden[tip.id]).slice(0, 3);
      const tipText = tip => { const model = byId.get(tip.model); return tip.kind === 'pricier' ? [`${model.name} 不比 ${byId.get(tip.instead).name} 强，官网价却是它的 ${tip.times} 倍`, '同一家里你已经配了更划算的那个，这类活可以换过去。'] : tip.kind === 'newer' ? [`${vendorName(model)}出了新型号 ${model.name}`, `${model.releaseDate} 发布${model.rating?.overall != null ? `，综合 ${model.rating.overall}` : '，还没有评测成绩'}${priceOf(model) ? `，官网价 ${priceOf(model)}` : ''}。`] : [`${model.name} 开「${worldEffortText(tip.effort, c)}」就够`, `成绩 ${tip.index}，最强档「${worldEffortText(tip.top, c)}」是 ${tip.topIndex}，消耗少 ${tip.saving}%。`]; };
      const peak = Math.max(1, ...spent.days.map(day => usageTokens(day))), top = Math.max(1, ...spent.rows.map(row => usageTokens(row)));
      const def = items.find(item => item.isDefault);
      return h(React.Fragment, null,
        h('div', { className: 'ww-mw-overview' }, h('div', { className: 'ww-mw-grow' }, h('strong', null, `你在 DSH 里配了 ${items.length} 个模型，${items.filter(item => item.world).length} 个对上了模型世界`), h('small', null, `默认模型：${def ? def.world?.name ?? def.name : '—'} · 模型列表来自 DSH 设置，这里只读`)),
          h('div', { className: 'ww-mw-stat' }, h('small', null, `${periods[period]}用了`), h('strong', null, worldCount(usageTokens(spent.total)))), h('div', { className: 'ww-mw-stat' }, h('small', null, '大约花了'), h('strong', null, spent.text))),
        mine.issues.length > 0 && h('p', { className: 'ww-mw-hint', role: 'status' }, `有 ${mine.issues.length} 个渠道没读出来：${mine.issues[0]}`),
        section('我在用的', '默认模型在前，用得多的在前', null, h('div', { className: 'ww-mw-mygrid' }, ...shown.map(myCard)), sorted.length > shown.length && button(`显示全部 ${sorted.length} 个`, () => setShowAll(true))),
        tips.length > 0 && section('可以试试', '只从你已经配好的模型里看', null, h('div', { className: 'ww-mw-tips' }, ...tips.map(tip => { const [title, text] = tipText(tip), model = byId.get(tip.model), other = tip.instead && byId.get(tip.instead);
          return h('article', { key: tip.id, className: 'ww-mw-tip' }, mini(model), h('div', { className: 'ww-mw-grow' }, h('strong', null, title), h('p', null, text),
            h('div', { className: 'ww-mw-actions' }, other && button('并排比较', event => { setPicks([model.id, other.id]); open({ kind: 'compare', ids: [model.id, other.id] }, event.currentTarget); }), button(c.detail, event => detail(model, event)))),
            h('button', { type: 'button', className: 'ww-mw-iconbtn', 'aria-label': '不再提示这一条', title: '不再提示', onClick: () => setHidden(previous => ({ ...previous, [tip.id]: true })) }, icon(icons.close))); }))),
        section('花了多少', spent.days[0] && `${spent.days[0].day.slice(5)} 至今`, h('div', { className: 'ww-mw-boards', role: 'group', 'aria-label': '时间' }, ...Object.entries(periods).map(([key, label]) => chip(label, period === key, () => loadUsage(key), { key }))),
          h('div', { className: 'ww-mw-spend' },
            h('div', { className: 'ww-mw-spend-sum' }, h('small', null, '大约花了'), h('strong', null, spent.text), h('small', null, `${worldCount(usageTokens(spent.total))} tokens · ${spent.total.calls.toLocaleString('en-US')} 次调用`),
              h('div', { className: 'ww-mw-daybars', role: 'img', 'aria-label': '每天用量' }, ...spent.days.map(day => h('i', { key: day.day, title: `${day.day.slice(5)}：${worldCount(usageTokens(day))} tokens`, style: { height: `${Math.max(2, usageTokens(day) / peak * 100)}%` } }))),
              h('p', { className: 'ww-mw-hint' }, `用量来自 DSH 的会话记录，只在这台电脑上算；${usage?.since ? `${usage.since} 起逐次记账，之前的按每个会话的总数补记到它最后活动那天。` : ''}花费按官网价估算，转发站、包月套餐以账单为准；人民币和美元分开记，不换算。`)),
            h('div', { className: 'ww-mw-spend-list' }, spent.rows.length === 0 ? h('p', { className: 'ww-mw-hint' }, '这段时间还没有用量。') : spent.rows.map(row => h('div', { key: `${row.provider}\n${row.model}`, className: 'ww-mw-spend-row' }, mini(row.world),
              h('div', { className: 'ww-mw-grow' }, h('strong', null, row.world?.name ?? row.model), h('small', null, `${row.provider} · ${worldCount(usageTokens(row))} tokens · 缓存命中 ${Math.round(row.cacheReadTokens / Math.max(1, usageTokens(row)) * 100)}%`), h('i', { className: 'ww-mw-meter' }, h('b', { style: { width: `${usageTokens(row) / top * 100}%` } }))),
              h('span', null, `${row.calls.toLocaleString('en-US')} 次`), h('strong', null, row.cost ? worldMoney(row.cost.amount, row.cost.currency) : '—')))))));
    };

    // ---------- 实力榜 ----------
    const patchRank = value => setRank(previous => ({ ...previous, page: 0, ...value }));
    const rankModels = () => { const text = rank.query.trim().toLowerCase(), vendors = new Set((world?.vendors ?? []).filter(vendor => `${vendor.name} ${vendor.nameZh} ${vendor.id}`.toLowerCase().includes(text)).map(vendor => vendor.id));
      return models.filter(model => (!rank.vendorId || model.vendorId === rank.vendorId) && (!rank.onlyMine || mineIds.has(model.id)) && (!text || `${model.name} ${model.id}`.toLowerCase().includes(text) || vendors.has(model.vendorId))); };
    const scatter = points => {
      // 横轴是相对消耗（对数），纵轴是能力分：越靠左上越划算。
      const usable = points.filter(point => point.cost > 0), xs = usable.map(point => Math.log10(point.cost)), ys = usable.map(point => point.index);
      if (!usable.length) return empty(null, c.empty);
      const x0 = Math.min(...xs) - .1, x1 = Math.max(...xs) + .1, y0 = Math.min(...ys) - 2, y1 = Math.max(...ys) + 2, px = value => 56 + (Math.log10(value) - x0) / (x1 - x0) * 724, py = value => 380 - (value - y0) / (y1 - y0) * 360;
      const ticks = [1, 5, 20, 50, 100, 200, 400, 1000].filter(value => Math.log10(value) >= x0 && Math.log10(value) <= x1);
      return h('div', { className: 'ww-mw-scatter' }, h('svg', { viewBox: '0 0 800 420', role: 'img', 'aria-label': '能力和消耗的散点图' },
        ...ticks.map(value => h('g', { key: `x${value}` }, h('line', { x1: px(value), x2: px(value), y1: 20, y2: 380, className: 'ww-mw-grid' }), h('text', { x: px(value), y: 398, textAnchor: 'middle' }, value))),
        ...[0, 1, 2, 3, 4].map(step => { const value = Math.round(y0 + (y1 - y0) * step / 4); return h('g', { key: `y${step}` }, h('line', { x1: 56, x2: 780, y1: py(value), y2: py(value), className: 'ww-mw-grid' }), h('text', { x: 48, y: py(value) + 4, textAnchor: 'end' }, value)); }),
        h('text', { x: 418, y: 416, textAnchor: 'middle' }, `${c.cost}（越靠左越省）`), h('text', { x: 14, y: 200, textAnchor: 'middle', transform: 'rotate(-90 14 200)' }, c.index),
        ...usable.map(point => h('circle', { key: point.key, cx: px(point.cost), cy: py(point.index), r: point.mine ? 7 : 5, className: 'ww-mw-dot', 'data-mine': point.mine, 'data-frontier': point.frontier, tabIndex: 0, role: 'button', 'aria-label': `${point.label}：${c.index} ${point.index}，${c.cost} ${worldCostText(point.cost)}`,
          onClick: event => detail(point.model, event), onKeyDown: event => { if (event.key === 'Enter') detail(point.model, event); } }, h('title', null, `${point.label}\n${c.index} ${point.index} · ${c.cost} ${worldCostText(point.cost)}${point.mine ? '\n你配好的' : ''}`)))),
        h('p', { className: 'ww-mw-hint' }, '实心的是你配好的模型；描边加粗的是“同价最强”。点一个点看详情。'));
    };
    const rankPage = () => {
      const list = rankModels(), value = rank.board === 'value', canScatter = value || rank.board === 'overall';
      const toolbar = h('form', { className: 'ww-mw-toolbar', onSubmit: event => event.preventDefault() },
        h('input', { ref: fallback, type: 'search', 'aria-label': c.search, placeholder: c.search, maxLength: 160, value: rank.query, onChange: event => patchRank({ query: event.target.value }) }),
        h('select', { 'aria-label': c.all, value: rank.vendorId, onChange: event => patchRank({ vendorId: event.target.value }) }, h('option', { value: '' }, c.all), ...(world?.vendors ?? []).map(vendor => h('option', { key: vendor.id, value: vendor.id }, vendor.nameZh || vendor.name))),
        toggle('只看我能用的', rank.onlyMine, () => patchRank({ onlyMine: !rank.onlyMine }), { disabled: !mineIds.size, title: mineIds.size ? undefined : '先在 DSH 里配好模型' }),
        canScatter && h('div', { className: 'ww-mw-boards', role: 'group', 'aria-label': '看法' }, chip('表格', rank.view === 'table', () => patchRank({ view: 'table' })), chip('散点图', rank.view === 'scatter', () => patchRank({ view: 'scatter' }))));
      const boards = h('div', { className: 'ww-mw-boards', role: 'group', 'aria-label': c.board }, ...Object.entries(worldBoards).map(([id, name]) => chip(name, rank.board === id, () => patchRank({ board: id }), { key: id })),
        !value && rank.view === 'table' && button(`${rank.direction === 'asc' ? '↑' : '↓'} ${rank.direction === 'asc' ? c.ascending : c.descending}`, () => patchRank({ direction: rank.direction === 'asc' ? 'desc' : 'asc' }), { className: 'ww-mw-sort', title: c.sortToggle, 'aria-label': `${c.sort}：${rank.direction === 'asc' ? c.ascending : c.descending}，${c.sortToggle}` }));
      let body;
      if (value) {
        const { bands, plans } = worldValuePlans(list.filter(model => model.efforts.length).map(model => ({ id: model.id, name: model.name, vendorId: model.vendorId, efforts: model.efforts })));
        const label = plan => [plan.name, worldEffortText(plan.effort, c)].filter(Boolean).join(' · '), planRow = plan => { const model = byId.get(plan.modelId); return h('div', null, mini(model), h('div', { className: 'ww-mw-model-name' }, h('button', { type: 'button', className: 'ww-mw-name', onClick: event => detail(model, event) }, label(plan)), h('small', null, [vendorName(model), mineIds.has(model.id) && '你配好的'].filter(Boolean).join(' · '))), pickButton(model)); };
        body = !plans.length ? empty(null, c.empty) : rank.view === 'scatter' ? scatter(plans.map(plan => ({ key: plan.key, label: label(plan), cost: plan.cost, index: plan.index, frontier: plan.frontier, mine: mineIds.has(plan.modelId), model: byId.get(plan.modelId) })))
          : h(React.Fragment, null,
            h('div', { className: 'ww-mw-bands' }, ...bands.filter(band => band.best).map(band => h('article', { key: band.id, className: 'ww-mw-band' }, h('small', null, band.name), h('div', { className: 'ww-mw-cell-model' }, planRow(band.best)),
              h('p', null, h('strong', null, `${c.index} ${band.best.index}`), ` · ${c.cost} ${worldCostText(band.best.cost)}`), band.alternatives.length > 0 && h('small', null, `${c.alternatives}：${band.alternatives.map(plan => `${label(plan)} ${plan.index}`).join('；')}`)))),
            h('div', { className: 'ww-mw-actions' }, h('h3', null, c.plans), button(rank.allPlans ? c.showFrontier : c.showAll, () => patchRank({ allPlans: !rank.allPlans }))),
            h('div', { className: 'ww-mw-table-wrap' }, h('table', { className: 'ww-mw-table' }, h('thead', null, h('tr', null, ...[c.rank, c.plans, c.index, c.cost, c.frontier].map(text => h('th', { key: text, scope: 'col' }, text)))),
              h('tbody', null, ...plans.filter(plan => rank.allPlans || plan.frontier).map((plan, index) => h('tr', { key: plan.key, 'data-mine': mineIds.has(plan.modelId) }, h('td', { className: 'ww-mw-rank', 'data-top': index < 3 }, index + 1), h('td', { className: 'ww-mw-cell-model' }, planRow(plan)), h('td', { className: 'ww-mw-barcell' }, bar(plan.index)), h('td', { className: 'ww-mw-score' }, worldCostText(plan.cost)), h('td', null, plan.frontier ? h('span', { className: 'ww-mw-badge' }, c.frontier) : null)))))));
      } else {
        const metric = model => model.rating[rank.board], rated = list.filter(model => metric(model) !== null).sort((a, b) => (rank.direction === 'asc' ? 1 : -1) * (metric(a) - metric(b)) || (b.rating.overall ?? 0) - (a.rating.overall ?? 0) || a.id.localeCompare(b.id));
        const size = 20, pages = Math.max(1, Math.ceil(rated.length / size)), page = Math.min(rank.page, pages - 1), rows = rated.slice(page * size, page * size + size);
        const cost = model => model.efforts.find(item => item.effort === model.rating.effort)?.cost ?? model.efforts[0]?.cost ?? null;
        body = !rated.length ? empty(null, c.empty) : rank.view === 'scatter' && rank.board === 'overall' ? scatter(rated.filter(model => cost(model) !== null).map(model => ({ key: model.id, label: model.name, cost: cost(model), index: model.rating.overall, mine: mineIds.has(model.id), model })))
          : h(React.Fragment, null, h('div', { className: 'ww-mw-table-wrap' }, h('table', { className: 'ww-mw-table' },
            h('thead', null, h('tr', null, ...[c.rank, c.model, c.tier, c.overall, ...dims.map(([, dimension]) => dimension.name), '官网价（输入 / 输出）'].map((text, index) => h('th', { key: index, scope: 'col' }, text)))),
            h('tbody', null, ...rows.map((model, index) => { const place = page * size + index + 1; return h('tr', { key: model.id, 'data-mine': mineIds.has(model.id) },
              h('td', { className: 'ww-mw-rank', 'data-top': rank.direction !== 'asc' && place <= 3 }, place),
              h('td', { className: 'ww-mw-cell-model' }, h('div', null, mini(model), h('div', { className: 'ww-mw-model-name' }, nameButton(model), h('small', null, [vendorName(model), model.releaseDate, mineIds.has(model.id) && '你配好的'].filter(Boolean).join(' · '))), pickButton(model))),
              h('td', null, tierBadge(model.rating.tier)), h('td', { className: 'ww-mw-score' }, model.rating.overall ?? c.noScore, model.rating.effort && h('small', { className: 'ww-mw-effort' }, worldEffortText(model.rating.effort, c))),
              ...dims.map(([key]) => h('td', { key, className: 'ww-mw-barcell' }, bar(model.rating[key]))), h('td', { className: 'ww-mw-price' }, priceOf(model) ?? '—')); })))),
          pages > 1 && h('footer', { className: 'ww-mw-page' }, h('span', null, `${page * size + 1}–${page * size + rows.length} / ${rated.length}`), button(c.previous, () => setRank(previous => ({ ...previous, page: page - 1 })), { disabled: page === 0 }), button(c.next, () => setRank(previous => ({ ...previous, page: page + 1 })), { disabled: page >= pages - 1 })));
      }
      return h(React.Fragment, null, boards, toolbar, body, h('p', { className: 'ww-mw-hint' }, '价格：国产模型是厂商官网的人民币标价，海外模型是公开目录里的美元价，都按每百万 tokens；转发站以账单为准。'));
    };

    // ---------- 新模型 ----------
    const newRow = model => h('article', { key: model.id, className: 'ww-mw-model-row' }, mini(model), h('div', { className: 'ww-mw-model-name' }, h('span', null, nameButton(model), fresh.includes(model.id) && h('span', { className: 'ww-mw-badge' }, '新'), mineIds.has(model.id) && h('span', { className: 'ww-mw-badge', 'data-tone': 'quiet' }, '你配好的')),
      h('small', null, [vendorName(model), model.releaseDate, model.contextWindow !== null && `${worldTokens(model.contextWindow)} ${c.context}`, priceOf(model)].filter(Boolean).join(' · '))),
      model.rating?.tier ? h(React.Fragment, null, h('span', { className: 'ww-mw-score' }, model.rating.overall), tierBadge(model.rating.tier)) : h('span', { className: 'ww-mw-tier', 'data-tier': 'none' }, '待评测'), pickButton(model));
    const newPage = () => {
      const mineVendors = new Set(items.filter(item => item.world).map(item => item.world.vendorId));
      const kept = models.filter(model => newFilter === 'all' || (newFilter === 'mine' ? mineVendors.has(model.vendorId) : newFilter === 'domestic' ? isDomesticVendor(model.vendorId) : !isDomesticVendor(model.vendorId)));
      const groups = worldMonthGroups(kept), recent = groups.slice(0, 6), rest = groups.slice(6), month = group => h('section', { key: group.month }, h('h3', { className: 'ww-mw-year' }, `${group.month.slice(0, 4)} 年 ${Number(group.month.slice(5))} 月`, h('small', null, `${group.models.length} 个`)), h('div', { className: 'ww-mw-row-list' }, ...group.models.map(newRow)));
      return h(React.Fragment, null,
        h('div', { className: 'ww-mw-boards', role: 'group', 'aria-label': '筛选' }, ...[['all', '全部'], ['mine', '我在用的厂商'], ['domestic', '国产'], ['overseas', '海外']].map(([key, label]) => chip(label, newFilter === key, () => setNewFilter(key), { key, disabled: key === 'mine' && !mineVendors.size }))),
        recent.length ? h('div', { className: 'ww-mw-timeline' }, ...recent.map(month)) : empty(null, c.empty),
        rest.length > 0 && button(older ? '收起更早的' : `更早的（${rest.reduce((sum, group) => sum + group.models.length, 0)} 个）`, () => setOlder(!older)), older && h('div', { className: 'ww-mw-timeline' }, ...rest.map(month)),
        h('p', { className: 'ww-mw-hint' }, '模型目录来自 models.dev；缺发布日期的不列在这里，可以在实力榜里搜到。点「更新数据」后新进来的会标「新」。'));
    };

    // ---------- 角色图鉴 ----------
    const roleModels = id => models.filter(model => roleOf(model) === id);
    const viewerRoles = worldRoleIds.filter(zoomable).map(id => ({ id, name: roleTitle(id) }));
    const openViewer = (id, element) => setViewer({ items: viewerRoles, index: Math.max(0, viewerRoles.findIndex(role => role.id === id)), returnFocus: element, key: `${id}-${Date.now()}` });
    const galleryPage = () => {
      const known = Boolean(mine && !mine.failed && mine.supported?.catalog), count = worldRoleIds.filter(id => metState(id) === 'met').length, roles = worldRoleIds.filter(id => own(id) && (!onlyMet || metState(id) === 'met'));
      const card = id => { const list = roleModels(id), best = list.filter(model => model.rating.overall !== null).sort((a, b) => b.rating.overall - a.rating.overall)[0], state = metState(id), persona = worldPersonas[id], title = roleTitle(id);
        return h('div', { key: id, className: 'ww-mw-role-slot', 'data-met': known ? state : 'met' },
          h('button', { type: 'button', className: 'ww-mw-role', 'aria-label': `${title} 的角色档案`, onClick: event => open({ kind: 'profile', id }, event.currentTarget) },
            h('div', { className: 'ww-mw-role-art' }, h(Portrait, { vendorId: roleVendor(id), modelId: id === roleVendor(id) ? '' : id })),
            h('span', { className: 'ww-mw-role-text' }, h('strong', null, title), best ? h('span', { className: 'ww-mw-role-top' }, tierBadge(best.rating.tier), h('span', null, `${c.strongest} ${best.name}`)) : null, h('small', null, `${list.length} ${c.models} · ${persona?.title ?? ''}`))),
          known && (state === 'met' ? h('span', { className: 'ww-mw-met', 'data-state': 'met' }, `已相遇 · 聊过 ${met[id].calls.toLocaleString('en-US')} 次`)
            : state === 'ready' ? h('button', { type: 'button', className: 'ww-mw-met', 'data-state': 'ready', title: '已经在 DSH 里配好，用它聊一次就点亮', onClick: () => openChat(met[id].ready[0]) }, '已配好 · 去打个招呼')
              : h('a', { className: 'ww-mw-met', 'data-state': 'none', href: modelWorldPlatforms[roleVendor(id)], target: '_blank', rel: 'noopener noreferrer', title: `去${title}的开放平台申请 API Key` }, '未相遇 · 去开放平台', icon(icons.out, 11))),
          zoomable(id) && h('button', { type: 'button', className: 'ww-mw-zoom', 'aria-label': `${c.viewLarge}：${title}`, title: c.viewLarge, onClick: event => openViewer(id, event.currentTarget) }, kit.zoomGlyph())); };
      return h(React.Fragment, null,
        h('div', { className: 'ww-mw-galbar' }, known ? h(React.Fragment, null, h('span', null, '已相遇'), h('i', { className: 'ww-mw-meter' }, h('b', { style: { width: `${count / worldRoleIds.length * 100}%` } })), h('strong', null, `${count} / ${worldRoleIds.length}`), h('small', null, '在 DSH 里用哪家的模型聊过，她就自动点亮'), h('span', { className: 'ww-mw-grow' }), toggle('只看相遇过的', onlyMet, () => setOnlyMet(!onlyMet)))
          : h('small', null, '在 DSH 里配好模型、聊过以后，对应的角色会自动点亮')),
        roles.length ? h('div', { className: 'ww-mw-deck' }, ...roles.map(card)) : empty(null, '还没有相遇过的角色'),
        h('p', { className: 'ww-mw-hint' }, '相遇是鲸翼读 DSH 的会话用量自动算的：某次对话用了哪个模型，就算和她家相遇；只配好、还没聊过的显示「已配好」；没配的可以直接去她家的开放平台。用转发站也算，只要型号能对上。'));
    };

    // ---------- 对决 ----------
    const duelFilter = duel.filter || (items.filter(item => item.world?.rating?.overall != null).length >= 2 ? 'mine' : 'top');
    const duelList = () => { const text = duel.query.trim().toLowerCase(), seen = new Set();
      return models.filter(model => model.rating.overall !== null).sort((a, b) => b.rating.overall - a.rating.overall || a.id.localeCompare(b.id))
        .filter(model => duelFilter === 'mine' ? mineIds.has(model.id) : duelFilter === 'top' ? !seen.has(roleOf(model)) && seen.add(roleOf(model)) : true)
        .filter(model => !text || `${model.name} ${vendorName(model)}`.toLowerCase().includes(text)).slice(0, 80); };
    const putDuel = model => setDuel(previous => { const slots = [...previous.slots], at = slots.indexOf(model.id), other = 1 - previous.active;
      if (at === previous.active) slots[at] = null; else { if (at === other) slots[other] = slots[previous.active]; slots[previous.active] = model.id; }
      return { ...previous, slots, active: slots[previous.active] && !slots[other] ? other : previous.active }; });
    const duelPage = () => {
      const sides = ['左边', '右边'], ready = duel.slots[0] && duel.slots[1], list = duelList();
      const slot = index => { const model = byId.get(duel.slots[index]), active = duel.active === index;
        return h('div', { key: index, className: 'ww-mw-slot', 'data-active': active, 'data-side': index ? 'right' : 'left' },
          h('button', { type: 'button', className: 'ww-mw-slot-main', 'aria-pressed': active, 'aria-label': model ? `${sides[index]}：${model.name}，点这里换人` : `选${sides[index]}`, onClick: () => setDuel(previous => ({ ...previous, active: index })) },
            model ? h('span', { className: 'ww-mw-slot-art' }, h(Portrait, { vendorId: model.vendorId, modelId: model.id })) : h('span', { className: 'ww-mw-slot-art', 'data-empty': true }, '?'),
            h('span', { className: 'ww-mw-slot-text' }, h('small', null, `${sides[index]}${active ? ' · 正在选' : ''}`), h('strong', null, model ? model.name : active ? '从下面的名单里点一位' : `点这里选${sides[index]}`), model && h('span', null, tierBadge(model.rating.tier), h('b', null, model.rating.overall), vendorName(model)))),
          model && h('button', { type: 'button', className: 'ww-mw-iconbtn ww-mw-slot-x', 'aria-label': `把${sides[index]}空出来`, title: '空出来', onClick: () => setDuel(previous => ({ ...previous, slots: previous.slots.map((id, at) => at === index ? null : id), active: index })) }, icon(icons.close, 12))); };
      const random = () => { const pool = list.length >= 2 ? list : models.filter(model => model.rating.overall !== null); if (pool.length < 2) return; const first = pool[Math.floor(Math.random() * pool.length)], rest = pool.filter(model => model.id !== first.id && roleOf(model) !== roleOf(first)), others = rest.length ? rest : pool.filter(model => model.id !== first.id); setDuel(previous => ({ ...previous, slots: [first.id, others[Math.floor(Math.random() * others.length)].id] })); };
      return h(React.Fragment, null,
        h('section', { className: 'ww-mw-desk', 'aria-label': '对决台' }, h('div', { className: 'ww-mw-desk-row' }, slot(0), h('span', { className: 'ww-mw-desk-vs', 'aria-hidden': true }, 'VS'), slot(1)),
          h('div', { className: 'ww-mw-actions' }, h('small', { className: 'ww-mw-grow' }, ready ? '两位都就位了。' : '点下面名单里的模型，放进亮着的那一边；放好一边会自动跳到另一边。'), button([icon(icons.swap), '换边'], () => setDuel(previous => ({ ...previous, slots: [previous.slots[1], previous.slots[0]] })), { disabled: !duel.slots[0] && !duel.slots[1] }), button('随机一场', random),
            button([icon(icons.bolt), '开打'], event => open({ kind: 'duel', ids: [...duel.slots] }, event.currentTarget), { className: 'ww-primary', disabled: !ready, title: ready ? undefined : '先选好两位' }))),
        section('选手名单', `点一下放进${sides[duel.active]}，按综合实力从高到低`, h(React.Fragment, null,
          h('input', { type: 'search', className: 'ww-mw-search', 'aria-label': c.search, placeholder: c.search, value: duel.query, onChange: event => setDuel(previous => ({ ...previous, query: event.target.value })) }),
          h('div', { className: 'ww-mw-boards', role: 'group', 'aria-label': '名单范围' }, ...[['mine', '我能用的'], ['top', '每家最强'], ['all', '全部']].map(([key, label]) => chip(label, duelFilter === key, () => setDuel(previous => ({ ...previous, filter: key })), { key, disabled: key === 'mine' && !mineIds.size })))),
          list.length ? h('div', { className: 'ww-mw-roster' }, ...list.map(model => { const at = duel.slots.indexOf(model.id); return h('button', { key: model.id, type: 'button', className: 'ww-mw-rost', 'aria-pressed': at >= 0, onClick: () => putDuel(model) }, mini(model), h('span', { className: 'ww-mw-grow' }, h('strong', null, model.name), h('small', null, vendorName(model))), tierBadge(model.rating.tier), h('b', null, model.rating.overall), at >= 0 && h('span', { className: 'ww-mw-side' }, at ? '右' : '左')); }))
            : empty(null, duelFilter === 'mine' && !duel.query ? '你配好的模型里还没有带综合实力分的，换到「每家最强」看看' : c.empty)),
        h('p', { className: 'ww-mw-hint' }, '对决只看综合实力：分高的一方每回合都打得更重，分差越大，胜方剩的体力越多，胜负在开打前就定了，看个热闹。想知道手上的模型真实水平、有没有被掺水，用「模型测智」。'));
    };

    // ---------- 模型测智 ----------
    const columnKey = record => `${record.provider}\n${record.model}`, rowKey = record => `${record.testId}|${record.classic ? 1 : 0}`;
    const probeWho = probe.who ?? (() => { const def = items.find(item => item.isDefault) ?? items[0], relay = items.find(item => item.kind === 'relay' && item !== def); return [def, relay].filter(Boolean).map(item => item.key); })();
    const patchProbe = value => setProbe(previous => ({ ...previous, ...value }));
    const startProbe = () => {
      const targets = probeWho.map(key => items.find(item => item.key === key)).filter(Boolean), rows = probeTests.filter(test => probe.what.includes(test.id)).flatMap(test => [{ testId: test.id, classic: false }, ...(probe.classic ? [{ testId: test.id, classic: true }] : [])]);
      if (!targets.length || !rows.length) return;
      const runId = `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, seed = Math.floor(Math.random() * 0xffffffff), controller = new AbortController();
      probing.current?.abort(); probing.current = controller;
      const run = { runId, at: new Date().toISOString(), seed, stars: {}, records: [], cells: rows.flatMap(row => targets.map(item => ({ ...row, provider: item.provider, model: item.model }))) };
      patchProbe({ who: probeWho, run, view: run, live: true });
      const settle = record => { if (mounted.current) setProbe(previous => previous.run?.runId !== runId ? previous : (next => ({ ...previous, run: next, view: previous.view?.runId === runId ? next : previous.view }))({ ...previous.run, records: [...previous.run.records.filter(item => rowKey(item) !== rowKey(record) || columnKey(item) !== columnKey(record)), record] })); };
      // 每个模型一条队，一题一题答；几个模型同时进行。
      Promise.all(targets.map(async item => { for (const row of rows) {
        if (controller.signal.aborted) break;
        try { settle(await api.deskRequest({ action: 'probe', runId, testId: row.testId, seed, classic: row.classic, ...target(item) }, controller.signal)); }
        catch (error) { if (!controller.signal.aborted) settle({ runId, at: new Date().toISOString(), ...row, seed: row.classic ? 0 : seed, provider: item.provider, model: item.model, effort: null, ms: 0, usage: null, finish: 'error', error: error?.message || c.loadFailed, reply: '', grade: { made: null, pass: false, answer: null, expect: null, note: error?.message || c.loadFailed } }); }
      } })).then(async () => {
        if (!mounted.current) return;
        if (probing.current === controller) probing.current = null;
        setProbe(previous => previous.run?.runId === runId ? { ...previous, live: false } : previous);
        try { setRuns((await api.deskRequest({ action: 'probes' })).runs); } catch { /* 记录下次打开再读 */ }
        if (!controller.signal.aborted) notify('测完了，结果记在「测智记录」里');
      });
    };
    const stopProbe = () => { probing.current?.abort(); probing.current = null; patchProbe({ live: false }); notify('已停止，答完的结果留着'); };
    const openRun = async summary => { try { const full = await api.deskRequest({ action: 'probeRun', runId: summary.runId }); if (mounted.current) patchProbe({ view: { ...full, seed: full.records.find(record => !record.classic)?.seed ?? 0 } }); } catch (error) { fail(error); } };
    const starRun = async (run, row, key) => { const next = run.stars[row] === key ? null : key;
      setProbe(previous => { const patch = value => value?.runId === run.runId ? { ...value, stars: Object.fromEntries(Object.entries({ ...value.stars, [row]: next }).filter(([, entry]) => entry)) } : value; return { ...previous, run: patch(previous.run), view: patch(previous.view) }; });
      try { await api.deskRequest({ action: 'probeStar', runId: run.runId, row, key: next }); setRuns((await api.deskRequest({ action: 'probes' })).runs); } catch (error) { fail(error); } };
    const nameOfColumn = key => { const item = items.find(entry => entry.key === key); return { item, name: item?.world?.name ?? item?.name ?? key.split('\n')[1], provider: item?.providerName ?? key.split('\n')[0] }; };
    const costOf = record => { const world = usedWorld(record, items, models), cost = world && record.usage ? usageCost(world, record.usage) : null; return cost ? `约 ${worldMoney(cost.amount, cost.currency)}` : record.usage ? `${worldCount(usageTokens(record.usage))} tokens` : ''; };
    const probeCell = (run, row, key) => {
      const record = run.records.find(item => rowKey(item) === row && columnKey(item) === key), test = probeTest(row.split('|')[0]);
      if (!record) return h('div', { className: 'ww-mw-pc', 'data-state': 'wait' }, run.cells && probe.live && probe.run?.runId === run.runId ? h(React.Fragment, null, h('span', { className: 'ww-mw-spin', 'aria-hidden': true }), '正在答…') : '没有结果');
      const grade = record.grade, artifact = test.kind === 'text' ? null : probeArtifact(test.kind, record.reply ?? ''), view = event => open({ kind: 'probe', runId: run.runId, row, key }, event.currentTarget), starred = run.stars[row] === key;
      const main = artifact ? test.kind === 'svg' ? h('button', { type: 'button', className: 'ww-mw-pc-art', title: '放大看', onClick: view }, h('img', { src: probeSvgUrl(artifact), alt: `${test.name}的作品` })) : h('div', { className: 'ww-mw-pc-art', 'data-frame': true }, frame(artifact, `${test.name}的作品`), h('button', { type: 'button', onClick: view }, '放大看'))
        : test.kind === 'text' && !record.error ? h('button', { type: 'button', className: 'ww-mw-pc-ans', 'data-pass': grade.pass === true, title: '看完整回答', onClick: view }, h('strong', null, grade.pass ? '答对' : '答错'), h('span', null, grade.answer !== null ? `它答：${grade.answer}` : grade.note))
          : h('button', { type: 'button', className: 'ww-mw-pc-ans', 'data-pass': false, onClick: view }, h('strong', null, '没做出来'), h('span', null, grade.note));
      return h('div', { className: 'ww-mw-pc' }, main, h('div', { className: 'ww-mw-pc-foot' },
        grade.made === true && h('span', { className: 'ww-mw-badge', 'data-tone': 'ok', title: '回答里带着这次的口令和指定颜色' }, '现做'), grade.made === false && h('span', { className: 'ww-mw-badge', 'data-tone': 'warn', title: grade.note }, '不像现做的'),
        h('small', null, [`${(record.ms / 1000).toFixed(1)} 秒`, costOf(record)].filter(Boolean).join(' · ')),
        test.judge === 'eye' && artifact && h('button', { type: 'button', className: 'ww-mw-iconbtn ww-mw-star', 'aria-pressed': starred, title: starred ? '取消最佳' : '这一题里这个最好', 'aria-label': starred ? '取消最佳' : '标成这一题的最佳', onClick: () => starRun(run, row, key) }, icon(icons.star))));
    };
    const probeGrid = run => {
      const columns = [...new Set([...(run.cells ?? []), ...run.records].map(columnKey))], rows = [...new Set([...(run.cells ?? []), ...run.records].map(rowKey))].sort((a, b) => probeTests.findIndex(test => test.id === a.split('|')[0]) - probeTests.findIndex(test => test.id === b.split('|')[0]) || a.localeCompare(b));
      const question = row => { const [id, classic] = row.split('|'); return probeQuestion(id, run.records.find(record => rowKey(record) === row)?.seed ?? run.seed ?? 0, classic === '1'); };
      return h('div', { className: 'ww-mw-pgrid', style: { '--n': columns.length } }, h('div', { className: 'ww-mw-pg-h' }),
        ...columns.map(key => { const { item, name, provider } = nameOfColumn(key); return h('div', { key, className: 'ww-mw-pg-h' }, mini(item?.world), h('span', null, h('strong', null, name), h('small', null, [provider, item && channelText[item.kind], item?.world?.rating?.tier && `榜上 ${item.world.rating.tier}`].filter(Boolean).join(' · ')))); }),
        ...rows.flatMap(row => { const test = probeTest(row.split('|')[0]), asked = question(row); return [
          h('div', { key: row, className: 'ww-mw-pg-t' }, h('strong', null, test.name, asked.classic && h('span', { className: 'ww-mw-badge', 'data-tone': 'quiet' }, '原题')), h('small', null, asked.classic ? '不带口令，只作对照' : asked.brief), button('看题目', event => open({ kind: 'probe', runId: run.runId, row, key: null }, event.currentTarget))),
          ...columns.map(key => h('div', { key: `${row}${key}`, className: 'ww-mw-pg-c' }, probeCell(run, row, key)))]; }),
        h('div', { className: 'ww-mw-pg-t' }, h('strong', null, '小结'), h('small', null, '只算现出的题')),
        ...columns.map(key => { const done = run.records.filter(record => columnKey(record) === key && !record.classic), { item } = nameOfColumn(key), summary = probeSummary(done.map(record => ({ id: record.testId, ...record.grade })), item?.world?.rating?.tier ?? null);
          return h('div', { key: `sum${key}`, className: 'ww-mw-pg-c ww-mw-psum' }, !done.length ? h('small', null, '还没有结果') : h(React.Fragment, null, h('strong', null, summary.total ? `自动判的 ${summary.total} 题对 ${summary.right} 题` : '看图题请自己看'),
            summary.doubt === 'canned' && h('span', { className: 'ww-mw-badge', 'data-tone': 'warn' }, `${summary.canned} 题不像现做的，可能是预制答案`), summary.doubt === 'weak' && h('span', { className: 'ww-mw-badge', 'data-tone': 'warn' }, `榜上 ${item.world.rating.tier}，却错了 ${summary.total - summary.right} 题`),
            summary.doubt ? h('small', null, '这个渠道可能被掺水或降智，换官方渠道再测一次对比。') : summary.total > 0 && summary.right === summary.total && h('small', null, '和它在榜上的水平对得上。'))); }));
    };
    const probePage = () => {
      if (!mine) return h('div', { className: 'ww-mw-skeleton', role: 'progressbar', 'aria-label': '模型测智' });
      if (!items.length || !mine.supported.probe) return empty(items.length ? '当前 DSH 不能直接调用模型' : '先在 DSH 里配好模型', items.length ? '这一版 DSH 没有开放直接调用模型的接口，模型测智用不了。' : '模型测智是拿社区里最常用的几道题，测你自己配好的模型：到底几斤几两、有没有被转发站掺水。配好模型后回到这里。');
      const calls = probeWho.length * probe.what.length * (probe.classic ? 2 : 1), book = new Map();
      for (const run of runs) for (const record of run.records) { if (record.classic) continue; const entry = book.get(columnKey(record)) ?? book.set(columnKey(record), { right: 0, total: 0, canned: 0, star: 0, last: run.at }).get(columnKey(record)); if (probeTest(record.testId).judge === 'auto') { entry.total += 1; if (record.grade.pass) entry.right += 1; } if (record.grade.made === false) entry.canned += 1; if (run.stars[rowKey(record)] === columnKey(record)) entry.star += 1; }
      return h(React.Fragment, null,
        h('p', { className: 'ww-mw-lead' }, '社区里最常用的几道题，拿来测你自己配好的模型：到底几斤几两，有没有被转发站掺水。', h('strong', null, '每次出题都现换'), '动物、数字和颜色，画图和写代码的题还带一个本次的随机口令，提前写好的“预制答案”对不上。用的是你自己的额度，直接调模型，不在对话列表里留会话。'),
        h('section', { className: 'ww-mw-pset' },
          h('div', { className: 'ww-mw-pline' }, h('strong', null, '测谁'), h('div', { className: 'ww-mw-grow ww-mw-boards' }, ...items.slice(0, 60).map(item => { const on = probeWho.includes(item.key); return chip([item.world && mini(item.world), item.world?.name ?? item.name, h('small', { key: 'p' }, item.providerName)], on, () => patchProbe({ who: on ? probeWho.filter(key => key !== item.key) : [...probeWho, item.key] }), { key: item.key, disabled: probe.live || (!on && probeWho.length >= 4) }); })), h('small', null, '最多 4 个')),
          h('div', { className: 'ww-mw-ptests' }, ...probeTests.map(test => { const on = probe.what.includes(test.id); return h('button', { key: test.id, type: 'button', className: 'ww-mw-ptest', 'aria-pressed': on, disabled: probe.live, onClick: () => patchProbe({ what: on ? probe.what.filter(id => id !== test.id) : [...probe.what, test.id] }) },
            h('span', null, h('strong', null, test.name), h('span', { className: 'ww-mw-badge', 'data-tone': 'quiet' }, test.skill), h('span', { className: 'ww-mw-badge', 'data-tone': test.judge === 'auto' ? 'ok' : undefined }, test.judge === 'auto' ? '自动判分' : '自己看图'), h('i', { 'aria-hidden': true }, icon(icons.check, 11))), h('span', null, test.intro), h('small', null, `出自 ${test.origin}`)); })),
          h('div', { className: 'ww-mw-actions' }, toggle('同时发一遍社区原题做对照', probe.classic, () => patchProbe({ classic: !probe.classic }), { disabled: probe.live }), h('small', { className: 'ww-mw-grow' }, '原题可能被转发站认出来、直接发回预制答案'),
            button(probe.what.length === probeTests.length ? '只留三道' : '六道全选', () => patchProbe({ what: probe.what.length === probeTests.length ? ['pelican', 'candy', 'carwash'] : probeTests.map(test => test.id) }), { disabled: probe.live }),
            probe.live ? button('停止', stopProbe) : button([icon(icons.flask), `开始测（${calls} 次调用）`], startProbe, { className: 'ww-primary', disabled: !calls, title: calls ? undefined : '至少选一个模型、一道题' }))),
        probe.view && section(probe.live && probe.view === probe.run ? '正在测' : '测智结果', `${worldTime(probe.view.at) ?? ''} · 每个模型答的是同一道现出的题`, null, probeGrid(probe.view)),
        book.size > 0 && section('成绩册', '所有记录合在一起，只存在这台电脑上', null, h('div', { className: 'ww-mw-table-wrap' }, h('table', { className: 'ww-mw-table' }, h('thead', null, h('tr', null, ...['模型', '渠道', '自动判的题', '看图题最佳', '不像现做', '最近一次'].map(text => h('th', { key: text, scope: 'col' }, text)))),
          h('tbody', null, ...[...book.entries()].sort((a, b) => (b[1].total ? b[1].right / b[1].total : 0) - (a[1].total ? a[1].right / a[1].total : 0)).map(([key, entry]) => { const { item, name, provider } = nameOfColumn(key); return h('tr', { key }, h('td', { className: 'ww-mw-cell-model' }, h('div', null, mini(item?.world), h('strong', null, name))), h('td', null, provider), h('td', null, entry.total ? `对 ${entry.right} / ${entry.total}` : '—'), h('td', null, entry.star || '—'), h('td', null, entry.canned ? h('span', { className: 'ww-mw-badge', 'data-tone': 'warn' }, `${entry.canned} 次`) : '—'), h('td', null, worldTime(entry.last) ?? '')); }))))),
        runs.length > 0 && section('测智记录', '点开能再看当时的题目和回答', null, h('div', { className: 'ww-mw-row-list' }, ...runs.map(run => h('article', { key: run.runId, className: 'ww-mw-model-row' }, h('div', { className: 'ww-mw-model-name' }, h('button', { type: 'button', className: 'ww-mw-name', onClick: () => openRun(run) }, [...new Set(run.records.filter(record => !record.classic).map(record => probeTest(record.testId).name))].join('、') || '原题对照'),
          h('small', null, [worldTime(run.at), [...new Set(run.records.map(columnKey))].map(key => nameOfColumn(key).name).join('、'), `${run.records.length} 次调用`].filter(Boolean).join(' · '))),
          h(ActionMenu, { label: '这一轮的更多操作', iconOnly: true }, button('再看一遍', () => openRun(run)), button('删掉这一轮', () => open({ kind: 'dropRun', runId: run.runId }))))))));
    };

    // ---------- 弹窗 ----------
    const close = () => setDialog(null);
    const dialogs = () => {
      if (!dialog) return null;
      if (dialog.kind === 'detail') { const model = byId.get(dialog.id); if (!model) return null; const item = itemOf(model), vendorId = model.vendorId;
        return h(Modal, { title: model.name, onClose: close, className: 'ww-mw-modal' }, h('div', { className: 'ww-mw-modal-body' }, h('div', { className: 'ww-mw-detail' },
          h('aside', { className: 'ww-mw-detail-art' }, kit.detailArt(model, vendorName(model), loadLarge ? (role, element) => setViewer({ items: [role], index: 0, returnFocus: element, key: `${role.id}-${Date.now()}` }) : undefined, c), h('h3', null, vendorName(model))),
          h('div', { className: 'ww-mw-detail-main' },
            item ? h('div', { className: 'ww-mw-mine-row' }, h('span', { className: 'ww-mw-grow' }, h('strong', null, '你配好了这个模型'), `：${item.providerName}${item.isDefault ? '，是默认模型' : ''}`), mine.supported.selectModel && button([icon(icons.chat), '开个对话'], () => openChat(item)), mine.supported.probe && button('测一测它', () => toProbe([item.key])))
              : mine?.groups && h('div', { className: 'ww-mw-mine-row', 'data-none': true }, h('span', { className: 'ww-mw-grow' }, '你还没配这个模型。去厂商的开放平台申请 Key，在 DSH 里配上就能用。'), modelWorldPlatforms[vendorId] && outLink(modelWorldPlatforms[vendorId], '去开放平台')),
            h(Rating, { model, copy: c }), h(Efforts, { model, copy: c }), h(Benchmarks, { model }), h(Metrics, { model, copy: c, known: true }), h('p', { className: 'ww-mw-duel-help' }, isDomesticVendor(vendorId) ? c.priceUnitCny : c.priceUnit)))),
          h('footer', { className: 'ww-dialog-actions' }, pickButton(model, false), h('span', { className: 'ww-mw-grow' }), homepages[vendorId] && outLink(homepages[vendorId], '官网'), modelWorldPlatforms[vendorId] && outLink(modelWorldPlatforms[vendorId], '开放平台'), button(c.close, close))); }
      if (dialog.kind === 'compare') { const list = dialog.ids.map(id => byId.get(id)).filter(Boolean); if (list.length < 2) return null;
        const best = values => { const numbers = values.filter(value => typeof value === 'number'); return numbers.length > 1 && new Set(numbers).size > 1 ? Math.max(...numbers) : null; };
        const lines = [[c.overall, list.map(model => model.rating.overall), true], ...dims.map(([key, dimension]) => [dimension.name, list.map(model => model.rating[key]), true]), [c.tier, list.map(model => model.rating.tier)], [c.release, list.map(model => model.releaseDate)], [c.context, list.map(model => worldTokens(model.contextWindow))], ['官网价（输入 / 输出）', list.map(priceOf)], ['你配好了吗', list.map(model => itemOf(model) ? `配好了 · ${itemOf(model).providerName}` : '没配')]];
        return h(Modal, { title: `并排比较 · ${list.length} 个模型`, onClose: close, className: 'ww-mw-modal' }, h('div', { className: 'ww-mw-modal-body' }, h('div', { className: 'ww-mw-table-wrap' }, h('table', { className: 'ww-mw-table ww-mw-cmp' },
          h('thead', null, h('tr', null, h('th', null), ...list.map(model => h('th', { key: model.id, scope: 'col' }, h('div', { className: 'ww-mw-cell-model' }, h('div', null, mini(model), h('div', { className: 'ww-mw-model-name' }, nameButton(model), h('small', null, vendorName(model))))))))),
          h('tbody', null, ...lines.map(([label, values, numeric]) => { const top = numeric ? best(values) : null; return h('tr', { key: label }, h('th', { scope: 'row' }, label), ...values.map((value, index) => h('td', { key: index, 'data-best': top !== null && value === top }, value ?? '—'))); })))),
          h('p', { className: 'ww-mw-hint' }, '加粗的是这一行最高的。分项是第三方评测的百分位，个别单项由综合分低的一方领先很正常。')),
          h('footer', { className: 'ww-dialog-actions' }, h('span', { className: 'ww-mw-grow' }), list.length === 2 && button([icon(icons.bolt), '动画对决'], () => setDialog({ kind: 'duel', ids: list.map(model => model.id) })), list.some(itemOf) && mine?.supported.probe && button('去测智', () => toProbe(list.map(itemOf).filter(Boolean).map(item => item.key))), button(c.close, close))); }
      if (dialog.kind === 'duel') { const list = dialog.ids.map(id => byId.get(id)); if (list.some(model => !model)) return null; const mineKeys = list.map(itemOf).filter(Boolean).map(item => item.key);
        return h(DuelWindow, { key: dialog.ids.join('|'), models: list, vendorName, onClose: close, onBack: () => toDuel(dialog.ids), onProbe: mineKeys.length && mine?.supported.probe ? () => toProbe(mineKeys) : null }); }
      if (dialog.kind === 'profile') { const id = dialog.id, persona = worldPersonas[id], vendorId = roleVendor(id), state = metState(id), role = met[id], list = roleModels(id), best = list.filter(model => model.rating.overall !== null).sort((a, b) => b.rating.overall - a.rating.overall)[0], title = roleTitle(id);
        const history = list.filter(model => model.releaseDate && (model.rating.overall !== null || fresh.includes(model.id))).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)).slice(0, 7);
        return h(Modal, { title: `${title} · ${persona?.title ?? ''}`, onClose: close, className: 'ww-mw-modal' }, h('div', { className: 'ww-mw-modal-body' }, h('div', { className: 'ww-mw-detail' },
          h('aside', { className: 'ww-mw-detail-art' }, zoomable(id) ? h('button', { type: 'button', className: 'ww-mw-art-zoom', 'aria-label': `${c.viewLarge}：${title}`, onClick: event => openViewer(id, event.currentTarget) }, h(Portrait, { vendorId, modelId: id === vendorId ? '' : id }), h('span', { className: 'ww-mw-art-hint', 'aria-hidden': true }, kit.zoomGlyph(), c.viewLarge)) : h(Portrait, { vendorId, modelId: id === vendorId ? '' : id })),
          h('div', { className: 'ww-mw-detail-main' }, h('p', { className: 'ww-mw-quote' }, persona?.line), h('div', { className: 'ww-mw-tags' }, ...(persona?.tags ?? []).map(tag => h('span', { key: tag }, tag)), h('span', { 'data-skill': true }, `必杀 · ${battleKit(id).skill}`)),
            h('p', { className: 'ww-mw-kit' }, h('strong', null, '对决里'), `是${battleKit(id).job}，使${battleKit(id).weapon}：${battleKit(id).moves.map(move => move.name).join('、')}；必杀「${battleKit(id).skill}」。`),
            mine?.groups && (state === 'met' ? h('div', { className: 'ww-mw-mine-row' }, h('span', { className: 'ww-mw-grow' }, h('strong', null, '已相遇'), `：用 ${[...role.used].join('、')} 聊过 ${role.calls.toLocaleString('en-US')} 次`), role.ready[0] && mine.supported.selectModel && button([icon(icons.chat), '再聊一次'], () => openChat(role.ready[0])))
              : state === 'ready' ? h('div', { className: 'ww-mw-mine-row' }, h('span', { className: 'ww-mw-grow' }, h('strong', null, '已配好，还没说过话'), `：DSH 里有 ${role.ready.map(item => item.world.name).join('、')}，用它聊一次就点亮`), mine.supported.selectModel && button([icon(icons.chat), '去打个招呼'], () => openChat(role.ready[0]), { className: 'ww-primary' }))
                : h('div', { className: 'ww-mw-mine-row', 'data-none': true }, h('div', { className: 'ww-mw-grow' }, h('strong', null, '还没相遇'), h('ol', null, h('li', null, '去她家的开放平台申请一个 API Key'), h('li', null, '在 DSH 的模型设置里配上'), h('li', null, '回来用它聊一次，她就点亮了'))), modelWorldPlatforms[vendorId] && outLink(modelWorldPlatforms[vendorId], '去开放平台', 'ww-mw-link-primary'))),
            best && h('div', null, h('h3', null, '最强型号'), h('div', { className: 'ww-mw-row-list' }, h('article', { className: 'ww-mw-model-row' }, mini(best), h('div', { className: 'ww-mw-model-name' }, nameButton(best), h('small', null, [`综合 ${best.rating.overall}`, best.releaseDate, priceOf(best)].filter(Boolean).join(' · '))), tierBadge(best.rating.tier)))),
            history.length > 0 && h('div', null, h('h3', null, '型号演进'), h('ol', { className: 'ww-mw-evo' }, ...history.map(model => h('li', { key: model.id, 'data-top': model === best }, h('small', null, model.releaseDate), nameButton(model), role?.used.has(model.name) && h('span', { className: 'ww-mw-badge', 'data-tone': 'quiet' }, '用过'), tierBadge(model.rating.tier), h('b', null, model.rating.overall ?? ''))))),
            h('p', { className: 'ww-mw-hint' }, '角色是鲸翼原创的非官方拟人形象，档案按立绘设定写，不代表厂商。')))),
          h('footer', { className: 'ww-dialog-actions' }, button(`看这家的全部 ${list.length} 个模型`, () => { patchRank({ board: 'overall', view: 'table', vendorId, query: '' }); close(); setTab('rank'); }), h('span', { className: 'ww-mw-grow' }), homepages[vendorId] && outLink(homepages[vendorId], '官网'), modelWorldPlatforms[vendorId] && outLink(modelWorldPlatforms[vendorId], '开放平台'), button(c.close, close))); }
      if (dialog.kind === 'probe') { const run = [probe.view, probe.run].find(value => value?.runId === dialog.runId); if (!run) return null;
        const [id, classic] = dialog.row.split('|'), test = probeTest(id), record = dialog.key && run.records.find(item => rowKey(item) === dialog.row && columnKey(item) === dialog.key), asked = probeQuestion(id, run.records.find(item => rowKey(item) === dialog.row)?.seed ?? run.seed ?? 0, classic === '1'), artifact = record && test.kind !== 'text' ? probeArtifact(test.kind, record.reply ?? '') : null;
        return h(Modal, { title: `${test.name} · ${record ? nameOfColumn(dialog.key).name : '题目'}`, onClose: close, className: 'ww-mw-modal ww-mw-pv' }, h('div', { className: 'ww-mw-modal-body' },
          h('div', { className: 'ww-mw-pv-q' }, h('small', null, asked.classic ? '社区原题（不带口令，只作对照）' : `这次现出的题：${asked.brief}`), h('p', null, asked.prompt), asked.expect ? h('small', null, `正确答案：${asked.expect}${asked.classic ? '' : '（按这次的数字现算的）'}`) : asked.nonce && h('small', null, `口令 ${asked.nonce[0]}、指定颜色 ${asked.nonce[1]}：回答里都有，才算按这次的题现做的`)),
          record && h('p', { className: 'ww-mw-pv-v', 'data-bad': record.grade.made === false || record.grade.pass === false }, record.grade.note, h('small', null, [`${(record.ms / 1000).toFixed(1)} 秒`, costOf(record)].filter(Boolean).join(' · '))),
          artifact && h('div', { className: 'ww-mw-pv-art', 'data-frame': test.kind === 'html' }, test.kind === 'svg' ? h('img', { src: probeSvgUrl(artifact), alt: `${test.name}的作品` }) : frame(artifact, `${test.name}的作品`)),
          record && h('details', { open: !artifact }, h('summary', null, '模型的原始回答'), h('pre', null, record.reply || '（没有内容）')),
          test.kind !== 'text' && h('p', { className: 'ww-mw-hint' }, test.kind === 'html' ? '网页放在隔离的框里运行，不能联网，碰不到 DSH。' : 'SVG 按图片显示，里面的脚本不会运行。')),
          h('footer', { className: 'ww-dialog-actions' }, h('span', { className: 'ww-mw-grow' }), button(c.close, close))); }
      if (dialog.kind === 'map') { const item = items.find(entry => entry.key === dialog.key); return item ? h(MapWindow, { key: item.key, item, models, onClose: close, onSave: modelId => saveMapping(item, modelId) }) : null; }
      if (dialog.kind === 'default') { const item = items.find(entry => entry.key === dialog.key); return item ? h(ConfirmDialog, { title: '设成默认模型', message: `把 DSH 的默认模型换成「${item.world?.name ?? item.name}」（${item.providerName}）？这会改 DSH 的设置：之后新开的对话用它，已有的对话不变。`, confirmLabel: '设成默认', cancelLabel: c.cancel, onCancel: close, onConfirm: () => setDefault(item) }) : null; }
      if (dialog.kind === 'dropRun') return h(ConfirmDialog, { title: '删掉这一轮测智记录', message: '这一轮的题目、回答和评分都会删掉，不能恢复。', confirmLabel: '删掉', cancelLabel: c.cancel, danger: true, onCancel: close, onConfirm: async () => { close(); try { const result = await api.deskRequest({ action: 'probeDelete', runId: dialog.runId }); setRuns(result.runs); setProbe(previous => ({ ...previous, view: previous.view?.runId === dialog.runId ? null : previous.view })); notify('这一轮记录已删掉'); } catch (error) { fail(error); } } });
      return null;
    };

    // ---------- 页面 ----------
    const persistedFailure = world?.lastRefresh?.status === 'error' ? world.lastRefresh : null;
    const updatedDay = world?.acceptedAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(world.acceptedAt)) : '';
    const summary = !world ? c.summaryLoading : !world.available ? c.summaryEmpty : [c.summary.replace('{vendors}', world.vendors.length).replace('{models}', world.modelCount), updatedDay && c.summaryDate.replace('{date}', updatedDay)].filter(Boolean).join(' · ');
    const pickedModels = picks.map(id => byId.get(id)).filter(Boolean), pickedMine = pickedModels.map(itemOf).filter(Boolean);
    const page = !world ? h('div', { className: 'ww-mw-skeleton', role: 'progressbar', 'aria-label': c.title })
      : !world.available && tab !== 'mine' ? empty(c.summaryEmpty, c.noSnapshot, button(c.refresh, () => loadWorld(true), { className: 'ww-primary', disabled: busy }))
        : ({ mine: minePage, rank: rankPage, new: newPage, gallery: galleryPage, duel: duelPage, probe: probePage })[tab]();
    return h('section', { className: 'ww-mw', 'aria-label': c.title }, h('style', null, kit.css),
      h('header', { className: 'ww-mw-header' }, h('div', null, h('h2', null, c.title), h('p', { className: 'ww-mw-summary' }, summary)), h('div', { className: 'ww-mw-header-actions' },
        busy && world && h('span', { className: 'ww-mw-status ww-mw-status-late', role: 'status' }, c.updating, button(c.cancel, () => { request.current?.abort(); request.current = null; setBusy(false); notify(c.stopped, { kind: 'error', action: { label: c.readback, run: () => loadWorld(false) } }); })),
        !busy && persistedFailure && h('span', { className: 'ww-mw-status ww-mw-status-warn', title: persistedFailure.message }, c.refreshFail, button(c.readback, () => loadWorld(false))),
        world?.index && button(c.indexButton, event => { trigger.current = event.currentTarget; setKeyWindow(true); }, { 'aria-haspopup': 'dialog' }),
        button(c.refresh, () => loadWorld(true), { disabled: busy }))),
      h('nav', { className: 'ww-mw-tabs', 'aria-label': c.title }, ...worldTabs.map(([id, label]) => button([label, id === 'new' && fresh.length > 0 && tab !== 'new' && h('i', { key: 'dot', className: 'ww-mw-dot-new', title: '有新模型' })], () => setTab(id), { key: id, 'aria-pressed': tab === id }))),
      h('div', { className: 'ww-mw-body', 'data-tab': tab }, page),
      pickedModels.length > 0 && h('div', { className: 'ww-mw-selected', role: 'region', 'aria-label': '比一比' }, h('span', null, `比一比 · ${pickedModels.length}/4`), ...pickedModels.map(model => button([mini(model), `${model.name} ×`], () => togglePick(model), { key: model.id, className: 'ww-mw-chip', 'aria-label': `移出比一比 ${model.name}` })), h('span', { className: 'ww-mw-grow' }),
        button('并排比较', event => open({ kind: 'compare', ids: picks }, event.currentTarget), { disabled: pickedModels.length < 2, title: pickedModels.length < 2 ? '至少放两个' : undefined }),
        button(pickedModels.length === 2 ? '动画对决' : '去对决台', event => pickedModels.length === 2 ? open({ kind: 'duel', ids: picks }, event.currentTarget) : toDuel(picks), { disabled: pickedModels.length > 2, title: pickedModels.length > 2 ? '动画对决只能两位' : undefined }),
        button('去测智', () => toProbe(pickedMine.map(item => item.key)), { disabled: !pickedMine.length || !mine?.supported.probe, title: pickedMine.length ? undefined : '测智只能测你在 DSH 里配好的模型' }), button(c.clear, () => setPicks([]))),
      world && h('details', { className: 'ww-mw-about' }, h('summary', null, c.about), h('p', null, c.method.replace('{asOf}', world.index?.asOf ?? worldIndexAsOf).replace('{tiers}', worldTierText())), h('p', null, c.valueMethod), world.available && h('p', null, `${c.generated} ${worldTime(world.generatedAt) ?? c.unknown} · ${c.accepted} ${worldTime(world.acceptedAt) ?? c.unknown}`), h('p', null, c.artCredit), ...world.attributions.map(item => h('p', { key: item.name }, link(item.url, item.name), ' · ', item.licenseUrl ? link(item.licenseUrl, item.license) : item.license))),
      dialogs(),
      viewer && h(PortraitViewer, { key: viewer.key, items: viewer.items, start: viewer.index, returnFocus: viewer.returnFocus, onClose: () => setViewer(null), notify, copy: c }),
      keyWindow && world?.index && h(KeyWindow, { index: world.index, api, notify, onClose: () => setKeyWindow(false), onChange: index => setWorld(previous => previous && { ...previous, index }), returnFocus: trigger.current, fallbackFocus: fallback, copy: c }));
  };
}
