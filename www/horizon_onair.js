/* HORIZON V1.99.101 · radio on the shared screen.
 * Until now Horizon Radio kept its own dial and never touched the player's waveform or lyrics card. This file puts the station on
 * the SAME screen the music player uses (Widgets panel, MUSIC face):
 *   - the shared waveform runs while a station is on air (horizon_viz.js asks HorizonOnAir.live() / .bins());
 *   - when the station allows signal analysis (CORS) the bars follow the real stream through HorizonRadio.spectrum();
 *     when it does not, the bars use the same clock-driven motion as music and the tag says SIM WAVE (nothing is faked silently);
 *   - the lyrics card shows an ON AIR card (station, frequency, place, tags, status). Live radio has no lyrics and none are invented;
 *   - a tag over the waveform shows ON AIR + station + LIVE WAVE / SIM WAVE with a stop button.
 * It only READS the radio engine, except the stop button which calls the same HorizonRadio.run('stop') the AI uses.
 * Music and radio still never play together (the radio engine pauses music when a station starts). window.HorizonOnAir = { live, title, bins, info }. */
(function () {
  'use strict';
  if (window.HorizonOnAir) return;
  var smooth = [], lastReal = false;

  function rstate() { try { return (window.HorizonRadio && HorizonRadio.state) ? HorizonRadio.state() : null; } catch (e) { return null; } }
  function musicOn() { var m = document.getElementById('mpMini'); return !!(m && m.classList.contains('playing')); }
  function live() { var r = rstate(); return !!(r && r.status === 'playing' && r.station) && !musicOn(); }
  function title() { var r = rstate(); return r && r.station ? String(r.station.name || 'Radio') : ''; }
  function freq(st) { var f = st && st.f; return !f ? 'NET' : f.band === 'FM' ? f.v.toFixed(1) + ' FM' : Math.round(f.v) + ' AM'; }

  /* real bars (smoothed) or null when the signal is simulated */
  function bins(n) {
    var sp = null;
    try { sp = (window.HorizonRadio && HorizonRadio.spectrum) ? HorizonRadio.spectrum(n) : null; } catch (e) { sp = null; }
    lastReal = !!(sp && sp.real && sp.bins);
    if (!lastReal) { smooth = []; return null; }
    for (var i = 0; i < n; i++) { var p = smooth[i] || 0, t = sp.bins[i]; smooth[i] = t > p ? p + (t - p) * 0.7 : p * 0.82 + t * 0.18; }
    return smooth;
  }
  function info() {
    var r = rstate(), st = r && r.station;
    return { live: live(), station: st ? String(st.name || '') : '', freq: st ? freq(st) : '', country: st && st.country ? String(st.country) : '', tags: st && st.tags ? String(st.tags) : '', real: lastReal };
  }

  /* ---- DOM: tag on the waveform + ON AIR card in the lyrics slot ---- */
  var tag = null, tagT = null, tagM = null, card = null, cTitle = null, cMeta = null, cNote = null, lastKey = '';
  function el(tagName, cls, txt) { var e = document.createElement(tagName); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function build() {
    var wave = document.getElementById('hzRpWave'), lyr = document.getElementById('hzRpLyrics');
    if (wave && !tag) {
      tag = el('div', 'hz-onair-tag'); tag.hidden = true;
      var dot = el('i', 'hz-onair-dot'); tagT = el('b', '', 'ON AIR'); tagM = el('span', '', '');
      var stop = el('button', 'hz-onair-stop', 'STOP'); stop.type = 'button'; stop.setAttribute('aria-label', 'Stop the radio');
      stop.addEventListener('click', function () { try { if (window.HorizonRadio) HorizonRadio.run('stop', ''); } catch (e) { /* engine reports itself */ } });
      var ear = el('button', 'hz-onair-ear'); ear.type = 'button'; ear.setAttribute('aria-label', 'Ask Gemini about this station'); ear.title = 'Ask Gemini about this station';
      ear.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-ear"/></svg>';
      ear.addEventListener('click', function () { ears(); });
      tag.appendChild(dot); tag.appendChild(tagT); tag.appendChild(tagM); tag.appendChild(ear); tag.appendChild(stop); wave.appendChild(tag);
    }
    if (lyr && !card) {
      card = el('div', 'hz-onair-card'); card.hidden = true;
      card.appendChild(el('b', 'hz-onair-k', 'ON AIR'));
      cTitle = el('div', 'hz-onair-t', ''); cMeta = el('div', 'hz-onair-m', ''); cNote = el('div', 'hz-onair-n', 'Live radio has no lyrics. They come back when a song plays.');
      card.appendChild(cTitle); card.appendChild(cMeta); card.appendChild(cNote); lyr.appendChild(card);
    }
  }
  function paint() {
    build();
    var on = live(), media = document.getElementById('hzRpMedia');
    if (media) media.classList.toggle('is-radio', on);
    if (!on) { if (tag) tag.hidden = true; if (card) card.hidden = true; lastKey = ''; return; }
    var i = info(), key = i.station + '|' + i.freq + '|' + i.country + '|' + i.tags + '|' + i.real;
    if (tag) { tag.hidden = false; if (key !== lastKey) { tagM.textContent = i.station + ' · ' + (i.real ? 'LIVE WAVE' : 'SIM WAVE'); tag.title = i.real ? 'Bars follow the real stream.' : 'This station does not allow signal analysis, so the bars are simulated.'; } }
    if (card) {
      card.hidden = false;
      if (key !== lastKey) { cTitle.textContent = i.station; cMeta.textContent = [i.freq, i.country, i.tags].filter(Boolean).join(' · '); }
    }
    lastKey = key;
  }
  /* ---- V1.99.102: Gemini ears for the radio. Same sheet look as the music ears. Records a clip of what is on air on this phone and sends it to
     Google Gemini only when you tap Ask. If the station does not allow recording, Gemini is told so and works from the station details only. ---- */
  var LENS = [10, 15, 30, 60], LKEY = 'horizon_radio_ears_len', esh = null, elog = null, enote = null, eq = null, ego = null, etitle = null, ebusy = false, ehist = 0;
  function lget() { try { var v = Number(localStorage.getItem(LKEY)); return LENS.indexOf(v) > -1 ? v : 15; } catch (e) { return 15; } }
  function lset(v) { try { localStorage.setItem(LKEY, String(v)); } catch (e) { /* storage off */ } }
  function msg(cls, txt) { var b = el('div', 'mpe-b ' + cls, txt); elog.appendChild(b); elog.scrollTop = elog.scrollHeight; return b; }
  function paintOpts() {
    var chips = esh.querySelectorAll('#oaeLen [data-s]'), i;
    for (i = 0; i < chips.length; i++) chips[i].classList.toggle('on', Number(chips[i].getAttribute('data-s')) === lget());
    var keys = 0; try { keys = (window.HorizonMusic && HorizonMusic.gKeys) ? HorizonMusic.gKeys().length : 0; } catch (e) { keys = 0; }
    enote.classList.toggle('bad', !keys);
    enote.textContent = keys ? 'When you tap Ask, ' + lget() + ' s of the station is recorded on this phone and sent to Google Gemini. Stations that block recording are answered from their name and tags only.' : 'Add a Gemini key first (Settings > API providers).';
  }
  function build2() {
    if (esh) return;
    esh = el('div', 'mp-ears'); esh.id = 'oaEars'; esh.hidden = true;
    esh.setAttribute('role', 'dialog'); esh.setAttribute('aria-modal', 'true'); esh.setAttribute('aria-label', 'Ask Gemini about the radio');
    var quick = '';
    try { (HorizonMusic.RADIO_Q || []).forEach(function (x) { quick += '<button type="button" data-q="' + x + '">' + x + '</button>'; }); } catch (e) { quick = ''; }
    esh.innerHTML = '<div class="mpe-bg" data-e="close"></div><div class="mpe-sheet">' +
      '<div class="mpe-top"><span class="mpe-ic"><svg class="ic" aria-hidden="true"><use href="#i-ear"/></svg></span><div class="mpe-ttl"><b>Ask Gemini about the radio</b><span id="oaeStn"></span></div><button class="mp-ctl" type="button" data-e="close" aria-label="Close"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg></button></div>' +
      '<div class="mpe-opts"><div class="mpe-row"><span>Clip</span><div class="mpe-chips" id="oaeLen">' + LENS.map(function (n) { return '<button type="button" data-s="' + n + '">' + (n < 60 ? n + ' s' : '1 min') + '</button>'; }).join('') + '</div></div></div>' +
      '<p class="mpe-note" id="oaeNote"></p><div class="mpe-log" id="oaeLog" aria-live="polite"></div>' +
      '<div class="mpe-quick">' + quick + '</div>' +
      '<div class="mpe-in"><textarea id="oaeQ" rows="2" maxlength="600" placeholder="What is playing? Who is this? What is the vibe?"></textarea><button class="use-btn mpe-go" id="oaeGo" type="button">Ask</button></div></div>';
    document.body.appendChild(esh);
    elog = esh.querySelector('#oaeLog'); enote = esh.querySelector('#oaeNote'); eq = esh.querySelector('#oaeQ'); ego = esh.querySelector('#oaeGo'); etitle = esh.querySelector('#oaeStn');
    esh.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-e="close"]')) { esh.hidden = true; return; }
      var ln = t.closest('#oaeLen [data-s]'); if (ln) { lset(Number(ln.getAttribute('data-s'))); paintOpts(); return; }
      var qk = t.closest('[data-q]'); if (qk) { ask(qk.getAttribute('data-q')); return; }
      if (t.closest('#oaeGo')) ask(eq.value);
    });
    eq.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(eq.value); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && esh && !esh.hidden) esh.hidden = true; });
  }
  function ask(text) {
    text = String(text || '').trim();
    if (!text || ebusy) return;
    if (!live()) { msg('err', 'No station is on air. Start one first.'); return; }
    if (!window.HorizonMusic || !HorizonMusic.askRadio) { msg('err', 'Gemini ears are not ready.'); return; }
    ebusy = true; ego.disabled = true; eq.value = '';
    msg('me', text);
    var w = msg('wait', 'Recording ' + lget() + ' s, then Gemini listens…');
    HorizonMusic.askRadio(text, lget()).then(function (r) {
      w.className = 'mpe-b ai'; w.textContent = r.text;
      elog.appendChild(el('div', 'mpe-hint', r.heard ? 'He heard ' + r.secs + ' s of ' + r.station + ' (' + Math.round(r.bytes / 1024) + ' KB).' : 'He worked from the station details only, no audio was sent' + (r.why ? ' (' + r.why + ')' : '') + '.'));
      elog.scrollTop = elog.scrollHeight;
    }, function (e) { w.className = 'mpe-b err'; w.textContent = (e && e.message) || 'Gemini failed.'; }).then(function () { ebusy = false; ego.disabled = false; });
  }
  function ears() {
    if (!live()) { try { if (window.HorizonMusic && HorizonMusic.openEars) HorizonMusic.openEars(); } catch (e) { /* the player reports itself */ } return; }
    build2();
    var i = info(); etitle.textContent = i.station + (i.freq ? ' · ' + i.freq : '');
    paintOpts(); esh.hidden = false;
  }

  window.HorizonOnAir = { live: live, title: title, bins: bins, info: info, ears: ears };
  setInterval(paint, 500);
  document.addEventListener('DOMContentLoaded', paint);
  setTimeout(paint, 300);
})();
