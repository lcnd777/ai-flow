/* AI Flow — cœur commun (popup, pages, widget, arrière-plan). Aucun accès réseau.
 * L'état principal n'est écrit que par l'arrière-plan (file d'attente unique). */
(function(root){
  'use strict';
  const PL=root.AIFlowPlatforms;
  const KEY='ai_flow_state_v1';
  const KEYS={history:'ai_flow_history_v2',diag:'ai_flow_diagnostics_v1',auto:'ai_flow_auto_refresh_v1',resume:'ai_flow_resume_v1',
    resumeLast:'ai_flow_resume_last_v1',drafts:'ai_flow_drafts_v1',toast:'ai_flow_toast_v1',seed:'ai_flow_transfer_seed_v1',
    notify:'ai_flow_notify_v1',awake:'ai_flow_awake_v1',dismiss:'ai_flow_resume_dismissed_v1'};
  const api=typeof browser!=='undefined'?browser:typeof chrome!=='undefined'?chrome:null;
  const METRICS=PL.METRICS;
  const FRESH_MS=15*60000,LATE_MS=5*60000,DAY=86400000;
  const WARN=80,CRIT=95,LIMIT=99.5,APPROACH=90;
  const validPercent=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100;
  const BOOL_SETTINGS={focusMode:true,widgetEnabled:true,resumePrompt:false,awakeEnabled:false,
    notifyApproaching:true,notifyReached:true,notifyReset:true,systemNotifications:false};
  const defaults=()=>({metrics:{},history:{},settings:{...BOOL_SETTINGS,platformOrder:PL.ids(),
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
        if(Object.hasOwn(BOOL_SETTINGS,k)){if(typeof v==='boolean')state.settings[k]=v;}
        else if(k==='platformOrder')state.settings.platformOrder=cleanOrder(v);
        else if(k==='platformHidden')state.settings.platformHidden=cleanHidden(v);
      }
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
    return {platform,level:lvl,ids,fresh,worstId,worst:worstId?state.metrics[worstId].percent:null,updatedAt,
      partial:p.support!=='none'&&fresh.length>0&&p.primary.some(id=>!fresh.includes(id)),
      limitReached:limited.length>0,reopenAt:limited.length&&resets.every(Boolean)?Math.max(...resets):null};
  }
  function visiblePlatforms(state){
    return cleanOrder(state.settings.platformOrder).filter(id=>!state.settings.platformHidden[id]);
  }

  // ---------- Autonomie estimée (historique local, jamais présentée comme officielle) ----------
  function pace(state,id,now=Date.now()){
    const m=state.metrics[id];
    if(!m||isStale(m,id,now))return null;
    const h=(state.history[id]||[]).filter(p=>p.ts<=now&&now-p.ts<=2*3600000&&(!!p.resetAt===!!m.resetAt)&&(!m.resetAt||Math.abs(p.resetAt-m.resetAt)<=2*60000)).sort((a,b)=>a.ts-b.ts);
    if(h.length<3||now-h.at(-1).ts>FRESH_MS)return null;
    const first=h[0],last=h.at(-1),hours=(last.ts-first.ts)/3600000;
    if(hours<.25||last.percent<=first.percent||h.some((p,i)=>i&&(p.percent<h[i-1].percent||p.ts<=h[i-1].ts)))return null;
    const perHour=(last.percent-first.percent)/hours;
    if(perHour<=0||perHour>600)return null;
    const rates=h.slice(1).map((p,i)=>(p.percent-h[i].percent)/((p.ts-h[i].ts)/3600000));
    const spread=Math.sqrt(rates.reduce((s,x)=>s+(x-perHour)**2,0)/rates.length)/perHour;
    return {perHour,spread,observations:h.length,spanMinutes:Math.round(hours*60)};
  }
  const roundMin=n=>n<60?Math.max(5,Math.round(n/5)*5):Math.round(n/15)*15;
  function autonomy(state,id,now=Date.now()){
    const m=state.metrics[id],p=pace(state,id,now);
    if(!p||m.percent>=LIMIT)return null;
    const left=100-m.percent,minutes=left/p.perHour*60;
    const s=Math.min(.6,Math.max(.15,p.spread));
    const low=left/(p.perHour*(1+s))*60,high=left/(p.perHour*(1-s))*60;
    const untilReset=m.resetAt?(m.resetAt-now)/60000:Infinity;
    if(low>untilReset)return {id,beyondReset:true,minutes:null,low:null,high:null,observations:p.observations};
    if(minutes>24*60)return null;
    return {id,beyondReset:false,minutes:roundMin(minutes),low:roundMin(low),high:roundMin(Math.min(high,untilReset)),observations:p.observations};
  }
  function platformAutonomy(state,platform,now=Date.now()){
    const list=metricIds(state,platform).map(id=>autonomy(state,id,now)).filter(Boolean);
    const timed=list.filter(a=>!a.beyondReset).sort((a,b)=>a.minutes-b.minutes);
    return timed[0]||list[0]||null;
  }
  function fmtDuration(min){
    if(min<60)return `${min} min`;const h=Math.floor(min/60),r=min%60;return r?`${h} h ${String(r).padStart(2,'0')}`:`${h} h`;
  }
  function autonomyText(a){
    if(!a)return '';
    if(a.beyondReset)return 'Au rythme actuel, la limite ne devrait pas être atteinte avant le reset.';
    const range=a.high>a.low?` (${fmtDuration(a.low)} à ${fmtDuration(a.high)})`:'';
    return `À ton rythme actuel, limite possible dans ~${fmtDuration(a.minutes)}${range}.`;
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
      }else if(m.percent>=APPROACH&&!memo.sent[key+'|approaching']&&!memo.sent[key+'|reached']){
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
  const HANDOFF_FIELDS=[['goal','Objectif'],['context','Contexte du projet'],['decisions','Décisions déjà prises'],['constraints','Contraintes importantes'],['done','Déjà fait'],['next','Prochaines actions'],['excerpt','Extrait utile de la conversation']];
  function buildHandoff(f,sourceName,targetName){
    const parts=[];
    const intro=`Je reprends avec toi un travail commencé${sourceName?` sur ${sourceName}`:''}. Voici le contexte utile pour continuer sans repartir de zéro.`;
    for(const [k,label] of HANDOFF_FIELDS){
      const v=typeof f?.[k]==='string'?f[k].trim():'';
      if(v)parts.push(`## ${label}\n${v}`);
    }
    if(!parts.length)return '';
    return `${intro}\n\n${parts.join('\n\n')}\n\nConfirme d’abord en une phrase ce que tu as compris, puis attaque la prochaine action.`;
  }

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
  const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  root.AIFlow={KEY,KEYS,METRICS,PLATFORMS:PL.PLATFORMS,platform:PL.get,api,THRESHOLDS:{WARN,CRIT,LIMIT,APPROACH},FRESH_MS,LATE_MS,
    clean,defaults,reduce,getState,request,saveSettings,sanitizeReadings,isStale,level,metricIds,platformStatus,visiblePlatforms,
    pace,autonomy,platformAutonomy,autonomyText,fmtDuration,smartSwitch,notificationEvents,describeEvents,
    HANDOFF_FIELDS,buildHandoff,caffeinateCommand,AWAKE_GRACE:10*60000,formatReset,updatedText,clock,dayClock,escapeHTML,cleanOrder};
})(typeof window!=='undefined'?window:globalThis);
