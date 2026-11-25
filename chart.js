(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const charts = new WeakMap();
  const colors = {
    up: '#f37c67', down: '#72bea4', flat: '#bac4b9', gold: '#e3c588',
    label: '#d4dbd1', muted: '#9eada1', grid: '#34413a', minor: '#29372e'
  };

  function svg(tag, attributes = {}, content) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function html(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function installStyles() {
    if (document.getElementById('annual-chart-style')) return;
    const style = document.createElement('style');
    style.id = 'annual-chart-style';
    style.textContent = `
      .annual-chart{min-width:0;width:100%;font-family:inherit;font-variant-numeric:tabular-nums}
      .annual-chart svg{display:block;font-family:inherit;font-variant-numeric:tabular-nums;user-select:none;-webkit-user-select:none}
      .annual-overview-head,.annual-chart-toolbar,.annual-readout,.annual-stepper{display:flex;align-items:center}
      .annual-overview-head{justify-content:space-between;color:#aab6aa;font-size:11px;line-height:16px}
      .annual-overview-head strong{font-size:12px;font-weight:600;letter-spacing:.04em;color:#d7dccf}
      .annual-overview{width:100%;height:48px;cursor:crosshair;touch-action:pan-y}
      .annual-chart-toolbar{border-top:1px solid #34413a;margin-top:3px;padding:7px 0 5px;gap:8px}
      .annual-readout{flex:1;min-width:0;gap:7px;font-size:12px;line-height:18px;white-space:nowrap}
      .annual-reading{font-weight:650;color:#e3c588;flex:none}
      .annual-event{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c2cbbf}
      .annual-stepper{flex:none;gap:3px}
      .annual-stepper button{display:grid;place-items:center;width:30px;height:28px;padding:0;border:1px solid #415044;border-radius:4px;background:#1b261e;color:#dde2d7;cursor:pointer}
      .annual-stepper button[disabled]{color:#718175;opacity:.58;cursor:default}
      .annual-chart button:focus-visible,.annual-scroller:focus-within{outline:2px solid #c5a779;outline-offset:-2px;border-radius:3px}
      .annual-plot{display:grid;grid-template-columns:28px minmax(0,1fr);min-width:0}
      .annual-scale{width:28px;align-self:start;pointer-events:none}
      .annual-scroller{min-width:0;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;touch-action:pan-x pan-y;scrollbar-width:thin;scrollbar-color:#657265 #1c261f}
      .annual-scroller::-webkit-scrollbar{height:5px}.annual-scroller::-webkit-scrollbar-thumb{border-radius:5px;background:#657265}.annual-scroller::-webkit-scrollbar-track{background:#1c261f}
      .annual-detail{max-width:none;cursor:crosshair;outline:0;touch-action:pan-x pan-y}
      .annual-detail[data-dragging="true"]{cursor:grabbing}
      .annual-detail g[data-active="true"] .annual-year,.annual-detail g[data-active="true"] .annual-age{fill:#e3c588;font-weight:650}
      .annual-empty{padding:24px;text-align:center;color:#aab6aa}
      @media(max-width:450px){.annual-readout{gap:5px;font-size:11.5px}.annual-chart-toolbar{gap:4px}}
    `;
    document.head.append(style);
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const score = value => clamp(Number(value) || 0, 0, 100);
  const ageText = event => event.ageLabel || (Number.isFinite(event.age) ? '年差' + event.age : '年龄未详');
  const changeColor = (open, close) => close === open ? colors.flat : close > open ? colors.up : colors.down;
  const line = (x1, y1, x2, y2, stroke, attrs = {}) =>
    svg('line', {x1, y1, x2, y2, stroke, ...attrs});

  function annualValues(events, i) {
    const current = events[i];
    const close = score(current.v);
    const open = Number.isFinite(current.o) ? score(current.o) : i ? score(events[i - 1].v) : close;
    const high = Math.max(open, close, Number.isFinite(current.h) ? score(current.h) : close);
    const low = Math.min(open, close, Number.isFinite(current.l) ? score(current.l) : close);
    return {open, close, high, low};
  }

  function arrowButton(direction) {
    const button = html('button', '');
    const label = direction < 0 ? '向前浏览一屏年份' : '向后浏览一屏年份';
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    const icon = svg('svg', {width: 13, height: 13, viewBox: '0 0 16 16', 'aria-hidden': true});
    icon.append(svg('path', {
      d: direction < 0 ? 'M10 3.5 5.5 8 10 12.5' : 'M6 3.5 10.5 8 6 12.5',
      stroke: 'currentColor', 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));
    button.append(icon);
    return button;
  }

  class AnnualChart {
    constructor(container) {
      installStyles();
      this.container = container;
      this.root = html('div', 'annual-chart');
      this.empty = html('p', 'annual-empty', '暂无年度数据');
      const heading = html('div', 'annual-overview-head');
      this.overviewRange = html('span', '');
      heading.append(html('strong', '', '全生涯导航'), this.overviewRange);
      this.overview = svg('svg', {class: 'annual-overview', 'aria-hidden': true, focusable: false});
      const toolbar = html('div', 'annual-chart-toolbar');
      const readout = html('div', 'annual-readout');
      this.reading = html('span', 'annual-reading');
      this.eventTitle = html('span', 'annual-event');
      readout.append(this.reading, this.eventTitle);
      const stepper = html('div', 'annual-stepper');
      this.back = arrowButton(-1);
      this.next = arrowButton(1);
      stepper.append(this.back, this.next);
      toolbar.append(readout, stepper);
      this.plot = html('div', 'annual-plot');
      this.axis = svg('svg', {class: 'annual-scale', 'aria-hidden': true});
      this.viewport = html('div', 'annual-scroller');
      this.detail = svg('svg', {
        class: 'annual-detail', role: 'slider', tabindex: 0, focusable: true,
        'aria-orientation': 'horizontal', 'aria-keyshortcuts': 'ArrowLeft ArrowRight Home End PageUp PageDown'
      });
      this.viewport.append(this.detail);
      this.plot.append(this.axis, this.viewport);
      this.root.append(heading, this.overview, toolbar, this.plot);
      container.replaceChildren(this.root);

      this.hovered = null;
      this.events = [];
      this.width = 0;
      this.drag = null;
      this.didDrag = false;
      this.detail.addEventListener('keydown', e => this.handleKey(e));
      this.overview.addEventListener('click', e => {
        if (this.events.length) this.select(this.indexAt(e, this.overview), true);
      });
      this.back.addEventListener('click', () => this.browse(-1));
      this.next.addEventListener('click', () => this.browse(1));
      this.viewport.addEventListener('scroll', () => {
        if (this.hovered !== null) { this.hovered = null; this.paintSelection(); }
        this.paintWindow();
      }, {passive: true});
      this.viewport.addEventListener('scrollend', () => {
        if (!this.step || this.drag) return;
        const left = this.viewport.scrollLeft;
        const aligned = Math.round(left / this.step) * this.step;
        if (Math.abs(left - aligned) > .9) this.viewport.scrollLeft = aligned;
      });
      this.detail.addEventListener('pointerdown', e => {
        this.didDrag = false;
        this.drag = e.pointerType === 'mouse' && e.button === 0 ? {id: e.pointerId, x: e.clientX, left: this.viewport.scrollLeft} : null;
      });
      this.detail.addEventListener('pointermove', e => {
        if (this.drag && e.buttons === 1) {
          const dx = e.clientX - this.drag.x;
          if (Math.abs(dx) > 5) {
            this.didDrag = true;
            this.detail.dataset.dragging = 'true';
            if (!this.detail.hasPointerCapture(e.pointerId)) this.detail.setPointerCapture(e.pointerId);
            this.viewport.scrollLeft = this.drag.left - dx;
          }
          return;
        }
        if (e.pointerType !== 'touch') this.setHover(this.indexAt(e, this.detail));
      });
      const endDrag = () => {
        this.drag = null;
        this.detail.removeAttribute('data-dragging');
      };
      this.detail.addEventListener('pointerup', endDrag);
      this.detail.addEventListener('pointercancel', endDrag);
      this.detail.addEventListener('pointerleave', () => this.setHover(null));
      this.detail.addEventListener('click', e => {
        if (!this.didDrag && this.events.length) this.select(this.indexAt(e, this.detail), false);
      });
      this.observer = new ResizeObserver(entries => {
        const width = Math.round(entries[0].contentRect.width);
        if (!this.container.isConnected) return this.observer.disconnect();
        if (this.events.length && width > 0 && width !== this.width) this.build(width);
      });
      this.observer.observe(container);
    }

    update(options) {
      const person = options.person || {};
      const events = person.events || [];
      const selected = clamp(Math.trunc(options.selected) || 0, 0, Math.max(0, events.length - 1));
      // The scoring method can mutate the same annual objects in place.
      const signature = events.map(e => [e.y, e.ageLabel, e.o, e.h, e.l, e.v].join('/')).join('|');
      const mode = options.mode === 'line' ? 'line' : 'candle';
      const width = Math.max(1, this.root.clientWidth || this.container.clientWidth);
      const rebuild = this.person !== person || this.signature !== signature || this.mode !== mode || width !== this.width;
      const moved = selected !== this.selected;
      this.events = events;
      this.person = person;
      this.signature = signature;
      this.mode = mode;
      this.selected = selected;
      this.onSelect = options.onSelect;
      this.hovered = null;
      this.root.hidden = !events.length;
      if (!events.length) {
        this.container.append(this.empty);
        return;
      }
      this.empty.remove();
      if (rebuild) this.build(width);
      else {
        if (moved) this.reveal(false);
        this.paintSelection();
      }
    }

    build(width) {
      this.width = width;
      this.height = clamp(Math.round(width * .29), 197, 264);
      this.top = 8;
      this.bottom = this.height - 44;
      const available = Math.max(1, this.viewport.clientWidth || width - 28);
      this.visibleYears = clamp(Math.floor(available / (width < 480 ? 50 : 54)), 1, this.events.length);
      this.step = available / this.visibleYears;
      this.fullWidth = Math.round(this.step * this.events.length);
      this.detail.setAttribute('viewBox', '0 0 ' + this.fullWidth + ' ' + this.height);
      this.detail.style.width = this.fullWidth + 'px';
      this.detail.style.height = this.height + 'px';
      this.detail.setAttribute('data-chart-mode', this.mode);
      this.detail.setAttribute('aria-label', (this.person.name || '') + '逐年人生走势图，左右方向键逐年切换，Home 和 End 到首末年');
      this.detail.setAttribute('aria-valuemin', this.events[0].y);
      this.detail.setAttribute('aria-valuemax', this.events[this.events.length - 1].y);
      this.detail.replaceChildren();
      this.axis.setAttribute('viewBox', '0 0 28 ' + this.height);
      this.axis.style.height = this.height + 'px';
      this.axis.replaceChildren();

      const grid = svg('g', {'aria-hidden': true});
      for (const value of [0, 25, 50, 75, 100]) {
        const y = this.y(value);
        this.axis.append(svg('text', {x: 23, y: y + 3.8, fill: colors.muted, 'text-anchor': 'end', 'font-size': 10.5}, value));
        grid.append(line(0, y, this.fullWidth, y, colors.grid, {'stroke-width': .85}));
      }
      this.detail.append(grid);
      this.band = svg('rect', {y: 1, width: this.step, height: this.height - 2, fill: colors.gold, 'fill-opacity': .056});
      this.guide = line(0, 1, 0, this.bottom + 4, colors.gold, {'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: .8});
      this.detail.append(this.band, this.guide);
      this.groups = [];
      const series = svg('g', {'aria-hidden': true});
      this.events.forEach((event, i) => {
        const x = this.x(i);
        const {open, close, high, low} = annualValues(this.events, i);
        const stroke = changeColor(open, close);
        const group = svg('g', {'data-event-index': i, 'data-year': event.y});
        group.append(line(i * this.step, this.top, i * this.step, this.bottom, colors.minor, {'stroke-width': .7, 'stroke-dasharray': '2 5'}));
        if (this.mode === 'line') {
          if (i > 0) group.append(line(this.x(i-1), this.y(this.events[i-1].v), x, this.y(close), stroke, {'stroke-width': 2.15, 'stroke-linecap': 'round'}));
          group.append(svg('circle', {cx: x, cy: this.y(close), r: 3.5, fill: stroke}));
        } else {
          const yHigh = this.y(high), yLow = this.y(low);
          const bodyHeight = Math.abs(this.y(open) - this.y(close));
          const bodyWidth = Math.min(this.step * .46, 26);
          // A zero-range year retains its horizontal body. A visible cross needs an actual range.
          group.append(line(x, yHigh, x, yLow, stroke, {class: 'annual-wick', 'stroke-width': 1.65}));
          group.append(svg('rect', {class: 'annual-candle', x: x - bodyWidth / 2,
            y: bodyHeight < 2.4 ? this.y(close) - 1.2 : Math.min(this.y(open), this.y(close)),
            width: bodyWidth, height: Math.max(2.4, bodyHeight), fill: stroke}));
        }
        group.append(svg('text', {class: 'annual-year', x, y: this.bottom + 16, fill: colors.label, 'text-anchor': 'middle', 'font-size': 12}, event.y + '年'));
        group.append(svg('text', {class: 'annual-age', x, y: this.bottom + 33, fill: colors.muted, 'text-anchor': 'middle', 'font-size': 11.5}, ageText(event)));
        this.groups.push(group);
        series.append(group);
      });
      this.detail.append(series);
      this.buildOverview();
      this.reveal(true);
      this.paintSelection();
      this.paintWindow();
    }

    buildOverview() {
      const w = this.width, h = 48;
      const miniX = i => 2 + (i + .5) * (w - 4) / this.events.length;
      const miniY = v => 4 + (100 - score(v)) * .36;
      const coords = this.events.map((event, i) => [miniX(i), miniY(event.v)]);
      const path = coords.map(([x,y], i) => (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2)).join(' ');
      this.overview.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      this.overview.setAttribute('preserveAspectRatio', 'none');
      this.overview.replaceChildren();
      if (this.mode === 'line') {
        this.overview.append(svg('path', {d: path + ' L' + coords[coords.length-1][0] + ',43 L' + coords[0][0] + ',43 Z', fill: '#637e6b', 'fill-opacity': .18}));
        this.overview.append(svg('path', {d: path, fill: 'none', stroke: '#9eb4a0', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
      } else {
        const unit = (w - 4) / this.events.length;
        const bodyWidth = Math.max(.85, Math.min(8, unit * .64));
        const mini = svg('g');
        this.events.forEach((event, index) => {
          const {open, close, high, low} = annualValues(this.events, index);
          const x = coords[index][0], stroke = changeColor(open, close);
          const height = Math.abs(miniY(open) - miniY(close));
          mini.append(line(x, miniY(high), x, miniY(low), stroke, {'stroke-width': Math.min(1.05, bodyWidth)}));
          mini.append(svg('rect', {class: 'annual-mini-candle', x: x - bodyWidth / 2,
            y: height < 1.3 ? miniY(close) - .65 : Math.min(miniY(open), miniY(close)),
            width: bodyWidth, height: Math.max(1.3, height), fill: stroke}));
        });
        this.overview.append(mini);
      }
      this.overview.append(line(1, 43.5, w - 1, 43.5, colors.grid));
      this.brush = svg('rect', {y: 1.5, height: 42, rx: 2.5, fill: colors.gold, 'fill-opacity': .07, stroke: colors.gold, 'stroke-opacity': .60, 'stroke-width': 1});
      this.overviewGuide = line(0, 2, 0, 43, colors.gold, {'stroke-width': 1.35});
      this.overviewMarker = svg('circle', {r: 2.75, fill: colors.gold});
      this.overview.append(this.brush, this.overviewGuide, this.overviewMarker);
      this.miniCoords = coords;
      this.overviewRange.textContent = this.events[0].y + '—' + this.events[this.events.length-1].y + ' 年 · 点选定位';
    }

    x(i) { return (i + .5) * this.step; }
    y(value) { return this.bottom - score(value) / 100 * (this.bottom - this.top); }

    indexAt(e, target) {
      const box = target.getBoundingClientRect();
      const x = e.clientX - box.left;
      const f = target === this.overview ? (x - 2) / Math.max(1, box.width - 4) : x / Math.max(1, box.width);
      return clamp(Math.floor(f * this.events.length), 0, this.events.length - 1);
    }

    select(index, center) {
      this.selected = index;
      this.hovered = null;
      this.reveal(center);
      this.paintSelection();
      if (typeof this.onSelect === 'function') this.onSelect(index);
    }

    setHover(index) {
      if (index === this.hovered || !this.events.length) return;
      this.hovered = index;
      this.paintSelection();
    }

    reveal(center) {
      const x = this.x(this.selected);
      const width = this.viewport.clientWidth;
      const left = this.viewport.scrollLeft;
      if (center || x - this.step / 2 < left || x + this.step / 2 > left + width) {
        const first = clamp(this.selected - Math.floor(this.visibleYears / 2), 0, this.events.length - this.visibleYears);
        this.viewport.scrollLeft = Math.round(first * this.step);
      }
      this.paintWindow();
    }

    browse(direction) {
      const visible = this.visibleYears;
      this.viewport.scrollBy({left: direction * visible * this.step,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    }

    handleKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey || !this.events.length) return;
      if (e.key === 'Escape') return this.setHover(null);
      const page = this.visibleYears;
      const end = this.events.length - 1;
      const indices = {ArrowLeft: this.selected - 1, ArrowRight: this.selected + 1,
        PageUp: this.selected - page, PageDown: this.selected + page, Home: 0, End: end};
      if (!Object.hasOwn(indices, e.key)) return;
      e.preventDefault();
      this.select(clamp(indices[e.key], 0, end), false);
    }

    paintWindow() {
      if (!this.brush || !this.events.length) return;
      const left = this.viewport.scrollLeft, visible = this.viewport.clientWidth;
      const range = this.width - 4;
      this.brush.setAttribute('x', 2 + range * left / this.fullWidth);
      this.brush.setAttribute('width', Math.max(1, range * Math.min(1, visible / this.fullWidth)));
      this.back.disabled = left <= 1;
      this.next.disabled = left + visible >= this.fullWidth - 1;
    }

    paintSelection() {
      if (!this.events.length || !this.groups) return;
      const index = this.hovered ?? this.selected;
      const event = this.events[index], selected = this.events[this.selected];
      const x = this.x(index);
      this.band.setAttribute('x', index * this.step);
      this.guide.setAttribute('x1', x);
      this.guide.setAttribute('x2', x);
      if (this.activeGroup) this.activeGroup.removeAttribute('data-active');
      this.activeGroup = this.groups[index];
      this.activeGroup.setAttribute('data-active', 'true');
      const [mx, my] = this.miniCoords[index];
      this.overviewGuide.setAttribute('x1', mx);
      this.overviewGuide.setAttribute('x2', mx);
      this.overviewMarker.setAttribute('cx', mx);
      this.overviewMarker.setAttribute('cy', my);
      this.reading.textContent = event.y + '年 · ' + ageText(event) + ' · ' + event.v + '分';
      this.eventTitle.textContent = event.t || '';
      this.eventTitle.title = event.t || '';
      this.detail.setAttribute('aria-valuenow', selected.y);
      this.detail.setAttribute('aria-valuetext', [selected.y + '年', ageText(selected), selected.t, selected.v + '分'].filter(Boolean).join('，'));
    }
  }

  window.drawLifeChart = function drawLifeChart(container, options) {
    let chart = charts.get(container);
    if (!chart || chart.root.parentNode !== container) {
      if (chart) chart.observer.disconnect();
      chart = new AnnualChart(container);
      charts.set(container, chart);
    }
    chart.update(options);
  };
})();
