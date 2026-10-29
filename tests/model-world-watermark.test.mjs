import test from 'node:test';
import assert from 'node:assert/strict';
import { drawWatermark, watermarkLayout, watermarkText, watermarkedJpeg, portraitFileName, addPortraitLicense, portraitLicense } from '../src/model-world-watermark.js';
import { logoFluke, logoStem, logoWave } from '../src/brand-mark.js';

// 2026-10-27 用户：模型娘立绘可以下载保存（不能商用），下载的图要带水印，放右下角，不要太占画面。
// 同日看了效果嫌两行字叠在一起太丑，定为“图标加英文”：只画鲸翼标志和“WhaleWing”一行，许可写进图片文件属性。

/** 记录画布调用的假 2D 上下文；字宽按字号 × 字数 × 0.6 估算。 */
function recorder() {
  const calls = [];
  const g = {
    calls, font: '10px sans-serif',
    measureText(text) { return { width: Number(/([\d.]+)px/.exec(this.font)[1]) * [...text].length * 0.6 }; },
  };
  for (const name of ['save', 'restore', 'translate', 'scale', 'transform', 'fill', 'stroke', 'fillRect', 'drawImage']) g[name] = (...args) => calls.push([name, ...args]);
  g.fillText = (text, x, y) => calls.push(['fillText', text, x, y, g.font, g.textAlign, g.textBaseline]);
  return g;
}
class FakePath { constructor(d) { this.d = d; } }

/** 读回 JPG 里的 EXIF 文字标签。 */
function readExif(bytes) {
  let at = 2;
  while (at < bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1], length = bytes[at + 2] << 8 | bytes[at + 3];
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === 'Exif') {
      const tiff = at + 10, u16 = offset => bytes[tiff + offset] | bytes[tiff + offset + 1] << 8, u32 = offset => (u16(offset) | u16(offset + 2) << 16) >>> 0;
      const tags = {};
      for (let index = 0, count = u16(8); index < count; index++) {
        const entry = 10 + index * 12, size = u32(entry + 4), start = size <= 4 ? entry + 8 : u32(entry + 8);
        tags[u16(entry)] = String.fromCharCode(...bytes.subarray(tiff + start, tiff + start + size - 1));
      }
      return { at, tags };
    }
    at += 2 + length;
  }
  return null;
}
const jfif = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

test('水印在右下角一行：留出边距、只占画面约 0.3%，按图宽等比缩放', () => {
  const measure = (font, text) => Number(/([\d.]+)px/.exec(font)[1]) * [...text].length * 0.6;
  for (const [width, height] of [[2160, 3840], [1440, 2560], [720, 1280]]) {
    const { box, right } = watermarkLayout(width, height, measure), u = width / 1440;
    assert.ok(right === box.x + box.width && box.x + box.width <= width - 48 * u, '离右边有边距');
    assert.ok(box.y + box.height <= height - 48 * u, '离底边有边距');
    assert.ok(box.x >= width * 0.75 && box.y >= height * 0.96, '整块落在右下角');
    assert.ok(box.width * box.height <= width * height * 0.005, `占画面 ${(box.width * box.height / width / height * 100).toFixed(2)}%`);
  }
  const big = watermarkLayout(1440, 2560, measure), small = watermarkLayout(720, 1280, measure);
  assert.ok(Math.abs(small.box.width * 2 - big.box.width) < 0.01 && Math.abs(small.title.size * 2 - big.title.size) < 0.01, '等比缩放');
});

