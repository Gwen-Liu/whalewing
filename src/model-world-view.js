import { worldBenchmarks, worldBoards, worldDimensions } from '../features/model-world/contract.js';
import { portraitIdFor } from './model-world-roster.js';
import { watermarkedJpeg, portraitFileName } from './model-world-watermark.js';
import { worldEfforts, worldIndexAsOf } from './model-world-index.js';
import { aaLinks } from './model-world-aa.js';
import { isDomesticVendor, worldCnyPriceAsOf, worldPriceText } from './model-world-cny-prices.js';
import { createBattle } from './model-world-battle.js';
import { createModelWorldPages } from './model-world-pages.js';
import { worldPagesCss } from './model-world-style.js';

/** 角色只表达厂商身份；评测、日期与价格始终消费模型数据服务的已接纳事实。 */
export const worldViewCopy = Object.freeze({
  title: '模型世界', summaryLoading: '正在读取模型数据…', summaryEmpty: '还没有模型数据', summary: '{vendors} 家厂商 · {models} 个模型', summaryDate: '{date} 更新', gallery: '角色图鉴', timeline: '发布时间线', ranking: '实力榜',
  refresh: '更新数据', refreshOk: '模型数据已更新', refreshFail: '更新未完成', search: '搜索模型或厂商', searchGo: '查找', all: '全部厂商', capability: '全部能力',
  reasoning: '推理', toolCall: '工具调用', structuredOutput: '结构化输出', promptCaching: '提示词缓存', back: '返回角色图鉴', empty: '没有符合条件的模型',
  noSnapshot: '还没有模型数据，点击“更新数据”获取', retry: '重试', retryRefresh: '重试更新', readback: '重新读取', refreshReadback: '数据已更新，列表读取失败', storageUnknown: '本地数据写入结果未确认，请重启 DSH 后重新读取', stopped: '已停止等待，更新可能已完成，可重新读取核对', cancel: '取消', close: '关闭', detail: '详情', duel: '对决',
  pick: '加入对决', picked: '已选', selectTwo: '两位模型已就位', clear: '清空', start: '开始对决', replay: '再来一次', cancelBattle: '停止', cancelled: '已停止',
  battling: '交锋中', tie: '平局', unknown: '—', noScore: '—', round: '回合', damage: '伤害', hp: '体力', ko: '倒下',
  incomparable: '双方缺少可比的评测成绩，无法判定胜负', reduced: '已按系统设置减少动画', missingStat: '缺少成绩，未能出手',
  about: '数据来源与算法', method: '综合实力：Artificial Analysis 智能指数（{asOf} 更新），取每个模型最强思考档的成绩。{tiers}。推理与知识、编程、智能体三个分项按第三方评测在全部模型中的百分位计算（0–100）。',
  valueMethod: '性价比：每个“模型 + 思考强度”算一个方案。先看消耗：相对消耗是跑一次评测任务的花费，以 $0.02 = 1；同一消耗档位里推荐能力分最高的方案。“同价最强”表示没有其他方案比它更省又不比它弱。',
  artCredit: '立绘 © 鲸翼 WhaleWing，依 CC BY-NC-SA 4.0 授权，商用需先取得作者授权；身上的模型标识归各厂商所有，角色为非官方拟人形象，与厂商无关。', overall: '综合实力', tier: '梯队', benchmarks: '评测成绩',
  effort: '思考强度', efforts: '各档成绩', index: '能力分', cost: '相对消耗', band: '消耗档位', recommend: '推荐方案', alternatives: '同档其他选择', frontier: '同价最强', plans: '方案', showAll: '显示全部方案', showFrontier: '只看同价最强', strongestTier: '最强档', noCost: '未公布',
  dealt: '造成', duelRule: '谁赢、胜方剩多少体力只看综合实力：分高的一方赢，分差越大剩得越多。过程每一场现排：谁先出手、用哪一招、每一击多重、有没有闪开和对拼都不固定，再来一次不会一模一样；伤害不超过 6 的一击算格挡。下方的推理、编程、智能体来自另一组第三方评测，个别单项由低分方领先属于正常。', duelBasis: '综合实力', duelFallback: '双方缺少综合实力分，按分项百分位判定',
  release: '发布日期', context: '上下文', output: '最大输出', cutoff: '知识截止', weights: '开放权重', license: '许可证', input: '输入模态', outputModal: '输出模态',
  priceInput: '输入价格', priceCached: '缓存输入价格', priceOutput: '输出价格', priceUnit: '海外模型价格：美元 / 百万 tokens，取自公开目录', priceUnitCny: `国产模型价格：人民币 / 百万 tokens，按厂商官网标价（${worldCnyPriceAsOf} 核对），官网未单列或尚未核对的不显示`, yes: '是', no: '否',
  generated: '数据生成于', accepted: '本机更新于', previous: '上一页', next: '下一页', descending: '从高到低', ascending: '从低到高', sortToggle: '切换排序方向', unrated: '评测不足',
  ...Object.fromEntries(Object.entries(worldEfforts).map(([key, value]) => [`effort_${key}`, value])),
  indexButton: '综合实力数据', indexTitle: '综合实力数据',
  indexIntro: '综合实力、梯队和性价比来自 Artificial Analysis。不填 Key 也能用，用的是随插件发布的数据；填上你自己的免费 API Key 后，点「更新数据」会把综合实力一起更新到最新。',
  indexNow: '当前使用', indexBundled: '随插件发布的数据', indexOnline: '在线更新的数据', indexAsOf: '截至',
  indexKeyNone: '还没有填写 Key', indexKeySaved: 'Key 已保存在本机', indexKeyEnv: 'Key 来自环境变量 WHALEWING_AA_API_KEY', indexKeyUnavailable: '当前 DSH 没有凭据服务，不能在这里保存 Key',
  indexLastError: '上次在线更新综合实力没有成功', indexStepsTitle: '获取自己的 Key',
  indexStep1: '打开', indexSignup: 'Artificial Analysis 登录页', indexStep1End: '，注册或登录账号（免费）。',
  indexStep2: '在 Insights Platform 里生成一个 API Key，说明见', indexDocs: '免费接口文档', indexStep2End: '。', indexStep3: '把 Key 粘贴到下面保存，再点「更新数据」。',
  indexKeyLabel: 'Artificial Analysis API Key', indexPaste: '粘贴你的 API Key', indexReplace: '粘贴新的 Key 可替换已保存的', indexSave: '保存', indexSaving: '正在保存',
  indexClear: '清除 Key', indexClearConfirm: '清除后，「更新数据」只用随插件发布的综合实力数据。确定清除？', indexClearYes: '确定清除',
  indexSaved: 'Key 已保存，点「更新数据」时会一起更新综合实力', indexCleared: 'Key 已清除，之后使用随插件发布的综合实力数据', indexSaveFailed: '保存没有成功',
  indexPrivacy: 'Key 只保存在本机 DSH 的凭据文件里，不进知识库、不随插件导出，只在更新时发给 Artificial Analysis。每次更新约用 4 次请求，免费额度每天 100 次。',
  indexRefreshFailed: '模型目录已更新，综合实力仍用之前的数据：',
  modalFailed: '窗口打开失败，请重试', loadFailed: '读取失败，请重试', updating: '正在更新数据',
  viewLarge: '查看大图', viewerTitle: '立绘大图', save: '保存图片', zoomIn: '放大', fit: '适应窗口', prevRole: '上一位', nextRole: '下一位',
  loadingLarge: '正在载入高清图', largeFailed: '高清图没有载入', saved: '已保存“{name}”，在浏览器的下载里',
  viewerNote: '原创立绘 © 鲸翼 WhaleWing。保存的图片右下角带鲸翼水印，可以自用和分享，不能商用（CC BY-NC-SA 4.0）。点图片放大，放大后可拖动查看细节，← → 切换角色。', missingDates: '个模型缺少发布日期', rank: '排名', model: '模型', left: '左方', right: '右方', wins: '获胜', remove: '移出对决', browse: '浏览', family: '的模型', models: '个模型', strongest: '最强', sort: '排序', actions: '操作', board: '榜单',
});

