/* AI Flow — pastille intégrée aux sites. Isolée (shadow DOM fermé). Ne lit ni les messages ni les réponses réseau.
 * Seule exception, sur clic explicite « Transférer » : le texte que l'utilisateur a sélectionné. */
(async function(){
  'use strict';
  if(window.top!==window||document.querySelector('[data-ai-flow-widget]'))return;
  const A=window.AIFlow,PL=window.AIFlowPlatforms,K=A.KEYS;
  const site=PL.siteFor(location.href);if(!site)return;
  const sitePlatforms=PL.forUrl(location.href);
  const main=sitePlatforms.find(id=>PL.get(id).support!=='none')||site;
  const loadedAt=Date.now();
  let state;try{state=await A.getState();}catch{return;}
  let open=false,dragging=false,dragStart=null,toast=null,seenToasts=new Set();
  const host=document.createElement('div');host.setAttribute('data-ai-flow-widget','');
  const root=host.attachShadow({mode:'closed'});
  const style=document.createElement('style');
  style.textContent=`
  :host{all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483646;color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;line-height:1.4;--bg:#141a17;--panel:#18201c;--edge:#2f3d35;--ink:#eef3ee;--mut:#9fb0a5;--acc:#9ad6b1;--warn:#e6b071;--crit:#e58c80;--soft:#202a24}
  *{box-sizing:border-box}button{font:inherit;cursor:pointer;color:inherit}
  .pill{display:flex;align-items:center;gap:8px;color:var(--ink);background:var(--bg);border:1px solid var(--edge);box-shadow:0 10px 30px rgba(0,0,0,.28);border-radius:999px;padding:8px 12px;min-height:36px;font-size:11.5px;font-weight:650;user-select:none;white-space:nowrap;max-width:calc(100vw - 12px)}
  .pill:hover{background:#1c2520}.summary{color:var(--mut);font-weight:500;overflow:hidden;text-overflow:ellipsis}
  .dot{width:7px;height:7px;border-radius:50%;background:var(--acc);flex-shrink:0}.dot.warning{background:var(--warn)}.dot.critical{background:var(--crit)}.dot.unknown,.dot.unmeasured{background:#7d8c83}
  .chev{opacity:.6}.grip{touch-action:none;cursor:grab;opacity:.45;letter-spacing:-1px}
  .panel{background:var(--panel);border:1px solid var(--edge);color:var(--ink);border-radius:16px;width:310px;margin-bottom:9px;padding:15px;box-shadow:0 18px 44px rgba(0,0,0,.32);font-size:12px;max-height:calc(100dvh - 90px);overflow:auto}
  .heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.heading b{font-size:13.5px;display:flex;align-items:center;gap:7px}
  .logo{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:var(--soft);color:var(--ink)}.logo svg{width:13px;height:13px}
  .x{background:none;border:0;color:var(--mut);padding:4px 6px;border-radius:6px}.x:hover{background:var(--soft)}
  .sub{margin:12px 0 6px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);font-weight:700}
  .row{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:5px}.name{color:#c3cfc7}.pct{font-weight:750;font-variant-numeric:tabular-nums}
  .track{height:5px;border-radius:8px;background:#2c3832;overflow:hidden;margin-bottom:4px}.bar{display:block;background:var(--acc);height:100%;border-radius:8px}.bar.warning{background:var(--warn)}.bar.critical{background:var(--crit)}
  .meta{display:flex;justify-content:space-between;gap:8px;color:var(--mut);font-size:10.5px;margin-bottom:11px}
  .tiny{color:var(--mut);font-size:10.5px;line-height:1.55}.late{color:var(--warn)}.est{font-size:11px;color:#cfe0d4;background:var(--soft);border-radius:8px;padding:7px 9px;margin:2px 0 8px}.est em{font-style:normal;color:var(--mut);font-size:10px;border:1px solid var(--edge);border-radius:4px;padding:0 4px;margin-left:4px}
  .card{background:#2a211b;border:1px solid #6e4b36;border-radius:11px;padding:11px;margin-bottom:12px}.card b{display:block;margin-bottom:3px;color:#f3c9ae}
  .switch{background:#1d2a23;border:1px solid #355443;border-radius:11px;padding:10px 11px;margin:6px 0 10px}.switch b{color:var(--acc)}
  .alt{display:flex;align-items:center;gap:7px;width:100%;background:none;border:0;border-top:1px solid var(--edge);padding:7px 0;text-align:left}.alt:first-of-type{border-top:0}.alt small{margin-left:auto;color:var(--mut)}
  .actions{display:flex;flex-wrap:wrap;gap:6px 14px;border-top:1px solid var(--edge);margin-top:10px;padding-top:10px}
  .link{background:none;border:none;color:var(--acc);font-size:11.5px;padding:0}.link:hover{text-decoration:underline}
  .btn{background:var(--acc);color:#10281b;border:0;border-radius:8px;padding:6px 11px;font-weight:700;font-size:11.5px}
  .acts{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:8px}
  .resume{border-top:1px solid var(--edge);margin-top:10px;padding-top:10px}.resume label{display:block;margin-top:8px}
  .resume input[type=time],.resume textarea{display:block;width:100%;margin-top:3px;background:#0f1512;color:inherit;border:1px solid var(--edge);border-radius:8px;padding:6px 8px;font:inherit;font-size:12px;resize:vertical}
  .check{display:flex;gap:6px;align-items:center}.check input{margin:0}.warn{color:var(--warn)}.err{color:var(--crit)}
  .toast{background:var(--panel);border:1px solid var(--edge);border-left:3px solid var(--acc);border-radius:12px;padding:10px 12px;margin-bottom:8px;width:310px;box-shadow:0 12px 30px rgba(0,0,0,.3);font-size:12px;color:var(--ink)}
  .toast.reached{border-left-color:var(--crit)}.toast.approaching{border-left-color:var(--warn)}.toast b{display:block;margin-bottom:2px}.toast .row{margin:6px 0 0}
  .hidden{display:none!important}button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
  @media(prefers-color-scheme:light){:host{color-scheme:light;--bg:#fbfcfa;--panel:#fbfcfa;--edge:#d5ded7;--ink:#1d2d24;--mut:#5b6e62;--acc:#2f7a52;--warn:#a5671f;--crit:#b2493d;--soft:#edf2ee}
    .pill:hover{background:#f1f5f2}.name{color:#33463a}.track{background:#dde6e0}.btn{color:#fff}.card{background:#fbefe7;border-color:#e6bfa6}.card b{color:#8a4a24}.switch{background:#eef6f0;border-color:#c4dccd}
    .resume input[type=time],.resume textarea{background:#fff}.est{color:#25412f}}
  @media(max-width:600px){.panel,.toast{width:min(310px,calc(100vw - 24px))}.pill{padding:10px 12px;min-height:42px}}`;
  root.appendChild(style);
  const wrapper=document.createElement('div');root.appendChild(wrapper);
  document.documentElement.appendChild(host);
  const esc=A.escapeHTML,name=id=>PL.get(id)?.name||'';
  const logo=id=>`<span class="logo" style="color:${PL.get(id).color}">${PL.get(id).logo}</span>`;
  const send=(op,payload)=>{try{return A.request(op,payload);}catch(e){return Promise.reject(e);}};

  /* ---------- Relance programmée ---------- */
  const DEFAULT_TEXT='Continue exactement là où tu t’es arrêté.';
  let checkpoints=[],awakeInfo={},resumeData={jobs:{},last:null},formOpen=false,form={time:'',text:DEFAULT_TEXT,keepAwake:true,error:''},dismissed={},autoOpenedFor=null,armedInfo=null;
  async function loadAux(){
    try{
      const v=await A.api.storage.local.get([K.resume,K.resumeLast,K.dismiss,K.toast,K.awake,K.drafts]);awakeInfo=v[K.awake]||{};checkpoints=Array.isArray(v[K.drafts])?v[K.drafts]:[];
      resumeData={jobs:v[K.resume]||{},last:v[K.resumeLast]||null};dismissed=v[K.dismiss]||{};
      const list=(Array.isArray(v[K.toast])?v[K.toast]:[]).filter(t=>t.ts>=loadedAt-60000&&!seenToasts.has(t.id)&&(sitePlatforms.includes(t.platform)||t.type!=='approaching'));
      if(list.length&&!document.hidden){toast=list.at(-1);for(const t of list)seenToasts.add(t.id);}
    }catch{}
  }
  const conv=()=>PL.conversationOf(location.href)?.url||null;
  const canResume=!!PL.get(site).resume;
  const hhmm=ts=>A.clock(ts);
  function nextAt(v){const m=/^(\d{2}):(\d{2})$/.exec(v||'');if(!m)return NaN;const d=new Date();d.setHours(+m[1],+m[2],0,0);if(d.getTime()<=Date.now()+30000)d.setDate(d.getDate()+1);return d.getTime();}
  function currentJob(){const c=conv();return c?Object.values(resumeData.jobs).find(j=>j.url===c)||null:null;}
  // Compteurs qui bloquent le travail : Claude dans ses conversations, Codex dans ses tâches (chatgpt.com/codex).
  const LIMITS={claude:{platform:'claude',ids:['claude.session','claude.weekly']},chatgpt:{platform:'codex',ids:['codex.session','codex.weekly']}};
  function limitScope(){
    const l=LIMITS[site];if(!l)return null;
    if(site==='chatgpt'&&!/^\/codex\//.test(location.pathname))return null;
    return l;
  }
  function limitInfo(){
    const l=limitScope();if(!l)return null;
    const st=A.platformStatus(state,l.platform);
    const full=l.ids.filter(id=>st.fresh.includes(id)&&state.metrics[id].percent>=A.THRESHOLDS.LIMIT).map(id=>state.metrics[id]);
    if(!full.length)return null;
    const r=full.map(m=>m.resetAt).filter(Boolean);
    return {resetAt:r.length===full.length?Math.max(...r):null};
  }
  const limitKey=lim=>conv()+'|'+(lim.resetAt||'unknown');
  function limitPrompt(){const lim=limitInfo();if(!state.settings.resumePrompt||!lim||!conv()||currentJob()||dismissed[limitKey(lim)])return null;return lim;}
  function defaultForm(){
    const l=limitScope(),lim=limitInfo(),s=l?state.metrics[l.ids[0]]?.resetAt:null;
    const base=lim?.resetAt||(s&&s>Date.now()?s:null),presetAt=base?base+2*60000:null;
    return {time:presetAt?hhmm(presetAt):'',presetAt,text:form.text||DEFAULT_TEXT,keepAwake:true,error:''};
  }
  function awakeLine(job){
    const mode=state.settings.awakeMode;
    if(mode==='catchup'||!isMac)return ' · si le Mac dort, elle partira à son réveil';
    if(mode==='wake')return ' · réveil programmé : colle la commande ci-dessous';
    if(job.at-Date.now()>12*3600000)return ' · relance > 12 h : rattrapage au réveil';
    if(terminalMode(job))return ' · Mac éveillé : lance la commande ci-dessous';
    const a=armedInfo&&armedInfo.id===job.id?armedInfo.awake:null;
    if(a&&a.appRunning===false)return ' · Mac éveillé : app AI Flow non lancée';
    return ' · Mac maintenu éveillé';
  }
  const isMac=/Mac/i.test(navigator.platform||navigator.userAgent)&&!(navigator.maxTouchPoints>1);
  function terminalMode(job){
    const a=armedInfo&&armedInfo.id===job.id?armedInfo.awake:awakeInfo;
    return isMac&&state.settings.awakeMode==='stay'&&job.at-Date.now()<=12*3600000&&(a?.supported===false||a?.reachable===false);
  }
  function resumeSection(){
    if(!canResume||(!state.settings.resumePrompt&&!currentJob()))return '';
    if(!formOpen&&limitPrompt())return '';
    if(!conv())return `<div class="resume tiny">Relance après quota : ouvre une conversation pour la programmer.</div>`;
    const job=currentJob();
    if(job)return `<div class="resume"><div class="row"><span>Relance prévue <b>${esc(A.dayClock(job.at))}</b></span><button id="resume-cancel" class="link" data-id="${esc(job.id)}">Annuler</button></div><div class="tiny">« ${esc(job.message.slice(0,80))}${job.message.length>80?'…':''} »${esc(awakeLine(job))}${job.attempts?` · nouvel essai (${esc(job.status)})`:''}</div>${isMac&&state.settings.awakeMode==='wake'?`<div class="acts"><button id="awake-copy" class="btn" data-cmd="${esc(A.pmsetCommand(job.at-2*60000))}">Copier la commande de réveil</button></div><div class="tiny" id="awake-copied">Le Mac se réveillera à ${esc(hhmm(job.at-2*60000))}, enverra la relance puis se rendormira. Colle la commande dans Terminal, Entrée, puis ton mot de passe de session (invisible pendant la frappe).</div>`:terminalMode(job)?`<div class="acts"><button id="awake-copy" class="btn" data-cmd="${esc(A.caffeinateCommand(job.at+A.AWAKE_GRACE))}">Copier la commande Terminal</button></div><div class="tiny" id="awake-copied">Garde le Mac éveillé jusqu’à ${esc(hhmm(job.at+A.AWAKE_GRACE))}. Colle la commande dans Terminal (⌘V, Entrée) : rien ne s’affiche, c’est normal. Laisse la fenêtre ouverte.</div>`:''}</div>`;
    const last=resumeData.last&&resumeData.last.url===conv()?`<div class="tiny">Dernière relance : ${esc(resumeData.last.status)} · ${esc(A.dayClock(resumeData.last.at))}</div>`:'';
    if(!formOpen)return `<div class="resume">${last}<button id="resume-open" class="link">Relancer automatiquement à la réouverture…</button></div>`;
    return `<div class="resume resume-form"><div class="tiny">Envoie ce message une seule fois dans cette conversation, à l’heure choisie${limitScope()?` (seulement si le quota ${esc(name(limitScope().platform))} est bien rouvert)`:''}.</div>
      <label class="tiny">Heure${limitScope()?'':' (indiquée dans le message de limite)'}<input id="resume-time" type="time" value="${esc(form.time)}"></label>
      <label class="tiny">Message<textarea id="resume-text" rows="3" maxlength="2000">${esc(form.text)}</textarea></label>
      <div class="tiny">${state.settings.awakeMode==='wake'?'Après avoir programmé : copie la commande de réveil du Mac.':state.settings.awakeMode==='stay'?'Le Mac restera éveillé jusqu’à la relance (Awake).':'Si le Mac dort à cette heure-là, la relance partira à son réveil.'}</div>
      <div class="tiny warn">Envoi automatique depuis ton compte : ${esc(PL.get(site).vendor)} encadre l’usage de scripts sur son site. Laisse Safari ouvert.</div>
      <div class="acts"><button id="resume-arm" class="btn">Programmer</button><button id="resume-close" class="link">Fermer</button></div>
      ${form.error?`<div class="tiny err">${esc(form.error)}</div>`:''}</div>`;
  }
  async function arm(at){
    try{armedInfo=await send('resumeArm',{at,message:form.text||DEFAULT_TEXT,keepAwake:state.settings.awakeMode==='stay'});formOpen=false;form.error='';}
    catch(e){form.error=e?.message||'Programmation impossible.';}
    await loadAux();render();
  }
  function limitCard(){
    const lim=limitPrompt();if(!lim)return '';
    const at=lim.resetAt?lim.resetAt+2*60000:null;
    const who=name(limitScope().platform);
    return `<div class="card" role="alert"><b>Quota ${esc(who)} atteint</b>
      <div class="tiny">${lim.resetAt?`${esc(who)} rouvre ${esc(A.dayClock(lim.resetAt))}.`:'Heure de réouverture inconnue.'} Relancer automatiquement ${site==='claude'?'cette conversation':'cette tâche'} à ce moment-là ?</div>
      <div class="acts">${at?`<button id="limit-arm" class="btn" data-at="${at}">Programmer à ${esc(hhmm(at))}</button>`:''}<button id="limit-custom" class="link">${at?'Personnaliser':'Choisir l’heure'}</button><button id="limit-dismiss" class="link">Non merci</button></div>
      ${form.error&&!formOpen?`<div class="tiny err">${esc(form.error)}</div>`:''}</div>`;
  }

  /* ---------- Contenu ---------- */
  function meters(pid){
    const p=PL.get(pid),st=A.platformStatus(state,pid),now=Date.now();
    if(p.support==='none')return `<div class="tiny">${esc(p.note)}</div>`;
    const ids=st.ids.filter(id=>p.primary.includes(id)||st.fresh.includes(id));
    const html=ids.map(id=>{
      const m=state.metrics[id],ok=st.fresh.includes(id),lv=A.level(m,id,now);
      return `<div class="row"><span class="name">${esc(A.METRICS[id].short)}</span><span class="pct">${ok?Math.round(m.percent)+' %':'Indisponible'}</span></div>
        <div class="track"><span class="bar ${lv}" style="width:${ok?Math.max(1.5,m.percent):0}%"></span></div>
        <div class="meta"><span>${ok&&m.detail?esc(m.detail):''}</span><span>${ok?esc(A.formatReset(m.resetAt,now)):''}</span></div>`;
    }).join('');
    const run=A.platformRunway(state,pid),a=A.runwayWorthShowing(run)?A.runwayText(run):'';
    const upd=st.updatedAt?`<div class="tiny ${now-st.updatedAt>A.LATE_MS?'late':''}">${esc(A.updatedText(st.updatedAt,now))}</div>`:`<div class="tiny">Lecture des quotas en cours… vérifie que tu es connecté à ${esc(p.name)}.</div>`;
    return html+(a?`<div class="est">${esc(a)}${run.kind!=='reached'?'<em>estimation</em>':''}</div>`:'')+upd;
  }
  // Flow Recovery : quand la limite approche, proposer discrètement un point de reprise (une fois par période).
  function checkpointSuggestion(){
    const url=PL.conversationOf(location.href)?.url;if(!url||!['claude','chatgpt'].includes(site))return '';
    const st=A.platformStatus(state,main);
    if(!['near','reached','reset-soon'].includes(st.radar))return '';
    if(checkpoints.some(d=>d.url===url&&d.kind==='checkpoint'&&d.status!=='done'))return '';
    const m=state.metrics[st.worstId],key='cp|'+url+'|'+(m?.resetAt?Math.round(m.resetAt/600000):'x');
    if(dismissed[key])return '';
    return `<div class="switch" data-cp-key="${esc(key)}"><b>Point de reprise</b><div class="tiny">${esc(name(main))} ${st.limitReached?'a atteint sa limite':'approche de sa limite'}. Enregistre où tu en es pour continuer plus tard ou sur une autre IA.</div>
      <div class="acts"><button class="btn" id="cp-save">Enregistrer un point de reprise</button><button class="link" id="cp-later">Plus tard</button></div></div>`;
  }
  async function checkpointNow(){
    // Sur ce clic uniquement : lecture de la conversation ouverte, puis édition du point de reprise.
    try{await send('captureConversation',{});await send('openPage',{page:'transfer',query:{capture:'1',mode:'checkpoint'}});}
    catch(e){send('openPage',{page:'transfer',query:{mode:'checkpoint',from:site,why:'err',err:String(e?.message||'').slice(0,180)}}).catch(()=>{});}
  }
  function switchBlock(){
    const sw=A.smartSwitch(state,Date.now(),main);
    if(!sw.pressured.length)return '';
    const alts=sw.available.slice(0,3).map(s=>`<button class="alt" data-go="${s.platform}">${logo(s.platform)}<span>${esc(name(s.platform))}</span><small>${Math.round(s.worst)} % utilisés</small></button>`).join('');
    const unk=[...sw.unknown,...sw.partial].map(s=>name(s.platform)),unm=sw.unmeasured.map(s=>name(s.platform)).filter(n=>n!==name(site));
    return `<div class="switch"><b>Smart Switch</b><div class="tiny">${esc(name(main))} ${sw.pressured[0].limitReached?'a atteint sa limite':'approche de sa limite'}.</div>
      ${alts?`<div class="tiny" style="margin-top:6px">Capacité confirmée :</div>${alts}`:'<div class="tiny">Aucune autre plateforme avec une capacité confirmée.</div>'}
      ${unk.length?`<div class="tiny">État inconnu : ${esc(unk.join(', '))}.</div>`:''}${unm.length?`<div class="tiny">Non mesurées : ${esc(unm.join(', '))}.</div>`:''}
      <div class="acts"><button class="btn" id="handoff">Transférer le contexte</button></div></div>`;
  }
  function pill(){
    const st=A.platformStatus(state,main),lim=limitInfo(),job=currentJob();
    const hide=state.settings.focusMode&&st.level==='healthy';
    let label;
    if(lim)label='Quota atteint';
    else if(st.level==='unmeasured')label='Non mesuré';
    else if(st.level==='unknown')label=Object.keys(state.metrics).some(id=>A.METRICS[id].platform===main)?'Relevé ancien':'Quota indisponible';
    else if(hide)label=st.partial?'Quotas partiels':'Pas d’alerte';
    else label=`${sitePlatforms.length>1?name(main)+' · ':''}${Math.round(st.worst)} % utilisés`;
    return {level:lim?'critical':st.level,label:label+(job?` · ${hhmm(job.at)}`:'')};
  }
  function render(){
    const show=state.settings.widgetEnabled;host.style.display=show?'':'none';if(!show)return;
    if(limitPrompt()){const k=limitKey(limitInfo());if(autoOpenedFor!==k){autoOpenedFor=k;open=true;}}
    const pl=pill();
    const shown=[main,...sitePlatforms.filter(p=>p!==main)].filter(p=>PL.get(p).support!=='none'),multi=shown.length>1;
    const blocks=shown.map(pid=>`${multi?`<div class="sub">${esc(name(pid))}</div>`:''}${meters(pid)}`).join('');
    const t=toast&&!open?`<div class="toast ${esc(toast.type)}" role="status"><b>${esc(toast.title)}</b><div class="tiny">${esc(toast.body)}</div><div class="row">${toast.url?'<button class="btn" id="toast-resume">Reprendre</button>':''}<button class="link" id="toast-open">Voir</button><button class="link" id="toast-close">Fermer</button></div></div>`:'';
    wrapper.innerHTML=`${t}
      <div class="panel ${open?'':'hidden'}" role="region" aria-label="AI Flow"><div class="heading"><b>${logo(site)}AI Flow · ${esc(name(site))}</b><button id="close" class="x" aria-label="Fermer">✕</button></div>
      ${limitCard()}${checkpointSuggestion()}${switchBlock()}${blocks}${resumeSection()}
      <div class="actions"><button class="link" data-page="dashboard">Tableau de bord</button><button class="link" id="transfer">Transférer</button>${PL.conversationOf(location.href)&&['claude','chatgpt'].includes(site)?'<button class="link" id="checkpoint">Point de reprise</button>':''}<button class="link" data-page="options">Paramètres</button></div></div>
      <button class="pill" id="toggle" aria-expanded="${open}" aria-label="Afficher AI Flow"><span class="dot ${pl.level}"></span><span>AI Flow</span><span class="summary">${esc(pl.label)}</span><span class="chev">${open?'⌄':'⌃'}</span><span class="grip" title="Déplacer">⠿</span></button>`;
    bind();clampPosition();
  }
  function safeRender(){if(formOpen&&root.activeElement?.closest?.('.resume-form'))return;render();}
  async function handoff(to){
    // Sur ce clic uniquement : la sélection si tu en as fait une, sinon la conversation ouverte.
    const text=String(window.getSelection?.()?.toString()||'').slice(0,20000);
    const dest=to||(site==='claude'?'chatgpt':'claude');
    let why=text.trim()?'':/^\/code(\/|$)/.test(location.pathname)?'code':'notconv',err='';
    if(!text.trim()&&PL.conversationOf(location.href)){
      try{await send('captureConversation',{});await send('openPage',{page:'transfer',query:{capture:'1',to:dest}});return;}
      catch(e){why='err';err=String(e?.message||'').slice(0,180);}
    }
    try{await A.api.storage.local.set({[K.seed]:{text,source:site,ts:Date.now()}});}catch{}
    const query={from:site,to:dest};if(why)query.why=why;if(err)query.err=err;
    send('openPage',{page:'transfer',query}).catch(()=>{});
  }
  const $=id=>root.getElementById(id);
  function bind(){
    $('toggle').addEventListener('click',e=>{if(dragging){e.preventDefault();dragging=false;return;}open=!open;toast=null;render();});
    $('toggle').addEventListener('keydown',e=>{if(e.key==='Escape'){open=false;render();}});
    $('close')?.addEventListener('click',()=>{open=false;render();});
    $('transfer')?.addEventListener('click',()=>handoff());
    $('checkpoint')?.addEventListener('click',checkpointNow);
    $('cp-save')?.addEventListener('click',checkpointNow);
    $('cp-later')?.addEventListener('click',async e=>{
      const k=e.currentTarget.closest('[data-cp-key]').dataset.cpKey;dismissed[k]=Date.now();
      try{await A.api.storage.local.set({[K.dismiss]:dismissed});}catch{}render();
    });
    $('handoff')?.addEventListener('click',()=>handoff());
    $('toast-open')?.addEventListener('click',()=>{toast=null;open=true;render();});
    $('toast-close')?.addEventListener('click',()=>{toast=null;render();});
    $('toast-resume')?.addEventListener('click',()=>{const url=toast.url;toast=null;render();if(new URL(url).host===location.host)location.href=url;else send('openUrl',{url}).catch(()=>{});});
    for(const b of root.querySelectorAll('[data-page]'))b.addEventListener('click',()=>send('openPage',{page:b.dataset.page}).catch(()=>{}));
    for(const b of root.querySelectorAll('[data-go]'))b.addEventListener('click',()=>send('openPlatform',{platform:b.dataset.go}).catch(()=>{}));
    $('resume-open')?.addEventListener('click',()=>{formOpen=true;form=defaultForm();render();});
    $('resume-close')?.addEventListener('click',()=>{formOpen=false;render();});
    $('resume-time')?.addEventListener('input',e=>{form.time=e.target.value;});
    $('resume-text')?.addEventListener('input',e=>{form.text=e.target.value;});
    $('resume-awake')?.addEventListener('change',e=>{form.keepAwake=e.target.checked;});
    $('resume-arm')?.addEventListener('click',()=>{
      const at=form.presetAt&&form.time===hhmm(form.presetAt)?form.presetAt:nextAt(form.time);
      if(!Number.isFinite(at)){form.error='Choisis une heure de relance.';render();return;}
      if(!form.text.trim()){form.error='Le message est vide.';render();return;}
      arm(at);
    });
    $('awake-copy')?.addEventListener('click',async e=>{
      const cmd=e.currentTarget.dataset.cmd,info=$('awake-copied');
      try{await navigator.clipboard.writeText(cmd);info.textContent='Copiée. Ouvre Terminal (Applications › Utilitaires), colle (⌘V), appuie sur Entrée. Rien ne s’affiche : c’est normal, laisse la fenêtre ouverte jusqu’à la relance.';}
      catch{info.textContent='Copie refusée. Tape dans Terminal : '+cmd;}
    });
    $('resume-cancel')?.addEventListener('click',async e=>{try{await send('resumeCancel',{id:e.currentTarget.dataset.id});}catch{}await loadAux();render();});
    $('limit-arm')?.addEventListener('click',e=>{form.keepAwake=true;arm(Number(e.currentTarget.dataset.at));});
    $('limit-custom')?.addEventListener('click',()=>{formOpen=true;form=defaultForm();render();});
    $('limit-dismiss')?.addEventListener('click',async()=>{
      const lim=limitInfo();if(!lim)return;const now=Date.now();dismissed[limitKey(lim)]=now;
      for(const [k,t] of Object.entries(dismissed))if(now-t>8*86400000)delete dismissed[k];
      try{await A.api.storage.local.set({[K.dismiss]:dismissed});}catch{}
      render();
    });
    const grip=root.querySelector('.grip');
    grip.addEventListener('click',e=>e.stopPropagation());
    grip.addEventListener('pointerdown',e=>{e.stopPropagation();dragStart={x:e.clientX,y:e.clientY,right:parseInt(host.style.right||'20',10),bottom:parseInt(host.style.bottom||'20',10)};dragging=false;grip.setPointerCapture(e.pointerId);});
    grip.addEventListener('pointermove',e=>{if(!dragStart)return;const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;if(Math.abs(dx)+Math.abs(dy)<5)return;dragging=true;host.style.right=`${Math.max(6,Math.min(innerWidth-host.getBoundingClientRect().width-6,dragStart.right-dx))}px`;host.style.bottom=`${Math.max(6,Math.min(innerHeight-host.getBoundingClientRect().height-6,dragStart.bottom-dy))}px`;});
    grip.addEventListener('pointercancel',()=>{dragStart=null;dragging=false;});
    grip.addEventListener('pointerup',async()=>{if(!dragStart)return;dragStart=null;if(dragging){try{await send('position',{site,position:{right:parseInt(host.style.right,10),bottom:parseInt(host.style.bottom,10)}});}catch{}}setTimeout(()=>dragging=false,60);});
  }
  function clampPosition(){const b=host.getBoundingClientRect();host.style.right=`${Math.max(6,Math.min(innerWidth-b.width-6,parseInt(host.style.right||'20',10)))}px`;host.style.bottom=`${Math.max(6,Math.min(innerHeight-b.height-6,parseInt(host.style.bottom||'20',10)))}px`;}
  window.addEventListener('resize',clampPosition);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open){open=false;render();}});
  if(state.hudPositions?.[site]){host.style.right=`${state.hudPositions[site].right}px`;host.style.bottom=`${state.hudPositions[site].bottom}px`;}
  await loadAux();render();

  // Safari ne transmet pas toujours storage.onChanged aux scripts de contenu : relecture régulière.
  async function reload(){try{state=await A.getState();}catch{}await loadAux();if(host.isConnected)safeRender();}
  let t=null;
  A.api.storage.onChanged.addListener((c,area)=>{if(area==='local'){clearTimeout(t);t=setTimeout(reload,200);}});
  setInterval(reload,30000);
  const ask=()=>send('autoRefresh',{}).then(reload,()=>{});
  ask();
  let lastPath=location.pathname;
  setInterval(()=>{if(location.pathname!==lastPath){lastPath=location.pathname;formOpen=false;safeRender();}},2500);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){ask();reload();}});
  window.addEventListener('pageshow',()=>{ask();reload();});
})();
