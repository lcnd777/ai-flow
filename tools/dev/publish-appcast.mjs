// Crée l'appcast Sparkle du canal de développement pour une archive donnée.
// Usage : node tools/dev/publish-appcast.mjs <archive.zip> <build> <version> <url-archive> [sortie.xml]
// La clé privée vient de SPARKLE_ED_PRIVATE_KEY (secret GitHub), jamais du dépôt.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {appcast,privateKeyFromSeed,publicKeyB64,sign} from './sparkle.mjs';

export function buildAppcast({bytes,build,version,url,privateSeed,notes,repoUrl,expectedPublicKey}){
  const key=privateKeyFromSeed(privateSeed);
  if(expectedPublicKey&&publicKeyB64(key)!==expectedPublicKey)throw new Error('La clé privée ne correspond pas à SUPublicEDKey de macos/project.yml : les mises à jour seraient refusées.');
  return appcast({link:repoUrl,items:[{build:String(build),shortVersion:version,url,length:bytes.length,signature:sign(bytes,key),notes}]});
}
if(import.meta.url===`file://${process.argv[1]}`){
  const [zip,build,version,url,out='appcast.xml']=process.argv.slice(2);
  if(!zip||!build||!version||!url){console.error('Usage : publish-appcast.mjs <archive.zip> <build> <version> <url> [sortie]');process.exit(1);}
  if(!process.env.SPARKLE_ED_PRIVATE_KEY){console.error('::error::Secret SPARKLE_ED_PRIVATE_KEY manquant : voir docs/DEV-WORKFLOW.md');process.exit(1);}
  const yml=readFileSync(new URL('../../macos/project.yml',import.meta.url),'utf8');
  const expectedPublicKey=(yml.match(/SUPublicEDKey:\s*(\S+)/)||[])[1];
  let notes='';try{notes=execFileSync('git',['log','-1','--pretty=%s%n%n%b']).toString().trim();}catch{}
  const xml=buildAppcast({bytes:readFileSync(zip),build,version,url,privateSeed:process.env.SPARKLE_ED_PRIVATE_KEY,notes,repoUrl:process.env.REPO_URL,expectedPublicKey});
  writeFileSync(out,xml);console.log(`Appcast écrit : ${out} (build ${build})`);
}
