/**
 * 国产模型的官网人民币标价（元 / 百万 tokens）。海外模型继续用公开目录里的美元价。
 * 只收录在厂商官方价格页核对过、按 token 计价的模型；没收录的国产模型不显示价格，不拿美元价换算冒充官网价。
 * 官网已不再列出的旧型号（已下线或停售）、只开放权重不提供 API 的型号、按张 / 按秒 / 按字符计价的图像视频语音模型都不收录。
 * 有阶梯价的取最低一档并标“起”；限时折扣按原价记，官网只给限时价时照录并标“限时”。以后改由鲸翼服务端每天同步，这份表届时作为离线兜底。
 */
export const worldCnyPriceAsOf = '2026-10-22';

/** 走人民币标价的国产厂商 id，与模型世界名单一致。 */
export const worldDomesticVendors = Object.freeze(['deepseek', 'alibaba', 'moonshotai', 'zhipuai', 'bytedance-seed', 'minimax', 'tencent', 'baidu', 'xiaomi', 'meituan', 'stepfun']);

const sources = {
  deepseek: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
  moonshotai: 'https://platform.kimi.com/docs/pricing/chat',
  zhipuai: 'https://docs.bigmodel.cn/cn/guide/start/pricing',
  minimax: 'https://platform.minimaxi.com/docs/pricing/overview',
  stepfun: 'https://platform.stepfun.com/docs/zh/guides/pricing/details',
  alibaba: 'https://help.aliyun.com/zh/model-studio/model-pricing',
  'bytedance-seed': 'https://www.volcengine.com/docs/82379/1544106',
  tencent: 'https://cloud.tencent.com/document/product/1823/130055',
  xiaomi: 'https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go',
  meituan: 'https://longcat.chat/platform/docs/zh/pricing/longcat-2.0',
  baidu: 'https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya',
};
// 同一厂商不同型号的价格在不同页面时单独标出处。
const modelSources = {
  'meituan/longcat-2.5-preview': 'https://longcat.chat/platform/docs/zh/pricing/longcat-2.5',
};

