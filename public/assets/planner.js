const DEFAULT_CITY={name:'广州',country:'中国',admin1:'广东省',latitude:23.1291,longitude:113.2644,timezone:'Asia/Shanghai',searchText:'广州'};
const PERIODS={
  day:{start:6,end:22,label:'全天',detail:'06:00–22:00'},
  morning:{start:6,end:12,label:'上午',detail:'06:00–12:00'},
  afternoon:{start:12,end:18,label:'下午',detail:'12:00–18:00'},
  evening:{start:18,end:24,label:'晚上',detail:'18:00–24:00'}
};
const state={city:{...DEFAULT_CITY},mode:'find',period:'day',payload:null,windows:[],requestId:0};
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');

function zone(value){try{new Intl.DateTimeFormat('en',{timeZone:value}).format();return value;}catch{return 'UTC';}}
function localNow(timeZone=state.city.timezone){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone(timeZone),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const p={};parts.forEach(x=>{if(x.type!=='literal')p[x.type]=x.value;});
  return {date:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour)};
}
function addDays(iso,n){const p=iso.split('-').map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2]+n)).toISOString().slice(0,10);}
function diffDays(a,b){const x=a.split('-').map(Number),y=b.split('-').map(Number);return Math.round((Date.UTC(y[0],y[1]-1,y[2])-Date.UTC(x[0],x[1]-1,x[2]))/86400000);}
function weekday(iso){const p=iso.split('-').map(Number);return ['周日','周一','周二','周三','周四','周五','周六'][new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay()];}
function dateLabel(iso){const p=iso.split('-');return Number(p[1])+'月'+Number(p[2])+'日 '+weekday(iso);}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cityLabel(c){return [c.name,c.admin1,c.country].filter((v,i,a)=>v&&a.indexOf(v)===i).join(' · ');}
function status(message,type='info'){$('appStatus').textContent=message;$('appStatus').className='app-status '+type;}
function busy(value){$('searchButton').disabled=value;$('searchButton').textContent=value?'正在查询…':'开始查询';}

