/**
 * 模型测智：社区里流传最广的几道“一眼看出模型水平”的题。
 * 转发站可能认出原题、直接发一份提前写好的答案（“预制”），所以默认不发原题：每次出题都现换参数，
 * 画图和写代码的题另带一个本次随机口令和指定颜色，回答里没有就不是按这次的题现做的；
 * 文字题的数字每次不同，正确答案由这里现算，背下来的答案对不上。
 * 这个文件不依赖别的模块：Host 用它出题和判分，界面用它显示题目说明。
 */

export const probeTests = Object.freeze([
  { id: 'pelican', name: '鹈鹕骑车', skill: '画图', kind: 'svg', judge: 'eye', origin: 'Simon Willison 的“鹈鹕骑自行车”',
    intro: '只用 SVG 代码画一幅画。空间想象和写代码的功底，一眼就看得出来。', classic: 'Generate an SVG of a pelican riding a bicycle' },
  { id: 'hexball', name: '弹球', skill: '写代码', kind: 'html', judge: 'eye', origin: '“旋转六边形里的小球”',
    intro: '写一个小球在旋转多边形里弹跳的网页。球会不会穿墙、弹得真不真，跑起来就知道。', classic: '写一个 HTML 页面（用 canvas 和内联脚本，不引用任何外部文件）：一个小球在缓慢旋转的正六边形里弹跳，小球受重力和摩擦力影响，碰到旋转的边要真实地反弹，不能穿出去。只输出完整的 HTML 文件，不要解释。' },
  { id: 'carwash', name: '洗车题', skill: '常识', kind: 'text', judge: 'auto', origin: '“洗车店离家 50 米，走路还是开车”',
    intro: '一句话的常识陷阱：车得到场的事，再近也得开车去。很多模型会劝你走路。', classic: '我想去洗车，洗车店离我家只有 50 米。我应该走路去还是开车去？' },
  { id: 'candy', name: '糖果题', skill: '推理', kind: 'text', judge: 'auto', origin: '“黑袋子里摸糖果”',
    intro: '最坏情况推理题，关键在“形状靠手感能分辨”。社区常用它看模型有没有被降智。', classic: '一个黑色的袋子里放有三种口味的糖果，每种糖果有两种不同的形状（圆形和五角星形，不同的形状靠手感可以分辨）。数量如下：苹果味圆形 7 个、五角星形 7 个；桃子味圆形 9 个、五角星形 6 个；西瓜味圆形 8 个、五角星形 4 个。参赛者需要在摸之前决定摸出的糖果数目，那么最少取出多少个糖果，才能保证手中同时拥有不同形状的苹果味和桃子味的糖？（手里有圆形苹果味配五角星形桃子味，或者圆形桃子味配五角星形苹果味，都算满足。）' },
  { id: 'strawberry', name: '草莓题', skill: '细心', kind: 'text', judge: 'auto', origin: '“strawberry 里有几个 r”',
    intro: '数一个英文单词里某个字母出现几次。看着简单，模型按词块读字，常常数错。', classic: 'strawberry 这个单词里有几个字母 r？' },
  { id: 'decimal', name: '比大小', skill: '算术', kind: 'text', judge: 'auto', origin: '“9.11 和 9.9 哪个大”',
    intro: '两个小数比大小再相减。把小数当成版本号来比的模型会答反。', classic: '9.11 和 9.9 哪个大？' },
].map(test => Object.freeze(test)));
export const probeTestIds = Object.freeze(probeTests.map(test => test.id));
export const probeTest = id => probeTests.find(test => test.id === id);

