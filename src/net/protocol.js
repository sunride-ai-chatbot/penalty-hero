// The network duel: two phones, one room, no trusted server.
//
// Protocol v3 (not compatible with the source game's v1 — the room prefix differs, so the two never meet):
//   hi     guest -> host   {team, name, rules, catalog}           repeated until `start` arrives
//   start  host  -> guest  {to, n, a:{team,name,hash}, b:{team,name,hash}, first, salt}
//   c      both            {n, k, h}        commitment for kick k: h = SHA-256(choice + '|' + nonce)
//   r      both            {n, k, choice, nonce}   sent only after the other side's commitment arrived
//   again  both            {team}           wants another duel in this room (maybe with another club)
//   bye / p / full                           leaving / keep-alive / the room already has two players
// Every message carries v (protocol), f (sender id). `n` is the number of the duel in this room.
//
// A kick is resolved on both phones from the two revealed choices and a seed made from both nonces, through the same
// resolveKick(); neither side can see the other's choice before committing its own, and a reveal that does not match
// its commitment ends the duel. This keeps honest phones in agreement and stops peeking. It is not a referee: a
// modified client can still commit any aim it likes. A server-side resolver would be needed to rule that out.
import {RULES_VERSION} from '../core/rules.js';
export const PROTOCOL=3;
const hex=buf=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function sha256(text){return hex(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))}
export function randomNonce(){const a=new Uint8Array(16);globalThis.crypto.getRandomValues(a);return hex(a)}
export const encodeChoice=c=>c.d?('d:'+c.d.x.toFixed(2)+':'+c.d.y.toFixed(2)):('k:'+c.x.toFixed(2)+':'+c.y.toFixed(2)+':'+c.m.toFixed(3)+':'+(c.c||0));
export function validChoice(c,kicker){if(!c||typeof c!=='object')return false;
  if(kicker)return Number.isFinite(c.x)&&Number.isFinite(c.y)&&Number.isFinite(c.m)&&Math.abs(c.x)<=6&&c.y>=0&&c.y<=4&&c.m>=.05&&c.m<=1&&(c.c===0||c.c===1||c.c===-1);
  return !!c.d&&typeof c.d==='object'&&Number.isFinite(c.d.x)&&Number.isFinite(c.d.y)&&Math.abs(c.d.x)<=3.5&&c.d.y>=.1&&c.d.y<=2.5}
export const MSG={connecting:'מתחבר…',full:'החדר הזה כבר מלא',version:'הגרסאות של שני הטלפונים שונות. רעננו את המשחק בשניהם ונסו שוב.',mismatch:'הנתונים מהטלפון השני לא תואמים. המשחק הופסק.',left:'היריב עזב את המשחק',silent:'אין תשובה מהיריב. בדקו את החיבור ונסו שוב.',nobody:'אף אחד לא הצטרף לחדר',offline:'אין חיבור לאינטרנט. בדקו את החיבור ונסו שוב.',service:'שירות המשחק ברשת לא זמין כרגע. נסו שוב בעוד כמה דקות.'};

/**
 * One end of a room.
 *   connect      transport function
 *   host         true for the phone that opened the room
 *   me           () => {team, name, hash}   my club id, my name, my squad's hash — read again for every duel
 *   catalog      catalog version string
 *   resolveTeam  async teamId => squad hash, or null when this phone does not know the club
 *   on           {state(s), start({a,b,first,mine,n}), again(peerWants), fail(message)}
 */
