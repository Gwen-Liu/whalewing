import { readFileSync, readdirSync } from 'node:fs';
import { parseExpertTemplate } from '../features/experts/template.js';

// 每位专家是一份专家模板文件（格式见 features/experts/template.js）：开头写名称、介绍、默认技能和头像，正文是提示词。
// 内置专家放在 content/experts，随包模板库放在 content/expert-templates，员工也可以导入同样格式的文件新建专家。
// 共同部分（common.md）只写一份，所有专家共用；正文按“使命、边界、底线、流程、要点、模板、自检、先加载再动手、交付”
// 组织，结构参考了社区专家库（如 agency-agents）的通行写法，内容为鲸翼自写。
// 默认技能里，三项基础技能（知识、技能提炼、独立检查）每位都有；专业技能是鲸翼自写的 whalewing-* 和收录的开源技能
// （来源见 scripts/skill-sources.json）；office 来自 DSH 自带的 Office 技能，宿主没有时跳过。
const read = (folder, name) => readFileSync(new URL(`./${folder}/${name}.md`, import.meta.url), 'utf8');
export const commonPrompt = read('experts', 'common').trimEnd();

const builtinIds = ['manager', 'requirements', 'design', 'development', 'testing', 'operations', 'data', 'research', 'writing', 'marketing'];
export const roles = builtinIds.map(id => {
  const { name, description, prompt, skills } = parseExpertTemplate(read('experts', id));
  return { id, name, description, prompt, skills };
});

// 2026-10-23 起改为模板的原内置专家：员工改过的转成自定义专家继续可用，没改过的不再显示，需要时从模板创建。
export const retiredBuiltinIds = Object.freeze(['presales', 'implementation']);

// 随包模板库按名称拼音排序，创建出来的是员工的自定义专家，可以随意修改和删除。
const collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin');
export const expertTemplates = readdirSync(new URL('./expert-templates/', import.meta.url))
  .filter(file => file.endsWith('.md'))
  .map(file => ({ id: file.slice(0, -3), ...parseExpertTemplate(read('expert-templates', file.slice(0, -3))) }))
  .sort((a, b) => collator.compare(a.name, b.name));
