// The arena: the picture of the kick plus everything the finger does on it.
//   kicking  press and hold in the arena, drag the sight over the goal, release: one kick. The bar under the goal is
//            accuracy and power at once — release while the marker is in the white window.
//   keeping  pull the finger toward the corner to dive to, release to commit. No arrows on the screen.
// Pointer Events with capture; pointercancel never kicks; every listener and timer dies with the AbortSignal.
import {clamp,meterPosition,timingWindow,swayOf,swayAt,frameOf,dirFromPull,ZONE,DIRS,aiKick,makeRng} from '../core/rules.js';
const TOUCH_LIFT=56;                 // px: the sight rides above a finger so it is never hidden under it
const DIR_NAME={UL:'למעלה שמאלה',U:'למעלה',UR:'למעלה ימינה',L:'שמאלה',C:'להישאר באמצע',R:'ימינה',DL:'למטה שמאלה',D:'למטה',DR:'למטה ימינה'};
class Aborted extends Error{constructor(){super('aborted');this.name='AbortError'}}
/* a clock that counts only what was shown: a slow frame, or a tab that was away, adds a tenth of a second at most */
const shownClock=()=>{let last=performance.now(),ms=0;return {tick(){const n=performance.now();ms+=Math.min(100,Math.max(0,n-last));last=n;return ms},get ms(){return ms}}};

