// AI 网页的测试数据：本机替身网页（代替真实厂商的 AI 网站）、打开 DSH 内置浏览器、读回 AI 入口的本机存储。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

/**
 * DSH 浏览器版的 profile 默认不加载内置浏览器（桌面版自带；浏览器版的「插件」页也没有它的开关），
 * 点 AI 入口只会报“内置浏览器还没就绪”。这里写进临时 profile 自己的 cordis.patch.yml 把它打开，
 * 鲸翼才能像员工的桌面版那样，在「AI 网页」会话右侧的内置浏览器里打开网页。
 */
export function enableBuiltinBrowser(home, profile = 'e2e') {
  fs.writeFileSync(path.join(home, 'profiles', profile, 'cordis.patch.yml'), '- id: ui-sidebar-browser\n  disabled: false\n');
}

/**
 * 在 127.0.0.1 的随机端口起一个小网页，代替真实厂商的 AI 网站：每个路径一页，带一个可以输入的草稿框，
 * 记下每个路径被载入了几次（不缓存，重新载入一定会再请求一次）。
 */
export async function startLocalSite() {
  const hits = new Map();
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://127.0.0.1');
    hits.set(pathname, (hits.get(pathname) ?? 0) + 1);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(`<!doctype html><meta charset="utf-8"><title>本机替身${pathname}</title><h1 id="marker">本机替身网页 ${pathname}</h1><label>草稿 <input id="draft"></label><p id="load">第 ${hits.get(pathname)} 次载入</p>`);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    /** 某一页的完整网址，例如 url('aiw09.html')。 */
    url: name => `${origin}/${name}`,
    /** 某一页已经被载入了几次。 */
    hits: name => hits.get(`/${name}`) ?? 0,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

/** 读回本机存储里员工自建的 AI 入口（DSH 本地存储 home/storages/whalewing_ai_web_<profile 摘要>.json）。 */
export function storedAiWebEntries(home) {
  const dir = path.join(home, 'storages');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => /^whalewing_ai_web_[0-9a-f]+\.json$/.test(name))
    .flatMap(name => Object.values(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).tables?.entries ?? {}))
    .sort((a, b) => a.id.localeCompare(b.id));
}
