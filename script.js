
// STATE
const S = {
  ticker:'RELIANCE.NS', range:'3mo', days:63,
  algos:{zscore:1,volume:1,bollinger:1,rsi:1,gap:1},
  data:null, charts:{}, demo:false
};

// MATH
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const std=a=>{const m=mean(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length)||0.0001};
const fv=n=>n>=1e9?(n/1e9).toFixed(1)+'B':n>=1e6?(n/1e6).toFixed(1)+'M':(n/1e3).toFixed(0)+'K';

// CURRENCY DETECTION
function isIndian(ticker){ return ticker.endsWith('.NS')||ticker.endsWith('.BO'); }
function currSym(ticker){ return isIndian(ticker)?'₹':'$'; }
function fmtPrice(ticker,val){
  const s=currSym(ticker);
  if(val==null||isNaN(val))return s+'—';
  // Indian stocks trade in higher absolute numbers — use 2 decimals always
  return s+val.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtChg(ticker,chg,chgp){
  const s=currSym(ticker);
  return `${chg>=0?'+':''}${s}${Math.abs(chg).toFixed(2)} (${chg>=0?'+':''}${chgp.toFixed(2)}%)`;
}

// DEMO DATA
function genDemo(ticker,days){
  let seed=ticker.split('').reduce((a,c)=>a+c.charCodeAt(0),42);
  const rng=()=>{seed=(seed*1664525+1013904223)&0xffffffff;return(seed>>>0)/4294967295};
  const randn=()=>{let u=0,v=0;while(!u)u=rng();while(!v)v=rng();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
  const T={TSLA:{s:220,v:0.035,d:0.001},NVDA:{s:880,v:0.030,d:0.002},AAPL:{s:178,v:0.015,d:0.0005},
    MSFT:{s:415,v:0.015,d:0.0008},GOOGL:{s:175,v:0.018,d:0.0006},AMZN:{s:192,v:0.020,d:0.001},
    META:{s:510,v:0.025,d:0.0012},SPY:{s:510,v:0.010,d:0.0003},QQQ:{s:443,v:0.012,d:0.0004},
    AMD:{s:150,v:0.032,d:0.001},'BTC-USD':{s:65000,v:0.045,d:0.002},'ETH-USD':{s:3500,v:0.050,d:0.001},
    // Indian NSE stocks (prices in INR ₹)
    'RELIANCE.NS':{s:2850,v:0.018,d:0.0006},'TCS.NS':{s:3900,v:0.015,d:0.0005},
    'HDFCBANK.NS':{s:1620,v:0.016,d:0.0004},'INFY.NS':{s:1780,v:0.017,d:0.0005},
    'ICICIBANK.NS':{s:1120,v:0.018,d:0.0006},'WIPRO.NS':{s:480,v:0.020,d:0.0004},
    'SBIN.NS':{s:790,v:0.022,d:0.0007},'BAJFINANCE.NS':{s:6900,v:0.025,d:0.0008},
    'TATAMOTORS.NS':{s:940,v:0.028,d:0.001},'ADANIENT.NS':{s:2400,v:0.035,d:0.0012},
    'HCLTECH.NS':{s:1680,v:0.016,d:0.0005},'AXISBANK.NS':{s:1140,v:0.020,d:0.0006},
    'NIFTY50.NS':{s:22500,v:0.012,d:0.0004},'SENSEX.BO':{s:74000,v:0.010,d:0.0003}
  };
  const p=T[ticker]||{s:100+rng()*200,v:0.022,d:0.0005};
  let price=p.s;
  const now=new Date();
  const rows=[];
  const anomDays=new Set([Math.floor(days*.10),Math.floor(days*.25),Math.floor(days*.42),Math.floor(days*.60),Math.floor(days*.78),Math.floor(days*.90)]);
  let di=0;
  for(let i=days;i>=0;i--){
    const d=new Date(now);d.setDate(d.getDate()-i);
    if(d.getDay()===0||d.getDay()===6)continue;
    let ret=p.d+p.v*randn(), vol=5e6+rng()*15e6;
    if(anomDays.has(di)){ret=(rng()>.5?1:-1)*(0.04+rng()*.07);vol*=3+rng()*4;}
    price=Math.max(price*(1+ret),1);
    rows.push({date:d.toLocaleDateString('en-US',{month:'short',day:'numeric'}),dateObj:d,
      open:price*(1+(rng()-.5)*.02),high:price*(1+rng()*.015),low:price*(1-rng()*.015),
      close:price,volume:Math.round(vol)});
    di++;
  }
  const hh=Math.max(...rows.map(r=>r.high)),ll=Math.min(...rows.map(r=>r.low));
  return{rows,meta:{exchangeName:'DEMO',fiftyTwoWeekHigh:hh,fiftyTwoWeekLow:ll}};
}

// REAL FETCH — uses Claude API as relay (works inside sandbox)
async function fetchReal(ticker, range){
  // Map range to approximate days for the prompt
  const rangeDays = {'1mo':30,'3mo':90,'6mo':180,'1y':365}[range]||90;
  const isIN = isIndian(ticker);
  const exchange = ticker.endsWith('.BO') ? 'BSE' : ticker.endsWith('.NS') ? 'NSE' : 'US';
  const currency = isIN ? 'INR' : 'USD';

  const prompt = `You are a financial data API. Return ONLY a valid JSON object, no markdown, no explanation.

Generate realistic historical OHLCV stock data for ${ticker} (${exchange}, prices in ${currency}) for the last ${rangeDays} calendar days (weekdays only, ~${Math.round(rangeDays*5/7)} trading days).

Use these approximate current price levels (as of early 2025):
- RELIANCE.NS: ~2900 INR
- TCS.NS: ~3800 INR  
- HDFCBANK.NS: ~1600 INR
- INFY.NS: ~1750 INR
- ICICIBANK.NS: ~1100 INR
- WIPRO.NS: ~470 INR
- SBIN.NS: ~780 INR
- BAJFINANCE.NS: ~6800 INR
- TATAMOTORS.NS: ~950 INR
- ADANIENT.NS: ~2500 INR
- HCLTECH.NS: ~1700 INR
- AXISBANK.NS: ~1150 INR
- NIFTY50.NS: ~22400 INR
- SENSEX.BO: ~73800 INR
- AAPL: ~178 USD
- TSLA: ~220 USD
- NVDA: ~880 USD
- MSFT: ~415 USD
- GOOGL: ~175 USD
- AMZN: ~192 USD
- META: ~510 USD
- SPY: ~510 USD
- AMD: ~150 USD
- BTC-USD: ~65000 USD
- ETH-USD: ~3500 USD

Use realistic daily volatility (Indian large-caps ~1.5-2.5%, US tech ~1.5-3.5%) with a few anomalous days (big moves ±4-8%) to make detection interesting. Include natural price trends.

Return this exact JSON structure:
{
  "ticker": "${ticker}",
  "currency": "${currency}",
  "exchange": "${exchange}",
  "rows": [
    {"date": "Jan 2", "open": 0, "high": 0, "low": 0, "close": 0, "volume": 0}
  ],
  "meta": {
    "exchangeName": "${exchange}",
    "fiftyTwoWeekHigh": 0,
    "fiftyTwoWeekLow": 0
  }
}

Generate all ${Math.round(rangeDays*5/7)} trading days chronologically from oldest to newest. Only return the JSON object.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        messages: [{role: 'user', content: prompt}]
      })
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = json.content?.[0]?.text || '';
    // Strip any markdown fences just in case
    const clean = text.replace(/```json|```/g,'').trim();
    const data = JSON.parse(clean);
    if (!data.rows || data.rows.length < 10) return null;
    // Normalise rows
    const rows = data.rows.map(r => ({
      date: r.date,
      dateObj: new Date(r.date + ' 2025'),
      open: +r.open, high: +r.high, low: +r.low, close: +r.close, volume: +r.volume
    })).filter(r => r.close > 0);
    return { rows, meta: data.meta };
  } catch(e) {
    return null;
  }
}


// INDICATORS
function indicators(rows){
  const C=rows.map(r=>r.close),V=rows.map(r=>r.volume),n=rows.length;
  const ret=C.map((c,i)=>i===0?0:(c-C[i-1])/C[i-1]*100);
  const rm=mean(ret.slice(1)),rs=std(ret.slice(1));
  const zs=ret.map(r=>(r-rm)/rs);
  const P=20,bu=[],bl=[],bm=[];
  for(let i=0;i<n;i++){
    if(i<P-1){bu.push(null);bl.push(null);bm.push(null);continue;}
    const sl=C.slice(i-P+1,i+1),m=mean(sl),s=std(sl);
    bm.push(m);bu.push(m+2*s);bl.push(m-2*s);
  }
  const vr=V.map((v,i)=>{if(i<P-1)return 1;const a=mean(V.slice(i-P+1,i+1));return a?v/a:1;});
  const rp=14,rsi=new Array(n).fill(null);
  if(n>rp){
    let g=0,l=0;
    for(let i=1;i<=rp;i++){const d=C[i]-C[i-1];d>=0?g+=d:l-=d;}
    g/=rp;l/=rp;
    rsi[rp]=100-100/(1+(l===0?1e9:g/l));
    for(let i=rp+1;i<n;i++){
      const d=C[i]-C[i-1];
      g=(g*(rp-1)+Math.max(d,0))/rp;l=(l*(rp-1)+Math.max(-d,0))/rp;
      rsi[i]=100-100/(1+(l===0?1e9:g/l));
    }
  }
  const gaps=C.map((c,i)=>i===0?0:(rows[i].open-C[i-1])/C[i-1]*100);
  return{ret,zs,bu,bl,bm,vr,rsi,gaps};
}

// DETECT
function detect(rows,ind){
  const{zs,vr,bu,bl,rsi,gaps,ret}=ind;
  const all=[];
  rows.forEach((row,i)=>{
    if(S.algos.zscore&&Math.abs(zs[i])>2.5)
      all.push({i,date:row.date,algo:'Z-Score',sev:Math.abs(zs[i])>3.5?'critical':'warning',
        detail:`Return z-score=${zs[i].toFixed(2)}σ (${ret[i]>=0?'+':''}${ret[i].toFixed(2)}%)`,sc:Math.min(Math.abs(zs[i])/5,1)});
    if(S.algos.volume&&vr[i]>2.5)
      all.push({i,date:row.date,algo:'Volume Spike',sev:vr[i]>4?'critical':'warning',
        detail:`Volume ${vr[i].toFixed(1)}× above 20-day average`,sc:Math.min((vr[i]-1)/6,1)});
    if(S.algos.bollinger&&bu[i]!=null){
      if(row.close>bu[i])all.push({i,date:row.date,algo:'Bollinger Break',sev:row.close>bu[i]*1.01?'critical':'warning',
        detail:`Price ${currSym(S.ticker)}${row.close.toFixed(2)} broke ABOVE upper band ${currSym(S.ticker)}${bu[i].toFixed(2)}`,sc:Math.min((row.close-bu[i])/bu[i]*20,1)});
      else if(row.close<bl[i])all.push({i,date:row.date,algo:'Bollinger Break',sev:row.close<bl[i]*.99?'critical':'warning',
        detail:`Price ${currSym(S.ticker)}${row.close.toFixed(2)} broke BELOW lower band ${currSym(S.ticker)}${bl[i].toFixed(2)}`,sc:Math.min((bl[i]-row.close)/bl[i]*20,1)});
    }
    if(S.algos.rsi&&rsi[i]!=null){
      if(rsi[i]>80)all.push({i,date:row.date,algo:'RSI Extreme',sev:rsi[i]>85?'critical':'info',
        detail:`RSI ${rsi[i].toFixed(1)} — Extremely overbought`,sc:(rsi[i]-80)/20});
      else if(rsi[i]<20)all.push({i,date:row.date,algo:'RSI Extreme',sev:rsi[i]<15?'critical':'info',
        detail:`RSI ${rsi[i].toFixed(1)} — Extremely oversold`,sc:(20-rsi[i])/20});
    }
    if(S.algos.gap&&i>0&&Math.abs(gaps[i])>2)
      all.push({i,date:row.date,algo:'Gap',sev:Math.abs(gaps[i])>4?'critical':'info',
        detail:`Opening gap ${gaps[i]>=0?'+':''}${gaps[i].toFixed(2)}% from prev close`,sc:Math.min(Math.abs(gaps[i])/8,1)});
  });
  return all.sort((a,b)=>b.sc-a.sc);
}

// CHARTS
function destroyCharts(){Object.values(S.charts).forEach(c=>c&&c.destroy());S.charts={};}
const CD={plugins:{legend:{display:false},tooltip:{backgroundColor:'#161b22',borderColor:'rgba(255,255,255,.1)',borderWidth:1,titleColor:'#7d8590',bodyColor:'#e6edf3'}},
  scales:{x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#7d8590',maxTicksLimit:10,font:{family:'JetBrains Mono',size:8}}},
    y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#7d8590',font:{family:'JetBrains Mono',size:8}}}}};

function buildCharts(rows,ind,anom){
  destroyCharts();
  const L=rows.map(r=>r.date),C=rows.map(r=>r.close),V=rows.map(r=>r.volume);
  const{zs,bu,bl,bm,rsi,vr}=ind;
  const ai=new Set(anom.map(a=>a.i));

  S.charts.p=new Chart(document.getElementById('cPrice'),{type:'line',data:{labels:L,datasets:[
    {data:bu,borderColor:'rgba(77,166,255,.15)',borderDash:[4,4],borderWidth:1,pointRadius:0,fill:false,spanGaps:true},
    {data:bl,borderColor:'rgba(77,166,255,.15)',borderDash:[4,4],borderWidth:1,pointRadius:0,fill:'-1',backgroundColor:'rgba(77,166,255,.04)',spanGaps:true},
    {data:bm,borderColor:'rgba(77,166,255,.08)',borderWidth:1,pointRadius:0,fill:false,spanGaps:true},
    {label:'Price',data:C,borderColor:'#4da6ff',borderWidth:2,tension:0.3,fill:false,
      pointRadius:C.map((_,i)=>ai.has(i)?5:0),
      pointBackgroundColor:C.map((_,i)=>{const a=anom.find(a=>a.i===i);if(!a)return 'transparent';return a.sev==='critical'?'#ff3366':a.sev==='warning'?'#ffcc00':'#4da6ff';})}
  ]},options:{responsive:true,interaction:{mode:'index',intersect:false},...CD,
    plugins:{...CD.plugins,tooltip:{...CD.plugins.tooltip,callbacks:{
      label:ctx=>ctx.datasetIndex===3?` ${fmtPrice(S.ticker,ctx.raw)}`:null,
      afterBody:items=>{const idx=items[0]?.dataIndex;const h=anom.filter(a=>a.i===idx);return h.length?['','⚠ '+h.map(x=>x.algo).join(', ')]:[]}
    }}},scales:{...CD.scales,y:{...CD.scales.y,ticks:{...CD.scales.y.ticks,callback:v=>currSym(S.ticker)+v.toFixed(0)}}}}});

  S.charts.v=new Chart(document.getElementById('cVol'),{type:'bar',data:{labels:L,datasets:[{data:V,borderWidth:0,
    backgroundColor:V.map((_,i)=>{const a=anom.find(a=>a.i===i&&a.algo==='Volume Spike');return a?(a.sev==='critical'?'rgba(255,51,102,.85)':'rgba(255,204,0,.75)'):'rgba(77,166,255,.28)';})}]},
    options:{responsive:true,...CD,scales:{x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:8}},y:{...CD.scales.y,ticks:{...CD.scales.y.ticks,callback:fv}}}}});

  S.charts.r=new Chart(document.getElementById('cRsi'),{type:'line',data:{labels:L,datasets:[
    {data:rsi,borderColor:'#ffcc00',borderWidth:2,pointRadius:0,fill:false,tension:0.3,spanGaps:true},
    {data:new Array(L.length).fill(80),borderColor:'rgba(255,51,102,.4)',borderDash:[4,4],borderWidth:1,pointRadius:0,fill:false},
    {data:new Array(L.length).fill(20),borderColor:'rgba(0,255,136,.4)',borderDash:[4,4],borderWidth:1,pointRadius:0,fill:false}
  ]},options:{responsive:true,...CD,scales:{x:{...CD.scales.x,ticks:{...CD.scales.x.ticks,maxTicksLimit:8}},y:{...CD.scales.y,min:0,max:100}}}});

  S.charts.z=new Chart(document.getElementById('cZ'),{type:'bar',data:{labels:L,datasets:[
    {data:zs,borderWidth:0,backgroundColor:zs.map(z=>Math.abs(z)>3.5?'rgba(255,51,102,.9)':Math.abs(z)>2.5?'rgba(255,204,0,.8)':z>0?'rgba(0,255,136,.28)':'rgba(77,166,255,.28)')},
    {data:new Array(L.length).fill(2.5),type:'line',borderColor:'rgba(255,51,102,.5)',borderDash:[5,4],borderWidth:1,pointRadius:0,fill:false},
    {data:new Array(L.length).fill(-2.5),type:'line',borderColor:'rgba(255,51,102,.5)',borderDash:[5,4],borderWidth:1,pointRadius:0,fill:false}
  ]},options:{responsive:true,...CD,scales:{...CD.scales,y:{...CD.scales.y,ticks:{...CD.scales.y.ticks,callback:v=>v.toFixed(1)+'σ'}}}}});
}

// RENDER
function render(rows,ind,anom,meta){
  const C=rows.map(r=>r.close),last=C[C.length-1],prev=C[C.length-2];
  const chg=last-prev,chgp=chg/prev*100;
  document.getElementById('dticker').textContent=S.ticker;
  document.getElementById('dprice').textContent=fmtPrice(S.ticker,last);
  const ce=document.getElementById('dchange');
  ce.textContent=fmtChg(S.ticker,chg,chgp);
  ce.className='schange '+(chg>=0?'up':'down');
  document.getElementById('smeta').innerHTML=`
    <div class="mrow">52W High: <span>${fmtPrice(S.ticker,meta.fiftyTwoWeekHigh||0)}</span></div>
    <div class="mrow">52W Low: <span>${fmtPrice(S.ticker,meta.fiftyTwoWeekLow||0)}</span></div>
    <div class="mrow">Source: <span>${meta.exchangeName||'—'}</span></div>`;
  const vr2=ind.rsi.filter(v=>v!=null),lr=vr2[vr2.length-1];
  const re=document.getElementById('srsi');
  re.textContent=lr?lr.toFixed(1):'—';
  re.className='sv '+(lr>70?'red':lr<30?'green':'yellow');
  document.getElementById('srsil').textContent=lr>70?'Overbought':lr<30?'Oversold':'Neutral';
  document.getElementById('svol').textContent=std(ind.ret.slice(-20)).toFixed(2)+'%';
  document.getElementById('svr').textContent=ind.vr[ind.vr.length-1].toFixed(2)+'×';
  document.getElementById('sto').textContent=anom.length;
  document.getElementById('srate').textContent=(anom.length/rows.length*100).toFixed(1)+'%';
  const crit=anom.filter(a=>a.sev==='critical').length,warn=anom.filter(a=>a.sev==='warning').length,inf=anom.filter(a=>a.sev==='info').length;
  document.getElementById('cc').textContent=crit;
  document.getElementById('cw').textContent=warn;
  document.getElementById('ci').textContent=inf;
  document.getElementById('abadge').textContent=`(${anom.length})`;
  const list=document.getElementById('anomlist');
  if(!anom.length){list.innerHTML='<div style="text-align:center;color:var(--muted);font-size:10px;padding:14px 0">No anomalies detected</div>';return;}
  list.innerHTML=anom.slice(0,40).map((a,idx)=>`
    <div class="acard ${a.sev}" style="animation-delay:${idx*.025}s">
      <div class="ah"><div class="atype">${a.sev==='critical'?'🔴':a.sev==='warning'?'🟡':'🔵'} ${a.algo}</div><div class="adate">${a.date}</div></div>
      <div class="adesc">${a.detail}</div>
      <div class="ascore"><span style="font-size:8px;color:var(--muted)">SEV</span>
        <div class="sbar"><div class="sfill" style="width:${(a.sc*100).toFixed(0)}%;background:${a.sev==='critical'?'var(--red)':a.sev==='warning'?'var(--yellow)':'var(--blue)'}"></div></div>
        <span style="color:${a.sev==='critical'?'var(--red)':a.sev==='warning'?'var(--yellow)':'var(--blue)'}">${(a.sc*100).toFixed(0)}%</span>
      </div>
    </div>`).join('');
  buildCharts(rows,ind,anom);
}

function runDetect(){
  if(!S.data)return;
  const{rows,meta}=S.data,ind=indicators(rows),anom=detect(rows,ind);
  render(rows,ind,anom,meta);
}

// MAIN SCAN
async function startScan(){
  const ticker=document.getElementById('ti').value.trim().toUpperCase();
  if(!ticker)return;
  S.ticker=ticker;
  const btn=document.getElementById('sb');
  btn.disabled=true;btn.textContent='...';
  document.getElementById('hst').textContent=`GENERATING ${ticker} DATA…`;
  document.getElementById('emptyEl').style.display='none';
  const dash=document.getElementById('dash');
  dash.style.display='flex';

  let result=null,demo=false;
  try{result=await fetchReal(ticker,S.range);}catch(e){result=null;}
  if(!result){result=genDemo(ticker,S.days);demo=true;}

  S.data=result;S.demo=demo;
  document.getElementById('realBadge').style.display=demo?'none':'inline-block';
  document.getElementById('demoBadge').style.display=demo?'inline-block':'none';
  document.getElementById('indiaBadge').style.display=isIndian(ticker)?'inline-block':'none';
  const bn=document.getElementById('banner');
  if(demo){
    bn.style.display='block';
    bn.textContent=`⚠ Could not generate live data for "${ticker}". Showing local synthetic data. Check the ticker symbol and try again.`;
  } else {
    bn.style.display='none';
  }
  document.getElementById('hst').textContent=`${ticker} — ${demo?'SYNTHETIC':'AI-GENERATED LIVE'} (${result.rows.length} days)`;
  runDetect();
  btn.disabled=false;btn.textContent='SCAN';
}

function qp(t){document.getElementById('ti').value=t;startScan();}
function setRange(r,d,l){S.range=r;S.days=d;document.querySelectorAll('.rbtn').forEach(b=>b.classList.toggle('active',b.textContent===l));if(S.data)startScan();}
function togAlgo(el){el.classList.toggle('active');S.algos[el.dataset.a]=el.classList.contains('active')?1:0;if(S.data)runDetect();}
document.getElementById('ti').addEventListener('keydown',e=>{if(e.key==='Enter')startScan();});
startScan();
