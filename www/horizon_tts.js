/* Android-only speech controller. No cloud synthesis, browser fallback, model downloads or WebAudio. */
(function(root) {
    'use strict';
    const controls = [
        {key:'rate',label:'Speed',min:.5,max:2,step:.05,default:1,unit:'×'},
        {key:'pitch',label:'Pitch',min:.5,max:2,step:.05,default:1,unit:'×'},
        {key:'bass',label:'Bass · 180 Hz',min:-12,max:12,step:1,default:0,unit:' dB'},
        {key:'presence',label:'Presence · 1.5 kHz',min:-12,max:12,step:1,default:0,unit:' dB'},
        {key:'treble',label:'Treble · 5 kHz',min:-12,max:12,step:1,default:0,unit:' dB'},
        {key:'compression',label:'Compression',min:0,max:100,step:1,default:0,unit:'%'},
        {key:'reverb',label:'Room reverb',min:0,max:100,step:1,default:0,unit:'%'},
        {key:'echo',label:'Echo',min:0,max:100,step:1,default:0,unit:'%'},
        {key:'robot',label:'Robot · ring modulation',min:0,max:100,step:1,default:0,unit:'%'},
        {key:'tune',label:'Pitch-snap · experimental',min:0,max:100,step:1,default:0,unit:'%'}
    ];
    const presets = [
        {id:'neutral',name:'Natural narrator',values:{}},
        {id:'hero',name:'Heroic captain',values:{rate:.95,pitch:.85,bass:4,presence:3,compression:35,reverb:8}},
        {id:'villain',name:'Shadow villain',values:{rate:.85,pitch:.65,bass:6,treble:-3,compression:40,reverb:23}},
        {id:'robot',name:'Space robot',values:{rate:1.05,pitch:.95,presence:5,robot:80,compression:40,tune:80}},
        {id:'sprite',name:'Tiny sprite',values:{rate:1.2,pitch:1.65,bass:-5,treble:4,reverb:12}},
        {id:'giant',name:'Stone giant',values:{rate:.75,pitch:.55,bass:8,treble:-5,compression:40,reverb:18}},
        {id:'wizard',name:'Ancient wizard',values:{rate:.85,pitch:.85,presence:2,reverb:35,echo:15}},
        {id:'android',name:'Neon android',values:{rate:1.1,pitch:1.15,treble:3,robot:35,tune:100,echo:12}},
        {id:'announcer',name:'Radio announcer',values:{rate:1.05,pitch:.9,bass:4,presence:4,compression:70}},
        {id:'ghost',name:'Echo phantom',values:{rate:.8,pitch:1.25,bass:-3,reverb:55,echo:45,robot:12}}
    ];
    controls.forEach(Object.freeze); presets.forEach(p => {Object.freeze(p.values);Object.freeze(p);});
    Object.freeze(controls); Object.freeze(presets);
    const ls={get:k=>{try{return root.localStorage.getItem(k);}catch(_){return null;}},set:(k,v)=>{try{root.localStorage.setItem(k,String(v));}catch(_){}},remove:k=>{try{root.localStorage.removeItem(k);}catch(_){}}};
    const clamp=(n,lo,hi,d)=>{n=Number.parseFloat(n);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):d;};
    const key=k=>'horizon_tts_'+k;
    const msg=e=>String(e && e.message || e || 'Android speech failed').slice(0,220);
    let plugFn=null, native=false, initialized=false, cache=null, cacheAt=0, flight=null;
    let current=null, seq=0, paused=false, waiters=[], status={state:'idle',id:null,engine:'',paused:false};
    let nativeStop=Promise.resolve(), held=false, releaseTimer=0, queuedN=0;
    const listeners=new Set();
    function plugin(){try{return native && plugFn ? plugFn('HorizonSpeech') : null;}catch(_){return null;}}
    function settings(){
        const s={engine:'standard',nengine:'',voice:ls.get(key('voice'))||'',lang:ls.get(key('lang'))||'',preset:ls.get(key('preset'))||'neutral'};
        controls.forEach(c=>s[c.key]=clamp(ls.get(key(c.key)),c.min,c.max,c.default));
        if(s.preset!=='custom' && !presets.some(p=>p.id===s.preset))s.preset='custom';
        return s;
    }
    function set(k,v){
        if(k==='engine'){ls.set(key(k),'standard');return true;}
        // Only Android's default service is used; old custom engine preferences are ignored.
        if(k==='nengine'){ls.remove(key(k));cache=null;return true;}
        if(k==='voice'||k==='lang'){ls.set(key(k),String(v||'').slice(0,256));return true;}
        const c=controls.find(c=>c.key===k);if(!c)return false;
        ls.set(key(k),clamp(v,c.min,c.max,c.default));ls.set(key('preset'),'custom');return true;
    }
    function applyPreset(id){const p=presets.find(p=>p.id===id);if(!p)return false;controls.forEach(c=>ls.set(key(c.key),p.values[c.key]===undefined?c.default:p.values[c.key]));ls.set(key('preset'),id);return true;}
    function hasEffects(s){s=s||settings();return controls.some(c=>c.key!=='rate' && c.key!=='pitch' && Math.abs(s[c.key]||0)>.001);}
    function timeout(p,ms,label){let t;return Promise.race([Promise.resolve(p),new Promise((_,no)=>t=setTimeout(()=>no(Error(label)),ms))]).finally(()=>clearTimeout(t));}
    function holdPaint(){if(!held||!plugFn)return;try{const p=plugFn('HorizonAI');if(p&&p.speechHold)Promise.resolve(p.speechHold({paused,queued:queuedN})).catch(()=>{});}catch(_){}}
    function hold(on){
        clearTimeout(releaseTimer);releaseTimer=0;
        if(on){if(!held){held=true;try{const p=plugFn&&plugFn('HorizonAI');if(p&&p.speechHold)Promise.resolve(p.speechHold({paused,queued:queuedN})).catch(()=>{held=false;});}catch(_){held=false;}}}
        else if(held)releaseTimer=setTimeout(()=>{held=false;try{const p=plugFn&&plugFn('HorizonAI');if(p&&p.speechRelease)Promise.resolve(p.speechRelease()).catch(()=>{});}catch(_){}},1200);
    }
    function emit(patch){status=Object.assign({},status,{error:'',note:''},patch);listeners.forEach(fn=>{try{fn(status);}catch(_){}});hold(status.state==='loading'||status.state==='playing');}
    function flush(){const list=waiters;waiters=[];list.forEach(fn=>fn());}
    function waitResume(){return paused?new Promise(ok=>waiters.push(ok)):Promise.resolve();}
    function stop(silent){
        const p=plugin();if(current)current.cancelled=true;current=null;paused=false;flush();
        if(p)nativeStop=nativeStop.then(()=>p.stop()).catch(()=>{});
        if(!silent)emit({state:'idle',id:null,engine:'',paused:false});else hold(false);
    }
    function setPaused(on){
        on=!!on;if(!current || on===paused)return paused;paused=on;
        const p=plugin();
        // File-rendered speech can pause in place. Direct Android speech resumes the current chunk.
        if(hasEffects(current.settings)){
            if(p)Promise.resolve(on?p.pauseAudio():p.resumeAudio()).catch(e=>{if(current)emit({note:msg(e)});});
        }else if(on){current.pauseSeq=(current.pauseSeq||0)+1;if(p)nativeStop=Promise.resolve(p.stop()).catch(()=>{});}
        if(!on)flush();emit({paused});holdPaint();return paused;
    }
    async function listEngines(){const p=plugin();if(!p)return{engines:[],def:'',selected:''};try{const r=await timeout(p.getEngines(),12000,'Android engine initialization timed out');return{engines:[],def:r.default||'',selected:'',defaultLabel:r.label||'Phone default'};}catch(_){return{engines:[],def:'',selected:''};}}
    async function listVoices(force){
        if(!force&&cache&&Date.now()-cacheAt<30000)return cache;
        if(flight)return flight;
        flight=(async()=>{
            const p=plugin();let a=[];
            if(p){const r=await timeout(p.getSupportedVoices(),12000,'Android voice list timed out');a=r.voices||[];}
            const voices=a.map((v,i)=>{const lang=String(v.lang||'en-US').replace(/_/g,'-');return{index:i,id:v.voiceURI||v.name||String(i),name:v.name||v.voiceURI||'Android voice',lang,langKey:lang,langName:lang,label:(v.name||'Android voice')+(v.network?' · online':' · offline')};});
            const groups=new Map();voices.forEach(v=>{if(!groups.has(v.langKey))groups.set(v.langKey,{key:v.langKey,name:v.langName,count:0});groups.get(v.langKey).count++;});
            cache={source:p?'native':'none',voices,langs:[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key))};cacheAt=Date.now();return cache;
        })();try{return await flight;}finally{flight=null;}
    }
    function speakable(src) {
        let t = String(src == null ? '' : src).replace(/\r\n?/g, '\n');
        t = t.replace(/```[\s\S]*?(?:```|$)/g, '\nCode block skipped.\n');
        t = t.replace(/~~~[\s\S]*?(?:~~~|$)/g, '\nCode block skipped.\n');
        t = t.replace(/<[^>\n]+>/g, ' ');
        t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
        t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
        t = t.replace(/\bhttps?:\/\/\S+/gi, 'link');
        t = t.replace(/`([^`\n]+)`/g, '$1');
        t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');
        t = t.replace(/^[ \t]*>+[ \t]?/gm, '');
        t = t.replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, '');
        t = t.replace(/^[ \t]*\|?[ \t:|-]{3,}\|?[ \t]*$/gm, '');
        t = t.replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (m, row) => row.split('|').map(c => c.trim()).filter(Boolean).join(', '));
        t = t.replace(/\|/g, ', ');
        t = t.replace(/(\*\*|__|~~)/g, '');
        t = t.replace(/(^|[\s(])\*+([^*\n]+?)\*+(?=[\s).,!?;:]|$)/g, '$1$2');
        t = t.replace(/(^|[\s(])_+([^_\n]+?)_+(?=[\s).,!?;:]|$)/g, '$1$2');
        try { t = t.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ''); } catch (e) { /* old engine without \p */ }
        t = t.split('\n').map(l => {
            l = l.replace(/[ \t]+/g, ' ').trim();
            return (l && !/[.!?…:;,]["')\]”’]*$/.test(l)) ? l + '.' : l;
        }).filter(Boolean).join('\n');
        return t.trim();
    }

    function hardSplit(s, max) {
        const out = [];
        while (s.length > max) {
            let cut = s.lastIndexOf(', ', max);
            if (cut < max * 0.4) cut = s.lastIndexOf(' ', max);
            if (cut <= 0) cut = max;
            else cut += 1;
            out.push(s.slice(0, cut).trim());
            s = s.slice(cut).trim();
        }
        if (s) out.push(s);
        return out;
    }
    // Packs whole sentences into chunks no longer than max, so engines get small, natural pieces.
    function chunkText(text, max) {
        const out = [];
        let cur = '';
        const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
        String(text || '').split('\n').forEach(line => {
            line = line.trim();
            if (!line) return;
            let sents;
            try { sents = line.split(/(?<=[.!?…]["')\]”’]*)\s+/); } catch (e) { sents = [line]; }
            sents.forEach(s => {
                s = s.trim();
                if (!s) return;
                if (s.length > max) { flush(); hardSplit(s, max).forEach(p => out.push(p)); return; }
                if (cur && (cur.length + 1 + s.length) > max) flush();
                cur = cur ? cur + ' ' + s : s;
            });
        });
        flush();
        return out;
    }


    async function speak(id,src,opts){
        stop(true);const tok={id,cancelled:false,settings:settings()};current=tok;const s=tok.settings;
        emit({state:'loading',id,engine:'native',paused:false});
        const p=plugin();let listener=null;
        try{
            if(!p)throw Error('Android TTS is available inside the Android app only. Enable your phone’s text-to-speech service and download voice data.');
            const clean=speakable(src);if(!clean)throw Error('Nothing to speak');
            const chunks=chunkText(clean,hasEffects(s)?240:900);
            await nativeStop;if(tok.cancelled)return false;
            const list=await listVoices();if(tok.cancelled)return false;
            let v=list.voices.find(v=>v.id===s.voice);
            const slot=Math.max(0,(opts&&opts.slot)||0);
            if(slot){const lang=String(v&&v.lang||s.lang||root.navigator&&root.navigator.language||'en-US').split('-')[0];const pool=list.voices.filter(v=>v.lang.split('-')[0]===lang);if(pool.length)v=pool[(Math.max(0,pool.findIndex(x=>v&&x.id===v.id))+slot)%pool.length];}
            let utterance='';
            listener=await p.addListener('speechStart',ev=>{if(!tok.cancelled&&ev.id===utterance)emit({state:'playing',id,engine:'native',paused});});
            for(const text of chunks){
                let done=false;
                while(!done){
                    await waitResume();if(tok.cancelled)return false;await nativeStop;if(tok.cancelled)return false;
                    await waitResume();if(tok.cancelled)return false;
                    const pauseSeq=tok.pauseSeq||0;
                    utterance='hz-'+(++seq);
                    const args={text,utteranceId:utterance,lang:v&&v.lang||s.lang||root.navigator&&root.navigator.language||'en-US',voiceName:v&&v.id||'',rate:s.rate,pitch:s.pitch,effects:{}};
                    controls.filter(c=>c.key!=='rate'&&c.key!=='pitch').forEach(c=>args.effects[c.key]=s[c.key]);
                    try{await p.speak(args);done=true;}
                    catch(e){if(tok.cancelled)return false;if(!hasEffects(s)&&(paused||(tok.pauseSeq||0)!==pauseSeq)){await waitResume();continue;}throw e;}
                }
                if(tok.cancelled)return false;
            }
            if(current===tok){current=null;paused=false;emit({state:'idle',id:null,engine:'',paused:false});}return true;
        }catch(e){
            if(tok.cancelled)return false;
            if(current===tok){current=null;paused=false;flush();emit({state:'error',id,engine:'native',error:msg(e),paused:false});emit({state:'idle',id:null,engine:'',paused:false});}
            return false;
        }finally{if(listener)try{await listener.remove();}catch(_){}}
    }
    function toggle(id,text,opts){if(current&&current.id===id){stop();return Promise.resolve(false);}return speak(id,text,opts);}
    function describe(){const s=settings(),p=presets.find(p=>p.id===s.preset);return 'Android TTS · '+(p?p.name:'Custom voice')+(hasEffects(s)?' · local effects':' · direct / low latency');}
    function init(opts){
        opts=opts||{};native=!!opts.native;plugFn=typeof opts.plug==='function'?opts.plug:null;
        ls.set(key('engine'),'standard');ls.remove(key('nengine'));
        ['gemini_voice','kokoro_voice','packs','gmodel','gcloud_key','gcloud_usage'].forEach(k=>ls.remove(key(k)));
        if(initialized)return;initialized=true;
        root.addEventListener('horizon-tts-pause',()=>setPaused(!paused));
        root.addEventListener('horizon-tts-set',ev=>setPaused(!!(ev&&ev.detail&&ev.detail.paused)));
        root.addEventListener('pagehide',()=>stop());
    }
    root.HorizonTTS={init,settings,set,controls,presets,applyPreset,hasEffects,speak,toggle,stop,
        test:()=>toggle('test','This is how Horizon sounds. Strategy over impulse.'),
        onState:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},status:()=>Object.assign({},status),
        pause:()=>setPaused(true),resume:()=>setPaused(false),togglePause:()=>setPaused(!paused),isPaused:()=>paused,
        setQueued:n=>{queuedN=Math.max(0,Math.min(99,n|0));holdPaint();},
        voiceFor:slot=>({engine:'standard',voice:settings().voice,preset:settings().preset,slot:Math.max(0,slot|0)}),
        listVoices,listEngines,describe,diagnose:async()=>{const l=await listVoices();return{native,nativePlugin:!!plugin(),source:l.source,count:l.voices.length,langCount:l.langs.length,audio:hasEffects()?'local Android synthesis + DSP':'direct Android speech'};},
        speakable,chunkText
    };
})(window);
