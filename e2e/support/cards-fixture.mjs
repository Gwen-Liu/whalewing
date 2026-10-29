// 知识卡片的测试数据：历史日报（每日资讯、AI 使用技巧）在启动前用 DSH 自己的存储组件写进临时 DSH_HOME，
// 和插件运行时读的是同一个存储域；电子书在测试里现做 TXT（UTF-8、GBK 两种编码），走界面导入。不联网。
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import { newsDomain, newsWindow } from '../../features/cards/news.js';
import { beijingDate, tipIndex } from '../../features/cards/tip-index.js';

const dayMs = 86400000;
const cutoffOf = date => `${date}T00:00:00.000Z`;
/** 日期加减天数（YYYY-MM-DD）。 */
export const shiftDate = (date, days) => new Date(Date.parse(cutoffOf(date)) + days * dayMs).toISOString().slice(0, 10);

/**
 * 按“现在”算出这次测试的日报安排。period 是最近一个已经截止的 08:00 期次（北京 08:00 前就是昨天那期），
 * today 是北京时间的今天；两者在 08:00 前相差一天，测试按同一套算法得到预期。
 *   AI 与科技：本期 10 条（超过 8 条，只应显示前 8 条）。
 *   鲸翼测试-昨日领域：只有上一期（本期没有，用来检查不把旧日报当成本期）。
 *   AI 使用技巧：本期 3 条、上一期 2 条且部分来源失败、再往前连续 3 天没有日报、再往前 2 条；
 *   约一个月前连续 7 天各 3 条（时间线够长，刻度尺按月跳过去时那一期能滚到顶端），约两个月前 1 条。
 */
export function cardsPlan(now = Date.now()) {
  const today = beijingDate(now), period = newsWindow(now).cutoff.slice(0, 10);
  const tips = [
    { date: period, count: 3, status: 'complete' },
    { date: shiftDate(period, -1), count: 2, status: 'partial' },
    { date: shiftDate(period, -5), count: 2, status: 'complete' },
    ...Array.from({ length: 7 }, (_, i) => ({ date: shiftDate(period, -40 - i), count: 3, status: 'complete' })),
    { date: shiftDate(period, -75), count: 1, status: 'complete' },
  ];
  return {
    today, period, previous: shiftDate(period, -1), tips,
    gap: [shiftDate(period, -2), shiftDate(period, -4)],
    news: { fieldId: 'ai-technology', fieldName: 'AI 与科技', date: period, count: 10 },
    stale: { fieldId: 'e2e-stale-field', fieldName: '鲸翼测试-昨日领域', date: shiftDate(period, -1), count: 2 },
  };
}

const feedSource = (name, extra = {}) => ({ name, url: `https://example.com/${encodeURIComponent(name)}/feed.xml`, kind: 'primary', region: 'overseas', ...extra });
const categories = ['model', 'agent', 'opensource', 'media', 'research'];

/** 一条日报条目：标题带日期和序号，测试按它断言显示了哪些条目。 */
export const newsTitle = (fieldName, date, i) => `${fieldName} ${date} 第 ${i + 1} 条测试资讯`;
export const tipTitle = (date, i) => `${date} 第 ${i + 1} 条测试技巧：先列清单再动手`;

function item({ fieldId, fieldName, date, i, tips }) {
  const url = `https://example.com/${fieldId}/${date}/${i + 1}`;
  const source = feedSource(i % 2 ? '测试来源乙' : '测试来源甲');
  const title = tips ? tipTitle(date, i) : newsTitle(fieldName, date, i);
  return {
    category: categories[i % categories.length], label: 'official', title, link: url,
    brief: tips ? `${date} 第 ${i + 1} 条的做法：把任务拆成三步，每步写清楚输入和输出。` : `${date} 第 ${i + 1} 条的一句话说明。`,
    relevance: tips ? '' : '测试用的关联说明', eventKey: `${fieldId}-${date}-${i}`,
    sources: [{ id: createHash('sha256').update(url).digest('hex'), title: `原文标题 ${date} ${i + 1}`, url, publishedAt: `${shiftDate(date, -1)}T12:00:00.000Z`, eventTime: null, collectedAt: cutoffOf(date), excerpt: '测试正文摘要。', source }],
  };
}

