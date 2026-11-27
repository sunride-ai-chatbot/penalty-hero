// The cup against the computer, as a World-Cup tree: sixteen clubs, four rounds (round of 16, quarter, semi, final).
// Only the player's own duels are played. Every other match of a round is settled by dice when the round is over, and the tree
// shows nothing in advance: the player sees his own club, the draw shows every club of the round of 16 (the two outer columns of the
// tree), and each further column (the winners) appears when the round before it has been played, whether he won it or lost.
import {makeRng} from './rules.js';
export const SIZE=16,ROUNDS=4;
export const ROUND_NAMES=['שמינית גמר','רבע גמר','חצי גמר','גמר'];
export const roundName=r=>ROUND_NAMES[r]||'';
export const matchesIn=r=>SIZE>>(r+1);
const shuffle=(a,rng)=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};

/** Draw the cup. my:{id,str}, pool:[{id,str}] (every club that could play). The first opponent is a little weaker than the player;
 *  the others spread from clearly weaker to clearly stronger, so the later rounds get harder as the stronger clubs win through. */
export function drawCup({my,pool,seed=String(Math.random())}){const rng=makeRng('draw:'+seed),others=pool.filter(c=>c.id!==my.id),used=new Set();
  // a club near the wanted strength (which itself wobbles by a few points), picked at random from the nearest dozen; ties in strength are
  // shuffled first, so the same four clubs do not come up every time for a given club
  const pick=(t,wide=12,jitter=5)=>{t+=(rng()-.5)*jitter;const c=shuffle(others.filter(x=>!used.has(x.id)),rng).sort((a,b)=>Math.abs(a.str-t)-Math.abs(b.str-t)).slice(0,wide);const o=c[Math.floor(rng()*c.length)];used.add(o.id);return o.id};
  if(others.length<SIZE-1)throw new Error('not enough clubs for a cup');
  const first=pick(my.str-6),rest=shuffle(Array.from({length:SIZE-2},(_,i)=>pick(my.str-12+i*1.7)),rng);
  const meIdx=Math.floor(rng()*SIZE),slots=new Array(SIZE).fill(null);slots[meIdx]=my.id;slots[meIdx^1]=first;let k=0;for(let i=0;i<SIZE;i++)if(slots[i]===null)slots[i]=rest[k++];
  return {seed,slots,meIdx,my:my.id,str:Object.fromEntries([[my.id,my.str],...pool.filter(c=>slots.includes(c.id)).map(c=>[c.id,c.str])]),
    round:0,res:Array.from({length:ROUNDS},(_,r)=>new Array(matchesIn(r)).fill(null)),peek:false,over:false,out:null,champion:null}}

/** The chance that A wins a shoot-out against B from their strengths (a gap of ten points is about three in four). */
export const winChance=(a,b)=>1/(1+Math.exp(-(a-b)/9));
/** a shoot-out by dice: five kicks each, then sudden death; returns [goals of A, goals of B], never a draw */
export function shootout(chanceA,rng){const pa=.74+(chanceA-.5)*.32,pb=.74-(chanceA-.5)*.32;let a=0,b=0;for(let i=0;i<5;i++){if(rng()<pa)a++;if(rng()<pb)b++}
  for(let n=0;a===b&&n<40;n++){if(rng()<pa)a++;if(rng()<pb)b++}if(a===b)chanceA>=.5?a++:b++;return [a,b]}

/** the two clubs of a match: a side is null while the match before it is not settled */
export const teamsOf=(T,r,m)=>r===0?[T.slots[2*m],T.slots[2*m+1]]:[winnerOf(T,r-1,2*m),winnerOf(T,r-1,2*m+1)];
export function winnerOf(T,r,m){const x=T.res[r][m];if(!x)return null;return teamsOf(T,r,m)[x.w]}
/** which match of this round holds the player, and on which side of it he stands */
export const mineAt=(T,r)=>({m:T.meIdx>>(r+1),side:(T.meIdx>>r)&1});
/** the opponent of the player in this round: null while it cannot be known yet */
export function opponentOf(T,r){const {m,side}=mineAt(T,r);return teamsOf(T,r,m)[1-side]}
const sim=(T,r,m)=>{const [a,b]=teamsOf(T,r,m),[sa,sb]=shootout(winChance(T.str[a],T.str[b]),makeRng(`sim:${T.seed}:${r}:${m}`));T.res[r][m]={sa,sb,w:sa>sb?0:1}};
/** every match of the round except the player's own, by dice (the same dice for the same cup) */
function simOthers(T,r){const mine=mineAt(T,r).m;for(let m=0;m<matchesIn(r);m++)if(m!==mine&&!T.res[r][m])sim(T,r,m)}

/** The player's duel of round r is over. mine / theirs: the goals. A win goes on to the next round; a loss ends the player's cup, and
 *  the rest of the tournament is played by dice so the whole tree can be shown. */
export function settleRound(T,r,{won,mine,theirs}){if(T.over||r!==T.round)return T;const {m,side}=mineAt(T,r);
  T.res[r][m]=side===0?{sa:mine,sb:theirs,w:won?0:1,mine:true}:{sa:theirs,sb:mine,w:won?1:0,mine:true};simOthers(T,r);
  if(won){T.round=r+1;if(r===ROUNDS-1){T.over=true;T.champion=T.my}}
  else{T.over=true;T.out=r;for(let q=r+1;q<ROUNDS;q++)for(let i=0;i<matchesIn(q);i++)sim(T,q,i);T.champion=winnerOf(T,ROUNDS-1,0)}
  return T}

/** what the tree may show. slot (r,i): r=0 the sixteen clubs, r=1..3 the winners of round r-1, r=4 the champion.
 *  { id, known }: known false is a question mark. The player's own club is always known; the draw (T.peek) shows all sixteen, and
 *  the winners of a round show once that round is over for the player. A lost cup shows the whole tree. */
export function slotView(T,r,i){if(r===0){const id=T.slots[i],mine=i===T.meIdx;
    return {id,known:T.over||T.round>0||mine||T.peek}}
  const id=winnerOf(T,r-1,i);return {id,known:!!id&&(T.over||T.round>=r)}}
/** the result of a match for the list under the tree, or null while it is hidden */
export function matchView(T,r,m){const x=T.res[r][m];if(!x||!(T.over||T.round>r))return null;const [a,b]=teamsOf(T,r,m);return {a,b,sa:x.sa,sb:x.sb,w:x.w,mine:!!x.mine}}
/** the rounds whose results are shown under the tree: the one just won, or all of them once the cup is over */
export const shownRounds=T=>T.over?[0,1,2,3]:T.round>0?[T.round-1]:[];
