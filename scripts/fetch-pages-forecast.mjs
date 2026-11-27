import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
    url.searchParams.set('hourly', 'weather_code');
    url.searchParams.set('forecast_days', '16');
    url.searchParams.set('forecast_hours', '168');
    url.searchParams.set('past_hours', '12');
  }
  return url.toString();
}

// Open-Meteo 的 US-West 节点曾出现 TLS/连接间歇性故障；默认 DNS 失败时，
 // 依次尝试同一主机的其他已观测节点。URL 主机名不变，因此仍校验正确的 TLS 证书。
const OPEN_METEO_FALLBACK_IPS = ['167.114.211.86', '157.90.83.168'];

async function requestJson(url, timeoutMs = 25000) {
  const target = new URL(url);
  const candidates = target.hostname === 'api.open-meteo.com'
    ? [null, ...OPEN_METEO_FALLBACK_IPS]
    : [null];
  const failures = [];

  for (const ip of candidates) {
    const args = [
      '--ipv4', '--silent', '--show-error', '--location',
      '--connect-timeout', '4',
      '--max-time', String(Math.max(8, Math.min(10, Math.floor(timeoutMs / 1000)))),
      '--header', 'accept: application/json',
      '--write-out', '__HTTP_STATUS__:%{http_code}'
    ];
    if (ip) args.push('--resolve', target.hostname + ':443:' + ip);
    args.push(url);

    try {
      const result = await execFileAsync('curl', args, {
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        timeout: timeoutMs + 3000
      });
      const marker = '__HTTP_STATUS__:';
      const index = result.stdout.lastIndexOf(marker);
      if (index < 0) throw new Error('响应缺少 HTTP 状态码');
      const body = result.stdout.slice(0, index);
      const status = Number(result.stdout.slice(index + marker.length).trim());
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        throw new Error('HTTP ' + status + '：数据源没有返回 JSON');
      }
      if (status < 200 || status >= 300 || data?.error) {
        throw new Error('HTTP ' + status + '：' + String(data?.reason || body).slice(0, 220));
      }
      if (ip) console.warn('Open-Meteo 默认节点不可用，已切换备用节点 ' + ip);
      return data;
    } catch (error) {
      const detail = error?.stderr || error?.message || String(error);
      failures.push((ip || '默认 DNS') + '：' + String(detail).trim().slice(0, 120));
    }
  }

  throw new Error('Open-Meteo 所有连接节点均失败：' + failures.join('；').slice(0, 360));
}

async function retryJson(url, attempts = 2) {
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
  const hourlyTimes = points[0]?.hourly?.time;
  if (!Array.isArray(hourlyTimes) || !hourlyTimes.length) throw new Error('预报缺少逐小时天气码');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const daylightTimes = hourlyTimes.filter((stamp) => {
    if (typeof stamp !== 'string' || stamp.slice(0, 10) !== today) return false;
    const hour = Number(stamp.slice(11, 13));
    return Number.isInteger(hour) && hour >= 7 && hour <= 17;
  });
  if (daylightTimes.length < 6) throw new Error('当天白天逐小时天气码不足');
  for (const [index, point] of points.entries()) {
    const time = point?.daily?.time;
    if (!Array.isArray(time) || time.length !== dates.length ||
      time.some((date, i) => date !== dates[i])) {
      throw new Error('四个城区点位的日期序列不一致（点位 ' + (index + 1) + '）');
    }
    const hourly = point?.hourly?.time;
    if (!Array.isArray(hourly) || hourly.length !== hourlyTimes.length ||
      hourly.some((stamp, i) => stamp !== hourlyTimes[i])) {
      throw new Error('四个城区点位的逐小时序列不一致（点位 ' + (index + 1) + '）');
    }
  }
  const hourlyModels = MODELS.filter((model) => points.some((point) => {
    const values = point?.hourly?.['weather_code_' + model];
    return Array.isArray(values) && daylightTimes.some((stamp) => {
      const i = hourlyTimes.indexOf(stamp);
      return i >= 0 && values[i] != null;
    });
  }));
  if (hourlyModels.length < 3) throw new Error('当天逐小时有效模式不足：' + hourlyModels.join(','));
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
      progress = validateProgress(await retryJson(makeUrl({ progress: true }), 1));
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
