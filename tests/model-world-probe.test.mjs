import test from 'node:test';
import assert from 'node:assert/strict';
import { probeTests, probeTestIds, probeQuestion, probeGrade, probeArtifact, probeAnswer, probeFrameDocument, probeSvgUrl, probeSummary, candyAnswer, candyNaive } from '../src/model-world-probe.js';

test('六道题各有名字、考什么、出处和社区原题；看图的两道由人判，其余自动判分', () => {
  assert.deepEqual(probeTestIds, ['pelican', 'hexball', 'carwash', 'candy', 'strawberry', 'decimal']);
  for (const item of probeTests) { assert.ok(item.name && item.skill && item.origin && item.intro && item.classic, item.id); assert.ok(['svg', 'html', 'text'].includes(item.kind)); }
  assert.deepEqual(probeTests.filter(item => item.judge === 'eye').map(item => item.id), ['pelican', 'hexball']);
  assert.throws(() => probeQuestion('nope', 1), /没有这道题/);
});

test('同一个种子出同一道题，换种子就换题：几个模型答的是同一题，预先备好的答案对不上', () => {
  for (const id of probeTestIds) {
    assert.deepEqual(probeQuestion(id, 42), probeQuestion(id, 42), `${id} 同种子同题`);
    const prompts = new Set(Array.from({ length: 30 }, (_, seed) => probeQuestion(id, seed).prompt));
    assert.ok(prompts.size >= 8, `${id} 换种子至少出 8 种不同的题面，实际 ${prompts.size}`);
  }
});

