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
  @media(max-width:600px){.panel{width:min(295px,calc(100vw - 24px))}.pill{padding:10px 12px;min-height:42px}}
  `;
  root.appendChild(style);
  const wrapper=document.createElement('div');root.appendChild(wrapper);
  document.documentElement.appendChild(host);
  function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function entry(id){
    const m=state.metrics[id],level=A.level(m,id,Date.now(),state.settings),valid=m&&!A.isStale(m,id);
    const name=A.METRICS[id].short;
    return `<div class="row"><span class="name">${escape(name)}</span><span class="pct">${valid?`${Math.round(m.percent)} %`:'Indisponible'}</span></div><div class="track"><div class="progress ${level==='warning'?'warning':level==='critical'?'critical':''}" style="width:${valid?m.percent:0}%"></div></div>${valid?`<div class="tiny" style="margin-top:-8px;margin-bottom:10px">${m.source==='manual'?'Saisie manuelle':`Observé · ${Math.max(0,Math.floor((Date.now()-m.observedAt)/60000))} min`}</div>`:''}${valid&&m.resetAt?`<div class="tiny" style="margin-top:-8px;margin-bottom:12px">Reset : ${escape((m.resetApproximate?'≈ ':'')+A.formatReset(m.resetAt))}</div>`:''}`;
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
    let label=level==='unknown'?(ids.some(id=>state.metrics[id])?'Relevés périmés':'Quota indisponible'):hidePct?(levels.includes('unknown')?'Quotas partiels':'Pas d’alerte'):firstValid?`${Math.round(data.percent)} % utilisés`:'En suivi';
    const forecast=A.platformForecast(state,provider==='claude'?'claude':'codex',state.settings.sessionMinutes);
    wrapper.innerHTML=`
      <div class="panel ${open?'':'hidden'}" role="region" aria-label="AI Flow · suivi des quotas"><div class="heading"><b>AI Flow <span style="font-weight:400;color:#a6b5aa">· ${provider==='claude'?'Claude':'ChatGPT'}</span></b><button id="close" class="x" aria-label="Fermer">✕</button></div>
      ${ids.map(entry).join('')}
      ${['warning','caution'].includes(forecast?.kind)?`<div class="small-note">⚠ ${escape(forecast.text)}</div>`:''}
      ${provider==='chatgpt'?'<div class="tiny">Codex / Work : usage partagé. Thinking / mode Pro : quota indisponible ici.</div>':''}<div class="tiny">${ids.some(id=>state.metrics[id]?.source==='observed'&&!A.isStale(state.metrics[id],id))?'Valeurs observées sur la page officielle · connecteur expérimental':'Aucune donnée automatique récente · saisie manuelle possible'}</div>
      ${['warning','critical'].includes(level)?`<div class="small-note">Préparer la suite : <button id="switch" class="link">Ouvrir ${provider==='claude'?'ChatGPT':'Claude'} ↗</button><div class="tiny">Capacité de l’autre plateforme à vérifier.</div></div>`:''}<div class="actions"><button id="transfer" class="link">Transférer ↗</button><button id="settings" class="link">${provider==='claude'?'Page utilisation ↗':'Ouvrir ChatGPT ↗'}</button><button id="options" class="link">Paramètres ↗</button></div><div class="actions"><button id="dashboard" class="link">Tableau de bord ↗</button></div>
      </div>
      <button class="pill" id="toggle" aria-expanded="${open}" aria-label="Afficher le suivi AI Flow"><span class="dot ${level}"></span><span>AI Flow</span><span class="summary">${escape(label)}</span><span class="chev">${open?'⌄':'⌃'}</span><span class="grip" title="Déplacer le widget">⠿</span></button>`;
    root.getElementById('toggle')?.addEventListener('click',e=>{if(dragging){e.preventDefault();dragging=false;return;}open=!open;render();});
    root.getElementById('transfer')?.addEventListener('click',()=>{
      if(root.querySelector('.af-transfer'))return;
      // Read only the user's selection, once, after an explicit transfer click.
      const selected=window.getSelection()?.toString()||'';
      const overlay=document.createElement('div');overlay.style.cssText='position:fixed;right:12px;bottom:12px;width:min(440px,calc(100vw - 24px));z-index:1';root.appendChild(overlay);
      window.AIFlowTransfer.mount(overlay,selected,provider==='claude'?'chatgpt':'claude',()=>overlay.remove());
    });
    root.getElementById('close')?.addEventListener('click',()=>{open=false;render();});
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
  render();
  A.api.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[A.KEY]){state=A.clean(changes[A.KEY].newValue);render();}});
  setInterval(()=>{if(host.isConnected)render();},60000);

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
    navigation();if(Date.now()-lastScan>30000)scan();
  }
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('pageshow',resume);
  navigation();setInterval(navigation,2500);
  setInterval(()=>{if(parser.providerFor(location.href))scan();},60000);
})();
