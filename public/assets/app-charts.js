function renderRank(view){
  const el=document.getElementById('rankchart');
  if(!window.echarts){ el.innerHTML='<p class="cap">图表库未加载（可能离线），窗口排序见第 02 节日历与下方文字。</p>'; return; }
  const rc=document.getElementById('rankcap');
  if(rc){ const t0=view.windows[0];
    rc.innerHTML='这半个月里所有连着四天的组合，按「晴或多云」这档从好到差排。横条长度是这段的整体分，条越短越差；「周 1／周 2」是跨了几个周末。'
      +(t0&&t0.valid? '最好的这段四天全过，可以直接走。' : '最好的这段也有 '+(t0?t0.bad:0)+' 天没过，所以这档是 0。')+' 阴天也算的那档，看上面那行。'; }
  const w=view.windows.slice().reverse();
  el.style.height=Math.max(330, Math.min(560, 40 + w.length*34))+'px';
  const ch=newChart(el);
  const cols = w.map(x=> x.valid ? '#16636F' : (x.bad===1? '#D9962B' : '#B9C6C1'));
  ch.setOption({
    animation:false,
    grid:{left:8,right:80,top:12,bottom:28,containLabel:true},
    xAxis:{type:'value',min:0,max:80,axisLine:{lineStyle:{color:'#C7D2CC'}},splitLine:{lineStyle:{color:'#E4EAE6'}},
      axisLabel:{color:'#6C7C77',fontSize:11,fontFamily:'Barlow Condensed'}},
    yAxis:{type:'category',data:w.map(x=>x.span.replace('—',' — ')+(x.wk? '  ·周'+x.wk : '')),
      axisLine:{show:false},axisTick:{show:false},
      axisLabel:{color:'#485853',fontSize:12,fontFamily:'Barlow Condensed'}},
    series:[{type:'bar',barWidth:14,colorBy:'data',color:cols,
      data:w.map(x=>Number(x.score)),
      label:{show:true,position:'right',distance:6,fontFamily:'Barlow Condensed',fontSize:12,color:'#485853',
        formatter:p=> Number(p.value).toFixed(1)},
      itemStyle:{borderRadius:0}}],
    tooltip:{trigger:'item',formatter:p=>{
      const x=w[p.dataIndex];
      return x.span+'<br/>整体 '+x.score.toFixed(1)+' 分 · 最差一天 '+x.min+' · 没过 '+x.bad+' 天 · 跨周末 '+x.wk+' 天<br/>'
        + x.days.map(d=>d.date+' '+d.modal+' '+d.score+(d.ok?'':' ✕')).join('<br/>');
    },backgroundColor:'#FAFBFA',borderColor:'#C7D2CC',textStyle:{color:'#16211F',fontSize:12}}
  });
  window.addEventListener('resize',()=>ch.resize());
}

/* ---------- 趋势图 ---------- */
function renderTrend(view){
  const el=document.getElementById('trendchart');
  if(!window.echarts){ el.innerHTML='<p class="cap">图表库未加载，趋势数据见第 02 节日历。</p>'; return; }
  const days=view.days;
  const ch=newChart(el);
  const ec = days.map(d=>{
    const r=d.recs.find(x=>x.p==='ecmwf')||d.recs.find(x=>x.p==='ecmwf_ifs025');
    return r? r.hi : null;
  });
  const inWin = view.windows.length? days.map((d,i)=> view.windows[0].days.some(x=>x.date===d.date)) : []; 
  ch.setOption({
    animation:false,
    grid:{left:8,right:24,top:34,bottom:26,containLabel:true},
    legend:{top:0,left:0,right:52,itemWidth:14,itemHeight:8,itemGap:14,textStyle:{color:'#485853',fontSize:11.5},data:['最高温','最低温','ECMWF 最高','最大雨概率']},
    tooltip:{trigger:'axis',backgroundColor:'#FAFBFA',borderColor:'#C7D2CC',textStyle:{color:'#16211F',fontSize:12}},
    xAxis:{type:'category',data:days.map(d=>d.date),axisLine:{lineStyle:{color:'#C7D2CC'}},axisTick:{show:false},
      axisLabel:{color:'#6C7C77',fontSize:11,fontFamily:'Barlow Condensed'}},
    yAxis:[
      {type:'value',name:'℃',nameTextStyle:{color:'#6C7C77',fontSize:10},min:5,max:35,
       axisLine:{show:false},splitLine:{lineStyle:{color:'#E4EAE6'}},axisLabel:{color:'#6C7C77',fontSize:11}},
      {type:'value',name:'降水 %',nameTextStyle:{color:'#54748A',fontSize:10},min:0,max:100,
       axisLine:{show:false},splitLine:{show:false},axisLabel:{color:'#54748A',fontSize:11}}
    ],
    series:[
      {name:'最大降水概率',type:'bar',yAxisIndex:1,barWidth:'46%',z:1,
       data:days.map(d=> d.popMax==null? null : Math.round(d.popMax)),
       itemStyle:{color:'rgba(84,116,138,.30)'}},
      {name:'最高温',type:'line',symbol:'circle',symbolSize:4,lineStyle:{color:'#D9962B',width:2},itemStyle:{color:'#D9962B'},
       data:days.map(d=> d.hi==null? null : +d.hi.toFixed(1))},
      {name:'最低温',type:'line',symbol:'circle',symbolSize:4,lineStyle:{color:'#16636F',width:2},itemStyle:{color:'#16636F'},
       data:days.map(d=> d.lo==null? null : +d.lo.toFixed(1)),
       markArea:{silent:true,itemStyle:{color:'rgba(22,99,111,.07)'},
         data:view.windows.length? [[{xAxis:view.windows[0].start},{xAxis:view.windows[0].end}]] : []}},
      {name:'ECMWF 最高',type:'line',symbol:'none',lineStyle:{color:'#8FA5A3',width:1.4,type:'dotted'},
       data:ec.map(v=> v==null? null : +v.toFixed(1))}
    ]
  });
  window.addEventListener('resize',()=>ch.resize());
}


