const BASE = 'https://geocoding-api.open-meteo.com/v1/search';

const cache = new Map();
const TTL = 10 * 60 * 1000;

export async function searchCities(query, { fetchImpl = fetch, now = () => Date.now() } = {}) {
  const q = String(query || '').trim().replace(/\s+/g, ' ');
  if (q.length < 2) return [];
  if (q.length > 80) { const error = new Error('城市名称最多输入 80 个字符'); error.statusCode = 400; throw error; }
  const key = q.toLocaleLowerCase();
  const saved = cache.get(key);
  if (saved && now() - saved.ts < TTL) return saved.results;

  const url = new URL(BASE);
  url.searchParams.set('name', q);
  url.searchParams.set('count', '8');
  url.searchParams.set('language', 'zh');
  url.searchParams.set('format', 'json');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('城市搜索暂时不可用（HTTP ' + response.status + '）');
    const payload = await response.json();
    const results = (Array.isArray(payload.results) ? payload.results : []).map((item) => ({
      id: item.id,
      name: String(item.name || ''),
      admin1: String(item.admin1 || ''),
      country: String(item.country || ''),
      countryCode: String(item.country_code || ''),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      timezone: String(item.timezone || 'auto'),
      population: Number.isFinite(Number(item.population)) ? Number(item.population) : null
    })).filter((item) => item.name && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
      && item.latitude >= -90 && item.latitude <= 90 && item.longitude >= -180 && item.longitude <= 180);
    cache.set(key, { ts: now(), results });
    return results;
  } finally {
    clearTimeout(timer);
  }
}
