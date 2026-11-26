// "מלך הפנדלים": the table of the cups, kept in the same Supabase project as the rooms (see supabase/king.sql). Only the project's
// public URL and publishable key are used, and the game only inserts and reads. When the table has not been set up, or there is no
// network, every call answers {ok:false} and the screens fall back to what this phone remembers.
import {standings,champion,cleanAvatar} from '../core/cup.js';
export const MIN_CUP_PLAYERS=4,MIN_KICKS=10;

/** the row a player files for a finished cup, or null when the cup is too small to count */
export function rowFor(cup,cupId,id,avatar=''){
  if(!cup||Object.keys(cup.players).length<MIN_CUP_PLAYERS)return null;const me=standings(cup).find(r=>r.id===id);if(!me||!me.played)return null;
  return {cup_id:String(cupId).slice(0,40),player_id:id,name:me.name.slice(0,24),team:me.team.slice(0,60),champion:champion(cup)===id,matches_won:Math.min(3,me.wins),goals:me.goals,kicks:me.kicks,players:Object.keys(cup.players).length,avatar:cleanAvatar(avatar)}}

/** 'titles': most cups won, then accuracy. 'accuracy': best share of goals with at least MIN_KICKS kicks. */
export function rankKing(rows,by='titles'){
  const list=(rows||[]).filter(r=>r&&Number.isFinite(+r.kicks)).map(r=>({...r,pct:r.kicks?Math.round(r.goals/r.kicks*100):0}));
  if(by==='accuracy')return list.filter(r=>r.kicks>=MIN_KICKS).sort((a,b)=>b.pct-a.pct||b.kicks-a.kicks||b.titles-a.titles);
  return list.filter(r=>r.cups>0).sort((a,b)=>b.titles-a.titles||b.pct-a.pct||b.wins-a.wins||a.cups-b.cups)}

export function kingApi({url,key,fetchImpl=globalThis.fetch,timeoutMs=9000}){
  const base=String(url||'').replace(/\/+$/,'')+'/rest/v1/',headers={apikey:key,'Content-Type':'application/json',...(String(key).startsWith('eyJ')?{Authorization:'Bearer '+key}:{})};
  async function call(path,init){const ctl=typeof AbortController!=='undefined'?new AbortController():null,t=ctl&&setTimeout(()=>ctl.abort(),timeoutMs);
    try{const r=await fetchImpl(base+path,{...init,headers:{...headers,...(init&&init.headers)},signal:ctl?.signal});
      if(r.ok||r.status===409)return {ok:true,status:r.status,json:async()=>{try{return await r.json()}catch(e){return null}}};
      return {ok:false,status:r.status}}
    catch(e){return {ok:false,status:0}}finally{t&&clearTimeout(t)}}
  return {
    /** file my row for a cup; a repeat (the same cup and player) is accepted and ignored */
    async submit(row){if(!row)return {ok:false,skipped:true};const post=b=>call('king_cups',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(b)});let r=await post(row);
      if(!r.ok&&r.status===400&&row.avatar){const {avatar,...plain}=row;r=await post(plain)}   // the table was set up before pictures: file the row without one
      return {ok:r.ok,status:r.status,setup:r.status===404}},
    async board(){const r=await call('king_board?select=*&order=titles.desc,pct.desc&limit=100');if(!r.ok)return {ok:false,setup:r.status===404,rows:[]};const rows=await r.json();return {ok:true,rows:Array.isArray(rows)?rows:[]}}}}
