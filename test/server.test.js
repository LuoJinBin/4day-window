import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecastUrl, fetchForecast } from '../server/openmeteo.js';
import { createApp } from '../server/index.js';
import { parsePoints } from '../server/config.js';
import { SNAP } from '../src/core/logic.js';
import { createForecastService } from '../server/forecast-service.js';
import { writeCache } from '../server/cache.js';
import { startScheduler } from '../server/scheduler.js';
import { createForecastHandler, createHealthHandler } from '../server/vercel-handlers.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

function syntheticHourly() {
  const time = [];
  dates.forEach((date) => {
    for (let hour = 7; hour <= 17; hour += 1) {
      time.push(date + 'T' + String(hour).padStart(2, '0') + ':00');
    }
  });
  const hourly = { time };
  const models = ['ecmwf_ifs025', 'ecmwf_aifs025_single', 'ukmo_seamless', 'cma_grapes_global', 'icon_seamless', 'meteofrance_seamless'];
  models.forEach((model) => {
    hourly['weather_code_' + model] = time.map((stamp) => {
      const dayIndex = dates.indexOf(stamp.slice(0, 10));
      const hour = Number(stamp.slice(11, 13));
      if (dayIndex === 0) return hour <= 11 ? 0 : 2; // Clear morning, partly cloudy afternoon.
      if (dayIndex === 1) return 3; // Overcast for nearly all daylight hours.
      return 2;
    });
  });
  return hourly;
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
  assert.match(url, /hourly=weather_code/);
  assert.match(url, /forecast_hours=168/);
  assert.match(url, /past_hours=12/);
  assert.match(url, /models=ecmwf_ifs025,ecmwf_aifs025_single,ukmo_seamless,cma_grapes_global,icon_seamless,meteofrance_seamless/);
});

test('坐标配置严格校验数量、格式和经纬度范围', () => {
  assert.deepEqual(parsePoints('23.1,113.2;23.2,113.3'),[
    {lat:23.1,lon:113.2},{lat:23.2,lon:113.3}
  ]);
  assert.throws(()=>parsePoints('23.1,113.2;'),/non-empty/);
  assert.throws(()=>parsePoints('91,113.2'),/invalid coordinate/);
  assert.throws(()=>parsePoints('23.1,113.2;23.2'),/must be lat,lon/);
});

test('Open-Meteo 永久性 4xx 不进行无意义重试', async () => {
  let calls=0;
  await assert.rejects(fetchForecast(cfg,{fetchImpl:async()=>{
    calls++;
    return {ok:false,status:400};
  }}),/HTTP 400/);
  assert.equal(calls,1);
});

