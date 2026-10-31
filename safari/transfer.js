(async function(){
  'use strict';
  if(new URLSearchParams(location.search).has('sync'))return; // vue « Synchroniser les avancées » : sync-view.js
  const A=window.AIFlow,U=window.AIFlowUI,S=window.AIFlowSync,$=id=>document.getElementById(id),esc=A.escapeHTML,K=A.KEYS;
  const HINTS={goal:'Ce que tu cherches à obtenir.',context:'Projet, public, technologies, liens utiles…',decisions:'Ce qui est déjà tranché et ne doit pas être remis en question.',
    constraints:'Délais, ton, format, limites techniques…',done:'Ce qui est terminé.',problems:'Ce qui bloque encore ou reste à corriger.',next:'Les prochaines étapes, dans l’ordre.',excerpt:'Code, chiffres, liens à transmettre tels quels.'};
  const DEST=['claude','chatgpt'];
  let state=await A.getState(),capture=null,draftId=null,manual=false;
  const name=id=>A.platform(id)?.name||'';
  $('fields').innerHTML=A.HANDOFF_FIELDS.map(([k,label])=>`<label>${esc(label)}<textarea data-field="${k}" rows="${k==='excerpt'?4:3}" placeholder="${esc(HINTS[k])}"></textarea></label>`).join('');
  $('source-platform').innerHTML='<option value="">—</option>'+['claude','chatgpt','codex'].map(id=>`<option value="${id}">${esc(name(id))}</option>`).join('');
  $('target').innerHTML=DEST.map(id=>`<option value="${id}">${esc(name(id))}</option>`).join('');
  const fields=()=>Object.fromEntries([...document.querySelectorAll('[data-field]')].map(t=>[t.dataset.field,t.value]));
  const mode=()=>document.querySelector('input[name="mode"]:checked')?.value||'resume';

  function transcript(){
    if(!capture)return '';
    const names={user:'Moi',assistant:name(capture.platform)||'Assistant'};
    return A.buildTranscript(capture.messages,Number($('budget').value),names);
  }
  function compose(){
    const tr=transcript();
    // Transfert complet : la synthèse est confiée, ouvertement, à l'IA de destination (aucune IA cachée).
    if(capture&&mode()==='full')return {text:`Voici une conversation commencée sur ${name(capture.platform)}, dans l’ordre, avec les rôles de chacun.\n\n${tr.text}\n\nAvant de continuer, résume en quelques lignes : l’objectif, les décisions prises, les contraintes, ce qui est fait, ce qui reste bloqué et les prochaines étapes. Puis reprends le travail là où il s’est arrêté.`,tr};
    return {text:A.buildHandoff(fields(),name($('source-platform').value),name($('target').value),tr?.text||''),tr};
  }
  function targetState(){
    const t=$('target').value,pid=t==='chatgpt'?'codex':t,st=A.platformStatus(state,pid);
    $('target-state').textContent=t==='chatgpt'?'Limites de messages ChatGPT non mesurables.'+(st.fresh.length?` Codex : ${Math.round(st.worst)} % utilisés.`:''):st.fresh.length?`${name(t)} : ${Math.round(st.worst)} % utilisés · ${A.updatedText(st.updatedAt)}.`:`${name(t)} : quota inconnu (aucun relevé récent).`;
    $('go').textContent=`Ouvrir ${name(t)}${$('auto-insert').checked?' et insérer':''}`;
  }
  // Taille du transfert et adéquation à la destination (estimation, ~4 caractères par jeton).
  function size(){
    const e=A.estimateTransfer($('preview').value,$('target').value),dest=name($('target').value);
    $('count').textContent=`${e.chars.toLocaleString('fr-FR')} caractères (~${e.tokens.toLocaleString('fr-FR')} jetons)`;
    const w=$('size-warn');
    w.textContent=e.level==='ok'?'':e.level==='large'?`Volumineux pour ${dest} : le texte risque d’être converti en pièce jointe ou tronqué. Préfère « Continuité intelligente » ou une taille plus courte.`:`Trop volumineux pour ${dest} : réduis la taille maximale ou passe en « Continuité intelligente ».`;
    w.className='fine '+(e.level==='ok'?'':'warn');
    // Privacy Layer : secrets évidents détectés localement, masquables avant l'envoi.
    const sec=S.findSecrets($('preview').value);
    $('secret-warn').hidden=!sec.length;
    if(sec.length)$('secret-warn').querySelector('span').textContent=`${sec.length} secret${sec.length>1?'s':''} probable${sec.length>1?'s':''} détecté${sec.length>1?'s':''} (${[...new Set(sec.map(x=>x.type))].join(', ')}) : vérifie avant l’envoi.`;
  }
  function update(){
    const {text,tr}=compose();
    if(!manual)$('preview').value=text;
    size();
    if(capture&&tr)$('source-info').textContent=`« ${capture.title} » · ${name(capture.platform)} · ${capture.messages.length} messages${tr.omitted?` · ${tr.included} repris, ${tr.omitted} intermédiaires omis pour tenir dans la taille choisie`:' · tous repris'}${capture.source==='page'?' · lus depuis la page affichée (les messages non chargés peuvent manquer)':''}.`;
    targetState();
  }
  function fill(d){
    draftId=d.id||null;$('title').value=d.title||'';
    if(d.source)$('source-platform').value=d.source;
    if(d.target&&DEST.includes(d.target))$('target').value=d.target;
    for(const t of document.querySelectorAll('[data-field]'))t.value=d.fields?.[t.dataset.field]||'';
    manual=!!d.preview&&d.preview!==compose().text;
    if(manual)$('preview').value=d.preview;
    $('regen').hidden=!manual;
  }
  // Sans conversation récupérée : la section reste visible, explique pourquoi et propose les conversations ouvertes.
  const WHY={code:'Cette page est une session Claude Code : AI Flow ne sait pas encore la lire (format différent des conversations Claude). Sélectionne le texte utile dans la page, puis clique « Transférer » dans la pastille : il arrive dans « Éléments indispensables ».',
    notconv:'La page d’où tu viens n’est pas une conversation Claude ou ChatGPT.'};
  function noCapture(why){
    capture=null;$('pick').hidden=false;$('drop-capture').hidden=true;$('source-info').textContent='';$('attach-note').hidden=true;
    $('source-head').textContent='Conversation à transférer';$('pick-why').textContent=why||'';$('pick-why').hidden=!why;
    for(const r of document.querySelectorAll('input[name="mode"]'))r.disabled=true;
    $('mode-note').hidden=false;$('budget').disabled=true;listTabs();
  }
  async function listTabs(){
    let tabs=[];try{tabs=await A.request('conversationTabs');}catch{}
    $('pick-list').innerHTML=tabs.length?tabs.map(t=>`<button type="button" class="ghost small pick" data-tab="${t.tabId}">${esc(name(t.platform))} · ${esc(t.title)}</button>`).join('')
      :'<p class="fine">Aucune conversation Claude ou ChatGPT ouverte. Ouvre-en une dans un autre onglet, puis « Actualiser la liste ». Tu peux aussi remplir les champs à la main.</p>';
    for(const b of $('pick-list').querySelectorAll('[data-tab]'))b.onclick=()=>pickTab(Number(b.dataset.tab),b);
  }
  async function pickTab(tabId,b){
    b.disabled=true;$('pick-why').hidden=false;$('pick-why').textContent='Lecture de la conversation…';
    try{
      await A.request('captureConversation',{tabId},{timeout:20000});
      const v=await A.api.storage.local.get(K.capture);await A.api.storage.local.remove(K.capture);
      if(!v[K.capture]?.messages?.length)throw Error('Aucun message lisible dans cet onglet.');
      manual=false;useCapture(v[K.capture]);update();
    }catch(e){$('pick-why').textContent=e.message||'Lecture impossible.';b.disabled=false;}
  }
  function useCapture(c){
    $('link-row').hidden=!c.url;
    capture=c;$('pick').hidden=true;$('drop-capture').hidden=false;$('mode-note').hidden=true;$('budget').disabled=false;
    $('source-head').textContent='Conversation récupérée';
    for(const r of document.querySelectorAll('input[name="mode"]'))r.disabled=false;
    $('source-platform').value=c.platform;
    $('target').value=c.platform==='claude'?'chatgpt':'claude';
    if(!$('title').value)$('title').value=c.title||'';
    // Continuité intelligente : extraction locale et déterministe (sans IA), toujours modifiable.
    const ex=A.extractContinuity(c.messages,{title:c.title,source:name(c.platform)});
    for(const [k,v] of Object.entries(ex.fields)){const el=document.querySelector(`[data-field="${k}"]`);if(el&&!el.value)el.value=v;}
    $('prefill-note').hidden=false;
    $('prefill-note').textContent=`Rubriques remplies automatiquement à partir des phrases de la conversation (extraction locale, sans IA ni reformulation) : ${ex.found} rubrique${ex.found>1?'s':''} sur 6 trouvée${ex.found>1?'s':''}. Vérifie, complète ou supprime avant le transfert.`;
    const att=c.messages.flatMap(m=>m.attachments||[]);
    $('attach-note').hidden=!att.length&&c.source!=='page';
    $('attach-note').textContent=att.length?`${att.length} pièce${att.length>1?'s':''} jointe${att.length>1?'s':''} non transférée${att.length>1?'s':''} (${[...new Set(att)].slice(0,6).join(', ')}${att.length>6?'…':''}). Ajoute-les à la main dans la destination si elles sont utiles.`:'Lecture depuis la page affichée : les pièces jointes éventuelles ne sont pas détectées ni transférées.';
  }
  // Entrées possibles : capture faite sur clic (popup / pastille), point de reprise existant, ou sélection.
  const params=new URLSearchParams(location.search);
  const drafts=A.cleanCheckpoints(await U.getDrafts());
  try{
    const v=await A.api.storage.local.get([K.capture,K.seed]);
    await A.api.storage.local.remove([K.capture,K.seed]);
    const c=v[K.capture];
    if(params.get('capture')&&c&&Date.now()-c.ts<10*60000&&Array.isArray(c.messages)&&c.messages.length)useCapture(c);
    const seed=v[K.seed];
    if(seed&&Date.now()-seed.ts<10*60000&&typeof seed.text==='string'&&seed.text.trim()){
      if(A.platform(seed.source))$('source-platform').value=seed.source;
      document.querySelector('[data-field="excerpt"]').value=seed.text.slice(0,20000);
    }
  }catch{}
  const draft=params.get('draft')&&drafts.find(d=>d.id===params.get('draft'));
  if(draft){fill(draft);$('status').textContent=draft.kind==='interruption'?'Travail interrompu retrouvé : complète le contexte puis reprends-le ici ou sur une autre IA.':'Point de reprise chargé.';}
  if(!capture&&!draft){
    if(params.get('from')&&A.platform(params.get('from')))$('source-platform').value=params.get('from');
    const to=params.get('to');if(DEST.includes(to)&&to!==$('source-platform').value)$('target').value=to;
    else $('target').value=$('source-platform').value==='claude'?'chatgpt':'claude';
  }
  if(!capture)noCapture(params.get('why')==='err'?(params.get('err')||'La conversation n’a pas pu être lue.'):WHY[params.get('why')]||'');
  if(params.get('mode')==='checkpoint'){$('page-title').textContent='Sauvegarder pour plus tard';document.querySelector('.hero .lead').textContent='Garde l’essentiel de ce travail (objectif, décisions, contraintes, prochaines étapes) pour le reprendre plus tard, ici ou ailleurs. Rien n’est envoyé.';$('title').focus();}

  $('form').addEventListener('input',update);$('form').addEventListener('change',update);
  for(const r of document.querySelectorAll('input[name="mode"]'))r.addEventListener('change',()=>{manual=false;$('regen').hidden=true;update();});
  $('budget').addEventListener('change',()=>{manual=false;$('regen').hidden=true;update();});
  $('auto-insert').addEventListener('change',targetState);
  $('preview').addEventListener('input',()=>{manual=true;$('regen').hidden=false;size();});
  $('target').addEventListener('change',size);
  $('regen').onclick=()=>{manual=false;$('regen').hidden=true;update();};
  $('drop-capture').onclick=()=>{noCapture('');$('prefill-note').hidden=true;manual=false;update();};
  $('pick-refresh').onclick=listTabs;

  function record(kind='checkpoint'){
    const now=Date.now(),f=fields(),old=drafts.find(d=>d.id===draftId);
    const title=$('title').value.trim()||f.goal.trim().split('\n')[0].slice(0,60)||'Point de reprise du '+A.dayClock(now);
    return {destUrl:old?.destUrl||null,interrupted:!!old?.interrupted,id:draftId||String(now),kind:old?.kind||kind,title,source:$('source-platform').value||null,platform:old?.platform||null,
      url:capture?.url||old?.url||null,target:$('target').value,fields:f,preview:$('preview').value,createdAt:old?.createdAt||now,updatedAt:now,resetAt:old?.resetAt||null,status:old?.status||'open'};
  }
  async function saveCheckpoint(silent){
    if(!$('preview').value.trim()&&!$('title').value.trim()){if(!silent)$('status').textContent='Rien à enregistrer pour l’instant.';return null;}
    const r=record();let list=A.cleanCheckpoints(await U.getDrafts()).filter(d=>d.id!==r.id);
    const int=r.url&&list.find(d=>d.kind==='interruption'&&d.url===r.url&&d.status!=='done');
    if(int){r.interrupted=true;r.platform=int.platform;r.resetAt=int.resetAt;r.status=int.status;list=list.filter(d=>d.id!==int.id);}
    draftId=r.id;await U.saveDrafts(A.cleanCheckpoints([r,...list]));
    if(!silent)$('status').textContent='Point de reprise enregistré sur cet appareil. Retrouve-le dans la fenêtre AI Flow et le tableau de bord.';
    return r;
  }
  $('save').onclick=()=>saveCheckpoint(false);
  $('reset').onclick=()=>{if(!confirm('Effacer le formulaire ? (Les points de reprise enregistrés sont conservés.)'))return;fill({});noCapture('');manual=false;$('regen').hidden=true;update();$('status').textContent='';};
  async function copy(text){
    try{await navigator.clipboard.writeText(text);return true;}
    catch{$('preview').focus();$('preview').select();return false;}
  }
  $('mask-secrets').onclick=()=>{$('preview').value=S.maskSecrets($('preview').value);manual=true;$('regen').hidden=false;size();};
  $('copy').onclick=async()=>{
    const text=$('preview').value.trim();if(!text){$('status').textContent='Le message est vide.';return;}
    $('status').textContent=await copy(text)?'Copié. Colle-le (⌘V) dans la nouvelle conversation et relis-le avant d’envoyer.':'Copie refusée : le texte est sélectionné, fais ⌘C.';
  };
  $('go').onclick=async()=>{
    const text=$('preview').value.trim(),t=$('target').value;
    if(!text){$('status').textContent='Le message est vide.';return;}
    if(text.length>200000){$('status').textContent='Message trop long : réduis la taille maximale.';return;}
    const copied=await copy(text);
    if(draftId||capture)await saveCheckpoint(true);
    const btn=$('go');btn.disabled=true;$('status').textContent=`Ouverture de ${name(t)}…`;
    try{
      // Association demandée explicitement : le Flow naît quand la conversation de destination existe (après ton envoi).
      const link=$('link-flow').checked&&capture?.url&&draftId?{sourceUrl:capture.url,title:$('title').value.trim()||capture.title,sourceTitle:capture.title,seen:S.baselineFrom(capture.messages),decisions:S.seedDecisions(capture.messages,capture.platform)}:null;
      const r=await A.request('openAndInsert',{platform:t,text,insert:$('auto-insert').checked,checkpointId:draftId||null,link},{timeout:30000});
      $('status').textContent=r.status==='inserted'?`Inséré dans ${name(t)}. Relis puis envoie toi-même.`
        :r.status==='opened'?`${name(t)} est ouvert. ${copied?'Colle le message (⌘V)':'Copie le message'} puis envoie-le.`
        :`${name(t)} est ouvert, mais l’insertion automatique n’a pas fonctionné${r.status==='draft'?' (un brouillon était déjà présent)':''}. ${copied?'Le message est copié : colle-le (⌘V).':'Copie le message puis colle-le.'} [${r.status}]`;
      if(link)$('status').textContent+=` Les conversations seront liées dès que la conversation ${name(t)} aura été créée par ton envoi.`;
    }catch(e){$('status').textContent=e.message;}
    finally{btn.disabled=false;}
  };
  U.bindNav(document);update();
  U.live(async()=>{state=await A.getState();targetState();},60000);
})();
