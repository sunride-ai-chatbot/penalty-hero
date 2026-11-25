import {resolveKick,aiKick,aiDive,makeRng,timingWindow,ZONE,DIRS} from '../src/core/rules.js';
const rng=makeRng(12345);
for(const [sk,gk] of [[92,88],[80,75],[70,70],[60,65],[45,60]]){const c={goal:0,save:0,post:0,off:0,catch:0};const N=20000;
  for(let i=0;i<N;i++){const k=aiKick(sk,rng);const r=resolveKick({aim:k.aim,meter:k.meter,shotSkill:sk,keeperSkill:gk,dive:aiDive(gk,rng),rng});c[r.how]++;if(r.catch)c.catch++}
  console.log('AI',sk,'v',gk,Object.entries(c).map(([k,v])=>k+' '+(v/N*100).toFixed(1)+'%').join(' '),'window',timingWindow(sk,gk).width.toFixed(3))}
// perfect human: aim at each zone, perfect meter, vs AI keeper and vs the right guess
for(const z of DIRS){let g=0,gr=0;const N=5000;for(let i=0;i<N;i++){const [x,y]=ZONE[z];const aim={x:x*1.15,y};
  if(resolveKick({aim,meter:.73,shotSkill:80,keeperSkill:75,dive:aiDive(75,rng),rng}).how==='goal')g++;
  if(resolveKick({aim,meter:.73,shotSkill:80,keeperSkill:75,dive:z,rng}).how==='goal')gr++}console.log('zone',z,'goal vs AI',(g/N*100).toFixed(0)+'%','vs right guess',(gr/N*100).toFixed(0)+'%')}
for(const m of [.3,.5,.73,.85,1]){let g=0;const N=5000;for(let i=0;i<N;i++)if(resolveKick({aim:{x:2.9,y:.5},meter:m,shotSkill:80,keeperSkill:75,dive:aiDive(75,rng),rng}).how==='goal')g++;console.log('meter',m,'corner low goal',(g/N*100).toFixed(0)+'%')}
