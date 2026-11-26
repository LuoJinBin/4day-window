import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'public/assets/live-forecast.json');
const PUBLISHED_URL = 'https://luojinbin.github.io/4day-window/assets/live-forecast.json';

const MODELS = [
  'ecmwf_ifs025',
  'ecmwf_aifs025_single',
  'ukmo_seamless',
  'cma_grapes_global',
  'icon_seamless',
  'meteofrance_seamless'
];
const LATITUDE = '23.125,23.129,23.135,23.09';
const LONGITUDE = '113.24,113.267,113.33,113.31';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max';

function makeUrl({ progress = false } = {}) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', LATITUDE);
  url.searchParams.set('longitude', LONGITUDE);
  url.searchParams.set('daily', progress ? 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' : DAILY);
  url.searchParams.set('timezone', 'Asia/Shanghai');
  url.searchParams.set('models', MODELS.join(','));
  if (progress) {
    url.searchParams.set('hourly', 'precipitation');
    url.searchParams.set('past_days', '7');
    url.searchParams.set('forecast_days', '1');
  } else {
    url.searchParams.set('forecast_days', '16');
  }
  return url.toString();
}

async function requestJson(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    const body = await response.text();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error('HTTP ' + response.status + '：数据源没有返回 JSON');
    }
    if (!response.ok || data?.error) {
      throw new Error('HTTP ' + response.status + '：' + String(data?.reason || body).slice(0, 220));
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('请求超时（' + timeoutMs + 'ms）');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function retryJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestJson(url);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise(resolve => setTimeout(resolve, 1200 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function asPoints(payload) {
  return Array.isArray(payload) ? payload : [payload];
}

function validateForecast(payload) {
  const points = asPoints(payload);
  if (points.length !== 4) throw new Error('预报点位数量异常：' + points.length);
  const dates = points[0]?.daily?.time;
  if (!Array.isArray(dates) || dates.length < 6) throw new Error('预报日期不足');
  for (const [index, point] of points.entries()) {
    const time = point?.daily?.time;
    if (!Array.isArray(time) || time.length !== dates.length ||
      time.some((date, i) => date !== dates[i])) {
      throw new Error('四个城区点位的日期序列不一致（点位 ' + (index + 1) + '）');
    }
  }
  const availableModels = MODELS.filter(model => points.some(point =>
    Array.isArray(point.daily['weather_code_' + model]) &&
    point.daily['weather_code_' + model].some(value => value != null)
  ));
  if (availableModels.length < 3) {
    throw new Error('有效模式不足：' + availableModels.join(','));
  }
  return points;
}

function validateProgress(payload) {
  const points = asPoints(payload);
  if (points.length !== 4) throw new Error('前序降雨估算点位数量异常');
  const dailyDates = points[0]?.daily?.time;
  const hourlyTimes = points[0]?.hourly?.time;
  if (!Array.isArray(dailyDates) || !Array.isArray(hourlyTimes)) {
    throw new Error('前序降雨估算缺少逐日或逐小时数据');
  }
  for (const [index, point] of points.entries()) {
    if (!Array.isArray(point?.daily?.time) ||
      point.daily.time.some((date, i) => date !== dailyDates[i]) ||
      !Array.isArray(point?.hourly?.time) ||
      point.hourly.time.some((time, i) => time !== hourlyTimes[i])) {
      throw new Error('前序降雨估算点位时间序列不一致（点位 ' + (index + 1) + '）');
    }
  }
  return points;
}

async function fetchPreviousSnapshot() {
  try {
    const previous = await requestJson(PUBLISHED_URL + '?fallback=' + Date.now(), 10000);
    if (previous?.schemaVersion === 1 && Array.isArray(previous.forecast) && previous.forecast.length === 4) {
      return previous;
    }
  } catch {}
  return null;
}

async function main() {
  const attemptedAt = new Date().toISOString();
  let forecast;
  let progress = null;
  let fetchedAt = attemptedAt;
  let progressFetchedAt = null;
  let lastError = null;
  let progressError = null;

  try {
    forecast = validateForecast(await retryJson(makeUrl()));
  } catch (error) {
    const previous = await fetchPreviousSnapshot();
    if (!previous) {
      throw new Error('Open-Meteo 预报请求失败，且网站还没有可沿用的同步数据：' + error.message);
    }
    forecast = previous.forecast;
    progress = previous.progress || null;
    fetchedAt = previous.fetchedAt;
    progressFetchedAt = previous.progressFetchedAt || null;
    progressError = previous.progressError || null;
    lastError = String(error.message || error).slice(0, 240);
    console.warn('本轮预报获取失败，保留上次成功数据：' + lastError);
  }

  if (!lastError) {
    try {
      progress = validateProgress(await retryJson(makeUrl({ progress: true }), 2));
      progressFetchedAt = attemptedAt;
    } catch (error) {
      progressError = String(error.message || error).slice(0, 180);
      console.warn('前序时段估算未更新：' + progressError);
    }
  }

  const payload = {
    schemaVersion: 1,
    source: 'Open-Meteo Forecast API',
    fetchedAt,
    lastAttemptAt: attemptedAt,
    lastError,
    progressFetchedAt,
    progressError,
    forecast,
    progress
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(payload), 'utf8');
  console.log(
    '静态预报快照已生成：4 个广州城区点位，' + MODELS.length +
    ' 个模式；数据时间 ' + fetchedAt + (lastError ? '（沿用上次成功数据）' : '')
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
