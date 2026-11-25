function codeToModal(c){ if(c==null) return null; if(c===0||c===1) return '晴'; if(c===2) return '多云'; if(c===3||c===45||c===48) return '阴'; return '雨'; }
function actualMap(){
  const A={}; if(!ACTUAL||!ACTUAL.time) return A;
  ACTUAL.time.forEach((iso,i)=>{ A[iso]={mm:ACTUAL.precipitation_sum[i], hi:ACTUAL.temperature_2m_max[i], lo:ACTUAL.temperature_2m_min[i], code:ACTUAL.weather_code[i]}; });
  if(typeof ACTUAL.__bornToday==='number'){ const t=chinaIso(); if(A[t]) A[t].born=ACTUAL.__bornToday; }
  return A;
}
function applyActual(view){
  const A=actualMap(); if(!view||!view.days) return;
  const today=chinaParts(), y=Number(today.year), m0=Number(today.month), todayIso=chinaIso();
  let touched=false;
  view.days.forEach(d=>{
    const mm=parseInt(d.date.slice(0,2),10);
    const iso=(mm<m0? y+1 : y)+'-'+d.date;
    const a=A[iso]; if(!a || iso>todayIso) return;
    const isToday=iso===todayIso;
    // 当天只使用已经结束的小时实况；没有小时数据时绝不拿“全天预报总雨量”冒充实况。
    if(isToday && typeof a.born!=='number') return;
    const mmUse=isToday? a.born : a.mm;
    if(mmUse==null) return;
    const next=applyObservedDay(d,{mm:mmUse,code:a.code,hi:a.hi,lo:a.lo},{isToday,hour:Number(today.hour)});
    Object.assign(d,next);
    touched=true;
  });
  if(touched) view.windows=buildWindows(view.days);
}
async function fetchActual(){
  const ACT_URL='https://api.open-meteo.com/v1/forecast?latitude=23.125,23.129,23.135,23.09&longitude=113.24,113.267,113.33,113.31'
   +'&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum'
   +'&hourly=precipitation'
   +'&timezone=Asia%2FShanghai&past_days=7&forecast_days=1';
  let js=null;
  for(let a=0;a<3 && !js;a++){
    const ctl=new AbortController(); const to=setTimeout(function(){ctl.abort();},22000);
    try{
      const r=await fetch(ACT_URL,{cache:'no-store',signal:ctl.signal});
      if(r.ok) js=await r.json();
    }catch(e){}
    finally{ clearTimeout(to); }
    if(!js) await new Promise(function(r){ setTimeout(r, 1200*(a+1)); });
  }
  if(!js) return null;
  const arr=Array.isArray(js)? js : [js];
  const dl=arr.filter(function(x){ return x.daily; });
  if(!dl.length) return null;
  const daily=aggPoints(dl.map(function(x){ return x.daily; }));
  const hl=arr.filter(function(x){ return x.hourly; });
  const hourly=hl.length? aggPoints(hl.map(function(x){ return x.hourly; })) : null;
  if(hourly) completedHourlyRain(daily,hourly);
  return daily;
}
async function refreshActual(){
  try{
    const d=await fetchActual(); if(d) ACTUAL=d;
    if(VIEW && ACTUAL){ applyActual(VIEW); render(VIEW); }
  }catch(err){ console.warn('[actual] refresh failed:',err && err.message? err.message:err); }
}

function isoOf(d){ return chinaIso(d); }

