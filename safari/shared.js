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
    'codex.session':{label:'Codex / Work · Session (si exposée)',provider:'codex',short:'Codex / Work · session'},
    'codex.weekly':{label:'Codex / Work · Hebdomadaire',provider:'codex',short:'Codex / Work · semaine'},
    'codex.review':{label:'Codex · Code review',provider:'codex',short:'Codex · revue de code'}
  };
  // Logos (Simple Icons, CC0) : marques de leurs propriétaires, utilisées uniquement pour désigner le service.
  const LOGOS={claude:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#D97757" d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/></svg>',
    chatgpt:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>'};
  const USAGE_URLS={claude:'https://claude.ai/settings/usage',codex:'https://chatgpt.com/codex/settings/usage'};
  const validPercent=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100;
  const defaults=()=>({metrics:{},history:{},connectors:{},settings:{focusMode:true,alertAt80:true,alertAt95:true,systemAlerts:false,nativeMenuEnabled:false,sessionMinutes:180,reservePercent:15,widgetEnabled:true,resumePrompt:false},hudPositions:{}});
  function clean(raw){
    const s=raw&&typeof raw==='object'?raw:{};
    const out={...defaults(),settings:{...defaults().settings,...s.settings},hudPositions:{...s.hudPositions},connectors:{...s.connectors}};
    for(const id of Object.keys(METRICS)){
      const m=s.metrics?.[id];
      if(m&&validPercent(m.percent)&&Number.isFinite(m.observedAt)&&m.source==='observed'){
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
    if(!input||!Object.hasOwn(METRICS,input.id)||!validPercent(input.percent)||input.source!=='observed')throw new Error('Mesure non valide');
    let resetAt=null;
    if(input.resetAt!==null&&input.resetAt!==undefined&&input.resetAt!==''){
      resetAt=typeof input.resetAt==='number'?input.resetAt:new Date(input.resetAt).getTime();
      if(!Number.isFinite(resetAt)||resetAt<=now||resetAt>now+32*86400000)throw new Error('La réinitialisation doit être future et inférieure à 32 jours.');
    }
    return {id:input.id,percent:input.percent,source:'observed',observedAt:now,resetAt,resetApproximate:!!input.resetApproximate};
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
    if(m.percent>=100)return {kind:'warning',text:'Le quota affiché est entièrement consommé. Attends un nouveau relevé après reset.'};
    if(!p)return {kind:'insufficient',text:'Prévision disponible après quelques minutes d’utilisation (au moins trois relevés sur 15 min).'};
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
  root.AIFlow={KEY,METRICS,LOGOS,USAGE_URLS,api,clean,defaults,reduce,getState,request,saveMetric,saveMetrics,saveSettings,clearReadings,savePosition,isStale,pace,level,forecast,platformForecast,menuSnapshot,connectorLabel,formatReset,providerIds};
})(typeof window!=='undefined'?window:globalThis);
