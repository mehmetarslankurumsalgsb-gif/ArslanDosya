// ArslanDosya — Word (.docx) görüntüleyici (kendi yazdığımız, dış kütüphanesiz)
var TW = 1 / 15;          // twip → px (96 dpi)
var D = { pack: null, styles: {}, defP: {}, defR: {}, num: {}, abstract: {}, rels: {}, theme: { major: 'Calibri Light', minor: 'Calibri' }, counters: {} };

// =================== Özellik okuma ===================

function on(el) {
  if (!el) return undefined;
  var v = X.attr(el, 'val');
  return !(v === '0' || v === 'false' || v === 'off' || v === 'none');
}

function rProps(rPr) {
  var o = {};
  if (!rPr) return o;
  var e;
  if ((e = X.kid(rPr, 'b'))) o.b = on(e);
  if ((e = X.kid(rPr, 'i'))) o.i = on(e);
  if ((e = X.kid(rPr, 'u'))) o.u = X.attr(e, 'val') !== 'none';
  if ((e = X.kid(rPr, 'strike'))) o.strike = on(e);
  if ((e = X.kid(rPr, 'dstrike'))) o.strike = on(e);
  if ((e = X.kid(rPr, 'caps'))) o.caps = on(e);
  if ((e = X.kid(rPr, 'smallCaps'))) o.smallCaps = on(e);
  if ((e = X.kid(rPr, 'vanish'))) o.hidden = on(e);
  if ((e = X.kid(rPr, 'sz'))) o.sz = X.num(e, 'val', 22) / 2;
  if ((e = X.kid(rPr, 'color'))) { var c = X.attr(e, 'val'); if (c && c !== 'auto') o.color = '#' + c; }
  if ((e = X.kid(rPr, 'highlight'))) {
    var hl = { yellow: '#FFFF00', green: '#00FF00', cyan: '#00FFFF', magenta: '#FF00FF', blue: '#0000FF', red: '#FF0000',
      darkBlue: '#00008B', darkCyan: '#008B8B', darkGreen: '#006400', darkMagenta: '#8B008B', darkRed: '#8B0000',
      darkYellow: '#808000', darkGray: '#A9A9A9', lightGray: '#D3D3D3', black: '#000000' }[X.attr(e, 'val')];
    if (hl) o.bg = hl;
  }
  if ((e = X.kid(rPr, 'shd'))) { var f = X.attr(e, 'fill'); if (f && f !== 'auto') o.bg = '#' + f; }
  if ((e = X.kid(rPr, 'vertAlign'))) o.vert = X.attr(e, 'val');
  if ((e = X.kid(rPr, 'rFonts'))) {
    var font = X.attr(e, 'ascii') || X.attr(e, 'hAnsi') || X.attr(e, 'cs');
    var th = X.attr(e, 'asciiTheme') || X.attr(e, 'hAnsiTheme');
    if (!font && th) font = /major/.test(th) ? D.theme.major : D.theme.minor;
    if (font) o.font = font;
  }
  return o;
}

