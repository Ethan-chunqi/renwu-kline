(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const charts = new WeakMap();
  const color = {
    up: '#f37c67', down: '#72bea4', neutral: '#c4c9bc',
    gold: '#e3c588', muted: '#a4afa7', grid: '#33413c',
    minor: '#28362f', badge: '#29352e', background: '#101918'
  };

  function svg(tag, attributes = {}, content) {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (content !== undefined) element.textContent = content;
    return element;
  }

  function score(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  function displayScore(value) {
    return String(Math.round(score(value) * 10) / 10);
  }

  function yearLabel(event) {
    const year = String(event.y ?? '');
    return year.endsWith('年') ? year : year + ' 年';
  }

  function direction(open, close) {
    if (close === open) return color.neutral;
    return close > open ? color.up : color.down;
  }

  function getTicks(xs, events, spacing) {
    if (events.length < 2) return events.map((_, i) => i);
    const end = events.length - 1;
    const ticks = [0];
    for (let i = 1; i < end; i++) {
      const last = ticks[ticks.length - 1];
      if (xs[i] - xs[last] < spacing || xs[end] - xs[i] < spacing) continue;
      if (events[i].y !== events[last].y && events[i].y !== events[end].y) ticks.push(i);
    }
    ticks.push(end);
    return ticks;
  }

  class LifeChart {
    constructor(container) {
      this.container = container;
      this.svg = svg('svg', {
        xmlns: NS, role: 'slider', tabindex: '0', focusable: 'true',
        'aria-orientation': 'horizontal', 'aria-roledescription': '可交互的人生走势图',
        'aria-keyshortcuts': 'ArrowLeft ArrowRight Home End'
      });
      Object.assign(this.svg.style, {
        width: '100%', display: 'block', touchAction: 'pan-y', overflow: 'hidden',
        fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums', userSelect: 'none'
      });
      container.replaceChildren(this.svg);
      this.svg.addEventListener('keydown', event => this.handleKey(event));
      this.svg.addEventListener('pointermove', event => {
        if (event.pointerType !== 'touch') this.setHover(this.indexAt(event));
      });
      this.svg.addEventListener('pointerleave', () => this.setHover(null));
      this.svg.addEventListener('pointercancel', () => this.setHover(null));
      this.svg.addEventListener('click', event => {
        const index = this.indexAt(event);
        if (index !== null) this.select(index);
      });
      this.width = 0;
      this.hovered = null;
      this.observer = new ResizeObserver(entries => {
        if (!this.container.isConnected) {
          this.observer.disconnect();
          return;
        }
        const width = Math.round(entries[0].contentRect.width);
        if (width > 0 && width !== this.width) this.render(width);
      });
      this.observer.observe(container);
    }

    update(options) {
      const events = options.person?.events || [];
      this.options = options;
      this.events = events;
      this.selected = Math.max(0, Math.min(events.length - 1, Math.trunc(options.selected) || 0));
      this.hovered = null;
      const css = getComputedStyle(this.container);
      const width = this.container.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      this.render(Math.max(1, Math.round(width)));
    }

    select(index) {
      if (!this.events.length || index < 0 || index >= this.events.length) return;
      this.selected = index;
      this.hovered = null;
      this.updateFocus();
      if (typeof this.options.onSelect === 'function') this.options.onSelect(index);
    }

    handleKey(event) {
      if (event.altKey || event.ctrlKey || event.metaKey || !this.events.length) return;
      const last = this.events.length - 1;
      const moves = {
        ArrowLeft: Math.max(0, this.selected - 1), ArrowRight: Math.min(last, this.selected + 1),
        Home: 0, End: last
      };
      if (event.key === 'Escape') return this.setHover(null);
      if (!(event.key in moves)) return;
      event.preventDefault();
      this.select(moves[event.key]);
    }

    indexAt(event) {
      if (!this.events.length) return null;
      const bounds = this.svg.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return null;
      const x = (event.clientX - bounds.left) * this.width / bounds.width;
      const y = (event.clientY - bounds.top) * this.height / bounds.height;
      if (y < 4 || y > this.height - 3 || x < this.left - 11 || x > this.right + 13) return null;
      if (this.events.length === 1) return 0;
      const index = Math.round((x - this.xs[0]) / this.step);
      return Math.max(0, Math.min(this.events.length - 1, index));
    }

    setHover(index) {
      if (index === this.hovered) return;
      this.hovered = index;
      this.updateFocus();
    }

    render(width) {
      if (!this.options) return;
      this.width = width;
      this.height = Math.max(252, Math.min(375, Math.round(width * 0.41)));
      this.svg.setAttribute('viewBox', '0 0 ' + width + ' ' + this.height);
      this.svg.style.height = this.height + 'px';
      this.svg.setAttribute('data-chart-mode', this.options.mode === 'line' ? 'line' : 'candle');
      this.svg.replaceChildren();
      if (!this.events.length) {
        this.svg.setAttribute('aria-label', '暂无人生节点');
        this.svg.append(svg('text', {
          x: width / 2, y: this.height / 2, 'text-anchor': 'middle', fill: color.muted
        }, '暂无人生节点'));
        return;
      }
      this.left = width < 460 ? 33 : 42;
      this.right = width - (width < 460 ? 17 : 24);
      this.top = width < 460 ? 44 : 45;
      this.bottom = this.height - 29;
      const span = Math.max(1, this.right - this.left);
      // Half-step inset keeps the first and last tap columns full width.
      this.step = span / this.events.length;
      this.xs = this.events.map((_, i) => this.left + this.step * (i + 0.5));
      const y = value => this.bottom - score(value) / 100 * (this.bottom - this.top);
      this.y = y;
      const mode = this.options.mode === 'line' ? '折线图' : 'K线图';
      this.svg.setAttribute('aria-label', (this.options.person.name || '') + '人生' + mode + '，使用左右方向键选择年份');
      this.svg.setAttribute('aria-valuemin', 1);
      this.svg.setAttribute('aria-valuemax', this.events.length);

      const grid = svg('g', { 'aria-hidden': 'true', 'font-size': width < 460 ? 11 : 12, fill: color.muted });
      const ticks = getTicks(this.xs, this.events, width < 500 ? 52 : 60);
      for (const index of ticks) {
        const x = this.xs[index];
        grid.append(svg('line', { x1: x, x2: x, y1: this.top, y2: this.bottom, stroke: color.minor, 'stroke-dasharray': '2 5' }));
        grid.append(svg('text', { x, y: this.bottom + 20, 'text-anchor': 'middle' }, String(this.events[index].y)));
      }
      for (const value of [0, 25, 50, 75, 100]) {
        grid.append(svg('line', { x1: this.left, x2: this.right, y1: y(value), y2: y(value), stroke: color.grid, 'stroke-width': 0.85 }));
        grid.append(svg('text', { x: this.left - 9, y: y(value) + 4, 'text-anchor': 'end' }, value));
      }
      this.svg.append(grid);
      this.guide = svg('line', { stroke: color.gold, 'stroke-width': 1, 'stroke-dasharray': '3 5', opacity: 0.75, y1: this.top - 6, y2: this.bottom + 4 });
      this.svg.append(this.guide);

      const series = svg('g', { 'aria-hidden': 'true', 'pointer-events': 'none' });
      const bodyWidth = Math.max(3, Math.min(29, this.step * 0.48));
      this.events.forEach((event, index) => {
        const x = this.xs[index];
        const close = score(event.v);
        const open = index ? score(this.events[index - 1].v) : close;
        const stroke = direction(open, close);
        const terminal = index === 0 || index === this.events.length - 1;
        const group = svg('g', { 'data-event-index': index });
        if (this.options.mode === 'line' && index > 0) {
          group.append(svg('line', {
            x1: this.xs[index - 1], y1: y(open), x2: x, y2: y(close),
            stroke: terminal ? color.neutral : stroke, 'stroke-width': 2.6, 'stroke-linecap': 'round'
          }));
        }
        if (terminal) {
          group.append(svg('circle', { cx: x, cy: y(close), r: 5.3, fill: color.background, stroke: color.neutral, 'stroke-width': 1.6 }));
          if (index > 0) group.append(svg('circle', { cx: x, cy: y(close), r: 1.9, fill: color.neutral }));
        } else if (this.options.mode === 'line') {
          group.append(svg('circle', { cx: x, cy: y(close), r: 3.2, fill: stroke }));
        } else {
          const values = [open, close, ...(Array.isArray(event.m) ? event.m.filter(Number.isFinite).map(score) : [])];
          const high = Math.max(...values);
          const low = Math.min(...values);
          const height = Math.abs(y(open) - y(close));
          group.append(svg('line', {
            x1: x, x2: x, y1: y(high), y2: y(low), stroke, 'stroke-width': 1.65, 'stroke-linecap': 'round'
          }));
          group.append(svg('rect', {
            x: x - bodyWidth / 2, y: height < 2 ? y(close) - 1 : Math.min(y(open), y(close)),
            width: bodyWidth, height: Math.max(2, height), fill: stroke
          }));
        }
        series.append(group);
      });
      this.svg.append(series);
      this.readout = svg('g', { 'aria-hidden': 'true', 'pointer-events': 'none' });
      this.svg.append(this.readout);
      this.updateFocus();
    }

    updateFocus() {
      if (!this.events?.length || !this.readout) return;
      const selected = this.events[this.selected];
      this.svg.setAttribute('aria-valuenow', this.selected + 1);
      this.svg.setAttribute('aria-valuetext', yearLabel(selected) + '，' + selected.t + '，' + displayScore(selected.v) + '分');
      const index = this.hovered ?? this.selected;
      const event = this.events[index];
      const x = this.xs[index];
      this.guide.setAttribute('x1', x);
      this.guide.setAttribute('x2', x);
      this.readout.replaceChildren();
      const showTitle = true;
      const label = yearLabel(event) + (showTitle ? '  ·  ' + event.t : '') + '  ·  ' + displayScore(event.v) + ' 分';
      const text = svg('text', {
        y: 24, 'text-anchor': 'middle', 'font-size': this.width < 460 ? 11.5 : 12,
        'font-weight': 600, fill: color.gold
      }, label);
      this.readout.append(text);
      const usableWidth = Math.max(1, this.width - 8);
      let textWidth = text.getComputedTextLength();
      if (textWidth > usableWidth - 22 && showTitle) {
        text.textContent = yearLabel(event) + '  ·  ' + displayScore(event.v) + ' 分';
        textWidth = text.getComputedTextLength();
      }
      const badgeWidth = Math.min(usableWidth, Math.ceil(textWidth + 21));
      const badgeX = Math.max(4, Math.min(this.width - badgeWidth - 4, x - badgeWidth / 2));
      text.setAttribute('x', badgeX + badgeWidth / 2);
      this.readout.insertBefore(svg('rect', {
        x: badgeX, y: 6.5, width: badgeWidth, height: 26, rx: 3,
        fill: color.badge, stroke: color.gold, 'stroke-opacity': 0.49, 'stroke-width': 0.8
      }), text);
      const pointY = this.y(event.v);
      const marker = svg('circle', { cx: x, cy: pointY, r: 3.8, fill: color.background, stroke: color.gold, 'stroke-width': 1.8 });
      this.readout.append(marker);
    }
  }

  window.drawLifeChart = function drawLifeChart(container, options) {
    let chart = charts.get(container);
    if (!chart || chart.svg.parentNode !== container) {
      if (chart) chart.observer.disconnect();
      chart = new LifeChart(container);
      charts.set(container, chart);
    }
    chart.update(options);
  };
})();
