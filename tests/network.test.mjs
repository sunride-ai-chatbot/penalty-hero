// Two phones in one in-memory room: lost messages, duplicates, a third guest, a forged reveal, version mismatch, rematch.
import test from 'node:test';import assert from 'node:assert/strict';
import {createRoom,sha256,encodeChoice,validChoice,MSG,PROTOCOL} from '../src/net/protocol.js';
import {memoryBus,newRoomCode,cleanCode,ROOM_ALPHABET,loadTransport} from '../src/net/transport.js';
import {resolveKick,makeRng,RULES_VERSION} from '../src/core/rules.js';
import {createDuel,turnOf,recordKick,scoreOf} from '../src/core/duel.js';
const tick=(ms=5)=>new Promise(r=>setTimeout(r,ms));const until=async(f,what,ms=4000)=>{const t=Date.now();while(!f()){if(Date.now()-t>ms)throw new Error('timed out: '+what);await tick(3)}};
const TEAMS={'e:psg':'hash-psg','il:mta':'hash-mta'};const timers={retry:25,silence:400,lobby:5000};
function phone(bus,code,host,team,name,extra={}){const p={starts:[],fails:[],states:[],again:0,team};
  p.room=createRoom({connect:bus.transport(),code,host,me:()=>({team:p.team,name,hash:TEAMS[p.team]}),catalog:extra.catalog||'cat1',resolveTeam:async id=>(extra.teams||TEAMS)[id]||null,timers,
    on:{state:s=>p.states.push(s),start:s=>p.starts.push(s),fail:m=>p.fails.push(m),again:()=>p.again++}});return p}
async function playDuel(H,G,{sk=80,gk=75}={}){const s=H.starts.at(-1);const dh=createDuel(s.first),dg=createDuel(s.first);const results=[];
  while(!dh.winner){const t=turnOf(dh),k=t.k;const hostKicks=t.side==='a';
    const [rh,rg]=await Promise.all([H.room.exchange(k,hostKicks?{x:2.31+k*.01,y:.8,m:.74}:{d:{x:-2.4,y:1.2}},hostKicks),G.room.exchange(k,hostKicks?{d:{x:2.4,y:.5}}:{x:-2.5,y:1.4,m:.7},!hostKicks)]);
    assert.deepEqual(rh,rg,'both phones hold the same choices and the same seed');
    const a=resolveKick({aim:{x:rh.kick.x,y:rh.kick.y},meter:rh.kick.m,shotSkill:sk,keeperSkill:gk,dive:rh.dive,rng:makeRng(rh.seed)}),b=resolveKick({aim:{x:rg.kick.x,y:rg.kick.y},meter:rg.kick.m,shotSkill:sk,keeperSkill:gk,dive:rg.dive,rng:makeRng(rg.seed)});
    assert.deepEqual(a,b);recordKick(dh,k,a.out);recordKick(dg,k,b.out);results.push(a.how)}
  assert.deepEqual(scoreOf(dh),scoreOf(dg));assert.equal(dh.winner,dg.winner);H.room.finish();G.room.finish();return {dh,results}}

test('room codes: six characters of the unambiguous alphabet',()=>{for(let i=0;i<50;i++){const c=newRoomCode();assert.equal(c.length,6);assert.ok([...c].every(ch=>ROOM_ALPHABET.includes(ch)))}
  assert.equal(cleanCode(' ab-c2 34x '),'ABC234');assert.equal(cleanCode('O0I1ab'),'AB');assert.equal(ROOM_ALPHABET,'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')});

