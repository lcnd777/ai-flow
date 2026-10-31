// AI Flow — Git Handoff v1 : paquet de passation entre agents (Claude Code, Codex, autres).
// Git reste la source de vérité : ce module LIT l'état du dépôt (aucune commande qui modifie, aucun réseau)
// et distingue publié / commité non poussé / modifié localement / simplement documenté / non vérifiable.
import {execFileSync} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

export const SCHEMA='ai-flow.handoff/v1';
export const AGENTS={'claude-code':'Claude Code',codex:'Codex',cursor:'Cursor',generic:'Agent compatible'};

// Détection des secrets : même moteur que l'extension (safari/sync.js), chargé tel quel.
const here=dirname(fileURLToPath(import.meta.url));
let secretsEngine=null;
function engine(){
  if(!secretsEngine){const ctx={};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(readFileSync(join(here,'..','..','safari','sync.js'),'utf8'),ctx);secretsEngine=ctx.AIFlowSync;}
  return secretsEngine;
}
export const findSecrets=t=>engine().findSecrets(t);
export const maskSecrets=t=>engine().maskSecrets(t);

// Lecture seule. Toute commande échouée renvoie null (« non vérifiable »), jamais d'exception bloquante.
export function gitRunner(cwd){
  return (...args)=>{try{return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:32*1024*1024}).replace(/\n$/,'');}catch{return null;}};
}
// Adresse du dépôt sans identifiants (https://user:token@… → https://…).
export const cleanRemote=u=>u?u.replace(/\/\/[^@/]+@/,'//').replace(/\.git$/,''):null;
const lines=s=>s?s.split('\n').filter(Boolean):[];

export function readGitState(git,{diffLimit=400000}={}){
  const top=git('rev-parse','--show-toplevel');
  if(!top)return {available:false,reason:'Pas un dépôt Git accessible depuis cet environnement.'};
  const branch=git('rev-parse','--abbrev-ref','HEAD');
  const head=git('rev-parse','HEAD');
  const upstream=git('rev-parse','--abbrev-ref','--symbolic-full-name','@{u}');
  let ahead=null,behind=null,unpushed=[];
  if(upstream){
    const c=git('rev-list','--left-right','--count',`${upstream}...HEAD`);
    if(c){[behind,ahead]=c.split(/\s+/).map(Number);}
    unpushed=lines(git('log','--format=%H%x09%s',`${upstream}..HEAD`)).map(l=>{const [sha,...m]=l.split('\t');return {sha,subject:m.join('\t')};});
  }
  // Commit déjà présent sur une branche distante connue (dernière récupération locale ; aucune requête réseau).
  const onRemote=head?lines(git('branch','-r','--contains',head)).map(s=>s.trim()).filter(s=>!s.includes('->')):[];
  const status=lines(git('status','--porcelain=v1','--untracked-files=all'));
  const files=status.map(l=>{
    const x=l[0],y=l[1],path=l.slice(3);
    return {path,state:x==='?'?'untracked':x!==' '&&y===' '?'staged':x===' '?'modified':'staged+modified',code:l.slice(0,2)};
  });
  const diff=(git('diff','HEAD')||'')+'\n'+(git('diff','--cached')||'');
  const unpushedDiff=upstream&&unpushed.length?git('diff',`${upstream}..HEAD`)||'':'';
  // Fichiers non suivis : contenu lu localement (texte, ≤ 200 Ko chacun) uniquement pour la détection de secrets.
  let untracked='';
  for(const f of files.filter(f=>f.state==='untracked').slice(0,200)){
    try{const p=join(top,f.path);if(statSync(p).size<=200000)untracked+='\n'+readFileSync(p,'utf8');}catch{}
  }
  const scan=(diff+unpushedDiff+untracked).slice(0,diffLimit);
  const secrets=findSecrets(scan).map(s=>({type:s.type}));
  return {available:true,root:top,remote:cleanRemote(git('remote','get-url','origin')),branch,head,
    headSubject:git('log','-1','--format=%s'),headDate:git('log','-1','--format=%cI'),upstream,ahead,behind,unpushed,onRemote,
    files,stashes:lines(git('stash','list')).length,lastFetch:null,
    recent:lines(git('log','-8','--format=%h%x09%s')).map(l=>{const [sha,...m]=l.split('\t');return {sha,subject:m.join('\t')};}),
    secrets:{count:secrets.length,types:[...new Set(secrets.map(s=>s.type))]}};
}

// Publication : où en est réellement le travail ? (jamais déduit d'un résumé)
export function publication(st){
  if(!st.available)return {level:'unverifiable',label:'Non vérifiable depuis cet environnement'};
  const local=st.files.length>0,unp=(st.ahead||0)>0;
  if(!st.upstream)return {level:'local-only',label:st.onRemote.length?`Branche « ${st.branch} » non publiée (son commit existe sur ${st.onRemote[0]})${local?', avec des modifications locales non commitées':''}`:'Branche jamais publiée : tout le travail est local',local,unpushed:!st.onRemote.length};
  if(unp&&local)return {level:'local-changes',label:'Commits non poussés et modifications non commitées',local,unpushed:true};
  if(unp)return {level:'committed-not-pushed',label:'Commité localement, non poussé',local:false,unpushed:true};
  if(local)return {level:'local-changes',label:'Publié sur GitHub, avec des modifications locales non commitées',local:true,unpushed:false};
  return {level:'published',label:'Publié : le dépôt distant contient exactement ce commit',local:false,unpushed:false};
}

