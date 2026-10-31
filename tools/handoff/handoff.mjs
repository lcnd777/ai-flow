#!/usr/bin/env node
// AI Flow Git Handoff — CLI. Usage :
//   node tools/handoff/handoff.mjs create --from claude-code --to codex --notes notes.json [--run "npm test"] [--out docs/handoff]
//   node tools/handoff/handoff.mjs verify [docs/handoff/latest.json]
//   node tools/handoff/handoff.mjs show [docs/handoff/latest.json]
// Aucune commande Git qui modifie le dépôt ; aucun commit ni push automatique.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {gitRunner,readGitState,buildHandoff,renderMarkdown,verifyHandoff,maskSecrets,AGENTS} from './lib.mjs';

function args(argv){const o={_:[]};for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const k=a.slice(2);const v=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;o[k]=o[k]===undefined?v:[].concat(o[k],v);}else o._.push(a);}return o;}
const o=args(process.argv.slice(2)),cmd=o._[0]||'help',cwd=resolve(o.cwd||process.cwd()),git=gitRunner(cwd);
const outDir=resolve(cwd,o.out||'docs/handoff');
const file=resolve(cwd,o._[1]||join(outDir,'latest.json'));

if(cmd==='create'){
  let notes={};
  if(o.notes)notes=JSON.parse(readFileSync(resolve(cwd,o.notes),'utf8'));
  for(const k of ['mission','environment','destination'])if(typeof o[k]==='string')notes[k]=o[k];
  for(const k of ['done','notDone','decisions','constraints','problems','next'])if(o[k]!==undefined)notes[k]=[...[].concat(notes[k]||[]),...[].concat(o[k])];
  const tests=[];
  for(const c of [].concat(o.run||[])){
    const r=spawnSync(c,{cwd,shell:true,encoding:'utf8',maxBuffer:64*1024*1024});
    const tail=maskSecrets(((r.stdout||'')+(r.stderr||'')).trim().split('\n').slice(-3).join(' | ')).slice(0,300);
    tests.push({command:c,exitCode:r.status,result:r.status===0?'réussi':'échec',summary:tail});
  }
  const h=buildHandoff({state:readGitState(git),notes,from:o.from||'generic',to:o.to||'generic',tests});
  mkdirSync(outDir,{recursive:true});
  writeFileSync(join(outDir,'latest.json'),JSON.stringify(h,null,2)+'\n');
  writeFileSync(join(outDir,'LATEST.md'),renderMarkdown(h));
  console.log(`Passation écrite : ${join(outDir,'LATEST.md')} (${h.publication.label}).`);
  if(h.publication.level!=='published')console.log('⚠️  Le travail n’est pas entièrement publié : commite et pousse, puis régénère la passation.');
  if(h.git.secretsInChanges?.count)console.log(`⚠️  Secrets probables dans les modifications : ${h.git.secretsInChanges.types.join(', ')}.`);
  process.exit(0);
}
if(cmd==='verify'||cmd==='show'){
  if(!existsSync(file)){console.error(`Aucune passation trouvée (${file}).`);process.exit(2);}
  const h=JSON.parse(readFileSync(file,'utf8'));
  if(cmd==='show'){console.log(renderMarkdown(h));process.exit(0);}
  const r=verifyHandoff(h,git);
  for(const c of r.checks)console.log(`${c.level==='ok'?'✓':c.level==='error'?'✗':'!'} ${c.msg}`);
  console.log(r.ok?'Passation cohérente avec ce dépôt (vérifie les points « ! »).':'Passation incohérente avec ce dépôt : ne reprends pas avant d’avoir résolu les points « ✗ ».');
  process.exit(r.ok?0:1);
}
console.log(`AI Flow Git Handoff
  create  --from ${Object.keys(AGENTS).join('|')} --to … [--notes fichier.json] [--mission …] [--done …] [--next …] [--run "npm test"] [--out dossier]
  verify  [fichier.json]   contrôle que la passation correspond au dépôt (Git = source de vérité)
  show    [fichier.json]   affiche la passation en Markdown`);
