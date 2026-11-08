/* HORIZON V1.67.0 · header buttons + pill. The pill only repaints from the existing provider pill and usage badge
   (they stay in the page, hidden), so every old handler and number keeps working. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); }, root = document.documentElement;
  function tap(sel) { var b = typeof sel === 'string' ? document.querySelector(sel) : sel; if (b) b.click(); }
  try { localStorage.removeItem('horizon_snooze'); } catch (e) { /* storage blocked */ }   // Snooze is gone; make sure nothing stays paused

  /* Downloads row (Settings) and Github Push row (Menu panel) open the real windows */
  var dl = $('hzDlRow'); if (dl) dl.addEventListener('click', function () { tap('.hz-app[data-addon="downloads"]'); });
  var lg = $('hzLeftGh'); if (lg) lg.addEventListener('click', function () { tap('.hz-app[data-addon="github"]'); });

  var header = document.querySelector('.app-header'), top = document.querySelector('.hzd-top'), pill = $('hzPill'), badge = $('hzBadge');
  if (!root.classList.contains('hzd-on') || !header || !top || !pill || !badge) return;
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  var NS = 'http://www.w3.org/2000/svg';

  /* ---- left: the Horizon chip becomes a hamburger (long to short lines) that opens the Menu ---- */
  var chip = header.querySelector('.chip-logo'), logo = header.querySelector('.logo-area');
  if (chip) {
    chip.innerHTML = '<svg class="hzc-bars" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h12M3 18h6"/></svg>';
    chip.setAttribute('role', 'button'); chip.setAttribute('tabindex', '0'); chip.setAttribute('aria-label', 'Open menu');
    chip.addEventListener('click', function () { tap('#menuBtn'); });
    chip.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap('#menuBtn'); } });
  }
  function sq(label, color, path, target) {
    var b = el('button', 'hzc-sq'); b.type = 'button'; b.style.setProperty('--c', color); b.setAttribute('aria-label', label); b.title = label;
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
    b.addEventListener('click', function () { tap(target); }); return b;
  }
  var browser = sq('Browser', '#3d8bff', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>', '#hzbOpen');
  var group = sq('AI Group Chat', '#2bff88', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.3c2.3.7 3.5 2.6 3.5 5.7"/>', '#groupBtn');
  if (logo) { logo.insertAdjacentElement('afterend', browser); browser.insertAdjacentElement('afterend', group); }
  else { header.insertBefore(group, header.firstChild); header.insertBefore(browser, header.firstChild); }

  /* ---- right: small vertical hamburger opens Settings ---- */
  var set = sq('Settings', '#00e5ff', '<path d="M6 5v14M12 5v14M18 5v14"/>', '#settingsBtn'); set.classList.add('vert');
  header.appendChild(set);

  /* ---- the pill: dot, provider, model, speaker (only while writing), tokens ---- */
  var cap = el('div', 'hzc-cap'), inn = el('div', 'hzc-in');
  var main = el('button', 'hzc-main'), dot = el('i', 'hzc-dot'), nm = el('span', 'hzc-nm'), md = el('span', 'hzc-md');
  main.type = 'button'; main.appendChild(dot); main.appendChild(nm); main.appendChild(md);
  var spk = el('span', 'hzc-spk'); spk.setAttribute('aria-hidden', 'true');
  spk.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path class="a1" d="M16 9a4 4 0 0 1 0 6"/><path class="a2" d="M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
  var st = el('button', 'hzc-st'); st.type = 'button';
  inn.appendChild(main); inn.appendChild(spk); inn.appendChild(st); cap.appendChild(inn); top.appendChild(cap);
  main.addEventListener('click', function () { pill.click(); });
  st.addEventListener('click', function () { badge.click(); });

  /* the speaker pulses with JavaScript, so a phone's "remove animations" setting cannot freeze it */
  var raf = 0, a1 = spk.querySelector('.a1'), a2 = spk.querySelector('.a2');
  function frame(ms) {
    raf = 0; if (!cap.classList.contains('busy')) return;
    var t = ms / 1000;
    a1.style.opacity = (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 7))).toFixed(2);
    a2.style.opacity = (0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t * 7 - 1.4))).toFixed(2);
    raf = requestAnimationFrame(frame);
  }
  function paint() {
    var q = function (s) { return badge.querySelector(s); };
    var p = window.HzPick || {}, n = q('.hzb-name'), m = q('.hzb-model'), r = q('.hzb-read'), d = q('.hzu-dot');
    nm.textContent = n ? n.textContent : (p.name || 'Horizon');
    md.textContent = m ? m.textContent : (p.model ? String(p.model).replace(/^models\//i, '') : '');
    st.textContent = r ? r.textContent : 'ready';
    dot.className = 'hzc-dot ' + (d ? d.className.replace('hzu-dot', '').trim() : ''); dot.style.setProperty('--pc', d ? d.style.getPropertyValue('--pc') : '');
    var busy = !!(q('.hzb-pill.busy') || (d && /\brun\b/.test(d.className)));
    cap.classList.toggle('busy', busy);
    if (busy && !raf) raf = requestAnimationFrame(frame);
    cap.setAttribute('aria-label', (nm.textContent + ' ' + md.textContent + '. ' + st.textContent).trim());
  }
  try { new MutationObserver(paint).observe(badge, { childList: true, subtree: true, characterData: true }); } catch (e) { /* no observer */ }
  document.addEventListener('hz:pick', paint);
  paint(); setTimeout(paint, 600); setTimeout(paint, 2000);
})();
