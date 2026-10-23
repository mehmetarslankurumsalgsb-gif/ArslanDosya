// ArslanDosya — PowerPoint görüntüleyici (kendi yazdığımız, dış kütüphanesiz .pptx okuyucu)
// Slaytlar ekrana yaklaştıkça tek tek çizilir; ilk slayt hemen görünür.

var EMU_PX = 1 / 9525;           // 96 dpi
var PT_PX = 96 / 72;

var P = { pack: null, sldW: 9144000, sldH: 6858000, slides: [], defaultText: null };

// =================== Renkler ===================

var PRESET_COLORS = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00',
  gray: '808080', grey: '808080', darkGray: 'A9A9A9', lightGray: 'D3D3D3', orange: 'FFA500', navy: '000080' };

function themeColors(themeDoc) {
  var out = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31',
    accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' };
  var fonts = { major: 'Calibri Light', minor: 'Calibri' };
  if (themeDoc) {
    var cs = X.first(themeDoc, 'clrScheme');
    X.kids(cs).forEach(function (e) {
      var s = X.kid(e, 'srgbClr'), y = X.kid(e, 'sysClr');
      if (s) out[e.localName] = s.getAttribute('val');
      else if (y) out[e.localName] = y.getAttribute('lastClr') || (y.getAttribute('val') === 'window' ? 'FFFFFF' : '000000');
    });
    var fs = X.first(themeDoc, 'fontScheme');
    var mj = X.path(fs, 'majorFont', 'latin'), mn = X.path(fs, 'minorFont', 'latin');
    if (mj && mj.getAttribute('typeface')) fonts.major = mj.getAttribute('typeface');
    if (mn && mn.getAttribute('typeface')) fonts.minor = mn.getAttribute('typeface');
  }
  return { colors: out, fonts: fonts };
}

// <a:srgbClr>, <a:schemeClr> ... + değiştiriciler → {hex, alpha}
function colorOf(el, ctx, phClr) {
  if (!el) return null;
  var base = null;
  var name = el.localName;
  if (name === 'srgbClr') base = el.getAttribute('val');
  else if (name === 'schemeClr') {
    var v = el.getAttribute('val');
    if (v === 'phClr') base = phClr ? phClr.hex : null;
    else {
      var mapped = ctx.clrMap[v] || v;
      base = ctx.theme.colors[mapped] || ctx.theme.colors[v] || null;
    }
  } else if (name === 'sysClr') base = el.getAttribute('lastClr') || (el.getAttribute('val') === 'window' ? 'FFFFFF' : '000000');
  else if (name === 'prstClr') base = PRESET_COLORS[el.getAttribute('val')] || '000000';
  else if (name === 'scrgbClr') {
    base = Colors.rgbToHex([X.num(el, 'r', 0) / 100000 * 255, X.num(el, 'g', 0) / 100000 * 255, X.num(el, 'b', 0) / 100000 * 255]);
  } else if (name === 'hslClr') {
    base = Colors.rgbToHex(Colors.fromHsl([X.num(el, 'hue', 0) / 21600000, X.num(el, 'sat', 0) / 100000, X.num(el, 'lum', 0) / 100000]));
  }
  if (!base) return null;
  var rgb = Colors.hexToRgb(base), alpha = 1;
  X.kids(el).forEach(function (m) {
    var val = X.num(m, 'val', 0) / 100000;
    var hsl;
    switch (m.localName) {
      case 'lumMod': hsl = Colors.toHsl(rgb); hsl[2] = Math.min(1, hsl[2] * val); rgb = Colors.fromHsl(hsl); break;
      case 'lumOff': hsl = Colors.toHsl(rgb); hsl[2] = Math.min(1, Math.max(0, hsl[2] + val)); rgb = Colors.fromHsl(hsl); break;
      case 'satMod': hsl = Colors.toHsl(rgb); hsl[1] = Math.min(1, hsl[1] * val); rgb = Colors.fromHsl(hsl); break;
      case 'tint': rgb = rgb.map(function (c) { return c + (255 - c) * (1 - val); }); break;
      case 'shade': rgb = rgb.map(function (c) { return c * val; }); break;
      case 'alpha': alpha = val; break;
      default: break;
    }
  });
  return { hex: Colors.rgbToHex(rgb), alpha: alpha };
}

function css(c) {
  if (!c) return null;
  if (c.alpha >= 0.999) return '#' + c.hex;
  var r = Colors.hexToRgb(c.hex);
  return 'rgba(' + Math.round(r[0]) + ',' + Math.round(r[1]) + ',' + Math.round(r[2]) + ',' + c.alpha.toFixed(3) + ')';
}

function firstColor(el, ctx, phClr) {
  if (!el) return null;
  for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
    if (/Clr$/.test(c.localName)) return colorOf(c, ctx, phClr);
  }
  return null;
}

// Dolgu: solidFill / gradFill / noFill / blipFill / pattFill → CSS background (Promise<string|null>)
function fillCss(spPr, ctx, phClr) {
  if (!spPr) return Promise.resolve(undefined);
  var f;
  if ((f = X.kid(spPr, 'noFill'))) return Promise.resolve('none');
  if ((f = X.kid(spPr, 'solidFill'))) { var c = firstColor(f, ctx, phClr); return Promise.resolve(c ? css(c) : undefined); }
  if ((f = X.kid(spPr, 'gradFill'))) {
    var stops = X.all(f, 'gs').map(function (gs) {
      var col = firstColor(gs, ctx, phClr);
      return col ? css(col) + ' ' + (X.num(gs, 'pos', 0) / 1000).toFixed(1) + '%' : null;
    }).filter(Boolean);
    if (!stops.length) return Promise.resolve(undefined);
    if (stops.length === 1) return Promise.resolve(stops[0].split(' ')[0]);
    var lin = X.kid(f, 'lin');
    var ang = lin ? X.num(lin, 'ang', 0) / 60000 : 90;
    var path = X.kid(f, 'path');
    if (path) return Promise.resolve('radial-gradient(circle, ' + stops.join(', ') + ')');
    return Promise.resolve('linear-gradient(' + (ang + 90).toFixed(1) + 'deg, ' + stops.join(', ') + ')');
  }
  if ((f = X.kid(spPr, 'pattFill'))) {
    var fg = firstColor(X.kid(f, 'fgClr'), ctx, phClr), bg = firstColor(X.kid(f, 'bgClr'), ctx, phClr);
    return Promise.resolve(css(bg || fg) || undefined);
  }
  if ((f = X.kid(spPr, 'blipFill'))) {
    return imageUrl(f, ctx).then(function (url) {
      if (!url) return undefined;
      var tile = X.kid(f, 'tile');
      return "url('" + url + "') " + (tile ? 'repeat' : 'center / 100% 100% no-repeat');
    });
  }
  return Promise.resolve(undefined);
}

function imageUrl(blipFill, ctx) {
  var blip = X.kid(blipFill, 'blip');
  var id = blip && X.rid(blip, 'embed');
  var rel = id && ctx.rels[id];
  if (!rel || rel.external) return Promise.resolve(null);
  var ext = rel.target.split('.').pop().toLowerCase();
  if (ext === 'emf' || ext === 'wmf') return Promise.resolve(null);
  return P.pack.blobUrl(rel.target);
}

