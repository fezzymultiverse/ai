/* HORIZON V1.99.119 · WATCH: a YouTube video plays inside the media unit (Widgets panel), with its subtitles on the lyrics screen.
 * View only: no fullscreen, no maximise. Tap the picture to pause or play, X to close.
 * The AI starts it with [[yt.watch: words or VIDEO_ID]]. The stream link and the subtitle track come from horizon_ytdirect.js (the same
 * YouTube client the music streaming uses). No subtitle track, no subtitles: it says so and never makes text up.
 * Music and radio pause while a video plays, and the video closes if music or radio starts. */
(function () {
  'use strict';
  var media = document.getElementById('hzRpMedia');
  if (!media || document.getElementById('hzRpVideo')) return;
  var vcard = document.createElement('div'); vcard.className = 'hz-rpm-card'; vcard.id = 'hzRpVideo'; vcard.hidden = true;
  vcard.innerHTML = '<video controls playsinline webkit-playsinline preload="auto" disablepictureinpicture controlslist="nofullscreen nodownload noremoteplayback"></video>' +
    '<div class="hzw-ti"></div><button type="button" class="hzw-x" aria-label="Close video">\u2715</button><i class="hzw-bar"><b></b></i><span class="hzw-st"></span>' +
    '<button type="button" class="hzw-retry" hidden>RETRY</button><button type="button" class="hzw-cc" aria-label="Toggle subtitles" aria-pressed="true">CC ON</button>';
  var scard = document.createElement('div'); scard.className = 'hz-rpm-card'; scard.id = 'hzRpSubs'; scard.hidden = true;
  scard.innerHTML = '<div class="hzw-head"><b>SUBTITLES</b><span class="hzw-lang"></span></div><div class="hzw-lines" aria-live="off"></div>';
  media.appendChild(vcard); media.appendChild(scard);
  var v = vcard.querySelector('video'), ti = vcard.querySelector('.hzw-ti'), bar = vcard.querySelector('.hzw-bar b'), st = vcard.querySelector('.hzw-st');
  var lines = scard.querySelector('.hzw-lines'), langEl = scard.querySelector('.hzw-lang');
  var retryBtn = vcard.querySelector('.hzw-retry');
  var cues = [], idx = -2, on = false, guard = 0, blobUrl = '', trail = [], retryFn = null;
  var cc = vcard.querySelector('.hzw-cc'), subtitles = true, serial = 0, cancelStart = null, embedded = null, embedNode = null, embedMode = false;
  try { subtitles = localStorage.getItem('horizon_watch_subtitles') !== '0'; } catch (_) {}
  function paintCC() {
    cc.textContent = subtitles ? 'CC ON' : 'CC OFF'; cc.setAttribute('aria-pressed', subtitles ? 'true' : 'false');
    scard.hidden = true;
    for (var i=0; v.textTracks && i<v.textTracks.length; i++) v.textTracks[i].mode = subtitles ? 'showing' : 'hidden';
    if (embedded && embedMode) { try { if (subtitles) embedded.loadModule('captions'); else embedded.unloadModule('captions'); } catch (_) {} }
  }
  cc.addEventListener('click', function(e) { e.stopPropagation(); subtitles = !subtitles; try {localStorage.setItem('horizon_watch_subtitles', subtitles ? '1' : '0');} catch (_) {} paintCC(); });
  paintCC();
  function clearEmbed() {
    if (embedded) { try {embedded.destroy();} catch (_) {} }
    embedded = null; if (embedNode) embedNode.remove(); embedNode = null; embedMode = false; v.hidden = false;
  }
  function cancelPending() { serial++; if (cancelStart) { var fn=cancelStart; cancelStart=null; fn(); } }
  function reveal() {
    if (window.HorizonMedia && HorizonMedia.face) HorizonMedia.face('music', false);
    media.classList.add('is-watch'); media.classList.remove('is-idle'); vcard.hidden = false; paintCC();
  }
  function watchOthers() { if (!guard) guard = setInterval(function() {if(on && othersStarted()) stop();}, 600); }


  /* V1.99.119: a short trail of what each attempt did, so a failure can be read instead of guessed. */
  function mark(s) { trail.push(s); if (trail.length > 14) trail.shift(); }
  function setStatus(t, fail) { st.textContent = t || ''; st.hidden = !t; st.classList.toggle('is-fail', !!fail); }
  function showFail(why) {
    on = false; clearInterval(guard); guard = 0;
    try { v.pause(); } catch (e) { /* ignore */ }
    vcard.classList.remove('is-playing');
    setStatus('COULD NOT PLAY\n' + (why || 'unknown reason'), true);
    retryBtn.hidden = !retryFn;
  }
  function lineEl(text, cls) { var p = document.createElement('p'); p.className = 'hzly-line' + (cls ? ' ' + cls : ''); p.textContent = text; return p; }
  function note(text) { lines.replaceChildren(); lines.appendChild(lineEl(text, 'is-near')); }
  function find(t) {
    var lo = 0, hi = cues.length - 1, r = -1;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (cues[m].s <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  function paintCues() {
    if (!cues.length) return;
    var t = v.currentTime || 0, i = find(t);
    if (i >= 0 && t > cues[i].e + 0.4 && !(cues[i + 1] && cues[i + 1].s - t < 0.2)) { /* gap between cues: keep the last one dim */ }
    if (i === idx) return; idx = i;
    lines.replaceChildren();
    for (var k = i - 1; k <= i + 2; k++) {
      if (k < 0 || k >= cues.length) continue;
      lines.appendChild(lineEl(cues[k].t, k === i ? 'is-on' : 'is-near'));
    }
    if (i < 0 && cues[0]) { lines.replaceChildren(lineEl(cues[0].t, 'is-near')); }
  }
  function paintBar() {
    var d = v.duration; if (d && isFinite(d)) bar.style.width = Math.min(100, (v.currentTime / d) * 100) + '%';
  }
  function tick() { paintCues(); paintBar(); }
  v.addEventListener('timeupdate', tick);
  v.addEventListener('seeked', function () { idx = -2; tick(); });
  v.addEventListener('waiting', function () { if (on) setStatus('Buffering\u2026'); });
  v.addEventListener('playing', function () { if (!on || embedMode) return; watchOthers(); setStatus(''); vcard.classList.add('is-playing'); meta(); });
  v.addEventListener('pause', function () { vcard.classList.remove('is-playing'); if (on && !v.ended) setStatus('Paused'); });
  v.addEventListener('ended', function () { setStatus('Ended'); vcard.classList.remove('is-playing'); });
  retryBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var fn = retryFn; retryBtn.hidden = true;
    if (fn) { try { var p = fn(); if (p && p.catch) p.catch(function () {}); } catch (err) { /* shown by the next attempt */ } }
  });
  vcard.addEventListener('click', function (e) {
    if (e.target === v || e.target.closest('.hzw-x') || e.target.closest('.hzw-retry') || e.target.closest('.hzw-cc') || embedMode) return;
    if (!on) return;
    if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause();
  });
  vcard.querySelector('.hzw-x').addEventListener('click', function (e) { e.stopPropagation(); stop(); });

  function meta() {
    try {
      if (!on || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
      navigator.mediaSession.metadata = new MediaMetadata({ title: ti.textContent || 'Video', artist: 'Horizon Watch', album: 'YouTube' });
      navigator.mediaSession.setActionHandler('play', function () { if(embedMode && embedded) {embedded.playVideo();return;} var p = v.play(); if (p && p.catch) p.catch(function () {}); });
      navigator.mediaSession.setActionHandler('pause', function () { if(embedMode && embedded) embedded.pauseVideo(); else v.pause(); });
      navigator.mediaSession.setActionHandler('stop', stop);
      navigator.mediaSession.playbackState = embedMode && embedded ? (embedded.getPlayerState() === 1 ? 'playing' : 'paused') : (v.paused ? 'paused' : 'playing');
    } catch (e) { /* optional */ }
  }
  function quietOthers() {
    try { if (window.HorizonMusic && HorizonMusic.pauseNow) HorizonMusic.pauseNow(); } catch (e) { /* ignore */ }
    try { var rs = window.HorizonRadio && HorizonRadio.state && HorizonRadio.state(); if (rs && (rs.status === 'playing' || rs.status === 'loading')) HorizonRadio.run('stop', 'now'); } catch (e) { /* ignore */ }
  }
  function othersStarted() {
    try { if (window.HorizonMusic && HorizonMusic.playingNow && HorizonMusic.playingNow()) return true; } catch (e) { /* ignore */ }
    try { var rs = window.HorizonRadio && HorizonRadio.state && HorizonRadio.state(); if (rs && rs.status === 'playing') return true; } catch (e) { /* ignore */ }
    return false;
  }
  function start(url) {
    return new Promise(function (resolve) {
      var done = false;
      function fin(ok, why) { if (done) return; done = true; cancelStart = null; clearTimeout(tm); v.removeEventListener('playing', good); v.removeEventListener('error', bad); resolve({ ok: ok, why: why || '' }); }
      function good() { fin(true); }
      function bad() {
        var er = v.error, code = er && er.code ? er.code : 0;
        var names = { 1: 'aborted', 2: 'network', 3: 'decode', 4: 'source not supported' };
        fin(false, 'player error ' + code + (names[code] ? ' (' + names[code] + ')' : '') + (er && er.message ? ': ' + String(er.message).slice(0, 80) : ''));
      }
      cancelStart = function() {fin(false, 'cancelled');};
      var tm = setTimeout(function () { fin(!v.paused && v.currentTime > 0, 'no picture after 15 seconds (ready ' + v.readyState + ', net ' + v.networkState + ')'); }, 15000);
      v.addEventListener('playing', good); v.addEventListener('error', bad);
      v.src = url; v.load();
      var p = v.play(); if (p && p.catch) p.catch(function (e) { if (e && e.name === 'NotAllowedError') fin(false, 'Android wants a tap first: tap the picture to play'); });
    });
  }
  var captionsUrl = '';
  function installCaptions() {
    if (v.querySelectorAll) v.querySelectorAll('track').forEach(function(t) {t.remove();});
    if (captionsUrl) URL.revokeObjectURL(captionsUrl); captionsUrl = '';
    if (!cues.length) return;
    function stamp(t) {return new Date(Math.max(0, Number(t)||0)*1000).toISOString().slice(11,23);}
    var text = 'WEBVTT\n\n' + cues.map(function(c) {return stamp(c.s)+' --> '+stamp(c.e)+'\n'+String(c.t).replace(/-->/g,'→').replace(/</g,'&lt;')+'\n';}).join('\n');
    captionsUrl = URL.createObjectURL(new Blob([text], {type:'text/vtt'}));
    var track = document.createElement('track'); track.kind='subtitles'; track.label='Subtitles'; track.srclang='en'; track.src=captionsUrl; track.default=subtitles; v.appendChild(track);
    track.addEventListener('load', paintCC);
  }
  function clearBlob() { if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (e) { /* ignore */ } blobUrl = ''; } }

  function stop() {
    cancelPending(); clearEmbed(); on = false; clearInterval(guard); guard = 0; retryFn = null; retryBtn.hidden = true;
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ }
    clearBlob();
    vcard.hidden = true; scard.hidden = true; media.classList.remove('is-watch'); vcard.classList.remove('is-playing');
    cues = []; installCaptions(); idx = -2; lines.replaceChildren(); bar.style.width = '0%'; setStatus('');
  }

  /* o: { id, title, artist, url, ua, size, cues, lang, auto, why, via, retry }
     V1.99.119: a failed start no longer closes the card. The reason stays on the picture with a RETRY button until you close it with X. */
  async function play(o) {
    if (!o || !o.url) return { ok: false, why: 'no stream link' };
    cancelPending(); var mine = serial; clearEmbed();
    quietOthers();
    on = true; cues = (o.cues || []).slice(); idx = -2; clearBlob();
    retryFn = typeof o.retry === 'function' ? o.retry : null; retryBtn.hidden = true;
    ti.textContent = (o.artist ? o.artist + ' · ' : '') + (o.title || o.id || 'Video');
    langEl.textContent = cues.length ? ((o.lang || '').toUpperCase() + (o.auto ? ' · AUTO' : '')) : '';
    if (cues.length) note('♪'); else note(o.why ? 'No subtitles for this video (' + o.why + ')' : 'No subtitles for this video');
    installCaptions();
    reveal(); setStatus('Loading…');
    var route = o.via || o.client || 'route';
    var r = await start(o.url);
    if (mine !== serial) return {ok:false,why:'cancelled'};
    mark(route + ' direct: ' + (r.ok ? 'ok' : r.why));
    if (!r.ok && o.allowBlobFallback === true && o.ua && window.HzYtDirect && HzYtDirect.fetchBlob && !/tap the picture/.test(r.why)) {
      try {
        setStatus('Loading… (second route)');
        var blob = await HzYtDirect.fetchBlob(o.url, o.ua, o.size);
        if (mine !== serial) return {ok:false,why:'cancelled'};
        if (blob && blob.size > 0 && blob.size < 90 * 1048576) { blobUrl = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'video/mp4' })); r = await start(blobUrl); mark(route + ' download: ' + (r.ok ? 'ok' : r.why)); }
        else mark(route + ' download: ' + (blob && blob.size ? 'too big (' + Math.round(blob.size / 1048576) + ' MB)' : 'empty'));
      } catch (e) { mark(route + ' download: ' + ((e && e.message) || 'failed')); }
    }
    if (mine !== serial) return {ok:false,why:'cancelled'};
    if (!r.ok) {
      if (/tap the picture/.test(r.why || '')) { setStatus(r.why); on = true; return r; }
      showFail((route ? route + ' - ' : '') + (r.why || 'unknown'));
      return r;
    }
    if (!guard) guard = setInterval(function () { if (on && othersStarted()) stop(); }, 1000);
    tick();
    return { ok: true, subs: cues.length, lang: o.lang || '', auto: !!o.auto };
  }
  var apiPromise = null;
  function youtubeAPI() {
    if (window.YT && YT.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function(resolve,reject) {
      var done=false, previous=window.onYouTubeIframeAPIReady;
      var timer=setTimeout(function(){ if(done)return;done=true;apiPromise=null;reject(new Error('YouTube player API timed out')); },12000);
      window.onYouTubeIframeAPIReady=function(){if(typeof previous==='function') {try{previous();}catch(_){}} if(done)return;done=true;clearTimeout(timer);resolve();};
      var script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';
      script.onerror=function(){if(done)return;done=true;clearTimeout(timer);apiPromise=null;reject(new Error('YouTube player API could not load'));};document.head.appendChild(script);
    });return apiPromise;
  }
  async function embed(o) {
    if (!o || !/^[\w-]{11}$/.test(o.id || '')) return {ok:false,why:'invalid video id'};
    stop(); var mine=serial; quietOthers();on=true;embedMode=true;
    ti.textContent=o.title||o.id;retryFn=o.retry||function(){return embed(o);};
    reveal();setStatus('Opening YouTube player…');note('YouTube subtitles appear on the video when available. Use CC to turn them on or off.');
    try { await youtubeAPI(); } catch(e) { if(mine!==serial)return {ok:false,why:'cancelled'};showFail(e.message);return {ok:false,why:e.message}; }
    if(mine!==serial)return {ok:false,why:'cancelled'};
    v.hidden=true;
    embedNode=document.createElement('div');embedNode.className='hzw-embed';vcard.insertBefore(embedNode,vcard.firstChild);
    return new Promise(function(resolve) {
      var done=false;
      function finish(r){if(done)return;done=true;cancelStart=null;clearTimeout(timer);resolve(r);}
      cancelStart=function(){finish({ok:false,why:'cancelled'});};
      var timer=setTimeout(function(){if(mine!==serial)return finish({ok:false,why:'cancelled'});setStatus('Tap the video to play. YouTube restrictions or errors will be shown here.');finish({ok:false,pending:true,why:'YouTube is waiting for playback; tap the video'});},15000);
      try {
        embedded=new YT.Player(embedNode, {width:'100%',height:'100%',videoId:o.id,
          host:'https://www.youtube.com',playerVars:{autoplay:1,playsinline:1,controls:1,fs:0,rel:0,cc_load_policy:subtitles?1:0,origin:location.origin},
          events:{onReady:function(e){if(mine!==serial)return;var frame=e.target.getIframe();frame.classList.add('hzw-embed');frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');frame.setAttribute('allow','autoplay; encrypted-media');setStatus('Tap the video to play');e.target.playVideo();},
            onStateChange:function(e){if(mine!==serial)return;if(e.data===1){on=true;setStatus('');vcard.classList.add('is-playing');watchOthers();meta();finish({ok:true,embedded:true,subs:0});}else if(e.data===3){setStatus('Buffering… YouTube is adapting quality');}else if(e.data===2){setStatus('Paused');vcard.classList.remove('is-playing');}else if(e.data===0){vcard.classList.remove('is-playing');}},
            onApiChange:function(){if(mine===serial)paintCC();},
            onError:function(e){if(mine!==serial)return;var why='YouTube player error '+e.data+(e.data===101||e.data===150?' — the owner disabled embedding':e.data===153?' — this WebView did not provide an accepted referrer':'');showFail(why);finish({ok:false,why:why});}
          }});
        // YT replaces the supplied div; retain the resulting frame for cleanup.
      } catch(e){showFail(e.message);finish({ok:false,why:e.message});}
    });
  }
  window.HorizonWatch = { embed: embed, play: play, stop: stop, active: function () { return on; }, report: function () { return trail.join(' | '); }, state: function () { return { on: on, paused: embedMode && embedded && embedded.getPlayerState ? embedded.getPlayerState() !== 1 : v.paused, t: v.currentTime || 0, subs: cues.length, subtitles: subtitles, embedded: embedMode }; } };
})();
