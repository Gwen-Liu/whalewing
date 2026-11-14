import test from 'node:test';
import assert from 'node:assert/strict';
import { battlePlan, battleShapes, createBattle } from '../src/model-world-battle.js';
import { battleKit, battleKits } from '../src/model-world-battle-kits.js';
import { worldPersonas } from '../src/model-world-persona.js';
import { worldDuelScript } from '../src/model-world-view.js';
import { modelWorldPortraitIds } from '../src/model-world-roster.js';

const rated = (id, overall) => ({ id, name: id, vendorId: 'openai', rating: { overall, composite: overall } });
// 假画布：任何绘图调用都接住，渐变之类返回一个同样什么都接得住的对象。
const sink = () => new Proxy(() => {}, { get: () => sink(), apply: () => sink(), set: () => true });
const pen = () => new Proxy({}, { get: (target, key) => key in target ? target[key] : sink(), set: (target, key, value) => { target[key] = value; return true; }, has: () => true });
const canvas = () => ({ width: 960, height: 540, clientWidth: 960, clientHeight: 540, getContext: () => pen() });
const image = { naturalWidth: 288, naturalHeight: 512 };
// 固定的随机数：同一个种子每次给出同一串。
const dice = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function stage(script, { ids = ['openai', 'meituan'], seed = 7, arrange } = {}) {
  let next = null, time = 0;
  const hits = [], rounds = [], done = [];
  const battle = createBattle(canvas(), { script, fighters: ids.map((id, index) => ({ image, theme: battleKit(id), name: index ? '右' : '左' })), createCanvas: canvas, seed, ...(arrange ? { arrange } : {}),
    clock: { request: callback => { next = callback; return 1; }, cancel: () => { next = null; } }, onHit: hit => hits.push(hit), onRound: round => rounds.push(round), onDone: result => done.push(result) });
  const run = (until = 90000) => { const stop = time + until; let frames = 0; while (next && time < stop && frames < 20000) { const callback = next; next = null; time += 16.7; callback(time); frames++; } return frames; };
  return { battle, hits, rounds, done, run, get waiting() { return next !== null; }, get time() { return time; } };
}
const movesOf = plan => plan.filter(beat => beat.type === 'move');
const total = (moves, side) => moves.filter(beat => beat.attacker === side).reduce((sum, beat) => sum + beat.damage, 0);

