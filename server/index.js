import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import config, { ROOT } from './config.js';
import { createForecastService } from './forecast-service.js';
import { buildWindows } from '../src/core/logic.js';
import { startScheduler } from './scheduler.js';

const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');

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

const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
};

function readData(name) {
  const file = path.join(DATA, name + '.json');
  if (!file.startsWith(DATA + path.sep)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const rel = decodeURIComponent(url.pathname);
  let file = path.join(PUBLIC, rel === '/' ? 'index.html' : rel);

  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }

  const ext = path.extname(file).toLowerCase();
  let body = fs.readFileSync(file);

  // 本地起服务时把前端数据源切到同源 /api/forecast（静态部署则保持直连 Open-Meteo）。
  if (ext === '.html') {
    body = Buffer.from(
      body.toString('utf8').replace("window.GZ_API_BASE = ''", "window.GZ_API_BASE = '/api/forecast'"),
      'utf8'
    );
  }

  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': body.length,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });
  res.end(body);
}

export function createApp(cfg = config, deps = {}) {
  const service = deps.service || createForecastService(cfg, deps);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    try {
      if (p === '/api/health') {
        const entry = service.peek();
        return json(res, 200, {
          ok: true,
          updatedAt: entry ? entry.iso : null,
          ageMinutes: entry ? Math.round((Date.now() - entry.ts) / 60000) : null,
          stale: entry ? Date.now() - entry.ts >= cfg.cacheTtlMs : true,
          lastError: service.error() ? service.error().message : null
        });
      }

      if (p === '/api/forecast') {
        const allowForce = process.env.ALLOW_FORCE_REFRESH === 'true';
        const force = allowForce && url.searchParams.get('force') === '1';
        const r = await service.get({ force });
        if (!r.ok) return json(res, r.status || 503, { error: r.error });
        return json(res, 200, {
          updatedAt: r.updatedAt,
          stale: r.stale,
          ageMinutes: r.ageMinutes,
          source: 'Open-Meteo · 6 models · 4 points',
          days: r.view.days,
          windows: Array.isArray(r.view.windows) ? r.view.windows : buildWindows(r.view.days)
        });
      }

      if (p === '/api/forecast/raw') {
        const r = await service.get({});
        if (!r.ok) return json(res, r.status || 503, { error: r.error });
        return json(res, 200, { updatedAt: r.updatedAt, rawDaily: r.rawDaily });
      }

      if (p === '/api/config') {
        return json(res, 200, {
          points: cfg.points,
          forecastDays: cfg.forecastDays,
          cacheTtlMinutes: cfg.cacheTtlMs / 60000
        });
      }

      if (p.startsWith('/api/data/')) {
        const name = p.slice('/api/data/'.length).replace(/\W/g, '');
        const obj = readData(name);
        if (!obj) return json(res, 404, { error: 'unknown dataset: ' + name });
        return json(res, 200, obj);
      }

      if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' });

      return serveStatic(req, res);
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

if (process.argv[1] === new URL(import.meta.url).pathname) {
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