test('解析多模式响应：远期只剩 ECMWF，缺失模式不冒充覆盖', async () => {
  const raw = syntheticDaily();
  const stub = async () => ({ ok: true, json: async () => [0,1,2,3].map(() => ({ daily: raw })) });
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

test('日间逐小时多数修正全天最严重天气码造成的阴天误判', async () => {
  const raw = syntheticDaily();
  const hourly = syntheticHourly();
  const stub = async () => ({
    ok: true,
    json: async () => [0, 1, 2, 3].map(() => ({ daily: raw, hourly }))
  });
  const { view } = await fetchForecast(cfg, { fetchImpl: stub });
  assert.equal(view.days[0].modal, '多云');
  assert.equal(view.days[0].overcast, false);
  assert.equal(view.days[1].modal, '阴');
  assert.equal(view.days[8].modal, '雨');
});

test('两家少数机构报阴只降低可信度，不推翻加权多数多云', async () => {
  const raw = syntheticDaily();
  const hourly = syntheticHourly();
  const minorityOvercast = new Set(['icon_seamless', 'meteofrance_seamless']);
  Object.keys(hourly).filter((key) => key.startsWith('weather_code_')).forEach((key) => {
    const model = key.slice('weather_code_'.length);
    hourly[key] = hourly[key].map((code, index) => {
      const dayIndex = Math.floor(index / 11);
      if (dayIndex !== 2) return code;
      return minorityOvercast.has(model) ? 3 : 2;
    });
  });
  const stub = async () => ({
    ok: true,
    json: async () => [0, 1, 2, 3].map(() => ({ daily: raw, hourly }))
  });
  const { view } = await fetchForecast(cfg, { fetchImpl: stub });
  const day = view.days[2];
  assert.equal(day.modal, '多云');
  assert.equal(day.overcastOrgs, 2);
  assert.ok(day.overcastShare > 0.3 && day.overcastShare < 0.5);
  assert.equal(day.overcast, false);
  assert.equal(day.overcastMinority, true);
  assert.equal(day.diverge, true);
  assert.equal(day.ok, true);
});

test('Open-Meteo 拒绝日期错位或返回点位数量不足的数据', async () => {
  const base=syntheticDaily();
  const shifted=syntheticDaily();
  shifted.time=shifted.time.map((iso,i)=>i===0?'2026-11-21':iso);
  const response=(items)=>async()=>({ok:true,json:async()=>items.map(daily=>({daily}))});
  await assert.rejects(fetchForecast(cfg,{fetchImpl:response([base,base,shifted,base])}),/日期不一致/);
  await assert.rejects(fetchForecast(cfg,{fetchImpl:response([base,base,base])}),/点位数量不符/);
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

  const matrixRes = await fetch(base + '/api/data/condition-matrix');
  assert.equal(matrixRes.status, 200);
  assert.equal(typeof (await matrixRes.json()).cond, 'object');

  const levelsRes = await fetch(base + '/api/data/confidence-levels');
  assert.equal(levelsRes.status, 200);
  assert.deepEqual(await levelsRes.json(), ['仅趋势', '低', '中', '高']);

  assert.equal((await fetch(base + '/api/data/conditionmatrix')).status, 404);
  assert.notEqual((await fetch(base + '/api/data/%2e%2e%2f..%2fserver%2fconfig')).status, 200);
  assert.notEqual((await fetch(base + '/assets/%2e%2e%2fserver%2fconfig.js')).status, 200);
  assert.equal((await fetch(base + '/api/forecast', { method: 'POST' })).status, 405);

  const html = await (await fetch(base + '/')).text();
  assert.match(html, /window\.GZ_API_BASE = '\/api\/forecast'/);

  const js = await fetch(base + '/assets/app-core.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.equal(js.headers.get('cache-control'), 'no-cache');
  assert.equal(js.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(base + '/', { method: 'HEAD' })).status, 200);

  const traversal = await fetch(base + '/../server/config.js');
  assert.equal(traversal.status, 404);
});

test('服务启动与定时检查尊重 TTL，不强制刷新有效缓存', async () => {
  const calls = [];
  let tick = null;
  let cleared = null;
  const oldSetInterval = globalThis.setInterval;
  const oldClearInterval = globalThis.clearInterval;
  globalThis.setInterval = (fn, ms) => {
    tick = fn;
    assert.equal(ms, 5 * 60 * 1000);
    return { unref() {} };
  };
  globalThis.clearInterval = (id) => { cleared = id; };
  try {
    const timerId = 77;
    const service = { get: async (opts) => { calls.push(opts); return { ok: true }; } };
    const stop = startScheduler(service, { refreshMinutes: 5 });
    await Promise.resolve();
    assert.deepEqual(calls, [{}]);
    tick();
    await Promise.resolve();
    assert.deepEqual(calls, [{}, {}]);
    stop();
    assert.ok(cleared);
  } finally {
    globalThis.setInterval = oldSetInterval;
    globalThis.clearInterval = oldClearInterval;
  }
});

test('预报服务复用有效磁盘缓存，不请求上游；过期缓存失败时明确返回 stale', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gz-cache-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cacheFile = path.join(dir, 'forecast.json');
  const now = Date.parse('2026-11-20T12:00:00.000Z');
  const cached = {
    ts: now - 10 * 60 * 1000,
    iso: new Date(now - 10 * 60 * 1000).toISOString(),
    view: { days: SNAP.days, windows: [] },
    rawDaily: { time: [] }
  };
  writeCache(cacheFile, cached);
  let calls = 0;
  const service = createForecastService({ ...cfg, cacheFile, cacheTtlMs: 60 * 60 * 1000 }, {
    now: () => now,
    fetchImpl: async () => { calls += 1; return { ok: false, status: 400 }; },
    logger: { log() {}, warn() {} }
  });
  const fresh = await service.get();
  assert.equal(calls, 0);
  assert.equal(fresh.stale, false);
  assert.equal(fresh.updatedAt, cached.iso);

  const staleService = createForecastService({ ...cfg, cacheFile, cacheTtlMs: 5 * 60 * 1000 }, {
    now: () => now,
    fetchImpl: async () => { calls += 1; return { ok: false, status: 400 }; },
    logger: { log() {}, warn() {} }
  });
  const stale = await staleService.get();
  assert.equal(calls, 1);
  assert.equal(stale.ok, true);
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt, cached.iso);
});

