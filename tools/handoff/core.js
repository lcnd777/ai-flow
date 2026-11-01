/* AI Flow — Git Handoff v1, cœur PUR (aucun accès fichier, réseau ou processus).
 * Exécuté à l'identique par la CLI Node (tools/handoff/lib.mjs) et par l'app macOS (JavaScriptCore).
 * L'appelant exécute les commandes Git en LECTURE listées ici et lui passe les sorties brutes.
 * Dépend de safari/sync.js (AIFlowSync.findSecrets / maskSecrets), chargé avant. */
(function(root){
  'use strict';
  const SCHEMA='ai-flow.handoff/v1';
  const AGENTS={'claude-code':'Claude Code',codex:'Codex',cursor:'Cursor',generic:'Agent compatible'};
  const S=()=>root.AIFlowSync;
  const findSecrets=t=>S().findSecrets(t),maskSecrets=t=>S().maskSecrets(t);
  // Commandes Git autorisées : lecture seule.
  const GIT_PHASE1=[['top',['rev-parse','--show-toplevel']],['branch',['rev-parse','--abbrev-ref','HEAD']],['head',['rev-parse','HEAD']],
    ['upstream',['rev-parse','--abbrev-ref','--symbolic-full-name','@{u}']],['remote',['remote','get-url','origin']],
    ['status',['status','--porcelain=v1','--untracked-files=all']],['diffHead',['diff','HEAD']],['diffCached',['diff','--cached']],
    ['stash',['stash','list']],['recent',['log','-8','--format=%h%x09%s']],['headSubject',['log','-1','--format=%s']],['headDate',['log','-1','--format=%cI']]];
  function gitPhase2(raw){
    const out=[];
    if(raw.head)out.push(['onRemote',['branch','-r','--contains',raw.head]]);
    if(raw.upstream){out.push(['counts',['rev-list','--left-right','--count',`${raw.upstream}...HEAD`]]);out.push(['unpushed',['log','--format=%H%x09%s',`${raw.upstream}..HEAD`]]);out.push(['unpushedDiff',['diff',`${raw.upstream}..HEAD`]]);}
    return out;
  }
  const lines=s=>s?String(s).split('\n').filter(Boolean):[];
  const cleanRemote=u=>u?String(u).replace(/\/\/[^@/]+@/,'//').replace(/\.git$/,''):null;
  function statusFiles(raw){
    return lines(raw.status).map(l=>{const x=l[0],y=l[1],path=l.slice(3);return {path,state:x==='?'?'untracked':x!==' '&&y===' '?'staged':x===' '?'modified':'staged+modified',code:l.slice(0,2)};});
  }
  const untrackedPaths=raw=>statusFiles(raw).filter(f=>f.state==='untracked').map(f=>f.path).slice(0,200);
  function parseGitState(raw,untrackedText='',diffLimit=400000){
    if(!raw||!raw.top)return {available:false,reason:'Pas un dépôt Git accessible depuis cet environnement.'};
    let ahead=null,behind=null;
    if(raw.counts){[behind,ahead]=String(raw.counts).trim().split(/\s+/).map(Number);}
    const unpushed=lines(raw.unpushed).map(l=>{const [sha,...m]=l.split('\t');return {sha,subject:m.join('\t')};});
    const scan=((raw.diffHead||'')+'\n'+(raw.diffCached||'')+'\n'+(raw.unpushed&&unpushed.length?raw.unpushedDiff||'':'')+'\n'+(untrackedText||'')).slice(0,diffLimit);
    const secrets=findSecrets(scan).map(s=>s.type);
    return {available:true,root:raw.top,remote:cleanRemote(raw.remote),branch:raw.branch,head:raw.head,headSubject:raw.headSubject,headDate:raw.headDate,
      upstream:raw.upstream||null,ahead,behind,unpushed,onRemote:lines(raw.onRemote).map(s=>s.trim()).filter(s=>!s.includes('->')),
      files:statusFiles(raw),stashes:lines(raw.stash).length,
      recent:lines(raw.recent).map(l=>{const [sha,...m]=l.split('\t');return {sha,subject:m.join('\t')};}),
      secrets:{count:secrets.length,types:[...new Set(secrets)]}};
  }
  function publication(st){
    if(!st.available)return {level:'unverifiable',label:'Non vérifiable depuis cet environnement'};
    const local=st.files.length>0,unp=(st.ahead||0)>0;
    if(!st.upstream)return {level:'local-only',label:st.onRemote.length?`Branche « ${st.branch} » non publiée (son commit existe sur ${st.onRemote[0]})${local?', avec des modifications locales non commitées':''}`:'Branche jamais publiée : tout le travail est local',local,unpushed:!st.onRemote.length};
    if(unp&&local)return {level:'local-changes',label:'Commits non poussés et modifications non commitées',local,unpushed:true};
    if(unp)return {level:'committed-not-pushed',label:'Commité localement, non poussé',local:false,unpushed:true};
    if(local)return {level:'local-changes',label:'Publié sur GitHub, avec des modifications locales non commitées',local:true,unpushed:false};
    return {level:'published',label:'Publié : le dépôt distant contient exactement ce commit',local:false,unpushed:false};
  }
  const arr=v=>(Array.isArray(v)?v:v==null||v===''?[]:[v]).map(x=>typeof x==='string'?x.trim():x).filter(Boolean);
  function buildHandoff({state,notes={},from='generic',to='generic',now=new Date(),tests=[]}){
    const n=notes||{},mask=t=>typeof t==='string'?maskSecrets(t):t,list=v=>arr(v).map(x=>typeof x==='string'?mask(x):x);
    return {
      schema:SCHEMA,createdAt:(now instanceof Date?now:new Date(now)).toISOString(),
      agents:{from:AGENTS[from]?from:'generic',to:AGENTS[to]?to:'generic'},
      project:state.available?{repository:state.remote,branch:state.branch,commit:state.head,commitSubject:state.headSubject,commitDate:state.headDate,upstream:state.upstream,environment:n.environment||null}:{environment:n.environment||null},
      publication:publication(state),
      git:state.available?{ahead:state.ahead,behind:state.behind,unpushedCommits:state.unpushed,remoteBranchesContainingHead:state.onRemote,
        localChanges:state.files,stashes:state.stashes,recentCommits:state.recent,secretsInChanges:state.secrets}:{unavailable:state.reason},
      mission:mask(n.mission||''),
      done:list(n.done),notDone:list(n.notDone),decisions:list(n.decisions),constraints:list(n.constraints),problems:list(n.problems),next:list(n.next),
      tests:[...arr(n.tests),...tests].map(t=>typeof t==='string'?{command:mask(t),result:'documenté, non exécuté par l’outil'}:{command:mask(t.command||''),result:mask(t.result||''),exitCode:Number.isInteger(t.exitCode)?t.exitCode:null,summary:mask(t.summary||'')}),
      destination:mask(n.destination||''),
      claims:'Les rubriques mission / fait / décisions / problèmes sont déclaratives. Seule la section git est relevée automatiquement.'
    };
  }
  const AGENT_HINTS={
    'claude-code':'Claude Code : lis CLAUDE.md, puis lance la vérification ci-dessous avant toute modification.',
    codex:'Codex : lis AGENTS.md, puis lance la vérification ci-dessous avant toute modification. Si tes crédits sont limités, commite et pousse après chaque étape et régénère cette passation.',
    cursor:'Cursor : ouvre le dépôt à la branche indiquée, puis lance la vérification ci-dessous.',
    generic:'Lance la vérification ci-dessous avant toute modification.'
  };
  function renderMarkdown(h){
    const b=a=>a.length?a.map(x=>`- ${typeof x==='string'?x:JSON.stringify(x)}`).join('\n'):'- (non renseigné)';
    const p=h.project,g=h.git;
    const files=g.localChanges?.length?g.localChanges.map(f=>`- \`${f.path}\` — ${{untracked:'nouveau, non suivi',staged:'indexé, non commité',modified:'modifié, non commité','staged+modified':'indexé puis modifié'}[f.state]}`).join('\n'):'- Aucune';
    return `# Passation ${AGENTS[h.agents.from]} → ${AGENTS[h.agents.to]}

> Généré par AI Flow Git Handoff (${h.schema}) le ${h.createdAt}.
> **Git est la source de vérité.** Ce document résume ; il ne prouve pas que le code existe. Vérifie avec :
> \`node tools/handoff/handoff.mjs verify\`

## Projet
- Dépôt : ${p.repository||'non vérifiable'}
- Branche : \`${p.branch||'?'}\`${p.upstream?` (suit \`${p.upstream}\`)`:' (aucune branche distante suivie)'}
- Commit : \`${p.commit||'?'}\` — ${p.commitSubject||''}
${p.environment?`- Environnement : ${p.environment}\n`:''}
## État de publication
**${h.publication.label}.**
${g.unpushedCommits?.length?`\nCommits non poussés :\n${g.unpushedCommits.map(c=>`- \`${c.sha.slice(0,7)}\` ${c.subject}`).join('\n')}\n`:''}
Modifications locales non commitées :
${files}
${g.stashes?`\n${g.stashes} remise(s) (stash) présente(s) : ne pas les supprimer.\n`:''}${g.secretsInChanges?.count?`\n⚠️ Secrets probables dans les modifications (${g.secretsInChanges.types.join(', ')}) : ne pas les publier.\n`:''}
## Mission en cours
${h.mission||'(non renseignée)'}

## Travail terminé (déclaratif — à vérifier dans Git)
${b(h.done)}

## Travail non terminé
${b(h.notDone)}

## Décisions techniques et contraintes
${b([...h.decisions,...h.constraints])}

## Vérifications
${h.tests.length?h.tests.map(t=>`- \`${t.command}\` → ${t.result}${t.summary?` (${t.summary})`:''}`).join('\n'):'- Aucune vérification enregistrée'}

## Problèmes connus
${b(h.problems)}

## Prochaines actions
${h.next.length?h.next.map((x,i)=>`${i+1}. ${x}`).join('\n'):'1. (non renseignées)'}

## Pour ${AGENTS[h.agents.to]}
${AGENT_HINTS[h.agents.to]}
${h.destination?`\n${h.destination}\n`:''}
Règles : ne jamais effacer de modifications locales, pas de push forcé sans validation, ne pas considérer une PR ouverte comme intégrée ni une compilation réussie comme un déploiement.
`;
  }
  // Message à coller dans l'agent destinataire : court, renvoie au dépôt (source de vérité) plutôt qu'à un résumé.
  // inline : la passation complète est jointe au message (elle n'est pas forcément dans le dépôt).
  function agentPrompt(h,opts={}){
    const p=h.project,repo=(p.repository||'').replace(/^https?:\/\/github\.com\//,'');
    const warn=h.publication.level==='published'?'':`\nAttention : ${h.publication.label.toLowerCase()}. Ces changements ne sont pas sur GitHub : si tu travailles dans le cloud, tu ne les vois pas — demande-moi de les publier avant de continuer.`;
    return `Reprends le développement du projet ${repo||'(dépôt local)'}${p.branch?` sur la branche ${p.branch}`:''}${p.commit?` (commit ${p.commit.slice(0,7)})`:''}.
1. Lis ${h.agents.to==='codex'?'AGENTS.md':h.agents.to==='claude-code'?'CLAUDE.md puis AGENTS.md':'AGENTS.md'} puis ${opts.inline?'la passation ci-dessous':'docs/handoff/LATEST.md'} (passation de ${AGENTS[h.agents.from]}).
2. Vérifie-la contre le dépôt : node tools/handoff/handoff.mjs verify — Git fait foi, pas le résumé.
3. Ne refais pas d’audit complet : reprends directement les « Prochaines actions »${h.next.length?` (d’abord : ${h.next[0]})`:''}.
${h.mission?`Mission : ${h.mission}\n`:''}Ne supprime aucune modification locale et ne fais pas de push forcé.${warn}${opts.inline?`\n\n---\n\n${renderMarkdown(h)}`:''}`;
  }
  // Point d'entrée de l'app macOS : tout en chaînes JSON, un seul appel.
  function prepare(rawJSON,untrackedText,notesJSON,from,to,nowISO){
    try{
      const state=parseGitState(JSON.parse(rawJSON),untrackedText);
      const h=buildHandoff({state,notes:notesJSON?JSON.parse(notesJSON):{},from,to,now:nowISO?new Date(nowISO):new Date()});
      return JSON.stringify({ok:true,handoff:h,markdown:renderMarkdown(h),prompt:agentPrompt(h),promptInline:agentPrompt(h,{inline:true}),state:{available:state.available,reason:state.reason||null}});
    }catch(e){return JSON.stringify({ok:false,error:String(e&&e.message||e)});}
  }
  root.AIFlowHandoff={SCHEMA,AGENTS,GIT_PHASE1,gitPhase2,cleanRemote,untrackedPaths,parseGitState,publication,buildHandoff,renderMarkdown,agentPrompt,prepare,findSecrets,maskSecrets};
})(typeof window!=='undefined'?window:globalThis);
