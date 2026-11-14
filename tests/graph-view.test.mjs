import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { Vault } from '../src/vault.js';
import { knowledgeContract } from '../features/knowledge/contract.js';
import { buildGraphView, compileGraphQuery, defaultGraphSettings, graphColors, graphSettingRanges, normalizeGraphSettings } from '../src/graph-view.js';
import { defaultGraphForces, graphForceParams } from '../src/graph-canvas.js';

const contract = knowledgeContract(z);
const page = (front, body) => `---\n${front}\n---\n${body}\n`;

async function vaultWith(t, files) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-graph-view-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const vault = new Vault(path.join(directory, 'vault'), {});
  await vault.initialize();
  // 直接落盘，模板、归档这些不经过界面写入的笔记也能放进来。
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(directory, 'vault', ...name.split('/'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  return vault;
}

test('员工在界面上看的全库图什么都不藏：归档、模板、没有连线的都给，另带建立日期、标签和附件', async t => {
  const vault = await vaultWith(t, {
    '40-知识/读书.md': page('created: 2026-01-05\ntags: [读书, "#方法/笔记"]', '# 读书\n\n正文 #灵感 和 `#行内代码` ![[图/封面.png]] [[写作]] 价格 #123 网址 a#b\n\n```\n#代码块里\n```\n[[没写的]]'),
    '40-知识/写作.md': page('created: 2026-02-01', '# 写作'),
    '30-领域/日记-2026-03-04.md': page('type: daily', '# 日记'),
    '90-归档/旧项目.md': page('created: 2025-06-01', '# 旧项目'),
    '00-系统/模板/日记模板.md': page('type: template', '# 模板'),
  });
  const all = await vault.graph({}, undefined, { whole: true });
  contract.result.parse(all);
  assert.equal(all.hidden, undefined);
  const byPath = new Map(all.nodes.map(node => [node.path, node]));
  for (const name of ['90-归档/旧项目.md', '00-系统/模板/日记模板.md', '30-领域/日记-2026-03-04.md']) assert.ok(byPath.has(name), name);
  const reading = byPath.get('40-知识/读书.md');
  assert.equal(reading.created, '2026-01-05');
  // 属性里的标签在前，正文的 #标签 跟在后面；代码里、纯数字、网址中间的 # 都不算。
  assert.deepEqual(reading.tags, ['读书', '方法/笔记', '灵感']);
  assert.deepEqual(reading.attachments, ['图/封面.png']);
  // 没写 created 的按文件名里的日期，都没有就是空串。
  assert.equal(byPath.get('30-领域/日记-2026-03-04.md').created, '2026-03-04');
  assert.equal(byPath.get('00-系统/模板/日记模板.md').created, '');
  assert.ok(all.nodes.some(node => node.kind === 'missing' && node.title === '没写的'));
  // 模型调用和当前笔记关系图不带这些额外字段，模型调用照旧藏归档、模板和没有连线的。
  const model = await vault.graph({});
  // 初始化的知识库自带一批模板，这里只看归档那篇和没有连线的日记确实被藏了。
  assert.equal(model.hidden.archive, 1);
  assert.ok(model.hidden.templates >= 1 && model.hidden.orphans >= 1);
  assert.ok(!model.nodes.some(node => ['90-归档/旧项目.md', '30-领域/日记-2026-03-04.md'].includes(node.path)));
  assert.ok(model.nodes.every(node => node.created === undefined && node.tags === undefined));
  const local = await vault.graph({ path: '40-知识/读书.md' }, undefined, { whole: true });
  assert.equal(local.hidden, undefined);
  assert.ok(local.nodes.every(node => node.tags === undefined));
});

test('知识积累的总览：全部笔记的名字、别名和建立日期，标签和属性各用在几篇，归档、模板也算', async t => {
  const vault = await vaultWith(t, {
    '40-知识/读书.md': page('created: 2026-01-05\naliases: [读书法]\ntags: [读书]', '# 读书\n\n#方法'),
    '40-知识/写作.md': page('created: 2026-02-01\ntags: 读书', '# 写作'),
    '90-归档/旧项目.md': page('status: done', '# 旧项目 #读书'),
  });
  const overview = await vault.overview();
  contract.result.parse(overview);
  const byPath = new Map(overview.notes.map(note => [note.path, note]));
  assert.deepEqual(byPath.get('40-知识/读书.md'), { path: '40-知识/读书.md', title: '读书', aliases: ['读书法'], created: '2026-01-05' });
  assert.ok(byPath.has('90-归档/旧项目.md'));
  // 标签按用的篇数从多到少；一样多按名字。
  assert.deepEqual(overview.tags.slice(0, 2).map(tag => [tag.name, tag.count]), [['读书', 3], ['方法', 1]]);
  assert.deepEqual(overview.tags[0].notes.sort(), ['40-知识/写作.md', '40-知识/读书.md', '90-归档/旧项目.md'].sort());
  const props = new Map(overview.properties.map(item => [item.name, item.count]));
  assert.ok(props.get('created') >= 2);
  assert.equal(props.get('tags'), 2);
});

const sample = () => ({
  version: 2, total: 6, offset: 0, truncated: false, omittedEdges: 0, unresolved: 1,
  nodes: [
    { kind: 'note', path: '40-知识/读书.md', title: '读书', created: '2026-01-05', tags: ['读书', '方法/笔记'], attachments: ['图/封面.png'] },
    { kind: 'note', path: '40-知识/写作.md', title: '写作', created: '2026-02-01', tags: ['读书'] },
    { kind: 'note', path: '20-项目/鲸翼.md', title: '鲸翼', created: '2026-03-01', tags: [] },
    { kind: 'note', path: '90-归档/旧项目.md', title: '旧项目', created: '2025-06-01', tags: [] },
    { kind: 'note', path: '40-知识/孤立.md', title: '孤立', created: '', tags: [] },
    { kind: 'missing', path: 'missing:name:没写的', title: '没写的', sources: [] },
  ],
  edges: [
    { source: '40-知识/读书.md', target: '40-知识/写作.md' },
    { source: '40-知识/写作.md', target: '40-知识/读书.md' },
    { source: '20-项目/鲸翼.md', target: '40-知识/写作.md' },
    { source: '90-归档/旧项目.md', target: '20-项目/鲸翼.md' },
    { source: '40-知识/读书.md', target: 'missing:name:没写的' },
  ],
});

test('默认设置什么都画：标签、附件、还没建的笔记、没有连线的笔记都在；连接度按画出来的图重数', () => {
  const view = buildGraphView(sample(), defaultGraphSettings);
  const paths = view.nodes.map(node => node.path).sort();
  assert.deepEqual(paths, ['20-项目/鲸翼.md', '40-知识/写作.md', '40-知识/孤立.md', '40-知识/读书.md', '90-归档/旧项目.md', 'attachment:图/封面.png', 'missing:name:没写的', 'tag:方法/笔记', 'tag:读书'].sort());
  const node = path => view.nodes.find(item => item.path === path);
  // 双向引用算一个邻居；读书连写作、没写的、两个标签和附件。
  assert.equal(node('40-知识/读书.md').degree, 5);
  assert.equal(node('missing:name:没写的').degree, 1);
  assert.equal(node('40-知识/孤立.md').degree, 0);
  assert.equal(node('tag:读书').degree, 2);
  assert.equal(node('tag:读书').title, '#读书');
  // 标签跟着最早引用它的那篇一起长出来。
  assert.equal(node('tag:读书').created, '2026-01-05');
  assert.equal(node('attachment:图/封面.png').title, '封面.png');
  assert.deepEqual(view.kinds, { tags: true, attachments: true });
  assert.equal(view.excluded, 0);
  assert.equal(view.total, view.nodes.length);
  assert.ok(view.edges.every(edge => paths.includes(edge.source) && paths.includes(edge.target)));
  assert.equal(new Set(view.edges.map(edge => `${edge.source}>${edge.target}`)).size, view.edges.length);
  // 不改知识服务给的原图。
  assert.equal(sample().nodes[0].degree, undefined);
});

test('图谱设置的开关：关掉标签、附件、还没建的笔记、没有连线的', () => {
  const plain = buildGraphView(sample(), { ...defaultGraphSettings, tags: false, attachments: false, existingOnly: true, orphans: false });
  assert.deepEqual(plain.nodes.map(node => node.path).sort(), ['20-项目/鲸翼.md', '40-知识/写作.md', '40-知识/读书.md', '90-归档/旧项目.md'].sort());
  assert.deepEqual(plain.kinds, { tags: false, attachments: false });
  // 筛掉的笔记记数，它带的标签和连线一起不画。
  const filtered = buildGraphView(sample(), { ...defaultGraphSettings, search: '-path:90-归档 -tag:读书' });
  assert.equal(filtered.excluded, 3);
  assert.deepEqual(filtered.nodes.map(node => node.path).sort(), ['20-项目/鲸翼.md', '40-知识/孤立.md'].sort());
  assert.equal(filtered.edges.length, 0);
});

test('筛选写法：空格是都要满足，OR 是满足一段，减号是去掉；path、tag、file 各看各的', () => {
  const notes = sample().nodes.filter(node => node.kind === 'note');
  const pick = query => notes.filter(compileGraphQuery(query)).map(node => node.title).sort();
  assert.equal(compileGraphQuery('  '), null);
  assert.deepEqual(pick('path:40-知识'), ['写作', '孤立', '读书'].sort());
  assert.deepEqual(pick('path:40-知识 -file:孤立'), ['写作', '读书'].sort());
  assert.deepEqual(pick('tag:#读书'), ['写作', '读书'].sort());
  // 标签带层级：tag:方法 也能对上 方法/笔记，但不会对上名字只是开头一样的标签。
  assert.deepEqual(pick('tag:方法'), ['读书']);
  assert.deepEqual(pick('tag:方'), []);
  assert.deepEqual(pick('file:鲸翼 OR path:90-归档'), ['旧项目', '鲸翼'].sort());
  assert.deepEqual(pick('鲸翼'), ['鲸翼']);
  // 单独一个减号当普通字找（路径里都有减号，所以全对上），不是“去掉全部”。
  assert.equal(pick('-').length, notes.length);
});

test('按层上色取第一组对上的，没对上的不上色；标签和附件不归颜色组；图例只列用到的组', () => {
  const view = buildGraphView(sample(), defaultGraphSettings);
  const groups = [{ query: 'path:40-知识', color: '#112233' }, { query: 'tag:读书', color: '#445566' }, { query: 'path:80-没有', color: '#778899' }];
  const { colors, legend } = graphColors(view.nodes, groups);
  assert.equal(colors.get('40-知识/写作.md'), '#112233');
  assert.equal(colors.get('20-项目/鲸翼.md'), '');
  assert.equal(colors.has('tag:读书'), false);
  assert.deepEqual(legend.map(item => item.color), ['#112233']);
  // 默认的六组照第二大脑的分层：项目、归档各有自己的颜色。
  const defaults = graphColors(view.nodes, defaultGraphSettings.groups).colors;
  assert.notEqual(defaults.get('20-项目/鲸翼.md'), '');
  assert.notEqual(defaults.get('90-归档/旧项目.md'), defaults.get('20-项目/鲸翼.md'));
});

test('本机存的图谱设置读回来时补缺、夹范围、丢坏颜色', () => {
  assert.deepEqual(normalizeGraphSettings(null), { ...defaultGraphSettings });
  assert.deepEqual(normalizeGraphSettings('坏的'), { ...defaultGraphSettings });
  const read = normalizeGraphSettings({ tags: false, orphans: 'yes', nodeSize: 99, distance: -5, repel: Number.NaN, search: 'x'.repeat(400), groups: [{ query: 'path:a', color: '#ABCDEF' }, { color: 'red' }, null] });
  assert.equal(read.tags, false);
  assert.equal(read.orphans, true);
  assert.equal(read.nodeSize, graphSettingRanges.nodeSize[1]);
  assert.equal(read.distance, graphSettingRanges.distance[0]);
  assert.equal(read.repel, defaultGraphSettings.repel);
  assert.equal(read.search.length, 300);
  assert.deepEqual(read.groups, [{ query: 'path:a', color: '#abcdef' }, { query: '', color: '#8a8f94' }, { query: '', color: '#8a8f94' }]);
});

test('排布的四个数换成力的参数：默认值和原来的布局一模一样，调大调小按比例走', () => {
  assert.deepEqual(graphForceParams(defaultGraphForces, 10), { distance: 60, charge: -60, link: 1, gravity: 0.02 });
  const tuned = graphForceParams({ ...defaultGraphForces, distance: 500, repel: 20, link: 0.5, center: 1.04 }, 10);
  assert.equal(tuned.distance, 120);
  assert.equal(tuned.charge, -120);
  assert.equal(tuned.link, 0.5);
  assert.ok(Math.abs(tuned.gravity - 0.04) < 1e-12);
  assert.equal(graphForceParams({ ...defaultGraphForces, center: 0 }, 10).gravity, 0);
});
