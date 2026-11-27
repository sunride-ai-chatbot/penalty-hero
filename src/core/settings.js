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
/** the buzz of the phone in milliseconds, where the platform has one (not iPhones) */
export const BUZZ={goal:[35,40,90],conceded:[110],save:[60,30,40],post:[30,35,30],start:[60,40,60],miss:[22],win:[70,50,70,50,160],tap:[12]};
export function createHaptics({vibrate=typeof navigator!=='undefined'&&typeof navigator.vibrate==='function'?p=>navigator.vibrate(p):null,enabled=true}={}){let on=enabled;
  const buzz=name=>{if(!on||!vibrate)return false;try{return vibrate(BUZZ[name])!==false}catch(e){return false}};
  return {get supported(){return !!vibrate},get enabled(){return on},configure(o){if(o&&typeof o.haptics==='boolean')on=o.haptics},
    goal(mine){return buzz(mine?'goal':'conceded')},save(){return buzz('save')},post(){return buzz('post')},miss(){return buzz('miss')},win(){return buzz('win')},start(){return buzz('start')},tap(){return buzz('tap')},
    /** for the settings screen: buzz now even when it is about to be turned on */
    preview(){if(!vibrate)return false;try{return vibrate(BUZZ.goal)!==false}catch(e){return false}}}}
