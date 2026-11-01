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
  ctx.whalewing.knowledge.registerSource(ctx, {
    label,
    async search(query, { signal }) {
      const tokens = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const matches = [];
      for (const file of await notes()) {
        signal.throwIfAborted();
        const content = await readFile(path.join(notesRoot, ...file.split('/')), 'utf8');
        if (tokens.every(token => `${file}\n${content}`.toLocaleLowerCase().includes(token))) matches.push({ path: file, title: path.posix.basename(file, '.md'), excerpt: content.replace(/^---[\s\S]*?---\s*/, '').slice(0, 200), hash: String(content.length) });
      }
      return { notes: matches, total: matches.length, truncated: false };
    },
    async read(file) {
      const absolutePath = path.join(notesRoot, ...file.split('/'));
      const content = await readFile(absolutePath, 'utf8');
      return { path: file, content, hash: String(content.length), absolutePath };
    },
  });
}
