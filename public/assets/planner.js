import { addDays, dateDistance, GUANGZHOU, localParts, periodOf, QUICK_CITIES, selectedHours, validCity, validDate, weekday } from './planner-calendar.js';
import { assessDay, assessPeriod, evaluatePlan, hourDetails, indexHourly, TIERS, weatherLabel } from './planner-model.js';

const scoring = { metrics, rankTripWindows, code: CODE, models: MDL };
const byId = id => document.getElementById(id);
const form = byId('plannerForm');
const cityInput = byId('cityInput');
const cityResults = byId('cityResults');
const startDate = byId('startDate');
const endDate = byId('endDate');
const tripDays = byId('tripDays');
const tripPeriod = byId('tripPeriod');
const weekend = byId('weekend');
const startTime = byId('startTime');
const endTime = byId('endTime');
const submit = byId('queryWeather');
const status = byId('status');
const result = byId('plannerResult');
const evidence = byId('plannerEvidence');
const detail = byId('hourDetails');
const savedKey = 'qingchuang.preferences.v1';
const cacheKey = 'qingchuang.forecasts.v1';
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function readStorage(storage, key, fallback) {
  try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function writeStorage(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch {}
}

const saved = readStorage(localStorage, savedKey, {});
let recent = (Array.isArray(saved.recent) ? saved.recent : []).filter(validCity).slice(0, 6);
let city = validCity(saved.city) ? saved.city : GUANGZHOU;
let coverage = null;
let queryController;
let searchController;
let detailController;
let pendingQuery;
let pendingSearch;
let chartDays = [];
const storedForecasts = readStorage(sessionStorage, cacheKey, []);
const cachedForecasts = new Map((Array.isArray(storedForecasts) ? storedForecasts : []).filter(entry =>
  Array.isArray(entry) && entry[1]?.payload));
if (/^[1-7]$/.test(saved.days)) tripDays.value = saved.days;
if (['workdays', 'avoid', 'any'].includes(saved.preference)) weekend.value = saved.preference;
if (['morning', 'afternoon', 'evening', 'custom'].includes(saved.period)) tripPeriod.value = saved.period;
if (saved.startTime) startTime.value = saved.startTime;
if (saved.endTime) endTime.value = saved.endTime;
if (saved.mode === 'manual') form.elements.mode.value = 'manual';

function savePreferences() {
  writeStorage(localStorage, savedKey, {
    city, recent, days: tripDays.value, preference: weekend.value, period: tripPeriod.value,
    mode: mode(), startTime: startTime.value, endTime: endTime.value
  });
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, action) {
  const control = element('button', text);
  control.type = 'button';
  control.addEventListener('click', action);
  return control;
}

function updateStatus(message, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function mode() { return form.elements.mode.value; }
function period() { return periodOf(tripPeriod.value, startTime.value, endTime.value); }
function shortDate(iso) { return Number(iso.slice(5, 7)) + '月' + Number(iso.slice(8)) + '日'; }
function dateLabel(iso) { return shortDate(iso) + ' ' + weekdays[weekday(iso)]; }
function windowLabel({ start, end }) { return shortDate(start) + (start === end ? '' : '–' + shortDate(end)); }
function temperature(lo, hi) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return '暂无气温';
  const low = Math.round(lo);
  const high = Math.round(hi);
  return (low === high ? high : low + '–' + high) + '℃';
}
function percentage(value) { return Number.isFinite(value) ? Math.round(value) + '%' : '—'; }

function stopSearch() {
  clearTimeout(pendingSearch);
  searchController?.abort();
  cityResults.hidden = true;
  cityResults.replaceChildren();
  byId('cityStatus').textContent = '';
}

function cityDescription(item) {
  return [item.region, item.country].filter(Boolean).join(' · ');
}

function renderShortcuts() {
  const choices = new Map([...recent, ...QUICK_CITIES].map(item => [item.id, item]));
  byId('cityShortcuts').replaceChildren(...Array.from(choices.values(), item => {
    const control = button(item.name, () => chooseCity(item));
    control.setAttribute('aria-pressed', String(item.id === city.id));
    control.title = [item.name, cityDescription(item)].filter(Boolean).join(' · ');
    return control;
  }));
}

function chooseCity(item) {
  stopSearch();
  city = item;
  recent = [item, ...recent.filter(other => other.id !== item.id)].slice(0, 6);
  coverage = null;
  cityInput.value = item.name;
  renderShortcuts();
  resetCalendar();
  savePreferences();
  runQuery();
}

async function getJson(url, signal) {
  const reply = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!reply.ok) {
    const body = await reply.json().catch(() => null);
    const error = new Error(body?.error || '暂时无法连接，请重试');
    error.status = reply.status;
    throw error;
  }
  return reply.json();
}