export function createRoom({connect,code,host,me,catalog,resolveTeam,on,timers={retry:1200,silence:30000,lobby:600000},now=()=>Date.now(),random=Math.random}){
  const id=randomNonce().slice(0,12);let ch=null,peer=null,state='connecting',duel=null,n=0,startMsg=null,last=now(),tick=null,closed=false,wantAgain=false,theirAgain=false,peerTeam=null,peerName='',starting=0;
  const kicks=new Map();const kickOf=k=>{if(!kicks.has(k))kicks.set(k,{});return kicks.get(k)};
  const send=m=>{if(ch&&!closed)ch.send({v:PROTOCOL,f:id,...m})};
  const setState=s=>{state=s;try{on.state&&on.state(s)}catch(e){console.error(e)}};
  function fail(message){if(closed)return;const pending=[...kicks.values()];close(false);for(const K of pending)if(K.reject)K.reject(new Error(message));try{on.fail&&on.fail(message)}catch(e){console.error(e)}}
  function close(sayBye=true){if(closed)return;if(sayBye)send({t:'bye'});closed=true;clearInterval(tick);try{ch&&ch.close()}catch(e){}ch=null}
  async function beginAsHost(){const mine=me();const theirHash=await resolveTeam(peerTeam);if(closed)return;if(!theirHash){send({t:'full',to:peer,why:'version'});peer=null;return}
    n++;kicks.clear();wantAgain=theirAgain=false;const salt=randomNonce();
    startMsg={t:'start',to:peer,n,a:{team:mine.team,name:mine.name,hash:mine.hash},b:{team:peerTeam,name:peerName,hash:theirHash},first:random()<.5?'a':'b',salt};
    send(startMsg);duel={n,mine:'a',salt};setState('play');on.start({a:startMsg.a,b:startMsg.b,first:startMsg.first,mine:'a',n})}
  async function onMessage(m){if(closed||!m||typeof m!=='object'||!m.f||m.f===id)return;
    if(m.v!==PROTOCOL){if(m.t==='hi'&&host)send({t:'full',to:m.f,why:'version'});return}
    if(m.t==='hi'&&host){if(peer&&m.f!==peer)return send({t:'full',to:m.f});last=now();
      if(m.rules!==RULES_VERSION||m.catalog!==catalog)return send({t:'full',to:m.f,why:'version'});
      if(duel&&startMsg)return send(startMsg);if(state==='over'||peer)return;       // already seen: the start is on its way
      peer=m.f;peerTeam=String(m.team||'');peerName=String(m.name||'').slice(0,24);return beginAsHost()}
    if(m.t==='full'&&!host&&m.to===id&&!duel)return fail(m.why==='version'?MSG.version:MSG.full);
    if(m.t==='start'&&!host){if(m.to!==id||!m.a||!m.b||(duel&&m.n<=duel.n)||starting>=m.n)return;starting=m.n;last=now();
      const mine=me();const [ha,hb]=await Promise.all([resolveTeam(m.a.team),resolveTeam(m.b.team)]);if(closed)return;
      if(!ha||!hb||ha!==m.a.hash||hb!==m.b.hash||m.b.team!==mine.team){starting=0;return fail(MSG.version)}
      peer=m.f;n=m.n;kicks.clear();wantAgain=theirAgain=false;duel={n,mine:'b',salt:String(m.salt)};peerName=String(m.a.name||'').slice(0,24);setState('play');
      return on.start({a:m.a,b:m.b,first:m.first==='b'?'b':'a',mine:'b',n})}
    if(m.f!==peer)return;last=now();
    if(m.t==='bye'){if(state==='over'){theirAgain=false;peer=host?null:peer;setState('alone');return}return fail(MSG.left)}
    if(m.t==='again'){if(duel)return;theirAgain=true;if(m.team)peerTeam=String(m.team);try{on.again&&on.again(true)}catch(e){}if(host&&wantAgain)beginAsHost();return}
    if(!duel||m.n!==duel.n)return;                                                   // a message of an earlier duel
    if(m.t==='c'){const K=kickOf(+m.k);if(!K.theirH)K.theirH=String(m.h);return step(+m.k)}
    if(m.t==='r'){const K=kickOf(+m.k);if(K.their||!K.theirH)return step(+m.k);     // a repeat, or a reveal before its commitment
      const digest=await sha256(encodeChoiceSafe(m.choice)+'|'+String(m.nonce));if(closed)return;
      if(digest!==K.theirH)return fail(MSG.mismatch);K.their={choice:m.choice,nonce:String(m.nonce)};return step(+m.k)}}
  const encodeChoiceSafe=c=>{try{return encodeChoice(c)}catch(e){return 'invalid'}};
  /* a kick moves on as far as it can: my reveal goes out once their commitment is in, the result once both reveals are known */
  async function step(k){const K=kickOf(k);if(!K.mine||!K.resolve)return;
    if(K.theirH&&!K.sentR){K.sentR=true;send({t:'r',n:duel.n,k,choice:K.mine.choice,nonce:K.mine.nonce})}
    if(K.their&&K.sentR&&!K.done){if(!validChoice(K.their.choice,!K.iKick))return fail(MSG.mismatch);K.done=true;
      const nk=K.iKick?K.mine.nonce:K.their.nonce,ng=K.iKick?K.their.nonce:K.mine.nonce;const seed=await sha256(nk+'|'+ng+'|'+k+'|'+duel.salt);
      const resolve=K.resolve;K.resolve=K.reject=null;resolve({kick:K.iKick?K.mine.choice:K.their.choice,dive:(K.iKick?K.their.choice:K.mine.choice).d,seed})}}
  const api={id,code,host,get state(){return state},get peerName(){return peerName},get peerTeam(){return peerTeam},get wantAgain(){return wantAgain},get theirAgain(){return theirAgain},
    /** My choice for kick k ({x,y,m} when I kick, {d} when I keep). Resolves with both choices and the shared seed. */
    exchange(k,choice,iKick){return new Promise(async(resolve,reject)=>{if(closed||!duel)return reject(new Error(MSG.left));const K=kickOf(k);if(K.mine)return reject(new Error('kick '+k+' already played'));
      const nonce=randomNonce();const clean=iKick?{x:+(+choice.x).toFixed(2),y:+(+choice.y).toFixed(2),m:+(+choice.m).toFixed(3),c:+choice.c>0?1:+choice.c<0?-1:0}:{d:{x:+(+choice.d.x).toFixed(2),y:+(+choice.d.y).toFixed(2)}};
      if(!validChoice(clean,iKick)){kicks.delete(k);return reject(new Error('invalid choice'))}
      K.mine={choice:clean,nonce,h:await sha256(encodeChoice(clean)+'|'+nonce)};K.iKick=iKick;K.resolve=resolve;K.reject=reject;if(closed)return reject(new Error(MSG.left));
      send({t:'c',n:duel.n,k,h:K.mine.h});step(k)})},
    /** The duel on this phone is over (both phones reach this by themselves). The room stays open for another one. */
    finish(){duel=null;startMsg=null;kicks.clear();wantAgain=theirAgain=false;setState('over')},
    /** I want another duel; `team` may have changed. */
    again(){if(closed||duel)return;wantAgain=true;send({t:'again',team:me().team});if(host&&theirAgain)beginAsHost()},
    close(){close(true)}};
  connect(code,m=>{onMessage(m).catch(e=>{console.error(e);fail(MSG.mismatch)})}).then(c=>{if(closed){try{c.close()}catch(e){}return}ch=c;last=now();setState(host?'open':'joining');
    const hello=()=>{const mine=me();send({t:'hi',team:mine.team,name:mine.name,rules:RULES_VERSION,catalog})};
    tick=setInterval(()=>{if(closed)return;
      if(state==='over'||state==='alone'){send(wantAgain?{t:'again',team:me().team}:{t:'p'});if(state==='over'&&peer&&now()-last>timers.silence){if(host)peer=null;setState('alone')}return}
      if(!duel){if(!host)hello();else if(now()-last>timers.lobby)fail(MSG.nobody);return}
      if(now()-last>timers.silence)return fail(MSG.silent);
      /* say again whatever the other phone may have missed: the open kick, and the reveal of the kick before it */
      let sent=false;for(const k of [...kicks.keys()].sort((a,b)=>b-a).slice(0,2)){const K=kicks.get(k);if(!K.mine)continue;sent=true;if(!K.done)send({t:'c',n:duel.n,k,h:K.mine.h});if(K.sentR)send({t:'r',n:duel.n,k,choice:K.mine.choice,nonce:K.mine.nonce})}
      if(!sent)send(host&&startMsg&&kicks.size===0?startMsg:{t:'p'})},timers.retry);
    if(!host)hello()},e=>{console.warn('room',e);if(closed)return;closed=true;try{on.fail&&on.fail(typeof navigator!=='undefined'&&navigator.onLine===false?MSG.offline:MSG.service)}catch(x){}});
  return api}
