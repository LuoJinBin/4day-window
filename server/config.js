import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// 四个城区点位：荔湾、越秀、天河、海珠。合成方式见 src/core/logic.js 的 aggPoints。
const DEFAULT_POINTS = [
  { lat: 23.125, lon: 113.24 }, // 荔湾
  { lat: 23.129, lon: 113.267 }, // 越秀
  { lat: 23.135, lon: 113.33 }, // 天河
  { lat: 23.09, lon: 113.31 } // 海珠
];

function parsePoints(raw) {
  if (!raw) return DEFAULT_POINTS;
  const list = raw.split(';').map((s) => s.trim()).filter(Boolean).map((pair) => {
    const [lat, lon] = pair.split(',').map(Number);
    return { lat, lon };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  return list.length ? list : DEFAULT_POINTS;
}

export const config = {
  port: num(process.env.PORT, 8787),
  host: process.env.HOST || '127.0.0.1',
  // 与页面一致的 6 小时缓存；服务端重启后仍复用磁盘缓存。
  cacheTtlMs: num(process.env.CACHE_TTL_MINUTES, 360) * 60 * 1000,
  refreshMinutes: num(process.env.REFRESH_INTERVAL_MINUTES, 360),
  cacheFile: process.env.CACHE_FILE || path.join(ROOT, 'data/cache/forecast.json'),
  // Open-Meteo 预报接口；可指向自建代理，路径与参数保持不变。
  forecastBase: process.env.OPEN_METEO_BASE || 'https://api.open-meteo.com/v1/forecast',
  points: parsePoints(process.env.FORECAST_POINTS),
  forecastDays: num(process.env.FORECAST_DAYS, 16),
  requestTimeoutMs: num(process.env.REQUEST_TIMEOUT_MS, 14000)
};

export default config;
