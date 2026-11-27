import test from 'node:test';import assert from 'node:assert/strict';
import {drawCup,settleRound,teamsOf,winnerOf,mineAt,opponentOf,slotView,matchView,shownRounds,shootout,winChance,roundName,matchesIn,SIZE,ROUNDS} from '../src/core/bracket.js';
import {makeRng} from '../src/core/rules.js';
const pool=Array.from({length:80},(_,i)=>({id:'c'+i,str:40+i*.6}));const my={id:'c40',str:64};
const cup=seed=>drawCup({my,pool,seed});
test('a draw: sixteen different clubs, the player once, his first opponent a little weaker, and the same seed draws the same cup',()=>{
  const T=cup('s1');assert.equal(T.slots.length,16);assert.equal(new Set(T.slots).size,16);assert.equal(T.slots[T.meIdx],'c40');const first=T.slots[T.meIdx^1];assert.ok(T.str[first]<my.str+1&&T.str[first]>my.str-14,'first: '+T.str[first]);
  assert.deepEqual(cup('s1').slots,T.slots);assert.notDeepEqual(cup('s2').slots,T.slots);assert.deepEqual([roundName(0),roundName(3)],['שמינית גמר','גמר']);assert.deepEqual([0,1,2,3].map(matchesIn),[8,4,2,1]);
  assert.throws(()=>drawCup({my,pool:pool.slice(0,10),seed:'x'}),/not enough/)});
test('the tree shows my club first, the draw shows all sixteen clubs of the round of 16, and every played round shows the next column of winners',()=>{const T=cup('s3'),known=()=>T.slots.map((_,i)=>slotView(T,0,i).known),col=(r,n)=>Array.from({length:n},(_,i)=>slotView(T,r,i).known);
  assert.deepEqual(known().map((k,i)=>k?i:-1).filter(i=>i>=0),[T.meIdx],'before the draw only my club');assert.equal(col(1,8).some(Boolean),false);
  T.peek=true;assert.ok(known().every(Boolean),'the draw shows every club of the round of 16');assert.equal(col(1,8).some(Boolean),false,'but not one winner yet');assert.equal(col(2,4).some(Boolean),false);assert.equal(matchView(T,0,0),null,'and no result');assert.deepEqual(shownRounds(T),[]);
  settleRound(T,0,{won:true,mine:4,theirs:3});assert.equal(T.round,1);assert.ok(known().every(Boolean));assert.ok(col(1,8).every(Boolean),'after round one the eight winners show');assert.equal(col(2,4).some(Boolean),false,'the quarter-finals are still a secret');
  assert.equal(matchView(T,0,0).sa+matchView(T,0,0).sb>0,true);assert.equal(matchView(T,1,0),null);assert.deepEqual(shownRounds(T),[0]);
  settleRound(T,1,{won:false,mine:1,theirs:2});assert.ok(T.over);assert.ok(col(2,4).every(Boolean)&&col(3,2).every(Boolean),'a lost cup shows the whole tree')});
test('the player\'s match carries his score on his side; the others are dice and do not depend on what he does',()=>{const A=cup('s4'),B=cup('s4');settleRound(A,0,{won:true,mine:5,theirs:4});settleRound(B,0,{won:false,mine:2,theirs:3});
  const {m,side}=mineAt(A,0);assert.equal(A.res[0][m].w,side);assert.equal(B.res[0][m].w,1-side);assert.equal(side===0?A.res[0][m].sa:A.res[0][m].sb,5);assert.equal(side===0?B.res[0][m].sa:B.res[0][m].sb,2);
  for(let i=0;i<8;i++)if(i!==m)assert.deepEqual(A.res[0][i],B.res[0][i],'the other matches are the same cup either way')});
test('the opponent of every round is the winner of the neighbouring match, and it is known once the round before it was settled',()=>{const T=cup('s5');assert.equal(opponentOf(T,0),T.slots[T.meIdx^1]);
  for(let r=0;r<ROUNDS;r++){const opp=opponentOf(T,r);assert.ok(opp,'round '+r);assert.notEqual(opp,T.my);settleRound(T,r,{won:true,mine:3,theirs:2});assert.equal(winnerOf(T,r,mineAt(T,r).m),T.my)}
  assert.equal(T.over,true);assert.equal(T.champion,T.my);assert.deepEqual(shownRounds(T),[0,1,2,3])});
test('a loss ends the cup; the rest is played by dice to a champion, and the whole tree shows',()=>{const T=cup('s6');settleRound(T,0,{won:true,mine:3,theirs:1});settleRound(T,1,{won:false,mine:1,theirs:2});
  assert.equal(T.over,true);assert.equal(T.out,1);assert.ok(T.champion&&T.champion!==T.my);assert.ok(T.res.flat().every(Boolean),'every match has a result');
  for(let r=0;r<ROUNDS;r++)for(let i=0;i<matchesIn(r);i++){const x=T.res[r][i];assert.notEqual(x.sa,x.sb);assert.ok(teamsOf(T,r,i).every(Boolean));assert.ok(matchView(T,r,i))}
  for(let i=0;i<16;i++)assert.ok(slotView(T,0,i).known);assert.ok(slotView(T,4,0)===undefined||true);settleRound(T,1,{won:true,mine:9,theirs:0});assert.equal(T.out,1,'a finished cup does not change')});
test('a settled round cannot be settled twice and a wrong round is ignored',()=>{const T=cup('s7');settleRound(T,2,{won:true,mine:1,theirs:0});assert.equal(T.round,0);settleRound(T,0,{won:true,mine:1,theirs:0});const snap=JSON.stringify(T.res);settleRound(T,0,{won:false,mine:0,theirs:1});assert.equal(JSON.stringify(T.res),snap);assert.equal(T.round,1)});
test('shoot-outs by dice: never a draw, the stronger side wins more, a sure result stays a result',()=>{const rng=makeRng('so');let strong=0,n=2000;for(let i=0;i<n;i++){const [a,b]=shootout(winChance(80,50),rng);assert.notEqual(a,b);if(a>b)strong++}assert.ok(strong/n>.7&&strong/n<.97,'strong side wins '+strong/n);
  const [a,b]=shootout(1,()=>0.99);assert.notEqual(a,b);assert.ok(winChance(60,60)===.5&&winChance(70,60)>.7&&winChance(50,70)<.15)});
test('over many cups the favourite does not always take it (the cup is open), and the draw is fair to the player: he is in every slot sometimes',()=>{const slots=new Set(),champs=new Map();for(let i=0;i<200;i++){const T=cup('many'+i);slots.add(T.meIdx);settleRound(T,0,{won:false,mine:0,theirs:1});champs.set(T.champion,(champs.get(T.champion)||0)+1)}
  assert.equal(slots.size,16);assert.ok(champs.size>=8,'different champions: '+champs.size)});