test('水印只有鲸翼标志加“WhaleWing”，标志在左、文字在右，同一行', () => {
  const g = recorder();
  const layout = drawWatermark(g, 2160, 3840, { Path: FakePath });
  const texts = g.calls.filter(call => call[0] === 'fillText');
  assert.deepEqual(texts.map(call => call[1]), ['WhaleWing']);
  assert.deepEqual(watermarkText, { brand: 'WhaleWing' }, '画面上不再写中文、许可或“非商用”');
  assert.equal(texts[0][2], layout.right); assert.equal(texts[0][5], 'right'); assert.equal(texts[0][6], 'middle');
  assert.ok(texts[0][3] > layout.logo.y && texts[0][3] < layout.logo.y + layout.logo.size, '文字和标志在同一行');
  const shapes = g.calls.filter(call => call[0] === 'fill' || call[0] === 'stroke').map(call => call[1].d);
  assert.deepEqual(shapes, [logoFluke, logoFluke, logoStem, logoWave], '一对尾鳍、尾柄和水纹');
  assert.deepEqual(g.calls.find(call => call[0] === 'translate').slice(1), [layout.logo.x, layout.logo.y]);
  assert.ok(layout.logo.x + layout.logo.size < layout.right - 100, '标志在文字左边');
});

test('许可写进图片文件属性：作者、图片说明和 CC BY-NC-SA 4.0 版权，放在 JFIF 段之后', () => {
  const out = addPortraitLicense(jfif());
  assert.deepEqual([...out.subarray(0, 2)], [0xff, 0xd8]); assert.deepEqual([...out.subarray(-2)], [0xff, 0xd9]);
  const exif = readExif(out);
  assert.equal(exif.at, 20, '紧跟在 JFIF 段后面');
  assert.deepEqual(exif.tags, { 0x010e: portraitLicense.description, 0x013b: 'WhaleWing', 0x8298: portraitLicense.copyright });
  assert.match(portraitLicense.copyright, /CC BY-NC-SA 4\.0, non-commercial use only/);
  const bare = addPortraitLicense(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.equal(readExif(bare).at, 2, '没有 JFIF 段时紧跟在开头');
  const png = Uint8Array.from([0x89, 0x50]); assert.equal(addPortraitLicense(png), png, '不是 JPG 原样返回');
  assert.throws(() => addPortraitLicense(jfif(), { ...portraitLicense, artist: '鲸翼' }), /只能写英文字符/);
});

test('导出的是带水印和许可属性的 JPG：先铺白底和原图，再画水印', async () => {
  const g = recorder(); let exported;
  const canvas = { width: 0, height: 0, getContext: type => (assert.equal(type, '2d'), g), toBlob(done, type, quality) { exported = { type, quality, width: this.width, height: this.height }; done(new Blob([jfif()], { type })); } };
  class Image { async decode() { assert.equal(this.src, 'data:image/webp;base64,AAAA'); this.naturalWidth = 2160; this.naturalHeight = 3840; } }
  const blob = await watermarkedJpeg('data:image/webp;base64,AAAA', { Image, Path2D: FakePath, document: { createElement: tag => (assert.equal(tag, 'canvas'), canvas) } });
  assert.deepEqual(exported, { type: 'image/jpeg', quality: 0.92, width: 2160, height: 3840 });
  assert.equal(blob.type, 'image/jpeg');
  assert.equal(readExif(new Uint8Array(await blob.arrayBuffer())).tags[0x8298], portraitLicense.copyright);
  const order = g.calls.map(call => call[0]);
  assert.ok(order.indexOf('fillRect') < order.indexOf('drawImage') && order.indexOf('drawImage') < order.indexOf('fillText'), '水印画在立绘上面');
  const failing = { ...canvas, toBlob: done => done(null) };
  await assert.rejects(watermarkedJpeg('data:image/webp;base64,AAAA', { Image, Path2D: FakePath, document: { createElement: () => failing } }), /图片生成失败/);
});

test('保存的文件名带角色名，去掉系统不允许的字符', () => {
  assert.equal(portraitFileName('谷歌'), '鲸翼立绘-谷歌.jpg');
  assert.equal(portraitFileName('深度求索 Flash'), '鲸翼立绘-深度求索 Flash.jpg');
  assert.equal(portraitFileName('a/b:c*?'), '鲸翼立绘-a b c.jpg');
  assert.equal(portraitFileName('///'), '鲸翼立绘-角色.jpg');
});
