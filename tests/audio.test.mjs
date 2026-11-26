import test from 'node:test';import assert from 'node:assert/strict';
function fakeCtx(missing=[]){const log=[];class Node{connect(n){return n}disconnect(){}}
  class Param{constructor(v=0){this.value=v}setValueAtTime(){}linearRampToValueAtTime(){}exponentialRampToValueAtTime(){}cancelScheduledValues(){}setTargetAtTime(){}}
  class Gain extends Node{gain=new Param(1)}class Src extends Node{playbackRate=new Param(1);start(t){log.push(['start',this.buffer?.name,this.playbackRate.value])}stop(){}}
  class Osc extends Node{frequency=new Param();start(){log.push(['osc'])}stop(){}}
  class Ctx{currentTime=0;state='running';sampleRate=8000;destination=new Node();createGain(){return new Gain()}createBufferSource(){return new Src()}createOscillator(){return new Osc()}createDynamicsCompressor(){const c=new Node();c.threshold=new Param();c.knee=new Param();c.ratio=new Param();c.attack=new Param();c.release=new Param();log.push(['compressor']);return c}createBiquadFilter(){const f=new Node();f.frequency=new Param();f.Q=new Param();f.gain=new Param();return f}createBuffer(){return {getChannelData:()=>new Float32Array(8)}}
    resume(){return Promise.resolve()}suspend(){return Promise.resolve()}async decodeAudioData(b){return {name:new TextDecoder().decode(b)}}}
  const fetched=[];globalThis.AudioContext=Ctx;globalThis.fetch=async u=>{const name=String(u).split('/').pop();fetched.push(name);const stem=name.replace(/\.(opus|m4a)$/,'');return missing.includes(stem)?{ok:false}:{ok:true,arrayBuffer:async()=>new TextEncoder().encode(stem).buffer}};
  return {log,fetched}}
const {createAudio}=await import('../src/audio/audio.js');
test('the match sounds come from their own files, through a compressor, and the crowd ducks for them',async()=>{const f=fakeCtx();const a=createAudio({base:'http://x/assets/audio/',storage:null});a.unlock();await new Promise(r=>setTimeout(r,30));
  assert.ok(['sfx-whistle','sfx-whistle-final','sfx-kick','sfx-net','sfx-post','sfx-glove','crowd-bed','crowd-goal'].every(n=>f.fetched.some(x=>x.startsWith(n+'.'))));assert.ok(f.log.some(l=>l[0]==='compressor'));
  a.whistle();a.kick(90);a.goal(true);a.post();a.save(true);const started=f.log.filter(l=>l[0]==='start').map(l=>l[1]);
  for(const n of ['sfx-whistle','sfx-kick','sfx-net','sfx-post','sfx-glove','crowd-goal','crowd-chance'])assert.ok(started.includes(n),n);assert.ok(!f.log.some(l=>l[0]==='osc'),'no stand-in beeps when the files are there');
  const k=f.log.filter(l=>l[1]==='sfx-kick');a.kick(30);a.kick(100);const rates=f.log.filter(l=>l[1]==='sfx-kick').slice(-2).map(l=>l[2]);assert.ok(rates[1]>rates[0],'a harder kick is higher and louder')});
test('a missing file falls back to a plain stand-in once loading is over, and is silent before',async()=>{const f=fakeCtx(['sfx-kick','sfx-whistle']);const a=createAudio({base:'http://x/',storage:null});a.unlock();a.kick(80);assert.ok(!f.log.some(l=>l[0]==='osc'));
  await new Promise(r=>setTimeout(r,30));a.kick(80);a.whistle();assert.ok(f.log.filter(l=>l[0]==='osc').length>=3)});