const scale = (value, unit, binary) => value % unit === 0 ? value / unit : value % binary === 0 ? value / binary : value / unit;
/** 上下文等 token 数按常见写法缩写（128K、1M），不改变原值的数量级。 */
export function worldTokens(value) {
  if (typeof value !== 'number') return null;
  if (value >= 1e6) return `${Number(scale(value, 1e6, 1048576).toFixed(1))}M`;
  if (value >= 1000) return `${Math.round(scale(value, 1000, 1024))}K`;
  return String(value);
}
/** 相对消耗：10 以上取整，以下保留一位小数。 */
export const worldCostText = value => typeof value !== 'number' ? null : value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
export const worldPrice = value => typeof value === 'number' ? `$${value}` : null;
/** 价格说明按币种给出：国产模型人民币官网价，海外模型美元目录价。 */
export const worldPriceNotes = (models, c = worldViewCopy) => [...new Set(models.map(model => isDomesticVendor(model.vendorId) ? c.priceUnitCny : c.priceUnit))];
export const worldTime = value => { const time = value ? new Date(value) : null; return time && Number.isFinite(time.getTime()) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(time) : null; };
/** 评测成绩按单位显示：百分比、Elo、分钟、美元或指数。 */
export function worldScoreText(score) {
  const value = Number(score.score.toFixed(score.unit === 'elo' || score.unit === 'usd' ? 0 : 1));
  return score.unit === 'pct' ? `${value}%` : score.unit === 'minutes' ? `${value} 分钟` : score.unit === 'usd' ? `$${value.toLocaleString('en-US')}` : String(value);
}

/** 对决回合：四个回合逐步加重，最后一回合决出胜负。 */
export const worldDuelRounds = Object.freeze([
  { id: 'probe', name: '试探' }, { id: 'clash', name: '交锋' }, { id: 'assault', name: '强攻' }, { id: 'finale', name: '决胜' },
]);
// 每回合占全场伤害的比例，越往后打得越重。
const duelWeights = [0.2, 0.22, 0.24, 0.34];

/** 思考强度的中文名；只有一档的模型不显示。 */
export const worldEffortText = (effort, c = worldViewCopy) => effort ? c[`effort_${effort}`] ?? effort : '';

/**
 * 确定性的对决剧本：胜负和每一方全场打出多少伤害只看综合实力（双方都缺时按分项加权百分位）。
 * 台上怎么演（谁先手、用哪招、每回合各打多少、闪开和对拼）由 model-world-battle.js 的 battlePlan 每场现排，结果不变。
 * 双方每回合各出手一次，先后手轮换；高分方每回合都比低分方打得重，最后一回合补上终结一击。
 * 胜方剩余体力 = 12 + 综合分差 × 6（上限 70），即低分方全场合计造成 100 − 剩余体力的伤害。综合实力相同则平局，双方各剩 35。
 */
export function worldDuelScript(models) {
  if (models.length !== 2 || models[0].id === models[1].id) return { kind: 'invalid', events: [] };
  let basis = 'overall', totals = models.map(model => model.rating?.overall ?? null);
  if (totals.includes(null)) { basis = 'composite'; totals = models.map(model => model.rating?.composite ?? null); }
  if (totals.includes(null)) return { kind: 'unknown', events: [] };
  const winner = totals[0] === totals[1] ? null : totals[0] > totals[1] ? 0 : 1;
  const keep = winner === null ? 35 : Math.min(70, Math.round(12 + Math.abs(totals[0] - totals[1]) * (basis === 'overall' ? 6 : 1.5)));
  const split = total => { const parts = duelWeights.map(weight => Math.round(total * weight)); parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0); return parts; };
  // dealt[i] = 第 i 方每回合造成的伤害。
  const dealt = winner === null ? [split(65), split(65)] : [0, 1].map(index => split(index === winner ? 100 : 100 - keep));
  const strong = winner ?? 0, weak = 1 - strong;
  const hp = [100, 100], events = [];
  worldDuelRounds.forEach((round, index) => {
    // 先后手轮换；最后一回合由低分方先出手，高分方终结。
    const order = index % 2 === 0 && index !== worldDuelRounds.length - 1 ? [strong, weak] : [weak, strong];
    for (const attacker of order) {
      hp[1 - attacker] = Math.max(0, hp[1 - attacker] - dealt[attacker][index]);
      events.push({ round: round.id, name: round.name, attacker, damage: dealt[attacker][index], hp: [...hp] });
    }
  });
  return winner === null ? { kind: 'tie', basis, totals, events, hp: [...hp] } : { kind: 'winner', winner, basis, totals, events, hp: [...hp] };
}

/** 对决记录按回合合并：每行列出双方各自造成的伤害和回合结束时的体力。 */
export function worldDuelLog(events) {
  const rows = [];
  for (const event of events) {
    if (rows.at(-1)?.round !== event.round) rows.push({ round: event.round, name: event.name, damage: [null, null], hp: event.hp });
    rows.at(-1).damage[event.attacker] = event.damage; rows.at(-1).hp = event.hp;
  }
  return rows;
}

export function worldTimelineGroups(models) {
  const groups = [];
  for (const model of models) {
    if (!model.releaseDate) continue;
    const year = model.releaseDate.slice(0, 4);
    if (groups.at(-1)?.year !== year) groups.push({ year, models: [] });
    groups.at(-1).models.push(model);
  }
  return groups;
}

