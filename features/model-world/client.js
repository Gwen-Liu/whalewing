import { modelWorldContract } from './contract.js';
import { registerFeature, createDeferredView } from '../../src/shell/feature.js';
/** 模型世界沿用独立视图，搜索、排序及详情仍由该视图负责。 */
export function createView({ React, loadChunk }) {
  return createDeferredView(React, () => loadChunk('./client.model-world.js'), module => {
    // 查看大图时才按立绘 id 拉对应的 4K 原图分块；id 只来自视图里批准的立绘名单。
    const ModelWorldView = module.createView(React, { loadLarge: id => /^[a-z][a-z0-9-]*$/.test(id) ? loadChunk(`./client.portrait-${id}.js`).then(chunk => chunk.source) : Promise.reject(new Error('立绘编号无效')) });
    return function ModelWorldFeature({ workbench }) {
      // 现有中英词条均来自视图自己的同一份文案，随资源加载，不再将视图拖进根包。
      return React.createElement(ModelWorldView, { api: workbench.internal.clients['model-world'], notify: workbench.notify });
    };
  }, '模型世界');
}

export const name = 'whalewing-model-world';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'model-world', createView, { contract: modelWorldContract, namespace: 'whalewingModelWorld' }); }
