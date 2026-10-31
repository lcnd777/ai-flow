/* User-initiated text handoff. No storage, network, automatic extraction or send. */
(function(root){
 'use strict';
 function prepare(text){if(typeof text!=='string'||!text.trim())throw Error('Sélectionne ou colle le texte à reprendre.');if(text.length>100000)throw Error('Texte trop long : limite de 100 000 caractères. Réduis-le avant de copier.');return text.trim();}
 function destination(provider){if(provider==='claude')return 'https://claude.ai/new';if(provider==='chatgpt')return 'https://chatgpt.com/';throw Error('Destination non autorisée');}
 function mount(container,initial='',target='chatgpt',close=()=>{}){
  const doc=container.ownerDocument;
  const box=doc.createElement('section');box.className='af-transfer';box.setAttribute('role','region');box.setAttribute('aria-label','Transférer une conversation');
  box.innerHTML=`<style>.af-transfer{box-sizing:border-box;background:Canvas;color:CanvasText;padding:18px;border:1px solid #789580;border-radius:14px;font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;width:100%;max-height:80dvh;overflow:auto}.af-transfer *{box-sizing:border-box}.af-transfer h2{margin:0 0 8px;font-size:18px}.af-transfer textarea{display:block;width:100%;height:220px;resize:vertical;background:Canvas;color:CanvasText;border:1px solid #789580;border-radius:8px;padding:10px;font:inherit}.af-transfer button,.af-transfer select{font:inherit;min-height:44px;padding:8px;margin:4px 4px 4px 0}.af-transfer p{font-size:12px}.af-transfer label{display:block;margin:8px 0}.af-transfer a{color:LinkText}</style>
  <h2>Reprendre une conversation</h2><p>Texte sélectionné ou collé uniquement. Vérifie et retire les informations sensibles avant de copier. Aucun historique ni pièce jointe n’est importé automatiquement.</p>
  <label>Destination <select data-target><option value="chatgpt">ChatGPT</option><option value="claude">Claude</option></select></label>
  <label>Texte à transmettre <textarea data-draft placeholder="Colle ici les échanges utiles, les décisions et ta prochaine demande."></textarea></label>
  <p data-count></p><label><input data-consent type="checkbox"> J’ai vérifié ce texte et souhaite le copier pour cette destination.</label>
  <button data-copy disabled>1. Copier le texte</button><a data-open target="_blank" rel="noopener noreferrer" hidden>2. Ouvrir la destination ↗</a>
  <p data-status role="status">Après copie, colle le texte dans la nouvelle conversation et envoie-le toi-même. Le presse-papiers peut être synchronisé par ton système.</p><button data-close>Fermer et effacer le brouillon</button>`;
  container.appendChild(box);
  const q=s=>box.querySelector(s),draft=q('[data-draft]'),select=q('[data-target]'),consent=q('[data-consent]'),copy=q('[data-copy]'),link=q('[data-open]'),status=q('[data-status]');
  draft.value=initial;select.value=target;
  function invalidate(){consent.checked=false;copy.disabled=true;link.hidden=true;q('[data-count]').textContent=`${draft.value.length.toLocaleString('fr-FR')} / 100 000 caractères`;}
  draft.addEventListener('input',invalidate);select.addEventListener('change',invalidate);
  consent.addEventListener('change',()=>{copy.disabled=!consent.checked;link.hidden=true;});
  copy.addEventListener('click',async()=>{
   if(!consent.checked)return;
   let text,provider;
   try{text=prepare(draft.value);provider=select.value;}catch(e){status.textContent=e.message;link.hidden=true;return;}
   try{
    if(!navigator.clipboard?.writeText)throw Error('Copie automatique indisponible. Sélectionne le texte dans l’aperçu et utilise Copier, puis ouvre la destination.');
    await navigator.clipboard.writeText(text);
    // A user may edit while the clipboard promise is pending.
    if(!box.isConnected)return;
    if(!consent.checked||draft.value.trim()!==text||select.value!==provider){status.textContent='Texte précédent copié. Vérifie et copie à nouveau tes modifications.';return;}
    link.href=destination(provider);link.hidden=false;status.textContent='Texte copié. Ouvre la destination, colle-le puis vérifie-le avant envoi.';
   }catch(e){if(!box.isConnected)return;status.textContent=e.message;draft.focus();draft.select();if(consent.checked&&draft.value.trim()===text&&select.value===provider){link.href=destination(select.value);link.hidden=false;}}
  });
  q('[data-close]').addEventListener('click',()=>{draft.value='';box.remove();close();});
  invalidate();draft.focus();return box;
 }
 root.AIFlowTransfer={prepare,destination,mount};
})(typeof window!=='undefined'?window:globalThis);
