/* HORIZON V1.40.0 · toasts. HzToast.show({ icon, title, sub, act, kind: 'ok'|'bad'|'', ms, onTap }).
   Pill-shaped, stacked above the message box, tap to act, auto-dismiss. */
(function () {
  'use strict';
  var box = null;
  function ensure() {
    if (box && box.isConnected) return box;
    box = document.createElement('div');
    box.id = 'hzToasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
    return box;
  }
  function show(o) {
    o = o || {};
    var host = ensure();
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'hz-tt' + (o.kind ? ' ' + o.kind : '') + (o.cls ? ' ' + o.cls : '');
    var ic = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ic.setAttribute('class', 'ic');
    ic.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + (o.icon || (o.kind === 'bad' ? 'i-info' : 'i-check')));
    ic.appendChild(use);
    var tx = document.createElement('span');
    tx.className = 'hz-tt-tx';
    var b = document.createElement('b'); b.textContent = String(o.title || '');
    tx.appendChild(b);
    if (o.sub) { var s = document.createElement('small'); s.textContent = String(o.sub); tx.appendChild(s); }
    el.appendChild(ic); el.appendChild(tx);
    if (o.act) { var ac = document.createElement('span'); ac.className = 'hz-tt-act'; ac.textContent = String(o.act); el.appendChild(ac); }   /* V1.77.0: e.g. UNDO */
    var gone = false;
    function close() { if (gone) return; gone = true; el.classList.add('out'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220); }
    el.addEventListener('click', function () { if (typeof o.onTap === 'function') { try { o.onTap(); } catch (e) { /* ignore */ } } close(); });
    host.appendChild(el);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    setTimeout(close, o.ms || (o.kind === 'bad' ? 7000 : 4500));
    return { close: close };
  }
  window.HzToast = { show: show };
})();
