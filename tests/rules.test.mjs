import test from 'node:test';import assert from 'node:assert/strict';
import {resolveKick,keeperPlan,timingWindow,meterSpeed,meterPosition,powerOf,flightSeconds,frameOf,makeRng,aiKick,aiDive,shootoutWinner,makeCallBag,GOAL_CALLS,resultWord,DIRS,ZONE,zoneOf,dirFromPull,swayOf,GOAL} from '../src/core/rules.js';
import {createDuel,turnOf,recordKick,scoreOf,takerIndex,marksOf} from '../src/core/duel.js';

test('goal frame: 7.32 m wide, 2.44 m high; aiming outside really misses',()=>{
  assert.equal(GOAL.halfWidth*2,7.32);assert.equal(GOAL.height,2.44);assert.equal(GOAL.spot,11);
  assert.equal(frameOf(0,1),'in');assert.equal(frameOf(3.64,1),'post');assert.equal(frameOf(-3.9,1),'off');assert.equal(frameOf(0,2.42),'post');assert.equal(frameOf(0,2.7),'off');
  const r=resolveKick({aim:{x:4.6,y:1},meter:.73,shotSkill:96,keeperSkill:60,dive:'L',rng:makeRng(1)});assert.equal(r.how,'off');assert.equal(r.out,'miss')});

test('the white window: wider for a better finisher, narrower against a better keeper — one function for every mode',()=>{
  assert.ok(timingWindow(94,70).width>timingWindow(60,70).width);assert.ok(timingWindow(60,70).width>timingWindow(40,70).width);
  assert.ok(timingWindow(80,90).width<timingWindow(80,70).width);assert.ok(timingWindow(80,50).width>timingWindow(80,70).width);
  const w=timingWindow(35,99);assert.ok(w.width>=.02);assert.equal(w.center,.73);assert.ok(timingWindow(99,30).width<=.17);
  assert.ok(Math.abs(timingWindow(94,70).width-.12)<1e-9);                    // the source's starting numbers
  assert.ok(swayOf(92)<swayOf(60));assert.ok(swayOf(40)>swayOf(60))});

test('the match-up sets both the window and the marker speed: a star against a lower-league keeper has it easy, the reverse is hard',()=>{
  const star=timingWindow(96,58),even=timingWindow(75,75),minnow=timingWindow(60,93);
  assert.ok(star.width>even.width*1.4,'wide window for the star');assert.ok(minnow.width<even.width*.6,'narrow window for the minnow');
  assert.ok(star.speed<1&&minnow.speed>1);assert.equal(even.speed,1);assert.equal(meterSpeed(96,58),timingWindow(96,58).speed);assert.ok(meterSpeed(30,99)<=1.35&&meterSpeed(99,30)>=.72);
  assert.ok(meterPosition(300,star.speed)<meterPosition(300,1)&&meterPosition(300,1)<meterPosition(300,minnow.speed),'the marker really moves slower / faster');
  const ms=w=>{let t=0;for(let i=0;i<3000;i++){const m=meterPosition(i,w.speed);if(m>=w.from&&m<=w.to)t++;if(m>w.to)break}return t};
  assert.ok(ms(star)>ms(even)*1.6&&ms(even)>ms(minnow)*1.6,'time spent inside the window: '+[ms(star),ms(even),ms(minnow)])});

test('the meter curve and power: 30% ≈ 1.6 s in the air, 100% ≈ 0.48 s',()=>{
  assert.ok(Math.abs(meterPosition(0)-.08)<1e-9);assert.ok(meterPosition(400)>meterPosition(200));assert.ok(meterPosition(Math.PI/.0036)>.999);
  assert.equal(powerOf(.1),30);assert.equal(powerOf(1),100);assert.equal(powerOf(.73),73);
  assert.ok(Math.abs(flightSeconds(30)-1.6)<1e-9);assert.ok(Math.abs(flightSeconds(100)-.48)<1e-9);
  const soft=resolveKick({aim:{x:1,y:1},meter:.3,shotSkill:80,keeperSkill:70,dive:'C',rng:makeRng(5)}),hard=resolveKick({aim:{x:1,y:1},meter:1,shotSkill:80,keeperSkill:70,dive:'C',rng:makeRng(5)});
  assert.ok(soft.flight>hard.flight*3)});

