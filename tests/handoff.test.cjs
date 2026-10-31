// Git Handoff v1 : lecture seule de Git, distinction publié / non poussé / local, secrets, vérification par l'agent destinataire.
const test=require('node:test'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const CLI=path.join(__dirname,'..','tools','handoff','handoff.mjs');
const lib=()=>import(path.join(__dirname,'..','tools','handoff','lib.mjs'));
const sh=(cwd,...a)=>execFileSync('git',a,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function repos(){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'aiflow-handoff-'));
  const remote=path.join(base,'remote.git'),work=path.join(base,'work');
  sh(base,'init','-q','--bare','-b','main',remote);sh(base,'clone','-q',remote,work);
  for(const [k,v] of [['user.email','t@t'],['user.name','T'],['commit.gpgsign','false']])sh(work,'config',k,v);
  fs.writeFileSync(path.join(work,'a.txt'),'v1\n');sh(work,'add','.');sh(work,'commit','-qm','init');sh(work,'push','-q','origin','main');
  return {base,remote,work};
}
const run=(cwd,...a)=>{try{return {code:0,out:execFileSync('node',[CLI,...a],{cwd,encoding:'utf8'})};}catch(e){return {code:e.status,out:String(e.stdout)+String(e.stderr)};}};
test('dépôt publié : passation complète, cohérente à la vérification, aucune modification du dépôt',async()=>{
  const {work}=repos();const before=sh(work,'status','--porcelain');
  const r=run(work,'create','--from','claude-code','--to','codex','--mission','Finir le module','--done','Module A','--next','Écrire les tests','--out','.handoff');
  assert.equal(r.code,0);
  const h=JSON.parse(fs.readFileSync(path.join(work,'.handoff','latest.json'),'utf8'));
  assert.equal(h.schema,'ai-flow.handoff/v1');assert.equal(h.publication.level,'published');
  assert.equal(h.project.commit,sh(work,'rev-parse','HEAD'));assert.deepEqual(h.next,['Écrire les tests']);
  assert.match(fs.readFileSync(path.join(work,'.handoff','LATEST.md'),'utf8'),/Passation Claude Code → Codex[\s\S]*Git est la source de vérité/);
  // La passation elle-même est un fichier nouveau ; rien d'autre n'a changé.
  assert.equal(before,'');assert.equal(sh(work,'status','--porcelain'),'?? .handoff/');
  assert.equal(run(work,'verify','.handoff/latest.json').code,0);
});
test('commits non poussés et modifications locales signalés ; l’agent suivant ne les voit pas',async()=>{
  const {base,remote,work}=repos();
  fs.writeFileSync(path.join(work,'a.txt'),'v2\n');sh(work,'commit','-qam','local seulement');
  fs.writeFileSync(path.join(work,'b.txt'),'brouillon\n');
  run(work,'create','--to','codex','--out','.handoff');
  const h=JSON.parse(fs.readFileSync(path.join(work,'.handoff','latest.json'),'utf8'));
  assert.equal(h.publication.level,'local-changes');assert.equal(h.git.unpushedCommits.length,1);
  assert.ok(h.git.localChanges.some(f=>f.path==='b.txt'&&f.state==='untracked'));
  // Autre agent, autre copie : le commit de la passation n'existe pas → refus de reprendre.
  const other=path.join(base,'other');sh(base,'clone','-q',remote,other);
  fs.mkdirSync(path.join(other,'.handoff'));fs.copyFileSync(path.join(work,'.handoff','latest.json'),path.join(other,'.handoff','latest.json'));
  const v=run(other,'verify','.handoff/latest.json');
  assert.equal(v.code,1);assert.match(v.out,/absent[\s\S]*n’a pas été poussé/);
});
test('branche jamais publiée, secrets détectés et masqués, identifiants retirés de l’adresse du dépôt',async()=>{
  const {work}=repos();const L=await lib();
  sh(work,'checkout','-qb','feature');
  fs.writeFileSync(path.join(work,'c.txt'),'cle = sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX12\n');
  const st=L.readGitState(L.gitRunner(work));
  assert.equal(L.publication(st).level,'local-only');assert.ok(st.secrets.count>=1);
  const h=L.buildHandoff({state:st,notes:{mission:'utilise sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX12',tests:['npm test']}});
  assert.ok(!JSON.stringify(h).includes('sk-proj-ABCDEF'),'aucun secret dans la passation');
  assert.equal(h.tests[0].result,'documenté, non exécuté par l’outil');
  assert.equal(L.cleanRemote('https://user:ghp_secret@github.com/o/r.git'),'https://github.com/o/r');
});
test('vérification : dépôt différent ou format inconnu refusés ; hors dépôt Git = non vérifiable',async()=>{
  const L=await lib();const {work}=repos();
  const st=L.readGitState(L.gitRunner(work));const h=L.buildHandoff({state:st});
  assert.equal(L.verifyHandoff({...h,project:{...h.project,repository:'https://github.com/autre/depot'}},L.gitRunner(work)).ok,false);
  assert.equal(L.verifyHandoff({schema:'x'},L.gitRunner(work)).ok,false);
  const none=fs.mkdtempSync(path.join(os.tmpdir(),'aiflow-nogit-'));
  assert.equal(L.readGitState(L.gitRunner(none)).available,false);
  assert.equal(L.publication(L.readGitState(L.gitRunner(none))).level,'unverifiable');
});
test('--run exécute les vérifications et enregistre le résultat réel',async()=>{
  const {work}=repos();
  run(work,'create','--run','node -e "process.exit(3)"','--out','.handoff');
  const h=JSON.parse(fs.readFileSync(path.join(work,'.handoff','latest.json'),'utf8'));
  assert.equal(h.tests[0].exitCode,3);assert.equal(h.tests[0].result,'échec');
});