/* ---------- 实时重算 ---------- */
const SNAP = {days: DATA.days.map(function(d){return Object.assign({},d,{wMap:W_SCORE});}), windows:null, src:'snapshot'};
function snapshotView(){
  const today=isoOf(new Date()).slice(5);
  const days = packDays(DATA.days.filter(d=>d.date>=today));
  return {days:days, windows:buildWindows(days), src:'snapshot'};
}
const SNAP_TIME='2026-11-19 12:30';
const SNAP_RAW={"time":["2026-11-19","2026-11-20","2026-11-21","2026-11-22","2026-11-23","2026-11-24","2026-11-25","2026-11-26","2026-11-27","2026-11-28","2026-11-29","2026-11-30","2026-12-01","2026-12-02","2026-12-03","2026-12-04"],"weather_code_ecmwf_ifs025":[51,51,3,3,51,51,51,51,3,2,3,3,51,51,3,null],"temperature_2m_max_ecmwf_ifs025":[22.0,17.4,20.9,22.8,22.5,21.8,18.0,23.7,21.7,24.6,22.2,23.1,21.2,23.7,25.2,null],"temperature_2m_min_ecmwf_ifs025":[15.6,11.7,9.9,11.2,17.0,16.8,13.1,14.9,16.1,12.2,9.7,9.6,13.6,15.5,16.9,null],"precipitation_sum_ecmwf_ifs025":[0.2,3.9,0.1,0.0,2.8,20.9,5.8,2.1,0.2,0.0,0.0,0.0,2.8,1.5,0.0,null],"precipitation_probability_max_ecmwf_ifs025":[8.0,75.0,1.0,2.0,69.0,88.0,47.0,41.0,18.0,7.0,4.0,4.0,16.0,20.0,15.0,null],"wind_speed_10m_max_ecmwf_ifs025":[15.2,15.2,8.4,10.6,10.6,15.8,12.3,4.7,5.5,17.0,9.4,5.8,7.9,7.3,9.7,null],"weather_code_ecmwf_aifs025_single":[51,51,3,51,51,51,51,0,0,0,2,51,51,51,2,null],"temperature_2m_max_ecmwf_aifs025_single":[21.2,16.8,21.1,19.9,19.7,21.1,18.7,22.3,24.8,25.9,25.1,23.4,26.1,27.5,28.6,null],"temperature_2m_min_ecmwf_aifs025_single":[16.4,12.3,10.8,13.4,16.2,16.2,14.3,13.1,14.6,15.0,14.4,18.1,19.3,20.4,20.6,null],"precipitation_sum_ecmwf_aifs025_single":[0.8,7.2,0.9,0.0,3.0,12.6,0.2,0.2,0.0,0.0,0.0,0.5,0.8,0.3,0.0,0.8],"precipitation_probability_max_ecmwf_aifs025_single":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"wind_speed_10m_max_ecmwf_aifs025_single":[16.9,18.6,11.7,9.0,15.9,21.8,13.5,7.3,6.9,11.5,10.1,9.0,9.5,5.4,10.5,null],"weather_code_ukmo_seamless":[3,3,3,3,51,51,51,null,null,null,null,null,null,null,null,null],"temperature_2m_max_ukmo_seamless":[22.2,18.7,22.2,22.7,25.3,22.8,16.0,null,null,null,null,null,null,null,null,null],"temperature_2m_min_ukmo_seamless":[16.0,14.4,11.9,14.7,18.6,14.3,12.6,null,null,null,null,null,null,null,null,null],"precipitation_sum_ukmo_seamless":[0.0,0.0,0.0,0.0,0.4,13.8,2.4,null,null,null,null,null,null,null,null,null],"precipitation_probability_max_ukmo_seamless":[0.0,22.0,0.0,11.0,72.0,78.0,23.0,6.0,17.0,10.0,null,null,null,null,null,null],"wind_speed_10m_max_ukmo_seamless":[15.3,16.5,10.9,10.8,10.2,18.0,12.8,null,null,null,null,null,null,null,null,null],"weather_code_cma_grapes_global":[2,51,2,2,51,null,null,null,null,null,null,null,null,null,null,null],"temperature_2m_max_cma_grapes_global":[20.6,16.7,19.6,20.1,21.1,null,null,null,null,null,null,null,null,null,null,null],"temperature_2m_min_cma_grapes_global":[15.8,13.4,9.9,12.5,17.2,null,null,null,null,null,null,null,null,null,null,null],"precipitation_sum_cma_grapes_global":[0.0,3.6,0.2,0.0,0.3,null,null,null,null,null,null,null,null,null,null,null],"precipitation_probability_max_cma_grapes_global":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"wind_speed_10m_max_cma_grapes_global":[21.9,21.3,12.3,10.3,14.2,null,null,null,null,null,null,null,null,null,null,null],"weather_code_icon_seamless":[3,51,3,3,3,3,51,null,null,null,null,null,null,null,null,null],"temperature_2m_max_icon_seamless":[21.2,16.6,20.1,17.7,16.8,18.2,14.7,null,null,null,null,null,null,null,null,null],"temperature_2m_min_icon_seamless":[16.0,12.0,11.3,14.1,15.9,14.4,10.4,null,null,null,null,null,null,null,null,null],"precipitation_sum_icon_seamless":[0.0,7.1,0.0,0.0,0.4,0.7,21.7,null,null,null,null,null,null,null,null,null],"precipitation_probability_max_icon_seamless":[6.5,81.5,3.0,4.0,49.0,59.0,61.0,null,null,null,null,null,null,null,null,null],"wind_speed_10m_max_icon_seamless":[12.8,10.2,9.1,4.5,5.8,15.9,10.3,null,null,null,null,null,null,null,null,null],"weather_code_meteofrance_seamless":[3,51,3,3,null,null,null,null,null,null,null,null,null,null,null,null],"temperature_2m_max_meteofrance_seamless":[20.6,19.1,20.9,21.5,null,null,null,null,null,null,null,null,null,null,null,null],"temperature_2m_min_meteofrance_seamless":[16.4,11.7,10.4,11.8,null,null,null,null,null,null,null,null,null,null,null,null],"precipitation_sum_meteofrance_seamless":[0.0,7.0,0.0,0.0,null,null,null,null,null,null,null,null,null,null,null,null],"precipitation_probability_max_meteofrance_seamless":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"wind_speed_10m_max_meteofrance_seamless":[22.4,25.1,14.3,12.5,null,null,null,null,null,null,null,null,null,null,null,null]};
const CACHE_KEY='gz_wx_v9', TTL=6*3600*1000;
let VIEW=null;

