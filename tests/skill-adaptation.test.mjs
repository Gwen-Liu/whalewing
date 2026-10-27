import { allSkills } from './feature-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { SkillRegistry } from '@deepseek-ai/dsh-skill';
import { Vault } from '../src/vault.js';
import { SkillLibrary } from '../src/skills.js';
import { WhalewingSkillProvider } from '../src/skill-provider.js';
import { roles } from '../content/roles.js';

// 随包技能 = 鲸翼自写的 whalewing-* 加上来源清单里收录的开源技能。
const bundledSkills = [...['whalewing-check', 'whalewing-clarify', 'whalewing-code-review', 'whalewing-coding', 'whalewing-data-analysis', 'whalewing-debugging', 'whalewing-frontend-design', 'whalewing-knowledge', 'whalewing-news', 'whalewing-plugin-management', 'whalewing-research', 'whalewing-skill-evolution', 'whalewing-slides', 'whalewing-ui-review', 'whalewing-visual', 'whalewing-web-testing', 'whalewing-writing'], ...JSON.parse(await fs.readFile(new URL('../scripts/skill-sources.json', import.meta.url), 'utf8')).map(item => item.name)].sort();

const bundledRoot = fileURLToPath(new URL('../content/skills/', import.meta.url));
async function isolated(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-adapted-skills-'));
  const ctx = new Context(), registry = new SkillRegistry(ctx), providers = [];
  // 先退出宿主发现器再删除本例目录，避免 watcher 仍消费已清理的资源。
  t.after(async () => {
    for (const provider of providers) await provider.dispose();
    await ctx.fiber.dispose();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('whalewing-adapted-skills-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const vault = new Vault(path.join(root, 'vault'));
  const skillRoot = path.join(root, 'dsh', 'skills');
  const library = new SkillLibrary(vault, skillRoot);
  registry.registerProvider(control => {
    const provider = new WhalewingSkillProvider(ctx, control, library, allSkills);
    providers.push(provider);
    return provider;
  });
  return { root, vault, library, registry, skillRoot };
}

test('内置专家默认技能（含收录的开源技能）由目标宿主实际发现并加载，外部方法不增加平行技能入口', async t => {
  const { library, registry } = await isolated(t);
  const expected = (await fs.readdir(bundledRoot, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name).sort();
  assert.deepEqual(expected, bundledSkills);
  for (const name of ['doc-coauthoring', 'internal-comms', 'frontend-design']) assert.ok(!expected.includes(name));
  assert.deepEqual((await registry.list()).map(item => item.name).sort(), expected);
  for (const role of roles) {
    // office 等宿主自带技能由 DSH 提供，这里只核对随包技能。
    for (const name of role.skills.filter(name => name !== 'office')) {
      const loaded = await registry.get(name);
      const source = await fs.readFile(path.join(bundledRoot, name, 'SKILL.md'), 'utf8');
      assert.ok(loaded, `${role.id}: ${name}`);
      assert.equal(loaded.content, library.parseText(source).body.trim());
      assert.equal(loaded.source, 'bundled');
      assert.equal(loaded.resourceBase.kind, 'directory');
      assert.equal(path.resolve(loaded.resourceBase.path), path.resolve(library.builtinDir, name));
    }
  }
});

test('新版不再随包的系统技能从系统区撤下，员工改过的覆盖版连同原件保留', async t => {
  const { root, vault, skillRoot } = await isolated(t);
  const oldRoot = path.join(root, 'previous-package');
  for (const name of ['whalewing-retired', 'whalewing-retired-edited']) {
    await fs.mkdir(path.join(oldRoot, name), { recursive: true });
    await fs.writeFile(path.join(oldRoot, name, 'SKILL.md'), `---
name: ${name}
description: 合成旧包里的专业技能
---
旧包原件。
`);
  }
  const previous = new SkillLibrary(vault, skillRoot, { bundledRoot: oldRoot });
  await previous.ensureReady();
  const id = '.system/whalewing/builtin/whalewing-retired-edited/SKILL.md';
  const original = (await previous.manage({ action: 'read', id })).entry;
  await previous.manage({ action: 'update', id, expectedHash: original.hash, content: original.content.replace('旧包原件。', '员工改过的方法。') });
  const next = new SkillLibrary(vault, skillRoot);
  await next.ensureReady();
  const builtin = await fs.readdir(next.builtinDir);
  assert.ok(!builtin.includes('whalewing-retired'), '没人改过的旧系统技能撤下');
  assert.ok(builtin.includes('whalewing-retired-edited'), '有覆盖版时原件保留');
  assert.ok(builtin.includes('whalewing-check'));
  assert.match((await fs.readFile(path.join(skillRoot, 'whalewing-retired-edited', 'SKILL.md'), 'utf8')), /员工改过的方法/);
});

test('包中原件更新后系统区换成新版，员工的覆盖版原样保留、照常可编辑，重置回到新原件', async t => {
  const { root, vault, skillRoot } = await isolated(t);
  const name = 'whalewing-check', oldRoot = path.join(root, 'previous-package');
  const oldBody = `---\nname: ${name}\ndescription: 合成旧包的文档方法\n---\n员工此前安装的原件。\n`;
  await fs.mkdir(path.join(oldRoot, name), { recursive: true });
  await fs.writeFile(path.join(oldRoot, name, 'SKILL.md'), oldBody);
  const previous = new SkillLibrary(vault, skillRoot, { bundledRoot: oldRoot });
  await previous.ensureReady();
  const id = `.system/whalewing/builtin/${name}/SKILL.md`;
  const original = (await previous.manage({ action: 'read', id })).entry;
  const edited = await previous.manage({ action: 'update', id, expectedHash: original.hash, content: oldBody.replace('员工此前安装的原件。', '员工明确保存的自定义方法。') });
  const personalBefore = await previous.files.snapshot(name);
  const newBody = await fs.readFile(path.join(bundledRoot, name, 'SKILL.md'), 'utf8');
  assert.notEqual(oldBody, newBody);
  const next = new SkillLibrary(vault, skillRoot);
  await next.ensureReady();
  // 系统区换成新包里的原件；员工覆盖版的字节一个不动。
  const base = (await next.manage({ action: 'read', id })).entry;
  assert.equal(base.content, newBody);
  assert.notEqual(base.hash, original.hash);
  assert.deepEqual(await next.files.snapshot(name), personalBefore);
  // 覆盖版照常是可编辑、可重置的个人修改，只标出原件已更新，不当成要修复的技能。
  const current = (await next.manage({ action: 'read', id: edited.entry.id })).entry;
  assert.equal(current.content, edited.entry.content);
  assert.equal(current.origin, 'override');
  assert.equal(current.baseHash, base.hash);
  assert.equal(current.baseUpdated, true);
  assert.equal(current.issue, undefined);
  assert.deepEqual(current.actions, ['read', 'update', 'reset']);
  const listed = (await next.manage({ action: 'list' })).entries.find(entry => entry.id === current.id);
  assert.equal(listed.baseUpdated, true);
  assert.equal(listed.issue, undefined);
  // 再次启动时原件已是新版，不重复安装。
  const installed = await next.files.snapshot(`.system/whalewing/builtin/${name}`);
  const again = new SkillLibrary(vault, skillRoot);
  await again.ensureReady();
  assert.deepEqual(await again.files.snapshot(`.system/whalewing/builtin/${name}`), installed);
  // 员工改覆盖版时按新原件重记指纹；重置后回到新原件。
  const updated = (await again.manage({ action: 'update', id: current.id, expectedHash: current.hash, expectedBaseHash: current.baseHash, content: current.content.replace('员工明确保存的自定义方法。', '员工再次确认的方法。') })).entry;
  assert.equal(updated.baseUpdated, undefined);
  assert.match(updated.content, /员工再次确认的方法/u);
  await again.manage({ action: 'reset', id: updated.id, expectedHash: updated.hash, expectedBaseHash: updated.baseHash });
  assert.equal((await again.manage({ action: 'read', id: updated.id })).entry, null);
  assert.equal((await again.manage({ action: 'read', id })).entry.content, newBody);
});
