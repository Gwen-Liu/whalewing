// 拖动换位置（全产品共用，src/sortable.js）。2026-11-13 用户定：不要“上移 / 下移”“← / →”一格一格挪的按钮，
// 小块前面一个小点，按住它拖到哪放到哪。真实的鼠标拖动在功能测试里点（workbench COM-21、toolbox TOOL-13 等），这里管算位置和键盘。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dropIndex, moveItem, createSortable } from '../src/sortable.js';

test('拖着小块换位置：一排看左右、一列看上下，落在别的小块近半边插到它前面、远半边插到它后面，没落在小块上不动', () => {
  // 一排三个（被拖的那个不算在里面），每个宽 100、间隔 10；折到第二行还有一个。
  const row = [{ left: 0, right: 100, top: 0, bottom: 30 }, { left: 110, right: 210, top: 0, bottom: 30 }, { left: 220, right: 320, top: 0, bottom: 30 }, { left: 0, right: 100, top: 40, bottom: 70 }];
  assert.equal(dropIndex(row, 20, 15), 0, '第一个的左半边：排到最前');
  assert.equal(dropIndex(row, 80, 15), 1, '第一个的右半边：排到它后面');
  assert.equal(dropIndex(row, 130, 15), 1); assert.equal(dropIndex(row, 190, 15), 2);
  assert.equal(dropIndex(row, 300, 15), 3, '最后一个的右半边：排到这一行最后');
  assert.equal(dropIndex(row, 30, 55), 3, '折到第二行的也认'); assert.equal(dropIndex(row, 90, 55), 4);
  assert.equal(dropIndex(row, 105, 15), -1, '落在两个小块中间的空当里不动');
  assert.equal(dropIndex(row, 400, 15), -1); assert.equal(dropIndex(row, 50, 100), -1); assert.equal(dropIndex([], 10, 10), -1);
  // 一列三行，每行高 30、间隔 4。
  const column = [{ left: 0, right: 300, top: 0, bottom: 30 }, { left: 0, right: 300, top: 34, bottom: 64 }, { left: 0, right: 300, top: 68, bottom: 98 }];
  assert.equal(dropIndex(column, 250, 5, 'y'), 0, '一列只看上下：在第一行上半边，不管左右');
  assert.equal(dropIndex(column, 10, 25, 'y'), 1); assert.equal(dropIndex(column, 150, 40, 'y'), 1); assert.equal(dropIndex(column, 150, 60, 'y'), 2);
  assert.equal(dropIndex(column, 150, 95, 'y'), 3); assert.equal(dropIndex(column, 150, 32, 'y'), -1, '两行中间的缝里不动');
});

test('把第几个挪到第几个：位置没变或下标不对时原样返回同一个数组', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(list, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(list, 1, 3), ['a', 'c', 'd', 'b']);
  for (const [from, to] of [[1, 1], [-1, 0], [4, 0], [0, 4], [0, -1]]) assert.equal(moveItem(list, from, to), list);
  assert.deepEqual(list, ['a', 'b', 'c', 'd'], '不改原来的数组');
});

// 一个只够跑这个钩子的 React：记状态和引用，effect 每次都跑。
function mount(options) {
  const states = [], refs = [];
  let si = 0, ri = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], next => { states[i] = next; }]; },
    useRef(initial) { const i = ri++; return refs[i] ||= { current: initial }; },
    useEffect(callback) { callback(); }, useLayoutEffect(callback) { callback(); },
  };
  const useSortable = createSortable(React);
  return () => { si = 0; ri = 0; return useSortable(options()); };
}

test('拖动手柄：每个小块一个，读屏有名字；焦点在它上面按方向键一次挪一位，到头不动，不许拖时不动', () => {
  let order = ['a', 'b', 'c'], disabled = false;
  const moves = [];
  const render = mount(() => ({ order, disabled, move: (key, index) => { moves.push([key, index]); order = moveItem(order, order.indexOf(key), index); } }));
  let sortable = render();
  const key = name => ({ key: name, prevented: false, preventDefault() { this.prevented = true; } });
  const grip = sortable.grip('b', { label: '拖动 b 调整顺序', title: '按住拖动，换位置' });
  assert.equal(grip.type, 'button'); assert.equal(grip.props.className, 'ww-grip'); assert.equal(grip.props['aria-label'], '拖动 b 调整顺序');
  assert.equal(grip.props.disabled, false); assert.equal(grip.props.children[0].type, 'svg', '图标是共用的六个小点');
  assert.deepEqual(sortable.item('b'), { 'data-sort-key': 'b', 'data-dragging': undefined });
  assert.equal(sortable.list['data-sorting'], undefined); assert.equal(sortable.dragging, null);
  const left = key('ArrowLeft'); grip.props.onKeyDown(left);
  assert.equal(left.prevented, true); assert.deepEqual(moves, [['b', 0]]); assert.deepEqual(order, ['b', 'a', 'c']);
  sortable = render();
  sortable.grip('b', { label: '', title: '' }).props.onKeyDown(key('ArrowUp'));
  assert.deepEqual(moves, [['b', 0]], '已经在最前，再往前不动');
  for (const name of ['ArrowRight', 'ArrowDown']) { sortable = render(); sortable.grip('b', { label: '', title: '' }).props.onKeyDown(key(name)); }
  assert.deepEqual(order, ['a', 'c', 'b']);
  sortable = render();
  sortable.grip('b', { label: '', title: '' }).props.onKeyDown(key('ArrowRight'));
  const other = key('Enter'); sortable.grip('b', { label: '', title: '' }).props.onKeyDown(other);
  assert.equal(moves.length, 3, '到头不动，别的键不管'); assert.equal(other.prevented, false);
  // 数字标识（页面整理用页码）也认。
  order = [0, 1, 2]; sortable = render();
  sortable.grip(2, { label: '', title: '' }).props.onKeyDown(key('ArrowLeft'));
  assert.deepEqual(order, [0, 2, 1]); assert.deepEqual(sortable.item(0), { 'data-sort-key': '0', 'data-dragging': undefined });
  // 正在处理时不许拖，键盘也不动；只有一个时手柄不能用。
  disabled = true; sortable = render();
  assert.equal(sortable.grip(2, { label: '', title: '' }).props.disabled, true);
  sortable.grip(2, { label: '', title: '' }).props.onKeyDown(key('ArrowLeft'));
  assert.deepEqual(order, [0, 2, 1]);
  disabled = false; order = ['only']; sortable = render();
  assert.equal(sortable.grip('only', { label: '', title: '' }).props.disabled, true);
});

test('全产品没有一格一格挪位置的按钮：界面代码里不再有“上移”“下移”“前移”“后移”“往前挪”“往后挪”', async () => {
  for (const file of ['src/shell/launcher.js', 'src/shell/common-presentation.js', 'src/utilities/views.js', 'src/utilities/workshop.js']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.equal(/上移|下移|前移|后移|往前挪|往后挪/.test(source), false, file);
  }
  const views = await readFile(new URL('../src/utilities/views.js', import.meta.url), 'utf8'), launcher = await readFile(new URL('../src/shell/launcher.js', import.meta.url), 'utf8');
  assert.equal((views.match(/useSortable\(\{/g) || []).length, 2, '办公工坊的文件列表和页面整理都用共用的拖动');
  assert.equal((launcher.match(/useSortable\(\{/g) || []).length, 1, '页头“钉在页头的”一排也用它');
  assert.equal(/draggable: !state\.busy|onDragStart/.test(views), false, '页面整理不再另用一套浏览器自带的拖放');
});
