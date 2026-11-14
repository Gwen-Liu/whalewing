/**
 * 模型世界对决演出：在画布上逐帧画出来的一场打斗。
 * 谁赢、赢多少（胜方剩多少体力）只来自对决剧本（worldDuelScript）；过程每一场现排：
 * 谁先出手、用哪一招、每一击多重、有没有闪开、要不要对拼，都由 battlePlan 用随机数定，所以同样两位再打一次不会一模一样。
 * 每位角色按自己的职业和手里的东西出招（model-world-battle-kits.js），这里只提供几种套路和各自的画法。
 * 不依赖 React，只要一块 canvas 和两张立绘；时钟、离屏画布、随机种子都能替换，测试用假画布逐帧推进。
 */
import { battleKit } from './model-world-battle-kits.js';

const TAU = Math.PI * 2, VH = 540;
const easeOut = k => 1 - (1 - k) ** 3, easeIn = k => k ** 3, easeInOut = k => k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2, linear = k => k;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const sum = list => list.reduce((a, b) => a + b, 0);
/** 给定种子的随机数：测试里固定种子，同一场每次都一样。 */
const seeded = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/**
 * 把剧本排成这一场的演出节拍。剧本只定结果：每一方全场一共打出多少伤害、最后谁倒下。
 * 这里把每一方的伤害在各回合间重新分一遍（有轻有重，比原来重出一截的算暴击），前几回合谁先手随机，偶尔有一击被闪开（没打出去的伤害匀到后面几回合），
 * 中间可能插一次对拼；招式从各自的三招里洗牌取，胜方用必杀收尾，落后的一方最后一回合也可能放必杀。
 * 节拍：{type:'round'} 回合横幅、{type:'clash'} 对拼、{type:'move'} 一次出手、{type:'end'} 收场。
 * 伤害不超过 6 的一击演成“格挡”。kits 是双方的打法（battleKit 的返回），random 是 0~1 的随机函数。
 */
export function battlePlan(script, { kits = [], random = Math.random } = {}) {
  const events = script?.events ?? [];
  if (!events.length) return [];
  const rounds = [];
  for (const event of events) { if (rounds.at(-1)?.id !== event.round) rounds.push({ id: event.round, name: event.name, dealt: [0, 0] }); rounds.at(-1).dealt[event.attacker] += event.damage; }
  const winner = script.kind === 'winner' ? script.winner : null, last = rounds.length - 1;
  const base = [0, 1].map(side => rounds.map(round => round.dealt[side]));
  const dealt = base.map((parts, side) => {
    const total = sum(parts);
    if (!total || last < 1) return [...parts];
    const weights = parts.map(value => value * (.55 + random() * .9)), scale = total / sum(weights), exact = weights.map(weight => weight * scale), out = exact.map(Math.floor);
    exact.map((value, index) => [value - out[index], index]).sort((a, b) => b[0] - a[0]).slice(0, total - sum(out)).forEach(([, index]) => { out[index] += 1; });
    // 收尾的一击不能太轻：不够就从前面最重的一回合挪过来。
    const floor = Math.min(total, side === winner ? 16 : 1);
    while (out[last] < floor) { const from = out.indexOf(Math.max(...out.slice(0, last))); out[from] -= 1; out[last] += 1; }
    return out;
  });
  // 每一方全场最多被闪开一次，只发生在收尾回合之前。
  const dodged = [0, 1].map(() => rounds.map(() => false));
  [0, 1].forEach(side => {
    for (let index = 0; index < last; index++) if (dealt[side][index] >= 4 && random() < .12) {
      // 没打出去的伤害匀到后面几回合，不全压在下一击上。
      const carry = dealt[side][index], rest = last - index; dealt[side][index] = 0; dodged[side][index] = true;
      for (let later = index + 1; later <= last; later++) dealt[side][later] += Math.floor(carry / rest) + (later === last ? carry % rest : 0);
      break;
    }
  });
  const bags = [[], []];
  const pick = side => {
    if (!bags[side].length) { const count = kits[side]?.moves?.length || 3; bags[side] = Array.from({ length: count }, (_, index) => index); for (let i = count - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [bags[side][i], bags[side][j]] = [bags[side][j], bags[side][i]]; } }
    return bags[side].pop();
  };
  const clashAt = last >= 2 && random() < .6 ? 1 + Math.floor(random() * (last - 1)) : -1;
  const beats = [], hp = [100, 100];
  rounds.forEach((round, index) => {
    beats.push({ type: 'round', index, name: round.name });
    if (index === clashAt) beats.push({ type: 'clash' });
    const final = index === last, first = final && winner !== null ? 1 - winner : random() < .5 ? 0 : 1;
    for (const attacker of [first, 1 - first]) {
      const damage = dealt[attacker][index], dodge = dodged[attacker][index] || damage === 0;
      if (dodge && !base[attacker][index]) continue;
      hp[1 - attacker] = Math.max(0, hp[1 - attacker] - damage);
      const ultimate = final && !dodge && (attacker === winner || random() < .38);
      beats.push({ type: 'move', move: ultimate ? 'ultimate' : pick(attacker), attacker, damage, hp: [...hp], guard: !dodge && damage <= 6, dodge, crit: damage >= 14 && damage >= base[attacker][index] * 1.35,
        heavy: final, ko: hp[1 - attacker] <= 0, round: round.id, roundName: round.name });
    }
  });
  beats.push({ type: 'end', winner });
  return beats;
}

// ---- 画法：一样东西画在原点，朝右，s 是大小，t 是时间 ----
const disc = (c, x, y, r, fill) => { c.beginPath(); c.arc(x, y, r, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } };
const oval = (c, x, y, rx, ry, fill, turn = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, turn, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } };
const poly = (c, points) => { c.beginPath(); points.forEach(([x, y], index) => index ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); };
const spikes = (c, count, outer, inner) => { c.beginPath(); for (let i = 0; i < count * 2; i++) { const r = i % 2 ? inner : outer, a = i * Math.PI / count - Math.PI / 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); };
/** 水滴形：圆头在原点，尖尾巴朝后。 */
const tear = (c, r, tail) => { c.beginPath(); c.moveTo(-tail, 0); c.quadraticCurveTo(-r * .4, -r * 1.1, 0, -r); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); c.quadraticCurveTo(-r * .4, r * 1.1, -tail, 0); c.closePath(); };
const serif = '"Noto Serif SC", "Songti SC", STSong, SimSun, serif';
const rainbow = ['#ff5d5d', '#ffa53d', '#ffe66b', '#7dff9b', '#6bd6ff', '#8f8bff', '#d68bff'];

