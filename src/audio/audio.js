// Sound: a quiet crowd bed that loops while a duel is on, recorded bursts for a goal and a near miss, and the match sounds
// (referee whistle, boot on ball, net, post, gloves) rendered by scripts/make-sfx.py. If one of those files is missing, a plain
// synthesized stand-in plays instead. One AudioContext, opened on the first user gesture;
// one bed at a time; everything stops on leaving. The crowd video is silent — this layer is the only sound.
const FILES=['bed','goal','chance','song','sfx-whistle','sfx-whistle-final','sfx-kick','sfx-net','sfx-post','sfx-glove'];
const fileOf=name=>name.startsWith('sfx-')?name:'crowd-'+name;
export function createAudio({base,storage=globalThis.localStorage}={}){
  let ctx=null,master=null,buffers={},loading=null,loaded=false,bed=null,muted=false,live=new Set(),unlocked=false;
  try{muted=storage?.getItem('ph.muted')==='1'}catch(e){}
  const ext=()=>{try{const a=document.createElement('audio');return a.canPlayType('audio/ogg; codecs="opus"')?'opus':'m4a'}catch(e){return 'm4a'}};
  function ensure(){if(ctx)return ctx;const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)return null;
    ctx=new AC();master=ctx.createGain();master.gain.value=muted?0:1;
    const comp=ctx.createDynamicsCompressor();comp.threshold.value=-16;comp.knee.value=12;comp.ratio.value=3.5;comp.attack.value=.004;comp.release.value=.22;   // the whistle, the boot and the roar sit in one mix, and never clip
    master.connect(comp);comp.connect(ctx.destination);return ctx}
  async function load(){if(loading)return loading;if(!ensure())return;const e=ext();
    loading=Promise.all(FILES.map(async name=>{for(const x of e==='opus'?['opus','m4a']:['m4a']){try{const r=await fetch(new URL(fileOf(name)+'.'+x,base));if(!r.ok)continue;
      buffers[name]=await ctx.decodeAudioData(await r.arrayBuffer());return}catch(err){}}})).then(()=>{loaded=true});return loading}
  function play(name,{gain=1,loop=false,fade=0,rate=1,delay=0}={}){if(!ctx||!buffers[name])return null;const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buffers[name];src.loop=loop;src.playbackRate.value=rate;
    g.gain.value=fade?0:gain;if(fade)g.gain.linearRampToValueAtTime(gain,ctx.currentTime+fade);src.connect(g).connect(master);src.start(ctx.currentTime+delay);
    const node={src,g};live.add(node);src.onended=()=>{live.delete(node);try{src.disconnect();g.disconnect()}catch(e){}};return node}
  function stopNode(node,fade=.25){if(!node||!ctx)return;try{node.g.gain.cancelScheduledValues(ctx.currentTime);node.g.gain.setValueAtTime(node.g.gain.value,ctx.currentTime);node.g.gain.linearRampToValueAtTime(0,ctx.currentTime+fade);node.src.stop(ctx.currentTime+fade+.02)}catch(e){}}
  function tone(freq,dur,{type='sine',gain=.2,to=null,delay=0}={}){if(!ctx)return;const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);if(to)o.frequency.exponentialRampToValueAtTime(to,t+dur);
    g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(master);o.start(t);o.stop(t+dur+.02);o.onended=()=>{try{o.disconnect();g.disconnect()}catch(e){}}}
  function noise(dur,{gain=.2,freq=900,q=.7}={}){if(!ctx)return;const n=Math.floor(ctx.sampleRate*dur),b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);
    const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=b;f.type='bandpass';f.frequency.value=freq;f.Q.value=q;g.gain.value=gain;s.connect(f).connect(g).connect(master);s.start();s.onended=()=>{try{s.disconnect();f.disconnect();g.disconnect()}catch(e){}}}
  const api={get muted(){return muted},get ready(){return !!ctx&&ctx.state==='running'},get playing(){return live.size},
    /** call from a tap: opens the context (iOS needs the gesture) and starts loading the recordings */
    unlock(){if(!ensure())return;if(ctx.state==='suspended')ctx.resume().catch(()=>{});if(!unlocked){unlocked=true;load().then(()=>{if(api.wantBed&&!bed)api.bedOn()})}},
    setMuted(v){muted=!!v;try{storage?.setItem('ph.muted',muted?'1':'0')}catch(e){}if(master&&ctx)master.gain.setTargetAtTime(muted?0:1,ctx.currentTime,.03)},
    wantBed:false,
    bedOn(){api.wantBed=true;if(bed||!ctx||!buffers.bed)return;bed=play('bed',{gain:.42,loop:true,fade:1.2})},
    bedOff(){api.wantBed=false;if(bed){stopNode(bed,.5);bed=null}},
    /** the crowd gets quieter for a moment so that the roar, the whistle or the clang can be heard, then comes back */
    duck(to=.45,hold=2.2,back=1.6){if(!bed||!ctx)return;const g=bed.g.gain,t=ctx.currentTime;try{g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(.42*to,t+.12);g.setValueAtTime(.42*to,t+hold);g.linearRampToValueAtTime(.42,t+hold+back)}catch(e){}},
    whistle(final=false){const n=final?'sfx-whistle-final':'sfx-whistle';if(play(n,{gain:.6})){api.duck(.5,final?2.4:1.0,1.2);return}
      if(loaded){tone(2850,.34,{type:'square',gain:.035});tone(2950,.34,{type:'square',gain:.03});tone(2850,.12,{type:'square',gain:.03,delay:.42})}},
    kick(power=73){const p=Math.max(30,Math.min(100,power))/100;if(play('sfx-kick',{gain:.5+.45*p,rate:.9+.22*p}))return;if(loaded){tone(150,.11,{gain:.22+.25*p,to:55});noise(.06,{gain:.10+.18*p,freq:1800})}},
    goal(mine){play('goal',{gain:mine?1:.5,delay:.05});if(!play('sfx-net',{gain:.8})&&loaded)noise(.25,{gain:.05,freq:5200,q:.4});api.duck(.35,mine?3.4:2.6,1.8)},
    miss(){play('chance',{gain:.8});api.duck(.55,1.6,1.4)},
    save(caught){if(!play('sfx-glove',{gain:caught?.9:.7,rate:caught?.92:1.12})&&loaded){tone(190,.09,{gain:.3,to:90});noise(.08,{gain:.22,freq:caught?700:1300})}play('chance',{gain:.6,delay:.08});api.duck(.5,1.6,1.4)},
    post(){if(!play('sfx-post',{gain:.85})&&loaded){tone(980,.22,{type:'triangle',gain:.3,to:720});tone(1630,.16,{type:'sine',gain:.12})}play('chance',{gain:.7,delay:.05});api.duck(.5,1.5,1.4)},
    win(){play('song',{gain:.9,fade:.3})},
    tap(){tone(660,.04,{gain:.05})},
    /** everything off: the duel was left */
    stopAll(){api.wantBed=false;bed=null;for(const n of [...live])stopNode(n,.2)},
    suspend(){if(ctx&&ctx.state==='running')ctx.suspend().catch(()=>{})},resume(){if(ctx&&unlocked&&ctx.state==='suspended')ctx.resume().catch(()=>{})}};
  return api}
