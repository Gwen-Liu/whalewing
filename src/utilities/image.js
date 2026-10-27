/** 图片格式头在解码前核验；逐张编码并立即释放图像与 Canvas。 */
import { LIMITS, validateFiles } from './core.js';

const fail = message => { throw new Error(message); };
const little16 = (b, p) => b[p] | b[p + 1] << 8;
const little32 = (b, p) => (b[p] | b[p + 1] << 8 | b[p + 2] << 16 | b[p + 3] << 24) >>> 0;
const big32 = (b, p) => (b[p] * 0x1000000 + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3]) >>> 0;
const ascii = (b, p, n) => String.fromCharCode(...b.subarray(p, p + n));
function dimensions(width, height, mime) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > LIMITS.pixels) fail('图片尺寸无效或超过 3,200 万像素');
  return { width, height, mime };
}

/** 可读取的图片扩展名；解码交给浏览器自带解码器，不引入额外依赖。 */
export const imageExtensions = Object.freeze(['png', 'jpg', 'jpeg', 'jfif', 'webp', 'avif', 'gif', 'bmp', 'ico']);

/** ISOBMFF 盒子遍历（AVIF/HEIF 共用）：返回 [类型, 内容起点, 盒子终点]。 */
function* boxes(b, start, end) {
  let p = start;
  while (p < end) {
    if (p + 8 > end) fail('图片容器数据截断');
    let size = big32(b, p), header = 8;
    if (size === 1) { if (p + 16 > end || big32(b, p + 8) !== 0) fail('图片容器盒子过大'); size = big32(b, p + 12); header = 16; }
    else if (size === 0) size = end - p;
    if (size < header || p + size > end) fail('图片容器盒子超出文件');
    yield [ascii(b, p + 4, 4), p + header, p + size];
    p += size;
  }
}

/** AVIF：读 ftyp 品牌和 ispe 尺寸；HEIC 明确说明暂不支持。 */
function inspectIsobmff(bytes, extension) {
  const [first] = boxes(bytes, 0, bytes.length);
  if (first[0] !== 'ftyp' || first[2] - first[1] < 8) fail('图片容器缺少格式声明');
  const brands = [ascii(bytes, first[1], 4)];
  for (let p = first[1] + 8; p + 4 <= first[2]; p += 4) brands.push(ascii(bytes, p, 4));
  if (!brands.some(brand => brand === 'avif' || brand === 'avis')) {
    if (brands.some(brand => ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand))) fail('HEIC / HEIF 照片暂不支持：当前客户端不能本地解码，请先在手机或相册里导出为 JPEG');
    fail('不是可识别的 AVIF 图片');
  }
  if (extension !== 'avif') fail('AVIF 内容与扩展名不符');
  const sizes = [];
  const walk = (start, end) => {
    for (const [kind, data, stop] of boxes(bytes, start, end)) {
      if (kind === 'meta') walk(data + 4, stop);
      else if (kind === 'iprp' || kind === 'ipco') walk(data, stop);
      else if (kind === 'ispe') { if (stop - data < 12) fail('AVIF 尺寸信息无效'); sizes.push([big32(bytes, data + 4), big32(bytes, data + 8)]); }
    }
  };
  walk(first[2], bytes.length);
  if (!sizes.length) fail('AVIF 缺少尺寸信息');
  for (const [width, height] of sizes) dimensions(width, height, 'image/avif');
  // 网格、透明通道和缩略图各有尺寸，解码结果不超过其中最大者即可。
  const [width, height] = sizes.reduce((a, b) => b[0] * b[1] > a[0] * a[1] ? b : a);
  return { width, height, mime: 'image/avif', bounded: true, animated: brands.includes('avis') };
}

