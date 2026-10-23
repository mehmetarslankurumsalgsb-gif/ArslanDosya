// ArslanDosya — Excel görüntüleyici (biçimli, renkli tablo)
var MAX_R = 2000, MAX_C = 80;
var TYPE = (Q.get('t') || '').toLowerCase();

// Office varsayılan tema renkleri (0=lt1, 1=dk1, 2=lt2, 3=dk2, 4..9 vurgu)
var THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];
var INDEXED = ['000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF',
  '000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF',
  '800000','008000','000080','808000','800080','008080','C0C0C0','808080',
  '9999FF','993366','FFFFCC','CCFFFF','660066','FF8080','0066CC','CCCCFF',
  '000080','FF00FF','FFFF00','00FFFF','800080','800000','008080','0000FF',
  '00CCFF','CCFFFF','CCFFCC','FFFF99','99CCFF','FF99CC','CC99FF','FFCC99',
  '3366FF','33CCCC','99CC00','FFCC00','FF9900','FF6600','666699','969696',
  '003366','339966','003300','333300','993300','993366','333399','333333'];

function tint(hex, t) {
  if (!t) return hex;
  var out = '';
  for (var i = 0; i < 3; i++) {
    var c = parseInt(hex.substr(i * 2, 2), 16);
    c = t < 0 ? c * (1 + t) : c + (255 - c) * t;
    out += ('0' + Math.round(Math.max(0, Math.min(255, c))).toString(16)).slice(-2);
  }
  return out;
}

function color(c) {
  if (!c) return null;
  if (c.argb) {
    var h = c.argb.length === 8 ? c.argb.slice(2) : c.argb;
    return '#' + h;
  }
  if (c.theme !== undefined && THEME[c.theme]) return '#' + tint(THEME[c.theme], c.tint || 0);
  if (c.indexed !== undefined && INDEXED[c.indexed]) return '#' + INDEXED[c.indexed];
  return null;
}

// Sayıları Türkçe biçime çevir (1,234.56 -> 1.234,56)
function trNum(s) {
  if (/\d/.test(s) && /^[\s\d.,%()+\-₺$€£E]+$/.test(s)) {
    return s.replace(/[.,]/g, function (ch) { return ch === '.' ? ',' : '.'; });
  }
  return s;
}

function fmt(n, f) {
  if (!f || f === 'mm-dd-yy' || f === 'm/d/yy' || f === 'd-mmm-yy') {
    if (f) f = 'dd.mm.yyyy';
  }
  try {
    var s = XLSX.SSF.format(f || 'General', n);
    return trNum(String(s));
  } catch (e) {
    return trNum(String(n));
  }
}

