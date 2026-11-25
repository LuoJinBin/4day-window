function codeToModal(c){ if(c==null) return null; if(c===0||c===1) return '晴'; if(c===2) return '多云'; if(c===3||c===45||c===48) return '阴'; return '雨'; }
function isoOf(d){ return chinaIso(d,ACTIVE_LOCATION.timezone||'Asia/Shanghai'); }

/* ---------- 实时重算 ---------- */
const SNAP = {days: DATA.days.map(function(d){return Object.assign({},d,{wMap:W_SCORE});}), windows:null, src:'snapshot'};
function snapshotView(){
  const today=isoOf(new Date()).slice(5);
  const days = packDays(DATA.days.filter(d=>d.date>=today));
  return {days:days, windows:buildWindows(days), src:'snapshot'};
}
const SNAP_TIME='2026-11-19 12:30';
const SNAP_RAW={"time":["2026-11-19","2026-11-20","2026-11-21","2026-11-22","2026-11-23","2026-11-24","2026-11-25","2026-11-26","2026-11-27","2026-11-28","2026-11-29","2026-11-30","2026-12-01","2026-12-02","2026-12-03","2026-12-04"],"weather_code_ecmwf_ifs025":[51,51,3,3,51,51,51,51,3,2,3,3,51,51,3,null],"temperature_2m_max_ecmwf_ifs025":[22.0,17.4,20.9,22.8,22.5,21.8,18.0,23.7,21.7,24.6,22.2,23.1,21.2,23.7,25.2,null],"temperature_2m_min_ecmwf_ifs025":[15.6,11.7,9.9,11.2,17.0,16.8,13.1,14.9,16.1,12.2,9.7,9.6,13.6,15.5,16.9,null],"precipitation_sum_ecmwf_ifs025":[0.2,3.9,0.1,0.0,2.8,20.9,5.8,2.1,0.2,0.0,0.0,0.0,2.8,1.5,0.0,null],"precipitation_probability_max_ecmwf_ifs025":[8.0,75.0,1.0,2.0,69.0,88.0,47.0,41.0,18.0,7.0,4.0,4.0,16.0,20.0,15.0,null],"wind_speed_10m_max_ecmwf_ifs025":[15.2,15.2,8.4,10.6,10.6,15.8,12.3,4.7,5.5,17.0,9.4,5.8,7.9,7.3,9.7,null],"weather_code_ecmwf_aifs025_single":[51,51,3,51,51,51,51,0,0,0,2,51,51,51,2,null],"temperature_2m_max_ecmwf_aifs025_single":[21.2,16.8,21.1,19.9,19.7,21.1,18.7,22.3,24.8,25.9,25.1,23.4,26.1,27.5,28.6,null],"temperature_2m_min_ecmwf_aifs025_single":[16.4,12.3,10.8,13.4,16.2,16.2,14.3,13.1,14.6,15.0,14.4,18.1,19.3,20.4,20.6,null],"precipitation_sum_ecmwf_aifs025_single":[0.8,7.2,0.9,0.0,3.0,12.6,0.2,0.2,0.0,0.0,0.0,0.5,0.8,0.3,0.0,0.8],"precipitation_probability_max_ecmwf_aifs025_single":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"wind_speed_10m_max_ecmwf_aifs025_single":[16.9,18.6,11.7,9.0,15.9,21.8,13.5,7.3,6.9,11.5,10.1,9.0,9.5,5.4,10.5,null],"weather_code_ukmo_seamless":[3,3,3,3,51,51,51,null,null,null,null,null,null,null,null,null],"temperature_2m_max_ukmo_seamless":[22.2,18.7,22.2,22.7,25.3,22.8,16.0,null,null,null,null,null,null,null,null,null],"temperature_2m_min_ukmo_seamless":[16.0,14.4,11.9,14.7,18.6,14.3,12.6,null,null,null,null,null,null,null,null,null],"precipitation_sum_ukmo_seamless":[0.0,0.0,0.0,0.0,0.4,13.8,2.4,null,null,null,null,null,null,null,null,null],"precipitation_probability_max_ukmo_seamless":[0.0,22.0,0.0,11.0,72.0,78.0,23.0,6.0,17.0,10.0,null,null,null,null,null,null],"wind_speed_10m_max_ukmo_seamless":[15.3,16.5,10.9,10.8,10.2,18.0,12.8,null,null,null,null,null,null,null,null,null],"weather_code_cma_grapes_global":[2,51,2,2,51,null,null,null,null,null,null,null,null,null,null,null],"temperature_2m_max_cma_grapes_global":[20.6,16.7,19.6,20.1,21.1,null,null,null,null,null,null,null,null,null,null,null],"temperature_2m_min_cma_grapes_global":[15.8,13.4,9.9,12.5,17.2,null,null,null,null,null,null,null,null,null,null,null],"precipitation_sum_cma_grapes_global":[0.0,3.6,0.2,0.0,0.3,null,null,null,null,null,null,null,null,null,null,null],"precipitation_probability_max_cma_grapes_global":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"wind_speed_10m_max_cma_grapes_global":[21.9,21.3,12.3,10.3,14.2,null,null,null,null,null,null,null,null,null,null,null],"weather_code_icon_seamless":[3,51,3,3,3,3,51,null,null,null,null,null,null,null,null,null],"temperature_2m_max_icon_seamless":[21.2,16.6,20.1,17.7,16.8,18.2,14.7,null,null,null,null,null,null,null,null,null],"temperature_2m_min_icon_seamless":[16.0,12.0,11.3,14.1,15.9,14.4,10.4,null,null,null,null,null,null,null,null,null],"precipitation_sum_icon_seamless":[0.0,7.1,0.0,0.0,0.4,0.7,21.7,null,null,null,null,null,null,null,null,null],"precipitation_probability_max_icon_seamless":[6.5,81.5,3.0,4.0,49.0,59.0,61.0,null,null,null,null,null,null,null,null,null],"wind_speed_10m_max_icon_seamless":[12.8,10.2,9.1,4.5,5.8,15.9,10.3,null,null,null,null,null,null,null,null,null],"weather_code_meteofrance_seamless":[3,51,3,3,null,null,null,null,null,null,null,null,null,null,null,null],"temperature_2m_max_meteofrance_seamless":[20.6,19.1,20.9,21.5,null,null,null,null,null,null,null,null,null,null,null,null],"temperature_2m_min_meteofrance_seamless":[16.4,11.7,10.4,11.8,null,null,null,null,null,null,null,null,null,null,null,null],"precipitation_sum_meteofrance_seamless":[0.0,7.0,0.0,0.0,null,null,null,null,null,null,null,null,null,null,null,null],"precipitation_probability_max_meteofrance_seamless":[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],"wind_speed_10m_max_meteofrance_seamless":[22.4,25.1,14.3,12.5,null,null,null,null,null,null,null,null,null,null,null,null]};
const CACHE_KEY='gz_wx_v10', LOCATION_KEY='gz_location_v1', PLAN_KEY='gz_plan_v1', TTL=6*3600*1000;
const DEFAULT_LOCATION={name:'广州',admin1:'广东省',country:'中国',timezone:'Asia/Shanghai',isDefault:true};
let ACTIVE_LOCATION=Object.assign({},DEFAULT_LOCATION);
let ACTIVE_PLAN={mode:'auto',duration:4,period:'all',from:'09:00',to:'18:00',startDate:null,endDate:null};
let VIEW=null, LOAD_TOKEN=0, CITY_RESULTS=[];

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
  renderPlannerSummary(view); renderCal(view); renderTrend(view); wrapTables();
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

