/**
 * 哪些型号是生图模型：Host 的生图工具和界面上的模型世界共用这一份，免得一处认得、一处不认得。
 * 只按名字认（DSH 的模型目录不标型号能做什么）；接口实际不支持时，生图请求会如实报错。
 * 2026-11-18 用户问“生图模型可能不止 GPT，配了别的也能接进来吗”：这里列常见的几家，
 * 新出的生图模型名字里大多带 image，也认得。
 */
const imagePattern = /gpt-image|chatgpt-image|dall-e|seedream|seededit|imagen|flux|cogview|wanx|wan2\.\d+-t2i|kolors|qwen-image|hunyuan-?image|recraft|ideogram|stable-diffusion|sdxl|sd3|midjourney|grok-2-image|grok-imagine|nano-banana|(^|[-_/.])image($|[-_/.])|(^|[-_/.])image-preview($|[-_/.])/i;

/** 型号名（或显示名）看得出是生图模型。 */
export const isImageModel = id => typeof id === 'string' && imagePattern.test(id);

/** DSH 目录里的一项（{ id, name }）是不是生图模型：id 和显示名有一个认得就算。 */
export const isImageEntry = entry => isImageModel(entry?.id) || isImageModel(entry?.name);