function wrapTables(){
  Array.prototype.forEach.call(document.querySelectorAll('table'),function(t){
    if(t.closest('.tscroll') || t.classList.contains('mx')) return;
    const w=document.createElement('div'); w.className='tscroll';
    t.parentNode.insertBefore(w,t); w.appendChild(t);
  });
}

/* ---------- 选定四天行程的独立评估 ---------- */
let TRIP_SEL=null;
function tripVerdict(days){
  // 只看天气本身，覆盖不足单独提示，不把“只有一家机构”当成天气不合格
  const bad=days.filter(function(d){ return d.modal==='阴' || d.rainy; });
  const looseBad=days.filter(function(d){ return d.rainy; });
  const rainy=days.filter(function(d){ return d.rainy; });
  const mist=days.filter(function(d){ return !d.rainy && d.rainLevel==='零星'; });
  const highPop=days.filter(function(d){ return d.popMax!=null && d.popMax>=40; });
  const reasonOf=function(d){
    if(d.rainy) return d.rainLevel==='明显'? '有雨' : '零星雨';
    if(d.modal==='阴') return '阴';
    return d.modal;
  };
  const why=function(list){ return list.map(function(d){ return d.date+'（'+reasonOf(d)+'）'; }).join('、'); };
  return {
    strict: bad.length? ('不成立：'+why(bad)) : '天气上成立：四天都晴或多云、没有雨',
    loose: looseBad.length? ('不成立：'+why(looseBad)) : (days.some(function(d){return d.modal==='阴';})? '天气上成立：有阴天，但四天都不下雨' : '天气上成立：四天都不下雨'),
    rain: rainy.length? ('有雨：'+rainy.map(function(d){return d.date;}).join('、'))
          : (mist.length? ('零星：'+mist.map(function(d){return d.date;}).join('、')) 
          : (highPop.length? ('概率偏高：'+highPop.map(function(d){return d.date+' '+Math.round(d.popMax)+'%';}).join('、')) : '低：四天都没有像样的降雨信号'))
  };
}
function renderTripUI(view){
  const pick=document.getElementById('trippick'); const box=document.getElementById('trip');
  if(!pick||!box) return;
  const wins=view.windows.filter(function(w){ return w.days.length===4; });
  let spans=wins.map(function(w){ return w.start; });
  if(view.days.some(function(d){ return d.date==='11-28'; }) && spans.indexOf('11-28')<0) spans.unshift('11-28');
  spans=spans.slice(0,10);
  if(!TRIP_SEL || spans.indexOf(TRIP_SEL)<0) TRIP_SEL = spans.indexOf('11-28')>=0? '11-28' : spans[0];
  pick.innerHTML='<span>选一段评估：</span>'+spans.map(function(s){
    return '<button class="tpbtn'+(s===TRIP_SEL?' on':'')+'" data-s="'+s+'">'+s+' 起</button>';
  }).join('');
  Array.prototype.forEach.call(pick.querySelectorAll('.tpbtn'),function(b){
    b.onclick=function(){ TRIP_SEL=b.getAttribute('data-s'); renderTripUI(view); };
  });
  const win=wins.find(function(w){ return w.start===TRIP_SEL; });
  if(!win){ box.innerHTML='<p class="acc-note">这段不在当前预报范围内。</p>'; return; }
  const days=win.days;
  const minOrg=Math.min.apply(null,days.map(function(d){ return d.nOrg; }));
  const minN=Math.min.apply(null,days.map(function(d){ return d.n; }));
  const minConf=Math.min.apply(null,days.map(function(d){ return d.conf; }));
  const v=tripVerdict(days);
  const short=minOrg<2;
  box.innerHTML='<div class="trip-h"><b>'+days[0].date+' — '+days[3].date+'</b>'
    +'<span>覆盖：最少 '+minOrg+' 家机构 / '+minN+' 个模式（按每天自身统计，不借别的日期）</span>'
    +'<span>可信度最低：'+CONF_TXT[minConf]+'</span>'
    +'<span>'+LEAD_TXT(days[0].lead)+' → '+LEAD_TXT(days[3].lead)+'</span></div>'
    +(short? '<p class="tp-warn">覆盖不足：这段至少有一天只有 '+minOrg+' 家机构有预报，下面三个判断只能当趋势参考，别据此定行程。</p>':'')
    +'<div class="vd">'
    +'<div><h4>晴好（严格：晴或多云、不下雨）</h4><p class="st">'+v.strict+'</p></div>'
    +'<div><h4>阴天可接受（阴也算，只要不下雨）</h4><p class="st">'+v.loose+'</p></div>'
    +'<div><h4>降雨风险</h4><p class="st">'+v.rain+'</p></div></div>'
    +'<table class="plats"><colgroup><col style="width:13%"><col style="width:12%"><col style="width:15%"><col style="width:12%"><col style="width:12%"><col style="width:14%"><col style="width:12%"><col style="width:10%"></colgroup>'
    +'<thead><tr><th>日期</th><th>天气</th><th>最高/最低</th><th>雨概率</th><th>雨量</th><th>机构/模式</th><th>可信度</th><th>覆盖</th></tr></thead><tbody>'
    + days.map(function(d){
        return '<tr><td>'+d.date+'<small style="color:var(--ink3)"> '+d.wd+'</small></td>'
          +'<td>'+(d.modal==='雨'? (d.rainLevel==='明显'?'雨':'零星雨') : d.modal)+'</td>'
          +'<td class="c">'+(d.hi==null?'—':Math.round(d.hi)+'°')+' / '+(d.lo==null?'—':Math.round(d.lo)+'°')+'</td>'
          +'<td class="c">'+(d.popMed==null?'缺':Math.round(d.popMed)+'%')+'</td>'
          +'<td class="c">'+(d.mmMed==null?'缺':d.mmMed.toFixed(1)+'mm')+'</td>'
          +'<td class="c">'+d.nOrg+' 家 / '+d.n+' 模</td>'
          +'<td class="c">'+d.confText+'</td>'
          +'<td class="c" style="color:'+(d.nOrg<2?'#A8422A':'#2C7351')+'">'+(d.nOrg<2?'不足':'够')+'</td></tr>';
      }).join('')
    +'</tbody></table>'
    +'<p class="acc-note">这四天各自独立判断：晴好、阴天可接受、降雨风险是三个分开的结论，不互相替代。远期只有低覆盖模型时，晴雨结论按趋势看，不当确定安排。</p>';
}

