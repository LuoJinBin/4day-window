import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE, MDL, metrics, rankTripWindows } from '../src/core/logic.js';
import { createApp } from '../server/index.js';
import { createPlannerService, forecastQuery } from '../server/planner-service.js';
import { addDays, GUANGZHOU, HOUR_MS, localParts, periodOf, QUICK_CITIES, selectedHours } from '../public/assets/planner-calendar.js';
import { assessDay, assessPeriod, evaluatePlan, indexHourly, makeWindow, rankWindows } from '../public/assets/planner-model.js';

const models = Object.keys(MDL);
const scoring = { code: CODE, models: MDL, metrics, rankTripWindows };
const pointSet = [
  { lat: 23.125, lon: 113.24 }, { lat: 23.129, lon: 113.267 },
  { lat: 23.135, lon: 113.33 }, { lat: 23.09, lon: 113.31 }
];
const cfg = {
  forecastBase: 'https://api.open-meteo.com/v1/forecast', forecastDays: 16, points: pointSet,
  requestTimeoutMs: 200, cacheTtlMs: 6 * HOUR_MS
};
const now = Date.parse('2026-11-25T10:00Z');

function params(city = GUANGZHOU, extra = {}) {
  const { latitude, longitude, timezone } = city;
  return new URLSearchParams({ latitude, longitude, timezone, ...extra });
}

function mockForecast(url) {
  const query = new URL(url).searchParams;
  const start = query.get('start_date');
  const end = query.get('end_date');
  const dayList = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dayList.push(date);
  const points = query.get('latitude').split(',').map(Number);
  const responses = points.map(latitude => {
    const actualTemperature = Math.round(latitude / 2);
    if (!query.has('daily')) {
      const time = dayList.flatMap(date => Array.from({ length: 24 }, (_, hour) => Date.parse(date) / 1000 + hour * 3600));
      const hourly = { time };
      for (const model of models) {
        for (const [field, value] of Object.entries({
          weather_code: 2, temperature_2m: actualTemperature, apparent_temperature: 18,
          precipitation_probability: 5, cloud_cover: 28, wind_speed_10m: 12
        })) {
          hourly[field + '_' + model] = time.map(() => value);
        }
        hourly['precipitation_' + model] = time.map((_, index) => index % 24 / 10);
      }
      return { hourly };
    }
    const daily = { time: dayList };
    for (const model of models) {
      for (const [field, value] of Object.entries({
        weather_code: 2, temperature_2m_max: actualTemperature, temperature_2m_min: actualTemperature - 5,
        precipitation_probability_max: 5, precipitation_sum: 0, wind_speed_10m_max: 12
      })) {
        daily[field + '_' + model] = dayList.map(() => value);
      }
    }
    return { daily };
  });
  return Response.json(responses.length === 1 ? responses[0] : responses);
}

test('当地日期按目的地计算，跨国际日期变更线也不会沿用广州日历', () => {
  const sameTime = Date.parse('2026-11-25T02:30:00Z');
  assert.deepEqual(localParts(sameTime, 'Asia/Shanghai'), { date: '2026-11-25', time: '10:30' });
  assert.deepEqual(localParts(sameTime, 'America/New_York'), { date: '2026-11-24', time: '21:30' });
  assert.equal(localParts(sameTime, 'Pacific/Kiritimati').date, '2026-11-25');
  assert.equal(forecastQuery(params({ ...GUANGZHOU, timezone: 'America/New_York' }), cfg, sameTime).start, '2026-11-24');
  assert.equal(forecastQuery(params({ ...GUANGZHOU, timezone: 'America/New_York' }), cfg, sameTime).guangzhou, false);
});

test('自定义跨午夜按开始日期计算，支持非整点时区和边界分钟', () => {
  const period = periodOf('custom', '22:30', '02:00');
  const time = selectedHours('2026-11-27', period, 'Asia/Shanghai');
  assert.deepEqual(time.map(slot => [slot.date, slot.time]), [
    ['2026-11-27', '22:00'], ['2026-11-27', '23:00'], ['2026-11-28', '00:00'], ['2026-11-28', '01:00']
  ]);
  assert.equal(selectedHours('2026-11-27', periodOf('custom', '08:00', '09:00'), 'Asia/Kolkata')[0].time, '07:30');
  assert.equal(periodOf('custom', '08:00', '08:00'), null);
});

