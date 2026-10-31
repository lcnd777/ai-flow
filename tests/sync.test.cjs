// Smart Context Sync : moteur (delta, décisions, conflits, journal, secrets) et parcours complet en arrière-plan.
// Tests simulés : aucune session ChatGPT ou Claude authentifiée n'est utilisée ici.
const test=require('node:test'),assert=require('node:assert/strict');
const {fakeBrowser,load}=require('./helpers.cjs');
const J=v=>JSON.parse(JSON.stringify(v));
const engine=()=>load(['platforms.js','shared.js','sync.js']).AIFlowSync;
const S=engine();
const CL='https://claude.ai/chat/11111111-1111-1111-1111-111111111111',GP='https://chatgpt.com/c/abc-123';

/* ---------- Moteur ---------- */
test('delta : nouveaux messages, doublons et messages déjà connus (identifiants puis empreintes)',()=>{
  const m=[{id:'a',role:'user',text:'Bonjour'},{id:'b',role:'assistant',text:'Salut'}];
  const base=S.baselineFrom(m);
  const d0=S.computeDelta(m,base,{source:'api'});
  assert.equal(d0.upToDate,true);assert.equal(d0.known,2);
  const d1=S.computeDelta([...m,{id:'c',role:'user',text:'Nouveau'}],base,{source:'api'});
  assert.equal(d1.fresh.length,1);assert.equal(d1.fresh[0].text,'Nouveau');
  // Même contenu lu depuis la page (sans identifiant) : reconnu par empreinte, pas de doublon.
  const d2=S.computeDelta([{role:'user',text:'  Bonjour '},{role:'assistant',text:'Salut'}],base,{source:'page'});
  assert.equal(d2.fresh.length,0);assert.equal(d2.partial,true);
});
test('delta : message modifié détecté, message absent jamais considéré comme supprimé',()=>{
  const base=S.baselineFrom([{id:'a',role:'user',text:'v1'},{id:'b',role:'assistant',text:'réponse'}]);
  const d=S.computeDelta([{id:'a',role:'user',text:'v2'}],base,{source:'api'});
  assert.equal(d.modified.length,1);assert.equal(d.fresh.length,0);
  assert.ok(!('deleted' in d),'aucune notion de suppression');
});
test('delta : les messages insérés par AI Flow ne reviennent jamais comme des nouveautés',()=>{
  const d=S.computeDelta([{role:'user',text:'[AI Flow · Mise à jour de contexte] « X »\n…'},{role:'user',text:'Je reprends avec toi un travail commencé sur Claude.'},{role:'assistant',text:'Bien reçu.'}],S.emptyBaseline(),{source:'api'});
  assert.equal(d.packets,2);assert.equal(d.fresh.length,1);
});
test('delta : capture sans point commun avec la référence signalée (capture partielle)',()=>{
  const base=S.baselineFrom([{role:'user',text:'ancien message'}]);
  const d=S.computeDelta([{role:'assistant',text:'tout autre chose'}],base,{source:'page'});
  assert.equal(d.anchorMissing,true);assert.equal(d.partial,true);
});
test('décisions : la décision validée de l’utilisateur remplace la proposition (exemple PostgreSQL)',()=>{
  const prop=S.extractItems([{role:'assistant',text:'Je propose une architecture PostgreSQL avec Prisma pour la persistance.'}]);
  let decisions=S.applyDecisionOps([],S.decisionOps(S.reconcile(prop,[]),{}),{platform:'claude'});
  assert.equal(decisions[0].status,'proposed');
  const items=S.extractItems([{role:'user',text:'Finalement on reporte PostgreSQL, on garde SQLite pour l’instant.'}]);
  const entries=S.reconcile(items,decisions);
  assert.equal(entries[0].relation,'replaces');
  decisions=S.applyDecisionOps(decisions,S.decisionOps(entries,{}),{platform:'chatgpt'});
  assert.deepEqual(J(decisions.map(d=>d.status)),['abandoned','validated']);
  // Claude repropose PostgreSQL ensuite : conflit obligatoire, jamais réintroduit comme décision validée.
  const again=S.extractItems([{role:'assistant',text:'Je recommande de partir sur PostgreSQL dès maintenant.'}]);
  const e2=S.reconcile(again,decisions);
  assert.equal(e2[0].relation,'conflict');assert.equal(e2[0].required,true);
  assert.equal(S.unresolved(e2,{}).length,1,'conflit non résolu bloque le transfert');
  const packet=S.buildPacket({title:'T',from:'claude',to:'chatgpt',items:again,entries:e2,choices:{}});
  assert.ok(!/## Décisions validées/.test(packet));
});
test('conflits : conserver la première, la seconde, fusion manuelle, report du choix',()=>{
  const base=S.applyDecisionOps([],[{op:'add',id:'d1',text:'On part sur Stripe pour les paiements.',status:'validated',polarity:1,origin:'user'}],{platform:'claude'});
  const items=S.extractItems([{role:'user',text:'On abandonne Stripe pour les paiements, trop cher.'}]);
  const e=S.reconcile(items,base);assert.equal(e[0].relation,'conflict');assert.equal(e[0].required,true);
  const id=items[0].id;
  const st=c=>J(S.applyDecisionOps(base,S.decisionOps(e,c),{platform:'chatgpt'}).map(d=>d.status));
  assert.deepEqual(st({[id]:{choice:'first'}}),['validated']);
  assert.deepEqual(st({[id]:{choice:'second'}}),['abandoned','validated']);
  const merged=S.applyDecisionOps(base,S.decisionOps(e,{[id]:{choice:'merge',text:'Stripe en test, décision finale en juin.'}}),{});
  assert.deepEqual(J(merged.map(d=>[d.status,d.text])),[['modified','On part sur Stripe pour les paiements.'],['validated','Stripe en test, décision finale en juin.']]);
  assert.deepEqual(st({[id]:{choice:'defer'}}),['conflict','conflict']);
  assert.match(S.buildPacket({title:'T',from:'chatgpt',to:'claude',items,entries:e,choices:{[id]:{choice:'defer'}}}),/À arbitrer/);
});
test('comparaison à trois états : les deux conversations ont évolué en sens contraire',()=>{
  const theirs=S.cleanPending({[GP]:{at:1,decisions:[{text:'On garde Vercel pour l’hébergement.',polarity:1,status:'validated'}]}})[GP].decisions;
  const items=S.extractItems([{role:'user',text:'On abandonne Vercel pour l’hébergement.'}]);
  const e=S.reconcile(items,[],theirs);
  assert.equal(e[0].relation,'conflict');assert.equal(e[0].threeWay,true);assert.equal(e[0].required,true);
});
test('décisions validées conservées, doublons ignorés',()=>{
  const base=S.applyDecisionOps([],[{op:'add',id:'d1',text:'On garde React pour le front.',status:'validated',polarity:1,origin:'user'}],{});
  const e=S.reconcile(S.extractItems([{role:'assistant',text:'On garde React pour le front, comme décidé.'}]),base);
  assert.equal(e[0].relation,'duplicate');
  assert.deepEqual(J(S.applyDecisionOps(base,S.decisionOps(e,{}),{}).map(d=>d.status)),['validated']);
});
test('secrets évidents détectés et masqués localement',()=>{
  const t='clé sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX12 et ghp_abcdefghijklmnopqrstuvwxyz0123456789 puis password: hunter2222';
  const found=S.findSecrets(t).map(x=>x.type);
  assert.ok(found.includes('clé API')&&found.includes('jeton GitHub')&&found.includes('mot de passe'));
  const m=S.maskSecrets(t);assert.ok(!/sk-proj|ghp_|hunter/.test(m));
  const items=S.extractItems([{role:'user',text:'On garde la clé sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX12 pour les tests.'}]);
  assert.equal(items.find(i=>i.kind==='decision').secret,true);
  assert.ok(!/sk-proj/.test(S.buildPacket({title:'T',from:'claude',to:'chatgpt',items,entries:S.reconcile(items,[]),mask:true})));
});
test('journal : états distincts et transitions autorisées uniquement',()=>{
  assert.ok(S.canTransition('prepared','pending-insert'));assert.ok(S.canTransition('inserted','confirmed'));
  assert.ok(S.canTransition('failed','pending-insert'),'nouvelle tentative après échec');
  assert.ok(!S.canTransition('confirmed','cancelled'));assert.ok(!S.canTransition('cancelled','confirmed'));
});
test('dépôt local : données corrompues écartées sans effacement silencieux, migration de forme',()=>{
  const ok={id:'f1',ends:[{url:CL,title:'A'},{url:GP,title:'B'}]};
  const r=S.cleanFlows({v:1,flows:[ok,{id:'bad',ends:[{url:'https://evil.example/'}]},'texte']});
  assert.equal(r.flows.length,1);assert.equal(r.dropped.length,2);
  assert.equal(S.cleanFlows([ok]).flows.length,1,'ancienne forme (tableau) relue');
  assert.equal(S.cleanFlows(null).flows.length,0);
  assert.equal(S.cleanFlows({junk:1}).dropped.length,1);
});

/* ---------- Parcours complet (arrière-plan, sites simulés) ---------- */
function setup(o={}){
  const convs={[CL]:[],[GP]:[]};let insert='inserted';
  const fb=fakeBrowser({inject:async(tab,func,args)=>{
    const url=tab.url;
    if(func.name==='insertDraft'){tab.inserted=args[0];return {status:insert};}
    if(func.name==='claudeConversation'||func.name==='chatgptConversation'){
      if(o.permissionDenied)throw new Error('denied');
      if(convs[url]===null)return {status:'not-found'};
      return {status:'ok',source:o.page?'page':'api',title:'Projet',messages:J(convs[url]).map(m=>o.page?{role:m.role,text:m.text}:m)};
    }
  }});
  const ctx=load(['platforms.js','shared.js','readers.js','sync.js','vault.js','background.js'],{browser:fb.browser,__AIFLOW_TEST__:{},crypto:globalThis.crypto,TextDecoder,__AIFLOW_VAULT_MEMORY__:o.noVault?undefined:{}});
  const call=(op,payload)=>fb.send({type:'AI_FLOW',op,payload},{id:'ext',url:'chrome-extension://ext/transfer.html',frameId:0}).then(r=>{if(!r.ok)throw new Error(r.error);return r.value;});
  return {fb,T:ctx.__AIFLOW_TEST__,S:ctx.AIFlowSync,convs,call,setInsert:v=>{insert=v;},ctx};
}
async function linkedFlow(env){
  const {fb,T,S,convs}=env;
  convs[CL]=[{id:'c1',role:'user',text:'Objectif : refaire la page tarifs.'},{id:'c2',role:'assistant',text:'Je propose une architecture PostgreSQL pour stocker les offres.'}];
  fb.store.ai_flow_drafts_v1=[{id:'cp1',kind:'checkpoint',title:'Tarifs',url:CL,createdAt:1,updatedAt:1,fields:{}}];
  // Premier transfert avec liaison acceptée : le Flow naît quand la conversation de destination existe.
  const tabId=fb.addTab('https://chatgpt.com/').id;
  fb.store.ai_flow_dest_pending_v1={[tabId]:{checkpointId:'cp1',at:Date.now(),link:{sourceUrl:CL,title:'Tarifs',sourceTitle:'Tarifs',seen:S.baselineFrom(convs[CL]),decisions:S.seedDecisions(convs[CL],'claude')}}};
  await T.linkDestination(tabId,GP);
  fb.addTab(CL);fb.tabs.get(tabId).url=GP;
  const flows=(await T.loadFlows());assert.equal(flows.length,1);
  return flows[0];
}
async function syncOnce(env,flowId,from,choices={}){
  const {call,S}=env;
  const r=await call('syncCapture',{flowId,from});
  if(r.delta.upToDate)return {r};
  const entries=r.entries.map(e=>({...e,item:r.items.find(i=>i.id===e.itemId)}));
  const included=new Set(r.items.filter(i=>!i.secret).map(i=>i.id));
  const packet=S.buildPacket({title:'Tarifs',from:'x',to:'y',items:r.items,entries,choices,included,delta:r.delta});
  const p=await call('syncPrepare',{flowId,baseRev:r.flow.rev,from:r.from,to:r.to,packet,ops:S.decisionOps(entries,choices,included),seen:r.seen,counts:{items:included.size}});
  return {r,p,packet,entries};
}
test('premier transfert Claude → ChatGPT avec liaison : Flow créé, point de départ enregistré, rien sans confirmation',async()=>{
  const env=setup();const flow=await linkedFlow(env);
  assert.deepEqual(J(flow.ends.map(e=>e.platform)),['claude','chatgpt']);
  assert.equal(flow.checkpointId,'cp1');assert.equal(flow.ends[0].baseline.hashes.length,2);
  assert.ok(!JSON.stringify(env.fb.store.ai_flow_flows_v1).includes('PostgreSQL'),'aucun texte de conversation en clair dans le stockage');
  // Sans case cochée : aucun Flow.
  const env2=setup();const t=env2.fb.addTab('https://chatgpt.com/').id;
  env2.fb.store.ai_flow_drafts_v1=[{id:'cp1',kind:'checkpoint',title:'X',url:CL,createdAt:1,updatedAt:1}];
  env2.fb.store.ai_flow_dest_pending_v1={[t]:{checkpointId:'cp1',at:Date.now()}};
  await env2.T.linkDestination(t,GP);assert.equal((await env2.T.loadFlows()).length,0);
});
test('synchronisation des nouveautés ChatGPT → Claude, puis « À jour », bidirectionnelle et sans doublon',async()=>{
  const env=setup();const flow=await linkedFlow(env);const {convs,call}=env;
  convs[GP]=[{id:'g0',role:'user',text:'Je reprends avec toi un travail commencé sur Claude. …'},{id:'g1',role:'user',text:'Finalement on reporte PostgreSQL, on garde SQLite pour l’instant.'},{id:'g2',role:'assistant',text:'J’ai modifié le schéma pour SQLite. Le bouton Payer ne fonctionne pas sur Safari.'}];
  const s1=await syncOnce(env,flow.id,GP);
  assert.equal(s1.r.delta.fresh,2);assert.equal(s1.r.delta.packets,1,'transfert initial ignoré');
  assert.match(s1.packet,/reporte PostgreSQL/);assert.match(s1.packet,/bouton Payer/);
  // Préparé ≠ synchronisé : la référence n'a pas bougé.
  assert.equal((await call('syncCapture',{flowId:flow.id,from:GP})).delta.fresh,2);
  await call('syncState',{flowId:flow.id,entryId:s1.p.entryId,state:'confirmed'});
  const after=await call('syncCapture',{flowId:flow.id,from:GP});
  assert.equal(after.delta.upToDate,true,'À jour après confirmation');
  // Le point de reprise est mis à jour seulement à la confirmation.
  const cp=env.fb.store.ai_flow_drafts_v1.find(d=>d.id==='cp1');assert.ok(cp.syncedAt);assert.match(cp.fields.decisions,/reporte PostgreSQL/);
  // Sens inverse : Claude avance, le paquet de ChatGPT inséré là-bas n'est pas renvoyé.
  convs[CL].push({id:'c3',role:'user',text:s1.packet},{id:'c4',role:'assistant',text:'J’ai ajouté la FAQ. Prochaines étapes :\n- tester le paiement'});
  const s2=await syncOnce(env,flow.id,CL);
  assert.equal(s2.r.delta.fresh,1);assert.equal(s2.r.delta.packets,1);assert.match(s2.packet,/FAQ/);
  await call('syncState',{flowId:flow.id,entryId:s2.p.entryId,state:'confirmed'});
  const list=await call('flows');const f=list.flows[0];
  assert.equal(f.rev,2);assert.equal(f.ledger.filter(x=>x.state==='confirmed').length,2);
  assert.deepEqual(J(f.decisions.map(d=>d.status)),['abandoned','validated'],'décision validée conservée, proposition abandonnée');
});
test('transfert échoué puis nouvelle tentative, insertion non confirmée, annulation : aucune avance de la référence',async()=>{
  const env=setup();const flow=await linkedFlow(env);const {convs,call}=env;
  convs[GP]=[{id:'g1',role:'assistant',text:'J’ai terminé la grille des prix.'}];
  env.setInsert('no-composer');
  const s=await syncOnce(env,flow.id,GP);
  const r1=await call('syncInsert',{flowId:flow.id,entryId:s.p.entryId,text:s.packet});
  assert.equal(r1.status,'no-composer');
  let f=(await call('flows')).flows[0];assert.equal(f.ledger[0].state,'failed');assert.match(f.ledger[0].error,/Zone de saisie/);
  env.setInsert('inserted');
  const r2=await call('syncInsert',{flowId:flow.id,entryId:s.p.entryId,text:s.packet});
  assert.equal(r2.status,'inserted');
  f=(await call('flows')).flows[0];assert.equal(f.ledger[0].state,'inserted','inséré mais non confirmé');
  assert.equal((await call('syncCapture',{flowId:flow.id,from:GP})).delta.fresh,1,'non confirmé : changements conservés');
  await call('syncState',{flowId:flow.id,entryId:s.p.entryId,state:'cancelled'});
  await assert.rejects(call('syncState',{flowId:flow.id,entryId:s.p.entryId,state:'confirmed'}),/Transition impossible/);
  assert.equal((await call('syncCapture',{flowId:flow.id,from:GP})).delta.fresh,1);
});
test('mises à jour concurrentes : une préparation périmée ne peut pas être confirmée',async()=>{
  const env=setup();const flow=await linkedFlow(env);const {convs,call}=env;
  convs[GP]=[{id:'g1',role:'assistant',text:'J’ai terminé la grille des prix.'}];
  convs[CL].push({id:'c3',role:'assistant',text:'J’ai ajouté la FAQ.'});
  const a=await syncOnce(env,flow.id,GP),b=await syncOnce(env,flow.id,CL);
  await call('syncState',{flowId:flow.id,entryId:b.p.entryId,state:'confirmed'});
  await assert.rejects(call('syncState',{flowId:flow.id,entryId:a.p.entryId,state:'confirmed'}),/a changé depuis la préparation/);
  // Contexte modifié après préparation : la nouvelle préparation remplace l'ancienne.
  const c1=await syncOnce(env,flow.id,GP),c2=await syncOnce(env,flow.id,GP);
  const led=(await call('flows')).flows[0].ledger;
  assert.equal(led.find(x=>x.id===c1.p.entryId).state,'cancelled');assert.equal(led.find(x=>x.id===c2.p.entryId).state,'prepared');
});
test('capture partielle, permission refusée, conversation supprimée, conversation fermée',async()=>{
  const env=setup({page:true});const flow=await linkedFlow(env);
  env.convs[GP]=[{role:'assistant',text:'J’ai terminé la grille des prix.'}];
  const r=await env.call('syncCapture',{flowId:flow.id,from:GP});assert.equal(r.delta.partial,true);
  const den=setup({permissionDenied:true});const f2=await linkedFlow(den);
  assert.equal((await den.call('syncCapture',{flowId:f2.id,from:CL})).error.code,'permission');
  const gone=setup();const f3=await linkedFlow(gone);gone.convs[CL]=null;
  assert.equal((await gone.call('syncCapture',{flowId:f3.id,from:CL})).error.code,'not-found');
  const closed=setup();const f4=await linkedFlow(closed);
  for(const [id,t] of closed.fb.tabs)if(t.url===GP)closed.fb.tabs.delete(id);
  assert.equal((await closed.call('syncCapture',{flowId:f4.id,from:GP})).needTab,true);
});
test('suppression d’un Flow : dissocier garde le point de reprise, supprimer efface tout',async()=>{
  const env=setup();const flow=await linkedFlow(env);
  await env.call('flowUnlink',{flowId:flow.id});
  assert.equal((await env.call('flows')).flows.length,0);assert.equal(env.fb.store.ai_flow_drafts_v1.length,1);
  const env2=setup();const f2=await linkedFlow(env2);
  await env2.call('flowDelete',{flowId:f2.id});
  assert.equal((await env2.call('flows')).flows.length,0);assert.equal(env2.fb.store.ai_flow_drafts_v1.length,0);
});
test('confidentialité : décisions chiffrées au repos, refus depuis une page web, clé absente signalée',async()=>{
  const env=setup();const flow=await linkedFlow(env);
  env.convs[GP]=[{id:'g1',role:'user',text:'On garde SQLite pour la base de données.'}];
  const s=await syncOnce(env,flow.id,GP);await env.call('syncState',{flowId:flow.id,entryId:s.p.entryId,state:'confirmed'});
  const raw=JSON.stringify(env.fb.store.ai_flow_flows_v1);
  assert.ok(!raw.includes('SQLite'),'décisions non lisibles en clair');assert.ok(env.fb.store.ai_flow_flows_v1.flows[0].sealed.ct);
  assert.ok((await env.call('flows')).flows[0].decisions.some(d=>d.text==='On garde SQLite pour la base de données.'&&d.status==='validated'));
  const web=await env.fb.send({type:'AI_FLOW',op:'syncCapture',payload:{flowId:flow.id,from:GP}},{id:'ext',url:CL,tab:{id:99,url:CL},frameId:0});
  assert.equal(web.ok,false,'jamais déclenchable par une page web');
  // Sauvegarde restaurée sans la clé : Flow signalé illisible, pas d'erreur bloquante.
  env.ctx.__AIFLOW_VAULT_MEMORY__.key=null;
  const l=(await env.call('flows')).flows[0];assert.equal(l.locked,true);assert.equal(l.decisions.length,0);
});
test('sans chiffrement disponible : fonctionnement dégradé signalé, données conservées',async()=>{
  const env=setup({noVault:true});const flow=await linkedFlow(env);
  const l=await env.call('flows');assert.equal(l.encryption,false);assert.equal(l.flows[0].encrypted,false);
  assert.equal(l.flows[0].id,flow.id);
});
test('migration : anciennes données sans Flow intactes, point de reprise relié lié sur demande, données corrompues mises de côté',async()=>{
  const env=setup();
  env.fb.store.ai_flow_drafts_v1=[{id:'old',kind:'checkpoint',title:'Ancien',url:CL,destUrl:GP,createdAt:1,updatedAt:1}];
  env.fb.store.ai_flow_flows_v1={v:1,flows:[{id:'broken',ends:[]}]};
  const l=await env.call('flows');assert.equal(l.flows.length,0);assert.equal(l.quarantined,1);
  const f=await env.call('flowLinkCheckpoint',{checkpointId:'old'});
  assert.equal(f.ends[0].firstSync,true);
  env.fb.addTab(CL);env.convs[CL]=[{id:'c1',role:'user',text:'Bonjour'}];
  const r=await env.call('syncCapture',{flowId:f.id,from:CL});assert.equal(r.delta.firstSync,true);
  assert.equal((await env.call('flowLinkCheckpoint',{checkpointId:'old'})).id,f.id,'pas de second Flow sur les mêmes conversations');
});

// Regressions de reprise : une prévisualisation périmée ou illisible ne consomme aucun contexte.
test('préparation depuis une ancienne capture refusée sans annuler le nouveau brouillon',async()=>{
  const env=setup(),flow=await linkedFlow(env),{call,convs}=env;
  convs[GP]=[{id:'g1',role:'user',text:'On garde SQLite pour la base.'}];
  const old=await syncOnce(env,flow.id,GP);
  await call('syncState',{flowId:flow.id,entryId:old.p.entryId,state:'confirmed'});
  convs[GP].push({id:'g2',role:'assistant',text:'J’ai ajouté la FAQ.'});
  await syncOnce(env,flow.id,GP);
  const before=JSON.stringify(env.fb.store);
  await assert.rejects(call('syncPrepare',{flowId:flow.id,from:GP,to:CL,baseRev:old.r.flow.rev,packet:old.packet,seen:old.r.seen}),/récupère à nouveau/);
  assert.equal(JSON.stringify(env.fb.store),before);
  await assert.rejects(call('syncPrepare',{flowId:flow.id,from:GP,to:CL,packet:old.packet,seen:old.r.seen}),/récupère à nouveau/);
  assert.equal(JSON.stringify(env.fb.store),before);
});
test('insertion périmée refusée avant de toucher la conversation de destination',async()=>{
  const env=setup(),flow=await linkedFlow(env),{call,convs}=env;
  convs[GP]=[{id:'g1',role:'assistant',text:'J’ai terminé la grille des prix.'}];
  convs[CL].push({id:'c3',role:'assistant',text:'J’ai ajouté la FAQ.'});
  const old=await syncOnce(env,flow.id,GP),other=await syncOnce(env,flow.id,CL);
  await call('syncState',{flowId:flow.id,entryId:other.p.entryId,state:'confirmed'});
  const before=JSON.stringify(env.fb.store);
  await assert.rejects(call('syncInsert',{flowId:flow.id,entryId:old.p.entryId,text:old.packet}),/a changé/);
  assert.equal(JSON.stringify(env.fb.store),before);
  assert.ok([...env.fb.tabs.values()].every(t=>!t.inserted));
});
for(const damage of ['missing-draft','corrupt-draft','lost-key','corrupt-decisions']){
  test('confirmation préserve intégralement les données : '+damage,async()=>{
    const env=setup(),flow=await linkedFlow(env),{call,convs}=env;
    convs[GP]=[{id:'g1',role:'user',text:'On garde SQLite pour la base.'}];
    const s=await syncOnce(env,flow.id,GP);
    const raw=env.fb.store.ai_flow_flows_v1.flows[0];
    if(damage==='missing-draft')raw.ledger[0].draft=null;
    if(damage==='corrupt-draft')raw.ledger[0].draft.sealed.ct='invalid';
    if(damage==='lost-key')env.ctx.__AIFLOW_VAULT_MEMORY__.key=null;
    if(damage==='corrupt-decisions')raw.sealed.ct='invalid';
    const before=JSON.stringify(env.fb.store);
    await assert.rejects(call('syncState',{flowId:flow.id,entryId:s.p.entryId,state:'confirmed'}),/illisible/);
    assert.equal(JSON.stringify(env.fb.store),before,'ni référence, ni décisions, ni point de reprise modifiés');
  });
}
test('Flow illisible : préparation refusée sans remplacer le brouillon récupérable',async()=>{
  const env=setup(),flow=await linkedFlow(env),{call,convs}=env;
  convs[GP]=[{id:'g1',role:'assistant',text:'J’ai ajouté la FAQ.'}];
  const s=await syncOnce(env,flow.id,GP);
  env.ctx.__AIFLOW_VAULT_MEMORY__.key=null;
  const before=JSON.stringify(env.fb.store);
  await assert.rejects(call('syncPrepare',{flowId:flow.id,baseRev:s.r.flow.rev,from:GP,to:CL,packet:s.packet,seen:s.r.seen}),/illisible/);
  assert.equal(JSON.stringify(env.fb.store),before);
});
test('reprise après interruption : une insertion déjà en attente est revalidée',async()=>{
  const env=setup(),flow=await linkedFlow(env),{call,convs}=env;
  convs[GP]=[{id:'g1',role:'assistant',text:'J’ai terminé la grille des prix.'}];
  convs[CL].push({id:'c3',role:'assistant',text:'J’ai ajouté la FAQ.'});
  const old=await syncOnce(env,flow.id,GP),other=await syncOnce(env,flow.id,CL);
  await env.T.setEntryState(flow.id,old.p.entryId,'pending-insert');
  await call('syncState',{flowId:flow.id,entryId:other.p.entryId,state:'confirmed'});
  const before=JSON.stringify(env.fb.store);
  await assert.rejects(call('syncInsert',{flowId:flow.id,entryId:old.p.entryId,text:old.packet}),/a changé/);
  assert.equal(JSON.stringify(env.fb.store),before);
  assert.ok([...env.fb.tabs.values()].every(t=>!t.inserted));
  // Confirmer à nouveau une entrée déjà confirmée reste idempotent.
  await call('syncState',{flowId:flow.id,entryId:other.p.entryId,state:'confirmed'});
  assert.equal(JSON.stringify(env.fb.store),before);
});