function inspectGif(bytes) {
  const info = dimensions(little16(bytes, 6), little16(bytes, 8), 'image/gif');
  const skipColors = (flags, p) => flags & 0x80 ? p + 3 * (2 << (flags & 7)) : p;
  const skipBlocks = p => { for (;;) { if (p >= bytes.length) fail('GIF 数据截断'); const n = bytes[p++]; if (!n) return p; p += n; } };
  let p = skipColors(bytes[10], 13), frames = 0;
  // 很多 GIF 缺少结尾标记，浏览器照常显示；已有画面时按结束处理。
  while (p < bytes.length) {
    const block = bytes[p++];
    if (block === 0x3b) break;
    if (block === 0x21) p = skipBlocks(p + 1);
    else if (block === 0x2c) {
      if (p + 9 > bytes.length) fail('GIF 数据截断');
      p = skipBlocks(skipColors(bytes[p + 8], p + 9) + 1); frames++;
    } else fail('GIF 区块无效');
  }
  if (!frames) fail('GIF 缺少图像数据');
  return { ...info, animated: frames > 1 };
}

function inspectBmp(bytes) {
  if (bytes.length < 26) fail('BMP 数据截断');
  const header = little32(bytes, 14);
  if (header === 12) return dimensions(little16(bytes, 18), little16(bytes, 20), 'image/bmp');
  if (header < 40 || bytes.length < 26 + 4) fail('BMP 信息头无效');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 高度为负表示自上而下存储，尺寸取绝对值。
  return dimensions(view.getInt32(18, true), Math.abs(view.getInt32(22, true)), 'image/bmp');
}

function inspectIco(bytes) {
  const count = little16(bytes, 4);
  if (!count || bytes.length < 6 + 16 * count) fail('ICO 目录无效');
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const p = 6 + 16 * i, length = little32(bytes, p + 8), offset = little32(bytes, p + 12);
    if (!length || offset < 6 + 16 * count || offset + length > bytes.length) fail('ICO 图像超出文件');
    // 内嵌 PNG 的真实尺寸以 PNG 头为准，目录里的 0 表示 256。
    const png = length >= 24 && bytes[offset] === 137 && ascii(bytes, offset + 1, 3) === 'PNG';
    sizes.push(png ? [big32(bytes, offset + 16), big32(bytes, offset + 20)] : [bytes[p] || 256, bytes[p + 1] || 256]);
  }
  for (const [width, height] of sizes) dimensions(width, height, 'image/x-icon');
  const [width, height] = sizes.reduce((a, b) => b[0] * b[1] > a[0] * a[1] ? b : a);
  return { width, height, mime: 'image/x-icon', bounded: true };
}

