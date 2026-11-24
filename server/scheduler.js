// 定时检查：启动时与每个周期都走 TTL-aware get；有效缓存不重复请求。
export function startScheduler(service, cfg, { logger = console } = {}) {
  const intervalMs = Math.max(cfg.refreshMinutes, 5) * 60 * 1000;

  service.get({}).catch((err) => logger.warn('[scheduler] ' + (err && err.message ? err.message : err)));

  const timer = setInterval(() => {
    service.get({}).catch((err) => logger.warn('[scheduler] ' + (err && err.message ? err.message : err)));
  }, intervalMs);
  timer.unref?.();

  return () => clearInterval(timer);
}
