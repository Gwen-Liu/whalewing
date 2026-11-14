import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { cutout } from './portraits.mjs';

/**
 * AI 网页入口卡上的角色小像：从原创立绘（art/model-world/<立绘 id>.webp，2160×3840）裁出头部一块方形，
 * 缩到 96 像素并抠掉白底，写进 src/utilities/ai-web-faces.js。只裁剪、不重绘。
 * 每位写的是脸在画面里的横向位置（0 到 1），立绘换了要跟着调。
 */
export const faceSize = 96;
const crop = Object.freeze({ size: 800, top: 40 });
export const faceCenters = Object.freeze({
  deepseek: .43, 'bytedance-seed': .47, moonshotai: .47, alibaba: .43, tencent: .47, zhipuai: .40,
  baidu: .43, openai: .47, google: .44, anthropic: .42, perplexity: .47, minimax: .47,
});

export async function renderFace(input, center) {
  const { width } = await sharp(input).metadata();
  const left = Math.max(0, Math.min(width - crop.size, Math.round(width * center - crop.size / 2)));
  const { data, info } = await sharp(input).extract({ left, top: crop.top, width: crop.size, height: crop.size }).resize(faceSize, faceSize).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  cutout(data, info.width, info.height);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 80, alphaQuality: 90 }).toBuffer();
}

export async function buildFaces(sourceDirectory, target) {
  const faces = {};
  for (const [id, center] of Object.entries(faceCenters)) faces[id] = `data:image/webp;base64,${(await renderFace(path.join(sourceDirectory, `${id}.webp`), center)).toString('base64')}`;
  const body = Object.entries(faces).map(([id, data]) => `  ${JSON.stringify(id)}: ${JSON.stringify(data)},`).join('\n');
  await writeFile(target, `/**\n * AI 网页入口卡上的角色小像（模型世界的原创立绘裁出的头像）。由 scripts/ai-web-faces.mjs 生成，不手改。\n * © 鲸翼 WhaleWing，依 CC BY-NC-SA 4.0 授权；角色为非官方形象，说明见 content/model-world/portraits/NOTICE.md。\n */\nexport const aiWebFaces = Object.freeze({\n${body}\n});\n`);
  return Object.keys(faces).length;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const source = process.argv[2] || fileURLToPath(new URL('../art/model-world/', import.meta.url));
  const target = fileURLToPath(new URL('../src/utilities/ai-web-faces.js', import.meta.url));
  process.stdout.write(`已从 ${source} 生成 ${await buildFaces(source, target)} 张角色小像\n`);
}
