import test from 'node:test';import assert from 'node:assert/strict';
import {SESSION,TARGETS,KEEPER_STAYS,MAX_POINTS,scoreKick,pickTargets,summarize,verdict} from '../src/core/practice.js';
import {emptyStats,parseStats,recordPractice,recordKick} from '../src/core/stats.js';
import {medalsOf,freshMedals} from '../src/core/rewards.js';
import {GOAL,keeperPlan,resolveKick,makeRng} from '../src/core/rules.js';

test('every spot is inside the goal and away from the posts, and the session is ten kicks',()=>{
  assert.equal(SESSION,10);assert.equal(MAX_POINTS,30);assert.equal(new Set(TARGETS.map(t=>t.id)).size,TARGETS.length);
  for(const t of TARGETS){assert.ok(Math.abs(t.x)<GOAL.halfWidth-.5&&t.y>.3&&t.y<GOAL.height-.3,t.id);assert.ok(t.name.length>3)}});
test('the ring the ball fell in gives the points: bull 3, close 2, near 1, far 0, and the distance is in centimetres',()=>{
  const t={x:0,y:1};const at=(dx,dy=0)=>scoreKick(t,{x:dx,y:1+dy});
  assert.deepEqual([at(0),at(.39),at(.41),at(.9),at(.91),at(1.6),at(1.61)].map(s=>s.points),[3,3,2,2,1,1,0]);
  assert.equal(at(.25).cm,25);assert.equal(at(.25,.25).cm,35);assert.equal(at(3).grade,'far');
  assert.equal(scoreKick(t,{x:4,y:5}).inFrame,false);assert.equal(scoreKick(t,{x:0,y:1}).inFrame,true)});
test('the spots come from a seed, never the same twice in a row, and differ between seeds',()=>{
  const a=pickTargets('x'),b=pickTargets('x'),c=pickTargets('y');assert.deepEqual(a,b);assert.equal(a.length,10);assert.notDeepEqual(a.map(t=>t.id),c.map(t=>t.id));
  for(let i=1;i<a.length;i++)assert.notEqual(a[i].id,a[i-1].id);for(const s of ['1','2','3','4','5','6','7','8'])pickTargets(s).forEach((t,i,arr)=>{if(i)assert.notEqual(t.id,arr[i-1].id)})});
test('a session adds up: points, bulls, good kicks, accuracy and the average distance',()=>{
  const t={x:0,y:1};const s=[0,0,.5,1.2,3].map(d=>scoreKick(t,{x:d,y:1}));const r=summarize(s);
  assert.deepEqual(r,{kicks:5,points:3+3+2+1+0,bulls:2,good:3,accuracy:60,avgCm:Math.round((0+0+50+120+300)/5)});
  assert.deepEqual(summarize([]),{kicks:0,points:0,bulls:0,good:0,accuracy:0,avgCm:0});assert.deepEqual([90,70,50,10].map(verdict),['צלף','מדויק','בדרך הנכונה','ממשיכים להתאמן'])});
test('practice numbers are kept apart from the career: they never add goals or break a goal run, and a record is told once',()=>{
  const st=emptyStats();recordKick(st,{iKick:true,how:'goal'});recordKick(st,{iKick:true,how:'goal'});
  assert.equal(recordPractice(st,{kicks:10,points:18,bulls:3}),true);assert.equal(st.goals,2);assert.equal(st.goalRun,2);assert.equal(st.shots,2);
  assert.deepEqual([st.pracRuns,st.pracKicks,st.pracPoints,st.pracBulls,st.pracBest,st.pracBestBulls],[1,10,18,3,18,3]);
  assert.equal(recordPractice(st,{kicks:10,points:12,bulls:6}),false,'not a record');assert.deepEqual([st.pracBest,st.pracBestBulls,st.pracKicks],[18,6,20]);
  const back=parseStats(JSON.stringify(st));assert.equal(back.pracBest,18);assert.equal(parseStats('{"pracBest":-4,"pracKicks":"x"}').pracBest,0)});
test('five bulls in one session earn the sharpshooter medal',()=>{
  const st=emptyStats();recordPractice(st,{kicks:10,points:20,bulls:4});assert.equal(medalsOf(st).find(m=>m.id==='sniper').done,false);
  recordPractice(st,{kicks:10,points:27,bulls:5});const m=medalsOf(st).find(x=>x.id==='sniper');assert.ok(m.done);assert.deepEqual(freshMedals(st,[]).map(x=>x.id),['sniper'])});
test('the keeper who stays in the middle cannot reach a ball in a corner of a full-power kick, and stays where he is',()=>{
  const plan=keeperPlan({dive:KEEPER_STAYS,x:-2.95,y:1.95,power:85,keeperSkill:30});assert.ok(Math.abs(plan.z)<.5,'stays near the middle: '+plan.z);
  let saves=0;for(let i=0;i<300;i++){const r=resolveKick({aim:{x:-2.95,y:1.95},meter:.62,shotSkill:80,keeperSkill:30,dive:KEEPER_STAYS,rng:makeRng('p'+i)});if(r.how==='save')saves++}assert.ok(saves<=3,'saves in the corner: '+saves)});