async function searchCities(term, controller) {
  try {
    const { cities, stale } = await getJson('/api/geocoding?' + new URLSearchParams({ q: term }), controller.signal);
    if (controller.signal.aborted) return;
    const choices = cities.filter(validCity);
    cityResults.replaceChildren(...choices.map(item => {
      const control = button(null, () => {
        chooseCity(item);
        cityInput.focus();
      });
      control.append(element('strong', item.name), element('small', cityDescription(item)));
      return control;
    }));
    cityResults.hidden = !choices.length;
    byId('cityStatus').textContent = choices.length
      ? (stale ? '已显示缓存中的城市匹配' : '请选择匹配的城市')
      : '没有找到城市，试试当地拼写或英文名';
  } catch {
    if (!controller.signal.aborted) byId('cityStatus').textContent = '暂时无法搜索城市，可使用下方常用或最近城市。';
  }
}

cityInput.addEventListener('input', () => {
  stopSearch();
  const term = cityInput.value.trim();
  if (!term || term === city.name) return;
  searchController = new AbortController();
  const current = searchController;
  byId('cityStatus').textContent = '正在搜索城市…';
  pendingSearch = setTimeout(() => searchCities(term, current), 300);
});
cityInput.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    stopSearch();
    cityInput.value = city.name;
  }
  if (['Enter', 'ArrowDown'].includes(event.key) && cityInput.value.trim() !== city.name) {
    event.preventDefault();
    const first = cityResults.querySelector('button');
    if (first) first.focus();
    else if (cityInput.value.trim() && searchController) {
      clearTimeout(pendingSearch);
      searchCities(cityInput.value.trim(), searchController);
    }
  }
});
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.planner-search')) {
    stopSearch();
    cityInput.value = city.name;
  }
});
form.addEventListener('focusout', event => {
  if (event.target.closest('.planner-search') && !event.relatedTarget?.closest('.planner-search')) {
    stopSearch();
    cityInput.value = city.name;
  }
});

function resetCalendar() {
  const today = localParts(Date.now(), city.timezone).date;
  const provisional = addDays(today, 15);
  byId('localCity').textContent = city.name;
  byId('localDate').textContent = '当地 ' + dateLabel(today);
  byId('dateCoverage').textContent = '日期和时段均使用 ' + city.name + ' 当地时间。';
  for (const field of [startDate, endDate]) {
    field.min = today;
    field.max = provisional;
  }
  startDate.value = today;
  endDate.value = mode() === 'manual' ? addDays(today, Number(tripDays.value) - 1) : provisional;
}

function updateCalendar(first, last) {
  const oldMax = startDate.max;
  const oldMin = startDate.min;
  for (const field of [startDate, endDate]) {
    field.min = first;
    field.max = last;
  }
  if (startDate.value === oldMin && startDate.value < first) startDate.value = first;
  if (mode() === 'auto' && endDate.value === oldMax) endDate.value = last;
  byId('dateCoverage').textContent = '当地预报 ' + shortDate(first) + '至' + shortDate(last);
}

function updateModeFields() {
  const manual = mode() === 'manual';
  byId('startLabel').textContent = manual ? '出发日期' : '查找起日';
  byId('endLabel').textContent = manual ? '最后一天' : '查找截止日';
  const selected = period();
  byId('customTime').hidden = tripPeriod.value !== 'custom';
  byId('timeHelp').textContent = selected?.overnight || (selected?.until === 0 && selected.from > 0)
    ? '结束时刻在次日，按开始日期归入这一天。'
    : '按目的地当地时间，每天分析同一时段。';
}

