// Exécute le vrai contrôleur de page avec une surface DOM minimale (sans moteur de rendu).
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {load}=require('./helpers.cjs');
function element(){return {innerHTML:'',textContent:'',hidden:false,style:{},dataset:{},listeners:{},classList:{toggle(){}},offsetWidth:250,
  addEventListener(type,fn){this.listeners[type]=fn;},getBoundingClientRect(){return {width:680,left:0};}};}
async function dashboard(history){
  const ctx=load(['platforms.js','shared.js']),nodes=new Map(),ranges=[24,168].map(n=>Object.assign(element(),{dataset:{range:String(n)}}));
  const html=fs.readFileSync(path.join(__dirname,'../safari/dashboard.html'),'utf8');
  for(const [,id] of html.matchAll(/id="([^"]+)"/g))nodes.set(id,element());
  ctx.window=ctx;ctx.document={getElementById:id=>nodes.get(id)||null,querySelectorAll:q=>q==='[data-range]'?ranges:[]};
  ctx.setInterval=()=>0;
  const state=ctx.AIFlow.defaults();ctx.AIFlow.getState=async()=>state;ctx.AIFlow.request=async()=>({});
  ctx.AIFlowUI={loadExtras:async()=>({history,jobs:{},drafts:[]}),loadFlows:async()=>({flows:[]}),
    awakeText:()=>({cls:'',text:''}),smartSwitchHTML:()=>'',platformCard:()=>'',bindNav(){},live(){}};
  await vm.runInContext(fs.readFileSync(path.join(__dirname,'../safari/dashboard.js'),'utf8'),ctx);
  return {nodes,ranges};
}
test('graphique : deux plateformes colorées, détail clavier et période 7 jours',async()=>{
  const now=Date.now(),H=3600000;
  const history={series:{'claude.session':[[now-15*60000,10],[now-5*60000,25]],'codex.session':[[now-15*60000,20],[now-5*60000,30]]},limits:[]};
  const {nodes,ranges}=await dashboard(history);
  const chart=nodes.get('chart');
  assert.match(chart.innerHTML,/--platform-color:#D97757/);
  assert.match(chart.innerHTML,/--platform-color:#7C8CF8/);
  assert.equal(nodes.has('metric'),false);
  assert.match(nodes.get('platform-legend').innerHTML,/Claude/);assert.match(nodes.get('platform-legend').innerHTML,/Codex/);
  chart.listeners.keydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(nodes.get('tip').hidden,false);
  assert.match(nodes.get('tip').innerHTML,/Claude/);assert.match(nodes.get('tip').innerHTML,/Codex/);
  ranges[1].listeners.click();
  assert.match(chart.innerHTML,/par jour/);
  assert.match(nodes.get('history-summary').innerHTML,/15 %/);
  assert.match(nodes.get('history-summary').innerHTML,/10 %/);
  assert.ok(!chart.innerHTML.includes('NaN'));
});
test('graphique sans relevé : plateformes visibles et absence explicite',async()=>{
  const {nodes}=await dashboard({series:{},limits:[]});
  assert.match(nodes.get('platform-legend').innerHTML,/Claude.*aucune mesure.*Codex.*aucune mesure/);
  assert.match(nodes.get('chart').innerHTML,/apparaîtra ici/);
  assert.equal(nodes.get('tip').hidden,true);
});
