// 功能测试用的临时隔离 DSH：每次新建一个独立的 DSH_HOME、知识库和文档目录，只加载原版基础包和本插件；
// 测完关掉进程、删掉整个临时目录。DSH 从插件自己的开发依赖里找，不碰员工的正式 DSH 和 ~/.dsh。
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const pluginRoot = process.env.WHALEWING_E2E_PLUGIN || fileURLToPath(new URL('../..', import.meta.url));
const slash = value => value.replaceAll('\\', '/');

/** DSH 的启动入口：可用 WHALEWING_E2E_DSH_BIN 指定，默认取插件开发依赖里的 @deepseek-ai/dsh。 */
export function dshBin() {
  if (process.env.WHALEWING_E2E_DSH_BIN) return process.env.WHALEWING_E2E_DSH_BIN;
  return createRequire(path.join(pluginRoot, 'package.json')).resolve('@deepseek-ai/dsh/lib/bin.js');
}

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

/** 删目录：遇到联接或符号链接只删链接本身，不进到链接指向的目录里。 */
export function removeTree(target) {
  let stat;
  try { stat = fs.lstatSync(target); } catch { return; }
  if (stat.isSymbolicLink()) { fs.unlinkSync(target); return; }
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) removeTree(path.join(target, name));
    fs.rmdirSync(target);
    return;
  }
  fs.unlinkSync(target);
}

function writeProfile(home, profile) {
  const root = path.join(home, 'profiles', profile);
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(pluginRoot, path.join(root, 'node_modules', 'dsh-whalewing'), 'junction');
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({
    name: `whalewing-${profile}`, private: true,
    dependencies: { 'dsh-whalewing': `link:${slash(pluginRoot)}` },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-whalewing'] } },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'cordis.yml'), '[]\n');
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n');
}

/** 关掉统计上报和自动起标题（会调用模型），知识库和文档目录指到临时目录，跳过欢迎提示。 */
const patchYaml = ({ vault, documents }) => [
  '- id: session-telemetry-otel\n  disabled: true',
  '- id: product-analytics\n  disabled: true',
  '- id: desktop-product-telemetry\n  disabled: true',
  '- id: session-title-llm\n  disabled: true',
  `- id: whalewing\n  config:\n    vaultRoot: ${slash(vault)}`,
  `- id: workspace-controller\n  config:\n    documentsDirectory: ${slash(documents)}`,
  '- id: ui-settings-general\n  config:\n    welcomeNoticeVersion: 2026-09-28.1',
].join('\n') + '\n';

/** 临时 DSH 的环境变量：去掉本机的各种 Key、Token 和密钥（例如 WHALEWING_AA_API_KEY、DEEPSEEK_API_KEY），测试里不可能误用真凭据花钱。 */
export const secretName = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)S?$/i;
export function testEnv(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name]) => !secretName.test(name)));
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* 已经退出 */ }
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* 已经退出 */ }
  }
}

/**
 * 启动临时 DSH，等到它打印出带口令的访问地址。
 * seed(root) 在启动前调用，用来往临时知识库、文档目录里放这次测试要的数据。
 */
export async function startDsh(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whalewing-e2e-'));
  try { return await launch(root, options); } catch (error) {
    // 启动失败时不留临时目录；设了 WHALEWING_E2E_KEEP 就留着排查。
    if (!process.env.WHALEWING_E2E_KEEP) { await new Promise(resolve => setTimeout(resolve, 500)); try { removeTree(root); } catch { /* 进程还占着就留给系统清理 */ } }
    else error.message += `（临时目录保留在 ${root}）`;
    throw error;
  }
}

async function launch(root, { profile = 'e2e', seed, timeout = 90_000 }) {
  const dirs = { root, home: path.join(root, 'home'), vault: path.join(root, 'vault'), documents: path.join(root, 'documents') };
  for (const dir of [dirs.home, dirs.vault, dirs.documents]) fs.mkdirSync(dir, { recursive: true });
  writeProfile(dirs.home, profile);
  const patch = path.join(root, 'e2e.patch.yml');
  fs.writeFileSync(patch, patchYaml(dirs));
  await seed?.(dirs);
  const port = await freePort();
  const logPath = path.join(root, 'host.log'), log = fs.createWriteStream(logPath);
  const child = spawn(process.execPath, [dshBin(), '--profile', profile, '--patch', patch, '--no-open', '--port', String(port)], {
    cwd: root, env: { ...testEnv(), DSH_HOME: dirs.home, CI: 'true' }, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', found;
  const url = new Promise((resolve, reject) => {
    found = { resolve, reject };
    child.once('exit', code => reject(new Error(`DSH 启动时退出（代码 ${code}），日志见 ${logPath}`)));
  });
  url.catch(() => { /* 超时后进程才退出时不再报 */ });
  const receive = data => {
    log.write(data);
    if (output === null) return;
    output += data.toString();
    const match = output.match(/http:\/\/(?:127\.0\.0\.1|localhost):\d+\/[^\s\u001b]*/);
    if (match) { output = null; found.resolve(match[0]); }
  };
  child.stdout.on('data', receive); child.stderr.on('data', receive);
  let timer;
  try {
    await Promise.race([url, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`DSH ${timeout / 1000} 秒内没有给出访问地址，日志见 ${logPath}`)), timeout); })]);
  } catch (error) {
    killTree(child); log.end();
    throw error;
  } finally { clearTimeout(timer); }
  let stopped = false;
  return {
    ...dirs, url: await url, port, logPath,
    /** 关掉 DSH；keep 为真时留下临时目录（排查失败用）。 */
    async stop({ keep = false } = {}) {
      if (stopped) return; stopped = true;
      killTree(child);
      await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
      await new Promise(resolve => log.end(resolve));
      if (!keep) for (let attempt = 0; ; attempt++) {
        try { removeTree(root); break; } catch (error) { if (attempt >= 10) throw error; await new Promise(resolve => setTimeout(resolve, 300)); }
      }
    },
  };
}