function hideResults() {
  detailController?.abort();
  detail.hidden = true;
  detail.replaceChildren();
  result.hidden = true;
  chartDays = [];
  TREND_VIEW = null;
  delete result.dataset.city;
  byId('trendchart').replaceChildren();
}

function querySoon() {
  clearTimeout(pendingQuery);
  queryController?.abort();
  hideResults();
  updateModeFields();
  savePreferences();
  updateStatus('正在更新 ' + city.name + ' 的出行条件…', 'loading');
  pendingQuery = setTimeout(runQuery, 320);
}

form.addEventListener('change', ({ target }) => {
  if (target === cityInput) return;
  if (target.name === 'mode') {
    endDate.value = mode() === 'manual' ? addDays(startDate.value || startDate.min, Number(tripDays.value) - 1) : endDate.max;
  }
  if (mode() === 'manual' && (target === tripDays || target === startDate) && validDate(startDate.value)) {
    endDate.value = addDays(startDate.value, Number(tripDays.value) - 1);
  }
  if (mode() === 'manual' && target === endDate && validDate(startDate.value) && validDate(endDate.value)) {
    const span = 1 + dateDistance(startDate.value, endDate.value);
    if (span >= 1 && span <= 7) tripDays.value = String(span);
  }
  querySoon();
});
form.addEventListener('submit', event => {
  event.preventDefault();
  runQuery();
});

async function forecast(kind, location, start, end, signal) {
  const { latitude, longitude, timezone } = location;
  const params = new URLSearchParams({ latitude, longitude, timezone, kind, start });
  if (end) params.set('end', end);
  const key = params.toString();
  const record = cachedForecasts.get(key);
  const now = Date.now();
  if (record && !record.payload.stale && now - record.saved < 5 * 60_000) return record.payload;
  try {
    const payload = await getJson(window.GZ_API_BASE + '?' + key, signal);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const correctEnd = end ? payload.end === end : validDate(payload.end) && payload.end >= start && payload.end <= addDays(start, 15);
    if (payload.latitude !== latitude || payload.longitude !== longitude || payload.timezone !== timezone ||
      payload.start !== start || !correctEnd || !Array.isArray(payload.data) || !payload.data.length) {
      throw new Error('预报与本次查询条件不一致');
    }
    cachedForecasts.delete(key);
    cachedForecasts.set(key, { saved: now, payload });
    if (cachedForecasts.size > 8) cachedForecasts.delete(cachedForecasts.keys().next().value);
    writeStorage(sessionStorage, cacheKey, Array.from(cachedForecasts));
    return payload;
  } catch (error) {
    if (!signal.aborted && ![400, 422].includes(error.status) && record &&
      now - Date.parse(record.payload.updatedAt) < 48 * 3_600_000) {
      return { ...record.payload, stale: true };
    }
    throw error;
  }
}

function planOptions(first, last) {
  const selectedPeriod = period();
  const start = startDate.value;
  const end = endDate.value;
  const length = Number(tripDays.value);
  if (!validDate(start) || !validDate(end)) throw new Error('请选择有效的开始日期和截止日期。');
  if (start < first || end > last) throw new Error('所选日期超出预报范围，请在日期控件内重新选择。');
  if (dateDistance(start, end) + 1 < length) throw new Error('日期范围不足 ' + length + ' 天，请延长日期范围或减少出行天数。');
  if (mode() === 'manual' && dateDistance(start, end) + 1 !== length) throw new Error('指定日期最多连续 7 天，请调整最后一天。');
  if (!selectedPeriod) throw new Error('请选择不同的开始和结束时刻。');
  return { start, end, length, mode: mode(), preference: weekend.value, coverageStart: first, coverageEnd: last, period: selectedPeriod };
}

