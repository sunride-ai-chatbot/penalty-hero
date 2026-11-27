// The knockout league: sign up → countdown to the kick-off → bracket and scoreboard → my match (a room like any friend duel) → the trophy,
// and "מלך הפנדלים", the table of the champions. The rules of the bracket are in core/cup.js, the meeting place in net/cup.js.
import {esc} from './crest.js';
import {newRoomCode} from '../net/transport.js';
import {createRoom,MSG} from '../net/protocol.js';
import {createCupNet,CUP_MSG} from '../net/cup.js';
import {kingApi,rowFor,rankKing,MIN_KICKS} from '../net/king.js';
import {cleanAvatar,nextFor,standings,allMatches,matchView,champion,outOf,roundName,roundsOf,matchCode,nextSlot,publicCupId,slotsOf,MAX_PLAYERS} from '../core/cup.js';

const hhmm=ms=>new Date(ms).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
const clock=ms=>{const s=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(s/60);return String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
/* a player is shown by his own picture (a small photo, or an icon he picked), never by his club: with no picture, the first letter on a colour of his own */
const hue=str=>{let h=0;for(const c of String(str))h=(h*31+c.charCodeAt(0))%360;return h};
const avatarHtml=(av,name,cls='')=>{av=cleanAvatar(av);if(av.startsWith('data:'))return `<img class="av ${cls}" src="${av}" alt="">`;if(av.startsWith('e:'))return `<span class="av ic ${cls}" aria-hidden="true">${esc(av.slice(2))}</span>`;
  return `<span class="av ini ${cls}" style="--h:${hue(name)}" aria-hidden="true">${esc([...String(name||'?')][0]||'?')}</span>`};
const ICONS=['⚽','🧤','🦁','🐯','🦅','🔥','⭐','👑'];
/** any photo from the phone → a 64×64 square JPEG of a few KB, small enough to travel in every sign-up message */
async function photoToAvatar(file){const url=URL.createObjectURL(file);try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
  const n=Math.min(img.naturalWidth,img.naturalHeight),c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').drawImage(img,(img.naturalWidth-n)/2,(img.naturalHeight-n)/2,n,n,0,0,64,64);
  for(const q of [.72,.55,.4]){const d=c.toDataURL('image/jpeg',q);if(cleanAvatar(d))return d}return ''}finally{URL.revokeObjectURL(url)}}
const pct=(g,k)=>k?Math.round(g/k*100)+'%':'—';

