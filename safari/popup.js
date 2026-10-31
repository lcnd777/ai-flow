(async function(){
  'use strict';
  const A=window.AIFlow,U=window.AIFlowUI,PL=window.AIFlowPlatforms,$=id=>document.getElementById(id),esc=A.escapeHTML;
  let state,conn={},extras={jobs:{},drafts:[]},awake=null,active=null,busy='',flows=[];
  {const m=A.api.runtime.getManifest();if(/dev/i.test(m.version_name||''))$('ver').textContent=m.version_name;}
  try{state=await A.getState();}catch(e){$('platforms').textContent=e.message;return;}
  // Onglet actif : quelle IA j'utilise en ce moment ?
  try{
    const [tab]=await A.api.tabs.query({active:true,currentWindow:true});
    const site=tab?.url?PL.siteFor(tab.url):null;
    if(site)active={tabId:tab.id,site,platform:site==='chatgpt'?'codex':site,conv:PL.conversationOf(tab.url),url:tab.url,title:tab.title||''};
  }catch{}

  function nowBar(){
    if(!active)return '';
    const st=A.platformStatus(state,active.platform),run=A.platformRunway(state,active.platform);
    const info=A.runwayWorthShowing(run)?A.runwayText(run):st.fresh.length?`${Math.round(st.worst)} % utilisés · ${A.formatReset(state.metrics[st.worstId]?.resetAt)}`:'Quota en cours de lecture…';
    const label=active.site==='chatgpt'?'Tu es sur ChatGPT (quotas Codex)':`Tu utilises ${A.platform(active.platform).name}`;
    const actions=PL.transferable(active.url)?`<div class="now-actions"><button class="primary small" id="do-transfer">Transférer cette conversation</button><button class="ghost small" id="do-checkpoint">Point de reprise</button></div>`:'';
    return `<section class="nowbar">${U.logo(active.site==='chatgpt'?'chatgpt':active.platform)}<div><b>${esc(label)}</b><small>${esc(info)}</small></div></section>${actions}${flowCard()}${busy?`<p class="fine" role="status">${busy}</p>`:''}`;
  }
  // Smart Context Sync : conversation active liée à une autre IA → « Synchroniser » et « Voir les détails ».
  function flowCard(){
    const f=PL.transferable(active.url)&&U.flowOf(flows,active.url);if(!f)return '';
    const me=PL.conversationOf(active.url).url,other=f.ends.find(e=>e.url!==me),st=U.flowState(f);
    return `<div class="flow-card"><b>Flow · ${esc(f.title)}</b><small>Lié à ${esc(A.platform(other.platform).name)} « ${esc(other.title)} » · <span class="${st.pending?'warn':''}">${esc(st.text)}</span></small>
      <div class="row-actions"><button class="primary small" id="do-sync" data-flow="${esc(f.id)}">Synchroniser</button><button class="ghost small" data-open-page="transfer" data-query='${esc(JSON.stringify({sync:f.id,from:me}))}'>Voir les détails</button></div></div>`;
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
      // Flow Recovery : avant de reprendre, proposer les avancées faites entre-temps sur l'autre IA.
      const f=d.url&&U.flowOf(flows,d.url),other=f&&f.ends.find(e=>e.url!==d.url);
      const sync=other?`<button class="ghost small" data-open-page="transfer" data-query='${esc(JSON.stringify({sync:f.id,from:other.url,auto:'1'}))}' title="Synchroniser les avancées de ${esc(A.platform(other.platform).name)}">Avancées ${esc(A.platform(other.platform).name)}</button>`:'';
      rows.push(`<div class="cline ${d.ready?'ready':''}">${U.logo(d.source||'claude','sm')}<div><b>${esc(d.title)}</b><small>${esc(d.label)} · ${esc(A.dayClock(d.updatedAt))}${f?' · lié':''}</small></div>${sync}${act}</div>`);
    }
    if(items.length>3)rows.push(`<p class="fine"><a href="#" data-open-page="dashboard">${items.length-3} autre${items.length>4?'s':''} dans la Flow Timeline ›</a></p>`);
    return rows.length?`<section class="continuity"><h2>Continuité</h2>${rows.join('')}</section>`:'';
  }
  function render(){
    const visible=A.visiblePlatforms(state),now=Date.now();
    const order=active?[active.platform,...visible.filter(p=>p!==active.platform)].filter(p=>visible.includes(p)):visible;
    $('now').innerHTML=nowBar();
    $('switch').innerHTML=U.smartSwitchHTML(state,{current:active?.platform||null});
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
    $('do-sync')?.addEventListener('click',()=>quickSync($('do-sync').dataset.flow));
  }
  // Détection sur clic : « À jour » directement dans la fenêtre, sinon prévisualisation détaillée.
  async function quickSync(flowId){
    const from=PL.conversationOf(active.url).url;
    busy='Recherche des avancées…';render();
    try{
      const r=await A.request('syncCapture',{flowId,from},{timeout:30000});
      if(r.error){busy=esc(r.error.message);render();return;}
      if(r.delta?.upToDate){busy=`<b class="ok">À jour</b> · aucune avancée depuis la dernière synchronisation${r.delta.partial?' (capture partielle : messages non chargés non vérifiés)':''}.`;render();return;}
      busy='';await U.openPage('transfer',{sync:flowId,from,auto:'1'});
    }catch(e){busy=esc(e.message);render();}
  }
  // Lecture de la conversation : uniquement sur ce clic, uniquement l'onglet actif.
  async function capture(kind){
    busy='Lecture de la conversation…';render();
    try{
      await A.request('captureConversation',{tabId:active.tabId},{timeout:20000});
      await U.openPage('transfer',kind==='checkpoint'?{capture:'1',mode:'checkpoint'}:{capture:'1'});
    }catch(e){
      busy=esc(e.message);render();
      await U.openPage('transfer',{...(kind==='checkpoint'?{mode:'checkpoint'}:{}),from:active.site,why:'err',err:String(e.message||'').slice(0,180)});
    }
  }
  async function reload(){
    try{state=await A.getState();}catch{}
    extras=await U.loadExtras();flows=(await U.loadFlows()).flows;
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
