(() => {
  'use strict';
  const health = 9;
  const bands = [[0,4],[4,7],[7,11]];
  const bandIds = ['social','agency','life'];
  const initial = [30,12,8,45,3,14,16,42,55,60,55];
  const ageCurve = [[0,60],[4,71],[14,83],[24,86],[40,78],[55,66],[70,52],[85,38]];
  const clip = n => Math.max(0,Math.min(100,n));
  const tenth = n => Math.round(clip(n)*10)/10;
  const mean = a => a.reduce((sum,x)=>sum+x,0)/a.length;
  const seed = s => Array.from(s).reduce((n,c)=>n+c.charCodeAt(0),0);
  const blend = (a,b,t) => a+(b-a)*t;
  function ageBaseline(age) {
    const end=ageCurve.findIndex(p=>p[0]>=age);
    if (end<=0) return end===0?ageCurve[0][1]:ageCurve.at(-1)[1];
    const [a,b]=[ageCurve[end-1],ageCurve[end]];
    return blend(a[1],b[1],(age-a[0])/(b[0]-a[0]));
  }
  // Every interpolated path passes exactly through its editorial anchor scores.
  function estimate(year,anchors,key) {
    const right=anchors.findIndex(p=>p.y>=year);
    if (right>=0 && anchors[right].y===year) return anchors[right].v;
    const a=right<0?anchors.at(-1):anchors[right-1];
    const b=right<0?null:anchors[right];
    if (!a) return b.v;
    const since=year-a.y;
    const t=b?since/(b.y-a.y):0;
    // Place the main change in its recorded year; do not anticipate bereavements or a coup.
    const progress = b && !b.sudden ? 0.30*t*t : 0;
    const path=b?blend(a.v,b.v,progress):a.v;
    const envelope=b?Math.sin(Math.PI*t):Math.min(1,since/3);
    const variation=1.8*Math.sin(since*1.72+key*.40)+1.2*Math.sin(since*.83+key*.17);
    return tenth(path+envelope*variation);
  }
  function healthEstimate(e,records,key) {
    const baseline=ageBaseline(e.age);
    if(records[e.y]) return records[e.y].score;
    let result=baseline, nearest=Infinity;
    for(const [year,record] of Object.entries(records)){
      const distance=Math.abs(e.y-Number(year));
      if(distance>2 || distance>=nearest) continue;
      const weight=distance===1?.42:.14;
      result=blend(baseline,record.score,weight); nearest=distance;
    }
    return tenth(result+1.2*Math.sin(e.age*1.37+key));
  }
  function scoreMetrics(values,weights) {
    const metrics=Object.fromEntries(values.map((v,i)=>['f'+i,v]));
    const groupScores=bands.map(([start,end])=>mean(values.slice(start,end)));
    groupScores.forEach((v,i)=>{metrics[bandIds[i]]=tenth(v);});
    const weightTotal=weights.reduce((sum,n)=>sum+n,0);
    metrics.all=tenth(groupScores.reduce((sum,v,i)=>sum+v*weights[i],0)/weightTotal);
    return metrics;
  }
  window.computeLifeIndices=function computeLifeIndices(person,weights) {
    const records=window.HEALTH_RECORDS?.[person.id] || {};
    const anchors=initial.map((v,i)=>[{y:person.start,v}]);
    for(const e of person.events) {
      for (const fact of e.facts) {
        fact.f.forEach((value,i)=>{
          if(!Number.isFinite(value)) return;
          const series=anchors[i];
          const anchor={y:e.y,v:value,sudden:/逝|丧|死|遇害|失守|受挫|政变|入狱|贬|案发/.test(fact.t)};
          if(series.at(-1).y===e.y) series[series.length-1]=anchor;
          else series.push(anchor);
        });
      }
    }
    const profileSeed=seed(person.id);
    let previous=null;
    for (const e of person.events) {
      const record=records[e.y] || null;
      const healthValue=healthEstimate(e,records,profileSeed);
      const derived=anchors.map((series,i)=>i===health?healthValue:estimate(e.y,series,i+profileSeed));
      e.direct=derived.map((_,i)=>i===health?Boolean(record):e.facts.some(fact=>Number.isFinite(fact.f[i])));
      e.modelF=derived;e.healthRecord=record;
      const closes=scoreMetrics(derived,weights);
      const within=e.facts.map(fact=>scoreMetrics(derived.map((v,i)=>i===health?healthValue:(fact.f[i]??v)),weights));
      e.quotes={};
      for (const [key,close] of Object.entries(closes)){
        const open=previous?.[key] ?? close;
        const basis=[open,close,...within.map(x=>x[key])];
        const swing=1.3+Math.min(3,Math.abs(close-open)*.14)+(e.facts.length?1.0:.45);
        const phase=(e.y+profileSeed+seed(key))*.88;
        e.quotes[key]={o:open,v:close,h:tenth(Math.max(...basis)+swing*(1+.28*Math.sin(phase))),l:tenth(Math.min(...basis)-swing*(1-.28*Math.sin(phase)))};
      }
      e.m=bandIds.map(id=>closes[id]);
      previous=closes;
    }
  };
})();
