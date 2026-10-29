import { readFileSync } from 'node:fs';
import { modelWorldPortraitIds } from './model-world-roster.js';

/** 构建专用：缩略图由 scripts/portraits.mjs 从原创立绘生成，按立绘 id 命名。 */
export const modelWorldPortraitFiles = Object.freeze(Object.fromEntries(modelWorldPortraitIds.map(id => [id, `${id}.webp`])));

export function loadModelWorldPortraits() {
  return Object.fromEntries(Object.entries(modelWorldPortraitFiles).map(([id, file]) => [
    id, `data:image/webp;base64,${readFileSync(new URL(`../content/model-world/portraits/${file}`, import.meta.url)).toString('base64')}`,
  ]));
}

/** 查看大图：每张 4K 原图一个按需分块，DSH 只在员工点开那一张时才下载。 */
export const largePortraitChunk = id => `client.portrait-${id}.js`;
export const largePortraitChunks = Object.freeze(modelWorldPortraitIds.map(largePortraitChunk));

/** 构建专用：大图就是 art/model-world 里的 4K 原图（2160×3840 WebP），不重新压缩；原图文件不进安装包，只随分块分发。 */
export function loadLargePortrait(id) {
  if (!modelWorldPortraitIds.includes(id)) throw new Error(`没有这个立绘 ${id}`);
  return `data:image/webp;base64,${readFileSync(new URL(`../art/model-world/${id}.webp`, import.meta.url)).toString('base64')}`;
}