test('same inputs and seed give the same kick; a different seed may not',()=>{
  const a={aim:{x:2.4,y:1.1},meter:.7,shotSkill:77,keeperSkill:72,dive:'R'};
  assert.deepEqual(resolveKick({...a,rng:makeRng('abc')}),resolveKick({...a,rng:makeRng('abc')}));
  const outs=new Set();for(let i=0;i<40;i++)outs.add(JSON.stringify(resolveKick({...a,rng:makeRng('s'+i)})));assert.ok(outs.size>5)});

test('outside the window the error grows steadily; it never turns every kick into a goal',()=>{
  const miss=m=>{let n=0;for(let i=0;i<4000;i++)if(resolveKick({aim:{x:2.9,y:.6},meter:m,shotSkill:80,keeperSkill:75,dive:aiDive(75,makeRng(i)),rng:makeRng('k'+i)}).out==='miss')n++;return n/4000};
  const inWin=miss(.73),bit=miss(.83),far=miss(1);assert.ok(inWin<bit,'a little over-hit misses more');assert.ok(bit<far,'a lot over-hit misses more still');assert.ok(far<.95&&far>.3);
  const e=m=>resolveKick({aim:{x:0,y:1},meter:m,shotSkill:80,keeperSkill:70,dive:'L',rng:makeRng(2)}).timing.error;assert.equal(e(.73),0);assert.ok(e(.9)>e(.8)&&e(.8)>0)});

test('the keeper commits once: a hard kick to the other side is a goal, he never crosses the goal',()=>{
  for(let i=0;i<500;i++){const r=resolveKick({aim:{x:2.8,y:.6},meter:.9,shotSkill:90,keeperSkill:99,dive:'L',rng:makeRng('x'+i)});
    assert.ok(r.keeper.z<=0,'he went left and stayed left');if(r.how!=='off'&&r.how!=='post'&&r.x>1.5)assert.equal(r.how,'goal')}
  const p=keeperPlan({dive:'L',x:3,y:1,power:95,keeperSkill:90});assert.equal(p.read,false);assert.equal(p.col,-1);assert.ok(p.z<0)});

test('a slow kick gives him time: he reads it on his feet and saves far more often',()=>{
  const p=keeperPlan({dive:'L',x:2.2,y:.4,power:35,keeperSkill:75});assert.equal(p.read,true);assert.equal(p.col,1);assert.ok(p.delay>=.4);
  const saves=m=>{let n=0;for(let i=0;i<3000;i++)if(resolveKick({aim:{x:2.2,y:.8},meter:m,shotSkill:75,keeperSkill:75,dive:'L',rng:makeRng('p'+i)}).how==='save')n++;return n/3000};
  assert.equal(saves(.74)<.02,true,'wrong side, firm kick: no save');assert.ok(saves(.32)>.3,'slow kick: read and often saved');
  let caughtSoft=0,caughtHard=0,sSoft=0,sHard=0;for(let i=0;i<6000;i++){const a=resolveKick({aim:{x:.3,y:1},meter:.4,shotSkill:70,keeperSkill:80,dive:'C',rng:makeRng('c'+i)}),b=resolveKick({aim:{x:.3,y:1},meter:.74,shotSkill:70,keeperSkill:80,dive:'C',rng:makeRng('c'+i)});
    if(a.how==='save'){sSoft++;if(a.catch)caughtSoft++}if(b.how==='save'){sHard++;if(b.catch)caughtHard++}}
  assert.ok(caughtSoft/sSoft>caughtHard/sHard,'a soft ball is held more often than a hard one')});