/* ---------- 各家模式矩阵（跟随当前这次预报） ---------- */
function renderMatrix(view){
  const days=((view && view.days && view.days.length)? view.days : DATA.days).slice(0,10);
  const models=Object.keys(MDL);
  const t=document.getElementById('mx');
  if(!t) return;
  const orgCols=[];
  models.forEach(m=>{
    const o=ORG[m];
    const last=orgCols[orgCols.length-1];
    if(last && last.org===o) last.span++;
    else orgCols.push({org:o,span:1});
  });
  const wRest=((100-17)/models.length).toFixed(2)+'%';
  const cg='<col style="width:9%">'+models.map(()=>'<col style="width:'+wRest+'">').join('')+'<col style="width:8%">';
  const head='<tr><th rowspan="2">日期</th>'
    +orgCols.map(o=>'<th colspan="'+o.span+'" style="border-bottom:1px solid var(--rule)">'+(ORG_NAME[o.org]||o.org)+(o.span>1?'（同一机构，只算一票）':'')+'</th>').join('')
    +'<th rowspan="2">机构/模式</th></tr>'
    +'<tr>'+models.map(m=>'<th>'+MDL[m]+'</th>').join('')+'</tr>';
  const body=days.map(d=>{
    const cells=models.map(m=>{
      const r=d.recs.find(x=>x.p===m);
      if(!r) return '<td style="color:#9AA8A2">缺</td>';
      const disagree = r.out || (RUB.cat[r.cond] && RUB.cat[r.cond]!==d.modal);
      const v='<div>'+r.cond+'</div><div class="num" style="font-size:12px;color:#485853">'+Math.round(r.hi)+'/'+Math.round(r.lo)+'</div>'
        +'<div style="font-size:10.5px;color:#6C7C77">'+(r.pop==null?'':'雨'+Math.round(r.pop)+'%')+(r.mm?' '+Math.round(r.mm*10)/10+'mm':'')+'</div>';
      return '<td'+(disagree?' style="background:#FBF0ED;color:#A8422A"':'')+'>'+v+'</td>';
    }).join('');
    return '<tr><td class="datecell">'+d.date+'<small>'+d.wd+'</small></td>'+cells
      +'<td class="ag"><b style="color:'+(d.nOrg<=2?'#A8422A':'#2C7351')+'">'+d.nOrg+' 家 / '+d.n+' 模</b></td></tr>';
  }).join('');
  t.innerHTML='<caption>'+days[0].date+' — '+days[days.length-1].date+' 逐日各家原始预报（温度 ℃）；「缺」表示这家模式当天没有数据，不按晴或无雨处理</caption><colgroup>'+cg+'</colgroup><thead>'+head+'</thead><tbody>'+body+'</tbody>';
}

