import crypto from 'node:crypto';
import path from 'node:path';

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function one(url, key) {
  const values = url.searchParams.getAll(key);
  if (values.length > 1) badRequest('参数重复：' + key);
  return values.length ? values[0] : null;
}

function safeName(value, fallback = '') {
  return String(value || '').replace(/[<>\\u0000-\\u001f]/g, '').trim().slice(0, 80) || fallback;
}

export function parseForecastLocation(url, baseConfig, { cacheDir = path.dirname(baseConfig.cacheFile) } = {}) {
  const latRaw = one(url, 'lat');
  const lonRaw = one(url, 'lon');
  if (latRaw == null && lonRaw == null) {
    return {
      key: 'default',
      config: baseConfig,
      location: { name: '广州', admin1: '广东省', country: '中国', timezone: baseConfig.timezone || 'Asia/Shanghai', isDefault: true }
    };
  }
  if (latRaw == null || lonRaw == null) badRequest('经纬度必须同时提供');
  const lat = Number(latRaw), lon = Number(lonRaw);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    badRequest('城市坐标无效');
  }
  const timezone = one(url, 'timezone') || 'auto';
  if (timezone !== 'auto') {
    if (timezone.length > 64) badRequest('时区名称过长');
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); }
    catch { badRequest('不支持这个城市的时区'); }
  }
  const name = safeName(one(url, 'name'), '所选城市');
  const admin1 = safeName(one(url, 'admin1'));
  const country = safeName(one(url, 'country'));
  const key = crypto.createHash('sha256')
    .update([lat.toFixed(4), lon.toFixed(4), timezone].join('|'))
    .digest('hex').slice(0, 20);
  return {
    key,
    config: {
      ...baseConfig,
      points: [{ lat, lon }],
      timezone,
      cacheFile: path.join(cacheDir, 'gz-weather-' + key + '.json')
    },
    location: { name, admin1, country, lat, lon, timezone, isDefault: false }
  };
}
