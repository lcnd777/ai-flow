// Construit dist/chrome-edge (manifest service worker, sans nativeMessaging) et les archives de livraison.
// Usage : node tools/build.mjs [--zip]
import {cpSync,rmSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const src=join(root,'safari'),dist=join(root,'dist'),chrome=join(dist,'chrome-edge');
rmSync(dist,{recursive:true,force:true});
mkdirSync(dist,{recursive:true});
cpSync(src,chrome,{recursive:true});
const m=JSON.parse(readFileSync(join(src,'manifest.json'),'utf8'));
m.background={service_worker:'background.js'};
m.permissions=m.permissions.filter(p=>p!=='nativeMessaging').concat('notifications');
m.minimum_chrome_version='116';
writeFileSync(join(chrome,'manifest.json'),JSON.stringify(m,null,2)+'\n');
console.log('dist/chrome-edge prêt (version',m.version+')');

if(process.argv.includes('--zip')){
  const v=m.version;
  const safariZip=join(root,`AI-Flow-v${v}-Safari-Mac.zip`),chromeZip=join(root,`AI-Flow-v${v}-Chrome-Edge.zip`);
  for(const f of [safariZip,chromeZip])if(existsSync(f))rmSync(f);
  const files=['safari','native','docs','tests','tools','prepare-safari.sh','README.md','CHANGELOG.md','package.json'].filter(f=>existsSync(join(root,f)));
  execFileSync('zip',['-qr',safariZip,...files,'-x','*.DS_Store'],{cwd:root});
  execFileSync('zip',['-qr',chromeZip,'chrome-edge'],{cwd:dist});
  console.log('Archives :',safariZip,chromeZip);
}
