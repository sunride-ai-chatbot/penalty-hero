// A knockout cup of 2, 4 or 8 players, as a pure function of the roster and the reported results. Nothing here touches the
// network or the screen: every phone holds the same roster and merges the same results, and so draws the same bracket.
//
// A "slot" is null when nobody is there (a bye), undefined while the match that feeds it is still being played, else a player id.
import {makeRng} from './rules.js';
export const MAX_PLAYERS=8;
export const sizeFor=n=>n<=2?2:n<=4?4:8;
export const roundsOf=size=>Math.round(Math.log2(size));
export const roundName=(size,r)=>{const left=roundsOf(size)-1-r;return left===0?'גמר':left===1?'חצי גמר':left===2?'רבע גמר':'שלב '+(r+1)};
export const matchCode=(cupId,r,m)=>`${cupId}-${r}${m}`;
const KINDS={played:3,wo:2,fb:1};   // which report wins when two disagree: a real shoot-out, then a walkover claimed by one side, then one claimed by a bystander
const key=(r,m)=>r+':'+m;
const num=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max;

/** roster: [{id,name,team}], salt: any string. The order of play is shuffled by the salt, so it is the same on every phone. */
export function createCup(roster,salt=''){
  const list=[],seen=new Set();for(const p of roster||[]){if(p&&typeof p.id==='string'&&p.id&&!seen.has(p.id)&&list.length<MAX_PLAYERS){seen.add(p.id);list.push({id:p.id,name:String(p.name||'שחקן').slice(0,24),team:String(p.team||'')})}}
  if(list.length<2)return null;
  const rng=makeRng('cup:'+salt),order=list.slice();for(let i=order.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
  const size=sizeFor(list.length),pairs=size/2,pairOrder=Array.from({length:pairs},(_,i)=>i);for(let i=pairs-1;i>0;i--){const j=Math.floor(rng()*(i+1));[pairOrder[i],pairOrder[j]]=[pairOrder[j],pairOrder[i]]}
  const slots=Array(size).fill(null);order.forEach((p,i)=>{const pair=pairOrder[i%pairs],side=i<pairs?0:1;slots[pair*2+side]=p.id});   // everybody is paired before anybody is: a bye never meets a bye
  return {size,slots,players:Object.fromEntries(list.map(p=>[p.id,p])),results:{}}}

export function slotsOf(cup,r,m){
  if(r===0)return [cup.slots[2*m],cup.slots[2*m+1]];
  return [winnerOf(cup,r-1,2*m),winnerOf(cup,r-1,2*m+1)]}
/** id of the winner, null when nobody plays this match at all, undefined while it is not decided */
export function winnerOf(cup,r,m){
  const [a,b]=slotsOf(cup,r,m);if(a===undefined||b===undefined)return undefined;
  if(a===null&&b===null)return null;if(a===null)return b;if(b===null)return a;
  return cup.results[key(r,m)]?.w??undefined}
export function matchView(cup,r,m){const [a,b]=slotsOf(cup,r,m),res=cup.results[key(r,m)]||null,w=winnerOf(cup,r,m);
  const status=a===null||b===null?(a===null&&b===null?'empty':'bye'):a===undefined||b===undefined?'wait':res?'done':'ready';
  return {r,m,a,b,w,res,status}}
export const champion=cup=>winnerOf(cup,roundsOf(cup.size)-1,0);
export function allMatches(cup){const out=[];for(let r=0;r<roundsOf(cup.size);r++)for(let m=0;m<cup.size>>(r+1);m++)out.push(matchView(cup,r,m));return out}

/** Merge one reported result. Returns true when the bracket changed. Only the players of that match, or (for a forfeit of both) any player, may report it. */
export function applyResult(cup,res){
  if(!cup||!res||typeof res!=='object')return false;const {r,m}=res;
  if(!Number.isInteger(r)||!Number.isInteger(m)||r<0||r>=roundsOf(cup.size)||m<0||m>=cup.size>>(r+1))return false;
  const kind=KINDS[res.kind]?res.kind:null;if(!kind)return false;
  const [a,b]=slotsOf(cup,r,m);if(!a||!b||res.a!==a||res.b!==b||(res.w!==a&&res.w!==b))return false;
  if(!num(res.ga,40)||!num(res.gb,40)||!num(res.ka,60)||!num(res.kb,60)||res.ga>res.ka||res.gb>res.kb)return false;
  const clean={r,m,a,b,w:res.w,ga:res.ga,gb:res.gb,ka:res.ka,kb:res.kb,kind},old=cup.results[key(r,m)];
  if(old){const better=KINDS[kind]>KINDS[old.kind]||(KINDS[kind]===KINDS[old.kind]&&clean.w===a&&old.w!==a);if(!better)return false}
  cup.results[key(r,m)]=clean;prune(cup);return true}
/** a replaced result can change who plays later: drop reports that no longer fit */
function prune(cup){let again=true;while(again){again=false;for(const [k,v] of Object.entries(cup.results)){const [a,b]=slotsOf(cup,v.r,v.m);if(a!==v.a||b!==v.b||!a||!b){delete cup.results[k];again=true}}}}
/** all results, to pass on to a phone that has missed some */
export const resultsOf=cup=>Object.values(cup.results).sort((x,y)=>x.r-y.r||x.m-y.m);

/** The match this player has to play now (both players known, no result yet), or null. */
export function nextFor(cup,id){for(const v of allMatches(cup))if(v.status==='ready'&&(v.a===id||v.b===id))return {...v,side:v.a===id?'a':'b',opp:v.a===id?v.b:v.a};return null}
/** Has this player been knocked out? */
export function outOf(cup,id){for(const v of allMatches(cup)){if(v.a!==id&&v.b!==id)continue;const w=winnerOf(cup,v.r,v.m);if(w!==undefined&&w!==null&&w!==id)return true}return false}

/** The scoreboard: one row per player, the champion first, then by how far they got, wins and accuracy. */
export function standings(cup){
  const rows=Object.values(cup.players).map(p=>({id:p.id,name:p.name,team:p.team,wins:0,played:0,goals:0,kicks:0,reached:0,out:false,champion:false}));const by=Object.fromEntries(rows.map(r=>[r.id,r]));
  for(const v of allMatches(cup)){for(const id of [v.a,v.b])if(id&&by[id])by[id].reached=Math.max(by[id].reached,v.r+1);
    if(v.res){for(const [id,g,k] of [[v.a,v.res.ga,v.res.ka],[v.b,v.res.gb,v.res.kb]])if(by[id]){by[id].played++;by[id].goals+=g;by[id].kicks+=k}}
    const w=winnerOf(cup,v.r,v.m);if(w&&by[w]&&v.status!=='bye')by[w].wins++;
    if(w&&v.a&&v.b){const l=w===v.a?v.b:v.a;if(by[l])by[l].out=true}}
  const c=champion(cup);if(c&&by[c])by[c].champion=true;
  for(const r of rows)r.pct=r.kicks?Math.round(r.goals/r.kicks*100):null;
  return rows.sort((x,y)=>(y.champion-x.champion)||(y.reached-x.reached)||(y.wins-x.wins)||((y.pct??-1)-(x.pct??-1))||(x.name<y.name?-1:1))}

/** The next public kick-off: every `every` minutes on the clock, so everybody who opens the game at about the same time lands in the same cup. */
export function nextSlot(now,{every=15,lead=2}={}){const ms=every*60000;let t=Math.ceil(now/ms)*ms;if(t-now<lead*60000)t+=ms;return t}
export const publicCupId=at=>'P'+Math.floor(at/60000).toString(36).toUpperCase();
