// Sound: a quiet crowd bed that loops while a duel is on, recorded bursts for a goal and a near miss, and a few
// synthesized touches (boot on ball, gloves, post, whistle). One AudioContext, opened on the first user gesture;
// one bed at a time; everything stops on leaving. The crowd video is silent — this layer is the only sound.
const FILES=['bed','goal','chance','song'];
export function createAudio({base,storage=globalThis.localStorage}={}){
  let ctx=null,master=null,buffers={},loading=null,bed=null,muted=false,live=new Set(),unlocked=false;
  try{muted=storage?.getItem('ph.muted')==='1'}catch(e){}
  const ext=()=>{try{const a=document.createElement('audio');return a.canPlayType('audio/ogg; codecs="opus"')?'opus':'m4a'}catch(e){return 'm4a'}};
  function ensure(){if(ctx)return ctx;const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)return null;
    ctx=new AC();master=ctx.createGain();master.gain.value=muted?0:1;master.connect(ctx.destination);return ctx}
  async function load(){if(loading)return loading;if(!ensure())return;const e=ext();
    loading=Promise.all(FILES.map(async name=>{for(const x of e==='opus'?['opus','m4a']:['m4a']){try{const r=await fetch(new URL('crowd-'+name+'.'+x,base));if(!r.ok)continue;
      buffers[name]=await ctx.decodeAudioData(await r.arrayBuffer());return}catch(err){}}}));return loading}
  function play(name,{gain=1,loop=false,fade=0}={}){if(!ctx||!buffers[name])return null;const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buffers[name];src.loop=loop;
    g.gain.value=fade?0:gain;if(fade)g.gain.linearRampToValueAtTime(gain,ctx.currentTime+fade);src.connect(g).connect(master);src.start();
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
    whistle(){tone(2850,.34,{type:'square',gain:.035});tone(2950,.34,{type:'square',gain:.03});tone(2850,.12,{type:'square',gain:.03,delay:.42})},
    kick(power=73){const p=Math.max(30,Math.min(100,power))/100;tone(150,.11,{gain:.22+.25*p,to:55});noise(.06,{gain:.10+.18*p,freq:1800})},
    goal(mine){play('goal',{gain:mine?1:.5});noise(.25,{gain:.05,freq:5200,q:.4})},
    miss(){play('chance',{gain:.8})},
    save(caught){tone(190,.09,{gain:.3,to:90});noise(.08,{gain:.22,freq:caught?700:1300});play('chance',{gain:.6})},
    post(){tone(980,.22,{type:'triangle',gain:.3,to:720});tone(1630,.16,{type:'sine',gain:.12});play('chance',{gain:.7})},
    win(){play('song',{gain:.9,fade:.3})},
    tap(){tone(660,.04,{gain:.05})},
    /** everything off: the duel was left */
    stopAll(){api.wantBed=false;bed=null;for(const n of [...live])stopNode(n,.2)},
    suspend(){if(ctx&&ctx.state==='running')ctx.suspend().catch(()=>{})},resume(){if(ctx&&unlocked&&ctx.state==='suspended')ctx.resume().catch(()=>{})}};
  return api}
