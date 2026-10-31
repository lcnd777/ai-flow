(async function(){
  'use strict';
  const A=window.AIFlow,U=window.AIFlowUI,PL=window.AIFlowPlatforms,$=id=>document.getElementById(id),esc=A.escapeHTML;
  let state,conn={},extras={jobs:{},drafts:[]},awake=null,active=null,busy='';
  {const m=A.api.runtime.getManifest();if(/dev/i.test(m.version_name||''))$('ver').textContent=m.version_name;}
  try{state=await A.getState();}catch(e){$('platforms').textContent=e.message;return;}
  // Onglet actif : quelle IA j'utilise en ce moment ?
  try{
    const [tab]=await A.api.tabs.query({active:true,currentWindow:true});
    const site=tab?.url?PL.siteFor(tab.url):null;
    if(site)active={tabId:tab.id,site,platform:site==='chatgpt'?'codex':site,conv:PL.conversationOf(tab.url),title:tab.title||''};
  }catch{}

  function nowBar(){
    if(!active)return '';
    const st=A.platformStatus(state,active.platform),run=A.platformRunway(state,active.platform);
    const info=A.runwayWorthShowing(run)?A.runwayText(run):st.fresh.length?`${Math.round(st.worst)} % utilisés · ${A.formatReset(state.metrics[st.worstId]?.resetAt)}`:'Quota en cours de lecture…';
    const label=active.site==='chatgpt'?'Tu es sur ChatGPT (quotas Codex)':`Tu utilises ${A.platform(active.platform).name}`;
    const actions=active.conv&&['claude','chatgpt'].includes(active.site)?`<div class="now-actions"><button class="primary small" id="do-transfer">Transférer cette conversation</button><button class="ghost small" id="do-checkpoint">Point de reprise</button></div>`:'';
    return `<section class="nowbar">${U.logo(active.site==='chatgpt'?'chatgpt':active.platform)}<div><b>${esc(label)}</b><small>${esc(info)}</small></div></section>${actions}${busy?`<p class="fine" role="status">${esc(busy)}</p>`:''}`;
  }
  function continuity(){
    const rows=[],now=Date.now();
    for(const j of Object.values(extras.jobs).sort((a,b)=>a.at-b.at)){
      const a=awake&&state.settings.awakeMode!=='catchup'?U.awakeText(awake):null;
      rows.push(`<div class="cline">${U.logo(j.platform,'sm')}<div><b>Relance ${esc(A.dayClock(j.at))}</b><small>${j.attempts?'Nouvel essai · '+esc(j.status):'« '+esc(j.message.slice(0,48))+(j.message.length>48?'…':'')+' »'}${a?' · '+esc(a.text):''}</small></div><button class="ghost small" data-cancel="${esc(j.id)}">Annuler</button></div>`);
    }
    const items=A.timelineItems(extras.drafts,state);
    for(const d of items.slice(0,3)){
      const act=d.ready&&d.url?`<button class="primary small" data-resume="${esc(d.id)}">Reprendre</button>`
        :d.destUrl?`<button class="ghost small" data-url="${esc(d.destUrl)}">Continuer</button>`
        :`<button class="ghost small" data-open-page="transfer" data-query='${esc(JSON.stringify({draft:d.id}))}'>${d.interrupted?'Transférer':'Ouvrir'}</button>`;
      rows.push(`<div class="cline ${d.ready?'ready':''}">${U.logo(d.source||'claude','sm')}<div><b>${esc(d.title)}</b><small>${esc(d.label)} · ${esc(A.dayClock(d.updatedAt))}</small></div>${act}</div>`);
    }
    if(items.length>3)rows.push(`<p class="fine"><a href="#" data-open-page="dashboard">${items.length-3} autre${items.length>4?'s':''} dans la Flow Timeline ›</a></p>`);
    return rows.length?`<section class="continuity"><h2>Continuité</h2>${rows.join('')}</section>`:'';
  }
  function render(){
    const visible=A.visiblePlatforms(state),now=Date.now();
    const order=active?[active.platform,...visible.filter(p=>p!==active.platform)].filter(p=>visible.includes(p)):visible;
    $('now').innerHTML=nowBar();
    $('switch').innerHTML=U.smartSwitchHTML(state);
    $('platforms').innerHTML=order.length?order.map(pid=>U.platformCard(state,pid,conn,{compact:true})).join(''):'<p class="note">Aucune plateforme affichée. Choisis-les dans Paramètres.</p>';
    $('continuity').innerHTML=continuity();
    const times=visible.map(pid=>A.platformStatus(state,pid,now).updatedAt).filter(Boolean);
    const last=times.length?Math.max(...times):null;
    $('sync').textContent=last?A.updatedText(last,now):'En attente d’un onglet';
    $('sync').className='sync '+(last&&now-last<=A.LATE_MS?'ok':'');
    U.bindNav(document);
    for(const b of document.querySelectorAll('[data-cancel]'))b.onclick=async()=>{b.disabled=true;try{await A.request('resumeCancel',{id:b.dataset.cancel});}catch{}await reload();};
    for(const b of document.querySelectorAll('[data-url]'))b.onclick=()=>U.openUrl(b.dataset.url);
    for(const b of document.querySelectorAll('[data-resume]'))b.onclick=async()=>{
      const list=A.cleanCheckpoints(extras.drafts),d=list.find(x=>x.id===b.dataset.resume);if(!d)return;
      d.status='done';d.updatedAt=Date.now();await U.saveDrafts(list);
      await U.openUrl(d.url);
    };
    $('do-transfer')?.addEventListener('click',()=>capture('transfer'));
    $('do-checkpoint')?.addEventListener('click',()=>capture('checkpoint'));
  }
  // Lecture de la conversation : uniquement sur ce clic, uniquement l'onglet actif.
  async function capture(kind){
    busy='Lecture de la conversation…';render();
    try{
      await A.request('captureConversation',{tabId:active.tabId},{timeout:20000});
      await U.openPage('transfer',kind==='checkpoint'?{capture:'1',mode:'checkpoint'}:{capture:'1'});
    }catch(e){
      busy=e.message;render();
      if(kind==='checkpoint')await U.openPage('transfer',{mode:'checkpoint',from:active.site});
    }
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
  const refresh=()=>A.request('autoRefresh',{}).then(reload,()=>{});
  refresh();setInterval(refresh,60000);
  if(Object.keys(extras.jobs).length&&state.settings.awakeMode!=='catchup')A.request('awakeStatus').then(s=>{awake=s;render();},()=>{});
  U.live(reload);
})();
