const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const MODELS = [
  'ecmwf_ifs025',
  'ecmwf_aifs025_single',
  'ukmo_seamless',
  'cma_grapes_global',
  'icon_seamless',
  'meteofrance_seamless'
];
const WEIGHTS = {
  ecmwf_ifs025: 0.18,
  ecmwf_aifs025_single: 0.18,
  ukmo_seamless: 0.16,
  cma_grapes_global: 0.16,
  icon_seamless: 0.14,
  meteofrance_seamless: 0.18
};
const DAILY = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max'
];
const HOURLY = [
  'weather_code',
  'temperature_2m',
  'apparent_temperature',
  'precipitation_probability',
  'precipitation',
  'wind_speed_10m'
];
const PLAN_TTL_MS = 20 * 60 * 1000;
const PLAN_STALE_MS = 6 * 60 * 60 * 1000;
const LOCATION_TTL_MS = 24 * 60 * 60 * 1000;

function sendJson(req, res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  res.end(req.method === 'HEAD' ? '' : body);
}

function methodAllowed(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  res.setHeader('allow', 'GET, HEAD');
  sendJson(req, res, 405, { error: 'method not allowed' });
  return false;
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function conditionForCode(code) {
  if (!Number.isFinite(code)) return '未知';
  if (code <= 1) return '晴';
  if (code === 2) return '多云';
  if (code === 3) return '阴';
  if (code === 45 || code === 48) return '雾';
  if (code <= 57) return '毛毛雨';
  if (code <= 67) return code >= 65 ? '大雨' : '小雨';
  if (code <= 77) return '雪';
  if (code <= 82) return '阵雨';
  if (code <= 86) return '阵雪';
  if (code >= 95) return '雷雨';
  return '未知';
}

function readValues(block, variable, index) {
  if (!block || typeof block !== 'object') return [];
  const hasModelKeys = MODELS.some((model) => Array.isArray(block[variable + '_' + model]));
  if (!hasModelKeys) {
    const base = block[variable];
    const value = Array.isArray(base) ? finiteNumber(base[index]) : null;
    return value == null ? [] : [{ model: 'best_match', value, weight: 1 }];
  }
  return MODELS.flatMap((model) => {
    const values = block[variable + '_' + model];
    const value = Array.isArray(values) ? finiteNumber(values[index]) : null;
    return value == null ? [] : [{ model, value, weight: WEIGHTS[model] || 0.1 }];
  });
}

function localTimeParts(timestamp, timeZone) {
  const safeZone = (() => {
    try { new Intl.DateTimeFormat('en-US', { timeZone }).format(); return timeZone; }
    catch { return 'UTC'; }
  })();
  const date = new Date(Number(timestamp) * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = {};
  parts.forEach((part) => { if (part.type !== 'literal') values[part.type] = part.value; });
  const local = values.year + '-' + values.month + '-' + values.day + 'T' + values.hour + ':' + values.minute;
  const abbreviation = new Intl.DateTimeFormat('en-US', { timeZone: safeZone, timeZoneName: 'short' })
    .formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || '';
  return { date: local.slice(0, 10), time: local, abbreviation };
}

function localDateValue(value, timeZone) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{9,}$/.test(value))) {
    return localTimeParts(value, timeZone).date;
  }
  return String(value).slice(0, 10);
}

function localHourValue(value, timeZone) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{9,}$/.test(value))) {
    const local = localTimeParts(value, timeZone);
    return { time: local.time, timeZoneAbbreviation: local.abbreviation };
  }
  return { time: String(value).slice(0, 16), timeZoneAbbreviation: '' };
}

function weightedCondition(values) {
  const votes = new Map();
  values.forEach(({ value, weight }) => {
    const label = conditionForCode(value);
    if (label === '未知') return;
    votes.set(label, (votes.get(label) || 0) + weight);
  });
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '暂无数据';
}

function aggregateBlock(block, variables, timeKey) {
  if (!block || !Array.isArray(block[timeKey])) {
    throw new Error('天气数据缺少有效时间序列');
  }
  const times = block[timeKey];
  return times.map((stamp, index) => {
    const codes = readValues(block, 'weather_code', index);
    const temps = readValues(block, variables.temperature, index);
    const apparent = variables.apparent ? readValues(block, variables.apparent, index) : [];
    const precipitation = readValues(block, variables.precipitation, index);
    const probabilities = readValues(block, variables.probability, index);
    const winds = readValues(block, variables.wind, index);
    const condition = weightedCondition(codes);
    const counts = [codes, temps, precipitation, probabilities, winds].map((items) => items.length);
    const modelCount = Math.max(0, ...counts);
    return {
      time: stamp,
      condition,
      temperature: median(temps.map((item) => item.value)),
      apparentTemperature: median(apparent.map((item) => item.value)),
      temperatureMax: median(readValues(block, variables.temperatureMax || variables.temperature, index).map((item) => item.value)),
      temperatureMin: median(readValues(block, variables.temperatureMin || variables.temperature, index).map((item) => item.value)),
      precipitation: median(precipitation.map((item) => item.value)),
      precipitationProbability: median(probabilities.map((item) => item.value)),
      precipitationProbabilityHigh: probabilities.length ? Math.max(...probabilities.map((item) => item.value)) : null,
      windSpeed: median(winds.map((item) => item.value)),
      modelCount
    };
  });
}

