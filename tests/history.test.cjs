// Historique de consommation : mesures réelles, attribution signalée, resets, compatibilité, migration.
const test=require('node:test'),assert=require('node:assert/strict');
const {core,fakeBrowser,load}=require('./helpers.cjs');
const A=core().AIFlow;
const MIN=60000,H=3600000,NOW=Date.UTC(2026,10,3,14,0,0);
const plain=x=>JSON.parse(JSON.stringify(x));

test('enregistrement : chaque changement gardé, valeur identique espacée de 10 min',()=>{
  let h=A.recordHistory(null,[{id:'claude.session',percent:30,resetAt:NOW+H}],NOW-20*MIN);
  h=A.recordHistory(h,[{id:'claude.session',percent:30,resetAt:NOW+H}],NOW-18*MIN);
  h=A.recordHistory(h,[{id:'claude.session',percent:31,resetAt:NOW+H}],NOW-17.7*MIN);
  assert.equal(h.series['claude.session'].length,2);
  assert.equal(h.series['claude.session'][1][2],NOW+H,'reset annoncé conservé avec le point');
});
test('reset détecté par la date annoncée, même sans forte baisse',()=>{
  let h=A.recordHistory(null,[{id:'claude.session',percent:12,resetAt:NOW-MIN}],NOW-90*MIN);
  h=A.recordHistory(h,[{id:'claude.session',percent:8,resetAt:NOW+4*H}],NOW);
  assert.equal(h.resets.length,1);
});
test('consommation : mesure directe vs hausse constatée après une absence',()=>{
  const from=NOW-3*H;
  const pts=[[from+5*MIN,10],[from+15*MIN,25],[from+2*H+30*MIN,40]];
  const b=A.consumption(pts,from,NOW,H);
  assert.deepEqual(plain(b.map(x=>[x.direct,x.attributed,x.measured])),[[15,0,2],[0,0,0],[0,15,1]]);
});
test('consommation après un reset : la nouvelle valeur compte',()=>{
  const from=NOW-2*H;
  const b=A.consumption([[from+10*MIN,80],[from+20*MIN,90],[from+H+10*MIN,30]],from,NOW,H);
  assert.equal(b[0].used,10);assert.equal(b[1].used,30);assert.equal(b[1].resets,1);
});
test('anciens points [t,p] (0.8.x) toujours lus',()=>{
  const h=A.cleanHistory({series:{'claude.weekly':[[NOW-H,5],[NOW,6]]}},NOW);
  assert.equal(h.series['claude.weekly'].length,2);
  assert.equal(A.consumption(h.series['claude.weekly'],NOW-2*H,NOW+1,H).reduce((s,b)=>s+b.used,0),1);
});
test('migration : l’installation d’une nouvelle version ne supprime plus l’historique',async()=>{
  const fb=fakeBrowser();
  fb.store.ai_flow_history_v2={series:{'claude.session':[[Date.now()-H,20],[Date.now(),25]]},resets:[],limits:[]};
  load(['platforms.js','shared.js','readers.js','background.js'],{browser:fb.browser,__AIFLOW_TEST__:{}});
  await Promise.all(fb.listeners.installed.map(f=>f({reason:'update'})));
  await new Promise(r=>setTimeout(r,50));
  assert.equal(fb.store.ai_flow_history_v2.series['claude.session'].length,2);
});

test('vue plateformes : un quota par plateforme, sans additionner session et semaine',()=>{
  const h={series:{
    'claude.session':[[NOW-20*MIN,10],[NOW-10*MIN,30]],
    'claude.weekly':[[NOW-20*MIN,5],[NOW-10*MIN,8]],
    'codex.session':[[NOW-20*MIN,15],[NOW-10*MIN,25]]
  }};
  const before=JSON.stringify(h),s=A.platformConsumption(h,NOW-H,NOW,H);
  assert.deepEqual(plain(s.map(x=>[x.platform,x.metric,x.bars[0].used])),[
    ['claude','claude.session',20],['codex','codex.session',10]
  ]);
  assert.notEqual(s[0].color,s[1].color);
  assert.equal(JSON.stringify(h),before,'historique intact');
});
test('vue plateformes : repli hebdomadaire stable sur toute la période, absence distincte de zéro',()=>{
  const h={series:{'claude.session':[[NOW-10*H,80]],'claude.weekly':[[NOW-20*MIN,10],[NOW-10*MIN,10]]}};
  const s=A.platformConsumption(h,NOW-2*H,NOW,H);
  assert.equal(s[0].metric,'claude.weekly');
  assert.equal(s[0].bars[0].measured,0);
  assert.equal(s[0].bars[1].used,0);
  assert.equal(s[0].bars[1].measured,2);
  assert.equal(s[1].metric,null);assert.equal(s[1].bars.every(b=>b.measured===0),true);
});
test('vue plateformes : conserve resets et consommation constatée après une absence',()=>{
  const h={series:{'codex.session':[[NOW-3*H,80],[NOW-2*H,20],[NOW-10*MIN,35]]}};
  const s=A.platformConsumption(h,NOW-3*H,NOW,H).find(s=>s.platform==='codex');
  assert.equal(s.bars.reduce((n,b)=>n+b.used,0),35);
  assert.equal(s.bars.reduce((n,b)=>n+b.attributed,0),35);
  assert.equal(s.bars.reduce((n,b)=>n+b.resets,0),1);
});
