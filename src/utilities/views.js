/** 工具台只消费用户选件；下载与后台任务仅在当前挂载实例存活。 */
import { utilityTools, searchUtilities, utilityGapsFor } from './catalog.js';
import { decodeAudio, captureFrames } from './media-prep.js';

const copy = Object.freeze({
  title: '工具台', help: '内置本地处理，不上传文件，不调用模型 API。每次最多 20 个文件，PDF 最多 200 页，单文件 25 MiB、总输入与输出 100 MiB；文本 2 MiB',
  search: '搜索工具', empty: '没有匹配工具', choose: '选择工具', file: '选择本地文件', selected: '已选择', start: '开始处理', cancel: '取消处理', running: '正在本地处理，可随时取消',
  cancelled: '已取消本次处理，先前结果仍保留', timeout: '处理超过 60 秒，任务已停止；请缩小输入后重试', worker: '当前环境缺少后台 Worker，请使用支持该能力的 DSH 客户端',
  failed: '处理失败，请检查文件后重试', readSheets: '读取工作表', sheet: '选择工作表', sheetEmpty: '先读取工作表', format: '输出格式', quality: '质量（10–100%）', maxEdge: '最大边长（1–10,000 像素）',
  imageHelp: '支持 PNG、JPEG（含 .jfif）、WebP、AVIF、GIF、BMP、ICO，单张最多 3,200 万像素；动图只取第一帧。输出不保留拍摄信息等元数据，转 JPEG 时透明区域填白，输出变大会如实显示',
  excelHelp: '仅导出保存的数值与文字，不迁移数字显示格式、样式与图表，数据验证规则不迁移。公式缺少已保存结果或存在合并单元格时停止',
  wordHelp: '每张表格生成一个工作表，前导零与文本保留；嵌套、合并、内容控件、修订、隐藏文字及图形等复杂表格明确报错',
  mediaHelp: '提取 DOCX、XLSX、PPTX 文件内媒体与资源清单，不执行嵌入对象',
  text: '文本输入', textHelp: '粘贴文本或选择 UTF-8 文件。CSV 表头非空且唯一、每行等长；JSON 为非空扁平对象数组，各行同键且值均为字符串。CSV 输出为公式触发字段添加单引号并显示数量',
  operation: '文本操作', result: '上次已完成的结果', download: '下载', pending: '尚未内置：在线视频／文案分享链接提取、OCR；不以外链代替内置能力',
});

function validateResult(result) {
  if (!result || typeof result !== 'object') throw new Error('后台返回结果格式不正确');
  if (Object.hasOwn(result, 'sheets')) {
    if (!Array.isArray(result.sheets) || !result.sheets.length || result.sheets.length > 2000 || result.sheets.some(name => typeof name !== 'string' || !name || name.length > 31) || new Set(result.sheets).size !== result.sheets.length || result.files) throw new Error('工作表目录格式不正确');
    return;
  }
  // 表格关联读取的表头目录：每张表的身份、名称和首行列名。
  if (Object.hasOwn(result, 'tables')) {
    if (!Array.isArray(result.tables) || !result.tables.length || result.tables.length > 40 || result.files || result.tables.some(table => !table || !/^\d+\/\d+$/.test(table.id) || typeof table.label !== 'string' || !table.label || table.label.length > 200 || !Array.isArray(table.headers) || table.headers.length > 500 || table.headers.some(name => typeof name !== 'string' || name.length > 200))) throw new Error('表头目录格式不正确');
    return;
  }
  // 页面整理的缩略图：按原页码，JPEG 字节合计不超过 20 MiB。
  if (Object.hasOwn(result, 'thumbs')) {
    let total = 0;
    if (!Array.isArray(result.thumbs) || !result.thumbs.length || result.thumbs.length > 200 || result.files || result.thumbs.some((thumb, i) => !thumb || thumb.page !== i || ![thumb.width, thumb.height].every(n => Number.isInteger(n) && n >= 1 && n <= 1000) || !(thumb.bytes instanceof Uint8Array) || (total += thumb.bytes.length) > 20 * 1024 ** 2)) throw new Error('页面缩略图格式不正确');
    return;
  }
  const mimeTypes =new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'application/json;charset=utf-8', 'text/csv;charset=utf-8', 'text/plain;charset=utf-8', 'image/svg+xml', 'audio/mpeg', 'audio/wav']);
  if (!Array.isArray(result.files) || !result.files.length || result.files.length > 20 || typeof result.summary !== 'string' || result.summary.length > 2000) throw new Error('后台返回下载结果格式不正确');
  let total = 0;
  for (const file of result.files) {
    if (!file || typeof file.name !== 'string' || !file.name || file.name.length > 300 || /[\\/:\x00-\x1f]/.test(file.name) || !mimeTypes.has(file.mime) || !(file.bytes instanceof Uint8Array)) throw new Error('后台返回文件格式不正确');
    total += file.bytes.length;
    if (total > 100 * 1024 ** 2) throw new Error('输出超过 100 MiB');
  }
  if (result.failed !== undefined && (!Array.isArray(result.failed) || result.failed.length > 20 || result.failed.some(index => !Number.isInteger(index) || index < 0 || index >= 20))) throw new Error('后台返回失败清单格式不正确');
  if (result.listing !== undefined && (!Array.isArray(result.listing) || result.listing.length > 2000 || result.listing.some(line => typeof line !== 'string' || line.length > 2048))) throw new Error('后台返回清单格式不正确');
}

