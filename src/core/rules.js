// The rules of one penalty kick and of a shoot-out. Pure functions: no DOM, no clock, no Math.random.
// Every mode (computer, network, me kicking, me in goal) resolves a kick through resolveKick() with the same numbers,
// and the picture only draws what this module decided.
//
// Goal coordinates: x metres from the middle of the goal, positive = right as the taker sees it; y metres above the grass.
export const RULES_VERSION=11;
export const GOAL={halfWidth:3.66,height:2.44,spot:11};
export const METER_CENTER=.73;
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

/* ---- deterministic random numbers ---- */
export function hash32(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
/** rng from a seed: a 32-bit number, or a string (e.g. a hex digest shared by two phones). */
export function makeRng(seed){let a,b,c,d;if(typeof seed==='string'){a=hash32(seed+'a');b=hash32(seed+'b');c=hash32(seed+'c');d=hash32(seed+'d')}else{a=seed>>>0;b=0x9e3779b9;c=0x243f6a88;d=0xb7e15162}
  const next=()=>{a|=0;b|=0;c|=0;d|=0;const t=(a+b|0)+d|0;d=d+1|0;a=b^b>>>9;b=c+(c<<3)|0;c=c<<21|c>>>11;c=c+t|0;return(t>>>0)/4294967296};
  for(let i=0;i<12;i++)next();return next}
export const gauss=rng=>(rng()+rng()+rng()+rng()-2)*1.732;   // close to a unit normal, bounded, cheap, identical everywhere

/* ---- the timing meter: one bar is both accuracy and power ---- */
/**
 * How fast the marker travels, from the match-up: a strong finisher against a weak keeper gets a slower marker (easier
 * to stop in the window), a weak finisher against a strong keeper a faster one. 1 = evenly matched.
 */
export const meterSpeed=(shotSkill,keeperSkill=70)=>+clamp(1-(shotSkill-keeperSkill)*.008,.72,1.35).toFixed(3);
/** Where the marker is after holding for `ms`: rises from 0.08 to 1 and falls back, the source game's curve, at `speed`. */
export const meterPosition=(ms,speed=1)=>.08+.92*(1-Math.cos(Math.max(0,ms)*.0036*speed))*.5;
/**
 * The white window, from the same match-up and in every mode: wider for a better finisher and against a weaker keeper,
 * narrower for a weak finisher and against a strong keeper.
 */
export function timingWindow(shotSkill,keeperSkill=70){const f=clamp((shotSkill-35)/59,0,1);
  const width=clamp(.03+.09*f-(keeperSkill-70)*.0013,.02,.17);return {center:METER_CENTER,width,from:METER_CENTER-width/2,to:METER_CENTER+width/2,speed:meterSpeed(shotSkill,keeperSkill)}}
export const powerOf=meter=>Math.round(clamp(meter*100,30,100));
export const flightSeconds=power=>48/clamp(power,30,100);   // 30% ≈ 1.60 s, 100% ≈ 0.48 s
/** How far the sight sways around the finger, in metres: little for a finisher, a lot for a defender or a keeper. */
export const swayOf=shotSkill=>+clamp(.66-(shotSkill-55)*.0115,.16,.78).toFixed(3);
export function swayAt(seconds,amp){return {dx:Math.sin(seconds*5.3)*amp+Math.sin(seconds*9.1+1)*amp*.35,dy:Math.sin(seconds*4.1+.7)*amp*.55}}

/* ---- the frame of the goal ---- */
export function frameOf(x,y){const ax=Math.abs(x);if(ax>GOAL.halfWidth+.09||y>GOAL.height+.09)return 'off';if(ax>GOAL.halfWidth-.05||y>GOAL.height-.05)return 'post';return 'in'}

/* ---- directions: three columns by three heights. 'C' is standing in the middle. ---- */
export const DIRS=['UL','U','UR','L','C','R','DL','D','DR'];
export const dirCol=d=>d.includes('L')?-1:d.includes('R')?1:0;
export const dirRow=d=>d[0]==='U'?2:d[0]==='D'?0:1;
export const ZONE={UL:[-2.6,1.95],U:[0,1.95],UR:[2.6,1.95],L:[-2.6,1.2],C:[0,1.2],R:[2.6,1.2],DL:[-2.6,.45],D:[0,.45],DR:[2.6,.45]};
export function zoneOf(x,y){const col=x<-.9?'L':x>.9?'R':'';const row=y>1.6?'U':y<.82?'D':'';return (row+col)||'C'}
/** A pull of the finger (screen pixels, y down) to a direction; shorter than `min` is no choice. */
export function dirFromPull(dx,dy,min=26){if(Math.hypot(dx,dy)<min)return null;const a=(Math.atan2(-dy,dx)*180/Math.PI+360)%360;return ['R','UR','U','UL','L','DL','D','DR'][Math.round(a/45)%8]}
const HAND_Y=[.35,1.15,1.95];

/**
 * What the keeper does with a ball going to (x,y) at `power` when he chose `dive`. No randomness.
 * A hard ball leaves no time: he goes where he chose. A slow ball (a second or more in the air) can be read while he is
 * still on his feet, so he sets off late toward the ball. Either way he commits once and never changes side in the air.
 */
export function keeperPlan({dive,x,y,power,keeperSkill}){const p=clamp(power,30,100),s=clamp(keeperSkill,1,100)/100,soft=(100-p)/70,T=flightSeconds(p);
  const read=T>=1;let col=dirCol(dive||'C'),row=dirRow(dive||'C');
  if(read){col=Math.abs(x)<.9?0:Math.sign(x);row=y>1.6?2:y<.82?0:1}
  const delay=read?.40:.30-.13*s;const air=Math.max(0,T-delay);
  const z=col*Math.min(read?Math.min(2.75,Math.abs(x)):2.55,air*(4.6+s));
  const dir=(row===2?'U':row===0?'D':'')+(col<0?'L':col>0?'R':'')||'C';
  return {dir,col,row,z,handY:HAND_Y[row],delay,air,read,flight:T,reach:.62+.20*soft+.18*s,vReach:(col?.95:1.05)+.25*s+.25*soft,soft,skill:s}}

/**
 * One kick, start to finish.
 *   aim        where the sight was at release (metres)
 *   meter      0..1, where the marker was at release (also the power)
 *   dive       the keeper's choice, one of DIRS
 *   rng        seeded generator; two phones with the same seed get the same kick
 * Returns where the ball really goes and how it ends: how = 'goal' | 'save' | 'post' | 'off'.
 */
export function resolveKick({aim,meter,shotSkill,keeperSkill,dive,rng}){
  const win=timingWindow(shotSkill,keeperSkill),sway=swayOf(shotSkill),power=powerOf(meter);
  const error=Math.max(0,Math.abs(meter-win.center)-win.width/2);     // 0 inside the white window, grows steadily outside
  const wild=Math.min(1.8,error*9);                                    // mistimed: the further from the window, the wilder
  let x=aim.x+gauss(rng)*(sway*.30+wild);
  let y=aim.y+gauss(rng)*(sway*.24+wild*.62)+(meter>win.to?Math.min(1.5,error*6):0);   // over-hit balls rise
  x=+clamp(x,-6,6).toFixed(2);y=+clamp(y,.11,4).toFixed(2);
  const base={x,y,power,flight:+flightSeconds(power).toFixed(3),timing:{error:+error.toFixed(4),inWindow:error===0}};
  const k=keeperPlan({dive,x,y,power,keeperSkill});const keeper={dir:k.dir,z:+k.z.toFixed(2),row:k.row,delay:+k.delay.toFixed(3),read:k.read};
  const frame=frameOf(x,y),rollSave=rng(),rollCatch=rng();          // always drawn, so the stream stays aligned
  if(frame!=='in')return {...base,how:frame,out:'miss',catch:false,keeper};
  const dist=Math.abs(x-k.z),up=Math.abs(y-k.handY),reachable=dist<=k.reach&&up<=k.vReach;
  const pSave=reachable?clamp((.74+.24*k.soft)*(.62+.38*k.skill)*(1-.30*dist/k.reach)*(1-.45*up/k.vReach)-(shotSkill-70)*.003,.02,.97):0;
  if(rollSave<pSave){const caught=rollCatch<(.12+.72*k.soft)*(.65+.35*k.skill)*(1-.65*Math.min(1,dist/k.reach))*(y>1.7?.65:1);
    return {...base,how:'save',out:'miss',catch:caught,keeper}}
  return {...base,how:'goal',out:'goal',catch:false,keeper}}

/* ---- the computer ---- */
/** The computer's kick: an area by lot (corners more often for a better finisher), a spot in it, a release near the window. */
export function aiKick(shotSkill,rng){const q=clamp((shotSkill-50)/45,0,1);
  const w=[['UL',.10+.09*q],['UR',.10+.09*q],['L',.11],['R',.11],['DL',.19],['DR',.19],['U',.04],['C',.04],['D',.08-.04*q]];
  let r=rng()*w.reduce((t,e)=>t+e[1],0),zone='DL';for(const [k,v] of w){r-=v;if(r<=0){zone=k;break}}
  const c=ZONE[zone];const wide=dirCol(zone)*(.25+.35*q);          // good finishers go nearer the post
  return {zone,aim:{x:+(c[0]+wide+gauss(rng)*(.34-.14*q)).toFixed(2),y:+clamp(c[1]+gauss(rng)*(.24-.08*q),.2,2.5).toFixed(2)},meter:+clamp(METER_CENTER+gauss(rng)*(.075-.045*q),.3,1).toFixed(3)}}
/** The computer's dive, chosen before the kick: it cannot see the ball. */
export function aiDive(keeperSkill,rng){const r=rng(),col=r<.41?'L':r<.82?'R':'';const h=rng();const row=col?(h<.42?'D':h<.78?'':'U'):(h<.2?'U':h<.4?'D':'');return (row+col)||'C'}

/* ---- the shoot-out ---- */
/** 'a' | 'b' | null. Five each, over early when one side cannot catch up, then sudden death at equal kicks. */
export function shootoutWinner(a,b){const na=a.length,nb=b.length,sa=a.reduce((t,v)=>t+v,0),sb=b.reduce((t,v)=>t+v,0);
  if(na<=5&&nb<=5){if(sa>sb+(5-nb))return 'a';if(sb>sa+(5-na))return 'b';return null}
  return na===nb&&sa!==sb?(sa>sb?'a':'b'):null}

export const GOAL_CALLS=['הרשת רועדת','גוללללללל!','והכדור ברשת!','GOAL!','שערררר!!!!','זה בפנים!','יש שער!','איזה גול!','היציע באוויר!','תוציאו מהאמצע!'];
/** A bag of the ten calls: none repeats until all ten were used. `random` is injectable for tests. */
export function makeCallBag(random=Math.random){let bag=[];return()=>{if(!bag.length)bag=GOAL_CALLS.slice();return bag.splice(Math.floor(random()*bag.length),1)[0]}}
/** The word on the screen, from where I stand: a goal against me is not a celebration. */
export function resultWord(how,iAmKicker,caught,call){
  if(iAmKicker)return {good:how==='goal',text:how==='goal'?call():how==='save'?(caught?'השוער תפס':'נהדף'):how==='post'?'קורה!':'החוצה'};
  return {good:how!=='goal',text:how==='goal'?'ספגת שער':how==='save'?(caught?'תפסת!':'הצלה!'):how==='post'?'קורה!':'החוצה!'}}
