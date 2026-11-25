// The built data: every listed club can really be played, identities are stable, numbers belong to squad players.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {setDataBase,loadCatalog,loadSquad,buildSide,clubById,kitsFor,similarOpponent,shirtName,loadFace} from '../src/data/catalog.js';
import {takerIndex} from '../src/core/duel.js';import {colDist} from '../src/ui/crest.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const fileFetch=async url=>{const p=fileURLToPath(url);return fs.existsSync(p)?{ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(p,'utf8'))}:{ok:false,status:404}};
setDataBase(new URL('file://'+ROOT+'/data/'));const cat=await loadCatalog(fileFetch);

test('countries, leagues, clubs: the hierarchy the picker shows',()=>{const ids=cat.countries.map(c=>c.id);for(const id of ['il','en','es','it','de','fr','nl','pt','be'])assert.ok(ids.includes(id),id);
  const il=cat.countries.find(c=>c.id==='il');assert.deepEqual(il.leagues.map(l=>l.id),['il1','il2','il3n','il3s']);assert.equal(il.leagues[0].clubs.length,14);
  for(const c of cat.countries)for(const l of c.leagues){assert.ok(l.clubs.length>=2,'no empty league is listed: '+l.name);for(const id of l.clubs)assert.ok(cat.clubs[id],id)}
  assert.ok(Object.keys(cat.clubs).length>250);assert.match(cat.source.commit,/^96321f70/)});

test('every club has a playable squad: eleven in order, a keeper, unique stable ids and numbers',async()=>{let players=0;
  for(const club of Object.values(cat.clubs)){const sq=await loadSquad(club.id,fileFetch);const side=buildSide(club,sq);players+=sq.players.length;
    assert.equal(side.order.length,11,club.name);assert.equal(new Set(side.order).size,11);assert.equal(side.order[10],side.keeper,club.name+': the keeper kicks last');
    assert.equal(new Set(sq.players.map(p=>p.id)).size,sq.players.length);assert.equal(new Set(sq.players.map(p=>p.no)).size,sq.players.length,club.name+': shirt numbers are unique');
    for(const p of sq.players){assert.ok(p.he&&p.no>=1&&p.no<=99&&p.shot>=30&&p.shot<=96,club.name+' '+p.he);assert.ok(['data','assigned'].includes(p.noSource))}
    for(let i=1;i<10;i++)assert.ok(side.order[i-1].shot>=side.order[i].shot,club.name+': best finishers first');assert.ok(/^[0-9a-f]{12}$/.test(club.hash))}
  assert.ok(players>8000)});

test('the taker changes with every kick and returns after a full round; PSG is not stuck on one man',async()=>{const club=clubById('e:psg');const side=buildSide(club,await loadSquad('e:psg',fileFetch));
  const five=[0,1,2,3,4].map(n=>side.order[takerIndex(side.order.length,n)]);assert.equal(new Set(five.map(p=>p.id)).size,5);assert.equal(new Set(five.map(p=>p.no)).size,5);
  assert.equal(side.order[takerIndex(11,11)],side.order[0]);assert.ok(five.every(p=>p.pos!=='GK'));assert.ok(shirtName(five[0]).length>0)});

test('the shirt carries the footballer, never the participant; a twin side keeps its own id',async()=>{const club=clubById('il:mta');const sq=await loadSquad('il:mta',fileFetch);
  const A=buildSide(club,sq,{participant:'דני'}),B=buildSide(club,sq,{twin:true,participant:'מאיה'});assert.notEqual(A.id,B.id);assert.equal(B.id,'il:mta#2');assert.equal(A.order[0],B.order[0]);
  for(const p of A.order)assert.notEqual(shirtName(p),'דני');assert.equal(A.participant,'דני')});

test('kits: shirt and shorts can be told apart, the keeper wears neither side\'s colour',async()=>{for(const [a,b] of [['e:psg','il:mta'],['il:bje','il:mnt'],['e:real_madrid','e:juventus']]){if(!clubById(a)||!clubById(b))continue;
    const A=buildSide(clubById(a),await loadSquad(a,fileFetch)),B=buildSide(clubById(b),await loadSquad(b,fileFetch));const k=kitsFor(A,B);assert.ok(colDist(k.kit,k.trim)>=60);assert.ok(colDist(k.gkKit,k.kit)>100);assert.ok(colDist(k.gkKit,k.oppKit)>100)}});

