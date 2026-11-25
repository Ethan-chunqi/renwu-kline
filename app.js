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

  const people = window.PEOPLE;
  const query = new URLSearchParams(location.search);
  let person = people.find(p => p.id === query.get('person')) || people[0];
  let mode = query.get('mode') === 'line' ? 'line' : 'candle';
  let preset = Object.hasOwn(weights,query.get('weights')) ? query.get('weights') : 'balanced';
  let selected = person.events.findIndex(e => e.y === person.defaultYear);
  if (/^\d+$/.test(query.get('event') || '')) selected = Math.min(person.events.length - 1, Number(query.get('event')));
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
    for (const e of person.events) {
      const parts = [e.f.slice(0,4),e.f.slice(4,7),e.f.slice(7,11)];
      const means = parts.map(part => {
        const known = part.filter(Number.isFinite);
        return known.length ? known.reduce((a,b)=>a+b,0) / known.length : null;
      });
      const weightTotal = means.reduce((sum,n,i)=>sum+(n===null?0:w[i]),0);
      e.m = means.map(n => n === null ? null : Math.round(n));
      e.v = Math.round(means.reduce((sum,n,i)=>sum+(n === null ? 0 : n*w[i]),0) / weightTotal);
    }
  }
  function syncURL() {
    const url = new URL(location.href);
    url.searchParams.set('person',person.id);
    url.searchParams.set('event',String(selected));
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
    $('sample-year').replaceChildren(document.createTextNode(event.y),el('small','','年'));
    const deltaBadge = $('score-delta');
    deltaBadge.textContent = terminal ? '生平终点' : selected===0 ? '生平起点' : diff === 0 ? '持平  0' : (diff>0 ? '上涨  ' : '下跌  ')+signed(diff);
    deltaBadge.className = colorFor(diff);
    $('event-title').textContent = event.t; $('event-desc').textContent = event.d;
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
      detail.append(el('span','move-chip',event.f.filter(Number.isFinite).length+' / 11 项有据可评'));
    }
    summary.replaceChildren(title,detail);
    const src=person.sources[event.s]; $('event-source').href=src.url; $('event-source').title=src.title;
    [...$('event-list').children].forEach((button,i)=>button.setAttribute('aria-current',i===selected));
    renderChart();
  }
  function choose(index) { selected=index; renderSelection(); syncURL(); }
  function showList() {
    const buttons = person.events.map((e,i) => {
      const diff=delta(i);
      const b=el('button','event-item'); b.type='button';
      const change = i===0?'起点':i===person.events.length-1?'终点':diff===0?'持平':signed(diff);
      b.append(el('span','y',String(e.y)),el('span','t',e.t),el('span','move '+colorFor(diff),change));
      b.addEventListener('click',()=>{
        stopReplay(); choose(i);
        const target=matchMedia('(max-width:760px)').matches ? $('event-panel') : $('market');
        target.scrollIntoView({block:'start'});
      });
      return b;
    });
    $('event-list').replaceChildren(...buttons);
  }
  function renderProfile() {
    const meta=profiles[person.id];
    document.title='人物K线 · '+person.name;
    $('hero-picture').style.backgroundImage='url("./'+person.id+'.webp")';
    $('person-name').textContent=person.name; $('person-seal').textContent=meta.seal;
    $('hero-category').textContent=meta.category+'  /  '+person.role;
    $('hero-intro').textContent=meta.lead; $('person-dates').textContent=person.start+' — '+person.end; $('person-place').textContent=meta.place;
    $('timeline-count').textContent='共 '+person.events.length+' 个节点';
    updateWindow(); showList(); renderSelection();
  }
  function updateWindow() {
    $('chart-window').textContent=person.start+'—'+person.end+' 年  ·  '+weights[preset].label+'权重';
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
    },3300);
  });
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
    const intro=section('如何判定涨跌','每个历史节点按三大维度、十一个因素估分，范围为 0–100。分数表达对已知处境的解读。新节点综合分高于上一节点为涨，低于上一节点为跌。');
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
    const graph=section('怎样读这张图','每根 K 线对应一个事件，横轴按事件等距排列。实体连接前后综合分，影线延伸至实体及当前三大维度的最高与最低分。出生和去世用圆点标记，终点沿用最后一个生前节点。');
    const context=section('外部环境','战争、灾荒、政变、政策与迁徙会改变生活或权力，在受影响的分项里体现。声望只看当时；后世评价不计入当时的处境。');
    showDialog('读图与评分口径',[intro,weightsPane,...list,calc,graph,context]);
  }
  function details(){
    const e=person.events[selected], previous=person.events[selected-1];
    const first=section(e.y+' 年 · '+e.t,e.d);
    first.append(el('p','method-note','综合 '+e.v+' 分  ·  '+weights[preset].label+'权重  ·  '+e.f.filter(Number.isFinite).length+'/11 项有据可评'));
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
    const ref=section('本节点史料'); ref.append(sourceLink(person.sources[e.s]),el('p','method-note','链接供核对事件。分项数值为本站估分，右列为与上一节点的变化。')); parts.push(ref);
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
