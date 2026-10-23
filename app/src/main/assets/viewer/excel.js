// ArslanDosya — Excel görüntüleyici (kendi yazdığımız, dış kütüphanesiz .xlsx okuyucu)
var MAX_R = 5000, MAX_C = 120;
var TYPE = (Q.get('t') || '').toLowerCase();

var DEFAULT_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];
var INDEXED = ['000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF',
  '000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF',
  '800000','008000','000080','808000','800080','008080','C0C0C0','808080',
  '9999FF','993366','FFFFCC','CCFFFF','660066','FF8080','0066CC','CCCCFF',
  '000080','FF00FF','FFFF00','00FFFF','800080','800000','008080','0000FF',
  '00CCFF','CCFFFF','CCFFCC','FFFF99','99CCFF','FF99CC','CC99FF','FFCC99',
  '3366FF','33CCCC','99CC00','FFCC00','FF9900','FF6600','666699','969696',
  '003366','339966','003300','333300','993300','993366','333399','333333'];

var BUILTIN_FMT = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 5: '#,##0 "₺";-#,##0 "₺"',
  6: '#,##0 "₺";[Red]-#,##0 "₺"', 7: '#,##0.00 "₺";-#,##0.00 "₺"', 8: '#,##0.00 "₺";[Red]-#,##0.00 "₺"',
  9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'dd.mm.yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM',
  20: 'hh:mm', 21: 'hh:mm:ss', 22: 'dd.mm.yyyy hh:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  41: '_-* #,##0_-;-* #,##0_-;_-* "-"_-;_-@_-', 42: '_-* #,##0 "₺"_-;-* #,##0 "₺"_-;_-* "-" "₺"_-;_-@_-',
  43: '_-* #,##0.00_-;-* #,##0.00_-;_-* "-"??_-;_-@_-', 44: '_-* #,##0.00 "₺"_-;-* #,##0.00 "₺"_-;_-* "-"?? "₺"_-;_-@_-',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@'
};

var AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
var GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

// =================== Sayı / tarih biçimlendirme ===================