function fromOpenMeteo(json){
  const d=json.daily, t=d.time, timeZone=json.timezone || 'Asia/Shanghai'; if(!t) return null;
  const models=Object.keys(MDL);
  const recsByDay=t.map(()=>([]));
  models.forEach(m=>{
    const code=d['weather_code_'+m], hi=d['temperature_2m_max_'+m], lo=d['temperature_2m_min_'+m],
          mm=d['precipitation_sum_'+m], pp=d['precipitation_probability_max_'+m],
          wd=d['wind_speed_10m_max_'+m];
    if(!code) return;
    t.forEach((_,i)=>{
      if(code[i]==null || !hi || hi[i]==null) return;   // 这家当天没数据：记为缺失，不当作晴或无雨
      const [lb]=CODE(code[i]);
      recsByDay[i].push({p:m,name:MDL[m],cond:lb,hi:hi[i],lo:lo?lo[i]:null,
        pop: pp? (pp[i]==null?null:Math.round(pp[i])) : null,
        mm: mm? mm[i] : null,
        wind: wd? wd[i] : null, out:false});
    });
  });
  const days=t.map((iso,i)=>{
    const dt=new Date(iso+'T12:00:00Z');
    const recs=recsByDay[i].filter(r=>r.hi!=null);
    return {date:iso.slice(5), iso:iso, wd:WD[dt.getUTCDay()], recs:recs};
  });
  if(days.length<6) return null;
  const built=packDays(days,timeZone);
  return {days:built, windows:buildWindows(built), src:'live', timezone:timeZone};
}

