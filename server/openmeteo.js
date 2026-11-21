import { aggPoints, fromOpenMeteo, MDL } from '../src/core/logic.js';

const DAILY = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max'
];

// 与页面 LIVE_URL 完全同参：四点多值 + 六模式 + Asia/Shanghai + 16 天。
export function buildForecastUrl(cfg) {
  const lat = cfg.points.map((p) => p.lat).join(',');
  const lon = cfg.points.map((p) => p.lon).join(',');
  const models = Object.keys(MDL).join(',');
  const qs = [
    'latitude=' + lat,
    'longitude=' + lon,
    'daily=' + DAILY.join(','),
    'timezone=Asia%2FShanghai',
    'forecast_days=' + cfg.forecastDays,
    'models=' + models
  ].join('&');
  return cfg.forecastBase + '?' + qs;
}

// 返回 { view, rawDaily, fetchedAt }；view 即页面 render() 需要的结构。
export async function fetchForecast(cfg, { fetchImpl = fetch } = {}) {
  const url = buildForecastUrl(cfg);
  let json;
  let lastErr;
  // 多模式多点请求偶尔 503/超时：重试 3 次（1.5s 间隔），不改变请求参数。
  for (let attempt = 0; attempt < 3 && !json; attempt += 1) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), cfg.requestTimeoutMs);
    try {
      const res = await fetchImpl(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
      if (!res.ok) {
        let detail = '';
        if (typeof res.text === 'function') {
          try { detail = String(await res.text()).replace(/\\s+/g, ' ').trim(); } catch {}
        }
        try {
          const parsed = detail ? JSON.parse(detail) : null;
          if (parsed && typeof parsed === 'object') {
            detail = parsed.reason || parsed.message || parsed.error || detail;
          }
        } catch {}
        const retryAfter = res.headers && typeof res.headers.get === 'function'
          ? res.headers.get('retry-after')
          : null;
        const suffix = detail ? ': ' + String(detail).slice(0, 240) : '';
        const retryNote = retryAfter ? ' (Retry-After ' + String(retryAfter).slice(0, 40) + ')' : '';
        const err = new Error('Open-Meteo HTTP ' + res.status + suffix + retryNote);
        // A 429 is an upstream quota/rate-limit response: retrying immediately only adds load.
        if (res.status === 429 || (res.status >= 400 && res.status < 500 && res.status !== 408)) {
          err.nonRetryable = true;
        }
        throw err;
      }
      json = await res.json();
    } catch (err) {
      lastErr = err;
      if (err && err.nonRetryable) throw err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
    } finally {
      clearTimeout(timer);
    }
  }
  if (!json) throw lastErr || new Error('Open-Meteo 无响应');

  const list = Array.isArray(json)
    ? json.map((x) => x.daily).filter(Boolean)
    : json && json.daily
      ? [json.daily]
      : [];
  if (!list.length) throw new Error('Open-Meteo 返回无 daily 数据');
  if (list.length > 8) throw new Error('Open-Meteo 返回点位过多');
  if (list.length !== cfg.points.length) {
    throw new Error('Open-Meteo 返回点位数量不符：期望 ' + cfg.points.length + '，实际 ' + list.length);
  }
  const baseDates = list[0].time;
  list.forEach((daily, index) => {
    if (!Array.isArray(daily.time) || daily.time.length !== baseDates.length
      || daily.time.some((date, i) => date !== baseDates[i])) {
      throw new Error('Open-Meteo 点位日期不一致（点位 ' + (index + 1) + '）');
    }
    if (!Array.isArray(daily.time) || daily.time.length < 6) {
      throw new Error('Open-Meteo 第 ' + (index + 1) + ' 个点位缺少有效日期序列');
    }
    for (let i = 0; i < daily.time.length; i += 1) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(daily.time[i])
        || (i > 0 && daily.time[i] <= daily.time[i - 1])) {
        throw new Error('Open-Meteo 第 ' + (index + 1) + ' 个点位日期无效或未递增');
      }
    }
  });

  // 多点合成一份，与浏览器端 getDaily -> aggPoints 完全一致。
  const daily = aggPoints(list);
  const view = fromOpenMeteo({ daily });
  if (!view || !view.days || !view.days.length) throw new Error('数据不足，无法生成日视图');

  return { view, rawDaily: daily, fetchedAt: new Date().toISOString(), url };
}
