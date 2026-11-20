import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecastUrl, fetchForecast } from '../server/openmeteo.js';
import { createApp } from '../server/index.js';
import { SNAP } from '../src/core/logic.js';

const DAYS = 16;
const dates = Array.from({ length: DAYS }, (_, i) => {
  const d = new Date(Date.UTC(2026, 10, 20 + i));
  return d.toISOString().slice(0, 10);
});

function syntheticDaily() {
  const daily = { time: dates };
  const models = ['ecmwf_ifs025', 'ecmwf_aifs025_single', 'ukmo_seamless', 'cma_grapes_global', 'icon_seamless', 'meteofrance_seamless'];
  models.forEach((m, mi) => {
    const max = m === 'cma_grapes_global' ? 5 : m === 'meteofrance_seamless' ? 4 : m === 'ukmo_seamless' || m === 'icon_seamless' ? 7 : DAYS;
    daily['weather_code_' + m] = dates.map((_, i) => (i < max ? (i < 8 ? 3 : 61) : null));
    daily['temperature_2m_max_' + m] = dates.map((_, i) => (i < max ? 24 + (i % 3) : null));
    daily['temperature_2m_min_' + m] = dates.map((_, i) => (i < max ? 17 + (i % 2) : null));
    daily['precipitation_sum_' + m] = dates.map((_, i) => (i < max ? (i < 8 ? 0 : 4 + mi) : null));
    daily['precipitation_probability_max_' + m] = dates.map((_, i) => (i < max ? (i < 8 ? 10 : 80) : null));
    daily['wind_speed_10m_max_' + m] = dates.map((_, i) => (i < max ? 12 : null));
  });
  return daily;
}

const cfg = {
  points: [
    { lat: 23.125, lon: 113.24 }, { lat: 23.129, lon: 113.267 },
    { lat: 23.135, lon: 113.33 }, { lat: 23.09, lon: 113.31 }
  ],
  forecastBase: 'https://api.open-meteo.com/v1/forecast',
  forecastDays: 16,
  requestTimeoutMs: 5000,
  cacheTtlMs: 6 * 3600 * 1000
};

test('预报 URL 与页面同参：四点多值、六模式、Asia/Shanghai', () => {
  const url = buildForecastUrl(cfg);
  assert.match(url, /latitude=23\.125,23\.129,23\.135,23\.09/);
  assert.match(url, /longitude=113\.24,113\.267,113\.33,113\.31/);
  assert.match(url, /timezone=Asia%2FShanghai/);
  assert.match(url, /forecast_days=16/);
  assert.match(url, /models=ecmwf_ifs025,ecmwf_aifs025_single,ukmo_seamless,cma_grapes_global,icon_seamless,meteofrance_seamless/);
});

test('解析多模式响应：远期只剩 ECMWF，缺失模式不冒充覆盖', async () => {
  const raw = syntheticDaily();
  const stub = async () => ({ ok: true, json: async () => ({ daily: raw }) });
  const { view } = await fetchForecast(cfg, { fetchImpl: stub });
  assert.equal(view.days.length, 16);
  assert.equal(view.windows.length, 13);
  // 第 1 天：6 家都有
  assert.equal(view.days[0].n, 6);
  // 第 8 天：Météo-FR 4 天、CMA 5 天、UKMO/ICON 7 天已断供
  assert.ok(view.days[7].n <= 3);
  // 第 13 天：只剩 ECMWF 两个产品
  assert.equal(view.days[12].n, 2);
});

test('HTTP：首页注入同源 API，接口与静态资源可用', async (t) => {
  const fakeService = {
    get: async () => ({ ok: true, stale: false, ageMinutes: 3, updatedAt: '2026-11-20T05:00:00.000Z', view: SNAP, rawDaily: null }),
    refresh: async () => null,
    peek: () => ({ iso: '2026-11-20T05:00:00.000Z', ts: Date.now() }),
    error: () => null
  };
  const server = createApp({ ...cfg, cacheFile: '/tmp/gz-test-cache.json' }, { service: fakeService, scheduler: false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(() => server.close());

  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.ok, true);

  const fc = await (await fetch(base + '/api/forecast')).json();
  assert.equal(fc.days.length, SNAP.days.length);
  assert.ok(Array.isArray(fc.windows));

  const climo = await (await fetch(base + '/api/data/climatology')).json();
  assert.equal(climo.meta.years, 11);

  const html = await (await fetch(base + '/')).text();
  assert.match(html, /window\.GZ_API_BASE = '\/api\/forecast'/);

  const js = await fetch(base + '/assets/app-core.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);

  const traversal = await fetch(base + '/../server/config.js');
  assert.equal(traversal.status, 404);
});
