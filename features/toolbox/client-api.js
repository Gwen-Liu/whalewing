import { toolboxNamespace } from './contract.js';

const unsafeName = /[\\/:*?"<>|\u0000-\u001f]/g;
// 从路径读进来的文件补上常见类型，图片预览和功能项判断格式和拖进来的一样；认不出的留空，按扩展名处理。
const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json', mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(text) {
  const raw = atob(text), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * 办公工坊页面和主机之间：交给小鲸、订阅小鲸推过来的请求、交回处理结果；
 * 和小鲸的对话里转过来的活：外壳一直订阅着，来了就切到办公工坊页，页面拿到后按原话交给小鲸；
 * 保存、复制图片、Office 转 PDF 都用 DSH 自带的能力（2026-11-12 用户定：给 DSH 装翅膀，不再造一条鲸）。
 */
export function createToolboxClient(bridge, experts) {
  const { featureRemote, unwrap } = bridge;
  const inbox = [], seen = new Set(), listeners = new Set();
  const emit = () => { for (const listener of [...listeners]) listener(); };
  return {
    start: async (input, signal) => unwrap(await featureRemote(toolboxNamespace).start(input, signal)),
    watch: signal => featureRemote(toolboxNamespace).watch(signal),
    reply: async input => unwrap(await featureRemote(toolboxNamespace).reply(input)),
    claim: async id => unwrap(await featureRemote(toolboxNamespace).claim({ id })),
    // 回到转过来的那段对话：在专家团队页中间那栏打开（和打开派出去的任务一样）；标题从会话列表实时读。
    openSession: sessionId => { if (experts?.requestTask) { experts.requestTask(sessionId); bridge.showWorkbench?.('experts'); } else bridge.open(sessionId); },
    sessionTitle: sessionId => { try { return String(bridge.sessionSnapshot?.()?.byId?.[sessionId]?.title || '').trim(); } catch { return ''; } },
    /** 桌面版弹系统的另存为窗口（默认上次保存的文件夹，取消就不存），网页版交给浏览器下载。 */
    async saveFile(file, name) {
      const actions = bridge.fileActions?.();
      if (!actions?.save) return { status: 'unavailable' };
      return actions.save({ url: '', name, mediaType: file.type || undefined, read: async () => file }, actions.canSaveAs ? 'saveAs' : 'download');
    },
    async copyImage(file) {
      const actions = bridge.fileActions?.();
      if (!actions?.copyImage) throw new Error('这个 DSH 不能复制图片');
      await actions.copyImage({ url: '', mediaType: file.type || undefined, read: async () => file });
    },
    revealPath: path => bridge.revealPath(path),
    /** Office 转 PDF：文件交给主机，用 DSH 自带的转换（随包 LibreOffice）；结果和 Worker 交回的一样。 */
    async officePdf(file) {
      const extension = (/\.([^.]+)$/.exec(file.name)?.[1] || '').toLowerCase();
      const data = toBase64(new Uint8Array(await file.arrayBuffer()));
      const value = unwrap(await featureRemote(toolboxNamespace).officePdf({ name: file.name, extension, data }));
      const base = file.name.replace(/\.[^.]+$/, '').replace(unsafeName, '_').slice(0, 100) || '文档';
      const missing = value.missingFonts.length ? [`这台电脑缺这些字体，用相近的字体代替了：${value.missingFonts.join('、')}`] : [];
      return { summary: ['已用 DSH 自带的转换生成 PDF', ...missing].join('；'), files: [{ name: `${base}.pdf`, mime: 'application/pdf', bytes: fromBase64(value.data) }], listing: [] };
    },
    /** 员工贴的路径：主机列出这一层的文件（子文件夹不进去），页面让员工挑。 */
    listPath: async (path, signal) => unwrap(await featureRemote(toolboxNamespace).listPath({ path }, signal)),
    /** 读列出来的一个文件，变成和拖进来一样的文件对象；as 是要显示的文件名（DSH 附件存的文件名是编号，用原文件名）。 */
    async readPathFile(folder, name, { as, signal } = {}) {
      const value = unwrap(await featureRemote(toolboxNamespace).readPathFile({ path: folder, name }, signal));
      const shown = as || value.name;
      return new File([fromBase64(value.data)], shown, { type: mimeTypes[(/\.([^.]+)$/.exec(shown)?.[1] || '').toLowerCase()] || '' });
    },
    takeInbox: () => inbox.splice(0),
    subscribeInbox: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    /** 功能就绪后一直订阅转过来的活；功能关闭或页面卸载时随作用域停下。 */
    follow(scope) {
      const controller = new AbortController();
      let stopped = false;
      (async () => {
        while (!stopped) {
          try {
            for await (const frame of featureRemote(toolboxNamespace).handoffs(controller.signal)) {
              if (stopped) return;
              const fresh = (frame.items ?? []).filter(item => !seen.has(item.id));
              if (!fresh.length) continue;
              for (const item of fresh) { seen.add(item.id); inbox.push(item); }
              bridge.showWorkbench?.('toolbox');
              emit();
            }
          } catch { /* 连接断了，稍后重连。 */ }
          if (!stopped) await new Promise(resolve => setTimeout(resolve, 1500));
        }
      })();
      scope.effect(() => () => { stopped = true; controller.abort(); });
    },
  };
}
