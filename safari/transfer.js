(async function(){
  'use strict';
  const A=window.AIFlow,U=window.AIFlowUI,$=id=>document.getElementById(id),esc=A.escapeHTML;
  const MAX=100000,K=A.KEYS;
  const HINTS={goal:'Ce que tu cherches à obtenir, en une ou deux phrases.',context:'Projet, public, technologies, liens utiles…',decisions:'Ce qui est déjà tranché et ne doit pas être remis en question.',
    constraints:'Délais, ton, format, limites techniques…',done:'Ce qui est terminé.',next:'Les prochaines étapes, dans l’ordre.',excerpt:'Colle ici un extrait utile (code, réponse, plan…).'};
  const chats=A.PLATFORMS.filter(p=>p.chat||p.id==='codex');
  let state=await A.getState(),draftId=null,manual=false;
  $('fields').innerHTML=A.HANDOFF_FIELDS.map(([k,label])=>`<label>${esc(label)}<textarea data-field="${k}" rows="${k==='excerpt'?6:3}" placeholder="${esc(HINTS[k])}"></textarea></label>`).join('');
  const opts=chats.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('source').innerHTML='<option value="">—</option>'+opts;$('target').innerHTML=opts;
  const fields=()=>Object.fromEntries([...document.querySelectorAll('[data-field]')].map(t=>[t.dataset.field,t.value]));
  const name=id=>A.platform(id)?.name||'';
  function suggestTarget(){
    const sw=A.smartSwitch(state,Date.now(),$('source').value||null);
    const best=sw.available.find(s=>A.platform(s.platform).chat||s.platform==='codex');
    if(best&&best.platform!==$('source').value)return best.platform;
    return $('source').value==='claude'?'chatgpt':'claude';
  }
  function targetState(){
    const t=$('target').value,st=A.platformStatus(state,t),c=U.connection(state,t,{});
    $('target-state').textContent=st.level==='unmeasured'?`${name(t)} : quotas non mesurés, capacité inconnue.`:st.fresh.length?`${name(t)} : ${Math.round(st.worst)} % utilisés · ${A.updatedText(st.updatedAt)}.`:`${name(t)} : ${c.text}.`;
  }
  function update(){
    if(!manual)$('preview').value=A.buildHandoff(fields(),name($('source').value),name($('target').value));
    $('count').textContent=$('preview').value.length.toLocaleString('fr-FR');
    $('copy').textContent=`Copier et ouvrir ${name($('target').value)}`;
    targetState();
  }
  function fill(d){
    draftId=d.id||null;$('title').value=d.title||'';
    if(d.source)$('source').value=d.source;
    if(d.target)$('target').value=d.target;
    for(const t of document.querySelectorAll('[data-field]'))t.value=d.fields?.[t.dataset.field]||'';
    manual=!!d.preview&&d.preview!==A.buildHandoff(d.fields||{},name(d.source),name(d.target));
    if(manual)$('preview').value=d.preview;
    $('regen').hidden=!manual;
  }
  // Préremplissage : une reprise enregistrée, ou la sélection envoyée par la pastille (usage unique).
  const params=new URLSearchParams(location.search);
  const drafts=await U.getDrafts();
  const draft=params.get('draft')&&drafts.find(d=>d.id===params.get('draft'));
  if(draft){fill(draft);$('status').textContent='Reprise chargée.';}
  else{
    try{
      const seed=(await A.api.storage.local.get(K.seed))[K.seed];
      await A.api.storage.local.remove(K.seed);
      if(seed&&Date.now()-seed.ts<10*60000){
        if(A.platform(seed.source))$('source').value=seed.source;
        if(typeof seed.text==='string'&&seed.text.trim())document.querySelector('[data-field="excerpt"]').value=seed.text.slice(0,20000);
      }
    }catch{}
    if(params.get('from')&&A.platform(params.get('from')))$('source').value=params.get('from');
    const to=params.get('to');
    $('target').value=to&&A.platform(to)&&to!==$('source').value?to:suggestTarget();
  }
  $('form').addEventListener('input',update);$('form').addEventListener('change',update);
  $('preview').addEventListener('input',()=>{manual=true;$('regen').hidden=false;$('count').textContent=$('preview').value.length.toLocaleString('fr-FR');});
  $('regen').onclick=()=>{manual=false;$('regen').hidden=true;update();};
  function record(){
    const now=Date.now(),f=fields(),title=$('title').value.trim()||f.goal.trim().split('\n')[0].slice(0,60)||'Reprise du '+A.dayClock(now);
    return {id:draftId||String(now),title,source:$('source').value||null,target:$('target').value,fields:f,preview:$('preview').value,createdAt:drafts.find(d=>d.id===draftId)?.createdAt||now,updatedAt:now};
  }
  $('save').onclick=async()=>{
    if(!$('preview').value.trim()){$('status').textContent='Rien à enregistrer pour l’instant.';return;}
    const r=record(),list=(await U.getDrafts()).filter(d=>d.id!==r.id);
    draftId=r.id;await U.saveDrafts([r,...list]);
    $('status').textContent='Reprise enregistrée sur cet appareil. Retrouve-la dans la fenêtre AI Flow ou le tableau de bord.';
  };
  $('reset').onclick=()=>{if(!confirm('Effacer le formulaire ? (Les reprises enregistrées sont conservées.)'))return;fill({});manual=false;$('regen').hidden=true;update();$('status').textContent='';};
  $('copy').onclick=async()=>{
    const text=$('preview').value.trim(),target=$('target').value;
    if(!text){$('status').textContent='Remplis au moins un champ avant de copier.';return;}
    if(text.length>MAX){$('status').textContent='Texte trop long : 100 000 caractères maximum.';return;}
    try{
      await navigator.clipboard.writeText(text);
      $('status').textContent=`Copié. Colle-le dans ${name(target)} (⌘V), relis-le puis envoie-le toi-même.`;
      await U.openPlatform(target);
    }catch{
      $('preview').focus();$('preview').select();
      $('status').textContent='Copie automatique refusée par le navigateur : le texte est sélectionné, utilise ⌘C puis ouvre la destination.';
    }
  };
  U.bindNav(document);update();
  U.live(async()=>{state=await A.getState();targetState();},60000);
})();
