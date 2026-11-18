import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { skillTitles, skillTitle } from '../src/skill-titles.js';

// 2026-11-18 走查：技能中心里随包技能全是英文短名。每个随包技能都要有中文显示名，对照表里也不留已经删掉的技能。
test('每个随包技能都有中文显示名，对照表里没有多余的', () => {
  const bundled = readdirSync(new URL('../content/skills/', import.meta.url), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.deepEqual(Object.keys(skillTitles).sort(), bundled);
  for (const [name, title] of Object.entries(skillTitles)) assert.match(title, /[一-鿿]/, `${name} 的显示名要有中文`);
  assert.equal(new Set(Object.values(skillTitles)).size, bundled.length, '显示名不重复');
  assert.equal(skillTitle('ab-test-analysis'), 'A/B 测试分析');
  assert.equal(skillTitle('my-own-skill'), 'my-own-skill', '不是随包技能的照原名');
});