const arr=v=>(Array.isArray(v)?v:v==null||v===''?[]:[v]).map(x=>typeof x==='string'?x.trim():x).filter(Boolean);
export function buildHandoff({state,notes={},from='generic',to='generic',now=new Date(),tests=[]}){
  const n=notes||{};
  const mask=t=>typeof t==='string'?maskSecrets(t):t;
  const list=v=>arr(v).map(x=>typeof x==='string'?mask(x):x);
  const pub=publication(state);
  return {
    schema:SCHEMA,createdAt:now.toISOString(),
    agents:{from:AGENTS[from]?from:'generic',to:AGENTS[to]?to:'generic'},
    project:state.available?{repository:state.remote,branch:state.branch,commit:state.head,commitSubject:state.headSubject,commitDate:state.headDate,upstream:state.upstream,environment:n.environment||null}:{environment:n.environment||null},
    publication:pub,
    git:state.available?{ahead:state.ahead,behind:state.behind,unpushedCommits:state.unpushed,remoteBranchesContainingHead:state.onRemote,
      localChanges:state.files,stashes:state.stashes,recentCommits:state.recent,secretsInChanges:state.secrets}:{unavailable:state.reason},
    mission:mask(n.mission||''),
    done:list(n.done),notDone:list(n.notDone),decisions:list(n.decisions),constraints:list(n.constraints),
    problems:list(n.problems),next:list(n.next),
    tests:[...arr(n.tests),...tests].map(t=>typeof t==='string'?{command:mask(t),result:'documenté, non exécuté par l’outil'}:{command:mask(t.command||''),result:mask(t.result||''),exitCode:Number.isInteger(t.exitCode)?t.exitCode:null,summary:mask(t.summary||'')}),
    destination:mask(n.destination||''),
    // Ce que le paquet prétend vs ce qui est vérifiable : l'agent destinataire DOIT relancer « verify ».
    claims:'Les rubriques mission / fait / décisions / problèmes sont déclaratives. Seule la section git est relevée automatiquement.'
  };
}

const AGENT_HINTS={
  'claude-code':'Claude Code : lis CLAUDE.md, puis lance la vérification ci-dessous avant toute modification.',
  codex:'Codex : lis AGENTS.md, puis lance la vérification ci-dessous avant toute modification. Si tes crédits sont limités, commite et pousse après chaque étape et régénère cette passation.',
  cursor:'Cursor : ouvre le dépôt à la branche indiquée, puis lance la vérification ci-dessous.',
  generic:'Lance la vérification ci-dessous avant toute modification.'
};
export function renderMarkdown(h){
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

// Vérification par l'agent destinataire : le paquet décrit-il bien le dépôt actuel ?
export function verifyHandoff(h,git){
  const out=[];const add=(ok,msg,level=ok?'ok':'warn')=>out.push({ok,level,msg});
  if(h?.schema!==SCHEMA){add(false,'Format de passation inconnu ou absent.','error');return {ok:false,checks:out};}
  const p=h.project||{};
  if(!git('rev-parse','--show-toplevel')){add(false,'Aucun dépôt Git ici : impossible de vérifier le paquet.','error');return {ok:false,checks:out};}
  const remote=cleanRemote(git('remote','get-url','origin'));
  if(p.repository)add(remote===p.repository,remote===p.repository?`Dépôt : ${remote}`:`Dépôt différent : paquet ${p.repository}, ici ${remote}`,remote===p.repository?'ok':'error');
  if(p.commit){
    const exists=git('cat-file','-e',p.commit+'^{commit}')!==null;
    add(exists,exists?`Commit ${p.commit.slice(0,7)} présent localement.`:`Commit ${p.commit.slice(0,7)} absent : récupère la branche (git fetch) ; s’il reste absent, le travail n’a pas été poussé.`,exists?'ok':'error');
    if(exists){
      const remotes=(git('branch','-r','--contains',p.commit)||'').split('\n').map(s=>s.trim()).filter(s=>s&&!s.includes('->'));
      add(remotes.length>0,remotes.length?`Publié sur : ${remotes.join(', ')}.`:'Commit présent localement mais sur aucune branche distante connue : non publié (ou récupération à faire).');
      const head=git('rev-parse','HEAD');
      if(head!==p.commit){
        const desc=git('merge-base','--is-ancestor',p.commit,head)!==null;
        add(desc,desc?`HEAD (${head.slice(0,7)}) contient le commit du paquet : travail plus récent depuis la passation.`:`HEAD (${head.slice(0,7)}) ne contient pas le commit du paquet : change de branche ou récupère-la avant de reprendre.`);
      }else add(true,'HEAD correspond exactement au commit de la passation.');
    }
  }
  const branch=git('rev-parse','--abbrev-ref','HEAD');
  if(p.branch)add(branch===p.branch,branch===p.branch?`Branche ${branch}.`:`Branche actuelle ${branch}, paquet sur ${p.branch}.`);
  const declaredLocal=(h.git?.localChanges||[]).map(f=>f.path);
  if(declaredLocal.length)add(false,`${declaredLocal.length} fichier(s) étaient modifiés localement chez l’agent précédent et ne sont PAS dans Git : ${declaredLocal.slice(0,8).join(', ')}${declaredLocal.length>8?'…':''}.`);
  if(h.git?.unpushedCommits?.length)add(false,`${h.git.unpushedCommits.length} commit(s) n’étaient pas poussés au moment de la passation.`);
  return {ok:!out.some(c=>c.level==='error'),checks:out};
}
