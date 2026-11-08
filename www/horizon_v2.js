/* HORIZON V1.66.0 · header capsule + Downloads row. The capsule only repaints from the existing provider pill and usage badge
   (they stay in the page, hidden), so every old handler and number keeps working. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); }, root = document.documentElement;
  try { localStorage.removeItem('horizon_snooze'); } catch (e) { /* storage blocked */ }   // Snooze is gone; make sure nothing stays paused

  /* ---- Downloads: Settings row under USAGE & ENGINE ---- */
  var dl = $('hzDlRow');
  if (dl) dl.addEventListener('click', function () {
    var t = document.querySelector('.hz-app[data-addon="downloads"]'); if (t) t.click();
  });

  var header = document.querySelector('.app-header'), top = document.querySelector('.hzd-top'), pill = $('hzPill'), badge = $('hzBadge');
  if (!root.classList.contains('hzd-on') || !header || !top || !pill || !badge) return;
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  /* ---- Github Push, first in line after the logo ---- */
  var gh = el('button', 'hzc-gh'); gh.type = 'button'; gh.setAttribute('aria-label', 'Github Push'); gh.title = 'Github Push';
  gh.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 21h14"/></svg>';
  gh.addEventListener('click', function () { var t = document.querySelector('.hz-app[data-addon="github"]'); if (t) t.click(); });
  var logo = header.querySelector('.logo-area');
  if (logo) logo.insertAdjacentElement('afterend', gh); else header.insertBefore(gh, header.firstChild);

  /* ---- the capsule ---- */
  var cap = el('div', 'hzc-cap'), inn = el('div', 'hzc-in'), spin = el('span', 'hzc-spin');
  spin.innerHTML = '<i></i><b></b>'; spin.setAttribute('aria-hidden', 'true');
  var tt = el('div', 'hzc-tt'), main = el('button', 'hzc-main'), nm = el('span', 'hzc-nm'), md = el('span', 'hzc-md');
  main.type = 'button'; main.appendChild(nm); main.appendChild(md);
  var st = el('button', 'hzc-st'), dot = el('i', 'hzc-dot'), rd = el('span', 'hzc-rd'), wv = el('span', 'hzc-wv');
  st.type = 'button'; wv.setAttribute('aria-hidden', 'true');
  for (var i = 0; i < 5; i++) wv.appendChild(document.createElement('u'));
  st.appendChild(dot); st.appendChild(rd); st.appendChild(wv);
  tt.appendChild(main); tt.appendChild(st); inn.appendChild(spin); inn.appendChild(tt); cap.appendChild(inn);
  top.appendChild(cap);
  main.addEventListener('click', function () { pill.click(); });
  st.addEventListener('click', function () { badge.click(); });

  /* ---- the wave: JavaScript sets the heights, runs only while a reply is being written ---- */
  var raf = 0, bars = wv.children;
  function frame(ms) {
    raf = 0; if (!cap.classList.contains('busy')) return;
    var t = ms / 1000;
    for (var k = 0; k < bars.length; k++) bars[k].style.transform = 'scaleY(' + (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * (6 + k * 1.4) + k * 1.7))).toFixed(3) + ')';
    raf = requestAnimationFrame(frame);
  }
  function paint() {
    var q = function (s) { return badge.querySelector(s); };
    var p = window.HzPick || {}, n = q('.hzb-name'), m = q('.hzb-model'), r = q('.hzb-read'), d = q('.hzu-dot');
    nm.textContent = n ? n.textContent : (p.name || 'Horizon');
    md.textContent = m ? m.textContent : (p.model ? String(p.model).replace(/^models\//i, '') : '');
    rd.textContent = r ? r.textContent : 'ready';
    var cls = d ? d.className.replace('hzu-dot', '').trim() : '';
    dot.className = 'hzc-dot ' + cls; dot.style.setProperty('--pc', d ? d.style.getPropertyValue('--pc') : '');
    var busy = !!(q('.hzb-pill.busy') || (d && /\brun\b/.test(d.className)));
    cap.classList.toggle('busy', busy);
    if (busy && !raf) raf = requestAnimationFrame(frame);
    cap.setAttribute('aria-label', (nm.textContent + ' ' + md.textContent + '. ' + rd.textContent).trim());
  }
  try { new MutationObserver(paint).observe(badge, { childList: true, subtree: true, characterData: true }); } catch (e) { /* no observer */ }
  document.addEventListener('hz:pick', paint);
  paint(); setTimeout(paint, 600); setTimeout(paint, 2000);
})();
