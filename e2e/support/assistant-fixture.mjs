// 小鲸助手功能测试的数据：用插件自己的知识库初始化（和员工第一次打开个人知识走同一条路）建好临时知识库，
// 再放进一批测试笔记，用来测“选中的笔记带进小鲸”和 12 篇的上限。
import fs from 'node:fs';
import path from 'node:path';
import { Vault } from '../../src/vault.js';

/** 测试笔记放在收件箱下自己的文件夹里，名字带用例号，和随包笔记分开。 */
export const noteFolder = '10-收件箱/鲸翼测试-AST08';
export const noteTitle = index => `鲸翼测试-AST08-${String(index).padStart(2, '0')}`;

/** 初始化临时知识库并写入 count 篇测试笔记，返回笔记标题。 */
export async function seedNotes(vault, count) {
  await new Vault(vault).initialize();
  const folder = path.join(vault, ...noteFolder.split('/'));
  fs.mkdirSync(folder, { recursive: true });
  const titles = [];
  for (let index = 1; index <= count; index++) {
    fs.writeFileSync(path.join(folder, `${noteTitle(index)}.md`), `# ${noteTitle(index)}\n\n功能测试用的笔记第 ${index} 篇。\n`);
    titles.push(noteTitle(index));
  }
  return titles;
}