// =================== Yerleşim ve devralma ===================

function xfrmOf(spPr) {
  var x = X.kid(spPr, 'xfrm');
  if (!x) return null;
  var off = X.kid(x, 'off'), ext = X.kid(x, 'ext');
  if (!off || !ext) return null;
  return {
    x: X.num(off, 'x', 0), y: X.num(off, 'y', 0), w: X.num(ext, 'cx', 0), h: X.num(ext, 'cy', 0),
    rot: X.num(x, 'rot', 0) / 60000, flipH: X.bool(x, 'flipH', false), flipV: X.bool(x, 'flipV', false),
    chOff: X.kid(x, 'chOff'), chExt: X.kid(x, 'chExt')
  };
}

function phInfo(sp) {
  var nv = X.kid(sp, 'nvSpPr') || X.kid(sp, 'nvPicPr') || X.kid(sp, 'nvGraphicFramePr') || X.kid(sp, 'nvGrpSpPr') || X.kid(sp, 'nvCxnSpPr');
  var ph = X.path(nv, 'nvPr', 'ph');
  if (!ph) return null;
  return { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') };
}

function findPh(tree, ph, byTypeOnly) {
  if (!tree || !ph) return null;
  var shapes = X.kids(tree).filter(function (e) { return e.localName === 'sp' || e.localName === 'pic'; });
  var byIdx = null, byType = null;
  var want = ph.type;
  shapes.forEach(function (s) {
    var p = phInfo(s);
    if (!p) return;
    if (!byTypeOnly && ph.idx !== null && p.idx === ph.idx && !byIdx) byIdx = s;
    var t = p.type;
    if (!byType && (t === want || (want === 'ctrTitle' && t === 'title') || (want === 'title' && t === 'ctrTitle') ||
        (want === 'subTitle' && t === 'body') || ((want === 'obj' || want === 'body') && (t === 'body' || t === 'obj')))) byType = s;
  });
  if (byIdx) return byIdx;
  if (byType) return byType;
  return null;
}

// =================== Metin ===================

var LVL_NAMES = ['lvl1pPr', 'lvl2pPr', 'lvl3pPr', 'lvl4pPr', 'lvl5pPr', 'lvl6pPr', 'lvl7pPr', 'lvl8pPr', 'lvl9pPr'];

function styleListFor(ph, ctx) {
  // Ana slayttaki genel metin stilleri
  var tx = ctx.masterTxStyles;
  if (!tx) return null;
  if (!ph) return X.kid(tx, 'otherStyle');
  if (ph.type === 'title' || ph.type === 'ctrTitle') return X.kid(tx, 'titleStyle');
  if (ph.type === 'body' || ph.type === 'subTitle' || ph.type === 'obj') return X.kid(tx, 'bodyStyle');
  return X.kid(tx, 'otherStyle');
}

// Bir paragraf düzeyi için pPr zinciri (genelden özele)
function pPrChain(level, lists) {
  var out = [];
  lists.forEach(function (lst) {
    if (!lst) return;
    var lvl = X.kid(lst, LVL_NAMES[level] || 'lvl1pPr');
    if (lvl) out.push(lvl);
  });
  return out;
}

function lastAttr(chain, name) {
  for (var i = chain.length - 1; i >= 0; i--) {
    var v = chain[i] && chain[i].getAttribute(name);
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

function lastKid(chain, name) {
  for (var i = chain.length - 1; i >= 0; i--) {
    var k = chain[i] && X.kid(chain[i], name);
    if (k) return k;
  }
  return null;
}

function runCss(rPrChain, ctx, scale) {
  var s = '';
  var sz = lastAttr(rPrChain, 'sz');
  var size = sz ? parseFloat(sz) / 100 : 18;
  size *= scale;
  s += 'font-size:' + (size * PT_PX).toFixed(2) + 'px;';
  var b = lastAttr(rPrChain, 'b'), i = lastAttr(rPrChain, 'i'), u = lastAttr(rPrChain, 'u'), st = lastAttr(rPrChain, 'strike');
  if (b === '1' || b === 'true') s += 'font-weight:700;';
  if (i === '1' || i === 'true') s += 'font-style:italic;';
  var deco = [];
  if (u && u !== 'none') deco.push('underline');
  if (st && st !== 'noStrike') deco.push('line-through');
  if (deco.length) s += 'text-decoration:' + deco.join(' ') + ';';
  var cap = lastAttr(rPrChain, 'cap');
  if (cap === 'all') s += 'text-transform:uppercase;';
  else if (cap === 'small') s += 'font-variant:small-caps;';
  var spc = lastAttr(rPrChain, 'spc');
  if (spc) s += 'letter-spacing:' + (parseFloat(spc) / 100 * PT_PX * scale).toFixed(2) + 'px;';
  var fill = lastKid(rPrChain, 'solidFill');
  var noFill = false;
  for (var k = rPrChain.length - 1; k >= 0; k--) {
    if (!rPrChain[k]) continue;
    if (X.kid(rPrChain[k], 'solidFill') || X.kid(rPrChain[k], 'gradFill')) break;
    if (X.kid(rPrChain[k], 'noFill')) { noFill = true; break; }
  }
  if (noFill) s += 'color:transparent;';
  else {
    var col = fill ? firstColor(fill, ctx) : null;
    if (!col) {
      var grad = lastKid(rPrChain, 'gradFill');
      if (grad) col = firstColor(X.first(grad, 'gs'), ctx);
    }
    if (col) s += 'color:' + css(col) + ';';
  }
  var latin = lastKid(rPrChain, 'latin');
  var face = latin ? latin.getAttribute('typeface') : null;
  if (face === '+mj-lt') face = ctx.theme.fonts.major;
  else if (face === '+mn-lt' || !face) face = face ? ctx.theme.fonts.minor : null;
  if (face) s += "font-family:'" + face.replace(/'/g, '') + "',Calibri,Carlito,Roboto,Arial,sans-serif;";
  var base = lastAttr(rPrChain, 'baseline');
  if (base && base !== '0') s += 'vertical-align:' + (parseFloat(base) > 0 ? 'super' : 'sub') + ';font-size:' + (size * PT_PX * 0.7).toFixed(2) + 'px;';
  return s;
}

function renderTextBody(txBody, ctx, opts) {
  // opts: { lists: [genelden özele lstStyle'lar], bodyPrs: [...], defaultColor, slideNum }
  if (!txBody) return '';
  var lists = opts.lists.slice();
  lists.push(X.kid(txBody, 'lstStyle'));
  var bodyPrs = opts.bodyPrs.concat([X.kid(txBody, 'bodyPr')]);
  var fontScale = 1, lnRed = 0;
  for (var i = bodyPrs.length - 1; i >= 0; i--) {
    var na = bodyPrs[i] && X.kid(bodyPrs[i], 'normAutofit');
    if (na) { fontScale = X.num(na, 'fontScale', 100000) / 100000; lnRed = X.num(na, 'lnSpcReduction', 0) / 100000; break; }
    if (bodyPrs[i] && (X.kid(bodyPrs[i], 'noAutofit') || X.kid(bodyPrs[i], 'spAutoFit'))) break;
  }
  var html = '';
  var autoNums = {};
  X.kids(txBody, 'p').forEach(function (p) {
    var pPr = X.kid(p, 'pPr');
    var level = pPr ? parseInt(pPr.getAttribute('lvl') || '0', 10) : 0;
    var chain = pPrChain(level, lists);
    if (pPr) chain.push(pPr);
    var defRPrs = chain.map(function (c) { return X.kid(c, 'defRPr'); });
    var algn = lastAttr(chain, 'algn');
    var marL = parseFloat(lastAttr(chain, 'marL') || '0') * EMU_PX;
    var indent = parseFloat(lastAttr(chain, 'indent') || '0') * EMU_PX;
    var pcss = 'margin:0;';
    pcss += 'text-align:' + ({ ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[algn] || 'left') + ';';
    pcss += 'padding-left:' + Math.max(0, marL + Math.min(0, indent)).toFixed(1) + 'px;';
    if (indent > 0) pcss += 'text-indent:' + indent.toFixed(1) + 'px;';
    // Satır aralığı
    var ln = lastKid(chain, 'lnSpc');
    var lineH = 1.2;
    if (ln) {
      var pct = X.kid(ln, 'spcPct'), pts = X.kid(ln, 'spcPts');
      if (pct) lineH = 1.2 * X.num(pct, 'val', 100000) / 100000;
      else if (pts) lineH = null, pcss += 'line-height:' + (X.num(pts, 'val', 1200) / 100 * PT_PX * fontScale).toFixed(1) + 'px;';
    }
    if (lineH) pcss += 'line-height:' + (lineH * (1 - lnRed)).toFixed(3) + ';';
    function spc(name) {
      var e = lastKid(chain, name);
      if (!e) return 0;
      var pts2 = X.kid(e, 'spcPts');
      if (pts2) return X.num(pts2, 'val', 0) / 100 * PT_PX;
      var pct2 = X.kid(e, 'spcPct');
      if (pct2) return X.num(pct2, 'val', 0) / 100000 * 18 * PT_PX;
      return 0;
    }
    var sb = spc('spcBef'), sa = spc('spcAft');
    if (sb) pcss += 'padding-top:' + (sb * (1 - lnRed)).toFixed(1) + 'px;';
    if (sa) pcss += 'padding-bottom:' + sa.toFixed(1) + 'px;';

    // Madde işareti
    var runsHtml = '';
    var firstRPr = null;
    var hasText = false;
    X.kids(p).forEach(function (r) {
      var ln2 = r.localName;
      if (ln2 === 'r' || ln2 === 'fld') {
        var rPr = X.kid(r, 'rPr');
        if (!firstRPr) firstRPr = rPr;
        var t = X.kid(r, 't');
        var text = t ? t.textContent : '';
        if (ln2 === 'fld' && /slidenum/i.test(r.getAttribute('type') || '')) text = String(opts.slideNum);
        if (text) hasText = true;
        var rc = runCss(defRPrs.concat([rPr]), ctx, fontScale);
        runsHtml += '<span style="' + rc + '">' + esc(text).replace(/\t/g, '&emsp;') + '</span>';
      } else if (ln2 === 'br') {
        runsHtml += '<br>';
      }
    });
    var endRPr = X.kid(p, 'endParaRPr');
    var sizeCss = runCss(defRPrs.concat([firstRPr || endRPr]), ctx, fontScale);
    if (!hasText) {
      html += '<p style="' + pcss + sizeCss + '">&#8203;' + runsHtml + '</p>';
      return;
    }
    var bullet = '';
    var buNone = lastKid(chain, 'buNone');
    var buChar = lastKid(chain, 'buChar'), buAuto = lastKid(chain, 'buAutoNum');
    // En özel tanım kazanır
    var which = null;
    for (var k = chain.length - 1; k >= 0 && !which; k--) {
      if (!chain[k]) continue;
      if (X.kid(chain[k], 'buNone')) which = 'none';
      else if (X.kid(chain[k], 'buChar')) which = 'char';
      else if (X.kid(chain[k], 'buAutoNum')) which = 'auto';
    }
    if (which === 'char' && buChar) {
      var ch = buChar.getAttribute('char') || '•';
      var buFont = lastKid(chain, 'buFont');
      var fontName = buFont ? buFont.getAttribute('typeface') : '';
      if (/wingdings|symbol/i.test(fontName)) {
        ch = { 'Ø': '➢', 'ü': '✓', 'q': '❑', 'v': '❖', 'n': '■', 'l': '●', '§': '■', '·': '•', 'Ÿ': '•', 'o': '○', 'w': '◆' }[ch] || '•';
      }
      var buClr = lastKid(chain, 'buClr');
      var bc = buClr ? firstColor(buClr, ctx) : null;
      var buSz = lastKid(chain, 'buSzPct');
      var bscale = buSz ? X.num(buSz, 'val', 100000) / 100000 : 1;
      bullet = '<span class="bu" style="' + (bc ? 'color:' + css(bc) + ';' : '') + (bscale !== 1 ? 'font-size:' + (bscale * 100).toFixed(0) + '%;' : '') + '">' + esc(ch) + '</span>';
    } else if (which === 'auto' && buAuto) {
      autoNums[level] = (autoNums[level] || X.num(buAuto, 'startAt', 1) - 1) + 1;
      var n = autoNums[level];
      var scheme = buAuto.getAttribute('type') || 'arabicPeriod';
      var label = /alphaLc/.test(scheme) ? String.fromCharCode(96 + n) : /alphaUc/.test(scheme) ? String.fromCharCode(64 + n) :
        /romanLc/.test(scheme) ? roman(n).toLowerCase() : /romanUc/.test(scheme) ? roman(n) : String(n);
      label += /ParenR/.test(scheme) ? ')' : /ParenBoth/.test(scheme) ? ')' : '.';
      if (/ParenBoth/.test(scheme)) label = '(' + label;
      bullet = '<span class="bu">' + label + '</span>';
    }
    if (which !== 'auto') autoNums[level] = 0;
    if (bullet && indent < 0) {
      bullet = bullet.replace('class="bu"', 'class="bu" style="display:inline-block;width:' + (-indent).toFixed(1) + 'px;margin-left:' + indent.toFixed(1) + 'px;' + (bullet.match(/style="([^"]*)"/) ? bullet.match(/style="([^"]*)"/)[1] : '') + '"');
    } else if (bullet) {
      bullet = bullet.replace('</span>', '&nbsp;</span>');
    }
    html += '<p style="' + pcss + sizeCss + '">' + bullet + runsHtml + '</p>';
  });
  return html;
}

// Belirli bir yazı rengini tüm düzeylere uygulayan sahte lstStyle (şekil stili / tablo başlığı için)
var colorListCache = {};
function colorList(hex) {
  if (colorListCache[hex]) return colorListCache[hex];
  var A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  var doc = document.implementation.createDocument(A, 'a:lstStyle', null);
  var root = doc.documentElement;
  LVL_NAMES.forEach(function (n) {
    var lvl = doc.createElementNS(A, 'a:' + n);
    var d = doc.createElementNS(A, 'a:defRPr');
    var f = doc.createElementNS(A, 'a:solidFill');
    var c = doc.createElementNS(A, 'a:srgbClr');
    c.setAttribute('val', hex);
    f.appendChild(c); d.appendChild(f); lvl.appendChild(d); root.appendChild(lvl);
  });
  colorListCache[hex] = root;
  return root;
}

function roman(n) {
  var m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  var s = '';
  m.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } });
  return s;
}

// =================== Şekiller ===================

var CLIP = {
  triangle: 'polygon(50% 0,100% 100%,0 100%)',
  rtTriangle: 'polygon(0 0,100% 100%,0 100%)',
  diamond: 'polygon(50% 0,100% 50%,50% 100%,0 50%)',
  parallelogram: 'polygon(25% 0,100% 0,75% 100%,0 100%)',
  trapezoid: 'polygon(25% 0,75% 0,100% 100%,0 100%)',
  pentagon: 'polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)',
  hexagon: 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)',
  octagon: 'polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)',
  homePlate: 'polygon(0 0,80% 0,100% 50%,80% 100%,0 100%)',
  chevron: 'polygon(0 0,80% 0,100% 50%,80% 100%,0 100%,20% 50%)',
  rightArrow: 'polygon(0 25%,70% 25%,70% 0,100% 50%,70% 100%,70% 75%,0 75%)',
  leftArrow: 'polygon(100% 25%,30% 25%,30% 0,0 50%,30% 100%,30% 75%,100% 75%)',
  upArrow: 'polygon(25% 100%,25% 30%,0 30%,50% 0,100% 30%,75% 30%,75% 100%)',
  downArrow: 'polygon(25% 0,75% 0,75% 70%,100% 70%,50% 100%,0 70%,25% 70%)',
  star5: 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)',
  plus: 'polygon(35% 0,65% 0,65% 35%,100% 35%,100% 65%,65% 65%,65% 100%,35% 100%,35% 65%,0 65%,0 35%,35% 35%)'
};

