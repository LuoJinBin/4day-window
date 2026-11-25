import { readCache, writeCache, isFresh, ageMinutes } from './cache.js';
import { fetchForecast } from './openmeteo.js';

// 单飞刷新 + 磁盘缓存。过期才重抓，失败保留旧数据并标记 stale。
export function createForecastService(cfg, { fetchImpl = fetch, now = () => Date.now(), logger = console } = {}) {
  let entry = readCache(cfg.cacheFile);
  let lastError = null;
  let inflight = null;

  async function refresh() {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const { view, rawDaily, rawHourly, timezone, fetchedAt, url } = await fetchForecast(cfg, { fetchImpl });
        const next = { ts: now(), iso: fetchedAt, view, rawDaily, rawHourly, timezone, fetchUrl: url };
        writeCache(cfg.cacheFile, next);
        entry = next;
        lastError = null;
        logger.log('[forecast] refreshed at ' + fetchedAt + ' · days=' + view.days.length);
        return next;
      } catch (err) {
        lastError = err;
        logger.warn('[forecast] refresh failed: ' + (err && err.message ? err.message : err));
        return null;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  async function get({ force = false } = {}) {
    if (force) await refresh();
    else if (!isFresh(entry, cfg.cacheTtlMs, now())) await refresh();

    if (!entry) {
      return { ok: false, error: lastError ? lastError.message : 'no data', status: 503 };
    }
    const fresh = isFresh(entry, cfg.cacheTtlMs, now());
    return {
      ok: true,
      stale: !fresh,
      ageMinutes: ageMinutes(entry, now()),
      updatedAt: entry.iso,
      view: entry.view,
      rawDaily: entry.rawDaily,
      rawHourly: entry.rawHourly || null,
      timezone: entry.timezone || cfg.timezone || 'Asia/Shanghai'
    };
  }

  return { get, refresh, peek: () => entry, error: () => lastError };
}
