const test=require('node:test'),assert=require('node:assert/strict');
const {core,runReader}=require('./helpers.cjs');
const C=core(),R=C.AIFlowReaders;
const plain=x=>JSON.parse(JSON.stringify(x));
const ORG='0b2c6c1e-1234-4abc-8def-001122334455';
const future=h=>new Date(Date.now()+h*3600000).toISOString();

test('Claude : session, semaine et modèles via limits[]',async()=>{
  const {result,calls}=await runReader(C,R.claude,'claude.ai',url=>{
    if(url.endsWith('/api/organizations'))return {body:[{uuid:ORG,capabilities:['chat']}]};
    if(url.endsWith(`/api/organizations/${ORG}/usage`))return {body:{limits:[{kind:'session',percent:42,resets_at:future(2)},{kind:'weekly_all',utilization:'17.5',resets_at:future(48)},{kind:'weekly_scoped',scope:{model:{display_name:'Claude Opus 4'}},percent:5}]}};
  });
  assert.equal(result.status,'ok');
  assert.deepEqual(plain(result.readings.map(r=>[r.id,r.percent])),[['claude.session',42],['claude.weekly',17.5],['claude.opus',5]]);
  assert.ok(calls.every(c=>c.url.startsWith('https://claude.ai/')&&(c.init.method||'GET')==='GET'),'GET uniquement, même origine');
});
test('Claude : ancien format five_hour / seven_day et 0 % accepté',async()=>{
  const {result}=await runReader(C,R.claude,'claude.ai',url=>url.endsWith('/organizations')?{body:{organizations:[{uuid:ORG}]}}:{body:{five_hour:{utilization:0,resets_at:future(1)},seven_day:{utilization:63}}});
  assert.equal(result.status,'ok');assert.equal(result.readings[0].percent,0);
});
test('Claude : refuse les valeurs nulles, booléennes ou hors bornes',async()=>{
  const {result}=await runReader(C,R.claude,'claude.ai',url=>url.endsWith('/organizations')?{body:[{uuid:ORG}]}:{body:{five_hour:{utilization:null},seven_day:{utilization:true},limits:[{kind:'session',percent:180}]}});
  assert.equal(result.status,'no-figures');
});
test('Claude : connexion requise, organisations ambiguës, mauvais domaine',async()=>{
  assert.equal((await runReader(C,R.claude,'claude.ai',()=>({status:403}))).result.status,'login');
  assert.equal((await runReader(C,R.claude,'claude.ai',()=>({body:[{uuid:ORG,capabilities:['chat']},{uuid:ORG.replace('0b','1c'),capabilities:['chat']}]}))).result.status,'org-ambiguous');
  assert.equal((await runReader(C,R.claude,'evil.example',()=>({body:{}}))).result.status,'wrong-origin');
  assert.equal((await runReader(C,R.claude,'claude.ai',()=>new TypeError('offline'))).result.status,'network');
});
test('Codex : fenêtres 5 h / 7 j et revue de code ; le jeton ne sort jamais',async()=>{
  const token='aaa.'+Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:'acct-123456789'}})).toString('base64url')+'.sig';
  const {result,calls}=await runReader(C,R.codex,'chatgpt.com',url=>{
    if(url.endsWith('/api/auth/session'))return {body:{accessToken:token}};
    if(url.endsWith('/backend-api/wham/usage'))return {body:{rate_limit:{primary_window:{limit_window_seconds:18000,used_percent:12,reset_at:Math.floor(Date.now()/1000)+3600},secondary_window:{limit_window_seconds:604800,used_percent:48}},code_review_rate_limit:{primary_window:{limit_window_seconds:604800,used_percent:3}}}};
  });
  assert.equal(result.status,'ok');
  assert.deepEqual(plain(result.readings.map(r=>[r.id,r.percent])),[['codex.session',12],['codex.weekly',48],['codex.review',3]]);
  assert.ok(!JSON.stringify(result).includes(token)&&!JSON.stringify(result).includes('acct-123456789'),'aucun jeton ni identifiant complet renvoyé');
  assert.equal(calls[1].init.headers['ChatGPT-Account-Id'],'acct-123456789');
  assert.ok(calls.every(c=>c.url.startsWith('https://chatgpt.com/')));
});
test('Codex : fenêtre inconnue jamais étiquetée session ou semaine',async()=>{
  const {result}=await runReader(C,R.codex,'chatgpt.com',url=>url.endsWith('/session')?{body:{accessToken:'t'}}:{body:{rate_limit:{primary_window:{limit_window_seconds:3600,used_percent:50}}}});
  assert.equal(result.status,'no-figures');
  assert.equal((await runReader(C,R.codex,'chatgpt.com',()=>({body:{}}))).result.status,'login','pas de jeton = connexion requise');
});
test('Grok (expérimental) : pourcentage dérivé des requêtes restantes',async()=>{
  const {result,calls}=await runReader(C,R.grok,'grok.com',(url,init)=>{
    const body=JSON.parse(init.body);
    return body.modelName==='grok-4'?{body:{windowSizeSeconds:7200,remainingQueries:15,totalQueries:20}}:{status:500};
  });
  assert.equal(result.status,'ok');
  assert.equal(result.readings[0].percent,25);
  assert.match(result.readings[0].detail,/15\/20 restantes · fenêtre 2 h/);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://grok.com/rest/rate-limits');
});
test('Grok : réponse incohérente → aucune valeur inventée',async()=>{
  const {result}=await runReader(C,R.grok,'grok.com',()=>({body:{windowSizeSeconds:7200,remainingQueries:30,totalQueries:20}}));
  assert.equal(result.status,'no-figures');
  assert.equal((await runReader(C,R.grok,'grok.com',()=>({status:401}))).result.status,'login');
  const z=await runReader(C,R.grok,'grok.com',()=>({body:{windowSizeSeconds:7200,remainingQueries:0,totalQueries:20,waitTimeSeconds:600}}));
  assert.equal(z.result.readings[0].percent,100);assert.ok(z.result.readings[0].resetAt>Date.now());
});