// Serbest şekil (custGeom) → kutuya ölçekli SVG yol(ları)
function custPaths(spPr, boxW, boxH) {
  var cg = X.kid(spPr, 'custGeom');
  if (!cg) return null;
  var out = [];
  X.all(X.kid(cg, 'pathLst'), 'path').forEach(function (path) {
    var pw = X.num(path, 'w', 0) || boxW / EMU_PX, ph = X.num(path, 'h', 0) || boxH / EMU_PX;
    var sx = boxW / pw, sy = boxH / ph;
    var d = '', cx = 0, cy = 0, startX = 0, startY = 0;
    function pt(e) { return [X.num(e, 'x', 0) * sx, X.num(e, 'y', 0) * sy]; }
    X.kids(path).forEach(function (cmd) {
      var p2 = X.kids(cmd, 'pt').map(pt);
      switch (cmd.localName) {
        case 'moveTo': if (p2[0]) { cx = p2[0][0]; cy = p2[0][1]; startX = cx; startY = cy; d += 'M' + cx.toFixed(2) + ' ' + cy.toFixed(2); } break;
        case 'lnTo': if (p2[0]) { cx = p2[0][0]; cy = p2[0][1]; d += 'L' + cx.toFixed(2) + ' ' + cy.toFixed(2); } break;
        case 'cubicBezTo': if (p2.length === 3) { d += 'C' + p2.map(function (q) { return q[0].toFixed(2) + ' ' + q[1].toFixed(2); }).join(' '); cx = p2[2][0]; cy = p2[2][1]; } break;
        case 'quadBezTo': if (p2.length === 2) { d += 'Q' + p2.map(function (q) { return q[0].toFixed(2) + ' ' + q[1].toFixed(2); }).join(' '); cx = p2[1][0]; cy = p2[1][1]; } break;
        case 'arcTo': {
          var wR = X.num(cmd, 'wR', 0) * sx, hR = X.num(cmd, 'hR', 0) * sy;
          var st = X.num(cmd, 'stAng', 0) / 60000 * Math.PI / 180, sw = X.num(cmd, 'swAng', 0) / 60000 * Math.PI / 180;
          var ox = cx - wR * Math.cos(st), oy = cy - hR * Math.sin(st);
          var ex = ox + wR * Math.cos(st + sw), ey = oy + hR * Math.sin(st + sw);
          if (Math.abs(sw) >= Math.PI * 2 - 1e-6) {
            var mx = ox + wR * Math.cos(st + Math.PI), my = oy + hR * Math.sin(st + Math.PI);
            d += 'A' + wR.toFixed(2) + ' ' + hR.toFixed(2) + ' 0 1 ' + (sw > 0 ? 1 : 0) + ' ' + mx.toFixed(2) + ' ' + my.toFixed(2);
          }
          d += 'A' + wR.toFixed(2) + ' ' + hR.toFixed(2) + ' 0 ' + (Math.abs(sw) > Math.PI ? 1 : 0) + ' ' + (sw > 0 ? 1 : 0) + ' ' + ex.toFixed(2) + ' ' + ey.toFixed(2);
          cx = ex; cy = ey;
          break;
        }
        case 'close': d += 'Z'; cx = startX; cy = startY; break;
        default: break;
      }
    });
    if (d) out.push({ d: d, fill: path.getAttribute('fill') !== 'none', stroke: path.getAttribute('stroke') !== 'false' });
  });
  return out.length ? out : null;
}

