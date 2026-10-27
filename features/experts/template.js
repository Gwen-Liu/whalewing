/**
 * 专家模板：开头用 --- 包住名称、一句话介绍、技能和头像，下面的正文就是提示词。
 * 内置专家、随包模板库和员工导入的模板文件都用这一种写法，Host 与浏览器共用这一个解析器。
 * 只接受这几个字段的简单写法，不引入完整的 YAML 解析，免得导入文件带进意料之外的结构。
 *
 * ---
 * name: 售前专家
 * description: 招投标响应、客户方案和汇报材料。
 * skills:
 *   - whalewing-writing
 * avatar: presales
 * ---
 * # 售前专家
 * ……
 */
export const templateLimits = Object.freeze({ chars: 65536, name: 40, description: 240, prompt: 32000, skills: 40 });
const keys = ['name', 'description', 'skills', 'avatar'];
const skillName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function templateError(message) { return Object.assign(new Error(`专家模板格式不对：${message}`), { code: 'EXPERT_TEMPLATE' }); }

// 值可以用一对引号包起来（例如介绍里带冒号时）；其余原样保留。
const unquote = value => /^(["']).*\1$/u.test(value) ? value.slice(1, -1) : value;

export function parseExpertTemplate(text) {
  if (typeof text !== 'string' || !text.trim()) throw templateError('文件是空的');
  if (text.length > templateLimits.chars) throw templateError(`超过 ${templateLimits.chars} 个字符`);
  const source = text.replace(/^﻿/u, '').replace(/\r\n?/gu, '\n');
  const match = source.match(/^---\n([^]*?)\n---(?:\n([^]*))?$/u);
  if (!match) throw templateError('开头要用两行 --- 包住名称、介绍和技能');
  const fields = {};
  let list = null;
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const item = line.match(/^\s+-\s+(\S.*)$/u);
    if (item) {
      if (!list) throw templateError(`“${line.trim()}”不在 skills: 下面`);
      list.push(unquote(item[1].trim()));
      continue;
    }
    const pair = line.match(/^([a-z]+):(.*)$/u);
    if (!pair || !keys.includes(pair[1])) throw templateError(`看不懂这一行：${line.trim()}（只认 ${keys.join('、')}）`);
    const [, key, raw] = pair;
    if (Object.hasOwn(fields, key)) throw templateError(`${key} 写了两次`);
    if (key === 'skills') {
      if (raw.trim()) throw templateError('skills 要逐行写成“  - 技能名”');
      fields.skills = list = [];
    } else { fields[key] = unquote(raw.trim()); list = null; }
  }
  const prompt = (match[2] ?? '').trim();
  const { name = '', description = '', skills = [], avatar } = fields;
  if (!name || [...name].length > templateLimits.name) throw templateError(`name 需要 1 到 ${templateLimits.name} 个字`);
  if (!description || [...description].length > templateLimits.description) throw templateError(`description 需要 1 到 ${templateLimits.description} 个字`);
  if (!prompt || prompt.length > templateLimits.prompt) throw templateError(`正文（提示词）需要 1 到 ${templateLimits.prompt} 个字`);
  if (skills.length > templateLimits.skills) throw templateError(`技能最多 ${templateLimits.skills} 项`);
  for (const skill of skills) if (!skillName.test(skill) || skill.length > 100) throw templateError(`技能名“${skill}”只能用小写字母、数字和连字符`);
  if (new Set(skills).size !== skills.length) throw templateError('技能有重复');
  if (avatar !== undefined && !/^[a-z0-9-]{1,40}$/u.test(avatar)) throw templateError('avatar 只能写头像标识（例如 preset-01）');
  return { name, description, prompt, skills, avatar: avatar || null };
}
