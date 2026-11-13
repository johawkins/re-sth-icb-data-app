// Sheffield Teaching Hospitals NHS Foundation Trust — ICB Exec Briefing
// Tableau viz-extension. Attempts live VDS query; falls back to spec values.
(function () {
  'use strict';

  const PAL = {
    primary: '#003399', success: '#00703c', danger: '#d4351c',
    warning: '#f4a100', bg: '#ffffff', text: '#1a1a2e',
    muted: '#767676', grid: '#e8e8e8',
  };

  const KPI_CFG = [
    { key: 'rtt',     label: 'RTT 18-week', unit: '%',  target: 92,   value: 71.0, status: 'fail', delta: '−21 pts' },
    { key: 'ae',      label: 'A&E 4-hour',  unit: '%',  target: 95,   value: 77.0, status: 'fail', delta: '−18 pts' },
    { key: 'cancer',  label: 'Cancer 2ww',  unit: '%',  target: 93,   value: 84.0, status: 'fail', delta: '−9 pts'  },
    { key: 'finance', label: 'Finance',     unit: '£m', target: null, value: 1.4,  status: 'pass', delta: '+£1.4m'  },
  ];

  const HEADLINE = 'All three operational standards failing · RTT −21 pts · A&E −18 pts · Cancer −9 pts · Finance £1.4m favourable';

  const FIN_DATA = [
    { name: 'Elective Care',      v:  0.6 },
    { name: 'Emergency Care',     v: -0.3 },
    { name: 'Cancer Services',    v:  0.4 },
    { name: 'Mental Health',      v:  0.2 },
    { name: 'Community Services', v: -0.1 },
    { name: 'Diagnostics',        v:  0.3 },
    { name: 'Corporate',          v:  0.3 },
  ];

  const RTT_DATA = [
    'May-25','Jun-25','Jul-25','Aug-25','Sep-25','Oct-25',
    'Nov-25','Dec-25','Jan-26','Feb-26','Mar-26','Apr-26',
    'May-26','Jun-26','Jul-26','Aug-26','Sep-26','Oct-26',
  ].map((m, i) => ({ month: m, value: [78,77,76,75,74,74,73,73,72,72,72,71,71,72,71,71,71,71][i] }));

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k === 'className') n.className = v;
      else n.setAttribute(k, v);
    });
    if (children) [].concat(children).forEach(c => {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function renderError(msg) {
    const root = document.getElementById('app');
    root.textContent = '';
    root.appendChild(el('div', { style: { padding: '24px', color: PAL.danger, fontFamily: 'sans-serif', fontSize: '14px' } },
      [el('strong', {}, ['Error: ']), msg]));
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      body{background:${PAL.bg};color:${PAL.text};font-family:'Segoe UI',Arial,sans-serif;font-size:13px}
      #app{width:100%;height:100vh;display:flex;flex-direction:column;overflow:hidden}
      .hdr{background:${PAL.primary};color:#fff;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
      .hdr-org{font-size:14px;font-weight:700}
      .hdr-period{font-size:11px;opacity:.8}
      .kpi-row{display:flex;gap:10px;padding:12px 20px 0;flex-shrink:0}
      .kpi{flex:1;border:1.5px solid ${PAL.grid};border-radius:6px;padding:12px 14px 10px;background:#fff;position:relative}
      .kpi-lbl{font-size:10px;font-weight:700;color:${PAL.muted};text-transform:uppercase;letter-spacing:.06em;display:flex;align-items:center;gap:5px}
      .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
      .kpi-val{font-size:34px;font-weight:700;line-height:1.1;margin-top:5px;font-variant-numeric:tabular-nums}
      .kpi-unit{font-size:14px;font-weight:400;margin-left:1px}
      .kpi-delta{font-size:11px;font-weight:600;margin-top:3px}
      .hero{flex:1 1 auto;padding:12px 20px 0;display:flex;flex-direction:column;min-height:0}
      .sec-title{font-size:10px;font-weight:700;color:${PAL.muted};text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
      .chart-wrap{flex:1 1 auto;min-height:0;position:relative}
      .chart-wrap svg{display:block;width:100%;height:100%}
      .fin{padding:10px 20px 0;flex-shrink:0}
      .fin-row{display:flex;align-items:center;gap:6px;margin-bottom:3px}
      .fin-lbl{width:130px;font-size:10px;text-align:right;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .fin-track{flex:1;position:relative;height:12px}
      .fin-zero{position:absolute;left:50%;top:0;bottom:0;width:1px;background:#bbb}
      .fin-bar{position:absolute;height:8px;top:2px;border-radius:1px}
      .fin-val{font-size:10px;color:${PAL.muted};white-space:nowrap}
      .footer{margin:10px 20px 12px;padding:8px 12px;border-left:4px solid ${PAL.primary};background:#f0f4ff;font-size:11px;font-weight:600;color:${PAL.text};border-radius:0 4px 4px 0;flex-shrink:0;line-height:1.4}
    `;
    document.head.appendChild(s);
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  function buildHeader(root) {
    root.appendChild(el('div', { className: 'hdr' }, [
      el('span', { className: 'hdr-org' }, ['Sheffield Teaching Hospitals NHS FT']),
      el('span', { className: 'hdr-period' }, ['ICB Exec Briefing · Oct 2026']),
    ]));
  }

  // ── KPI tiles ──────────────────────────────────────────────────────────────
  function buildKpiRow(root, kpis) {
    const row = el('div', { className: 'kpi-row' });
    kpis.forEach(k => {
      const color = k.status === 'pass' ? PAL.success : PAL.danger;
      const tile = el('div', { className: 'kpi' }, [
        el('div', { className: 'kpi-lbl' }, [
          el('span', { className: 'dot', style: { background: color } }),
          k.label,
        ]),
        el('div', { className: 'kpi-val' }, [
          String(k.value),
          el('span', { className: 'kpi-unit' }, [k.unit]),
        ]),
        el('div', { className: 'kpi-delta', style: { color } }, [k.delta]),
      ]);
      if (k.target != null) {
        tile.title = `Target: ${k.target}${k.unit}`;
      }
      row.appendChild(tile);
    });
    root.appendChild(row);
  }

  // ── RTT trend (SVG) ────────────────────────────────────────────────────────
  function buildRttChart(root, data) {
    const section = el('div', { className: 'hero' });
    section.appendChild(el('div', { className: 'sec-title' }, ['RTT 18-week compliance trend (% within 18 weeks)']));
    const wrap = el('div', { className: 'chart-wrap' });
    section.appendChild(wrap);
    root.appendChild(section);

    function draw() {
      wrap.textContent = '';
      const W = wrap.clientWidth || 580;
      const H = wrap.clientHeight || 180;
      const P = { t: 18, r: 68, b: 32, l: 38 };
      const iw = W - P.l - P.r, ih = H - P.t - P.b;
      const NS = 'http://www.w3.org/2000/svg';
      const minV = 60, maxV = 100, TARGET = 92;

      function xs(i) { return P.l + (i / (data.length - 1)) * iw; }
      function ys(v) { return P.t + (1 - (v - minV) / (maxV - minV)) * ih; }
      function svgEl(tag, a) {
        const n = document.createElementNS(NS, tag);
        if (a) Object.entries(a).forEach(([k, v]) => n.setAttribute(k, v));
        return n;
      }

      const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });

      // Grid + Y labels
      [60, 70, 80, 90, 100].forEach(t => {
        const y = ys(t);
        svg.appendChild(svgEl('line', { x1: P.l, y1: y, x2: P.l + iw, y2: y, stroke: PAL.grid, 'stroke-width': 1 }));
        const lbl = svgEl('text', { x: P.l - 4, y: y + 4, 'text-anchor': 'end', 'font-size': 9, fill: PAL.muted });
        lbl.textContent = t + '%';
        svg.appendChild(lbl);
      });

      // Target line
      const ty = ys(TARGET);
      svg.appendChild(svgEl('line', { x1: P.l, y1: ty, x2: P.l + iw, y2: ty, stroke: PAL.primary, 'stroke-width': 1.5, 'stroke-dasharray': '5 3' }));
      const tlbl = svgEl('text', { x: P.l + iw + 4, y: ty + 4, 'font-size': 9, fill: PAL.primary, 'font-weight': 700 });
      tlbl.textContent = '92%';
      svg.appendChild(tlbl);
      const tlbl2 = svgEl('text', { x: P.l + iw + 4, y: ty + 14, 'font-size': 9, fill: PAL.primary });
      tlbl2.textContent = 'target';
      svg.appendChild(tlbl2);

      // X labels (every 3rd)
      data.forEach((d, i) => {
        if (i % 3 !== 0 && i !== data.length - 1) return;
        const lbl = svgEl('text', { x: xs(i), y: P.t + ih + 18, 'text-anchor': 'middle', 'font-size': 9, fill: PAL.muted });
        lbl.textContent = d.month;
        svg.appendChild(lbl);
      });

      // Area fill
      const pts = data.map((d, i) => `${xs(i).toFixed(1)},${ys(d.value).toFixed(1)}`).join(' ');
      const lx = xs(data.length - 1), by = ys(minV);
      svg.appendChild(svgEl('polygon', { points: `${P.l},${by} ${pts} ${lx},${by}`, fill: PAL.primary, opacity: 0.07 }));

      // Line
      const d_ = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(d.value).toFixed(1)}`).join(' ');
      svg.appendChild(svgEl('path', { d: d_, stroke: PAL.primary, 'stroke-width': 2, fill: 'none' }));

      // Last value dot + annotation
      const last = data[data.length - 1];
      const lxi = xs(data.length - 1), lyi = ys(last.value);
      svg.appendChild(svgEl('circle', { cx: lxi, cy: lyi, r: 4, fill: PAL.danger }));
      const ann = svgEl('text', { x: lxi - 4, y: lyi - 8, 'text-anchor': 'end', 'font-size': 9, fill: PAL.danger, 'font-weight': 700 });
      ann.textContent = last.value + '%';
      svg.appendChild(ann);

      wrap.appendChild(svg);
    }

    draw();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(draw).observe(wrap);
    }
  }

  // ── Finance diverging bars ─────────────────────────────────────────────────
  function buildFinanceBars(root, finData) {
    const section = el('div', { className: 'fin' });
    section.appendChild(el('div', { className: 'sec-title' }, ['Finance variance by programme (£m)']));
    const max = Math.max(...finData.map(d => Math.abs(d.v)));
    finData.forEach(d => {
      const pct = Math.round((Math.abs(d.v) / max) * 46); // 46% half-width
      const isPos = d.v >= 0;
      const color = isPos ? PAL.success : PAL.danger;
      const bar = el('div', { className: 'fin-bar', style: {
        width: pct + '%',
        background: color,
        [isPos ? 'left' : 'right']: '50%',
      }});
      const track = el('div', { className: 'fin-track' }, [
        el('div', { className: 'fin-zero' }),
        bar,
      ]);
      section.appendChild(el('div', { className: 'fin-row' }, [
        el('div', { className: 'fin-lbl' }, [d.name]),
        track,
        el('div', { className: 'fin-val' }, [(isPos ? '+' : '') + d.v.toFixed(1)]),
      ]));
    });
    root.appendChild(section);
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  function buildFooter(root, text) {
    root.appendChild(el('div', { className: 'footer' }, [text]));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render(kpis, rtt, fin, headline) {
    const root = document.getElementById('app');
    root.textContent = '';
    injectStyles();
    buildHeader(root);
    buildKpiRow(root, kpis);
    buildRttChart(root, rtt);
    buildFinanceBars(root, fin);
    buildFooter(root, headline);
  }

  // ── Init: try Tableau Extensions API, fall back to spec constants ──────────
  function tryLiveInit() {
    if (typeof tableau === 'undefined' || !tableau.extensions) {
      render(KPI_CFG, RTT_DATA, FIN_DATA, HEADLINE);
      return;
    }
    tableau.extensions.initializeAsync().then(function () {
      // Try to pull live waiting-times data for RTT trend
      tableau.extensions.workbook.getAllDataSourcesAsync().then(function (dsList) {
        const ds = dsList.find(d => d.name && d.name.toLowerCase().includes('waiting'));
        if (!ds) { render(KPI_CFG, RTT_DATA, FIN_DATA, HEADLINE); return; }
        ds.queryAsync({
          fields: [{ fieldName: 'month' }, { fieldName: 'breach_flag' }, { fieldName: 'patient_count' }],
          filters: [],
          aggregation: { measures: [{ fieldName: 'patient_count', aggregation: 'SUM' }] },
          sort: [{ fieldName: 'month', sortDirection: 'ascending' }],
          maxRows: 36,
        }).then(function (res) {
          // best-effort parse; fall back on any error
          try {
            const rows = res.data || [];
            if (rows.length < 3) throw new Error('too few rows');
            const byMonth = {};
            rows.forEach(r => {
              const m = r['month'] || r[0]; const pc = +(r['patient_count'] || r[2] || 0);
              const bf = r['breach_flag'] || r[1];
              if (!byMonth[m]) byMonth[m] = { total: 0, breach: 0 };
              byMonth[m].total += pc;
              if (bf === true || bf === 'true' || bf === 1) byMonth[m].breach += pc;
            });
            const rttLive = Object.entries(byMonth).slice(-18).map(([m, v]) => ({
              month: m, value: v.total ? Math.round((1 - v.breach / v.total) * 100) : 71,
            }));
            render(KPI_CFG, rttLive.length >= 3 ? rttLive : RTT_DATA, FIN_DATA, HEADLINE);
          } catch (_) { render(KPI_CFG, RTT_DATA, FIN_DATA, HEADLINE); }
        }).catch(function () { render(KPI_CFG, RTT_DATA, FIN_DATA, HEADLINE); });
      }).catch(function () { render(KPI_CFG, RTT_DATA, FIN_DATA, HEADLINE); });
    }).catch(function () {
      render(KPI_CFG, RTT_DATA, FIN_DATA, HEADLINE);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryLiveInit);
  } else {
    tryLiveInit();
  }
}());