/* ---------- 逐小时降雨时段（只用于详情展示，不参与判定的数据来自同一接口） ---------- */
async function fetchRainHours(view){
  if(!view || !view.days) return;
  const url='https://api.open-meteo.com/v1/forecast?latitude=23.125,23.129,23.135,23.09&longitude=113.24,113.267,113.33,113.31'
   +'&hourly=precipitation&timezone=Asia%2FShanghai&forecast_days=8&models=ecmwf_ifs025,ukmo_seamless,icon_seamless';
  let js=null;
  for(let a=0;a<2 && !js;a++){
    const ctl=new AbortController(); const to=setTimeout(function(){ctl.abort();},14000);
    try{ const r=await fetch(url,{cache:'no-store',signal:ctl.signal}); if(r.ok) js=await r.json(); }catch(e){}
    finally{ clearTimeout(to); }
  }
  if(!js) return;
  const arr=(Array.isArray(js)? js:[js]).filter(x=>x.hourly && x.hourly.time);
  if(!arr.length) return;
  const byDay={};
  const n=arr[0].hourly.time.length;
  for(let i=0;i<n;i++){
    const t=arr[0].hourly.time[i];
    const iso=t.slice(0,10), hh=parseInt(t.slice(11,13),10);
    let sum=0,cnt=0;
    arr.forEach(p=>{ const v=p.hourly.precipitation[i]; if(v!=null){ sum+=v; cnt++; } });
    if(!cnt) continue;
    const avg=sum/cnt;
    if(avg>=0.2){ (byDay[iso]=byDay[iso]||[]).push(hh); }
  }
  Object.keys(byDay).forEach(iso=>{
    const d=view.days.find(x=>x.date===iso.slice(5));
    if(!d) return;
    const hs=byDay[iso].sort((a,b)=>a-b), runs=[];
    let st=null,pr=null;
    hs.forEach(h=>{ if(st==null){st=h;} else if(h!==pr+1){ runs.push([st,pr]); st=h; } pr=h; });
    if(st!=null) runs.push([st,pr]);
    d.rainHours=runs.map(r=> ('0'+r[0]).slice(-2)+(r[0]===r[1]?' 时':'–'+('0'+(r[1]+1)).slice(-2)+' 时'));
  });
  if(typeof VIEW!=='undefined' && VIEW===view) renderTripUI(view);
}
/* ---------- 备选（放宽档：阴天也算，只要不下雨） ---------- */
function renderAlts(view){
  const wins=view.windows;
  const loose = wins.filter(w=>w.looseValid).sort((a,b)=> a.wk-b.wk || b.score-a.score);
  const el=document.getElementById('alts');
  if(!loose.length){
    el.innerHTML='<p class="cap" style="margin:0">把阴天也算进来，当前这 '+view.days.length+' 天里仍然凑不出连续四天不下雨——只能继续等。</p>';
    return;
  }
  const wkDays = w => w.days.filter(d=> d.wd==='周六'||d.wd==='周日').map(d=>d.date+' '+d.wd).join('、');
  const card=(w,label)=>'<div class="fact" style="border-left:0;padding:0 0 16px">'
    +'<div class="fn" style="font-family:\'Barlow Condensed\';font-size:12px;color:var(--ink3)">'+label+'</div>'
    +'<h3 style="margin:4px 0 6px;font-size:20px;font-family:\'Barlow Condensed\',\'Noto Sans SC\',sans-serif;font-weight:600">'+w.span.replace('—',' — ')+'</h3>'
    +'<p style="margin:0;font-size:13.2px;color:var(--ink2);line-height:1.7">'
    + (w.wk===0
        ? '四天全落在工作日，不占周末、人少价低——这是首选。'
        : '跨 '+w.wk+' 天周末（'+wkDays(w)+'），只能当备用：热门点和返程票会挤，尽量把户外压在工作日。')
    +'</p>'
    +'<p style="margin:6px 0 0;font-size:12px;color:var(--ink3)">四天都不下雨 · 其中 '+w.days.filter(d=>!d.ok).length+' 天是阴 · 整体 '+w.score.toFixed(1)+' 分 · 最差一天 '+w.min+'</p></div>';
  const rows = loose.slice(0,3).map((w,i)=> card(w, (w.wk===0? '首选 ' : '备用 ') + (i+1) + (w.wk===0? ' · 纯工作日':' · 跨周末')));
  el.innerHTML = '<div style="display:grid;grid-template-columns:'+(rows.length>1?'repeat(2,minmax(0,1fr))':'1fr')+';gap:0 34px">'
    + rows.join('') + '</div>'
    + '<p class="cap">阴天也算合格，但不算好天气：天光平，拍出来发灰，看远景也打折。四天都在工作日的排前面，跨周末的只当备用。</p>';
}

