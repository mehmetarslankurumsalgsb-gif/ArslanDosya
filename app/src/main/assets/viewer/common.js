// ArslanDosya — ortak yardımcılar (Excel ve sunum görüntüleyici)
var Q = new URLSearchParams(location.search);

function docUrl() {
  return '/doc/' + encodeURIComponent(Q.get('f') || 'dosya');
}

// ---- Android ile haberleşme ----
var Bridge = {
  ready: function () { try { if (window.Arslan) Arslan.ready(); } catch (e) {} hideStatus(); },
  failed: function (msg) {
    try { if (window.Arslan) { Arslan.failed(msg); return; } } catch (e) {}
    showError(msg);
  },
  sheets: function (names, active) {
    try { if (window.Arslan) Arslan.sheets(JSON.stringify(names), active); } catch (e) {}
  },
  notice: function (text) {
    try { if (window.Arslan) { Arslan.notice(text || ''); return; } } catch (e) {}
    var n = document.getElementById('notice');
    if (n) { n.textContent = text || ''; n.style.display = text ? 'block' : 'none'; }
  }
};

function hideStatus() {
  var s = document.getElementById('status');
  if (s) s.style.display = 'none';
}

function showError(msg) {
  var st = document.getElementById('status');
  if (!st) return;
  st.style.display = 'flex';
  st.className = 'err';
  st.innerHTML = '<p>' + esc(msg) + '</p>';
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function loadScripts(list, done) {
  var i = 0;
  (function next() {
    if (i >= list.length) { done(); return; }
    var s = document.createElement('script');
    s.src = list[i++];
    s.onload = next;
    s.onerror = next;
    document.head.appendChild(s);
  })();
}

// ---- XML yardımcıları (önekten bağımsız) ----
var X = {
  parse: function (text) {
    return new DOMParser().parseFromString(text, 'application/xml');
  },
  kids: function (el, name) {
    var out = [];
    if (!el) return out;
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (!name || c.localName === name) out.push(c);
    }
    return out;
  },
  kid: function (el, name) {
    if (!el) return null;
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (c.localName === name) return c;
    }
    return null;
  },
  // Yol: X.path(el, 'a', 'b', 'c')
  path: function (el) {
    for (var i = 1; i < arguments.length && el; i++) el = X.kid(el, arguments[i]);
    return el || null;
  },
  all: function (el, name) {
    return el ? Array.prototype.slice.call(el.getElementsByTagNameNS('*', name)) : [];
  },
  first: function (el, name) {
    if (!el) return null;
    var l = el.getElementsByTagNameNS('*', name);
    return l.length ? l[0] : null;
  },
  // Önekli/öneksiz öznitelik
  attr: function (el, name) {
    if (!el) return null;
    if (el.hasAttribute(name)) return el.getAttribute(name);
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.localName === name) return a.value;
    }
    return null;
  },
  // r:id gibi ilişki öznitelikleri (aynı adlı öneksiz öznitelikle karışmasın)
  rid: function (el, name) {
    if (!el) return null;
    var v = el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', name);
    if (v) return v;
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.localName === name && a.prefix) return a.value;
    }
    return null;
  },
  num: function (el, name, def) {
    var v = X.attr(el, name);
    if (v === null || v === '') return def;
    var n = parseFloat(v);
    return isNaN(n) ? def : n;
  },
  bool: function (el, name, def) {
    var v = X.attr(el, name);
    if (v === null) return def;
    return v === '1' || v === 'true' || v === 'on';
  }
};

// ---- Zip paketi (JSZip) ----
function Pack(zip) { this.zip = zip; this.cache = {}; }
Pack.prototype.text = function (path) {
  var f = this.zip.file(path);
  return f ? f.async('string') : Promise.resolve(null);
};
Pack.prototype.xml = function (path) {
  var self = this;
  if (this.cache[path]) return this.cache[path];
  var p = this.text(path).then(function (t) { return t ? X.parse(t) : null; });
  this.cache[path] = p;
  return p;
};
Pack.prototype.rels = function (path) {
  var dir = path.substring(0, path.lastIndexOf('/'));
  var name = path.substring(path.lastIndexOf('/') + 1);
  var relPath = (dir ? dir + '/' : '') + '_rels/' + name + '.rels';
  return this.xml(relPath).then(function (doc) {
    var out = {};
    if (!doc) return out;
    X.all(doc, 'Relationship').forEach(function (r) {
      var t = r.getAttribute('Target');
      out[r.getAttribute('Id')] = {
        target: r.getAttribute('TargetMode') === 'External' ? t : resolvePath(path, t),
        type: (r.getAttribute('Type') || '').split('/').pop(),
        external: r.getAttribute('TargetMode') === 'External'
      };
    });
    return out;
  });
};
Pack.prototype.blobUrl = function (path) {
  var key = 'blob:' + path;
  if (this.cache[key]) return this.cache[key];
  var f = this.zip.file(path);
  var ext = path.split('.').pop().toLowerCase();
  var mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp',
    svg: 'image/svg+xml', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff' }[ext] || 'application/octet-stream';
  var p = f ? f.async('blob').then(function (b) {
    var blob = new Blob([b], { type: mime });
    return shrinkImage(blob, mime).then(function (small) { return URL.createObjectURL(small || blob); });
  }) : Promise.resolve(null);
  this.cache[key] = p;
  return p;
};

