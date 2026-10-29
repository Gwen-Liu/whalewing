// 个人知识的测试数据：几篇带链接的笔记，按员工在 Obsidian 里写笔记那样直接放进知识库目录。
// 知识库只能在空目录里初始化（插件发现目录里已有内容会拒绝建库，不覆盖），所以这些笔记要等插件第一次建好库之后再写。
import fs from 'node:fs';
import path from 'node:path';

/** 十个一级区（需求§个人知识·初始化得到什么）。 */
export const zones = ['00-系统', '10-收件箱', '20-项目', '30-领域', '40-知识', '50-来源', '60-时间线', '70-作品', '80-外部索引', '90-归档'];

/** 一篇合规笔记：五个通用属性在前，可加别的属性；H1 和文件名一致。 */
export function noteText(title, body, { type = 'atomic', status = 'seedling', date = '2026-10-01', extra = '' } = {}) {
  return `---\ntype: ${type}\nstatus: ${status}\ncreated: ${date}\nupdated: ${date}\naliases: []\n${extra}---\n\n# ${title}\n\n${body}\n`;
}

const filler = (label, count) => Array.from({ length: count }, (_, i) => `${label}第 ${i + 1} 段：这一段只是填充正文，把页面撑长，用来检查目录跳转、滚动定位和反链定位。`.repeat(2)).join('\n\n');

/**
 * 夹具笔记，路径相对知识库根目录。
 * - 链接：属性 source 链到知识库首页；正文两个二级标题，链到知识库规则，并两次链到不存在的“鲸翼测试-不存在”。
 * - 引用：两行链到“鲸翼测试-链接”，很靠后的一行链到知识库首页。
 * - 属性缺失：属性 source 链到不存在的笔记。
 * - 冲突：普通笔记，用来测别处改过文件后的保存。
 */
export const fixtures = {
  link: {
    path: '40-知识/鲸翼测试-链接.md', title: '鲸翼测试-链接',
    text: noteText('鲸翼测试-链接', `导语：这篇笔记用来检查目录、反链和出链。\n\n## 第一节 背景\n\n${filler('背景', 10)}\n\n## 第二节 链接\n\n正文里引用 [[知识库规则]]，还有一篇还没写的 [[鲸翼测试-不存在]]。\n\n${filler('链接', 10)}\n\n再提一次 [[鲸翼测试-不存在]]。`, { extra: 'source: "[[知识库首页]]"\n' }),
  },
  refer: {
    path: '10-收件箱/鲸翼测试-引用.md', title: '鲸翼测试-引用',
    text: noteText('鲸翼测试-引用', `第一次提到 [[鲸翼测试-链接]]。\n\n第二次提到 [[鲸翼测试-链接]]。\n\n${filler('引用', 14)}\n\n最后回到 [[知识库首页]] 查看全部入口。`, { type: 'capture', status: 'inbox' }),
  },
  propMissing: {
    path: '40-知识/鲸翼测试-属性缺失.md', title: '鲸翼测试-属性缺失',
    text: noteText('鲸翼测试-属性缺失', '属性里的来源还没写。', { extra: 'source: "[[鲸翼测试-属性目标缺失]]"\n' }),
  },
  conflict: {
    path: '40-知识/鲸翼测试-冲突.md', title: '鲸翼测试-冲突',
    text: noteText('鲸翼测试-冲突', '第一行：员工会在编辑区改这一行。\n\n第二行：外部编辑器会改这一行。'),
  },
};

/** 写一篇夹具笔记（库已建好之后）。 */
export function writeFixture(vault, fixture) {
  const file = path.join(vault, ...fixture.path.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, fixture.text);
  return file;
}

/** 知识库里的全部 Markdown（十区内和根目录，跳过以点开头的内部目录），返回库内相对路径。 */
export function vaultNotes(vault) {
  const found = [];
  const walk = relative => {
    for (const entry of fs.readdirSync(path.join(vault, ...relative.split('/')), { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (/\.md$/i.test(entry.name)) found.push(child);
    }
  };
  for (const zone of zones) if (fs.existsSync(path.join(vault, zone))) walk(zone);
  for (const entry of fs.readdirSync(vault, { withFileTypes: true })) if (entry.isFile() && /\.md$/i.test(entry.name)) found.push(entry.name);
  return found.sort();
}

/** 笔记标题：文件名去掉 .md。 */
export const titleOf = relative => relative.split('/').at(-1).replace(/\.md$/i, '');

/** 文本里含某个链接的行号（从 1 开始，和编辑器里看到的一样）。 */
export const linesWith = (text, token) => text.split('\n').flatMap((line, i) => line.includes(token) ? [i + 1] : []);
