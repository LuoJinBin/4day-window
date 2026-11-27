import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAP, buildWindows, rankTripWindows, selectDisplayWindow, windowVerdict, verdictOf, winPen, riskOf, confTier, forecastMeta, metrics, wxWord, riskText,
  chinaParts, chinaIso, leadOf, applyDayProgress, completedHourlyRainEstimate, aggPoints, applyDaylightWeatherCodes,
  MDL, ORG, W_MDL, CLIMO, CLIMO_META, BT, BT_LEADS
} from '../src/core/logic.js';

const day = (o = {}) => Object.assign({
  date: '11-20', wd: '周五', hi: 24, lo: 18, score: 80,
  ok: true, loose: true, trend: true, conf: 3, lead: 3,
  rainy: false, mist: false, rainLevel: '无', mmMed: 0, popMax: 20,
  modal: '阴', overcast: true
}, o);
const win = (days) => ({ days, conf: Math.min(...days.map((d) => d.conf)) });

test('内置快照可生成 4 天滑窗', () => {
  const w = buildWindows(SNAP.days);
  assert.equal(w.length, SNAP.days.length - 3);
  for (const x of w) {
    assert.equal(x.days.length, 4);
    assert.equal(x.span, x.days[0].date + '—' + x.days[3].date);
  }
});

test('阴天不扣分：连续阴天且无雨判推荐出发', () => {
  const w = win([0, 1, 2, 3].map((i) => day({ date: '11-2' + i })));
  assert.equal(winPen(w), 0);
  assert.equal(verdictOf(w).k, 'rec');
});

test('持续明显降雨判等待', () => {
  const w = win([0, 1, 2, 3].map((i) => day({
    date: '11-2' + i, rainy: true, rainLevel: '明显', mmMed: 8,
    ok: false, loose: false, trend: false, modal: '雨'
  })));
  assert.ok(winPen(w) > 100);
  assert.equal(verdictOf(w).k, 'wait');
});

test('单日短时小雨只轻扣，不淘汰整窗', () => {
  const w = win([0, 1, 2, 3].map((i) => day({
    date: '11-2' + i, mist: i === 1, mmMed: i === 1 ? 0.4 : 0, popMax: i === 1 ? 45 : 20
  })));
  assert.ok(winPen(w) > 0 && winPen(w) < 22);
  assert.equal(verdictOf(w).k, 'maybe');
});

test('降雨风险分级', () => {
  assert.equal(riskOf(day({ rainy: true, mmMed: 12 })), 3);
  assert.equal(riskOf(day({ mist: true })), 2);
  assert.equal(riskOf(day({ popMax: 50 })), 2);
  assert.equal(riskOf(day({ popMax: 15 })), 1);
});

test('置信度分层只取高/中/低', () => {
  assert.equal(confTier(day({ conf: 3 })), 3);
  assert.equal(confTier(day({ conf: 2 })), 2);
  assert.equal(confTier(day({ conf: 1 })), 1);
});

test('服务端预报元数据保留真实更新时间与缓存年龄', () => {
  const now = Date.parse('2026-11-20T12:00:00.000Z');
  const updatedAt = Date.parse('2026-11-20T10:00:00.000Z');
  const meta = forecastMeta({
    updatedAt: '2026-11-20T10:00:00.000Z',
    stale: false,
    ageMinutes: 120
  }, now);
  assert.equal(meta.updatedAt, updatedAt);
  assert.equal(meta.stale, false);
  assert.equal(meta.ageMinutes, 120);
});

test('过期或缺少更新时间的服务端数据不能被当作新预报', () => {
  const now = Date.parse('2026-11-20T12:00:00.000Z');
  const stale = forecastMeta({
    updatedAt: '2026-11-20T05:00:00.000Z',
    stale: true,
    ageMinutes: 420
  }, now);
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt, Date.parse('2026-11-20T05:00:00.000Z'));

  const missing = forecastMeta({ stale: false }, now);
  assert.equal(missing.stale, true);
  assert.equal(missing.updatedAt, null);
});

