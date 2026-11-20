import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAP, buildWindows, verdictOf, winPen, riskOf, confTier, forecastMeta,
  chinaParts, chinaIso, leadOf, applyObservedDay, aggPoints,
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

test('当天实况未达到判雨阈值时保留剩余时段预报', () => {
  const forecast = day({rainy:true,modal:'雨',rainLevel:'明显',ok:false,loose:false,trend:false});
  const partial = applyObservedDay(forecast,{mm:0.4,code:0},{isToday:true,hour:10});
  assert.equal(partial.rainy,true);
  assert.equal(partial.modal,'雨');
  assert.equal(partial.ok,false);
  assert.match(partial.actualNote,/剩余时段仍按预报/);
  assert.equal(partial.actual,undefined);
});

test('当天已经观测到明显降雨时才把当天标记为已下雨', () => {
  const forecast = day({rainy:false,modal:'多云',rainLevel:'无',ok:true,loose:true,trend:true});
  const actual = applyObservedDay(forecast,{mm:1.2,code:61},{isToday:true,hour:11});
  assert.equal(actual.rainy,true);
  assert.equal(actual.modal,'雨');
  assert.equal(actual.ok,false);
  assert.equal(actual.actual,true);
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

test('模型权重合计 1.0，ECMWF 两个产品按一家机构计票', () => {
  const sum = Object.values(W_MDL).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(Object.keys(MDL).length, 6);
  assert.equal(ORG.ecmwf_ifs025, ORG.ecmwf_aifs025_single);
  assert.equal(new Set(Object.values(ORG)).size, 5);
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
