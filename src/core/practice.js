// Practice: ten kicks at a marked spot on the goal, with the keeper standing in the middle. The score is how close the ball came
// to the spot (in the goal plane, metres), whatever the keeper did, so what is trained is the aim and the timing.
import {GOAL,makeRng} from './rules.js';
export const SESSION=10;
/** the spots, in goal coordinates (x to the right of the taker, y up). The four corners are the classic ones; the two mid-sides are easier. */
export const TARGETS=[
  {id:'UL',x:-2.95,y:1.95,name:'פינה שמאלית עליונה'},{id:'UR',x:2.95,y:1.95,name:'פינה ימנית עליונה'},
  {id:'DL',x:-2.95,y:.5,name:'פינה שמאלית תחתונה'},{id:'DR',x:2.95,y:.5,name:'פינה ימנית תחתונה'},
  {id:'L',x:-3.0,y:1.2,name:'צד שמאל באמצע'},{id:'R',x:3.0,y:1.2,name:'צד ימין באמצע'}];
/** the keeper stands still in the middle, the way a keeper does before he reads the ball */
export const KEEPER_STAYS={x:0,y:1.1};
const RINGS=[{id:'bull',max:.4,points:3,text:'בול!'},{id:'close',max:.9,points:2,text:'קרוב'},{id:'near',max:1.6,points:1,text:'באזור'},{id:'far',max:Infinity,points:0,text:'רחוק'}];
export const MAX_POINTS=SESSION*3;
/** how the ball landed against the spot: distance in metres (and centimetres), the ring it fell in, and the points */
export function scoreKick(target,r){const d=Math.hypot((+r.x||0)-target.x,(+r.y||0)-target.y);const ring=RINGS.find(g=>d<=g.max);
  return {d:+d.toFixed(2),cm:Math.round(d*100),grade:ring.id,points:ring.points,text:ring.text,inFrame:Math.abs(r.x)<=GOAL.halfWidth&&r.y<=GOAL.height}}
/** n spots in a row, never the same twice running, from a seed */
export function pickTargets(seed,n=SESSION){const rng=makeRng(String(seed)),out=[];let last=-1;for(let i=0;i<n;i++){let k;do{k=Math.floor(rng()*TARGETS.length)}while(k===last);out.push(TARGETS[k]);last=k}return out}
/** a session: points of 30, the share of the best possible, the bulls, and the number of good kicks (a close one or better) */
export function summarize(scores){const points=scores.reduce((t,s)=>t+s.points,0),bulls=scores.filter(s=>s.grade==='bull').length,good=scores.filter(s=>s.points>=2).length;
  return {kicks:scores.length,points,bulls,good,accuracy:scores.length?Math.round(100*points/(scores.length*3)):0,avgCm:scores.length?Math.round(scores.reduce((t,s)=>t+s.cm,0)/scores.length):0}}
export const verdict=acc=>acc>=80?'צלף':acc>=60?'מדויק':acc>=40?'בדרך הנכונה':'ממשיכים להתאמן';
