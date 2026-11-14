/**
 * 办公工坊页面替小鲸执行功能项（2026-11-12 改版）：把小鲸写的功能项编号和 options 换成 Worker 请求，
 * 在这台电脑上处理；音频解码和视频截图要用页面主线程的能力，先在这里准备。只在员工要求时读文件内容。
 */
import { decodeAudio, captureFrames } from './media-prep.js';
import { modelFunctions } from './model-specs.js';
import { utilityCatalog } from './catalog.js';

const regionKeys = ['x', 'y', 'width', 'height'];
export const hasRegion = options => regionKeys.every(key => options?.[key] !== undefined && options[key] !== '' && Number.isFinite(Number(options[key]))) && Number(options.width) > 0 && Number(options.height) > 0;
const numeric = { 'image-grid': ['rows', 'columns'], 'image-watermark': ['fontSize', 'opacity'], 'image-mosaic': ['block'], 'qr-make': ['size'], 'qr-batch': ['size'], 'pdf-rotate': ['angle'], 'image-rotate': ['angle'] };
const imageNumbers = ['quality', 'maxEdge', 'targetKB', 'resizeWidth', 'resizeHeight', ...regionKeys];
export const readLimit = 20000;

/**
 * 结果文件名整理：图片批量处理的结果名是“序号-原名-处理.扩展名”，一步接一步会叠成“1-1-海报-处理-处理.jpg”。
 * 只有一个输入、结果名正好是“1-输入名”开头时去掉序号（本来就以数字开头的文件名不动），重复的“-处理”并成一个。
 */
export function tidyName(name, inputName) {
  let result = String(name || '');
  const base = inputName ? String(inputName).replace(/.[^.]+$/, '') : '';
  if (base && result.startsWith(`1-${base}`)) result = result.slice(2);
  return result.replace(/(?:-处理)+(?=.[^.]+$)/, '-处理') || name;
}

/** Worker 认的处理名：同一实现的直达入口用 action，Excel / CSV 互转看方向。 */
export function workerTool(id, options = {}) {
  if (id === 'table-convert') return options.conversion === 'csv-excel' ? 'csv-excel' : 'excel-csv';
  return utilityCatalog.find(item => item.id === id)?.action || id;
}

/** 小鲸写的 options 按 Worker 的类型要求整理：页码要字符串，角度、字号、尺寸要数字。 */
export function workerOptions(id, options = {}) {
  const result = { ...options };
  if (id === 'image-format') result.mode = 'convert';
  if (Array.isArray(result.pages)) result.pages = result.pages.join(',');
  if (result.pages !== undefined && typeof result.pages !== 'string') result.pages = String(result.pages);
  for (const key of [...(numeric[id] ?? []), ...(id.startsWith('image') ? imageNumbers : [])]) if (result[key] !== undefined && result[key] !== '' && result[key] !== null) result[key] = Number(result[key]);
  if (typeof result.joinColumns === 'string') result.joinColumns = result.joinColumns.split(/[,，、]/).map(item => item.trim()).filter(Boolean);
  return result;
}

const textOf = bytes => new TextDecoder('utf-8').decode(bytes);
function clip(lines) {
  let text = '', truncated = false;
  for (const line of lines) {
    if (text.length + line.length + 1 > readLimit) { truncated = true; break; }
    text += `${line}\n`;
  }
  return { text: text.trimEnd(), truncated };
}
/** rows 写“1-50”这样的范围（从 1 数），PDF 是页码；不写就从头读到上限。 */
export function rowRange(value, total) {
  const match = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(String(value ?? ''));
  if (!match) return [0, total];
  const from = Math.max(1, Number(match[1])), to = match[2] ? Math.max(from, Number(match[2])) : from;
  return [Math.min(total, from - 1), Math.min(total, to)];
}

