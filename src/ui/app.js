// The screens: opening → mode → country → league → club → (opponent | room) → before the duel → the duel → result.
import {VERSION} from '../version.js';
import {clubCrest,flagSVG,esc} from './crest.js';
import {loadCatalog,getCatalog,clubById,loadSquad,buildSide,similarOpponent,leagueOf,loadFace,preloadFaces,kitsFor} from '../data/catalog.js';
import {inkFor} from './crest.js';
import {marksOf,scoreOf} from '../core/duel.js';
import {RULES_VERSION,makeRng} from '../core/rules.js';
import {parseStats,recordKick,recordDuel,recordSurvival,recordTournament,recordDaily,dayKey} from '../core/stats.js';
import {runSurvival,runDaily} from '../game/solo.js';
import {createArena} from '../game/arena.js';
import {runDuel} from '../game/match.js';
import {createRoom,MSG} from '../net/protocol.js';
import {loadTransport,newRoomCode,cleanCode} from '../net/transport.js';

const ASSET=p=>new URL('../../assets/'+p,import.meta.url).href;
const store={get(k,d=''){try{return localStorage.getItem('ph.'+k)??d}catch(e){return d}},set(k,v){try{localStorage.setItem('ph.'+k,v)}catch(e){}}};
export const cleanName=s=>String(s||'').replace(/[\u0000-\u001f<>]/g,'').replace(/\s+/g,' ').trim().slice(0,24);