function initDates(){
  const today=localNow().date, tomorrow=addDays(today,1), last=addDays(today,15);
  $('searchStart').value=tomorrow;$('searchEnd').value=last;
  $('fixedStart').value=tomorrow;$('fixedEnd').value=addDays(tomorrow,3);
  updateDateLimits();
}
function updateDateLimits(){
  const today=localNow().date,max=addDays(today,15);
  ['searchStart','searchEnd','fixedStart','fixedEnd'].forEach(id=>{
    const x=$(id);x.min=today;x.max=max;
    if(!x.value||x.value<today)x.value=today;
    if(x.value>max)x.value=max;
  });
  [['searchStart','searchEnd'],['fixedStart','fixedEnd']].forEach(([a,b])=>{if($(b).value<$(a).value)$(b).value=$(a).value;});
}
function setMode(mode){
  state.mode=mode;
  document.querySelectorAll('[data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  $('findControls').hidden=mode!=='find';$('fixedControls').hidden=mode!=='fixed';$('durationField').hidden=mode!=='find';
}
function setPeriod(period){
  state.period=period;
  document.querySelectorAll('[data-period]').forEach(b=>{const on=b.dataset.period===period;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  $('customTimes').hidden=period!=='custom';
}
function getPeriod(){
  if(state.period!=='custom')return {...PERIODS[state.period]};
  const a=$('customStart').value.split(':').map(Number),b=$('customEnd').value.split(':').map(Number);
  const start=a[0]+a[1]/60,end=b[0]+b[1]/60;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('自定义结束时间必须晚于开始时间');
  return {start,end,label:'自定义时段',detail:$('customStart').value+'–'+$('customEnd').value};
}
async function locations(q){
  const r=await fetch('/api/locations?q='+encodeURIComponent(q),{cache:'no-store'}),j=await r.json();
  if(!r.ok)throw new Error(j.error||'城市搜索失败');
  return Array.isArray(j.results)?j.results:[];
}
function showLocations(items){
  const box=$('cityResults');box.replaceChildren();
  if(!items.length){const d=document.createElement('div');d.className='city-empty';d.textContent='没有找到，请换个城市名称试试';box.append(d);box.hidden=false;return;}
  items.forEach(item=>{
    const b=document.createElement('button');b.type='button';b.className='city-option';
    b.textContent=[item.name,item.admin1,item.country].filter(Boolean).join(' · ');
    b.addEventListener('click',()=>chooseCity(item));box.append(b);
  });
  box.hidden=false;
}
function chooseCity(item){
  state.city={...item,searchText:item.name,timezone:item.timezone||'auto'};
  $('cityInput').value=item.name;
  $('cityMeta').textContent=cityLabel(item)+' · '+(item.timezone||'当地时区自动识别');
  $('cityResults').hidden=true;updateDateLimits();
  status('目的地已切换，日期按当地时区计算。');
}
let searchTimer;
$('cityInput').addEventListener('input',()=>{
  const q=$('cityInput').value.trim();clearTimeout(searchTimer);
  if(q.length<2||q===state.city.searchText){$('cityResults').hidden=true;return;}
  searchTimer=setTimeout(async()=>{
    const id=++state.requestId;
    try{const items=await locations(q);if(id===state.requestId&&$('cityInput').value.trim()===q)showLocations(items);}
    catch(e){if(id===state.requestId)status(e.message,'error');}
  },250);
});
$('cityInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){const first=$('cityResults').querySelector('button');if(first){e.preventDefault();first.click();}}
  if(e.key==='Escape')$('cityResults').hidden=true;
});
document.addEventListener('click',e=>{if(!e.target.closest('.city-field'))$('cityResults').hidden=true;});
async function quickCity(name){
  $('cityInput').value=name;status('正在查找 '+name+'…');
  try{const items=await locations(name);if(!items.length)throw new Error('没有找到 '+name);chooseCity(items[0]);}
  catch(e){status(e.message,'error');}
}
async function ensureCity(){
  const q=$('cityInput').value.trim();
  if(!q)throw new Error('请输入目的地城市');
  if(q===state.city.searchText||q===state.city.name)return;
  const items=await locations(q);
  if(items.length===1){chooseCity(items[0]);return;}
  showLocations(items);
  throw new Error(items.length?'请从搜索结果中选择城市，避免选错同名地点':'没有找到这个城市');
}
function icon(c){
  if(c==='晴')return '☀️';if(c==='多云')return '⛅';if(c==='阴')return '☁️';if(c==='雾')return '🌫️';
  if(c==='雪'||c==='阵雪')return '❄️';if(c==='雷雨')return '⛈️';
  if(['毛毛雨','小雨','大雨','阵雨','有雨时段'].includes(c))return '🌧️';return '🌤️';
}
function rainHour(h){
  return (h.precipitationProbability!=null&&h.precipitationProbability>=50)
    ||(h.precipitation!=null&&h.precipitation>=0.2)
    ||['毛毛雨','小雨','大雨','阵雨','雷雨','雪','阵雪'].includes(h.condition);
}
function rainPeriods(hours){
  const nums=hours.filter(rainHour).map(h=>Number(h.time.slice(11,13))).sort((a,b)=>a-b),groups=[];
  nums.forEach(h=>{const last=groups[groups.length-1];if(!last||h>last[1]+1)groups.push([h,h]);else last[1]=h;});
  return groups.map(g=>pad(g[0])+':00–'+pad(g[1]+1)+':00');
}
function summarize(date,hours,period,pref,timezone){
  const now=localNow(timezone),start=Math.floor(period.start),end=Math.ceil(period.end);
  const slots=hours.filter(h=>h.time.slice(0,10)===date).filter(h=>{const n=Number(h.time.slice(11,13));return n>=start&&n<end;});
  const used=slots.filter(h=>date!==now.date||Number(h.time.slice(11,13))>=now.hour);
  const expected=date===now.date?Math.max(0,end-Math.max(start,now.hour)):Math.max(0,end-start);
  const valid=used.filter(h=>h.modelCount>0);
  if(!valid.length||expected<=0)return {date,status:'empty',hours:valid,note:expected<=0?'所选时段已经过去':'该时段暂时没有逐小时数据'};
  const wet=valid.filter(rainHour),temps=valid.map(h=>h.temperature).filter(Number.isFinite);
  const probs=valid.map(h=>h.precipitationProbability).filter(Number.isFinite);
  const amounts=valid.map(h=>h.precipitation).filter(Number.isFinite),winds=valid.map(h=>h.windSpeed).filter(Number.isFinite);
  const totalRain=amounts.reduce((a,b)=>a+b,0),ratio=wet.length/valid.length;
  const avgProb=probs.length?probs.reduce((a,b)=>a+b,0)/probs.length:null;
  const highProb=valid.map(h=>h.precipitationProbabilityHigh).filter(Number.isFinite);
  const maxProb=highProb.length?Math.max(...highProb):0;
  const modelAvg=valid.reduce((a,h)=>a+h.modelCount,0)/valid.length;
  const counts={};valid.filter(h=>!rainHour(h)).forEach(h=>counts[h.condition]=(counts[h.condition]||0)+1);
  const sky=wet.length>=valid.length*.4?'有雨时段':Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]||valid[0].condition;
  const tmin=temps.length?Math.min(...temps):null,tmax=temps.length?Math.max(...temps):null,wmax=winds.length?Math.max(...winds):null;
  const coverage=valid.length/expected;
  let score=100-ratio*(pref==='light'?48:68);
  if(totalRain>=8)score-=14;else if(totalRain>=2)score-=6;
  if(maxProb>=85&&ratio>=.1)score-=6;
  if(tmax!=null&&tmax>32)score-=Math.min(18,(tmax-32)*2);
  if(tmin!=null&&tmin<5)score-=Math.min(15,(5-tmin)*2);
  if(wmax!=null&&wmax>35)score-=Math.min(12,(wmax-35)*.7);
  score=Math.max(0,Math.min(100,Math.round(score)));
  let risk='low';
  if(ratio>=.4||totalRain>=8||(maxProb>=85&&ratio>=.2))risk='high';
  else if(ratio>=.15||(avgProb!=null&&avgProb>=40)||totalRain>=2)risk='medium';
  const lead=diffDays(now.date,date);let confidence=lead<=2?'高':lead<=6?'中':'低';
  if(modelAvg<3)confidence=confidence==='高'?'中':'低';if(coverage<.65)confidence='低';
  return {date,status:'ready',hours:valid,coverage,condition:sky,tmin,tmax,wmax,totalRain,avgProb,maxProb,
    rainHours:wet.length,rainTimes:rainPeriods(valid),score,risk,confidence,
    note:risk==='high'?'这个时段降雨信号较多，户外安排建议准备替代方案':risk==='medium'?'部分时段可能下雨，建议带伞并留意临近更新':'这个时段的降雨信号相对较少'};
}
function verdict(days){
  if(!days.length||days.some(d=>d.status!=='ready'))return {label:'数据不完整',tone:'muted',reason:'部分日期或时段缺少逐小时预报，暂时不能可靠判断。'};
  const avg=days.reduce((s,d)=>s+d.score,0)/days.length,high=days.filter(d=>d.risk==='high').length,mid=days.filter(d=>d.risk==='medium').length;
  if(avg>=78&&!high&&mid<=Math.floor(days.length/3))return {label:'比较适合',tone:'good',reason:'这段时间整体较合适，出发前再看一次临近预报即可。'};
  if(avg>=58&&high<=Math.max(1,Math.floor(days.length/3)))return {label:'可以安排',tone:'mid',reason:'天气不算完美，但可以安排；重点留意有雨的日期和时段。'};
  return {label:'建议换时间',tone:'bad',reason:'所选时段的降雨或天气不适风险偏高，可以看看下面的备选日期。'};
}
function windows(days,start,end,duration){
  const pool=days.filter(d=>d.date>=start&&d.date<=end).sort((a,b)=>a.date.localeCompare(b.date)),out=[];
  for(let i=0;i+duration<=pool.length;i++){
    const part=pool.slice(i,i+duration);if(part.some(d=>d.status!=='ready'))continue;
    const v=verdict(part),avg=part.reduce((s,d)=>s+d.score,0)/part.length,min=Math.min(...part.map(d=>d.score));
    out.push({days:part,score:Math.round(avg*.7+min*.3-part.filter(d=>d.risk==='high').length*5),
      rainHours:part.reduce((s,d)=>s+d.rainHours,0),verdict:v});
  }
  return out.sort((a,b)=>b.score-a.score||a.rainHours-b.rainHours||a.days[0].date.localeCompare(b.days[0].date));
}
const fmt=(n,d=0)=>Number.isFinite(n)?Number(n).toFixed(d):'—';
function renderHour(h){
  return '<div class="hour-card"><div class="hour-time">'+esc(h.time.slice(11,16))+'</div><div class="hour-icon">'+icon(h.condition)+'</div>'
    +'<div class="hour-condition">'+esc(h.condition)+'</div><div class="hour-temp">'+fmt(h.temperature)+'°</div>'
    +'<div class="hour-rain">雨 '+(h.precipitationProbability==null?'—':Math.round(h.precipitationProbability)+'%')+'</div>'
    +'<div class="hour-amount">'+(h.precipitation==null?'—':fmt(h.precipitation,1)+'mm')+'</div></div>';
}
function renderDay(d){
  if(d.status!=='ready')return '<article class="day-card day-empty"><b>'+esc(dateLabel(d.date))+'</b><p>'+esc(d.note)+'</p></article>';
  const riskText=d.risk==='high'?'降雨风险偏高':d.risk==='medium'?'留意降雨':'雨水较少';
  const confidence=d.confidence==='高'?'confidence-high':d.confidence==='中'?'confidence-mid':'confidence-low';
  const periods=d.rainTimes.length?d.rainTimes.join('、'):'未发现明显降雨时段';
  return '<article class="day-card"><div class="day-card-head"><div class="day-date"><strong>'+esc(dateLabel(d.date))+'</strong><small>'+esc(d.condition)+'</small></div>'
    +'<div class="day-weather"><span>'+icon(d.condition)+'</span><b>'+esc(d.condition)+'</b></div>'
    +'<div class="day-temp"><b>'+fmt(d.tmax)+'°</b><small>/ '+fmt(d.tmin)+'°</small></div>'
    +'<div class="day-rain"><b>'+(d.avgProb==null?'降雨概率暂无':'降雨概率均值 '+Math.round(d.avgProb)+'%')+'</b><small>预计雨量 '+fmt(d.totalRain,1)+'mm</small></div>'
    +'<span class="day-verdict risk-'+d.risk+'">'+riskText+'</span></div>'
    +'<p class="day-note">'+esc(d.note)+'</p><div class="day-meta"><span class="'+confidence+'">预报参考度 '+d.confidence+'</span>'
    +'<span>最高风速 '+fmt(d.wmax)+' km/h</span><span>'+esc(periods)+'</span></div>'
    +'<details class="hour-details"><summary>查看逐小时天气（'+d.hours.length+' 个时段）</summary><div class="hour-grid">'+d.hours.map(renderHour).join('')+'</div></details></article>';
}
function renderSelection(days,query,scroll=true){
  const v=verdict(days),ready=days.filter(d=>d.status==='ready'),avg=ready.length?Math.round(ready.reduce((s,d)=>s+d.score,0)/ready.length):null;
  const first=days[0].date,last=days[days.length-1].date;
  $('resultEyebrow').textContent=cityLabel(state.city)+' · '+query.period.detail+' · '+state.payload.timezone;
  $('resultTitle').textContent=dateLabel(first)+(first===last?'':' — '+dateLabel(last));
  $('resultSub').textContent=query.mode==='find'?'连续 '+days.length+' 天 · 从你选定的搜索范围中挑选':'你选定的日期 · 每天按 '+query.period.detail+' 查看';
  $('resultVerdict').textContent=v.label;$('resultVerdict').className='result-verdict tone-'+v.tone;
  $('resultReason').textContent=v.reason;
  $('resultStats').innerHTML='<div><span>整体参考分</span><b>'+(avg==null?'—':avg+'/100')+'</b></div>'
    +'<div><span>有雨时段</span><b>'+days.reduce((s,d)=>s+(d.rainHours||0),0)+' 小时</b></div>'
    +'<div><span>预报来源</span><b>'+(state.payload.modelMode==='ensemble'?'多模式综合':'最佳匹配')+'</b></div>';
  $('dayList').innerHTML=days.map(renderDay).join('');
  const stamp=new Date(state.payload.updatedAt).toLocaleString('zh-CN',{timeZone:zone(state.payload.timezone),month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  $('resultUpdated').textContent='数据更新于 '+stamp+(state.payload.stale?' · 上次成功取得':' · 最新取得');
  $('resultSource').textContent=state.payload.source+'。天气按所选城市的代表位置计算，不等于全市每个街区的实况。';
  $('results').hidden=false;
  if(scroll)$('results').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderAlternatives(list,query){
  const box=$('alternatives');box.replaceChildren();
  if(list.length<2){box.hidden=true;return;}box.hidden=false;
  const h=document.createElement('h3');h.textContent='其它可选日期';box.append(h);
  const grid=document.createElement('div');grid.className='alternative-list';
  list.slice(1,3).forEach((w,i)=>{
    const b=document.createElement('button');b.type='button';b.className='alternative-card';
    b.innerHTML='<span class="alternative-rank">备选 '+(i+1)+'</span><strong>'+esc(dateLabel(w.days[0].date)+' — '+dateLabel(w.days[w.days.length-1].date))+'</strong>'
      +'<span>综合参考分 '+w.score+' · '+w.rainHours+' 个有雨时段</span><em>'+esc(w.verdict.label)+'</em>';
    b.addEventListener('click',()=>renderSelection(w.days,query));grid.append(b);
  });
  box.append(grid);
}
async function runSearch(){
  busy(true);
  try{
    await ensureCity();updateDateLimits();
    const period=getPeriod();let start,end,duration=1;
    if(state.mode==='find'){
      start=$('searchStart').value;end=$('searchEnd').value;duration=Number($('duration').value);
      if(diffDays(start,end)+1<duration)throw new Error('搜索范围短于你选择的连续出行天数');
    }else{start=$('fixedStart').value;end=$('fixedEnd').value;}
    if(!start||!end||end<start)throw new Error('请检查日期范围');
    if(diffDays(start,end)>15)throw new Error('一次最多查看未来 16 天');
    status('正在读取 '+cityLabel(state.city)+' 的逐小时天气…','loading');
    const r=await fetch('/api/plan?lat='+encodeURIComponent(state.city.latitude)+'&lon='+encodeURIComponent(state.city.longitude),{cache:'no-store'});
    const payload=await r.json();if(!r.ok)throw new Error(payload.error||'天气数据暂时不可用');
    if(!Array.isArray(payload.days)||!Array.isArray(payload.hours))throw new Error('天气数据格式不完整');
    state.payload=payload;if(payload.timezone&&payload.timezone!=='auto')state.city.timezone=payload.timezone;
    const summaries=payload.days.map(d=>summarize(d.date,payload.hours,period,$('rainPreference').value,payload.timezone));
    const query={mode:state.mode,start,end,duration,period};
    if(state.mode==='fixed'){
      const selected=summaries.filter(d=>d.date>=start&&d.date<=end);
      if(selected.length!==diffDays(start,end)+1)throw new Error('所选日期超出当前预报范围，请换一个更近的日期');
      renderAlternatives([],query);renderSelection(selected,query);
    }else{
      const found=windows(summaries,start,end,duration);
      if(!found.length)throw new Error('这个范围内没有完整的逐小时预报，试试缩短天数或调整搜索范围');
      state.windows=found;renderAlternatives(found,query);renderSelection(found[0].days,query);
    }
    status(payload.stale?'天气服务暂时未更新，当前显示上次成功取得的数据。':'查询完成。日期和时间均按目的地当地时区计算。',payload.stale?'warning':'success');
  }catch(e){status(e.message||'查询失败，请稍后重试','error');}
  finally{busy(false);}
}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>setPeriod(b.dataset.period)));
document.querySelectorAll('[data-quick-city]').forEach(b=>b.addEventListener('click',()=>quickCity(b.dataset.quickCity)));
$('plannerForm').addEventListener('submit',e=>{e.preventDefault();runSearch();});
['searchStart','searchEnd','fixedStart','fixedEnd'].forEach(id=>$(id).addEventListener('change',()=>{
  const a=id.startsWith('search')?'searchStart':'fixedStart',b=id.startsWith('search')?'searchEnd':'fixedEnd';
  if($(b).value<$(a).value)$(b).value=$(a).value;
}));
$('cityMeta').textContent=cityLabel(DEFAULT_CITY)+' · '+DEFAULT_CITY.timezone;
setMode('find');setPeriod('day');initDates();runSearch();
