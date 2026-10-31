(async function(){
  'use strict';
  const A=window.AIFlow,U=window.AIFlowUI,$=id=>document.getElementById(id),esc=A.escapeHTML;
  let state,conn={},extras={jobs:{},drafts:[]},awake=null;
  try{state=await A.getState();}catch(e){$('platforms').textContent=e.message;return;}

  function continuity(){
    const jobs=Object.values(extras.jobs).sort((a,b)=>a.at-b.at),rows=[];
    for(const j of jobs){
      const a=j.keepAwake&&state.settings.awakeEnabled?U.awakeText(awake):null;
      rows.push(`<div class="cline">${U.logo(j.platform,'sm')}<div><b>Relance ${esc(A.dayClock(j.at))}</b><small>${j.attempts?'Nouvel essai · '+esc(j.status):'« '+esc(j.message.slice(0,48))+(j.message.length>48?'…':'')+' »'}${a?' · Mac éveillé : '+esc(a.text):''}</small></div><button class="ghost small" data-cancel="${esc(j.id)}">Annuler</button></div>`);
    }
    if(extras.drafts.length)rows.push(`<div class="cline"><span class="logo sm neutral">↺</span><div><b>${extras.drafts.length} reprise${extras.drafts.length>1?'s':''} enregistrée${extras.drafts.length>1?'s':''}</b><small>${esc(extras.drafts[0].title||'Sans titre')}</small></div><button class="ghost small" data-open-page="transfer" data-query='${esc(JSON.stringify({draft:extras.drafts[0].id}))}'>Reprendre</button></div>`);
    return rows.length?`<section class="continuity"><h2>Continuité</h2>${rows.join('')}</section>`:'';
  }
  function render(){
    const visible=A.visiblePlatforms(state),now=Date.now();
    $('switch').innerHTML=U.smartSwitchHTML(state);
    $('platforms').innerHTML=visible.length?visible.map(pid=>U.platformCard(state,pid,conn,{compact:true})).join(''):'<p class="note">Aucune plateforme affichée. Choisis-les dans Paramètres.</p>';
    $('continuity').innerHTML=continuity();
    const times=visible.map(pid=>A.platformStatus(state,pid,now).updatedAt).filter(Boolean);
    const last=times.length?Math.max(...times):null;
    $('sync').textContent=last?A.updatedText(last,now):'En attente d’un onglet';
    $('sync').className='sync '+(last&&now-last<=A.LATE_MS?'ok':'');
    U.bindNav(document);
    for(const b of document.querySelectorAll('[data-cancel]'))b.addEventListener('click',async()=>{b.disabled=true;try{await A.request('resumeCancel',{id:b.dataset.cancel});}catch{}await reload();});
  }
  async function reload(){
    try{state=await A.getState();}catch{}
    extras=await U.loadExtras();
    try{conn=await A.request('connectionStatuses');}catch{}
    render();
  }
  U.bindNav(document);
  extras=await U.loadExtras();render();
  await reload();
  // Actualisation automatique à l'ouverture, puis chaque minute tant que la fenêtre reste ouverte.
  const refresh=()=>A.request('autoRefresh',{}).then(reload,()=>{});
  refresh();setInterval(refresh,60000);
  if(Object.values(extras.jobs).some(j=>j.keepAwake)&&state.settings.awakeEnabled)A.request('awakeStatus').then(s=>{awake=s;render();},()=>{});
  U.live(reload);
})();