export function createArena(host,{debug=false,audio=null,force2d=false}={}){
  host.classList.add('game-arena');host.tabIndex=0;
  host.innerHTML=`<div class="ar-view"></div><div class="ar-load" role="status">טוען את האצטדיון…</div>
    <div class="ar-flash" aria-live="assertive"></div><div class="ar-hint" aria-live="polite"></div>
    <div class="ar-sight" hidden><b></b></div><div class="ar-target" hidden></div><svg class="ar-pull" hidden aria-hidden="true"><line/></svg>
    <div class="ar-meter" dir="ltr" hidden aria-label="מד דיוק ועוצמה"><span class="ar-window"></span><i class="ar-marker"></i><em>חלש</em><em>חזק</em></div>
    <div class="ar-timer" hidden aria-hidden="true"><i></i></div><div class="ar-a11y"></div>${debug?'<pre class="ar-debug" dir="ltr"></pre><div class="ar-zones"></div>':''}`;
  const $=s=>host.querySelector(s),view=$('.ar-view'),loadEl=$('.ar-load'),flashEl=$('.ar-flash'),hintEl=$('.ar-hint'),sight=$('.ar-sight'),target=$('.ar-target'),pull=$('.ar-pull'),meter=$('.ar-meter'),timer=$('.ar-timer'),a11y=$('.ar-a11y');
  let stage=null,disposed=false,flashT=0,debugT=0,lastInfo={};const rng=makeRng((Math.random()*2**32)>>>0);
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
    /** a short word above the goal, in the stand; never a panel over the play */
    flash(text,good){clearTimeout(flashT);const [,py]=stage?stage.toScreen(0,3.25):[0,90];flashEl.style.top=Math.max(8,py-34)+'px';flashEl.textContent=text;flashEl.className='ar-flash on '+(good?'good':'bad');flashT=setTimeout(()=>{flashEl.className='ar-flash'},1900)},
    /**
     * The user kicks. Resolves {aim:{x,y}, meter, auto}. timeMs: after it the kick is taken for him.
     */
    askKick({shotSkill,keeperSkill,timeMs=10000,signal}){const win=timingWindow(shotSkill,keeperSkill),amp=swayOf(shotSkill);
      return ask(signal,({on,finish,loop})=>{let aim={x:0,y:1.15},touched=false,pointer=null,heldAt=null;const ck=shownClock();
        meter.hidden=false;sight.hidden=false;timer.hidden=false;const w=meter.querySelector('.ar-window'),mk=meter.querySelector('.ar-marker');w.style.left=(win.from*100).toFixed(2)+'%';w.style.width=(win.width*100).toFixed(2)+'%';
        const cur=()=>{const s=swayAt(ck.ms/1000,amp);return {x:aim.x+s.dx,y:Math.max(.05,aim.y+s.dy)}};
        const pos=()=>heldAt===null?null:meterPosition(performance.now()-heldAt,win.speed);
        const fire=auto=>{let c=cur(),m=pos();if(auto&&!touched){const k=aiKick(shotSkill,rng);c=k.aim;m=k.meter}else if(m===null)m=aiKick(shotSkill,rng).meter;
          finish({aim:{x:+c.x.toFixed(2),y:+c.y.toFixed(2)},meter:+m.toFixed(3),auto:!!auto})};
        const setAim=e=>{const r=host.getBoundingClientRect();const [x,y]=stage.fromScreen(e.clientX-r.left,e.clientY-r.top-(e.pointerType==='touch'?TOUCH_LIFT:0));aim={x:clamp(x,-4.6,4.6),y:clamp(y,.12,3.2)};touched=true};
        on(host,'pointerdown',e=>{if(pointer!==null||e.button>0||e.target.closest('button'))return;e.preventDefault();pointer=e.pointerId;heldAt=performance.now();try{host.setPointerCapture(e.pointerId)}catch(x){}setAim(e);audio?.unlock()});
        on(host,'pointermove',e=>{if(e.pointerId===pointer){e.preventDefault();setAim(e)}});
        on(host,'pointerup',e=>{if(e.pointerId!==pointer)return;e.preventDefault();setAim(e);fire(false)});
        on(host,'pointercancel',e=>{if(e.pointerId===pointer){pointer=null;heldAt=null}});          // the system took the touch away: no kick
        on(host,'keydown',e=>{const k=e.key;if(k==='ArrowLeft')aim.x=clamp(aim.x-.3,-4.6,4.6);else if(k==='ArrowRight')aim.x=clamp(aim.x+.3,-4.6,4.6);else if(k==='ArrowUp')aim.y=clamp(aim.y+.22,.12,3.2);else if(k==='ArrowDown')aim.y=clamp(aim.y-.22,.12,3.2);
          else if(k===' '||k==='Enter'){if(!e.repeat&&heldAt===null)heldAt=performance.now()}else return;touched=true;e.preventDefault()});
        on(host,'keyup',e=>{if((e.key===' '||e.key==='Enter')&&heldAt!==null&&pointer===null){e.preventDefault();fire(false)}});
        a11y.innerHTML=DIRS.map(d=>`<button type="button" class="sr" data-k="${d}">בעיטה ${DIR_NAME[d].replace('להישאר באמצע','לאמצע')}</button>`).join('');
        on(a11y,'click',e=>{const b=e.target.closest('[data-k]');if(!b)return;const z=ZONE[b.dataset.k];aim={x:z[0]*1.1,y:z[1]};touched=true;fire(true)});
        loop(()=>{const left=1-ck.tick()/timeMs;timer.firstElementChild.style.transform=`scaleX(${Math.max(0,left).toFixed(3)})`;const m=pos();mk.style.left=((m??0)*100).toFixed(2)+'%';meter.classList.toggle('live',m!==null);meter.classList.toggle('in',m!==null&&m>=win.from&&m<=win.to);
          const c=cur();place(sight,c.x,c.y);sight.classList.toggle('out',frameOf(c.x,c.y)!=='in');if(left<=0)fire(true)});
        try{host.focus({preventScroll:true})}catch(e){}
        api._kick=(x,y,m)=>finish({aim:{x,y},meter:m,auto:false});   // tests
        return()=>{meter.hidden=sight.hidden=timer.hidden=true;meter.classList.remove('live','in');a11y.innerHTML='';api._kick=null;try{pointer!==null&&host.releasePointerCapture(pointer)}catch(e){}}})},
    /**
     * The user keeps goal. Resolves {d, auto}: committed on release after a pull; standing in the middle when time runs out.
     */
    askDive({timeMs=5000,signal}){return ask(signal,({on,finish,loop})=>{let from=null,pointer=null,cur=null;const ck=shownClock();const line=pull.firstElementChild;timer.hidden=false;
        const show=d=>{if(d===cur)return;cur=d;target.hidden=!d;if(d){place(target,...ZONE[d]);audio?.tap()}try{stage.hint(d)}catch(e){}};
        const local=e=>{const r=host.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top]};
        on(host,'pointerdown',e=>{if(pointer!==null||e.button>0||e.target.closest('button'))return;e.preventDefault();pointer=e.pointerId;from={x:e.clientX,y:e.clientY};const [x,y]=local(e);for(const k of ['x1','x2'])line.setAttribute(k,x);for(const k of ['y1','y2'])line.setAttribute(k,y);pull.hidden=false;try{host.setPointerCapture(e.pointerId)}catch(x){}audio?.unlock()});
        on(host,'pointermove',e=>{if(e.pointerId!==pointer)return;e.preventDefault();const [x,y]=local(e);line.setAttribute('x2',x);line.setAttribute('y2',y);const d=dirFromPull(e.clientX-from.x,e.clientY-from.y);if(d)show(d)});
        on(host,'pointerup',e=>{if(e.pointerId!==pointer)return;e.preventDefault();pointer=null;pull.hidden=true;if(cur)finish({d:cur,auto:false})});   // a tap without a pull chooses nothing
        on(host,'pointercancel',e=>{if(e.pointerId===pointer){pointer=null;pull.hidden=true}});
        on(host,'keydown',e=>{const k={ArrowLeft:'L',ArrowRight:'R',ArrowUp:'U',ArrowDown:'D'}[e.key];if(k){e.preventDefault();const col=k==='L'||k==='R'?k:(cur||'').replace(/[UD]/,''),row=k==='U'||k==='D'?k:(cur||'').replace(/[LRC]/g,'');show((row+col)||'C')}
          else if((e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();finish({d:cur||'C',auto:false})}});
        a11y.innerHTML=DIRS.map(d=>`<button type="button" class="sr" data-d="${d}">זינוק ${DIR_NAME[d]}</button>`).join('');
        on(a11y,'click',e=>{const b=e.target.closest('[data-d]');if(b)finish({d:b.dataset.d,auto:false})});
        loop(()=>{const left=1-ck.tick()/timeMs;timer.firstElementChild.style.transform=`scaleX(${Math.max(0,left).toFixed(3)})`;if(cur)place(target,...ZONE[cur]);if(left<=0)finish({d:cur||'C',auto:true})});
        try{host.focus({preventScroll:true})}catch(e){}
        api._dive=d=>finish({d,auto:false});
        return()=>{target.hidden=pull.hidden=timer.hidden=true;a11y.innerHTML='';api._dive=null;try{pointer!==null&&host.releasePointerCapture(pointer)}catch(e){}}})},
    /** Draw a resolved kick. Resolves when the keeper has landed and the taker reacts; a stuck picture cannot hang the duel. */
    play(result,{onContact,onResult,signal}={}){return new Promise((resolve,reject)=>{if(disposed||signal?.aborted)return reject(new Aborted());let done=false;
      const end=err=>{if(done)return;done=true;clearTimeout(t);signal?.removeEventListener('abort',abort);err?reject(err):resolve()};const abort=()=>end(new Aborted());signal?.addEventListener('abort',abort);
      const t=setTimeout(()=>end(),9000);let told=false;const result1=()=>{if(told)return;told=true;try{onResult&&onResult()}catch(e){console.error(e)}};
      try{stage.shoot(result,()=>{result1();end()},{contact:()=>{try{onContact&&onContact()}catch(e){}},result:result1})}catch(e){console.error(e);result1();end()}})},
    cheer(v){try{stage?.cheer(v)}catch(e){}},pause(){try{stage?.pause()}catch(e){}},resume(){try{stage?.resume()}catch(e){}},
    dispose(){if(disposed)return;disposed=true;clearTimeout(flashT);clearInterval(debugT);try{api._cancel&&api._cancel()}catch(e){}host.removeEventListener('contextmenu',stop);host.removeEventListener('selectstart',stop);host.removeEventListener('dragstart',stop);
      try{stage?.dispose()}catch(e){}stage=null;host.innerHTML='';host.classList.remove('game-arena')}};
  return api}
