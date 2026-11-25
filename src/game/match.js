// One shoot-out, start to finish, in any mode. The only difference between the modes is where the other side's
// choice and the random seed come from: the computer (aiKick/aiDive + a local seed) or the other phone (commit–reveal).
// The kick itself always goes through resolveKick(), and the picture only draws its result.
import {resolveKick,aiKick,aiDive,makeRng,resultWord,makeCallBag} from '../core/rules.js';
import {createDuel,turnOf,recordKick,scoreOf,takerIndex} from '../core/duel.js';
import {kitsFor,shirtName} from '../data/catalog.js';
const sleep=(ms,signal)=>new Promise((res,rej)=>{if(signal?.aborted)return rej(Object.assign(new Error('aborted'),{name:'AbortError'}));const t=setTimeout(()=>{signal?.removeEventListener('abort',stop);res()},ms);const stop=()=>{clearTimeout(t);rej(Object.assign(new Error('aborted'),{name:'AbortError'}))};signal?.addEventListener('abort',stop,{once:true})});
const callBag=makeCallBag();   // one bag for the whole visit: ten different goal calls before any repeats

/**
 * sides     {a, b} from buildSide()
 * me        'a' | 'b' — the side this phone plays
 * first     who kicks first
 * net       null against the computer, else {exchange(k, choice, iKick)}
 * hud       {turn(info), marks(duel), wait(text)}
 * Resolves {winner, score, won}. Rejects with AbortError when left, or with the network's message.
 */
export async function runDuel({arena,audio,sides,me,first,net=null,hud,signal,timeKick=10000,timeDive=net?10000:4500}){
  const duel=createDuel(first),local=makeRng((Math.random()*2**32)>>>0);
  while(!duel.winner){
    const turn=turnOf(duel),T=sides[turn.side],G=sides[turn.keeperSide],iKick=turn.side===me;
    const taker=T.order[takerIndex(T.order.length,turn.index)],keeper=G.keeper,kits=kitsFor(T,G);
    hud.turn({turn,taker,keeper,iKick,duel,takerSide:T,keeperSide:G});
    const ok=await arena.scene({...kits,name:shirtName(taker),number:taker.no,gkNumber:keeper.no,pid:taker.id});
    if(signal?.aborted)throw Object.assign(new Error('aborted'),{name:'AbortError'});if(!ok)throw new Error('התמונה לא נטענה');
    arena.info({taker:`${taker.he} #${taker.no} (${taker.shot})`,dive:'',how:''});audio?.whistle();
    arena.role({iKick,keeperTag:iKick?`בשער: ${G.participant||keeper.he}`:'אתה בשער'});
    let kick,dive,seed;
    if(net){
      if(iKick){arena.hint('החזק, כוון ושחרר כשהסמן באזור הלבן');const c=await arena.askKick({shotSkill:taker.shot,keeperSkill:keeper.keep,timeMs:timeKick,signal});
        arena.hint('ממתין לשוער…');const x=await net.exchange(turn.k,{x:c.aim.x,y:c.aim.y,m:c.meter},true);kick={aim:{x:x.kick.x,y:x.kick.y},meter:x.kick.m};dive=x.dive;seed=x.seed}
      else{arena.hint('אתה בשער: משוך לכיוון הזינוק ושחרר');const c=await arena.askDive({timeMs:timeDive,signal});
        arena.hint('ממתין לבעיטה…');const x=await net.exchange(turn.k,{d:c.d},false);kick={aim:{x:x.kick.x,y:x.kick.y},meter:x.kick.m};dive=x.dive;seed=x.seed}
    }else{seed='cpu:'+Math.floor(local()*2**32).toString(16)+':'+turn.k;
      if(iKick){arena.hint('החזק, כוון ושחרר כשהסמן באזור הלבן');const c=await arena.askKick({shotSkill:taker.shot,keeperSkill:keeper.keep,timeMs:timeKick,signal});kick={aim:c.aim,meter:c.meter};dive=aiDive(keeper.keep,local)}
      else{arena.hint('אתה בשער: משוך לכיוון הזינוק ושחרר');const c=await arena.askDive({timeMs:timeDive,signal});dive=c.d;const k=aiKick(taker.shot,local);kick={aim:k.aim,meter:k.meter};await sleep(250,signal)}}
    if(signal?.aborted)throw Object.assign(new Error('aborted'),{name:'AbortError'});
    const result=resolveKick({aim:kick.aim,meter:kick.meter,shotSkill:taker.shot,keeperSkill:keeper.keep,dive,rng:makeRng(String(seed))});
    arena.hint('');arena.roleOff();arena.info({dive:result.keeper.dir,how:`${result.how} x${result.x} y${result.y} p${result.power}`});
    const settle=()=>{if(!recordKick(duel,turn.k,result.out))return;            // once: a second callback, a replayed frame or a repeated message changes nothing
      const word=resultWord(result.how,iKick,result.catch,callBag);hud.marks(duel);arena.flash(word.text,word.good);arena.cheer(word.good?1:.3);
      if(result.how==='goal')audio?.goal(iKick);else if(result.how==='save')audio?.save(result.catch);else if(result.how==='post')audio?.post();else audio?.miss();
      try{navigator.vibrate&&navigator.vibrate(word.good?[18,40,18]:28)}catch(e){}};
    await arena.play(result,{onContact:()=>audio?.kick(result.power),onResult:settle,signal});settle();
    hud.last&&hud.last({turn,result,iKick});
    await sleep(duel.winner?500:700,signal);
  }
  const score=scoreOf(duel);return {winner:duel.winner,score,won:duel.winner===me,duel}}
