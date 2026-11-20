import fs from 'node:fs';
import path from 'node:path';

// 磁盘缓存：{ ts, iso, view, fetchUrl }。写入用唯一临时文件 + rename，避免半截文件。
export function readCache(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const obj = JSON.parse(raw);
    if (!obj || !Number.isFinite(obj.ts) || obj.ts <= 0
      || !obj.view || !Array.isArray(obj.view.days) || obj.view.days.length === 0) return null;
    const iso = typeof obj.iso === 'string' && Number.isFinite(Date.parse(obj.iso))
      ? obj.iso
      : new Date(obj.ts).toISOString();
    return { ...obj, iso };
  } catch {
    return null;
  }
}

export function writeCache(file, entry) {
  if (!entry || !Number.isFinite(entry.ts) || entry.ts <= 0
    || !entry.view || !Array.isArray(entry.view.days) || entry.view.days.length === 0) {
    throw new Error('拒绝写入无效预报缓存');
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(entry, null, 2), { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw err;
  }
  return entry;
}

export function isFresh(entry, ttlMs, now = Date.now()) {
  return !!(entry && Number.isFinite(entry.ts) && entry.ts > 0
    && Number.isFinite(ttlMs) && ttlMs > 0
    && Number.isFinite(now) && now >= entry.ts && now - entry.ts < ttlMs);
}

export function ageMinutes(entry, now = Date.now()) {
  if (!entry || !Number.isFinite(entry.ts) || entry.ts <= 0 || !Number.isFinite(now)) return null;
  return Math.max(0, Math.round((now - entry.ts) / 60000));
}
