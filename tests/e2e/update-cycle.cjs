// Cycle complet de mise à jour, simulé dans Chromium :
// installation initiale → publication d'une nouvelle version (archive signée + appcast) → mise à jour de
// l'installation existante (vérifications équivalentes à Sparkle) → redémarrage → données conservées.
// Rechargement rapide : modification des fichiers installés + bouton « Recharger l'extension ».
// Ne remplace PAS un test de l'app macOS (Sparkle, signature Apple, Safari) : impossible sans Mac.
// Usage : xvfb-run -a node tests/e2e/update-cycle.cjs
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{execFileSync}=require('node:child_process');
const ROOT=path.join(__dirname,'..','..');
const results=[];let failed=0;
const check=(name,ok,detail='')=>{results.push(`${ok?'✓':'✗'} ${name}${!ok&&detail?' — '+detail:''}`);if(!ok)failed++;};

(async()=>{
  const S=await import(path.join(ROOT,'tools','dev','sparkle.mjs'));
  const R=await import(path.join(ROOT,'tools','dev','prepare-resources.mjs'));
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'aiflow-cycle-'));
  const install=path.join(work,'AI Flow Dev'),profile=path.join(work,'profil'),www=path.join(work,'www');
  fs.mkdirSync(www);
  const key=S.generate();
  // Variante Chromium du build de développement (même transformation que tools/build.mjs).
  const buildVersion=(build,dest)=>{
    const m=R.prepare(ROOT,build,dest);
    m.background={service_worker:'background.js'};m.permissions=m.permissions.filter(p=>p!=='nativeMessaging').concat('notifications');
    fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(m,null,2));
    return m;
  };
  const launch=()=>chromium.launchPersistentContext(profile,{headless:false,args:[`--disable-extensions-except=${install}`,`--load-extension=${install}`,'--no-first-run']});
  const ext=async ctx=>{let [sw]=ctx.serviceWorkers();if(!sw)sw=await ctx.waitForEvent('serviceworker');return {sw,id:new URL(sw.url()).host};};
  const VER=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','safari','manifest.json'),'utf8')).version;
  const installedBuild=()=>Number(JSON.parse(fs.readFileSync(path.join(install,'manifest.json'),'utf8')).version.split('.')[3]);

  // 1. Installation initiale (build 1) et données de l'utilisateur.
  buildVersion(1,install);
  let ctx=await launch(),{sw,id}=await ext(ctx);
  const firstId=id;
  let opt=await ctx.newPage();await opt.goto(`chrome-extension://${id}/options.html`);await opt.waitForTimeout(800);
  check('Installation initiale : version 1 affichée',new RegExp(VER.replace(/\./g,'\\.')+' dev 1').test(await opt.locator('#dev-version').innerText()));
  await opt.locator('#threshold').selectOption('70');await opt.waitForTimeout(300);
  await opt.locator('input[name="awakeMode"][value="wake"]').check();await opt.waitForTimeout(300);
  await sw.evaluate(()=>chrome.storage.local.set({
    ai_flow_drafts_v1:[{id:'cp1',kind:'checkpoint',title:'Refonte page tarifs',fields:{goal:'Livrer la V1'},createdAt:Date.now(),updatedAt:Date.now()}],
    ai_flow_history_v2:{series:{'claude.session':[[Date.now()-120000,40,0],[Date.now(),46,0]]},resets:[],limits:[]}}));
  const before=await sw.evaluate(()=>chrome.storage.local.get(null));
  await ctx.close();

  // 2. Publication d'une nouvelle version : archive + signature Ed25519 + appcast.
  const stage=path.join(work,'build-2');
  buildVersion(2,stage);
  fs.writeFileSync(path.join(stage,'BUILD.txt'),'Nouvelle version publiée par la CI\n');
  const zip=path.join(www,'AI-Flow-Dev-2.zip');
  execFileSync('zip',['-qr',zip,'.'],{cwd:stage});
  const P=await import(path.join(ROOT,'tools','dev','publish-appcast.mjs'));
  const server=http.createServer((q,res)=>{const f=path.join(www,decodeURIComponent(new URL(q.url,'http://x').pathname));if(!f.startsWith(www)||!fs.existsSync(f)){res.writeHead(404).end();return;}res.end(fs.readFileSync(f));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  fs.writeFileSync(path.join(www,'appcast.xml'),P.buildAppcast({bytes:fs.readFileSync(zip),build:'2',version:'0.10.0',url:`${base}/AI-Flow-Dev-2.zip`,privateSeed:key.privateSeed,expectedPublicKey:key.publicKey}));
  // Appcast piégé : même archive annoncée, mais signée par une autre clé.
  fs.writeFileSync(path.join(www,'appcast-pirate.xml'),P.buildAppcast({bytes:fs.readFileSync(zip),build:'3',version:'0.10.0',url:`${base}/AI-Flow-Dev-2.zip`,privateSeed:S.generate().privateSeed}));

  // 3. Mise à jour de l'installation existante (mêmes contrôles que Sparkle : version, taille, signature).
  async function update(feed){
    const [item]=S.parseAppcast(await (await fetch(feed)).text());
    if(!item||Number(item.build)<=installedBuild())return 'à jour';
    const bytes=Buffer.from(await (await fetch(item.url)).arrayBuffer());
    if(bytes.length!==item.length)return 'taille incorrecte';
    if(!S.verify(bytes,item.signature,S.publicKeyFromB64(key.publicKey)))return 'signature refusée';
    const tmp=path.join(work,'extraction-'+item.build);fs.writeFileSync(tmp+'.zip',bytes);
    execFileSync('unzip',['-q','-o',tmp+'.zip','-d',tmp]);
    fs.rmSync(install,{recursive:true,force:true});fs.renameSync(tmp,install);
    return 'installée';
  }
  check('Mise à jour piégée (autre clé) refusée, installation intacte',await update(`${base}/appcast-pirate.xml`)==='signature refusée'&&installedBuild()===1);
  check('Mise à jour authentique installée',await update(`${base}/appcast.xml`)==='installée'&&installedBuild()===2);
  check('Aucune mise à jour proposée une fois à jour',await update(`${base}/appcast.xml`)==='à jour');
  server.close();

  // 4. Redémarrage : nouvelle version active, même identifiant, données conservées.
  ctx=await launch();({sw,id}=await ext(ctx));
  check('Identifiant de l’extension inchangé',id===firstId,`${firstId} → ${id}`);
  opt=await ctx.newPage();await opt.goto(`chrome-extension://${id}/options.html`);await opt.waitForTimeout(800);
  check('Version 2 active après mise à jour',new RegExp(VER.replace(/\./g,'\\.')+' dev 2').test(await opt.locator('#dev-version').innerText()));
  const after=await sw.evaluate(()=>chrome.storage.local.get(null));
  check('Réglages conservés (seuil 70 %, réveil programmé)',after.ai_flow_state_v1?.settings?.alertThreshold===70&&after.ai_flow_state_v1?.settings?.awakeMode==='wake');
  check('Point de reprise conservé',after.ai_flow_drafts_v1?.[0]?.title==='Refonte page tarifs');
  check('Historique conservé',after.ai_flow_history_v2?.series?.['claude.session']?.length===2);
  check('Aucune donnée perdue',Object.keys(before).every(k=>k in after),Object.keys(before).filter(k=>!(k in after)).join());
  const pop=await ctx.newPage();await pop.goto(`chrome-extension://${id}/popup.html`);await pop.waitForTimeout(800);
  check('Fenêtre AI Flow fonctionnelle après mise à jour',/Claude/.test(await pop.locator('body').innerText()));

  // 5. Test rapide : fichiers modifiés sur le disque (synchronisation) → nouvelle version au prochain chargement.
  // Le bouton « Recharger l'extension » appelle runtime.reload() ; dans ce banc de test, Chromium lancé avec
  // --disable-extensions-except désactive l'extension rechargée : ce bouton est donc vérifié par un redémarrage.
  const m=JSON.parse(fs.readFileSync(path.join(install,'manifest.json'),'utf8'));m.version_name='0.10.0 dev 2 + correctif';
  fs.writeFileSync(path.join(install,'manifest.json'),JSON.stringify(m,null,2));
  await ctx.close();ctx=await launch();({sw,id}=await ext(ctx));
  const opt2=await ctx.newPage();await opt2.goto(`chrome-extension://${id}/options.html`);await opt2.waitForTimeout(800);
  check('Fichiers modifiés pris en compte au rechargement',/correctif/.test(await opt2.locator('#dev-version').innerText()));
  check('Données toujours là après rechargement',(await opt2.evaluate(()=>chrome.storage.local.get('ai_flow_drafts_v1'))).ai_flow_drafts_v1?.length===1);
  check('Bouton « Recharger l’extension » présent',await opt2.locator('#dev-reload').isVisible());
  await opt2.screenshot({path:path.join(process.argv[2]||work,'options-dev.png'),fullPage:false});
  await ctx.close();
  console.log(results.join('\n'));console.log(`\n${results.length-failed}/${results.length} vérifications réussies`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);console.log(results.join('\n'));process.exit(2);});
