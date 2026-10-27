import { Inflate } from 'fflate';

/**
 * EPUB、DOCX、CBZ 和打包的 TXT 都是 ZIP。来源各异的电子书常有小毛病（文件名用 GBK、数据描述符、
 * 声明长度不准），这里宽容读取目录、按需解压，只用条目数和解压总量设上限防止压缩炸弹。
 */
export const zipLimits = Object.freeze({ entries: 20000, entry: 128 * 1024 ** 2, total: 1024 ** 3 });

const u16 = (bytes, p) => bytes[p] | bytes[p + 1] << 8;
const u32 = (bytes, p) => (bytes[p] | bytes[p + 1] << 8 | bytes[p + 2] << 16 | bytes[p + 3] << 24) >>> 0;
const strict = new TextDecoder('utf-8', { fatal: true });
const utf8 = new TextDecoder('utf-8');
const gbk = new TextDecoder('gb18030');

export const isZip = bytes => bytes.length >= 22 && bytes[0] === 0x50 && bytes[1] === 0x4b && [3, 5, 7].includes(bytes[2]);

/** 读压缩包目录；read(name) 时才解压该条目，不存在返回 null。 */
export function openZip(bytes, fail) {
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) if (u32(bytes, p) === 0x06054b50) { end = p; break; }
  if (end < 0) fail('压缩包缺少目录，文件可能已损坏或没有下载完整');
  const count = u16(bytes, end + 10), start = u32(bytes, end + 16);
  if (count === 0xffff || start === 0xffffffff) fail('暂不支持 ZIP64 格式的压缩包');
  if (count > zipLimits.entries) fail(`压缩包内文件超过 ${zipLimits.entries} 个`);
  const entries = new Map(), lower = new Map();
  let p = start;
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || u32(bytes, p) !== 0x02014b50) fail('压缩包目录损坏');
    const flags = u16(bytes, p + 8), method = u16(bytes, p + 10), compressed = u32(bytes, p + 20), size = u32(bytes, p + 24), n = u16(bytes, p + 28), extra = u16(bytes, p + 30), comment = u16(bytes, p + 32), local = u32(bytes, p + 42);
    const raw = bytes.subarray(p + 46, p + 46 + n);
    let name;
    if (flags & 0x800) name = utf8.decode(raw);
    else try { name = strict.decode(raw); } catch { name = gbk.decode(raw); }
    name = name.replaceAll('\\', '/').replace(/^\/+/, '');
    p += 46 + n + extra + comment;
    if (!name || name.endsWith('/')) continue;
    const entry = { name, flags, method, compressed, size, local };
    entries.set(name, entry);
    if (!lower.has(name.toLowerCase())) lower.set(name.toLowerCase(), entry);
  }
  let total = 0;
  const lookup = name => entries.get(name) ?? lower.get(String(name).toLowerCase());
  const read = name => {
    const entry = lookup(name);
    if (!entry) return null;
    if (entry.flags & 1) fail('压缩包里的文件有密码保护，不能读取');
    if (u32(bytes, entry.local) !== 0x04034b50) fail('压缩包条目损坏');
    const data = entry.local + 30 + u16(bytes, entry.local + 26) + u16(bytes, entry.local + 28);
    if (data + entry.compressed > bytes.length) fail('压缩包不完整，可能没有下载完');
    const source = bytes.subarray(data, data + entry.compressed);
    if (entry.method === 0) {
      total += source.length;
      if (total > zipLimits.total) fail('压缩包解压后超过 1 GiB');
      return source.slice();
    }
    if (entry.method !== 8) fail(`压缩包使用了不支持的压缩方式（${entry.method}）`);
    const chunks = [];
    let actual = 0;
    const inflate = new Inflate(chunk => {
      actual += chunk.length; total += chunk.length;
      if (actual > zipLimits.entry) fail(`压缩包内单个文件解压后超过 ${zipLimits.entry / 1024 ** 2} MiB`);
      if (total > zipLimits.total) fail('压缩包解压后超过 1 GiB');
      chunks.push(chunk);
    });
    // 分块投递，单个条目的膨胀也受上限约束。
    if (!source.length) return new Uint8Array(0);
    for (let offset = 0; offset < source.length; offset += 65536) inflate.push(source.subarray(offset, offset + 65536), offset + 65536 >= source.length);
    const output = new Uint8Array(actual);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    return output;
  };
  return { names: [...entries.keys()], has: name => Boolean(lookup(name)), size: name => lookup(name)?.size ?? 0, read };
}

/** 解析书内相对路径：去掉锚点和查询、解码百分号、处理 ./ 与 ../。 */
export function resolvePath(base, href) {
  let target = String(href || '').split('#')[0].split('?')[0];
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
  try { target = decodeURIComponent(target); } catch { /* 保留原样 */ }
  const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  return parts.join('/');
}