export const battleShapes = {
  feather(c, s, t, color) { c.beginPath(); c.moveTo(-s * .5, 0); c.quadraticCurveTo(-s * .05, -s * .3, s * .5, 0); c.quadraticCurveTo(-s * .05, s * .3, -s * .5, 0); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = color; c.lineWidth = 1.5; c.stroke(); c.beginPath(); c.moveTo(-s * .66, 0); c.lineTo(s * .5, 0); c.stroke(); },
  flame(c, s, t, color) { const flick = 1 + .14 * Math.sin(t * 34); tear(c, s * .32, s * .85 * flick); c.fillStyle = color; c.fill(); tear(c, s * .19, s * .45 * flick); c.fillStyle = '#fff3c9'; c.fill(); },
  drop(c, s, t, color, accent) { tear(c, s * .36, s * .8); c.fillStyle = '#0b0d18'; c.fill(); c.strokeStyle = accent; c.lineWidth = 1.5; c.stroke(); disc(c, s * .08, -s * .1, s * .08, 'rgba(255,255,255,.7)'); },
  spit(c, s) { tear(c, s * .34, s * .7); c.fillStyle = '#eaffd6'; c.fill(); c.strokeStyle = '#8fce6d'; c.lineWidth = 1.5; c.stroke(); },
  pearl(c, s, t, color) { const fill = c.createRadialGradient(-s * .12, -s * .12, 0, 0, 0, s * .5); fill.addColorStop(0, '#ffffff'); fill.addColorStop(.45, color); fill.addColorStop(1, 'rgba(255,255,255,0)'); disc(c, 0, 0, s * .5, fill); disc(c, 0, 0, s * .22, 'rgba(255,255,255,.85)'); },
  bubble(c, s, t, color, accent) { disc(c, 0, 0, s * .45, 'rgba(255,255,255,.14)'); c.strokeStyle = accent; c.lineWidth = 2; c.stroke(); c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, s * .3, -2.4, -1.5); c.stroke(); },
  star(c, s, t, color) { spikes(c, 4, s * .55, s * .15); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = color; c.lineWidth = 2; c.stroke(); },
  star5(c, s, t, color, accent) { spikes(c, 5, s * .5, s * .22); c.fillStyle = accent; c.fill(); c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.stroke(); },
  note(c, s, t, color, accent) { c.strokeStyle = accent; c.lineWidth = s * .09; c.lineCap = 'round'; c.beginPath(); c.moveTo(s * .08, s * .22); c.lineTo(s * .08, -s * .42); c.quadraticCurveTo(s * .36, -s * .32, s * .34, -s * .08); c.stroke(); oval(c, -s * .08, s * .24, s * .2, s * .14, accent, -.4); },
  shard(c, s, t, color, accent) { poly(c, [[s * .55, 0], [0, -s * .2], [-s * .55, 0], [0, s * .2]]); c.fillStyle = accent; c.fill(); c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.stroke(); poly(c, [[s * .55, 0], [0, s * .2], [-s * .2, 0]]); c.fillStyle = color; c.fill(); },
  bun(c, s) {
    c.beginPath(); c.moveTo(-s * .5, s * .22); c.bezierCurveTo(-s * .56, -s * .3, -s * .2, -s * .46, 0, -s * .46); c.bezierCurveTo(s * .2, -s * .46, s * .56, -s * .3, s * .5, s * .22); c.quadraticCurveTo(0, s * .4, -s * .5, s * .22); c.closePath();
    c.fillStyle = '#fff8ec'; c.fill(); c.strokeStyle = '#d7b28a'; c.lineWidth = Math.max(1.5, s * .025); c.stroke();
    c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(0, -s * .44); c.quadraticCurveTo(i * s * .1, -s * .3, i * s * .16, -s * .14); } c.stroke();
  },
  lid(c, s) { oval(c, 0, 0, s * .5, s * .17, '#e9c47e'); c.strokeStyle = '#96682c'; c.lineWidth = 2; c.stroke(); c.beginPath(); c.ellipse(0, 0, s * .34, s * .11, 0, 0, TAU); c.stroke(); disc(c, 0, -s * .06, s * .07, '#96682c'); },
  bunny(c, s, t, color) {
    for (const side of [-1, 1]) { oval(c, side * s * .11, -s * .5, s * .075, s * .22, '#ffffff', side * .16); oval(c, side * s * .11, -s * .48, s * .035, s * .15, '#ffc9d6', side * .16); }
    oval(c, 0, s * .2, s * .28, s * .26, '#ffffff'); disc(c, 0, -s * .14, s * .25, '#ffffff'); c.fillStyle = color; c.fillRect(-s * .2, s * .02, s * .4, s * .08);
    disc(c, -s * .09, -s * .17, s * .028, '#3b2f2f'); disc(c, s * .09, -s * .17, s * .028, '#3b2f2f'); disc(c, 0, -s * .1, s * .022, '#ff9fb5');
  },
  carrot(c, s) { poly(c, [[s * .5, 0], [-s * .3, -s * .16], [-s * .3, s * .16]]); c.fillStyle = '#ff8a1f'; c.fill(); c.strokeStyle = '#3fae4a'; c.lineWidth = s * .07; c.lineCap = 'round'; c.beginPath(); for (const lean of [-.2, 0, .2]) { c.moveTo(-s * .3, 0); c.lineTo(-s * .52, lean * s); } c.stroke(); },
  needle(c, s, t, color) { poly(c, [[s * .55, 0], [0, -s * .1], [0, s * .1]]); c.fillStyle = color; c.fill(); poly(c, [[-s * .55, 0], [0, -s * .1], [0, s * .1]]); c.fillStyle = '#ffffff'; c.fill(); disc(c, 0, 0, s * .06, '#1f2937'); },
  gust(c, s, t, color, accent) { c.lineCap = 'round'; for (let i = 0; i < 3; i++) { c.strokeStyle = i ? accent : '#ffffff'; c.lineWidth = s * (.13 - i * .035); c.beginPath(); c.arc(-s * (.25 + i * .16), 0, s * (.6 - i * .08), -.85, .85); c.stroke(); } },
  wave(c, s, t, color, accent) { c.lineCap = 'round'; for (let i = 0; i < 2; i++) { c.strokeStyle = i ? accent : color; c.lineWidth = s * (.14 - i * .05); c.beginPath(); c.arc(-s * .6 - i * s * .22, 0, s * .7, -.6, .6); c.stroke(); } },
  page(c, s) { poly(c, [[-s * .3, -s * .4], [s * .3, -s * .34], [s * .3, s * .4], [-s * .3, s * .34]]); c.fillStyle = '#fffaf0'; c.fill(); c.strokeStyle = '#c9a27a'; c.lineWidth = 1.5; c.stroke(); c.beginPath(); for (let i = -1; i <= 1; i++) { c.moveTo(-s * .18, i * s * .16); c.lineTo(s * .18, i * s * .16 + s * .02); } c.stroke(); },
  orb(c, s, t, color, accent) {
    const fill = c.createRadialGradient(0, 0, 0, 0, 0, s * .5); fill.addColorStop(0, '#ffffff'); fill.addColorStop(.4, accent); fill.addColorStop(.75, color); fill.addColorStop(1, 'rgba(255,255,255,0)'); disc(c, 0, 0, s * .5, fill);
    c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(2, s * .05); c.lineCap = 'round'; c.beginPath(); c.arc(0, 0, s * .3, t * 7, t * 7 + 3.6); c.stroke(); c.beginPath(); c.arc(0, 0, s * .16, t * 7 + Math.PI, t * 7 + Math.PI + 3.6); c.stroke();
  },
  loop(c, s, t, color) { for (const [width, tone] of [[s * .12, color], [s * .04, '#ffffff']]) { c.strokeStyle = tone; c.lineWidth = width; c.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, k = 1 + Math.sin(a) ** 2, x = s * .55 * Math.cos(a) / k, y = s * .55 * Math.sin(a) * Math.cos(a) / k; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); } },
  glyph(c, s, t, color, accent, o) { c.font = `700 ${s}px ${serif}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = color; c.strokeText(o?.glyph ?? '问', 0, 0); c.fillStyle = '#ffffff'; c.fillText(o?.glyph ?? '问', 0, 0); },
  pin(c, s, t, color) { c.beginPath(); c.arc(0, -s * .18, s * .3, Math.PI * .82, Math.PI * .18); c.lineTo(0, s * .5); c.closePath(); c.fillStyle = color; c.fill(); c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1.5, s * .03); c.stroke(); disc(c, 0, -s * .18, s * .12, '#ffffff'); },
  yarn(c, s, t, color, accent) { disc(c, 0, 0, s * .5, color); c.strokeStyle = accent; c.lineWidth = 2; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(0, 0, s * .5, s * (.12 + i * .1), i * .8, 0, TAU); c.stroke(); } },
  paw(c, s, t, color, accent) { const toes = [[-.34, -.1], [-.13, -.3], [.13, -.3], [.34, -.1]]; oval(c, 0, s * .14, s * .32, s * .26, color); for (const [x, y] of toes) oval(c, x * s, y * s, s * .11, s * .14, color); oval(c, 0, s * .16, s * .2, s * .15, accent); for (const [x, y] of toes) disc(c, x * s, y * s, s * .06, accent); },
  steam(c, s) { const fill = c.createRadialGradient(0, 0, 0, 0, 0, s * .5); fill.addColorStop(0, 'rgba(255,255,255,.8)'); fill.addColorStop(1, 'rgba(255,255,255,0)'); disc(c, 0, 0, s * .5, fill); },
  llama(c, s, t) {
    const wool = '#fff6e6'; c.strokeStyle = '#cdb894'; c.lineWidth = Math.max(2, s * .04); c.lineCap = 'round';
    c.beginPath(); for (let i = 0; i < 4; i++) { const x = -s * .26 + i * s * .17, swing = Math.sin(t * 20 + i * 1.9) * s * .12; c.moveTo(x, s * .14); c.lineTo(x + swing, s * .5); } c.stroke();
    oval(c, s * .3, -s * .3, s * .1, s * .26, wool, .25); c.stroke(); oval(c, 0, 0, s * .4, s * .25, wool); c.stroke();
    for (let i = 0; i < 5; i++) disc(c, -s * .3 + i * s * .15, -s * .2, s * .1, wool);
    oval(c, s * .4, -s * .56, s * .15, s * .11, wool); c.stroke(); poly(c, [[s * .3, -s * .64], [s * .28, -s * .8], [s * .37, -s * .66]]); c.fillStyle = wool; c.fill(); c.stroke();
    disc(c, s * .45, -s * .58, s * .022, '#3b2f2f'); c.fillStyle = '#2f80ff'; c.fillRect(-s * .16, -s * .22, s * .3, s * .2);
  },
  fish(c, s, t, color, accent) {
    const flap = Math.sin(t * 30) * .06; c.fillStyle = accent; poly(c, [[-s * .05, 0], [-s * .3, -s * (.34 + flap)], [s * .12, -s * .04]]); c.fill(); poly(c, [[-s * .05, 0], [-s * .26, s * (.24 + flap)], [s * .1, s * .04]]); c.fill();
    tear(c, s * .13, s * .46); c.fillStyle = color; c.fill(); poly(c, [[-s * .42, 0], [-s * .58, -s * .14], [-s * .5, 0], [-s * .58, s * .14]]); c.fill(); disc(c, s * .05, -s * .03, s * .025, '#ffffff');
  },
  whale(c, s, t, color, accent) {
    poly(c, [[-s * .44, 0], [-s * .62, -s * .15], [-s * .54, 0], [-s * .62, s * .15]]); c.fillStyle = color; c.fill(); tear(c, s * .19, s * .5); c.fill();
    c.save(); tear(c, s * .19, s * .5); c.clip(); c.fillStyle = accent; c.fillRect(-s * .5, s * .07, s * .8, s * .2); c.restore();
    poly(c, [[s * .02, s * .1], [-s * .12, s * .3], [-s * .14, s * .12]]); c.fillStyle = color; c.fill(); disc(c, s * .1, -s * .03, s * .014, '#ffffff');
  },
};
/** 这些东西有头有尾，飞的时候头朝前；其余的保持正着（可以自转）。 */
const pointed = new Set(['feather', 'flame', 'drop', 'spit', 'shard', 'carrot', 'needle', 'gust', 'wave']);
/** 往上飘的碎屑。 */
const floaty = new Set(['steam', 'bubble', 'note', 'feather', 'page']);

/**
 * 创建一场演出。fighters 两项：{ image（已载入的立绘）, theme（battleKit 的返回）, name }；script 是对决剧本。
 * 回调：onRound({index,name})、onHit({target,attacker,damage,hp,guard,dodge,crit,round,name,move})、onDone({winner,events})，events 是这一场实际打出来的每一击。
 * seed 固定这一场怎么排；不给就每次不同。arrange 可以换掉排演的办法（默认 battlePlan）。
 * 返回 { plan, play, skip, stop, resize, setSpeed, destroy }；每次 play 重新排一场，skip 直接跳到收场画面并补齐没报过的出手。
 */
export function createBattle(canvas, { fighters, script, onRound = () => {}, onHit = () => {}, onDone = () => {}, clock, createCanvas, labels = {}, seed, arrange = battlePlan } = {}) {
  const text = { ko: 'K.O.', tie: '平局', guard: '格挡', dodge: '闪开', crit: '暴击', clash: '对拼', round: '第 {n} 回合', skill: '必杀', ...labels };
  const ticker = clock ?? { request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) };
  const offscreen = createCanvas ?? (() => document.createElement('canvas'));
  const ctx = canvas.getContext('2d'), random = seeded(seed ?? Math.floor(Math.random() * 0x100000000));
  let VW = 960, scale = 1, frame = null, last = null, running = false, done = false, speed = 1, freeze = 0, slow = 0, reported = 0, stageTime = 0, plan = [], dodging = null;
  const cam = { shake: 0, flash: 0, bars: 0, dim: 0 };
  const anims = [], tasks = [], effects = [];
  let banner = null, cutIn = null, verdict = null, backdrop = null;

  const ground = VH * .87, tall = VH * .62;
  const F = fighters.map((fighter, index) => {
    const ratio = (fighter.image?.naturalWidth || fighter.image?.width || 9) / (fighter.image?.naturalHeight || fighter.image?.height || 16);
    return { index, image: fighter.image, theme: fighter.theme ?? battleKit(''), name: fighter.name ?? '', face: index === 0 ? 1 : -1, wide: tall * ratio, base: 0, shift: 0, home: 0, x: 0, y: 0, rot: 0, sx: 1, sy: 1, pivot: 0, alpha: 1, flash: 0, glow: 0, gray: 0, tints: {} };
  });
  const reach = tall * .36, facing = fighter => fighter.index === 0 ? 1 : -1;
  const clampX = x => clamp(x, 70, VW - 70);

  /** 把立绘染成单色剪影：受击闪白和残影都用它。 */
  const tinted = (fighter, color) => {
    if (fighter.tints[color]) return fighter.tints[color];
    const image = fighter.image, width = image?.naturalWidth || image?.width || 0, height = image?.naturalHeight || image?.height || 0;
    if (!width || !height) return null;
    try {
      const layer = offscreen(); layer.width = width; layer.height = height;
      const pen = layer.getContext('2d');
      pen.drawImage(image, 0, 0, width, height); pen.globalCompositeOperation = 'source-in'; pen.fillStyle = color; pen.fillRect(0, 0, width, height);
      return fighter.tints[color] = layer;
    } catch { return null; }
  };

  function layout() {
    const width = canvas.clientWidth || canvas.width || 960, height = canvas.clientHeight || canvas.height || 540;
    const ratio = clamp(globalThis.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    scale = canvas.height / VH; VW = clamp(canvas.width / scale, 520, 1400);
    F.forEach(fighter => { const base = VW * (fighter.index === 0 ? .27 : .73), home = base + fighter.shift; if (fighter.x === fighter.home) fighter.x = home; fighter.base = base; fighter.home = home; });
    backdrop = null;
  }

  // ---- 动画与协程 ----
  function to(target, props, duration, ease = easeOut) {
    for (const anim of anims) if (anim.target === target && !anim.arc) for (const key in props) delete anim.to[key];
    const from = {}; for (const key in props) from[key] = target[key];
    anims.push({ target, from, to: { ...props }, time: 0, duration: Math.max(duration, 1e-4), ease });
    return duration;
  }
  /** 抛物线：属性从当前值升到峰值再落回。 */
  function arc(target, key, peak, duration) { anims.push({ target, arc: key, base: target[key], peak, time: 0, duration: Math.max(duration, 1e-4) }); return duration; }
  const spawn = generator => tasks.push({ generator, wait: 0 });
  /** 过一会儿再做一件事。 */
  const after = (delay, action) => spawn((function* () { yield delay; action(); })());
  const effect = item => { effects.push({ time: 0, ...item }); };

  function advance(dt) {
    stageTime += dt;
    for (let i = anims.length - 1; i >= 0; i--) {
      const anim = anims[i]; anim.time += dt;
      const k = Math.min(1, anim.time / anim.duration);
      // 到点时落在准确的终值上，后面拿它和站位比较。
      if (anim.arc) anim.target[anim.arc] = k >= 1 ? anim.base : anim.base + anim.peak * Math.sin(Math.PI * k);
      else for (const key in anim.to) anim.target[key] = k >= 1 ? anim.to[key] : anim.from[key] + (anim.to[key] - anim.from[key]) * anim.ease(k);
      if (k >= 1) anims.splice(i, 1);
    }
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]; task.wait -= dt;
      while (task.wait <= 0) {
        const step = task.generator.next();
        if (step.done) { tasks.splice(i--, 1); break; }
        task.wait += Math.max(0, step.value || 0);
      }
    }
    for (let i = effects.length - 1; i >= 0; i--) { const item = effects[i]; item.time += dt; item.update?.(item, dt); if (item.time >= item.life) effects.splice(i, 1); }
    F.forEach(fighter => { fighter.flash = Math.max(0, fighter.flash - dt * 7); });
    cam.shake *= Math.exp(-dt * 9); cam.flash = Math.max(0, cam.flash - dt * 3.2);
  }

  // ---- 通用特效 ----
  const sparks = (x, y, color, count, power = 1) => {
    const bits = Array.from({ length: count }, () => { const angle = random() * TAU, v = (120 + random() * 320) * power; return { x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - 80, size: 1.5 + random() * 2.5 }; });
    effect({ life: .5, bits, update: (item, dt) => item.bits.forEach(bit => { bit.x += bit.vx * dt; bit.y += bit.vy * dt; bit.vy += 620 * dt; bit.vx *= .96; }),
      draw: (item, k) => { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = color; ctx.lineCap = 'round'; item.bits.forEach(bit => { ctx.globalAlpha = 1 - k; ctx.lineWidth = bit.size; ctx.beginPath(); ctx.moveTo(bit.x, bit.y); ctx.lineTo(bit.x - bit.vx * .035, bit.y - bit.vy * .035); ctx.stroke(); }); } });
  };
  /** 一把小东西四散：羽毛、音符、泡泡、墨点……轻的往上飘，重的往下掉。 */
  const confetti = (shape, x, y, count, color, accent, power = 1, size = 14) => {
    const paint = battleShapes[shape]; if (!paint) return;
    const lift = floaty.has(shape) ? -90 : 520;
    const bits = Array.from({ length: count }, () => { const angle = random() * TAU, v = (80 + random() * 230) * power; return { x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - 110, turn: (random() - .5) * 12, size: size * (.7 + random() * .7) }; });
    effect({ life: .75, bits, update: (item, dt) => item.bits.forEach(bit => { bit.x += bit.vx * dt; bit.y += bit.vy * dt; bit.vy += lift * dt; bit.vx *= .97; }),
      draw: (item, k) => item.bits.forEach(bit => { ctx.save(); ctx.globalAlpha = 1 - k * k; ctx.translate(bit.x, bit.y); ctx.rotate(pointed.has(shape) ? Math.atan2(bit.vy, bit.vx) : bit.turn * item.time); paint(ctx, bit.size, item.time, color, accent); ctx.restore(); }) });
  };
  const ring = (x, y, color, from, size, life = .45, flat = 1, width = 6) => effect({ life, draw: (item, k) => {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) ** 1.5; ctx.strokeStyle = color; ctx.lineWidth = width * (1 - k * .7);
    ctx.beginPath(); ctx.ellipse(x, y, from + (size - from) * easeOut(k), (from + (size - from) * easeOut(k)) * flat, 0, 0, TAU); ctx.stroke();
  } });
  /** 月牙形刀光：两条弧线围成一弯，带一道白芯。 */
  const slash = (x, y, angle, length, color, life = .28) => effect({ life, draw: (item, k) => {
    const grow = .55 + .6 * easeOut(k), alpha = k < .25 ? k / .25 : 1 - (k - .25) / .75;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(grow, grow); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-length / 2, 0); ctx.quadraticCurveTo(0, -length * .42, length / 2, 0); ctx.quadraticCurveTo(0, -length * .2, -length / 2, 0); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-length / 2, 0); ctx.quadraticCurveTo(0, -length * .33, length / 2, 0); ctx.stroke(); ctx.restore();
  } });
  const dust = (x, direction = 0) => { for (let i = 0; i < 5; i++) { const vx = (random() - .5 + direction * .7) * 160, size = 8 + random() * 10, x0 = x + (random() - .5) * 30;
    effect({ life: .5 + random() * .2, draw: (item, k) => { ctx.globalAlpha = .28 * (1 - k); ctx.fillStyle = '#cbd5e1'; ctx.beginPath(); ctx.arc(x0 + vx * k * .5, ground - 4 - 26 * easeOut(k), size * (1 + k), 0, TAU); ctx.fill(); } }); } };
  const floating = (x, y, value, color, size = 34) => effect({ life: .95, draw: (item, k) => {
    const pop = k < .15 ? .6 + k / .15 * .7 : 1.3 - Math.min(.3, (k - .15) * 1.2);
    ctx.globalAlpha = k < .7 ? 1 : 1 - (k - .7) / .3; ctx.font = `700 ${size * pop}px system-ui, "Microsoft YaHei", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(15,17,21,.85)'; ctx.strokeText(value, x, y - 46 * easeOut(k)); ctx.fillStyle = color; ctx.fillText(value, x, y - 46 * easeOut(k));
  } });
  /** 残影：把当前姿态拍一张主题色剪影，很快淡掉。 */
  const ghost = fighter => { const pose = { x: fighter.x, y: fighter.y, rot: fighter.rot, sx: fighter.sx, sy: fighter.sy, pivot: fighter.pivot }, layer = tinted(fighter, fighter.theme.color);
    if (layer) effect({ life: .28, under: true, draw: (item, k) => { ctx.globalAlpha = .42 * (1 - k); sprite(fighter, layer, pose); } }); };
  /** 一段时间内连续留残影。 */
  function* trail(fighter, duration) { for (let time = 0; time < duration; time += .035) { ghost(fighter); yield .035; } }
  const beam = (x0, y0, x1, y1, color, life, width = 26) => effect({ life, draw: (item, k) => {
    const thick = width * (k < .12 ? k / .12 : 1 - Math.max(0, (k - .7) / .3)) * (1 + .12 * Math.sin(item.time * 70));
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.globalAlpha = .55; ctx.strokeStyle = color; ctx.lineWidth = thick * 2.2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = thick * .7; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  } });
  const glowDot = (x, y, radius, color, alpha = 1) => { const fill = ctx.createRadialGradient(x, y, 0, x, y, radius); fill.addColorStop(0, '#fff'); fill.addColorStop(.35, color); fill.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill(); };
  /** 从天到地的一道光柱。 */
  const pillar = (x, color, width = 150) => effect({ life: .5, draw: (item, k) => { const half = width * (1 - k * .5), fill = ctx.createLinearGradient(x - half, 0, x + half, 0); fill.addColorStop(0, 'rgba(0,0,0,0)'); fill.addColorStop(.5, color); fill.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k; ctx.fillStyle = fill; ctx.fillRect(x - half, -20, half * 2, ground + 20); } });

  // ---- 道具的位置和道具上的光 ----
  const chest = fighter => ground - fighter.y - tall * .52;
  /** 立绘里某一点现在在台上的位置；默认取手里的道具。 */
  const prop = (fighter, key = 'prop') => { const [u, v] = fighter.theme[key] ?? fighter.theme.prop ?? [.5, .4]; return [fighter.x + fighter.face * (u - .5) * fighter.wide * fighter.sx, ground - fighter.y - (1 - v) * tall * fighter.sy]; };
  const glint = (fighter, key = 'prop') => { effect({ life: .36, draw: (item, k) => { const [x, y] = prop(fighter, key); glowDot(x, y, 18 + 34 * k, fighter.theme.accent, 1 - k); } }); const [x, y] = prop(fighter, key); ring(x, y, fighter.theme.color, 6, 46, .36, 1, 3); };
  /** 蓄力：光点往道具上汇。 */
  const charge = (fighter, key, life) => effect({ life, draw: (item, k) => {
    const [x, y] = prop(fighter, key); glowDot(x, y, 14 + 34 * k, fighter.theme.color, .9); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = fighter.theme.accent; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) { const angle = i * 2.4 + item.time * 3, far = 90 * (1 - ((k * 2 + i / 9) % 1)); ctx.globalAlpha = .8 * (1 - far / 90); ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * far, y + Math.sin(angle) * far); ctx.lineTo(x + Math.cos(angle) * (far + 12), y + Math.sin(angle) * (far + 12)); ctx.stroke(); }
  } });

  // ---- 受击、闪开 ----
  function* recoil(fighter, direction, power) {
    if (fighter.gray) return;
    yield to(fighter, { x: fighter.x + direction * 46 * power, rot: direction * .16 * power, sx: .95, sy: 1.03 }, .09);
    if (!fighter.out) yield to(fighter, { x: fighter.home, rot: 0, sx: 1, sy: 1 }, .34, easeInOut);
  }
  const flinch = (fighter, direction) => { fighter.flash = .7; spawn(recoil(fighter, direction, .3)); };
  /** 闪开：跳起来让过去，或者往后撤一步；一次出手只闪一下。 */
  function evade(defender, direction, mode) {
    if (defender.dodged || defender.out) return;
    defender.dodged = true; spawn(trail(defender, .26)); floating(defender.x, ground - tall * 1.04, text.dodge, '#bae6fd', 22);
    if (mode === 'up' || (!mode && random() < .5)) { arc(defender, 'y', tall * .38, .6); to(defender, { rot: -direction * .3 }, .28); after(.3, () => to(defender, { rot: 0 }, .28)); after(.6, () => dust(defender.x)); }
    else { arc(defender, 'y', tall * .16, .3); to(defender, { x: clampX(defender.x + direction * 130), rot: direction * .16 }, .2, easeOut); after(.55, () => { if (!defender.out) to(defender, { x: defender.home, rot: 0 }, .3, easeInOut); }); }
  }
  const hitOf = beat => ({ target: 1 - beat.attacker, attacker: beat.attacker, damage: beat.damage, hp: [...beat.hp], guard: beat.guard, dodge: Boolean(beat.dodge), crit: Boolean(beat.crit), round: beat.round, name: beat.roundName, move: beat.label ?? null });
  /** 没造成伤害的小碰一下：连击里前面的几下。对方正在闪就不算打中。 */
  function tap(attacker, defender, kind) {
    if (defender === dodging) { evade(defender, attacker.face); return; }
    flinch(defender, attacker.face); sparks(defender.x, chest(defender), attacker.theme.accent, 6, .6); cam.shake = Math.max(cam.shake, 4);
    if (kind) confetti(kind, defender.x, chest(defender), 3, attacker.theme.color, attacker.theme.accent, .6, 13);
  }
  /** 造成伤害的那一下：硬直、震屏、闪白、火花、数字，并把体力报给界面。被闪开的一击只报一声、不演受击。 */
  function impact(attacker, defender, beat, power = 1, kind) {
    const direction = attacker.face, y = chest(defender);
    reported += 1;
    if (beat.dodge) { evade(defender, direction); onHit(hitOf(beat)); return; }
    if (beat.crit) power *= 1.2;
    freeze = beat.guard ? .04 : .06 + .03 * power; cam.shake = (beat.guard ? 5 : 9 + beat.damage * .55) * power; defender.flash = 1;
    if (beat.guard) { ring(defender.x - direction * 30, y, '#e2e8f0', 20, 74, .3, 1.25, 5); sparks(defender.x - direction * 30, y, '#f8fafc', 8, .7); floating(defender.x, ground - tall * .94, text.guard, '#e2e8f0', 20); }
    else {
      sparks(defender.x, y, attacker.theme.color, 16 + beat.damage, .8 + power * .3); ring(defender.x, y, attacker.theme.accent, 16, 90 + beat.damage * 2, .4);
      if (kind) confetti(kind, defender.x, y, 7 + Math.round(power * 3), attacker.theme.color, attacker.theme.accent, .8 + power * .25, 15);
      if (beat.crit) floating(defender.x - direction * 14, ground - tall * 1.02, text.crit, '#fde047', 22);
    }
    floating(defender.x + direction * 18, ground - tall * .8, `-${beat.damage}`, beat.guard ? '#cbd5e1' : beat.crit ? '#fde047' : '#fca5a5', 30 + Math.min(18, beat.damage * .5));
    if (beat.ko) defender.out = true;
    spawn(recoil(defender, direction, beat.guard ? .25 : .55 + power * .35));
    onHit(hitOf(beat));
  }
  function* backHome(fighter, hop = tall * .28) { spawn(trail(fighter, .22)); arc(fighter, 'y', hop, .34); to(fighter, { rot: -fighter.face * .5 }, .17); yield to(fighter, { x: fighter.home }, .34, easeInOut); yield to(fighter, { rot: 0, sx: 1, sy: 1 }, .08); dust(fighter.x); }
  /** 出手前的架势：施法后撤半步、投掷先仰后甩、唱歌吸一口气、浮起来。 */
  function* stance(fighter, kind = 'cast', time = .26) {
    const direction = fighter.face;
    if (kind === 'throw') { yield to(fighter, { rot: -direction * .18, x: fighter.home - direction * 24, sx: 1.04, sy: .97 }, time * .7); yield to(fighter, { rot: direction * .16, x: fighter.home + direction * 16, sx: .97, sy: 1.03 }, time * .3, easeIn); }
    else if (kind === 'sing') { arc(fighter, 'y', tall * .05, time); yield to(fighter, { sx: .95, sy: 1.06, rot: direction * .07 }, time); }
    else if (kind === 'float') yield to(fighter, { y: tall * .09, sx: .98, sy: 1.03 }, time);
    else yield to(fighter, { x: fighter.home - direction * 22, sx: 1.05, sy: .96 }, time);
  }
  function* settle(fighter, time = .28) { yield to(fighter, { x: fighter.home, y: 0, rot: 0, sx: 1, sy: 1 }, time, easeInOut); }

  // ---- 飞出去的东西、近身留下的痕迹、地上滚过去的东西、落在对手身上的印记、跑过去的伙伴 ----
  /** 一样东西沿路径从 from 飞到 to：直线、抛物线（arc）、蛇形（wave）或拐个弯追过去（home）。 */
  function fly(shape, from, target, o = {}) {
    const paint = battleShapes[shape], life = o.life ?? .3, size = o.size ?? 28, route = o.path ?? 'line', color = o.color ?? '#fff', accent = o.accent ?? '#fff', ease = o.ease ?? linear;
    const [x0, y0] = from, [x1, y1] = target, dx = x1 - x0, dy = y1 - y0, length = Math.hypot(dx, dy) || 1, nx = -dy / length, ny = dx / length;
    const lift = o.lift ?? Math.max(70, Math.abs(dx) * .3), phase = random() * TAU, bend = (random() - .5) * 2 * (o.bend ?? 130), tail = [];
    const spot = k => {
      const e = ease(clamp(k, 0, 1)); let x = x0 + dx * e, y = y0 + dy * e;
      if (route === 'arc') y -= lift * Math.sin(Math.PI * e);
      else if (route === 'wave') { const sway = (o.wobble ?? 22) * Math.sin(e * TAU * 1.5 + phase) * Math.sin(Math.PI * e); x += nx * sway; y += ny * sway; }
      else if (route === 'home') { const sway = bend * Math.sin(Math.PI * e); x += nx * sway; y += ny * sway - 40 * Math.sin(Math.PI * e); }
      return [x, y];
    };
    if (paint) effect({ life, under: o.under, draw: (item, k) => {
      const [x, y] = spot(k), [ax, ay] = spot(k - .03), [bx, by] = spot(k + .03), grow = 1 + ((o.grow ?? 1) - 1) * k;
      if (o.tail !== false) { tail.push([x, y]); if (tail.length > 7) tail.shift(); ctx.save(); tail.forEach(([tx, ty], index) => glowDot(tx, ty, size * (.22 + index * .05), color, .05 + index * .05)); ctx.restore(); }
      ctx.translate(x, y); ctx.rotate((pointed.has(shape) ? Math.atan2(by - ay, bx - ax) : 0) + (o.spin ?? 0) * item.time); ctx.scale(grow, grow);
      paint(ctx, size, item.time, color, accent, o);
    } });
    return life;
  }
  /** 近身一下在对手身上留下的痕迹：墨痕、爪痕、纱巾、掌风、水花、星光，默认是一道刀光。 */
  function mark(kind, x, y, direction, index, attacker) {
    const { color, accent } = attacker.theme, angle = [-.5, .55, -.15][index % 3], turn = direction > 0 ? angle : Math.PI - angle;
    if (kind === 'ink') {
      effect({ life: .62, draw: (item, k) => {
        const length = tall * .7; ctx.translate(x, y); ctx.rotate(turn); ctx.globalAlpha = k < .5 ? 1 : 1 - (k - .5) / .5; ctx.scale(Math.min(1, k / .16), 1);
        ctx.beginPath(); ctx.moveTo(-length / 2, 4); ctx.quadraticCurveTo(-length * .1, -length * .26, length / 2, -6); ctx.quadraticCurveTo(-length * .05, -length * .08, -length / 2, 4); ctx.closePath();
        ctx.fillStyle = '#0b0d18'; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
      } });
      confetti('drop', x, y, 4, color, accent, .7, 9);
    } else if (kind === 'claw') { for (let n = -1; n <= 1; n++) slash(x - Math.sin(turn) * n * 22, y + Math.cos(turn) * n * 22, turn, tall * (.5 - Math.abs(n) * .07), n ? color : '#ffffff', .26); }
    else if (kind === 'ribbon') effect({ life: .42, draw: (item, k) => {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k < .2 ? k / .2 : 1 - (k - .2) / .8; ctx.lineCap = 'round';
      for (const [width, tone] of [[18, color], [5, '#ffffff']]) { ctx.strokeStyle = tone; ctx.lineWidth = width; ctx.beginPath();
        for (let s = 0; s <= 24; s++) { const u = s / 24, px = x - direction * 150 + direction * 210 * u, py = y + Math.sin(u * 7 + index * 2 + item.time * 14) * 30 * (1 - u * .4); if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); }
    } });
    else if (kind === 'palm') { ring(x, y, accent, 12, 96, .36, 1.5, 9); ring(x + direction * 20, y, color, 8, 64, .3, 1.5, 5); }
    else if (kind === 'splash') { confetti('bubble', x, y + 30, 7, color, accent, .9, 12); ring(x, ground, accent, 16, 110, .4, .24, 5); }
    else { slash(x, y, turn, tall * .62, color); if (kind === 'star') confetti('star', x, y, 3, color, accent, .7, 12); }
  }
  /** 一道光：平常的光束、棱镜分出的七色光、提灯照出的一片暖光。 */
  function light(style, x0, y0, x1, y1, life, color, accent) {
    if (style === 'lamp') effect({ life, draw: (item, k) => {
      const open = (k < .15 ? k / .15 : 1 - Math.max(0, (k - .75) / .25)) * (1 + .06 * Math.sin(item.time * 50)), spread = 78 * open, length = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / length, ny = (x1 - x0) / length;
      const fill = ctx.createLinearGradient(x0, y0, x1, y1); fill.addColorStop(0, '#fff6dc'); fill.addColorStop(.3, accent); fill.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .75; ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 + nx * spread, y1 + ny * spread); ctx.lineTo(x1 - nx * spread, y1 - ny * spread); ctx.closePath(); ctx.fill();
      glowDot(x0, y0, 30 + 16 * open, color, .9);
    } });
    else if (style === 'prism') { beam(x0, y0, x1, y1, '#ffffff', life, 8); rainbow.forEach((tone, index) => effect({ life, draw: (item, k) => {
      const open = k < .2 ? k / .2 : 1 - Math.max(0, (k - .75) / .25);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .8 * open; ctx.strokeStyle = tone; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1 + (index - 3) * 13 * open); ctx.stroke();
    } })); }
    else beam(x0, y0, x1, y1, color, life, 24);
  }
  /** 贴着地面或顺着手里的东西滚向对手的一样东西：浪、琴键、祥云、蒸汽、卷轴、毛线球、路线、晶簇。 */
  function traveler(kind, { x0, x1, sx0 = x0, sy0 = ground, y1 = ground, direction, life, attacker }) {
    const { color, accent } = attacker.theme, span = x1 - x0;
    effect({ life: life + .25, under: kind === 'keys' || kind === 'route', draw: item => {
      const k = Math.min(1, item.time / life), out = item.time > life ? Math.max(0, 1 - (item.time - life) / .25) : 1, x = x0 + span * k, t = item.time;
      if (kind === 'wave') {
        const h = 46 + 74 * Math.sin(Math.PI * Math.min(1, k * 1.1)), fill = ctx.createLinearGradient(0, ground - h, 0, ground); fill.addColorStop(0, accent); fill.addColorStop(1, color);
        ctx.globalAlpha = .85 * out; ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(x - direction * 210, ground + 6);
        ctx.bezierCurveTo(x - direction * 120, ground - h * .5, x - direction * 50, ground - h * 1.05, x + direction * 6, ground - h);
        ctx.bezierCurveTo(x + direction * 46, ground - h * .95, x + direction * 52, ground - h * .5, x + direction * 26, ground - h * .42);
        ctx.bezierCurveTo(x + direction * 40, ground - h * .2, x + direction * 44, ground, x + direction * 50, ground + 6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.globalAlpha = .9 * out; ctx.beginPath(); ctx.moveTo(x - direction * 60, ground - h * .98); ctx.quadraticCurveTo(x - direction * 10, ground - h * 1.08, x + direction * 30, ground - h * .78); ctx.stroke();
        for (let i = 0; i < 5; i++) disc(ctx, x + direction * (20 + i * 9), ground - h * (.6 + .12 * Math.sin(t * 20 + i * 2)) - i * 6, 3, '#ffffff');
      } else if (kind === 'keys') {
        const count = 16, width = Math.abs(span) / count;
        for (let i = 0; i < count; i++) {
          const head = k * (count + 3) - i; if (head < 0) continue;
          const lit = clamp(head, 0, 3) / 3, rise = 46 * Math.sin(Math.PI * lit), kx = x0 + span * (i + .5) / count;
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = out; ctx.fillStyle = lit < 1 ? accent : '#f8fafc'; ctx.fillRect(kx - width / 2 + 1, ground - 10 - rise, width - 2, 30);
          if (i % 7 !== 2 && i % 7 !== 6) { ctx.fillStyle = '#12141d'; ctx.fillRect(kx + width / 2 - width * .28, ground - 10 - rise, width * .56, 18); }
          if (lit < 1) glowDot(kx, ground - 14 - rise, 24, color, .6 * out);
        }
      } else if (kind === 'cloud') {
        for (let i = 0; i < 3; i++) {
          const cx = x - direction * i * 74, cy = ground - 50 - 12 * Math.sin(t * 8 + i), size = 46 - i * 8; ctx.globalAlpha = (.9 - i * .2) * out;
          for (const [ox, oy, r] of [[-.8, .25, .7], [0, -.25, 1], [.8, .2, .75], [0, .35, .9]]) disc(ctx, cx + ox * size, cy + oy * size, size * r * .62, '#f4f0ff');
          ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, size * .42, t * 5 + i, t * 5 + i + 4.4); ctx.stroke();
        }
      } else if (kind === 'steam') {
        for (let i = 0; i < 8; i++) { const rise = (t * 60 + i * 23) % 70; ctx.globalAlpha = Math.max(0, .55 - i * .06) * out * (1 - rise / 90); disc(ctx, x - direction * i * 30, ground - 24 - rise - i * 4, 15 + i * 3 + rise * .15, '#ffffff'); }
      } else if (kind === 'ribbon') {
        const tip = sx0 + (x1 - sx0) * k, spot = u => [sx0 + (tip - sx0) * u, sy0 + (y1 - sy0) * u + Math.sin(u * 9 - t * 10) * 16 * Math.sin(Math.PI * u)]; ctx.lineCap = 'round';
        for (const [width, tone, alpha] of [[26, color, .5], [18, '#fdfbf0', .95]]) { ctx.strokeStyle = tone; ctx.lineWidth = width; ctx.globalAlpha = alpha * out; ctx.beginPath(); for (let s = 0; s <= 30; s++) { const [px, py] = spot(s / 30); if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); }
        ctx.fillStyle = color; ctx.globalAlpha = .8 * out; for (let s = 2; s < 30; s += 2) { const [px, py] = spot(s / 30); ctx.fillRect(px - 1.5, py - 6, 3, 12); }
        const [tx, ty] = spot(1); glowDot(tx, ty, 26, accent, out);
      } else if (kind === 'yarn') {
        ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.globalAlpha = .8 * out; ctx.beginPath(); for (let s = 0; s <= 20; s++) { const u = s / 20, px = x0 + (x - x0) * u; if (s) ctx.lineTo(px, ground - 4 + Math.sin(u * 20) * 3); else ctx.moveTo(px, ground - 4); } ctx.stroke();
        ctx.translate(x, ground - 28 - Math.abs(Math.sin(k * Math.PI * 3)) * 30); ctx.rotate(t * 14 * direction); ctx.globalAlpha = out; battleShapes.yarn(ctx, 56, t, color, accent);
      } else if (kind === 'route') {
        const spot = u => [x0 + span * u, ground - 6 - Math.sin(u * TAU) * 14];
        ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.setLineDash([12, 9]); ctx.globalAlpha = out; ctx.beginPath(); for (let s = 0; s <= 24; s++) { const [px, py] = spot(s / 24 * k); if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); ctx.setLineDash([]);
        if (k > .7) { ctx.lineWidth = 5; ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(x1 - 13, ground - 16); ctx.lineTo(x1 + 13, ground + 6); ctx.moveTo(x1 + 13, ground - 16); ctx.lineTo(x1 - 13, ground + 6); ctx.stroke(); }
        const [tx, ty] = spot(k); glowDot(tx, ty, 16, color, out);
      } else if (kind === 'spikes') {
        const count = 6;
        for (let i = 0; i < count; i++) {
          const grow = clamp(k * (count + 1) - i, 0, 1); if (!grow) continue;
          const px = x0 + span * (i + 1) / count, height = (44 + i * 16) * easeOut(grow), half = 13 + i * 2, fill = ctx.createLinearGradient(px, ground - height, px, ground); fill.addColorStop(0, '#ffffff'); fill.addColorStop(.4, accent); fill.addColorStop(1, color);
          ctx.globalAlpha = .92 * out; ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(px - half, ground + 2); ctx.lineTo(px + direction * half * .8, ground - height); ctx.lineTo(px + half, ground + 2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
    } });
  }
  /** 在对手身上或脚下慢慢成形的印记：符文、卷轴、五线谱、太极、漩涡、经纬、星座、旋风。big 是放大的倍数。 */
  function sigil(markKind, x, life, attacker, o = {}, big = 1) {
    const { color, accent } = attacker.theme, cy = ground - tall * .5, glyphs = [...(o.glyphs ?? 'ΑΩΔΣΦΨ')], points = Array.from({ length: 7 }, () => [(random() - .5) * 230 * big, -tall * (.12 + random() * .95)]);
    effect({ life: life + .2, under: markKind === 'taiji' || markKind === 'vortex', draw: item => {
      const k = Math.min(1, item.time / life), out = item.time > life ? Math.max(0, 1 - (item.time - life) / .2) : 1, t = item.time; ctx.globalAlpha = out;
      if (markKind === 'runes') {
        const radius = (130 - 70 * easeIn(k)) * big; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = .5 * out; ctx.beginPath(); ctx.ellipse(x, cy, radius, radius * .42, 0, 0, TAU); ctx.stroke();
        ctx.font = `700 ${26 * big}px Georgia, "Times New Roman", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = accent;
        glyphs.forEach((glyph, index) => { const a = index * TAU / glyphs.length + t * 3.2; ctx.globalAlpha = Math.min(1, k * 3) * out * (Math.sin(a) > 0 ? 1 : .5); ctx.fillText(glyph, x + Math.cos(a) * radius, cy + Math.sin(a) * radius * .42); });
      } else if (markKind === 'scroll') {
        const radius = (100 - 34 * k) * big; ctx.lineCap = 'round';
        for (const [width, tone, alpha] of [[24, color, .45], [16, '#fdfbf0', .95]]) { ctx.strokeStyle = tone; ctx.lineWidth = width; ctx.globalAlpha = alpha * out; ctx.beginPath(); ctx.ellipse(x, cy, radius, radius * .36, -.12, t * 2, t * 2 + TAU * Math.min(1, k * 1.4)); ctx.stroke(); }
      } else if (markKind === 'staff') {
        const squeeze = 1 - .6 * easeIn(k), half = 130 * big; ctx.strokeStyle = accent; ctx.lineWidth = 2;
        for (let row = 0; row < 5; row++) { ctx.globalAlpha = Math.min(1, k * 4) * out * .9; ctx.beginPath(); for (let s = 0; s <= 30; s++) { const u = s / 30, px = x - half + half * 2 * u, py = cy + (row - 2) * 16 * squeeze + Math.sin(u * 8 + t * 8) * 10 * squeeze; if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); }
        for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(x - half + half * 2 * ((i * .27 + t * .5) % 1), cy + (i - 1.5) * 14 * squeeze); battleShapes.note(ctx, 26, t, color, accent); ctx.restore(); }
      } else if (markKind === 'taiji') {
        const r = 150 * big * easeOut(Math.min(1, k * 1.6)); ctx.translate(x, ground); ctx.scale(1, .28); ctx.rotate(t * 3); ctx.globalAlpha = .7 * out; disc(ctx, 0, 0, r, color);
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); ctx.arc(0, r / 2, r / 2, Math.PI / 2, Math.PI * 1.5); ctx.arc(0, -r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true); ctx.fill();
        disc(ctx, 0, -r / 2, r * .12, color); disc(ctx, 0, r / 2, r * .12, accent); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      } else if (markKind === 'vortex') {
        ctx.translate(x, ground); ctx.scale(1, .3); ctx.rotate(-t * 5); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let arm = 0; arm < 3; arm++) { ctx.strokeStyle = arm % 2 ? accent : color; ctx.lineWidth = 6; ctx.globalAlpha = .85 * out; ctx.beginPath(); for (let s = 0; s <= 40; s++) { const a = s / 40 * TAU * 1.5 * k + arm * TAU / 3, r = 6 + s / 40 * 150 * big * k; if (s) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.stroke(); }
      } else if (markKind === 'grid') {
        const box = (150 - 100 * easeIn(k)) * big; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalCompositeOperation = 'lighter';
        for (let i = -3; i <= 3; i++) { ctx.globalAlpha = (i ? .35 : .9) * out; ctx.beginPath(); ctx.moveTo(x + i * box / 3, cy - box); ctx.lineTo(x + i * box / 3, cy + box); ctx.moveTo(x - box, cy + i * box / 3); ctx.lineTo(x + box, cy + i * box / 3); ctx.stroke(); }
        ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.globalAlpha = out; ctx.beginPath(); ctx.arc(x, cy, 16 + box * .5, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(x, cy, 6 + box * .2, t * 4, t * 4 + 4.5); ctx.stroke();
      } else if (markKind === 'stars') {
        const shown = points.slice(0, Math.ceil(k * points.length * 1.15)); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = .8 * out; ctx.beginPath();
        shown.forEach(([px, py], index) => index ? ctx.lineTo(x + px, ground + py) : ctx.moveTo(x + px, ground + py)); ctx.stroke();
        shown.forEach(([px, py], index) => { ctx.save(); ctx.translate(x + px, ground + py); ctx.rotate(t * 2 + index); ctx.globalAlpha = out; battleShapes.star(ctx, 16 + 5 * Math.sin(t * 9 + index), t, color, accent); ctx.restore(); });
      } else if (markKind === 'tornado') {
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let i = 0; i < 10; i++) { const rx = (16 + i * 11) * big * easeOut(Math.min(1, k * 2)); ctx.strokeStyle = i % 2 ? accent : color; ctx.lineWidth = 5 - i * .25; ctx.globalAlpha = (.75 - i * .04) * out; ctx.beginPath(); ctx.ellipse(x + Math.sin(t * 7 + i * .7) * (4 + i * 2), ground - i * tall * .12, rx, rx * .28, 0, t * 12 + i, t * 12 + i + 4.2); ctx.stroke(); }
      }
    } });
  }
  /** 从一头跑到另一头的伙伴：羊驼贴地跑，飞鱼划一道弧线。 */
  function runner(kind, x0, x1, life, { direction, size, lane = 0, color, accent, hop = kind === 'fish' ? tall * .3 : 12, under = false }) {
    effect({ life, under, draw: (item, k) => {
      const x = x0 + (x1 - x0) * k, y = kind === 'fish' ? ground - lane - hop * Math.sin(Math.PI * k) : ground - lane - size * .5 - hop * Math.abs(Math.sin(item.time * 16));
      ctx.globalAlpha = k > .9 ? (1 - k) / .1 : Math.min(1, k * 8); ctx.translate(x, y); ctx.scale(direction, 1); if (kind === 'fish') ctx.rotate(-.5 * Math.cos(Math.PI * k));
      battleShapes[kind](ctx, size, item.time, color, accent);
    } });
  }

  // ---- 平常的招式：几种套路，飞什么、留什么痕迹由角色的打法定 ----
  const forms = {
    /** 远远地打出去一样或几样东西。 */
    *volley(attacker, defender, beat, o) {
      const direction = attacker.face, { color, accent } = attacker.theme, count = o.count ?? 3, gap = o.gap ?? .11, miss = beat.dodge, life = (o.life ?? .32) * (miss ? 1.6 : 1), key = o.from ?? 'prop', glyphs = o.glyphs ? [...o.glyphs] : null, size = (o.size ?? 28) * 1.5;
      yield* stance(attacker, o.pose ?? 'cast'); glint(attacker, key);
      for (let i = 0; i < count; i++) {
        const final = i === count - 1, spread = count > 1 && !final ? (i / (count - 1) - .5) * (o.spread ?? 70) : 0;
        fly(o.shape, prop(attacker, key), [defender.x - direction * 14 + (miss ? direction * VW * .5 : 0), chest(defender) + spread], { ...o, size, life, glyph: glyphs?.[i % glyphs.length], color, accent });
        to(attacker, { sx: 1.03, sy: .98 }, .04);
        if (miss) { after(life * .42, () => tap(attacker, defender)); if (final) after(life * .6, () => impact(attacker, defender, beat)); }
        else after(life, () => final ? impact(attacker, defender, beat, o.power ?? 1, o.burst) : tap(attacker, defender, o.burst));
        if (!final) yield gap;
      }
      // 丢出去的玩偶和笼盖会自己回来；套索把人拽过来一截。
      if (o.back && !miss) after(life, () => fly(o.shape, [defender.x - direction * 14, chest(defender)], prop(attacker, key), { ...o, size, life: .42, path: 'arc', color, accent, tail: false }));
      if (o.pull && !miss) after(life + .12, () => { if (defender.out) return; to(defender, { x: defender.home - direction * 80 }, .2, easeOut); after(.42, () => { if (!defender.out) to(defender, { x: defender.home }, .3, easeInOut); }); });
      yield life + (o.back ? .5 : .32); yield* settle(attacker);
    },
    /** 冲到身前（或者跳起来扑过去）打一下到三下。 */
    *strike(attacker, defender, beat, o) {
      const direction = attacker.face, hits = o.hits ?? 2, gap = o.thrust ? reach * 1.25 : reach;
      yield to(attacker, { sx: 1.1, sy: .88 }, .14); dust(attacker.x, -direction); spawn(trail(attacker, .24));
      if (o.leap) { arc(attacker, 'y', tall * Math.min(o.leap, .38), .32); to(attacker, { rot: direction * .3 }, .3); yield to(attacker, { x: defender.x - direction * gap }, .32, easeInOut); }
      else { to(attacker, { sx: .92, sy: 1.05, rot: direction * .12 }, .1); yield to(attacker, { x: defender.x - direction * gap }, o.thrust ? .13 : .17, easeIn); }
      const tx = defender.x, ty = chest(defender);
      if (beat.dodge) evade(defender, direction);
      for (let i = 0; i < hits; i++) {
        const final = i === hits - 1;
        to(attacker, { rot: direction * (i % 2 ? -.1 : .18), x: attacker.x + direction * (o.thrust ? 30 : 12) }, .07);
        if (o.spin && final) for (let turn = 0; turn < 4; turn++) after(turn * .07, () => to(attacker, { sx: turn % 2 ? 1 : -1 }, .07, linear));
        mark(o.trail ?? 'slash', tx - direction * 10, ty + (i - (hits - 1) / 2) * 36, direction, i, attacker);
        yield .07;
        if (final) impact(attacker, defender, beat, o.power ?? (beat.heavy ? 1.1 : .85), o.burst); else tap(attacker, defender, o.burst);
        yield final ? (o.spin ? .3 : .24) : .12;
      }
      yield* backHome(attacker);
    },
    /** 一道光照过去：从道具上，或者从天上。 */
    *ray(attacker, defender, beat, o) {
      const direction = attacker.face, { color, accent } = attacker.theme;
      yield* stance(attacker, 'float'); charge(attacker, 'prop', .42); yield .42;
      const [x0, y0] = o.sky ? [defender.x - direction * VW * .22, -30] : prop(attacker), x1 = defender.x, y1 = o.sky ? ground - tall * .3 : chest(defender);
      if (o.sky) ring(x1, ground, accent, 60, 12, .4, .24, 3);
      if (beat.dodge) evade(defender, direction, o.sky ? 'side' : undefined);
      light(o.style ?? 'plain', x0, y0, x1, y1, .62, color, accent);
      for (let tick = 0; tick < 5; tick++) { cam.shake = Math.max(cam.shake, 6); tap(attacker, defender); yield .1; }
      impact(attacker, defender, beat, o.power ?? 1.1, o.burst); yield .3; yield* settle(attacker);
    },
    /** 贴着地面滚过去一样东西。 */
    *surge(attacker, defender, beat, o) {
      const direction = attacker.face, { color, accent } = attacker.theme, life = o.life ?? .6, [sx0, sy0] = prop(attacker, o.from ?? 'prop'), x1 = defender.x;
      yield* stance(attacker, o.pose ?? 'cast'); glint(attacker, o.from ?? 'prop');
      traveler(o.kind, { x0: attacker.x + direction * attacker.wide * .3, x1, sx0, sy0, y1: chest(defender), direction, life, attacker });
      if (beat.dodge) after(life * .62, () => evade(defender, direction, o.kind === 'ribbon' ? undefined : 'up'));
      yield life;
      if (o.kind === 'route') { fly('pin', [x1, -40], [x1, chest(defender) - 8], { life: .16, size: 46, ease: easeIn, color, accent, tail: false }); yield .16; }
      impact(attacker, defender, beat, o.power ?? 1.05, o.burst); if (o.lift && !beat.dodge && !defender.out) arc(defender, 'y', tall * .14, .3);
      yield .34; yield* settle(attacker);
    },
    /** 从天上落下来几样东西。 */
    *fall(attacker, defender, beat, o) {
      const direction = attacker.face, { color, accent } = attacker.theme, count = o.count ?? 3, life = .3, tx = defender.x, ty = chest(defender);
      yield* stance(attacker, 'float'); glint(attacker); yield .12;
      if (beat.dodge) after(.14, () => evade(defender, direction, 'side'));
      for (let i = 0; i < count; i++) {
        const final = i === count - 1, x = tx + (final ? 0 : (i - (count - 1) / 2) * 46 + (random() - .5) * 20);
        fly(o.shape, [x - direction * (o.slant ?? 120), -40], [x, final ? ty : ground - tall * (.2 + random() * .3)], { ...o, size: (o.size ?? 30) * (final ? 2.1 : 1.4), spin: o.spin ?? 6, life, ease: easeIn, color, accent });
        after(life, () => { if (final) impact(attacker, defender, beat, o.power ?? 1.05, o.burst); else { tap(attacker, defender, o.burst); ring(x, ground, accent, 8, 50, .3, .24, 3); } });
        if (!final) yield .14;
      }
      yield life + .32; yield* settle(attacker);
    },
    /** 在对手身上结一个印，成形了就炸开。 */
    *seal(attacker, defender, beat, o) {
      const direction = attacker.face, { color, accent } = attacker.theme, life = o.life ?? .85, x = defender.x;
      yield* stance(attacker, 'float'); glint(attacker);
      sigil(o.mark, x, life, attacker, o);
      if (beat.dodge) after(life * .7, () => evade(defender, direction, 'side'));
      else if (o.lift) after(life * .35, () => { if (!defender.out) to(defender, { y: tall * .22 }, life * .5, easeOut); });
      yield life;
      if (o.lift && !beat.dodge) yield to(defender, { y: 0 }, .1, easeIn);
      pillar(x, color); ring(x, ground, accent, 20, 170, .5, .24, 6);
      impact(attacker, defender, beat, o.power ?? 1.1, o.burst); yield .34; yield* settle(attacker);
    },
    /** 放伙伴冲过去。 */
    *pet(attacker, defender, beat, o) {
      const direction = attacker.face, { color, accent } = attacker.theme, count = o.count ?? 1, life = o.life ?? .62;
      yield* stance(attacker, 'throw'); glint(attacker);
      const [x0] = prop(attacker), x1 = defender.x + direction * VW * .45, pass = (defender.x - direction * 30 - x0) / (x1 - x0);
      if (beat.dodge) after(life * pass * .55, () => evade(defender, direction, 'up'));
      for (let i = 0; i < count; i++) {
        const final = i === count - 1;
        runner(o.kind, x0, x1, life, { direction, size: o.size ?? 120, lane: o.kind === 'fish' ? tall * (.3 + i * .22) : 0, color, accent });
        after(life * pass, () => { if (final) impact(attacker, defender, beat, o.power ?? 1.1, o.burst); else tap(attacker, defender, o.burst); if (o.kind !== 'fish') dust(defender.x, direction); });
        if (!final) yield .16;
      }
      yield life * pass + .34; yield* settle(attacker);
    },
    /** 脚下一级级升起台阶，走上去，再从高处挥下来。 */
    *steps(attacker, defender, beat, o) {
      const direction = attacker.face, { color, accent } = attacker.theme, count = 4, rise = tall * .09, x0 = attacker.x + direction * 70, x1 = defender.x - direction * reach * 1.25, stair = { shown: 0 };
      effect({ life: 1.75, under: true, draw: (item, k) => { ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < stair.shown; i++) { const x = x0 + (x1 - x0) * i / (count - 1), y = ground - rise * (i + 1), fade = k > .85 ? (1 - k) / .15 : 1; ctx.globalAlpha = .9 * fade; ctx.fillStyle = i % 2 ? accent : color; ctx.fillRect(x - 38, y, 76, 10); ctx.globalAlpha = .16 * fade; ctx.fillRect(x - 38, y + 10, 76, ground - y - 10); } } });
      yield to(attacker, { sx: 1.08, sy: .9 }, .12); to(attacker, { sx: 1, sy: 1 }, .1);
      for (let i = 0; i < count; i++) { stair.shown = i + 1; const x = x0 + (x1 - x0) * i / (count - 1); ring(x, ground - rise * (i + 1), accent, 6, 44, .3, .3, 3); ghost(attacker); yield to(attacker, { x, y: rise * (i + 1) + 4 }, .15, easeOut); yield .05; }
      glint(attacker); yield .16;
      const tx = defender.x, ty = chest(defender);
      if (beat.dodge) evade(defender, direction, 'side');
      spawn(trail(attacker, .16)); to(attacker, { rot: direction * .5 }, .12); yield to(attacker, { x: tx - direction * reach * .8, y: 0 }, .14, easeIn);
      attacker.rot = direction * .15; to(attacker, { sx: 1.12, sy: .86 }, .06); slash(tx - direction * 6, ty, direction > 0 ? 1.15 : Math.PI - 1.15, tall * .9, accent, .32);
      ring(tx - direction * 30, ground, accent, 30, 220, .5, .22, 7); dust(tx - direction * 40, -1);
      impact(attacker, defender, beat, o.power ?? 1.2, o.burst); yield .32; yield* backHome(attacker, tall * .2);
    },
  };

  // ---- 必杀：每位一个，只有她自己有 ----
  const ults = {
    /** 神谕诗人：卷轴横过天空，字句化成光落下来。 */
    *oracle(A, D, beat) {
      const d = A.face, { color, accent } = A.theme, x = D.x, [sx0, sy0] = prop(A, 'alt');
      yield* stance(A, 'float', .2);
      effect({ life: 1.9, draw: (item, k) => {
        const open = Math.min(1, k * 2.4), fade = k > .85 ? (1 - k) / .15 : 1; ctx.lineCap = 'round';
        for (const [width, tone, alpha] of [[30, color, .4], [20, '#fdfbf0', .95]]) { ctx.strokeStyle = tone; ctx.lineWidth = width; ctx.globalAlpha = alpha * fade; ctx.beginPath();
          for (let s = 0; s <= 36; s++) { const u = s / 36 * open, px = sx0 + (x + d * 110 - sx0) * u, py = sy0 + (VH * .13 - sy0) * Math.sin(Math.PI * .5 * Math.min(1, u * 2.2)) + Math.sin(u * 10 - item.time * 6) * 8; if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); }
      } });
      sigil('runes', x, 1.5, A, { glyphs: 'ΑΩΔΣΦΨΘΛ' }, 1.25); yield .7;
      for (let i = 0; i < 4; i++) { const px = x + (i - 1.5) * 44; beam(px, VH * .14, px, ground - 10, i % 2 ? accent : color, .24, 12); confetti('feather', px, VH * .2, 2, color, accent, .5, 16); yield .09; tap(A, D); cam.shake = 8; yield .08; }
      pillar(x, color); cam.flash = .9; impact(A, D, beat, 1.7, 'feather');
    },
    /** 提灯的引路人：天黑下来只剩一盏灯，灯火一簇簇飞过去，炸成十二道光芒。 */
    *lantern(A, D, beat) {
      const d = A.face, { color, accent } = A.theme;
      to(cam, { dim: .84 }, .3); yield* stance(A, 'float', .3);
      effect({ life: 2, draw: (item, k) => { const [x, y] = prop(A), fade = k > .85 ? (1 - k) / .15 : Math.min(1, k * 4); glowDot(x, y, 150 + 20 * Math.sin(item.time * 9), accent, .55 * fade); glowDot(x, y, 46, '#fff6dc', fade); } });
      yield .45;
      for (let i = 0; i < 8; i++) { fly('flame', prop(A), [D.x - d * 10, chest(D) + (random() - .5) * 90], { path: 'home', bend: 190, life: .5, size: 30, color, accent }); after(.5, () => tap(A, D, 'flame')); yield .08; }
      yield .5;
      const x = D.x, y = chest(D);
      effect({ life: .7, draw: (item, k) => {
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.strokeStyle = accent;
        for (let i = 0; i < 12; i++) { const a = i * TAU / 12 + .26, from = 26 + 60 * easeOut(k), length = (i % 2 ? 90 : 150) * easeOut(k); ctx.globalAlpha = 1 - k; ctx.lineWidth = (i % 2 ? 7 : 11) * (1 - k * .6); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * from, y + Math.sin(a) * from); ctx.lineTo(x + Math.cos(a) * (from + length), y + Math.sin(a) * (from + length)); ctx.stroke(); }
        glowDot(x, y, 90 * (1 - k * .5), color, 1 - k);
      } });
      cam.flash = .9; impact(A, D, beat, 1.7, 'flame');
    },
    /** 双子星偶像：另一个自己出现在对面，两边一起唱，星星落下来。 */
    *twin(A, D, beat) {
      const d = A.face, { color, accent } = A.theme, far = clamp(D.x + d * reach * 1.7, A.wide * .5, VW - A.wide * .5), layer = tinted(A, accent), mirror = { x: far, y: 0, rot: 0, sx: -1, sy: 1 };
      yield* stance(A, 'sing', .22);
      if (A.image) effect({ life: 1.75, draw: (item, k) => { ctx.globalAlpha = .8 * (k < .12 ? k / .12 : k > .88 ? (1 - k) / .12 : 1); sprite(A, A.image, mirror); if (layer) { ctx.globalAlpha *= .45; ctx.globalCompositeOperation = 'lighter'; sprite(A, layer, mirror); } } });
      ring(far, ground - tall * .5, accent, 20, 150, .5); yield .35;
      for (let i = 0; i < 5; i++) {
        fly('wave', prop(A), [D.x - d * 16, chest(D)], { size: 44, grow: 2.2, life: .3, color, accent, tail: false });
        fly('wave', [far - d * A.wide * .2, ground - tall * .8], [D.x + d * 16, chest(D)], { size: 44, grow: 2.2, life: .3, color: accent, accent: color, tail: false });
        after(.3, () => { tap(A, D, 'star'); cam.shake = 8; }); to(A, { sy: 1.08, sx: .94 }, .06); after(.07, () => to(A, { sy: 1.03, sx: .97 }, .08)); yield .17;
      }
      for (let i = 0; i < 6; i++) fly('star', [D.x + (i - 2.5) * 60, -30], [D.x + (i - 2.5) * 14, chest(D)], { life: .26 + i * .02, size: 30, spin: 8, ease: easeIn, color, accent });
      yield .36; pillar(D.x, color); cam.flash = .9; impact(A, D, beat, 1.7, 'star');
    },
    /** 海洋歌姬：海面漫上来，一头鲸从对手脚下跃起。 */
    *whale(A, D, beat) {
      const d = A.face, { color, accent } = A.theme, x = D.x;
      yield* stance(A, 'float', .25);
      effect({ life: 2.3, under: true, draw: (item, k) => {
        const level = 46 * (k < .2 ? k / .2 : k > .8 ? (1 - k) / .2 : 1), fill = ctx.createLinearGradient(0, ground - level, 0, VH); fill.addColorStop(0, accent); fill.addColorStop(1, color);
        ctx.globalAlpha = .55; ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(-40, VH + 40); for (let s = 0; s <= 40; s++) ctx.lineTo(-40 + (VW + 80) * s / 40, ground - level + Math.sin(s * .9 + item.time * 5) * 7); ctx.lineTo(VW + 40, VH + 40); ctx.closePath(); ctx.fill();
      } });
      charge(A, 'prop', .6); yield .7;
      effect({ life: 1.05, draw: (item, k) => { ctx.translate(x - d * 150 + d * 300 * k, ground + 90 - tall * 1.25 * Math.sin(Math.PI * k)); ctx.scale(d, 1); ctx.rotate(-1.15 * Math.cos(Math.PI * k)); battleShapes.whale(ctx, 330, item.time, color, accent); } });
      ring(x - d * 150, ground, accent, 20, 160, .5, .24, 6); confetti('bubble', x - d * 150, ground, 10, color, accent, 1.2, 12);
      yield .4; cam.flash = .8; impact(A, D, beat, 1.8, 'bubble'); arc(D, 'y', tall * (D.out ? .28 : .36), D.out ? .4 : .55);
      yield .55; ring(x + d * 150, ground, accent, 20, 200, .5, .24, 6); confetti('bubble', x + d * 150, ground, 12, color, accent, 1.2, 12); cam.shake = 9; yield .25;
    },
    /** 小飞鱼：一群飞鱼来回穿过去。 */
    *school(A, D, beat) {
      const d = A.face, { color, accent } = A.theme;
      yield* stance(A, 'throw', .22); glint(A);
      for (let i = 0; i < 9; i++) { const way = i % 2 ? -d : d; runner('fish', D.x - way * VW * .42, D.x + way * VW * .42, .42, { direction: way, size: 100 + (i % 3) * 22, lane: tall * (.2 + (i * 37 % 60) / 100), color, accent, hop: tall * .18 }); after(.21, () => { tap(A, D, 'bubble'); cam.shake = 7; }); yield .1; }
      yield .25; ring(D.x, ground, accent, 20, 220, .5, .24, 7); cam.flash = .85; impact(A, D, beat, 1.7, 'bubble');
    },
    /** 千问学者：一圈“问”围上来，转成“答”一起落下。 */
    *thousand(A, D, beat) {
      const { color, accent } = A.theme, x = D.x, cy = chest(D);
      yield* stance(A, 'float', .22); glint(A);
      effect({ life: 1.35, draw: (item, k) => {
        const turned = k > .62, radius = turned ? 150 * (1 - easeIn((k - .62) / .38)) + 10 : 90 + 60 * easeOut(Math.min(1, k * 2)), glyph = turned ? '答' : '问';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${turned ? 34 : 26}px ${serif}`; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(11,13,20,.8)';
        for (let i = 0; i < 16; i++) { const a = i * TAU / 16 + item.time * (turned ? 7 : 2.4), gx = x + Math.cos(a) * radius, gy = cy + Math.sin(a) * radius * (i % 2 ? .5 : .9); ctx.globalAlpha = Math.min(1, k * 5); ctx.strokeText(glyph, gx, gy); ctx.fillStyle = turned ? '#ffffff' : accent; ctx.fillText(glyph, gx, gy); }
      } });
      sigil('scroll', x, 1.3, A, {}, 1.3);
      yield .84; for (let i = 0; i < 4; i++) { tap(A, D); cam.shake = 7; yield .12; }
      pillar(x, color); cam.flash = .9; impact(A, D, beat, 1.7);
    },
    /** 夜之钢琴家：月亮升起来，琴键从脚下一路亮到对手那里。 */
    *moonlight(A, D, beat) {
      const d = A.face, { color, accent } = A.theme, x = D.x;
      yield* stance(A, 'float', .22);
      effect({ life: 2.6, under: true, draw: (item, k) => { const fade = k < .15 ? k / .15 : k > .85 ? (1 - k) / .15 : 1, mx = VW / 2, my = VH * .3 - 30 * Math.min(1, k * 3); glowDot(mx, my, 150, accent, .5 * fade); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fade; disc(ctx, mx, my, 52, '#f4f6ff'); ctx.globalAlpha = .14 * fade; disc(ctx, mx - 16, my - 10, 12, '#6f7fd6'); disc(ctx, mx + 18, my + 14, 8, '#6f7fd6'); } });
      yield .5; traveler('keys', { x0: A.x + d * A.wide * .3, x1: x + d * 60, direction: d, life: .8, attacker: A });
      for (let i = 0; i < 5; i++) { yield .16; if (i > 1) { tap(A, D, 'note'); cam.shake = 7; } confetti('note', A.x + d * (120 + i * 70), ground - 30, 2, color, accent, .6, 22); }
      for (let i = 0; i < 3; i++) { beam(x + (i - 1) * 40, -30, x + (i - 1) * 16, ground - 20, i === 1 ? accent : color, .3, 14); yield .08; }
      cam.flash = .9; impact(A, D, beat, 1.7, 'note');
    },
    /** 光谱法师：水晶把光拆成七色扫过去，再合成一束。 */
    *spectrum(A, D, beat) {
      const { color, accent } = A.theme;
      yield* stance(A, 'float', .22); charge(A, 'prop', .5); yield .5;
      effect({ life: 1, draw: (item, k) => {
        const [x0, y0] = prop(A), swing = Math.cos(k * Math.PI * 2.5) * (1 - k) * 130; ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        rainbow.forEach((tone, index) => { ctx.globalAlpha = .85 * (k > .9 ? (1 - k) / .1 : 1); ctx.strokeStyle = tone; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(D.x, chest(D) + (index - 3) * (10 + Math.abs(swing) * .5) + swing); ctx.stroke(); }); glowDot(x0, y0, 40, '#ffffff', 1);
      } });
      for (let i = 0; i < 6; i++) { yield .15; tap(A, D, 'shard'); cam.shake = 7; }
      const [x0, y0] = prop(A); beam(x0, y0, D.x, chest(D), '#ffffff', .4, 34); yield .12; cam.flash = .95; impact(A, D, beat, 1.7, 'shard');
    },
    /** 包子铺掌柜：笼盖飞上天，一个大包子落下来。 */
    *feast(A, D, beat) {
      const { color, accent } = A.theme, x = D.x, bun = { y: -160, squash: 1 };
      yield* stance(A, 'throw', .26); glint(A);
      fly('lid', prop(A), [x, -60], { life: .4, size: 56, color, accent });
      effect({ life: .95, under: true, draw: (item, k) => { ctx.globalAlpha = .4 * Math.min(1, k * 2); oval(ctx, x, ground + 4, 40 + 90 * k, 8 + 12 * k, '#000000'); } });
      yield .7;
      effect({ life: 1.1, draw: (item, k) => { ctx.globalAlpha = k > .8 ? (1 - k) / .2 : 1; ctx.translate(x, bun.y); ctx.scale(1 / bun.squash, bun.squash); battleShapes.bun(ctx, 230, item.time, color, accent); } });
      yield to(bun, { y: ground - 100 }, .2, easeIn);
      to(bun, { squash: .72 }, .08); after(.09, () => to(bun, { squash: 1 }, .2)); confetti('steam', x, ground - 40, 14, color, accent, 1.3, 26);
      ring(x, ground, '#ffffff', 40, 320, .7, .22, 10); ring(x, ground, accent, 20, 220, .55, .22, 6); dust(x - 80, -1); dust(x + 80, 1);
      cam.flash = .85; impact(A, D, beat, 1.8, 'steam'); yield .7;
    },
    /** 海螺缪斯：海螺吹出一圈圈越来越大的声浪，脚下起漩涡。 */
    *tide(A, D, beat) {
      const d = A.face, { color, accent } = A.theme;
      yield* stance(A, 'sing', .24); glint(A); sigil('vortex', D.x, 1.5, A, {}, 1.4);
      for (let i = 0; i < 9; i++) {
        fly('wave', prop(A), [D.x - d * 10, chest(D) + (i % 3 - 1) * 26], { size: 34, grow: 3.4, life: .34, color: i % 2 ? accent : color, accent, tail: false });
        if (i % 2) fly('pearl', prop(A), [D.x, chest(D) + (random() - .5) * 120], { path: 'wave', wobble: 40, life: .4, size: 16, color, accent });
        to(A, { sy: 1.09, sx: .93 }, .05); after(.06, () => to(A, { sy: 1.04, sx: .96 }, .06)); after(.34, () => { tap(A, D, 'bubble'); cam.shake = 7; }); yield .13;
      }
      yield .34; pillar(D.x, color); cam.flash = .9; impact(A, D, beat, 1.7, 'bubble');
    },
    /** 混元仙子：脚下铺开太极，气团越聚越大，一掌推过去。 */
    *hunyuan(A, D, beat) {
      const d = A.face, { color, accent } = A.theme, orb = { size: 30 };
      yield* stance(A, 'float', .24); sigil('taiji', VW / 2, 2, A, {}, 2.1);
      effect({ life: .95, draw: (item, k) => { const [x, y] = prop(A); ctx.translate(x, y); ctx.globalAlpha = k > .9 ? (1 - k) / .1 : 1; battleShapes.orb(ctx, orb.size, item.time, color, accent); } });
      charge(A, 'prop', .9); yield to(orb, { size: 150 }, .9, easeIn);
      to(A, { x: A.home + d * 30, rot: d * .1 }, .08);
      fly('orb', prop(A), [D.x, chest(D)], { size: 150, life: .34, ease: easeIn, color, accent }); yield .34;
      ring(D.x, chest(D), accent, 30, 260, .6, 1, 12); ring(D.x, chest(D), '#ffffff', 20, 180, .45, 1, 6); cam.flash = .95; impact(A, D, beat, 1.8); yield .3;
    },
    /** 书法家：凌空写一个大字，整个字压下去。 */
    *word(A, D, beat) {
      const d = A.face, { color, accent } = A.theme, x = D.x, glyph = { y: ground - tall * 1.22, reveal: 0, size: 190 };
      yield* stance(A, 'float', .2); to(A, { y: tall * .2 }, .3);
      effect({ life: 1.6, draw: (item, k) => {
        ctx.globalAlpha = k > .86 ? (1 - k) / .14 : 1; ctx.beginPath(); ctx.rect(x - 140, glyph.y - 140, 280 * glyph.reveal, 280); ctx.clip();
        ctx.font = `900 ${glyph.size}px ${serif}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 10; ctx.strokeStyle = accent; ctx.strokeText('文', x, glyph.y); ctx.fillStyle = '#0b0d18'; ctx.fillText('文', x, glyph.y);
      } });
      for (let i = 0; i < 4; i++) { to(A, { rot: d * (i % 2 ? -.12 : .14) }, .12); confetti('drop', x - 100 + i * 66, glyph.y, 3, color, accent, .5, 10); yield to(glyph, { reveal: (i + 1) / 4 }, .17, easeOut); }
      yield .12; to(A, { rot: d * .3 }, .1); yield to(glyph, { y: chest(D) - 10, size: 230 }, .13, easeIn);
      confetti('drop', x, chest(D), 20, color, accent, 1.4, 14); ring(x, ground, accent, 30, 300, .6, .22, 9); dust(x - 70, -1); dust(x + 70, 1);
      cam.flash = .9; impact(A, D, beat, 1.8, 'drop'); yield .4;
    },
    /** 米兔少女：兔子玩偶越蹦越大，最后一屁股坐下去。 */
    *bunnies(A, D, beat) {
      const d = A.face, { color, accent } = A.theme, stops = [prop(A), [A.x + d * 150, ground - 30], [(A.x + D.x) / 2 + d * 40, ground - 46], [D.x, ground - 70]];
      yield* stance(A, 'throw', .26);
      for (let i = 0; i < 3; i++) { fly('bunny', stops[i], stops[i + 1], { path: 'arc', lift: 130 + i * 40, life: .34, size: 54 + i * 46, spin: i === 2 ? 0 : 6 * d, color, accent, tail: false }); yield .34; if (i < 2) { dust(stops[i + 1][0], d); ring(stops[i + 1][0], ground, accent, 10, 80 + i * 40, .35, .24, 4); cam.shake = 5 + i * 3; } }
      effect({ life: .8, draw: (item, k) => { const bounce = Math.sin(Math.min(1, k * 4) * Math.PI); ctx.globalAlpha = k > .7 ? (1 - k) / .3 : 1; ctx.translate(D.x, ground - 80 + 14 * bounce); ctx.scale(1 + .2 * bounce, 1 - .2 * bounce); battleShapes.bunny(ctx, 170, item.time, color, accent); } });
      confetti('carrot', D.x, ground - 60, 8, color, accent, 1.2, 18); ring(D.x, ground, accent, 30, 300, .6, .22, 9); ring(D.x, ground, '#ffffff', 20, 200, .5, .22, 5); dust(D.x - 80, -1); dust(D.x + 80, 1);
      cam.flash = .85; impact(A, D, beat, 1.8); yield .6;
    },
    /** 猫系少女：一只大猫爪从天上拍下来。 */
    *bigpaw(A, D, beat) {
      const { color, accent } = A.theme, x = D.x, paw = { y: -190 };
      yield* stance(A, 'cast', .24); glint(A); arc(A, 'y', tall * .12, .5);
      effect({ life: .75, under: true, draw: (item, k) => { ctx.globalAlpha = .45 * Math.min(1, k * 2); oval(ctx, x, ground + 4, 40 + 100 * k, 8 + 14 * k, '#000000'); } });
      yield .55;
      effect({ life: 1, draw: (item, k) => { ctx.globalAlpha = k > .75 ? (1 - k) / .25 : 1; ctx.translate(x, paw.y); ctx.rotate(Math.PI); battleShapes.paw(ctx, 260, item.time, '#fff8e6', '#ffb3c7'); } });
      yield to(paw, { y: chest(D) - 20 }, .13, easeIn);
      for (let n = -1; n <= 1; n++) slash(x + n * 46, chest(D), Math.PI / 2 + n * .12, tall * 1.05, n ? color : '#ffffff', .4);
      ring(x, ground, color, 40, 330, .7, .22, 12); ring(x, ground, accent, 20, 220, .55, .22, 7); dust(x - 70, -1); dust(x + 70, 1);
      cam.flash = .9; impact(A, D, beat, 1.8); to(paw, { y: chest(D) - 60 }, .3); yield .55;
    },
    /** 登阶寻星人：台阶一级级升到半空，站在最高处引一场流星雨。 */
    *stairway(A, D, beat) {
      const d = A.face, { color, accent } = A.theme, count = 5, rise = tall * .072, stair = { shown: 0 }, x0 = A.x + d * 50, x1 = A.x + d * 230;
      effect({ life: 2.7, under: true, draw: (item, k) => { ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < stair.shown; i++) { const x = x0 + (x1 - x0) * i / (count - 1), y = ground - rise * (i + 1), fade = k > .9 ? (1 - k) / .1 : 1; ctx.globalAlpha = .9 * fade; ctx.fillStyle = i % 2 ? accent : color; ctx.fillRect(x - 40, y, 80, 10); ctx.globalAlpha = .16 * fade; ctx.fillRect(x - 40, y + 10, 80, ground - y - 10); } } });
      for (let i = 0; i < count; i++) { stair.shown = i + 1; const x = x0 + (x1 - x0) * i / (count - 1); ring(x, ground - rise * (i + 1), accent, 6, 46, .3, .3, 3); ghost(A); yield to(A, { x, y: rise * (i + 1) + 4 }, .13, easeOut); yield .04; }
      glint(A); to(A, { rot: -d * .12 }, .15);
      for (let i = 0; i < 8; i++) {
        const final = i === 7, x = D.x + (final ? 0 : (random() - .5) * 220);
        fly('star5', [x - d * 200, -40], [x, final ? chest(D) : ground - random() * tall * .5], { life: .3, size: final ? 84 : 26 + random() * 16, spin: 7, ease: easeIn, color, accent });
        if (!final) after(.3, () => { ring(x, ground, accent, 8, 60, .3, .24, 3); if (Math.abs(x - D.x) < 70) tap(A, D, 'star'); cam.shake = 6; });
        yield final ? .3 : .11;
      }
      pillar(D.x, color); cam.flash = .95; impact(A, D, beat, 1.8, 'star'); yield .3; to(A, { rot: 0 }, .1);
    },
    /** 星舰领航员：星图锁定目标，轨道上一轮齐射。 */
    *orbital(A, D, beat) {
      const { color, accent } = A.theme, x = D.x;
      yield* stance(A, 'float', .22); glint(A); sigil('stars', x, 1.7, A, {}, 1.2); sigil('grid', x, 1.1, A, {}, 1.3); yield .9;
      for (let i = 0; i < 5; i++) { beam(x + (i - 2) * 190, -40, x + (i - 2) * 12, ground - tall * .3, i % 2 ? accent : color, .26, 13); yield .06; tap(A, D); cam.shake = 9; ring(x + (i - 2) * 12, ground, accent, 8, 70, .3, .24, 3); yield .08; }
      beam(x, -40, x, ground, '#ffffff', .5, 46); pillar(x, color, 200); yield .1; cam.flash = .95; impact(A, D, beat, 1.8); yield .3;
    },
    /** 牧羊驼的姑娘：一群羊驼从身后冲出来，踩过去。 */
    *stampede(A, D, beat) {
      const d = A.face, { color, accent } = A.theme, x0 = d > 0 ? -140 : VW + 140, x1 = d > 0 ? VW + 140 : -140, pass = (D.x - x0) / (x1 - x0);
      yield* stance(A, 'throw', .26); glint(A); cam.shake = 4;
      for (let i = 0; i < 6; i++) { const life = .8 + (i % 3) * .08; runner('llama', x0, x1, life, { direction: d, size: 96 + (i * 29 % 40), lane: (i % 3 - 1) * 14, color, accent, under: i % 3 === 0 }); after(life * pass, () => { tap(A, D); cam.shake = 9; dust(D.x, d); }); yield .13; }
      yield .8 * pass - .1; cam.flash = .85; impact(A, D, beat, 1.8); arc(D, 'y', tall * (D.out ? .2 : .3), D.out ? .3 : .4); yield .5;
    },
    /** 风之精灵：一道龙卷把对手卷到半空转几圈，再摔下来。 */
    *gale(A, D, beat) {
      const d = A.face, { color, accent } = A.theme, x = D.x;
      yield* stance(A, 'float', .22); glint(A); sigil('tornado', x, 1.5, A, {}, 1.5);
      for (let i = 0; i < 7; i++) fly('gust', [x - d * (260 + i * 30), ground - tall * (.2 + (i % 4) * .22)], [x + d * 200, ground - tall * (.3 + (i * 3 % 4) * .2)], { life: .5 + i * .12, size: 50, path: 'wave', wobble: 40, color, accent, tail: false });
      yield .3; D.pivot = .5; to(D, { y: tall * .3 }, .5, easeOut); to(D, { rot: d * TAU * 2 }, 1.05, linear);
      for (let i = 0; i < 5; i++) { yield .17; D.flash = .5; sparks(x, ground - D.y - tall * .5, accent, 6, .7); cam.shake = 7; }
      yield .22; D.rot = 0; D.pivot = 0; yield to(D, { y: 0 }, .12, easeIn);
      ring(x, ground, accent, 30, 300, .6, .22, 9); dust(x - 60, -1); dust(x + 60, 1); cam.flash = .9; impact(A, D, beat, 1.8); yield .35;
    },
    /** 制图师：地图铺满地面，沿着路线找到对手，落下一枚大图钉。 */
    *atlas(A, D, beat) {
      const d = A.face, { color, accent } = A.theme, x = D.x, pin = { y: -150 };
      yield* stance(A, 'cast', .24); glint(A);
      effect({ life: 2.3, under: true, draw: (item, k) => {
        const open = easeOut(Math.min(1, k * 2.5)); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = .5 * (k > .85 ? (1 - k) / .15 : 1);
        for (let i = -9; i <= 9; i++) { ctx.beginPath(); ctx.moveTo(VW / 2 + i * 40 * open, ground - 24); ctx.lineTo(VW / 2 + i * 120 * open, VH); ctx.stroke(); }
        for (let i = 0; i < 5; i++) { const y = ground - 24 + (VH - ground + 24) * (i / 4) ** 1.5; ctx.beginPath(); ctx.moveTo(VW / 2 - VW * .6 * open, y); ctx.lineTo(VW / 2 + VW * .6 * open, y); ctx.stroke(); }
      } });
      yield .45; traveler('route', { x0: A.x + d * A.wide * .3, x1: x, direction: d, life: .7, attacker: A }); sigil('grid', x, 1.2, A, {}, 1.2);
      for (let i = 0; i < 3; i++) { yield .22; fly('needle', prop(A), [x - d * 10, chest(D) + (i - 1) * 30], { life: .2, size: 40, color, accent }); after(.2, () => { tap(A, D); cam.shake = 7; }); }
      yield .3;
      effect({ life: .9, draw: (item, k) => { ctx.globalAlpha = k > .75 ? (1 - k) / .25 : 1; ctx.translate(x, pin.y); battleShapes.pin(ctx, 170, item.time, color, accent); } });
      yield to(pin, { y: chest(D) - 60 }, .14, easeIn);
      ring(x, ground, accent, 30, 300, .6, .22, 9); ring(x, ground, color, 16, 200, .5, .22, 5); dust(x - 60, -1); dust(x + 60, 1); cam.flash = .9; impact(A, D, beat, 1.8); yield .4;
    },
    /** 没登记打法的角色：一道横贯的刀光穿过对手，人到了身后，随后五道交叉斩同时炸开。 */
    *generic(A, D, beat) {
      const d = A.face, { color, accent } = A.theme;
      yield to(A, { sx: 1.1, sy: .88 }, .14); spawn(trail(A, .2));
      const through = clamp(D.x + d * reach * 1.25, A.wide * .4, VW - A.wide * .4);
      beam(A.x, chest(D), through, chest(D), color, .3, 9);
      yield to(A, { x: through, sx: .9, sy: 1.04 }, .1, easeIn); A.face = -d; to(A, { sx: 1, sy: 1 }, .1); yield .22;
      for (let cut = 0; cut < 5; cut++) { slash(D.x + (random() - .5) * 50, chest(D) + (random() - .5) * 90, cut * 1.26 + .3, tall * .8, cut % 2 ? accent : color, .3); flinch(D, cut % 2 ? 1 : -1); cam.shake = 7; yield .07; }
      cam.flash = .85; impact(A, D, beat, 1.6); yield .3;
    },
  };
  /** 必杀：压暗画面、拉出特写和招式名，再放这位角色自己的大招，放完回原位。 */
  function* ultimate(attacker, defender, beat, spec) {
    to(cam, { bars: 1, dim: .55 }, .22); cutIn = { fighter: attacker, title: spec.name, time: 0, life: 1.05 }; attacker.glow = 1;
    yield 1.05; cutIn = null; to(cam, { dim: .3 }, .2);
    yield* (ults[spec.form] ?? ults.generic)(attacker, defender, beat);
    attacker.glow = 0; to(cam, { bars: 0, dim: 0 }, .3); yield .3;
    if (Math.abs(attacker.x - attacker.home) > 60 || attacker.y > tall * .25) spawn(trail(attacker, .22));
    yield* settle(attacker, .3); attacker.face = facing(attacker);
  }

  // ---- 一场的流程 ----
  /** 躺倒的姿态：向后倒，头朝场外；脚的位置往里收，整个人留在画面里，身体贴着地面。 */
  const lying = fighter => { const direction = -facing(fighter); return { rot: direction * 1.45, y: fighter.wide * .27, x: direction > 0 ? Math.min(fighter.home + 150, VW - tall - 16) : Math.max(fighter.home - 150, tall + 16) }; };
  /** 击倒：慢动作里被打飞、落地弹一下、躺倒褪色。 */
  function* knockout(fighter) {
    const direction = -facing(fighter), rest = lying(fighter); slow = .9;
    to(fighter, { rot: direction * 1.1, x: rest.x }, .5, easeOut); yield to(fighter, { y: tall * .5 }, .25, easeOut);
    yield to(fighter, { y: rest.y }, .25, easeIn);
    dust(fighter.x + direction * tall * .5, direction); cam.shake = 10;
    to(fighter, { rot: rest.rot }, .2); yield to(fighter, { y: rest.y + tall * .07 }, .1, easeOut); yield to(fighter, { y: rest.y }, .12, easeIn);
    dust(fighter.x + direction * tall * .7, direction); yield to(fighter, { gray: 1 }, .35);
  }
  function* intro() {
    F.forEach(fighter => { fighter.x = fighter.home - fighter.face * VW * .5; fighter.alpha = 1; });
    yield .15;
    for (const fighter of F) { spawn(trail(fighter, .3)); to(fighter, { x: fighter.home }, .34, easeOut); yield .16; }
    yield .3; F.forEach(fighter => { dust(fighter.x, -fighter.face); to(fighter, { sx: 1.06, sy: .94 }, .08); glint(fighter); }); cam.shake = 5;
    yield .1; F.forEach(fighter => to(fighter, { sx: 1, sy: 1 }, .16)); yield .3;
  }
  /** 每回合开头各自挪两步：站位每回合都不一样。 */
  function footwork() { F.forEach(fighter => { if (fighter.out) return; fighter.shift = (random() - .5) * 60; fighter.home = fighter.base + fighter.shift; arc(fighter, 'y', tall * .05, .28); to(fighter, { x: fighter.home }, .28, easeInOut); }); }
  /** 对拼：两边同时冲到中间撞在一起，僵持一下再各自弹开，谁也没伤着谁。 */
  function* clash() {
    const mid = VW / 2, y = ground - tall * .5;
    F.forEach(fighter => { spawn(trail(fighter, .2)); to(fighter, { sx: .92, sy: 1.05, rot: fighter.face * .12 }, .1); to(fighter, { x: mid - fighter.face * reach * .55 }, .18, easeIn); });
    yield .18; freeze = .08; cam.shake = 12; cam.flash = .35;
    ring(mid, y, '#ffffff', 20, 170, .45); sparks(mid, y, F[0].theme.color, 14, 1.1); sparks(mid, y, F[1].theme.color, 14, 1.1); floating(mid, ground - tall * .98, text.clash, '#fde68a', 24);
    for (let i = 0; i < 3; i++) { F.forEach(fighter => to(fighter, { x: mid - fighter.face * (reach * .55 + (i % 2 ? 8 : -4)) }, .06)); sparks(mid, y + (random() - .5) * 60, '#ffffff', 5, .7); cam.shake = 6; yield .09; }
    F.forEach(fighter => { arc(fighter, 'y', tall * .14, .32); to(fighter, { rot: 0, sx: 1, sy: 1 }, .2); to(fighter, { x: fighter.home }, .34, easeOut); });
    yield .36; F.forEach(fighter => dust(fighter.x, fighter.face)); yield .2;
  }
  /** 一次出手：按这位角色的打法取招式，头顶报一下招式名。 */
  function* perform(beat) {
    const attacker = F[beat.attacker], defender = F[1 - beat.attacker], kit = attacker.theme, final = beat.move === 'ultimate' && kit.ultimate, spec = final ? kit.ultimate : kit.moves?.[(Number(beat.move) || 0) % kit.moves.length] ?? {};
    defender.dodged = false; dodging = beat.dodge ? defender : null; beat.label = spec.name ?? null;
    if (final) yield* ultimate(attacker, defender, beat, spec);
    else { if (spec.name) floating(attacker.x, ground - tall * 1.08, `「${spec.name}」`, attacker.theme.accent, 23); yield* (forms[spec.form] ?? forms.strike)(attacker, defender, beat, spec); }
    dodging = null;
  }
  function* finish(beat) {
    if (beat.winner === null) { F.forEach(fighter => to(fighter, { sy: .9, sx: 1.05, rot: -fighter.face * .12 }, .5)); verdict = { label: text.tie, time: 0 }; yield .9; }
    else {
      const winner = F[beat.winner], loser = F[1 - beat.winner];
      yield* knockout(loser); verdict = { label: text.ko, time: 0, color: winner.theme.color }; cam.flash = .5;
      yield .5; winner.glow = 1;
      for (let hop = 0; hop < 2; hop++) { arc(winner, 'y', tall * .13, .34); sparks(winner.x, ground - tall * 1.02, winner.theme.accent, 12, .7); yield .4; }
      effect({ life: 2.2, draw: (item, k) => { ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 26; i++) { const x = (i * 97.3 + item.time * 40) % VW, y = (i * 53.7 + item.time * (60 + i * 3)) % (ground + 40) - 20; ctx.globalAlpha = .7 * (1 - k); ctx.fillStyle = i % 2 ? winner.theme.color : winner.theme.accent; ctx.fillRect(x, y, 4, 9); } } });
      yield .5;
    }
    ended();
  }
  function* main() {
    yield* intro();
    for (const beat of plan) {
      if (beat.type === 'round') { banner = { label: `${text.round.replace('{n}', beat.index + 1)} · ${beat.name}`, time: 0, life: 1 }; onRound({ index: beat.index, name: beat.name }); if (beat.index) footwork(); yield .6; }
      else if (beat.type === 'clash') yield* clash();
      else if (beat.type === 'move') { yield* perform(beat); yield .06 + random() * .2; }
      else yield* finish(beat);
    }
  }
  const moveBeats = () => plan.filter(beat => beat.type === 'move');
  function ended() { if (done) return; done = true; onDone({ winner: plan.at(-1)?.winner ?? null, events: moveBeats().map(beat => ({ round: beat.round, name: beat.roundName, attacker: beat.attacker, damage: beat.damage, hp: [...beat.hp] })) }); }
  const rehearse = () => { plan = arrange(script, { kits: F.map(fighter => fighter.theme), random }) ?? []; };

  // ---- 绘制 ----
  function sprite(fighter, source, pose = fighter) {
    // pivot 是转动的支点：0 在脚下，.5 在身体中间（被卷到空中打转时用）。
    const pivot = pose.pivot ?? 0;
    ctx.save(); ctx.translate(pose.x, ground - pose.y - tall * pivot); ctx.rotate(pose.rot); ctx.scale(fighter.face * pose.sx, pose.sy);
    ctx.drawImage(source, -fighter.wide / 2, -tall * (1 - pivot), fighter.wide, tall); ctx.restore();
  }
  function drawFighter(fighter) {
    // 影子跟着身体走：人倒下时影子移到身体下面并拉长。
    const lift = clamp(fighter.y / tall, 0, 1), lean = Math.sin(fighter.rot);
    ctx.save(); ctx.globalAlpha = .34 * (1 - lift * .7); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(fighter.x + lean * tall * .45, ground + 4, (fighter.wide * .36 + Math.abs(lean) * tall * .28) * (1 - lift * .4), 9 * (1 - lift * .4), 0, 0, TAU); ctx.fill(); ctx.restore();
    if (!fighter.image) return;
    if (fighter.glow > 0) { ctx.save(); glowDot(fighter.x, ground - tall * .5, tall * .62, fighter.theme.color, .32 * fighter.glow); ctx.restore(); }
    // 站着的时候有一点呼吸起伏，不像一张贴纸。
    const breath = fighter.out || fighter.gray ? 0 : Math.sin(stageTime * 2.4 + fighter.index * 1.7) * .008, pose = breath ? { x: fighter.x, y: fighter.y, rot: fighter.rot, pivot: fighter.pivot, sx: fighter.sx * (1 - breath * .5), sy: fighter.sy * (1 + breath) } : fighter;
    ctx.save(); ctx.globalAlpha = fighter.alpha;
    if (fighter.gray > 0 && 'filter' in ctx) ctx.filter = `grayscale(${fighter.gray}) brightness(${1 - fighter.gray * .4})`;
    else if (fighter.gray > 0) ctx.globalAlpha = fighter.alpha * (1 - fighter.gray * .35);
    sprite(fighter, fighter.image, pose); ctx.restore();
    if (fighter.flash > 0) { const white = tinted(fighter, '#ffffff'); if (white) { ctx.save(); ctx.globalAlpha = Math.min(1, fighter.flash); sprite(fighter, white, pose); ctx.restore(); } }
  }
  function drawBackdrop() {
    if (!backdrop) {
      // 舞台背景只画一次存成底图：夜空渐变、两侧各一束角色色的光、地面透视线和星点。
      try {
        backdrop = offscreen(); backdrop.width = Math.max(1, Math.round(VW)); backdrop.height = VH;
        const pen = backdrop.getContext('2d'), sky = pen.createLinearGradient(0, 0, 0, VH);
        sky.addColorStop(0, '#11131c'); sky.addColorStop(.62, '#1b2033'); sky.addColorStop(1, '#262c44'); pen.fillStyle = sky; pen.fillRect(0, 0, VW, VH);
        F.forEach(fighter => { const light = pen.createRadialGradient(fighter.base, ground - tall * .5, 10, fighter.base, ground - tall * .5, tall * 1.05); light.addColorStop(0, fighter.theme.color); light.addColorStop(1, 'rgba(0,0,0,0)'); pen.globalAlpha = .2; pen.fillStyle = light; pen.fillRect(0, 0, VW, VH); });
        pen.globalAlpha = 1; const stars = seeded(7);
        for (let i = 0; i < 70; i++) { pen.globalAlpha = .15 + stars() * .5; pen.fillStyle = '#fff'; pen.fillRect(stars() * VW, stars() * ground * .7, 1.5, 1.5); }
        pen.globalAlpha = 1; const floor = pen.createLinearGradient(0, ground - 30, 0, VH); floor.addColorStop(0, 'rgba(255,255,255,.02)'); floor.addColorStop(1, 'rgba(255,255,255,.1)'); pen.fillStyle = floor; pen.fillRect(0, ground - 30, VW, VH - ground + 30);
        pen.strokeStyle = 'rgba(255,255,255,.08)'; pen.lineWidth = 1;
        for (let i = -12; i <= 12; i++) { pen.beginPath(); pen.moveTo(VW / 2 + i * 34, ground - 30); pen.lineTo(VW / 2 + i * 120, VH); pen.stroke(); }
        for (let i = 0; i < 4; i++) { const y = ground - 30 + (VH - ground + 30) * (i / 4) ** 1.6; pen.beginPath(); pen.moveTo(0, y); pen.lineTo(VW, y); pen.stroke(); }
      } catch { backdrop = false; }
    }
    // 底图四周多画一圈，震屏时边上不露底。
    if (backdrop) ctx.drawImage(backdrop, -36, -36, VW + 72, VH + 72); else { ctx.fillStyle = '#171a22'; ctx.fillRect(-36, -36, VW + 72, VH + 72); }
  }
  function drawCutIn(dt) {
    const item = cutIn; item.time += dt;
    const k = item.time / item.life, fighter = item.fighter, direction = fighter.face, slide = k < .18 ? easeOut(k / .18) : k > .86 ? 1 + easeIn((k - .86) / .14) * .6 : 1 + (k - .18) * .05;
    const top = VH * .2, height = VH * .36, image = fighter.image;
    ctx.save(); ctx.globalAlpha = k > .86 ? 1 - (k - .86) / .14 : 1;
    ctx.beginPath(); ctx.moveTo(0, top + 26); ctx.lineTo(VW, top); ctx.lineTo(VW, top + height - 26); ctx.lineTo(0, top + height); ctx.closePath(); ctx.clip();
    const band = ctx.createLinearGradient(0, top, 0, top + height); band.addColorStop(0, '#0b0d14'); band.addColorStop(.5, fighter.theme.color); band.addColorStop(1, '#0b0d14'); ctx.fillStyle = band; ctx.fillRect(0, top, VW, height);
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const y = top + (i * 37 % height), x = ((i * 173 + item.time * 1500 * direction) % (VW + 300) + VW + 300) % (VW + 300) - 150; ctx.globalAlpha = .25 + (i % 3) * .2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 120 + i * 9, y); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = k > .86 ? 1 - (k - .86) / .14 : 1;
    if (image) {
      // 特写取立绘上半身，从出招一方那侧滑进来。
      const width = image.naturalWidth || image.width, tallSource = (image.naturalHeight || image.height) * .4, drawHeight = height * 1.5, drawWidth = drawHeight * width / tallSource;
      const x = direction > 0 ? -drawWidth + slide * (drawWidth + VW * .1) : VW - slide * (drawWidth + VW * .1);
      ctx.save(); ctx.translate(x + drawWidth / 2, top + height / 2); ctx.scale(direction, 1); ctx.drawImage(image, 0, (image.naturalHeight || image.height) * .02, width, tallSource, -drawWidth / 2, -drawHeight / 2 + height * .12, drawWidth, drawHeight); ctx.restore();
    }
    const textX = direction > 0 ? VW * .64 : VW * .36, pop = k < .3 ? easeOut(k / .3) : 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 ${15}px system-ui, "Microsoft YaHei", sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(`${text.skill} · ${fighter.theme.job ? `${fighter.theme.job} ` : ''}${fighter.name}`, textX, top + height * .28);
    ctx.font = `700 ${56 * (.7 + .3 * pop)}px ${serif}`; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(11,13,20,.9)'; ctx.strokeText(item.title, textX, top + height * .58); ctx.fillStyle = '#fff'; ctx.fillText(item.title, textX, top + height * .58);
    ctx.restore();
  }
  function draw(dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    const offset = (canvas.width / scale - VW) / 2, shakeX = (random() - .5) * 2 * cam.shake, shakeY = (random() - .5) * 2 * cam.shake;
    ctx.setTransform(scale, 0, 0, scale, (offset + shakeX) * scale, shakeY * scale);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; drawBackdrop();
    if (cam.dim > 0) { ctx.fillStyle = `rgba(6,8,14,${cam.dim})`; ctx.fillRect(-40, -40, VW + 80, VH + 80); }
    const layer = under => effects.forEach(item => { if (!!item.under !== under) return; ctx.save(); item.draw(item, Math.min(1, item.time / item.life)); ctx.restore(); });
    layer(true);
    // 出手的一方画在上面：谁离中线近谁在前。
    [...F].sort((a, b) => Math.abs(b.x - b.home) - Math.abs(a.x - a.home)).reverse().forEach(drawFighter);
    layer(false);
    if (cutIn) drawCutIn(dt);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (cam.bars > 0) { ctx.fillStyle = '#05060a'; ctx.fillRect(-40, -40, VW + 80, 40 + VH * .09 * cam.bars); ctx.fillRect(-40, VH - VH * .09 * cam.bars, VW + 80, VH * .09 * cam.bars + 40); }
    if (banner) {
      banner.time += dt; const k = banner.time / banner.life;
      if (k >= 1) banner = null; else { const alpha = k < .15 ? k / .15 : k > .75 ? 1 - (k - .75) / .25 : 1, width = 250;
        ctx.globalAlpha = alpha; ctx.fillStyle = 'rgba(11,13,20,.72)'; ctx.beginPath(); ctx.roundRect?.(VW / 2 - width / 2, VH * .2 - 20 + (1 - easeOut(Math.min(1, k / .15))) * -12, width, 40, 20); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '600 17px system-ui, "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(banner.label, VW / 2, VH * .2); }
    }
    if (verdict) {
      verdict.time += dt; const pop = easeOut(Math.min(1, verdict.time / .35));
      ctx.globalAlpha = Math.min(1, verdict.time / .2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${96 * (1.5 - .5 * pop)}px system-ui, "Microsoft YaHei", sans-serif`;
      ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(11,13,20,.85)'; ctx.strokeText(verdict.label, VW / 2, VH * .36); ctx.fillStyle = verdict.color ?? '#fde68a'; ctx.fillText(verdict.label, VW / 2, VH * .36);
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.strokeText(verdict.label, VW / 2, VH * .36);
    }
    if (cam.flash > 0) { ctx.globalAlpha = Math.min(1, cam.flash); ctx.fillStyle = '#fff'; ctx.fillRect(-40, -40, VW + 80, VH + 80); }
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    if (!running) return;
    const real = last === null ? 0 : clamp((now - last) / 1000, 0, .05); last = now;
    let dt = real * speed;
    if (freeze > 0) { freeze -= real; dt = 0; }
    if (slow > 0) { slow -= real; dt *= .35; }
    if (dt > 0) advance(dt);
    draw(dt || real * .001);
    // 收场后特效放完就停表，画面停在最后一帧。
    if (done && !tasks.length && !anims.length && !effects.length) { running = false; frame = null; return; }
    frame = ticker.request(tick);
  }
  /** 清掉进行中的一切，双方回到开场站姿。 */
  function resetPose() {
    anims.length = 0; tasks.length = 0; effects.length = 0; banner = null; cutIn = null; verdict = null; freeze = 0; slow = 0; dodging = null;
    Object.assign(cam, { shake: 0, flash: 0, bars: 0, dim: 0 });
    F.forEach(fighter => { Object.assign(fighter, { shift: 0, home: fighter.base, x: fighter.base, y: 0, rot: 0, sx: 1, sy: 1, pivot: 0, alpha: 1, flash: 0, glow: 0, gray: 0, out: false, dodged: false, face: facing(fighter) }); });
  }
  /** 直接摆成收场姿态：胜者站立发光，败者躺倒。 */
  function finalPose() {
    const end = plan.at(-1);
    resetPose();
    if (!end) return;
    if (end.winner === null) verdict = { label: text.tie, time: 9 };
    else { const loser = F[1 - end.winner]; Object.assign(loser, lying(loser), { gray: 1 }); F[end.winner].glow = 1; verdict = { label: text.ko, time: 9, color: F[end.winner].theme.color }; }
  }
  const stopClock = () => { running = false; if (frame !== null) ticker.cancel(frame); frame = null; last = null; };

  layout();
  return {
    /** 这一场排好的节拍；还没开演时是空的。 */
    get plan() { return plan; },
    play() {
      stopClock(); done = false; reported = 0; resetPose(); rehearse();
      if (!plan.length) { draw(0); return; }
      tasks.push({ generator: main(), wait: 0 }); running = true; frame = ticker.request(tick);
    },
    /** 跳到结果：没报过的出手按顺序补报体力，再画收场。还没开演就先排一场。 */
    skip() {
      stopClock();
      if (!plan.length) rehearse();
      const moves = moveBeats(); moves.slice(reported).forEach(beat => onHit(hitOf(beat)));
      reported = moves.length; finalPose(); draw(0); if (plan.length) ended();
    },
    /** 停在开场站姿，不报结果。 */
    stop() { stopClock(); resetPose(); draw(0); },
    resize() { layout(); if (!running) draw(0); },
    setSpeed(value) { speed = clamp(Number(value) || 1, .25, 4); },
    destroy() { stopClock(); anims.length = 0; tasks.length = 0; effects.length = 0; },
  };
}
