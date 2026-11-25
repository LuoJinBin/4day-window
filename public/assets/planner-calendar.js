export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
export const GUANGZHOU = Object.freeze({
  id: '1809858', name: '广州', region: '广东', country: '中国', countryCode: 'CN',
  latitude: 23.129, longitude: 113.267, timezone: 'Asia/Shanghai'
});
export const QUICK_CITIES = [
  GUANGZHOU,
  { id: '1816670', name: '北京', region: '北京市', country: '中国', countryCode: 'CN', latitude: 39.9075, longitude: 116.39723, timezone: 'Asia/Shanghai' },
  { id: '1796236', name: '上海', region: '上海市', country: '中国', countryCode: 'CN', latitude: 31.22222, longitude: 121.45806, timezone: 'Asia/Shanghai' },
  { id: '1795565', name: '深圳', region: '广东', country: '中国', countryCode: 'CN', latitude: 22.54554, longitude: 114.0683, timezone: 'Asia/Shanghai' }
];

const formatters = new Map();
export function localParts(value, timezone) {
  let format = formatters.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    if (formatters.size >= 128) formatters.delete(formatters.keys().next().value);
    formatters.set(timezone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(value).map(({ type, value: part }) => [type, part]));
  return { date: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
}

export function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(date + 'T00:00:00Z');
  return Number.isFinite(+value) && value.toISOString().slice(0, 10) === date;
}

export function addDays(date, count) {
  return new Date(Date.parse(date + 'T00:00:00Z') + count * DAY_MS).toISOString().slice(0, 10);
}

export function dateDistance(from, to) {
  return (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY_MS;
}

export function weekday(date) {
  return new Date(date + 'T00:00:00Z').getUTCDay();
}

export function clockMinutes(time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

export const PERIODS = {
  all: ['全天', '00:00', '24:00'], morning: ['上午', '06:00', '12:00'],
  afternoon: ['下午', '12:00', '18:00'], evening: ['晚上', '18:00', '24:00']
};

export function periodOf(preset, start, end) {
  const selection = PERIODS[preset] || ['自定义', start, end];
  const from = clockMinutes(selection[1]);
  const until = selection[2] === '24:00' ? 1440 : clockMinutes(selection[2]);
  if (!Number.isFinite(from) || !Number.isFinite(until) || from === until) return null;
  return { preset, label: selection[0], start: selection[1], end: selection[2], from, until, overnight: until < from && until !== 0 };
}

// Treat each forecast as a one-hour interval starting at its valid time.
// A repeated local hour has two distinct UTC timestamps, and a skipped hour has none.
export function selectedHours(date, period, timezone) {
  const anchor = Date.parse(date + 'T00:00:00Z');
  const end = period.until <= period.from ? period.until + 1440 : period.until;
  const hours = [];
  const minuteOf = parts => dateDistance(date, parts.date) * 1440 + clockMinutes(parts.time);
  for (let stamp = anchor - 14 * HOUR_MS; stamp < anchor + 61 * HOUR_MS; stamp += HOUR_MS) {
    const local = localParts(stamp, timezone);
    const minute = minuteOf(local);
    const lastMinute = minuteOf(localParts(stamp + HOUR_MS - MINUTE_MS, timezone));
    let endStamp = minute < end && lastMinute >= period.from
      ? stamp + Math.min(60, end - minute) * MINUTE_MS : null;
    if (lastMinute !== minute + 59) {
      // Some zones change their clocks by half an hour within a UTC forecast slot.
      // Check that the interval actually contains at least one selected wall minute.
      endStamp = null;
      for (let instant = stamp; instant < stamp + HOUR_MS; instant += MINUTE_MS) {
        const wallMinute = minuteOf(localParts(instant, timezone));
        if (wallMinute >= period.from && wallMinute < end) endStamp = instant + MINUTE_MS;
      }
    }
    if (endStamp == null) continue;
    const offset = (Date.parse(local.date + 'T' + local.time + 'Z') - stamp) / MINUTE_MS;
    hours.push({ stamp, endStamp, ...local, offset });
  }
  return hours;
}

export function validCity(city) {
  if (!city || typeof city.id !== 'string' || typeof city.name !== 'string' || !city.name
    || typeof city.timezone !== 'string' || !city.timezone
    || !Number.isFinite(city.latitude) || Math.abs(city.latitude) > 90
    || !Number.isFinite(city.longitude) || Math.abs(city.longitude) > 180) return false;
  try { localParts(0, city.timezone); return true; } catch { return false; }
}
