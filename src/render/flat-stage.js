// The simple picture: a flat goal drawn in SVG, for a device that cannot run the 3D scene (no WebGL, or a lost context).
// Same interface as the 3D view. It is labelled on screen as the simple view — it is never passed off as the filmed one.
const S=34.15,GX=180,GY=215;
export function createFlatStage(host,opts={}){
  const wrap=document.createElement('div');wrap.className='pg-flat';host.prepend(wrap);let o={...opts},disposed=false,raf=0,anims=[];
  const paint=()=>{wrap.innerHTML=`<svg viewBox="30 40 300 420" preserveAspectRatio="xMidYMid slice" aria-label="מגרש פנדלים, תצוגה פשוטה">
    <rect x="-200" y="-200" width="800" height="350" fill="#0a0f18"/><rect x="-200" y="150" width="800" height="600" fill="#1f6b33"/>
    <g fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2"><path d="M-200 215H600"/><path d="M${GX-94} 215L${GX-170} 318H${GX+170}L${GX+94} 215"/></g>
    <ellipse cx="180" cy="414" rx="14" ry="4.5" fill="rgba(255,255,255,.65)"/>
    <g fill="none" stroke="rgba(235,240,245,.3)" stroke-width="1">${Array.from({length:13},(_,i)=>`<path d="M${(GX-125+i*250/12).toFixed(1)} 132V215"/>`).join('')}${Array.from({length:5},(_,j)=>`<path d="M${GX-125} ${(146+j*17).toFixed(1)}H${GX+125}"/>`).join('')}</g>
    <path d="M${GX-125} 215V132H${GX+125}V215" fill="none" stroke="#f4f4ee" stroke-width="5" stroke-linecap="round"/>
    <g id="fk" transform="translate(${GX} ${GY})"><ellipse cx="0" cy="1" rx="15" ry="3.5" fill="rgba(0,0,0,.35)"/><rect x="-7" y="-26" width="14" height="26" fill="#10151d"/><rect x="-10" y="-52" width="20" height="26" rx="5" fill="${o.gkKit||'#f2b233'}"/><path d="M-10 -49l-13 -9M10 -49l13 -9" stroke="${o.gkKit||'#f2b233'}" stroke-width="6" stroke-linecap="round"/><circle cx="0" cy="-58" r="6.2" fill="#c9966f"/></g>
    <g id="fb" transform="translate(180 404)"><ellipse cx="0" cy="13" rx="14" ry="4" fill="rgba(0,0,0,.4)"/><circle r="14" fill="#f4f3e8" stroke="#1b2330"/></g>
    <g id="ft" transform="translate(120 456)"><ellipse cx="0" cy="2" rx="28" ry="6" fill="rgba(0,0,0,.35)"/><rect x="-14" y="-48" width="28" height="48" fill="#c9966f"/><rect x="-19" y="-68" width="38" height="25" rx="6" fill="${o.trim||'#10151d'}"/><rect x="-21" y="-120" width="42" height="57" rx="10" fill="${o.kit||'#c6f24e'}"/>
      <text x="0" y="-100" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" stroke="#000" stroke-width=".4">${String(o.name||'').replace(/[<&]/g,'')}</text><text x="0" y="-78" text-anchor="middle" font-size="22" font-weight="800" fill="#fff" stroke="#000" stroke-width=".6">${o.number??''}</text><circle cx="0" cy="-133" r="12.5" fill="#c9966f"/></g></svg><div class="pg-flat-note">תצוגה פשוטה · המכשיר לא מריץ את התלת־ממד</div>`};
  paint();const q=id=>wrap.querySelector('#'+id);
  const box=()=>{const r=wrap.getBoundingClientRect();const sc=Math.max(r.width/300,r.height/420)||1;return {sc,ox:(r.width-300*sc)/2-30*sc,oy:(r.height-420*sc)/2-40*sc}};
  const anim=(sec,step,done)=>{const a={t:0,dur:Math.max(.001,sec),step,done};anims.push(a)};
  let last=performance.now();const loop=now=>{raf=0;if(disposed)return;const dt=Math.min(.05,(now-last)/1000);last=now;for(const a of anims.slice()){a.t+=dt;const u=Math.min(1,a.t/a.dur);a.step(u);if(u>=1){anims.splice(anims.indexOf(a),1);a.done&&a.done()}}raf=requestAnimationFrame(loop)};raf=requestAnimationFrame(loop);
  const setBall=(x,y,s)=>q('fb')?.setAttribute('transform',`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})`);
  return {kind:'flat',ready:Promise.resolve(true),
    toScreen(x,y){const b=box();return [b.ox+(GX+x*S)*b.sc,b.oy+(GY-y*S)*b.sc]},fromScreen(px,py){const b=box();return [((px-b.ox)/b.sc-GX)/S,(GY-(py-b.oy)/b.sc)/S]},
    hint(){},cheer(){},pause(){},resume(){last=performance.now()},step(){},debug(){return {fps:0,clip:'flat',frame:-1,keeper:'flat',filmed:false}},
    reset(n){o={...o,...n};anims=[];paint()},
    shoot(r,done,on={}){const tx=GX+r.x*S,ty=GY-r.y*S,dir=String(r.keeper?.dir||'C'),col=dir.includes('L')?-1:dir.includes('R')?1:0,row=dir[0]==='U'?2:dir[0]==='D'?0:1,saved=r.how==='save';
      const kx=col*(saved?Math.min(112,Math.max(26,Math.abs(r.x)*S-8)):62),ky=-(col?[2,14,40][row]:row===2?22:0),rot=col*[78,64,50][row];const flight=r.flight||.6;
      anim(.5,u=>q('ft')?.setAttribute('transform',`translate(${(120+34*u).toFixed(1)} ${(456-22*u).toFixed(1)})`),()=>{try{on.contact&&on.contact()}catch(e){}
        anim(Math.max(.3,flight),u=>{const e=1-Math.pow(1-u,2);q('fk')?.setAttribute('transform',`translate(${(GX+kx*e).toFixed(1)} ${(GY+ky*e).toFixed(1)}) rotate(${(rot*e).toFixed(1)} 0 -30)`)});
        anim(flight,u=>setBall(180+(tx-180)*u,404+(ty-404)*u-Math.sin(u*Math.PI)*10,1-.62*u),()=>{try{on.result&&on.result()}catch(e){}
          const end=()=>anim(.5,()=>{},done);
          if(r.how==='goal')anim(.4,u=>setBall(tx,ty+(GY-6-ty)*u*u,.38-.05*u),end);
          else if(saved&&r.catch)anim(.3,()=>{},end);
          else if(saved)anim(.45,u=>setBall(tx+(r.x>=0?70:-70)*u,ty-30*u+u*u*80,.38+.1*u),end);
          else if(r.how==='post')anim(.5,u=>setBall(tx+(r.x>=0?-60:60)*u,ty+(300-ty)*u*u-Math.sin(u*Math.PI)*30,.38+.3*u),end);
          else anim(.4,u=>setBall(tx+(tx-180)*.5*u,ty-(404-ty)*.28*u,.38-.14*u),end)})})},
    dispose(){disposed=true;cancelAnimationFrame(raf);anims=[];wrap.remove()}}}
