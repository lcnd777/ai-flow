const test=require('node:test'),assert=require('node:assert/strict');
const {fakeBrowser,load,runReader}=require('./helpers.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
const ORG='0b2c6c1e-1234-4abc-8def-001122334455';
const future=h=>new Date(Date.now()+h*3600000).toISOString();

function setup(opts={}){
  let codex=opts.codex||{used5:10,usedW:22};
  let usage=opts.usage||{five_hour:{utilization:30,resets_at:future(2)},seven_day:{utilization:20,resets_at:future(70)}};
  let org=ORG,status=200;
  const fb=fakeBrowser({...opts,inject:async(tab,func,args)=>{
    if(args)return {status:'sent'};
    const host=new URL(tab.url).hostname;
    return (await runReader(ctx,func,host,url=>{
      if(status!==200)return {status};
      if(url.endsWith('/api/organizations'))return {body:[{uuid:org,capabilities:['chat']}]};
      if(url.endsWith('/api/auth/session'))return {body:{accessToken:'tok'}};
      if(url.includes('/api/organizations/'))return {body:usage};
      if(url.endsWith('/wham/usage'))return {body:{rate_limit:{primary_window:{limit_window_seconds:18000,used_percent:codex.used5},secondary_window:{limit_window_seconds:604800,used_percent:codex.usedW}}}};
    })).result;
  }});
  const ctx=load(['platforms.js','shared.js','readers.js','background.js'],{browser:fb.browser,__AIFLOW_TEST__:{}});
  const page={id:'ext',url:'chrome-extension://ext/popup.html',frameId:0};
  const call=(op,payload,sender=page)=>fb.send({type:'AI_FLOW',op,payload},sender);
  return {fb,ctx,T:ctx.__AIFLOW_TEST__,A:ctx.AIFlow,call,page,
    setUsage:u=>{usage=u;},setCodex:c=>{codex=c;},setOrg:o=>{org=o;},setStatus:s=>{status=s;}};
}
const site=(fb,url)=>{const t=fb.addTab(url);return {id:'ext',url,frameId:0,tab:{id:t.id}};};

test('Paramètres / Tableau de bord : onglet normal, non épinglé, réutilisé',async()=>{
  const {fb,call}=setup();
  const r1=await call('openPage',{page:'options'});
  assert.equal(r1.ok,true);
  assert.equal(fb.created.length,1);assert.equal(fb.created[0].pinned,false);assert.equal(fb.created[0].active,true);
  assert.equal(fb.created[0].url,'chrome-extension://ext/options.html');
  await call('openPage',{page:'options'});
  assert.equal(fb.created.length,1,'onglet existant réutilisé');
  await call('openPage',{page:'dashboard'});
  assert.equal(fb.created.at(-1).url,'chrome-extension://ext/dashboard.html');
  assert.equal((await call('openPage',{page:'../evil'})).ok,false);
});
test('Origine : un site ne peut ni effacer ni changer les réglages',async()=>{
  const {fb,call}=setup();
  const s=site(fb,'https://claude.ai/chat/abc');
  assert.equal((await call('clear',null,s)).ok,false);
  assert.equal((await call('settings',{awakeMode:'stay'},s)).ok,false);
  assert.equal((await call('openPage',{page:'transfer'},s)).ok,true);
  const evil={id:'ext',url:'https://evil.example/',frameId:0,tab:{id:99}};
  assert.equal((await call('openPage',{page:'options'},evil)).ok,false);
  assert.equal((await call('settings',{focusMode:false},{...s,frameId:3})).ok,false,'iframe refusée');
});
test('Actualisation auto : aucun onglet ouvert ni rechargé',async()=>{
  const {fb,call}=setup();
  const r=await call('refresh');
  assert.equal(r.ok,true);
  assert.equal(fb.created.length,0);assert.equal(fb.reloaded.length,0);
});
test('Actualisation auto : quotas lus dans l’onglet ouvert, popup = widget (même stockage)',async()=>{
  const {fb,call,A}=setup();
  fb.addTab('https://claude.ai/chat/abc',{active:true});
  fb.addTab('https://chatgpt.com/c/xyz');
  await call('refresh');
  const s=A.clean(fb.store[A.KEY]);
  assert.equal(s.metrics['claude.session'].percent,30);
  assert.equal(s.metrics['codex.weekly'].percent,22);
  assert.equal(fb.store[A.KEYS.diag].claude.status,'ok');
  assert.equal(fb.reloaded.length,0);assert.equal(fb.created.length,0);
  assert.ok(!JSON.stringify(fb.store).includes('tok'),'aucun jeton stocké');
});
test('Changement de compte Claude : anciens relevés effacés',async()=>{
  const {fb,call,A,setOrg,setUsage}=setup();
  fb.addTab('https://claude.ai/new');
  await call('refresh');
  setOrg(ORG.replace('0b','9f'));setUsage({five_hour:{utilization:77}});
  await call('refresh');
  const s=A.clean(fb.store[A.KEY]);
  assert.equal(s.metrics['claude.session'].percent,77);
  assert.equal(s.metrics['claude.weekly'],undefined,'valeur de l’autre compte supprimée');
});
test('Déconnexion : relevés de la plateforme supprimés, diagnostic « login »',async()=>{
  const {fb,call,A,setStatus}=setup();
  fb.addTab('https://claude.ai/new');
  await call('refresh');setStatus(403);await call('refresh');
  assert.equal(Object.keys(A.clean(fb.store[A.KEY]).metrics).filter(k=>k.startsWith('claude')).length,0);
  assert.equal(fb.store[A.KEYS.diag].claude.status,'login');
});
test('Mise à jour auto désactivable par plateforme',async()=>{
  const {fb,call,A}=setup();
  fb.addTab('https://claude.ai/new');
  assert.equal((await call('autoSet',{platform:'claude',enabled:false})).ok,true);
  await call('refresh');
  assert.equal(fb.store[A.KEY],undefined);
  assert.equal((await call('autoSet',{platform:'gemini',enabled:false})).ok,false,'Gemini n’a pas de lecteur');
});
test('Notifications : limite atteinte → bannière widget + notification système si activée',async()=>{
  const {fb,call,A}=setup({notifications:true,usage:{five_hour:{utilization:100,resets_at:future(1)},seven_day:{utilization:40}}});
  fb.addTab('https://claude.ai/new');
  await call('settings',{systemNotifications:true});
  await call('refresh');
  assert.equal(fb.store[A.KEYS.toast].length,1);
  assert.match(fb.store[A.KEYS.toast][0].title,/limite atteinte/);
  assert.equal(fb.notifications.length,1);
  await call('refresh');
  assert.equal(fb.notifications.length,1,'pas de répétition');
});
test('Safari Mac : notification transmise à l’app AI Flow',async()=>{
  const {fb,call}=setup({native:true,nativeReply:()=>({ok:true,appInstalled:true,appRunning:true}),usage:{five_hour:{utilization:100},seven_day:{utilization:10}}});
  fb.addTab('https://claude.ai/new');
  await call('settings',{systemNotifications:true});
  await call('refresh');
  assert.ok(fb.native.some(m=>m.type==='AI_FLOW_NOTIFY'));
});
test('Awake : désactivé par défaut, borné à 12 h, +10 min de marge',()=>{
  const {T}=setup();
  const now=Date.now(),job={keepAwake:true,at:now+3600000};
  assert.equal(T.desiredAwake({a:job},{awakeMode:'catchup'},null,now),0);
  assert.equal(T.desiredAwake({a:job},{awakeMode:'stay'},null,now),job.at+600000);
  assert.equal(T.desiredAwake({a:{keepAwake:true,at:now+13*3600000}},{awakeMode:'stay'},null,now),0);
  assert.equal(T.desiredAwake({a:{...job,keepAwake:false}},{awakeMode:'stay'},null,now),0);
});
test('Awake : armement → demande à l’app, annulation → arrêt ; jamais lancé si désactivé',async()=>{
  const {fb,call}=setup({native:true,nativeReply:m=>({ok:true,appInstalled:true,appRunning:m.until>0})});
  const s=site(fb,'https://claude.ai/chat/abc');
  const at=Date.now()+3600000;
  let r=await call('resumeArm',{at,message:'Continue',keepAwake:true},s);
  assert.equal(r.ok,true);
  assert.equal(fb.native.filter(m=>m.type==='AI_FLOW_KEEP_AWAKE').length,0,'Awake désactivé : app non sollicitée');
  await call('settings',{awakeMode:'stay'});
  const sent=fb.native.filter(m=>m.type==='AI_FLOW_KEEP_AWAKE');
  assert.equal(sent.at(-1).until,at+600000);
  const st=await call('awakeStatus');
  assert.equal(st.value.until,at+600000);assert.equal(st.value.reachable,true);
  await call('resumeCancel',{id:r.value.id});
  assert.equal(fb.native.filter(m=>m.type==='AI_FLOW_KEEP_AWAKE').at(-1).until,0,'arrêt après annulation');
});
test('Awake : indisponible hors Safari (pas de nativeMessaging)',async()=>{
  const {call}=setup();
  await call('settings',{awakeMode:'stay'});
  const st=await call('awakeStatus');
  assert.equal(st.value.supported,false);
  assert.equal((await call('awakeTest')).ok,false);
});
test('Relance : uniquement depuis une conversation, message borné',async()=>{
  const {fb,call}=setup();
  assert.equal((await call('resumeArm',{at:Date.now()+3600000,message:'x'},site(fb,'https://claude.ai/new'))).ok,false);
  assert.equal((await call('resumeArm',{at:Date.now()+3600000,message:'x'.repeat(2001)},site(fb,'https://claude.ai/chat/a'))).ok,false);
  assert.equal((await call('resumeArm',{at:Date.now()+1000,message:'x'},site(fb,'https://claude.ai/chat/a'))).ok,false);
  assert.equal((await call('resumeArm',{at:Date.now()+3600000,message:'x'},site(fb,'https://chatgpt.com/codex'))).ok,false,'page Codex sans tâche : refusée');
  assert.equal((await call('resumeArm',{at:Date.now()+3600000,message:'x'},site(fb,'https://chatgpt.com/codex/tasks/task_e_1'))).ok,true,'tâche Codex : acceptée');
});
test('Safari sans app Mac : un appel natif sans réponse ne bloque plus rien',async()=>{
  const {call,fb,A}=setup({native:true,nativeReply:()=>new Promise(()=>{})});
  await call('settings',{awakeMode:'stay'});
  const t0=Date.now();
  const status=call('awakeStatus');
  const settings=await call('settings',{focusMode:false});
  assert.equal(settings.ok,true);
  assert.ok(Date.now()-t0<1500,'réglage enregistré sans attendre l’app Mac');
  assert.equal(A.clean(fb.store[A.KEY]).settings.focusMode,false);
  const opened=await call('openPage',{page:'options'});
  assert.equal(opened.ok,true);
  const s=await status;
  assert.equal(s.ok,true);assert.equal(s.value.reachable,false,'app injoignable signalée, pas d’attente infinie');
});
test('Page de l’extension sans URL (popup Safari) reconnue',async()=>{
  const {call}=setup();
  const r=await call('settings',{focusMode:false},{id:'ext',frameId:0});
  assert.equal(r.ok,true);
});
test('Relance Codex : attend que le quota Codex soit vraiment rouvert, puis envoie',async()=>{
  const {fb,call,T,setCodex}=setup({codex:{used5:100,usedW:40}});
  fb.addTab('https://chatgpt.com/codex');
  const s=site(fb,'https://chatgpt.com/codex/tasks/task_e_1');
  const r=await call('resumeArm',{at:Date.now()+60000,message:'Continue'},s);
  const due=()=>{fb.store['ai_flow_resume_v1'][r.value.id].at=Date.now()-1000;};
  due();await T.fireResume(r.value.id);
  assert.equal(fb.store['ai_flow_resume_v1'][r.value.id].status,'quota encore plein','pas d’envoi tant que Codex est plein');
  setCodex({used5:2,usedW:41});
  due();await T.fireResume(r.value.id);
  assert.equal(fb.store['ai_flow_resume_v1'][r.value.id],undefined);
  assert.equal(fb.store['ai_flow_resume_last_v1'].status,'envoyée');
});
test('Rattrapage : relance manquée (Mac endormi) envoyée au réveil et signalée comme rattrapée',async()=>{
  const {fb,call,T}=setup();
  const s=site(fb,'https://claude.ai/chat/abc');
  const r=await call('resumeArm',{at:Date.now()+60000,message:'Continue'},s);
  const job=fb.store['ai_flow_resume_v1'][r.value.id];
  job.at=job.plannedAt=Date.now()-7*3600000; // prévue cette nuit, le Mac dormait
  await T.catchUp();
  assert.equal(fb.store['ai_flow_resume_v1'][r.value.id],undefined);
  const last=fb.store['ai_flow_resume_last_v1'];
  assert.equal(last.status,'envoyée');assert.equal(last.late,true);
  assert.match(fb.store['ai_flow_toast_v1'].at(-1).body,/rattrapée au réveil/);
});
test('Mode Awake par défaut : rattrapage (aucune commande, aucune app sollicitée)',async()=>{
  const {call,fb}=setup({native:true,nativeReply:()=>({ok:true})});
  const st=await call('awakeStatus');
  assert.equal(st.value.mode,'catchup');
  assert.equal(fb.native.length,0);
});
