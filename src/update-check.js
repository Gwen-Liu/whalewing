/**
 * 鲸翼检查更新：从 DSH 的安装源读 npm 上本包的版本，用 DSH 自己的兼容判断挑出能装在当前 DSH 上的最高版本。
 * DSH 0.2.2 起「插件」页对按包名从安装源装的第三方插件也有“版本”区块（从安装包地址、本机目录装的没有），
 * 但它只推荐正式版、更新时先卸载再装，鲸翼不用它（2026-11-06 用户定）。有热重载时，按包名安装已装的包会被拒绝。
 * 安装新版本的安装包地址（tarball）不按包名拦，装好后原地换成新版、重启 DSH 生效，所以更新给的是安装包地址。
 */
export const PACKAGE_NAME = 'dsh-whalewing';
export const releasePage = version => `https://github.com/gwen-liu/whalewing/releases/tag/v${version}`;

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

/** 解析 SemVer；不合规返回 null。 */
export function parseVersion(text) {
  const match = SEMVER.exec(String(text));
  if (!match) return null;
  return { core: match.slice(1, 4).map(Number), pre: match[4] === undefined ? [] : match[4].split('.') };
}

/** SemVer 先后：先比主次修订号，正式版高于同号预发布，预发布逐段比（数字段按数值，数字段低于字母段）。 */
export function compareVersions(a, b) {
  const left = parseVersion(a), right = parseVersion(b);
  if (!left || !right) throw new Error(`版本号不合规：${!left ? a : b}`);
  for (let i = 0; i < 3; i++) if (left.core[i] !== right.core[i]) return left.core[i] < right.core[i] ? -1 : 1;
  if (!left.pre.length || !right.pre.length) return left.pre.length === right.pre.length ? 0 : left.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i], y = right.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return Number(x) < Number(y) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** 本包在 profile 里的安装来源：npm 版本号或安装包地址可以更新；本机目录（开发时）不在这里更新。 */
export function installSource(spec) {
  if (typeof spec !== 'string' || !spec) return 'unknown';
  if (spec.startsWith('link:')) return 'local';
  if (spec.startsWith('file:')) return /\.(tgz|tar\.gz)$/i.test(spec) ? 'tarball' : 'local';
  if (/^https?:\/\//i.test(spec)) return 'tarball';
  if (spec.startsWith(`${PACKAGE_NAME}@`)) return 'registry';
  return 'unknown';
}

const normalize = url => {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.href.endsWith('/') ? parsed.href : `${parsed.href}/`;
  } catch { return null; }
};

/** 按 DSH 安装时的顺序问安装源：先配置的或 pnpm 自己指向的，再备用源；没有可用配置时问 npm 官方源和国内镜像。 */
export function registryPlan(registries) {
  const ordered = [registries?.registry ?? registries?.resolved, ...(registries?.fallbackRegistries || [])];
  const plan = [...new Set(ordered.map(normalize).filter(Boolean))];
  return plan.length ? plan : ['https://registry.npmjs.org/', 'https://registry.npmmirror.com/'];
}

export const tarballOf = (registry, version) => `${registry}${PACKAGE_NAME}/-/${PACKAGE_NAME}-${version}.tgz`;

/**
 * 从一份 npm 包文档里挑更新：能装在当前 DSH 上的最高正式版，没有就用最高的预发布版（与 DSH 插件市场的默认版本同一规则）；
 * 已弃用的版本不选。比当前新就是有新版本；只有更高但不兼容的版本时说明要先升级 DSH。
 */
export function pickUpdate({ current, document, compatible }) {
  const versions = Object.entries(document?.versions || {})
    .filter(([version, manifest]) => parseVersion(version) && manifest && typeof manifest === 'object' && !manifest.deprecated)
    .sort(([a], [b]) => compareVersions(b, a));
  const fits = versions.filter(([, manifest]) => compatible(manifest));
  const pick = fits.find(([version]) => !parseVersion(version).pre.length) || fits[0];
  if (pick && compareVersions(pick[0], current) > 0) return { status: 'available', version: pick[0], manifest: pick[1] };
  const ahead = versions.find(([version, manifest]) => compareVersions(version, current) > 0 && !compatible(manifest));
  if (ahead) return { status: 'needs-dsh', version: ahead[0], requires: String(ahead[1].engines?.dsh ?? '') };
  return { status: 'latest' };
}

async function readDocument(registry, { fetch, timeoutMs, signal }) {
  const response = await fetch(`${registry}${PACKAGE_NAME}`, { headers: { accept: 'application/json' }, redirect: 'follow', signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) });
  if (response.status === 404) return { missing: true };
  if (!response.ok) throw new Error(`安装源回复 ${response.status}`);
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_DOCUMENT_BYTES) throw new Error('安装源回复的版本列表过大');
  const document = JSON.parse(text);
  if (!document || typeof document !== 'object' || typeof document.versions !== 'object') throw new Error('安装源回复的不是 npm 包信息');
  return { document };
}

/**
 * 检查更新。source 是本包在 profile 里的安装来源（DSH 插件管理器 listBundles 的 source），
 * compatible(manifest) 用 DSH 的兼容判断；只在员工点“检查更新”时联网，按安装源顺序问，问到一个就停。
 */
export async function checkUpdate({ current, source, registries, compatible, fetch = globalThis.fetch, timeoutMs = 10_000, signal = new AbortController().signal }) {
  const kind = installSource(source);
  if (kind === 'local' || kind === 'unknown') return { status: 'local', current };
  const plan = registryPlan(registries), asked = [], reasons = [];
  for (const registry of plan) {
    if (signal.aborted) throw signal.reason;
    asked.push(registry);
    let read;
    try { read = await readDocument(registry, { fetch, timeoutMs, signal }); } catch (error) {
      if (signal.aborted) throw signal.reason;
      reasons.push(`${new URL(registry).host}：${error?.name === 'TimeoutError' ? '超时' : error?.message || String(error)}`);
      continue;
    }
    if (read.missing) { reasons.push(`${new URL(registry).host}：没有这个包`); continue; }
    const picked = pickUpdate({ current, document: read.document, compatible });
    if (picked.status !== 'available') return { status: picked.status, current, registry, asked, ...(picked.status === 'needs-dsh' ? { version: picked.version, requires: picked.requires } : {}) };
    const tarball = typeof picked.manifest.dist?.tarball === 'string' && /^https?:\/\//.test(picked.manifest.dist.tarball) ? picked.manifest.dist.tarball : tarballOf(registry, picked.version);
    // 安装包地址连不上时换别的安装源的同一版本，顺序同问版本时。
    const fallbacks = plan.filter(other => other !== registry).map(other => tarballOf(other, picked.version));
    const publishedAt = typeof read.document.time?.[picked.version] === 'string' ? read.document.time[picked.version] : undefined;
    return { status: 'available', current, registry, asked, version: picked.version, requires: String(picked.manifest.engines?.dsh ?? ''), tarball, fallbacks, releaseUrl: releasePage(picked.version), ...(publishedAt ? { publishedAt } : {}) };
  }
  return { status: 'failed', current, asked, reason: reasons.join('；') || '没有可用的安装源' };
}