test('并发首次请求共享同一次上游刷新', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gz-singleflight-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cacheFile = path.join(dir, 'forecast.json');
  let calls = 0;
  const service = createForecastService({ ...cfg, cacheFile }, {
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => [0,1,2,3].map(() => ({ daily: syntheticDaily() })) };
    },
    logger: { log() {}, warn() {} }
  });
  const [a, b] = await Promise.all([service.get(), service.get()]);
  assert.equal(calls, 1);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
});


function responseRecorder() {
  return {
    headers: {},
    statusCode: 0,
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = String(value); },
    end(body = '') { this.body = body; }
  };
}

test('Vercel forecast handler serves JSON and gates forced refresh', async () => {
  const calls = [];
  const service = {
    get: async (options) => {
      calls.push(options);
      return {
        ok: true,
        stale: false,
        ageMinutes: 0,
        updatedAt: '2026-11-21T05:00:00.000Z',
        view: { days: SNAP.days, windows: [] }
      };
    }
  };
  const handler = createForecastHandler(service);
  const res = responseRecorder();
  await handler({ method: 'GET', url: '/api/forecast?force=1' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(calls, [{ force: false }]);
  const payload = JSON.parse(res.body);
  assert.equal(payload.days.length, SNAP.days.length);
  assert.deepEqual(payload.windows, []);

  const forced = responseRecorder();
  await createForecastHandler(service, { allowForceRefresh: true })(
    { method: 'GET', url: '/api/forecast?force=1' }, forced
  );
  assert.deepEqual(calls[1], { force: true });
});

test('Vercel forecast handler rejects writes and reports upstream failures', async () => {
  const methodRes = responseRecorder();
  await createForecastHandler({ get: async () => { throw new Error('must not run'); } })(
    { method: 'POST', url: '/api/forecast' }, methodRes
  );
  assert.equal(methodRes.statusCode, 405);
  assert.equal(methodRes.headers.allow, 'GET, HEAD');

  const failureRes = responseRecorder();
  await createForecastHandler({
    get: async () => ({ ok: false, status: 503, error: 'Open-Meteo HTTP 503' })
  })({ method: 'GET', url: '/api/forecast' }, failureRes);
  assert.equal(failureRes.statusCode, 503);
  assert.equal(JSON.parse(failureRes.body).stale, true);
});

test('Vercel health handler confirms the function is reachable', async () => {
  const res = responseRecorder();
  createHealthHandler()({ method: 'GET', url: '/api/health' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).ok, true);
});


test('Open-Meteo 429 exposes the upstream reason and is not retried immediately', async () => {
  let calls = 0;
  await assert.rejects(fetchForecast(cfg, {
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: false,
        status: 429,
        headers: { get: (name) => name.toLowerCase() === 'retry-after' ? '60' : null },
        text: async () => JSON.stringify({ reason: 'API request limit exceeded' })
      };
    }
  }), /Open-Meteo HTTP 429: API request limit exceeded \(Retry-After 60\)/);
  assert.equal(calls, 1);
});

test('local server defaults to loopback and hosted deployments can opt into all interfaces', () => {
  const script = "import config from './server/config.js'; process.stdout.write(config.host);";
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'HOST'));
  const local = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(), env, encoding: 'utf8'
  });
  assert.equal(local.status, 0, local.stderr);
  assert.equal(local.stdout, '127.0.0.1');

  const hosted = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(), env: { ...env, HOST: '0.0.0.0' }, encoding: 'utf8'
  });
  assert.equal(hosted.status, 0, hosted.stderr);
  assert.equal(hosted.stdout, '0.0.0.0');
});
