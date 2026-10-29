#!/usr/bin/env node
/**
 * 跑测试的统一入口：npm test（单元）、npm run test:e2e（功能）、npm run test:perf（性能）都走这里。
 *
 * - 不卡电脑：测试进程降到“低于正常”优先级，它开的子进程（每个测试文件、临时 DSH、无头浏览器）跟着降，
 *   员工正在用的程序优先；并行数默认只用一半的核（功能测试每个文件要起一套 DSH 和浏览器，最多 2 个）。
 * - 慢电脑不误报：测试里不写“几秒内必须跑完”。每条测试最多 5 分钟，只用来发现卡住的测试，不衡量快慢；
 *   量速度的断言只在 test:perf 里严格检查（一次只跑一个文件）。
 * - 卡住的会被结束：测完强制退出（留下的计时器不拖住进程）；整轮超过上限就结束整棵进程树并报错。
 *   Node 自己结束不了卡在死循环里的测试进程，以前有一次空转了近一天。
 *
 * 用法：node scripts/run-tests.mjs <unit|e2e|perf> [测试文件…]，不给文件时跑这一类的全部。
 * 环境变量 WHALEWING_TEST_CONCURRENCY 可指定并行数，WHALEWING_TEST_LIMIT_MINUTES 可改整轮上限（分钟）。
 */
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cores = os.availableParallelism?.() ?? os.cpus().length;
const kinds = {
  unit: { files: ['tests/*.test.mjs', 'content/content.test.mjs'], concurrency: Math.max(2, Math.floor(cores / 2)), limitMinutes: 20 },
  e2e: { files: ['e2e/specs/*.test.mjs'], concurrency: cores >= 8 ? 2 : 1, limitMinutes: 40 },
  perf: { files: ['tests/graph.test.mjs'], concurrency: 1, limitMinutes: 10, env: { WHALEWING_TEST_PERF: '1' } },
};
const [kind, ...picked] = process.argv.slice(2);
const plan = kinds[kind];
if (!plan) { console.error('用法：node scripts/run-tests.mjs <unit|e2e|perf> [测试文件…]'); process.exit(2); }
const requested = Number(process.env.WHALEWING_TEST_CONCURRENCY);
const concurrency = Number.isInteger(requested) && requested > 0 ? requested : plan.concurrency;
const limit = Number(process.env.WHALEWING_TEST_LIMIT_MINUTES);
const limitMinutes = Number.isFinite(limit) && limit > 0 ? limit : plan.limitMinutes;

// 降低本进程优先级；子进程默认继承（Windows 的“低于正常”优先级类、类 Unix 的 nice 值都会继承）。
try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* 降不了就按原优先级跑。 */ }

// 额外参数里以 -- 开头的照传给 node（如 --test-name-pattern="对决"），其余当测试文件；没给文件时跑这一类的全部。
const flags = picked.filter(item => item.startsWith('--')), files = picked.filter(item => !item.startsWith('--'));
const args = ['--test', `--test-concurrency=${concurrency}`, '--test-timeout=300000', '--test-force-exit', ...flags, ...(files.length ? files : plan.files)];
console.log(`[鲸翼测试] ${kind}：并行 ${concurrency} 个（本机 ${cores} 核），低优先级，整轮上限 ${limitMinutes} 分钟`);
const windows = process.platform === 'win32';
// 类 Unix 上放进单独的进程组，超时时能连同它开的子进程一起结束；Windows 用 taskkill /T 结束整棵树。
const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...plan.env }, detached: !windows });
const stopTree = () => {
  if (child.exitCode !== null) return;
  if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
};
let timedOut = false;
const watchdog = setTimeout(() => { timedOut = true; stopTree(); }, limitMinutes * 60_000);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopTree(); process.exit(130); });
child.on('exit', (code, signal) => {
  clearTimeout(watchdog);
  if (timedOut) { console.error(`[鲸翼测试] 整轮超过 ${limitMinutes} 分钟，已结束全部测试进程。多半是有测试卡住了：看上面最后在跑哪个文件。`); process.exit(1); }
  process.exit(code ?? (signal ? 1 : 0));
});
