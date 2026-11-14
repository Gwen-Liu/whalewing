import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Vault, validateNote } from '../src/vault.js';
import { ExpertMemory, memoryFileName, memoryNote, appendEntry, replaceSection, sectionLines, aboutMePath, limits, splitDate } from '../features/experts/memory.js';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-memory-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const vault = new Vault(path.join(directory, 'vault'));
  // 和核心服务一样：第一次写入时才建库。
  const core = { vault, core: { ensureReady: signal => vault.initialize(signal) } };
  return { vault, memory: new ExpertMemory(core) };
}
const read = (vault, relative) => fs.readFile(path.join(vault.root, ...relative.split('/')), 'utf8');

test('专家记忆骨架是一篇合规的笔记，文件名去掉 Windows 不认的字符', () => {
  const expert = { id: 'custom-1', name: 'DSH 观察员' };
  assert.equal(memoryFileName(expert), '00-系统/专家记忆/DSH 观察员.md');
  assert.equal(memoryFileName({ id: 'x', name: 'a/b:c?' }), '00-系统/专家记忆/a-b-c-.md');
  assert.equal(memoryFileName({ id: 'custom-2', name: '...' }), '00-系统/专家记忆/custom-2.md');
  const data = validateNote(memoryNote(expert, '2026-11-08'), memoryFileName(expert));
  assert.equal(data.expert, 'custom-1');
  assert.equal(data.type, 'area');
});

