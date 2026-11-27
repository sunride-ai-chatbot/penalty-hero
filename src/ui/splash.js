/* The opening film: the crest turns on its own axis for five seconds, then the game underneath is revealed.
   The markup lives in index.html so the first thing painted is the film's own first frame, not a dark page.
   The film never blocks: a tap skips it, a timer ends it if the video stalls, and once played it is not repeated in the same session. */
export const SPLASH_MS=5000,SPLASH_FADE=450,SPLASH_HOLD=2400,SPLASH_KEY='ph.splashed';

/** Whether the film plays at all. The same rule is inlined in index.html (before the first paint); keep the two in step. */
export function wantsSplash({search='',seen=false,reduced=false}={}){
  if(/[?&]nosplash\b/.test(search))return false;
  if(/[?&]debug\b/.test(search)&&!/[?&]splash\b/.test(search))return false;   // the automated tests go straight to the game
  return !seen&&!reduced}

/** Runs the film in `el` (a .splash element holding one <video>). Returns {finish, done} — `done` resolves once the film is gone. */
export function runSplash(el,{doc=document,win=window,storage=win.sessionStorage,ms=SPLASH_MS,fade=SPLASH_FADE,hold=SPLASH_HOLD}={}){
  const root=doc.documentElement;
  if(!el||!root.classList.contains('splash-on'))return {finish(){},done:Promise.resolve()};
  const v=el.querySelector('video');let over=false,timers=[],resolve;const done=new Promise(r=>resolve=r);
  const later=(fn,t)=>{const id=win.setTimeout(fn,t);timers.push(id);return id};
  const finish=()=>{if(over)return;over=true;timers.forEach(win.clearTimeout);
    try{storage&&storage.setItem(SPLASH_KEY,'1')}catch(e){}
    el.classList.add('out');
    const theme=doc.querySelector('meta[name=theme-color]');if(theme&&theme.dataset.was)theme.content=theme.dataset.was;
    later(()=>{try{v&&v.pause()}catch(e){}el.remove();root.classList.remove('splash-on');resolve()},fade+60)};
  el.addEventListener('click',finish);               // 'click', not 'pointerdown': a tap that skips the film must not also land on the button underneath
  if(!v){later(finish,hold);return {finish,done}}
  v.loop=false;v.muted=true;
  v.addEventListener('ended',finish);
  const stuck=()=>{if(!over)timers.push(win.setTimeout(finish,hold))};      // the poster (the crest, still) stays for a moment, then the game
  v.addEventListener('error',stuck);
  later(finish,ms+900);                                                    // the film is five seconds; this only catches a stalled one
  try{const p=v.play();if(p&&p.catch)p.catch(stuck)}catch(e){stuck()}
  return {finish,done}}
