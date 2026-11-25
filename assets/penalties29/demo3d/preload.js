import * as T from './vendor/three.js';
// The pictures the first kick needs, fetched and decoded while the player is still choosing a club. They are kept in
// three.js's own image cache, so the stadium finds them there — whatever the host's HTTP caching does — and a second
// duel opens at once. The addresses are built exactly as the scene builds them, or the cache would miss.
T.Cache.enabled=true;
const here=p=>new URL(p,import.meta.url).href;
export const FIRST_KICK=['../motions/highL-native-0.webp','../motions/highL-native-1.webp','../turf/grass02.jpg','../../stand-crowd.webp','../video/kahal-poster.jpg'].map(here);
export const AFTER_KICK=['../taker/goal.webp','../taker/miss.webp'].map(here);
let started=null;
/** Resolves when the first-kick pictures are in (or failed: the scene then loads and reports them itself). */
export function preloadStadium(){if(started)return started;const one=url=>new Promise(res=>new T.ImageLoader().load(url,()=>res(true),undefined,()=>{T.Cache.remove(url);res(false)}));
  started=Promise.all(FIRST_KICK.map(one)).then(r=>{AFTER_KICK.forEach(one);return r.every(Boolean)});return started}
