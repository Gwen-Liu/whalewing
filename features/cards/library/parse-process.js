import { parseBook, BookError } from './formats.js';

// 独立子进程解析：大 PDF、几百张图的 EPUB 不阻塞 DSH 主进程；解析引擎即使原生崩溃也只结束这个子进程。
// 收到一本书、回一个结果，发送完成后立即退出。
process.once('message', async ({ bytes, filename }) => {
  let reply;
  try {
    reply = { ok: true, book: await parseBook(bytes, filename) };
  } catch (error) {
    reply = { ok: false, code: error instanceof BookError ? error.code : 'BOOK_PARSE', message: error instanceof BookError ? error.message : `解析失败：${String(error?.message || error).slice(0, 300)}` };
  }
  process.send(reply, () => process.exit(0));
});