/** 识别 PNG/JPEG/WebP/AVIF/GIF/BMP/ICO；拒收伪造扩展名，动图标记后只处理第一帧。 */
export function inspectImage(bytes, name) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > LIMITS.file) fail('图片须在 25 MiB 以内');
  const extension = name.split('.').pop().toLowerCase();
  if (bytes.length >= 33 && ascii(bytes, 1, 3) === 'PNG' && bytes[0] === 137 && ascii(bytes, 4, 4) === '\r\n\x1a\n') {
    if (extension !== 'png' || big32(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') fail('PNG 内容与扩展名或文件头不符');
    const info = dimensions(big32(bytes, 16), big32(bytes, 20), 'image/png');
    let p = 8, ended = false, imageData = false, animated = false;
    while (p < bytes.length) {
      if (p + 12 > bytes.length) fail('PNG 数据截断');
      const length = big32(bytes, p), kind = ascii(bytes, p + 4, 4);
      if (p + 12 + length > bytes.length) fail('PNG 区块超出文件');
      if (kind === 'IHDR' && p !== 8) fail('PNG 包含重复尺寸头');
      if (kind === 'acTL') animated = true;
      if (kind === 'IDAT') imageData = true;
      if (kind === 'IEND') { if (length || p + 12 !== bytes.length) fail('PNG 结尾无效'); ended = true; }
      p += length + 12;
    }
    if (!ended || !imageData) fail('PNG 缺少图像数据或结尾');
    return animated ? { ...info, animated } : info;
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    if (extension !== 'webp' || little32(bytes, 4) + 8 !== bytes.length) fail('WebP 内容与扩展名或长度不符');
    let p = 12, info, encoded, animated = false;
    while (p < bytes.length) {
      if (p + 8 > bytes.length) fail('WebP 数据截断');
      const kind = ascii(bytes, p, 4), length = little32(bytes, p + 4), d = p + 8;
      if (d + length + (length % 2) > bytes.length) fail('WebP 区块超出文件');
      if (kind === 'ANIM' || kind === 'ANMF' || (kind === 'VP8X' && bytes[d] & 2)) animated = true;
      let current;
      if (kind === 'VP8X') {
        if (length !== 10 || info) fail('WebP 扩展头无效');
        info = dimensions(1 + bytes[d + 4] + (bytes[d + 5] << 8) + (bytes[d + 6] << 16), 1 + bytes[d + 7] + (bytes[d + 8] << 8) + (bytes[d + 9] << 16), 'image/webp');
      } else if (kind === 'VP8 ') {
        if (length < 10 || bytes[d + 3] !== 0x9d || bytes[d + 4] !== 1 || bytes[d + 5] !== 0x2a) fail('WebP VP8 头无效');
        current = dimensions((bytes[d + 6] | bytes[d + 7] << 8) & 0x3fff, (bytes[d + 8] | bytes[d + 9] << 8) & 0x3fff, 'image/webp');
      } else if (kind === 'VP8L') {
        if (length < 5 || bytes[d] !== 0x2f) fail('WebP VP8L 头无效');
        const bits = little32(bytes, d + 1);
        current = dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, 'image/webp');
      }
      if (current) { if (encoded) fail('WebP 包含重复图像'); encoded = current; }
      p = d + length + (length % 2);
    }
    // 动图的画面都在 ANMF 帧里，画布尺寸以扩展头为准。
    if (animated) { if (!info) fail('WebP 动图缺少扩展头'); return { ...info, animated }; }
    if (!encoded || (info && (info.width !== encoded.width || info.height !== encoded.height))) fail('WebP 图像尺寸与文件头不一致');
    return info || encoded;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    if (!['jpg', 'jpeg', 'jfif'].includes(extension)) fail('JPEG 内容与扩展名不符');
    let p = 2, info;
    while (p + 1 < bytes.length) {
      if (bytes[p++] !== 0xff) fail('JPEG 标记无效');
      while (bytes[p] === 0xff) p++;
      const marker = bytes[p++];
      if (marker === 0xda) { if (!info) fail('JPEG 缺少尺寸头'); return info; }
      if (marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (p + 2 > bytes.length) fail('JPEG 数据截断');
      const length = bytes[p] << 8 | bytes[p + 1];
      if (length < 2 || p + length > bytes.length) fail('JPEG 区块超出文件');
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8 || info) fail('JPEG 尺寸头无效');
        info = dimensions(bytes[p + 5] << 8 | bytes[p + 6], bytes[p + 3] << 8 | bytes[p + 4], 'image/jpeg');
      }
      p += length;
    }
    return fail('JPEG 缺少图像数据');
  }
  if (bytes.length >= 13 && ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) {
    if (extension !== 'gif') fail('GIF 内容与扩展名不符');
    return inspectGif(bytes);
  }
  if (bytes.length >= 2 && ascii(bytes, 0, 2) === 'BM') {
    if (extension !== 'bmp') fail('BMP 内容与扩展名不符');
    return inspectBmp(bytes);
  }
  if (bytes.length >= 22 && little16(bytes, 0) === 0 && little16(bytes, 2) === 1) {
    if (extension !== 'ico') fail('ICO 内容与扩展名不符');
    return inspectIco(bytes);
  }
  if (bytes.length >= 16 && ascii(bytes, 4, 4) === 'ftyp') return inspectIsobmff(bytes, extension);
  if (bytes.length >= 4 && (ascii(bytes, 0, 4) === 'II*\0' || ascii(bytes, 0, 4) === 'MM\0*')) fail('TIFF 图片尚不支持，请先导出为 PNG 或 JPEG');
  return fail('请选择有效的 PNG、JPEG、WebP、AVIF、GIF、BMP 或 ICO 图片');
}

