import * as fs from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { abort, digest, fail, frontmatter, relativeName } from './vault.js';
import { skillArea, stat } from './skill-files.js';

// 插件包（2026-11-09 用户定，照 Claude 的插件包）：一个包里装一组技能和 MCP，按场景或岗位打好，一次装上、一起开关、一起卸载。
// 包的格式就是 Claude 插件包的格式：.claude-plugin/plugin.json、skills/<技能>/SKILL.md、.mcp.json；
// 里面的命令（commands）、子智能体（agents）、钩子（hooks）、LSP 这些 DSH 用不上，装的时候跳过并说明。
// 装好的包整个放在技能目录的鲸翼区里，技能按扩展技能目录交给 DSH 发现（不复制成个人技能），MCP 交给鲸翼的 MCP 挂载。
export const packArea = `${skillArea}/packs`;
export const packRecord = '.whalewing-pack.json';
export const packNamePattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const maxFiles = 500, maxBytes = 32 * 1024 * 1024, maxFileBytes = 16 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const junk = name => /(^|\/)(__MACOSX|\.git)(\/|$)/.test(name) || /(^|\/)(\.DS_Store|Thumbs\.db)$/.test(name);
// ${变量}、${变量:-默认值}，以及 Claude 插件包 userConfig 里声明的 ${user_config.键}。
const variable = /\$\{([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)(?::-([^}]*))?\}/g;
const secretName = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS$|AUTH|CREDENTIAL|COOKIE|PRIVATE/i;