function styleRefColor(sp, refName, ctx) {
  var st = X.kid(sp, 'style');
  var ref = st && X.kid(st, refName);
  if (!ref || ref.getAttribute('idx') === '0') return null;
  return firstColor(ref, ctx);
}

function lineCss(spPr, sp, ctx) {
  var ln = spPr && X.kid(spPr, 'ln');
  if (ln && X.kid(ln, 'noFill')) return null;
  var col = ln ? firstColor(X.kid(ln, 'solidFill'), ctx) : null;
  if (!col && !(ln && X.kid(ln, 'solidFill'))) col = styleRefColor(sp, 'lnRef', ctx);
  if (!col) return null;
  var w = ln && ln.getAttribute('w') ? Math.max(0.75, parseFloat(ln.getAttribute('w')) * EMU_PX) : 1;
  var dash = ln && X.kid(ln, 'prstDash');
  var style = dash && dash.getAttribute('val') !== 'solid' ? (/dot/i.test(dash.getAttribute('val')) ? 'dotted' : 'dashed') : 'solid';
  return { w: w, color: css(col), style: style };
}

function boxStyle(xf) {
  var s = 'left:' + (xf.x * EMU_PX).toFixed(2) + 'px;top:' + (xf.y * EMU_PX).toFixed(2) + 'px;width:' +
    (xf.w * EMU_PX).toFixed(2) + 'px;height:' + (xf.h * EMU_PX).toFixed(2) + 'px;';
  var tr = [];
  if (xf.rot) tr.push('rotate(' + xf.rot.toFixed(2) + 'deg)');
  if (xf.flipH) tr.push('scaleX(-1)');
  if (xf.flipV) tr.push('scaleY(-1)');
  if (tr.length) s += 'transform:' + tr.join(' ') + ';';
  return s;
}

