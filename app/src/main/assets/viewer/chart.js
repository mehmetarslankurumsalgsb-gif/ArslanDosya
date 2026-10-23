// ArslanDosya — sunumlardaki grafikleri SVG olarak çizer (sütun, çubuk, çizgi, alan, pasta, halka)
var Chart = (function () {
  function txt(el) { return el ? X.all(el, 't').map(function (t) { return t.textContent; }).join('') : ''; }

  function pts(ref) {
    var out = [];
    if (!ref) return out;
    var cache = X.first(ref, 'numCache') || X.first(ref, 'strCache') || X.first(ref, 'multiLvlStrCache');
    if (!cache) {
      var lit = X.first(ref, 'numLit') || X.first(ref, 'strLit');
      cache = lit;
    }
    if (!cache) return out;
    var lvl = X.first(cache, 'lvl');
    var holder = lvl || cache;
    var count = X.kid(cache, 'ptCount');
    var n = count ? X.num(count, 'val', 0) : 0;
    X.kids(holder, 'pt').forEach(function (p) {
      var i = X.num(p, 'idx', out.length);
      var v = X.kid(p, 'v');
      out[i] = v ? v.textContent : '';
      if (i + 1 > n) n = i + 1;
    });
    for (var k = 0; k < n; k++) if (out[k] === undefined) out[k] = '';
    return out;
  }

  function fmt(v) {
    if (v === null || isNaN(v)) return '';
    var a = Math.abs(v);
    var d = a >= 100 || Math.round(v) === v ? 0 : (a >= 1 ? 1 : 2);
    return v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: d });
  }

  function nice(min, max) {
    if (min === max) { max = min + 1; }
    var span = max - min;
    var step = Math.pow(10, Math.floor(Math.log10(span / 5)));
    var err = span / 5 / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    var ticks = [];
    for (var t = lo; t <= hi + step / 2; t += step) ticks.push(+t.toFixed(10));
    return { lo: lo, hi: hi, ticks: ticks };
  }

  function e(s) { return esc(String(s)); }

  function render(chartDoc, W, H, ctx) {
    var palette = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(function (a) { return '#' + (ctx.theme.colors[a] || '888888'); });
    function shade(c, i) {
      if (i < 6) return c;
      var rgb = Colors.hexToRgb(c.replace('#', '')).map(function (v) { return v * 0.7; });
      return '#' + Colors.rgbToHex(rgb);
    }
    var chart = X.first(chartDoc, 'chart');
    var plot = X.kid(chart, 'plotArea');
    if (!plot) return '';
    var titleEl = X.kid(chart, 'title');
    var autoDel = X.kid(chart, 'autoTitleDeleted');
    var title = titleEl ? txt(titleEl) : '';
    var types = X.kids(plot).filter(function (k) { return /Chart$/.test(k.localName); });
    if (!types.length) return '';
    var series = [];
    types.forEach(function (tp) {
      var kind = tp.localName.replace('3D', '');
      var barDir = X.kid(tp, 'barDir'), grouping = X.kid(tp, 'grouping');
      var dl = X.kid(tp, 'dLbls');
      X.kids(tp, 'ser').forEach(function (s) {
        var name = txt(X.kid(s, 'tx')) || pts(X.kid(s, 'tx'))[0] || '';
        var cats = pts(X.kid(s, 'cat'));
        var vals = pts(X.kid(s, 'val')).map(function (v) { return v === '' ? null : parseFloat(v); });
        var sp = X.kid(s, 'spPr');
        var col = sp ? firstColor(X.kid(sp, 'solidFill'), ctx) : null;
        if (!col && sp) { var lnf = X.path(sp, 'ln', 'solidFill'); if (lnf) col = firstColor(lnf, ctx); }
        var dpts = {};
        X.kids(s, 'dPt').forEach(function (d) {
          var c = firstColor(X.path(d, 'spPr', 'solidFill'), ctx);
          if (c) dpts[X.num(X.kid(d, 'idx'), 'val', 0)] = '#' + c.hex;
        });
        var sdl = X.kid(s, 'dLbls') || dl;
        var showVal = sdl && X.kid(sdl, 'showVal') && X.attr(X.kid(sdl, 'showVal'), 'val') !== '0';
        var showPct = sdl && X.kid(sdl, 'showPercent') && X.attr(X.kid(sdl, 'showPercent'), 'val') !== '0';
        series.push({
          kind: kind, dir: barDir ? barDir.getAttribute('val') : 'col',
          grouping: grouping ? grouping.getAttribute('val') : 'clustered',
          name: name, cats: cats, vals: vals, color: col ? '#' + col.hex : null, dpts: dpts,
          showVal: !!showVal, showPct: !!showPct, hole: X.kid(tp, 'holeSize') ? X.num(X.kid(tp, 'holeSize'), 'val', 50) : 50
        });
      });
    });
    if (!series.length) return '';
    series.forEach(function (s, i) { if (!s.color) s.color = shade(palette[i % 6], i); });

    var fs = Math.max(16, Math.min(W, H) / 20);
    var o = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H +
      '" font-family="Calibri,Carlito,Roboto,Arial,sans-serif" font-size="' + fs.toFixed(1) + '">'];
    var top = 6;
    if (title && !(autoDel && X.attr(autoDel, 'val') === '1')) {
      o.push('<text x="' + W / 2 + '" y="' + (fs * 1.4) + '" text-anchor="middle" font-size="' + (fs * 1.3).toFixed(1) + '" fill="#333">' + e(title) + '</text>');
      top = fs * 2.2;
    }
    var legend = X.kid(chart, 'legend');
    var kind = series[0].kind;
    var isPie = kind === 'pieChart' || kind === 'doughnutChart' || kind === 'ofPieChart';
    var cats = series[0].cats.length ? series[0].cats : series[0].vals.map(function (_, i) { return String(i + 1); });
    var legendItems = isPie ? cats.map(function (c, i) { return { name: c, color: series[0].dpts[i] || shade(palette[i % 6], i) }; })
      : series.map(function (s) { return { name: s.name, color: s.color }; });
    var bottom = H - 6;
    if (legend && legendItems.length) {
      var lh = fs * 1.6;
      var x = 0, rows = [[]], rowW = [0];
      legendItems.forEach(function (it) {
        var w = fs * 1.2 + it.name.length * fs * 0.55 + fs;
        if (rowW[rowW.length - 1] + w > W - 10 && rows[rows.length - 1].length) { rows.push([]); rowW.push(0); }
        rows[rows.length - 1].push({ it: it, w: w });
        rowW[rowW.length - 1] += w;
      });
      bottom = H - rows.length * lh - 4;
      rows.forEach(function (r, ri) {
        var cx = (W - rowW[ri]) / 2, cy = bottom + ri * lh + lh * 0.7;
        r.forEach(function (c) {
          o.push('<rect x="' + cx.toFixed(1) + '" y="' + (cy - fs * 0.75).toFixed(1) + '" width="' + (fs * 0.8).toFixed(1) + '" height="' + (fs * 0.8).toFixed(1) + '" fill="' + c.it.color + '"/>');
          o.push('<text x="' + (cx + fs * 1.1).toFixed(1) + '" y="' + cy.toFixed(1) + '" fill="#444">' + e(c.it.name) + '</text>');
          cx += c.w;
        });
      });
    }

    if (isPie) {
      var s0 = series[0];
      var total = s0.vals.reduce(function (a, v) { return a + (v > 0 ? v : 0); }, 0) || 1;
      var cx2 = W / 2, cy2 = (top + bottom) / 2, r = Math.max(10, Math.min(W, bottom - top) / 2 - fs);
      var a0 = -Math.PI / 2;
      s0.vals.forEach(function (v, i) {
        if (!(v > 0)) return;
        var a1 = a0 + v / total * Math.PI * 2;
        var col = s0.dpts[i] || shade(palette[i % 6], i);
        var large = a1 - a0 > Math.PI ? 1 : 0;
        if (v / total > 0.9999) {
          o.push('<circle cx="' + cx2 + '" cy="' + cy2 + '" r="' + r + '" fill="' + col + '" stroke="#fff" stroke-width="1.5"/>');
        } else {
          o.push('<path d="M' + cx2 + ',' + cy2 + ' L' + (cx2 + r * Math.cos(a0)).toFixed(2) + ',' + (cy2 + r * Math.sin(a0)).toFixed(2) +
            ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + (cx2 + r * Math.cos(a1)).toFixed(2) + ',' + (cy2 + r * Math.sin(a1)).toFixed(2) + ' Z" fill="' + col + '" stroke="#fff" stroke-width="1.5"/>');
        }
        if (s0.showVal || s0.showPct) {
          var am = (a0 + a1) / 2, lr = kind === 'doughnutChart' ? r * (1 - s0.hole / 200) : r * 0.65;
          var label = s0.showPct ? Math.round(v / total * 100) + '%' : fmt(v);
          o.push('<text x="' + (cx2 + lr * Math.cos(am)).toFixed(1) + '" y="' + (cy2 + lr * Math.sin(am) + fs * 0.35).toFixed(1) + '" text-anchor="middle" fill="#fff" font-weight="700">' + e(label) + '</text>');
        }
        a0 = a1;
      });
      if (kind === 'doughnutChart') o.push('<circle cx="' + cx2 + '" cy="' + cy2 + '" r="' + (r * s0.hole / 100).toFixed(1) + '" fill="#fff"/>');
      o.push('</svg>');
      return o.join('');
    }

    // Eksenli grafikler
    var horizontal = series.some(function (s) { return s.kind === 'barChart' && s.dir === 'bar'; });
    var stacked = series.some(function (s) { return s.grouping === 'stacked' || s.grouping === 'percentStacked'; });
    var pct = series.some(function (s) { return s.grouping === 'percentStacked'; });
    var n = cats.length;
    var mn = 0, mx = 0;
    if (stacked) {
      for (var i = 0; i < n; i++) {
        var pos = 0, neg = 0;
        series.forEach(function (s) { var v = s.vals[i] || 0; if (v > 0) pos += v; else neg += v; });
        mx = Math.max(mx, pos); mn = Math.min(mn, neg);
      }
      if (pct) { mx = 100; mn = 0; }
    } else {
      series.forEach(function (s) { s.vals.forEach(function (v) { if (v !== null) { mx = Math.max(mx, v); mn = Math.min(mn, v); } }); });
    }
    var sc = nice(mn, mx);
    var labW = Math.max.apply(null, sc.ticks.map(function (t) { return fmt(t).length; })) * fs * 0.55 + 8;
    var catLabW = horizontal ? Math.min(W * 0.3, Math.max.apply(null, cats.map(function (c) { return String(c).length; })) * fs * 0.55 + 8) : 0;
    var L = horizontal ? catLabW + 4 : labW + 4, R = W - 10, T = top + 4, B = bottom - (horizontal ? fs * 1.5 : fs * 1.8);
    function vy(v) { return B - (v - sc.lo) / (sc.hi - sc.lo) * (B - T); }
    function vx(v) { return L + (v - sc.lo) / (sc.hi - sc.lo) * (R - L); }
    // Izgara ve eksen yazıları
    sc.ticks.forEach(function (t) {
      if (horizontal) {
        var xx = vx(t);
        o.push('<line x1="' + xx.toFixed(1) + '" y1="' + T + '" x2="' + xx.toFixed(1) + '" y2="' + B + '" stroke="#ddd"/>');
        o.push('<text x="' + xx.toFixed(1) + '" y="' + (B + fs * 1.2).toFixed(1) + '" text-anchor="middle" fill="#666">' + e(fmt(t)) + (pct ? '%' : '') + '</text>');
      } else {
        var yy = vy(t);
        o.push('<line x1="' + L + '" y1="' + yy.toFixed(1) + '" x2="' + R + '" y2="' + yy.toFixed(1) + '" stroke="#ddd"/>');
        o.push('<text x="' + (L - 6) + '" y="' + (yy + fs * 0.35).toFixed(1) + '" text-anchor="end" fill="#666">' + e(fmt(t)) + (pct ? '%' : '') + '</text>');
      }
    });
    var band = ((horizontal ? B - T : R - L) / Math.max(1, n));
    cats.forEach(function (c, i) {
      var label = String(c);
      var maxChars = Math.max(3, Math.floor(band / (fs * 0.5)));
      if (!horizontal && label.length > maxChars) label = label.substring(0, maxChars - 1) + '…';
      if (horizontal) o.push('<text x="' + (L - 6) + '" y="' + (T + band * (n - 1 - i + 0.5) + fs * 0.35).toFixed(1) + '" text-anchor="end" fill="#444">' + e(label) + '</text>');
      else o.push('<text x="' + (L + band * (i + 0.5)).toFixed(1) + '" y="' + (B + fs * 1.3).toFixed(1) + '" text-anchor="middle" fill="#444">' + e(label) + '</text>');
    });
    var bars = series.filter(function (s) { return s.kind === 'barChart'; });
    var lines = series.filter(function (s) { return s.kind === 'lineChart' || s.kind === 'areaChart' || s.kind === 'scatterChart'; });
    var gap = band * 0.25, inner = band - gap, bw = stacked ? inner : inner / Math.max(1, bars.length);
    var stackPos = [], stackNeg = [];
    bars.forEach(function (s, si) {
      s.vals.forEach(function (v, i) {
        if (v === null || i >= n) return;
        var val = v;
        if (pct) { var sum = 0; bars.forEach(function (b) { sum += Math.abs(b.vals[i] || 0); }); val = sum ? v / sum * 100 : 0; }
        var base = 0;
        if (stacked) { if (val >= 0) { base = stackPos[i] || 0; stackPos[i] = base + val; } else { base = stackNeg[i] || 0; stackNeg[i] = base + val; } }
        var col = s.dpts[i] || s.color;
        var x0, y0, w0, h0;
        if (horizontal) {
          var p1 = vx(base), p2 = vx(base + val);
          y0 = T + band * (n - 1 - i) + gap / 2 + (stacked ? 0 : bw * (bars.length - 1 - si)); h0 = bw;
          x0 = Math.min(p1, p2); w0 = Math.abs(p2 - p1);
        } else {
          var q1 = vy(base), q2 = vy(base + val);
          x0 = L + band * i + gap / 2 + (stacked ? 0 : bw * si); w0 = bw;
          y0 = Math.min(q1, q2); h0 = Math.abs(q2 - q1);
        }
        o.push('<rect x="' + x0.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + Math.max(0.5, w0).toFixed(1) + '" height="' + Math.max(0.5, h0).toFixed(1) + '" fill="' + col + '"/>');
        if (s.showVal) {
          if (horizontal) o.push('<text x="' + (x0 + w0 + 4).toFixed(1) + '" y="' + (y0 + h0 / 2 + fs * 0.35).toFixed(1) + '" fill="#333">' + e(fmt(v)) + '</text>');
          else o.push('<text x="' + (x0 + w0 / 2).toFixed(1) + '" y="' + (stacked ? y0 + h0 / 2 + fs * 0.35 : y0 - 4).toFixed(1) + '" text-anchor="middle" fill="' + (stacked ? '#fff' : '#333') + '">' + e(fmt(v)) + '</text>');
        }
      });
    });
    lines.forEach(function (s) {
      var pts2 = [];
      s.vals.forEach(function (v, i) {
        if (v === null || i >= n) return;
        pts2.push([L + band * (i + 0.5), vy(v)]);
      });
      if (!pts2.length) return;
      if (s.kind === 'areaChart') {
        o.push('<path d="M' + pts2[0][0] + ',' + vy(Math.max(sc.lo, 0)) + ' ' + pts2.map(function (p) { return 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') +
          ' L' + pts2[pts2.length - 1][0] + ',' + vy(Math.max(sc.lo, 0)) + ' Z" fill="' + s.color + '" fill-opacity="0.7"/>');
      } else {
        o.push('<polyline fill="none" stroke="' + s.color + '" stroke-width="' + Math.max(2, fs / 5).toFixed(1) + '" points="' + pts2.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>');
        pts2.forEach(function (p) { o.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (fs / 4).toFixed(1) + '" fill="' + s.color + '"/>'); });
      }
      if (s.showVal) s.vals.forEach(function (v, i) {
        if (v === null) return;
        o.push('<text x="' + (L + band * (i + 0.5)).toFixed(1) + '" y="' + (vy(v) - fs * 0.6).toFixed(1) + '" text-anchor="middle" fill="#333">' + e(fmt(v)) + '</text>');
      });
    });
    o.push('<line x1="' + L + '" y1="' + B + '" x2="' + R + '" y2="' + B + '" stroke="#999"/>');
    o.push('</svg>');
    return o.join('');
  }

  return { render: render };
})();