/** 解码后复核真实尺寸：单图格式须与文件头一致（允许 EXIF 旋转交换宽高），多图容器不超过其中最大者。 */
export function checkDecoded(bitmap, info) {
  dimensions(bitmap.width, bitmap.height, info.mime);
  const same = bitmap.width === info.width && bitmap.height === info.height || bitmap.width === info.height && bitmap.height === info.width;
  if (info.bounded ? Math.max(bitmap.width, bitmap.height) > Math.max(info.width, info.height) || bitmap.width * bitmap.height > info.width * info.height : !same) fail('实际图片尺寸与文件头不一致');
}

const encodable = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' };
/** “保持原格式”：PNG/JPEG/WebP 原样，其余（AVIF、GIF、BMP、ICO）浏览器不能编码，输出 PNG。 */
const resolveFormat = (format, mime) => format === 'keep' ? encodable[mime] || 'png' : format;
const extensionOf = format => format === 'jpeg' ? 'jpg' : format;
const mimeOf = format => format === 'ico' ? 'image/x-icon' : `image/${format}`;
const label = format => ({ png: 'PNG', jpeg: 'JPEG', webp: 'WebP', ico: 'ICO' })[format];
/** 空值表示不限制；否则须为 1–10,000 的整数，非法返回 null。 */
const optionalEdge = value => value === undefined || value === null || value === '' || value === 0 ? Infinity : Number.isInteger(value) && value >= 1 && value <= 10000 ? value : null;

async function encodeCanvas(canvas, format, quality) {
  const mime = mimeOf(format), blob = await canvas.convertToBlob({ type: mime, quality });
  if (blob.type !== mime) fail('当前浏览器不支持所选输出格式');
  if (!blob.size) fail('图片输出为空');
  return blob;
}