test('往空的一节、已有内容的一节和缺的一节里加条目，节与节之间留空行', () => {
  const base = memoryNote({ id: 'development', name: '研发专家' }, '2026-11-08');
  const once = appendEntry(base, '规矩', '- 2026-11-08 前端项目用 pnpm');
  assert.match(once, /## 规矩\n\n- 2026-11-08 前端项目用 pnpm\n\n## 进度/);
  const twice = appendEntry(once, '规矩', '- 2026-11-08 提交信息不加署名');
  assert.deepEqual(sectionLines(twice, '规矩').lines, ['- 2026-11-08 前端项目用 pnpm', '- 2026-11-08 提交信息不加署名']);
  const progress = appendEntry(twice, '进度', '- 2026-11-08 迁移做到第二步');
  assert.match(progress, /## 进度\n\n- 2026-11-08 迁移做到第二步\n$/);
  const missing = appendEntry('---\ntype: area\n---\n\n# x\n', '进度', '- a');
  assert.match(missing, /# x\n\n## 进度\n\n- a\n$/);
  const replaced = replaceSection(twice, '规矩', ['- 2026-11-08 只留一条']);
  assert.deepEqual(sectionLines(replaced, '规矩').lines, ['- 2026-11-08 只留一条']);
  assert.match(replaced, /## 规矩\n\n- 2026-11-08 只留一条\n\n## 进度/);
});

test('条目开头自带的日期拆出来，统一写法；不是日期的不动', () => {
  assert.deepEqual(splitDate('2026-11-08 以后用 pnpm'), { date: '2026-11-08', body: '以后用 pnpm' });
  assert.deepEqual(splitDate('2026年11月8日：结论先说'), { date: '2026-11-08', body: '结论先说' });
  assert.deepEqual(splitDate('- 2026/11/8，看到新版'), { date: '2026-11-08', body: '看到新版' });
  assert.deepEqual(splitDate('20261108 不算日期'), { date: null, body: '20261108 不算日期' });
  assert.deepEqual(splitDate('2026-11-081 也不算'), { date: null, body: '2026-11-081 也不算' });
});

test('新记一条时去掉正文里自带的日期，整节重写时保留原日期并统一写法', async t => {
  const { vault, memory } = await fixture(t);
  const expert = { id: 'news', name: '新闻专家' };
  assert.equal((await memory.add(expert, '进度', '2026-11-01：已看到 0.2.2-rc.1')).entry, `- ${today} 已看到 0.2.2-rc.1`);
  assert.equal((await memory.add(expert, '进度', '- 记一条带横线的')).entry, `- ${today} 记一条带横线的`);
  await assert.rejects(memory.add(expert, '进度', '2026-11-08'), { code: 'MEMORY_INPUT' });
  const written = await memory.rewrite(expert, '进度', ['2026年11月1日：旧的', '- 2026-11-02 第二条', '新的']);
  assert.deepEqual(sectionLines(await read(vault, written.path), '进度').lines, ['- 2026-11-01 旧的', '- 2026-11-02 第二条', `- ${today} 新的`]);
});

test('第一次记忆时建库、建笔记，之后接着加、整节重写，并随专家说明读出来', async t => {
  const { vault, memory } = await fixture(t);
  const expert = { id: 'development', name: '研发专家' };
  assert.deepEqual(await memory.context(expert), { path: '00-系统/专家记忆/研发专家.md', text: '', empty: true });
  assert.equal(await memory.globalContext(), null);

  const first = await memory.add(expert, '规矩', '前端项目都用 pnpm，不用 npm 装包');
  assert.equal(first.path, '00-系统/专家记忆/研发专家.md');
  assert.equal(first.entry, `- ${today} 前端项目都用 pnpm，不用 npm 装包`);
  await memory.add(expert, '进度', '鲸翼迁移做到第二步');
  const context = await memory.context(expert);
  assert.equal(context.empty, false);
  assert.match(context.text, new RegExp(`## 规矩\\n- ${today} 前端项目都用 pnpm`));
  assert.match(context.text, /## 进度\n- \d{4}-\d{2}-\d{2} 鲸翼迁移做到第二步/);

  await memory.rewrite(expert, '进度', ['2026-11-01 旧的保留原日期', '新的一条']);
  const content = await read(vault, first.path);
  assert.deepEqual(sectionLines(content, '进度').lines, ['- 2026-11-01 旧的保留原日期', `- ${today} 新的一条`]);
  validateNote(content, first.path);
  await memory.rewrite(expert, '进度', []);
  assert.equal(sectionLines(await read(vault, first.path), '进度').lines.length, 0);

  await assert.rejects(memory.add(expert, '杂项', 'x'), { code: 'MEMORY_INPUT' });
  await assert.rejects(memory.add(expert, '规矩', ' '), { code: 'MEMORY_INPUT' });
  await assert.rejects(memory.add(expert, '规矩', '长'.repeat(limits.entry + 1)), { code: 'MEMORY_INPUT' });
});

test('专家改名后记忆跟着改名，旧名进别名；靠属性认专家，不靠文件名', async t => {
  const { vault, memory } = await fixture(t);
  await memory.add({ id: 'custom-a', name: '新闻追踪' }, '规矩', '只看一手来源');
  const renamed = { id: 'custom-a', name: 'DSH 观察员' };
  // 没写入之前，改了名也照样读得到原来那篇。
  assert.equal((await memory.context(renamed)).path, '00-系统/专家记忆/新闻追踪.md');
  const result = await memory.add(renamed, '进度', '已知最新版本 0.2.2-rc.1');
  assert.equal(result.path, '00-系统/专家记忆/DSH 观察员.md');
  const content = await read(vault, result.path);
  assert.match(content, /aliases:\n {2}- "新闻追踪"/);
  assert.match(content, /^# DSH 观察员$/m);
  assert.match(content, /只看一手来源/);
  await assert.rejects(fs.stat(path.join(vault.root, '00-系统', '专家记忆', '新闻追踪.md')), { code: 'ENOENT' });
  validateNote(content, result.path);
});

test('同名的笔记不是这位专家的就不占用，报出怎么处理', async t => {
  const { vault, memory } = await fixture(t);
  await vault.initialize();
  const other = '---\ntype: atomic\nstatus: seedling\ncreated: 2026-11-08\nupdated: 2026-11-08\naliases: []\n---\n\n# 研究专家\n\n员工自己写的一篇。\n';
  await vault.write('00-系统/专家记忆/研究专家.md', other, '');
  await assert.rejects(memory.add({ id: 'research', name: '研究专家' }, '规矩', 'x'), { code: 'MEMORY_TAKEN' });
  assert.equal(await read(vault, '00-系统/专家记忆/研究专家.md'), other);
});

test('全局记忆只带“我是谁”“怎样和我协作”里员工写了的；记到全局记忆追加到“怎样和我协作”', async t => {
  const { vault, memory } = await fixture(t);
  await vault.initialize();
  // 骨架里只有括注提示，不算员工写的。
  assert.equal(await memory.globalContext(), null);
  const result = await memory.addGlobal('回答先说结论，再给选项和推荐');
  assert.equal(result.path, aboutMePath);
  const about = await read(vault, aboutMePath);
  assert.match(about, new RegExp(`## 怎样和我协作\\n\\n（[^）]+）\\n- ${today} 回答先说结论，再给选项和推荐\\n\\n## 我正在做的事`));
  validateNote(about, aboutMePath);
  const global = await memory.globalContext();
  assert.equal(global.path, aboutMePath);
  assert.equal(global.text, `### 怎样和我协作\n- ${today} 回答先说结论，再给选项和推荐`);
  // “我想去哪里”“我正在做的事”不带。
  const current = await vault.read(aboutMePath);
  await vault.write(aboutMePath, current.content.replace('（我的工作、负责什么、擅长什么、还在补什么。）', '我在做 DSH 插件。').replace('（手上同时在推进的几件事，以及最近做过的取舍。）', '不该带上的'), current.hash);
  assert.match((await memory.globalContext()).text, /^### 我是谁\n我在做 DSH 插件。\n\n### 怎样和我协作/);
  assert.doesNotMatch((await memory.globalContext()).text, /不该带上的/);
});

test('关于我不在或少了“怎样和我协作”时，不新建，只说明怎么办', async t => {
  const { vault, memory } = await fixture(t);
  await vault.initialize();
  const current = await vault.read(aboutMePath);
  await vault.write(aboutMePath, current.content.replace(/## 怎样和我协作\n\n[^\n]*\n\n/, ''), current.hash);
  await assert.rejects(memory.addGlobal('x'), { code: 'MEMORY_GLOBAL' });
  await vault.remove(aboutMePath, (await vault.read(aboutMePath)).hash);
  await assert.rejects(memory.addGlobal('x'), { code: 'MEMORY_GLOBAL' });
});

test('记忆超过上限时截断并标出来，提醒合并', async t => {
  const { memory } = await fixture(t);
  const expert = { id: 'writing', name: '写作专家' };
  for (let index = 0; index < 12; index += 1) await memory.add(expert, '规矩', `第 ${index} 条：${'很长的规矩'.repeat(80)}`);
  const context = await memory.context(expert);
  assert.equal(context.over, true);
  assert.ok([...context.text].length <= limits.memory + 1);
});
