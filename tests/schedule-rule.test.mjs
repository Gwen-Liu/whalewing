import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSchedule, nextRuns, parseCron, normalizeRule } from '../features/automation/schedule-rule.js';

const now = Date.parse('2026-10-25T00:30:00Z'); // 北京时间 2026-10-25（周日）08:30
const daily = (time, zone = 'Asia/Shanghai') => ({ daily: { time, time_zone: zone } });
const weekly = (time, weekdays) => ({ weekly: { time, time_zone: 'Asia/Shanghai', weekdays } });
const cron = expression => ({ cron: { expression, time_zone: 'Asia/Shanghai' } });
const record = changes => ({ id: 's', title: '任务', prompt: '指令', scheduledAt: '2026-10-26T00:00:00.000Z', timeZone: 'Asia/Shanghai', ...changes });

test('describeSchedule：每天、工作日、每周、只一次、固定间隔都给出一句中文', () => {
  const cases = [
    [daily('08:00:00'), '每天 08:00'],
    [record({ kind: 'daily', time: '08:00:00.000' }), '每天 08:00'],
    [daily('07:05:30'), '每天 07:05:30'],
    [weekly('08:00:00', [1, 2, 3, 4, 5]), '每个工作日 08:00'],
    [record({ kind: 'weekly', time: '08:00:00', weekdays: [5, 4, 3, 2, 1] }), '每个工作日 08:00'],
    [weekly('17:30:00', [5]), '每周五 17:30'],
    [weekly('09:00:00', [1, 3, 5]), '每周一、三、五 09:00'],
    [weekly('10:00:00', [6, 7]), '每个周末 10:00'],
    [weekly('08:00:00', [1, 2, 3, 4, 5, 6, 7]), '每天 08:00'],
    [record({ kind: 'at', scheduledAt: '2026-10-31T01:00:00.000Z' }), '10 月 31 日 09:00 一次'],
    [record({ kind: 'after', scheduledAt: '2026-10-31T01:00:00.000Z', afterSeconds: 60 }), '10 月 31 日 09:00 一次'],
    [{ at: '2027-01-02T01:00:00Z' }, '2027 年 1 月 2 日 09:00 一次'],
    [{ after_seconds: 600 }, '10 分钟后运行一次'],
    [{ after_seconds: 3600 }, '1 小时后运行一次'],
    [record({ kind: 'every', everySeconds: 7200 }), '每 2 小时'],
    [{ every_seconds: 3600 }, '每小时'],
    [{ every_seconds: 1800 }, '每 30 分钟'],
    [{ every_seconds: 60 }, '每分钟'],
    [{ every_seconds: 90 }, '每 90 秒'],
    [{ every_seconds: 86400 }, '每 24 小时'],
    [{ every_seconds: 172800 }, '每 2 天'],
    [daily('08:00:00', 'America/New_York'), '每天 08:00（America/New_York 时间）'],
  ];
  for (const [rule, expected] of cases) assert.equal(describeSchedule(rule, { now }), expected, JSON.stringify(rule));
  for (const rule of [null, undefined, 'daily', {}, { kind: 'monthly' }]) assert.equal(describeSchedule(rule, { now }), '时间规则未知');
});

test('describeSchedule：常见 cron 写法翻译成中文，读不懂的原样给出', () => {
  const cases = [
    ['0 8 * * *', '每天 08:00'],
    ['0 8 * * 1-5', '每个工作日 08:00'],
    ['30 17 * * 5', '每周五 17:30'],
    ['0 8 * * 0', '每周日 08:00'],
    ['0 8 * * 7', '每周日 08:00'],
    ['0 8 * * 6,0', '每个周末 08:00'],
    ['0 8,18 * * *', '每天 08:00、18:00'],
    ['*/15 * * * *', '每 15 分钟'],
    ['* * * * *', '每分钟'],
    ['0 * * * *', '每小时整点'],
    ['15 * * * *', '每小时第 15 分'],
    ['0 */2 * * *', '每 2 小时（整点）'],
    ['30 */3 * * *', '每 3 小时（第 30 分）'],
    ['0 9 1 * *', '每月 1 日 09:00'],
    ['0 9 1,15 * *', '每月 1、15 日 09:00'],
    ['0 9 1 10 *', '每年 10 月 1 日 09:00'],
  ];
  for (const [expression, expected] of cases) assert.equal(describeSchedule(cron(expression)), expected, expression);
  for (const expression of ['0 9-17 * * 1-5', '0 8 L * *', '0 8 * * MON', '@daily', '0 0 8 * * *', '0 9 1 * 1', '5/15 * * * *', '61 8 * * *']) assert.equal(describeSchedule(cron(expression)), `按 Cron 表达式：${expression}`, expression);
  assert.equal(describeSchedule({ cron: { expression: '0 8 * * *', time_zone: 'Europe/London' } }), '每天 08:00（Europe/London 时间）');
  assert.equal(describeSchedule(record({ kind: 'cron', expression: '0 8 * * 1-5' })), '每个工作日 08:00');
  assert.equal(parseCron('0 8 L * *'), null); assert.equal(parseCron('0 8 * *'), null); assert.equal(parseCron('0 24 * * *'), null); assert.equal(parseCron('0 8 5-1 * *'), null);
});