/** 固定种子的随机数：同一个种子出同一道题，几个模型答的是同一题，记录也能照种子还原题面。 */
export function probeRandom(seed) {
  let state = seed >>> 0;
  return () => { state = state + 0x6D2B79F5 | 0; let t = Math.imul(state ^ state >>> 15, 1 | state); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const pick = (random, list) => list[Math.floor(random() * list.length)];
const between = (random, low, high) => low + Math.floor(random() * (high - low + 1));

const animals = ['水獭', '企鹅', '柯基', '章鱼', '长颈鹿', '仓鼠', '火烈鸟', '考拉', '河马', '刺猬', '树懒', '海豹'];
const vehicles = [['独轮车', '车轮'], ['滑板车', '踏板'], ['双人自行车', '车架'], ['三轮车', '车架'], ['滑板', '板面'], ['摩托车', '车身']];
const outfits = ['戴一顶红色毛线帽', '围着一条黄色围巾', '背着一个绿色书包', '戴着一副蓝色护目镜', '打着一把紫色的伞'];
const colors = ['#E4572E', '#17BEBB', '#FFC914', '#76B041', '#8F3985', '#2E86AB', '#F26419', '#3BB273', '#D7263D', '#6C5CE7'];
const polygons = [[5, '五边形'], [6, '六边形'], [7, '七边形'], [8, '八边形']];
// 车必须到场的事（该开车）和人去就行的事（该走路）各几种，抽到哪种答案就是哪个，背“开车”或“走路”都不行。
const errands = [
  ['我想去洗车，洗车店', '开车', '洗车'], ['我的车该做保养了，修理厂', '开车', '做保养'], ['我想给车加油，加油站', '开车', '加油'], ['我想给车换轮胎，轮胎店', '开车', '换轮胎'],
  ['我想去洗车店买一瓶玻璃水，洗车店', '走路', '去洗车店买玻璃水'], ['我想去加油站的便利店买瓶水，加油站', '走路', '去加油站买水'], ['我想去修理厂问一下保养的价格，修理厂', '走路', '去修理厂问价'],
];
const words = ['strawberry', 'raspberry', 'blueberry', 'mississippi', 'bookkeeper', 'committee', 'successfully', 'embarrassment', 'millennium', 'occurrence', 'accommodation', 'parallelogram', 'assessment', 'possession', 'unnecessarily', 'hippopotamus'];
const answerLine = '最后另起一行只写：答案：';

/**
 * 糖果题的正确答案：摸之前定好圆形摸 x 个、五角星形摸 y 个（形状摸得出来，口味摸不出来），
 * 求保证“圆苹果配星桃子”或“圆桃子配星苹果”的最小 x + y。counts = { apple, peach, melon } 各为 [圆形, 五角星形]。
 * 摸不出保证时返回 null。
 */
export function candyAnswer({ apple, peach, melon }) {
  const round = apple[0] + peach[0] + melon[0], star = apple[1] + peach[1] + melon[1];
  let best = null;
  for (let x = 0; x <= round; x++) for (let y = 0; y <= star; y++) {
    // 最坏情况有四种躲法：星形全摸到西瓜；圆形全摸到西瓜；一个桃子都没摸到；一个苹果都没摸到。四种都躲不掉才算保证。
    const safe = y > melon[1] && x > melon[0] && (x > apple[0] + melon[0] || y > apple[1] + melon[1]) && (x > peach[0] + melon[0] || y > peach[1] + melon[1]);
    if (safe && (best === null || x + y < best)) best = x + y;
  }
  return best;
}
/** 把形状也当成摸不出来（随手乱摸）时的答案：降智的模型常这样算，出题时要保证它和正确答案不同。 */
export function candyNaive({ apple, peach, melon }) {
  const sum = list => list[0] + list[1];
  return 1 + Math.max(apple[0] + peach[0] + sum(melon), apple[1] + peach[1] + sum(melon), sum(apple) + sum(melon), sum(peach) + sum(melon));
}
const candyPrompt = ({ apple, peach, melon }) => `一个黑色的袋子里放有三种口味的糖果，每种糖果有两种不同的形状（圆形和五角星形，不同的形状靠手感可以分辨）。数量如下：苹果味圆形 ${apple[0]} 个、五角星形 ${apple[1]} 个；桃子味圆形 ${peach[0]} 个、五角星形 ${peach[1]} 个；西瓜味圆形 ${melon[0]} 个、五角星形 ${melon[1]} 个。参赛者需要在摸之前决定摸出的糖果数目，那么最少取出多少个糖果，才能保证手中同时拥有不同形状的苹果味和桃子味的糖？（手里有圆形苹果味配五角星形桃子味，或者圆形桃子味配五角星形苹果味，都算满足。）`;
const trim = value => String(Number(value.toFixed(2)));

const variants = {
  pelican(random) {
    const animal = pick(random, animals), [vehicle, part] = pick(random, vehicles), outfit = pick(random, outfits), color = pick(random, colors), code = `WW-${between(random, 1000, 9999)}`;
    return { brief: `${animal}骑${vehicle}`, nonce: [code, color],
      prompt: `用 SVG 画一幅画：一只${outfit}的${animal}在骑${vehicle}。要求：1. 只输出一段完整的 SVG 代码，不要解释；2. ${vehicle}的${part}用颜色 ${color}；3. 画面右下角用小字写上“${code}”。` };
  },
  hexball(random) {
    const [, shape] = pick(random, polygons), balls = between(random, 1, 3), spin = pick(random, ['顺时针', '逆时针']), color = pick(random, colors), code = `WW-${between(random, 1000, 9999)}`;
    return { brief: `${balls} 个球 · 正${shape} · ${spin}`, nonce: [code, color],
      prompt: `写一个 HTML 页面：${balls} 个小球在一个${spin}缓慢旋转的正${shape}里弹跳。要求：1. 小球受重力和摩擦力影响，碰到旋转的边要真实地反弹，不能穿出去；2. 小球用颜色 ${color}；3. 页面左上角用小字写上“${code}”；4. 只输出一个完整的 HTML 文件（用 canvas 和内联脚本），不引用任何外部文件，不要解释。` };
  },
  carwash(random) {
    const [scene, expect, label] = pick(random, errands), distance = pick(random, [30, 40, 60, 80, 100, 150]);
    return { brief: `${label} · ${distance} 米`, expect,
      prompt: `${scene}离我家只有 ${distance} 米。我应该走路去还是开车去？先用一两句话说明理由，${answerLine}走路 或 答案：开车` };
  },
  candy(random) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const counts = { apple: [between(random, 4, 11), between(random, 4, 11)], peach: [between(random, 4, 11), between(random, 4, 11)], melon: [between(random, 3, 9), between(random, 3, 9)] };
      const answer = candyAnswer(counts);
      if (answer !== null && answer !== candyNaive(counts)) return { brief: `苹果 ${counts.apple.join('/')} · 桃子 ${counts.peach.join('/')} · 西瓜 ${counts.melon.join('/')}`, expect: String(answer), prompt: `${candyPrompt(counts)}先写出推理过程，${answerLine}数字` };
    }
    return { brief: '苹果 7/7 · 桃子 9/6 · 西瓜 8/4', expect: '21', prompt: `${probeTest('candy').classic}先写出推理过程，${answerLine}数字` };
  },
  strawberry(random) {
    const word = pick(random, words), tally = {};
    for (const letter of word) tally[letter] = (tally[letter] ?? 0) + 1;
    const letter = pick(random, Object.keys(tally).filter(key => tally[key] >= 2));
    return { brief: `${word} 里的 ${letter}`, expect: String(tally[letter]), prompt: `英文单词 ${word} 里一共有几个字母 ${letter}？${answerLine}数字` };
  },
  decimal(random) {
    const whole = between(random, 2, 19), tenth = between(random, 6, 9), tail = between(random, 1, 9);
    const big = `${whole}.${tenth}`, small = `${whole}.1${tail}`, order = random() < .5 ? [small, big] : [big, small];
    return { brief: `${order[0]} 和 ${order[1]}`, expect: `${big}，${trim(Number(big) - Number(small))}`,
      prompt: `${order[0]} 和 ${order[1]} 哪个大？大的减去小的等于多少？${answerLine}较大的数，差（例如“答案：3.5，0.25”）` };
  },
};
const classicExpect = { carwash: '开车', candy: '21', strawberry: '3', decimal: '9.9' };

