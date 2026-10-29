// 功能测试的浏览器部分：找 Playwright、开一个干净的页面进鲸翼、切页签、模拟桌面版标题栏、失败时留截图。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pluginRoot } from './dsh.mjs';

/** Playwright 只用它的 Node 库：先看 WHALEWING_PLAYWRIGHT，再找插件依赖里的 playwright；都没有就报错，不跳过。 */
export function loadPlaywright() {
  const require = createRequire(path.join(pluginRoot, 'package.json'));
  const candidates = [process.env.WHALEWING_PLAYWRIGHT, 'playwright', 'playwright-core',
    // 本仓库开发机上截图用的 Playwright 借自旧 runtime（见 docs/架构与约定.md）。
    path.resolve(pluginRoot, '../../.artifacts/whalewing-first-version/fixture-builder/node_modules/playwright')].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* 试下一个 */ }
  }
  throw new Error('找不到 Playwright：请设置 WHALEWING_PLAYWRIGHT 指向 playwright 包目录，或在开发依赖里装 playwright');
}

/** 证据目录：WHALEWING_E2E_OUT 指定，默认放系统临时目录。 */
export const evidenceDir = process.env.WHALEWING_E2E_OUT || path.join(os.tmpdir(), 'whalewing-e2e-evidence');

/** 每个测试文件一个浏览器；每条用例一个新的浏览器上下文，互不影响。 */
export async function launchBrowser() {
  const { chromium } = loadPlaywright();
  // 中文界面：浏览器自带的表单校验提示等也用中文，和员工看到的一致。
  // 无界面浏览器默认把滚动条藏起来（--hide-scrollbars），DSH 桌面版是有滚动条的：去掉这个参数，滚动条占位和拖动都和员工看到的一样。
  return chromium.launch({ args: ['--lang=zh-CN'], ignoreDefaultArgs: ['--hide-scrollbars'] });
}

const localHost = /^(127\.0\.0\.1|localhost|\[::1\])$/;

/**
 * 给一条用例开新页面：收集页面错误；拦下所有发往本机以外的请求（功能测试不联网、不调模型），记在 external 里；
 * 用例失败时截图到证据目录。返回 { page, context, errors, external, shot(name), close() }。
 */
export async function newPage(browser, t, { width = 1440, height = 900, colorScheme = 'light', acceptDownloads = false, reducedMotion } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme, acceptDownloads, locale: 'zh-CN', ...(reducedMotion ? { reducedMotion } : {}) });
  const external = [];
  await context.route(url => /^(https?|wss?):$/.test(url.protocol) && !localHost.test(url.hostname), route => { external.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const slug = `${path.basename(t.filePath || 'e2e', '.test.mjs')}-${t.name}`.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 120);
  const shot = async name => {
    fs.mkdirSync(evidenceDir, { recursive: true });
    const file = path.join(evidenceDir, `${slug}${name ? `-${name}` : ''}.png`);
    await page.screenshot({ path: file }).catch(() => {});
    return file;
  };
  return {
    page, context, errors, external, shot,
    async close(failed) {
      if (failed) t.diagnostic(`截图：${await shot('失败')}`);
      await context.close();
    },
  };
}

/** 在一条用例里用页面：用例出错时自动截图再关上下文。 */
export async function withPage(browser, t, options, run) {
  if (typeof options === 'function') { run = options; options = {}; }
  const session = await newPage(browser, t, options);
  let failed = true;
  try { await run(session); failed = false; } finally { await session.close(failed); }
}

/** 打开 DSH，点左侧“鲸翼”，等顶栏页签出来。desktop 为真时先模拟 Windows 桌面版的标题栏。 */
export async function openWhaleWing(page, url, { desktop = false } = {}) {
  // 新环境没有登录模型，DSH 会弹“开始使用”提示登录或添加 API Key；功能测试不用模型，出现就关掉。
  // 它在侧栏出来后约 0.1 秒弹出，每次打开页面都会弹；先等它出来关掉，并等淡出结束，免得后面量位置时被它的遮罩挡住。
  // 之后再弹（例如刷新页面）由处理器在下一次操作前关掉。
  const welcome = page.getByRole('dialog', { name: '开始使用' });
  const dismiss = async () => { await welcome.getByRole('button', { name: '关闭' }).click(); await welcome.waitFor({ state: 'hidden' }); };
  await page.goto(url);
  if (await welcome.waitFor({ timeout: 5000 }).then(() => true, () => false)) await dismiss();
  await page.addLocatorHandler(welcome, dismiss);
  if (desktop) await emulateWindowsTitlebar(page);
  await page.getByRole('button', { name: '鲸翼', exact: true }).first().click();
  await page.locator('.ww-workbench-header button[data-tab]').first().waitFor();
}

/** 切到某个页签，等它成为选中状态。 */
export async function openTab(page, name) {
  const tab = page.locator('.ww-workbench-header button[data-tab]', { hasText: name });
  await tab.click();
  await page.waitForFunction(label => [...document.querySelectorAll('.ww-workbench-header button[data-tab]')].some(button => button.textContent.includes(label) && button.getAttribute('aria-pressed') === 'true'), name);
  return tab;
}

