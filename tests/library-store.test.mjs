import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { zipSync } from 'fflate';
import { Library, sortBooks, catalogUrl } from '../features/cards/library/store.js';
import { libraryContract } from '../features/cards/contract.js';

const contract = libraryContract(z);
const validate = { state: value => contract.state.parse(value), catalog: value => contract.catalog.parse(value) };
const utf8 = text => new TextEncoder().encode(text);
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const novel = name => utf8(`${name}\n第一章 起\n${'起始的一段正文，用来检查每日学习摘要。'.repeat(5)}\n第二章 承\n第二章正文。\n第三章 转\n第三章正文。`);
const epub = title => zipSync({
  mimetype: [utf8('application/epub+zip'), { level: 0 }],
  'META-INF/container.xml': utf8('<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>'),
  'content.opf': utf8(`<package><metadata><dc:title>${title}</dc:title><dc:creator>作者</dc:creator></metadata><manifest><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>`),
  'cover.png': png,
  'a.xhtml': utf8('<html><body><h1>第一章</h1><p>正文甲</p><img src="cover.png" alt="插图"/></body></html>'),
  'b.xhtml': utf8('<html><body><h1>第二章</h1><p>正文乙</p></body></html>'),
});
async function shelf(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whalewing-library-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, library: new Library({ directory: async () => directory, validate, ...options }) };
}
async function upload(library, name, bytes, extra = {}) {
  const { upload: { id, chunk } } = await library.uploadStart({ name, size: bytes.length });
  for (let offset = 0; offset < bytes.length; offset += chunk) await library.uploadChunk({ upload: id, offset, data: Buffer.from(bytes.subarray(offset, offset + chunk)).toString('base64') });
  return library.uploadFinish({ upload: id, ...extra });
}

test('书架：分块上传后在独立子进程解析入架，常看不满两本时新书自动设为常看，重复导入被拒', async t => {
  const { directory, library } = await shelf(t);
  const first = await upload(library, '张三的故事.txt', novel('张三'));
  assert.equal(first.book.title, '张三的故事');
  assert.equal(first.book.format, 'TXT');
  assert.equal(first.book.chapters, 3);
  assert.equal(first.book.daily, true);
  assert.equal(first.book.size, novel('张三').length, '原文件大小在交给解析进程之前记下');
  assert.equal(Object.hasOwn(first.book, 'sha256'), false, '内部校验值不返回给页面');
  const second = await upload(library, '阿明.epub', epub('阿明的书'));
  assert.equal(second.book.daily, true, '已有一本常看时，第二本也自动补上');
  assert.equal(second.book.author, '作者');
  assert.match(second.book.cover, /^(?:cover\.webp|images\/img-0001\.png)$/);
  assert.equal((await upload(library, 'Zebra.txt', novel('Zebra'))).book.daily, false, '常看已满两本，第三本不自动补位');
  const { library: listed } = await library.list();
  assert.deepEqual(listed.books.map(book => book.title), ['阿明的书', '张三的故事', 'Zebra'], '按书名拼音排序');
  await assert.rejects(upload(library, '同一本.txt', novel('张三')), /已经在书架上了：《张三的故事》/);
  const files = await fs.readdir(path.join(directory, 'whalewing-library', 'books'));
  assert.equal(files.length, 3, '被拒的重复导入不留文件');
  assert.deepEqual(await fs.readdir(path.join(directory, 'whalewing-library', 'uploads')), [], '上传临时文件已删除');
  await assert.rejects(upload(library, '坏文件.bin', Uint8Array.from({ length: 4000 }, (_, i) => (i * 7919) % 256)), /无法识别/);
});

test('书架：上传顺序、数据块和大小都要对得上', async t => {
  const { library } = await shelf(t);
  await assert.rejects(library.uploadStart({ name: 'big.epub', size: 300 * 1024 ** 2 }), /超过 200 MiB/);
  const { upload: { id } } = await library.uploadStart({ name: 'a.txt', size: 10 });
  await assert.rejects(library.uploadChunk({ upload: id, offset: 5, data: Buffer.from('12345').toString('base64') }), /顺序错乱/);
  await assert.rejects(library.uploadChunk({ upload: id, offset: 0, data: Buffer.from('12345678901').toString('base64') }), /数据块无效/);
  await library.uploadChunk({ upload: id, offset: 0, data: Buffer.from('12345').toString('base64') });
  await assert.rejects(library.uploadFinish({ upload: id }), /还没有传完/);
  await library.uploadCancel({ upload: id });
  await assert.rejects(library.uploadChunk({ upload: id, offset: 5, data: Buffer.from('12345').toString('base64') }), /已过期或已取消/);
});

