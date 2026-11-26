const CLIMO = {"1":{"years":11,"hitStrict":3,"hitLoose":10,"strictYears":[2015,2019,2025],"looseYears":[2015,2017,2018,2019,2020,2021,2022,2023,2024,2025],"nDays":341,"okDays":68,"windows":3,"rateStrict":0.2727,"rateLoose":0.9091},"2":{"years":11,"hitStrict":4,"hitLoose":11,"strictYears":[2016,2017,2021,2023],"looseYears":[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],"nDays":311,"okDays":41,"windows":4,"rateStrict":0.3636,"rateLoose":1.0},"3":{"years":11,"hitStrict":3,"hitLoose":11,"strictYears":[2018,2023,2025],"looseYears":[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],"nDays":341,"okDays":21,"windows":3,"rateStrict":0.2727,"rateLoose":1.0},"4":{"years":11,"hitStrict":0,"hitLoose":9,"strictYears":[],"looseYears":[2015,2017,2018,2019,2020,2021,2022,2024,2025],"nDays":330,"okDays":16,"windows":0,"rateStrict":0.0,"rateLoose":0.8182},"5":{"years":11,"hitStrict":0,"hitLoose":8,"strictYears":[],"looseYears":[2016,2017,2018,2020,2022,2023,2024,2025],"nDays":341,"okDays":4,"windows":0,"rateStrict":0.0,"rateLoose":0.7273},"6":{"years":11,"hitStrict":0,"hitLoose":2,"strictYears":[],"looseYears":[2015,2020],"nDays":330,"okDays":1,"windows":0,"rateStrict":0.0,"rateLoose":0.1818},"7":{"years":11,"hitStrict":1,"hitLoose":6,"strictYears":[2022],"looseYears":[2015,2016,2017,2020,2022,2023],"nDays":341,"okDays":13,"windows":1,"rateStrict":0.0909,"rateLoose":0.5455},"8":{"years":11,"hitStrict":1,"hitLoose":3,"strictYears":[2015],"looseYears":[2015,2017,2022],"nDays":341,"okDays":8,"windows":1,"rateStrict":0.0909,"rateLoose":0.2727},"9":{"years":11,"hitStrict":1,"hitLoose":5,"strictYears":[2019],"looseYears":[2016,2017,2019,2021,2022],"nDays":330,"okDays":23,"windows":2,"rateStrict":0.0909,"rateLoose":0.4545},"10":{"years":11,"hitStrict":3,"hitLoose":11,"strictYears":[2017,2018,2019],"looseYears":[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],"nDays":341,"okDays":52,"windows":4,"rateStrict":0.2727,"rateLoose":1.0},"11":{"years":11,"hitStrict":1,"hitLoose":11,"strictYears":[2019],"looseYears":[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],"nDays":330,"okDays":55,"windows":1,"rateStrict":0.0909,"rateLoose":1.0},"12":{"years":11,"hitStrict":1,"hitLoose":11,"strictYears":[2020],"looseYears":[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],"nDays":341,"okDays":72,"windows":1,"rateStrict":0.0909,"rateLoose":1.0}};
const CLIMO_META={source:'Open-Meteo ERA5 再分析',point:'广州 23.13°N 113.26°E',from:'2015-01-01',to:'2025-12-31',years:11,missingDays:0};
const BT_ORG={'ecmwf_ifs025':'ECMWF','ecmwf_aifs025_single':'ECMWF（AI）','ukmo_seamless':'UKMO','cma_grapes_global':'CMA','icon_seamless':'ICON','meteofrance_seamless':'Météo-FR','ENSEMBLE':'等权组合'};
const BT_LEADS=[1,3,5,7,10];
const SRC=[
 ['中央气象台','7 天 + 3 小时精细','32%','https://www.nmc.cn/publish/forecast/AGD/guangzhou.html'],
 ['ECMWF HRES 9km','逐日降水/日照/风','20%','https://mirror-earth.com/wea_forecast/440100'],
 ['和风天气','15 天 / 30 天','16%','https://www.qweather.com/weather/guangzhou-101280101.html'],
 ['中国天气网','15 天','16%','https://www.weather.com.cn/weather/101280101.shtml'],
 ['墨迹天气','降水概率/雨量/湿度','12%','https://tianqi.moji.com/weather/china/guangdong/guangzhou'],
 ['东方天气','15 天（偏差大）','2%','https://tianqi.eastday.com/guangzhou/15/'],
 ['Weather.com','10 天（TWC/GFS）','2%','https://weather.com/weather/tenday/l/Guangzhou+Guangdong+China'],
 ['ERA5 再分析','11 年逐日历史','—','https://open-meteo.com/en/docs/historical-weather-api']
];

let PROGRESS_ESTIMATE=null;
let TREND_VIEW=null;
let TREND_RESIZE_BOUND=false;
let RAIN_HOURS_VIEW=null;
let RAIN_HOURS_PROMISE=null;