/** 单实例任务与 URL owner；取消、隐藏和销毁都使迟到事件失效。 */
export function createUtilityRunner(workerSource, platform, onChange) {
  let generation = 0, current = null, disposed = false;
  let state = { busy: false, error: '', notice: '', result: null, sheets: [], tables: [], thumbs: [], progress: null };
  const emit = patch => { state = { ...state, ...patch }; if (!disposed) onChange(state); };
  const releaseResult = result => { for (const file of result?.files || []) platform.URL.revokeObjectURL(file.url); };
  const releaseThumbs = thumbs => { for (const thumb of thumbs || []) platform.URL.revokeObjectURL(thumb.url); };
  const toFiles = (raw, urls) => raw.files.map(file => { const blob = new platform.Blob([file.bytes], { type: file.mime }), url = platform.URL.createObjectURL(blob); urls.push(url); return { name: file.name, mime: file.mime, size: file.bytes.length, url, blob }; });
  /** append：只重试失败项或打包时，新文件接在上次结果后面，上次的下载保持可用。 */
  const settle = (raw, files, append) => {
    const previous = state.result, fresh = { files, summary: raw.summary, listing: raw.listing || [], failed: raw.failed || [] };
    const result = append && previous ? { files: [...previous.files, ...files], summary: [...new Set([...previous.summary.split('；'), ...fresh.summary.split('；')])].join('；'), listing: [...previous.listing, ...fresh.listing], failed: Object.hasOwn(raw, 'failed') ? fresh.failed : previous.failed } : fresh;
    stop(); if (!(append && previous)) releaseResult(previous); emit({ busy: false, result, notice: '', error: '', progress: null });
  };
  const stop = () => {
    generation++;
    if (current) { if (current.timer !== null) platform.clearTimeout(current.timer); current.worker?.terminate(); if (current.script) platform.URL.revokeObjectURL(current.script); current = null; }
  };
  return {
    snapshot: () => state,
    cancel(notice = copy.cancelled) { if (!current) return; stop(); emit({ busy: false, notice, error: '', progress: null }); },
    run(request, { append = false } = {}) {
      if (disposed) return;
      stop();
      const id = generation, token = { id, worker: null, script: null, timer: null, started: null };
      current = token;
      emit({ busy: true, error: '', notice: '', progress: null });
      try {
        // 平台初始化也可能失败，必须与 Worker 失败共用清理并退出 busy。
        token.started = (platform.now || Date.now)();
        token.timer = platform.setTimeout(() => { if (current !== token) return; stop(); emit({ busy: false, error: copy.timeout }); }, 60000);
        if (typeof platform.Worker !== 'function' || typeof workerSource !== 'string' || !workerSource) throw new Error(copy.worker);
        token.script = platform.URL.createObjectURL(new platform.Blob([workerSource], { type: 'text/javascript' }));
        token.worker = new platform.Worker(token.script);
        platform.URL.revokeObjectURL(token.script); token.script = null;
        token.worker.onerror = event => { if (current !== token) return; event.preventDefault?.(); stop(); emit({ busy: false, error: copy.failed }); };
        token.worker.onmessageerror = () => { if (current !== token) return; stop(); emit({ busy: false, error: copy.failed }); };
        token.worker.onmessage = event => {
          if (current !== token || event.data?.id !== id) return;
          if (event.data.progress) {
            const { done, total } = event.data.progress;
            if (Number.isInteger(done) && Number.isInteger(total) && done >= 0 && done < total && total <= 20) emit({ progress: { done, total } });
            return;
          }
          if ((platform.now || Date.now)() - token.started >= 60000) { stop(); emit({ busy: false, error: copy.timeout }); return; }
          const urls = [];
          try {
            const message = event.data;
            if (message.ok !== true) throw new Error(typeof message.error === 'string' ? message.error.slice(0, 500) : copy.failed);
            validateResult(message.result);
            if (request.tool === 'excel-sheets') {
              if (!message.result.sheets) throw new Error('工作表目录缺失');
              stop(); emit({ busy: false, sheets: message.result.sheets, notice: `已读取 ${message.result.sheets.length} 张工作表，请选择后开始处理` }); return;
            }
            if (request.tool === 'excel-headers') {
              if (!message.result.tables) throw new Error('表头目录缺失');
              stop(); emit({ busy: false, tables: message.result.tables, notice: `已读取 ${message.result.tables.length} 张表的表头，请选择主表、查找表和关键列` }); return;
            }
            if (request.tool === 'pdf-thumbs') {
              if (!message.result.thumbs) throw new Error('页面缩略图缺失');
              const thumbs = message.result.thumbs.map(thumb => { const url = platform.URL.createObjectURL(new platform.Blob([thumb.bytes], { type: 'image/jpeg' })); urls.push(url); return { page: thumb.page, width: thumb.width, height: thumb.height, url }; });
              stop(); releaseThumbs(state.thumbs); emit({ busy: false, thumbs, notice: '' }); return;
            }
            if (!message.result.files) throw new Error('下载文件缺失');
            settle(message.result, toFiles(message.result, urls), append);
          } catch (error) {
            for (const url of urls) platform.URL.revokeObjectURL(url);
            stop(); emit({ busy: false, error: error instanceof Error ? error.message : copy.failed, progress: null });
          }
        };
        token.worker.postMessage({ id, request });
      } catch (error) { stop(); emit({ busy: false, error: error instanceof Error ? error.message : copy.failed }); }
    },
    /** 先在主线程准备（音频解码、视频截图），再交给 Worker 或直接交付；取消同样使准备结果失效。 */
    async prepare(task, next) {
      if (disposed) return;
      stop();
      const token = { timer: null, worker: null, script: null }, id = generation;
      current = token; emit({ busy: true, error: '', notice: '' });
      try {
        const value = await task();
        if (current !== token || id !== generation || disposed) return;
        current = null;
        if (next) this.run(next(value)); else this.deliver(value);
      } catch (error) {
        if (current !== token || id !== generation || disposed) return;
        stop(); emit({ busy: false, error: error instanceof Error ? error.message : copy.failed });
      }
    },
    deliver(raw) {
      if (disposed) return;
      const urls = [];
      try {
        validateResult(raw);
        settle(raw, toFiles(raw, urls), false);
      } catch (error) { for (const url of urls) platform.URL.revokeObjectURL(url); stop(); emit({ busy: false, error: error instanceof Error ? error.message : copy.failed }); }
    },
    clearSheets() { emit({ sheets: [], tables: [] }); },
    clearThumbs() { releaseThumbs(state.thumbs); emit({ thumbs: [] }); },
    dispose() { if (disposed) return; disposed = true; stop(); releaseResult(state.result); releaseThumbs(state.thumbs); state = { ...state, result: null, thumbs: [], busy: false }; },
  };
}

