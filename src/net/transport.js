// Transports for the network duel. A transport joins a room and passes JSON messages to everybody else in it:
//   connect(code, onMessage) -> Promise<{send(message), close()}>
// The duel protocol (protocol.js) knows nothing about the service behind it, so another backend is one small adapter.
export const ROOM_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const cleanCode=s=>String(s||'').toUpperCase().split('').filter(c=>ROOM_ALPHABET.includes(c)).join('').slice(0,6);
export function newRoomCode(random=Math.random){let s='';for(let i=0;i<6;i++)s+=ROOM_ALPHABET[Math.floor(random()*ROOM_ALPHABET.length)];return s}

/** Supabase Realtime broadcast: channel `phero:CODE`, event `m`. Only the project's public URL and publishable key are used. */
export function supabaseTransport({url,key,timeoutMs=12000}){
  return async function connect(code,onMessage){
    const {RealtimeClient}=await import('../../vendor/supabase-realtime.js');
    const client=new RealtimeClient(url.replace(/\/+$/,'').replace(/^http/,'ws')+'/realtime/v1',{params:{apikey:key}});
    const channel=client.channel('phero:'+code,{config:{broadcast:{self:false,ack:false}}});
    channel.on('broadcast',{event:'m'},e=>{try{onMessage(e.payload)}catch(err){console.error(err)}});
    await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('timeout')),timeoutMs);
      channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(t);resolve()}else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){clearTimeout(t);reject(new Error(status))}})});
    return {send(message){try{channel.send({type:'broadcast',event:'m',payload:message})}catch(e){}},
      close(){try{client.removeChannel(channel)}catch(e){}try{client.disconnect()}catch(e){}}}}}

/** Same browser, several tabs (BroadcastChannel). For development and automated tests only — never offered as "online". */
export function localTransport(){
  return async function connect(code,onMessage){const ch=new BroadcastChannel('phero:'+code);ch.onmessage=e=>onMessage(e.data);
    return {send(message){try{ch.postMessage(JSON.parse(JSON.stringify(message)))}catch(e){}},close(){ch.close()}}}}

/** In-memory rooms for unit tests: delivery is asynchronous; `drop(message)` loses one, `sent` records all. */
export function memoryBus(){const rooms={};const bus={drop:null,sent:[],delay:1,
  transport(){return async function connect(code,onMessage){const room=rooms[code]||(rooms[code]=[]);const me={onMessage,closed:false};room.push(me);
    return {send(message){const copy=JSON.parse(JSON.stringify(message));bus.sent.push(copy);if(bus.drop&&bus.drop(copy))return;
        for(const peer of room)if(peer!==me&&!peer.closed)setTimeout(()=>{if(!peer.closed)peer.onMessage(JSON.parse(JSON.stringify(copy)))},bus.delay)},
      close(){me.closed=true}}}}};return bus}

/** Read config/network.json and build the transport, or say why there is none. */
export async function loadTransport(configUrl,{allowLocal=false,fetchImpl=globalThis.fetch}={}){
  let cfg=null;try{const r=await fetchImpl(configUrl,{cache:'no-store'});if(r.ok)cfg=await r.json()}catch(e){}
  if(cfg&&cfg.transport==='supabase'&&/^https:\/\/[a-z0-9.-]+$/i.test(String(cfg.url||'').replace(/\/+$/,''))&&String(cfg.key||'').length>20&&!/service_role/i.test(cfg.key)&&!/YOUR-/.test(cfg.key))
    return {available:true,kind:'supabase',connect:supabaseTransport(cfg)};
  if(cfg&&cfg.transport==='local'&&allowLocal&&typeof BroadcastChannel!=='undefined')return {available:true,kind:'local',connect:localTransport()};
  return {available:false,kind:'none',connect:null}}
