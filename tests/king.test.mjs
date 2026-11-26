import test from 'node:test';import assert from 'node:assert/strict';
import {rowFor,rankKing,kingApi,MIN_KICKS} from '../src/net/king.js';import {createCup,applyResult,slotsOf} from '../src/core/cup.js';
const roster=n=>Array.from({length:n},(_,i)=>({id:'player-'+i,name:'שחקן '+i,team:'t'+i}));
test('a finished cup gives each player one row; small cups give none',()=>{const cup=createCup(roster(4),'s');
  for(let m=0;m<2;m++){const [a,b]=slotsOf(cup,0,m);applyResult(cup,{r:0,m,a,b,w:a,ga:4,gb:3,ka:5,kb:5,kind:'played'})}const [a,b]=slotsOf(cup,1,0);applyResult(cup,{r:1,m:0,a,b,w:b,ga:2,gb:3,ka:5,kb:5,kind:'played'});
  const w=rowFor(cup,'C1',b),l=rowFor(cup,'C1',a);assert.equal(w.champion,true);assert.equal(w.matches_won,2);assert.equal(w.goals,7);assert.equal(w.kicks,10);assert.equal(l.champion,false);assert.equal(rowFor(createCup(roster(3),'s'),'C1','player-0'),null);assert.equal(rowFor(cup,'C1','nobody'),null)});
test('the king is who won most cups, then who shot best; accuracy needs enough kicks',()=>{
  const rows=[{player_id:'a',name:'א',cups:3,titles:1,wins:5,goals:20,kicks:30},{player_id:'b',name:'ב',cups:1,titles:1,wins:3,goals:14,kicks:15},{player_id:'c',name:'ג',cups:1,titles:0,wins:0,goals:5,kicks:5},{player_id:'d',name:'ד',cups:2,titles:0,wins:2,goals:9,kicks:10}];
  assert.deepEqual(rankKing(rows).map(r=>r.player_id),['b','a','c','d']);assert.deepEqual(rankKing(rows,'accuracy').map(r=>r.player_id),['b','d','a']);assert.ok(rankKing(rows,'accuracy').every(r=>r.kicks>=MIN_KICKS))});
test('the api sends the publishable key, treats a repeat as fine, and says when the table is missing',async()=>{const calls=[];const f=async(u,i)=>{calls.push([u,i]);return u.includes('king_board')?{ok:false,status:404}:{ok:false,status:409,json:async()=>null}};
  const api=kingApi({url:'https://x.supabase.co/',key:'sb_publishable_abc',fetchImpl:f});const s=await api.submit({cup_id:'C1'});assert.equal(s.ok,true);const b=await api.board();assert.equal(b.ok,false);assert.equal(b.setup,true);
  assert.equal(calls[0][0],'https://x.supabase.co/rest/v1/king_cups');assert.equal(calls[0][1].headers.apikey,'sb_publishable_abc');assert.ok(!calls[0][1].headers.Authorization);assert.equal((await kingApi({url:'https://x.supabase.co',key:'k',fetchImpl:async()=>{throw new Error('offline')}}).board()).ok,false)});

test('the row carries the picture, and a table without the column still gets the row',async()=>{const cup=createCup(roster(4),'s');const [a,b]=slotsOf(cup,0,0);applyResult(cup,{r:0,m:0,a,b,w:a,ga:4,gb:3,ka:5,kb:5,kind:'played'});
  const photo='data:image/jpeg;base64,/9j/4AAQSkZJRg==';assert.equal(rowFor(cup,'C1',a,photo).avatar,photo);assert.equal(rowFor(cup,'C1',a,'javascript:x').avatar,'');
  const bodies=[];const f=async(u,i)=>{bodies.push(JSON.parse(i.body));return bodies.length===1?{ok:false,status:400}:{ok:true,status:201}};
  const r=await kingApi({url:'https://x.supabase.co',key:'k',fetchImpl:f}).submit(rowFor(cup,'C1',a,photo));assert.equal(r.ok,true);assert.equal(bodies.length,2);assert.ok('avatar' in bodies[0]);assert.ok(!('avatar' in bodies[1]))});
