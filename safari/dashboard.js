(async function(){
  'use strict';
  const A=window.AIFlow,U=window.AIFlowUI,$=id=>document.getElementById(id),esc=A.escapeHTML;
  let state,conn={},extras=await U.loadExtras(),awake=null,range=24,metric=null;
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
    return parts.join(' ')||'Ouvre Claude, ChatGPT ou Grok dans un onglet : les quotas apparaissent en quelques secondes.';
  }
  function chart(){
    const h=extras.history,ids=Object.keys(h.series).filter(id=>A.METRICS[id]&&A.visiblePlatforms(state).includes(A.METRICS[id].platform));
    const sel=$('metric');
    if(!ids.length){sel.innerHTML='<option>Aucune mesure pour l’instant</option>';sel.disabled=true;$('history-summary').textContent='';$('chart').innerHTML='<p class="note">Ta consommation apparaîtra ici après quelques relevés : garde un onglet Claude, ChatGPT (Codex) ou Grok ouvert pendant que tu travailles.</p>';$('events').innerHTML='';return;}
    sel.disabled=false;
    if(!metric||!ids.includes(metric))metric=ids.includes('claude.session')?'claude.session':ids[0];
    sel.innerHTML=ids.map(id=>`<option value="${id}" ${id===metric?'selected':''}>${esc(A.METRICS[id].label)}</option>`).join('');
    const now=Date.now(),bucket=range===24?3600000:86400000;
    const end=range===24?Math.ceil(now/3600000)*3600000:new Date(new Date(now).setHours(24,0,0,0)).getTime();
    const from=end-range*3600000;
    const bars=A.consumption(h.series[metric]||[],from,end,bucket);
    const limits=h.limits.filter(l=>l.id===metric&&(l.to??now)>=from);
    const resets=h.resets.filter(r=>r.id===metric&&r.t>=from);
    const total=Math.round(bars.reduce((s,b)=>s+b.used,0)),measured=bars.filter(b=>b.measured).length;
    const unit=range===24?'heure':'jour',name=A.METRICS[metric].label;
    $('history-summary').innerHTML=measured?`<b>${range===24?'Dernières 24 h':'7 derniers jours'} : ${total} % ${total>100?`(≈ ${(total/100).toLocaleString('fr-FR',{maximumFractionDigits:1})} fois le quota)`:''} de « ${esc(name)} » consommés.</b> Mesuré sur ${measured} ${unit}${measured>1?'s':''} sur ${bars.length}${limits.length?` · limite atteinte ${limits.length} fois`:''}${resets.length?` · ${resets.length} reset${resets.length>1?'s':''} constaté${resets.length>1?'s':''}`:''}.`:'Aucune mesure sur cette période.';
    const W=640,H=200,P=34,B=24,max=Math.max(10,...bars.map(b=>b.used));
    const top=max<=10?10:max<=25?25:max<=50?50:max<=100?100:Math.ceil(max/50)*50;
    const slot=(W-P-8)/bars.length,y=v=>H-B-(v/top)*(H-B-12);
    const grid=[0,top/2,top].map(v=>`<line x1="${P}" x2="${W-8}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${P-6}" y="${y(v)+3}" text-anchor="end">${Math.round(v)} %</text>`).join('');
    const rects=bars.map((b,i)=>{
      const x=P+i*slot+slot*.15,w=Math.max(2,slot*.7);
      const lim=limits.some(l=>l.from<b.t+bucket&&(l.to??now)>=b.t);
      if(!b.measured)return `<rect class="nodata" x="${x}" y="${y(0)-3}" width="${w}" height="3"><title>${esc(range===24?A.clock(b.t):new Date(b.t).toLocaleDateString('fr-FR',{weekday:'long'}))} : aucune mesure</title></rect>`;
      return `<rect class="use${lim?' lim':''}" x="${x}" y="${y(b.used)}" width="${w}" height="${Math.max(1,y(0)-y(b.used))}"><title>${esc(range===24?A.clock(b.t)+'–'+A.clock(b.t+bucket):new Date(b.t).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric'}))} : ${b.used} % consommés${lim?' · limite atteinte':''}</title></rect>`;
    }).join('');
    const every=range===24?6:1;
    const labels=bars.map((b,i)=>i%every===0?`<text x="${P+i*slot+slot/2}" y="${H-6}" text-anchor="middle">${range===24?A.clock(b.t):new Date(b.t).toLocaleDateString('fr-FR',{weekday:'short'})}</text>`:'').join('');
    $('chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Consommation de ${esc(name)} par ${unit}">${grid}${rects}${labels}</svg>`;
    const ev=[...resets.map(r=>({t:r.t,txt:`Reset constaté (${Math.round(r.from)} % → ${Math.round(r.to)} %)`})),...limits.map(l=>({t:l.from,txt:`Limite atteinte${l.to?`, de nouveau disponible vers ${A.dayClock(l.to)}`:' · en cours'}`}))].sort((a,b)=>b.t-a.t);
    $('events').innerHTML=ev.length?'<ul>'+ev.slice(0,8).map(e=>`<li><time>${esc(A.dayClock(e.t))}</time>${esc(e.txt)}</li>`).join('')+'</ul>':'';
  }
  function continuity(){
    const jobs=Object.values(extras.jobs).sort((a,b)=>a.at-b.at);
    $('jobs').innerHTML=jobs.length?jobs.map(j=>`<div class="cline">${U.logo(j.platform,'sm')}<div><b>Relance ${esc(A.dayClock(j.at))} · ${esc(A.platform(j.platform)?.name||'')}</b><small>« ${esc(j.message.slice(0,90))} »${j.attempts?' · nouvel essai ('+esc(j.status)+')':''}</small></div><button class="ghost small" data-cancel="${esc(j.id)}">Annuler</button></div>`).join('')
      :`<p class="fine">Aucune relance programmée.${state.settings.resumePrompt?' Programme-la depuis la pastille AI Flow d’une conversation Claude ou ChatGPT.':' Active « Relance après quota » dans les réglages.'}</p>`;
    if(extras.last)$('jobs').innerHTML+=`<p class="fine">Dernière relance : ${esc(extras.last.status)} · ${esc(A.dayClock(extras.last.at))}</p>`;
    const a=U.awakeText(awake);
    $('awake').innerHTML=`<span>Awake (Mac éveillé)</span><b class="${a.cls}">${esc(a.text)}</b>`;
    $('drafts').innerHTML=extras.drafts.length?extras.drafts.map(d=>`<div class="cline"><span class="logo sm neutral">↺</span><div><b>${esc(d.title||'Sans titre')}</b><small>${esc(A.dayClock(d.updatedAt||d.createdAt))}${d.source?' · depuis '+esc(A.platform(d.source)?.name||''):''}</small></div><button class="ghost small" data-open-page="transfer" data-query='${esc(JSON.stringify({draft:d.id}))}'>Reprendre</button><button class="ghost small" data-del="${esc(d.id)}" aria-label="Supprimer la reprise">Supprimer</button></div>`).join('')
      :'<p class="fine">Aucune reprise. Depuis « Transférer », enregistre le contexte de ton travail pour le retrouver après un reset ou sur une autre IA.</p>';
  }
  function render(){
    $('summary').textContent=summary();
    $('switch').innerHTML=U.smartSwitchHTML(state);
    $('platforms').innerHTML=A.visiblePlatforms(state).map(pid=>U.platformCard(state,pid,conn,{all:true})).join('');
    const now=Date.now(),times=A.visiblePlatforms(state).map(p=>A.platformStatus(state,p,now).updatedAt).filter(Boolean);
    $('sync').textContent=times.length?A.updatedText(Math.max(...times),now):'';
    chart();continuity();U.bindNav(document);
    for(const b of document.querySelectorAll('[data-cancel]'))b.onclick=async()=>{b.disabled=true;try{await A.request('resumeCancel',{id:b.dataset.cancel});}catch{}await reload();};
    for(const b of document.querySelectorAll('[data-del]'))b.onclick=async()=>{if(!confirm('Supprimer cette reprise ?'))return;await U.saveDrafts(extras.drafts.filter(d=>d.id!==b.dataset.del));await reload();};
  }
  async function reload(){
    try{state=await A.getState();}catch{}
    extras=await U.loadExtras();
    try{conn=await A.request('connectionStatuses');}catch{}
    render();
  }
  $('metric').addEventListener('change',e=>{metric=e.target.value;chart();});
  for(const b of document.querySelectorAll('[data-range]'))b.addEventListener('click',()=>{range=Number(b.dataset.range);for(const o of document.querySelectorAll('[data-range]'))o.classList.toggle('on',o===b);chart();});
  $('refresh').addEventListener('click',async()=>{const b=$('refresh');b.disabled=true;b.textContent='Actualisation…';try{await A.request('refresh');}catch{}await reload();b.disabled=false;b.textContent='Actualiser';});
  render();await reload();
  A.request('autoRefresh',{}).then(reload,()=>{});
  A.request('awakeStatus').then(s=>{awake=s;render();},()=>{});
  setInterval(()=>A.request('autoRefresh',{}).then(reload,()=>{}),60000);
  U.live(reload);
})();