test('nextRuns：每天、工作日、每周按北京时间算，严格晚于现在', () => {
  assert.deepEqual(nextRuns(daily('08:00:00'), now, 3), ['2026-10-26T00:00:00.000Z', '2026-10-27T00:00:00.000Z', '2026-10-28T00:00:00.000Z']);
  assert.deepEqual(nextRuns(daily('09:00:00'), now, 1), ['2026-10-25T01:00:00.000Z'], '当天还没到的时间');
  assert.deepEqual(nextRuns(daily('08:30:00'), now, 1), ['2026-10-26T00:30:00.000Z'], '正好是现在不算');
  assert.deepEqual(nextRuns(record({ kind: 'daily', time: '00:15:00.000', status: 'active' }), now, 2), ['2026-10-25T16:15:00.000Z', '2026-10-26T16:15:00.000Z']);
  assert.deepEqual(nextRuns(weekly('08:00:00', [1, 2, 3, 4, 5]), Date.parse('2026-10-23T01:00:00Z'), 3), ['2026-10-26T00:00:00.000Z', '2026-10-27T00:00:00.000Z', '2026-10-28T00:00:00.000Z'], '周五之后跳过周末');
  assert.deepEqual(nextRuns(weekly('17:30:00', [5]), now, 2), ['2026-10-30T09:30:00.000Z', '2026-11-06T09:30:00.000Z']);
  assert.equal(nextRuns(daily('08:00:00'), now).length, 3, '默认三次');
});

test('nextRuns：只一次、固定间隔、cron，以及暂停和读不懂时返回空', () => {
  assert.deepEqual(nextRuns(record({ kind: 'at', scheduledAt: '2026-10-31T01:00:00.000Z' }), now, 3), ['2026-10-31T01:00:00.000Z']);
  assert.deepEqual(nextRuns(record({ kind: 'at', scheduledAt: '2026-10-20T01:00:00.000Z' }), now, 3), [], '过去的一次不再运行');
  assert.deepEqual(nextRuns({ after_seconds: 600 }, now, 3), ['2026-10-25T00:40:00.000Z']);
  assert.deepEqual(nextRuns(record({ kind: 'every', everySeconds: 7200, scheduledAt: '2026-10-25T02:00:00.000Z' }), now, 3), ['2026-10-25T02:00:00.000Z', '2026-10-25T04:00:00.000Z', '2026-10-25T06:00:00.000Z']);
  assert.deepEqual(nextRuns(record({ kind: 'every', everySeconds: 7200, scheduledAt: '2026-10-24T23:00:00.000Z' }), now, 2), ['2026-10-25T01:00:00.000Z', '2026-10-25T03:00:00.000Z'], '错过的时间点按原间隔往后排');
  assert.deepEqual(nextRuns({ every_seconds: 3600 }, now, 2), ['2026-10-25T01:30:00.000Z', '2026-10-25T02:30:00.000Z'], '还没创建时从现在起算');
  assert.deepEqual(nextRuns(cron('0 8 * * 1-5'), now, 2), ['2026-10-26T00:00:00.000Z', '2026-10-27T00:00:00.000Z']);
  assert.deepEqual(nextRuns(cron('*/15 * * * *'), Date.parse('2026-10-25T00:07:00Z'), 3), ['2026-10-25T00:15:00.000Z', '2026-10-25T00:30:00.000Z', '2026-10-25T00:45:00.000Z']);
  assert.deepEqual(nextRuns(cron('0 9 1 * 1'), now, 3), ['2026-10-26T01:00:00.000Z', '2026-11-01T01:00:00.000Z', '2026-11-02T01:00:00.000Z'], '日和星期都有限定时满足其一');
  assert.deepEqual(nextRuns(cron('0 9 */10 * 1'), now, 2), ['2026-12-21T01:00:00.000Z', '2027-01-11T01:00:00.000Z'], '以 * 开头的字段要同时满足：1、11、21、31 日里的周一');
  assert.deepEqual(nextRuns(cron('0 0 29 2 *'), now, 1), ['2028-02-28T16:00:00.000Z'], '四年一次的日期也能找到');
  for (const rule of [cron('0 8 L * *'), cron('@daily'), { daily: { time: '25:00:00', time_zone: 'Asia/Shanghai' } }, { daily: { time: '08:00:00', time_zone: 'Not/AZone' } }, weekly('08:00:00', []), null, { kind: 'monthly' }]) assert.deepEqual(nextRuns(rule, now, 3), [], JSON.stringify(rule));
  for (const status of ['paused', 'inactive']) assert.deepEqual(nextRuns(record({ kind: 'daily', time: '08:00:00', status }), now, 3), []);
  assert.deepEqual(nextRuns(daily('08:00:00'), 'not a time', 3), []); assert.deepEqual(nextRuns(daily('08:00:00'), now, 0), []);
  assert.deepEqual(nextRuns(daily('08:00:00'), new Date(now), 1), nextRuns(daily('08:00:00'), '2026-10-25T00:30:00Z', 1));
});

test('nextRuns：其它时区遵守夏令时，缺失的本地时间跳过，重叠时间取较早一次', () => {
  assert.deepEqual(nextRuns(daily('02:30:00', 'America/New_York'), Date.parse('2027-03-13T12:00:00Z'), 1), ['2027-03-15T06:30:00.000Z']);
  assert.deepEqual(nextRuns(daily('01:30:00', 'America/New_York'), Date.parse('2027-11-06T12:00:00Z'), 2), ['2027-11-07T05:30:00.000Z', '2027-11-08T06:30:00.000Z']);
  assert.equal(normalizeRule({ kind: 'daily', time: '08:00:00' }).timeZone, 'Asia/Shanghai');
});