/* ---------- 行程 ---------- */

/* ---------- 行程 ---------- */
const ADV={};
const OVER_ADV=[
 '越秀公园—中山纪念堂—北京路一线：阴天不晒，走起来反而舒服；夜里转茶楼或商场。',
 '广东省博物馆（免费，需预约）+ 珠江新城：室内为主，阴天傍晚天光暗得早，夜景别排。',
 '陈家祠 + 荔湾老城：把时间花在展和吃上，茶楼坐到下午，返程再安排。',
 '沙面建筑群：阴天光线均匀，拍老洋房反而好看；留半天机动给天气变化。'
];
function autoAdv(d,i){
  if(d.ok){
    if(d.modal==='晴') return '全天户外。最高 '+Math.round(d.hi)+'℃，紫外线不弱，防晒别省。';
    return '多云，光线柔，适合长距离步行和拍照；傍晚云量会增加。';
  }
  if(d.loose && d.modal==='阴') return OVER_ADV[(i||0)%OVER_ADV.length];
  if(d.modal==='阴') return '阴天，光线平，安排室内：博物馆、祠堂、茶楼。别把夜景和远眺放在这天。';
  return '有雨（各模式最高 '+Math.round(d.popMax)+'% 概率），带伞，室内为主，室外行程留出弹性。';
}
function renderPlan(view){
  const wins=view.windows;
  const strict = wins.filter(w=>w.valid)[0];
  const loose = wins.filter(w=>w.looseValid).sort((a,b)=> a.wk-b.wk || b.score-a.score)[0];
  const rows = strict || loose;
  const planEl = document.getElementById('plan');
  if(!rows){
    planEl.innerHTML = '<p class="cap" style="margin:0">眼下没有能连走的四天，先不排。首屏一旦出现能走的日子，这里自动给出四天的安排。</p>';
    return;
  }
  const head = strict
    ? '就按 <b>'+rows.span+'</b> 走：四天都晴或多云、没有雨。预报一变，这里跟着变。'
    : '严格那档没有，按阴天也算的 <b>'+rows.span+'</b> 走：四天都不下雨'+(rows.wk?('，跨 '+rows.wk+' 天周末，只当备用'):('，全在工作日'))+'。预报一变，这里跟着变。';
  document.getElementById('plan').innerHTML = '<p class="cap" style="margin:0 0 8px">'+head+'</p>'
    + rows.days.map((d,i)=>{
    const tip = d.ok? '能过' : (d.loose? '阴 · 次档' : (d.modal==='阴'?'阴 · 过不了':'雨 · 过不了'));
    const adv = (d.ok && ADV[d.date])? ADV[d.date] : autoAdv(d,i);
    return '<div class="prow"><div class="pd">'+d.date+'<small>'+d.wd+' · '+d.modal+'</small></div>'
      +'<div class="pw">'+Math.round(d.hi)+'° / '+Math.round(d.lo)+'°<br>雨 '+Math.round(d.popMed)+'% · '+d.agree+'/'+d.n+'</div>'
      +'<div class="pc"><span class="ti">'+tip+'</span>'+adv+'</div></div>';
  }).join('');
}

