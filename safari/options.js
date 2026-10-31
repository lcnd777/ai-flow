(async function(){
  'use strict';
  const A=window.AIFlow,U=window.AIFlowUI,$=id=>document.getElementById(id),esc=A.escapeHTML;
  const notice=t=>{$('notice').textContent=t;};
  let state,conn={},auto={};
  try{state=await A.getState();}catch(e){notice(e.message);return;}
  const manifest=A.api.runtime.getManifest();
  $('version').textContent=`AI Flow ${manifest.version_name||manifest.version} · bêta`;
  const nativeOK=manifest.permissions?.includes('nativeMessaging');
  if(!A.api.notifications&&nativeOK){$('sys-title').textContent='Notifications macOS';$('sys-desc').textContent='Via l’app AI Flow (Safari sur Mac). Sinon, bannière discrète dans la pastille.';}
  else if(!A.api.notifications){$('sys-title').textContent='Notifications du système';$('sys-desc').textContent='Non disponibles dans ce navigateur : la bannière de la pastille reste active.';}

  const SUPPORT={live:'Lecture auto',experimental:'Lecture auto · expérimental',none:'Non mesuré'};
  function platforms(){
    const order=A.cleanOrder(state.settings.platformOrder),hidden=state.settings.platformHidden;
    $('platforms').innerHTML=order.map((pid,i)=>{
      const p=A.platform(pid),c=U.connection(state,pid,conn),on=!hidden[pid],hasAuto=!!p.reader;
      return `<div class="prow ${on?'':'off'}">${U.logo(pid)}
        <div class="prow-main"><b>${esc(p.name)}</b><span class="tag ${p.support}">${SUPPORT[p.support]}</span>
          <small class="conn ${c.cls}">${esc(on?c.text:'Masquée')}</small>
          <details><summary>Détails</summary><p>${esc(p.note)}</p></details></div>
        <div class="prow-ctl">
          <button type="button" class="icon" data-move="${pid}" data-dir="-1" ${i===0?'disabled':''} aria-label="Monter ${esc(p.name)}">↑</button>
          <button type="button" class="icon" data-move="${pid}" data-dir="1" ${i===order.length-1?'disabled':''} aria-label="Descendre ${esc(p.name)}">↓</button>
          <label class="switch" title="Afficher"><input type="checkbox" data-visible="${pid}" ${on?'checked':''} aria-label="Afficher ${esc(p.name)}"><span></span></label>
          ${hasAuto?`<label class="mini-check"><input type="checkbox" data-auto="${pid}" ${auto.disabled?.[pid]?'':'checked'}> Lecture auto</label>`:''}
        </div></div>`;
    }).join('');
    for(const b of document.querySelectorAll('[data-move]'))b.onclick=async()=>{
      const list=A.cleanOrder(state.settings.platformOrder),i=list.indexOf(b.dataset.move),j=i+Number(b.dataset.dir);
      if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];
      await set({platformOrder:list});
    };
    for(const c of document.querySelectorAll('[data-visible]'))c.onchange=async()=>{
      const hidden={...state.settings.platformHidden};if(c.checked)delete hidden[c.dataset.visible];else hidden[c.dataset.visible]=true;
      await set({platformHidden:hidden});
    };
    for(const c of document.querySelectorAll('[data-auto]'))c.onchange=async()=>{
      c.disabled=true;try{await A.request('autoSet',{platform:c.dataset.auto,enabled:c.checked});auto=(await U.loadExtras()).auto;notice('Réglage enregistré.');}
      catch(e){c.checked=!c.checked;notice(e.message);}finally{c.disabled=false;}
    };
  }
  async function set(patch){
    try{await A.saveSettings(patch);state=await A.getState();render();notice('Réglage enregistré.');}
    catch(e){notice(e.message);render();}
  }
  function threshold(){
    const v=state.settings.alertThreshold,preset=['70','80','90','95'].includes(String(v));
    $('threshold').value=preset?String(v):'custom';$('threshold-custom').hidden=preset;$('threshold-custom').value=v;
  }
  $('threshold').onchange=async()=>{
    if($('threshold').value==='custom'){$('threshold-custom').hidden=false;$('threshold-custom').focus();return;}
    await set({alertThreshold:Number($('threshold').value)});
  };
  $('threshold-custom').onchange=async()=>{const n=Number($('threshold-custom').value);if(n>=50&&n<=99)await set({alertThreshold:n});else notice('Choisis une valeur entre 50 et 99 %.');};
  function render(){
    platforms();threshold();
    for(const input of document.querySelectorAll('[data-setting]'))input.checked=!!state.settings[input.dataset.setting];
  }
  for(const input of document.querySelectorAll('[data-setting]'))input.addEventListener('change',async()=>{
    await set({[input.dataset.setting]:input.checked});
  });
  async function awake(){
    for(const r of document.querySelectorAll('input[name="awakeMode"]'))r.checked=r.value===state.settings.awakeMode;
    $('awake-state').textContent='Vérification…';$('awake-state').className='muted';
    try{
      const s=await A.request('awakeStatus'),t=U.awakeText(s);$('awake-state').textContent=t.text;$('awake-state').className=t.cls;
      const nativeOk=s.mode==='stay'&&s.supported!==false&&s.reachable;
      $('awake-test').hidden=!nativeOk;
      let cmd='',why='',note='';
      if(s.mode==='wake'&&U.isMac()){
        why='Colle cette commande dans Terminal (Applications › Utilitaires), appuie sur Entrée, puis tape ton mot de passe de session (il ne s’affiche pas pendant la frappe, c’est normal). macOS confirme sans message : le réveil est programmé.';
        if(s.nextAt){cmd=A.pmsetCommand(s.nextAt-2*60000);note=`Réveil à ${A.dayClock(s.nextAt-2*60000)}, 2 min avant ta prochaine relance (${A.dayClock(s.nextAt)}). À refaire pour chaque nouvelle relance.`;}
        else note='Aucune relance programmée : la commande apparaîtra ici (et dans la pastille) dès que tu en programmes une.';
      }else if(s.mode==='stay'&&U.isMac()&&!nativeOk){
        why='Colle cette commande dans Terminal et appuie sur Entrée. Rien ne s’affiche : c’est normal, elle attend. Laisse la fenêtre ouverte ; elle s’arrête seule. Pour arrêter plus tôt, ferme la fenêtre.';
        if(s.until>Date.now()){cmd=A.caffeinateCommand(s.until);note=`Mac éveillé jusqu’à ${A.dayClock(s.until)}.`;}
        else note=s.tooFar?'Ta relance est prévue dans plus de 12 h : préfère le « Réveil programmé ».':'Aucune relance programmée : la commande apparaîtra ici dès que tu en programmes une.';
      }
      $('awake-terminal').hidden=!(why);
      $('awake-why').textContent=why;$('awake-cmd').textContent=cmd;$('awake-cmd').hidden=!cmd;$('awake-copy').hidden=!cmd;$('awake-cmd-note').textContent=note;
    }catch(e){$('awake-state').textContent=e.message;}
  }
  for(const r of document.querySelectorAll('input[name="awakeMode"]'))r.addEventListener('change',async()=>{if(r.checked){await set({awakeMode:r.value});awake();}});
  $('awake-refresh').onclick=awake;
  $('awake-copy').onclick=async()=>{
    try{await navigator.clipboard.writeText($('awake-cmd').textContent);notice('Commande copiée : colle-la dans Terminal (⌘V) puis Entrée.');}
    catch{const r=document.createRange();r.selectNodeContents($('awake-cmd'));getSelection().removeAllRanges();getSelection().addRange(r);notice('Copie refusée : la commande est sélectionnée, fais ⌘C.');}
  };
  $('awake-test').onclick=async()=>{
    const b=$('awake-test');b.disabled=true;$('awake-state').textContent='Test en cours…';
    try{const s=await A.request('awakeTest'),t=U.awakeText(s);$('awake-state').textContent=t.text;$('awake-state').className=t.cls;
      notice(s.appRunning?'Test réussi : l’app AI Flow maintient le Mac éveillé pendant 2 minutes (voir la barre des menus).':'Test échoué : l’app AI Flow ne répond pas. Vérifie qu’elle est installée (voir docs/INSTALLATION.md).');}
    catch(e){notice(e.message);await awake();}
    finally{b.disabled=false;}
  };
  $('export').onclick=async()=>{
    const {history}=await U.loadExtras();
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),note:'Mesures réelles uniquement : [horodatage ms, % utilisé, reset annoncé ms]. Les trous = aucun relevé.',history},null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='AI-Flow-historique.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000);
  };
  $('clear-history').onclick=async()=>{if(!confirm('Effacer l’historique de consommation ?'))return;try{await A.request('clearHistory');notice('Historique effacé.');}catch(e){notice(e.message);}};
  $('clear').onclick=async()=>{if(!confirm('Supprimer tous les relevés, l’historique et les diagnostics ?'))return;try{await A.request('clear');state=await A.getState();render();notice('Relevés supprimés. Ils reviendront à la prochaine lecture d’un onglet ouvert.');}catch(e){notice(e.message);}};
  // Version et mises à jour
  async function dev(){
    try{
      const d=await A.request('devInfo',null,{timeout:5000});
      $('dev-version').textContent=d.versionName+(d.appBuild?` · app build ${d.appBuild}`:'');
      $('channel').textContent=d.channel==='dev'?'canal de développement':'version publique';
      $('dev-update').hidden=!d.native;
      $('dev-note').textContent=d.native?'Les nouvelles versions arrivent automatiquement : l’app AI Flow Dev vérifie toutes les heures et propose « Installer et relancer ». Tu peux aussi vérifier maintenant.'
        :'Extension chargée sans l’app AI Flow Dev (extension temporaire ou Chrome/Edge) : pas de mise à jour automatique ici. Installe l’app une fois (docs/DEV-WORKFLOW.md).';
    }catch(e){$('dev-version').textContent=manifest.version_name||manifest.version;}
  }
  $('dev-update').onclick=async()=>{try{await A.request('devCheckUpdate',null,{timeout:8000});$('dev-status').textContent='Recherche lancée : la fenêtre de mise à jour de l’app AI Flow Dev va s’ouvrir.';}catch(e){$('dev-status').textContent=e.message;}};
  $('dev-reload').onclick=async()=>{$('dev-status').textContent='Rechargement…';try{await A.request('reload',null,{timeout:3000});}catch{}setTimeout(()=>location.reload(),1200);};
  $('data-export').onclick=async()=>{
    try{const b=await A.request('exportData');const blob=new Blob([JSON.stringify(b,null,2)],{type:'application/json'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`AI-Flow-sauvegarde-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000);
      $('dev-status').textContent=`Sauvegarde créée (${Object.keys(b.data).length} éléments). Restaure-la dans la nouvelle installation.`;}
    catch(e){$('dev-status').textContent=e.message;}
  };
  $('data-import').onclick=()=>$('data-file').click();
  $('data-file').onchange=async()=>{
    const f=$('data-file').files[0];if(!f)return;
    try{const b=JSON.parse(await f.text());
      if(!confirm('Restaurer cette sauvegarde ? Les données actuelles d’AI Flow seront remplacées par celles du fichier.'))return;
      const r=await A.request('importData',b);$('dev-status').textContent=`Sauvegarde restaurée (${r.keys} éléments).`;state=await A.getState();render();}
    catch(e){$('dev-status').textContent=e instanceof SyntaxError?'Ce fichier n’est pas une sauvegarde AI Flow.':e.message;}
    finally{$('data-file').value='';}
  };
  dev();
  // Barre de menus : état réel du dernier envoi à l'app (réussi, app fermée, pas de réponse).
  const MENU_ERR={'app-not-running':'échec — l’app AI Flow Dev n’est pas ouverte (lance-la depuis Applications)','no-reply':'échec — pas de réponse de l’app (composant natif)'};
  function menuText(r){
    if(!r.native)return 'indisponible ici (sans l’app Mac)';
    if(!r.at)return 'aucun envoi pour l’instant';
    const when=A.dayClock(r.at);
    if(r.ok)return r.platforms?`réussi ${when} (${r.platforms} plateforme${r.platforms>1?'s':''})`:`réussi ${when}, mais aucun quota relevé à afficher`;
    return `${MENU_ERR[r.error]||'échec — l’app a refusé les données'} · ${when}`;
  }
  async function menuState(){try{$('menu-state').textContent=menuText(await A.request('menuBarStatus'));}catch{$('menu-state').textContent='inconnu';}}
  $('menu-send').onclick=async()=>{
    const b=$('menu-send');b.disabled=true;$('menu-state').textContent='Envoi…';
    try{const r=await A.request('menuBarSync',null,{timeout:8000});$('menu-state').textContent=menuText({native:r.reason!=='native',...r});}
    catch(e){$('menu-state').textContent=e.message;}finally{b.disabled=false;}
  };
  menuState();
  async function reload(){try{state=await A.getState();}catch{}auto=(await U.loadExtras()).auto;try{conn=await A.request('connectionStatuses');}catch{}render();}
  U.bindNav(document);render();await reload();awake();
  U.live(()=>{if(!document.activeElement?.closest?.('.prow'))reload();});
})();
