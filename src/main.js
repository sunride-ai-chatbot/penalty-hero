import {VERSION} from './version.js';
import {createAudio} from './audio/audio.js';
import {startApp} from './ui/app.js';
import {createHaptics} from './core/settings.js';
const haptics=createHaptics();
const audio=createAudio({base:new URL('../assets/audio/',import.meta.url),haptics});
const app=startApp(document.getElementById('app'),{audio,haptics});
window.addEventListener('error',e=>console.error('Penalty Hero',e.message));
window.addEventListener('unhandledrejection',e=>{if(e.reason&&e.reason.name==='AbortError')e.preventDefault()});
/* keep the page itself still: no pull-to-refresh or pinch behind the game (text fields keep their own gestures) */
document.addEventListener('gesturestart',e=>e.preventDefault());
/* Installed as an app: the service worker keeps one version of code and media together and takes updates when the
   page is next opened. It is skipped on localhost so development never sees a stale file. */
if('serviceWorker' in navigator&&!/^(localhost|127\.|\[::1\])/.test(location.hostname)&&location.protocol==='https:'){
  navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope:new URL('../',import.meta.url).pathname}).then(reg=>{
    reg.addEventListener('updatefound',()=>{const w=reg.installing;w&&w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller){
      const t=document.createElement('button');t.className='toast update';t.textContent='גרסה חדשה מוכנה · הקש לעדכון';t.onclick=()=>location.reload();document.body.append(t)}})})}).catch(()=>{})}
export {app,VERSION};
