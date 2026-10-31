(async function(){
  'use strict';
  const A=window.AIFlow,U=window.AIFlowUI,$=id=>document.getElementById(id),esc=A.escapeHTML;
  let state,conn={},extras=await U.loadExtras(),awake=null;
  try{state=await A.getState();}catch(e){$('summary').textContent=e.message;return;}

  function summary(){
    const now=Date.now(),st=A.visiblePlatforms(state).map(id=>A.platformStatus(state,id,now));
    const ok=st.filter(s=>s.level==='healthy').map(s=>A.platform(s.platform).name);
    const hot=st.filter(s=>s.level==='warning'||s.level==='critical').map(s=>A.platform(s.platform).name);
    const unk=st.filter(s=>s.level==='unknown').map(s=>A.platform(s.platform).name);
    const parts=[];
    if(ok.length)parts.push(`Disponible : ${ok.join(', ')}.`);
    if(hot.length)parts.push(`Proche de la limite : ${hot.join(', ')}.`);
    if(unk.length)parts.push(`Sans relevé récent : ${unk.join(', ')}.`);
    return parts.join(' ')||'Ouvre Claude ou ChatGPT (Codex) dans un onglet : les quotas apparaissent en quelques secondes.';
  }
  function continuity(){
    const jobs=Object.values(extras.jobs).sort((a,b)=>a.at-b.at);
    $('jobs').innerHTML=jobs.length?jobs.map(j=>`<div class="cline">${U.logo(j.platform,'sm')}<div><b>Relance ${esc(A.dayClock(j.at))} · ${esc(A.platform(j.platform)?.name||'')}</b><small>« ${esc(j.message.slice(0,90))} »${j.attempts?' · nouvel essai ('+esc(j.status)+')':''}</small></div><button class="ghost small" data-cancel="${esc(j.id)}">Annuler</button></div>`).join('')
      :`<p class="fine">Aucune relance programmée.${state.settings.resumePrompt?' Programme-la depuis la pastille AI Flow d’une conversation Claude ou ChatGPT.':' Active « Relance après quota » dans les réglages.'}</p>`;
    if(extras.last)$('jobs').innerHTML+=`<p class="fine">Dernière relance : ${esc(extras.last.status)} · ${esc(A.dayClock(extras.last.at))}</p>`;
    const a=U.awakeText(awake);
    $('awake').innerHTML=`<span>Awake (Mac éveillé)</span><b class="${a.cls}">${esc(a.text)}</b>`;
    $('drafts').innerHTML=extras.drafts.length?extras.drafts.map(d=>`<div class="cline"><span class="logo sm neutral">↺</span><div><b>${esc(d.title||'Sans titre')}</b><small>${esc(A.dayClock(d.updatedAt||d.createdAt))}${d.source?' · depuis '+esc(A.platform(d.source)?.name||''):''}</small></div><button class="ghost small" data-open-page="transfer" data-query='${esc(JSON.stringify({draft:d.id}))}'>Reprendre</button><button class="ghost small" data-del="${esc(d.id)}" aria-label="Supprimer la reprise">Supprimer</button></div>`).join('')
      :'<p class="fine">Aucune reprise. Depuis « Transférer », enregistre le contexte de ton travail pour le retrouver après un reset ou sur une autre IA.</p>';
  }
  function render(){
    $('summary').textContent=summary();
    $('switch').innerHTML=U.smartSwitchHTML(state);
    $('platforms').innerHTML=A.visiblePlatforms(state).map(pid=>U.platformCard(state,pid,conn,{all:true})).join('');
    const now=Date.now(),times=A.visiblePlatforms(state).map(p=>A.platformStatus(state,p,now).updatedAt).filter(Boolean);
    $('sync').textContent=times.length?A.updatedText(Math.max(...times),now):'';
    continuity();U.bindNav(document);
    for(const b of document.querySelectorAll('[data-cancel]'))b.onclick=async()=>{b.disabled=true;try{await A.request('resumeCancel',{id:b.dataset.cancel});}catch{}await reload();};
    for(const b of document.querySelectorAll('[data-del]'))b.onclick=async()=>{if(!confirm('Supprimer cette reprise ?'))return;await U.saveDrafts(extras.drafts.filter(d=>d.id!==b.dataset.del));await reload();};
  }
  async function reload(){
    try{state=await A.getState();}catch{}
    extras=await U.loadExtras();
    try{conn=await A.request('connectionStatuses');}catch{}
    render();
  }
  $('refresh').addEventListener('click',async()=>{const b=$('refresh');b.disabled=true;b.textContent='Actualisation…';try{await A.request('refresh');}catch{}await reload();b.disabled=false;b.textContent='Actualiser';});
  render();await reload();
  A.request('autoRefresh',{}).then(reload,()=>{});
  A.request('awakeStatus').then(s=>{awake=s;render();},()=>{});
  setInterval(()=>A.request('autoRefresh',{}).then(reload,()=>{}),60000);
  U.live(reload);
})();
