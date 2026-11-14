import { Service } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { abort, fail } from '../../src/vault.js';
import { registerBuiltin } from '../../src/features.js';
import path from 'node:path';
import { ModelWorld } from './model-world.js';
import { ModelDesk } from './desk.js';
import { credentialIndexKey, fetchIndexPage } from './index-key.js';
import { modelWorldVendorIds } from '../../src/model-world-roster.js';
import { modelWorldContract, worldLimits, deskLimits } from './contract.js';
import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http';

const contract = modelWorldContract(z);
export default class ModelWorldHost extends Service {
  static inject = ["whalewing", "typert"];
  constructor(ctx) {
    super(ctx, 'whalewingModelWorld');
    registerBuiltin(ctx, 'model-world');
    this.host = ctx.whalewing;
    this.closing = new AbortController();
    this.pending = new Set();
    this.typertRemote = bindTypertRemote(this, 'whalewingModelWorld', { namespace: 'whalewingModelWorld' });
    ctx.typert.register(contract.host);
    // 用量从装上起逐次记：会话每收到一条模型回复就记一笔。账本还没读好时先排队，读好后补进去。
    this.desk = null; this.deskOpening = null; this.early = [];
    ctx.on('session/event', (session, event) => {
      if (this.desk) this.desk.observe(session, event);
      else if (event?.type === 'request/header' || event?.type === 'request/context' || event?.type === 'assistant/message') { if (this.early.length < 2000) this.early.push([session, event]); this.openDesk().catch(() => {}); }
    });

    ctx.effect(() => async () => {
      this.closing.abort(new Error('功能已卸载，当前操作停止'));
      await Promise.allSettled([...this.pending]);
      await this.modelWorld?.dispose();
      await this.desk?.dispose();
    });
  }
  /** 账本和测智记录放在 profile 目录下，不放缓存目录：缓存可以随时清，这些清了就没了。 */
  openDesk(signal) {
    return this.deskOpening ??= (async () => {
      const directory = await this.host.profileDirectory(signal ?? this.closing.signal);
      const desk = new ModelDesk({
        root: path.join(directory, 'whalewing-model-world'), stored: contract.desk.stored,
        // DSH 的服务每次现取：重载相关插件后不留旧引用。
        services: () => ({ sessionController: this.ctx.get('sessionController'), agentDefaultModel: this.ctx.get('agentDefaultModel'), llm: this.ctx.get('llm'), settings: this.ctx.get('settings') }),
      });
      await desk.load();
      for (const [session, event] of this.early.splice(0)) desk.observe(session, event);
      return this.desk = desk;
    })().catch(error => { this.deskOpening = null; throw error; });
  }
  async manageModelDesk(raw, signal) {
    try {
      const input = contract.desk.input.parse(raw);
      signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(input.action === 'probe' ? deskLimits.probeMs : worldLimits.operationMs), ...(signal ? [signal] : [])]);
      abort(signal);
      const operation = (async () => (await this.openDesk(signal)).execute(input, signal))();
      this.pending.add(operation);
      try { return contract.desk.result.parse({ action: input.action, ...await operation }); } finally { this.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }
  async manageModelWorld(raw, signal) {
    try {
      const input = contract.input.parse(raw);
      signal = AbortSignal.any([this.closing.signal, AbortSignal.timeout(worldLimits.operationMs), ...(signal ? [signal] : [])]);
      abort(signal);
      const operation = (async () => {
        if (!this.modelWorld) {
          const directory = await this.host.profileDirectory(signal);
          abort(this.closing.signal);
          this.modelWorld ??= new ModelWorld({
            root: path.join(directory, 'cache', 'whalewing-model-world'), vendorIds: modelWorldVendorIds,
            fetcher: new HttpFetchProvider({ maxResponseBytes: worldLimits.responseBytes, maxBodyChars: worldLimits.responseBytes, timeoutMs: 30000, maxRedirects: 0, userAgent: 'whalewing/0.1.0 ModelWorld' }),
            // 凭据服务每次现取：DSH 重载凭据插件后不留旧引用。
            indexKey: credentialIndexKey(() => this.ctx.get('credentials')), indexFetch: fetchIndexPage,
          });
        }
        return this.modelWorld.execute(input, signal);
      })();
      this.pending.add(operation);
      try { return contract.result.parse(await operation); } finally { this.pending.delete(operation); }
    } catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }

}