function splitSections(code) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < code.length; i++) {
    var ch = code.charAt(i);
    if (ch === '"') q = !q;
    if (ch === '\\' && !q) { cur += ch + code.charAt(++i); continue; }
    if (ch === ';' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

// Biçim kodunu parçalara ayırır: {lit:'..'} veya {tok:'..'}
function tokenize(sec) {
  var toks = [], i = 0, color = null;
  while (i < sec.length) {
    var ch = sec.charAt(i);
    if (ch === '"') {
      var j = sec.indexOf('"', i + 1);
      if (j < 0) j = sec.length;
      toks.push({ lit: sec.substring(i + 1, j) });
      i = j + 1;
    } else if (ch === '\\') {
      toks.push({ lit: sec.charAt(i + 1) });
      i += 2;
    } else if (ch === '_') {
      toks.push({ lit: ' ' });
      i += 2;
    } else if (ch === '*') {
      i += 2;
    } else if (ch === '[') {
      var k = sec.indexOf(']', i);
      if (k < 0) k = sec.length;
      var inner = sec.substring(i + 1, k);
      if (inner.charAt(0) === '$') {
        var sym = inner.substring(1).split('-')[0];
        if (sym) toks.push({ lit: sym });
      } else if (/^(h+|m+|s+)$/i.test(inner)) {
        toks.push({ tok: '[' + inner.toLowerCase() + ']' });
      } else if (/^(red|black|blue|green|white|yellow|cyan|magenta|kırmızı)$/i.test(inner)) {
        color = { red: '#C00000', black: '#000', blue: '#0000FF', green: '#008000', white: '#FFF',
          yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF', 'kırmızı': '#C00000' }[inner.toLowerCase()];
      }
      i = k + 1;
    } else {
      toks.push({ tok: ch });
      i++;
    }
  }
  return { toks: toks, color: color };
}

function isDateFormat(sec) {
  var s = sec.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, function (m) {
    return /^\[(h+|m+|s+)\]$/i.test(m) ? 'h' : '';
  });
  return /[dyhs]/i.test(s) || (/m/i.test(s) && !/[0#?]/.test(s));
}

function serialToDate(n, d1904) {
  var ms = Math.round((n + (d1904 ? 1462 : 0)) * 86400000) + Date.UTC(1899, 11, 30);
  return new Date(ms);
}

function pad(n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; }

function formatDate(n, sec, d1904) {
  var t = tokenize(sec);
  var d = serialToDate(n, d1904);
  // Belirteçleri grupla
  var parts = [], toks = t.toks;
  for (var i = 0; i < toks.length; i++) {
    var tk = toks[i];
    if (tk.lit !== undefined) { parts.push({ lit: tk.lit }); continue; }
    var c = tk.tok;
    if (c.charAt(0) === '[') { parts.push({ k: c }); continue; }
    var lc = c.toLowerCase();
    if ('ymdhs'.indexOf(lc) >= 0) {
      var run = c;
      while (i + 1 < toks.length && toks[i + 1].tok && toks[i + 1].tok.toLowerCase() === lc) { run += toks[++i].tok; }
      parts.push({ k: run.toLowerCase() });
    } else if (lc === 'a' && sec.substr(sec.toLowerCase().indexOf('am/pm'), 5).toLowerCase() === 'am/pm') {
      parts.push({ k: 'ampm' });
      i += 4;
    } else if (c === '.' && toks[i + 1] && toks[i + 1].tok === '0') {
      var z = '';
      while (toks[i + 1] && toks[i + 1].tok === '0') { z += '0'; i++; }
      parts.push({ k: 'frac', n: z.length });
    } else {
      parts.push({ lit: c });
    }
  }
  var ampm = parts.some(function (p) { return p.k === 'ampm'; });
  // "m" dakika mı ay mı?
  for (var j = 0; j < parts.length; j++) {
    var p = parts[j];
    if (p.k === 'm' || p.k === 'mm') {
      var prev = null, next = null;
      for (var a = j - 1; a >= 0; a--) if (parts[a].k) { prev = parts[a].k; break; }
      for (var b = j + 1; b < parts.length; b++) if (parts[b].k) { next = parts[b].k; break; }
      if ((prev && prev.charAt(0) === 'h') || (prev && prev.charAt(0) === '[') || (next && next.charAt(0) === 's')) p.min = true;
    }
  }
  var H = d.getUTCHours(), M = d.getUTCMinutes(), S = d.getUTCSeconds();
  var out = '';
  parts.forEach(function (p) {
    if (p.lit !== undefined) { out += p.lit; return; }
    switch (p.k) {
      case 'yy': out += pad(d.getUTCFullYear() % 100, 2); break;
      case 'y': case 'yyy': case 'yyyy': out += d.getUTCFullYear(); break;
      case 'm': out += p.min ? M : (d.getUTCMonth() + 1); break;
      case 'mm': out += p.min ? pad(M, 2) : pad(d.getUTCMonth() + 1, 2); break;
      case 'mmm': out += AYLAR[d.getUTCMonth()].substring(0, 3); break;
      case 'mmmmm': out += AYLAR[d.getUTCMonth()].charAt(0); break;
      case 'mmmm': out += AYLAR[d.getUTCMonth()]; break;
      case 'd': out += d.getUTCDate(); break;
      case 'dd': out += pad(d.getUTCDate(), 2); break;
      case 'ddd': out += GUNLER[d.getUTCDay()].substring(0, 3); break;
      case 'dddd': out += GUNLER[d.getUTCDay()]; break;
      case 'h': out += ampm ? (H % 12 || 12) : H; break;
      case 'hh': out += pad(ampm ? (H % 12 || 12) : H, 2); break;
      case 's': out += S; break;
      case 'ss': out += pad(S, 2); break;
      case 'ampm': out += H < 12 ? 'ÖÖ' : 'ÖS'; break;
      case '[h]': case '[hh]': out += Math.floor(n * 24); break;
      case '[m]': case '[mm]': out += Math.floor(n * 1440); break;
      case '[s]': case '[ss]': out += Math.floor(n * 86400); break;
      case 'frac': out += ',' + pad(Math.floor((n * 86400 % 1) * Math.pow(10, p.n)), p.n); break;
      default: break;
    }
  });
  return { text: out, color: t.color };
}

function groupThousands(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function generalNumber(v) {
  if (v === 0) return '0';
  var a = Math.abs(v);
  var s;
  if (a >= 1e11 || a < 1e-9) {
    s = v.toExponential(5).replace(/\.?0+e/, 'E').replace('e', 'E');
    s = s.replace(/E\+?(-?)(\d)$/, 'E+$1' + '0$2').replace('E+-', 'E-');
  } else {
    s = String(parseFloat(v.toPrecision(11)));
    if (s.indexOf('e') >= 0) s = v.toFixed(10).replace(/0+$/, '');
  }
  return s.replace('.', ',');
}

function formatNumberSection(v, sec) {
  var t = tokenize(sec);
  var toks = t.toks;
  var digitsSeen = false, afterPoint = false, decimals = 0, decOptional = 0, minInt = 0;
  var thousands = false, percent = 0, scale = 0, sci = false;
  var prefix = '', suffix = '', fracNum = false;
  var hasDigits = toks.some(function (k) { return k.tok && /[0#?]/.test(k.tok); });
  for (var i = 0; i < toks.length; i++) {
    var k = toks[i];
    if (k.lit !== undefined) {
      if (!digitsSeen) prefix += k.lit; else suffix += k.lit;
      continue;
    }
    var c = k.tok;
    if (c === '0' || c === '#' || c === '?') {
      if (sci) continue;
      digitsSeen = true;
      if (afterPoint) { decimals++; if (c !== '0') decOptional++; }
      else if (c === '0') minInt++;
    } else if (c === '.' && hasDigits && !afterPoint) {
      afterPoint = true; digitsSeen = true;
    } else if (c === ',' && hasDigits) {
      var nextDigit = toks.slice(i + 1).some(function (x) { return x.tok && /[0#?]/.test(x.tok) && !afterPoint; });
      if (digitsSeen && !afterPoint && nextDigit) thousands = true;
      else if (digitsSeen) scale++;
    } else if (c === '%') {
      percent++;
      if (!digitsSeen) prefix += '%'; else suffix += '%';
    } else if ((c === 'E' || c === 'e') && toks[i + 1] && (toks[i + 1].tok === '+' || toks[i + 1].tok === '-')) {
      sci = true; i++;
    } else if (c === '/') {
      fracNum = true;
    } else if (c === '@') {
      if (!digitsSeen) prefix += ''; // metin yeri
    } else {
      if (!digitsSeen) prefix += c; else suffix += c;
    }
  }
  if (!hasDigits) return { text: prefix + suffix, color: t.color };
  var x = Math.abs(v) * Math.pow(100, percent) / Math.pow(1000, scale);
  var body;
  if (sci) {
    var e = x === 0 ? 0 : Math.floor(Math.log10(x));
    var m = x / Math.pow(10, e);
    body = m.toFixed(decimals).replace('.', ',') + 'E' + (e < 0 ? '-' : '+') + pad(Math.abs(e), 2);
  } else if (fracNum) {
    body = generalNumber(x);
  } else {
    var fixed = x.toFixed(decimals);
    var ip = fixed.split('.')[0], fp = fixed.split('.')[1] || '';
    if (decOptional) {
      var keep = decimals - decOptional;
      while (fp.length > keep && fp.charAt(fp.length - 1) === '0') fp = fp.substring(0, fp.length - 1);
    }
    if (ip === '0' && minInt === 0) ip = '';
    while (ip.length < minInt) ip = '0' + ip;
    if (thousands) ip = groupThousands(ip);
    body = ip + (fp ? ',' + fp : (afterPoint && decimals > decOptional ? ',' : ''));
    if (body === '') body = toks.some(function (k) { return k.tok === '0' || k.tok === '#'; }) ? '0' : ' ';
  }
  return { text: prefix + body + suffix, color: t.color };
}

function formatValue(v, code, d1904) {
  if (!code || /^general$/i.test(code)) return { text: generalNumber(v) };
  var secs = splitSections(code);
  var sec, neg = v < 0;
  // Koşullu bölümler ([>100] gibi) basitçe yok sayılır
  secs = secs.map(function (s) { return s.replace(/\[(<|>|=|<=|>=|<>)[^\]]*\]/g, ''); });
  if (secs.length === 1) sec = secs[0];
  else if (v > 0 || (v === 0 && secs.length < 3)) sec = secs[0];
  else if (v < 0) sec = secs[1];
  else sec = secs[2];
  if (/^general$/i.test(sec.trim())) return { text: (neg && secs.length > 1 ? '' : (neg ? '-' : '')) + generalNumber(Math.abs(v)) };
  if (isDateFormat(sec)) return formatDate(v, sec, d1904);
  var r = formatNumberSection(v, sec);
  if (neg && secs.length === 1) r.text = '-' + r.text;
  return r;
}

// =================== Dosya okuma ===================

function colIndex(ref) {
  var n = 0;
  for (var i = 0; i < ref.length; i++) {
    var c = ref.charCodeAt(i);
    if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
    else if (c >= 97 && c <= 122) n = n * 26 + (c - 96);
    else break;
  }
  return n;
}

function parseRef(a) {
  var m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(a);
  return m ? { c: colIndex(m[1]), r: parseInt(m[2], 10) } : null;
}

function colName(i) {
  var s = '';
  while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

function readTheme(doc) {
  var out = DEFAULT_THEME.slice();
  if (!doc) return out;
  var cs = X.first(doc, 'clrScheme');
  if (!cs) return out;
  function val(name) {
    var e = X.kid(cs, name);
    if (!e) return null;
    var s = X.kid(e, 'srgbClr'), y = X.kid(e, 'sysClr');
    if (s) return s.getAttribute('val');
    if (y) return y.getAttribute('lastClr') || (y.getAttribute('val') === 'window' ? 'FFFFFF' : '000000');
    return null;
  }
  var order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  order.forEach(function (n, i) { var v = val(n); if (v) out[i] = v.toUpperCase(); });
  return out;
}

function makeColor(theme) {
  return function (el) {
    if (!el) return null;
    if (el.getAttribute('auto') === '1') return null;
    var rgb = el.getAttribute('rgb');
    var hex = null;
    if (rgb) hex = rgb.length === 8 ? rgb.substring(2) : rgb;
    else if (el.hasAttribute('theme')) hex = theme[parseInt(el.getAttribute('theme'), 10)] || null;
    else if (el.hasAttribute('indexed')) {
      var ix = parseInt(el.getAttribute('indexed'), 10);
      if (ix === 64 || ix === 65) return null;
      hex = INDEXED[ix] || null;
    }
    if (!hex) return null;
    var t = parseFloat(el.getAttribute('tint') || '0');
    return '#' + Colors.tint(hex.toUpperCase(), t);
  };
}

function readStyles(doc, theme) {
  var color = makeColor(theme);
  var st = { fmts: {}, fonts: [], fills: [], borders: [], xfs: [] };
  if (!doc) return st;
  X.all(doc, 'numFmt').forEach(function (n) {
    st.fmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode');
  });
  var fonts = X.first(doc, 'fonts');
  X.kids(fonts, 'font').forEach(function (f) {
    var css = '';
    if (X.kid(f, 'b') && X.attr(X.kid(f, 'b'), 'val') !== '0') css += 'font-weight:700;';
    if (X.kid(f, 'i') && X.attr(X.kid(f, 'i'), 'val') !== '0') css += 'font-style:italic;';
    var u = X.kid(f, 'u'), s = X.kid(f, 'strike');
    if (u && X.attr(u, 'val') !== 'none') css += 'text-decoration:underline;';
    if (s && X.attr(s, 'val') !== '0') css += 'text-decoration:line-through;';
    var sz = X.kid(f, 'sz');
    if (sz) css += 'font-size:' + (parseFloat(sz.getAttribute('val')) * 4 / 3).toFixed(1) + 'px;';
    var c = color(X.kid(f, 'color'));
    if (c) css += 'color:' + c + ';';
    var nm = X.kid(f, 'name');
    if (nm) css += "font-family:'" + nm.getAttribute('val').replace(/'/g, '') + "',Calibri,Carlito,Roboto,Arial,sans-serif;";
    st.fonts.push(css);
  });
  var fills = X.first(doc, 'fills');
  X.kids(fills, 'fill').forEach(function (f) {
    var p = X.kid(f, 'patternFill'), g = X.kid(f, 'gradientFill');
    var bg = null;
    if (p && p.getAttribute('patternType') && p.getAttribute('patternType') !== 'none') {
      bg = p.getAttribute('patternType') === 'solid'
        ? (color(X.kid(p, 'fgColor')) || color(X.kid(p, 'bgColor')))
        : (color(X.kid(p, 'fgColor')) || color(X.kid(p, 'bgColor')));
    } else if (g) {
      var stop = X.first(g, 'stop');
      if (stop) bg = color(X.kid(stop, 'color'));
    }
    st.fills.push(bg ? 'background:' + bg + ';' : '');
  });
  var borders = X.first(doc, 'borders');
  X.kids(borders, 'border').forEach(function (b) {
    var out = {};
    ['left', 'right', 'top', 'bottom'].forEach(function (side) {
      var e = X.kid(b, side);
      var s = e && e.getAttribute('style');
      if (s && s !== 'none') {
        var w = s === 'thick' ? 3 : (/medium/i.test(s) ? 2 : 1);
        var ls = /dash/i.test(s) ? 'dashed' : (/dot|hair/i.test(s) ? 'dotted' : (s === 'double' ? 'double' : 'solid'));
        if (s === 'double') w = 3;
        out[side] = w + 'px ' + ls + ' ' + (color(X.kid(e, 'color')) || '#000');
      }
    });
    st.borders.push(out);
  });
  var xfs = X.first(doc, 'cellXfs');
  X.kids(xfs, 'xf').forEach(function (x) {
    var al = X.kid(x, 'alignment');
    st.xfs.push({
      fmt: parseInt(x.getAttribute('numFmtId') || '0', 10),
      font: parseInt(x.getAttribute('fontId') || '0', 10),
      fill: parseInt(x.getAttribute('fillId') || '0', 10),
      border: parseInt(x.getAttribute('borderId') || '0', 10),
      h: al ? al.getAttribute('horizontal') : null,
      v: al ? al.getAttribute('vertical') : null,
      wrap: al ? al.getAttribute('wrapText') === '1' || al.getAttribute('wrapText') === 'true' : false,
      indent: al ? parseInt(al.getAttribute('indent') || '0', 10) : 0,
      rot: al ? parseInt(al.getAttribute('textRotation') || '0', 10) : 0
    });
  });
  return st;
}

function readShared(doc) {
  var out = [];
  if (!doc) return out;
  X.kids(doc.documentElement, 'si').forEach(function (si) {
    var runs = X.kids(si, 'r');
    if (!runs.length) {
      var t = X.kid(si, 't');
      out.push({ text: t ? t.textContent : '' });
      return;
    }
    var plain = '', html = '';
    runs.forEach(function (r) {
      var t = X.kid(r, 't');
      var txt = t ? t.textContent : '';
      plain += txt;
      var rp = X.kid(r, 'rPr'), css = '';
      if (rp) {
        if (X.kid(rp, 'b')) css += 'font-weight:700;';
        if (X.kid(rp, 'i')) css += 'font-style:italic;';
        if (X.kid(rp, 'u')) css += 'text-decoration:underline;';
        var sz = X.kid(rp, 'sz');
        if (sz) css += 'font-size:' + (parseFloat(sz.getAttribute('val')) * 4 / 3).toFixed(1) + 'px;';
        var c = X.kid(rp, 'color');
        if (c && c.getAttribute('rgb')) css += 'color:#' + c.getAttribute('rgb').slice(-6) + ';';
      }
      html += css ? '<span style="' + css + '">' + esc(txt) + '</span>' : esc(txt);
    });
    out.push({ text: plain, html: html });
  });
  return out;
}

function colWidthPx(w) {
  return Math.max(0, Math.round(w * 7 + 5));
}

function decodeXml(t) {
  if (t.indexOf('&') < 0) return t;
  return t.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, function (m, e) {
    if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&';
    if (e === 'quot') return '"'; if (e === 'apos') return "'";
    return String.fromCodePoint(e.charAt(1) === 'x' ? parseInt(e.substring(2), 16) : parseInt(e.substring(1), 10));
  });
}

function getAttr(attrs, name) {
  var m = new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(attrs);
  return m ? m[1] : null;
}

var RE_ROW = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
var RE_C = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
var RE_V = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/;
var RE_T = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;

function readSheet(xmlText, name, ctx) {
  // sheetData'yı ayır: büyük kısım hızlı okuyucuyla, gerisi DOM ile
  var sdStart = xmlText.search(/<(?:\w+:)?sheetData\b/);
  var sdEnd = -1, sheetData = '';
  if (sdStart >= 0) {
    var close = /<\/(?:\w+:)?sheetData>/.exec(xmlText.substring(sdStart));
    var selfClose = /^<(?:\w+:)?sheetData\b[^>]*\/>/.exec(xmlText.substring(sdStart));
    if (selfClose) { sdEnd = sdStart + selfClose[0].length; }
    else if (close) { sdEnd = sdStart + close.index + close[0].length; sheetData = xmlText.substring(sdStart, sdEnd); }
  }
  var rest = sdStart >= 0 && sdEnd > 0 ? xmlText.substring(0, sdStart) + xmlText.substring(sdEnd) : xmlText;
  var doc = X.parse(rest);
  var root = doc.documentElement;
  var st = ctx.styles, color = makeColor(ctx.theme);
  var fmtProps = X.kid(root, 'sheetFormatPr');
  var defRowH = fmtProps && fmtProps.getAttribute('defaultRowHeight') ? parseFloat(fmtProps.getAttribute('defaultRowHeight')) * 4 / 3 : 20;
  var defColW = 64;
  if (fmtProps && fmtProps.getAttribute('defaultColWidth')) defColW = colWidthPx(parseFloat(fmtProps.getAttribute('defaultColWidth')));
  else if (fmtProps && fmtProps.getAttribute('baseColWidth')) defColW = colWidthPx(parseFloat(fmtProps.getAttribute('baseColWidth')) + 0.71);

  var sv = X.first(root, 'sheetView');
  var gridlines = !(sv && sv.getAttribute('showGridLines') === '0');

  var cols = {};
  X.all(X.kid(root, 'cols'), 'col').forEach(function (c) {
    var mn = parseInt(c.getAttribute('min'), 10), mx = Math.min(parseInt(c.getAttribute('max'), 10), MAX_C);
    var w = c.getAttribute('width') ? colWidthPx(parseFloat(c.getAttribute('width'))) : defColW;
    var hidden = c.getAttribute('hidden') === '1' || c.getAttribute('hidden') === 'true';
    var style = c.getAttribute('style');
    for (var i = mn; i <= mx; i++) cols[i] = { w: w, hidden: hidden, s: style };
  });

  var rows = {}, maxR = 0, maxC = 0, truncated = false;
  var fmtCache = {};
  var mRow, lastRow = 0;
  RE_ROW.lastIndex = 0;
  while ((mRow = RE_ROW.exec(sheetData))) {
    var ra = mRow[1];
    var rAttr = getAttr(ra, 'r');
    var r = rAttr ? parseInt(rAttr, 10) : lastRow + 1;
    lastRow = r;
    if (r > MAX_R) { truncated = true; break; }
    var ht = getAttr(ra, 'ht'), hid = getAttr(ra, 'hidden');
    var info = {
      h: ht ? parseFloat(ht) * 4 / 3 : null,
      hidden: hid === '1' || hid === 'true',
      s: getAttr(ra, 'customFormat') === '1' ? getAttr(ra, 's') : null,
      cells: {}
    };
    var body = mRow[2] || '';
    var nextC = 1, mC, any = false;
    RE_C.lastIndex = 0;
    while ((mC = RE_C.exec(body))) {
      var ca = mC[1], inner = mC[2] || '';
      var ref = getAttr(ca, 'r');
      var ci = ref ? colIndex(ref) : nextC;
      nextC = ci + 1;
      if (ci > MAX_C) { truncated = true; continue; }
      var t = getAttr(ca, 't');
      var sAttr = getAttr(ca, 's');
      var sIdx = sAttr ? parseInt(sAttr, 10) : 0;
      var vm = inner ? RE_V.exec(inner) : null;
      var raw = vm ? decodeXml(vm[1]) : null;
      var cell = { s: sIdx, text: '', html: null, num: false };
      if (t === 's') {
        var ss = ctx.shared[parseInt(raw, 10)];
        if (ss) { cell.text = ss.text; cell.html = ss.html || null; }
      } else if (t === 'inlineStr') {
        var txt = '', mt;
        RE_T.lastIndex = 0;
        while ((mt = RE_T.exec(inner))) txt += decodeXml(mt[1]);
        cell.text = txt;
      } else if (t === 'str' || t === 'e') {
        cell.text = raw || '';
      } else if (t === 'b') {
        cell.text = raw === '1' ? 'DOĞRU' : 'YANLIŞ';
        cell.center = true;
      } else if (raw !== null && raw !== '') {
        var v = parseFloat(raw);
        if (!isNaN(v)) {
          var code = fmtCache[sIdx];
          if (code === undefined) {
            var xf = st.xfs[sIdx] || {};
            code = fmtCache[sIdx] = st.fmts[xf.fmt] || BUILTIN_FMT[xf.fmt] || 'General';
          }
          var f;
          try { f = formatValue(v, code, ctx.d1904); } catch (e) { f = { text: generalNumber(v) }; }
          cell.text = f.text;
          cell.color = f.color || null;
          cell.num = true;
        } else {
          cell.text = raw;
        }
      }
      info.cells[ci] = cell;
      any = true;
    }
    rows[r] = info;
    if (any && r > maxR) maxR = r;
  }

  var merges = [];
  X.all(X.kid(root, 'mergeCells'), 'mergeCell').forEach(function (m) {
    var p = (m.getAttribute('ref') || '').split(':');
    var a = parseRef(p[0]), b = parseRef(p[1] || p[0]);
    if (a && b) {
      merges.push({ r1: a.r, c1: a.c, r2: b.r, c2: b.c });
      if (b.r > maxR) maxR = Math.min(b.r, MAX_R);
      if (b.c > maxC) maxC = Math.min(b.c, MAX_C);
    }
  });

  // Boş ama biçimli son sütun/satırları kırp: sadece içerikli alan + birleştirmeler
  var lastC = 0, lastR = 0;
  Object.keys(rows).forEach(function (r) {
    var cells = rows[r].cells;
    Object.keys(cells).forEach(function (c) {
      var cell = cells[c];
      var xf = st.xfs[cell.s] || {};
      var visible = cell.text !== '' || (st.fills[xf.fill] || '') !== '' || Object.keys(st.borders[xf.border] || {}).length;
      if (visible) {
        if (+c > lastC) lastC = +c;
        if (+r > lastR) lastR = +r;
      }
    });
  });
  merges.forEach(function (m) { if (m.c2 > lastC) lastC = m.c2; if (m.r2 > lastR) lastR = m.r2; });
  lastC = Math.min(lastC, MAX_C);
  lastR = Math.min(lastR, MAX_R);

  return {
    name: name, rows: rows, cols: cols, merges: merges, maxR: lastR, maxC: lastC,
    defRowH: defRowH, defColW: defColW, gridlines: gridlines, truncated: truncated, styles: st, color: color
  };
}

// =================== Ekrana çizme ===================

var H_ALIGN = { left: 'left', center: 'center', right: 'right', centerContinuous: 'center', justify: 'justify', distributed: 'center', fill: 'left' };
var V_ALIGN = { top: 'top', center: 'middle', bottom: 'bottom', justify: 'middle', distributed: 'middle' };

var FIRST_ROWS = 120, CHUNK_ROWS = 400;

function renderSheet(s, rowFrom, rowTo, withHead) {
  if (!s.maxR || !s.maxC) return '<div class="empty">Bu sayfa boş.</div>';
  rowFrom = rowFrom || 1;
  rowTo = Math.min(rowTo || s.maxR, s.maxR);
  var st = s.styles;
  var colW = [], colHidden = [];
  for (var c = 1; c <= s.maxC; c++) {
    var ci = s.cols[c];
    colW[c] = ci ? ci.w : s.defColW;
    colHidden[c] = (ci && ci.hidden) || colW[c] === 0;
  }
  var rowHidden = [];
  for (var r0 = 1; r0 <= s.maxR; r0++) rowHidden[r0] = !!(s.rows[r0] && s.rows[r0].hidden);

  // Birleştirme haritası (sayfa başına bir kez)
  if (!s._span) {
  var span = {}, skip = {};
  s.merges.forEach(function (m) {
    if (m.r1 > s.maxR || m.c1 > s.maxC) return;
    var rs = 0, cs = 0;
    for (var r = m.r1; r <= Math.min(m.r2, s.maxR); r++) if (!rowHidden[r]) rs++;
    for (var c2 = m.c1; c2 <= Math.min(m.c2, s.maxC); c2++) if (!colHidden[c2]) cs++;
    span[m.r1 + ',' + m.c1] = { rs: rs, cs: cs };
    for (var r2 = m.r1; r2 <= m.r2; r2++) for (var c3 = m.c1; c3 <= m.c2; c3++) {
      if (r2 !== m.r1 || c3 !== m.c1) skip[r2 + ',' + c3] = 1;
    }
  });
  s._span = span; s._skip = skip;
  }
  var span = s._span, skip = s._skip;

  var total = 40;
  var h = [];
  for (var c4 = 1; c4 <= s.maxC; c4++) if (!colHidden[c4]) total += colW[c4];
  if (withHead) {
    h.push('<table class="xl' + (s.gridlines ? ' grid' : '') + '" style="width:' + total + 'px"><colgroup><col style="width:40px">');
    for (var c7 = 1; c7 <= s.maxC; c7++) {
      if (!colHidden[c7]) h.push('<col style="width:' + colW[c7] + 'px">');
    }
    h.push('</colgroup><thead><tr><th class="corner"></th>');
    for (var c5 = 1; c5 <= s.maxC; c5++) if (!colHidden[c5]) h.push('<th>' + colName(c5) + '</th>');
    h.push('</tr></thead><tbody>');
  }

  for (var r = rowFrom; r <= rowTo; r++) {
    if (rowHidden[r]) continue;
    var row = s.rows[r];
    var rh = row && row.h !== null ? row.h : s.defRowH;
    h.push('<tr style="height:' + rh.toFixed(1) + 'px"><th>' + r + '</th>');
    for (var c6 = 1; c6 <= s.maxC; c6++) {
      if (colHidden[c6]) continue;
      var key = r + ',' + c6;
      if (skip[key]) continue;
      var cell = row && row.cells[c6];
      var sIdx = cell ? cell.s : (row && row.s ? parseInt(row.s, 10) : (s.cols[c6] && s.cols[c6].s ? parseInt(s.cols[c6].s, 10) : 0));
      var xf = st.xfs[sIdx] || {};
      var css = (st.fonts[xf.font] || '') + (st.fills[xf.fill] || '');
      var b = st.borders[xf.border] || {};
      if (b.left) css += 'border-left:' + b.left + ';';
      if (b.right) css += 'border-right:' + b.right + ';';
      if (b.top) css += 'border-top:' + b.top + ';';
      if (b.bottom) css += 'border-bottom:' + b.bottom + ';';
      var txt = cell ? cell.text : '';
      var isNum = cell && cell.num;
      var align = xf.h && H_ALIGN[xf.h] ? H_ALIGN[xf.h] : (isNum ? 'right' : (cell && cell.center ? 'center' : null));
      if (align) css += 'text-align:' + align + ';';
      css += 'vertical-align:' + (xf.v && V_ALIGN[xf.v] ? V_ALIGN[xf.v] : 'bottom') + ';';
      if (xf.indent) css += 'padding-left:' + (3 + xf.indent * 9) + 'px;';
      if (cell && cell.color) css += 'color:' + cell.color + ';';
      var cls = '';
      var sp = span[key];
      if (xf.wrap) {
        cls = 'wrap';
      } else if (txt && !isNum && !sp && (!align || align === 'left')) {
        // Excel gibi: yazı yandaki boş hücrelere taşsın
        var next = row && row.cells[c6 + 1];
        if (!next || next.text === '') cls = 'over';
      }
      var content = cell ? (cell.html || esc(txt)) : '';
      if (isNum && !xf.wrap && txt.length * 7.5 > colW[c6] + 4 && !sp) content = '###';
      h.push('<td' + (sp && sp.rs > 1 ? ' rowspan="' + sp.rs + '"' : '') + (sp && sp.cs > 1 ? ' colspan="' + sp.cs + '"' : '') +
        (cls ? ' class="' + cls + '"' : '') + (css ? ' style="' + css + '"' : '') + '>' +
        (cls === 'over' ? '<span>' + content + '</span>' : content) + '</td>');
    }
    h.push('</tr>');
  }
  if (withHead) h.push('</tbody></table>');
  return { html: h.join(''), width: total };
}

// =================== Ekrana sığdırma (telefonun kendi yakınlaştırması) ===================

var lastWidth = 0;
function fitViewport(contentWidth) {
  lastWidth = contentWidth;
  var vp = document.getElementById('vp');
  var screenW = window.screen.width || window.innerWidth;
  var W = Math.max(contentWidth + 8, screenW);
  var s = Math.min(1, screenW / W);
  vp.setAttribute('content', 'width=' + Math.ceil(W) + ', initial-scale=' + s.toFixed(4) +
    ', minimum-scale=' + s.toFixed(4) + ', maximum-scale=6, user-scalable=yes');
  window.scrollTo(0, 0);
}

var lastScreen = 0;
window.addEventListener('resize', function () {
  var sw = window.screen.width;
  if (lastWidth && sw !== lastScreen) {
    lastScreen = sw;
    fitViewport(lastWidth);
  }
});

// =================== Eski .xls ve .csv (SheetJS) ===================

function sheetsFromSheetJS(buf) {
  var wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellNF: true, cellStyles: true, cellDates: false });
  var meta = (wb.Workbook && wb.Workbook.Sheets) || [];
  var out = [];
  wb.SheetNames.forEach(function (n, si) {
    if (meta[si] && meta[si].Hidden) return;
    var ws = wb.Sheets[n];
    var sheet = {
      name: n, rows: {}, cols: {}, merges: [], maxR: 0, maxC: 0, defRowH: 20, defColW: 64, gridlines: true,
      truncated: false, styles: { fmts: {}, fonts: [''], fills: [''], borders: [{}], xfs: [{}] }
    };
    if (ws && ws['!ref']) {
      var rg = XLSX.utils.decode_range(ws['!ref']);
      sheet.maxR = Math.min(rg.e.r + 1, MAX_R);
      sheet.maxC = Math.min(rg.e.c + 1, MAX_C);
      sheet.truncated = rg.e.r + 1 > MAX_R || rg.e.c + 1 > MAX_C;
      (ws['!cols'] || []).forEach(function (ci, i) {
        if (ci) sheet.cols[i + 1] = { w: ci.wpx || (ci.wch ? colWidthPx(ci.wch) : 64), hidden: !!ci.hidden };
      });
      (ws['!merges'] || []).forEach(function (m) {
        sheet.merges.push({ r1: m.s.r + 1, c1: m.s.c + 1, r2: m.e.r + 1, c2: m.e.c + 1 });
      });
      var rinfo = ws['!rows'] || [];
      for (var r = 0; r < sheet.maxR; r++) {
        var ri = rinfo[r] || {};
        var row = { h: ri.hpx || null, hidden: !!ri.hidden, cells: {} };
        for (var c = 0; c < sheet.maxC; c++) {
          var cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
          if (!cell) continue;
          var num = cell.t === 'n';
          var txt = cell.w !== undefined ? cell.w : (cell.v !== undefined && cell.v !== null ? String(cell.v) : '');
          if (num) {
            try { txt = formatValue(cell.v, cell.z || 'General', false).text; } catch (e) {}
          }
          if (cell.t === 'b') txt = cell.v ? 'DOĞRU' : 'YANLIŞ';
          row.cells[c + 1] = { s: 0, text: txt, num: num };
        }
        sheet.rows[r + 1] = row;
      }
    }
    out.push(sheet);
  });
  return out;
}

// =================== Başlat ===================

var SHEETS = [];
var current = -1, drawToken = 0;

function showSheet(i) {
  if (i < 0 || i >= SHEETS.length) return Promise.resolve();
  current = i;
  var token = ++drawToken;
  return SHEETS[i].load().then(function (s) {
    if (token !== drawToken) return;
    var host = document.getElementById('sheet');
    if (!s) { host.innerHTML = '<div class="empty">Bu sayfa okunamadı.</div>'; return; }
    var first = renderSheet(s, 1, FIRST_ROWS, true);
    if (typeof first === 'string') {
      host.innerHTML = first;
      fitViewport(window.screen.width || window.innerWidth);
    } else {
      host.innerHTML = first.html;
      fitViewport(Math.max(first.width, host.scrollWidth));
      var tbody = host.querySelector('tbody');
      var next = FIRST_ROWS + 1;
      (function more() {
        if (token !== drawToken || next > s.maxR) return;
        var part = renderSheet(s, next, next + CHUNK_ROWS - 1, false);
        tbody.insertAdjacentHTML('beforeend', part.html);
        next += CHUNK_ROWS;
        setTimeout(more, 0);
      })();
    }
    Bridge.notice(s.truncated ? 'Büyük tablo: ilk ' + MAX_R + ' satır ve ' + MAX_C + ' sütun gösteriliyor.' : '');
  });
}

function start(sheets) {
  SHEETS = sheets;
  if (!sheets.length) { Bridge.failed('Bu dosyada gösterilecek sayfa yok.'); return; }
  var first = 0;
  for (var i = 0; i < sheets.length; i++) { if (sheets[i].active) { first = i; break; } }
  return showSheet(first).then(function () {
    Bridge.sheets(sheets.map(function (s) { return s.name; }), first);
    if (!window.Arslan) buildLocalTabs(sheets, first);
    Bridge.ready();
  });
}

// Tarayıcıda (Android dışında) denemek için basit sekmeler
function buildLocalTabs(sheets, active) {
  if (sheets.length < 2) return;
  var bar = document.createElement('div');
  bar.id = 'localtabs';
  sheets.forEach(function (s, i) {
    var b = document.createElement('button');
    b.textContent = s.name;
    b.onclick = function () { showSheet(i); };
    bar.appendChild(b);
  });
  document.body.insertBefore(bar, document.body.firstChild);
}

function readXlsx(pack) {
  var ctx = {};
  return Promise.all([
    pack.xml('xl/workbook.xml'), pack.rels('xl/workbook.xml'),
    pack.xml('xl/sharedStrings.xml'), pack.xml('xl/styles.xml')
  ]).then(function (res) {
    var wb = res[0], rels = res[1];
    if (!wb) throw new Error('workbook yok');
    var themeRel = null;
    Object.keys(rels).forEach(function (k) { if (rels[k].type === 'theme') themeRel = rels[k].target; });
    ctx.shared = readShared(res[2]);
    var wbPr = X.first(wb, 'workbookPr');
    ctx.d1904 = wbPr ? X.bool(wbPr, 'date1904', false) : false;
    var activeTab = parseInt((X.first(wb, 'workbookView') || { getAttribute: function () { return '0'; } }).getAttribute('activeTab') || '0', 10);
    return (themeRel ? pack.xml(themeRel) : Promise.resolve(null)).then(function (th) {
      ctx.theme = readTheme(th);
      ctx.styles = readStyles(res[3], ctx.theme);
      var list = [];
      X.all(wb, 'sheet').forEach(function (sh, idx) {
        var state = sh.getAttribute('state');
        var rid = X.rid(sh, 'id');
        var rel = rels[rid];
        if (!rel || (state && state !== 'visible')) return;
        list.push({ name: sh.getAttribute('name'), path: rel.target, active: idx === activeTab });
      });
      // Sayfalar açıldıkça okunur (ilk açılış hızlı olsun)
      return list.map(function (it) {
        return {
          name: it.name, active: it.active, data: null,
          load: function () {
            var self = this;
            if (self.data) return Promise.resolve(self.data);
            return pack.text(it.path).then(function (txt) {
              self.data = txt ? readSheet(txt, it.name, ctx) : null;
              return self.data;
            });
          }
        };
      });
    });
  });
}

function readCsv(text) {
  text = text.replace(/^﻿/, '');
  var first = text.split('\n')[0];
  var delim = (first.split(';').length > first.split(',').length) ? ';' : ',';
  var sheet = { name: 'Sayfa1', rows: {}, cols: {}, merges: [], maxR: 0, maxC: 0, defRowH: 20, defColW: 80,
    gridlines: true, truncated: false, styles: { fmts: {}, fonts: [''], fills: [''], borders: [{}], xfs: [{}] } };
  var r = 1, c = 1, cell = '', q = false, row = { h: null, hidden: false, cells: {} };
  function push() {
    var t = cell, num = /^-?\d+([.,]\d+)?$/.test(t.trim());
    if (t !== '') { row.cells[c] = { s: 0, text: t, num: num }; if (c > sheet.maxC) sheet.maxC = c; }
    cell = ''; c++;
  }
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if (q) {
      if (ch === '"') { if (text.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) push();
    else if (ch === '\n') {
      push(); sheet.rows[r] = row; sheet.maxR = r; r++; c = 1; row = { h: null, hidden: false, cells: {} };
      if (r > MAX_R) { sheet.truncated = true; break; }
    } else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || Object.keys(row.cells).length) { push(); sheet.rows[r] = row; sheet.maxR = r; }
  sheet.maxC = Math.min(sheet.maxC, MAX_C);
  return [sheet];
}

Find.rootSel = '#sheet';

(function main() {
  var p;
  if (TYPE === 'csv') {
    p = fetch(docUrl()).then(function (r) { return r.text(); }).then(readCsv);
  } else if (TYPE === 'xls') {
    p = new Promise(function (ok, no) {
      loadScripts(['lib/xlsx.full.min.js'], function () {
        if (!window.XLSX) { no(new Error('xls')); return; }
        fetch(docUrl()).then(function (r) { return r.arrayBuffer(); }).then(function (b) { ok(sheetsFromSheetJS(b)); }).catch(no);
      });
    });
  } else {
    p = openPack().then(readXlsx);
  }
  p.then(function (sheets) {
    if (sheets.length && sheets[0].load) return sheets;
    return sheets.map(function (sh) {
      return { name: sh.name, active: false, data: sh, load: function () { return Promise.resolve(sh); } };
    });
  }).then(start).catch(function (e) {
    console.log('Excel hata: ' + (e && e.stack || e));
    Bridge.failed('Dosya okunamadı. Bozuk ya da şifreli olabilir.');
  });
})();
