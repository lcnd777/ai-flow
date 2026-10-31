/* AI Flow — Privacy Layer : chiffrement local des contenus sensibles conservés durablement
 * (décisions d'un Flow, brouillon de synchronisation préparé).
 *
 * Clé AES-GCM 256 bits générée sur l'appareil, NON EXTRACTIBLE (le navigateur refuse d'en exporter les octets),
 * conservée dans IndexedDB, jamais dans storage.local ni dans une sauvegarde exportée. Le texte chiffré est
 * conservé dans storage.local. Limite assumée : du code de l'extension elle-même peut utiliser la clé ; le
 * chiffrement protège contre la lecture directe des fichiers de stockage, pas contre une extension compromise.
 * Sans IndexedDB ou WebCrypto : available() renvoie false et l'appelant le signale à l'utilisateur. */
(function(root){
  'use strict';
  const DB='ai-flow-vault',STORE='keys',KEY_ID='main-v1';
  let keyPromise=null;
  const subtle=()=>root.crypto?.subtle||null;
  function idb(){
    return new Promise((res,rej)=>{
      const r=root.indexedDB.open(DB,1);
      r.onupgradeneeded=()=>r.result.createObjectStore(STORE);
      r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
    });
  }
  const tx=(db,mode,fn)=>new Promise((res,rej)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE),q=fn(s);t.oncomplete=()=>res(q?.result);t.onerror=()=>rej(t.error);});
  async function getKey(create=true){
    if(root.__AIFLOW_VAULT_MEMORY__){ // tests : clé en mémoire uniquement
      if(!root.__AIFLOW_VAULT_MEMORY__.key&&create)root.__AIFLOW_VAULT_MEMORY__.key=await subtle().generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      return root.__AIFLOW_VAULT_MEMORY__.key||null;
    }
    const db=await idb();
    try{
      let k=await tx(db,'readonly',s=>s.get(KEY_ID));
      if(!k&&create){k=await subtle().generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await tx(db,'readwrite',s=>s.put(k,KEY_ID));}
      return k||null;
    }finally{db.close();}
  }
  function key(){if(!keyPromise)keyPromise=getKey().catch(e=>{keyPromise=null;throw e;});return keyPromise;}
  const b64=buf=>{let s='';const a=new Uint8Array(buf);for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s);};
  const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  async function available(){
    if(!subtle()||(!root.indexedDB&&!root.__AIFLOW_VAULT_MEMORY__))return false;
    try{return !!await key();}catch{return false;}
  }
  async function seal(obj){
    const iv=root.crypto.getRandomValues(new Uint8Array(12));
    const ct=await subtle().encrypt({name:'AES-GCM',iv},await key(),new TextEncoder().encode(JSON.stringify(obj)));
    return {iv:b64(iv),ct:b64(ct)};
  }
  // Lève une erreur « locked » si la clé est absente (données restaurées sur une autre installation, IndexedDB effacée).
  async function open(blob){
    if(!blob?.ct)return null;
    const k=root.__AIFLOW_VAULT_MEMORY__?await getKey(false):await getKey(false).catch(()=>null);
    if(!k)throw Error('locked');
    try{return JSON.parse(new TextDecoder().decode(await subtle().decrypt({name:'AES-GCM',iv:unb64(blob.iv)},k,unb64(blob.ct))));}
    catch{throw Error('locked');}
  }
  root.AIFlowVault={available,seal,open};
})(typeof window!=='undefined'?window:globalThis);
