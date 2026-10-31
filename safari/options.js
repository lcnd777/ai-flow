(async function(){
  'use strict';
  const A=window.AIFlow,notice=document.getElementById('notice');let state;
  try{state=await A.getState();}catch(e){notice.textContent=e.message;return;}
  for(const id of ['widgetEnabled','focusMode','alertAt80','alertAt95','systemAlerts','nativeMenuEnabled']){
    const element=document.getElementById(id);element.checked=!!state.settings[id];
    if(id==='nativeMenuEnabled'&&!A.api.runtime.getManifest().permissions?.includes('nativeMessaging')){element.disabled=true;element.checked=false;}
    if(id==='systemAlerts'&&!A.api.runtime.getManifest().optional_permissions?.includes('notifications')){element.disabled=true;element.checked=false;element.title='Non disponible dans ce package Safari';}
    element.addEventListener('change',async()=>{
      try{
        if(id==='systemAlerts'&&element.checked){
          const granted=await A.api.permissions.request({permissions:['notifications']});
          if(!granted){element.checked=false;notice.textContent='Notifications non autorisées. Les alertes visuelles restent actives.';return;}
        }
        state=await A.saveSettings({[id]:element.checked});notice.textContent='Réglages enregistrés.';
        if(id==='systemAlerts'&&!element.checked)await A.api.permissions.remove({permissions:['notifications']});
      }catch(e){element.checked=!!state.settings[id];notice.textContent=e.message;}
    });
  }
  async function nativeStatus(){
    const result=await A.api.storage.local.get('ai_flow_native_status');const status=result.ai_flow_native_status;
    document.getElementById('native-status').textContent=!A.api.runtime.getManifest().permissions?.includes('nativeMessaging')?'Liaison automatique non incluse dans cette variante.':!status?'Aucune liaison vérifiée.':status.ok?(status.cleared?'Copie Mac effacée.':'Dernier envoi local réussi · '+new Date(status.at).toLocaleTimeString('fr-FR')):'Liaison indisponible. Si tu viens de la désactiver, efface aussi la copie depuis l’application Mac.';
  }
  nativeStatus();A.api.storage.onChanged.addListener(nativeStatus);
  document.getElementById('exportMenu').addEventListener('click',async()=>{
    try{const snapshot=A.menuSnapshot(await A.getState()),url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='AI-Flow-quotas.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);notice.textContent='Instantané exporté : à importer dans le menu Mac. Ce fichier ne se met pas à jour automatiquement.';}catch(e){notice.textContent=e.message;}
  });
  document.getElementById('clearData').addEventListener('click',async()=>{
    if(!confirm('Supprimer tous les relevés enregistrés ?'))return;
    try{
      // 0.7.0: clearing data no longer disables automatic updates (that switch lives in « Mes comptes »).
      state=await A.clearReadings();notice.textContent='Relevés supprimés. Ils réapparaîtront à la prochaine lecture si un onglet Claude ou ChatGPT est ouvert.';
    }catch(e){notice.textContent=e.message;}
  });
})();