export function createExecutor({ workerSource, platform = globalThis, prepareAudio = decodeAudio, prepareFrames = captureFrames, timeoutMs = 60000, runWorker, services = {} } = {}) {
  const worker = runWorker ?? (request => new Promise((resolve, reject) => {
    if (typeof platform.Worker !== 'function' || typeof workerSource !== 'string' || !workerSource) { reject(new Error('当前环境缺少后台 Worker，请使用支持它的 DSH 客户端')); return; }
    const script = platform.URL.createObjectURL(new platform.Blob([workerSource], { type: 'text/javascript' }));
    const thread = new platform.Worker(script);
    platform.URL.revokeObjectURL(script);
    const timer = platform.setTimeout(() => finish(reject, new Error('处理超过 60 秒，已经停下；文件小一点或分几次再试')), timeoutMs);
    function finish(settle, value) { platform.clearTimeout(timer); thread.terminate(); settle(value); }
    thread.onerror = event => { event.preventDefault?.(); finish(reject, new Error('文件处理失败，请检查文件')); };
    thread.onmessage = event => {
      const message = event.data;
      if (message?.id !== 1 || message.progress) return;
      if (message.ok === true) finish(resolve, message.result);
      else finish(reject, new Error(typeof message.error === 'string' ? message.error.slice(0, 500) : '文件处理失败，请检查文件'));
    };
    thread.postMessage({ id: 1, request });
  }));

  /** 表格的工作表和表头：给小鲸看的文件描述用，也给按关键列关联认表。 */
  async function headers(files) {
    const result = await worker({ tool: 'excel-headers', files, options: {} });
    return result.tables ?? [];
  }

  async function run(id, files, options = {}, text, ids = []) {
    const spec = modelFunctions[id];
    if (!spec) throw new Error(`没有「${id}」这个功能项`);
    if (spec.region && !hasRegion(options)) return { needs: 'region' };
    if (!files.length && !spec.text) throw new Error('这一步没有输入文件');
    if (id.startsWith('audio-')) {
      const pcm = await prepareAudio(files[0], id === 'audio-trim' ? { start: Number(options.start) || 0, end: options.end === undefined || options.end === '' ? null : Number(options.end) } : {}, platform);
      return worker({ tool: 'audio-encode', files: [], text: '', options: { pcm: { sampleRate: pcm.sampleRate, channels: pcm.channels }, name: files[0].name } });
    }
    if (id === 'video-frame') return prepareFrames(files[0], String(options.times ?? '每 5 秒'), platform);
    // Office 转 PDF 交给主机，用 DSH 自带的转换（2026-11-12）。
    if (id === 'office-pdf') {
      if (typeof services.officePdf !== 'function') throw new Error('办公工坊还没连上主机，转不了 PDF');
      return services.officePdf(files[0]);
    }
    const prepared = workerOptions(id, options);
    if (id === 'excel-join') {
      const tables = await headers(files);
      const table = (ref, role) => {
        const index = ids.indexOf(ref?.file);
        const own = tables.filter(item => item.id.startsWith(`${index < 0 ? 0 : index}/`));
        const found = ref?.sheet ? own.find(item => item.label === ref.sheet || item.label.endsWith(` · ${ref.sheet}`)) : own[0];
        if (!found) throw new Error(`${role}找不到：${ref?.file ?? ''} ${ref?.sheet ?? ''}`.trim());
        return found.id;
      };
      prepared.leftTable = table(options.main, '主表');
      prepared.rightTable = table(options.lookup, '查找表');
      delete prepared.main; delete prepared.lookup;
    }
    return worker({ tool: workerTool(id, prepared), files, options: prepared, text: text ?? '' });
  }

  /** 员工要求小鲸看内容时才调用：表格按行、PDF 按页、其余按行，最多两万字。 */
  async function read(file, type, { sheet, rows } = {}) {
    if (type === 'xlsx') {
      const sheetName = sheet || (await worker({ tool: 'excel-sheets', files: [file], options: {} })).sheets?.[0];
      const json = await worker({ tool: 'excel-json', files: [file], options: { sheetName } });
      const records = JSON.parse(textOf(json.files[0].bytes));
      const columns = records.length ? Object.keys(records[0]) : [];
      const [from, to] = rowRange(rows, records.length);
      const result = clip([`工作表「${sheetName}」共 ${records.length} 行，下面是第 ${from + 1} 到 ${to} 行`, columns.join('\t'), ...records.slice(from, to).map(record => columns.map(column => record[column]).join('\t'))]);
      return { ...result, truncated: result.truncated || to < records.length };
    }
    if (type === 'pdf') {
      const pages = textOf((await worker({ tool: 'pdf-text', files: [file], options: {} })).files[0].bytes).split(/\n\n(?=第 \d+ 页\n)/);
      const [from, to] = rowRange(rows, pages.length);
      const result = clip(pages.slice(from, to));
      return { ...result, truncated: result.truncated || to < pages.length };
    }
    const text = type === 'docx' ? textOf((await worker({ tool: 'word-text', files: [file], options: {} })).files[0].bytes) : textOf(new Uint8Array(await file.arrayBuffer()));
    const lines = text.split(/\r?\n/);
    const [from, to] = rowRange(rows, lines.length);
    const result = clip(lines.slice(from, to));
    return { ...result, truncated: result.truncated || to < lines.length };
  }

  return { run, headers, read };
}