function escapeTrendText(value){
  return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function trendNumber(value){
  return value==null || !Number.isFinite(Number(value))? null : Number(value);
}
function bindTrendResize(){
  if(TREND_RESIZE_BOUND) return;
  window.addEventListener('resize',function(){
    if(TREND_VIEW) renderTrend(TREND_VIEW);
  });
  TREND_RESIZE_BOUND=true;
}
function renderTrend(view){
  const el=document.getElementById('trendchart');
  if(!el) return;
  TREND_VIEW=view;
  bindTrendResize();
  const days=Array.isArray(view && view.days)? view.days:[];
  if(!days.length){ el.textContent='暂无趋势数据'; return; }

  const width=Math.max(320,Math.min(1080,el.clientWidth || window.innerWidth-40));
  const height=260,left=38,right=38,top=14,bottom=32;
  const plotWidth=width-left-right,plotHeight=height-top-bottom,step=plotWidth/days.length;
  const x=i=>left+step*(i+0.5);
  const finite=days.flatMap(d=>[trendNumber(d.hi),trendNumber(d.lo)]).filter(v=>v!=null);
  const minValue=finite.length?Math.min.apply(null,finite):8;
  const maxValue=finite.length?Math.max.apply(null,finite):32;
  const tMin=Math.min(5,Math.floor((minValue-3)/5)*5);
  const tMax=Math.max(35,Math.ceil((maxValue+3)/5)*5);
  const yTemp=v=>top+(tMax-v)/(tMax-tMin)*plotHeight;
  const yProb=v=>top+(100-v)/100*plotHeight;
  const bottomY=top+plotHeight;
  const ecmwf=d=>{
    const recs=Array.isArray(d.recs)?d.recs:[];
    const r=recs.find(v=>v.p==='ecmwf_ifs025')||recs.find(v=>v.p==='ecmwf');
    return r?trendNumber(r.hi):null;
  };
  const selected=typeof selectDisplayWindow==='function'?selectDisplayWindow(view.windows||[]):null;
  const highlight=selected && (selected.tier==='strict'||selected.tier==='loose')?selected.window:null;
  const parts=[];
  parts.push('<svg class="trend-svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="未来逐日最高温、最低温'
    +(view.planner?'':'、ECMWF最高温')+'和降雨概率趋势">');
  parts.push('<title>未来逐日温度与降雨概率趋势</title><desc>柱形表示最大降雨概率，线条表示综合最高温、综合最低温'
    +(view.planner?'':'和 ECMWF 最高温')+'。</desc>');
  if(highlight){
    const si=days.findIndex(d=>d.date===highlight.start),ei=days.findIndex(d=>d.date===highlight.end);
    if(si>=0&&ei>=si) parts.push('<rect x="'+(left+si*step).toFixed(2)+'" y="'+top+'" width="'+((ei-si+1)*step).toFixed(2)+'" height="'+plotHeight+'" fill="rgba(22,99,111,.07)"/>');
  }
  for(let t=tMin;t<=tMax;t+=5){
    const y=yTemp(t);
    parts.push('<line class="trend-grid" x1="'+left+'" y1="'+y.toFixed(2)+'" x2="'+(width-right)+'" y2="'+y.toFixed(2)+'"/>');
    parts.push('<text class="trend-axis" x="'+(left-7)+'" y="'+(y+3.5).toFixed(2)+'" text-anchor="end">'+t+'°</text>');
  }
  [0,50,100].forEach(p=>{
    const y=yProb(p);
    parts.push('<text class="trend-axis trend-axis-rain" x="'+(width-right+7)+'" y="'+(y+3.5).toFixed(2)+'" text-anchor="start">'+p+'%</text>');
  });
  const barWidth=Math.max(4,Math.min(18,step*.48));
  days.forEach((d,i)=>{
    const p=trendNumber(d.popMax);
    if(p==null) return;
    const y=yProb(Math.max(0,Math.min(100,p)));
    const title=escapeTrendText(d.date+' 最大降雨概率 '+Math.round(p)+'%');
    parts.push('<rect class="trend-rainbar" x="'+(x(i)-barWidth/2).toFixed(2)+'" y="'+y.toFixed(2)+'" width="'+barWidth.toFixed(2)+'" height="'+Math.max(0,bottomY-y).toFixed(2)+'" rx="2"><title>'+title+'</title></rect>');
  });
  const pathFor=read=>{
    let path='',open=false;
    days.forEach((d,i)=>{
      const v=read(d);
      if(v==null){open=false;return;}
      path+=(open?' L ':' M ')+x(i).toFixed(2)+' '+yTemp(v).toFixed(2);
      open=true;
    });
    return path;
  };
  const maxRead=d=>trendNumber(d.hi),minRead=d=>trendNumber(d.lo);
  const ecmwfRead=d=>ecmwf(d);
  const series=[
    {name:'最高温',read:maxRead,cls:'trend-max',color:'#D9962B',radius:2.8},
    {name:'最低温',read:minRead,cls:'trend-min',color:'#16636F',radius:2.8}
  ];
  series.forEach(s=>{
    const path=pathFor(s.read);
    if(path) parts.push('<path class="'+s.cls+'" d="'+path+'" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
    days.forEach((d,i)=>{
      const v=s.read(d);if(v==null)return;
      const title=escapeTrendText(d.date+' '+s.name+' '+v.toFixed(1)+'℃');
      parts.push('<circle cx="'+x(i).toFixed(2)+'" cy="'+yTemp(v).toFixed(2)+'" r="'+s.radius+'" fill="'+s.color+'"><title>'+title+'</title></circle>');
    });
  });
  const ecPath=pathFor(ecmwfRead);
  if(ecPath) parts.push('<path class="trend-ecmwf" d="'+ecPath+'" fill="none" stroke="#8FA5A3" stroke-width="1.5" stroke-dasharray="3 4" stroke-linecap="round"/>');
  const labelEvery=width<540?2:1;
  days.forEach((d,i)=>{
    if(i%labelEvery!==0 && i!==days.length-1) return;
    parts.push('<text class="trend-axis" x="'+x(i).toFixed(2)+'" y="'+(height-9)+'" text-anchor="middle">'+escapeTrendText(d.date)+'</text>');
  });
  parts.push('</svg>');
  el.innerHTML='<div class="trend-legend" aria-hidden="true">'
    +'<span><i class="trend-key trend-key-max"></i>最高温</span>'
    +'<span><i class="trend-key trend-key-min"></i>最低温</span>'
    +(!view.planner||ecPath? '<span><i class="trend-key trend-key-ecmwf"></i>ECMWF 最高</span>' : '')
    +'<span><i class="trend-key trend-key-rain"></i>降雨概率</span>'
    +'</div>'+parts.join('');
}

function wrapTables(){
  Array.prototype.forEach.call(document.querySelectorAll('table'),function(t){
    if(t.closest('.tscroll') || t.classList.contains('mx')) return;
    const w=document.createElement('div');w.className='tscroll';
    t.parentNode.insertBefore(w,t);w.appendChild(t);
  });
}

function fetchRainHours(view){
  if(!view || !Array.isArray(view.days)) return Promise.resolve(false);
  if(RAIN_HOURS_VIEW===view && RAIN_HOURS_PROMISE) return RAIN_HOURS_PROMISE;
  RAIN_HOURS_VIEW=view;
  view.days.forEach(d=>{d.rainHoursState='loading';});
  RAIN_HOURS_PROMISE=(async()=>{
    const url='https://api.open-meteo.com/v1/forecast?latitude=23.125,23.129,23.135,23.09&longitude=113.24,113.267,113.33,113.31'
      +'&hourly=precipitation&timezone=Asia%2FShanghai&forecast_days=8&models=ecmwf_ifs025,ukmo_seamless,icon_seamless';
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
    try{
      const res=await fetch(url,{cache:'no-store',signal:ctl.signal});
      if(!res.ok) throw new Error('hourly forecast unavailable');
      const payload=await res.json();
      const arr=(Array.isArray(payload)?payload:[payload]).filter(x=>x.hourly);
      if(!arr.length) throw new Error('hourly forecast missing');
      const times=arr[0].hourly.time,precip=arr[0].hourly.precipitation;
      const aligned=Array.isArray(times)&&Array.isArray(precip)&&precip.length===times.length
        &&arr.every(p=>Array.isArray(p.hourly.time)&&p.hourly.time.length===times.length
          &&p.hourly.time.every((t,i)=>t===times[i])
          &&Array.isArray(p.hourly.precipitation)&&p.hourly.precipitation.length===times.length);
      if(!aligned) throw new Error('hourly timestamps are not aligned');
      const byDay=Object.create(null);
      for(let i=0;i<times.length;i++){
        const time=times[i],hour=Number(time.slice(11,13));
        if(!Number.isInteger(hour)) continue;
        let sum=0,count=0;
        arr.forEach(p=>{
          const value=trendNumber(p.hourly.precipitation[i]);
          if(value!=null){sum+=value;count++;}
        });
        if(!count || sum/count<0.2) continue;
        const iso=time.slice(0,10);
        (byDay[iso]=byDay[iso]||[]).push(hour);
      }
      view.days.forEach(d=>{d.rainHours=[];d.rainHoursState='ready';});
      Object.keys(byDay).forEach(iso=>{
        const d=view.days.find(x=>x.date===iso.slice(5));
        if(!d) return;
        const hours=byDay[iso].sort((a,b)=>a-b),runs=[];
        let start=null,previous=null;
        hours.forEach(hour=>{
          if(start==null) start=hour;
          else if(hour!==previous+1){runs.push([start,previous]);start=hour;}
          previous=hour;
        });
        if(start!=null) runs.push([start,previous]);
        d.rainHours=runs.map(r=>('0'+r[0]).slice(-2)+(r[0]===r[1]?' 时':'–'+('0'+(r[1]+1)).slice(-2)+' 时'));
      });
      return true;
    }catch(error){
      view.days.forEach(d=>{d.rainHoursState='unavailable';});
      return false;
    }finally{
      clearTimeout(timer);
    }
  })();
  return RAIN_HOURS_PROMISE;
}
