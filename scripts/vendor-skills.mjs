// 按 skill-sources.json 从 GitHub 固定提交收录开源技能到 content/skills：正文保留上游原文，
// 只做分发检查要求的最小规范化（UTF-8、LF、去行尾空格）、把说明换成中文、附来源和许可全文。
// 用法：node scripts/vendor-skills.mjs [技能名...]（需要已登录的 gh；不带参数时重建清单里的全部技能）
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillsRoot = path.resolve(here, '../content/skills');
const sources = JSON.parse(fs.readFileSync(path.join(here, 'skill-sources.json'), 'utf8'));
const only = new Set(process.argv.slice(2));
// 与 content/content.test.mjs 的分发检查一致：随包文本里不能有盘符路径或像真实凭据的示例。
const privatePath = /(?<![a-z])[A-Z]:[\\/]/iu;
const credentials = /(?:api[_-]?key|token|password)\s*[:=]\s*["']?[a-z0-9_-]{16}/iu;
const licenseName = /^licen[cs]e(?:\.md|\.txt)?$/iu;

// 只读的 GitHub 请求偶尔断连，重试三次；仍失败就整体退出，已写入的技能保持上一次的完整结果。
function gh(args) {
  for (let attempt = 1; ; attempt++) {
    try { return execFileSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { if (attempt >= 3) throw error; }
  }
}
const trees = new Map();
function tree(repo, commit) {
  const key = `${repo}@${commit}`;
  if (!trees.has(key)) trees.set(key, JSON.parse(gh([`repos/${repo}/git/trees/${commit}?recursive=1`])).tree.filter(item => item.type === 'blob'));
  return trees.get(key);
}
const blob = (repo, sha) => Buffer.from(JSON.parse(gh([`repos/${repo}/git/blobs/${sha}`])).content, 'base64');

/** 解码失败或含控制字符的文件不能随包；清单必须显式排除，不悄悄丢弃。 */
function normalize(bytes, label) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error(`${label}：不是 UTF-8 文本，请在清单 exclude 里排除`); }
  text = text.replace(/^﻿/u, '').replace(/\r\n?/gu, '\n');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text)) throw new Error(`${label}：含控制字符，请在清单 exclude 里排除`);
  return `${text.split('\n').map(line => line.trimEnd()).join('\n').replace(/\n*$/u, '')}\n`;
}

const excluded = (relative, patterns = []) => patterns.some(pattern => pattern.endsWith('/') ? relative.startsWith(pattern) : relative === pattern);

function licenseText(repo, commit) {
  const file = tree(repo, commit).find(item => !item.path.includes('/') && licenseName.test(item.path));
  if (!file) throw new Error(`${repo}：仓库根目录没有许可文件`);
  return normalize(blob(repo, file.sha), `${repo}/${file.path}`);
}

function vendor(entry) {
  const { name, repo, commit, path: source, license, description, exclude, replace = [], note, extraLicenses = [] } = entry;
  const files = new Map();
  const single = source.endsWith('.md');
  for (const item of tree(repo, commit)) {
    let relative;
    if (single) { if (item.path !== source) continue; relative = 'SKILL.md'; }
    else { if (!item.path.startsWith(`${source}/`)) continue; relative = item.path.slice(source.length + 1); }
    if (excluded(relative, exclude)) continue;
    files.set(relative, normalize(blob(repo, item.sha), `${name}/${relative}`));
  }
  if (!files.has('SKILL.md')) throw new Error(`${name}：上游路径里没有 SKILL.md`);
  for (const { file, from, to, all } of replace) {
    const text = files.get(file);
    const count = text?.split(from).length - 1;
    if (!count || (!all && count !== 1)) throw new Error(`${name}/${file}：替换文本应出现${all ? '至少' : '恰好'}一次，实际 ${count || 0} 次：${from}`);
    files.set(file, text.split(from).join(to));
  }
  // 上游的其它 frontmatter 字段多为特定客户端的设置，随包只保留名称和中文说明。
  const skill = files.get('SKILL.md');
  const match = skill.match(/^---\n[^]*?\n---\n/u);
  if (!match) throw new Error(`${name}：SKILL.md 缺少 frontmatter`);
  const url = `https://github.com/${repo}/tree/${commit}/${single ? path.posix.dirname(source) : source}`.replace(/\/\.$/u, '');
  const changes = ['技能说明换成中文', '统一为 UTF-8、LF 换行并去掉行尾空格', ...(exclude?.length ? [`未收录 ${exclude.map(item => `\`${item}\``).join('、')}`] : []), ...(note ? [note] : [])];
  files.set('SKILL.md', `---\nname: ${name}\ndescription: ${description}\n---\n${skill.slice(match[0].length).replace(/\n*$/u, '')}\n\n## 来源\n\n收录自 [${repo}](${url})（提交 \`${commit}\`，路径 \`${source}\`），${license} 许可，全文见同目录 \`LICENSE.txt\`。正文保留上游原文；鲸翼的改动：${changes.join('；')}。\n`);
  if (!files.has('LICENSE.txt')) {
    const licenses = [[repo, commit], ...extraLicenses.map(item => [item.repo, item.commit])].map(([from, at]) => [from, licenseText(from, at)]);
    files.set('LICENSE.txt', licenses.length === 1 ? licenses[0][1] : `本技能收录自以下项目，各项目的许可全文如下。\n\n${licenses.map(([from, text]) => `== ${from} ==\n\n${text}`).join('\n')}`);
  }
  for (const [relative, text] of files) {
    if (privatePath.test(text)) throw new Error(`${name}/${relative}：含盘符路径 ${text.match(privatePath)[0]}，请在清单 replace 里改成占位`);
    if (credentials.test(text)) throw new Error(`${name}/${relative}：含像凭据的示例 ${text.match(credentials)[0]}，请在清单 replace 里改成占位`);
  }
  if (files.size > 500) throw new Error(`${name}：文件数超过技能包上限`);
  const target = path.join(skillsRoot, name);
  fs.rmSync(target, { recursive: true, force: true });
  for (const [relative, text] of files) {
    const file = path.join(target, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return files.size;
}

for (const entry of sources) {
  if (only.size && !only.has(entry.name)) continue;
  console.log(`${entry.name}\t${vendor(entry)} 个文件`);
}
