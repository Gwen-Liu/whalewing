/**
 * 模型世界只收录有角色立绘的常见厂商；顺序即图鉴顺序。Host 按此过滤快照，构建按此注入缩略图。
 * id 与 models.dev 规范模型 id 的厂商前缀一致；providers 是 models.dev 里该厂商官方渠道的 provider id，价格只取这些渠道。
 */
export const modelWorldVendors = Object.freeze([
  ['openai', 'OpenAI', 'OpenAI', 'https://openai.com', ['openai']],
  ['anthropic', 'Anthropic', 'Anthropic', 'https://anthropic.com', ['anthropic']],
  ['google', 'Google', '谷歌', 'https://deepmind.google', ['google']],
  ['deepseek', 'DeepSeek', '深度求索', 'https://deepseek.com', ['deepseek']],
  ['alibaba', 'Alibaba', '阿里通义', 'https://qwen.ai', ['alibaba']],
  ['moonshotai', 'Moonshot AI', '月之暗面', 'https://moonshot.cn', ['moonshotai']],
  ['zhipuai', 'Zhipu AI', '智谱', 'https://z.ai', ['zhipuai']],
  ['bytedance-seed', 'ByteDance Seed', '字节豆包', 'https://volcengine.com', ['volcengine']],
  ['minimax', 'MiniMax', 'MiniMax', 'https://minimax.io', ['minimax']],
  ['tencent', 'Tencent', '腾讯混元', 'https://hunyuan.tencent.com', ['tencent-tokenhub']],
  ['baidu', 'Baidu', '百度文心', 'https://yiyan.baidu.com', []],
  ['xiaomi', 'Xiaomi', '小米', 'https://xiaomi.com', ['xiaomi']],
  ['meituan', 'Meituan', '美团龙猫', 'https://longcat.chat', ['longcat']],
  ['stepfun', 'StepFun', '阶跃星辰', 'https://stepfun.com', ['stepfun']],
  ['xai', 'xAI', 'xAI', 'https://x.ai', ['xai']],
  ['meta', 'Meta', 'Meta', 'https://ai.meta.com', ['meta']],
  ['mistral', 'Mistral', 'Mistral', 'https://mistral.ai', ['mistral']],
  ['perplexity', 'Perplexity', 'Perplexity', 'https://perplexity.ai', ['perplexity']],
].map(([id, name, nameZh, homepage, providers]) => Object.freeze({ id, name, nameZh, homepage, providers: Object.freeze(providers) })));
export const modelWorldVendorIds = Object.freeze(modelWorldVendors.map(vendor => vendor.id));

/** 同一厂商的不同系列使用不同形象：DeepSeek Flash 是“小飞鱼妹妹”，其余型号是“大飞鱼姐姐”。 */
export const modelWorldVariants = Object.freeze([
  Object.freeze({ id: 'deepseek-flash', vendorId: 'deepseek', pattern: 'flash' }),
]);

/** 每个立绘的 id：厂商主形象用厂商 id，系列形象用变体 id。 */
export const modelWorldPortraitIds = Object.freeze([...modelWorldVendorIds, ...modelWorldVariants.map(variant => variant.id)]);

/** 按型号选择立绘 id：命中系列关键词用系列形象，否则用厂商主形象。 */
export function portraitIdFor(vendorId, modelId = '') {
  const variant = modelWorldVariants.find(item => item.vendorId === vendorId && modelId.toLowerCase().includes(item.pattern));
  return variant ? variant.id : vendorId;
}