function cacheKey(location=ACTIVE_LOCATION){
  if(location && location.isDefault) return CACHE_KEY+'_guangzhou';
  return CACHE_KEY+'_'+[location.lat,location.lon,location.timezone].join('_').replace(/[^a-zA-Z0-9_-]/g,'_');
}
function loadCache(location=ACTIVE_LOCATION){
  try{
    const raw=localStorage.getItem(cacheKey(location));if(!raw)return null;
    const o=JSON.parse(raw);
    if(!o||!Number.isFinite(o.ts)||o.ts<=0||o.ts>Date.now()+5*60*1000
      ||!o.view||!Array.isArray(o.view.days)||!o.view.days.length)return null;
    return o;
  }catch(e){return null;}
}
function saveCache(view,ts,location=ACTIVE_LOCATION){
  const stamp=Number.isFinite(ts)?ts:Date.now();
  try{localStorage.setItem(cacheKey(location),JSON.stringify({ts:stamp,view}));}catch(e){}
}
function hm(ts,timeZone){
  const p=chinaParts(ts,timeZone||ACTIVE_LOCATION.timezone||'Asia/Shanghai');
  return p.hour+':'+p.minute;
}
const API_BASE='https://api.open-meteo.com/v1/forecast';
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
async function getWeather(url,ms=18000){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),ms);
  try{
    const response=await fetch(url,{cache:'no-store',signal:ctl.signal,headers:{accept:'application/json'}});
    if(!response.ok)throw new Error('天气服务暂时不可用（HTTP '+response.status+'）');
    const payload=await response.json(),arr=Array.isArray(payload)?payload:[payload];
    const dailyList=arr.map(x=>x&&x.daily).filter(Boolean);
    if(!dailyList.length)throw new Error('天气服务没有返回逐日数据');
    const daily=aggPoints(dailyList);
    const hourlyList=arr.map(x=>x&&x.hourly).filter(Boolean);
    const hourly=hourlyList.length===arr.length?aggPoints(hourlyList):null;
    return {daily,hourly,timezone:(arr[0]&&arr[0].timezone)||'Asia/Shanghai'};
  }finally{clearTimeout(timer);}
}
function mergeDaily(list){
  const out={time:list[0].time};
  list.forEach(function(d){ Object.keys(d).forEach(function(k){ if(k!=='time') out[k]=d[k]; }); });
  return {daily:out};
}
const LIVE_URL=API_BASE;
function makeForecastUrl(location){
  const points=location&&location.isDefault
    ?[{lat:23.125,lon:113.24},{lat:23.129,lon:113.267},{lat:23.135,lon:113.33},{lat:23.09,lon:113.31}]
    :[{lat:Number(location.lat),lon:Number(location.lon)}];
  const params=new URLSearchParams();
  params.set('latitude',points.map(p=>p.lat).join(','));
  params.set('longitude',points.map(p=>p.lon).join(','));
  params.set('daily','weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max');
  params.set('hourly','weather_code,precipitation_probability,precipitation,temperature_2m,wind_speed_10m');
  params.set('timezone',location.timezone||'auto');
  params.set('forecast_days','16');params.set('forecast_hours','168');params.set('past_hours','12');
  params.set('models',Object.keys(MDL).join(','));
  return API_BASE+'?'+params.toString();
}
function serverForecastUrl(location){
  const url=new URL(window.GZ_API_BASE,window.location.href);
  if(location&&!location.isDefault){
    url.searchParams.set('lat',String(location.lat));url.searchParams.set('lon',String(location.lon));
    url.searchParams.set('timezone',location.timezone||'auto');url.searchParams.set('name',location.name||'所选城市');
    if(location.admin1)url.searchParams.set('admin1',location.admin1);
    if(location.country)url.searchParams.set('country',location.country);
  }
  return url.toString();
}
async function fetchLive(location=ACTIVE_LOCATION){
  let staleServer=null,serverError=null;
  if(typeof window!=='undefined'&&window.GZ_API_BASE){
    try{
      const response=await fetch(serverForecastUrl(location),{cache:'no-store'});
      if(response.ok){
        const payload=await response.json();
        if(payload&&Array.isArray(payload.days)&&payload.days.length){
          const meta=forecastMeta(payload);
          const view={days:payload.days,windows:payload.windows||[],hourly:payload.hourly||null,
            timezone:payload.timezone||location.timezone||'Asia/Shanghai',src:'live',
            updatedAt:meta.updatedAt,stale:meta.stale,ageMinutes:meta.ageMinutes};
          if(!meta.stale)return view;
          staleServer=view;
        }else serverError='天气服务返回的数据不完整';
      }else{
        const payload=await response.json().catch(()=>({}));
        serverError=payload.error||('天气接口错误 '+response.status);
      }
    }catch(err){serverError=err.message||'天气接口连接失败';}
  }
  try{
    const weather=await getWeather(makeForecastUrl(location));
    const view=fromOpenMeteo({daily:weather.daily,timezone:weather.timezone});
    if(!view)throw new Error('天气数据不足，暂时无法生成预报');
    view.hourly=weather.hourly;view.location=location;view.updatedAt=Date.now();view.stale=false;view.ageMinutes=0;
    return view;
  }catch(err){
    if(staleServer)return staleServer;
    if(serverError)throw new Error(serverError+'；备用天气源也未成功：'+(err.message||'网络错误'));
    throw err;
  }
}

function applyForecastResult(view){
  const now=Date.now(),tz=view.timezone||ACTIVE_LOCATION.timezone||'Asia/Shanghai';
  const stamp=Number.isFinite(view.updatedAt)?view.updatedAt:now;
  setUpdated(stamp,tz);render(view);
  if(view.stale){
    setStatus('warn','实时预报暂不可用，显示 '+hm(stamp,tz)+' 更新的旧数据。','旧缓存');return;
  }
  saveCache(view,stamp,ACTIVE_LOCATION);
  const age=Math.max(0,Math.round((now-stamp)/60000));
  setStatus('ok',(age<=1?'刚刚更新 · '+hm(stamp,tz):'更新于 '+hm(stamp,tz)+' · '+age+' 分钟前')+' · '+cityLabel(ACTIVE_LOCATION),'Open-Meteo 六模式');
}

