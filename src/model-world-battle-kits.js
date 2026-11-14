/**
 * 模型世界对决里每位角色的打法：职业、手里的东西、三招平常招式和一个必杀。
 * 都按随包立绘画的是什么来写（scripts/art/design.json 里作者挑定的那一版），不沿用更早的设定。
 * prop / alt 是道具在立绘里的位置（横向、纵向各占图的几成，从左上角算），特效从那里出来。
 * 招式写成 [名字, 套路, 参数]：套路由 model-world-battle.js 演，参数决定飞出去的是什么、怎么飞、打中是什么样。
 */
const kits = {
  openai: { job: '神谕诗人', weapon: '白羽笔和神谕卷轴', color: '#10a37f', accent: '#d9fff2', prop: [.26, .13], alt: [.85, .27],
    moves: [['落羽', 'volley', { shape: 'feather', count: 3, size: 34, burst: 'feather' }], ['展卷', 'surge', { kind: 'ribbon', from: 'alt' }], ['谶言', 'seal', { mark: 'runes', glyphs: 'ΑΩΔΣΦΨ' }]],
    ultimate: ['神谕降临', 'oracle'] },
  anthropic: { job: '提灯的引路人', weapon: '黄铜提灯和一册书', color: '#d97757', accent: '#ffe2b8', prop: [.15, .31], alt: [.67, .25],
    moves: [['灯火', 'volley', { shape: 'flame', count: 3, path: 'home', life: .44, gap: .13, burst: 'flame' }], ['翻页', 'volley', { shape: 'page', count: 4, from: 'alt', path: 'wave', gap: .08, spin: 9, burst: 'page' }], ['照见', 'ray', { style: 'lamp' }]],
    ultimate: ['长夜引路', 'lantern'] },
  google: { job: '双子星偶像', weapon: '星星话筒', color: '#4285f4', accent: '#c9b8ff', prop: [.3, .13],
    moves: [['高音', 'volley', { shape: 'wave', count: 3, pose: 'sing', size: 40, grow: 2, gap: .12, burst: 'star' }], ['星屑', 'fall', { shape: 'star', count: 4, burst: 'star' }], ['回旋舞步', 'strike', { trail: 'star', hits: 3, spin: true, burst: 'star' }]],
    ultimate: ['双子星合唱', 'twin'] },
  deepseek: { job: '海洋歌姬', weapon: '深海蓝珍珠', color: '#4d6bfe', accent: '#a8dcff', prop: [.46, .33],
    moves: [['涌浪', 'surge', { kind: 'wave', lift: true, burst: 'bubble' }], ['泡沫', 'volley', { shape: 'bubble', count: 5, path: 'wave', life: .5, gap: .07, size: 24, burst: 'bubble' }], ['珠光', 'ray', { style: 'plain' }]],
    ultimate: ['鲸落潮生', 'whale'] },
  'deepseek-flash': { job: '小飞鱼', weapon: '小蓝珍珠', color: '#58c4ff', accent: '#e8f8ff', prop: [.5, .36],
    moves: [['水珠连弹', 'volley', { shape: 'pearl', count: 6, gap: .06, life: .22, size: 15, burst: 'bubble' }], ['飞鱼跃', 'pet', { kind: 'fish', count: 2 }], ['扑通', 'strike', { trail: 'splash', hits: 2, leap: .3, burst: 'bubble' }]],
    ultimate: ['飞鱼群跃', 'school'] },
  alibaba: { job: '千问学者', weapon: '云纹光卷', color: '#615ced', accent: '#d6ccff', prop: [.76, .28],
    moves: [['发问', 'volley', { shape: 'glyph', glyphs: '问何？', count: 3, size: 34, gap: .13 }], ['祥云', 'surge', { kind: 'cloud' }], ['卷云锁', 'seal', { mark: 'scroll' }]],
    ultimate: ['千问千答', 'thousand'] },
  moonshotai: { job: '夜之钢琴家', weapon: '一叠乐谱', color: '#9aa8ff', accent: '#f4f6ff', prop: [.38, .33],
    moves: [['音符', 'volley', { shape: 'note', count: 4, path: 'wave', gap: .09, size: 30, burst: 'note' }], ['琴键', 'surge', { kind: 'keys', burst: 'note' }], ['休止', 'seal', { mark: 'staff', burst: 'note' }]],
    ultimate: ['月光奏鸣曲', 'moonlight'] },
  zhipuai: { job: '光谱法师', weapon: '浮空水晶', color: '#3859ff', accent: '#bfe9ff', prop: [.24, .12],
    moves: [['晶棱', 'volley', { shape: 'shard', count: 4, gap: .07, life: .24, size: 34, burst: 'shard' }], ['折射', 'ray', { style: 'prism' }], ['晶簇', 'surge', { kind: 'spikes', burst: 'shard' }]],
    ultimate: ['光谱裂变', 'spectrum'] },
  'bytedance-seed': { job: '包子铺掌柜', weapon: '一笼热包子', color: '#6f7bff', accent: '#a8f0c0', prop: [.64, .35],
    moves: [['热包子', 'volley', { shape: 'bun', count: 3, path: 'arc', pose: 'throw', life: .5, gap: .16, spin: 6, size: 30, burst: 'steam' }], ['蒸汽', 'surge', { kind: 'steam', burst: 'steam' }], ['笼盖飞盘', 'volley', { shape: 'lid', count: 1, pose: 'throw', size: 50, life: .3, power: 1.15, back: true }]],
    ultimate: ['满笼出锅', 'feast'] },
  minimax: { job: '海螺缪斯', weapon: '大海螺', color: '#ff6f91', accent: '#ffd9e2', prop: [.72, .24],
    moves: [['螺音', 'volley', { shape: 'wave', count: 4, pose: 'sing', size: 36, grow: 2.3, gap: .1, burst: 'note' }], ['珍珠', 'volley', { shape: 'pearl', count: 3, path: 'arc', life: .45, gap: .12, size: 20, burst: 'bubble' }], ['漩涡', 'seal', { mark: 'vortex', burst: 'bubble' }]],
    ultimate: ['海螺潮音', 'tide'] },
  tencent: { job: '混元仙子', weapon: '一团混元气', color: '#2a7bff', accent: '#cfe8ff', prop: [.23, .14],
    moves: [['推云掌', 'strike', { trail: 'palm', hits: 1, power: 1.1 }], ['气团', 'volley', { shape: 'orb', count: 1, size: 46, life: .5, path: 'home', power: 1.15 }], ['太极', 'seal', { mark: 'taiji' }]],
    ultimate: ['混元一气', 'hunyuan'] },
  baidu: { job: '书法家', weapon: '大毛笔', color: '#4f6bff', accent: '#dfe6ff', prop: [.29, .38],
    moves: [['横扫', 'strike', { trail: 'ink', hits: 2, burst: 'drop' }], ['泼墨', 'volley', { shape: 'drop', count: 3, path: 'arc', pose: 'throw', size: 24, life: .42, gap: .1, burst: 'drop' }], ['点睛', 'strike', { trail: 'ink', hits: 1, power: 1.15, thrust: true, burst: 'drop' }]],
    ultimate: ['一字千钧', 'word'] },
  xiaomi: { job: '米兔少女', weapon: '兔子玩偶', color: '#ff6900', accent: '#ffe1c2', prop: [.43, .23],
    moves: [['丢兔子', 'volley', { shape: 'bunny', count: 1, path: 'arc', pose: 'throw', size: 50, life: .5, spin: 5, power: 1.1, back: true }], ['胡萝卜', 'volley', { shape: 'carrot', count: 4, gap: .08, life: .26, size: 32 }], ['兔子蹬', 'strike', { trail: 'slash', hits: 1, leap: .38, power: 1.15 }]],
    ultimate: ['米兔出击', 'bunnies'] },
  meituan: { job: '猫系少女', weapon: '猫咪玩偶', color: '#ffc300', accent: '#b6f09c', prop: [.72, .3],
    moves: [['猫抓', 'strike', { trail: 'claw', hits: 3 }], ['毛线球', 'surge', { kind: 'yarn' }], ['猫扑', 'strike', { trail: 'claw', hits: 1, leap: .38, power: 1.15 }]],
    ultimate: ['大猫出掌', 'bigpaw'] },
  stepfun: { job: '登阶寻星人', weapon: '星星魔杖', color: '#6a6bff', accent: '#ffe58a', prop: [.18, .14],
    moves: [['流星', 'fall', { shape: 'star5', count: 3, burst: 'star' }], ['星弹', 'volley', { shape: 'star5', count: 3, spin: 8, size: 30, burst: 'star' }], ['登阶', 'steps', { burst: 'star' }]],
    ultimate: ['阶跃星河', 'stairway'] },
  xai: { job: '星舰领航员', weapon: '发光星图', color: '#c9d2e6', accent: '#ffffff', prop: [.21, .21],
    moves: [['标定', 'seal', { mark: 'stars' }], ['轨道炮', 'ray', { style: 'plain', sky: true }], ['星尘', 'volley', { shape: 'pearl', count: 6, gap: .05, life: .2, size: 16 }]],
    ultimate: ['轨道齐射', 'orbital'] },
  meta: { job: '牧羊驼的姑娘', weapon: '小羊驼', color: '#2f80ff', accent: '#fff2d6', prop: [.21, .77], alt: [.72, .45],
    moves: [['羊驼冲撞', 'pet', { kind: 'llama' }], ['口水弹', 'volley', { shape: 'spit', count: 2, path: 'arc', life: .4, gap: .14, size: 22, burst: 'bubble' }], ['套索', 'volley', { shape: 'loop', count: 1, from: 'alt', size: 60, spin: 7, life: .36, pull: true }]],
    ultimate: ['羊驼奔袭', 'stampede'] },
  mistral: { job: '风之精灵', weapon: '一条长纱巾', color: '#fa7a2f', accent: '#ffe2a8', prop: [.11, .29],
    moves: [['风刃', 'volley', { shape: 'gust', count: 3, gap: .09, life: .24, size: 44 }], ['纱缠', 'strike', { trail: 'ribbon', hits: 3 }], ['旋风', 'seal', { mark: 'tornado', lift: true }]],
    ultimate: ['密史脱拉', 'gale'] },
  perplexity: { job: '制图师', weapon: '一卷地图', color: '#20b8cd', accent: '#d5fbf6', prop: [.75, .17],
    moves: [['罗盘针', 'volley', { shape: 'needle', count: 3, gap: .08, life: .22, size: 38 }], ['经纬', 'seal', { mark: 'grid' }], ['引线', 'surge', { kind: 'route' }]],
    ultimate: ['按图索骥', 'atlas'] },
};

const frozen = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
const build = ([id, kit]) => [id, frozen({ ...kit, alt: kit.alt ?? kit.prop, skill: kit.ultimate[0], moves: kit.moves.map(([name, form, options]) => ({ name, form, ...options })), ultimate: { name: kit.ultimate[0], form: kit.ultimate[1] } })];

export const battleKits = Object.freeze(Object.fromEntries(Object.entries(kits).map(build)));
/** 没登记立绘的角色：一套不带道具的通用打法。 */
const fallbackKit = build(['', { job: '挑战者', weapon: '赤手空拳', color: '#8ea0ff', accent: '#ffffff', prop: [.5, .4],
  moves: [['突进', 'strike', { trail: 'slash', hits: 2 }], ['飞弹', 'volley', { shape: 'pearl', count: 1, size: 30, life: .28 }], ['下劈', 'strike', { trail: 'slash', hits: 1, leap: .38, power: 1.15 }]],
  ultimate: ['全力一击', 'generic'] }])[1];
export const battleKit = id => Object.hasOwn(battleKits, id) ? battleKits[id] : fallbackKit;