/** DSH 桌面版在 Windows 上的标题栏：高 40px，整条可拖动窗口；右上角是窗口自己的最小化、最大化、关闭，约 138px 宽。 */
export const windowsTitlebar = Object.freeze({ height: 40, controlsWidth: 138 });

/** 按桌面版的做法给页面打上 Windows 标题栏标记，DSH 和鲸翼的样式会按桌面版排版。浏览器里没有真的拖动区域，点击是否被吞由 titlebarProblems 按样式判断。 */
export async function emulateWindowsTitlebar(page) {
  await page.evaluate(({ height }) => {
    const root = document.documentElement;
    root.setAttribute('data-windows-titlebar', '');
    root.style.setProperty('--dsh-windows-titlebar-height', `${height}px`);
  }, windowsTitlebar);
}

/**
 * 按桌面版规则检查一组可点的元素：落进右上角窗口按钮区域的会被挡住；
 * 落进顶上 40px 拖动区域、自己或外层又没声明 no-drag 的，点上去会变成拖窗口。
 * 返回有问题的元素说明，空数组表示都点得中。
 */
export async function titlebarProblems(locator) {
  return locator.evaluateAll((elements, { height, controlsWidth }) => elements.filter(element => element.getClientRects().length).flatMap(element => {
    const rect = element.getBoundingClientRect(), name = (element.getAttribute('aria-label') || element.textContent || '').trim();
    const problems = [];
    if (rect.right > innerWidth - controlsWidth && rect.top < height) problems.push(`“${name}”被右上角窗口按钮挡住`);
    if (rect.top < height) {
      let covered = false;
      for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
        const region = getComputedStyle(node).getPropertyValue('-webkit-app-region') || getComputedStyle(node).getPropertyValue('app-region');
        if (region === 'drag') break;
        if (region === 'no-drag') { const box = node.getBoundingClientRect(); covered = box.top <= rect.top && box.bottom >= Math.min(rect.bottom, height) && box.left <= rect.left && box.right >= rect.right; break; }
      }
      if (!covered) problems.push(`“${name}”压在拖动窗口的区域上，点上半截会变成拖窗口`);
    }
    return problems;
  }), windowsTitlebar);
}

/** 读元素的可见文字（去掉多余空白）。 */
export const textOf = async locator => (await locator.innerText()).replace(/\s+/g, ' ').trim();

/** 右上角提示（鲸翼统一的那一条）；kind 为 success、error、info。 */
export const toast = (page, text, kind) => page.locator(`.ww-toast${kind ? `.ww-toast-${kind}` : ''}`).filter(text ? { hasText: text } : {});

/** 打开着的右侧抽屉，按标题找。 */
export const drawer = (page, title) => page.locator('dialog.ww-editor[open]').filter({ has: page.locator('header h2', { hasText: title }) });

/** 打开着的居中弹窗（确认框也是它），按标题找。注意右上角“×”的无障碍名称和标题相同，点按钮请用 dialogButton。 */
export const modal = (page, title) => page.locator('dialog.ww-modal[open]').filter({ has: page.locator('header h2', { hasText: title }) });

/** 弹窗或抽屉底部的按钮（取消、确认、保存……），不会误中右上角的“×”。按文字包含匹配；“取消”和“取消计划”同在时传 { exact: true }。 */
export const dialogButton = (dialog, label, { exact = false } = {}) => dialog.locator('footer button').filter({ hasText: exact && typeof label === 'string' ? new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) : label });

/**
 * 关掉编辑抽屉：点底部的取消类按钮。抽屉里有改动时会先弹居中的“放弃修改”确认（需求§界面通用约定），这里确认放弃，再等抽屉关上。
 * 要核对确认框本身的用例自己点，不用这个。
 */
export async function discardDrawer(page, editor, label = '取消') {
  await dialogButton(editor, label).click();
  const confirm = modal(page, '放弃修改');
  await Promise.race([editor.waitFor({ state: 'detached' }), confirm.waitFor()]);
  if (await confirm.isVisible()) await dialogButton(confirm, '放弃修改').click();
  await editor.waitFor({ state: 'detached' });
}

/** 元素是否在视口里水平、垂直居中（误差 tolerance 像素以内）。 */
export async function isCentered(page, locator, tolerance = 24) {
  const box = await locator.boundingBox(), { width, height } = page.viewportSize();
  return Boolean(box) && Math.abs(box.x + box.width / 2 - width / 2) <= tolerance && Math.abs(box.y + box.height / 2 - height / 2) <= tolerance;
}

/** 元素的计算背景色是不是红色系（删除类确认按钮）。 */
export const isRed = locator => locator.evaluate(element => {
  const [r, g, b] = (getComputedStyle(element).backgroundColor.match(/\d+(\.\d+)?/g) || []).map(Number);
  return r >= 180 && g <= 90 && b <= 90;
});

/** 用例自己的测试文件目录：在系统临时目录建一个，返回 { dir, file(name, content) }；测试文件结束时用 removeTree 删掉。 */
export function scratchFiles(prefix = 'whalewing-e2e-files-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, file(name, content) { const target = path.join(dir, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); return target; } };
}
