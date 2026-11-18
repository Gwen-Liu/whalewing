/**
 * 读 DSH 模型设置里每条渠道的配置——就是 DSH 设置“模型”页编辑的那一份（接口地址、协议、key 的名字、自定义请求头）。
 * DSH 的设置服务（dsh-settings）没有按名字取一节的 get，只有 describe()：每个插件一项，value 是它能在设置页改的配置；
 * 渠道在哪一节、哪条路径由 llm.listConfigurableProviders() 给出（pi-ai 渠道是 llm-pi-ai 一节的 providers.<渠道名>）。
 * 2026-11-17 做生图时发现：原来模型世界用 settings.get 读，一直是空的，员工自己加的中转渠道认不出是转发站。
 * 只在 Host 里用。生图要带渠道的请求头，读原值；只看地址的地方传 redactSecrets，标成机密的字段读回来是打码的。
 */

const fallbackNs = 'llm-pi-ai';

/** 所有渠道的配置：Map<渠道名, 配置对象>。读不到的渠道不在里面。 */
export function providerProfiles({ llm, settings } = {}, { redactSecrets = false } = {}) {
  const out = new Map();
  let sections = [];
  try { sections = settings?.describe?.(redactSecrets ? { redactSecrets: true } : undefined) ?? []; } catch { return out; }
  const valueOf = ns => sections.find(item => item?.ns === ns)?.value;
  let directory = [];
  try { directory = llm?.listConfigurableProviders?.() ?? []; } catch { directory = []; }
  const walk = (ns, keys) => {
    let section = valueOf(ns);
    for (const key of keys) section = section?.[key];
    return section && typeof section === 'object' && !Array.isArray(section) ? section : null;
  };
  for (const item of directory) {
    if (!item?.provider) continue;
    const profile = walk(item.settingsNs ?? fallbackNs, item.settingsPath ?? ['providers', item.provider]);
    if (profile) out.set(item.provider, profile);
  }
  // 列不出渠道目录时，至少把 pi-ai 一节里写了的渠道读出来。
  for (const [id, profile] of Object.entries(valueOf(fallbackNs)?.providers ?? {})) if (!out.has(id) && profile && typeof profile === 'object') out.set(id, profile);
  return out;
}

/** 一条渠道的配置，读不到返回 {}。 */
export const providerProfile = (services, provider, options) => providerProfiles(services, options).get(provider) ?? {};
