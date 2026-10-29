import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { loadModelWorldPortraits, modelWorldPortraitFiles, largePortraitChunk, loadLargePortrait } from '../../src/model-world-portraits.js';
import { modelWorldPortraitIds } from '../../src/model-world-roster.js';

/** 模型视图与立绘只进入按需分块，数据和立绘的独立许可随资源一起保留。 */
export function buildModelWorld() {
  const views = buildSync({
    absWorkingDir: fileURLToPath(new URL('../../', import.meta.url)), entryPoints: ['src/model-world-view.js'],
    bundle: true, platform: 'browser', format: 'iife', globalName: 'modelViews',
    target: 'es2022', minify: true, write: false, metafile: true,
  });
  const source = `window.__ModuleLoader__.load({ id: 'dsh-whalewing', chunk: 'client.model-world.js', factory: (require) => {\n${views.outputFiles[0].text}\nconst portraits = ${JSON.stringify(loadModelWorldPortraits())};\nreturn { createView: (React, options) => modelViews.createModelWorldView(React, portraits, options) };\n} });\n`;
  // 4K 原图每张一个分块：只有员工点开查看那一张时才下载，不拖慢模型世界首屏。
  const large = Object.fromEntries(modelWorldPortraitIds.map(id => [largePortraitChunk(id), '/*! 立绘 © 鲸翼 WhaleWing，依 CC BY-NC-SA 4.0 授权，商用需先取得作者授权；见 content/model-world/portraits/NOTICE.md */\n'
    + `window.__ModuleLoader__.load({ id: 'dsh-whalewing', chunk: ${JSON.stringify(largePortraitChunk(id))}, factory: () => ({ source: ${JSON.stringify(loadLargePortrait(id))} }) });\n`]));
  return { feature: 'model-world', artifacts: { 'client.model-world.js': source, ...large }, metafiles: [views.metafile], resources: [
    ...Object.values(modelWorldPortraitFiles).map(file => `content/model-world/portraits/${file}`),
    'content/model-world/portraits/NOTICE.md', 'content/model-world/NOTICE.md', 'content/model-world/LICENSE-models-dev.txt',
  ] };
}
