/* Experimental ChatGPT / Codex quota adapter.
 * The privileged auth token is kept only inside a first-party ChatGPT tab's
 * running function and is NEVER returned to the extension, saved or logged.
 * Does not inspect conversations. All network requests are same-origin GETs.
 */
(function(root){
  'use strict';
  async function readInPage(){
    if(location.protocol!=='https:'||!['chatgpt.com','chat.openai.com'].includes(location.hostname))return {status:'wrong-origin',stage:'codex-page'};
    // Only chatgpt.com exposes the currently tested usage path.
    if(location.hostname!=='chatgpt.com')return {status:'wrong-origin',stage:'codex-page'};
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
    let stage='session',httpStatus=null;
    const get=async(path,headers)=>{
      const r=await fetch('https://chatgpt.com'+path,{method:'GET',credentials:'include',cache:'no-store',headers,signal:controller.signal});
      httpStatus=r.status;
      if(r.status===401||r.status===403)return {error:'login'};
      if(r.status===429)return {error:'rate-limit'};
      if(!r.ok)return {error:'http'};
      try{return {value:await r.json()};}catch{return {error:'invalid-json'};}
    };
    try{
      const auth=await get('/api/auth/session',{Accept:'application/json'});
      if(auth.error)return {status:auth.error,stage,httpStatus};
      const session=auth.value;
      const token=typeof session?.accessToken==='string'?session.accessToken:
        typeof session?.access_token==='string'?session.access_token:null;
      if(!token)return {status:'login',stage,httpStatus};
      // Use the account selected by the web session when explicitly known.
      // Never parse unrelated account names or send a token to any other origin.
      let account=typeof session?.accountId==='string'?session.accountId:
        typeof session?.account_id==='string'?session.account_id:null;
      // Some account identifiers are present in JWT claims. Parse locally,
      // without returning or storing the token or JWT payload.
      if(!account&&token.includes('.'))try{
        const part=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
        const claims=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')));
        account=typeof claims?.chatgpt_account_id==='string'?claims.chatgpt_account_id:
          typeof claims?.account_id==='string'?claims.account_id:null;
      }catch{}
      const headers={Accept:'application/json',Authorization:'Bearer '+token};
      if(account)headers['ChatGPT-Account-Id']=account;
      stage='usage';
      const usage=await get('/backend-api/wham/usage',headers);
      if(usage.error)return {status:usage.error,stage,httpStatus};
      const raw=usage.value?.rate_limit??usage.value?.rateLimit;
      if(!raw||typeof raw!=='object')return {status:'no-figures',stage,httpStatus};
      const windows=[raw.primary_window??raw.primaryWindow,raw.secondary_window??raw.secondaryWindow].filter(Boolean);
      const safePercent=value=>{
        if(value===undefined||value===null||value===''||typeof value==='boolean')return null;
        const n=typeof value==='number'?value:typeof value==='string'&&/^\d{1,3}(?:\.\d+)?$/.test(value)?Number(value):NaN;
        return Number.isFinite(n)&&n>=0&&n<=100?n:null;
      };
      const safeReset=value=>{
        let t=null;
        if(typeof value==='number'&&Number.isFinite(value))t=value<1e11?value*1000:value;
        else if(typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value))t=Date.parse(value);
        const now=Date.now();return Number.isFinite(t)&&t>now&&t<=now+32*86400000?t:null;
      };
      const readings=[];const unique=new Set();
      for(const row of windows){
        const seconds=Number(row.limit_window_seconds??row.limitWindowSeconds);
        // 5-hour / 7-day Codex allowances ONLY. Never label other time
        // windows as session/weekly, and never imply ordinary chat quotas.
        const id=seconds===18000?'codex.session':seconds===604800?'codex.weekly':null;
        if(!id||unique.has(id))continue;
        const percent=safePercent(row.used_percent??row.usedPercent??row.utilization??row.percent);
        if(percent===null)continue;
        readings.push({id,percent,resetAt:safeReset(row.reset_at??row.resetAt??row.resets_at),source:'observed'});
        unique.add(id);
      }
      if(!readings.length)return {status:'no-figures',stage,httpStatus};
      return {status:readings.length===2?'ok':'partial',stage,httpStatus,readings};
    }catch(e){return {status:e?.name==='AbortError'?'timeout':'network',stage,httpStatus};}
    finally{clearTimeout(timer);}
  }
  root.AIFlowCodexAPI={readInPage};
})(typeof window!=='undefined'?window:globalThis);