test('commitments are SHA-256; choices are validated',async()=>{assert.equal(await sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(await sha256(encodeChoice({d:{x:-2.4,y:1.2}})+'|n'),await sha256(encodeChoice({d:{x:2.4,y:1.2}})+'|n'));
  assert.ok(validChoice({x:1,y:1,m:.7,c:0},true));assert.ok(validChoice({x:1,y:1,m:.7,c:-1},true));assert.ok(!validChoice({x:1,y:1,m:.7,c:5},true));assert.ok(!validChoice({x:99,y:1,m:.7,c:0},true));assert.ok(!validChoice({x:1,y:1,m:7,c:0},true));assert.ok(validChoice({d:{x:-2.4,y:1.9}},false));assert.ok(!validChoice({d:{x:'a',y:1}},false));assert.ok(!validChoice({d:{x:-2.4,y:1.2}},true))});

test('a full duel: different clubs and names, the same result on both phones, in the same order',async()=>{const bus=memoryBus();
  const H=phone(bus,'ROOM22',true,'e:psg','דני'),G=phone(bus,'ROOM22',false,'il:mta','מאיה');await until(()=>H.starts.length&&G.starts.length,'start');
  const sh=H.starts[0],sg=G.starts[0];assert.equal(sh.mine,'a');assert.equal(sg.mine,'b');assert.equal(sh.first,sg.first);
  assert.equal(sg.a.team,'e:psg');assert.equal(sg.b.team,'il:mta');assert.equal(sg.a.name,'דני');assert.equal(sh.b.name,'מאיה');
  const {dh}=await playDuel(H,G);assert.ok(dh.winner);assert.ok(dh.log.length>=6);assert.deepEqual(H.fails,[]);assert.deepEqual(G.fails,[]);
  assert.ok(!bus.sent.some(m=>m.t==='r'&&bus.sent.findIndex(x=>x.t==='c'&&x.k===m.k&&x.f!==m.f)>bus.sent.indexOf(m)),'no reveal went out before the other commitment');
  H.room.close();G.room.close()});

test('nobody sees the other choice early: the reveal waits for the commitment',async()=>{const bus=memoryBus();
  const H=phone(bus,'ROOM23',true,'e:psg','a'),G=phone(bus,'ROOM23',false,'il:mta','b');await until(()=>H.starts.length&&G.starts.length,'start');
  const hostKicks=H.starts[0].first==='a';const before=bus.sent.length;const pending=H.room.exchange(0,hostKicks?{x:1,y:1,m:.7}:{d:{x:-2.4,y:1.2}},hostKicks);await tick(120);
  const mine=bus.sent.slice(before).filter(m=>m.f===H.room.id);assert.ok(mine.some(m=>m.t==='c'));assert.ok(!mine.some(m=>m.t==='r'),'the host revealed nothing while the guest had not committed');
  assert.ok(!JSON.stringify(mine.filter(m=>m.t==='c')).includes('"x"'));
  const g=await Promise.all([pending,G.room.exchange(0,hostKicks?{d:{x:2.4,y:1.2}}:{x:1,y:1,m:.7},!hostKicks)]);assert.deepEqual(g[0],g[1]);H.room.close();G.room.close()});

test('lost and repeated messages: the duel still finishes, and every kick counts once',async()=>{const bus=memoryBus();const lose=makeRng(77);bus.drop=m=>(m.t==='c'||m.t==='r'||m.t==='start'||m.t==='hi')&&lose()<.4;   // four in ten are lost
  const H=phone(bus,'ROOM24',true,'e:psg','a'),G=phone(bus,'ROOM24',false,'il:mta','b');await until(()=>H.starts.length&&G.starts.length,'start despite losses');
  const {dh}=await playDuel(H,G);assert.ok(dh.winner);assert.equal(H.starts.length,1);assert.equal(G.starts.length,1,'a repeated start does not begin a second duel');
  assert.equal(dh.log.length,new Set(dh.log.map(x=>x.k)).size);await assert.rejects(()=>H.room.exchange(0,{d:{x:-2.4,y:1.2}},false));H.room.close();G.room.close()});

test('a third phone is told the room is full and disturbs nothing',async()=>{const bus=memoryBus();
  const H=phone(bus,'ROOM25',true,'e:psg','a'),G=phone(bus,'ROOM25',false,'il:mta','b');await until(()=>H.starts.length&&G.starts.length,'start');
  const X=phone(bus,'ROOM25',false,'il:mta','x');await until(()=>X.fails.length,'third phone refused');assert.equal(X.fails[0],MSG.full);assert.equal(X.starts.length,0);
  const {dh}=await playDuel(H,G);assert.ok(dh.winner);H.room.close();G.room.close()});

test('a forged reveal on the wire is rejected with the mismatch message',async()=>{const rooms=[];const wire=()=>async(code,onMessage)=>{const me={onMessage};rooms.push(me);return {send(m){const copy=JSON.parse(JSON.stringify(m));if(copy.t==='r'&&me.forge){if(copy.choice.d)copy.choice.d.x=+(copy.choice.d.x>0?-1.2:1.2).toFixed(2);else copy.choice.x=+(copy.choice.x+1).toFixed(2)}
      for(const o of rooms)if(o!==me)setTimeout(()=>o.onMessage(JSON.parse(JSON.stringify(copy))),1)},close(){rooms.splice(rooms.indexOf(me),1)}}};
  const mk=(host,team)=>{const p={starts:[],fails:[]};p.room=createRoom({connect:wire(),code:'ROOM27',host,me:()=>({team,name:'n',hash:TEAMS[team]}),catalog:'c',resolveTeam:async id=>TEAMS[id]||null,timers,on:{start:s=>p.starts.push(s),fail:m=>p.fails.push(m)}});return p};
  const H=mk(true,'e:psg'),G=mk(false,'il:mta');await until(()=>H.starts.length&&G.starts.length,'start');rooms[1].forge=true;
  const hostKicks=H.starts[0].first==='a';const p=H.room.exchange(0,hostKicks?{x:2,y:1,m:.7}:{d:{x:-2.4,y:1.2}},hostKicks);const q=G.room.exchange(0,hostKicks?{d:{x:-2.4,y:1.2}}:{x:2,y:1,m:.7},!hostKicks);q.catch(()=>{});
  await assert.rejects(p,e=>e.message===MSG.mismatch);assert.deepEqual(H.fails,[MSG.mismatch]);G.room.close()});

test('different game data on the two phones: a clear incompatibility message, no duel',async()=>{const bus=memoryBus();
  const H=phone(bus,'ROOM28',true,'e:psg','a'),G=phone(bus,'ROOM28',false,'il:mta','b',{catalog:'cat-OLD'});await until(()=>G.fails.length,'guest told');assert.equal(G.fails[0],MSG.version);assert.equal(H.starts.length,0);H.room.close();
  const bus2=memoryBus();const H2=phone(bus2,'ROOM29',true,'e:psg','a'),G2=phone(bus2,'ROOM29',false,'il:mta','b',{teams:{'e:psg':'other-hash','il:mta':'hash-mta'}});
  await until(()=>G2.fails.length,'guest notices the squad differs');assert.equal(G2.fails[0],MSG.version);H2.room.close()});

test('rematch in the same room, with another club, without a new invitation',async()=>{const bus=memoryBus();
  const H=phone(bus,'ROOM30',true,'e:psg','a'),G=phone(bus,'ROOM30',false,'il:mta','b');await until(()=>H.starts.length&&G.starts.length,'start');await playDuel(H,G);
  G.team='e:psg';G.room.again();await until(()=>H.again>0,'host hears the request');assert.equal(H.starts.length,1,'nothing starts until both asked');H.room.again();
  await until(()=>H.starts.length===2&&G.starts.length===2,'second duel');assert.equal(G.starts[1].b.team,'e:psg');assert.equal(G.starts[1].a.team,'e:psg','both chose the same club on purpose');assert.equal(G.starts[1].n,2);
  const {dh}=await playDuel(H,G);assert.ok(dh.winner);H.room.close();G.room.close()});

test('leaving and silence are visible: no duel hangs forever',async()=>{const bus=memoryBus();
  const H=phone(bus,'ROOM31',true,'e:psg','a'),G=phone(bus,'ROOM31',false,'il:mta','b');await until(()=>H.starts.length&&G.starts.length,'start');
  const hostKicks=H.starts[0].first==='a';const p=H.room.exchange(0,hostKicks?{x:1,y:1,m:.7}:{d:{x:-2.4,y:1.2}},hostKicks);G.room.close();await assert.rejects(p,e=>e.message===MSG.left);assert.deepEqual(H.fails,[MSG.left]);
  const bus2=memoryBus();const H2=phone(bus2,'ROOM32',true,'e:psg','a'),G2=phone(bus2,'ROOM32',false,'il:mta','b');await until(()=>H2.starts.length&&G2.starts.length,'start');
  bus2.drop=m=>m.f===G2.room.id;const k2=H2.starts[0].first==='a';const p2=H2.room.exchange(0,k2?{x:1,y:1,m:.7}:{d:{x:-2.4,y:1.2}},k2);p2.catch(()=>{});await until(()=>H2.fails.length,'silence detected',3000);assert.equal(H2.fails[0],MSG.silent);G2.room.close()});

test('no network service configured: unavailable, never a fake room',async()=>{
  const none=await loadTransport('x',{fetchImpl:async()=>({ok:true,json:async()=>({transport:'none'})})});assert.equal(none.available,false);assert.equal(none.connect,null);
  const broken=await loadTransport('x',{fetchImpl:async()=>{throw new Error('offline')}});assert.equal(broken.available,false);
  const secret=await loadTransport('x',{fetchImpl:async()=>({ok:true,json:async()=>({transport:'supabase',url:'https://p.supabase.co',key:'eyJ-service_role-xxxxxxxxxxxxxxxxxxxxxxxx'})})});assert.equal(secret.available,false,'a service-role key is refused');
  const example=await loadTransport('x',{fetchImpl:async()=>({ok:true,json:async()=>({transport:'supabase',url:'https://YOUR-PROJECT.supabase.co',key:'YOUR-PUBLISHABLE-(anon)-KEY'})})});assert.equal(example.available,false);
  const ok=await loadTransport('x',{fetchImpl:async()=>({ok:true,json:async()=>({transport:'supabase',url:'https://abc.supabase.co',key:'sb_publishable_0123456789abcdefghij'})})});assert.equal(ok.available,true);assert.equal(ok.kind,'supabase');assert.equal(PROTOCOL,3);assert.ok(RULES_VERSION>=10)});
