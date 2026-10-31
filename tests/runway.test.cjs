// Moteur de prévision (AI Runway / Quota Intelligence) : cas demandés explicitement.
const test=require('node:test'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {core}=require('./helpers.cjs');
const A=core().AIFlow;
const MIN=60000,H=3600000,DAY=24*H,NOW=Date.UTC(2026,10,3,14,0,0);
// Série de session : points [minutesAvant, %] dans la même fenêtre (reset dans resetIn).
function session(points,{resetIn=3*H,ageLast=0,id='claude.session'}={}){
  const last=points.at(-1);
  const s=A.clean({metrics:{[id]:{percent:last[1],source:'observed',observedAt:NOW-ageLast,resetAt:NOW+resetIn}}});
  s.history[id]=points.map(([ago,p])=>({ts:NOW-ago*MIN,percent:p,resetAt:NOW+resetIn}));
  return s;
}
const weekly=(percent,{resetIn})=>A.clean({metrics:{'claude.weekly':{percent,source:'observed',observedAt:NOW,resetAt:NOW+resetIn}}});

test('consommation stable : risque avec heure et niveau de confiance',()=>{
  const s=session([[60,10],[50,15],[40,20],[30,25],[20,30],[10,35],[0,40]],{resetIn:4*H}); // 30 %/h → 100 % dans 2 h
  const r=A.runway(s,'claude.session',NOW);
  assert.equal(r.kind,'risk');assert.equal(r.confidence,'high');
  assert.ok(Math.abs(r.hitAt-(NOW+2*H))<2*MIN);
  assert.match(A.runwayText(r,NOW),/vers .* avant sa réinitialisation.*Confiance élevée/);
  assert.ok(A.runwayWorthShowing(r));
});
test('consommation stable mais reset avant la saturation : « pas avant la réinitialisation » + marge',()=>{
  const s=session([[60,10],[50,12],[40,14],[30,16],[20,18],[10,20],[0,22]],{resetIn:90*MIN}); // 12 %/h
  const r=A.runway(s,'claude.session',NOW);
  assert.equal(r.kind,'safe');assert.ok(r.margin>=60&&r.margin<=62,String(r.margin));
  assert.match(A.runwayText(r,NOW),/ne devrait pas être atteinte avant sa réinitialisation/);
});
test('consommation très irrégulière : aucune heure affichée',()=>{
  const s=session([[60,10],[50,50],[40,51],[30,51],[20,52],[10,52],[0,53]],{resetIn:4*H}); // tout au début, presque rien ensuite
  const r=A.runway(s,'claude.session',NOW);
  assert.ok(['risk-uncertain','insufficient'].includes(r.kind),r.kind);
  assert.doesNotMatch(A.runwayText(r,NOW,{verbose:true}),/vers \d/);
});
test('période sans activité : « aucune consommation récente », distinct d’un manque de données',()=>{
  const s=session([[90,30],[80,40],[60,45],[45,45],[30,45],[0,45]]);
  const r=A.runway(s,'claude.session',NOW);
  assert.equal(r.kind,'idle');
  assert.match(A.runwayText(r,NOW,{verbose:true}),/aucune consommation récente/);
  assert.equal(A.runwayWorthShowing(r),false,'rien dans le popup');
});
test('consommation nulle',()=>{
  assert.equal(A.runway(session([[40,0],[20,0],[0,0]]),'claude.session',NOW).kind,'idle');
  assert.equal(A.runway(weekly(0,{resetIn:3*DAY}),'claude.weekly',NOW).kind,'idle');
});
test('réinitialisation imminente',()=>{
  const r=A.runway(session([[30,50],[20,60],[10,70],[0,80]],{resetIn:10*MIN}),'claude.session',NOW);
  assert.equal(r.kind,'reset-soon');
});
test('réinitialisation déjà passée : relevé caduc, aucune prévision',()=>{
  assert.equal(A.runway(session([[30,50],[20,60],[0,80]],{resetIn:-MIN}),'claude.session',NOW).kind,'nodata');
});
test('historique insuffisant : aucune estimation chiffrée',()=>{
  const r=A.runway(session([[10,20],[0,25]]),'claude.session',NOW);
  assert.equal(r.kind,'insufficient');
  assert.match(A.runwayText(r,NOW,{verbose:true}),/historique insuffisant/);
  assert.equal(A.runwayText(r,NOW),'','rien en mode compact');
});
test('relevés manquants ou périmés',()=>{
  assert.equal(A.runway(session([[60,10],[40,20],[30,30]],{ageLast:30*MIN}),'claude.session',NOW).kind,'nodata','dernier relevé > 15 min');
  const holes=session([[170,10],[100,20],[30,30],[0,30.5]]);
  assert.notEqual(A.runway(holes,'claude.session',NOW).kind,'risk');
});
test('variations extrêmes rejetées',()=>{
  const r=A.runway(session([[30,1],[25,2],[22,3],[0,90]],{resetIn:4*H}),'claude.session',NOW);
  assert.ok(['insufficient','risk-uncertain'].includes(r.kind),r.kind);
});
test('le cas « 14 h à 58 h » : une limite hebdomadaire n’est plus extrapolée comme une session',()=>{
  // 8 % utilisés, reset dans ~2,6 jours : rythme moyen de la semaine → bien en dessous.
  const r=A.runway(weekly(8,{resetIn:2.6*DAY}),'claude.weekly',NOW);
  assert.equal(r.kind,'safe');assert.ok(r.margin>80);
  const t=A.runwayText(r,NOW);
  assert.match(t,/de cette semaine/);assert.doesNotMatch(t,/\d+ h à \d+ h/);
});
test('semaine très consommée : risque avant le reset',()=>{
  const r=A.runway(weekly(70,{resetIn:3.5*DAY}),'claude.weekly',NOW); // 70 % en la moitié de la semaine
  assert.equal(r.kind,'risk');assert.ok(r.hitAt<NOW+3.5*DAY&&r.hitAt>NOW);
  assert.equal(A.runway(weekly(30,{resetIn:6.6*DAY}),'claude.weekly',NOW).kind,'insufficient','début de semaine : trop tôt');
});
test('Quota Intelligence : la limite qui bloque en premier, pas la plus haute en %',()=>{
  const s=session([[60,20],[50,22],[40,24],[30,26],[20,28],[10,30],[0,32]],{resetIn:4.5*H}); // session 32 %, 12 %/h → sûre
  s.metrics['claude.weekly']={percent:82,source:'observed',observedAt:NOW,resetAt:NOW+2*DAY,detail:null}; // 82 % en 71 % de la semaine
  const r=A.platformRunway(s,'claude',NOW);
  assert.equal(r.id,'claude.weekly');assert.equal(r.kind,'risk');
});
test('limite atteinte : priorité absolue',()=>{
  const s=session([[0,100]],{resetIn:H});
  assert.equal(A.platformRunway(s,'claude',NOW).kind,'reached');
});
test('fuseaux horaires : même prévision à Paris, New York et Tokyo',()=>{
  const code=`const {core}=require(${JSON.stringify(require.resolve('./helpers.cjs'))});const A=core().AIFlow;
    const NOW=${NOW},MIN=60000;const s=A.clean({metrics:{'claude.session':{percent:40,source:'observed',observedAt:NOW,resetAt:NOW+4*3600000}}});
    s.history['claude.session']=[[60,10],[50,15],[40,20],[30,25],[20,30],[10,35],[0,40]].map(([a,p])=>({ts:NOW-a*MIN,percent:p,resetAt:NOW+4*3600000}));
    const r=A.runway(s,'claude.session',NOW);process.stdout.write(JSON.stringify([r.kind,r.hitAt]));`;
  const out=['Europe/Paris','America/New_York','Asia/Tokyo'].map(TZ=>execFileSync(process.execPath,['-e',code],{env:{...process.env,TZ}}).toString());
  assert.equal(new Set(out).size,1,out.join(' | '));
});