test('夏令时跳过不存在的小时，回拨保留两个独立的小时及偏移', () => {
  const all = periodOf('all');
  assert.equal(selectedHours('2026-03-08', all, 'America/New_York').length, 23);
  assert.equal(selectedHours('2026-03-08', periodOf('custom', '02:00', '03:00'), 'America/New_York').length, 0);
  const repeated = selectedHours('2026-11-01', periodOf('custom', '01:00', '02:00'), 'America/New_York');
  assert.equal(repeated.length, 2);
  assert.deepEqual(repeated.map(slot => slot.time), ['01:00', '01:00']);
  assert.deepEqual(repeated.map(slot => slot.offset), [-240, -300]);
  assert.equal(repeated[1].stamp - repeated[0].stamp, HOUR_MS);
  const lastHalfHour = selectedHours('2026-11-01', periodOf('custom', '01:00', '01:30'), 'America/New_York').at(-1);
  assert.equal(lastHalfHour.endStamp, Date.parse('2026-11-01T06:30Z'));
  assert.equal(selectedHours('2026-11-01', all, 'America/New_York').length, 25);
  const lordHowe = selectedHours('2026-10-04', periodOf('custom', '02:00', '02:30'), 'Australia/Lord_Howe');
  assert.equal(lordHowe.length, 0);
});

test('逐小时分析区分全天、上午、下午、晚上、自选小时和跨午夜风险', () => {
  const date = '2026-11-27';
  const next = addDays(date, 1);
  const data = [...selectedHours(date, periodOf('all'), 'UTC'), ...selectedHours(next, periodOf('all'), 'UTC')]
    .map(slot => {
      const bad = slot.time === '14:00' || (slot.date === next && slot.time === '01:00');
      const windy = slot.time === '20:00';
      return [slot.stamp, ...models.map(() => [bad ? 61 : 0, 23, 24, bad ? 3 : 0, bad ? 85 : 5, bad ? 98 : 5, windy ? 45 : 12])];
    });
  const index = indexHourly({ models, data });
  const analyze = (preset, start, end) => assessPeriod(date, periodOf(preset, start, end), 'UTC', index, date, scoring);
  assert.equal(analyze('morning').ok, true);
  assert.equal(analyze('afternoon').rainy, true);
  assert.equal(analyze('evening').windRisk, 45);
  assert.equal(analyze('evening').ok, false);
  assert.equal(analyze('custom', '11:30', '13:30').ok, true);
  assert.equal(analyze('custom', '22:00', '02:00').rainy, true);
  assert.equal(analyze('all').rainy, true);
  index.rows.delete(Date.parse(next + 'T01:00Z'));
  assert.equal(analyze('custom', '22:00', '02:00').n, 0);
});

test('阴天放宽、明显降雨、来源分歧和预报缺失各有独立结果', () => {
  const date = '2026-11-27';
  const period = periodOf('morning');
  const data = selectedHours(date, period, 'UTC').map(slot => [
    slot.stamp, ...models.map((_, i) => [i === 0 ? 61 : 3, 20, 20, i === 0 ? 3 : 0, i === 0 ? 85 : 0, 90, 10])
  ]);
  const day = assessPeriod(date, period, 'UTC', indexHourly({ models, data }), date, scoring);
  assert.equal(day.nOrg, 5);
  assert.equal(day.diverge, true);
  assert.ok(day.reasons.includes('各家预报有分歧'));
  const wrap = day => makeWindow(date, 1, new Map([[date, day]]));
  assert.equal(wrap({ ...day, ok: false, loose: true }).tier, 'loose');
  assert.equal(wrap({ ...day, ok: false, loose: false, trend: false, rainy: true }).tier, 'unsuitable');
  assert.equal(wrap({ date, n: 0 }).tier, 'unavailable');
});

