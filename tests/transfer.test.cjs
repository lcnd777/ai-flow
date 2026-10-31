// Smart Transfer 2.0 : lecture de la conversation (sur clic), ordre et rôles, budget, points de reprise, Flow Recovery.
const test=require('node:test'),assert=require('node:assert/strict');
const {core,runReader,fakeBrowser,load}=require('./helpers.cjs');
const C=core(),A=C.AIFlow,R=C.AIFlowReaders;
const plain=x=>JSON.parse(JSON.stringify(x));
const ORG='0b2c6c1e-1234-4abc-8def-001122334455',CONV='11111111-2222-4333-8444-555555555555';

test('Claude : messages dans l’ordre, rôles distincts, via l’API de la conversation ouverte',async()=>{
  const calls=[],saved={l:C.location,f:C.fetch};
  C.document={title:'Ma conv - Claude',querySelectorAll:()=>[]};
  C.location={protocol:'https:',hostname:'claude.ai',pathname:'/chat/'+CONV};
  C.fetch=async url=>{calls.push(url);
    const body=url.endsWith('/api/organizations')?[{uuid:ORG,capabilities:['chat']}]:url.includes(`/chat_conversations/${CONV}`)?{name:'Refonte',chat_messages:[{index:1,sender:'assistant',text:'Réponse'},{index:0,sender:'human',content:[{type:'text',text:'Question'}]}]}:null;
    return {status:body?200:404,ok:!!body,json:async()=>body};};
  const result=await R.claudeConversation();
  C.location=saved.l;C.fetch=saved.f;
  assert.equal(result.status,'ok');assert.equal(result.title,'Refonte');
  assert.deepEqual(plain(result.messages),[{role:'user',text:'Question'},{role:'assistant',text:'Réponse'}]);
  assert.ok(calls.every(u=>u.startsWith('https://claude.ai/')),'même origine uniquement');
});
test('Claude : repli sur la page affichée si l’API ne répond pas',async()=>{
  const saved={l:C.location,f:C.fetch};
  const node=(user,text)=>({innerText:text,matches:()=>user,contains:()=>false});
  const nodes=[node(true,'Q1'),node(false,'R1')];
  C.document={title:'X - Claude',querySelectorAll:()=>nodes};
  C.location={protocol:'https:',hostname:'claude.ai',pathname:'/chat/'+CONV};
  C.fetch=async()=>({status:500,ok:false,json:async()=>null});
  const r=await R.claudeConversation();
  C.location=saved.l;C.fetch=saved.f;
  assert.equal(r.status,'partial');assert.equal(r.source,'page');
  assert.deepEqual(plain(r.messages),[{role:'user',text:'Q1'},{role:'assistant',text:'R1'}]);
});
test('ChatGPT : lecture complète quand le chemin est une conversation',async()=>{
  C.document={title:'Conv',querySelectorAll:()=>[]};
  const saved=C.location;
  const fetchRoutes=url=>{
    if(url.endsWith('/api/auth/session'))return {body:{accessToken:'secret-token'}};
    if(url.includes('/backend-api/conversation/abc'))return {body:{title:'Plan',current_node:'c',mapping:{
      r:{message:{author:{role:'system'},content:{parts:['sys']}},parent:null},
      a:{message:{author:{role:'user'},content:{parts:['Salut']}},parent:'r'},
      x:{message:{author:{role:'assistant'},content:{parts:['Branche abandonnée']}},parent:'a'},
      b:{message:{author:{role:'assistant'},content:{parts:['Bonjour']}},parent:'a'},
      c:{message:{author:{role:'user'},content:{parts:['Suite']}},parent:'b'}}}};
  };
  C.fetch=async(url,init)=>{const r=fetchRoutes(url);return {status:200,ok:true,json:async()=>r.body};};
  C.location={protocol:'https:',hostname:'chatgpt.com',pathname:'/c/abc'};
  const result=await R.chatgptConversation();
  C.location=saved;
  assert.equal(result.status,'ok');assert.equal(result.title,'Plan');
  assert.deepEqual(plain(result.messages),[{role:'user',text:'Salut'},{role:'assistant',text:'Bonjour'},{role:'user',text:'Suite'}]);
  assert.ok(!JSON.stringify(result).includes('secret-token'));
});
test('transcript : objectif + derniers échanges, omissions signalées, budget respecté',()=>{
  const msgs=[];for(let i=0;i<60;i++)msgs.push({role:i%2?'assistant':'user',text:(i%2?'Réponse ':'Demande ')+i+' '+'x'.repeat(900)});
  const t=A.buildTranscript(msgs,15000,{user:'Moi',assistant:'Claude'});
  assert.ok(t.text.length<=16500,String(t.text.length));
  assert.match(t.text,/^\*\*Moi :\*\*\nDemande 0/);
  assert.match(t.text,/messages intermédiaires omis/);
  assert.match(t.text,/Réponse 59/);
  assert.ok(t.text.indexOf('Demande 0')<t.text.indexOf('Réponse 59'),'ordre conservé');
  assert.equal(t.total,60);assert.equal(t.included+t.omitted,60);
});
test('pré-remplissage prudent depuis la conversation',()=>{
  const p=A.prefillFromMessages([{role:'user',text:'Objectif : livrer la V1'},{role:'assistant',text:'ok'},{role:'user',text:'Maintenant écris les tests'}]);
  assert.equal(p.goal,'Objectif : livrer la V1');assert.equal(p.next,'Maintenant écris les tests');
});
test('message de reprise : champs structurés puis derniers échanges',()=>{
  const m=A.buildHandoff({goal:'Livrer',decisions:'React'},'Claude','ChatGPT','**Moi :**\nHello');
  assert.ok(m.indexOf('## Objectif')<m.indexOf('## Décisions')&&m.indexOf('## Décisions')<m.indexOf('## Derniers échanges'));
});
test('points de reprise : anciennes reprises (0.8) conservées, liens limités aux conversations',()=>{
  const list=A.cleanCheckpoints([{id:'1',title:'Ancienne',fields:{goal:'x'},createdAt:1},{id:'2',title:'Lien',url:'https://evil.example/x',createdAt:2},{id:'3',kind:'interruption',url:'https://claude.ai/chat/abc/',platform:'claude',createdAt:3}]);
  assert.equal(list.length,3);
  assert.equal(list.find(d=>d.id==='1').kind,'checkpoint');
  assert.equal(list.find(d=>d.id==='2').url,null,'lien externe refusé');
  assert.equal(list.find(d=>d.id==='3').url,'https://claude.ai/chat/abc');
});
test('Flow Recovery : limite atteinte → travail noté, quota rouvert → proposé à la reprise',async()=>{
  const fb=fakeBrowser();
  const ctx=load(['platforms.js','shared.js','readers.js','background.js'],{browser:fb.browser,__AIFLOW_TEST__:{}});
  fb.addTab('https://claude.ai/chat/abc',{active:true,title:'Refonte tarifs - Claude'});
  await ctx.__AIFLOW_TEST__.recordInterruptions([{type:'reached',platform:'claude',id:'claude.session',resetAt:Date.now()+3600000}],[]);
  let d=fb.store.ai_flow_drafts_v1;
  assert.equal(d.length,1);assert.equal(d[0].title,'Refonte tarifs');assert.equal(d[0].status,'open');assert.equal(d[0].preview,'','aucun contenu de conversation enregistré');
  const notices=[{platform:'claude',type:'reset',body:'Claude est de nouveau disponible.'}];
  await ctx.__AIFLOW_TEST__.recordInterruptions([{type:'reset',platform:'claude',id:'claude.session'}],notices);
  d=fb.store.ai_flow_drafts_v1;
  assert.equal(d[0].status,'ready');assert.equal(notices[0].url,'https://claude.ai/chat/abc');assert.match(notices[0].body,/Reprendre « Refonte tarifs »/);
});
test('capture : refusée hors conversation Claude / ChatGPT',async()=>{
  const fb=fakeBrowser();
  const ctx=load(['platforms.js','shared.js','readers.js','background.js'],{browser:fb.browser,__AIFLOW_TEST__:{}});
  const t=fb.addTab('https://example.com/');
  await assert.rejects(()=>ctx.__AIFLOW_TEST__.captureConversation(t.id),/Ouvre une conversation/);
});
