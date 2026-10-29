import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * 办公工坊中文字体子集：Word 转 PDF、PDF 加水印只用到 Noto Sans SC 的常用字。
 * 全字体 8.3 MB（Base64 后 11 MB）会整份内联进 Worker，裁成常用字后约 3.7 MB。
 * 原字体 NotoSansSC-Regular.otf 原样随包保留，本脚本可从它逐字节复现 noto-font.json。
 *
 * 用法：node scripts/noto-subset.mjs [--check]
 * 需要本机 Python 装有 fontTools 4.65.0（pip install fonttools==4.65.0）；
 * 解释器默认 python，可用环境变量 WHALEWING_FONTTOOLS_PYTHON 指定。
 */
const dir = new URL('../content/utilities/', import.meta.url);
const source = new URL('NotoSansSC-Regular.otf', dir), target = new URL('noto-font.json', dir);
const fontToolsVersion = '4.65.0';
// 字表来自 WHATWG 编码标准的 GBK、Big5 解码表；指纹变了说明本机 Node 的解码表与生成时不同，子集不再可复现。
const listSha256 = '290f1644531a9a8e014c5e8618c29792bda36d5eb6f355882fc5bd05b14d1585';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const range = (a, z) => Array.from({ length: z - a + 1 }, (_, i) => a + i);

// 常用符号整段收录（只保留原字体里有的）：拉丁与西文标点、希腊与西里尔、通用标点、货币、字母式符号、数字形式、
// 箭头、数学与技术符号、带圈数字、制表与几何形状、杂项与装饰符号、中日韩符号标点、假名、注音、带圈中日韩字、
// 中日韩兼容（㎡、㎏）、竖排与兼容形式、全角半角。
const symbolBlocks = [
  [0x20, 0x7E], [0xA0, 0x24F], [0x2B0, 0x2FF], [0x370, 0x3FF], [0x400, 0x4FF],
  [0x2000, 0x206F], [0x2070, 0x209F], [0x20A0, 0x20CF], [0x2100, 0x214F], [0x2150, 0x218F], [0x2190, 0x21FF],
  [0x2200, 0x22FF], [0x2300, 0x23FF], [0x2460, 0x24FF], [0x2500, 0x257F], [0x2580, 0x259F], [0x25A0, 0x25FF],
  [0x2600, 0x26FF], [0x2700, 0x27BF], [0x3000, 0x303F], [0x3040, 0x30FF], [0x3100, 0x312F], [0x31A0, 0x31BF],
  [0x3200, 0x32FF], [0x3300, 0x33FF], [0xFE10, 0xFE1F], [0xFE30, 0xFE4F], [0xFF00, 0xFFEF],
];

function decoded(encoding, leads, trails) {
  const decoder = new TextDecoder(encoding), out = [];
  for (const lead of leads) for (const trail of trails) {
    const text = decoder.decode(Uint8Array.of(lead, trail));
    const point = text.codePointAt(0);
    // 跳过空位和私用区：GBK 把 GB2312 空位映射到私用区，那里没有字形。
    if (text.length === 1 && text !== '�' && !(point >= 0xE000 && point <= 0xF8FF)) out.push(point);
  }
  return out;
}

/** 子集字表：常用符号 + GB2312 全部字符（6763 个简体汉字及符号）+ Big5 常用字（5401 个，补繁体）。 */
export function subsetCodePoints() {
  const gb2312 = decoded('gbk', [...range(0xA1, 0xA9), ...range(0xB0, 0xF7)], range(0xA1, 0xFE));
  const big5Common = decoded('big5', range(0xA4, 0xC6), [...range(0x40, 0x7E), ...range(0xA1, 0xFE)]).filter(point => point >= 0x4E00 && point <= 0x9FFF);
  const points = [...new Set([...symbolBlocks.flatMap(([a, z]) => range(a, z)), ...gb2312, ...big5Common])].sort((a, b) => a - b);
  return points;
}

const unicodeList = points => points.map(point => point.toString(16).toUpperCase().padStart(4, '0')).join('\n') + '\n';

function python(args) {
  const executable = process.env.WHALEWING_FONTTOOLS_PYTHON || 'python';
  // -I 隔离模式：不读当前目录和 PYTHON* 环境变量里的模块。
  const result = spawnSync(executable, ['-I', ...args], { encoding: 'utf8', maxBuffer: 1 << 20 });
  if (result.error || result.status !== 0) throw new Error(`运行 ${executable} 失败：${result.error?.message || result.stderr.trim()}`);
  return result.stdout.trim();
}

export function renderSubset() {
  const audit = JSON.parse(readFileSync(new URL('audited-source.json', dir), 'utf8'));
  const original = readFileSync(source);
  if (sha256(original) !== audit.assets.find(asset => asset.file === 'NotoSansSC-Regular.otf').sha256) throw new Error('原字体与已审核指纹不同，先核对来源');
  const points = subsetCodePoints(), list = unicodeList(points);
  if (sha256(list) !== listSha256) throw new Error(`字表指纹 ${sha256(list)} 与登记不同，本机 Node 的 GBK/Big5 解码表可能变了`);
  let version;
  try { version = python(['-c', 'import fontTools; print(fontTools.version)']); } catch (error) { throw new Error(`找不到 fontTools：pip install fonttools==${fontToolsVersion}，或用 WHALEWING_FONTTOOLS_PYTHON 指定装有它的 Python\n${error.message}`); }
  if (version !== fontToolsVersion) throw new Error(`需要 fontTools ${fontToolsVersion}，本机是 ${version}；版本不同可能产生不同字节`);
  const work = mkdtempSync(path.join(tmpdir(), 'whalewing-noto-'));
  try {
    const unicodes = path.join(work, 'unicodes.txt'), output = path.join(work, 'subset.otf');
    writeFileSync(unicodes, list);
    // 保留全部 name 记录（含版权与 OFL 声明）和缺字方框；去掉 pdfmake 用不到的竖排度量。
    python(['-m', 'fontTools.subset', fileURLToPath(source), `--unicodes-file=${unicodes}`, `--output-file=${output}`,
      '--name-IDs=*', '--name-languages=*', '--notdef-outline', '--drop-tables+=vhea,vmtx,VORG']);
    return { json: JSON.stringify({ base64: readFileSync(output).toString('base64') }) + '\n', points: points.length };
  } finally { rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { json, points } = renderSubset();
  const digest = sha256(Buffer.from(json));
  if (process.argv.includes('--check')) {
    const same = readFileSync(target, 'utf8') === json;
    process.stdout.write(same ? `noto-font.json 与重新生成的结果一致（${digest}）\n` : `noto-font.json 与重新生成的结果不同，新指纹 ${digest}\n`);
    process.exitCode = same ? 0 : 1;
  } else {
    writeFileSync(target, json);
    process.stdout.write(`已按 ${points} 个码点生成 noto-font.json（${json.length} 字节，sha256 ${digest}）；请同步 audited-source.json 里的指纹\n`);
  }
}
