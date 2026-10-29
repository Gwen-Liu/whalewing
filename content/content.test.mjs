import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import sharp from 'sharp';
import { modelWorldPortraitFiles } from '../src/model-world-portraits.js';
import { readUtilityLicenseAudit } from '../scripts/utility-licenses.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
// 角色名单从同目录的 experts/*.md 读提示词，按文件地址加载；不加载 Host 或员工数据。
const { roles, commonPrompt, expertTemplates, retiredBuiltinIds } = await import(pathToFileURL(join(root, 'roles.js')).href);
const { parseExpertTemplate } = await import(pathToFileURL(join(root, '../features/experts/template.js')).href);
// 内置专家和随包模板库是同一种写法，提示词结构和技能对照规则一起检查。
const allExperts = [...roles, ...expertTemplates];
const rulePath = join(root, 'vault/00-系统/规则/知识库规则.md');
const rules = await readFile(rulePath, 'utf8');
const skillNames = ['whalewing-knowledge', 'whalewing-skill-evolution', 'whalewing-check'];
// 收录的开源技能由 scripts/skill-sources.json 登记来源；测试只读清单核对，不联网。
const vendoredSkills = JSON.parse(await readFile(join(root, '../scripts/skill-sources.json'), 'utf8'));

async function files(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result;
}

