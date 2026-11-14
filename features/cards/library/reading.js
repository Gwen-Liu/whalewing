import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { appendEntry, touch } from '../../experts/memory.js';
import { newsMeLimit, readingLimits } from '../contract.js';

/**
 * 每日阅读自己的本机数据（2026-11-14 改版）：阅读设置的开关、书里的划线、存过哪些资讯和技巧。
 *   whalewing-library/reading.json   和书架同一个目录，持文件锁读改写、原子替换
 * 划的原文只留在这里，不进知识库（知识库规则：书摘留在库外）；员工写的那句话才记进这本书的来源笔记。
 * “存一条”照知识库的“网页剪藏”模板在收件箱建一篇，只记链接和说明，不抄原文。
 * 知识库的读写由调用方给：read(path) 读已有笔记（没有返回 null），write(path, content, expectedHash) 新建或带指纹改写，
 * peek(path) 不初始化知识库、只看有没有这篇（给每日资讯读《关于我》和日记用）。
 */
export const readingDefaults = Object.freeze({ personal: true, diary: false, usage: true, weekly: true, review: 2 });
/** 划线后第几天到期回顾一次。 */
export const reviewOffsets = Object.freeze([1, 7, 30]);
export const aboutMePath = '30-领域/个人管理/关于我.md';
export const readingError = (code, message) => Object.assign(new Error(message), { code });

