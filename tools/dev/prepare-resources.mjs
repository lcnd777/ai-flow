// Prépare les fichiers de l'extension pour l'app de développement : copie de safari/,
// nom « AI Flow Dev », version = version du manifest + numéro de build (toujours croissante).
// Usage : node tools/dev/prepare-resources.mjs <build> [dossier-sortie]
import {cpSync,rmSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export function devManifest(manifest,build){
  if(!/^\d{1,5}$/.test(String(build))||Number(build)<1||Number(build)>65535)throw new Error('Numéro de build invalide (1 à 65535).');
  const base=String(manifest.version).split('.').slice(0,3).map(n=>Number(n)||0);
  while(base.length<3)base.push(0);
  return {...manifest,name:'AI Flow Dev',short_name:'AI Flow Dev',version:[...base,Number(build)].join('.'),version_name:`${base.join('.')} dev ${build}`,
    action:{...manifest.action,default_title:'AI Flow Dev'}};
}
export function prepare(root,build,out){
  rmSync(out,{recursive:true,force:true});mkdirSync(dirname(out),{recursive:true});
  cpSync(join(root,'safari'),out,{recursive:true});
  const m=JSON.parse(readFileSync(join(root,'safari','manifest.json'),'utf8'));
  const dev=devManifest(m,build);
  writeFileSync(join(out,'manifest.json'),JSON.stringify(dev,null,2)+'\n');
  return dev;
}
if(import.meta.url===`file://${process.argv[1]}`){
  const root=join(dirname(fileURLToPath(import.meta.url)),'..','..');
  const build=process.argv[2]||process.env.AIFLOW_BUILD||'1';
  const out=process.argv[3]||join(root,'macos','build','extension');
  const m=prepare(root,build,out);
  console.log(`Extension préparée : ${m.name} ${m.version} → ${out}`);
}
