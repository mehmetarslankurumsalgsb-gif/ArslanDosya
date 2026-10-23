var Q = new URLSearchParams(location.search);

function docUrl() {
  return '/doc/' + encodeURIComponent(Q.get('f') || 'dosya');
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

function hideStatus() {
  document.getElementById('status').style.display = 'none';
}

function fail(msg) {
  var st = document.getElementById('status');
  st.style.display = 'flex';
  st.className = 'err';
  st.innerHTML = '<p>' + msg + '</p>' +
    (window.Arslan ? '<button onclick="Arslan.openExternal()">Başka uygulamada aç</button>' : '');
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
