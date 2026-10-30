// 把电子书导入（服务端子进程）要用的 PDF.js 文件原样拷进插件，用户安装鲸翼时就不用再下载 pdfjs-dist。
// pdfjs-dist 本身 37 MB，还会带上一个 37 MB 的原生画布程序 @napi-rs/canvas；电子书导入只提取文字，两者都用不到。
// 用法：在插件目录运行 `node scripts/vendor-pdfjs.mjs`；升级 pdfjs-dist 后重新运行并提交。
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const vendorDir = 'features/cards/library/pdfjs';
/** 只拷文字提取用得到的部分：压缩版主程序与解析器、中日韩字符映射表、标准字体，以及它们的许可。 */
export const vendorPicks = ['LICENSE', 'legacy/build/pdf.min.mjs', 'legacy/build/pdf.worker.min.mjs', 'cmaps', 'standard_fonts'];

const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const listFiles = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
  return entry.isDirectory() ? listFiles(path.join(dir, entry.name), relative) : [relative];
}).sort();

/** 已安装的 pdfjs-dist 目录（开发依赖），版本必须和 package.json 写的一致。 */
export function installedPdfjs() {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const wanted = manifest.devDependencies?.['pdfjs-dist'];
  const dir = realpathSync(path.dirname(createRequire(path.join(root, 'package.json')).resolve('pdfjs-dist/package.json')));
  const version = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  if (!wanted || version !== wanted) throw new Error(`已安装的 pdfjs-dist 是 ${version}，package.json 的 devDependencies 写的是 ${wanted}`);
  return { dir, version };
}

/** 插件里每个随包文件对应 pdfjs-dist 里的哪个文件。 */
export function vendorPlan(dir) {
  const plan = [];
  for (const pick of vendorPicks) {
    const source = path.join(dir, pick);
    if (statSync(source).isDirectory()) for (const file of listFiles(source)) plan.push({ file: `${path.posix.basename(pick)}/${file}`, from: `${pick}/${file}` });
    else plan.push({ file: path.posix.basename(pick), from: pick });
  }
  return plan;
}

export function vendorPdfjs() {
  const { dir, version } = installedPdfjs();
  const target = path.join(root, vendorDir);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const files = [];
  for (const { file, from } of vendorPlan(dir)) {
    mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    cpSync(path.join(dir, from), path.join(target, file));
    files.push({ file, from, sha256: sha256(path.join(target, file)) });
  }
  const source = { name: 'pdfjs-dist', version, license: 'Apache-2.0', note: '由 scripts/vendor-pdfjs.mjs 从 pdfjs-dist 原样拷贝，不要手改；standard_fonts 另有 LICENSE_FOXIT（BSD-3-Clause）与 LICENSE_LIBERATION（SIL OFL 1.1）', files };
  writeFileSync(path.join(target, 'SOURCE.json'), `${JSON.stringify(source, null, 2)}\n`);
  return source;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const source = vendorPdfjs();
  process.stdout.write(`已从 pdfjs-dist ${source.version} 拷贝 ${source.files.length} 个文件到 ${vendorDir}\n`);
}