/** 在新画布上按操作绘制：旋转翻转、裁剪源区域、缩放与文字水印；失败时立即释放画布。 */
function paint(bitmap, plan, source, drawWidth, drawHeight, format) {
  const swap = plan.action === 'image-rotate' && plan.angle % 180 !== 0;
  const width = swap ? drawHeight : drawWidth, height = swap ? drawWidth : drawHeight;
  const canvas = new OffscreenCanvas(width, height);
  try {
    const context = canvas.getContext('2d');
    if (!context) fail('后台 Canvas 创建失败');
    if (format === 'jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
    if (plan.action === 'image-rotate') {
      context.translate(width / 2, height / 2); context.rotate(plan.angle * Math.PI / 180);
      context.scale(plan.flip === 'horizontal' ? -1 : 1, plan.flip === 'vertical' ? -1 : 1);
      context.drawImage(bitmap, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    } else context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, width, height);
    if (plan.action === 'image-watermark') {
      context.globalAlpha = plan.opacity; context.font = `${plan.fontSize}px sans-serif`; context.fillStyle = '#ffffff'; context.strokeStyle = '#000000'; context.lineWidth = 2; context.textBaseline = 'top';
      const measured = context.measureText(plan.watermark).width;
      if (measured + 16 > width || plan.fontSize + 16 > height) fail('水印超出图片，请减小字号或文字长度');
      const x = plan.position === 'top-left' ? 8 : plan.position === 'center' ? (width - measured) / 2 : width - measured - 8;
      const y = plan.position === 'top-left' ? 8 : plan.position === 'center' ? (height - plan.fontSize) / 2 : height - plan.fontSize - 8;
      context.strokeText(plan.watermark, x, y); context.fillText(plan.watermark, x, y); context.globalAlpha = 1;
    }
    return canvas;
  } catch (error) { canvas.width = 0; canvas.height = 0; throw error; }
}
const release = canvas => { canvas.width = 0; canvas.height = 0; };

/** ICO 图标：按 16–256 像素生成多个方形 PNG 帧（不超过原图），等比居中、四周透明。 */
async function encodeIco(bitmap, source) {
  const edge = Math.max(source.width, source.height), frames = [];
  for (const size of [16, 32, 48, 64, 128, 256].filter(size => size <= Math.max(16, edge))) {
    const canvas = new OffscreenCanvas(size, size);
    try {
      const context = canvas.getContext('2d');
      if (!context) fail('后台 Canvas 创建失败');
      const width = Math.max(1, Math.round(source.width * size / edge)), height = Math.max(1, Math.round(source.height * size / edge));
      context.drawImage(bitmap, source.x, source.y, source.width, source.height, (size - width) / 2, (size - height) / 2, width, height);
      frames.push([size, new Uint8Array(await (await encodeCanvas(canvas, 'png')).arrayBuffer())]);
    } finally { release(canvas); }
  }
  // 6 字节文件头 + 每帧 16 字节目录；帧数据直接存 PNG，目录里 0 表示 256。
  let offset = 6 + 16 * frames.length;
  const bytes = new Uint8Array(offset + frames.reduce((n, [, data]) => n + data.length, 0)), view = new DataView(bytes.buffer);
  view.setUint16(2, 1, true); view.setUint16(4, frames.length, true);
  for (const [i, [size, data]] of frames.entries()) {
    const p = 6 + 16 * i;
    bytes[p] = bytes[p + 1] = size === 256 ? 0 : size;
    view.setUint16(p + 4, 1, true); view.setUint16(p + 6, 32, true); view.setUint32(p + 8, data.length, true); view.setUint32(p + 12, offset, true);
    bytes.set(data, offset); offset += data.length;
  }
  return { bytes, width: frames.at(-1)[0], height: frames.at(-1)[0], sizes: frames.map(([size]) => size) };
}

/** 按目标大小压缩：先在原尺寸上二分质量，压不到再逐步缩小；都压不到时给出最小结果并说明。 */
async function compressToSize(bitmap, plan, source, format) {
  let scale = 1, smallest;
  for (let round = 0; round < 8; round++) {
    const width = Math.max(1, Math.round(source.width * scale)), height = Math.max(1, Math.round(source.height * scale));
    const canvas = paint(bitmap, plan, source, width, height, format);
    try {
      let low = 0.1, high = 0.95, fit = await encodeCanvas(canvas, format, high);
      if (fit.size > plan.target) {
        const floor = await encodeCanvas(canvas, format, low);
        if (!smallest || floor.size < smallest.blob.size) smallest = { blob: floor, width, height };
        fit = floor.size <= plan.target ? floor : null;
        for (let i = 0; fit && i < 5; i++) {
          const middle = (low + high) / 2, blob = await encodeCanvas(canvas, format, middle);
          if (blob.size <= plan.target) { fit = blob; low = middle; } else high = middle;
        }
      }
      if (fit) return { blob: fit, width, height, note: scale < 1 ? '为达到目标大小缩小了尺寸' : '' };
    } finally { release(canvas); }
    if (Math.max(width, height) * 0.8 < 16) break;
    scale *= 0.8;
  }
  return { ...smallest, note: '未能压到目标大小，已给出能压到的最小结果' };
}

/** 单张图片：读取、核验、解码、按计划输出；无论成败都释放解码对象。 */
async function processImage(file, plan) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) fail('读取结果与所选图片大小不一致');
  const info = inspectImage(bytes, file.name);
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: info.mime }));
    checkDecoded(bitmap, info);
    let source = { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
    if (plan.action === 'image-crop') {
      if (![plan.x, plan.y, plan.width, plan.height].every(Number.isInteger) || plan.x < 0 || plan.y < 0 || plan.width < 1 || plan.height < 1 || plan.x + plan.width > bitmap.width || plan.y + plan.height > bitmap.height) fail('裁剪区域必须位于原图范围内，且宽高大于 0');
      source = { x: plan.x, y: plan.y, width: plan.width, height: plan.height };
    }
    const format = resolveFormat(plan.format, info.mime), notes = [];
    if (info.animated) notes.push('动图只取第一帧');
    if (format === 'ico') return { ...await encodeIco(bitmap, source), format, notes };
    let width = source.width, height = source.height;
    if (plan.resize) {
      const { width: w, height: h, keepRatio } = plan.resize;
      if (keepRatio) { const scale = Math.min(w / width, h / height); width = Math.round(width * scale); height = Math.round(height * scale); }
      else { if (w !== Infinity) width = w; if (h !== Infinity) height = h; }
      width = Math.max(1, width); height = Math.max(1, height);
      if (width > 10000 || height > 10000) fail('调整后边长超过 10,000 像素');
      dimensions(width, height, info.mime);
    } else {
      const scale = Math.min(1, plan.maxEdge / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale)); height = Math.max(1, Math.round(height * scale));
    }
    if (plan.target) {
      const result = await compressToSize(bitmap, plan, source, format);
      if (result.note) notes.push(result.note);
      return { bytes: new Uint8Array(await result.blob.arrayBuffer()), width: result.width, height: result.height, format, notes };
    }
    const canvas = paint(bitmap, plan, source, width, height, format);
    try {
      const blob = await encodeCanvas(canvas, format, plan.quality);
      return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height, format, notes };
    } finally { release(canvas); }
  } finally { bitmap?.close(); }
}

