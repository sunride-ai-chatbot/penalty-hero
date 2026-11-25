// The arena: the picture of the kick plus everything the finger does on it.
//   kicking  press and hold in the arena, drag the sight over the goal, release: one kick. The bar under the goal is
//            accuracy and power at once — release while the marker is in the white window.
//   keeping  touch the goal and drag: a ring follows the finger, a dotted line runs from the keeper to it; release to
//            commit to that part of the goal. No arrows and no icons on the screen.
// Pointer Events with capture; pointercancel never kicks; every listener and timer dies with the AbortSignal.
import {bowOf as bowOfPath} from '../core/gesture.js';
import {clamp,meterPosition,timingWindow,swayOf,swayAt,frameOf,zoneOf,pointOfDive,ZONE,DIRS,aiKick,makeRng} from '../core/rules.js';
const TOUCH_LIFT=56;                 // px: the sight rides above a finger so it is never hidden under it
const DIR_NAME={UL:'למעלה שמאלה',U:'למעלה',UR:'למעלה ימינה',L:'שמאלה',C:'להישאר באמצע',R:'ימינה',DL:'למטה שמאלה',D:'למטה',DR:'למטה ימינה'};
class Aborted extends Error{constructor(){super('aborted');this.name='AbortError'}}
/* a clock that counts only what was shown: a slow frame, or a tab that was away, adds a tenth of a second at most */
const shownClock=()=>{let last=performance.now(),ms=0;return {tick(){const n=performance.now();ms+=Math.min(100,Math.max(0,n-last));last=n;return ms},get ms(){return ms}}};