// Büyük fotoğrafları ekran boyutuna indir (telefon belleği dolmasın)
var MAX_IMG = 1920;
function shrinkImage(blob, mime) {
  if (blob.size < 350000 || !window.createImageBitmap || !/jpeg|png|webp|bmp/.test(mime)) return Promise.resolve(null);
  return createImageBitmap(blob).then(function (bmp) {
    var w = bmp.width, h = bmp.height;
    if (Math.max(w, h) <= MAX_IMG) { bmp.close && bmp.close(); return null; }
    var k = MAX_IMG / Math.max(w, h);
    var c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    var g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    var outType = /png/.test(mime) ? 'image/png' : 'image/jpeg';
    return new Promise(function (ok) { c.toBlob(function (r) { ok(r); }, outType, 0.88); });
  }).catch(function () { return null; });
}

function resolvePath(base, target) {
  if (target.charAt(0) === '/') return target.substring(1);
  var parts = base.split('/');
  parts.pop();
  target.split('/').forEach(function (seg) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  });
  return parts.join('/');
}

function openPack() {
  return fetch(docUrl())
    .then(function (r) { if (!r.ok) throw new Error('okunamadı'); return r.arrayBuffer(); })
    .then(function (buf) { return JSZip.loadAsync(buf); })
    .then(function (zip) { return new Pack(zip); });
}

// ---- Renkler ----
var Colors = {
  // "RRGGBB" + işlemler (lumMod, lumOff, tint, shade, alpha)
  hexToRgb: function (h) {
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  },
  rgbToHex: function (c) {
    return c.map(function (v) {
      v = Math.round(Math.max(0, Math.min(255, v)));
      return ('0' + v.toString(16)).slice(-2);
    }).join('').toUpperCase();
  },
  toHsl: function (c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  },
  fromHsl: function (hsl) {
    var h = hsl[0], s = hsl[1], l = hsl[2];
    if (s === 0) return [l * 255, l * 255, l * 255];
    function f(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
  },
  // Excel tarzı tint (-1..1)
  tint: function (hex, t) {
    if (!t) return hex;
    var hsl = Colors.toHsl(Colors.hexToRgb(hex));
    hsl[2] = t < 0 ? hsl[2] * (1 + t) : hsl[2] * (1 - t) + t;
    return Colors.rgbToHex(Colors.fromHsl(hsl));
  }
};

// =================== Belge içinde arama (Excel, Word, Sunum) ===================
var Find = {
  rootSel: 'body',
  marks: [],
  cur: -1,
  // Sunum gibi parça parça çizilen sayfalar aramadan önce her şeyi hazırlar
  prepare: function () { return Promise.resolve(); },
  norm: function (s) { return s.toLocaleLowerCase('tr'); },
  clear: function () {
    Find.marks.forEach(function (m) {
      var p = m.parentNode;
      if (!p) return;
      p.replaceChild(document.createTextNode(m.textContent), m);
      p.normalize();
    });
    Find.marks = [];
    Find.cur = -1;
  },
  report: function () {
    try { if (window.Arslan && Arslan.found) Arslan.found(Find.marks.length, Find.cur + 1); } catch (e) {}
    return Find.marks.length;
  },
  search: function (q) {
    Find.clear();
    q = (q || '').trim();
    if (!q) return Promise.resolve(Find.report());
    return Find.prepare().then(function () {
      var root = document.querySelector(Find.rootSel) || document.body;
      var nq = Find.norm(q);
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var p = n.parentNode;
          if (!p || /^(SCRIPT|STYLE|MARK)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
          return Find.norm(n.nodeValue).indexOf(nq) >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node) {
        var text = node.nodeValue, low = Find.norm(text);
        var frag = document.createDocumentFragment(), pos = 0, i;
        while ((i = low.indexOf(nq, pos)) >= 0) {
          if (i > pos) frag.appendChild(document.createTextNode(text.substring(pos, i)));
          var m = document.createElement('mark');
          m.className = 'f';
          m.textContent = text.substring(i, i + q.length);
          frag.appendChild(m);
          Find.marks.push(m);
          pos = i + q.length;
        }
        if (pos < text.length) frag.appendChild(document.createTextNode(text.substring(pos)));
        node.parentNode.replaceChild(frag, node);
      });
      if (Find.marks.length) Find.go(0); else Find.report();
      return Find.marks.length;
    });
  },
  go: function (i) {
    var n = Find.marks.length;
    if (!n) return Find.report();
    if (Find.cur >= 0 && Find.marks[Find.cur]) Find.marks[Find.cur].className = 'f';
    Find.cur = ((i % n) + n) % n;
    var m = Find.marks[Find.cur];
    m.className = 'f cur';
    m.scrollIntoView({ block: 'center', inline: 'center' });
    return Find.report();
  },
  next: function () { return Find.go(Find.cur + 1); },
  prev: function () { return Find.go(Find.cur - 1); }
};
