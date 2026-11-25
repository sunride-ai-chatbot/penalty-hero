// The solo modes: survival (kick until the first miss, the keeper gets better with every goal) and the daily challenge (five
// kicks against the same keeper and the same dice for everybody that day). Always me kicking, the computer in goal; every kick
// goes through the same resolveKick() as the duel.
import {resolveKick,aiDive,makeRng,resultWord,makeCallBag,clamp,leftFooted,moodOf} from '../core/rules.js';
import {kitsFor,shirtName} from '../data/catalog.js';
const sleep=(ms,signal)=>new Promise((res,rej)=>{if(signal?.aborted)return rej(Object.assign(new Error('aborted'),{name:'AbortError'}));const t=setTimeout(()=>{signal?.removeEventListener('abort',stop);res()},ms);const stop=()=>{clearTimeout(t);rej(Object.assign(new Error('aborted'),{name:'AbortError'}))};signal?.addEventListener('abort',stop,{once:true})});
const aborted=()=>Object.assign(new Error('aborted'),{name:'AbortError'});
const callBag=makeCallBag();

/** One kick of mine against the computer's keeper. Returns the resolved kick. `seed` and `diveRng` make it repeatable (the daily). */
export async function soloKick({arena,audio,hud,T,G,taker,keeper,n,seed,diveRng,pressure=0,signal,timeKick=10000,fake}){
  const kits=kitsFor(T,G);hud.turn({turn:{k:n,side:'a',keeperSide:'b',index:n,sudden:false},taker,keeper,iKick:true,duel:fake,takerSide:T,keeperSide:G});
  const ok=await arena.scene({...kits,name:shirtName(taker),number:taker.no,gkNumber:keeper.no,pid:taker.id,left:leftFooted(taker.id),mood:moodOf(T.club.id)});
  if(signal?.aborted)throw aborted();if(!ok)throw new Error('התמונה לא נטענה');
  arena.info({taker:`${taker.he} #${taker.no} (${taker.shot})`,dive:'',how:''});arena.pressure(pressure);audio?.whistle();
  arena.role({iKick:true,keeperTag:`בשער: ${keeper.he}`});arena.hint('החזק, כוון ושחרר באזור הלבן');
  const c=await arena.askKick({shotSkill:taker.shot,keeperSkill:keeper.keep,pressure,timeMs:timeKick,signal});
  if(signal?.aborted)throw aborted();
  const result=resolveKick({aim:c.aim,meter:c.meter,shotSkill:taker.shot,keeperSkill:keeper.keep,dive:aiDive(keeper.keep,diveRng),curl:c.curl||0,rng:makeRng(String(seed))});
  arena.hint('');arena.roleOff();arena.pressure(0);arena.info({dive:result.keeper.dir,how:`${result.how} x${result.x} y${result.y} p${result.power}`});
  let told=false;const settle=()=>{if(told)return;told=true;const word=resultWord(result.how,true,result.catch,callBag);arena.flash(word.text,word.good);arena.cheer(word.good?1:.3);
    if(result.how==='goal')audio?.goal(true);else if(result.how==='save')audio?.save(result.catch);else if(result.how==='post')audio?.post();else audio?.miss();
    try{navigator.vibrate&&navigator.vibrate(word.good?[18,40,18]:28)}catch(e){}};
  await arena.play(result,{onContact:()=>audio?.kick(result.power),onResult:settle,signal});settle();return result}

/** Survival: no limit and one life. After every goal the keeper is two points better (up to 99); from the sixth goal on the marker runs faster. */
export async function runSurvival({arena,audio,sides,hud,signal,best=0}){
  const A=sides.a,B=sides.b,seedBase='sv:'+Math.floor(Math.random()*2**32).toString(16),diveRng=makeRng(seedBase+':d'),marks=[];let n=0;
  hud.solo({marks,best,label:'רצף'});
  for(;;){const taker=A.order[n%A.order.length],keeper={...B.keeper,keep:clamp(Math.round(B.keeper.keep*.85+4+n*2),40,99)};
    const r=await soloKick({arena,audio,hud,T:A,G:B,taker,keeper,n,seed:seedBase+':'+n,diveRng,pressure:n>=5?1:0,signal,fake:{kicks:{a:[],b:[]},log:[],winner:null,first:'a'}});
    hud.last&&hud.last({turn:{k:n},result:r,iKick:true});
    marks.push(r.out==='goal'?1:0);hud.solo({marks,best:Math.max(best,marks.filter(Boolean).length),label:'רצף'});n++;
    await sleep(r.out==='goal'?650:900,signal);if(r.out!=='goal')break}
  return {goals:marks.filter(Boolean).length,marks}}

/** Daily: five kicks, the keeper and the dice fixed by the date. Returns {goals, marks}. */
export async function runDaily({arena,audio,sides,hud,signal,key}){
  const A=sides.a,B=sides.b,diveRng=makeRng('daily:'+key+':d'),marks=[];hud.solo({marks,best:0,label:'אתגר יומי',total:5});
  for(let n=0;n<5;n++){const taker=A.order[n%A.order.length],keeper=B.keeper;
    const r=await soloKick({arena,audio,hud,T:A,G:B,taker,keeper,n,seed:'daily:'+key+':'+n,diveRng,pressure:n===4?1:0,signal,fake:{kicks:{a:[],b:[]},log:[],winner:null,first:'a'}});
    hud.last&&hud.last({turn:{k:n},result:r,iKick:true});
    marks.push(r.out==='goal'?1:0);hud.solo({marks,best:0,label:'אתגר יומי',total:5});await sleep(n===4?500:800,signal)}
  return {goals:marks.reduce((t,v)=>t+v,0),marks}}