function dateSerial(d) {
  return (d.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
}

function ref(a) {
  var m = /^([A-Z]+)(\d+)$/i.exec(a.replace(/\$/g, ''));
  if (!m) return { r: 1, c: 1 };
  var c = 0, L = m[1].toUpperCase();
  for (var i = 0; i < L.length; i++) c = c * 26 + (L.charCodeAt(i) - 64);
  return { r: parseInt(m[2], 10), c: c };
}

function colName(i) {
  var s = '';
  while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

function fontCss(f) {
  if (!f) return '';
  var css = '';
  if (f.bold) css += 'font-weight:700;';
  if (f.italic) css += 'font-style:italic;';
  if (f.underline) css += 'text-decoration:underline;';
  if (f.strike) css += 'text-decoration:line-through;';
  if (f.size) css += 'font-size:' + Math.round(f.size * 4 / 3) + 'px;';
  var c = color(f.color);
  if (c) css += 'color:' + c + ';';
  return css;
}

function cellCss(cell) {
  var s = cell.style || {};
  var css = fontCss(s.font);
  var fill = s.fill;
  if (fill && fill.type === 'pattern' && fill.pattern && fill.pattern !== 'none') {
    var fc = color(fill.fgColor) || color(fill.bgColor);
    if (fc) css += 'background:' + fc + ';';
  } else if (fill && fill.type === 'gradient' && fill.stops && fill.stops.length) {
    var gc = color(fill.stops[0].color);
    if (gc) css += 'background:' + gc + ';';
  }
  var a = s.alignment;
  if (a) {
    var H = { left: 'left', center: 'center', right: 'right', centerContinuous: 'center', justify: 'justify', distributed: 'center', fill: 'left' };
    var V = { top: 'top', middle: 'middle', bottom: 'bottom', justify: 'middle', distributed: 'middle' };
    if (a.horizontal && H[a.horizontal]) css += 'text-align:' + H[a.horizontal] + ';';
    if (a.vertical && V[a.vertical]) css += 'vertical-align:' + V[a.vertical] + ';';
    if (a.wrapText) css += 'white-space:pre-wrap;word-break:break-word;';
  }
  var b = s.border;
  if (b) {
    ['top', 'right', 'bottom', 'left'].forEach(function (side) {
      var x = b[side];
      if (x && x.style) {
        var w = x.style === 'thick' ? 3 : (/medium/.test(x.style) ? 2 : 1);
        var st = /dash/i.test(x.style) ? 'dashed' : /dot|hair/i.test(x.style) ? 'dotted' : x.style === 'double' ? 'double' : 'solid';
        css += 'border-' + side + ':' + w + 'px ' + st + ' ' + (color(x.color) || '#000') + ';';
      }
    });
  }
  return css;
}

// Hücre içeriği -> { html, num }
function cellContent(cell) {
  var v = cell.value;
  if (v === null || v === undefined) return { html: '', num: false };
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (v.richText) {
      return {
        html: v.richText.map(function (t) {
          var css = fontCss(t.font);
          return css ? '<span style="' + css + '">' + esc(t.text) + '</span>' : esc(t.text);
        }).join(''),
        num: false
      };
    }
    if ('result' in v) v = v.result;
    else if (v.text !== undefined) v = (typeof v.text === 'object' && v.text && v.text.richText)
      ? v.text.richText.map(function (t) { return t.text; }).join('') : v.text;
    else if (v.error) v = v.error;
    else return { html: '', num: false };
    if (v === null || v === undefined) return { html: '', num: false };
    if (typeof v === 'object' && !(v instanceof Date)) {
      return { html: esc(v.error || ''), num: false };
    }
  }
  if (v instanceof Date) return { html: esc(fmt(dateSerial(v), cell.numFmt || 'dd.mm.yyyy')), num: true };
  if (typeof v === 'number') return { html: esc(fmt(v, cell.numFmt)), num: true };
  if (typeof v === 'boolean') return { html: v ? 'DOĞRU' : 'YANLIŞ', num: false };
  return { html: esc(String(v)), num: false };
}

// ---------- ExcelJS ile .xlsx okuma (renkler, kenarlıklar, birleştirmeler) ----------
function fromExcelJS(buf) {
  var wb = new ExcelJS.Workbook();
  return wb.xlsx.load(buf).then(function () {
    var out = [];
    wb.worksheets.forEach(function (ws) {
      if (ws.state && ws.state !== 'visible') return;
      var rc = ws.rowCount || 0, cc = ws.columnCount || 0;
      var nR = Math.min(rc, MAX_R), nC = Math.min(cc, MAX_C);
      var span = {}, skip = {};
      var merges = (ws.model && ws.model.merges) || [];
      merges.forEach(function (m) {
        var p = m.split(':'), A = ref(p[0]), B = ref(p[1] || p[0]);
        span[A.r + ',' + A.c] = { rs: B.r - A.r + 1, cs: B.c - A.c + 1 };
        for (var r = A.r; r <= B.r; r++) for (var c = A.c; c <= B.c; c++) {
          if (r !== A.r || c !== A.c) skip[r + ',' + c] = 1;
        }
      });
      var cols = [];
      for (var c = 1; c <= nC; c++) {
        var col = ws.getColumn(c);
        cols.push({ w: col.width ? Math.round(col.width * 7 + 5) : 64, hidden: !!col.hidden });
      }
      var rows = [];
      for (var r = 1; r <= nR; r++) {
        var row = ws.getRow(r), cells = [];
        for (var c2 = 1; c2 <= nC; c2++) {
          var k = r + ',' + c2;
          if (skip[k]) { cells.push(null); continue; }
          var cell = row.getCell(c2);
          var ct = cellContent(cell);
          cells.push({ html: ct.html, num: ct.num, css: cellCss(cell), rs: span[k] && span[k].rs, cs: span[k] && span[k].cs });
        }
        rows.push({ h: row.height ? Math.round(row.height * 4 / 3) : null, hidden: !!row.hidden, cells: cells });
      }
      out.push({ name: ws.name, cols: cols, rows: rows, truncated: rc > MAX_R || cc > MAX_C });
    });
    return out;
  });
}

// ---------- SheetJS ile .xls / .csv okuma ----------
function fromSheetJS(buf) {
  var wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellNF: true, cellStyles: true });
  var meta = (wb.Workbook && wb.Workbook.Sheets) || [];
  var out = [];
  wb.SheetNames.forEach(function (n, si) {
    if (meta[si] && meta[si].Hidden) return;
    var ws = wb.Sheets[n];
    if (!ws || !ws['!ref']) { out.push({ name: n, cols: [], rows: [], truncated: false }); return; }
    var rg = XLSX.utils.decode_range(ws['!ref']);
    var nR = Math.min(rg.e.r + 1, MAX_R), nC = Math.min(rg.e.c + 1, MAX_C);
    var span = {}, skip = {};
    (ws['!merges'] || []).forEach(function (m) {
      span[(m.s.r + 1) + ',' + (m.s.c + 1)] = { rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 };
      for (var r = m.s.r; r <= m.e.r; r++) for (var c = m.s.c; c <= m.e.c; c++) {
        if (r !== m.s.r || c !== m.s.c) skip[(r + 1) + ',' + (c + 1)] = 1;
      }
    });
    var cinfo = ws['!cols'] || [], rinfo = ws['!rows'] || [];
    var cols = [];
    for (var c = 0; c < nC; c++) {
      var ci = cinfo[c] || {};
      cols.push({ w: ci.wpx || (ci.wch ? Math.round(ci.wch * 7 + 5) : 64), hidden: !!ci.hidden });
    }
    var rows = [];
    for (var r = 0; r < nR; r++) {
      var cells = [];
      for (var c2 = 0; c2 < nC; c2++) {
        var k = (r + 1) + ',' + (c2 + 1);
        if (skip[k]) { cells.push(null); continue; }
        var cell = ws[XLSX.utils.encode_cell({ r: r, c: c2 })];
        var txt = '', num = false, css = '';
        if (cell) {
          num = cell.t === 'n';
          txt = cell.w !== undefined ? cell.w : (cell.v !== undefined && cell.v !== null ? String(cell.v) : '');
          if (num) txt = trNum(txt);
          if (cell.t === 'b') txt = cell.v ? 'DOĞRU' : 'YANLIŞ';
          if (cell.s && cell.s.fgColor && cell.s.fgColor.rgb && cell.s.patternType && cell.s.patternType !== 'none') {
            css += 'background:#' + String(cell.s.fgColor.rgb).slice(-6) + ';';
          }
        }
        cells.push({ html: esc(txt), num: num, css: css, rs: span[k] && span[k].rs, cs: span[k] && span[k].cs });
      }
      var ri = rinfo[r] || {};
      rows.push({ h: ri.hpx || null, hidden: !!ri.hidden, cells: cells });
    }
    out.push({ name: n, cols: cols, rows: rows, truncated: rg.e.r + 1 > MAX_R || rg.e.c + 1 > MAX_C });
  });
  return out;
}