function report({ fieldId, fieldName, date, count, status = 'complete', tips = false }) {
  const sourceStatus = [{ ...feedSource('测试来源甲'), status: 'ok', candidates: count }];
  if (status === 'partial') sourceStatus.push({ ...feedSource('测试来源丙'), status: 'failed', message: '测试：来源超时' });
  return {
    fieldId, fieldName, fieldRevision: 1, start: cutoffOf(shiftDate(date, -1)), cutoff: cutoffOf(date), sessionId: 'e2e-news-session', completedAt: cutoffOf(date),
    items: Array.from({ length: count }, (_, i) => item({ fieldId, fieldName, date, i, tips })), sourceStatus, status, coverage: '功能测试数据',
  };
}

/** 技巧卡和技巧历史“当天首页”那条的序号，和插件同一个算法。 */
export const featuredTip = (date, count) => tipIndex(date, count);

/**
 * 把 plan 里的日报写进 <home>/storages 下资讯存储域（名字带 profile 目录真实路径的指纹，和插件运行时一致）。
 * 领域配置（AI 与科技、AI 使用技巧）由插件启动时自己建；只额外登记“昨日领域”，让它像员工自己加的领域。
 */
export async function seedCardsNews(home, plan, profile = 'e2e') {
  const directory = await fs.realpath(path.join(home, 'profiles', profile));
  const ctx = new Context();
  try {
    await ctx.plugin(Storage); await ctx.plugin(StorageJson, { root: path.join(home, 'storages') }); await ctx.plugin(StorageDomain, { backend: 'json' });
    const domain = await ctx.storageDomain.open({ ...newsDomain, name: `${newsDomain.name}_${createHash('sha256').update(directory).digest('hex')}` });
    const reports = domain.table('reports'), fields = domain.table('fields');
    const put = value => reports.put(`${value.fieldId}/${value.cutoff}`, value);
    await put(report(plan.news));
    await put(report(plan.stale));
    for (const day of plan.tips) await put(report({ fieldId: 'ai-tips', fieldName: 'AI 使用技巧', ...day, tips: true }));
    await fields.put(plan.stale.fieldId, { id: plan.stale.fieldId, revision: 1, deleted: false, name: plan.stale.fieldName, focus: '功能测试用的领域，只有上一期日报。', enabled: true, sources: [feedSource('测试来源甲', { url: 'https://example.com/stale/feed.xml' })] });
    await domain.close();
  } finally { await ctx.fiber.dispose(); }
}

/** 书架目录：<home>/profiles/<profile>/whalewing-library。 */
export const libraryDir = (home, profile = 'e2e') => path.join(home, 'profiles', profile, 'whalewing-library');

/** 一本 TXT 书的正文：“第一章 …”这样的标题加若干段落。longFirst 让第一章长到阅读器里要翻好几页。 */
export function bookText(chapters, { lead = '' } = {}) {
  return [lead, ...chapters.map(([heading, paragraphs]) => [heading, ...paragraphs].join('\n'))].filter(Boolean).join('\n\n') + '\n';
}

/** 生成 n 段测试正文，每段约 100 字，带章名，便于断言读到的是哪一章。 */
export const paragraphs = (label, n) => Array.from({ length: n }, (_, i) => `${label}第 ${i + 1} 段：鲸翼功能测试的正文，用来检查分章、翻页和阅读进度。这一段写满一百个字左右，内容没有实际意义，只是让章节有足够的篇幅，读者翻过本章最后一页时进入下一章。`);

let gbkTable;
/** 把文字编码成 GBK：用浏览器同款的 GBK 解码表反查，测试只用常见汉字和标点。 */
export function gbk(text) {
  if (!gbkTable) {
    gbkTable = new Map();
    const decoder = new TextDecoder('gbk');
    for (let lead = 0x81; lead <= 0xfe; lead++) for (let trail = 0x40; trail <= 0xfe; trail++) {
      if (trail === 0x7f) continue;
      const char = decoder.decode(Uint8Array.of(lead, trail));
      if (char.length === 1 && char !== '�' && !gbkTable.has(char)) gbkTable.set(char, [lead, trail]);
    }
  }
  const bytes = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code < 0x80) { bytes.push(code); continue; }
    const pair = gbkTable.get(char);
    if (!pair) throw new Error(`测试文字里有 GBK 不能表示的字：${char}`);
    bytes.push(...pair);
  }
  return Buffer.from(bytes);
}

/** 文件的 SHA-256，用来核对原件没被改。 */
export const sha256 = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