function setStatus(kind,text,engine){
  const dot=document.getElementById('dot');
  const status=document.getElementById('status');
  const engineEl=document.getElementById('engine');
  if(dot) dot.className='dot'+(kind==='warn'?' warn':kind==='err'?' err':'');
  if(status) status.textContent=text;
  if(engineEl && engine!==undefined) engineEl.textContent=engine;
}
function render(view){
  VIEW=view;
  renderSimple(view); renderCal(view); renderTrend(view); wrapTables();
}

const MDL = {'ecmwf_ifs025':'ECMWF','ecmwf_aifs025_single':'ECMWF-AI','ukmo_seamless':'UKMO','cma_grapes_global':'CMA','icon_seamless':'ICON','meteofrance_seamless':'Météo-FR'};
const W_MDL = {'ecmwf_ifs025':0.18,'ecmwf_aifs025_single':0.18,'cma_grapes_global':0.16,'ukmo_seamless':0.16,'icon_seamless':0.14,'meteofrance_seamless':0.18};
const ORG = {'ecmwf_ifs025':'ECMWF','ecmwf_aifs025_single':'ECMWF','ukmo_seamless':'UKMO','cma_grapes_global':'CMA','icon_seamless':'ICON','meteofrance_seamless':'MF'};
const ORG_NAME = {'ECMWF':'欧洲中心','UKMO':'英国气象局','CMA':'中国气象局','ICON':'德国 DWD','MF':'法国气象局'};
const MODEL_TOTAL = 6, ORG_TOTAL = 5;
const CONF_TXT = ['仅趋势','低','中','高'];
const LEAD_TXT = function(lead){ return lead<=3? '短期（1–3 天）' : lead<=7? '中期（4–7 天）' : lead<=10? '趋势参考（8–10 天）' : '低置信趋势（11–15 天）'; };
const CODE = (c)=> c===0||c===1?['晴','晴']: c===2?['多云','多云']: c===3||c===45||c===48?['阴','阴']
  : c<=57?['小雨','雨']: c<=67?['中雨','雨']: c<=77?['小雨','雨']: c<=82?['阵雨','雨']
  : c<=86?['阵雨','雨']: ['雷阵雨','雨'];