async function runQuery() {
  clearTimeout(pendingQuery);
  queryController?.abort();
  queryController = new AbortController();
  const { signal } = queryController;
  const location = city;
  const today = localParts(Date.now(), location.timezone).date;
  if (today !== startDate.min && (!coverage || today !== coverage.today)) {
    coverage = null;
    resetCalendar();
  }
  hideResults();
  updateStatus('正在读取 ' + location.name + ' 的当地预报…', 'loading');
  submit.disabled = true;
  try {
    if (!coverage || coverage.today !== today || coverage.daily.stale || Date.now() - coverage.fetched > 5 * 60_000) {
      const daily = await forecast('daily', location, today, null, signal);
      if (signal.aborted) return;
      const dates = daily.data.filter(day => day.n > 0).map(day => day.date).sort();
      if (!dates.length) throw new Error('当前没有可用的当地预报。');
      coverage = { daily, today, first: dates[0], last: dates[dates.length - 1], fetched: Date.now() };
      updateCalendar(coverage.first, coverage.last);
    }
    const opts = planOptions(coverage.first, coverage.last);
    if (opts.period.preset !== 'all') {
      const lastSlot = selectedHours(today, opts.period, location.timezone).at(-1);
      opts.elapsed = lastSlot && lastSlot.endStamp <= Date.now();
      if (opts.elapsed) opts.earliest = addDays(today, 1);
      if (opts.mode === 'auto' && opts.earliest && opts.start < opts.earliest &&
        addDays(opts.earliest, opts.length - 1) > opts.end) {
        throw new Error('今天的所选时段已结束，请延长日期范围或减少出行天数。');
      }
    }
    const daily = coverage.daily;
    let hourly = null;
    let indexed = null;
    let days = new Map(daily.data.map(raw => [raw.date, assessDay(raw)]));
    if (opts.period.preset !== 'all') {
      updateStatus('正在读取 ' + location.name + ' 的逐小时天气…', 'loading');
      const start = opts.mode === 'manual' ? coverage.first : opts.start;
      const end = opts.mode === 'manual' ? coverage.last : opts.end;
      hourly = await forecast('hourly', location, start, end, signal);
      if (signal.aborted) return;
      indexed = indexHourly(hourly);
      days = new Map();
      for (let date = start; date <= end; date = addDays(date, 1)) {
        days.set(date, assessPeriod(date, opts.period, location.timezone, indexed, today, scoring));
      }
    }
    if (signal.aborted) return;
    const plan = evaluatePlan({ ...opts, days }, scoring);
    if (!plan.current) throw new Error('所选日期范围没有足够的连续天数。');
    renderPlan(plan, opts, { daily, hourly, indexed, days, location, signal });
    const payload = hourly || daily;
    const updated = localParts(Date.parse(payload.updatedAt), location.timezone);
    updateStatus(payload.stale ? '暂时无法更新，显示 ' + shortDate(updated.date) + ' ' + updated.time + ' 的旧预报'
      : location.name + ' 当地 ' + shortDate(updated.date) + ' ' + updated.time + ' 获取的预报', payload.stale ? 'error' : '');
  } catch (error) {
    if (!signal.aborted) updateStatus(error.message || '暂时无法获取天气，请重试。', 'error');
  } finally {
    if (!signal.aborted) submit.disabled = false;
  }
}

function periodLabel(selected) {
  if (selected.preset === 'all') return '全天';
  const overnight = selected.overnight || (selected.until === 0 && selected.from > 0);
  return '每天 ' + selected.start + '–' + (overnight ? '次日 ' : '') + selected.end;
}

function reasonText(window, manual) {
  const notices = window.days.flatMap(day => (day.reasons || []).map(reason => [reason, day.date]));
  const grouped = new Map();
  for (const [reason, date] of notices) grouped.set(reason, [...(grouped.get(reason) || []), date]);
  const priority = ['有明显降雨风险', '有预报提示雷雨', '有预报提示冻雨', '有预报提示雪',
    '部分预报风速较高', '各家预报有分歧'];
  const concerns = [...grouped].sort(([a], [b]) => {
    const rank = text => priority.includes(text) ? priority.indexOf(text) : priority.length;
    return rank(a) - rank(b);
  }).slice(0, 4).map(([reason, dates]) => dates.length === window.days.length
    ? reason : dates.map(shortDate).join('、') + ' ' + reason);
  const lead = {
    strict: window.days.some(day => day.diverge) ? '综合预报偏向晴好，仍有不确定性。' : '预计以晴或多云为主，明显降雨的风险较低。',
    loose: '这段可能有阴天，降雨风险较低，可考虑出行。',
    trend: '这段预报把握有限，适合先作备选。',
    unsuitable: manual ? '所选日期的天气不太适合户外出行。' : '所查范围内没有符合晴好或阴天放宽的时段。',
    unavailable: '没有足够的预报支持这段行程。'
  };
  return lead[window.tier] + (concerns.length ? concerns.join('。') + '。' : '');
}

