import { aggPoints, CODE, MDL } from '../src/core/logic.js';
import { addDays, dateDistance, GUANGZHOU, localParts, validCity, validDate } from '../public/assets/planner-calendar.js';
import { fetchForecast, requestOpenMeteo } from './openmeteo.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const MODELS = Object.keys(MDL);
const HOURLY = ['weather_code', 'temperature_2m', 'apparent_temperature', 'precipitation',
  'precipitation_probability', 'cloud_cover', 'wind_speed_10m'];

function requestError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function forecastQuery(params, cfg, now) {
  const location = {
    id: 'forecast', name: 'forecast', timezone: params.get('timezone'),
    latitude: params.get('latitude')?.trim() ? Number(params.get('latitude')) : NaN,
    longitude: params.get('longitude')?.trim() ? Number(params.get('longitude')) : NaN
  };
  if (!validCity(location)) throw requestError('无效的坐标或时区');
  const { latitude, longitude, timezone } = location;
  const today = localParts(now, timezone).date;
  const last = addDays(today, cfg.forecastDays - 1);
  const start = params.get('start') ?? today;
  const end = params.get('end') ?? last;
  const kind = params.get('kind') ?? 'daily';
  if (!['daily', 'hourly'].includes(kind) || !validDate(start) || !validDate(end)) {
    throw requestError('无效的预报类型或日期');
  }
  if (start < today || end > last || dateDistance(start, end) < 0) {
    throw requestError('日期超出当地预报范围', 422);
  }
  const guangzhou = timezone === GUANGZHOU.timezone &&
    latitude === GUANGZHOU.latitude && longitude === GUANGZHOU.longitude;
  return { latitude, longitude, timezone, today, start, end, kind, guangzhou };
}

function createCache({ now, ttl, staleTtl, limit }) {
  const entries = new Map();
  const active = new Map();
  const failures = new Map();

  return async function cached(key, load) {
    const entry = entries.get(key);
    if (entry && now() - entry.saved < ttl) return { ...entry.value, stale: false };
    const failure = failures.get(key);
    if (failure && failure.until > now()) {
      if (entry && now() - entry.saved < staleTtl) return { ...entry.value, stale: true };
      throw failure.error;
    }
    if (active.has(key)) return active.get(key);
    const pending = (async () => {
      try {
        const value = await load();
        entries.delete(key);
        entries.set(key, { value, saved: now() });
        if (entries.size > limit) entries.delete(entries.keys().next().value);
        failures.delete(key);
        return { ...value, stale: false };
      } catch (error) {
        const retrySeconds = Number(error.retryAfter);
        const retryDate = Date.parse(error.retryAfter);
        const delay = retrySeconds > 0 ? retrySeconds * 1000 : retryDate - now();
        failures.delete(key);
        failures.set(key, { error, until: now() + (delay > 0 ? delay : MINUTE) });
        if (failures.size > limit) failures.delete(failures.keys().next().value);
        if (entry && now() - entry.saved < staleTtl) return { ...entry.value, stale: true };
        throw error;
      }
    })();
    active.set(key, pending);
    try { return await pending; } finally { active.delete(key); }
  };
}

function cityFromResult(r) {
  if (String(r.id) === GUANGZHOU.id) return GUANGZHOU;
  return {
    id: String(r.id), name: r.name, region: r.admin1 || r.admin2 || '', country: r.country || r.country_code || '',
    countryCode: r.country_code || '', latitude: r.latitude, longitude: r.longitude, timezone: r.timezone
  };
}

async function loadDaily(cfg, query, points, fetchImpl) {
  // Keep Guangzhou’s original four-point aggregation and daylight correction.
  const request = { ...cfg, points, timezone: query.timezone, startDate: query.start, endDate: query.end,
    today: query.today, minDays: 1, conditionForCode: code => code >= 95 ? ['阵雨', '雨'] : CODE(code) };
  if (query.guangzhou) delete request.conditionForCode;
  let result;
  try {
    result = await fetchForecast(request, { fetchImpl });
  } catch (error) {
    if (error.status !== 400 || !/timezone/i.test(error.message)) throw error;
    // Open-Meteo accepts a subset of IANA identifiers. Its automatic timezone
    // lookup uses the requested point and still returns local calendar dates.
    result = await fetchForecast({ ...request, timezone: 'auto' }, { fetchImpl });
  }
  return {
    data: result.view.days.map(({ recs, ...day }, index) => ({
      ...day, date: result.rawDaily.time[index],
      severeCode: query.guangzhou ? null : Math.max(-1, ...MODELS.map(model =>
        result.rawDaily['weather_code_' + model]?.[index] ?? -1))
    })).filter(day => day.date >= query.start && day.date <= query.end),
    updatedAt: result.fetchedAt
  };
}

