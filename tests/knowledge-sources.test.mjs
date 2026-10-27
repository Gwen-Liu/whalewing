import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { managementHarness } from './assistant-management-fixture.mjs';
import { conversationText, schedulePrefix } from '../src/service.js';

const user = (seq, text, kind) => ({ seq, type: 'user/message', data: { source: { kind }, content: [{ type: 'text', text }] } });
const assistant = seq => ({ seq, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '回答' }] } } });

test('鲸翼注入的上下文都不算员工原话，也不打断定时整理的省略区间', () => {
  const events = [user(0, '员工原话', 'user'), user(1, '插件管理上下文', 'whalewing-plugin-management'), assistant(2), user(3, schedulePrefix + '开始整理', 'schedule'), user(4, '插件管理上下文', 'whalewing-plugin-management'), assistant(5), user(6, '员工后续补充', 'user')];
  assert.deepEqual([...conversationText(events).keys()], [0, 2, 6]);
});

test('小鲸插件管理上下文写进会话后，知识沉淀只取员工原话', { timeout: 15000 }, async t => {
  const h = await managementHarness(t);
  assert.equal((await h.run({ expertId: 'manager' })).result.kind, 'success');
  const idle = new Promise(resolve => {
    const stop = h.ctx.on('agent/status', ({ agent, status }) => { if (agent === h.agent && status === 'idle') { stop(); resolve(); } });
  });
  h.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '帮我看看插件开关' }] }));
  await idle;
  const events = h.agent.session.snapshotEvents();
  // 前提：管理上下文（含安装目录）确实以 user 载体落进了会话日志。
  const injected = events.filter(event => event.type === 'user/message' && event.data.source?.kind === 'whalewing-plugin-management');
  assert.equal(injected.length, 1);
  assert.match(injected[0].data.content[0].text, /当前安装包目录/);
  const texts = [...conversationText(events).values()].map(event => event.text);
  assert.ok(texts.includes('帮我看看插件开关'));
  assert.ok(texts.every(text => !text.includes('当前安装包目录') && !text.includes('鲸翼插件管理上下文')));
});