/** 在 Worker 内逐张处理；单张失败只记入明细，成功的照常交付，全部失败才报错。 */
export async function convertImages(files, options, progress = () => {}) {
  validateFiles(files, 'image');
  const action = options?.action || 'image';
  if (!['image', 'image-rotate', 'image-crop', 'image-watermark', 'image-stitch'].includes(action)) fail('未知图片操作');
  const mode = action === 'image' ? options.mode || 'convert' : 'convert';
  if (!['convert', 'compress', 'resize'].includes(mode)) fail('请选择转换格式、压缩体积或调整尺寸');
  const formats = mode === 'compress' ? ['jpeg', 'webp'] : action === 'image' && mode === 'convert' ? ['keep', 'png', 'jpeg', 'webp', 'ico'] : ['keep', 'png', 'jpeg', 'webp'];
  const quality = options.quality ?? 0.9, maxEdge = optionalEdge(options.maxEdge);
  if (!formats.includes(options.format) || !Number.isFinite(quality) || quality < 0.1 || quality > 1 || maxEdge === null) fail('请选择有效格式、10–100% 质量及 1–10,000 像素最大边长');
  const plan = { ...options, action, quality, maxEdge, resize: null, target: 0 };
  if (mode === 'resize') {
    const width = optionalEdge(options.resizeWidth), height = optionalEdge(options.resizeHeight);
    if (width === null || height === null || width === Infinity && height === Infinity) fail('请填写 1–10,000 像素的宽度或高度');
    plan.resize = { width, height, keepRatio: options.keepRatio !== false };
  }
  if (mode === 'compress' && options.target === 'size') {
    if (!Number.isInteger(options.targetKB) || options.targetKB < 10 || options.targetKB > 25600) fail('目标大小须为 10–25,600 KB');
    plan.target = options.targetKB * 1024;
  }
  if (typeof globalThis.createImageBitmap !== 'function' || typeof globalThis.OffscreenCanvas !== 'function') fail('当前浏览器缺少后台图片处理能力，请使用支持 Worker 图像处理的 DSH 桌面端');
  if (action === 'image-stitch') return stitchImages(files, plan);
  if (action === 'image-crop' && files.length !== 1) fail('裁剪时请选择一张图片');
  if (action === 'image-rotate' && (![0, 90, 180, 270].includes(options.angle) || !['none', 'horizontal', 'vertical'].includes(options.flip))) fail('请选择有效旋转角度和翻转方向');
  if (action === 'image-watermark' && (typeof options.watermark !== 'string' || !options.watermark.trim() || options.watermark.length > 100 || !Number.isFinite(options.opacity) || options.opacity < 0.1 || options.opacity > 1 || !Number.isInteger(options.fontSize) || options.fontSize < 10 || options.fontSize > 200 || !['top-left', 'center', 'bottom-right'].includes(options.position))) fail('水印需为 1–100 字，字号 10–200，透明度 10–100%');
  // 只重试失败项时沿用原序号命名，与上一轮成功的结果不重名。
  const positions = Array.isArray(options.positions) && options.positions.length === files.length && options.positions.every(n => Number.isInteger(n) && n >= 0 && n < LIMITS.images) ? options.positions : files.map((_, i) => i);
  const outputs = [], details = [], failed = [], notes = new Set(); let total = 0, firstError = null;
  for (const [index, file] of files.entries()) {
    progress(index, files.length);
    try {
      const output = await processImage(file, plan);
      if (total + output.bytes.length > LIMITS.output) fail('图片输出合计超过 100 MiB');
      total += output.bytes.length;
      const name = `${positions[index] + 1}-${file.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120)}-处理.${extensionOf(output.format)}`;
      outputs.push({ name, mime: mimeOf(output.format), bytes: output.bytes });
      const size = output.sizes ? `${output.sizes.join('、')} 像素图标` : `${output.width} × ${output.height}`;
      details.push(`${file.name}：${file.size} → ${output.bytes.length} 字节，${size}，${label(output.format)}${output.bytes.length > file.size ? '（输出变大）' : ''}${output.notes.length ? `；${output.notes.join('；')}` : ''}`);
      if (output.format === 'jpeg') notes.add('JPEG 透明区域填充白色');
      for (const note of output.notes) notes.add(note);
    } catch (error) {
      firstError ??= error;
      failed.push(index); details.push(`${file.name}：失败，${error instanceof Error ? error.message : '处理出错'}`);
    }
  }
  if (!outputs.length) { if (files.length === 1) throw firstError; fail(`${files.length} 张图片全部处理失败：${firstError.message}`); }
  const summary = [`已处理 ${outputs.length} 张图片${failed.length ? `，${failed.length} 张失败` : ''}`, ...notes, '原件保持不变'].join('；');
  return { files: outputs, summary, listing: details, failed };
}

