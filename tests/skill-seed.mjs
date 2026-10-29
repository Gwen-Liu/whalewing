// 测试里每建一个新技能库，产品都要把随包的几十个技能完整装一遍（逐个写入、两次回读核对），
// 机器空闲时约 1.8 秒，全量并行时被拖到十几秒，一轮单元测试要装四十多次。
// 这里每个测试进程只真装一次（走产品自己的安装流程），之后新建的库先复制这份装好的结果；
// 产品启动时核对每个技能的指纹，一致就不再重装（约 0.45 秒）。要测安装本身的用例不要调用它。
import fs from 'node:fs/promises';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Vault } from '../src/vault.js';
import { SkillLibrary } from '../src/skills.js';
import { skillArea } from '../src/skill-files.js';

let installed;

/** 把随包技能预先放进 skillRoot 的系统区（复制本进程装好的那一份）。 */
export async function seedBundledSkills(skillRoot) {
  installed ??= (async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-skill-seed-'));
    process.once('exit', () => rmSync(root, { recursive: true, force: true }));
    await new SkillLibrary(new Vault(path.join(root, 'vault')), path.join(root, 'skills')).ensureReady();
    return path.join(root, 'skills', ...skillArea.split('/'), 'builtin');
  })();
  await fs.cp(await installed, path.join(skillRoot, ...skillArea.split('/'), 'builtin'), { recursive: true });
}