// [输入（未命中缓存）, 缓存命中输入, 输出, 是否阶梯价, 是否仅有限时价]；null 表示官网未单列。
// 阿里云取中国内地部署价；DeepSeek 按北京时间工作日高峰时段记，空闲时段半价。
const table = {
  'deepseek/deepseek-v4.1-flash-1017': [2, 0.04, 8], 'deepseek/deepseek-v4.1-flash': [2, 0.04, 8],
  // 旧名 deepseek-v4-flash、deepseek-v4-flash-vision-exp 仍可调用，由 V4.1-Flash-1017 提供服务并按 Flash 价计费。
  'deepseek/deepseek-v4-flash': [2, 0.04, 8], 'deepseek/deepseek-v4-flash-vision-exp': [2, 0.04, 8],
  'deepseek/deepseek-v4-pro': [9, 0.3, 27], 'deepseek/deepseek-v4-pro-0813': [9, 0.3, 27],
  'moonshotai/kimi-k3': [20, 2, 100], 'moonshotai/kimi-k2.7-code': [6.5, 1.3, 27], 'moonshotai/kimi-k2.7-code-highspeed': [13, 2.6, 54], 'moonshotai/kimi-k2.6': [6.5, 1.1, 27],
  'zhipuai/glm-5.3': [8, 2, 28], 'zhipuai/glm-5.3-flash': [0.8, 0.23, 2.8], 'zhipuai/glm-5.3-flashx': [2, 0.57, 7], 'zhipuai/glm-5.2': [8, 2, 28],
  'zhipuai/glm-5.1': [6, 1.3, 24, true], 'zhipuai/glm-5-turbo': [5, 1.2, 22, true], 'zhipuai/glm-5': [4, 1, 18, true], 'zhipuai/glm-5v-turbo': [5, 1.2, 22, true],
  'zhipuai/glm-4.7': [2, 0.4, 8, true], 'zhipuai/glm-4.7-flashx': [0.5, 0.1, 3], 'zhipuai/glm-4.7-flash': [0, 0, 0],
  'zhipuai/glm-4.6v': [1, 0.2, 3, true], 'zhipuai/glm-4.6v-flash': [0, 0, 0], 'zhipuai/glm-4.5v': [2, 0.4, 6, true], 'zhipuai/glm-4.5-air': [0.8, 0.16, 2, true],
  'minimax/minimax-m3.1-flash': [1, 0.1, 4], 'minimax/minimax-m3': [2.1, 0.42, 8.4, true],
  'stepfun/step-5-preview': [7, 0.7, 20], 'stepfun/step-3.7-flash': [1.35, 0.27, 8.1], 'stepfun/step-3.5-flash': [0.7, 0.14, 2.1], 'stepfun/step-3.5-flash-2603': [0.7, 0.14, 2.1],
  'alibaba/qwen3.8-max': [12, null, 36], 'alibaba/qwen3.8-max-0902': [12, null, 36], 'alibaba/qwen3.7-max': [12, null, 36],
  'alibaba/qwen3.8-flash': [0.8, null, 2.7], 'alibaba/qwen3.8-27b': [3, null, 12], 'alibaba/qwen3.8-omni-flash': [0.8, 0.1, 2.7],
  'alibaba/qwen3.7-flash': [0.2, null, 0.8, true], 'alibaba/qwen3.7-plus': [2, null, 8, true],
  'alibaba/qwen3.6-plus': [2, null, 12, true], 'alibaba/qwen3.6-flash': [1.2, null, 7.2, true], 'alibaba/qwen3.6-27b': [3, null, 18, true], 'alibaba/qwen3.6-35b-a3b': [1.8, null, 10.8, true],
  'alibaba/qwen3.5-plus': [0.8, null, 4.8, true], 'alibaba/qwen3.5-flash': [0.2, null, 2, true], 'alibaba/qwen3.5-27b': [0.6, null, 4.8, true], 'alibaba/qwen3.5-35b-a3b': [0.4, null, 3.2, true],
  'alibaba/qwen3.5-122b-a10b': [0.8, null, 6.4, true], 'alibaba/qwen3.5-397b-a17b': [1.2, null, 7.2, true],
  // qwen-plus 非思考输出 2 元、思考输出 8 元，取低档并标“起”。
  'alibaba/qwen-max': [2.4, null, 9.6], 'alibaba/qwen-plus': [0.8, null, 2, true], 'alibaba/qwen-flash': [0.15, null, 1.5, true],
  'alibaba/qwen3-coder-flash': [1, null, 4, true], 'alibaba/qwen3-vl-plus': [1, null, 10, true], 'alibaba/qwen-mt-plus': [1.8, null, 5.4],
  'bytedance-seed/seed-evolving': [6, 1.2, 30], 'bytedance-seed/seed-2.1-pro': [6, 1.2, 30], 'bytedance-seed/seed-2.1-turbo': [3, 0.6, 15],
  'bytedance-seed/seed-2.0-pro': [3.2, 0.64, 16, true], 'bytedance-seed/seed-2.0-code': [3.2, 0.64, 16, true], 'bytedance-seed/seed-2.0-lite': [0.6, 0.12, 3.6, true],
  'bytedance-seed/seed-2.0-mini': [0.2, 0.04, 2, true], 'bytedance-seed/seed-character': [0.8, 0.16, 2],
  'tencent/hy4-preview': [6, 0.3, 18], 'tencent/hy3': [1, 0.25, 4],
  'xiaomi/mimo-v2.6-pro': [3, 0.025, 6], 'xiaomi/mimo-v2.6-flash': [1, 0.02, 2], 'xiaomi/mimo-v2.6-pro-ultraspeed': [30, 0.25, 60],
  // LongCat 官网只公布“平台初上线限时优惠”价，没有原价。
  'meituan/longcat-2.5-preview': [2, 0.04, 8, false, true], 'meituan/longcat-2.0': [2, 0.04, 8, false, true],
  'baidu/ernie-5-0-thinking-preview': [6, null, 24, true],
};

// models.dev 的型号 id 大小写会变（如 MiniMax 改成 MiniMax-M3），按小写对照，避免价格悄悄失配。
export const worldCnyPrices = Object.freeze(Object.fromEntries(Object.entries(table).map(([id, [inputPerMTok, cachedInputPerMTok, outputPerMTok, tiered = false, promotional = false]]) =>
  [id.toLowerCase(), Object.freeze({ inputPerMTok, cachedInputPerMTok, outputPerMTok, tiered, promotional, source: modelSources[id] ?? sources[id.split('/')[0]] })])));

export const isDomesticVendor = vendorId => worldDomesticVendors.includes(vendorId);
export const worldCnyPrice = modelId => worldCnyPrices[String(modelId).toLowerCase()] ?? null;

/** 价格文字：国产模型用官网人民币价（没收录返回 null），海外模型用目录美元价。 */
export function worldPriceText(model, key) {
  if (isDomesticVendor(model.vendorId)) {
    const entry = worldCnyPrice(model.id);
    const value = entry?.[key];
    if (typeof value !== 'number') return null;
    return value === 0 ? '免费' : `¥${value}${entry.tiered ? ' 起' : ''}${entry.promotional ? '（限时价）' : ''}`;
  }
  const value = model.pricing?.[key];
  return typeof value === 'number' ? `$${value}` : null;
}
