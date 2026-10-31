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
  function render(){
    platforms();
    for(const input of document.querySelectorAll('[data-setting]'))input.checked=!!state.settings[input.dataset.setting];
  }
  for(const input of document.querySelectorAll('[data-setting]'))input.addEventListener('change',async()=>{
    await set({[input.dataset.setting]:input.checked});
    if(input.dataset.setting==='awakeEnabled')awake();
  });
  async function awake(){
    $('awake-state').textContent='Vérification…';$('awake-state').className='muted';
    try{const s=await A.request('awakeStatus'),t=U.awakeText(s);$('awake-state').textContent=t.text;$('awake-state').className=t.cls;
      const terminal=s.enabled&&U.isMac()&&(s.supported===false||!s.reachable)&&s.error!=='unsupported-platform';
      $('awake-test').hidden=terminal;$('awake-test').disabled=!s.enabled||s.supported===false;
      $('awake-terminal').hidden=!terminal;
      if(terminal){
        const cmd=A.caffeinateCommand(s.until);
        $('awake-cmd').textContent=cmd||'caffeinate -i -t 7200';
        $('awake-cmd-note').textContent=cmd?`Calculée pour ta prochaine relance : Mac éveillé jusqu’à ${A.dayClock(s.until)}.`:(s.tooFar?'Ta relance est prévue dans plus de 12 h : programme-la plus près ou adapte la durée (en secondes).':'Aucune relance programmée : voici un exemple pour 2 heures. La commande exacte apparaîtra ici après avoir programmé une relance.');
      }}
    catch(e){$('awake-state').textContent=e.message;}
  }
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
  $('clear').onclick=async()=>{if(!confirm('Supprimer tous les relevés, l’historique et les diagnostics ?'))return;try{await A.request('clear');state=await A.getState();render();notice('Relevés supprimés. Ils reviendront à la prochaine lecture d’un onglet ouvert.');}catch(e){notice(e.message);}};
  async function reload(){try{state=await A.getState();}catch{}auto=(await U.loadExtras()).auto;try{conn=await A.request('connectionStatuses');}catch{}render();}
  U.bindNav(document);render();await reload();awake();
  U.live(()=>{if(!document.activeElement?.closest?.('.prow'))reload();});
})();