test('画图和写代码的题带本次口令和指定颜色，文字题带现算的正确答案；原题不带口令', () => {
  const drawn = probeQuestion('pelican', 7), coded = probeQuestion('hexball', 7);
  for (const question of [drawn, coded]) { assert.match(question.nonce[0], /^WW-\d{4}$/); assert.match(question.nonce[1], /^#[0-9A-F]{6}$/); assert.ok(question.nonce.every(mark => question.prompt.includes(mark))); assert.equal(question.expect, null); }
  assert.doesNotMatch(drawn.prompt, /鹈鹕|pelican/i, '默认不发原题里的鹈鹕');
  const classic = probeQuestion('pelican', 7, true);
  assert.equal(classic.prompt, 'Generate an SVG of a pelican riding a bicycle'); assert.equal(classic.nonce, null); assert.equal(classic.classic, true);
  for (const id of ['carwash', 'candy', 'strawberry', 'decimal']) { const question = probeQuestion(id, 3); assert.ok(question.expect, id); assert.equal(question.nonce, null); assert.match(question.prompt, /答案：/); }
});

test('糖果题：形状摸得出来时按“定好圆形和五角星形各摸几个”算，社区原题是 21，乱摸的算法是 29', () => {
  const classic = { apple: [7, 7], peach: [9, 6], melon: [8, 4] };
  assert.equal(candyAnswer(classic), 21); assert.equal(candyNaive(classic), 29);
  assert.equal(probeQuestion('candy', 0, true).expect, '21');
  for (let seed = 0; seed < 200; seed++) {
    const question = probeQuestion('candy', seed), counts = [...question.prompt.matchAll(/(苹果|桃子|西瓜)味圆形 (\d+) 个、五角星形 (\d+) 个/g)], of = name => counts.find(item => item[1] === name).slice(2).map(Number);
    const table = { apple: of('苹果'), peach: of('桃子'), melon: of('西瓜') };
    assert.equal(question.expect, String(candyAnswer(table)), `种子 ${seed} 的答案按题面的数字现算`);
    assert.notEqual(Number(question.expect), candyNaive(table), '正确答案和乱摸的算法不同，降智的模型答不对');
  }
  assert.equal(candyAnswer({ apple: [0, 0], peach: [3, 3], melon: [2, 2] }), null, '没有苹果味就摸不出保证');
});

test('洗车题两种都出：车必须到场的答开车，人去就行的答走路，只背一个答案过不了', () => {
  const answers = new Set(Array.from({ length: 60 }, (_, seed) => probeQuestion('carwash', seed).expect));
  assert.deepEqual([...answers].sort(), ['开车', '走路']);
  const drive = Array.from({ length: 60 }, (_, seed) => probeQuestion('carwash', seed)).find(question => question.expect === '开车');
  assert.equal(probeGrade(drive, '车得到场。\n答案：开车').pass, true);
  assert.equal(probeGrade(drive, '这么近。\n答案：**走路**。').pass, false);
  assert.equal(probeGrade(drive, '开车或者走路都行').pass, false, '没按要求写“答案：”不算对');
});

test('文字题判分：取最后一处“答案：”，去掉加粗和句号；小数题要较大的数和差都对', () => {
  assert.equal(probeAnswer('先猜 答案：3\n再想想\n答案：**21**。'), '21'); assert.equal(probeAnswer('没有'), null);
  const count = probeQuestion('strawberry', 5), right = Number(count.expect);
  assert.equal(probeGrade(count, `答案：${right}`).pass, true); assert.equal(probeGrade(count, `答案：${right + 1}`).pass, false);
  const decimal = probeQuestion('decimal', 9), [big, gap] = decimal.expect.split('，');
  assert.equal(probeGrade(decimal, `答案：${big}，${gap}`).pass, true);
  assert.equal(probeGrade(decimal, `答案：${big}，9`).pass, false, '差算错不给过');
  const wrong = probeGrade(decimal, `答案：${gap}，${big}`); assert.equal(wrong.pass, false); assert.match(wrong.note, /正确答案是/);
});

test('社区原题没有答案格式：正文答对才算对', () => {
  assert.equal(probeGrade(probeQuestion('decimal', 0, true), '9.9 更大，因为 9.90 > 9.11').pass, true);
  assert.equal(probeGrade(probeQuestion('decimal', 0, true), '9.11 更大').pass, false);
  assert.equal(probeGrade(probeQuestion('strawberry', 0, true), 'strawberry 里有 3 个 r').pass, true);
  assert.equal(probeGrade(probeQuestion('carwash', 0, true), '建议走路去，才 50 米').pass, false);
  assert.equal(probeGrade(probeQuestion('carwash', 0, true), '得开车去，车要到场').pass, true);
});

test('看图的题：回答里带本次口令和指定颜色才算现做；发回别的图标成不像现做的；交不出作品判没做出来', () => {
  const question = probeQuestion('pelican', 11), [code, color] = question.nonce;
  const made = probeGrade(question, `好的\n<svg viewBox="0 0 9 9"><rect fill="${color.toLowerCase()}"/><text>${code}</text></svg>`);
  assert.equal(made.made, true); assert.equal(made.pass, null, '画得好不好由人看'); assert.match(made.artifact, /^<svg[\s\S]*<\/svg>$/);
  const canned = probeGrade(question, '<svg viewBox="0 0 9 9"><circle r="3"/></svg>');
  assert.equal(canned.made, false); assert.match(canned.note, /不是按这次的题现做的/);
  const none = probeGrade(question, '我画不了');
  assert.equal(none.pass, false); assert.equal(none.artifact, null);
  assert.equal(probeGrade(probeQuestion('pelican', 0, true), '<svg></svg>').made, null, '原题没有口令，判断不了是不是现做');
});

test('取作品：SVG 取标签之间，网页优先取代码块；放进隔离框前加一条不许联网的策略', () => {
  assert.equal(probeArtifact('svg', '前面<svg a="1"><g/></svg>后面'), '<svg a="1"><g/></svg>');
  assert.equal(probeArtifact('html', '说明\n```html\n<!doctype html><html><body><canvas></canvas></body></html>\n```\n完'), '<!doctype html><html><body><canvas></canvas></body></html>');
  assert.equal(probeArtifact('html', '<!DOCTYPE html><html><head></head><body></body></html> 多余的话'), '<!DOCTYPE html><html><head></head><body></body></html>');
  assert.equal(probeArtifact('html', '只有文字'), null);
  const framed = probeFrameDocument('<html><head><title>x</title></head><body><script>fetch("https://example.com")</script></body></html>');
  assert.match(framed, /<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">/);
  assert.match(probeFrameDocument('<canvas></canvas><script>1</script>'), /^<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"/);
  assert.match(probeSvgUrl('<svg>#</svg>'), /^data:image\/svg\+xml;charset=utf-8,%3Csvg%3E%23%3C%2Fsvg%3E$/);
});

test('小结：数自动判的题对了几道；有不像现做的优先提示预制，榜上 T0、T1 却错两道以上提示可能掺水', () => {
  const auto = (id, pass) => ({ id, pass, made: null }), eye = (id, made, pass = null) => ({ id, pass, made });
  assert.deepEqual(probeSummary([auto('candy', true), auto('carwash', true), eye('pelican', true)], 'T0'), { total: 2, right: 2, canned: 0, broken: 0, doubt: null });
  assert.equal(probeSummary([auto('candy', false), auto('carwash', false), auto('decimal', true)], 'T0').doubt, 'weak');
  assert.equal(probeSummary([auto('candy', false), auto('carwash', false), auto('decimal', true)], 'T3').doubt, null, '榜上本来就弱的不提示');
  assert.equal(probeSummary([auto('candy', false), auto('carwash', true), auto('decimal', true)], 'T0').doubt, null, '只错一道不提示');
  assert.equal(probeSummary([eye('pelican', false), auto('candy', true)], null).doubt, 'canned');
  assert.equal(probeSummary([eye('hexball', null, false)], null).broken, 1);
});
