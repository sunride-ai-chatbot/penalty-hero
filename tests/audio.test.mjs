import test from 'node:test';import assert from 'node:assert/strict';
function fakeCtx(missing=[]){const log=[];let cur=null;class Node{connect(n){return n}disconnect(){}}
  class Param{constructor(v=0){this.value=v}setValueAtTime(){}linearRampToValueAtTime(){}exponentialRampToValueAtTime(){}cancelScheduledValues(){}setTargetAtTime(){}}
  class Gain extends Node{gain=new Param(1)}class Src extends Node{playbackRate=new Param(1);start(t){log.push(['start',this.buffer?.name,this.playbackRate.value])}stop(){}}
  class Osc extends Node{frequency=new Param();start(){log.push(['osc'])}stop(){}}
  class Ctx{constructor(){cur=this}currentTime=0;state='running';sampleRate=8000;destination=new Node();createGain(){return new Gain()}createBufferSource(){return new Src()}createOscillator(){return new Osc()}createDynamicsCompressor(){const c=new Node();c.threshold=new Param();c.knee=new Param();c.ratio=new Param();c.attack=new Param();c.release=new Param();log.push(['compressor']);return c}createBiquadFilter(){const f=new Node();f.frequency=new Param();f.Q=new Param();f.gain=new Param();return f}createBuffer(){return {getChannelData:()=>new Float32Array(8)}}
    resume(){return Promise.resolve()}suspend(){return Promise.resolve()}async decodeAudioData(b){return {name:new TextDecoder().decode(b),duration:6}}}
  const fetched=[];globalThis.AudioContext=Ctx;globalThis.fetch=async u=>{const name=String(u).split('/').pop();fetched.push(name);const stem=name.replace(/\.(opus|m4a)$/,'');return missing.includes(stem)?{ok:false}:{ok:true,arrayBuffer:async()=>new TextEncoder().encode(stem).buffer}};
  return {log,fetched,advance:sec=>{cur.currentTime+=sec}}}
const {createAudio}=await import('../src/audio/audio.js');
test('the match sounds come from their own files, through a compressor, and the crowd ducks for them',async()=>{const f=fakeCtx();const a=createAudio({base:'http://x/assets/audio/',storage:null});a.unlock();await new Promise(r=>setTimeout(r,30));
  assert.ok(['sfx-whistle','crowd-call1','crowd-call2','crowd-call3','crowd-call-save','crowd-call-miss','crowd-call-end','sfx-kick','sfx-net','sfx-post','sfx-glove','crowd-bed','crowd-goal'].every(n=>f.fetched.some(x=>x.startsWith(n+'.'))));assert.ok(f.log.some(l=>l[0]==='compressor'));
  const orig=Math.random;Math.random=()=>0.1;try{a.whistle();a.kick(90);a.goal(true);f.advance(10);a.goal(true);f.advance(10);a.post();a.save(true)}finally{Math.random=orig}const started=f.log.filter(l=>l[0]==='start').map(l=>l[1]);
  for(const n of ['sfx-whistle','sfx-kick','sfx-net','sfx-post','sfx-glove','crowd-call1','crowd-call2','crowd-call-save','crowd-chance'])assert.ok(started.includes(n),n);assert.ok(!f.log.some(l=>l[0]==='osc'),'no stand-in beeps when the files are there');
  const k=f.log.filter(l=>l[1]==='sfx-kick');a.kick(30);a.kick(100);const rates=f.log.filter(l=>l[1]==='sfx-kick').slice(-2).map(l=>l[2]);assert.ok(rates[1]>rates[0],'a harder kick is higher and louder')});
test('a missing file falls back to a plain stand-in once loading is over, and is silent before',async()=>{const f=fakeCtx(['sfx-kick','sfx-whistle']);const a=createAudio({base:'http://x/',storage:null});a.unlock();a.kick(80);assert.ok(!f.log.some(l=>l[0]==='osc'));
  await new Promise(r=>setTimeout(r,30));a.kick(80);a.whistle();assert.ok(f.log.filter(l=>l[0]==='osc').length>=2)});

