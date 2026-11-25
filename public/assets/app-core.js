const RUB = {
  cond: {'晴':100,'多云转晴':95,'多云~晴':95,'晴~多云':95,'晴转多云':95,'阴转晴':90,'多云':88,'阴转多云':85,
         '多云转阴':70,'阴':30,'小雨':25,'小雨转多云':45,'多云转小雨':30,'小雨~阴':30,'小雨转阴':30,'阴~小雨':30,
         '阵雨':35,'雨':22,'中雨':12,'中雨~小雨':14,'小雨转中雨':16,'多云~中雨':22,'大雨':6,'阴转雨':18},
  cat: {'晴':'晴','多云转晴':'晴','多云~晴':'晴','晴~多云':'晴','晴转多云':'晴','阴转晴':'晴','多云':'多云',
        '多云转阴':'阴','阴转多云':'多云','阴':'阴','雨':'雨','小雨':'雨','小雨转多云':'雨','多云转小雨':'雨',
        '小雨~阴':'雨','小雨转阴':'雨','阴~小雨':'雨','中雨':'雨','小雨转中雨':'雨','中雨~小雨':'雨',
        '阵雨':'雨','多云~中雨':'雨','大雨':'雨','阴转雨':'雨'}
};
const NEED = {
  '晴':{s:'sun', c:'s'},
  '多云':{s:'cloud', c:'c'},
  '阴':{s:'over', c:'o'},
  '雨':{s:'rain', c:'r'}
};
const WD = ['周日','周一','周二','周三','周四','周五','周六'];
const APP_TIME_ZONE='Asia/Shanghai';
function chinaParts(value=new Date(),timeZone=APP_TIME_ZONE){
  const d=value instanceof Date? value : new Date(value);
  if(!Number.isFinite(d.getTime())) throw new Error('无效日期');
  const out={};
  new Intl.DateTimeFormat('en-CA',{
    timeZone:timeZone || APP_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(d).forEach(p=>{ if(p.type!=='literal') out[p.type]=p.value; });
  return out;
}
function chinaIso(value=new Date(),timeZone=APP_TIME_ZONE){
  const p=chinaParts(value,timeZone);
  return p.year+'-'+p.month+'-'+p.day;
}
function chinaHour(value=new Date(),timeZone=APP_TIME_ZONE){ return Number(chinaParts(value,timeZone).hour); }
function chinaStamp(value,timeZone=APP_TIME_ZONE){
  const p=chinaParts(value,timeZone);
  return Number(p.month)+'-'+p.day+' '+p.hour+':'+p.minute;
}

function median(a){const b=a.slice().sort((x,y)=>x-y);const n=b.length;return n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2}
function dayScore(cs,hi,lo,popMax){
  const comp = 0.65*cs + 0.35*(100 - popMax*0.9);
  const heat = Math.max(0,hi-28)*2, cold = Math.max(0,15-lo)*1.5, swing = (hi-lo)>11?3:0;
  return Math.max(0, Math.min(100, Math.round(comp - heat - cold - swing)));
}
function inferPop(mm){
  if(mm==null) return null;
  if(mm<=0) return 0; if(mm<=1) return 15; if(mm<=3) return 35; if(mm<=8) return 55; return 75;
}
function metrics(recs, wMap, lead){
  const use = recs.filter(r=>!r.out && r.hi!=null);
  const groups={};
  use.forEach(r=>{ const o=ORG[r.p]||r.p; (groups[o]=groups[o]||[]).push(r); });
  // 同一家机构的多个模式先合成一票，ECMWF 与 ECMWF-AI 不算两个独立机构
  const orgs=Object.keys(groups).map(function(org){
    const rs=groups[org];
    const w=rs.reduce((s,r)=>s+(W_MDL[r.p]||0.1),0);
    const cw={};
    rs.forEach(r=>{ const c=RUB.cat[r.cond]; cw[c]=(cw[c]||0)+(W_MDL[r.p]||0.1); });
    let cat='晴', best=-1;
    Object.keys(cw).forEach(c=>{ if(cw[c]>best){best=cw[c];cat=c;} });
    const avg=function(k){ const v=rs.map(r=>r[k]).filter(x=>x!=null); return v.length? v.reduce((a,b)=>a+b,0)/v.length : null; };
    return {org:org, w:w, cat:cat, mm:avg('mm'), pop:avg('pop'), hi:avg('hi'), lo:avg('lo'),
            wind:avg('wind'), n:rs.length, models:rs.map(r=>r.name)};
  });
  const wTotal=orgs.reduce((s,o)=>s+o.w,0);
  const avgO=function(k){ let sw=0,sv=0; orgs.forEach(o=>{ if(o[k]!=null){ sw+=o.w; sv+=o.w*o[k]; } }); return sw>0? sv/sw : null; };
  const hi=avgO('hi'), lo=avgO('lo'), wind=avgO('wind');
  const cs = wTotal>0? orgs.reduce((s,o)=> s+o.w*(RUB.cond[o.cat]||50),0)/wTotal : 0;
  const pops = orgs.map(o=>o.pop).filter(x=>x!=null);
  const mms  = orgs.map(o=>o.mm).filter(x=>x!=null);
  const popMed = pops.length? median(pops) : null;
  const popMax = pops.length? Math.max.apply(null,pops) : null;
  const mmMed  = mms.length? median(mms) : null;
  const catW={}; orgs.forEach(o=>{ catW[o.cat]=(catW[o.cat]||0)+o.w; });
  let modal='晴', best=-1;
  Object.keys(catW).forEach(c=>{ if(catW[c]>best){best=catW[c];modal=c;} });
  const rainShare = wTotal>0? (catW['雨']||0)/wTotal : 0;
  const realRain = orgs.some(o=> o.cat==='雨' && ((o.mm!=null && o.mm>=1.0) || (o.pop!=null && o.pop>=60)));
  const heavyShare = wTotal>0? orgs.filter(o=> o.cat==='雨' && ((o.mm!=null && o.mm>=3.5) || (o.pop!=null && o.pop>=80)))
      .reduce((s,o)=>s+o.w,0)/wTotal : 0;
  const heavy = heavyShare>=0.5;
  const overcastOrgs = orgs.filter(o=>o.cat==='阴').length;
  const overcastShare = wTotal>0? (catW['阴']||0)/wTotal : 0;
  // 少数机构报阴保留为分歧信号，不再直接否决；阴天须达到独立机构加权多数。
  if(modal==='雨' && !realRain) modal = overcastShare>=0.5 ? '阴' : '多云';
  const overcast = modal==='阴';
  const overcastMinority = !overcast && overcastShare>=0.3;
  const rainy = (rainShare>=0.5 && realRain) || heavy;
  const mist = orgs.some(o=>o.cat==='雨') && !realRain;
  const rainLevel = rainy? '明显' : (mist? '零星' : '无');
  const nOrg=orgs.length, nModel=use.length;
  const thin = nOrg<2;
  const hiVals=use.map(r=>r.hi).filter(x=>x!=null);
  const hiSpread = hiVals.length>1? Math.max.apply(null,hiVals)-Math.min.apply(null,hiVals) : 0;
  const topShare = wTotal>0? Math.max.apply(null,Object.keys(catW).map(k=>catW[k]))/wTotal : 0;
  const diverge = topShare<0.6 || hiSpread>4 || overcastMinority;
  let conf = lead<=3?3 : lead<=7?2 : lead<=10?1 : 0;
  if(nOrg<=2) conf=Math.min(conf,1);
  if(nOrg<2) conf=0;
  if(diverge) conf=Math.max(0,conf-1);
  const ok = !thin && !overcast && !rainy && conf>=2 && lead<=7;
  const loose = !thin && !rainy && conf>=2 && lead<=7;
  const trend = !thin && !overcast && !rainy;
  const outReason = thin? (nModel===0? '数据不足':'仅一家') : rainy? '雨' : overcast? '阴' : (lead>7||conf<2)? '远期' : '';
  const agree = use.filter(r=>RUB.cat[r.cond]===modal).length;
  const why = LEAD_TXT(lead)+'；'+nOrg+' 家独立机构、'+nModel+' 个模式有数'
    +(overcastMinority? '；'+overcastOrgs+' 家机构报阴，未达加权多数门槛'
      : diverge? '；各家分歧较大（最高温差 '+hiSpread.toFixed(1)+'℃）' : '；各家分歧不大');
  return {hi:hi,lo:lo,wind:wind,condScore:cs,popMed:popMed,popMax:popMax,mmMed:mmMed,
          score:dayScore(cs,hi==null?22:hi,lo==null?15:lo,popMax==null?20:popMax),
          modal:modal,n:nModel,nOrg:nOrg,agree:agree,overcast:overcast,overcastOrgs:overcastOrgs,
          overcastShare:overcastShare,overcastMinority:overcastMinority,rainy:rainy,mist:mist,
          rainLevel:rainLevel,ok:ok,loose:loose,trend:trend,outReason:outReason,
          conf:conf,confText:CONF_TXT[conf],confWhy:why,diverge:diverge,hiSpread:hiSpread,
          lead:lead,orgs:orgs,thin:thin};
}
function compareWindowPreference(a,b,badKey='bad',tolerance=5){
  const ba=Number.isFinite(a[badKey])?a[badKey]:0;
  const bb=Number.isFinite(b[badKey])?b[badKey]:0;
  if(ba!==bb) return ba-bb;
  const sa=Number.isFinite(a.score)?a.score:-Infinity;
  const sb=Number.isFinite(b.score)?b.score:-Infinity;
  if(Math.abs(sa-sb)<=tolerance && a.wk!==b.wk) return a.wk-b.wk;
  if(sa!==sb) return sb-sa;
  if(a.wk!==b.wk) return a.wk-b.wk;
  return a.start===b.start?0:(a.start<b.start?-1:1);
}
function buildWindows(days){
  const out=[];
  for(let i=0;i+3<days.length;i++){
    const g=days.slice(i,i+4);
    const avg=g.reduce((s,d)=>s+d.score,0)/4;
    const mn=Math.min.apply(null,g.map(d=>d.score));
    const bad=g.filter(d=>!d.ok).length;
    const looseBad=g.filter(d=>!d.loose).length;
    const trendBad=g.filter(d=>!d.trend).length;
    const wk=g.filter(d=> d.wd==='周六'||d.wd==='周日').length;
    out.push({start:g[0].date,end:g[3].date,span:g[0].date+'—'+g[3].date,avg:avg,min:mn,
              bad:bad,valid:bad===0,days:g.slice(),
              looseBad:looseBad,looseValid:looseBad===0,
              trendBad:trendBad,trendValid:trendBad===0,
              conf:Math.min.apply(null,g.map(d=>d.conf)),
              far:g.some(d=>d.lead>7),wk:wk,
              reasons:g.map(d=>d.ok?'':d.outReason)});
  }
  out.forEach(w=>{w.score = 0.55*w.avg + 0.45*w.min - 1.5*w.bad});
  out.sort((a,b)=>compareWindowPreference(a,b,'bad',5));
  return out;
}
function leadOf(dateStr, now=new Date(), timeZone=APP_TIME_ZONE){
  if(typeof dateStr!=='string') return NaN;
  let target;
  if(/^\\d{4}-\\d{2}-\\d{2}$/.test(dateStr)){
    const parts=dateStr.split('-').map(Number);
    target=Date.UTC(parts[0],parts[1]-1,parts[2]);
    if(new Date(target).toISOString().slice(0,10)!==dateStr) return NaN;
  }else{
    const mm=parseInt(dateStr.slice(0,2),10), dd=parseInt(dateStr.slice(3,5),10);
    if(!Number.isInteger(mm)||mm<1||mm>12||!Number.isInteger(dd)||dd<1||dd>31) return NaN;
    const today=chinaParts(now,timeZone), y=Number(today.year), currentMonth=Number(today.month);
    const targetYear=mm<currentMonth? y+1 : y;
    target=Date.UTC(targetYear,mm-1,dd);
  }
  const today=chinaIso(now,timeZone).split('-').map(Number);
  const base=Date.UTC(today[0],today[1]-1,today[2]);
  return Math.round((target-base)/86400000);
}
function applyObservedDay(day, observation, options={}){
  const out=Object.assign({},day);
  const mm=observation && observation.mm!=null? Number(observation.mm) : NaN;
  if(!Number.isFinite(mm)) return out;
  const isToday=options.isToday===true;
  const hour=Number.isInteger(options.hour)? String(options.hour).padStart(2,'0') : '当前';
  if(isToday && mm<1.0){
    out.actualSoFar=true;
    out.actualNote=mm>0
      ? '截至 '+hour+':00 已累计 '+mm.toFixed(1)+'mm，尚未达到全天判雨阈值；剩余时段仍按预报'
      : '截至 '+hour+':00 尚未观测到明显降雨；剩余时段仍按预报';
    return out;
  }
  out.actual=true;
  out.conf=3; out.confText='实况'; out.confWhy=isToday
    ? '今天已观测到明显降雨，后续安排按已发生天气处理'
    : '这一天已发生，用实际天气覆盖预报';
  if(!isToday){
    if(observation.hi!=null) out.hi=observation.hi;
    if(observation.lo!=null) out.lo=observation.lo;
  }
  if(mm>=1.0){
    out.rainy=true; out.modal='雨'; out.overcast=false;
    out.ok=false; out.loose=false; out.trend=false; out.outReason='雨';
    out.mist=false; out.rainLevel='明显';
    out.actualNote='实况已下雨 '+mm.toFixed(1)+'mm';
  }else{
    out.rainy=false; out.rainLevel='无'; out.mist=false;
    let cm=observation.code==null? null : codeToModal(observation.code);
    if(cm==='雨') cm='多云';
    if(cm) out.modal=cm; else if(out.modal==='雨') out.modal='多云';
    out.overcast=out.modal==='阴';
    out.ok=!out.thin && !out.overcast;
    out.loose=!out.thin;
    out.outReason=out.ok? '' : (out.overcast? '阴' : '');
    out.actualNote=isToday? out.actualNote : (day.rainy? '预报有雨，实况未达到全天判雨阈值' : '实况未达到全天判雨阈值');
  }
  return out;
}

function completedHourlyRain(daily,hourly,now=new Date(),timeZone=APP_TIME_ZONE){
  if(!daily || !Array.isArray(daily.time) || !Array.isArray(daily.precipitation_sum)
    || !hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly.precipitation)) return null;
  const today=chinaIso(now,timeZone), parts=chinaParts(now,timeZone), cut=today+'T'+parts.hour+':00';
  let total=0, count=0;
  for(let i=0;i<hourly.time.length;i++){
    const t=hourly.time[i], v=hourly.precipitation[i];
    if(typeof t!=='string' || v==null || !Number.isFinite(Number(v))
      || t<today+'T06:00' || t>=cut) continue;
    total+=Number(v); count++;
  }
  if(!count) return null;
  const mm=Math.round(total*10)/10;
  daily.__bornToday=mm;
  const index=daily.time.indexOf(today);
  if(index>=0) daily.precipitation_sum[index]=mm;
  return {mm,hours:count};
}

function packDays(raw,timeZone=APP_TIME_ZONE){
  return raw.map(d=>{
    const lead=d.lead!=null? d.lead : leadOf(d.iso||d.date,new Date(),timeZone);
    const m=metrics(d.recs, d.wMap||W_SCORE, lead);
    return Object.assign({date:d.date, wd:d.wd}, m, {recs:d.recs});
  });
}

/* ---------- 结论文案 ---------- */
/* ---------- 极简首屏：只回答去哪儿、什么时候、什么天气 ---------- */
let LAST_TS=null;
function fmtStamp(v){
  if(v==null) return '—';
  if(typeof v==='string'){
    const parsed=Date.parse(v);
    if(!Number.isFinite(parsed) || !v.includes('T')) return v;
    v=parsed;
  }
  return chinaStamp(v);
}
function setUpdated(v){
  LAST_TS=v;
  const el=document.getElementById('sUpdated');
  if(el) el.textContent='更新于 '+fmtStamp(v);
}
function forecastMeta(payload, now=Date.now()){
  const raw=payload && payload.updatedAt;
  const ts=typeof raw==='number'? raw : (typeof raw==='string'? Date.parse(raw) : NaN);
  const valid=Number.isFinite(ts);
  const rawAge=payload && payload.ageMinutes!=null? Number(payload.ageMinutes) : NaN;
  const age=Number.isFinite(rawAge) && rawAge>=0 ? rawAge : (valid? Math.max(0,Math.round((now-ts)/60000)) : null);
  return {updatedAt:valid?ts:null,stale:!payload || payload.stale===true || !valid,ageMinutes:age};
}
function riskOf(d){
  if(d.rainy || d.rainLevel==='明显') return (d.mmMed!=null && d.mmMed>=10)? 3 : 3;
  if(d.mist || d.rainLevel==='零星') return 2;
  if(d.mmMed!=null && d.mmMed>=1) return 2;
  if(d.popMax!=null && d.popMax>=40) return 2;
  return 1;
}
function riskText(r){ return r===3? '降雨 高' : r===2? '降雨 中' : '降雨 低'; }
function wxWord(d){
  if(d.rainy) return (d.mmMed!=null && d.mmMed>=10)? '持续降雨' : '明显降雨';
  if(d.mist || d.rainLevel==='零星') return '短时小雨';
  return d.modal;
}
function confTier(d){ return d.conf>=3? 3 : d.conf===2? 2 : 1; }
function confWhy(d){
  const t=confTier(d);
  const base=t===3? (d.diverge? '日期近，各家略有分歧' : '日期近，预报稳定')
    : t===2? (d.diverge? '几天内，各家有分歧' : '几天内，基本稳定')
    : (d.lead>9? '日期太远，仅供参考' : '日期偏远，可能变化');
  return d.overcastMinority? base+'；'+d.overcastOrgs+' 家机构报阴，未达加权多数' : base;
}
function winPen(w){
  let p=0;
  w.days.forEach(function(d){
    const r=riskOf(d);
    if(r===3) p += (d.mmMed!=null && d.mmMed>=10)? 58 : 44;
    else if(r===2) p += 12;
    if(d.hi!=null){ const t=Math.abs(d.hi-23)-3; if(t>0) p+=t*2.2; }
    if(d.lo!=null && d.lo<12) p+=(12-d.lo)*2.5;
  });
  return p;
}
function rankTripWindows(wins){
  if(!Array.isArray(wins)||!wins.length) return null;
  const scored=wins.map(function(w){
    return {w:w,pen:winPen(w),conf:Math.min.apply(null,w.days.map(function(d){return d.conf;}))};
  });
  const minPen=Math.min.apply(null,scored.map(function(x){return x.pen;}));
  const pool=scored.filter(function(x){return x.pen<=minPen+10;});
  pool.sort(function(a,b){
    if(b.conf!==a.conf) return b.conf-a.conf;
    if(Math.abs(a.pen-b.pen)<=6 && a.w.wk!==b.w.wk) return a.w.wk-b.w.wk;
    if(a.pen!==b.pen) return a.pen-b.pen;
    if(a.w.wk!==b.w.wk) return a.w.wk-b.w.wk;
    return a.w.start===b.w.start?0:(a.w.start<b.w.start?-1:1);
  });
  return pool.length?pool[0].w:null;
}
function verdictOf(w){
  const days=w.days, pen=winPen(w);
  const hiN=days.filter(function(d){ return riskOf(d)===3; });
  const midN=days.filter(function(d){ return riskOf(d)===2; });
  const minConf=Math.min.apply(null,days.map(function(d){ return d.conf; }));
  const cold=days.filter(function(d){ return d.lo!=null && d.lo<12; });
  const hot=days.filter(function(d){ return d.hi!=null && d.hi>28; });
  const drench=days.filter(function(d){ return d.mmMed!=null && d.mmMed>=10; });
  if(drench.length){
    return {k:'wait',t:'建议继续等待',why:drench.map(function(d){return d.date;}).join('、')+' 有大雨，四天里泡一天不划算；等预报把这段雨挪走再看。'};
  }
  if(pen<=22 && hiN.length===0 && midN.length===0 && minConf>=2){
    return {k:'rec',t:'推荐出发',why:'这四天没有明显降雨，气温也舒服，可以按这趟安排。'};
  }
  if(pen<=72 && hiN.length<=1 && minConf>=1){
    const bits=[];
    if(hiN.length) bits.push(hiN.map(function(d){return d.date;}).join('、')+' 有明显降雨');
    if(midN.length && !hiN.length) bits.push(midN.length+' 天可能飘点小雨，带把伞就行');
    if(cold.length) bits.push('最低到 '+Math.round(Math.min.apply(null,cold.map(function(d){return d.lo;}))) + '℃，早晚加件外套');
    if(hot.length) bits.push('最高到 '+Math.round(Math.max.apply(null,hot.map(function(d){return d.hi;}))) + '℃，中午偏热');
    if(minConf<=1) bits.push('日期还远，预报可能变');
    return {k:'maybe',t:'可以考虑',why:(bits.join('；')||'天气不算完美，但能安排')+'。'};
  }
  const why = hiN.length
    ? hiN.map(function(d){return d.date;}).join('、')+' 有明显降雨'
    : (minConf===0? '这几天的预报还不够稳' : '这几天雨水偏多');
  return {k:'wait',t:'建议继续等待',why:why+'，现在订行程容易踩空。日期近了会重新算。'};
}
function selectDisplayWindow(wins){
  const tiers=[
    ['strict',wins.filter(w=>w.valid)],
    ['loose',wins.filter(w=>w.looseValid)],
    ['trend',wins.filter(w=>w.trendValid)]
  ];
  for(const entry of tiers){
    if(entry[1].length){
      return {tier:entry[0],window:rankTripWindows(entry[1]),candidates:entry[1]};
    }
  }
  const best=rankTripWindows(wins);
  return best? {tier:'none',window:best,candidates:[]} : null;
}
function windowVerdict(w,tier){
  const base=verdictOf(w);
  if(tier==='strict') return base;
  if(tier==='loose'){
    if(base.k==='wait') return base;
    const cloudy=w.days.filter(d=>d.modal==='阴'||d.overcast).map(d=>d.date);
    const prefix=cloudy.length
      ? '这段有阴天（'+cloudy.join('、')+'），但没有明显降雨；按阴天放宽口径可以考虑。'
      : '这段符合阴天放宽口径，可以考虑。';
    const extra=base.k==='rec'? '温度和降雨风险也在可接受范围。' : base.why;
    return {k:'maybe',t:'可以考虑',why:prefix+(extra?' '+extra:'')};
  }
  if(tier==='trend'){
    return {k:'wait',t:'建议继续等待',why:'目前没有满足严格晴好或阴天放宽条件的四天窗口；'+(w.span||'这段日期')+'只作远期趋势参考，预报还会变化，不建议据此订行程。'};
  }
  return {k:'wait',t:'建议继续等待',why:'当前预报没有满足严格晴好或阴天放宽条件的连续四天窗口，继续等待下一轮预报。'};
}

function renderSimple(view){
  const rEl=document.getElementById('sRange'); if(!rEl) return;
  const wins=(view.windows||[]).filter(function(w){ return w.days && w.days.length===4; });
  if(!wins.length){ rEl.innerHTML='暂无可用的四天窗口'; return; }
  // 先按既有判定档位筛选，再在同一档内沿用原有风险/可信度/周末排序。
  const selected=selectDisplayWindow(wins);
  if(!selected || !selected.window){ rEl.innerHTML='暂无可用的四天窗口'; return; }
  const best=selected.window, candidatePool=selected.candidates;
  const minPen=candidatePool.length? Math.min.apply(null,candidatePool.map(function(w){return winPen(w);})) : Infinity;
  const days=best.days, v=windowVerdict(best,selected.tier);
  const mc=Math.min.apply(null,days.map(function(d){ return d.conf; }));
  const tent=mc<=1? ' · 暂定' : '';
  const crowdNote=best.wk===0? '全工作日，符合避开周末的偏好' : '含 '+best.wk+' 个周末日；天气接近时已优先工作日';
  rEl.innerHTML=days[0].date+' <small>'+days[0].wd+' 出发 · '+days[3].date+' '+days[3].wd+' 返程'+tent+'</small>';
  document.getElementById('sSub').textContent='4 天 3 晚 · 出发 '+days[0].date+' · 返程 '+days[3].date
    + (mc<=1? ' · 这几天的预报还远，日期先当暂定' : '')+' · '+crowdNote;
  document.getElementById('sVerdict').innerHTML='<span class="vpill v-'+v.k+'"><i></i>'+v.t+'</span>';
  document.getElementById('sWhy').textContent=v.why;

  document.getElementById('sDays').innerHTML=days.map(function(d){
    const r=riskOf(d), c=confTier(d);
    const ico=svgIcon(d.rainy? 'rain' : d.modal==='晴'? 'sun' : d.modal==='阴'? 'over' : 'cloud');
    return '<div class="s-row">'
      +'<div class="s-d"><b>'+d.date+'</b><span>'+d.wd+'</span></div>'
      +'<div class="s-ic">'+ico+'</div>'
      +'<div class="s-desc">'+wxWord(d)+'</div>'
      +'<div class="s-temp"><b>'+(d.hi==null?'—':Math.round(d.hi)+'°')+'</b><span>/ '+(d.lo==null?'—':Math.round(d.lo)+'°')+'</span></div>'
      +'<div class="s-risk r'+r+'">'+riskText(r)+'</div>'
      +'<div class="s-conf"><span class="cf c'+c+'">可信 '+(c===3?'高':c===2?'中':'低')+'</span><small>'+confWhy(d)+'</small></div>'
      +'</div>';
  }).join('');

  // 备选：最多一个，且不能与主选重叠；天气风险接近时仍优先周末日更少的窗口
  const altBox=document.getElementById('sAlt');
  const idxOf=function(w){ return view.days.findIndex(function(d){ return d.date===w.days[0].date; }); };
  const bi=idxOf(best);
  let alt=null;
  if(v.k!=='wait'){
    const candidates=candidatePool.filter(function(w){
      return w!==best && Math.abs(idxOf(w)-bi)>=4 && winPen(w)<=minPen+25;
    }).map(function(w){ return {w:w,p:winPen(w)}; });
    candidates.sort(function(a,b){
      if(Math.abs(a.p-b.p)<=10 && a.w.wk!==b.w.wk) return a.w.wk-b.w.wk;
      if(a.p!==b.p) return a.p-b.p;
      if(a.w.wk!==b.w.wk) return a.w.wk-b.w.wk;
      return a.w.start===b.w.start?0:(a.w.start<b.w.start?-1:1);
    });
    alt=candidates.length?candidates[0].w:null;
  }
  if(alt){
    const av=windowVerdict(alt,selected.tier);
    altBox.innerHTML='<span class="s-altbox"><span class="s-altk">备选</span>'
      +'<b>'+alt.days[0].date+' '+alt.days[0].wd+' — '+alt.days[3].date+' '+alt.days[3].wd+'</b>'
      +'<span>出发 '+alt.days[0].date+' · 返程 '+alt.days[3].date+'</span>'
      +'<span class="s-altv v-'+av.k+'">'+av.t+'</span></span>';
  }else{
    altBox.innerHTML='';
  }
  if(LAST_TS==null) setUpdated('—');
}


/* ---------- 三个事实 ---------- */
/* ---------- 图标 ---------- */
function svgIcon(t){
  const S='<svg viewBox="0 0 30 26" width="26" height="22" aria-hidden="true">';
  const stroke='stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"';
  if(t==='sun') return S+'<g color="#D9962B"><circle cx="15" cy="13" r="6.2" fill="none" stroke="#D9962B" stroke-width="1.8"/><g stroke="#D9962B" stroke-width="1.7" stroke-linecap="round"><path d="M15 1.5v3M15 21.5v3M2.5 13h3M24.5 13h3M6 4.5l2.1 2.1M21.9 19.4l2.1 2.1M24 4.5L21.9 6.6M8.1 19.4L6 21.5"/></g></g></svg>';
  if(t==='cloud') return S+'<g color="#485853"><circle cx="11" cy="10" r="4.6" fill="none" stroke="#D9962B" stroke-width="1.6"/><path d="M8.5 20.5h13a4.8 4.8 0 0 0 .6-9.5 6.4 6.4 0 0 0-12.2-1.6 4.9 4.9 0 0 0-1.4 11.1Z" '+stroke+'/></g></svg>';
  if(t==='over') return S+'<g color="#6C7C77"><ellipse cx="15" cy="12" rx="12" ry="5.4" fill="#E4EAE6" stroke="#6C7C77" stroke-width="1.4"/><ellipse cx="15" cy="12" rx="8" ry="4" fill="none" stroke="#6C7C77" stroke-width="1.2" opacity=".7"/></g></svg>';
  return S+'<g color="#54748A"><path d="M9 16.5a4.6 4.6 0 0 1 .9-9.1 6 6 0 0 1 11.3 1.3 4.2 4.2 0 0 1-1.2 8.3Z" '+stroke+'/><g stroke="#54748A" stroke-width="1.6" stroke-linecap="round"><path d="M10.5 19v3M15 19.6v3M19.5 19v3"/></g></g></svg>';
}
const W_SCORE={cma:.32,ecmwf:.20,qweather:.16,cmaweb:.16,moji:.12,eastday:.02,twc:.02};

/* ---------- 日历 ---------- */
let CUR=null;
function isToday(mmdd){ return mmdd===chinaIso().slice(5); }
function renderCal(view){
  const days=view.days;
  document.querySelector('.calinner').style.setProperty('--n', days.length);
  const cal=document.getElementById('cal');
  cal.innerHTML='';
  const hl=document.createElement('div'); hl.className='calhead'; hl.textContent='适合出门'; cal.appendChild(hl);
  days.forEach(d=>{
    const col = d.ok? 'var(--good)' : (d.outReason==='阴'? '#6C7C77' : 'var(--alert)');
    const bg = d.ok? '#F7FBF8' : (d.outReason==='阴'? '#F2F4F3' : '#FBF3F1');
    const b=document.createElement('button');
    b.className='cell'+(d.ok?'':' out'); b.type='button';
    b.style.setProperty('--c',col); b.style.setProperty('--bg',bg);
    b.setAttribute('aria-label', d.date+' '+d.wd+' '+d.modal+' '+d.score+' 分'+(d.ok?' 能过':' 过不了'));
    b.innerHTML =
      '<div class="dt"><span class="num">'+d.date+(isToday(d.date)?'<span class="tdy">今</span>':'')+'</span><span class="w">'+d.wd+'</span></div>'
      +'<div class="ic">'+svgIcon(d.rainy?'rain':(d.modal==='晴'?'sun':d.modal==='阴'?'over':'cloud'))+'<span class="cn">'+(d.n===0?'缺数据':d.modal)+'</span></div>'
      +'<div class="tp">'+(d.hi==null?'—':Math.round(d.hi)+'°')+'<small>/'+(d.lo==null?'—':Math.round(d.lo)+'°')+'</small></div>'
      +'<div class="po"><span>雨<i>'+(d.popMed==null?'—':Math.round(d.popMed)+'%')+'</i></span><span>'+d.nOrg+'家/'+d.n+'模</span></div>'
      +'<div class="sc"><span class="bar"><i style="width:'+d.score+'%"></i></span><span class="sv">'+d.score+'</span></div>'
      +'<div class="cf">'+(d.lead<=3?'短期':d.lead<=7?'中期':d.lead<=10?'趋势':'低置信')+'·'+d.confText
      +(d.ok?'':('·'+(d.outReason==='阴'?(d.loose? '阴次档':'阴'):(d.outReason==='雨'?'雨':(d.outReason==='数据不足'?'缺':(d.outReason==='仅一家'?'1家':'远'))))))+'</div>'
      +(d.actualNote? '<div class="anote">'+d.actualNote+'</div>' : (d.mist? '<div class="anote">零星小雨，不算下雨</div>' : ''));
    b.addEventListener('click',()=>{
      openPanel(d,b);
      if(typeof fetchRainHours==='function' && d.rainHoursState!=='ready' && d.rainHoursState!=='unavailable'){
        const pending=fetchRainHours(view);
        openPanel(d,b);
        pending.then(()=>{
          if(b.isConnected && b.getAttribute('aria-current')==='true') openPanel(d,b);
        });
      }
    });
    cal.appendChild(b);
  });
}
function openPanel(d,btn){
  document.querySelectorAll('.cell').forEach(c=>c.setAttribute('aria-current','false'));
  btn.setAttribute('aria-current','true');
  const p=document.getElementById('panel'); p.hidden=false;
  const why = d.thin? (d.n===0? '数据不足：这一天没有可用预报，不按晴或无雨处理' : '只有 '+d.nOrg+' 家机构有预报，不作确定结论')
    : d.ok? '能过'
    : d.outReason==='阴'? (d.loose? '严格档未通过（加权多数报阴），宽松档可以' : '未通过：加权多数机构报阴')
    : d.outReason==='雨'? '过不了：多数机构报雨，或有明显降雨'
    : d.lead>7? '远期只作趋势参考，不出确定结论' : '置信度不够';
  const skyTxt = d.thin? '数据缺失，不能按晴或无雨处理'
    : d.modal+'（'+d.nOrg+' 家机构里 '+d.agree+' 个模式同向，ECMWF 与 ECMWF-AI 只算一家）';
  const hourlyText=d.rainHoursState==='loading'? '正在读取逐小时降雨…'
    : d.rainHoursState==='unavailable'? '逐小时数据暂不可用'
    : d.rainHoursState==='ready'? (d.rainHours && d.rainHours.length? d.rainHours.join('、') : '未出现 ≥0.2mm/h 的时段')
    : '点击日期后读取';
  const rainTxt = (d.popMed==null? '降水概率：各家都没给，显示缺失' : '降水概率 中位 '+Math.round(d.popMed)+'%｜最高 '+Math.round(d.popMax)+'%')
    +'<br>预期雨量：'+(d.mmMed==null? '缺失' : '中位 '+d.mmMed.toFixed(1)+'mm')
    +'<br>降雨级别：'+(d.rainLevel==='无'? '无明显降雨' : d.rainLevel==='零星'? '零星小雨，不按下雨处理' : '明显降雨')
    +'<br>逐小时时段：'+hourlyText;
  const comfortTxt = '最高 '+(d.hi==null?'—':d.hi.toFixed(1)+'°')+'，最低 '+(d.lo==null?'—':d.lo.toFixed(1)+'°')
    +'<br>最大风速：'+(d.wind==null? '缺失' : Math.round(d.wind)+' km/h')
    +'<br>'+(d.rainy? '有雨，户外安排要改' : d.modal==='阴'? '不晒，适合逛街，拍照偏灰' : '适合户外，注意早晚温差');
  p.innerHTML='<div class="panel-h"><h3 class="num">'+d.date+' '+d.wd+'</h3>'
    +'<span class="tag'+(d.ok?'':' al')+'">'+why+'</span>'
    +'<span class="tag">可信度 '+d.confText+'</span>'
    +'<span class="tag">'+LEAD_TXT(d.lead)+'</span>'
    +'<span class="tag">'+d.nOrg+' 家机构 / '+d.n+' 个模式</span></div>'
    +'<p class="acc-note">'+d.confWhy+'</p>'
    +'<div class="p3d"><div><h4>天空状况</h4><p>'+skyTxt+'</p></div>'
    +'<div><h4>降雨情况</h4><p>'+rainTxt+'</p></div>'
    +'<div><h4>出行舒适度</h4><p>'+comfortTxt+'</p></div></div>'
    +'<table class="plats"><colgroup><col style="width:20%"><col style="width:16%"><col style="width:24%"><col style="width:16%"><col style="width:12%"><col style="width:12%"></colgroup>'
    +'<thead><tr><th>模式（机构）</th><th>天气</th><th>最高/最低</th><th>下雨概率</th><th>雨量</th><th>风</th></tr></thead><tbody>'
    + d.recs.map(r=>'<tr class="'+(r.out?'is-out':'')+'"><td>'+r.name+'<span class="oof">'+(ORG_NAME[ORG[r.p]]||'')+'</span></td>'
      +'<td>'+r.cond+'</td><td class="c">'+(r.hi==null?'—':Math.round(r.hi)+'°')+' / '+(r.lo==null?'—':Math.round(r.lo)+'°')+'</td>'
      +'<td class="c">'+(r.pop==null?'缺':r.pop+'%')+'</td><td class="c">'+(r.mm==null?'缺':r.mm+'mm')+'</td>'
      +'<td class="c">'+(r.wind==null?'—':Math.round(r.wind))+'</td>'
      +'</tr>').join('')
    +'</tbody></table>';
  if(typeof wrapTables==='function') wrapTables();
  p.scrollIntoView({block:'nearest',behavior:'smooth'});
}
/* ---------- 排名图 ---------- */