async function decodeSelected(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) fail('图片读取长度不一致');
  const info = inspectImage(bytes, file.name), bitmap = await createImageBitmap(new Blob([bytes], { type: info.mime }));
  try { checkDecoded(bitmap, info); } catch (error) { bitmap.close(); throw error; }
  return { bitmap, info };
}

async function stitchImages(files, options) {
  if (!['horizontal', 'vertical'].includes(options.direction)) fail('请选择水平或垂直拼接');
  const sizes = []; let width = 0, height = 0, format = options.format;
  // 先逐张取得旋转后的真实尺寸并释放，再分配结果画布，始终只保留一个源图解码对象。
  for (const file of files) {
    const { bitmap, info } = await decodeSelected(file);
    try {
      if (!sizes.length) format = resolveFormat(options.format, info.mime);
      const ratio = Math.min(1, options.maxEdge / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * ratio)), h = Math.max(1, Math.round(bitmap.height * ratio));
      sizes.push([w, h]); width = options.direction === 'horizontal' ? width + w : Math.max(width, w); height = options.direction === 'vertical' ? height + h : Math.max(height, h);
      dimensions(width, height, mimeOf(format));
      if (width > 10000 || height > 10000) fail('拼接结果边长超过 10,000 像素，请设置单图最大边长');
    } finally { bitmap.close(); }
  }
  const canvas = new OffscreenCanvas(width, height);
  try {
    const context = canvas.getContext('2d');
    if (!context) fail('后台 Canvas 创建失败');
    if (format === 'jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
    let x = 0, y = 0;
    for (const [i, file] of files.entries()) {
      const { bitmap } = await decodeSelected(file);
      try { const [w, h] = sizes[i]; context.drawImage(bitmap, x, y, w, h); if (options.direction === 'horizontal') x += w; else y += h; } finally { bitmap.close(); }
    }
    const blob = await encodeCanvas(canvas, format, options.quality);
    if (blob.size > LIMITS.output) fail('拼接输出超过 100 MiB');
    return { files: [{ name: `拼接结果.${extensionOf(format)}`, mime: mimeOf(format), bytes: new Uint8Array(await blob.arrayBuffer()) }], summary: `${files.length} 张图片按选择顺序拼接，${width} × ${height}，${label(format)}${format === 'jpeg' ? '；空白区域填白' : ''}` };
  } finally { release(canvas); }
}
