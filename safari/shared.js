/* AI Flow core — derived from v0.2. No network access. Writes are owned by background. */
(function(root){
  'use strict';
  const KEY='ai_flow_state_v1';
  const api=typeof browser!=='undefined'?browser:typeof chrome!=='undefined'?chrome:null;
  const METRICS={
    'claude.session':{label:'Claude · Session 5 h',provider:'claude',short:'Session 5 h'},
    'claude.weekly':{label:'Claude · Hebdomadaire',provider:'claude',short:'Tous les modèles · semaine'},
    'claude.sonnet':{label:'Claude · Sonnet',provider:'claude',short:'Sonnet · semaine'},
    'claude.opus':{label:'Claude · Opus',provider:'claude',short:'Opus · semaine'},
    'chatgpt.thinking':{label:'ChatGPT · Thinking (manuel)',provider:'chatgpt',short:'Thinking · manuel'},
    'codex.session':{label:'Codex / Work · Session (si exposée)',provider:'codex',short:'Codex / Work · session'},
    'codex.weekly':{label:'Codex / Work · Hebdomadaire',provider:'codex',short:'Codex / Work · semaine'},
    'codex.review':{label:'Codex · Code review',provider:'codex',short:'Codex · revue de code'}
  };
  const USAGE_URLS={claude:'https://claude.ai/settings/usage',codex:'https://chatgpt.com/codex/settings/usage'};
  const validPercent=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100;
  const defaults=()=>({metrics:{},history:{},connectors:{},settings:{focusMode:true,alertAt80:true,alertAt95:true,systemAlerts:false,nativeMenuEnabled:false,sessionMinutes:180,reservePercent:15,widgetEnabled:true},hudPositions:{}});
  function clean(raw){
    const s=raw&&typeof raw==='object'?raw:{};
    const out={...defaults(),settings:{...defaults().settings,...s.settings},hudPositions:{...s.hudPositions},connectors:{...s.connectors}};
    for(const id of Object.keys(METRICS)){
      const m=s.metrics?.[id];
      if(m&&validPercent(m.percent)&&Number.isFinite(m.observedAt)&&['observed','manual'].includes(m.source)){
        out.metrics[id]={percent:m.percent,source:m.source,observedAt:m.observedAt,resetAt:Number.isFinite(m.resetAt)?m.resetAt:null,resetApproximate:!!m.resetApproximate};
        out.history[id]=(Array.isArray(s.history?.[id])?s.history[id]:[]).filter(p=>validPercent(p.percent)&&Number.isFinite(p.ts)&&p.source==='observed').slice(-300);
      }
    }
    return out;
  }
  async function getState(){const values=await api.storage.local.get(KEY);return clean(values?.[KEY]);}
  async function request(op,payload){
    const response=await api.runtime.sendMessage({type:'AI_FLOW',op,payload});
    if(!response?.ok)throw new Error(response?.error||'AI Flow indisponible. Recharge cette page.');
    return response.value;
  }
  const saveMetrics=inputs=>request('metrics',inputs);
  const saveMetric=async input=>(await saveMetrics([input]))[0];
  const saveSettings=patch=>request('settings',patch);
  const clearReadings=()=>request('clear');
  const savePosition=(provider,position)=>request('position',{provider,position});
  function normalizeMetric(input,now){
    if(!input||!Object.hasOwn(METRICS,input.id)||!validPercent(input.percent)||!['observed','manual'].includes(input.source||'manual'))throw new Error('Mesure non valide');
    let resetAt=null;
    if(input.resetAt!==null&&input.resetAt!==undefined&&input.resetAt!==''){
      resetAt=typeof input.resetAt==='number'?input.resetAt:new Date(input.resetAt).getTime();
      if(!Number.isFinite(resetAt)||resetAt<=now||resetAt>now+32*86400000)throw new Error('La réinitialisation doit être future et inférieure à 32 jours.');
    }
    return {id:input.id,percent:input.percent,source:input.source||'manual',observedAt:now,resetAt,resetApproximate:!!input.resetApproximate};
  }
  function applyMetric(state,metric,now){
    const {id,...next}=metric,old=state.metrics[id];
    let history=(state.history[id]||[]).filter(p=>p.ts<=now&&now-p.ts<=14*86400000&&p.source==='observed');
    const resetChanged=old&&((!!old.resetAt!==!!next.resetAt)||(old.resetAt&&Math.abs(old.resetAt-next.resetAt)>2*60000));
    if(old&&(old.source!==next.source||next.percent<old.percent||resetChanged||(old.resetAt&&old.resetAt<=now)))history=[];
    if(next.source==='observed'){
      const last=history.at(-1);
      if(!last||now-last.ts>=60000)history.push({ts:now,percent:next.percent,resetAt:next.resetAt,source:next.source});
    }else history=[];
    state.metrics[id]=next;state.history[id]=history.slice(-300);return next;
  }
  // Pure command reducer; the worker serializes read/reduce/write across every extension context.
  function reduce(state,op,payload,now=Date.now()){
    if(op==='metrics'){
      if(!Array.isArray(payload)||!payload.length||payload.length>8)throw new Error('Aucun quota ou trop de quotas');
      const metrics=payload.map(m=>normalizeMetric(m,now));
      if(new Set(metrics.map(m=>m.id)).size!==metrics.length)throw new Error('Quotas dupliqués');
      return metrics.map(m=>applyMetric(state,m,now));
    }
    if(op==='settings'){
      for(const [key,value] of Object.entries(payload||{})){
        if(!Object.hasOwn(defaults().settings,key))continue;
        if(['sessionMinutes','reservePercent'].includes(key)){
          if(!Number.isFinite(value))throw new Error('Paramètre non valide');
          state.settings[key]=key==='sessionMinutes'?Math.max(15,Math.min(480,Math.round(value))):Math.max(0,Math.min(50,Math.round(value)));
        }else if(typeof value==='boolean')state.settings[key]=value;
      }return state;
    }
    if(op==='clear'){state.metrics={};state.history={};state.connectors={};return state;}
    if(op==='position'){
      if(!['claude','chatgpt'].includes(payload?.provider)||!Number.isFinite(payload.position?.right)||!Number.isFinite(payload.position?.bottom))throw new Error('Position non valide');
      state.hudPositions[payload.provider]={right:Math.max(6,Math.min(10000,Math.round(payload.position.right))),bottom:Math.max(6,Math.min(10000,Math.round(payload.position.bottom)))};return state;
    }
    if(op==='connector'){
      if(!Object.hasOwn(USAGE_URLS,payload?.provider)||!['observed','partial','unavailable','waiting','stopped','error','paused','login','stale'].includes(payload?.status))throw new Error('Connecteur non valide');
      const old=state.connectors[payload.provider]||{};
      state.connectors[payload.provider]={status:payload.status,checkedAt:now,lastSuccess:['observed','partial'].includes(payload.status)?now:old.lastSuccess||null};return state;
    }
    throw new Error('Commande inconnue');
  }
  function isStale(m,id,now=Date.now()){
    if(!m||!validPercent(m.percent)||!Number.isFinite(m.observedAt))return true;
    const maxAge=m.source==='observed'?15*60000:Math.min(id==='claude.session'?5*3600000:24*3600000,24*3600000);
    return m.observedAt>now+60000||now-m.observedAt>maxAge||!!(m.resetAt&&m.resetAt<=now);
  }
  function pace(state,id,now=Date.now()){
    const m=state.metrics[id];
    if(!m||m.source!=='observed'||isStale(m,id,now))return null;
    const h=(state.history[id]||[]).filter(p=>p.source==='observed'&&Number.isFinite(p.ts)&&validPercent(p.percent)&&p.ts<=now&&now-p.ts<=2*3600000&&
      (!!p.resetAt===!!m.resetAt)&&(!m.resetAt||Math.abs(p.resetAt-m.resetAt)<=2*60000)).sort((a,b)=>a.ts-b.ts);
    if(h.length<3||now-h.at(-1).ts>15*60000)return null;
    const first=h[0],last=h.at(-1),hours=(last.ts-first.ts)/3600000;
    if(hours<.25||last.percent<=first.percent||h.some((p,i)=>i&&(p.percent<h[i-1].percent||p.ts<=h[i-1].ts)))return null;
    const perHour=(last.percent-first.percent)/hours;
    if(perHour<=0||perHour>600)return null;
    const rates=h.slice(1).map((p,i)=>(p.percent-h[i].percent)/((p.ts-h[i].ts)/3600000));
    const spread=Math.sqrt(rates.reduce((s,x)=>s+(x-perHour)**2,0)/rates.length)/perHour;
    return {perHour,minutesRemaining:Math.floor(Math.max(0,(100-m.percent)/perHour*60)),observations:h.length,confidence:h.length>=6&&hours>=.5&&spread<.5?'medium':'low',spanMinutes:Math.round(hours*60)};
  }
  function level(metric,id,now=Date.now(),settings=null){
    if(isStale(metric,id,now))return 'unknown';
    if(metric.percent>=95&&settings?.alertAt95!==false)return 'critical';
    if(metric.percent>=80&&settings?.alertAt80!==false)return 'warning';return 'healthy';
  }
  function formatReset(resetAt,now=Date.now()){
    if(!resetAt)return 'Non communiqué';const min=Math.ceil((resetAt-now)/60000);
    if(min<=0)return 'Reset à vérifier';if(min<60)return `Dans ${min} min`;
    if(min<1440)return `Dans ${Math.floor(min/60)} h ${min%60} min`;
    return new Date(resetAt).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  }
  function forecast(state,id,minutes=180,now=Date.now()){
    const m=state.metrics[id],p=pace(state,id,now);
    if(!m||isStale(m,id,now))return {kind:'unknown',text:'Quota indisponible ou relevé périmé'};
    if(m.percent>=100)return {kind:'warning',text:(m.source==='manual'?'D’après la saisie manuelle, le':'Le')+' quota affiché est entièrement consommé. Attends un nouveau relevé après reset.'};
    if(!p)return {kind:'insufficient',text:'Au moins trois relevés automatiques sur 15 min sont nécessaires ; les saisies manuelles ne servent pas aux prévisions.'};
    const reset=m.resetAt?(m.resetAt-now)/60000:Infinity,horizon=Math.min(minutes,reset);
    const reserve=state.settings.reservePercent??15,reserveMinutes=Math.max(0,(100-reserve-m.percent)/p.perHour*60);
    const confidence=`Fiabilité ${p.confidence==='medium'?'moyenne':'faible'} · ${p.observations} relevés. `;
    if(p.minutesRemaining<=horizon)return {kind:'warning',text:confidence+`Limite possible dans ~${p.minutesRemaining} min au rythme observé.`,pace:p};
    if(reserve>0&&reserveMinutes<=horizon)return {kind:'caution',text:confidence+`Réserve de ${reserve} % potentiellement entamée dans ~${Math.floor(reserveMinutes)} min.`,pace:p};
    if(reset<=minutes)return {kind:'partial',text:confidence+'Capacité apparemment suffisante jusqu’au reset ; la suite de la session reste indéterminée.',pace:p};
    return {kind:'healthy',text:confidence+`Autonomie théorique ~${p.minutesRemaining} min ; aucune garantie si le rythme change.`,pace:p};
  }
  function menuSnapshot(state,now=Date.now()){
    const safe=clean(state);
    return {schema:1,generatedAt:now,metrics:Object.entries(safe.metrics).map(([id,m])=>({id,label:METRICS[id].label,percent:m.percent,source:m.source,observedAt:m.observedAt,resetAt:m.resetAt,resetApproximate:m.resetApproximate}))};
  }
  function connectorLabel(c,now=Date.now()){
    if(!c)return 'Non connecté';
    if(['observed','partial'].includes(c.status)&&now-c.checkedAt>15*60000)return 'Relevé ancien · rouvrir la page officielle';
    return ({observed:'Lecture reconnue · expérimental',partial:'Lecture partielle',unavailable:'Page non reconnue ou en chargement',waiting:'En attente du chargement',stopped:'Suivi arrêté',error:'Actualisation impossible',paused:'À réactiver après redémarrage',login:'Connexion requise sur le site officiel',stale:'Page inchangée · fraîcheur non confirmée'})[c.status]||'État inconnu';
  }
  function platformForecast(state,provider,minutes=180,now=Date.now()){
    const prefix=provider==='claude'?'claude':'codex';
    const ids=[...new Set([prefix+'.session',prefix+'.weekly',...Object.keys(state.metrics).filter(id=>id.startsWith(prefix+'.'))])];
    const results=ids.map(id=>({id,...forecast(state,id,minutes,now)}));
    const rank={warning:0,caution:1,unknown:2,insufficient:3,partial:4,healthy:5};
    results.sort((a,b)=>rank[a.kind]-rank[b.kind]||(state.metrics[a.id]?.percent===100?0:a.pace?.minutesRemaining??Infinity)-(state.metrics[b.id]?.percent===100?0:b.pace?.minutesRemaining??Infinity));
    const worst=results[0];
    return {...worst,limitingId:worst.id,results,text:METRICS[worst.id].short+' : '+worst.text+' Évaluation limitée aux quotas disponibles ; une limite absente reste indéterminée.'};
  }
  function providerIds(state,provider){const base=provider==='claude'?['claude.session','claude.weekly']:['codex.session','codex.weekly'];return [...new Set([...base,...Object.keys(state.metrics).filter(id=>provider==='claude'?id.startsWith('claude.'):!id.startsWith('claude.'))])];}
  root.AIFlow={KEY,METRICS,USAGE_URLS,api,clean,defaults,reduce,getState,request,saveMetric,saveMetrics,saveSettings,clearReadings,savePosition,isStale,pace,level,forecast,platformForecast,menuSnapshot,connectorLabel,formatReset,providerIds};
})(typeof window!=='undefined'?window:globalThis);
