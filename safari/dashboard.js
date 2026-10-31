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
    const h=extras.history,ids=Object.keys(h.series).filter(id=>A.METRICS[id]);
    const sel=$('metric');
    if(!ids.length){sel.innerHTML='<option>Aucun relevé</option>';sel.disabled=true;$('chart').innerHTML='<p class="note">L’historique se construit automatiquement à partir des relevés réels, sur cet appareil uniquement.</p>';$('events').innerHTML='';return;}
    sel.disabled=false;
    if(!metric||!ids.includes(metric))metric=ids.includes('claude.session')?'claude.session':ids[0];
    sel.innerHTML=ids.map(id=>`<option value="${id}" ${id===metric?'selected':''}>${esc(A.METRICS[id].label)}</option>`).join('');
    const now=Date.now(),from=now-range*3600000,W=640,H=190,P=28;
    const x=t=>P+(t-from)/(now-from)*(W-P-8),y=p=>H-22-(p/100)*(H-36);
    const segs=A.segments(h.series[metric]||[],from,now);
    const limits=h.limits.filter(l=>l.id===metric&&(l.to??now)>=from);
    const resets=h.resets.filter(r=>r.id===metric&&r.t>=from);
    const grid=[0,50,80,100].map(p=>`<line x1="${P}" x2="${W-8}" y1="${y(p)}" y2="${y(p)}" class="g${p===80?' warn':''}"/><text x="${P-6}" y="${y(p)+3}" text-anchor="end">${p}</text>`).join('');
    const ticks=[];const step=range===24?6*3600000:24*3600000;
    for(let t=Math.ceil(from/step)*step;t<now;t+=step)ticks.push(`<text x="${x(t)}" y="${H-6}" text-anchor="middle">${range===24?A.clock(t):new Date(t).toLocaleDateString('fr-FR',{weekday:'short'})}</text>`);
    const lim=limits.map(l=>`<rect class="lim" x="${x(Math.max(l.from,from))}" y="${y(100)}" width="${Math.max(2,x(l.to??now)-x(Math.max(l.from,from)))}" height="${y(0)-y(100)}"/>`).join('');
    const rs=resets.map(r=>`<line class="rst" x1="${x(r.t)}" x2="${x(r.t)}" y1="${y(100)}" y2="${y(0)}"/>`).join('');
    const lines=segs.map(s=>s.length===1?`<circle cx="${x(s[0][0])}" cy="${y(s[0][1])}" r="2.5" class="pt"/>`:`<polyline points="${s.map(p=>x(p[0]).toFixed(1)+','+y(p[1]).toFixed(1)).join(' ')}"/>`).join('');
    $('chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution de ${esc(A.METRICS[metric].label)}"><rect class="gap" x="${P}" y="${y(100)}" width="${W-P-8}" height="${y(0)-y(100)}"/>${grid}${lim}${rs}${lines}${ticks.join('')}</svg>`;
    const ev=[...resets.map(r=>({t:r.t,txt:`Reset constaté (${Math.round(r.from)} % → ${Math.round(r.to)} %)`})),...limits.map(l=>({t:l.from,txt:`Limite atteinte${l.to?` jusqu’à ${A.dayClock(l.to)} environ`:' · en cours'}`}))].sort((a,b)=>b.t-a.t);
    $('events').innerHTML=ev.length?'<ul>'+ev.slice(0,8).map(e=>`<li><time>${esc(A.dayClock(e.t))}</time>${esc(e.txt)}</li>`).join('')+'</ul>':'<p class="fine">Aucun reset ni limite constatés sur la période.</p>';
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
