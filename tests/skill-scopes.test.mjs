import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { listScopedSkills, readScopedSkill, workspaceTitle } from '../src/skill-scopes.js';
import { skillLibraryContract } from '../features/skills/contract.js';

const contract = skillLibraryContract(z);
const skill = (name, description = `${name} 的说明`) => `---\nname: ${name}\ndescription: ${description}\n---\n\n${name} 的做法。\n`;
async function write(file, text) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); }

// 2026-11-09 用户要照 Codex 按项目分类：DSH 还会从共用目录和各项目里发现技能，鲸翼一起列出来（只读）。
test('共用目录和各项目的技能：按 DSH 的规则发现，子文件夹工作区归到带 .git 的项目，同一项目只列一次，没技能的项目不列', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-scopes-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dshHome = path.join(root, 'dsh'), agentsHome = path.join(root, 'agents');
  await write(path.join(agentsHome, 'skills', 'shared-notes', 'SKILL.md'), skill('shared-notes', '共用目录里的技能'));
  await write(path.join(dshHome, 'skills', 'personal-only', 'SKILL.md'), skill('personal-only'));
  const blog = path.join(root, 'blog');
  await fs.mkdir(path.join(blog, '.git'), { recursive: true });
  await write(path.join(blog, '.agents', 'skills', 'blog-helper', 'SKILL.md'), skill('blog-helper', '整理博客草稿'));
  await write(path.join(blog, '.dsh', 'skills', 'blog-publish', 'SKILL.md'), skill('blog-publish'));
  await write(path.join(blog, '.agents', 'skills', 'broken', 'SKILL.md'), '没有属性区');
  await fs.mkdir(path.join(blog, 'posts'), { recursive: true });
  const empty = path.join(root, 'empty');
  await fs.mkdir(empty, { recursive: true });
  const ctx = { logger: { warn() {} }, get() {} };
  const workspaces = [{ path: path.join(blog, 'posts') }, { path: blog, title: '博客' }, { path: empty }, { path: 'relative/ignored' }];
  const { scopes, allowed } = await listScopedSkills(ctx, { dshHome, agentsHome, workspaces, signal: AbortSignal.timeout(10000) });
  assert.deepEqual(scopes.map(scope => [scope.kind, scope.label, scope.skills.map(item => item.name)]), [
    ['agents', '共用', ['shared-notes']],
    ['project', 'blog', ['blog-helper', 'blog-publish']],
  ], '~/.dsh/skills 的是鲸翼“个人”，不在这里重复；坏的 SKILL.md 和 DSH 一样跳过');
  assert.equal(scopes[0].root, path.join(agentsHome, 'skills'));
  assert.equal(scopes[1].root, blog);
  contract.result.parse({ scopes });
  const helper = scopes[1].skills[0].path;
  assert.equal(await readScopedSkill(helper, allowed), skill('blog-helper', '整理博客草稿'));
  await assert.rejects(readScopedSkill(path.join(dshHome, 'skills', 'personal-only', 'SKILL.md'), allowed), { code: 'SKILL_SCOPE' }, '没列出来的路径不读');
  await assert.rejects(readScopedSkill(path.join(blog, '..', 'blog', '.agents', 'skills', 'nope', 'SKILL.md'), allowed), { code: 'SKILL_SCOPE' });
  assert.equal(workspaceTitle({ path: 'C:\\work\\APICheck\\' }), 'APICheck');
  assert.equal(workspaceTitle({ path: '/x/y', title: '鲸翼定时任务' }), '鲸翼定时任务');
});
