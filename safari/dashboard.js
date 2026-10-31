(async function(){
  'use strict';
  const A=window.AIFlow,U=window.AIFlowUI,$=id=>document.getElementById(id),esc=A.escapeHTML;
  let state,conn={},extras=await U.loadExtras(),awake=null,range=24,metric=null,sel=-1,bars=[],geom=null;
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
    const h=extras.history,vis=A.visiblePlatforms(state);
    const ids=Object.keys(h.series).filter(id=>A.METRICS[id]&&vis.includes(A.METRICS[id].platform));
    const selEl=$('metric');
    if(!ids.length){selEl.innerHTML='<option>Aucune mesure pour l’instant</option>';selEl.disabled=true;$('history-summary').textContent='';
      $('chart').innerHTML='<p class="note">Ta consommation apparaîtra ici après quelques relevés : garde un onglet Claude ou ChatGPT ouvert pendant que tu travailles.</p>';bars=[];geom=null;tip(-1);return;}
    selEl.disabled=false;
    if(!metric||!ids.includes(metric))metric=ids.includes('claude.session')?'claude.session':ids[0];
    selEl.innerHTML=ids.map(id=>`<option value="${id}" ${id===metric?'selected':''}>${esc(A.METRICS[id].label)}</option>`).join('');
    const now=Date.now(),bucket=range===24?3600000:86400000;
    const end=range===24?Math.ceil(now/3600000)*3600000:new Date(new Date(now).setHours(24,0,0,0)).getTime(),from=end-range*3600000;
    bars=A.consumption(h.series[metric]||[],from,end,bucket);
    const limits=h.limits.filter(l=>l.id===metric&&(l.to??now)>=from);
    for(const b of bars)b.limit=limits.some(l=>l.from<b.t+bucket&&(l.to??now)>=b.t);
    const total=Math.round(bars.reduce((s,b)=>s+b.used,0)),attr=Math.round(bars.reduce((s,b)=>s+b.attributed,0)),measured=bars.filter(b=>b.measured).length;
    const unit=range===24?'heure':'jour',name=A.METRICS[metric].label;
    $('history-summary').innerHTML=measured?`<b>${range===24?'Dernières 24 h':'7 derniers jours'} : ${total} % de « ${esc(name)} » consommés</b>${attr?` (dont ${attr} % constatés après une absence de mesure)`:''}. Mesures sur ${measured} ${unit}${measured>1?'s':''} sur ${bars.length}${limits.length?` · limite atteinte ${limits.length} fois`:''}.`:'Aucune mesure sur cette période.';
    const W=680,H=220,L=44,R=10,T=14,B=28,max=Math.max(5,...bars.map(b=>b.used));
    const top=max<=5?5:max<=10?10:max<=25?25:max<=50?50:max<=100?100:Math.ceil(max/50)*50;
    const slot=(W-L-R)/bars.length,y=v=>H-B-(v/top)*(H-B-T);
    geom={W,L,R,slot};
    const grid=[0,top/2,top].map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${Math.round(v)} %</text>`).join('');
    const cols=bars.map((b,i)=>{
      const x=L+i*slot+slot*.14,w=Math.max(2,slot*.72);
      if(!b.measured)return `<rect class="nodata" x="${x}" y="${y(0)-3}" width="${w}" height="3"/>`;
      const hd=Math.max(b.direct>0?1:0,y(0)-y(b.direct)),ha=y(0)-y(b.used)-hd;
      return `<rect class="use${b.limit?' lim':''}" x="${x}" y="${y(0)-hd}" width="${w}" height="${hd}" rx="2"/>${ha>0.5?`<rect class="attr" x="${x}" y="${y(b.used)}" width="${w}" height="${ha}" rx="2"/>`:''}${b.used===0?`<rect class="zero" x="${x}" y="${y(0)-2}" width="${w}" height="2"/>`:''}`;
    }).join('');
    const every=range===24?3:1;
    const labels=bars.map((b,i)=>i%every===0?`<text x="${L+i*slot+slot/2}" y="${H-8}" text-anchor="middle">${range===24?new Date(b.t).getHours()+' h':new Date(b.t).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric'})}</text>`:'').join('');
    const hl=sel>=0&&sel<bars.length?`<rect class="hl" x="${L+sel*slot}" y="${T-6}" width="${slot}" height="${H-B-T+6}"/>`:'';
    $('chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Consommation de ${esc(name)} par ${unit}">${hl}${grid}${cols}${labels}</svg>`;
    tip(sel);
  }
  function tip(i){
    const el=$('tip');
    if(i<0||i>=bars.length||!geom){el.hidden=true;return;}
    const b=bars[i],bucket=range===24?3600000:86400000,p=A.METRICS[metric];
    const lines=[`<b>${esc(fmtBucket(b.t,bucket))}</b>`,`<span class="muted">${esc(p.label)}</span>`];
    if(!b.measured)lines.push('Aucune mesure : aucun onglet ouvert à ce moment-là.');
    else{
      lines.push(`Consommé : <b>${b.used>0?'+':''}${b.used} %</b>${b.attributed?` <span class="muted">(dont +${b.attributed} % constatés au retour, après une absence de mesure)</span>`:''}`);
      lines.push(`Niveau relevé : ${Math.round(b.first)} %${b.last!==b.first?` → ${Math.round(b.last)} %`:''}${b.lastAt?` <span class="muted">(dernier à ${A.clock(b.lastAt)})</span>`:''}`);
      lines.push(`<span class="muted">${b.measured} relevé${b.measured>1?'s':''} réel${b.measured>1?'s':''}, lu${b.measured>1?'s':''} sur ${esc(A.platform(p.platform).name==='Codex'?'chatgpt.com':'claude.ai')}${b.resets?` · reset constaté`:''}${b.limit?' · limite atteinte':''}</span>`);
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
  $('metric').addEventListener('change',e=>{metric=e.target.value;sel=-1;chart();});
  for(const b of document.querySelectorAll('[data-range]'))b.addEventListener('click',()=>{range=Number(b.dataset.range);sel=-1;for(const o of document.querySelectorAll('[data-range]'))o.classList.toggle('on',o===b);chart();});
  function continuity(){
    const jobs=Object.values(extras.jobs).sort((a,b)=>a.at-b.at);
    $('jobs').innerHTML=jobs.length?jobs.map(j=>`<div class="cline">${U.logo(j.platform,'sm')}<div><b>Relance ${esc(A.dayClock(j.at))} · ${esc(A.platform(j.platform)?.name||'')}</b><small>« ${esc(j.message.slice(0,90))} »${j.attempts?' · nouvel essai ('+esc(j.status)+')':''}</small></div><button class="ghost small" data-cancel="${esc(j.id)}">Annuler</button></div>`).join('')
      :`<p class="fine">Aucune relance programmée.${state.settings.resumePrompt?' Programme-la depuis la pastille AI Flow d’une conversation Claude ou ChatGPT.':' Active « Relance après quota » dans les réglages.'}</p>`;
    if(extras.last)$('jobs').innerHTML+=`<p class="fine">Dernière relance : ${esc(extras.last.status)} · ${esc(A.dayClock(extras.last.at))}</p>`;
    const a=U.awakeText(awake);
    $('awake').innerHTML=`<span>Si le Mac dort</span><b class="${a.cls}">${esc(a.text)}</b>`;
    const tl=A.cleanCheckpoints(extras.drafts).filter(d=>d.status!=='done'||Date.now()-d.updatedAt<3*86400000);
    $('drafts').innerHTML=tl.length?tl.map(d=>{
      const pid=d.platform||d.source,st=pid?A.platformStatus(state,pid):null,ok=d.kind==='interruption'&&(d.status==='ready'||(st&&st.fresh.length>0&&!st.limitReached));
      const what=d.kind==='interruption'?(d.status==='done'?'Repris':ok?`Interrompu · ${A.platform(pid)?.name||''} de nouveau disponible`:`Interrompu par la limite ${A.platform(pid)?.name||''}`):'Point de reprise';
      return `<div class="cline ${ok?'ready':''} ${d.status==='done'?'done':''}">${U.logo(d.source||'claude','sm')}<div><b>${esc(d.title)}</b><small>${esc(what)} · ${esc(A.dayClock(d.updatedAt))}${d.source?' · '+esc(A.platform(d.source)?.name||''):''}${d.fields?.next?' · Prochaine étape : '+esc(String(d.fields.next).split('\n')[0].slice(0,60)):''}</small></div>
        ${d.url?`<button class="${ok?'primary':'ghost'} small" data-open-url="${esc(d.id)}">Reprendre</button>`:''}<button class="ghost small" data-open-page="transfer" data-query='${esc(JSON.stringify({draft:d.id}))}'>${d.kind==='interruption'?'Transférer':'Ouvrir'}</button><button class="ghost small" data-del="${esc(d.id)}" aria-label="Supprimer">Supprimer</button></div>`;
    }).join(''):'<p class="fine">Rien pour l’instant. Quand une limite interrompt une conversation, elle apparaît ici, avec « Reprendre » dès que le quota rouvre. Tu peux aussi créer un point de reprise depuis la fenêtre AI Flow.</p>';
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
    for(const b of document.querySelectorAll('[data-open-url]'))b.onclick=async()=>{const list=A.cleanCheckpoints(extras.drafts),d=list.find(x=>x.id===b.dataset.openUrl);if(!d)return;d.status='done';d.updatedAt=Date.now();await U.saveDrafts(list);await U.openUrl(d.url);await reload();};
  }
  async function reload(){
    try{state=await A.getState();}catch{}
    extras=await U.loadExtras();
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
