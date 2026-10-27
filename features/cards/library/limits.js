/** 书架的上限与支持的扩展名。单独成文件，宿主主线程读上限时不必加载 PDF 解析引擎。 */
export const bookLimits = Object.freeze({ file: 200 * 1024 ** 2, images: 5000, imageBytes: 512 * 1024 ** 2, image: 32 * 1024 ** 2, chapters: 20000, text: 80 * 1024 ** 2, pdfPages: 5000 });
export const bookExtensions = Object.freeze(['epub', 'kepub', 'txt', 'text', 'md', 'markdown', 'html', 'htm', 'xhtml', 'docx', 'pdf', 'mobi', 'azw', 'azw3', 'prc', 'pdb', 'fb2', 'fbz', 'rtf', 'cbz', 'zip']);
export const libraryLimits = Object.freeze({ books: 2000, groups: 100, groupName: 30, chunk: 2 * 1024 ** 2, uploads: 3, idleMs: 30 * 60 * 1000, parseMs: 5 * 60 * 1000, catalogBytes: 1024 ** 2, catalogEntries: 500, catalogMs: 30000, downloadMs: 10 * 60 * 1000 });

export class BookError extends Error {
  constructor(message, code = 'BOOK_FORMAT') { super(message); this.name = 'BookError'; this.code = code; }
}