export function buildFlexibleForecastUrl(latitude, longitude) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('timeformat', 'unixtime');
  url.searchParams.set('forecast_days', '16');
  url.searchParams.set('forecast_hours', '384');
  url.searchParams.set('past_hours', '24');
  url.searchParams.set('daily', DAILY.join(','));
  url.searchParams.set('hourly', HOURLY.join(','));
  url.searchParams.set('models', MODELS.join(','));
  return url.toString();
}

export function normalizeFlexibleForecast(payload, updatedAt = new Date().toISOString(), modelMode = 'ensemble') {
  const item = Array.isArray(payload) ? payload[0] : payload;
  if (!item || !item.daily || !item.hourly) {
    throw new Error('天气服务没有返回逐日和逐小时数据');
  }
  const timeZone = item.timezone || 'UTC';
  const dailyBlock = { ...item.daily, time: item.daily.time.map((stamp) => localDateValue(stamp, timeZone)) };
  const hourInfo = item.hourly.time.map((stamp) => localHourValue(stamp, timeZone));
  const hourlyBlock = { ...item.hourly, time: hourInfo.map((entry) => entry.time) };
  const daily = aggregateBlock(dailyBlock, {
    temperature: 'temperature_2m_max',
    temperatureMax: 'temperature_2m_max',
    temperatureMin: 'temperature_2m_min',
    precipitation: 'precipitation_sum',
    probability: 'precipitation_probability_max',
    wind: 'wind_speed_10m_max'
  }, 'time').map((day) => ({
    date: day.time,
    condition: day.condition,
    temperatureMax: day.temperatureMax,
    temperatureMin: median(readValues(item.daily, 'temperature_2m_min', item.daily.time.indexOf(day.time)).map((v) => v.value)),
    precipitation: day.precipitation,
    precipitationProbability: day.precipitationProbability,
    precipitationProbabilityHigh: day.precipitationProbabilityHigh,
    windSpeed: day.windSpeed,
    modelCount: day.modelCount
  }));
  const hourly = aggregateBlock(hourlyBlock, {
    temperature: 'temperature_2m',
    apparent: 'apparent_temperature',
    precipitation: 'precipitation',
    probability: 'precipitation_probability',
    wind: 'wind_speed_10m'
  }, 'time').map((hour, index) => ({
    time: hour.time,
    timeZoneAbbreviation: hourInfo[index].timeZoneAbbreviation,
    condition: hour.condition,
    temperature: hour.temperature,
    apparentTemperature: hour.apparentTemperature,
    precipitation: hour.precipitation,
    precipitationProbability: hour.precipitationProbability,
    precipitationProbabilityHigh: hour.precipitationProbabilityHigh,
    windSpeed: hour.windSpeed,
    modelCount: hour.modelCount
  }));
  if (!daily.length || !hourly.length) throw new Error('天气服务返回的数据为空');
  if (daily.some((day) => !/^\d{4}-\d{2}-\d{2}$/.test(day.date))) {
    throw new Error('天气服务返回了无效日期');
  }
  if (hourly.some((hour) => typeof hour.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(hour.time))) {
    throw new Error('天气服务返回了无效小时');
  }
  return {
    timezone: item.timezone || 'auto',
    timezoneAbbreviation: item.timezone_abbreviation || '',
    utcOffsetSeconds: Number.isFinite(item.utc_offset_seconds) ? item.utc_offset_seconds : 0,
    days: daily,
    hours: hourly,
    modelMode,
    source: modelMode === 'ensemble' ? 'Open-Meteo 多模式综合' : 'Open-Meteo 最佳匹配模式',
    updatedAt
  };
}

async function requestJson(url, fetchImpl, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    const body = await response.text();
    if (!response.ok) {
      let reason = body;
      try {
        const parsed = body ? JSON.parse(body) : null;
        if (parsed && typeof parsed === 'object') reason = parsed.reason || parsed.message || body;
      } catch {}
      const error = new Error('天气服务 HTTP ' + response.status + (reason ? '：' + String(reason).slice(0, 180) : ''));
      error.status = response.status;
      throw error;
    }
    return body ? JSON.parse(body) : {};
  } finally {
    clearTimeout(timer);
  }
}