/* ---------- 历史概率 ---------- */
const CLIMO = {"1":{"years":11,"hitStrict":3,"hitLoose":10,"strictYears":[2015,2019,2025],"looseYears":[2015,2017,2018,2019,2020,2021,2022,2023,2024,2025],"nDays":341,"okDays":68,"windows":3,"rateStrict":0.2727,"rateLoose":0.9091},"2":{"years":11,"hitStrict":4,"hitLoose":11,"strictYears":[2016,2017,2021,2023],"looseYears":[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],"nDays":311,"okDays":41,"windows":4,"rateStrict":0.3636,"rateLoose":1.0},"3":{"years":11,"hitStrict":3,"hitLoose":11,"strictYears":[2018,2023,2025],"looseYears":[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],"nDays":341,"okDays":21,"windows":3,"rateStrict":0.2727,"rateLoose":1.0},"4":{"years":11,"hitStrict":0,"hitLoose":9,"strictYears":[],"looseYears":[2015,2017,2018,2019,2020,2021,2022,2024,2025],"nDays":330,"okDays":16,"windows":0,"rateStrict":0.0,"rateLoose":0.8182},"5":{"years":11,"hitStrict":0,"hitLoose":8,"strictYears":[],"looseYears":[2016,2017,2018,2020,2022,2023,2024,2025],"nDays":341,"okDays":4,"windows":0,"rateStrict":0.0,"rateLoose":0.7273},"6":{"years":11,"hitStrict":0,"hitLoose":2,"strictYears":[],"looseYears":[2015,2020],"nDays":330,"okDays":1,"windows":0,"rateStrict":0.0,"rateLoose":0.1818},"7":{"years":11,"hitStrict":1,"hitLoose":6,"strictYears":[2022],"looseYears":[2015,2016,2017,2020,2022,2023],"nDays":341,"okDays":13,"windows":1,"rateStrict":0.0909,"rateLoose":0.5455},"8":{"years":11,"hitStrict":1,"hitLoose":3,"strictYears":[2015],"looseYears":[2015,2017,2022],"nDays":341,"okDays":8,"windows":1,"rateStrict":0.0909,"rateLoose":0.2727},"9":{"years":11,"hitStrict":1,"hitLoose":5,"strictYears":[2019],"looseYears":[2016,2017,2019,2021,2022],"nDays":330,"okDays":23,"windows":2,"rateStrict":0.0909,"rateLoose":0.4545},"10":{"years":11,"hitStrict":3,"hitLoose":11,"strictYears":[2017,2018,2019],"looseYears":[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],"nDays":341,"okDays":52,"windows":4,"rateStrict":0.2727,"rateLoose":1.0},"11":{"years":11,"hitStrict":1,"hitLoose":11,"strictYears":[2019],"looseYears":[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],"nDays":330,"okDays":55,"windows":1,"rateStrict":0.0909,"rateLoose":1.0},"12":{"years":11,"hitStrict":1,"hitLoose":11,"strictYears":[2020],"looseYears":[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],"nDays":341,"okDays":72,"windows":1,"rateStrict":0.0909,"rateLoose":1.0}};
const CLIMO_META={source:'Open-Meteo ERA5 再分析',point:'广州 23.13°N 113.26°E',from:'2015-01-01',to:'2025-12-31',years:11,missingDays:0};
function monthStats(m){
  const r=CLIMO[m];
  return {years:r.years, hitStrict:r.hitStrict, hitLoose:r.hitLoose,
          rateStrict:r.hitStrict/r.years, rateLoose:r.hitLoose/r.years,
          dayRate:r.okDays/r.nDays, okDays:r.okDays, nDays:r.nDays,
          windows:r.windows, strictYears:r.strictYears, looseYears:r.looseYears};
}
function renderProb(){
  const order=[11,12,1,2,3,4,5,6,7,8,9,10];
  const st={}; order.forEach(m=>st[m]=monthStats(m));
  const m0=Number(chinaParts().month);
  const cur=st[m0];
  document.getElementById('probtop').innerHTML =
    '按「晴或多云、日雨量小于 1mm」这个标准往回翻 11 年：<b>'+m0+' 月</b>一共只有 <b>'+cur.hitStrict+' 年</b>出现过至少一段四天连晴，'
    +'年份占比 <b>'+Math.round(cur.rateStrict*100)+'%</b>'
    +(cur.strictYears.length? '（'+cur.strictYears.join('、')+' 年）' : '（一次都没有）')
    +'；放宽到「阴也算、只要不下雨」，'+m0+' 月有 '+cur.hitLoose+' 年出现过，占比 '+Math.round(cur.rateLoose*100)+'%。'
    +'最好的是 1–2 月，最差的是 4–6 月。';
  const rows=order.map(m=>{
    const s=st[m];
    return '<tr><td>'+m+' 月</td>'
      +'<td class="n">'+s.years+' 年 / '+s.nDays+' 天</td>'
      +'<td class="n">'+Math.round(s.dayRate*100)+'%</td>'
      +'<td class="n">'+s.hitStrict+' / '+s.years+'</td>'
      +'<td><div style="display:flex;align-items:center;gap:8px"><span class="n" style="width:38px;display:inline-block">'+Math.round(s.rateStrict*100)+'%</span>'
        +'<span class="bar" style="flex:1"><i style="width:'+Math.round(s.rateStrict*100)+'%"></i></span></div></td>'
      +'<td class="n">'+s.hitLoose+' / '+s.years+'（'+Math.round(s.rateLoose*100)+'%）</td></tr>';
  }).join('');
  document.getElementById('probtab').innerHTML =
    '<colgroup><col style="width:10%"><col style="width:20%"><col style="width:15%"><col style="width:15%"><col style="width:22%"><col style="width:18%"></colgroup>'
    +'<thead><tr><th>月份</th><th>实际样本</th><th>晴好天占比</th><th>严格：命中年份</th><th>严格：年份占比</th><th>放宽：命中年份</th></tr></thead><tbody>'+rows+'</tbody>';
  const el=document.getElementById('probchart');
  if(window.echarts && el){
    const ch=newChart(el);
    const ms=[1,2,3,4,5,6,7,8,9,10,11,12];
    ch.setOption({
      animation:false,
      grid:{left:8,right:60,top:8,bottom:8,containLabel:true},
      xAxis:{type:'value',min:0,max:100,axisLine:{lineStyle:{color:'#C7D2CC'}},splitLine:{lineStyle:{color:'#E4EAE6'}},
        axisLabel:{color:'#6C7C77',fontSize:11,formatter:'{value}%'}},
      yAxis:{type:'category',data:ms.map(m=>m+' 月'),axisLine:{show:false},axisTick:{show:false},
        axisLabel:{color:'#485853',fontSize:11.5},inverse:true},
      series:[{type:'bar',barWidth:11,data:ms.map(m=>({value:Math.round(st[m].rateStrict*100),
        itemStyle:{color: (st[m].rateStrict>=0.25)?'#16636F': (st[m].rateStrict===0?'#D8DFDA':'#9FB6B2')}})),
        label:{show:true,position:'right',fontFamily:'Barlow Condensed',fontSize:11.5,color:'#485853',formatter:'{c}%'}}],
      tooltip:{trigger:'item',backgroundColor:'#FAFBFA',borderColor:'#C7D2CC',textStyle:{color:'#16211F',fontSize:12},
        formatter:p=>{const m=ms[p.dataIndex],s=st[m];
          return m+' 月：'+s.hitStrict+' / '+s.years+' 年有过四天连晴<br/>命中年份：'+(s.strictYears.join('、')||'无')
            +'<br/>放宽（阴也算）：'+s.hitLoose+' / '+s.years+' 年<br/>晴好天占比 '+Math.round(s.dayRate*100)+'%';}}
    });
    window.addEventListener('resize',()=>ch.resize());
  }
}

