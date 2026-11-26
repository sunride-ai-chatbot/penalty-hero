import test from 'node:test';import assert from 'node:assert/strict';
import {cleanAvatar,createCup,sizeFor,applyResult,winnerOf,matchView,allMatches,champion,nextFor,outOf,standings,slotsOf,nextSlot,publicCupId,resultsOf,roundName} from '../src/core/cup.js';
const roster=n=>Array.from({length:n},(_,i)=>({id:'p'+i,name:'שחקן '+i,team:'t'+i}));
const play=(cup,r,m,w,extra={})=>{const [a,b]=slotsOf(cup,r,m);return applyResult(cup,{r,m,a,b,w,ga:w===a?4:2,gb:w===a?2:4,ka:5,kb:5,kind:'played',...extra})};
test('sizes and names',()=>{assert.deepEqual([2,3,4,5,8].map(sizeFor),[2,4,4,8,8]);assert.equal(createCup(roster(1)),null);assert.equal(roundName(8,0),'רבע גמר');assert.equal(roundName(8,2),'גמר');assert.equal(roundName(2,0),'גמר')});
test('the same roster and salt give the same bracket; another salt another one',()=>{const a=createCup(roster(8),'x'),b=createCup(roster(8),'x'),c=createCup(roster(8),'y');assert.deepEqual(a.slots,b.slots);assert.notDeepEqual(a.slots,c.slots)});
test('a bye never meets a bye, for every size',()=>{for(let n=2;n<=8;n++){const cup=createCup(roster(n),'s'+n);for(let m=0;m<cup.size/2;m++)assert.ok(cup.slots[2*m]||cup.slots[2*m+1],n+' players, pair '+m);assert.equal(cup.slots.filter(Boolean).length,n)}});
test('eight players play a full cup and one wins',()=>{const cup=createCup(roster(8),'k');assert.equal(allMatches(cup).length,7);
  for(let m=0;m<4;m++){assert.equal(matchView(cup,0,m).status,'ready');assert.ok(play(cup,0,m,slotsOf(cup,0,m)[0]))}
  assert.equal(matchView(cup,1,0).status,'ready');play(cup,1,0,slotsOf(cup,1,0)[1]);play(cup,1,1,slotsOf(cup,1,1)[0]);assert.equal(champion(cup),undefined);
  const [a,b]=slotsOf(cup,2,0);play(cup,2,0,b);assert.equal(champion(cup),b);assert.ok(outOf(cup,a));assert.ok(!outOf(cup,b));
  const st=standings(cup);assert.equal(st[0].id,b);assert.ok(st[0].champion);assert.equal(st[0].wins,3);assert.equal(st[0].played,3)});
test('three players: one gets a bye, and the next match waits for the real one',()=>{const cup=createCup(roster(3),'q');const byes=allMatches(cup).filter(v=>v.r===0&&v.status==='bye');assert.equal(byes.length,1);
  const real=allMatches(cup).find(v=>v.r===0&&v.status==='ready');assert.equal(matchView(cup,1,0).status,'wait');play(cup,0,real.m,real.a);assert.equal(matchView(cup,1,0).status,'ready');
  const rows=standings(cup);assert.equal(rows.reduce((t,r)=>t+r.wins,0),1)});   // a bye is not a win
test('two players meet in the final',()=>{const cup=createCup(roster(2),'z');assert.equal(cup.size,2);assert.equal(matchView(cup,0,0).status,'ready');assert.ok(nextFor(cup,'p0'));play(cup,0,0,'p1');assert.equal(champion(cup),'p1');assert.equal(nextFor(cup,'p0'),null)});
test('a report that does not fit is refused',()=>{const cup=createCup(roster(8),'k');const [a,b]=slotsOf(cup,0,0);
  assert.equal(applyResult(cup,{r:0,m:0,a,b,w:'nobody',ga:1,gb:0,ka:1,kb:1,kind:'played'}),false);
  assert.equal(applyResult(cup,{r:0,m:0,a:b,b:a,w:a,ga:1,gb:0,ka:1,kb:1,kind:'played'}),false);
  assert.equal(applyResult(cup,{r:1,m:0,a,b,w:a,ga:1,gb:0,ka:1,kb:1,kind:'played'}),false);
  assert.equal(applyResult(cup,{r:0,m:0,a,b,w:a,ga:9,gb:0,ka:5,kb:5,kind:'played'}),false);   // more goals than kicks
  assert.equal(applyResult(cup,{r:0,m:0,a,b,w:a,ga:1,gb:0,ka:1,kb:1,kind:'cheat'}),false);assert.equal(resultsOf(cup).length,0)});
test('a played result beats a walkover, a walkover beats a bystander, and a repeat changes nothing',()=>{const cup=createCup(roster(4),'w');const [a,b]=slotsOf(cup,0,0);
  assert.ok(play(cup,0,0,a,{kind:'fb'}));assert.ok(play(cup,0,0,b,{kind:'wo'}));assert.equal(winnerOf(cup,0,0),b);assert.ok(!play(cup,0,0,a,{kind:'fb'}));
  assert.ok(play(cup,0,0,a,{kind:'played'}));assert.equal(winnerOf(cup,0,0),a);assert.ok(!play(cup,0,0,a,{kind:'played'}));assert.ok(!play(cup,0,0,b,{kind:'wo'}))});
test('when a result is replaced, later results that no longer fit are dropped',()=>{const cup=createCup(roster(4),'w');const [a0,b0]=slotsOf(cup,0,0);
  play(cup,0,0,a0,{kind:'wo'});play(cup,0,1,slotsOf(cup,0,1)[0]);play(cup,1,0,a0);assert.equal(champion(cup),a0);
  play(cup,0,0,b0,{kind:'played'});assert.equal(champion(cup),undefined);assert.equal(resultsOf(cup).length,2)});
test('standings: accuracy is goals over kicks',()=>{const cup=createCup(roster(2),'a');const [a,b]=slotsOf(cup,0,0);applyResult(cup,{r:0,m:0,a,b,w:a,ga:4,gb:3,ka:5,kb:5,kind:'played'});const rows=standings(cup);assert.deepEqual(rows.map(r=>[r.id,r.pct]),[[a,80],[b,60]])});
test('public cups: one every 15 minutes, never less than two minutes away, the same id for everyone',()=>{const t=Date.UTC(2026,10,26,10,3,0);const s=nextSlot(t);assert.equal(s%(15*60000),0);assert.ok(s-t>=2*60000);assert.equal(publicCupId(s),publicCupId(s+1000));assert.notEqual(publicCupId(s),publicCupId(s+15*60000));
  assert.equal(nextSlot(Date.UTC(2026,10,26,10,14,0)),Date.UTC(2026,10,26,10,30,0))});

test('a picture is a small photo or an icon; anything else is dropped',()=>{const photo='data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  assert.equal(cleanAvatar(photo),photo);assert.equal(cleanAvatar('e:⚽'),'e:⚽');assert.equal(cleanAvatar('e:👑'),'e:👑');
  for(const bad of ['','javascript:alert(1)','data:text/html;base64,PGI+','data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,AA" onerror="x','e:','e:a b','https://x/y.png',5,null,'data:image/jpeg;base64,'+'A'.repeat(12100)])assert.equal(cleanAvatar(bad),'');
  const cup=createCup([{id:'p0',name:'a',team:'t',av:photo},{id:'p1',name:'b',team:'t',av:'javascript:x'}],'s');assert.equal(cup.players.p0.av,photo);assert.equal(cup.players.p1.av,'')});
