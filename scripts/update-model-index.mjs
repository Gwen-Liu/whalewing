import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchAaIndex } from '../src/model-world-aa.js';

/**
 * 从 Artificial Analysis 免费接口拉取智能指数，生成随插件发布的 src/model-world-index-data.js。
 * 用法：设置用户环境变量 WHALEWING_AA_API_KEY 后运行 node scripts/update-model-index.mjs。免费版每天 100 次请求，一次更新约 4 次。
 * Key 只在本脚本内使用，不写入生成文件、仓库或插件安装包。整理规则与插件内在线更新共用 src/model-world-aa.js。
 */
const target = fileURLToPath(new URL('../src/model-world-index-data.js', import.meta.url));

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const key = process.env.WHALEWING_AA_API_KEY;
  if (!key) throw new Error('缺少环境变量 WHALEWING_AA_API_KEY');
  const { rows, version, count } = await fetchAaIndex(async url => {
    const response = await fetch(url, { headers: { 'x-api-key': key }, redirect: 'error' });
    return { statusCode: response.status, content: await response.text() };
  });
  const asOf = new Date().toISOString().slice(0, 10);
  const lines = rows.map(row => `  [${row.slice(0, 3).map(value => JSON.stringify(value)).join(', ')}, ${JSON.stringify(row[3])}],`);
  await writeFile(target, `// 生成来源：scripts/update-model-index.mjs（Artificial Analysis 免费接口）；请重新运行脚本更新，不要手改。\n`
    + `export const worldIndexAsOf = ${JSON.stringify(asOf)};\nexport const worldIndexVersion = ${JSON.stringify(version)};\n`
    + `// [厂商 id, 名称, 发布日期, [[思考强度, 智能指数, 单次任务美元成本], ...]]\nexport const worldIndexRows = [\n${lines.join('\n')}\n];\n`, 'utf8');
  process.stdout.write(`已从 ${count} 条记录生成 ${rows.length} 个模型（指数 v${version}，${asOf}）\n`);
}
