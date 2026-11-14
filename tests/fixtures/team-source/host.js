import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 测试用扩展：用鲸翼公开的来源接口提供团队专家、团队知识和团队技能。只在本仓库测试和隔离环境走查里用，不随包。
export const name = 'fixture-team';
export const inject = ['whalewing'];

const root = fileURLToPath(new URL('.', import.meta.url));
const notesRoot = path.join(root, 'notes');
const label = { zh: '团队', en: 'Team' };

async function notes() {
  const found = [];
  async function walk(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
      else if (entry.name.endsWith('.md')) found.push(relative);
    }
  }
  await walk(notesRoot, '');
  return found;
}

export function apply(ctx) {
  ctx.whalewing.features.register(ctx, { id: 'team', api: 1, package: 'dsh-fixture-team', skills: [path.join(root, 'skills')] });
  let experts = [
    { id: 'lead', revision: 1, name: '团队组长', description: '按团队规范安排和检查工作（测试夹具）', prompt: '你是团队组长。先读团队规范，再安排工作。', skills: ['team-release'] },
    { id: 'guide', revision: 1, name: '新人向导', description: '带新同事熟悉团队的做法（测试夹具，只读）', prompt: '你是新人向导，耐心解释团队的做法。', readOnly: true },
  ];
  const source = ctx.whalewing.experts.registerSource(ctx, {
    label,
    async save({ id, expectedRevision, expert }) {
      const current = experts.find(item => item.id === id);
      if (!current || current.revision !== expectedRevision) throw Object.assign(new Error('团队专家已被别人改过'), { code: 'CONFLICT' });
      const next = { ...current, ...expert, avatar: expert.avatar ?? undefined, revision: current.revision + 1 };
      if (next.avatar === undefined) delete next.avatar;
      experts = experts.map(item => item.id === id ? next : item);
      return next;
    },
  });
  source.set(experts);
  // 三个知识空间照组织树从近到远：自己所在的那一层（能维护）、上一层公有的、企业公有的。
  // 维护人改的内容只记在内存里，不写回仓库里的夹具文件。
  const spaces = [
    { id: 'impl', name: '实施组', group: '我所在 · 实施组', note: '新客户上线项目 / 实施组', editable: true },
    { id: 'project', name: '项目公共知识', group: '上层公有 · 新客户上线项目', note: '新客户上线项目' },
    { id: 'company', name: '公司公共知识', group: '企业公有', note: '企业' },
  ];
  const edited = new Map();
  const contentOf = async file => edited.get(file) ?? readFile(path.join(notesRoot, ...file.split('/')), 'utf8');
  const hashOf = content => String(content.length);
  const titleOf = (file, content) => content.match(/^#\s+(.+?)\s*$/m)?.[1] ?? path.posix.basename(file, '.md');
  const allFiles = async () => [...new Set([...await notes(), ...edited.keys()])];
  ctx.whalewing.knowledge.registerSource(ctx, {
    label,
    async search(query, { signal }) {
      const tokens = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const matches = [];
      for (const file of await allFiles()) {
        signal.throwIfAborted();
        const content = await contentOf(file);
        if (tokens.every(token => `${file}\n${content}`.toLocaleLowerCase().includes(token))) matches.push({ path: file, title: titleOf(file, content), excerpt: content.replace(/^---[\s\S]*?---\s*/, '').slice(0, 200), hash: hashOf(content) });
      }
      return { notes: matches, total: matches.length, truncated: false };
    },
    async read(file) {
      const absolutePath = path.join(notesRoot, ...file.split('/'));
      const content = await contentOf(file);
      return { path: file, content, hash: hashOf(content), ...(edited.has(file) ? {} : { absolutePath }), editable: Boolean(spaces.find(space => file.startsWith(`${space.id}/`))?.editable) };
    },
    async list() {
      const files = await allFiles();
      return { spaces: await Promise.all(spaces.map(async space => ({ ...space, notes: await Promise.all(files.filter(file => file.startsWith(`${space.id}/`)).map(async file => ({ path: file, title: titleOf(file, await contentOf(file)) }))) }))) };
    },
    async save({ path: file, content, expectedHash }) {
      if (!spaces.find(space => file.startsWith(`${space.id}/`))?.editable) throw Object.assign(new Error('你不是这个知识空间的维护人'), { code: 'FORBIDDEN' });
      const current = (await allFiles()).includes(file) ? hashOf(await contentOf(file)) : '';
      if (current !== expectedHash) throw Object.assign(new Error('这篇刚被别人改过'), { code: 'CONFLICT' });
      edited.set(file, content);
      return { path: file, hash: hashOf(content) };
    },
    async submit({ space }) {
      const target = spaces.find(item => item.id === space);
      if (!target) throw Object.assign(new Error('没有这个知识空间'), { code: 'NOT_FOUND' });
      return target.editable ? { applied: true, message: `已放进「${target.name}」（测试夹具，没有真的发出去）` } : { applied: false, message: `已提交，等「${target.name}」的负责人审核（测试夹具，没有真的发出去）` };
    },
  });
  // 团队沉淀：每天北京时间 02:00 读前一天的对话。测试夹具不交给任何服务端，模型只在会话里写结果。
  // 旧版鲸翼没有这个接口时跳过，夹具的其它部分照常能用。
  ctx.whalewing.schedule?.registerTask(ctx, {
    id: 'daily-digest', title: '团队沉淀',
    description: '每天把前一天和工作有关的内容整理成一篇沉淀（测试夹具，不交给服务端）',
    daily: { time: '02:00' }, readSessions: true,
    prompt: '把还没处理的那天（北京时间）和工作有关的对话整理成一篇 Markdown 沉淀，直接写在回复里；只写工作内容，不写私事和账号。这是测试夹具，不交给任何服务端。',
  });
}