const dayMs = 86400000;
/** 北京时间的日期；知识库规则写明日期按北京时间，和电脑设的时区无关。 */
export const beijingDay = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
export const addDays = (date, count) => new Date(Date.parse(`${date}T00:00:00Z`) + count * dayMs).toISOString().slice(0, 10);
const empty = () => ({ version: 1, settings: { ...readingDefaults }, highlights: [], captures: [] });
const normalize = content => content.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const bodyOf = content => normalize(content).replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '');
const clip = (text, max) => [...text].length > max ? [...text].slice(0, max).join('') : text;
/** 文件名里不能有的字符换成空格；结尾不留点和空格。 */
const cleanName = (text, max) => String(text).replace(/[\\/:*?"<>|#^[\]\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[. ]+$/, '');

/** 这条划线下一次该回顾的日期；三次都看过了返回 null。到期没看的一直算到期，直到点了“看过了”。 */
export function dueDate(highlight) {
  const start = beijingDay(Date.parse(highlight.at));
  for (const offset of reviewOffsets) {
    const due = addDays(start, offset);
    if (!highlight.seen.some(day => day >= due)) return due;
  }
  return null;
}

/** 今天要回顾的：到期的排前面（最早到期的在前），今天已经看过的不算。 */
export function dueToday(highlights, today, count) {
  return highlights.map(highlight => ({ highlight, due: dueDate(highlight) }))
    .filter(entry => entry.due && entry.due <= today && !entry.highlight.seen.includes(today))
    .sort((a, b) => a.due.localeCompare(b.due) || a.highlight.at.localeCompare(b.highlight.at))
    .slice(0, count).map(entry => entry.highlight);
}

/** 到期的看完了“再来几条”：今天划的、今天看过的不拿，最久没看的在前。 */
export function moreToReview(highlights, today, count) {
  const last = highlight => highlight.seen.at(-1) ?? '';
  return highlights.filter(highlight => beijingDay(Date.parse(highlight.at)) < today && !highlight.seen.includes(today))
    .sort((a, b) => last(a).localeCompare(last(b)) || a.at.localeCompare(b.at)).slice(0, count);
}

/** 上一个周一到周日（北京日期）。 */
export function lastWeekRange(today) {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -weekday - 7);
  return { start: monday, end: addDays(monday, 6) };
}

export const captureNoteName = title => `网页 - ${cleanName(title, 40) || '没有标题'}`;
/** 照“网页剪藏”模板：只记链接、为什么存和鲸翼给的那句说明，不抄原文。 */
export function captureNote({ name, url, why, brief, captured, date }) {
  return [
    '---', 'type: capture', 'status: inbox', 'source_type: web', `captured: ${JSON.stringify(captured)}`, `url: ${JSON.stringify(url)}`, `created: ${date}`, `updated: ${date}`, 'aliases: []', '---', '',
    `# ${name}`, '',
    '## 为什么保存', '', ...(why ? [why, ''] : []),
    '## 原始网页或库外副本链接', '', url, '',
    '## 用自己的话概括', '', ...(brief ? [`> 每日阅读给的说明（不是你的话，读过原文后可以改）：${brief.replace(/\s+/g, ' ')}`, ''] : []),
    '## 我的第一反应', '',
    '## 后续处理', '', '- [ ] 删除', '- [ ] 转为来源笔记', '- [ ] 提炼原子笔记', '- [ ] 关联到项目', '',
  ].join('\n');
}

export const bookNotePath = title => `50-来源/书籍/书籍 - ${cleanName(title, 60) || '没有书名'}.md`;
/** 照“书籍来源”模板建一篇，状态“在读”；原文和划线不抄进来。 */
export function bookNote({ title, date }) {
  return [
    '---', 'type: source', 'source_type: book', 'status: reading', `created: ${date}`, `updated: ${date}`, 'aliases: []', '---', '',
    `# ${path.posix.basename(bookNotePath(title), '.md')}`, '',
    '## 为什么读这本书', '', '## 一句话总结', '', '## 我梳理的全书结构', '',
    '## 库外原件或书摘入口', '', '原文和划线在鲸翼每日阅读的书架里，这里不抄。', '',
    '## 章节与页码定位', '', '## 我的理解与批注', '', '## 改变了我的哪些认识', '', '## 可以采取的行动', '', '## 提炼出的原子笔记', '', '## 相关主题', '',
  ].join('\n');
}

/** 《关于我》的正文：去掉待填的整行括注和引用说明；只剩标题时算还没写，返回空串。 */
export function aboutText(content) {
  const lines = bodyOf(content).split('\n').filter(line => !/^（[^）]*）$/.test(line.trim()) && !line.trim().startsWith('>'));
  const written = lines.filter(line => line.trim() && !/^#{1,6}\s/.test(line)).join('').replace(/\s+/g, '');
  return [...written].length < 20 ? '' : lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export class Reading {
  constructor({ directory, knowledge, validate, now = () => Date.now() }) {
    Object.assign(this, { directory, knowledge, validate, now });
  }

  async file(signal) {
    signal?.throwIfAborted();
    const root = path.join(await this.directory(signal), 'whalewing-library');
    await fs.mkdir(root, { recursive: true });
    return path.join(root, 'reading.json');
  }

  async load(file) {
    let text;
    try { text = await fs.readFile(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return empty(); throw error; }
    try { return this.validate.state(JSON.parse(text)); }
    catch { throw readingError('READING_STORAGE', '划线和阅读设置的记录文件（reading.json）已损坏，未做任何修改；请从备份恢复或联系维护者'); }
  }

  async read(signal) { return this.load(await this.file(signal)); }

  /** 读改写整份记录，持文件锁，写入是原子替换。 */
  async change(signal, update) {
    const file = await this.file(signal);
    return withFileLock(file, async () => {
      const state = await this.load(file);
      const result = await update(state);
      await writeFileAtomic(file, JSON.stringify(this.validate.state(state)), { mode: 0o600 });
      return result;
    }, { signal, waitMs: 10000 });
  }

  find(state, id) {
    const highlight = state.highlights.find(item => item.id === id);
    if (!highlight) throw readingError('READING_NOT_FOUND', '这条划线已经不在了，请关掉再打开这本书看看');
    return highlight;
  }

  async home(_input, signal) {
    const state = await this.read(signal), today = beijingDay(this.now()), week = lastWeekRange(today);
    const inWeek = at => { const day = beijingDay(Date.parse(at)); return day >= week.start && day <= week.end; };
    const byBook = {};
    for (const highlight of state.highlights) byBook[highlight.book] = (byBook[highlight.book] ?? 0) + 1;
    return { home: {
      date: today, settings: state.settings, review: dueToday(state.highlights, today, state.settings.review), byBook,
      counts: { highlights: state.highlights.length, captures: state.captures.length },
      lastWeek: { highlights: state.highlights.filter(item => inWeek(item.at)).length, captures: state.captures.filter(item => inWeek(item.at)).length },
      captures: state.captures.slice(-400),
    } };
  }

  async settings({ settings }, signal) {
    // 日记开关跟着“按我的情况来挑”：上一项关了，这一项也关。
    const next = { ...settings, diary: settings.personal && settings.diary };
    return this.change(signal, state => { state.settings = next; return { settings: next }; });
  }

  async highlights({ book }, signal) {
    const state = await this.read(signal);
    return { highlights: state.highlights.filter(item => item.book === book) };
  }

  async highlight(input, signal) {
    return this.change(signal, state => {
      if (state.highlights.length >= readingLimits.highlights) throw readingError('READING_FULL', `划线已经有 ${readingLimits.highlights} 条了，请先取消一些不要的`);
      const highlight = { id: randomUUID(), ...input, note: '', at: new Date(this.now()).toISOString(), seen: [] };
      state.highlights.push(highlight);
      return { highlight };
    });
  }

  /** 员工写的那句话：存在划线上，并记进知识库里这本书的来源笔记（没有就照模板建）。知识库没写成时划线上的那句照样留着。 */
  async note({ id, note }, signal) {
    const { highlight, changed } = await this.change(signal, state => {
      const item = this.find(state, id), before = item.note;
      item.note = note;
      return { highlight: { ...item }, changed: Boolean(note) && note !== before };
    });
    if (!changed) return { highlight };
    const date = beijingDay(this.now()), relative = bookNotePath(highlight.bookTitle);
    const entry = `- ${date} 第 ${highlight.chapter + 1} 章${highlight.chapterTitle ? `《${highlight.chapterTitle}》` : ''}：${note.replace(/\s+/g, ' ')}`;
    for (let attempt = 0; ; attempt += 1) {
      const current = await this.knowledge.read(relative, signal);
      const base = current?.content ?? bookNote({ title: highlight.bookTitle, date });
      try {
        await this.knowledge.write(relative, touch(appendEntry(base, '我的理解与批注', entry), date), current?.hash ?? '', signal);
        return { highlight, note: { path: relative, created: !current } };
      } catch (error) {
        // 这篇笔记刚被别处改过：重读一次再写；还不行就把原因带回去，划线上的那句已经存好。
        if (error.code !== 'CONFLICT' || attempt) throw readingError('READING_NOTE', `这句话已经记在划线上，但没能写进知识积累的《${path.posix.basename(relative, '.md')}》：${String(error.message).replace(/^[A-Z_]+: /, '')}`);
      }
    }
  }

  async unhighlight({ id }, signal) {
    return this.change(signal, state => {
      const removed = this.find(state, id);
      state.highlights = state.highlights.filter(item => item.id !== id);
      return { removed };
    });
  }

  async restore({ highlight }, signal) {
    return this.change(signal, state => {
      if (!state.highlights.some(item => item.id === highlight.id)) state.highlights.push(highlight);
      state.highlights.sort((a, b) => a.at.localeCompare(b.at));
      return { highlight };
    });
  }

  async looked({ id }, signal) {
    const today = beijingDay(this.now());
    return this.change(signal, state => {
      const highlight = this.find(state, id);
      if (!highlight.seen.includes(today)) highlight.seen = [...highlight.seen, today].slice(-400);
      return { review: dueToday(state.highlights, today, state.settings.review) };
    });
  }

  async more(_input, signal) {
    const state = await this.read(signal), today = beijingDay(this.now());
    return { review: moreToReview(state.highlights, today, state.settings.review || 2) };
  }

  /** 存一条：在收件箱建一篇网页剪藏；同名不覆盖，另起“名字 2”。存过的直接告诉是哪一篇。 */
  async capture({ key, title, brief, url, why }, signal) {
    const saved = (await this.read(signal)).captures.find(item => item.key === key);
    if (saved) return { capture: saved };
    const now = this.now(), date = beijingDay(now), captured = `${date} ${new Date(now + 8 * 3600000).toISOString().slice(11, 16)}`, base = captureNoteName(title);
    for (let attempt = 1; attempt <= 9; attempt += 1) {
      const name = attempt === 1 ? base : `${base} ${attempt}`;
      try {
        const written = await this.knowledge.write(`10-收件箱/${name}.md`, captureNote({ name, url, why, brief, captured, date }), '', signal);
        const capture = { key, path: written.path, name, at: new Date(now).toISOString() };
        await this.change(signal, state => { state.captures = [...state.captures.filter(item => item.key !== key), capture].slice(-readingLimits.captures); });
        return { capture };
      } catch (error) { if (error.code !== 'CONFLICT') throw error; }
    }
    throw readingError('READING_NAME_TAKEN', '收件箱里同名的笔记太多了，请先去知识积累整理一下');
  }

  /** 书从书架删掉时，这本书的划线一起删。 */
  async dropBook(id, signal) {
    return this.change(signal, state => { state.highlights = state.highlights.filter(item => item.book !== id); });
  }

  /**
   * 给每日资讯用：阅读设置“按我的情况来挑”开着、《关于我》有内容时返回 { about, diary? }，否则 null。
   * 日记只在另一个开关开着时带，最近 7 天、新的在前，和《关于我》合计不超过上限。读不到按没有处理，不让资讯任务失败。
   */
  async me(signal) {
    let settings;
    try { settings = (await this.read(signal)).settings; } catch { return null; }
    if (!settings.personal) return null;
    const peek = async relative => { try { return await this.knowledge.peek(relative, signal); } catch { return null; } };
    const note = await peek(aboutMePath);
    const about = note ? clip(aboutText(note.content), newsMeLimit) : '';
    if (!about) return null;
    if (!settings.diary) return { about };
    const today = beijingDay(this.now()), days = [];
    let room = newsMeLimit - [...about].length;
    for (let back = 0; back < 7 && room > 80; back += 1) {
      const date = addDays(today, -back), entry = await peek(`60-时间线/日记/${date.slice(0, 4)}/${date}.md`);
      const text = entry ? clip(bodyOf(entry.content).replace(/\n{3,}/g, '\n\n').trim(), Math.min(700, room - 16)) : '';
      if (!text) continue;
      days.push(`【${date}】\n${text}`);
      room -= [...text].length + 16;
    }
    return days.length ? { about, diary: days.join('\n\n') } : { about };
  }

  /** 每日资讯要不要出上周回顾。 */
  async weekly(signal) { try { return (await this.read(signal)).settings.weekly; } catch { return false; } }
}
