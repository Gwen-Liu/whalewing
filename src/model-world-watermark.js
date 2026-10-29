import { logoColors, logoFluke, logoStem, logoWave } from './brand-mark.js';

/** 保存的立绘右下角带鲸翼水印：一行，鲸翼标志加“WhaleWing”。按 1440 宽设计，其他尺寸等比缩放。 */
export const watermarkText = Object.freeze({ brand: 'WhaleWing' });
/** 许可不画在画面上，写进图片文件属性（EXIF）：Windows 右键“属性”→“详细信息”里能看到。EXIF 文字只能用英文字符。 */
export const portraitLicense = Object.freeze({
  description: 'WhaleWing original character illustration',
  artist: 'WhaleWing',
  copyright: 'Illustration (c) WhaleWing. Licensed under CC BY-NC-SA 4.0, non-commercial use only. https://creativecommons.org/licenses/by-nc-sa/4.0/',
});
const sans = '"Segoe UI","Helvetica Neue",Arial,"Microsoft YaHei","PingFang SC",sans-serif';

/** 只算位置不画：右下角留边，标志在左、文字在右，同一行上下居中。box 是整块水印占的范围。 */
export function watermarkLayout(width, height, measure) {
  const u = width / 1440, margin = 52 * u, logo = 48 * u, gap = 8 * u;
  const title = { size: 30 * u, font: `600 ${30 * u}px ${sans}` };
  const right = width - margin, bottom = height - margin, textWidth = measure(title.font, watermarkText.brand);
  const logoBox = { x: right - textWidth - gap - logo, y: bottom - logo, size: logo };
  // 文字对齐标志的鲸尾部分（标志下半是水纹），看起来和标志在同一条线上。
  return { u, right, logo: logoBox, title: { ...title, y: bottom - logo * 0.47 }, box: { x: logoBox.x, y: logoBox.y, width: right - logoBox.x, height: logo } };
}

/** 画在已经铺好立绘的画布上；Path 可替换，方便在没有浏览器的测试里检查位置。 */
export function drawWatermark(g, width, height, { Path = globalThis.Path2D } = {}) {
  const layout = watermarkLayout(width, height, (font, text) => { g.font = font; return g.measureText(text).width; });
  g.save();
  // 一圈白色柔光衬底：压在衣摆或深色物件上也看得清，又不铺一块底色。
  g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = 8 * layout.u;
  g.textAlign = 'right'; g.textBaseline = 'middle';
  g.font = layout.title.font; g.fillStyle = 'rgba(22,62,134,0.9)'; g.fillText(watermarkText.brand, layout.right, layout.title.y);
  g.shadowBlur = 0;
  g.translate(layout.logo.x, layout.logo.y); g.scale(layout.logo.size / 64, layout.logo.size / 64);
  const fluke = new Path(logoFluke);
  g.fillStyle = logoColors.deep; g.fill(fluke);
  g.save(); g.transform(-1, 0, 0, 1, 64, 0); g.fill(fluke); g.restore();
  g.fill(new Path(logoStem));
  g.strokeStyle = logoColors.sky; g.lineWidth = 3.2; g.lineCap = 'round'; g.stroke(new Path(logoWave));
  g.restore();
  return layout;
}

/** 在 JPG 里加一段 EXIF（图片说明、作者、版权）。放在 JFIF 段之后；不是 JPG 时原样返回。 */
export function addPortraitLicense(bytes, fields = portraitLicense) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const ascii = text => [...text].map(char => { const code = char.charCodeAt(0); if (code > 0x7e || code < 0x20) throw new Error('EXIF 只能写英文字符'); return code; }).concat(0);
  // 标签号必须从小到大：0x010E 图片说明，0x013B 作者，0x8298 版权。
  const tags = [[0x010e, fields.description], [0x013b, fields.artist], [0x8298, fields.copyright]].map(([tag, text]) => [tag, ascii(text)]);
  const ifdSize = 2 + tags.length * 12 + 4, tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00];
  const u16 = value => [value & 0xff, value >> 8 & 0xff], u32 = value => [value & 0xff, value >> 8 & 0xff, value >> 16 & 0xff, value >>> 24 & 0xff];
  let offset = 8 + ifdSize; const data = [];
  tiff.push(...u16(tags.length));
  for (const [tag, value] of tags) {
    tiff.push(...u16(tag), ...u16(2), ...u32(value.length));
    if (value.length <= 4) tiff.push(...value, ...new Array(4 - value.length).fill(0));
    else { tiff.push(...u32(offset)); data.push(...value); if (value.length % 2) data.push(0); offset += value.length + (value.length % 2); }
  }
  tiff.push(...u32(0), ...data);
  const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff], length = body.length + 2;
  const segment = [0xff, 0xe1, length >> 8 & 0xff, length & 0xff, ...body];
  // 紧跟在 SOI 和 JFIF（APP0）后面。
  let at = 2;
  if (bytes[2] === 0xff && bytes[3] === 0xe0) at = 4 + (bytes[4] << 8 | bytes[5]);
  const out = new Uint8Array(bytes.length + segment.length);
  out.set(bytes.subarray(0, at), 0); out.set(segment, at); out.set(bytes.subarray(at), at + segment.length);
  return out;
}

/** 把大图画到画布上、加水印，导出 JPG 并写入许可：白底原图没有透明，JPG 在手机和聊天软件里都能直接打开。 */
export async function watermarkedJpeg(source, env = globalThis) {
  const image = new env.Image();
  image.src = source;
  await image.decode();
  const canvas = env.document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(image, 0, 0);
  drawWatermark(g, canvas.width, canvas.height, { Path: env.Path2D });
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片生成失败')), 'image/jpeg', 0.92));
  const Blob = env.Blob ?? globalThis.Blob;
  return new Blob([addPortraitLicense(new Uint8Array(await blob.arrayBuffer()))], { type: 'image/jpeg' });
}

/** 文件名里去掉系统不允许的字符。 */
export const portraitFileName = name => `鲸翼立绘-${String(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim() || '角色'}.jpg`;
