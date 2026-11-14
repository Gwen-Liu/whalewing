import * as fs from 'node:fs/promises';
import path from 'node:path';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { abort, fail } from './vault.js';

// DSH 自己还会从两处发现技能，鲸翼的“个人”（~/.dsh/skills）之外要一起列出来（2026-11-09 用户要的“按项目分类”，照 Codex）：
// ① 共用目录 ~/.agents/skills（DSH、Codex 等 AI 工具共读；可用 DSH_AGENTS_HOME 改位置）；
// ② 每个工作区所在项目里的 .dsh/skills、.agents/skills（项目 = 往上找到带 .git 的那层，没有就是工作区本身），只在那个项目里干活时生效。
// 发现规则直接用 DSH 的 FileSystemSkillProvider，和 DSH 实际加载的一致；这些技能鲸翼只读。
const maxBytes = 1024 * 1024;

/** 工作区在 DSH 侧栏里的名字：有标题用标题，没有就用文件夹名。 */
export const workspaceTitle = workspace => (typeof workspace.title === 'string' && workspace.title.trim()) || String(workspace.path ?? '').replace(/[/\\]+$/, '').split(/[/\\]/).at(-1) || String(workspace.path ?? '');

async function projectRoot(cwd) {
  let current = path.resolve(cwd);
  for (;;) {
    if (await fs.stat(path.join(current, '.git')).then(() => true, () => false)) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(cwd);
    current = parent;
  }
}

/**
 * 列出共用目录和各项目的技能。workspaces 是 DSH 工作区（path、title）；返回的 scopes 里只放有技能的。
 * allowed 记下这次能读的 SKILL.md 路径，读正文时只认这些。
 */
export async function listScopedSkills(ctx, { dshHome, agentsHome, workspaces, signal, createProvider }) {
  abort(signal);
  const lifecycle = new AbortController();
  const config = { providerName: 'whalewing-scopes', includeDefaultRoots: true, ...(dshHome ? { dshHome } : {}), ...(agentsHome ? { agentsHome } : {}), watch: false, watchFollowSymlinks: false };
  const provider = createProvider ? createProvider(config, lifecycle.signal) : new FileSystemSkillProvider(ctx, { signal: lifecycle.signal, invalidate() {} }, config);
  const candidatesOf = value => Array.isArray(value) ? value : value?.candidates ?? [];
  const entry = candidate => ({ name: String(candidate.name), description: String(candidate.description ?? ''), path: path.resolve(candidate.locator?.path ?? candidate.path ?? '') });
  const scopes = [], allowed = new Set();
  try {
    const shared = candidatesOf(await provider.list({ signal })).filter(candidate => candidate.source === 'user-agents').map(entry);
    if (shared.length) scopes.push({ id: 'agents', kind: 'agents', label: '共用', root: provider.agentsHome ? path.join(provider.agentsHome, 'skills') : path.dirname(path.dirname(shared[0].path)), skills: shared });
    const projects = new Map();
    for (const workspace of workspaces) {
      abort(signal);
      if (typeof workspace?.path !== 'string' || !path.isAbsolute(workspace.path)) continue;
      const root = await projectRoot(workspace.path);
      if (projects.has(root)) continue;
      const skills = candidatesOf(await provider.list({ cwd: workspace.path, signal })).filter(candidate => String(candidate.source).startsWith('project-')).map(entry);
      projects.set(root, true);
      if (skills.length) scopes.push({ id: `project:${root}`, kind: 'project', label: root === path.resolve(workspace.path) ? workspaceTitle(workspace) : path.basename(root), root, skills });
    }
  } finally { lifecycle.abort(); await provider.dispose?.(); }
  for (const scope of scopes) {
    scope.skills.sort((a, b) => a.name.localeCompare(b.name));
    for (const skill of scope.skills) allowed.add(skill.path);
  }
  return { scopes, allowed };
}

/** 读共用目录或项目里一项技能的正文：只读这次列出来的 SKILL.md，别的路径一律不读。 */
export async function readScopedSkill(file, allowed, signal) {
  abort(signal);
  const target = path.resolve(String(file ?? ''));
  if (!allowed?.has(target)) fail('SKILL_SCOPE', '这项技能刚换了位置或删掉了，请刷新后再打开');
  const info = await fs.stat(target).catch(() => null);
  if (!info?.isFile()) fail('SKILL_SCOPE', '这项技能的文件找不到了，请刷新');
  if (info.size > maxBytes) fail('SKILL_SIZE', '这项技能的 SKILL.md 太大，鲸翼不显示（最多 1 MB）');
  return fs.readFile(target, 'utf8');
}
