import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {wantsSplash,runSplash,SPLASH_KEY,SPLASH_MS} from '../src/ui/splash.js';

test('the film plays on a plain launch, once per session, never under the automated tests',()=>{
  assert.equal(wantsSplash({search:''}),true);
  assert.equal(wantsSplash({search:'?cup=X&at=1'}),true,'an invitation link still opens with the film');
  assert.equal(wantsSplash({search:'',seen:true}),false);
  assert.equal(wantsSplash({search:'',reduced:true}),false,'reduced motion skips it');
  assert.equal(wantsSplash({search:'?debug=1&view=2d'}),false);
  assert.equal(wantsSplash({search:'?debug=1&splash=1'}),true,'the tests can ask for it');
  assert.equal(wantsSplash({search:'?nosplash'}),false);
});

test('the rule inlined in index.html (before the first paint) agrees with wantsSplash',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const code=html.match(/<script>\s*\/\*[^*]*\*\/([\s\S]*?)<\/script>/)[1];
  for(const search of ['','?cup=X','?debug=1','?debug=1&splash=1','?nosplash','?x=nosplash']){
    for(const seen of [false,true])for(const reduced of [false,true]){
      const cls=new Set(),meta={content:'#0b1016',dataset:{}};
      const ctx={location:{search},sessionStorage:{getItem:()=>seen?'1':null},matchMedia:()=>({matches:reduced}),document:{documentElement:{classList:{add:c=>cls.add(c)}},querySelector:()=>meta}};
      vm.runInNewContext(code,ctx);
      assert.equal(cls.has('splash-on'),wantsSplash({search,seen,reduced}),`${search} seen=${seen} reduced=${reduced}`);
      if(cls.has('splash-on'))assert.equal(meta.dataset.was,'#0b1016','the status-bar colour is remembered to be restored');
    }}
});

/* a tiny stand-in for the page: just enough DOM and a clock we can step */
function rig({play='ok',on=true}={}){
  const cls=new Set(on?['splash-on']:[]),timers=[];let now=0,removed=false;const listeners={},vl={};
  const video={loop:true,muted:false,paused:false,pause(){this.paused=true},addEventListener:(k,f)=>vl[k]=f,play:()=>play==='ok'?Promise.resolve():play==='reject'?Promise.reject(new Error('blocked')):undefined};
  const el={classList:{add:c=>cls.add('el:'+c),has:c=>cls.has('el:'+c)},addEventListener:(k,f)=>listeners[k]=f,querySelector:()=>video,remove:()=>{removed=true}};
  const meta={content:'#dbd2c4',dataset:{was:'#0b1016'}};
  const doc={documentElement:{classList:{contains:c=>cls.has(c),remove:c=>cls.delete(c)}},querySelector:()=>meta};
  const win={setTimeout:(fn,t)=>{timers.push({fn,at:now+t,id:timers.length+1,live:true});return timers.length},clearTimeout:id=>{const t=timers[id-1];if(t)t.live=false}};
  const store={};const storage={setItem:(k,v)=>store[k]=v};
  const advance=ms=>{const end=now+ms;for(;;){const next=timers.filter(t=>t.live&&t.at<=end).sort((a,b)=>a.at-b.at)[0];if(!next)break;now=next.at;next.live=false;next.fn()}now=end};
  return {el,doc,win,storage,store,video,vl,listeners,cls,meta,advance,get removed(){return removed}};
}
const flush=()=>new Promise(r=>setImmediate(r));

test('the film ends by itself, marks the session and puts the status-bar colour back',async()=>{
  const r=rig();const s=runSplash(r.el,r);await flush();
  assert.equal(r.video.loop,false);assert.equal(r.video.muted,true);
  r.vl.ended();assert.ok(r.el.classList.has('out'),'it fades');assert.equal(r.removed,false);
  r.advance(600);assert.equal(r.removed,true);assert.equal(r.cls.has('splash-on'),false);assert.equal(r.store[SPLASH_KEY],'1');assert.equal(r.meta.content,'#0b1016');await s.done;
});

test('a tap skips it at once',async()=>{
  const r=rig();const s=runSplash(r.el,r);r.advance(1200);assert.equal(r.removed,false);
  assert.equal(r.listeners.pointerdown,undefined,'not on pointerdown: that tap would also press the button underneath');r.listeners.click();r.advance(600);assert.equal(r.removed,true);await s.done;
});

test('a stalled video cannot hold the game back: the timer ends it a little after five seconds',()=>{
  const r=rig();runSplash(r.el,r);r.advance(SPLASH_MS);assert.equal(r.el.classList.has('out'),false);r.advance(1000);assert.equal(r.el.classList.has('out'),true);r.advance(600);assert.equal(r.removed,true);
});

test('when autoplay is refused the still crest stays for a moment and then the game starts',async()=>{
  const r=rig({play:'reject'});runSplash(r.el,r);await flush();r.advance(2000);assert.equal(r.el.classList.has('out'),false);r.advance(500);assert.equal(r.el.classList.has('out'),true);
});

test('finishing twice does nothing the second time; no film, no work',async()=>{
  const r=rig();const s=runSplash(r.el,r);s.finish();s.finish();r.advance(600);assert.equal(r.removed,true);
  const off=rig({on:false});const n=runSplash(off.el,off);await n.done;assert.equal(off.removed,false);assert.equal(off.el.classList.has('out'),false);
});

test('the film is in the project: five seconds, no sound track, a poster, listed in the README',()=>{
  const root=new URL('../',import.meta.url);
  assert.ok(fs.statSync(new URL('assets/penalty-splash.mp4',root)).size<600e3,'light enough to arrive before the film should start');
  assert.ok(fs.existsSync(new URL('assets/penalty-splash.webp',root)));
  assert.match(fs.readFileSync(new URL('README.md',root),'utf8'),/penalty-splash/);
});