/**
 * 出一道题。classic 为真发社区原题（不带口令，可能被预制，只用来对照）；否则按种子现出一道变体。
 * 返回 { id, seed, classic, prompt, brief, nonce（画图和写代码的题才有）, expect（能自动判的题才有） }。
 */
export function probeQuestion(id, seed, classic = false) {
  const test = probeTest(id);
  if (!test) throw new Error(`没有这道题 ${id}`);
  if (classic) return { id, seed: 0, classic: true, prompt: test.classic, brief: '社区原题', nonce: null, expect: classicExpect[id] ?? null };
  const made = variants[id](probeRandom(seed));
  return { id, seed: seed >>> 0, classic: false, prompt: made.prompt, brief: made.brief, nonce: made.nonce ?? null, expect: made.expect ?? null };
}

/** 从回答里取出能显示的作品：SVG 取 <svg>…</svg>，网页优先取 ```html 代码块，其次取 <!doctype 或 <html 到结尾。 */
export function probeArtifact(kind, reply) {
  const text = String(reply ?? '');
  if (kind === 'svg') { const found = text.match(/<svg[\s\S]*<\/svg>/i); return found ? found[0] : null; }
  if (kind === 'html') {
    const fenced = [...text.matchAll(/```(?:html)?\s*\n([\s\S]*?)```/gi)].map(match => match[1]).filter(block => /<canvas|<html|<script/i.test(block)).sort((a, b) => b.length - a.length)[0];
    if (fenced) return fenced.trim();
    const start = text.search(/<!doctype html|<html/i);
    if (start < 0) return /<canvas[\s\S]*<script/i.test(text) ? text.trim() : null;
    const end = text.toLowerCase().lastIndexOf('</html>');
    return (end > start ? text.slice(start, end + 7) : text.slice(start)).trim();
  }
  return null;
}

