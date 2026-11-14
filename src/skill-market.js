import { abort, fail, frontmatter } from './vault.js';

// 技能市场只接 skills.sh（2026-11-09 用户定）：首页、搜索、下载都是它网站和命令行工具自己在用的公开地址，不用登录。
export const marketOrigin = 'https://skills.sh';
const listLimit = 60;
const textDecoder = new TextDecoder('utf-8', { fatal: true });
// owner/repo/skill：owner、repo 照 GitHub 的写法，skill 是技能名。
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._:-]{1,120}$/;

/** skills.sh 的一条技能：id 是“来源仓库/技能名”，installs 是它统计的安装次数。 */
function item(source, skillId, name, installs, official) {
  const id = `${source}/${skillId}`;
  if (!idPattern.test(id) || typeof name !== 'string' || !name || name.length > 120) return null;
  return { id, source, name, installs: Number.isSafeInteger(installs) && installs >= 0 ? installs : 0, ...(official ? { official: true } : {}) };
}

/** 首页里嵌着排行榜（总安装量从高到低，带“官方”标记）；它改版读不出来时只说明一句，搜索照常能用。 */
export function parseHome(html) {
  const found = new Map();
  const pattern = /\\?"source\\?":\\?"([^"\\]+)\\?",\\?"skillId\\?":\\?"([^"\\]+)\\?",\\?"name\\?":\\?"([^"\\]+)\\?",\\?"installs\\?":(\d+)(?:,\\?"weeklyInstalls\\?":\[[\d,]*\])?(?:,\\?"isOfficial\\?":(true|false))?/g;
  for (const match of html.matchAll(pattern)) {
    const value = item(match[1], match[2], match[3], Number(match[4]), match[5] === 'true');
    if (value && !found.has(value.id)) found.set(value.id, value);
  }
  return [...found.values()].sort((a, b) => b.installs - a.installs);
}

/** 下载回来的技能文件：只收文本或 base64 内容，路径和大小交给技能库再查一遍。 */
function readFiles(value) {
  if (!value || !Array.isArray(value.files) || !value.files.length || value.files.length > 500) fail('MARKET_REPLY', 'skills.sh 返回的技能文件不完整，请稍后重试');
  return value.files.map(file => {
    if (typeof file?.path !== 'string' || typeof file.contents !== 'string') fail('MARKET_REPLY', 'skills.sh 返回的技能文件不完整，请稍后重试');
    const bytes = file.encoding === 'base64' ? Buffer.from(file.contents, 'base64') : Buffer.from(file.contents, 'utf8');
    return { path: file.path.replaceAll('\\', '/'), bytes };
  });
}

/** 员工搜、看、装 skills.sh 上的技能；装进去就是“我的”里的普通个人技能，并记下从哪来。 */
export class SkillMarket {
  constructor(library, { fetch: fetchImpl = globalThis.fetch, timeoutMs = 20000, now = () => Date.now() } = {}) {
    this.library = library; this.fetch = fetchImpl; this.timeoutMs = timeoutMs; this.now = now;
    this.homeCache = null; this.previews = new Map();
  }

