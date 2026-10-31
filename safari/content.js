/* Isolated page widget. Does not read chat messages or network responses. */
(async function(){
  'use strict';
  if(window.top!==window||document.querySelector('[data-ai-flow-widget]'))return;
  const A=window.AIFlow;
  const provider=/claude\.ai$/i.test(location.hostname)?'claude':'chatgpt';
  let state;
  try{state=await A.getState();}catch{return;}
  let open=false,dragging=false,dragStart=null;
  const host=document.createElement('div');
  host.setAttribute('data-ai-flow-widget','');
  const root=host.attachShadow({mode:'closed'});
  const style=document.createElement('style');
  style.textContent=`
  :host{all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483646;color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;line-height:1.4;pointer-events:auto}
  *{box-sizing:border-box}button{font:inherit;cursor:pointer}.pill{display:flex;align-items:center;gap:8px;color:#eff7f1;background:#19251f;border:1px solid #4b6555;box-shadow:0 12px 35px rgba(0,0,0,.24);border-radius:100px;padding:9px 12px;min-height:37px;font-size:12px;font-weight:650;user-select:none;white-space:nowrap}
  .summary{color:#becdc1;font-weight:500}.pill:hover{background:#26352c}.dot{width:7px;height:7px;border-radius:50%;background:#9ad6b1;display:inline-block;flex-shrink:0}.dot.warning{background:#edbd82}.dot.critical{background:#e39589}.dot.unknown{background:#a4b3a9}.chev{opacity:.65;margin-left:3px}.panel{background:#17201b;border:1px solid #3b5144;color:#edf4ed;border-radius:15px;width:295px;margin-bottom:9px;padding:16px;box-shadow:0 16px 42px rgba(0,0,0,.27);font-size:12px}
  .heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.heading b{font-size:14px;letter-spacing:-.2px}.heading small{color:#a7b5aa}.x{color:#a4b6a8;background:none;border:0;padding:4px 5px}.row{display:flex;justify-content:space-between;gap:10px;margin-bottom:5px;align-items:center}.name{color:#abbdb1}.pct{font-weight:750}.track{height:5px;border-radius:8px;background:#344238;overflow:hidden;margin-bottom:12px}.progress{background:#a2dfb3;height:100%;border-radius:8px}.progress.warning{background:#e4b27d}.progress.critical{background:#e39589}.tiny{color:#a6b5aa;font-size:10px;line-height:1.6}.small-note{background:#25332a;color:#d1e3d2;padding:9px 10px;border-radius:8px;margin-top:8px;font-size:11px}.actions{display:flex;justify-content:space-between;border-top:1px solid #394b3e;margin-top:12px;padding-top:11px;gap:8px}.link{background:none;border:none;color:#bce6c7;font-size:11px;padding:0}.grip{touch-action:none;cursor:grab;opacity:.55;letter-spacing:-1px}.dragging .grip{cursor:grabbing} .hidden{display:none!important}
  .panel{max-height:calc(100dvh - 90px);overflow:auto}button:focus-visible{outline:2px solid #9ad6b1;outline-offset:3px}.pill{max-width:calc(100vw - 12px);font-size:11px}
  @media(prefers-color-scheme:light){:host{color-scheme:light}.pill,.panel{background:#f8faf7;color:#20352a;border-color:#c5d5c9;box-shadow:0 10px 32px #253e2720}.pill:hover{background:#edf3ed}.name,.tiny,.heading small,.summary{color:#52685a}.link{color:#276645}.track{background:#dce7df}.small-note{background:#e6efe5;color:#25432d}}
  .title{display:flex;align-items:center;gap:6px}.logo{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:#2b2320}.logo.chatgpt{background:#222a26;color:#f3f4ef}.logo svg{width:13px;height:13px}.late{color:#e4b27d}
  .limit-card{background:#33251f;border:1px solid #8a5a3f;border-radius:10px;padding:11px;margin-bottom:14px}.limit-card b{display:block;margin-bottom:4px;color:#f3c9ae}.limit-card .resume-actions{flex-wrap:wrap;gap:10px}.limit-card .resume-actions button{white-space:nowrap}
  .resume{border-top:1px solid #394b3e;margin-top:12px;padding-top:10px}.resume label{display:block;margin-top:7px}.resume input[type=time],.resume textarea{display:block;width:100%;margin-top:3px;background:#0f1612;color:inherit;border:1px solid #3b5144;border-radius:7px;padding:6px 8px;font:inherit;font-size:12px;resize:vertical}.resume .check{display:flex;gap:6px;align-items:center}.resume .check input{width:auto;margin:0}.warn{color:#e4c48f;margin-top:8px}.err{color:#e39589}.btn{background:#a2dfb3;color:#123020;border:0;border-radius:7px;padding:6px 12px;font-weight:700;font-size:11px}.resume-actions{display:flex;gap:12px;align-items:center;margin-top:8px}
  @media(prefers-color-scheme:light){.limit-card{background:#fbeee6;border-color:#e2b79c}.limit-card b{color:#8a4a24}.logo{background:#f6e6dd}.logo.chatgpt{background:#eef1ec;color:#111}.late{color:#8a5a12}}
  @media(prefers-color-scheme:light){.resume input[type=time],.resume textarea{background:#fff;border-color:#c5d5c9}.warn{color:#8a5a12}}
  @media(max-width:600px){.panel{width:min(295px,calc(100vw - 24px))}.pill{padding:10px 12px;min-height:42px}}
  `;
  root.appendChild(style);
  const wrapper=document.createElement('div');root.appendChild(wrapper);
  document.documentElement.appendChild(host);
  function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  // ---------- Relance programmée (affichage + armement explicite) ----------
  const RESUME_KEY='ai_flow_resume_v1',RESUME_LAST_KEY='ai_flow_resume_last_v1';
  const DEFAULT_RESUME_TEXT='Continue exactement là où tu t’es arrêté.';
  let resumeData={jobs:{},last:null},formOpen=false,form={time:'',text:DEFAULT_RESUME_TEXT,keepAwake:true,error:''};
  async function loadResume(){try{const v=await A.api.storage.local.get([RESUME_KEY,RESUME_LAST_KEY]);resumeData={jobs:v[RESUME_KEY]||{},last:v[RESUME_LAST_KEY]||null};}catch{}}
  function convUrl(){
    const p=location.pathname.replace(/\/$/,''),re=provider==='claude'?/^\/chat\/[\w-]+$/:/^\/(?:g\/[\w-]+\/)?c\/[\w-]+$/;
    return re.test(p)?location.origin+p:null;
  }
  function fmtTime(ts){try{return new Date(ts).toLocaleString('fr-FR',{weekday:'short',hour:'2-digit',minute:'2-digit'});}catch{return '';}}
  function hhmm(ts){const d=new Date(ts);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
  function nextAt(v){const m=/^(\d{2}):(\d{2})$/.exec(v||'');if(!m)return NaN;const d=new Date();d.setHours(+m[1],+m[2],0,0);if(d.getTime()<=Date.now()+30000)d.setDate(d.getDate()+1);return d.getTime();}
  function defaultForm(){
    const reset=provider==='claude'?state.metrics['claude.session']?.resetAt:null;
    const lim=limitInfo(),base=lim?.resetAt||(reset&&reset>Date.now()?reset:null),presetAt=base?base+2*60000:null;
    return {time:presetAt?hhmm(presetAt):'',presetAt,text:form.text||DEFAULT_RESUME_TEXT,keepAwake:form.keepAwake!==false,error:''};
  }
  function currentJob(){const c=convUrl();return c?Object.values(resumeData.jobs).find(j=>j.url===c)||null:null;}
  function resumeSection(){
    const conv=convUrl();
    if(!state.settings.resumePrompt&&!currentJob())return '';
    if(!formOpen&&limitPrompt())return ''; // the limit card already offers it
    if(!conv)return `<div class="resume"><div class="tiny">Relance auto : ouvre une conversation pour la programmer.</div></div>`;
    const job=currentJob();
    if(job)return `<div class="resume"><div class="row"><span>⏱ Relance prévue <b>${escape(fmtTime(job.at))}</b></span><button id="resume-cancel" class="link" data-id="${escape(job.id)}">Annuler</button></div><div class="tiny">« ${escape(job.message.slice(0,80))}${job.message.length>80?'…':''} »${job.keepAwake?` · Mac éveillé : ${job.awakeOk===false?'indisponible (app AI Flow non lancée)':'oui'}`:''}${job.attempts?` · nouvel essai (${escape(job.status)})`:''}</div></div>`;
    const last=resumeData.last&&resumeData.last.url===conv?`<div class="tiny">Dernière relance : ${escape(resumeData.last.status)} · ${escape(fmtTime(resumeData.last.at))}</div>`:'';
    if(!formOpen)return `<div class="resume">${last}<button id="resume-open" class="link">⏱ Relancer automatiquement à la réouverture…</button></div>`;
    return `<div class="resume resume-form"><div class="tiny">Envoie ce message une seule fois dans cette conversation, à l’heure choisie${provider==='claude'?' (si la session Claude est bien rouverte)':''}.</div>
      <label class="tiny">Heure${provider==='chatgpt'?' (indiquée par ChatGPT dans le message de limite)':''}<input id="resume-time" type="time" value="${escape(form.time)}"></label>
      <label class="tiny">Message<textarea id="resume-text" rows="3" maxlength="2000">${escape(form.text)}</textarea></label>
      <label class="tiny check"><input id="resume-awake" type="checkbox" ${form.keepAwake?'checked':''}> Garder le Mac éveillé jusque-là</label>
      <div class="tiny warn">Envoi automatique depuis ton compte : Anthropic et OpenAI encadrent l’usage de scripts sur leurs sites. Laisse Safari ouvert.</div>
      <div class="resume-actions"><button id="resume-arm" class="btn">Programmer</button><button id="resume-close" class="link">Fermer</button></div>
      ${form.error?`<div class="tiny err">${escape(form.error)}</div>`:''}</div>`;
  }
  function bindResume(){
    root.getElementById('resume-open')?.addEventListener('click',()=>{formOpen=true;form=defaultForm();render();});
    root.getElementById('resume-close')?.addEventListener('click',()=>{formOpen=false;render();});
    root.getElementById('resume-time')?.addEventListener('input',e=>{form.time=e.target.value;});
    root.getElementById('resume-text')?.addEventListener('input',e=>{form.text=e.target.value;});
    root.getElementById('resume-awake')?.addEventListener('change',e=>{form.keepAwake=e.target.checked;});
    root.getElementById('resume-arm')?.addEventListener('click',async()=>{
      const at=form.presetAt&&form.time===hhmm(form.presetAt)?form.presetAt:nextAt(form.time);
      if(!Number.isFinite(at)){form.error='Choisis une heure de relance.';render();return;}
      if(!form.text.trim()){form.error='Le message est vide.';render();return;}
      try{await A.request('resumeArm',{at,message:form.text,keepAwake:form.keepAwake});formOpen=false;form.error='';}
      catch(e){form.error=e?.message||'Programmation impossible.';}
      await loadResume();render();
    });
    root.getElementById('resume-cancel')?.addEventListener('click',async e=>{
      try{await A.request('resumeCancel',{id:e.currentTarget.dataset.id});}catch{}
      await loadResume();render();
    });
  }
  // ---------- Quota atteint : proposition de relance (fonction activée par l'utilisateur) ----------
  const DISMISS_KEY='ai_flow_resume_dismissed_v1';
  let dismissed={},autoOpenedFor=null;
  async function loadDismissed(){try{dismissed=(await A.api.storage.local.get(DISMISS_KEY))[DISMISS_KEY]||{};}catch{}}
  // Claude only: its session/weekly counters are the limits that stop a conversation.
  // (ChatGPT's chat limits are not exposed; Codex counters do not block chats.)
  function limitInfo(){
    if(provider!=='claude')return null;
    const full=['claude.session','claude.weekly'].map(id=>state.metrics[id]).filter((m,i)=>m&&!A.isStale(m,['claude.session','claude.weekly'][i])&&m.percent>=99.5);
    if(!full.length)return null;
    const resets=full.map(m=>m.resetAt).filter(Boolean);
    return {resetAt:resets.length===full.length?Math.max(...resets):null};
  }
  function limitKey(lim){return convUrl()+'|'+(lim.resetAt||'unknown');}
  function limitPrompt(){
    const lim=limitInfo();
    if(!state.settings.resumePrompt||!lim||!convUrl()||currentJob()||dismissed[limitKey(lim)])return null;
    return lim;
  }
  function maybeAutoOpen(){
    const lim=limitPrompt();if(!lim)return;
    const key=limitKey(lim);
    if(autoOpenedFor!==key){autoOpenedFor=key;open=true;}
  }
  function limitCard(){
    const lim=limitPrompt();if(!lim)return '';
    const at=lim.resetAt?lim.resetAt+2*60000:null;
    return `<div class="limit-card" role="alert"><b>Quota Claude atteint</b>
      <div class="tiny">${lim.resetAt?`La session rouvre ${escape(fmtTime(lim.resetAt))}.`:'Heure de réouverture inconnue.'} Relancer automatiquement cette conversation à ce moment-là ?</div>
      <div class="resume-actions">${at?`<button id="limit-arm" class="btn" data-at="${at}">Programmer à ${escape(hhmm(at))}</button>`:''}<button id="limit-custom" class="link">${at?'Personnaliser':'Choisir l’heure'}</button><button id="limit-dismiss" class="link">Non merci</button></div>
      ${form.error&&!formOpen?`<div class="tiny err">${escape(form.error)}</div>`:''}</div>`;
  }
  function bindLimitCard(){
    root.getElementById('limit-arm')?.addEventListener('click',async e=>{
      const at=Number(e.currentTarget.dataset.at);
      try{await A.request('resumeArm',{at,message:form.text||DEFAULT_RESUME_TEXT,keepAwake:form.keepAwake!==false});form.error='';}
      catch(err){form.error=err?.message||'Programmation impossible.';}
      await loadResume();render();
    });
    root.getElementById('limit-custom')?.addEventListener('click',()=>{formOpen=true;form=defaultForm();render();});
    root.getElementById('limit-dismiss')?.addEventListener('click',async()=>{
      const lim=limitInfo();if(!lim)return;
      const now=Date.now();dismissed[limitKey(lim)]=now;
      // Keep the list short: forget entries older than 8 days.
      for(const [k,t] of Object.entries(dismissed))if(now-t>8*86400000)delete dismissed[k];
      try{await A.api.storage.local.set({[DISMISS_KEY]:dismissed});}catch{}
      render();
    });
  }
  // Automatic re-renders must not wipe what the user is typing in the form.
  function safeRender(){if(formOpen&&root.activeElement?.closest?.('.resume-form'))return;render();}
  function entry(id){
    const m=state.metrics[id],level=A.level(m,id,Date.now(),state.settings),valid=m&&!A.isStale(m,id);
    const name=A.METRICS[id].short;
    return `<div class="row"><span class="name">${escape(name)}</span><span class="pct">${valid?`${Math.round(m.percent)} %`:'Indisponible'}</span></div><div class="track"><div class="progress ${level==='warning'?'warning':level==='critical'?'critical':''}" style="width:${valid?m.percent:0}%"></div></div>${valid&&Date.now()-m.observedAt>5*60000?`<div class="tiny late" style="margin-top:-8px;margin-bottom:10px">Mis à jour il y a ${Math.floor((Date.now()-m.observedAt)/60000)} min</div>`:''}${valid&&m.resetAt?`<div class="tiny" style="margin-top:-8px;margin-bottom:12px">Reset : ${escape((m.resetApproximate?'≈ ':'')+A.formatReset(m.resetAt))}</div>`:''}`;
  }
  function render(){
    const show=state.settings.widgetEnabled;
    host.style.display=show?'':'none';
    if(!show)return;
    const ids=A.providerIds(state,provider);
    const levels=ids.map(id=>A.level(state.metrics[id],id,Date.now(),state.settings));
    const level=levels.includes('critical')?'critical':levels.includes('warning')?'warning':levels.includes('healthy')?'healthy':'unknown';
    const firstValid=ids.filter(id=>!A.isStale(state.metrics[id],id)).sort((a,b)=>state.metrics[b].percent-state.metrics[a].percent)[0];
    const data=firstValid?state.metrics[firstValid]:null;
    const hidePct=state.settings.focusMode&&level==='healthy';
    const armedJob=currentJob();
    maybeAutoOpen();
    let label=limitInfo()?'Quota atteint':level==='unknown'?(ids.some(id=>state.metrics[id])?'Relevés périmés':'Quota indisponible'):hidePct?(levels.includes('unknown')?'Quotas partiels':'Pas d’alerte'):firstValid?`${Math.round(data.percent)} % utilisés`:'En suivi';
    const forecast=A.platformForecast(state,provider==='claude'?'claude':'codex',state.settings.sessionMinutes);
    wrapper.innerHTML=`
      <div class="panel ${open?'':'hidden'}" role="region" aria-label="AI Flow · suivi des quotas"><div class="heading"><b class="title"><span class="logo ${provider}">${A.LOGOS[provider]||''}</span>AI Flow <span style="font-weight:400;color:#a6b5aa">· ${provider==='claude'?'Claude':'ChatGPT'}</span></b><button id="close" class="x" aria-label="Fermer">✕</button></div>
      ${limitCard()}${ids.map(entry).join('')}
      ${!limitInfo()&&['warning','caution'].includes(forecast?.kind)?`<div class="small-note">⚠ ${escape(forecast.text)}</div>`:''}
      ${provider==='chatgpt'?'<div class="tiny">Codex / Work : usage partagé. Thinking / mode Pro : non suivis.</div>':''}${ids.some(id=>!A.isStale(state.metrics[id],id))?'':'<div class="tiny">Lecture des quotas en cours… Vérifie que tu es connecté.</div>'}
      ${['warning','critical'].includes(level)?`<div class="small-note">Préparer la suite : <button id="switch" class="link">Ouvrir ${provider==='claude'?'ChatGPT':'Claude'} ↗</button><div class="tiny">Capacité de l’autre plateforme à vérifier.</div></div>`:''}${resumeSection()}<div class="actions"><button id="transfer" class="link">Transférer ↗</button><button id="settings" class="link">${provider==='claude'?'Page utilisation ↗':'Ouvrir ChatGPT ↗'}</button><button id="options" class="link">Paramètres ↗</button></div><div class="actions"><button id="dashboard" class="link">Tableau de bord ↗</button></div>
      </div>
      <button class="pill" id="toggle" aria-expanded="${open}" aria-label="Afficher le suivi AI Flow"><span class="dot ${level}"></span><span>AI Flow</span><span class="summary">${escape(label)}${armedJob?` · ⏱ ${escape(hhmm(armedJob.at))}`:''}</span><span class="chev">${open?'⌄':'⌃'}</span><span class="grip" title="Déplacer le widget">⠿</span></button>`;
    root.getElementById('toggle')?.addEventListener('click',e=>{if(dragging){e.preventDefault();dragging=false;return;}open=!open;render();});
    root.getElementById('transfer')?.addEventListener('click',()=>{
      if(root.querySelector('.af-transfer'))return;
      // Read only the user's selection, once, after an explicit transfer click.
      const selected=window.getSelection()?.toString()||'';
      const overlay=document.createElement('div');overlay.style.cssText='position:fixed;right:12px;bottom:12px;width:min(440px,calc(100vw - 24px));z-index:1';root.appendChild(overlay);
      window.AIFlowTransfer.mount(overlay,selected,provider==='claude'?'chatgpt':'claude',()=>overlay.remove());
    });
    root.getElementById('close')?.addEventListener('click',()=>{open=false;render();});
    bindResume();bindLimitCard();
    root.getElementById('settings')?.addEventListener('click',()=>window.open(provider==='claude'?'https://claude.ai/settings/usage':'https://chatgpt.com/','_blank','noopener,noreferrer'));
    root.getElementById('options')?.addEventListener('click',()=>{try{A.request('openOptions').catch(()=>{});}catch{}});
    root.getElementById('dashboard')?.addEventListener('click',()=>{try{A.request('openDashboard').catch(()=>{});}catch{}});
    root.getElementById('switch')?.addEventListener('click',()=>window.open(provider==='claude'?'https://chatgpt.com/':'https://claude.ai/','_blank','noopener,noreferrer'));
    root.getElementById('toggle')?.addEventListener('keydown',e=>{if(e.key==='Escape'){open=false;render();}});
    clampPosition();
    const grip=root.querySelector('.grip');
    grip?.addEventListener('click',e=>e.stopPropagation());
    grip?.addEventListener('pointerdown',e=>{e.stopPropagation();dragStart={x:e.clientX,y:e.clientY,right:parseInt(host.style.right||'20',10),bottom:parseInt(host.style.bottom||'20',10)};dragging=false;grip.setPointerCapture(e.pointerId);});
    grip?.addEventListener('pointermove',e=>{if(!dragStart)return;const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;if(Math.abs(dx)+Math.abs(dy)<5)return;dragging=true;host.style.right=`${Math.max(6,Math.min(innerWidth-host.getBoundingClientRect().width-6,dragStart.right-dx))}px`;host.style.bottom=`${Math.max(6,Math.min(innerHeight-host.getBoundingClientRect().height-6,dragStart.bottom-dy))}px`;});
    grip?.addEventListener('pointercancel',()=>{dragStart=null;dragging=false;});
    grip?.addEventListener('pointerup',async e=>{if(!dragStart)return;dragStart=null;if(dragging){try{await A.savePosition(provider,{right:parseInt(host.style.right,10),bottom:parseInt(host.style.bottom,10)});}catch{}}setTimeout(()=>dragging=false,60);});
  }
  function clampPosition(){const box=host.getBoundingClientRect();host.style.right=`${Math.max(6,Math.min(innerWidth-box.width-6,parseInt(host.style.right||'20',10)))}px`;host.style.bottom=`${Math.max(6,Math.min(innerHeight-box.height-6,parseInt(host.style.bottom||'20',10)))}px`;}
  window.addEventListener('resize',clampPosition);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open){open=false;render();}});
  if(state.hudPositions?.[provider]){host.style.right=`${state.hudPositions[provider].right}px`;host.style.bottom=`${state.hudPositions[provider].bottom}px`;}
  await loadResume();await loadDismissed();
  render();
  A.api.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local')return;
    if(changes[A.KEY])state=A.clean(changes[A.KEY].newValue);
    if(changes[RESUME_KEY])resumeData.jobs=changes[RESUME_KEY].newValue||{};
    if(changes[RESUME_LAST_KEY])resumeData.last=changes[RESUME_LAST_KEY].newValue||null;
    if(changes[DISMISS_KEY])dismissed=changes[DISMISS_KEY].newValue||{};
    if(changes[A.KEY]||changes[RESUME_KEY]||changes[RESUME_LAST_KEY])safeRender();
  });
  // Safari does not always deliver storage.onChanged to content scripts: re-read
  // storage regularly instead of re-rendering a possibly outdated copy.
  async function reload(){try{state=await A.getState();}catch{}await loadResume();if(host.isConnected)safeRender();}
  setInterval(reload,30000);
  const ownProvider=provider==='claude'?'claude':'codex';
  function askRefresh(){try{A.request('autoRefresh',{provider:ownProvider}).then(reload,()=>{});}catch{}}
  askRefresh();

  // Read only eligible settings pages. No MutationObserver on conversations.
  const parser=window.AIFlowUsage;
  let lastPath='',observer=null,timer=null,checking=false,lastScan=0,signatures=new Map(),confirmed=new Map();
  async function scan(){
    const eligible=parser.providerFor(location.href);
    if(!eligible||checking)return;
    checking=true;lastScan=Date.now();
    try{
      const result=parser.scan(document,location.href);
      // An unchanged DOM is not evidence of a fresh server reading. Reloading
      // the official page starts a new document and permits a fresh sample.
      const changed=result.readings.filter(r=>signatures.get(r.id)!==JSON.stringify([r.percent,r.resetApproximate?null:r.resetAt]));
      if(changed.length){
        await A.saveMetrics(changed);
        for(const r of changed){signatures.set(r.id,JSON.stringify([r.percent,r.resetApproximate?null:r.resetAt]));confirmed.set(r.id,Date.now());}
      }
      const status=result.readings.some(r=>Date.now()-(confirmed.get(r.id)||0)>15*60000)?'stale':result.status;
      await A.request('connector',{provider:eligible,status});
    }catch{try{await A.request('connector',{provider:eligible,status:'error'});}catch{}}
    finally{checking=false;}
  }
  function schedule(){if(timer||Date.now()-lastScan<30000)return;timer=setTimeout(()=>{timer=null;scan();},1200);}
  function navigation(){
    if(lastPath===location.pathname)return;
    lastPath=location.pathname;lastScan=0;
    formOpen=false;safeRender(); // SPA navigation: the widget follows the open conversation.
    observer?.disconnect();observer=null;clearTimeout(timer);timer=null;
    if(parser.providerFor(location.href)){
      observer=new MutationObserver(schedule);
      observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['datetime','aria-valuenow']});
      schedule();
    }
  }
  A.api.runtime.onMessage.addListener((message,sender,reply)=>{if(message?.type!=='AI_FLOW_SCAN')return false;scan().then(()=>reply({ok:true}));return true;});
  async function resume(){
    if(document.hidden)return;
    try{state=await A.getState();render();}catch{}
    askRefresh();
    navigation();if(Date.now()-lastScan>30000)scan();
  }
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('pageshow',resume);
  navigation();setInterval(navigation,2500);
  setInterval(()=>{if(parser.providerFor(location.href))scan();},60000);
})();
