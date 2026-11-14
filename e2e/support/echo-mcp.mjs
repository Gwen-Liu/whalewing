// 最小的本机 MCP 服务（stdio，按行 JSON-RPC）：只有一个 echo 工具，用来在临时 DSH 里验证鲸翼能挂上 MCP。
import readline from 'node:readline';
const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
readline.createInterface({ input: process.stdin }).on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id === undefined) return;
  if (message.method === 'initialize') return send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'echo-test', version: '1.0.0' } } });
  if (message.method === 'tools/list') return send({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'echo', description: `回声（TOKEN=${process.env.TOKEN ? '已给' : '没给'}）`, inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }] } });
  if (message.method === 'tools/call') return send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: String(message.params?.arguments?.text ?? '') }] } });
  if (message.method === 'ping') return send({ jsonrpc: '2.0', id: message.id, result: {} });
  send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'not found' } });
});
