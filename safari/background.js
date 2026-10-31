/* Sole writer. Claude GET-only quota connector is opt-in; Codex uses visible official usage tabs. */
if(typeof importScripts==='function')importScripts('shared.js','usage-parser.js','claude-api.js','codex-api.js');
const A=globalThis.AIFlow,P=globalThis.AIFlowUsage,C=globalThis.AIFlowClaudeAPI,CD=globalThis.AIFlowCodexAPI,api=A.api;
const AUTO_KEY='ai_flow_auto_refresh_v1',AUTO_MIN_GAP=60000,ALARM_MINUTES=2;
const ALERT_KEY='ai_flow_alerts_v3',TRACKER_KEY='ai_flow_trackers_v3',DIAG_KEY='ai_flow_diagnostics_v1',CLAUDE_ORG_KEY='ai_flow_claude_org_v1';
let queue=Promise.resolve();
function serial(job){const result=queue.catch(()=>{}).then(job);queue=result.catch(()=>{});return result;}
async function write(op,payload){const state=await A.getState();const value=A.reduce(state,op,payload);await api.storage.local.set({[A.KEY]:state});return value;}
function authorized(message,sender){
  if(sender.id!==api.runtime.id||sender.frameId>0)throw Error('Origine non autorisée');
  const url=sender.url||'',extensionUI=['popup.html','options.html'].some(p=>url===api.runtime.getURL(p)||url.startsWith(api.runtime.getURL(p)+'?'));
  if(extensionUI&&!sender.tab)return; // Popup, options in non-tab contexts.
  if(extensionUI)return; // Options/dashboard tab, same extension origin.
  let site;try{site=new URL(url);}catch{throw Error('Origine non autorisée');}
  if(site.protocol!=='https:'||!['claude.ai','chatgpt.com','chat.openai.com'].includes(site.hostname)||!sender.tab)throw Error('Origine non autorisée');
  if(message.op==='openOptions'||message.op==='openDashboard')return;
  if(message.op==='position'&&message.payload?.provider===(site.hostname==='claude.ai'?'claude':'chatgpt'))return;
  const provider=P.providerFor(url);
  if(message.op==='metrics'&&provider&&Array.isArray(message.payload)&&message.payload.length<=8&&message.payload.every(m=>A.METRICS[m?.id]?.provider===provider&&m.source==='observed'))return;
  if(message.op==='connector'&&provider&&message.payload?.provider===provider)return;
  // Auto-refresh: a page may only ask for its own provider; throttled in autoRefresh().
  if(message.op==='autoRefresh'&&message.payload?.provider===(site.hostname==='claude.ai'?'claude':'codex'))return;
  // Scheduled resume: armed/cancelled only by an explicit click in the page widget.
  if(message.op==='resumeArm'||message.op==='resumeCancel')return;
  throw Error('Commande non autorisée depuis cette page');
}
async function trackers(){return (await api.storage.local.get(TRACKER_KEY))[TRACKER_KEY]||{};}
async function ownedTab(provider,record){if(!record?.tabId)return null;try{const tab=await api.tabs.get(record.tabId);return (P.providerFor(tab.url)===provider||(provider==='claude'&&/^https:\/\/claude\.ai(?:\/|$)/.test(tab.url||'')))?tab:null;}catch{return null;}}
// Connection UX is deliberately separate from quota verification. An open tab
// is NOT evidence of an authenticated user; only a fresh observed quota is.
const SIGN_IN_URLS={claude:'https://claude.ai/',codex:'https://chatgpt.com/'};
function providerTab(provider,tab){
  let u;try{u=new URL(tab?.url||'');}catch{return false;}
  return u.protocol==='https:'&&(provider==='claude'?u.hostname==='claude.ai':u.hostname==='chatgpt.com');
}
async function openProvider(provider){
  if(!Object.hasOwn(SIGN_IN_URLS,provider))throw Error('Plateforme inconnue');
  const all=await api.tabs.query({});
  const current=all.find(t=>providerTab(provider,t));
  if(current?.id!=null){
    // Never change the user's pinned/tab layout during a simple login visit.
    await api.tabs.update(current.id,{active:true});
    if(current.windowId!=null&&api.windows?.update)try{await api.windows.update(current.windowId,{focused:true});}catch{}
    return {opened:false,tabId:current.id};
  }
  const tab=await api.tabs.create({url:SIGN_IN_URLS[provider],active:true,pinned:false});
  return {opened:true,tabId:tab.id};
}
async function connectionStatuses(){
  const [state,all,records,diagnostics]=await Promise.all([
    A.getState(),api.tabs.query({}),trackers(),api.storage.local.get(DIAG_KEY)
  ]);
  const ds=diagnostics[DIAG_KEY]||{},out={};
  for(const provider of ['claude','codex']){
    const siteOpen=all.some(t=>providerTab(provider,t));
    const keyPrefix=provider+'.';
    const observed=Object.entries(state.metrics).filter(([id,m])=>id.startsWith(keyPrefix)&&m.source==='observed'&&!A.isStale(m,id));
    const d=ds[provider];
    // A page being open does not establish login, and an HTTP 403 from an
    // extension context is not conclusive evidence that the user signed out.
    const status=observed.length?'quota-confirmed':
      ['login','page-login'].includes(d?.status)?'signin-required':
      siteOpen?'site-open':'not-open';
    out[provider]={status,siteOpen,quotaCount:observed.length,tracking:!!records[provider],
      checkedAt:d?.checkedAt||null,diagnostic:d?.status||null};
  }
  return out;
}
async function saveDiagnostic(provider,result){
  // No raw responses, account names, tokens, cookies, URLs or org identifiers in diagnostics.
  const previous=(await api.storage.local.get(DIAG_KEY))[DIAG_KEY]||{};
  previous[provider]={status:result.status,stage:result.stage||'page',httpStatus:result.httpStatus||null,pageStatus:result.pageStatus||null,checkedAt:Date.now(),readings:result.readings?.length||0};
  await api.storage.local.set({[DIAG_KEY]:previous});
}
async function clearClaudeReadings(){
  const state=await A.getState();
  for(const id of Object.keys(state.metrics))if(id.startsWith('claude.')){delete state.metrics[id];delete state.history[id];}
  await api.storage.local.set({[A.KEY]:state,[ALERT_KEY]:{}});
}
function isGoodClaudeRead(result){return result?.status==='ok'||result?.status==='partial';}
async function pageContextClaudeRead(tab){
  if(!tab?.id||!/^https:\/\/claude\.ai(?:\/|$)/.test(tab.url||''))return {status:'no-tab',stage:'page-context'};
  if(!api.scripting?.executeScript)return {status:'scripting-unavailable',stage:'page-context'};
  try{
    const frames=await api.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:C.readInPage});
    const value=frames?.find(item=>item.frameId===0)?.result||frames?.[0]?.result;
    if(!value||typeof value!=='object')return {status:'no-result',stage:'page-context'};
    const safe=Array.isArray(value.readings)?value.readings.filter(m=>A.METRICS[m?.id]?.provider==='claude'&&m?.source==='observed'&&Number.isFinite(m.percent)&&m.percent>=0&&m.percent<=100).slice(0,4):[];
    if(isGoodClaudeRead(value)&&(!safe.length||!C.findOrganization([{uuid:value.orgId,capabilities:['chat']}]))){
      return {status:'invalid-result',stage:'page-context'};
    }
    return {...value,readings:safe,stage:'page-context'};
  }catch{return {status:'injection-failed',stage:'page-context'};}
}
async function existingClaudeTab(){
  let tabs=[];try{tabs=await api.tabs.query({});}catch{}
  const candidates=tabs.filter(t=>/^https:\/\/claude\.ai(?:\/|$)/.test(t.url||''));
  return candidates.find(t=>P.providerFor(t.url)==='claude'&&t.status==='complete')||candidates.find(t=>t.status==='complete')||candidates[0]||null;
}
async function readClaudeWithFallback(){
  // Safari often refuses first-party cookies to extension background pages.
  // Prefer a same-origin tab, without reading conversations or stored cookies.
  const tab=await existingClaudeTab();
  let pageResult=null;
  if(tab){pageResult=await pageContextClaudeRead(tab);if(isGoodClaudeRead(pageResult))return pageResult;}
  const backgroundResult=await C.read();
  if(isGoodClaudeRead(backgroundResult))return backgroundResult;
  if(pageResult&&pageResult.status!=='scripting-unavailable'&&pageResult.status!=='no-tab'){
    // Keep both failure stages identifiable, never overwrite a 403 with a
    // generic 'en attente' without explaining the result.
    return {...backgroundResult,pageStatus:pageResult.status,pageHttpStatus:pageResult.httpStatus||null};
  }
  return backgroundResult;
}
async function refreshCodexViaTab(){
  let tabs=[];try{tabs=await api.tabs.query({});}catch{}
  const tab=existingCodexTab(tabs);
  if(!tab?.id)return {status:'no-tab',stage:'codex-page'};
  if(!api.scripting?.executeScript)return {status:'scripting-unavailable',stage:'codex-page'};
  try{
    const frames=await api.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:CD.readInPage});
    const result=frames?.find(x=>x.frameId===0)?.result||frames?.[0]?.result;
    if(!result||typeof result!=='object')return {status:'no-result',stage:'codex-page'};
    const readings=Array.isArray(result.readings)?result.readings.filter(m=>A.METRICS[m?.id]?.provider==='codex'&&
      m.source==='observed'&&Number.isFinite(m.percent)&&m.percent>=0&&m.percent<=100).slice(0,3):[];
    if(isGoodClaudeRead(result)&&!readings.length)return {status:'invalid-result',stage:'codex-page'};
    return {...result,readings};
  }catch{return {status:'injection-failed',stage:'codex-page'};}
}
function existingCodexTab(tabs){
  return tabs.find(t=>/^https:\/\/chatgpt\.com(?:\/|$)/.test(t.url||'')&&t.status==='complete')||
    tabs.find(t=>/^https:\/\/chatgpt\.com(?:\/|$)/.test(t.url||''))||null;
}
// Automatic refresh without any click. Only reuses tabs the user already has
// open (never opens or reloads a tab), is throttled per provider, and respects
// an explicit "Arrêter" from the dashboard.
async function autoRefresh(providers,force=false){
  const saved=(await api.storage.local.get(AUTO_KEY))[AUTO_KEY]||{};
  const last=saved.last||{},disabled=saved.disabled||{},now=Date.now(),todo=[];
  for(const p of providers){
    if(disabled[p])continue;
    if(!force&&now-(last[p]||0)<AUTO_MIN_GAP)continue;
    last[p]=now;todo.push(p);
  }
  if(!todo.length)return {skipped:true};
  await api.storage.local.set({[AUTO_KEY]:{...saved,last}});
  let tabs=[];try{tabs=await api.tabs.query({});}catch{}
  const out={};
  for(const p of todo){
    if(p==='claude'){
      if(!tabs.some(t=>/^https:\/\/claude\.ai(?:\/|$)/.test(t.url||'')))continue;
      out.claude=await refreshClaude();
    }else if(p==='codex'){
      if(!existingCodexTab(tabs))continue;
      const r=await refreshCodex();out.codex={status:r.status,readings:r.readings?.length||0};
    }
  }
  return out;
}
async function setAutoDisabled(provider,value){
  const saved=(await api.storage.local.get(AUTO_KEY))[AUTO_KEY]||{};
  const disabled={...(saved.disabled||{})};if(value)disabled[provider]=true;else delete disabled[provider];
  await api.storage.local.set({[AUTO_KEY]:{...saved,disabled}});
}
async function refreshCodex(){
  const result=await refreshCodexViaTab();await saveDiagnostic('codex',result);
  if(isGoodClaudeRead(result)){
    await write('metrics',result.readings);
    await write('connector',{provider:'codex',status:result.status==='ok'?'observed':'partial'});
    await refresh();await syncMenu();
  }else{
    await write('connector',{provider:'codex',status:'unavailable'});
  }
  return result;
}
async function refreshClaude(){
  const result=await readClaudeWithFallback();
  await saveDiagnostic('claude',result);
  if(result.status==='ok'||result.status==='partial'){
    const prev=(await api.storage.local.get(CLAUDE_ORG_KEY))[CLAUDE_ORG_KEY];
    if(prev&&prev!==result.orgId)await clearClaudeReadings();
    await api.storage.local.set({[CLAUDE_ORG_KEY]:result.orgId});
    await write('metrics',result.readings);
    await write('connector',{provider:'claude',status:result.status==='ok'?'observed':'partial'});
    await refresh();await syncMenu();
  }else{
    // Never keep a seemingly current percentage from another account or an inaccessible API.
    // The UI can show 'Indisponible' until a subsequent real sample arrives.
    // A failed API cannot validate previously observed readings. Preserve
    // manual entries, but do not present stale API readings as newly current.
    const state=await A.getState();let removed=false;
    for(const id of Object.keys(state.metrics))if(id.startsWith('claude.')&&state.metrics[id].source==='observed'){
      // An observed sample is still valid until its normal 15-minute TTL;
      // do not delete it solely because a one-off API request fails.
      if(A.isStale(state.metrics[id],id)){delete state.metrics[id];removed=true;}
    }
    if(removed)await api.storage.local.set({[A.KEY]:state});
    if(result.status==='login'||result.status==='org-ambiguous'||result.status==='no-figures')await api.storage.local.set({[CLAUDE_ORG_KEY]:null});
    const reason=result.status==='login'?'login':result.status==='no-figures'?'unavailable':result.status==='org-ambiguous'?'unavailable':'error';
    await write('connector',{provider:'claude',status:reason});
  }
  return {status:result.status,readings:result.readings?.length||0,httpStatus:result.httpStatus||null};
}
async function openClaudePageFallback(result){
  // A 403 in Safari may mean the extension origin is blocked even while the
  // user is signed in. Reuse the user's existing official page if possible.
  const records=await trackers();
  let allTabs=[];try{allTabs=await api.tabs.query({});}catch{}
  let tab=allTabs.find(t=>P.providerFor(t.url)==='claude');
  const createdByExtension=!tab;
  if(!tab)tab=await api.tabs.create({url:A.USAGE_URLS.claude,active:true,pinned:false});
  else if(tab.pinned)tab=await api.tabs.update(tab.id,{pinned:false});
  records.claude={mode:'page',enabled:true,tabId:tab.id,createdByExtension};
  await api.storage.local.set({[TRACKER_KEY]:records});
  await write('connector',{provider:'claude',status:'waiting'});
  await saveDiagnostic('claude',{status:'page-waiting',stage:'page',httpStatus:result.httpStatus,readings:[]});
  // If the page is already open, request a read. A new tab's content script
  // will scan after its page has finished loading.
  if(!createdByExtension)try{await api.tabs.sendMessage(tab.id,{type:'AI_FLOW_SCAN'});}catch{}
  // The fallback will not silently remain 'waiting' after a redirect; tabs.onUpdated handles it.
  return {status:'page',tabId:tab.id};
}
async function startTracker(provider){
  if(!Object.hasOwn(A.USAGE_URLS,provider))throw Error('Plateforme inconnue');
  await setAutoDisabled(provider,false);
  const records=await trackers();
  if(provider==='claude'){
    // Only one explicit activation; don't retry an API that Safari consistently
    // rejects on every poll. The official usage page can be read in place.
    const previous=records.claude;
    if(previous?.mode==='page'){
      const tab=await ownedTab('claude',previous);
      if(tab){
        if(tab.pinned)await api.tabs.update(tab.id,{pinned:false});
        const result=await refreshClaude();
        if(isGoodClaudeRead(result))return result;
        await api.tabs.sendMessage(tab.id,{type:'AI_FLOW_SCAN'}).catch(()=>{});
        return {status:'page',tabId:tab.id};
      }
    }
    records.claude={mode:'api',enabled:true};await api.storage.local.set({[TRACKER_KEY]:records});
    await write('connector',{provider:'claude',status:'waiting'});
    const result=await refreshClaude();
    if(['login','network','http','timeout','invalid-json','rate-limit','no-figures','org-ambiguous'].includes(result.status)){
      return openClaudePageFallback(result);
    }
    return result;
  }
  // ChatGPT/Codex: prefer quota JSON read inside the already signed-in tab.
  // Only user-initiated activation triggers the first call to its session API.
  if(provider==='codex'){
    const read=await refreshCodex();
    if(isGoodClaudeRead(read)){
      records.codex={mode:'api',enabled:true};await api.storage.local.set({[TRACKER_KEY]:records});
      return {status:read.status,readings:read.readings.length};
    }
  }
  const existing=await ownedTab(provider,records[provider]);
  if(existing){if(existing.pinned)await api.tabs.update(existing.id,{pinned:false});return {tabId:existing.id};}
  // A normal, full-size tab: never pin a tracking tab. Prefer an already open
  // official usage page and never close a user-owned tab on Stop.
  let allTabs=[];try{allTabs=await api.tabs.query({});}catch{}
  const existingOfficial=allTabs.find(t=>P.providerFor(t.url)===provider);
  const tab=existingOfficial||await api.tabs.create({url:A.USAGE_URLS[provider],active:true,pinned:false});
  records[provider]={mode:"page",tabId:tab.id,createdByExtension:!existingOfficial};await api.storage.local.set({[TRACKER_KEY]:records});
  await write('connector',{provider,status:'waiting'});return {tabId:tab.id};
}
async function stopTracker(provider){
  if(!Object.hasOwn(A.USAGE_URLS,provider))throw Error('Plateforme inconnue');
  await setAutoDisabled(provider,true);
  const records=await trackers(),entry=records[provider],tab=await ownedTab(provider,entry);delete records[provider];await api.storage.local.set({[TRACKER_KEY]:records});
  if(tab?.pinned)await api.tabs.update(tab.id,{pinned:false});
  if(tab&&entry?.createdByExtension===true)await api.tabs.remove(tab.id);
  await write('connector',{provider,status:'stopped'});return true;
}
async function pollTrackers(){
  const records=await trackers();let changed=false;
  for(const [provider,record] of Object.entries(records)){
    if(provider==='claude'&&record.mode==='api'&&record.enabled){await refreshClaude();continue;}
    if(provider==='codex'&&record.mode==='api'&&record.enabled){await refreshCodex();continue;}
    if(provider==='claude'&&record.mode==='page'){
      const result=await refreshClaude();if(isGoodClaudeRead(result))continue;
    }
    if(provider==='codex'&&record.mode==='page'){
      const result=await refreshCodex();if(isGoodClaudeRead(result))continue;
    }
    const tab=await ownedTab(provider,record);
    if(!tab){delete records[provider];changed=true;await write('connector',{provider,status:'stopped'});continue;}
    if(tab.pinned)try{await api.tabs.update(tab.id,{pinned:false});}catch{}
    try{
      if(!tab.active&&tab.status!=='loading')await api.tabs.reload(tab.id);
      else await api.tabs.sendMessage(tab.id,{type:'AI_FLOW_SCAN'});
    }catch{await write('connector',{provider,status:'error'});}
  }
  if(changed)await api.storage.local.set({[TRACKER_KEY]:records});
}
async function syncMenu(forceClear=false){
  if(!api.runtime.getManifest?.().permissions?.includes('nativeMessaging'))return;
  const state=await A.getState();
  if(!state.settings.nativeMenuEnabled&&!forceClear)return;
  try{
    const reply=await api.runtime.sendNativeMessage('ai.flow',{type:'AI_FLOW_SNAPSHOT',snapshot:A.menuSnapshot(forceClear?A.defaults():state)});
    if(!reply?.ok)throw Error('Application Mac non configurée');
    await api.storage.local.set({ai_flow_native_status:{ok:true,at:Date.now(),cleared:forceClear}});
  }catch{await api.storage.local.set({ai_flow_native_status:{ok:false,at:Date.now(),cleared:false}});}
}
async function refresh(){
  const state=await A.getState(),now=Date.now();
  const records=Object.entries(state.metrics).filter(([id,m])=>!A.isStale(m,id,now));
  const levels=records.map(([id,m])=>A.level(m,id,now,state.settings));
  const critical=levels.includes('critical'),warning=levels.includes('warning');
  try{await api.action?.setBadgeText({text:critical?'95+':warning?'80+':''});if(critical||warning)await api.action?.setBadgeBackgroundColor({color:critical?'#B56A63':'#C09A60'});}catch{}
  const sent=(await api.storage.local.get(ALERT_KEY))[ALERT_KEY]||{};let changed=false;
  let allowed=false;
  if(state.settings.systemAlerts&&api.notifications?.create){try{allowed=await api.permissions.contains({permissions:['notifications']});}catch{}}
  for(const [id,m] of records){
    const old=sent[id];
    const newWindow=old&&((old.resetAt&&old.resetAt<=now)||(old.resetAt&&m.resetAt&&Math.abs(old.resetAt-m.resetAt)>120000)||m.percent<80);
    if(newWindow){delete sent[id];changed=true;}
    const previous=sent[id];
    const threshold=m.percent>=95&&state.settings.alertAt95?95:m.percent>=80&&state.settings.alertAt80?80:0;
    if(!allowed||!threshold||now-m.observedAt>10*60000||(previous&&previous.threshold>=threshold&&now-previous.ts<7*86400000))continue;
    try{
      await api.notifications.create(`ai-flow:${id}`,{type:'basic',iconUrl:'icons/icon128.png',title:'AI Flow · Quota à surveiller',message:`${A.METRICS[id].label} : ${Math.round(m.percent)} % utilisés. ${m.source==='manual'?'Saisie manuelle. ':''}${threshold===95?'Limite proche.':'Prépare ta suite.'}`});
      sent[id]={threshold,ts:now,resetAt:m.resetAt};changed=true;
    }catch{/* Optional API; widget stays available. */}
  }
  if(changed)await api.storage.local.set({[ALERT_KEY]:sent});
}
// Toolbar click on Safari: a regular tab bypasses Safari's fixed-size popover.
// Reuse an existing dashboard where possible, without creating a duplicate tab on every click.
async function openDashboardTab(){
  const url=api.runtime.getURL('popup.html?view=full');
  try{
    const tabs=await api.tabs.query({});
    const existing=tabs.find(tab=>tab.url===url);
    if(existing?.id!=null){
      await api.tabs.update(existing.id,{active:true});
      if(existing.windowId!=null&&api.windows?.update){
        try{await api.windows.update(existing.windowId,{focused:true});}catch{/* Focusing a window is optional. */}
      }
      return existing;
    }
  }catch{/* Fall back to a fresh tab on Safari versions without query details. */}
  return api.tabs.create({url,active:true});
}
if(api.action?.onClicked?.addListener){
  api.action.onClicked.addListener(()=>{openDashboardTab().catch(e=>console.warn('AI Flow dashboard:',e.message));});
}
/* ---------- Relance programmée : activée par l'utilisateur, un seul envoi, annulable ---------- */
const RESUME_KEY='ai_flow_resume_v1',RESUME_LAST_KEY='ai_flow_resume_last_v1',RESUME_MAX_ATTEMPTS=12,RESUME_MAX_TEXT=2000;
const CONVERSATION_PATH={claude:/^\/chat\/[\w-]+\/?$/,chatgpt:/^\/(?:g\/[\w-]+\/)?c\/[\w-]+\/?$/};
function conversationOf(url){
  let u;try{u=new URL(url||'');}catch{return null;}
  if(u.protocol!=='https:')return null;
  const provider=u.hostname==='claude.ai'?'claude':u.hostname==='chatgpt.com'?'chatgpt':null;
  if(!provider||!CONVERSATION_PATH[provider].test(u.pathname))return null;
  return {provider,url:u.origin+u.pathname.replace(/\/$/,'')};
}
async function resumeJobs(){return (await api.storage.local.get(RESUME_KEY))[RESUME_KEY]||{};}
async function saveResumeJobs(jobs){await api.storage.local.set({[RESUME_KEY]:jobs});}
function hasNative(){return !!api.runtime.getManifest?.().permissions?.includes('nativeMessaging');}
async function nativeSend(message){
  if(!hasNative())return false;
  try{const reply=await api.runtime.sendNativeMessage('ai.flow',message);return !!reply?.ok;}catch{return false;}
}
// Asks the AI Flow Mac app to prevent idle sleep until the latest armed resume (+15 min).
async function syncKeepAwake(jobs){
  const times=Object.values(jobs).filter(j=>j.keepAwake).map(j=>j.at);
  return nativeSend({type:'AI_FLOW_KEEP_AWAKE',until:times.length?Math.max(...times)+15*60000:0});
}
async function resumeArm(payload,sender){
  const conv=conversationOf(sender.url);
  if(!conv||sender.tab?.id==null)throw Error('Ouvre la conversation à relancer, puis réessaie.');
  const text=typeof payload?.message==='string'?payload.message.trim():'';
  if(!text||text.length>RESUME_MAX_TEXT)throw Error('Message de relance vide ou trop long.');
  const at=Number(payload?.at),now=Date.now();
  if(!Number.isFinite(at)||at<now+30000||at>now+8*86400000)throw Error('Heure de relance invalide.');
  const jobs=await resumeJobs();
  for(const [k,j] of Object.entries(jobs))if(j.url===conv.url){delete jobs[k];try{await api.alarms.clear('ai-flow-resume:'+k);}catch{}}
  const id=String(now);
  jobs[id]={id,provider:conv.provider,url:conv.url,tabId:sender.tab.id,message:text,at,keepAwake:!!payload.keepAwake,attempts:0,status:'armed',armedAt:now};
  await saveResumeJobs(jobs);
  await api.alarms.create('ai-flow-resume:'+id,{when:at});
  if(jobs[id].keepAwake){jobs[id].awakeOk=await syncKeepAwake(jobs);await saveResumeJobs(jobs);}
  return {id,at,awakeOk:jobs[id].awakeOk??null};
}
async function resumeCancel(id){
  const jobs=await resumeJobs();if(!jobs[id])return false;
  delete jobs[id];await saveResumeJobs(jobs);
  try{await api.alarms.clear('ai-flow-resume:'+id);}catch{}
  await syncKeepAwake(jobs);return true;
}
// Self-contained: injected into the conversation tab. Never overwrites a draft.
async function injectResume(text,provider){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const pick=list=>{for(const s of list){const el=document.querySelector(s);if(el)return el;}return null;};
  const composer=provider==='claude'
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
  const sendSel=provider==='claude'
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
  const finish=async(status)=>{
    const all=await resumeJobs();delete all[id];await saveResumeJobs(all);await syncKeepAwake(all);
    await api.storage.local.set({[RESUME_LAST_KEY]:{url:job.url,status,at:Date.now()}});
    await nativeSend({type:'AI_FLOW_NOTIFY',title:'AI Flow · Relance '+(status==='envoyée'?'envoyée':'non envoyée'),body:(job.provider==='claude'?'Claude':'ChatGPT')+' : '+status});
  };
  const retry=async(status,minutes)=>{
    const all=await resumeJobs(),j=all[id];if(!j)return;
    j.attempts=(j.attempts||0)+1;j.status=RESUME_LABELS[status]||status;
    if(j.attempts>=RESUME_MAX_ATTEMPTS)return finish('abandonnée ('+j.status+')');
    j.at=Date.now()+minutes*60000;await saveResumeJobs(all);
    await api.alarms.create('ai-flow-resume:'+id,{when:j.at});
    if(j.keepAwake)await syncKeepAwake(all);
  };
  // 1. Is the session really open again? Claude exposes a reliable counter; ChatGPT does not.
  if(job.provider==='claude'){
    const r=await refreshClaude();
    const s=(await A.getState()).metrics['claude.session'];
    if(isGoodClaudeRead(r)&&s&&s.percent>=99.5)return retry('quota-plein',5);
  }
  // 2. Find the conversation tab (IDs change after a restart), or reopen it.
  let tab=null;try{tab=await api.tabs.get(job.tabId);}catch{}
  if(!tab||conversationOf(tab.url)?.url!==job.url){
    let all=[];try{all=await api.tabs.query({});}catch{}
    tab=all.find(t=>conversationOf(t.url)?.url===job.url)||null;
  }
  if(!tab){
    const created=await api.tabs.create({url:job.url,active:true});
    const all=await resumeJobs();if(all[id]){all[id].tabId=created.id;await saveResumeJobs(all);}
    return retry('ouverture-onglet',1);
  }
  if(tab.status==='loading')return retry('chargement',1);
  try{await api.tabs.update(tab.id,{active:true});if(tab.windowId!=null&&api.windows?.update)await api.windows.update(tab.windowId,{focused:true});}catch{}
  // 3. Send once.
  let result;
  try{const frames=await api.scripting.executeScript({target:{tabId:tab.id},func:injectResume,args:[job.message,job.provider]});result=frames?.[0]?.result;}
  catch{result={status:'injection-failed'};}
  if(result?.status==='sent')return finish('envoyée');
  if(result?.status==='draft')return finish(RESUME_LABELS.draft);
  return retry(result?.status||'injection-failed',2);
}
async function restoreResumeAlarms(){
  const jobs=await resumeJobs();
  for(const id of Object.keys(jobs))if(!await api.alarms.get('ai-flow-resume:'+id))await api.alarms.create('ai-flow-resume:'+id,{when:Math.max(jobs[id].at,Date.now()+5000)});
  if(Object.keys(jobs).length)await syncKeepAwake(jobs);
}
async function handle(message,sender){
  authorized(message,sender);
  const {op,payload}=message;
  if(op==='openOptions'){await api.runtime.openOptionsPage();return true;}
  if(op==='openDashboard'){await openDashboardTab();return true;}
  if(op==='openProvider')return openProvider(payload?.provider);
  if(op==='connectionStatuses')return connectionStatuses();
  if(op==='trackerStart')return startTracker(payload?.provider);
  if(op==='trackerStop')return stopTracker(payload?.provider);
  if(op==='trackerStatus')return trackers();
  if(op==='diagnostics')return (await api.storage.local.get(DIAG_KEY))[DIAG_KEY]||{};
  if(op==='refresh'){await pollTrackers();await autoRefresh(['claude','codex'],true);return true;}
  if(op==='autoRefresh'){const p=payload?.provider;return autoRefresh(p?[p]:['claude','codex']);}
  if(op==='resumeArm')return resumeArm(payload,sender);
  if(op==='resumeCancel')return resumeCancel(String(payload?.id||''));
  if(op==='clear')await api.storage.local.set({[ALERT_KEY]:{},[DIAG_KEY]:{},[CLAUDE_ORG_KEY]:null});
  const value=await write(op,payload);
  const senderIsClaudeUsage=sender.tab&&P.providerFor(sender.url)==='claude';
  const records=await trackers();
  if(senderIsClaudeUsage&&records.claude?.mode==='page'&&records.claude.tabId===sender.tab.id){
    if(op==='metrics')await saveDiagnostic('claude',{status:'page-ok',stage:'page',readings:payload});
    else if(op==='connector'&&['unavailable','login','partial'].includes(payload?.status)){
      await saveDiagnostic('claude',{status:payload.status==='login'?'page-login':'page-empty',stage:'page',readings:[]});
    }
  }
  if(['metrics','settings','clear'].includes(op))await syncMenu(op==='clear'||(op==='settings'&&payload?.nativeMenuEnabled===false));if(op==='metrics'||op==='settings'||op==='clear')await refresh();return value;
}
api.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='AI_FLOW')return false;
  serial(()=>handle(message,sender)).then(value=>reply({ok:true,value}),error=>reply({ok:false,error:error.message}));return true;
});
api.alarms.onAlarm.addListener(alarm=>alarm.name==='ai-flow-refresh'?serial(async()=>{
  await pollTrackers();
  // Providers without an explicit tracker are refreshed from any open tab.
  const records=await trackers();
  await autoRefresh(['claude','codex'].filter(p=>!records[p]));
  await refresh();
}):undefined);
api.alarms.onAlarm.addListener(alarm=>{if(alarm.name.startsWith('ai-flow-resume:'))serial(()=>fireResume(alarm.name.slice('ai-flow-resume:'.length)));});
api.tabs.onUpdated?.addListener((tabId,change,tab)=>{
  if(change.status!=='complete')return;
  serial(async()=>{
    const records=await trackers();
    if(records.codex?.mode==='page'&&records.codex.tabId===tabId){
      if(/^https:\/\/chatgpt\.com(?:\/|$)/.test(tab?.url||'')){
        const result=await refreshCodex();
        if(!isGoodClaudeRead(result))try{await api.tabs.sendMessage(tabId,{type:'AI_FLOW_SCAN'});}catch{}
      }
      return;
    }
    const record=records.claude;
    if(record?.mode!=='page'||record.tabId!==tabId)return;
    if(!/^https:\/\/claude\.ai(?:\/|$)/.test(tab?.url||'')){
      await saveDiagnostic('claude',{status:'page-redirect',stage:'page',readings:[]});
      return;
    }
    // The freshly loaded fallback tab now has a first-party session. Retry
    // inside that tab immediately instead of waiting for the next 5-min alarm.
    const result=await refreshClaude();
    if(isGoodClaudeRead(result))return;
    if(P.providerFor(tab.url)!=='claude'){
      await saveDiagnostic('claude',{status:'page-redirect',stage:'page',pageStatus:result.pageStatus,readings:[]});
      await write('connector',{provider:'claude',status:'unavailable'});
    }else{
      try{await api.tabs.sendMessage(tabId,{type:'AI_FLOW_SCAN'});}catch{
        await saveDiagnostic('claude',{status:'page-script-unavailable',stage:'page',readings:[]});
      }
    }
  }).catch(()=>{});
});
api.tabs.onRemoved.addListener(tabId=>serial(async()=>{
  const records=await trackers();let changed=false;
  for(const [provider,record] of Object.entries(records)){if(record.tabId===tabId){delete records[provider];changed=true;await write('connector',{provider,status:'stopped'});}}
  if(changed)await api.storage.local.set({[TRACKER_KEY]:records});
}));
async function install(){
  // Workers wake for each message: replacing an existing alarm would postpone it forever.
  // Recreate only if missing or on an old period (one-time migration from 5 min).
  const alarm=await api.alarms.get('ai-flow-refresh');
  if(!alarm||alarm.periodInMinutes!==ALARM_MINUTES)await api.alarms.create('ai-flow-refresh',{periodInMinutes:ALARM_MINUTES});
  await restoreResumeAlarms();
  await refresh();await syncMenu();
}
api.runtime.onInstalled.addListener(()=>serial(install));
api.runtime.onStartup?.addListener(()=>serial(async()=>{
  // Never adopt a potentially reused tab ID after a browser restart.
  const records=await trackers();
  // Safari tab IDs do not survive reliably across restarts; stop tracking
  // stale page tabs rather than accidentally taking over the wrong tab.
  const persistent={};
  for(const provider of ['claude','codex'])if(records[provider]?.mode==='api'&&records[provider].enabled)persistent[provider]={mode:'api',enabled:true};
  await api.storage.local.set({[TRACKER_KEY]:persistent});
  for(const provider of Object.keys(records))if(provider!=='claude'||records[provider]?.mode==='page')await write('connector',{provider,status:'paused'});
  await install();
}));
api.notifications?.onClicked?.addListener(id=>{const metric=id.replace(/^ai-flow:/,'');const provider=A.METRICS[metric]?.provider;if(provider)api.tabs.create({url:A.USAGE_URLS[provider]||'https://chatgpt.com/'});});
serial(install);
