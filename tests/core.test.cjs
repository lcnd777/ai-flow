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
  const s=A.clean({settings:{platformOrder:['grok','zzz','grok','claude'],platformHidden:{gemini:true,foo:true,claude:'oui'}}});
  assert.equal(s.settings.platformOrder[0],'grok');assert.equal(s.settings.platformOrder[1],'claude');
  assert.equal(s.settings.platformOrder.length,A.PLATFORMS.length);
  assert.deepEqual(JSON.parse(JSON.stringify(s.settings.platformHidden)),{gemini:true});
  assert.equal(A.clean({}).settings.awakeEnabled,false,'Awake désactivé par défaut');
});
test('reduce metrics : n’accepte que les quotas de la plateforme annoncée',()=>{
  const s=st();
  assert.throws(()=>A.reduce(s,'metrics',{platform:'claude',readings:[{id:'codex.weekly',percent:10}]},NOW));
  const out=A.reduce(s,'metrics',{platform:'grok',readings:[{id:'grok.queries',percent:25,detail:'grok-4 · 15/20',resetAt:NOW-1}]},NOW);
  assert.equal(out[0].percent,25);assert.equal(out[0].resetAt,null,'reset passé ignoré');assert.equal(s.metrics['grok.queries'].detail,'grok-4 · 15/20');
});
test('isStale : 15 min de fraîcheur, reset passé = périmé',()=>{
  assert.equal(A.isStale(obs(10,14*MIN),'x',NOW),false);
  assert.equal(A.isStale(obs(10,16*MIN),'x',NOW),true);
  assert.equal(A.isStale(obs(10,0,-MIN),'x',NOW),true);
});
test('platformStatus : non mesuré, partiel, limite atteinte',()=>{
  const s=st({'claude.session':obs(100,MIN,H),'claude.weekly':obs(100,MIN,3*H)});
  assert.equal(A.platformStatus(s,'gemini',NOW).level,'unmeasured');
  assert.equal(A.platformStatus(s,'chatgpt',NOW).level,'unmeasured','ChatGPT conversation jamais chiffré');
  const c=A.platformStatus(s,'claude',NOW);
  assert.equal(c.limitReached,true);assert.equal(c.reopenAt,NOW+3*H);assert.equal(c.level,'critical');
  const p=A.platformStatus(st({'codex.weekly':obs(20)}),'codex',NOW);
  assert.equal(p.partial,true);assert.equal(p.level,'healthy');
});
function withHistory(points,resetIn=4*H){
  const s=st({'claude.session':obs(points.at(-1)[1],points.at(-1)[0],resetIn)});
  s.history['claude.session']=points.map(([ago,p])=>({ts:NOW-ago,percent:p,resetAt:NOW+resetIn}));
  return s;
}
test('autonomie : rien sans données suffisantes',()=>{
  assert.equal(A.autonomy(withHistory([[10*MIN,20],[0,22]]),'claude.session',NOW),null);
  assert.equal(A.autonomy(withHistory([[6*MIN,20],[3*MIN,21],[0,22]]),'claude.session',NOW),null,'moins de 15 min');
});
test('autonomie : estimation avec fourchette au rythme régulier',()=>{
  const s=withHistory([[30*MIN,40],[20*MIN,45],[10*MIN,50],[0,55]]); // 30 %/h → 45 % restants ≈ 90 min
  const a=A.autonomy(s,'claude.session',NOW);
  assert.ok(a&&!a.beyondReset);assert.equal(a.minutes,90);assert.ok(a.low<=90&&a.high>=90);
  assert.match(A.autonomyText(a),/limite possible dans ~1 h 30/);
});
test('autonomie : au-delà du reset → message dédié, sans durée',()=>{
  const s=withHistory([[30*MIN,10],[20*MIN,11],[10*MIN,12],[0,13]],30*MIN);
  const a=A.autonomy(s,'claude.session',NOW);
  assert.equal(a.beyondReset,true);assert.match(A.autonomyText(a),/avant le reset/);
});
test('Smart Switch : ne recommande que des capacités connues',()=>{
  const s=st({'claude.session':obs(92),'claude.weekly':obs(40,MIN,3*24*H),'codex.session':obs(10),'codex.weekly':obs(30,MIN,5*24*H),'grok.queries':obs(50,40*MIN)});
  const sw=A.smartSwitch(s,NOW);
  assert.deepEqual(plain(sw.pressured.map(x=>x.platform)),['claude']);
  assert.deepEqual(plain(sw.available.map(x=>x.platform)),['codex']);
  assert.ok(sw.unknown.some(x=>x.platform==='grok'),'relevé périmé = état inconnu');
  assert.ok(sw.unmeasured.some(x=>x.platform==='chatgpt'));
  assert.ok(!sw.available.some(x=>x.platform==='chatgpt'||x.platform==='gemini'));
});
test('Smart Switch : rien à proposer quand tout va bien',()=>{
  assert.equal(A.smartSwitch(st({'claude.session':obs(10)}),NOW).pressured.length,0);
});
test('historique : échantillonnage, reset constaté, période de limite',()=>{
  let h=null;
  h=A.recordHistory(h,[{id:'claude.session',percent:50}],NOW-60*MIN);
  h=A.recordHistory(h,[{id:'claude.session',percent:50}],NOW-58*MIN);
  assert.equal(h.series['claude.session'].length,1,'valeur identique < 10 min : pas de doublon');
  h=A.recordHistory(h,[{id:'claude.session',percent:100}],NOW-40*MIN);
  assert.equal(h.limits.length,1);assert.equal(h.limits[0].to,null);
  h=A.recordHistory(h,[{id:'claude.session',percent:3}],NOW-5*MIN);
  assert.equal(h.limits[0].to,NOW-5*MIN);assert.equal(h.resets.length,1);assert.equal(h.resets[0].from,100);
  const old=A.recordHistory({series:{'claude.session':[[NOW-8*24*H,10]]}},[{id:'claude.session',percent:11}],NOW);
  assert.equal(old.series['claude.session'].length,1,'plus de 7 jours : purgé');
});
test('historique : un trou de plus de 20 min coupe la courbe',()=>{
  const segs=A.segments([[NOW-60*MIN,1],[NOW-55*MIN,2],[NOW-10*MIN,3],[NOW,4]],NOW-H,NOW);
  assert.equal(segs.length,2);
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
  assert.match(t,/commencé sur Claude/);assert.match(t,/## Objectif\nLivrer la V1/);assert.match(t,/## Prochaines actions/);assert.doesNotMatch(t,/Contexte du projet/);
  assert.ok(t.indexOf('Objectif')<t.indexOf('Prochaines actions'));
});
test('plateformes : ChatGPT et Codex distincts sur chatgpt.com, conversations reconnues',()=>{
  const P=C.AIFlowPlatforms;
  assert.deepEqual(plain(P.forUrl('https://chatgpt.com/c/abc')),['chatgpt','codex']);
  assert.equal(P.siteFor('https://chatgpt.com/'),'chatgpt');
  assert.equal(P.siteFor('https://grok.com/'),'grok');
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
