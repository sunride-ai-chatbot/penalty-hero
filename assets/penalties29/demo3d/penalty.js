import * as T from './vendor/three.js';
import {filmedTaker} from './filmed-taker.js';
import {keeperFilm} from './keeper-film.js';
import {buildWorld,animateNet} from './world.js';
import {makeRosterPlayer,posePlayer,makeBall,applyStrike} from './actors.js';
import './preload.js';   // turns on the shared image cache before anything is loaded

// The penalty picture. Presentation only: it is told where the ball goes, what the keeper does and how the kick ends
// (src/core/rules.js decided all of it) and draws that. No game state, no persistence, no random outcome.
// One picture for every kick: from behind and above the taker. Goal coordinates as in the rules: x metres from the
// middle of the goal, positive = right of the picture, y metres above the grass. In the world the pitch runs along
// world-X (goal line at 52.5), height is world-Y and the goal's own x is world-Z.
const GX=52.5,SPOT=41.5,KEEP_X=52.2,BALL_R=.145;
const CAM={x:35.3,y:3.2,z:-.5,lookZ:.06,goalHalf:4.3};
const APPROACH=1.25,FOLLOW=1.15;                       // seconds: run-up to contact, contact to the end of the filmed motion
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=u=>1-Math.pow(1-u,2),smooth=u=>u*u*(3-2*u);