test('书架：分组增改删，书可贴多个分组；删分组只去掉标签', async t => {
  const { library } = await shelf(t);
  const { book } = await upload(library, '书.txt', novel('书'));
  const work = (await library.saveGroup({ name: '工作' })).group;
  const study = (await library.saveGroup({ name: '学习' })).group;
  await assert.rejects(library.saveGroup({ name: '工作' }), /已经有名为“工作”的分组/);
  await library.saveGroup({ id: study.id, name: '自学' });
  const updated = await library.update({ id: book.id, groups: [work.id, study.id, work.id], title: '改过的书名', daily: false });
  assert.deepEqual(updated.book.groups, [work.id, study.id]);
  assert.equal(updated.book.title, '改过的书名');
  assert.equal(updated.book.daily, false);
  assert.deepEqual(updated.library.groups.map(group => group.name), ['工作', '自学']);
  const removed = await library.removeGroup({ id: work.id });
  assert.deepEqual(removed.library.books[0].groups, [study.id]);
  assert.equal(removed.library.books.length, 1);
  await assert.rejects(library.update({ id: book.id, groups: [work.id] }), /分组已被删除/);
});

test('书架：按章打开带图片的阅读树，读完一章后首页常看推进到下一章；删除书连同文件', async t => {
  const { directory, library } = await shelf(t);
  const { book } = await upload(library, 'a.epub', epub('图书'));
  const reading = await library.open({ id: book.id, chapter: 0 });
  assert.deepEqual(reading.reading.toc.map(item => item.title), ['第一章', '第二章']);
  const image = JSON.stringify(reading.reading.chapter.view).match(/"type":"image","url":"(img-\d{4}\.png)","value":"插图"/);
  assert.ok(image, '书内图片成为 image 节点');
  const picture = await library.image({ id: book.id, name: image[1] });
  assert.equal(picture.image.mime, 'image/png');
  assert.deepEqual(Buffer.from(picture.image.data, 'base64'), Buffer.from(png));
  assert.ok((await library.image({ id: book.id, name: 'cover' })).image.data.length > 0);
  let daily = await library.daily();
  assert.equal(daily.books[0].chapter.index, 0);
  assert.equal(daily.books[0].chapter.excerpt, '正文甲');
  assert.deepEqual(daily.books[0].next.map(chapter => [chapter.index, chapter.title]), [[1, '第二章']], '接下来取自已读出的目录');
  await library.progress({ id: book.id, chapter: 0 });
  daily = await library.daily();
  assert.equal(daily.books[0].chapter.title, '第二章');
  await library.progress({ id: book.id, chapter: 1 });
  daily = await library.daily();
  assert.equal(daily.books[0].finished, true);
  assert.deepEqual(daily.books[0].next, [], '读完后没有接下来的章节');
  await assert.rejects(library.open({ id: book.id, chapter: 9 }), /没有这一章/);
  await library.remove({ id: book.id });
  assert.deepEqual((await library.list()).library.books, []);
  assert.deepEqual((await fs.readdir(path.join(directory, 'whalewing-library', 'books'))), []);
});

test('书架：首页常看最多两本、按书名排左右，不再按日期轮换；每本带出接下来的章节', async t => {
  let now = Date.parse('2026-10-22T02:00:00Z');
  const { library } = await shelf(t, { now: () => now });
  for (const name of ['乙', '丙', '甲']) await upload(library, `${name}.txt`, novel(name), { daily: true });
  const today = await library.daily();
  assert.deepEqual(today.books.map(book => book.title), ['丙', '乙'], '要求常看也不超过两本，第三本留在书架');
  assert.equal(today.daily, 2);
  assert.equal(today.total, 3);
  assert.deepEqual(today.books[0].next, [{ index: 1, title: '第二章 承', chars: today.books[0].next[0].chars }, { index: 2, title: '第三章 转', chars: today.books[0].next[1].chars }]);
  now += 86400000;
  assert.deepEqual((await library.daily()).books.map(book => book.title), ['丙', '乙'], '换了一天仍是同样两本');
  contract.daily.parse(today);
});

