// The settings kept on this phone: what is heard (the commentator, the effects, the crowd, how loud), the buzz in the hand, how much the picture asks of the phone.
export const DEFAULTS={quality:'auto',voice:true,sfx:true,crowd:true,vol:1,haptics:true};
export const VOLUMES=[{v:.6,name:'חלש'},{v:1,name:'רגיל'},{v:1.4,name:'חזק'}];
export const QUALITIES=[{id:'auto',name:'אוטומטי'},{id:'high',name:'גבוהה'},{id:'low',name:'חסכונית'}];
export function parseSettings(raw){let o={};try{o=JSON.parse(raw||'{}')||{}}catch(e){}const out={...DEFAULTS};
  for(const k of ['voice','sfx','crowd','haptics'])if(typeof o[k]==='boolean')out[k]=o[k];
  if(VOLUMES.some(x=>x.v===o.vol))out.vol=o.vol;if(QUALITIES.some(x=>x.id===o.quality))out.quality=o.quality;return out}
/** the level the picture starts at: 0 full, 1 lighter, 2 light. "auto" starts where the last session ended up (the view steps down by itself and never up). */
export const qualityLevel=(pref,auto=0)=>pref==='high'?0:pref==='low'?2:Math.max(0,Math.min(2,Math.floor(+auto)||0));
export const levelName=l=>['מלאה','קלה','חסכונית'][Math.max(0,Math.min(2,l|0))];
/** the buzz of the phone in milliseconds: [on, off, on, ...] */
export const BUZZ={goal:[35,40,90],conceded:[110],save:[60,30,40],post:[30,35,30],start:[60,40,60],miss:[22],win:[70,50,70,50,160],tap:[12],kick:[20]};
/** when each pulse of a pattern begins, in ms (the even entries are the "on" parts) */
export const pulseTimes=p=>{const out=[];let t=0;for(let i=0;i<p.length;i++){if(i%2===0)out.push(t);t+=p[i]}return out};
/** iPhones have no Vibration API in the browser. What they do have: toggling a checkbox with the `switch` attribute (Safari 17.4 and up) gives a
 *  small tap in the hand. The same trick the "ios-haptics" libraries use; Safari lets it through only close to a touch, so it is best effort. */
export function switchTick(doc=typeof document!=='undefined'?document:null,nav=typeof navigator!=='undefined'?navigator:null){
  if(!doc||!nav)return null;const ios=/iP(hone|ad|od)/.test(nav.userAgent||'')||(nav.platform==='MacIntel'&&nav.maxTouchPoints>1);if(!ios)return null;
  return ()=>{try{const l=doc.createElement('label');l.setAttribute('aria-hidden','true');l.style.display='none';const i=doc.createElement('input');i.type='checkbox';i.setAttribute('switch','');l.appendChild(i);doc.head.appendChild(l);l.click();l.remove();return true}catch(e){return false}}}
export function createHaptics({vibrate=typeof navigator!=='undefined'&&typeof navigator.vibrate==='function'?p=>navigator.vibrate(p):null,tick=vibrate?null:switchTick(),enabled=true,schedule=(fn,ms)=>setTimeout(fn,ms)}={}){let on=enabled;
  /** native vibration where there is one, else a tap per pulse through the switch trick (the first at once, which is what Safari wants) */
  const go=name=>{const pat=BUZZ[name];if(vibrate){try{return vibrate(pat)!==false}catch(e){return false}}
    if(!tick)return false;const ts=pulseTimes(pat);let ok=tick()!==false;for(const t of ts.slice(1))schedule(()=>{try{tick()}catch(e){}},t);return ok};
  const buzz=name=>on?go(name):false;
  return {get supported(){return !!(vibrate||tick)},get native(){return !!vibrate},get enabled(){return on},configure(o){if(o&&typeof o.haptics==='boolean')on=o.haptics},
    goal(mine){return buzz(mine?'goal':'conceded')},save(){return buzz('save')},post(){return buzz('post')},miss(){return buzz('miss')},win(){return buzz('win')},start(){return buzz('start')},tap(){return buzz('tap')},kick(){return buzz('kick')},
    /** for the settings screen: buzz now even when it is about to be turned on */
    preview(){return go('goal')}}}