export function createArena(host,{debug=false,audio=null,force2d=false}={}){
  host.classList.add('game-arena');host.tabIndex=0;
  host.innerHTML=`<div class="ar-view"></div><div class="ar-load" role="status">טוען את האצטדיון…</div>
    <div class="ar-role" aria-live="assertive"></div><div class="ar-chip" hidden></div><div class="ar-flash" aria-live="assertive"></div><div class="ar-hint" aria-live="polite"></div>
    <div class="ar-sight" hidden><b></b></div><div class="ar-target" hidden></div><svg class="ar-pull" hidden aria-hidden="true"><line/></svg>
    <div class="ar-meter" dir="ltr" hidden aria-label="מד דיוק ועוצמה"><span class="ar-window"></span><i class="ar-marker"></i><em>חלש</em><em>חזק</em></div>
    <div class="ar-timer" hidden aria-hidden="true"><i></i></div><div class="ar-curl" hidden aria-live="polite"></div><div class="ar-replay" hidden><b>חזרה</b><span>גע כדי לדלג</span></div><div class="ar-pulse" aria-hidden="true"></div><div class="ar-a11y"></div>${debug?'<pre class="ar-debug" dir="ltr"></pre><div class="ar-zones"></div>':''}`;
  const $=s=>host.querySelector(s),view=$('.ar-view'),loadEl=$('.ar-load'),flashEl=$('.ar-flash'),hintEl=$('.ar-hint'),sight=$('.ar-sight'),target=$('.ar-target'),pull=$('.ar-pull'),meter=$('.ar-meter'),timer=$('.ar-timer'),a11y=$('.ar-a11y'),curlBtn=$('.ar-curl'),replayEl=$('.ar-replay');
  const CURL_TEXT={'0':'בעיטה ישרה','1':'עיקול ימינה ↷','-1':'עיקול שמאלה ↶'};
  let stage=null,disposed=false,flashT=0,roleT=0,debugT=0,lastInfo={},curlPref=0;const rng=makeRng((Math.random()*2**32)>>>0);
  const stop=e=>e.preventDefault();host.addEventListener('contextmenu',stop);host.addEventListener('selectstart',stop);host.addEventListener('dragstart',stop);
  async function build(opts){loadEl.hidden=false;loadEl.textContent='טוען את האצטדיון…';
    if(stage){try{stage.dispose()}catch(e){}stage=null}
    const flat=async()=>{const {createFlatStage}=await import('../render/flat-stage.js');return createFlatStage(view,opts)};
    try{if(force2d)stage=await flat();else{const {createPenaltyView}=await import('../../assets/penalties29/demo3d/penalty.js');
        stage=createPenaltyView(view,{...opts,onError:()=>{api.broken=true},onSlow:()=>{api.slow=true}})}}
    catch(e){console.warn('3D view unavailable, using the simple picture',e);stage=await flat()}
    const ok=await stage.ready;if(disposed)return false;
    if(!ok){loadEl.innerHTML='לא הצלחנו לטעון את השחקן המצולם. <button type="button" class="btn small">נסה שוב</button>';return new Promise(res=>{loadEl.querySelector('button').onclick=()=>res(build(opts))})}
    loadEl.hidden=true;if(debug&&!debugT)debugT=setInterval(showDebug,250);return true}
  function showDebug(){const el=$('.ar-debug');if(!el||!stage)return;const d=stage.debug();el.textContent=`${stage.kind} fps ${d.fps} | clip ${d.clip} frame ${d.frame} (contact ${d.contactFrame})\npower ${d.power??'-'} | keeper ${d.keeper} z ${d.keeperZ??'-'}\n${lastInfo.taker||''} | dive ${lastInfo.dive||'-'} | ${lastInfo.how||''}`;
    const z=$('.ar-zones');if(z&&!z.childElementCount)z.innerHTML=DIRS.map(d=>`<i data-z="${d}"></i>`).join('');for(const i of z?.children||[]){const [px,py]=stage.toScreen(...ZONE[i.dataset.z]);i.style.transform=`translate(${px}px,${py}px)`}}
  const place=(el,x,y)=>{const [px,py]=stage.toScreen(x,y);el.style.transform=`translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`};
  /* one question at a time: resolves once, cleans up always */
  function ask(signal,setup){return new Promise((resolve,reject)=>{if(disposed||signal?.aborted)return reject(new Aborted());const ac=new AbortController();let raf=0,settled=false;
    const finish=(v,err)=>{if(settled)return;settled=true;cancelAnimationFrame(raf);ac.abort();signal?.removeEventListener('abort',onAbort);cleanup();err?reject(err):resolve(v)};
    const onAbort=()=>finish(null,new Aborted());signal?.addEventListener('abort',onAbort);api._cancel=onAbort;
    const on=(el,ev,fn,o)=>el.addEventListener(ev,fn,{signal:ac.signal,passive:false,...o});
    let cleanup=()=>{};const loop=fn=>{const f=()=>{if(settled)return;fn();raf=requestAnimationFrame(f)};raf=requestAnimationFrame(f)};
    cleanup=setup({on,finish,loop})||(()=>{})})}

  const api={broken:false,slow:false,get stage(){return stage},get kind(){return stage?.kind},
    /** (re)build the picture for a kick; resolves when the taker's film and the stadium are on the GPU */
    async scene(opts){if(disposed)return false;if(!stage||api.broken){api.broken=false;return build(opts)}try{stage.reset(opts);return true}catch(e){return build(opts)}},
    hint(text){hintEl.textContent=text||''},info(o){lastInfo={...lastInfo,...o}},
    /**
     * Say, unmistakably, which of the two I am for this kick. Both phones show the same picture (the taker from behind),
     * so the role is spelled out three ways: a large banner as the kick opens, a coloured frame around the arena for
     * as long as the kick lasts, and a tag over the keeper naming who stands in goal.
     */
    role({iKick,keeperTag}){clearTimeout(roleT);host.classList.toggle('i-kick',!!iKick);host.classList.toggle('i-keep',!iKick);const el=$('.ar-role'),chip=$('.ar-chip');
      el.innerHTML=iKick?'<b>אתה בועט</b><span>החזק, כוון, שחרר באזור הלבן</span>':'<b>אתה בשער</b><span>גע בשער, גרור את העיגול ושחרר</span>';el.className='ar-role on '+(iKick?'kick':'keep');roleT=setTimeout(()=>{el.className='ar-role '+(iKick?'kick':'keep')},1100);
      chip.textContent=keeperTag||'';chip.className='ar-chip '+(iKick?'them':'me');chip.hidden=!keeperTag;if(stage&&keeperTag){const [px,py]=stage.toScreen(0,2.02);chip.style.transform=`translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`}},
    /** the kick is on its way: the tag over the keeper would only get in the way of the dive */
    roleOff(){$('.ar-chip').hidden=true},
    /** a short word above the goal, in the stand; never a panel over the play */
    flash(text,good){clearTimeout(flashT);const [,py]=stage?stage.toScreen(0,3.25):[0,90];flashEl.style.top=Math.max(8,py-34)+'px';flashEl.textContent=text;flashEl.className='ar-flash on '+(good?'good':'bad');flashT=setTimeout(()=>{flashEl.className='ar-flash'},1900)},
    /**
     * The user kicks. Resolves {aim:{x,y}, meter, auto}. timeMs: after it the kick is taken for him.
     */
    askKick({shotSkill,keeperSkill,pressure=0,timeMs=10000,signal}){const win=timingWindow(shotSkill,keeperSkill,pressure),amp=swayOf(shotSkill);
      return ask(signal,({on,finish,loop})=>{let aim={x:0,y:1.15},touched=false,pointer=null,heldAt=null;const ck=shownClock();
        meter.hidden=false;sight.hidden=false;timer.hidden=false;let path=[];/* the curve is the finger's own path: a clear bow to one side while aiming bends the kick that way */
        const bowOf=()=>bowOfPath(path);
        const paintCurl=()=>{curlPref=bowOf()};paintCurl();   // no label, no button: the curve is only the shape of the finger's path
        
        const w=meter.querySelector('.ar-window'),mk=meter.querySelector('.ar-marker');w.style.left=(win.from*100).toFixed(2)+'%';w.style.width=(win.width*100).toFixed(2)+'%';
        const cur=()=>{const s=swayAt(ck.ms/1000,amp);return {x:aim.x+s.dx,y:Math.max(.05,aim.y+s.dy)}};
        const pos=()=>heldAt===null?null:meterPosition(performance.now()-heldAt,win.speed);
        const fire=auto=>{let c=cur(),m=pos(),curl=auto?0:bowOf();if(auto&&!touched){const k=aiKick(shotSkill,rng);c=k.aim;m=k.meter;curl=k.curl||0}else if(m===null)m=aiKick(shotSkill,rng).meter;
          finish({aim:{x:+c.x.toFixed(2),y:+c.y.toFixed(2)},meter:+m.toFixed(3),curl,auto:!!auto})};
        const setAim=e=>{path.push({x:e.clientX,y:e.clientY});const r=host.getBoundingClientRect();const [x,y]=stage.fromScreen(e.clientX-r.left,e.clientY-r.top-(e.pointerType==='touch'?TOUCH_LIFT:0));aim={x:clamp(x,-4.6,4.6),y:clamp(y,.12,3.2)};touched=true};
        on(host,'pointerdown',e=>{if(pointer!==null||e.button>0||e.target.closest('button'))return;e.preventDefault();pointer=e.pointerId;heldAt=performance.now();try{host.setPointerCapture(e.pointerId)}catch(x){}setAim(e);audio?.unlock()});
        on(host,'pointermove',e=>{if(e.pointerId===pointer){e.preventDefault();setAim(e);paintCurl()}});
        on(host,'pointerup',e=>{if(e.pointerId!==pointer)return;e.preventDefault();setAim(e);paintCurl();fire(false)});
        on(host,'pointercancel',e=>{if(e.pointerId===pointer){pointer=null;heldAt=null;path=[];paintCurl()}});          // the system took the touch away: no kick
        on(host,'keydown',e=>{const k=e.key;if(k==='ArrowLeft')aim.x=clamp(aim.x-.3,-4.6,4.6);else if(k==='ArrowRight')aim.x=clamp(aim.x+.3,-4.6,4.6);else if(k==='ArrowUp')aim.y=clamp(aim.y+.22,.12,3.2);else if(k==='ArrowDown')aim.y=clamp(aim.y-.22,.12,3.2);
          else if(k===' '||k==='Enter'){if(!e.repeat&&heldAt===null)heldAt=performance.now()}else return;touched=true;e.preventDefault()});
        on(host,'keyup',e=>{if((e.key===' '||e.key==='Enter')&&heldAt!==null&&pointer===null){e.preventDefault();fire(false)}});
        a11y.innerHTML=DIRS.map(d=>`<button type="button" class="sr" data-k="${d}">בעיטה ${DIR_NAME[d].replace('להישאר באמצע','לאמצע')}</button>`).join('');
        on(a11y,'click',e=>{const b=e.target.closest('[data-k]');if(!b)return;const z=ZONE[b.dataset.k];aim={x:z[0]*1.1,y:z[1]};touched=true;fire(true)});
        loop(()=>{const left=1-ck.tick()/timeMs;timer.firstElementChild.style.transform=`scaleX(${Math.max(0,left).toFixed(3)})`;const m=pos();mk.style.left=((m??0)*100).toFixed(2)+'%';meter.classList.toggle('live',m!==null);meter.classList.toggle('in',m!==null&&m>=win.from&&m<=win.to);
          const c=cur();place(sight,c.x,c.y);sight.classList.toggle('out',frameOf(c.x,c.y)!=='in');if(left<=0)fire(true)});
        try{host.focus({preventScroll:true})}catch(e){}
        api._kick=(x,y,m,c=0)=>finish({aim:{x,y},meter:m,curl:c,auto:false});   // tests
        return()=>{curlBtn.hidden=true;meter.hidden=sight.hidden=timer.hidden=true;meter.classList.remove('live','in');a11y.innerHTML='';api._kick=null;try{pointer!==null&&host.releasePointerCapture(pointer)}catch(e){}}})},
    /**
     * The user keeps goal. Resolves {d:{x,y}, auto}: the point where the ring was released (the keeper goes exactly there); the middle when time runs out.
     */
    askDive({timeMs=5000,signal}){return ask(signal,({on,finish,loop})=>{let pointer=null,cur=null,aim=null;const ck=shownClock();const line=pull.firstElementChild;timer.hidden=false;
        // A ring on the goal follows the finger, with a dotted line from the keeper to it: that is where he will go.
        const draw=()=>{if(!aim){target.hidden=true;pull.setAttribute('hidden','');return}const [kx,ky]=stage.toScreen(0,.95),[tx,ty]=stage.toScreen(aim.x,aim.y);target.hidden=false;pull.removeAttribute('hidden');   /* an <svg> has no .hidden property */target.style.transform=`translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px)`;
          line.setAttribute('x1',kx);line.setAttribute('y1',ky);line.setAttribute('x2',tx);line.setAttribute('y2',ty)};
        const set=(x,y)=>{aim={x:clamp(x,-3.5,3.5),y:clamp(y,.15,2.3)};const d=zoneOf(aim.x,aim.y);if(d!==cur){cur=d;audio?.tap();try{stage.hint(d)}catch(e){}}draw()};
        const point=e=>{const r=host.getBoundingClientRect();const [x,y]=stage.fromScreen(e.clientX-r.left,e.clientY-r.top-(e.pointerType==='touch'?TOUCH_LIFT:0));set(x,y)};
        on(host,'pointerdown',e=>{if(pointer!==null||e.button>0||e.target.closest('button'))return;e.preventDefault();pointer=e.pointerId;try{host.setPointerCapture(e.pointerId)}catch(x){}point(e);audio?.unlock()});
        on(host,'pointermove',e=>{if(e.pointerId!==pointer)return;e.preventDefault();point(e)});
        on(host,'pointerup',e=>{if(e.pointerId!==pointer)return;e.preventDefault();pointer=null;point(e);finish({d:pointOfDive(aim),auto:false})});   // released: committed
        on(host,'pointercancel',e=>{if(e.pointerId===pointer)pointer=null});                                                        // the system took the touch: nothing is chosen
        on(host,'keydown',e=>{const a=aim||{x:0,y:1.2};if(e.key==='ArrowLeft')set(a.x-2.6,a.y);else if(e.key==='ArrowRight')set(a.x+2.6,a.y);else if(e.key==='ArrowUp')set(a.x,a.y+.75);else if(e.key==='ArrowDown')set(a.x,a.y-.75);
          else if((e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();return finish({d:pointOfDive(aim||{x:0,y:1.2}),auto:false})}else return;e.preventDefault()});
        a11y.innerHTML=DIRS.map(d=>`<button type="button" class="sr" data-d="${d}">זינוק ${DIR_NAME[d]}</button>`).join('');
        on(a11y,'click',e=>{const b=e.target.closest('[data-d]');if(b)finish({d:pointOfDive(b.dataset.d),auto:false})});
        loop(()=>{const left=1-ck.tick()/timeMs;timer.firstElementChild.style.transform=`scaleX(${Math.max(0,left).toFixed(3)})`;draw();if(left<=0)finish({d:pointOfDive(aim||{x:0,y:1.2}),auto:true})});
        try{host.focus({preventScroll:true})}catch(e){}
        api._dive=d=>finish({d:pointOfDive(d),auto:false});   // tests: a zone name or a point
        return()=>{target.hidden=timer.hidden=true;pull.setAttribute('hidden','');a11y.innerHTML='';api._dive=null;try{pointer!==null&&host.releasePointerCapture(pointer)}catch(e){}}})},
    /** the deciding kick, or sudden death: a slow red pulse at the edges of the picture */
    pressure(v){host.classList.toggle('pressure',!!v)},
    /** Draw a resolved kick. Resolves when the keeper has landed and the taker reacts; a stuck picture cannot hang the duel. */
    play(result,{onContact,onResult,signal}={}){return new Promise((resolve,reject)=>{if(disposed||signal?.aborted)return reject(new Aborted());let done=false;
      const end=err=>{if(done)return;done=true;clearTimeout(t);signal?.removeEventListener('abort',abort);err?reject(err):resolve()};const abort=()=>end(new Aborted());signal?.addEventListener('abort',abort);
      const t=setTimeout(()=>end(),9000);let told=false;const result1=()=>{if(told)return;told=true;try{onResult&&onResult()}catch(e){console.error(e)}};
      try{stage.shoot(result,()=>{result1();end()},{contact:()=>{try{onContact&&onContact()}catch(e){}},result:result1})}catch(e){console.error(e);result1();end()}})},
    /**
     * The replay of the kick that ended the shoot-out, from the side of the goal at half speed. A tap skips it; it never outlasts 7 s.
     * Resolves when it is over. A picture without replay (the simple 2D view) resolves at once.
     */
    replay(result,{signal}={}){return new Promise(resolve=>{if(disposed||signal?.aborted||!stage||typeof stage.replay!=='function')return resolve();let done=false;
      const end=()=>{if(done)return;done=true;clearTimeout(t);signal?.removeEventListener('abort',end);host.removeEventListener('pointerdown',skip,true);host.classList.remove('replaying');replayEl.hidden=true;try{stage.skipReplay&&stage.skipReplay()}catch(e){}resolve()};
      const skip=e=>{e.preventDefault();e.stopPropagation();end()};const t=setTimeout(end,11000);signal?.addEventListener('abort',end);
      host.addEventListener('pointerdown',skip,true);host.classList.add('replaying');replayEl.hidden=false;
      try{stage.replay(result,end)}catch(e){console.error(e);end()}})},
    /** The scorer's team runs in and hugs after the deciding goal. A tap skips it; never longer than 9 s. Resolves when it is over (at once without the 3D picture). */
    celebrate({signal,goal=true}={}){return new Promise(resolve=>{if(disposed||signal?.aborted||!stage||typeof stage.celebrate!=='function')return resolve();let done=false;
      const end=()=>{if(done)return;done=true;clearTimeout(t);signal?.removeEventListener('abort',end);host.removeEventListener('pointerdown',skip,true);try{stage.skipCelebration&&stage.skipCelebration()}catch(e){}host.removeAttribute('data-celebrating');resolve()};
      const skip=e=>{e.preventDefault();e.stopPropagation();end()};const t=setTimeout(end,9000);signal?.addEventListener('abort',end);host.addEventListener('pointerdown',skip,true);
      host.setAttribute('data-celebrating','1');try{stage.celebrate(end,{goal})}catch(e){console.error(e);end()}})},
    cheer(v){try{stage?.cheer(v)}catch(e){}},pause(){try{stage?.pause()}catch(e){}},resume(){try{stage?.resume()}catch(e){}},
    dispose(){if(disposed)return;disposed=true;host.classList.remove('pressure','replaying');clearTimeout(flashT);clearTimeout(roleT);host.classList.remove('i-kick','i-keep');clearInterval(debugT);try{api._cancel&&api._cancel()}catch(e){}host.removeEventListener('contextmenu',stop);host.removeEventListener('selectstart',stop);host.removeEventListener('dragstart',stop);
      try{stage?.dispose()}catch(e){}stage=null;host.innerHTML='';host.classList.remove('game-arena')}};
  return api}