// ---------- Ekrana çizme ----------
var SHEETS = [];

function render(idx) {
  var s = SHEETS[idx];
  var btns = document.querySelectorAll('#tabs button');
  for (var i = 0; i < btns.length; i++) btns[i].className = i === idx ? 'on' : '';

  var host = document.getElementById('sheet');
  if (!s.rows.length || !s.cols.length) {
    host.innerHTML = '<div class="empty">Bu sayfa boş.</div>';
    return;
  }
  var h = [];
  if (s.truncated) {
    h.push('<div id="notice">Büyük tablo: ilk ' + MAX_R + ' satır ve ' + MAX_C + ' sütun gösteriliyor.</div>');
  }
  var total = 46;
  s.cols.forEach(function (c) { if (!c.hidden) total += c.w; });
  h.push('<table class="xl" style="width:' + total + 'px"><colgroup><col style="width:46px">');
  s.cols.forEach(function (c) { if (!c.hidden) h.push('<col style="width:' + c.w + 'px">'); });
  h.push('</colgroup><thead><tr><th class="corner"></th>');
  s.cols.forEach(function (c, i) { if (!c.hidden) h.push('<th>' + colName(i + 1) + '</th>'); });
  h.push('</tr></thead><tbody>');
  s.rows.forEach(function (row, r) {
    if (row.hidden) return;
    h.push('<tr' + (row.h ? ' style="height:' + row.h + 'px"' : '') + '><th>' + (r + 1) + '</th>');
    row.cells.forEach(function (cell, c) {
      if (cell === null || s.cols[c].hidden) return;
      var css = cell.css || '';
      if (cell.num && css.indexOf('text-align') < 0) css += 'text-align:right;';
      h.push('<td' + (cell.rs > 1 ? ' rowspan="' + cell.rs + '"' : '') + (cell.cs > 1 ? ' colspan="' + cell.cs + '"' : '') +
        (css ? ' style="' + css + '"' : '') + '>' + cell.html + '</td>');
    });
    h.push('</tr>');
  });
  h.push('</tbody></table>');
  host.innerHTML = h.join('');
  host.scrollTop = 0;
  host.scrollLeft = 0;
}

function show(sheets) {
  SHEETS = sheets;
  if (!sheets.length) { fail('Bu dosyada gösterilecek sayfa yok.'); return; }
  var tabs = document.getElementById('tabs');
  sheets.forEach(function (s, i) {
    var b = document.createElement('button');
    b.textContent = s.name;
    b.onclick = function () { render(i); };
    tabs.appendChild(b);
  });
  if (sheets.length > 1) document.body.className = 'has-tabs';
  else tabs.style.display = 'none';
  render(0);
  hideStatus();
}

(function main() {
  if (!window.XLSX) { fail('Tablo görüntüleyici yüklenemedi.'); return; }
  fetch(docUrl())
    .then(function (r) { if (!r.ok) throw new Error('okunamadı'); return r.arrayBuffer(); })
    .then(function (buf) {
      if ((TYPE === 'xlsx' || TYPE === 'xlsm') && window.ExcelJS) {
        return fromExcelJS(buf).catch(function () { return fromSheetJS(buf); });
      }
      return fromSheetJS(buf);
    })
    .then(show)
    .catch(function () {
      fail('Dosya okunamadı. Bozuk ya da şifreli olabilir.');
    });
})();