test('the commentator never repeats a call twice in a row, always speaks on the first goal, and the crowd burst plays when he does not',async()=>{const f=fakeCtx();const a=createAudio({base:'http://x/',storage:null});a.unlock();await new Promise(r=>setTimeout(r,30));a.bedOn();
  const seq=[];const orig=Math.random;try{Math.random=()=>0.99;f.log.length=0;a.goal(true);seq.push(...f.log.filter(l=>l[0]==='start'&&/call/.test(l[1])).map(l=>l[1]));
    f.advance(10);a.goal(true);const second=f.log.filter(l=>l[0]==='start'&&/call/.test(l[1])).length;assert.equal(second,1,'the second goal (random 0.99) has no call');assert.ok(f.log.some(l=>l[1]==='crowd-goal'),'the crowd roars instead');
    Math.random=()=>0.1;f.log.length=0;f.advance(10);a.goal(true);f.advance(10);a.goal(true);const calls=f.log.filter(l=>l[0]==='start'&&/call/.test(l[1])).map(l=>l[1]);assert.equal(calls.length,2);assert.notEqual(calls[0],calls[1]);assert.notEqual(calls[0],seq[0])}finally{Math.random=orig}});

test('one commentator at a time: a call is skipped while another is still playing, and a call never repeats back to back',async()=>{const f=fakeCtx();const a=createAudio({base:'http://x/',storage:null});a.unlock();await new Promise(r=>setTimeout(r,30));a.bedOn();
  const orig=Math.random;const calls=()=>f.log.filter(l=>l[0]==='start'&&/crowd-call/.test(l[1])).map(l=>l[1]);
  try{Math.random=()=>0.1;f.log.length=0;a.goal(true);assert.equal(calls().length,1);a.save(true);a.miss(true);assert.equal(calls().length,1,'still talking: no second call on top of the first');
    assert.ok(f.log.some(l=>l[1]==='crowd-chance'),'the crowd gasps instead');
    f.advance(10);f.log.length=0;a.save(true);assert.deepEqual(calls(),['crowd-call-save']);f.advance(10);f.log.length=0;a.save(true);assert.deepEqual(calls(),[],'the save call is not repeated straight away');
    f.log.length=0;a.miss(true);assert.deepEqual(calls(),['crowd-call-miss']);f.advance(10);f.log.length=0;a.miss(false);assert.deepEqual(calls(),[],'a ball that went wide gets no "over the bar"')}finally{Math.random=orig}});
test('save and miss calls are only now and then (random above the chance means the crowd alone), and the post has none',async()=>{const f=fakeCtx();const a=createAudio({base:'http://x/',storage:null});a.unlock();await new Promise(r=>setTimeout(r,30));a.bedOn();
  const orig=Math.random;try{Math.random=()=>0.9;f.log.length=0;a.save(false);a.miss(true);a.post();assert.ok(!f.log.some(l=>/crowd-call/.test(l[1]||'')));assert.equal(f.log.filter(l=>l[1]==='crowd-chance').length,3)}finally{Math.random=orig}});
test('the finale call closes the duel, the winners\' song waits for the speech, and a new duel starts fresh',async()=>{const f=fakeCtx();const a=createAudio({base:'http://x/',storage:null});a.unlock();await new Promise(r=>setTimeout(r,30));a.bedOn();
  const calls=()=>f.log.filter(l=>l[0]==='start'&&/crowd-call/.test(l[1])).map(l=>l[1]);
  a.bedOff();a.finale();assert.deepEqual(calls(),['crowd-call-end']);a.finale();assert.equal(calls().length,1,'once');a.win();assert.ok(f.log.some(l=>l[1]==='crowd-song'));
  f.advance(20);a.bedOn();a.bedOff();f.log.length=0;a.finale();assert.deepEqual(calls(),['crowd-call-end'],'the next duel can have its own finale')});
