/* LifeManager Pro — lightweight animated SVG charts */
'use strict';

const CH = { inc: 'var(--c-inc)', exp: 'var(--c-exp)', sav: 'var(--c-sav)', a: 'var(--a)', b: 'var(--b)' };
const niceMax = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };

/* grouped bars: labels[], series [{name, color, values[]}] */
function barChart(labels, series, opts = {}) {
  const W = 340, H = opts.h || 190, L = 40, B = 24, T = 10;
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.values.map(v => Math.max(0, v)))));
  const gw = (W - L - 6) / labels.length, bw = Math.min(16, (gw - 8) / series.length);
  const y = v => T + (H - T - B) * (1 - Math.max(0, v) / max);
  const ticks = [0, .5, 1].map(f => max * f);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(opts.label || 'Bar chart')}">
    ${ticks.map(t => `<line x1="${L}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 6}" y="${y(t) + 3}" text-anchor="end" class="axis">${esc(moneyShort(t))}</text>`).join('')}
    ${labels.map((lb, i) => {
      const x0 = L + i * gw + (gw - bw * series.length) / 2;
      return series.map((s, k) => { const v = s.values[i] || 0, h = H - B - y(v);
        return `<rect x="${x0 + k * bw}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, h)}" rx="3" fill="${s.color}" class="cbar" style="animation-delay:${i * 40}ms"><title>${esc(s.name)} ${esc(lb)}: ${esc(money(v))}</title></rect>`; }).join('') +
        `<text x="${L + i * gw + gw / 2}" y="${H - 6}" text-anchor="middle" class="axis">${esc(lb)}</text>`;
    }).join('')}
  </svg>${legend(series)}`;
}

/* lines: labels[], series [{name, color, values[], area?, dash?}] */
function lineChart(labels, series, opts = {}) {
  const W = 340, H = opts.h || 180, L = 40, B = 24, T = 10, n = labels.length;
  const vals = series.flatMap(s => s.values.filter(v => v != null));
  const max = niceMax(Math.max(1, ...vals)), min = Math.min(0, ...vals);
  const x = i => L + (W - L - 8) * (n === 1 ? .5 : i / (n - 1));
  const y = v => T + (H - T - B) * (1 - (v - min) / (max - min || 1));
  const every = Math.ceil(n / 7);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(opts.label || 'Line chart')}">
    ${[min, (max + min) / 2, max].map(t => `<line x1="${L}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 6}" y="${y(t) + 3}" text-anchor="end" class="axis">${esc(opts.pct ? Math.round(t) + '%' : moneyShort(t))}</text>`).join('')}
    ${series.map(s => {
      const pts = s.values.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean);
      if (!pts.length) return '';
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      const area = s.area ? `<path d="${d} L${pts[pts.length - 1][0]} ${y(Math.max(min, 0))} L${pts[0][0]} ${y(Math.max(min, 0))}Z" fill="${s.color}" opacity=".14"/>` : '';
      return `${area}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" class="${s.dash ? 'dash' : 'draw'}" ${s.dash ? 'stroke-dasharray="5 5"' : ''}/>` +
        (pts.length < 16 ? pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="var(--card)" stroke="${s.color}" stroke-width="2"><title>${esc(s.name)} ${esc(labels[i])}: ${esc(opts.pct ? s.values[i] + '%' : money(s.values[i]))}</title></circle>`).join('') : '');
    }).join('')}
    ${labels.map((lb, i) => i % every === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="axis">${esc(lb)}</text>` : '').join('')}
  </svg>${legend(series)}`;
}

/* donut: items [{label, value, color}] */
function donutChart(items, opts = {}) {
  items = items.filter(i => i.value > 0);
  const total = sum(items, i => i.value);
  if (!total) return `<div class="empty small">No data for this period.</div>`;
  const top = items.slice(0, 7);
  if (items.length > 7) top.push({ label: 'Others', value: sum(items.slice(7), i => i.value), color: '#94a3b8' });
  const R0 = 52, C = 2 * Math.PI * R0;
  let acc = 0;
  const arcs = top.map((it, i) => {
    const len = it.value / total * C;
    const s = `<circle r="${R0}" cx="70" cy="70" fill="none" stroke="${it.color || PALETTE[i % PALETTE.length]}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 70 70)" class="arc" style="animation-delay:${i * 70}ms"><title>${esc(it.label)}: ${esc(money(it.value))} (${pct(it.value, total)}%)</title></circle>`;
    acc += len; return s;
  }).join('');
  return `<div class="donut-wrap"><svg viewBox="0 0 140 140" class="donut" role="img" aria-label="${esc(opts.label || 'Breakdown')}">${arcs}
      <text x="70" y="66" text-anchor="middle" class="donut-small">${esc(opts.center || 'Total')}</text><text x="70" y="84" text-anchor="middle" class="donut-big">${esc(moneyShort(total))}</text></svg>
    <div class="donut-legend">${top.map((it, i) => `<div><i style="background:${it.color || PALETTE[i % PALETTE.length]}"></i><span>${esc(it.label)}</span><b>${pct(it.value, total)}%</b></div>`).join('')}</div></div>`;
}

/* horizontal bars list: items [{label, value, sub?, color?, max?}] */
function hbars(items, opts = {}) {
  const max = Math.max(1, ...items.map(i => i.max || i.value));
  if (!items.length) return `<div class="empty small">${esc(opts.empty || 'No data yet.')}</div>`;
  return items.map((it, i) => `<div class="hbar"><div class="hbar-top"><span>${esc(it.label)}</span><b>${esc(it.text || money(it.value))}</b></div>
    <div class="track"><i style="width:${clamp(it.value / max * 100, it.value ? 2 : 0, 100)}%;background:${it.color || 'linear-gradient(90deg,var(--a),var(--b))'};animation-delay:${i * 50}ms"></i></div>${it.sub ? `<div class="hbar-sub">${esc(it.sub)}</div>` : ''}</div>`).join('');
}
function legend(series) {
  return series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
}
function ring(p, size = 54, color = 'var(--a)') {
  const r = size / 2 - 5, C = 2 * Math.PI * r, v = clamp(p, 0, 100);
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="ring"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="6"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(v / 100 * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})" class="ring-arc"/>
    <text x="50%" y="54%" text-anchor="middle" class="ring-txt">${Math.round(p)}%</text></svg>`;
}
