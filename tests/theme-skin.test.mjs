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
  for (const name of ['--yj-ink', '--yj-surface', '--yj-surface-2', '--yj-line', '--yj-brand', '--yj-fill', '--yj-on-fill']) {
    const value = new RegExp(`${name}:([^;]+);`).exec(tokens)?.[1];
    assert.ok(value?.startsWith('var(--dsw-'), `${name} 来自 DSH 变量：${value}`);
  }
  assert.match(tokens, /\.yj-page \*[^{]*\{corner-shape:round\}/, '圆点和头像不被 DSH 的超椭圆规则画成方块');
});

test('主要卡片的底色都来自变量，不写死颜色挡住皮肤', () => {
  const surfaces = [[css, '.yj-page .yj-card'], [css, '.yj-desk-card'], [css, '.yj-pin-band'], [css, '.yj-ai-tile'], [css, '.yj-cards .yj-pin-choice'], [worldViewCss, '.yj-mw-model-row']];
  for (const [text, selector] of surfaces) {
    const values = [...declared(text, selector, 'background'), ...declared(text, selector, 'background-color')];
    assert.ok(values.length > 0, `${selector} 有底色声明`);
    for (const value of values) assert.match(value, /^(var\(--(dsw|yj)-|transparent$)/, `${selector} 的底色 ${value} 不是写死的颜色`);
  }
  // 书房的纸、笺、界、墨跟随 DSH：知识卡片页上不再有写死的暖纸色（阅读器是盖在页面上的弹窗，书页保留纸色）。
  const desk = rulesOf(css).filter(rule => rule.selector === '.yj-cards').map(rule => rule.body).join(';');
  for (const name of ['--yj-paper', '--yj-sheet', '--yj-rule', '--yj-ink', '--yj-ink-2']) {
    const values = [...desk.matchAll(new RegExp(`${name}:([^;]+)`, 'g'))].map(match => match[1]);
    assert.ok(values.length > 0, name);
    for (const value of values) assert.match(value, /^var\(--dsw-/, `${name} 跟随 DSH：${value}`);
  }
});

test('点缀是半透明的线条和水印，不盖文字、不接收点击', () => {
  for (const name of ['.yj-orn-wave', '.yj-orn-spine', '.yj-whale']) {
    const rule = rulesOf(shell).find(item => item.selector === name);
    assert.ok(rule, name);
    assert.match(rule.body, /pointer-events:none/, `${name} 不挡点击`);
  }
  assert.match(tokens, /--yj-orn:light-dark\(#3e9bd6[0-9a-f]{2},#63bdf0[0-9a-f]{2}\)/, '点缀色带透明度');
});
