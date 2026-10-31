(async function(){
  'use strict';
  const A=window.AIFlow;
  if(new URLSearchParams(location.search).get('view')==='full')document.documentElement.classList.add('dashboard-full');
  const $=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const AUTO_KEY='ai_flow_auto_refresh_v1',DIAG_KEY='ai_flow_diagnostics_v1',RESUME_KEY='ai_flow_resume_v1',RESUME_LAST_KEY='ai_flow_resume_last_v1';
  const FRESH_MS=5*60000; // Under 5 min, no freshness line: the data updates on its own.
  const NAMES={claude:'Claude',codex:'ChatGPT',chatgpt:'ChatGPT'};
  const logo=p=>A.LOGOS[p==='codex'?'chatgpt':p]||'';
  const fmtTime=ts=>new Date(ts).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'});

  function meter(state,id){
    const m=state.metrics[id],lv=A.level(m,id,Date.now(),state.settings),stale=m&&A.isStale(m,id);
    const value=m&&!stale?`${Math.round(m.percent)} %`:'Indisponible';
    const age=m?Date.now()-m.observedAt:0;
    const freshness=!m?'En attente d’un onglet ouvert':stale?'Relevé trop ancien':age>FRESH_MS?`Mis à jour il y a ${Math.floor(age/60000)} min`:'';
    const reset=m&&!stale&&m.resetAt?(m.resetApproximate?'≈ ':'')+A.formatReset(m.resetAt):'';
    return `<div class="meter"><div class="meter-head"><span>${esc(A.METRICS[id].short)}</span><span class="meter-value">${esc(value)}</span></div>
    <div class="track"><div class="bar ${lv==='warning'?'warn':lv==='critical'?'danger':''}" style="width:${m&&!stale?m.percent:0}%"></div></div>
    ${freshness||reset?`<div class="meter-meta"><span class="${freshness&&m?'late':''}">${esc(freshness)}</span><span>${esc(reset)}</span></div>`:''}</div>`;
  }
  function providerCard(state,id,name,note,keys){
    const states=keys.map(k=>A.level(state.metrics[k],k,Date.now(),state.settings));
    const max=states.includes('critical')?'critical':states.includes('warning')?'warning':states.includes('healthy')?'healthy':'unknown';
    const status=max==='critical'?'Limite proche':max==='warning'?'À surveiller':max==='healthy'?(states.includes('unknown')?'Données partielles':'Pas d’alerte'):'En attente';
    return `<section class="card"><div class="card-top"><div class="provider"><div class="provider-icon ${id}">${logo(id)}</div><div><div class="provider-title">${name}</div><div class="provider-description">${note}</div></div></div><span class="state ${max==='healthy'?'good':max==='warning'?'warn':max==='critical'?'danger':''}">${status}</span></div><div class="meters">${keys.map(k=>meter(state,k)).join('')}</div></section>`;
  }
  function updateRunway(state){
    const f=A.platformForecast(state,$('planner-metric').value,Number($('duration').value));
    $('runway').querySelector('p').textContent=(['warning','caution'].includes(f.kind)?'Attention : ':'')+f.text;
  }

  let state,connectionStatuses={},extra={auto:{},diag:{},jobs:{},last:null};
  try{state=await A.getState();}catch(e){$('connection-notice').textContent=e.message;return;}
  async function loadExtra(){
    try{const v=await A.api.storage.local.get([AUTO_KEY,DIAG_KEY,RESUME_KEY,RESUME_LAST_KEY]);
      extra={auto:v[AUTO_KEY]||{},diag:v[DIAG_KEY]||{},jobs:v[RESUME_KEY]||{},last:v[RESUME_LAST_KEY]||null};}catch{}
  }
  $('planner-metric').innerHTML='<option value="claude">Claude · ensemble des quotas</option><option value="codex">ChatGPT · Codex / Work</option>';
  $('planner-metric').addEventListener('change',()=>updateRunway(state));

  function render(){
    $('provider-cards').innerHTML=providerCard(state,'claude','Claude','Session et limites hebdomadaires',A.providerIds(state,'claude'))+
      providerCard(state,'chatgpt','ChatGPT','Codex / Work · limites exposées',A.providerIds(state,'chatgpt'))+
      '<p class="subtitle small">ChatGPT : seules les limites Codex / Work sont exposées. Thinking / mode Pro ne sont pas suivis.</p>';
    renderConnections();renderResume();
    $('focus-toggle').checked=state.settings.focusMode;
    $('resume-toggle').checked=!!state.settings.resumePrompt;
    $('duration').value=String(state.settings.sessionMinutes);
    $('reserve').value=String(state.settings.reservePercent);
    updateRunway(state);
    const fresh=Object.entries(state.metrics).some(([id,m])=>!A.isStale(m,id));
    $('health-label').textContent=fresh?'À jour':'En attente';
    $('health-dot').style.background=fresh?'':'var(--muted)';
  }

  // Only shown when a read fails: the normal case needs no explanation.
  const failureLabels={login:'connexion requise ou accès refusé','rate-limit':'trop de requêtes, nouvel essai bientôt',http:'service momentanément inaccessible',
    'invalid-json':'format de réponse inattendu','injection-failed':'Safari n’autorise pas encore AI Flow sur ce site',network:'réseau ou cookies Safari bloqués',
    timeout:'lecture trop longue','no-figures':'aucun quota renvoyé','org-ambiguous':'plusieurs organisations Claude, choix impossible',
    'scripting-unavailable':'lecture non autorisée par Safari','no-result':'page pas encore prête','invalid-result':'réponse non reconnue'};
  function connectionText(provider){
    const c=connectionStatuses[provider]||{status:'not-open'},d=extra.diag[provider];
    if(extra.auto.disabled?.[provider])return {text:'Mise à jour automatique désactivée',cls:''};
    if(c.status==='quota-confirmed')return {text:'À jour',cls:'verified'};
    if(c.status==='signin-required')return {text:'Connecte-toi sur le site officiel',cls:'warn'};
    if(c.status==='site-open'){
      const fail=d&&!['ok','partial','page-ok'].includes(d.status)&&failureLabels[d.status];
      return fail?{text:'Lecture impossible : '+fail,cls:'warn'}:{text:'Lecture en cours…',cls:''};
    }
    return {text:`Ouvre ${NAMES[provider]} dans un onglet pour mettre à jour`,cls:''};
  }
  function renderConnections(){
    $('account-connections').innerHTML=['claude','codex'].map(provider=>{
      const s=connectionText(provider),on=!extra.auto.disabled?.[provider];
      return `<div class="account-row"><div class="account-id"><span class="provider-icon mini ${provider==='codex'?'chatgpt':'claude'}">${logo(provider)}</span><div><div class="account-name">${NAMES[provider]}</div><span class="account-state ${s.cls}">${esc(s.text)}</span></div></div>
      <div class="account-actions"><button class="secondary" data-open-provider="${provider}">Ouvrir</button><label class="switch" title="Mise à jour automatique"><input type="checkbox" data-auto="${provider}" ${on?'checked':''} aria-label="Mise à jour automatique ${NAMES[provider]}"><span></span></label></div></div>`;
    }).join('');
    for(const b of $('account-connections').querySelectorAll('[data-open-provider]'))b.addEventListener('click',async()=>{
      b.disabled=true;try{await A.request('openProvider',{provider:b.dataset.openProvider});}catch(e){$('connection-notice').textContent=e.message;}finally{b.disabled=false;}
    });
    for(const input of $('account-connections').querySelectorAll('[data-auto]'))input.addEventListener('change',async()=>{
      input.disabled=true;
      try{await A.request('autoSet',{provider:input.dataset.auto,enabled:input.checked});await loadExtra();await updateConnections();}
      catch(e){input.checked=!input.checked;$('connection-notice').textContent=e.message;}
      finally{input.disabled=false;}
    });
  }
  function renderResume(){
    const jobs=Object.values(extra.jobs).sort((a,b)=>a.at-b.at);
    const rows=jobs.map(j=>`<div class="resume-item"><span class="provider-icon mini ${j.provider}">${logo(j.provider)}</span><div><b>${esc(fmtTime(j.at))}</b> · ${NAMES[j.provider]}${j.attempts?` · nouvel essai (${esc(j.status)})`:''}<span>« ${esc(j.message.slice(0,60))}${j.message.length>60?'…':''} »</span></div><button class="secondary" data-cancel="${esc(j.id)}">Annuler</button></div>`).join('');
    const last=extra.last?`<p class="subtitle small">Dernière relance : ${esc(extra.last.status)} · ${esc(fmtTime(extra.last.at))}</p>`:'';
    $('resume-list').innerHTML=rows?`<div class="resume-items">${rows}</div>${last}`:last;
    for(const b of $('resume-list').querySelectorAll('[data-cancel]'))b.addEventListener('click',async()=>{
      b.disabled=true;try{await A.request('resumeCancel',{id:b.dataset.cancel});}catch{}await loadExtra();render();
    });
  }
  async function updateConnections(){
    try{connectionStatuses=await A.request('connectionStatuses');}catch{}
    renderConnections();
  }

  $('open-full').addEventListener('click',async()=>{try{await A.request('openDashboard');}catch{}});
  $('focus-toggle').addEventListener('change',async()=>{state=await A.saveSettings({focusMode:$('focus-toggle').checked});render();});
  $('resume-toggle').addEventListener('change',async()=>{state=await A.saveSettings({resumePrompt:$('resume-toggle').checked});render();});
  $('duration').addEventListener('change',async()=>{state=await A.saveSettings({sessionMinutes:Number($('duration').value)});updateRunway(state);});
  $('reserve').addEventListener('change',async()=>{state=await A.saveSettings({reservePercent:Number($('reserve').value)});updateRunway(state);});

  await loadExtra();render();updateConnections();
  // Automatic refresh on opening, then every minute while the window stays open.
  const autoRefresh=()=>A.request('autoRefresh',{}).catch(()=>{});
  autoRefresh();setInterval(autoRefresh,60000);
  A.api.storage.onChanged.addListener(async(changes,area)=>{
    if(area!=='local')return;
    if(changes[A.KEY])state=A.clean(changes[A.KEY].newValue);
    if([A.KEY,AUTO_KEY,DIAG_KEY,RESUME_KEY,RESUME_LAST_KEY].some(k=>changes[k])){await loadExtra();render();updateConnections();}
  });
  // Safari may not deliver storage events reliably: re-read every 30 s.
  setInterval(async()=>{try{state=await A.getState();}catch{}await loadExtra();render();},30000);
})();
