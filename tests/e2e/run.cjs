// Test d'intégration : extension réelle (build Chrome/Edge) dans Chromium, sites officiels SIMULÉS.
// Usage : xvfb-run -a node tests/e2e/run.cjs [dossier-captures]
const {chromium}=require('playwright');
const path=require('node:path'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..','..');
const shots=process.argv[2]||path.join(root,'dist','shots');
fs.mkdirSync(shots,{recursive:true});
execFileSync('node',[path.join(root,'tools','build.mjs')],{stdio:'inherit'});
const ext=path.join(root,'dist','chrome-edge');
const ORG='0b2c6c1e-1234-4abc-8def-001122334455',CONV='11111111-2222-4333-8444-555555555555';
const H=3600000,iso=ms=>new Date(Date.now()+ms).toISOString();
const results=[];let failed=0;
function check(name,cond,detail=''){results.push(`${cond?'✓':'✗'} ${name}${!cond&&detail?' — '+detail:''}`);if(!cond)failed++;}

let claude={five_hour:{utilization:30,resets_at:iso(2*H)},seven_day:{utilization:20,resets_at:iso(70*H)}};
let codexUsed=12;
const page=(title,body='')=>`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;background:#f6f6f2;min-height:100vh;margin:0;padding:30px"><h1>${title} (simulé)</h1>${body}</body></html>`;
const composer=`<div class="ProseMirror" contenteditable="true" style="border:1px solid #999;min-height:40px;padding:6px"></div><button aria-label="Send message" onclick="window.__sent=(document.querySelector('.ProseMirror').textContent);document.querySelector('.ProseMirror').textContent='';document.title='SENT:'+window.__sent">Send</button><p>Une conversation fictive, sans contenu réel.</p>`;

(async()=>{
  const ctx=await chromium.launchPersistentContext('',{headless:false,viewport:{width:1280,height:860},locale:'fr-FR',
    args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,'--no-first-run']});
  await ctx.route('https://claude.ai/**',r=>{
    const u=new URL(r.request().url());
    if(u.pathname==='/api/organizations')return r.fulfill({json:[{uuid:ORG,capabilities:['chat']}]});
    if(u.pathname===`/api/organizations/${ORG}/usage`)return r.fulfill({json:claude});
    if(u.pathname===`/api/organizations/${ORG}/chat_conversations/${CONV}`)return r.fulfill({json:{name:'Refonte page tarifs',chat_messages:[{index:0,sender:'human',text:'Objectif : refaire la page tarifs en trois offres.'},{index:1,sender:'assistant',text:'Proposition : Starter, Pro, Équipe.'},{index:2,sender:'human',text:'Écris maintenant la FAQ.'}]}});
    return r.fulfill({contentType:'text/html',body:page('Claude',u.pathname.startsWith('/chat/')?composer:'')});
  });
  await ctx.route('https://chatgpt.com/**',r=>{
    const u=new URL(r.request().url());
    if(u.pathname==='/api/auth/session')return r.fulfill({json:{accessToken:'fake-token-never-stored'}});
    if(u.pathname==='/backend-api/wham/usage')return r.fulfill({json:{rate_limit:{primary_window:{limit_window_seconds:18000,used_percent:codexUsed,reset_at:Math.floor(Date.now()/1000)+3*3600},secondary_window:{limit_window_seconds:604800,used_percent:41}}}});
    return r.fulfill({contentType:'text/html',body:page('ChatGPT',composer)});
  });
  let [sw]=ctx.serviceWorkers();if(!sw)sw=await ctx.waitForEvent('serviceworker');
  const id=new URL(sw.url()).host,E=p=>`chrome-extension://${id}/${p}`;
  const tabsInfo=async()=>sw.evaluate(async()=>{const ctxs=await chrome.runtime.getContexts({contextTypes:['TAB']});const tabs=await chrome.tabs.query({});
    return tabs.map(t=>({url:t.url||ctxs.find(c=>c.tabId===t.id)?.documentUrl||'',pinned:t.pinned}));});
  const storage=async k=>sw.evaluate(k=>chrome.storage.local.get(k).then(v=>v[k]),k);

  // Lit le contenu du shadow DOM fermé de la pastille via le protocole DevTools.
  async function widget(p){
    const cdp=await ctx.newCDPSession(p);
    const {root}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
    const find=n=>{if(n.attributes?.includes('data-ai-flow-widget'))return n;for(const c of [...(n.children||[]),...(n.shadowRoots||[])]){const f=find(c);if(f)return f;}return null;};
    const host=find(root);if(!host)return {html:'',click:async()=>false};
    const sr=host.shadowRoots[0];
    const {outerHTML}=await cdp.send('DOM.getOuterHTML',{nodeId:sr.nodeId});
    const click=async sel=>{
      const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:sr.nodeId,selector:sel});if(!nodeId)return false;
      const {object}=await cdp.send('DOM.resolveNode',{nodeId});
      await cdp.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:'function(){this.click()}'});return true;
    };
    return {html:outerHTML,click};
  }
  const text=h=>h.replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');

  // 1. Onglets ouverts par l'utilisateur : lecture automatique sans clic.
  const pc=await ctx.newPage();await pc.goto('https://claude.ai/chat/'+CONV);
  const pg=await ctx.newPage();await pg.goto('https://chatgpt.com/c/xyz');
  await pc.bringToFront();await pc.waitForTimeout(4000);
  let st=await storage('ai_flow_state_v1');
  check('Lecture auto Claude sans clic (30 %)',st?.metrics?.['claude.session']?.percent===30,JSON.stringify(st?.metrics));
  check('Lecture auto Codex sans clic (41 % semaine)',st?.metrics?.['codex.weekly']?.percent===41);
  check('Aucun jeton dans le stockage',!JSON.stringify(await sw.evaluate(()=>chrome.storage.local.get(null))).includes('fake-token'));

  // 2. Popup compact : mêmes chiffres que la pastille.
  const pop=await ctx.newPage();await pop.setViewportSize({width:380,height:600});
  await pop.goto(E('popup.html'));await pop.waitForTimeout(1200);
  const popText=await pop.locator('body').innerText();
  check('Popup : Claude 30 %',/Claude[\s\S]*30 %/.test(popText));
  check('Popup : Codex affiché avec ses quotas',/Codex[\s\S]*41 %/.test(popText));
  check('Popup : IA sans limites lisibles retirées (ChatGPT, Gemini…)',!/Gemini|Non mesuré|Perplexity/.test(popText)&&!/\bChatGPT\b/.test(popText.replace(/ChatGPT \(Codex\)/g,'')));
  check('Popup : dernière actualisation visible',/Actualisé à \d\d:\d\d/.test(popText));
  check('Popup : « Prévoir ma session » retiré',!/Prévoir ma session|AI Runway/.test(popText));
  await pop.screenshot({path:path.join(shots,'popup-dark.png')});
  const wc=text((await widget(pc)).html);
  check('Pastille Claude = popup (30 %)',/30 % utilisés|Pas d’alerte/.test(wc),wc.slice(0,200));
  const wg=text((await widget(pg)).html);
  check('Pastille ChatGPT : Codex chiffré, sans bloc « non mesuré »',/Codex · 41 % utilisés|Pas d’alerte/.test(wg)&&!/n’expose pas les limites de messages/.test(wg),wg.slice(0,300));

  // 3. Navigation du popup : vrais onglets, non épinglés.
  for(const [label,file] of [['Paramètres','options.html'],['Tableau de bord','dashboard.html'],['Transférer','transfer.html']]){
    const p2=await ctx.newPage();await p2.setViewportSize({width:380,height:600});await p2.goto(E('popup.html'));await p2.waitForTimeout(400);
    await p2.getByRole('button',{name:label,exact:true}).click();await pop.waitForTimeout(800);
    const t=(await tabsInfo()).find(x=>x.url.startsWith(E(file)));
    check(`Popup › ${label} ouvre ${file} dans un onglet normal`,!!t&&t.pinned===false,JSON.stringify(await tabsInfo()));
    if(!p2.isClosed())await p2.close();
  }
  const before=(await tabsInfo()).filter(x=>x.url.startsWith(E('options.html'))).length;
  const p3=await ctx.newPage();await p3.goto(E('popup.html'));await p3.getByRole('button',{name:'Paramètres'}).click();await pop.waitForTimeout(600);
  check('Paramètres : onglet réutilisé (pas de doublon)',(await tabsInfo()).filter(x=>x.url.startsWith(E('options.html'))).length===before);

  // 4. Paramètres : masquer, réordonner, Awake indisponible hors Safari.
  const opt=ctx.pages().find(p=>p.url().startsWith(E('options.html')));
  await opt.bringToFront();await opt.setViewportSize({width:1100,height:900});await opt.waitForTimeout(500);
  await opt.locator('[data-visible="codex"]').uncheck();await opt.waitForTimeout(400);
  const hidden=(await storage('ai_flow_state_v1')).settings.platformHidden.codex===true;
  await opt.locator('[data-visible="codex"]').check();await opt.waitForTimeout(400);
  await opt.locator('[data-move="codex"][data-dir="-1"]').click();await opt.waitForTimeout(300);
  await opt.locator('input[name="awakeMode"][value="wake"]').check();await opt.waitForTimeout(800);
  check('Awake : mode « Réveil programmé » enregistré',(await storage('ai_flow_state_v1')).settings.awakeMode==='wake');
  check('Awake : rattrapage au réveil par défaut, expliqué (FAQ)',await opt.locator('.faq dt').count()>=5);
  await opt.locator('#threshold').selectOption('70');await opt.waitForTimeout(400);
  check('Alertes : seuil personnalisable (70 %)',(await storage('ai_flow_state_v1')).settings.alertThreshold===70);
  await opt.locator('#threshold').selectOption('90');await opt.waitForTimeout(300);
  st=await storage('ai_flow_state_v1');
  check('Paramètres : masquer / réafficher une IA enregistré',hidden&&!st.settings.platformHidden.codex);
  check('Paramètres : seules les IA mesurables listées',await opt.locator('.prow').count()===2);
  check('Paramètres : ordre modifié',st.settings.platformOrder.indexOf('codex')<st.settings.platformOrder.indexOf('claude'));
  check('Awake hors Mac : indiqué comme indisponible ici',/Mac uniquement/.test(await opt.locator('#awake-state').innerText()));
  await opt.locator('[data-setting="notifyApproaching"]').uncheck();await opt.waitForTimeout(300);
  check('Paramètres : type de notification désactivable',(await storage('ai_flow_state_v1')).settings.notifyApproaching===false);
  await opt.locator('[data-setting="notifyApproaching"]').check();
  await opt.locator('[data-setting="resumePrompt"]').check();await opt.waitForTimeout(300);
  await opt.locator('details.explain').evaluate(d=>d.open=true);
  await opt.screenshot({path:path.join(shots,'options.png'),fullPage:true});
  await opt.setViewportSize({width:390,height:844});await opt.waitForTimeout(200);
  const overflow=await opt.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  check('Paramètres : responsive (pas de défilement horizontal sur mobile)',!overflow);
  await opt.screenshot({path:path.join(shots,'options-mobile.png')});

  // 5. Pression sur Claude → Smart Switch + autonomie estimée + notification.
  const steps=[60,64,68,72,76];
  for(const v of steps){
    claude={five_hour:{utilization:v,resets_at:iso(3*H)},seven_day:{utilization:20,resets_at:iso(70*H)}};
    await sw.evaluate(async({v})=>{
      // Accélère le temps : relevés espacés de 5 min dans l'historique local.
      const s=(await chrome.storage.local.get('ai_flow_state_v1')).ai_flow_state_v1;
      if(s?.history?.['claude.session'])for(const p of s.history['claude.session'])p.ts-=5*60000;
      if(s?.metrics?.['claude.session'])s.metrics['claude.session'].observedAt-=5*60000;
      await chrome.storage.local.set({ai_flow_state_v1:s,ai_flow_auto_refresh_v1:{}});
    },{v});
    await pc.reload();await pc.waitForTimeout(1500);
  }
  claude={five_hour:{utilization:92,resets_at:iso(3*H)},seven_day:{utilization:20,resets_at:iso(70*H)}};
  await sw.evaluate(()=>chrome.storage.local.set({ai_flow_auto_refresh_v1:{}}));await pc.reload();await pc.waitForTimeout(2000);
  const dash=ctx.pages().find(p=>p.url().startsWith(E('dashboard.html')));
  await dash.bringToFront();await dash.reload();await dash.waitForTimeout(1500);
  const dText=await dash.locator('body').innerText();
  check('Tableau de bord : Smart Switch propose Codex (capacité confirmée)',/Smart Switch[\s\S]*Claude approche de sa limite[\s\S]*Capacité confirmée/i.test(dText)&&/Codex/.test(dText));
  check('Tableau de bord : prévision prudente, signalée comme estimation, sans fourchette en heures',/tu risques d’atteindre la limite|ne devrait pas être atteinte|Risque d’atteindre|historique insuffisant|aucune consommation récente/.test(dText)&&!/\d+ h à \d+ h/.test(dText),dText.slice(0,600));
  check('Tableau de bord : historique conservé, consommation en barres',await dash.locator('#chart svg rect.use').count()>0&&!/Grok/.test(dText));
  await dash.locator('#chart').scrollIntoViewIfNeeded();await dash.waitForTimeout(200);
  const box=await dash.locator('#chart svg').boundingBox();
  await dash.mouse.move(box.x+box.width-12,box.y+box.height-40);await dash.waitForTimeout(250);
  const tipText=await dash.locator('#tip').innerText().catch(()=>'');
  check('Historique : infobulle au survol (heure, quota, consommation, relevés réels)',await dash.locator('#tip').isVisible()&&/Claude · Session/.test(tipText)&&/Consommé/.test(tipText)&&/relevé/.test(tipText),tipText);
  await dash.screenshot({path:path.join(shots,'dashboard-tooltip.png')});
  await dash.mouse.move(5,5);
  await dash.locator('#refresh').click();await dash.waitForFunction(()=>document.getElementById('refresh').textContent==='Actualiser',null,{timeout:15000}).catch(()=>{});
  check('Tableau de bord : « Actualiser » fonctionne et revient à l’état normal',(await dash.locator('#refresh').innerText())==='Actualiser'&&await dash.locator('#refresh').isEnabled());
  await dash.screenshot({path:path.join(shots,'dashboard.png'),fullPage:true});
  const toasts=await storage('ai_flow_toast_v1');
  check('Notification « approche de sa limite » une seule fois',(toasts||[]).filter(t=>t.type==='approaching'&&t.platform==='claude').length===1,JSON.stringify(toasts));
  await pc.bringToFront();await pc.waitForTimeout(500);
  let w=await widget(pc);
  check('Pastille : Smart Switch dans la page',/Smart Switch/.test(text(w.html))||/approche de sa limite/.test(text(w.html)));
  await pc.screenshot({path:path.join(shots,'widget-toast.png')});

  // 6. Limite atteinte → carte de relance (fonction activée) → relance réelle.
  const resetAt=Date.now()+60000;
  claude={five_hour:{utilization:100,resets_at:new Date(resetAt).toISOString()},seven_day:{utilization:20,resets_at:iso(70*H)}};
  await sw.evaluate(()=>chrome.storage.local.set({ai_flow_auto_refresh_v1:{}}));await pc.reload();await pc.waitForTimeout(2500);
  w=await widget(pc);
  check('Quota atteint : carte de relance ouverte automatiquement',/Quota Claude atteint/.test(text(w.html))&&/Programmer à/.test(text(w.html)),text(w.html).slice(0,300));
  await pc.screenshot({path:path.join(shots,'widget-limit.png')});
  await w.click('#limit-arm');await pc.waitForTimeout(800);
  const jobs=await storage('ai_flow_resume_v1');
  const job=jobs&&Object.values(jobs)[0];
  check('Relance programmée à la réouverture + 2 min',!!job&&Math.abs(job.at-(resetAt+120000))<2000,JSON.stringify(jobs));
  w=await widget(pc);await w.click('#toggle');await pc.waitForTimeout(300);await pc.screenshot({path:path.join(shots,'widget-armed.png')});
  // Réveil programmé (sans app Mac / sans Xcode) : Mac simulé.
  const macOpt=await ctx.newPage();await macOpt.addInitScript(()=>Object.defineProperty(Navigator.prototype,'platform',{get:()=>'MacIntel'}));
  await macOpt.setViewportSize({width:1000,height:900});await macOpt.goto(E('options.html'));await macOpt.waitForTimeout(1200);
  const cmd=await macOpt.locator('#awake-cmd').innerText().catch(()=>'');
  check('Réveil programmé : commande pmset calculée 2 min avant la relance',await macOpt.locator('#awake-terminal').isVisible()&&/^sudo pmset schedule wake "\d\d\/\d\d\/\d\d \d\d:\d\d:00"$/.test(cmd),cmd);
  await macOpt.locator('#awake-terminal').scrollIntoViewIfNeeded();await macOpt.screenshot({path:path.join(shots,'options-awake.png')});
  await macOpt.locator('input[name="awakeMode"][value="catchup"]').check();await macOpt.waitForTimeout(400);await macOpt.close();
  const tl=await storage('ai_flow_drafts_v1');
  check('Flow Recovery : conversation interrompue notée (titre + lien, sans contenu)',(tl||[]).some(d=>d.kind==='interruption'&&d.url==='https://claude.ai/chat/'+CONV&&!d.preview),JSON.stringify(tl));
  // Avance l'horloge de la relance (alarme dans 3 s) au lieu d'attendre 3 minutes.
  if(job)await sw.evaluate(async id=>{const v=(await chrome.storage.local.get('ai_flow_resume_v1')).ai_flow_resume_v1;v[id].at=Date.now()+2000;await chrome.storage.local.set({ai_flow_resume_v1:v});await chrome.alarms.create('ai-flow-resume:'+id,{when:Date.now()+3000});},job.id);
  claude={five_hour:{utilization:2,resets_at:iso(5*H)},seven_day:{utilization:21,resets_at:iso(70*H)}};
  await pc.waitForFunction(()=>document.title.startsWith('SENT:'),null,{timeout:70000}).catch(()=>{});
  check('Relance envoyée une seule fois dans la conversation',(await pc.title()).startsWith('SENT:Continue'),await pc.title());
  await pc.waitForTimeout(2500);
  const last=await storage('ai_flow_resume_last_v1');
  check('Résultat de relance enregistré',last?.status==='envoyée',JSON.stringify(last));
  const t2=await storage('ai_flow_toast_v1');
  check('Notification « de nouveau disponible » après relevé confirmé',(t2||[]).some(t=>t.type==='reset'&&t.platform==='claude'),JSON.stringify(t2?.map(t=>t.type)));
  check('Flow Recovery : « Reprendre » proposé avec le lien de la conversation',(t2||[]).some(t=>t.type==='reset'&&t.url==='https://claude.ai/chat/'+CONV&&/Reprendre/.test(t.body)));

  // 6 bis. Codex : quota atteint dans une tâche → même proposition automatique que Claude.
  codexUsed=100;
  const px=await ctx.newPage();await px.goto('https://chatgpt.com/codex/tasks/task_e_42');
  await sw.evaluate(()=>chrome.storage.local.set({ai_flow_auto_refresh_v1:{}}));await px.reload();await px.waitForTimeout(3000);
  let wx=text((await widget(px)).html);
  check('Codex : carte « Quota Codex atteint » avec heure automatique',/Quota Codex atteint/.test(wx)&&/Programmer à \d\d:\d\d/.test(wx),wx.slice(0,300));
  await px.screenshot({path:path.join(shots,'widget-codex-limit.png')});
  const pchat=await ctx.newPage();await pchat.goto('https://chatgpt.com/c/conversation-normale');await pchat.waitForTimeout(2000);
  check('Conversation ChatGPT classique : pas de carte Codex',!/Quota Codex atteint/.test(text((await widget(pchat)).html)));
  await pchat.close();await px.close();codexUsed=12;
  // 7. Smart Transfer 2.0 : la conversation ouverte (sur clic) → message de reprise → insertion dans ChatGPT.
  await pc.bringToFront();await pc.evaluate(()=>getSelection().removeAllRanges());
  w=await widget(pc);if(!/AI Flow · Claude/.test(text(w.html))||/class="panel hidden/.test(w.html)){await w.click('#toggle');w=await widget(pc);}
  await w.click('#transfer');await pc.waitForTimeout(2500);
  const tr=ctx.pages().find(p=>p.url().startsWith(E('transfer.html')));
  check('Transfert ouvert depuis la pastille',!!tr);
  if(tr){
    await tr.bringToFront();await tr.waitForTimeout(600);
    const info=await tr.locator('#source-info').innerText().catch(()=>'');
    check('Transfert : conversation récupérée (3 messages, titre)',/Refonte page tarifs/.test(info)&&/3 messages/.test(info),info);
    check('Transfert : destination différente de la source',await tr.locator('#target').inputValue()==='chatgpt');
    const prev=await tr.locator('#preview').inputValue();
    check('Transfert : objectif pré-rempli, derniers échanges dans l’ordre et par rôle',/## Objectif\nObjectif : refaire la page tarifs/.test(prev)&&/## Derniers échanges/.test(prev)&&prev.indexOf('**Moi :**\nObjectif')<prev.indexOf('**Claude :**\nProposition')&&prev.indexOf('Proposition')<prev.lastIndexOf('Écris maintenant la FAQ'),prev.slice(0,500));
    await tr.locator('input[name="mode"][value="full"]').check();await tr.waitForTimeout(200);
    check('Transfert : mode « conversation complète »',/Voici une conversation commencée sur Claude/.test(await tr.locator('#preview').inputValue()));
    await tr.locator('input[name="mode"][value="resume"]').check();
    await tr.locator('[data-field="decisions"]').fill('Trois offres');
    await tr.locator('#preview').fill((await tr.locator('#preview').inputValue())+'\nNote perso.');
    check('Transfert : aperçu modifié conservé',/Note perso/.test(await tr.locator('#preview').inputValue()));
    await tr.locator('#save').click();await tr.waitForTimeout(400);
    const drafts=await storage('ai_flow_drafts_v1');
    check('Point de reprise enregistré (avec lien de la conversation)',(drafts||[]).some(d=>d.kind==='checkpoint'&&d.title==='Refonte page tarifs'&&d.url==='https://claude.ai/chat/'+CONV));
    await tr.setViewportSize({width:1200,height:900});await tr.screenshot({path:path.join(shots,'transfer.png'),fullPage:true});
    const known=new Set(ctx.pages());
    await tr.locator('#go').click();
    let dest=null;for(let i=0;i<40&&!dest;i++){await tr.waitForTimeout(300);dest=ctx.pages().find(p=>!known.has(p)&&p.url().startsWith('https://chatgpt.com/'));}
    for(let i=0;i<40;i++){await tr.waitForTimeout(300);if(/Inséré|ouvert/.test(await tr.locator('#status').innerText()))break;}
    check('Transfert : ChatGPT ouvert dans un nouvel onglet, message copié en secours',!!dest&&/ouvert|Inséré/.test(await tr.locator('#status').innerText()));
    // Les onglets créés par l'extension échappent aux sites simulés (page d'erreur réseau) :
    // l'insertion est donc vérifiée sur l'onglet ChatGPT simulé déjà ouvert, avec la même fonction.
    const pgTab=await sw.evaluate(async()=>(await chrome.tabs.query({})).find(t=>(t.url||'').startsWith('https://chatgpt.com/c/'))?.id);
    const ins=await sw.evaluate(async([tabId,text])=>(await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:globalThis.AIFlowReaders.insertDraft,args:[text]}))[0].result,[pgTab,await tr.locator('#preview').inputValue()]);
    const inserted=await pg.evaluate(()=>document.querySelector('.ProseMirror')?.textContent||'');
    check('Transfert : message inséré dans la zone de saisie de ChatGPT, sans envoi',ins?.status==='inserted'&&/Je reprends avec toi un travail commencé sur Claude/.test(inserted)&&!(await pg.title()).startsWith('SENT'),JSON.stringify(ins));
    if(dest)await dest.close();
  }
  const pop2=await ctx.newPage();await pop2.setViewportSize({width:380,height:600});await pop2.goto(E('popup.html'));await pop2.waitForTimeout(1200);
  check('Popup : points de reprise et travail interrompu accessibles',/point(s)? de reprise/i.test(await pop2.locator('body').innerText()));
  await pop2.screenshot({path:path.join(shots,'popup-continuity.png')});
  await pop2.emulateMedia({colorScheme:'light'});await pop2.waitForTimeout(200);await pop2.screenshot({path:path.join(shots,'popup-light.png')});

  // 8. Aucun onglet de conversation rechargé ni épinglé par l'extension.
  check('Aucun onglet épinglé',(await tabsInfo()).every(t=>!t.pinned));
  console.log('\n'+results.join('\n'));
  console.log(`\n${results.length-failed}/${results.length} vérifications réussies`);
  await ctx.close();process.exit(failed?1:0);
})().catch(e=>{console.error(e);console.log(results.join('\n'));process.exit(2);});
