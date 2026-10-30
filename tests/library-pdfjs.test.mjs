import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installedPdfjs, vendorDir, vendorPlan } from '../scripts/vendor-pdfjs.mjs';

// 2026-10-30：电子书导入改用随插件分发的 PDF.js，用户安装鲸翼时不再下载 pdfjs-dist（37 MB）和原生画布程序（37 MB）。
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, vendorDir);
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const source = JSON.parse(readFileSync(path.join(dir, 'SOURCE.json'), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const listFiles = (base, prefix = '') => readdirSync(base, { withFileTypes: true }).flatMap(entry => {
  const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
  return entry.isDirectory() ? listFiles(path.join(base, entry.name), relative) : [relative];
});

test('随包的 PDF.js 和 SOURCE.json 逐文件一致，没有多也没有少', () => {
  assert.equal(source.name, 'pdfjs-dist');
  assert.deepEqual(listFiles(dir).filter(file => file !== 'SOURCE.json').sort(), source.files.map(item => item.file).sort());
  for (const item of source.files) assert.equal(sha256(readFileSync(path.join(dir, item.file))), item.sha256, `${item.file} 被改过，请运行 node scripts/vendor-pdfjs.mjs 重新拷贝`);
  for (const license of ['LICENSE', 'cmaps/LICENSE', 'standard_fonts/LICENSE_FOXIT', 'standard_fonts/LICENSE_LIBERATION']) assert.ok(source.files.some(item => item.file === license), `缺少许可 ${license}`);
});

test('pdfjs-dist 只在构建时用：版本与 devDependencies 一致，不再是用户要下载的运行依赖', () => {
  assert.equal(source.version, manifest.devDependencies['pdfjs-dist']);
  assert.equal(manifest.dependencies['pdfjs-dist'], undefined);
  assert.ok(manifest.files.some(entry => vendorDir === entry || vendorDir.startsWith(`${entry}/`)), '随包目录要在 files 里');
});

test('随包文件就是已安装那一版 pdfjs-dist 的原文件', () => {
  const installed = installedPdfjs();
  assert.equal(installed.version, source.version);
  const plan = vendorPlan(installed.dir);
  assert.deepEqual(plan.map(item => item.file).sort(), source.files.map(item => item.file).sort());
  for (const { file, from } of plan) assert.equal(sha256(readFileSync(path.join(installed.dir, from))), source.files.find(item => item.file === file).sha256, file);
});

test('找不到原生画布程序时，PDF.js 照样加载并提取文字', { skip: canResolveCanvas() && '开发环境能找到 @napi-rs/canvas，核对不了“没有它也能用”' }, async () => {
  const { parseBook } = await import('../features/cards/library/formats.js');
  const { wordPdf } = await import('../src/utilities/pdf.js');
  const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
  const docx = new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph({ text: '第一章 北冥有鱼', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('北冥有鱼，其名为鲲。鲲之大，不知其几千里也。化而为鸟，其名为鹏。'.repeat(3)),
  ] }] })));
  const pdf = (await wordPdf(docx, 'book.docx')).files[0].bytes;
  const book = await parseBook(pdf, 'book.pdf');
  assert.match(book.chapters.map(chapter => chapter.markdown).join('\n'), /北冥有鱼/);
});

function canResolveCanvas() {
  try { createRequire(path.join(dir, 'pdf.min.mjs')).resolve('@napi-rs/canvas'); return true; } catch { return false; }
}
