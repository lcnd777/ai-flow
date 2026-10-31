const test=require('node:test'),assert=require('node:assert/strict');
const {core}=require('./helpers.cjs');
const C=core(),A=C.AIFlow;
const MIN=60000,H=3600000,NOW=Date.UTC(2026,9,31,12,0,0);
const plain=x=>JSON.parse(JSON.stringify(x));
const st=(metrics={},settings={})=>{const s=A.clean({metrics,settings});return s;};
const obs=(percent,ago=0,resetIn=2*H,extra={})=>({percent,source:'observed',observedAt:NOW-ago,resetAt:resetIn==null?null:NOW+resetIn,...extra});

test('clean : refuse toute valeur non observée ou invalide',()=>{
  const s=A.clean({metrics:{'claude.session':{percent:40,source:'manual',observedAt:NOW},'claude.weekly':{percent:140,source:'observed',observedAt:NOW},'codex.weekly':obs(12),'inconnu.x':obs(3)}});
  assert.deepEqual(plain(Object.keys(s.metrics)),['codex.weekly']);
});
test('clean : ordre et masquage des plateformes assainis',()=>{
  const s=A.clean({settings:{platformOrder:['codex','zzz','codex','claude'],platformHidden:{codex:true,grok:true,claude:'oui'}}});
  assert.equal(s.settings.platformOrder[0],'codex');assert.equal(s.settings.platformOrder[1],'claude');
  assert.equal(s.settings.platformOrder.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(s.settings.platformHidden)),{codex:true},'plateforme retirée ignorée');
  assert.deepEqual(plain(A.clean({}).settings.platformOrder),['claude','codex'],'seules les IA mesurables sont proposées');
  assert.equal(A.clean({}).settings.awakeEnabled,false,'Awake désactivé par défaut');
});
test('reduce metrics : n’accepte que les quotas de la plateforme annoncée',()=>{
  const s=st();
  assert.throws(()=>A.reduce(s,'metrics',{platform:'claude',readings:[{id:'codex.weekly',percent:10}]},NOW));
  const out=A.reduce(s,'metrics',{platform:'codex',readings:[{id:'codex.weekly',percent:25,detail:'détail',resetAt:NOW-1}]},NOW);
  assert.equal(out[0].percent,25);assert.equal(out[0].resetAt,null,'reset passé ignoré');assert.equal(s.metrics['codex.weekly'].detail,'détail');
});
test('isStale : 15 min de fraîcheur, reset passé = périmé',()=>{
  assert.equal(A.isStale(obs(10,14*MIN),'x',NOW),false);
  assert.equal(A.isStale(obs(10,16*MIN),'x',NOW),true);
  assert.equal(A.isStale(obs(10,0,-MIN),'x',NOW),true);
});
test('platformStatus : non mesuré, partiel, limite atteinte',()=>{
  const s=st({'claude.session':obs(100,MIN,H),'claude.weekly':obs(100,MIN,3*H)});
  assert.equal(A.platformStatus(s,'chatgpt',NOW).level,'unmeasured','ChatGPT conversation jamais chiffré');
  const c=A.platformStatus(s,'claude',NOW);
  assert.equal(c.limitReached,true);assert.equal(c.reopenAt,NOW+3*H);assert.equal(c.level,'critical');
  const p=A.platformStatus(st({'codex.weekly':obs(20)}),'codex',NOW);
  assert.equal(p.partial,true);assert.equal(p.level,'healthy');
});
test('Smart Switch : ne recommande que des capacités connues',()=>{
  const s=st({'claude.session':obs(92),'claude.weekly':obs(40,MIN,3*24*H),'codex.session':obs(10),'codex.weekly':obs(30,MIN,5*24*H),'grok.queries':obs(50,40*MIN)});
  const sw=A.smartSwitch(s,NOW);
  assert.deepEqual(plain(sw.pressured.map(x=>x.platform)),['claude']);
  assert.deepEqual(plain(sw.available.map(x=>x.platform)),['codex']);
  const stale=A.smartSwitch(st({'claude.session':obs(92),'codex.session':obs(10,40*MIN)}),NOW);
  assert.ok(stale.unknown.some(x=>x.platform==='codex')&&!stale.available.length,'relevé périmé = état inconnu, jamais recommandé');
  assert.ok(!sw.available.some(x=>x.platform==='chatgpt'),'ChatGPT (non mesuré) jamais recommandé');
});
test('Smart Switch : rien à proposer quand tout va bien',()=>{
  assert.equal(A.smartSwitch(st({'claude.session':obs(10)}),NOW).pressured.length,0);
});
test('notifications : une seule alerte par période, puis reset confirmé',()=>{
  let s=st({'claude.session':obs(91,0,H)});
  let r=A.notificationEvents(null,s,NOW);
  assert.deepEqual(plain(r.events.map(e=>e.type)),['approaching']);
  r=A.notificationEvents(r.memo,s,NOW+MIN);assert.equal(r.events.length,0,'pas de répétition');
  s=st({'claude.session':obs(100,0,H)});
  r=A.notificationEvents(r.memo,s,NOW+2*MIN);assert.deepEqual(plain(r.events.map(e=>e.type)),['reached']);
  r=A.notificationEvents(r.memo,s,NOW+3*MIN);assert.equal(r.events.length,0);
  // Même relevé ancien : pas de « disponible » sans nouvelle lecture.
  const s2=A.clean({metrics:{'claude.session':{percent:4,source:'observed',observedAt:NOW+H+2*MIN,resetAt:NOW+6*H}}});
  r=A.notificationEvents(r.memo,s2,NOW+H+2*MIN);assert.deepEqual(plain(r.events.map(e=>e.type)),['reset']);
  r=A.notificationEvents(r.memo,s2,NOW+H+3*MIN);assert.equal(r.events.length,0);
});
test('notifications : chaque type se désactive',()=>{
  const s=st({'claude.session':obs(100,0,H)},{notifyReached:false});
  const r=A.notificationEvents(null,s,NOW);
  assert.equal(r.events.length,0);assert.ok(r.memo.reached['claude.session'],'mémoire conservée pour le reset');
});
test('notifications : un message par plateforme et par type',()=>{
  const s=st({'claude.session':obs(100,0,H),'claude.weekly':obs(100,0,5*H),'codex.session':obs(5),'codex.weekly':obs(5)});
  const {events}=A.notificationEvents(null,s,NOW);
  const list=A.describeEvents(events,s,NOW);
  assert.equal(list.length,1);assert.match(list[0].title,/Claude : limite atteinte/);assert.match(list[0].body,/Session \(5 h\), Semaine/);
  const appr=A.describeEvents([{type:'approaching',id:'claude.session',platform:'claude',percent:92,resetAt:NOW+H}],st({'claude.session':obs(92),'codex.session':obs(5),'codex.weekly':obs(5)}),NOW);
  assert.match(appr[0].body,/Capacité connue : Codex/);
});
test('transfert : message structuré, champs vides ignorés',()=>{
  assert.equal(A.buildHandoff({},'Claude','ChatGPT'),'');
  const t=A.buildHandoff({goal:'Livrer la V1',next:'Écrire les tests',context:'  '},'Claude','ChatGPT');
  assert.match(t,/commencé sur Claude/);assert.match(t,/## Objectif initial\nLivrer la V1/);assert.match(t,/## Prochaines étapes/);assert.doesNotMatch(t,/Contexte du projet/);
  assert.ok(t.indexOf('Objectif')<t.indexOf('Prochaines étapes'));
});
test('plateformes : ChatGPT et Codex distincts sur chatgpt.com, conversations reconnues',()=>{
  const P=C.AIFlowPlatforms;
  assert.deepEqual(plain(P.forUrl('https://chatgpt.com/c/abc')),['chatgpt','codex']);
  assert.equal(P.siteFor('https://chatgpt.com/'),'chatgpt');
  assert.equal(P.siteFor('https://grok.com/'),null,'Grok retiré');
  assert.equal(P.conversationOf('https://chatgpt.com/codex/tasks/task_e_1').url,'https://chatgpt.com/codex/tasks/task_e_1','tâche Codex relançable');
  assert.deepEqual(JSON.parse(JSON.stringify(P.conversationOf('https://claude.ai/chat/1234-abc/'))),{platform:'claude',url:'https://claude.ai/chat/1234-abc'});
  assert.equal(P.conversationOf('https://claude.ai/new'),null);
  assert.equal(P.conversationOf('http://claude.ai/chat/x'),null);
  for(const p of P.PLATFORMS)assert.ok(['live','experimental','none'].includes(p.support));
  for(const p of P.PLATFORMS.filter(p=>p.support==='none'))assert.equal(Object.keys(p.metrics).length,0,'aucun chiffre pour '+p.id);
});
test('Smart Switch : ne propose jamais la plateforme courante',()=>{
  const s=st({'claude.session':obs(5),'claude.weekly':obs(5),'codex.session':obs(10),'codex.weekly':obs(10)});
  const sw=A.smartSwitch(s,NOW,'claude');
  assert.ok(!sw.available.some(x=>x.platform==='claude'));
  assert.ok(sw.available.some(x=>x.platform==='codex'));
});
test('Awake mode Terminal : commande caffeinate calculée jusqu’à l’échéance',()=>{
  assert.equal(A.caffeinateCommand(NOW+2*H+600000,NOW),'caffeinate -i -t 7800');
  assert.equal(A.caffeinateCommand(NOW-1,NOW),'','échéance passée : aucune commande');
});
test('Smart Switch : visible dès qu’une autre plateforme est disponible, discret quand rien ne presse',()=>{
  const {AIFlow:A}=require('./helpers.cjs').core();const now=Date.now(),H=3600000;
  const m=(p,o)=>({percent:p,source:'observed',observedAt:now,resetAt:now+o});
  let s=A.clean({metrics:{'claude.session':m(40,3*H),'claude.weekly':m(20,100*H),'codex.session':m(5,4*H),'codex.weekly':m(30,100*H)}});
  const calm=A.switchOffer(s,now,'claude');
  assert.equal(calm.mode,'calm');assert.equal(calm.available.map(x=>x.platform).join(),'codex');
  assert.equal(A.switchOffer(s,now,null).available.length,2,'tableau de bord : toutes les plateformes disponibles');
  s=A.clean({metrics:{'claude.session':m(92,3*H),'codex.session':m(5,4*H),'codex.weekly':m(30,100*H)}});
  assert.equal(A.switchOffer(s,now,'claude').mode,'pressured');
  s=A.clean({metrics:{'claude.session':m(40,3*H)}});
  assert.equal(A.switchOffer(s,now,'claude').mode,null,'aucune autre plateforme disponible : rien');
  s=A.clean({metrics:{'claude.session':m(100,3*H),'codex.session':m(100,4*H)}});
  assert.equal(A.switchOffer(s,now,'claude').mode,null,'toutes les limites atteintes : pas de Smart Switch');
  assert.equal(A.switchOffer(s,now,null).mode,null);
  s=A.clean({metrics:{'claude.session':m(100,3*H),'codex.session':m(5,4*H),'codex.weekly':m(30,100*H)}});
  assert.equal(A.switchOffer(s,now,'claude').mode,'pressured','une autre plateforme reste disponible');
  s=A.clean({metrics:{'claude.session':m(98,3*H),'codex.session':m(100,4*H)}});
  assert.equal(A.switchOffer(s,now,'claude').mode,null,'Claude 98 % et Codex 100 % : aucune alternative, pas de Smart Switch');
  assert.equal(A.switchOffer(s,now,null).mode,null);
});