test('1、2、4、7 天窗口，指定日期不会被天气更好的日期自动替换', () => {
  const start = '2026-11-27';
  const end = addDays(start, 12);
  const days = new Map();
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const poor = date === start;
    days.set(date, { date, n: 6, score: poor ? 25 : 85, wk: 0, hi: 23, lo: 15, conf: 3,
      ok: !poor, loose: !poor, trend: !poor, rainy: poor, mmMed: poor ? 4 : 0 });
  }
  for (const length of [1, 2, 4, 7]) {
    const args = { days, start, end, length, preference: 'workdays', coverageStart: start, coverageEnd: end };
    const automatic = evaluatePlan({ ...args, mode: 'auto' }, scoring);
    const manual = evaluatePlan({ ...args, mode: 'manual' }, scoring);
    assert.equal(automatic.current.days.length, length);
    assert.equal(automatic.current.tier, 'strict');
    assert.equal(manual.current.start, start);
    assert.equal(manual.current.end, addDays(start, length - 1));
    assert.equal(manual.current.tier, 'unsuitable');
    assert.equal(manual.alternatives[0].start, addDays(start, 1));
    assert.equal(manual.current.score, makeWindow(start, length, days).score);
  }
});

test('自动查找跳过已结束的时段，手动查找保留今天', () => {
  const start = '2026-11-27';
  const end = '2026-11-28';
  const days = new Map([start, end].map(date => [date, {
    date, n: 6, conf: 3, score: 90, hi: 22, lo: 18, ok: true, loose: true, trend: true
  }]));
  const options = { days, start, end, length: 1, preference: 'any', coverageStart: start,
    coverageEnd: end, earliest: end };
  assert.equal(evaluatePlan({ ...options, mode: 'auto' }, scoring).current.start, end);
  assert.equal(evaluatePlan({ ...options, mode: 'manual' }, scoring).current.start, start);
  assert.equal(evaluatePlan({ ...options, end: start, mode: 'auto' }, scoring).current, null);
});

test('优先工作日和避开周末只改变排序，天气等级和评分保持原值', () => {
  const weekdays = { start: '2026-11-30', tier: 'strict', score: 80, wk: 0,
    days: [{ conf: 3, hi: 23, lo: 16, mmMed: 0 }] };
  const weekend = { start: '2026-11-29', tier: 'strict', score: 84, wk: 1, days: weekdays.days };
  assert.equal(rankWindows([weekdays, weekend], 'any', scoring)[0], weekend);
  assert.equal(rankWindows([weekdays, weekend], 'workdays', scoring)[0], weekdays);
  assert.equal(rankWindows([weekdays, weekend], 'avoid', scoring)[0], weekdays);
  assert.equal(rankWindows([{ ...weekdays, tier: 'loose' }, weekend], 'avoid', scoring)[0], weekend);
  assert.deepEqual([weekdays.score, weekend.score], [80, 84]);
});

test('广州四点、北京上海深圳及海外城市使用独立坐标、时区、查询范围与缓存', async () => {
  const calls = [];
  const service = createPlannerService(cfg, { now: () => now, fetchImpl: async url => {
    calls.push(new URL(url).searchParams);
    return mockForecast(url);
  } });
  const cities = [...QUICK_CITIES, { latitude: 48.86, longitude: 2.35, timezone: 'Europe/Paris' }];
  const results = await Promise.all(cities.map(city => service.forecast(params(city))));
  assert.deepEqual(results.map(r => r.scope), ['guangzhou-districts', ...Array(4).fill('city-point')]);
  assert.equal(calls[0].get('latitude').split(',').length, 4);
  assert.deepEqual(calls.slice(1).map(call => Number(call.get('latitude'))), cities.slice(1).map(city => city.latitude));
  assert.equal(new Set(results.map(result => Math.round(result.data[0].hi))).size, 5);
  assert.equal(results[4].timezone, 'Europe/Paris');
  const legacy = results[0].data[0];
  assert.equal(assessDay(legacy).score, legacy.score);
  assert.equal(assessDay(legacy).ok, legacy.ok);
  await service.forecast(params(cities[1]));
  assert.equal(calls.length, 5);
  await service.forecast(params(cities[1], { start: '2026-11-26', end: '2026-11-27' }));
  await service.forecast(params({ ...cities[1], timezone: 'Asia/Tokyo' }));
  assert.equal(calls.length, 7);
  const hourly = await service.forecast(params(cities[1], { kind: 'hourly' }));
  assert.equal(calls[7].get('timezone'), 'GMT');
  assert.equal(calls[7].get('end_date'), '2026-12-10');
  assert.equal(hourly.data.find(row => row[0] === Date.parse('2026-11-24T16:00Z'))[1][3], 1.7);
});