function renderPlan(plan, opts, context) {
  const current = plan.current;
  const manual = opts.mode === 'manual';
  const top = element('div', null, 'planner-result-top');
  const dates = element('div');
  const assessment = manual ? '你选的日期' : {
    strict: '最推荐日期', loose: '最推荐日期', trend: '当前可参考的日期',
    unsuitable: '当前天气较好的日期', unavailable: '查询范围内的日期'
  }[current.tier];
  dates.append(element('p', assessment, 'planner-result-label'), element('h2', windowLabel(current)));
  const pill = element('span', TIERS[current.tier], 'planner-pill');
  pill.dataset.tier = current.tier;
  top.append(dates, pill);
  const foot = element('div', null, 'planner-result-foot');
  const summary = [context.location.name, opts.length + ' 天', periodLabel(opts.period), current.wk + ' 天周末'];
  if (current.score != null) summary.push('天气评分 ' + Math.round(current.score) + ' / 100');
  foot.append(...summary.map(text => element('span', text)));
  const elapsedNotice = manual && opts.elapsed && current.start < opts.earliest ? '今天的所选时段已结束。' : '';
  byId('bestWindow').replaceChildren(top, element('p', elapsedNotice + reasonText(current, manual)), foot);

  const dailyButtons = current.days.map(day => {
    const control = button(null, () => openHours(day, control, opts, context));
    control.setAttribute('aria-controls', 'hourDetails');
    control.setAttribute('aria-expanded', 'false');
    const headline = day.n ? (day.severe || (day.rainy ? '有雨' : day.modal)) + ' · ' + temperature(day.lo, day.hi) : '预报不足';
    const rainText = day.n ? '最高降雨概率 ' + percentage(day.popMax) : '';
    control.append(element('span', dateLabel(day.date), 'planner-day-date'), element('strong', headline),
      element('span', rainText, 'planner-day-rain'));
    return control;
  });
  byId('resultDays').replaceChildren(...dailyButtons);
  const alternatives = byId('alternatives');
  const items = plan.alternatives.filter(window => window.tier !== 'unavailable').slice(0, 4);
  alternatives.replaceChildren();
  const showNoAlternatives = manual && ['unsuitable', 'unavailable'].includes(current.tier) && !items.length;
  alternatives.hidden = !items.length && !showNoAlternatives;
  if (showNoAlternatives) {
    alternatives.append(element('p', '当前预报范围内暂未找到更合适的同长度行程。', 'planner-help'));
  }
  if (items.length) {
    alternatives.append(element('h3', manual ? '附近更合适的日期' : '其他可对比的日期'));
    for (const window of items) {
      alternatives.append(button(windowLabel(window) + ' · ' + TIERS[window.tier] + ' · ' + Math.round(window.score) + ' 分', () => {
        form.elements.mode.value = 'manual';
        startDate.value = window.start;
        endDate.value = window.end;
        updateModeFields();
        savePreferences();
        runQuery();
      }));
    }
  }
  byId('dataNote').textContent = (context.daily.scope === 'guangzhou-districts'
    ? '广州按荔湾、越秀、天河和海珠四个城区参考点综合分析。'
    : context.location.name + ' 按城市参考点分析。')
    + ' 使用六个预报模式，同一机构的模式合并参考。远期或部分时段可能只有少量模式有数据。';
  byId('guangzhouEvidence').hidden = context.daily.scope !== 'guangzhou-districts';
  chartDays = [...context.days.values()].filter(day => day.date >= (manual ? current.start : opts.start) &&
    day.date <= (manual ? current.end : opts.end)).map(day => ({ ...day, date: day.date.slice(5) }));
  result.dataset.city = context.location.id;
  result.hidden = false;
  if (evidence.open) drawTrend();
}

