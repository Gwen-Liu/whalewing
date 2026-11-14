import test from 'node:test';
import assert from 'node:assert/strict';
import { recipeOf, readRecent, saveRecent, forgetRecent, planReplay, replayHint, stepCall, whenText, recentKey, recentLimit } from '../src/utilities/recipes.js';
import { fileType } from '../src/utilities/workshop.js';

// 办公工坊“最近做过”（2026-11-14 用户定做）：做好的一单记下做法，换上新文件照原样再做一遍，不经过小鲸。
const names = { 'pdf-merge': '合并 PDF', 'pdf-number': '添加页码', 'excel-join': '按关键列关联', 'image-format': '图片转格式', 'image-mosaic': '隐私打码', 'qr-make': '生成二维码', 'pdf-pages': '页面整理' };
const titleOf = id => names[id] ?? id;
/** 造一单：files 是原文件 [编号, 名字, 类型]，steps 是 [功能项, 输入编号, 设置, 做出的编号]。 */
function turnOf(ask, files, steps) {
  const job = { files: new Map(files.map(([id, name, type]) => [id, { name, meta: { type } }])) };
  return { ask: { text: ask }, job, steps: steps.map(([tool, inputs, options, outputs]) => ({ tool, note: `${titleOf(tool)}的说明`, state: 'done', call: { inputs, options }, result: { outputs } })) };
}
const merged = () => turnOf('把这三份合同合成一个 PDF，按甲方、乙方、补充协议的顺序，加上页码', [['f1', '甲方.pdf', 'pdf'], ['f2', '乙方.pdf', 'pdf'], ['f3', '补充.pdf', 'pdf']],
  [['pdf-merge', ['f1', 'f2', 'f3'], {}, ['r1-1']], ['pdf-number', ['r1-1'], { pages: '1-' }, ['r2-1']]]);
const joined = () => turnOf('对一下这两份名单，看谁还没交', [['f1', '报名.xlsx', 'xlsx'], ['f2', '回收.xlsx', 'xlsx']],
  [['excel-join', ['f1', 'f2'], { main: { file: 'f1', sheet: '报名' }, lookup: { file: 'f2' }, mainKey: '工号', lookupKey: '工号' }, ['r1-1']]]);
const numbered = () => turnOf('给这份合同加页码', [['f1', '合同.pdf', 'pdf']], [['pdf-number', ['f1'], {}, ['r1-1']]]);
const file = name => ({ name });

test('记做法：原文件换成“第几个”，前面做出的换成“第几步的第几个”；名字取员工说的话，下面一行是步骤', () => {
  const recipe = recipeOf(merged(), { titleOf, now: Date.UTC(2026, 10, 14, 6) });
  assert.equal(recipe.title, '把这三份合同合成一个 PDF，按甲方、乙方、补充协议的顺序，加上页码');
  assert.equal(recipe.chain, '合并 PDF → 添加页码');
  assert.deepEqual(recipe.slots, [{ name: '甲方.pdf', type: 'pdf' }, { name: '乙方.pdf', type: 'pdf' }, { name: '补充.pdf', type: 'pdf' }]);
  assert.deepEqual(recipe.steps.map(step => step.inputs), [[{ slot: 0 }, { slot: 1 }, { slot: 2 }], [{ from: [0, 0] }]]);
  assert.deepEqual(recipe.steps[1].options, { pages: '1-' });
  assert.equal(recipe.at, Date.UTC(2026, 10, 14, 6));
  // 设置里写的文件编号（按关键列关联的主表、查找表）也换掉。
  assert.deepEqual(recipeOf(joined(), { titleOf }).steps[0].options, { main: { file: { $slot: 0 }, sheet: '报名' }, lookup: { file: { $slot: 1 } }, mainKey: '工号', lookupKey: '工号' });
  // 员工没说话（只放了文件）时名字用步骤。
  assert.equal(recipeOf({ ...numbered(), ask: { text: '' } }, { titleOf }).title, '添加页码');
  // 太长的话截到 40 个字。
  assert.equal([...recipeOf({ ...numbered(), ask: { text: '字'.repeat(60) } }, { titleOf }).title].length, 41);
});

