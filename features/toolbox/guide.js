import { readFileSync } from 'node:fs';
import { utilityTools } from '../../src/utilities/catalog.js';
import { modelFunctions } from '../../src/utilities/model-specs.js';

/**
 * whalewing_toolbox 的 guide：随包技能 whalewing-toolbox 的“一单里怎么做”和“规矩”，加上分类目录；
 * 带 category 时给这个分类里每个功能项的输入、options 和结果。都从目录和用法表生成，新功能项上线就跟着有。
 */
export const functionIds = new Set(utilityTools.flatMap(category => category.functions.map(item => item.id)).filter(id => Object.hasOwn(modelFunctions, id)));

let skillBody;
function skillRules() {
  if (skillBody === undefined) {
    try {
      const text = readFileSync(new URL('../../content/skills/whalewing-toolbox/SKILL.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
      const start = text.indexOf('## 在办公工坊的一单里');
      skillBody = start >= 0 ? text.slice(start).trim() : '';
    } catch { skillBody = ''; }
  }
  return skillBody;
}

const listed = category => category.functions.filter(item => functionIds.has(item.id));

export function guideText(categoryId) {
  if (!categoryId) {
    return [
      skillRules(),
      '## 分类目录（guide 带上分类编号看具体功能项）',
      ...utilityTools.map(category => `- ${category.id}：${category.title}（${listed(category).map(item => item.title).join('、')}）`),
      '暂时做不了：OCR 文字识别；视频压缩和剪切；去背景；HEIC、TIFF、SVG 图片；导出 MP3。',
    ].filter(Boolean).join('\n\n');
  }
  const category = utilityTools.find(item => item.id === categoryId);
  if (!category) return `没有这个分类。分类编号：${utilityTools.map(item => item.id).join('、')}`;
  const lines = [`# ${category.title}（${category.id}）`, '每个功能项：编号 名称 —— 输入；options；做出什么。options 里没写的设置用默认值，不用全写。'];
  for (const item of listed(category)) {
    const spec = modelFunctions[item.id];
    lines.push('', `## ${item.id} ${item.title}`, `- 输入：${spec.inputs}${spec.text ? '（文字写在 text 里）' : ''}`);
    if (spec.options.length) lines.push('- options：', ...spec.options.map(([key, text]) => `  - ${key}：${text}`));
    else lines.push('- options：不用写');
    lines.push(`- 做出：${spec.makes}`);
    if (spec.region === 'employee') lines.push('- 位置你看不到，run 时页面会请员工框好再处理。');
  }
  return lines.join('\n');
}