function pProps(pPr) {
  var o = {};
  if (!pPr) return o;
  var e;
  if ((e = X.kid(pPr, 'jc'))) o.jc = X.attr(e, 'val');
  if ((e = X.kid(pPr, 'ind'))) {
    var l = X.attr(e, 'left') || X.attr(e, 'start'), r = X.attr(e, 'right') || X.attr(e, 'end');
    if (l !== null) o.indL = +l * TW;
    if (r !== null) o.indR = +r * TW;
    if (X.attr(e, 'hanging') !== null) { o.hanging = +X.attr(e, 'hanging') * TW; o.first = undefined; }
    if (X.attr(e, 'firstLine') !== null) { o.first = +X.attr(e, 'firstLine') * TW; o.hanging = undefined; }
  }
  if ((e = X.kid(pPr, 'spacing'))) {
    if (X.attr(e, 'before') !== null) o.before = +X.attr(e, 'before') * TW;
    if (X.attr(e, 'after') !== null) o.after = +X.attr(e, 'after') * TW;
    if (X.attr(e, 'beforeAutospacing') === '1') o.before = 14 * 4 / 3;
    if (X.attr(e, 'afterAutospacing') === '1') o.after = 14 * 4 / 3;
    if (X.attr(e, 'line') !== null) { o.line = +X.attr(e, 'line'); o.lineRule = X.attr(e, 'lineRule') || 'auto'; }
  }
  if ((e = X.kid(pPr, 'numPr'))) {
    var id = X.kid(e, 'numId'), lv = X.kid(e, 'ilvl');
    if (id) o.numId = X.attr(id, 'val');
    if (lv) o.ilvl = +X.attr(lv, 'val');
  }
  if ((e = X.kid(pPr, 'shd'))) { var f = X.attr(e, 'fill'); if (f && f !== 'auto') o.bg = '#' + f; }
  if ((e = X.kid(pPr, 'pBdr'))) {
    o.borders = {};
    ['top', 'bottom', 'left', 'right'].forEach(function (s) {
      var b = X.kid(e, s);
      if (b && X.attr(b, 'val') && X.attr(b, 'val') !== 'nil' && X.attr(b, 'val') !== 'none') {
        var c = X.attr(b, 'color');
        o.borders[s] = Math.max(1, X.num(b, 'sz', 4) / 8 * 4 / 3).toFixed(1) + 'px solid ' + (c && c !== 'auto' ? '#' + c : '#000');
      }
    });
  }
  if ((e = X.kid(pPr, 'pageBreakBefore')) && on(e)) o.pageBreak = true;
  if ((e = X.kid(pPr, 'contextualSpacing'))) o.ctx = on(e);
  return o;
}

function merge(a, b) {
  var o = {};
  for (var k in a) o[k] = a[k];
  for (var k2 in b) if (b[k2] !== undefined) o[k2] = b[k2];
  return o;
}

// Stil zinciri (basedOn) çözülmüş hâli
function styleOf(id, kind) {
  var s = D.styles[id];
  if (!s) return { p: {}, r: {}, name: '' };
  if (s.resolved) return s.resolved;
  s.resolved = { p: {}, r: {}, name: s.name };   // döngü koruması
  var base = s.basedOn ? styleOf(s.basedOn, kind) : { p: {}, r: {} };
  s.resolved = { p: merge(base.p, s.p), r: merge(base.r, s.r), name: s.name, numId: s.p.numId || base.p.numId };
  return s.resolved;
}

// =================== Numaralandırma ===================

function roman(n) {
  var m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  var s = '';
  m.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } });
  return s;
}

function fmtNum(n, f) {
  switch (f) {
    case 'lowerLetter': return String.fromCharCode(96 + ((n - 1) % 26) + 1);
    case 'upperLetter': return String.fromCharCode(64 + ((n - 1) % 26) + 1);
    case 'lowerRoman': return roman(n).toLowerCase();
    case 'upperRoman': return roman(n);
    case 'decimalZero': return (n < 10 ? '0' : '') + n;
    case 'none': return '';
    default: return String(n);
  }
}

function bulletChar(txt, font) {
  if (!txt) return '•';
  var c = txt.charAt(0);
  var code = c.charCodeAt(0);
  if (/symbol/i.test(font || '') || code >= 0xF000) {
    var map = { 0xF0B7: '•', 0xB7: '•', 0xF0A7: '▪', 0xA7: '▪', 0xF06F: 'o', 0xF0D8: '➢', 0xD8: '➢', 0xF0FC: '✓', 0xFC: '✓', 0xF076: '❖', 0xF06E: '■', 0xF0A8: '□' };
    return map[code] || '•';
  }
  if (/wingdings/i.test(font || '')) return { '§': '▪', 'Ø': '➢', 'ü': '✓', 'v': '❖', 'n': '■', 'q': '❑', 'l': '●', 'o': '○' }[c] || '•';
  return c;
}