test('同名城市保留行政区、国家、独立坐标和时区，城市查询合并并缓存', async () => {
  let calls = 0;
  const service = createPlannerService(cfg, { now: () => now, fetchImpl: async url => {
    calls += 1;
    assert.match(url, /name=Springfield/);
    const places = [
      { id: 1, name: '斯普林菲尔德', admin1: '伊利诺伊州', country: '美国', latitude: 39.8, longitude: -89.6, timezone: 'America/Chicago' },
      { id: 2, name: '斯普林菲尔德', admin1: '马萨诸塞州', country: '美国', latitude: 42.1, longitude: -72.6, timezone: 'America/New_York' }
    ];
    return Response.json({ results: places });
  } });
  const search = q => service.search(new URLSearchParams({ q }));
  const [first, second] = await Promise.all([search(' Springfield '), search('Springfield')]);
  assert.deepEqual(first, second);
  assert.deepEqual(first.cities.map(city => city.region), ['伊利诺伊州', '马萨诸塞州']);
  assert.deepEqual(first.cities.map(city => city.country), ['美国', '美国']);
  assert.notEqual(first.cities[0].longitude, first.cities[1].longitude);
  assert.notEqual(first.cities[0].timezone, first.cities[1].timezone);
  await search('springfield');
  assert.equal(calls, 1);
});

test('当地预报覆盖范围外先拒绝，限流时缓存只回退同一城市同一范围并保留更新时间', async () => {
  let clock = Date.parse('2026-11-25T09:00Z');
  let calls = 0;
  let throttle = false;
  const service = createPlannerService(cfg, { now: () => clock, fetchImpl: async url => {
    calls += 1;
    return throttle ? new Response('{}', { status: 429, headers: { 'retry-after': '90' } }) : mockForecast(url);
  } });
  const query = params(GUANGZHOU, { start: '2026-11-25', end: '2026-11-27' });
  await assert.rejects(service.forecast(params(GUANGZHOU, { end: '2026-12-11' })), { status: 422 });
  await assert.rejects(service.forecast(params(GUANGZHOU, { start: '2026-11-24' })), { status: 422 });
  await assert.rejects(service.forecast(params(GUANGZHOU, { start: '2026-11-31' })), { status: 400 });
  assert.equal(calls, 0);
  const first = await service.forecast(query);
  clock += cfg.cacheTtlMs + 1;
  throttle = true;
  const stale = await service.forecast(query);
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt, first.updatedAt);
  assert.deepEqual(stale.data, first.data);
  assert.deepEqual(await service.forecast(query), stale);
  await assert.rejects(service.forecast(params(QUICK_CITIES[1])), { status: 429, retryAfter: '90' });
  assert.equal(calls, 3);
});

test('Node 同源接口校验输入、返回城市天气并对超时和限流给出有效状态', async t => {
  const service = { get: async () => ({ ok: false }), peek: () => null, error: () => null };
  const server = createApp({ ...cfg, requestTimeoutMs: 15 }, {
    now: () => now, service, scheduler: false, fetchImpl: async (url, { signal }) => {
      const query = new URL(url).searchParams;
      if (query.get('name') === 'Paris') return new Response('{}', { status: 429, headers: { 'retry-after': '120' } });
      if (query.get('latitude') === '0') {
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      }
      return mockForecast(url);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const root = 'http://127.0.0.1:' + server.address().port;
  const reply = await fetch(root + '/api/forecast?' + params(QUICK_CITIES[1]));
  assert.equal(reply.status, 200);
  assert.equal((await reply.json()).latitude, QUICK_CITIES[1].latitude);
  const limited = await fetch(root + '/api/geocoding?q=Paris');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '120');
  const timedOut = await fetch(root + '/api/forecast?latitude=0&longitude=0&timezone=UTC');
  assert.equal(timedOut.status, 503);
  const invalid = await fetch(root + '/api/forecast?latitude=999&longitude=0&timezone=UTC');
  assert.equal(invalid.status, 400);
});
