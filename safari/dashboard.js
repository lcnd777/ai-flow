(async function(){
  'use strict';
  const A=window.AIFlow,U=window.AIFlowUI,$=id=>document.getElementById(id),esc=A.escapeHTML;
  let state,conn={},extras=await U.loadExtras(),awake=null,range=24,series=[],sel=-1,bars=[],geom=null,flowData={flows:[],quarantined:0};
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
  /* ---------- Ma consommation : barres + infobulle (survol, toucher, clavier) ---------- */
  const fmtBucket=(t,b)=>range===24?new Date(t).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})+' · '+A.clock(t)+' – '+A.clock(t+b)
    :new Date(t).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  function chart(){
    const h=extras.history,now=Date.now(),bucket=range===24?3600000:86400000;
    const end=range===24?Math.ceil(now/3600000)*3600000:new Date(new Date(now).setHours(24,0,0,0)).getTime(),from=end-range*3600000;
    series=A.platformConsumption(h,from,end,bucket);
    bars=series[0]?.bars||[];
    for(const s of series){
      const limits=(h.limits||[]).filter(l=>l.id===s.metric&&(l.to??now)>=from);
      for(const b of s.bars)b.limit=limits.some(l=>l.from<b.t+bucket&&(l.to??now)>=b.t);
    }
    $('platform-legend').innerHTML=series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.name)}${s.metric?'':' · aucune mesure'}</span>`).join('');
    $('history-summary').innerHTML=series.map(s=>{
      const measured=s.bars.filter(b=>b.measured).length,total=Math.round(s.bars.reduce((n,b)=>n+b.used,0)*10)/10;
      return `<span class="consumption-total"><b>${esc(s.name)}</b> ${measured?`${total} % <span class="fine">du quota ${s.metric.endsWith('.session')?'5 h':'hebdomadaire'} · ${measured}/${s.bars.length} ${range===24?'h':'jours'} avec relevés</span>`:'— aucune mesure'}</span>`;
    }).join('');
    if(!series.some(s=>s.metric)){
      $('chart').innerHTML='<p class="note">Ta consommation apparaîtra ici après quelques relevés : garde un onglet Claude ou ChatGPT ouvert pendant que tu travailles.</p>';geom=null;tip(-1);return;
    }
    const unit=range===24?'heure':'jour';
    const W=680,H=220,L=44,R=10,T=14,B=28,max=Math.max(5,...series.flatMap(s=>s.bars.map(b=>b.used)));
    const top=max<=5?5:max<=10?10:max<=25?25:max<=50?50:max<=100?100:Math.ceil(max/50)*50;
    const slot=(W-L-R)/bars.length,y=v=>H-B-(v/top)*(H-B-T);
    geom={W,L,R,slot};
    const grid=[0,top/2,top].map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${Math.round(v)} %</text>`).join('');
    const cols=bars.map((_,i)=>series.map((s,j)=>{
      const b=s.bars[i],group=slot*.8,sub=group/series.length,x=L+i*slot+slot*.1+j*sub,w=Math.max(1,sub*.8);
      if(!b.measured)return `<rect class="nodata" x="${x}" y="${y(0)-3}" width="${w}" height="3"><title>${esc(s.name)} : aucune mesure</title></rect>`;
      const hd=y(0)-y(b.direct),ha=y(0)-y(b.attributed);
      return `<g class="platform-bars" style="--platform-color:${s.color}"><title>${esc(s.name)} : ${b.used} %</title><rect class="use" x="${x}" y="${y(b.direct)}" width="${w}" height="${hd}" rx="1"/>${ha>0?`<rect class="attr" x="${x}" y="${y(b.used)}" width="${w}" height="${ha}" rx="1"/>`:''}${b.used===0?`<rect class="zero" x="${x}" y="${y(0)-2}" width="${w}" height="2"/>`:''}${b.limit?`<circle cx="${x+w/2}" cy="${y(b.used)-4}" r="2" class="limit-marker"/>`:''}</g>`;
    }).join('')).join('');
    const every=range===24?3:1;
    const labels=bars.map((b,i)=>i%every===0?`<text x="${L+i*slot+slot/2}" y="${H-8}" text-anchor="middle">${range===24?new Date(b.t).getHours()+' h':new Date(b.t).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric'})}</text>`:'').join('');
    const hl=sel>=0&&sel<bars.length?`<rect class="hl" x="${L+sel*slot}" y="${T-6}" width="${slot}" height="${H-B-T+6}"/>`:'';
    $('chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Consommation par plateforme et par ${unit}, en pourcentage du quota de chaque plateforme">${hl}${grid}${cols}${labels}</svg>`;
    tip(sel);
  }
  function tip(i){
    const el=$('tip');
    if(i<0||i>=bars.length||!geom){el.hidden=true;return;}
    const bucket=range===24?3600000:86400000;
    const lines=[`<b>${esc(fmtBucket(bars[i].t,bucket))}</b>`];
    for(const s of series){
      const b=s.bars[i];
      lines.push(`<span class="tip-platform"><i style="background:${s.color}"></i><b>${esc(s.name)}</b></span>`);
      if(!b.measured){lines.push('Aucune mesure disponible sur cette tranche.');continue;}
      lines.push(`Consommé : <b>${b.used} %</b> <span class="muted">(${esc(A.METRICS[s.metric].short)})</span>`);
      if(b.attributed)lines.push(`<span class="muted">Dont ${b.attributed} % constatés après une absence de mesure.</span>`);
      lines.push(`<span class="muted">${b.measured} relevé${b.measured>1?'s':''}${b.resets?' · reset constaté':''}${b.limit?' · limite atteinte':''}${b.lastAt?' · dernier à '+A.clock(b.lastAt):''}</span>`);
    }
    el.innerHTML=lines.join('<br>');el.hidden=false;
    const box=$('chart').getBoundingClientRect(),scale=box.width/geom.W;
    const cx=(geom.L+(i+.5)*geom.slot)*scale,w=el.offsetWidth;
    el.style.left=Math.max(0,Math.min(box.width-w,cx-w/2))+'px';
  }
  function pick(ev){
    if(!geom||!bars.length)return;
    const box=$('chart').getBoundingClientRect(),x=(ev.clientX-box.left)/box.width*geom.W;
    // Toute position dans le graphique (marges comprises) désigne la barre la plus proche.
    const i=Math.max(0,Math.min(bars.length-1,Math.floor((x-geom.L)/geom.slot)));
    if(i!==sel){sel=i;chart();}
  }
  const chartEl=$('chart');
  chartEl.addEventListener('pointermove',pick);
  chartEl.addEventListener('pointerdown',pick);
  chartEl.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){sel=-1;chart();}});
  chartEl.addEventListener('keydown',e=>{
    if(!bars.length)return;
    if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();sel=sel<0?bars.length-1:Math.max(0,Math.min(bars.length-1,sel+(e.key==='ArrowRight'?1:-1)));chart();}
    if(e.key==='Escape'){sel=-1;chart();}
  });
  chartEl.addEventListener('blur',()=>{sel=-1;chart();});
  for(const b of document.querySelectorAll('[data-range]'))b.addEventListener('click',()=>{range=Number(b.dataset.range);sel=-1;for(const o of document.querySelectorAll('[data-range]'))o.classList.toggle('on',o===b);chart();});
  function continuity(){
    const jobs=Object.values(extras.jobs).sort((a,b)=>a.at-b.at);
    $('jobs').innerHTML=jobs.length?jobs.map(j=>`<div class="cline">${U.logo(j.platform,'sm')}<div><b>Relance ${esc(A.dayClock(j.at))} · ${esc(A.platform(j.platform)?.name||'')}</b><small>« ${esc(j.message.slice(0,90))} »${j.attempts?' · nouvel essai ('+esc(j.status)+')':''}</small></div><button class="ghost small" data-cancel="${esc(j.id)}">Annuler</button></div>`).join('')
      :`<p class="fine">Aucune relance programmée.${state.settings.resumePrompt?' Programme-la depuis la pastille AI Flow d’une conversation Claude ou ChatGPT.':' Active « Relance après quota » dans les réglages.'}</p>`;
    if(extras.last)$('jobs').innerHTML+=`<p class="fine">Dernière relance : ${esc(extras.last.status)} · ${esc(A.dayClock(extras.last.at))}</p>`;
    const a=U.awakeText(awake);
    $('awake').innerHTML=`<span>Si le Mac dort</span><b class="${a.cls}">${esc(a.text)}</b>`;
    const pn=id=>A.platform(id)?.name||'';
    $('flows').innerHTML=(flowData.flows.length?flowData.flows.map(f=>{
      const st=U.flowState(f),[a,b]=f.ends,dec=f.decisions.filter(d=>d.status==='validated').length,conf=f.decisions.filter(d=>d.status==='conflict').length;
      const go=e=>`<button class="ghost small" data-open-page="transfer" data-query='${esc(JSON.stringify({sync:f.id,from:e.url}))}'>Depuis ${esc(pn(e.platform))}</button>`;
      return `<div class="cline ${st.pending?'ready':''}">${U.logo(a.platform,'sm')}<div><b>${esc(f.title)}</b><small>${esc(pn(a.platform))} « ${esc(a.title)} » ⇄ ${esc(pn(b.platform))} « ${esc(b.title)} » · <span class="${st.pending?'warn':''}">${esc(st.text)}</span>${dec?` · ${dec} décision${dec>1?'s':''} validée${dec>1?'s':''}`:''}${conf?` · <span class="warn">${conf} à arbitrer</span>`:''}${f.locked?' · <span class="warn">décisions illisibles sur cette installation</span>':''}</small></div>
        ${go(a)}${go(b)}<button class="ghost small" data-unlink="${esc(f.id)}">Dissocier</button><button class="ghost small" data-flowdel="${esc(f.id)}">Supprimer</button></div>`;
    }).join(''):'<p class="fine">Aucune conversation liée. Lors d’un transfert, coche « Lier ces conversations » pour synchroniser ensuite seulement les avancées.</p>')
      +(flowData.quarantined?`<p class="fine warn">${flowData.quarantined} Flow${flowData.quarantined>1?'s':''} illisible${flowData.quarantined>1?'s':''} mis de côté (données locales endommagées) : rien n’a été effacé.</p>`:'');
    const tl=A.timelineItems(extras.drafts,state);
    $('drafts').innerHTML=tl.length?tl.map(d=>{
      return `<div class="cline ${d.ready?'ready':''}">${U.logo(d.source||'claude','sm')}<div><b>${esc(d.title)}</b><small>${esc(d.label)} · ${esc(A.dayClock(d.updatedAt))}${d.source?' · '+esc(A.platform(d.source)?.name||''):''}${d.fields?.next?' · Prochaine étape : '+esc(String(d.fields.next).replace(/^- /,'').split('\n')[0].slice(0,60)):''}</small></div>
        ${d.url?`<button class="${d.ready?'primary':'ghost'} small" data-open-url="${esc(d.id)}">Reprendre</button>`:''}${d.destUrl?`<button class="ghost small" data-dest="${esc(d.destUrl)}">Continuer sur ${esc(A.platform(d.target)?.name||'l’autre IA')}</button>`:''}<button class="ghost small" data-open-page="transfer" data-query='${esc(JSON.stringify({draft:d.id}))}'>Ouvrir / continuer ailleurs</button>${d.url&&d.destUrl&&!U.flowOf(flowData.flows,d.url)&&!U.flowOf(flowData.flows,d.destUrl)?`<button class="ghost small" data-link="${esc(d.id)}" title="Synchroniser ensuite seulement les avancées entre ces deux conversations">Lier</button>`:''}<button class="ghost small" data-done="${esc(d.id)}">Terminé</button><button class="ghost small" data-del="${esc(d.id)}" aria-label="Supprimer">Supprimer</button></div>`;
    }).join(''):'<p class="fine">Rien pour l’instant. Quand une limite interrompt une conversation, elle apparaît ici, avec « Reprendre » dès que le quota rouvre. Tu peux aussi « Sauvegarder pour plus tard » depuis la fenêtre AI Flow.</p>';
  }
  function render(){
    $('summary').textContent=summary();
    $('switch').innerHTML=U.smartSwitchHTML(state);
    $('platforms').innerHTML=A.visiblePlatforms(state).map(pid=>U.platformCard(state,pid,conn,{all:true})).join('');
    const now=Date.now(),times=A.visiblePlatforms(state).map(p=>A.platformStatus(state,p,now).updatedAt).filter(Boolean);
    $('sync').textContent=times.length?A.updatedText(Math.max(...times),now):'';
    chart();continuity();U.bindNav(document);
    for(const b of document.querySelectorAll('[data-cancel]'))b.onclick=async()=>{b.disabled=true;try{await A.request('resumeCancel',{id:b.dataset.cancel});}catch{}await reload();};
    for(const b of document.querySelectorAll('[data-del]'))b.onclick=async()=>{if(!confirm('Supprimer ce point de reprise ?'))return;await U.saveDrafts(A.cleanCheckpoints(extras.drafts).filter(d=>d.id!==b.dataset.del));await reload();};
    for(const b of document.querySelectorAll('[data-link]'))b.onclick=async()=>{
      if(!confirm('Lier ces deux conversations ? AI Flow pourra ensuite, sur ton clic, préparer uniquement les avancées de l’une pour l’autre. La première synchronisation considérera tout comme nouveau.'))return;
      try{await A.request('flowLinkCheckpoint',{checkpointId:b.dataset.link});}catch(e){alert(e.message);}await reload();};
    for(const b of document.querySelectorAll('[data-unlink]'))b.onclick=async()=>{if(!confirm('Dissocier ces conversations ? Le suivi des avancées et des décisions est supprimé ; le point de reprise est conservé.'))return;try{await A.request('flowUnlink',{flowId:b.dataset.unlink});}catch{}await reload();};
    for(const b of document.querySelectorAll('[data-flowdel]'))b.onclick=async()=>{if(!confirm('Supprimer ce Flow, ses décisions, son historique et son point de reprise ?'))return;try{await A.request('flowDelete',{flowId:b.dataset.flowdel});}catch{}await reload();};
    for(const b of document.querySelectorAll('[data-dest]'))b.onclick=()=>U.openUrl(b.dataset.dest);
    for(const b of document.querySelectorAll('[data-done]'))b.onclick=async()=>{const list=A.cleanCheckpoints(extras.drafts),d=list.find(x=>x.id===b.dataset.done);if(!d)return;d.status='done';d.updatedAt=Date.now();await U.saveDrafts(list);await reload();};
    for(const b of document.querySelectorAll('[data-open-url]'))b.onclick=async()=>{const list=A.cleanCheckpoints(extras.drafts),d=list.find(x=>x.id===b.dataset.openUrl);if(!d)return;d.status='done';d.updatedAt=Date.now();await U.saveDrafts(list);await U.openUrl(d.url);await reload();};
  }
  async function reload(){
    try{state=await A.getState();}catch{}
    extras=await U.loadExtras();flowData=await U.loadFlows();
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