/** 详情只列已知字段；对决两侧需逐行对齐，未知值保留为占位。 */
export function worldMetricRows(model, c = worldViewCopy, { known = false } = {}) {
  const value = input => input === null || input === undefined || input === '' ? null : typeof input === 'boolean' ? c[input ? 'yes' : 'no'] : String(input);
  const rows = [
    [c.release, model.releaseDate],
    [c.context, worldTokens(model.contextWindow)], [c.output, worldTokens(model.maxOutput)], [c.cutoff, model.knowledgeCutoff],
    [c.weights, model.openWeights], [c.license, model.license],
    [c.input, model.modalities?.input.join('、')], [c.outputModal, model.modalities?.output.join('、')],
    ...['reasoning', 'toolCall', 'structuredOutput', 'promptCaching'].map(key => [c[key], model.capabilities[key]]),
    [c.priceInput, worldPriceText(model, 'inputPerMTok')], [c.priceCached, worldPriceText(model, 'cachedInputPerMTok')], [c.priceOutput, worldPriceText(model, 'outputPerMTok')],
  ].map(([label, input]) => [label, value(input)]);
  return known ? rows.filter(([, input]) => input !== null) : rows.map(([label, input]) => [label, input ?? c.unknown]);
}

export const worldViewCss = `
.ww-mw-header-actions{display:flex;align-items:center;gap:10px}.ww-mw-status{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}.ww-mw-status-late{animation:ww-mw-late .2s ease-out .8s both}@keyframes ww-mw-late{from{opacity:0;visibility:hidden}to{opacity:1;visibility:visible}}@media(prefers-reduced-motion:reduce){.ww-mw-status-late{animation-duration:.01s}}.ww-mw-status-warn{color:#b45309}
.ww-mw-boards .ww-mw-sort{margin-left:auto;border-radius:8px!important}
.ww-page .ww-mw-toolbar{flex-wrap:wrap}.ww-page .ww-mw-toolbar input{flex:1 1 12.5rem;width:auto;min-width:min(100%,10rem)}.ww-page .ww-mw-toolbar select{flex:0 1 auto;width:auto;min-width:min(100%,8.75rem);max-width:min(100%,13.75rem)}.ww-page .ww-mw-toolbar button{flex:none}
.ww-mw{color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:18px;min-width:0;font-size:13px}.ww-mw h2,.ww-mw h3,.ww-mw-dialog h2,.ww-mw-dialog h3{font-weight:500;margin:0}.ww-mw p,.ww-mw-dialog p{margin:0}.ww-mw small,.ww-mw-dialog small{color:var(--dsw-alias-label-secondary);font-size:12px}
.ww-mw-header,.ww-mw-toolbar,.ww-mw-tabs,.ww-mw-page,.ww-mw-selected,.ww-mw-actions,.ww-mw-boards{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.ww-mw-header{justify-content:space-between}.ww-mw-header h2{font-size:24px}.ww-mw button,.ww-mw-dialog button,.ww-mw input,.ww-mw select{font:inherit}
.ww-mw-tabs{border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:10px}.ww-mw-tabs button[aria-pressed=true],.ww-mw-boards button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-brand-primary)}.ww-mw-boards{gap:6px}.ww-mw-boards button{border-radius:999px;padding:5px 14px}
.ww-mw-deck{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,10.5rem),1fr));gap:14px}.ww-mw .ww-mw-role{padding:0!important;display:flex;flex-direction:column;overflow:hidden;border-radius:16px;text-align:left;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);transition:transform .18s,border-color .18s,box-shadow .18s}.ww-mw .ww-mw-role:hover{transform:translateY(-3px);border-color:var(--dsw-alias-brand-primary);box-shadow:var(--dsw-elevation-prominent)}
.ww-mw-role-art{width:100%;flex:none;aspect-ratio:4/5;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse 80% 45% at 50% 100%,color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent),transparent 75%),linear-gradient(180deg,var(--dsw-alias-bg-layer-2),var(--dsw-alias-bg-layer-3));position:relative;overflow:hidden}.ww-mw-monogram{display:flex!important;align-items:center;justify-content:center;font-size:52px;font-weight:500;color:var(--dsw-alias-label-secondary)}.ww-mw-persona{width:104px;height:140px;object-fit:contain;display:block;position:relative;z-index:1}.ww-mw-role-art img.ww-mw-persona{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 10%}
.ww-mw-role-text{padding:10px 14px 12px;width:100%;box-sizing:border-box;display:grid;gap:3px;background:var(--dsw-alias-bg-layer-1)}.ww-mw-role-text strong{font-size:15px;font-weight:500}.ww-mw-role-top{display:flex;gap:6px;align-items:center;min-width:0}.ww-mw-role-top span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary)}
.ww-mw-tier{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:20px;padding:0 6px;border-radius:6px;font-size:11px;font-weight:500;letter-spacing:.3px;color:#fff;background:#8a8f98;flex:none}.ww-mw-tier[data-tier=T0]{background:linear-gradient(135deg,#f59e0b,#ef4444)}.ww-mw-tier[data-tier=T1]{background:linear-gradient(135deg,#8b5cf6,#6366f1)}.ww-mw-tier[data-tier=T2]{background:linear-gradient(135deg,#0ea5e9,#14b8a6)}
.ww-mw-row-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;overflow:hidden}.ww-mw-model-row{display:flex;align-items:center;gap:14px;padding:10px 16px;background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l1)}.ww-mw-model-row:last-child{border-bottom:0}.ww-mw-model-name{flex:1;min-width:0;display:grid;gap:4px;overflow-wrap:anywhere}.ww-mw-model-name strong{font-weight:500;font-size:14px}
.ww-mw-mini{width:44px;height:56px;flex:none;border-radius:10px;overflow:hidden;background:radial-gradient(ellipse 80% 45% at 50% 100%,color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent),transparent 75%),linear-gradient(180deg,var(--dsw-alias-bg-layer-2),var(--dsw-alias-bg-layer-3));display:flex;justify-content:center}.ww-mw-mini .ww-mw-persona{width:44px;height:78px;object-fit:cover;object-position:50% 0}
.ww-mw-page{justify-content:flex-end}.ww-mw-page span{margin-right:auto;color:var(--dsw-alias-label-secondary)}.ww-mw-timeline{padding-left:18px;border-left:2px solid var(--dsw-alias-border-l2);display:grid;gap:18px;margin-left:10px}.ww-mw-year{display:flex;gap:10px;align-items:center;position:relative;font-size:20px}.ww-mw-year:before{content:'';width:10px;height:10px;border-radius:50%;border:2px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);position:absolute;left:-26px}.ww-mw-timeline .ww-mw-row-list{margin-top:12px}
.ww-mw-table-wrap{overflow-x:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:14px}.ww-mw-table{width:100%;border-collapse:collapse;text-align:left}.ww-mw-table th{font-weight:500;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}.ww-mw-table th,.ww-mw-table td{padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}.ww-mw-table td.ww-mw-cell-model{white-space:normal;min-width:12.5rem}.ww-mw-table tr:last-child td{border-bottom:0}.ww-mw-table tbody tr:hover{background:var(--dsw-alias-bg-layer-2)}.ww-mw-cell-model>div{display:flex;gap:12px;align-items:center}
.ww-mw-effort{display:block;font-size:11px!important;font-weight:400;color:var(--dsw-alias-label-secondary)}.ww-mw-alt{white-space:normal!important;min-width:220px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}.ww-mw-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;color:var(--dsw-alias-brand-primary);border:1px solid var(--dsw-alias-brand-primary)}.ww-mw-efforts{display:grid;gap:8px}.ww-mw-efforts h3,.ww-mw .ww-mw-actions h3{font-size:14px}
.ww-mw-table td .ww-mw-actions{flex-wrap:nowrap}.ww-mw-rank{font-variant-numeric:tabular-nums;font-size:16px;font-weight:500;color:var(--dsw-alias-label-secondary);text-align:center}.ww-mw-rank[data-top=true]{color:var(--dsw-alias-brand-primary)}.ww-mw-score{font-variant-numeric:tabular-nums;font-size:16px;font-weight:500}
.ww-mw-bar{display:grid;grid-template-columns:minmax(4.5rem,1fr) minmax(2.6em,max-content);gap:8px;align-items:center;font-variant-numeric:tabular-nums}.ww-mw-bar>span{text-align:right}.ww-mw-bar i{display:block;height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-3);overflow:hidden}.ww-mw-bar i b{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#6366f1,#22d3ee)}
.ww-mw-selected{position:sticky;bottom:0;z-index:2;padding:12px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent)}.ww-mw-selected>span{flex:1}.ww-mw-chip{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ww-mw-empty{padding:44px 20px;text-align:center;border:1px dashed var(--dsw-alias-border-l2);border-radius:16px;color:var(--dsw-alias-label-secondary)}.ww-mw-notice{padding:10px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px}.ww-mw-skeleton{height:clamp(10rem,32dvh,20rem);border-radius:14px;background:var(--dsw-alias-bg-layer-2)}.ww-mw-about{color:var(--dsw-alias-label-secondary);font-size:12px}.ww-mw-about summary{cursor:pointer}.ww-mw-about p{margin-top:10px;line-height:1.7}
.ww-mw-dialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(calc(100vw - 40px),105rem);height:fit-content;max-height:calc(100dvh - 48px);padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:20px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent);overflow:auto;font:inherit}.ww-mw-dialog:not([open]){display:none}.ww-mw-dialog::backdrop{background:color-mix(in srgb,var(--dsw-alias-label-primary) 28%,transparent);backdrop-filter:blur(4px)}.ww-mw-dialog>header{display:flex;gap:16px;align-items:center;padding:16px 22px;border-bottom:1px solid var(--dsw-alias-border-l2);position:sticky;top:0;background:var(--dsw-alias-bg-layer-1);z-index:5}.ww-mw-dialog>header h2{flex:1;font-size:18px}.ww-mw-dialog-body{padding:22px;container:ww-mw-dialog/inline-size}
.ww-mw-key{width:min(35rem,calc(100vw - 40px))}.ww-mw-key .ww-mw-dialog-body{display:grid;gap:12px;line-height:1.7}.ww-mw-key ol{margin:0;padding-left:20px}.ww-mw-key-form,.ww-mw-key-confirm{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.ww-mw-key-form input{flex:1;min-width:min(100%,12.5rem);padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}.ww-mw-key-confirm>span{flex-basis:100%}.ww-mw-key-alert{color:var(--dsw-alias-danger-primary,#d14343)}
.ww-mw-dialog button{padding:8px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer}.ww-mw-dialog button:disabled{opacity:.5;cursor:default}.ww-mw-dialog button:focus-visible,.ww-mw button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}.ww-mw-dialog a,.ww-mw-about a{color:var(--dsw-alias-brand-primary)}
.ww-mw-detail{display:grid;grid-template-columns:clamp(10rem,24%,16.25rem) minmax(0,1fr);gap:26px}.ww-mw-detail-art{display:grid;justify-items:center;align-content:start;gap:10px;padding:14px;background:radial-gradient(ellipse 80% 45% at 50% 100%,color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent),transparent 75%),linear-gradient(180deg,var(--dsw-alias-bg-layer-2),var(--dsw-alias-bg-layer-3));border-radius:16px;border:1px solid var(--dsw-alias-border-l1)}.ww-mw-detail-art .ww-mw-persona{width:100%;height:auto;aspect-ratio:9/16;max-height:50dvh}.ww-mw-detail-art>.ww-mw-art-zoom{justify-self:stretch}.ww-mw-detail-main{display:grid;gap:22px;align-content:start}
.ww-mw-rating{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center;padding:16px 18px;border-radius:14px;background:var(--dsw-alias-bg-layer-2)}.ww-mw-rating-score{display:grid;justify-items:center;gap:6px}.ww-mw-rating-score strong{font-size:40px;line-height:1;font-weight:500;font-variant-numeric:tabular-nums}.ww-mw-dims{display:grid;grid-template-columns:max-content minmax(0,1fr) minmax(3.5em,max-content);gap:8px 10px}.ww-mw-dim{display:grid;grid-column:1/-1;grid-template-columns:subgrid;align-items:center;font-size:12px}.ww-mw-dim i{display:block;height:8px;border-radius:4px;background:var(--dsw-alias-bg-layer-3);overflow:hidden}.ww-mw-dim i b{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#6366f1,#22d3ee)}.ww-mw-dim span:last-child{text-align:right;font-variant-numeric:tabular-nums}
.ww-mw-benches{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,12.5rem),1fr));gap:8px}.ww-mw-bench{display:flex;justify-content:space-between;gap:10px;padding:8px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);font-size:12px}.ww-mw-bench b{font-weight:500;font-variant-numeric:tabular-nums}
.ww-mw-metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,9.375rem),1fr));gap:10px 16px;font-size:13px;margin:0}.ww-mw-metrics>div{display:grid;gap:2px}.ww-mw-metrics dt{color:var(--dsw-alias-label-secondary);font-size:12px}.ww-mw-metrics dd{margin:0;overflow-wrap:anywhere}.ww-mw-duel-help{color:var(--dsw-alias-label-secondary);font-size:12px}.ww-mw-kits{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr));gap:6px 16px;margin:0 0 8px;font-size:12px}.ww-mw-kits p{margin:0;display:grid;gap:2px}.ww-mw-kits span{color:var(--dsw-alias-label-secondary)}
.ww-mw-hud{position:absolute;top:16px;left:18px;right:18px;display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:start;z-index:4}.ww-mw-hud-side{display:grid;gap:6px;min-width:0}.ww-mw-hud-side.right{text-align:right}.ww-mw-hud-name{font-size:15px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ww-mw-hud-name small{color:#c7d2fe!important;font-weight:400;margin:0 6px}.ww-mw-hp{height:12px;border-radius:6px;background:rgba(255,255,255,.15);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}.ww-mw-hp b{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#a3e635);transition:width .5s cubic-bezier(.2,.8,.2,1) .6s}.ww-mw-hp[data-low=true] b{background:linear-gradient(90deg,#ef4444,#f97316)}.ww-mw-hud-side.right .ww-mw-hp{transform:scaleX(-1)}.ww-mw-hp-num{font-size:12px;color:#c7d2fe;font-variant-numeric:tabular-nums}
.ww-mw-vs{font-size:30px;font-weight:500;letter-spacing:2px;background:linear-gradient(180deg,#fde68a,#f59e0b);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 24px rgba(245,158,11,.4)}
.ww-mw-duel-bar{display:flex;gap:10px;justify-content:center;align-items:center;margin:14px 0}.ww-mw-duel-log{display:grid;grid-template-columns:minmax(min-content,max-content) minmax(max-content,1fr) max-content minmax(max-content,1fr);gap:6px 12px;margin:0 0 18px;padding:0;list-style:none}.ww-mw-duel-log li{display:grid;grid-column:1/-1;grid-template-columns:minmax(min-content,max-content) minmax(max-content,1fr) max-content minmax(max-content,1fr);grid-template-columns:subgrid;gap:12px;align-items:center;padding:8px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);font-size:12px;font-variant-numeric:tabular-nums}.ww-mw-duel-log li>span:nth-child(2){text-align:right}.ww-mw-duel-log li>span:nth-child(3){text-align:center;color:var(--dsw-alias-label-secondary)}.ww-mw-duel-log li[data-win=left]>span:nth-child(2),.ww-mw-duel-log li[data-win=right]>span:nth-child(4){color:var(--dsw-alias-brand-primary);font-weight:500}.ww-mw-duel-log em{font-style:normal;color:var(--dsw-alias-label-secondary)}
.ww-mw-compare{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,17.5rem),1fr));gap:18px}.ww-mw-compare section{padding:14px 16px;border-radius:14px;background:var(--dsw-alias-bg-layer-2);display:grid;gap:12px;min-width:0}.ww-mw-compare h3{font-size:15px;overflow-wrap:anywhere}
@media(max-width:550px){.ww-mw-dialog{width:calc(100vw - 20px)}.ww-mw-dialog-body{padding:14px}}
@container ww-mw-dialog (max-width:32rem){.ww-mw-detail{grid-template-columns:minmax(0,1fr)}.ww-mw-detail-art{display:none}}@container ww-main (max-width:32rem){.ww-mw-model-row{flex-wrap:wrap}}
html:is([data-platform=darwin],[data-windows-titlebar]) .ww-mw-dialog{max-height:calc(100dvh - var(--dsh-frame-top-clearance,0px) - 48px)}@media(prefers-reduced-motion:reduce){.ww-mw-role{animation:none!important;transition:none!important}}
.ww-mw-header{align-items:flex-end;margin:22px 0 20px}.ww-mw-summary{margin:6px 0 0;font-size:13.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}.ww-mw-header h2{margin:0;font:600 26px/1.3 var(--ww-serif);letter-spacing:.02em}.ww-mw-status-warn{color:var(--ww-warn)}
.ww-mw-tabs{display:inline-flex;flex-wrap:wrap;gap:2px;width:max-content;max-width:100%;padding:3px;border:1px solid var(--ww-line);border-radius:12px;background:var(--ww-surface-2)}.ww-page .ww-mw-tabs button{min-height:30px;padding:0 14px;border:0;border-radius:9px;background:transparent;color:var(--ww-ink-2)}.ww-page .ww-mw-tabs button[aria-pressed=true]{background:var(--ww-surface);border:0;color:var(--ww-ink);font-weight:500;box-shadow:0 1px 2px #0000001a}
.ww-page .ww-mw-boards button{min-height:30px;padding:0 12px;border:1px solid var(--ww-line-2);border-radius:999px;background:transparent;color:var(--ww-ink-2);font-weight:400}.ww-page .ww-mw-boards button[aria-pressed=true]{border-color:transparent;background:var(--ww-tint);color:var(--ww-ink);font-weight:500}
.ww-mw-role-art,.ww-mw-mini,.ww-mw-detail-art{background:var(--ww-surface-2)}.ww-mw-tier{color:var(--ww-ink-2);background:transparent;border:1px solid var(--ww-line-3);font-weight:500}.ww-mw-tier[data-tier=T0]{background:transparent;color:var(--ww-ink);border-color:var(--ww-ink)}.ww-mw-tier[data-tier=T1]{background:transparent;color:var(--ww-ink);border-color:var(--ww-ink-2);border-style:dashed}.ww-mw-tier[data-tier=T2]{background:transparent;color:var(--ww-ink-2);border-color:var(--ww-line-3)}
.ww-mw-bar i b,.ww-mw-dim i b{background:color-mix(in srgb,var(--ww-brand) 72%,transparent)}.ww-mw-row-list{border-color:var(--ww-line)}.ww-mw-model-row{background:var(--ww-surface);border-bottom-color:var(--ww-line)}.ww-mw-model-row .ww-mw-actions{opacity:0;transition:opacity .15s ease}.ww-mw-model-row:is(:hover,:focus-within) .ww-mw-actions{opacity:1}
.ww-mw-selected{margin-right:var(--ww-fab-safe);background:var(--ww-raised);border-color:var(--ww-line-2)}
.ww-mw-vs{background:none;color:#fde68a;text-shadow:none}.ww-mw-hp b{background:#4ade80}.ww-mw-hp[data-low=true] b{background:#f87171}.ww-mw-hud-name small,.ww-mw-hp-num{color:#cbd5e1!important}
@media(hover:none){.ww-mw-model-row .ww-mw-actions{opacity:1}}
/* 查看大图入口：图鉴卡片右上角一个半透明圆钮，跟着卡片一起浮起；详情里的立绘本身可点，立绘下面一枚小标签提示（不压在立绘上）。 */
.ww-mw-role-slot{position:relative;display:flex;min-width:0}.ww-mw-role-slot>.ww-mw-role{flex:1;min-width:0}.ww-mw .ww-mw-role-slot:hover>.ww-mw-role{transform:translateY(-3px);border-color:var(--dsw-alias-brand-primary);box-shadow:var(--dsw-elevation-prominent)}
.ww-mw .ww-mw-zoom{position:absolute;top:10px;right:10px;z-index:1;width:32px;height:32px;min-height:32px;padding:0!important;display:grid;place-items:center;border-radius:50%;border:1px solid var(--ww-line-2);background:color-mix(in srgb,var(--ww-surface) 80%,transparent);color:var(--ww-ink);box-shadow:0 2px 8px #0000001f;backdrop-filter:blur(6px);opacity:.72;cursor:zoom-in;transition:opacity .15s,transform .18s,border-color .15s}.ww-mw-role-slot:is(:hover,:focus-within)>.ww-mw-zoom{opacity:1}.ww-mw-role-slot:hover>.ww-mw-zoom{transform:translateY(-3px)}.ww-mw .ww-mw-zoom:hover:not(:disabled){border-color:var(--ww-orn,var(--ww-line-3))}
.ww-mw-dialog .ww-mw-art-zoom{display:grid;justify-items:center;gap:8px;padding:0;border:0;border-radius:12px;background:none;color:inherit;cursor:zoom-in}.ww-mw-art-hint{display:inline-flex;align-items:center;gap:4px;padding:3px 9px 3px 7px;border-radius:999px;border:1px solid var(--ww-line-2);background:color-mix(in srgb,var(--ww-surface) 82%,transparent);color:var(--ww-ink-2);font-size:12px;backdrop-filter:blur(6px);opacity:.85;transition:opacity .15s,color .15s}.ww-mw-art-zoom:is(:hover,:focus-visible) .ww-mw-art-hint{opacity:1;color:var(--ww-ink)}
/* 大图查看器：照片要成为焦点，底色固定压暗（看照片的通行做法，不随皮肤）；看到的就是带水印、可保存的那张。
   查看器盖住整个窗口，包括桌面版顶上那条拖动窗口的区域，所以整块声明不参与拖动，否则压在那条区域上的按钮点不中。 */
.ww-mw-viewer{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;color:#f8fafc;overflow:hidden;font:inherit;-webkit-app-region:no-drag}.ww-mw-viewer:not([open]){display:none}.ww-mw-viewer[open]{display:grid;grid-template-rows:auto minmax(0,1fr) auto}.ww-mw-viewer::backdrop{background:rgba(8,10,16,.86);backdrop-filter:blur(6px)}
/* 顶栏三栏：角色名靠左，按钮组居中；Windows 桌面版右上角是窗口自己的最小化、最大化、关闭，右栏至少让出它们的宽度，macOS 左上角让出红绿灯。 */
.ww-mw-viewer-bar{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px;padding:14px 18px}html[data-windows-titlebar] .ww-mw-viewer-bar{grid-template-columns:minmax(0,1fr) auto minmax(150px,1fr)}html[data-platform=darwin] .ww-mw-viewer-title{padding-inline-start:68px}.ww-mw-viewer-title{display:flex;align-items:baseline;gap:10px;min-width:0}.ww-mw-viewer-title strong{font-size:16px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ww-mw-viewer-title small{color:#cbd5e1;font-size:12px;font-variant-numeric:tabular-nums}.ww-mw-viewer-actions{grid-column:2;display:flex;gap:8px}
.ww-mw .ww-mw-viewer button{font:inherit;font-size:13px;min-height:34px;padding:7px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#f8fafc;box-shadow:none;cursor:pointer}.ww-mw .ww-mw-viewer button:hover:not(:disabled){background:rgba(255,255,255,.2)}.ww-mw .ww-mw-viewer button:disabled{opacity:.45;cursor:default}.ww-mw .ww-mw-viewer button:focus-visible{outline:2px solid #63bdf0;outline-offset:2px}.ww-mw .ww-mw-viewer .ww-mw-viewer-save{background:#fff;border-color:#fff;color:#0f1115;font-weight:500}.ww-mw .ww-mw-viewer .ww-mw-viewer-save:hover:not(:disabled){background:#e8f4fc}
.ww-mw-viewer-stage{position:relative;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 76px;overflow:hidden}.ww-mw-viewer-img{display:block;height:100%;max-width:100%;object-fit:contain;border-radius:12px;background:#fff;box-shadow:0 18px 60px rgba(0,0,0,.45);cursor:zoom-in;user-select:none;-webkit-user-drag:none}.ww-mw-viewer-img[data-ready=false]{filter:saturate(.9)}
.ww-mw-viewer-stage.ww-zoomed{display:block;overflow:auto;padding:0 76px 24px;cursor:grab}.ww-mw-viewer-stage.ww-zoomed:active{cursor:grabbing}.ww-mw-viewer-stage.ww-zoomed .ww-mw-viewer-img{height:auto;max-width:none;margin:0 auto;cursor:zoom-out}
.ww-mw-viewer-status{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(15,17,21,.72);color:#e2e8f0;font-size:12px;white-space:nowrap}
.ww-mw .ww-mw-viewer .ww-mw-viewer-nav{position:absolute;top:50%;width:46px;height:46px;padding:0;display:grid;place-items:center;border-radius:50%;font-size:26px;line-height:1;transform:translateY(-50%)}.ww-mw-viewer-prev{left:16px}.ww-mw-viewer-next{right:16px}
.ww-mw-viewer-note{margin:0;padding:10px 18px 16px;text-align:center;font-size:12px;line-height:1.6;color:#cbd5e1}
@media(max-width:640px){.ww-mw-viewer-stage,.ww-mw-viewer-stage.ww-zoomed{padding:0 10px}.ww-mw .ww-mw-viewer .ww-mw-viewer-nav{top:auto;bottom:64px;transform:none}.ww-mw-viewer-bar{gap:8px;padding:10px 12px}}
@media(hover:none){.ww-mw .ww-mw-zoom{opacity:1}}`;

