// Builds data/catalog.json + data/squads/*.json from the source repository's squad files.
//   node scripts/build-catalog.mjs <path-to-goalassoMANAGER-checkout>
// It READS the source project (JSON squads + the club-definition literals in src/js) and never runs its code.
// The player model below is a deterministic port of the source game's rating / attribute / shirt-number rules:
// the same input files always give the same catalog, on every machine, which is what lets two phones agree.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const SRC=path.resolve(process.argv[2]||'');const OUT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','data');
if(!process.argv[2]||!fs.existsSync(path.join(SRC,'data','euro')))throw new Error('usage: node scripts/build-catalog.mjs <source checkout>');
const read=f=>fs.readFileSync(path.join(SRC,f),'utf8');const json=f=>JSON.parse(read(f));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/* a data literal out of a source file: the text from `const NAME=` to its matching bracket, evaluated with no globals */
function literal(file,name){const s=read(file);const at=s.indexOf('const '+name+'=');if(at<0)throw new Error(name+' not found in '+file);let i=at+('const '+name+'=').length;const open=s[i],close=open==='['?']':'}';
  let depth=0,q=null,j=i;for(;j<s.length;j++){const ch=s[j];if(q){if(ch==='\\'){j++;continue}if(ch===q)q=null;continue}
    if(ch==='/'&&s[j+1]==='/'){j=s.indexOf('\n',j);continue}if(ch==='/'&&s[j+1]==='*'){j=s.indexOf('*/',j)+1;continue}
    if(ch==="'"||ch==='"'||ch==='`'){q=ch;continue}if(ch===open)depth++;else if(ch===close&&--depth===0)break}
  return vm.runInNewContext('('+s.slice(i,j+1)+')',Object.create(null),{timeout:2000})}
const EURO_CLUBS=literal('src/js/04-euro-clubs.js','EURO_CLUBS'),WORLD_LEAGUES=literal('src/js/11-market.js','WORLD_LEAGUES'),LEUMIT16=literal('src/js/16-leumit-toto-nt.js','LEUMIT16'),
  META=literal('src/js/01-data.js','META'),FALLBACK=literal('src/js/01-data.js','FALLBACK'),NAT_HE=literal('src/js/01-data.js','NAT_HE'),LSTR=literal('src/js/35z-club-catalog.js','LSTR');
/* ---- portraits: only faces the source's own audit marked ok; everything else shows the designed fallback ---- */
const VIS=json('data/visuals/players.json'),EVIS=json('data/visuals/euro-players.json');let AUDIT={};try{AUDIT=json('data/visuals/portrait-audit.json')}catch(e){}
const ilFace=Object.fromEntries(VIS.players.map(p=>[p.he,p.visualId])),euFace=Object.fromEntries(EVIS.players.map(p=>[p.club+'|'+p.en,p.visualId]));const usedPacks=new Set(),credits={};
function faceOf(vid){if(!vid||AUDIT[vid]?.status!=='ok')return null;const f=VIS.faces[vid]||EVIS.faces[vid];if(!f?.pack||!fs.existsSync(path.join(SRC,'assets','facepacks',f.pack+'.json')))return null;usedPacks.add(f.pack);
  const src=f.source||{};credits[vid]=src.page?{a:src.author||'',l:src.license||'',p:src.page}:{a:'ההתאחדות לכדורגל בישראל',l:'',p:f.sourcePage||''};return [f.pack,vid]}
