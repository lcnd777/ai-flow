// Infrastructure de développement : signature des mises à jour, appcast, identifiants stables, versions, sauvegarde.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fakeBrowser,load}=require('./helpers.cjs');
const ROOT=path.join(__dirname,'..');
const yaml=fs.readFileSync(path.join(ROOT,'macos','project.yml'),'utf8');
const workflow=fs.readFileSync(path.join(ROOT,'.github','workflows','dev-macos.yml'),'utf8');
const imp=f=>import(path.join(ROOT,'tools','dev',f));

test('signature Ed25519 : archive authentique acceptée, archive modifiée ou autre clé refusées',async()=>{
  const S=await imp('sparkle.mjs');
  const k=S.generate(),other=S.generate();
  const bytes=Buffer.from('archive AI Flow Dev build 42');
  const sig=S.sign(bytes,S.privateKeyFromSeed(k.privateSeed));
  assert.equal(S.verify(bytes,sig,S.publicKeyFromB64(k.publicKey)),true);
  assert.equal(S.verify(Buffer.from('archive modifiée'),sig,S.publicKeyFromB64(k.publicKey)),false);
  assert.equal(S.verify(bytes,sig,S.publicKeyFromB64(other.publicKey)),false);
  assert.equal(Buffer.from(k.publicKey,'base64').length,32,'format SUPublicEDKey : 32 octets');
  assert.throws(()=>S.privateKeyFromSeed('trop-court'),/32 octets/);
});
test('appcast : version, build, taille, signature ; clé non conforme à l’app refusée',async()=>{
  const S=await imp('sparkle.mjs'),P=await imp('publish-appcast.mjs');
  const k=S.generate(),bytes=Buffer.alloc(2048,7);
  const xml=P.buildAppcast({bytes,build:'12',version:'0.10.0',url:'https://example.test/AI-Flow-Dev-12.zip?a=1&b=2',privateSeed:k.privateSeed,expectedPublicKey:k.publicKey,notes:'Correctif ]]> test'});
  const [item]=S.parseAppcast(xml);
  assert.equal(item.build,'12');assert.equal(item.shortVersion,'0.10.0');assert.equal(item.length,2048);
  assert.equal(item.url,'https://example.test/AI-Flow-Dev-12.zip?a=1&b=2');
  assert.ok(S.verify(bytes,item.signature,S.publicKeyFromB64(k.publicKey)));
  assert.match(xml,/xmlns:sparkle="http:\/\/www\.andymatuschak\.org\/xml-namespaces\/sparkle"/);
  assert.throws(()=>P.buildAppcast({bytes,build:'1',version:'0.1.0',url:'x',privateSeed:k.privateSeed,expectedPublicKey:S.generate().publicKey}),/ne correspond pas/);
});
test('identifiants stables, canal de développement séparé de la version publique',()=>{
  assert.match(yaml,/PRODUCT_BUNDLE_IDENTIFIER: ai\.flow\.dev\n/);
  assert.match(yaml,/PRODUCT_BUNDLE_IDENTIFIER: ai\.flow\.dev\.Extension\n/,'extension = identifiant de l’app + .Extension (utilisé par le composant natif)');
  assert.match(yaml,/CFBundleURLSchemes: \[aiflow-dev\]/);
  assert.match(yaml,/AIFlowURLScheme: aiflow-dev/);
  const handler=fs.readFileSync(path.join(ROOT,'native','SafariWebExtensionHandler.swift'),'utf8');
  assert.match(handler,/forInfoDictionaryKey: "AIFlowURLScheme"\) as\? String \?\? "aiflow"/,'app publique : schéma aiflow par défaut');
  const key=(yaml.match(/SUPublicEDKey: (\S+)/)||[])[1];
  assert.equal(Buffer.from(key,'base64').length,32);
  assert.match(workflow,/CFBundleIdentifier\)" = "ai\.flow\.dev"/,'la CI refuse un build dont l’identifiant aurait changé');
  assert.match(workflow,/CURRENT_PROJECT_VERSION="\$BUILD"/);assert.match(workflow,/BUILD: \$\{\{ github\.run_number \}\}/,'numéro de build toujours croissant');
});
test('manifest de développement : nom distinct, version toujours croissante',async()=>{
  const R=await imp('prepare-resources.mjs');
  const m=JSON.parse(fs.readFileSync(path.join(ROOT,'safari','manifest.json'),'utf8'));
  const a=R.devManifest(m,9),b=R.devManifest(m,10);
  assert.equal(a.name,'AI Flow Dev');assert.equal(a.version,m.version.split('.').slice(0,3).join('.')+'.9');
  const n=v=>v.split('.').map(Number).reduce((s,x)=>s*100000+x,0);
  assert.ok(n(b.version)>n(a.version));
  assert.equal(a.permissions.join(),m.permissions.join(),'mêmes permissions : rien à réautoriser');
  assert.throws(()=>R.devManifest(m,0));assert.throws(()=>R.devManifest(m,'abc'));
});
test('sauvegarde → restauration : réglages, historique, points de reprise et relances conservés',async()=>{
  const fb=fakeBrowser();
  const ctx=load(['platforms.js','shared.js','readers.js','background.js'],{browser:fb.browser,__AIFLOW_TEST__:{}});
  const T=ctx.__AIFLOW_TEST__;
  fb.store.ai_flow_state_v1={settings:{alertThreshold:70,awakeMode:'wake'},metrics:{'claude.session':{percent:42,source:'observed',observedAt:Date.now(),resetAt:Date.now()+3600000}}};
  fb.store.ai_flow_history_v2={series:{'claude.session':[[Date.now()-60000,40,0],[Date.now(),42,0]]},resets:[],limits:[]};
  fb.store.ai_flow_drafts_v1=[{id:'cp1',title:'Refonte tarifs',fields:{goal:'Livrer'},createdAt:1,updatedAt:2}];
  fb.store.ai_flow_resume_v1={j1:{id:'j1',platform:'claude',url:'https://claude.ai/chat/a',message:'Continue',at:Date.now()+3600000}};
  fb.store.unrelated_key='hors AI Flow';
  const backup=JSON.parse(JSON.stringify(await T.exportData()));
  assert.ok(!('unrelated_key' in backup.data));
  const fb2=fakeBrowser();
  const ctx2=load(['platforms.js','shared.js','readers.js','background.js'],{browser:fb2.browser,__AIFLOW_TEST__:{}});
  const r=await ctx2.__AIFLOW_TEST__.importData(backup);
  assert.equal(r.keys,4);
  const s=ctx2.AIFlow.clean(fb2.store.ai_flow_state_v1);
  assert.equal(s.settings.alertThreshold,70);assert.equal(s.settings.awakeMode,'wake');
  assert.equal(fb2.store.ai_flow_history_v2.series['claude.session'].length,2);
  assert.equal(fb2.store.ai_flow_drafts_v1[0].title,'Refonte tarifs');
  assert.ok(fb2.alarms.has('ai-flow-resume:j1'),'relance réarmée après restauration');
  await assert.rejects(()=>ctx2.__AIFLOW_TEST__.importData({format:'autre',data:{}}),/non reconnu/);
  await assert.rejects(()=>ctx2.__AIFLOW_TEST__.importData({format:'ai-flow-backup',schema:1,data:{evil:'x'}}),/vide/);
});
