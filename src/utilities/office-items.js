/**
 * 办公工坊里借 DSH 自带 Office 引擎（随包 LibreOffice）的功能项：Office 转 PDF（2026-11-12）、
 * Office 转图片和旧格式转新格式（2026-11-15 用户定“按推荐做”，先用 DSH 的）。文件交给主机转，页面和小鲸的一单走同一套。
 */
export const officeItems = Object.freeze(['office-pdf', 'office-images', 'office-upgrade']);

function need(services, name) {
  if (typeof services?.[name] !== 'function') throw new Error('办公工坊还没连上主机，用不了 DSH 自带的 Office 转换');
  return services[name];
}

/** Office 转 PDF：主机用 DSH 自带的转换，结果和 Worker 交回的一样。 */
export const officePdf = (services, file) => need(services, 'officePdf')(file);

/**
 * Office 转图片：先用 DSH 自带的转换转成 PDF（和“Office 转 PDF”一样），再交给“PDF 转图片”每页导出 PNG。
 * 返回交给 Worker 的请求；options 和“PDF 转图片”一样（pages：哪些页，按 PDF 的页数算）。
 */
export async function officeImagesRequest(services, file, options = {}) {
  const pdf = (await officePdf(services, file)).files[0];
  return { tool: 'pdf-images', files: [new File([pdf.bytes], pdf.name, { type: 'application/pdf' })], options: { ...options }, text: '' };
}

/** 旧格式转新格式：.doc、.xls、.ppt 一个一个交给主机，另存成 .docx、.xlsx、.pptx。 */
export async function officeUpgrade(services, files, signal) {
  const convert = need(services, 'officeConvert');
  const out = [], missing = new Set();
  for (const file of files) {
    signal?.throwIfAborted?.();
    const value = await convert(file, signal);
    out.push({ name: value.name, mime: value.mime, bytes: value.bytes });
    for (const font of value.missingFonts ?? []) missing.add(font);
  }
  const notes = [`已用 DSH 自带的转换另存成新格式，共 ${out.length} 个`];
  if (missing.size) notes.push(`这台电脑缺这些字体，用相近的字体代替了：${[...missing].join('、')}`);
  return { summary: notes.join('；'), files: out, listing: [] };
}
