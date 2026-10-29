// 技能成长的测试数据：技能目录在临时 DSH 的 DSH_HOME/skills（员工电脑上就是 ~/.dsh/skills），
// 随包系统技能装在其中的 .system/whalewing/builtin，员工自己的技能和企业技能包直接放在下一层。
import fs from 'node:fs';
import path from 'node:path';
import { pluginRoot } from './dsh.mjs';

/** 随插件分发的系统技能目录（插件源码 content/skills）。 */
export const bundledRoot = path.join(pluginRoot, 'content', 'skills');
export const bundledSkills = fs.readdirSync(bundledRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(bundledRoot, entry.name, 'SKILL.md'))).map(entry => entry.name).sort();

export const skillsRoot = home => path.join(home, 'skills');
/** 装进技能目录后的系统原件。 */
export const builtinFile = (home, name) => path.join(skillsRoot(home), '.system', 'whalewing', 'builtin', name, 'SKILL.md');
/** 员工的技能（也是编辑系统技能生成的个人修改的位置）。 */
export const userSkillFile = (home, name) => path.join(skillsRoot(home), name, 'SKILL.md');

/** 一份合规的技能文件：开头写名称和用途，正文写做法。 */
export const skillText = (name, description, body = '# 步骤\n\n1. 按清单逐项核对。\n') => `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;

/** 测试前放进技能目录的数据：企业技能包（下一层）、再深一层的目录、一项员工自己的技能。 */
export const seeded = Object.freeze({
  company: { name: 'ww-e2e-company-x', description: '鲸翼测试企业技能包：整理合同条款时使用' },
  nested: { dir: 'ww-e2e-pack', name: 'inner', description: '鲸翼测试再深一层的技能，不应被认出来' },
  mine: { name: 'ww-e2e-skl09', description: '鲸翼测试员工技能：写周报时使用' },
});

function writeSkill(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }

export function seedSkills(home) {
  const root = skillsRoot(home);
  writeSkill(path.join(root, seeded.company.name, 'SKILL.md'), skillText(seeded.company.name, seeded.company.description));
  writeSkill(path.join(root, seeded.nested.dir, seeded.nested.name, 'SKILL.md'), skillText(seeded.nested.name, seeded.nested.description));
  writeSkill(path.join(root, seeded.mine.name, 'SKILL.md'), skillText(seeded.mine.name, seeded.mine.description));
}

/** 技能目录下一层里能被认出的员工技能：带 SKILL.md 的目录，或直接放着的 .md 文件（系统区 .system 除外）。 */
export function userSkills(home) {
  const root = skillsRoot(home);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.name !== '.system')
    .filter(entry => entry.isDirectory() ? fs.existsSync(path.join(root, entry.name, 'SKILL.md')) : entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name).sort();
}

/** 临时 DSH 现有的会话 id（看新增技能是不是不用先开会话）。 */
export function sessionIds(home) {
  const file = path.join(home, 'storages', 'workspace.json');
  if (!fs.existsSync(file)) return [];
  return Object.values(JSON.parse(fs.readFileSync(file, 'utf8')).tables?.workspaces ?? {}).flatMap(workspace => workspace.sessionIds ?? []).sort();
}

/** 文本统一成 \n 换行再比较。 */
export const normalized = text => text.replace(/\r\n/g, '\n').trim();
