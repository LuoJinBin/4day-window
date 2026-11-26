import { aggPoints, fromOpenMeteo, MDL } from '../src/core/logic.js';
import { addDays } from '../public/assets/planner-calendar.js';

const DAILY = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max'
];

// 四点多值 + 六模式：16 天逐日预报，并为近 7 天补充 07:00–17:00 日间逐小时天气码。
export function buildForecastUrl(cfg) {
  const lat = cfg.points.map((p) => p.lat).join(',');
  const lon = cfg.points.map((p) => p.lon).join(',');
  const models = Object.keys(MDL).join(',');
  const qs = [
    'latitude=' + lat,
    'longitude=' + lon,
    'daily=' + DAILY.join(','),
    'hourly=weather_code',
    'timezone=' + encodeURIComponent(cfg.timezone || 'Asia/Shanghai'),
    ...(cfg.startDate ? ['start_date=' + cfg.startDate, 'end_date=' + cfg.endDate] :
      ['forecast_days=' + cfg.forecastDays, 'forecast_hours=168', 'past_hours=12']),
    'models=' + models
  ].join('&');
  return cfg.forecastBase + '?' + qs;
}


// Open-Meteo daily weather_code is the most severe condition of the day,
// not the representative daytime sky. Derive a daylight category from hourly
// codes so a few overcast hours do not label an otherwise clear/partly-cloudy day "overcast".
function weatherGroup(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'cloudy';
  if (code === 3 || code === 45 || code === 48) return 'overcast';
  return 'precipitation';
}

function applyDaylightWeatherCodes(daily, hourly, cutoff) {
  if (!daily || !Array.isArray(daily.time) || !hourly
    || !Array.isArray(hourly.time)) return 0;

  const indicesByDate = new Map();
  hourly.time.forEach((stamp, index) => {
    if (typeof stamp !== 'string') return;
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):/.exec(stamp);
    if (!match || (cutoff && match[1] >= cutoff)) return;
    const hour = Number(match[2]);
    if (hour < 7 || hour > 17) return;
    const indices = indicesByDate.get(match[1]) || [];
    indices.push(index);
    indicesByDate.set(match[1], indices);
  });

  let applied = 0;
  Object.keys(MDL).forEach((model) => {
    const key = 'weather_code_' + model;
    const hourlyCodes = hourly[key];
    const dailyCodes = daily[key];
    if (!Array.isArray(hourlyCodes) || !Array.isArray(dailyCodes)) return;

    daily.time.forEach((date, dayIndex) => {
      const original = dailyCodes[dayIndex];
      // Keep precipitation as the most severe condition; precipitation risk is
      // also evaluated independently from daily amount and probability.
      if (original == null || weatherGroup(original) === 'precipitation') return;

      const indices = indicesByDate.get(date) || [];
      const counts = { clear: 0, cloudy: 0, overcast: 0 };
      let valid = 0;
      indices.forEach((hourIndex) => {
        const code = hourlyCodes[hourIndex];
        if (code == null) return;
        const group = weatherGroup(code);
        if (group === 'precipitation') return;
        counts[group] += 1;
        valid += 1;
      });
      // A model must provide at least six daylight hours; otherwise retain its
      // daily code rather than manufacture a daytime classification.
      if (valid < 6) return;

      const overcastShare = counts.overcast / valid;
      const clearShare = counts.clear / valid;
      dailyCodes[dayIndex] = overcastShare >= 0.6 ? 3 : clearShare >= 0.6 ? 0 : 2;
      applied += 1;
    });
  });
  return applied;
}

export async function requestOpenMeteo(url, { fetchImpl = fetch, timeoutMs = 14_000, attempts = 3 } = {}) {
  let json;
  let lastErr;
  // Retry transient upstream errors with a short delay and identical parameters.
  for (let attempt = 0; attempt < attempts && !json; attempt += 1) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
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
        err.status = res.status;
        err.retryAfter = retryAfter;
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
      if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 1500));
    } finally {
      clearTimeout(timer);
    }
  }
  if (!json) throw lastErr || new Error('Open-Meteo 无响应');

  return json;
}

// Returns the existing daily score and the original local calendar dates.
export async function fetchForecast(cfg, { fetchImpl = fetch } = {}) {
  const url = buildForecastUrl(cfg);
  const json = await requestOpenMeteo(url, { fetchImpl, timeoutMs: cfg.requestTimeoutMs, attempts: cfg.attempts });

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
    if (!Array.isArray(daily.time) || daily.time.length < (cfg.minDays || 6)) {
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

  // Hourly data is supplemental: if any point lacks it or timestamps disagree,
  // retain the validated daily forecast rather than failing the whole response.
  const hourlyList = Array.isArray(json)
    ? json.map((x) => x.hourly).filter(Boolean)
    : json && json.hourly
      ? [json.hourly]
      : [];
  if (hourlyList.length === cfg.points.length) {
    try {
      const hourly = aggPoints(hourlyList);
      applyDaylightWeatherCodes(daily, hourly, cfg.today ? addDays(cfg.today, 7) : null);
    } catch {
      // Daily weather_code remains the safe fallback when hourly data is incomplete.
    }
  }

  const view = fromOpenMeteo({ daily }, cfg);
  if (!view || !view.days || !view.days.length) throw new Error('数据不足，无法生成日视图');

  return { view, rawDaily: daily, fetchedAt: new Date().toISOString(), url };
}