test('广州日期与小时固定使用 Asia/Shanghai，不受访问者电脑时区影响', () => {
  const instant = new Date('2026-11-20T16:30:00.000Z');
  assert.equal(chinaIso(instant), '2026-11-21');
  assert.equal(chinaParts(instant).hour, '00');
  assert.equal(chinaParts(instant).minute, '30');
  assert.equal(leadOf('11-21', instant), 0);
  assert.equal(leadOf('11-22', instant), 1);
});

test('当天前序时段只记录归档预报估算，不冒充实测或覆盖全天预报', () => {
  const daily={time:['2026-11-20','2026-11-21'],precipitation_sum:[99,0]};
  const hourly={
    time:['2026-11-20T05:00','2026-11-20T06:00','2026-11-20T07:00',
      '2026-11-20T08:00','2026-11-20T12:00','2026-11-20T13:00'],
    precipitation:[4,0.1,0.2,null,0.5,9]
  };
  const result=completedHourlyRainEstimate(daily,hourly,new Date('2026-11-20T05:30:00.000Z'));
  assert.deepEqual(result,{mm:0.8,hours:3});
  assert.equal(daily.__completedHoursRainMm,0.8);
  assert.equal(daily.__completedHoursCount,3);
  assert.equal(daily.__completedHoursRainDate,'2026-11-20');
  assert.equal(daily.__completedHoursRainHour,13);
  // The archived forecast estimate must not overwrite the full-day forecast total.
  assert.equal(daily.precipitation_sum[0],99);
  assert.equal(daily.precipitation_sum[1],0);
});

test('当天前序估算无雨时，仍明确保留剩余时段的降雨预报', () => {
  const forecast = day({rainy:true,modal:'雨',rainLevel:'明显',ok:false,loose:false,trend:false,conf:2});
  const progress = applyDayProgress(forecast,{mm:0},{isToday:true,hour:10});
  assert.equal(progress.progressEstimateMm,0);
  assert.equal(progress.rainy,true);
  assert.equal(progress.modal,'雨');
  assert.equal(progress.ok,false);
  assert.equal(progress.conf,2);
  assert.equal(progress.actual,undefined);
  assert.match(progress.progressNote,/归档预报回算/);
  assert.match(progress.progressNote,/非实测/);
  assert.equal(wxWord(progress),'前序估算无雨，后续仍有雨预报');
  assert.equal(riskText(riskOf(progress),progress),'后续降雨 高');
});

test('已过去日期的归档预报不能被当成实测天气覆盖', () => {
  const forecast=day({rainy:false,modal:'多云',rainLevel:'无',ok:true,loose:true,trend:true});
  const progress=applyDayProgress(forecast,{mm:12},{isToday:false,hour:11});
  assert.equal(progress.rainy,false);
  assert.equal(progress.modal,'多云');
  assert.equal(progress.actual,undefined);
  assert.equal(progress.progressEstimateMm,undefined);
});

test('四点合成规则与现有模型口径一致，并拒绝错位日期', () => {
  const times=['2026-11-20'];
  const points=[
    {time:times,weather_code_x:[0],temperature_2m_max_x:[20],temperature_2m_min_x:[10],precipitation_sum_x:[0],precipitation_probability_max_x:[10],wind_speed_10m_max_x:[1]},
    {time:times,weather_code_x:[2],temperature_2m_max_x:[22],temperature_2m_min_x:[12],precipitation_sum_x:[1],precipitation_probability_max_x:[20],wind_speed_10m_max_x:[2]},
    {time:times,weather_code_x:[2],temperature_2m_max_x:[24],temperature_2m_min_x:[14],precipitation_sum_x:[3],precipitation_probability_max_x:[30],wind_speed_10m_max_x:[3]},
    {time:times,weather_code_x:[61],temperature_2m_max_x:[26],temperature_2m_min_x:[16],precipitation_sum_x:[10],precipitation_probability_max_x:[90],wind_speed_10m_max_x:[10]}
  ];
  const merged=aggPoints(points);
  assert.equal(merged.weather_code_x[0],2);
  assert.equal(merged.temperature_2m_max_x[0],23);
  assert.equal(merged.temperature_2m_min_x[0],10);
  assert.equal(merged.precipitation_sum_x[0],3.5);
  assert.equal(merged.precipitation_probability_max_x[0],25);
  assert.equal(merged.wind_speed_10m_max_x[0],4);
  assert.throws(()=>aggPoints([points[0],{...points[1],time:['2026-11-21']}]),/日期不一致/);
});