/** 文字题的答案：取最后一处“答案：”后面的内容，去掉加粗符号和句末标点。 */
export function probeAnswer(reply) {
  const found = [...String(reply ?? '').matchAll(/答案\s*[:：]\s*([^\n]*)/g)].at(-1);
  return found ? found[1].replace(/[*`_]/g, '').replace(/[。.!！\s]+$/, '').trim() : null;
}
const numbers = text => (String(text).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/**
 * 判一份回答。返回：
 * made：是不是按这次的题现做的（含本次口令和指定颜色）；原题和文字题为 null。
 * pass：自动判的对错；看图的题只判“有没有交出能显示的作品”，画得好不好由人看，交出来了记 null。
 * answer / expect：文字题里模型给的答案和正确答案；artifact：取出的 SVG 或网页；note：一句话说明。
 */
export function probeGrade(question, reply) {
  const test = probeTest(question.id), text = String(reply ?? '');
  if (test.judge === 'eye') {
    const artifact = probeArtifact(test.kind, text), missing = (question.nonce ?? []).filter(mark => !text.toLowerCase().includes(mark.toLowerCase()));
    const made = question.nonce ? missing.length === 0 : null;
    if (!artifact) return { made, pass: false, answer: null, expect: null, artifact: null, note: test.kind === 'svg' ? '没有交出能显示的 SVG' : '没有交出能运行的网页' };
    return { made, pass: null, answer: null, expect: null, artifact, note: made === false ? `回答里没有这次要求的${missing.map(mark => `“${mark}”`).join('和')}，可能不是按这次的题现做的` : made ? '带着这次的口令和指定颜色，是现做的' : '原题不带口令，没法判断是不是现做的' };
  }
  const answer = probeAnswer(text), expect = question.expect;
  if (answer === null) {
    // 原题没有要求答案格式：正文里出现正确答案、且没有出现相反的答案才算对。
    if (question.classic && expect !== null) {
      const right = question.id === 'carwash' ? /开车/.test(text) && !/(建议|应该|推荐|还是)[^。\n]{0,6}走路/.test(text) : question.id === 'decimal' ? /9\.9\s*(更|比较|要)?大|9\.9\s*>\s*9\.11|9\.11\s*<\s*9\.9/.test(text) : numbers(text.slice(-200)).includes(Number(expect));
      return { made: null, pass: right, answer: null, expect, artifact: null, note: right ? '答对了' : `没答对，正确答案是 ${expect}` };
    }
    return { made: null, pass: false, answer: null, expect, artifact: null, note: '没有按要求在最后写出“答案：”' };
  }
  let pass;
  if (question.id === 'carwash') pass = answer.includes(expect) && !answer.includes(expect === '开车' ? '走路' : '开车');
  else if (question.id === 'decimal') { const given = numbers(answer), wanted = numbers(expect); pass = wanted.every((value, index) => given[index] !== undefined && Math.abs(given[index] - value) < 1e-9); }
  else pass = numbers(answer)[0] === Number(expect);
  return { made: null, pass, answer, expect, artifact: null, note: pass ? '答对了' : `答的是“${answer}”，正确答案是 ${expect}` };
}

/**
 * 把模型写的网页包成放进隔离框架的文档：加一条内容安全策略，只许内联脚本和样式，不许联网、不许加载外部文件。
 * 框架本身另用 sandbox="allow-scripts"（不给同源），页面碰不到 DSH。
 */
export function probeFrameDocument(html) {
  const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:">';
  const source = String(html ?? '');
  return /<head[^>]*>/i.test(source) ? source.replace(/<head[^>]*>/i, head => `${head}${policy}`) : `<!doctype html><html><head><meta charset="utf-8">${policy}</head>${/<body/i.test(source) ? source.replace(/^[\s\S]*?(<body)/i, '$1').replace(/<\/html>\s*$/i, '') : `<body>${source}</body>`}</html>`;
}
/** SVG 用图片方式显示（图片里的脚本不会运行）。 */
export const probeSvgUrl = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(svg ?? ''))}`;

/**
 * 一轮测完后给一个模型的小结：能自动判的题对了几道；榜上梯队高却连错两道以上的，提示可能被掺水或降智。
 * results 是这个模型在这一轮里的判分结果（probeGrade 的返回，另带 id）；tier 是它在榜上的梯队（没有为 null）。
 */
export function probeSummary(results, tier = null) {
  const auto = results.filter(item => probeTest(item.id)?.judge === 'auto'), right = auto.filter(item => item.pass === true).length;
  const canned = results.filter(item => item.made === false).length, broken = results.filter(item => probeTest(item.id)?.judge === 'eye' && item.pass === false).length;
  const doubt = canned > 0 ? 'canned' : (tier === 'T0' || tier === 'T1') && auto.length >= 3 && auto.length - right >= 2 ? 'weak' : null;
  return { total: auto.length, right, canned, broken, doubt };
}