/** 返回稳定挂载的工具台；所属功能负责 active 和卸载。 */
export function createUtilityViews(React, workerSource) {
  const h = React.createElement;
  const tools = utilityTools;
  const icons = {
    convert: 'M7 7h11l-3-3M17 17H6l3 3',
    pdf: 'M6 3h8l4 4v14H6zM14 3v5h4M8.5 15.5h2a1.2 1.2 0 0 0 0-2.4h-2v4.4M13 13.1v4.4h1a2.2 2.2 0 0 0 0-4.4z',
    table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
    image: 'M4 5h16v14H4zM4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 18M15.5 9.5h.01',
    text: 'M5 6h14M12 6v12M8 18h8',
    media: 'M5 5h14v14H5zM10 9v6l5-3z',
    qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2',
  };
  // 线条图标放在跟随主题的浅底板上，不再用彩色实心方块（装了皮肤时也不挡背景）。
  const ToolIcon = ({ tool, size = 21 }) => h('span', { className: 'yj-tool-icon', 'aria-hidden': true },
    h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: icons[tool.icon] })));
  // 模态框不承担整页布局：明确固定定位与内容高度，避免四边定位把 auto 高度拉满。
  const css = [
    '.yj-tool-directory{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))!important;gap:14px;margin-top:16px}',
    '.yj-tool-card{display:flex!important;flex-direction:column;align-items:stretch;text-align:left;gap:12px;padding:18px!important;border-radius:14px!important;background:var(--yj-surface)!important;border:1px solid var(--yj-line)!important;cursor:pointer;transition:border-color .15s}',
    '.yj-tool-card:hover{border-color:var(--yj-line-2)!important}.yj-tool-card-head{display:flex;gap:12px;align-items:center}.yj-tool-card-head strong{font-size:15px;font-weight:600;display:block;color:var(--yj-ink)}.yj-tool-card-head small{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:3px}',
    '.yj-tool-icon{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:11px;flex:none;background:var(--yj-surface-2);color:var(--yj-ink-2)}',
    '.yj-tool-chips{display:flex;flex-wrap:wrap;gap:6px}.yj-tool-chip{min-height:0!important;font-size:12.5px!important;padding:3px 10px!important;border-radius:999px!important;border:1px solid var(--yj-line)!important;background:transparent!important;color:var(--yj-ink-2)!important;cursor:pointer}.yj-tool-chip:hover{color:var(--yj-ink)!important;border-color:var(--yj-line-2)!important;background:var(--yj-tint)!important}',
    '.yj-tool-results{display:grid;gap:6px;margin-top:16px}.yj-tool-hit{display:flex!important;align-items:center;gap:12px;text-align:left;padding:10px 14px!important;border-radius:12px!important}.yj-tool-hit .yj-tool-icon{width:32px;height:32px;border-radius:9px}.yj-tool-hit small{color:var(--dsw-alias-label-secondary);margin-left:auto}',
    'dialog.yj-tool-modal{position:fixed;inset:0;margin:auto;display:block;box-sizing:border-box;width:min(1040px,calc(100vw - 32px));height:fit-content;min-height:0;max-height:calc(100dvh - 48px);padding:0;border:1px solid var(--yj-line-2);border-radius:20px;color:var(--yj-ink);background:var(--yj-raised);box-shadow:var(--dsw-elevation-prominent);overflow:auto}',
    '.yj-tool-modal::backdrop{background:color-mix(in srgb,var(--dsw-alias-label-primary) 26%,transparent);backdrop-filter:blur(3px)}dialog.yj-tool-modal:not([open]){display:none}',
    '.yj-tool-modal header{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--yj-line);position:sticky;top:0;background:var(--yj-raised);z-index:2}.yj-tool-modal header h2{flex:1;margin:0;font:600 18px/1.3 var(--yj-serif)}',
    '.yj-tool-layout{display:grid;grid-template-columns:200px 1fr;min-height:420px}.yj-tool-nav{display:flex;flex-direction:column;gap:2px;padding:12px;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',
    '.yj-tool-nav button{text-align:left;padding:9px 12px!important;border-radius:10px!important;border:0!important;background:none!important;cursor:pointer;color:var(--dsw-alias-label-secondary)}.yj-tool-nav button[aria-current=true]{background:var(--dsw-alias-bg-layer-1)!important;color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px var(--dsw-alias-border-l1)}.yj-tool-nav button small{display:block;font-size:11px;opacity:.8;margin-top:2px}',
    '.yj-tool-body{padding:20px 24px;display:flex;flex-direction:column;gap:14px;min-width:0}.yj-tool-body h3{font-size:16px;font-weight:500;margin:0}.yj-tool-body .yj-field{min-width:0;display:flex;flex-direction:column;gap:5px}.yj-tool-body textarea{width:100%;min-height:100px;resize:vertical}.yj-tool-body .yj-row{gap:12px;flex-wrap:wrap}',
    '.yj-tool-drop{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;padding:26px 22px;border:1.5px dashed var(--yj-line-3);border-radius:14px;text-align:center;color:var(--yj-ink-2);cursor:pointer;transition:border-color .15s,background .15s}.yj-tool-drop strong{font-size:14px;font-weight:500;color:var(--yj-ink)}.yj-tool-drop input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.yj-tool-pick{display:inline-flex;align-items:center;height:32px;padding:0 14px;border:1px solid var(--yj-line-2);border-radius:10px;background:var(--yj-surface);color:var(--yj-ink);font-weight:500}.yj-tool-drop:hover,.yj-tool-drop.yj-file-over{border-color:var(--yj-brand);background:var(--yj-tint)}.yj-tool-drop:focus-within{outline:2px solid var(--yj-brand);outline-offset:2px}',
    '.yj-tool-body .yj-primary{background:var(--yj-fill)!important;color:var(--yj-on-fill)!important;border:0!important;padding:8px 20px!important;border-radius:10px!important;cursor:pointer}.yj-tool-body .yj-primary:disabled{opacity:.45;cursor:default}.yj-tool-preview{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}.yj-tool-preview img{max-height:220px;max-width:100%;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:repeating-conic-gradient(#e5e7eb 0 25%,#fff 0 50%) 0 0/16px 16px}',
    '.yj-tool-result{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 14px;overflow-wrap:anywhere;background:var(--dsw-alias-bg-layer-2)}.yj-tool-result a{color:var(--dsw-alias-brand-primary)}',
    '.yj-region{position:relative;display:inline-block;max-width:100%;overflow:hidden;border-radius:10px;cursor:crosshair;user-select:none;touch-action:none;align-self:flex-start}.yj-region img{display:block;max-width:100%;max-height:380px;pointer-events:none}.yj-region-box{position:absolute;border:2px dashed #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.4),0 0 0 1px rgba(0,0,0,.6)}',
    '.yj-tool-files ol{margin:0 0 8px;padding-left:22px;display:grid;gap:4px}.yj-tool-files li{display:flex;align-items:center;gap:8px}.yj-tool-files li span{flex:1;min-width:0;overflow-wrap:anywhere}.yj-tool-files li button{padding:2px 8px!important;font-size:12px}',
    '.yj-tool-columns{display:flex;flex-wrap:wrap;gap:6px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 12px;margin:0}.yj-tool-columns label{display:inline-flex!important;flex-direction:row!important;align-items:center;gap:4px;cursor:pointer}.yj-tool-columns legend{font-size:12px;color:var(--dsw-alias-label-secondary);padding:0 4px}.yj-tool-join{display:flex;flex-direction:column;gap:10px}',
    '.yj-pdf-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.yj-pdf-grid li{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);cursor:grab;font-size:12px}.yj-pdf-grid li.yj-pdf-removed{opacity:.4}.yj-pdf-thumb{height:150px;display:flex;align-items:center;justify-content:center;overflow:hidden}.yj-pdf-thumb img{max-width:130px;max-height:130px;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .15s}.yj-pdf-actions{display:flex;gap:4px;flex-wrap:wrap}.yj-pdf-actions button{padding:2px 6px!important;font-size:12px}.yj-pdf-pages{display:flex;flex-direction:column;gap:8px}',
    '.yj-page .yj-tool-search{flex:none;width:360px;max-width:100%;min-width:0}.yj-tool-search input{width:100%;height:36px;border-radius:10px}',
    '.yj-tool-gaps{margin:12px 0 0;padding-left:20px;color:var(--dsw-alias-label-secondary);font-size:13px;display:grid;gap:4px}',
    '.yj-tool-restore{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;margin:12px 0;border:1px solid var(--dsw-alias-brand-primary);border-radius:12px}.yj-tool-help{color:var(--dsw-alias-label-secondary);font-size:12px}',
    '@media(max-width:720px){.yj-tool-layout{grid-template-columns:1fr}.yj-tool-nav{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1)}.yj-tool-nav button{white-space:nowrap}.yj-tool-nav button small{display:none}}',
    'html[data-platform=darwin] .yj-tool-modal{padding-top:0;max-height:calc(100dvh - var(--dsh-frame-top-clearance,0px) - 48px)}',
  ].join('');

  /** 在预览图上拖拽框选区域；选区以原图像素记录，供裁剪、打码、去水印使用。 */
  function RegionPicker({ file, value, onChange, disabled }) {
    const [url, setUrl] = React.useState(''), image = React.useRef(null), start = React.useRef(null), [natural, setNatural] = React.useState(null);
    React.useEffect(() => {
      if (!file || typeof globalThis.URL?.createObjectURL !== 'function') return undefined;
      const next = globalThis.URL.createObjectURL(file); setUrl(next); setNatural(null);
      return () => globalThis.URL.revokeObjectURL(next);
    }, [file]);
    if (!file) return null;
    const point = event => {
      const box = image.current.getBoundingClientRect(), scale = image.current.naturalWidth / box.width;
      return [Math.max(0, Math.min(image.current.naturalWidth, Math.round((event.clientX - box.left) * scale))), Math.max(0, Math.min(image.current.naturalHeight, Math.round((event.clientY - box.top) * scale)))];
    };
    const move = event => {
      if (!start.current) return;
      const [x, y] = point(event), [sx, sy] = start.current;
      onChange({ x: Math.min(x, sx), y: Math.min(y, sy), width: Math.abs(x - sx), height: Math.abs(y - sy) });
    };
    const box = natural && value.width > 0 && value.height > 0 ? { left: `${value.x / natural[0] * 100}%`, top: `${value.y / natural[1] * 100}%`, width: `${value.width / natural[0] * 100}%`, height: `${value.height / natural[1] * 100}%` } : null;
    return h('div', { className: 'yj-field' }, h('span', null, '在图片上拖动鼠标框选区域'),
      h('div', { className: 'yj-region', onPointerDown: event => { if (disabled || !image.current) return; event.currentTarget.setPointerCapture?.(event.pointerId); start.current = point(event); move(event); }, onPointerMove: move, onPointerUp: () => { start.current = null; } },
        url && h('img', { ref: image, src: url, alt: '', draggable: false, onLoad: event => setNatural([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight]) }),
        box && h('div', { className: 'yj-region-box', style: box })),
      h('small', { className: 'yj-tool-help' }, natural ? value.width > 0 && value.height > 0 ? `选区：左上角 (${value.x}, ${value.y})，${value.width} × ${value.height} 像素；原图 ${natural[0]} × ${natural[1]}` : `原图 ${natural[0]} × ${natural[1]}，尚未框选` : '正在载入预览'));
  }

  /** 单项功能的输入、参数与结果；切换功能时整体重建，避免上一项的选件和结果串到下一项。 */
  function FunctionPanel({ item, active, runnerRef }) {
    const [files, setFiles] = React.useState([]), [text, setText] = React.useState(''), [sheet, setSheet] = React.useState('');
    // 图片默认保持原尺寸；三种处理方式各有自己的输出格式，切换方式不互相覆盖。
    const [settings, setSettings] = React.useState({ mode: item.mode || 'convert', convertFormat: 'png', compressFormat: 'jpeg', editFormat: 'keep', quality: 90, maxEdge: '', target: 'quality', targetKB: 500, resizeWidth: '', resizeHeight: '', keepRatio: true, operation: 'dedupe', conversion: 'excel-csv', other: '', angle: 90, flip: 'none', x: 0, y: 0, width: 0, height: 0, direction: 'vertical', watermark: '', fontSize: 24, opacity: 0.5, position: 'bottom-right', pages: '', columns: '', match: 'equals', value: '', sortType: 'text', order: 'asc', find: '', replacement: '', block: 14, rows: 3, gridColumns: 3, size: 512, level: 'M', audioFormat: 'mp3', bitrate: 128, start: 0, end: '', times: '每 5 秒', preset: 'standard', splitOutput: 'files', leftTable: '', rightTable: '', leftKey: '', rightKey: '', joinColumns: [], joinType: 'left', ignoreCase: false, numericKey: false });
    const [state, setState] = React.useState({ busy: false, error: '', notice: '', result: null, sheets: [], tables: [], thumbs: [] });
    // 页面整理的逐页布局：原页码、追加旋转、是否删除；顺序即输出顺序。
    const [layout, setLayout] = React.useState([]), dragging = React.useRef(null);
    // 文件可以直接拖进选文件区；拖动经过时给出提示。
    const [fileOver, setFileOver] = React.useState(false);
    const runner = React.useRef(null), fileInput = React.useRef(null), activeRef = React.useRef(active), ran = React.useRef({ files: [], positions: [] });
    activeRef.current = active;
    React.useEffect(() => {
      const instance = createUtilityRunner(workerSource, { Worker: globalThis.Worker, URL: globalThis.URL, Blob: globalThis.Blob, setTimeout: (...args) => globalThis.setTimeout(...args), clearTimeout: (...args) => globalThis.clearTimeout(...args) }, setState);
      runner.current = instance; if (runnerRef) runnerRef.current = instance;
      return () => instance.dispose();
    }, []);
    React.useEffect(() => { if (!active) runner.current?.cancel(); }, [active]);
    React.useEffect(() => { if (item.id === 'excel-join') runner.current?.clearSheets(); }, [files]);
    React.useEffect(() => { setLayout((state.thumbs || []).map(thumb => ({ page: thumb.page, rotate: 0, removed: false }))); }, [state.thumbs]);
    // 读到表头后默认第一张为主表、第二张为查找表，关键列默认各自首列，避免下拉框显示的值与实际提交不一致。
    React.useEffect(() => {
      const tables = state.tables || [], left = tables[0], right = tables[1] || tables[0];
      setSettings(previous => ({ ...previous, leftTable: left?.id || '', rightTable: tables[1]?.id || '', leftKey: left?.headers[0] || '', rightKey: tables[1] ? right.headers[0] || '' : '', joinColumns: [] }));
    }, [state.tables]);
    const update = (key, value) => setSettings(previous => ({ ...previous, [key]: value }));
    const field = (label, input) => h('label', { className: 'yj-field' }, label, input);
    const select = (key, label, values) => field(label, h('select', { value: settings[key], disabled: state.busy, onChange: event => { update(key, event.target.value); if (key === 'conversion') { setFiles([]); setSheet(''); runner.current.clearSheets(); } } }, values.map(([value, title]) => h('option', { key: value, value }, title))));
    const number = (key, label, min, max, step = 1) => field(label, h('input', { type: 'number', min, max, step, value: settings[key], disabled: state.busy, onChange: event => update(key, event.target.value === '' ? '' : Number(event.target.value)) }));
    const input = (key, label, placeholder) => field(label, h('input', { value: settings[key], placeholder, disabled: state.busy, onChange: event => update(key, event.target.value) }));
    // 目录里的别名入口（如“格式转换 → 图片转格式”）通过 action 复用同一处理实现。
    const action = item.action || item.id;
    const isImage = ['image', 'image-rotate', 'image-crop', 'image-stitch', 'image-watermark'].includes(action);
    const tool = item.id === 'table-convert' ? settings.conversion : action;
    const excel = item.sheet || tool === 'excel-csv';
    const usesText = !item.accept || item.id === 'text';
    const accept = tool === 'csv-excel' ? '.csv' : tool === 'excel-csv' ? '.xlsx' : item.accept;
    const imageFormat = action !== 'image' || settings.mode === 'resize' ? settings.editFormat : settings.mode === 'compress' ? settings.compressFormat : settings.convertFormat;
    const run = (chosen, override = {}) => {
      if (!activeRef.current || state.busy) return;
      const chosenFiles = override.files || files;
      const options = { ...settings, format: imageFormat, quality: settings.quality / 100, sheetName: sheet, columns: item.id === 'image-grid' ? settings.gridColumns : settings.columns, positions: override.positions, layout: item.id === 'pdf-pages' && !chosen ? layout.filter(entry => !entry.removed).map(({ page, rotate }) => ({ page, rotate })) : undefined };
      if (item.audio) return runner.current.prepare(() => decodeAudio(files[0], item.trim ? { start: settings.start, end: settings.end } : {}), pcm => ({ tool: 'audio-encode', files: [], text: '', options: { pcm: { sampleRate: pcm.sampleRate, channels: pcm.channels }, format: settings.audioFormat, bitrate: settings.bitrate, name: files[0].name } }));
      if (item.video) return runner.current.prepare(() => captureFrames(files[0], settings.times));
      ran.current = { files: chosenFiles, positions: override.positions || chosenFiles.map((_, i) => i) };
      runner.current.run({ tool: chosen || tool, files: chosenFiles, text, options }, { append: !!override.append });
    };
    const joinReady = item.id !== 'excel-join' || settings.leftTable && settings.rightTable && settings.leftTable !== settings.rightTable && settings.leftKey && settings.rightKey && settings.joinColumns.length > 0;
    const pagesReady = item.id !== 'pdf-pages' || layout.some(entry => !entry.removed);
    const ready = !state.busy && active && (!item.accept || files.length > 0 || item.id === 'text' && text) && (!excel || sheet) && (!item.region || settings.width > 0 && settings.height > 0) && (!usesText || item.accept || text.trim()) && joinReady && pagesReady;
    const clearFiles = () => { if (fileInput.current) fileInput.current.value = ''; setFiles([]); setSheet(''); runner.current.clearSheets(); runner.current.clearThumbs(); };
    const moveFile = (index, step) => setFiles(previous => { const next = previous.slice(); [next[index], next[index + step]] = [next[index + step], next[index]]; return next; });
    // 只重试失败项：失败序号对应上一轮实际提交的文件，沿用原序号命名，结果接在已有下载后面。
    const retryFailed = () => {
      const failed = state.result.failed.filter(index => ran.current.files[index]);
      const subset = failed.map(index => ran.current.files[index]);
      setFiles(subset); run(undefined, { files: subset, positions: failed.map(index => ran.current.positions[index]), append: true });
    };
    const pack = () => {
      if (!activeRef.current || state.busy || typeof globalThis.File !== 'function') return;
      const used = new Set();
      const entries = state.result.files.map(file => {
        let name = file.name, n = 1;
        while (used.has(name.toLowerCase())) name = file.name.replace(/(\.[^.]*)?$/, extension => ` (${++n})${extension}`);
        used.add(name.toLowerCase()); return new globalThis.File([file.blob], name, { type: file.mime });
      });
      runner.current.run({ tool: 'zip', files: entries, text: '', options: { name: `${item.title.replace(/[\\/:*?"<>|\s]+/g, '')}-全部结果.zip` } }, { append: true });
    };
    const lossy = format => format !== 'png' && format !== 'ico';
    const formatSelect = (key, label, values) => h(React.Fragment, null, select(key, label, values), lossy(settings[key]) && number('quality', '质量 %', 10, 100));
    const editFormats = [['keep', '保持原格式'], ['png', 'PNG'], ['jpeg', 'JPEG'], ['webp', 'WebP']];
    const imageSettings = () => {
      if (action === 'image' && settings.mode === 'convert') return h('div', { className: 'yj-row' }, formatSelect('convertFormat', '转换为', [['png', 'PNG（无损，保留透明）'], ['jpeg', 'JPEG'], ['webp', 'WebP'], ['ico', 'ICO 图标（16–256 像素）']]));
      if (action === 'image' && settings.mode === 'compress') return h('div', null, h('div', { className: 'yj-row' }, select('compressFormat', '输出格式', [['jpeg', 'JPEG（兼容最好）'], ['webp', 'WebP（体积更小）']]), select('target', '压缩方式', [['quality', '按质量'], ['size', '按目标大小']]), settings.target === 'size' ? number('targetKB', '目标大小（KB）', 10, 25600) : number('quality', '质量 %', 10, 100)),
        h('small', { className: 'yj-tool-help' }, 'PNG 是无损格式，压缩时转成 JPEG 或 WebP；按目标大小时先降低质量，仍压不到再逐步缩小尺寸'));
      if (action === 'image' && settings.mode === 'resize') return h('div', { className: 'yj-row' }, number('resizeWidth', '宽度（像素，可留空）', 1, 10000), number('resizeHeight', '高度（像素，可留空）', 1, 10000),
        h('label', { className: 'yj-field' }, '比例', h('span', null, h('input', { type: 'checkbox', checked: settings.keepRatio, disabled: state.busy, onChange: event => update('keepRatio', event.target.checked) }), ' 保持原比例')), formatSelect('editFormat', '输出格式', editFormats));
      return h('div', { className: 'yj-row' }, formatSelect('editFormat', '输出格式', editFormats), action === 'image-stitch' && number('maxEdge', '单张最大边长（像素，留空不缩放）', 1, 10000));
    };
    const tableById = id => (state.tables || []).find(table => table.id === id);
    const headerSelect = (key, label, table) => field(label, h('select', { value: settings[key], disabled: state.busy || !table, onChange: event => setSettings(previous => ({ ...previous, [key]: event.target.value, joinColumns: key === 'rightKey' ? previous.joinColumns.filter(column => column !== event.target.value) : previous.joinColumns })) }, (table?.headers || []).filter(Boolean).map(name => h('option', { key: name, value: name }, name))));
    const tableSelect = (key, keyColumn, label) => field(label, h('select', { value: settings[key], disabled: state.busy, onChange: event => { const table = tableById(event.target.value); setSettings(previous => ({ ...previous, [key]: event.target.value, [keyColumn]: table?.headers[0] || '', joinColumns: key === 'rightTable' ? [] : previous.joinColumns })); } }, h('option', { value: '' }, '请选择'), state.tables.map(table => h('option', { key: table.id, value: table.id }, table.label))));
    /** 关联设置：先读表头，再选主表、查找表、两边的关键列和要补过来的列。 */
    const joinSettings = () => {
      const left = tableById(settings.leftTable), right = tableById(settings.rightTable);
      const candidates = (right?.headers || []).filter(name => name && name !== settings.rightKey);
      return h('div', { className: 'yj-tool-join' },
        h('div', { className: 'yj-row' }, h('button', { type: 'button', disabled: state.busy || !files.length, onClick: () => run('excel-headers') }, state.tables.length ? '重新读取表头' : '读取表头'), h('small', { className: 'yj-tool-help' }, '可选一个含两张表的文件，或两个文件')),
        state.tables.length > 0 && h('div', { className: 'yj-row' }, tableSelect('leftTable', 'leftKey', '主表（保留它的行）'), headerSelect('leftKey', '主表关键列', left)),
        state.tables.length > 0 && h('div', { className: 'yj-row' }, tableSelect('rightTable', 'rightKey', '查找表（从这里取列）'), headerSelect('rightKey', '查找表关键列', right)),
        settings.leftTable && settings.leftTable === settings.rightTable && h('p', { role: 'alert' }, '主表和查找表不能是同一张表'),
        candidates.length > 0 && h('fieldset', { className: 'yj-tool-columns' }, h('legend', null, '要补过来的列'), candidates.map(name => h('label', { key: name }, h('input', { type: 'checkbox', checked: settings.joinColumns.includes(name), disabled: state.busy, onChange: event => update('joinColumns', event.target.checked ? [...settings.joinColumns, name] : settings.joinColumns.filter(column => column !== name)) }), ' ', name))),
        state.tables.length > 0 && h('div', { className: 'yj-row' }, select('joinType', '关联方式', [['left', '保留主表全部行（没匹配到的留空）'], ['inner', '只保留两边都有的行']]),
          h('label', { className: 'yj-field' }, '关键值比较', h('span', null, h('input', { type: 'checkbox', checked: settings.ignoreCase, disabled: state.busy, onChange: event => update('ignoreCase', event.target.checked) }), ' 忽略大小写　', h('input', { type: 'checkbox', checked: settings.numericKey, disabled: state.busy, onChange: event => update('numericKey', event.target.checked) }), ' 数字按数值比较（001 = 1）'))));
    };
    const movePage = (from, to) => setLayout(previous => { if (from === to || from == null || to < 0 || to >= previous.length) return previous; const next = previous.slice(), [entry] = next.splice(from, 1); next.splice(to, 0, entry); return next; });
    const changePage = (index, patch) => setLayout(previous => previous.map((entry, i) => i === index ? { ...entry, ...patch(entry) } : entry));
    /** 页面缩略图：拖动或用按钮调整顺序，逐页旋转、删除（可恢复）。 */
    const pageGrid = () => {
      const thumbs = new Map(state.thumbs.map(thumb => [thumb.page, thumb])), kept = layout.filter(entry => !entry.removed).length;
      return h('div', { className: 'yj-pdf-pages' },
        h('div', { className: 'yj-row' }, h('small', { className: 'yj-tool-help' }, `拖动缩略图调整顺序，或用按钮移动、旋转、删除；将保留 ${kept} / ${layout.length} 页`), h('button', { type: 'button', disabled: state.busy, onClick: () => setLayout(state.thumbs.map(thumb => ({ page: thumb.page, rotate: 0, removed: false }))) }, '恢复原样')),
        h('ol', { className: 'yj-pdf-grid' }, layout.map((entry, index) => {
          const thumb = thumbs.get(entry.page), label = `原第 ${entry.page + 1} 页`;
          return h('li', { key: entry.page, className: entry.removed ? 'yj-pdf-removed' : '', draggable: !state.busy, onDragStart: event => { dragging.current = index; if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; }, onDragOver: event => event.preventDefault(), onDrop: event => { event.preventDefault(); movePage(dragging.current, index); dragging.current = null; } },
            h('div', { className: 'yj-pdf-thumb' }, thumb && h('img', { src: thumb.url, alt: label, draggable: false, style: { transform: `rotate(${entry.rotate}deg)` } })),
            h('span', null, `${index + 1}. ${label}${entry.rotate ? ` · 转 ${entry.rotate}°` : ''}`),
            h('div', { className: 'yj-pdf-actions' },
              h('button', { type: 'button', disabled: state.busy || index === 0, onClick: () => movePage(index, index - 1), 'aria-label': `${label}前移` }, '←'),
              h('button', { type: 'button', disabled: state.busy || index === layout.length - 1, onClick: () => movePage(index, index + 1), 'aria-label': `${label}后移` }, '→'),
              h('button', { type: 'button', disabled: state.busy || entry.removed, onClick: () => changePage(index, current => ({ rotate: (current.rotate + 90) % 360 })), 'aria-label': `${label}顺时针旋转` }, '旋转'),
              h('button', { type: 'button', disabled: state.busy, onClick: () => changePage(index, current => ({ removed: !current.removed })), 'aria-label': `${entry.removed ? '恢复' : '删除'}${label}` }, entry.removed ? '恢复' : '删除')));
        })));
    };
    const choose = chosen => { runner.current.clearSheets(); runner.current.clearThumbs(); setSheet(''); setFiles(chosen); update('width', 0); update('height', 0); if (item.id === 'pdf-pages' && chosen.length) run('pdf-thumbs', { files: chosen }); };
    const drop = event => { event.preventDefault(); setFileOver(false); if (state.busy) return; const dropped = Array.from(event.dataTransfer?.files || []); if (dropped.length) choose(item.multiple ? dropped : dropped.slice(0, 1)); };
    return h('div', { className: 'yj-tool-body', 'aria-busy': state.busy },
      h('div', null, h('h3', null, item.title), h('small', { className: 'yj-tool-help' }, item.description || item.brief)),
      item.id === 'table-convert' && select('conversion', '转换方向', [['excel-csv', 'Excel → CSV'], ['csv-excel', 'CSV → Excel']]),
      item.accept && h('label', { className: `yj-tool-drop${fileOver ? ' yj-file-over' : ''}`, onDragOver: event => { if (!state.busy) { event.preventDefault(); setFileOver(true); } }, onDragLeave: () => setFileOver(false), onDrop: drop },
        h('strong', null, item.multiple ? '把文件拖到这里，可以一次放多个' : '把文件拖到这里'), h('span', { className: 'yj-tool-pick', 'aria-hidden': true }, item.multiple ? '选择文件' : '选择文件'),
        h('input', { ref: fileInput, key: tool, type: 'file', accept, multiple: !!item.multiple, disabled: state.busy, onChange: event => choose(Array.from(event.target.files || [])) }), h('small', null, `支持 ${accept.split(',').join(' ')}`)),
      files.length > 0 && (item.multiple ? h('div', { className: 'yj-tool-files' },
        // 多选时可调整顺序、单独移除或继续添加；顺序即处理和合并的顺序。
        h('ol', null, files.map((file, index) => h('li', { key: `${index}-${file.name}` }, h('span', null, file.name),
          h('button', { type: 'button', disabled: state.busy || index === 0, onClick: () => moveFile(index, -1), 'aria-label': `上移 ${file.name}` }, '上移'),
          h('button', { type: 'button', disabled: state.busy || index === files.length - 1, onClick: () => moveFile(index, 1), 'aria-label': `下移 ${file.name}` }, '下移'),
          h('button', { type: 'button', disabled: state.busy, onClick: () => setFiles(previous => previous.filter((_, i) => i !== index)), 'aria-label': `移除 ${file.name}` }, '移除')))),
        h('div', { className: 'yj-row' }, h('label', { className: 'yj-field' }, '继续添加', h('input', { type: 'file', accept, multiple: true, disabled: state.busy, onChange: event => { const more = Array.from(event.target.files || []); event.target.value = ''; setFiles(previous => [...previous, ...more]); } })), h('button', { type: 'button', disabled: state.busy, onClick: clearFiles }, '清除选件')))
        : h('div', { className: 'yj-row' }, h('span', null, files.map(file => file.name).join('；')), h('button', { type: 'button', disabled: state.busy, onClick: clearFiles }, '清除选件'))),
      item.region && h(RegionPicker, { file: files[0], value: settings, disabled: state.busy, onChange: area => setSettings(previous => ({ ...previous, ...area })) }),
      excel && h('div', { className: 'yj-row' }, h('button', { type: 'button', disabled: state.busy || !files.length, onClick: () => run('excel-sheets') }, '读取工作表'), field('工作表', h('select', { value: sheet, disabled: state.busy || !state.sheets.length, onChange: event => setSheet(event.target.value) }, h('option', { value: '' }, '请选择工作表'), state.sheets.map(name => h('option', { key: name, value: name }, name))))),
      usesText && field(item.id === 'qr-batch' ? '每行一条内容' : item.id === 'qr-make' ? '网址或文字' : '输入', h('textarea', { value: text, rows: item.id === 'qr-make' ? 3 : 7, maxLength: 2 * 1024 ** 2, disabled: state.busy || !!files.length, onChange: event => setText(event.target.value) })),
      item.id === 'text' && select('operation', '操作', [['dedupe', '逐行去重'], ['remove-empty', '清理空行'], ['statistics', '文本统计'], ['csv-json', 'CSV → JSON'], ['json-csv', 'JSON → CSV']]),
      isImage && h('small', { className: 'yj-tool-help' }, copy.imageHelp),
      // 字段直接放在纵向面板里会被拉高，放进一行容器。
      action === 'image' && !item.mode && h('div', { className: 'yj-row' }, select('mode', '处理方式', [['convert', '转换格式（保持原尺寸）'], ['compress', '压缩体积'], ['resize', '调整尺寸']])),
      isImage && imageSettings(),
      item.id === 'excel-join' && joinSettings(),
      item.id === 'pdf-pages' && files.length > 0 && !state.thumbs.length && h('div', { className: 'yj-row' }, h('button', { type: 'button', disabled: state.busy, onClick: () => run('pdf-thumbs') }, '载入页面缩略图')),
      item.id === 'pdf-pages' && state.thumbs.length > 0 && pageGrid(),
      item.id === 'pdf-compress' && h('div', { className: 'yj-row' }, select('preset', '压缩档位', [['light', '轻度（约 200 DPI，画质优先）'], ['standard', '标准（约 150 DPI，推荐）'], ['strong', '强力（约 100 DPI，体积优先）']])),
      item.id === 'excel-split-by' && h('div', { className: 'yj-row' }, input('columns', '按哪一列拆分', '与表头一致，如“部门”'), select('splitOutput', '输出为', [['files', '多个文件（打包成 ZIP）'], ['sheets', '一个文件，每组一张工作表']])),
      item.id === 'image-rotate' && h('div', { className: 'yj-row' }, field('旋转角度', h('select', { value: settings.angle, disabled: state.busy, onChange: event => update('angle', Number(event.target.value)) }, [0, 90, 180, 270].map(value => h('option', { key: value, value }, value + '°')))), select('flip', '翻转', [['none', '不翻转'], ['horizontal', '水平'], ['vertical', '垂直']])),
      item.id === 'image-stitch' && select('direction', '拼接方向', [['vertical', '上下拼（长图）'], ['horizontal', '左右拼']]),
      item.id === 'image-watermark' && h('div', null, input('watermark', '水印文字', '如：仅供内部评审使用'), h('div', { className: 'yj-row' }, number('fontSize', '字号', 10, 200), number('opacity', '透明度', 0.1, 1, 0.1), select('position', '位置', [['top-left', '左上'], ['center', '居中'], ['bottom-right', '右下']]))),
      item.id === 'image-mosaic' && number('block', '马赛克方块大小（像素）', 2, 200),
      item.id === 'image-grid' && h('div', { className: 'yj-row' }, number('rows', '行数', 1, 10), number('gridColumns', '列数', 1, 10)),
      ['pdf-split', 'pdf-rotate', 'pdf-number', 'pdf-watermark', 'pdf-images'].includes(item.id) && input('pages', '页码', '留空为全部；如 1,3-5,2（页面整理按此顺序输出）'),
      item.id === 'pdf-rotate' && select('angle', '顺时针旋转', [['90', '90°'], ['180', '180°'], ['270', '270°']]),
      item.id === 'pdf-watermark' && input('watermark', '水印文字', '1–60 字'),
      ['excel-dedupe', 'excel-filter', 'excel-sort'].includes(item.id) && input('columns', item.id === 'excel-dedupe' ? '关键列名称' : '列名称', item.id === 'excel-dedupe' ? '多列用英文逗号分隔' : '与表头一致'),
      item.id === 'excel-filter' && h('div', { className: 'yj-row' }, select('match', '筛选条件', [['equals', '等于'], ['contains', '包含'], ['not-empty', '非空']]), settings.match !== 'not-empty' && input('value', '筛选值')),
      item.id === 'excel-sort' && h('div', { className: 'yj-row' }, select('sortType', '比较方式', [['text', '文本'], ['number', '数值']]), select('order', '顺序', [['asc', '升序'], ['desc', '降序']])),
      item.id === 'text-replace' && h('div', { className: 'yj-row' }, input('find', '查找文字'), input('replacement', '替换为', '可留空')),
      ['qr-make', 'qr-batch'].includes(item.id) && h('div', { className: 'yj-row' }, number('size', '图片尺寸（像素）', 128, 2048), select('level', '容错等级', [['L', '低（7%）'], ['M', '中（15%）'], ['Q', '较高（25%）'], ['H', '高（30%，可加 Logo）']])),
      item.audio && h('div', { className: 'yj-row' }, select('audioFormat', '输出格式', [['mp3', 'MP3'], ['wav', 'WAV（无损）']]), settings.audioFormat === 'mp3' && field('音质', h('select', { value: settings.bitrate, disabled: state.busy, onChange: event => update('bitrate', Number(event.target.value)) }, [[64, '64 kbps（语音）'], [128, '128 kbps（标准）'], [192, '192 kbps（较好）'], [320, '320 kbps（最佳）']].map(([value, title]) => h('option', { key: value, value }, title))))),
      item.trim && h('div', { className: 'yj-row' }, number('start', '开始（秒）', 0, 1800, 0.1), number('end', '结束（秒，留空到结尾）', 0, 1800, 0.1)),
      item.video && input('times', '截图时间点', '如“1, 5.5, 10”或“每 5 秒”'),
      h('div', { className: 'yj-row' }, h('button', { type: 'button', className: 'yj-primary', disabled: !ready, onClick: () => run() }, '开始处理'), state.busy && h('button', { type: 'button', onClick: () => runner.current.cancel() }, '取消')),
      h('div', { 'aria-live': 'polite' }, state.busy && h('span', { role: 'status' }, state.progress ? `正在处理第 ${state.progress.done + 1} / ${state.progress.total} 个，可随时取消` : copy.running), state.error && h('p', { role: 'alert' }, state.error), state.notice && h('p', { role: 'status' }, state.notice)),
      state.result && h('section', { className: 'yj-tool-result' }, h('strong', null, state.result.summary), h('div', { className: 'yj-row' }, state.result.files.map(file => h('a', { key: file.url, href: file.url, download: file.name }, '下载 ' + file.name))),
        (state.result.files.length > 1 && !state.result.files.some(file => file.mime === 'application/zip') || state.result.failed?.length > 0) && h('div', { className: 'yj-row' },
          state.result.files.length > 1 && !state.result.files.some(file => file.mime === 'application/zip') && h('button', { type: 'button', disabled: state.busy, onClick: pack }, '全部打包下载（ZIP）'),
          state.result.failed?.length > 0 && h('button', { type: 'button', disabled: state.busy, onClick: retryFailed }, `只重试失败的 ${state.result.failed.length} 个`)),
        // 图片结果直接预览，最多展示前 6 张。
        state.result.files.some(file => file.mime?.startsWith('image/')) && h('div', { className: 'yj-tool-preview' }, state.result.files.filter(file => file.mime?.startsWith('image/')).slice(0, 6).map(file => h('img', { key: file.url, src: file.url, alt: file.name }))), state.result.listing.length > 0 && h('details', null, h('summary', null, '处理明细'), h('ul', null, state.result.listing.map((line, i) => h('li', { key: i }, line))))));
  }

  function ToolWindow({ tool, initial, request, active, minimized, onMinimize, onClose }) {
    const [current, setCurrent] = React.useState(initial || tool.functions[0].id), [dialogError, setDialogError] = React.useState('');
    const modal = React.useRef(null), panelRunner = React.useRef(null);
    // 同一工具内从目录点另一项功能：保持窗口，只切换功能。
    React.useEffect(() => { if (initial) setCurrent(initial); }, [request]);
    const item = tool.functions.find(entry => entry.id === current) || tool.functions[0];
    React.useEffect(() => {
      const element = modal.current;
      if (!element) return undefined;
      if (active && !minimized) {
        try { if (!element.open) element.showModal(); } catch { setDialogError('工具窗口打开失败，请关闭后重试'); }
      } else if (element.open) element.close();
      return () => { if (element.open) element.close(); };
    }, [active, minimized]);
    // 关闭即终止任务并释放下载，不等组件卸载。
    const closeWindow = () => { modal.current?.close(); panelRunner.current?.dispose(); onClose(); };
    // 对话框固定为第一个子节点，最小化时出现的恢复条不改变其位置，面板与任务保持不变。
    return h(React.Fragment, null,
      h('dialog', { ref: modal, className: 'yj-tool-modal', 'aria-label': tool.title, onCancel: event => { event.preventDefault(); closeWindow(); }, onClick: event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeWindow(); } } },
        h('header', null, h(ToolIcon, { tool, size: 18 }), h('h2', null, tool.title), h('button', { type: 'button', onClick: () => onMinimize(true), 'aria-label': '最小化工具' }, '最小化'), h('button', { type: 'button', onClick: closeWindow, 'aria-label': '关闭工具' }, '关闭')),
        h('div', { className: 'yj-tool-layout' },
          h('nav', { className: 'yj-tool-nav', 'aria-label': `${tool.title}功能` }, tool.functions.map(entry => h('button', { type: 'button', key: entry.id, 'aria-current': entry.id === item.id, onClick: () => setCurrent(entry.id) }, entry.title, h('small', null, entry.brief)))),
          h(FunctionPanel, { key: item.id, item, active, runnerRef: panelRunner }))),
      active && minimized && h('div', { className: 'yj-tool-restore' }, h('span', null, `${tool.title} · ${item.title}`), h('div', { className: 'yj-row' }, h('button', { type: 'button', onClick: () => onMinimize(false) }, '恢复'), h('button', { type: 'button', onClick: closeWindow }, '关闭工具'))),
      dialogError && h('p', { role: 'alert' }, dialogError));
  }

  function ToolboxView({ active = true }) {
    const [query, setQuery] = React.useState(''), [opened, setOpened] = React.useState(null), [minimized, setMinimized] = React.useState(false);
    const opener = React.useRef(null), directory = React.useRef(null), pendingFocus = React.useRef(null);
    React.useEffect(() => {
      if (pendingFocus.current && !opened) { directory.current?.querySelector(`[data-tool-id="${pendingFocus.current}"]`)?.focus(); pendingFocus.current = null; }
    }, [opened, query]);
    const close = () => {
      const previous = opener.current, toolId = opened?.tool.id; opener.current = null;
      setOpened(null); setMinimized(false);
      if (previous?.isConnected !== false && (!previous?.getClientRects || previous.getClientRects().length)) previous?.focus();
      else { pendingFocus.current = toolId; setQuery(''); }
    };
    const open = (tool, functionId, event) => {
      if (opened && opened.tool.id !== tool.id && !globalThis.confirm('关闭当前工具并清除其输入和下载结果，打开新工具？')) return;
      if (!opened || opened.tool.id !== tool.id) opener.current = event?.currentTarget ?? null;
      setOpened(previous => ({ tool, functionId, request: (previous?.request ?? 0) + 1 })); setMinimized(false);
    };
    const keyword = query.trim();
    const hits = keyword ? searchUtilities(keyword) : [], gaps = keyword ? utilityGapsFor(keyword) : [];
    return h('section', { hidden: !active, 'aria-label': copy.title },
      h('style', null, css),
      h('header', { className: 'yj-pagehead' }, h('div', null, h('h2', null, copy.title), h('p', null, `${tools.reduce((sum, tool) => sum + tool.functions.length, 0)} 项本机处理 · 文件不离开这台电脑`)),
        h('div', { className: 'yj-pagehead-actions' }, h('label', { className: 'yj-field yj-tool-search' }, h('input', { type: 'search', value: query, placeholder: '搜索功能或格式，如“PDF 合并”“AVIF”“转 MP3”', 'aria-label': copy.search, onChange: event => setQuery(event.target.value) })))),
      opened && h(ToolWindow, { key: opened.tool.id, tool: opened.tool, initial: opened.functionId, request: opened.request, active, minimized, onMinimize: setMinimized, onClose: close }),
      keyword ? h('div', null, hits.length ? h('div', { className: 'yj-tool-results' }, hits.map(({ tool, item }) => h('button', { type: 'button', key: item.id, className: 'yj-tool-hit', 'data-tool-id': tool.id, onClick: event => open(tool, item.id, event), 'aria-haspopup': 'dialog' }, h(ToolIcon, { tool, size: 16 }), h('span', null, item.title), h('small', null, `${tool.title} · ${item.brief}`))))
        : h('p', { role: 'status' }, copy.empty),
        // 搜到尚未内置的能力时如实说明，不让搜索结果显得像已有支持。
        gaps.length > 0 && h('ul', { className: 'yj-tool-gaps', 'aria-label': '尚未内置' }, gaps.map(text => h('li', { key: text }, text))))
        : h('div', { ref: directory, className: 'yj-grid yj-tool-directory' }, tools.map(tool => h('div', { key: tool.id, className: 'yj-tool-card' },
          h('button', { type: 'button', className: 'yj-tool-card-head', 'data-tool-id': tool.id, onClick: event => open(tool, null, event), 'aria-haspopup': 'dialog', 'aria-label': tool.title, style: { all: 'unset', display: 'flex', gap: '12px', alignItems: 'center', cursor: 'pointer' } }, h(ToolIcon, { tool }), h('span', null, h('strong', null, tool.title), h('small', null, `${tool.brief} · ${tool.functions.length} 项功能`))),
          h('div', { className: 'yj-tool-chips' }, tool.functions.map(item => h('button', { type: 'button', key: item.id, className: 'yj-tool-chip', onClick: event => open(tool, item.id, event), 'aria-label': `${tool.title}：${item.title}` }, item.title)))))));
  }
  return { ToolboxView };
}