test('模型权重合计 1.0，机构内多模式按平均权重合成一票', () => {
  const sum = Object.values(W_MDL).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(Object.keys(MDL).length, 6);
  assert.equal(ORG.ecmwf_ifs025, ORG.ecmwf_aifs025_single);
  assert.equal(new Set(Object.values(ORG)).size, 5);

  const recs = [
    {p:'ecmwf_ifs025',name:'ECMWF',cond:'小雨',hi:24,lo:18,mm:0.2,pop:60,wind:8,out:false},
    {p:'ecmwf_aifs025_single',name:'ECMWF-AI',cond:'小雨',hi:24,lo:18,mm:0.2,pop:60,wind:8,out:false},
    {p:'ukmo_seamless',name:'UKMO',cond:'小雨',hi:24,lo:18,mm:0.2,pop:60,wind:8,out:false},
    {p:'cma_grapes_global',name:'CMA',cond:'多云',hi:24,lo:18,mm:0,pop:5,wind:8,out:false},
    {p:'icon_seamless',name:'ICON',cond:'多云',hi:24,lo:18,mm:0,pop:5,wind:8,out:false},
    {p:'meteofrance_seamless',name:'Météo-FR',cond:'多云',hi:24,lo:18,mm:0,pop:5,wind:8,out:false}
  ];
  const twoAgencies = metrics(recs,{},1);
  const ecmwf = twoAgencies.orgs.find(o=>o.org==='ECMWF');
  assert.equal(ecmwf.w,0.18);
  assert.equal(twoAgencies.nOrg,5);
  assert.equal(twoAgencies.rainy,false);
  assert.equal(twoAgencies.modal,'多云');

  // Three independent institutions, not three model products, are enough for a weighted majority.
  const threeAgencies = metrics(recs.map(r=>r.p==='cma_grapes_global'
    ? {...r,cond:'小雨',mm:0.2,pop:60} : r),{},1);
  assert.equal(threeAgencies.rainy,true);

  // Two models from one institution that disagree must not turn into two separate votes.
  const splitProvider = metrics(recs.map(r=>r.p==='ecmwf_aifs025_single'
    ? {...r,cond:'多云',mm:0,pop:5} : r),{},1);
  assert.equal(splitProvider.orgs.find(o=>o.org==='ECMWF').cat,'多云');
});