test('不记的：没做完的、要框位置的、按上次文件页面排的、不用文件的', () => {
  const unfinished = merged(); unfinished.steps[1].state = 'error';
  assert.equal(recipeOf(unfinished, { titleOf }), null);
  assert.equal(recipeOf(turnOf('打码', [['f1', '截图.png', 'png']], [['image-mosaic', ['f1'], { x: 1, y: 2, width: 3, height: 4 }, ['r1-1']]]), { titleOf }), null);
  assert.equal(recipeOf(turnOf('整理', [['f1', 'a.pdf', 'pdf']], [['pdf-pages', ['f1'], { layout: [{ page: 2 }] }, ['r1-1']]]), { titleOf }), null);
  assert.equal(recipeOf(turnOf('二维码', [], [['qr-make', [], { size: 512 }, ['r1-1']]]), { titleOf }), null);
  assert.equal(recipeOf({ ask: { text: '只问了一句' }, job: { files: new Map() }, steps: [] }), null);
});

test('换文件：能一次处理多个的整批交给它；个数一样按顺序对上；上次一个文件、这次几个就各做一遍；对不上说清要几个', () => {
  const merge = recipeOf(merged(), { titleOf }), join = recipeOf(joined(), { titleOf }), number = recipeOf(numbered(), { titleOf });
  // 合并：上次 3 个，这次 5 个也行，整批交给合并那一步。
  const five = ['1.pdf', '2.pdf', '3.pdf', '4.pdf', '5.pdf'].map(file);
  assert.deepEqual(planReplay(merge, five, fileType), { runs: [{ batch: five }] });
  assert.match(replayHint(merge), /可以一次放几个/);
  // 按关键列关联：两个文件按顺序对上，第一个是主表；三个对不上。
  const two = [file('新报名.xlsx'), file('新回收.xls')];
  assert.deepEqual(planReplay(join, two, fileType), { runs: [{ slots: two }] });
  assert.equal(planReplay(join, [...two, file('多的.xlsx')], fileType).error, '这件事要 2 个文件，按顺序对应上次的：「报名.xlsx」、「回收.xlsx」；这次放了 3 个。');
  assert.match(replayHint(join), /放 2 个文件，按顺序对应上次的/);
  // 加页码：上次一个，这次三个，各做一遍。
  const three = [file('a.pdf'), file('b.pdf'), file('c.pdf')];
  assert.deepEqual(planReplay(number, three, fileType), { runs: three.map(item => ({ slots: [item] })) });
  assert.match(replayHint(number), /每个文件照上次的做法各做一遍/);
  // 类型不对、没放、太多。
  assert.equal(planReplay(number, [file('合同.docx')], fileType).error, '上次处理的是PDF，「合同.docx」不是，换一个再试。');
  assert.equal(planReplay(number, [], fileType).error, '先放这次要处理的文件。');
  assert.equal(planReplay(merge, Array.from({ length: 21 }, (_, i) => file(`${i}.pdf`)), fileType).error, '一次最多 20 个文件。');
  // 图片按一类算：上次 PNG，这次 JPG 也行。
  const picture = recipeOf(turnOf('转成 JPG', [['f1', '海报.png', 'png']], [['image-format', ['f1'], { format: 'jpeg' }, ['r1-1']]]), { titleOf });
  assert.deepEqual(planReplay(picture, [file('照片.jpeg'), file('图.webp')], fileType).runs.length, 1, '转图片格式能一次处理多张，整批交给它');
});

