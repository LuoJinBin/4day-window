import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFlexibleForecastUrl,
  normalizeFlexibleForecast,
  createPlanHandler,
  createLocationHandler
} from '../server/flexible-api.js';

const MODELS = ['ecmwf_ifs025', 'ecmwf_aifs025_single', 'ukmo_seamless', 'cma_grapes_global', 'icon_seamless', 'meteofrance_seamless'];

function fixture() {
  const daily = { time: ['2026-11-26'] };
  const hourly = { time: ['2026-11-26T06:00', '2026-11-26T07:00'] };
  MODELS.forEach((model, index) => {
    daily['weather_code_' + model] = [index === 0 ? 0 : 2];
    daily['temperature_2m_max_' + model] = [25 + index];
    daily['temperature_2m_min_' + model] = [17 + index];
    daily['precipitation_sum_' + model] = [index === 0 ? 0 : 0.2];
    daily['precipitation_probability_max_' + model] = [index * 10];
    daily['wind_speed_10m_max_' + model] = [12 + index];
    hourly['weather_code_' + model] = [0, 2];
    hourly['temperature_2m_' + model] = [20 + index, 21 + index];
    hourly['apparent_temperature_' + model] = [19 + index, 20 + index];
    hourly['precipitation_probability_' + model] = [index * 5, index * 10];
    hourly['precipitation_' + model] = [0, index === 5 ? 0.4 : 0];
    hourly['wind_speed_10m_' + model] = [8 + index, 9 + index];
  });
  return {
    timezone: 'Asia/Shanghai',
    timezone_abbreviation: 'CST',
    utc_offset_seconds: 28800,
    daily,
    hourly
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.body = body || ''; }
  };
}

function mockResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => typeof payload === 'string' ? payload : JSON.stringify(payload)
  };
}

test('灵活预报 URL 使用坐标自动识别时区并请求 16 天逐小时数据', () => {
  const url = new URL(buildFlexibleForecastUrl(35.6762, 139.6503));
  assert.equal(url.searchParams.get('latitude'), '35.6762');
  assert.equal(url.searchParams.get('longitude'), '139.6503');
  assert.equal(url.searchParams.get('timezone'), 'auto');
  assert.equal(url.searchParams.get('forecast_days'), '16');
  assert.equal(url.searchParams.get('forecast_hours'), '384');
  assert.equal(url.searchParams.get('past_hours'), '24');
  assert.ok(url.searchParams.get('hourly').includes('apparent_temperature'));
  assert.equal(url.searchParams.get('models').split(',').length, 6);
});

test('多模式逐日和逐小时数据归一化，空值不会被误算成零', () => {
  const raw = fixture();
  const result = normalizeFlexibleForecast(raw, '2026-11-25T12:00:00.000Z');
  assert.equal(result.timezone, 'Asia/Shanghai');
  assert.equal(result.days.length, 1);
  assert.equal(result.days[0].modelCount, 6);
  assert.equal(result.days[0].temperatureMax, 27.5);
  assert.equal(result.days[0].temperatureMin, 19.5);
  assert.equal(result.hours.length, 2);
  assert.equal(result.hours[0].temperature, 22.5);
  assert.equal(result.hours[0].modelCount, 6);

  raw.daily.temperature_2m_min_ecmwf_ifs025[0] = null;
  const withMissing = normalizeFlexibleForecast(raw);
  assert.notEqual(withMissing.days[0].temperatureMin, 0);
});

test('单一最佳匹配模式也能正常归一化', () => {
  const raw = fixture();
  const daily = { time: raw.daily.time };
  const hourly = { time: raw.hourly.time };
  for (const key of ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'precipitation_probability_max', 'wind_speed_10m_max']) {
    daily[key] = raw.daily[key + '_ecmwf_ifs025'];
  }
  for (const key of ['weather_code', 'temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation', 'wind_speed_10m']) {
    hourly[key] = raw.hourly[key + '_ecmwf_ifs025'];
  }
  const result = normalizeFlexibleForecast({ timezone: 'America/Los_Angeles', daily, hourly }, undefined, 'best_match');
  assert.equal(result.modelMode, 'best_match');
  assert.equal(result.days[0].modelCount, 1);
  assert.equal(result.hours[0].temperature, 20);
});

test('城市天气接口校验坐标，并缓存同一位置的预报请求', async () => {
  let calls = 0;
  const handler = createPlanHandler({
    fetchImpl: async () => { calls += 1; return mockResponse(fixture()); }
  });
  const bad = responseRecorder();
  await handler({ method: 'GET', url: '/api/plan?lat=91&lon=120' }, bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(calls, 0);

  const first = responseRecorder();
  await handler({ method: 'GET', url: '/api/plan?lat=23.1291&lon=113.2644' }, first);
  assert.equal(first.statusCode, 200);
  assert.equal(JSON.parse(first.body).days.length, 1);
  const second = responseRecorder();
  await handler({ method: 'GET', url: '/api/plan?lat=23.1291&lon=113.2644' }, second);
  assert.equal(second.statusCode, 200);
  assert.equal(calls, 1);
});

test('城市搜索验证输入并返回带时区的地点', async () => {
  let calls = 0;
  const handler = createLocationHandler({
    fetchImpl: async () => {
      calls += 1;
      return mockResponse({
        results: [{
          id: 1, name: '东京', country: '日本', country_code: 'JP',
          admin1: '东京都', latitude: 35.6762, longitude: 139.6503,
          timezone: 'Asia/Tokyo', feature_code: 'PPLC', population: 9000000
        }]
      });
    }
  });
  const invalid = responseRecorder();
  await handler({ method: 'GET', url: '/api/locations?q=a' }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls, 0);

  const valid = responseRecorder();
  await handler({ method: 'GET', url: '/api/locations?q=%E4%B8%9C%E4%BA%AC' }, valid);
  const body = JSON.parse(valid.body);
  assert.equal(valid.statusCode, 200);
  assert.equal(body.results[0].timezone, 'Asia/Tokyo');
  assert.equal(body.results[0].longitude, 139.6503);
  assert.equal(calls, 1);
});
