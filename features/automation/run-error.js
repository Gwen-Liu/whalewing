/**
 * 定时任务出错时给员工看的话：原因 + 怎么办（2026-11-18 走查：原来只写“出错”两个字）。
 * 输入是 runs.js 从会话日志里记下的 { code, message, status }：code 是 DSH 模型层的错误码
 * （见 @deepseek-ai/dsh-llm 的 LLM_FAILURE_CODES），没归类的 HTTP 错误是 HTTP_<状态码>。
 * 返回 { reason, fix, detail }；detail 是接口原文，放在后面给需要的人核对。
 */
const rules = [
  [/^(QUOTA|ACCOUNT_QUOTA|HTTP_402)$/, '模型的余额或额度用完了', '给这条模型渠道充值，或者打开原会话换一个模型，再把任务那条消息重发一次'],
  [/^(MISSING_CREDENTIAL|INVALID_CREDENTIAL|HTTP_401|HTTP_403)$/, '模型的 key 没配好，或者已经失效', '在 DSH 设置的“模型”里检查这条渠道的 key，改好后打开原会话重发'],
  [/^(RATE_LIMIT|HTTP_429)$/, '请求太频繁，被模型服务限流了', '一般下一次会正常；急用的话打开原会话重发'],
  [/^CONTEXT_WINDOW_EXCEEDED$/, '任务会话太长，超过了模型一次能看的长度', '打开原会话压缩一下上下文；还不行就取消这个任务再新建一个'],
  [/^(UNKNOWN_MODEL|MODEL_UNSUPPORTED|NO_ADAPTER)$/, '任务用的模型找不到了（可能在 DSH 里删掉或改名了）', '打开原会话换一个能用的模型'],
  [/^(TIMEOUT|TRANSPORT|STREAM_CLOSED)$/, '连模型服务时网络断了或超时', '多半是临时问题，下一次会照常跑；急用的话打开原会话重发'],
  [/^(SERVER|HTTP_5\d\d)$/, '模型服务那边出错了', '多半是服务商临时故障，下一次会照常跑；一直这样就换个模型'],
  [/^(EMPTY_RESPONSE|MALFORMED_RESPONSE|INVALID_RESPONSE)$/, '模型没有给出能用的回复', '下一次会照常跑；经常这样就换个模型'],
  [/^TOOL_ACTIVATION_FAILED$/, '任务要用的某个工具没能启用', '打开原会话看是哪个工具，检查对应的插件有没有开着'],
];

export function runErrorText(error) {
  if (!error || typeof error.code !== 'string') return { reason: '那一轮没能跑完，DSH 没有留下原因', fix: '打开原会话看看最后一条消息', detail: '' };
  const code = error.code.toUpperCase(), message = typeof error.message === 'string' ? error.message : '';
  const hit = rules.find(([pattern]) => pattern.test(code));
  const detail = [message, error.status && !message.includes(String(error.status)) ? `HTTP ${error.status}` : '', code].filter(Boolean).join(' · ');
  if (hit) return { reason: hit[1], fix: hit[2], detail };
  return { reason: message ? `出错了：${message}` : '那一轮出错结束了', fix: '打开原会话看看最后一条消息，改好后重发', detail: message ? code : detail };
}