function numLabel(numId, ilvl) {
  var num = D.num[numId];
  if (!num) return null;
  var abs = D.abstract[num.abs];
  if (!abs) return null;
  var lvl = (num.over && num.over[ilvl]) || abs[ilvl];
  if (!lvl) return null;
  var key = num.abs;
  var c = D.counters[key] || (D.counters[key] = []);
  c[ilvl] = (c[ilvl] === undefined ? lvl.start - 1 : c[ilvl]) + 1;
  for (var k = ilvl + 1; k < 9; k++) c[k] = undefined;
  if (lvl.fmt === 'bullet') return { text: bulletChar(lvl.text, lvl.font), lvl: lvl };
  var t = (lvl.text || '%' + (ilvl + 1) + '.').replace(/%(\d)/g, function (m, d) {
    var i = +d - 1;
    var L = abs[i] || {};
    return fmtNum(c[i] === undefined ? (L.start || 1) : c[i], i === ilvl ? lvl.fmt : (L.fmt || 'decimal'));
  });
  return { text: t, lvl: lvl };
}

// =================== Çizim ===================

function runCss(r) {
  var s = '';
  if (r.b) s += 'font-weight:700;';
  if (r.i) s += 'font-style:italic;';
  var deco = [];
  if (r.u) deco.push('underline');
  if (r.strike) deco.push('line-through');
  if (deco.length) s += 'text-decoration:' + deco.join(' ') + ';';
  if (r.caps) s += 'text-transform:uppercase;';
  if (r.smallCaps) s += 'font-variant:small-caps;';
  if (r.sz) s += 'font-size:' + (r.sz * 4 / 3).toFixed(2) + 'px;';
  if (r.color) s += 'color:' + r.color + ';';
  if (r.bg) s += 'background:' + r.bg + ';';
  if (r.font) s += "font-family:'" + r.font.replace(/'/g, '') + "',Calibri,Carlito,Roboto,Arial,sans-serif;";
  if (r.vert === 'superscript') s += 'vertical-align:super;font-size:70%;';
  else if (r.vert === 'subscript') s += 'vertical-align:sub;font-size:70%;';
  return s;
}

function imageFromDrawing(dr) {
  var blip = X.first(dr, 'blip');
  var id = blip && X.rid(blip, 'embed');
  var rel = id && D.rels[id];
  var ext = X.first(dr, 'extent');
  var w = ext ? X.num(ext, 'cx', 0) / 9525 : 0, h = ext ? X.num(ext, 'cy', 0) / 9525 : 0;
  if (!rel || rel.external || /\.(emf|wmf)$/i.test(rel.target)) {
    return Promise.resolve(w && h ? '<span class="imgph" style="width:' + w.toFixed(0) + 'px;height:' + h.toFixed(0) + 'px">Resim</span>' : '');
  }
  return D.pack.blobUrl(rel.target).then(function (url) {
    if (!url) return '';
    var anchor = X.kid(dr, 'anchor');
    return '<img class="' + (anchor ? 'anc' : 'inl') + '" src="' + url + '" style="width:' + w.toFixed(1) + 'px;height:' + h.toFixed(1) + 'px" alt="">';
  });
}

// Paragraf içindeki koşuları sırayla topla (köprü, alan, düzeltme izleri dahil)
function collectRuns(el, out) {
  X.kids(el).forEach(function (k) {
    var n = k.localName;
    if (n === 'r') out.push({ r: k });
    else if (n === 'hyperlink' || n === 'ins' || n === 'smartTag' || n === 'fldSimple' || n === 'customXml' || n === 'bdo' || n === 'dir') collectRuns(k, out);
    else if (n === 'sdt') collectRuns(X.kid(k, 'sdtContent') || k, out);
    else if (n === 'oMath' || n === 'oMathPara') out.push({ math: k });
  });
}

function renderParagraph(p, tableStyleR) {
  var pPr = X.kid(p, 'pPr');
  var direct = pProps(pPr);
  var styleId = pPr && X.kid(pPr, 'pStyle') ? X.attr(X.kid(pPr, 'pStyle'), 'val') : 'Normal';
  if (!D.styles[styleId]) styleId = D.defaultPStyle || styleId;
  var st = styleOf(styleId);
  var pp = merge(merge(D.defP, st.p), direct);
  var baseR = merge(merge(D.defR, tableStyleR || {}), st.r);
  var markR = pPr ? rProps(X.kid(pPr, 'rPr')) : {};

  var css = 'margin:0;';
  css += 'text-align:' + ({ center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[pp.jc] || 'left') + ';';
  var label = null;
  var numId = pp.numId, ilvl = pp.ilvl || 0;
  if (numId && numId !== '0') {
    label = numLabel(numId, ilvl);
    if (label && label.lvl) {
      if (direct.indL === undefined && label.lvl.indL !== undefined && st.p.indL === undefined) pp.indL = label.lvl.indL;
      if (direct.hanging === undefined && direct.first === undefined && label.lvl.hanging !== undefined) pp.hanging = label.lvl.hanging;
    }
  }
  var indL = pp.indL || 0, indR = pp.indR || 0;
  var first = pp.first || 0;
  if (pp.hanging) first = -pp.hanging;
  if (indL) css += 'padding-left:' + indL.toFixed(1) + 'px;';
  if (indR) css += 'padding-right:' + indR.toFixed(1) + 'px;';
  if (first) css += 'text-indent:' + first.toFixed(1) + 'px;';
  if (pp.before) css += 'margin-top:' + pp.before.toFixed(1) + 'px;';
  if (pp.after !== undefined) css += 'margin-bottom:' + pp.after.toFixed(1) + 'px;';
  if (pp.line) {
    if (pp.lineRule === 'auto') css += 'line-height:' + (pp.line / 240 * 1.15).toFixed(3) + ';';
    else css += 'line-height:' + (pp.line * TW).toFixed(1) + 'px;';
  } else css += 'line-height:1.15;';
  if (pp.bg) css += 'background:' + pp.bg + ';';
  if (pp.borders) for (var s in pp.borders) css += 'border-' + s + ':' + pp.borders[s] + ';padding-' + s + ':2px;';
  css += runCss(merge(baseR, markR)).replace(/background:[^;]+;/, '');

  var runs = [];
  collectRuns(p, runs);
  var parts = runs.map(function (item) {
    if (item.math) return Promise.resolve('<span class="math">' + esc(item.math.textContent) + '</span>');
    var r = item.r;
    var rPr = X.kid(r, 'rPr');
    var rStyle = rPr && X.kid(rPr, 'rStyle') ? styleOf(X.attr(X.kid(rPr, 'rStyle'), 'val')).r : {};
    var rr = merge(merge(baseR, rStyle), rProps(rPr));
    if (rr.hidden) return Promise.resolve('');
    var pieces = [];
    X.kids(r).forEach(function (k) {
      var n = k.localName;
      if (n === 't') pieces.push(Promise.resolve(esc(k.textContent)));
      else if (n === 'tab') pieces.push(Promise.resolve('<span class="tab"></span>'));
      else if (n === 'br') pieces.push(Promise.resolve(X.attr(k, 'type') === 'page' ? '<span class="pgbr"></span>' : '<br>'));
      else if (n === 'cr') pieces.push(Promise.resolve('<br>'));
      else if (n === 'noBreakHyphen') pieces.push(Promise.resolve('‑'));
      else if (n === 'sym') pieces.push(Promise.resolve(bulletChar(String.fromCharCode(parseInt(X.attr(k, 'char') || '2022', 16)), X.attr(k, 'font'))));
      else if (n === 'drawing' || n === 'pict' || n === 'object') pieces.push(n === 'drawing' ? imageFromDrawing(k) : Promise.resolve(''));
      else if (n === 'AlternateContent') {
        var fb = X.kid(k, 'Choice') || X.kid(k, 'Fallback');
        var dr = fb && X.first(fb, 'drawing');
        if (dr) pieces.push(imageFromDrawing(dr));
      }
    });
    return Promise.all(pieces).then(function (a) {
      var html = a.join('');
      if (!html) return '';
      var c = runCss(rr);
      return c ? '<span style="' + c + '">' + html + '</span>' : html;
    });
  });
  return Promise.all(parts).then(function (a) {
    var inner = a.join('');
    var pre = '';
    if (label && label.text) {
      var lr = merge(baseR, label.lvl.r || {});
      pre = '<span class="num" style="' + runCss(lr) + 'text-indent:0;' + (first < 0 ? 'display:inline-block;min-width:' + (-first).toFixed(1) + 'px;' : 'margin-right:6px;') + '">' + esc(label.text) + '</span>';
    }
    if (!inner && !pre) inner = '&#8203;';
    var tag = /^heading\s*(\d)/i.test(st.name || '') || /^Heading(\d)/.test(styleId) ? 'h' + Math.min(6, +(RegExp.$1 || 1)) : 'p';
    return (pp.pageBreak ? '<div class="pgbr"></div>' : '') + '<' + tag + (pp.ctx ? ' data-cs="' + esc(styleId) + '"' : '') + ' style="' + css + '">' + pre + inner + '</' + tag + '>';
  });
}

function borderCss(el) {
  if (!el) return null;
  var v = X.attr(el, 'val');
  if (!v || v === 'nil' || v === 'none') return 'none';
  var c = X.attr(el, 'color');
  var w = Math.max(1, X.num(el, 'sz', 4) / 8 * 4 / 3);
  return w.toFixed(1) + 'px ' + (v === 'double' ? 'double' : /dash|dot/.test(v) ? 'dashed' : 'solid') + ' ' + (c && c !== 'auto' ? '#' + c : '#000');
}

function renderTable(tbl) {
  var tblPr = X.kid(tbl, 'tblPr');
  var styleId = tblPr && X.kid(tblPr, 'tblStyle') ? X.attr(X.kid(tblPr, 'tblStyle'), 'val') : null;
  var tst = styleId ? D.styles[styleId] : null;
  var tBorders = (tblPr && X.kid(tblPr, 'tblBorders')) || (tst && tst.tblBorders) || null;
  var styleR = styleId ? styleOf(styleId).r : {};
  var grid = X.all(X.kid(tbl, 'tblGrid'), 'gridCol').map(function (g) { return X.num(g, 'w', 0) * TW; });
  var total = grid.reduce(function (a, b) { return a + b; }, 0);
  var jc = tblPr && X.kid(tblPr, 'jc') ? X.attr(X.kid(tblPr, 'jc'), 'val') : null;
  var indEl = tblPr && X.kid(tblPr, 'tblInd');
  var ind = indEl ? X.num(indEl, 'w', 0) * TW : 0;
  var bd = {};
  ['top', 'bottom', 'left', 'right', 'insideH', 'insideV'].forEach(function (s) {
    bd[s] = tBorders ? borderCss(X.kid(tBorders, s) || (s === 'left' ? X.kid(tBorders, 'start') : s === 'right' ? X.kid(tBorders, 'end') : null)) : null;
  });
  var rows = X.kids(tbl, 'tr');
  // Tablo görünüm seçenekleri (başlık satırı, ilk sütun, bantlar)
  var look = tblPr && X.kid(tblPr, 'tblLook');
  var lookVal = look ? parseInt(X.attr(look, 'val') || '0', 16) : 0x04A0;
  function lookOn(name, bit, def) {
    if (!look) return def;
    var a = X.attr(look, name);
    if (a !== null) return a === '1' || a === 'true';
    return !!(lookVal & bit);
  }
  var useFirstRow = lookOn('firstRow', 0x20, true), useLastRow = lookOn('lastRow', 0x40, false);
  var useFirstCol = lookOn('firstColumn', 0x80, true), noHBand = lookOn('noHBand', 0x200, false);
  var cond = (tst && tst.cond) || {};
  var styleFill = null;
  if (tst) { var base = D.styles[styleId]; }
  // Dikey birleştirmeleri hesapla
  var vm = rows.map(function (tr) {
    var col = 0;
    return X.kids(tr, 'tc').map(function (tc) {
      var tcPr = X.kid(tc, 'tcPr');
      var span = tcPr && X.kid(tcPr, 'gridSpan') ? +X.attr(X.kid(tcPr, 'gridSpan'), 'val') : 1;
      var v = tcPr && X.kid(tcPr, 'vMerge');
      var info = { col: col, span: span, v: v ? (X.attr(v, 'val') === 'restart' ? 'restart' : 'cont') : null, tc: tc, rs: 1 };
      col += span;
      return info;
    });
  });
  for (var r = 0; r < vm.length; r++) {
    vm[r].forEach(function (c) {
      if (c.v !== 'restart') return;
      for (var r2 = r + 1; r2 < vm.length; r2++) {
        var below = vm[r2].filter(function (x) { return x.col === c.col; })[0];
        if (below && below.v === 'cont') { c.rs++; } else break;
      }
    });
  }
  var rowPromises = rows.map(function (tr, ri) {
    var trPr = X.kid(tr, 'trPr');
    var hEl = trPr && X.kid(trPr, 'trHeight');
    var h = hEl ? X.num(hEl, 'val', 0) * TW : 0;
    var cells = vm[ri].map(function (c) {
      if (c.v === 'cont') return Promise.resolve('');
      var tcPr = X.kid(c.tc, 'tcPr');
      var s = 'padding:2px 7px;vertical-align:top;';
      // Hangi koşullu biçimler geçerli?
      var applied = [];
      var dataRow = useFirstRow ? ri - 1 : ri;
      if (!noHBand && cond.band1Horz && dataRow >= 0 && dataRow % 2 === 0 && !(useLastRow && ri === rows.length - 1)) applied.push(cond.band1Horz);
      if (!noHBand && cond.band2Horz && dataRow >= 0 && dataRow % 2 === 1) applied.push(cond.band2Horz);
      if (useFirstCol && c.col === 0 && cond.firstCol) applied.push(cond.firstCol);
      if (useLastRow && ri === rows.length - 1 && cond.lastRow) applied.push(cond.lastRow);
      if (useFirstRow && ri === 0 && cond.firstRow) applied.push(cond.firstRow);
      var condR = {}, condFill = null;
      applied.forEach(function (a) { condR = merge(condR, a.r); if (a.fill) condFill = a.fill; });
      var sh = tcPr && X.kid(tcPr, 'shd');
      if (sh && X.attr(sh, 'fill') && X.attr(sh, 'fill') !== 'auto') s += 'background:#' + X.attr(sh, 'fill') + ';';
      else if (condFill) s += 'background:' + condFill + ';';
      var va = tcPr && X.kid(tcPr, 'vAlign');
      if (va) s += 'vertical-align:' + ({ center: 'middle', bottom: 'bottom' }[X.attr(va, 'val')] || 'top') + ';';
      var cb = tcPr && X.kid(tcPr, 'tcBorders');
      ['top', 'bottom', 'left', 'right'].forEach(function (side) {
        var b = cb ? borderCss(X.kid(cb, side) || (side === 'left' ? X.kid(cb, 'start') : side === 'right' ? X.kid(cb, 'end') : null)) : null;
        if (!b) {
          var outer = (side === 'top' && ri === 0) || (side === 'bottom' && ri + c.rs === rows.length) ||
            (side === 'left' && c.col === 0) || (side === 'right' && c.col + c.span >= grid.length);
          b = outer ? bd[side] : (side === 'top' || side === 'bottom' ? bd.insideH : bd.insideV);
        }
        if (b) s += 'border-' + side + ':' + b + ';';
      });
      var inner = X.kids(c.tc).filter(function (k) { return k.localName === 'p' || k.localName === 'tbl' || k.localName === 'sdt'; });
      return renderBlocks(inner, merge(styleR, condR)).then(function (html) {
        return '<td' + (c.span > 1 ? ' colspan="' + c.span + '"' : '') + (c.rs > 1 ? ' rowspan="' + c.rs + '"' : '') + ' style="' + s + '">' + html + '</td>';
      });
    });
    return Promise.all(cells).then(function (a) { return '<tr' + (h ? ' style="height:' + h.toFixed(1) + 'px"' : '') + '>' + a.join('') + '</tr>'; });
  });
  return Promise.all(rowPromises).then(function (a) {
    var tcss = 'border-collapse:collapse;table-layout:fixed;';
    if (total) tcss += 'width:' + total.toFixed(1) + 'px;';
    if (jc === 'center') tcss += 'margin-left:auto;margin-right:auto;';
    else if (ind) tcss += 'margin-left:' + ind.toFixed(1) + 'px;';
    return '<table class="wt" style="' + tcss + '"><colgroup>' + grid.map(function (w) { return '<col style="width:' + w.toFixed(1) + 'px">'; }).join('') + '</colgroup>' + a.join('') + '</table>';
  });
}

// Aynı stildeki ardışık paragraflar arasında boşluk olmasın (Word "contextualSpacing")
function fixContextual(root) {
  var els = root.querySelectorAll('[data-cs]');
  for (var i = 0; i < els.length; i++) {
    var a = els[i], b = a.nextElementSibling;
    if (b && b.getAttribute('data-cs') === a.getAttribute('data-cs')) {
      a.style.marginBottom = '0px';
      b.style.marginTop = '0px';
    }
  }
}

function renderBlocks(nodes, tableStyleR) {
  return Promise.all(nodes.map(function (n) {
    if (n.localName === 'p') return renderParagraph(n, tableStyleR);
    if (n.localName === 'tbl') return renderTable(n);
    if (n.localName === 'sdt') {
      var c = X.kid(n, 'sdtContent');
      return c ? renderBlocks(X.kids(c), tableStyleR) : '';
    }
    return '';
  })).then(function (a) { return a.join(''); });
}

// =================== Dosya okuma ===================

function readCond(s) {
  var out = {};
  X.kids(s, 'tblStylePr').forEach(function (t) {
    var sh = X.path(t, 'tcPr', 'shd');
    var fill = sh && X.attr(sh, 'fill') && X.attr(sh, 'fill') !== 'auto' ? '#' + X.attr(sh, 'fill') : null;
    var bd = X.path(t, 'tcPr', 'tcBorders');
    out[X.attr(t, 'type')] = { r: rProps(X.kid(t, 'rPr')), fill: fill, borders: bd };
  });
  return out;
}

function readStylesDoc(doc) {
  if (!doc) return;
  var dd = X.first(doc, 'docDefaults');
  if (dd) {
    D.defR = rProps(X.path(dd, 'rPrDefault', 'rPr'));
    D.defP = pProps(X.path(dd, 'pPrDefault', 'pPr'));
  }
  X.kids(doc.documentElement, 'style').forEach(function (s) {
    var id = X.attr(s, 'styleId');
    var bo = X.kid(s, 'basedOn');
    var nm = X.kid(s, 'name');
    D.styles[id] = {
      type: X.attr(s, 'type'),
      name: nm ? X.attr(nm, 'val') : id,
      basedOn: bo ? X.attr(bo, 'val') : null,
      p: pProps(X.kid(s, 'pPr')),
      r: rProps(X.kid(s, 'rPr')),
      tblBorders: X.path(s, 'tblPr', 'tblBorders'),
      cond: readCond(s)
    };
    if (X.attr(s, 'type') === 'paragraph' && X.attr(s, 'default') === '1') D.defaultPStyle = id;
  });
}

function readNumbering(doc) {
  if (!doc) return;
  function lvlInfo(l) {
    var st = X.kid(l, 'start'), nf = X.kid(l, 'numFmt'), lt = X.kid(l, 'lvlText');
    var ind = X.path(l, 'pPr', 'ind');
    var rf = X.path(l, 'rPr', 'rFonts');
    return {
      start: st ? +X.attr(st, 'val') : 1,
      fmt: nf ? X.attr(nf, 'val') : 'decimal',
      text: lt ? X.attr(lt, 'val') : '',
      indL: ind && (X.attr(ind, 'left') || X.attr(ind, 'start')) !== null ? +(X.attr(ind, 'left') || X.attr(ind, 'start')) * TW : undefined,
      hanging: ind && X.attr(ind, 'hanging') !== null ? +X.attr(ind, 'hanging') * TW : undefined,
      font: rf ? (X.attr(rf, 'ascii') || X.attr(rf, 'hAnsi')) : null,
      r: rProps(X.kid(l, 'rPr'))
    };
  }
  X.kids(doc.documentElement, 'abstractNum').forEach(function (a) {
    var lv = {};
    X.kids(a, 'lvl').forEach(function (l) { lv[+X.attr(l, 'ilvl')] = lvlInfo(l); });
    D.abstract[X.attr(a, 'abstractNumId')] = lv;
  });
  X.kids(doc.documentElement, 'num').forEach(function (n) {
    var an = X.kid(n, 'abstractNumId');
    var over = {};
    X.kids(n, 'lvlOverride').forEach(function (o) {
      var l = X.kid(o, 'lvl');
      if (l) over[+X.attr(o, 'ilvl')] = lvlInfo(l);
    });
    D.num[X.attr(n, 'numId')] = { abs: an ? X.attr(an, 'val') : null, over: over };
  });
}

function readTheme(doc) {
  if (!doc) return;
  var mj = X.path(X.first(doc, 'majorFont'), 'latin'), mn = X.path(X.first(doc, 'minorFont'), 'latin');
  if (mj) D.theme.major = X.attr(mj, 'typeface') || D.theme.major;
  if (mn) D.theme.minor = X.attr(mn, 'typeface') || D.theme.minor;
}

// =================== Başlat ===================

var PAGE_W = 794, lastW = 0;

function fitPage() {
  var vp = document.getElementById('vp');
  var screenW = window.screen.width || window.innerWidth;
  var W = PAGE_W + 16;
  var s = Math.min(1, screenW / W);
  vp.setAttribute('content', 'width=' + W + ', initial-scale=' + s.toFixed(4) + ', minimum-scale=' + s.toFixed(4) + ', maximum-scale=6, user-scalable=yes');
}

window.addEventListener('resize', function () {
  var sw = window.screen.width;
  if (sw !== lastW) { lastW = sw; fitPage(); }
});

function start() {
  return openPack().then(function (pack) {
    D.pack = pack;
    return Promise.all([pack.xml('word/document.xml'), pack.rels('word/document.xml')]);
  }).then(function (r) {
    var doc = r[0];
    if (!doc) throw new Error('word değil');
    D.rels = r[1];
    var targets = {};
    Object.keys(D.rels).forEach(function (k) { targets[D.rels[k].type] = D.rels[k].target; });
    return Promise.all([
      targets.styles ? D.pack.xml(targets.styles) : null,
      targets.numbering ? D.pack.xml(targets.numbering) : null,
      targets.theme ? D.pack.xml(targets.theme) : null
    ]).then(function (r2) {
      readTheme(r2[2]);
      readStylesDoc(r2[0]);
      readNumbering(r2[1]);
      var body = X.first(doc, 'body');
      var sect = X.kid(body, 'sectPr');
      var pg = sect && X.kid(sect, 'pgSz'), mar = sect && X.kid(sect, 'pgMar');
      PAGE_W = pg ? X.num(pg, 'w', 11906) * TW : 794;
      var pad = mar ? [X.num(mar, 'top', 1440), X.num(mar, 'right', 1440), X.num(mar, 'bottom', 1440), X.num(mar, 'left', 1440)].map(function (v) { return Math.min(v * TW, 140); }) : [96, 96, 96, 96];
      var page = document.getElementById('page');
      page.style.width = PAGE_W.toFixed(1) + 'px';
      page.style.padding = pad.map(function (v) { return v.toFixed(1) + 'px'; }).join(' ');
      var dr = merge({ sz: 11, font: D.theme.minor }, D.defR);
      page.style.fontSize = (dr.sz * 4 / 3).toFixed(2) + 'px';
      page.style.fontFamily = "'" + dr.font + "',Calibri,Carlito,Roboto,Arial,sans-serif";
      fitPage();
      var blocks = X.kids(body).filter(function (k) { return k.localName !== 'sectPr'; });
      // İlk 40 blok hemen, gerisi arkada
      var firstPart = blocks.slice(0, 40), rest = blocks.slice(40);
      return renderBlocks(firstPart).then(function (html) {
        page.innerHTML = html;
        fixContextual(page);
        Bridge.ready();
        var i = 0;
        (function more() {
          if (i >= rest.length) { document.body.setAttribute('data-done', '1'); return; }
          var chunk = rest.slice(i, i + 60);
          i += 60;
          // Numara sayaçları sıralı kalsın diye parçalar sırayla çizilir
          renderBlocks(chunk).then(function (h) {
            page.insertAdjacentHTML('beforeend', h);
            fixContextual(page);
            setTimeout(more, 0);
          });
        })();
      });
    });
  });
}

Find.rootSel = '#page';

start().catch(function (e) {
  console.log('Word hata: ' + (e && e.stack || e));
  Bridge.failed('Belge açılamadı. Dosya bozuk ya da şifreli olabilir.');
});
