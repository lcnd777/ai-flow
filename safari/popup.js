(async function(){
  'use strict';
  const A=window.AIFlow;
  if(new URLSearchParams(location.search).get('view')==='full')document.documentElement.classList.add('dashboard-full');
  const $=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function meter(state,id){
    const m=state.metrics[id],lv=A.level(m,id,Date.now(),state.settings),stale=m&&A.isStale(m,id);
    const value=m&&!stale?`${Math.round(m.percent)} %`:m?'Périmé':'Indisponible';
    const freshness=!m?'Aucune donnée':stale?'Relevé périmé':m.source==='observed'?`Observé · il y a ${Math.max(0,Math.floor((Date.now()-m.observedAt)/60000))} min`:'Saisie manuelle';
    return `<div class="meter"><div class="meter-head"><span>${esc(A.METRICS[id].short)}</span><span class="meter-value">${esc(value)}</span></div>
    <div class="track"><div class="bar ${lv==='warning'?'warn':lv==='critical'?'danger':''}" style="width:${m&&!stale?m.percent:0}%"></div></div>
    <div class="meter-meta"><span>${esc(freshness)}</span><span>${m&&m.resetAt?esc((m.resetApproximate?'≈ ':'')+A.formatReset(m.resetAt)):''}</span></div></div>`;
  }
  function providerCard(state,id,name,mark,note,keys){
    const states=keys.map(k=>A.level(state.metrics[k],k,Date.now(),state.settings));
    const max=states.includes('critical')?'critical':states.includes('warning')?'warning':states.includes('healthy')?'healthy':'unknown';
    const status=max==='critical'?'Limite proche':max==='warning'?'À surveiller':max==='healthy'?(states.includes('unknown')?'Données partielles':'Pas d’alerte'):'À relever';
    return `<section class="card"><div class="card-top"><div class="provider"><div class="provider-icon ${id}">${mark}</div><div><div class="provider-title">${name}</div><div class="provider-description">${note}</div></div></div><span class="state ${max==='healthy'?'good':max==='warning'?'warn':max==='critical'?'danger':''}">${status}</span></div><div class="meters">${keys.map(k=>meter(state,k)).join('')}</div></section>`;
  }
  function updateRunway(state){
    const mins=Number($('duration').value);
    const f=A.platformForecast(state,$('planner-metric').value,mins);
    let line=f.text;
    const prefix=['warning','caution'].includes(f.kind)?'Attention : ':'';
    $('runway').querySelector('p').textContent=prefix+line;
  }
  let state,connectionStatuses={};
  try {state=await A.getState();}catch(e){$('form-status').textContent=e.message;return;}
  const metricOptions=Object.entries(A.METRICS).map(([id,m])=>`<option value="${id}">${esc(m.label)}</option>`).join('');
  $('metric-id').innerHTML=metricOptions;$('planner-metric').innerHTML='<option value="claude">Claude · ensemble des quotas</option><option value="codex">Codex / Work · ensemble des quotas</option>';
  $('planner-metric').addEventListener('change',()=>updateRunway(state));
  function render(){
    $('provider-cards').innerHTML=providerCard(state,'claude','Claude','✳','Session et limites hebdomadaires',A.providerIds(state,'claude'))+
      providerCard(state,'chatgpt','ChatGPT','◎','Codex / Work · limites exposées',A.providerIds(state,'chatgpt'));
    $('provider-cards').insertAdjacentHTML('beforeend','<p class="subtitle">Thinking / mode Pro : aucun compteur automatique fiable intégré. Work partage l’usage Codex selon la documentation OpenAI. Aucune limite d’abonnement supposée.</p>');
    renderConnectors();
    renderConnections();
    $('focus-toggle').checked=state.settings.focusMode;
    $('duration').value=String(state.settings.sessionMinutes);
    $('reserve').value=String(state.settings.reservePercent);
    updateRunway(state);
    $('health-label').textContent=Object.values(state.metrics).some(m=>m.source==='observed')?'Relevé observé':'Données locales';
  }
  const diagnosticLabels={ok:'Lecture API réussie',partial:'Lecture API partielle',login:'Accès API non autorisé (401/403)',
    'page-waiting':'Lecture de la page officielle en cours', 'page-redirect':'Page Utilisation redirigée : vérifier la session ou les accès Claude', 'page-script-unavailable':'Le lecteur de la page Claude ne répond pas (autorisation Safari à vérifier)', 'page-ok':'Lecture de page officielle réussie', 'page-empty':'Page ouverte : aucun chiffre reconnu', 'page-login':'Connexion Claude requise dans l’onglet',
    'org-ambiguous':'Organisation absente ou choix ambigu','no-figures':'Aucun quota exploitable retourné',
    'rate-limit':'Claude limite les requêtes (429)',http:'Endpoint Claude inaccessible',
    'invalid-json':'Format de réponse inattendu', 'injection-failed':'Lecture dans l’onglet Claude non autorisée', network:'Réseau, cookies Safari ou permissions bloqués',timeout:'Lecture expirée'};
  async function renderDiagnostics(){
    const el=$('diagnostics');if(!el)return;
    try{
      const data=await A.request('diagnostics'),lines=[];
      for(const provider of ['claude','codex']){
        const d=data[provider];
        if(!d){lines.push(`${provider==='claude'?'Claude':'Codex'} : suivi non activé.`);continue;}
        const time=new Date(d.checkedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
        let label=diagnosticLabels[d.status]||d.status;
        if(['ok','partial'].includes(d.status)&&d.stage==='page-context')label='Quotas lus depuis la session Claude ouverte';
        if(['ok','partial'].includes(d.status)&&d.stage==='usage'&&provider==='codex')label='Quotas Codex lus depuis la session ChatGPT';
        lines.push(`${provider==='claude'?'Claude':'Codex'} · ${label} · ${time}${d.httpStatus?' · HTTP '+d.httpStatus:''}${d.pageStatus?' · lecture onglet : '+d.pageStatus:''}${d.readings?' · '+d.readings+' quota(s)':''}`);
      }
      el.textContent=lines.join(' | ');
    }catch{el.textContent='Diagnostic indisponible.';}
  }
  function renderConnections(){
    const labels={claude:'Claude',codex:'ChatGPT'};
    const summaries={
      'quota-confirmed':'Quotas observés récemment',
      'site-open':'Site ouvert · connexion et quotas non vérifiés',
      'signin-required':'Connexion requise sur le site officiel',
      'not-open':'Site non ouvert · connexion non vérifiée'
    };
    $('account-connections').innerHTML=['claude','codex'].map(provider=>{
      const c=connectionStatuses[provider]||{status:'not-open'};
      const status=summaries[c.status]||'État non vérifié';
      return `<div class="account-row"><div><div class="account-name">${labels[provider]}</div><span class="account-state ${c.status==='quota-confirmed'?'verified':''}">${esc(status)}</span></div><div class="account-actions"><button class="secondary" data-open-provider="${provider}">Ouvrir</button><button class="secondary" data-check-provider="${provider}">Vérifier</button></div></div>`;
    }).join('');
    for(const button of $('account-connections').querySelectorAll('[data-open-provider],[data-check-provider]')){
      button.addEventListener('click',async()=>{
        const open=button.hasAttribute('data-open-provider'),provider=button.dataset[open?'openProvider':'checkProvider'];
        button.disabled=true;
        try{
          if(open){await A.request('openProvider',{provider});$('connection-notice').textContent='Site officiel ouvert. Connecte-toi si nécessaire, puis reviens cliquer sur Vérifier.';}
          else{await A.request('trackerStart',{provider});$('connection-notice').textContent='Lecture demandée. Un quota confirmé apparaîtra seulement si une valeur réelle est obtenue.';}
          await updateConnections();await renderDiagnostics();
        }catch(e){$('connection-notice').textContent=e.message;}
        finally{button.disabled=false;}
      });
    }
  }
  async function updateConnections(){
    try{connectionStatuses=await A.request('connectionStatuses');renderConnections();}
    catch(e){$('connection-notice').textContent='Vérification des sessions impossible : '+e.message;}
  }
  function renderConnectors(){
    $('connectors').innerHTML=['claude','codex'].map(provider=>{const c=state.connectors[provider];return `<div class="connector"><div><b>${provider==='claude'?'Claude':'Codex'}</b><p class="subtitle">${esc(A.connectorLabel(c))}${c?.checkedAt?` · ${new Date(c.checkedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`:''}</p></div><div class="connector-actions"><button class="secondary" data-start="${provider}">${provider==='claude'?'Activer · page officielle si API bloquée':'Activer · lecture depuis ChatGPT'}</button><button class="secondary" data-stop="${provider}">Arrêter</button></div></div>`;}).join('');
    for(const button of $('connectors').querySelectorAll('[data-start],[data-stop]'))button.addEventListener('click',async()=>{
      const start=button.hasAttribute('data-start');button.disabled=true;
      try{await A.request(start?'trackerStart':'trackerStop',{provider:button.dataset[start?'start':'stop']});$('connector-notice').textContent=start?(button.dataset.start==='claude'?'Suivi Claude lancé. En cas d’erreur API, AI Flow utilise la page officielle dans un onglet normal.':'Page officielle de suivi ouverte dans un onglet normal.'):'Suivi arrêté.';await renderDiagnostics();}
      catch(e){$('connector-notice').textContent=e.message;}finally{button.disabled=false;}
    });
  }
  $('open-full').addEventListener('click',async()=>{
    try{await A.request('openDashboard');}catch(e){$('quick-notice').textContent=e.message;}
  });
  $('quick-claude').addEventListener('click',async()=>{
    const button=$('quick-claude');button.disabled=true;
    try{await A.request('trackerStart',{provider:'claude'});$('quick-notice').textContent='Suivi Claude demandé. Consulte le diagnostic ci-dessous ou la page officielle.';await renderDiagnostics();}
    catch(e){$('quick-notice').textContent=e.message;}
    finally{button.disabled=false;}
  });
  $('refresh').addEventListener('click',async()=>{try{await A.request('refresh');$('connector-notice').textContent='Actualisation demandée aux connecteurs actifs.';await renderDiagnostics();}catch(e){$('connector-notice').textContent=e.message;}});
  render();updateConnections();renderDiagnostics();
  // Automatic refresh on opening: no need to click « Vérifier ».
  A.request('autoRefresh',{}).then(async()=>{state=await A.getState();render();renderDiagnostics();},()=>{});
  setInterval(()=>{A.request('autoRefresh',{}).catch(()=>{});},60000);
  $('save').addEventListener('click',async()=>{
    const id=$('metric-id').value,pct=Number($('percent').value),raw=$('reset').value;
    const status=$('form-status');status.classList.remove('error');
    if(!$('percent').value||!Number.isFinite(pct)||pct<0||pct>100){status.textContent='Saisis un pourcentage de 0 à 100.';status.classList.add('error');return;}
    try {
      await A.saveMetric({id,percent:pct,resetAt:raw||null,source:'manual'});
      state=await A.getState();render();status.textContent='Relevé enregistré localement.';
    }catch(e){status.textContent=e.message;status.classList.add('error');}
  });
  $('duration').addEventListener('change',async()=>{
    state=await A.saveSettings({sessionMinutes:Number($('duration').value)});updateRunway(state);
  });
  $('reserve').addEventListener('change',async()=>{
    state=await A.saveSettings({reservePercent:Number($('reserve').value)});updateRunway(state);
  });
  $('focus-toggle').addEventListener('change',async()=>{
    state=await A.saveSettings({focusMode:$('focus-toggle').checked});render();
  });
  A.api.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes[A.KEY]){state=A.clean(changes[A.KEY].newValue);render();updateConnections();}if(area==='local'&&changes.ai_flow_diagnostics_v1){renderDiagnostics();updateConnections();}
  });
  setInterval(()=>{render();},60000);
})();
