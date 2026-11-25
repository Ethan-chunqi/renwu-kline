(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const charts = new WeakMap();
  const C = {
    up: '#f48677', down: '#6fc3ad', flat: '#a7b7b1', text: '#e1e9e4',
    muted: '#99aaa5', grid: '#2a3733', major: '#394842', gold: '#d8be91',
    tag: '#d0dbd5', ink: '#14221e'
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const score = v => clamp(Number(v) || 0, 0, 100);
  const fixed = v => Number(v).toFixed(1);
  const signed = v => v > 0 ? '+' + fixed(v) : v < 0 ? '−' + fixed(-v) : '0.0';
  const age = e => e.ageLabel || (Number.isFinite(e.age) ? '年差' + e.age : '年龄未详');
  const tone = (open, close) => close > open ? C.up : close < open ? C.down : C.flat;

  const milestones = {
    zhu: [[1344,'入寺'],[1368,'称帝'],[1392,'丧子']],
    su: [[1079,'乌台诗案'],[1086,'入翰林']],
    wu: [[690,'称帝'],[705,'退位']]
  };

  function svg(tag, attrs = {}, text) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function html(tag, cls, text) {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const line = (x1, y1, x2, y2, stroke, attrs = {}) => svg('line', {x1, y1, x2, y2, stroke, ...attrs});

  function installStyles() {
    if (document.getElementById('annual-chart-style')) return;
    const node = document.createElement('style');
    node.id = 'annual-chart-style';
    node.textContent = `
      .annual-chart{min-width:0;max-width:100%;font-family:inherit;font-variant-numeric:tabular-nums}
      .annual-chart svg{display:block;user-select:none;-webkit-user-select:none}
      .annual-summary{display:flex;align-items:baseline;flex-wrap:wrap;gap:5px 9px;margin:1px 0 5px;min-width:0;line-height:1.45}
      .annual-date{color:#f1f1e8;font-weight:650;font-size:16px;white-space:nowrap;letter-spacing:.015em}
      .annual-age{color:#c3cdc6;font-size:12px;white-space:nowrap}
      .annual-event{flex:1;min-width:56px;color:#bdc9c1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .annual-values{display:flex;align-items:baseline;flex-wrap:wrap;gap:3px clamp(10px,1.15vw,18px);padding-bottom:9px;line-height:19px}
      .annual-stat{display:inline-flex;align-items:baseline;gap:4px;white-space:nowrap;font-size:11px;color:#a4b3ab}
      .annual-stat b{font-family:var(--mono,"SFMono-Regular",Consolas,monospace);color:#dfe7e0;font-weight:550;font-size:12px;letter-spacing:-.025em}
      .annual-detail{width:100%;max-width:100%;outline:0;cursor:crosshair;touch-action:pan-y;overflow:hidden}
      .annual-detail:focus-visible{outline:1px solid #c6aa7e;outline-offset:1px;border-radius:3px}
      .annual-detail[data-dragging=true]{cursor:grabbing}
      .annual-toolbar-end,.annual-ranges,.annual-rangebar,.annual-nav{display:flex;align-items:center}
      .annual-rangebar{justify-content:space-between;gap:6px;padding:7px 0 5px;border-top:1px solid #2d3b34}
      .annual-ranges{gap:3px;flex:none}
      .annual-ranges button{position:relative;padding:5px 9px;border:0;background:transparent;border-radius:3px;color:#a4b3aa;font-size:12px;line-height:19px;cursor:pointer;white-space:nowrap}
      .annual-ranges button[aria-pressed=true]{background:#26372f;color:#e4eee6;font-weight:650;box-shadow:inset 0 0 0 1px #42574a}
      .annual-ranges button:not([aria-pressed=true]):hover{color:#eef2e9;background:#202e27}
      .annual-toolbar-end{gap:7px;min-width:0}
      .annual-visible{font:11px var(--mono,monospace);color:#a2b0a6;white-space:nowrap}
      .annual-nav{gap:2px}.annual-nav[hidden]{display:none}
      .annual-nav button{display:grid;place-items:center;height:26px;width:24px;padding:0;border:0;background:transparent;color:#c9d2c8;cursor:pointer}
      .annual-nav button:disabled{opacity:.28;cursor:default}
      .annual-chart button:focus-visible{outline:1px solid #c6aa7e;outline-offset:1px}
      .annual-empty{padding:24px;text-align:center;color:#a7b4aa}
      @media(max-width:490px){.annual-rangebar{gap:1px}.annual-values{column-gap:9px}.annual-stat{gap:3px}.annual-ranges{gap:1px}.annual-ranges button{padding:4px 6px}.annual-toolbar-end{gap:2px}.annual-visible{font-size:10px}.annual-nav{gap:0}.annual-nav button{width:20px}.annual-chart-toolbar{gap:3px}}
      @media(prefers-reduced-motion:no-preference){.annual-ranges button{transition:background-color .13s,color .13s}}
    `;
    document.head.append(node);
  }

  function ohlc(events, i) {
    const e = events[i], c = score(e.v);
    const o = Number.isFinite(e.o) ? score(e.o) : i ? score(events[i-1].v) : c;
    const h = Math.max(o, c, Number.isFinite(e.h) ? score(e.h) : c);
    const l = Math.min(o, c, Number.isFinite(e.l) ? score(e.l) : c);
    return {o, h, l, c};
  }

  function priceScale(bars, full) {
    if (full) return {low:0, high:100, step:20};
    const min = Math.min(...bars.map(b=>b.l)), max = Math.max(...bars.map(b=>b.h));
    const pad = Math.max(1.5, (max-min)*.09);
    const a = Math.max(0, min-pad), b = Math.min(100, max+pad);
    const raw = (b-a)/5;
    const exp = 10**Math.floor(Math.log10(Math.max(.1,raw)));
    const step = [1,2,2.5,5,10].map(n=>n*exp).find(n=>n>=raw) || 10*exp;
    return {low:Math.max(0,Math.floor(a/step)*step),high:Math.min(100,Math.ceil(b/step)*step),step};
  }

  function yearTicks(events, start, count, width) {
    if (count < 3) return Array.from({length:count}, (_,k)=>k);
    const maxTicks = Math.max(3,Math.floor(width/69));
    if (count <= maxTicks) return Array.from({length:count}, (_,k)=>k);
    const step = [2,5,10,20,25,50,100].find(s => s >= (count - 1)/(maxTicks-1)) || 100;
    const gap = Math.min(52,width/Math.max(2,maxTicks-1)*.75);
    const cells = width/count;
    const ticks = [0];
    for (let k=1;k<count-1;k++) {
      if (events[start+k].y % step === 0 && (k-ticks[ticks.length-1])*cells>=gap && (count-1-k)*cells>=gap) ticks.push(k);
    }
    ticks.push(count-1);
    return ticks;
  }

  function arrow(dir) {
    const btn = html('button','');
    btn.type='button';
    btn.title=dir<0?'向前浏览年份':'向后浏览年份';btn.setAttribute('aria-label',btn.title);
    const icon=svg('svg',{width:14,height:14,viewBox:'0 0 16 16','aria-hidden':true});
    icon.append(svg('path',{d:dir<0?'M10 3.5 5.5 8 10 12.5':'M6 3.5 10.5 8 6 12.5',fill:'none',stroke:'currentColor','stroke-width':1.5,'stroke-linecap':'round','stroke-linejoin':'round'}));
    btn.append(icon);
    return btn;
  }

  class AnnualChart {
    constructor(container) {
      installStyles();
      this.container=container;
      this.root=html('div','annual-chart');
      this.empty=html('p','annual-empty','暂无年度数据');
      const summary=html('div','annual-summary');
      this.date=html('span','annual-date');this.age=html('span','annual-age');this.title=html('span','annual-event');
      summary.append(this.date,this.age,this.title);
      const values=html('div','annual-values');
      this.values={};
      for (const [key,label] of [['o','开'],['h','高'],['l','低'],['c','收'],['d','涨跌']]){
        const item=html('span','annual-stat'), num=html('b','');
        item.append(html('span','',label),num); values.append(item); this.values[key]=num;
      }
      this.svg=svg('svg',{class:'annual-detail',role:'slider',tabindex:0,focusable:true,'aria-orientation':'horizontal','aria-keyshortcuts':'ArrowLeft ArrowRight Home End PageUp PageDown'});
      const rangebar=html('div','annual-rangebar'), ranges=html('div','annual-ranges');
      ranges.setAttribute('role','group');ranges.setAttribute('aria-label','时间范围');
      this.buttons={};
      for(const [id,label] of [['all','全生涯'],['recent','近20年'],['detail','逐年详看']]){
        const btn=html('button','',label);btn.type='button';btn.addEventListener('click',()=>this.setRange(id));
        ranges.append(btn);this.buttons[id]=btn;
      }
      const end=html('div','annual-toolbar-end');
      this.visible=html('span','annual-visible');
      this.nav=html('div','annual-nav');this.prev=arrow(-1);this.next=arrow(1);
      this.prev.addEventListener('click',()=>this.page(-1));this.next.addEventListener('click',()=>this.page(1));
      this.nav.append(this.prev,this.next);end.append(this.visible,this.nav);
      rangebar.append(ranges,end);this.root.append(summary,values,this.svg,rangebar);
      container.replaceChildren(this.root);
      this.events=[];this.range='all';this.start=0;this.count=0;this.hover=null;this.drag=null;this.wheel=0;this.preventClick=false;
      this.svg.addEventListener('keydown',e=>this.handleKey(e));
      this.svg.addEventListener('pointerdown',e=>{
        const p=this.position(e);
        if(e.button!==0 || p.x<0 || p.x>this.plotRight)return;
        this.preventClick=false;
        this.drag={x:e.clientX,y:e.clientY,start:this.start,id:e.pointerId,active:false};
      });
      this.svg.addEventListener('pointermove',e=>this.pointerMove(e));
      this.svg.addEventListener('pointerleave',()=>{if(!this.drag?.active)this.clearHover()});
      this.svg.addEventListener('pointerup',()=>{
        const panned=this.drag?.active;
        this.drag=null;this.svg.removeAttribute('data-dragging');
        if(panned)this.commitPan();
      });
      this.svg.addEventListener('pointercancel',()=>{this.drag=null;this.svg.removeAttribute('data-dragging');this.clearHover()});
      this.svg.addEventListener('click',e=>{
        const p=this.position(e);
        if(!this.preventClick && p.x>=0 && p.x<=this.plotRight && this.events.length)this.select(this.eventAt(e,p.x));
      });
      this.svg.addEventListener('wheel',e=>{
        if(this.count>=this.events.length || (!e.shiftKey && Math.abs(e.deltaX)<=Math.abs(e.deltaY)))return;
        const delta=e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        if(!delta) return;
        e.preventDefault();this.wheel+=delta;
        const threshold=Math.max(15,this.cell*.65);
        const shift=Math.trunc(this.wheel/threshold);
        if(shift){this.wheel-=shift*threshold;this.moveStart(this.start+shift);this.commitPan();}
      },{passive:false});
      this.observer=new ResizeObserver(entries=>{
        if(!container.isConnected) return this.observer.disconnect();
        const width=Math.round(entries[0].contentRect.width);
        if(width>0&&width!==this.width&&this.events.length){this.width=width;this.windowFor(this.selected,true);this.build();}
      });
      this.observer.observe(container);
    }

    update(options) {
      const person=options.person||{}, events=person.events||[], mode=options.mode==='line'?'line':'candle';
      const index=clamp(Math.trunc(options.selected)||0,0,Math.max(0,events.length-1));
      const signature=events.map(e=>[e.y,e.o,e.h,e.l,e.v].join('/')).join('|');
      const width=Math.max(1,this.container.clientWidth), personChanged=this.person!==person, moved=index!==this.selected;
      const metric=options.metric||'all';
      const changed=personChanged||width!==this.width||mode!==this.mode||signature!==this.signature||metric!==this.metric;
      this.metric=metric;
      this.person=person;this.events=events;this.mode=mode;this.signature=signature;this.width=width;
      this.selected=index;this.onSelect=options.onSelect;this.hover=null;
      this.root.hidden=!events.length;
      if(!events.length){this.container.append(this.empty);return;}
      this.empty.remove();
      if(personChanged)this.range='all';
      const shifted=this.windowFor(index,personChanged||!this.count);
      if(changed||shifted)this.build();
      else if(moved||this.markers)this.paint();
    }

    windowFor(index, reset=false) {
      const previous=this.start, before=this.count, total=this.events.length;
      const detailCount=Math.max(3, Math.floor((this.width-48)/55));
      this.count=Math.min(total,this.range==='all'?total:this.range==='recent'?20:detailCount);
      if(this.range==='all')this.start=0;
      else if(reset||index<this.start||index>=this.start+this.count){
        this.start=this.range==='recent'?index-this.count+1:index-Math.floor(this.count/2);
      }
      this.start=clamp(this.start,0,total-this.count);
      return previous!==this.start||before!==this.count;
    }

    setRange(range){
      if(range===this.range)return;
      this.range=range;this.hover=null;this.windowFor(this.selected,true);this.build();
    }

    select(index){
      this.selected=index;this.hover=null;
      if(this.windowFor(index))this.build();else this.paint();
      if(typeof this.onSelect==='function')this.onSelect(index);
    }

    moveStart(start) {
      const next=clamp(start,0,this.events.length-this.count);
      if(next===this.start)return;
      this.start=next;this.hover=null;this.build();
    }
    commitPan(){
      if(this.selected<this.start||this.selected>=this.start+this.count)this.select(clamp(this.selected,this.start,this.start+this.count-1));
    }
    page(direction){this.moveStart(this.start+direction*Math.max(1,this.count-1));this.commitPan();}

    position(e) {
      const box=this.svg.getBoundingClientRect();
      return {x:(e.clientX-box.left)*this.width/Math.max(1,box.width),y:(e.clientY-box.top)*this.height/Math.max(1,box.height)};
    }
    indexAt(x){return this.start+clamp(Math.floor((x-this.plotLeft)/this.cell),0,this.count-1);}
    eventAt(e,x){
      const mark=e.target.closest('[data-annotation-index]');
      return mark ? Number(mark.getAttribute('data-annotation-index')) : this.indexAt(x);
    }
    x(k){return this.plotLeft+(k+.5)*this.cell;}
    y(v){return this.bottom-(v-this.scale.low)/(this.scale.high-this.scale.low)*(this.bottom-this.top);}

    clearHover(){
      if(!this.hover)return;
      this.hover=null;this.paint();
    }

    pointerMove(e){
      if(!this.events.length)return;
      if(this.drag&&(e.buttons===1||e.pointerType==='touch')){
        const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
        if(this.count<this.events.length && Math.abs(dx)>8 && Math.abs(dx)>Math.abs(dy)){
          this.drag.active=true;this.preventClick=true;
          this.svg.dataset.dragging='true';
          if(!this.svg.hasPointerCapture(e.pointerId))this.svg.setPointerCapture(e.pointerId);
          this.moveStart(this.drag.start-Math.round(dx/this.cell));
        }
        if(this.drag.active)return;
      }
      if(e.pointerType==='touch')return;
      const p=this.position(e);
      if(p.x<this.plotLeft||p.x>this.plotRight||p.y<this.top||p.y>this.bottom+23){this.clearHover();return;}
      this.hover={index:this.eventAt(e,p.x),y:e.target.closest('[data-annotation-index]') ? null : p.y<=this.bottom?clamp(p.y,this.top,this.bottom):null};
      this.paint();
    }

    handleKey(e){
      if(e.altKey||e.ctrlKey||e.metaKey||!this.events.length)return;
      if(e.key==='Escape')return this.clearHover();
      const step=this.range==='all'?10:this.count;
      const target={ArrowLeft:this.selected-1,ArrowRight:this.selected+1,PageUp:this.selected-step,PageDown:this.selected+step,Home:0,End:this.events.length-1};
      if(!Object.hasOwn(target,e.key))return;
      e.preventDefault();this.select(clamp(target[e.key],0,this.events.length-1));
    }

    build(){
      this.plotLeft=2;this.plotRight=Math.max(30,this.width-(this.width<420?37:46));
      const room=this.plotRight-this.plotLeft;
      this.cell=room/this.count;
      this.top=12;
      this.bottom=this.top+clamp(Math.round(this.width*.40),248,317);
      this.height=this.bottom+(this.range==='detail'?48:31);
      const bars=Array.from({length:this.count},(_,k)=>ohlc(this.events,this.start+k));
      this.scale=priceScale(bars,this.range==='all');
      this.svg.setAttribute('viewBox','0 0 '+this.width+' '+this.height);
      this.svg.style.height=this.height+'px';
      this.svg.setAttribute('data-chart-mode',this.mode);
      this.svg.setAttribute('data-chart-range',this.range);
      this.svg.setAttribute('aria-label',(this.person.name||'')+'年度人生走势。左右方向键选择年份，Home 和 End 定位首末年。');
      this.svg.setAttribute('aria-valuemin',this.events[0].y);this.svg.setAttribute('aria-valuemax',this.events[this.events.length-1].y);
      this.svg.replaceChildren();
      const grid=svg('g',{'aria-hidden':true});
      for(let v=this.scale.low;v<=this.scale.high+.001;v+=this.scale.step){
        const y=this.y(v);
        grid.append(line(this.plotLeft,y,this.plotRight,y,C.grid,{'stroke-width':.8}));
        grid.append(svg('text',{x:this.plotRight+7,y:y+3.5,fill:C.muted,'font-size':10.5},Number(v.toFixed(1))));
      }
      grid.append(line(this.plotRight+.5,this.top,this.plotRight+.5,this.bottom,C.major,{'stroke-width':.75}));
      grid.append(line(this.plotLeft,this.bottom,this.plotRight,this.bottom,C.major,{'stroke-width':.85}));
      const ticks=this.range==='detail'?Array.from({length:this.count},(_,i)=>i):yearTicks(this.events,this.start,this.count,room);
      this.tickLabels=[];
      for(const k of ticks){
        const x=this.x(k),year=this.events[this.start+k];
        grid.append(line(x,this.top,x,this.bottom,C.grid,{'stroke-width':.55,'stroke-dasharray':'2 4'}));
        let anchor='middle', labelX=x;
        if(this.range!=='detail'&&k===0){anchor='start';labelX=this.plotLeft+1;}
        if(this.range!=='detail'&&k===this.count-1){anchor='end';labelX=this.plotRight-1;}
        const tick=svg('text',{class:'annual-year',x:labelX,y:this.bottom+19,'text-anchor':anchor,fill:C.muted,'font-size':11},year.y+(this.range==='detail'?'年':''));
        grid.append(tick);this.tickLabels.push({k,tick,x:labelX,anchor});
        if(this.range==='detail')grid.append(svg('text',{class:'annual-axis-age',x,y:this.bottom+36,'text-anchor':'middle',fill:C.muted,'font-size':10.5},age(year)));
      }
      this.svg.append(grid);
      const series=svg('g',{'aria-hidden':true});
      const bw=Math.min(26,Math.max(1.2,this.cell*(this.count>30?.68:.54)));
      if(this.mode==='line'){
        const d=bars.map((b,k)=>(k?'L':'M')+this.x(k).toFixed(2)+','+this.y(b.c).toFixed(2)).join(' ');
        series.append(svg('path',{d:d+' L'+this.x(bars.length-1)+','+this.bottom+' L'+this.x(0)+','+this.bottom+' Z',fill:'#87ae9c','fill-opacity':.072}));
        series.append(svg('path',{d,fill:'none',stroke:'#c2d4c6','stroke-width':2,'stroke-linejoin':'round','stroke-linecap':'round'}));
      }
      bars.forEach((b,k)=>{
        const i=this.start+k,x=this.x(k),col=tone(b.o,b.c);
        const group=svg('g',{'data-event-index':i,'data-year':this.events[i].y});
        if(this.mode==='candle'){
          const bodyHeight=Math.abs(this.y(b.o)-this.y(b.c)),minBody=this.cell<=5?1.25:1.7;
          group.append(line(x,this.y(b.h),x,this.y(b.l),col,{class:'annual-wick','stroke-width':this.cell<=6?1:1.35}));
          group.append(svg('rect',{class:'annual-candle',x:x-bw/2,y:bodyHeight<minBody?this.y(b.c)-minBody/2:Math.min(this.y(b.o),this.y(b.c)),width:bw,height:Math.max(minBody,bodyHeight),fill:col}));
        }else if(this.range==='detail'){
          group.append(svg('circle',{cx:x,cy:this.y(b.c),r:2.7,fill:'#c2d4c6'}));
        }
        if(this.range==='detail'){
          const above=this.y(b.h)-7;
          const labelY=above>=this.top+6?above:Math.min(this.bottom-4,this.y(b.l)+14);
          group.append(svg('text',{class:'annual-close-value',x,y:labelY,fill:'#bdccc2','font-size':10.5,'text-anchor':'middle',
            'font-family':'var(--mono,monospace)','paint-order':'stroke','stroke':'var(--panel,#111a18)','stroke-width':2.5},fixed(b.c)));
        }
        series.append(group);
      });
      this.svg.append(series);
      if(this.range==='all'&&this.metric==='all'&&this.mode==='candle')this.addMilestones(bars);
      this.markers=svg('g',{'pointer-events':'none','aria-hidden':true});this.svg.append(this.markers);
      for(const [id,btn] of Object.entries(this.buttons))btn.setAttribute('aria-pressed',id===this.range);
      this.visible.textContent=this.events[this.start].y+'—'+this.events[this.start+this.count-1].y;
      this.nav.hidden=this.count===this.events.length;
      this.prev.disabled=this.start===0;this.next.disabled=this.start+this.count===this.events.length;
      this.paint();
    }

    addMilestones(bars){
      const marks=(milestones[this.person.id]||[]).slice(0,this.width<500?2:3);
      const occupied=[];
      const overlaps=(a,b,gap=0)=>a.x<b.x+b.w+gap&&a.x+a.w>b.x-gap&&a.y<b.y+b.h+gap&&a.y+a.h>b.y-gap;
      const bodies=bars.map((bar,k)=>({x:this.x(k)-this.cell*.35,y:this.y(bar.h),w:this.cell*.7,h:Math.max(2,this.y(bar.l)-this.y(bar.h))}));
      for(const [year,label] of marks){
        const i=this.events.findIndex(e=>Number(e.y)===year);
        if(i<0)continue;
        const x=this.x(i), y=this.y(bars[i].c);
        const w=String(year).length*6.3+label.length*10.5+13, h=18;
        let best=null;
        for(const offset of [17,32,48])for(const dy of [-1,1])for(const dx of [1,-1]){
          const left=clamp(dx>0?x+10:x-10-w,this.plotLeft+2,this.plotRight-w-3);
          const top=dy<0?y-offset-h:y+offset;
          const box={x:left,y:top,w,h};
          if(top<this.top+1||top+h>this.bottom-2||occupied.some(b=>overlaps(box,b,4)))continue;
          // Pick the nearest pocket of whitespace that leaves the actual candles visible.
          const cost=bodies.filter(b=>overlaps(box,b,2)).length*30+offset+Math.abs(left-(dx>0?x+10:x-10-w))*.25;
          if(!best||cost<best.cost)best={...box,cost};
        }
        if(!best)continue;
        occupied.push(best);
        const targetX=clamp(x,best.x+4,best.x+w-4), targetY=best.y>y?best.y:best.y+h;
        const mark=svg('g',{class:'annual-milestone','data-annotation-index':i,'data-annotation-year':year,'aria-hidden':true});
        mark.append(line(x,y,targetX,targetY,'#869d8f',{'stroke-width':.8,opacity:.9}));
        mark.append(svg('rect',{x:best.x,y:best.y,width:w,height:h,rx:2,fill:'#1b2924','fill-opacity':.96,stroke:'#45594d','stroke-width':.65}));
        const t=svg('text',{x:best.x+5.5,y:best.y+12.5,'font-size':10.5,fill:'#d9dfce'});
        t.append(svg('tspan',{fill:'#a8b8ac','font-size':10},year),svg('tspan',{dx:4},label));
        mark.append(t);
        this.svg.append(mark);
      }
    }

    axisTag(y,value,fill){
      const tag=svg('g');
      tag.append(svg('rect',{x:this.plotRight,y:y-8,width:this.width-this.plotRight,height:16,rx:1,fill}));
      tag.append(svg('text',{x:(this.width+this.plotRight)/2,y:y+3.6,fill:C.ink,'text-anchor':'middle','font-size':10.5,'font-weight':700},fixed(value)));
      this.markers.append(tag);
    }

    paint(){
      if(!this.markers||!this.events.length)return;
      const i=this.hover?.index??this.selected, event=this.events[i], active=this.events[this.selected], b=ohlc(this.events,i);
      const col=tone(b.o,b.c);
      this.date.textContent=event.y+'年';this.age.textContent=age(event);this.title.textContent=event.t||'';this.title.title=event.t||'';
      for(const k of ['o','h','l','c'])this.values[k].textContent=fixed(b[k]);
      this.values.c.style.color=col;this.values.d.style.color=col;this.values.d.textContent=signed(Math.round((b.c-b.o)*10)/10);
      this.svg.setAttribute('aria-valuenow',active.y);
      const a=ohlc(this.events,this.selected);
      this.svg.setAttribute('aria-valuetext',[active.y+'年',age(active),active.t,'开'+fixed(a.o),'高'+fixed(a.h),'低'+fixed(a.l),'收'+fixed(a.c)].filter(Boolean).join('，'));
      this.markers.replaceChildren();
      for(const {tick} of this.tickLabels)tick.setAttribute('opacity','1');
      if(i<this.start||i>=this.start+this.count)return;
      const k=i-this.start,x=this.x(k),closeY=this.y(b.c);
      this.markers.append(line(x,this.top,x,this.bottom,C.gold,{'stroke-width':.85,'stroke-dasharray':'3 4',opacity:.88}));
      this.markers.append(line(x,closeY,this.plotRight,closeY,col,{'stroke-width':.9,'stroke-dasharray':'2 3',opacity:.85}));
      this.markers.append(svg('circle',{cx:x,cy:closeY,r:this.mode==='line'?3.6:2.25,fill:C.ink,stroke:col,'stroke-width':1.3}));
      this.axisTag(closeY,b.c,col);
      const hoverY=this.hover?.y;
      if(hoverY!=null && Math.abs(hoverY-closeY)>8){
        this.markers.append(line(this.plotLeft,hoverY,this.plotRight,hoverY,C.tag,{'stroke-width':.75,'stroke-dasharray':'3 4',opacity:.72}));
        if(Math.abs(hoverY-closeY)>17){
          const value=this.scale.low+(this.bottom-hoverY)/(this.bottom-this.top)*(this.scale.high-this.scale.low);
          this.axisTag(hoverY,value,C.tag);
        }
      }
      const tagWidth=this.range==='detail'?Math.min(46,this.cell-1):39;
      const tagX=clamp(x-tagWidth/2,this.plotLeft,this.plotRight-tagWidth);
      for(const {tick,x:tx,anchor} of this.tickLabels){
        const tw=tick.textContent.length*6.4;
        const left=anchor==='start'?tx:anchor==='end'?tx-tw:tx-tw/2;
        if(left<tagX+tagWidth+2&&left+tw>tagX-2)tick.setAttribute('opacity','0');
      }
      this.markers.append(svg('rect',{x:tagX,y:this.bottom+4,width:tagWidth,height:19,fill:'#3c4b42',rx:2}));
      this.markers.append(svg('text',{x:tagX+tagWidth/2,y:this.bottom+17.5,'text-anchor':'middle',fill:'#f1e6ce','font-weight':600,'font-size':11},event.y+(this.range==='detail'?'年':'')));
    }
  }

  window.drawLifeChart=function drawLifeChart(container,options){
    let chart=charts.get(container);
    if(!chart||chart.root.parentNode!==container){
      if(chart)chart.observer.disconnect();
      chart=new AnnualChart(container);charts.set(container,chart);
    }
    chart.update(options);
  };
})();