/** 压缩包摊成文件清单。prefix 只取这个文件夹里面的（GitHub 下载的整个仓库）；没有 prefix 时，外面套了一层文件夹就去掉这一层。 */
export function filesFromZip(bytes, { prefix } = {}) {
  let entries;
  try { entries = unzipSync(bytes, { filter: file => file.originalSize <= maxFileBytes }); }
  catch { fail('PACK_FORMAT', '压缩包打不开，请重新打包成 .zip 再上传'); }
  let list = Object.entries(entries).filter(([name]) => !name.endsWith('/') && !junk(name)).map(([name, data]) => ({ path: name.replaceAll('\\', '/').replace(/^\.\//, ''), bytes: Buffer.from(data) }));
  if (prefix !== undefined) {
    // GitHub 的仓库压缩包外面总有一层“仓库名-版本”文件夹。
    const [top] = new Set(list.map(file => file.path.split('/')[0]));
    const base = [top, ...String(prefix).split('/').filter(part => part && part !== '.')].join('/') + '/';
    list = list.filter(file => file.path.startsWith(base)).map(file => ({ ...file, path: file.path.slice(base.length) }));
    return list;
  }
  if (!list.some(file => file.path.startsWith('.claude-plugin/') || file.path === '.mcp.json' || file.path.startsWith('skills/'))) {
    const tops = new Set(list.map(file => file.path.split('/')[0]));
    const [top] = tops;
    if (tops.size === 1 && list.every(file => file.path.startsWith(`${top}/`))) list = list.map(file => ({ ...file, path: file.path.slice(top.length + 1) }));
  }
  return list;
}

const textOf = (file, label) => {
  try { return utf8.decode(file.bytes).replace(/^﻿/, ''); } catch { fail('PACK_FORMAT', `${label} 不是 UTF-8 文本`); }
};
const jsonOf = (file, label) => {
  try { return JSON.parse(textOf(file, label)); } catch (error) { if (error.code) throw error; fail('PACK_FORMAT', `${label} 不是合法的 JSON`); }
};
const clip = (value, size) => typeof value === 'string' ? value.trim().slice(0, size) : '';
const authorOf = value => clip(typeof value === 'string' ? value : value?.name, 120);
const local = value => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');

/**
 * 一个 MCP 的安装计划：照 Claude 的写法读 command/args/env 或 type/url/headers。
 * ${变量} 是要员工填的项（像密钥的标成密钥，${变量:-默认值} 可不填）；${CLAUDE_PLUGIN_ROOT} 换成装好后包所在的文件夹。
 * DSH 连不了的（浏览器授权、老式 SSE）标出原因，不装。
 */
export function planServer(key, config, { root, data, userConfig = {} }) {
  const title = clip(key, 40) || 'mcp';
  if (!config || typeof config !== 'object' || Array.isArray(config)) return { key, title, transport: 'stdio', target: '', fields: [], blocked: '配置写得不对，读不懂' };
  const fields = new Map();
  const place = text => String(text ?? '').replaceAll('${CLAUDE_PLUGIN_ROOT}', root).replaceAll('${CLAUDE_PLUGIN_DATA}', data);
  const collect = (text, secret) => {
    for (const match of place(text).matchAll(variable)) {
      const [, id] = match;
      const spec = id.startsWith('user_config.') ? userConfig[id.slice(12)] : undefined;
      const declared = spec && typeof spec === 'object' ? spec : undefined;
      const fallback = match[2] ?? (declared && ['string', 'number'].includes(typeof declared.default) && String(declared.default) !== '' ? String(declared.default) : undefined);
      const previous = fields.get(id);
      const name = id.split('.').at(-1);
      fields.set(id, {
        id, label: clip(declared?.title, 80) || name, secret: Boolean(previous?.secret || secret || declared?.sensitive || secretName.test(name)),
        required: previous ? previous.required && fallback === undefined : fallback === undefined && declared?.required !== false,
        ...(clip(declared?.description, 300) ? { help: clip(declared.description, 300) } : {}),
        ...(fallback !== undefined ? { fallback } : previous?.fallback !== undefined ? { fallback: previous.fallback } : {}),
      });
    }
  };
  const type = String(config.type ?? (config.command ? 'stdio' : config.url !== undefined ? 'http' : '')).toLowerCase();
  const pairs = (value, secretHeader) => Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {}).slice(0, 50).map(([name, item]) => {
    const text = place(typeof item === 'string' ? item : String(item ?? ''));
    collect(text, secretHeader?.(name));
    return { name: String(name).slice(0, 200), value: text.slice(0, 8000) };
  });
  if (type === 'stdio') {
    const command = place(config.command).trim();
    const args = (Array.isArray(config.args) ? config.args : []).slice(0, 50).map(item => place(item).slice(0, 2000));
    collect(command); args.forEach(item => collect(item));
    const env = pairs(config.env);
    const cwd = config.cwd ? place(config.cwd).slice(0, 1000) : undefined;
    const plan = { key, title, transport: 'stdio', command: command.slice(0, 500), args, env, ...(cwd ? { cwd } : {}), target: [command, ...args].join(' ').slice(0, 500), fields: [...fields.values()] };
    if (!command) plan.blocked = '没写要运行的命令';
    return plan;
  }
  const url = place(config.url).trim();
  const headers = pairs(config.headers, name => /^(authorization|x-api-key|api-key|x-auth-token)$/i.test(name));
  collect(url);
  if (!url) fields.set('__url', { id: '__url', label: '服务地址', secret: false, required: true, help: '这个包没写地址，要填你自己的服务地址（以 https:// 开头）' });
  const plan = { key, title, transport: 'streamable-http', url: url.slice(0, 4000), headers, target: url ? url.replace(/\?.*$/, '') : '（要填地址）', fields: [...fields.values()] };
  if (config.oauth || config.auth?.type === 'oauth') plan.blocked = '要在浏览器里授权登录（OAuth），DSH 的 MCP 暂时不支持';
  else if (type === 'sse') plan.blocked = '用的是老式 SSE 连接，DSH 的 MCP 不支持';
  else if (!['http', 'streamable-http', 'streamablehttp'].includes(type)) plan.blocked = `连接方式“${type || '没写'}”DSH 不支持`;
  // 远程服务一个密钥也没带：多半是连上时才弹浏览器授权的那种，DSH 连不上；默认不勾，员工知道能用再勾。
  else if (url && !headers.length && !fields.size) plan.hint = '没带任何密钥，这类远程服务多半要在浏览器里授权登录，DSH 可能连不上';
  return plan;
}

/** 照计划和员工填的值拼出要保存的 MCP；必填的没填时返回 { missing }。可选项没填时，用到它的环境变量或请求头整行不带。 */
export function composePackServer(plan, values, { name, title }) {
  const value = id => String(values?.[id] ?? '').trim() || String(plan.fields.find(field => field.id === id)?.fallback ?? '');
  const missing = plan.fields.filter(field => field.required && !value(field.id)).map(field => field.label);
  if (missing.length) return { missing };
  const used = text => [...String(text).matchAll(variable)].map(match => match[1]);
  const fill = text => String(text).replace(variable, (_, id) => value(id));
  const secretOf = text => used(text).some(id => plan.fields.find(field => field.id === id)?.secret);
  const rows = list => list.filter(row => !used(row.value).some(id => !value(id))).map(row => ({ name: row.name, value: fill(row.value), secret: secretOf(row.value) }));
  const server = { name, title, transport: plan.transport, env: [], headers: [] };
  if (plan.transport === 'stdio') Object.assign(server, { command: fill(plan.command), args: plan.args.map(fill), env: rows(plan.env), ...(plan.cwd ? { cwd: fill(plan.cwd) } : {}) });
  else {
    const url = plan.url ? fill(plan.url) : value('__url');
    if (!/^https?:\/\//.test(url)) return { missing: ['以 http:// 或 https:// 开头的服务地址'] };
    Object.assign(server, { url, urlSecret: secretOf(plan.url), headers: rows(plan.headers) });
  }
  return { server };
}

/**
 * 读一个插件包：说明、技能、MCP，以及 DSH 用不上、要跳过的部分。list 是包里的文件（相对包的根）；
 * rootFor(名字) 给出装好后包所在的文件夹，用来换 ${CLAUDE_PLUGIN_ROOT}。
 */
export function readPack(list, { rootFor, displayName } = {}) {
  if (!list.length) fail('PACK_FORMAT', '包里没有文件');
  if (list.length > maxFiles) fail('PACK_SIZE', `插件包里的文件太多（最多 ${maxFiles} 个）`);
  let bytes = 0;
  for (const file of list) {
    try { relativeName(file.path, true); } catch { fail('PACK_FORMAT', `包里有个文件名电脑存不下：${file.path.slice(0, 120)}`); }
    if (file.path.split('/').length > 12) fail('PACK_SIZE', '插件包的文件夹层级太深（最多 12 层）');
    if ((bytes += file.bytes.length) > maxBytes) fail('PACK_SIZE', '插件包太大（最多 32 MB）');
  }
  const files = new Map(list.map(file => [file.path, file]));
  const manifestFile = files.get('.claude-plugin/plugin.json');
  if (!manifestFile) fail('PACK_FORMAT', '这不是插件包：最上层要有 .claude-plugin/plugin.json（压缩包里可以再套一层文件夹）');
  const manifest = jsonOf(manifestFile, 'plugin.json');
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('PACK_FORMAT', 'plugin.json 写得不对');
  const name = String(manifest.name ?? '');
  if (!packNamePattern.test(name) || name.length > 64) fail('PACK_NAME', 'plugin.json 里的名称（name）要用英文小写字母、数字和短横线，最长 64 个字符');
  const root = rootFor ? rootFor(name) : name;

  // 技能：默认在 skills/ 下一层；plugin.json 的 skills 可以另指文件夹（直接是一个技能，或下面一层是技能）。
  const places = (Array.isArray(manifest.skills) ? manifest.skills : typeof manifest.skills === 'string' ? [manifest.skills] : ['skills']).map(local).filter(Boolean);
  const skills = [], issues = [], seen = new Set();
  const addSkill = dir => {
    if (seen.has(dir)) return; seen.add(dir);
    const label = `${dir}/SKILL.md`;
    try {
      // 和 DSH 发现技能的规则一致：属性区要有名称和说明，其他照原样。
      let data;
      try { ({ data } = frontmatter(textOf(files.get(label), label))); } catch (error) { if (error.code === 'PACK_FORMAT') throw error; fail('PACK_SKILL', 'SKILL.md 开头缺属性区'); }
      if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 120) fail('PACK_SKILL', 'SKILL.md 缺少名称（name）');
      if (typeof data.description !== 'string' || !data.description.trim()) fail('PACK_SKILL', 'SKILL.md 缺少说明（description）');
      skills.push({ name: data.name.trim(), description: clip(data.description, 1000), dir });
    } catch (error) { issues.push(`技能「${dir.split('/').at(-1)}」没装：${String(error.message).replace(/^[A-Z_]+: /, '')}`); }
  };
  for (const place of places) {
    if (files.has(`${place}/SKILL.md`)) { addSkill(place); continue; }
    for (const file of list) {
      const match = file.path.startsWith(`${place}/`) && /^([^/]+)\/SKILL\.md$/.exec(file.path.slice(place.length + 1));
      if (match) addSkill(`${place}/${match[1]}`);
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  const duplicate = skills.find((skill, index) => skills.findIndex(other => other.name === skill.name) !== index);
  if (duplicate) fail('PACK_SKILL', `包里有两项技能都叫「${duplicate.name}」`);

  // MCP：plugin.json 里直接写的，或它指的 json 文件，否则最上层的 .mcp.json。
  let servers = {};
  const sources = manifest.mcpServers && typeof manifest.mcpServers === 'object' && !Array.isArray(manifest.mcpServers) ? [manifest.mcpServers]
    : (Array.isArray(manifest.mcpServers) ? manifest.mcpServers : typeof manifest.mcpServers === 'string' ? [manifest.mcpServers] : files.has('.mcp.json') ? ['.mcp.json'] : []).map(item => {
      const file = typeof item === 'string' && files.get(local(item));
      if (!file) { issues.push(`没找到 MCP 配置文件 ${String(item).slice(0, 120)}`); return {}; }
      return jsonOf(file, local(item));
    });
  for (const value of sources) {
    const map = value?.mcpServers && typeof value.mcpServers === 'object' ? value.mcpServers : value;
    if (map && typeof map === 'object' && !Array.isArray(map)) servers = { ...servers, ...map };
  }
  const data = path.join(root, '.data');
  const userConfig = manifest.userConfig && typeof manifest.userConfig === 'object' && !Array.isArray(manifest.userConfig) ? manifest.userConfig : {};
  const mcp = Object.entries(servers).slice(0, 30).map(([key, config]) => planServer(key, config, { root, data, userConfig }));

  const count = folder => list.filter(file => file.path.startsWith(`${folder}/`) && file.path.endsWith('.md')).length;
  const skipped = {
    commands: count(local(typeof manifest.commands === 'string' ? manifest.commands : 'commands')),
    agents: count(local(typeof manifest.agents === 'string' ? manifest.agents : 'agents')),
    hooks: Boolean(manifest.hooks || files.has('hooks/hooks.json')),
    lsp: Boolean(manifest.lspServers || files.has('.lsp.json')),
  };
  const hash = digest(JSON.stringify([...files.keys()].sort().map(file => [file, digest(files.get(file).bytes)])));
  return {
    name, title: clip(displayName, 80) || clip(manifest.displayName, 80) || name, description: clip(manifest.description, 2000), version: clip(manifest.version, 40),
    author: authorOf(manifest.author), homepage: /^https:\/\//.test(manifest.homepage ?? '') ? clip(manifest.homepage, 500) : /^https:\/\//.test(manifest.repository ?? '') ? clip(manifest.repository, 500) : '',
    skills, mcp, skipped, issues, hash, files: list,
  };
}

/** 装好的插件包：每个包一个文件夹，里面原样放着包的文件，加一个记录文件（从哪来、开没开、装了哪些 MCP）。 */
export class PluginPacks {
  constructor(library) {
    this.library = library; this.files = library.files;
    this.records = new Map(); this.enabledRoots = new Set();
  }

  dir(name) { return `${packArea}/${name}`; }
  absolute(name) { return path.join(this.files.root, ...packArea.split('/'), name); }

  /** 读一遍所有包的记录；记录坏了的包当作没有（文件夹留着，员工能手动处理）。 */
  async load(signal) {
    abort(signal);
    const records = new Map();
    const base = await this.files.resolve(packArea);
    const names = await fs.readdir(base).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of names.sort()) {
      if (!packNamePattern.test(name)) continue;
      try {
        const raw = await this.files.read(`${this.dir(name)}/${packRecord}`);
        const record = raw && JSON.parse(raw.content);
        if (record?.name === name && Array.isArray(record.skills)) records.set(name, record);
      } catch { /* 记录读不出来就跳过这个包。 */ }
    }
    this.records = records;
    this.enabledRoots = new Set([...records.values()].filter(record => record.enabled).flatMap(record => [...new Set(record.skills.map(skill => path.posix.dirname(skill.dir)))].map(parent => path.join(this.absolute(record.name), ...parent.split('/')))));
    return [...records.values()];
  }

  get(name) { return this.records.get(name); }

  async install(pack, record, signal) {
    await this.library.ensureReady(signal);
    return this.files.locked(async () => {
      await this.load(signal);
      if (this.records.has(pack.name) || await stat(await this.files.resolve(this.dir(pack.name)))) fail('PACK_EXISTS', `已经装了「${pack.title}」；要换成新版，先卸载原来那个`);
      const list = [...pack.files.filter(file => file.path !== packRecord), { path: packRecord, bytes: Buffer.from(`${JSON.stringify(record, null, 2)}\n`) }];
      let snapshot;
      try { snapshot = this.files.snapshotFromList(list); }
      catch (error) { if (error.code === 'SKILL_SIZE') fail('PACK_SIZE', '插件包里的文件太多或太大（最多约 500 个文件、32 MB）'); throw error; }
      await this.files.install(this.dir(pack.name), snapshot, signal);
      await fs.mkdir(path.join(this.absolute(pack.name), '.data'), { recursive: true }).catch(() => {});
      await this.load(signal);
      return this.records.get(pack.name);
    }, signal);
  }

  async update(name, patch, signal) {
    return this.files.locked(async () => {
      await this.load(signal);
      const previous = this.records.get(name);
      if (!previous) fail('PACK_MISSING', '这个插件包已经卸载了，请刷新');
      const record = { ...previous, ...patch };
      await this.files.atomic(`${this.dir(name)}/${packRecord}`, `${JSON.stringify(record, null, 2)}\n`, signal);
      await this.load(signal);
      return this.records.get(name);
    }, signal);
  }

  async remove(name, signal) {
    return this.files.locked(async () => {
      await this.load(signal);
      if (!this.records.has(name)) fail('PACK_MISSING', '这个插件包已经卸载了，请刷新');
      await fs.rm(await this.files.resolve(this.dir(name)), { recursive: true, force: true });
      await this.load(signal);
      return { removed: name };
    }, signal);
  }

  async readSkill(name, skillName, signal) {
    await this.load(signal);
    const record = this.records.get(name), skill = record?.skills.find(item => item.name === skillName);
    if (!skill) fail('PACK_MISSING', '这项技能所在的插件包已经卸载了，请刷新');
    const raw = await this.files.read(`${this.dir(name)}/${skill.dir}/SKILL.md`);
    if (!raw) fail('PACK_MISSING', '这项技能的文件找不到了，可以卸载后重装这个插件包');
    return { pack: name, packTitle: record.title, name: skill.name, description: skill.description, content: raw.content, enabled: Boolean(record.enabled) };
  }
}
