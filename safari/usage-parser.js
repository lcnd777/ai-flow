/* Bounded, fail-closed DOM adapter. No API calls, no request interception. */
(function(root){
  'use strict';
  const LABELS={
    claude:[['claude.session',/^(current session|session actuelle|session en cours|current session usage)$/i],['claude.weekly',/^(all models|tous les modèles|cette semaine|this week|weekly usage|utilisation hebdomadaire)$/i],['claude.sonnet',/^(sonnet(?: only)?|sonnet uniquement)$/i],['claude.opus',/^(opus(?: only)?|opus uniquement)$/i]],
    codex:[['codex.session',/^(5[- ]hour usage limit|5[- ]hour limit|limite d'utilisation de 5 heures|limite sur 5 heures)$/i],['codex.weekly',/^(weekly usage limit|weekly limit|limite hebdomadaire)$/i],['codex.review',/^(code review|revue de code)$/i]]
  };
  const normalize=s=>String(s||'').replace(/[’]/g,"'").replace(/\s+/g,' ').trim();
  function providerFor(value){try{const u=new URL(value);if(u.protocol!=='https:')return null;if(u.hostname==='claude.ai'&&/^\/settings\/usage\/?$/.test(u.pathname))return 'claude';if(u.hostname==='chatgpt.com'&&/^\/codex\/settings\/usage\/?$/.test(u.pathname))return 'codex';}catch{}return null;}
  function percent(value){
    const text=normalize(value);if(text.length>160||(text.match(/%/g)||[]).length!==1)return null;
    const used='(?:used|utilis[eé](?:e?s)?|consomm[eé](?:e?s)?)';
    const remaining='(?:remaining|left|restant(?:e?s)?|disponible(?:s)?)';
    const numeric='(\\d{1,3}(?:[.,]\\d+)?)';
    // Match the complete string: never extract the tail of an invalid 172% or 1200%.
    for(const [semantic,invert] of [[used,false],[remaining,true]]){
      const a=text.match(new RegExp('^'+numeric+'\\s*%\\s*'+semantic+'$','i'))||text.match(new RegExp('^'+semantic+'\\s*:?\\s*'+numeric+'\\s*%$','i'));
      if(a){const n=Number(a[1].replace(',','.'));return Number.isFinite(n)&&n>=0&&n<=100?(invert?100-n:n):null;}
    }return null;
  }
  function reset(value,datetime,now=Date.now()){
    const candidates=[];
    if(typeof datetime==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(datetime)){
      const t=Date.parse(datetime);if(t>now&&t<=now+32*86400000)candidates.push({resetAt:t,resetApproximate:false});
    }
    const text=normalize(value);
    for(const match of text.matchAll(/(?:resets? in|réinitialis(?:ation|e|é)[^\d]{0,20}dans)\s+((?:\d+\s*(?:days?|jours?|d|j|hours?|heures?|hrs?|h|minutes?|mins?|m)\s*){1,3})/gi)){
      let min=0;
      for(const m of match[1].matchAll(/(\d+)\s*(days?|jours?|d|j|hours?|heures?|hrs?|h|minutes?|mins?|m)/gi)){
        const unit=m[2].toLowerCase();min+=Number(m[1])*(/^(d|j)/.test(unit)?1440:/^h/.test(unit)?60:1);
      }
      if(min>0&&min<=32*1440)candidates.push({resetAt:now+min*60000,resetApproximate:true});
    }
    if(new Set(candidates.filter(r=>r.resetApproximate).map(r=>r.resetAt)).size>1)return {resetAt:null,resetApproximate:false};
    // Allow one minute of rounding between a visible relative duration and a precise date.
    if(candidates.length&&Math.max(...candidates.map(r=>r.resetAt))-Math.min(...candidates.map(r=>r.resetAt))<=60000)return candidates[0];
    return {resetAt:null,resetApproximate:false};
  }
  function visible(el){
    if(el.closest('[hidden],[aria-hidden="true"]')||!el.getClientRects().length)return false;
    const css=el.ownerDocument.defaultView?.getComputedStyle?.(el);
    return !css||!['hidden','collapse'].includes(css.visibility);
  }
  function visibleText(node){
    if(!visible(node))return '';
    return [...node.childNodes].map(child=>child.nodeType===3?child.textContent:child.nodeType===1?visibleText(child):'').join(' ');
  }
  function cardReset(node,now){
    const dates=[...node.querySelectorAll('time[datetime]')].filter(visible).map(el=>el.getAttribute('datetime'));
    if(new Set(dates).size>1)return {resetAt:null,resetApproximate:false};
    return reset(visibleText(node),dates[0]||null,now);
  }
  function scan(doc,url,now=Date.now()){
    const provider=providerFor(url);if(!provider)return {provider:null,readings:[],status:'unavailable'};
    const labels=LABELS[provider],readings=[],found=new Map();
    // Claude often renders labels as plain divs inside deeply nested flex/grid rows.
    // Keep the search tied to recognized headings on the official usage page only.
    const container=doc.querySelector('main')||doc.body;
    const nodes=[...container.querySelectorAll('h1,h2,h3,h4,p,span,dt,strong,label,div')].slice(0,6500);
    const candidates=nodes.filter(el=>visible(el)&&normalize(visibleText(el)).length<=90&&labels.some(([,re])=>re.test(normalize(visibleText(el)))));
    // A parent <div> and its <span> can both contain the same label; retain the leaf.
    const headingNodes=candidates.filter(el=>!candidates.some(other=>other!==el&&el.contains(other)&&normalize(visibleText(el))===normalize(visibleText(other))));
    for(const [id,re] of labels){
      const matches=headingNodes.filter(el=>re.test(normalize(visibleText(el))));
      // Duplicate labels (even equal values) indicate an ambiguous layout.
      if(matches.length!==1)continue;
      const label=matches[0];let node=label,reading=null;
      for(let depth=0;depth<9&&node;depth++,node=node.parentElement){
        if(['BODY','HTML','MAIN'].includes(node.tagName))break;
        if(headingNodes.filter(el=>node.contains(el)).length>1)break;
        const text=normalize(node.textContent);if(text.length>850)break;
        const values=new Set();
        for(const el of node.querySelectorAll('span,p,strong,div,output,[aria-valuetext]')){
          if(el===label||el.contains(label)||!visible(el))continue;
          const val=percent(visibleText(el))??(el.hasAttribute('aria-valuetext')?percent(el.getAttribute('aria-valuetext')):null);if(val!==null)values.add(val);
        }
        if(values.size>1)break;
        if(values.size===1){
          const r=cardReset(node,now);
          reading={id,percent:[...values][0],source:'observed',...r};
          // Check the surrounding card for reset conflicts even when the inner value block has a reset.
          const parent=node.parentElement;
          if(parent&&!['BODY','HTML','MAIN'].includes(parent.tagName)&&headingNodes.filter(el=>parent.contains(el)).length===1&&normalize(parent.textContent).length<=850){
            Object.assign(reading,cardReset(parent,now));
          }
          break;
        }
      }
      if(reading)found.set(id,reading);
    }
    for(const reading of found.values())readings.push(reading);
    const base=labels.slice(0,2).every(([id])=>found.has(id));
    return {provider,readings,status:base?'observed':readings.length?'partial':Array.from(doc.querySelectorAll('input[type="password"]')).some(visible)?'login':'unavailable'};
  }
  root.AIFlowUsage={percent,reset,providerFor,scan};
})(typeof window!=='undefined'?window:globalThis);
