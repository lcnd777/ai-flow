/* AI Flow — rendu commun des pages de l'extension (popup, tableau de bord, paramètres, transfert). */
(function(root){
  'use strict';
  const A=root.AIFlow,esc=A.escapeHTML;
  const FAILURES={login:'connexion requise',
    'rate-limit':'trop de requêtes, nouvel essai bientôt',http:'service momentanément inaccessible','invalid-json':'réponse inattendue',
    'injection-failed':'Safari n’autorise pas encore AI Flow sur ce site',network:'réseau indisponible',timeout:'lecture trop longue',
    'no-figures':'aucun quota renvoyé','org-ambiguous':'plusieurs organisations, choix impossible','scripting-unavailable':'lecture non autorisée par le navigateur',
    'no-result':'page pas encore prête','invalid-result':'réponse non reconnue','wrong-origin':'onglet sur un autre domaine'};
  const logo=(pid,cls='')=>{const p=A.platform(pid);return `<span class="logo ${cls}" style="--brand:${p?.color||'#888'}">${p?.logo||''}</span>`;};
  function meter(state,id,now=Date.now()){
    const m=state.metrics[id],stale=A.isStale(m,id,now),lv=A.level(m,id,now);
    const value=stale?'Indisponible':`${Math.round(m.percent)} %`;
    const reset=!stale&&m.resetAt?A.formatReset(m.resetAt,now):'';
    return `<div class="meter ${stale?'is-unknown':''}"><div class="meter-head"><span>${esc(A.METRICS[id].short)}</span><b>${esc(value)}</b></div>
      <div class="track"><i class="bar ${lv}" style="width:${stale?0:Math.max(1.5,m.percent)}%"></i></div>
      ${reset||(!stale&&m.detail)?`<div class="meter-meta"><span>${esc(m?.detail||'')}</span><span>${esc(reset)}</span></div>`:''}</div>`;
  }
  // Pourquoi une plateforme n'a pas de chiffre : explication courte et action utile.
  function connection(state,pid,conn,now=Date.now()){
    const p=A.platform(pid),st=A.platformStatus(state,pid,now),c=conn?.[pid]||{};
    if(p.support==='none')return {text:'Quotas non exposés : non mesuré',cls:'muted',action:'open'};
    if(c.disabled)return {text:'Mise à jour automatique désactivée',cls:'muted',action:null};
    if(st.fresh.length)return {text:A.updatedText(st.updatedAt,now)+(st.partial?' · lecture partielle':''),cls:now-st.updatedAt>A.LATE_MS?'late':'ok',action:null};
    const d=c.diag;
    if(d?.status==='login')return {text:`Connecte-toi à ${p.name} dans Safari`,cls:'warn',action:'open'};
    if(c.tabOpen&&d&&!['ok','partial'].includes(d.status)&&FAILURES[d.status])return {text:'Indisponible : '+FAILURES[d.status],cls:'warn',action:'open'};
    if(c.tabOpen)return {text:'Lecture en cours…',cls:'muted',action:null};
    return {text:`Ouvre ${p.name} dans un onglet pour actualiser`,cls:'muted',action:'open'};
  }
  const LEVEL_LABEL={critical:'Limite proche',warning:'À surveiller',healthy:'Disponible',unknown:'Indisponible',unmeasured:'Non mesuré'};
  function chip(st){
    if(st.limitReached)return '<span class="chip critical">Limite atteinte</span>';
    return `<span class="chip ${st.level}">${LEVEL_LABEL[st.level]}</span>`;
  }
  function platformCard(state,pid,conn,opts={}){
    const p=A.platform(pid),st=A.platformStatus(state,pid),c=connection(state,pid,conn);
    if(opts.compact&&p.support==='none')return `<article class="pcard slim" data-platform="${pid}" title="${esc(p.note)}">
      <header>${logo(pid)}<div class="pname"><b>${esc(p.name)}</b></div>${chip(st)}<button class="ghost small" data-open-platform="${pid}">Ouvrir ↗</button></header></article>`;
    const ids=opts.all?st.ids:p.primary;
    const auto=A.platformAutonomy(state,pid),autoTxt=A.autonomyText(auto);
    const tag=p.support==='experimental'?'<span class="tag">expérimental</span>':'';
    const body=p.support==='none'
      ?`<p class="note">${esc(p.note)}</p>`
      :ids.map(id=>meter(state,id)).join('')+(autoTxt?`<p class="estimate" title="Estimation calculée sur ${auto.observations} relevés locaux : ce n’est pas une donnée officielle.">${esc(autoTxt)} <em>Estimation</em></p>`:'');
    const action=c.action==='open'?`<button class="ghost small" data-open-platform="${pid}">Ouvrir ↗</button>`:'';
    return `<article class="pcard lvl-${st.limitReached?'critical':st.level}" data-platform="${pid}">
      <header>${logo(pid)}<div class="pname"><b>${esc(p.name)}</b>${tag}</div>${chip(st)}</header>
      ${body}
      <footer><span class="conn ${c.cls}">${esc(c.text)}</span>${action}</footer></article>`;
  }
  function smartSwitchHTML(state,opts={}){
    const sw=A.smartSwitch(state);
    if(!sw.pressured.length)return '';
    const names=sw.pressured.map(s=>A.platform(s.platform).name);
    const head=sw.pressured.some(s=>s.limitReached)?`${names.join(' et ')} : limite atteinte.`:`${names.join(' et ')} ${names.length>1?'approchent':'approche'} de sa limite.`;
    const row=(s,txt)=>`<button class="alt" data-open-platform="${s.platform}">${logo(s.platform,'sm')}<span>${esc(A.platform(s.platform).name)}</span><small>${esc(txt)}</small></button>`;
    const avail=sw.available.map(s=>row(s,`${Math.round(s.worst)} % utilisés · ${A.updatedText(s.updatedAt)}`)).join('');
    const unknown=[...sw.unknown,...sw.partial].map(s=>A.platform(s.platform).name);
    const unmeasured=sw.unmeasured.map(s=>A.platform(s.platform).name);
    return `<section class="switch-card" role="status"><div class="switch-head"><b>Smart Switch</b><span>${esc(head)}</span></div>
      ${avail?`<p class="switch-sub">Capacité confirmée :</p><div class="alts">${avail}</div>`:'<p class="switch-sub">Aucune autre plateforme avec une capacité confirmée pour l’instant.</p>'}
      ${unknown.length?`<p class="fine">État inconnu (pas de relevé récent) : ${esc(unknown.join(', '))}.</p>`:''}
      ${unmeasured.length?`<p class="fine">Non mesurées : ${esc(unmeasured.join(', '))}.</p>`:''}
      ${opts.transfer!==false?'<button class="primary small" data-open-page="transfer">Préparer le transfert de contexte</button>':''}</section>`;
  }
  const isMac=()=>/Mac/i.test(navigator.platform||navigator.userAgent)&&!(navigator.maxTouchPoints>1)&&!/iPhone|iPad/i.test(navigator.userAgent);
  function awakeText(s){
    if(!s)return {text:'Vérification…',cls:'muted'};
    if(!s.enabled)return {text:'Désactivé',cls:'muted'};
    if(s.supported===false||!s.reachable||s.error==='unsupported-platform'){
      if(s.error==='unsupported-platform'||!isMac())return {text:'Indisponible sur cet appareil (Mac uniquement)',cls:'warn'};
      if(s.until>Date.now())return {text:`Mode Terminal : lance la commande ci-dessous (jusqu’à ${A.dayClock(s.until)})`,cls:'warn'};
      return {text:'Mode Terminal (sans app Mac) : la commande apparaîtra à la prochaine relance',cls:'muted'};
    }
    if(s.until>Date.now())return s.appRunning?{text:`Actif jusqu’à ${A.dayClock(s.until)}`+(s.holding===false?' (en pause : batterie faible)':''),cls:'ok'}:{text:'Indisponible : l’app AI Flow ne s’est pas lancée',cls:'warn'};
    if(s.tooFar)return {text:'Prêt · relance prévue dans plus de 12 h : le Mac pourra se mettre en veille',cls:'muted'};
    return {text:'Prêt · s’activera à la prochaine relance programmée',cls:'ok'};
  }
  async function loadExtras(){
    const K=A.KEYS;
    try{const v=await A.api.storage.local.get([K.resume,K.resumeLast,K.drafts,K.history,K.auto]);
      return {jobs:v[K.resume]||{},last:v[K.resumeLast]||null,drafts:Array.isArray(v[K.drafts])?v[K.drafts]:[],history:A.cleanHistory(v[K.history]),auto:v[K.auto]||{}};}
    catch{return {jobs:{},last:null,drafts:[],history:A.cleanHistory(null),auto:{}};}
  }
  // Toujours un onglet normal : le popup Safari est trop petit pour ces pages.
  async function openPage(page,query){
    try{await A.request('openPage',{page,query},{timeout:2500});}
    catch{const url=A.api.runtime.getURL(page+'.html')+(query?'?'+new URLSearchParams(query):'');try{await A.api.tabs.create({url,active:true});}catch{location.href=url;return;}}
    if(document.body.classList.contains('popup'))window.close();
  }
  async function openPlatform(pid){
    try{await A.request('openPlatform',{platform:pid},{timeout:2500});}
    catch{const p=A.platform(pid);if(p)try{await A.api.tabs.create({url:p.home,active:true});}catch{window.open(p.home,'_blank');}}
    if(document.body.classList.contains('popup'))window.close();
  }
  function bindNav(rootEl){
    for(const b of rootEl.querySelectorAll('[data-open-page]'))if(!b.dataset.bound){b.dataset.bound=1;b.addEventListener('click',e=>{e.preventDefault();openPage(b.dataset.openPage,b.dataset.query?JSON.parse(b.dataset.query):undefined);});}
    for(const b of rootEl.querySelectorAll('[data-open-platform]'))if(!b.dataset.bound){b.dataset.bound=1;b.addEventListener('click',e=>{e.preventDefault();openPlatform(b.dataset.openPlatform);});}
  }
  async function getDrafts(){return (await loadExtras()).drafts;}
  async function saveDrafts(list){await A.api.storage.local.set({[A.KEYS.drafts]:list.slice(0,20)});}
  // Safari ne transmet pas toujours storage.onChanged : relecture périodique en plus.
  function live(refresh,ms=30000){
    let t=null;
    A.api.storage.onChanged.addListener((c,area)=>{if(area!=='local')return;clearTimeout(t);t=setTimeout(refresh,250);});
    setInterval(refresh,ms);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  }
  root.AIFlowUI={FAILURES,logo,meter,connection,platformCard,smartSwitchHTML,awakeText,isMac,loadExtras,openPage,openPlatform,bindNav,getDrafts,saveDrafts,live,chip};
})(window);
