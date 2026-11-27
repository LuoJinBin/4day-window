import { addDays, dateDistance, selectedHours, weekday } from './planner-calendar.js';

export const TIERS = {
  strict: '严格晴好', loose: '阴天可考虑', trend: '仅作趋势参考',
  unsuitable: '天气不理想', unavailable: '预报不足'
};

export function weatherLabel(code) {
  if (code == null) return '暂无预报';
  if (code <= 1) return '晴';
  if (code === 2) return '多云';
  if (code === 3) return '阴';
  if (code <= 48) return '雾';
  if (code >= 95) return '雷雨';
  if ([56, 57, 66, 67].includes(code)) return '冻雨';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '雪';
  return code <= 57 ? '小雨' : code >= 80 ? '阵雨' : '雨';
}

export function severeWeather(code) {
  const label = weatherLabel(code);
  return ['雷雨', '冻雨', '雪'].includes(label) ? label : '';
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function peak(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Math.max(...valid) : null;
}

function modelRecord(rows, model, name, conditionForCode) {
  const conditions = rows.map(row => row[0]);
  const risks = conditions.filter(code => code >= 51);
  const clear = conditions.filter(code => code <= 1).length;
  const bright = conditions.filter(code => code <= 2).length;
  const representative = risks.length ? Math.max(...risks) :
    bright < conditions.length * 0.4 ? 3 : clear >= conditions.length * 0.6 ? 0 : 2;
  const rain = rows.map(row => row[3]);
  const amount = rain.every(Number.isFinite) ? rain.reduce((sum, value) => sum + value, 0) : null;
  const temperatures = rows.map(row => row[1]);
  return {
    p: model, name, cond: representative >= 95 ? '阵雨' : conditionForCode(representative)[0],
    hi: Math.max(...temperatures), lo: Math.min(...temperatures), wind: peak(rows.map(row => row[6])),
    pop: peak(rows.map(row => row[4])), mm: amount, out: false
  };
}

export function dayReasons(day) {
  if (!day.n) return [day.missing || '没有完整的逐小时预报'];
  const reasons = [];
  if (day.rainy) reasons.push('有明显降雨风险');
  else if (day.mist || day.popMax >= 40 || day.mmMed >= 1) reasons.push('部分预报提示有雨');
  if (day.severe) reasons.push('有预报提示' + day.severe);
  if (day.windRisk >= 35) reasons.push('部分预报风速较高');
  if (day.feelsMax >= 34 || day.hi >= 32) reasons.push('偏热');
  if ((day.feelsMin ?? day.lo) < 10) reasons.push('偏冷');
  if (day.overcast) reasons.push('天空多为阴天');
  else if (day.cloud >= 80) reasons.push('云层较厚');
  if (day.diverge) reasons.push('各家预报有分歧');
  if (day.thin) reasons.push('只有一家机构有完整数据');
  if (!day.thin && day.conf < 2) reasons.push(day.lead > 7 ? '日期较远，预报容易变化' : '预报把握有限');
  return reasons;
}

export function assessDay(raw) {
  const day = { ...raw, severe: severeWeather(raw.severeCode), windRisk: raw.wind };
  if (day.severe) {
    day.ok = false;
    day.loose = false;
    day.trend = false;
  }
  day.reasons = dayReasons(day);
  return day;
}

export function indexHourly(payload) {
  return { models: payload.models, rows: new Map(payload.data.map(([stamp, ...rows]) => [stamp, rows])) };
}

export function hourDetails(date, period, timezone, indexed) {
  return selectedHours(date, period, timezone).map(slot => ({
    ...slot, values: indexed.rows.get(slot.stamp) || []
  }));
}

export function assessPeriod(date, period, timezone, index, today, scoring) {
  const slots = hourDetails(date, period, timezone, index);
  const records = [];
  for (const [indexOfModel, model] of index.models.entries()) {
    const rows = slots.map(slot => slot.values[indexOfModel]);
    if (!rows.length || rows.some(row => !row || !Number.isFinite(row[0]) || !Number.isFinite(row[1]) ||
      (!Number.isFinite(row[3]) && !Number.isFinite(row[4])))) continue;
    records.push(modelRecord(rows, model, scoring.models[model], scoring.code));
  }
  if (!records.length) {
    const missing = slots.length ? '这段时间缺少完整的逐小时预报' : '当地时钟跳时，这段时间没有可用小时';
    return { date, n: 0, reasons: [missing], missing };
  }

  const lead = dateDistance(today, date);
  const metrics = scoring.metrics(records, null, lead);
  const values = slots.flatMap(slot => slot.values.filter(Boolean));
  const feels = values.map(row => row[2]).filter(Number.isFinite);
  const severe = values.map(row => severeWeather(row[0])).find(Boolean) || '';
  const windRisk = peak(values.map(row => row[6]));
  const feelsMax = peak(feels);
  const feelsMin = feels.length ? Math.min(...feels) : null;
  const cloud = average(values.map(row => row[5]));
  const discomfort = Math.max(0, (windRisk ?? 0) - 25) / 2 +
    Math.max(0, (feelsMax ?? 30) - 32) + Math.max(0, 8 - (feelsMin ?? 8));
  const weatherGroups = slots.some(slot => {
    const groups = slot.values.filter(Boolean).map(row => weatherLabel(row[0]));
    return groups.some(label => ['晴', '多云', '阴'].includes(label)) &&
      groups.some(label => ['小雨', '雨', '阵雨', '雷雨', '雪', '冻雨'].includes(label));
  });
  const hourlyRain = slots.some(slot => {
    const available = slot.values.filter(Boolean);
    const wet = available.filter(row => row[3] >= 1 || row[4] >= 60);
    return wet.length > 0 && wet.length >= available.length / 2;
  });
  const disagree = metrics.diverge || weatherGroups;
  const hazardous = Boolean(severe) || windRisk >= 40 || feelsMax >= 38 || (feelsMin != null && feelsMin <= -10);
  const day = {
    ...metrics, date, severe, windRisk, feelsMax, feelsMin, lead,
    cloud, score: Math.max(0, Math.round(metrics.score - discomfort)), diverge: disagree,
    rainy: metrics.rainy || hourlyRain,
    ok: metrics.ok && !hazardous && !hourlyRain,
    loose: metrics.loose && !hazardous && !hourlyRain,
    trend: metrics.trend && !hazardous && !hourlyRain
  };
  day.reasons = dayReasons(day);
  return day;
}

export function recommendPacking(dailyData, departure, length) {
  const count = Number(length);
  if (!Array.isArray(dailyData) || !/^\d{4}-\d{2}-\d{2}$/.test(departure) ||
    !Number.isInteger(count) || count < 1 || count > 7) {
    return { available: false, missingDates: [], reason: '出发日期或行程天数无效。' };
  }

  const byDate = new Map(dailyData.map(day => [day.date, day]));
  const days = Array.from({ length: count }, (_, index) => {
    const date = addDays(departure, index);
    return byDate.get(date) || { date, n: 0 };
  });
  const missingDates = days.filter(day => !(day.n > 0) ||
    !Number.isFinite(day.hi) || !Number.isFinite(day.lo)).map(day => day.date);
  if (missingDates.length) {
    return { available: false, departure, returnDate: days.at(-1).date, length: count,
      missingDates, reason: '部分日期缺少完整逐日预报，暂不生成衣物数量。' };
  }

  // Departure outfit is worn, not packed. Pack one clean top and underwear/socks
  // for each following day; reuse each lower garment for up to two days.
  const changeDays = days.slice(1);
  const tops = { short: 0, long: 0, warm: 0 };
  for (const day of changeDays) {
    if (day.hi <= 16) tops.warm += 1;
    else if (day.hi >= 25) tops.short += 1;
    else tops.long += 1;
  }

  // A jacket worn on departure can be reused. Pack an additional layer only
  // when a later day needs more protection than the departure day's outfit.
  const layerLevel = day => {
    const wind = Number.isFinite(day.windRisk) ? day.windRisk : day.wind;
    if (day.lo < 10 || day.hi <= 15) return 2;
    if (day.lo < 18 || (Number.isFinite(wind) && wind >= 35)) return 1;
    return 0;
  };
  const departureLayer = layerLevel(days[0]);
  const laterLayer = Math.max(0, ...changeDays.map(layerLevel));
  const rainDays = days.filter(day => day.rainy === true ||
    (Number.isFinite(day.popMed) ? day.popMed >= 50 : day.popMax >= 60) ||
    (Number.isFinite(day.mmMed) && day.mmMed >= 1));

  const items = [];
  const add = (name, quantity, unit, reason) => {
    if (quantity > 0) items.push({ name, quantity, unit, reason });
  };
  add('内裤', changeDays.length, '条', '出发当天穿着的 1 套不计，每天更换');
  add('袜子', changeDays.length, '双', '出发当天穿着的 1 双不计，每天更换');
  add('短袖上衣', tops.short, '件', '对应较暖的行程日');
  add('长袖上衣', tops.long, '件', '对应气温中等的行程日');
  add('保暖上衣', tops.warm, '件', '对应最高温不超过 16℃ 的行程日');
  add('下装（裤子/裙子）', Math.ceil(changeDays.length / 2), '条', '按每条连续穿两天计算');
  if (laterLayer > departureLayer) {
    add(laterLayer === 2 ? '保暖外套' : '薄外套/防风外套', 1, '件',
      '后续日期比出发日更冷或风更大，出发日身上的外套不够用');
  }
  if (rainDays.length) {
    add('折叠伞', 1, '把', '行程内有降雨信号，整趟共用一把');
  }

  const uncertainDates = days.filter(day =>
    (Number.isFinite(day.lead) && day.lead > 7) ||
    (Number.isFinite(day.nOrg) && day.nOrg < 3)).map(day => day.date);
  return {
    available: true, departure, returnDate: days.at(-1).date, length: count,
    changeDays: changeDays.length, minLow: Math.min(...days.map(day => day.lo)),
    maxHigh: Math.max(...days.map(day => day.hi)), days, items, rainDates: rainDays.map(day => day.date),
    departureLayer, laterLayer, uncertainDates,
    rule: '按每天更换内裤、袜子和上衣，下装每两天一条；不假设途中洗衣。出发日身上穿的衣物不计，且可重复使用。'
  };
}

export function makeWindow(start, length, days) {
  const selected = Array.from({ length }, (_, i) => {
    const date = addDays(start, i);
    return days.get(date) || { date, n: 0, reasons: ['没有该日期的预报'] };
  });
  const complete = selected.every(day => day.n > 0);
  const bad = selected.filter(day => !day.ok).length;
  const end = addDays(start, length - 1);
  const tier = !complete ? 'unavailable' : !bad ? 'strict' : selected.every(day => day.loose) ? 'loose'
    : selected.every(day => day.trend || (day.thin && !day.rainy && !day.severe) ||
      (day.overcast && !day.rainy && !day.severe && day.conf < 2)) ? 'trend' : 'unsuitable';
  return {
    start, end, tier, days: selected, bad,
    wk: selected.filter(day => [0, 6].includes(weekday(day.date))).length,
    score: complete ? 0.55 * average(selected.map(day => day.score)) +
      0.45 * Math.min(...selected.map(day => day.score)) - 1.5 * bad : null
  };
}

export function rankWindows(windows, preference, scoring) {
  const tiers = Object.keys(TIERS);
  const ranked = [];
  for (const tier of tiers) {
    const pool = windows.filter(window => window.tier === tier);
    pool.sort((a, b) => {
      if (preference === 'avoid' && a.wk !== b.wk) return a.wk - b.wk;
      const scoreDelta = (b.score ?? -Infinity) - (a.score ?? -Infinity);
      return scoreDelta || a.start.localeCompare(b.start);
    });
    if (preference === 'workdays' && tier !== 'unavailable') {
      while (pool.length) {
        const preferred = scoring.rankTripWindows(pool);
        ranked.push(preferred);
        pool.splice(pool.indexOf(preferred), 1);
      }
    } else {
      ranked.push(...pool);
    }
  }
  return ranked;
}

export function evaluatePlan({ days, start, end, length, mode, preference, coverageStart, coverageEnd, earliest }, scoring) {
  const candidates = [];
  const first = mode === 'manual' ? coverageStart : start;
  const to = mode === 'manual' ? coverageEnd : end;
  const from = earliest && earliest > first ? earliest : first;
  for (let date = from; addDays(date, length - 1) <= to; date = addDays(date, 1)) {
    candidates.push(makeWindow(date, length, days));
  }
  const windows = rankWindows(candidates, preference, scoring);
  if (mode === 'auto') return { current: windows[0] || null, alternatives: windows.slice(1) };
  const chosen = makeWindow(start, length, days);
  const tiers = Object.keys(TIERS);
  const nearby = windows.filter(window => window.start !== start && window.tier !== 'unavailable' &&
    (tiers.indexOf(window.tier) < tiers.indexOf(chosen.tier) ||
      (window.tier === chosen.tier && window.score >= chosen.score + 5)));
  nearby.sort((a, b) => Math.abs(dateDistance(start, a.start)) - Math.abs(dateDistance(start, b.start)));
  return { current: chosen, alternatives: nearby };
}