function fromOpenMeteo(json, options={}){
  const d=json.daily, t=d.time; if(!t) return null;
  const models=Object.keys(MDL);
  const recsByDay=t.map(()=>([]));
  models.forEach(m=>{
    const code=d['weather_code_'+m], hi=d['temperature_2m_max_'+m], lo=d['temperature_2m_min_'+m],
          mm=d['precipitation_sum_'+m], pp=d['precipitation_probability_max_'+m],
          wd=d['wind_speed_10m_max_'+m];
    if(!code) return;
    t.forEach((_,i)=>{
      if(code[i]==null || !hi || hi[i]==null) return;   // 这家当天没数据：记为缺失，不当作晴或无雨
      const [lb]=(options.conditionForCode||CODE)(code[i]);
      recsByDay[i].push({p:m,name:MDL[m],cond:lb,hi:hi[i],lo:lo?lo[i]:null,
        pop: pp? (pp[i]==null?null:Math.round(pp[i])) : null,
        mm: mm? mm[i] : null,
        wind: wd? wd[i] : null, out:false});
    });
  });
  const days=t.map((iso,i)=>{
    const dt=new Date(iso+'T00:00:00Z');
    const recs=recsByDay[i].filter(r=>r.hi!=null);
    return {date:iso.slice(5), wd:WD[dt.getUTCDay()], recs:recs,
      lead:options.today? Math.round((Date.parse(iso)-Date.parse(options.today))/86400000) : undefined};
  });
  if(days.length<(options.minDays||6)) return null;
  const built=packDays(days);
  return {days:built, windows:buildWindows(built), src:'live'};
}

function loadCache(){
  try{
    const raw=localStorage.getItem(CACHE_KEY); if(!raw) return null;
    const o=JSON.parse(raw);
    if(!o||!Number.isFinite(o.ts)||o.ts<=0||o.ts>Date.now()+5*60*1000
      ||!o.view||!Array.isArray(o.view.days)||!o.view.days.length) return null;
    return o;
  }catch(e){ return null; }
}
function saveCache(view, ts){
  const stamp=Number.isFinite(ts)? ts : Date.now();
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify({ts:stamp, view:view})); }catch(e){}
}
function hm(ts){ const p=chinaParts(ts); return p.hour+':'+p.minute; }

const API_BASE='https://api.open-meteo.com/v1/forecast?latitude=23.125,23.129,23.135,23.09&longitude=113.24,113.267,113.33,113.31'
 +'&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max'
 +'&timezone=Asia%2FShanghai&forecast_days=16';
const API_GROUPS=['&models=ecmwf_ifs025,ecmwf_aifs025_single,ukmo_seamless',
                  '&models=cma_grapes_global,icon_seamless,meteofrance_seamless'];
