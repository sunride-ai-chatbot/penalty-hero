// The settings screen: what is heard, the buzz in the hand, how much the picture asks of the phone. Kept on this phone.
import {VOLUMES,QUALITIES,parseSettings,levelName} from '../core/settings.js';
import {esc} from './crest.js';
export function settingsFeature({S,show,top,store,intro,audio,haptics,toast}){
  S.set=parseSettings(store.get('settings'));S.qAuto=Math.max(0,Math.min(2,Math.floor(+store.get('qAuto','0'))||0));
  const apply=()=>{audio.configure(S.set);haptics?.configure?.(S.set)};apply();
  const save=()=>{store.set('settings',JSON.stringify(S.set));apply()};
  const sw=(key,title,sub,preview)=>`<div class="setrow"><div><strong>${title}</strong><small>${sub}</small></div>${preview?`<button type="button" class="link" data-try="${preview}">נסה</button>`:''}<button type="button" class="sw" role="switch" data-key="${key}" aria-checked="${!!S.set[key]}" aria-label="${esc(title)}"></button></div>`;
  function screen(){const auto=S.qAuto>0,sup=haptics?.supported;
    show('settings',top('הגדרות',true)+`<main class="body">
      <div class="card setgroup"><h2>קול</h2><div class="seg" role="group" aria-label="עוצמה">${VOLUMES.map(v=>`<button type="button" class="chip${S.set.vol===v.v?' on':''}" data-vol="${v.v}" aria-pressed="${S.set.vol===v.v}">${v.name}</button>`).join('')}</div>
        ${sw('voice','קריין','מדבר בגול, בהצלה, בכדור מעל הקורה ובסיום','voice')}${sw('sfx','אפקטים','שריקה, בעיטה, רשת, קורה וכפפות','sfx')}${sw('crowd','קהל ואווירה','היציע ברקע ושאגת הקהל','crowd')}</div>
      <div class="card setgroup"><h2>רטט</h2>${sw('haptics','רטט בגול ובהצלה',sup?'הטלפון רוטט בגול, בהצלה, בקורה ובניצחון':'הדפדפן הזה לא תומך ברטט (באייפון זה לא עובד)')}</div>
      <div class="card setgroup"><h2>גרפיקה</h2><div class="seg" role="group" aria-label="איכות גרפיקה">${QUALITIES.map(q=>`<button type="button" class="chip${S.set.quality===q.id?' on':''}" data-q="${q.id}" aria-pressed="${S.set.quality===q.id}">${q.name}</button>`).join('')}</div>
        <p class="note">${S.set.quality==='auto'?`אוטומטי: אם המשחק מקרטע, האיכות יורדת לבד ונשמרת לפעם הבאה. עכשיו: <strong>${levelName(S.qAuto)}</strong>${auto?' <button type="button" class="link" id="qreset">אפס</button>':''}`:S.set.quality==='high'?'גבוהה: תמיד באיכות מלאה, גם אם הטלפון מתקשה.':'חסכונית: בלי צללים ובמסך פחות חד. מתאימה לטלפון ישן.'}</p></div></main>`,el=>{
      el.querySelector('[data-back]').onclick=intro;
      for(const b of el.querySelectorAll('[data-vol]'))b.onclick=()=>{S.set.vol=+b.dataset.vol;save();audio.unlock();audio.preview('sfx');screen()};
      for(const b of el.querySelectorAll('[data-q]'))b.onclick=()=>{S.set.quality=b.dataset.q;save();screen()};
      for(const b of el.querySelectorAll('.sw'))b.onclick=()=>{const k=b.dataset.key;S.set[k]=!S.set[k];save();audio.unlock();if(S.set[k]){if(k==='haptics'){if(!haptics?.preview())toast('הדפדפן הזה לא תומך ברטט')}else audio.preview(k)}screen()};
      for(const b of el.querySelectorAll('[data-try]'))b.onclick=()=>{audio.unlock();if(S.set[b.dataset.try]===false)toast('הקול הזה כבוי');else audio.preview(b.dataset.try)};
      el.querySelector('#qreset')?.addEventListener('click',()=>{S.qAuto=0;store.set('qAuto','0');screen()})})}
  return {screen}}
