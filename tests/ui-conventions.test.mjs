import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 界面控件的约定（docs/架构与约定.md「界面组件约定」）里能自动查的两条。
// 2026-11-13 AI 网页的“带上哪几篇笔记”“贴进来”两个弹窗上线时走了样：勾选框和文字错成两行、文本框落回等宽字体，
// 原因都是没用共用的写法。这里把同类错误拦在回归里。

const root = fileURLToPath(new URL('..', import.meta.url));
const sources = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true, recursive: true })
  .filter(item => item.isFile() && item.name.endsWith('.js'))
  .map(item => path.relative(root, path.join(item.parentPath ?? item.path, item.name)).replaceAll('\\', '/'))
  // 办公工坊自带的第三方库不算界面源码。
  .filter(name => !name.includes('node_modules/') && !name.includes('/vendor/'));
const files = [...sources('features'), ...sources('src')];
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('勾选框、单选框外面的 label 要带登记过的类，不能是光秃秃的 label（那样勾选框和文字会错成两行）', () => {
  // .ww-page 下的 label 默认上下排（表单项用）。包着勾选框的 label 必须用下面这些类之一，或放在登记过的容器里。
  // 勾选一项统一用 ww-choice（2026-11-14 用户定：原来还有 ww-check、ww-kit-check-label 两套，是同一种东西）。
  const rowClasses = ['ww-choice', 'ww-field'];
  // 自己另有排法的两处：办公工坊“要补过来的列”（ww-tool-columns 给里面的 label 定了横排）、常看书籍那一行（封面、书名、勾选框的专用排法）。
  const knownContainers = ['ww-tool-columns', 'h(BookCover'];
  const problems = [];
  for (const name of files) {
    const text = read(name);
    for (const match of text.matchAll(/type: '(?:checkbox|radio)'/g)) {
      const before = text.slice(Math.max(0, match.index - 400), match.index);
      const at = before.lastIndexOf("h('label'");
      // 不在 label 里的（列表行里带 aria-label 的勾选框、Markdown 任务项）不归这条管。
      if (at < 0 || before.slice(at).includes("h('input'") === false || /\)\s*,\s*h\('(?:div|li|p|section)'/.test(before.slice(at))) continue;
      const label = before.slice(at);
      if (rowClasses.some(value => label.includes(value)) || knownContainers.some(value => before.includes(value))) continue;
      problems.push(`${name}:${text.slice(0, match.index).split('\n').length}`);
    }
  }
  assert.deepEqual(problems, [], '这些勾选框外面的 label 没带 ww-choice 这类横排的类；列表里多选请用行按钮加 ww-pick-mark');
});

test('弹窗自己的样式不能写成“.ww-page .弹窗的类 …”：弹窗的类和 ww-page 在同一个元素上，这样写套不上', () => {
  const classes = new Set();
  for (const name of files) for (const match of read(name).matchAll(/h\(Modal, \{[^}]*?className: '([^']+)'/g)) for (const value of match[1].split(/\s+/)) classes.add(value);
  // 外壳定义、各弹窗共用的两个类不算“弹窗自己的类”。
  for (const shared of ['ww-confirm', 'ww-switcher']) classes.delete(shared);
  assert.ok(classes.has('ww-ai-paste') && classes.has('ww-ai-preview'), '至少认得 AI 网页的两个弹窗');
  const styles = files.filter(name => name.endsWith('presentation.js')).map(name => [name, read(name)]);
  const problems = [];
  for (const value of classes) {
    const wrong = new RegExp(`\\.ww-page \\.${value}(?![a-z0-9-])`);
    for (const [name, text] of styles) if (wrong.test(text)) problems.push(`${name}：.ww-page .${value} …`);
  }
  assert.deepEqual(problems, [], '改成“.弹窗的类.ww-page …”（宽度写“.ww-modal.弹窗的类.ww-page[open]”）');
});

test('“搜了再挑”的列表样式只在外壳里有一份，各功能不另写', () => {
  const owners = files.filter(name => name.endsWith('presentation.js') && /\.ww-switcher-list\{/.test(read(name)));
  assert.deepEqual(owners, ['src/shell/theme-presentation.js']);
  const shell = read('src/shell/theme-presentation.js');
  for (const rule of ['.ww-switcher-list>.ww-switcher-empty{', '.ww-pick-mark{', '.ww-switcher-foot{']) assert.ok(shell.includes(rule), rule);
});
