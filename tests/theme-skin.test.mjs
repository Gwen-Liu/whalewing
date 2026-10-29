import test from 'node:test';
import assert from 'node:assert/strict';
import { css } from '../src/shell/presentation-content.js';
import { tokens, shell } from '../src/shell/theme-presentation.js';
import { worldViewCss } from '../src/model-world-view.js';

// 2026-10-25 用户要求：员工装了 DSH 皮肤时鲸翼要跟着皮肤走，不能自己铺不透明的底色把皮肤挡住；
// 个性只靠卡片边缘的半透明点缀。皮肤中心改写的是 DSH 的 --dsw-* 变量，所以面、字、边框都要从这些变量来。
const rulesOf = text => [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
const declared = (text, selector, property) => rulesOf(text).filter(rule => rule.selector === selector).flatMap(rule => rule.body.split(';').map(part => part.trim()).filter(part => part.startsWith(`${property}:`)).map(part => part.slice(property.length + 1)));

test('颜色变量放在整份样式最前、外壳样式放在最后，面和字都指向 DSH 变量', () => {
  assert.ok(css.startsWith(tokens), '变量层在最前面');
  assert.ok(css.endsWith(shell), '外壳样式最后覆盖早先的旧规则');
  for (const name of ['--ww-ink', '--ww-surface', '--ww-surface-2', '--ww-line', '--ww-brand', '--ww-fill', '--ww-on-fill']) {
    const value = new RegExp(`${name}:([^;]+);`).exec(tokens)?.[1];
    assert.ok(value?.startsWith('var(--dsw-'), `${name} 来自 DSH 变量：${value}`);
  }
  assert.match(tokens, /\.ww-page \*[^{]*\{corner-shape:round\}/, '圆点和头像不被 DSH 的超椭圆规则画成方块');
});

test('主要卡片的底色都来自变量，不写死颜色挡住皮肤', () => {
  const surfaces = [[css, '.ww-page .ww-card'], [css, '.ww-desk-card'], [css, '.ww-pin-band'], [css, '.ww-ai-tile'], [css, '.ww-cards .ww-pin-choice'], [worldViewCss, '.ww-mw-model-row']];
  for (const [text, selector] of surfaces) {
    const values = [...declared(text, selector, 'background'), ...declared(text, selector, 'background-color')];
    assert.ok(values.length > 0, `${selector} 有底色声明`);
    for (const value of values) assert.match(value, /^(var\(--(dsw|ww)-|transparent$)/, `${selector} 的底色 ${value} 不是写死的颜色`);
  }
  // 书房的纸、笺、界、墨跟随 DSH：知识卡片页上不再有写死的暖纸色（阅读器是盖在页面上的弹窗，书页保留纸色）。
  const desk = rulesOf(css).filter(rule => rule.selector === '.ww-cards').map(rule => rule.body).join(';');
  for (const name of ['--ww-paper', '--ww-sheet', '--ww-rule', '--ww-ink', '--ww-ink-2']) {
    const values = [...desk.matchAll(new RegExp(`${name}:([^;]+)`, 'g'))].map(match => match[1]);
    assert.ok(values.length > 0, name);
    for (const value of values) assert.match(value, /^var\(--dsw-/, `${name} 跟随 DSH：${value}`);
  }
});

test('点缀是半透明的线条和水印，不盖文字、不接收点击', () => {
  for (const name of ['.ww-orn-wave', '.ww-orn-spine', '.ww-whale']) {
    const rule = rulesOf(shell).find(item => item.selector === name);
    assert.ok(rule, name);
    assert.match(rule.body, /pointer-events:none/, `${name} 不挡点击`);
  }
  assert.match(tokens, /--ww-orn:light-dark\(#3e9bd6[0-9a-f]{2},#63bdf0[0-9a-f]{2}\)/, '点缀色带透明度');
});

// 2026-10-27 用户反馈：顶栏页签看不出当前在哪个模块，模型世界离得太远不像功能入口，“更多”的三个点淡得看不见，换了皮肤更看不见。
// 同日用户纠正：模型世界本来就该在这一行最右、紧挨着“…”，它不随功能开关增减，并进功能组反而突兀。
test('页签是带图标的一组胶囊，当前页签浮起并带水纹，模型世界单独在最右，“更多”是看得见的方钮', () => {
  assert.deepEqual(declared(shell, '.ww-workbench-header>.ww-tabs', 'background'), ['var(--ww-tint)'], '整组一块浅底，取文字色的淡色，换皮肤也看得见');
  const active = rulesOf(shell).find(rule => rule.selector === '.ww-page .ww-tabs>button[aria-pressed=true]').body;
  assert.match(active, /color:var\(--ww-brand\)/, '当前页签的字用 DSH 品牌色，装了皮肤就是皮肤色');
  assert.match(active, /background:light-dark\(var\(--ww-surface\)/, '浅色主题是浮起的面');
  assert.match(rulesOf(shell).find(rule => rule.selector === '.ww-page .ww-tabs>button[aria-pressed=true]::after').body, /mask:url\("data:image\/svg\+xml/, '当前页签下面有水纹');
  assert.deepEqual(declared(shell, '.ww-tabs .ww-tab-icon', 'display'), ['inline-block', 'none!important'], '图标默认显示，只在页头放不下时收起');
  assert.match(shell, /@container \(max-width:1000px\)\{\.ww-tabs \.ww-tab-icon\{display:none!important\}/);
  assert.deepEqual(declared(shell, '.ww-workbench-header>.ww-tabs:not(.ww-tabs-end)', 'margin-inline-end'), ['auto'], '功能页签靠左，后面的模型世界和“…”被推到最右');
  assert.deepEqual(declared(shell, '.ww-workbench-header>.ww-tabs-end', 'border-color'), ['var(--ww-orn)'], '模型世界自成一个小胶囊，边框是半透明天青色点缀');
  assert.equal(declared(shell, '.ww-workbench-header>.ww-action-menu', 'margin-inline-start').length, 0, '“…”不再自己往右推，免得和模型世界之间被分出空当');
  assert.match(declared(shell, '.ww-page .ww-workbench-header>.ww-action-menu>.ww-icon-button', 'border')[0], /var\(--ww-line-2\)/, '“更多”有边框');
});
