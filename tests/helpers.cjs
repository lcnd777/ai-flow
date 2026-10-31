// Charge les scripts de l'extension dans un contexte isolé, avec un faux navigateur en mémoire.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const SRC=path.join(__dirname,'..','safari');

function fakeBrowser(opts={}){
  const store={},listeners={changed:[],message:[],alarm:[],installed:[],startup:[],notifClick:[]};
  const tabs=new Map();let nextTab=1;const created=[],updated=[],reloaded=[],native=[],notifications=[];
  const alarms=new Map();
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const browser={
    runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p,getManifest:()=>({version:'0.8.0',permissions:opts.native?['storage','alarms','scripting','nativeMessaging']:['storage','alarms','scripting']}),
      onMessage:{addListener:f=>listeners.message.push(f)},onInstalled:{addListener:f=>listeners.installed.push(f)},onStartup:{addListener:f=>listeners.startup.push(f)},
      sendNativeMessage:opts.native?async(id,msg)=>{native.push(msg);return opts.nativeReply?opts.nativeReply(msg):null;}:undefined,
      sendMessage:async()=>{throw new Error('no receiver');}},
    storage:{local:{
      get:async keys=>{const list=keys==null?Object.keys(store):Array.isArray(keys)?keys:[keys];const out={};for(const k of list)if(k in store)out[k]=clone(store[k]);return out;},
      set:async obj=>{const changes={};for(const [k,v] of Object.entries(obj)){changes[k]={oldValue:store[k],newValue:clone(v)};store[k]=clone(v);}for(const f of listeners.changed)f(changes,'local');},
      remove:async keys=>{for(const k of [].concat(keys))delete store[k];}},
      onChanged:{addListener:f=>listeners.changed.push(f)}},
    alarms:{create:async(name,info)=>{alarms.set(name,{name,...info});},get:async name=>alarms.get(name),clear:async name=>alarms.delete(name),onAlarm:{addListener:f=>listeners.alarm.push(f)}},
    tabs:{
      query:async()=>[...tabs.values()].map(clone),
      get:async id=>{if(!tabs.has(id))throw new Error('no tab');return clone(tabs.get(id));},
      create:async info=>{const t={id:nextTab++,url:info.url,active:!!info.active,pinned:!!info.pinned,status:'complete',windowId:1};tabs.set(t.id,t);created.push(clone(info));return clone(t);},
      update:async(id,info)=>{Object.assign(tabs.get(id),info);updated.push({id,...info});return clone(tabs.get(id));},
      reload:async id=>{reloaded.push(id);}},
    windows:{update:async()=>({})},
    scripting:{executeScript:async({target,func,args})=>{
      const tab=tabs.get(target.tabId);if(!tab)throw new Error('no tab');
      const result=opts.inject?await opts.inject(tab,func,args):undefined;
      return [{frameId:0,result}];}},
    action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
    notifications:opts.notifications?{create:async(id,o)=>{notifications.push({id,...o});},onClicked:{addListener:()=>{}}}:undefined
  };
  return {browser,store,tabs,created,updated,reloaded,native,notifications,alarms,listeners,
    addTab:(url,extra={})=>{const t={id:nextTab++,url,active:false,pinned:false,status:'complete',windowId:1,...extra};tabs.set(t.id,t);return t;},
    send:(message,sender)=>new Promise(res=>{const f=listeners.message[0];f(message,sender,res);})};
}

function load(files,extra={}){
  const ctx={console,URL,URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval,AbortController,TextEncoder,atob,btoa,structuredClone,Date,Math,JSON,Promise,...extra};
  ctx.globalThis=ctx;
  vm.createContext(ctx);
  for(const f of files)vm.runInContext(fs.readFileSync(path.join(SRC,f),'utf8'),ctx,{filename:f});
  return ctx;
}
const core=()=>load(['platforms.js','shared.js','readers.js']);

// Exécute un lecteur « dans la page » avec un faux fetch et une fausse location.
async function runReader(g,fn,host,routes){
  const calls=[];
  const saved={location:g.location,fetch:g.fetch};
  g.location={protocol:'https:',hostname:host};
  g.fetch=async(url,init={})=>{
    calls.push({url,init});
    const route=routes(url,init);
    if(route instanceof Error)throw route;
    const {status=200,body}=route||{status:404};
    return {status,ok:status>=200&&status<300,json:async()=>{if(typeof body==='string')return JSON.parse(body);return body;}};
  };
  try{return {result:await fn(),calls};}
  finally{g.location=saved.location;g.fetch=saved.fetch;}
}
module.exports={fakeBrowser,load,core,runReader,SRC};