test('每个立绘都有自己的打法：职业、手里的东西、道具位置、三招平常招式和一个必杀，名字和必杀的演法都不重样；没登记的角色用通用的一套', () => {
  const forms = ['volley', 'strike', 'ray', 'surge', 'fall', 'seal', 'pet', 'steps'];
  for (const id of modelWorldPortraitIds) {
    const kit = battleKits[id]; assert.ok(kit, id);
    assert.ok(kit.job.length >= 2 && kit.weapon.length >= 2, id); assert.match(kit.color, /^#[0-9a-f]{6}$/); assert.match(kit.accent, /^#[0-9a-f]{6}$/);
    for (const point of [kit.prop, kit.alt]) assert.ok(point.length === 2 && point.every(value => value >= 0 && value <= 1), `${id} 的道具位置按立绘的几成算`);
    assert.equal(kit.moves.length, 3, id);
    for (const move of kit.moves) { assert.ok(move.name.length >= 2 && forms.includes(move.form), `${id} ${move.name}`); for (const key of ['shape', 'burst']) if (move[key]) assert.ok(battleShapes[move[key]], `${id} ${move.name} 用到的画法 ${move[key]}`); }
    assert.ok(new Set(kit.moves.map(move => move.form + JSON.stringify(move))).size === 3, `${id} 三招各不相同`);
    assert.ok(kit.ultimate.name.length >= 2 && kit.ultimate.form, id); assert.equal(kit.skill, kit.ultimate.name);
    // 档案和打法说的是同一个人：档案的标签里写着她手里的东西，打法里的武器提到同一样东西。
    assert.ok(worldPersonas[id].tags.some(tag => [...tag].filter(char => kit.weapon.includes(char)).length >= 2), `${id} 档案 ${worldPersonas[id].tags} 对不上武器 ${kit.weapon}`);
  }
  const kits = modelWorldPortraitIds.map(id => battleKits[id]);
  assert.equal(new Set(kits.map(kit => kit.ultimate.name)).size, kits.length, '必杀名不重样'); assert.equal(new Set(kits.map(kit => kit.ultimate.form)).size, kits.length, '必杀各演各的');
  assert.equal(new Set(kits.flatMap(kit => kit.moves.map(move => move.name))).size, kits.length * 3, '招式名不重样');
  assert.equal(new Set(kits.map(kit => kit.job)).size, kits.length, '职业不重样');
  assert.equal(battleKit('constructor').skill, '全力一击', '不从原型上取'); assert.equal(battleKit('constructor').moves.length, 3);
  assert.ok(Object.isFrozen(battleKits.openai) && Object.isFrozen(battleKits.openai.moves[0]));
});

test('排一场：结果照剧本（双方全场伤害、最后体力、谁倒下），过程现排；胜方用必杀收尾并击倒，伤害不超过 6 演成格挡', () => {
  const script = worldDuelScript([rated('a', 58), rated('b', 53)]), kits = [battleKit('baidu'), battleKit('meta')];
  for (let seed = 1; seed <= 40; seed++) {
    const plan = battlePlan(script, { kits, random: dice(seed) }), moves = movesOf(plan);
    assert.deepEqual(plan.filter(beat => beat.type === 'round').map(beat => beat.name), ['试探', '交锋', '强攻', '决胜']); assert.deepEqual(plan.at(-1), { type: 'end', winner: 0 });
    assert.equal(moves.length, 8, '每回合双方各出手一次'); assert.deepEqual(moves.map(beat => beat.roundName), ['试探', '试探', '交锋', '交锋', '强攻', '强攻', '决胜', '决胜']);
    for (const side of [0, 1]) assert.equal(total(moves, side), script.events.filter(event => event.attacker === side).reduce((sum, event) => sum + event.damage, 0), `种子 ${seed}：全场伤害不变`);
    assert.deepEqual(moves.at(-1).hp, script.hp, '最后体力照剧本'); assert.deepEqual(moves.map(beat => beat.ko), [false, false, false, false, false, false, false, true]);
    assert.deepEqual([moves.at(-1).attacker, moves.at(-1).move, moves.at(-2).attacker], [0, 'ultimate', 1], '最后一回合落后方先出手，胜方必杀收尾'); assert.ok(moves.at(-1).damage >= 16, '收尾的一击不轻');
    // 体力一路往下扣，每一击后的体力和伤害对得上；败方在最后一击之前都还站着。
    const hp = [100, 100]; for (const beat of moves) { hp[1 - beat.attacker] -= beat.damage; assert.deepEqual(beat.hp, hp); } assert.ok(moves.slice(0, -1).every(beat => beat.hp[0] > 0 && beat.hp[1] > 0));
    for (const beat of moves) {
      assert.equal(beat.dodge, beat.damage === 0, '被闪开的一击不掉体力'); assert.equal(beat.guard, beat.damage > 0 && beat.damage <= 6);
      assert.ok(beat.move === 'ultimate' ? beat.heavy && !beat.dodge : [0, 1, 2].includes(beat.move), '必杀只在最后一回合，也不会被闪开');
    }
    for (const side of [0, 1]) { const used = moves.filter(beat => beat.attacker === side && beat.move !== 'ultimate').slice(0, 3).map(beat => beat.move); assert.equal(new Set(used).size, used.length, '三招洗牌着用，头三次不重复'); assert.ok(moves.filter(beat => beat.attacker === side && beat.dodge).length <= 1, '每一方最多被闪开一次'); }
    assert.ok(plan.filter(beat => beat.type === 'clash').length <= 1);
  }
  const wide = movesOf(battlePlan(worldDuelScript([rated('a', 70), rated('b', 40)]), { random: dice(3) }));
  assert.ok(wide.some(beat => beat.guard) && wide.filter(beat => beat.guard).every(beat => beat.damage <= 6));
  const tie = battlePlan(worldDuelScript([rated('a', 50), rated('b', 50)]), { random: dice(5) });
  assert.deepEqual(tie.at(-1), { type: 'end', winner: null }); assert.deepEqual(movesOf(tie).at(-1).hp, [35, 35]); assert.ok(movesOf(tie).every(beat => !beat.ko));
  assert.deepEqual(battlePlan({ kind: 'unknown', events: [] }), []); assert.deepEqual(battlePlan(null), []);
});

test('同样两位每一场都不一样：招式顺序、先后手、每一击的轻重都会变，也会出现闪开、暴击和对拼；同一个种子排出来的是同一场', () => {
  const script = worldDuelScript([rated('a', 58), rated('b', 53)]), kits = [battleKit('openai'), battleKit('google')];
  const sign = plan => plan.map(beat => beat.type === 'move' ? `${beat.attacker}${beat.move}:${beat.damage}` : beat.type).join(' ');
  const plans = Array.from({ length: 60 }, (_, index) => battlePlan(script, { kits, random: dice(index + 1) }));
  assert.ok(new Set(plans.map(sign)).size >= 55, '六十场里几乎场场不同');
  assert.ok(new Set(plans.map(plan => movesOf(plan).map(beat => beat.attacker).join(''))).size >= 6, '先后手会变');
  assert.ok(new Set(plans.map(plan => movesOf(plan).map(beat => beat.move).join(''))).size >= 20, '出招顺序会变');
  for (const flag of ['dodge', 'crit']) assert.ok(plans.some(plan => movesOf(plan).some(beat => beat[flag])) && plans.some(plan => !movesOf(plan).some(beat => beat[flag])), `有的场次有${flag}，有的没有`);
  assert.ok(plans.some(plan => plan.some(beat => beat.type === 'clash')) && plans.some(plan => !plan.some(beat => beat.type === 'clash')), '对拼时有时无');
  assert.ok(plans.some(plan => movesOf(plan).filter(beat => beat.move === 'ultimate').length === 2), '落后的一方最后一回合有时也放必杀');
  assert.equal(sign(battlePlan(script, { kits, random: dice(9) })), sign(battlePlan(script, { kits, random: dice(9) })));
});

test('演出逐帧推进到收场：每一击报一次（谁打的、用哪招、打完的体力），最后报胜者和这一场实际打出来的每一击，演完自己停表', () => {
  const script = worldDuelScript([rated('a', 58), rated('b', 53)]), s = stage(script);
  s.battle.play(); const moves = movesOf(s.battle.plan); s.run();
  assert.deepEqual(s.hits.map(hit => [hit.attacker, hit.target, hit.damage, hit.hp, hit.dodge, hit.guard]), moves.map(beat => [beat.attacker, 1 - beat.attacker, beat.damage, beat.hp, beat.dodge, beat.guard]));
  const names = [0, 1].map(side => [...battleKit(side ? 'meituan' : 'openai').moves.map(move => move.name), battleKit(side ? 'meituan' : 'openai').skill]);
  assert.ok(s.hits.every(hit => names[hit.attacker].includes(hit.move)), '报的是这位角色自己的招式名'); assert.equal(s.hits.at(-1).move, '神谕降临');
  assert.deepEqual(s.rounds.map(round => round.name), ['试探', '交锋', '强攻', '决胜']);
  assert.equal(s.done.length, 1); assert.equal(s.done[0].winner, 0); assert.deepEqual(s.done[0].events.at(-1).hp, script.hp);
  assert.deepEqual(s.done[0].events, moves.map(beat => ({ round: beat.round, name: beat.roundName, attacker: beat.attacker, damage: beat.damage, hp: beat.hp })));
  assert.equal(s.waiting, false, '收场特效放完不再要下一帧'); assert.ok(s.time > 15000 && s.time < 40000, `一场大约二十多秒，实际 ${Math.round(s.time / 1000)} 秒`);
});

test('每位角色的每一招都能演完：打中、被格挡、被闪开各报一次，必杀也是', () => {
  for (const id of [...modelWorldPortraitIds, 'nobody']) for (const side of [0, 1]) for (const [variant, move] of [['hit', 0], ['hit', 1], ['hit', 2], ['hit', 'ultimate'], ['dodge', 0], ['dodge', 1], ['dodge', 2], ['guard', 0], ['crit', 1]]) {
    const beat = { type: 'move', move, attacker: side, damage: variant === 'dodge' ? 0 : variant === 'guard' ? 5 : 20, hp: side ? [variant === 'dodge' ? 100 : 80, 100] : [100, variant === 'dodge' ? 100 : 80], guard: variant === 'guard', dodge: variant === 'dodge', crit: variant === 'crit', heavy: move === 'ultimate', ko: false, round: 'probe', roundName: '试探' };
    const s = stage({ kind: 'tie', events: [{}] }, { ids: side ? ['openai', id] : [id, 'openai'], arrange: () => [{ type: 'round', index: 0, name: '试探' }, beat, { type: 'end', winner: null }] });
    s.battle.play(); s.run();
    assert.deepEqual([s.hits.length, s.done.length, s.waiting], [1, 1, false], `${id} 第 ${move} 招（${variant}，${side ? '右' : '左'}）`);
    assert.deepEqual([s.hits[0].damage, s.hits[0].dodge, s.hits[0].guard], [beat.damage, beat.dodge, beat.guard]);
  }
});

test('跳到结果：没演到的出手补报，只报一次胜负；没开演就跳也先排一场；二倍速更快；重放重新排一场；销毁后不再推进', () => {
  const script = worldDuelScript([rated('a', 58), rated('b', 53)]), s = stage(script);
  s.battle.play(); s.run(6000); const seen = s.hits.length;
  assert.ok(seen >= 1 && seen < 8, `跑到一半只报了一部分，实际 ${seen}`); s.battle.skip();
  assert.equal(s.hits.length, 8); assert.deepEqual(s.hits.at(-1).hp, script.hp); assert.equal(s.done.length, 1); assert.equal(s.done[0].winner, 0); assert.equal(s.waiting, false);
  s.battle.skip(); assert.equal(s.done.length, 1, '已经收场再跳不重复报');
  const cold = stage(script); cold.battle.skip(); assert.equal(cold.hits.length, 8); assert.deepEqual(cold.hits.at(-1).hp, script.hp); assert.equal(cold.done[0].events.length, 8);
  const normal = stage(script), fast = stage(script); normal.battle.play(); normal.run(); fast.battle.setSpeed(2); fast.battle.play(); fast.run();
  assert.ok(fast.time < normal.time * .7, '二倍速明显更快');
  const first = JSON.stringify(s.done[0].events); s.battle.play(); s.run(); assert.equal(s.done.length, 2); assert.equal(s.hits.length, 16, '重放把八次出手再报一遍');
  assert.notEqual(JSON.stringify(s.done[1].events), first, '再来一次是重新排的一场'); assert.deepEqual(s.done[1].events.at(-1).hp, script.hp, '结果不变');
  const gone = stage(script); gone.battle.play(); gone.run(2000); gone.battle.destroy(); assert.equal(gone.waiting, false); assert.equal(gone.done.length, 0);
});

test('平局双方都不倒；没有可比分数时不演也不报结果', () => {
  const tie = stage(worldDuelScript([rated('a', 50), rated('b', 50)])); tie.battle.play(); tie.run();
  assert.equal(tie.done.length, 1); assert.equal(tie.done[0].winner, null); assert.deepEqual(tie.hits.at(-1).hp, [35, 35]);
  const none = stage(worldDuelScript([rated('a', null), rated('b', null)])); none.battle.play(); none.run();
  assert.deepEqual([none.hits.length, none.done.length, none.waiting], [0, 0, false]);
  none.battle.skip(); assert.deepEqual([none.hits.length, none.done.length], [0, 0]);
});