test('nine target areas all work: three sides by three heights',()=>{
  assert.equal(DIRS.length,9);for(const d of DIRS){const [x,y]=ZONE[d];assert.equal(zoneOf(x,y),d);
    let goals=0,saves=0;for(let i=0;i<600;i++){const open=resolveKick({aim:{x:x*1.1,y},meter:.73,shotSkill:85,keeperSkill:70,dive:d.includes('L')?'R':'L',rng:makeRng(d+i)});if(open.how==='goal')goals++;
      const right=resolveKick({aim:{x,y},meter:.73,shotSkill:85,keeperSkill:85,dive:d,rng:makeRng(d+'r'+i)});if(right.how==='save')saves++}
    assert.ok(goals>350,d+': scores when he goes the wrong way ('+goals+')');assert.ok(saves>60,d+': can be saved by the right dive ('+saves+')')}
  assert.equal(dirFromPull(40,0),'R');assert.equal(dirFromPull(-40,0),'L');assert.equal(dirFromPull(0,-40),'U');assert.equal(dirFromPull(30,30),'DR');assert.equal(dirFromPull(-30,-30),'UL');assert.equal(dirFromPull(5,5),null)});

test('a better keeper saves more, a better finisher scores more (computer against computer)',()=>{
  const rate=(sk,gk)=>{const r=makeRng(sk*100+gk);let g=0;for(let i=0;i<8000;i++){const k=aiKick(sk,r);if(resolveKick({aim:k.aim,meter:k.meter,shotSkill:sk,keeperSkill:gk,dive:aiDive(gk,r),rng:r}).how==='goal')g++}return g/8000};
  assert.ok(rate(75,95)<rate(75,50));assert.ok(rate(92,75)>rate(50,75));const mid=rate(75,75);assert.ok(mid>.6&&mid<.9,'a believable conversion rate: '+mid)});

test('shoot-out: five each, early finish, sudden death at equal kicks',()=>{
  assert.equal(shootoutWinner([1,1,1],[0,0,0]),'a');assert.equal(shootoutWinner([1,1,1],[0,0]),null);assert.equal(shootoutWinner([1,1,1,1,1],[1,1,1,1,1]),null);
  assert.equal(shootoutWinner([1,1,1,1,1,1],[1,1,1,1,1]),null);assert.equal(shootoutWinner([1,1,1,1,1,1],[1,1,1,1,1,0]),'a');assert.equal(shootoutWinner([0,0,0,0],[1,1,1]),'b');
  const d=createDuel('b');assert.equal(turnOf(d).side,'b');assert.equal(recordKick(d,0,'goal'),true);assert.equal(turnOf(d).side,'a');
  assert.equal(recordKick(d,0,'goal'),false,'the same kick again is ignored');assert.equal(recordKick(d,5,'goal'),false,'a kick from the future is ignored');assert.deepEqual(scoreOf(d),{a:0,b:1});
  const outs=['miss','goal','miss','goal','miss','goal','miss','goal'];let k=1;for(const o of outs)if(!d.winner)recordKick(d,k++,o);
  assert.equal(d.winner,'b');assert.equal(recordKick(d,k,'goal'),false,'nothing is recorded after the end');
  const s=createDuel('a');for(let i=0;i<10;i++)recordKick(s,i,'goal');assert.equal(s.winner,null);assert.equal(turnOf(s).sudden,true);recordKick(s,10,'goal');assert.equal(s.winner,null,'the other side still has its kick');recordKick(s,11,'miss');assert.equal(s.winner,'a');
  assert.equal(takerIndex(11,0),0);assert.equal(takerIndex(11,11),0);assert.equal(takerIndex(11,12),1);assert.deepEqual(marksOf(createDuel(),'a'),[null,null,null,null,null])});

test('goal calls: all ten before any repeat; the word depends on which side I am',()=>{
  const bag=makeCallBag(makeRng(3));const first=new Set();for(let i=0;i<10;i++)first.add(bag());assert.equal(first.size,10);assert.deepEqual([...first].sort(),GOAL_CALLS.slice().sort());
  assert.equal(resultWord('goal',true,false,()=>'GOAL!').good,true);assert.equal(resultWord('goal',false,false,bag).good,false);assert.equal(resultWord('save',false,true,bag).good,true);assert.equal(resultWord('save',true,false,bag).good,false);assert.equal(resultWord('off',false,false,bag).good,true)});