function drawTrend() {
  if (chartDays.length) renderTrend({ days: chartDays, planner: true });
}
evidence.addEventListener('toggle', () => {
  if (evidence.open && !result.hidden) drawTrend();
});

function numberRange(rows, index, unit, digits = 0) {
  const values = rows.map(row => row[index]).filter(Number.isFinite);
  if (!values.length) return '—';
  const lo = Math.min(...values).toFixed(digits);
  const hi = Math.max(...values).toFixed(digits);
  return (lo === hi ? hi : lo + '–' + hi) + unit;
}

async function openHours(day, control, opts, context) {
  const opening = control.getAttribute('aria-expanded') !== 'true';
  byId('resultDays').querySelectorAll('button').forEach(item => item.setAttribute('aria-expanded', 'false'));
  detailController?.abort();
  detail.replaceChildren();
  detail.hidden = !opening;
  if (!opening) return;
  control.setAttribute('aria-expanded', 'true');
  detailController = new AbortController();
  const { signal } = detailController;
  const heading = element('h3', dateLabel(day.date) + ' · 逐小时天气');
  const message = element('p', '正在读取逐小时预报…');
  message.setAttribute('role', 'status');
  detail.append(heading);
  if (day.orgs?.length > 1 && day.diverge) {
    detail.append(element('p', '各家判断 · ' + day.orgs.map(org => org.org + ' ' + org.cat).join(' / ')));
  }
  detail.append(message);
  try {
    const hourly = context.hourly || await forecast('hourly', context.location, day.date, day.date, signal);
    if (signal.aborted || context.signal.aborted) return;
    const slots = hourDetails(day.date, opts.period, context.location.timezone, context.indexed || indexHourly(hourly));
    const weather = slots.filter(slot => slot.values.some(Boolean));
    if (!weather.length) {
      message.textContent = slots.length ? '这段时间没有逐小时预报。' : '当地时钟跳时，这段时间没有可用小时。';
      return;
    }
    const counts = new Map();
    for (const slot of slots) counts.set(slot.date + slot.time, 1 + (counts.get(slot.date + slot.time) || 0));
    message.textContent = '以下为当地时间，数值范围反映各模式差异。降水量为整小时预报。'
      + (hourly.stale ? ' 当前显示旧的逐小时预报。' : '');
    const scroll = element('div', null, 'planner-table-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('aria-label', '可横向滚动查看逐小时天气表');
    const table = element('table', null, 'planner-table');
    const header = table.createTHead().insertRow();
    for (const label of ['时间', '天气', '气温', '体感', '降雨概率', '降水', '云量', '风速']) {
      const headingCell = element('th', label);
      headingCell.scope = 'col';
      header.append(headingCell);
    }
    const body = table.createTBody();
    for (const slot of slots) {
      const rows = slot.values.filter(Boolean);
      const offset = slot.offset / 60;
      const repeated = counts.get(slot.date + slot.time) > 1;
      const time = (slot.date === day.date ? '' : slot.date < day.date ? '前一日 ' : '次日 ') + slot.time +
        (repeated ? ' (UTC' + (offset >= 0 ? '+' : '') + offset + ')' : '');
      const conditions = [...new Set(rows.map(row => weatherLabel(row[0])))].join(' / ');
      const values = [time, conditions || '暂无预报', numberRange(rows, 1, '℃'), numberRange(rows, 2, '℃'),
        numberRange(rows, 4, '%'), numberRange(rows, 3, ' mm', 1), numberRange(rows, 5, '%'), numberRange(rows, 6, ' km/h')];
      const row = body.insertRow();
      for (const value of values) row.append(element('td', value));
    }
    scroll.append(table);
    detail.append(scroll);
  } catch (error) {
    if (signal.aborted) return;
    message.textContent = error.message || '无法获取逐小时预报。';
    detail.append(button('重试', () => {
      control.setAttribute('aria-expanded', 'false');
      openHours(day, control, opts, context);
    }));
  }
}

cityInput.value = city.name;
renderShortcuts();
resetCalendar();
updateModeFields();
runQuery();