test('少数模式报小雨但综合降雨未达门槛时，不把主天气标成雨', () => {
  const recs = [
    {p:'ecmwf_ifs025',name:'ECMWF',cond:'小雨',hi:19,lo:12,mm:1.1,pop:68,wind:8,out:false},
    {p:'ecmwf_aifs025_single',name:'ECMWF-AI',cond:'小雨',hi:18,lo:13,mm:2.2,pop:null,wind:9,out:false},
    {p:'ukmo_seamless',name:'UKMO',cond:'阴',hi:20,lo:13,mm:0,pop:11,wind:13,out:false},
    {p:'cma_grapes_global',name:'CMA',cond:'多云',hi:21,lo:14,mm:0,pop:null,wind:13,out:false},
    {p:'icon_seamless',name:'ICON',cond:'阴',hi:19,lo:13,mm:0,pop:14,wind:8,out:false},
    {p:'meteofrance_seamless',name:'Météo-FR',cond:'小雨',hi:16,lo:13,mm:2.3,pop:null,wind:15,out:false}
  ];
  const result=metrics(recs,{},1);
  assert.equal(result.rainy,false);
  assert.equal(result.modal,'多云');
  assert.equal(result.rainDisagreement,true);
  assert.equal(result.rainLevel,'无');
  assert.equal(wxWord(result),'多云');
  assert.equal(riskText(riskOf(result),result),'模型分歧');

  const window={days:[
    Object.assign({date:'11-26'},result),
    day({date:'11-27'}),
    day({date:'11-28'}),
    day({date:'11-29'})
  ]};
  assert.match(verdictOf(window).why,/少数模式报小雨/);
  assert.match(verdictOf(window).why,/14%/);
});

test('日间晴朗时，用逐小时天气码纠正全天最严重天气码', () => {
  const times=Array.from({length:11},(_,i)=>'2026-11-27T'+String(i+7).padStart(2,'0')+':00');
  const daily={time:['2026-11-27']}, hourly={time:times};
  Object.keys(MDL).forEach((model)=>{
    daily['weather_code_'+model]=[3];
    hourly['weather_code_'+model]=times.map((_,i)=>i<9?0:2);
  });
  const applied=applyDaylightWeatherCodes(daily,hourly,'2026-12-04');
  assert.equal(applied,6);
  Object.keys(MDL).forEach((model)=>assert.equal(daily['weather_code_'+model][0],0));
});

test('ERA5 气候统计覆盖 11 年且无缺日', () => {
  assert.equal(CLIMO_META.years, 11);
  assert.equal(CLIMO_META.missingDays, 0);
  assert.equal(Object.keys(CLIMO).length, 12);
  const nov = CLIMO['11'];
  assert.equal(nov.hitStrict, 1);
  assert.equal(nov.hitLoose, 11);
  assert.deepEqual(nov.strictYears, [2019]);
  assert.equal(nov.looseYears.length, 11);
});

test('回测保留 1/3/5/7/10 天分层，且不伪造 Brier', () => {
  assert.deepEqual(BT_LEADS, [1, 3, 5, 7, 10]);
  assert.equal(BT.base.days, 129);
  assert.equal(BT.base.rainDays, 98);
  for (const lead of BT_LEADS) {
    const row = BT.leads[String(lead)];
    assert.ok(row && row.models && row.ens);
    assert.equal(row.models.ecmwf_ifs025.brier, null);
    assert.equal(row.ens.brier, null);
  }
});


test('天气分数接近时，四天窗口优先减少周末日', () => {
  const rows = [
    ['11-23', '周一', 80], ['11-24', '周二', 80],
    ['11-25', '周三', 80], ['11-26', '周四', 80],
    ['11-27', '周五', 83], ['11-28', '周六', 83],
    ['11-29', '周日', 83], ['11-30', '周一', 83]
  ];
  const windows = buildWindows(rows.map(([date, wd, score]) => day({ date, wd, score })));
  const firstWeekend = windows.findIndex((w) => w.wk > 0);
  assert.ok(firstWeekend > 0);
  assert.ok(windows.slice(0, firstWeekend).every((w) => w.wk === 0));
});

test('天气优势明显时，不为避开周末而选择明显更差的窗口', () => {
  const rows = [
    ['11-23', '周一', 60], ['11-24', '周二', 60],
    ['11-25', '周三', 60], ['11-26', '周四', 60],
    ['11-27', '周五', 90], ['11-28', '周六', 90],
    ['11-29', '周日', 90], ['11-30', '周一', 90]
  ];
  const windows = buildWindows(rows.map(([date, wd, score]) => day({ date, wd, score })));
  assert.equal(windows[0].start, '11-27');
  assert.equal(windows[0].wk, 2);
});