function cacheSet(cache, key, value, limit = 100) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value);
}

export function createPlanHandler({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  const cache = new Map();
  const inflight = new Map();

  async function load(latitude, longitude) {
    const key = latitude.toFixed(3) + ',' + longitude.toFixed(3);
    const cached = cache.get(key);
    const age = cached ? now() - cached.ts : Infinity;
    if (cached && age < PLAN_TTL_MS) {
      return { ...cached.payload, stale: false, ageMinutes: Math.max(0, Math.round(age / 60000)) };
    }
    if (inflight.has(key)) return inflight.get(key);

    const promise = (async () => {
      try {
        const primaryUrl = buildFlexibleForecastUrl(latitude, longitude);
        let payload;
        let modelMode = 'ensemble';
        try {
          payload = await requestJson(primaryUrl, fetchImpl);
        } catch (error) {
          if (error.status !== 400) throw error;
          const fallbackUrl = new URL(primaryUrl);
          fallbackUrl.searchParams.delete('models');
          payload = await requestJson(fallbackUrl.toString(), fetchImpl);
          modelMode = 'best_match';
        }
        const updatedAt = new Date(now()).toISOString();
        const normalized = normalizeFlexibleForecast(payload, updatedAt, modelMode);
        const entry = { ts: now(), payload: normalized };
        cacheSet(cache, key, entry);
        return { ...normalized, stale: false, ageMinutes: 0 };
      } catch (error) {
        const last = cache.get(key);
        if (last && now() - last.ts < PLAN_STALE_MS) {
          return {
            ...last.payload,
            stale: true,
            ageMinutes: Math.max(0, Math.round((now() - last.ts) / 60000)),
            warning: '暂时无法更新，当前显示的是上次成功取得的预报'
          };
        }
        throw error;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  }

  return async function planHandler(req, res) {
    if (!methodAllowed(req, res)) return;
    try {
      const url = new URL(req.url || '/api/plan', 'https://weather-planner.invalid');
      const latitude = finiteNumber(url.searchParams.get('lat'));
      const longitude = finiteNumber(url.searchParams.get('lon'));
      if (latitude == null || latitude < -90 || latitude > 90
        || longitude == null || longitude < -180 || longitude > 180) {
        return sendJson(req, res, 400, { error: '请提供有效的城市坐标' });
      }
      const result = await load(latitude, longitude);
      return sendJson(req, res, 200, result);
    } catch (error) {
      const status = error.status === 429 ? 429 : 502;
      return sendJson(req, res, status, {
        error: error && error.message ? error.message : '暂时无法取得天气预报'
      });
    }
  };
}

export function createLocationHandler({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  const cache = new Map();
  return async function locationHandler(req, res) {
    if (!methodAllowed(req, res)) return;
    try {
      const url = new URL(req.url || '/api/locations', 'https://weather-planner.invalid');
      const query = String(url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ');
      if (query.length < 2 || query.length > 80) {
        return sendJson(req, res, 400, { error: '请输入至少两个字的城市名称' });
      }
      const key = query.toLocaleLowerCase();
      const cached = cache.get(key);
      if (cached && now() - cached.ts < LOCATION_TTL_MS) {
        return sendJson(req, res, 200, { results: cached.results, cached: true });
      }
      const searchUrl = new URL(GEOCODING_URL);
      searchUrl.searchParams.set('name', query);
      searchUrl.searchParams.set('count', '8');
      searchUrl.searchParams.set('language', 'zh');
      searchUrl.searchParams.set('format', 'json');
      const payload = await requestJson(searchUrl.toString(), fetchImpl, 9000);
      const results = (Array.isArray(payload.results) ? payload.results : [])
        .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
        .map((item) => ({
          id: item.id,
          name: String(item.name || ''),
          country: String(item.country || ''),
          countryCode: String(item.country_code || ''),
          admin1: String(item.admin1 || ''),
          admin2: String(item.admin2 || ''),
          latitude: item.latitude,
          longitude: item.longitude,
          timezone: String(item.timezone || 'auto'),
          featureCode: String(item.feature_code || ''),
          population: Number.isFinite(item.population) ? item.population : null
        }));
      cacheSet(cache, key, { ts: now(), results }, 500);
      return sendJson(req, res, 200, { results, cached: false });
    } catch (error) {
      return sendJson(req, res, error.status === 429 ? 429 : 502, {
        error: error && error.message ? error.message : '城市搜索暂不可用'
      });
    }
  };
}
