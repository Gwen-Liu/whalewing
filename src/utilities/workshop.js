/**
 * 办公工坊页（2026-11-12 改版）：文件先进来，员工说要什么结果，交给小鲸；小鲸挑功能项，这个页面替它在本机处理。
 * 步骤一开始就列出来，做过的、正在做的能点开看详情，没开始的只列名字；做过的步骤能自己调整、交给功能项重做，不经过小鲸。
 * 原来的分类卡片和功能窗口整套收进“全部功能项”，知道要用哪个的员工自己点。
 */
import { utilityCatalog } from './catalog.js';
import { modelFunctions } from './model-specs.js';
import { createExecutor, tidyName } from './workshop-exec.js';
import { recipeOf, readRecent, saveRecent, forgetRecent, planReplay, replayHint, stepCall, whenText } from './recipes.js';

const examples = ['把这些发票合成一个 PDF，加上页码，要能发邮件', '证件照改成一寸，JPG，50 KB 以内', '对一下这两份名单，看谁还没交', '把截图里的手机号打上码', '把这个链接做成二维码，要印在海报上：'];
const imageTypes = new Set(['png', 'jpg', 'webp', 'gif', 'bmp', 'avif', 'ico']);
const extension = name => (/\.([^.]+)$/.exec(String(name || ''))?.[1] || '').toLowerCase();
export const fileType = name => ({ jpeg: 'jpg', jfif: 'jpg', xls: 'xlsx', doc: 'docx', htm: 'html' })[extension(name)] || extension(name) || 'file';
export function sizeText(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? Number(mb.toFixed(1)) : Math.round(mb)} MB`;
}
const titleOf = id => utilityCatalog.find(item => item.id === id)?.title ?? id;
// 认路径：资源管理器“复制文件地址”复制来的带英文引号，可以有空格，先认这种；再认中文引号里的；最后认不带引号、不带空格的。
const pathPattern = /"([A-Za-z]:\\[^"\n]+)"|“([A-Za-z]:\\[^”\n]+)”|([A-Za-z]:\\[^\s，。,；;"'“”]+)/;
export const findPath = text => {
  const match = pathPattern.exec(String(text || ''));
  if (!match) return undefined;
  const value = (match[1] ?? match[2] ?? match[3]).trim();
  return value.length > 3 ? value.replace(/\\+$/, '') : value;
};
const statusText = {
  answered: '问过你了', framed: '框好了，交给小鲸接着做', sending: '正在交给小鲸…', thinking: '小鲸在看你的要求和文件…', asking: '小鲸有个问题要问你', need: '等你框一下要处理的位置',
  done: '做完了 · 原文件没动', error: '出错了', interrupted: '被停下了', incomplete: '没做完（小鲸的输出写满了）', unknown: '结果不明',
};

export function createWorkshopView(React, { workerSource, ToolboxView, RegionPicker, validateResult, services = {}, platform = globalThis }) {
  const h = React.createElement;
  const exec = createExecutor({ workerSource, platform, services });
  let keys = 0;
  const css = [
    '.ww-ws{display:flex;flex-direction:column;gap:16px;container:ww-ws/inline-size;min-width:0}',
    // 页头的样子全用外壳的 .ww-pagehead；这里只扣掉和 .ww-ws 行距（16px）重复的部分，让标题位置、页头到正文的距离和其他页签一样。
    // 页头前面还有一个“全部功能项”的层（里面全是固定定位，自己 0 高），它和页头之间也隔着一个 16px 行距，所以上边距只留 6px。
    '.ww-ws>.ww-pagehead{margin-top:6px;margin-bottom:4px}',
    // 功能项窗口收起后的胶囊（2026-11-14 方案 A）：外形是共用的 ww-chip，里面分“恢复”和 × 两块；做好了换成绿边、闪一下。
    '.ww-page .ww-chip.ww-ws-dock{padding:0;gap:0;overflow:hidden;max-width:min(22rem,100%);border-color:color-mix(in srgb,var(--ww-brand) 45%,var(--ww-line-2));color:var(--ww-ink)}.ww-page .ww-chip.ww-ws-dock:hover{background:transparent}.ww-ws-dock button{display:inline-flex;align-items:center;gap:6px;height:100%;min-height:0;margin:0;padding:0;border:0;border-radius:0;background:none;font:inherit;color:inherit;cursor:pointer}.ww-ws-dock button:hover{background:var(--ww-tint)}.ww-ws-dock .ww-ws-dock-open{padding:0 8px 0 12px;min-width:0}.ww-ws-dock-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ww-ws-dock small{color:var(--ww-ink-2);white-space:nowrap;font-variant-numeric:tabular-nums}.ww-ws-dock .ww-ws-dock-x{width:30px;justify-content:center;color:var(--ww-ink-2);border-left:1px solid var(--ww-line)}',
    '.ww-ws-spin{flex:none;width:12px;height:12px;box-sizing:border-box;border:2px solid var(--ww-line-2);border-top-color:var(--ww-brand);border-radius:50%;animation:ww-ws-spin .9s linear infinite}@keyframes ww-ws-spin{to{transform:rotate(360deg)}}.ww-page .ww-chip.ww-ws-dock[data-state=done]{border-color:color-mix(in srgb,var(--ww-ok) 55%,var(--ww-line-2));animation:ww-ws-ping 1.4s ease 1}.ww-ws-dock[data-state=done] svg,.ww-ws-dock[data-state=saved] svg{color:var(--ww-ok)}.ww-page .ww-chip.ww-ws-dock[data-state=failed]{border-color:color-mix(in srgb,var(--ww-err) 55%,var(--ww-line-2))}@keyframes ww-ws-ping{30%{box-shadow:0 0 0 5px color-mix(in srgb,var(--ww-ok) 28%,transparent)}}@media (prefers-reduced-motion:reduce){.ww-ws-spin,.ww-page .ww-chip.ww-ws-dock{animation:none}}',
    '.ww-ws-hero{display:flex;flex-direction:column;gap:14px;max-width:min(100%,46rem);margin:clamp(8px,6cqi,48px) auto 0;width:100%}.ww-ws-hero h3{margin:0;font:600 clamp(20px,3.2cqi,26px)/1.3 var(--ww-serif)}.ww-ws-hero>p{margin:0;color:var(--ww-ink-2)}',
    '.ww-ws-composer{border:1px solid var(--ww-line-2);border-radius:16px;background:var(--ww-surface);padding:10px 12px;display:flex;flex-direction:column;gap:8px;transition:border-color .15s}.ww-ws-composer.drag{border-color:var(--ww-accent);border-style:dashed}',
    '.ww-ws-composer textarea{width:100%;border:0!important;background:transparent!important;resize:vertical;min-height:2.6em;font:inherit;color:var(--ww-ink);outline:none;box-shadow:none!important;padding:4px 2px!important}',
    '.ww-ws-tray{display:flex;flex-wrap:wrap;gap:6px}.ww-ws-file{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:3px 6px 3px 8px;border:1px solid var(--ww-line);border-radius:9px;font-size:12.5px;background:var(--ww-surface-2,transparent)}.ww-ws-file b{font-weight:600;font-size:10px;color:var(--ww-ink-2)}.ww-ws-file span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ww-ws-file small{color:var(--ww-ink-3,var(--ww-ink-2))}.ww-ws-file button{border:0!important;background:none!important;padding:0 4px!important;min-height:0!important;cursor:pointer;color:var(--ww-ink-2)}',
    '.ww-ws-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ww-ws-bar .grow{flex:1}.ww-ws-hint{font-size:12px;color:var(--ww-ink-2)}.ww-ws-path{font-size:12px;color:var(--ww-warn)}.ww-ws-pathbox{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border:1px solid var(--ww-line-2);border-radius:10px;font-size:12.5px}.ww-ws-pathname{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ww-ink-2)}.ww-ws-pathlist{display:flex;flex-direction:column;max-height:min(16rem,40vh);overflow:auto}.ww-ws-pathlist .ww-choice{margin:0;padding:3px 0;min-height:0;align-items:center}.ww-ws-pathlist .ww-choice input[type=checkbox]{margin-top:0}.ww-ws-pathlist .ww-choice small{display:inline;margin-left:8px;color:var(--ww-ink-3)}',
    '.ww-ws-examples{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.ww-ws-examples>span{font-size:12px;color:var(--ww-ink-2)}',
    // 最近做过：开始页常见的事下面一组，一件一行；名字太长省略，右边“换文件再做一遍”和去掉。
    '.ww-ws-recent{display:flex;flex-direction:column;gap:2px;min-width:0}.ww-ws-recent-head{font-size:12px;color:var(--ww-ink-2);margin-bottom:4px}.ww-ws-recent-row{display:flex;align-items:center;gap:10px;min-width:0;padding:6px 4px 6px 10px;border-radius:10px}.ww-ws-recent-row:hover{background:var(--ww-tint)}.ww-ws-recent-main{flex:1;min-width:0;display:flex;flex-direction:column}.ww-ws-recent-main b{font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ww-ws-recent-main small{font-size:12px;color:var(--ww-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ww-ws .ww-ws-recent-x{flex:none;width:28px;height:28px;min-height:28px;padding:0;border:0;border-radius:8px;background:none;color:var(--ww-ink-3);font-size:15px;cursor:pointer}.ww-ws .ww-ws-recent-x:hover{background:var(--ww-tint);color:var(--ww-ink)}',
    '.ww-ws-replay-title{margin:0;font-weight:500}.ww-ws-replay-steps{margin:0;padding-left:1.4em;display:flex;flex-direction:column;gap:4px;font-size:13px}.ww-ws-replay-steps li small{display:block;color:var(--ww-ink-2);font-size:12px}.ww-ws-replay-drop{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px dashed var(--ww-line-2);border-radius:12px}.ww-ws-replay-drop p{margin:0;font-size:13px}.ww-ws-again{margin-top:4px}',
    '.ww-ws-list{display:flex;flex-direction:column;gap:18px}',
    '.ww-ws-ask{align-self:flex-end;max-width:min(100%,40rem);display:flex;flex-direction:column;align-items:flex-end;gap:6px}.ww-ws-ask>p{margin:0;background:var(--ww-hover,var(--ww-tint));border-radius:14px 14px 4px 14px;padding:9px 14px;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.ww-ws-job{display:flex;flex-direction:column;gap:10px}.ww-ws-work{border:1px solid var(--ww-line);border-radius:14px;background:var(--ww-surface);min-width:0;padding:12px 6px 6px}',
    '.ww-ws-work-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:0 10px 4px}.ww-ws-work-head b{font-weight:600}.ww-ws-status{margin-left:auto;font-size:12px;color:var(--ww-ink-2)}.ww-ws-status.ok{color:var(--ww-ok)}.ww-ws-status.warn{color:var(--ww-warn)}.ww-ws-status.err{color:var(--ww-err)}',
    '.ww-ws-steps{list-style:none;margin:0;padding:4px 4px 6px;display:flex;flex-direction:column;gap:1px}.ww-ws-step{border-radius:10px}.ww-ws-step.open{background:var(--ww-tint)}',
    '.ww-ws-shead{all:unset;box-sizing:border-box;display:grid;grid-template-columns:20px auto minmax(0,1fr) auto 14px;align-items:center;column-gap:10px;row-gap:1px;width:100%;padding:7px 8px;border-radius:10px}button.ww-ws-shead{cursor:pointer}button.ww-ws-shead:hover{background:var(--ww-hover,var(--ww-tint))}button.ww-ws-shead:focus-visible{outline:2px solid var(--ww-accent)}',
    '.ww-ws-sic{width:20px;height:20px;border-radius:50%;display:inline-grid;place-items:center;font-size:11px;border:1px solid var(--ww-line-2);color:var(--ww-ink-2)}.ww-ws-step[data-state=done] .ww-ws-sic{border-color:transparent;color:var(--ww-ok)}.ww-ws-step[data-state=run] .ww-ws-sic{border-color:var(--ww-accent);color:var(--ww-accent)}.ww-ws-step[data-state=need] .ww-ws-sic,.ww-ws-step[data-state=error] .ww-ws-sic{border-color:transparent;background:var(--ww-warn);color:var(--ww-surface)}',
    '.ww-ws-stool{font-weight:600;white-space:nowrap}.ww-ws-sarg{font-size:12.5px;color:var(--ww-ink-2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ww-ws-smeta{font-size:12px;color:var(--ww-ink-2);white-space:nowrap}.ww-ws-step[data-state=wait] .ww-ws-stool{font-weight:500;color:var(--ww-ink-2)}.ww-ws-step.open .ww-ws-chev{transform:rotate(90deg)}.ww-ws-chev{transition:transform .15s;color:var(--ww-ink-2)}',
    '.ww-ws-sdet{margin:0 10px 0 38px;padding:2px 0 12px;display:flex;flex-direction:column;gap:8px;font-size:12.5px}.ww-ws-kv{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:14px;row-gap:4px;margin:0}.ww-ws-kv dt{color:var(--ww-ink-2);white-space:nowrap}.ww-ws-kv dd{margin:0;overflow-wrap:anywhere}',
    '.ww-ws-seen{display:flex;gap:6px;font-size:12px;color:var(--ww-ink-2);padding:2px 12px 8px}.ww-ws-seen.read{color:var(--ww-ink)}',
    '.ww-ws-box{margin:4px 10px 10px;border:1px solid var(--ww-line-2);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}.ww-ws-box.warn{border-color:var(--ww-warn)}.ww-ws-box p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.ww-ws-choices{display:flex;flex-wrap:wrap;gap:8px}',
    '.ww-ws-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr));gap:10px;margin:0 10px 10px}.ww-ws-result{border:1px solid var(--ww-line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px;min-width:0}.ww-ws-result img{max-width:100%;max-height:12rem;object-fit:contain;border-radius:8px;align-self:flex-start;background:var(--ww-tint)}.ww-ws-result .ww-ws-bar{gap:6px}',
    '.ww-ws-skel{display:flex;gap:8px;padding:8px 10px 12px}.ww-ws-skel i{flex:1;height:40px;border-radius:10px;background:var(--ww-tint);animation:ww-ws-pulse 1.2s ease-in-out infinite alternate}@keyframes ww-ws-pulse{to{opacity:.45}}',
    '.ww-ws-dock{position:sticky;bottom:0;padding-top:8px;background:linear-gradient(transparent,var(--ww-page,var(--dsw-alias-bg-layer-1)) 40%)}',
    '.ww-ws-drawer{position:fixed;z-index:1100;top:var(--dsh-frame-top-clearance,0px);right:0;bottom:0;width:min(100%,24rem);background:var(--ww-raised);border-left:1px solid var(--ww-line-2);box-shadow:var(--dsw-elevation-prominent);display:flex;flex-direction:column}.ww-ws-drawer header{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--ww-line)}.ww-ws-drawer header b{flex:1}.ww-ws-drawer .body{flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px}.ww-ws-drawer footer{padding:12px 16px;border-top:1px solid var(--ww-line);display:flex;flex-direction:column;gap:8px}.ww-ws-drawer label{display:flex;flex-direction:column;gap:4px;font-size:12.5px}.ww-ws-drawer label small{color:var(--ww-ink-2)}',
    '.ww-ws-scrim{position:fixed;inset:0;z-index:1099;background:color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent)}',
    '.ww-ws-toast{position:fixed;z-index:1101;top:calc(var(--dsh-frame-top-clearance,0px) + 12px);right:16px;max-width:min(calc(100% - 32px),22rem);padding:10px 14px;border-radius:12px;background:var(--ww-raised);border:1px solid var(--ww-line-2);box-shadow:var(--dsw-elevation-prominent);font-size:13px}',
    '@container ww-ws (max-width:40rem){.ww-ws-shead{grid-template-columns:20px minmax(0,1fr) auto 14px}.ww-ws-stool{grid-column:2}.ww-ws-sarg{grid-column:2/-1;grid-row:2;white-space:normal}.ww-ws-sdet{margin-left:14px}.ww-ws-hint{display:none}}',
  ].join('');

  function FileChip({ file, onRemove }) {
    return h('span', { className: 'ww-ws-file' }, h('b', null, fileType(file.name).toUpperCase().slice(0, 4)), h('span', { title: file.name }, file.name), file.size !== undefined && h('small', null, sizeText(file.size)),
      onRemove && h('button', { type: 'button', onClick: onRemove, 'aria-label': `拿掉 ${file.name}` }, '×'));
  }

  /**
   * 员工贴的文件夹（或文件）路径（2026-11-14 用户定：员工一般复制文件夹路径，不会拖文件夹）：点“读取”让主机列出这一层的文件，
   * 员工勾好再一个一个读进来，和拖进来的文件一样。子文件夹不进去读；超过 25 MiB 的不能勾；最多凑满 20 个文件。
   */
  function PathPicker({ path, api, room, onFiles }) {
    const [state, setState] = React.useState(null);
    const live = React.useRef(true);
    React.useEffect(() => () => { live.current = false; }, []);
    const set = value => { if (live.current) setState(value); };
    const tooBig = entry => entry.size > 25 * 1024 * 1024;
    const list = async () => {
      set({ source: path, loading: true });
      try {
        const listing = await api.listPath(path);
        const files = listing.entries.filter(entry => !entry.folder);
        set({ source: path, listing, picked: new Set(files.filter(entry => !tooBig(entry)).slice(0, room).map(entry => entry.name)) });
      } catch (error) { set({ source: path, error: error?.message || '读不出来' }); }
    };
    const take = async () => {
      set({ ...state, reading: true });
      const files = [], problems = [];
      for (const name of state.picked) {
        try { files.push(await api.readPathFile(state.listing.path, name)); }
        catch (error) { problems.push(`「${name}」没读进来：${error?.message || '读不出来'}`); }
      }
      if (files.length) onFiles(files);
      set(problems.length ? { source: path, error: problems.join('；') } : null);
    };
    if (!state || state.source !== path) return h('div', { className: 'ww-ws-pathbox' }, h('div', { className: 'ww-ws-bar' },
      h('span', { className: 'ww-ws-pathname', title: path }, `认出了路径 ${path}`), h('span', { className: 'grow' }),
      h('button', { type: 'button', className: 'ww-chip', onClick: list }, '读取')));
    if (state.loading) return h('div', { className: 'ww-ws-pathbox', role: 'status' }, `正在读 ${path}…`);
    if (state.error) return h('div', { className: 'ww-ws-pathbox' }, h('div', { className: 'ww-ws-bar' },
      h('span', { className: 'ww-ws-path', role: 'alert' }, state.error), h('span', { className: 'grow' }),
      h('button', { type: 'button', className: 'ww-chip', onClick: list }, '重新读取')));
    const { listing, picked } = state;
    const files = listing.entries.filter(entry => !entry.folder), folders = listing.entries.length - files.length;
    const toggle = (name, on) => setState(current => { const next = new Set(current.picked); if (on) next.add(name); else next.delete(name); return { ...current, picked: next }; });
    const summary = listing.kind === 'file' ? '要放进来的文件' : [`${listing.path} 里有 ${files.length} 个文件`, folders && `${folders} 个子文件夹（不进去读，要处理里面的文件就贴那个文件夹的路径）`, listing.truncated && '只列了前 500 项'].filter(Boolean).join('，');
    return h('div', { className: 'ww-ws-pathbox' },
      h('div', { className: 'ww-ws-hint' }, `${summary}；勾好放进来，最多再放 ${room} 个。`),
      files.length ? h('div', { className: 'ww-ws-pathlist' }, files.map(entry => h('label', { key: entry.name, className: 'ww-choice' },
        h('input', { type: 'checkbox', checked: picked.has(entry.name), disabled: state.reading || tooBig(entry) || (!picked.has(entry.name) && picked.size >= room), onChange: event => toggle(entry.name, event.target.checked) }),
        h('span', null, entry.name, h('small', null, tooBig(entry) ? `${sizeText(entry.size)} · 超过 25 MiB，放不进来` : sizeText(entry.size)))))) : h('div', { className: 'ww-ws-hint' }, '这一层没有文件。'),
      h('div', { className: 'ww-ws-bar' }, h('span', { className: 'grow' }),
        h('button', { type: 'button', onClick: () => setState(null), disabled: state.reading }, '取消'),
        h('button', { type: 'button', className: 'ww-primary', disabled: state.reading || !picked.size, onClick: take }, state.reading ? '正在读…' : `放进来（${picked.size} 个）`)));
  }

  function Composer({ draft, setDraft, onSend, busy, placeholder, big, api }) {
    const input = React.useRef(null), [drag, setDrag] = React.useState(false);
    const add = (list, pasted) => {
      const files = [...list].filter(Boolean).map(file => {
        if (!pasted || !/^image\.\w+$/i.test(file.name)) return file;
        const stamp = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/[/:]/g, '').replace(/\s+/g, ' ');
        const renamed = new (platform.File ?? File)([file], `截图 ${stamp}.png`, { type: file.type || 'image/png' });
        renamed.pasted = true;
        return renamed;
      });
      if (files.length) setDraft(previous => ({ ...previous, files: [...previous.files, ...files].slice(0, 20) }));
    };
    const path = findPath(draft.text);
    return h('div', { className: `ww-ws-composer${drag ? ' drag' : ''}`, onDragOver: event => { if ([...(event.dataTransfer?.types ?? [])].includes('Files')) { event.preventDefault(); setDrag(true); } }, onDragLeave: () => setDrag(false), onDrop: event => { event.preventDefault(); setDrag(false); add(event.dataTransfer?.files ?? []); } },
      draft.files.length > 0 && h('div', { className: 'ww-ws-tray' }, draft.files.map((file, index) => h(FileChip, { key: `${file.name}-${index}`, file, onRemove: () => setDraft(previous => ({ ...previous, files: previous.files.filter((_, i) => i !== index) })) }))),
      h('textarea', { rows: big ? 3 : 1, value: draft.text, placeholder, 'aria-label': '要求', onChange: event => setDraft(previous => ({ ...previous, text: event.target.value })),
        onPaste: event => { const files = [...(event.clipboardData?.files ?? [])]; if (files.length) { event.preventDefault(); add(files, true); } },
        onKeyDown: event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) { event.preventDefault(); onSend(); } } }),
      path && (typeof api?.listPath === 'function' ? h(PathPicker, { path, api, room: Math.max(0, 20 - draft.files.length), onFiles: files => add(files) })
        : h('div', { className: 'ww-ws-path' }, `认出了路径 ${path}。办公工坊还没连上主机，读不了文件夹，先把文件拖进来。`)),
      h('div', { className: 'ww-ws-bar' },
        h('button', { type: 'button', className: 'ww-chip', onClick: () => input.current?.click() }, '选文件'),
        h('input', { ref: input, type: 'file', multiple: true, hidden: true, onChange: event => { add(event.target.files ?? []); event.target.value = ''; } }),
        h('span', { className: 'ww-ws-hint' }, '拖进来 · Ctrl V 粘贴截图'), h('span', { className: 'grow' }),
        h('span', { className: 'ww-ws-hint' }, '在这台电脑上处理'),
        h('button', { type: 'button', className: 'ww-primary', disabled: busy, onClick: onSend }, '交给小鲸')));
  }

  function WorkshopView({ active = true, api, Glyph, host }) {
    const store = React.useRef(null);
    if (!store.current) store.current = { turns: [], statuses: new Map(), handled: new Set() };
    const [, setVersion] = React.useState(0);
    const refresh = () => setVersion(value => value + 1);
    const [shelf, setShelf] = React.useState(false), [dock, setDock] = React.useState(null);
    const [draft, setDraft] = React.useState({ text: '', files: [] });
    const [fresh, setFresh] = React.useState(false);
    const [drawer, setDrawer] = React.useState(null);
    const [region, setRegion] = React.useState(null);
    const [toast, setToast] = React.useState(null);
    const toastTimer = React.useRef(null);
    // “最近做过”（2026-11-14 用户定做）：做好的一单记下做法，换上新文件照原样再做一遍，直接交给功能项，不经过小鲸、不花 token。
    const storageOf = () => { try { return platform.localStorage ?? null; } catch { return null; } };
    const [recent, setRecent] = React.useState(() => readRecent(storageOf()));
    const [replay, setReplay] = React.useState(null);
    const replayInput = React.useRef(null);
    // 右上角提示：成功 4 秒自己消失，可以带一个动作（比如“在文件夹显示”）。
    const say = (text, action) => { setToast({ text, action }); platform.clearTimeout?.(toastTimer.current); toastTimer.current = platform.setTimeout?.(() => setToast(null), 4000); };
    const turns = store.current.turns;
    const latest = sessionId => [...turns].reverse().find(turn => turn.job.sessionId === sessionId);

    // 放进来的文件只记名字、类型、大小、尺寸、表头和数据行数，交给小鲸的就是这些（数据行的内容不给）。
    async function describe(file, id) {
      const type = fileType(file.name);
      const meta = { id, name: String(file.name || '未命名').slice(0, 260), type: type.slice(0, 16), size: file.size };
      if (file.pasted) meta.pasted = true;
      try {
        if (imageTypes.has(type) && typeof platform.createImageBitmap === 'function') { const bitmap = await platform.createImageBitmap(file); meta.width = bitmap.width; meta.height = bitmap.height; bitmap.close?.(); }
        if (type === 'xlsx') meta.sheets = (await exec.headers([file])).slice(0, 50).map(table => ({ name: table.label.slice(0, 64), ...(Number.isInteger(table.rows) && table.rows >= 0 ? { rows: table.rows } : {}), headers: table.headers.slice(0, 200).map(value => String(value).slice(0, 120)) }));
      } catch { /* 描述读不出来不影响交给小鲸，功能项处理时会说清楚。 */ }
      return meta;
    }

    async function submit(text, files, job, from) {
      const entries = files.map(file => ({ id: `f${++job.fileSeq}`, file }));
      const turn = { key: ++keys, job, ask: { text, files, from }, steps: [], reads: [], open: new Set(), state: 'sending' };
      turns.push(turn); refresh();
      try {
        const metas = await Promise.all(entries.map(entry => describe(entry.file, entry.id)));
        entries.forEach((entry, index) => job.files.set(entry.id, { name: entry.file.name, file: entry.file, meta: metas[index] }));
        const { sessionId } = await api.start({ text, files: metas, ...(job.sessionId ? { sessionId: job.sessionId } : {}) });
        job.sessionId = sessionId; turn.state = 'sent';
      } catch (error) { turn.error = error?.message || '没能交给小鲸，请稍后重试'; }
      refresh();
      return !turn.error;
    }
    function send() {
      const text = draft.text.trim();
      if (!text && !draft.files.length) { say('先放文件进来，或者说一句要做什么'); return; }
      if (!api?.start) { say('办公工坊正在连接，请稍后再试'); return; }
      const last = turns.at(-1);
      const job = !fresh && last?.job?.sessionId ? last.job : { files: new Map(), fileSeq: 0, runSeq: 0, sessionId: null };
      setDraft({ text: '', files: [] }); setFresh(false);
      void submit(text, draft.files, job);
    }
    const followUp = (turn, text) => { void submit(text, [], turn.job); };

    // 处理一个结果文件：生成编号，表格再读一次表头，给小鲸看的只有这些描述。
    async function keep(job, run, file, index, inputName) {
      const id = `r${run}-${index + 1}`, name = tidyName(file.name, inputName);
      const blob = new (platform.File ?? File)([file.bytes], name, { type: file.mime });
      job.files.set(id, { name, file: blob, meta: await describe(blob, id) });
      return id;
    }

    async function perform(turn, action, args) {
      const job = turn.job;
      if (action === 'plan') {
        turn.steps = args.steps.map(step => ({ tool: step.tool, note: step.note, state: 'wait' })); turn.final = null; turn.question = null;
        return {};
      }
      if (action === 'run') {
        const index = args.step - 1;
        const step = turn.steps[index] ?? (turn.steps[index] = { tool: args.tool, note: '', state: 'wait' });
        step.tool = args.tool; step.state = 'run'; step.call = { inputs: args.inputs, options: args.options ?? {}, text: args.text }; refresh();
        const inputs = args.inputs.map(id => { const entry = job.files.get(id); if (!entry) throw new Error(`没有编号 ${id} 的文件`); return entry; });
        const started = (platform.performance ?? performance).now();
        try {
          const raw = await exec.run(args.tool, inputs.map(entry => entry.file), args.options ?? {}, args.text, args.inputs);
          if (raw?.needs === 'region') { step.state = 'need'; turn.needs = { step: args.step, file: inputs[0] }; return { needs: 'region' }; }
          validateResult(raw);
          const run = ++job.runSeq;
          const outputs = [];
          for (const [index2, file] of raw.files.entries()) outputs.push(await keep(job, run, file, index2, inputs.length === 1 ? inputs[0].name : undefined));
          const seconds = Math.round(((platform.performance ?? performance).now() - started) / 100) / 10;
          step.state = 'done'; step.result = { outputs, summary: raw.summary, seconds, failed: (raw.failed ?? []).map(i => inputs[i]?.name).filter(Boolean) };
          if (turn.needs?.step === args.step) turn.needs = null;
          return { outputs: outputs.map(id => job.files.get(id).meta), summary: raw.summary, seconds, failed: step.result.failed };
        } catch (error) { step.state = 'error'; step.error = error?.message || '这一步没做成'; throw error; }
      }
      if (action === 'read') {
        const entry = job.files.get(args.file);
        if (!entry) throw new Error(`没有编号 ${args.file} 的文件`);
        const value = await exec.read(entry.file, entry.meta.type, { sheet: args.sheet, rows: args.rows });
        turn.reads.push({ name: entry.name, reason: args.reason, where: [args.sheet && `工作表「${args.sheet}」`, args.rows && `第 ${args.rows} ${entry.meta.type === 'pdf' ? '页' : '行'}`].filter(Boolean).join('，') });
        return value;
      }
      if (action === 'ask') { turn.question = { text: args.question, choices: args.choices ?? [] }; return {}; }
      if (action === 'finish') { turn.final = { message: args.message, results: args.results ?? [] }; turn.question = null; return {}; }
      throw new Error('页面不认识这个动作');
    }

    async function handle(request) {
      const turn = latest(request.sessionId);
      if (!turn) return;
      try { const value = await perform(turn, request.action, request.args); await api.reply({ id: request.id, ok: true, value }); }
      catch (error) { await api.reply({ id: request.id, ok: false, error: String(error?.message || error || '没能处理').slice(0, 2000) }).catch(() => {}); }
      refresh();
    }

    // 订阅主机推过来的请求：只处理自己这个页面里的那几单，断了就重连；页面卸载才停。
    React.useEffect(() => {
      if (!api?.watch) return undefined;
      const controller = new AbortController();
      let stopped = false;
      (async () => {
        while (!stopped) {
          try {
            for await (const frame of api.watch(controller.signal)) {
              if (stopped) return;
              for (const job of frame.jobs ?? []) store.current.statuses.set(job.sessionId, job);
              for (const request of frame.requests ?? []) {
                if (store.current.handled.has(request.id) || !latest(request.sessionId)) continue;
                store.current.handled.add(request.id);
                void handle(request);
              }
              refresh();
            }
          } catch { /* 连接断了，稍后重连。 */ }
          if (!stopped) await new Promise(resolve => platform.setTimeout(resolve, 1500));
        }
      })();
      return () => { stopped = true; controller.abort(); };
    }, [api]);
    // 和小鲸的对话里转过来的活：外壳已经切到这一页，这里按员工的原话交给小鲸，交上了就认领掉。
    React.useEffect(() => {
      if (!api?.subscribeInbox) return undefined;
      const drain = () => {
        for (const item of api.takeInbox()) {
          const job = { files: new Map(), fileSeq: 0, runSeq: 0, sessionId: null };
          void (async () => {
            // 员工在小鲸对话里发的附件（主机核对过在 DSH 附件目录里）：读进来、用回原文件名，和原话一起交给小鲸；读不进来的在原话后面注明。
            const files = [], missing = [];
            for (const attachment of (item.files ?? []).slice(0, 20)) {
              const cut = Math.max(attachment.path.lastIndexOf('\\'), attachment.path.lastIndexOf('/'));
              try { files.push(await api.readPathFile(attachment.path.slice(0, cut), attachment.path.slice(cut + 1), { as: attachment.name })); }
              catch (error) { missing.push(`「${attachment.name}」（${error?.message || '读不出来'}）`); }
            }
            const text = missing.length ? `${item.text}\n\n（对话里的这些附件没读进来：${missing.join('、')}）` : item.text;
            const ok = await submit(text, files, job, item.from);
            if (ok) api.claim(item.id).catch(() => {});
          })();
        }
      };
      drain();
      return api.subscribeInbox(drain);
    }, [api]);
    React.useEffect(() => () => { for (const turn of turns) for (const entry of turn.job.files.values()) if (entry.url) platform.URL.revokeObjectURL(entry.url); }, []);

    function stateOf(turn) {
      if (turn.error) return 'error';
      if (turn.local) return turn.finished ? 'done' : 'running';
      if (turn.state === 'sending') return 'sending';
      if (turn.needs && !turn.needs.done) return 'need';
      if (turn.answer) return 'answered';
      if (turn.needs?.done) return 'framed';
      if (turn.steps.some(step => step.state === 'run')) return 'running';
      const status = store.current.statuses.get(turn.job.sessionId);
      if (latest(turn.job.sessionId) !== turn) return 'done';
      if (!status || ['queued', 'running', 'waiting'].includes(status.status)) return turn.question ? 'asking' : turn.steps.length ? 'running' : 'thinking';
      if (status.status === 'completed') return turn.question && !turn.final ? 'asking' : 'done';
      return status.status;
    }

    // 做好的单子记进“最近做过”：同一单再记（调整过某一步、换文件又做了一遍）就替换原来那条，名字用最早那次员工说的话。
    React.useEffect(() => {
      let next = null;
      for (const turn of turns) {
        if (turn.recorded || stateOf(turn) !== 'done') continue;
        turn.recorded = true;
        const made = recipeOf(turn, { titleOf });
        if (!made) continue;
        turn.recipe = turn.recipe ? { ...made, id: turn.recipe.id, title: turn.recipe.title } : made;
        next = saveRecent(storageOf(), turn.recipe);
      }
      if (next) setRecent(next);
    });

    /** 照记下的做法再做一遍：这次的文件进来，每一步按上次的功能项和设置直接交给功能项，不经过小鲸。 */
    async function replayOnce(recipe, run) {
      const job = { files: new Map(), fileSeq: 0, runSeq: 0, sessionId: null };
      const given = run.batch ?? run.slots;
      const turn = { key: ++keys, job, local: true, recipe, ask: { text: `换文件再做一遍：${recipe.title}`, files: given }, steps: recipe.steps.map(step => ({ tool: step.tool, note: step.note, state: 'wait' })), reads: [], open: new Set(), state: 'sent' };
      turns.push(turn); refresh();
      const ids = [];
      for (const file of given) { const id = `f${++job.fileSeq}`; job.files.set(id, { name: file.name, file, meta: await describe(file, id) }); ids.push(id); }
      const outputs = [];
      try {
        for (const [index, step] of turn.steps.entries()) {
          const call = stepCall(recipe, index, run.batch ? { batch: ids, outputs } : { slotIds: ids, outputs });
          step.call = call; step.state = 'run'; refresh();
          const started = (platform.performance ?? performance).now();
          const raw = await exec.run(step.tool, call.inputs.map(id => job.files.get(id).file), call.options, call.text, call.inputs);
          if (raw?.needs) throw new Error('这一步要框位置，换了文件请交给小鲸重新做');
          validateResult(raw);
          const runNo = ++job.runSeq, made = [];
          for (const [k, file] of raw.files.entries()) made.push(await keep(job, runNo, file, k, call.inputs.length === 1 ? job.files.get(call.inputs[0])?.name : undefined));
          outputs.push(made);
          const seconds = Math.round(((platform.performance ?? performance).now() - started) / 100) / 10;
          step.state = 'done'; step.result = { outputs: made, summary: raw.summary, seconds, failed: (raw.failed ?? []).map(i => job.files.get(call.inputs[i])?.name).filter(Boolean) };
        }
        turn.final = { message: '照上次的做法做好了。直接交给功能项做的，没经过小鲸，不花 token。', results: outputs.at(-1) ?? [] };
      } catch (error) {
        const step = turn.steps.find(item => item.state === 'run');
        const message = error?.message || '没做成';
        if (step) { step.state = 'error'; step.error = message; }
        turn.error = `没做成：${message}`;
      }
      turn.finished = true; refresh();
    }
    async function startReplay() {
      const { recipe, files } = replay;
      const plan = planReplay(recipe, files, fileType);
      if (plan.error) { setReplay({ ...replay, error: plan.error }); return; }
      setReplay(null); setFresh(false);
      for (const run of plan.runs) await replayOnce(recipe, run);
    }
    const addReplayFiles = list => { const picked = [...(list ?? [])].filter(Boolean); if (picked.length) setReplay(current => current && { ...current, files: [...current.files, ...picked].slice(0, 20), error: '' }); };

    const urlOf = entry => entry.url ?? (entry.url = platform.URL.createObjectURL(entry.file));
    // 保存用 DSH 自带的另存为（2026-11-12 用户定）：弹系统窗口，默认上次保存的文件夹，存到哪、叫什么由员工定，点取消就不存。
    async function save(entry) {
      try {
        const result = api?.saveFile ? await api.saveFile(entry.file, entry.name) : { status: 'unavailable' };
        if (result.status === 'cancelled') return;
        if (result.status === 'saved') { entry.saved = result.path; refresh(); say(`已存到 ${result.path}`, api?.revealPath ? { label: '在文件夹显示', run: () => api.revealPath(result.path) } : undefined); return; }
        if (result.status === 'unavailable') { const link = platform.document.createElement('a'); link.href = urlOf(entry); link.download = entry.name; link.click(); }
        say('已开始下载，存到哪由浏览器决定');
      } catch (error) { say(`没能保存：${error?.message || '请稍后重试'}`); }
    }
    async function copyImage(entry) {
      try { await api.copyImage(entry.file); say('图片已复制，可以直接粘到微信、飞书里'); }
      catch (error) { say(`没能复制：${error?.message || '剪贴板不可用'}`); }
    }

    async function rerun(turn, index, options) {
      const job = turn.job, changed = new Set();
      turn.steps[index].call.options = options;
      try {
        for (let i = index; i < turn.steps.length; i++) {
          const step = turn.steps[i];
          if (!step.call || !step.result || (i > index && !step.call.inputs.some(id => changed.has(id)))) continue;
          step.state = 'run'; refresh();
          const raw = await exec.run(step.tool, step.call.inputs.map(id => job.files.get(id).file), step.call.options, step.call.text, step.call.inputs);
          if (raw?.needs) throw new Error('这一步要先框好位置');
          validateResult(raw);
          const outputs = [];
          for (const [k, file] of raw.files.entries()) {
            const id = step.result.outputs[k];
            if (id) { const old = job.files.get(id); if (old?.url) platform.URL.revokeObjectURL(old.url); const name = tidyName(file.name, step.call.inputs.length === 1 ? job.files.get(step.call.inputs[0])?.name : undefined); const blob = new (platform.File ?? File)([file.bytes], name, { type: file.mime }); job.files.set(id, { name, file: blob, meta: await describe(blob, id) }); outputs.push(id); }
            else outputs.push(await keep(job, ++job.runSeq, file, k, step.call.inputs.length === 1 ? job.files.get(step.call.inputs[0])?.name : undefined));
            changed.add(outputs.at(-1));
          }
          step.result = { ...step.result, outputs, summary: raw.summary };
          step.state = 'done';
        }
        turn.recorded = false;
        say('按你调的重新做好了。直接交给功能项做的，没经过小鲸，不花 token。');
      } catch (error) { turn.steps[index].state = 'error'; turn.steps[index].error = error?.message || '没做成'; say(`没做成：${turn.steps[index].error}`); }
      refresh();
    }

    function StepRow({ turn, step, index }) {
      const open = turn.open.has(index) && ['done', 'run'].includes(step.state);
      const can = ['done', 'run'].includes(step.state);
      const meta = step.state === 'done' ? `${step.result?.seconds ?? ''} 秒` : step.state === 'run' ? '处理中' : step.state === 'error' ? '没做成' : step.state === 'need' && turn.needs?.done ? '已框好' : '';
      const action = step.state === 'need' && !turn.needs?.done && h('button', { type: 'button', className: 'ww-primary', onClick: () => setRegion({ turn, value: { x: 0, y: 0, width: 0, height: 0 } }) }, '框出位置');
      const inner = [
        h('span', { key: 'i', className: 'ww-ws-sic', 'aria-hidden': true }, step.state === 'done' ? '✓' : step.state === 'run' ? '…' : ['need', 'error'].includes(step.state) ? '!' : index + 1),
        h('span', { key: 't', className: 'ww-ws-stool' }, titleOf(step.tool)), h('span', { key: 'a', className: 'ww-ws-sarg' }, step.note),
        h('span', { key: 'm', className: 'ww-ws-smeta' }, action || meta), h('span', { key: 'c', className: 'ww-ws-chev', 'aria-hidden': true }, can ? '›' : ''),
      ];
      const toggle = () => { if (turn.open.has(index)) turn.open.delete(index); else turn.open.add(index); refresh(); };
      return h('li', { className: `ww-ws-step${open ? ' open' : ''}`, 'data-state': step.state },
        can ? h('button', { type: 'button', className: 'ww-ws-shead', 'aria-expanded': open, onClick: toggle }, inner) : h('div', { className: 'ww-ws-shead', title: step.state === 'wait' ? '还没开始，没有详情' : undefined }, inner),
        step.state === 'error' && h('div', { className: 'ww-ws-sdet' }, step.error),
        open && StepDetail({ turn, step, index }));
    }
    function StepDetail({ turn, step, index }) {
      const job = turn.job, names = ids => (ids ?? []).map(id => { const entry = job.files.get(id); return entry ? `${entry.name}（${sizeText(entry.file.size)}）` : id; }).join('、');
      const options = Object.entries(step.call?.options ?? {});
      const spec = modelFunctions[step.tool];
      return h('div', { className: 'ww-ws-sdet' },
        h('dl', { className: 'ww-ws-kv' },
          h('dt', null, '功能项'), h('dd', null, titleOf(step.tool)),
          step.call?.inputs?.length > 0 && [h('dt', { key: 'in' }, '拿到的'), h('dd', { key: 'ind' }, names(step.call.inputs))],
          options.length > 0 && [h('dt', { key: 'o' }, '设置'), h('dd', { key: 'od' }, options.map(([key, value]) => `${key}：${typeof value === 'object' ? JSON.stringify(value) : value}`).join('；'))],
          step.result && [h('dt', { key: 'out' }, '做出的'), h('dd', { key: 'outd' }, names(step.result.outputs) || '没有文件')],
          step.result?.summary && [h('dt', { key: 's' }, '说明'), h('dd', { key: 'sd' }, step.result.summary)],
          step.result?.failed?.length > 0 && [h('dt', { key: 'f' }, '没做成的'), h('dd', { key: 'fd' }, step.result.failed.join('、'))]),
        step.state === 'done' && spec?.options.length > 0 && stateOf(turn) === 'done' && h('div', { className: 'ww-ws-bar' },
          h('button', { type: 'button', className: 'ww-chip', onClick: () => setDrawer({ turn, index, values: Object.fromEntries(spec.options.map(([key]) => [key, step.call?.options?.[key] === undefined ? '' : typeof step.call.options[key] === 'object' ? JSON.stringify(step.call.options[key]) : String(step.call.options[key])])) }) }, '调整这一步'),
          h('span', { className: 'ww-ws-hint' }, '按你调的交给功能项重做，不经过小鲸，不花 token')));
    }

    // 从哪段对话转过来：标题从会话列表实时读（转过来时对话往往还没起标题）。
    const fromLine = from => { const title = api?.sessionTitle?.(from.sessionId) || from.title; return title ? `从和小鲸的对话「${title}」转过来` : '从和小鲸的对话转过来'; };
    function Turn({ turn }) {
      const job = turn.job, state = stateOf(turn);
      const status = store.current.statuses.get(job.sessionId);
      const statusLine = state === 'running' ? `在这台电脑上处理${turn.steps.length ? ` · 第 ${Math.min(turn.steps.filter(step => step.state === 'done').length + 1, turn.steps.length)} / ${turn.steps.length} 步` : ''}` : statusText[state] ?? '';
      const tone = state === 'done' ? 'ok' : ['asking', 'need'].includes(state) ? 'warn' : ['error', 'interrupted', 'incomplete'].includes(state) ? 'err' : '';
      const results = turn.final?.results?.length ? turn.final.results : state === 'done' && !turn.final ? (turn.steps.filter(step => step.result).at(-1)?.result.outputs ?? []) : [];
      const message = turn.final?.message ?? (state === 'done' && latest(job.sessionId) === turn ? status?.reply : '');
      const own = turn.ask.files.length > 0;
      return h('article', { className: 'ww-ws-job' },
        h('div', { className: 'ww-ws-ask' }, turn.ask.from && h('div', { className: 'ww-ws-bar ww-ws-hint' }, fromLine(turn.ask.from), api?.openSession && h('button', { type: 'button', className: 'ww-chip', onClick: () => api.openSession(turn.ask.from.sessionId) }, '回到对话')), turn.ask.text && h('p', null, turn.ask.text), own && h('div', { className: 'ww-ws-tray' }, turn.ask.files.map((file, index) => h(FileChip, { key: index, file })))),
        h('section', { className: 'ww-ws-work' },
          h('div', { className: 'ww-ws-work-head' }, h('b', null, turn.local ? '照上次的做法' : '小鲸的做法'), h('span', { className: `ww-ws-status ${tone}` }, statusLine)),
          ['sending', 'thinking'].includes(state) && !turn.steps.length && h('div', { className: 'ww-ws-skel', 'aria-hidden': true }, h('i'), h('i'), h('i')),
          turn.steps.length > 0 && h('ol', { className: 'ww-ws-steps' }, turn.steps.map((step, index) => h(React.Fragment, { key: index }, StepRow({ turn, step, index })))),
          turn.local ? h('div', { className: 'ww-ws-seen' }, '这一单没经过小鲸：照上次的做法直接交给功能项，文件没离开这台电脑。') : h('div', { className: 'ww-ws-seen' }, own ? '小鲸看了：这些文件的名字、类型、大小、尺寸和表头这类描述，没看内容。文件没离开这台电脑。' : turns.find(item => item.job === job) === turn ? '小鲸看了：你写的这句话。' : '小鲸看了：你写的这句话和前面结果的名字、大小。'),
          !turn.local && turn.reads.map((read, index) => h('div', { key: index, className: 'ww-ws-seen read' }, `按你的要求（${read.reason}），小鲸读了「${read.name}」${read.where ? `的${read.where}` : ''}的内容。`)),
          turn.error && h('div', { className: 'ww-ws-box warn' }, h('p', null, turn.error)),
          turn.question && (state === 'asking' || turn.answer) && h('div', { className: `ww-ws-box${turn.answer ? '' : ' warn'}` }, h('p', null, turn.question.text),
            turn.answer ? h('p', { className: 'ww-ws-hint' }, `你选了「${turn.answer}」`)
              : h('div', { className: 'ww-ws-choices' }, turn.question.choices.map(choice => h('button', { type: 'button', key: choice, className: 'ww-chip', onClick: () => { turn.answer = choice; followUp(turn, choice); } }, choice)))),
          state === 'need' && h('div', { className: 'ww-ws-box warn' }, h('p', null, '小鲸看不到图片内容，要处理的地方请你框一下。框好以后交给功能项在本机处理。')),
          message && h('div', { className: 'ww-ws-box' }, h('p', null, message)),
          results.length > 0 && h('div', { className: 'ww-ws-results' }, results.map(id => {
            const entry = job.files.get(id);
            if (!entry) return null;
            const image = imageTypes.has(entry.meta.type);
            return h('div', { key: id, className: 'ww-ws-result' },
              image && h('img', { src: urlOf(entry), alt: entry.name }),
              h(FileChip, { file: { name: entry.name, size: entry.file.size } }),
              entry.saved && h('div', { className: 'ww-ws-bar ww-ws-hint' }, `已存到 ${entry.saved}`, api?.revealPath && h('button', { type: 'button', className: 'ww-chip', onClick: () => api.revealPath(entry.saved).catch(error => say(`打不开：${error?.message || '文件位置不可用'}`)) }, '在文件夹显示')),
              h('div', { className: 'ww-ws-bar' }, h('button', { type: 'button', className: 'ww-primary', onClick: () => void save(entry) }, '保存…'), image && h('button', { type: 'button', className: 'ww-chip', onClick: () => void copyImage(entry) }, '复制图片')));
          })),
          state === 'done' && turn.recipe && h('div', { className: 'ww-ws-bar ww-ws-again' }, h('button', { type: 'button', className: 'ww-chip', onClick: () => setReplay({ recipe: turn.recipe, files: [], error: '' }) }, '换文件再做一遍'), h('span', { className: 'ww-ws-hint' }, '照这一单的做法处理别的文件，不经过小鲸，不花 token'))));
    }

    const hasTurns = turns.length > 0;
    const regionFile = region?.turn?.needs?.file?.file;
    // 全部功能项：右侧抽屉（2026-11-12 用户定），功能项窗口和结果由它持有，一直挂着，抽屉关上也不丢。
    const tools = h(ToolboxView, { key: 'tools', active, open: shelf, onClose: () => setShelf(false), onDock: setDock, host });
    // 功能项窗口收起后的入口（2026-11-14 用户看了原型定方案 A）：页头“全部功能项”旁边一个胶囊，写功能项和进度，
    // 点它恢复、点 × 关掉（还在处理或没下载时窗口里先问）；不往页面里插一行，页面不往下挤。
    const dockText = dock && ({ running: dock.status.progress ? `处理中 ${dock.status.progress.done + 1}/${dock.status.progress.total}` : '处理中', done: '做好了，没下载', saved: '已下载', failed: '没做成' })[dock.status.kind];
    const dockName = dock && (dock.title || dock.tool.title);
    const dockChip = dock && h('span', { className: 'ww-chip ww-ws-dock', 'data-state': dock.status.kind, role: 'group', 'aria-label': `收起的窗口：${dock.tool.title}` },
      h('button', { type: 'button', className: 'ww-ws-dock-open', onClick: () => dock.restore(), title: '点开接着用', 'aria-label': `恢复${dock.tool.title}：${dockName}${dockText ? `，${dockText}` : ''}` },
        dock.status.kind === 'running' ? h('span', { className: 'ww-ws-spin', 'aria-hidden': true }) : (dock.status.kind === 'done' || dock.status.kind === 'saved') && Glyph ? h(Glyph, { name: 'check', size: 14 }) : null,
        h('span', { className: 'ww-ws-dock-name' }, dockName), dockText && h('small', null, `· ${dockText}`)),
      h('button', { type: 'button', className: 'ww-ws-dock-x', onClick: () => dock.requestClose(), title: '关闭窗口', 'aria-label': `关闭${dockName}窗口` }, Glyph ? h(Glyph, { name: 'close', size: 12 }) : '×'));
    return h('section', { hidden: !active, className: 'ww-ws', 'aria-label': '办公工坊' }, h('style', null, css), tools,
      // 页头用外壳统一的 ww-pagehead（和其他页签同一个字号、位置），ww-ws-head 只留给定位用。
      h('header', { className: 'ww-pagehead ww-ws-head' }, h('div', null, h('h2', null, '办公工坊'), h('p', null, '文件交给小鲸，在这台电脑上处理，原文件不动')),
        h('div', { className: 'ww-pagehead-actions' }, dockChip,
          hasTurns && h('button', { type: 'button', className: 'ww-chip', 'aria-pressed': fresh, onClick: () => setFresh(value => !value) }, fresh ? '下一句开新的一单' : '新的一单'),
          h('button', { type: 'button', className: 'ww-chip', onClick: () => setShelf(true), 'aria-haspopup': 'dialog' }, '全部功能项'))),
      !hasTurns ? h('div', { className: 'ww-ws-hero' }, h('h3', null, '手上有文件要处理？'), h('p', null, '放进来，说要什么结果。小鲸挑功能项，在这台电脑上做完。'),
        h(Composer, { draft, setDraft, onSend: send, api, big: true, placeholder: '把文件拖进来、Ctrl V 粘贴截图，或者直接说要做什么' }),
        h('div', { className: 'ww-ws-examples' }, h('span', null, '常见的事'), examples.map(text => h('button', { type: 'button', key: text, className: 'ww-chip', onClick: () => setDraft(previous => ({ ...previous, text })) }, text))),
        recent.length > 0 && h('section', { className: 'ww-ws-recent', 'aria-label': '最近做过' }, h('span', { className: 'ww-ws-recent-head' }, '最近做过'),
          recent.slice(0, 4).map(recipe => h('div', { key: recipe.id, className: 'ww-ws-recent-row' },
            h('span', { className: 'ww-ws-recent-main' }, h('b', { title: recipe.title }, recipe.title), h('small', null, `${recipe.chain} · ${whenText(recipe.at)}`)),
            h('button', { type: 'button', className: 'ww-chip', onClick: () => setReplay({ recipe, files: [], error: '' }) }, '换文件再做一遍'),
            h('button', { type: 'button', className: 'ww-ws-recent-x', title: '从最近做过里去掉', 'aria-label': `从最近做过里去掉「${recipe.title}」`, onClick: () => setRecent(forgetRecent(storageOf(), recipe.id)) }, '×')))))
        : h(React.Fragment, null, h('div', { className: 'ww-ws-list' }, turns.map(turn => h(React.Fragment, { key: turn.key }, Turn({ turn })))),
          h('div', { className: 'ww-ws-dock' }, h(Composer, { draft, setDraft, onSend: send, api, placeholder: fresh ? '新的一单：放文件、说要做什么' : '接着说，比如“去掉第 3 页”，或者放新文件进来' }))),
      replay && h(React.Fragment, null, h('div', { className: 'ww-ws-scrim', onClick: () => setReplay(null) }),
        h('aside', { className: 'ww-ws-drawer', role: 'dialog', 'aria-label': '换文件再做一遍' },
          h('header', null, h('b', null, '换文件再做一遍'), h('button', { type: 'button', className: 'ww-chip', onClick: () => setReplay(null) }, '关闭')),
          h('div', { className: 'body' },
            h('p', { className: 'ww-ws-replay-title' }, replay.recipe.title),
            h('ol', { className: 'ww-ws-replay-steps' }, replay.recipe.steps.map((step, index) => h('li', { key: index }, h('b', null, titleOf(step.tool)), step.note && h('small', null, step.note)))),
            h('p', { className: 'ww-ws-hint' }, `上次用的文件：${replay.recipe.slots.map(slot => slot.name).join('、')}`),
            h('div', { className: 'ww-ws-replay-drop', onDragOver: event => { if ([...(event.dataTransfer?.types ?? [])].includes('Files')) event.preventDefault(); }, onDrop: event => { event.preventDefault(); addReplayFiles(event.dataTransfer?.files); } },
              h('p', null, replayHint(replay.recipe)),
              h('div', { className: 'ww-ws-bar' }, h('button', { type: 'button', className: 'ww-chip', onClick: () => replayInput.current?.click() }, '选文件'), h('span', { className: 'ww-ws-hint' }, '也可以拖进来'),
                h('input', { ref: replayInput, type: 'file', multiple: true, hidden: true, 'aria-label': '这次要处理的文件', onChange: event => { addReplayFiles(event.target.files); event.target.value = ''; } })),
              replay.files.length > 0 && h('div', { className: 'ww-ws-tray' }, replay.files.map((file, index) => h(FileChip, { key: `${file.name}-${index}`, file, onRemove: () => setReplay(current => ({ ...current, files: current.files.filter((_, i) => i !== index), error: '' })) })))),
            replay.error && h('p', { className: 'ww-ws-path', role: 'alert' }, replay.error)),
          h('footer', null, h('span', { className: 'ww-ws-hint' }, '照上次的做法直接交给功能项，不经过小鲸，不花 token。'),
            h('div', { className: 'ww-ws-bar' }, h('button', { type: 'button', className: 'ww-primary', disabled: !replay.files.length, onClick: () => void startReplay() }, replay.files.length ? `开始（${replay.files.length} 个文件）` : '开始'), h('button', { type: 'button', className: 'ww-chip', onClick: () => setReplay(null) }, '取消'))))),
      drawer && h(React.Fragment, null, h('div', { className: 'ww-ws-scrim', onClick: () => setDrawer(null) }),
        h('aside', { className: 'ww-ws-drawer', role: 'dialog', 'aria-label': `调整 ${titleOf(drawer.turn.steps[drawer.index].tool)}` },
          h('header', null, h('b', null, `调整：${titleOf(drawer.turn.steps[drawer.index].tool)}`), h('button', { type: 'button', className: 'ww-chip', onClick: () => setDrawer(null) }, '关闭')),
          h('div', { className: 'body' }, modelFunctions[drawer.turn.steps[drawer.index].tool].options.map(([key, text]) => h('label', { key }, h('span', null, key), h('input', { value: drawer.values[key] ?? '', onChange: event => setDrawer(previous => ({ ...previous, values: { ...previous.values, [key]: event.target.value } })) }), h('small', null, text)))),
          h('footer', null, h('span', { className: 'ww-ws-hint' }, '自己调的步骤直接交给功能项重做，后面用到它的步骤跟着重做；不经过小鲸，不花 token。'),
            h('div', { className: 'ww-ws-bar' }, h('button', { type: 'button', className: 'ww-primary', onClick: () => {
              const options = {};
              for (const [key, raw] of Object.entries(drawer.values)) {
                const text = String(raw).trim();
                if (!text) continue;
                try { options[key] = /^[[{]/.test(text) ? JSON.parse(text) : text === 'true' || text === 'false' ? text === 'true' : text; } catch { options[key] = text; }
              }
              const { turn, index } = drawer; setDrawer(null); void rerun(turn, index, options);
            } }, '按这个重做'), h('button', { type: 'button', className: 'ww-chip', onClick: () => setDrawer(null) }, '取消'))))),
      region && regionFile && h(React.Fragment, null, h('div', { className: 'ww-ws-scrim', onClick: () => setRegion(null) }),
        h('aside', { className: 'ww-ws-drawer', role: 'dialog', 'aria-label': '框出要处理的位置' },
          h('header', null, h('b', null, '框出要处理的位置'), h('button', { type: 'button', className: 'ww-chip', onClick: () => setRegion(null) }, '关闭')),
          h('div', { className: 'body' }, h(RegionPicker, { file: regionFile, value: region.value, onChange: value => setRegion(previous => ({ ...previous, value })) })),
          h('footer', null, h('div', { className: 'ww-ws-bar' }, h('button', { type: 'button', className: 'ww-primary', disabled: !(region.value.width > 0 && region.value.height > 0), onClick: () => {
            const { turn, value } = region; const needs = turn.needs; needs.done = true; setRegion(null);
            followUp(turn, `框好了第 ${needs.step} 步要处理的位置：x=${value.x}, y=${value.y}, width=${value.width}, height=${value.height}（原图像素）。接着做。`);
          } }, '框好了，继续'), h('button', { type: 'button', className: 'ww-chip', onClick: () => setRegion(null) }, '取消'))))),
      toast && h('div', { className: 'ww-ws-toast ww-ws-bar', role: 'status' }, h('span', null, toast.text), toast.action && h('button', { type: 'button', className: 'ww-chip', onClick: () => { const { run } = toast.action; setToast(null); Promise.resolve().then(run).catch(error => say(`打不开：${error?.message || '文件位置不可用'}`)); } }, toast.action.label)));
  }
  return WorkshopView;
}