// Grup içi koordinatları slayta çevirir
function mapXfrm(xf, groups) {
  if (!xf) return xf;
  var r = { x: xf.x, y: xf.y, w: xf.w, h: xf.h, rot: xf.rot, flipH: xf.flipH, flipV: xf.flipV };
  for (var i = groups.length - 1; i >= 0; i--) {
    var g = groups[i];
    var sx = g.chW ? g.w / g.chW : 1, sy = g.chH ? g.h / g.chH : 1;
    r.x = g.x + (r.x - g.chX) * sx;
    r.y = g.y + (r.y - g.chY) * sy;
    r.w *= sx; r.h *= sy;
  }
  return r;
}

function renderShape(sp, ctx, layer, groups) {
  var kind = sp.localName;
  if (kind === 'grpSp') {
    var gx = xfrmOf(X.kid(sp, 'grpSpPr'));
    var g2 = groups;
    if (gx) {
      var chOff = gx.chOff, chExt = gx.chExt;
      g2 = groups.concat([{
        x: gx.x, y: gx.y, w: gx.w, h: gx.h,
        chX: chOff ? X.num(chOff, 'x', 0) : gx.x, chY: chOff ? X.num(chOff, 'y', 0) : gx.y,
        chW: chExt ? X.num(chExt, 'cx', 0) : gx.w, chH: chExt ? X.num(chExt, 'cy', 0) : gx.h
      }]);
    }
    return Promise.all(X.kids(sp).map(function (c) { return renderShape(c, ctx, layer, g2); })).then(function (a) { return a.join(''); });
  }
  if (kind === 'AlternateContent') {
    var fb = X.kid(sp, 'Fallback') || X.kid(sp, 'Choice');
    return fb ? Promise.all(X.kids(fb).map(function (c) { return renderShape(c, ctx, layer, groups); })).then(function (a) { return a.join(''); }) : Promise.resolve('');
  }
  if (kind !== 'sp' && kind !== 'pic' && kind !== 'cxnSp' && kind !== 'graphicFrame') return Promise.resolve('');

  var ph = phInfo(sp);
  // Ana/düzen slaytındaki yer tutucular slaytta çizilmez (sadece şablon)
  if (ph && layer !== 'slide') {
    if (ph.type !== 'pic' && kind !== 'pic') return Promise.resolve('');
  }
  if (ph && layer !== 'slide') return Promise.resolve('');

  var spPr = X.kid(sp, 'spPr');
  var layoutPh = ph ? findPh(ctx.layoutTree, ph) : null;
  var masterPh = ph ? findPh(ctx.masterTree, ph, true) || (layoutPh ? findPh(ctx.masterTree, phInfo(layoutPh), true) : null) : null;

  var xf = kind === 'graphicFrame' ? xfrmOf(sp) : xfrmOf(spPr);
  if (kind === 'graphicFrame' && !xf) xf = xfrmOf(X.kid(sp, 'xfrm') ? sp : null);
  if (!xf && layoutPh) xf = xfrmOf(X.kid(layoutPh, 'spPr'));
  if (!xf && masterPh) xf = xfrmOf(X.kid(masterPh, 'spPr'));
  if (!xf) return Promise.resolve('');
  xf = mapXfrm(xf, groups);

  if (kind === 'graphicFrame') return renderFrame(sp, xf, ctx);
  if (kind === 'pic') return renderPic(sp, xf, ctx);

  var geom = X.kid(spPr, 'prstGeom');
  var prst = geom ? geom.getAttribute('prst') : 'rect';
  var isLine = kind === 'cxnSp' || prst === 'line' || /Connector/.test(prst);

  var fillP = fillCss(spPr, ctx).then(function (f) {
    if (f === undefined && !isLine) {
      // Yer tutucu/şekil stil dolgusu
      if (layoutPh) return fillCss(X.kid(layoutPh, 'spPr'), ctx).then(function (f2) {
        if (f2 !== undefined) return f2;
        var c = styleRefColor(sp, 'fillRef', ctx);
        return c ? css(c) : 'none';
      });
      var c = styleRefColor(sp, 'fillRef', ctx);
      return c ? css(c) : 'none';
    }
    return f;
  });

  return fillP.then(function (fill) {
    var ln = lineCss(spPr, sp, ctx);
    if (isLine) {
      if (!ln) return '';
      var w = xf.w * EMU_PX, h = xf.h * EMU_PX;
      var x1 = 0, y1 = 0, x2 = w, y2 = h;
      if (xf.flipH) { x1 = w; x2 = 0; }
      if (xf.flipV) { y1 = h; y2 = 0; }
      var pad = ln.w + 2;
      return '<svg class="shp" style="left:' + (xf.x * EMU_PX - pad).toFixed(1) + 'px;top:' + (xf.y * EMU_PX - pad).toFixed(1) +
        'px;width:' + (w + pad * 2).toFixed(1) + 'px;height:' + (h + pad * 2).toFixed(1) + 'px;overflow:visible' +
        (xf.rot ? ';transform:rotate(' + xf.rot + 'deg)' : '') + '"><line x1="' + (x1 + pad) + '" y1="' + (y1 + pad) + '" x2="' + (x2 + pad) + '" y2="' + (y2 + pad) +
        '" stroke="' + ln.color + '" stroke-width="' + ln.w + '"' + (ln.style === 'dashed' ? ' stroke-dasharray="6 4"' : ln.style === 'dotted' ? ' stroke-dasharray="2 3"' : '') + '/></svg>';
    }
    var s = boxStyle(xf);
    var cust = custPaths(spPr, xf.w * EMU_PX, xf.h * EMU_PX);
    if (cust) {
      var fillD = cust.filter(function (c) { return c.fill; }).map(function (c) { return c.d; }).join(' ');
      var strokeD = cust.filter(function (c) { return c.stroke; }).map(function (c) { return c.d; }).join(' ');
      var bgLayer = fill && fill !== 'none' && fillD
        ? '<div style="position:absolute;inset:0;background:' + fill + ';clip-path:path(\'' + fillD + '\')"></div>' : '';
      var strokeLayer = ln && strokeD
        ? '<svg style="position:absolute;left:0;top:0;overflow:visible" width="' + (xf.w * EMU_PX).toFixed(1) + '" height="' + (xf.h * EMU_PX).toFixed(1) +
          '"><path d="' + strokeD + '" fill="none" stroke="' + ln.color + '" stroke-width="' + ln.w + '"/></svg>' : '';
      var shapeLayers = bgLayer + strokeLayer;
      var innerC = shapeText(sp, ph, ctx, layoutPh, masterPh);
      if (!innerC && !shapeLayers) return '';
      return '<div class="shp" style="' + s + '">' + shapeLayers + innerC + '</div>';
    }
    if (fill && fill !== 'none') s += 'background:' + fill + ';';
    if (ln && !CLIP[prst]) s += 'border:' + ln.w.toFixed(2) + 'px ' + ln.style + ' ' + ln.color + ';';
    if (prst === 'ellipse' || prst === 'flowChartConnector') s += 'border-radius:50%;';
    else if (prst === 'roundRect' || prst === 'flowChartAlternateProcess') {
      var adj = X.first(geom, 'gd');
      var a = adj ? parseFloat((adj.getAttribute('fmla') || 'val 16667').split(' ')[1]) / 100000 : 0.16667;
      s += 'border-radius:' + (Math.min(xf.w, xf.h) * EMU_PX * a).toFixed(1) + 'px;';
    } else if (prst === 'snip1Rect' || prst === 'round1Rect' || prst === 'round2SameRect') {
      s += 'border-radius:' + (Math.min(xf.w, xf.h) * EMU_PX * 0.16).toFixed(1) + 'px;';
    } else if (CLIP[prst]) s += 'clip-path:' + CLIP[prst] + ';';

    // Gölge (basit)
    var eff = X.kid(spPr, 'effectLst');
    if (eff && X.kid(eff, 'outerShdw') && !CLIP[prst]) s += 'box-shadow:2px 3px 6px rgba(0,0,0,0.3);';

    var inner = shapeText(sp, ph, ctx, layoutPh, masterPh);
    if (!inner && (!fill || fill === 'none') && !ln) return '';
    return '<div class="shp" style="' + s + '">' + inner + '</div>';
  });
}

