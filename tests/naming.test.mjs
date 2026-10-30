import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// 2026-10-27 用户：鲸翼是全新项目，早期开发时用过的名字和样式前缀一律不留，统一用鲸翼（2026-10-30 用户重申：鲸翼没有前身）。
// 这些名字本身不写进测试：按字符码拼出来，免得这份测试自己成了残留。
const legacy = [[121, 106, 45], [121, 111, 117, 106, 105, 110], [0x53cb, 0x91d1]].map(codes => String.fromCharCode(...codes));
const root = new URL('../../../', import.meta.url);

test('仓库里没有早期开发时用过的名字和样式前缀，样式统一用 ww- 前缀', () => {
  const files = execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
    .filter(file => !/\.(webp|png|jpg|otf|ttf|ico|pdf|tgz|zip|pfb)$/i.test(file));
  const found = [];
  for (const file of files) {
    let text; try { text = readFileSync(new URL(file, root), 'utf8'); } catch { continue; }
    text.split('\n').forEach((line, index) => {
      // 超长的行是内嵌数据（字体、base64），里面偶然拼出的字母不算。
      if (line.length > 4000) return;
      if (new RegExp('(?<![A-Za-z0-9_])' + legacy[0]).test(line) || line.toLowerCase().includes(legacy[1]) || line.includes(legacy[2])) found.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(found, []);
});
