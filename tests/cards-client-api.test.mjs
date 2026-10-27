import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createCardsClient } from '../features/cards/client-api.js';

// 只换掉远端调用：回复照样经过契约与动作核对，确认坏回复按 bad_reply 拒收。
const client = reply => createCardsClient({
  featureRemote: () => ({ manageNews: async () => reply, manageLibrary: async () => reply }),
  unwrap: value => value,
  failure: (message, code) => Object.assign(new Error(message), { code }),
}, key => key, z, { openAutomation: () => {} });

test('技巧日期索引：回复的领域与请求不一致时按坏回复拒收，一致时原样返回', async () => {
  const days = [{ date: '2026-10-25', cutoff: '2026-10-25T00:00:00.000Z', count: 3, status: 'complete' }];
  const ok = await client({ fieldId: 'ai-tips', first: '2026-10-25', days }).newsRequest({ action: 'days', fieldId: 'ai-tips' });
  assert.deepEqual(ok.days, days);
  await assert.rejects(client({ fieldId: 'ai-technology', first: '2026-10-25', days }).newsRequest({ action: 'days', fieldId: 'ai-tips' }), { code: 'bad_reply' });
  await assert.rejects(client({ reports: [], nextBefore: null }).newsRequest({ action: 'days', fieldId: 'ai-tips' }), { code: 'bad_reply' }, '回复种类与动作对不上');
});

test('技巧翻页截点只收时间格式，before 与 after 不能同时给', async () => {
  const api = client({ reports: [], nextBefore: null });
  await assert.rejects(api.newsRequest({ action: 'reports', fieldId: 'ai-tips', before: '上个月' }));
  await assert.rejects(api.newsRequest({ action: 'reports', fieldId: 'ai-tips', before: '2026-10-01T00:00:00.000Z', after: '2026-09-01T00:00:00.000Z' }));
  assert.deepEqual((await api.newsRequest({ action: 'reports', fieldId: 'ai-tips', after: '2026-09-01T00:00:00Z' })).reports, []);
});

test('常看书籍整组替换的回复必须带书架', async () => {
  const library = { groups: [], books: [] };
  assert.deepEqual((await client({ library }).libraryRequest({ action: 'pins', ids: [], expected: [] })).library, library);
  await assert.rejects(client({ cancelled: true }).libraryRequest({ action: 'pins', ids: [], expected: [] }), { code: 'bad_reply' });
});
