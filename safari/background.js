/* AI Flow — arrière-plan : seul écrivain de l'état. Lit les quotas uniquement depuis les onglets officiels
 * déjà ouverts (jamais d'ouverture ni de rechargement automatique de conversation). */
if(typeof importScripts==='function')importScripts('platforms.js','shared.js','readers.js');
const PL=globalThis.AIFlowPlatforms,A=globalThis.AIFlow,R=globalThis.AIFlowReaders,api=A.api,K=A.KEYS;
const ALARM='ai-flow-refresh',ALARM_MINUTES=2,AUTO_MIN_GAP=60000,ACCOUNT_KEY='ai_flow_accounts_v1';
const PAGES={dashboard:'dashboard.html',options:'options.html',transfer:'transfer.html'};
const EXT_PAGES=['popup.html','dashboard.html','options.html','transfer.html'];
let queue=Promise.resolve();
function within(promise,ms,fallback){let t;return Promise.race([promise,new Promise(res=>{t=setTimeout(()=>res(fallback),ms);})]).finally(()=>clearTimeout(t));}
// Une tâche bloquée ne doit jamais figer les suivantes (Safari peut ne jamais répondre à un appel natif).
function serial(job){
  const r=queue.catch(()=>{}).then(job);
  queue=within(r.catch(()=>{}),30000,undefined);
  return r;
}
async function load(key,fallback){try{return (await api.storage.local.get(key))[key]??fallback;}catch{return fallback;}}
async function save(key,value){await api.storage.local.set({[key]:value});}
async function write(op,payload){const s=await A.getState();const v=A.reduce(s,op,payload);await api.storage.local.set({[A.KEY]:s});return {state:s,value:v};}

/* ---------- Autorisations par origine ---------- */
function senderSite(sender){
  try{const u=new URL(sender.url||'');if(u.protocol!=='https:')return null;return PL.siteFor(u.href);}catch{return null;}
}
function authorized(message,sender){
  if((sender.id&&sender.id!==api.runtime.id)||sender.frameId>0)throw Error('Origine non autorisée');
  const url=sender.url||'';
  if(url.startsWith(api.runtime.getURL(''))||(!sender.tab&&!url))return 'page';
  const site=senderSite(sender);
  if(!site||!sender.tab)throw Error('Origine non autorisée');
  const {op,payload}=message;
  if(op==='openPage'&&Object.hasOwn(PAGES,payload?.page))return site;
  if(op==='openPlatform'&&PL.get(payload?.platform))return site;
  if(op==='openUrl'||op==='captureConversation')return site;
  if(op==='position'&&payload?.site===site)return site;
  if(op==='autoRefresh')return site;
  if((op==='resumeArm'||op==='resumeCancel')&&PL.get(site)?.resume)return site;
  throw Error('Commande non autorisée depuis cette page');
}