function aggPoints(list){
  if(!Array.isArray(list) || !list.length) return null;
  const base=list[0] && list[0].time;
  if(!Array.isArray(base) || !base.length) throw new Error('四点合成缺少有效日期序列');
  list.forEach(function(d,index){
    if(!d || !Array.isArray(d.time) || d.time.length!==base.length
      || d.time.some(function(v,i){ return v!==base[i]; })){
      throw new Error('四点合成日期不一致（点位 '+(index+1)+'）');
    }
  });
  if(list.length===1) return list[0];
  const out={time:base};
  Object.keys(list[0]).forEach(function(k){
    if(k==='time') return;
    if(k.indexOf('weather_code')===0){
      out[k]=list[0].time.map(function(_,i){
        const v={};
        list.forEach(function(d){ const c=d[k]? d[k][i]:null; if(c==null) return; const lb=CODE(c)[0]; v[lb]=(v[lb]||0)+1; });
        let best=null, bn=-1;
        Object.keys(v).forEach(function(lb){ if(v[lb]>bn){bn=v[lb];best=lb;} });
        return best==null? null : (best==='晴'?0:best==='多云'?2:best==='阴'?3:51);
      });
    }else{
      const isMin = /temperature_2m_min/.test(k);
      const isPop = /precipitation_probability/.test(k);
      out[k]=list[0].time.map(function(_,i){
        const vals=list.map(function(d){ return d[k]? d[k][i]:null; }).filter(function(x){ return x!=null; })
          .sort(function(a,b){ return a-b; });
        if(!vals.length) return null;
        if(isMin) return vals[0];
        if(isPop) return vals.length===4? Math.round((vals[1]+vals[2])/2*10)/10 : Math.round(vals.reduce(function(a,b){return a+b;},0)/vals.length*10)/10;
        return Math.round(vals.reduce(function(a,b){ return a+b; },0)/vals.length*10)/10;
      });
    }
  });
  return out;
}
async function getDaily(url,ms){
  const ctl=new AbortController(); const to=setTimeout(function(){ctl.abort();},ms);
  try{
    const r=await fetch(url,{cache:'no-store',signal:ctl.signal});
    if(!r.ok) return null;
    const j=await r.json();
    const arr=Array.isArray(j)? j.map(function(x){return x.daily;}).filter(Boolean) : (j && j.daily? [j.daily] : []);
    return arr.length? aggPoints(arr) : null;
  }catch(e){ return null; }
  finally{ clearTimeout(to); }
}
function mergeDaily(list){
  const out={time:list[0].time};
  list.forEach(function(d){ Object.keys(d).forEach(function(k){ if(k!=='time') out[k]=d[k]; }); });
  return {daily:out};
}
const LIVE_URL=API_BASE+'&models='+Object.keys(MDL).join(',');
async function fetchLive(){
  // 优先使用服务端缓存，但保留其真实更新时间；过期时再尝试浏览器直连。
  let staleServer=null;
  if(typeof window!=='undefined' && window.GZ_API_BASE){
    try{
      const r=await fetch(window.GZ_API_BASE,{cache:'no-store'});
      if(r.ok){
        const j=await r.json();
        if(j && j.days && j.days.length){
          const meta=forecastMeta(j);
          const serverView={days:j.days,windows:j.windows,src:'live',
            updatedAt:meta.updatedAt,stale:meta.stale,ageMinutes:meta.ageMinutes};
          if(!meta.stale) return serverView;
          staleServer=serverView;
        }
      }
    }catch(e){}
  }
  let d=null;
  for(let a=0;a<2 && !d;a++){
    d=await getDaily(LIVE_URL,14000);
    if(!d) await new Promise(function(r){ setTimeout(r,1500); });
  }
  if(!d && staleServer) return staleServer;
  if(!d) throw new Error('数据源没响应');
  const v=fromOpenMeteo({daily:d});
  if(!v) {
    if(staleServer) return staleServer;
    throw new Error('数据不足');
  }
  v.updatedAt=Date.now();
  v.stale=false;
  v.ageMinutes=0;
  return v;
}

function applyForecastResult(v){
  const now=Date.now();
  const hasUpdatedAt=Number.isFinite(v && v.updatedAt);
  const ts=hasUpdatedAt? v.updatedAt : null;
  setUpdated(ts==null? (v && v.stale? '未知' : now) : ts);
  render(v);
  if(v && v.stale){
    const age=Number.isFinite(v.ageMinutes)? Math.round(v.ageMinutes) : null;
    setStatus('warn','实时预报暂不可用，显示服务端旧缓存 · '+(age==null?'更新时间未知':age+' 分钟前更新'),'旧缓存');
    return;
  }
  const stamp=ts==null? now : ts;
  saveCache({days:v.days,windows:v.windows},stamp);
  const age=Math.max(0,Math.round((now-stamp)/60000));
  const label=age<=1? '刚刚重算 · '+hm(stamp) : '数据更新于 '+hm(stamp)+' · '+age+' 分钟前';
  setStatus('ok',label+' · 缓存有效期按原更新时间计算','数据：ECMWF / UKMO / CMA 等六家');
}