test('每一步这次怎么调用：原文件和前面做出的都换成这次的编号，设置里的文件编号也换', () => {
  const merge = recipeOf(merged(), { titleOf });
  assert.deepEqual(stepCall(merge, 0, { batch: ['f1', 'f2', 'f3', 'f4'], outputs: [] }), { inputs: ['f1', 'f2', 'f3', 'f4'], options: {} });
  assert.deepEqual(stepCall(merge, 1, { batch: ['f1', 'f2', 'f3', 'f4'], outputs: [['r1-1']] }), { inputs: ['r1-1'], options: { pages: '1-' } });
  assert.throws(() => stepCall(merge, 1, { batch: ['f1'], outputs: [[]] }), /第 2 步要用第 1 步做出的第 1 个文件，这次没做出来/);
  const join = recipeOf(joined(), { titleOf });
  assert.deepEqual(stepCall(join, 0, { slotIds: ['f1', 'f2'], outputs: [] }), { inputs: ['f1', 'f2'], options: { main: { file: 'f1', sheet: '报名' }, lookup: { file: 'f2' }, mainKey: '工号', lookupKey: '工号' } });
  assert.throws(() => stepCall(join, 0, { slotIds: ['f1'], outputs: [] }), /对不上/);
});

test('记在这台电脑上：最新的排前面，同样的做法只留一条，最多 6 件；能去掉；存不了、内容坏了都当没有', () => {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const first = recipeOf(numbered(), { titleOf, now: 1 }), second = recipeOf(merged(), { titleOf, now: 2 });
  saveRecent(storage, first); saveRecent(storage, second);
  assert.deepEqual(readRecent(storage).map(item => item.title), [second.title, first.title]);
  // 同样的做法又做了一遍：替换，不多出一条。
  const again = recipeOf({ ...numbered(), ask: { text: '再加一次页码' } }, { titleOf, now: 3 });
  assert.deepEqual(readRecent(storage).length, 2);
  assert.deepEqual(saveRecent(storage, again).map(item => item.title), ['再加一次页码', second.title]);
  for (let i = 0; i < 8; i++) saveRecent(storage, recipeOf(turnOf(`第 ${i} 件`, [['f1', 'a.pdf', 'pdf']], [['pdf-number', ['f1'], { pages: String(i + 1) }, ['r1-1']]]), { titleOf, now: 10 + i }));
  assert.equal(readRecent(storage).length, recentLimit);
  const top = readRecent(storage)[0];
  assert.equal(forgetRecent(storage, top.id).some(item => item.id === top.id), false);
  data.set(recentKey, '坏了{'); assert.deepEqual(readRecent(storage), []);
  data.set(recentKey, JSON.stringify([{ id: 'x', title: '没有步骤', chain: '', at: 1, slots: [], steps: [] }, { id: 'y', title: '不认识的功能项', chain: '', at: 1, slots: [{ name: 'a', type: 'pdf' }], steps: [{ tool: 'rm-rf', inputs: [{ slot: 0 }] }] }]));
  assert.deepEqual(readRecent(storage), [], '不合规矩的条目不认');
  const broken = { getItem() { throw new Error('隐私模式'); }, setItem() { throw new Error('隐私模式'); } };
  assert.deepEqual(readRecent(broken), []);
  assert.doesNotThrow(() => saveRecent(broken, first));
  assert.deepEqual(readRecent(null), []);
});

test('什么时候做的：今天、昨天写时间，再早写日期，按北京时间', () => {
  const now = Date.UTC(2026, 10, 14, 6, 0); // 北京时间 11 月 14 日 14:00
  assert.equal(whenText(Date.UTC(2026, 10, 14, 1, 5), now), '今天 09:05');
  assert.equal(whenText(Date.UTC(2026, 10, 13, 15, 30), now), '昨天 23:30');
  assert.equal(whenText(Date.UTC(2026, 10, 13, 16, 30), now), '今天 00:30', '北京时间已经是 14 日');
  assert.equal(whenText(Date.UTC(2026, 10, 10, 6, 0), now), '11月10日');
});