test('a drawn opponent is another club of similar strength',()=>{for(let i=0;i<40;i++){const o=similarOpponent('il:mta',()=>i/40);assert.notEqual(o.id,'il:mta');assert.ok(Math.abs(o.str-clubById('il:mta').str)<=7)}});

test('motion data matches its atlases; every file the game loads exists',()=>{const d=JSON.parse(fs.readFileSync(ROOT+'/assets/penalties29/motions/clips.json','utf8')).highL;
  assert.equal(d.frames,79);assert.equal(d.fps,20);assert.equal(d.contact,2.35);assert.equal(d.floors.length,79);assert.equal(d.labels.length,79);assert.deepEqual(d.pages.map(p=>p.frames),[72,7]);assert.equal(d.pages[1].cols,9,'the second page has nine cells and seven frames');
  for(const f of ['assets/penalties29/motions/highL-native-0.webp','assets/penalties29/motions/highL-native-1.webp','assets/penalties29/taker/goal.png','assets/penalties29/taker/miss.png','assets/penalties29/taker/goal.webp','assets/penalties29/taker/miss.webp','assets/penalties29/turf/grass02.jpg','assets/penalties29/video/kahal-duo-loop.mp4','assets/penalties29/video/kahal-poster.jpg','assets/stand-crowd.webp','assets/penalty-intro.mp4','assets/penalty-crest.webp','assets/penalty-180.png','assets/penalty-192.png','assets/penalty-512.png','assets/cinematic-stadium.webp','assets/penalties29/demo3d/vendor/THREE-LICENSE.txt','assets/audio/credits.json',...['bed','goal','chance','song'].flatMap(n=>['assets/audio/crowd-'+n+'.opus','assets/audio/crowd-'+n+'.m4a'])])assert.ok(fs.existsSync(path.join(ROOT,f)),f);
  const src=['penalty.js','world.js','filmed-taker.js','crowd-video.js','actors.js'].map(f=>fs.readFileSync(ROOT+'/assets/penalties29/demo3d/'+f,'utf8')).join('\n');assert.ok(!/goal-m\.com/.test(src),'no dependency on the original domain');assert.ok(!/pendel24/.test(src),'the old fixed-number plate is not used');
  const m=JSON.parse(fs.readFileSync(ROOT+'/app.webmanifest','utf8'));assert.equal(m.start_url,'./');assert.equal(m.scope,'./');assert.equal(m.id,'./');assert.equal(m.name,'Penalty Hero');for(const i of m.icons)assert.ok(fs.existsSync(path.join(ROOT,i.src)));
  const sw=fs.readFileSync(ROOT+'/sw.js','utf8'),ver=fs.readFileSync(ROOT+'/src/version.js','utf8').match(/VERSION='([^']+)'/)[1];assert.ok(sw.includes("VERSION='"+ver+"'"),'service worker and app carry the same version')});

test('portraits: every face a squad points to is in its pack; a player without one gets none',async()=>{let faces=0;const packs=new Map();
  for(const club of Object.values(cat.clubs)){const sq=await loadSquad(club.id,fileFetch);for(const p of sq.players){if(!p.face)continue;faces++;const [pack,id]=p.face;
      if(!packs.has(pack))packs.set(pack,JSON.parse(fs.readFileSync(path.join(ROOT,'assets/facepacks',pack+'.json'),'utf8')));assert.match(packs.get(pack).images[id]||'',/^data:image\/webp;base64,/,club.name+' '+p.he)}}
  assert.ok(faces>2000);assert.equal(fs.readdirSync(path.join(ROOT,'assets/facepacks')).length,packs.size,'only the packs in use are shipped');
  const psg=await loadSquad('e:psg',fileFetch),first=psg.players[psg.order[0]];const face=await loadFace(first,fileFetch);assert.ok(face&&face.src.startsWith('data:image/webp'));assert.ok(face.credit&&face.credit.license);
  assert.equal(await loadFace({he:'x'},fileFetch),null);assert.equal(await loadFace({face:['no-such-pack','x']},fileFetch),null,'a missing pack is a fallback, not an error')});
