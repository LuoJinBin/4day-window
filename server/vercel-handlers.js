function sendJson(req, res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', String(Buffer.byteLength(body)));
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

export function createForecastHandler(service, { allowForceRefresh = false, planner } = {}) {
  return async function forecastHandler(req, res) {
    if (!methodAllowed(req, res)) return;
    let url;
    try {
      url = new URL(req.url || '/api/forecast', 'https://vercel.invalid');
    } catch {
      return sendJson(req, res, 400, { error: 'bad request URL' });
    }

    try {
      if (planner && (url.searchParams.has('latitude') || url.searchParams.has('longitude') || url.searchParams.has('timezone'))) {
        return await sendPlanner(req, res, () => planner.forecast(url.searchParams));
      }
      const force = allowForceRefresh && url.searchParams.get('force') === '1';
      const result = await service.get({ force });
      if (!result || !result.ok) {
        return sendJson(req, res, result && result.status ? result.status : 503, {
          error: result && result.error ? result.error : 'forecast unavailable',
          stale: true
        });
      }
      const view = result.view || {};
      if (!Array.isArray(view.days) || view.days.length === 0) {
        return sendJson(req, res, 503, { error: 'forecast result is empty', stale: true });
      }
      return sendJson(req, res, 200, {
        updatedAt: result.updatedAt || null,
        stale: result.stale === true,
        ageMinutes: Number.isFinite(result.ageMinutes) ? result.ageMinutes : null,
        source: 'Open-Meteo · 6 models · 4 points',
        days: view.days,
        windows: Array.isArray(view.windows) ? view.windows : []
      });
    } catch (err) {
      return sendJson(req, res, 500, {
        error: err && err.message ? err.message : 'forecast server error',
        stale: true
      });
    }
  };
}

export function createHealthHandler() {
  return function healthHandler(req, res) {
    if (!methodAllowed(req, res)) return;
    return sendJson(req, res, 200, {
      ok: true,
      service: 'guangzhou-4day-window-forecast',
      runtime: 'vercel-node-function',
      region: process.env.VERCEL_REGION || null
    });
  };
}

async function sendPlanner(req, res, load) {
  try {
    const payload = await load();
    return sendJson(req, res, 200, payload);
  } catch (error) {
    const status = [400, 422].includes(error.status) && error.nonRetryable !== true ? error.status
      : error.status === 429 ? 429 : 503;
    if (status === 429 && error.retryAfter) res.setHeader('retry-after', error.retryAfter);
    const message = status === 429 ? '天气服务请求较多，请稍后再试'
      : status === 503 ? '暂时无法获取数据，请稍后重试' : error.message;
    return sendJson(req, res, status, { error: message });
  }
}

export function createGeocodingHandler(planner) {
  return async function geocodingHandler(req, res) {
    if (!methodAllowed(req, res)) return;
    const url = new URL(req.url || '/api/geocoding', 'https://vercel.invalid');
    return sendPlanner(req, res, () => planner.search(url.searchParams));
  };
}
