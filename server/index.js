import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config, { ROOT } from './config.js';
import { createForecastService } from './forecast-service.js';
import { buildWindows } from '../src/core/logic.js';
import { ageMinutes, isFresh } from './cache.js';
import { startScheduler } from './scheduler.js';
import { parseForecastLocation } from './location.js';
import { searchCities } from './geocode.js';

const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const DATASETS = new Set(['climatology', 'backtest', 'weights', 'sources', 'condition-matrix', 'confidence-levels']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function securityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  securityHeaders(res);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
};

function readData(name) {
  if (!DATASETS.has(name)) return null;
  const file = path.join(DATA, name + '.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function resolvePublicPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { error: 400 };
  }
  if (decoded.includes('\0')) return { error: 400 };
  const relativePath = decoded.replace(/^[/\\]+/, '');
  const file = path.resolve(PUBLIC, relativePath || 'index.html');
  const relative = path.relative(PUBLIC, file);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    return { error: 403 };
  }
  return { file };
}

function serveStatic(req, res, url) {
  const resolved = resolvePublicPath(url.pathname);
  if (resolved.error) {
    res.writeHead(resolved.error, { 'content-type': 'text/plain; charset=utf-8' }).end(resolved.error === 403 ? 'forbidden' : 'bad request');
    return;
  }
  let file = resolved.file;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }

  const ext = path.extname(file).toLowerCase();
  let body = fs.readFileSync(file);
  if (ext === '.html') {
    body = Buffer.from(
      body.toString('utf8').replace("window.GZ_API_BASE = ''", "window.GZ_API_BASE = '/api/forecast'"),
      'utf8'
    );
  }

  securityHeaders(res);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': body.length,
    'cache-control': ext === '.html' || ['.js', '.mjs', '.css', '.json'].includes(ext)
      ? 'no-cache'
      : 'public, max-age=3600'
  });
  res.end(body);
}

export function createApp(cfg = config, deps = {}) {
  const service = deps.service || createForecastService(cfg, deps);
  const cityServices = new Map();
  const getService = (url) => {
    const parsed = parseForecastLocation(url, cfg, { cacheDir: path.join(ROOT, 'data/cache') });
    if (parsed.key === 'default') return { service, location: parsed.location };
    if (!cityServices.has(parsed.key)) cityServices.set(parsed.key, createForecastService(parsed.config, deps));
    return { service: cityServices.get(parsed.key), location: parsed.location };
  };
  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return json(res, 400, { error: 'bad request URL' });
    }
    const p = url.pathname;

    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('allow', 'GET, HEAD');
        return json(res, 405, { error: 'method not allowed' });
      }
      if (p === '/api/health') {
        const entry = service.peek();
        return json(res, 200, {
          ok: true,
          updatedAt: entry ? entry.iso : null,
          ageMinutes: ageMinutes(entry),
          stale: !isFresh(entry, cfg.cacheTtlMs),
          lastError: service.error() ? service.error().message : null
        });
      }

      if (p === '/api/geocode') {
        const results = await searchCities(url.searchParams.get('q'), { fetchImpl: deps.fetchImpl || fetch });
        return json(res, 200, { results });
      }

      if (p === '/api/forecast') {
        const active = getService(url);
        const allowForce = process.env.ALLOW_FORCE_REFRESH === 'true';
        const force = allowForce && url.searchParams.get('force') === '1';
        const r = await active.service.get({ force });
        if (!r.ok) return json(res, r.status || 503, { error: r.error, stale: true });
        return json(res, 200, {
          updatedAt: r.updatedAt,
          stale: r.stale,
          ageMinutes: r.ageMinutes,
          source: 'Open-Meteo · 6 weather models',
          location: active.location,
          timezone: r.timezone || active.location.timezone,
          hourly: r.rawHourly || null,
          days: r.view.days,
          windows: Array.isArray(r.view.windows) ? r.view.windows : buildWindows(r.view.days)
        });
      }

      if (p === '/api/forecast/raw') {
        const active = getService(url);
        const r = await active.service.get({});
        if (!r.ok) return json(res, r.status || 503, { error: r.error, stale: true });
        return json(res, 200, { updatedAt: r.updatedAt, stale: r.stale, ageMinutes: r.ageMinutes, rawDaily: r.rawDaily, rawHourly: r.rawHourly || null, timezone: r.timezone || active.location.timezone });
      }

      if (p === '/api/config') {
        return json(res, 200, {
          points: cfg.points,
          forecastDays: cfg.forecastDays,
          cacheTtlMinutes: cfg.cacheTtlMs / 60000
        });
      }

      if (p.startsWith('/api/data/')) {
        let name;
        try { name = decodeURIComponent(p.slice('/api/data/'.length)); }
        catch { return json(res, 400, { error: 'bad dataset path' }); }
        if (!DATASETS.has(name)) return json(res, 404, { error: 'unknown dataset: ' + name });
        const obj = readData(name);
        if (!obj) return json(res, 404, { error: 'dataset not found: ' + name });
        return json(res, 200, obj);
      }

      if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' });

      if (req.method === 'HEAD') {
        const resolved = resolvePublicPath(p);
        if (resolved.error) return res.writeHead(resolved.error).end();
        const file = resolved.file;
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
        const ext = path.extname(file).toLowerCase();
        securityHeaders(res);
        return res.writeHead(200, {
          'content-type': MIME[ext] || 'application/octet-stream',
          'cache-control': ext === '.html' || ['.js', '.mjs', '.css', '.json'].includes(ext) ? 'no-cache' : 'public, max-age=3600'
        }).end();
      }
      return serveStatic(req, res, url);
    } catch (err) {
      return json(res, 500, { error: err && err.message ? err.message : 'server error' });
    }
  });

  if (deps.scheduler !== false) {
    const stop = startScheduler(service, cfg, { logger: deps.logger || console });
    server.on('close', stop);
  }
  server.service = service;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp();
  server.listen(config.port, config.host, () => {
    console.log('广州四天窗口监测 · http://' + config.host + ':' + config.port);
    console.log('数据源 ' + config.forecastBase);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => server.close(() => process.exit(0)));
  }
}

export default createApp;
