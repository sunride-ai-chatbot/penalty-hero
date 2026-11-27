// What the player has done, kept on this phone only. Pure functions over a plain object; the screens decide when to save.
export const emptyStats=()=>({v:1,played:0,wins:0,streak:0,bestStreak:0,shots:0,goals:0,faced:0,saves:0,survRuns:0,survBest:0,tourPlayed:0,tourWins:0,tourBest:0,goalRun:0,bestGoalRun:0,shutouts:0,cupPlayed:0,cupWins:0,
  daily:{last:'',streak:0,bestStreak:0,best:0,total:0,scores:{}}});
export function parseStats(raw){try{const o=JSON.parse(raw||'null');if(!o||typeof o!=='object')return emptyStats();const e=emptyStats();const out={...e};
  for(const k of Object.keys(e))if(typeof e[k]==='number'&&Number.isFinite(+o[k])&&+o[k]>=0)out[k]=Math.floor(+o[k]);
  const d=o.daily&&typeof o.daily==='object'?o.daily:{};out.daily={...e.daily};for(const k of ['streak','bestStreak','best','total'])if(Number.isFinite(+d[k])&&+d[k]>=0)out.daily[k]=Math.floor(+d[k]);
  if(typeof d.last==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.last))out.daily.last=d.last;
  out.daily.scores={};if(d.scores&&typeof d.scores==='object')for(const [k,v] of Object.entries(d.scores).slice(-60))if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&Number.isFinite(+v))out.daily.scores[k]=Math.max(0,Math.min(5,Math.floor(+v)));
  return out}catch(e){return emptyStats()}}
/** one kick, seen from this phone: I kicked (goal or not) or I kept (saved or not) */
export function recordKick(st,{iKick,how}){if(iKick){st.shots++;if(how==='goal'){st.goals++;st.goalRun++;st.bestGoalRun=Math.max(st.bestGoalRun,st.goalRun)}else st.goalRun=0}else{st.faced++;if(how==='save')st.saves++}return st}
/** conceded: the goals the other side scored; a win without conceding is a shutout */
export function recordDuel(st,{won,conceded=1}){st.played++;st.goalRun=0;if(won){if(conceded===0)st.shutouts++;st.wins++;st.streak++;st.bestStreak=Math.max(st.bestStreak,st.streak)}else st.streak=0;return st}
export function recordSurvival(st,goals){st.survRuns++;st.goalRun=0;const record=goals>st.survBest;st.survBest=Math.max(st.survBest,goals);return record}
/** a knockout league (the friends' cup) came to its end; won: I am the champion */
export function recordCup(st,won){st.cupPlayed++;if(won)st.cupWins++;return st}
/** rounds: how many shoot-outs were won (0..3); a cup is won at 3 */
export function recordTournament(st,rounds){st.tourPlayed++;st.tourBest=Math.max(st.tourBest,rounds);if(rounds>=3)st.tourWins++;return st}
export const dayKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function dayBefore(key){const [y,m,d]=key.split('-').map(Number);return dayKey(new Date(y,m-1,d-1))}
/** Only the first try of a day counts. Returns true when this one was counted. */
export function recordDaily(st,key,score){const D=st.daily;st.goalRun=0;if(D.scores[key]!==undefined)return false;D.scores[key]=score;D.total+=score;D.streak=D.last===dayBefore(key)?D.streak+1:1;D.bestStreak=Math.max(D.bestStreak,D.streak);D.last=key;D.best=Math.max(D.best,score);
  const keys=Object.keys(D.scores).sort();while(keys.length>60)delete D.scores[keys.shift()];return true}
