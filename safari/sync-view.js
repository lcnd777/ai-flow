/* AI Flow — Smart Context Sync : vue « Synchroniser les avancées » (dans la page de transfert).
 * Détection → prévisualisation (sélection, modification, conflits) → insertion sans envoi → confirmation. */
(async function(){
  'use strict';
  const params=new URLSearchParams(location.search);
  if(!params.has('sync'))return;
  const A=window.AIFlow,U=window.AIFlowUI,S=window.AIFlowSync,$=id=>document.getElementById(id),esc=A.escapeHTML;
  const name=id=>A.platform(id)?.name||'';
  const platformOf=url=>window.AIFlowPlatforms.conversationOf(url)?.platform;
  $('transfer-view').hidden=true;$('sync-view').hidden=false;document.title='Synchroniser — AI Flow';
  const flowId=params.get('sync');
  let flow=null,from=null,to=null,res=null,items=[],entries=[],choices={},included=new Set(),manual=false,entryId=null,encryption=true;
  const KIND=[['decision','Décisions'],['constraint','Contraintes ajoutées'],['done','Tâches terminées'],['problem','Problèmes restant à résoudre'],['next','Prochaines étapes'],['excerpt','Éléments indispensables']];
  const STATUS={validated:'Validée',proposed:'Proposée',modified:'Modifiée',abandoned:'Abandonnée',conflict:'En conflit'};
  const when=ts=>ts?A.dayClock(ts):'jamais';
  const endOf=url=>flow.ends.find(e=>e.url===url);
  const label=url=>{const e=endOf(url);return e?`${name(e.platform)} · « ${e.title} »`:'';};

  async function loadFlow(){
    const r=await A.request('flows');encryption=r.encryption;
    flow=r.flows.find(f=>f.id===flowId);
    if(!flow){$('sync-head').innerHTML='<p>Ce Flow n’existe plus (dissocié ou supprimé). <button type="button" class="ghost small" data-open-page="dashboard">Tableau de bord</button></p>';U.bindNav(document);$('sync-step').hidden=true;return false;}
    const want=window.AIFlowPlatforms.conversationOf(params.get('from')||'')?.url;
    from=from||(flow.ends.some(e=>e.url===want)?want:flow.ends[0].url);to=flow.ends.find(e=>e.url!==from).url;
    head();openEntries();history();return true;
  }
  function head(){
    const last=flow.lastSync;
    $('sync-head').innerHTML=`<div class="sec-head"><h2>${esc(flow.title)}</h2><button type="button" id="sync-swap" class="ghost small">Inverser le sens</button></div>
      <div class="sync-route"><div><small>Depuis</small><b>${esc(label(from))}</b></div><span aria-hidden="true">→</span><div><small>Vers</small><b>${esc(label(to))}</b></div></div>
      <p class="fine">Dernière synchronisation : ${last?`${esc(when(last.at))} (${esc(name(platformOf(last.from)))} → ${esc(name(platformOf(last.to)))})`:'jamais'}.
      ${flow.locked?' <span class="warn">Décisions chiffrées illisibles sur cette installation (clé absente) : synchronisation bloquée pour les préserver. Reprends sur l’installation d’origine ou dissocie explicitement ce Flow.</span>':''}
      ${encryption?' Décisions conservées chiffrées sur cet appareil.':' Chiffrement local indisponible ici : décisions conservées en clair sur cet appareil.'}</p>`;
    $('sync-swap').onclick=()=>{[from,to]=[to,from];reset();head();};
    $('sync-insert').textContent=`Insérer dans ${name(platformOf(to))}`;
  }
  // Synchronisations préparées mais non confirmées (navigateur fermé, insertion non vérifiée…) : rien n'est perdu.
  function openEntries(){
    const open=flow.ledger.filter(x=>!['confirmed','cancelled'].includes(x.state));
    $('sync-open').hidden=!open.length;
    $('sync-open').innerHTML=open.map(x=>`<div class="sync-pending" data-entry="${esc(x.id)}"><div><b>${esc(S.LEDGER_LABEL[x.state])}</b> · ${esc(name(platformOf(x.from)))} → ${esc(name(platformOf(x.to)))} · ${esc(when(x.at))}${x.error?` · ${esc(x.error)}`:''}</div>
      <div class="row-actions"><button type="button" class="ghost small" data-act="resume">Reprendre</button><button type="button" class="ghost small" data-act="confirm">Confirmer l’envoi</button><button type="button" class="ghost small" data-act="cancel">Annuler</button></div></div>`).join('');
    for(const b of $('sync-open').querySelectorAll('[data-act]'))b.onclick=async()=>{
      const id=b.closest('[data-entry]').dataset.entry,act=b.dataset.act;
      try{
        if(act==='resume'){
          const d=await A.request('syncDraft',{flowId,entryId:id});
          if(!d?.draft){$('sync-summary').textContent='Brouillon illisible : récupère à nouveau les avancées (rien n’a été marqué comme synchronisé).';return;}
          // Repartir d'un état vide : aucune capture précédente de cette page ne doit se mêler au brouillon repris.
          reset();entryId=id;from=d.entry.from;to=d.entry.to;head();$('sync-preview').hidden=false;$('sync-packet').value=d.draft.packet;manual=true;size();after(d.entry.state);
        }else{await A.request('syncState',{flowId,entryId:id,state:act==='confirm'?'confirmed':'cancelled'});await loadFlow();if(act==='confirm')$('sync-summary').textContent='Synchronisation confirmée : le point de référence a avancé.';}
      }catch(e){$('sync-summary').textContent=e.message;}
    };
  }
  function history(){
    $('sync-ledger').innerHTML=flow.ledger.length?`<ul class="ledger">${flow.ledger.slice(0,12).map(x=>`<li><b>${esc(S.LEDGER_LABEL[x.state])}</b> · ${esc(name(platformOf(x.from)))} → ${esc(name(platformOf(x.to)))} · ${esc(when(x.updatedAt||x.at))}${x.counts?.items!=null?` · ${x.counts.items} élément${x.counts.items>1?'s':''}`:''}${x.error?` · ${esc(x.error)}`:''}</li>`).join('')}</ul>`:'<p class="fine">Aucune synchronisation pour l’instant.</p>';
    const ds=flow.decisions.slice().reverse();
    $('sync-decisions').innerHTML=ds.length?`<h3>Décisions suivies</h3><ul class="ledger">${ds.map(d=>`<li><span class="tag ${d.status==='conflict'?'conflicted':d.status}">${esc(STATUS[d.status])}</span> ${esc(d.text)} <small>(${esc(name(d.origin.platform))}${d.origin.role==='user'?', toi':''})</small></li>`).join('')}</ul>`:'';
  }
  function reset(){$('sync-state').textContent='';res=null;items=[];entries=[];choices={};included=new Set();manual=false;entryId=null;$('sync-items').innerHTML='';$('sync-conflicts').innerHTML='';$('sync-warn').innerHTML='';$('sync-preview').hidden=true;$('sync-after').hidden=true;
    $('sync-summary').textContent='Clique « Récupérer les avancées » : AI Flow lit la conversation source maintenant, sur ce clic uniquement.';$('sync-run').textContent='Récupérer les avancées';}

  /* ---------- Étape B : détection ---------- */
  async function run(){
    const b=$('sync-run');b.disabled=true;$('sync-summary').textContent='Lecture de la conversation source…';
    try{
      const r=await A.request('syncCapture',{flowId,from},{timeout:30000});
      if(r.needTab){
        $('sync-summary').textContent=`La conversation source (${label(from)}) n’est pas ouverte. Ouvre-la, puis récupère les avancées.`;
        b.textContent='Ouvrir la conversation source';b.onclick=async()=>{await U.openUrl(from);b.textContent='Récupérer les avancées';b.onclick=run;};return;
      }
      if(r.error){
        const hint={permission:' Alternative : sélectionne le texte utile dans la conversation et utilise « Transférer » dans la pastille, ou copie-le à la main.',
          'not-found':' Si elle a été supprimée, tu peux dissocier ce Flow (en bas de page).',empty:''}[r.error.code]||'';
        $('sync-summary').textContent=r.error.message+hint;return;
      }
      res=r;flow=r.flow;head();
      items=r.items;entries=r.entries.map(e=>({...e,item:items.find(i=>i.id===e.itemId)})).filter(e=>e.item);
      included=new Set(items.filter(i=>!i.secret&&!entries.some(e=>e.item.id===i.id&&e.relation==='duplicate')).map(i=>i.id));
      choices={};manual=false;entryId=null;$('sync-after').hidden=true;
      render();
    }catch(e){$('sync-summary').textContent=e.message;}
    finally{b.disabled=false;}
  }
  function render(){
    const d=res.delta,warn=[];
    if(d.partial)warn.push('Capture partielle : lue depuis la page affichée. Des messages non chargés peuvent manquer ; ils ne sont pas considérés comme supprimés. Fais défiler la conversation jusqu’en haut puis récupère à nouveau, ou complète à la main.');
    if(d.anchorMissing)warn.push('Aucun message déjà synchronisé n’a été retrouvé dans cette capture : les nouveautés ne peuvent pas être situées avec certitude. Décoche ce qui a déjà été transmis.');
    if(d.firstSync)warn.push('Première synchronisation de cette conversation : tout son contenu est considéré comme nouveau. Décoche ce qui a déjà été transféré.');
    if(d.attachments.length)warn.push(`Non récupéré : ${d.attachments.slice(0,8).join(', ')} (pièces jointes, images ou artefacts). À joindre à la main si utile.`);
    if(d.modified)warn.push(`${d.modified} message${d.modified>1?'s':''} modifié${d.modified>1?'s':''} depuis la dernière synchronisation.`);
    if(res.accountMismatch)warn.push(`Compte ${name(platformOf(from))} différent de celui utilisé lors de la liaison : vérifie qu’il s’agit bien de la même conversation.`);
    if(items.some(i=>i.secret))warn.push('Secrets probables détectés : les éléments concernés sont décochés et les secrets masqués dans le message.');
    $('sync-warn').innerHTML=warn.map(w=>`<li>${esc(w)}</li>`).join('');
    if(d.upToDate){
      $('sync-summary').innerHTML=`<b class="ok">À jour</b> · aucune avancée depuis ${flow.lastSync?'la dernière synchronisation':'la liaison'} (${d.known} message${d.known>1?'s':''} déjà connu${d.known>1?'s':''}${d.packets?`, ${d.packets} mise${d.packets>1?'s':''} à jour AI Flow ignorée${d.packets>1?'s':''}`:''}).`;
      $('sync-preview').hidden=true;return;
    }
    $('sync-summary').textContent=`${d.fresh} nouveau${d.fresh>1?'x':''} message${d.fresh>1?'s':''}${d.modified?`, ${d.modified} modifié${d.modified>1?'s':''}`:''} depuis ${flow.lastSync?'la dernière synchronisation':'la liaison'} · ${items.length} élément${items.length>1?'s':''} utile${items.length>1?'s':''} détecté${items.length>1?'s':''}${d.known?` · ${d.known} déjà connu${d.known>1?'s':''}`:''}.`;
    renderConflicts();renderItems();$('sync-preview').hidden=false;compose();
  }
  /* ---------- Étape C : conflits (jamais résolus en silence) ---------- */
  function renderConflicts(){
    const list=entries.filter(e=>e.relation==='conflict');
    $('sync-conflicts').innerHTML=list.map(e=>{
      const id=esc(e.item.id),t=e.target;
      return `<div class="conflict" data-id="${id}"><b>Conflit${e.required?'':' (propositions)'}</b>${e.threeWay?'<p class="fine">Les deux conversations ont évolué depuis la dernière synchronisation.</p>':''}
        <div class="vs"><div><small>Première · ${esc(t.pending?name(platformOf(to))+', non synchronisée':STATUS[t.status]||'')}</small><p>${esc(t.text)}</p></div>
        <div><small>Seconde · ${esc(name(platformOf(from)))}, ${esc(STATUS[e.item.status])}</small><p>${esc(e.item.text)}</p></div></div>
        <div class="choices" role="radiogroup" aria-label="Résolution du conflit">
          ${[['first','Conserver la première'],['second','Conserver la seconde'],['merge','Fusionner manuellement'],['defer','Reporter le choix']].map(([v,l])=>`<label class="choice"><input type="radio" name="c-${id}" value="${v}" ${choices[e.item.id]?.choice===v||(!e.required&&!choices[e.item.id]&&v==='defer')?'checked':''}> ${l}</label>`).join('')}
        </div><textarea class="merge" rows="2" placeholder="Décision fusionnée, telle que tu veux la transmettre" ${choices[e.item.id]?.choice==='merge'?'':'hidden'}>${esc(choices[e.item.id]?.text||'')}</textarea></div>`;
    }).join('');
    for(const c of $('sync-conflicts').querySelectorAll('.conflict')){
      const id=c.dataset.id,ta=c.querySelector('.merge');
      for(const r of c.querySelectorAll('input[type=radio]'))r.onchange=()=>{choices[id]={choice:r.value,text:ta.value};ta.hidden=r.value!=='merge';if(r.value==='merge')ta.focus();manual=false;compose();};
      ta.oninput=()=>{choices[id]={choice:'merge',text:ta.value};manual=false;compose();};
    }
  }
  function badges(it){
    const e=entries.find(x=>x.item.id===it.id),out=[];
    if(it.kind==='decision')out.push(`<span class="tag ${it.status==='conflict'?'conflicted':it.status}">${STATUS[it.status]}</span>`);
    if(e?.relation==='replaces')out.push(`<span class="tag">Remplace « ${esc(e.target.text.slice(0,60))} »</span>`);
    if(e?.relation==='modifies')out.push(`<span class="tag">Modifie « ${esc(e.target.text.slice(0,60))} »</span>`);
    if(e?.relation==='duplicate')out.push('<span class="tag">Déjà connue</span>');
    if(e?.relation==='conflict')out.push('<span class="tag conflicted">En conflit</span>');
    if(it.modified)out.push('<span class="tag">Message modifié</span>');
    if(it.secret)out.push('<span class="tag warn">Secret probable</span>');
    return out.join(' ');
  }
  function renderItems(){
    $('sync-items').innerHTML=KIND.map(([k,l])=>{
      const list=items.filter(i=>i.kind===k);if(!list.length)return '';
      return `<div class="sync-group"><h3>${l}</h3>${list.map(it=>`<div class="sync-item" data-id="${esc(it.id)}">
        <input type="checkbox" aria-label="Inclure" ${included.has(it.id)?'checked':''}>
        <div class="body"><div class="meta">${badges(it)}</div><textarea rows="${k==='excerpt'?4:2}" aria-label="Texte transmis">${esc(it.text)}</textarea>
        <details><summary>Extrait source (${it.role==='user'?'toi':esc(name(platformOf(from)))})</summary><pre>${esc(it.source)}</pre></details></div></div>`).join('')}</div>`;
    }).join('')||'<p class="fine">Aucun élément structuré détecté dans les nouveaux messages. Coche « Joindre les nouveaux échanges » pour les transmettre tels quels.</p>';
    for(const row of $('sync-items').querySelectorAll('.sync-item')){
      const id=row.dataset.id,it=items.find(i=>i.id===id);
      row.querySelector('input').onchange=e=>{if(e.target.checked)included.add(id);else included.delete(id);manual=false;compose();};
      row.querySelector('textarea').oninput=e=>{it.text=e.target.value;manual=false;compose();};
    }
    if(!items.length)$('sync-transcript').checked=true;
  }
  /* ---------- Étape D : message de mise à jour ---------- */
  function transcript(){
    if(!$('sync-transcript').checked||!res)return '';
    return A.buildTranscript(res.messages.map(m=>({...m,attachments:[]})),20000,{user:'Moi',assistant:name(platformOf(from))}).text;
  }
  function compose(){
    if(!res)return;
    const packet=S.buildPacket({title:flow.title,from:platformOf(from),to:platformOf(to),since:flow.lastSync?.at,items,entries,choices,included,mask:$('sync-mask').checked,transcript:transcript(),delta:res.delta});
    if(!manual)$('sync-packet').value=packet;
    $('sync-regen').hidden=!manual;size();
  }
  function blocked(){
    const open=S.unresolved(entries,choices,included);
    if(open.length)return `Choisis comment résoudre ${open.length>1?`les ${open.length} conflits`:'le conflit'} avant de transmettre.`;
    if(!$('sync-packet').value.trim())return 'Rien à transmettre : coche au moins un élément.';
    return '';
  }
  function size(){
    const e=A.estimateTransfer($('sync-packet').value,platformOf(to)),dest=name(platformOf(to));
    $('sync-size').textContent=`${e.chars.toLocaleString('fr-FR')} caractères (~${e.tokens.toLocaleString('fr-FR')} jetons)`+(e.level==='ok'?'':e.level==='large'?` · volumineux pour ${dest} : décoche des éléments ou les échanges joints.`:` · trop volumineux pour ${dest} : réduis la sélection.`);
    const why=res?blocked():'';$('sync-block').hidden=!why;$('sync-block').textContent=why;
    $('sync-insert').disabled=$('sync-copy').disabled=!!why;
  }
  async function prepare(){
    if(!res&&entryId)return {entryId}; // synchronisation reprise : même entrée du journal (aucun doublon)
    const why=blocked();if(why)throw Error(why);
    const ops=res?S.decisionOps(entries,choices,included):[];
    const counts={items:items.filter(i=>included.has(i.id)).length,messages:res?res.delta.fresh+res.delta.modified:0,conflicts:entries.filter(e=>e.relation==='conflict').length};
    const r=await A.request('syncPrepare',{flowId,baseRev:res?.flow.rev,from,to,packet:$('sync-packet').value,ops,choices,seen:res?.seen,counts,excluded:items.filter(i=>!included.has(i.id)).map(i=>i.id)});
    entryId=r.entryId;return r;
  }
  function after(state,msg){
    $('sync-after').hidden=false;
    const dest=name(platformOf(to));
    $('sync-state').textContent=msg||({prepared:`Préparée. Colle le message dans ${dest}, relis-le et envoie-le, puis confirme.`,
      'pending-insert':`Insertion dans ${dest} en cours…`,inserted:`Inséré dans ${dest}, sans envoi. Relis puis envoie toi-même, et confirme ici.`,
      failed:'Insertion échouée : copie le message ou réessaie. Rien n’a été marqué comme synchronisé.'}[state]||S.LEDGER_LABEL[state]);
    $('sync-retry').hidden=state!=='failed';
  }
  $('sync-run').onclick=run;
  $('sync-mask').onchange=()=>{manual=false;compose();};
  $('sync-transcript').onchange=()=>{manual=false;compose();};
  $('sync-packet').oninput=()=>{manual=true;$('sync-regen').hidden=false;size();};
  $('sync-regen').onclick=()=>{manual=false;compose();};
  $('sync-insert').onclick=async()=>{
    const b=$('sync-insert');b.disabled=true;
    try{
      await prepare();after('pending-insert');
      const r=await A.request('syncInsert',{flowId,entryId,text:$('sync-packet').value},{timeout:40000});
      after(r.status==='inserted'?'inserted':'failed',r.status==='inserted'?null:`Insertion impossible (${{'no-composer':'zone de saisie introuvable',draft:'un brouillon est déjà présent','not-loaded':'conversation de destination inaccessible','injection-failed':'Safari n’autorise pas AI Flow sur cette page'}[r.status]||r.status}). Copie le message ou réessaie : rien n’a été marqué comme synchronisé.`);
      await loadFlow();
    }catch(e){after('failed',e.message);}
    finally{b.disabled=false;size();}
  };
  $('sync-retry').onclick=()=>$('sync-insert').click();
  $('sync-copy').onclick=async()=>{
    try{
      await prepare();
      let ok=true;try{await navigator.clipboard.writeText($('sync-packet').value);}catch{ok=false;$('sync-packet').select();}
      after('prepared',ok?`Copié. Colle-le dans ${name(platformOf(to))}, relis et envoie, puis confirme ici.`:'Copie refusée : le texte est sélectionné, fais ⌘C. Puis confirme après l’envoi.');
      await loadFlow();
    }catch(e){after('failed',e.message);}
  };
  // Étape E : seule la confirmation fait avancer le point de référence et le point de reprise.
  $('sync-confirm').onclick=async()=>{
    try{await A.request('syncState',{flowId,entryId,state:'confirmed'});
      await loadFlow();res=null;entryId=null;$('sync-after').hidden=true;$('sync-state').textContent='';$('sync-preview').hidden=true;$('sync-items').innerHTML='';$('sync-conflicts').innerHTML='';$('sync-warn').innerHTML='';
      $('sync-summary').innerHTML='<b class="ok">Synchronisation confirmée.</b> Les prochaines synchronisations partiront de ce point.';}
    catch(e){$('sync-state').textContent=e.message;}
  };
  $('sync-cancel').onclick=async()=>{
    try{if(entryId)await A.request('syncState',{flowId,entryId,state:'cancelled',error:'Annulée par toi.'});$('sync-after').hidden=true;entryId=null;await loadFlow();$('sync-state').textContent='';$('sync-summary').textContent='Synchronisation annulée : rien n’a été marqué comme synchronisé.';}
    catch(e){$('sync-state').textContent=e.message;}
  };
  $('sync-unlink').onclick=async()=>{
    if(!confirm('Dissocier ces conversations ? Le suivi des avancées et des décisions de ce Flow sera supprimé. Le point de reprise est conservé.'))return;
    try{await A.request('flowUnlink',{flowId});$('sync-step').hidden=true;$('sync-preview').hidden=true;$('sync-head').innerHTML='<p>Conversations dissociées. Le point de reprise reste disponible dans le tableau de bord.</p>';}catch(e){$('sync-summary').textContent=e.message;}
  };
  $('sync-delete').onclick=async()=>{
    if(!confirm('Supprimer ce Flow, ses décisions, son historique de synchronisation et son point de reprise ? Les conversations elles-mêmes ne sont pas touchées.'))return;
    try{await A.request('flowDelete',{flowId});$('sync-step').hidden=true;$('sync-preview').hidden=true;$('sync-head').innerHTML='<p>Flow supprimé de cet appareil.</p>';}catch(e){$('sync-summary').textContent=e.message;}
  };
  U.bindNav(document);
  if(await loadFlow()&&params.get('auto')==='1')run();
})();