test('内置专家和随包模板库的标识、名称和专业提示词完整', () => {
  assert.deepEqual(roles.map(r => r.id), ['manager', 'requirements', 'design', 'development', 'testing', 'operations', 'data', 'research', 'writing', 'marketing']);
  assert.deepEqual(roles.map(r => r.name), ['小鲸助手', '产品专家', '设计专家', '研发专家', '测试专家', '运维专家', '数据专家', '研究专家', '写作专家', '运营专家']);
  for (const role of roles) assert.deepEqual(Object.keys(role), ['id', 'name', 'description', 'prompt', 'skills']);
  // 模板库按名称拼音排序（逐字比较，同音按声调）；售前、实施由内置改为模板，标识不变，旧会话和员工改过的记录还能对上。
  assert.deepEqual(expertTemplates.map(item => item.name), ['财务专家', '法务专家', '翻译专家', '课程专家', '实施专家', '视频编导', '售前专家', '效率教练', '学习教练', '招聘专家']);
  assert.deepEqual(retiredBuiltinIds, ['presales', 'implementation']);
  for (const id of retiredBuiltinIds) assert.ok(expertTemplates.some(item => item.id === id) && !roles.some(role => role.id === id), id);
  // 名称沿用“四个字”的约定，方便在专家按钮里并排显示。
  for (const role of allExperts) assert.equal([...role.name].length, 4, role.name);
  for (const role of allExperts) {
    assert.ok(role.description.length > 12 && role.description.length <= 240);
    for (const name of skillNames) assert.ok(role.skills.includes(name), `${role.id}: ${name}`);
    assert.equal(new Set(role.skills).size, role.skills.length);
    // 每份提示词是一份完整的岗位说明；底线常驻上下文，是不加载任何技能时的最低要求，对照表决定先加载哪项技能。
    // 交付物模板放在代码块里，里面的“## 结果”不是章节。
    const sections = [...role.prompt.replace(/```[^]*?```/gu, '').matchAll(/^## (.+)$/gmu)].map(match => match[1]);
    assert.match(role.prompt, new RegExp(`^# ${role.name}\n\n你是${role.name}，`, 'u'), role.id);
    assert.deepEqual(sections, ['核心使命', '擅长与边界', '底线', '工作流程', ...sections.slice(4, -4), '交付物模板', '质量自检', '先加载再动手', '交付'], role.id);
    assert.match(role.prompt, /\n## 底线\n\n1\. /u, role.id);
    assert.ok(role.prompt.length > 1500 && role.prompt.length < 32000, role.id);
    // 对照表里点名的技能必须真的绑定在这位专家身上，否则提示词让模型去加载一个注入里没有列出的技能。
    const known = new Set([...allExperts.flatMap(item => item.skills), 'office']);
    const routed = [...role.prompt.split('\n## 先加载再动手\n')[1].split('\n## ')[0].matchAll(/→ ([^\n]+)/gu)].flatMap(match => match[1].split(/[；、，\s]+/u).filter(word => known.has(word)));
    assert.ok(routed.length > 0, role.id);
    for (const name of routed) assert.ok(role.skills.includes(name), `${role.id} 的对照表点名了未绑定的 ${name}`);
    for (const name of role.skills.filter(name => !skillNames.includes(name))) assert.ok(routed.includes(name), `${role.id} 绑定了 ${name} 却没写什么情况下加载`);
  }
  for (const phrase of ['主会话', '全部专家', '当前授权', '同一文件', '原生子代理', '不上传个人知识', '先调查', '先看再改', '失败两次', '不编', '亲自验证', '先加载再动手', '原样转达']) assert.ok(commonPrompt.includes(phrase), phrase);
  const development = roles.find(r => r.id === 'development').prompt;
  for (const phrase of ['不打补丁', '根因', '简单优先', '改动精准', '注释写“为什么”', '不逐行翻译']) assert.ok(development.includes(phrase), phrase);
  assert.match(expertTemplates.find(r => r.id === 'implementation').prompt, /Excel.*脚本/u);
});

test('专家模板文件：内置与模板库逐个往返一致，格式不对的拒收并说明原因', async () => {
  for (const [folder, items] of [['experts', roles], ['expert-templates', expertTemplates]]) for (const item of items) {
    const parsed = parseExpertTemplate(await readFile(join(root, folder, `${item.id}.md`), 'utf8'));
    assert.deepEqual({ name: parsed.name, description: parsed.description, prompt: parsed.prompt, skills: parsed.skills }, { name: item.name, description: item.description, prompt: item.prompt, skills: item.skills }, item.id);
  }
  const good = '---\nname: 测试专家\ndescription: "带冒号：也可以"\nskills:\n  - whalewing-check\navatar: preset-01\n---\n# 测试专家\n\n正文\n';
  assert.deepEqual(parseExpertTemplate(`﻿${good.replaceAll('\n', '\r\n')}`), { name: '测试专家', description: '带冒号：也可以', prompt: '# 测试专家\n\n正文', skills: ['whalewing-check'], avatar: 'preset-01' });
  const bad = {
    '没有开头': '# 只有正文',
    '未知字段': good.replace('avatar: preset-01', 'model: deepseek'),
    '缺正文': '---\nname: 测试专家\ndescription: 介绍\n---\n',
    '技能写在同一行': good.replace('skills:\n  - whalewing-check', 'skills: whalewing-check'),
    '技能名不合规': good.replace('whalewing-check', 'Bad_Skill'),
    '技能重复': good.replace('  - whalewing-check', '  - whalewing-check\n  - whalewing-check'),
    '名字太长': good.replace('name: 测试专家', `name: ${'长'.repeat(41)}`),
    '字段重复': good.replace('avatar: preset-01', 'name: 又一个'),
  };
  for (const [reason, text] of Object.entries(bad)) assert.throws(() => parseExpertTemplate(text), { code: 'EXPERT_TEMPLATE', message: /^专家模板格式不对：/u }, reason);
});

test('固定规则保留十区、九类型、属性和修订覆盖语义', () => {
  for (const dir of ['00-系统', '10-收件箱', '20-项目', '30-领域', '40-知识', '50-来源', '60-时间线', '70-作品', '80-外部索引', '90-归档']) assert.ok(rules.includes(dir), dir);
  for (const type of ['capture', 'timeline', 'project', 'area', 'source', 'atomic', 'moc', 'output', 'asset-index']) assert.ok(rules.includes('`' + type + '`'), type);
  for (const token of ['created', 'updated', 'aliases', 'superseded', 'current', 'on_hit', 'on_miss', 'on_wrong', '唯一', '不删除原件', '检查记录', '成功覆盖', '未读完', '七天', '不强制逐个经过']) assert.ok(rules.includes(token), token);
  assert.match(rules, /归档是状态/u);
});

test('三基础技能与独立资讯技能的分发、路由与生命周期完整', async () => {
  // 随包技能都要有专家默认绑定；资讯技能只由已认领的自动任务加载，不为扩展分发清单强绑到全部专家。
  assert.deepEqual((await readdir(join(root, 'skills'))).sort(), [...new Set([...allExperts.flatMap(role => role.skills).filter(name => name !== 'office'), 'whalewing-news'])].sort());
  for (const name of skillNames) {
    const body = await readFile(join(root, 'skills', name, 'SKILL.md'), 'utf8');
    assert.match(body, new RegExp('^---\nname: ' + name + '\ndescription: [^\n]+\n---\n'));
    assert.match(body, /退出/u);
    assert.match(body, /whalewing_knowledge/u);
    assert.ok(body.length < 8192);
  }
  const knowledge = await readFile(join(root, 'skills/whalewing-knowledge/SKILL.md'), 'utf8');
  for (const s of ['expectedHash', 'source_read', 'coverage', 'complete', '未完成', '实际工具描述']) assert.ok(knowledge.includes(s), s);
  const evolution = await readFile(join(root, 'skills/whalewing-skill-evolution/SKILL.md'), 'utf8');
  for (const s of ['sourcePaths', '活动扫描根之外', '未参与', '重新加载', '同名遮蔽', '停用', '固定知识规则']) assert.ok(evolution.includes(s), s);
  const check = await readFile(join(root, 'skills/whalewing-check/SKILL.md'), 'utf8');
  assert.match(check, /不代写/u);
  assert.match(check, /不调用知识/u);
});

// 通用专业技能改编自社区开源技能：每项保留来源、固定提交和许可全文，许可文件里逐个核对来源的版权行；
// 值为 null 的是鲸翼原创，没有上游许可文件。企业内容由开源导出检查拦截，测试里不写企业名称。
const apache = /Apache License\s+Version 2\.0/u;
const mit = holder => new RegExp(`MIT License\n\nCopyright \\(c\\) ${holder}\n`, 'u');
const generalSkills = {
  'whalewing-clarify': [mit('2025 Jesse Vincent')], 'whalewing-writing': [apache], 'whalewing-frontend-design': [apache],
  'whalewing-coding': [mit('2025 Jesse Vincent')], 'whalewing-debugging': [mit('2025 Jesse Vincent')], 'whalewing-web-testing': [apache],
  'whalewing-code-review': [mit('2025 Jesse Vincent'), mit('2026 Matt Pocock')], 'whalewing-ui-review': [mit('2025 Vercel Labs'), mit('2026 Addy Osmani')],
  'whalewing-data-analysis': [mit('2025 K-Dense Inc\\.')], 'whalewing-research': [mit('2026 Lan Zheng')], 'whalewing-visual': [mit('2026 Jim Liu')],
  'whalewing-slides': [mit('2026 CyberPPT contributors'), mit('2026 lewis <sudolewis@gmail\.com>'), mit('2025 Zara Zhang')],
};

test('通用专业技能格式、来源许可和专家绑定完整', async () => {
  // 只读功能清单源码，不加载宿主模块；专家团队是基础功能，鲸翼自写和收录的通用技能都挂在它下面。
  const features = await readFile(join(root, '../features/index.js'), 'utf8');
  const experts = features.split('\n').find(line => line.includes("{ id: 'experts',"));
  assert.deepEqual([...experts.match(/skills: \[([^\]]*)\]/u)[1].matchAll(/'([a-z0-9-]+)'/gu)].map(match => match[1]).sort(), [...Object.keys(generalSkills), ...vendoredSkills.map(item => item.name)].sort());
  for (const [name, licenses] of Object.entries(generalSkills)) {
    const body = await readFile(join(root, 'skills', name, 'SKILL.md'), 'utf8');
    assert.match(body, new RegExp('^---\nname: ' + name + '\ndescription: [^\n]+\n---\n'));
    assert.match(body, /\n## [^\n]*退出\n/u, name);
    assert.ok(body.length < 8192, name);
    const entries = await readdir(join(root, 'skills', name));
    if (licenses) {
      assert.match(body, /\n## 来源\n[^]*提交 `[0-9a-f]{40}`[^]*LICENSE\.txt/u, name);
      const text = await readFile(join(root, 'skills', name, 'LICENSE.txt'), 'utf8');
      for (const license of licenses) assert.match(text, license, name);
      assert.deepEqual(entries.sort(), ['LICENSE.txt', 'SKILL.md'], name);
    } else {
      assert.match(body, /\n## 来源\n\n鲸翼原创/u, name);
      assert.deepEqual(entries, ['SKILL.md'], name);
    }
    assert.ok(allExperts.some(role => role.skills.includes(name)), `${name} 至少绑定一位专家或模板`);
  }
  // Office 文件交给 DSH 自带的 office 技能，鲸翼不复制专有 Office 技能。
  for (const id of ['manager', 'design', 'data', 'writing', 'presales', 'implementation']) assert.ok(allExperts.find(role => role.id === id).skills.includes('office'), id);
});

test('收录的开源技能与来源清单逐项一致：中文说明、固定提交、许可全文和默认绑定', async () => {
  const licenseText = { MIT: /MIT License\n\nCopyright \(c\) /u, 'Apache-2.0': /Apache License\s+Version 2\.0/u };
  assert.equal(new Set(vendoredSkills.map(item => item.name)).size, vendoredSkills.length);
  for (const { name, repo, commit, path, license, description } of vendoredSkills) {
    assert.match(commit, /^[0-9a-f]{40}$/u, name);
    assert.ok(/[一-鿿]/u.test(description) && !description.includes('\n'), `${name} 的说明须为一行中文`);
    const body = await readFile(join(root, 'skills', name, 'SKILL.md'), 'utf8');
    // 随包只保留名称和中文说明两个 frontmatter 字段，正文之后附来源一节。
    assert.ok(body.startsWith(`---\nname: ${name}\ndescription: ${description}\n---\n`), name);
    const source = body.slice(body.lastIndexOf('\n## 来源\n'));
    for (const part of [`[${repo}](https://github.com/${repo}/tree/${commit}`, `提交 \`${commit}\``, `路径 \`${path}\``, `${license} 许可`, 'LICENSE.txt']) assert.ok(source.includes(part), `${name}: ${part}`);
    assert.match(await readFile(join(root, 'skills', name, 'LICENSE.txt'), 'utf8'), licenseText[license], name);
    assert.ok(allExperts.some(role => role.skills.includes(name)), `${name} 至少绑定一位专家或模板`);
  }
});

test('小鲸默认保留原技能并绑定可复制的插件管理方法', async () => {
  const manager = roles.find(role => role.id === 'manager');
  assert.deepEqual(manager.skills, [...skillNames, 'whalewing-clarify', 'whalewing-writing', 'office', 'whalewing-plugin-management', 'obsidian-markdown', 'obsidian-bases', 'json-canvas']);
  assert.ok(roles.filter(role => role.id !== 'manager').every(role => !role.skills.includes('whalewing-plugin-management')));
  const features = await readFile(join(root, '../features/index.js'), 'utf8');
  assert.match(features, /id: 'assistant', kind: 'base', skills: \['whalewing-plugin-management'\]/u);
  const body = await readFile(join(root, 'skills/whalewing-plugin-management/SKILL.md'), 'utf8');
  assert.match(body, /^---\nname: whalewing-plugin-management\ndescription: [^\n]+\n---\n/u);
  for (const boundary of ['plugin_manager', 'nextOffset', 'entryId', 'EXTENDING.md', 'MAINTAINING.md', 'examples/feature-starter', 'examples/stateful-feature', 'link:', '审批', '退出']) assert.ok(body.includes(boundary), boundary);
  // 退出规则只在公开规范持有；技能必须直达该处，不为文字检查复制第二份流程。
  assert.ok(body.includes('关闭、卸载、删除源码与清除数据'));
  assert.ok(body.includes('按该处完整流程执行和核验'));
  const extending = await readFile(join(root, '../EXTENDING.md'), 'utf8');
  for (const boundary of ['stop-profile', '全部已知', 'link:', '独立的 DSH 原生插件页', 'Creator', '最后操作及其结果核验', '持久计划']) assert.ok(extending.includes(boundary), boundary);
  assert.ok(body.length < 8192);
  assert.ok(!/[A-Z]:[\\/]|\.\.\/[.][.]\//u.test(body), '不依赖开发者本机路径或复制技能的父目录');
  assert.ok(!body.includes('dsh plugin enable'), '不发明不存在的专用CLI');
});

test('分类反例：已确认保留的未消化外部材料不进收件箱', async () => {
  // 本测试固定规则的两种不同输入，防止消费者用“未消化”替代保留价值判断。
  assert.match(rules, /已经确认要保留、尚未消化的外部材料，通过 `80-外部索引` 登记待整理原件/u);
  assert.match(rules, /原件继续留在库外受控位置/u);
  assert.match(rules, /归属或保留价值仍不明确的输入进入 `10-收件箱`/u);
  assert.match(rules, /明确属于项目的记录直接进入项目/u);
  assert.doesNotMatch(rules, /先判断是否尚未消化或归属不明/u);
  const knowledge = await readFile(join(root, 'skills/whalewing-knowledge/SKILL.md'), 'utf8');
  assert.match(knowledge, /回读固定规则的“十区职责与分类”/u);
  assert.match(knowledge, /不将“尚未消化”单独当作收件箱条件/u);
  assert.doesNotMatch(knowledge, /未消化或未确定归属的资料进入收件箱/u);
});

test('恢复反例：restore不选旧版，发布回滚与实际使用分别验证', async () => {
  const evolution = await readFile(join(root, 'skills/whalewing-skill-evolution/SKILL.md'), 'utf8');
  assert.match(evolution, /`restore` 仅恢复停用区的同一版本，不自动选择旧版/u);
  assert.match(evolution, /需要撤销一次发布时使用 `rollback`/u);
  assert.match(evolution, /最近一次 `publish` 之前仍有效的备份/u);
  assert.match(evolution, /`expectedHash` 取回读得到的当前活动版本哈希，没有活动版本时传空串/u);
  assert.match(evolution, /无备份或来源失效时保持操作前状态并报告缺口/u);
  assert.match(evolution, /不用 `restore` 代替回滚/u);
  assert.doesNotMatch(evolution, /只有确认旧版仍有效才 `restore`/u);
  assert.match(evolution, /只证明发现与加载成立；还须由目标专家实际使用并检查成果/u);
  assert.match(evolution, /恢复或回滚成功后仍须重新加载当前正文/u);
});

test('来源反例：提炼来源变动与会话投影省略不能伪装成验证通过', async () => {
  const evolution = await readFile(join(root, 'skills/whalewing-skill-evolution/SKILL.md'), 'utf8');
  assert.match(evolution, /`sourceHashes` 按路径对应作者最近 `read` 得到的 SHA256/u);
  assert.match(evolution, /提炼期间来源改变应拒收/u);
  assert.match(evolution, /禁止只刷新哈希给旧候选盖章/u);
  const knowledge = await readFile(join(root, 'skills/whalewing-knowledge/SKILL.md'), 'utf8');
  assert.match(knowledge, /同一批保持工具给定的冻结 `cutoff`/u);
  assert.match(knowledge, /检查 `omittedEvents`/u);
  assert.match(knowledge, /用户\/助手有界投影，不是完整会话/u);
  assert.match(knowledge, /回原会话或对应工程核对原件/u);
  assert.match(knowledge, /不提交空产物逃过检查/u);
  assert.match(knowledge, /仅全省略页允许 `outputs: \[\]`/u);
  assert.match(knowledge, /不表示被省略的原件已验收或当天没有工作/u);
});

test('初始化文件仅含自包含规则导航和模板，链接有效', async () => {
  const vaultRoot = join(root, 'vault');
  const paths = await files(vaultRoot);
  const notes = paths.filter(path => path.endsWith('.md'));
  assert.equal(notes.length, 18);
  assert.deepEqual(paths.filter(path => !path.endsWith('.md')).map(path => relative(vaultRoot, path).replaceAll('\\', '/')).sort(), ['00-系统/Bases/任务记录.base', '00-系统/Bases/幼苗知识.base', '00-系统/Bases/收件箱.base', '00-系统/Bases/活动项目.base', '00-系统/Bases/草稿作品.base']);
  for (const path of notes) {
    const text = await readFile(path, 'utf8');
    assert.match(text, /^---\ntype: (output|moc)\nstatus: (published|active)\ncreated: __DATE__\nupdated: __DATE__\naliases: \[\]\n---\n/u);
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      assert.ok(!/^[a-z]+:/i.test(match[1]), '初始化模板不能依赖外部运行规则');
      await readFile(fileURLToPath(new URL(match[1], new URL(`file:///${path.replaceAll('\\', '/')}`))));
    }
  }
});

// 真实客户名和本机用户名不能写进随插件开源的测试，名单应放在不导出的开源导出检查里；这里用示例名验证拦截机制，盘符路径另由 privatePath 拦。
const privateNames = /示例客户|sample-user|automation-2|second-brain-weekly-validate/iu;
const credentials = /(?:api[_-]?key|token|password)\s*[:=]\s*["']?[a-z0-9_-]{16}/iu;
const privatePath = /(?<![a-z])[A-Z]:[\\/]/iu;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function checkPrivacy(text, name) {
  // 协议中的 https:/ 不是盘符；盘符前不能是单词字母。
  assert.doesNotMatch(text, privatePath, name);
  assert.doesNotMatch(text, privateNames, name);
  assert.doesNotMatch(text, credentials, name);
}

function* binaryStrings(bytes) {
  // 同时检查单字节、UTF-8 和两种字节序的宽字符串，不解码压缩数据为文档。
  yield bytes.toString('latin1');
  yield bytes.toString('utf8');
  for (const start of [0, 1]) {
    const even = bytes.subarray(start, bytes.length - (bytes.length - start) % 2);
    yield even.toString('utf16le');
    yield Buffer.from(even).swap16().toString('utf16le');
  }
}

function checkBinaryPrivacy(bytes, kind, name) {
  for (const text of binaryStrings(bytes)) {
    assert.doesNotMatch(text, privateNames, name);
    assert.doesNotMatch(text, credentials, name);
    // NUL 终止的可读字段与下方格式声明的正文才具有路径语义；压缩像素中的随机盘符不是路径。
    for (const match of text.matchAll(/[\x20-\x7e\u3000-\u9fff]{4,}\0/g)) checkPrivacy(match[0], name);
  }
  if (kind === 'png') {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
      assert.ok(offset + length + 12 <= bytes.length, name);
      const body = bytes.subarray(offset + 8, offset + 8 + length);
      if (type === 'tEXt') checkPrivacy(body.toString('latin1'), name);
      if (type === 'zTXt') {
        const end = body.indexOf(0); assert.ok(end >= 0 && body[end + 1] === 0, name);
        checkPrivacy(body.subarray(0, end).toString('latin1'), name);
        checkPrivacy(inflateSync(body.subarray(end + 2), { maxOutputLength: 1024 * 1024 }).toString('latin1'), name);
      }
      if (type === 'iTXt') {
        const end = body.indexOf(0), languageEnd = body.indexOf(0, end + 3), translatedEnd = body.indexOf(0, languageEnd + 1);
        assert.ok(end >= 0 && languageEnd > end && translatedEnd > languageEnd, name);
        checkPrivacy(body.subarray(0, translatedEnd).toString('utf8'), name);
        const text = body.subarray(translatedEnd + 1);
        checkPrivacy((body[end + 1] === 1 ? inflateSync(text, { maxOutputLength: 1024 * 1024 }) : text).toString('utf8'), name);
      }
      offset += length + 12;
    }
  }
  if (kind === 'otf') {
    const count = bytes.readUInt16BE(4);
    for (let index = 0; index < count; index++) {
      const record = 12 + index * 16;
      if (bytes.toString('ascii', record, record + 4) !== 'name') continue;
      const offset = bytes.readUInt32BE(record + 8), names = bytes.readUInt16BE(offset + 2), storage = offset + bytes.readUInt16BE(offset + 4);
      for (let i = 0; i < names; i++) {
        const field = offset + 6 + i * 12, platform = bytes.readUInt16BE(field), length = bytes.readUInt16BE(field + 8), start = storage + bytes.readUInt16BE(field + 10);
        assert.ok(start + length <= bytes.length, name);
        const value = bytes.subarray(start, start + length);
        checkPrivacy(platform === 0 || platform === 3 ? Buffer.from(value).swap16().toString('utf16le') : value.toString('latin1'), name);
      }
    }
  }
}

async function distributionPolicy() {
  // 固定原件指纹仍由各领域来源测试持有；本门只消费其批准身份，不产生第二份来源清单。
  const portraits = await readFile(new URL('../tests/model-world-portraits.test.mjs', import.meta.url), 'utf8');
  const { audit } = readUtilityLicenseAudit();
  const binary = new Map();
  for (const file of Object.values(modelWorldPortraitFiles)) {
    const hash = portraits.match(new RegExp("'" + file.replace('.', '\\.') + "': '([a-f0-9]{64})'"))?.[1];
    assert.ok(hash, file);
    binary.set(`model-world/portraits/${file}`, { kind: 'webp', sha256: hash });
  }
  // 专家头像同样按其来源测试持有的固定指纹放行。
  const avatars = await readFile(new URL('../tests/expert-avatars.test.mjs', import.meta.url), 'utf8');
  for (const [, file, hash] of avatars.matchAll(/'([a-z0-9-]+.webp)': '([a-f0-9]{64})'/g)) binary.set(`avatars/${file}`, { kind: 'webp', sha256: hash });
  binary.set('utilities/NotoSansSC-Regular.otf', { kind: 'otf', sha256: audit.assets.find(asset => asset.file === 'NotoSansSC-Regular.otf').sha256 });
  // 学习原件已移到独立书库（不随插件分发），这里只剩办公工坊许可声明一份逐字节原文。
  return { binary, raw: new Map([
    ['utilities/THIRD_PARTY_NOTICES.txt', audit.noticeSha256],
  ]) };
}

async function checkDistributedFile(name, bytes, policy) {
  const approved = policy.binary.get(name);
  if (approved) {
    assert.equal(digest(bytes), approved.sha256, `${name}: 二进制必须匹配批准原件或确定性派生`);
    checkBinaryPrivacy(bytes, approved.kind, name);
    if (approved.kind === 'otf') assert.equal(bytes.toString('ascii', 0, 4), 'OTTO', name);
    else {
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.format, approved.kind, name);
      if (approved.kind === 'webp') assert.ok(metadata.width <= 288 && metadata.height <= 512, name);
      for (const key of ['exif', 'icc', 'xmp', 'iptc']) if (metadata[key]) for (const text of binaryStrings(metadata[key])) checkPrivacy(text, `${name}:${key}`);
    }
    return;
  }
  assert.ok(!/\.(?:png|webp|otf)$/i.test(name), `${name}: 未批准二进制`);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert.ok(!bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), name);
  assert.ok(!text.includes('\uFFFD'), name);
  assert.doesNotMatch(text, /[\x00-\x08\x0b\x0c\x0e-\x1f]/u, `${name}: 未批准二进制或控制字符`);
  checkPrivacy(text, name);
  if (policy.raw.has(name)) assert.equal(digest(bytes), policy.raw.get(name), `${name}: 外部原文必须逐字节完整`);
  else {
    assert.ok(!text.includes('\r'), name);
    assert.ok(text.split('\n').every(line => line === line.trimEnd()), name);
  }
}

test('分发内容无私人路径凭据，编码与换行规范', async () => {
  const policy = await distributionPolicy(), seen = new Set();
  for (const path of await files(root)) {
    if (path === join(root, 'content.test.mjs')) continue;
    const name = relative(root, path).replaceAll('\\', '/'); seen.add(name);
    await checkDistributedFile(name, await readFile(path), policy);
  }
  for (const name of [...policy.binary.keys(), ...policy.raw.keys()]) assert.ok(seen.has(name), `${name}: 批准分发项缺失`);
});

test('分发反例：未知二进制、冒名原件与伪造 raw 均不取得格式豁免', async () => {
  const policy = await distributionPolicy();
  const png = 'model-world/portraits/openai.webp', original = await readFile(join(root, png));
  await assert.rejects(checkDistributedFile('model-world/portraits/unknown.webp', original, policy), /未批准二进制/);
  await assert.rejects(checkDistributedFile('utilities/unknown.bin', Buffer.from([0, 1, 2]), policy), /未批准二进制/);
  await assert.rejects(checkDistributedFile(png, Buffer.concat([original, Buffer.from('changed')]), policy), /二进制必须匹配/);
  for (const name of policy.raw.keys()) {
    const bytes = await readFile(join(root, name));
    await assert.rejects(checkDistributedFile(name, Buffer.concat([bytes, Buffer.from('\nforged')]), policy), /外部原文必须逐字节完整/);
    await assert.rejects(checkDistributedFile(name, Buffer.from('普通文本\uFFFD'), policy));
    await assert.rejects(checkDistributedFile(name, Buffer.from([0xff]), policy));
    await assert.rejects(checkDistributedFile(name, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]), policy));
  }
  for (const body of ['正文 \n', '正文\r\n']) await assert.rejects(checkDistributedFile('skills/first-party.md', Buffer.from(body), policy));
});

test('分发反例：文本与二进制可读字段中的隐私和凭据仍拒收', async () => {
  const policy = { binary: new Map(), raw: new Map() };
  for (const body of ['C:\\private\\notes', 'sample-user', '示例客户', 'api_key=abcdefghijklmnop']) {
    await assert.rejects(checkDistributedFile('skills/example.md', Buffer.from(body), policy));
    for (const encoding of ['utf8', 'utf16le']) {
      const bytes = Buffer.from(body + '\0', encoding);
      for (const prefix of [Buffer.alloc(0), Buffer.from([255])]) {
        assert.throws(() => checkBinaryPrivacy(Buffer.concat([prefix, bytes]), 'webp', 'fixture.webp'));
        if (encoding === 'utf16le') assert.throws(() => checkBinaryPrivacy(Buffer.concat([prefix, Buffer.from(bytes).swap16()]), 'webp', 'fixture.webp'));
      }
    }
  }
});

test('分发反例：图片压缩文字与字体声明的非NUL正文也检查私人路径', () => {
  const body = Buffer.from('C:\\private\\notes');
  for (const [type, payload] of [
    ['tEXt', Buffer.concat([Buffer.from('Comment\0'), body])],
    ['zTXt', Buffer.concat([Buffer.from('Comment\0\0'), deflateSync(body)])],
    ['iTXt', Buffer.concat([Buffer.from('Comment\0\x01\0\0\0'), deflateSync(body)])],
  ]) {
    // 只构造文字块，验证扫描本身；真实分发图像另走固定指纹与 sharp 格式校验。
    const chunk = Buffer.alloc(payload.length + 12);
    chunk.writeUInt32BE(payload.length); chunk.write(type, 4); payload.copy(chunk, 8);
    assert.throws(() => checkBinaryPrivacy(Buffer.concat([Buffer.alloc(8), chunk]), 'png', 'fixture.png'));
  }
  const value = Buffer.from(body.toString(), 'utf16le').swap16(), font = Buffer.alloc(46 + value.length);
  font.write('OTTO'); font.writeUInt16BE(1, 4); font.write('name', 12); font.writeUInt32BE(28, 20);
  font.writeUInt16BE(1, 30); font.writeUInt16BE(18, 32); font.writeUInt16BE(3, 34);
  font.writeUInt16BE(value.length, 42); value.copy(font, 46);
  assert.throws(() => checkBinaryPrivacy(font, 'otf', 'fixture.otf'));
});
