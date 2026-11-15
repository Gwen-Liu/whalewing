import { registerFeature, createDeferredView } from '../../src/shell/feature.js';
import { toolboxContract, toolboxNamespace } from './contract.js';

/** 转换任务和结果由办公工坊视图持有，切换只停止在途操作，不丢结果。 */
export function createView({ React, loadChunk, Glyph }) {
  // Office 转 PDF 要经主机：页面和全部功能项共用这一份，连上主机后才有。
  const services = {};
  return createDeferredView(React, () => loadChunk('./client.toolbox.js'), module => {
    const { WorkshopView } = module.createViews(React, services);
    return function ToolboxFeature({ active, workbench }) {
      const api = workbench?.internal?.clients?.toolbox;
      services.officePdf = api?.officePdf;
      services.officeConvert = api?.officeConvert;
      // 功能项窗口收起或员工在别的页签时做好了：用外壳右上角的提示、切回办公工坊、页签上标点（2026-11-14 方案 A）。
      const host = { notify: workbench?.notify, openPage: () => workbench?.openTab?.('toolbox'), setAttention: workbench?.setAttention };
      return React.createElement(WorkshopView, { key: 'toolbox', active, Glyph, api, host });
    };
  }, '办公工坊');
}

export const name = 'whalewing-toolbox';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'toolbox', createView, { contract: toolboxContract, namespace: toolboxNamespace, entries: (scope, _kit, client) => client?.follow?.(scope) }); }
