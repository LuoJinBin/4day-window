import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function intEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(name + ' must be an integer between ' + min + ' and ' + max);
  }
  return value;
}

// 四个城区点位：荔湾、越秀、天河、海珠。可配置 1–8 个有效坐标。
const DEFAULT_POINTS = [
  { lat: 23.125, lon: 113.24 }, // 荔湾
  { lat: 23.129, lon: 113.267 }, // 越秀
  { lat: 23.135, lon: 113.33 }, // 天河
  { lat: 23.09, lon: 113.31 } // 海珠
];

export function parsePoints(raw) {
  if (raw == null || String(raw).trim() === '') return DEFAULT_POINTS.map((p) => ({ ...p }));
  const pairs = String(raw).split(';').map((s) => s.trim());
  if (pairs.length < 1 || pairs.length > 8 || pairs.some((s) => !s)) {
    throw new Error('FORECAST_POINTS must contain 1–8 non-empty lat,lon pairs');
  }
  return pairs.map((pair, index) => {
    const values = pair.split(',').map((s) => s.trim());
    if (values.length !== 2 || values.some((s) => !s)) {
      throw new Error('FORECAST_POINTS item ' + (index + 1) + ' must be lat,lon');
    }
    const [lat, lon] = values.map(Number);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new Error('FORECAST_POINTS item ' + (index + 1) + ' has an invalid coordinate');
    }
    return { lat, lon };
  });
}

export const config = {
  port: intEnv('PORT', 8787, 1, 65535),
  host: process.env.HOST && process.env.HOST.trim() ? process.env.HOST.trim() : '127.0.0.1',
  cacheTtlMs: intEnv('CACHE_TTL_MINUTES', 360, 5, 1440) * 60 * 1000,
  refreshMinutes: intEnv('REFRESH_INTERVAL_MINUTES', 360, 5, 1440),
  cacheFile: process.env.CACHE_FILE || path.join(ROOT, 'data/cache/forecast.json'),
  forecastBase: process.env.OPEN_METEO_BASE || 'https://api.open-meteo.com/v1/forecast',
  points: parsePoints(process.env.FORECAST_POINTS),
  forecastDays: intEnv('FORECAST_DAYS', 16, 6, 16),
  requestTimeoutMs: intEnv('REQUEST_TIMEOUT_MS', 14000, 1000, 120000)
};

export default config;