export function startApp(root,{audio}){
  const params=new URLSearchParams(location.search),debug=params.has('debug'),force2d=params.get('view')==='2d';
  const S={name:cleanName(store.get('name')),mode:null,my:store.get('club')||null,opp:null,invite:cleanCode(params.get('room')||params.get('pen')),room:null,transport:null,busy:null};
  let leave=null,screen='';   // leave(): cleanup of the screen on show
  S.stats=parseStats(store.get('stats'));const saveStats=()=>store.set('stats',JSON.stringify(S.stats));
  /* the screen stays on while a duel is on: a locked phone drops the room */
  const keepAwake=()=>{let lock=null,off=false;const ask=async()=>{try{if(!off&&navigator.wakeLock&&!document.hidden)lock=await navigator.wakeLock.request('screen')}catch(e){}};
    const vis=()=>{if(!document.hidden&&(!lock||lock.released))ask()};document.addEventListener('visibilitychange',vis);ask();
    return()=>{off=true;document.removeEventListener('visibilitychange',vis);try{lock&&lock.release()}catch(e){}}};
  const nameOrDefault=()=>S.name||'שחקן';
  const setName=v=>{S.name=cleanName(v);store.set('name',S.name)};
  const setInvite=code=>{S.invite=cleanCode(code);const u=new URL(location.href);u.searchParams.delete('pen');if(S.invite)u.searchParams.set('room',S.invite);else u.searchParams.delete('room');try{history.replaceState(history.state,'',u)}catch(e){}};
  const inviteLink=code=>{const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('room',code);return u.href};
  function show(name,html,setup){try{leave&&leave()}catch(e){console.error(e)}leave=null;screen=name;root.dataset.screen=name;root.innerHTML=html;root.scrollTop=0;leave=setup?setup(root)||null:null}
  const $=s=>root.querySelector(s);
  const top=(title,back,sub='')=>`<header class="top">${back?`<button type="button" class="icon back" data-back aria-label="חזרה">›</button>`:'<span></span>'}<div><h1>${esc(title)}</h1>${sub?`<p>${sub}</p>`:''}</div><button type="button" class="icon mute" data-mute aria-label="השתקה" aria-pressed="${audio.muted}">${audio.muted?'🔇':'🔊'}</button></header>`;
  root.addEventListener('click',e=>{const m=e.target.closest('[data-mute]');if(m){audio.unlock();audio.setMuted(!audio.muted);for(const b of root.querySelectorAll('[data-mute]')){b.textContent=audio.muted?'🔇':'🔊';b.setAttribute('aria-pressed',audio.muted)}}});
  root.addEventListener('pointerdown',()=>audio.unlock(),{passive:true});
  const crestOf=club=>`<span class="crest-box">${clubCrest(club)}</span>`;
  const toast=(text,ms=2600)=>{const t=document.createElement('div');t.className='toast';t.textContent=text;document.body.append(t);setTimeout(()=>t.remove(),ms)};

  /* ---------- 1–3: opening, name, mode ---------- */
  function intro(){S.mode=null;
    show('intro',`<video class="intro-video" muted loop playsinline webkit-playsinline autoplay preload="auto" poster="${ASSET('cinematic-stadium.webp')}" src="${ASSET('penalty-intro.mp4')}"></video><div class="intro-shade"></div>
      <div class="intro-body"><img class="intro-logo" src="${ASSET('penalty-crest.webp')}" width="440" height="370" alt="Penalty Hero"><h1 class="sr">Penalty Hero</h1>
      <form class="card intro-card" autocomplete="off">${S.invite?`<p class="invite">הוזמנת לדו־קרב · חדר <bdi dir="ltr">${S.invite}</bdi></p>`:''}
        <label for="playerName">שם השחקן</label><input id="playerName" name="nickname" type="text" maxlength="24" placeholder="איך קוראים לך?" value="${esc(S.name)}" enterkeyhint="done" autocapitalize="words" spellcheck="false">
        ${S.invite?`<button type="submit" class="btn big" data-mode="net">הצטרף לדו־קרב</button><button type="button" class="btn ghost" data-mode="cpu">מול המחשב</button>`
          :`<button type="submit" class="btn big" data-mode="cpu">מול המחשב</button><button type="button" class="btn big alt" data-mode="net">מול חבר ברשת</button>`}

      </form><div class="more" role="group" aria-label="עוד מצבים"><button type="button" class="chip" data-mode="tour">טורניר</button><button type="button" class="chip" data-mode="surv">הישרדות</button><button type="button" class="chip" data-mode="daily">אתגר יומי</button><button type="button" class="chip" data-mode="stats">הסטטיסטיקה שלי</button></div><footer class="intro-foot"><button type="button" class="icon mute" data-mute aria-label="השתקה" aria-pressed="${audio.muted}">${audio.muted?'🔇':'🔊'}</button><span>Penalty Hero · גרסה <bdi dir="ltr">${VERSION}</bdi></span></footer></div>`,
    el=>{const v=el.querySelector('video'),play=()=>{const p=v.play();p&&p.catch&&p.catch(()=>{})};play();const vis=()=>{document.hidden?v.pause():play()};document.addEventListener('visibilitychange',vis);el.addEventListener('pointerdown',play,{passive:true});
      const input=el.querySelector('#playerName');input.addEventListener('input',()=>setName(input.value));
      const choose=mode=>{setName(input.value);S.mode=mode;if(mode==='stats')return statsScreen();if(mode==='daily')return daily();pickMine()};
      el.querySelector('form').addEventListener('submit',e=>{e.preventDefault();choose(e.submitter?.dataset.mode||(S.invite?'net':'cpu'))});
      for(const b of el.querySelectorAll('button[data-mode][type=button]'))b.addEventListener('click',()=>choose(b.dataset.mode));
      return()=>{document.removeEventListener('visibilitychange',vis);v.pause();v.removeAttribute('src');v.load()}})}

  /* ---------- 4: country → league → club ---------- */
  function picker({title,note='',exclude=null,back,done}){const P={country:null,league:null};const cat=getCatalog();
    const paint=()=>{const country=cat.countries.find(c=>c.id===P.country),league=country?.leagues.find(l=>l.id===P.league);
      const card=(attr,id,art,name,sub='')=>`<button type="button" class="tile" ${attr}="${esc(id)}"><span class="tile-art">${art}</span><strong>${esc(name)}</strong>${sub?`<small>${sub}</small>`:''}</button>`;
      let body;if(!country)body=`<h2>בחר מדינה</h2><div class="grid">${cat.countries.map(c=>card('data-country',c.id,flagSVG(c.id),c.name,c.leagues.length>1?c.leagues.length+' ליגות':esc(c.leagues[0].name))).join('')}</div>`;
      else if(!league)body=`<h2>${esc(country.name)} · בחר ליגה</h2><div class="grid">${country.leagues.map(l=>card('data-league',l.id,flagSVG(country.id),l.name,l.clubs.length+' קבוצות')).join('')}</div>`;
      else body=`<h2>${esc(league.name)}</h2><div class="grid">${league.clubs.filter(id=>id!==exclude).map(id=>{const c=cat.clubs[id];return card('data-club',id,clubCrest(c),c.name,'עוצמה <bdi>'+c.str+'</bdi>')}).join('')}</div>`;
      show('pick',top(title,true,note)+`<main class="body">${body}</main>`,el=>{
        el.querySelector('[data-back]').onclick=()=>{if(P.league&&country.leagues.length>1){P.league=null;paint()}else if(P.country){P.country=P.league=null;paint()}else back()};
        el.querySelector('.grid').addEventListener('click',e=>{const b=e.target.closest('.tile');if(!b)return;
          if(b.dataset.country){P.country=b.dataset.country;const c=cat.countries.find(x=>x.id===P.country);P.league=c.leagues.length===1?c.leagues[0].id:null;paint()}
          else if(b.dataset.league){P.league=b.dataset.league;paint()}else if(b.dataset.club)done(b.dataset.club)})})};
    paint()}
  function pickMine(){picker({title:'הקבוצה שלך',note:esc(nameOrDefault())+(S.mode==='net'?' · כל צד בוחר קבוצה משלו':''),back:intro,done:id=>{S.my=id;store.set('club',id);S.mode==='net'?lobby():S.mode==='tour'?tournament():S.mode==='surv'?survival():opponent()}})}

  /* ---------- 5: the opponent (computer) ---------- */
  function opponent(){const my=clubById(S.my);if(!my)return pickMine();
    show('opp',top('היריבה',true)+`<main class="body center"><div class="vs-one">${crestOf(my)}<strong>${esc(my.name)}</strong></div>
      <button type="button" class="btn big" id="draw">הגרל יריבה ברמה דומה</button><button type="button" class="btn big alt" id="choose">בחר יריבה</button></main>`,el=>{
      el.querySelector('[data-back]').onclick=pickMine;el.querySelector('#draw').onclick=()=>{S.opp=similarOpponent(S.my).id;before()};
      el.querySelector('#choose').onclick=()=>picker({title:'בחר יריבה',back:opponent,done:id=>{S.opp=id;before()}})})}

  /* ---------- 6: before the duel (the name can still be changed here) ---------- */
  async function before(){const my=clubById(S.my),op=clubById(S.opp);if(!my||!op)return opponent();
    show('before',top('לפני הדו־קרב',true)+`<main class="body center"><div class="load">טוען סגלים…</div></main>`,el=>{el.querySelector('[data-back]').onclick=opponent});
    let sa,sb;try{[sa,sb]=await Promise.all([loadSquad(my.id),loadSquad(op.id)])}catch(e){if(screen!=='before')return;return retry('לא הצלחנו לטעון את הסגלים. בדקו את החיבור.',before,opponent)}
    if(screen!=='before')return;const A=buildSide(my,sa),B=buildSide(op,sb,{twin:op.id===my.id});
    const five=side=>`<ol class="five">${side.order.slice(0,5).map(p=>`<li><bdi class="no">${p.no}</bdi><span>${esc(p.he)}</span><bdi class="sk">${p.shot}</bdi></li>`).join('')}</ol><p class="gk">בשער: ${esc(side.keeper.he)} <bdi class="sk">${side.keeper.keep}</bdi></p>`;
    show('before',top('לפני הדו־קרב',true)+`<main class="body"><div class="versus"><div>${crestOf(my)}<strong>${esc(my.name)}</strong>${five(A)}</div><b class="vs">נגד</b><div>${crestOf(op)}<strong>${esc(op.name)}</strong>${five(B)}</div></div>
      <div class="card"><label for="playerName2">שם השחקן</label><input id="playerName2" type="text" maxlength="24" placeholder="איך קוראים לך?" value="${esc(S.name)}" enterkeyhint="done" spellcheck="false">
      <button type="button" class="btn big" id="go">לנקודה הלבנה</button><p class="note">חמש בעיטות לכל צד. כשאתה בועט: החזק, כוון ושחרר באזור הלבן. כשהם בועטים: אתה בשער.</p></div></main>`,el=>{
      el.querySelector('[data-back]').onclick=opponent;const input=el.querySelector('#playerName2');input.addEventListener('input',()=>setName(input.value));
      el.querySelector('#go').onclick=()=>{setName(input.value);A.participant=nameOrDefault();B.participant='המחשב';game({sides:{a:A,b:B},me:'a',first:Math.random()<.5?'a':'b',again:before,exit:intro})}})}
  function retry(text,again,back){show('error',top('תקלה',true)+`<main class="body center"><p class="err">${esc(text)}</p><button type="button" class="btn big" id="again">נסה שוב</button></main>`,el=>{el.querySelector('[data-back]').onclick=back;el.querySelector('#again').onclick=again})}

  /* ---------- 7: the room ---------- */
  async function lobby(error=''){const my=clubById(S.my);if(!my)return pickMine();closeRoom();
    if(!S.transport)S.transport=await loadTransport(new URL('../../config/network.json',import.meta.url),{allowLocal:true});
    const off=!S.transport.available;
    show('lobby',top('מול חבר ברשת',true)+`<main class="body center"><div class="vs-one">${crestOf(my)}<strong>${esc(my.name)}</strong><button type="button" class="link" id="swap">החלף קבוצה</button></div>
      ${error?`<p class="err">${esc(error)}</p>`:''}
      ${off?`<p class="err">משחק ברשת לא מוגדר בגרסה הזו.</p><p class="note">כדי להפעיל אותו צריך להגדיר שירות רשת בקובץ <bdi dir="ltr">config/network.json</bdi>. אין כאן יריב מדומה: בלי שירות אין חדר ואין קישור.</p><button type="button" class="btn big" id="cpu">שחק מול המחשב</button>`
      :`<div class="card"><label for="playerName3">שם השחקן</label><input id="playerName3" type="text" maxlength="24" placeholder="איך קוראים לך?" value="${esc(S.name)}" enterkeyhint="done" spellcheck="false">
        ${S.invite?`<button type="button" class="btn big" id="join">הצטרף לחדר <bdi dir="ltr">${S.invite}</bdi></button><button type="button" class="link" id="forget">לא החדר הזה? פתח חדר חדש</button>`
        :`<button type="button" class="btn big" id="open">פתח חדר והזמן חבר</button><div class="or">או</div><label for="code">קוד חדר</label><input id="code" type="text" inputmode="latin" maxlength="6" dir="ltr" autocapitalize="characters" placeholder="ABC234" autocomplete="off" spellcheck="false"><button type="button" class="btn big alt" id="joinCode">הצטרף</button>`}</div>`}</main>`,el=>{
      el.querySelector('[data-back]').onclick=pickMine;el.querySelector('#swap').onclick=pickMine;if(off){el.querySelector('#cpu').onclick=()=>{S.mode='cpu';opponent()};return}
      const input=el.querySelector('#playerName3');input.addEventListener('input',()=>setName(input.value));const go=(host,code)=>{setName(input.value);room(host,code)};
      el.querySelector('#open')?.addEventListener('click',()=>go(true,newRoomCode()));el.querySelector('#join')?.addEventListener('click',()=>go(false,S.invite));
      el.querySelector('#forget')?.addEventListener('click',()=>{setInvite('');lobby()});
      const code=el.querySelector('#code');code?.addEventListener('input',()=>{code.value=cleanCode(code.value)});
      el.querySelector('#joinCode')?.addEventListener('click',()=>{const c=cleanCode(code.value);if(c.length!==6){code.focus();return toast('קוד חדר הוא שישה תווים')}setInvite(c);go(false,c)})})}
  function closeRoom(){if(S.room){try{S.room.close()}catch(e){}S.room=null}}
  function room(host,code){closeRoom();setInvite(code);const R={ended:null,rematch:null};
    const mine=()=>{const c=clubById(S.my);return {team:c.id,name:nameOrDefault(),hash:c.hash}};
    const paint=state=>{if(screen==='game')return;const my=clubById(S.my),link=inviteLink(code);
      const text={connecting:MSG.connecting,open:'החדר פתוח. שלח את הקישור לחבר — המשחק יתחיל כשהוא ייכנס.',joining:'מתחבר לחדר… ממתין לבעל החדר.',play:'מתחילים!'}[state]||'';
      show('room',top(host?'החדר שלך':'מצטרף לחדר',true)+`<main class="body center"><div class="vs-one">${crestOf(my)}<strong>${esc(my.name)}</strong><small>${esc(nameOrDefault())}</small></div>
        <div class="card"><p class="code" aria-label="קוד החדר"><bdi dir="ltr">${code}</bdi></p><p class="note" role="status">${text}</p>
        ${host&&state!=='connecting'?`<button type="button" class="btn big" id="share">שתף קישור הזמנה</button><input class="linkbox" dir="ltr" readonly value="${esc(link)}" aria-label="קישור הזמנה">`:'<div class="spinner" aria-hidden="true"></div>'}</div></main>`,el=>{
        el.querySelector('[data-back]').onclick=()=>{closeRoom();if(host)setInvite('');lobby()};
        el.querySelector('#share')?.addEventListener('click',async()=>{const data={title:'Penalty Hero',text:`${nameOrDefault()} מזמין אותך לדו־קרב פנדלים`,url:link};try{if(navigator.share){await navigator.share(data);return}}catch(e){if(e&&e.name==='AbortError')return}
          try{await navigator.clipboard.writeText(link);toast('הקישור הועתק')}catch(e){el.querySelector('.linkbox').select();toast('סמנו והעתיקו את הקישור')}})})};
    S.room=createRoom({connect:S.transport.connect,code,host,me:mine,catalog:getCatalog().version+'/'+RULES_VERSION,
      resolveTeam:async id=>{const c=clubById(id);if(!c)return null;try{await loadSquad(c.id);return c.hash}catch(e){return null}},
      on:{state:s=>{if(s==='alone'&&R.ended)R.ended.alone();else if(s!=='play'&&s!=='over')paint(s)},
        fail:message=>{const was=S.room;S.room=null;if(R.fail)return R.fail(message);if(was)lobby(message)},
        again:()=>{R.ended&&R.ended.peerWants()},
        start:async({a,b,first,mine:side})=>{const room=S.room;try{const [ca,cb]=[clubById(a.team),clubById(b.team)];const [sa,sb]=await Promise.all([loadSquad(ca.id),loadSquad(cb.id)]);if(S.room!==room)return;
            const A=buildSide(ca,sa,{participant:cleanName(a.name)||'שחקן'}),B=buildSide(cb,sb,{twin:cb.id===ca.id,participant:cleanName(b.name)||'שחקן'});
            game({sides:{a:A,b:B},me:side,first,net:room,R,exit:()=>{closeRoom();setInvite('');intro()}})}catch(e){console.error(e);closeRoom();lobby(MSG.version)}}}});
    paint('connecting')}


  /* ---------- more ways to play: cup, survival, the daily challenge, my numbers ---------- */
  const ROUNDS=['רבע גמר','חצי גמר','גמר'];
  const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';
  function statsScreen(){const st=S.stats,D=st.daily;
    const row=(k,v)=>`<div class="stat"><span>${k}</span><b>${v}</b></div>`;
    show('stats',top('הסטטיסטיקה שלי',true,'נשמרת בטלפון הזה בלבד')+`<main class="body"><div class="card statlist">
      ${row('דו־קרבים',st.played)}${row('ניצחונות',st.wins+' · '+pct(st.wins,st.played))}${row('רצף ניצחונות / שיא',st.streak+' / '+st.bestStreak)}
      ${row('בעיטות / שערים',st.shots+' / '+st.goals+' · '+pct(st.goals,st.shots))}${row('הצלות כששמרת',st.saves+' מתוך '+st.faced)}
      ${row('שיא הישרדות',st.survBest+' שערים')}${row('טורנירים: זכיות / ניסיונות',st.tourWins+' / '+st.tourPlayed)}
      ${row('אתגר יומי: רצף ימים / שיא',D.streak+' / '+D.best+' מתוך 5')}</div>
      <button type="button" class="link" id="reset">איפוס הסטטיסטיקה</button></main>`,el=>{el.querySelector('[data-back]').onclick=intro;
      el.querySelector('#reset').onclick=()=>{const b=el.querySelector('#reset');if(b.dataset.sure){S.stats=parseStats(null);saveStats();statsScreen()}else{b.dataset.sure='1';b.textContent='ללחוץ שוב כדי למחוק הכול';}}})}
  /* a cup: quarter-final, semi-final, final. Win the shoot-out to go on, lose and you are out. */
  function drawOpponents(myId){const my=clubById(myId),all=Object.values(getCatalog().clubs).filter(c=>c.id!==myId),used=new Set();
    const pick=t=>{const c=all.filter(x=>!used.has(x.id)).sort((a,b)=>Math.abs(a.str-t)-Math.abs(b.str-t)).slice(0,4);const o=c[Math.floor(Math.random()*c.length)];used.add(o.id);return o.id};
    return [pick(my.str-6),pick(my.str+2),pick(my.str+9)]}
  function tournament(T){const my=clubById(S.my);if(!my)return pickMine();T=T||{round:0,opps:drawOpponents(S.my)};S.mode='tour';
    const path=ROUNDS.map((r,i)=>{const c=clubById(T.opps[i]);return `<li class="${i<T.round?'done':i===T.round?'now':''}"><b>${r}</b><span>${esc(c.name)}</span><bdi>${c.str}</bdi></li>`}).join('');
    const op=clubById(T.opps[T.round]);
    show('cup',top('טורניר',true,ROUNDS[T.round])+`<main class="body center"><ol class="path">${path}</ol><div class="versus one"><div>${crestOf(my)}<strong>${esc(my.name)}</strong></div><b class="vs">נגד</b><div>${crestOf(op)}<strong>${esc(op.name)}</strong></div></div>
      <div class="card"><label for="playerName4">שם השחקן</label><input id="playerName4" type="text" maxlength="24" value="${esc(S.name)}" enterkeyhint="done" spellcheck="false"><button type="button" class="btn big" id="go">לנקודה הלבנה</button><p class="note">מנצחים בדו־קרב מעפילים לשלב הבא. מפסידים: הטורניר נגמר.</p></div></main>`,el=>{
      el.querySelector('[data-back]').onclick=intro;const input=el.querySelector('#playerName4');input.addEventListener('input',()=>setName(input.value));
      el.querySelector('#go').onclick=async()=>{setName(input.value);const b=el.querySelector('#go');b.disabled=true;b.textContent='טוען…';let sa,sb;
        try{[sa,sb]=await Promise.all([loadSquad(my.id),loadSquad(op.id)])}catch(e){b.disabled=false;b.textContent='לנקודה הלבנה';return toast('לא הצלחנו לטעון את הסגלים. בדקו את החיבור.')}if(screen!=='cup')return;
        const A=buildSide(my,sa,{participant:nameOrDefault()}),B=buildSide(op,sb,{twin:op.id===my.id,participant:'המחשב'});
        game({sides:{a:A,b:B},me:'a',first:Math.random()<.5?'a':'b',exit:intro,custom:{end(res,p,done){
          const last=T.round===2;if(res.won&&!last)return {good:true,title:'עלית לשלב הבא!',lines:[`${ROUNDS[T.round]}: ${res.score.a}:${res.score.b}`,`הבא: ${ROUNDS[T.round+1]} נגד ${esc(clubById(T.opps[T.round+1]).name)}`],buttons:[['next','לשלב הבא',()=>tournament({...T,round:T.round+1})],['home','יציאה',intro,'ghost']]};
          recordTournament(S.stats,res.won?3:T.round);saveStats();
          return res.won?{good:true,title:'אלופים! זכית בטורניר',lines:['שלושה דו־קרבים, שלושה ניצחונות'],buttons:[['again','טורניר חדש',()=>tournament()],['home','יציאה',intro,'ghost']]}
            :{good:false,title:'הודחת ב'+ROUNDS[T.round],lines:[`${res.score.a}:${res.score.b} נגד ${esc(op.name)}`],buttons:[['again','טורניר חדש',()=>tournament()],['home','יציאה',intro,'ghost']]}}}})}})}
  /* survival: one kick after another until the first miss; the keeper improves with every goal */
  async function survival(){const my=clubById(S.my);if(!my)return pickMine();S.mode='surv';
    show('surv',top('הישרדות',true)+`<main class="body center"><div class="vs-one">${crestOf(my)}<strong>${esc(my.name)}</strong></div>
      <div class="card"><p class="big">השיא שלך: <b>${S.stats.survBest}</b> שערים</p><p class="note">בועטים ברצף. החמצה אחת וזה נגמר. אחרי כל שער השוער משתפר, ומהשער השישי הסמן מהיר יותר.</p>
      <label for="playerName5">שם השחקן</label><input id="playerName5" type="text" maxlength="24" value="${esc(S.name)}" enterkeyhint="done" spellcheck="false"><button type="button" class="btn big" id="go">התחל</button></div></main>`,el=>{
      el.querySelector('[data-back]').onclick=intro;const input=el.querySelector('#playerName5');input.addEventListener('input',()=>setName(input.value));
      el.querySelector('#go').onclick=async()=>{setName(input.value);const b=el.querySelector('#go');b.disabled=true;b.textContent='טוען…';const op=similarOpponent(S.my);let sa,sb;
        try{[sa,sb]=await Promise.all([loadSquad(my.id),loadSquad(op.id)])}catch(e){b.disabled=false;b.textContent='התחל';return toast('לא הצלחנו לטעון את הסגלים. בדקו את החיבור.')}if(screen!=='surv')return;
        const A=buildSide(my,sa,{participant:nameOrDefault()}),B=buildSide(op,sb,{twin:op.id===my.id,participant:'המחשב'});const best=S.stats.survBest;
        game({sides:{a:A,b:B},me:'a',first:'a',exit:intro,runner:({arena,audio,hud,signal})=>runSurvival({arena,audio,sides:{a:A,b:B},hud,signal,best}),custom:{end(res){
          const record=recordSurvival(S.stats,res.goals);saveStats();return {good:res.goals>0,title:res.goals?`${res.goals} שערים ברצף`:'לא הבקעת הפעם',lines:[record&&res.goals?'שיא חדש!':`השיא שלך: ${S.stats.survBest}`],buttons:[['again','עוד ניסיון',survival],['home','יציאה',intro,'ghost']]}}}})}})}
  /* the daily challenge: the same keeper and the same dice for everybody today, five kicks */
  function dailySetup(key){const rng=makeRng('daily:'+key+':clubs'),all=Object.values(getCatalog().clubs).sort((a,b)=>a.id<b.id?-1:1);const my=all[Math.floor(rng()*all.length)];
    const near=all.filter(c=>c.id!==my.id).sort((a,b)=>Math.abs(a.str-my.str)-Math.abs(b.str-my.str)).slice(0,6);return {my,op:near[Math.floor(rng()*near.length)]}}
  function daily(){S.mode='daily';const key=dayKey(),{my,op}=dailySetup(key),done=S.stats.daily.scores[key],D=S.stats.daily;
    show('daily',top('אתגר יומי',true,key)+`<main class="body center"><div class="versus one"><div>${crestOf(my)}<strong>${esc(my.name)}</strong></div><b class="vs">נגד</b><div>${crestOf(op)}<strong>${esc(op.name)}</strong></div></div>
      <div class="card"><p class="note">חמש בעיטות. אותו שוער ואותם קוביות לכולם היום: רק הדיוק שלך קובע.</p>
      ${done!==undefined?`<p class="big">היום קיבלת <b>${done}</b> מתוך 5</p><p class="note">רצף ימים: ${D.streak} · שיא: ${D.best}</p><button type="button" class="btn big alt" id="go">תרגול (לא נספר)</button>`
        :`<p class="note">רצף ימים: ${D.streak} · שיא: ${D.best}</p><label for="playerName6">שם השחקן</label><input id="playerName6" type="text" maxlength="24" value="${esc(S.name)}" enterkeyhint="done" spellcheck="false"><button type="button" class="btn big" id="go">התחל את האתגר</button>`}</div></main>`,el=>{
      el.querySelector('[data-back]').onclick=intro;const input=el.querySelector('#playerName6');input?.addEventListener('input',()=>setName(input.value));
      el.querySelector('#go').onclick=async()=>{if(input)setName(input.value);const b=el.querySelector('#go');b.disabled=true;b.textContent='טוען…';let sa,sb;
        try{[sa,sb]=await Promise.all([loadSquad(my.id),loadSquad(op.id)])}catch(e){b.disabled=false;b.textContent='התחל';return toast('לא הצלחנו לטעון את הסגלים. בדקו את החיבור.')}if(screen!=='daily')return;
        const A=buildSide(my,sa,{participant:nameOrDefault()}),B=buildSide(op,sb,{participant:'המחשב'}),counts=done===undefined;
        game({sides:{a:A,b:B},me:'a',first:'a',exit:intro,runner:({arena,audio,hud,signal})=>runDaily({arena,audio,sides:{a:A,b:B},hud,signal,key}),custom:{end(res){
          if(counts){recordDaily(S.stats,key,res.goals);saveStats()}const row=res.marks.map(v=>v?'🟩':'⬛').join('');
          return {good:res.goals>=3,title:`${res.goals} מתוך 5`,lines:[row,counts?`רצף ימים: ${S.stats.daily.streak}`:'תרגול: לא נספר'],buttons:[...(counts?[['share','שתף את התוצאה',async()=>{const text=`Penalty Hero · אתגר יומי ${key}\n${row} ${res.goals}/5`;try{if(navigator.share)await navigator.share({text});else{await navigator.clipboard.writeText(text);toast('הועתק')}}catch(e){}},'alt',true]]:[]),['home','יציאה',intro,'ghost']]}}}})}})}

  /* ---------- 8: the duel ---------- */
  function game({sides,me,first,net=null,R=null,again=null,exit,runner=null,custom=null}){const other=me==='a'?'b':'a';let arena=null,ac=new AbortController(),over=false;
    const row=k=>`<div class="hud-row" data-side="${k}">${crestOf(sides[k].club)}<div class="hud-names"><strong>${esc(sides[k].club.short||sides[k].club.name)}</strong><small>${esc(sides[k].participant)}${k===me?' · אתה':''}</small></div><span class="marks" aria-hidden="true"></span><b class="score">0</b></div>`;
    show('game',`<div class="hud"><div class="hud-side"><button type="button" class="icon" id="quit" aria-label="יציאה מהדו־קרב">✕</button><button type="button" class="icon mute" data-mute aria-label="השתקה" aria-pressed="${audio.muted}">${audio.muted?'🔇':'🔊'}</button></div><div class="hud-rows">${row(me)}${row(other)}</div></div>
      <div class="arena" id="arena"></div><div class="who" id="who" aria-live="polite"></div><div class="panel" id="panel" hidden></div>`,el=>{
      const release=keepAwake();const guard=e=>{if(net&&!over){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',guard);
      arena=createArena(el.querySelector('#arena'),{debug,audio,force2d});if(debug)window.__ph={arena,sides,me,net};audio.bedOn();
      preloadFaces([sides.a,sides.b]);
      const hud={turn({turn,taker,keeper,iKick,takerSide,keeperSide}){for(const r of el.querySelectorAll('.hud-row'))r.classList.toggle('on',r.dataset.side===turn.side);
          const kit=kitsFor(takerSide,keeperSide).kit;   /* the face waits in the club's colour with the shirt number until the photograph is in */
          el.querySelector('#who').innerHTML=`<button type="button" class="face" data-pid="${esc(taker.id)}" style="--kit:${kit};--ink:${inkFor(kit)}" aria-label="תמונת ${esc(taker.he)}"><b>${taker.no}</b></button><div><strong>בועט: ${esc(taker.he)} <bdi class="no">${taker.no}</bdi></strong><small>בעיטה <bdi>${taker.shot}</bdi> · בשער: ${esc(keeper.he)} <bdi>${keeper.keep}</bdi></small></div><span class="role ${iKick?'kick':'keep'}">${iKick?'אתה בועט':'אתה בשער'}${turn.sudden?' · הכרעה':''}</span>`;
          loadFace(taker).then(f=>{const box=el.querySelector('#who .face');if(!f||!box||box.dataset.pid!==taker.id)return;const img=new Image();img.alt='';img.decoding='async';img.draggable=false;
            img.onload=()=>{if(box.isConnected&&box.dataset.pid===taker.id){box.append(img);box.classList.add('has')}};img.src=f.src;
            if(f.credit){box.title=`צילום: ${f.credit.author} · ${f.credit.license}`;box.onclick=()=>toast(`צילום: ${f.credit.author||'לא ידוע'}${f.credit.license?' · '+f.credit.license:''} · Wikimedia Commons`,3200)}})},
        last({iKick,result}){recordKick(S.stats,{iKick,how:result.how})},
        solo({marks,best,label,total}){const mine=el.querySelector(`.hud-row[data-side="${me}"]`),oth=el.querySelector(`.hud-row[data-side="${other}"]`);const goals=marks.filter(Boolean).length;
          const slots=total||Math.max(5,marks.length+1);mine.classList.add('on');oth.classList.remove('on');
          mine.querySelector('.marks').innerHTML=Array.from({length:slots},(_,i)=>`<i class="${marks[i]===1?'in':marks[i]===0?'no':''}"></i>`).join('');mine.querySelector('.score').textContent=goals;
          oth.querySelector('.marks').innerHTML='';oth.querySelector('.hud-names small').textContent=total?'אתגר יומי':'שיא אישי';oth.querySelector('.score').textContent=total?total:best||0},
        marks(duel){const sc=scoreOf(duel);for(const r of el.querySelectorAll('.hud-row')){const k=r.dataset.side;r.querySelector('.score').textContent=sc[k];r.querySelector('.marks').innerHTML=marksOf(duel,k).map(v=>`<i class="${v===1?'in':v===0?'no':''}"></i>`).join('');r.querySelector('.marks').setAttribute('aria-label',marksOf(duel,k).map(v=>v===1?'שער':v===0?'החמצה':'').filter(Boolean).join(', '))}}};
      hud.marks({kicks:{a:[],b:[]},log:[],winner:null,first});
      const stop=()=>{if(over)return;over=true;ac.abort();audio.stopAll()};
      const quit=()=>{stop();if(R)R.fail=null;exit()};
      el.querySelector('#quit').onclick=()=>{if(over)return quit();const p=el.querySelector('#panel');p.hidden=false;p.innerHTML=`<div class="end"><h2>לצאת מהדו־קרב?</h2><button type="button" class="btn big" id="stay">ממשיכים לשחק</button><button type="button" class="btn big alt" id="leave">יציאה למסך הפנדלים</button></div>`;
        p.querySelector('#stay').onclick=()=>{p.hidden=true;p.innerHTML=''};p.querySelector('#leave').onclick=quit};
      const vis=()=>{if(document.hidden){arena.pause();audio.suspend()}else{arena.resume();audio.resume()}};document.addEventListener('visibilitychange',vis);
      const failed=message=>{if(over)return;stop();const p=el.querySelector('#panel');p.hidden=false;p.innerHTML=`<div class="end bad"><h2>המשחק הופסק</h2><p>${esc(message)}</p><button type="button" class="btn big" id="home">חזרה למסך הפנדלים</button></div>`;p.querySelector('#home').onclick=()=>{if(R)R.fail=null;exit()}};
      if(R)R.fail=failed;
      (runner?runner({arena,audio,hud,signal:ac.signal}):runDuel({arena,audio,sides,me,first,net,hud,signal:ac.signal})).then(res=>{over=true;audio.bedOff();if(!runner){recordDuel(S.stats,{won:res.won});saveStats();if(res.won)audio.win();if(net)net.finish()}else saveStats();
        if(custom){const v=custom.end(res),p=el.querySelector('#panel');p.hidden=false;if(v.good&&runner)audio.win();p.innerHTML=`<div class="end ${v.good?'good':'bad'}"><h2>${esc(v.title)}</h2>${v.lines.map(l=>`<p class="note">${l}</p>`).join('')}${v.buttons.map(([id,label,fn,cls,keep])=>`<button type="button" class="btn ${cls==='ghost'?'ghost':cls==='alt'?'big alt':'big'}" data-act="${id}">${esc(label)}</button>`).join('')}</div>`;
          for(const b of v.buttons)p.querySelector(`[data-act="${b[0]}"]`).onclick=()=>{b[4]?b[2]():(over=true,b[2]())};return}
        const p=el.querySelector('#panel');p.hidden=false;const paintEnd=(status='')=>{p.innerHTML=`<div class="end ${res.won?'good':'bad'}"><h2>${res.won?'ניצחת בדו־קרב!':'הפסדת בדו־קרב'}</h2>
            <p class="final"><bdi>${esc(sides[me].club.short||sides[me].club.name)}</bdi> <span dir="rtl"><b>${res.score[me]}</b> : <b>${res.score[other]}</b></span> <bdi>${esc(sides[other].club.short||sides[other].club.name)}</bdi></p>
            ${status?`<p class="note" role="status">${esc(status)}</p>`:''}<button type="button" class="btn big" id="again">משחק חוזר</button><button type="button" class="btn big alt" id="swap">החלף קבוצה</button><button type="button" class="btn ghost" id="home">יציאה למסך הפנדלים</button></div>`;
          p.querySelector('#home').onclick=()=>{if(R)R.fail=null;exit()};
          p.querySelector('#again').onclick=()=>{if(!net)return again();net.again();paintEnd(net.theirAgain?'מתחילים…':'ביקשת משחק חוזר. ממתין ליריב…');p.querySelector('#again').disabled=true};
          p.querySelector('#swap').onclick=()=>{if(!net){S.mode='cpu';return pickMine()}picker({title:'החלף קבוצה',note:'החדר נשאר פתוח',back:()=>back2(),done:id=>{S.my=id;store.set('club',id);back2(true)}})}};
        const back2=ask=>{show('room',top('משחק חוזר',false)+`<main class="body center"><div class="vs-one">${crestOf(clubById(S.my))}<strong>${esc(clubById(S.my).name)}</strong></div><div class="card"><p class="note" role="status">${ask?'ממתין ליריב…':'החדר פתוח.'}</p>${ask?'<div class="spinner"></div>':'<button type="button" class="btn big" id="again2">משחק חוזר</button>'}<button type="button" class="btn ghost" id="home2">יציאה למסך הפנדלים</button></div></main>`,e2=>{
          e2.querySelector('#home2').onclick=()=>{R.fail=null;exit()};e2.querySelector('#again2')?.addEventListener('click',()=>{net.again();back2(true)})});if(ask)net.again()};
        if(R){R.ended={peerWants:()=>{if(screen==='game'&&!p.querySelector('#again')?.disabled)paintEnd('היריב רוצה משחק חוזר')},alone:()=>{if(screen==='game')paintEnd('היריב עזב את החדר')}};R.fail=m=>{if(screen==='game')paintEnd(m);else lobby(m)}}
        paintEnd(net&&net.theirAgain?'היריב רוצה משחק חוזר':'')},
        e=>{if(e&&e.name==='AbortError')return;console.error(e);failed(e&&e.message||'תקלה במשחק')});
      return()=>{over=true;ac.abort();release();window.removeEventListener('beforeunload',guard);document.removeEventListener('visibilitychange',vis);audio.stopAll();try{arena.dispose()}catch(e){}if(debug)window.__ph=null;if(R){R.ended=null}}})}

  /* ---------- start ---------- */
  show('boot',`<div class="boot"><img src="${ASSET('penalty-crest.webp')}" alt="" width="220" height="185"><p role="status">טוען…</p></div>`);
  /* While the player types a name and picks a club, the stadium is already on its way: the 3D code and the pictures
     the first kick needs are fetched now, so the duel opens without a long wait. Failures here are silent — the arena
     loads the same files itself and reports what is missing. */
  const warmUp=()=>{import('../../assets/penalties29/demo3d/preload.js').then(m=>m.preloadStadium()).catch(()=>{});import('../../assets/penalties29/demo3d/penalty.js').catch(()=>{})};
  const boot=()=>loadCatalog().then(()=>{if(S.my&&!clubById(S.my))S.my=null;intro();setTimeout(warmUp,400)},e=>{console.error(e);retry('לא הצלחנו לטעון את נתוני הקבוצות. בדקו את החיבור.',()=>{show('boot','<div class="boot"><p>טוען…</p></div>');boot()},()=>location.reload())});
  boot();
  return {state:S,go:{intro,pickMine,opponent,before,lobby}}}
