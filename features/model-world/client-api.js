import { modelWorldContract } from './contract.js';
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createModelWorldClient(bridge, t, z) {
    const { featureRemote, unwrap, failure } = bridge;
    const worldSchema = modelWorldContract(z);
    const worldRequest = async (input, signal) => {
      const parsed = worldSchema.input.parse(input);
      signal?.throwIfAborted();
      const result = worldSchema.result.safeParse(unwrap(await featureRemote('whalewingModelWorld').manageModelWorld(parsed, signal)));
      if (!result.success || result.data.action !== input.action) throw failure(t('badReply'), 'bad_reply');
      const value = result.data;
      if (value.available && (input.action === 'detail' && value.model.id !== input.id || input.action === 'compare' && (value.models.length !== input.ids.length || new Set(value.models.map(model => model.id)).size !== input.ids.length || value.models.some(model => !input.ids.includes(model.id))))) throw failure(t('badReply'), 'bad_reply');
      if (Object.hasOwn(value, 'offset') && (value.offset !== (input.offset ?? 0) || input.limit !== undefined && value.limit !== input.limit)) throw failure(t('badReply'), 'bad_reply');
      return value;
    };

    // 我的模型、用量和模型测智：读 DSH 的模型目录和会话用量，员工确认后才改默认模型。
    const deskRequest = async (input, signal) => {
      const parsed = worldSchema.desk.input.parse(input);
      signal?.throwIfAborted();
      const result = worldSchema.desk.result.safeParse(unwrap(await featureRemote('whalewingModelWorld').manageModelDesk(parsed, signal)));
      if (!result.success || result.data.action !== input.action) throw failure(t('badReply'), 'bad_reply');
      return result.data;
    };
    /** 用指定模型开一个新对话：DSH 新建会话，只给这个会话选好模型（不动默认模型），再跳过去等员工发第一句。 */
    const openChat = async (target, signal) => {
      const created = await bridge.createBoundSession({}, {}, signal);
      try { await deskRequest({ action: 'selectModel', sessionId: created.sessionId, ...target }, signal); }
      catch (error) { error.sessionId = created.sessionId; throw error; }
      bridge.open(created.sessionId);
      return created.sessionId;
    };

  return {
    worldRequest, deskRequest, openChat, openSession: id => bridge.open(id),
  };
}
