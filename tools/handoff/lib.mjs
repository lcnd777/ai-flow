// AI Flow — Git Handoff v1 : paquet de passation entre agents (Claude Code, Codex, autres).
// Git reste la source de vérité : ce module LIT l'état du dépôt (aucune commande qui modifie, aucun réseau)
// et distingue publié / commité non poussé / modifié localement / simplement documenté / non vérifiable.
// Le cœur (tools/handoff/core.js + safari/sync.js) est partagé tel quel avec l'app macOS (JavaScriptCore).
import {execFileSync} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const ctx={console};ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(readFileSync(join(here,'..','..','safari','sync.js'),'utf8'),ctx,{filename:'sync.js'});
vm.runInContext(readFileSync(join(here,'core.js'),'utf8'),ctx,{filename:'core.js'});
const H=ctx.AIFlowHandoff;
// Résultats du contexte isolé normalisés en objets ordinaires.
const plain=v=>v===undefined?v:JSON.parse(JSON.stringify(v));
export const SCHEMA=H.SCHEMA,AGENTS=plain(H.AGENTS);
export const findSecrets=t=>plain(H.findSecrets(t)),maskSecrets=t=>H.maskSecrets(t),cleanRemote=u=>H.cleanRemote(u);

// Lecture seule. Toute commande échouée renvoie null (« non vérifiable »), jamais d'exception bloquante.
export function gitRunner(cwd){
  return (...args)=>{try{return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:32*1024*1024}).replace(/\n$/,'');}catch{return null;}};
}
export function readGitState(git){
  const raw={};
  for(const [k,args] of H.GIT_PHASE1)raw[k]=git(...args);
  if(!raw.top)return plain(H.parseGitState(null));
  for(const [k,args] of H.gitPhase2(raw))raw[k]=git(...args);
  // Fichiers non suivis : contenu lu localement (≤ 200 Ko chacun) uniquement pour la détection de secrets.
  let untracked='';
  for(const f of H.untrackedPaths(raw)){try{const p=join(raw.top,f);if(statSync(p).size<=200000)untracked+='\n'+readFileSync(p,'utf8');}catch{}}
  return plain(H.parseGitState(raw,untracked));
}
export const publication=st=>plain(H.publication(st));
export const buildHandoff=o=>plain(H.buildHandoff({...o,now:o.now instanceof Date?o.now.toISOString():o.now}));
export const renderMarkdown=h=>H.renderMarkdown(h);
export const agentPrompt=h=>H.agentPrompt(h);
export const prepare=(...a)=>H.prepare(...a);

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