async function loadHourly(cfg, query, points, fetchImpl, now) {
  const requestedEnd = addDays(query.end, 1);
  const upstreamEnd = addDays(localParts(now, 'UTC').date, 15);
  if (addDays(query.start, -1) > upstreamEnd) throw requestError('无逐小时预报覆盖', 422);
  const params = new URLSearchParams({
    latitude: points.map(p => p.lat).join(','), longitude: points.map(p => p.lon).join(','),
    timezone: 'GMT', timeformat: 'unixtime', hourly: HOURLY.join(','), models: MODELS.join(','),
    start_date: addDays(query.start, -1), end_date: requestedEnd < upstreamEnd ? requestedEnd : upstreamEnd
  });
  const upstream = await requestOpenMeteo(cfg.forecastBase + '?' + params, {
    fetchImpl, timeoutMs: cfg.requestTimeoutMs, attempts: cfg.attempts
  });
  const items = Array.isArray(upstream) ? upstream : [upstream];
  if (items.length !== points.length || items.some(item => !item?.hourly?.time?.length)) {
    throw requestError('逐小时预报缺少参考点数据', 503);
  }
  const rawPoints = items.map(item => item.hourly);
  const aggregate = aggPoints(rawPoints);
  const firstDate = addDays(query.start, -1);
  const lastDate = addDays(query.end, 1);
  const data = [];
  for (const [i, epoch] of aggregate.time.entries()) {
    if (!Number.isFinite(epoch)) continue;
    const stamp = epoch * 1000;
    const { date } = localParts(stamp, query.timezone);
    // A fractional UTC offset can put the first intersecting hour on the previous date.
    if (date < firstDate || date > lastDate) continue;
    const records = MODELS.map(model => {
      const codeKey = 'weather_code_' + model;
      const base = HOURLY.map(name => aggregate[name + '_' + model]?.[i] ?? null);
      if (base[0] == null || base[1] == null) return null;
      // The legacy spatial aggregator reduces codes to four sky classes. Keep
      // the most severe original code within the chosen class for hourly details.
      if (points.length > 1) {
        const sameClass = rawPoints.map(raw => raw[codeKey]?.[i]).filter(code =>
          code != null && hourlyClass(code) === hourlyClass(base[0]));
        if (sameClass.length) base[0] = Math.max(...sameClass);
      }
      // Open-Meteo precipitation is accumulated over the preceding hour.
      // The array represents the hour starting at this timestamp.
      base[3] = aggregate['precipitation_' + model]?.[i + 1] ?? null;
      base[4] = aggregate['precipitation_probability_' + model]?.[i + 1] ?? null;
      return base;
    });
    if (records.some(Boolean)) data.push([stamp, ...records]);
  }
  return { data, models: MODELS, updatedAt: new Date().toISOString() };
}

function hourlyClass(code) {
  if (code <= 1) return 'clear';
  if (code === 2) return 'cloudy';
  if (code <= 48) return 'overcast';
  return 'wet';
}

export function createPlannerService(cfg, { fetchImpl = fetch, now = Date.now } = {}) {
  const upstream = { ...cfg, requestTimeoutMs: Math.min(cfg.requestTimeoutMs, 10_000), attempts: 2 };
  const forecastCache = createCache({ now, ttl: cfg.cacheTtlMs, staleTtl: 48 * HOUR, limit: 96 });
  const geocodeCache = createCache({ now, ttl: 24 * HOUR, staleTtl: 7 * 24 * HOUR, limit: 256 });

  return {
    async forecast(params) {
      const query = forecastQuery(params, cfg, now());
      const { kind, latitude, longitude, timezone, today, start, end, guangzhou } = query;
      const points = guangzhou ? cfg.points : [{ lat: latitude, lon: longitude }];
      const key = JSON.stringify([kind, latitude, longitude, timezone, today, start, end]);
      const result = await forecastCache(key, async () => {
        const payload = kind === 'daily'
          ? await loadDaily(upstream, query, points, fetchImpl)
          : await loadHourly(upstream, query, points, fetchImpl, now());
        if (!payload.data.length || (kind === 'daily' && !payload.data.some(day => day.n > 0))) {
          throw requestError('所选日期暂无预报数据', 503);
        }
        return payload;
      });
      return { ...result, latitude, longitude, timezone, start, end, scope: guangzhou ? 'guangzhou-districts' : 'city-point' };
    },
    async search(params) {
      const query = (params.get('q') || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
      if (!query || query.length > 80) throw requestError('请输入有效的城市名称');
      const geocode = new URLSearchParams({ name: query, count: '15', language: 'zh', format: 'json' });
      return geocodeCache(query.toLocaleLowerCase('en'), async () => {
        const data = await requestOpenMeteo('https://geocoding-api.open-meteo.com/v1/search?' + geocode, {
          fetchImpl, timeoutMs: 4500, attempts: 2
        });
        return { cities: (data.results || []).map(cityFromResult).filter(validCity) };
      });
    }
  };
}
