// Flow Checkpoints et Flow Recovery : liens, fusion, reprise confirmée, notifications, timeline, suppression.
const test=require('node:test'),assert=require('node:assert/strict');
const {fakeBrowser,load,core}=require('./helpers.cjs');
const A=core().AIFlow;
const H=3600000;
function bg(opts={}){
  const fb=fakeBrowser(opts);
  const ctx=load(['platforms.js','shared.js','readers.js','background.js'],{browser:fb.browser,__AIFLOW_TEST__:{}});
  return {fb,T:ctx.__AIFLOW_TEST__,A:ctx.AIFlow,call:(op,payload)=>fb.send({type:'AI_FLOW',op,payload},{id:'ext',url:'chrome-extension://ext/popup.html',frameId:0})};
}
test('lien vers la conversation de destination rattaché au point de reprise',async()=>{
  const {fb,T}=bg();
  fb.store.ai_flow_drafts_v1=[{id:'cp1',kind:'checkpoint',title:'Tarifs',url:'https://claude.ai/chat/abc',createdAt:1,updatedAt:1}];
  fb.store.ai_flow_dest_pending_v1={7:{checkpointId:'cp1',at:Date.now()}};
  assert.equal(await T.linkDestination(7,'https://chatgpt.com/'),false,'page d’accueil : pas encore une conversation');
  assert.equal(await T.linkDestination(7,'https://chatgpt.com/c/nouvelle-conv'),true);
  const cp=fb.store.ai_flow_drafts_v1[0];
  assert.equal(cp.destUrl,'https://chatgpt.com/c/nouvelle-conv');assert.equal(cp.target,'chatgpt');
  assert.equal(fb.store.ai_flow_dest_pending_v1[7],undefined);
  assert.equal(await T.linkDestination(8,'https://evil.example/c/x'),false,'onglet non suivi ignoré');
});
test('limite atteinte sur une conversation déjà sauvegardée : le point de reprise devient « interrompu », sans doublon',async()=>{
  const {fb,T}=bg();
  fb.addTab('https://claude.ai/chat/abc',{active:true,title:'Tarifs - Claude'});
  fb.store.ai_flow_drafts_v1=[{id:'cp1',kind:'checkpoint',title:'Tarifs',url:'https://claude.ai/chat/abc',createdAt:1,updatedAt:1}];
  await T.recordInterruptions([{type:'reached',platform:'claude',id:'claude.session',resetAt:Date.now()+H}],[]);
  const list=fb.store.ai_flow_drafts_v1;
  assert.equal(list.length,1);assert.equal(list[0].interrupted,true);assert.equal(list[0].platform,'claude');
  const notices=[{platform:'claude',type:'reset',body:'Claude est de nouveau disponible.'}];
  await T.recordInterruptions([{type:'reset',platform:'claude',id:'claude.session'}],notices);
  assert.equal(fb.store.ai_flow_drafts_v1[0].status,'ready');
  assert.equal(notices[0].url,'https://claude.ai/chat/abc');assert.equal(notices[0].checkpointId,'cp1');
});
test('reprise annoncée seulement sur relevé confirmé : jamais sur une estimation',()=>{
  const now=Date.now(),reached={'claude.session':{percent:100,source:'observed',observedAt:now,resetAt:now+H}};
  let r=A.notificationEvents(null,A.clean({metrics:reached}),now);
  // Le reset prévu est passé mais aucun nouveau relevé : rien n'est annoncé.
  r=A.notificationEvents(r.memo,A.clean({metrics:reached}),now+2*H);
  assert.equal(r.events.filter(e=>e.type==='reset').length,0);
  r=A.notificationEvents(r.memo,A.clean({metrics:{'claude.session':{percent:3,source:'observed',observedAt:now+2*H,resetAt:now+7*H}}}),now+2*H);
  assert.equal(r.events.filter(e=>e.type==='reset').length,1);
});
test('notification système : reprise confirmée par un relevé, le clic ouvre la conversation à reprendre',async()=>{
  const {runReader}=require('./helpers.cjs');
  const ORG='0b2c6c1e-1234-4abc-8def-001122334455';let ctx;
  const fb=fakeBrowser({notifications:true,inject:async(tab,func)=>(await runReader(ctx,func,new URL(tab.url).hostname,url=>
    url.endsWith('/api/organizations')?{body:[{uuid:ORG,capabilities:['chat']}]}:{body:{five_hour:{utilization:4,resets_at:new Date(Date.now()+5*H).toISOString()},seven_day:{utilization:20}}})).result});
  ctx=load(['platforms.js','shared.js','readers.js','background.js'],{browser:fb.browser,__AIFLOW_TEST__:{}});
  const call=(op,payload)=>fb.send({type:'AI_FLOW',op,payload},{id:'ext',url:'chrome-extension://ext/popup.html',frameId:0});
  fb.addTab('https://claude.ai/chat/abc',{active:true,title:'Tarifs - Claude'});
  await call('settings',{systemNotifications:true});
  fb.store.ai_flow_drafts_v1=[{id:'cp1',kind:'checkpoint',interrupted:true,platform:'claude',status:'open',title:'Tarifs',url:'https://claude.ai/chat/abc',createdAt:1,updatedAt:1}];
  fb.store.ai_flow_notify_v1={sent:{},reached:{'claude.session':{at:Date.now()-H,percent:100,resetAt:Date.now()-60000}}};
  await call('refresh');
  assert.equal(fb.notifications.length,1);
  const n=fb.notifications[0];
  assert.match(n.message,/Reprendre « Tarifs »/);
  assert.equal(fb.store.ai_flow_notify_links_v1[n.id].url,'https://claude.ai/chat/abc');
  assert.equal(fb.store.ai_flow_drafts_v1[0].status,'ready');
  await call('refresh');
  assert.equal(fb.notifications.length,1,'pas de répétition');
});
test('timeline : reprises prêtes d’abord, puis interrompues, puis récentes ; terminées masquées',()=>{
  const now=Date.now();
  const s=A.clean({metrics:{'claude.session':{percent:5,source:'observed',observedAt:now,resetAt:now+5*H}}});
  const items=A.timelineItems([
    {id:'a',title:'Récent',createdAt:now,updatedAt:now},
    {id:'b',kind:'interruption',platform:'codex',source:'chatgpt',status:'open',title:'Codex bloqué',url:'https://chatgpt.com/codex/tasks/t1',createdAt:now-H,updatedAt:now-H,resetAt:now+H},
    {id:'c',kind:'checkpoint',interrupted:true,platform:'claude',status:'ready',title:'Claude prêt',url:'https://claude.ai/chat/x',createdAt:now-2*H,updatedAt:now-2*H},
    {id:'d',title:'Fini',status:'done',createdAt:now,updatedAt:now}],s,now);
  assert.deepEqual(JSON.parse(JSON.stringify(items.map(i=>i.id))),['c','b','a']);
  assert.match(items[0].label,/Claude de nouveau disponible/);assert.match(items[1].label,/En attente : limite Codex · rouvre/);
});
test('suppression des données : « Supprimer tous les relevés » efface relevés et diagnostics, les points de reprise se suppriment un par un',async()=>{
  const {fb,call}=bg();
  fb.store.ai_flow_state_v1={metrics:{'claude.session':{percent:40,source:'observed',observedAt:Date.now(),resetAt:null}}};
  fb.store.ai_flow_drafts_v1=[{id:'cp1',title:'Gardé',createdAt:1,updatedAt:1}];
  assert.equal((await call('clear')).ok,true);
  assert.deepEqual(JSON.parse(JSON.stringify(A.clean(fb.store.ai_flow_state_v1).metrics)),{});
  assert.equal(fb.store.ai_flow_drafts_v1.length,1,'les points de reprise ne sont pas effacés avec les relevés');
});
test('barre de menus macOS : résumé fidèle, envoyé seulement s’il change, sans contenu de conversation',async()=>{
  const now=Date.now();
  const s=A.clean({metrics:{'claude.session':{percent:42.4,source:'observed',observedAt:now,resetAt:now+H},'codex.weekly':{percent:12,source:'observed',observedAt:now-20*60000,resetAt:now+3*24*H}}});
  const snap=JSON.parse(JSON.stringify(A.menuSnapshot(s,now)));
  const claude=snap.platforms.find(p=>p.id==='claude'),codex=snap.platforms.find(p=>p.id==='codex');
  assert.equal(claude.metrics[0].percent,42);assert.equal(claude.radar,'available');
  assert.equal(codex.radar,'stale','relevé de plus de 15 min : signalé périmé');
  assert.ok(!snap.platforms.some(p=>p.id==='chatgpt'),'ChatGPT non mesuré : absent');
  const {fb,T}=bg({native:true,nativeReply:()=>({ok:true})});
  fb.store.ai_flow_state_v1={metrics:{'claude.session':{percent:42,source:'observed',observedAt:now,resetAt:now+H}}};
  assert.equal((await T.syncMenuBar()).sent,true);
  assert.equal((await T.syncMenuBar()).sent,false,'inchangé : pas de renvoi');
  const sent=fb.native.filter(m=>m.type==='AI_FLOW_SNAPSHOT');
  assert.equal(sent.length,1);assert.ok(!JSON.stringify(sent[0]).match(/messages|text/));
});
