const day = 86400000;

/** 北京时间的日期（YYYY-MM-DD）。 */
export const beijingDate = now => new Date(now + 8 * 3600000).toISOString().slice(0, 10);

/**
 * 当天首页展示的是当期第几条技巧：按日期在当期条目里轮换。
 * 首页、技巧历史的“当天首页”标记和详情里的序号都用这一处，三处同源。
 */
export const tipIndex = (date, count) => count > 0 ? Math.floor(Date.parse(`${date}T00:00:00Z`) / day) % count : 0;
