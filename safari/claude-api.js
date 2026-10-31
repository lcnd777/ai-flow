/* AI Flow Claude adapter. Independent MIT-compatible implementation informed by public API research.
 * Experimental: authenticated, READ-ONLY GETs exclusively to claude.ai. No conversation data,
 * cookie values, user/organization names, tokens or response bodies are stored or transmitted.
 */
(function(root){
  'use strict';
  const ORIGIN='https://claude.ai';
  const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const MAPPING={session:'claude.session',weekly_all:'claude.weekly'};
  function validPercent(value){
    // Number(null) === 0 is a potentially harmful false reading: reject it.
    if(value===null||value===undefined||value===''||typeof value==='boolean')return null;
    const n=typeof value==='number'?value:typeof value==='string'&&/^\d{1,3}(?:\.\d+)?$/.test(value)?Number(value):NaN;
    return Number.isFinite(n)&&n>=0&&n<=100?n:null;
  }
  function resetTime(raw,now=Date.now()){
    if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw))return null;
    const parsed=Date.parse(raw);
    return Number.isFinite(parsed)&&parsed>now&&parsed<=now+32*86400000?parsed:null;
  }
  function metric(id,raw,now){
    if(!raw||typeof raw!=='object')return null;
    const pct=validPercent(raw.percent??raw.utilization);
    return pct===null?null:{id,percent:pct,resetAt:resetTime(raw.resets_at,now),source:'observed'};
  }
  function parse(payload,now=Date.now()){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return [];
    const found=new Map(),ambiguous=new Set();
    if(Array.isArray(payload.limits)){
      for(const item of payload.limits.slice(0,100)){
        if(!item||typeof item!=='object')continue;
        let id=MAPPING[item.kind]||null;
        if(item.kind==='weekly_scoped'){
          const name=String(item.scope?.model?.display_name||'').toLowerCase();
          id=name.includes('sonnet')?'claude.sonnet':name.includes('opus')?'claude.opus':null;
        }
        if(!id||ambiguous.has(id))continue;
        if(found.has(id)){found.delete(id);ambiguous.add(id);continue;}
        const m=metric(id,item,now);
        if(m)found.set(id,m);
      }
    }
    for(const [id,key] of [['claude.session','five_hour'],['claude.weekly','seven_day'],['claude.sonnet','seven_day_sonnet'],['claude.opus','seven_day_opus']]){
      if(found.has(id)||ambiguous.has(id))continue;
      const m=metric(id,payload[key],now);
      if(m)found.set(id,m);
    }
    return [...found.values()];
  }
  function findOrganization(payload){
    const orgs=Array.isArray(payload)?payload:Array.isArray(payload?.organizations)?payload.organizations:[];
    const usable=orgs.filter(o=>o&&typeof o==='object'&&UUID.test(o.uuid||o.organization_uuid||o.id||''));
    const chat=usable.filter(o=>Array.isArray(o.capabilities)&&o.capabilities.includes('chat'));
    const candidates=chat.length?chat:usable;
    // Multiple accounts can yield wrong quota readings; require user selection in a future release.
    return candidates.length===1?(candidates[0].uuid||candidates[0].organization_uuid||candidates[0].id):null;
  }
  async function read(fetcher=fetch,opts={}){
    const timeoutMs=Math.min(15000,Math.max(2000,opts.timeoutMs||9000));
    let stage='organizations',httpStatus=null;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    async function get(path){
      const response=await fetcher(ORIGIN+path,{method:'GET',credentials:'include',headers:{Accept:'application/json','anthropic-client-platform':'web_claude_ai'},signal:controller.signal,cache:'no-store'});
      httpStatus=response.status;
      if(response.status===401||response.status===403)return {failed:'login'};
      if(response.status===429)return {failed:'rate-limit'};
      if(!response.ok)return {failed:'http'};
      try{return {data:await response.json()};}catch{return {failed:'invalid-json'};}
    }
    try{
      const orgResult=await get('/api/organizations');
      if(orgResult.failed)return {status:orgResult.failed,stage,httpStatus};
      const orgId=findOrganization(orgResult.data);
      if(!orgId)return {status:'org-ambiguous',stage,httpStatus};
      stage='usage';
      const usageResult=await get('/api/organizations/'+orgId+'/usage');
      if(usageResult.failed)return {status:usageResult.failed,stage,httpStatus};
      const readings=parse(usageResult.data);
      if(!readings.length)return {status:'no-figures',stage,httpStatus};
      return {status:readings.some(m=>m.id==='claude.session')&&readings.some(m=>m.id==='claude.weekly')?'ok':'partial',stage,httpStatus,orgId,readings};
    }catch(err){return {status:err?.name==='AbortError'?'timeout':'network',stage,httpStatus};}
    finally{clearTimeout(timeout);}
  }
  // Self-contained function: browser.scripting.executeScript executes it in the
  // active claude.ai page's MAIN world, where first-party session cookies apply.
  // Returns only quota numbers, reset dates and the organization UUID used to
  // keep local snapshots separated; never returns any raw server response.
  async function readInPage(){
    if(location.protocol!=='https:'||location.hostname!=='claude.ai')return {status:'wrong-origin',stage:'page-context'};
    const re=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),9000);
    let stage='organizations',httpStatus=null;
    const get=async(path)=>{
      const response=await fetch('https://claude.ai'+path,{method:'GET',credentials:'include',headers:{Accept:'application/json','anthropic-client-platform':'web_claude_ai'},cache:'no-store',signal:ctrl.signal});
      httpStatus=response.status;
      if(response.status===401||response.status===403)return {error:'login'};
      if(response.status===429)return {error:'rate-limit'};
      if(!response.ok)return {error:'http'};
      try{return {value:await response.json()};}catch{return {error:'invalid-json'};}
    };
    try{
      const orgResponse=await get('/api/organizations');
      if(orgResponse.error)return {status:orgResponse.error,stage,httpStatus};
      const payload=orgResponse.value;
      const all=Array.isArray(payload)?payload:Array.isArray(payload?.organizations)?payload.organizations:[];
      const valid=all.filter(o=>o&&typeof o==='object'&&re.test(o.uuid||o.organization_uuid||o.id||''));
      const chat=valid.filter(o=>Array.isArray(o.capabilities)&&o.capabilities.includes('chat'));
      const candidates=chat.length?chat:valid;
      if(candidates.length!==1)return {status:'org-ambiguous',stage,httpStatus};
      const orgId=candidates[0].uuid||candidates[0].organization_uuid||candidates[0].id;
      stage='usage';
      const usageResponse=await get('/api/organizations/'+orgId+'/usage');
      if(usageResponse.error)return {status:usageResponse.error,stage,httpStatus};
      const usage=usageResponse.value;
      if(!usage||typeof usage!=='object'||Array.isArray(usage))return {status:'no-figures',stage,httpStatus};
      const safePct=v=>{
        if(v===null||v===undefined||v===''||typeof v==='boolean')return null;
        const n=typeof v==='number'?v:typeof v==='string'&&/^\d{1,3}(?:\.\d+)?$/.test(v)?Number(v):NaN;
        return Number.isFinite(n)&&n>=0&&n<=100?n:null;
      };
      const safeReset=v=>{
        if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v))return null;
        const t=Date.parse(v),now=Date.now();return Number.isFinite(t)&&t>now&&t<=now+32*86400000?t:null;
      };
      const keys={session:'claude.session',weekly_all:'claude.weekly'};
      const found=new Map(),ambiguous=new Set();
      if(Array.isArray(usage.limits))for(const item of usage.limits.slice(0,100)){
        if(!item||typeof item!=='object')continue;
        let id=keys[item.kind]||null;
        if(item.kind==='weekly_scoped'){
          const model=String(item.scope?.model?.display_name||'').toLowerCase();
          id=model.includes('sonnet')?'claude.sonnet':model.includes('opus')?'claude.opus':null;
        }
        if(!id||ambiguous.has(id))continue;
        if(found.has(id)){found.delete(id);ambiguous.add(id);continue;}
        const pct=safePct(item.percent??item.utilization);
        if(pct!==null)found.set(id,{id,percent:pct,resetAt:safeReset(item.resets_at),source:'observed'});
      }
      for(const [id,key] of [['claude.session','five_hour'],['claude.weekly','seven_day'],['claude.sonnet','seven_day_sonnet'],['claude.opus','seven_day_opus']]){
        if(found.has(id)||ambiguous.has(id))continue;
        const value=usage[key];if(!value||typeof value!=='object')continue;
        const pct=safePct(value.percent??value.utilization);
        if(pct!==null)found.set(id,{id,percent:pct,resetAt:safeReset(value.resets_at),source:'observed'});
      }
      const readings=[...found.values()];
      if(!readings.length)return {status:'no-figures',stage,httpStatus};
      return {status:readings.some(m=>m.id==='claude.session')&&readings.some(m=>m.id==='claude.weekly')?'ok':'partial',stage,httpStatus,orgId,readings};
    }catch(err){return {status:err?.name==='AbortError'?'timeout':'network',stage,httpStatus};}
    finally{clearTimeout(timer);}
  }
  root.AIFlowClaudeAPI={parse,findOrganization,read,readInPage,validPercent};
})(typeof window!=='undefined'?window:globalThis);
