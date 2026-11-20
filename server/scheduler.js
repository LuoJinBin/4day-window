// 定时刷新：启动即刷一次，之后按 REFRESH_INTERVAL_MINUTES 轮询。
// 只在数据过期时真正请求；进程退出时清理定时器。
export function startScheduler(service, cfg, { logger = console } = {}) {
  const intervalMs = Math.max(cfg.refreshMinutes, 5) * 60 * 1000;

  service.refresh().catch(() => {});

  const timer = setInterval(() => {
    service.get({ force: true }).catch((err) => logger.warn('[scheduler] ' + (err && err.message ? err.message : err)));
  }, intervalMs);
  timer.unref?.();

  return () => clearInterval(timer);
}
