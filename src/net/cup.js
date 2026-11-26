// The cup's meeting place. Everybody who signs up for a cup joins one broadcast channel, `phero:CUP-<id>`, and passes two kinds of
// message over it (the matches themselves are ordinary rooms, see protocol.js):
//   reg  {p:{id,name,team,at}}         "I am signing up", repeated every few seconds until the roster is known
//   st   {roster:{list,salt}|null, res:[...]}   everything I know: the roster and every reported result, repeated while the cup runs
// At the kick-off the first player in the sign-up order publishes the roster; if he is not there, the second one does after a short
// wait, and so on. Whoever hears a roster first keeps it. Results are merged by core/cup.js (a result that does not fit the bracket is
// refused), so phones that missed a message catch up from the next `st`.
// There is no referee: a modified phone could report a result that fits. The honest limit of a game without a server.
import {createCup,applyResult,resultsOf,allMatches,cleanAvatar,MAX_PLAYERS} from '../core/cup.js';
export const CUP_PROTOCOL=3;
export const CUP_MSG={few:'לא נרשמו מספיק שחקנים. נסו טורניר חדש.',late:'הטורניר כבר התחיל. אפשר להירשם לבא.',service:'שירות המשחק ברשת לא זמין כרגע.'};

export function createCupNet({connect,cupId,kickoffAt,me,now=()=>Date.now(),on={},timers={}}){
  const T={tick:250,reg:3000,regLate:10000,st:4000,gap:2500,fbReady:90000,fbSeen:20000,...timers};
  const self=me(),regs=new Map(),avatars=new Map(),seen=new Map(),readySince=new Map();let ch=null,closed=false,roster=null,cup=null,status='connecting',pending=[],iv=null,lastReg=0,lastSt=0,cancelAt=0;
  const changed=()=>{try{on.change&&on.change()}catch(e){console.error(e)}};
  const send=m=>{if(ch&&!closed)ch.send({v:CUP_PROTOCOL,k:'cup',cup:cupId,f:self.id,...m})};
  const myReg=()=>({id:self.id,name:self.name,team:self.team,av:cleanAvatar(self.av),at:regs.get(self.id)?.at??now()});
  const order=()=>[...regs.values()].sort((a,b)=>a.at-b.at||(a.id<b.id?-1:1));
  function adopt(r){if(roster||!r||!Array.isArray(r.list))return;const c=createCup(r.list,r.salt);if(!c)return;roster={list:Object.values(c.players),salt:String(r.salt||'')};for(const p of roster.list)if(p.av)avatars.set(p.id,p.av);cup=c;
    status=c.players[self.id]?'started':'late';for(const v of allMatches(c))if(v.status==='ready')readySince.set(v.r+':'+v.m,now());flushPending();changed()}
  function merge(list){let any=false;if(!cup)return false;for(const r of list||[]){if(applyResult(cup,r))any=true;else pending.push(r)}if(any)flushPending();
    for(const v of allMatches(cup))if(v.status==='ready'&&!readySince.has(v.r+':'+v.m))readySince.set(v.r+':'+v.m,now());if(pending.length>40)pending=pending.slice(-40);return any}
  function flushPending(){let again=true;while(again&&pending.length){again=false;const rest=[];for(const r of pending){if(applyResult(cup,r))again=true;else rest.push(r)}pending=rest}}
  const lite=()=>roster&&{list:roster.list.map(({av,...p})=>p),salt:roster.salt};   // the pictures travel in `reg`, not in every `st`
  const sendSt=()=>{lastSt=now();send({t:'st',roster:lite(),res:cup?resultsOf(cup):[]})};
  function onMessage(m){if(closed||!m||typeof m!=='object'||m.k!=='cup'||m.cup!==cupId||m.v!==CUP_PROTOCOL||typeof m.f!=='string'||m.f===self.id)return;seen.set(m.f,now());
    if(m.t==='reg'&&m.p&&typeof m.p.id==='string'&&m.p.id===m.f){const av=cleanAvatar(m.p.av),old=regs.get(m.f);if(av)avatars.set(m.f,av);else avatars.delete(m.f);if(!old||old.name!==String(m.p.name||'').slice(0,24)||old.av!==av){regs.set(m.f,{id:m.f,name:String(m.p.name||'שחקן').slice(0,24),team:String(m.p.team||''),av,at:old?old.at:Number.isFinite(+m.p.at)?+m.p.at:now()});changed()}
      if(roster&&!cup?.players[m.f])sendSt();return}                       // a late one: tell him the cup is on
    if(m.t==='st'){const had=!!cup;if(!roster&&m.roster)adopt(m.roster);const grew=cup?merge(m.res):false;if(grew&&!closed){changed();if(had)sendSt()}}}
  function tick(){if(closed)return;const t=now();
    if(status!=='cancelled'&&t-lastReg>=(roster?T.regLate:T.reg)){lastReg=t;send({t:'reg',p:myReg()})}
    if(!roster&&t>=kickoffAt){const o=order(),rank=o.findIndex(p=>p.id===self.id);
      if(o.length<2){if(!cancelAt)cancelAt=t+T.gap*2;if(t>=cancelAt&&status!=='cancelled'){status='cancelled';changed()}}
      else if(rank>=0&&rank<MAX_PLAYERS&&t>=kickoffAt+rank*T.gap){const list=o.slice(0,MAX_PLAYERS).map(p=>({id:p.id,name:p.name,team:p.team,av:p.av}));const salt=Math.random().toString(36).slice(2,10);adopt({list,salt});sendSt()}
      else if(rank<0&&t>kickoffAt+T.gap*3&&status!=='late'){status='late';changed()}}
    else if(cup){if(t-lastSt>=T.st)sendSt();sweep(t)}
    else if(!roster)changed()}   // the countdown
  /* a match nobody turned up for: after a while every phone says so, and the first in the slot goes through */
  function sweep(t){for(const v of allMatches(cup)){if(v.status!=='ready')continue;const since=readySince.get(v.r+':'+v.m)||t;if(t-since<T.fbReady)continue;
      const here=id=>id===self.id||t-(seen.get(id)||0)<T.fbSeen;if(here(v.a)||here(v.b))continue;
      if(!cup.players[self.id])continue;report({r:v.r,m:v.m,a:v.a,b:v.b,w:v.a,ga:0,gb:0,ka:0,kb:0,kind:'fb'})}}
  function report(res){if(!cup||!applyResult(cup,res))return false;sendSt();changed();return true}
  /** he changed his picture: everybody hears it with the next sign-up message, sent now */
  function setAvatar(v){self.av=cleanAvatar(v);const r=regs.get(self.id);if(r)regs.set(self.id,{...r,av:self.av});if(self.av)avatars.set(self.id,self.av);else avatars.delete(self.id);if(ch&&status!=='cancelled'){lastReg=now();send({t:'reg',p:myReg()})}changed()}
  const api={id:self.id,setAvatar,cupId,kickoffAt,get status(){return status},get cup(){return cup},get roster(){return roster},regs:()=>order(),
    avatarOf:id=>avatars.get(id)||(id===self.id?cleanAvatar(self.av):''),seen:id=>id===self.id?now():seen.get(id)||0,here:(id,within=T.fbSeen)=>id===self.id||now()-(seen.get(id)||0)<within,report,
    close(){if(closed)return;closed=true;clearInterval(iv);try{ch&&ch.close()}catch(e){}ch=null}};
  regs.set(self.id,{id:self.id,name:self.name,team:self.team,av:cleanAvatar(self.av),at:now()});
  connect('CUP-'+cupId,onMessage).then(c=>{if(closed){try{c.close()}catch(e){}return}ch=c;status=roster?status:'lobby';send({t:'reg',p:myReg()});lastReg=now();iv=setInterval(tick,T.tick);changed()},
    e=>{if(closed)return;console.warn('cup',e);status='error';try{on.fail&&on.fail(CUP_MSG.service)}catch(x){}});
  return api}
