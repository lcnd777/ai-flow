/* AI Flow — lecteurs de quotas exécutés dans l'onglet officiel déjà ouvert (scripting.executeScript, monde MAIN).
 * Chaque fonction est autonome (sérialisée par le navigateur) : aucune variable extérieure.
 * Elles ne renvoient que des pourcentages, des dates de reset et un libellé court.
 * Jamais de cookie, de jeton, de contenu de conversation ni de réponse brute. */
(function(root){
  'use strict';

  // Claude : API web interne (non documentée) /api/organizations puis /usage.
  async function claude(){
    if(location.protocol!=='https:'||location.hostname!=='claude.ai')return {status:'wrong-origin'};
    const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
    let httpStatus=null;
    const get=async path=>{
      const r=await fetch('https://claude.ai'+path,{method:'GET',credentials:'include',cache:'no-store',signal:ctrl.signal,headers:{Accept:'application/json','anthropic-client-platform':'web_claude_ai'}});
      httpStatus=r.status;
      if(r.status===401||r.status===403)return {error:'login'};
      if(r.status===429)return {error:'rate-limit'};
      if(!r.ok)return {error:'http'};
      try{return {value:await r.json()};}catch{return {error:'invalid-json'};}
    };
    const pct=v=>{
      if(v===null||v===undefined||v===''||typeof v==='boolean')return null;
      const n=typeof v==='number'?v:typeof v==='string'&&/^\d{1,3}(?:\.\d+)?$/.test(v)?Number(v):NaN;
      return Number.isFinite(n)&&n>=0&&n<=100?n:null;
    };
    const reset=v=>{
      if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v))return null;
      const t=Date.parse(v),now=Date.now();return Number.isFinite(t)&&t>now&&t<=now+32*86400000?t:null;
    };
    try{
      const orgs=await get('/api/organizations');
      if(orgs.error)return {status:orgs.error,httpStatus};
      const all=Array.isArray(orgs.value)?orgs.value:Array.isArray(orgs.value?.organizations)?orgs.value.organizations:[];
      const valid=all.filter(o=>o&&typeof o==='object'&&uuid.test(o.uuid||o.organization_uuid||o.id||''));
      const chat=valid.filter(o=>Array.isArray(o.capabilities)&&o.capabilities.includes('chat'));
      const candidates=chat.length?chat:valid;
      if(candidates.length!==1)return {status:candidates.length?'org-ambiguous':'login',httpStatus};
      const org=candidates[0].uuid||candidates[0].organization_uuid||candidates[0].id;
      const usage=await get('/api/organizations/'+org+'/usage');
      if(usage.error)return {status:usage.error,httpStatus};
      const u=usage.value;
      if(!u||typeof u!=='object'||Array.isArray(u))return {status:'no-figures',httpStatus};
      const found=new Map(),ambiguous=new Set();
      const keys={session:'claude.session',weekly_all:'claude.weekly'};
      if(Array.isArray(u.limits))for(const item of u.limits.slice(0,100)){
        if(!item||typeof item!=='object')continue;
        let id=keys[item.kind]||null;
        if(item.kind==='weekly_scoped'){
          const model=String(item.scope?.model?.display_name||'').toLowerCase();
          id=model.includes('sonnet')?'claude.sonnet':model.includes('opus')?'claude.opus':null;
        }
        if(!id||ambiguous.has(id))continue;
        if(found.has(id)){found.delete(id);ambiguous.add(id);continue;}
        const p=pct(item.percent??item.utilization);
        if(p!==null)found.set(id,{id,percent:p,resetAt:reset(item.resets_at)});
      }
      for(const [id,key] of [['claude.session','five_hour'],['claude.weekly','seven_day'],['claude.sonnet','seven_day_sonnet'],['claude.opus','seven_day_opus']]){
        if(found.has(id)||ambiguous.has(id))continue;
        const v=u[key];if(!v||typeof v!=='object')continue;
        const p=pct(v.percent??v.utilization);
        if(p!==null)found.set(id,{id,percent:p,resetAt:reset(v.resets_at)});
      }
      const readings=[...found.values()];
      if(!readings.length)return {status:'no-figures',httpStatus};
      return {status:found.has('claude.session')&&found.has('claude.weekly')?'ok':'partial',httpStatus,account:org,readings};
    }catch(e){return {status:e?.name==='AbortError'?'timeout':'network',httpStatus};}
    finally{clearTimeout(timer);}
  }

  // Codex : session ChatGPT puis /backend-api/wham/usage. Le jeton reste dans cette fonction, dans l'onglet.
  async function codex(){
    if(location.protocol!=='https:'||location.hostname!=='chatgpt.com')return {status:'wrong-origin'};
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
    let httpStatus=null;
    const get=async(path,headers)=>{
      const r=await fetch('https://chatgpt.com'+path,{method:'GET',credentials:'include',cache:'no-store',headers,signal:ctrl.signal});
      httpStatus=r.status;
      if(r.status===401||r.status===403)return {error:'login'};
      if(r.status===429)return {error:'rate-limit'};
      if(!r.ok)return {error:'http'};
      try{return {value:await r.json()};}catch{return {error:'invalid-json'};}
    };
    const pct=v=>{
      if(v===undefined||v===null||v===''||typeof v==='boolean')return null;
      const n=typeof v==='number'?v:typeof v==='string'&&/^\d{1,3}(?:\.\d+)?$/.test(v)?Number(v):NaN;
      return Number.isFinite(n)&&n>=0&&n<=100?n:null;
    };
    const reset=v=>{
      let t=null;
      if(typeof v==='number'&&Number.isFinite(v))t=v<1e11?v*1000:v;
      else if(typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v))t=Date.parse(v);
      const now=Date.now();return Number.isFinite(t)&&t>now&&t<=now+32*86400000?t:null;
    };
    try{
      const auth=await get('/api/auth/session',{Accept:'application/json'});
      if(auth.error)return {status:auth.error,httpStatus};
      const s=auth.value;
      const token=typeof s?.accessToken==='string'?s.accessToken:typeof s?.access_token==='string'?s.access_token:null;
      if(!token)return {status:'login',httpStatus};
      let account=typeof s?.accountId==='string'?s.accountId:typeof s?.account_id==='string'?s.account_id:null;
      if(!account&&token.includes('.'))try{
        const part=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
        const claims=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')));
        const auth=claims?.['https://api.openai.com/auth'];
        account=typeof claims?.chatgpt_account_id==='string'?claims.chatgpt_account_id:typeof auth?.chatgpt_account_id==='string'?auth.chatgpt_account_id:null;
      }catch{}
      const headers={Accept:'application/json',Authorization:'Bearer '+token};
      if(account)headers['ChatGPT-Account-Id']=account;
      const usage=await get('/backend-api/wham/usage',headers);
      if(usage.error)return {status:usage.error,httpStatus};
      const v=usage.value||{};
      const readings=[],seen=new Set();
      const add=(raw,forceId)=>{
        if(!raw||typeof raw!=='object')return;
        for(const row of [raw.primary_window??raw.primaryWindow,raw.secondary_window??raw.secondaryWindow]){
          if(!row||typeof row!=='object')continue;
          const sec=Number(row.limit_window_seconds??row.limitWindowSeconds);
          // Uniquement les fenêtres explicitement 5 h / 7 jours : jamais d'étiquette devinée.
          const id=forceId?(sec===604800||sec===18000?forceId:null):sec===18000?'codex.session':sec===604800?'codex.weekly':null;
          if(!id||seen.has(id))continue;
          const p=pct(row.used_percent??row.usedPercent??row.utilization??row.percent);
          if(p===null)continue;
          readings.push({id,percent:p,resetAt:reset(row.reset_at??row.resetAt??row.resets_at)});seen.add(id);
        }
      };
      add(v.rate_limit??v.rateLimit);
      add(v.code_review_rate_limit??v.codeReviewRateLimit,'codex.review');
      if(!readings.length)return {status:'no-figures',httpStatus};
      return {status:seen.has('codex.session')&&seen.has('codex.weekly')?'ok':'partial',httpStatus,account:account?'acct:'+account.length+':'+account.slice(-6):null,readings};
    }catch(e){return {status:e?.name==='AbortError'?'timeout':'network',httpStatus};}
    finally{clearTimeout(timer);}
  }


  /* ---------- Smart Transfer : lecture de LA conversation ouverte, uniquement sur clic explicite ----------
     Renvoie {status,title,messages:[{role:'user'|'assistant',text}]} ; rien n'est lu en arrière-plan. */
  async function claudeConversation(){
    if(location.protocol!=='https:'||location.hostname!=='claude.ai')return {status:'wrong-origin'};
    const m=location.pathname.match(/^\/chat\/([0-9a-f-]{36})/i);
    if(!m)return {status:'no-conversation'};
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
    const clip=t=>String(t||'').replace(/\u0000/g,'').trim();
    const fromDom=()=>{
      const nodes=[...document.querySelectorAll('[data-testid="user-message"], .font-claude-response, .font-claude-message')];
      const top=nodes.filter(n=>!nodes.some(o=>o!==n&&o.contains(n)));
      const messages=top.map(n=>({role:n.matches('[data-testid="user-message"]')?'user':'assistant',text:clip(n.innerText)})).filter(x=>x.text);
      return messages.length?{status:'partial',source:'page',title:clip(document.title).replace(/\s*[-–]\s*Claude\s*$/,''),messages}:{status:'no-messages'};
    };
    try{
      const get=async path=>{const r=await fetch('https://claude.ai'+path,{credentials:'include',cache:'no-store',signal:ctrl.signal,headers:{Accept:'application/json','anthropic-client-platform':'web_claude_ai'}});return r.ok?r.json():Promise.reject(r.status);};
      const orgs=await get('/api/organizations');
      const list=(Array.isArray(orgs)?orgs:orgs?.organizations||[]).filter(o=>Array.isArray(o?.capabilities)&&o.capabilities.includes('chat'));
      if(list.length!==1)return fromDom();
      const c=await get(`/api/organizations/${list[0].uuid}/chat_conversations/${m[1]}?tree=True&rendering_mode=messages&render_all_tools=true`);
      const raw=Array.isArray(c?.chat_messages)?c.chat_messages:[];
      const text=x=>clip(typeof x?.text==='string'&&x.text?x.text:Array.isArray(x?.content)?x.content.filter(b=>b?.type==='text'&&typeof b.text==='string').map(b=>b.text).join('\n\n'):'');
      const messages=raw.slice().sort((a,b)=>(a.index??0)-(b.index??0)).map(x=>({role:x.sender==='human'?'user':x.sender==='assistant'?'assistant':null,text:text(x)})).filter(x=>x.role&&x.text);
      if(!messages.length)return fromDom();
      return {status:'ok',source:'api',title:clip(c.name)||clip(document.title),messages};
    }catch(e){return fromDom();}
    finally{clearTimeout(timer);}
  }
  async function chatgptConversation(){
    if(location.protocol!=='https:'||location.hostname!=='chatgpt.com')return {status:'wrong-origin'};
    const m=location.pathname.match(/\/c\/([\w-]+)/);
    const clip=t=>String(t||'').replace(/\u0000/g,'').trim();
    const fromDom=()=>{
      const messages=[...document.querySelectorAll('[data-message-author-role]')].map(n=>({role:n.getAttribute('data-message-author-role'),text:clip(n.innerText)})).filter(x=>(x.role==='user'||x.role==='assistant')&&x.text);
      return messages.length?{status:'partial',source:'page',title:clip(document.title),messages}:{status:m?'no-messages':'no-conversation'};
    };
    if(!m)return fromDom();
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
    try{
      const s=await (await fetch('https://chatgpt.com/api/auth/session',{credentials:'include',cache:'no-store',signal:ctrl.signal})).json();
      const token=typeof s?.accessToken==='string'?s.accessToken:null;
      if(!token)return fromDom();
      const r=await fetch('https://chatgpt.com/backend-api/conversation/'+m[1],{credentials:'include',cache:'no-store',signal:ctrl.signal,headers:{Accept:'application/json',Authorization:'Bearer '+token}});
      if(!r.ok)return fromDom();
      const c=await r.json(),map=c?.mapping||{};
      const chain=[];let id=c?.current_node,guard=0;
      while(id&&map[id]&&guard++<5000){chain.push(map[id]);id=map[id].parent;}
      const messages=chain.reverse().map(n=>n.message).filter(Boolean).map(x=>{
        const role=x.author?.role,parts=Array.isArray(x.content?.parts)?x.content.parts.filter(p=>typeof p==='string'):[];
        return {role,text:clip(parts.join('\n\n')),hidden:x.metadata?.is_visually_hidden_from_conversation};
      }).filter(x=>(x.role==='user'||x.role==='assistant')&&x.text&&!x.hidden).map(({role,text})=>({role,text}));
      if(!messages.length)return fromDom();
      return {status:'ok',source:'api',title:clip(c.title)||clip(document.title),messages};
    }catch(e){return fromDom();}
    finally{clearTimeout(timer);}
  }
  // Insère un texte dans la zone de saisie SANS l'envoyer (transfert de contexte).
  async function insertDraft(text){
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const pick=()=>document.querySelector('#prompt-textarea')||document.querySelector('div.ProseMirror[contenteditable="true"]')||document.querySelector('[data-testid="chat-input"] [contenteditable="true"]')||document.querySelector('fieldset [contenteditable="true"]')||document.querySelector('form textarea');
    let el=null;for(let i=0;i<40&&!el;i++){el=pick();if(!el)await sleep(250);}
    if(!el)return {status:'no-composer'};
    const read=()=>el.tagName==='TEXTAREA'?el.value:el.textContent;
    if((read()||'').trim())return {status:'draft'};
    el.focus();
    if(el.tagName==='TEXTAREA'){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));}
    else if(!document.execCommand('insertText',false,text)){el.textContent=text;el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));}
    await sleep(300);
    return {status:(read()||'').trim()?'inserted':'not-inserted'};
  }
  root.AIFlowReaders={claude,codex,claudeConversation,chatgptConversation,insertDraft};
})(typeof window!=='undefined'?window:globalThis);
