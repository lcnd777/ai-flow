// Signature Ed25519 des mises à jour (format Sparkle 2 : SUPublicEDKey + sparkle:edSignature).
// Aucune dépendance : Node (crypto). Utilisé par la CI et par les tests.
import crypto from 'node:crypto';

const PKCS8_PREFIX=Buffer.from('302e020100300506032b657004220420','hex');
const SPKI_PREFIX=Buffer.from('302a300506032b6570032100','hex');

// Clé privée transportée comme secret : base64 de la graine Ed25519 (32 octets).
export function privateKeyFromSeed(b64){
  const seed=Buffer.from(String(b64||'').trim(),'base64');
  if(seed.length!==32)throw new Error('Clé privée Sparkle invalide : 32 octets attendus (base64).');
  return crypto.createPrivateKey({key:Buffer.concat([PKCS8_PREFIX,seed]),format:'der',type:'pkcs8'});
}
// Clé publique au format SUPublicEDKey : base64 des 32 octets bruts.
export function publicKeyB64(privateKey){
  const der=crypto.createPublicKey(privateKey).export({format:'der',type:'spki'});
  return der.subarray(der.length-32).toString('base64');
}
export function publicKeyFromB64(b64){
  const raw=Buffer.from(b64,'base64');
  if(raw.length!==32)throw new Error('SUPublicEDKey invalide');
  return crypto.createPublicKey({key:Buffer.concat([SPKI_PREFIX,raw]),format:'der',type:'spki'});
}
export function generate(){
  const {privateKey}=crypto.generateKeyPairSync('ed25519');
  const der=privateKey.export({format:'der',type:'pkcs8'});
  return {privateSeed:der.subarray(der.length-32).toString('base64'),publicKey:publicKeyB64(privateKey)};
}
export const sign=(bytes,privateKey)=>crypto.sign(null,bytes,privateKey).toString('base64');
export const verify=(bytes,sigB64,publicKey)=>crypto.verify(null,bytes,publicKey,Buffer.from(sigB64,'base64'));

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
// Flux de mises à jour (appcast) : une entrée par version, la plus récente en premier.
export function appcast({title='AI Flow Dev',link,items}){
  const entries=items.map(it=>`    <item>
      <title>${esc(it.title||`Version ${it.shortVersion} (build ${it.build})`)}</title>
      <pubDate>${new Date(it.date||Date.now()).toUTCString()}</pubDate>
      <sparkle:version>${esc(it.build)}</sparkle:version>
      <sparkle:shortVersionString>${esc(it.shortVersion)}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>${esc(it.minimumSystemVersion||'12.0')}</sparkle:minimumSystemVersion>
      ${it.notes?`<description><![CDATA[${String(it.notes).replace(/]]>/g,']]&gt;')}]]></description>`:''}
      <enclosure url="${esc(it.url)}" length="${it.length}" type="application/octet-stream" sparkle:edSignature="${esc(it.signature)}"/>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${esc(title)}</title>
    <link>${esc(link||'')}</link>
    <description>Canal de développement d’AI Flow (distinct de la version publique).</description>
${entries}
  </channel>
</rss>
`;
}
// Lecture minimale d'un appcast (tests et outil de mise à jour simulée).
export function parseAppcast(xml){
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([,b])=>({
    build:(b.match(/<sparkle:version>([^<]+)</)||[])[1],
    shortVersion:(b.match(/<sparkle:shortVersionString>([^<]+)</)||[])[1],
    url:(b.match(/enclosure url="([^"]+)"/)||[])[1]?.replace(/&amp;/g,'&'),
    length:Number((b.match(/length="(\d+)"/)||[])[1]),
    signature:(b.match(/sparkle:edSignature="([^"]+)"/)||[])[1]
  }));
}

// CLI : node tools/dev/sparkle.mjs generate | sign <fichier> (clé dans SPARKLE_ED_PRIVATE_KEY)
if(import.meta.url===`file://${process.argv[1]}`){
  const [cmd,file]=process.argv.slice(2);
  if(cmd==='generate'){const k=generate();console.log(JSON.stringify(k,null,2));}
  else if(cmd==='sign'){
    const {readFileSync}=await import('node:fs');
    const bytes=readFileSync(file);
    console.log(JSON.stringify({signature:sign(bytes,privateKeyFromSeed(process.env.SPARKLE_ED_PRIVATE_KEY)),length:bytes.length}));
  }else{console.error('Usage : node tools/dev/sparkle.mjs generate | sign <fichier>');process.exit(1);}
}
