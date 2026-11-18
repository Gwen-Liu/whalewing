import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fail, frontmatter } from '../../src/vault.js';

/**
 * 专家记忆和全局记忆（2026-11-08 用户定，见 docs/专家团改版方案.md）。
 * - 专家记忆：每位专家一篇笔记，放在知识库 00-系统/专家记忆/，按属性 expert 认专家（改名不丢）；
 *   “规矩”记员工定的做法和偏好，“进度”记手上长期的事做到哪了，一条一行、前面写日期。
 * - 全局记忆：就是个人知识里的“关于我”。开工时带上“我是谁”“怎样和我协作”两节；
 *   员工明说“记到全局记忆”时，追加到“怎样和我协作”末尾。平时插件和专家都不改关于我。
 * 读写都走知识库已有的写法（先读、带上读到的指纹再写、写完再读），不另开一套存储。
 */
export const memoryFolder = '00-系统/专家记忆';
export const aboutMePath = '30-领域/个人管理/关于我.md';
export const memorySections = ['规矩', '进度'];
export const globalSections = ['我是谁', '怎样和我协作'];
export const limits = Object.freeze({ memory: 4000, global: 2000, entry: 500, rewrite: 60 });

// 知识库规则写明日期按北京时间，和电脑设的时区无关。
const localDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const chars = text => [...text].length;
const clip = (text, max) => chars(text) > max ? `${[...text].slice(0, max).join('')}…` : text;
const normalize = content => content.replace(/^﻿/, '').replace(/\r\n/g, '\n');
// 关于我骨架里“（我的工作、负责什么……）”这种整行括注是待填的提示，不当成员工写的内容。
const placeholder = line => /^（[^）]*）$/.test(line.trim());

/** 专家名做文件名：去掉 Windows 不认的字符，结尾不留点和空格；剩不下字时用机器标识。 */
export function memoryFileName(expert) {
  const base = String(expert.name ?? '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '').trim().slice(0, 60);
  return `${memoryFolder}/${base || expert.id}.md`;
}

/** 新建时的骨架：五个通用属性加 expert，标题和文件名一致，两节先空着。 */
export function memoryNote(expert, date = localDate()) {
  const title = path.posix.basename(memoryFileName(expert), '.md');
  return [
    '---', 'type: area', 'status: active', `created: ${date}`, `updated: ${date}`, 'aliases: []', `expert: ${JSON.stringify(expert.id)}`, '---', '',
    `# ${title}`, '',
    `> ${expert.name}的记忆：每次开工前都会先读这一篇。员工定下的做法写在“规矩”，手上长期的事做到哪了写在“进度”；一条一行，前面写日期。可以直接改、删。`, '',
    '## 规矩', '', '## 进度', '',
  ].join('\n');
}

/** 按二级标题切开正文；没有这一节时返回 null。 */
export function sectionLines(body, heading) {
  const lines = normalize(body).split('\n');
  const start = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (start < 0) return null;
  let end = lines.findIndex((line, index) => index > start && /^#{1,2}\s/.test(line));
  if (end < 0) end = lines.length;
  return { start, end, lines: lines.slice(start + 1, end).map(line => line.trimEnd()).filter(line => line.trim()) };
}

/** 往某一节末尾加一行；没有这一节就在正文最后补上。返回新的完整内容。 */
export function appendEntry(content, heading, entry) {
  const lines = normalize(content).split('\n');
  const found = sectionLines(content, heading);
  if (!found) {
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    return [...lines, '', `## ${heading}`, '', entry, ''].join('\n');
  }
  // 空的一节：标题下空一行再写，和下一节之间也留一行空行。
  if (!found.lines.length) {
    lines.splice(found.start + 1, found.end - found.start - 1, '', entry, '');
    return lines.join('\n');
  }
  // 插在这一节最后一行非空内容后面，保留节与节之间的空行。
  let at = found.end;
  while (at > found.start + 1 && !lines[at - 1].trim()) at -= 1;
  lines.splice(at, 0, entry);
  return lines.join('\n');
}

/** 整节换成给定的几行。 */
export function replaceSection(content, heading, entries) {
  const lines = normalize(content).split('\n');
  const found = sectionLines(content, heading);
  const block = ['', ...entries, ''];
  if (!found) {
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    return [...lines, '', `## ${heading}`, ...block].join('\n');
  }
  lines.splice(found.start + 1, found.end - found.start - 1, ...block);
  return lines.join('\n');
}

/** 改属性 updated；只动属性区里那一行。 */
export function touch(content, date = localDate()) {
  const text = normalize(content);
  const match = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(text);
  if (!match) return text;
  const head = match[0].replace(/^updated: .*$/m, `updated: ${date}`);
  return head + text.slice(match[0].length);
}

function entryText(text) {
  const value = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!value) fail('MEMORY_INPUT', '要记的内容不能为空');
  if (chars(value) > limits.entry) fail('MEMORY_INPUT', `一条最多 ${limits.entry} 字，请写成一句话；长的材料写成知识笔记，这里只记结论和笔记位置`);
  return value;
}

/**
 * 条目开头自带的日期拆出来（真模型验证时模型常把日期写进正文，记成“- 2026-11-08 2026-11-08：…”）。
 * 认 2026-11-08、2026/11/8、2026.11.8、2026年11月8日，后面可以跟冒号、逗号；日期统一写成 2026-11-08。
 */
export function splitDate(text) {
  const value = String(text ?? '').replace(/^-\s*/, '').trim();
  const match = /^(\d{4})(?:[-/.]|年)(\d{1,2})(?:[-/.]|月)(\d{1,2})日?(?=$|[\s：:，,、）)])[\s：:，,、]*/u.exec(value);
  if (!match) return { date: null, body: value };
  return { date: `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`, body: value.slice(match[0].length) };
}
// 新记一条：日期是今天，正文里自带的日期去掉。
const freshEntry = text => `- ${localDate()} ${entryText(splitDate(entryText(text)).body)}`;
// 整节重写、员工保存：保留原来的日期，没写日期的补今天。
const keptEntry = text => {
  const { date, body } = splitDate(entryText(text));
  return `- ${date ?? localDate()} ${entryText(body)}`;
};