/* ---------- 真实回测：滚动当日预报 vs 实况 ---------- */
const BT_ORG={'ecmwf_ifs025':'ECMWF','ecmwf_aifs025_single':'ECMWF（AI）','ukmo_seamless':'UKMO','cma_grapes_global':'CMA','icon_seamless':'ICON','meteofrance_seamless':'Météo-FR','ENSEMBLE':'等权组合'};
const BT_LEADS=[1,3,5,7,10];
function renderAccV2(){
  const top=document.getElementById('acctop2');
  if(!top||typeof BT==='undefined') return;
  const L=BT_LEADS.filter(function(l){ return BT.leads[String(l)]; });
  const ensAt=function(l){ return BT.leads[String(l)].ens; };
  const modelsAt=function(l){ return BT.leads[String(l)].models; };
  const orgsAt=function(l){ const set={}; Object.keys(modelsAt(l)).forEach(function(k){ set[ORG[k]||k]=1; }); return Object.keys(set).length; };
  const bestAt=function(l){
    const ms=modelsAt(l); let best=null;
    Object.keys(ms).forEach(function(k){ if(!best||ms[k].bal>ms[best].bal) best=k; });
    return {key:best, v:ms[best]};
  };
  const cmp=L.map(function(l){
    const e=ensAt(l), b=bestAt(l);
    return {lead:l, orgs:orgsAt(l), ens:e, best:b, better:e.bal>b.v.bal};
  });
  const fat=cmp.filter(function(c){ return c.orgs>=2; });
  top.innerHTML='用 <b>Single Runs</b> 接口按真实起报时间回算：'+BT.from+' 到 '+BT.to+'，广州中心点，UTC 日；每个提前量 '
    +L.map(function(l){ return l+' 天 '+ensAt(l).n+' 个样本'; }).join('、')+'。'
    +'样本期 '+BT.base.days+' 天里有 '+BT.base.rainDays+' 天真的下雨（占 '+Math.round(BT.base.rate*100)+'%），所以只看「有雨命中」会被基准抬高，'
    +'表里同时给无雨日命中——这个对找晴好窗口更要紧——以及两者平均的平衡准确率。'
    +'<br>组合并不总是更好：'
    +fat.map(function(c){
        return c.lead+' 天（'+c.orgs+' 家机构）组合 '+(c.ens.bal*100).toFixed(1)+'% vs 最佳单模型 '+BT_ORG[c.best.key]+' '+(c.best.v.bal*100).toFixed(1)+'%';
      }).join('；')
    +'。所以结论按单模型写，权重也按单模型排，不宣称组合更准。';

  const t1=document.getElementById('acctab2');
  if(t1){
    const rows=L.map(function(l){
      const e=ensAt(l), b=bestAt(l);
      return '<tr><td class="n">'+l+' 天</td><td class="n">'+e.n+'</td><td class="n">'+orgsAt(l)+' 家 / '+Object.keys(modelsAt(l)).length+' 个</td>'
        +'<td class="n">'+(e.rr*100).toFixed(0)+'%</td><td class="n">'+(e.dr*100).toFixed(0)+'%</td>'
        +'<td class="n">'+(e.bal*100).toFixed(1)+'%</td>'
        +'<td class="n">'+BT_ORG[b.key]+' '+(b.v.bal*100).toFixed(1)+'%</td>'
        +'<td class="n">'+e.hi.toFixed(1)+' / '+e.lo.toFixed(1)+'℃</td></tr>';
    }).join('');
    t1.innerHTML='<colgroup><col style="width:9%"><col style="width:9%"><col style="width:15%"><col style="width:12%"><col style="width:12%"><col style="width:13%"><col style="width:16%"><col style="width:14%"></colgroup>'
      +'<thead><tr><th>提前</th><th>样本</th><th>机构/模式</th><th>组合：有雨日命中</th><th>组合：无雨日命中</th><th>组合：平衡准确率</th><th>最佳单模型（平衡）</th><th>组合：高/低温误差</th></tr></thead><tbody>'+rows+'</tbody>';
  }
  const t2=document.getElementById('accm2');
  if(t2){
    const keys=['ecmwf_ifs025','ecmwf_aifs025_single','meteofrance_seamless','ukmo_seamless','cma_grapes_global','icon_seamless'];
    const rows=keys.map(function(k){
      return '<tr><td>'+BT_ORG[k]+'</td>'+L.map(function(l){
        const m=modelsAt(l)[k];
        return '<td class="n">'+(m? (m.bal*100).toFixed(1)+'%' : '—')+'</td>';
      }).join('')+'</tr>';
    }).join('')+'<tr class="hi"><td>等权组合</td>'+L.map(function(l){ return '<td class="n">'+(ensAt(l).bal*100).toFixed(1)+'%</td>'; }).join('')+'</tr>';
    t2.innerHTML='<colgroup><col style="width:20%">'+L.map(function(){ return '<col style="width:16%">'; }).join('')+'</colgroup>'
      +'<thead><tr><th>单模型：平衡准确率</th>'+L.map(function(l){ return '<th>提前 '+l+' 天</th>'; }).join('')+'</tr></thead><tbody>'+rows+'</tbody>';
  }
  const t3=document.getElementById('accmm2');
  if(t3){
    const keys=['ecmwf_aifs025_single','ecmwf_ifs025','ukmo_seamless','meteofrance_seamless','cma_grapes_global','icon_seamless'];
    const rows=keys.map(function(k){
      return '<tr><td>'+BT_ORG[k]+'</td>'+L.map(function(l){
        const m=modelsAt(l)[k];
        return '<td class="n">'+(m&&m.mm!=null? m.mm.toFixed(1)+' mm' : '—')+'</td>';
      }).join('')+'</tr>';
    }).join('');
    t3.innerHTML='<colgroup><col style="width:20%">'+L.map(function(){ return '<col style="width:16%">'; }).join('')+'</colgroup>'
      +'<thead><tr><th>单模型：日雨量平均误差</th>'+L.map(function(l){ return '<th>提前 '+l+' 天</th>'; }).join('')+'</tr></thead><tbody>'+rows+'</tbody>';
  }
  const note=document.getElementById('accnote2');
  if(note) note.innerHTML='Brier 没有算：Single Runs 存档里六个模型的降水概率字段全部为空；Previous Runs 能取到真实概率，但只覆盖最近 7 天，样本不足，不能下结论。雨量误差单独放在第三张表，没有再用雨量折算概率去和 Brier 混比。'
    +'<br>7 天和 10 天那两栏只剩 ECMWF 与 ECMWF-AI 两个同机构产品（1 家机构），不算跨机构组合，只能看趋势。'
    +'<br>起报缺失：2026-10-01、10-17、10-18 的存档返回不可用，11-02 抓取失败；这些日期不计入样本，也没有补造。'
    +'ECMWF、ECMWF-AI 存档到 15 天，UKMO、ICON 到 7 天，CMA 到 5 天，Météo-FR 到 4 天，所以提前 5 天只剩 4 个模式、7 天只剩 2 个。';
}

/* ---------- 来源表 ---------- */
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
function renderSrc(){
  document.getElementById('srctab').innerHTML =
    '<colgroup><col style="width:34%"><col style="width:40%"><col style="width:26%"></colgroup>'
    +'<thead><tr><th>来源</th><th>取用</th><th>地址</th></tr></thead><tbody>'
    + SRC.map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+'</td>'
      +'<td><a href="'+r[3]+'" target="_blank" rel="noopener">打开</a></td></tr>').join('')
    +'</tbody>';
}

/* ---------- 实况纠偏：已过去的日子按实际天气算，不按预报 ---------- */
let ACTUAL=null;