/* ---- deterministic random numbers, seeded per club ---- */
function hash32(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const gauss=r=>{let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};const ri=(r,a,b)=>Math.floor(a+r()*(b-a+1));
/* ---- the source game's player model (03-players.js, 04-euro-clubs.js, 27-render.js, 37-live.js, 36f-penalty.js) ---- */
const ratingFromValue=(v,age)=>{let o=66+5*Math.log2(Math.max(v,.05));if(age!=null&&age<21)o+=2;return clamp(Math.round(o),46,86)};
const euroRating=(v,age)=>{if(v==null)return null;let o=64+3.75*Math.log2(Math.max(v,.05));if(age!=null){if(age<=19)o-=4;else if(age<=21)o-=2;else if(age<=23)o-=1;else if(age>=33)o+=1.5;else if(age>=31)o+=.5}return clamp(Math.round(o),46,93)};
const ATTR_OFF={FW:[4,8,-2,4,-18,0],MF:[0,-2,6,4,-4,0],DF:[-2,-14,-2,-6,8,6],GK:[6,4,2,-12,-10,2]};
function attrs(p){let h=(p.seed*2654435761)>>>0;const out=[];const off=ATTR_OFF[p.pos]||ATTR_OFF.MF;for(let i=0;i<6;i++){h=(h^(h<<13))>>>0;h=(h^(h>>>17))>>>0;h=(h^(h<<5))>>>0;out.push(clamp(p.ovr+off[i]+(h%11)-5,30,96))}return out}
const shootSkill=p=>{const at=attrs(p);return Math.round(p.pos==='GK'?clamp(at[3],35,80):clamp(at[1]*.75+at[3]*.25,35,96))};
const keepSkill=p=>{const at=attrs(p);return Math.round(p.pos==='GK'?clamp(at[0]*.6+at[2]*.4,35,96):40)};
const POS=['GK','DF','MF','FW'];const FORMATION=[1,4,3,3];
function ensureNumbers(players){const used=new Set(players.filter(p=>p.no).map(p=>p.no));const order={GK:0,DF:1,MF:2,FW:3};
  const ps=players.filter(p=>!p.no).sort((x,y)=>(order[x.pos]-order[y.pos])||(y.ovr-x.ovr)||(x.i-y.i));let n=1;
  for(const p of ps){if(p.pos==='GK'&&!used.has(1)){p.no=1;used.add(1);continue}while(used.has(n)||n===1)n++;p.no=n;used.add(n)}}
function bestXI(players,capForeign){const xi=[];const by=(a,b)=>(b.ovr-a.ovr)||(a.i-b.i);
  POS.forEach((pos,i)=>xi.push(...players.filter(p=>p.pos===pos).sort(by).slice(0,FORMATION[i])));
  if(xi.length<11)xi.push(...players.filter(p=>!xi.includes(p)&&p.pos!=='GK').sort(by).slice(0,11-xi.length));
  if(capForeign){let guard=0;while(xi.filter(p=>p.foreign).length>6&&guard++<12){const f=xi.filter(p=>p.foreign).sort((a,b)=>a.ovr-b.ovr)[0];
    const rep=players.filter(p=>!p.foreign&&!xi.includes(p)).sort((a,b)=>((b.pos===f.pos?100:0)+b.ovr)-((a.pos===f.pos?100:0)+a.ovr))[0];if(!rep)break;xi[xi.indexOf(f)]=rep}}
  return xi}
/* one squad: raw rows -> rated players, numbers, the kicking order and the keeper */
function buildSquad(clubId,raw,{str,israeliTop,file,generated,sourceNote,clubName}){const r=rng(hash32('squad|'+clubId));
  const players=raw.filter(x=>x&&x.he).map((x,i)=>{const nat=x.nat||(israeliTop?'Israel':'');const natHe=NAT_HE[nat]||nat||'';const p={i,id:clubId+'#'+i,he:String(x.he).trim(),en:x.en&&x.en!==x.he?x.en:null,pos:POS.includes(x.pos)?x.pos:'MF',age:x.age??null,nat:natHe,
      foreign:natHe!=='ישראל'&&!(x.nat2&&(NAT_HE[x.nat2]||x.nat2)==='ישראל'),known:x.value_m!=null,seed:hash32(clubId+'|'+(x.en||x.he)+'|'+i)};
    p.face=faceOf(israeliTop?ilFace[p.he]:euFace[clubName+'|'+x.en]);
    if(Number.isInteger(x.no)&&x.no>0&&x.no<100){p.no=x.no;p.noSource='data'}   /* an official number in the squad file wins */
    p.ovr=israeliTop?(x.value_m!=null?ratingFromValue(x.value_m,x.age):null):euroRating(x.value_m,x.age);if(x.ft_only&&p.ovr!=null)p.ovr=clamp(p.ovr-3,44,80);return p});
  if(israeliTop){const known=players.filter(p=>p.ovr!=null).map(p=>p.ovr).sort((a,b)=>a-b);const median=known.length?known[known.length>>1]:60;for(const p of players)if(p.ovr==null)p.ovr=clamp(Math.round(median-3+gauss(r)*3),46,80)}
  else{for(const p of players)if(p.ovr==null)p.ovr=clamp(Math.round(str-14+gauss(r)*3),46,72);
    const known=players.filter(p=>p.known);if(known.length&&known.length<players.length){const low=Math.min(...known.map(p=>p.ovr));for(const p of players)if(!p.known&&p.ovr>=low)p.ovr=Math.max(46,low-1)}
    const top=players.map(p=>p.ovr).sort((a,b)=>b-a).slice(0,14);const shift=clamp(Math.round(str+1-top.reduce((a,b)=>a+b,0)/top.length),-7,7);if(shift)for(const p of players)p.ovr=clamp(p.ovr+shift,46,94)}
  ensureNumbers(players);const xi=bestXI(players,israeliTop);let gk=xi.find(p=>p.pos==='GK')||players.find(p=>p.pos==='GK')||null;
  const order=xi.filter(p=>p!==gk).map(p=>({p,s:shootSkill(p)})).sort((a,b)=>(b.s-a.s)||(a.p.i-b.p.i)).map(x=>x.p);
  if(!gk){gk=order.pop()}   /* a squad file without a keeper: the weakest finisher of the eleven stands in goal */
  return {club:clubId,source:{file,note:sourceNote||null,generatedFields:generated||[],numbers:players.some(p=>p.noSource==='data')?'data+assigned':'assigned'},
    players:players.map(p=>({id:p.id,he:p.he,en:p.en,pos:p.pos,age:p.age,nat:p.nat,ovr:p.ovr,no:p.no,noSource:p.noSource||'assigned',shot:shootSkill(p),keep:keepSkill(p),...(p.face?{face:p.face}:{})})),
    order:[...order.map(p=>p.i),gk.i],gk:gk.i,strength:Math.round(xi.reduce((t,p)=>t+p.ovr,0)/Math.max(1,xi.length))}}
/* ---- collect the clubs ---- */
const euroFiles={};for(const f of fs.readdirSync(path.join(SRC,'data','euro')).filter(f=>f.endsWith('.json')).sort()){try{const d=json('data/euro/'+f);if(d.players&&d.name_he)euroFiles[d.name_he]={file:'data/euro/'+f,key:d.key||f.replace(/\.json$/,''),d}}catch(e){console.warn('skip',f,e.message)}}
fs.rmSync(path.join(OUT,'squads'),{recursive:true,force:true});fs.mkdirSync(path.join(OUT,'squads'),{recursive:true});
const clubs={};const missing=[];
function addClub(id,meta,raw,opt){if(clubs[id])return clubs[id];if(!raw||raw.filter(x=>x&&x.he).length<14){missing.push(meta.name+' ('+id+')');return null}
  const sq=buildSquad(id,raw,{...opt,clubName:meta.name});const file=id.replace(/[^a-z0-9_]+/gi,'_')+'.json';fs.writeFileSync(path.join(OUT,'squads',file),JSON.stringify(sq));
  return clubs[id]={id,name:meta.name,short:meta.short||meta.name,city:meta.city||'',c1:meta.c1||'#254baf',c2:meta.c2||'#ffffff',str:sq.strength,design:opt.str??null,squad:'squads/'+file,n:sq.players.length,hash:crypto.createHash('sha256').update(JSON.stringify(sq)).digest('hex').slice(0,12)}}
const euroClub=(name,c1,c2,str,city)=>{const e=euroFiles[name];if(!e){missing.push(name+' (no squad file)');return null}
  return addClub('e:'+e.key,{name,city,c1,c2},e.d.players,{str,file:e.file,generated:e.d.generated,sourceNote:e.d.source})};
const il=[];for(const id of Object.keys(META)){let d=null;try{d=json('data/'+id+'.json')}catch(e){}const fb=FALLBACK[id]||{};
  const c=addClub('il:'+id,{name:d?.name_he||fb.name,short:META[id].short,city:META[id].city,c1:d?.colors?.[0]||fb.colors?.[0],c2:d?.colors?.[1]||fb.colors?.[1]||'#ffffff'},d?.players,{str:LSTR[id]||60,israeliTop:true,file:'data/'+id+'.json'});if(c)il.push(c.id)}
const leumit=[];for(const d of LEUMIT16){const e=euroFiles[d.name];if(!e){missing.push(d.name+' (לאומית, no squad file)');continue}
  const c=addClub('l:'+d.id,{name:d.name,short:d.short,city:d.city,c1:d.c1,c2:d.c2},e.d.players,{str:d.str||55,file:e.file,generated:e.d.generated,sourceNote:e.d.source});if(c)leumit.push(c.id)}
const alef={alef_north:[],alef_south:[]};for(const [name,e] of Object.entries(euroFiles)){const lg=e.d.league;if(!lg||!alef[lg])continue;
  const c=addClub('a:'+e.key,{name,city:e.d.city,c1:e.d.c1||'#1d4ed8',c2:e.d.c2||'#ffffff'},e.d.players,{str:52,file:e.file,generated:e.d.generated,sourceNote:e.d.source});if(c)alef[lg].push(c.id)}
const byStr=ids=>ids.sort((a,b)=>(clubs[b].design??clubs[b].str)-(clubs[a].design??clubs[a].str)||clubs[a].name.localeCompare(clubs[b].name,'he'));
const world=(k,withCountry)=>{const L=WORLD_LEAGUES[k];const out=[];if(!L)return out;
  for(const c of L.clubs){const e=EURO_CLUBS.find(x=>x[0]===c[0]);const club=e?euroClub(e[0],e[4],e[5],e[6],e[2]):euroClub(c[0],c[2],c[3],c[4],c[1]);if(club&&!out.includes(club.id))out.push(club.id)}
  if(withCountry)for(const e of EURO_CLUBS)if(e[1]===withCountry){const club=euroClub(e[0],e[4],e[5],e[6],e[2]);if(club&&!out.includes(club.id))out.push(club.id)}
  return byStr(out)};
const countries=[
 {id:'il',name:'ישראל',leagues:[{id:'il1',name:'ליגת העל',tier:1,clubs:byStr(il)},{id:'il2',name:'ליגה לאומית',tier:2,clubs:byStr(leumit)},{id:'il3n',name:'ליגה א׳ צפון',tier:3,clubs:byStr(alef.alef_north)},{id:'il3s',name:'ליגה א׳ דרום',tier:3,clubs:byStr(alef.alef_south)}]},
 {id:'en',name:'אנגליה',leagues:[{id:'en1',name:'פרמייר ליג',tier:1,clubs:world('epl','אנגליה')},{id:'en2',name:'צ׳מפיונשיפ',tier:2,clubs:world('champ')}]},
 {id:'es',name:'ספרד',leagues:[{id:'es1',name:'לה ליגה',tier:1,clubs:world('laliga','ספרד')},{id:'es2',name:'לה ליגה 2',tier:2,clubs:world('segunda')}]},
 {id:'it',name:'איטליה',leagues:[{id:'it1',name:'סרייה א׳',tier:1,clubs:world('seriea','איטליה')}]},
 {id:'de',name:'גרמניה',leagues:[{id:'de1',name:'בונדסליגה',tier:1,clubs:world('bundes','גרמניה')}]},
 {id:'fr',name:'צרפת',leagues:[{id:'fr1',name:'ליג 1',tier:1,clubs:world('ligue1','צרפת')}]},
 {id:'nl',name:'הולנד',leagues:[{id:'nl1',name:'ארדיוויזי',tier:1,clubs:world('eredivisie','הולנד')}]},
 {id:'pt',name:'פורטוגל',leagues:[{id:'pt1',name:'ליגת פורטוגל',tier:1,clubs:world('portugal','פורטוגל')}]},
 {id:'be',name:'בלגיה',leagues:[{id:'be1',name:'ליגת בלגיה',tier:1,clubs:world('belgium','בלגיה')}]}];
/* everything else the data can field: the remaining world leagues, then the remaining European clubs by country */
const placed=()=>new Set(countries.flatMap(c=>c.leagues.flatMap(l=>l.clubs)));const used=new Set(['epl','champ','laliga','segunda','seriea','bundes','ligue1','eredivisie','portugal','belgium']);
const more=[];for(const k of Object.keys(WORLD_LEAGUES)){if(used.has(k))continue;const ids=world(k).filter(id=>!placed().has(id)&&!more.some(l=>l.clubs.includes(id)));if(ids.length)more.push({id:'w_'+k,name:WORLD_LEAGUES[k].name,tier:1,clubs:ids})}
const rest={};for(const e of EURO_CLUBS){const c=euroClub(e[0],e[4],e[5],e[6],e[2]);if(!c||placed().has(c.id)||more.some(l=>l.clubs.includes(c.id)))continue;(rest[e[1]]=rest[e[1]]||[]).push(c.id)}
const small=[];for(const [country,ids] of Object.entries(rest)){if(ids.length>=6)more.push({id:'x_'+hash32(country).toString(36),name:country,tier:1,clubs:byStr(ids)});else small.push(...ids)}
if(small.length)more.push({id:'x_more',name:'מועדונים נוספים',tier:1,clubs:byStr(small)});
if(more.length)countries.push({id:'world',name:'שאר העולם',leagues:more});
for(const c of countries)c.leagues=c.leagues.filter(l=>l.clubs.length>=2);   /* a league nobody can play in is not shown */
const cat={countries:countries.filter(c=>c.leagues.length),clubs};
/* the Champions League as its own list: the strongest sixteen, at most four of one country */
{const per={},best=[];const pool=cat.countries.filter(c=>c.id!=='world').flatMap(c=>c.leagues.filter(l=>l.tier===1).flatMap(l=>l.clubs.map(id=>({id,c:c.id})))).sort((a,b)=>clubs[b.id].design-clubs[a.id].design);
  for(const {id,c} of pool){if(best.length>=16)break;if(best.includes(id)||(per[c]||0)>=4)continue;per[c]=(per[c]||0)+1;best.push(id)}
  if(best.length>=8)cat.countries.push({id:'cl',name:'אירופה',cup:true,leagues:[{id:'cl1',name:'ליגת האלופות',tier:0,clubs:best}]})}
const usedIds=new Set(cat.countries.flatMap(c=>c.leagues.flatMap(l=>l.clubs)));for(const id of Object.keys(clubs))if(!usedIds.has(id)){fs.rmSync(path.join(OUT,clubs[id].squad),{force:true});delete clubs[id]}
let commit='unknown';try{const head=fs.readFileSync(path.join(SRC,'.git','HEAD'),'utf8').trim();commit=head.startsWith('ref:')?fs.readFileSync(path.join(SRC,'.git',head.slice(5)),'utf8').trim():head}catch(e){}
cat.source={repo:'sunride-ai-chatbot/goalassoMANAGER',commit};cat.version=crypto.createHash('sha256').update(JSON.stringify(cat)).digest('hex').slice(0,10);
/* the portrait packs the listed squads use, copied as they are, and who to credit for each photograph */
const packDir=path.resolve(OUT,'..','assets','facepacks');fs.rmSync(packDir,{recursive:true,force:true});fs.mkdirSync(packDir,{recursive:true});let faces=0;
const kept=new Set();for(const c of Object.values(clubs)){const sq=JSON.parse(fs.readFileSync(path.join(OUT,c.squad),'utf8'));for(const p of sq.players)if(p.face){kept.add(p.face[0]);faces++}}
for(const pack of kept)fs.copyFileSync(path.join(SRC,'assets','facepacks',pack+'.json'),path.join(packDir,pack+'.json'));
console.log('portraits',faces,'in',kept.size,'packs');
fs.writeFileSync(path.join(OUT,'catalog.json'),JSON.stringify(cat));
console.log('catalog',cat.version,'commit',commit.slice(0,8),'clubs',Object.keys(clubs).length,'players',Object.values(clubs).reduce((t,c)=>t+c.n,0));
for(const c of cat.countries)console.log(' ',c.name+':',c.leagues.map(l=>l.name+' '+l.clubs.length).join(' · '));
if(missing.length)console.log('not listed (no squad of 14+ in the data):',[...new Set(missing)].join(', '));