function datePlus(iso,days){
  const p=String(iso).split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]+days));
  return d.toISOString().slice(0,10);
}
function cityToday(){return chinaIso(new Date(),ACTIVE_LOCATION.timezone||'Asia/Shanghai');}
function cityLabel(location){return [location.name,location.admin1,location.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ');}
function setPlannerHint(message,kind=''){
  const el=document.getElementById('plannerHint');if(!el)return;
  el.textContent=message;el.className='planner-hint'+(kind?' '+kind:'');
}
function saveLocation(){try{localStorage.setItem(LOCATION_KEY,JSON.stringify(ACTIVE_LOCATION));}catch(e){}}
function loadLocation(){
  try{
    const item=JSON.parse(localStorage.getItem(LOCATION_KEY)||'null');
    if(item&&item.isDefault)return Object.assign({},DEFAULT_LOCATION);
    if(item&&Number.isFinite(Number(item.lat))&&Number.isFinite(Number(item.lon))&&item.timezone)
      return {name:String(item.name||'所选城市').slice(0,80),admin1:String(item.admin1||'').slice(0,80),
        country:String(item.country||'').slice(0,80),lat:Number(item.lat),lon:Number(item.lon),timezone:String(item.timezone),isDefault:false};
  }catch(e){}
  return Object.assign({},DEFAULT_LOCATION);
}
function updateCityDisplay(){
  const label=cityLabel(ACTIVE_LOCATION),current=document.getElementById('cityCurrent'),
    query=document.getElementById('cityQuery'),meta=document.getElementById('mastMeta');
  if(current)current.textContent='当前：'+label;
  if(query)query.value=ACTIVE_LOCATION.name||'';
  if(meta)meta.textContent=label+' · 预报和日期按当地时间显示';
  document.title=label+' · 灵活出行天气';
}
function renderCityResults(results){
  const box=document.getElementById('cityResults');if(!box)return;
  box.textContent='';
  if(!results.length){
    const empty=document.createElement('div');empty.className='city-result';empty.textContent='没有找到这个城市，试试加上省份或国家名。';
    box.appendChild(empty);box.hidden=false;return;
  }
  results.forEach(item=>{
    const button=document.createElement('button');button.type='button';button.className='city-result';button.setAttribute('role','option');
    const title=document.createElement('b');title.textContent=item.name;
    const detail=document.createElement('small');detail.textContent=[item.admin1,item.country].filter(Boolean).join(' · ');
    button.append(title,detail);button.addEventListener('click',()=>selectCity(item));box.appendChild(button);
  });
  box.hidden=false;
}
async function searchCity(query,autoSelectFirst=false){
  const q=String(query||'').trim();
  if(q.length<2){setPlannerHint('至少输入两个字再搜索。','error');return;}
  const button=document.getElementById('btnCitySearch');if(button)button.disabled=true;
  setPlannerHint('正在搜索城市…');
  try{
    const response=await fetch('/api/geocode?q='+encodeURIComponent(q),{cache:'no-store'});
    const payload=await response.json();if(!response.ok)throw new Error(payload.error||'城市搜索失败');
    CITY_RESULTS=Array.isArray(payload.results)?payload.results:[];
    if(autoSelectFirst&&CITY_RESULTS.length)selectCity(CITY_RESULTS[0]);
    else renderCityResults(CITY_RESULTS);
    if(!CITY_RESULTS.length)setPlannerHint('没找到这个城市，试试输入“城市名 + 省份/国家”。','error');
    else setPlannerHint('找到 '+CITY_RESULTS.length+' 个结果，请确认地区后再选择。','success');
  }catch(err){setPlannerHint(err.message||'城市搜索暂时不可用。','error');}
  finally{if(button)button.disabled=false;}
}
function saveRecentCity(location){
  if(location.isDefault)return;
  try{
    const old=JSON.parse(localStorage.getItem('gz_recent_cities_v1')||'[]');
    const next=[location,...old.filter(x=>x.lat!==location.lat||x.lon!==location.lon)].slice(0,5);
    localStorage.setItem('gz_recent_cities_v1',JSON.stringify(next));
  }catch(e){}
}
function selectCity(item){
  ACTIVE_LOCATION={name:String(item.name||'所选城市'),admin1:String(item.admin1||''),country:String(item.country||''),
    lat:Number(item.latitude),lon:Number(item.longitude),timezone:String(item.timezone||'auto'),isDefault:false};
  saveLocation();saveRecentCity(ACTIVE_LOCATION);
  const box=document.getElementById('cityResults');if(box)box.hidden=true;
  updateCityDisplay();initializePlannerControls(null,true);loadSelectedCity();
}
function updateModeUi(){
  document.querySelectorAll('[data-plan-mode]').forEach(button=>{
    const on=button.dataset.planMode===ACTIVE_PLAN.mode;
    button.classList.toggle('on',on);button.setAttribute('aria-pressed',on?'true':'false');
  });
  const fixed=ACTIVE_PLAN.mode==='fixed';
  document.getElementById('planStartLabel').textContent=fixed?'出发日期':'最早出发日';
  document.getElementById('planEndLabel').textContent=fixed?'返程日期':'最晚出发日';
  document.getElementById('durationField').hidden=fixed;
}
function updateDateBounds(view=VIEW){
  const start=document.getElementById('planStart'),end=document.getElementById('planEnd');if(!start||!end)return;
  const first=view&&view.days[0]&&view.days[0].iso||cityToday();
  const last=view&&view.days.length&&view.days[view.days.length-1].iso||datePlus(first,15);
  const maxEnd=ACTIVE_PLAN.mode==='auto'?datePlus(last,-((Number(ACTIVE_PLAN.duration)||4)-1)):last;
  start.min=first;start.max=last;end.min=start.value||first;end.max=maxEnd<first?first:maxEnd;
  if(start.value<first||start.value>last)start.value=first;
  if(end.value<start.value||end.value>end.max)end.value=end.max;
}
function initializePlannerControls(view=VIEW,resetDates=false){
  const saved=(()=>{try{return JSON.parse(localStorage.getItem(PLAN_KEY)||'null');}catch(e){return null;}})();
  const keep=resetDates?ACTIVE_PLAN:(saved&&['auto','fixed'].includes(saved.mode)?saved:ACTIVE_PLAN);
  ACTIVE_PLAN={mode:keep.mode==='fixed'?'fixed':'auto',duration:Math.min(7,Math.max(1,Number(keep.duration)||4)),
    period:['all','morning','afternoon','evening','custom'].includes(keep.period)?keep.period:'all',
    from:keep.from||'09:00',to:keep.to||'18:00',startDate:keep.startDate||null,endDate:keep.endDate||null};
  const first=view&&view.days[0]&&view.days[0].iso||cityToday();
  const last=view&&view.days.length&&view.days[view.days.length-1].iso||datePlus(first,15);
  if(resetDates||!ACTIVE_PLAN.startDate||ACTIVE_PLAN.startDate<first||ACTIVE_PLAN.startDate>last){
    ACTIVE_PLAN.startDate=first;ACTIVE_PLAN.endDate=ACTIVE_PLAN.mode==='auto'?datePlus(last,1-ACTIVE_PLAN.duration):datePlus(first,3);
  }
  if(!ACTIVE_PLAN.endDate||ACTIVE_PLAN.endDate<ACTIVE_PLAN.startDate||ACTIVE_PLAN.endDate>last){
    ACTIVE_PLAN.endDate=ACTIVE_PLAN.mode==='auto'?datePlus(last,1-ACTIVE_PLAN.duration):datePlus(ACTIVE_PLAN.startDate,3);
  }
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.value=value;};
  set('planStart',ACTIVE_PLAN.startDate);set('planEnd',ACTIVE_PLAN.endDate);set('planDuration',String(ACTIVE_PLAN.duration));
  set('planPeriod',ACTIVE_PLAN.period);set('planFrom',ACTIVE_PLAN.from);set('planTo',ACTIVE_PLAN.to);
  const custom=document.getElementById('customTimeFields');if(custom)custom.hidden=ACTIVE_PLAN.period!=='custom';
  updateModeUi();updateDateBounds(view);
  try{localStorage.setItem(PLAN_KEY,JSON.stringify(ACTIVE_PLAN));}catch(e){}
}
function applyPlanFromControls(){
  const start=document.getElementById('planStart').value,end=document.getElementById('planEnd').value;
  const mode=ACTIVE_PLAN.mode,duration=Number(document.getElementById('planDuration').value)||4;
  const period=document.getElementById('planPeriod').value,from=document.getElementById('planFrom').value,to=document.getElementById('planTo').value;
  if(!start||!end||start>end)throw new Error('日期范围不正确，请重新选择。');
  const first=VIEW&&VIEW.days[0]&&VIEW.days[0].iso,last=VIEW&&VIEW.days.length&&VIEW.days[VIEW.days.length-1].iso;
  if((first&&start<first)||(last&&end>last))throw new Error('所选日期超出当前预报范围，请在可选日期内选择。');
  if(mode==='auto'&&datePlus(end,duration-1)>(last||end))throw new Error('最晚出发日太靠后，无法覆盖完整出行天数。');
  if(period==='custom'){
    const parse=s=>{const p=String(s||'').split(':').map(Number);return p.length===2&&p.every(Number.isFinite)?p[0]*60+p[1]:NaN;};
    if(!Number.isFinite(parse(from))||!Number.isFinite(parse(to))||parse(from)>=parse(to))throw new Error('自选时段的结束时间要晚于开始时间。');
  }
  if(mode==='fixed'){
    const count=Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;
    if(count<1||count>16)throw new Error('指定日期最多可选 16 天。');
  }
  ACTIVE_PLAN={mode,duration,period,from,to,startDate:start,endDate:end};
  try{localStorage.setItem(PLAN_KEY,JSON.stringify(ACTIVE_PLAN));}catch(e){}
  render(VIEW);setPlannerHint('已按新的城市、日期和时段重新计算。','success');
}
function getPeriodRange(){
  if(ACTIVE_PLAN.period==='morning')return {from:360,to:720,label:'早上 06:00–12:00'};
  if(ACTIVE_PLAN.period==='afternoon')return {from:720,to:1080,label:'下午 12:00–18:00'};
  if(ACTIVE_PLAN.period==='evening')return {from:1080,to:1440,label:'晚上 18:00–24:00'};
  if(ACTIVE_PLAN.period==='custom'){
    const parse=s=>{const p=String(s||'').split(':').map(Number);return p.length===2&&p.every(Number.isFinite)?p[0]*60+p[1]:NaN;};
    return {from:parse(ACTIVE_PLAN.from),to:parse(ACTIVE_PLAN.to),label:ACTIVE_PLAN.from+'–'+ACTIVE_PLAN.to};
  }
  return {from:0,to:1440,label:'全天'};
}
function plannerWindows(days,duration){
  const out=[];
  for(let i=0;i+duration<=days.length;i++){
    const group=days.slice(i,i+duration),avg=group.reduce((s,d)=>s+(Number(d.score)||0),0)/duration;
    const min=Math.min(...group.map(d=>Number(d.score)||0));
    const bad=group.filter(d=>!d.ok).length,looseBad=group.filter(d=>!d.loose).length,trendBad=group.filter(d=>!d.trend).length;
    const wk=group.filter(d=>d.wd==='周六'||d.wd==='周日').length;
    const w={start:group[0].date,end:group[group.length-1].date,startIso:group[0].iso,endIso:group[group.length-1].iso,
      span:group[0].date+'—'+group[group.length-1].date,avg,min,bad,valid:bad===0,days:group.slice(),
      looseBad,looseValid:looseBad===0,trendBad,trendValid:trendBad===0,
      conf:Math.min(...group.map(d=>d.conf)),far:group.some(d=>d.lead>7),wk,
      reasons:group.map(d=>d.ok?'':d.outReason)};
    w.score=0.55*w.avg+0.45*w.min-1.5*w.bad;out.push(w);
  }
  return out;
}
function summarizeHourly(view,days,period){
  const hourly=view&&view.hourly;if(!hourly||!Array.isArray(hourly.time))return {available:false,reason:'没有逐小时数据'};
  const start=days[0]&&days[0].iso,end=days[days.length-1]&&days[days.length-1].iso;
  if(!start||!end)return {available:false,reason:'日期信息不完整'};
  const modelKeys=Object.keys(MDL),rows=[],now=chinaParts(new Date(),view.timezone||ACTIVE_LOCATION.timezone||'Asia/Shanghai');
  const nowStamp=now.year+'-'+now.month+'-'+now.day+'T'+now.hour+':'+now.minute;
  for(let i=0;i<hourly.time.length;i++){
    const stamp=hourly.time[i];if(typeof stamp!=='string')continue;
    const iso=stamp.slice(0,10),hour=Number(stamp.slice(11,13)),minute=Number(stamp.slice(14,16)||'0'),at=hour*60+minute;
    if(iso<start||iso>end||at<period.from||at>=period.to||stamp<nowStamp)continue;
    const read=key=>modelKeys.map(m=>hourly[key+'_'+m]&&hourly[key+'_'+m][i]).filter(v=>v!=null&&Number.isFinite(Number(v))).map(Number);
    const pops=read('precipitation_probability'),precips=read('precipitation'),temps=read('temperature_2m'),codes=read('weather_code');
    const pop=pops.length?median(pops):null,precip=precips.length?precips.reduce((a,b)=>a+b,0)/precips.length:null;
    const temp=temps.length?temps.reduce((a,b)=>a+b,0)/temps.length:null;
    const rainVotes=codes.filter(c=>CODE(c)[1]==='雨').length;
    const rain=(precip!=null&&precip>=0.1)||(pop!=null&&pop>=50)||(codes.length>0&&rainVotes/codes.length>=0.5);
    rows.push({pop,precip,temp,rain});
  }
  if(!rows.length)return {available:false,reason:'所选日期/时段暂无逐小时预报'};
  const pops=rows.map(r=>r.pop).filter(v=>v!=null),temps=rows.map(r=>r.temp).filter(v=>v!=null);
  return {available:true,hours:rows.length,maxPop:pops.length?Math.max(...pops):null,
    rainHours:rows.filter(r=>r.rain).length,totalPrecip:rows.reduce((s,r)=>s+(r.precip||0),0),
    minTemp:temps.length?Math.min(...temps):null,maxTemp:temps.length?Math.max(...temps):null};
}
function choosePlannerWindow(windows,view,period){
  const tiers=[['strict',windows.filter(w=>w.valid)],['loose',windows.filter(w=>w.looseValid)],['trend',windows.filter(w=>w.trendValid)]];
  for(const [tier,candidates] of tiers){
    if(!candidates.length)continue;
    const ranked=candidates.map(w=>{
      const summary=summarizeHourly(view,w.days,period);
      const hourlyPenalty=summary.available?(summary.rainHours*5+(summary.maxPop||0)*0.12+summary.totalPrecip*1.5):0;
      return {w,summary,penalty:winPen(w)+hourlyPenalty};
    });
    ranked.sort((a,b)=>a.penalty-b.penalty||a.w.wk-b.w.wk||b.w.conf-a.w.conf||a.w.startIso.localeCompare(b.w.startIso));
    return {tier,window:ranked[0].w,candidates:ranked.map(x=>x.w),periodSummary:ranked[0].summary};
  }
  const best=rankTripWindows(windows);
  return best?{tier:'none',window:best,candidates:[],periodSummary:summarizeHourly(view,best.days,period)}:null;
}
function formatRange(days){
  if(!days||!days.length)return '暂无可用日期';
  return days[0].date+' '+days[0].wd+' — '+days[days.length-1].date+' '+days[days.length-1].wd;
}
function renderPlannerSummary(view){
  const r=document.getElementById('sRange');if(!r)return;
  if(!view||!Array.isArray(view.days)||!view.days.length){
    r.textContent='正在读取天气…';document.getElementById('sSub').textContent='正在读取所选城市的预报';
    document.getElementById('sVerdict').textContent='';document.getElementById('sWhy').textContent='城市、日期和时段设置会保留。';
    document.getElementById('sDays').textContent='';document.getElementById('sAlt').textContent='';return;
  }
  const period=getPeriodRange(),tz=view.timezone||ACTIVE_LOCATION.timezone||'Asia/Shanghai';
  let days=[],window=null,tier='none',periodSummary=null,alternatives=[];
  if(ACTIVE_PLAN.mode==='fixed'){
    days=view.days.filter(d=>d.iso>=ACTIVE_PLAN.startDate&&d.iso<=ACTIVE_PLAN.endDate);
    const expected=Math.round((Date.parse(ACTIVE_PLAN.endDate+'T00:00:00Z')-Date.parse(ACTIVE_PLAN.startDate+'T00:00:00Z'))/86400000)+1;
    if(days.length===expected&&days.length){
      window=plannerWindows(days,days.length)[0];tier=days.every(d=>d.ok)?'strict':days.every(d=>d.loose)?'loose':days.every(d=>d.trend)?'trend':'none';
      periodSummary=summarizeHourly(view,days,period);
    }
  }else{
    const duration=Number(ACTIVE_PLAN.duration)||4;
    const candidates=plannerWindows(view.days,duration).filter(w=>w.startIso>=ACTIVE_PLAN.startDate&&w.startIso<=ACTIVE_PLAN.endDate);
    const chosen=choosePlannerWindow(candidates,view,period);
    if(chosen){window=chosen.window;tier=chosen.tier;periodSummary=chosen.periodSummary;alternatives=chosen.candidates.slice(1);}
  }
  const city=cityLabel(ACTIVE_LOCATION),periodText=period.label;
  const modeText=ACTIVE_PLAN.mode==='auto'?'在你选的出发日期范围内筛选':'按你指定的日期查看';
  if(!window){
    r.textContent=ACTIVE_PLAN.mode==='fixed'?'所选日期暂不在预报范围内':'这个日期范围内没有完整的出行天数';
    document.getElementById('sKicker').textContent=city+' · 出行天气';document.getElementById('sSub').textContent='预报以目的地当地时间为准';
    document.getElementById('sVerdict').textContent='';
    document.getElementById('sWhy').textContent='可以把日期往前调整，或缩短出行天数。当前逐日预报最多提供未来 16 天。';
    document.getElementById('sDays').textContent='';document.getElementById('sAlt').textContent='';return;
  }
  days=window.days;
  const verdict=windowVerdict(window,tier),duration=days.length;
  r.innerHTML=days[0].date+' <small>'+duration+' 天 · '+days[duration-1].date+' 结束</small>';
  document.getElementById('sKicker').textContent=city+' · '+(ACTIVE_PLAN.mode==='auto'?'天气优选':'指定日期');
  document.getElementById('sSub').textContent=formatRange(days)+' · '+modeText+' · '+periodText+' · 当地时间 '+tz;
  document.getElementById('sVerdict').innerHTML='<span class="vpill v-'+verdict.k+'"><i></i>'+verdict.t+'</span>';
  let why=verdict.why;
  if(periodSummary&&periodSummary.available){
    why+=' 时段预报覆盖 '+periodSummary.hours+' 小时；最高降雨概率 '+(periodSummary.maxPop==null?'暂无':Math.round(periodSummary.maxPop)+'%')
      +'；约 '+periodSummary.rainHours+' 小时有降雨信号；预估累计雨量 '+periodSummary.totalPrecip.toFixed(1)+'mm'
      +(periodSummary.minTemp!=null?'；气温 '+Math.round(periodSummary.minTemp)+'–'+Math.round(periodSummary.maxTemp)+'℃':'')+'。';
  }else{
    why+=' '+periodText+'：'+(periodSummary&&periodSummary.reason?periodSummary.reason:'逐小时数据暂不可用')
      +'；逐小时预报通常只覆盖未来约 7 天，超出部分按逐日预报参考。';
  }
  document.getElementById('sWhy').textContent=why;
  document.getElementById('sDays').innerHTML=days.map(d=>{
    const risk=riskOf(d),conf=confTier(d),ico=svgIcon(d.rainy?'rain':d.modal==='晴'?'sun':d.modal==='阴'?'over':'cloud');
    return '<div class="s-row"><div class="s-d"><b>'+d.date+'</b><span>'+d.wd+'</span></div>'
      +'<div class="s-ic">'+ico+'</div><div class="s-desc">'+wxWord(d)+'</div>'
      +'<div class="s-temp"><b>'+(d.hi==null?'—':Math.round(d.hi)+'°')+'</b><span>/ '+(d.lo==null?'—':Math.round(d.lo)+'°')+'</span></div>'
      +'<div class="s-risk r'+risk+'">'+riskText(risk)+'</div>'
      +'<div class="s-conf"><span class="cf c'+conf+'">可信 '+(conf===3?'高':conf===2?'中':'低')+'</span><small>'+confWhy(d)+'</small></div></div>';
  }).join('');
  if(ACTIVE_PLAN.mode==='auto'&&alternatives.length){
    const alt=alternatives.find(w=>w.days.every(d=>d.iso<days[0].iso||d.iso>days[days.length-1].iso));
    document.getElementById('sAlt').textContent=alt?'另一个可选日期：'+formatRange(alt.days)+'（同一筛选口径）':'';
  }else document.getElementById('sAlt').textContent='';
}
async function loadSelectedCity(force=false){
  const token=++LOAD_TOKEN,btn=document.getElementById('btnRecalc'),cache=loadCache(ACTIVE_LOCATION);
  if(cache&&!force&&Date.now()-cache.ts<TTL){
    VIEW=Object.assign({},cache.view,{updatedAt:cache.ts,stale:false,ageMinutes:Math.max(0,Math.round((Date.now()-cache.ts)/60000))});
    initializePlannerControls(VIEW,false);render(VIEW);setUpdated(cache.ts,VIEW.timezone||ACTIVE_LOCATION.timezone);
    setStatus('ok','缓存 '+hm(cache.ts)+' 的结果 · 数据仍在有效期内','Open-Meteo 六模式');
    if(btn)btn.disabled=false;return;
  }
  if(cache&&Date.now()-cache.ts<2*24*3600*1000){
    VIEW=Object.assign({},cache.view,{updatedAt:cache.ts,stale:true,ageMinutes:Math.round((Date.now()-cache.ts)/60000)});
    initializePlannerControls(VIEW,false);render(VIEW);
  }else{VIEW=null;renderLoading();}
  setStatus('warn','正在读取 '+cityLabel(ACTIVE_LOCATION)+' 的最新天气…','加载中');
  if(btn)btn.disabled=true;
  try{
    const view=await fetchLive(ACTIVE_LOCATION);
    if(token!==LOAD_TOKEN)return;
    view.location=ACTIVE_LOCATION;initializePlannerControls(view,false);VIEW=view;applyForecastResult(view);
  }catch(err){
    if(token!==LOAD_TOKEN)return;
    if(cache&&Date.now()-cache.ts<2*24*3600*1000){
      VIEW=Object.assign({},cache.view,{updatedAt:cache.ts,stale:true,ageMinutes:Math.round((Date.now()-cache.ts)/60000)});
      render(VIEW);setUpdated(cache.ts,VIEW.timezone||ACTIVE_LOCATION.timezone);
      setStatus('err','这次没取到新天气（'+(err.message||'网络不通')+'），显示该城市上次成功读取的数据。','旧数据');
    }else{VIEW=null;renderLoading();setStatus('err','读取失败：'+(err.message||'天气服务暂时不可用'),'暂不可用');}
  }finally{if(token===LOAD_TOKEN&&btn)btn.disabled=false;}
}
function renderLoading(){
  const r=document.getElementById('sRange');if(r)r.textContent='正在读取天气…';
  const sub=document.getElementById('sSub');if(sub)sub.textContent='正在读取所选城市的最新预报';
  const why=document.getElementById('sWhy');if(why)why.textContent='城市、日期和时段设置会保留。';
  const days=document.getElementById('sDays');if(days)days.textContent='';
}
function bindPlannerControls(){
  document.getElementById('btnCitySearch').addEventListener('click',()=>searchCity(document.getElementById('cityQuery').value));
  document.getElementById('cityQuery').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchCity(event.currentTarget.value);}});
  document.querySelectorAll('[data-city-query]').forEach(button=>button.addEventListener('click',()=>searchCity(button.dataset.cityQuery,true)));
  document.querySelectorAll('[data-plan-mode]').forEach(button=>button.addEventListener('click',()=>{
    ACTIVE_PLAN.mode=button.dataset.planMode;updateModeUi();updateDateBounds(VIEW);
  }));
  document.getElementById('planDuration').addEventListener('change',()=>updateDateBounds(VIEW));
  document.getElementById('planPeriod').addEventListener('change',()=>{
    document.getElementById('customTimeFields').hidden=document.getElementById('planPeriod').value!=='custom';
  });
  document.getElementById('btnApplyPlan').addEventListener('click',()=>{
    try{applyPlanFromControls();}catch(err){setPlannerHint(err.message||'日期设置不正确。','error');}
  });
  document.getElementById('btnResetPlan').addEventListener('click',()=>{
    ACTIVE_LOCATION=Object.assign({},DEFAULT_LOCATION);saveLocation();updateCityDisplay();
    ACTIVE_PLAN={mode:'auto',duration:4,period:'all',from:'09:00',to:'18:00',startDate:null,endDate:null};
    initializePlannerControls(null,true);loadSelectedCity();
  });
  document.getElementById('btnRecalc').addEventListener('click',()=>loadSelectedCity(true));
}
async function boot(){
  ACTIVE_LOCATION=loadLocation();updateCityDisplay();initializePlannerControls(null,false);bindPlannerControls();
  await loadSelectedCity(false);
}

document.getElementById('btnEvidence').addEventListener('click',function(){
  const ev=document.getElementById('evidence'),opening=ev.hasAttribute('hidden');
  if(opening){ev.removeAttribute('hidden');this.textContent='收起数据依据';this.setAttribute('aria-expanded','true');}
  else{ev.setAttribute('hidden','');this.textContent='查看数据依据';this.setAttribute('aria-expanded','false');}
  if(opening&&VIEW){try{renderTrend(VIEW);wrapTables();}catch(e){}}
  this.scrollIntoView({behavior:'smooth',block:'start'});
});
boot();