export class ExpertMemory {
  /** @param core 鲸翼核心服务（ctx.whalewing），用它的知识库和初始化。 */
  constructor(core) {
    this.core = core;
    this.scan = null;
  }
  get vault() { return this.core.vault; }

  /** 机器标识 → 笔记路径。文件夹没变（增删改名会改文件夹时间）就用上次的结果，免得每轮都把整个文件夹读一遍。 */
  async index() {
    const folder = await this.vault.resolve(memoryFolder, true);
    let stat;
    try { stat = await fs.stat(folder); }
    catch (error) { if (error.code === 'ENOENT') return new Map(); throw error; }
    if (this.scan?.mtime === stat.mtimeMs) return this.scan.map;
    const map = new Map();
    for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const relative = `${memoryFolder}/${entry.name}`;
      try {
        const note = await this.vault.readInternal(relative);
        const id = note && frontmatter(note.content).data.expert;
        if (typeof id === 'string' && !map.has(id)) map.set(id, relative);
      } catch { /* 读不出来或属性坏了的笔记不认作谁的记忆，原样留着。 */ }
    }
    this.scan = { mtime: stat.mtimeMs, map };
    return map;
  }

  /** 这位专家的记忆笔记；知识库还没建或还没记过时返回 null。 */
  async find(expert) {
    if (!(await this.vault.initialized())) return null;
    const relative = (await this.index()).get(expert.id);
    if (!relative) return null;
    const note = await this.vault.readInternal(relative);
    if (!note) { this.scan = null; return null; }
    if (frontmatter(note.content).data.expert !== expert.id) { this.scan = null; return null; }
    return { path: relative, content: note.content, hash: note.hash };
  }

  /** 给专家上下文用的记忆正文：两节原样带上，超长截断并提醒合并。 */
  async context(expert) {
    const note = await this.find(expert).catch(() => null);
    const where = note?.path ?? memoryFileName(expert);
    if (!note) return { path: where, text: '', empty: true };
    const { body } = frontmatter(note.content);
    const parts = [];
    for (const heading of memorySections) {
      const found = sectionLines(body, heading);
      parts.push(`## ${heading}\n${found?.lines.join('\n') || '（还没有）'}`);
    }
    // 员工自己加的其他小节也带上，记忆以员工写的为准。
    const extra = normalize(body).split(/^## /m).slice(1).filter(part => !memorySections.includes(part.split('\n')[0].trim())).map(part => `## ${part.trim()}`);
    const text = [...parts, ...extra].join('\n\n');
    const over = chars(text) > limits.memory;
    return { path: note.path, text: over ? clip(text, limits.memory) : text, empty: false, over };
  }

  /** 全局记忆：关于我里“我是谁”“怎样和我协作”两节员工写了的部分。 */
  async globalContext() {
    if (!(await this.vault.initialized().catch(() => false))) return null;
    const note = await this.vault.readInternal(aboutMePath).catch(() => null);
    if (!note) return null;
    let body;
    try { body = frontmatter(note.content).body; } catch { return null; }
    const parts = [];
    for (const heading of globalSections) {
      const lines = (sectionLines(body, heading)?.lines ?? []).filter(line => !placeholder(line));
      if (lines.length) parts.push(`### ${heading}\n${lines.join('\n')}`);
    }
    if (!parts.length) return null;
    const text = parts.join('\n\n');
    return { path: aboutMePath, text: clip(text, limits.global) };
  }

  /** 读一遍再写；中间被别处改了就重读再试一次，仍冲突就报出来，不覆盖。 */
  async update(relative, change, signal) {
    for (let attempt = 0; ; attempt += 1) {
      const current = await this.vault.readInternal(relative);
      const next = change(current?.content ?? null);
      try { return await this.vault.write(relative, next, current?.hash ?? '', signal); }
      catch (error) { if (error.code !== 'CONFLICT' || attempt) throw error; }
    }
  }

  async ensureVault(signal) {
    await this.core.core.ensureReady(signal);
  }

  /** 专家改了名：写入时顺手把笔记改成新名字（旧名进 aliases）；新名字已被别的笔记占了就留在原处。 */
  async placed(expert, note, signal) {
    const target = memoryFileName(expert);
    if (!note || note.path === target || await this.vault.readInternal(target)) return note;
    const oldTitle = path.posix.basename(note.path, '.md');
    const { data } = frontmatter(note.content);
    const aliases = [...new Set([...(Array.isArray(data.aliases) ? data.aliases : []), oldTitle])];
    const renamed = normalize(note.content)
      .replace(/^aliases:.*(?:\n[ \t]+-.*)*$/m, `aliases:\n${aliases.map(alias => `  - ${JSON.stringify(alias)}`).join('\n')}`)
      .replace(/^# .*$/m, `# ${path.posix.basename(target, '.md')}`);
    const written = await this.vault.write(target, renamed, '', signal);
    await this.vault.remove(note.path, note.hash, signal);
    this.scan = null;
    return { path: written.path, content: renamed, hash: written.hash };
  }

  /** 往这位专家的记忆加一条。 */
  async add(expert, section, text, signal) {
    if (!memorySections.includes(section)) fail('MEMORY_INPUT', `只能记到“${memorySections.join('”或“')}”`);
    const entry = freshEntry(text);
    await this.ensureVault(signal);
    const note = await this.placed(expert, await this.find(expert), signal);
    const relative = note?.path ?? memoryFileName(expert);
    if (!note && await this.vault.readInternal(relative)) fail('MEMORY_TAKEN', `${relative} 已经是另一篇笔记，属性里没写这位专家；请员工改掉那篇的名字，或在它的属性里加上 expert: ${expert.id}`);
    const written = await this.update(relative, content => touch(appendEntry(content ?? memoryNote(expert), section, entry)), signal);
    this.scan = null;
    return { path: written.path, section, entry };
  }

  /** 整节重写：合并旧条目、更新进度时用。给空列表就清空这一节。 */
  async rewrite(expert, section, entries, signal) {
    if (!memorySections.includes(section)) fail('MEMORY_INPUT', `只能重写“${memorySections.join('”或“')}”`);
    if (!Array.isArray(entries) || entries.length > limits.rewrite) fail('MEMORY_INPUT', `重写时给出这一节的全部条目，最多 ${limits.rewrite} 条`);
    const lines = entries.map(keptEntry);
    await this.ensureVault(signal);
    const note = await this.placed(expert, await this.find(expert), signal);
    const relative = note?.path ?? memoryFileName(expert);
    if (!note && await this.vault.readInternal(relative)) fail('MEMORY_TAKEN', `${relative} 已经是另一篇笔记，属性里没写这位专家；请员工改掉那篇的名字，或在它的属性里加上 expert: ${expert.id}`);
    const written = await this.update(relative, content => touch(replaceSection(content ?? memoryNote(expert), section, lines)), signal);
    this.scan = null;
    return { path: written.path, section, count: lines.length };
  }

  /** 专家详情的“记忆”页：两节逐条列出（去掉行首的“- ”）；还没记过时两节都空。 */
  async read(expert) {
    const note = await this.find(expert);
    if (!note) return { path: memoryFileName(expert), empty: true, rules: [], progress: [], over: false };
    const { body } = frontmatter(note.content);
    const entries = heading => (sectionLines(body, heading)?.lines ?? []).map(line => line.replace(/^-\s*/, ''));
    const rules = entries('规矩'), progress = entries('进度');
    return { path: note.path, empty: !rules.length && !progress.length, rules, progress, over: chars([...rules, ...progress].join('\n')) > limits.memory };
  }

  /** 员工在专家详情里改完两节一起保存：一行一条，没写日期的补上今天；两节都空、又没有笔记时不建空笔记。 */
  async save(expert, { rules, progress }, signal) {
    const lines = list => list.map(item => keptEntry(String(item)));
    const rulesLines = lines(rules), progressLines = lines(progress);
    const note = await this.find(expert);
    if (!note && !rulesLines.length && !progressLines.length) return { path: memoryFileName(expert), count: 0 };
    await this.ensureVault(signal);
    const placed = await this.placed(expert, note ?? null, signal);
    const relative = placed?.path ?? memoryFileName(expert);
    if (!placed && await this.vault.readInternal(relative)) fail('MEMORY_TAKEN', `${relative} 已经是另一篇笔记，属性里没写这位专家；请改掉那篇的名字，或在它的属性里加上 expert: ${expert.id}`);
    const written = await this.update(relative, content => touch(replaceSection(replaceSection(content ?? memoryNote(expert), '规矩', rulesLines), '进度', progressLines)), signal);
    this.scan = null;
    return { path: written.path, count: rulesLines.length + progressLines.length };
  }

  /** 每位专家记了几条（名帖上显示）；没记过的不列。读不出来的笔记跳过。 */
  async counts() {
    if (!(await this.vault.initialized().catch(() => false))) return {};
    const result = {};
    for (const [id, relative] of await this.index()) {
      try {
        const note = await this.vault.readInternal(relative);
        const { body } = frontmatter(note.content);
        result[id] = (sectionLines(body, '规矩')?.lines.length ?? 0) + (sectionLines(body, '进度')?.lines.length ?? 0);
      } catch { /* 坏掉的笔记不计数，详情里打开时再报原因。 */ }
    }
    return result;
  }

  /** 员工明说“记到全局记忆”：追加到关于我的“怎样和我协作”末尾。关于我不在就不新建，请员工先建。 */
  async addGlobal(text, signal) {
    const entry = freshEntry(text);
    await this.ensureVault(signal);
    const written = await this.update(aboutMePath, content => {
      if (content === null) fail('MEMORY_GLOBAL', `知识积累里找不到 ${aboutMePath}；请员工先在知识积累里建好“关于我”，再记全局记忆`);
      if (!sectionLines(frontmatter(content).body, '怎样和我协作')) fail('MEMORY_GLOBAL', '“关于我”里没有“怎样和我协作”这一节；请员工先加上这一节，再记全局记忆');
      return touch(appendEntry(content, '怎样和我协作', entry));
    }, signal);
    return { path: written.path, section: '怎样和我协作', entry };
  }
}