/* ---------- Onglets ---------- */
async function allTabs(){try{return await api.tabs.query({});}catch{return [];}}
function onPlatform(pid,tab){return PL.forUrl(tab?.url||'').includes(pid);}
function pickTab(pid,tabs){const list=tabs.filter(t=>onPlatform(pid,t));return list.find(t=>t.status==='complete'&&t.active)||list.find(t=>t.status==='complete')||list[0]||null;}
async function focus(tab){
  await api.tabs.update(tab.id,{active:true});
  if(tab.windowId!=null&&api.windows?.update)try{await api.windows.update(tab.windowId,{focused:true});}catch{}
}
// Chrome ne donne pas l'URL des onglets sans la permission « tabs » : runtime.getContexts d'abord.
async function extensionTab(base){
  if(api.runtime.getContexts){
    try{
      const hit=(await api.runtime.getContexts({contextTypes:['TAB']})).find(c=>(c.documentUrl||'').split(/[?#]/)[0]===base&&c.tabId>=0);
      if(hit)return await api.tabs.get(hit.tabId);
    }catch{}
  }
  return (await allTabs()).find(t=>(t.url||'').split(/[?#]/)[0]===base)||null;
}
// Onglet normal, jamais épinglé ; réutilise un onglet AI Flow déjà ouvert.
async function openPage(page,query){
  if(!Object.hasOwn(PAGES,page))throw Error('Page inconnue');
  const base=api.runtime.getURL(PAGES[page]);
  const qs=query&&typeof query==='object'?new URLSearchParams(Object.entries(query).filter(([,v])=>typeof v==='string'&&v.length<200)).toString():'';
  const url=base+(qs?'?'+qs:'');
  const existing=await extensionTab(base);
  if(existing?.id!=null){
    if(qs||existing.pinned)await api.tabs.update(existing.id,{url:qs?url:existing.url,pinned:false});
    await focus(existing);return {tabId:existing.id,reused:true};
  }
  const tab=await api.tabs.create({url,active:true,pinned:false});
  return {tabId:tab.id,reused:false};
}
async function openPlatform(pid){
  const p=PL.get(pid);if(!p)throw Error('Plateforme inconnue');
  const tab=pickTab(pid,await allTabs());
  if(tab?.id!=null){await focus(tab);return {tabId:tab.id,reused:true};}
  const created=await api.tabs.create({url:p.home,active:true,pinned:false});
  return {tabId:created.id,reused:false};
}

/* ---------- Lecture des quotas ---------- */
async function readPlatform(pid,tab){
  const fn=R[PL.get(pid)?.reader];
  if(!fn)return {status:'unsupported'};
  if(!api.scripting?.executeScript)return {status:'scripting-unavailable'};
  try{
    const frames=await api.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:fn});
    const v=frames?.find(f=>f.frameId===0)?.result||frames?.[0]?.result;
    if(!v||typeof v!=='object'||typeof v.status!=='string')return {status:'no-result'};
    return v;
  }catch{return {status:'injection-failed'};}
}
async function saveDiag(pid,result){
  // Aucune réponse brute, aucun identifiant de compte, cookie ou jeton.
  const all=await load(K.diag,{});
  all[pid]={status:String(result.status).slice(0,40),httpStatus:Number.isInteger(result.httpStatus)?result.httpStatus:null,checkedAt:Date.now(),readings:result.readings?.length||0};
  await save(K.diag,all);
}
async function refreshPlatform(pid,tab){
  const result=await readPlatform(pid,tab);
  const readings=A.sanitizeReadings(pid,result.readings);
  const good=(result.status==='ok'||result.status==='partial')&&readings.length>0;
  await saveDiag(pid,good?result:{...result,status:result.status==='ok'||result.status==='partial'?'invalid-result':result.status});
  if(good){
    // Changement de compte : ne jamais mélanger les relevés de deux comptes.
    if(typeof result.account==='string'){
      const accounts=await load(ACCOUNT_KEY,{});
      if(accounts[pid]&&accounts[pid]!==result.account)await write('clearPlatform',{platform:pid});
      if(accounts[pid]!==result.account){accounts[pid]=result.account;await save(ACCOUNT_KEY,accounts);}
    }
    const {state}=await write('metrics',{platform:pid,readings});
    await save(K.history,A.recordHistory(await load(K.history,null),readings));
    await notify(state);
  }else if(result.status==='login'){
    // Déconnecté : les anciens pourcentages ne sont plus attribuables à un compte.
    await write('clearPlatform',{platform:pid});
    const accounts=await load(ACCOUNT_KEY,{});delete accounts[pid];await save(ACCOUNT_KEY,accounts);
  }
  await badge();
  return {status:good?result.status:result.status,readings:readings.length};
}
async function autoRefresh(pids,force=false){
  const saved=await load(K.auto,{}),last={...(saved.last||{})},disabled=saved.disabled||{},now=Date.now();
  const todo=pids.filter(p=>PL.get(p)?.reader&&!disabled[p]&&(force||now-(last[p]||0)>=AUTO_MIN_GAP));
  if(!todo.length)return {skipped:true};
  const tabs=await allTabs(),out={};
  for(const pid of todo){
    const tab=pickTab(pid,tabs);
    if(!tab)continue; // Aucun onglet : rien n'est ouvert ni rechargé.
    last[pid]=now;
    out[pid]=await refreshPlatform(pid,tab);
  }
  await save(K.auto,{...(await load(K.auto,{})),last});
  return out;
}
async function autoSet(pid,enabled){
  if(!PL.get(pid)?.reader)throw Error('Plateforme sans lecture automatique');
  const saved=await load(K.auto,{}),disabled={...(saved.disabled||{})};
  if(enabled)delete disabled[pid];else disabled[pid]=true;
  await save(K.auto,{...saved,disabled});
  if(enabled)await autoRefresh([pid],true);
  return true;
}
async function connectionStatuses(){
  const [tabs,diag,auto]=await Promise.all([allTabs(),load(K.diag,{}),load(K.auto,{})]);
  const out={};
  for(const p of PL.PLATFORMS)out[p.id]={tabOpen:tabs.some(t=>onPlatform(p.id,t)),diag:diag[p.id]||null,disabled:!!auto.disabled?.[p.id]};
  return out;
}

/* ---------- Badge et notifications ---------- */
async function badge(){
  const state=await A.getState(),now=Date.now();
  const st=A.visiblePlatforms(state).map(id=>A.platformStatus(state,id,now));
  const limit=st.some(s=>s.limitReached),crit=st.some(s=>s.level==='critical'),warn=st.some(s=>s.level==='warning');
  try{
    await api.action?.setBadgeText({text:limit?'max':crit?'95+':warn?'80+':''});
    if(limit||crit||warn)await api.action?.setBadgeBackgroundColor({color:limit||crit?'#B5544B':'#C28A3E'});
  }catch{}
}
function hasNative(){return !!api.runtime.getManifest?.().permissions?.includes('nativeMessaging')&&!!api.runtime.sendNativeMessage;}
async function nativeCall(message){
  if(!hasNative())return null;
  try{const r=await within(api.runtime.sendNativeMessage('ai.flow',message),3000,null);return r&&typeof r==='object'?r:null;}catch{return null;}
}
async function notify(state){
  const {events,memo}=A.notificationEvents(await load(K.notify,null),state);
  await save(K.notify,memo);
  if(!events.length)return;
  const list=A.describeEvents(events,state);
  await recordInterruptions(events,list);
  // Toujours : bannière discrète dans le widget des pages ouvertes.
  const toasts=(await load(K.toast,[])).filter(t=>Date.now()-t.ts<3600000);
  await save(K.toast,[...toasts,...list].slice(-6));
  if(!state.settings.systemNotifications)return;
  for(const n of list){
    if(api.notifications?.create){try{await api.notifications.create('ai-flow:'+n.platform+':'+n.ts,{type:'basic',iconUrl:'icons/icon128.png',title:n.title,message:n.body});}catch{}}
    else await nativeCall({type:'AI_FLOW_NOTIFY',title:n.title,body:n.body});
  }
}

/* ---------- Flow Recovery : travail interrompu par une limite, puis repris ---------- */
// Plateforme du quota → conversations concernées (Codex : tâches chatgpt.com/codex).
const affects=(platform,url)=>{const c=PL.conversationOf(url);return !!c&&(platform==='claude'?c.platform==='claude':platform==='codex'&&c.platform==='chatgpt'&&url.includes('/codex/'));};
const cleanTitle=t=>String(t||'').replace(/\s*[-–|]\s*(Claude|ChatGPT|Codex)\s*$/i,'').trim().slice(0,100)||'Conversation';
async function recordInterruptions(events,notices){
  const reached=events.filter(e=>e.type==='reached'),reopened=events.filter(e=>e.type==='reset');
  if(!reached.length&&!reopened.length)return;
  let list=A.cleanCheckpoints(await load(K.drafts,[]));const now=Date.now();
  if(reached.length){
    const tabs=(await allTabs()).sort((a,b)=>(b.active?1:0)-(a.active?1:0)||(b.lastAccessed||0)-(a.lastAccessed||0));
    for(const e of reached){
      for(const t of tabs.filter(t=>affects(e.platform,t.url||'')).slice(0,2)){
        const url=PL.conversationOf(t.url).url;
        if(list.some(d=>d.url===url&&d.kind==='interruption'&&d.status!=='done'&&now-d.updatedAt<12*3600000))continue;
        list.unshift({id:'int-'+now+'-'+t.id,kind:'interruption',title:cleanTitle(t.title),source:PL.siteFor(url),platform:e.platform,url,fields:{},preview:'',createdAt:now,updatedAt:now,resetAt:e.resetAt||null,status:'open'});
      }
    }
  }
  for(const e of reopened){
    for(const d of list)if(d.kind==='interruption'&&d.platform===e.platform&&d.status==='open'){d.status='ready';d.updatedAt=now;}
    const ready=list.find(d=>d.kind==='interruption'&&d.platform===e.platform&&d.status==='ready');
    const n=notices.find(x=>x.platform===e.platform&&x.type==='reset');
    if(ready&&n&&!n.url){n.url=ready.url;n.body+=` Reprendre « ${ready.title.slice(0,50)} » ?`;}
  }
  await save(K.drafts,A.cleanCheckpoints(list));
}

/* ---------- Smart Transfer 2.0 : capture sur clic, ouverture et insertion sans envoi ---------- */
async function captureConversation(tabId){
  let tab;try{tab=await api.tabs.get(tabId);}catch{throw Error('Onglet introuvable.');}
  const site=PL.siteFor(tab.url||'');
  if(site!=='claude'&&site!=='chatgpt')throw Error('Ouvre une conversation Claude ou ChatGPT, puis réessaie.');
  let r;
  try{const f=await api.scripting.executeScript({target:{tabId},world:'MAIN',func:site==='claude'?R.claudeConversation:R.chatgptConversation});r=f?.[0]?.result;}
  catch{throw Error('Safari n’autorise pas encore AI Flow à lire cet onglet. Autorise le site dans les réglages des extensions.');}
  const messages=[];let total=0;
  for(const m of Array.isArray(r?.messages)?r.messages.slice(-800):[]){
    if((m?.role!=='user'&&m?.role!=='assistant')||typeof m.text!=='string')continue;
    const text=m.text.slice(0,60000);if(!text.trim())continue;
    total+=text.length;if(total>600000)break;messages.push({role:m.role,text});
  }
  if(!messages.length)throw Error('Aucun message lisible dans cet onglet. Sélectionne le texte utile et utilise « Transférer » dans la pastille, ou remplis les champs à la main.');
  const conv=PL.conversationOf(tab.url||'');
  const capture={ts:Date.now(),platform:site,url:conv?.url||null,title:cleanTitle(r.title||tab.title),source:r.source==='api'?'api':'page',messages};
  await save(K.capture,capture);
  return {count:messages.length,chars:total,title:capture.title,source:capture.source,platform:site};
}
const NEW_CHAT={claude:'https://claude.ai/new',chatgpt:'https://chatgpt.com/'};
async function waitLoaded(tabId,ms=20000){
  const end=Date.now()+ms;
  while(Date.now()<end){try{const t=await api.tabs.get(tabId);if(t.status==='complete'&&/^https:/.test(t.url||''))return true;}catch{return false;}await new Promise(r=>setTimeout(r,400));}
  return false;
}
async function openAndInsert(platform,text,insert){
  if(!NEW_CHAT[platform])throw Error('Destination inconnue');
  if(typeof text!=='string'||!text.trim()||text.length>200000)throw Error('Texte vide ou trop long.');
  const tab=await api.tabs.create({url:NEW_CHAT[platform],active:true,pinned:false});
  if(!insert)return {status:'opened'};
  if(!await waitLoaded(tab.id))return {status:'not-loaded'};
  try{const f=await api.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:R.insertDraft,args:[text]});return f?.[0]?.result||{status:'not-inserted'};}
  catch(e){return {status:'injection-failed',error:String(e?.message||e).slice(0,160)};}
}
async function openUrl(url){
  const conv=PL.conversationOf(url);if(!conv)throw Error('Lien non pris en charge');
  const tab=(await allTabs()).find(t=>PL.conversationOf(t.url||'')?.url===conv.url);
  if(tab){await focus(tab);return {tabId:tab.id,reused:true};}
  const t=await api.tabs.create({url:conv.url,active:true,pinned:false});return {tabId:t.id,reused:false};
}

/* ---------- Développement : version, mise à jour (Sparkle), rechargement, sauvegarde ---------- */
async function devInfo(){
  const m=api.runtime.getManifest();
  const reply=hasNative()?await nativeCall({type:'AI_FLOW_DEV_INFO'}):null;
  return {version:m.version,versionName:m.version_name||m.version,name:m.name,native:!!reply,channel:reply?.channel||(/dev/i.test(m.name)?'dev':'public'),appVersion:reply?.appVersion||null,appBuild:reply?.appBuild||null};
}
async function devCheckUpdate(){
  const reply=hasNative()?await nativeCall({type:'AI_FLOW_DEV_UPDATE'}):null;
  if(!reply?.ok)throw Error('La recherche de mise à jour passe par l’app AI Flow Dev : installe-la (docs/DEV-WORKFLOW.md).');
  return {ok:true};
}
// Sauvegarde complète des données locales d'AI Flow (clés ai_flow_*), pour changer d'installation sans rien perdre.
const DATA_PREFIX='ai_flow_';
async function exportData(){
  const all=await api.storage.local.get(null),data={};
  for(const [k,v] of Object.entries(all))if(k.startsWith(DATA_PREFIX)&&k!==K.capture&&k!==K.seed)data[k]=v;
  return {format:'ai-flow-backup',schema:1,exportedAt:new Date().toISOString(),version:api.runtime.getManifest().version,data};
}
async function importData(backup){
  if(backup?.format!=='ai-flow-backup'||backup.schema!==1||!backup.data||typeof backup.data!=='object')throw Error('Fichier de sauvegarde AI Flow non reconnu.');
  const entries=Object.entries(backup.data).filter(([k])=>k.startsWith(DATA_PREFIX)&&k.length<64);
  if(!entries.length)throw Error('Sauvegarde vide.');
  if(JSON.stringify(backup.data).length>8e6)throw Error('Sauvegarde trop volumineuse.');
  const data=Object.fromEntries(entries);
  // L'état principal est revalidé (aucune valeur non conforme ne passe).
  if(data[A.KEY])data[A.KEY]=A.clean(data[A.KEY]);
  if(data[K.history])data[K.history]=A.cleanHistory(data[K.history]);
  if(data[K.drafts])data[K.drafts]=A.cleanCheckpoints(data[K.drafts]);
  await api.storage.local.set(data);
  await restoreResumeAlarms();await badge();
  return {keys:entries.length};
}

/* ---------- Awake : maintien éveillé du Mac via l'app AI Flow ---------- */
const AWAKE_MAX_AHEAD=12*3600000,AWAKE_GRACE=10*60000;
function desiredAwake(jobs,settings,test,now=Date.now()){
  if(settings.awakeMode!=='stay')return 0;
  const times=Object.values(jobs).filter(j=>j.keepAwake&&j.at-now<=AWAKE_MAX_AHEAD).map(j=>j.at+AWAKE_GRACE);
  if(Number.isFinite(test)&&test>now)times.push(test);
  return times.length?Math.max(...times):0;
}
async function syncKeepAwake(force=false){
  const [jobs,state,info]=await Promise.all([load(K.resume,{}),A.getState(),load(K.awake,{})]);
  const now=Date.now(),until=desiredAwake(jobs,state.settings,info.testUntil,now);
  const changed=until!==(info.until||0);
  if(!force&&!changed&&!(until>now&&info.appRunning===false))return info;
  if(!hasNative()){const next={...info,until,supported:false,at:now};await save(K.awake,next);return next;}
  // Rien demandé et rien en cours : ne jamais lancer l'app pour rien.
  if(!until&&!info.until)return info;
  const reply=await nativeCall({type:'AI_FLOW_KEEP_AWAKE',until});
  const next={...info,until,supported:true,at:now,reachable:!!reply,ok:!!reply?.ok,appInstalled:reply?.appInstalled??null,appRunning:reply?.appRunning??null,error:reply?.error||null};
  if(!until)delete next.testUntil;
  await save(K.awake,next);
  return next;
}
async function awakeStatus(){
  const [state,info,jobs]=await Promise.all([A.getState(),load(K.awake,{}),load(K.resume,{})]);
  const now=Date.now(),mode=state.settings.awakeMode,firstJob=Object.values(jobs).sort((a,b)=>a.at-b.at)[0]||null;
  const base={mode,enabled:mode==='stay',nextAt:firstJob?.at||null,until:desiredAwake(jobs,state.settings,info.testUntil,now),
    tooFar:mode==='stay'&&Object.values(jobs).some(j=>j.keepAwake&&j.at-now>AWAKE_MAX_AHEAD)};
  if(!hasNative())return {...base,supported:false};
  if(mode!=='stay')return {...base,supported:true};
  const reply=await nativeCall({type:'AI_FLOW_AWAKE_STATUS'});
  const next={...info,reachable:!!reply,appInstalled:reply?.appInstalled??null,appRunning:reply?.appRunning??null,error:reply?.error||null,checkedAt:now};
  await save(K.awake,next);
  return {...base,supported:true,reachable:!!reply,appInstalled:next.appInstalled,appRunning:next.appRunning,error:next.error,holding:reply?.holding??null};
}
async function awakeTest(){
  const state=await A.getState();
  if(state.settings.awakeMode!=='stay')throw Error('Choisis d’abord le mode « Rester éveillé ».');
  if(!hasNative())throw Error('Awake nécessite Safari sur Mac avec l’app AI Flow.');
  const info=await load(K.awake,{});await save(K.awake,{...info,testUntil:Date.now()+2*60000});
  await syncKeepAwake(true);
  await new Promise(r=>setTimeout(r,1500));
  return awakeStatus();
}

/* ---------- Relance programmée (activée et armée par l'utilisateur) ---------- */
const RESUME_MAX_ATTEMPTS=12,RESUME_MAX_TEXT=2000;
async function resumeJobs(){return load(K.resume,{});}
async function resumeArm(payload,sender){
  const conv=PL.conversationOf(sender.url);
  if(!conv||sender.tab?.id==null)throw Error('Ouvre la conversation à relancer, puis réessaie.');
  const text=typeof payload?.message==='string'?payload.message.trim():'';
  if(!text||text.length>RESUME_MAX_TEXT)throw Error('Message de relance vide ou trop long.');
  const at=Number(payload?.at),now=Date.now();
  if(!Number.isFinite(at)||at<now+30000||at>now+8*86400000)throw Error('Heure de relance invalide.');
  const jobs=await resumeJobs();
  for(const [k,j] of Object.entries(jobs))if(j.url===conv.url){delete jobs[k];try{await api.alarms.clear('ai-flow-resume:'+k);}catch{}}
  const id=String(now);
  jobs[id]={id,platform:conv.platform,url:conv.url,tabId:sender.tab.id,message:text,at,plannedAt:at,keepAwake:payload.keepAwake!==false,attempts:0,status:'armed',armedAt:now};
  await save(K.resume,jobs);
  await api.alarms.create('ai-flow-resume:'+id,{when:at});
  const awake=await syncKeepAwake(true);
  return {id,at,awake:{until:awake.until||0,appRunning:awake.appRunning??null,supported:awake.supported!==false,reachable:awake.reachable??null}};
}
async function resumeCancel(id){
  const jobs=await resumeJobs();if(!jobs[id])return false;
  delete jobs[id];await save(K.resume,jobs);
  try{await api.alarms.clear('ai-flow-resume:'+id);}catch{}
  await syncKeepAwake();return true;
}
// Injectée dans l'onglet de la conversation. N'écrase jamais un brouillon.
async function injectResume(text,platform){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const pick=list=>{for(const s of list){const el=document.querySelector(s);if(el)return el;}return null;};
  const composer=platform==='claude'
    ?pick(['div.ProseMirror[contenteditable="true"]','[data-testid="chat-input"] [contenteditable="true"]','fieldset [contenteditable="true"]'])
    :pick(['#prompt-textarea','div.ProseMirror[contenteditable="true"]','form textarea']);
  if(!composer)return {status:'no-composer'};
  const read=()=>composer.tagName==='TEXTAREA'?composer.value:composer.textContent;
  if((read()||'').trim())return {status:'draft'};
  composer.focus();
  if(composer.tagName==='TEXTAREA'){
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(composer,text);
    composer.dispatchEvent(new Event('input',{bubbles:true}));
  }else if(!document.execCommand('insertText',false,text)){
    composer.textContent=text;composer.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
  }
  const sendSel=platform==='claude'
    ?['button[aria-label="Send message"]','button[aria-label="Envoyer le message"]','button[aria-label*="Send" i]','fieldset button[type="submit"]']
    :['button[data-testid="send-button"]','#composer-submit-button','button[aria-label*="Send" i]','button[aria-label*="Envoyer" i]'];
  let btn=null;
  for(let i=0;i<15;i++){btn=pick(sendSel);if(btn&&!btn.disabled)break;await sleep(200);}
  if(btn&&!btn.disabled)btn.click();
  else composer.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
  await sleep(800);
  return {status:(read()||'').trim()?'not-sent':'sent'};
}
const RESUME_LABELS={sent:'envoyée',draft:'annulée : un brouillon était en cours','no-composer':'zone de saisie introuvable','not-sent':'message non parti','injection-failed':'onglet inaccessible','quota-plein':'quota encore plein',chargement:'page en chargement','ouverture-onglet':'réouverture de la conversation'};
async function fireResume(id){
  const job=(await resumeJobs())[id];if(!job)return;
  // Déjà reprogrammée plus tard (alarme et rattrapage peuvent se croiser) : rien à faire maintenant.
  if(job.at>Date.now()+30000)return;
  const name=PL.get(job.platform)?.name||'IA';
  const finish=async status=>{
    const all=await resumeJobs();delete all[id];await save(K.resume,all);await syncKeepAwake();
    const planned=job.plannedAt||job.at,now=Date.now(),late=status==='envoyée'&&now-planned>10*60000;
    await save(K.resumeLast,{url:job.url,platform:job.platform,status,at:now,plannedAt:planned,late});
    const body=late?`${name} : envoyée à ${A.clock(now)}, rattrapée au réveil du Mac (prévue à ${A.clock(planned)}).`:`${name} : ${status}`;
    const n={id:'resume-'+now,platform:job.platform,type:'resume',title:`AI Flow · relance ${status==='envoyée'?(late?'rattrapée':'envoyée'):'non envoyée'}`,body,ts:now};
    await save(K.toast,[...(await load(K.toast,[])),n].slice(-6));
    if((await A.getState()).settings.systemNotifications){
      if(api.notifications?.create){try{await api.notifications.create('ai-flow:'+n.id,{type:'basic',iconUrl:'icons/icon128.png',title:n.title,message:n.body});}catch{}}
      else await nativeCall({type:'AI_FLOW_NOTIFY',title:n.title,body:n.body});
    }
  };
  const retry=async(status,minutes)=>{
    const all=await resumeJobs(),j=all[id];if(!j)return;
    j.attempts=(j.attempts||0)+1;j.status=RESUME_LABELS[status]||status;
    if(j.attempts>=RESUME_MAX_ATTEMPTS)return finish('abandonnée ('+j.status+')');
    j.at=Date.now()+minutes*60000;await save(K.resume,all);
    await api.alarms.create('ai-flow-resume:'+id,{when:j.at});
    await syncKeepAwake();
  };
  // 1. Le quota est-il vraiment rouvert ? (Claude pour ses conversations, Codex sur chatgpt.com.)
  const check=job.platform==='claude'?{p:'claude',ids:['claude.session','claude.weekly']}:job.url.includes('/codex/')?{p:'codex',ids:['codex.session','codex.weekly']}:null;
  if(check){
    const tab=pickTab(check.p,await allTabs());
    if(tab){
      const r=await refreshPlatform(check.p,tab),st=await A.getState();
      const full=check.ids.some(i=>st.metrics[i]&&!A.isStale(st.metrics[i],i)&&st.metrics[i].percent>=A.THRESHOLDS.LIMIT);
      if((r.status==='ok'||r.status==='partial')&&full)return retry('quota-plein',5);
    }
  }
  // 2. Retrouver l'onglet de la conversation (ou le rouvrir : action armée par l'utilisateur).
  let tab=null;try{tab=await api.tabs.get(job.tabId);}catch{}
  if(!tab||PL.conversationOf(tab.url)?.url!==job.url)tab=(await allTabs()).find(t=>PL.conversationOf(t.url)?.url===job.url)||null;
  if(!tab){
    const created=await api.tabs.create({url:job.url,active:true,pinned:false});
    const all=await resumeJobs();if(all[id]){all[id].tabId=created.id;await save(K.resume,all);}
    return retry('ouverture-onglet',1);
  }
  if(tab.status==='loading')return retry('chargement',1);
  try{await focus(tab);}catch{}
  let result;
  try{const f=await api.scripting.executeScript({target:{tabId:tab.id},func:injectResume,args:[job.message,job.platform]});result=f?.[0]?.result;}
  catch{result={status:'injection-failed'};}
  if(result?.status==='sent')return finish('envoyée');
  if(result?.status==='draft')return finish(RESUME_LABELS.draft);
  return retry(result?.status||'injection-failed',2);
}
async function restoreResumeAlarms(){
  const jobs=await resumeJobs();
  for(const id of Object.keys(jobs))if(!await api.alarms.get('ai-flow-resume:'+id))await api.alarms.create('ai-flow-resume:'+id,{when:Math.max(jobs[id].at,Date.now()+5000)});
}

/* ---------- Messages ---------- */
async function handle(message,sender){
  const origin=authorized(message,sender);
  const {op,payload}=message;
  switch(op){
    case 'openPage':return openPage(payload?.page,payload?.query);
    case 'openPlatform':return openPlatform(payload?.platform);
    case 'openUrl':return openUrl(String(payload?.url||''));
    case 'captureConversation':return captureConversation(origin==='page'?Number(payload?.tabId):sender.tab.id);
    case 'openAndInsert':return openAndInsert(payload?.platform,payload?.text,payload?.insert!==false);
    case 'connectionStatuses':return connectionStatuses();
    case 'refresh':return autoRefresh(PL.ids(),true);
    case 'autoRefresh':{
      const pids=origin==='page'?PL.ids():PL.forUrl(sender.url);
      return autoRefresh(pids);
    }
    case 'autoSet':return autoSet(payload?.platform,payload?.enabled===true);
    case 'resumeArm':return resumeArm(payload,sender);
    case 'resumeCancel':return resumeCancel(String(payload?.id||''));
    case 'awakeStatus':return awakeStatus();
    case 'awakeTest':return awakeTest();
    case 'clearHistory':await save(K.history,null);return true;
    case 'devInfo':return devInfo();
    case 'devCheckUpdate':return devCheckUpdate();
    case 'reload':setTimeout(()=>api.runtime.reload(),150);return true;
    case 'exportData':return exportData();
    case 'importData':return importData(payload);
    case 'clear':{
      await api.storage.local.set({[K.diag]:{},[K.notify]:null,[ACCOUNT_KEY]:{}});
      await write('clear');await badge();return true;
    }
    case 'settings':{
      const {value}=await write('settings',payload);
      if(payload&&('awakeEnabled' in payload||'awakeMode' in payload))await syncKeepAwake(true);
      await badge();return value;
    }
    case 'position':return (await write('position',payload)).value;
    case 'clearPlatform':await write('clearPlatform',payload);await badge();return true;
    default:throw Error('Commande inconnue');
  }
}
const DIRECT_OPS=new Set(['devInfo','devCheckUpdate','reload','exportData','openPlatform','openUrl','connectionStatuses','awakeStatus','captureConversation','openAndInsert']);
api.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='AI_FLOW')return false;
  // Ouvertures d'onglets et lectures : immédiates, sans attendre la file des écritures.
  const run=DIRECT_OPS.has(message.op)?handle(message,sender):serial(()=>handle(message,sender));
  run.then(value=>reply({ok:true,value}),error=>reply({ok:false,error:error?.message||String(error)}));
  return true;
});
api.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name===ALARM)serial(async()=>{await autoRefresh(PL.ids());await syncKeepAwake();await badge();await catchUp();});
  else if(alarm.name.startsWith('ai-flow-resume:'))serial(()=>fireResume(alarm.name.slice('ai-flow-resume:'.length)));
});
api.notifications?.onClicked?.addListener(id=>{const pid=id.split(':')[1];if(PL.get(pid))serial(()=>openPlatform(pid));});
async function install(){
  // Un alarme existante n'est jamais repoussée (le service worker se réveille souvent).
  const alarm=await api.alarms.get(ALARM);
  if(!alarm||alarm.periodInMinutes!==ALARM_MINUTES)await api.alarms.create(ALARM,{periodInMinutes:ALARM_MINUTES});
  await restoreResumeAlarms();await syncKeepAwake();await badge();
}
api.runtime.onInstalled.addListener(()=>serial(async()=>{
  // Migration 0.8.0 : suppression des anciens suivis (rechargeaient des onglets) et clés obsolètes.
  try{await api.storage.local.remove(['ai_flow_trackers_v3','ai_flow_alerts_v3','ai_flow_claude_org_v1','ai_flow_native_status']);}catch{}
  const s=await A.getState();await api.storage.local.set({[A.KEY]:s});
  await install();
}));
// Rattrapage : une relance dont l'heure est passée (Mac endormi, Safari fermé) part dès que possible.
async function catchUp(){
  const now=Date.now();
  for(const [id,j] of Object.entries(await resumeJobs()))if(j.at<=now-2*60000)await fireResume(id);
}
api.runtime.onStartup?.addListener(()=>serial(async()=>{await install();await catchUp();}));
serial(install);
if(typeof globalThis.__AIFLOW_TEST__==='object')Object.assign(globalThis.__AIFLOW_TEST__,{desiredAwake,authorized,openPage,autoRefresh,refreshPlatform,handle,fireResume,catchUp,exportData,importData,devInfo,captureConversation,recordInterruptions});