export function cupFeature(C){
  const {cupDone,S,show,top,crestOf,toast,store,getCatalog,clubById,loadSquad,buildSide,cleanName,nameOrDefault,setName,intro,game,keepAwake,audio,RULES_VERSION,loadTransport,pickClub}=C;
  S.avatar=cleanAvatar(store.get('avatar',''));
  const X={net:null,room:null,R:null,matchKey:'',startT:0,waitT:0,done:false,submitted:false};
  if(new URLSearchParams(location.search).has('debug'))window.__cup=X;
  const forced=new URLSearchParams(location.search).get('pid');   // tests open several phones in one browser profile, which would share one id
  if(/^[a-z0-9]{6,16}$/.test(forced||''))S.pid=forced;
  if(!S.pid){let p=store.get('pid');if(!p){const a=new Uint8Array(8);crypto.getRandomValues(a);p='p'+[...a].map(b=>b.toString(16).padStart(2,'0')).join('');store.set('pid',p)}S.pid=p}
  const ensureTransport=async()=>{if(!S.transport)S.transport=await loadTransport(new URL('../../config/network.json',import.meta.url),{allowLocal:true});return S.transport};
  const history=()=>{try{const a=JSON.parse(store.get('cups','[]'));return Array.isArray(a)?a.slice(-30):[]}catch(e){return[]}};
  const king=()=>{try{const c=JSON.parse(store.get('kingCfg','null'));return c}catch(e){return null}};
  const clubOf=id=>{try{return clubById(id)}catch(e){return null}};
  const avOf=id=>X.net?.avatarOf(id)||X.net?.cup?.players[id]?.av||'';
  const playerLine=(cup,id,extra='')=>{const p=id&&cup.players[id];if(!p)return `<div class="cp empty"><span class="av ini" aria-hidden="true">?</span><b>—</b></div>`;return `<div class="cp${id===S.pid?' me':''}">${avatarHtml(avOf(id),p.name)}<b>${esc(p.name)}</b>${extra}</div>`};
  const closeMatch=()=>{clearTimeout(X.waitT);clearTimeout(X.closeT);if(X.room){try{X.room.close()}catch(e){}X.room=null}X.R=null};
  function closeCup(){closeMatch();clearInterval(X.startT);if(X.net){try{X.net.close()}catch(e){}X.net=null}X.matchKey='';X.done=false;X.submitted=false;X.shown=false;store.set('cupActive','')}

  /* ---------- the start: the next public cup, or one for friends ---------- */
  async function home(error=''){const t=await ensureTransport(),off=!t.available;const at=nextSlot(Date.now());const active=(()=>{try{const a=JSON.parse(store.get('cupActive','null'));return a&&Date.now()<a.at+3*3600e3?a:null}catch(e){return null}})();
    show('cuphome',top('ליגת נוקאאוט פנדלים',true,'עד 8 שחקנים · נוקאאוט עד הגמר · גביע')+`<main class="body center">
      ${error?`<p class="err">${esc(error)}</p>`:''}${off?`<p class="err">משחק ברשת לא מוגדר בגרסה הזו.</p>`:`
      ${active&&!X.net?`<div class="card"><p class="note">נרשמת לטורניר שמתחיל ב־<bdi>${hhmm(active.at)}</bdi>.</p><button type="button" class="btn big" id="resume">חזרה לטורניר</button></div>`:''}
      <div class="card"><h2>הטורניר הציבורי הבא</h2><p class="big-time"><bdi>${hhmm(at)}</bdi></p><p class="note">בעוד <b id="eta"></b> · מי שנכנס עכשיו נרשם לאותו טורניר</p><button type="button" class="btn big" id="public">הרשמה לטורניר</button></div>
      <div class="card"><h2>טורניר לחברים</h2><p class="note">בחר מתי מתחילים, ושלח את הקישור. מי שנכנס מהקישור נרשם לטורניר.</p><div class="more" id="when">${[5,10,30,60].map(m=>`<button type="button" class="chip" data-min="${m}">בעוד ${m} דק׳</button>`).join('')}</div></div>`}
      <button type="button" class="btn big alt" id="king">👑 מלך הפנדלים</button></main>`,el=>{
      el.querySelector('[data-back]').onclick=intro;el.querySelector('#king').onclick=()=>kingScreen(home);if(off)return;
      const eta=el.querySelector('#eta'),upd=()=>{eta.textContent=clock(at-Date.now())};upd();const iv=setInterval(upd,1000);
      el.querySelector('#public').onclick=()=>register({id:publicCupId(at),at});
      for(const b of el.querySelectorAll('[data-min]'))b.onclick=()=>register({id:newRoomCode(),at:Date.now()+(+b.dataset.min)*60000});
      el.querySelector('#resume')?.addEventListener('click',()=>register(active));return()=>clearInterval(iv)})}

  /* ---------- sign-up: a name and a club ---------- */
  function register(def,error=''){S.mode='cup';const my=S.my?clubOf(S.my):null,expired=Date.now()>def.at+10*60000&&!X.net;
    show('cupreg',top('הרשמה לטורניר',true,'מתחיל ב־'+hhmm(def.at))+`<main class="body center">${error?`<p class="err">${esc(error)}</p>`:''}
      ${expired?`<p class="err">הטורניר הזה כבר התחיל או הסתיים.</p>`:''}
      <div class="vs-one">${my?crestOf(my):''}<strong>${my?esc(my.name):'עוד לא בחרת קבוצה'}</strong><button type="button" class="link" id="swap">${my?'החלף קבוצה':'בחר קבוצה'}</button></div>
      <div class="card"><label for="cupName">השם שלך בטבלה</label><div class="avrow"><span id="avprev">${avatarHtml(S.avatar,S.name,'big')}</span><input id="cupName" type="text" maxlength="24" placeholder="איך קוראים לך?" value="${esc(S.name)}" enterkeyhint="done" spellcheck="false"><label class="btn camera" for="avfile" id="avbtn">📷 העלה תמונה</label><input type="file" id="avfile" class="vh" accept="image/*"></div>
      <div class="icons" role="group" aria-label="או בחר אייקון">${ICONS.map(i=>`<button type="button" class="chip${S.avatar==='e:'+i?' on':''}" data-ic="${i}">${i}</button>`).join('')}${S.avatar?'<button type="button" class="chip" data-ic="">בלי תמונה</button>':''}</div>
      <p class="note">מתחיל בעוד <b id="eta"></b>. ההרשמה סוגרת בשעת הפתיחה. נשארים בטלפון פתוח ומחוברים.</p><button type="button" class="btn big" id="join"${expired?' disabled':''}>הירשם</button></div></main>`,el=>{
      const input=el.querySelector('#cupName'),prev=el.querySelector('#avprev');const setAv=v=>{S.avatar=cleanAvatar(v);store.set('avatar',S.avatar);prev.innerHTML=avatarHtml(S.avatar,input.value,'big');for(const b of el.querySelectorAll('[data-ic]'))b.classList.toggle('on',!!S.avatar&&S.avatar==='e:'+b.dataset.ic)};
      input.addEventListener('input',()=>{setName(input.value);if(!S.avatar)prev.innerHTML=avatarHtml('',input.value,'big')});
      for(const b of el.querySelectorAll('[data-ic]'))b.onclick=()=>b.dataset.ic?setAv('e:'+b.dataset.ic):register(def);
      el.querySelector('#avfile').onchange=async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;try{const d=await photoToAvatar(f);if(!d)return toast('לא הצלחנו להשתמש בתמונה הזו');setAv(d);register(def)}catch(x){toast('לא הצלחנו לפתוח את התמונה')}};el.querySelector('[data-back]').onclick=()=>home();
      const eta=el.querySelector('#eta'),upd=()=>{eta.textContent=clock(def.at-Date.now())};upd();const iv=setInterval(upd,1000);
      el.querySelector('#swap').onclick=()=>pickClub({title:'הקבוצה שלך',back:()=>register(def),done:id=>{S.my=id;store.set('club',id);register(def)}});
      el.querySelector('#join').onclick=()=>{setName(input.value);if(!S.name)return toast('כתוב שם, כדי שנדע מי אתה בטבלה');if(!clubOf(S.my))return toast('בחר קבוצה');enter(def)};return()=>clearInterval(iv)})}

  async function enter(def){const t=await ensureTransport();if(!t.available)return home(MSG.service);closeCup();const my=clubOf(S.my);
    store.set('cupActive',JSON.stringify({id:def.id,at:def.at}));S.cupDef=def;
    let repaintT=0;const repaint=()=>{if(repaintT)return;repaintT=setTimeout(()=>{repaintT=0;onChange()},120)};
    X.net=createCupNet({connect:t.connect,cupId:def.id,kickoffAt:def.at,me:()=>({id:S.pid,name:nameOrDefault(),team:my.id,av:S.avatar}),on:{change:repaint,fail:m=>{closeCup();home(m)}}});
    lobby()}
  function onChange(){const n=X.net;if(!n)return;
    if(screen()==='cuplobby'){if(n.status==='started'){try{audio.whistle();audio.buzz('start')}catch(e){}return bracket()}if(n.status==='cancelled'||n.status==='late')return ended(n.status==='late'?CUP_MSG.late:CUP_MSG.few);return paintLobby()}
    if(screen()==='cupbracket')paintBracket();
    if(n.cup&&champion(n.cup)&&!X.done){X.done=true;finish()}}
  const screen=()=>document.querySelector('#app')?.dataset.screen||'';

  /* "my picture": change it any time, in the waiting room or in the bracket; everybody gets the new one */
  function mountAvEditor(box){if(!box)return;const draw=()=>{box.innerHTML=`<h2>התמונה שלך</h2><div class="avrow">${avatarHtml(S.avatar,S.name,'big')}<label class="btn camera" for="avfile">📷 העלה תמונה</label><input type="file" id="avfile" class="vh" accept="image/*"></div><div class="icons" role="group" aria-label="או בחר אייקון">${ICONS.map(i=>`<button type="button" class="chip${S.avatar==='e:'+i?' on':''}" data-ic="${i}">${i}</button>`).join('')}${S.avatar?'<button type="button" class="chip" data-ic="">בלי תמונה</button>':''}</div>`;
      const set=v=>{S.avatar=cleanAvatar(v);store.set('avatar',S.avatar);X.net?.setAvatar(S.avatar);draw();if(screen()==='cuplobby')paintLobby();else if(screen()==='cupbracket')paintBracket()};
      for(const b of box.querySelectorAll('[data-ic]'))b.onclick=()=>set(b.dataset.ic?'e:'+b.dataset.ic:'');
      box.querySelector('#avfile').onchange=async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;try{const d=await photoToAvatar(f);if(!d)return toast('לא הצלחנו להשתמש בתמונה הזו');set(d)}catch(x){toast('לא הצלחנו לפתוח את התמונה')}}};draw()}
  /* ---------- the waiting room: a countdown and the places filling up ---------- */
  function lobby(){const def=S.cupDef;
    show('cuplobby',top('ליגת נוקאאוט',true,'מתחיל ב־'+hhmm(def.at))+`<main class="body center"><div class="countdown"><small>הבעיטה הראשונה בעוד</small><b id="cd">--:--</b></div>
      <div class="slots" id="slots"></div><p class="note" id="lnote" role="status"></p>
      <div class="card"><button type="button" class="btn big" id="share">שתף קישור לטורניר</button><input class="linkbox" dir="ltr" readonly value="${esc(inviteLink(def))}" aria-label="קישור לטורניר"></div><section class="card" id="avcard"></section></main>`,el=>{
      const release=keepAwake();mountAvEditor(el.querySelector('#avcard'));el.querySelector('[data-back]').onclick=()=>{closeCup();home()};
      el.querySelector('#share').onclick=async()=>{const link=inviteLink(def),data={title:'ליגת נוקאאוט פנדלים',text:`${nameOrDefault()} מזמין אותך לליגת פנדלים. מתחילים ב־${hhmm(def.at)}`,url:link};try{if(navigator.share){await navigator.share(data);return}}catch(e){if(e&&e.name==='AbortError')return}
        try{await navigator.clipboard.writeText(link);toast('הקישור הועתק')}catch(e){el.querySelector('.linkbox').select();toast('סמנו והעתיקו את הקישור')}};
      const iv=setInterval(()=>{const cd=el.querySelector('#cd');if(cd)cd.textContent=clock(def.at-Date.now())},250);paintLobby();return()=>{clearInterval(iv);release()}})}
  function paintLobby(){const n=X.net,slots=document.querySelector('#slots');if(!n||!slots)return;const regs=n.regs();
    slots.innerHTML=Array.from({length:MAX_PLAYERS},(_,i)=>{const p=regs[i];if(!p)return `<div class="slot"><span class="av ini empty big" aria-hidden="true">?</span><b>ממתין…</b></div>`;return `<div class="slot on${p.id===S.pid?' me':''}">${avatarHtml(n.avatarOf(p.id)||p.av,p.name,'big')}<b>${esc(p.name)}</b></div>`}).join('');
    const note=document.querySelector('#lnote');if(note)note.textContent=n.status==='connecting'?'מתחבר…':regs.length<2?'עוד אף אחד לא נרשם. שלח את הקישור לחברים.':`${Math.min(regs.length,MAX_PLAYERS)} מתוך ${MAX_PLAYERS} נרשמו. אם לא ימלאו את המקומות, יתחילו עם מי שנרשם.`+(regs.length>MAX_PLAYERS?' ('+(regs.length-MAX_PLAYERS)+' ברשימת המתנה)':'')}
  const inviteLink=def=>{const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('cup',def.id);u.searchParams.set('at',String(def.at));return u.href};
  function ended(text){closeCup();show('cupend',top('ליגת נוקאאוט',true)+`<main class="body center"><p class="err">${esc(text)}</p><button type="button" class="btn big" id="again">חזרה לליגה</button></main>`,el=>{el.querySelector('[data-back]').onclick=intro;el.querySelector('#again').onclick=()=>home()})}

  /* ---------- the bracket and the scoreboard ---------- */
  function bracket(){const n=X.net;if(!n?.cup)return lobby();
    show('cupbracket',top('ליגת נוקאאוט',true,'לוח הטורניר')+`<main class="body"><section class="card mine" id="mine"></section><div id="rounds"></div><section class="card"><h2>טבלת ניקוד</h2><div id="board"></div></section><section class="card" id="avcard"></section></main>`,el=>{
      const release=keepAwake();mountAvEditor(el.querySelector('#avcard'));el.querySelector('[data-back]').onclick=()=>{closeCup();home()};paintBracket();const iv=setInterval(()=>{tickMine()},500);return()=>{clearInterval(iv);release()}});
    if(champion(n.cup)&&!X.shown){X.done=true;finish(true)}}
  function paintBracket(){const n=X.net,cup=n?.cup;if(!cup||screen()!=='cupbracket')return;
    const rounds=[];for(let r=0;r<roundsOf(cup.size);r++){const ms=allMatches(cup).filter(v=>v.r===r&&v.status!=='empty');
      rounds.push(`<section class="round"><h2>${roundName(cup.size,r)}</h2>${ms.map(v=>{const res=v.res,w=v.w;const sc=(side)=>v.status==='bye'?(side==='a'?(v.a?'<i>פטור</i>':''):(v.b?'<i>פטור</i>':'')):res?`<i class="${res.kind!=='played'?'wo':''}">${res.kind==='played'?(side==='a'?res.ga:res.gb):(w===(side==='a'?v.a:v.b)?'ויתור':'')}</i>`:'';
        return `<div class="cm ${v.status}${w&&v.a&&v.b?' decided':''}"><div class="${w===v.a&&v.a?'win':w&&v.a&&v.b?'lose':''}">${playerLine(cup,v.a,sc('a'))}</div><div class="${w===v.b&&v.b?'win':w&&v.a&&v.b?'lose':''}">${playerLine(cup,v.b,sc('b'))}</div></div>`}).join('')}</section>`)}
    document.querySelector('#rounds').innerHTML=rounds.join('');
    document.querySelector('#board').innerHTML=`<table class="tbl"><thead><tr><th></th><th>שחקן</th><th>נצ׳</th><th>שערים</th><th>הצלחה</th></tr></thead><tbody>${standings(cup).map(r=>`<tr class="${r.id===S.pid?'me':''}"><td>${r.champion?'🏆':r.out?'✖':'⚽'}</td><td>${esc(r.name)}</td><td>${r.wins}</td><td><bdi>${r.goals}/${r.kicks}</bdi></td><td>${pct(r.goals,r.kicks)}</td></tr>`).join('')}</tbody></table>`;
    tickMine()}
  /* "my match": who I play, and how long until the whistle */
  function tickMine(){const n=X.net,cup=n?.cup,box=document.querySelector('#mine');if(!cup||!box||screen()!=='cupbracket')return;const me=S.pid,v=nextFor(cup,me),done=champion(cup);
    if(done){box.innerHTML=`<h2>הטורניר נגמר</h2><p class="note">האלוף: <b>${esc(cup.players[done]?.name||'')}</b></p><button type="button" class="btn big" id="crown">לטקס הגביע</button>`;box.querySelector('#crown').onclick=trophy;return}
    if(!cup.players[me]){box.innerHTML=`<h2>אתה צופה</h2><p class="note">ההרשמה נסגרה לפני שנרשמת. אפשר לעקוב אחרי הטורניר כאן.</p>`;return}
    if(v){const key=v.r+':'+v.m,opp=cup.players[v.opp];if(X.matchKey!==key){X.matchKey=key;X.startAt=Date.now()+(v.r===0?6000:9000)}const left=X.startAt-Date.now();
      if(left<=0&&screen()==='cupbracket'){X.matchKey=key;X.startAt=Infinity;return startMatch(v)}
      box.innerHTML=`<h2>${roundName(cup.size,v.r)}: ${esc(nameOf(cup,me))} נגד ${esc(opp?.name||'')}</h2><p class="note">הבעיטות מתחילות בעוד <b>${left===Infinity?'…':Math.ceil(left/1000)}</b> שניות. נשארים במסך.</p><button type="button" class="btn big" id="go">לנקודה הלבנה</button>`;
      box.querySelector('#go').onclick=()=>startMatch(v);return}
    if(outOf(cup,me)){const st=standings(cup).find(r=>r.id===me);box.innerHTML=`<h2>הודחת</h2><p class="note">הגעת ל${roundName(cup.size,Math.max(0,(st?.reached||1)-1))}. אפשר להמשיך לעקוב אחרי הטורניר.</p>`;return}
    const mv=allMatches(cup).find(v=>(v.a===me||v.b===me)&&v.status==='bye');box.innerHTML=`<h2>${mv?'פטור בשלב הזה':'ממתין ליריב'}</h2><p class="note">ממתינים לסיום המשחקים האחרים. המשחק שלך יתחיל מעצמו.</p>`}
  const nameOf=(cup,id)=>cup.players[id]?.name||'שחקן';

  /* ---------- my match: an ordinary friend room, named by the cup and the place in the bracket ---------- */
  function startMatch(v){const n=X.net,cup=n?.cup;if(!cup)return;closeMatch();const R={fail:null,ended:null};X.R=R;const my=clubOf(S.my),opp=cup.players[v.opp],host=v.side==='a';let started=false,claimed=false;
    const claim=()=>{if(claimed)return;claimed=true;n.report({r:v.r,m:v.m,a:v.a,b:v.b,w:S.pid,ga:0,gb:0,ka:0,kb:0,kind:'wo'})};
    const waiting=(text,err)=>show('cupwait',top(roundName(cup.size,v.r),true)+`<main class="body center"><div class="versus one"><div>${avatarHtml(avOf(S.pid),nameOf(cup,S.pid),'huge')}<strong>${esc(nameOf(cup,S.pid))}</strong></div><b class="vs">נגד</b><div>${avatarHtml(avOf(v.opp),opp?.name,'huge')}<strong>${esc(opp?.name||'')}</strong></div></div>
      ${err?`<p class="err">${esc(err)}</p>`:`<p class="note" role="status">${esc(text)}</p><div class="spinner"></div>`}${err?'<button type="button" class="btn big" id="retry">נסה שוב</button>':''}<button type="button" class="btn ghost" id="back">חזרה ללוח</button></main>`,el=>{
      el.querySelector('#back').onclick=()=>{closeMatch();X.startAt=Infinity;bracket()};el.querySelector('#retry')?.addEventListener('click',()=>startMatch(v))});
    waiting(host?'ממתין שהיריב יצטרף…':'מתחבר ליריב…');
    X.waitT=setTimeout(()=>{if(!started&&screen()==='cupwait'){claim();closeMatch();toast('היריב לא הגיע. עלית בויתור',3500);bracket()}},host?62000:90000);
    X.room=createRoom({connect:S.transport.connect,code:matchCode(n.cupId,v.r,v.m),host,me:()=>({team:my.id,name:nameOrDefault(),hash:my.hash}),catalog:getCatalog().version+'/'+RULES_VERSION,timers:{retry:1200,silence:30000,lobby:60000},
      resolveTeam:async id=>{const c=clubOf(id);if(!c)return null;try{await loadSquad(c.id);return c.hash}catch(e){return null}},
      on:{state:()=>{},again:()=>{},
        fail:message=>{if(started){if(n.cup?.results[v.r+':'+v.m]?.kind==='played')return;   // the shoot-out is settled: the other phone leaving now is not a walkover
          if(message===MSG.left||message===MSG.silent)claim();if(R.fail)R.fail(message);return}
          if(message===MSG.nobody){claim();closeMatch();toast('היריב לא הגיע. עלית בויתור',3500);return bracket()}
          clearTimeout(X.waitT);if(screen()==='cupwait')waiting('',message)},
        start:async({a,b,first,mine:side})=>{const room=X.room;started=true;clearTimeout(X.waitT);try{const [ca,cb]=[clubOf(a.team),clubOf(b.team)];const [sa,sb]=await Promise.all([loadSquad(ca.id),loadSquad(cb.id)]);if(X.room!==room)return;
            const A=buildSide(ca,sa,{participant:cleanName(a.name)||'שחקן'}),B=buildSide(cb,sb,{twin:cb.id===ca.id,participant:cleanName(b.name)||'שחקן'});
            game({sides:{a:A,b:B},me:side,first,net:room,R,exit:()=>{closeMatch();bracket()},custom:{end:res=>matchEnd(v,res,side)}})}catch(e){console.error(e);closeMatch();started=false;waiting('',MSG.version)}}}})}
  /* both phones report the same result; the bracket takes whichever arrives first */
  function matchEnd(v,res,side){const n=X.net,cup=n.cup,k=res.duel.kicks,sum=a=>a.reduce((t,x)=>t+x,0);
    const ga=sum(k.a),gb=sum(k.b),ka=k.a.length,kb=k.b.length,aGoals=v.side==='a'?ga:gb,bGoals=v.side==='a'?gb:ga,aK=v.side==='a'?ka:kb,bK=v.side==='a'?kb:ka;
    n.report({r:v.r,m:v.m,a:v.a,b:v.b,w:res.won?S.pid:v.opp,ga:aGoals,gb:bGoals,ka:aK,kb:bK,kind:'played'});X.startAt=Infinity;clearTimeout(X.closeT);X.closeT=setTimeout(closeMatch,30000);   // the room stays open a while: the other phone may still be watching its replay
    
    const last=v.r===roundsOf(cup.size)-1,sc=`${res.score[side]}:${res.score[side==='a'?'b':'a']}`;
    if(res.won&&last)return {good:true,title:'אלופים!',lines:[`הגמר: ${sc}`],buttons:[['t','לטקס הגביע',()=>{X.done=true;finish(true)}]]};
    if(res.won)return {good:true,title:'עלית שלב!',lines:[`${roundName(cup.size,v.r)}: ${sc}`,`הבא: ${roundName(cup.size,v.r+1)}`],buttons:[['b','ללוח הטורניר',()=>bracket()]]};
    return {good:false,title:'הודחת',lines:[`${roundName(cup.size,v.r)}: ${sc}`],buttons:[['b','ללוח הטורניר',()=>bracket()],['h','יציאה',()=>{closeCup();intro()},'ghost']]}}

  /* ---------- the end: my row in the table, and the trophy ---------- */
  async function finish(show1=false){const n=X.net,cup=n?.cup;if(!cup)return;const c=champion(cup);if(!c)return;
    if(!X.submitted&&cup.players[S.pid]){X.submitted=true;const row=rowFor(cup,n.cupId,S.pid,n.avatarOf(S.pid)||S.avatar);const h=history();const st=standings(cup).find(r=>r.id===S.pid);
      h.push({id:n.cupId,at:Date.now(),champion:c===S.pid,wins:st?.wins||0,goals:st?.goals||0,kicks:st?.kicks||0,players:Object.keys(cup.players).length});store.set('cups',JSON.stringify(h.slice(-30)));try{cupDone&&cupDone(c===S.pid)}catch(e){console.error(e)}
      X.kingState=row?'fail':'small';if(row){const cfg=await kingCfg();if(cfg){const r=await kingApi(cfg).submit(row);X.kingState=r.ok?'ok':'fail';if(!r.ok)console.warn('king',r.status)}}store.set('cupActive','')}
    if(show1||(screen()!=='game'&&!X.shown))trophy()}
  const kingCfg=async()=>{try{const r=await fetch(new URL('../../config/network.json',import.meta.url),{cache:'no-store'});const c=await r.json();return c&&c.transport==='supabase'&&c.url&&c.key?{url:c.url,key:c.key}:null}catch(e){return null}};
  function trophy(){const n=X.net,cup=n?.cup;if(!cup)return home();X.shown=true;const c=champion(cup),p=cup.players[c],club=clubOf(p?.team),mine=c===S.pid;try{audio.win()}catch(e){}
    const final=allMatches(cup).find(v=>v.r===roundsOf(cup.size)-1),res=final?.res;const confetti=Array.from({length:36},(_,i)=>`<i style="--x:${(i*53)%100}%;--d:${(i%9)*.35}s;--c:${['#f2c14e','#ffffff','#5bd16e','#e9c46a','#ff5d6c'][i%5]}"></i>`).join('');
    show('cuptrophy',`<div class="confetti" aria-hidden="true">${confetti}</div><main class="body center trophy-body"><svg class="trophy" viewBox="0 0 120 150" aria-hidden="true"><defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#b98a22"/><stop offset=".45" stop-color="#ffe58a"/><stop offset="1" stop-color="#a4741a"/></linearGradient></defs>
      <path d="M30 14h60v38c0 20-13 34-30 34S30 72 30 52Z" fill="url(#tg)"/><path d="M30 24H12c0 24 10 36 24 40M90 24h18c0 24-10 36-24 40" fill="none" stroke="url(#tg)" stroke-width="7" stroke-linecap="round"/><rect x="54" y="84" width="12" height="26" fill="url(#tg)"/><path d="M36 110h48l6 14H30Z" fill="url(#tg)"/><rect x="26" y="124" width="68" height="14" rx="4" fill="#7a5512"/><path d="M42 24c0 18 6 38 18 50" stroke="#fff8" stroke-width="5" fill="none" stroke-linecap="round"/></svg>
      <h1 class="champ-title">${mine?'אלופים! אתה האלוף':'אלוף הליגה'}</h1><div class="vs-one">${avatarHtml(avOf(c),p?.name,'huge gold')}<strong class="champ-name">${esc(p?.name||'')}</strong><small>${club?esc(club.name):''}</small></div>
      ${res?`<p class="note">הגמר: ${esc(nameOf(cup,final.a))} <b>${res.ga}:${res.gb}</b> ${esc(nameOf(cup,final.b))}${res.kind!=='played'?' (בויתור)':''}</p>`:''}
      <p class="note" id="kmsg">${!cup.players[S.pid]?'':X.kingState==='ok'?'התוצאה שלך נרשמה בטבלת מלך הפנדלים.':X.kingState==='small'?'טורניר של פחות מ־4 שחקנים לא נספר בטבלה העולמית.':'התוצאה נשמרה בטלפון. הטבלה העולמית לא זמינה כרגע.'}</p>
      <button type="button" class="btn big" id="kingbtn">👑 מלך הפנדלים</button><button type="button" class="btn big alt" id="tbl">לטבלת הטורניר</button><button type="button" class="btn ghost" id="share2">שתף את הניצחון</button><button type="button" class="btn ghost" id="out">יציאה</button></main>`,el=>{
      el.querySelector('#kingbtn').onclick=()=>kingScreen(()=>trophy());el.querySelector('#tbl').onclick=()=>bracket();el.querySelector('#out').onclick=()=>{closeCup();intro()};
      el.querySelector('#share2').onclick=async()=>{const u=new URL(location.href);u.search='';u.hash='';const data={title:'Penalty Hero',text:mine?'ניצחתי בליגת הפנדלים 🏆 בואו לנסות לנצח אותי':`${p?.name||'שחקן'} ניצח בליגת הפנדלים 🏆`,url:u.href};try{if(navigator.share)return await navigator.share(data)}catch(e){if(e&&e.name==='AbortError')return}
        try{await navigator.clipboard.writeText(data.text+' '+data.url);toast('הועתק')}catch(e){}}})}

  /* ---------- מלך הפנדלים ---------- */
  async function kingScreen(back,by='titles'){
    show('king',top('מלך הפנדלים',true,'אלופי הליגה')+`<main class="body"><div class="tabs" role="tablist"><button type="button" class="chip${by==='titles'?' on':''}" data-by="titles">אלופים</button><button type="button" class="chip${by==='accuracy'?' on':''}" data-by="accuracy">דיוק</button></div><div id="kbody"><div class="spinner"></div></div><section class="card"><h2>הטורנירים שלי</h2><div id="mine2"></div></section><p class="note">מדורגים רק טורנירים של ארבעה שחקנים ויותר. הדיוק נספר מ־${MIN_KICKS} בעיטות. אין שופט בשרת, והטבלה מבוססת על דיווחי השחקנים.</p></main>`,el=>{
      el.querySelector('[data-back]').onclick=back||intro;for(const b of el.querySelectorAll('[data-by]'))b.onclick=()=>kingScreen(back,b.dataset.by);
      const h=history(),won=h.filter(x=>x.champion).length,g=h.reduce((t,x)=>t+x.goals,0),k=h.reduce((t,x)=>t+x.kicks,0);
      el.querySelector('#mine2').innerHTML=h.length?`<div class="stat"><span>טורנירים / זכיות</span><b>${h.length} / ${won}</b></div><div class="stat"><span>שערים / בעיטות</span><b>${g} / ${k} · ${pct(g,k)}</b></div>`:'<p class="note">עוד לא שיחקת בליגה.</p>';
      (async()=>{const cfg=await kingCfg();const box=el.querySelector('#kbody');if(!box||screen()!=='king')return;
        if(!cfg){box.innerHTML='<p class="err">הטבלה העולמית לא מוגדרת בגרסה הזו.</p>';return}
        const r=await kingApi(cfg).board();if(!el.isConnected||!box.isConnected)return;
        if(!r.ok){box.innerHTML=r.setup?'<p class="err">הטבלה העולמית עוד לא הופעלה. צריך להריץ פעם אחת את supabase/king.sql בלוח הבקרה של Supabase.</p>':'<p class="err">אין חיבור לטבלה כרגע. נסו שוב בעוד רגע.</p>';return}
        const rows=rankKing(r.rows,by);if(!rows.length){box.innerHTML='<p class="note">עוד אין אלופים. הטורניר הראשון יכניס את הראשון.</p>';return}
        box.innerHTML=`<table class="tbl king"><thead><tr><th>#</th><th>שחקן</th><th>🏆</th><th>טורנירים</th><th>הצלחה</th></tr></thead><tbody>${rows.slice(0,50).map((x,i)=>`<tr class="${x.player_id===S.pid?'me':''}"><td>${i===0?'👑':i+1}</td><td class="who">${avatarHtml(x.avatar,x.name)}<span>${esc(x.name)}</span></td><td>${x.titles}</td><td>${x.cups}</td><td>${x.pct}% <small><bdi>${x.goals}/${x.kicks}</bdi></small></td></tr>`).join('')}</tbody></table>`})()})}

  /* an invitation link: ?cup=ID&at=EPOCH */
  const parseInvite=params=>{const id=String(params.get('cup')||'').replace(/[^A-Za-z0-9]/g,'').slice(0,12),at=+params.get('at');return id.length>=3&&Number.isFinite(at)&&at>1e12?{id,at}:null};
  return {home,register,kingScreen,parseInvite,closeCup,hhmm,get active(){return !!X.net}}}