/** 打斗画布要用解码好的立绘；载不出来就空着上场，不挡对决。 */
const loadPortraitImage = source => new Promise(resolve => { if (!source || typeof Image !== 'function') { resolve(null); return; } const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = source; });

/** 用页面里的隐藏链接触发浏览器下载，文件进浏览器的下载目录。 */
const downloadUrl = (url, name) => {
  const link = document.createElement('a');
  link.href = url; link.download = name; link.style.display = 'none';
  document.body.append(link); link.click(); link.remove();
};
const objectUrls = { create: blob => URL.createObjectURL(blob), revoke: url => URL.revokeObjectURL(url) };

/** loadLarge 按立绘 id 取 4K 原图（数据地址）；不传就不提供查看大图。其余选项只为测试替换浏览器能力。 */
export function createModelWorldView(React, approvedPortraits = {}, { loadLarge, watermark = watermarkedJpeg, download = downloadUrl, objectUrl = objectUrls, ui, battle = createBattle, loadImage = loadPortraitImage } = {}) {
  const { createElement: h, useState, useRef, useEffect } = React;
  const link = (url, label) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label);
  const button = (label, onClick, props = {}) => h('button', { type: 'button', onClick, ...props }, label);
  // 厂商身份可与原型属性同名；三个消费者只接纳显式批准的自有映射。
  const own = id => Object.hasOwn(approvedPortraits, id) ? approvedPortraits[id] : undefined;
  const portraitSource = (vendorId, modelId) => own(portraitIdFor(vendorId, modelId)) ?? own(vendorId);
  function Portrait({ vendorId, modelId }) {
    const source = portraitSource(vendorId, modelId);
    return source ? h('img', { className: 'ww-mw-persona', src: source, alt: '', 'aria-hidden': true, draggable: false }) : h('span', { className: 'ww-mw-persona ww-mw-monogram', 'aria-hidden': true }, vendorId.slice(0, 1).toUpperCase());
  }
  // 实际显示的立绘 id：命中系列形象用系列 id，否则用厂商主形象；没有批准的立绘时为 null。
  const portraitId = (vendorId, modelId) => { const id = portraitIdFor(vendorId, modelId); return own(id) ? id : own(vendorId) ? vendorId : null; };
  const zoomable = id => Boolean(id && loadLarge && own(id));
  const roleName = (id, vendorId, vendorName) => id === vendorId ? vendorName : `${vendorName} ${id.slice(vendorId.length + 1).replace(/^./, letter => letter.toUpperCase())}`;
  const zoomGlyph = () => h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': true }, h('path', { d: 'M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM21 21l-5.2-5.2M10.5 7.5v6M7.5 10.5h6' }));
  /** 详情里的立绘：能看大图时整张立绘是按钮，立绘下面一枚“查看大图”小标签。 */
  const detailArt = (model, vendorName, onZoom, c) => {
    const id = portraitId(model.vendorId, model.id), portrait = h(Portrait, { vendorId: model.vendorId, modelId: model.id });
    if (!onZoom || !zoomable(id)) return portrait;
    const name = roleName(id, model.vendorId, vendorName);
    return h('button', { type: 'button', className: 'ww-mw-art-zoom', 'aria-label': `${c.viewLarge}：${name}`, title: c.viewLarge, onClick: event => onZoom({ id, name }, event.currentTarget) }, portrait, h('span', { className: 'ww-mw-art-hint', 'aria-hidden': true }, zoomGlyph(), c.viewLarge));
  };

  /** 立绘大图：显示的就是加好水印的那张，看到的和存下来的一样。点图放大，放大后可拖动；← → 切换角色。 */
  function PortraitViewer({ items, start, onClose, returnFocus, notify, copy: c }) {
    const dialog = useRef(null), stage = useRef(null), alive = useRef(true), urls = useRef([]), pending = useRef(new Set()), pan = useRef(null), focus = useRef(null);
    const [index, setIndex] = useState(start), [zoom, setZoom] = useState(0), [shown, setShown] = useState({}), [attempt, setAttempt] = useState(0);
    const item = items[index], current = shown[item.id], ready = Boolean(current?.url), many = items.length > 1;
    useEffect(() => {
      alive.current = true;
      const element = dialog.current;
      try { if (element && !element.open) element.showModal(); } catch { /* 原生窗口打不开时仍在页面里显示 */ }
      return () => {
        alive.current = false;
        if (element?.open) element.close();
        urls.current.forEach(url => objectUrl.revoke(url)); urls.current = [];
        if (returnFocus?.isConnected) returnFocus.focus?.();
      };
    }, []);
    // 每张大图只取一次：取到后画水印、转成 JPG，留到查看器关闭再释放。
    useEffect(() => {
      const id = item.id;
      if (shown[id]?.url || pending.current.has(id)) return;
      pending.current.add(id);
      (async () => {
        try {
          const blob = await watermark(await loadLarge(id));
          const url = objectUrl.create(blob);
          if (!alive.current) { objectUrl.revoke(url); return; }
          urls.current.push(url);
          setShown(previous => ({ ...previous, [id]: { url } }));
        } catch (error) {
          if (alive.current) setShown(previous => ({ ...previous, [id]: { error: error?.message || c.largeFailed } }));
        } finally { pending.current.delete(id); }
      })();
    }, [index, attempt]);
    // 放大后把点到的位置滚到窗口中间。
    useEffect(() => {
      const element = stage.current, point = focus.current, image = element?.querySelector?.('img');
      if (!zoom || !image || !point) return;
      element.scrollLeft = image.offsetLeft + point.x * image.offsetWidth - element.clientWidth / 2;
      element.scrollTop = image.offsetTop + point.y * image.offsetHeight - element.clientHeight / 2;
      focus.current = null;
    }, [zoom]);
    const toggleZoom = (point = { x: .5, y: .3 }) => {
      if (!ready) return;
      if (zoom) { setZoom(0); return; }
      const image = stage.current?.querySelector?.('img');
      // 放大到原图一个像素对一个屏幕像素；屏幕本来就清晰的，至少放大到两倍。
      const width = Math.round(Math.max((image?.naturalWidth || 2160) / (globalThis.devicePixelRatio || 1), (image?.clientWidth || 0) * 2));
      focus.current = point; setZoom(width);
    };
    const imageClick = event => {
      event.stopPropagation();
      if (pan.current?.moved || event.detail > 1) return;
      const rect = event.currentTarget.getBoundingClientRect?.();
      toggleZoom(rect?.width ? { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height } : undefined);
    };
    const panStart = event => { if (!zoom || event.button !== 0 || !stage.current) return; pan.current = { x: event.clientX, y: event.clientY, left: stage.current.scrollLeft, top: stage.current.scrollTop, moved: false }; };
    const panMove = event => {
      const state = pan.current; if (!state || !stage.current) return;
      const dx = event.clientX - state.x, dy = event.clientY - state.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) state.moved = true;
      stage.current.scrollLeft = state.left - dx; stage.current.scrollTop = state.top - dy;
    };
    // 松手后的那次点击还要读“拖过没有”，下一轮再清掉。
    const panEnd = () => { const state = pan.current; if (state) setTimeout(() => { if (pan.current === state) pan.current = null; }); };
    const go = step => { setZoom(0); setIndex(value => (value + step + items.length) % items.length); };
    const save = () => {
      if (!ready) return;
      const name = portraitFileName(item.name);
      download(current.url, name); notify(c.saved.replace('{name}', name));
    };
    return h('dialog', { ref: dialog, className: 'ww-mw-viewer', 'aria-label': `${c.viewerTitle}：${item.name}`, onCancel: event => { event.preventDefault(); onClose(); },
      onKeyDown: event => { if (!many) return; if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); } else if (event.key === 'ArrowRight') { event.preventDefault(); go(1); } } },
      h('header', { className: 'ww-mw-viewer-bar' },
        h('div', { className: 'ww-mw-viewer-title' }, h('strong', null, item.name), many && h('small', null, `${index + 1} / ${items.length}`)),
        h('div', { className: 'ww-mw-viewer-actions' },
          button(zoom ? c.fit : c.zoomIn, () => toggleZoom(), { 'aria-pressed': Boolean(zoom), disabled: !ready }),
          button(c.save, save, { className: 'ww-mw-viewer-save', disabled: !ready }),
          button(c.close, onClose))),
      h('div', { ref: stage, className: `ww-mw-viewer-stage${zoom ? ' ww-zoomed' : ''}`, onClick: event => { if (event.target === event.currentTarget && !zoom) onClose(); }, onPointerDown: panStart, onPointerMove: panMove, onPointerUp: panEnd, onPointerLeave: panEnd },
        h('img', { key: item.id, className: 'ww-mw-viewer-img', src: ready ? current.url : own(item.id), alt: `${item.name} ${c.viewerTitle}`, draggable: false, 'data-ready': ready, style: zoom ? { width: `${zoom}px` } : undefined, onClick: imageClick }),
        !ready && h('span', { className: 'ww-mw-viewer-status', role: current?.error ? 'alert' : 'status' }, current?.error ? c.largeFailed : c.loadingLarge, current?.error && button(c.retry, () => { setShown(previous => { const next = { ...previous }; delete next[item.id]; return next; }); setAttempt(value => value + 1); }))),
      many && button('‹', () => go(-1), { className: 'ww-mw-viewer-nav ww-mw-viewer-prev', 'aria-label': c.prevRole, title: c.prevRole }),
      many && button('›', () => go(1), { className: 'ww-mw-viewer-nav ww-mw-viewer-next', 'aria-label': c.nextRole, title: c.nextRole }),
      h('p', { className: 'ww-mw-viewer-note' }, c.viewerNote));
  }
  const tierBadge = tier => tier && h('span', { className: 'ww-mw-tier', 'data-tier': tier }, tier);
  function Metrics({ model, copy, known = false }) {
    return h('dl', { className: 'ww-mw-metrics' }, ...worldMetricRows(model, copy, { known }).map(([label, value]) => h('div', { key: label }, h('dt', null, label), h('dd', null, value))));
  }
  function Rating({ model, copy: c }) {
    const rating = model.rating;
    return h('div', { className: 'ww-mw-rating' },
      h('div', { className: 'ww-mw-rating-score' }, h('small', null, c.overall), h('strong', null, rating.overall ?? '—'), rating.tier ? tierBadge(rating.tier) : h('small', null, c.unrated), rating.effort && h('small', null, `${c.strongestTier} · ${worldEffortText(rating.effort, c)}`)),
      h('div', { className: 'ww-mw-dims' }, ...Object.entries(worldDimensions).filter(([key]) => key !== 'eci').map(([key, dimension]) => h('div', { key, className: 'ww-mw-dim' }, h('span', null, dimension.name), h('i', null, h('b', { style: { width: `${rating[key] ?? 0}%` } })), h('span', null, rating[key] ?? '—')))));
  }
  function Efforts({ model, copy: c }) {
    return model.efforts?.length > 1 && h('div', { className: 'ww-mw-efforts' }, h('h3', null, c.efforts), h('div', { className: 'ww-mw-benches' }, ...model.efforts.map(item => h('div', { key: item.effort ?? 'default', className: 'ww-mw-bench' }, h('span', null, worldEffortText(item.effort, c) || c.overall), h('b', null, `${item.index} · ${c.cost} ${worldCostText(item.cost) ?? c.noCost}`)))));
  }
  function Benchmarks({ model }) {
    return model.scores.length > 0 && h('div', { className: 'ww-mw-benches' }, ...model.scores.map(score => h('div', { key: score.league, className: 'ww-mw-bench' }, score.sourceUrl ? link(score.sourceUrl, worldBenchmarks[score.league].name) : h('span', null, worldBenchmarks[score.league].name), h('b', null, worldScoreText(score)))));
  }

  /** 综合实力数据的来源和员工自己的 AA Key：保存、替换、清除都走宿主凭据服务，界面从不显示 Key 本身。 */
  function KeyWindow({ index, api, notify, onClose, onChange, returnFocus, fallbackFocus, copy: c }) {
    const dialog = useRef(null), field = useRef(null), mountedKey = useRef(true);
    const [value, setValue] = useState(''), [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [confirming, setConfirming] = useState(false), [openError, setOpenError] = useState(false);
    useEffect(() => {
      const element = dialog.current;
      try { if (element && !element.open) { element.showModal(); field.current?.focus(); } } catch { setOpenError(true); }
      return () => { mountedKey.current = false; if (element?.open) element.close(); const target = returnFocus?.isConnected ? returnFocus : fallbackFocus.current; target?.focus?.(); };
    }, []);
    // 成功关闭窗口并在右上角提示；失败留在窗口里显示，避免提示被模态窗口挡住。
    const run = async (request, done) => {
      setBusy(true); setFailure('');
      try { const result = await api.worldRequest(request); if (!mountedKey.current) return; onChange(result.index); notify(done); onClose(); }
      catch (error) { if (mountedKey.current) setFailure(`${c.indexSaveFailed}：${error.message || c.loadFailed}`); }
      finally { if (mountedKey.current) setBusy(false); }
    };
    const key = value.trim();
    const keyText = { none: c.indexKeyNone, saved: c.indexKeySaved, env: c.indexKeyEnv, unavailable: c.indexKeyUnavailable }[index.key];
    return h(React.Fragment, null, openError && h('p', { role: 'alert' }, c.modalFailed, button(c.close, onClose)),
      h('dialog', { ref: dialog, className: 'ww-mw-dialog ww-mw-key', 'aria-label': c.indexTitle, onCancel: event => { event.preventDefault(); if (!busy) onClose(); } },
        h('header', null, h('h2', null, c.indexTitle), button(c.close, onClose, { disabled: busy })),
        h('div', { className: 'ww-mw-dialog-body' },
          h('p', null, c.indexIntro),
          h('p', null, h('strong', null, `${c.indexNow}：`), `${index.source === 'online' ? c.indexOnline : c.indexBundled}，${c.indexAsOf} ${index.asOf} · ${keyText}`),
          index.error && h('p', { className: 'ww-mw-key-alert', role: 'alert' }, `${c.indexLastError}：${index.error}`),
          index.key !== 'unavailable' && h(React.Fragment, null,
            h('h3', null, c.indexStepsTitle),
            h('ol', null,
              h('li', null, c.indexStep1, ' ', link(aaLinks.signup, c.indexSignup), c.indexStep1End),
              h('li', null, c.indexStep2, ' ', link(aaLinks.docs, c.indexDocs), c.indexStep2End),
              h('li', null, c.indexStep3)),
            h('form', { className: 'ww-mw-key-form', onSubmit: event => { event.preventDefault(); if (key.length >= 8) run({ action: 'setIndexKey', key }, c.indexSaved); } },
              h('input', { ref: field, type: 'password', autoComplete: 'off', spellCheck: false, 'aria-label': c.indexKeyLabel, placeholder: index.key === 'saved' ? c.indexReplace : c.indexPaste, maxLength: 200, value, disabled: busy, onChange: event => setValue(event.target.value) }),
              h('button', { type: 'submit', disabled: busy || key.length < 8 || /\s/.test(key) }, busy ? c.indexSaving : c.indexSave),
              index.key === 'saved' && !confirming && button(c.indexClear, () => setConfirming(true), { disabled: busy })),
            confirming && h('div', { className: 'ww-mw-key-confirm', role: 'group', 'aria-label': c.indexClear }, h('span', null, c.indexClearConfirm), button(c.indexClearYes, () => run({ action: 'clearIndexKey' }, c.indexCleared), { disabled: busy }), button(c.cancel, () => setConfirming(false), { disabled: busy }))),
          failure && h('p', { className: 'ww-mw-key-alert', role: 'alert' }, failure),
          h('small', null, c.indexPrivacy))));
  }

  return createModelWorldPages(React, {
    Portrait, portraitSource, zoomable, roleName, PortraitViewer, KeyWindow, Metrics, Rating, Efforts, Benchmarks, tierBadge, link, own, loadLarge, detailArt, zoomGlyph, ui, battle, loadImage,
    css: worldViewCss + worldPagesCss,
  });
}
