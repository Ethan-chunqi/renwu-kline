(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const groups = [
    { label: '社会处境', factors: ['身份地位','当时声望','事业进展','人际支持'], color: '#cfa777', desc: '看正式身份、同时代人的评价、事业进展，以及能从同僚或盟友处获得的支持。' },
    { label: '权力与自主', factors: ['决策实权','资源调度','行动自由'], color: '#7ea8a1', desc: '分别考察能决定多大的事、能支配多少人力物力，以及能否选择自己的行动与去处。' },
    { label: '个人生活', factors: ['衣食住居','人身安全','身体健康','家庭关系'], color: '#b99caa', desc: '看生计与住所、遭遇拘押或暴力的风险、身体状况，以及亲友团聚与离散。' }
  ];
  const weights = {
    balanced: {label:'均衡', w:[1,1,1]},
    society: {label:'侧重社会', w:[2,1,1]},
    power: {label:'侧重权力', w:[1,2,1]},
    life: {label:'侧重生活', w:[1,1,2]}
  };
  const profiles = {
    zhu:{category:'明代',seal:'洪武',place:'濠州钟离 · 今安徽凤阳',lead:'靠乡人赠地安葬父母。二十四年后，他在应天登基。',art:'《明太祖坐像》 · 明代宫廷绘像',artUrl:'https://commons.wikimedia.org/wiki/File:A_Seated_Portrait_of_Ming_Emperor_Taizu.jpg'},
    su:{category:'北宋',seal:'东坡',place:'眉州眉山 · 今四川眉山',lead:'从翰林院到海南岛，一纸诏令可以夺去官职，一支笔却始终跟着他。',art:'赵孟頫《赤壁二赋册》卷首苏轼像 · 元代绘像',artUrl:'https://commons.wikimedia.org/wiki/File:Su_shi.jpg'},
    wu:{category:'唐 · 武周',seal:'武周',place:'籍贯 · 并州文水',lead:'离宫时，她是感业寺的尼姑。四十一年后，她在洛阳登上皇位。',art:'《则天大圣皇帝像图》 · 清代后世绘像',artUrl:'https://commons.wikimedia.org/wiki/File:則天大聖皇帝像圖.jpg'}
  };

  function ageLabel(profile, year) {
    const age = year - profile.start;
    if (age === 0) return '0岁';
    // 朱元璋在当年生日前去世，卒年只经历了69周岁。
    if (profile.id === 'zhu' && year === profile.end) return '69岁';
    return (age - 1) + '–' + age + '岁';
  }
  function annualProfile(profile) {
    const byYear = new Map();
    for (const fact of [...profile.events, ...(window.YEAR_EXTRAS?.[profile.id] || [])]) {
      if (!byYear.has(fact.y)) byYear.set(fact.y,[]);
      byYear.get(fact.y).push(fact);
    }
    const events = [];
    let basis;
    for (let y = profile.start; y <= profile.end; y++) {
      const facts = byYear.get(y) || [];
      if (facts.length) basis = facts[facts.length - 1];
      events.push({
        y, age: y-profile.start, ageLabel: ageLabel(profile,y), facts, basis,
        t: facts.length ? facts.map(f=>f.t).join('、') : '沿用前次估分',
        d: facts.length ? facts.map(f=>f.d).join(' ') : '本站尚未收录这一年的独立事件。年度评分沿用 '+basis.y+' 年「'+basis.t+'」的估分。',
        f: basis.f, s: basis.s
      });
    }
    return {...profile,events,legacyYears:profile.events.map(e=>e.y)};
  }
  const people = window.PEOPLE.map(annualProfile);
  const query = new URLSearchParams(location.search);
  let person = people.find(p => p.id === query.get('person')) || people[0];
  let mode = query.get('mode') === 'line' ? 'line' : 'candle';
  let preset = Object.hasOwn(weights,query.get('weights')) ? query.get('weights') : 'balanced';
  let initialYear = person.defaultYear;
  if (/^\d+$/.test(query.get('year') || '')) {
    initialYear = Math.min(person.end, Math.max(person.start, Number(query.get('year'))));
  } else if (/^\d+$/.test(query.get('event') || '')) {
    const legacy = Math.min(person.legacyYears.length-1, Number(query.get('event')));
    initialYear = person.legacyYears[legacy];
  }
  let selected = initialYear-person.start;
  let showAllYears = false;
  let timer = null;

  const el = (tag, cls, value) => {
    const item = document.createElement(tag);
    if (cls) item.className = cls;
    if (value !== undefined) item.textContent = value;
    return item;
  };
  function sourceLink(source) {
    const a = el('a','',source.title);
    a.href = source.url; a.target = '_blank'; a.rel = 'noopener';
    return a;
  }
  function nodeScores() {
    const w = weights[preset].w;
    function scoreFactors(f) {
      const parts = [f.slice(0,4),f.slice(4,7),f.slice(7,11)];
      const means = parts.map(part => {
        const known = part.filter(Number.isFinite);
        return known.length ? known.reduce((a,b)=>a+b,0) / known.length : null;
      });
      const weightTotal = means.reduce((sum,n,i)=>sum+(n===null?0:w[i]),0);
      return {
        m: means.map(n => n === null ? null : Math.round(n)),
        v: Math.round(means.reduce((sum,n,i)=>sum+(n === null ? 0 : n*w[i]),0) / weightTotal)
      };
    }
    let previous;
    for (const e of person.events) {
      const observations = e.facts.map(fact=>scoreFactors(fact.f));
      const close = observations.length ? observations[observations.length-1] : previous;
      e.m = close.m; e.v = close.v;
      e.o = previous?.v ?? observations[0].v;
      e.h = Math.max(e.o, ...observations.map(s=>s.v));
      e.l = Math.min(e.o, ...observations.map(s=>s.v));
      previous = close;
    }
  }
  function syncURL() {
    const url = new URL(location.href);
    url.searchParams.set('person',person.id);
    url.searchParams.delete('event');
    url.searchParams.set('year',String(person.events[selected].y));
    if(mode === 'line') url.searchParams.set('mode',mode); else url.searchParams.delete('mode');
    if(preset !== 'balanced') url.searchParams.set('weights',preset); else url.searchParams.delete('weights');
    try { history.replaceState(null,'',url); } catch {}
  }
  function delta(i) { return i ? person.events[i].v - person.events[i-1].v : null; }
  function colorFor(n) { return n > 0 ? 'positive' : n < 0 ? 'negative' : 'flat'; }
  function signed(v) { return v > 0 ? '+'+v : v < 0 ? '−'+Math.abs(v) : '0'; }
  function fillTrack(value, color) {
    const track = el('span','bar-track');
    const bar = el('i'); bar.style.setProperty('--bar',color);
    bar.style.width = (value ?? 0)+'%'; track.append(bar); return track;
  }
  function renderChart() {
    window.drawLifeChart($('life-chart'),{person,selected,mode,onSelect:i=>{
      stopReplay(); choose(i);
    }});
    $('candle-btn').setAttribute('aria-pressed',mode==='candle');
    $('line-btn').setAttribute('aria-pressed',mode==='line');
  }
  function renderSelection() {
    const event = person.events[selected];
    const terminal = selected === person.events.length - 1;
    const diff = delta(selected);
    $('sample-year').replaceChildren(document.createTextNode(event.y),el('small','','年'),el('span','year-age',event.ageLabel));
    $('year-jump').value = String(event.y);
    const deltaBadge = $('score-delta');
    deltaBadge.textContent = selected===0 ? '出生年' : diff === 0 ? (terminal ? '卒年 · 持平' : '持平  0') : (diff>0 ? '上涨  ' : '下跌  ')+signed(diff);
    deltaBadge.className = colorFor(diff);
    $('event-title').textContent = event.t; $('event-desc').textContent = event.d;
    const historicAge = {
      zhu:{1368:'正月登基时为 39 周岁。',1398:'去世时为 69 周岁。'},
      su:{1101:'去世时为 64 周岁。'}
    };
    $('exact-age').textContent = historicAge[person.id]?.[event.y] || '';
    $('exact-age').hidden = !$('exact-age').textContent;
    $('group-bars').replaceChildren(...groups.map((g,i) => {
      const row = el('div','bar-row'); row.append(el('span','',g.label),fillTrack(event.m[i],g.color),el('b','',event.m[i]??'—')); return row;
    }));
    const previous=person.events[selected-1];
    const movers = groups.flatMap(g=>g.factors).map((label,i)=>({
      label, value: event.f[i], before: previous?.f[i]
    })).filter(f=>Number.isFinite(f.value)&&Number.isFinite(f.before)&&f.value!==f.before)
      .sort((a,b)=>Math.abs(b.value-b.before)-Math.abs(a.value-a.before)).slice(0,2);
    const summary=$('factor-moves');
    const title=el('span','move-title',movers.length?'分项变动最大':'评分覆盖');
    const detail=el('div','move-fields');
    if (movers.length) {
      for(const f of movers) {
        const chip=el('span','move-chip');chip.append(document.createTextNode(f.label+' '),el('b',colorFor(f.value-f.before),signed(f.value-f.before)));detail.append(chip);
      }
    } else {
      detail.append(el('span','move-chip',event.facts.length ? event.f.filter(Number.isFinite).length+' / 11 项有据可评' : '沿用 '+event.basis.y+' 年'));
    }
    summary.replaceChildren(title,detail);
    const src=person.sources[event.s]; $('event-source').href=src.url; $('event-source').title=src.title;
    $('event-source').textContent = event.facts.length ? '查阅史料' : '查看沿用来源';
    [...$('event-list').children].forEach(button=>button.setAttribute('aria-current',Number(button.dataset.index)===selected));
    renderChart();
  }
  function choose(index) { selected=index; renderSelection(); syncURL(); }
  function showList() {
    const buttons = [];
    person.events.forEach((e,i) => {
      if (!showAllYears && !e.facts.length) return;
      const diff=delta(i);
      const b=el('button','event-item'); b.type='button'; b.dataset.index=String(i);
      const change = i===0?'起点':diff!==0?signed(diff):i===person.events.length-1?'终点':'持平';
      const stamp = el('span','list-stamp'); stamp.append(el('span','y',String(e.y)),el('span','list-age',e.ageLabel));
      b.append(stamp,el('span','t',e.t),el('span','move '+colorFor(diff),change));
      b.setAttribute('aria-current',i===selected);
      b.addEventListener('click',()=>{
        stopReplay(); choose(i);
        const target=matchMedia('(max-width:760px)').matches ? $('event-panel') : $('market');
        target.scrollIntoView({block:'start'});
      });
      buttons.push(b);
    });
    $('event-list').replaceChildren(...buttons);
    $('recorded-years').setAttribute('aria-pressed',!showAllYears);
    $('all-years').setAttribute('aria-pressed',showAllYears);
    $('timeline-count').textContent=showAllYears ? '共 '+buttons.length+' 年' : buttons.length+' 个记事年份';
  }
  function renderProfile() {
    const meta=profiles[person.id];
    document.title='人物K线 · '+person.name;
    $('hero-picture').style.backgroundImage='url("./'+person.id+'.webp")';
    $('person-name').textContent=person.name; $('person-seal').textContent=meta.seal;
    $('hero-category').textContent=meta.category+'  /  '+person.role;
    $('hero-intro').textContent=meta.lead; $('person-dates').textContent=person.start+' — '+person.end; $('person-place').textContent=meta.place;
    $('year-jump').replaceChildren(...person.events.map(e=>{
      const opt=el('option','',e.y+' 年 · '+e.ageLabel); opt.value=String(e.y); return opt;
    }));
    updateWindow(); showList(); renderSelection();
  }
  function updateWindow() {
    $('chart-window').textContent=person.start+'—'+person.end+' 年 · '+person.events.length+' 根年 K · '+weights[preset].label+'权重';
  }
  function stopReplay() {
    clearInterval(timer); timer=null;
    $('replay').setAttribute('aria-pressed',false);
    $('replay').querySelector('use').setAttribute('href','#play');
    $('replay').querySelector('span').textContent='回放一生';
  }
  $('replay').addEventListener('click',()=>{
    if (timer) { stopReplay(); return; }
    choose(0);
    $('replay').setAttribute('aria-pressed',true);
    $('replay').querySelector('use').setAttribute('href','#pause');
    $('replay').querySelector('span').textContent='暂停回放';
    timer=setInterval(()=>{
      choose(selected+1);
      if (selected === person.events.length-1) stopReplay();
    },1100);
  });
  $('year-jump').addEventListener('change',()=>{ stopReplay(); choose(Number($('year-jump').value)-person.start); });
  $('all-years').addEventListener('click',()=>{showAllYears=true;showList();});
  $('recorded-years').addEventListener('click',()=>{showAllYears=false;showList();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopReplay()});
  for(const [id,type] of [['candle-btn','candle'],['line-btn','line']]){
    $(id).addEventListener('click',()=>{mode=type; renderChart(); syncURL()});
  }

  const dialog=$('dialog');
  const dialogContent=$('dialog-content');
  function showDialog(title, content) {
    stopReplay(); $('dialog-title').textContent=title; dialogContent.replaceChildren(...content);
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop=0;
  }
  function section(title,copy) {
    const node=el('section','dialog-section');
    node.append(el('h3','',title));
    if(copy)node.append(el('p','dialog-copy',copy));
    return node;
  }
  function library(){
    const cards=people.map(p=>{
      const meta=profiles[p.id];
      const b=el('button','person-choice'); b.setAttribute('aria-pressed',p.id===person.id);
      const img=el('img'); img.src='./'+p.id+'.webp'; img.alt='';
      const box=el('span'); box.append(el('strong','',p.name),el('small','',meta.category+' · '+p.role+' · '+p.dates));
      b.append(img,box); if(p.id===person.id)b.append(el('span','current-bio','正在查看'));
      b.addEventListener('click',()=>{
        if(p.id!==person.id){person=p;selected=p.events.findIndex(e=>e.y===p.defaultYear);nodeScores();renderProfile();syncURL();}
        dialog.close(); window.scrollTo({top:0});
      });return b;
    });
    showDialog('人物库',cards);
  }
  function method(){
    const intro=section('如何判定涨跌','每个公历年绘一根 K 线。根据当年已收录的事件，从三大维度、十一个因素估分。收盘分高于上年为涨，低于上年为跌。没有新记录时沿用最近一次估分。');
    const list=groups.map(g=>{
      const item=section(g.label,g.desc);
      const tags=el('div','factors'); g.factors.forEach(t=>tags.append(el('span','',t))); item.append(tags); return item;
    });
    const weightsPane=section('调整观察角度','默认三个维度等权。选择侧重项后，该维度占 50%，其余各占 25%，走势会随之重算。');
    const controls=el('div','weights');
    for(const [key,setting] of Object.entries(weights)){
      const b=el('button','',setting.label); b.setAttribute('aria-pressed',key===preset);
      b.addEventListener('click',()=>{
        preset=key;nodeScores();updateWindow();showList();renderSelection();syncURL();
        [...controls.children].forEach(n=>n.setAttribute('aria-pressed',n===b));
      }); controls.append(b);
    }weightsPane.append(controls);
    const calc=section('计分与缺项','同一维度内，有依据的因素等权平均。缺少史料的因素显示为“资料不足”，不参与平均；整组缺项时，其余组按相对权重计算。综合分在最后取整，分项覆盖变化也可能影响分数。');
    const graph=section('怎样读年 K','开盘取上一年收盘，收盘取当年最后一条记录的综合分。高低取开盘及年内已收录事件的最高、最低分。持平时实体为短横线。出生年以首条估分开盘，去世本身不扣分。');
    const ages=section('怎样读年龄','年龄按周岁计算，出生为 0 岁。一年中通常跨过一次生日，例如朱元璋在 1368 年经历 39–40 岁，正月登基时仍是 39 岁。卒年只计算在世时段，武则天按通行生年 624 年估算。');
    const context=section('外部环境','战争、灾荒、政变、政策与迁徙会改变生活或权力，在受影响的分项里体现。声望只看当时；后世评价不计入当时的处境。');
    showDialog('读图与评分口径',[intro,ages,graph,weightsPane,...list,calc,context]);
  }
  function details(){
    const e=person.events[selected], previous=person.events[selected-1];
    const first=section(e.y+' 年 · '+e.ageLabel+' · '+e.t,e.d);
    first.append(el('p','method-note','开 '+e.o+'　高 '+e.h+'　低 '+e.l+'　收 '+e.v+'  ·  '+weights[preset].label+'权重'));
    const parts=[first]; let field=0;
    groups.forEach((g,groupIndex)=>{
      const block=section(g.label+'  '+(e.m[groupIndex]??'—')+' 分');
      for(const factor of g.factors){
        const value=e.f[field], prev=previous?.f[field];
        const diff = Number.isFinite(value) && Number.isFinite(prev) ? value-prev : null;
        const row=el('div','factor-row');
        row.append(el('span','',factor),fillTrack(value,g.color),el('b','',value??'—'),el('em',colorFor(diff),value===null?'资料不足':!previous?'起点':diff===null?'新见':diff===0?'持平':signed(diff)));
        block.append(row);field++;
      }parts.push(block);
    });
    const ref=section(e.facts.length?'本年史料':'沿用 '+e.basis.y+' 年的史料');
    const refs=new Set(e.facts.length?e.facts.map(f=>f.s):[e.s]);
    for (const key of refs) ref.append(sourceLink(person.sources[key]),el('br'));
    ref.append(el('p','method-note','分项数值为本站估分，右列为与上一公历年的变化。')); parts.push(ref);
    showDialog('分项评分依据',parts);
  }
  function sources(){
    const refs=section(person.name+' · 生平史料');
    const ul=el('ul','sources-list'); Object.values(person.sources).forEach(s=>{const li=el('li');li.append(sourceLink(s));ul.append(li);});refs.append(ul);
    const meta=profiles[person.id],art=section('人物画像');art.append(sourceLink({title:meta.art,url:meta.artUrl}),el('p','method-note','古画公有领域图像，页面作局部裁切及色调处理。'));
    const form=section('抖音形式参考');form.append(sourceLink({title:'《如果苏轼是一只股票，他的人生走势会怎样》',url:'https://www.douyin.com/video/7697943009203211530'}));
    showDialog('史料与图像来源',[refs,art,form]);
  }
  $('open-library').addEventListener('click',library);$('open-method').addEventListener('click',method);
  $('open-detail').addEventListener('click',details);$('open-sources').addEventListener('click',sources);
  $('close-dialog').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  nodeScores();renderProfile();
})();
