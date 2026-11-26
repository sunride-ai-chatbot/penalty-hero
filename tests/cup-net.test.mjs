import test from 'node:test';import assert from 'node:assert/strict';
import {createCupNet} from '../src/net/cup.js';import {memoryBus} from '../src/net/transport.js';
import {slotsOf,champion,matchView,winnerOf} from '../src/core/cup.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const FAST={tick:15,reg:40,st:60,gap:70,fbReady:300,fbSeen:150};
const join=(bus,id,kick,extra={})=>createCupNet({connect:bus.transport(),cupId:'T1',kickoffAt:kick,me:()=>({id,name:'שחקן '+id,team:'t'+id}),timers:FAST,...extra});
test('eight phones sign up, get the same roster at the kick-off, and merge results',async()=>{const bus=memoryBus(),kick=Date.now()+250,ns=[];
  for(let i=0;i<8;i++)ns.push(join(bus,'p'+i,kick));
  await wait(700);for(const n of ns){assert.equal(n.status,'started');assert.ok(n.cup)}
  assert.deepEqual(ns.map(n=>n.cup.slots.join()).filter((v,i,a)=>a.indexOf(v)===i).length,1);
  const cup=ns[0].cup;for(let m=0;m<4;m++){const [a,b]=slotsOf(cup,0,m);const mine=ns.find(n=>n.id===a);assert.ok(mine.report({r:0,m,a,b,w:a,ga:4,gb:3,ka:5,kb:5,kind:'played'}))}
  await wait(250);for(const n of ns)assert.equal(matchView(n.cup,1,0).status,'ready');
  for(const n of ns)n.close()});
test('someone who signs up after the roster is out is told the cup is on',async()=>{const bus=memoryBus(),kick=Date.now()+150,a=join(bus,'a',kick),b=join(bus,'b',kick);await wait(450);assert.equal(a.status,'started');
  const c=join(bus,'c',kick);await wait(400);assert.equal(c.status,'late');assert.ok(c.cup);assert.ok(!c.cup.players.c);for(const n of [a,b,c])n.close()});
test('a lone player gets no cup',async()=>{const bus=memoryBus(),kick=Date.now()+100,a=join(bus,'solo',kick);await wait(500);assert.equal(a.status,'cancelled');a.close()});
test('if the first in line is not there, the next one publishes the roster',async()=>{const bus=memoryBus(),kick=Date.now()+250,a=join(bus,'a',kick),b=join(bus,'b',kick),c=join(bus,'c',kick);await wait(120);a.close();   // a dropped out after signing up
  await wait(600);assert.equal(b.status,'started');assert.equal(c.status,'started');assert.deepEqual(b.cup.slots,c.cup.slots);b.close();c.close()});
test('a match nobody turns up for is settled by the others, in the slot order',async()=>{const bus=memoryBus(),kick=Date.now()+150,ns=['a','b','c'].map(i=>join(bus,i,kick));await wait(450);
  const cup=ns[0].cup;const empty=[0,1].map(m=>matchView(cup,0,m)).find(v=>v.status==='ready');const absent=[empty.a,empty.b];
  for(const n of ns)if(absent.includes(n.id))n.close();    // both leave
  await wait(1200);const alive=ns.find(n=>!absent.includes(n.id));assert.ok(alive);assert.equal(winnerOf(alive.cup,0,empty.m),empty.a);alive.close()});
test('messages from another cup or a forged sender are ignored',async()=>{const bus=memoryBus(),kick=Date.now()+150,a=join(bus,'a',kick),b=join(bus,'b',kick);const t=bus.transport();const c=await t('CUP-T1',()=>{});
  c.send({v:3,k:'cup',cup:'OTHER',f:'x',t:'reg',p:{id:'x',name:'x',team:'t'}});c.send({v:3,k:'cup',cup:'T1',f:'y',t:'reg',p:{id:'z',name:'forged',team:'t'}});await wait(500);
  assert.deepEqual(a.regs().map(p=>p.id).sort(),['a','b']);assert.equal(a.status,'started');a.close();b.close();c.close()});

test('pictures travel with the sign-up and are known to everybody, also after the roster',async()=>{const bus=memoryBus(),kick=Date.now()+200,photo='data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const a=join(bus,'a',kick,{me:()=>({id:'a',name:'א',team:'t',av:photo})}),b=join(bus,'b',kick,{me:()=>({id:'b',name:'ב',team:'t',av:'e:⚽'})});await wait(150);
  assert.equal(a.avatarOf('b'),'e:⚽');assert.equal(b.avatarOf('a'),photo);await wait(500);assert.equal(b.avatarOf('a'),photo);
  const c=join(bus,'c',kick,{me:()=>({id:'c',name:'ג',team:'t',av:'<script>'})});await wait(300);assert.equal(a.avatarOf('c'),'');for(const n of [a,b,c])n.close()});
