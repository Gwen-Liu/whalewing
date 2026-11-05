/** 登记快照与订阅共用同一严格结构，不把宿主fiber或路径缓存当作独立身份。 */
export function workbenchContract(z) {
  const feature = z.strictObject({
    id: z.string(), kind: z.enum(['base', 'optional', 'extension']), api: z.literal(1), package: z.string(), skills: z.array(z.string()),
    tab: z.strictObject({ placement: z.literal('end').optional(), keepAlive: z.literal(true).optional(), icon: z.string().optional() }).optional(), error: z.string().optional(),
    instance: z.number().int().positive().optional(),
  }).refine(value => value.instance !== undefined || value.kind === 'base' && Boolean(value.error), '活动功能必须带有本轮登记实例');
  // assistant：扩展给小鲸起的名字和是哪个扩展起的；没有扩展起名时不带。
  const assistant = z.strictObject({ name: z.string(), feature: z.string(), package: z.string(), label: z.strictObject({ zh: z.string(), en: z.string() }).optional() });
  const snapshot = z.strictObject({ revision: z.number().int().min(0), features: z.array(feature), assistant: assistant.optional() });
  // 检查更新的结果：latest 已是最新、available 有新版本、needs-dsh 新版本要先升级 DSH、local 从本机目录装的不在这里更新、failed 安装源都没问到。
  const update = z.strictObject({
    status: z.enum(['latest', 'available', 'needs-dsh', 'local', 'failed']), current: z.string(), runtimeVersion: z.string(),
    registry: z.string().optional(), asked: z.array(z.string()).optional(), version: z.string().optional(), requires: z.string().optional(),
    tarball: z.string().optional(), fallbacks: z.array(z.string()).optional(), releaseUrl: z.string().optional(), publishedAt: z.string().optional(), reason: z.string().optional(),
  });
  const packageName = 'dsh-whalewing';
  const descriptors = ['features', 'watchFeatures', 'retryBase', 'checkUpdate'].map(method => ({
    id: `${packageName}#whalewingWorkbench/${method}`, service: 'whalewing', namespace: 'whalewingWorkbench', method, invocation: { kind: 'direct' },
    ...(method === 'watchFeatures' ? { mode: 'stream' } : {}),
    parameters: method === 'retryBase' ? [{ name: 'id', wire: 'id', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#FeatureId`, create: () => z.string().min(1).max(80) } }] : [],
    ...(method === 'watchFeatures' ? { cancellation: { parameter: 'signal' } } : {}),
    result: method === 'checkUpdate' ? { mode: 'strict', typeSymbol: `${packageName}#UpdateCheck`, create: () => update } : { mode: 'strict', typeSymbol: `${packageName}#Features`, create: () => snapshot },
  }));
  return { snapshot, update, host: { package: packageName, face: 'host', schemas: [], invocations: descriptors, model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors } };
}
