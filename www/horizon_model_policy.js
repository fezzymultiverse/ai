/* Free-only, explicit-model policy. Discovery is only user-initiated, never a chat fallback. */
(function(root){
'use strict';
const inventory=root.HorizonModelInventory;
const nonchat=/embed|moderation|whisper|tts|stt|asr|rerank|guard|safety|image|audio|speech|flux|stable-diffusion|ocr|transcri|voxtral|realtime|live|lora|lyria|music|video/i;
const chatAllowed=new Set((inventory.documentedMistral||[]).concat(['@cf/google/gemma-2b-it-lora','@cf/google/gemma-7b-it-lora'])); // V1.99.89: Cloudflare LoRA chat models the user verified
const routers=/^(?:openrouter\/(?:free|auto)|kilo-auto\/|.*(?:auto-router|fallback-policy))/i;
const paidCF=new Set(["@cf/thinkingmachines/inkling-2-small", "@cf/zai-org/glm-5.3", "@cf/zai-org/glm-5.3-flash", "@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/deepseek-ai/deepseek-v4-pro-0813", "@cf/deepseek-ai/deepseek-v4.1-flash-1017",'@cf/moonshotai/kimi-k2.6','@cf/moonshotai/kimi-k2.7-code','@cf/zai-org/glm-5.2']);
const disabled=new Set([]); // V1.99.112: Claude, ChatGPT, DeepSeek, Groq and xAI are removed from the app entirely
const numberZero=v=>v!==null&&v!==undefined&&v!==''&&(String(v).toLowerCase()==='free'||Number(v)===0);
function zeroPrice(m){
 const raw=m.pricing, rows=Array.isArray(raw)?raw:raw&&typeof raw==='object'?[raw]:[m];
 return rows.length>0&&rows.every(d=>[['prompt','completion'],['input','output'],['input_price','output_price']].some(([a,b])=>numberZero(d[a])&&numberZero(d[b])));
}
function idOf(pid,m){return String(typeof m==='string'?m:pid==='gemini'||pid==='cohere'||pid==='cloudflare'?m.name||m.id||'':m.id||m.name||'').replace(/^models\//,'');}
function select(pid,data){
 if(disabled.has(pid))return [];
 const a=Array.isArray(data)?data:data&&(data.data||data.models||data.result)||[];
 if(!Array.isArray(a))return [];
 return Array.from(new Set(a.filter(m=>{
  const id=idOf(pid,m);if(!id||(nonchat.test(id)&&!chatAllowed.has(id))||routers.test(id))return false;
  if(pid==='gemini')return inventory.documentedGemini.includes(id)&&(!m.supportedGenerationMethods||m.supportedGenerationMethods.includes('generateContent'));
   if(pid==='mistral')return inventory.documentedMistral.includes(id);
  if(pid==='zai')return /^glm-4\.(?:5-flash|7-flash|6v-flash)$/i.test(id);
  if(pid==='openrouter')return typeof m==='object'&&zeroPrice(m)&&(!m.architecture||!m.architecture.output_modalities||m.architecture.output_modalities.includes('text'));
  if(pid==='requesty')return typeof m==='object'&&zeroPrice(m);
  if(pid==='routeway')return /:free$/.test(id)||(typeof m==='object'&&zeroPrice(m));
  if(pid==='unorouter')return /:free$/i.test(id); // V1.99.156: free routes only, any other id draws on the balance
  if(pid==='kilo')return typeof m==='object'&&(zeroPrice(m)||m.isFree===true);
  if(pid==='blockrun')return typeof m==='object'&&m.billing_mode==='free';
  if(pid==='llm7')return typeof m==='object'&&/^(turbo|free)$/i.test(m.tier||'');
  if(pid==='groq')return !/whisper|tts|orpheus|playai|guard|safeguard|compound|embed|moderation/i.test(id); // V1.99.115: chat models the key can reach; Free plan cannot be billed
  if(pid==='cloudflare')return id.startsWith('@cf/')&&!paidCF.has(id);
  if(pid==='cohere')return (inventory.documentedCohere||[]).includes(id); // V1.99.91: exactly the 10 chat models the user verified
  if(pid==='aionlabs')return /^(?:aion-labs\/)?aion-/.test(id);
  if(pid==='tokenharbor')return /:free$/i.test(id); // V1.99.109: free routes only, a paid id would spend the prepaid wallet
  if(pid==='zro')return /^(?:deepseek-v4(?:\.1)?-flash(?:-\d{4})?|glm-5\.3-flash)$/i.test(id); // V1.99.110: the two free Flash families only; the zro/ aliases are duplicates and are not listed
  if(pid==='typhoon')return /^typhoon-v\d+(?:\.\d+)?-[\w.-]*instruct$/i.test(id); // V1.99.107: chat models only, the OCR and ASR ones are not chat
  if(pid==='agnes')return /^agnes-\d+(?:\.\d+)?-flash$/i.test(id);
  if(pid==='gonka')return /^(?:deepseek-ai\/DeepSeek-V4-Flash-0731|zai-org\/GLM-5\.3-Flash|MiniMaxAI\/MiniMax-M2\.7)$/i.test(id); // V1.99.111: same three ids as Gonka Broker
  if(pid==='gonkabroker')return /^(?:deepseek-ai\/DeepSeek-V4-Flash-0731|zai-org\/GLM-5\.3-Flash|MiniMaxAI\/MiniMax-M2\.7)$/i.test(id);
  return true;
 }).map(m=>idOf(pid,m))));
}
function textOf(pid,d){
 if(pid==='gemini')return (d.candidates||[]).flatMap(c=>c.content&&c.content.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('').trim();
 if(pid==='cohere')return (d.message&&d.message.content||[]).filter(p=>p.type==='text').map(p=>p.text||'').join('').trim();
 if(pid==='mlvoca')return String(d.response||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
if(Array.isArray(d.content))return d.content.filter(p=>p&&p.type==='text').map(p=>p.text||'').join('').replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
 const c=d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;
 return (Array.isArray(c)?c.map(p=>p.text||'').join(''):String(c||'')).replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
}
function family(id){const n=String(id||'').split('/').pop().toLowerCase();const m=n.match(/^[a-z]+\d*(?:\.\d+)?/);return m?m[0]:n;}
function assertModel(pid,requested,reported){
 if(!reported||reported===requested)return;
 // V1.99.105: free.ai's self-hosted pool answers "qwen3-8b" with Qwen/Qwen3-30B-A3B-Instruct. Same model family is accepted for free.ai only; a different family is still refused.
 // V1.99.109: Token Harbor answers a ":free" route with the base model name (deepseek-v4-flash:free -> deepseek-v4-flash). Only that exact pair is accepted.
 if(pid==='tokenharbor'&&String(requested).replace(/:free$/i,'')===reported)return;
 if(pid==='freeai'&&family(requested)&&family(requested)===family(reported))return;
 // Pollinations documents a public alias. Never accept a different observed alias target.
 const alias=inventory.aliases[pid]&&inventory.aliases[pid][requested];
 if(alias===reported)return;
 throw new Error('Model substitution refused: requested '+requested+', provider reported '+reported+'. Nothing was switched.');
}
function bodyFor(pid,model){
 if(pid==='gemini')return {contents:[{role:'user',parts:[{text:'Reply exactly OK.'}]}],generationConfig:{maxOutputTokens:256}};
 if(pid==='mlvoca')return {model,prompt:'Reply exactly OK.',stream:false,options:{num_predict:128}};
 const b={model,messages:[{role:'user',content:'Reply exactly OK.'}],max_tokens:256,stream:false};
 if(pid==='openrouter')b.provider={allow_fallbacks:false,max_price:{prompt:0,completion:0}};
 if(pid==='zai')b.thinking={type:'disabled'};
 if(pid==='gonka')b.max_tokens=1024; // V1.99.111: MiniMax writes its thinking first
 if(pid==='zro')b.max_tokens=1024; // V1.99.110: reasoning model, a 20-token cap came back empty in Termux; 256 is too tight for a long think
 return b;
}
function chatUrl(pid,p,key,model){return pid==='gemini'?'https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent':p.urlFor?p.urlFor('chat',key):p.chatUrl;}
async function probe(pid,p,key,model,fetcher){
 const r=await fetcher(chatUrl(pid,p,key,model),{method:'POST',headers:Object.assign({'Content-Type':'application/json'},p.headers(key)),body:JSON.stringify(bodyFor(pid,model)),redirect:'error'});
 let d;try{d=await r.json();}catch(_){d={};}
 if(!r.ok||d.error){
  const em=String(d.error&&(d.error.message||d.error)||d.message||'').slice(0,90);
  let st=r.ok?(Number(d.error&&d.error.code)||502):r.status;
  if(st!==401&&st!==403&&/invalid.{0,12}(api.?)?key|incorrect.{0,12}key|unauthori[sz]ed|no auth/i.test(em))st=401;
  const e=new Error(p.name+' '+model+' failed (HTTP '+st+'). No fallback was attempted.');e.status=st;e.detail=em;throw e;}
 if(!textOf(pid,d))throw new Error(p.name+' '+model+' returned no text.');
 assertModel(pid,model,d.model);return {model,status:'TEXT_REPLY_VERIFIED',http:r.status,reportedModel:d.model||''};
}
function configure(reg){
 for(const [pid,p]of Object.entries(reg)){
  p.fallbackModels=(inventory.verified[pid]||[]).slice(); // legacy name: picker seed, NEVER a retry chain
  p.defaultModel=p.fallbackModels.includes(p.defaultModel)?p.defaultModel:p.fallbackModels[0]||'';
  p.modelWalk=false;p.walkOnCapacity=false;p.noChat=disabled.has(pid);
  p.parseModels=d=>select(pid,d);
  if(disabled.has(pid))p.billingNote='Disabled in this free-only build: '+'current API access requires paid billing.';
  else if(pid==='groq')p.billingNote='Free plan: limits per Groq account, about 30 requests a minute, 1,000 a day and 8,000 tokens a minute on gpt-oss-120b (Groq sample limits; your Limits page is exact). Extra keys from the same account add no capacity. If your organisation is upgraded to the Developer plan, usage is billed. No fallback.';
  else if(pid==='aionlabs')p.billingNote='Daily free credit allowance, NOT zero-price tokens. Use a free-only account without prepaid balance; paid balances can be billed. No model or provider fallback.';
  else if(pid==='unorouter')p.billingNote='Only :free models are listed so your balance is not spent. About 1 request a minute per model; a free model can be switched off by Uno Router. No fallback.';
  else if(pid==='tokenharbor')p.billingNote='Prepaid-wallet gateway: only :free routes are listed so the wallet is not spent. A free route can end or be switched off by Token Harbor. No fallback.';
  else if(pid==='zro')p.billingNote='Free tier, daily allowance not published. Flash models only; your key decides which ones are open (glm-5.3-flash is refused on some keys). They are reasoning models: slower first reply, thinking counts against the allowance. No fallback.';
  else if(pid==='typhoon')p.billingNote='Free tier per Typhoon docs: 5 requests a second, 200 a minute, no daily cap published. Thai-first, answers English too. Chat model only (OCR and speech models are not listed). No fallback.';
  else if(pid==='agnes')p.billingNote='Free per third-party listings, not confirmed by Agnes. Limits depend on your Agnes account (Token Plan); a paid balance can be billed. Chat Flash models only, no fallback.';
  else if(pid==='gonka')p.billingNote='Free status not confirmed by GonkaRouter (third-party listings only). Limits depend on your GonkaRouter account; a topped-up balance can be spent. Three models only, no fallback. MiniMax shows its thinking first.';
  else if(pid==='gonkabroker')p.billingNote='Free monthly token grant per third-party listings (about 1M tokens a month, shared across models), not confirmed by Gonka. TOP UP in the app is paid and can be spent. Anthropic-style API. No fallback.';
  else if(pid==='cohere')p.billingNote='Free only with an evaluation key, subject to trial limits and non-production terms. Production keys can bill. No fallback.';
  else if(pid==='cloudflare')p.billingNote='Free-plan daily neuron allowance. Account ID and API token are separate fields. Paid-plan-only models are excluded. Paid accounts can bill overages; use a Free-plan account.';
  else if(pid==='freeai')p.billingNote='Free self-hosted models, no key needed. An optional free account key (sk-free-...) gives 30,000 tokens a day. Premium models bill purchased credit and are not listed. No fallback.';
  else if(pid==='mistral')p.billingNote='Mistral free Experiment tier only: documented models, no fallback. A paid Scale plan can bill.';
  else if(pid==='gemini')p.billingNote='Documented free-plan models. Use a Free-tier project/account: paid-tier credentials may incur charges. No fallback.';
  if(pid==='openrouter')p.chatUrl='https://openrouter.ai/api/v1/chat/completions';
  if(pid==='cohere')p.chatUrl='https://api.cohere.com/v2/chat';
  if(pid==='mistral')p.chatUrl='https://api.mistral.ai/v1/chat/completions';
  if(pid==='pollinations')p.chatUrl='https://text.pollinations.ai/openai?referrer=horizon-app';
 }
}
// V1.99.105: tell failures apart. A key is only "rejected" on 401/403; rate limits, timeouts and a model that is down never block saving a key.
function classify(e){
 const s=Number(e&&e.status)||0,m=String(e&&e.message||'');
 if(s===403&&/model.{0,30}(?:access|denied|permission|not allowed)|user_model_access_denied/i.test(String(e&&e.detail||'')))return 'other';
 if(s===401||s===403)return 'auth';
 if(s===429)return 'limit';
 if(s===402)return 'pay';
 if(s===504||s===0||(e&&e.network)||/timed out|abort|failed to fetch|network/i.test(m))return 'slow';
 if(s>=500)return 'down';
 return 'other';
}
const WORDS={limit:'rate-limited',slow:'timed out',down:'server error',pay:'needs credit',other:'unavailable'};
function summary(t){return Object.keys(WORDS).filter(k=>t[k]).map(k=>t[k]+' '+WORDS[k]).join(', ');}
const GAP={mlvoca:13000}; // mlvoca allows 5 requests a minute
const MAX_PROBES=25;      // never walk a huge catalogue: free daily quotas (OpenRouter ~50 a day) are shared with your chats
// One cheap request for the Test all keys button. No catalogue walk, so it does not burn the free quota.
async function checkKey(pid,p,key,fetcher,model){
 try{
  if(pid==='openrouter'){
   const r=await fetcher('https://openrouter.ai/api/v1/auth/key',{headers:p.headers(key),redirect:'error'});
   if(r.ok){const d=await r.json();if(d&&d.data&&!d.error)return {c:'live',t:'LIVE'};return {c:'bad',t:'ERROR',m:'No authenticated key record was returned'};}
   if(r.status===401||r.status===403)return {c:'bad',t:'REJECTED',m:'OpenRouter rejected this key (HTTP '+r.status+').'};
   if(r.status===429)return {c:'warn',t:'LIMITED',m:'Rate-limited (HTTP 429).'};
   return {c:'bad',t:'ERROR',m:'HTTP '+r.status};
  }
  const first=model||p.defaultModel;
  try{
   await probe(pid,p,key,first,fetcher);
   return {c:'live',t:'LIVE'};
  }catch(e1){
   // V1.99.158: adding a backup key tries up to 3 listed models and accepts the key if one answers, but this test used ONLY the currently selected model,
   // so a key that validated fine on add came back ERROR whenever that one model was unavailable. A model-level failure (not 401/403, not a rate limit)
   // now tries up to 2 other listed models, the same way the add-time check does.
   const k1=classify(e1);
   if(k1!=='other'&&k1!=='down')throw e1;
   const pool=Array.from(new Set([p.defaultModel].concat(inventory.verified[pid]||[]).concat(p.fallbackModels||[]))).filter(x=>x&&x!==first);
   const extra=pool.slice(0,/^hzworker\d*$/.test(pid)?1:2);
   for(const mm of extra){
    try{await probe(pid,p,key,mm,fetcher);return {c:'live',t:'LIVE',m:'Key works. Selected model '+first+' did not answer ('+String(e1&&e1.message||e1).slice(0,120)+'); '+mm+' did.'};}
    catch(e2){if(classify(e2)==='auth')throw e2;}
   }
   throw e1;
  }
 }catch(e){
  const k=classify(e),m=String(e&&e.message||e);
  if(k==='auth')return {c:'bad',t:'REJECTED',m};
  if(k==='limit'||k==='pay')return {c:'warn',t:'LIMITED',m};
  if(k==='slow')return {c:'warn',t:'SLOW',m};
  return {c:'bad',t:'ERROR',m};
 }
}
async function discover(pid,p,key,fetcher,onProgress,options){
 options=options||{};
 if(/^hzworker\d*$/.test(pid))options=Object.assign({},options,{firstSuccess:true}); // V1.99.144: Worker providers never walk the catalogue; neurons are the whole budget
 if(disabled.has(pid))throw new Error(p.name+' is disabled: no documented ongoing free API tier.');
 let url=p.urlFor?p.urlFor('models',key):p.modelsUrl,seen=new Set(),all=[],page=1;
 if(pid==='mlvoca'){all=(inventory.candidates.mlvoca||[]).slice();url='';} // documented fixed catalogue; /api/tags is not public
 if(pid==='freeai'){all=(inventory.candidates.freeai||[]).slice();url='';} // V1.99.90: free.ai lists 568 models, most paid; only the self-hosted free ones are tested
 if(pid==='gonkabroker'){all=(inventory.candidates.gonkabroker||[]).slice();url='';} // Anthropic-style API: no public model list call, the three documented models are tested
 if(pid==='tokenharbor'){all=(inventory.candidates.tokenharbor||[]).slice();url='';} // V1.99.109: the free routes are not in its catalogue; only the verified free ones are tested
 while(url&&!seen.has(url)){
  seen.add(url);let r,d;
  try{
   r=await fetcher(url,{headers:p.headers(key),redirect:'error'});
   if(!r.ok){const e=new Error(p.name+' catalogue failed (HTTP '+r.status+'). Nothing was changed.');e.status=r.status;throw e;}
   d=await r.json();if(d.error||d.success===false)throw new Error(p.name+' catalogue returned an error.');
  }catch(ce){
   // V1.99.105: a failed model LIST is not a failed key. Providers flagged modelsOptional (Agnes, Ollama, Gonka) and any list that is only slow or rate-limited fall back to the documented models, and the real chat probe below decides.
   const k=classify(ce);
   if(p.modelsOptional||ce.status===404||ce.status===405||k==='slow'||k==='limit'||k==='down'){all=all.concat((inventory.verified[pid]||[]).concat(p.fallbackModels||[]));url='';break;}
   if(k==='auth')ce.hard=true;
   throw ce;
  }
  all=all.concat(select(pid,d));
  if(pid==='gemini'&&d.nextPageToken)url=p.modelsUrl+'&pageToken='+encodeURIComponent(d.nextPageToken);
  else if(pid==='cohere'&&d.next_page_token)url=p.modelsUrl+'&page_token='+encodeURIComponent(d.next_page_token);
  else if(pid==='cloudflare'&&page<Number(d.result_info&&d.result_info.total_pages||1))url=(p.urlFor('models',key))+'&page='+(++page);
  else if(d.links&&d.links.next){const next=new URL(d.links.next,url),base=new URL(url);if(next.origin!==base.origin||next.pathname!==base.pathname)throw new Error('Unsafe catalogue pagination refused.');url=next.href;}
  else url='';
 }
 if(!all.length&&['zai','mlvoca','freeai'].includes(pid))all=(inventory.candidates[pid]||[]).slice();
 if(!all.length&&p.modelsOptional)all=(inventory.verified[pid]||p.fallbackModels||[]).slice();
 all=Array.from(new Set(all));
 { // verified seeds first, so a capped or interrupted audit still checks the models you actually use
  const seed=(inventory.verified[pid]||[]).concat(p.defaultModel?[p.defaultModel]:[]);
  all.sort((a,b)=>{const x=seed.indexOf(a),y=seed.indexOf(b);return (x<0?999:x)-(y<0?999:y);});
 }
 const passed=[],results=[],tally={limit:0,slow:0,down:0,pay:0,other:0};let auth=null,streak=0,tested=0;
 const gap=GAP[pid]||2200;
 const cheap=!!options.firstSuccess||/^hzworker\d*$/.test(pid); // V1.99.144: Horizon Workers never walk the catalogue, even on Refresh: one probe on the cheapest model
 const probeCap=cheap?(options.firstSuccess?3:1):MAX_PROBES; // V1.99.141: key check = at most 3 test replies, never a catalogue walk
 for(let i=0;i<all.length&&tested<probeCap;i++){
  if(onProgress)onProgress(i+1,all.length,all[i]);
  tested++;
  try{results.push(await probe(pid,p,key,all[i],fetcher));passed.push(all[i]);streak=0;if(cheap)break;}
  catch(e){
   const k=classify(e);results.push({model:all[i],status:e.status===429?'RATE_LIMITED':e.status===402?'PAYMENT_REQUIRED':'NOT_VERIFIED',http:e.status||0});
   if(k==='auth'){auth=e;break;}                 // wrong key: stop at once, do not spend the other requests
   tally[k]++;streak=k==='limit'?streak+1:0;
   if(streak>=2)break;                            // rate-limited twice in a row: the quota is gone, more probes only make it worse
  }
  // Discovery is an explicit audit, not fallback: no user conversation is sent and selection never changes.
  if(i+1<all.length)await new Promise(r=>setTimeout(r,gap));
 }
 p.lastModelAudit={at:new Date().toISOString(),results};
 if(!passed.length){
  if(auth){const e=new Error(p.name+': key rejected (HTTP '+auth.status+')'+(auth.detail?' - '+auth.detail:'')+'. Check the key.');e.status=auth.status;e.hard=true;throw e;}
  const why=summary(tally)||'no reply';
  const e=new Error(p.name+': key not rejected, but no model answered ('+why+'). Wait and refresh, or pick a model by hand.');
  e.soft=true;e.why=why;e.status=tally.limit?429:504;throw e;
 }
 if(cheap)return all.slice(); // V1.99.141: key proven by one reply; keep the full free catalogue so the model list does not shrink to one entry
 return passed;
}
root.HorizonModelPolicy={configure,select,zeroPrice,textOf,assertModel,bodyFor,probe,discover,checkKey,classify,disabled,inventory};
})(typeof window!=='undefined'?window:globalThis);