async function boot(){
  const btn=document.getElementById('btnRecalc');
  // 先给出内置的今日预报，网络慢也不至于空白；取到新数据再替换
  const built=fromOpenMeteo({daily:SNAP_RAW});
  setUpdated('内置 '+SNAP_TIME);
  render(built || snapshotView());
  setStatus('warn','正在取新预报，先看着 '+SNAP_TIME+' 这份…','内置');
  const cache=loadCache();
  if(cache && Date.now()-cache.ts < TTL){
    setUpdated(cache.ts);
    render(snapshotFromCache(cache.view,{updatedAt:cache.ts,stale:false,ageMinutes:Math.max(0,Math.round((Date.now()-cache.ts)/60000))}));
    setStatus('ok','缓存 '+hm(cache.ts)+' 的结果 · 有效至 '+hm(cache.ts+TTL),'数据：Open-Meteo 六模式');
    btn.disabled=false;
    refreshActual();

    return;
  }
  btn.disabled=true;
  setStatus('warn','正在取六家模式的最新预报，先看着上面这份…','首次加载');
  try{
    const v=await fetchLive();
    applyForecastResult(v);
  }catch(err){
    const stale=loadCache();
    if(stale && Date.now()-stale.ts < 2*24*3600*1000){
      setUpdated(stale.ts);
      render(snapshotFromCache(stale.view,{updatedAt:stale.ts,stale:true,ageMinutes:Math.max(0,Math.round((Date.now()-stale.ts)/60000))}));
      setStatus('err','这次没取到新数据（'+(err.message||'网络不通')+'），先看 '+hm(stale.ts)+' 那次的结果','旧数据');
    }else{
      setUpdated('内置 '+SNAP_TIME);
      render(built || snapshotView());
      setStatus('err','这次没取到新数据（'+(err.message||'网络不通')+'），下面是 '+SNAP_TIME+' 抓的预报','内置');
    }
  }finally{ btn.disabled=false; refreshActual(); }
}
function snapshotFromCache(view, meta={}){
  const days=view.days.map(d=>Object.assign({},d,{recs:d.recs||[],
    outReason: d.outReason!=null? d.outReason : (d.ok?'':(d.rainy?'雨':'阴')),
    loose: d.loose!=null? d.loose : (!d.rainy && d.popMed<40)}));
  return {days:days,windows:buildWindows(days),src:'live',
    updatedAt:Number.isFinite(meta.updatedAt)?meta.updatedAt:null,
    stale:meta.stale===true,ageMinutes:Number.isFinite(meta.ageMinutes)?meta.ageMinutes:null};
}
if (document.getElementById('sRange')) {
  document.getElementById('btnRecalc').addEventListener('click',async function(){
    this.disabled=true; setStatus('warn','正在重算…');
    try{
      const v=await fetchLive();
      applyForecastResult(v);
    }catch(err){
      setStatus('err','重算失败（'+(err.message||'网络不通')+'），继续显示屏幕上这一次的结果','离线');
    }finally{ this.disabled=false; refreshActual(); }
  });

  document.getElementById('btnEvidence').addEventListener('click',function(){
    const ev=document.getElementById('evidence');
    const opening=ev.hasAttribute('hidden');
    if(opening){ ev.removeAttribute('hidden'); this.textContent='收起数据依据'; this.setAttribute('aria-expanded','true'); }
    else { ev.setAttribute('hidden',''); this.textContent='查看数据依据'; this.setAttribute('aria-expanded','false'); }
    if(opening && VIEW){ try{ renderTrend(VIEW); wrapTables(); }catch(e){} }
    this.scrollIntoView({behavior:'smooth',block:'start'});
  });

  window.addEventListener('load',function(){ if(window.echarts && window.VIEW){ try{ renderTrend(VIEW); }catch(e){} } });
  boot();
}
