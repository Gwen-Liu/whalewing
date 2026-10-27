import { worldLimits } from './contract.js';

/** 员工 AA Key 在 DSH 凭据服务里的引用名；开发者已有的同名环境变量也会被读到。 */
export const worldIndexKeyRef = 'WHALEWING_AA_API_KEY';

/**
 * 把 DSH 原生凭据服务（ctx.credentials）接成模型世界的 Key 存取。保存的 Key 由 DSH 写进自己的凭据文件，
 * 只有本机当前用户可读；没有凭据服务时只读环境变量，不能在界面里保存。
 */
export function credentialIndexKey(getCredentials, environment = process.env) {
  const ambient = () => typeof environment[worldIndexKeyRef] === 'string' && environment[worldIndexKeyRef].length ? environment[worldIndexKeyRef] : undefined;
  return {
    get writable() { return getCredentials() !== undefined; },
    async describe() {
      const credentials = getCredentials();
      if (credentials) return credentials.describe(worldIndexKeyRef);
      return ambient() ? { configured: true, source: 'env' } : null;
    },
    async resolve() {
      const credentials = getCredentials();
      return credentials ? (await credentials.resolve(worldIndexKeyRef))?.value : ambient();
    },
    set: value => getCredentials().set(worldIndexKeyRef, value),
    unset: () => getCredentials().unset(worldIndexKeyRef),
  };
}

/**
 * 带 Key 请求 AA。DSH 启动时把代理策略装成进程级默认 dispatcher，这里的 fetch 随之走员工配置的代理。
 * 不跟随跳转，避免 Key 被带到别的域名；响应超过上限直接拒收。
 */
export async function fetchIndexPage(url, key, signal) {
  const response = await fetch(url, { headers: { 'x-api-key': key, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > worldLimits.responseBytes) { await response.body?.cancel(); return { statusCode: 413, content: '' }; }
  const content = await response.text();
  return { statusCode: Buffer.byteLength(content, 'utf8') > worldLimits.responseBytes ? 413 : response.status, content };
}
