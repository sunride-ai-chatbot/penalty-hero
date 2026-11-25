// A shoot-out as a small state machine. Pure and idempotent: a kick is recorded once, by its number.
import {shootoutWinner} from './rules.js';
export function createDuel(first='a'){return {first:first==='b'?'b':'a',kicks:{a:[],b:[]},log:[],winner:null}}
/** Number of the kick about to be taken (0-based), who takes it, and which player of his order. */
export function turnOf(d){const n=d.log.length;const side=n%2===0?d.first:(d.first==='a'?'b':'a');return {k:n,side,keeperSide:side==='a'?'b':'a',index:d.kicks[side].length,sudden:n>=10}}
/** Record kick k. Returns false (and changes nothing) for a repeat, an old kick, a kick from the future, or a finished duel. */
export function recordKick(d,k,out){if(d.winner||k!==d.log.length)return false;const {side}=turnOf(d);const goal=out==='goal'?1:0;
  d.kicks[side].push(goal);d.log.push({k,side,goal});d.winner=shootoutWinner(d.kicks.a,d.kicks.b);return true}
export const scoreOf=d=>({a:d.kicks.a.reduce((t,v)=>t+v,0),b:d.kicks.b.reduce((t,v)=>t+v,0)});
/** The player (index into side.order) for a side's n-th kick: the order repeats after everyone has kicked. */
export const takerIndex=(orderLength,n)=>n%Math.max(1,orderLength);
/** Marks to draw for a side: 1 goal, 0 miss, null not taken; five, or as many as were taken (+1 open one in sudden death). */
export function marksOf(d,side){const t=d.kicks[side];const n=Math.max(5,t.length+(d.log.length>=10&&!d.winner&&turnOf(d).side===side?1:0));return Array.from({length:n},(_,i)=>t[i]??null)}