  async request(path, signal, kind = 'json') {
    let response;
    try { response = await this.fetch(`${marketOrigin}${path}`, { headers: { accept: kind === 'json' ? 'application/json' : 'text/html' }, redirect: 'follow', signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) }); }
    catch (error) {
      abort(signal);
      fail('MARKET_NETWORK', error?.name === 'TimeoutError' ? '连 skills.sh 超时了，请检查网络后重试' : `连不上 skills.sh：${error?.message || error}`);
    }
    if (response.status === 404) fail('MARKET_MISSING', 'skills.sh 上找不到这项技能了，可能被作者删掉或改名');
    if (response.status === 429) fail('MARKET_BUSY', 'skills.sh 说请求太频繁，请过一分钟再试');
    if (!response.ok) fail('MARKET_NETWORK', `skills.sh 暂时没响应（${response.status}），请稍后重试`);
    try { return kind === 'json' ? await response.json() : await response.text(); }
    catch { abort(signal); fail('MARKET_REPLY', 'skills.sh 返回的内容读不懂，请稍后重试'); }
  }

  /** 发现页首屏：官方出的、安装最多的。十分钟内重复打开用上次的结果，员工点“刷新”才重新取。 */
  async home(refresh, signal) {
    if (!refresh && this.homeCache && this.now() - this.homeCache.at < 600000) return this.homeCache.value;
    const html = await this.request('/', signal, 'html');
    const all = parseHome(String(html));
    const value = all.length
      ? { official: all.filter(entry => entry.official).slice(0, listLimit), popular: all.slice(0, listLimit), total: all.length }
      : { official: [], popular: [], total: 0, issue: 'skills.sh 首页改版了，排行榜暂时读不出来；可以直接搜索' };
    this.homeCache = { at: this.now(), value };
    return value;
  }

  async search(query, signal) {
    const text = String(query ?? '').trim();
    if (text.length < 2) return { skills: [] };
    const value = await this.request(`/api/search?${new URLSearchParams({ q: text.slice(0, 100), limit: String(listLimit) })}`, signal);
    const skills = (Array.isArray(value?.skills) ? value.skills : []).map(entry => item(entry?.source, entry?.skillId, entry?.name, entry?.installs, false)).filter(Boolean);
    return { skills };
  }

  async download(id, signal) {
    if (!idPattern.test(id)) fail('MARKET_ID', '技能地址不对，请从发现页重新选择');
    const parts = id.split('/');
    const value = await this.request(`/api/download/${parts.map(encodeURIComponent).join('/')}`, signal);
    const files = readFiles(value);
    const hash = typeof value.hash === 'string' && /^[0-9a-f]{16,128}$/i.test(value.hash) ? value.hash : '';
    if (!hash) fail('MARKET_REPLY', 'skills.sh 没给出这项技能的指纹，不能确认下载完整，请稍后重试');
    return { files, hash };
  }

  /** 装之前先看一眼：说明、带了哪些文件、有没有脚本、本机有没有同名的。下载结果留十分钟，安装时核对指纹用同一份。 */
  async preview(id, signal) {
    const { files, hash } = await this.download(id, signal);
    const instruction = files.find(file => file.path === 'SKILL.md');
    if (!instruction) fail('MARKET_REPLY', '这项技能缺 SKILL.md，装不了');
    let content;
    try { content = textDecoder.decode(instruction.bytes); } catch { fail('MARKET_REPLY', '这项技能的 SKILL.md 不是 UTF-8 文本，装不了'); }
    let data = {};
    try { ({ data } = frontmatter(content.replace(/^﻿/, ''))); } catch { /* 说明读不出来时界面写“没有说明”，装的时候技能库会再查格式。 */ }
    const scripts = files.filter(file => /\.(py|js|mjs|cjs|ts|sh|bash|ps1|bat|cmd|rb|pl|exe)$/i.test(file.path)).map(file => file.path);
    this.previews.set(id, { at: this.now(), hash, files });
    for (const [key, value] of this.previews) if (this.now() - value.at > 600000) this.previews.delete(key);
    return {
      preview: {
        id, hash, name: typeof data.name === 'string' ? data.name : id.split('/').at(-1), description: typeof data.description === 'string' ? data.description.slice(0, 2000) : '',
        content: content.slice(0, 262144), files: files.map(file => ({ path: file.path, size: file.bytes.length })).slice(0, 500), scripts: scripts.slice(0, 100),
      },
    };
  }

  /** 安装只装员工预览过的那一份：指纹变了（作者刚更新）就停下，请员工重新看一眼。 */
  async install(id, expectedHash, signal) {
    let cached = this.previews.get(id);
    if (!cached || cached.hash !== expectedHash) {
      cached = await this.download(id, signal);
      if (cached.hash !== expectedHash) fail('MARKET_CHANGED', '这项技能在 skills.sh 上刚更新过，请重新打开看一眼再装');
    }
    const result = await this.library.importBundle(cached.files, { kind: 'skills.sh', id, hash: cached.hash, installedAt: new Date(this.now()).toISOString() }, signal);
    this.previews.delete(id);
    return result;
  }
}
