/* HORIZON keyless studio: persistent playlists, local instrumental WAVs and device-voice
   podcast playback. No remote generation service, provider fallback or new credentials. */
(function () {
  'use strict';
  const W = window, D = document, ROOT = new URL('.', D.currentScript ? D.currentScript.src : location.href);
  const KEY = 'horizon_studio_v1', MAX_LISTS = 40, MAX_TRACKS = 30;
  const SRC = '\\[\\[((?:playlist\\.(?:create|list|show|play|export|download|add|delete))|(?:studio\\.(?:open|music|podcast))):?\\s*((?:(?!\\]\\])[\\s\\S])*?)\\s*\\]\\]';
  let host = {}, dialog = null, worker = null, cancelRender = null, audio = null, audioUrl = '', speechSeq = 0, playingList = false, playlistSeq = 0, releaseSpeech = null;
  const node = (tag, text, cls) => { const n = D.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const clean = (s, n = 200) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
  const safeName = s => clean(s, 140).replace(/[\\/:*?"<>|]/g, '_') || 'Horizon';
  function load() {
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(x => x && typeof x.name === 'string' && Array.isArray(x.tracks)).slice(0, MAX_LISTS).map(x => ({name:clean(x.name,80),tracks:x.tracks.slice(0,MAX_TRACKS).map(track),updated:x.updated})) : []; }
    catch (_) { return []; }
  }
  function track(t) {
    if (typeof t === 'string') { const query=clean(t,200); if(!query) throw new Error('A playlist track is empty.'); return {source:'youtube',query}; }
    if (!t || typeof t !== 'object') throw new Error('Each playlist track needs a title or query.');
    if (t.source === 'local') {
      if (!clean(t.id)) throw new Error('A local track needs the real id returned by music.search.');
      return {source:'local',id:clean(t.id),title:clean(t.title || t.id)};
    }
    const query = clean(t.query || t.title,200);
    if (!query) throw new Error('A playlist track is empty.');
    return {source:'youtube',query,id:/^[\w-]{11}$/.test(t.id || '') ? t.id : '',title:clean(t.title),artist:clean(t.artist)};
  }
  // V1.99.139: the AI often sends curly quotes, trailing commas, a code fence or a plain list instead of strict JSON. Read all of them.
  function lenient(arg) {
    let t = String(arg == null ? '' : arg).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    t = t.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
    const fix = x => x.replace(/,\s*([\]}])/g, '$1');
    try { return JSON.parse(t); } catch (_) { /* try the next form */ }
    try { return JSON.parse(fix(t)); } catch (_) { /* try the next form */ }
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(fix(t.slice(a, b + 1))); } catch (_) { /* try the next form */ } }
    const lines = t.split(/\n|;/).map(x => x.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    if (!lines.length) return null;
    const pipe = /^(.{1,80}?)\s*\|\s*(.+)$/.exec(lines[0]);
    if (pipe) return { name: pipe[1], play: true, tracks: [pipe[2]].concat(lines.slice(1)) };
    if (lines.length >= 2) return { name: lines[0], play: true, tracks: lines.slice(1) };
    return null;
  }
  async function resolveTracks(raw, active) {
    if (!Array.isArray(raw) || !raw.length) throw new Error('Provide at least one track.');
    const tracks = [], misses = [], seen = new Set();
    for (const entry of raw.slice(0, MAX_TRACKS)) {
      if (active) active();
      let t;
      try {
        t = track(entry);
        // IDs and display names proposed by the AI are not trusted.
        t = t.source === 'local' ? await host.resolveLocal(t.id) : await host.resolveYouTube(t.query);
      } catch (e) {
        if (e && e.stopped) throw e;
        misses.push(clean(typeof entry === 'string' ? entry : (entry && (entry.query || entry.id)) || 'Invalid track')); continue;
      }
      if (!t) { misses.push(clean(typeof entry === 'string' ? entry : (entry && (entry.query || entry.id)) || 'Invalid track')); continue; }
      const key = t.source + ':' + t.id;
      if (!seen.has(key)) { seen.add(key); tracks.push(t); }
    }
    if (active) active();
    if (!tracks.length) throw new Error('No tracks could be verified. Nothing was added or played.');
    return {tracks, misses};
  }
  function omissions(misses) {
    return misses.length ? '\nSkipped ' + misses.length + ' unverified suggestion(s): ' + misses.slice(0, 5).join(' · ') + '.' : '';
  }
  function uniqueName(name, all) {
    const taken = n => all.some(x => x.name.toLowerCase() === n.toLowerCase());
    if (!taken(name)) return name;
    for (let k = 2; k < 60; k++) { const n = clean(name, 74) + ' ' + k; if (!taken(n)) return n; }
    return clean(name, 70) + ' ' + Date.now().toString(36);
  }
  function create(def, unique) {
    if (def && Array.isArray(def.tracks) && def.tracks.length > MAX_TRACKS) def = Object.assign({}, def, {tracks: def.tracks.slice(0, MAX_TRACKS)});
    if (!def || typeof def !== 'object' || !clean(def.name,80) || !Array.isArray(def.tracks) || !def.tracks.length) throw new Error('Use a playlist name and 1–30 tracks.');
    const item = {name:clean(def.name,80), tracks:def.tracks.map(track), updated:Date.now()}, all = load();
    // Never silently replace the user's saved selection. The AI path asks for a unique name instead of failing.
    if (unique) item.name = uniqueName(item.name, all);
    const i = all.findIndex(x => x.name.toLowerCase() === item.name.toLowerCase());
    if (i >= 0) throw new Error('That playlist name already exists. Use a new name.');
    if (all.length >= MAX_LISTS) throw new Error('Playlist storage is full (40 playlists).');
    all.push(item); localStorage.setItem(KEY, JSON.stringify(all)); return item;
  }
  function get(name) { const item = load().find(x => x.name.toLowerCase() === clean(name,80).toLowerCase()); if (!item) throw new Error('Playlist not found. Use playlist.list first.'); return item; }
  // V1.99.133: grow or remove a saved playlist without making the user retype it.
  function addTracks(name, list) {
    const all = load(), i = all.findIndex(x => x.name.toLowerCase() === clean(name,80).toLowerCase());
    if (i < 0) throw new Error('Playlist not found. Use playlist.list first.');
    if (!Array.isArray(list) || !list.length) throw new Error('Give a tracks array to add.');
    const keyOf = t => t.source + ':' + (t.id || String(t.query).toLowerCase());
    const have = new Set(all[i].tracks.map(keyOf));
    let added = 0;
    for (const raw of list) {
      const t = track(raw), k = keyOf(t);
      if (have.has(k)) continue;
      if (all[i].tracks.length >= MAX_TRACKS) throw new Error('A playlist holds at most ' + MAX_TRACKS + ' tracks (' + added + ' added).');
      all[i].tracks.push(t); have.add(k); added++;
    }
    all[i].updated = Date.now(); localStorage.setItem(KEY, JSON.stringify(all));
    return {item: all[i], added};
  }
  function removeList(name) {
    const all = load(), i = all.findIndex(x => x.name.toLowerCase() === clean(name,80).toLowerCase());
    if (i < 0) throw new Error('Playlist not found. Use playlist.list first.');
    const gone = all.splice(i, 1)[0]; localStorage.setItem(KEY, JSON.stringify(all)); return gone;
  }
  async function play(name, active) {
    if (playingList) throw new Error('A playlist is already being prepared. Wait for its result.');
    const item = get(name); if (!host.track) throw new Error('Music player is not ready. Reopen Horizon.');
    playingList = true; let done = 0; const skipped = []; const token = ++playlistSeq;
    try {
      for (const t of item.tracks) {
        if (active) active();
        if (token !== playlistSeq) return {text:'CANCELLED: playlist preparation stopped after ' + done + ' tracks. Already-started playback was not stopped.'};
        let r = null;
        try { r = await host.track(t, done > 0); } catch (e) { r = {text: 'ERROR: ' + ((e && e.message) || e)}; }
        if (active) active();
        // V1.99.139: one song that cannot be found no longer throws the whole playlist away: it is skipped and reported.
        if (r && r.why === 'tap') return {text:'Playback has not started. '+r.text+' The rest of the playlist was not queued.'};
        if (!r || /^(?:ERROR|NEEDS CHOICE|NOT FOUND)/i.test(r.text || '') || !/^(?:Started|Playing|Queued|Added|Up next)/i.test(r.text || '')) { skipped.push((t.source === 'local' ? (t.title || t.id) : t.query) + ' (' + String((r && r.text) || 'not confirmed').slice(0, 70) + ')'); continue; }
        if (!done && host.isolatePlaylist) host.isolatePlaylist();
        done++;
      }
      if (!done) return {text:'ERROR: Playlist \"' + item.name + '\": none of the ' + item.tracks.length + ' tracks could be played. ' + skipped.slice(0, 3).join(' | ')};
      return {text:'Started playlist "' + item.name + '": first track playing; ' + (done - 1) + ' queued in order.' + (skipped.length ? ' Skipped ' + skipped.length + ' that could not be played or queued: ' + skipped.slice(0, 4).join(' | ') + '.' : '') + ' Streaming is not a file download.'};
    } finally { playingList = false; }
  }
  function stopPlaylist() { ++playlistSeq; }
  async function save(blob, name) { if (!W.HorizonOutputs) throw new Error('Downloads saver is not ready.'); return W.HorizonOutputs.saveBlob(blob, safeName(name)); }
  async function exportList(name) {
    // JSON preserves searchable references; it is not mislabeled as a playable media manifest.
    const item = get(name); return save(new Blob([JSON.stringify(item,null,2)], {type:'application/json'}), item.name + '.playlist.json');
  }
  function renderMusic(options) {
    if (worker) return Promise.reject(new Error('A composition is already rendering.'));
    return new Promise((resolve, reject) => {
      let w; try { w = new Worker(new URL('horizon_studio_worker.js', ROOT).href); } catch (e) { reject(new Error('This WebView cannot start the local music worker. Update Android System WebView.')); return; }
      worker = w;
      const finish = (err, value) => { clearTimeout(timer); w.terminate(); if (worker === w) {worker = null; cancelRender = null;} err ? reject(err) : resolve(value); };
      const timer = setTimeout(() => finish(new Error('Local music render timed out. Try a shorter track.')), 60000);
      cancelRender = () => finish(new Error('Composition cancelled.'));
      w.onerror = () => finish(new Error('The local music renderer failed.'));
      w.onmessage = e => e.data.error ? finish(new Error(e.data.error)) : finish(null, new Blob([e.data.buffer], {type:'audio/wav'}));
      w.postMessage({title:clean(options.title),style:options.style,seconds:options.seconds,bpm:options.bpm});
    });
  }
  function nativeSpeech() { const c = W.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.HorizonSpeech; }
  async function stopSpeech() { ++speechSeq; if (releaseSpeech) {releaseSpeech();releaseSpeech=null;} const p = nativeSpeech(); if (p) await p.stop(); else if (W.speechSynthesis) W.speechSynthesis.cancel(); }
  async function speak(text, update) {
    await stopSpeech(); const token = speechSeq, p = nativeSpeech();
    const input = clean(text,18000); if (!input) throw new Error('Add a podcast script first.');
    // Prefer installed OFFLINE voices only, rather than silently sending scripts to a cloud TTS engine.
    let voices = p ? (await p.getSupportedVoices()).voices || [] : W.speechSynthesis ? W.speechSynthesis.getVoices() : [];
    voices = voices.filter(v => p ? v.network === false : v.localService === true);
    const voice = voices.find(v => /^en(-|$)/i.test(v.lang)) || voices[0];
    if (!voice) throw new Error('No offline device voice is available. Install voice data in Android text-to-speech settings.');
    const chunks = input.match(/[\s\S]{1,1000}(?:\s|$)|[\s\S]{1,1000}/g) || [];
    for (let i=0; i<chunks.length; i++) {
      if (token !== speechSeq) return;
      if (update) update('Playing segment ' + (i+1) + '/' + chunks.length + ' using ' + voice.name);
      if (p) { try { await p.speak({text:chunks[i],lang:voice.lang,voiceName:voice.name,rate:1,pitch:1,effects:{}}); } catch(e) { if(token !== speechSeq)return; throw e; } }
      else await new Promise((resolve,reject) => {
        const u = new SpeechSynthesisUtterance(chunks[i]); u.voice=voice; u.lang=voice.lang;
        const finish=()=>{if(releaseSpeech===finish)releaseSpeech=null;resolve();};releaseSpeech=finish;
        u.onend=finish;u.onerror=e=>{if(releaseSpeech===finish)releaseSpeech=null;token !== speechSeq ? resolve() : reject(new Error('Device speech failed: '+e.error));}; W.speechSynthesis.speak(u);
      });
    }
    if (token === speechSeq && update) update('Podcast playback finished. Script available to export; no recorded audio file was created.');
  }
  function dispose() {
    if (cancelRender) cancelRender();
    stopSpeech().catch(()=>{});
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio=null; }
    if (audioUrl) {URL.revokeObjectURL(audioUrl);audioUrl='';}
    dialog = null;
  }
  function open(mode, payload) {
    if (dialog) {dialog.close();dialog.remove();dispose();}
    const d = node('dialog',null,'hz-studio'); dialog=d; d.setAttribute('aria-label','Horizon keyless studio');
    const status = node('p','Ready.','hz-studio-status');status.setAttribute('role','status');
    const setStatus = s => {status.textContent=s;};
    const button = (label, fn) => {const b=node('button',label);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){setStatus(e.message||String(e));}finally{b.disabled=false;}};return b;};
    const field = (name, type, value) => { const label=node('label',name), input=node(type==='textarea'?'textarea':'input'); if(type!=='textarea') input.type=type;input.value=value||'';label.append(input);d.append(label);return input;};
    d.append(node('h2','HORIZON · Keyless Studio'),button('Close',()=>d.close()),status);
    d.append(node('p','No new account or key. Music is local procedural synthesis, not studio-grade AI songs. Podcast playback uses installed offline voices; it does not export recorded speech. AI-written scripts and track suggestions still use your selected chat provider.'));
    d.append(node('h3','Music playlists'));
    const listName=field('Playlist name','text',mode==='playlist'&&payload?payload.name:''), tracks=field('Tracks · one Artist – Song per line, or local:TRACK_ID','textarea',mode==='playlist'&&payload?payload.tracks.map(t=>typeof t==='string'?t:t.source==='local'?'local:'+t.id:t.query||t.title).join('\n'):'');
    listName.maxLength=80;tracks.maxLength=8000;
    const saved=node('div',null,'hz-studio-lists');
    const paintLists=()=>{saved.replaceChildren();load().forEach(item=>{const row=node('div',null,'hz-studio-list');row.append(node('strong',item.name+' · '+item.tracks.length+' tracks'),button('Load',()=>{listName.value=item.name;tracks.value=item.tracks.map(t=>t.source==='local'?'local:'+t.id:t.query).join('\n');setStatus('Loaded '+item.name+'. Use a new name to save a different selection.');}),button('Play',async()=>setStatus((await play(item.name)).text)),button('Export track list',async()=>setStatus('Saved: '+await exportList(item.name))));saved.append(row);});};
    d.append(button('Stop playlist preparation',()=>{stopPlaylist();setStatus('Playlist preparation will stop after the current lookup. Already-started audio keeps playing.');}));
    d.append(button('Save playlist',()=>{create({name:listName.value,tracks:tracks.value.split('\n').map(s=>s.trim()).filter(Boolean).map(s=>s.startsWith('local:')?{source:'local',id:s.slice(6).trim()}:s)});paintLists();setStatus('Playlist saved on this device. Tracks are resolved when you play, not downloaded.');}),saved);paintLists();
    d.append(node('h3','Create an instrumental'));
    const title=field('Track title','text',mode==='music'&&payload?payload.title:'Horizon Session');title.maxLength=100;
    const label=node('label','Style'), style=node('select');['ambient','lofi','electronic'].forEach(s=>{const o=node('option',s);o.value=s;style.append(o);});label.append(style);d.append(label);
    if(mode==='music'&&payload&&['ambient','lofi','electronic'].includes(payload.style))style.value=payload.style;
    const seconds=field('Duration · 5–120 seconds','number',String(mode==='music'&&payload?payload.seconds||30:30));seconds.min=5;seconds.max=120;
    const bpm=field('Tempo · 50–180 BPM','number',String(mode==='music'&&payload?payload.bpm||90:90));bpm.min=50;bpm.max=180;
    const player=node('audio');player.controls=true;player.preload='metadata';d.append(player);audio=player;
    let currentBlob=null;
    const download=button('Save WAV',async()=>{if(!currentBlob)throw new Error('Compose a track first.');setStatus('Saved: '+await save(currentBlob,title.value+'.wav'));});download.disabled=true;
    d.append(button('Compose locally',async()=>{
      const duration=Number(seconds.value), tempo=Number(bpm.value);
      if(!Number.isFinite(duration)||duration<5||duration>120||!Number.isFinite(tempo)||tempo<50||tempo>180)throw new Error('Use 5–120 seconds and 50–180 BPM.');
      setStatus('Composing on a background worker…');download.disabled=true;
      const blob=await renderMusic({title:title.value,style:style.value,seconds:duration,bpm:tempo});
      if(!d.isConnected)return;player.pause();if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(blob);player.src=audioUrl;currentBlob=blob;download.disabled=false;
      setStatus('Instrumental ready. Tap Play to listen or Save WAV to export. No vocals or remote AI model used.');
    }),button('Cancel composition',()=>{if(cancelRender)cancelRender();}),download);
    d.append(node('h3','Podcast script & playback'));
    const script=field('Podcast script · edit before playback','textarea',mode==='podcast'&&payload?payload.script||'':'');script.maxLength=18000;
    d.append(button('Read podcast',async()=>{player.pause();if(W.HorizonMusic)W.HorizonMusic.pauseNow();if(W.HorizonRadio&&W.HorizonRadio.run)await W.HorizonRadio.run('radio.stop','');await speak(script.value,setStatus);}),button('Stop reading',async()=>{await stopSpeech();setStatus('Stopped.');}),button('Export script',async()=>{if(!script.value.trim())throw new Error('Add a script first.');setStatus('Saved: '+await save(new Blob([script.value],{type:'text/plain'}),'Horizon-podcast.txt'));}));
    d.addEventListener('close',()=>{if(dialog===d)dispose();d.remove();},{once:true});D.body.append(d);d.showModal();return d;
  }
  function parse(text) {const out=[],re=new RegExp(SRC,'gi');let m;const plain=String(text||'').replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g,'');while((m=re.exec(plain))&&out.length<3)out.push({br:true,kind:m[1].toLowerCase(),arg:m[2].trim()});return out;}
  let downloading = false;
  // V1.99.130: really save a playlist's songs through the app's own verified saver (yt.get), one at a time, then rescan Music.
  async function download(name, active) {
    if (downloading) throw new Error('A playlist download is already running. Wait for its result.');
    const item = get(name); if (!host.get) throw new Error('The song saver is not ready. Reopen Horizon.');
    // V1.99.133: every playlist saves into its own folder, Download/Horizon/<playlist name>/, files numbered in playlist order.
    const folder = 'Horizon/' + safeName(item.name);
    downloading = true; const lines = []; let saved = 0;
    try {
      for (let i = 0; i < item.tracks.length; i++) {
        if (active) active();
        const t = item.tracks[i], label = t.source === 'local' ? (t.title || t.id) : t.query;
        if (t.source === 'local') { lines.push((i + 1) + '. ' + label + ' - already on the phone (local library)'); saved++; continue; }
        const r = await host.get(t.id ? 'https://www.youtube.com/watch?v=' + t.id + ' | ' + t.title.replace(/\|/g,' ') : t.query, {folder, prefix: String(i + 1).padStart(2, '0') + ' - '}), txt = (r && r.text) || '';
        const ok = /^SAVED/i.test(txt); if (ok) saved++;
        lines.push((i + 1) + '. ' + label + ' - ' + (ok ? 'SAVED' : /^STILL DOWNLOADING/i.test(txt) ? 'STILL DOWNLOADING (finishes in the Downloads box)' : /^NEEDS CHOICE/i.test(txt) ? 'NOT SAVED: no confident match, ask which version' : 'FAILED: ' + txt.slice(0, 120)));
      }
    } finally { downloading = false; }
    try { if (host.rescan) await host.rescan(); } catch (_) { /* Music rescan is best effort */ }
    return {text: 'Playlist "' + item.name + '": ' + saved + '/' + item.tracks.length + ' tracks on the phone, in the folder Download/' + folder + '. Send the user this tracklist and the folder name as they are:\n' + lines.join('\n')};
  }
  async function makePodcast(data) {
    const E = W.HorizonEdgeTTS; if (!E || !E.renderMp3) throw new Error('Edge voice support is not in this build.');
    const script = clean(data.script, 30000); if (!script) throw new Error('The podcast needs a script.');
    const title = clean(data.title, 80) || 'Horizon podcast';
    // V1.99.131: a real progress card (the same one downloads use, above the message bar and in Downloads) so you can SEE it is being made.
    const D = W.HorizonDownloads, h = D && D.begin ? D.begin({type: 'audio', src: 'studio', title: 'Podcast: ' + title, sub: 'Starting'}) : null;
    try {
      const blob = await E.renderMp3(script, {voice: data.voice, onProgress: (done, total) => {
        if (h && h.live) { h.live.pct = Math.min(95, Math.round(done / Math.max(1, total) * 95)); h.live.sub = 'Rendering part ' + Math.min(total, done + 1) + ' of ' + total; if (done >= total) h.live.sub = 'Saving MP3'; }
      }});
      if (h && h.live) { h.live.pct = 97; h.live.sub = 'Saving MP3'; }
      const where = await save(blob, title + '.mp3');
      if (h) h.finish(where);
      return where;
    } catch (e) { if (h) h.fail(e); throw e; }
  }
  async function makeMusic(data) {
    const style = ['ambient', 'lofi', 'electronic'].includes(data.style) ? data.style : 'ambient', seconds = Number(data.seconds || 30), bpm = Number(data.bpm || 90);
    if (!Number.isFinite(seconds) || seconds < 5 || seconds > 120 || !Number.isFinite(bpm) || bpm < 50 || bpm > 180) throw new Error('Use 5-120 seconds and 50-180 BPM.');
    const blob = await renderMusic({title: data.title, style, seconds, bpm});
    return await save(blob, (clean(data.title, 80) || 'Horizon track') + '.wav');
  }
  async function run(kind,arg,options = {}) {
    try {
      if(kind==='playlist.create' || kind==='playlist.add'){
        const def = lenient(arg);
        if (!def || typeof def !== 'object') throw new Error('A playlist name and a tracks array are required.');
        const checked = await resolveTracks(def.tracks, options.active);
        const adding = kind === 'playlist.add';
        const result = adding ? addTracks(def.name, checked.tracks) : {item:create({name:def.name, tracks:checked.tracks},true),added:checked.tracks.length};
        const item = result.item;
        let text = (adding ? 'Added ' : 'Saved ') + result.added + ' matched track(s) ' + (adding ? 'to' : 'in') + ' “' + item.name + '”.' + omissions(checked.misses);
        if (!adding && def.play === true && options.play) {
          try { text += '\n' + (await play(item.name, options.active)).text; } catch(e) { if(e.stopped) throw e; text += '\nPlayback: ' + e.message; }
        }
        if(def.download===true && options.download){try{text += '\n'+(await download(item.name, options.active)).text;}catch(e){if(e.stopped) throw e; text+='\nDownload failed: '+e.message;}}
        return {text, item};
      }
      if(kind==='playlist.delete'){const g=removeList(arg);return{text:'Deleted playlist "'+g.name+'" from Horizon. Songs already saved to the phone were NOT deleted.'};}
      if(kind==='playlist.download')return await download(arg,options.active);
      if(kind==='playlist.list')return{text:load().map(x=>x.name+' ('+x.tracks.length+' tracks)').join('\n')||'No saved playlists.'};
      if(kind==='playlist.show'){ const item=get(arg); return {text:'Saved playlist: '+item.name, item}; }
      if(kind==='playlist.play')return {item:get(arg), ...(await play(arg, options.active))};
      if(kind==='playlist.export'){open();return{text:'Opened Keyless Studio. The user must tap Export track list beside the saved playlist; no download has started.'};}
      if(kind==='studio.music'||kind==='studio.podcast'){const data=lenient(arg);if(!data||Array.isArray(data)||typeof data!=='object')throw new Error('Use a JSON object.');
        if(data.save===true){if(kind==='studio.music'){return{text:'SAVED instrumental: '+await makeMusic(data)+'. Procedural synthesis, no vocals.'};}return{text:'SAVED podcast audio (MP3): '+await makePodcast(data)};}
        open(kind.slice(7),data);return{text:'Opened '+kind.slice(7)+' draft for review. Nothing is saved yet. Add "save":true to make and save the audio file at once.'};}
      if(kind==='studio.open'){open();return{text:'Opened Keyless Studio. No audio created or played.'};}
      return{text:'ERROR: Unknown studio tool.'};
    } catch(e) {if(e && e.stopped) throw e; return{text:'ERROR: '+(e.message||e)};}
  }
  // V1.99.134: SMALL-MODEL SCAFFOLD. The app reads the request, asks the model ONLY for song names, builds the playlist call itself and runs it.
  // So a model that cannot follow tool tags still makes, plays and saves a playlist correctly.
  function playlistIntent(text) {
    const t = String(text || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length > 400 || !/\bplay-?lists?\b/i.test(t)) return null;
    if (/\b(?:delete|remove|rename|show|list|export)\b.*\bplay-?lists?\b/i.test(t) && !/\b(?:make|create|build|put together)\b/i.test(t)) return null;
    if (!/\b(?:make|create|build|put together|queue up|give me|generate|compile|start|set up|need|want|play|download|save)\b/i.test(t)) return null;
    const download = /\b(?:download|offline|save (?:the )?(?:songs|tracks|files)|into (?:a |the )?folder)\b/i.test(t) && !/\b(?:no|do not|don.t|without)\s+(?:any\s+)?(?:(?:play|save)(?:ing)?(?:\s+it)?\s+(?:or|and)\s+)?download/i.test(t);
    const play = /\b(?:play|listen|queue|put on|stream)\b/i.test(t) && !/\b(?:no|do not|don.t|without)\s+play/i.test(t);
    const n = (/\b(\d{1,2})\s*(?:songs?|tracks?|tunes?)\b/i.exec(t) || [])[1];
    return {play, download, count: Math.max(1, Math.min(20, Number(n) || 10)), text: t};
  }
  function savedPlaylistIntent(raw) {
    const m = /^(?:(?:please|can you|could you)\s+)*(play|show|open)\s+(?:(?:my|the|saved)\s+)*play-?list\s+(.{1,92})$/i.exec(String(raw || '').trim());
    if (!m) return null;
    const name = m[2].replace(/^[“"']|[”"'](?=[.!?]*$)|[.!?]+$/g,'').trim();
    if (!name) return null;
    return {kind:m[1].toLowerCase() === 'play' ? 'playlist.play' : 'playlist.show', name};
  }
  function libraryIntent(raw) {
    const text = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!/^(?:(?:horizon|please|can you|could you|i want you to|i want to)[:,]?\s+)*(?:make|create|build|put together|generate|compile|give me)\b/i.test(text) || !/\bplay-?list\b/i.test(text)) return null;
    const source = /\b(?:from|using|with|of)\s+(?:only\s+)?(?:songs?\s+(?:from|in)\s+)?(?:my |the )?(?:local (?:music )?library|music library|library|local (?:music|tracks|songs)|(?:music|songs) (?:on my phone|on this device)|(?:liked|recent|favorite|favourite) (?:songs|tracks))\b/i.exec(text);
    if (!source) return null;
    const tail = text.slice(source.index + source[0].length);
    const named = /\b(?:called|named)\s+["“]([^"”]+)["”]/i.exec(text) || /\b(?:called|named)\s+(.+?)(?=\s+(?:from|using|with|of|and play|matching)\b|$)/i.exec(text);
    const n = /\b(\d{1,2})\s*(?:songs?|tracks?)\b/i.exec(text);
    const filters = /\b(?:matching|filtered by|by)\s+(.+?)(?=\s+(?:called|named|and play)\b|[.!?]?$)/i.exec(tail);
    const term = filters ? clean(filters[1], 100).replace(/^["“']|["”']$/g, '') : /\b(?:liked|favorite|favourite)\b/i.test(source[0]) ? 'liked' : /\brecent\b/i.test(source[0]) ? 'recent' : '';
    return { name: named ? clean(named[1],80).replace(/[.!?]+$/, '') || 'Library mix' : term ? 'Library · ' + term.slice(0, 40) : 'Library mix', count: Math.max(1, Math.min(30, n ? Number(n[1]) : 12)), term, play: /\b(?:and (?:then )?play|start playing)\b/i.test(text) && !/\b(?:do not|don.t|without)\s+play/i.test(text) };
  }
  async function libraryPlaylist(intent) {
    if (!W.HorizonMusic || !W.HorizonMusic.playlistLibrary) throw new Error('Music is not ready. Reopen Horizon.');
    const rows = await W.HorizonMusic.playlistLibrary(intent.term);
    const seen = new Set();
    const tracks = rows.filter(t => {
      const key = JSON.stringify([t.title,t.artist,t.album]).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0,intent.count).map(t => ({source:'local',id:t.id,title:((t.artist && t.artist !== 'Unknown artist') ? t.artist+' — ' : '') + t.title}));
    if (!tracks.length) throw new Error(intent.term ? 'No local songs match “' + intent.term + '”. No playlist was created. Try a matching artist, song or album.' : 'No songs were found in Music. Allow Android Music and audio access, then tap Scan storage in Music.');
    const item = create({name:intent.name,tracks}, true);
    let text = 'Created a local library playlist with ' + item.tracks.length + (item.tracks.length === 1 ? ' track.' : ' tracks.');
    if (intent.play) { try { text += '\n' + (await play(item.name)).text; } catch(e) { text += '\nPlayback: ' + e.message; } }
    return { item, text };
  }
  function playlistCard(item) {
    const card = node('section', null, 'provider-card');
    card.setAttribute('aria-label', 'Playlist');
    const local = item.tracks.filter(t => t.source === 'local').length;
    const parts = [local && local + ' library', item.tracks.length - local && (item.tracks.length - local) + ' YouTube'].filter(Boolean);
    card.classList.add('hz-playlist-card');
    card.append(node('h3', item.name), node('p', parts.join(' · '), 'hint'));
    const tracks = node('ol'); item.tracks.forEach(t => tracks.appendChild(node('li', t.artist ? t.title + ' — ' + t.artist : t.title || t.query || t.id))); card.append(tracks);
    const status = node('p', '', 'hint'); status.setAttribute('role','status');
    const playButton = node('button', 'Play playlist', 'use-btn'); playButton.type = 'button';
    playButton.addEventListener('click', async () => {
      playButton.disabled = true; status.textContent = 'Preparing playlist…';
      try { status.textContent = (await play(item.name)).text; } catch(e) { status.textContent = e.message; }
      finally { playButton.disabled = false; }
    });
    card.append(playButton,status); return card;
  }
  function parseSongs(reply, max) {
    const seen = new Set(), out = [];
    String(reply || '').replace(/```[a-z]*|```/gi, '').split(/\r?\n/).forEach(line => {
      let l = line.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s*/, '').replace(/\*\*|__/g, '').replace(/^["'“‘]+|["'”’]+$/g, '').trim();
      if (!/^.{2,70}\s[-–—]\s.{2,90}$/.test(l) || /^(?:here|sure|note|these|this)\b/i.test(l)) return;
      l = l.replace(/\s[–—]\s/, ' - ').replace(/\s*\(.*?\)\s*$/, '').trim();
      const k = l.toLowerCase(); if (seen.has(k) || out.length >= (max || 20)) return;
      seen.add(k); out.push(l);
    });
    return out;
  }
  function nameFor(text) {
    let n = String(text).replace(/\b(?:please|pls|can you|could you|hey|yo|bro|make|create|build|put together|give|generate|compile|me|my|a|an|the|playlist|of|for|with|and|then|play|download|save|keep|it|them|to|on|phone|songs?|tracks?|\d+)\b/gi, ' ').replace(/[^\p{L}\p{N} '&-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
    if (n.length < 3) n = 'Horizon mix';
    n = n.replace(/\b\w/g, c => c.toUpperCase());
    const have = new Set(load().map(x => x.name.toLowerCase())); let name = n, i = 2;
    while (have.has(name.toLowerCase())) name = n + ' ' + i++;
    return name;
  }
  // ask(msgs) -> {text, via}. Returns null when the scaffold cannot help (the normal chat flow then runs).
  async function scaffold(text, ask, active) {
    const it = playlistIntent(text); if (!it) return null;
    const prompts = [
      'Reply with ONLY a list of ' + it.count + ' real, well-known songs for this request, one per line, exactly in the form: Artist - Song Title. No numbering, no commentary, no invented songs.\nRequest: ' + it.text,
      'Give exactly ' + it.count + ' lines. Every line is: Artist - Song Title. Real songs only. Nothing else.\nTopic: ' + it.text
    ];
    let songs = [], via = '';
    for (let i = 0; i < prompts.length && songs.length < Math.min(4, it.count); i++) {
      const r = await ask([{role: 'user', text: prompts[i]}], songs); via = (r && r.via) || via;
      songs = parseSongs(r && r.text, it.count);
    }
    if (active) active();
    if (!songs.length) return {kind:'playlist.create',text:'No usable song suggestions were returned. No playlist was created.'};
    const name = nameFor(it.text);
    const res = await run('playlist.create', JSON.stringify({name, play: it.play, download: it.download, tracks: songs}), {active, play:it.play, download:it.download});
    return {kind: 'playlist.create', arg: name, text: res.text, item:res.item, via};
  }
  const PROMPT='KEYLESS STUDIO (playlists, instrumentals, podcasts). The users request IS the permission: act at once, never ask which songs, never ask them to confirm, never explain steps instead of doing them. PLAYLISTS: when he asks for a playlist (any artist, mood, era, activity, make me, put together, queue up) YOU choose 8-15 real, well-known tracks that fit (strict "Artist - Song" form, real songs only, no invented titles, a mix of hits and deep cuts, no duplicates), pick a short distinct name, and make ONE call: [[playlist.create: {"name":"Night drive","play":true,"tracks":["Artist - Song",{"source":"local","id":"REAL_ID","title":"Title"}]}]]. "play":true only if he asked to listen: track 1 starts at once and the rest queue in order (streaming, no download). "download":true = he wants the songs kept on the phone: every song is saved one by one and verified into its OWN folder, Download/Horizon/<playlist name>/, files numbered 01 - , 02 - in order. Use BOTH when he says play and download/save/keep/have them; when he only says make a playlist do not start playback. The words save, keep, download, offline, on my phone, in Music or folder mean download:true. The result is a tracklist with SAVED / FAILED per song and the folder: pass it on as it is and say saved ONLY for lines marked SAVED. For his own phone music use music.search first and "source":"local" with the real ids. After a playlist exists: [[playlist.play: name]] listens again; [[playlist.download: name]] saves its songs to the folder; [[playlist.add: {"name":"Night drive","tracks":["Artist - Song"],"download":false}]] adds songs (only when the user explicitly asks to add songs); [[playlist.delete: name]] removes the list only, never his saved files; [[playlist.list]]; [[playlist.show: name]]; [[playlist.export: name]]. Never rebuild a playlist with repeated yt.play/yt.queue calls. If the name exists, add a number to it. MUSIC: [[studio.music: {"title":"Name","style":"ambient","bpm":90,"seconds":30,"save":true}]] makes and saves a WAV instrumental (ambient/lofi/electronic, 5-120s, procedural, no vocals). PODCAST: write the FULL original script yourself, then [[studio.podcast: {"title":"Episode 1","script":"full script","voice":"optional Edge voice id","save":true}]] records it with the Microsoft Edge voice and saves an MP3 (needs internet; up to 30000 characters). If the result says the APK lacks render support, say so plainly. Without "save":true the tool only opens an editable draft. [[studio.open]] opens the UI. Say saved ONLY when the result says SAVED. No automatic Termux.';
  function installBridge() {
    const b=W.HorizonBridges;if(!b||b.__studio)return;
    const parseOld=b.parse,runOld=b.run,blockOld=b.block;b.__studio=true;b.SRC='(?:'+b.SRC+')|(?:'+SRC+')';
    b.parse=function(text){return parseOld(text).concat(parse(text)).slice(0,3);};
    b.run=function(kind,arg){return /^(playlist|studio)\./.test(kind)?run(kind,arg):runOld.apply(this,arguments);};
    b.block=function(){return blockOld.apply(this,arguments)+'\n\n'+PROMPT;};
  }
  W.HorizonStudio={savedPlaylistIntent,libraryIntent,libraryPlaylist,playlistCard,playlistIntent,parseSongs,scaffold,addTracks,removeList,download,makePodcast,makeMusic,init:h=>{host=h||{};installBridge();},open,create,list:load,get,play,stopPlaylist,exportList,parse,run,renderMusic,speak,stopSpeech,prompt:()=>PROMPT,SRC,installBridge};
  installBridge();
})();
