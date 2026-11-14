/**
 * 鲸翼只给程序用的 DSH 命令：index.js 的 `whalewing`（挂工作区等）、专家的 `whalewing-expert`（记这段会话选了哪位专家）、
 * 小鲸派工的 `whalewing-dispatch`、办公工坊的 `whalewing-toolbox-job`。DSH 会把命令当成“运行了命令”画在对话里，
 * 露出一行 JSON，外壳按这份名单登记空视图，对话里不画。新加内部命令要加进来，tests/client.test.mjs 会核对。
 */
export const internalCommands = Object.freeze(['whalewing', 'whalewing-expert', 'whalewing-dispatch', 'whalewing-toolbox-job']);
