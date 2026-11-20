import fs from 'node:fs';
import path from 'node:path';

// 磁盘缓存：{ ts, iso, view, fetchUrl }。写入用临时文件 + rename，避免半截文件。
export function readCache(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.ts !== 'number' || !obj.view) return null;
    return obj;
  } catch {
    return null;
  }
}

export function writeCache(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entry, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return entry;
}

export function isFresh(entry, ttlMs, now = Date.now()) {
  return !!(entry && entry.ts && now - entry.ts < ttlMs);
}

export function ageMinutes(entry, now = Date.now()) {
  if (!entry || !entry.ts) return null;
  return Math.round((now - entry.ts) / 60000);
}