test('书架：在线书目只从 GitHub 下载并核对 SHA-256，记下许可；网络失败时用上次的书目', async t => {
  const book = novel('开放教材');
  const sha256 = createHash('sha256').update(book).digest('hex');
  const catalog = { version: 1, books: [
    { id: 'open-book', title: '开放教材', author: 'OpenStax', description: '开放许可', category: '管理', format: 'TXT', size: book.length, url: 'books/open-book.txt', sha256, license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: '© OpenStax' },
    { id: 'tampered', title: '被改过', author: '', description: '', category: '', format: 'TXT', size: book.length, url: 'books/open-book.txt', sha256: '0'.repeat(64), license: 'MIT', licenseUrl: 'https://opensource.org/license/mit', attribution: '' },
    { id: 'elsewhere', title: '别处', author: '', description: '', category: '', format: 'TXT', size: book.length, url: 'https://example.com/a.txt', sha256, license: 'MIT', licenseUrl: 'https://opensource.org/license/mit', attribution: '' },
  ] };
  let online = true;
  const requests = [];
  const fetch = async url => {
    requests.push(String(url));
    if (!online) throw new Error('getaddrinfo ENOTFOUND');
    if (String(url) === catalogUrl) return new Response(JSON.stringify(catalog));
    if (String(url).endsWith('/books/open-book.txt')) return new Response(null, { status: 302, headers: { location: 'https://objects.githubusercontent.com/blob/open-book.txt' } });
    if (String(url) === 'https://objects.githubusercontent.com/blob/open-book.txt') return new Response(book);
    return new Response('missing', { status: 404 });
  };
  const { library } = await shelf(t, { fetch });
  const listed = await library.catalog();
  assert.equal(listed.catalog.error, null);
  assert.equal(listed.catalog.entries[0].url, 'https://raw.githubusercontent.com/gwenliu1025/whalewing-library/main/books/open-book.txt');
  const downloaded = await library.download({ entry: 'open-book' });
  assert.equal(downloaded.book.title, '开放教材');
  assert.equal(downloaded.book.author, 'OpenStax');
  assert.deepEqual(downloaded.book.source, { kind: 'catalog', entry: 'open-book', url: listed.catalog.entries[0].url, license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: '© OpenStax' });
  assert.equal((await library.catalog()).catalog.entries[0].installed, downloaded.book.id);
  await assert.rejects(library.download({ entry: 'open-book' }), /已经在书架上了/);
  await assert.rejects(library.download({ entry: 'tampered' }), /校验值不一致/);
  await assert.rejects(library.download({ entry: 'elsewhere' }), /不在允许的 GitHub 域名内：example\.com/);
  assert.ok(!requests.includes('https://example.com/a.txt'), '不向书目以外的域名发请求');
  online = false;
  const offline = await library.catalog();
  assert.match(offline.catalog.error, /^在线书目暂时取不到：连不上 GitHub.*下面是 \d{4}-\d{2}-\d{2} 获取的书目/);
  assert.equal(offline.catalog.entries.length, 3);
});

test('书架：记录文件损坏时不覆盖；启动时清掉上次留下的半成品', async t => {
  const { directory, library } = await shelf(t);
  const root = path.join(directory, 'whalewing-library');
  await fs.mkdir(path.join(root, 'books', '.incoming-x'), { recursive: true });
  await fs.mkdir(path.join(root, 'books', '00000000-0000-4000-8000-000000000000'), { recursive: true });
  await fs.mkdir(path.join(root, 'uploads'), { recursive: true });
  await fs.writeFile(path.join(root, 'uploads', 'old.part'), 'x');
  await library.list();
  assert.deepEqual(await fs.readdir(path.join(root, 'books')), []);
  assert.deepEqual(await fs.readdir(path.join(root, 'uploads')), []);
  await fs.writeFile(path.join(root, 'library.json'), '{坏了');
  await assert.rejects(library.saveGroup({ name: '分组' }), /已损坏，未做任何修改/);
  assert.equal(await fs.readFile(path.join(root, 'library.json'), 'utf8'), '{坏了');
  assert.deepEqual(sortBooks([{ id: '1', title: '第10章', author: '' }, { id: '2', title: '第9章', author: '' }]).map(book => book.title), ['第9章', '第10章']);
});
