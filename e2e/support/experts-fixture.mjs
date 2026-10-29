// 专家团队功能测试的数据：头像图片（真实的 PNG、GIF 字节）、专家模板文件，以及回读临时 DSH 里专家文件的函数。
// 图片自己拼字节，不依赖图像库；模板写法见 features/experts/template.js。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * 一张真实的 RGBA PNG：宽 width、高 height，画一层渐变免得被压成几十字节。
 * padBytes 大于 0 时附一段文字注释块，把文件撑大（用来做“超过 512 KiB”的头像）。
 */
export function png(width, height, { padBytes = 0 } = {}) {
  const stride = width * 4 + 1, raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * stride + 1 + x * 4;
      raw[at] = (x * 7) & 255; raw[at + 1] = (y * 5) & 255; raw[at + 2] = 140; raw[at + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; // 8 位 RGBA
  const parts = [signature, chunk('IHDR', header)];
  if (padBytes > 0) parts.push(chunk('tEXt', Buffer.concat([Buffer.from('Comment\0', 'latin1'), Buffer.alloc(padBytes, 0x61)])));
  parts.push(chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** 从 PNG 文件头读出宽高。 */
export function pngSize(bytes) {
  if (!bytes.subarray(0, 8).equals(signature)) return null;
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

/** 两帧的 1×1 GIF 动图（GIF 不在头像允许的格式里）。 */
export function animatedGif() {
  const frame = [0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00];
  return Buffer.from([...Buffer.from('GIF89a', 'latin1'), 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, ...frame, ...frame, 0x3b]);
}

/** 合法的专家模板：skills 里带一项本机没装的技能。 */
export function templateText({ name, description, skills, avatar, prompt }) {
  return ['---', `name: ${name}`, `description: ${description}`, 'skills:', ...skills.map(skill => `  - ${skill}`), ...(avatar ? [`avatar: ${avatar}`] : []), '---', prompt, ''].join('\n');
}

/** 专家记录存在临时 DSH 的 storages/whalewing_experts.json（DSH 存储域 whalewing_experts 的 experts 表）。 */
export const expertsFile = home => path.join(home, 'storages', 'whalewing_experts.json');

/** 读专家文件的原文；还没写过时返回空字符串。 */
export const expertsFileText = home => { try { return fs.readFileSync(expertsFile(home), 'utf8'); } catch (error) { if (error.code === 'ENOENT') return ''; throw error; } };

/** 读出所有专家记录：{ 标识: 记录 }。 */
export function storedExperts(home) {
  const text = expertsFileText(home);
  return text ? JSON.parse(text).tables?.experts ?? {} : {};
}

/** 按名字找专家记录。 */
export const storedByName = (home, name) => Object.values(storedExperts(home)).find(record => record.name === name);
