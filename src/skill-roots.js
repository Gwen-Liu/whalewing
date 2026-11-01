import { realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * 同一个目录可能有几种写法：Windows 短文件名（如 C:\Users\ABCDEF~1）、经过联接或符号链接。
 * DSH 报上来的技能位置是真实路径，扩展登记的目录却可能是别的写法，比较前两边都换成真实路径。
 * 路径不存在时，换算还存在的那一级上级目录，后面原样接上。
 */
export function canonicalPath(target) {
  const absolute = path.resolve(target);
  try { return realpathSync.native(absolute); } catch { /* 不存在，换算上级目录 */ }
  const parent = path.dirname(absolute);
  if (parent === absolute) return absolute;
  return path.join(canonicalPath(parent), path.basename(absolute));
}

const within = (directory, location) => {
  const child = path.relative(directory, location);
  return Boolean(child) && child !== '..' && !child.startsWith('..' + path.sep) && !path.isAbsolute(child);
};

/**
 * location 是否在 directory 里面（不含 directory 本身）。
 * 大多数时候两边写法本来一致，先直接比；对不上再换成真实路径比，免得技能列表每次都要读文件系统。
 */
export function isInside(directory, location) {
  const plainDirectory = path.resolve(directory), plainLocation = path.resolve(location);
  if (within(plainDirectory, plainLocation)) return true;
  const realDirectory = canonicalDirectory(plainDirectory);
  // DSH 报的技能位置本来就是真实路径，多数时候换算目录这一边就够了。
  return within(realDirectory, plainLocation) || within(realDirectory, canonicalPath(plainLocation));
}

// 目录就那几个（随包目录、各扩展的技能目录），真实路径缓存 5 秒；联接改了指向，最多 5 秒后跟上。
const directories = new Map();
function canonicalDirectory(directory) {
  const cached = directories.get(directory), now = Date.now();
  if (cached && now - cached.at < 5000) return cached.value;
  const value = canonicalPath(directory);
  if (directories.size > 64) directories.clear();
  directories.set(directory, { value, at: now });
  return value;
}