const tripWindow = (start, wk, firstLow) => ({
  start,
  wk,
  days: ['11-28', '11-29', '11-30', '12-01'].map((date, i) => day({
    date,
    wd: ['周六', '周日', '周一', '周二'][i],
    hi: 23,
    lo: i === 0 ? firstLow : 18,
    conf: 2
  }))
});

test('首屏行程推荐在天气惩罚接近时优先周末日更少的窗口', () => {
  const weekend = tripWindow('11-28', 2, 18);
  const weekday = tripWindow('12-01', 0, 10);
  assert.equal(rankTripWindows([weekend, weekday]).start, '12-01');
});

test('首屏行程推荐不会为了避开周末而选择明显更差的天气', () => {
  const weekend = tripWindow('11-28', 2, 18);
  const weekday = tripWindow('12-01', 0, 8);
  assert.equal(rankTripWindows([weekend, weekday]).start, '11-28');
});

const classifiedWindow = (start, flags, overrides = {}) => ({
  start,
  end: start,
  span: start + '—' + start,
  wk: flags.wk ?? 0,
  valid: flags.valid === true,
  looseValid: flags.looseValid === true,
  trendValid: flags.trendValid === true,
  days: ['周一', '周二', '周三', '周四'].map((wd, i) => day(Object.assign({
    date: '11-' + String(24 + i),
    wd,
    hi: 24,
    lo: 18,
    conf: 3,
    lead: 3,
    modal: '多云',
    overcast: false
  }, overrides)))
});

test('首页先选严格窗口，不让天气更舒服的远期趋势挤掉近期合格窗口', () => {
  const strict = classifiedWindow('11-24', {
    valid: true, looseValid: true, trendValid: true, wk: 2
  }, { hi: 34, conf: 2, lead: 5 });
  const trend = classifiedWindow('12-01', {
    valid: false, looseValid: false, trendValid: true, wk: 0
  }, { hi: 23, conf: 1, lead: 10 });
  assert.equal(rankTripWindows([strict, trend]).start, '12-01');
  const selected = selectDisplayWindow([trend, strict]);
  assert.equal(selected.tier, 'strict');
  assert.equal(selected.window.start, '11-24');
  assert.ok(selected.candidates.every((w) => w.valid));
});

test('没有严格窗口时，阴天放宽窗口显示为“可以考虑”而非“推荐出发”', () => {
  const loose = classifiedWindow('11-24', {
    valid: false, looseValid: true, trendValid: false
  }, { modal: '阴', overcast: true, conf: 2, lead: 5 });
  assert.equal(verdictOf(loose).k, 'rec');
  const selected = selectDisplayWindow([loose]);
  assert.equal(selected.tier, 'loose');
  assert.equal(windowVerdict(selected.window, selected.tier).k, 'maybe');
  assert.match(windowVerdict(selected.window, selected.tier).why, /阴天/);
});

test('只有远期趋势窗口时必须提示等待，不能显示可出发结论', () => {
  const trend = classifiedWindow('12-01', {
    valid: false, looseValid: false, trendValid: true
  }, { modal: '晴', overcast: false, conf: 1, lead: 10 });
  assert.equal(verdictOf(trend).k, 'maybe');
  const selected = selectDisplayWindow([trend]);
  assert.equal(selected.tier, 'trend');
  assert.equal(windowVerdict(selected.window, selected.tier).k, 'wait');
});

test('没有严格、放宽或趋势窗口时不制造可出发建议', () => {
  const bad = classifiedWindow('11-24', {
    valid: false, looseValid: false, trendValid: false
  }, { rainy: true, rainLevel: '明显', mmMed: 8, popMax: 80, modal: '雨', overcast: false });
  const selected = selectDisplayWindow([bad]);
  assert.equal(selected.tier, 'none');
  assert.equal(windowVerdict(selected.window, selected.tier).k, 'wait');
});