function shapeText(sp, ph, ctx, layoutPh, masterPh) {
  var txBody = X.kid(sp, 'txBody');
  var inner = '';
  if (txBody) {
  var lists = [ph ? null : P.defaultText, styleListFor(ph, ctx)];
  if (masterPh) lists.push(X.path(masterPh, 'txBody', 'lstStyle'));
  if (layoutPh) lists.push(X.path(layoutPh, 'txBody', 'lstStyle'));
  var bodyPrs = [masterPh ? X.path(masterPh, 'txBody', 'bodyPr') : null, layoutPh ? X.path(layoutPh, 'txBody', 'bodyPr') : null];
  // Şekil stilindeki yazı rengi (fontRef)
  var fontRef = X.path(sp, 'style', 'fontRef');
  var refColor = fontRef ? firstColor(fontRef, ctx) : null;
  if (refColor) lists.push(colorList(refColor.hex));
  var textHtml = renderTextBody(txBody, ctx, { lists: lists, bodyPrs: bodyPrs, slideNum: ctx.slideNum });
  if (textHtml.replace(/<[^>]+>|&#8203;/g, '').trim()) {
    var allB = bodyPrs.concat([X.kid(txBody, 'bodyPr')]);
    var anchor = lastAttr(allB, 'anchor') || (ph && (ph.type === 'title' || ph.type === 'ctrTitle') ? 'ctr' : 't');
    var l = lastAttr(allB, 'lIns'), r = lastAttr(allB, 'rIns'), t = lastAttr(allB, 'tIns'), b = lastAttr(allB, 'bIns');
    var wrap = lastAttr(allB, 'wrap');
    var vert = lastAttr(allB, 'vert');
    var tcss = 'justify-content:' + ({ t: 'flex-start', ctr: 'center', b: 'flex-end' }[anchor] || 'flex-start') + ';' +
      'padding:' + ((t !== null ? +t : 45720) * EMU_PX).toFixed(1) + 'px ' + ((r !== null ? +r : 91440) * EMU_PX).toFixed(1) + 'px ' +
      ((b !== null ? +b : 45720) * EMU_PX).toFixed(1) + 'px ' + ((l !== null ? +l : 91440) * EMU_PX).toFixed(1) + 'px;';
    if (wrap === 'none') tcss += 'white-space:nowrap;';
    if (refColor) tcss += 'color:' + css(refColor) + ';';
    if (vert === 'vert' || vert === 'eaVert') tcss += 'writing-mode:vertical-rl;';
    else if (vert === 'vert270') tcss += 'writing-mode:vertical-rl;transform:rotate(180deg);';
    inner = '<div class="tx" style="' + tcss + '">' + textHtml + '</div>';
  }
    }
  return inner;
}

function renderPic(sp, xf, ctx) {
  var blipFill = X.kid(sp, 'blipFill');
  return imageUrl(blipFill, ctx).then(function (url) {
    if (!url) return '';
    var spPr = X.kid(sp, 'spPr');
    var geom = X.kid(spPr, 'prstGeom');
    var prst = geom ? geom.getAttribute('prst') : 'rect';
    var s = boxStyle(xf) + 'overflow:hidden;';
    if (prst === 'ellipse') s += 'border-radius:50%;';
    else if (prst === 'roundRect') s += 'border-radius:' + (Math.min(xf.w, xf.h) * EMU_PX * 0.16).toFixed(1) + 'px;';
    var ln = lineCss(spPr, sp, ctx);
    if (ln) s += 'border:' + ln.w.toFixed(2) + 'px solid ' + ln.color + ';';
    var src = X.kid(blipFill, 'srcRect');
    var l = X.num(src, 'l', 0) / 100000, t = X.num(src, 't', 0) / 100000, r = X.num(src, 'r', 0) / 100000, b = X.num(src, 'b', 0) / 100000;
    var iw = 1 / Math.max(0.01, 1 - l - r), ih = 1 / Math.max(0.01, 1 - t - b);
    var img = '<img src="' + url + '" style="position:absolute;left:' + (-l * iw * 100).toFixed(3) + '%;top:' + (-t * ih * 100).toFixed(3) +
      '%;width:' + (iw * 100).toFixed(3) + '%;height:' + (ih * 100).toFixed(3) + '%" alt="">';
    return '<div class="shp" style="' + s + '">' + img + '</div>';
  });
}

// Tablo, SmartArt, grafik
function renderFrame(sp, xf, ctx) {
  var gd = X.path(sp, 'graphic', 'graphicData');
  var uri = gd ? gd.getAttribute('uri') || '' : '';
  if (/table/.test(uri)) return Promise.resolve(renderTable(X.kid(gd, 'tbl'), xf, ctx));
  if (/diagram/.test(uri)) return renderDiagram(gd, xf, ctx);
  if (/chart/.test(uri)) {
    var cEl = X.first(gd, 'chart');
    var cId = cEl && X.rid(cEl, 'id');
    var cRel = cId && ctx.rels[cId];
    var box = '<div class="shp" style="' + boxStyle(xf) + '">';
    if (!cRel) return Promise.resolve('');
    return P.pack.xml(cRel.target).then(function (doc) {
      var svg = '';
      try { svg = doc ? Chart.render(doc, xf.w * EMU_PX, xf.h * EMU_PX, ctx) : ''; } catch (e) { console.log('grafik hatası: ' + e); }
      return svg ? box + svg + '</div>' : '<div class="shp chart" style="' + boxStyle(xf) + '"><div>📊<br>Grafik</div></div>';
    });
  }
  // OLE / diğer: varsa önizleme resmi
  var pic = X.first(sp, 'pic');
  if (pic) return renderPic(pic, xf, ctx);
  return Promise.resolve('');
}

function renderDiagram(gd, xf, ctx) {
  var relIds = X.kid(gd, 'relIds');
  var dmId = relIds && X.rid(relIds, 'dm');
  var dmRel = dmId && ctx.rels[dmId];
  if (!dmRel) return Promise.resolve('');
  return P.pack.xml(dmRel.target).then(function (dm) {
    var ext = dm && X.first(dm, 'dataModelExt');
    var relId = ext && ext.getAttribute('relId');
    var drawRel = relId && ctx.rels[relId];
    if (!drawRel) return '';
    return P.pack.xml(drawRel.target).then(function (drawing) {
      var tree = drawing && X.first(drawing, 'spTree');
      if (!tree) return '';
      return P.pack.rels(drawRel.target).then(function (drels) {
        var sub = Object.create(ctx);
        sub.rels = drels;
        var group = [{ x: xf.x, y: xf.y, w: xf.w, h: xf.h, chX: 0, chY: 0, chW: xf.w, chH: xf.h }];
        return Promise.all(X.kids(tree).map(function (c) { return renderShape(c, sub, 'diagram', group); }))
          .then(function (a) { return a.join(''); });
      });
    });
  });
}

function renderTable(tbl, xf, ctx) {
  if (!tbl) return '';
  var tblPr = X.kid(tbl, 'tblPr');
  var firstRow = X.bool(tblPr, 'firstRow', false), bandRow = X.bool(tblPr, 'bandRow', false);
  var accent = css(colorOf({ localName: 'schemeClr', getAttribute: function () { return 'accent1'; }, firstElementChild: null }, ctx)) || '#4472C4';
  var grid = X.all(X.kid(tbl, 'tblGrid'), 'gridCol').map(function (g) { return X.num(g, 'w', 0) * EMU_PX; });
  var h = '<table class="tbl" style="width:' + (xf.w * EMU_PX).toFixed(1) + 'px"><colgroup>' +
    grid.map(function (w) { return '<col style="width:' + w.toFixed(1) + 'px">'; }).join('') + '</colgroup>';
  X.kids(tbl, 'tr').forEach(function (tr, ri) {
    h += '<tr style="height:' + (X.num(tr, 'h', 0) * EMU_PX).toFixed(1) + 'px">';
    X.kids(tr, 'tc').forEach(function (tc) {
      if (X.bool(tc, 'hMerge', false) || X.bool(tc, 'vMerge', false)) return;
      var tcPr = X.kid(tc, 'tcPr');
      var s = '';
      var sf = tcPr && X.kid(tcPr, 'solidFill');
      var header = firstRow && ri === 0;
      var bg = sf ? css(firstColor(sf, ctx)) : null;
      if (!bg && !(tcPr && X.kid(tcPr, 'noFill'))) {
        if (header) bg = accent;
        else if (bandRow) bg = (ri % 2 === (firstRow ? 1 : 0)) ? mix(accent, 0.25) : mix(accent, 0.12);
      }
      if (bg) s += 'background:' + bg + ';';
      ['lnL', 'lnR', 'lnT', 'lnB'].forEach(function (n, i) {
        var l = tcPr && X.kid(tcPr, n);
        if (l && !X.kid(l, 'noFill')) {
          var c = firstColor(X.kid(l, 'solidFill'), ctx);
          if (c) s += 'border-' + ['left', 'right', 'top', 'bottom'][i] + ':' + Math.max(1, X.num(l, 'w', 12700) * EMU_PX).toFixed(1) + 'px solid ' + css(c) + ';';
        }
      });
      var anchor = tcPr && tcPr.getAttribute('anchor');
      if (anchor) s += 'vertical-align:' + ({ t: 'top', ctr: 'middle', b: 'bottom' }[anchor] || 'top') + ';';
      var mar = function (n, d) { return ((tcPr && tcPr.getAttribute(n) !== null ? +tcPr.getAttribute(n) : d) * EMU_PX).toFixed(1); };
      s += 'padding:' + mar('marT', 45720) + 'px ' + mar('marR', 91440) + 'px ' + mar('marB', 45720) + 'px ' + mar('marL', 91440) + 'px;';
      if (header) s += 'color:#fff;font-weight:700;';
      var span = '';
      if (tc.getAttribute('gridSpan')) span += ' colspan="' + tc.getAttribute('gridSpan') + '"';
      if (tc.getAttribute('rowSpan')) span += ' rowspan="' + tc.getAttribute('rowSpan') + '"';
      var tlists = [P.defaultText];
      if (header && !sf) tlists.push(colorList('FFFFFF'));
      var txt = renderTextBody(X.kid(tc, 'txBody'), ctx, { lists: tlists, bodyPrs: [], slideNum: ctx.slideNum });
      h += '<td' + span + ' style="' + s + '">' + txt + '</td>';
    });
    h += '</tr>';
  });
  h += '</table>';
  return '<div class="shp" style="' + boxStyle(xf).replace(/height:[^;]+;/, '') + '">' + h + '</div>';
}

function mix(hexCss, amount) {
  var h = hexCss.replace('#', '');
  var rgb = Colors.hexToRgb(h).map(function (c) { return c * amount + 255 * (1 - amount); });
  return '#' + Colors.rgbToHex(rgb);
}

// =================== Slayt ===================

function bgOf(cSld, ctx) {
  var bg = X.kid(cSld, 'bg');
  if (!bg) return Promise.resolve(undefined);
  var bgPr = X.kid(bg, 'bgPr');
  if (bgPr) return fillCss(bgPr, ctx);
  var ref = X.kid(bg, 'bgRef');
  if (ref) {
    var c = firstColor(ref, ctx);
    var idx = X.num(ref, 'idx', 0);
    // Temadaki arka plan dolgu listesi (1001+)
    if (idx > 1000 && ctx.themeDoc) {
      var lst = X.first(ctx.themeDoc, 'bgFillStyleLst');
      var fills = X.kids(lst);
      var f = fills[idx - 1001];
      if (f) {
        var holder = { localName: 'x' };
        var wrap = ctx.themeDoc.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:spPr');
        wrap.appendChild(f.cloneNode(true));
        return fillCss(wrap, ctx, c);
      }
    }
    return Promise.resolve(c ? css(c) : undefined);
  }
  return Promise.resolve(undefined);
}

function clrMapOf(master) {
  var map = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
  var cm = master && X.first(master, 'clrMap');
  if (cm) for (var i = 0; i < cm.attributes.length; i++) map[cm.attributes[i].localName] = cm.attributes[i].value;
  return map;
}

function relOfType(rels, type) {
  for (var k in rels) if (rels[k].type === type) return rels[k];
  return null;
}

var themeCache = {};

function renderSlide(index) {
  var path = P.slides[index];
  var pack = P.pack;
  return Promise.all([pack.xml(path), pack.rels(path)]).then(function (r1) {
    var slide = r1[0], rels = r1[1];
    if (!slide) throw new Error('slayt yok');
    var layoutRel = relOfType(rels, 'slideLayout');
    var layoutPath = layoutRel && layoutRel.target;
    return Promise.all([layoutPath ? pack.xml(layoutPath) : null, layoutPath ? pack.rels(layoutPath) : {}]).then(function (r2) {
      var layout = r2[0], lrels = r2[1];
      var masterRel = relOfType(lrels, 'slideMaster');
      var masterPath = masterRel && masterRel.target;
      return Promise.all([masterPath ? pack.xml(masterPath) : null, masterPath ? pack.rels(masterPath) : {}]).then(function (r3) {
        var master = r3[0], mrels = r3[1];
        var themeRel = relOfType(mrels, 'theme');
        return (themeRel ? pack.xml(themeRel.target) : Promise.resolve(null)).then(function (themeDoc) {
          var theme = themeCache[themeRel ? themeRel.target : ''] || (themeCache[themeRel ? themeRel.target : ''] = themeColors(themeDoc));
          var base = {
            theme: theme, themeDoc: themeDoc, clrMap: clrMapOf(master),
            masterTxStyles: master ? X.first(master, 'txStyles') : null,
            layoutTree: layout ? X.first(layout, 'spTree') : null,
            masterTree: master ? X.first(master, 'spTree') : null,
            slideNum: index + 1
          };
          // Slayt/düzen renk eşlemesi geçersiz kılma
          var ovr = X.first(slide, 'clrMapOvr');
          var oc = ovr && X.kid(ovr, 'overrideClrMapping');
          if (oc) { base.clrMap = {}; for (var i = 0; i < oc.attributes.length; i++) base.clrMap[oc.attributes[i].localName] = oc.attributes[i].value; }

          function ctxWith(relsMap) { var c = Object.create(base); c.rels = relsMap; return c; }
          var sctx = ctxWith(rels), lctx = ctxWith(lrels), mctx = ctxWith(mrels);

          var sCSld = X.first(slide, 'cSld'), lCSld = layout && X.first(layout, 'cSld'), mCSld = master && X.first(master, 'cSld');
          var bgP = bgOf(sCSld, sctx).then(function (b) {
            if (b !== undefined) return b;
            return bgOf(lCSld, lctx).then(function (b2) {
              if (b2 !== undefined) return b2;
              return bgOf(mCSld, mctx);
            });
          });

          var showMaster = slide.documentElement.getAttribute('showMasterSp') !== '0' &&
            !(layout && layout.documentElement.getAttribute('showMasterSp') === '0');
          var parts = [];
          if (showMaster && base.masterTree) parts.push(Promise.all(X.kids(base.masterTree).map(function (c) { return renderShape(c, mctx, 'master', []); })));
          if (base.layoutTree && slide.documentElement.getAttribute('showMasterSp') !== '0') {
            parts.push(Promise.all(X.kids(base.layoutTree).map(function (c) { return renderShape(c, lctx, 'layout', []); })));
          }
          var sTree = X.first(slide, 'spTree');
          parts.push(Promise.all(X.kids(sTree).map(function (c) {
            return renderShape(c, sctx, 'slide', []).catch(function (e) { console.log('şekil hatası: ' + e); return ''; });
          })));
          return Promise.all([bgP, Promise.all(parts)]).then(function (r4) {
            var bg = r4[0];
            var html = r4[1].map(function (a) { return a.join(''); }).join('');
            return { bg: bg && bg !== 'none' ? bg : '#fff', html: html };
          });
        });
      });
    });
  });
}

// =================== Sayfa ===================

var screenScale = 1;

function layoutSlides() {
  var wrapW = Math.max(200, document.documentElement.clientWidth - 16);
  var W = P.sldW * EMU_PX, H = P.sldH * EMU_PX;
  screenScale = wrapW / W;
  document.querySelectorAll('.slot').forEach(function (slot) {
    slot.style.width = wrapW + 'px';
    slot.style.height = (H * screenScale).toFixed(1) + 'px';
    var inner = slot.querySelector('.slide');
    if (inner) inner.style.transform = 'scale(' + screenScale.toFixed(5) + ')';
  });
}

function drawInto(slot, i) {
  if (slot.dataset.state) return Promise.resolve();
  slot.dataset.state = 'drawing';
  return renderSlide(i).then(function (res) {
    var W = P.sldW * EMU_PX, H = P.sldH * EMU_PX;
    slot.innerHTML = '<div class="slide" style="width:' + W.toFixed(1) + 'px;height:' + H.toFixed(1) + 'px;background:' + res.bg +
      ';transform:scale(' + screenScale.toFixed(5) + ')">' + res.html + '</div><div class="num">' + (i + 1) + ' / ' + P.slides.length + '</div>';
    slot.dataset.state = 'done';
  }).catch(function (e) {
    console.log('slayt ' + (i + 1) + ' hatası: ' + (e && e.stack || e));
    slot.innerHTML = '<div class="slideerr">Slayt ' + (i + 1) + ' gösterilemedi</div>';
    slot.dataset.state = 'done';
  });
}

function start() {
  return openPack().then(function (pack) {
    P.pack = pack;
    return Promise.all([pack.xml('ppt/presentation.xml'), pack.rels('ppt/presentation.xml')]);
  }).then(function (r) {
    var pres = r[0], rels = r[1];
    if (!pres) throw new Error('sunum değil');
    var sz = X.first(pres, 'sldSz');
    if (sz) { P.sldW = X.num(sz, 'cx', P.sldW); P.sldH = X.num(sz, 'cy', P.sldH); }
    P.defaultText = X.first(pres, 'defaultTextStyle');
    X.all(X.first(pres, 'sldIdLst'), 'sldId').forEach(function (s) {
      var rel = rels[X.rid(s, 'id')];
      if (rel) P.slides.push(rel.target);
    });
    if (!P.slides.length) throw new Error('slayt yok');

    var host = document.getElementById('slides');
    var slots = P.slides.map(function (p, i) {
      var d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = '<div class="ph"><div class="spin small"></div></div>';
      host.appendChild(d);
      return d;
    });
    layoutSlides();

    Find.rootSel = '#slides';
    Find.prepare = function () {
      return Promise.all(slots.map(function (s, i) { return drawInto(s, i); })).then(function () {
        // drawInto çizim sürerken boş döner; hepsi bitene kadar bekle
        return new Promise(function (ok) {
          (function wait() {
            if (slots.every(function (s) { return s.dataset.state === 'done'; })) ok(); else setTimeout(wait, 50);
          })();
        });
      });
    };
    // İlk slayt hemen, diğerleri ekrana yaklaştıkça
    return drawInto(slots[0], 0).then(function () {
      Bridge.ready();
      var badge = document.getElementById('count');
      badge.textContent = P.slides.length + ' slayt';
      badge.style.display = 'block';
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              var i = slots.indexOf(en.target);
              drawInto(en.target, i);
              io.unobserve(en.target);
            }
          });
        }, { rootMargin: '1200px 0px' });
        slots.forEach(function (s, i) { if (i > 0) io.observe(s); });
      }
      // Arka planda sırayla hepsini hazırla
      var k = 1;
      (function idle() {
        if (k >= slots.length) return;
        var i = k++;
        drawInto(slots[i], i).then(function () { setTimeout(idle, 30); });
      })();
    });
  });
}

window.addEventListener('resize', layoutSlides);

start().catch(function (e) {
  console.log('Sunum hata: ' + (e && e.stack || e));
  Bridge.failed('Sunum açılamadı. Dosya bozuk ya da şifreli olabilir.');
});
