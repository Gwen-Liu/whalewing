import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryLines, memoryText, expertSessions } from '../features/experts/detail.js';

test('记忆文本框一行一条：去掉空行和行首的“- ”，日期留着', () => {
  assert.deepEqual(memoryLines('- 2026-11-08 用 pnpm\n\n  不加署名  \n-  先说结论'), ['2026-11-08 用 pnpm', '不加署名', '先说结论']);
  assert.equal(memoryText(['2026-11-08 用 pnpm', '- 不加署名']), '2026-11-08 用 pnpm\n不加署名');
});

test('最近的任务只列这位专家的普通任务，不含定时任务和子代理，新的在前', () => {
  const byId = {
    a: { sessionId: 'a', updatedAt: 1, projectionValues: { whalewingExpert: { expertId: 'research' } } },
    b: { sessionId: 'b', updatedAt: 3, projectionValues: { whalewingExpert: { expertId: 'research' } } },
    c: { sessionId: 'c', updatedAt: 5, projectionValues: { whalewingExpert: { expertId: 'research' }, whalewingAutomation: 'custom' } },
    d: { sessionId: 'd', updatedAt: 6, parentSessionId: 'b', projectionValues: { whalewingExpert: { expertId: 'research' } } },
    e: { sessionId: 'e', updatedAt: 7, projectionValues: { whalewingExpert: { expertId: 'writing' } } },
  };
  assert.deepEqual(expertSessions({ byId }, 'research').map(item => item.sessionId), ['b', 'a']);
  assert.deepEqual(expertSessions({ byId }, 'research', 1).map(item => item.sessionId), ['b']);
  assert.deepEqual(expertSessions(undefined, 'research'), []);
});
