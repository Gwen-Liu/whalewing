import { newsContract } from './contract.js';
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createCardsClient(bridge, t, z, automation) {
    const { featureRemote, unwrap, failure } = bridge;
    const newsSchema = newsContract(z);
    const newsRequest = async (input, signal) => {
      const parsed = newsSchema.manage.parse(input);
      signal?.throwIfAborted();
      const result = newsSchema.result.safeParse(unwrap(await featureRemote('whalewingCards').manageNews(parsed, signal)));
      if (!result.success) throw failure(t('badReply'), 'bad_reply');
      const value = result.data;
      const expected = { home: 'learning', list: 'fields', save: 'field', remove: 'field', reports: 'reports', report: 'report', days: 'days' }[input.action];
      if (!Object.hasOwn(value, expected) || value.field && value.field.id !== input.id || value.report && (value.report.fieldId !== input.fieldId || value.report.cutoff !== input.cutoff) || input.action === 'reports' && value.reports?.some(report => report.fieldId !== input.fieldId) || input.action === 'days' && value.fieldId !== input.fieldId) throw failure(t('badReply'), 'bad_reply');
      return value;
    };
    // 书架：入参和返回都按契约校验；返回种类与 action 对不上时按坏回复处理。
    const libraryRequest = async (input, signal) => {
      const parsed = newsSchema.library.manage.parse(input);
      signal?.throwIfAborted();
      const result = newsSchema.library.result.safeParse(unwrap(await featureRemote('whalewingCards').manageLibrary(parsed, signal)));
      if (!result.success) throw failure(t('badReply'), 'bad_reply');
      const expected = { list: 'library', uploadStart: 'upload', uploadChunk: 'upload', uploadFinish: 'book', uploadCancel: 'cancelled', update: 'book', pins: 'library', remove: 'removed', saveGroup: 'group', removeGroup: 'removed', open: 'reading', progress: 'book', image: 'image', catalog: 'catalog', download: 'book' }[input.action];
      if (!Object.hasOwn(result.data, expected)) throw failure(t('badReply'), 'bad_reply');
      return result.data;
    };
    const newsScheduleRequest = async (input, signal) => newsSchema.scheduleResult.parse(unwrap(await featureRemote('whalewingCards').manageSchedules(newsSchema.scheduleInput.parse(input), signal)));

  return {
    newsRequest, newsScheduleRequest, libraryRequest, openAutomation: automation.openAutomation,
    scheduleAdapter: Object.freeze({ validate: input => newsSchema.scheduleInput.parse(input), submit: newsScheduleRequest }),
  };
}
