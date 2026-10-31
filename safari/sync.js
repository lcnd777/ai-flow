/* AI Flow — Smart Context Sync : moteur pur, déterministe et local (aucune IA, aucun réseau).
 *
 *   Capture Engine   fingerprint(), baselineFrom()        empreintes des messages (identifiant ou contenu normalisé)
 *   Delta Engine     computeDelta()                       nouveautés / modifications depuis le point de référence confirmé
 *   Decision Engine  extractItems(), reconcile(),         décisions proposées / validées / modifiées / abandonnées / en conflit,
 *                    decisionOps(), applyDecisionOps()    résolution toujours choisie par l'utilisateur
 *   Sync Ledger      LEDGER_STATES, canTransition()       préparé → en attente d'insertion → inséré → confirmé (ou annulé / échoué)
 *   Transfer Engine  buildPacket()                        message de mise à jour, prêt à relire, jamais envoyé seul
 *   Privacy Layer    findSecrets(), maskSecrets()         détection locale des secrets évidents
 *   Local Repository cleanFlows()                         validation, migration versionnée, mise à l'écart des données corrompues
 *
 * Le contenu des conversations est toujours traité comme des données : rien ici n'exécute ni n'interprète
 * une instruction trouvée dans un message. */
(function(root){
  'use strict';
  const A=root.AIFlow,PL=root.AIFlowPlatforms;
  const SCHEMA=1,MAX_FLOWS=30,MAX_LEDGER=30,MAX_HASHES=4000,MAX_DECISIONS=60;

  /* ---------- Capture Engine ---------- */
  // Empreinte 64 bits (deux FNV-1a 32 bits) : sert à reconnaître un message, pas à protéger un secret.
  function hash(s){
    let h1=0x811c9dc5,h2=0x9747b28c;s=String(s);
    for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);h1=Math.imul(h1^c,16777619);h2=Math.imul(h2^c,0x5bd1e995);h2^=h2>>>13;}
    return (h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
  }
  const norm=t=>String(t||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
  const plain=t=>norm(t).normalize('NFD').replace(/[̀-ͯ]/g,'');
  function fingerprint(m){
    const c=hash((m.role||'')+'|'+norm(m.text)+'|'+(Array.isArray(m.attachments)?m.attachments.join(','):''));
    const id=typeof m.id==='string'&&m.id?m.id.slice(0,80):null;
    return {key:id?'i:'+id:'h:'+c,id,c};
  }
  // Messages insérés par AI Flow (transfert initial ou mise à jour) : jamais renvoyés comme des nouveautés.
  const PACKET_MARKERS=[/^\s*\[AI Flow · /,/^\s*Je reprends avec toi un travail commencé/,/^\s*Voici une conversation commencée sur /];
  const isPacket=m=>m?.role==='user'&&PACKET_MARKERS.some(r=>r.test(String(m.text||'')));
  function emptyBaseline(unknown=false){return {ids:{},hashes:[],at:null,unknown};}
  // Point de référence : empreintes seulement (aucun texte de message conservé).
  function baselineFrom(messages,prev,at=Date.now()){
    const b=cleanBaseline(prev);const ids={...b.ids},hs=new Set(b.hashes);
    for(const m of Array.isArray(messages)?messages:[]){const f=fingerprint(m);if(f.id)ids[f.id]=f.c;hs.add(f.c);}
    const idKeys=Object.keys(ids);
    for(const k of idKeys.slice(0,Math.max(0,idKeys.length-MAX_HASHES)))delete ids[k];
    return {ids,hashes:[...hs].slice(-MAX_HASHES),at,unknown:false};
  }
  function mergeSeen(baseline,seen,at){
    const b=cleanBaseline(baseline),s=cleanBaseline(seen);
    const ids={...b.ids,...s.ids},hs=[...new Set([...b.hashes,...s.hashes])].slice(-MAX_HASHES);
    const idKeys=Object.keys(ids);for(const k of idKeys.slice(0,Math.max(0,idKeys.length-MAX_HASHES)))delete ids[k];
    return {ids,hashes:hs,at,unknown:false};
  }
  function cleanBaseline(b){
    if(!b||typeof b!=='object')return emptyBaseline();
    const ids={};for(const [k,v] of Object.entries(b.ids&&typeof b.ids==='object'?b.ids:{}))if(typeof v==='string'&&/^[0-9a-f]{16}$/.test(v)&&k.length<=80)ids[k]=v;
    const hashes=(Array.isArray(b.hashes)?b.hashes:[]).filter(h=>typeof h==='string'&&/^[0-9a-f]{16}$/.test(h)).slice(-MAX_HASHES);
    return {ids,hashes,at:Number.isFinite(b.at)?b.at:null,unknown:b.unknown===true};
  }

  /* ---------- Delta Engine ----------
     Un message absent de la capture n'est JAMAIS considéré comme supprimé (il peut ne pas être chargé). */
  function computeDelta(messages,baseline,opts={}){
    const b=cleanBaseline(baseline),hs=new Set(b.hashes);
    const out={fresh:[],modified:[],known:0,packets:0,total:0,partial:opts.source!=='api',anchorMissing:false,firstSync:b.unknown,upToDate:false,attachments:[]};
    (Array.isArray(messages)?messages:[]).forEach((m,index)=>{
      if((m?.role!=='user'&&m?.role!=='assistant')||typeof m.text!=='string')return;
      out.total++;
      if(isPacket(m)){out.packets++;return;}
      const f=fingerprint(m),entry={role:m.role,text:m.text,attachments:Array.isArray(m.attachments)?m.attachments:[],index,key:f.key,c:f.c};
      if(f.id&&b.ids[f.id]!==undefined){if(b.ids[f.id]===f.c)out.known++;else out.modified.push({...entry,modified:true});return;}
      if(hs.has(f.c)){out.known++;return;}
      out.fresh.push(entry);
    });
    // Aucun point commun avec la référence : la capture ne permet pas de situer les nouveautés avec certitude.
    out.anchorMissing=!b.unknown&&b.hashes.length>0&&out.total>0&&out.known===0&&out.packets===0;
    out.upToDate=!out.fresh.length&&!out.modified.length;
    out.attachments=[...new Set([...out.fresh,...out.modified].flatMap(m=>m.attachments))].slice(0,30);
    return out;
  }

  /* ---------- Privacy Layer : secrets évidents (détection locale) ---------- */
  const SECRET_RX=[
    ['clé API',/\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[A-Za-z0-9-]{10,})\b/g],
    ['jeton GitHub',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
    ['clé AWS',/\bAKIA[0-9A-Z]{16}\b/g],
    ['clé privée',/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g],
    ['jeton JWT',/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
    ['mot de passe',/\b(?:password|passwd|pwd|mot de passe|mdp|secret|api[_ -]?key|token)\s*[:=]\s*["']?[^\s"']{6,}/gi],
    ['IBAN',/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g]
  ];
  function findSecrets(text){
    const out=[];const t=String(text||'');
    for(const [type,rx] of SECRET_RX){rx.lastIndex=0;for(const m of t.matchAll(rx)){if(type==='IBAN'&&!/\d{6,}/.test(m[0].replace(/ /g,'')))continue;out.push({type,start:m.index,end:m.index+m[0].length});}}
    return out;
  }
  function maskSecrets(text){
    let t=String(text||'');const found=findSecrets(t).sort((a,b)=>b.start-a.start);
    let last=Infinity;for(const s of found){if(s.end>last)continue;t=t.slice(0,s.start)+`[${s.type} masqué]`+t.slice(s.end);last=s.start;}
    return t;
  }

  /* ---------- Decision Engine ---------- */
  const DECISION_EXTRA=/(?<![\p{L}])(on (abandonne|reporte|repousse|renonce à|laisse tomber|oublie|annule|retire|arrête|passe à|passe sur|remplace)|finalement,? on|we (drop|postpone|defer|abandon|switch to))(?![\p{L}])/iu;
  const PROPOSAL=/(?<![\p{L}])(je (te |vous )?(propose|recommande|suggère|conseille)|je partirais sur|recommandé|i (suggest|recommend|propose)|my recommendation)(?![\p{L}])/iu;
  const NEGATIVE=/(?<![a-z])(ne \w+ pas|n'\w+ pas|pas de|pas d'|report\w*|repouss\w*|abandon\w*|renonc\w*|annul\w*|retir\w*|supprim\w*|on oublie|laisse tomber|exclu\w*|finalement pas|plutot pas|not|don't|drop\w*|skip\w*|postpon\w*|defer\w*|au lieu d)(?![a-z])/;
  const STOP=new Set('avec dans pour plus pas sans sur sous entre vers chez cette cela celui celle ceux elles nous vous ils elle ont avons avez sont etre etait fait faire faut dois doit peut peux veux voir bien tres trop aussi alors donc mais comme tout tous toute toutes autre autres meme encore deja apres avant quand parce chaque leur leurs notre votre ainsi part garde choisit retient utilise reste valide decide decision decisions retenu retenue valid choisi tranche propose recommande suggere conseille partirais finalement plutot report reporte reporter reportons repousse abandonne abandonner renonce annule retire supprime oublie laisse tomber exclu should will with that this then from have been they them their there what when which would could using use keep instead first second'.split(' '));
  function subjectOf(text){
    const raw=String(text||'');const tokens=new Set(),strong=new Set();
    const words=raw.match(/[\p{L}\p{N}][\p{L}\p{N}._+#-]*/gu)||[];
    words.forEach((w,i)=>{
      const p=plain(w).replace(/[._-]+$/,'');
      if(p.length<4||STOP.has(p)||NEGATIVE.test(p))return;
      tokens.add(p);
      if((i>0&&/^\p{Lu}/u.test(w))||/\d/.test(w)||/[A-Z].*[A-Z]/.test(w)||p.length>=8)strong.add(p);
    });
    return {tokens:[...tokens].slice(0,24),strong:[...strong].slice(0,12)};
  }
  const polarityOf=t=>NEGATIVE.test(plain(t))?-1:1;
  function similarity(a,b){const A1=new Set(a.tokens),B1=new Set(b.tokens);if(!A1.size||!B1.size)return 0;let n=0;for(const x of A1)if(B1.has(x))n++;return n/(A1.size+B1.size-n);}
  function related(a,b){
    const sa=a.subject||subjectOf(a.text),sb=b.subject||subjectOf(b.text);
    if(sa.strong.some(x=>sb.tokens.includes(x))||sb.strong.some(x=>sa.tokens.includes(x)))return true;
    return similarity(sa,sb)>=0.5;
  }
  const clip=(t,n)=>{t=String(t||'').trim();return t.length>n?t.slice(0,n-1)+'…':t;};

  // Éléments utiles des messages NOUVEAUX uniquement : chaque élément cite la phrase d'origine.
  function extractItems(msgs){
    const RX=A.CONTINUITY_RX,list=(Array.isArray(msgs)?msgs:[]).filter(m=>typeof m?.text==='string'&&m.text.trim());
    const items=[],seen=new Set();
    const add=(kind,text,m,extra={})=>{
      const t=clip(text.replace(/\s+/g,' '),400),k=kind+'|'+norm(t).slice(0,120);if(seen.has(k))return;seen.add(k);
      const it={id:hash(k),kind,text:t,role:m.role,msgKey:m.key||null,modified:!!m.modified,source:clip(m.text,800),secret:findSecrets(t).length>0,...extra};
      if(kind==='decision'){it.status=m.role==='user'?'validated':'proposed';it.polarity=polarityOf(t);it.subject=subjectOf(t);}
      items.push(it);
    };
    list.forEach((m,i)=>{
      for(const s of A.splitSentences(m.text)){
        if(RX.decision.test(s)||PROPOSAL.test(s)||DECISION_EXTRA.test(s))add('decision',s,m);
        else if(m.role==='user'&&RX.constraint.test(s))add('constraint',s,m);
        if(m.role==='assistant'&&RX.done.test(s))add('done',s,m);
        if(RX.problem.test(s)&&!list.slice(i+1).some(n=>RX.solved.test(n.text)))add('problem',s,m);
      }
    });
    const users=list.filter(m=>m.role==='user'),lastA=[...list].reverse().find(m=>m.role==='assistant');
    // Dernière demande, sauf si elle n'est faite que de phrases déjà retenues (évite les doublons).
    if(users.length){
      const u=users.at(-1),known=new Set(items.map(i=>norm(i.text)));
      const sents=A.splitSentences(u.text);
      if(!sents.length||!sents.every(x=>known.has(norm(clip(x.replace(/\s+/g,' '),400)))))add('next','Dernière demande : '+clip(u.text.replace(/\s+/g,' '),400),u);
    }
    if(lastA){
      const lines=lastA.text.split('\n'),start=lines.findIndex(l=>RX.next.test(l));
      if(start>=0)for(const l of lines.slice(start+1,start+12)){const t=l.replace(/^[\s*\-–•\d.)]+/,'').trim();if(/^\s*([*\-–•]|\d+[.)])\s+/.test(l)&&t)add('next',t,lastA);}
    }
    const code=[];for(const m of [...list].reverse()){for(const c of (m.text.match(/```[\s\S]*?```/g)||[]).reverse()){if(code.length<3)code.unshift([c,m]);}if(code.length>=3)break;}
    for(const [c,m] of code)add('excerpt',c.length>4000?c.slice(0,4000)+'\n…```':c,m);
    const links=[...new Set(list.flatMap(m=>m.text.match(/https?:\/\/[^\s)>\]"']+/g)||[]))].slice(-8);
    if(links.length)add('excerpt','Liens cités :\n'+links.map(l=>'- '+l).join('\n'),list.at(-1));
    // Une phrase « décision » d'un message long peut aussi être une tâche faite : la décision prime.
    return items.map(it=>it.kind==='excerpt'?{...it,text:it.text.length>4000?it.text.slice(0,4000):it.text}:it);
  }

  /* Comparaison à trois états : base = décisions du Flow (dernier état confirmé), « ours » = décisions nouvelles
     de la conversation source, « theirs » = décisions encore non synchronisées de l'autre conversation.
     Jamais de résolution par la chronologie : une contradiction impliquant une décision validée exige un choix. */
  function reconcile(items,flowDecisions,theirs=[]){
    const active=(flowDecisions||[]).filter(d=>['validated','proposed','conflict'].includes(d.status));
    const entries=[];
    for(const it of items.filter(i=>i.kind==='decision')){
      let e={item:it,relation:'new',target:null,required:false,threeWay:false};
      const other=(theirs||[]).find(t=>related(it,t)&&t.polarity!==it.polarity);
      const hit=active.find(d=>related(it,d));
      if(other){e={...e,relation:'conflict',target:{...other,status:other.status||'validated',pending:true},required:true,threeWay:true};}
      else if(hit){
        const same=hit.polarity===it.polarity;
        if(same&&similarity(it.subject,hit.subject||subjectOf(hit.text))>=0.6)e={...e,relation:'duplicate',target:hit};
        else if(!same){
          if(it.status==='validated'&&hit.status==='proposed')e={...e,relation:'replaces',target:hit};
          else e={...e,relation:'conflict',target:hit,required:it.status==='validated'||hit.status==='validated'};
        }else if(it.status==='validated')e={...e,relation:'modifies',target:hit};
        else e={...e,relation:'new',target:hit,linked:true};
      }
      entries.push(e);
    }
    return entries;
  }
  // Choix pour chaque conflit : 'first' (garder l'existante), 'second' (garder la nouvelle), 'merge' (texte saisi), 'defer'.
  function decisionOps(entries,choices={},included){
    const ops=[];const inc=id=>!included||included.has(id);
    for(const e of entries){
      const it=e.item,c=choices[it.id];
      if(e.relation==='duplicate'||!inc(it.id))continue;
      const add=(status,text=it.text)=>ops.push({op:'add',id:it.id,text:clip(text,400),status,polarity:polarityOf(text),origin:it.role});
      const set=(id,status)=>{if(id&&!e.target?.pending)ops.push({op:'set',id,status});};
      if(e.relation==='new')add(it.status);
      else if(e.relation==='modifies'){add('validated');set(e.target.id,'modified');}
      else if(e.relation==='replaces'){add('validated');set(e.target.id,'abandoned');}
      else if(e.relation==='conflict'){
        const choice=c?.choice||(e.required?null:'defer');
        if(choice==='first'){if(!e.target.pending)set(e.target.id,'validated');}
        else if(choice==='second'){add(it.status==='proposed'?'validated':it.status);set(e.target.id,'abandoned');}
        else if(choice==='merge'&&c.text&&c.text.trim()){add('validated',c.text);set(e.target.id,'modified');}
        else if(choice==='defer'){add('conflict');set(e.target.id,'conflict');}
      }
    }
    return ops;
  }
  const unresolved=(entries,choices={},included)=>entries.filter(e=>e.relation==='conflict'&&e.required&&(!included||included.has(e.item.id))&&!(choices[e.item.id]?.choice&&(choices[e.item.id].choice!=='merge'||choices[e.item.id].text?.trim())));
  const DECISION_STATES=['proposed','validated','modified','abandoned','conflict'];
  function applyDecisionOps(decisions,ops,origin,now=Date.now()){
    const list=cleanDecisions(decisions);
    for(const o of Array.isArray(ops)?ops.slice(0,80):[]){
      if(o?.op==='set'){const d=list.find(x=>x.id===o.id);if(d&&DECISION_STATES.includes(o.status)){d.status=o.status;d.at=now;}}
      else if(o?.op==='add'&&typeof o.text==='string'&&o.text.trim()&&DECISION_STATES.includes(o.status)){
        const id=typeof o.id==='string'?o.id.slice(0,20):hash(o.text);
        const prev=list.find(x=>x.id===id);
        if(prev){prev.status=o.status;prev.text=clip(o.text,400);prev.at=now;}
        else list.push({id,text:clip(o.text,400),status:o.status,polarity:o.polarity===-1?-1:1,origin:{platform:origin?.platform||null,role:o.origin==='user'?'user':'assistant'},at:now});
      }
    }
    return cleanDecisions(list);
  }
  function cleanDecisions(list){
    return (Array.isArray(list)?list:[]).filter(d=>d&&typeof d.text==='string'&&d.text.trim()&&DECISION_STATES.includes(d.status)).map(d=>({
      id:typeof d.id==='string'?d.id.slice(0,20):hash(d.text),text:clip(d.text,400),status:d.status,polarity:d.polarity===-1?-1:1,
      origin:{platform:PL.get(d.origin?.platform)?d.origin.platform:null,role:d.origin?.role==='user'?'user':'assistant'},at:Number.isFinite(d.at)?d.at:0,subject:subjectOf(d.text)
    })).slice(-MAX_DECISIONS);
  }

  /* ---------- Transfer Engine : message de mise à jour structuré ---------- */
  const name=id=>PL.get(id)?.name||id||'';
  function buildPacket(o){
    const {title,from,to,since,items=[],entries=[],choices={},included,mask=true,transcript='',delta={}}=o;
    const inc=it=>!included||included.has(it.id);
    const txt=it=>{const t=(o.edits?.[it.id]??it.text);return mask?maskSecrets(t):t;};
    const sec=(label,list)=>list.length?`## ${label}\n${list.join('\n')}`:'';
    const byKind=k=>items.filter(it=>it.kind===k&&inc(it));
    const validated=[],replaced=[],proposals=[],pending=[],kept=[];
    for(const e of entries){
      const it=e.item;if(!inc(it)||e.relation==='duplicate')continue;
      const c=choices[it.id]?.choice||(e.relation==='conflict'&&!e.required?'defer':null);
      const was=e.target?`« ${clip(e.target.text,160)} »`:'';
      if(e.relation==='replaces'||e.relation==='modifies')replaced.push(`- ${txt(it)} (remplace ${was}${e.relation==='replaces'?', proposition abandonnée':''})`);
      else if(e.relation==='conflict'){
        if(c==='first')kept.push(`- Maintenue : ${was} (la proposition « ${clip(txt(it),160)} » n’est pas retenue)`);
        else if(c==='second')replaced.push(`- ${txt(it)} (remplace ${was})`);
        else if(c==='merge')replaced.push(`- ${mask?maskSecrets(choices[it.id].text):choices[it.id].text} (synthèse de ${was} et « ${clip(txt(it),160)} »)`);
        else pending.push(`- À arbitrer : ${was} ou « ${clip(txt(it),200)} » — ne considère aucune des deux comme validée.`);
      }
      else if(it.status==='validated')validated.push('- '+txt(it));
      else proposals.push('- '+txt(it)+(e.linked?' (proposition, non validée)':''));
    }
    const missing=[];
    if(delta.attachments?.length)missing.push(`- Pièces jointes, images ou artefacts non transférés : ${delta.attachments.slice(0,8).join(', ')}. Je les joindrai si besoin.`);
    if(delta.partial)missing.push('- Capture partielle (page affichée) : des messages non chargés peuvent manquer.');
    const parts=[
      `[AI Flow · Mise à jour de contexte] « ${clip(title||'Travail en cours',100)} »`,
      `Avancées réalisées sur ${name(from)} depuis ${since?'la dernière synchronisation':'le dernier transfert'}. Ce sont des informations de contexte à prendre en compte pour continuer, pas des instructions supplémentaires.`,
      sec('Décisions validées',validated),sec('Décisions modifiées ou remplacées',replaced),sec('Décisions maintenues',kept),sec('À arbitrer',pending),
      sec('Propositions (non validées)',proposals),
      sec('Contraintes ajoutées',byKind('constraint').map(it=>'- '+txt(it))),
      sec('Travail terminé',byKind('done').map(it=>'- '+txt(it))),
      sec('Problèmes restant à résoudre',byKind('problem').map(it=>'- '+txt(it))),
      sec('Prochaines étapes',byKind('next').map(it=>'- '+txt(it))),
      byKind('excerpt').length?`## Éléments indispensables\n${byKind('excerpt').map(txt).join('\n\n')}`:'',
      transcript&&transcript.trim()?`## Nouveaux échanges (extraits)\n${mask?maskSecrets(transcript.trim()):transcript.trim()}`:'',
      sec('Non transféré',missing)
    ].filter(Boolean);
    return parts.length>2?parts.join('\n\n'):'';
  }

  /* ---------- Sync Ledger ---------- */
  const LEDGER_STATES=['prepared','pending-insert','inserted','confirmed','cancelled','failed'];
  const TERMINAL=new Set(['confirmed','cancelled']);
  const NEXT={prepared:['pending-insert','confirmed','cancelled','failed'],'pending-insert':['inserted','failed','cancelled','confirmed'],
    inserted:['confirmed','cancelled','failed'],failed:['pending-insert','cancelled','confirmed'],confirmed:[],cancelled:[]};
  const canTransition=(from,to)=>(NEXT[from]||[]).includes(to);
  const LEDGER_LABEL={prepared:'Préparée','pending-insert':'En attente d’insertion',inserted:'Insérée, à confirmer',confirmed:'Confirmée',cancelled:'Annulée',failed:'Échouée'};

  /* ---------- Local Repository : validation et migration ---------- */
  function cleanEnd(e){
    const conv=PL.conversationOf(e?.url||'');
    if(!conv||!['claude','chatgpt'].includes(conv.platform))return null;
    return {platform:conv.platform,url:conv.url,title:clip(e.title||'Conversation',120),account:typeof e.account==='string'?e.account.slice(0,80):null,baseline:cleanBaseline(e.baseline)};
  }
  function cleanLedger(list){
    return (Array.isArray(list)?list:[]).filter(x=>x&&typeof x.id==='string'&&LEDGER_STATES.includes(x.state)).map(x=>({
      id:x.id.slice(0,40),from:PL.conversationOf(x.from||'')?.url||null,to:PL.conversationOf(x.to||'')?.url||null,state:x.state,
      at:Number.isFinite(x.at)?x.at:0,updatedAt:Number.isFinite(x.updatedAt)?x.updatedAt:0,baseRev:Number.isInteger(x.baseRev)?x.baseRev:0,
      counts:x.counts&&typeof x.counts==='object'?Object.fromEntries(Object.entries(x.counts).filter(([k,v])=>k.length<20&&Number.isFinite(v)).slice(0,12)):{},
      seen:TERMINAL.has(x.state)?null:x.seen?cleanBaseline(x.seen):null,
      draft:TERMINAL.has(x.state)?null:(x.draft&&typeof x.draft==='object'?x.draft:null),
      error:typeof x.error==='string'?x.error.slice(0,160):null
    })).filter(x=>x.from&&x.to).sort((a,b)=>b.at-a.at).slice(0,MAX_LEDGER);
  }
  // Renvoie {flows, dropped} : les entrées illisibles sont écartées (et conservées à part par l'appelant), jamais effacées en silence.
  function cleanFlows(raw){
    let src=raw;
    if(Array.isArray(raw))src={v:1,flows:raw}; // forme hypothétique antérieure
    if(!src||typeof src!=='object'||!Array.isArray(src.flows))return {v:SCHEMA,flows:[],dropped:raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).length?[raw]:[]};
    const flows=[],dropped=[];
    for(const f of src.flows){
      try{
        if(!f||typeof f!=='object'||typeof f.id!=='string')throw 0;
        const ends=(Array.isArray(f.ends)?f.ends:[]).map(cleanEnd).filter(Boolean);
        if(ends.length!==2||ends[0].url===ends[1].url)throw 0;
        flows.push({id:f.id.slice(0,40),title:clip(f.title||ends[0].title,120),createdAt:Number.isFinite(f.createdAt)?f.createdAt:Date.now(),updatedAt:Number.isFinite(f.updatedAt)?f.updatedAt:Date.now(),
          rev:Number.isInteger(f.rev)&&f.rev>=0?f.rev:0,checkpointId:typeof f.checkpointId==='string'?f.checkpointId.slice(0,40):null,ends,
          lastSync:f.lastSync&&Number.isFinite(f.lastSync.at)?{at:f.lastSync.at,from:PL.conversationOf(f.lastSync.from||'')?.url||null,to:PL.conversationOf(f.lastSync.to||'')?.url||null}:null,
          ledger:cleanLedger(f.ledger),sealed:f.sealed&&typeof f.sealed==='object'&&typeof f.sealed.ct==='string'?{iv:String(f.sealed.iv||''),ct:f.sealed.ct}:null,
          plain:f.plain&&typeof f.plain==='object'?{decisions:cleanDecisions(f.plain.decisions),pending:cleanPending(f.plain.pending)}:null,
          locked:f.locked===true});
      }catch{dropped.push(f);}
    }
    return {v:SCHEMA,flows:flows.sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,MAX_FLOWS),dropped};
  }
  function cleanPending(p){
    const out={};
    for(const [url,v] of Object.entries(p&&typeof p==='object'?p:{})){
      const u=PL.conversationOf(url)?.url;if(!u||!v||!Array.isArray(v.decisions))continue;
      out[u]={at:Number.isFinite(v.at)?v.at:0,decisions:v.decisions.filter(d=>d&&typeof d.text==='string').slice(0,30).map(d=>({text:clip(d.text,400),polarity:d.polarity===-1?-1:1,status:d.status==='proposed'?'proposed':'validated',subject:subjectOf(d.text)}))};
    }
    return out;
  }
  const flowFor=(flows,url)=>{const u=PL.conversationOf(url||'')?.url;return u?(flows||[]).find(f=>f.ends.some(e=>e.url===u))||null:null;};
  const otherEnd=(flow,url)=>flow.ends.find(e=>e.url!==url)||null;
  const openEntries=flow=>(flow?.ledger||[]).filter(x=>!TERMINAL.has(x.state));

  // Décisions de départ d'un Flow (conversation d'origine, au moment de la liaison).
  function seedDecisions(messages,platform,now=Date.now()){
    const items=extractItems((Array.isArray(messages)?messages:[]).filter(m=>!isPacket(m)));
    return applyDecisionOps([],decisionOps(reconcile(items,[]),{}),{platform},now).map(({subject,...d})=>d);
  }
  root.AIFlowSync={seedDecisions,SCHEMA,hash,norm,fingerprint,isPacket,emptyBaseline,baselineFrom,mergeSeen,cleanBaseline,computeDelta,
    findSecrets,maskSecrets,subjectOf,polarityOf,related,similarity,extractItems,reconcile,decisionOps,unresolved,applyDecisionOps,cleanDecisions,
    buildPacket,LEDGER_STATES,LEDGER_LABEL,canTransition,TERMINAL,cleanFlows,cleanPending,flowFor,otherEnd,openEntries,MAX_LEDGER};
})(typeof window!=='undefined'?window:globalThis);
