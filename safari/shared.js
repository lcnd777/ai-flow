/* AI Flow — cœur commun (popup, pages, widget, arrière-plan). Aucun accès réseau.
 * L'état principal n'est écrit que par l'arrière-plan (file d'attente unique). */
(function(root){
  'use strict';
  const PL=root.AIFlowPlatforms;
  const KEY='ai_flow_state_v1';
  const KEYS={history:'ai_flow_history_v2',diag:'ai_flow_diagnostics_v1',auto:'ai_flow_auto_refresh_v1',resume:'ai_flow_resume_v1',
    resumeLast:'ai_flow_resume_last_v1',drafts:'ai_flow_drafts_v1',toast:'ai_flow_toast_v1',seed:'ai_flow_transfer_seed_v1',
    notify:'ai_flow_notify_v1',awake:'ai_flow_awake_v1',dismiss:'ai_flow_resume_dismissed_v1',capture:'ai_flow_capture_v1',flows:'ai_flow_flows_v1',flowsQuarantine:'ai_flow_flows_quarantine_v1'};
  const api=typeof browser!=='undefined'?browser:typeof chrome!=='undefined'?chrome:null;
  const METRICS=PL.METRICS;
  const FRESH_MS=15*60000,LATE_MS=5*60000,DAY=86400000;
  const WARN=80,CRIT=95,LIMIT=99.5,APPROACH=90;
  const validPercent=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100;
  const BOOL_SETTINGS={focusMode:true,widgetEnabled:true,resumePrompt:false,awakeEnabled:false,
    notifyApproaching:true,notifyReached:true,notifyReset:true,systemNotifications:false};
  // Awake : 'catchup' = rattrapage au réveil (aucune action), 'wake' = réveil programmé du Mac, 'stay' = rester éveillé.
  const AWAKE_MODES=['catchup','wake','stay'];
  const defaults=()=>({metrics:{},history:{},settings:{...BOOL_SETTINGS,awakeMode:'catchup',alertThreshold:90,platformOrder:PL.ids(),
    platformHidden:Object.fromEntries(PL.PLATFORMS.filter(p=>p.defaultHidden).map(p=>[p.id,true]))},hudPositions:{}});

  function cleanOrder(list){
    const known=PL.ids(),out=[];
    for(const id of Array.isArray(list)?list:[])if(known.includes(id)&&!out.includes(id))out.push(id);
    for(const id of known)if(!out.includes(id))out.push(id);
    return out;
  }
  function cleanHidden(obj){
    const out={};
    if(obj&&typeof obj==='object')for(const [id,v] of Object.entries(obj))if(PL.get(id)&&v===true)out[id]=true;
    return out;
  }
  function cleanDetail(d){return typeof d==='string'&&d.trim()?d.trim().slice(0,90):null;}
  function clean(raw){
    const s=raw&&typeof raw==='object'?raw:{},d=defaults(),settings={...d.settings};
    for(const k of Object.keys(BOOL_SETTINGS))if(typeof s.settings?.[k]==='boolean')settings[k]=s.settings[k];
    if(AWAKE_MODES.includes(s.settings?.awakeMode))settings.awakeMode=s.settings.awakeMode;
    else if(s.settings?.awakeEnabled===true)settings.awakeMode='stay';
    settings.awakeEnabled=settings.awakeMode==='stay';
    if(Number.isFinite(s.settings?.alertThreshold))settings.alertThreshold=Math.max(50,Math.min(99,Math.round(s.settings.alertThreshold)));
    if(s.settings?.platformOrder)settings.platformOrder=cleanOrder(s.settings.platformOrder);
    if(s.settings?.platformHidden)settings.platformHidden=cleanHidden(s.settings.platformHidden);
    const out={...d,settings,hudPositions:{}};
    for(const [k,v] of Object.entries(s.hudPositions||{}))if(PL.get(k)&&Number.isFinite(v?.right)&&Number.isFinite(v?.bottom))out.hudPositions[k]={right:v.right,bottom:v.bottom};
    for(const id of Object.keys(METRICS)){
      const m=s.metrics?.[id];
      if(m&&validPercent(m.percent)&&Number.isFinite(m.observedAt)&&m.source==='observed'){
        out.metrics[id]={percent:m.percent,source:'observed',observedAt:m.observedAt,resetAt:Number.isFinite(m.resetAt)?m.resetAt:null,detail:cleanDetail(m.detail)};
        out.history[id]=(Array.isArray(s.history?.[id])?s.history[id]:[]).filter(p=>validPercent(p?.percent)&&Number.isFinite(p.ts)).slice(-300)
          .map(p=>({ts:p.ts,percent:p.percent,resetAt:Number.isFinite(p.resetAt)?p.resetAt:null}));
      }
    }
    return out;
  }
  async function getState(){const v=await api.storage.local.get(KEY);return clean(v?.[KEY]);}
  async function request(op,payload,opts={}){
    const ms=opts.timeout||12000;let timer;
    const late=new Promise((_,rej)=>{timer=setTimeout(()=>rej(new Error('AI Flow ne répond pas. Recharge la page ; si ça persiste, quitte et relance Safari.')),ms);});
    let response;
    try{response=await Promise.race([api.runtime.sendMessage({type:'AI_FLOW',op,payload}),late]);}
    finally{clearTimeout(timer);}
    if(!response?.ok)throw new Error(response?.error||'AI Flow indisponible. Recharge cette page.');
    return response.value;
  }
  const saveSettings=patch=>request('settings',patch);

  // ---------- Relevés ----------
  function sanitizeReadings(platform,list,now=Date.now()){
    if(!Array.isArray(list))return [];
    const seen=new Set(),out=[];
    for(const r of list.slice(0,8)){
      if(!r||METRICS[r.id]?.platform!==platform||seen.has(r.id)||!validPercent(r.percent))continue;
      const resetAt=Number.isFinite(r.resetAt)&&r.resetAt>now&&r.resetAt<=now+32*DAY?r.resetAt:null;
      seen.add(r.id);out.push({id:r.id,percent:r.percent,resetAt,detail:cleanDetail(r.detail),source:'observed'});
    }
    return out;
  }
  function applyMetric(state,r,now){
    const old=state.metrics[r.id];
    let history=(state.history[r.id]||[]).filter(p=>p.ts<=now&&now-p.ts<=2*3600000);
    const resetChanged=old&&(!!old.resetAt!==!!r.resetAt||(old.resetAt&&Math.abs(old.resetAt-r.resetAt)>2*60000));
    if(old&&(r.percent<old.percent||resetChanged||(old.resetAt&&old.resetAt<=now)))history=[];
    const last=history.at(-1);
    if(!last||now-last.ts>=60000)history.push({ts:now,percent:r.percent,resetAt:r.resetAt});
    state.metrics[r.id]={percent:r.percent,source:'observed',observedAt:now,resetAt:r.resetAt,detail:r.detail||null};
    state.history[r.id]=history.slice(-300);
    return state.metrics[r.id];
  }
  function clearPlatform(state,platform){
    for(const id of Object.keys(state.metrics))if(METRICS[id]?.platform===platform){delete state.metrics[id];delete state.history[id];}
  }
  // Réducteur pur : l'arrière-plan sérialise lecture / réduction / écriture.
  function reduce(state,op,payload,now=Date.now()){
    if(op==='metrics'){
      const platform=payload?.platform,readings=sanitizeReadings(platform,payload?.readings,now);
      if(!readings.length)throw new Error('Aucun quota valide');
      return readings.map(r=>applyMetric(state,r,now));
    }
    if(op==='settings'){
      for(const [k,v] of Object.entries(payload||{})){
        if(k==='awakeEnabled'){if(typeof v==='boolean')state.settings.awakeMode=v?'stay':'catchup';}
        else if(k==='awakeMode'){if(!AWAKE_MODES.includes(v))throw new Error('Mode Awake inconnu');state.settings.awakeMode=v;}
        else if(k==='alertThreshold'){if(!Number.isFinite(v))throw new Error('Seuil non valide');state.settings.alertThreshold=Math.max(50,Math.min(99,Math.round(v)));}
        else if(Object.hasOwn(BOOL_SETTINGS,k)){if(typeof v==='boolean')state.settings[k]=v;}
        else if(k==='platformOrder')state.settings.platformOrder=cleanOrder(v);
        else if(k==='platformHidden')state.settings.platformHidden=cleanHidden(v);
      }
      state.settings.awakeEnabled=state.settings.awakeMode==='stay';
      return state.settings;
    }
    if(op==='clearPlatform'){if(!PL.get(payload?.platform))throw new Error('Plateforme inconnue');clearPlatform(state,payload.platform);return true;}
    if(op==='clear'){state.metrics={};state.history={};return true;}
    if(op==='position'){
      if(!PL.get(payload?.site)||!Number.isFinite(payload.position?.right)||!Number.isFinite(payload.position?.bottom))throw new Error('Position non valide');
      state.hudPositions[payload.site]={right:Math.max(6,Math.min(10000,Math.round(payload.position.right))),bottom:Math.max(6,Math.min(10000,Math.round(payload.position.bottom)))};
      return true;
    }
    throw new Error('Commande inconnue');
  }

  // ---------- Lecture de l'état ----------
  function isStale(m,id,now=Date.now()){
    if(!m||!validPercent(m.percent)||!Number.isFinite(m.observedAt))return true;
    return m.observedAt>now+60000||now-m.observedAt>FRESH_MS||!!(m.resetAt&&m.resetAt<=now);
  }
  function level(m,id,now=Date.now()){
    if(isStale(m,id,now))return 'unknown';
    return m.percent>=CRIT?'critical':m.percent>=WARN?'warning':'healthy';
  }
  const RANK={critical:3,warning:2,healthy:1,unknown:0};
  function metricIds(state,platform){
    const p=PL.get(platform);if(!p)return [];
    return [...new Set([...p.primary,...Object.keys(state.metrics).filter(id=>METRICS[id]?.platform===platform)])];
  }
  function platformStatus(state,platform,now=Date.now()){
    const p=PL.get(platform),ids=metricIds(state,platform);
    const fresh=ids.filter(id=>!isStale(state.metrics[id],id,now));
    const levels=fresh.map(id=>level(state.metrics[id],id,now));
    const lvl=p.support==='none'?'unmeasured':!fresh.length?'unknown':levels.sort((a,b)=>RANK[b]-RANK[a])[0];
    const worstId=fresh.slice().sort((a,b)=>state.metrics[b].percent-state.metrics[a].percent)[0]||null;
    const updatedAt=fresh.length?Math.max(...fresh.map(id=>state.metrics[id].observedAt)):null;
    const limited=fresh.filter(id=>state.metrics[id].percent>=LIMIT);
    const resets=limited.map(id=>state.metrics[id].resetAt);
    const reopenAt=limited.length&&resets.every(Boolean)?Math.max(...resets):null;
    const radar=p.support==='none'?'unmeasured':limited.length?(reopenAt&&reopenAt-now<=30*60000?'reset-soon':'reached'):!fresh.length?(ids.some(id=>state.metrics[id])?'stale':'unknown'):lvl==='healthy'?'available':'near';
    return {platform,level:lvl,radar,ids,fresh,worstId,worst:worstId?state.metrics[worstId].percent:null,updatedAt,
      partial:p.support!=='none'&&fresh.length>0&&p.primary.some(id=>!fresh.includes(id)),
      limitReached:limited.length>0,reopenAt:limited.length&&resets.every(Boolean)?Math.max(...resets):null};
  }
  function visiblePlatforms(state){
    return cleanOrder(state.settings.platformOrder).filter(id=>!state.settings.platformHidden[id]);
  }

  // ---------- AI Runway : prévision prudente, jamais présentée comme officielle ----------
  // Durée de la fenêtre de chaque limite (sert à savoir où l'on en est dans la période).
  function windowMs(id){return /\.session$/.test(id)?5*3600000:7*DAY;}
  // Rythme récent mesuré dans la fenêtre courante (même reset), sur 3 h au plus.
  function recentPace(state,id,now){
    const m=state.metrics[id];
    const h=(state.history[id]||[]).filter(p=>p.ts<=now&&now-p.ts<=3*3600000&&(!!p.resetAt===!!m.resetAt)&&(!m.resetAt||Math.abs(p.resetAt-m.resetAt)<=10*60000)).sort((a,b)=>a.ts-b.ts);
    if(h.length<3)return {ok:false,why:'insufficient'};
    const first=h[0],last=h.at(-1),hours=(last.ts-first.ts)/3600000;
    if(hours<20/60||now-last.ts>FRESH_MS)return {ok:false,why:'insufficient'};
    if(h.some((p,i)=>i&&p.percent<h[i-1].percent))return {ok:false,why:'insufficient'};
    // Activité récente : hausse dans les 45 dernières minutes ?
    const recent=h.filter(p=>now-p.ts<=45*60000);
    const active=recent.length>=2&&recent.at(-1).percent>recent[0].percent;
    if(last.percent<=first.percent||!active)return {ok:true,idle:true,observations:h.length,spanMinutes:Math.round(hours*60)};
    // Le rythme de la dernière heure si elle est bien couverte, sinon celui de toute l'observation.
    const lastHour=h.filter(p=>now-p.ts<=60*60000);
    const base=lastHour.length>=3&&(lastHour.at(-1).ts-lastHour[0].ts)>=15*60000?lastHour:h;
    const span=(base.at(-1).ts-base[0].ts)/3600000;
    const perHour=(base.at(-1).percent-base[0].percent)/span;
    if(!(perHour>0)||perHour>200)return {ok:false,why:'extreme'};
    if(h.some((p,i)=>i&&p.percent-h[i-1].percent>50))return {ok:false,why:'extreme'};
    // Régularité : le rythme de la 1re moitié de l'observation est-il cohérent avec celui de la 2de ?
    const mid=first.ts+(last.ts-first.ts)/2,at=t=>{let v=first.percent;for(const p of h)if(p.ts<=t)v=p.percent;return v;};
    const r1=at(mid)-first.percent,r2=last.percent-at(mid),mean=(r1+r2)/2;
    const gapRatio=mean>0?Math.abs(r1-r2)/(2*mean):1;
    const confidence=h.length>=6&&hours>=.75&&gapRatio<.35?'high':h.length>=4&&hours>=.4&&gapRatio<.6?'medium':'low';
    return {ok:true,idle:false,perHour,confidence,observations:h.length,spanMinutes:Math.round(hours*60)};
  }
  /* Résultat : kind =
     'nodata'        aucun relevé récent (rien à afficher)
     'reached'       limite atteinte (resetAt = réouverture)
     'reset-soon'    réinitialisation dans moins de 15 min
     'insufficient'  historique insuffisant : aucune estimation chiffrée
     'idle'          aucune consommation récente : pas de risque immédiat
     'safe'          au rythme actuel, pas de limite avant le reset (margin = % restant estimé au reset)
     'risk'          limite probable avant le reset, vers hitAt
     'risk-uncertain' risque avant le reset, mais prévision peu fiable : pas d'heure affichée */
  function runway(state,id,now=Date.now()){
    const m=state.metrics[id];
    if(!m||isStale(m,id,now))return {id,kind:'nodata'};
    if(m.percent>=LIMIT)return {id,kind:'reached',resetAt:m.resetAt};
    const W=windowMs(id),resetAt=m.resetAt;
    if(resetAt&&resetAt-now<=15*60000)return {id,kind:'reset-soon',resetAt};
    if(W>=DAY){
      // Limite longue : rythme moyen depuis le début de la période (nuits et pauses comprises).
      if(!resetAt)return {id,kind:'insufficient'};
      const start=resetAt-W,frac=(now-start)/W;
      if(frac<.1||frac>1)return {id,kind:'insufficient'};
      if(m.percent<=0)return {id,kind:'idle'};
      const atReset=m.percent/frac,confidence=frac>=.3?'medium':'low';
      if(atReset<100){
        const margin=Math.max(0,Math.round(100-atReset));
        return confidence==='low'&&atReset>70?{id,kind:'insufficient'}:{id,kind:'safe',resetAt,margin,confidence,basis:'average'};
      }
      const hitAt=start+(now-start)*(100/m.percent);
      if(confidence==='low')return {id,kind:'risk-uncertain',resetAt,basis:'average'};
      return {id,kind:'risk',hitAt,resetAt,confidence,basis:'average'};
    }
    const p=recentPace(state,id,now);
    if(!p.ok)return {id,kind:'insufficient',why:p.why};
    if(p.idle)return {id,kind:'idle',observations:p.observations};
    const minutes=(100-m.percent)/p.perHour*60,hitAt=now+minutes*60000;
    if(resetAt&&hitAt>=resetAt){
      const margin=Math.max(0,Math.round(100-(m.percent+p.perHour*(resetAt-now)/3600000)));
      return p.confidence==='low'?{id,kind:'insufficient'}:{id,kind:'safe',resetAt,margin,confidence:p.confidence,basis:'recent'};
    }
    if(!resetAt&&minutes>6*60)return {id,kind:'insufficient'};
    if(p.confidence==='low')return {id,kind:'risk-uncertain',resetAt,basis:'recent'};
    return {id,kind:'risk',hitAt,resetAt,confidence:p.confidence,basis:'recent'};
  }
  // Quota Intelligence : la limite qui bloquera en premier.
  const RUN_RANK={reached:0,risk:1,'risk-uncertain':2,'reset-soon':3,safe:4,idle:5,insufficient:6,nodata:7};
  function platformRunway(state,platform,now=Date.now()){
    const list=metricIds(state,platform).map(id=>runway(state,id,now));
    if(!list.length)return null;
    list.sort((a,b)=>RUN_RANK[a.kind]-RUN_RANK[b.kind]||(a.kind==='risk'?a.hitAt-b.hitAt:0)||(a.kind==='reached'?(b.resetAt||0)-(a.resetAt||0):0)||(a.kind==='safe'?a.margin-b.margin:0));
    const top=list[0];
    // « Sûr » seulement si toutes les limites mesurées le sont ; sinon une donnée manque.
    if(top.kind==='safe'&&list.some(r=>r.kind==='insufficient'))return {...top,partial:true,all:list};
    return {...top,all:list};
  }
  const CONF={high:'confiance élevée',medium:'confiance moyenne',low:'confiance faible'};
  function runwayText(r,now=Date.now(),opts={}){
    if(!r)return '';
    const name=METRICS[r.id]?.short||'';
    switch(r.kind){
      case 'reached':return `Limite atteinte (${name})${r.resetAt?` · réouverture ${dayClock(r.resetAt,now)}`:''}.`;
      case 'reset-soon':return `${name} : réinitialisation ${dayClock(r.resetAt,now)}.`;
      case 'risk':return `À ce rythme, tu risques d’atteindre la limite ${name} vers ${dayClock(r.hitAt,now)}, avant sa réinitialisation (${dayClock(r.resetAt,now)}). ${CONF[r.confidence][0].toUpperCase()+CONF[r.confidence].slice(1)}.`;
      case 'risk-uncertain':return `Risque d’atteindre la limite ${name} avant sa réinitialisation (prévision peu fiable).`;
      case 'safe':return `À ton rythme ${r.basis==='average'?'de cette semaine':'actuel'}, la limite ${name} ne devrait pas être atteinte avant sa réinitialisation (${dayClock(r.resetAt,now)})${r.margin>=5?` · marge ≈ ${r.margin} %`:''}.`;
      case 'idle':return opts.verbose?`${name} : aucune consommation récente, pas de risque immédiat.`:'';
      case 'insufficient':return opts.verbose?`${name} : prévision indisponible, historique insuffisant.`:'';
      default:return '';
    }
  }
  // Ce qui mérite d'être affiché dans le popup / la pastille (information utile seulement).
  function runwayWorthShowing(r){return !!r&&(['reached','risk','risk-uncertain','reset-soon'].includes(r.kind)||(r.kind==='safe'&&!r.partial&&r.confidence!=='low'));}
  function fmtDuration(min){
    if(min<60)return `${min} min`;const h=Math.floor(min/60),r=min%60;return r?`${h} h ${String(r).padStart(2,'0')}`:`${h} h`;
  }

  // ---------- Historique local (7 jours) : mesures réelles uniquement ----------
  // Point = [horodatage, % utilisé, reset annoncé (ms, 0 si inconnu)]. Les anciens points [t,p] restent valides.
  function cleanHistory(h,now=Date.now()){
    const out={series:{},resets:[],limits:[]};
    if(!h||typeof h!=='object')return out;
    for(const [id,pts] of Object.entries(h.series||{})){
      if(!METRICS[id]||!Array.isArray(pts))continue;
      const list=pts.filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&validPercent(p[1])&&p[0]<=now+60000&&now-p[0]<=7*DAY)
        .map(p=>[p[0],p[1],Number.isFinite(p[2])?p[2]:0]);
      if(list.length)out.series[id]=list.slice(-4000);
    }
    out.resets=(Array.isArray(h.resets)?h.resets:[]).filter(r=>METRICS[r?.id]&&Number.isFinite(r.t)&&now-r.t<=7*DAY).slice(-200);
    out.limits=(Array.isArray(h.limits)?h.limits:[]).filter(l=>METRICS[l?.id]&&Number.isFinite(l.from)&&(l.to===null||Number.isFinite(l.to))&&now-(l.to??now)<=7*DAY).slice(-200);
    return out;
  }
  // Un reset a eu lieu entre deux points : baisse nette, ou date de reset annoncée repoussée.
  const isResetBetween=(a,b)=>b[1]+10<=a[1]||(a[2]&&b[2]&&b[2]-a[2]>10*60000&&b[1]<a[1]+0.01)||(a[2]&&b[0]>=a[2]&&b[1]<a[1]);
  function recordHistory(raw,readings,now=Date.now()){
    const h=cleanHistory(raw,now);
    for(const r of readings){
      if(!METRICS[r.id]||!validPercent(r.percent))continue;
      const s=h.series[r.id]||(h.series[r.id]=[]),last=s.at(-1),pt=[now,r.percent,Number.isFinite(r.resetAt)?r.resetAt:0];
      const reset=last&&isResetBetween(last,pt);
      if(reset)h.resets.push({id:r.id,t:now,from:last[1],to:r.percent});
      if(!last||reset||last[1]!==r.percent||now-last[0]>=10*60000)s.push(pt);
      const open=h.limits.find(l=>l.id===r.id&&l.to===null);
      if(r.percent>=LIMIT&&!open)h.limits.push({id:r.id,from:now,to:null});
      if(r.percent<LIMIT&&open)open.to=now;
      if(s.length>4000)s.splice(0,s.length-4000);
    }
    return h;
  }
  /* Consommation par tranche (heure ou jour), en % du quota.
     - hausse entre deux relevés proches (≤ 20 min) : mesure directe ;
     - hausse constatée après un trou de mesure (> 20 min) : attribuée à la tranche du relevé suivant et signalée ;
     - reset entre deux relevés : la valeur après le reset compte (le compteur repart de 0). */
  function consumption(points,from,to,bucket,maxGap=7*DAY){
    const n=Math.max(1,Math.ceil((to-from)/bucket));
    const out=Array.from({length:n},(_,i)=>({t:from+i*bucket,used:0,direct:0,attributed:0,measured:0,first:null,last:null,resets:0,lastAt:null}));
    const list=points.filter(p=>p[0]<=to).sort((a,b)=>a[0]-b[0]);
    for(let i=0;i<list.length;i++){
      const pt=list[i];if(pt[0]<from)continue;
      const b=out[Math.min(n-1,Math.floor((pt[0]-from)/bucket))];
      b.measured++;if(b.first===null)b.first=pt[1];b.last=pt[1];b.lastAt=pt[0];
      const prev=list[i-1];if(!prev)continue;
      const gap=pt[0]-prev[0];if(gap>maxGap)continue;
      let used=0;
      if(isResetBetween(prev,pt)){used=pt[1];b.resets++;}
      else if(pt[1]>prev[1])used=pt[1]-prev[1];
      if(gap<=20*60000)b.direct+=used;else b.attributed+=used;
    }
    for(const b of out){b.direct=Math.round(b.direct*10)/10;b.attributed=Math.round(b.attributed*10)/10;b.used=Math.round((b.direct+b.attributed)*10)/10;}
    return out;
  }
  // Une référence par plateforme pour toute la période. Les fenêtres se recouvrent :
  // ne jamais additionner les pourcentages session / semaine ni changer de base par barre.
  function platformConsumption(history,from,to,bucket){
    const series=history?.series||{};
    return PL.ids().map(id=>{
      const p=PL.get(id);
      const metric=p.primary.find(key=>(series[key]||[]).some(pt=>pt[0]>=from&&pt[0]<=to))||null;
      return {platform:id,name:p.name,color:p.color,metric,bars:consumption(metric?series[metric]:[],from,to,bucket)};
    });
  }
  // ---------- Smart Switch : ne recommande que ce qui est réellement connu ----------
  function smartSwitch(state,now=Date.now(),current=null){
    const visible=visiblePlatforms(state).filter(id=>PL.get(id).support!=='none'||PL.get(id).chat);
    const statuses=visible.map(id=>platformStatus(state,id,now));
    const pressured=statuses.filter(s=>s.level==='warning'||s.level==='critical');
    const relevant=current?pressured.filter(s=>s.platform===current):pressured;
    const others=statuses.filter(s=>s.platform!==current&&!relevant.some(r=>r.platform===s.platform));
    return {
      pressured:relevant,
      available:others.filter(s=>s.level==='healthy'&&!s.partial).sort((a,b)=>a.worst-b.worst),
      partial:others.filter(s=>s.level==='healthy'&&s.partial),
      unknown:others.filter(s=>s.level==='unknown'),
      unmeasured:others.filter(s=>s.level==='unmeasured')
    };
  }

  // ---------- Notifications (sans répétition) ----------
  function notificationEvents(rawMemo,state,now=Date.now()){
    const memo={sent:{},reached:{}};
    for(const [k,t] of Object.entries(rawMemo?.sent||{}))if(Number.isFinite(t)&&now-t<8*DAY)memo.sent[k]=t;
    for(const [k,v] of Object.entries(rawMemo?.reached||{}))if(METRICS[k]&&Number.isFinite(v?.at)&&now-v.at<8*DAY)memo.reached[k]=v;
    const events=[];
    for(const [id,m] of Object.entries(state.metrics)){
      if(isStale(m,id,now)||!METRICS[id])continue;
      const win=m.resetAt?Math.round(m.resetAt/600000):'x',key=id+'|'+win;
      const was=memo.reached[id];
      if(was&&m.percent<LIMIT&&m.observedAt>was.at&&(m.percent<=was.percent-20||(was.resetAt&&now>=was.resetAt-60000))){
        events.push({type:'reset',id,platform:METRICS[id].platform,percent:m.percent});delete memo.reached[id];
      }
      if(m.percent>=LIMIT){
        memo.reached[id]={at:now,percent:m.percent,resetAt:m.resetAt};
        if(!memo.sent[key+'|reached']){memo.sent[key+'|reached']=now;events.push({type:'reached',id,platform:METRICS[id].platform,percent:m.percent,resetAt:m.resetAt});}
      }else if(m.percent>=(state.settings.alertThreshold||APPROACH)&&!memo.sent[key+'|approaching']&&!memo.sent[key+'|reached']){
        memo.sent[key+'|approaching']=now;events.push({type:'approaching',id,platform:METRICS[id].platform,percent:m.percent,resetAt:m.resetAt});
      }
    }
    const allowed=events.filter(e=>state.settings[{approaching:'notifyApproaching',reached:'notifyReached',reset:'notifyReset'}[e.type]]!==false);
    return {events:allowed,memo};
  }
  function clock(ts){const d=new Date(ts);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
  function dayClock(ts,now=Date.now()){
    const d=new Date(ts),n=new Date(now);
    if(d.toDateString()===n.toDateString())return clock(ts);
    const t=new Date(now+DAY);if(d.toDateString()===t.toDateString())return 'demain '+clock(ts);
    return d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric'})+' '+clock(ts);
  }
  // Un message par plateforme et par type.
  function describeEvents(events,state,now=Date.now()){
    const groups=new Map();
    for(const e of events){const k=e.platform+'|'+e.type;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}
    const out=[];
    for(const [k,list] of groups){
      const [pid,type]=k.split('|'),p=PL.get(pid),names=list.map(e=>METRICS[e.id].short).join(', ');
      const top=list.slice().sort((a,b)=>b.percent-a.percent)[0];
      let title,body;
      if(type==='approaching'){
        title=`${p.name} approche de sa limite`;
        body=`${names} : ${Math.round(top.percent)} % utilisés.`+(top.resetAt?` Reset ${dayClock(top.resetAt,now)}.`:'');
        const sw=smartSwitch(state,now,pid);
        if(sw.available.length)body+=` Capacité connue : ${sw.available.slice(0,2).map(s=>PL.get(s.platform).name+' ('+Math.round(s.worst)+' %)').join(', ')}.`;
      }else if(type==='reached'){
        title=`${p.name} : limite atteinte`;
        const r=list.map(e=>e.resetAt).filter(Boolean);
        body=`${names}.`+(r.length?` Réouverture prévue ${dayClock(Math.max(...r),now)}.`:' Heure de réouverture non communiquée.');
      }else{
        title=`${p.name} est de nouveau disponible`;
        body=`${names} : ${Math.round(Math.min(...list.map(e=>e.percent)))} % utilisés (relevé confirmé).`;
      }
      out.push({id:pid+'-'+type+'-'+now,platform:pid,type,title,body,ts:now});
    }
    return out;
  }

  // ---------- Transfert de contexte ----------
  const HANDOFF_FIELDS=[['goal','Objectif initial'],['context','Contexte du projet'],['decisions','Décisions déjà prises'],['constraints','Contraintes importantes'],['done','Travail déjà réalisé'],['problems','Problèmes non résolus'],['next','Prochaines étapes'],['excerpt','Éléments indispensables (code, chiffres, liens)']];
  // Transcript ordonné, borné par un budget de caractères : 1er message (l'objectif) + derniers échanges.
  function buildTranscript(messages,budget=40000,names={}){
    const list=(Array.isArray(messages)?messages:[]).filter(m=>(m?.role==='user'||m?.role==='assistant')&&typeof m.text==='string'&&m.text.trim());
    if(!list.length)return {text:'',included:0,omitted:0,total:0};
    const who=r=>r==='user'?(names.user||'Moi'):(names.assistant||'Assistant');
    const cut=(t,n)=>t.length>n?t.slice(0,n)+`\n[… ${t.length-n} caractères tronqués …]`:t;
    const att=m=>Array.isArray(m.attachments)&&m.attachments.length?`\n[Pièce${m.attachments.length>1?'s':''} jointe${m.attachments.length>1?'s':''} non transférée${m.attachments.length>1?'s':''} : ${m.attachments.join(', ')}]`:'';
    const fmt=(m,n)=>`**${who(m.role)} :**\n${cut(m.text.trim(),n)}${att(m)}`;
    const per=Math.max(1500,Math.floor(budget/4));
    const first=fmt(list[0],Math.min(per,4000));let used=first.length;
    const tail=[];
    for(let i=list.length-1;i>0;i--){const f=fmt(list[i],per);if(used+f.length+2>budget&&tail.length)break;tail.unshift(f);used+=f.length+2;if(used>budget)break;}
    const omitted=list.length-1-tail.length;
    const parts=[first];if(omitted>0)parts.push(`[… ${omitted} message${omitted>1?'s':''} intermédiaire${omitted>1?'s':''} omis …]`);parts.push(...tail);
    return {text:parts.join('\n\n'),included:1+tail.length,omitted,total:list.length};
  }
  // Pré-remplissage prudent : objectif = 1re demande, prochaine action = dernière demande. Toujours modifiable.
  function prefillFromMessages(messages){
    const users=(messages||[]).filter(m=>m?.role==='user'&&m.text?.trim());
    const short=t=>{t=t.trim().replace(/\n{3,}/g,'\n\n');return t.length>600?t.slice(0,600)+'…':t;};
    return {goal:users[0]?short(users[0].text):'',next:users.length>1?short(users.at(-1).text):''};
  }
  /* Continuité intelligente, SANS IA : extraction structurée et déterministe à partir des messages.
     Chaque élément retenu cite la phrase d'origine (rien n'est reformulé ni inventé). Les contenus des
     conversations sont traités comme des données : ils ne déclenchent jamais d'action. */
  const RX={
    decision:/\b(on (garde|part sur|choisit|retient|utilise|reste sur|valide)|j[’']ai (choisi|décidé|tranché)|nous avons (choisi|décidé)|décid[ée]s?|décision|retenu[es]?|validé[es]?|c[’']est validé|ok pour|go pour|we(?:'ll| will)? (use|go with|keep)|decided|let'?s go with|we chose|agreed)\b/i,
    constraint:/\b(il faut|ne (doit|faut|dois) (pas|jamais)|ne pas|pas de|doit|doivent|obligatoire|impérati(f|vement)|interdit|contrainte|deadline|avant le|au plus tard|maximum|minimum|budget|uniquement|seulement|sans (utiliser|dépendance|frais)|must|must not|should not|do not|don'?t|only|never|required|limit(e|ation)?)\b/i,
    problem:/\b(erreur|error|bug|ne (fonctionne|marche) (pas|plus)|plante|crash|échou|failed|failing|exception|problème|issue|bloqu|n[’']apparaît pas|introuvable|cassé|broken|doesn'?t work|not working)\b/i,
    solved:/\b(résolu|corrigé|réglé|ça (marche|fonctionne)|c[’']est bon|fixed|solved|works now|tout est good)\b/i,
    done:/\b(voici|j[’']ai (ajouté|corrigé|créé|modifié|mis à jour|écrit|implémenté|terminé)|c[’']est fait|terminé|livré|implemented|added|fixed|created|updated|done)\b/i,
    next:/\b(prochaine[s]? (étape|action)s?|ensuite|à faire|reste à|next steps?|todo|then we|il reste)\b/i
  };
  // Limites de mot compatibles avec les accents (\b de JavaScript ignore « é », « è »…).
  for(const k of Object.keys(RX))RX[k]=new RegExp(RX[k].source.replace(/^\\b/,'(?<![\\p{L}\\p{N}])').replace(/\\b$/,'(?![\\p{L}\\p{N}])'),'iu');
  const sentences=t=>String(t||'').replace(/```[\s\S]*?```/g,' ').split(/(?<=[.!?])\s+|\n+/).map(x=>x.replace(/^[\s>*#\-–•\d.)]+/,'').trim()).filter(x=>x.length>=12&&x.length<=400);
  const clip=(t,n=220)=>t.length>n?t.slice(0,n-1)+'…':t;
  function pick(list,max){const out=[],seen=new Set();for(const x of list){const k=x.toLowerCase().slice(0,80);if(!seen.has(k)){seen.add(k);out.push(x);}if(out.length>=max)break;}return out;}
  function extractContinuity(messages,meta={}){
    const list=(Array.isArray(messages)?messages:[]).filter(m=>(m?.role==='user'||m?.role==='assistant')&&typeof m.text==='string'&&m.text.trim());
    const empty={fields:{},found:0,total:list.length};
    if(!list.length)return empty;
    const users=list.filter(m=>m.role==='user'),lastAssistant=[...list].reverse().find(m=>m.role==='assistant');
    const bullets=s2=>s2.map(x=>'- '+clip(x)).join('\n');
    const decisions=[],constraints=[],done=[],problems=[];
    list.forEach((m,i)=>{
      for(const x of sentences(m.text)){
        if(RX.decision.test(x))decisions.push(x);
        if(m.role==='user'&&RX.constraint.test(x))constraints.push(x);
        if(m.role==='assistant'&&RX.done.test(x))done.push(x);
        if(RX.problem.test(x)){
          // Problème non résolu : aucun message ultérieur n'annonce de résolution.
          const later=list.slice(i+1).some(n=>RX.solved.test(n.text));
          if(!later)problems.push(x);
        }
      }
    });
    // Prochaines étapes : la dernière demande, puis les listes « prochaines étapes » de la dernière réponse.
    const next=[];
    if(users.length>1)next.push('Dernière demande : '+clip(users.at(-1).text.trim().replace(/\s+/g,' '),400));
    if(lastAssistant){
      const lines=lastAssistant.text.split('\n'),start=lines.findIndex(l=>RX.next.test(l));
      if(start>=0)for(const l of lines.slice(start+1,start+12)){const t=l.replace(/^[\s*\-–•\d.)]+/,'').trim();if(/^[\s]*([*\-–•]|\d+[.)])\s+/.test(l)&&t)next.push(t);else if(next.length>1&&!t)break;}
    }
    // Éléments indispensables : derniers blocs de code et liens cités.
    const code=[];for(const m of [...list].reverse()){for(const c of m.text.match(/```[\s\S]*?```/g)||[]){if(code.length<2)code.unshift(c.length>4000?c.slice(0,4000)+'\n…```':c);}if(code.length>=2)break;}
    const links=pick([...new Set(list.flatMap(m=>m.text.match(/https?:\/\/[^\s)>\]"']+/g)||[]))].reverse(),8);
    const fields={
      goal:users[0]?clip(users[0].text.trim().replace(/\n{3,}/g,'\n\n'),700):'',
      context:[meta.title?`Conversation « ${meta.title} »`:'',meta.source?`sur ${meta.source}`:'',`${list.length} messages`].filter(Boolean).join(' ')+'.',
      decisions:bullets(pick(decisions.reverse(),8).reverse()),
      constraints:bullets(pick(constraints,8)),
      done:bullets(pick(done.reverse(),6).reverse()),
      problems:bullets(pick(problems.reverse(),5).reverse()),
      next:next.length?bullets(pick(next,8)):'',
      excerpt:[...code,links.length?'Liens cités :\n'+links.map(l=>'- '+l).join('\n'):''].filter(Boolean).join('\n\n')
    };
    for(const k of Object.keys(fields))fields[k]=fields[k].replace(/^- /gm,'- ').trim();
    const found=['decisions','constraints','done','problems','next','excerpt'].filter(k=>fields[k]).length;
    return {fields,found,total:list.length};
  }
  // Taille estimée d'un transfert et adéquation à la destination (ordre de grandeur, ~4 caractères par jeton).
  const DEST_LIMITS={claude:{ok:120000,max:200000},chatgpt:{ok:30000,max:100000}};
  function estimateTransfer(text,target){
    const chars=String(text||'').length,tokens=Math.ceil(chars/4),l=DEST_LIMITS[target]||DEST_LIMITS.chatgpt;
    const level=chars<=l.ok?'ok':chars<=l.max?'large':'too-large';
    return {chars,tokens,level};
  }
  function buildHandoff(f,sourceName,targetName,transcript=''){
    const parts=[];
    const intro=`Je reprends avec toi un travail commencé${sourceName?` sur ${sourceName}`:''}. Voici le contexte utile pour continuer sans repartir de zéro.`;
    for(const [k,label] of HANDOFF_FIELDS){
      const v=typeof f?.[k]==='string'?f[k].trim():'';
      if(v)parts.push(`## ${label}\n${v}`);
    }
    if(transcript&&transcript.trim())parts.push(`## Derniers échanges (extraits de la conversation d’origine)\n${transcript.trim()}`);
    if(!parts.length)return '';
    return `${intro}\n\n${parts.join('\n\n')}\n\nConfirme d’abord en une phrase ce que tu as compris, puis attaque la prochaine action.`;
  }
  // Points de reprise (Flow Checkpoints) et travaux interrompus (Flow Recovery) : une seule liste locale.
  function cleanCheckpoints(list){
    const out=[];
    for(const d of Array.isArray(list)?list:[]){
      if(!d||typeof d!=='object'||typeof d.id!=='string')continue;
      const conv=PL.conversationOf(d.url||'');
      out.push({id:d.id.slice(0,40),kind:d.kind==='interruption'?'interruption':'checkpoint',title:String(d.title||'Sans titre').slice(0,120),
        source:PL.get(d.source)?d.source:conv?.platform||null,platform:PL.get(d.platform)?d.platform:null,url:conv?conv.url:null,target:PL.get(d.target)?d.target:null,
        fields:d.fields&&typeof d.fields==='object'?d.fields:{},preview:typeof d.preview==='string'?d.preview.slice(0,200000):'',
        createdAt:Number.isFinite(d.createdAt)?d.createdAt:Date.now(),updatedAt:Number.isFinite(d.updatedAt)?d.updatedAt:(Number.isFinite(d.createdAt)?d.createdAt:Date.now()),
        resetAt:Number.isFinite(d.resetAt)?d.resetAt:null,status:['open','ready','waiting','done'].includes(d.status)?d.status:'open',
        destUrl:PL.conversationOf(d.destUrl||'')?.url||null,interrupted:d.kind==='interruption'||d.interrupted===true,
        syncedAt:Number.isFinite(d.syncedAt)?d.syncedAt:null});
    }
    return out.sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,50);
  }


  // Flow Timeline : statut lisible et ordre (reprises prêtes d'abord, puis interrompues, puis récentes).
  function timelineItems(list,state,now=Date.now()){
    return cleanCheckpoints(list).filter(d=>d.status!=='done').map(d=>{
      const pid=d.platform||d.source,st=pid&&PL.get(pid)?platformStatus(state,pid==='chatgpt'?'codex':pid,now):null;
      const ready=d.interrupted&&(d.status==='ready'||(st&&st.fresh.length>0&&!st.limitReached));
      const label=d.interrupted?(ready?`${PL.get(pid)?.name||''} de nouveau disponible`:`En attente : limite ${PL.get(pid)?.name||''}${d.resetAt&&d.resetAt>now?` · rouvre ${dayClock(d.resetAt,now)}`:''}`):d.destUrl?`Poursuivi sur ${PL.get(d.target)?.name||'une autre IA'}`:'Point de reprise';
      return {...d,ready,label,rank:ready?0:d.interrupted?1:2};
    }).sort((a,b)=>a.rank-b.rank||b.updatedAt-a.updatedAt);
  }
  // Résumé pour la barre de menus macOS : uniquement des chiffres lus, leurs dates et l'état ; aucun contenu.
  function formatReset(resetAt,now=Date.now()){
    if(!resetAt)return 'Reset non communiqué';const min=Math.ceil((resetAt-now)/60000);
    if(min<=0)return 'Reset à confirmer';if(min<60)return `Reset dans ${min} min`;
    if(min<1440)return `Reset dans ${Math.floor(min/60)} h ${String(min%60).padStart(2,'0')}`;
    return 'Reset '+dayClock(resetAt,now);
  }
  function updatedText(ts,now=Date.now()){
    if(!ts)return '';const age=now-ts;
    return age>LATE_MS?`Actualisé il y a ${Math.floor(age/60000)} min`:`Actualisé à ${clock(ts)}`;
  }
  // Sans app Mac : « caffeinate -i » (intégré à macOS) empêche la veille d'inactivité jusqu'à l'échéance.
  function caffeinateCommand(until,now=Date.now()){const s=Math.ceil((until-now)/1000);return s>0?`caffeinate -i -t ${s}`:'';}
  // Réveil programmé (outil Apple pmset, mot de passe administrateur) : heure locale du Mac, format MM/jj/aa HH:MM:SS.
  function pmsetCommand(at){
    const d=new Date(at),p=n=>String(n).padStart(2,'0');
    return `sudo pmset schedule wake "${p(d.getMonth()+1)}/${p(d.getDate())}/${p(d.getFullYear()%100)} ${p(d.getHours())}:${p(d.getMinutes())}:00"`;
  }
  const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  root.AIFlow={KEY,KEYS,METRICS,PLATFORMS:PL.PLATFORMS,platform:PL.get,api,THRESHOLDS:{WARN,CRIT,LIMIT,APPROACH},FRESH_MS,LATE_MS,
    clean,defaults,reduce,getState,request,saveSettings,sanitizeReadings,isStale,level,metricIds,platformStatus,visiblePlatforms,
    runway,platformRunway,runwayText,runwayWorthShowing,windowMs,fmtDuration,cleanHistory,recordHistory,consumption,platformConsumption,smartSwitch,notificationEvents,describeEvents,
    HANDOFF_FIELDS,buildHandoff,buildTranscript,prefillFromMessages,extractContinuity,estimateTransfer,cleanCheckpoints,timelineItems,CONTINUITY_RX:RX,splitSentences:sentences,caffeinateCommand,pmsetCommand,AWAKE_MODES,AWAKE_GRACE:10*60000,formatReset,updatedText,clock,dayClock,escapeHTML,cleanOrder};
})(typeof window!=='undefined'?window:globalThis);