export function createPenaltyView(host,opts={}){
  const wrap=document.createElement('div');wrap.className='pg-3d';host.prepend(wrap);
  let renderer,world,ball,observer,raf=0,disposed=false,keeper=null,taker=null,clock=0,last=0,paused=false;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1,.1,320),ray=new T.Raycaster(),v3=new T.Vector3(),v2=new T.Vector2();
  let film=null,kf=null,pf=null,celeb=null,shot=null,act=null,netT=-1,netZ=0,netAmp=1,netY=1.2,caughtAt=null,fps={n:0,t:0,value:0};
  // effects: slow motion on a goal, a freeze on contact with the frame, camera shake, a push in; and the replay camera
  const fx={scale:1,slow:null,stop:0,shake:0,punch:0,live:false},camBase={pos:new T.Vector3(),quat:new T.Quaternion(),fov:50},tq=new T.Quaternion(),te=new T.Euler();
  let rep=false,repDone=null,lefty=false,repPhase='run';
  const gloveL=new T.Vector3(),gloveR=new T.Vector3(),hold=new T.Vector3();
  // can this device draw the scene? After a warm-up, 1.2 seconds of frames are timed; under ten a second the game is told once.
  const perf={t:0,n:0,from:0,skip:false,done:false};
  const onVis=()=>{perf.skip=true;if(!document.hidden){last=performance.now();if(!raf&&!disposed&&!paused)raf=requestAnimationFrame(frame)}};document.addEventListener('visibilitychange',onVis);
  function measure(now,gap){if(!perf.from){perf.from=now;return}if(now-perf.from<900)return;if(perf.skip||document.hidden||gap>5000){perf.skip=false;return}
    perf.t+=gap;perf.n++;if(perf.t<1200)return;perf.done=true;if(perf.n*1000/perf.t<10){try{opts.onSlow&&opts.onSlow()}catch(e){}}}
  // keeper: wait → set (prepare) → read (ball struck, still on his feet) → dive (committed, one direction) → land → down
  const K={state:'wait',t:0,z:0,dive:0,side:0,row:1,lift:0,landing:0,sway:1,crouch:0,kz:0,delay:.2,dur:.4,handY:1.15};
  const B={x:SPOT,y:BALL_R,z:0,spin:0};
  const liftFor=h=>h<1.15?clamp((h-.35)/.8)*.14:.14+clamp((h-1.15)/.8)*.32;   // how high the body rises for hands at height h
  const RUN={x:SPOT-1.65,z:-.52};
  const R={x:RUN.x,z:RUN.z,speed:0,phase:0,strike:-1};
  function disposeObject(object){const geometries=new Set(),materials=new Set(),textures=new Set();
    object.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.skeleton)o.skeleton.dispose();for(const m of (Array.isArray(o.material)?o.material:o.material?[o.material]:[])){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v)}});
    textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}
  function drop(a){if(!a)return;scene.remove(a.group,a.shadow);disposeObject(a.group);disposeObject(a.shadow)}
  function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);raf=0;observer?.disconnect();document.removeEventListener('visibilitychange',onVis);act=null;shot=null;
    film?.dispose();kf?.dispose();pf?.dispose();world?.crowdVideo?.dispose();disposeObject(scene);renderer?.dispose();try{renderer?.forceContextLoss()}catch(e){}wrap.remove()}
  function fail(e){if(disposed)return;dispose();try{opts.onError&&opts.onError(e)}catch(x){}}
  function cast(o){
    drop(keeper);drop(taker);
    keeper=makeRosterPlayer(scene,{slot:'GK',side:1,number:o.gkNumber||1,kit:o.gkKit||'#f2b233',trim:'#10151d',pid:'k',team:'k',name:o.gkName||''},0);
    taker=makeRosterPlayer(scene,{slot:'FW',side:0,number:o.number??'',kit:o.kit||'#c6f24e',trim:o.trim||'#10151d',pid:'t',team:'t',name:o.name||''},1);
    try{world.setMood(o.mood)}catch(e){}lefty=!!o.left;if(film)film.flip=lefty;   // a left-footed taker: the same footage mirrored, the camera mirrored with it (the print on the shirt stays upright)
    film?.identify(o);kf?.identify(o.gkKit,o.gkTrim||'#10151d');pf?.identify(o.kit||'#fbd21b',o.trim||'#204a9e');try{world.crowd.dress(o.kit||'#c6f24e',o.oppKit||'#e9edf2')}catch(e){}
  }
  function saveCamera(){camBase.pos.copy(camera.position);camBase.quat.copy(camera.quaternion);camBase.fov=camera.fov}
  function frameCamera(){const w=wrap.clientWidth||1,h=wrap.clientHeight||1;camera.aspect=w/h;
    if(rep&&repPhase==='run'){   // the replay, first half: the run-up and the strike from behind and to the side, then it cuts to the goal
      camera.position.set(SPOT-6.4,1.5,3.7);camera.fov=T.MathUtils.radToDeg(clamp(2*Math.atan(Math.tan(Math.atan(2.6/6.9))/camera.aspect),T.MathUtils.degToRad(34),T.MathUtils.degToRad(70)));
      camera.lookAt(SPOT+.4,1.25,-.45);camera.updateProjectionMatrix();saveCamera();return}
    if(rep){   // the replay, second half: from the side of the goal mouth, close to the line, looking at the keeper and the net
      const cx=GX-6.8,cz=6.6,dist=Math.hypot(GX-cx,cz);camera.position.set(cx,1.5,cz);camera.fov=T.MathUtils.radToDeg(clamp(2*Math.atan(Math.tan(Math.atan(6.2/dist))/camera.aspect),T.MathUtils.degToRad(34),T.MathUtils.degToRad(78)));
      camera.lookAt(GX,.4,-.4);camera.updateProjectionMatrix();saveCamera();return}
    const sg=lefty?-1:1;camera.position.set(CAM.x,CAM.y,CAM.z*sg);
    // The lens is as long as the stage allows while (1) the whole goal mouth fits across and (2) the picture reaches from the
    // taker's boots at the start of his run to the stand above the bar. Then the camera tilts so the boots sit on the bottom edge.
    const across=2*Math.atan(Math.tan(Math.atan(CAM.goalHalf/(GX-CAM.x)))/camera.aspect),feet=Math.atan(CAM.y/(RUN.x-.55-CAM.x)),stand=T.MathUtils.degToRad(6.5);
    const fov=clamp(Math.max(across,feet+stand,T.MathUtils.degToRad(camera.aspect>1.3?34:40)),T.MathUtils.degToRad(30),T.MathUtils.degToRad(64));
    const pitch=Math.max(T.MathUtils.degToRad(4),feet-fov/2);camera.fov=T.MathUtils.radToDeg(fov);camera.lookAt(GX,CAM.y-Math.tan(pitch)*(GX-CAM.x),CAM.lookZ*sg);camera.updateProjectionMatrix();saveCamera()}
  function resize(){if(disposed)return;const w=wrap.clientWidth,h=wrap.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);frameCamera();draw()}
  function stepKeeper(dt){K.t+=dt;
    if(K.state==='wait'){K.sway=Math.min(1,K.sway+dt*2)}
    else if(K.state==='set'){K.sway=Math.max(.25,K.sway-dt*1.2);K.crouch=Math.min(1,K.crouch+dt*2.2)}
    else if(K.state==='read'){K.sway=Math.max(0,K.sway-dt*6);K.crouch=1;if(K.t>=K.delay){K.state='dive';K.t=0}}   // committed here: side and height never change again
    else if(K.state==='dive'){const k=clamp(K.t/K.dur),e=ease(k);K.crouch=1-e;K.z=K.kz*e;K.dive=K.side?e:0;
      K.lift=K.side?liftFor(K.handY):(K.row===2?Math.sin(k*Math.PI)*.42:0);if(!K.side&&K.row===0)K.crouch=1;
      if(k>=1){K.state='land';K.t=0}}
    else if(K.state==='land'){const f=clamp(K.t/.38);K.landing=K.side?f*f:0;if(K.side)K.z=K.kz+K.side*.20*ease(clamp(K.t/.48));else K.lift=0;if(K.t>=.6){K.state='down';K.t=0}}
  }
  // the filmed keeper: the game's own state decides which clip and which frame. A dive runs the clip up to its "split" (arms fully out) while he
  // commits, then the rest while he lands; a jump on the spot likewise. The clip is chosen by the height of the hands: low, middle or high.
  const IDLE_N=36;
  function keeperPicture(){
    const s=K.state,t=K.t,k=clamp(t/(K.dur||.4)),sway=Math.sin(clock*2.6)*.38*K.sway;
    const going=s==='dive'||s==='land'||s==='down',side=K.side||0,conceded=shot&&shot.r&&shot.r.how==='goal';
    let clip='idle',f=0,reach=0,lift=0,z=K.z+sway;
    const run=(c)=>{const n=kf.count(c),sp=kf.split(c);return s==='dive'?k*sp:s==='land'?sp+clamp(t/.6)*(n-1-sp):n-1};
    if(going&&side){clip=K.handY<.8?'diveLow':K.handY>1.5?'diveHigh':'dive';f=run(clip);reach=clamp(f/kf.split(clip));z=K.z+side*.4*reach;lift=(K.handY-({diveLow:.45,dive:1.15,diveHigh:1.9})[clip])*.4*(1-(K.landing||0))}
    else if(s==='down'&&conceded){clip='sad';f=Math.min(kf.count('sad')-1,t*10);z=K.z}
    else if(going&&K.row===2){clip='centre';f=run(clip)}
    else{const j=Math.floor(clock*10)%(2*(IDLE_N-1));f=j<IDLE_N?j:2*(IDLE_N-1)-j}
    kf.pose({clip,f,x:KEEP_X,z,side:side>0?1:-1,reach,lift,face:rep?{x:camera.position.x,z:camera.position.z}:null});
  }
  function poseKeeper(t){
    const b=keeper.bones,n=keeper.names;const sway=Math.sin(t*2.6)*.38*K.sway;
    posePlayer(keeper,{x:KEEP_X,z:K.z+sway,angle:-Math.PI/2,speed:0,kick:0,dive:0,celebrate:0,keeper:true},t);
    if(K.crouch>0&&!K.dive){const c=K.crouch;b[n.hips].position.y-=.07*c;b[n.Lthigh].rotation.x-=.16*c;b[n.Rthigh].rotation.x-=.16*c;b[n.Lshin].rotation.x+=.26*c;b[n.Rshin].rotation.x+=.26*c;b[n.Larm].rotation.z+=.22*c;b[n.Rarm].rotation.z-=.22*c}
    if(K.state==='dive'||K.state==='land'||K.state==='down'){
      if(K.side){const d=K.dive,s=K.side;  // he faces the taker, so his left hand is on the picture's right: the lean follows the side he goes to
        const airborneHip=.9-.3*d+K.lift*d;
        b[n.hips].rotation.z=-s*d*(1.2+.29*K.landing);b[n.hips].position.y=airborneHip+(.24-airborneHip)*K.landing;
        b[n.Larm].rotation.z=s>0?-1.5*d:2.1*d;b[n.Rarm].rotation.z=s>0?-2.1*d:1.5*d;b[n.Lfore].rotation.x=-.15;b[n.Rfore].rotation.x=-.15;b[n.Lthigh].rotation.x=-.25;b[n.Rthigh].rotation.x=.15}
      else if(K.row===2){const u=K.state==='dive'?ease(clamp(K.t/K.dur)):Math.max(0,1-K.t/.3);b[n.hips].position.y+=K.lift;b[n.Larm].rotation.z=.34+2.3*u;b[n.Rarm].rotation.z=-.34-2.3*u;b[n.Lfore].rotation.x=-.1;b[n.Rfore].rotation.x=-.1}
      else if(K.row===0){const u=K.state==='dive'?ease(clamp(K.t/K.dur)):1;b[n.hips].position.y-=.30*u;b[n.Lthigh].rotation.x-=.5*u;b[n.Rthigh].rotation.x-=.5*u;b[n.Lshin].rotation.x+=.9*u;b[n.Rshin].rotation.x+=.9*u;b[n.spine].rotation.x+=.35*u;b[n.Larm].rotation.z=.2;b[n.Rarm].rotation.z=-.2;b[n.Larm].rotation.x=-.6*u;b[n.Rarm].rotation.x=-.6*u}
      else{const u=K.state==='dive'?ease(clamp(K.t/K.dur)):1;b[n.Larm].rotation.x=-.9*u;b[n.Rarm].rotation.x=-.9*u;b[n.Lfore].rotation.x=-.5;b[n.Rfore].rotation.x=-.5}
    }
  }
  /* a hesitation in the run-up: the last strides slow to a quarter of their speed, then he goes. The same footage, only the time along it bends. */
  const runShape=(u,stutter)=>{if(!stutter)return u;const s1=1/.8125;return u<=.55?u*s1:u<=.8?(.55+(u-.55)*.25)*s1:(.6125+(u-.8))*s1};
  function clipTime(){if(!shot)return 0;if(shot.contactAt===null)return film.contact*runShape(clamp((clock-shot.start)/shot.approach),shot.stutter);
    return film.contact+Math.min(film.duration-film.contact,(clock-shot.contactAt)*(film.duration-film.contact)/FOLLOW)}
  function shakeCamera(){const on=fx.shake>.0006||fx.punch>.01;if(!on&&!fx.live)return;fx.live=on;
    if(!on){camera.position.copy(camBase.pos);camera.quaternion.copy(camBase.quat);if(camera.fov!==camBase.fov){camera.fov=camBase.fov;camera.updateProjectionMatrix()}return}
    const a=fx.shake,c=clock;camera.position.set(camBase.pos.x+Math.sin(c*61)*a*.6,camBase.pos.y+Math.sin(c*53+1)*a*.5,camBase.pos.z+Math.sin(c*47+2)*a*.8);
    te.set(Math.sin(c*57)*a*.04,Math.sin(c*43+1)*a*.05,Math.sin(c*39)*a*.03);tq.setFromEuler(te);camera.quaternion.copy(camBase.quat).multiply(tq);
    const f=camBase.fov-fx.punch;if(Math.abs(camera.fov-f)>.01){camera.fov=f;camera.updateProjectionMatrix()}}
  function fxStep(dt){if(fx.stop>0){fx.stop-=dt}
    if(fx.slow){const w=fx.slow;w.t+=dt;fx.scale=w.t<w.hold?w.min:w.min+(1-w.min)*clamp((w.t-w.hold)/w.rec);if(w.t>=w.hold+w.rec){fx.slow=null;fx.scale=1}}
    fx.shake*=Math.exp(-dt*8);fx.punch*=Math.exp(-dt*5);if(fx.shake<.0004)fx.shake=0;if(fx.punch<.005)fx.punch=0}
  const slowmo=(min,hold,rec)=>{if(rep)return;fx.slow={min,hold,rec,t:0};fx.scale=min};
  const hitstop=sec=>{if(!rep)fx.stop=Math.max(fx.stop,sec)};
  const bump=(shake,punch)=>{fx.shake=Math.max(fx.shake,shake);fx.punch=Math.max(fx.punch,punch)};
  const timeScale=()=>rep?.5:fx.stop>0?.04:fx.scale;
  function draw(){
    if(disposed||document.hidden)return;
    poseKeeper(clock);
    if(kf?.ready&&!document.documentElement.hasAttribute('data-keeper3d')){keeperPicture();keeper.group.visible=false;if(keeper.shadow)keeper.shadow.visible=false}else kf?.hide();
    posePlayer(taker,{x:R.x,z:R.z,angle:Math.PI/2,speed:R.speed,kick:0,dive:0,celebrate:0,keeper:false,phase:R.speed?R.phase:undefined},clock);
    const filmed=!!film?.loaded,replaying=rep;
    if(celeb){const t=clock-celeb.start,RUN_FPS=14,HUG_FPS=12,nr=pf.count('run'),runT=nr/RUN_FPS;
      if(t<runT)pf.pose({clip:'run',f:t*RUN_FPS,x:SPOT+2.2,z:-.1,side:-1});else pf.pose({clip:'hug',f:Math.min(pf.count('hug')-1,(t-runT)*HUG_FPS),x:SPOT+2.2,z:-.1,side:-1});
      if(t>runT+3.4&&!celeb.over){celeb.over=true;const d=celeb.done;celeb=null;pf.hide();d&&d()}}
    const afterContact=!!shot&&shot.contactAt!==null;
    if(replaying&&film&&afterContact)film.hide();
    if(celeb)film?.hide();else if(filmed&&(!replaying||!afterContact)){film.face=replaying?camera.position:null;const reacting=shot&&shot.reactAt!==null;film.pose(clipTime(),R.x+.28*clamp((R.x-RUN.x)/(SPOT-.28-RUN.x)),0,reacting?shot.reaction:null,reacting?clock-shot.reactAt:0)}
    taker.group.visible=taker.shadow.visible=!filmed&&!replaying;
    
    if(caughtAt!==null){   // a caught ball travels into the gloves and stays in them while he lands
      keeper.group.updateMatrixWorld(true);keeper.bones[keeper.names.Lhand].getWorldPosition(gloveL);keeper.bones[keeper.names.Rhand].getWorldPosition(gloveR);
      gloveL.add(gloveR).multiplyScalar(.5);gloveL.x-=.12;hold.lerpVectors(caughtAt.point,gloveL,smooth(clamp((clock-caughtAt.time)/.16)));
      B.x=hold.x;B.y=Math.max(BALL_R,hold.y);B.z=hold.z}
    ball.ball.position.set(B.x,B.y,B.z);const travel=B.x-SPOT;ball.ball.rotation.set(travel*.25,B.spin||0,-travel*.6);   // no spin while it rests on the spot
    const clearance=Math.max(0,B.y-BALL_R);                                                                    // the shadow stays on the grass, further and fainter as the ball rises
    ball.shadow.position.set(B.x+clearance*.82,.03,B.z-clearance*.45);ball.shadow.scale.setScalar(1+.18*clearance);ball.shadow.material.opacity=.7/(1+.6*clearance);
    if(netT>=0)animateNet(world.goals[1],netT,netZ,netAmp,netY);
    shakeCamera();
    if(R.strike>=0&&!filmed)applyStrike(taker,R.strike);
    renderer.render(scene,camera);
  }
  function advance(dt){clock+=dt;if(netT>=0)netT+=dt;
    if(world&&world.crowd){world.crowd.time=clock;world.crowd.decay(dt)}
    stepKeeper(dt);
    if(shot&&shot.reactAt===null&&shot.reaction&&shot.contactAt!==null&&clock-shot.contactAt>=FOLLOW)shot.reactAt=clock;   // the reaction follows the filmed motion, never cuts into it
    if(act){act.t+=dt;const u=clamp(act.t/act.dur);act.step(u,act.t);if(u>=1){const a=act;act=null;a.done&&a.done()}}}
  function frame(now){raf=0;if(disposed||paused)return;try{
    const gap=now-last;if(!perf.done)measure(now,gap);last=now;fps.n++;fps.t+=gap;if(fps.t>=500){fps.value=Math.round(fps.n*1000/fps.t);fps.n=fps.t=0}
    const dt0=clamp(gap/1000,0,.05);fxStep(dt0);advance(dt0*timeScale());   // a long gap (the tab was away) advances the kick by 50 ms at most
    draw()}catch(e){console.error(e);return fail(e)}
    if(!disposed&&!document.hidden)raf=requestAnimationFrame(frame)}
  function resetKick(){shot=null;caughtAt=null;act=null;netT=-1;netAmp=1;animateNet(world.goals[1],-1,0);
    Object.assign(K,{state:'wait',t:0,z:0,dive:0,side:0,row:1,lift:0,landing:0,sway:1,crouch:0,kz:0,handY:1.15});Object.assign(B,{x:SPOT,y:BALL_R,z:0,spin:0});Object.assign(R,{x:RUN.x,z:RUN.z,speed:0,phase:0,strike:-1})}
  function endReplay(silent){if(!rep)return;rep=false;act=null;camera.fov=camBase.fov;frameCamera();fx.shake=fx.punch=0;const cb=repDone;repDone=null;if(!silent){try{draw()}catch(e){}}cb&&cb()}
  function play(dur,step,done){act={t:0,dur:Math.max(.001,dur),step,done}}
  const api={kind:'3d',ready:null,
    toScreen(x,y){v3.set(GX,y,x).project(camera);return [(v3.x*.5+.5)*wrap.clientWidth,(-v3.y*.5+.5)*wrap.clientHeight]},
    fromScreen(px,py){v2.set(px/Math.max(1,wrap.clientWidth)*2-1,-(py/Math.max(1,wrap.clientHeight)*2-1));ray.setFromCamera(v2,camera);const o=ray.ray.origin,d=ray.ray.direction;if(d.x<=1e-4)return [0,3];const t=(GX-o.x)/d.x;return [o.z+d.z*t,o.y+d.y*t]},
    /** The keeper leans toward a direction while the user is still choosing (dir: one of the nine, or null). */
    hint(dir){if(K.state!=='wait'&&K.state!=='set')return;const col=!dir?0:dir.includes('L')?-1:dir.includes('R')?1:0;K.kz=col*.18;K.z+=(K.kz-K.z)*.5},
    /**
     * Draw one kick. r = {x,y,how,power,flight,catch,keeper:{dir,z,row,delay}} as resolveKick() returned it.
     * on.contact() fires on the frame the boot meets the ball, on.result() when the ball's fate is visible,
     * done() after the keeper has landed and the taker has begun to react.
     */
    shoot(r,done,on={},mode='live'){if(disposed)return;
      const replaying=mode==='replay';
      const dir=String(r.keeper?.dir||'C'),col=dir.includes('L')?-1:dir.includes('R')?1:0,row=dir[0]==='U'?2:dir[0]==='D'?0:1,saved=r.how==='save';
      const flight=clamp(r.flight||48/clamp(r.power||73,30,100),.3,2),curl=r.curl||0,style=r.style||{};
      const approach=[1.0,1.25,1.55][style.run??1];
      // where his body ends: on a save the hands meet the ball, otherwise as far as the rules say he got
      const kz=saved?(col?col*clamp(Math.abs(r.x)-.35,.5,3.0):clamp(r.x,-.4,.4)):(col?col*Math.max(1.1,Math.abs(r.keeper?.z??1.9)):0);
      const delay=clamp(r.keeper?.delay??.2,.05,.6),handY=saved?clamp(r.y,.3,2.05):(r.keeper?.handY??[.35,1.15,1.95][row]);
      Object.assign(K,{state:'set',t:0,side:col,row,kz,handY,delay,dur:Math.max(.34,flight-delay),dive:0,landing:0,lift:saved&&col?clamp((r.y-.9)/1.6)*.55:0});
      if(saved&&col)K.liftSaved=K.lift;
      const scored=r.how==='goal',tx=scored?GX+.55:GX-.06,from={x:SPOT,y:BALL_R,z:0},arc=.05+.17*clamp(r.y/2.44);
      shot={start:clock,contactAt:null,reactAt:null,reaction:null,r,approach,stutter:!!style.stutter,replay:replaying};let slowed=false;
      play(approach,u=>{R.x=RUN.x+(SPOT-.28-RUN.x)*u;R.z=RUN.z+(-.105-RUN.z)*u;R.speed=u<.92?3.1:0;R.phase=u*8;R.strike=u>.8?(u-.8)/.2*.62:-1},()=>{
        R.speed=0;R.strike=.62;shot.contactAt=clock;K.state='read';K.t=0;if(replaying){repPhase='flight';frameCamera();draw()}try{on.contact&&on.contact()}catch(e){}
        play(flight,u=>{R.strike=.62+.38*clamp(u*1.5);B.x=from.x+(tx-from.x)*u;B.z=from.z+(r.x-from.z)*u-curl*.9*4*u*(1-u);B.y=from.y+(r.y-from.y)*u+Math.sin(u*Math.PI)*arc;B.spin=curl*u*18+u*3;
          if(scored&&!slowed&&u>.84){slowed=true;slowmo(.3,.3,.8)}},()=>{
          shot.reaction=scored?'goal':'miss';const p={x:B.x,y:B.y,z:B.z},fire=()=>{try{on.result&&on.result()}catch(e){}};const hard=clamp((r.power||70)/100);
          const finish=()=>{const wait=Math.max(0,FOLLOW+.55-(clock-shot.contactAt),K.state==='down'?0:.45);play(wait,()=>{},done)};
          const arrive=()=>{netT=0;netZ=r.x;netY=r.y;netAmp=.7+.7*hard;api.cheer(1)};
          if(scored&&r.post){   // off the frame, then over the line
            bump(.08,1.2);hitstop(.07);let in1=false,s1=Math.sign(p.z||1);
            play(.95,u=>{const a=clamp(u/.35),b=clamp((u-.35)/.65);B.x=p.x-.5*smooth(a)+.95*ease(b);B.z=p.z-s1*.42*smooth(a)-s1*.25*ease(b);B.y=Math.max(BALL_R,p.y-(p.y-BALL_R)*.55*b);B.spin+=.4;
              if(u>.35&&!in1){in1=true;fire();arrive();bump(.04,1.4);slowmo(.4,.2,.6)}},finish)}
          else if(scored){fire();arrive();bump(.03+.03*hard,1.6+hard);play(.7,u=>{B.x=p.x+.35*ease(u);B.y=Math.max(BALL_R,p.y-(p.y-BALL_R)*u*u);B.z=p.z},finish)}
          else if(saved&&r.catch){fire();bump(.03,.8);hitstop(.06);caughtAt={time:clock,point:new T.Vector3(p.x,p.y,p.z)};play(.6,()=>{},finish)}
          else if(saved){fire();bump(.04,.8);hitstop(.07);const s=r.x>=K.z?1:-1;play(.7,u=>{B.x=p.x-2.4*u;B.z=p.z+s*3.0*u;B.y=Math.max(BALL_R,p.y+1.0*Math.sin(u*Math.PI)-(p.y-BALL_R)*u)},finish)}
          else if(r.how==='post'){fire();bump(.09,1.4);hitstop(.09);const bar=r.y>2.3,s=r.x>=0?-1:1;play(.75,u=>{B.x=p.x-4.2*u;B.z=p.z+(bar?p.z*.05:s*1.7)*u;B.y=Math.max(BALL_R,p.y+(bar?.9:.5)*Math.sin(u*Math.PI)-(p.y-BALL_R)*u)},finish)}
          else{fire();const vy=(r.y-BALL_R)/(GX-SPOT),vz=r.x/(GX-SPOT);play(.6,u=>{const d=8.5*u;B.x=p.x+d;B.z=p.z+vz*d;B.y=Math.max(BALL_R,p.y+vy*d-1.6*u*u)},finish)}   // wide or over: it keeps going, behind the goal
        })})},
    /**
     * The same kick again from the side of the goal, at half speed, for the kick that ended the shoot-out.
     * The first half follows the run-up and the strike from behind and to the side (the taker's plane turns to face that camera); at the contact it cuts to the goal mouth for the ball, the keeper and the net. skipReplay() ends it early.
     */
    replay(r,done){if(disposed||rep||!world)return done&&done();rep=true;repPhase='run';repDone=done;fx.slow=null;fx.scale=1;fx.stop=0;resetKick();frameCamera();draw();
      api.shoot(r,()=>endReplay(),{},'replay')},
    skipReplay(){if(rep)endReplay()},
    /** A new kick in the same stadium: everything back to the spot, the new taker's shirt on. */
    reset(o){if(disposed)throw new Error('disposed');if(rep)endReplay(true);if(celeb){celeb=null;pf?.hide()}resetKick();fx.slow=null;fx.scale=1;fx.stop=0;fx.shake=fx.punch=0;lefty=false;if(film)film.flip=false;
      cast(o||opts);frameCamera();draw()},
    /** The winners' celebration after the deciding goal: four players run in and hug in the box, in the scorer's kit. skipCelebration() ends it early. */
    celebrate(done){if(disposed||!pf?.ready)return done&&done();celeb={start:clock,done,over:false};film?.hide();taker.group.visible=false;api.cheer(1);bump(.05,1.2)},
    skipCelebration(){if(celeb&&!celeb.over){celeb.over=true;const d=celeb.done;celeb=null;pf?.hide();d&&d()}},
    cheer(v){if(world&&world.crowd)world.crowd.cheer=v==null?1:v},
    /** stop drawing (another screen is on top) / start again without a jump in time */
    pause(){paused=true;cancelAnimationFrame(raf);raf=0},resume(){if(disposed||!paused)return;paused=false;last=performance.now();raf=requestAnimationFrame(frame)},
    /** tests: advance the picture by hand while paused */
    step(seconds){let left=seconds;while(left>1e-9){const dt=Math.min(1/60,left);advance(dt);left-=dt}draw()},
    /** for the hidden test view */
    debug(){return {fps:fps.value,clip:film?.shown?.clip||null,frame:film?.shown?.frame??-1,contactFrame:film?Math.floor(film.contact*20):null,contactAt:shot?.contactAt??null,clock,keeper:K.state,keeperZ:+K.z.toFixed(3),keeperSide:K.side,ball:{...B},filmed:!!film?.loaded,power:shot?.r?.power??null,fx:+fx.scale.toFixed(2),replay:rep,shake:+fx.shake.toFixed(4),calls:renderer?.info?.render?.calls,textures:renderer?.info?.memory?.textures,geometries:renderer?.info?.memory?.geometries}},
    dispose};
  try{
    renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.type=T.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,opts.maxPixelRatio||2));renderer.shadowMap.enabled=true;wrap.append(renderer.domElement);
    world=buildWorld(scene,renderer);
    // the shadow camera covers the penalty area only, so bodies and feet resolve cleanly
    scene.traverse(o=>{if(o.isDirectionalLight&&o.castShadow){o.shadow.mapSize.set(1024,1024);Object.assign(o.shadow.camera,{left:-14,right:14,top:14,bottom:-14});o.target.position.set(45,0,0);o.shadow.camera.updateProjectionMatrix()}});
    ball=makeBall(scene);
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();if(!disposed)fail(new Error('context lost'))});
    film=filmedTaker(scene);kf=keeperFilm(scene);pf=keeperFilm(scene,{base:'party',grounded:true});
    api.ready=film.ready.then(()=>{if(disposed)return false;film.warm(renderer);draw();return true},e=>{console.error('Photographed taker unavailable',e);return false});
    api.reset(opts);renderer.domElement.setAttribute('aria-label','מגרש פנדלים תלת־ממדי');
    observer=new ResizeObserver(()=>{try{resize()}catch(e){fail(e)}});observer.observe(wrap);
    last=performance.now();raf=requestAnimationFrame(frame);
  }catch(e){dispose();throw e}
  return api;
}
